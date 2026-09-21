import React, { useMemo, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem, type ReportResult } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import type { BatchSalesRecord, DeliverySale, POSOrder, GoodsReceiptNote } from '../../../../types';

const moneyFmt = (v: unknown) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });

const monthBounds = (m: string) => {
  const [y, mm] = m.split('-');
  return `${y}-${mm}-01`;
};

/** تقرير الإيرادات وتكلفة المبيعات الشهري الموحد — حسب الفرع */
export const UnifiedMonthlyBranchReport: React.FC = () => {
  const { branches, visibleBranchIds, monthlyInventory, batchSalesRecords, deliverySales, posOrders, grnNotes } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const now = new Date().toISOString().slice(0, 7);
  const month = filters.to ? filters.to.slice(0, 7) : now;

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'monthlybranch', title: 'تقرير الإيرادات وتكلفة المبيعات الشهري', subtitle: 'إيرادات كل فرع وتكلفة المبيعات' }, [
      { name: 'batch', rows: batchSalesRecords, date: (r: BatchSalesRecord) => r.date, branch: (r: BatchSalesRecord) => r.branchId },
      { name: 'delivery', rows: deliverySales, date: (r: DeliverySale) => r.date, branch: (r: DeliverySale) => r.branchId },
      { name: 'pos', rows: posOrders, date: (r: POSOrder) => r.date, branch: (r: POSOrder) => r.branchId },
      { name: 'grn', rows: grnNotes, date: (r: GoodsReceiptNote) => r.date, branch: (r: GoodsReceiptNote) => r.branchId },
    ]);
    return e;
  }, [batchSalesRecords, deliverySales, posOrders, grnNotes]);

  const view = useMemo(() => {
    const s = engine.applyFilters('monthlybranch', filters);
    const batch = s[0].rows as BatchSalesRecord[];
    const delivery = s[1].rows as DeliverySale[];
    const pos = s[2].rows as POSOrder[];
    const grns = s[3].rows as GoodsReceiptNote[];

    const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck');

    const rows = visibleBranches.map((branch) => {
      const bId = branch.id;
      const inMonth = (d: string) => d.slice(0, 7) === month;

      const batchRev = batch.filter((r) => r.branchId === bId && inMonth(r.date)).reduce((sum, r) => sum + r.totalRevenue, 0);
      const deliveryRev = delivery.filter((r) => r.branchId === bId && inMonth(r.date)).reduce((sum, r) => sum + r.payoutAmount, 0);
      const posRev = pos.filter((o) => o.branchId === bId && inMonth(o.date)).reduce((sum, o) => sum + o.totalAmount, 0);
      const totalRevenue = batchRev + deliveryRev + posRev;

      const period = monthlyInventory.find((p) => p.branchId === bId && p.monthKey === month);
      const openingValue = period ? period.items.reduce((sum, it) => sum + (it.openingQty * it.unitCost), 0) : 0;
      const closingValue = period ? period.items.reduce((sum, it) => sum + (it.countedQty * it.unitCost), 0) : 0;

      const purchases = grns
        .filter((g) => g.status === 'approved' && g.branchId === bId && inMonth(g.date))
        .reduce((sum, g) => sum + g.items.reduce((a, i) => a + (i.quantityReceived * i.unitPrice), 0), 0);

      const costOfSales = openingValue + purchases - closingValue;
      const grossProfit = totalRevenue - costOfSales;
      const grossMargin = totalRevenue ? (grossProfit / totalRevenue) * 100 : 0;

      return { id: bId, branch: branch.nameAr, totalRevenue, openingValue, purchases, closingValue, costOfSales, grossProfit, grossMargin, hasPeriod: !!period };
    });

    const totals = rows.reduce((acc, r) => ({
      totalRevenue: acc.totalRevenue + r.totalRevenue,
      openingValue: acc.openingValue + r.openingValue,
      purchases: acc.purchases + r.purchases,
      closingValue: acc.closingValue + r.closingValue,
      costOfSales: acc.costOfSales + r.costOfSales,
      grossProfit: acc.grossProfit + r.grossProfit,
    }), { totalRevenue: 0, openingValue: 0, purchases: 0, closingValue: 0, costOfSales: 0, grossProfit: 0 });
    const totalMargin = totals.totalRevenue ? (totals.grossProfit / totals.totalRevenue) * 100 : 0;

    const summaries: ReportSummaryItem[] = [
      { key: 'revenue', label: 'الإيراد الكلي للشهر', value: Math.round(totals.totalRevenue), tone: 'emerald' },
      { key: 'purchases', label: 'المشتريات', value: Math.round(totals.purchases), tone: 'indigo' },
      { key: 'costOfSales', label: 'تكلفة المبيعات', value: Math.round(totals.costOfSales), tone: 'rose' },
      { key: 'gross', label: 'صافي الربح', value: Math.round(totals.grossProfit), tone: totals.grossProfit >= 0 ? 'emerald' : 'rose' },
      { key: 'margin', label: 'الهامش %', value: totalMargin, tone: totalMargin >= 30 ? 'emerald' : totalMargin >= 15 ? 'amber' : 'rose', format: (v) => `${Number(v).toFixed(1)}%` },
    ];

    const table = new ReportTableBuilder()
      .addColumn(reportColumn('branch', 'الفرع'))
      .addColumn({ ...reportColumn('totalRevenue', 'الإيراد الكلي'), format: moneyFmt, aggregate: 'sum' })
      .addColumn({ ...reportColumn('openingValue', 'الجرد أول'), format: moneyFmt, aggregate: 'sum' })
      .addColumn({ ...reportColumn('purchases', 'المشتريات'), format: moneyFmt, aggregate: 'sum' })
      .addColumn({ ...reportColumn('closingValue', 'الجرد آخر'), format: moneyFmt, aggregate: 'sum' })
      .addColumn({ ...reportColumn('costOfSales', 'تكلفة المبيعات'), format: moneyFmt, aggregate: 'sum' })
      .addColumn({ ...reportColumn('grossProfit', 'صافي الربح'), format: moneyFmt, aggregate: 'sum', tone: 'auto-money' })
      .addColumn({ ...reportColumn('grossMargin', 'الهامش %'), format: (v) => `${Number(v).toFixed(1)}%` })
      .addRows(rows.map(({ hasPeriod: _hp, ...vals }) => ({ id: vals.id, values: vals })))
      .build();

    const result: ReportResult = {
      id: 'monthlybranch',
      title: 'تقرير الإيرادات وتكلفة المبيعات الشهري الموحد',
      subtitle: `الشهر ${month} — الإيراد الكلي = جرد أول + مشتريات − جرد آخر`,
      summaries,
      tables: [table],
      exportSheets: [{
        name: 'إيرادات وتكلفة',
        header: ['الفرع', 'إيراد المبيعات', 'إيراد التوصيل', 'إيراد POS', 'الإجمالي', 'الجرد أول', 'المشتريات', 'الجرد آخر', 'تكلفة المبيعات', 'صافي الربح', 'الهامش %'],
        rows: rows.map((r) => [r.branch, batch.filter((x) => x.branchId === r.id && x.date.slice(0, 7) === month).reduce((sum, x) => sum + x.totalRevenue, 0), delivery.filter((x) => x.branchId === r.id && x.date.slice(0, 7) === month).reduce((sum, x) => sum + x.payoutAmount, 0), pos.filter((x) => x.branchId === r.id && x.date.slice(0, 7) === month).reduce((sum, x) => sum + x.totalAmount, 0), r.totalRevenue, r.openingValue, r.purchases, r.closingValue, r.costOfSales, r.grossProfit, r.grossMargin.toFixed(1)]),
      }],
      generatedAt: new Date().toISOString(),
    };

    const extraFilters = (
      <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
        الشهر
        <input
          type="month"
          dir="ltr"
          value={month}
          onChange={(e) => {
            const m = e.target.value;
            if (!m) { setFilters({ ...filters, from: '', to: '' }); return; }
            const to = `${m}-31`;
            setFilters({ ...filters, from: monthBounds(m), to });
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
        />
      </label>
    );

    return { result, extraFilters, hasAnyPeriod: rows.some((r) => r.hasPeriod) };
  }, [engine, filters, month, branches, visibleBranchIds, monthlyInventory]);

  return (
    <ReportTemplate
      report={view.result}
      filters={filters}
      onFiltersChange={setFilters}
      extraFilters={view.extraFilters}
    />
  );
};

export default UnifiedMonthlyBranchReport;