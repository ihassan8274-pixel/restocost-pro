/**
 * server/intake-flow.mjs — اجتماع تفاعلي (أزرار Inline) لإنشاء توزيع مخزون
 * من التليجرام دون كتابة أسماء الأصناف/الفروع (منع التضارب تمامًا).
 *
 * يختار المستخدم الفرع المصدر والصنف والفروع المستهدفة بأزرار، ويكتب الكميات
 * أرقامًا فقط. النتيجة تُرفع تلقائيًا (مطابقة 100% بالتعريف): توزيعة معتمدة في
 * rcerp_distributions + تحويلات مخزنية مسودة في rcerp_stock_transfers، بنفس
 * شكل الرفع التلقائي في intake-inbox.mjs للرسائل النصية المطابقة بالكامل.
 *
 * الحالة تُحفظ في KV بمفتاح rcerp_tg_flow:<chatId> فتنجو من إعادة التشغيل.
 * الدوال هنا نقية (لا fetch) — bot-poll.mjs ينفّذ الإرسال/التعديل الفعلي.
 */
import { lastPurchaseUnitCost } from './intake.mjs';
import { autoRaiseDistribution } from './intake-inbox.mjs';

const STEP_SRC = 'src';
const STEP_ITEM = 'item';
const STEP_TGT = 'tgt';
const STEP_TGTQTY = 'tgtqty';
const STEP_REVIEW = 'review';

const PAGE_BRANCH = 8;
const PAGE_ITEM = 12;
const FLOW_TTL_MS = 2 * 3600 * 1000;

export const flowKey = (chatId) => `rcerp_tg_flow:${chatId}`;

export const isFlowCommand = (text) => /^\s*\/توزيع\b/.test(text) || /^\s*توزيع\s*$/.test(text);
export const isFlowCancel = (text) => /^\s*\/إلغاء\b/.test(text) || /^\s*إلغاء\s*$/.test(text);

const normDigits = (s) =>
  String(s || '')
    .replace(/[\u0660-\u0669]/g, (c) => c.charCodeAt(0) - 0x0660)
    .replace(/[\u06F0-\u06F9]/g, (c) => c.charCodeAt(0) - 0x06f0);

const parseQty = (s) => {
  const n = normDigits(String(s || '')).replace(/[^\d.]/g, '');
  if (!n || n === '.') return null;
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
};

const round3 = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;

