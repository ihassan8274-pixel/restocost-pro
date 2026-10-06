// ============================================================
// React Hooks للربط مع محرك التقارير
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { 
  ReportFilters, 
  PeriodRange, 
  ReportResult, 
  ReportDefinition, 
  MetricId,
  AggregatedRow,
  KPIValue,
  SeriesPoint,
} from '../types';

import { computeReport, clearCache } from '../engine/aggregationEngine';
import { getReportDefinition, getAllReportDefinitions, getAllFamilies, getReportsByFamily, FAMILY_KPI_METRICS } from '../registry';
import { exportToExcel, exportToPDF, openPrintWindow, downloadBlob, getExportFilename } from '../export';
import { resolvePeriod, getComparePeriod } from '../data/sources';

// ============================================================
// Hook رئيسي للتقرير
// ============================================================

export interface UseReportOptions {
  reportId: string;
  initialFilters?: Partial<ReportFilters>;
  autoRun?: boolean;
}

export interface UseReportReturn {
  // حالة التقرير
  result: ReportResult | null;
  loading: boolean;
  error: Error | null;
  
  // الفلاتر
  filters: ReportFilters;
  setFilters: (filters: Partial<ReportFilters>) => void;
  resetFilters: () => void;
  
  // الإجراءات
  runReport: () => Promise<void>;
  refresh: () => Promise<void>;
  
  // التصدير
  exportExcel: () => Promise<void>;
  exportPDF: () => Promise<void>;
  printReport: () => void;
  
  // بيانات مشتقة للكمبوننتات
  kpis: KPIValue[];
  rows: AggregatedRow[];
  totals: AggregatedRow | null;
  series: SeriesPoint[];
  warnings: string[];
  meta: ReportResult['meta'] | null;
  
  // تعريف التقرير
  definition: ReportDefinition | null;
}

export function useReport({ reportId, initialFilters, autoRun = true }: UseReportOptions): UseReportReturn {
  const definition = useMemo(() => getReportDefinition(reportId), [reportId]);
  
  // الفلاتر الافتراضية
  const defaultFilters: ReportFilters = useMemo(() => ({
    period: resolvePeriod('this-month'),
    branchIds: [],
    companyIds: [],
    categoryIds: [],
    supplierIds: [],
    expenseCategoryIds: [],
    movementTypeIds: [],
    status: [],
    ...initialFilters,
  }), [initialFilters]);
  
  const [filters, setFiltersState] = useState<ReportFilters>(defaultFilters);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // دالة تشغيل التقرير
  const runReport = useCallback(async () => {
    if (!definition) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // حساب فترة المقارنة إذا كانت مدعومة
      const comparePeriod = getComparePeriod(filters.period);
      
      const reportResult = await computeReport({
        reportId,
        definition: {
          metrics: definition.metrics,
          dimensions: definition.dimensions,
          kpiMetrics: definition.kpiMetrics,
        },
        filters,
        comparePeriod: comparePeriod || undefined,
        useCache: true,
      });
      
      setResult(reportResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [reportId, definition, filters]);
  
  // تحديث الفلاتر
  const setFilters = useCallback((newFilters: Partial<ReportFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);
  
  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilters);
  }, [defaultFilters]);
  
  const refresh = useCallback(async () => {
    clearCache(reportId);
    await runReport();
  }, [reportId, runReport]);
  
  // تأثير التشغيل التلقائي
  useEffect(() => {
    if (autoRun && definition) {
      runReport();
    }
  }, [autoRun, definition, runReport]);
  
  // التصدير
  const exportExcel = useCallback(async () => {
    if (!result || !definition) return;
    try {
      const blob = await exportToExcel(reportId, result, { nameAr: definition.nameAr });
      const filename = getExportFilename(reportId, 'excel', filters.period);
      await downloadBlob(blob, filename);
    } catch (err: unknown) {
      console.error('Export Excel failed:', err);
    }
  }, [reportId, result, definition, filters.period]);
  
  const exportPDF = useCallback(async () => {
    if (!result || !definition) return;
    try {
      const blob = await exportToPDF(reportId, result, { nameAr: definition.nameAr });
      const filename = getExportFilename(reportId, 'pdf', filters.period);
      await downloadBlob(blob, filename);
    } catch (err: unknown) {
      console.error('Export PDF failed:', err);
    }
  }, [reportId, result, definition, filters.period]);
  
  const printReport = useCallback(() => {
    if (!result || !definition) return;
    openPrintWindow(reportId, result, { nameAr: definition.nameAr });
  }, [reportId, result, definition]);
  
  // بيانات مشتقة
  const kpis = result?.kpis || [];
  const rows = result?.rows || [];
  const totals = result?.totals || null;
  const series = result?.series || [];
  const warnings = result?.warnings || [];
  const meta = result?.meta || null;
  
  return {
    result,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    runReport,
    refresh,
    exportExcel,
    exportPDF,
    printReport,
    kpis,
    rows,
    totals,
    series,
    warnings,
    meta,
    definition,
  };
}

