import React, { useMemo, useState } from 'react';
import { GitCompare, Printer, Trophy, TrendingDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

interface CenterRow {
  id: string;
  name: string;
  revenue: number;
  foodCost: number;
  labor: number;
  operating: number;
  wastage: number;
  totalCost: number;
  profit: number;
  fcPct: number;
  laborPct: number;
  opPct: number;
  margin: number;
  transactions: number;
  avgTicket: number;
}

export const CostCenterComparisonView: React.FC = () => {
  const {
    batchSalesRecords, posOrders, shifts, operatingExpenses, wastageLogs,
    visibleBranchIds, getBranchName,
  } = useApp();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const inDate = (d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);

  const centers = useMemo<CenterRow[]>(() => {
    const ids = Array.from(new Set([
      ...batchSalesRecords.filter((b) => visibleBranchIds.includes(b.branchId)).map((b) => b.branchId),
      ...posOrders.filter((o) => visibleBranchIds.includes(o.branchId)).map((o) => o.branchId),
      ...shifts.filter((s) => visibleBranchIds.includes(s.branchId)).map((s) => s.branchId),
      ...operatingExpenses.filter((e) => visibleBranchIds.includes(e.branchId)).map((e) => e.branchId),
      ...wastageLogs.filter((w) => visibleBranchIds.includes(w.branchId)).map((w) => w.branchId),
    ]));
    return ids.map((id) => {
      const rev = batchSalesRecords.filter((b) => b.branchId === id && inDate(b.date)).reduce((s, b) => s + (b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15) / 100)), 0)
        + posOrders.filter((o) => o.branchId === id && inDate(o.date)).reduce((s, o) => s + o.subtotal, 0);
      const foodCost = batchSalesRecords.filter((b) => b.branchId === id && inDate(b.date)).reduce((s, b) => s + b.totalFoodCost, 0)
        + posOrders.filter((o) => o.branchId === id && inDate(o.date)).reduce((s, o) => s + o.totalCost, 0);
      const labor = shifts.filter((s) => s.branchId === id && inDate(s.date)).reduce((sum, sh) => sum + sh.totalShiftCost, 0);
      const operating = operatingExpenses.filter((e) => e.branchId === id && e.paymentStatus === 'paid' && inDate(e.dueDate)).reduce((s, e) => s + e.amount, 0);
      const wastage = wastageLogs.filter((w) => w.branchId === id && inDate(w.date)).reduce((s, w) => s + w.totalCostImpact, 0);
      const transactions = batchSalesRecords.filter((b) => b.branchId === id && inDate(b.date)).length + posOrders.filter((o) => o.branchId === id && inDate(o.date)).length;
      const totalCost = foodCost + labor + operating + wastage;
      const profit = rev - totalCost;
      return {
        id, name: id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id),
        revenue: rev, foodCost, labor, operating, wastage, totalCost, profit,
        fcPct: rev ? (foodCost / rev) * 100 : 0,
        laborPct: rev ? (labor / rev) * 100 : 0,
        opPct: rev ? (operating / rev) * 100 : 0,
        margin: rev ? (profit / rev) * 100 : 0,
        transactions, avgTicket: transactions ? rev / transactions : 0,
      };
    }).sort((a, b) => b.margin - a.margin);
  }, [batchSalesRecords, posOrders, shifts, operatingExpenses, wastageLogs, visibleBranchIds, fromDate, toDate, getBranchName]);

  const totalRevenue = centers.reduce((s, c) => s + c.revenue, 0);
  const totalProfit = centers.reduce((s, c) => s + c.profit, 0);
  const totalCost = centers.reduce((s, c) => s + c.totalCost, 0);
  const avgMargin = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;
  const best = centers[0];
  const worst = centers[centers.length - 1];
  const profitable = centers.filter((c) => c.profit >= 0).length;

  const cols = ['revenue', 'foodCost', 'fcPct', 'labor', 'laborPct', 'operating', 'wastage', 'totalCost', 'profit', 'margin', 'avgTicket'] as const;
  const COL_LABEL: Record<typeof cols[number], string> = {
    revenue: 'الإيراد', foodCost: 'تكلفة الطعام', fcPct: 'FC %', labor: 'العمالة', laborPct: 'العمالة %',
    operating: 'التشغيلية', wastage: 'الهوالك', totalCost: 'التكلفة الإجمالية', profit: 'الربح', margin: 'الهامش %', avgTicket: 'متوسط الفاتورة',
  };

  const exportSheets = [{
    name: 'مقارنة مراكز التكلفة',
    header: ['المركز', ...cols.map((c) => COL_LABEL[c])],
    rows: centers.map((c) => [c.name, fmt(c.revenue), fmt(c.foodCost), `${fmt(c.fcPct)}%`, fmt(c.labor), `${fmt(c.laborPct)}%`, fmt(c.operating), fmt(c.wastage), fmt(c.totalCost), fmt(c.profit), `${fmt(c.margin)}%`, fmt(c.avgTicket)]),
  }];

  const printReport = () => {
    openPrintWindow({
      title: 'مقارنة مراكز التكلفة (الفروع)',
      subtitle: `${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}`,
      meta: [
        ['إجمالي الإيراد', `${fmtMoney(totalRevenue)}`], ['إجمالي الربح', `${fmtMoney(totalProfit)}`],
        ['متوسط الهامش', `${avgMargin.toFixed(2)}%`], ['مراكز مربحة', `${profitable} من ${centers.length}`],
      ],
      tables: [{
        title: 'مصفوفة مقارنة المراكز',
        header: ['المركز', 'الإيراد', 'FC %', 'العمالة %', 'التشغيلية', 'الهوالك', 'إجمالي التكاليف', 'الربح', 'الهامش %'],
        rows: centers.map((c) => [c.name, fmt(c.revenue, 2), `${c.fcPct.toFixed(2)}%`, `${c.laborPct.toFixed(2)}%`, fmt(c.operating, 2), fmt(c.wastage, 2), fmt(c.totalCost, 2), fmt(c.profit, 2), `${c.margin.toFixed(2)}%`]),
      }],
      totals: [['الإيراد', `${fmtMoney(totalRevenue)}`], ['التكاليف', `${fmtMoney(totalCost)}`], ['الربح', `${fmtMoney(totalProfit)}`]],
      footer: 'مقارنة مراكز التكلفة — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="مقارنة مراكز التكلفة" subtitle="مصفوفة جنباً إلى جنب لأداء الفروع: الإيراد، التكاليف، الهامش وكفاءة التشغيل" icon={<GitCompare className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar filename="مقارنة مراكز التكلفة" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('مقارنة_مراكز_التكلفة.csv', exportSheets[0].header, exportSheets[0].rows)}><GitCompare className="w-4 h-4" /> تصدير</Btn>
        </>} />

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
        <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
        <div className="text-[10px] text-slate-500 font-bold basis-full">تُقارن المراكز حسب أرصدة المبيعات والنقاط، تكلفة الطعام، العمالة، المصاريف التشغيلية المدفوعة، والهوالك ضمن النطاق.</div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الإيراد</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmtMoney(totalRevenue)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي الربح</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${totalProfit >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>{fmtMoney(totalProfit)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">متوسط الهامش</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${avgMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{avgMargin.toFixed(2)}%</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مراكز مربحة</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{profitable} من {centers.length}</strong></div>
      </div>

      {centers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <Trophy className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <strong className="text-amber-800 block mb-1">أفضل مركز: {best.name}</strong>
              <span className="text-slate-600">هامش {best.margin.toFixed(2)}% · إيراد {fmtMoney(best.revenue)} · FC {best.fcPct.toFixed(2)}%</span>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4">
            <TrendingDown className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <strong className="text-rose-800 block mb-1">أضعف مركز: {worst.name}</strong>
              <span className="text-slate-600">هامش {worst.margin.toFixed(2)}% · إيراد {fmtMoney(worst.revenue)} · FC {worst.fcPct.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      )}

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-xs mb-3">مصفوفة مقارنة المراكز (مرتبة حسب الهامش)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1100px]">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                <th className="text-right p-2 font-bold">المركز</th>
                {cols.map((c) => <th key={c} className="text-right p-2 font-bold">{COL_LABEL[c]}</th>)}
              </tr>
            </thead>
            <tbody>
              {centers.map((c, i) => (
                <tr key={c.id} className={`border-b border-slate-50 hover:bg-slate-50 ${i === 0 ? 'bg-amber-50/60' : ''}`}>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 inline-flex items-center justify-center rounded-lg font-extrabold ${i === 0 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
                      <span className="font-bold text-slate-800">{c.name}</span>
                    </div>
                  </td>
                  <td className="p-2 font-mono font-bold text-emerald-700">{fmtMoney(c.revenue)}</td>
                  <td className="p-2 font-mono text-rose-600">{fmtMoney(c.foodCost)}</td>
                  <td className="p-2 font-mono font-bold text-rose-600">{c.fcPct.toFixed(2)}%</td>
                  <td className="p-2 font-mono text-amber-700">{fmtMoney(c.labor)}</td>
                  <td className="p-2 font-mono font-bold text-amber-700">{c.laborPct.toFixed(2)}%</td>
                  <td className="p-2 font-mono text-slate-600">{fmtMoney(c.operating)}</td>
                  <td className="p-2 font-mono text-slate-500">{fmtMoney(c.wastage)}</td>
                  <td className="p-2 font-mono font-extrabold text-slate-800">{fmtMoney(c.totalCost)}</td>
                  <td className={`p-2 font-mono font-extrabold ${c.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmtMoney(c.profit)}</td>
                  <td className={`p-2 font-mono font-extrabold ${c.margin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{c.margin.toFixed(2)}%</td>
                  <td className="p-2 font-mono text-indigo-700">{fmtMoney(c.avgTicket)}</td>
                </tr>
              ))}
              {centers.length === 0 && <tr><td colSpan={cols.length + 1} className="p-8 text-center text-slate-500 font-bold">لا توجد بيانات مراكز في النطاق المحدد</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[10px] text-slate-500 font-bold flex items-center gap-2">
          <GitCompare className="w-3.5 h-3.5 text-indigo-500" /> يُرتّب الجدول تنازلياً حسب الهامش — الصف الأول هو المرجع الأفضل للتحسين
        </div>
      </Card>
    </div>
  );
};
