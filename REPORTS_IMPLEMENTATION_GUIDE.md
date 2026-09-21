# 🚀 دليل التطبيق العملي — بناء النظام الجديد

## الخطوة 1: أنواع البيانات الموحدة

### ملف: `src/components/reports/_core/ReportTypes.ts`

```typescript
// ============ أنواع أساسية ============
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

export type FilterType = 
  | 'date' 
  | 'dateRange' 
  | 'branch' 
  | 'category' 
  | 'range' 
  | 'multiSelect' 
  | 'text';

export type FilterOperator = 
  | 'equals' 
  | 'contains' 
  | 'greaterThan' 
  | 'lessThan' 
  | 'between' 
  | 'in';

export type ColumnType = 
  | 'text' 
  | 'number' 
  | 'currency' 
  | 'percent' 
  | 'date' 
  | 'status';

// ============ تعريف التقرير ============
export interface ReportDefinition {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  category: ReportCategory;
  icon: string; // lucide icon name
  defaultFilters: FilterSpec[];
  requiredRoles: string[]; // UserRole array
  allowExport: boolean;
  allowSchedule: boolean;
  allowComparison: boolean;
  visualizationType: VisualizationType;
  refreshInterval?: number; // seconds
  tags?: string[];
}

// ============ مواصفات الفلترة ============
export interface FilterSpec {
  id: string;
  labelAr: string;
  labelEn?: string;
  type: FilterType;
  fieldName: string;
  operatorType: FilterOperator;
  defaultValue?: any;
  options?: Array<{ value: string | number; label: string }>;
  helpText?: string;
  required?: boolean;
  multiple?: boolean;
}

// ============ الفلاتر المطبقة ============
export interface AppliedFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  branchIds?: string[];
  categories?: string[];
  supplierId?: string;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
  searchText?: string;
  customFilters?: Record<string, any>;
  [key: string]: any; // لأي فلاتر مخصصة
}

// ============ بيانات التقرير ============
export interface ReportData {
  id: string;
  definitionId: string;
  generatedAt: string; // ISO timestamp
  appliedFilters: AppliedFilters;
  
  // الملخص السريع
  summary: SummaryMetrics;
  
  // الجدول التفصيلي
  tableData: {
    columns: ColumnDefinition[];
    rows: DetailRow[];
    totals?: TotalRow[];
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
    labelAr: string;
    labelEn?: string;
    value: number | string;
    unit?: string;
    trend?: 'up' | 'down' | 'stable';
    trendPercent?: number;
    format?: 'currency' | 'percent' | 'number' | 'text';
  };
}

// ============ تعريف العمود ============
export interface ColumnDefinition {
  id: string;
  labelAr: string;
  labelEn?: string;
  type: ColumnType;
  sortable: boolean;
  alignment: 'left' | 'center' | 'right';
  width?: string;
  formatFn?: (value: any) => string;
  isHighlight?: boolean; // تلوين خاص
}

// ============ صف من الجدول ============
export interface DetailRow {
  id: string;
  values: Record<string, any>;
  highlight?: boolean;
  status?: 'ok' | 'warning' | 'alert';
  link?: {
    screen: string;
    params: Record<string, any>;
  };
}

// ============ صف الإجمالي ============
export interface TotalRow {
  label: string;
  labelAr?: string;
  values: Record<string, number | string>;
  highlight?: boolean;
}

// ============ بيانات الرسم البياني ============
export interface ChartData {
  id: string;
  titleAr: string;
  titleEn?: string;
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'combo';
  data: Array<{
    name: string;
    value: number;
    color?: string;
    [key: string]: any;
  }>;
  xAxis?: string;
  yAxis?: string;
  height?: number;
}

// ============ بيانات المقارنة ============
export interface ComparisonData {
  type: 'monthOverMonth' | 'yearOverYear' | 'branchComparison' | 'periodComparison';
  baseline: {
    period: string;
    data: any;
  };
  comparison: {
    period: string;
    data: any;
  };
  varianceRows: Array<{
    item: string;
    baselineValue: number;
    comparisonValue: number;
    variance: number;
    variancePercent: number;
    trend: 'up' | 'down' | 'stable';
  }>;
}

// ============ معلومات البيانات الوصفية ============
export interface ReportMetadata {
  generatedBy: string; // user name
  generatedAt: string; // ISO timestamp
  dataRows: number;
  period: {
    from: string;
    to: string;
  };
  version: number;
  notes?: string;
  cacheAge?: number; // seconds
  executionTime?: number; // milliseconds
}

// ============ الخيارات ============
export interface ReportOptions {
  includeZeroValues: boolean;
  sortBy?: {
    column: string;
    direction: 'asc' | 'desc';
  };
  pageSize?: number;
  currentPage?: number;
}
```