// ============================================================
// Hook لعائلات التقارير
// ============================================================

export function useReportFamilies() {
  const families = useMemo(() => getAllFamilies(), []);
  const definitions = useMemo(() => getAllReportDefinitions(), []);
  
  const getFamilyReports = useCallback((familyId: string) => {
    return getReportsByFamily(familyId);
  }, []);
  
  const getKPIMetricsForFamily = useCallback((familyId: string) => {
    return FAMILY_KPI_METRICS[familyId] || [];
  }, []);
  
  return {
    families,
    definitions,
    getFamilyReports,
    getKPIMetricsForFamily,
  };
}

// ============================================================
// Hook للفلترة الموحدة (فترة، فروع، شركات)
// ============================================================

export interface UseReportFiltersOptions {
  initialPeriod?: PeriodRange;
  availableBranches?: Array<{ id: string; name: string }>;
  availableCompanies?: Array<{ id: string; name: string }>;
}

export function useReportFilters({ 
  initialPeriod, 
  availableBranches = [], 
  availableCompanies = [] 
}: UseReportFiltersOptions) {
  const [period, setPeriod] = useState<PeriodRange>(initialPeriod || resolvePeriod('this-month'));
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  
  const filters: ReportFilters = useMemo(() => ({
    period,
    branchIds,
    companyIds,
    categoryIds,
    supplierIds,
    expenseCategoryIds: [],
    movementTypeIds: [],
    status: [],
  }), [period, branchIds, companyIds, categoryIds, supplierIds]);
  
  const setFilter = useCallback(<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => {
    switch (key) {
      case 'period': setPeriod(value as PeriodRange); break;
      case 'branchIds': setBranchIds(value as string[]); break;
      case 'companyIds': setCompanyIds(value as string[]); break;
      case 'categoryIds': setCategoryIds(value as string[]); break;
      case 'supplierIds': setSupplierIds(value as string[]); break;
    }
  }, []);
  
  const clearFilters = useCallback(() => {
    setPeriod(resolvePeriod('this-month'));
    setBranchIds([]);
    setCompanyIds([]);
    setCategoryIds([]);
    setSupplierIds([]);
  }, []);
  
  const hasActiveFilters = useMemo(() => 
    period.from || period.to || branchIds.length > 0 || companyIds.length > 0 || categoryIds.length > 0 || supplierIds.length > 0,
    [period, branchIds, companyIds, categoryIds, supplierIds]
  );
  
  return {
    filters,
    period,
    setPeriod,
    branchIds,
    setBranchIds,
    companyIds,
    setCompanyIds,
    categoryIds,
    setCategoryIds,
    supplierIds,
    setSupplierIds,
    setFilter,
    clearFilters,
    hasActiveFilters,
    availableBranches,
    availableCompanies,
  };
}

// ============================================================
// Hook للمقارنة الفترية (PoP)
// ============================================================

export function usePeriodComparison(period: PeriodRange) {
  const comparePeriod = useMemo(() => getComparePeriod(period), [period]);
  
  const formatPeriodLabel = useCallback((p: PeriodRange) => {
    if (p.preset) {
      const labels: Record<string, string> = {
        'today': 'اليوم',
        'yesterday': 'أمس',
        'this-week': 'هذا الأسبوع',
        'last-week': 'الأسبوع الماضي',
        'this-month': 'هذا الشهر',
        'last-month': 'الشهر الماضي',
        'this-quarter': 'هذا الربع',
        'last-quarter': 'الربع الماضي',
        'this-year': 'هذه السنة',
        'last-year': 'السنة الماضية',
      };
      return labels[p.preset] || `${p.from} → ${p.to}`;
    }
    return `${p.from} → ${p.to}`;
  }, []);
  
  return {
    comparePeriod,
    currentLabel: formatPeriodLabel(period),
    compareLabel: comparePeriod ? formatPeriodLabel(comparePeriod) : null,
    hasComparison: !!comparePeriod,
  };
}

