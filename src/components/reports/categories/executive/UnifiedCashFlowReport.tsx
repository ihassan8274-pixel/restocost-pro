import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem, type ReportResult } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import { fmt, monthLabel } from '../../../../utils/helpers';
import type { POSOrder, LaborShift, OperatingExpense, Invoice, GoodsReceiptNote, FixedAsset, BatchSalesRecord } from '../../../../types';

const moneyFmt = (v: unknown) => fmt(Number(v), 0);

const SRC_KEYS = {
  month: (d?: string) => (d || '').slice(0, 7),
} as const;

/** قائمة التدفقات النقدية الموحدة — مقبوضات ومدفوعات واستثمارات حسب الفترة والفرع */
export const UnifiedCashFlowReport: React.FC = () => {
  const { posOrders, batchSalesRecords, invoices, operatingExpenses, grnNotes, shifts, fixedAssets, branches } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const branchOptions = useMemo(() => branches.map((b) => ({ id: b.id, name: b.nameAr })), [branches]);

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'cashflow', title: 'التدفقات النقدية', subtitle: 'المقبوضات والمدفوعات الفعلية وصافي التدفق النقدي' }, [
      { name: 'pos', rows: posOrders, date: (r: POSOrder) => r.date, branch: (r: POSOrder) => r.branchId },
      { name: 'batch', rows: batchSalesRecords, date: (r: BatchSalesRecord) => r.date, branch: (r: BatchSalesRecord) => r.branchId },
      { name: 'invoices', rows: invoices, date: (r: Invoice) => r.date, branch: (r: Invoice) => r.branchId },
      { name: 'expenses', rows: operatingExpenses, date: (r: OperatingExpense) => r.createdAt, branch: (r: OperatingExpense) => r.branchId },
      { name: 'grn', rows: grnNotes, date: (r: GoodsReceiptNote) => r.date, branch: (r: GoodsReceiptNote) => r.branchId },
      { name: 'shifts', rows: shifts, date: (r: LaborShift) => r.date, branch: (r: LaborShift) => r.branchId },
      { name: 'assets', rows: fixedAssets, date: (r: FixedAsset) => r.purchaseDate, branch: (r: FixedAsset) => r.branchId },
    ]);
    return e;
  }, [posOrders, batchSalesRecords, invoices, operatingExpenses, grnNotes, shifts, fixedAssets]);

  const view = useMemo(() => {
    const s = engine.applyFilters('cashflow', filters);
    const pos = s[0].rows as POSOrder[];
    const batch = s[1].rows as BatchSalesRecord[];
    const invs = s[2].rows as Invoice[];
    const exps = s[3].rows as OperatingExpense[];
    const grns = s[4].rows as GoodsReceiptNote[];
    const shfts = s[5].rows as LaborShift[];
    const assets = s[6].rows as FixedAsset[];

    const inflow = {
      pos: pos.reduce((sum, o) => sum + (o.subtotal || 0), 0),
      batch: batch.reduce((sum, b) => sum + (b.totalRevenue || 0), 0),
      invoiceSales: invs.filter((i) => i.type === 'sales').reduce((sum, i) => sum + (i.paidAmount || 0), 0),
    };
    const outflow = {
      expenses: exps.filter((e) => e.paymentStatus === 'paid').reduce((sum, e) => sum + (e.amount || 0), 0),
      invoicePurchase: invs.filter((i) => i.type === 'purchase').reduce((sum, i) => sum + (i.paidAmount || 0), 0),
      grn: grns.reduce((sum, g) => sum + (g.totalAmount || 0), 0),
      labor: shfts.reduce((sum, sh) => sum + (sh.totalShiftCost || 0), 0),
    };
    const investing = assets.filter((a) => a.isActive).reduce((sum, a) => sum + (a.purchaseCost || 0), 0);

    const totalInflow = inflow.pos + inflow.batch + inflow.invoiceSales;
    const totalOutflow = outflow.expenses + outflow.invoicePurchase + outflow.grn + outflow.labor;
    const operatingNet = totalInflow - totalOutflow;
    const netCash = operatingNet - investing;

    const monthlyMap = new Map<string, { inflows: number; outflows: number; investing: number }>();
    const addM = (d: string, bucket: 'inflows' | 'outflows' | 'investing', v: number) => {
      const k = SRC_KEYS.month(d);
      if (!k) return;
      const m = monthlyMap.get(k) || { inflows: 0, outflows: 0, investing: 0 };
      m[bucket] += v || 0;
      monthlyMap.set(k, m);
    };
    pos.forEach((o) => addM(o.date, 'inflows', o.subtotal));
    batch.forEach((b) => addM(b.date, 'inflows', b.totalRevenue));
    invs.forEach((i) => i.type === 'sales' ? addM(i.date, 'inflows', i.paidAmount) : addM(i.date, 'outflows', i.paidAmount));
    exps.filter((e) => e.paymentStatus === 'paid').forEach((e) => addM(e.createdAt, 'outflows', e.amount));
    grns.forEach((g) => addM(g.date, 'outflows', g.totalAmount));
    shfts.forEach((sh) => addM(sh.date, 'outflows', sh.totalShiftCost));
    assets.filter((a) => a.isActive).forEach((a) => addM(a.purchaseDate, 'investing', a.purchaseCost));

    const monthly = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({
        month: monthLabel(k),
        inflows: Math.round(v.inflows),
        outflows: Math.round(v.outflows),
        investing: Math.round(v.investing),
        net: Math.round(v.inflows - v.outflows - v.investing),
      }));

    const summaries: ReportSummaryItem[] = [
      { key: 'inflow', label: 'إجمالي المقبوضات', value: Math.round(totalInflow), tone: 'emerald' },
      { key: 'outflow', label: 'إجمالي المدفوعات', value: Math.round(totalOutflow), tone: 'rose' },
      { key: 'opNet', label: 'صافي التدفق التشغيلي', value: Math.round(operatingNet), tone: 'indigo' },
      { key: 'netCash', label: 'صافي التغير النقدي', value: Math.round(netCash), tone: netCash < 0 ? 'rose' : 'default' },
    ];

    const components = [
      { key: 'pos', label: 'مبيعات نقاط البيع', value: inflow.pos },
      { key: 'batch', label: 'مبيعات مجمعة', value: inflow.batch },
      { key: 'invs', label: 'تحصيل فواتير المبيعات', value: inflow.invoiceSales },
    ];
    const payments = [
      { key: 'exp', label: 'مصاريف تشغيلية مدفوعة', value: outflow.expenses },
      { key: 'pur', label: 'دفعات فواتير المشتريات', value: outflow.invoicePurchase },
      { key: 'grn', label: 'شراء مخزون (استلام GRN)', value: outflow.grn },
      { key: 'labor', label: 'تكلفة العمالة', value: outflow.labor },
    ];

    const statementTable = new ReportTableBuilder()
      .addColumn(reportColumn('label', 'البند'))
      .addColumn({ ...reportColumn('amount', 'القيمة'), format: moneyFmt, tone: 'auto-money' })
      .addRows([
        ...components.map((c) => ({ id: c.key, values: { label: `+ ${c.label}`, amount: Math.round(c.value) } })),
        { id: 'totIn', values: { label: 'إجمالي المقبوضات التشغيلية', amount: Math.round(totalInflow) } },
        ...payments.map((c) => ({ id: c.key, values: { label: `- ${c.label}`, amount: -Math.round(c.value) } })),
        { id: 'totOut', values: { label: 'إجمالي المدفوعات التشغيلية', amount: -Math.round(totalOutflow) } },
        { id: 'opNet', values: { label: 'صافي التدفق التشغيلي', amount: Math.round(operatingNet) } },
        { id: 'invest', values: { label: '- شراء أصول ثابتة', amount: -Math.round(investing) } },
        { id: 'net', values: { label: 'صافي التغير النقدي للفترة', amount: Math.round(netCash) } },
      ]);

    const monthlyTable = new ReportTableBuilder()
      .addColumn(reportColumn('month', 'الشهر'))
      .addColumn({ ...reportColumn('inflows', 'المقبوضات'), format: moneyFmt })
      .addColumn({ ...reportColumn('outflows', 'المدفوعات'), format: moneyFmt })
      .addColumn({ ...reportColumn('investing', 'استثماري'), format: moneyFmt })
      .addColumn({ ...reportColumn('net', 'صافي التدفق'), format: moneyFmt, tone: 'auto-money' })
      .addRows(monthly.map((m) => ({ id: m.month, values: m })));

    const result: ReportResult = {
      id: 'cashflow',
      title: 'قائمة التدفقات النقدية الموحدة',
      subtitle: 'المقبوضات والمدفوعات الفعلية وصافي التدفق النقدي حسب الفترة والفرع',
      summaries,
      tables: [statementTable.build(), monthlyTable.build()],
      exportSheets: [
        { name: 'قائمة التدفقات', header: ['البند', 'القيمة'], rows: [['مبيعات نقاط البيع', inflow.pos], ['مبيعات مجمعة', inflow.batch], ['تحصيل فواتير المبيعات', inflow.invoiceSales], ['إجمالي المقبوضات', totalInflow], ['مصاريف تشغيلية مدفوعة', outflow.expenses], ['دفعات فواتير المشتريات', outflow.invoicePurchase], ['شراء مخزون (GRN)', outflow.grn], ['تكلفة العمالة', outflow.labor], ['إجمالي المدفوعات', totalOutflow], ['صافي التشغيلي', operatingNet], ['استثماري', investing], ['صافي التغير النقدي', netCash]] },
        { name: 'التدفق الشهري', header: ['الشهر', 'المقبوضات', 'المدفوعات', 'استثماري', 'صافي'], rows: monthly.map((m) => [m.month, m.inflows, m.outflows, m.investing, m.net]) },
      ],
      generatedAt: new Date().toISOString(),
    };

    const visuals = (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs mb-3">الاتجاه الشهري: مقبوضات مقابل مدفوعات</h3>
        <div dir="ltr" className="h-64">
          {monthly.length === 0
            ? <p className="h-64 flex items-center justify-center text-xs font-bold text-slate-500">لا توجد بيانات لهذه الفترة</p>
            : <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={moneyFmt} />
                  <Tooltip formatter={(v: unknown, name?: unknown) => [moneyFmt(v), { inflows: 'المقبوضات', outflows: 'المدفوعات', investing: 'استثماري' }[String(name)] || String(name)]} />
                  <Legend formatter={(v: string) => ({ inflows: 'المقبوضات', outflows: 'المدفوعات', investing: 'استثماري' }[v] || v)} />
                  <Bar dataKey="inflows" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflows" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="investing" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>}
        </div>
      </div>
    );

    return { result, visuals };
  }, [engine, filters]);

  return (
    <ReportTemplate
      report={view.result}
      filters={filters}
      onFiltersChange={setFilters}
      branches={branchOptions}
      visuals={view.visuals}
    />
  );
};

export default UnifiedCashFlowReport;