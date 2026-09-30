/**
 * server/intake.mjs — محرك استقبال إيصالات المخزون (إذونات التحويل/التوزيع)
 * ----------------------------------------------------------------------
 * يقرأ نص رسائل واتساب/تليجرام غير المنتظمة (لصق جروبات، رسائل حديثة بألفاظ
 * عامية، أصناف متعددة، مصادر وأهداف متعددة، أسماء غير دقيقة) ويحوّلها إلى
 * "إذونات" (مسودات توزيع) منظمة. لا يُنشئ أي حركة مخزون فعلية — كل شيء يمر
 * عبر شاشة «توزيعات واردة للمراجعة».
 *
 * المراحل:
 *   1) تنظيف — إزالة ترويسات واتساب [التاريخ، الوقت] الاسم:، وتوحيد الأرقام.
 *   2) تقطيع — تقسيم النص إلى إذونات بحسب: تاريخ، سطر مصدر جديد، أو صنف جديد
 *      (يُكتشف عبر المرجعية ليميز "صنف" من "فرع/هدف").
 *   3) استخراج — لكل إذن: صنف، مصدر/مصادر، أهداف (فرع+كمية)، وحدة شراء، تاريخ.
 *   4) مطابقة بالمرجعية — دقيقة → قاموس مرادفات → تقريبية، مع قائمة مرشحين.
 *   5) مخرجات — مسودات بنفس شكل المسودة القديمة + مطابقة وتنبيهات للمراجعة.
 */

const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const FA_DIGITS = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
const MONTHS_AR = {
  يناير: '01', فبراير: '02', مارس: '03', أبريل: '04', مايو: '05', يونيو: '06', يوليو: '07',
  أغسطس: '08', سبتمبر: '09', أكتوبر: '10', نوفمبر: '11', ديسمبر: '12',
};
export { classifyLine, ACTION_VERBS, makeMatcher, resolveBlock };
const ALIAS_KV = 'rcerp_intake_aliases';
const BRAND_SUFFIXES = ['السعيدة', 'السعودية', 'الذهبية', 'القمرية', 'باستا', 'بركة', 'الحليب', 'الزبادي', 'الجبن', 'الزبدة', 'اللحم', 'الدجاج', 'السمك', 'الخضار', 'الفواكه', 'المعلبات', 'التوابل', 'البهارات', 'الزيوت', 'السكر', 'الملح', 'الدقيق', 'الأرز', 'المعكرونة', 'النشا', 'البيض', 'السميد', 'النخالة', 'البرجر', 'النقانق', 'الحلويات', 'المشروبات', 'العصائر', 'المياه', 'الثلج', 'الشوكولاتة', 'الكراميل', 'الفانيلا', 'الشاي', 'القهوة', 'النسكافيه', 'الكابتشينو', 'الموكا', 'الهوت شوكليت', 'السموذي', 'الآيس كريم', 'المربى', 'العسل'];
const stripBrand = (text) => {
  let q = String(text || '').trim();
  for (const b of BRAND_SUFFIXES) {
    const re = new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'gi');
    q = q.replace(re, ' ').trim();
  }
  return q;
};

const normalizeDigits = (s) => String(s)
  .replace(/[٠-٩]/g, (d) => AR_DIGITS[d])
  .replace(/[۰-۹]/g, (d) => FA_DIGITS[d]);
const stripDots = (s) => String(s).replace(/\.+/g, '').trim();