// ============================================================
// Hook لمؤشرات KPI مع تنسيق موحد
// ============================================================

export function useKPIs(kpis: KPIValue[], familyId?: string) {
  const familyMetrics = useMemo(() => {
    if (!familyId) return kpis;
    const familyKPIs = FAMILY_KPI_METRICS[familyId] || [];
    return kpis.filter(k => familyKPIs.includes(k.id));
  }, [kpis, familyId]);
  
  const formattedKPIs = useMemo(() => familyMetrics.map(kpi => ({
    ...kpi,
    formattedValue: formatMetricValue(kpi.value, kpi.id),
    formattedDelta: kpi.delta !== undefined ? `${kpi.delta >= 0 ? '+' : ''}${kpi.delta.toFixed(1)}%` : null,
    formattedDeltaAbs: kpi.deltaAbs !== undefined ? formatMetricValue(kpi.deltaAbs, kpi.id) : null,
    trendColor: getTrendColor(kpi.direction, kpi.delta),
    trendIcon: getTrendIcon(kpi.delta),
  })), [familyMetrics]);
  
  return { kpis: formattedKPIs, rawKPIs: familyMetrics };
}

function formatMetricValue(value: number, metricId: MetricId): string {
  const metric = METRICS_DICTIONARY[metricId];
  if (!metric) return new Intl.NumberFormat('ar-SA').format(value);
  
  switch (metric.format) {
    case 'currency': return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(value);
    case 'percent': return new Intl.NumberFormat('ar-SA', { style: 'percent', minimumFractionDigits: 1 }).format(value / 100);
    case 'number': return new Intl.NumberFormat('ar-SA').format(value);
    case 'days': return `${new Intl.NumberFormat('ar-SA').format(value)} يوم`;
    case 'quantity': return new Intl.NumberFormat('ar-SA').format(value);
    default: return new Intl.NumberFormat('ar-SA').format(value);
  }
}

function getTrendColor(direction: 'up-is-good' | 'down-is-good' | 'neutral', delta?: number): string {
  if (delta === undefined || delta === null) return 'text-slate-500';
  if (direction === 'up-is-good') return delta >= 0 ? 'text-emerald-600' : 'text-rose-600';
  if (direction === 'down-is-good') return delta <= 0 ? 'text-emerald-600' : 'text-rose-600';
  return 'text-slate-500';
}

function getTrendIcon(delta?: number): string {
  if (delta === undefined || delta === null) return '—';
  return delta >= 0 ? '▲' : '▼';
}

// استيراد قاموس المقاييس للتنسيق
import { METRICS_DICTIONARY } from '../data/metricsDictionary';

// ============================================================
// Hook للجدول مع ترتيب وتجميع
// ============================================================

export interface UseReportTableOptions {
  rows: AggregatedRow[];
  totals: AggregatedRow | null;
  defaultSort?: { column: string; direction: 'asc' | 'desc' };
  groupBy?: string;
}

export function useReportTable({ rows, totals, defaultSort, groupBy }: UseReportTableOptions) {
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(
    defaultSort || null
  );
  
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  const sortedRows = useMemo(() => {
    if (!sortConfig) return rows;
    
    return [...rows].sort((a, b) => {
      const aVal = a[sortConfig.column];
      const bVal = b[sortConfig.column];
      
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [rows, sortConfig]);
  
  const handleSort = useCallback((column: string) => {
    setSortConfig(prev => ({
      column,
      direction: prev?.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);
  
  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  }, []);
  
  const isGroupExpanded = useCallback((groupKey: string) => expandedGroups.has(groupKey), [expandedGroups]);
  
  // تجميع الصفوف
  const groupedRows = useMemo(() => {
    if (!groupBy) return { groups: null, rows: sortedRows };
    
    const groups = new Map<string, AggregatedRow[]>();
    sortedRows.forEach(row => {
      const key = String(row[groupBy] || 'غير محدد');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    });
    
    return { groups, rows: sortedRows };
  }, [sortedRows, groupBy]);
  
  return {
    rows: sortedRows,
    totals,
    sortConfig,
    handleSort,
    groupedRows,
    expandedGroups,
    toggleGroup,
    isGroupExpanded,
  };
}