---

## الخطوة 2: محرك التقارير الأساسي

### ملف: `src/components/reports/_core/ReportEngine.ts`

```typescript
import type {
  ReportDefinition,
  ReportData,
  AppliedFilters,
  SummaryMetrics,
  ReportOptions,
} from './ReportTypes';
import type { AppContextType } from '../../../context/AppContext';

interface CacheEntry {
  data: ReportData;
  timestamp: number;
}

export class ReportEngine {
  private cache = new Map<string, CacheEntry>();
  private reportDefinitions = new Map<string, ReportDefinition>();

  constructor(private appContext: AppContextType) {}

  /**
   * تسجيل تعريف تقرير
   */
  registerReport(definition: ReportDefinition): void {
    this.reportDefinitions.set(definition.id, definition);
  }

  /**
   * الحصول على تعريف تقرير
   */
  getReportDefinition(reportId: string): ReportDefinition | undefined {
    return this.reportDefinitions.get(reportId);
  }

  /**
   * قائمة كل التقارير المسجلة
   */
  getAllReports(): ReportDefinition[] {
    return Array.from(this.reportDefinitions.values());
  }

  /**
   * توليد التقرير
   */
  async generateReport(
    reportId: string,
    filters: AppliedFilters,
    options: ReportOptions = { includeZeroValues: false },
  ): Promise<ReportData> {
    // التحقق من الصلاحيات
    if (!this.hasPermission(reportId)) {
      throw new Error('User does not have permission to view this report');
    }

    // فحص التخزين المؤقت
    const cacheKey = this.getCacheKey(reportId, filters);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // الحصول على التعريف
    const definition = this.reportDefinitions.get(reportId);
    if (!definition) {
      throw new Error(`Report definition not found: ${reportId}`);
    }

    // بناء التقرير
    const startTime = performance.now();
    const reportData = await this.buildReport(definition, filters, options);
    const executionTime = performance.now() - startTime;

    reportData.metadata.executionTime = executionTime;
    reportData.metadata.cacheAge = 0;

    // تخزين مؤقت
    if (definition.refreshInterval) {
      this.cache.set(cacheKey, {
        data: reportData,
        timestamp: Date.now(),
      });
    }

    return reportData;
  }

  /**
   * بناء التقرير
   */
  private async buildReport(
    definition: ReportDefinition,
    filters: AppliedFilters,
    options: ReportOptions,
  ): Promise<ReportData> {
    // سيتم تخصيصه في كل فئة تقارير
    throw new Error('buildReport must be implemented in subclass');
  }

  /**
   * التحقق من الصلاحيات
   */
  private hasPermission(reportId: string): boolean {
    const definition = this.reportDefinitions.get(reportId);
    if (!definition) return false;

    const userRole = this.appContext.currentUser?.role;
    if (!userRole) return false;

    return definition.requiredRoles.includes(userRole);
  }

  /**
   * مفتاح التخزين المؤقت
   */
  private getCacheKey(reportId: string, filters: AppliedFilters): string {
    return `${reportId}:${JSON.stringify(filters)}`;
  }

  /**
   * الحصول من التخزين المؤقت
   */
  private getFromCache(key: string): ReportData | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const definition = this.reportDefinitions.get(
      key.split(':')[0],
    );
    if (!definition || !definition.refreshInterval) return null;

    const age = (Date.now() - entry.timestamp) / 1000;
    if (age > definition.refreshInterval) {
      this.cache.delete(key);
      return null;
    }

    entry.data.metadata.cacheAge = age;
    return entry.data;
  }

  /**
   * مسح التخزين المؤقت
   */
  clearCache(reportId?: string): void {
    if (reportId) {
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(reportId)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.cache.delete(key));
    } else {
      this.cache.clear();
    }
  }

  /**
   * الحصول على حالة التخزين المؤقت
   */
  getCacheStats(): {
    size: number;
    entries: string[];
  } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}
```

---

## الخطوة 3: الحسابات المالية المركزية

### ملف: `src/components/reports/utilities/FinancialMetrics.ts`

