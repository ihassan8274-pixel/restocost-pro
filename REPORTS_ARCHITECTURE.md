# 📊 معمارية مديول التقارير — RestoCost ERP Pro

## 1️⃣ رؤية معمارية عامة

### الحالة الحالية ❌
- 24 ملف تقرير منفصل
- كل تقرير يحتوي على منطقه الخاص
- حسابات مكررة في عدة أماكن
- لا توجد معايير موحدة للفلترة والتصدير
- صعوبة الصيانة والإضافة

### الحالة المستهدفة ✅
```
┌─────────────────────────────────────────┐
│     واجهة المستخدم (UI Layer)          │
│  ReportsCenterView + SearchInterface    │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│    طبقة التقارير (Reports Layer)       │
│  Financial│Inventory│Cost│Ops│Executive │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   طبقة المحرك (Engine Layer)           │
│  ReportEngine + Filters + Export        │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   طبقة الحسابات (Calculations Layer)   │
│  Financial│Cost│Inventory│Procurement  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   طبقة البيانات (Data Layer - AppContext)
│  User → AppContext → Collections        │
└─────────────────────────────────────────┘
```

---

## 2️⃣ البنية الملفات الجديدة

```
src/components/reports/
│
├── 📁 _core/                    [محرك التقارير الأساسي]
│   ├── ReportEngine.ts          # محرك معالجة التقارير
│   ├── ReportTypes.ts           # أنواع البيانات الموحدة
│   ├── ReportRegistry.ts        # سجل تعريف التقارير
│   └── ReportCache.ts           # نظام التخزين المؤقت
│
├── 📁 categories/               [تقارير مصنفة]
│   │
│   ├── financial/               [التقارير المالية]
│   │   ├── PLReportView.tsx
│   │   ├── CashFlowReportView.tsx
│   │   ├── BalanceSheetReportView.tsx
│   │   ├── BranchFinancialReportView.tsx
│   │   └── FinancialAnalysisReportView.tsx
│   │
│   ├── inventory/               [تقارير المخزون]
│   │   ├── StockValuationReportView.tsx
│   │   ├── InventoryMovementReportView.tsx
│   │   ├── InventoryAgingReportView.tsx
│   │   ├── BOMUsageReportView.tsx
│   │   ├── StockVarianceReportView.tsx
│   │   └── SlowMovingItemsReportView.tsx
│   │
│   ├── cost/                    [تقارير التكاليف]
│   │   ├── FoodCostReportView.tsx
│   │   ├── VarianceAnalysisReportView.tsx
│   │   ├── RecipeCostingReportView.tsx
│   │   ├── CostCenterReportView.tsx
│   │   ├── WastageReportView.tsx
│   │   ├── MenuEngineeringReportView.tsx
│   │   └── CostIntelligenceReportView.tsx
│   │
│   ├── procurement/             [تقارير الشراء]
│   │   ├── PurchaseOrderReportView.tsx
│   │   ├── SupplierPerformanceReportView.tsx
│   │   ├── PriceComparisonReportView.tsx
│   │   └── SupplierRankingReportView.tsx
│   │
│   ├── operations/              [تقارير التشغيل]
│   │   ├── SalesReportView.tsx
│   │   ├── LaborReportView.tsx
│   │   ├── AttendanceReportView.tsx
│   │   └── ProductivityReportView.tsx
│   │
│   └── executive/               [تقارير تنفيذية]
│       ├── ExecutiveDashboardReportView.tsx
│       ├── KPIReportView.tsx
│       ├── BranchComparisonReportView.tsx
│       └── PerformanceAnalysisReportView.tsx
│
├── 📁 components/               [مكونات مشتركة]
│   ├── ReportTemplate.tsx       # قالب موحد للتقارير
│   ├── ReportHeader.tsx         # رأس التقرير
│   ├── ReportSummary.tsx        # ملخص البيانات
│   ├── ReportTable.tsx          # جدول موحد
│   ├── ReportCharts.tsx         # رسوم بيانية
│   ├── ReportFilters.tsx        # نظام الفلترة
│   ├── ReportExport.tsx         # واجهة التصدير
│   └── ReportComparison.tsx     # مكون المقارنة
│
├── 📁 utilities/                [أدوات مساعدة]
│   ├── financialCalculations.ts # الحسابات المالية
│   ├── costCalculations.ts      # حسابات التكاليف
│   ├── inventoryCalculations.ts # حسابات المخزون
│   ├── procurementCalculations.ts # حسابات الشراء
│   ├── metricsCalculations.ts   # حسابات المؤشرات
│   ├── reportFormatting.ts      # تنسيق البيانات
│   ├── reportValidation.ts      # التحقق من الصحة
│   └── reportExporting.ts       # منطق التصدير
│
└── ReportsCenterView.tsx         # نقطة الدخول الرئيسية
```

