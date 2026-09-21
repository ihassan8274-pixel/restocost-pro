// ============================================================
// سجل تعريفات التقارير (Report Registry)
// 12 تقرير مرجعي يغطي جميع العائلات الأساسية
// كل تعريف يتبع عقد ReportDefinition الموحد
// ============================================================

import type { 
  ReportDefinition, 
  ReportFamily, 
  FilterSpec, 
  VisualSpec, 
  DrillSpec, 
  ScheduleSpec, 
  ExportSpec,
  MetricId 
} from '../types';

// ============================================================
// فلاتر قياسية مشتركة
// ============================================================

const standardFilters: FilterSpec[] = [
  {
    key: 'period',
    labelAr: 'الفترة',
    type: 'period',
    required: true,
    defaultValue: { preset: 'this-month' },
  },
  {
    key: 'branchIds',
    labelAr: 'الفروع',
    type: 'branch',
    required: false,
  },
  {
    key: 'companyIds',
    labelAr: 'الشركات',
    type: 'company',
    required: false,
  },
];

const categoryFilter: FilterSpec = {
  key: 'categoryIds',
  labelAr: 'التصنيفات',
  type: 'category',
  required: false,
};

const supplierFilter: FilterSpec = {
  key: 'supplierIds',
  labelAr: 'الموردين',
  type: 'supplier',
  required: false,
};

const expenseCategoryFilter: FilterSpec = {
  key: 'expenseCategoryIds',
  labelAr: 'تصنيفات المصاريف',
  type: 'multi',
  required: false,
};

// ============================================================
// تعريفات العرض القياسية
// ============================================================

const tableVisual: VisualSpec = {
  defaultView: 'table',
  availableViews: ['table', 'chart', 'cards'],
  chartType: 'bar',
};

const chartVisual: VisualSpec = {
  defaultView: 'chart',
  availableViews: ['chart', 'table', 'heatmap'],
  chartType: 'line',
  xAxis: 'period',
};

const matrixVisual: VisualSpec = {
  defaultView: 'table',
  availableViews: ['table', 'matrix2x2'],
  chartType: 'matrix2x2',
  matrix2x2: {
    x: 'revenue',
    y: 'netOpPct',
    quadrants: {
      'high-high': 'نجوم',
      'high-low': 'أبقار نقدية',
      'low-high': 'علامات استفهام',
      'low-low': 'كلاب',
    },
  },
};

// ============================================================
// مسارات التفصيل القياسية
// ============================================================

const branchDrill: DrillSpec = {
  enabled: true,
  levels: [
    { entity: 'branch', labelAr: 'الفرع', metrics: ['revenue', 'foodCostPct', 'laborCostPct', 'netOpPct'] },
    { entity: 'category', labelAr: 'التصنيف', metrics: ['revenue', 'foodCostPct', 'qtySold'] },
    { entity: 'item', labelAr: 'الصنف', metrics: ['revenue', 'foodCostActual', 'qtySold', 'foodCostVariancePct'] },
  ],
};

const supplierDrill: DrillSpec = {
  enabled: true,
  levels: [
    { entity: 'supplier', labelAr: 'المورد', metrics: ['purchaseAmount', 'supplierOnTimePct', 'supplierQualityScore', 'supplierLeadTimeDays'] },
    { entity: 'item', labelAr: 'الصنف', metrics: ['purchaseQty', 'avgPurchasePrice', 'priceVariancePct'] },
  ],
};

const journalDrill: DrillSpec = {
  enabled: true,
  levels: [
    { entity: 'journal', labelAr: 'قيد اليومية', metrics: ['cashFlowIn', 'cashFlowOut', 'vatNet'] },
    { entity: 'grn', labelAr: 'سند استلام', metrics: ['purchaseAmount', 'purchaseVat', 'grnMatched', 'grnUnmatched'] },
  ],
};

// ============================================================
// جدولة التصدير القياسية
// ============================================================

const monthlySchedule: ScheduleSpec = {
  suggested: true,
  frequency: 'monthly',
  cron: '0 6 1 * *', // يوم 1 كل شهر الساعة 6 صباحاً
  channels: ['telegram', 'email', 'file'],
  formats: ['pdf', 'excel'],
};

const weeklySchedule: ScheduleSpec = {
  suggested: true,
  frequency: 'weekly',
  cron: '0 6 * * 0', // كل أحد الساعة 6 صباحاً
  channels: ['telegram', 'file'],
  formats: ['pdf'],
};

const quarterlySchedule: ScheduleSpec = {
  suggested: true,
  frequency: 'quarterly',
  cron: '0 6 1 1,4,7,10 *', // كل ربع سنة الساعة 6 صباحاً
  channels: ['telegram', 'email', 'file'],
  formats: ['pdf', 'excel'],
};

// ============================================================
// إعدادات التصدير القياسية
// ============================================================

const standardExport: ExportSpec = {
  formats: ['pdf', 'excel', 'print'],
  defaultFormat: 'pdf',
  landscape: true,
  includeCover: true,
  includeIndex: false,
};

const portraitExport: ExportSpec = {
  formats: ['pdf', 'excel', 'print'],
  defaultFormat: 'pdf',
  landscape: false,
  includeCover: true,
  includeIndex: false,
};

// ============================================================
// 12 تقرير مرجعي
// ============================================================