```typescript
import type { UserRole } from '../../../types';
import type { AppContextType } from '../../../context/AppContext';

export class FinancialMetrics {
  constructor(private app: AppContextType) {}

  /**
   * حساب الإيراد الإجمالي
   */
  calculateTotalRevenue(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    const posRevenue = this.app.posOrders
      .filter(o => this.isInDateRange(o.createdAt, fromDate, toDate))
      .filter(o => !branchIds || branchIds.includes(o.branchId))
      .reduce((sum, o) => sum + (o.subtotal || 0), 0);

    const batchRevenue = this.app.batchSalesRecords
      .filter(b => this.isInDateRange(b.date, fromDate, toDate))
      .filter(b => !branchIds || branchIds.includes(b.branchId))
      .reduce((sum, b) => sum + (b.totalRevenue || 0), 0);

    return posRevenue + batchRevenue;
  }

  /**
   * حساب تكلفة الطعام
   */
  calculateFoodCost(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    const posCost = this.app.posOrders
      .filter(o => this.isInDateRange(o.createdAt, fromDate, toDate))
      .filter(o => !branchIds || branchIds.includes(o.branchId))
      .reduce((sum, o) => sum + (o.totalCost || 0), 0);

    const batchCost = this.app.batchSalesRecords
      .filter(b => this.isInDateRange(b.date, fromDate, toDate))
      .filter(b => !branchIds || branchIds.includes(b.branchId))
      .reduce((sum, b) => sum + (b.totalFoodCost || 0), 0);

    return posCost + batchCost;
  }

  /**
   * حساب تكلفة العمالة
   */
  calculateLaborCost(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    // حساب الرواتب والبدلات من payroll
    return this.app.payrollLines
      ?.filter(p => this.isInDateRange(p.payrollPeriod, fromDate, toDate))
      .filter(p => !branchIds || branchIds.includes(p.branchId))
      .reduce((sum, p) => sum + (p.totalAmount || 0), 0) || 0;
  }

  /**
   * حساب المصاريف التشغيلية
   */
  calculateOperatingExpenses(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): Record<string, number> {
    const expenses = this.app.operatingExpenses
      .filter(e => this.isInDateRange(e.date, fromDate, toDate))
      .filter(e => !branchIds || branchIds.includes(e.branchId));

    const byCategory: Record<string, number> = {};
    expenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + (e.amount || 0);
    });

    return byCategory;
  }

  /**
   * حساب الهوالك
   */
  calculateWastageCost(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    return this.app.wastageLogs
      .filter(w => this.isInDateRange(w.date, fromDate, toDate))
      .filter(w => !branchIds || branchIds.includes(w.branchId))
      .reduce((sum, w) => sum + (w.totalCostImpact || 0), 0);
  }

  /**
   * حساب الربح الإجمالي
   */
  calculateGrossProfit(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    const revenue = this.calculateTotalRevenue(fromDate, toDate, branchIds);
    const foodCost = this.calculateFoodCost(fromDate, toDate, branchIds);
    const laborCost = this.calculateLaborCost(fromDate, toDate, branchIds);
    return revenue - foodCost - laborCost;
  }

  /**
   * حساب صافي الربح
   */
  calculateNetProfit(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    const grossProfit = this.calculateGrossProfit(fromDate, toDate, branchIds);
    const opEx = Object.values(
      this.calculateOperatingExpenses(fromDate, toDate, branchIds),
    ).reduce((a, b) => a + b, 0);
    const wastage = this.calculateWastageCost(fromDate, toDate, branchIds);
    return grossProfit - opEx - wastage;
  }

  /**
   * نسبة الربح الإجمالي
   */
  calculateGrossProfitMargin(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    const revenue = this.calculateTotalRevenue(fromDate, toDate, branchIds);
    if (!revenue) return 0;
    const grossProfit = this.calculateGrossProfit(fromDate, toDate, branchIds);
    return (grossProfit / revenue) * 100;
  }

  /**
   * نسبة الربح الصافي
   */
  calculateNetProfitMargin(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    const revenue = this.calculateTotalRevenue(fromDate, toDate, branchIds);
    if (!revenue) return 0;
    const netProfit = this.calculateNetProfit(fromDate, toDate, branchIds);
    return (netProfit / revenue) * 100;
  }

  /**
   * نسبة تكلفة الطعام
   */
  calculateFoodCostPercent(
    fromDate: string,
    toDate: string,
    branchIds?: string[],
  ): number {
    const revenue = this.calculateTotalRevenue(fromDate, toDate, branchIds);
    if (!revenue) return 0;
    const foodCost = this.calculateFoodCost(fromDate, toDate, branchIds);
    return (foodCost / revenue) * 100;
  }

  /**
   * مساعد: فحص إذا كانت التاريخ ضمن النطاق
   */
  private isInDateRange(date: string, fromDate: string, toDate: string): boolean {
    if (!date) return false;
    const d = new Date(date).toISOString().split('T')[0];
    return d >= fromDate && d <= toDate;
  }
}
```

