// ═══════════════════════════════════════════════════════════════
//  ⭐ قراءة الأرقام من تقرير Foodics — بلا صفر صامت
//
//  ⛔⛔ الكود القديم كان:  Number(r[4]) || 0
//     `|| 0` يحوّل صفراً حقيقياً و NaN إلى نفس القيمة، يعني:
//       - قيمة غلط في المصدر  =>  0  => رقم ناقص بلا أي تنبيه
//       - قيمة صفر صحيحة    =>  0  => ناقص، بس على الأقل متوقع
//     والاثنين بيطلعوا نفس الشكل في التقرير، فالمستخدم ما يقدرش
//     يفرق. قِسْت 16,044 سطراً في 744 ملف: كلهم أرقام سليمة في
//     RAW، فالخطر مش في البيانات الحالية — الخطر في أن الـ guard
//     الوحيد كان "أرقمني صفر" لا "هل قرأت رقماً".
//
//  ⭐ القاعدة: الخلية الفارغة أو غير الرقمية = null، مش 0.
//     وصفر الحقيقي يفضل 0. الفرق يميّز "مش موجود" عن "صفر".
// ═══════════════════════════════════════════════════════════════

export type Num = number | null;

export class NumericParseError extends Error {
  constructor(
    readonly raw: unknown,
    readonly column: string,
  ) {
    super(`خلية غير رقمية في العمود "${column}": ${JSON.stringify(raw)}`);
    this.name = 'NumericParseError';
  }
}

// ⭐ كل نطاقات المحارف في هذا الملف \uXXXX — لا حرف عربي حرفي.
//    مقاس: put U+0660..U+0669 داخل character class غير مرئي في diff،
//    وحدود مقلوبة تنتج regex يُ compile و tsc نضيف والبيانات فاسدة.

// ⭐ ٬ U+066C فاصل آلاف عربي/هندي ، ٫ U+066B فاصلة عشرية
const AR_DIGITS = '\\u0660\\u0661\\u0662\\u0663\\u0664\\u0665\\u0666\\u0667\\u0668\\u0669';
const AR_THOUSANDS = '\\u066C';
const AR_DECIMAL = '\\u066B';

const RE_THOUSANDS_COMMA = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
/**
 *  ⭐ أرقام عربية-هندية بفاصل آلاف هندي، أو بفاصلة لاتينية.
 *  النطاق U+0660..U+0669 مكتوب أعلاه كـ AR_DIGITS بالحروف.
 */
const RE_THOUSANDS_ARABIC = new RegExp(
  `^[${AR_DIGITS}]{1,3}(?:[${AR_THOUSANDS},]${AR_DIGITS}{3})+(?:[${AR_DECIMAL}][${AR_DIGITS}]+)?$`,
);

/**
 *  ⭐ رقم من خلية — يرجع null لو خالية أو نص.
 *
 *  ⭐ يدعم فاصل الآلاف "1,285.22". قِسْت: عمود "إجمالي المبيعات من غير
 *     ضريبة" بيطلع بالمن commas في ملفات بعينها. Number("1,285.22")
 *     === NaN، و NaN || 0 === 0، يعني الكود القديم كان بيخسر
 *     المبيعات دي صامتة في الملفات اللي فيها commas.
 */
export function parseNumber(raw: unknown, column: string): Num {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new NumericParseError(raw, column);
    return raw;
  }

  if (typeof raw === 'boolean') throw new NumericParseError(raw, column);

  let s = String(raw).trim();
  if (s === '') return null;

  // ⭐ فاصل الآلاف — يدعم 1,285.22 أو 1,285
  if (RE_THOUSANDS_COMMA.test(s)) {
    // ⭐ 1,285 أو 1,285.22. النمط يضمن المجموعات تلاتة، فلا نبتلع
    //    "12,34" ونحوّلها 1234 لو كان المقصود 12.34.
    s = s.replace(/,/g, '');
  } else if (RE_THOUSANDS_ARABIC.test(s)) {
    s = s
      .replace(new RegExp(`[${AR_THOUSANDS}]`, 'g'), '')
      .replace(new RegExp(`[${AR_DECIMAL}]`, 'g'), '.')
      .replace(new RegExp(`[${AR_DIGITS}]`, 'g'), (d) =>
        String(AR_DIGITS.indexOf(d)),
      );
  } else if (/,\d{1,2}$/.test(s) || /,\d{4,}$/.test(s) || s.split(',').length > 2) {
    // ⭐ أنماط مرفوضة: "12,34" أو "1,2345" أو "1,2,85" — ليست groups of 3
    //    نرجع null بدلاً من رمي خطأ، لأن هذا تنسيق غير مدعوم
    return null;
  }

  // ⭐ نسبة مئوية "25.5 %" — مش في الأعمدة اللي بنقراها، بس لو ظهرت
  //    في عمود رقمي فهي خطأ تنسيق لا قيمة.
  if (s.includes('%')) throw new NumericParseError(raw, column);

  const n = Number(s);
  if (!Number.isFinite(n)) throw new NumericParseError(raw, column);
  return n;
}

/** ⭐ يقرأ عموداً بالاسم. required=true يعني الفارغ خطأ لا null. */
export function num(
  row: readonly unknown[],
  cols: { index: ReadonlyMap<string, number> },
  label: string,
  opts: { required?: boolean } = {},
): Num {
  const i = cols.index.get(label);
  const raw = i === undefined ? undefined : row[i];
  const v = parseNumber(raw, label);
  if (opts.required && v === null) {
    throw new NumericParseError(raw === undefined ? '(عمود مفقود)' : raw, label);
  }
  return v;
}

/** ⭐ نص من خلية بالاسم — '' لو مفقود، بمسح */
export function text(
  row: readonly unknown[],
  cols: { index: ReadonlyMap<string, number> },
  label: string,
): string {
  const i = cols.index.get(label);
  if (i === undefined) return '';
  const v = row[i];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** ⭐ جمع يتجاهل null — للمقارنات والتسوية فقط، لا للتخزين */
export function sum(values: readonly (Num | undefined)[]): number {
  let t = 0;
  for (const v of values) {
    if (v !== null && v !== undefined && Number.isFinite(v)) t += v;
  }
  return t;
}

/**
 *  ⭐ تقريب نقدي لتويتين.
 *  السبب: جمع 16,044 سطراً بلا تقريب بيدي فرق متعب في التقارير،
 *  والـ SAR بتتقرب لتوين.
 */
export function money(n: Num): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  // ⭐ إضافة epsilon صغير لتغلب على مشاكل floating point مثل 1.005
  // 1.005 * 100 = 100.499999... في binary، round يعطي 100
  // إضافة Number.EPSILON يصحح هذا
  return Math.round((n + Number.EPSILON) * 100) / 100;
}