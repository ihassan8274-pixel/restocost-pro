import React, { useMemo, useState } from 'react';
import { Boxes, Printer, Pencil, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, TabBar, inputCls, SectionHeader } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel, EXPENSE_CATEGORY_LABELS, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { OperatingExpenseCategory } from '../../types';

type TabId = 'centers' | 'budget';

interface CenterRow {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  foodCost: number;
  fcPct: number;
  labor: number;
  laborPct: number;
  opex: number;
  opexPct: number;
  wastage: number;
  wastagePct: number;
  sharedShare: number;
  directCost: number;
  totalCost: number;
  profit: number;
  margin: number;
  breakEven: number;
  coversBreakEven: boolean;
}

type AllocMode = 'none' | 'revenue' | 'orders' | 'labor' | 'equal';

const months6 = (endKey: string): string[] => {
  const [y, m] = endKey.split('-').map(Number);
  const arr: string[] = [];
  let cy = y, cm = m;
  for (let i = 0; i < 6; i++) { arr.unshift(`${cy}-${String(cm).padStart(2, '0')}`); cm--; if (cm === 0) { cm = 12; cy--; } }
  return arr;
};

export const CostCentersView: React.FC = () => {
  const { branches, visibleBranchIds, batchSalesRecords, posOrders, shifts, operatingExpenses, wastageLogs, expenseBudgets, setExpenseBudget, getBranchName } = useApp();
  const [tab, setTab] = useState<TabId>('centers');
  const [alloc, setAlloc] = useState<AllocMode>(() => (localStorage.getItem('rcerp_costcenter_alloc') as AllocMode) || 'none');
  const setAllocMode = (mode: AllocMode) => { setAlloc(mode); localStorage.setItem('rcerp_costcenter_alloc', mode); };

  const branchLabel = (id: string) => (id === 'b-ck' ? 'المطبخ المركزي' : id === 'central' ? 'مركزية (مشتركة)' : getBranchName(id));

  const sharedPool = operatingExpenses.filter((e) => e.branchId === 'central' && e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);

  const rows = useMemo<CenterRow[]>(() => {
    const ids = Array.from(new Set([
      ...visibleBranchIds, 'b-ck',
      ...posOrders.map((o) => o.branchId), ...batchSalesRecords.map((b) => b.branchId),
      ...shifts.map((s) => s.branchId), ...operatingExpenses.map((e) => e.branchId === 'central' ? 'b-ck' : e.branchId),
      ...wastageLogs.map((w) => w.branchId),
    ]));
    const raw = ids.map((id) => {
      const pos = posOrders.filter((o) => o.branchId === id);
      const bs = batchSalesRecords.filter((b) => b.branchId === id);
      const revenue = pos.reduce((s, o) => s + o.subtotal, 0) + bs.reduce((s, b) => s + (b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15))), 0);
      const foodCost = pos.reduce((s, o) => s + o.totalCost, 0) + bs.reduce((s, b) => s + b.totalFoodCost, 0);
      const labor = shifts.filter((s) => s.branchId === id).reduce((s, sh) => s + sh.totalShiftCost, 0);
      const opex = operatingExpenses.filter((e) => e.branchId === id && e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
      const wastage = wastageLogs.filter((w) => w.branchId === id).reduce((s, w) => s + w.totalCostImpact, 0);
      const directCost = foodCost + labor + opex + wastage;
      const profit = revenue - directCost;
      return { id, name: branchLabel(id), orders: pos.length + bs.length, revenue, foodCost, labor, opex, wastage, directCost, profit, margin: revenue ? (profit / revenue) * 100 : 0 };
    });
    const totalRevenue = raw.reduce((s, r) => s + r.revenue, 0);
    const totalOrders = raw.reduce((s, r) => s + r.orders, 0);
    const totalLabor = raw.reduce((s, r) => s + r.labor, 0);
    return raw.map((r) => {
      let share = 0;
      if (alloc === 'revenue') share = totalRevenue > 0 ? sharedPool * (r.revenue / totalRevenue) : 0;
      else if (alloc === 'orders') share = totalOrders > 0 ? sharedPool * (r.orders / totalOrders) : 0;
      else if (alloc === 'labor') share = totalLabor > 0 ? sharedPool * (r.labor / totalLabor) : 0;
      else if (alloc === 'equal') share = raw.length > 0 ? sharedPool / raw.length : 0;
      const totalCost = r.directCost + share;
      const fixed = r.labor + r.opex + share;
      const varRatio = r.revenue ? r.foodCost / r.revenue : 0;
      const breakEven = varRatio < 1 ? fixed / (1 - varRatio) : Infinity;
      return {
        id: r.id, name: r.name, orders: r.orders, revenue: r.revenue, foodCost: r.foodCost, fcPct: r.revenue ? (r.foodCost / r.revenue) * 100 : 0,
        labor: r.labor, laborPct: r.revenue ? (r.labor / r.revenue) * 100 : 0, opex: r.opex, opexPct: r.revenue ? (r.opex / r.revenue) * 100 : 0,
        wastage: r.wastage, wastagePct: r.revenue ? (r.wastage / r.revenue) * 100 : 0,
        sharedShare: share, directCost: r.directCost, totalCost, profit: r.profit - share, margin: r.revenue ? ((r.profit - share) / r.revenue) * 100 : 0,
        breakEven, coversBreakEven: r.revenue >= breakEven,
      };
    }).sort((a, b) => b.revenue - a.revenue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBranchIds, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs, alloc, sharedPool, branches]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const overallMargin = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;
  const totalFoodCost = rows.reduce((s, r) => s + r.foodCost, 0);
  const totalLabor = rows.reduce((s, r) => s + r.labor, 0);
  const totalOpex = rows.reduce((s, r) => s + r.opex, 0);
  const totalFixed = rows.reduce((s, r) => s + r.labor + r.opex + r.sharedShare, 0);
  const totalVarRatio = totalRevenue ? totalFoodCost / totalRevenue : 0;
  const totalBreakEven = totalVarRatio < 1 ? totalFixed / (1 - totalVarRatio) : Infinity;
  const belowBreakEven = rows.filter((r) => !r.coversBreakEven).length;

  const chartData = rows.map((r) => ({
    name: r.name, 'الإيراد': Math.round(r.revenue), 'تكلفة الطعام': Math.round(r.foodCost),
    'العمالة': Math.round(r.labor), 'التشغيلية': Math.round(r.opex), 'الهوالك': Math.round(r.wastage), 'مخصص مركزي': Math.round(r.sharedShare),
  }));

  const costByCategory = useMemo(() => {
    const paid = operatingExpenses.filter((e) => e.paymentStatus === 'paid');
    const m: Record<string, number> = {};
    paid.forEach((e) => { m[e.category] = (m[e.category] || 0) + e.amount; });
    return m;
  }, [operatingExpenses]);

  // ---- Budget tab ----
  const [bMonth, setBMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [bBranch, setBBranch] = useState<string>('b-01');
  const [budgetValues, setBudgetValues] = useState<Record<string, string | number>>({});
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  const scopeMatches = (branchId: string) => bBranch === 'all' || branchId === bBranch;
  const monthActual = operatingExpenses.filter((e) => e.dueDate.startsWith(bMonth) && scopeMatches(e.branchId));
  const actualByCat = useMemo(() => { const m = new Map<string, number>(); monthActual.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + e.amount)); return m; }, [monthActual]);
  const budgetItems = expenseBudgets.filter((b) => b.month === bMonth && scopeMatches(b.branchId)).flatMap((b) => b.items);
  const budgetByCat = useMemo(() => { const m = new Map<string, number>(); budgetItems.forEach((i) => m.set(i.category, (m.get(i.category) || 0) + i.budgetedAmount)); return m; }, [budgetItems]);
  const totalBudgeted = Array.from(budgetByCat.values()).reduce((s, v) => s + v, 0);
  const totalActual = monthActual.reduce((s, e) => s + e.amount, 0);
  const variancePct = totalBudgeted > 0 ? ((totalActual - totalBudgeted) / totalBudgeted) * 100 : 0;

  const budgetChart = (Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[])
    .filter((c) => (actualByCat.get(c) || 0) > 0 || (budgetByCat.get(c) || 0) > 0)
    .map((c) => ({ name: EXPENSE_CATEGORY_LABELS[c], 'الفعلي': actualByCat.get(c) || 0, 'الموازنة': budgetByCat.get(c) || 0 }));

  const trendData = months6(bMonth).map((m) => ({
    month: monthLabel(m).split(' ')[0],
    'الفعلي': operatingExpenses.filter((e) => e.dueDate.startsWith(m) && scopeMatches(e.branchId)).reduce((s, e) => s + e.amount, 0),
    'الموازنة': expenseBudgets.filter((b) => b.month === m && scopeMatches(b.branchId)).flatMap((b) => b.items).reduce((s, i) => s + i.budgetedAmount, 0),
  }));

  const openBudgetEditor = () => {
    const next: Record<string, string> = {};
    (Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[]).forEach((c) => { next[c] = String(budgetByCat.get(c) || ''); });
    setBudgetValues(next);
    setShowBudgetModal(true);
  };
  const saveBudget = () => {
    const items = (Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[])
      .map((c) => ({ category: c as OperatingExpenseCategory, budgetedAmount: parseFloat(String(budgetValues[c])) || 0 }))
      .filter((i) => i.budgetedAmount > 0);
    setExpenseBudget(bBranch, bMonth, items);
    setShowBudgetModal(false);
  };

  const exportSheets = [
    {
      name: 'مراكز التكلفة',
      header: ['مركز التكلفة', 'الإيراد', 'تكلفة الطعام', 'FC %', 'العمالة', 'التشغيلية', 'الهوالك', 'مخصص مركزي', 'التكلفة المباشرة', 'إجمالي التكلفة', 'الربح', 'الهامش %'],
      rows: rows.map((r) => [r.name, fmt(r.revenue), fmt(r.foodCost), fmt(r.fcPct), fmt(r.labor), fmt(r.opex), fmt(r.wastage), fmt(r.sharedShare), fmt(r.directCost), fmt(r.totalCost), fmt(r.profit), fmt(r.margin)]),
    },
    {
      name: 'التكلفة حسب التصنيف',
      header: ['التصنيف', 'المبلغ'],
      rows: Object.entries(costByCategory).map(([c, v]) => [EXPENSE_CATEGORY_LABELS[c as OperatingExpenseCategory] || c, v]),
    },
    {
      name: 'الموازنة مقابل الفعلي ' + bMonth,
      header: ['التصنيف', 'الموازنة', 'الفعلي', 'الفرق'],
      rows: budgetChart.map((r) => [r.name, r['الموازنة'], r['الفعلي'], r['الفعلي'] - r['الموازنة']]),
    },
    {
      name: 'نقطة التعادل',
      header: ['مركز التكلفة', 'العمليات', 'تكاليف ثابتة', 'نسبة متغيرة', 'نقطة التعادل', 'الحالة'],
      rows: rows.map((r) => [r.name, r.orders, r.labor + r.opex + r.sharedShare, r.revenue ? ((r.foodCost / r.revenue) * 100).toFixed(2) : '0', Number.isFinite(r.breakEven) ? r.breakEven.toFixed(2) : '—', r.coversBreakEven ? 'يغطي التعادل' : 'تحت التعادل']),
    },
  ];

  const printReport = () => {
    openPrintWindow({
      title: 'مراكز التكلفة (الفروع) — تقرير شامل',
      subtitle: alloc === 'revenue' ? 'توزيع المصاريف المركزية حسب الإيراد' : 'بدون توزيع للمصاريف المركزية',
      meta: [
        ['إجمالي الإيراد', `${fmtMoney(totalRevenue)}`],
        ['إجمالي الربح', `${fmtMoney(totalProfit)}`],
        ['الهامش الإجمالي', `${overallMargin.toFixed(2)}%`],
        ['المصاريف المركزية المشتركة', `${fmtMoney(sharedPool)}`],
      ],
      tables: [{
        title: 'مراكز التكلفة',
        header: ['مركز التكلفة', 'الإيراد', 'تكلفة الطعام', 'FC %', 'العمالة', 'التشغيلية', 'الهوالك', 'مخصص مركزي', 'إجمالي التكلفة', 'الربح', 'الهامش %'],
        rows: rows.map((r) => [r.name, fmt(r.revenue, 0), fmt(r.foodCost, 0), r.fcPct.toFixed(2), fmt(r.labor, 0), fmt(r.opex, 0), fmt(r.wastage, 0), fmt(r.sharedShare, 0), fmt(r.totalCost, 0), fmt(r.profit, 0), r.margin.toFixed(2)]),
      }],
      totals: [
        ['إجمالي الإيراد', `${fmtMoney(totalRevenue)}`],
        ['إجمالي الربح', `${fmtMoney(totalProfit)}`],
        ['الهامش الإجمالي', `${overallMargin.toFixed(2)}%`],
      ],
      footer: 'تقرير مراكز التكلفة — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="مراكز التكلفة (الفروع)" subtitle="كل فرع مركز تكلفة مستقل: تكلفة طعام، عمالة، تشغيلية، هالك، وتخصيص المصاريف المركزية المشتركة حسب الإيراد" icon={<Boxes className="w-6 h-6 text-brand-600" />}
        actions={<>
          <ViewToolbar filename="مراكز_التكلفة" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('CostCenters.csv', ['مركز التكلفة', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %'], rows.map((r) => [r.name, fmt(r.revenue), fmt(r.totalCost), fmt(r.profit), fmt(r.margin)]))}>تصدير CSV</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الإيراد</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{fmtMoney(totalRevenue)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تكلفة الطعام</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{fmtMoney(totalFoodCost)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">العمالة</span><strong className="text-lg font-extrabold font-mono text-violet-700 block mt-1">{fmtMoney(totalLabor)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">التشغيلية المباشرة</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmtMoney(totalOpex)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الربح</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${totalProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(totalProfit)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الهامش الإجمالي</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${overallMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{overallMargin.toFixed(2)}%</strong></div>
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-4 text-xs">
        <span className="font-extrabold text-slate-700 flex items-center gap-2"><Boxes className="w-4 h-4 text-brand-500" /> توزيع المصاريف المركزية المشتركة ({fmtMoney(sharedPool)})</span>
        <button onClick={() => setAllocMode('none')} className={`px-3 py-1.5 rounded-lg font-bold border transition-colors ${alloc === 'none' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}>بدون توزيع</button>
        <button onClick={() => setAllocMode('revenue')} className={`px-3 py-1.5 rounded-lg font-bold border transition-colors ${alloc === 'revenue' ? 'bg-brand-600 text-white border-brand-700' : 'bg-white text-slate-600 border-slate-300'}`}>حسب الإيراد</button>
        <button onClick={() => setAllocMode('orders')} className={`px-3 py-1.5 rounded-lg font-bold border transition-colors ${alloc === 'orders' ? 'bg-brand-600 text-white border-brand-700' : 'bg-white text-slate-600 border-slate-300'}`}>حسب العمليات</button>
        <button onClick={() => setAllocMode('labor')} className={`px-3 py-1.5 rounded-lg font-bold border transition-colors ${alloc === 'labor' ? 'bg-brand-600 text-white border-brand-700' : 'bg-white text-slate-600 border-slate-300'}`}>حسب العمالة</button>
        <button onClick={() => setAllocMode('equal')} className={`px-3 py-1.5 rounded-lg font-bold border transition-colors ${alloc === 'equal' ? 'bg-brand-600 text-white border-brand-700' : 'bg-white text-slate-600 border-slate-300'}`}>بالتساوي</button>
        <span className="text-slate-400 text-[10px]">سجّل أي مصروف بمركز "مركزية (مشتركة)" ليُوزَّع على الفروع حسب المحرّك المختار.</span>
      </Card>

      <TabBar tabs={[{ id: 'centers', label: 'مراكز التكلفة' }, { id: 'budget', label: 'الموازنات حسب المركز' }]} active={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'centers' && (
        <>
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">الإيراد مقابل مكونات التكلفة لكل مركز</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="الإيراد" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="تكلفة الطعام" stackId="cost" fill="#f43f5e" />
                <Bar dataKey="العمالة" stackId="cost" fill="#8b5cf6" />
                <Bar dataKey="التشغيلية" stackId="cost" fill="#f59e0b" />
                <Bar dataKey="الهوالك" stackId="cost" fill="#0ea5e9" />
                <Bar dataKey="مخصص مركزي" stackId="cost" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">نقطة التعادل الإجمالية (ثابت/هامش مساهمة)</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{Number.isFinite(totalBreakEven) ? fmtMoney(totalBreakEven) : '—'}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مراكز دون نقطة التعادل</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${belowBreakEven > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{belowBreakEven}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">المسافة من التعادل (إيراد فعلي/تعادل)</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${totalBreakEven && totalRevenue >= totalBreakEven ? 'text-emerald-700' : 'text-rose-700'}`}>{Number.isFinite(totalBreakEven) && totalBreakEven > 0 ? ((totalRevenue / totalBreakEven) * 100).toFixed(2) + '%' : '—'}</strong></div>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-2">مركز التكلفة</th><th className="p-2">الإيراد</th><th className="p-2">تكلفة الطعام</th><th className="p-2">FC %</th><th className="p-2">العمالة</th><th className="p-2">التشغيلية</th><th className="p-2">الهوالك</th><th className="p-2">مخصص مركزي</th><th className="p-2">إجمالي التكلفة</th><th className="p-2">الربح</th><th className="p-2">الهامش %</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-2 font-extrabold text-slate-900">{r.name}</td>
                      <td className="tnum text-left p-2 font-bold">{fmt(r.revenue, 0)}</td>
                      <td className="tnum text-left p-2">{fmt(r.foodCost, 0)}</td>
                      <td className={`p-2 font-mono font-bold ${r.fcPct > 35 ? 'text-rose-700' : 'text-emerald-700'}`}>{r.fcPct.toFixed(2)}%</td>
                      <td className="tnum text-left p-2">{fmt(r.labor, 0)}</td>
                      <td className="tnum text-left p-2">{fmt(r.opex, 0)}</td>
                      <td className="tnum text-left p-2 text-rose-700">{fmt(r.wastage, 0)}</td>
                      <td className="tnum text-left p-2 text-slate-500">{fmt(r.sharedShare, 0)}</td>
                      <td className="tnum text-left p-2 font-extrabold">{fmt(r.totalCost, 0)}</td>
                      <td className={`p-2 font-mono font-extrabold ${r.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(r.profit, 0)}</td>
                      <td className={`p-2 font-mono font-extrabold ${r.margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{r.margin.toFixed(2)}%</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-slate-400 text-xs">لا توجد بيانات — أدخل فروعاً ومبيعات</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <h3 className="font-bold text-slate-800 text-xs p-3 border-b border-slate-100 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-brand-500" /> نقطة التعادل حسب المركز</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-2">مركز التكلفة</th><th className="p-2">العمليات</th><th className="p-2">تكاليف ثابتة</th><th className="p-2">نسبة التكلفة المتغيرة</th><th className="p-2">نقطة التعادل</th><th className="p-2">الحالة</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const varRatio = r.revenue ? r.foodCost / r.revenue : 0;
                    return (
                      <tr key={r.id} className={!r.coversBreakEven ? 'bg-rose-50/40' : ''}>
                        <td className="p-2 font-bold">{r.name}</td>
                        <td className="tnum text-left p-2">{r.orders}</td>
                        <td className="tnum text-left p-2">{fmt(r.labor + r.opex + r.sharedShare, 0)}</td>
                        <td className="tnum text-left p-2">{varRatio.toFixed(2)}%</td>
                        <td className="tnum text-left p-2 font-extrabold">{Number.isFinite(r.breakEven) ? fmt(r.breakEven, 0) : '—'}</td>
                        <td className="p-2">
                          {r.coversBreakEven ? <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">يغطي التعادل ✓</span> : <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">تحت التعادل</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400 text-xs">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-bold text-slate-800 text-xs mb-3">التكاليف التشغيلية حسب التصنيف (مدفوعة)</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(costByCategory).map(([c, v]) => (
                  <div key={c} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="font-bold text-slate-700 text-xs">{EXPENSE_CATEGORY_LABELS[c as OperatingExpenseCategory] || c}</span>
                    <span className="font-mono font-extrabold text-brand-700">{fmt(v, 0)} ر.س</span>
                  </div>
                ))}
                {Object.keys(costByCategory).length === 0 && <p className="text-center text-slate-400 text-xs py-6">لا توجد مصاريف مدفوعة</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-bold text-slate-800 text-xs mb-3">أعلى مركز هامشاً وأخفضه</h3>
              <div className="space-y-3">
                {rows.length > 0 && (
                  <>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                      <span className="flex items-center gap-2 text-xs font-extrabold text-emerald-800"><TrendingUp className="w-4 h-4" /> الأفضل: {[...rows].sort((a, b) => b.margin - a.margin)[0].name}</span>
                      <p className="text-[11px] text-emerald-700 mt-1 font-bold">هامش {[...rows].sort((a, b) => b.margin - a.margin)[0].margin.toFixed(2)}% — ربح {fmtMoney([...rows].sort((a, b) => b.margin - a.margin)[0].profit)}</p>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                      <span className="flex items-center gap-2 text-xs font-extrabold text-rose-800"><TrendingDown className="w-4 h-4" /> الأدنى: {[...rows].sort((a, b) => a.margin - b.margin)[0].name}</span>
                      <p className="text-[11px] text-rose-700 mt-1 font-bold">هامش {[...rows].sort((a, b) => a.margin - b.margin)[0].margin.toFixed(2)}% — راجع تكلفته</p>
                    </div>
                  </>
                )}
                {rows.length === 0 && <p className="text-center text-slate-400 text-xs py-6">لا توجد بيانات</p>}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === 'budget' && (
        <>
          <Card className="p-4 flex flex-wrap items-end gap-4 text-xs">
            <div>
              <span className="font-bold text-slate-700 block mb-1">الشهر</span>
              <input type="month" value={bMonth} onChange={(e) => setBMonth(e.target.value)} className={inputCls + ' !w-44'} />
            </div>
            <div>
              <span className="font-bold text-slate-700 block mb-1">مركز التكلفة</span>
              <select value={bBranch} onChange={(e) => setBBranch(e.target.value)} className={inputCls + ' !w-56'}>
                <option value="all">جميع المراكز</option>
                {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                <option value="b-ck">المطبخ المركزي</option>
                <option value="central">مركزية (مشتركة)</option>
              </select>
            </div>
            <Btn onClick={openBudgetEditor}><Pencil className="w-3.5 h-3.5" /> تعديل الموازنة</Btn>
            <span className={`font-extrabold px-3 py-1.5 rounded-lg ${variancePct > 5 ? 'bg-rose-100 text-rose-800' : variancePct < -3 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>انحراف: {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(2)}%</span>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الموازنة</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmtMoney(totalBudgeted)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الفعلي</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{fmtMoney(totalActual)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الفرق</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${totalActual - totalBudgeted > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmtMoney(totalActual - totalBudgeted)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">نسبة التنفيذ</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{totalBudgeted ? ((totalActual / totalBudgeted) * 100).toFixed(2) : '0.0'}%</strong></div>
          </div>

          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">الموازنة مقابل الفعلي حسب التصنيف — {monthLabel(bMonth)}</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={budgetChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="الموازنة" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="الفعلي" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">الاتجاه الشهري (آخر 6 أشهر)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="الموازنة" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="الفعلي" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-2">التصنيف</th><th className="p-2">الموازنة</th><th className="p-2">الفعلي</th><th className="p-2">الفرق</th><th className="p-2">التنفيذ %</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {budgetChart.map((r) => {
                    const diff = r['الفعلي'] - r['الموازنة'];
                    const execPct = r['الموازنة'] ? (r['الفعلي'] / r['الموازنة']) * 100 : 0;
                    return (
                      <tr key={r.name} className="hover:bg-slate-50">
                        <td className="p-2 font-bold text-slate-900 flex items-center gap-2">{r.name} {execPct > 110 && <span className="flex items-center gap-1 text-[9px] font-extrabold text-rose-700 bg-rose-100 border border-rose-200 rounded-lg px-1.5 py-0.5"><AlertTriangle className="w-3 h-3" /> تجاوز</span>}</td>
                        <td className="tnum text-left p-2">{fmt(r['الموازنة'], 0)}</td>
                        <td className="tnum text-left p-2 font-bold">{fmt(r['الفعلي'], 0)}</td>
                        <td className={`p-2 font-mono font-extrabold ${diff > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{diff >= 0 ? '+' : ''}{fmt(diff, 0)}</td>
                        <td className={`p-2 font-mono font-bold ${execPct > 100 ? 'text-rose-700' : 'text-emerald-700'}`}>{execPct.toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                  {budgetChart.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-xs">لا توجد موازنة أو مصاريف لهذا النطاق</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          {showBudgetModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowBudgetModal(false)}>
              <Card className="p-5 w-full max-w-lg" >
                <div onClick={(e) => e.stopPropagation()}>
                  <SectionHeader title={`موازنة ${branchLabel(bBranch)} — ${monthLabel(bMonth)}`} subtitle={bBranch === 'all' ? 'اختر مركزاً واحداً لحفظ الموازنة' : 'أدخل مبالغ الموازنة لكل تصنيف'} icon={<Boxes className="w-5 h-5 text-brand-600" />} />
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                    {(Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[]).map((c) => (
                      <div key={c} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <span className="font-bold text-slate-700 text-xs">{EXPENSE_CATEGORY_LABELS[c]}</span>
                        <input type="number" min="0" step="any" value={budgetValues[c] || ''} onChange={(e) => setBudgetValues({ ...budgetValues, [c]: parseFloat(e.target.value) || 0 })} className={inputCls + ' !w-28'} placeholder="المبلغ" />
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 flex justify-end gap-2">
                    <button onClick={() => setShowBudgetModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium text-xs">إلغاء</button>
                    <button onClick={saveBudget} disabled={bBranch === 'all'} className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium text-xs disabled:opacity-40">حفظ الموازنة</button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
};