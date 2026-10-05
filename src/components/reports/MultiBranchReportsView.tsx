import React, { useMemo, useState } from 'react';
import { Building2, Calculator, TrendingUp, Wallet, Layers, Leaf, ShoppingCart, Printer, BarChart3, Boxes, ReceiptText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, inputCls, Btn } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmtMoney } from '../../utils/helpers';
import { openPrintWindow, type PrintTable } from '../../utils/print';

// بند 40 — رؤية متعددة الفروع: تقارير موحَّدة عبر الفروع في شاشة واحدة
export const MultiBranchReportsView: React.FC = () => {
  const { branches, visibleBranchIds, monthlyInventory, batchSalesRecords, deliverySales, posOrders, grnNotes, wastageLogs, inventory, getAverageUnitCost } = useApp();
  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const perBranch = useMemo(() => {
    return visibleBranches.map((branch) => {
      const bId = branch.id;

      const batchRev = batchSalesRecords.filter((r) => r.branchId === bId && r.date.startsWith(month)).reduce((s, r) => s + r.totalRevenue, 0);
      const deliveryRev = deliverySales.filter((s) => s.branchId === bId && s.date.startsWith(month)).reduce((s, r) => s + r.payoutAmount, 0);
      const posRev = posOrders.filter((o) => o.branchId === bId && o.date.startsWith(month)).reduce((s, o) => s + o.totalAmount, 0);
      const revenue = batchRev + deliveryRev + posRev;
      const orderCount = posOrders.filter((o) => o.branchId === bId && o.date.startsWith(month)).length;

      const period = monthlyInventory.find((p) => p.branchId === bId && p.monthKey === month);
      const openingValue = period ? period.items.reduce((s, it) => s + it.openingQty * it.unitCost, 0) : 0;
      const closingValue = period ? period.items.reduce((s, it) => s + it.countedQty * it.unitCost, 0) : 0;

      const purchases = grnNotes.filter((g) => g.status === 'approved' && g.branchId === bId && g.date.startsWith(month)).reduce((s, g) => s + g.items.reduce((a, i) => a + i.quantityReceived * i.unitPrice, 0), 0);

      const costOfSales = openingValue + purchases - closingValue;
      const grossProfit = revenue - costOfSales;
      const grossMargin = revenue ? (grossProfit / revenue) * 100 : 0;

      const wastage = wastageLogs.filter((w) => w.branchId === bId && w.date.startsWith(month) && w.isApproved).reduce((s, w) => s + w.totalCostImpact, 0);
      const wastageCount = wastageLogs.filter((w) => w.branchId === bId && w.date.startsWith(month)).length;

      const inventoryValue = inventory.filter((i) => i.branchId === bId).reduce((s, i) => s + i.quantity * getAverageUnitCost(i.rawMaterialId), 0);

      return {
        branchId: bId,
        branch: branch.nameAr,
        revenue, orderCount, openingValue, purchases, closingValue, costOfSales, grossProfit, grossMargin,
        wastage, wastageCount, inventoryValue,
        hasPeriod: !!period,
      };
    });
  }, [visibleBranches, month, batchSalesRecords, deliverySales, posOrders, grnNotes, wastageLogs, monthlyInventory, inventory, getAverageUnitCost]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    const t = perBranch.reduce((acc, r) => ({
      revenue: acc.revenue + r.revenue,
      orderCount: acc.orderCount + r.orderCount,
      openingValue: acc.openingValue + r.openingValue,
      purchases: acc.purchases + r.purchases,
      closingValue: acc.closingValue + r.closingValue,
      costOfSales: acc.costOfSales + r.costOfSales,
      grossProfit: acc.grossProfit + r.grossProfit,
      wastage: acc.wastage + r.wastage,
      wastageCount: acc.wastageCount + r.wastageCount,
      inventoryValue: acc.inventoryValue + r.inventoryValue,
    }), { revenue: 0, orderCount: 0, openingValue: 0, purchases: 0, closingValue: 0, costOfSales: 0, grossProfit: 0, wastage: 0, wastageCount: 0, inventoryValue: 0 });
    return { ...t, grossMargin: t.revenue ? (t.grossProfit / t.revenue) * 100 : 0 };
  }, [perBranch]);

  const maxRevenue = Math.max(1, ...perBranch.map((r) => r.revenue));

  const printConsolidated = () => {
    const tables: PrintTable[] = [{
      title: `الرؤية الموحّدة للفروع — ${month}`,
      header: ['الفرع', 'الإيراد', 'المشتريات', 'جرد أول', 'جرد آخر', 'تكلفة المبيعات', 'صافي الربح', 'الهامش %', 'الهالك', 'قيمة المخزون', 'الطلبات'],
      rows: perBranch.map((r) => [r.branch, r.revenue.toFixed(2), '', r.purchases.toFixed(2), r.openingValue.toFixed(2), r.closingValue.toFixed(2), r.costOfSales.toFixed(2), r.grossProfit.toFixed(2), r.grossMargin.toFixed(1), r.wastage.toFixed(2), r.inventoryValue.toFixed(2), String(r.orderCount)]),
    }, {
      title: 'الإجمالي الموحد',
      header: ['الفرع', 'الإيراد', 'تكلفة المبيعات', 'صافي الربح', 'الهامش %', 'الهالك', 'قيمة المخزون'],
      rows: [['كل الفروع', totals.revenue.toFixed(2), totals.costOfSales.toFixed(2), totals.grossProfit.toFixed(2), totals.grossMargin.toFixed(1), totals.wastage.toFixed(2), totals.inventoryValue.toFixed(2)]],
    }];
    openPrintWindow({ title: 'الرؤية الموحّدة عبر الفروع — RestoCost ERP', meta: [['الشهر', month], ['عدد الفروع', String(visibleBranches.length)]], tables, totals: [['الإيراد الموحد', fmtMoney(totals.revenue)], ['صافي الربح الموحد', fmtMoney(totals.grossProfit)], ['قيمة المخزون الموحدة', fmtMoney(totals.inventoryValue)]], footer: 'رؤية متعددة الفروع — تقارير موحّدة عبر الفروع' });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="الرؤية المتعددة الفروع (تقارير موحّدة)" subtitle={`مقارنة موحّدة لكل الفروع في شاشة واحدة — إيرادات، تكاليف، مخزون، هالك`} icon={<Building2 className="w-6 h-6 text-brand-600" />}
        actions={
          <>
            <ViewToolbar filename={`رؤية_فروع_${month}`} sheets={[{
              name: 'الفروع',
              header: ['الفرع', 'الإيراد', 'المشتريات', 'جرد أول', 'جرد آخر', 'تكلفة المبيعات', 'صافي الربح', 'الهامش %', 'الهالك', 'قيمة المخزون', 'الطلبات'],
              rows: perBranch.map((r) => [r.branch, r.revenue.toFixed(2), r.purchases.toFixed(2), r.openingValue.toFixed(2), r.closingValue.toFixed(2), r.costOfSales.toFixed(2), r.grossProfit.toFixed(2), r.grossMargin.toFixed(1), r.wastage.toFixed(2), r.inventoryValue.toFixed(2), r.orderCount]),
            }, {
              name: 'الإجمالي',
              header: ['البند', 'القيمة'],
              rows: [['الإيراد الموحد', totals.revenue.toFixed(2)], ['تكلفة المبيعات', totals.costOfSales.toFixed(2)], ['صافي الربح', totals.grossProfit.toFixed(2)], ['الهامش %', totals.grossMargin.toFixed(1)], ['الهالك', totals.wastage.toFixed(2)], ['قيمة المخزون', totals.inventoryValue.toFixed(2)], ['الطلبات', totals.orderCount]],
            }]} />
            <Btn onClick={printConsolidated}><Printer className="w-4 h-4" /> طباعة</Btn>
          </>
        } />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Calculator className="w-4 h-4 text-brand-500" /> الشهر:
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls + ' w-44'} />
        </label>
      </div>

      {/* أبرز المؤشرات الموحدة */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card className="p-4"><span className="text-slate-500 text-[11px] block flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> الإيراد الموحد</span><strong className="text-lg font-extrabold text-emerald-700 block mt-1">{fmtMoney(totals.revenue)}</strong><span className="text-[10px] text-slate-400">{totals.orderCount} طلب {visibleBranches.length} فرع</span></Card>
        <Card className="p-4"><span className="text-slate-500 text-[11px] block flex items-center gap-1"><ReceiptText className="w-3.5 h-3.5" /> تكلفة المبيعات</span><strong className="text-lg font-extrabold text-rose-700 block mt-1">{fmtMoney(totals.costOfSales)}</strong><span className="text-[10px] text-slate-400">جرد أول + مشتريات − جرد آخر</span></Card>
        <Card className="p-4"><span className="text-slate-500 text-[11px] block flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> صافي الربح</span><strong className={`text-lg font-extrabold block mt-1 ${totals.grossProfit >= 0 ? 'text-brand-700' : 'text-rose-700'}`}>{fmtMoney(totals.grossProfit)}</strong><span className="text-[10px] text-slate-400">الهامش {totals.grossMargin.toFixed(1)}%</span></Card>
        <Card className="p-4"><span className="text-slate-500 text-[11px] block flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5" /> المشتريات</span><strong className="text-lg font-extrabold text-sky-700 block mt-1">{fmtMoney(totals.purchases)}</strong></Card>
        <Card className="p-4"><span className="text-slate-500 text-[11px] block flex items-center gap-1"><Leaf className="w-3.5 h-3.5" /> الهالك المعتمد</span><strong className="text-lg font-extrabold text-amber-700 block mt-1">{fmtMoney(totals.wastage)}</strong><span className="text-[10px] text-slate-400">{totals.wastageCount} قيد</span></Card>
        <Card className="p-4"><span className="text-slate-500 text-[11px] block flex items-center gap-1"><Boxes className="w-3.5 h-3.5" /> قيمة المخزون الحالية</span><strong className="text-lg font-extrabold text-violet-700 block mt-1">{fmtMoney(totals.inventoryValue)}</strong></Card>
      </div>

      {/* جدول المقارنة الموحد */}
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <p className="font-bold text-slate-800 text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-brand-400" /> موازنة الفروع — كل مؤشّر لكل فرع</p>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${visibleBranches.length ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>{visibleBranches.length} فرع يُقارن</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
              <tr>
                <th className="p-3">الفرع</th>
                <th className="p-3">الإيراد</th>
                <th className="p-3">الحصة من الإيراد</th>
                <th className="p-3">المشتريات</th>
                <th className="p-3">جرد أول</th>
                <th className="p-3">جرد آخر</th>
                <th className="p-3">تكلفة المبيعات</th>
                <th className="p-3">صافي الربح</th>
                <th className="p-3">الهامش %</th>
                <th className="p-3">الهالك</th>
                <th className="p-3">قيمة المخزون</th>
                <th className="p-3">الطلبات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perBranch.map((r) => (
                <tr key={r.branchId} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-900 whitespace-nowrap">{r.branch}</td>
                  <td className="tnum text-left p-3">{fmtMoney(r.revenue)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(r.revenue / maxRevenue) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{maxRevenue > 0 ? ((r.revenue / maxRevenue) * 100).toFixed(0) : 0}%</span>
                    </div>
                  </td>
                  <td className="tnum text-left p-3 text-sky-700">{fmtMoney(r.purchases)}</td>
                  <td className="tnum text-left p-3 text-slate-500">{fmtMoney(r.openingValue)}</td>
                  <td className="tnum text-left p-3 text-slate-500">{fmtMoney(r.closingValue)}</td>
                  <td className="tnum text-left p-3 font-bold text-rose-700">{fmtMoney(r.costOfSales)}</td>
                  <td className={`p-3 font-mono font-extrabold ${r.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(r.grossProfit)}</td>
                  <td className="p-3">
                    <span className={`font-extrabold px-2 py-0.5 rounded-lg ${r.grossMargin >= 30 ? 'bg-emerald-50 text-emerald-700' : r.grossMargin >= 15 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{r.grossMargin.toFixed(1)}%</span>
                  </td>
                  <td className={`p-3 font-mono ${r.wastage > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{fmtMoney(r.wastage)}</td>
                  <td className="tnum text-left p-3 text-violet-700">{fmtMoney(r.inventoryValue)}</td>
                  <td className="tnum text-left p-3">{r.orderCount}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-extrabold border-t-2 border-slate-300">
                <td className="p-3">الإجمالي الموحد</td>
                <td className="tnum text-left p-3">{fmtMoney(totals.revenue)}</td>
                <td className="p-3 text-[10px] text-slate-400">—</td>
                <td className="tnum text-left p-3 text-sky-700">{fmtMoney(totals.purchases)}</td>
                <td className="tnum text-left p-3 text-slate-500">{fmtMoney(totals.openingValue)}</td>
                <td className="tnum text-left p-3 text-slate-500">{fmtMoney(totals.closingValue)}</td>
                <td className="tnum text-left p-3 text-rose-700">{fmtMoney(totals.costOfSales)}</td>
                <td className={`p-3 font-mono ${totals.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(totals.grossProfit)}</td>
                <td className="p-3"><span className="font-extrabold text-brand-700">{totals.grossMargin.toFixed(1)}%</span></td>
                <td className="tnum text-left p-3 text-amber-700">{fmtMoney(totals.wastage)}</td>
                <td className="tnum text-left p-3 text-violet-700">{fmtMoney(totals.inventoryValue)}</td>
                <td className="tnum text-left p-3">{totals.orderCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="p-3 text-[10px] text-slate-400 flex items-center gap-2 border-t border-slate-100">
          <BarChart3 className="w-3.5 h-3.5" /> تكلفة المبيعات = جرد أول + مشتريات الشهر − جرد آخر (حسب الجرد الشهري). الهالك = سجلات الهدر المعتمدة في الشهر. قيمة المخزون = الرصيد الحالي × متوسط تكلفة الوحدة.
          {!perBranch.some((r) => r.hasPeriod) && <span className="font-bold text-amber-600">— لا توجد بيانات جرد شهري لهذا الشهر ({month})، فروق الإيراد والتكلفة ستكون جزئية.</span>}
        </div>
      </Card>
    </div>
  );
};