export const REPORT_DEFINITIONS: Record<string, ReportDefinition> = {
  // ---------- 1. تقرير المبيعات الموحد ----------
  'sales-unified': {
    id: 'sales-unified',
    family: 'sales',
    nameAr: 'تقرير المبيعات الموحد',
    nameEn: 'Unified Sales Report',
    purpose: 'عرض شامل للإيرادات، الكميات، متوسط الفاتورة، ونمو المبيعات مع مقارنات فترية',
    description: 'التقرير الرئيسي للمبيعات يغطي جميع أبعاد الإيرادات مع تحليل الفروع والتصنيفات والأصناف',
    sources: ['batch_sales', 'pos_returns', 'delivery_sales'],
    dimensions: ['branch', 'category', 'item', 'period'],
    metrics: [
      'revenue', 'qtySold', 'avgOrderValue', 'ordersCount',
      'foodCostTheoretical', 'foodCostPct',
      'netOp', 'netOpPct',
    ],
    kpiMetrics: ['revenue', 'qtySold', 'avgOrderValue', 'ordersCount', 'foodCostPct', 'netOpPct'],
    filters: [...standardFilters, categoryFilter],
    visuals: {
      ...tableVisual,
      chartType: 'stacked-bar',
      xAxis: 'period',
      yAxis: ['revenue', 'foodCostTheoretical', 'laborCost', 'opEx', 'netOp'],
      groupBy: 'branch',
    },
    drill: branchDrill,
    permission: 'view_reports',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 2. تقرير تكلفة الطعام التفصيلي ----------
  'food-cost-detailed': {
    id: 'food-cost-detailed',
    family: 'foodCost',
    nameAr: 'تقرير تكلفة الطعام التفصيلي',
    nameEn: 'Detailed Food Cost Report',
    purpose: 'مقارنة التكلفة النظرية vs الفعلية، تحليل الانحرافات، تحديد الأصناف الخاسرة',
    description: 'تحليل عميق لتكلفة الطعام يشمل النظري/الفعلي/الانحراف مع تفصيل للجرد اليومي',
    sources: ['batch_sales', 'daily_counts', 'inventory_movements', 'inventory', 'recipes', 'grn', 'stock_transfers'],
    dimensions: ['branch', 'category', 'item', 'period'],
    metrics: [
      'foodCostTheoretical', 'foodCostActual', 'foodCostVariance', 'foodCostVariancePct', 'foodCostPct',
      'countVariance', 'countVariancePct', 'theoreticalQty', 'countedQty',
      'inventoryValue', 'stockCoverDays', 'stockTurnover',
    ],
    kpiMetrics: ['foodCostTheoretical', 'foodCostActual', 'foodCostVariancePct', 'foodCostPct', 'countVariancePct', 'stockCoverDays'],
    filters: [...standardFilters, categoryFilter],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'category',
      yAxis: ['foodCostTheoretical', 'foodCostActual', 'foodCostVariance'],
      groupBy: 'branch',
      heatmapMetric: 'foodCostVariancePct',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['foodCostTheoretical', 'foodCostActual', 'foodCostVariancePct'] },
        { entity: 'category', labelAr: 'التصنيف', metrics: ['foodCostTheoretical', 'foodCostActual', 'foodCostVariancePct'] },
        { entity: 'item', labelAr: 'الصنف', metrics: ['foodCostTheoretical', 'foodCostActual', 'foodCostVariance', 'foodCostVariancePct', 'countVariance', 'countVariancePct'] },
        { entity: 'movement', labelAr: 'حركة مخزون', metrics: ['foodCostActual', 'theoreticalQty', 'countedQty'] },
      ],
    },
    permission: 'view_reports',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 3. تقرير العمالة والإنتاجية ----------
  'labor-productivity': {
    id: 'labor-productivity',
    family: 'labor',
    nameAr: 'تقرير العمالة والإنتاجية',
    nameEn: 'Labor & Productivity Report',
    purpose: 'تحليل تكلفة العمالة، الأوفر تايم، الإنتاجية لكل موظف/فرع، نسبة العمالة للإيراد',
    description: 'تقرير شامل للعمالة يربط بين الرواتب، الورديات، والأوفر تايم مع مؤشرات الإنتاجية',
    sources: ['payroll', 'shifts', 'attendance', 'batch_sales'],
    dimensions: ['branch', 'period', 'employee'],
    metrics: [
      'laborCost', 'laborCostPct', 'overtimeCost', 'overtimePct',
      'primeCost', 'primeCostPct',
      'revenue', 'ordersCount', 'avgOrderValue',
    ],
    kpiMetrics: ['laborCost', 'laborCostPct', 'overtimeCost', 'overtimePct', 'primeCostPct'],
    filters: [...standardFilters],
    visuals: {
      ...chartVisual,
      chartType: 'line',
      xAxis: 'period',
      yAxis: ['laborCost', 'overtimeCost', 'laborCostPct'],
      groupBy: 'branch',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['laborCost', 'laborCostPct', 'overtimeCost', 'overtimePct'] },
        { entity: 'employee', labelAr: 'الموظف', metrics: ['laborCost', 'overtimeCost', 'hoursWorked', 'ordersHandled'] },
      ],
    },
    permission: 'manage_labor',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 4. تقرير المخزون والجرد ----------
  'inventory-counts': {
    id: 'inventory-counts',
    family: 'inventory',
    nameAr: 'تقرير المخزون والجرد اليومي',
    nameEn: 'Inventory & Daily Counts Report',
    purpose: 'قيمة المخزون، تغطية الأيام، دوران المخزون، تحليل فروقات الجرد (نظري vs فعلي)',
    description: 'تقرير المخزون الكامل مع تحليل الجرد اليومي، الفروقات، وتغطية المخزون',
    sources: ['inventory', 'raw_materials', 'daily_counts', 'inventory_movements', 'batch_sales', 'recipes'],
    dimensions: ['branch', 'category', 'item', 'period'],
    metrics: [
      'inventoryValue', 'stockCoverDays', 'stockTurnover',
      'countVariance', 'countVariancePct', 'theoreticalQty', 'countedQty',
      'foodCostActual', 'foodCostPct',
    ],
    kpiMetrics: ['inventoryValue', 'stockCoverDays', 'stockTurnover', 'countVariancePct'],
    filters: [...standardFilters, categoryFilter],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'category',
      yAxis: ['inventoryValue', 'stockCoverDays', 'countVariance'],
      groupBy: 'branch',
      heatmapMetric: 'countVariancePct',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['inventoryValue', 'stockCoverDays', 'stockTurnover'] },
        { entity: 'category', labelAr: 'التصنيف', metrics: ['inventoryValue', 'countVariancePct', 'stockTurnover'] },
        { entity: 'item', labelAr: 'الصنف', metrics: ['inventoryValue', 'theoreticalQty', 'countedQty', 'countVariance', 'countVariancePct', 'stockCoverDays'] },
        { entity: 'movement', labelAr: 'حركة مخزون', metrics: ['delta', 'type'] },
      ],
    },
    permission: 'manage_inventory',
    schedule: weeklySchedule,
    export: standardExport,
  },

  // ---------- 5. تقرير المشتريات والموردين ----------
  'purchases-suppliers': {
    id: 'purchases-suppliers',
    family: 'purchases',
    nameAr: 'تقرير المشتريات وأداء الموردين',
    nameEn: 'Purchases & Suppliers Report',
    purpose: 'قيمة المشتريات، ضريبة المشتريات، تحليل الأسعار، بطاقة أداء الموردين (تسليم، جودة، سعر)',
    description: 'تحليل شامل للمشتريات مع تقييم أداء الموردين ومؤشرات التذبذب السعري',
    sources: ['grn', 'purchase_orders', 'suppliers', 'raw_materials'],
    dimensions: ['branch', 'supplier', 'category', 'item', 'period'],
    metrics: [
      'purchaseAmount', 'purchaseVat', 'purchaseQty', 'avgPurchasePrice', 'priceVariancePct',
      'supplierOnTimePct', 'supplierQualityScore', 'supplierLeadTimeDays',
      'grnMatched', 'grnUnmatched',
    ],
    kpiMetrics: ['purchaseAmount', 'purchaseVat', 'avgPurchasePrice', 'priceVariancePct', 'supplierOnTimePct', 'grnUnmatched'],
    filters: [...standardFilters, categoryFilter, supplierFilter],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'supplier',
      yAxis: ['purchaseAmount', 'supplierOnTimePct', 'supplierQualityScore'],
      groupBy: 'branch',
    },
    drill: supplierDrill,
    permission: 'manage_purchase_orders',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 6. تقرير قائمة الدخل (P&L) ----------
  'pl-statement': {
    id: 'pl-statement',
    family: 'finance',
    nameAr: 'قائمة الدخل (P&L)',
    nameEn: 'Profit & Loss Statement',
    purpose: 'قائمة دخل كاملة: إيراد، تكلفة طعام، عمالة، مصاريف تشغيل، صافي تشغيل، صافي ربح',
    description: 'تقرير مالي شامل بصيغة قائمة دخل مع جميع بنود التكلفة والهامش',
    sources: ['batch_sales', 'daily_counts', 'inventory_movements', 'payroll', 'shifts', 'operating_expenses', 'journal', 'grn'],
    dimensions: ['branch', 'period'],
    metrics: [
      'revenue', 'foodCostTheoretical', 'foodCostActual', 'foodCostVariance', 'foodCostPct',
      'laborCost', 'laborCostPct', 'overtimeCost',
      'primeCost', 'primeCostPct',
      'opEx', 'opExPct',
      'netOp', 'netOpPct',
      'netProfit', 'netProfitPct',
    ],
    kpiMetrics: ['revenue', 'foodCostPct', 'laborCostPct', 'primeCostPct', 'opExPct', 'netOpPct', 'netProfitPct'],
    filters: [...standardFilters],
    visuals: {
      ...tableVisual,
      chartType: 'stacked-bar',
      xAxis: 'period',
      yAxis: ['revenue', 'foodCostActual', 'laborCost', 'opEx', 'netOp'],
      groupBy: 'branch',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['revenue', 'foodCostActual', 'laborCost', 'opEx', 'netOp', 'netOpPct'] },
        { entity: 'category', labelAr: 'تصنيف المصاريف', metrics: ['opEx'] },
        { entity: 'journal', labelAr: 'قيد اليومية', metrics: ['cashFlowIn', 'cashFlowOut'] },
      ],
    },
    permission: 'view_accounting',
    schedule: monthlySchedule,
    export: portraitExport,
  },

  // ---------- 7. تقرير التدفقات النقدية والضريبة ----------
  'cash-flow-vat': {
    id: 'cash-flow-vat',
    family: 'finance',
    nameAr: 'التدفقات النقدية والضريبة (VAT)',
    nameEn: 'Cash Flow & VAT Report',
    purpose: 'التدفقات الداخلة/الخارجة، صافي التدفق، ضريبة المبيعات/المشتريات، صافي الضريبة المستحقة',
    description: 'تقرير مالي يركز على السيولة والالتزامات الضريبية مع ربط اليومية بالاستلامات والمبيعات',
    sources: ['journal', 'accounts', 'grn', 'batch_sales', 'vat_percent', 'vat_inclusive'],
    dimensions: ['branch', 'period', 'account'],
    metrics: [
      'vatIn', 'vatOut', 'vatNet',
      'cashFlowIn', 'cashFlowOut', 'cashFlowNet',
      'grnMatched', 'grnUnmatched', 'auditEvents',
    ],
    kpiMetrics: ['vatOut', 'vatIn', 'vatNet', 'cashFlowNet', 'grnUnmatched'],
    filters: [...standardFilters],
    visuals: {
      ...chartVisual,
      chartType: 'line',
      xAxis: 'period',
      yAxis: ['cashFlowIn', 'cashFlowOut', 'cashFlowNet', 'vatOut', 'vatIn'],
      groupBy: 'branch',
    },
    drill: journalDrill,
    permission: 'view_accounting',
    schedule: monthlySchedule,
    export: portraitExport,
  },

  // ---------- 8. تقرير الأداء الشهري للفرع ----------
  'monthly-branch-performance': {
    id: 'monthly-branch-performance',
    family: 'executive',
    nameAr: 'تقرير أداء الفرع الشهري',
    nameEn: 'Monthly Branch Performance Report',
    purpose: 'بطاقة أداء شاملة للفرع: مبيعات، تكلفة، عمالة، مخزون، جرد، مصاريف، صافي — مع مقارنة شهر سابق',
    description: 'التقرير التنفيذي الرئيسي للفرع — يعرض جميع مؤشرات الأداء في مكان واحد مع تحليل الاتجاهات',
    sources: ['batch_sales', 'daily_counts', 'inventory_movements', 'payroll', 'shifts', 'operating_expenses', 'inventory', 'grn', 'journal'],
    dimensions: ['branch', 'period'],
    metrics: [
      'revenue', 'qtySold', 'avgOrderValue', 'ordersCount',
      'foodCostTheoretical', 'foodCostActual', 'foodCostVariancePct', 'foodCostPct',
      'laborCost', 'laborCostPct', 'overtimeCost', 'overtimePct',
      'primeCost', 'primeCostPct',
      'opEx', 'opExPct',
      'netOp', 'netOpPct',
      'inventoryValue', 'stockCoverDays', 'stockTurnover',
      'countVariancePct',
      'purchaseAmount', 'purchaseVat',
      'vatOut', 'vatIn', 'vatNet',
      'cashFlowNet',
      'grnUnmatched',
    ],
    kpiMetrics: ['revenue', 'foodCostPct', 'laborCostPct', 'primeCostPct', 'opExPct', 'netOpPct', 'stockCoverDays', 'countVariancePct', 'grnUnmatched'],
    filters: [...standardFilters],
    visuals: {
      ...tableVisual,
      chartType: 'matrix2x2',
      xAxis: 'revenue',
      yAxis: ['netOpPct', 'foodCostPct', 'laborCostPct'],
      groupBy: 'branch',
      matrix2x2: {
        x: 'revenue',
        y: 'netOpPct',
        quadrants: {
          'high-high': 'أداء ممتاز',
          'high-low': 'إيراد عالي - هامش منخفض',
          'low-high': 'هامش جيد - حجم منخفض',
          'low-low': 'يحتاج تدخل',
        },
      },
    },
    drill: branchDrill,
    permission: 'view_reports',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 9. تقرير هندسة القائمة ----------
  'menu-engineering': {
    id: 'menu-engineering',
    family: 'sales',
    nameAr: 'هندسة القائمة (Menu Engineering)',
    nameEn: 'Menu Engineering Report',
    purpose: 'مصفوفة هندسة القائمة: نجوم، أبقار نقدية، علامات استفهام، كلاب — بناءً على الشعبية والربحية',
    description: 'تحليل الأصناف حسب مصفوفة BCG: الشعبية (الكمية) × الربحية (هامش المساهمة) لاتخاذ قرارات التسعير والإبقاء/الإلغاء',
    sources: ['batch_sales', 'recipes', 'raw_materials'],
    dimensions: ['branch', 'category', 'item', 'period'],
    metrics: [
      'revenue', 'qtySold', 'avgOrderValue',
      'foodCostTheoretical', 'foodCostActual', 'foodCostPct',
      'foodCostVariance', 'foodCostVariancePct',
    ],
    kpiMetrics: ['revenue', 'qtySold', 'foodCostPct', 'foodCostVariancePct'],
    filters: [...standardFilters, categoryFilter],
    visuals: matrixVisual,
    drill: {
      enabled: true,
      levels: [
        { entity: 'category', labelAr: 'التصنيف', metrics: ['revenue', 'qtySold', 'foodCostPct'] },
        { entity: 'item', labelAr: 'الصنف', metrics: ['revenue', 'qtySold', 'foodCostTheoretical', 'foodCostActual', 'foodCostPct', 'foodCostVariancePct', 'avgOrderValue'] },
      ],
    },
    permission: 'view_reports',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 10. تقرير المصاريف التشغيلية ----------
  'operating-expenses': {
    id: 'operating-expenses',
    family: 'finance',
    nameAr: 'تقرير المصاريف التشغيلية',
    nameEn: 'Operating Expenses Report',
    purpose: 'تحليل المصاريف حسب التصنيف، الفرع، الحالة، مع اتجاهات فترة مقابل فترة',
    description: 'تفصيل كامل للمصاريف التشغيلية مع تصنيفات، حالات الدفع، ومقارنة فترية',
    sources: ['operating_expenses', 'branches'],
    dimensions: ['branch', 'category', 'period', 'vendor', 'paymentStatus'],
    metrics: [
      'opEx', 'opExPct',
      'revenue', 'netOp', 'netOpPct',
    ],
    kpiMetrics: ['opEx', 'opExPct', 'netOpPct'],
    filters: [...standardFilters, expenseCategoryFilter],
    visuals: {
      ...tableVisual,
      chartType: 'stacked-bar',
      xAxis: 'period',
      yAxis: ['opEx'],
      groupBy: 'category',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['opEx', 'opExPct'] },
        { entity: 'category', labelAr: 'التصنيف', metrics: ['opEx'] },
        { entity: 'vendor', labelAr: 'المورد/البائع', metrics: ['opEx'] },
      ],
    },
    permission: 'manage_expenses',
    schedule: monthlySchedule,
    export: portraitExport,
  },

  // ---------- 11. تقرير التحويلات والتوزيع ----------
  'transfers-distribution': {
    id: 'transfers-distribution',
    family: 'inventory',
    nameAr: 'تقرير التحويلات والتوزيعات',
    nameEn: 'Transfers & Distribution Report',
    purpose: 'تتبع التحويلات بين الفروع (الصادر/الوارد)، التوزيعات من المطبخ المركزي، حالتها وقيمتها',
    description: 'تقرير لحركة المواد بين الفروع والمطبخ المركزي مع تحليل التكلفة والكفاءة',
    sources: ['stock_transfers', 'distributions', 'inventory', 'raw_materials'],
    dimensions: ['branch', 'period', 'direction', 'status'],
    metrics: [
      'inventoryValue', 'purchaseAmount', 'purchaseQty',
      'foodCostActual',
    ],
    kpiMetrics: ['inventoryValue', 'purchaseAmount'],
    filters: [...standardFilters, categoryFilter],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'branch',
      yAxis: ['purchaseAmount', 'inventoryValue'],
      groupBy: 'direction',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['inventoryValue', 'purchaseAmount'] },
        { entity: 'item', labelAr: 'الصنف', metrics: ['purchaseQty', 'unitCost', 'inventoryQty'] },
      ],
    },
    permission: 'manage_inventory',
    schedule: weeklySchedule,
    export: standardExport,
  },

  // ---------- 12. تقرير الحوكمة والتدقيق ----------
  'governance-audit': {
    id: 'governance-audit',
    family: 'governance',
    nameAr: 'تقرير الحوكمة والتدقيق',
    nameEn: 'Governance & Audit Report',
    purpose: 'مراقبة الالتزام: GRN غير مقيدة، أحداث تدقيق، توزيعات معلقة، حالة الإقفال الشهري',
    description: 'تقرير حوكمة يكشف المخالفات، المعاملات غير المكتملة، وسجل التدقيق للامتثال',
    sources: ['grn', 'journal', 'audit', 'distributions', 'purchase_orders'],
    dimensions: ['branch', 'period', 'module', 'user'],
    metrics: [
      'grnMatched', 'grnUnmatched',
      'auditEvents', 'distributionPending',
      'purchaseAmount',
    ],
    kpiMetrics: ['grnUnmatched', 'auditEvents', 'distributionPending'],
    filters: [...standardFilters],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'period',
      yAxis: ['grnUnmatched', 'auditEvents', 'distributionPending'],
      groupBy: 'branch',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['grnUnmatched', 'auditEvents', 'distributionPending'] },
        { entity: 'grn', labelAr: 'سند GRN', metrics: ['purchaseAmount', 'purchaseVat', 'grnMatched'] },
        { entity: 'journal', labelAr: 'قيد اليومية', metrics: ['grnMatched', 'grnUnmatched'] },
        { entity: 'audit', labelAr: 'حدث تدقيق', metrics: ['auditEvents'] },
      ],
    },
    permission: 'manage_users',
    schedule: weeklySchedule,
    export: portraitExport,
  },

  // ---------- 13. تقرير ربحية الأصناف ----------
  'item-profitability': {
    id: 'item-profitability',
    family: 'profitability',
    nameAr: 'تقرير ربحية الأصناف',
    nameEn: 'Item Profitability Report',
    purpose: 'تحليل الربحية لكل صنف: إيراد، تكلفة، هامش ربح، معدل الطلب',
    description: 'تحدد الأصنف الأكثر وأقل ربحية لاتخاذ قرارات القائمة والشراء',
    sources: ['batch_sales', 'recipes', 'raw_materials'],
    dimensions: ['branch', 'category', 'item', 'period'],
    metrics: [
      'itemRevenue', 'itemFoodCost', 'itemAvgMargin', 'grossProfit', 'grossMargin',
      'itemOrdersCount', 'revenue', 'foodCostPct',
    ],
    kpiMetrics: ['grossProfit', 'grossMargin', 'itemAvgMargin', 'itemRevenue', 'itemFoodCost'],
    filters: [...standardFilters, categoryFilter],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'category',
      yAxis: ['grossProfit', 'itemAvgMargin', 'itemRevenue'],
      groupBy: 'branch',
      heatmapMetric: 'itemAvgMargin',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['itemRevenue', 'itemAvgMargin', 'grossProfit'] },
        { entity: 'category', labelAr: 'التصنيف', metrics: ['itemRevenue', 'itemFoodCost', 'itemAvgMargin'] },
        { entity: 'item', labelAr: 'الصنف', metrics: ['itemRevenue', 'itemFoodCost', 'itemAvgMargin', 'grossProfit', 'grossMargin', 'itemOrdersCount'] },
      ],
    },
    permission: 'view_reports',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 14. تقرير الهدر والفاقد ----------
  'wastage-shrinkage': {
    id: 'wastage-shrinkage',
    family: 'wastage',
    nameAr: 'تقرير الهدر والفاقد',
    nameEn: 'Wastage & Shrinkage Report',
    purpose: 'تتبع الهدر، التالف، انتهاء الصلاحية، والنقصان في المخزون',
    description: 'تحليل شامل للهدر والأسباب الرئيسية مع مؤشرات لاتخاذ إجراءات وقائية',
    sources: ['daily_counts', 'inventory_movements', 'inventory', 'raw_materials', 'batch_sales'],
    dimensions: ['branch', 'category', 'item', 'period'],
    metrics: [
      'wastageValue', 'wastagePct', 'spoilageValue', 'expiryLoss', 'shrinkagePct',
      'foodWastePct', 'inventoryAccuracy', 'slowMovingItems', 'agingInventory', 'expiredItems',
      'foodCostActual',
    ],
    kpiMetrics: ['wastageValue', 'wastagePct', 'spoilageValue', 'expiryLoss', 'inventoryAccuracy'],
    filters: [...standardFilters, categoryFilter],
    visuals: {
      ...tableVisual,
      chartType: 'stacked-bar',
      xAxis: 'category',
      yAxis: ['wastageValue', 'spoilageValue', 'expiryLoss'],
      groupBy: 'branch',
      heatmapMetric: 'wastagePct',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['wastageValue', 'wastagePct', 'spoilageValue', 'expiryLoss'] },
        { entity: 'category', labelAr: 'التصنيف', metrics: ['wastageValue', 'wastagePct'] },
        { entity: 'item', labelAr: 'الصنف', metrics: ['wastageValue', 'spoilageValue', 'expiryLoss', 'shrinkagePct', 'daysToSell'] },
      ],
    },
    permission: 'manage_wastage',
    schedule: weeklySchedule,
    export: standardExport,
  },

  // ---------- 15. تقرير مقارنة الفروع ----------
  'branch-comparison': {
    id: 'branch-comparison',
    family: 'executive',
    nameAr: 'مقارنة الفروع الشاملة',
    nameEn: 'Branch Comparison Matrix',
    purpose: 'مقارنة شاملة لجميع الفروع مع لوحة أداء موحدة وتحديد الأفضل والأضعف',
    description: 'مصفوفة مقارنة متعددة الأبعاد تشمل الإيراد، الربحية، التكلفة، العمالة، المخزون',
    sources: ['batch_sales', 'daily_counts', 'inventory_movements', 'payroll', 'shifts', 'operating_expenses', 'inventory', 'grn', 'journal'],
    dimensions: ['branch', 'period'],
    metrics: [
      'branchRevenue', 'branchNetOp', 'branchFoodCostPct', 'branchLaborCostPct',
      'branchPrimeCost', 'branchOpEx', 'branchScore',
      'revenue', 'netOpPct', 'foodCostPct', 'laborCostPct', 'primeCostPct', 'opExPct',
      'stockCoverDays', 'countVariancePct', 'grnUnmatched',
      'cashFlowNet', 'inventoryValue',
    ],
    kpiMetrics: ['branchScore', 'branchNetOp', 'branchFoodCostPct', 'branchLaborCostPct', 'branchPrimeCost', 'branchOpEx'],
    filters: [...standardFilters],
    visuals: {
      ...matrixVisual,
      matrix2x2: {
        x: 'branchRevenue',
        y: 'branchNetOp',
        quadrants: {
          'high-high': '🏆 الأفضل أداءً',
          'high-low': '💰 إيراد عالي - هوامش منخفضة',
          'low-high': '⭐ هوامش جيدة - حجم منخفض',
          'low-low': '⚠ يحتاج تدخل',
        },
      },
    },
    drill: branchDrill,
    permission: 'view_reports',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 16. تقرير أداء الموردين ----------
  'supplier-scorecard': {
    id: 'supplier-scorecard',
    family: 'suppliers',
    nameAr: 'بطاقة أداء الموردين',
    nameEn: 'Supplier Performance Scorecard',
    purpose: 'تقييم شامل لكل مورد: تسليم، جودة، سعر، حجم طلبات، ونسبة الالتزام',
    description: 'نظام نقاط متعدد الأبعاد لتقييم الموردين وترتيبهم',
    sources: ['grn', 'purchase_orders', 'suppliers', 'raw_materials'],
    dimensions: ['supplier', 'category', 'branch', 'period'],
    metrics: [
      'supplierOnTimePct', 'supplierQualityScore', 'supplierLeadTimeDays',
      'supplierTotalOrders', 'supplierTotalSpent', 'supplierAvgOrderValue',
      'supplierPriceCompetitiveness', 'supplierQualityRating',
      'purchaseAmount', 'purchaseQty', 'grnUnmatched',
    ],
    kpiMetrics: ['supplierQualityScore', 'supplierOnTimePct', 'supplierTotalSpent', 'supplierAvgOrderValue'],
    filters: [...standardFilters, categoryFilter],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'supplier',
      yAxis: ['supplierQualityScore', 'supplierOnTimePct', 'supplierTotalSpent'],
      groupBy: 'category',
    },
    drill: supplierDrill,
    permission: 'manage_suppliers',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 17. تقرير الامتثال للإقفال ----------
  'month-end-close': {
    id: 'month-end-close',
    family: 'finance',
    nameAr: 'تقرير الامتثال للإقفال',
    nameEn: 'Month-End Close Compliance',
    purpose: 'التحقق من اكتمال الإقفال الشهري: GRN، اليومية، الجرد، التوزيعات',
    description: 'ضمان اكتمال جميع العمليات قبل الإقفال واكتشاف البنود المعلقة',
    sources: ['grn', 'journal', 'inventory', 'distributions', 'daily_counts', 'audit'],
    dimensions: ['branch', 'period', 'module'],
    metrics: [
      'closeCompliancePct', 'grnUnmatched', 'journalUnbalanced',
      'inventoryUnverified', 'pendingItems', 'auditEvents',
      'distributionPending', 'countVariancePct',
    ],
    kpiMetrics: ['closeCompliancePct', 'grnUnmatched', 'journalUnbalanced', 'inventoryUnverified'],
    filters: [...standardFilters],
    visuals: {
      ...tableVisual,
      chartType: 'stacked-bar',
      xAxis: 'period',
      yAxis: ['grnUnmatched', 'journalUnbalanced', 'inventoryUnverified', 'pendingItems'],
      groupBy: 'branch',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['closeCompliancePct', 'grnUnmatched', 'journalUnbalanced', 'pendingItems'] },
        { entity: 'grn', labelAr: 'سند GRN', metrics: ['grnUnmatched', 'purchaseAmount'] },
        { entity: 'journal', labelAr: 'قيد اليومية', metrics: ['journalUnbalanced'] },
        { entity: 'inventory', labelAr: 'المخزون', metrics: ['inventoryUnverified', 'countVariancePct'] },
      ],
    },
    permission: 'manage_accounting',
    schedule: monthlySchedule,
    export: portraitExport,
  },

  // ---------- 18. تقرير التنبؤات ----------
  'forecasting': {
    id: 'forecasting',
    family: 'executive',
    nameAr: 'تقرير التنبؤات والتوقعات',
    nameEn: 'Forecasting & Projections',
    purpose: 'توقع الأداء المستقبلي بناءً على البيانات التاريخية مع مؤشر الثقة',
    description: 'تحليل استشرافي يوفر تنبؤات بالإيرادات والتكاليف والفوائد',
    sources: ['batch_sales', 'payroll', 'operating_expenses', 'inventory'],
    dimensions: ['branch', 'period'],
    metrics: [
      'projectedRevenue', 'projectedFoodCost', 'projectedLabor', 'projectedOpEx',
      'projectedNetOp', 'projectionConfidence',
      'revenue', 'foodCostPct', 'laborCostPct',
      'netOpPct', 'cashFlowNet',
    ],
    kpiMetrics: ['projectedRevenue', 'projectedNetOp', 'projectionConfidence', 'projectedFoodCost', 'projectedLabor'],
    filters: [...standardFilters],
    visuals: {
      ...chartVisual,
      chartType: 'area',
      xAxis: 'period',
      yAxis: ['projectedRevenue', 'projectedFoodCost', 'projectedLabor', 'projectedOpEx', 'projectedNetOp'],
      groupBy: 'branch',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['projectedRevenue', 'projectedNetOp', 'projectionConfidence'] },
        { entity: 'period', labelAr: 'الفترة', metrics: ['projectedRevenue', 'projectedFoodCost', 'projectedNetOp'] },
      ],
    },
    permission: 'view_reports',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 19. تقرير الإدارة التنفيذية الشامل ----------
  'executive-dashboard': {
    id: 'executive-dashboard',
    family: 'executive',
    nameAr: 'لوحة الإدارة التنفيذية الشاملة',
    nameEn: 'Executive Dashboard',
    purpose: 'لوحة متكاملة تجمع كل مؤشرات الأداء من جميع العائلات في عرض واحد',
    description: 'نظرة شاملة على أداء المنظومة بأكملها مع مؤشرات صحية وتوصيات',
    sources: ['batch_sales', 'daily_counts', 'inventory_movements', 'payroll', 'shifts', 'operating_expenses', 'inventory', 'grn', 'journal', 'audit', 'distributions', 'purchase_orders'],
    dimensions: ['branch', 'period'],
    metrics: [
      'revenue', 'foodCostPct', 'laborCostPct', 'primeCostPct', 'opExPct', 'netOpPct',
      'grossProfit', 'grossMargin',
      'inventoryValue', 'stockCoverDays', 'countVariancePct', 'inventoryAccuracy',
      'purchaseAmount', 'grnUnmatched', 'supplierOnTimePct',
      'vatNet', 'cashFlowNet',
      'overallHealthScore', 'profitDriver', 'costRiskLevel',
      'wastageValue', 'wastagePct', 'closeCompliancePct',
      'auditEvents', 'distributionPending',
      'projectedRevenue', 'projectedNetOp', 'projectionConfidence',
      'branchScore', 'supplierQualityScore',
      'roi', 'marginImprovement',
    ],
    kpiMetrics: ['overallHealthScore', 'revenue', 'netOpPct', 'foodCostPct', 'laborCostPct', 'primeCostPct', 'branchScore', 'wastagePct', 'closeCompliancePct', 'projectionConfidence'],
    filters: [...standardFilters],
    visuals: {
      ...matrixVisual,
      matrix2x2: {
        x: 'revenue',
        y: 'netOpPct',
        quadrants: {
          'high-high': 'أداء ممتاز 🏆',
          'high-low': 'إيراد عالي - هامش منخفض 💰',
          'low-high': 'هامش جيد - حجم منخفض ⭐',
          'low-low': 'يحتاج تدخل ⚠',
        },
      },
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['revenue', 'netOpPct', 'foodCostPct', 'laborCostPct', 'overallHealthScore'] },
        { entity: 'category', labelAr: 'التصنيف', metrics: ['revenue', 'foodCostPct', 'grossMargin'] },
        { entity: 'item', labelAr: 'الصنف', metrics: ['revenue', 'foodCostActual', 'grossProfit', 'grossMargin'] },
        { entity: 'supplier', labelAr: 'المورد', metrics: ['supplierQualityScore', 'supplierOnTimePct'] },
        { entity: 'grn', labelAr: 'سند GRN', metrics: ['grnUnmatched', 'purchaseAmount'] },
      ],
    },
    permission: 'view_reports',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 20. تقرير إنتاجية الموظفين ----------
  'staff-productivity': {
    id: 'staff-productivity',
    family: 'labor',
    nameAr: 'تقرير إنتاجية الموظفين',
    nameEn: 'Staff Productivity Report',
    purpose: 'تحليل أداء الموظفين: إيراد لكل موظف، طلبات، إنتاجية، تكلفة لكل ورديات',
    description: 'تقييم إنتاجية الموظفين وربطها بالعمالة لتحسين توزيع الورديات',
    sources: ['shifts', 'payroll', 'batch_sales', 'attendance'],
    dimensions: ['employee', 'branch', 'shift', 'period'],
    metrics: [
      'revenuePerEmployee', 'ordersPerEmployee', 'laborCostPerShift',
      'productivityIndex', 'laborCost', 'laborCostPct',
      'overtimeCost', 'ordersCount', 'avgOrderValue',
      'employeeTurnover',
    ],
    kpiMetrics: ['revenuePerEmployee', 'productivityIndex', 'ordersPerEmployee', 'laborCostPerShift'],
    filters: [...standardFilters],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'employee',
      yAxis: ['revenuePerEmployee', 'productivityIndex', 'ordersPerEmployee'],
      groupBy: 'branch',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['revenuePerEmployee', 'productivityIndex', 'laborCostPct'] },
        { entity: 'employee', labelAr: 'الموظف', metrics: ['revenuePerEmployee', 'ordersPerEmployee', 'productivityIndex', 'laborCostPerShift'] },
        { entity: 'shift', labelAr: 'الوردية', metrics: ['revenuePerEmployee', 'productivityIndex', 'ordersPerEmployee'] },
      ],
    },
    permission: 'manage_labor',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 21. تقرير الاستدامة ----------
  'sustainability': {
    id: 'sustainability',
    family: 'sustainability',
    nameAr: 'تقرير الاستدامة والتكلفة الخضراء',
    nameEn: 'Sustainability & Green Cost Report',
    purpose: 'تتبع البصمة البيئية والاستدامة: هدر الطعام، الطاقة، الموردين المستدامين',
    description: 'تقارير الاستدامة لدعم مبادرات المسؤولية البيئية والاجتماعية',
    sources: ['operating_expenses', 'daily_counts', 'raw_materials', 'suppliers'],
    dimensions: ['branch', 'category', 'period'],
    metrics: [
      'foodWastePct', 'energyCost', 'wastageValue', 'sustainableSuppliers',
      'organicItems', 'spoilageValue', 'expiryLoss',
      'foodCostActual', 'wastagePct',
    ],
    kpiMetrics: ['foodWastePct', 'energyCost', 'sustainableSuppliers', 'organicItems'],
    filters: [...standardFilters, categoryFilter],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'category',
      yAxis: ['foodWastePct', 'energyCost', 'wastageValue'],
      groupBy: 'branch',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['foodWastePct', 'energyCost', 'sustainableSuppliers'] },
        { entity: 'category', labelAr: 'التصنيف', metrics: ['foodWastePct', 'energyCost'] },
        { entity: 'item', labelAr: 'الصنف', metrics: ['foodWastePct', 'spoilageValue', 'expiryLoss'] },
      ],
    },
    permission: 'view_reports',
    schedule: quarterlySchedule,
    export: standardExport,
  },

  // ---------- 22. تقرير العملاء والولاء ----------
  'customer-insights': {
    id: 'customer-insights',
    family: 'sales',
    nameAr: 'تقرير العملاء والولاء',
    nameEn: 'Customer Insights & Loyalty Report',
    purpose: 'تحليل العملاء: العدد، معدل التكرار، القيمة طويلة الأمد، الأصناف المفضلة',
    description: 'فهم سلوك العملاء وتحديد العملاء الأكثر قيمة',
    sources: ['batch_sales', 'recipes'],
    dimensions: ['branch', 'period', 'item'],
    metrics: [
      'customerCount', 'repeatRate', 'customerLifetimeValue',
      'preferredItems', 'revenue', 'avgOrderValue', 'ordersCount',
    ],
    kpiMetrics: ['customerCount', 'repeatRate', 'customerLifetimeValue', 'preferredItems'],
    filters: [...standardFilters],
    visuals: {
      ...tableVisual,
      chartType: 'pie',
      xAxis: 'period',
      yAxis: ['revenue', 'customerCount'],
      groupBy: 'branch',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['customerCount', 'repeatRate', 'customerLifetimeValue'] },
        { entity: 'item', labelAr: 'الصنف', metrics: ['preferredItems', 'revenue', 'avgOrderValue'] },
      ],
    },
    permission: 'view_reports',
    schedule: monthlySchedule,
    export: standardExport,
  },

  // ---------- 23. تقرير العوائد والاستثمار ----------
  'investment-roi': {
    id: 'investment-roi',
    family: 'finance',
    nameAr: 'تقرير عوائد الاستثمار',
    nameEn: 'Investment ROI Report',
    purpose: 'تحليل عوائد الاستثمارات: الأصول الثابتة، فترة الاسترداد، تحسين الهامش',
    description: 'تقييم العائد على الاستثمارات السابقة واتخاذ قرارات استثمارية مستقبلية',
    sources: ['fixed_assets', 'operating_expenses', 'batch_sales'],
    dimensions: ['branch', 'period', 'project'],
    metrics: [
      'totalInvestment', 'netReturn', 'roi', 'paybackPeriod', 'marginImprovement',
      'revenue', 'netOpPct', 'opEx',
    ],
    kpiMetrics: ['totalInvestment', 'roi', 'paybackPeriod', 'netReturn', 'marginImprovement'],
    filters: [...standardFilters],
    visuals: {
      ...tableVisual,
      chartType: 'bar',
      xAxis: 'project',
      yAxis: ['totalInvestment', 'netReturn', 'roi'],
      groupBy: 'branch',
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['totalInvestment', 'roi', 'paybackPeriod'] },
        { entity: 'project', labelAr: 'المشروع', metrics: ['totalInvestment', 'netReturn', 'roi', 'paybackPeriod'] },
      ],
    },
    permission: 'view_accounting',
    schedule: quarterlySchedule,
    export: portraitExport,
  },

  // ---------- 24. تقرير المخاطر والامتثال ----------
  'risk-compliance': {
    id: 'risk-compliance',
    family: 'governance',
    nameAr: 'تقرير المخاطر والامتثال',
    nameEn: 'Risk & Compliance Report',
    purpose: 'تقييم المخاطر التشغيلية والمالية والامتثال التنظيمي',
    description: 'لوحة شاملة للمخاطر مع مؤشرات الامتثال ومستوى الحماية',
    sources: ['audit', 'grn', 'journal', 'inventory', 'distributions', 'purchase_orders'],
    dimensions: ['branch', 'module', 'severity', 'period'],
    metrics: [
      'riskScore', 'complianceScore', 'auditFindings', 'grnUnmatched',
      'journalUnbalanced', 'inventoryUnverified', 'distributionPending',
      'closeCompliancePct', 'pendingItems', 'auditEvents',
    ],
    kpiMetrics: ['riskScore', 'complianceScore', 'auditFindings', 'grnUnmatched', 'closeCompliancePct'],
    filters: [...standardFilters],
    visuals: {
      ...tableVisual,
      chartType: 'matrix2x2',
      xAxis: 'riskScore',
      yAxis: ['complianceScore'],
      matrix2x2: {
        x: 'riskScore',
        y: 'complianceScore',
        quadrants: {
          'high-high': '⚠ مخاطر عالية - امتثال عالي',
          'high-low': '🔴 مخاطر عالية - يحتاج تدخل فوري',
          'low-high': '🟢 مخاطر منخفضة - امتثال جيد',
          'low-low': '✅ وضع طبيعي',
        },
      },
    },
    drill: {
      enabled: true,
      levels: [
        { entity: 'branch', labelAr: 'الفرع', metrics: ['riskScore', 'complianceScore', 'auditFindings'] },
        { entity: 'grn', labelAr: 'سند GRN', metrics: ['grnUnmatched', 'purchaseAmount'] },
        { entity: 'journal', labelAr: 'قيد اليومية', metrics: ['journalUnbalanced'] },
        { entity: 'audit', labelAr: 'حدث تدقيق', metrics: ['auditEvents', 'auditFindings'] },
      ],
    },
    permission: 'manage_users',
    schedule: weeklySchedule,
    export: portraitExport,
  },
};

