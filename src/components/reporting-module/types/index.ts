// ============================================================
// Reporting Module — Unified Types (تصميم من الصفر)
// ============================================================

// ---- الفترات الزمنية الموحدة ----
export type PeriodPreset = 
  | 'today' | 'yesterday' 
  | 'this-week' | 'last-week' 
  | 'this-month' | 'last-month' 
  | 'this-quarter' | 'last-quarter' 
  | 'this-year' | 'last-year'
  | 'custom';

export interface PeriodRange {
  from: string;      // YYYY-MM-DD
  to: string;        // YYYY-MM-DD
  preset?: PeriodPreset;
  compare?: PeriodRange; // فترة مقارنة (PoP)
}

// ---- الأبعاد الموحدة للفلترة ----
export interface ReportFilters {
  period: PeriodRange;
  branchIds?: string[];      // empty = all
  companyIds?: string[];     // empty = all
  categoryIds?: string[];    // raw material / recipe categories
  supplierIds?: string[];
  expenseCategoryIds?: string[];
  movementTypeIds?: string[];
  status?: string[];
}

// ---- المقاييس الموحدة (مصدر الحقيقة الوحيد) ----
export type MetricId = 
  // إيرادات
  | 'revenue' | 'qtySold' | 'avgOrderValue' | 'ordersCount'
  // تكلفة الطعام
  | 'foodCostTheoretical' | 'foodCostActual' | 'foodCostVariance' | 'foodCostVariancePct' | 'foodCostPct'
  // عمالة
  | 'laborCost' | 'laborCostPct' | 'overtimeCost' | 'overtimePct'
  // أولية/تشغيلية
  | 'primeCost' | 'primeCostPct' | 'opEx' | 'opExPct'
  // صافي
  | 'netOp' | 'netOpPct' | 'netProfit' | 'netProfitPct'
  // مخزون
  | 'inventoryValue' | 'stockCoverDays' | 'stockTurnover'
  // جرد
  | 'countVariance' | 'countVariancePct' | 'theoreticalQty' | 'countedQty'
  // مشتريات
  | 'purchaseAmount' | 'purchaseVat' | 'purchaseQty' | 'avgPurchasePrice' | 'priceVariancePct'
  // موردين
  | 'supplierOnTimePct' | 'supplierQualityScore' | 'supplierLeadTimeDays'
  // مالية
  | 'vatIn' | 'vatOut' | 'vatNet' | 'cashFlowIn' | 'cashFlowOut' | 'cashFlowNet'
  // حوكمة
  | 'grnMatched' | 'grnUnmatched' | 'auditEvents' | 'distributionPending'
  // هدر وفاقد
  | 'wastageValue' | 'wastagePct' | 'spoilageValue' | 'expiryLoss' | 'shrinkagePct'
  // ربحية الأصناف
  | 'grossProfit' | 'grossMargin' | 'itemRevenue' | 'itemFoodCost' | 'itemOrdersCount' | 'itemAvgMargin'
  // مقارنة الفروع
  | 'branchRevenue' | 'branchNetOp' | 'branchFoodCostPct' | 'branchLaborCostPct' | 'branchPrimeCost' | 'branchOpEx' | 'branchScore'
  // تنبؤات
  | 'projectedRevenue' | 'projectedFoodCost' | 'projectedLabor' | 'projectedOpEx' | 'projectedNetOp' | 'projectionConfidence'
  // أداء الموردين
  | 'supplierTotalOrders' | 'supplierTotalSpent' | 'supplierAvgOrderValue' | 'supplierPriceCompetitiveness' | 'supplierQualityRating'
  // جرد ومواد غذائية
  | 'slowMovingItems' | 'agingInventory' | 'expiredItems' | 'inventoryAccuracy' | 'daysToSell'
  // الإقفال
  | 'journalUnbalanced' | 'inventoryUnverified' | 'closeCompliancePct' | 'pendingItems'
  // تنفيذية
  | 'overallHealthScore' | 'profitDriver' | 'costRiskLevel' | 'executiveRecommendation'
  // إنتاجية الموظفين
  | 'revenuePerEmployee' | 'ordersPerEmployee' | 'laborCostPerShift' | 'productivityIndex' | 'employeeTurnover'
  // استدامة
  | 'foodWastePct' | 'energyCost' | 'sustainableSuppliers' | 'organicItems' | 'carbonFootprint'
  // عملاء
  | 'customerCount' | 'repeatRate' | 'customerLifetimeValue' | 'preferredItems'
  // توزيعات
  | 'transferEfficiency' | 'crossBranchSales' | 'centralKitchenOutput'
  // حماية المخاطر
  | 'riskScore' | 'complianceScore' | 'auditFindings' | 'internalControlScore'
  // عوائد الاستثمار
  | 'totalInvestment' | 'netReturn' | 'roi' | 'paybackPeriod' | 'marginImprovement'
  // إضافية (تقارير القوى العاملة والجرد)
  | 'hoursWorked' | 'ordersHandled' | 'unitCost' | 'inventoryQty' | 'delta' | 'type';