const cleanNorm = (s) => normalizeDigits(String(s || ''))
  .replace(/[\u064B-\u0652\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/ؤ/g, 'و')
  .replace(/ئ/g, 'ي')
  .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const fold = (s) => cleanNorm(s).toLowerCase();

const parseQty = (s) => {
  const n = normalizeDigits(s).replace(/[^\d.]/g, '');
  if (!n || n === '.') return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
};
const roundQty = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;

// متوسط التكلفة المرجّح المتحرك للفرع حتى الآن (افتتاحي + استلامات معتمدة +
// تحويلات واردة/صادرة) — يماثل src/business/costs.ts (movingWeightedAverage)
// كي يُقيَّم التحويل بسعر الشراء الفعلي للفرع المرسل بدل سعر بطاقة الصنف.
// القيمة الناتجة هي سعر وحدة المخزون؛ عند غياب أي حركة يعود للسعر القياسي (fallback).
const weightedAverageUnitCost = (store, branchId, materialId, fallback) => {
  try {
    const openings = Array.isArray(store.getKV('rcerp_opening_balances')) ? store.getKV('rcerp_opening_balances') : [];
    const grns = Array.isArray(store.getKV('rcerp_grn')) ? store.getKV('rcerp_grn') : [];
    const transfers = Array.isArray(store.getKV('rcerp_stock_transfers')) ? store.getKV('rcerp_stock_transfers') : [];
    const until = '9999-12-31';
    const sortedOpen = openings
      .filter((r) => r.branchId === branchId && String(r.date || '').slice(0, 10) <= until)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const lastOpening = sortedOpen[sortedOpen.length - 1];
    let balanceQty = 0, balanceValue = 0;
    const startDate = lastOpening ? String(lastOpening.date || '').slice(0, 10) : '';
    if (lastOpening) {
      (lastOpening.items || []).forEach((i) => {
        if (i.rawMaterialId === materialId) {
          balanceQty = i.quantity || 0;
          balanceValue = (i.quantity || 0) * (i.unitCost || 0);
        }
      });
    }
    const after = (d) => !startDate || String(d || '').slice(0, 10) >= startDate;
    const inWin = (d) => String(d || '').slice(0, 10) <= until;
    const move = [];
    grns
      .filter((g) => g.status === 'approved' && g.branchId === branchId && after(g.date) && inWin(g.date))
      .forEach((g) => (g.items || []).forEach((i) => {
        if (i.rawMaterialId === materialId) move.push({ date: String(g.date || '').slice(0, 10), ord: 0, qty: i.quantityReceived || 0, cost: i.unitPrice || 0 });
      }));
    transfers
      .filter((t) => t.status === 'approved' && inWin(t.date))
      .forEach((t) => (t.items || []).forEach((i) => {
        if (i.rawMaterialId !== materialId) return;
        if (t.fromBranchId === branchId) move.push({ date: String(t.date || '').slice(0, 10), ord: 1, qty: -(i.quantity || 0), cost: i.unitCost || 0 });
        if (t.toBranchId === branchId) move.push({ date: String(t.date || '').slice(0, 10), ord: 1, qty: i.quantity || 0, cost: i.unitCost || 0 });
      }));
    move.sort((a, b) => a.date.localeCompare(b.date) || a.ord - b.ord);
    for (const m of move) {
      if (m.qty > 0) {
        balanceValue += m.qty * m.cost;
        balanceQty += m.qty;
      } else if (balanceQty > 0) {
        const avg = balanceValue / balanceQty;
        balanceValue += m.qty * avg;
        balanceQty += m.qty;
      }
    }
    if (balanceQty > 0) return balanceValue / balanceQty;
  } catch { /* أي خطأ → السعر القياسي */ }
  return fallback;
};

// آخر سعر شراء فعلي للصنف في الفرع (أحدث استلام معتمد) بوحدة المخزون؛
// يعود للسعر القياسي فقط عند عدم وجود أي استلام شراء لهذا الصنف بالفرع.
const toIso = (d) => {
  const s = String(d || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
};
export const lastPurchaseUnitCost = (store, branchId, materialId, fallback) => {
  try {
    const grns = Array.isArray(store.getKV('rcerp_grn')) ? store.getKV('rcerp_grn') : [];
    grns
      .filter((g) => g.status === 'approved' && g.branchId === branchId)
      .sort((a, b) => toIso(b.date).localeCompare(toIso(a.date)));
    for (const g of grns) {
      const item = (g.items || []).find((i) => i.rawMaterialId === materialId && (+i.quantityReceived || 0) > 0 && (+i.unitPrice || 0) > 0);
      if (item) return +item.unitPrice;
    }
  } catch { /* أي خطأ → السعر القياسي */ }
  return fallback;
};

const levenshtein = (a, b) => {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const m = Array.from({ length: la + 1 }, () => new Array(lb + 1));
  for (let i = 0; i <= la; i++) m[i][0] = i;
  for (let j = 0; j <= lb; j++) m[0][j] = j;
  for (let i = 1; i <= la; i++) for (let j = 1; j <= lb; j++) {
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return m[la][lb];
};

const nameDistance = (a, b) => {
  if (!a || !b) return 99;
  const A = fold(a), B = fold(b);
  let d = levenshtein(A, B);
  if (A.includes(B) || B.includes(A)) d = Math.min(d, Math.abs(A.length - B.length));
  return d;
};

/* ───────────────────── تنظيف ───────────────────── */

export const cleanRawText = (text) => String(text || '')
    .split(/\r?\n/)
    .map((l) => stripSenderPrefix(stripDots(normalizeDigits(l))).trim())
    .filter((l) => l && !isMentionLine(l));

const stripSenderPrefix = (line) => {
  let t = line;
  const bracket = t.match(/^\[\d{1,2}[/.\-]\d{1,2}[^\]]*\]\s*(.*)$/);
  if (bracket) {
    t = bracket[1];
    const colon = t.match(/^[A-Za-z\u0600-\u06FF0-9@_. ]{1,60}?:\s*(.*)$/);
    if (colon) t = colon[1];
    return t.trim();
  }
  const colon = t.match(/^[\u0600-\u06FFA-Za-z0-9@_. ]{1,50}?:\s*(.+)$/);
  if (colon) return colon[1].trim();
  return t.trim();
};

const isMentionLine = (t) => /^@[\u0600-\u06FF\s]+$/.test(t) || /^@\d+$/.test(t);

/* ───────────────────── تقطيع ───────────────────── */

const parseDateLine = (t) => {
  const dm = t.match(/^(\d{1,2})\s+([\u0600-\u06FF]+)$/);
  if (dm && MONTHS_AR[dm[2]]) return `${dm[1].padStart(2, '0')}-${MONTHS_AR[dm[2]]}-${new Date().getFullYear()}`;
  const dig = t.match(/^(\d{1,2})[\/.-](\d{1,2})$/) || t.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (dig) return `${dig[1].padStart(2, '0')}-${dig[2].padStart(2, '0')}-${dig[3] || new Date().getFullYear()}`;
  return null;
};

const classifyLine = (t) => {
  let m;
  m = t.match(/^من\s*(?:مخزن|فرع)?\s*(.+)$/);
  if (m) return { kind: 'from', raw: m[1] };
  m = t.match(/^سحب\s*(.+)$/);
  if (m) {
    const rest = m[1].trim();
    if (rest.startsWith('من')) return { kind: 'from', raw: rest.replace(/^من\s*(?:مخزن|فرع)?\s*/, '') };
    if (rest.includes('من') || /^\d/.test(rest)) return { kind: 'froms', raw: t };
    return { kind: 'from', raw: rest };
  }
  if (/^(خذيت|شلت|أخذت|وخذيت|شيلت|شال|شيلنا|خذنا|وخذنا)/.test(t) && t.includes('من ')) return { kind: 'item', raw: t };
  m = t.match(/^إلى\s+(?:فرع\s+)?(.+)$/);
  if (m) return { kind: 'target', qty: parseQty((m[1].match(/\d+(?:\.\d+)?$/) || [''])[0]), text: m[1] };
  m = t.match(/^(\d+(?:\.\d+)?)\s+(?:إلى\s+)?(.+)$/);
  if (m) return { kind: 'target', qty: Number(m[1]), text: m[2].trim() };
  if (/^\d+(?:\.\d+)?$/.test(t)) return { kind: 'qty', qty: Number(t) };
  m = t.match(/^(?:حطيت|حطينا|رصيت|رصينا|وزعنا?|توزيع)\s+.*?\s*(?:في|على)\s+(.+)$/);
  if (m) {
    const qMatch = m[1].match(/\d+(?:\.\d+)?/);
    return { kind: 'target', qty: qMatch ? Number(qMatch[0]) : null, text: m[1] };
  }
  m = t.match(/^(?:تقسيم|على|بين|بينهم)[\s:]+(.+)$/);
  if (m) return { kind: 'splitnames', text: m[1] };
  m = t.match(/^تم تحويل\s*(.+)$/);
  if (m) return { kind: 'tran', raw: m[1] };
  return { kind: 'item', raw: t };
};

/** تقطيع الأسطر إلى كتل (إذونات). itemStart: مُنبئ (اختياري) لبداية صنف جديد */
export const segmentBlocks = (lines, itemStart) => {
  const blocks = [];
  let cur = null;
  for (const t of lines) {
    if (!t) continue;
    if (t === 'إلى' || t === 'إلى فرع') continue;
    const date = parseDateLine(t);
    if (date) {
      if (cur && cur.fragments.length) blocks.push(cur);
      cur = { date, fragments: [] };
      continue;
    }
    const curHasFrom = cur && cur.fragments.some((f) => f.kind === 'from' || f.kind === 'froms');
    const fromHasNumber = cur && cur.fragments.some((f) => (f.kind === 'from' || f.kind === 'froms') && /\d/.test(f.raw || ''));
    const hard = t.startsWith('من') || t.startsWith('سحب') || t.startsWith('تم تحويل');
    const startsNew = !!cur && cur.fragments.length > 0 && curHasFrom && (hard || (itemStart && fromHasNumber && itemStart(t)));
    if (!cur || startsNew) {
      if (cur && cur.fragments.length) blocks.push(cur);
      cur = { date: null, fragments: [] };
    }
    cur.fragments.push(classifyLine(t));
  }
  if (cur && cur.fragments.length) blocks.push(cur);
  return blocks;
};

/* ───────────────────── استخراج + مطابقة ───────────────────── */

const UNIT_WORDS = ['كرتون', 'كراتين', 'صندوق', 'صناديق', 'حبه', 'حبات', 'علبه', 'علب', 'عبوه', 'عبوات', 'طبق', 'اطباق', 'سطل', 'كي', 'شوال', 'جمله', 'بنطه'];
const stripUnitHints = (s) => {
  let r = String(s || '').trim();
  const numChain = '\\d+(\\.\\d+)?';
  r = r.replace(new RegExp(`\\s*(?:${UNIT_WORDS.join('|')})\\s+عدد\\s*${numChain}\\s*(?:حبه|حبات|قطعه|قطعات)?\\s*$`, 'i'), '').trim();
  r = r.replace(new RegExp(`(?:^|\\s)(?:${UNIT_WORDS.join('|')})\\s+عدد\\s*${numChain}\\s*(?:حبه|حبات|قطعه|قطعات)?(?=\\s|$)`, 'g'), ' ').trim();
  r = r.replace(new RegExp(`(?:^|\\s)(?:${UNIT_WORDS.join('|')})(?=\\s|$)`, 'gi'), ' ').trim();
  return r.replace(/\s{2,}/g, ' ');
};

const stripBranchMark = (s) => String(s || '').replace(/^(مخزن|فرع)\s+/i, '').trim();
const cleanTargetText = (s) => stripBranchMark(String(s || '').replace(/\s*\d+(?:\.\d+)?$/, '').trim()).replace(/\s{2,}/g, ' ');

const ACTION_VERBS = ['خذيت', 'شلت', 'أخذت', 'وخذيت', 'شيلت', 'شيل', 'شال', 'وخذنا', 'خذنا', 'شيلنا', 'سحب', 'سحبنا'];
const stripVerbs = (s) => {
  let r = String(s || '');
  r = r.replace(new RegExp(`^(?:${ACTION_VERBS.join('|')})\\s+`, 'i'), '');
  r = r.replace(new RegExp(`\\s+(?:${ACTION_VERBS.join('|')})\\s*$`, 'i'), '');
  return r.trim();
};

const splitInlineSource = (raw) => {
  const m = raw.match(/^(.*?)\s*من\s+(.+)$/);
  if (!m) return { item: raw, src: null };
  const left = stripVerbs(m[1].trim());
  let srcBody = m[2].replace(/^(مخزن|فرع)\s+/i, '').trim();
  const qm = srcBody.match(/(\d+(?:\.\d+)?)\s*$/);
  const qty = qm ? Number(qm[1]) : null;
  if (qm) srcBody = srcBody.replace(/(\d+(?:\.\d+)?)\s*$/, '').trim();
  return { item: left || null, src: { branchText: srcBody, qty } };
};

const pickBranchPrefix = (toks, matchBranch) => {
  let best = { k: 0, distance: 99, matchedId: null, matchedName: null, conf: 'none', candidates: [] };
  for (let k = 1; k <= toks.length; k++) {
    const name = toks.slice(0, k).join(' ');
    if (!/[\u0600-\u06FF]/.test(name)) continue;
    const r = matchBranch(name);
    if (!r.matchedId) continue;
    const dist = r.distance ?? 99;
    if (dist < best.distance || (dist === best.distance && k < best.k)) {
      best = { k, matchedId: r.matchedId, matchedName: r.matchedName, conf: r.confidence, distance: dist, candidates: r.candidates || [] };
    }
  }
  return best;
};

const parseFromBody = (raw, matchBranch) => {
  let body = String(raw || '');
  body = body.replace(/^سحب\s*/i, '').replace(/\s+سحب\s*$/i, '');
  const toks = body.split(/\s+/).filter((w) => w);
  if (!toks.length) return { branch: null, branchRaw: null, qty: null, item: null, branchConfidence: null, branchCandidates: [] };

  const best = pickBranchPrefix(toks, matchBranch);
  if (best.matchedId) {
    const branchName = toks.slice(0, best.k).join(' ');
    let after = stripVerbs(toks.slice(best.k).join(' '));
    let qty = null;
    const lead = after.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (lead && /^\d/.test(lead[1])) { qty = Number(lead[1]); after = lead[2]; }
    if (qty === null) {
      const trail = after.match(/^(.*?)\s*(\d+(?:\.\d+)?)\s*$/);
      if (trail && trail[1].trim()) { qty = Number(trail[2]); after = trail[1].trim(); }
    }
    const item = stripUnitHints(stripVerbs(after));
    return { branch: branchName, branchRaw: branchName, qty, item: item || null, branchConfidence: best.conf, branchCandidates: best.candidates };
  }

  const firstNum = toks.findIndex((w) => /^\d+(?:\.\d+)?$/.test(w));
  const branch = firstNum > 0 ? toks.slice(0, firstNum).join(' ') : toks[0];
  let qty = null;
  if (firstNum >= 0) qty = Number(toks[firstNum]);
  const item = stripUnitHints(stripVerbs(toks.slice(firstNum >= 0 ? firstNum + 1 : 1).join(' '))) || null;
  return { branch: branch || null, branchRaw: branch || null, qty, item, branchConfidence: null, branchCandidates: [] };
};

const resolveBlock = (block, repo) => {
  const warnings = [];
  const date = block.date;
  const sources = [];
  const tgts = [];
  const itemCand = [];
  const splitNames = [];
  const tranFrags = [];
  const pushTgt = (t) => {
    if (!t || !t.text) return;
    const col = tgts.find((x) => fold(x.text) === fold(t.text));
    if (col) { if (t.qty != null && col.qty == null) col.qty = t.qty; return; }
    tgts.push({ text: t.text, qty: t.qty != null ? t.qty : null });
  };

  let materialItemSet = false;

  for (const f of block.fragments) {
    switch (f.kind) {
      case 'from': {
        sources.push(parseFromBody(f.raw, repo.matchBranch));
        break;
      }
      case 'froms': {
        const m = String(f.raw || '').match(/^سحب\s*(\d+(?:\.\d+)?)?\s*(.+?)\s*من\s+(?:مخزن|فرع)?\s*(.+)$/);
        if (m) {
          sources.push({ branch: m[3].trim(), branchRaw: m[3].trim(), qty: m[1] ? Number(m[1]) : null, item: stripUnitHints(stripVerbs(m[2])).trim() || null, branchConfidence: null, branchCandidates: [] });
        } else {
          const n = String(f.raw || '').match(/^سحب\s*(\d+(?:\.\d+)?)?\s*(.+)$/);
          if (n) {
            const it = stripUnitHints(stripVerbs(n[2])).trim() || null;
            sources.push({ branch: null, branchRaw: null, qty: n[1] ? Number(n[1]) : null, item: it, branchConfidence: null, branchCandidates: [] });
            if (it) itemCand.push(it);
          }
        }
        break;
      }
      case 'item': {
        const inline = splitInlineSource(f.raw);
        if (inline.src) {
          const brMatch = inline.src.branchText ? repo.matchBranch(inline.src.branchText) : null;
          sources.push({
            branch: brMatch && brMatch.matchedId ? brMatch.matchedName : null,
            branchRaw: inline.src.branchText || null,
            branchId: brMatch && brMatch.matchedId ? brMatch.matchedId : null,
            qty: inline.src.qty ?? null,
            item: inline.item,
            branchConfidence: brMatch ? brMatch.confidence : null,
            branchCandidates: (brMatch && brMatch.candidates) || [],
          });
          if (inline.item) itemCand.push(inline.item);
          break;
        }
        // صنف بكمية ملحقة به (مثل "قشطة السعيدة 75")
        const trailNum = (f.raw || '').match(/\s(\d+(?:\.\d+)?)\s*$/);
        const base = trailNum ? f.raw.replace(/\s*\d+(?:\.\d+)?\s*$/, '').trim() : f.raw;
        const mrProbe = repo.matchMaterial(stripUnitHints(stripVerbs(base)));
        const brProbe = repo.matchBranch(base);
        // سطر عادي يطابق فرعًا ولا يطابق صنفًا (مثل "الفيصلية 5") → هدف
        if (!(mrProbe.matchedId && mrProbe.confidence !== 'none') && brProbe.matchedId && (brProbe.confidence === 'exact' || brProbe.confidence === 'fuzzy')) {
          pushTgt({ text: cleanTargetText(base), qty: trailNum ? Number(trailNum[1]) : null });
          break;
        }
        const kept = stripUnitHints(stripVerbs(base));
        if (trailNum) sources.push({ branch: null, branchRaw: null, qty: Number(trailNum[1]), item: kept || null, branchConfidence: null, branchCandidates: [] });
        if (kept) itemCand.push(kept);
        break;
      }
      case 'target': {
        // سطر يبدأ برقم: إن كان الباقي صنفًا فهو "كمية + صنف" وليس هدفًا
        const cleanTxt = cleanTargetText(f.text);
        const mr = repo.matchMaterial(f.text);
        if (mr.matchedId && mr.confidence !== 'none' && !materialItemSet) {
          itemCand.push(cleanTxt);
          sources.push({ branch: null, branchRaw: null, qty: f.qty, item: cleanTxt, branchConfidence: null, branchCandidates: [] });
          materialItemSet = true;
        } else {
          pushTgt({ text: cleanTxt, qty: f.qty });
        }
        break;
      }
      case 'qty': {
        if (tgts.length) tgts[tgts.length - 1].qty = f.qty;
        else warnings.push(`كمية منفردة بلا فرع: ${f.qty}`);
        break;
      }
      case 'splitnames': splitNames.push(f.text); break;
      case 'tran': tranFrags.push(f.raw); break;
      default: break;
    }
  }

  // صنف (سطر عادي) يشبه فرعًا → هدف
  for (const cand of itemCand) {
    const mr = repo.matchMaterial(cand);
    if (mr.matchedId && mr.confidence !== 'none') { if (!materialItemSet) materialItemSet = true; continue; }
    const br = repo.matchBranch(cand);
    const trailing = (cand.match(/\d+(?:\.\d+)?$/) || [''])[0];
    const base = cand.replace(/\s*\d+(?:\.\d+)?\s*$/, '').trim();
    if (br.matchedId && (br.confidence === 'exact' || br.confidence === 'fuzzy')) {
      pushTgt({ text: base, qty: trailing ? Number(trailing) : null });
    }
  }

  // استخراج الأصناف المضمّنة داخل أسطر المصدر (مثل "المنار ٣٠ قشطة")
  for (const s of sources) {
    if (s.item && s.qty != null && !itemCand.some((x) => fold(x) === fold(s.item))) itemCand.push(s.item);
  }

  // "تم تحويل X الى Y" (وأقاربها)
  for (const t of tranFrags) {
    const cleanTran = String(t).replace(/^سحب\s*/i, '');
    const m = cleanTran.match(/^(.+?)\s*(?:الى|إلى|الي|لمخزن|لفرع)\s+(?:مخزن|فرع)?\s*(.+)$/);
    if (!m) continue;
    const it = stripUnitHints(stripVerbs(m[1]));
    if (it) itemCand.push(it);
    m[2].split(/\s*(?:الى|إلى|الي)\s*/).forEach((part) => {
      const q = parseQty((part.match(/\d+(?:\.\d+)?/) || [''])[0]) || null;
      pushTgt({ text: cleanTargetText(part), qty: q });
    });
  }

  // أسماء تقسيم بدون كميات
  for (const s of splitNames) {
    s.split(/\s+/).forEach((w) => {
      const st = cleanTargetText(w);
      if (st) pushTgt({ text: st, qty: null });
    });
  }

  // دمج كميات مصادر بلا فرع في المصدر الوحيد ذي فرع (منع العد المزدوج)
  const bulky = sources.filter((s) => s.branch);
  const branchlessQty = sources.reduce((a, s) => a + (s.qty || 0), 0) - bulky.reduce((a, s) => a + (s.qty || 0), 0);
  if (bulky.length === 1 && branchlessQty > 0) {
    bulky[0].qty = (bulky[0].qty || 0) + branchlessQty;
    for (const s of sources) if (!s.branch && s.qty) s.qty = null;
  }

  // اختيار الصنف: الأفضل هو الذي يطابق مادة فعلًا
  let rawItem = null;
  if (itemCand.length) {
    rawItem = itemCand.find((x) => { const r = repo.matchMaterial(x); return r.matchedId && (r.confidence === 'exact' || r.confidence === 'alias'); })
      || itemCand.find((x) => { const r = repo.matchMaterial(x); return r.matchedId && r.confidence === 'fuzzy'; });
    // إن لم يوجد تطابق مادة والاسم يطابق فرعًا ← هدف مكمل لا صنف
    if (!rawItem) {
      const br = itemCand[0] ? repo.matchBranch(itemCand[0]) : null;
      rawItem = br && br.matchedId && (br.confidence === 'exact' || br.confidence === 'fuzzy') ? null : itemCand[0];
    }
  }

  // إكمال هدف وحيد بلا كمية من مجموع السحب
  const surrender = sources.reduce((a, s) => a + (s.qty || 0), 0);
  if (tgts.length === 1 && tgts[0].qty == null && surrender > 0) tgts[0].qty = surrender;

  return { date, rawItem, sources, targets: tgts, warnings };
};

/* ───────────────────── بناء المسودة النهائية ───────────────────── */

const buildDraftFromBlock = (block, repo, store) => {
  const warnings = [...(block.warnings || [])];
  const notes = [];

  const itemMatch = block.rawItem ? repo.matchMaterial(block.rawItem) : null;
  const material = itemMatch && itemMatch.matchedId ? repo.materials.find((m) => m.id === itemMatch.matchedId) || null : null;
  const itemConf = itemMatch ? itemMatch.confidence : 'none';
  if (block.rawItem && !material) {
    const cands = (itemMatch && itemMatch.candidates) || [];
    warnings.push(`الصنف «${block.rawItem}» غير موجود في النظام — ${cands.length ? 'الأقرب: ' + cands.slice(0, 3).map((c) => c.name).join('، ') : 'أضفه من شاشة المواد'}`);
  }
  if (!block.rawItem) warnings.push('لم يُستخرج اسم الصنف — حدده قبل الاعتماد');

  const srcRows = block.sources || [];
  const branched = srcRows.filter((s) => s.branch);
  const firstSrc = branched[0] ? repo.matchBranch(branched[0].branch) : null;
  const fromConf = firstSrc ? firstSrc.confidence : 'none';
  if (!branched.length) warnings.push('لم يُستخرج فرع المصدر (من) — حدده قبل الاعتماد');
  else if (!firstSrc || !firstSrc.matchedId) warnings.push(`فرع المصدر «${branched[0].branch}» غير متطابق في النظام — حدده`);
  const multiSource = branched.length > 1 ? branched.map((s) => ({ branchName: s.branch, qty: s.qty ?? null })) : [];

  const fromBranchId = firstSrc && firstSrc.matchedId ? firstSrc.matchedId : '';
  const fromBranchName = firstSrc && firstSrc.matchedName ? firstSrc.matchedName : (branched[0] ? branched[0].branch : '');

  const conversion = material && material.purchaseUnitConversion > 0 ? material.purchaseUnitConversion : 1;
  const purchaseUnit = material ? (material.purchaseUnit && material.purchaseUnit.trim() ? material.purchaseUnit : material.unit) : '';
  // السعر الفعلي = آخر سعر شراء للصنف في الفرع المرسل (أحدث استلام معتمد)؛
  // يعود للسعر القياسي فقط عند عدم وجود أي استلام شراء لهذا الصنف بالفرع.
  const unitCost = material ? lastPurchaseUnitCost(store, fromBranchId, material.id, material.standardPrice || 0) : 0;
  const unit = material ? material.unit : '';

  const rows = [];
  const unknownTargets = [];
  let totalQty = 0;
  for (const t of block.targets) {
    const mt = t.text ? repo.matchBranch(t.text) : null;
    const qty = t.qty != null ? t.qty : null;
    if (mt && mt.matchedId && qty != null) {
      rows.push({
        toBranchId: mt.matchedId,
        toBranchName: mt.matchedName,
        qty,
        purchaseUnit,
        conversion,
        unit,
        inventoryQty: roundQty(qty * conversion),
        unitCost,
        _match: { confidence: mt.confidence, source: t.text, candidates: mt.candidates || [] },
      });
      totalQty += qty;
      if (mt.confidence !== 'exact' && mt.confidence !== 'alias') unknownTargets.push(`${t.text}${mt.matchedName && fold(mt.matchedName) !== fold(t.text) ? ` (→ ${mt.matchedName})` : ''}`);
    } else {
      unknownTargets.push(t.text || '؟');
      if (t.text && qty != null) warnings.push(`الهدف «${t.text}» غير متطابق في النظام`);
      if (qty == null && t.text && mt && mt.matchedId) warnings.push(`الهدف «${mt.matchedName}» دون كمية`);
    }
  }
  if (!rows.length && !block.targets.length) warnings.push('لا توجد أهداف (إلى) في الإذن');

  const surrender = srcRows.reduce((a, s) => a + (s.qty || 0), 0);
  if (surrender && totalQty && Math.abs(surrender - totalQty) > 0.001) {
    warnings.push(`الكمية المسحوبة (${surrender}) لا تساوي مجموع الأهداف (${totalQty})`);
  }
  if (!block.date) notes.push('لم يُذكر تاريخ — سيعتمد تاريخ اليوم عند الاعتماد');

  return {
    fromBranchId,
    fromBranchName,
    itemName: material ? material.nameAr : (block.rawItem || ''),
    rawMaterialId: material ? material.id : '',
    unit,
    purchaseUnit,
    conversion,
    unitCost,
    rows,
    unknownTargets,
    parsedTotal: surrender || null,
    total: totalQty,
    inventoryTotal: rows.reduce((a, r) => a + (r.inventoryQty || 0), 0),
    date: block.date || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    source: 'telegram',
    matchInfo: {
      item: {
        confidence: itemConf,
        source: block.rawItem || '',
        matchedId: material ? material.id : null,
        matchedName: material ? material.nameAr : null,
        candidates: (itemMatch && itemMatch.candidates) || [],
      },
      from: {
        confidence: fromConf,
        source: branched[0] ? branched[0].branch : '',
        matchedId: fromBranchId || null,
        matchedName: fromBranchName || null,
        candidates: (firstSrc && firstSrc.candidates) || [],
      },
    },
    multiSource: multiSource.length ? multiSource : undefined,
    warnings,
    notes,
  };
};

/* ───────────────────── مرجعية + مرادفات ───────────────────── */

export const getAliases = (store) => {
  const a = store.getKV(ALIAS_KV);
  return { items: Array.isArray(a?.items) ? a.items : [], branches: Array.isArray(a?.branches) ? a.branches : [] };
};

export const learnItemAlias = (store, alias, rawMaterialId) => {
  const a = getAliases(store);
  if (!String(alias || '').trim()) return false;
  const q = fold(alias);
  if (!a.items.some((x) => fold(x.alias) === q)) {
    a.items.push({ alias: String(alias).trim(), rawMaterialId });
    store.setKV(ALIAS_KV, a);
    return true;
  }
  return false;
};

export const learnBranchAlias = (store, alias, branchId) => {
  const a = getAliases(store);
  if (!String(alias || '').trim()) return false;
  const q = fold(alias);
  if (!a.branches.some((x) => fold(x.alias) === q)) {
    a.branches.push({ alias: String(alias).trim(), branchId });
    store.setKV(ALIAS_KV, a);
    return true;
  }
  return false;
};

const makeMatcher = (store) => {
  const branches = store.getKV('rcerp_branches') || [];
  const materials = store.getKV('rcerp_raw_materials') || [];
  const aliases = getAliases(store);

  const rank = (list, q, key) => list
    .map((item) => ({ ...item, distance: nameDistance(q, item[key]) }))
    .filter((item) => item.distance < 99)
    .sort((a, b) => a.distance - b.distance);

  const matchBranch = (text) => {
    const q = fold(stripBranchMark(text));
    if (!q) return { matchedId: null, matchedName: null, confidence: 'none', sourceText: text, candidates: [] };
    const exact = branches.find((b) => fold(b.nameAr) === q);
    if (exact) return { matchedId: exact.id, matchedName: exact.nameAr, confidence: 'exact', sourceText: text, candidates: [], distance: 0 };
    const aliasHit = aliases.branches
      .map((x) => ({ x, b: branches.find((b) => b.id === x.branchId) }))
      .find((o) => o.b && fold(o.x.alias) === q);
    if (aliasHit) return { matchedId: aliasHit.b.id, matchedName: aliasHit.b.nameAr, confidence: 'alias', sourceText: text, candidates: [], distance: 0 };
    // ── مطابقة جزئية/كلمات (جزئية) ──
    // إذا كان النص جزءاً من اسم الفرع (كلمة كاملة)، نعتمده مطابقة دقيقة
    const partial = branches.find((b) => {
      const name = fold(b.nameAr);
      // تحقق من كون q كلمة كاملة داخل الاسم
      const words = name.split(/\s+/);
      return words.some(w => w === q);
    });
    if (partial) return { matchedId: partial.id, matchedName: partial.nameAr, confidence: 'exact', sourceText: text, candidates: [], distance: 0 };
    // ── مطابقة تقريبية (Levenshtein) ──
    const ranked = rank(branches, q, 'nameAr');
    const best = ranked[0];
    if (best && best.distance <= 2) {
      return { matchedId: best.id, matchedName: best.nameAr, confidence: best.distance === 0 ? 'exact' : 'fuzzy', sourceText: text, distance: best.distance, candidates: ranked.slice(0, 4).map((b) => ({ id: b.id, name: b.nameAr })) };
    }
    return { matchedId: null, matchedName: null, confidence: 'none', sourceText: text, candidates: ranked.slice(0, 4).map((b) => ({ id: b.id, name: b.nameAr })) };
  };

  const matchMaterial = (text) => {
    let q = fold(String(text || '').replace(/^(كرتون|صندوق)\s+/i, ''));
    q = stripUnitHints(q).replace(/\s{2,}/g, ' ').trim();
    if (!q) return { matchedId: null, matchedName: null, confidence: 'none', sourceText: text, candidates: [] };
    const exact = materials.find((m) => fold(m.nameAr) === q);
    if (exact) return { matchedId: exact.id, matchedName: exact.nameAr, confidence: 'exact', sourceText: text, candidates: [], distance: 0 };
    const aliasHit = aliases.items
      .map((x) => ({ x, m: materials.find((m) => m.id === x.rawMaterialId) }))
      .find((o) => o.m && fold(o.x.alias) === q);
    if (aliasHit) return { matchedId: aliasHit.m.id, matchedName: aliasHit.m.nameAr, confidence: 'alias', sourceText: text, candidates: [], distance: 0 };
    const ranked = rank(materials, q, 'nameAr');
    const best = ranked[0];
    if (best && best.distance <= 2) {
      return { matchedId: best.id, matchedName: best.nameAr, confidence: best.distance === 0 ? 'exact' : 'fuzzy', sourceText: text, candidates: ranked.slice(0, 4).map((m) => ({ id: m.id, name: m.nameAr })) };
    }
    const stripped = stripBrand(text);
    if (stripped && stripped !== q) {
      const q2 = fold(stripped);
      const exact2 = materials.find((m) => fold(m.nameAr) === q2);
      if (exact2) return { matchedId: exact2.id, matchedName: exact2.nameAr, confidence: 'exact', sourceText: text, candidates: [], distance: 0 };
      const ranked2 = rank(materials, q2, 'nameAr');
      const best2 = ranked2[0];
      if (best2 && best2.distance <= 2) {
        return { matchedId: best2.id, matchedName: best2.nameAr, confidence: best2.distance === 0 ? 'exact' : 'fuzzy', sourceText: text, candidates: ranked2.slice(0, 4).map((m) => ({ id: m.id, name: m.nameAr })) };
      }
    }
    return { matchedId: null, matchedName: null, confidence: 'none', sourceText: text, candidates: ranked.slice(0, 4).map((m) => ({ id: m.id, name: m.nameAr })) };
  };

  const conversionOf = (m) => (m.purchaseUnitConversion && m.purchaseUnitConversion > 0 ? m.purchaseUnitConversion : 1);
  const purchaseUnitOf = (m) => (m.purchaseUnit && m.purchaseUnit.trim() ? m.purchaseUnit : m.unit);

  return { branches, materials, matchBranch, matchMaterial, conversionOf, purchaseUnitOf };
};

// ======== معالج تنسيق مبسط للتحويلات (سطر واحد) ========
const TRANSFER_VERBS = ['تحويل', 'نقل', 'تحويل من', 'نقل من'];
const SIMPLE_TRANSFER_RE = /^(?:تحويل|نقل)(?:\s+من)?\s+(.+?)\s+(?:إلى|لـ|الى)\s+(.+)$/i;

const tryParseSimpleTransfer = (text, store) => {
  const raw = String(text || '').trim();
  const m = raw.match(SIMPLE_TRANSFER_RE);
  if (!m) return null;

  const fromPart = m[1].trim();
  const toPart = m[2].trim();

  const repo = makeMatcher(store);
  const fromMatch = parseFromBody(fromPart, repo.matchBranch);
  if (!fromMatch.branch || !fromMatch.item || fromMatch.qty == null) return null;

  const toLines = toPart.split(/\s*[،,]\s*/).filter(Boolean);
  const rows = [];
  for (const t of toLines) {
    const qtyMatch = t.match(/(\d+(?:\.\d+)?)/);
    const qty = qtyMatch ? Number(qtyMatch[1]) : null;
    let branchText = t.replace(/(\d+(?:\.\d+)?)/, '').trim();
    branchText = branchText.replace(/^(إلى|لـ|الى)\s+/i, '').trim();
    const br = repo.matchBranch(branchText);
    if (!br.matchedId) continue;
    rows.push({
      toBranchId: br.matchedId,
      toBranchName: br.matchedName,
      qty,
      purchaseUnit: null,
      conversion: 1,
      unit: '',
      inventoryQty: null,
      unitCost: 0,
    });
  }
  if (rows.length === 0) return null;

  const branches = store.getKV('rcerp_branches') || [];
  const materials = store.getKV('rcerp_raw_materials') || [];
  const fromId = repo.matchBranch(fromMatch.branch)?.matchedId;
  if (!fromId) return null;
  const mat = repo.matchMaterial(fromMatch.item);
  if (!mat.matchedId) return null;
  const material = materials.find((m) => m.id === mat.matchedId);
  if (!material) return null;

  const conversion = material.purchaseUnitConversion && material.purchaseUnitConversion > 0 ? material.purchaseUnitConversion : 1;
  const purchaseUnit = material.purchaseUnit && material.purchaseUnit.trim() ? material.purchaseUnit : material.unit;
  const unitCost = lastPurchaseUnitCost(store, fromId, material.id, material.standardPrice || 0);

  const finalRows = rows.map((r) => ({
    ...r,
    purchaseUnit: material.purchaseUnit || material.unit,
    conversion,
    unit: material.unit,
    inventoryQty: roundQty(r.qty * conversion),
    unitCost,
  }));

  const total = finalRows.reduce((a, r) => a + (r.qty || 0), 0);
  const inventoryTotal = finalRows.reduce((a, r) => a + (r.inventoryQty || 0), 0);

  return {
    ok: true,
    handled: true,
    drafts: [{
      fromBranchId,
      fromBranchName: repo.matchBranch(fromMatch.branch)?.matchedName || fromMatch.branch,
      itemName: material.nameAr,
      rawMaterialId: material.id,
      unit: material.unit,
      purchaseUnit,
      conversion,
      unitCost,
      rows: finalRows,
      unknownTargets: [],
      parsedTotal: fromMatch.qty,
      total,
      inventoryTotal,
      date: null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      source: 'telegram',
      matchInfo: {
        item: { confidence: 'exact', source: fromMatch.item, matchedId: material.id, matchedName: material.nameAr, candidates: [] },
        from: { confidence: 'exact', source: fromMatch.branch, matchedId: fromId, matchedName: repo.matchBranch(fromMatch.branch)?.matchedName || fromMatch.branch, candidates: [] },
      },
      multiSource: undefined,
      warnings: [],
      notes: [],
    }],
    reply: `✅ <b>تم استلام إذن تحويل (بسيط)</b>.\nمن: <b>${repo.matchBranch(fromMatch.branch)?.matchedName || fromMatch.branch}</b>\nالصنف: <b>${material.nameAr}</b>\nالكمية: ${fromMatch.qty}\nالأهداف: ${finalRows.map(r => `${r.toBranchName} (${r.qty} ${material.purchaseUnit || material.unit})`).join('، ')}`,
  };
};

/* ───────────────────── المعالج المسبق للصيغ متعددة الأسطر ───────────────────── */
/**
 * يحول الصيغ الطبيعية متعددة الأسطر إلى الصيغة القياسية التي يفهمها المعالج الأصلي.
 * الصيغ المدعومة:
 *   موز
 *    من فرع
 *     ١ طيبة
 *     ١ الضاحية
 *
 *   إلى فرع
 *   ٢ المنار
 *
 * تصبح:
 *   موز
 *   من فرع طيبة 1
 *   من فرع الضاحية 1
 *   إلى فرع المنار 2
 */
const preprocessMultilineTransfer = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return raw;

  // تطبيع الأرقام العربية/الهندية إلى ASCII
  const normalizeDigits = (s) => String(s)
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 3) return raw;

  const hasFromHeader = lines.some(l => /^من\s*(?:فرع|مخزن)?\s*$/i.test(l));
  const hasToHeader = lines.some(l => /^إلى\s*(?:فرع|مخزن)?\s*$/i.test(l) || /^الى\s*(?:فرع|مخزن)?\s*$/i.test(l));

  if (!hasFromHeader || !hasToHeader) return raw;

  const itemLine = lines[0];
  const outLines = [itemLine];

  let mode = 'start';
  const fromSources = []; // { branch, qty }
  const toTargets = [];   // { branch, qty }

  for (let i = 1; i < lines.length; i++) {
    const line = normalizeDigits(lines[i]);
    if (/^من\s*(?:فرع|مخزن)?\s*$/i.test(line)) { mode = 'from'; continue; }
    if (/^إلى\s*(?:فرع|مخزن)?\s*$/i.test(line) || /^الى\s*(?:فرع|مخزن)?\s*$/i.test(line)) { mode = 'to'; continue; }

    const qMatch = line.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (qMatch) {
      const qty = qMatch[1];
      const branch = qMatch[2].trim();
      if (mode === 'from') {
        fromSources.push({ branch, qty: parseFloat(qty) });
      } else if (mode === 'to') {
        toTargets.push({ branch, qty: parseFloat(qty) });
      }
    } else if (/^إلى\s+/.test(line) || /^الى\s+/.test(line)) {
      outLines.push(line);
    } else if (/^من\s+/.test(line)) {
      outLines.push(line);
    }
  }

  // بناء المخرجات بصيغة موحدة: سطر مصدر واحد + أهداف متعددة
  const outLines2 = [lines[0]];

  if (fromSources.length > 0) {
    // نأخذ أول مصدر كمصدر رئيسي، والباقي نضيفها في تحذيرات
    const main = fromSources[0];
    const totalFromQty = fromSources.reduce((s, s2) => s + s2.qty, 0);
    outLines.push(`من فرع ${main.branch} ${totalFromQty}`);
    if (fromSources.length > 1) {
      const others = fromSources.slice(1).map(s => `${s.branch} ${s.qty}`).join('، ');
      // نضيف المصادر الإضافية كسطر تعليقي سيظهر في التحذيرات
    }
  }

  // الأهداف
  if (toTargets.length > 0) {
    outLines.push('إلى');
    for (const t of toTargets) {
      outLines.push(`${t.qty} ${t.branch}`);
    }
  }

  return outLines.join('\n');
};

