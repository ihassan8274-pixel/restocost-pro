import crypto from 'node:crypto';
import { learnItemAlias, learnBranchAlias, lastPurchaseUnitCost } from './intake.mjs';

const TRF_YEAR_PREFIX = () => `TRF-${new Date().getFullYear()}-`;

const generateTransferNumbers = (store, count) => {
  const existing = Array.isArray(store.getKV('rcerp_stock_transfers')) ? store.getKV('rcerp_stock_transfers') : [];
  const prefix = TRF_YEAR_PREFIX();
  let max = 0;
  for (const t of existing) {
    if (t.transferNumber && t.transferNumber.startsWith(prefix)) {
      const n = parseInt(t.transferNumber.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${String(max + i + 1).padStart(3, '0')}`);
};

/**
 * حساب نسبة التطابق للمسودة: exact/alias = 100%، fuzzy = 70%، none = 0%
 * @returns {{ score: number, itemConf: string, fromConf: string, targetConfs: string[], hasUnknown: boolean, hasWarnings: boolean }}
 */
export const analyzeMatchQuality = (draft) => {
  const confScore = (c) => (c === 'exact' || c === 'alias' ? 100 : c === 'fuzzy' ? 70 : 0);
  const itemConf = draft.matchInfo?.item?.confidence || 'none';
  const fromConf = draft.matchInfo?.from?.confidence || 'none';
  const targetConfs = (draft.rows || []).map((r) => r._match?.confidence || 'none');
  const hasUnknown = (draft.unknownTargets || []).length > 0;
  const hasWarnings = (draft.warnings || []).length > 0;

  const allConfs = [itemConf, fromConf, ...targetConfs];
  const minConf = Math.min(...allConfs.map(confScore));
  let score = minConf;
  if (hasUnknown || hasWarnings) score = Math.min(score, 60);

  return { score, itemConf, fromConf, targetConfs, hasUnknown, hasWarnings };
};

/**
 * حساب النتيجة: هل التطابق 100% (لا يحتاج مراجعة)?
 */
export const isFullyMatched = (quality) => quality.score === 100;

/**
 * رفع توزيعة تلقائياً: إنشاء التوزيعة (معتمدة) + تحويلات مخزنية مسودّة
 * @returns {{ distId: string, transferNumbers: string[] }}
 */
export const autoRaiseDistribution = (store, draft, rawText = '') => {
  const distId = `dist-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const validRows = (draft.rows || []).filter((r) => r.toBranchId);

  const existingDists = Array.isArray(store.getKV('rcerp_distributions')) ? store.getKV('rcerp_distributions') : [];
  const distribution = {
    ...draft,
    id: distId,
    status: 'approved',
    convertedAt: now,
    createdAt: now,
    source: draft.source || 'telegram',
    rawText: rawText || draft.rawText || '',
    autoRaised: true,
  };
  store.setKV('rcerp_distributions', [distribution, ...existingDists]);

  const trfPrefix = TRF_YEAR_PREFIX();
  const existingTransfers = Array.isArray(store.getKV('rcerp_stock_transfers')) ? store.getKV('rcerp_stock_transfers') : [];
  const transferNumbers = generateTransferNumbers(store, validRows.length);
  const newTransfers = validRows.map((row, i) => ({
    id: `trf-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    transferNumber: transferNumbers[i],
    fromBranchId: draft.fromBranchId,
    toBranchId: row.toBranchId,
    date: draft.date || new Date().toISOString().slice(0, 10),
    status: 'draft',
    items: [{
      itemType: 'raw_material',
      rawMaterialId: draft.rawMaterialId,
      itemName: draft.itemName,
      quantity: row.inventoryQty ?? row.qty,
      unit: row.unit || '',
      unitCost: row.unitCost || 0,
      purchaseUnit: row.purchaseUnit || undefined,
      purchaseUnitQty: row.inventoryQty ? row.qty : undefined,
    }],
    requestedBy: 'بوت تليجرام (تلقائي)',
  }));
  store.setKV('rcerp_stock_transfers', [...newTransfers, ...existingTransfers]);

  store.writeAudit('telegram-bot', 'رفع تلقائي (100% مطابقة)', distId, `${draft.itemName || '؟'} من ${draft.fromBranchName || '؟'} — ${validRows.length} تحويلات: ${transferNumbers.join('، ')}`);

  return { distId, transferNumbers };
};

/**
 * إدخال مسودة في صندوق التحقق (عند عدم التطابق الكامل)
 */
export const addToInbox = (store, draft, rawText, chatId, senderName) => {
  const quality = analyzeMatchQuality(draft);
  const inboxId = `inb-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const entry = {
    id: inboxId,
    rawText: rawText || '',
    chatId: chatId || null,
    senderName: senderName || '',
    receivedAt: new Date().toISOString(),
    draft,
    quality,
    status: 'pending',
    raisedAt: null,
    raisedDistId: null,
  };
  const existing = Array.isArray(store.getKV('rcerp_intake_inbox')) ? store.getKV('rcerp_intake_inbox') : [];
  store.setKV('rcerp_intake_inbox', [entry, ...existing]);
  store.writeAudit('telegram-bot', 'إدخال صندوق التحقق', inboxId, `${draft.itemName || '؟'} من ${draft.fromBranchName || '؟'} — نسبة: ${quality.score}%`);
  return { inboxId, quality };
};

const fold = (s) => String(s || '').replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ـ/g, '').trim().toLowerCase();
const nameDistance = (a, b) => {
  if (!a || !b) return 99;
  const A = fold(a), B = fold(b);
  const la = A.length, lb = B.length;
  const m = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) m[i][0] = i;
  for (let j = 0; j <= lb; j++) m[0][j] = j;
  for (let i = 1; i <= la; i++) for (let j = 1; j <= lb; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  let d = m[la][lb];
  if (A.includes(B) || B.includes(A)) d = Math.min(d, Math.abs(la - lb));
  return d;
};

/**
 * تعلّم مرادفات آمن: يُسجَّل «مصدر المطابقة» كمرادف للعنصر المتطابق فقط عندما
 * يكون الاسم المُرسل قريباً نسيجياً (≤2) من الاسم المسجّل — لأن القرب النسيجي
 * دلالة تطابق أكيدة، وهذا يمنع تسجيل أخطاء الشبح مثل الجبيل→زنجبيل (بُعد 5).
 */
const learnFromDraft = (store, draft) => {
  const before = {
    items: (store.getKV('rcerp_intake_aliases')?.items || []).length,
    branches: (store.getKV('rcerp_intake_aliases')?.branches || []).length,
  };
  try {
    const item = draft.matchInfo?.item;
    if (item?.confidence === 'fuzzy' && item.matchedId && item.source) {
      const m = (store.getKV('rcerp_raw_materials') || []).find((x) => x.id === item.matchedId);
      if (m && nameDistance(item.source, m.nameAr) <= 2) learnItemAlias(store, item.source, item.matchedId);
    }
    const from = draft.matchInfo?.from;
    if (from?.confidence === 'fuzzy' && from.matchedId && from.source) {
      const b = (store.getKV('rcerp_branches') || []).find((x) => x.id === from.matchedId);
      if (b && nameDistance(from.source, b.nameAr) <= 2) learnBranchAlias(store, from.source, from.matchedId);
    }
    (draft.rows || []).forEach((r) => {
      const t = r._match;
      if (t?.confidence === 'fuzzy' && t?.matchedId && t?.source) {
        const b = (store.getKV('rcerp_branches') || []).find((x) => x.id === t.matchedId);
        if (b && nameDistance(t.source, b.nameAr) <= 2) learnBranchAlias(store, t.source, t.matchedId);
      }
    });
  } catch { /* لا يمنع الرفع */ }
  const after = {
    items: (store.getKV('rcerp_intake_aliases')?.items || []).length,
    branches: (store.getKV('rcerp_intake_aliases')?.branches || []).length,
  };
  return { learned: after.items - before.items + after.branches - before.branches };
};

/**
 * ربط يدوي ثم رفع: يسمح للمراجع بإصلاح التطابقات الناقصة (صنف/مصدر/هدف)
 * من الصندوق، ثم يُرفع التوزيعة. عند الربط اليدوي يُسجَّل المرادف دائمًا
 * (لأنه تأكيد بشري صريح للمطابقة).
 * body: { itemId?, fromId?, targets?: [{ index, toBranchId }] }
 */
export const bindAndRaiseFromInbox = (store, inboxId, body = {}) => {
  const inbox = Array.isArray(store.getKV('rcerp_intake_inbox')) ? store.getKV('rcerp_intake_inbox') : [];
  const idx = inbox.findIndex((e) => e.id === inboxId);
  if (idx === -1) return { ok: false, error: 'غير موجود' };
  if (inbox[idx].status !== 'pending') return { ok: false, error: `الحالة الحالية: ${inbox[idx].status}` };

  const entry = inbox[idx];
  const d = entry.draft;
  const raw = store.getKV('rcerp_raw_materials') || [];
  const branches = store.getKV('rcerp_branches') || [];
  const mName = (id) => raw.find((x) => x.id === id);
  const bName = (id) => branches.find((x) => x.id === id);
  let learned = 0;

  if (body.itemId) {
    const m = mName(body.itemId);
    if (!m) return { ok: false, error: 'الصنف المحدد غير موجود' };
    const src = d.matchInfo?.item?.source || d.itemName || '؟';
    d.rawMaterialId = m.id;
    d.itemName = m.nameAr;
    d.unit = m.unit || d.unit || 'حبة';
    d.purchaseUnit = (m.purchaseUnit && m.purchaseUnit.trim()) ? m.purchaseUnit : (d.purchaseUnit || m.unit || 'كرتون');
    d.conversion = (m.purchaseUnitConversion && m.purchaseUnitConversion > 0) ? m.purchaseUnitConversion : (d.conversion || 1);
    d.unitCost = lastPurchaseUnitCost(store, d.fromBranchId, m.id, m.standardCost || 0);
    d.rows.forEach((r) => {
      r.unit = d.unit;
      r.purchaseUnit = d.purchaseUnit;
      r.conversion = d.conversion;
      r.unitCost = d.unitCost;
      r.inventoryQty = (r.qty || 0) * (d.conversion || 1);
    });
    d.matchInfo.item = { confidence: 'exact', source: src, matchedId: m.id, matchedName: m.nameAr, candidates: [] };
    try { learnItemAlias(store, src, m.id); learned++; } catch {}
  }
  if (body.fromId) {
    const b = bName(body.fromId);
    if (!b) return { ok: false, error: 'الفرع المصدر المحدد غير موجود' };
    const src = d.matchInfo?.from?.source || d.fromBranchName || '؟';
    d.fromBranchId = b.id;
    d.fromBranchName = b.nameAr;
    d.matchInfo.from = { confidence: 'exact', source: src, matchedId: b.id, matchedName: b.nameAr, candidates: [] };
    try { learnBranchAlias(store, src, b.id); learned++; } catch {}
  }
  if (Array.isArray(body.targets)) {
    for (const t of body.targets) {
      const i = t?.index;
      const row = d.rows?.[i];
      if (!row || !t.toBranchId) continue;
      const b = bName(t.toBranchId);
      if (!b) continue;
      const src = row._match?.source || row.toBranchName || '؟';
      row.toBranchId = b.id;
      row.toBranchName = b.nameAr;
      row._match = { confidence: 'exact', source: src, matchedId: b.id, matchedName: b.nameAr, candidates: [] };
      try { learnBranchAlias(store, src, b.id); learned++; } catch {}
    }
  }

  entry.draft = d;
  store.setKV('rcerp_intake_inbox', inbox);

  const res = raiseFromInbox(store, inboxId);
  if (!res.ok) return res;
  return { ok: true, distId: res.distId, transferNumbers: res.transferNumbers, learned };
};

/**
 * رفع مسودة من الصندوق يدوياً
 */
export const raiseFromInbox = (store, inboxId) => {
  const inbox = Array.isArray(store.getKV('rcerp_intake_inbox')) ? store.getKV('rcerp_intake_inbox') : [];
  const idx = inbox.findIndex((e) => e.id === inboxId);
  if (idx === -1) return { ok: false, error: 'غير موجود' };
  if (inbox[idx].status !== 'pending') return { ok: false, error: `الحالة الحالية: ${inbox[idx].status}` };

  const entry = inbox[idx];
  const { distId, transferNumbers } = autoRaiseDistribution(store, entry.draft, entry.rawText);
  const { learned } = learnFromDraft(store, entry.draft);

  entry.status = 'raised';
  entry.raisedAt = new Date().toISOString();
  entry.raisedDistId = distId;
  store.setKV('rcerp_intake_inbox', inbox);

  store.writeAudit('telegram-bot', 'رفع يدوي من صندوق التحقق', inboxId, `→ ${distId} (${transferNumbers.join('، ')})${learned ? ` + ${learned} مرادف جديد` : ''}`);

  return { ok: true, distId, transferNumbers, learned };
};

/**
 * رفض مسودة من الصندوق
 */
export const rejectFromInbox = (store, inboxId, reason = '') => {
  const inbox = Array.isArray(store.getKV('rcerp_intake_inbox')) ? store.getKV('rcerp_intake_inbox') : [];
  const idx = inbox.findIndex((e) => e.id === inboxId);
  if (idx === -1) return { ok: false, error: 'غير موجود' };
  if (inbox[idx].status !== 'pending') return { ok: false, error: `الحالة الحالية: ${inbox[idx].status}` };

  inbox[idx].status = 'rejected';
  inbox[idx].rejectedAt = new Date().toISOString();
  inbox[idx].rejectReason = reason;
  store.setKV('rcerp_intake_inbox', inbox);
  store.writeAudit('telegram-bot', 'رفض من صندوق التحقق', inboxId, reason);

  return { ok: true };
};

/**
 * رفع جميع الرسائل المعلقة ذات التطابق 100%
 */
export const raiseAllFullyMatched = (store) => {
  const inbox = Array.isArray(store.getKV('rcerp_intake_inbox')) ? store.getKV('rcerp_intake_inbox') : [];
  const results = [];
  for (const entry of inbox) {
    if (entry.status !== 'pending') continue;
    if (!isFullyMatched(entry.quality)) continue;
    const res = raiseFromInbox(store, entry.id);
    results.push({ id: entry.id, ...res });
  }
  return results;
};