---

## 3️⃣ أنواع البيانات الأساسية

### ReportTypes.ts
```typescript
// ============ التعريف الأساسي للتقرير ============
export type ReportCategory = 
  | 'financial' 
  | 'inventory' 
  | 'cost' 
  | 'procurement' 
  | 'operations' 
  | 'executive';

export type VisualizationType = 
  | 'table' 
  | 'chart' 
  | 'mixed' 
  | 'summary' 
  | 'detailed';

// ============ تعريف التقرير ============
export interface ReportDefinition {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  category: ReportCategory;
  icon: string; // lucide icon name
  defaultFilters: FilterSpec[];
  requiredRoles: UserRole[];
  allowExport: boolean;
  allowSchedule: boolean;
  allowComparison: boolean;
  visualizationType: VisualizationType;
  refreshInterval?: number; // seconds, optional
}

// ============ مواصفات الفلترة ============
export interface FilterSpec {
  id: string;
  labelAr: string;
  labelEn: string;
  type: 'date' | 'dateRange' | 'branch' | 'category' | 'range' | 'multiSelect' | 'text';
  fieldName: string;
  operatorType: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between';
  defaultValue?: any;
  options?: Array<{ value: string; label: string }>;
}

// ============ القيم المطبقة للفلترة ============
export interface AppliedFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  branchIds?: string[];
  categories?: string[];
  supplierId?: string;
  status?: string;
  customFilters?: Record<string, any>;
}

// ============ بيانات التقرير ============
export interface ReportData {
  id: string;
  definition: ReportDefinition;
  generatedAt: string; // ISO timestamp
  appliedFilters: AppliedFilters;
  
  // الملخص (للعرض السريع)
  summary: SummaryMetrics;
  
  // الجدول التفصيلي
  tableData: {
    columns: ColumnDefinition[];
    rows: DetailRow[];
    totals?: TotalRow;
  };
  
  // الرسوم البيانية
  charts: ChartData[];
  
  // المقارنات (اختياري)
  comparisons?: ComparisonData;
  
  // معلومات إضافية
  metadata: ReportMetadata;
}

// ============ الملخص ============
export interface SummaryMetrics {
  [key: string]: {
    label: string;
    value: number | string;
    unit?: string;
    trend?: 'up' | 'down' | 'stable';
    change?: number; // نسبة التغيير
  };
}

// ============ عمود الجدول ============
export interface ColumnDefinition {
  id: string;
  labelAr: string;
  labelEn: string;
  type: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'status';
  sortable: boolean;
  alignment: 'left' | 'center' | 'right';
  width?: string;
  formatFn?: (value: any) => string;
}

// ============ صف الجدول ============
export interface DetailRow {
  id: string;
  values: Record<string, any>;
  highlight?: boolean; // تمييز الصف
  link?: {
    screen: string;
    params: Record<string, any>;
  };
}

// ============ صف الإجمالي ============
export interface TotalRow {
  label: string;
  values: Record<string, number>;
}

// ============ بيانات الرسم البياني ============
export interface ChartData {
  title: string;
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter';
  data: Array<{
    name: string;
    value: number;
    color?: string;
    [key: string]: any;
  }>;
  xAxis?: string;
  yAxis?: string;
}

// ============ بيانات المقارنة ============
export interface ComparisonData {
  type: 'monthOverMonth' | 'yearOverYear' | 'branchComparison';
  baseline: ReportData;
  comparison: ReportData;
  varianceCalculation: 'absolute' | 'percentage';
}

// ============ معلومات البيانات الوصفية ============
export interface ReportMetadata {
  generatedBy: string;
  generatedAt: string;
  dataRows: number;
  period: {
    from: string;
    to: string;
  };
  version: number;
  notes?: string;
}
```

---

## 4️⃣ نظام الفلترة الموحد

