// استخراج منطق "أي معرّفات اختفت" إلى وحدة نقية قابلة للاختبار، لأن
// collectionSources.ts يهيّئ كل الستورات عند الاستيراد (أثر جانبي) ولا يصلح
// للاختبار المباشر.

/**
 * قائمة سجلات كائنية؟ تُفحص كل العناصر لا أول واحد: القائمة الفارغة تُعد
 * كائنية حتى يُنتج حذفُ كل السجلات شواهد لكل معرّف (وهو أشيع حالة حذف).
 * القائمة التي فيها عنصر نصي/رقمي (acknowledgedAlertIds، closedMonths) تُرفض
 * كلها، فلا يُشتق منها شاهد حذف من عنصر يحمل قيمة لا معرّف.
 */
export const isRecordArray = (v: unknown): v is { id?: unknown }[] =>
  Array.isArray(v) && v.every((r) => !!r && typeof r === 'object');

export const idsOf = (arr: { id?: unknown }[]): string[] => {
  const out: string[] = [];
  for (const r of arr) if (r && r.id !== undefined) out.push(String(r.id));
  return out;
};

/**
 * المعرّفات الموجودة في prev وغير موجودة في cur — أي ما حُذف محلياً.
 * تُستدعى فقط على تعديلات محلية (تعديلات الخادم محمية بـ isApplying)،
 * فالفرق يعني حذفاً حقيقياً لا إعادة تحميل.
 */
export const removedIdsBetween = (prev: unknown, cur: unknown): string[] => {
  if (!isRecordArray(prev) || !isRecordArray(cur)) return [];
  const kept = new Set(idsOf(cur));
  return idsOf(prev).filter((id) => !kept.has(id));
};
