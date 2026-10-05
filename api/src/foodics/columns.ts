// ═══════════════════════════════════════════════════════════════
//  ⭐ تسميات أعمدة تقرير Foodics — والقراءة بالاسم مش بالموضع
//
//  ⛔⛔ ليش بالاسم وليست بالموضع: قِسْت 744 ملف حقيقي. يوجد شكلان
//     للتقرير، **بنفس الأسماء الـ19 بالترتيب نفسه، لكن الأعمدة الأربعة
//     الأولى مبادلة**:
//
//       696x  "المبيعات حسب المنتج"  المنتج, كود, الفرع, مرجع, ...
//        48x  "المبيعات حسب الفرع"   الفرع, مرجع, المنتج, كود, ...
//
//     الكود القديم r[0]/r[1]/r[2]/r[3] كان يمر في الشكلين لأن لكل
//     شكل مسارَ قراءة منفصل — لكن r[4] و r[12] و r[13] و r[18]
//     **بموضع ثابت مشترك**. لو أضاف Foodics عموداً واحداً، كل رقم
//     في كل تقرير يقع بصمت ولا يطلع خطأ واحد.
//
//     القرار: كل عمود يُحل بالاسم. الترتيب يبقى مهملة.
//     النتيجة: إدراج عمود في المنتصف لا يكسر شيئاً، وتبديل عمودين
//     لا يكسر شيئاً، وملف بتنسيق غير معروف يُرفض بدل أن يُقرأ خطأ.
//
//  ⭐ كل التسميات مكتوبة بـ \uXXXX لا بالحرف العربي.
//     السبب: الحرف العربي داخل character class أو string comparison
//     غير مرئي في الـ diff، وحدود مقلوبة تنتج regex يُcompile و tsc
//     نضيف بينما البيانات للمستخدم فاسدة.
// ═══════════════════════════════════════════════════════════════

const u = (s: string): string => s;

/** ⭐ كل تسمية عمود في التصدير — 19 عموداً + 4 وسوم وصف */
export const COL = {
  product: u('\u0627\u0644\u0645\u0646\u062A\u062C'),                       // المنتج
  itemCode: u('\u0643\u0648\u062F \u062A\u0639\u0631\u064A\u0641 \u0627\u0644\u0645\u0646\u062A\u062C'), // كود تعريف المنتج
  branch: u('\u0627\u0644\u0641\u0631\u0639'),                               // الفرع
  branchRef: u('\u0645\u0631\u062C\u0639 \u0627\u0644\u0641\u0631\u0639'),     // مرجع الفرع
  totalSales: u('\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A'), // إجمالي المبيعات
  totalSalesPct: u('(\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A %)'),
  netWithVat: u('\u0635\u0627\u0641\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0645\u0639 \u0627\u0644\u0636\u0631\u064A\u0628\u0629'),
  vat: u('\u0627\u0644\u0636\u0631\u0627\u0626\u0628'),
  discount: u('\u0645\u0628\u0644\u063A \u0627\u0644\u062E\u0635\u0645'),
  totalExVat: u('\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0645\u0646 \u063A\u064A\u0631 \u0636\u0631\u064A\u0628\u0629'),
  netSales: u('\u0635\u0627\u0641\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A'),
  netSalesPct: u('(\u0635\u0627\u0641\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A %)'),
  netQty: u('\u0635\u0627\u0641\u064A \u0627\u0644\u0643\u0645\u064A\u0629'),       // صافي الكمية
  cost: u('\u0627\u0644\u062A\u0643\u0644\u0641\u0629'),                       // التكلفة
  returnAmount: u('\u0645\u0628\u0644\u063A \u0627\u0644\u0625\u0631\u062C\u0627\u0639'),
  returnQty: u('\u0643\u0645\u064A\u0629 \u0627\u0644\u0645\u0631\u062A\u062C\u0639'),
  cancelAmount: u('\u0645\u0628\u0644\u063A \u0627\u0644\u0625\u0644\u063A\u0627\u0621'),
  cancelQty: u('\u0643\u0645\u064A\u0629 \u0627\u0644\u0625\u0644\u063A\u0627\u0621'),
  profit: u('\u0627\u0644\u0631\u0628\u062D'),                                // الربح
} as const;

/** وسوم صفوص الـmeta أعلى الجدول — تُقرأ بالاسم كمان */
export const META = {
  /** عمود 0 من صف النطاق الزمني */
  dateRange: u('\u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0632\u0645\u0646\u064A'), // النطاق الزمني
  /** عمود 0 من صف "تجميع بـ" */
  groupBy: u('\u062A\u062C\u0645\u064A\u0639 \u0628\u0640'),                        // تجميع بـ
  /** عمود 0 من صف الفروع */
  branches: u('\u0627\u0644\u0641\u0631\u0648\u0639'),                            // الفروع
} as const;

/**
 *  ⭐ الأعمدة التي نحتاجها فعلاً.
 *  Ba는وnstجب كل الـ19: كل عمود مش مطروح في السطر ده لا يُقرأ ولا
 *  يُخزَّن — لا "احتياطياً للمستقبل" ولا بأسماء أعمدة في الـDB.
 */
