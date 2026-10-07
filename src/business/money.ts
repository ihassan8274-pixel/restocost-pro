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
// ملاحظة: هذه طبقة رقيقة فوق الأعداد العائمة تمنع التراكم الخطأ في أكثر
// الأماكن حساسية (الجمع والضرب في نسبة والتقريب)، وتبقى لقراءة الحقول
// العشرية القديمة وللعرض. الحل الكامل — تخزين المبالغ كأعداد صحيحة
// (هللات) في حقول مزدوجة تنتهي بـ Cents — مبني أدناه في «الطبقة
// الصحيحة»: كل حساب جديد عليها يكون صحيحاً تماماً بلا تقريبٍ في الخطوات.

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

// ———— الطبقة الصحيحة (هللات) ————
//
// الدفاتر الجديدة تُحسب بأعداد صحيحة: لا خطأ تمثيل ولا تقريبٍ في كل
// خطوة. الحقول العشرية تبقى كما هي للعرض وللقراءات القديمة، وتُخزَّن
// القيم الصحيحة إلى جانبها في حقول مزدوجة تنتهي بـ Cents.

/** مبلغ عشري → هللات (عدد صحيح). القيم غير المنتهية تصفر. */
export const toCents = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  // الإبسيلون يمنع فخ 0.575×100 = 57.499… فتقرُّب 58 لا 57
  return Math.round((n + Number.EPSILON) * 100);
};

/** هللات → مبلغ عشري (للعرض والقراءات القديمة فقط). */
export const fromCents = (cents: number): number =>
  Number.isFinite(cents) ? Math.round(cents) / 100 : 0;

/** قراءة ثنائية بأولوية الصحيح: قيمة Cents إن وجدت، وإلا تحويل العشري. */
export const centsOf = (
  cents: number | null | undefined,
  decimal: number | null | undefined,
): number =>
  typeof cents === 'number' && Number.isFinite(cents)
    ? Math.round(cents)
    : toCents(typeof decimal === 'number' ? decimal : 0);

/** جمع بالهللات — لا تقريب في الخطوات، الناتج صحيح تماماً. */
export const addCents = (...amounts: number[]): number => {
  let s = 0;
  for (const n of amounts) if (Number.isFinite(n)) s += Math.round(n);
  return s;
};

/** طرح بالهللات. */
export const subCents = (a: number, b: number): number =>
  Math.round(a) - (Number.isFinite(b) ? Math.round(b) : 0);

/** كمية (قد تكون كسرية مثل 2.35 كجم) × سعر بالهللات — تقريب واحد فقط. */
export const qtyTimesCents = (qty: number, cents: number): number =>
  Math.round(qty * Math.round(cents));

/** نسبة مئوية → نقاط أساس (basis points): 0.15 → 1500. */
export const rateToBps = (rate: number): number =>
  Math.round((Number.isFinite(rate) ? rate : 0) * 10000);

/** نقاط أساس → نسبة مئوية: 1500 → 0.15. */
export const bpsToRate = (bps: number): number =>
  Math.round(bps) / 10000;

/** الضريبة فقط من مبلغ هللات: المبلغ × الأساس ÷ 10000 — تقسيم صحيح مقرّب مرة واحدة. */
export const vatOfCents = (amountCents: number, bps: number): number =>
  Math.round((Math.round(amountCents) * Math.round(bps)) / 10000);

/** مبلغ شامل الضريبة بالهللات. */
export const applyVatCents = (amountCents: number, bps: number): number =>
  Math.round(amountCents) + vatOfCents(amountCents, bps);

/** نسبة مئوية من مبلغ بالهللات (مثل خصم أو هامش): النسبة × المبلغ ÷ 100. */
export const pctOfCents = (cents: number, pct: number): number =>
  Math.round((Math.round(cents) * pct) / 100);

/** متوسط سعر وحدة بالهللات — المقام قد يكون كسرياً (كمية). */
export const avgUnitCents = (totalCents: number, qty: number): number =>
  qty ? Math.round(Math.round(totalCents) / qty) : 0;

/** تنسيق هللات للعرض: 2874 → "28.74". */
export const formatCents = (cents: number): string => {
  const c = Number.isFinite(cents) ? Math.round(cents) : 0;
  return (c / 100).toFixed(2);
};