---

## الخطوة 4: قالب التقرير الموحد

### ملف: `src/components/reports/components/ReportTemplate.tsx`

```typescript
import React from 'react';
import { Printer, FileDown, BarChart3, Table as TableIcon } from 'lucide-react';
import { Card, PageHeader, Btn, TabBar } from '../../ui';
import type { ReportDefinition, ReportData, AppliedFilters } from '../_core/ReportTypes';
import { ReportFilters } from './ReportFilters';
import { ReportSummary } from './ReportSummary';
import { ReportTable } from './ReportTable';
import { ReportCharts } from './ReportCharts';
import { ReportExport } from './ReportExport';

interface ReportTemplateProps {
  definition: ReportDefinition;
  reportData: ReportData;
  filters: AppliedFilters;
  onFiltersChange: (filters: AppliedFilters) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export const ReportTemplate: React.FC<ReportTemplateProps> = ({
  definition,
  reportData,
  filters,
  onFiltersChange,
  onRefresh,
  isLoading = false,
}) => {
  const [showTable, setShowTable] = React.useState(
    definition.visualizationType === 'table' || definition.visualizationType === 'mixed',
  );
  const [showCharts, setShowCharts] = React.useState(
    definition.visualizationType === 'chart' || definition.visualizationType === 'mixed',
  );

  return (
    <div className="space-y-6">
      {/* رأس التقرير */}
      <PageHeader
        title={definition.nameAr}
        subtitle={definition.descriptionAr}
        actions={
          <>
            <Btn
              tone="ghost"
              onClick={onRefresh}
              disabled={isLoading}
            >
              🔄 تحديث
            </Btn>
            {definition.allowExport && (
              <ReportExport reportData={reportData} />
            )}
            <Btn tone="ghost" onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> طباعة
            </Btn>
          </>
        }
      />

      {/* الفلاتر */}
      <Card>
        <ReportFilters
          filters={definition.defaultFilters}
          values={filters}
          onChange={onFiltersChange}
        />
      </Card>

      {/* الملخص */}
      {reportData.summary && (
        <ReportSummary metrics={reportData.summary} />
      )}

      {/* التصفح: جدول / رسوم بيانية */}
      {(showTable || showCharts) && (
        <Card>
          <TabBar
            tabs={[
              {
                id: 'table',
                label: '📊 الجدول',
                content: showTable ? (
                  <ReportTable columns={reportData.tableData.columns} rows={reportData.tableData.rows} />
                ) : null,
              },
              {
                id: 'charts',
                label: '📈 الرسوم البيانية',
                content: showCharts ? (
                  <ReportCharts charts={reportData.charts} />
                ) : null,
              },
            ]}
          />
        </Card>
      )}

      {/* ملخص إحصائي */}
      <div className="text-xs text-slate-500">
        تم إنشاؤه: {new Date(reportData.metadata.generatedAt).toLocaleString('ar-SA')}
        {reportData.metadata.executionTime && (
          <> • وقت التنفيذ: {reportData.metadata.executionTime.toFixed(0)}ms</>
        )}
        {reportData.metadata.cacheAge !== undefined && reportData.metadata.cacheAge > 0 && (
          <> • من التخزين المؤقت: قبل {reportData.metadata.cacheAge.toFixed(0)}s</>
        )}
      </div>
    </div>
  );
};
```

---

## الخطوة 5: تقرير P&L محسّن (مثال كامل)

### ملف: `src/components/reports/categories/financial/PLReportView.tsx`