export interface MetricDefinition {
  id: MetricId;
  labelAr: string;
  labelEn: string;
  format: 'currency' | 'number' | 'percent' | 'days' | 'quantity' | 'text';
  direction: 'up-is-good' | 'down-is-good' | 'neutral'; // للتلوين
  formula: string; // للتوثيق فقط
  sources: string[]; // مجموعات البيانات المستخدمة
  aggregate: 'sum' | 'avg' | 'calc'; // calc = مشتق بعد التجميع
  dependsOn?: MetricId[]; // للمقاييس المشتقة
}

// ---- مخرجات محرك التجميع ----
export interface AggregatedRow {
  [dimension: string]: string | number;
  // مثال: { branchId: 'b-1', branchName: 'الجبيل', revenue: 220887, foodCostPct: 27.1, ... }
}

export interface SeriesPoint {
  label: string;    // تاريخ أو تسمية
  [metric: string]: number | string;
}

export interface KPIValue {
  id: MetricId;
  value: number;
  delta?: number;           // نسبة التغير مقابل فترة المقارنة
  deltaAbs?: number;        // الفرق المطلق
  direction: 'up-is-good' | 'down-is-good' | 'neutral';
  labelAr: string;
}

export interface DrillPath {
  entity: 'branch' | 'category' | 'item' | 'supplier' | 'movement' | 'journal' | 'grn';
  next: string[]; // المسارات التالية المتاحة
}

export interface ReportResult {
  meta: ReportMeta;
  kpis: KPIValue[];
  rows: AggregatedRow[];
  series: SeriesPoint[];
  totals: AggregatedRow; // صف الإجماليات
  drill: DrillPath;
  warnings: string[]; // مثل "بيانات ناقصة: العمالة"
}

export interface ReportMeta {
  reportId: string;
  family: string;
  generatedAt: string;
  period: PeriodRange;
  branchIds: string[];
  fromCache: boolean;
  closed: boolean; // فترة مقفلة = أرقام مجمدة
  recordCount: number;
}

// ---- تعريف التقرير (العقد الموحد) ----
export interface ReportDefinition {
  id: string;
  family: string;
  nameAr: string;
  nameEn: string;
  purpose: string;
  description?: string;
  sources: string[];           // مفاتيح البيانات: batch_sales, grn, inventory_movements, ...
  dimensions: string[];        // أبعاد التجميع: branch, period, category, item, supplier
  metrics: MetricId[];         // المقاييس المعروضة
  kpiMetrics: MetricId[];      // أي المقاييس تظهر كبطاقات KPI
  filters: FilterSpec[];       // الفلاتر المدعومة
  visuals: VisualSpec;         // إعدادات العرض
  drill: DrillSpec;            // مسار التفصيل
  permission: string;          // صلاحية مطلوبة
  schedule?: ScheduleSpec;     // جدولة مقترحة
  export?: ExportSpec;         // إعدادات التصدير
}

export interface FilterSpec {
  key: string;
  labelAr: string;
  type: 'period' | 'branch' | 'company' | 'category' | 'supplier' | 'multi' | 'date' | 'boolean';
  required?: boolean;
  defaultValue?: unknown;
  dependsOn?: string; // فلتر آخر يتحكم في هذا
}