### مثال: فلاتر تقرير P&L

```typescript
const PLReportFilters: FilterSpec[] = [
  {
    id: 'dateRange',
    labelAr: 'الفترة الزمنية',
    labelEn: 'Date Range',
    type: 'dateRange',
    fieldName: 'period',
    operatorType: 'between',
    defaultValue: { from: getCurrentMonth(), to: getCurrentMonth() },
  },
  {
    id: 'branches',
    labelAr: 'الفروع',
    labelEn: 'Branches',
    type: 'multiSelect',
    fieldName: 'branchIds',
    operatorType: 'equals',
  },
  {
    id: 'accountType',
    labelAr: 'نوع الحساب',
    labelEn: 'Account Type',
    type: 'multiSelect',
    fieldName: 'accountType',
    options: [
      { value: 'revenue', label: 'الإيراد' },
      { value: 'expense', label: 'المصروف' },
      { value: 'cost', label: 'التكلفة' },
    ],
  },
  {
    id: 'minAmount',
    labelAr: 'الحد الأدنى للمبلغ',
    labelEn: 'Minimum Amount',
    type: 'range',
    fieldName: 'amount',
    operatorType: 'greaterThan',
  },
];
```

---

## 5️⃣ محرك التقارير (ReportEngine)

### رمز معاصر

```typescript
// src/components/reports/_core/ReportEngine.ts

import { useApp } from '../../../context/AppContext';
import type { 
  ReportDefinition, 
  ReportData, 
  AppliedFilters, 
  SummaryMetrics 
} from './ReportTypes';

export class ReportEngine {
  private appContext: ReturnType<typeof useApp>;
  private cache: Map<string, ReportData> = new Map();

  constructor(appContext: ReturnType<typeof useApp>) {
    this.appContext = appContext;
  }

  /**
   * توليد التقرير بناءً على التعريف والفلاتر
   */
  async generateReport(
    definition: ReportDefinition,
    filters: AppliedFilters,
  ): Promise<ReportData> {
    const cacheKey = this.getCacheKey(definition.id, filters);
    
    // فحص التخزين المؤقت
    if (this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey)!;
      const ageSeconds = 
        (Date.now() - new Date(cachedData.generatedAt).getTime()) / 1000;
      if (ageSeconds < (definition.refreshInterval || 300)) {
        return cachedData;
      }
    }

    // توليد التقرير
    const data = await this.buildReport(definition, filters);
    
    // تخزين مؤقت
    this.cache.set(cacheKey, data);
    
    return data;
  }

  /**
   * بناء التقرير
   */
  private async buildReport(
    definition: ReportDefinition,
    filters: AppliedFilters,
  ): Promise<ReportData> {
    // تطبيق الفلاتر على البيانات
    const filteredData = this.applyFilters(filters);

    // حساب الملخص
    const summary = this.calculateSummary(definition, filteredData);

    // بناء الجدول
    const tableData = this.buildTableData(definition, filteredData);

    // بناء الرسوم البيانية
    const charts = this.buildCharts(definition, filteredData);

    return {
      id: `${definition.id}-${Date.now()}`,
      definition,
      generatedAt: new Date().toISOString(),
      appliedFilters: filters,
      summary,
      tableData,
      charts,
      metadata: {
        generatedBy: this.appContext.currentUser?.name || 'System',
        generatedAt: new Date().toISOString(),
        dataRows: tableData.rows.length,
        period: {
          from: filters.dateFrom || '',
          to: filters.dateTo || '',
        },
        version: 1,
      },
    };
  }

  /**
   * تطبيق الفلاتر
   */
  private applyFilters(filters: AppliedFilters): any[] {
    let data: any[] = [];
    
    // جمع البيانات المناسبة حسب نوع التقرير
    const { posOrders, batchSalesRecords, inventory } = this.appContext;

    // تطبيق فلاتر التاريخ
    if (filters.dateFrom || filters.dateTo) {
      data = [
        ...posOrders.filter(o => this.isInDateRange(o.createdAt, filters)),
        ...batchSalesRecords.filter(b => this.isInDateRange(b.date, filters)),
      ];
    }

    // تطبيق فلاتر الفروع
    if (filters.branchIds?.length) {
      data = data.filter(d => filters.branchIds!.includes(d.branchId));
    }

    return data;
  }

  /**
   * حساب الملخص
   */
  private calculateSummary(
    definition: ReportDefinition,
    data: any[],
  ): SummaryMetrics {
    // سيتم تخصيصه في كل فئة تقارير
    return {};
  }

  /**
   * بناء بيانات الجدول
   */
  private buildTableData(definition: ReportDefinition, data: any[]): any {
    // سيتم تخصيصه في كل فئة تقارير
    return { columns: [], rows: [] };
  }

  /**
   * بناء الرسوم البيانية
   */
  private buildCharts(definition: ReportDefinition, data: any[]): any[] {
    // سيتم تخصيصه في كل فئة تقارير
    return [];
  }

  private getCacheKey(reportId: string, filters: AppliedFilters): string {
    return `${reportId}-${JSON.stringify(filters)}`;
  }

  private isInDateRange(date: string, filters: AppliedFilters): boolean {
    if (!filters.dateFrom && !filters.dateTo) return true;
    if (filters.dateFrom && date < filters.dateFrom) return false;
    if (filters.dateTo && date > filters.dateTo) return false;
    return true;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

---

## 6️⃣ الحسابات المالية المركزية

### financialCalculations.ts

```typescript
import type { Branch, BatchSalesRecord, JournalEntry } from '../../../types';
import { useApp } from '../../../context/AppContext';