```typescript
import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTemplate } from '../../components/ReportTemplate';
import { FinancialMetrics } from '../../utilities/FinancialMetrics';
import type {
  ReportDefinition,
  ReportData,
  AppliedFilters,
  ColumnDefinition,
} from '../../_core/ReportTypes';
import { fmt, fmtMoney } from '../../../../utils/helpers';

// تعريف التقرير
const PL_REPORT_DEFINITION: ReportDefinition = {
  id: 'pl-statement',
  nameAr: 'قائمة الدخل',
  nameEn: 'Income Statement (P&L)',
  descriptionAr: 'بيان الدخل الشامل للفرع والإجمالي',
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
      labelAr: 'الفترة الزمنية',
      type: 'dateRange',
      fieldName: 'period',
      operatorType: 'between',
    },
    {
      id: 'branches',
      labelAr: 'الفروع',
      type: 'multiSelect',
      fieldName: 'branchIds',
      operatorType: 'in',
    },
  ],
};

export const PLReportView: React.FC = () => {
  const appContext = useApp();

  // الفلاتر الأولية
  const [filters, setFilters] = useState<AppliedFilters>(() => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      dateFrom: monthStart.toISOString().split('T')[0],
      dateTo: today.toISOString().split('T')[0],
      branchIds: appContext.visibleBranchIds,
    };
  });
  const [isLoading, setIsLoading] = useState(false);

  // الخدمات
  const metrics = useMemo(() => new FinancialMetrics(appContext), [appContext]);
  const engine = useMemo(() => new ReportEngine(appContext), [appContext]);

  // بناء بيانات التقرير
  const reportData = useMemo((): ReportData => {
    if (!filters.dateFrom || !filters.dateTo) {
      return {
        id: 'pl-empty',
        definitionId: 'pl-statement',
        generatedAt: new Date().toISOString(),
        appliedFilters: filters,
        summary: {},
        tableData: { columns: [], rows: [] },
        charts: [],
        metadata: {
          generatedBy: 'System',
          generatedAt: new Date().toISOString(),
          dataRows: 0,
          period: { from: '', to: '' },
          version: 1,
        },
      };
    }

    const branchIds = filters.branchIds || appContext.visibleBranchIds;
    const revenue = metrics.calculateTotalRevenue(filters.dateFrom!, filters.dateTo!, branchIds);
    const foodCost = metrics.calculateFoodCost(filters.dateFrom!, filters.dateTo!, branchIds);
    const laborCost = metrics.calculateLaborCost(filters.dateFrom!, filters.dateTo!, branchIds);
    const opEx = metrics.calculateOperatingExpenses(filters.dateFrom!, filters.dateTo!, branchIds);
    const wastage = metrics.calculateWastageCost(filters.dateFrom!, filters.dateTo!, branchIds);
    const totalOpEx = Object.values(opEx).reduce((a, b) => a + b, 0);

    const grossProfit = revenue - foodCost - laborCost;
    const netProfit = grossProfit - totalOpEx - wastage;

    // الملخص
    const summary = {
      totalRevenue: {
        labelAr: 'إجمالي الإيراد',
        value: fmtMoney(revenue),
        unit: 'ر.ع',
      },
      grossProfit: {
        labelAr: 'الربح الإجمالي',
        value: fmtMoney(grossProfit),
        unit: 'ر.ع',
      },
      netProfit: {
        labelAr: 'صافي الربح',
        value: fmtMoney(netProfit),
        unit: 'ر.ع',
      },
      profitMargin: {
        labelAr: 'نسبة الربح الصافي',
        value: metrics.calculateNetProfitMargin(filters.dateFrom!, filters.dateTo!, branchIds).toFixed(2),
        unit: '%',
      },
    };

    // الأعمدة
    const columns: ColumnDefinition[] = [
      {
        id: 'item',
        labelAr: 'البند',
        type: 'text',
        sortable: false,
        alignment: 'right',
      },
      {
        id: 'amount',
        labelAr: 'المبلغ',
        type: 'currency',
        sortable: true,
        alignment: 'left',
      },
      {
        id: 'percent',
        labelAr: 'النسبة %',
        type: 'percent',
        sortable: true,
        alignment: 'left',
      },
    ];

    // الصفوف
    const rows = [
      {
        id: '1',
        values: { item: 'إجمالي الإيراد', amount: revenue, percent: 100 },
        highlight: true,
      },
      {
        id: '2',
        values: { item: 'تكلفة الطعام', amount: foodCost, percent: (foodCost / revenue) * 100 },
      },
      {
        id: '3',
        values: { item: 'تكلفة العمالة', amount: laborCost, percent: (laborCost / revenue) * 100 },
      },
      {
        id: '4',
        values: { item: 'الربح الإجمالي', amount: grossProfit, percent: (grossProfit / revenue) * 100 },
        highlight: true,
      },
      {
        id: '5',
        values: { item: 'المصاريف التشغيلية', amount: totalOpEx, percent: (totalOpEx / revenue) * 100 },
      },
      {
        id: '6',
        values: { item: 'الهوالك والفاقد', amount: wastage, percent: (wastage / revenue) * 100 },
      },
      {
        id: '7',
        values: { item: 'صافي الربح', amount: netProfit, percent: (netProfit / revenue) * 100 },
        highlight: true,
      },
    ];

    return {
      id: `pl-${Date.now()}`,
      definitionId: 'pl-statement',
      generatedAt: new Date().toISOString(),
      appliedFilters: filters,
      summary,
      tableData: {
        columns,
        rows,
      },
      charts: [],
      metadata: {
        generatedBy: appContext.currentUser?.name || 'System',
        generatedAt: new Date().toISOString(),
        dataRows: rows.length,
        period: {
          from: filters.dateFrom!,
          to: filters.dateTo!,
        },
        version: 1,
      },
    };
  }, [filters, metrics, appContext]);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      // محاكاة معالجة
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <ReportTemplate
      definition={PL_REPORT_DEFINITION}
      reportData={reportData}
      filters={filters}
      onFiltersChange={setFilters}
      onRefresh={handleRefresh}
      isLoading={isLoading}
    />
  );
};
```

