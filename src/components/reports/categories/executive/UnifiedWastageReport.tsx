import React, { useMemo, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn, reportPct } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import { fmt } from '../../../../utils/helpers';
import { totalWastageCost } from '../../utilities/financialMetrics';
import { wastageRate } from '../../utilities/inventoryMetrics';
import type { WastageLog, BatchSalesRecord } from '../../../../types';

const branchName = (id: string, getBranchName: (id: string) => string) =>
  id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id) || id;

/** تقرير الهالك الموحد: إجمالي، توزيع حسب الفرع/التصنيف، ومعدل الضياع من الإيراد */
export const UnifiedWastageReport: React.FC = () => {
  const { wastageLogs, batchSalesRecords, branches, getBranchName } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const branchOptions = useMemo(() => branches.map((b) => ({ id: b.id, name: b.nameAr })), [branches]);

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'wastage', title: 'الهالك والضياع الموحد', subtitle: 'تحليل الهالك حسب الفرع والتصنيف ونسبته من الإيراد' }, [
      { name: 'sales', rows: batchSalesRecords, date: (r: BatchSalesRecord) => r.date, branch: (r: BatchSalesRecord) => r.branchId },
      { name: 'wastage', rows: wastageLogs, date: (r: WastageLog) => r.date, branch: (r: WastageLog) => r.branchId },
    ]);
    return e;
  }, [wastageLogs, batchSalesRecords]);

  const result = useMemo(() => {
    const sources = engine.applyFilters('wastage', filters);
    const sales = sources[0].rows as BatchSalesRecord[];
    const was = sources[1].rows as WastageLog[];

    const revenue = sales.reduce((s, r) => s + (r.totalRevenue || 0), 0);
    const wastageCost = totalWastageCost(was);
    const rate = wastageRate(wastageCost, revenue);

    const byCategory = new Map<string, number>();
    was.forEach((w) => byCategory.set(w.category, (byCategory.get(w.category) || 0) + (w.totalCostImpact || 0)));

    const byBranch = new Map<string, number>();
    was.forEach((w) => byBranch.set(w.branchId, (byBranch.get(w.branchId) || 0) + (w.totalCostImpact || 0)));

    const summaries: ReportSummaryItem[] = [
      { key: 'total', label: 'إجمالي الهالك', value: wastageCost, tone: 'rose' },
      { key: 'rate', label: 'نسبة الهالك من الإيراد', value: rate, format: (v) => `${fmt(Number(v))}%` },
      { key: 'orders', label: 'عدد سجلات الهالك', value: was.length },
    ];

    const t1 = new ReportTableBuilder()
      .addColumn(reportColumn('branch', 'الفرع'))
      .addColumn({ ...reportColumn('cost', 'قيمة الهالك'), aggregate: 'sum' })
      .addRows(Array.from(byBranch.entries()).map(([id, cost]) => ({
        id,
        values: { branch: branchName(id, getBranchName), cost },
      })));

    const t2 = new ReportTableBuilder()
      .addColumn(reportColumn('category', 'التصنيف'))
      .addColumn({ ...reportColumn('cost', 'القيمة'), aggregate: 'sum' })
      .addColumn(reportPct('share', 'النسبة %'))
      .addRows(Array.from(byCategory.entries()).map(([cat, cost]) => ({
        id: cat,
        values: { category: cat, cost, share: wastageCost ? (cost / wastageCost) * 100 : 0 },
      })));

    return {
      id: 'wastage',
      title: 'الهالك والضياع الموحد',
      subtitle: 'تحليل الهالك حسب الفرع والتصنيف ونسبته من الإيراد',
      summaries,
      tables: [t1.build(), t2.build()],
      exportSheets: [
        { name: 'ملخص الهالك', header: ['البند', 'القيمة'], rows: [['إجمالي الهالك', wastageCost], ['نسبة الهالك من الإيراد', `${rate.toFixed(2)}%`], ['عدد السجلات', was.length]] },
        { name: 'حسب الفرع', header: ['الفرع', 'قيمة الهالك'], rows: Array.from(byBranch.entries()).map(([id, cost]) => [branchName(id, getBranchName), cost]) },
        { name: 'حسب التصنيف', header: ['التصنيف', 'القيمة', 'النسبة %'], rows: Array.from(byCategory.entries()).map(([cat, cost]) => [cat, cost, `${wastageCost ? (cost / wastageCost * 100).toFixed(2) : '0.00'}%`]) },
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

export default UnifiedWastageReport;