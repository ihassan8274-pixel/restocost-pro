// ==========================================================
// ReportTypes.ts — العقد الموحّد لمحرك التقارير المركزي
//
// ملاحظة: هذا الملف يجمع جيلين من العقد.
//
// ١) العقد الكامل (ReportFilter / ReportResult / ReportTableData
//    وinRange وgroupCount وsumField وpct) — تقرأه ٢٣ ملفاً متتبَّعاً
//    في src/components/reports/ وهو أساس محرك التقارير القائم.
//
// ٢) عقد الإعداد الجديد (ReportType / ReportConfig / ReportData)
//    — تقرأه ملفات التقارير المُعدَّة حديثاً.
//
// ambos معاً بلا تعارض أسماء: التصديران منفصلان تماماً.
// ==========================================================

// ==========================================================
// (١) العقد الكامل — محرك التقارير
// ==========================================================

export type TimeRange = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'all';

export interface ReportFilter {
  from: string;       // YYYY-MM-DD — فارغ = غير مفعّل
  to: string;         // YYYY-MM-DD — فارغ = غير مفعّل
  branchIds: string[]; // فارغ = كل الفروع
  statuses: string[];  // فارغ = كل الحالات
  search?: string;
}

export const emptyReportFilter = (): ReportFilter => ({ from: '', to: '', branchIds: [], statuses: [], search: '' });

export type CellValue = string | number | null | undefined;

export type CellTone = 'default' | 'positive' | 'negative' | 'warn' | 'accent';

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  /** التنسيق الاختياري — إن غاب يُطبَّق تنسيق افتراضي حسب نوع القيمة */
  format?: (v: CellValue) => string;
  /** عتبة لونية تعتمد على حالة القيمة (مثلاً أرصدة سالبة) */
  tone?: 'auto-money' | 'auto-percent';
  /** عنوان إجمالي العمود إن كان قابلاً للتجميع */
  aggregate?: 'sum' | 'none';
}

export interface ReportSummaryItem {
  key: string;
  label: string;
  value: CellValue;
  hint?: string;
  tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'indigo';
  format?: (v: CellValue) => string;
}

export interface ReportRow {
  id: string;
  values: Record<string, CellValue>;
}

export interface ReportTableData {
  columns: ReportColumn[];
  rows: ReportRow[];
  /** صف إجمالي اختياري يُعرض أسفل الجدول */
  totals?: Record<string, CellValue>;
  /** صف صفرية يُعرض عند عدم وجود بيانات */
  emptyText?: string;
}

export interface ReportResult {
  id: string;
  title: string;
  subtitle?: string;
  summaries: ReportSummaryItem[];
  tables: ReportTableData[];
  /** بيانات التصدير (Excel/CSV/Print) — header + rows جاهزة */
  exportSheets: ReportSheet[];
  /** تاريخ إنشاء التقرير */
  generatedAt: string;
}

export interface ReportSheet {
  name: string;
  header: string[];
  rows: (string | number)[][];
}

export interface ReportDefinition {
  id: string;
  title: string;
  subtitle?: string;
}

// ==========================================================
// دوال مساعدة للمحرك (تُصدَّر للاستخدام المشترك)
// ==========================================================

/** دمية: هل التاريخ ضمن نطاق [from, to]؟ تُقصّ الأجزاء الزمنية حتى تُقارن أي طابع ISO (مع Z) بشكل صحيح على أساس اليوم */
export const inRange = (date: string, from: string, to: string): boolean => {
  if (!date) return false;
  const d = date.slice(0, 10);
  return (!from || d >= from) && (!to || d <= to);
};

/** اختصار لتجميع الصفوف حسب مفتاح */
export const groupCount = <T>(rows: T[], key: (r: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  rows.forEach((r) => { const k = key(r); out[k] = (out[k] || 0) + 1; });
  return out;
};

/** جمع قيم حقل على مجموعة صفوف */
export const sumField = <T>(rows: T[], pick: (r: T) => number): number =>
  rows.reduce((s, r) => s + (pick(r) || 0), 0);

/** نسبة آمنة (مقام صفري → 0) */
export const pct = (numerator: number, denominator: number): number =>
  denominator ? (numerator / denominator) * 100 : 0;

// ==========================================================
// (٢) عقد الإعداد الجديد — التقارير المُعدَّة حديثاً
// ==========================================================

export enum ReportType {
  PROFIT_LOSS = 'profit_loss',
  INVENTORY = 'inventory',
  SALES = 'sales',
  COST = 'cost',
  PROCUREMENT = 'procurement',
  HR = 'hr',
  OPERATIONS = 'operations',
  EXECUTIVE = 'executive',
}

export interface ReportConfig {
  title: string;
  type: ReportType;
  filters: string[]; // ['dateRange', 'branch', 'category']
  groupBy?: string;
  columns: string[];
  onExport: ('pdf' | 'excel')[];
}

export interface ReportData {
  [key: string]: any;
  period?: { start: string; end: string };
}