const fold = (s) =>
  String(s || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ar = (n) => Number(n || 0).toLocaleString('ar-EG');

const newSession = (chatId) => ({ chatId, startedAt: new Date().toISOString(), step: STEP_SRC, srcPage: 1, itemPage: 1, tgtPage: 1, search: null, fromBranchId: null, fromBranchName: null, rawMaterialId: null, itemName: null, unit: null, purchaseUnit: null, conversion: 1, targets: [], pendingTgt: null });

const getSession = (store, chatId) => store.getKV(flowKey(chatId)) || null;

const saveSession = (store, s) => store.setKV(flowKey(s.chatId), s);

const deleteSession = (store, chatId) => store.deleteKV(flowKey(chatId));

const purgeStale = (store) => {
  try {
    for (const row of (store.kvEntriesByPrefix ? store.kvEntriesByPrefix('rcerp_tg_flow:') : [])) {
      try {
        const v = JSON.parse(row.value);
        if (v && v.startedAt && Date.now() - new Date(v.startedAt).getTime() > FLOW_TTL_MS) store.deleteKV(row.key);
      } catch { /* ignore corrupt rows */ }
    }
  } catch { /* tolerate */ }
};

const getBranches = (store) => (store.getKV('rcerp_branches') || []).filter((b) => b && b.id && b.nameAr);
const getMaterials = (store) => (store.getKV('rcerp_raw_materials') || []).filter((m) => m && m.id && m.nameAr);

/* ---------------- أزرار ---------------- */

const cancelBtn = [{ text: '❌ إلغاء', callback_data: 'tf:cancel' }];
const backBtn = [{ text: '🔙 رجوع', callback_data: 'tf:back' }];

const navRows = (list, page, pages) => {
  if (pages <= 1) return [];
  const row = [];
  if (page > 1) row.push({ text: `◀️ ${page - 1}`, callback_data: `tf:page:${list}:${page - 1}` });
  if (page < pages) row.push({ text: `${page + 1} ▶️`, callback_data: `tf:page:${list}:${page + 1}` });
  return row.length ? [row] : [];
};

/* ---------------- شاشات ---------------- */

const renderSource = (store, s) => {
  const branches = getBranches(store).sort((a, b) => a.nameAr.localeCompare(b.nameAr));
  const pages = Math.max(1, Math.ceil(branches.length / PAGE_BRANCH));
  const page = Math.min(Math.max(1, s.srcPage), pages);
  const slice = branches.slice((page - 1) * PAGE_BRANCH, page * PAGE_BRANCH);
  const rows = slice.map((b) => [{ text: b.nameAr, callback_data: `tf:src:${b.id}` }]);
  rows.push(...navRows('src', page, pages));
  rows.push(cancelBtn);
  s.srcPage = page;
  return {
    text: `🧾 <b>توزيع مخزون — اختيار تفاعلي</b>\n\n🏪 اختَر <b>الفرع المصدر</b> (من):`,
    buttons: rows,
  };
};

const renderItem = (store, s, only = null) => {
  let mats = getMaterials(store);
  if (only) {
    const q = fold(only);
    mats = mats.filter((m) => fold(m.nameAr).includes(q) || q.includes(fold(m.nameAr)));
  }
  mats.sort((a, b) => a.nameAr.localeCompare(b.nameAr));
  const pages = Math.max(1, Math.ceil(mats.length / PAGE_ITEM));
  const page = Math.min(Math.max(1, s.itemPage), pages);
  const slice = mats.slice((page - 1) * PAGE_ITEM, page * PAGE_ITEM);
  const rows = slice.map((m) => [
    { text: `${m.nameAr}${m.purchaseUnit && m.purchaseUnit.trim() && m.purchaseUnit !== m.unit ? ` (${m.purchaseUnit.trim()})` : ''}`.slice(0, 34), callback_data: `tf:item:${m.id}` },
  ]);
  rows.push(...navRows('item', page, pages));
  rows.push([...backBtn, ...cancelBtn]);
  s.itemPage = page;
  const head = only
    ? `🔎 نتائج البحث «${esc(only)}» (${mats.length})`
    : '🗂 الصنف';
  return {
    text: `🏪 المصدر: <b>${esc(s.fromBranchName)}</b> ✅\n\n${head} — اختَر صنفًا باللمس، أو اكتب كلمة للبحث:\n<i>(ثمة ${mats.length} صنفًا)</i>`,
    buttons: rows,
  };
};

const renderTgtQty = (store, s) => ({
  text: `🏪 المصدر: <b>${esc(s.fromBranchName)}</b>\n📦 الصنف: <b>${esc(s.itemName)}</b> (١ ${esc(s.purchaseUnit)} = ${ar(s.conversion)} ${esc(s.unit)})\n\n✍️ كمية فرع <b>${esc(s.pendingTgt ? s.pendingTgt.name : '')}</b> (${esc(s.purchaseUnit)}) — <b>اكتب الرقم</b>:`,
  buttons: [[...backBtn, ...cancelBtn]],
});

const renderTargets = (store, s) => {
  const branches = getBranches(store)
    .filter((b) => b.id !== s.fromBranchId)
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr));
  const pages = Math.max(1, Math.ceil(branches.length / PAGE_BRANCH));
  const page = Math.min(Math.max(1, s.tgtPage), pages);
  const slice = branches.slice((page - 1) * PAGE_BRANCH, page * PAGE_BRANCH);
  const rows = slice.map((b) => [{ text: b.nameAr, callback_data: `tf:tgt:${b.id}` }]);
  rows.push(...navRows('tgt', page, pages));
  rows.push([{ text: '✔️ أنهيت الأهداف', callback_data: 'tf:done' }]);
  rows.push([...backBtn, ...cancelBtn]);
  s.tgtPage = page;
  const list = s.targets.map((t) => `• ${esc(t.name)}: <b>${ar(t.qty)}</b>`).join('\n') || '— لا يوجد بعد —';
  return {
    text: `🏪 المصدر: <b>${esc(s.fromBranchName)}</b>\n📦 الصنف: <b>${esc(s.itemName)}</b>\n\n🎯 الأهداف المختارة:\n${list}\n\n➕ اختَر فرعًا ثم اكتب كميته (${esc(s.purchaseUnit)}):`,
    buttons: rows,
  };
};