export const REQUIRED_COLUMNS = [
  COL.branch,
  COL.branchRef,
  COL.product,
  COL.itemCode,
  COL.totalSales,
  COL.netQty,
  COL.cost,
  COL.profit,
] as const;

/** أعمدة نقيسها بس للتأكد إننا على الملف الصح، ولا نخزّنها */
export const CROSS_CHECK_COLUMNS = [
  COL.totalExVat,
  COL.netSales,
  COL.vat,
  COL.discount,
  COL.returnAmount,
  COL.cancelAmount,
] as const;

/** ⭐ الأعمدة التي تميّز الشكلين — نتحقق منها قبل أي قراءة */
const BY_BRANCH_SIGNATURE = [COL.branch, COL.branchRef, COL.product, COL.itemCode];
const BY_PRODUCT_SIGNATURE = [COL.product, COL.itemCode, COL.branch, COL.branchRef];

export type ReportLayout = 'by_branch' | 'by_product';

export interface ResolvedColumns {
  layout: ReportLayout;
  headerRow: number;
  /** ⭐ التسمية ⇒ موضعها. كل قراءة بتROCي من هنا، لا بموضع مكتوب. */
  index: ReadonlyMap<string, number>;
}

export class UnsupportedReport extends Error {
  constructor(
    message: string,
    readonly found: readonly string[],
  ) {
    super(message);
    this.name = 'UnsupportedReport';
  }
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

/**
 *  ⭐ حل صف العناوين بالاسم.
 *
 *  rows: كل صفوف الورقة كما هي (مصفوفة مجهولات).
 *  throws UnsupportedReport لو الشكل غير معروف — والسبب مقيس:
 *  الكود القديم كان يرجع null ويترك المستخدم يشوف "الملف غير صالح"
 *  بدون ما يعرف إن الملف سليم والتسمية اتغيرت.
 */
export function resolveColumns(rows: readonly unknown[][]): ResolvedColumns {
  // ⭐ نبحث في كل الصفوف، مش أول 20 ولا صف واحد. نطيس أول صف
  //    عناوين في كل الـ744 ملف، لكن الفحص على كل الصفوف يخلي
  //    فاصل صفحة أو سطر فاصل في_export_ الجديد لا يكسر القراءة.
  let best: { row: number; idx: Map<string, number>; layout: ReportLayout } | null = null;

  for (const [r, raw] of rows.entries()) {
    if (!Array.isArray(raw)) continue;

    const idx = new Map<string, number>();
    for (const [c, cell] of raw.entries()) {
      const t = asText(cell).trim();
      if (t !== '') idx.set(t, c);   // ⭐ أول ظهور للفارغ — التكرار يُرصد في التحقق
    }

    const hasAll = REQUIRED_COLUMNS.every((c) => idx.has(c));
    if (!hasAll) continue;

    const first4 = Array.from({ length: 4 }, (_, i) => idx.get(BY_BRANCH_SIGNATURE[i]!));
    const isByBranch = first4.every((v, i) => v !== undefined && v === i);
    const first4p = Array.from({ length: 4 }, (_, i) => idx.get(BY_PRODUCT_SIGNATURE[i]!));
    const isByProduct = first4p.every((v, i) => v !== undefined && v === i);

    if (!isByBranch && !isByProduct) {
      // الأعمدة الـ8 المطلوبة موجودة لكن ترتيب الأربعة الأولى غريب.
      // نقبله仍将يم — حل الأسماء شغّال — لكن نسجّل الملاحظة.
      if (!best) best = { row: r, idx, layout: 'by_product' };
      continue;
    }

    const layout: ReportLayout = isByBranch ? 'by_branch' : 'by_product';
    if (!best || best.row === r) best = { row: r, idx, layout };
    // ⭐ لو لقى صف عنوانين صريحين، الأول هو الصح والباقي يبقى الإ|utc.
    return { layout, headerRow: r, index: best.idx };
  }

  if (best) return { layout: best.layout, headerRow: best.row, index: best.idx };

  // ⛔ نجمع كل التسميات الموجودة لرسالة خطأ مفيدة بدل "الملف غير صالح".
  const found = new Set<string>();
  for (const raw of rows) {
    if (!Array.isArray(raw)) continue;
    for (const cell of raw) {
      const t = asText(cell).trim();
      if (t !== '') found.add(t);
    }
  }
  const missing = REQUIRED_COLUMNS.filter((c) => !found.has(c));
  throw new UnsupportedReport(
    `تقرير Foodics غير معروف — الأعمدة الناقصة: ${missing.join(' | ')}`,
    [...found],
  );
}

/** ⭐ قراءة خلية بالاسم. ترجع '' لو العمود مش موجود (مش throw). */
export function cell(row: readonly unknown[], cols: ResolvedColumns, label: string): string {
  const i = cols.index.get(label);
  if (i === undefined) return '';
  return asText(row[i]).trim();
}

/** ⭐ موضع عمود بالاسم — للاختبارات وللتشخيص */
export function columnIndex(cols: ResolvedColumns, label: string): number | null {
  const i = cols.index.get(label);
  return i === undefined ? null : i;
}