---

## الخطوة 6: دمج في ReportsCenterView

### تعديل: `src/components/reports/ReportsCenterView.tsx`

```typescript
import { PLReportView } from './categories/financial/PLReportView';
// ... imports أخرى

export const ReportsCenterView: React.FC = () => {
  const [tab, setTab] = useState<TabId>('financial');

  const tabs: TabDef[] = [
    {
      id: 'financial',
      label: 'التقارير المالية',
      description: 'قائمة الدخل والتدفق النقدي',
      icon: <Wallet className="w-4 h-4" />,
      render: (
        <div className="space-y-6">
          <PLReportView />
          {/* تقارير مالية أخرى */}
        </div>
      ),
    },
    // ... باقي التبويبات
  ];

  return (
    <div className="space-y-6">
      {/* ... محتوى */}
    </div>
  );
};
```

---

## الخطوة 7: تعليمات البدء الفوري

### 1. نسخ الملفات الأساسية
```bash
# انسخ البنية الأساسية
src/components/reports/_core/
  ├── ReportTypes.ts          # ← ابدأ هنا
  ├── ReportEngine.ts         # ← ثم هنا
  └── ReportCache.ts          # ← ثم هنا
```

### 2. بناء أول تقرير
```typescript
// حدد ReportDefinition
const MY_REPORT: ReportDefinition = { ... }

// استخدم FinancialMetrics للحسابات
const metrics = new FinancialMetrics(appContext)
const revenue = metrics.calculateTotalRevenue(from, to, branchIds)

// عرّف البيانات
const reportData: ReportData = {
  summary: { ... },
  tableData: { columns, rows },
  charts: [ ... ],
}

// استخدم ReportTemplate
return <ReportTemplate definition={MY_REPORT} ... />
```

### 3. تسجيل التقرير
```typescript
const engine = new ReportEngine(appContext)
engine.registerReport(PL_REPORT_DEFINITION)
```

### 4. أضف للقائمة الرئيسية
```typescript
// في ReportsCenterView.tsx
tabs.push({
  id: 'my-report',
  label: 'تقريري الجديد',
  render: <MyReportView />,
})
```

---

## جدول زمني مقترح

| الأسبوع | المهام |
|---------|--------|
| **1** | ✅ ReportTypes + ReportEngine + ReportTemplate |
| **2** | ✅ FinancialMetrics + CostMetrics |
| **3** | ✅ PL Report + Cash Flow Report |
| **4** | ✅ Inventory Reports + Procurement Reports |
| **5** | ✅ تقرير Executive Dashboard |
| **6** | ✅ إضافة ReportComparison |
| **7** | ✅ إضافة ReportScheduling |
| **8+** | ✅ تحسينات الأداء والمميزات الإضافية |

---

## الفوائس المتوقعة

✅ **تقليل الكود 40-50%** من خلال إعادة الاستخدام  
✅ **إضافة تقرير جديد بـ 30 دقيقة** بدلاً من ساعات  
✅ **واجهة مستخدم موحدة** لكل التقارير  
✅ **أداء محسّن** بفضل التخزين المؤقت  
✅ **صيانة أسهل** - خطأ واحد يُصحح في مكان واحد  

---

هل تريد مني أن أبدأ بإنشاء الملفات الفعلية؟ أم لديك أسئلة عن أي خطوة؟
