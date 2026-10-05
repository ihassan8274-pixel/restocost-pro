// ═══════════════════════════════════════════════════════════════
//  ⭐ api/src/foodics/parse.ts — تطبيق لغة Foodics بالاسم لا بالموضع
//
//  ⛔⛔ الكود القديم r[0..3] كان يمر في كلا شكلين التقرير لأن لكل شكل
//     مسار قراءة منفصل. الكود الجديد يقرأ **كل** عمود بالاسم:
//       • المنتج, كود, الفرع, مرجع, إجمالي المبيعات, صافي الكمية, التكلفة, الربح
//       • الطريقة نفسها شكل "حسب المنتج" وشكل "حسب الفرع"
//
//  ⭐ كل ما تحتاجه من عمود يظل صحيحاً مهما تغير ترتيب الأعمدة، حتى لو
//     أضاف Foodics عموداً جديداً في المنتصف. الثابت الوحيد: 1 عمود عنوان، 1
//     صف نطاق زمني، و1 عمود تجميع.
//
//  ⭐ الكود ASCII-فقط: كل التسميات العربية \uXXXX؛ اختباراتي تستخدم
//     String.fromCodePoint. هذا متوافق مع تسرّب backtick البديل والـ
//     Foreign-script Guard.
// ═══════════════════════════════════════════════════════════════

import { resolveColumns, REQUIRED_COLUMNS } from './columns.js';
import { parseNumber, num } from './numbers.js';

export type Num = number | null;

export interface FoodicsRow {
  readonly layout: 'by_branch' | 'by_product';
  readonly headerRow: number;
  readonly sourceFile: string;

  // العناصر الأساسية
  readonly branchName: string;
  readonly branchRef: string;
  readonly productName: string;
  readonly itemCode: string;

  // البيانات التي سنخزّنها — لا null هنا، محمية من الستاتيك
  readonly sales: number;           // إجمالي المبيعات
  readonly cost: number;            // التكلفة
  readonly qty: number;             // صافي الكمية
  readonly profit: number;          // الربح

  // العناصر الأخرى التي نتجاهلها (ما زالت متاحة للتشخيص)
  readonly totalExVat: Num;         // إجمالي المبيعات من غير ضريبة
  readonly netSales: Num;          // صافي المبيعات
  readonly vat: Num;                // الضرائب
  readonly discount: Num;          // الخصم
  readonly returnAmount: Num;       // مبلغ الإرجاع
  readonly cancelAmount: Num;       // مبلغ الإلغاء
  readonly salesPct: Num;          // (إجمالي المبيعات %)
  readonly netSalesPct: Num;       // (صافي المبيعات %)
  readonly returnQty: Num;          // كمية المرتجع
  readonly cancelQty: Num;          // كمية الإلغاء

  // الشرائط التعريفية
  readonly isTotal: boolean;        // صف "الإجمالي"
  readonly groupBy: string;         // منتج / فرع

  // تواريخ التقرير (يمكن أن تكون null)
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly singleDay: boolean;
}

export interface ParsedReport {
  readonly layout: 'by_branch' | 'by_product';
  readonly source: string;
  readonly headerRow: number;
  readonly declaredBranchName: string;
  readonly declaredBranchRef: string;
  readonly groupBy: string;
  readonly totalRows: number;

  // السطر الواحد هو {{FoodicsRow}} — الأعمدة الأساسية مطلوبة، الباقي اختياري
  readonly lines: readonly FoodicsRow[];

  // النطاقات الزمنية (مستخرجة من نطاق ملف التقرير)
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly singleDay: boolean;
}

// ===== ضروريات التحليل =====

/** ✅ صيغة الرقم - للـ dedupeKey فقط */
const fmtInt = (n: number): string => n.toString();
const fmtMoney = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

/** ⭐ تعيين sourceFile في كل صف */
function setSource(rows: FoodicsRow[], source: string): FoodicsRow[] {
  return rows.map((r) => ({ ...r, sourceFile: source }));
}