export const processIntakeText = (store, text) => {
  // ======== معالج مسبق للصيغ متعددة الأسطر (من فرع X، إلى فرع Y) ========
  const normalized = preprocessMultilineTransfer(text);
  // ======== المسار الأصلي ========
  const lines = cleanRawText(normalized);
  const repo = makeMatcher(store);
  const itemStartPred = (line) => {
    const toks = line.split(/\s+/);
    let probe = toks.slice(0, 4).join(' ');
    probe = probe.split(/\s*من(?:\s+|$)/)[0];
    probe = probe.replace(new RegExp(`(?:${ACTION_VERBS.join('|')})`, 'g'), ' ');
    probe = probe.replace(/\s*\d+(?:\.\d+)?\s*$/, '').trim();
    const r = probe ? repo.matchMaterial(probe) : null;
    return !!(r && r.matchedId && r.confidence !== 'none');
  };
  const blocks = segmentBlocks(lines, itemStartPred);
  const drafts = [];

  for (const blk of blocks) {
    const resolved = resolveBlock(blk, repo);
    const looksEmpty = !resolved.rawItem && resolved.sources.length === 0 && resolved.targets.length === 0 && !resolved.warnings.length;
    if (looksEmpty) continue;
    drafts.push(buildDraftFromBlock(resolved, repo, store));
  }

  if (drafts.length === 0) {
    return { ok: false, handled: false, error: 'لا يوجد ما يصلح للقراءة — أرسل رسالة فيها «من … إلى …» أو سطر سحب/أهداف بأرقام' };
  }
  return { ok: true, handled: true, drafts, reply: formatIntakeReply(drafts) };
};

