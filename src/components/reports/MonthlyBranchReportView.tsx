import React, { useMemo, useState } from 'react';
import { BarChart3, Calculator } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmtMoney } from '../../utils/helpers';

export const MonthlyBranchReportView: React.FC = () => {
  const { branches, visibleBranchIds, monthlyInventory, batchSalesRecords, deliverySales, posOrders, grnNotes } = useApp();
  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const reportData = useMemo(() => {
    return visibleBranches.map((branch) => {
      const bId = branch.id;

      const batchRev = batchSalesRecords
        .filter((r) => r.branchId === bId && r.date.startsWith(month))
        .reduce((s, r) => s + r.totalRevenue, 0);
      const deliveryRev = deliverySales
        .filter((s) => s.branchId === bId && s.date.startsWith(month))
        .reduce((s, r) => s + r.payoutAmount, 0);
      const posRev = posOrders
        .filter((o) => o.branchId === bId && o.date.startsWith(month))
        .reduce((s, o) => s + o.totalAmount, 0);
      const totalRevenue = batchRev + deliveryRev + posRev;

      const period = monthlyInventory.find((p) => p.branchId === bId && p.monthKey === month);
      const openingValue = period
        ? period.items.reduce((s, it) => s + (it.openingQty * it.unitCost), 0)
        : 0;
      const closingValue = period
        ? period.items.reduce((s, it) => s + (it.countedQty * it.unitCost), 0)
        : 0;

      const purchases = grnNotes
        .filter((g) => g.status === 'approved' && g.branchId === bId && g.date.startsWith(month))
        .reduce((s, g) => s + g.items.reduce((a, i) => a + (i.quantityReceived * i.unitPrice), 0), 0);

      const costOfSales = openingValue + purchases - closingValue;
      const grossProfit = totalRevenue - costOfSales;
      const grossMargin = totalRevenue ? (grossProfit / totalRevenue) * 100 : 0;

      return {
        branch: branch.nameAr,
        branchId: bId,
        batchRev,
        deliveryRev,
        posRev,
        totalRevenue,
        openingValue,
        purchases,
        closingValue,
        costOfSales,
        grossProfit,
        grossMargin,
        hasPeriod: !!period,
      };
    });
  }, [visibleBranches, month, batchSalesRecords, deliverySales, posOrders, grnNotes, monthlyInventory]);

  const totals = useMemo(() => {
    const t = reportData.reduce((acc, r) => ({
      totalRevenue: acc.totalRevenue + r.totalRevenue,
      openingValue: acc.openingValue + r.openingValue,
      purchases: acc.purchases + r.purchases,
      closingValue: acc.closingValue + r.closingValue,
      costOfSales: acc.costOfSales + r.costOfSales,
      grossProfit: acc.grossProfit + r.grossProfit,
      grossMargin: 0,
    }), { totalRevenue: 0, openingValue: 0, purchases: 0, closingValue: 0, costOfSales: 0, grossProfit: 0, grossMargin: 0 });
    t.grossMargin = t.totalRevenue ? (t.grossProfit / t.totalRevenue) * 100 : 0;
    return t;
  }, [reportData]);

  return (
    <div className="space-y-6">
      <PageHeader title="تقرير الإيرادات وتكلفة المبيعات الشهري" subtitle={`إيرادات كل فرع وتكلفة المبيعات = الجرد أول + المشتريات - الجرد آخر`} icon={<BarChart3 className="w-6 h-6 text-indigo-600" />}
        actions={<ViewToolbar filename={`تقرير_إيرادات_${month}`} sheets={[{
          name: 'إيرادات وتكلفة',
          header: ['الفرع', 'إيراد المبيعات', 'إيراد التوصيل', 'إيراد POS', 'الإجمالي', 'الجرد أول', 'المشتريات', 'الجرد آخر', 'تكلفة المبيعات', 'صافي الربح', 'الهامش %'],
          rows: reportData.map((r) => [r.branch, r.batchRev, r.deliveryRev, r.posRev, r.totalRevenue, r.openingValue, r.purchases, r.closingValue, r.costOfSales, r.grossProfit, r.grossMargin.toFixed(1)]),
        }, { name: 'الإجمالي', header: ['البند', 'القيمة'], rows: [['إيراد المبيعات', totals.totalRevenue], ['الجرد أول', totals.openingValue], ['المشتريات', totals.purchases], ['الجرد آخر', totals.closingValue], ['تكلفة المبيعات', totals.costOfSales], ['صافي الربح', totals.grossProfit], ['الهامش %', totals.grossMargin.toFixed(1)]] }]} />} />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Calculator className="w-4 h-4 text-indigo-500" /> الشهر:
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls + ' w-44'} />
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
              <tr>
                <th className="p-3">الفرع</th>
                <th className="p-3">إيراد المبيعات</th>
                <th className="p-3">الجرد أول</th>
                <th className="p-3">المشتريات</th>
                <th className="p-3">الجرد آخر</th>
                <th className="p-3">تكلفة المبيعات</th>
                <th className="p-3">الإيراد الكلي</th>
                <th className="p-3">صافي الربح</th>
                <th className="p-3">الهامش %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportData.map((r) => (
                <tr key={r.branchId} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-900">{r.branch}</td>
                  <td className="tnum text-left p-3">{fmtMoney(r.totalRevenue)}</td>
                  <td className="tnum text-left p-3 text-slate-500">{fmtMoney(r.openingValue)}</td>
                  <td className="tnum text-left p-3 text-slate-500">{fmtMoney(r.purchases)}</td>
                  <td className="tnum text-left p-3 text-slate-500">{fmtMoney(r.closingValue)}</td>
                  <td className="tnum text-left p-3 font-bold text-rose-700">{fmtMoney(r.costOfSales)}</td>
                  <td className="tnum text-left p-3 font-bold text-emerald-700">{fmtMoney(r.totalRevenue)}</td>
                  <td className={`p-3 font-mono font-extrabold ${r.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(r.grossProfit)}</td>
                  <td className="p-3">
                    <span className={`font-extrabold px-2 py-0.5 rounded-lg ${r.grossMargin >= 30 ? 'bg-emerald-50 text-emerald-700' : r.grossMargin >= 15 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                      {r.grossMargin.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-extrabold border-t-2 border-slate-300">
                <td className="p-3">الإجمالي</td>
                <td className="tnum text-left p-3">{fmtMoney(totals.totalRevenue)}</td>
                <td className="tnum text-left p-3 text-slate-500">{fmtMoney(totals.openingValue)}</td>
                <td className="tnum text-left p-3 text-slate-500">{fmtMoney(totals.purchases)}</td>
                <td className="tnum text-left p-3 text-slate-500">{fmtMoney(totals.closingValue)}</td>
                <td className="tnum text-left p-3 text-rose-700">{fmtMoney(totals.costOfSales)}</td>
                <td className="tnum text-left p-3 text-emerald-700">{fmtMoney(totals.totalRevenue)}</td>
                <td className={`p-3 font-mono ${totals.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(totals.grossProfit)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-lg ${totals.grossMargin >= 30 ? 'bg-emerald-100 text-emerald-700' : totals.grossMargin >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                    {totals.grossMargin.toFixed(1)}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {!reportData.some((r) => r.hasPeriod) && (
        <div className="text-center text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
          لا توجد بيانات جرد شهري لهذا الشهر. قم بإنشاء جرد شهري من شاشة "الجرد الشهري والإقفال" لحساب تكلفة المبيعات بدقة.
        </div>
      )}
    </div>
  );
};
