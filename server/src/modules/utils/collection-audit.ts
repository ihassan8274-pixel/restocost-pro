// server/src/modules/utils/collection-audit.ts — تحويل الفرق بين المجموعات إلى سطر تدقيق واحد.
//
// لماذا _diff لا تسجيل_كل_طلب:
// نقطة الكتابة تُستدعى عند كل مزامنة — قد مرات في الدقيقة. كتابة سطر لكل
// طلب تحوّل سجل التدقيق إلى ضجيج لا يقرأه أحد، وهو أسوأ من فراغه: المشرف
// يتوقف عن فتحه. فنسجّل ما يستحق:مال جديد، أو مبلغ تغيّر على سجل قائم.
//
// ما لا نُسجّله هنا (الحذف) له مساره: rcerp_deleted_ids، ويُسجَّل هناك.
// استبعاده هنا مقصود — فرّط الاحتفاظ (applyRetention) يُسقط قديم السجلات
// دائماً، فلو حسبناه حذفاً لامتلأ السجل بـ«حذف» كاذب كل يوم.
//
// الدوال هنا خالصة بلا I/O، تُختبر وحدها.

import { isMoneyKey } from './record-guard.js';

// عدد التغييرات المُدرجة في سطر واحد. تجاوزها يُختصر بالعدد لا تُقطع قائمة.
const MAX_LISTED = 12;

const shortId = (id: unknown): string => String(id).slice(0, 24);
const num = (v: unknown): number | string =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : (v as string | number);

/** يجمع حقول المال التي تختلف بين نسختين من السجل. */
const moneyDeltas = (before: Record<string, unknown>, after: Record<string, unknown>): string[] => {
  const out: string[] = [];
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

const hasMoney = (rec: Record<string, unknown>): boolean => Object.keys(rec).some(isMoneyKey);

interface ChangeSummary {
  action: string;
  detail: string;
}

/**
 * يلخّص ما تغيّر بين نسختين من مجموعة.
 * @returns null | ChangeSummary
 *   null = لا تغيير يستحق التدقيق (وهو غالباً: المزامنة تكرر بلا جديد)
 */
export const summarizeChange = ({
  key,
  before,
  after,
}: {
  key: string;
  before: unknown[];
  after: unknown[];
}): ChangeSummary | null => {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;

  const beforeMap = new Map<unknown, unknown>();
  for (const r of before) if (r && typeof r === 'object' && 'id' in r && r.id !== undefined) beforeMap.set(r.id, r);

  const created: string[] = [];
  const createdMoney: string[] = [];
  const modified: string[] = [];

  for (const r of after) {
    if (!r || typeof r !== 'object' || !('id' in r) || r.id === undefined) continue;
    const prev = beforeMap.get(r.id);
    if (!prev) {
      created.push(shortId(r.id));
      const moneyVal = (r as Record<string, unknown>).totalAmount ?? (r as Record<string, unknown>).total ?? (r as Record<string, unknown>).amount;
      if (hasMoney(r as Record<string, unknown>)) createdMoney.push(`${shortId(r.id)}=${num(moneyVal)}`);
      continue;
    }
    const deltas = moneyDeltas(prev as Record<string, unknown>, r as Record<string, unknown>);
    if (deltas.length) modified.push(`${shortId(r.id)} [${deltas.join('، ')}]`);
  }

  if (!created.length && !modified.length) return null;

  const parts: string[] = [];
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
export const summarizeDelete = ({
  key,
  ids,
}: {
  key: string;
  ids: unknown[];
}): ChangeSummary | null => {
  const n = Array.isArray(ids) ? ids.length : 0;
  if (!n) return null;
  const listed = Array.isArray(ids) ? ids.slice(0, MAX_LISTED).map(shortId).join(', ') : '';
  return {
    action: 'DATA_DELETE',
    detail: `${key} — حذف نهائي ${n}${n <= MAX_LISTED ? `: ${listed}` : ''}`,
  };
};