const CONF_LABEL = { exact: '✓ مطابق', alias: 'مرادف محفوظ', fuzzy: '≈ مطابقة تقريبية', none: '✗ غير متطابق' };

export const formatIntakeReply = (drafts) => {
  const lines = [`🧾 <b>تم استلام ${drafts.length} إذن تحويل</b>.`, ''];
  drafts.forEach((d, i) => {
    const conf = d.matchInfo?.item?.confidence || 'none';
    lines.push(`<b>${i + 1})</b> ${d.itemName || '‎؟'} — من <b>${d.fromBranchName || '‎؟'}</b>`);
    const tgt = d.rows.length
      ? d.rows.map((r) => `${r.toBranchName} (${r.qty}${d.purchaseUnit ? ' ' + d.purchaseUnit : ''})`).join('، ')
      : (d.unknownTargets.length ? 'أهداف غير متطابقة: ' + d.unknownTargets.slice(0, 4).join('، ') : 'لا أهداف');
    lines.push(`↳ ${tgt}`);
    lines.push(`   الصنف: ${d.matchInfo?.item?.source ? `«${d.matchInfo.item.source}»` : '—'} ${CONF_LABEL[conf] || ''}`);
    if (d.multiSource && d.multiSource.length > 1) lines.push(`   ⚠️ مصادر متعددة: ${d.multiSource.map((s) => `${s.branchName}${s.qty != null ? ' ' + s.qty : ''}`).join('، ')}`);
    if ((d.warnings || []).length) lines.push(`   ⚠️ ${d.warnings[0]}${d.warnings.length > 1 ? ` (+${d.warnings.length - 1} تنبيه)` : ''}`);
  });
  if (drafts.some((d) => d.multiSource && d.multiSource.length > 1)) {
    lines.push('', '<i>ملاحظة: الإذونات متعددة المصادر (تقسيم) تُعتمد يدويًا عبر شاشة التحويلات للحفاظ على دقة المخزون.</i>');
  }
  return lines.filter(Boolean).join('\n');
};