export interface VisualSpec {
  defaultView: 'table' | 'chart' | 'heatmap' | 'cards' | 'matrix' | 'matrix2x2';
  availableViews: ('table' | 'chart' | 'heatmap' | 'cards' | 'matrix' | 'matrix2x2')[];
  chartType?: 'bar' | 'line' | 'area' | 'pie' | 'stacked-bar' | 'matrix2x2';
  xAxis?: string;
  yAxis?: string[];
  groupBy?: string;
  heatmapMetric?: MetricId;
  matrix2x2?: { x: string; y: string; quadrants: Record<string, string> };
}

export interface DrillSpec {
  enabled: boolean;
  levels: DrillLevel[];
}

export interface DrillLevel {
  entity: 'branch' | 'category' | 'item' | 'supplier' | 'movement' | 'journal' | 'grn'
    | 'employee' | 'shift' | 'project' | 'vendor' | 'audit' | 'inventory' | 'period';
  labelAr: string;
  metrics: MetricId[];
}

export interface ScheduleSpec {
  suggested: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  cron?: string;
  channels?: ('telegram' | 'email' | 'file')[];
  formats?: ('pdf' | 'excel')[];
}

export interface ExportSpec {
  formats: ('pdf' | 'excel' | 'print')[];
  defaultFormat: 'pdf' | 'excel' | 'print';
  landscape?: boolean;
  includeCover?: boolean;
  includeIndex?: boolean;
}

// ---- سجل العائلات ----
export interface ReportFamily {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  description: string;
  permission: string;
  order: number;
  reportIds: string[];
}

// ---- إعدادات الطباعة الموحدة (Print Spec) ----
export interface PrintSpec {
  reportId: string;
  title: string;
  subtitle?: string;
  orientation: 'landscape' | 'portrait';
  pageSize: 'A4' | 'A3';
  header: PrintHeader;
  footer: PrintFooter;
  table: PrintTableSpec;
  kpiCards?: KPICardSpec[];
  statusBadge?: 'closed' | 'estimated' | 'partial';
}

export interface PrintHeader {
  showLogo: boolean;
  companyName: string;
  reportTitle: string;
  period: string;
  classification?: 'سري' | 'داخلي' | 'عام';
}

export interface PrintFooter {
  printedBy: string;
  printedAt: string;
  pageNumber: string; // "صفحة {current} من {total}"
}

export interface PrintTableSpec {
  columns: PrintColumnSpec[];
  showTotals: boolean;
  showRowNumbers: boolean;
  heatmapColumn?: string; // اسم العمود للتلوين الحراري
  groupBy?: string;
  sortBy?: { column: string; direction: 'asc' | 'desc' };
}

export interface PrintColumnSpec {
  key: string;
  labelAr: string;
  format: 'currency' | 'number' | 'percent' | 'text' | 'date';
  width?: string; // CSS width
  align?: 'left' | 'center' | 'right';
  totalLabel?: string; // نص صف المجموع
}

export interface KPICardSpec {
  metricId: MetricId;
  labelAr: string;
  format: 'currency' | 'number' | 'percent';
  direction: 'up-is-good' | 'down-is-good';
}

// ---- حزم المستندات (Document Bundles) ----
export interface DocumentBundle {
  id: string;
  nameAr: string;
  nameEn: string;
  description: string;
  cover: BundleCover;
  reports: BundleReportRef[];
  index: boolean;
  pageNumbers: 'continuous' | 'per-report';
}

export interface BundleCover {
  title: string;
  subtitle?: string;
  companyName: string;
  period: string;
  logo?: string;
}

export interface BundleReportRef {
  reportId: string;
  filters: ReportFilters;
  title?: string; // تجاوز العنوان الافتراضي
  pageBreakBefore?: boolean;
}

// ---- حالة التخزين المؤقت ----
export interface CacheStatus {
  reportId: string;
  lastBuilt: string | null;
  rev: number;
  coverage: { period: string; branchCount: number }[];
  isStale: boolean;
  building: boolean;
}