export class FinancialCalculations {
  constructor(private app: ReturnType<typeof useApp>) {}

  // ============ قائمة الدخل (P&L) ============
  
  /**
   * حساب الإيراد الإجمالي
   */
  calculateTotalRevenue(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    return (
      this.getSalesRevenue(fromDate, toDate, branchIds) +
      this.getServiceRevenue(fromDate, toDate, branchIds) +
      this.getOtherRevenue(fromDate, toDate, branchIds)
    );
  }

  /**
   * حساب تكلفة البضاعة المباعة (COGS)
   */
  calculateCOGS(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): {
    directMaterial: number;
    directLabor: number;
    manufacturing: number;
    total: number;
  } {
    const directMaterial = this.calculateDirectMaterialCost(fromDate, toDate, branchIds);
    const directLabor = this.calculateDirectLaborCost(fromDate, toDate, branchIds);
    const manufacturing = this.calculateManufacturingOverhead(fromDate, toDate, branchIds);

    return {
      directMaterial,
      directLabor,
      manufacturing,
      total: directMaterial + directLabor + manufacturing,
    };
  }

  /**
   * حساب الربح الإجمالي
   */
  calculateGrossProfit(fromDate: string, toDate: string, branchIds?: string[]): number {
    const revenue = this.calculateTotalRevenue(fromDate, toDate, branchIds);
    const cogs = this.calculateCOGS(fromDate, toDate, branchIds).total;
    return revenue - cogs;
  }

  /**
   * حساب المصاريف التشغيلية
   */
  calculateOperatingExpenses(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): Record<string, number> {
    return {
      salaries: this.calculateSalariesExpense(fromDate, toDate, branchIds),
      rent: this.calculateRentExpense(fromDate, toDate, branchIds),
      utilities: this.calculateUtilitiesExpense(fromDate, toDate, branchIds),
      marketing: this.calculateMarketingExpense(fromDate, toDate, branchIds),
      depreciation: this.calculateDepreciation(fromDate, toDate, branchIds),
      other: this.calculateOtherOperatingExpense(fromDate, toDate, branchIds),
    };
  }

  /**
   * حساب صافي الربح التشغيلي
   */
  calculateOperatingIncome(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    const grossProfit = this.calculateGrossProfit(fromDate, toDate, branchIds);
    const opEx = this.calculateOperatingExpenses(fromDate, toDate, branchIds);
    const totalOpEx = Object.values(opEx).reduce((a, b) => a + b, 0);
    return grossProfit - totalOpEx;
  }

  /**
   * حساب صافي الربح النهائي
   */
  calculateNetProfit(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    const operatingIncome = this.calculateOperatingIncome(fromDate, toDate, branchIds);
    const interestExpense = this.calculateInterestExpense(fromDate, toDate, branchIds);
    const taxExpense = this.calculateTaxExpense(fromDate, toDate, branchIds);
    return operatingIncome - interestExpense - taxExpense;
  }

  // ============ النسب المالية ============
  