const buildDistribution = (store, s) => {
  const branch = getBranches(store).find((b) => b.id === s.fromBranchId);
  const mat = getMaterials(store).find((m) => m.id === s.rawMaterialId);
  const unitCost = lastPurchaseUnitCost(store, s.fromBranchId, s.rawMaterialId, mat ? mat.standardPrice || 0 : 0);
  const rows = s.targets.map((t) => ({
    toBranchId: t.id,
    toBranchName: t.name,
    qty: t.qty,
    purchaseUnit: s.purchaseUnit,
    conversion: s.conversion,
    unit: s.unit,
    inventoryQty: round3(t.qty * s.conversion),
    unitCost,
    _match: { confidence: 'exact' },
  }));
  const total = rows.reduce((a, r) => a + (r.qty || 0), 0);
  const inventoryTotal = rows.reduce((a, r) => a + (r.inventoryQty || 0), 0);
  return {
    fromBranchId: s.fromBranchId,
    fromBranchName: branch ? branch.nameAr : s.fromBranchName,
    itemName: mat ? mat.nameAr : s.itemName,
    rawMaterialId: s.rawMaterialId,
    unit: s.unit,
    purchaseUnit: s.purchaseUnit,
    conversion: s.conversion,
    unitCost,
    rows,
    unknownTargets: [],
    parsedTotal: total,
    total,
    inventoryTotal,
    date: null,
    status: 'pending',
    source: 'telegram:flow',
    rawText: `[توزيع تفاعلي] من ${branch ? branch.nameAr : s.fromBranchName} | ${mat ? mat.nameAr : s.itemName} | ${rows.map((r) => `${r.toBranchName}:${r.qty}`).join(', ')}`,
    matchInfo: {
      item: { confidence: 'exact', source: mat ? mat.nameAr : s.itemName, matchedId: s.rawMaterialId, matchedName: mat ? mat.nameAr : s.itemName, candidates: [] },
      from: { confidence: 'exact', source: branch ? branch.nameAr : s.fromBranchName, matchedId: s.fromBranchId, matchedName: branch ? branch.nameAr : s.fromBranchName, candidates: [] },
    },
    warnings: [],
    notes: ['أُنشئ تفاعليًا بالتماس التليجرام'],
  };
};

const commitDistribution = (store, s) => {
  const draft = buildDistribution(store, s);
  const { distId, transferNumbers } = autoRaiseDistribution(store, draft, draft.rawText);
  store.writeAudit('telegram-bot', 'توزيع مخزون (تفاعلي، رفع تلقائي)', distId, `${draft.itemName} من ${draft.fromBranchName} (${draft.rows.length} هدف) — تحويلات: ${transferNumbers.join('، ')}`);
  return distId;
};