// ============================================================
// تعريف العائلات (Report Families)
// ============================================================

export const REPORT_FAMILIES: ReportFamily[] = [
  {
    id: 'sales',
    nameAr: 'المبيعات والإيرادات',
    nameEn: 'Sales & Revenue',
    icon: 'TrendingUp',
    description: 'تقارير المبيعات، الإيرادات، هندسة القائمة، تحليل الفواتير',
    permission: 'view_reports',
    order: 1,
    reportIds: ['sales-unified', 'menu-engineering'],
  },
  {
    id: 'foodCost',
    nameAr: 'تكلفة الطعام والجرد',
    nameEn: 'Food Cost & Inventory',
    icon: 'UtensilsCrossed',
    description: 'التكلفة النظرية/الفعلية، الانحرافات، الجرد اليومي، المخزون',
    permission: 'view_reports',
    order: 2,
    reportIds: ['food-cost-detailed', 'inventory-counts'],
  },
  {
    id: 'labor',
    nameAr: 'العمالة والإنتاجية',
    nameEn: 'Labor & Productivity',
    icon: 'Users',
    description: 'تكلفة العمالة، الأوفر تايم، الإنتاجية، الرواتب، الورديات',
    permission: 'manage_labor',
    order: 3,
    reportIds: ['labor-productivity'],
  },
  {
    id: 'purchases',
    nameAr: 'المشتريات والموردين',
    nameEn: 'Purchases & Suppliers',
    icon: 'Truck',
    description: 'أوامر الشراء، الاستلامات، أداء الموردين، تذبذب الأسعار',
    permission: 'manage_purchase_orders',
    order: 4,
    reportIds: ['purchases-suppliers'],
  },
  {
    id: 'finance',
    nameAr: 'المالية والضريبة',
    nameEn: 'Finance & Tax',
    icon: 'Wallet',
    description: 'قائمة الدخل، التدفقات النقدية، ضريبة القيمة المضافة، المصاريف',
    permission: 'view_accounting',
    order: 5,
    reportIds: ['pl-statement', 'cash-flow-vat', 'operating-expenses'],
  },
  {
    id: 'inventory',
    nameAr: 'المخزون والتحويلات',
    nameEn: 'Inventory & Transfers',
    icon: 'Warehouse',
    description: 'تقييم المخزون، التحويلات، التوزيعات، تغطية المخزون',
    permission: 'manage_inventory',
    order: 6,
    reportIds: ['inventory-counts', 'transfers-distribution'],
  },
  {
    id: 'executive',
    nameAr: 'التقارير التنفيذية',
    nameEn: 'Executive Reports',
    icon: 'Crown',
    description: 'بطاقات أداء الفرع، ملخصات الإدارة العليا، مؤشرات KPI',
    permission: 'view_reports',
    order: 7,
    reportIds: ['monthly-branch-performance'],
  },
  {
    id: 'governance',
    nameAr: 'الحوكمة والتدقيق',
    nameEn: 'Governance & Audit',
    icon: 'ShieldCheck',
    description: 'مراقبة الالتزام، المعاملات غير المكتملة، سجل التدقيق',
    permission: 'manage_users',
    order: 8,
    reportIds: ['governance-audit'],
  },
  {
    id: 'profitability',
    nameAr: 'تحليل الربحية',
    nameEn: 'Profitability Analysis',
    icon: 'TrendingUp',
    description: 'تحليل ربحية الأصناف، هوامش الربح، ومحركات الربحية',
    permission: 'view_reports',
    order: 9,
    reportIds: ['item-profitability'],
  },
  {
    id: 'wastage',
    nameAr: 'الهدر والفاقد',
    nameEn: 'Wastage & Shrinkage',
    icon: 'Trash2',
    description: 'تتبع الهدر، التالف، انتهاء الصلاحية، والنقصان',
    permission: 'manage_wastage',
    order: 10,
    reportIds: ['wastage-shrinkage'],
  },
  {
    id: 'suppliers',
    nameAr: 'أداء الموردين',
    nameEn: 'Supplier Performance',
    icon: 'Star',
    description: 'تقييم أداء الموردين، بطاقات الأداء، وتحليل الأسعار',
    permission: 'manage_suppliers',
    order: 11,
    reportIds: ['supplier-scorecard'],
  },
  {
    id: 'sustainability',
    nameAr: 'الاستدامة',
    nameEn: 'Sustainability',
    icon: 'Leaf',
    description: 'البصمة البيئية، الاستدامة، والتكلفة الخضراء',
    permission: 'view_reports',
    order: 12,
    reportIds: ['sustainability'],
  },
];

