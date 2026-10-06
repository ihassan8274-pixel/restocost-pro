// server/collection-audit.mjs — تحويل الفرق بين المجموعات إلى سطر تدقيق واحد.
//
// لماذا_diff لا تسجيل_كل_طلب:
// نقطة الكتابة تُستدعى عند كل مزامنة — قد مرات في الدقيقة. كتابة سطر لكل
// طلب تحوّل سجل التدقيق إلى ضجيج لا يقرأه أحد، وهو أسوأ من فراغه: المشرف
// يتوقف عن فتحه. فنسجّل ما يستحق:مال جديد، أو مبلغ تغيّر على سجل قائم.
//
// ما لا نُسجّله هنا (الحذف) له مساره: rcerp_deleted_ids، ويُسجَّل هناك.
// استبعاده هنا مقصود — فرّط الاحتفاظ (applyRetention) يُسقط قديم السجلات
// دائماً، فلو حسبناه حذفاً لامتلأ السجل بـ«حذف» كاذب كل يوم.
//
// الدوال هنا خالصة بلا I/O، تُختبر وحدها.

import { isMoneyKey } from './record-guard.mjs';

// عدد التغييرات المُدرجة في سطر واحد. تجاوزها يُختصر بالعدد لا تُقطع قائمة.
const MAX_LISTED = 12;

const shortId = (id) => String(id).slice(0, 24);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : v);

/** يجمع حقول المال التي تختلف بين نسختين من السجل. */
const moneyDeltas = (before, after) => {
  const out = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (!isMoneyKey(k)) continue;
    const a = before[k];
    const b = after[k];
    if (a === b) continue;
    // قفزة واحدة (0 ← 5000) تهمّي، وألفُ قفزة صغيرة تجمع إلى فرق جرد
    if (typeof a !== 'number' && typeof b !== 'number') continue;
    out.push(`${k}: ${num(a) ?? '—'} ← ${num(b) ?? '—'}`);
  }
  return out;
};

const hasMoney = (rec) => Object.keys(rec).some(isMoneyKey);

/**
 * يلخّص ما تغيّر بين نسختين من مجموعة.
 * @returns {null | { action: string, detail: string }}
 *   null = لا تغيير يستحق التدقيق (وهو غالباً: المزامنة تكرر بلا جديد)
 */
export const summarizeChange = ({ key, before, after }) => {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;

  const beforeMap = new Map();
  for (const r of before) if (r && r.id !== undefined) beforeMap.set(r.id, r);

  const created = [];
  const createdMoney = [];
  const modified = [];

  for (const r of after) {
    if (!r || r.id === undefined) continue;
    const prev = beforeMap.get(r.id);
    if (!prev) {
      created.push(shortId(r.id));
      if (hasMoney(r)) createdMoney.push(`${shortId(r.id)}=${num(r.totalAmount ?? r.total ?? r.amount)}`);
      continue;
    }
    const deltas = moneyDeltas(prev, r);
    if (deltas.length) modified.push(`${shortId(r.id)} [${deltas.join('، ')}]`);
  }

  if (!created.length && !modified.length) return null;

  const parts = [];
  if (created.length) {
    parts.push(`جديد ${created.length}${created.length > MAX_LISTED ? '' : `: ${created.slice(0, MAX_LISTED).join(', ')}`}`);
  }
  if (createdMoney.length) {
    parts.push(`بمبالغ ${createdMoney.slice(0, MAX_LISTED).join('، ')}`);
  }
  if (modified.length) {
    parts.push(`تعديل مبلغ ${modified.length}: ${modified.slice(0, MAX_LISTED).join(' | ')}`);
  }

  // الإجراء يُقرأ في واجهة التدقيق؛ نُبقيه ثابتاً وقابلاً للتجميع
  const action = modified.length && !created.length ? 'DATA_MONEY_EDIT' : 'DATA_WRITE';
  return { action, detail: `${key} — ${parts.join(' · ')}` };
};

/** سطر تدقيق لحذف نهائي عبر rcerp_deleted_ids. */
export const summarizeDelete = ({ key, ids }) => {
  const n = Array.isArray(ids) ? ids.length : 0;
  if (!n) return null;
  const listed = Array.isArray(ids) ? ids.slice(0, MAX_LISTED).map(shortId).join(', ') : '';
  return {
    action: 'DATA_DELETE',
    detail: `${key} — حذف نهائي ${n}${n <= MAX_LISTED ? `: ${listed}` : ''}`,
  };
};
