import React, { useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, Landmark, FileDown, Printer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, downloadCSV, monthLabel } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

const moneyFmt = (v: unknown) => fmt(Number(v), 0);

export const CashFlowView: React.FC = () => {
  const { posOrders, batchSalesRecords, invoices, operatingExpenses, grnNotes, shifts, fixedAssets, branches } = useApp();

  const allMonths = useMemo(() => {
    const keys = new Set<string>();
    const add = (d?: string) => { if (d && d.length >= 7) keys.add(d.slice(0, 7)); };
    posOrders.forEach((o) => add(o.date));
    batchSalesRecords.forEach((b) => add(b.date));
    invoices.forEach((i) => add(i.date));
    operatingExpenses.forEach((e) => add(e.createdAt));
    grnNotes.forEach((g) => add(g.date));
    shifts.forEach((s) => add(s.date));
    fixedAssets.forEach((a) => add(a.purchaseDate));
    return Array.from(keys).sort();
  }, [posOrders, batchSalesRecords, invoices, operatingExpenses, grnNotes, shifts, fixedAssets]);

  const [period, setPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const scope = useMemo(() => {
    const m = (d?: string) => (d ? d.slice(0, 7) : '');
    const inScope = (d?: string, branchId?: string) => (!period || m(d) === period) && (branchFilter === 'all' || branchId === branchFilter);

    const inflow = { pos: 0, batch: 0, invoiceSales: 0 };
    const outflow = { expenses: 0, invoicePurchase: 0, grn: 0, labor: 0 };
    let investing = 0;

    posOrders.forEach((o) => { if (inScope(o.date, o.branchId)) inflow.pos += o.subtotal; });
    batchSalesRecords.forEach((b) => { if (inScope(b.date, b.branchId)) inflow.batch += b.totalRevenue; });
    invoices.forEach((i) => {
      if (!inScope(i.date, i.branchId)) return;
      if (i.type === 'sales') inflow.invoiceSales += i.paidAmount || 0;
      else outflow.invoicePurchase += i.paidAmount || 0;
    });
    operatingExpenses.forEach((e) => { if (e.paymentStatus === 'paid' && inScope(e.createdAt, e.branchId)) outflow.expenses += e.amount; });
    grnNotes.forEach((g) => { if (inScope(g.date, g.branchId)) outflow.grn += g.totalAmount; });
    shifts.forEach((s) => { if (inScope(s.date, s.branchId)) outflow.labor += s.totalShiftCost; });
    fixedAssets.forEach((a) => { if (a.isActive && inScope(a.purchaseDate, a.branchId)) investing += a.purchaseCost; });

    const totalInflow = inflow.pos + inflow.batch + inflow.invoiceSales;
    const totalOutflow = outflow.expenses + outflow.invoicePurchase + outflow.grn + outflow.labor;
    return { inflow, outflow, investing, totalInflow, totalOutflow, operatingNet: totalInflow - totalOutflow, netCash: totalInflow - totalOutflow - investing };
  }, [posOrders, batchSalesRecords, invoices, operatingExpenses, grnNotes, shifts, fixedAssets, period, branchFilter]);

  const monthly = useMemo(() => {
    const map: Record<string, { inflows: number; outflows: number; investing: number; net: number }> = {};
    const init = (k: string) => { if (!map[k]) map[k] = { inflows: 0, outflows: 0, investing: 0, net: 0 }; };
    const inBranch = (branchId?: string) => branchFilter === 'all' || branchId === branchFilter;
    posOrders.forEach((o) => { if (inBranch(o.branchId)) { const k = o.date.slice(0, 7); init(k); map[k].inflows += o.subtotal; } });
    batchSalesRecords.forEach((b) => { if (inBranch(b.branchId)) { const k = b.date.slice(0, 7); init(k); map[k].inflows += b.totalRevenue; } });
    invoices.forEach((i) => {
      if (!inBranch(i.branchId)) return;
      const k = i.date.slice(0, 7); init(k);
      if (i.type === 'sales') map[k].inflows += i.paidAmount || 0;
      else map[k].outflows += i.paidAmount || 0;
    });
    operatingExpenses.forEach((e) => { if (e.paymentStatus === 'paid' && inBranch(e.branchId)) { const k = e.createdAt.slice(0, 7); init(k); map[k].outflows += e.amount; } });
    grnNotes.forEach((g) => { if (inBranch(g.branchId)) { const k = g.date.slice(0, 7); init(k); map[k].outflows += g.totalAmount; } });
    shifts.forEach((s) => { if (inBranch(s.branchId)) { const k = s.date.slice(0, 7); init(k); map[k].outflows += s.totalShiftCost; } });
    fixedAssets.forEach((a) => { if (a.isActive && inBranch(a.branchId)) { const k = a.purchaseDate.slice(0, 7); init(k); map[k].investing += a.purchaseCost; } });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([k]) => !period || k === period)
      .map(([k, v]) => ({ month: monthLabel(k), inflows: Math.round(v.inflows), outflows: Math.round(v.outflows), investing: Math.round(v.investing), net: Math.round(v.inflows - v.outflows - v.investing) }));
  }, [posOrders, batchSalesRecords, invoices, operatingExpenses, grnNotes, shifts, fixedAssets, period, branchFilter]);

  const statementRows = [
    { label: 'المقبوضات التشغيلية', children: [
      { label: 'مبيعات نقاط البيع', value: scope.inflow.pos },
      { label: 'مبيعات مجمعة', value: scope.inflow.batch },
      { label: 'تحصيل فواتير المبيعات', value: scope.inflow.invoiceSales },
    ], isSection: true },
    { label: 'إجمالي المقبوضات التشغيلية', value: scope.totalInflow, isBold: true, highlight: true },
    { label: 'المدفوعات التشغيلية', children: [
      { label: 'مصاريف تشغيلية مدفوعة', value: scope.outflow.expenses },
      { label: 'دفعات فواتير المشتريات', value: scope.outflow.invoicePurchase },
      { label: 'شراء مخزون (استلام GRN)', value: scope.outflow.grn },
      { label: 'تكلفة العمالة', value: scope.outflow.labor },
    ], isSection: true },
    { label: 'إجمالي المدفوعات التشغيلية', value: scope.totalOutflow, isBold: true, highlight: true },
    { label: 'صافي التدفق التشغيلي', value: scope.operatingNet, isBold: true },
    { label: 'التدفقات الاستثمارية', children: [
      { label: 'شراء أصول ثابتة', value: scope.investing },
    ], isSection: true },
    { label: 'صافي التغير النقدي للفترة', value: scope.netCash, isBold: true, highlight: true },
  ];

  const exportRows = [
    { name: 'قائمة التدفقات النقدية', header: ['البند', 'القيمة'], rows: statementRows.flatMap((r) => r.children ? [['→ ' + r.label, '']].concat(r.children.map((c) => [c.label, String(c.value)])) : [[r.label, String(r.value)]]) },
    { name: 'التدفق الشهري', header: ['الشهر', 'المقبوضات', 'المدفوعات', 'استثماري', 'صافي'], rows: monthly.map((m) => [m.month, m.inflows, m.outflows, m.investing, m.net]) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="قائمة التدفقات النقدية" subtitle="المقبوضات والمدفوعات الفعلية وصافي التدفق النقدي حسب الفترة والفرع" icon={<Wallet className="w-6 h-6 text-emerald-300" />}
        actions={<>
          <ViewToolbar filename="التدفقات النقدية" sheets={exportRows} />
          <Btn tone="ghost" onClick={() => openPrintWindow({
            title: 'قائمة التدفقات النقدية',
            subtitle: `الفترة ${period ? monthLabel(period) : 'كل الفترات'} — ${branchFilter === 'all' ? 'كل الفروع' : branches.find((b) => b.id === branchFilter)?.nameAr || branchFilter}`,
            meta: [['إجمالي المقبوضات', moneyFmt(scope.totalInflow)], ['إجمالي المدفوعات', moneyFmt(scope.totalOutflow)], ['صافي التشغيلي', moneyFmt(scope.operatingNet)], ['صافي التغير النقدي', moneyFmt(scope.netCash)]],
            tables: [
              { title: 'قائمة التدفقات', header: ['البند', 'القيمة'], rows: exportRows[0].rows },
              { title: 'التدفق الشهري', header: ['الشهر', 'المقبوضات', 'المدفوعات', 'استثماري', 'صافي'], rows: monthly.map((m) => [m.month, m.inflows, m.outflows, m.investing, m.net]) },
            ],
            totals: [], footer: 'قائمة التدفقات النقدية — RestoCost ERP',
          })}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV(`التدفقات_النقدية_${period || 'الكل'}.csv`, ['البند', 'القيمة'], exportRows[0].rows)}><FileDown className="w-4 h-4" /> تصدير</Btn>
        </>} />

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="الفترة">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls + ' !w-48'}>
            <option value="">كل الفترات</option>
            {allMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </Field>
        <Field label="الفرع">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-48'}>
            <option value="all">كل الفروع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          </select>
        </Field>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي المقبوضات</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(scope.totalInflow, 0)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي المدفوعات</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{fmt(scope.totalOutflow, 0)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي التدفق التشغيلي</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmt(scope.operatingNet, 0)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي التغير النقدي</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(scope.netCash, 0)}</strong></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">بيان التدفقات النقدية {period ? `— ${monthLabel(period)}` : ''}</h3>
          <div className="space-y-1">
            {statementRows.map((r, idx) =>
              r.children ? (
                <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                  <p className="text-[10px] font-extrabold text-slate-400 mb-1">{r.label}</p>
                  <div className="space-y-0.5">
                    {r.children.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 font-medium">{c.label}</span>
                        <span className="font-mono font-bold text-slate-700">{fmt(c.value, 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={idx} className={`flex items-center justify-between rounded-xl px-3 py-2 ${r.isBold ? 'font-extrabold text-slate-900' : 'text-slate-600 font-bold'} ${r.highlight ? 'bg-indigo-50 border border-indigo-100' : 'bg-slate-50 border border-slate-100'} text-xs`}>
                  <span>{r.label}</span>
                  <span className={`font-mono ${r.value < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmt(r.value, 0)}</span>
                </div>
              )
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">الاتجاه الشهري: مقبوضات مقابل مدفوعات</h3>
          <div dir="ltr" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={moneyFmt} />
                <Tooltip formatter={(v: unknown, name?: unknown) => [moneyFmt(v), { inflows: 'المقبوضات', outflows: 'المدفوعات', investing: 'استثماري', net: 'الصافي' }[String(name)] || String(name)]} />
                <Legend formatter={(v: string) => ({ inflows: 'المقبوضات', outflows: 'المدفوعات', investing: 'استثماري', net: 'الصافي' }[v] || v)} />
                <Bar dataKey="inflows" fill="#10b981" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                <Bar dataKey="outflows" fill="#f43f5e" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                <Bar dataKey="net" fill="#6366f1" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-xs mb-3">التفصيل الشهري</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                <th className="text-right p-2 font-bold">الشهر</th>
                <th className="text-right p-2 font-bold">المقبوضات</th>
                <th className="text-right p-2 font-bold">المدفوعات</th>
                <th className="text-right p-2 font-bold">استثماري</th>
                <th className="text-right p-2 font-bold">صافي التدفق</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-800">{m.month}</td>
                  <td className="p-2 font-mono font-bold text-emerald-700">{fmt(m.inflows)}</td>
                  <td className="p-2 font-mono font-bold text-rose-600">{fmt(m.outflows)}</td>
                  <td className="p-2 font-mono font-bold text-amber-700">{fmt(m.investing)}</td>
                  <td className={`p-2 font-mono font-bold ${m.net < 0 ? 'text-rose-600' : 'text-indigo-700'}`}>{fmt(m.net)}</td>
                </tr>
              ))}
              {monthly.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500 font-bold">لا توجد بيانات للفترة المحددة</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 font-bold">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> يمثل التدفق الإيجابي سيولة نقدية متاحة
          <TrendingDown className="w-3.5 h-3.5 text-rose-500 mr-2" /> والسالب يعني احتياج تمويل
          <Landmark className="w-3.5 h-3.5 text-amber-500 mr-2" /> ويُنفصل الاستثماري عن التشغيلي
        </div>
      </Card>
    </div>
  );
};