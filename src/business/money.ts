// src/business/money.ts — عمليات آمنة على المبالغ المالية.
//
// المشكلة: JavaScript لا يستطيع تمثيل الكسور العشرية بدقة.
//   0.1 + 0.2 === 0.30000000000000004  (ليس 0.3)
//   8.33 * 3 * 1.15 === 28.7385        (ليس 28.74)
//
// في نظام محاسبي، هذا ليس خطأً في العرض — خطأ في الدفاتر. مبلغ يُخزَّن
// كـ 28.7385 يتراكم عبر آلاف السطور، فيظهر فرق جرد لا يفسّره أحد.
//
// الحل: كل عملية على مبلغ تمرّ عبر دوال هنا. الدوال تُجري الحساب ثم
// تُقرّب النتيجة إلى منزلتين عشريتين باستخدام تقريب مصرفي (banker's
// rounding) — وليس toFixed() الذي يُرجع نصاً ويُخطئ في الحالات الحدية.
//
// ملاحظة: هذه طبقة رقيقة فوق الأعداد العائمة. الحل الكامل هو تخزين
// المبالغ كأعداد صحيحة (هللات) — مشروع أكبر. هذه الطبقة تمنع التراكم
// الخطأ في أكثر الأماكن حساسية: الجمع، والضرب في نسبة، والتقريب.

/** تقريب مصرفي إلى منزلتين عشريتين. يُرجع رقماً لا نصاً. */
export const roundMoney = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  // نضرب في 100 ونقرّب ثم نقسم — هكذا نتجنب خطأ التمثيل العائم
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

/** جمع آمن: يمنع التراكم الخطأ. */
export const addMoney = (...amounts: number[]): number =>
  roundMoney(amounts.reduce((s, a) => s + a, 0));

/** طرح آمن. */
export const subMoney = (a: number, b: number): number => roundMoney(a - b);

/** ضرب آمن في عدد صحيح أو عائم. */
export const mulMoney = (a: number, b: number): number => roundMoney(a * b);

/** ضرب في نسبة مئوية (مثل 1.15 لضريبة 15%). */
export const applyVat = (amount: number, rate: number): number =>
  roundMoney(amount * (1 + rate));

/** حساب الضريبة فقط (المبلغ × النسبة). */
export const vatOf = (amount: number, rate: number): number =>
  roundMoney(amount * rate);

/** قسمة آمنة (للمبالغ الوحدية). */
export const divMoney = (a: number, b: number): number =>
  b === 0 ? 0 : roundMoney(a / b);

/** تنسيق للعرض: يُرجع نصاً بمنزلتين عشريتين. */
export const formatMoney = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toFixed(2);

/** هل المبلغ صفري فعلاً (بعد التقريب)؟ */
export const isZero = (n: number): boolean => roundMoney(n) === 0;

/** مقارنة آمنة: هل المبلغان متساويان بعد التقريب؟ */
export const moneyEquals = (a: number, b: number): boolean =>
  roundMoney(a) === roundMoney(b);