// ============================================================
// دوال مساعدة
// ============================================================

export function getReportDefinition(id: string): ReportDefinition {
  const def = REPORT_DEFINITIONS[id];
  if (!def) throw new Error(`Report definition not found: ${id}`);
  return def;
}

export function getAllReportDefinitions(): ReportDefinition[] {
  return Object.values(REPORT_DEFINITIONS);
}

export function getReportsByFamily(familyId: string): ReportDefinition[] {
  const family = REPORT_FAMILIES.find(f => f.id === familyId);
  if (!family) return [];
  return family.reportIds.map(id => REPORT_DEFINITIONS[id]).filter(Boolean);
}

export function getAllFamilies(): ReportFamily[] {
  return [...REPORT_FAMILIES].sort((a, b) => a.order - b.order);
}

export function getFamilyById(familyId: string): ReportFamily | undefined {
  return REPORT_FAMILIES.find(f => f.id === familyId);
}

// قائمة معرفات المقاييس لكل عائلة (للواجهة)
export const FAMILY_KPI_METRICS: Record<string, MetricId[]> = {
  sales: ['revenue', 'qtySold', 'avgOrderValue', 'ordersCount', 'foodCostPct', 'netOpPct', 'customerCount', 'repeatRate'],
  foodCost: ['foodCostTheoretical', 'foodCostActual', 'foodCostVariancePct', 'foodCostPct', 'countVariancePct', 'stockCoverDays'],
  labor: ['laborCost', 'laborCostPct', 'overtimeCost', 'overtimePct', 'primeCostPct', 'revenuePerEmployee', 'productivityIndex'],
  purchases: ['purchaseAmount', 'purchaseVat', 'avgPurchasePrice', 'priceVariancePct', 'supplierOnTimePct', 'grnUnmatched'],
  finance: ['revenue', 'foodCostPct', 'laborCostPct', 'primeCostPct', 'opExPct', 'netOpPct', 'netProfitPct', 'vatNet', 'cashFlowNet', 'roi', 'paybackPeriod'],
  inventory: ['inventoryValue', 'stockCoverDays', 'stockTurnover', 'countVariancePct'],
  executive: ['revenue', 'foodCostPct', 'laborCostPct', 'primeCostPct', 'opExPct', 'netOpPct', 'stockCoverDays', 'countVariancePct', 'grnUnmatched', 'overallHealthScore', 'projectedRevenue', 'projectedNetOp', 'projectionConfidence', 'branchScore'],
  governance: ['grnUnmatched', 'auditEvents', 'distributionPending', 'riskScore', 'complianceScore'],
  profitability: ['grossProfit', 'grossMargin', 'itemAvgMargin', 'itemRevenue', 'itemFoodCost'],
  wastage: ['wastageValue', 'wastagePct', 'spoilageValue', 'expiryLoss', 'inventoryAccuracy'],
  suppliers: ['supplierQualityScore', 'supplierOnTimePct', 'supplierTotalSpent', 'supplierAvgOrderValue', 'supplierTotalOrders'],
  sustainability: ['foodWastePct', 'energyCost', 'sustainableSuppliers', 'organicItems'],
  customers: ['customerCount', 'repeatRate', 'customerLifetimeValue', 'preferredItems'],
  forecasting: ['projectedRevenue', 'projectedFoodCost', 'projectedLabor', 'projectedOpEx', 'projectedNetOp', 'projectionConfidence'],
  investment: ['totalInvestment', 'roi', 'paybackPeriod', 'netReturn', 'marginImprovement'],
};