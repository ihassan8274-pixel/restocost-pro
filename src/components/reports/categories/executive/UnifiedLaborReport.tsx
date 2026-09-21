import React, { useMemo, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import type { LaborShift } from '../../../../types';

const branchName = (id: string, getBranchName: (id: string) => string) =>
  id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id) || id;

/** تقرير العمالة الموحد: تكلفة الورديات حسب الفرع والموظف */
export const UnifiedLaborReport: React.FC = () => {
  const { shifts, branches, getBranchName } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const branchOptions = useMemo(() => branches.map((b) => ({ id: b.id, name: b.nameAr })), [branches]);

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'labor', title: 'العمالة الموحدة', subtitle: 'تكلفة الورديات حسب الفرع والموظف' }, [
      { name: 'shifts', rows: shifts, date: (r: LaborShift) => r.date, branch: (r: LaborShift) => r.branchId },
    ]);
    return e;
  }, [shifts]);

  const result = useMemo(() => {
    const sources = engine.applyFilters('labor', filters);
    const rows = sources[0].rows as LaborShift[];

    const totalCost = rows.reduce((s, r) => s + (r.totalShiftCost || 0), 0);
    const totalHours = rows.reduce((s, r) => s + (r.hoursWorked || 0), 0);
    const totalOrders = rows.reduce((s, r) => s + (r.ordersHandled || 0), 0);

    const byBranch = new Map<string, { cost: number; hours: number }>();
    rows.forEach((r) => {
      const b = byBranch.get(r.branchId) || { cost: 0, hours: 0 };
      b.cost += r.totalShiftCost || 0;
      b.hours += r.hoursWorked || 0;
      byBranch.set(r.branchId, b);
    });

    const summaries: ReportSummaryItem[] = [
      { key: 'cost', label: 'إجمالي تكلفة العمالة', value: totalCost, tone: 'indigo' },
      { key: 'hours', label: 'إجمالي الساعات', value: totalHours },
      { key: 'orders', label: 'طلبات المتعامل معها', value: totalOrders },
      { key: 'avgHour', label: 'متوسط تكلفة الساعة', value: totalHours ? totalCost / totalHours : 0, format: (v) => `${Number(v).toFixed(2)} ر.س` },
    ];

    const t1 = new ReportTableBuilder()
      .addColumn(reportColumn('branch', 'الفرع'))
      .addColumn({ ...reportColumn('cost', 'التكلفة'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('hours', 'الساعات'), aggregate: 'sum' })
      .addRows(Array.from(byBranch.entries()).map(([id, b]) => ({
        id,
        values: { branch: branchName(id, getBranchName), cost: b.cost, hours: b.hours },
      })));

    const t2 = new ReportTableBuilder()
      .addColumn(reportColumn('employee', 'الموظف'))
      .addColumn(reportColumn('branch', 'الفرع'))
      .addColumn(reportColumn('date', 'التاريخ'))
      .addColumn(reportColumn('hours', 'الساعات'))
      .addColumn({ ...reportColumn('overtime', 'الإضافي') })
      .addColumn({ ...reportColumn('cost', 'التكلفة'), aggregate: 'sum' })
      .addRows(rows.map((r) => ({
        id: r.id,
        values: { employee: r.employeeName, branch: branchName(r.branchId, getBranchName), date: r.date, hours: r.hoursWorked, overtime: r.overtimeHours || 0, cost: r.totalShiftCost },
      })));

    return {
      id: 'labor',
      title: 'العمالة الموحدة',
      subtitle: 'تكلفة الورديات حسب الفرع والموظف',
      summaries,
      tables: [t1.build(), t2.build()],
      exportSheets: [
        { name: 'ملخص العمالة', header: ['البند', 'القيمة'], rows: [['التكلفة', totalCost], ['الساعات', totalHours], ['الطلبات', totalOrders], ['متوسط تكلفة الساعة', totalHours ? (totalCost / totalHours).toFixed(2) : 0]] },
        { name: 'حسب الفرع', header: ['الفرع', 'التكلفة', 'الساعات'], rows: Array.from(byBranch.entries()).map(([id, b]) => [branchName(id, getBranchName), b.cost, b.hours]) },
        { name: 'تفاصيل الورديات', header: ['الموظف', 'الفرع', 'التاريخ', 'الساعات', 'الإضافي', 'التكلفة'], rows: rows.map((r) => [r.employeeName, branchName(r.branchId, getBranchName), r.date, r.hoursWorked, r.overtimeHours || 0, r.totalShiftCost]) },
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

export default UnifiedLaborReport;