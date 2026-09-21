import React, { useMemo, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn, reportPct } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import { EXPENSE_CATEGORY_LABELS } from '../../../../utils/helpers';
import { summarizeExpenses } from '../../utilities/financialMetrics';
import type { OperatingExpense } from '../../../../types';

const branchName = (id: string, getBranchName: (id: string) => string) =>
  id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id) || id;

const CATEGORY_LABEL = (cat: string) => EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat;

/** تقرير المصاريف التشغيلية الموحد: حسب الحالة والفئة والفرع */
export const UnifiedExpensesReport: React.FC = () => {
  const { operatingExpenses, branches, getBranchName } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const branchOptions = useMemo(() => branches.map((b) => ({ id: b.id, name: b.nameAr })), [branches]);

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'expenses', title: 'المصاريف التشغيلية الموحدة', subtitle: 'حسب الحالة والفئة والفرع' }, [
      { name: 'expenses', rows: operatingExpenses, date: (r: OperatingExpense) => r.dueDate, branch: (r: OperatingExpense) => r.branchId, status: (r: OperatingExpense) => r.paymentStatus },
    ]);
    return e;
  }, [operatingExpenses]);

  const result = useMemo(() => {
    const sources = engine.applyFilters('expenses', filters);
    const rows = sources[0].rows as OperatingExpense[];
    const s = summarizeExpenses(rows);

    const byCategory = new Map<string, number>();
    const paidOnly = rows.filter((e) => e.paymentStatus === 'paid');
    paidOnly.forEach((e) => byCategory.set(e.category, (byCategory.get(e.category) || 0) + (e.amount || 0)));

    const byBranch = new Map<string, number>();
    paidOnly.forEach((e) => byBranch.set(e.branchId, (byBranch.get(e.branchId) || 0) + (e.amount || 0)));

    const summaries: ReportSummaryItem[] = [
      { key: 'total', label: 'إجمالي المصاريف', value: s.total, tone: 'rose' },
      { key: 'paid', label: 'مدفوع', value: s.paid, tone: 'emerald' },
      { key: 'pending', label: 'مستحق', value: s.pending, tone: 'amber' },
      { key: 'overdue', label: 'متأخر', value: s.overdue, tone: 'rose' },
    ];

    const t1 = new ReportTableBuilder()
      .addColumn(reportColumn('category', 'الفئة'))
      .addColumn({ ...reportColumn('cost', 'المبلغ'), aggregate: 'sum' })
      .addColumn(reportPct('share', 'النسبة %'))
      .addRows(Array.from(byCategory.entries()).map(([cat, cost]) => ({
        id: cat,
        values: { category: CATEGORY_LABEL(cat), cost, share: s.paid ? (cost / s.paid) * 100 : 0 },
      })));

    const t2 = new ReportTableBuilder()
      .addColumn(reportColumn('branch', 'الفرع'))
      .addColumn({ ...reportColumn('cost', 'المبلغ'), aggregate: 'sum' })
      .addRows(Array.from(byBranch.entries()).map(([id, cost]) => ({
        id,
        values: { branch: branchName(id, getBranchName), cost },
      })));

    return {
      id: 'expenses',
      title: 'المصاريف التشغيلية الموحدة',
      subtitle: 'حسب الحالة والفئة والفرع',
      summaries,
      tables: [t1.build(), t2.build()],
      exportSheets: [
        { name: 'ملخص المصاريف', header: ['البند', 'القيمة'], rows: [['إجمالي', s.total], ['مدفوع', s.paid], ['مستحق', s.pending], ['متأخر', s.overdue]] },
        { name: 'حسب الفئة', header: ['الفئة', 'المبلغ', 'النسبة %'], rows: Array.from(byCategory.entries()).map(([cat, cost]) => [CATEGORY_LABEL(cat), cost, `${s.paid ? (cost / s.paid * 100).toFixed(2) : '0.00'}%`]) },
        { name: 'حسب الفرع', header: ['الفرع', 'المبلغ'], rows: Array.from(byBranch.entries()).map(([id, cost]) => [branchName(id, getBranchName), cost]) },
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
      showStatus
      statusOptions={[{ value: 'paid', label: 'مدفوع' }, { value: 'pending', label: 'مستحق' }, { value: 'overdue', label: 'متأخر' }]}
    />
  );
};

export default UnifiedExpensesReport;