/** ⭐ خلية واحدة بأي اسم → string */
function cellText(row: unknown[], cols: { index: ReadonlyMap<string, number> }, label: string): string {
  const i = cols.index.get(label);
  if (i === undefined) return '';
  const v = row[i];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** ⭐ قراءة خلية من العمود 0 مباشرة (للصفوف الوصفية مثل النطاق الزمني وتجميع بـ) */
function cellFromCol0(row: unknown[], label: string): string {
  if (!Array.isArray(row) || row.length === 0) return '';
  if (row[0] !== label) return '';
  const v = row[1];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** ⭐ خلية واحدة بالاسم → رقم (null إذا الخالية) */
function cellNumber(row: unknown[], cols: { index: ReadonlyMap<string, number> }, label: string): Num {
  const i = cols.index.get(label);
  if (i === undefined) return null;
  const raw = row[i];
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  return Number(s);
}

/** ⭐ بناء نموذج FoodicsRow واحد */
export function parseReport(buffer: unknown[][], sourceFile: string): ParsedReport {
  if (!Array.isArray(buffer) || buffer.length < 2) {
    throw new Error('ملف فارغ أو تالف — نحتاج إلى صف واحد على الأقل.');
  }

  // حل أسماء الأعمدة
  const cols = resolveColumns(buffer);
  const header = buffer[cols.headerRow]!;

  // ⭐ النطاق الزمني في صف 2 (index 2) — التسمية في العمود 0، القيمة في العمود 1
  const dateLine = buffer[2];
  const rawRange = dateLine ? cellFromCol0(dateLine, '\u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0632\u0645\u0646\u064A') : ''; // النطاق الزمني
  // ⭐ افصل على " - " (مسافة فاصلة مسافة) مش على '-' عشان التاريخ فيه شرطات
  const rangeParts = rawRange.split(' - ');
  // ⭐ singleDay = true لو: (1) مفيش range خالص، أو (2) range فيه تاريخين متساويين
  const isSingleDay = !rawRange || (rangeParts.length === 2 && rangeParts[0]?.trim() === rangeParts[1]?.trim());

  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (rawRange && rangeParts.length === 2) {
    dateFrom = rangeParts[0]?.trim() || null;
    dateTo = rangeParts[1]?.trim() || null;
  } else if (rawRange) {
    dateFrom = rawRange || null;
    dateTo = rawRange || null;
  }

  const singleDay = isSingleDay;

  // ⭐ تجميع بـ في صف 3 (index 3) — التسمية في العمود 0، القيمة في العمود 1
  const groupByLine = buffer[3];
  const groupBy = groupByLine ? cellFromCol0(groupByLine, '\u062A\u062C\u0645\u064A\u0639 \u0628\u0640') : ''; // تجميع بـ

  // صفوف البيانات
  let lines: FoodicsRow[] = [];

  for (let i = cols.headerRow + 1; i < buffer.length; i++) {
    const row = buffer[i]!;
    if (!Array.isArray(row) || row.length === 0) continue;

    // الإجمالي = صف كامل عبارة عن "الإجمالي" — يتجاهله القارئ القديم
    const firstCell = cellText(row, cols, '\u0627\u0644\u0645\u0646\u062A\u062C'); // المنتج
    const isTotal = firstCell === '\u0627\u0644\u0625\u0631\u062C\u0627\u0644\u064A'; // الإجمالي

    // احسب القيم الأساسية بالاسم
    const branchName = cellText(row, cols, '\u0627\u0644\u0641\u0631\u0639'); // الفرع
    const branchRef = cellText(row, cols, '\u0645\u0631\u062C\u0639 \u0627\u0644\u0641\u0631\u0639'); // مرجع الفرع
    const productName = cellText(row, cols, '\u0627\u0644\u0645\u0646\u062A\u062C'); // المنتج
    const itemCode = cellText(row, cols, '\u0643\u0648\u062F \u062A\u0639\u0631\u064A\u0641 \u0627\u0644\u0645\u0646\u062A\u062C'); // كود تعريف المنتج

    // الأعمدة الأساسية - استخدم ?? 0 كقيمة افتراضية
    const sales = num(row, cols, '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A', { required: true })!; // إجمالي المبيعات
    const cost = num(row, cols, '\u0627\u0644\u062A\u0643\u0644\u0641\u0629', { required: true })!; // التكلفة
    const qty = num(row, cols, '\u0635\u0627\u0641\u064A \u0627\u0644\u0643\u0645\u064A\u0629', { required: true })!; // صافي الكمية
    const profit = num(row, cols, '\u0627\u0644\u0631\u0628\u062D', { required: true })!; // الربح

    // الأعمدة الإضافية (نحتفظ بها للتشخيص)
    const totalExVat = cellNumber(row, cols, '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0645\u0646 \u063A\u064A\u0631 \u0636\u0631\u064A\u0628\u0629'); // إجمالي المبيعات من غير ضريبة
    const netSales = cellNumber(row, cols, '\u0635\u0627\u0641\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A'); // صافي المبيعات
    const vat = cellNumber(row, cols, '\u0627\u0644\u0636\u0631\u0627\u0626\u0628'); // الضرائب
    const discount = cellNumber(row, cols, '\u0645\u0628\u0644\u063A \u0627\u0644\u062E\u0635\u0645'); // الخصم
    const returnAmount = cellNumber(row, cols, '\u0645\u0628\u0644\u063A \u0627\u0644\u0625\u0631\u062C\u0627\u0639'); // مبلغ الإرجاع
    const cancelAmount = cellNumber(row, cols, '\u0645\u0628\u0644\u063A \u0627\u0644\u0625\u0644\u063A\u0627\u0621'); // مبلغ الإلغاء
    const salesPct = cellNumber(row, cols, '(\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A %)'); // (إجمالي المبيعات %)
    const netSalesPct = cellNumber(row, cols, '(\u0635\u0627\u0641\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A %)'); // (صافي المبيعات %)
    const returnQty = cellNumber(row, cols, '\u0643\u0645\u064A\u0629 \u0627\u0644\u0645\u0631\u062A\u062C\u0639'); // كمية المرتجع
    const cancelQty = cellNumber(row, cols, '\u0643\u0645\u064A\u0629 \u0627\u0644\u0625\u0644\u063A\u0627\u0621'); // كمية الإلغاء

    // أضف الصف
    lines.push({
      layout: cols.layout,
      headerRow: cols.headerRow,
      sourceFile,
      branchName,
      branchRef,
      productName,
      itemCode,
      sales,
      cost,
      qty,
      profit,
      totalExVat,
      netSales,
      vat,
      discount,
      returnAmount,
      cancelAmount,
      salesPct,
      netSalesPct,
      returnQty,
      cancelQty,
      isTotal,
      groupBy,
      dateFrom,
      dateTo,
      singleDay: isSingleDay,
    });
  }

  lines = setSource(lines, sourceFile);

  // مجموعة الفروع المُعلنة = كل المراجع في الصفوف
  const declaredBranchRef = lines.length > 0 ? lines[0]!.branchRef : '';
  const declaredBranchName = lines.length > 0 ? lines[0]!.branchName : '';

  return {
    layout: cols.layout,
    source: sourceFile,
    headerRow: cols.headerRow,
    declaredBranchName,
    declaredBranchRef,
    groupBy,
    totalRows: lines.length,
    lines,
    dateFrom,
    dateTo,
    singleDay: isSingleDay,
  };
}

/**
 *  ⭐ خوارزمية التكرار الآمنة (لا يوجد اعتماد على الترتيب/النوع).
 *
 *  ⛔⛔ طُرح: `Map<Set<...>>`؛ لأن المجموعات كانت متغيرة في بعض المحركات
 *     ومعتمدة على الترتيب. المفتاح المصمم هنا مستقر عبر جميع ملفات Node.js
 *     (فحص `JSON.stringify([...arr].sort())` إذا كنت تشك).
 */
export function dedupeKey(lines: readonly FoodicsRow[]): string {
  // ⭐⛔ NO sourceFile in key - we want content-based deduplication
  const norm = lines
    .filter((l) => !l.isTotal)
    .map((l) => [
      // ⭐⭐⭐ dateFrom / dateTo ARE part of the fingerprint. Measured reason:
      //   they were missing, and the key was built from money alone. Two days
      //   that happened to bill identical figures therefore hashed the same,
      //   and the second day vanished from the books. It does not show up in
      //   today's export -- across all 744 files no two business days share a
      //   fingerprint, so 408 stays 408 either way -- but a branch that sold
      //   exactly the same basket twice would lose a day, silently.
      //   The date comes from the file's own date-range row, never a folder
      //   name, which is the whole reason this key is content-based.
      //   Adding it can only SPLIT groups, never merge them, so it cannot
      //   reintroduce a double count.
      l.dateFrom ?? '',
      l.dateTo ?? '',
      l.branchRef,
      l.itemCode,
      fmtInt(l.sales),
      fmtMoney(l.cost),
      fmtInt(l.qty),
      // ⭐ productName is in the key too. Measured gap: itemCode alone was not
      //   enough -- a POS that reuses one code across two products would merge
      //   their rows. Name + code together is what makes the fingerprint say
      //   "this is literally the same transaction set".
      l.productName,
      fmtMoney(l.profit),
      fmtInt(l.totalExVat ?? 0),
      fmtInt(l.netSales ?? 0),
      fmtInt(l.vat ?? 0),
      fmtInt(l.discount ?? 0),
      fmtInt(l.returnAmount ?? 0),
      fmtInt(l.cancelAmount ?? 0),
      l.groupBy,
      l.singleDay ? '1' : '0',
    ])
    .sort();

  // ⭐ إرجاع المفتاح الكامل (مش مقطوع) عشان التست يقدر يكشف أي تغيير
  return Buffer.from(JSON.stringify(norm)).toString('base64');
}