const renderReview = (store, s) => {
  const draft = buildDistribution(store, s);
  const sum = draft.rows.reduce((a, r) => a + (r.qty || 0), 0);
  const lines = [
    `🧾 <b>مراجعة التوزيع</b>`,
    `🏪 من: <b>${esc(draft.fromBranchName)}</b>`,
    `📦 الصنف: <b>${esc(draft.itemName)}</b> (١ ${esc(draft.purchaseUnit)} = ${ar(draft.conversion)} ${esc(draft.unit)})`,
    `💰 السعر: ${ar(draft.unitCost)}/${esc(draft.unit)} = ${ar(Math.round(draft.unitCost * draft.conversion * 100) / 100)}/${esc(draft.purchaseUnit)}`,
    ``,
    `🎯 الأهداف:`,
    ...draft.rows.map((r) => `• ${esc(r.toBranchName)}: <b>${ar(r.qty)}</b> ${esc(draft.purchaseUnit)} (${ar(r.inventoryQty)} ${esc(draft.unit)})`),
    ``,
    `الإجمالي: <b>${ar(sum)}</b> ${esc(draft.purchaseUnit)} / <b>${ar(draft.inventoryTotal)}</b> ${esc(draft.unit)}`,
  ];
  return {
    text: lines.join('\n'),
    buttons: [
      [{ text: '✔️ اعتماد', callback_data: 'tf:commit' }],
      [{ text: '🔁 من جديد', callback_data: 'tf:restart' }],
      cancelBtn[0] ? cancelBtn : [{ text: '❌ إلغاء', callback_data: 'tf:cancel' }],
    ],
  };
};

/* ---------------- المدخلات العامة ---------------- */

export const startFlow = (store, chatId) => {
  purgeStale(store);
  if (getSession(store, chatId)) {
    return { kind: 'error', text: 'لديك توزيع قيد الإنشاء — أكمله باللمس من رسالته، أو أرسل /إلغاء' };
  }
  const s = newSession(chatId);
  const v = renderSource(store, s);
  saveSession(store, s);
  return { kind: 'send', text: v.text, buttons: v.buttons };
};

export const flowText = (store, chatId, rawText) => {
  const s = getSession(store, chatId);
  if (!s) return { kind: 'none' };

  const text = String(rawText || '').trim();
  if (isFlowCancel(text)) {
    deleteSession(store, chatId);
    return { kind: 'cancel', text: 'تم إلغاء التوزيع التفاعلي. ارسل /توزيع للبدء من جديد.' };
  }

  if (s.step === STEP_ITEM) {
    if (!text) return { kind: 'none' };
    s.search = text.slice(0, 40);
    const v = renderItem(store, s, s.search);
    saveSession(store, s);
    return { kind: 'edit', text: v.text, buttons: v.buttons };
  }

  if (s.step === STEP_TGTQTY) {
    const qty = parseQty(text);
    if (qty == null) {
      return { kind: 'edit', text: `⛔ اكتب رقمًا صحيحًا أكبر من 0 (بال${esc(s.purchaseUnit)}):`, buttons: [[...backBtn, ...cancelBtn]] };
    }
    const t = s.pendingTgt;
    if (t) s.targets = [...s.targets.filter((x) => x.id !== t.id), { id: t.id, name: t.name, qty }];
    s.pendingTgt = null;
    s.step = STEP_TGT;
    const v = renderTargets(store, s);
    saveSession(store, s);
    return { kind: 'edit', text: v.text, buttons: v.buttons };
  }

  return { kind: 'none' };
};