  /**
   * نسبة الربح الإجمالي (Gross Profit Margin)
   */
  calculateGrossProfitMargin(fromDate: string, toDate: string, branchIds?: string[]): number {
    const revenue = this.calculateTotalRevenue(fromDate, toDate, branchIds);
    if (!revenue) return 0;
    const grossProfit = this.calculateGrossProfit(fromDate, toDate, branchIds);
    return (grossProfit / revenue) * 100;
  }

  /**
   * نسبة الربح التشغيلي (Operating Profit Margin)
   */
  calculateOperatingMargin(fromDate: string, toDate: string, branchIds?: string[]): number {
    const revenue = this.calculateTotalRevenue(fromDate, toDate, branchIds);
    if (!revenue) return 0;
    const operatingIncome = this.calculateOperatingIncome(fromDate, toDate, branchIds);
    return (operatingIncome / revenue) * 100;
  }

  /**
   * نسبة الربح الصافي (Net Profit Margin)
   */
  calculateNetProfitMargin(fromDate: string, toDate: string, branchIds?: string[]): number {
    const revenue = this.calculateTotalRevenue(fromDate, toDate, branchIds);
    if (!revenue) return 0;
    const netProfit = this.calculateNetProfit(fromDate, toDate, branchIds);
    return (netProfit / revenue) * 100;
  }

  /**
   * نسبة العائد على الأصول (ROA)
   */
  calculateROA(fromDate: string, toDate: string): number {
    const netIncome = this.calculateNetProfit(fromDate, toDate);
    const totalAssets = this.calculateTotalAssets();
    if (!totalAssets) return 0;
    return (netIncome / totalAssets) * 100;
  }

  /**
   * نسبة العائد على حقوق الملكية (ROE)
   */
  calculateROE(fromDate: string, toDate: string): number {
    const netIncome = this.calculateNetProfit(fromDate, toDate);
    const equity = this.calculateTotalEquity();
    if (!equity) return 0;
    return (netIncome / equity) * 100;
  }

  // ============ طرق مساعدة خاصة ============

  private getSalesRevenue(fromDate: string, toDate: string, branchIds?: string[]): number {
    return this.app.posOrders
      .filter(o => this.isInDateRange(o.createdAt, fromDate, toDate))
      .filter(o => !branchIds || branchIds.includes(o.branchId))
      .reduce((sum, o) => sum + o.subtotal, 0);
  }

  private getServiceRevenue(fromDate: string, toDate: string, branchIds?: string[]): number {
    // إضافة الخدمات الأخرى إذا كانت موجودة
    return 0;
  }

  private getOtherRevenue(fromDate: string, toDate: string, branchIds?: string[]): number {
    // إضافة إيرادات أخرى
    return 0;
  }

  private calculateDirectMaterialCost(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    return this.app.posOrders
      .filter(o => this.isInDateRange(o.createdAt, fromDate, toDate))
      .filter(o => !branchIds || branchIds.includes(o.branchId))
      .reduce((sum, o) => sum + o.totalCost, 0);
  }

  private calculateDirectLaborCost(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    // حساب الرواتب المباشرة
    return 0;
  }

  private calculateManufacturingOverhead(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    // حساب التكاليف غير المباشرة
    return 0;
  }

  // ... المزيد من الطرق المساعدة

  private calculateSalariesExpense(fromDate: string, toDate: string, branchIds?: string[]): number {
    // حساب المصاريف الإجمالية للرواتب
    return 0;
  }

  private calculateRentExpense(fromDate: string, toDate: string, branchIds?: string[]): number {
    return 0;
  }

  private calculateUtilitiesExpense(fromDate: string, toDate: string, branchIds?: string[]): number {
    return 0;
  }

  private calculateMarketingExpense(fromDate: string, toDate: string, branchIds?: string[]): number {
    return 0;
  }

  private calculateDepreciation(fromDate: string, toDate: string, branchIds?: string[]): number {
    return 0;
  }

  private calculateOtherOperatingExpense(fromDate: string, toDate: string, branchIds?: string[]): number {
    return 0;
  }

  private calculateInterestExpense(fromDate: string, toDate: string, branchIds?: string[]): number {
    return 0;
  }

  private calculateTaxExpense(fromDate: string, toDate: string, branchIds?: string[]): number {
    return 0;
  }

  private calculateTotalAssets(): number {
    return 0;
  }

  private calculateTotalEquity(): number {
    return 0;
  }

