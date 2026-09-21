import React, { useMemo, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn, reportPct } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import { salesTotals, salesByBranch, salesBySource, dailySalesSeries } from '../../utilities/salesMetrics';
import type { BatchSalesRecord } from '../../../../types';

const branchName = (id: string, getBranchName: (id: string) => string) =>
  id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id) || id;

/** تقرير المبيعات الموحد: إجماليات، حسب الفرع، حسب المصدر، وتوزيع يومي */
export const UnifiedSalesReport: React.FC = () => {
  const { batchSalesRecords, branches, getBranchName } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const branchOptions = useMemo(() => branches.map((b) => ({ id: b.id, name: b.nameAr })), [branches]);

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'sales', title: 'المبيعات الموحدة', subtitle: 'إجماليات، توزيع حسب الفرع والمصدر، وسلسلة يومية' }, [
      { name: 'sales', rows: batchSalesRecords, date: (r: BatchSalesRecord) => r.date, branch: (r: BatchSalesRecord) => r.branchId },
    ]);
    return e;
  }, [batchSalesRecords]);

  const result = useMemo(() => {
    const sources = engine.applyFilters('sales', filters);
    const rows = sources[0].rows as BatchSalesRecord[];
    const t = salesTotals(rows);
    const branchesArr = salesByBranch(rows);
    const sourcesArr = salesBySource(rows);
    const daily = dailySalesSeries(rows);
    const avgRevenue = filters.from || filters.to ? (rows.length ? t.revenue / Math.max(1, new Set(rows.map((r) => r.date)).size) : 0) : 0;

    const summaries: ReportSummaryItem[] = [
      { key: 'revenue', label: 'إجمالي الإيراد', value: t.revenue, tone: 'indigo' },
      { key: 'net', label: 'صافي الإيراد', value: t.netRevenue || t.revenue - t.commissionAmount },
      { key: 'foodCost', label: 'تكلفة الطعام', value: t.foodCost, tone: 'amber' },
      { key: 'vat', label: 'الضريبة', value: t.vatAmount, tone: 'rose' },
      { key: 'commission', label: 'عمولات التوصيل', value: t.commissionAmount, tone: 'amber' },
      { key: 'avg', label: 'متوسط الإيراد اليومي', value: avgRevenue, tone: 'emerald' },
    ];

    const t1 = new ReportTableBuilder()
      .addColumn(reportColumn('branch', 'الفرع'))
      .addColumn({ ...reportColumn('revenue', 'الإيراد'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('foodCost', 'تكلفة الطعام'), aggregate: 'sum' })
      .addColumn(reportPct('share', 'المساهمة %'))
      .addColumn({ ...reportColumn('commission', 'العمولات'), aggregate: 'sum' })
      .addRows(branchesArr.map((b) => ({
        id: b.branchId,
        values: { branch: branchName(b.branchId, getBranchName), revenue: b.revenue, foodCost: b.foodCost, share: b.sharePct, commission: b.commission },
      })));

    const t2 = new ReportTableBuilder()
      .addColumn(reportColumn('source', 'المصدر'))
      .addColumn({ ...reportColumn('revenue', 'الإيراد'), aggregate: 'sum' })
      .addColumn(reportPct('share', 'المساهمة %'))
      .addRows(sourcesArr.map((s) => ({
        id: s.source,
        values: { source: s.label, revenue: s.revenue, share: s.sharePct },
      })));

    const t3 = new ReportTableBuilder()
      .addColumn(reportColumn('date', 'التاريخ'))
      .addColumn({ ...reportColumn('revenue', 'الإيراد'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('foodCost', 'تكلفة الطعام'), aggregate: 'sum' })
      .addRows(daily.map((d) => ({
        id: d.date,
        values: { date: d.date, revenue: d.revenue, foodCost: d.foodCost },
      })));

    return {
      id: 'sales',
      title: 'المبيعات الموحدة',
      subtitle: 'إجماليات، توزيع حسب الفرع والمصدر، وسلسلة يومية',
      summaries,
      tables: [t1.build(), t2.build(), t3.build()],
      exportSheets: [
        { name: 'إجمالي المبيعات', header: ['البند', 'القيمة'], rows: [['الإيراد', t.revenue], ['صافي الإيراد', t.netRevenue || t.revenue - t.commissionAmount], ['تكلفة الطعام', t.foodCost], ['الضريبة', t.vatAmount], ['عمولات التوصيل', t.commissionAmount], ['الصافي بعد العمولات', t.netAfterCommission || t.revenue - t.commissionAmount]] },
        { name: 'حسب الفرع', header: ['الفرع', 'الإيراد', 'تكلفة الطعام', 'المساهمة %', 'العمولات'], rows: branchesArr.map((b) => [branchName(b.branchId, getBranchName), b.revenue, b.foodCost, `${b.sharePct.toFixed(2)}%`, b.commission]) },
        { name: 'حسب المصدر', header: ['المصدر', 'الإيراد', 'المساهمة %'], rows: sourcesArr.map((s) => [s.label, s.revenue, `${s.sharePct.toFixed(2)}%`]) },
        { name: 'يومي', header: ['التاريخ', 'الإيراد', 'تكلفة الطعام'], rows: daily.map((d) => [d.date, d.revenue, d.foodCost]) },
      ],
      generatedAt: new Date().toISOString(),
    };
  }, [engine, filters, getBranchName]);

  return (
    <ReportTemplate
      report={result}
      filters={filters}
      onFiltersChange={setFilters}
      branches={branchOptions}
    />
  );
};

export default UnifiedSalesReport;