export const flowButton = (store, chatId, data) => {
  const s = getSession(store, chatId);
  if (!s) return { kind: 'none' };
  const parts = String(data || '').split(':');
  const arg1 = parts[1];
  const arg2 = parts[2];
  const arg3 = parts[3];

  switch (arg1) {
    case 'page': {
      const list = arg2 || 'src';
      const n = Math.max(1, parseInt(arg3 || '1', 10) || 1);
      if (list === 'src') s.srcPage = n;
      else if (list === 'item') s.itemPage = n;
      else if (list === 'tgt') s.tgtPage = n;
      const v = list === 'src' ? renderSource(store, s) : list === 'item' ? renderItem(store, s, s.search) : renderTargets(store, s);
      saveSession(store, s);
      return { kind: 'edit', text: v.text, buttons: v.buttons };
    }
    case 'src': {
      const id = arg2;
      const b = getBranches(store).find((x) => x.id === id);
      if (!b) return { kind: 'edit', text: 'الفرع غير موجود — اختر من جديد.', buttons: [[{ text: '🔁 من جديد', callback_data: 'tf:restart' }, ...cancelBtn]] };
      s.fromBranchId = id;
      s.fromBranchName = b.nameAr;
      s.step = STEP_ITEM;
      s.itemPage = 1;
      s.search = null;
      const v = renderItem(store, s);
      saveSession(store, s);
      return { kind: 'edit', text: v.text, buttons: v.buttons };
    }
    case 'item': {
      const id = arg2;
      const m = getMaterials(store).find((x) => x.id === id);
      if (!m) return { kind: 'edit', text: 'الصنف غير موجود — اختر من جديد.', buttons: [[{ text: '🔁 من جديد', callback_data: 'tf:restart' }, ...cancelBtn]] };
      s.rawMaterialId = id;
      s.itemName = m.nameAr;
      s.unit = m.unit;
      s.purchaseUnit = m.purchaseUnit && m.purchaseUnit.trim() ? m.purchaseUnit : m.unit;
      s.conversion = m.purchaseUnitConversion && m.purchaseUnitConversion > 0 ? m.purchaseUnitConversion : 1;
      s.targets = [];
      s.pendingTgt = null;
      s.step = STEP_TGT;
      s.tgtPage = 1;
      const v = renderTargets(store, s);
      saveSession(store, s);
      return { kind: 'edit', text: v.text, buttons: v.buttons };
    }
    case 'tgt': {
      const id = arg2;
      const b = getBranches(store).find((x) => x.id === id);
      if (!b || b.id === s.fromBranchId) {
        s.step = STEP_TGT;
        const v = renderTargets(store, s);
        saveSession(store, s);
        return { kind: 'edit', text: v.text, buttons: v.buttons };
      }
      s.pendingTgt = { id: b.id, name: b.nameAr };
      s.step = STEP_TGTQTY;
      const v = renderTgtQty(store, s);
      saveSession(store, s);
      return { kind: 'edit', text: v.text, buttons: v.buttons };
    }
    case 'done': {
      if (!s.targets.length) {
        const v = renderTargets(store, s);
        saveSession(store, s);
        return { kind: 'edit', text: v.text + '\n\n⛔ لم تختر أي فرع بعد — اختر فرعًا ثم اكتب كميته.', buttons: v.buttons };
      }
      s.step = STEP_REVIEW;
      const v = renderReview(store, s);
      saveSession(store, s);
      return { kind: 'edit', text: v.text, buttons: v.buttons };
    }
    case 'commit': {
      const distId = commitDistribution(store, s);
      deleteSession(store, chatId);
      return { kind: 'commit', text: `✅ <b>تم الرفع تلقائياً</b> (مطابقة 100%)\nالتوزيع معتمد + تحويلات مخزنية مسودة 🧾\nالمرجع: <code>${distId}</code>` };
    }
    case 'cancel': {
      deleteSession(store, chatId);
      return { kind: 'cancel', text: 'تم إلغاء التوزيع التفاعلي. ارسل /توزيع للبدء من جديد.' };
    }
    case 'restart': {
      const ns = newSession(chatId);
      const v = renderSource(store, ns);
      saveSession(store, ns);
      return { kind: 'edit', text: v.text, buttons: v.buttons };
    }
    case 'back': {
      if (s.step === STEP_ITEM) { s.step = STEP_SRC; const v = renderSource(store, s); saveSession(store, s); return { kind: 'edit', text: v.text, buttons: v.buttons }; }
      if (s.step === STEP_TGT) { s.step = STEP_ITEM; s.search = null; s.itemPage = 1; const v = renderItem(store, s); saveSession(store, s); return { kind: 'edit', text: v.text, buttons: v.buttons }; }
      if (s.step === STEP_REVIEW) { s.step = STEP_TGT; const v = renderTargets(store, s); saveSession(store, s); return { kind: 'edit', text: v.text, buttons: v.buttons }; }
      if (s.step === STEP_TGTQTY) { s.pendingTgt = null; s.step = STEP_TGT; const v = renderTargets(store, s); saveSession(store, s); return { kind: 'edit', text: v.text, buttons: v.buttons }; }
      return { kind: 'none' };
    }
    default:
      return { kind: 'none' };
  }
};