  private isInDateRange(date: string, fromDate: string, toDate: string): boolean {
    return date >= fromDate && date <= toDate;
  }
}
```

---

## 7️⃣ مثال: تقرير P&L المحسّن

### PLReportView.tsx (نموذج جديد)

```typescript
import React, { useState, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { ReportEngine } from '../_core/ReportEngine';
import { ReportTemplate } from '../components/ReportTemplate';
import { FinancialCalculations } from '../utilities/financialCalculations';
import type { ReportDefinition, AppliedFilters } from '../_core/ReportTypes';

const PL_REPORT_DEFINITION: ReportDefinition = {
  id: 'pl-statement',
  nameAr: 'قائمة الدخل',
  nameEn: 'P&L Statement',
  descriptionAr: 'بيان الدخل الشامل لكل فرع والإجمالي',
  category: 'financial',
  icon: 'BarChart3',
  requiredRoles: ['executive', 'cost_controller', 'admin'],
  allowExport: true,
  allowSchedule: true,
  allowComparison: true,
  visualizationType: 'mixed',
  refreshInterval: 300,
  defaultFilters: [
    {
      id: 'dateRange',
      labelAr: 'الفترة',
      labelEn: 'Period',
      type: 'dateRange',
      fieldName: 'period',
      operatorType: 'between',
    },
    {
      id: 'branches',
      labelAr: 'الفروع',
      labelEn: 'Branches',
      type: 'multiSelect',
      fieldName: 'branchIds',
      operatorType: 'equals',
    },
  ],
};

export const PLReportView: React.FC = () => {
  const appContext = useApp();
  const [filters, setFilters] = useState<AppliedFilters>({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    branchIds: Array.from(new Set([
      ...appContext.visibleBranchIds,
      ...appContext.posOrders.map(o => o.branchId),
    ])),
  });

  const engine = useMemo(() => new ReportEngine(appContext), [appContext]);
  const financials = useMemo(() => new FinancialCalculations(appContext), [appContext]);

  const reportData = useMemo(
    () => engine.generateReport(PL_REPORT_DEFINITION, filters),
    [engine, filters],
  );

  // بناء الملخص
  const summary = useMemo(() => ({
    totalRevenue: {
      label: 'الإيراد الإجمالي',
      value: financials.calculateTotalRevenue(filters.dateFrom!, filters.dateTo!, filters.branchIds),
      unit: 'ر.ع',
    },
    grossProfit: {
      label: 'الربح الإجمالي',
      value: financials.calculateGrossProfit(filters.dateFrom!, filters.dateTo!, filters.branchIds),
      unit: 'ر.ع',
    },
    netProfit: {
      label: 'صافي الربح',
      value: financials.calculateNetProfit(filters.dateFrom!, filters.dateTo!, filters.branchIds),
      unit: 'ر.ع',
    },
    netMargin: {
      label: 'نسبة الربح الصافي',
      value: financials.calculateNetProfitMargin(filters.dateFrom!, filters.dateTo!, filters.branchIds),
      unit: '%',
    },
  }), [filters, financials]);

  // بناء الجدول
  const tableData = useMemo(() => {
    const cogs = financials.calculateCOGS(filters.dateFrom!, filters.dateTo!, filters.branchIds);
    const opEx = financials.calculateOperatingExpenses(filters.dateFrom!, filters.dateTo!, filters.branchIds);
    const totalOpEx = Object.values(opEx).reduce((a, b) => a + b, 0);
    
    return {
      columns: [
        { id: 'item', labelAr: 'البند', type: 'text' },
        { id: 'amount', labelAr: 'المبلغ', type: 'currency' },
        { id: 'percent', labelAr: 'النسبة %', type: 'percent' },
      ],
      rows: [
        { id: '1', values: { item: 'الإيراد الإجمالي', amount: summary.totalRevenue.value, percent: 100 }, highlight: true },
        { id: '2', values: { item: 'تكلفة الطعام', amount: cogs.directMaterial, percent: (cogs.directMaterial / summary.totalRevenue.value) * 100 } },
        { id: '3', values: { item: 'العمالة المباشرة', amount: cogs.directLabor, percent: (cogs.directLabor / summary.totalRevenue.value) * 100 } },
        { id: '4', values: { item: 'الربح الإجمالي', amount: summary.grossProfit.value, percent: (summary.grossProfit.value / summary.totalRevenue.value) * 100 }, highlight: true },
        { id: '5', values: { item: 'المصاريف التشغيلية', amount: totalOpEx, percent: (totalOpEx / summary.totalRevenue.value) * 100 } },
        { id: '6', values: { item: 'صافي الربح', amount: summary.netProfit.value, percent: summary.netMargin.value }, highlight: true },
      ],
    };
  }, [filters, financials, summary]);

  return (
    <ReportTemplate
      definition={PL_REPORT_DEFINITION}
      filters={filters}
      onFiltersChange={setFilters}
      summary={summary}
      tableData={tableData}
      allowComparison={true}
    />
  );
};
```

---

## 8️⃣ مسار الهجرة (من القديم للجديد)

### المرحلة 1: البنية الأساسية (أسبوع 1-2)
```
✅ إنشاء ReportTypes.ts
✅ إنشاء ReportEngine.ts
✅ إنشاء ReportCache.ts
✅ إنشاء ReportTemplate.tsx
✅ إنشاء ReportFilters.tsx
✅ إنشاء ReportExport.tsx
```

### المرحلة 2: الحسابات (أسبوع 2-3)
```
✅ financialCalculations.ts
✅ costCalculations.ts
✅ inventoryCalculations.ts
✅ metricsCalculations.ts
```

### المرحلة 3: نقل التقارير الحالية (أسبوع 3-6)
- تقارير مالية ✅
- تقارير مخزون ✅
- تقارير تكاليف ✅
- تقارير شراء ✅
- تقارير تشغيل ✅
- تقارير تنفيذية ✅

### المرحلة 4: تقارير جديدة (أسبوع 6-8)
```
✅ تقارير ميزانية
✅ تقارير موردين متقدمة
✅ تقارير KPI
✅ تقارير مقارنات متقدمة
```

### المرحلة 5: مميزات متقدمة (أسبوع 8+)
```
✅ جدولة التقارير
✅ إرسال تلقائي (بريد/واتساب)
✅ لوحة تنبيهات
✅ تقارير تنبؤية
```

---

## 9️⃣ مقارنة: قبل وبعد

| المقياس | قبل (الحالي) | بعد (الجديد) |
|---------|---------------|-------------|
| **عدد الملفات** | 24 منفصل | 24 + 10 مشتركة |
| **إعادة استخدام الكود** | 0% | 70% |
| **سهولة إضافة تقرير جديد** | 2-3 ساعات | 30 دقيقة |
| **صيانة الأخطاء** | في 24 مكان | في مكان واحد (الحسابات) |
| **تسق الواجهة** | ❌ مختلف | ✅ موحد |
| **أداء التخزين المؤقت** | ❌ لا | ✅ ذكي |
| **دعم التصدير** | جزئي | ✅ شامل |
| **المقارنات الزمنية** | ❌ لا | ✅ متقدمة |

---

## 🔟 التوصيات

### 1. ابدأ بالبنية الأساسية أولاً
```bash
قبل كتابة أي تقرير جديد:
1. أنشئ ReportEngine و ReportTypes
2. أنشئ ReportTemplate المشترك
3. ضع الحسابات في utility منفصل
```

### 2. لكل تقرير جديد
```typescript
// 1. حدد التعريف
const REPORT_DEF: ReportDefinition = { ... }

// 2. أنشئ Hook لحساب البيانات
const useReportData = (filters) => { ... }

// 3. استخدم ReportTemplate
<ReportTemplate 
  definition={REPORT_DEF}
  filters={filters}
  data={reportData}
/>
```

### 3. لا تكرر الحسابات
```typescript
// ❌ خطأ
const revenue = posOrders.reduce(...)

// ✅ صحيح
const revenue = this.financials.calculateTotalRevenue(...)
```

### 4. استخدم الأنواع
```typescript
// كل تقرير له ReportDefinition و ReportData
// هذا يضمن اتساق البنية
```

---

## تالي؟

هل تريد مني أن أبدأ بـ:
1. ✅ **بناء البنية الأساسية** (ReportEngine + Types)
2. ✅ **نقل تقارير موجودة** (مثل P&L)
3. ✅ **إضافة تقارير جديدة** (مثل Balance Sheet)
4. ✅ **تحسينات الأداء** (التخزين المؤقت والتصدير)