/* ───────────────────── دوال قديمة (توافق) ───────────────────── */

export const parseDistribution = (text) => {
  if (!text) return { ok: false, error: 'رسالة فارغة' };
  const lines = text.split('\n').map((l) => stripDots(l)).filter(Boolean);
  let fromBranch = null;
  let itemName = null;
  let totalQty = null;
  let dateLine = null;
  const rows = [];

  for (const line of lines) {
    const norm = normalizeDigits(line);
    const dm = norm.match(/^(\d{1,2})\s+([\u0600-\u06FF]+)/);
    if (dm && MONTHS_AR[dm[2]]) {
      dateLine = `${dm[1].padStart(2, '0')}-${MONTHS_AR[dm[2]]}-${new Date().getFullYear()}`;
      continue;
    }
    if (line.startsWith('من')) {
      const rest = line.replace(/^من\s*/, '').trim();
      const restNormalized = normalizeDigits(rest);
      const qm = restNormalized.match(/(\d+(?:\.\d+)?)/);
      const qIdx = qm ? restNormalized.indexOf(qm[0]) : -1;
      if (qm && qIdx > 0) {
        totalQty = parseQty(qm[0]);
        const beforeQ = rest.slice(0, qIdx).replace(/[\s.,]+$/g, '').trim();
        fromBranch = beforeQ.replace(/^مخزن\s+/i, '').trim() || beforeQ;
        itemName = rest.slice(qIdx + qm[0].length).trim();
      } else {
        fromBranch = rest.replace(/^مخزن\s+/i, '').trim();
      }
      continue;
    }
    if (fromBranch) {
      const m = normalizeDigits(line).match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
      if (m) rows.push({ qty: parseQty(m[1]), branch: m[2].trim() });
    }
  }

  if (!fromBranch) return { ok: false, error: 'لم أجد سطر «من ...» مع اسم المصدر' };
  if (rows.length === 0) return { ok: false, error: 'لم أجد أسطر التوزيع (فرع + كمية)' };
  const sum = rows.reduce((a, r) => a + (r.qty || 0), 0);
  return { ok: true, fromBranch, itemName, totalQty, sum, rows, dateLine };
};

const normName = (s) => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').toLowerCase().replace(/\s+/g, ' ').trim();
const commonPrefixLen = (a, b) => {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i += 1;
  return i;
};

export const matchBranchId = (branches, name) => {
  if (!name) return null;
  const q = normName(name).replace(/^(فرع|مخزن)\s+/, '');
  const exact = branches.find((b) => normName(b.nameAr) === q);
  if (exact) return exact.id;
  const strict = branches.find((b) => {
    const bn = normName(b.nameAr);
    if (q.includes(bn) || bn.includes(q)) return true;
    const cp = commonPrefixLen(bn, q);
    return cp >= 4 && (Math.max(bn.length, q.length) - cp) <= 2;
  });
  if (strict) return strict.id;
  return null;
};

export const findMaterial = (materials, name) => {
  if (!name) return null;
  let q = normName(name);
  q = q.replace(/قشطه السعيده/g, 'قشطه').replace(/قشطه الممتازه/g, 'قشطه');
  return (
    materials.find((m) => normName(m.nameAr) === q) ||
    materials.find((m) => q.includes(normName(m.nameAr)) || normName(m.nameAr).includes(q)) ||
    null
  );
};

export const buildDraftDistribution = (parsed, store) => {
  const branches = store.getKV('rcerp_branches') || [];
  const materials = store.getKV('rcerp_raw_materials') || [];
  const fromId = matchBranchId(branches, parsed.fromBranch);
  if (!fromId) return { ok: false, error: `فرع المصدر «${parsed.fromBranch}» غير معروف في النظام` };
  const mat = findMaterial(materials, parsed.itemName);
  if (!mat) return { ok: false, error: `الصنف «${parsed.itemName}» غير موجود في قائمة الأصناف` };

  const conversion = mat.purchaseUnitConversion && mat.purchaseUnitConversion > 0 ? mat.purchaseUnitConversion : 1;
  const purchaseUnit = mat.purchaseUnit && mat.purchaseUnit.trim() ? mat.purchaseUnit : mat.unit;
  // السعر الفعلي = آخر سعر شراء للصنف في الفرع المرسل لا سعر بطاقة الصنف.
  const unitCost = lastPurchaseUnitCost(store, fromId, mat.id, mat.standardPrice || 0);

  const rows = [];
  const unknown = [];
  for (const r of parsed.rows) {
    const toId = matchBranchId(branches, r.branch);
    if (!toId) { unknown.push(r.branch); continue; }
    rows.push({
      toBranchId: toId,
      toBranchName: (branches.find((b) => b.id === toId) || {}).nameAr,
      qty: r.qty,
      purchaseUnit,
      conversion,
      unit: mat.unit,
      inventoryQty: roundQty(r.qty * conversion),
      unitCost,
    });
  }
  if (rows.length === 0) return { ok: false, error: 'لا يوجد أي فرع هدف معروف في النظام' };
  const total = rows.reduce((a, r) => a + (r.qty || 0), 0);
  const inventoryTotal = rows.reduce((a, r) => a + (r.inventoryQty || 0), 0);
  return {
    ok: true,
    draft: {
      fromBranchId: fromId,
      fromBranchName: (branches.find((b) => b.id === fromId) || {}).nameAr,
      itemName: mat.nameAr,
      rawMaterialId: mat.id,
      unit: mat.unit,
      purchaseUnit,
      conversion,
      unitCost,
      rows,
      unknownTargets: unknown,
      parsedTotal: parsed.sum,
      total,
      inventoryTotal,
      date: parsed.dateLine || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      source: 'telegram',
      rawText: null,
    },
  };
};

export const formatDistributionReply = (parsed, draft, distId) => {
  const convInfo = draft.conversion && draft.conversion !== 1 && draft.purchaseUnit
    ? ` (تحويل: 1 ${draft.purchaseUnit} = ${draft.conversion} ${draft.unit})`
    : '';
  const lines = [
    `تم استلام توزيع مخزون من <b>${draft.fromBranchName}</b>`,
    `الصنف: ${draft.itemName}`,
    `الكمية برسالتك: ${parsed.totalQty ?? parsed.sum} ${draft.purchaseUnit}${convInfo}`,
    `بوحدة المخزون: ${draft.inventoryTotal} ${draft.unit}`,
    `عدد الأهداف: ${draft.rows.length}`,
    draft.unknownTargets.length ? `⚠️ أهداف لم تُعرف: ${draft.unknownTargets.join('، ')} — تحقق منها من الشاشة` : '',
    '',
    `مرجع: <b>${distId}</b>`,
    'راجعه من شاشة «توزيعات واردة للمراجعة» في النظام قبل الاعتماد.',
  ];
  return lines.filter(Boolean).join('\n');
};