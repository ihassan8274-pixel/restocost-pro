import React, { useMemo, useState, useEffect } from 'react';
import { PieChart as PieIcon, FileDown, RefreshCw, Printer } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

// ألوان داكنة ومتباينة للطباعة والشاشة
const CHART_COLORS = ['#1e3a8a', '#991b1b', '#065f46', '#92400e', '#4c1d95', '#0e7490', '#334155'];

export const PLStatementView: React.FC = () => {
  const { plSummaries, batchSalesRecords, operatingExpenses, wastageLogs, branches, getBranchName, rebuildPLSummaries } = useApp();
  const [builtNote, setBuiltNote] = useState('');

  useEffect(() => {
    rebuildPLSummaries(undefined);
    setBuiltNote('أُعيد بناء القائمة تلقائياً من المحرك المالي الموحد (حركات المبيعات والدفعات والعمالة والمصاريف والهوالك الفعلية).');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPeriods = useMemo(() => Array.from(new Set(plSummaries.map((s) => s.period))).sort((a, b) => b.localeCompare(a)), [plSummaries]);
  const [period, setPeriod] = useState<string>(allPeriods[0] || '');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const scope = plSummaries.filter((s) => (!period || s.period === period) && (branchFilter === 'all' || s.branchId === branchFilter));

  const revenue = scope.reduce((s, x) => s + x.totalSales, 0);
  const foodCost = scope.reduce((s, x) => s + x.foodCost, 0);
  const laborCost = scope.reduce((s, x) => s + x.laborCost, 0);
  const operatingCost = scope.reduce((s, x) => s + x.operatingExpenses, 0);

  const revenueLive = batchSalesRecords.reduce((s, b) => s + b.totalRevenue, 0);
  const foodLive = batchSalesRecords.reduce((s, b) => s + b.totalFoodCost, 0);
  const operatingLive = operatingExpenses.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
  const wastageCost = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);

  const effRevenue = scope.length ? revenue : revenueLive;
  const effFood = scope.length ? foodCost : foodLive;
  const effLabor = scope.length ? laborCost : 0;
  const effOperating = scope.length ? operatingCost : operatingLive;
  const effWastage = wastageCost;

  const grossProfit = effRevenue - effFood - effLabor;
  const totalExpenses = effOperating + effWastage;
  const netProfit = grossProfit - totalExpenses;

  const costBreakdown = [
    { name: 'تكلفة الطعام', value: effFood },
    { name: 'العمالة', value: effLabor },
    { name: 'التشغيلية', value: effOperating },
    { name: 'الهوالك', value: effWastage },
  ].filter((d) => d.value > 0);

  const rows = [
    { label: 'الإيراد', value: effRevenue, isBold: true },
    { label: 'تكلفة الطعام', value: -effFood },
    { label: 'العمالة المباشرة', value: -effLabor },
    { label: 'إجمالي الربح', value: grossProfit, isBold: true, highlight: true },
    { label: 'المصاريف التشغيلية', value: -effOperating },
    { label: 'الهوالك والفاقد', value: -effWastage },
    { label: 'صافي الربح', value: netProfit, isBold: true, highlight: true },
  ];

  const netMargin = effRevenue ? (netProfit / effRevenue) * 100 : 0;
  const fcPct = effRevenue ? (effFood / effRevenue) * 100 : 0;

  // Per-branch comparison table
  const branchRows = useMemo(() => {
    const base = plSummaries.filter((s) => !period || s.period === period);
    return base.map((p) => {
      const w = wastageLogs.reduce((s, x) => s + x.totalCostImpact, 0);
      const gross = p.totalSales - p.foodCost - p.laborCost;
      const net = gross - p.operatingExpenses - w;
      return {
        branchId: p.branchId, branchName: getBranchName(p.branchId),
        totalSales: p.totalSales, foodCostPercent: p.foodCostPercent,
        laborCostPercent: p.laborCostPercent, operatingExpenses: p.operatingExpenses,
        netProfit: net, netProfitPercent: p.totalSales ? (net / p.totalSales) * 100 : 0,
      };
    }).sort((a, b) => b.totalSales - a.totalSales);
  }, [plSummaries, period, wastageLogs, getBranchName]);

  return (
    <div className="space-y-6">
      <PageHeader title="قائمة الدخل (P&L)" subtitle="تقرير الإيرادات والتكاليف وصافي الربح حسب الفرع والفترة" icon={<PieIcon className="w-6 h-6 text-brand-600" />}
        actions={<>
          <ViewToolbar filename="قائمة الدخل" sheets={[
            { name: 'قائمة الدخل', header: ['البند', 'القيمة'], rows: rows.map((r) => [r.label, r.value]) },
            { name: 'توزيع التكاليف', header: ['البند', 'القيمة'], rows: costBreakdown.map((d) => [d.name, d.value]) },
            { name: 'مقارنة الفروع', header: ['الفرع', 'المبيعات', 'Food Cost %', 'العمالة %', 'التشغيلية', 'صافي الربح', 'الهامش %'], rows: branchRows.map((b) => [b.branchName, b.totalSales, b.foodCostPercent, b.laborCostPercent, b.operatingExpenses, b.netProfit, b.netProfitPercent.toFixed(2)]) },
          ]} />
          <Btn tone="ghost" onClick={() => openPrintWindow({
            title: 'قائمة الدخل (P&L)',
            subtitle: `الفترة ${period || 'كل الفترات'} — ${branchFilter === 'all' ? 'كل الفروع' : getBranchName(branchFilter)}`,
            meta: [['صافي الربح', fmt(netProfit, 2)], ['هامش الربح %', netMargin.toFixed(2)], ['Food Cost %', fcPct.toFixed(2)]],
            tables: [
              { title: 'قائمة الدخل', header: ['البند', 'القيمة'], rows: rows.map((r) => [r.label, fmt(r.value, 2)]) },
              { title: 'مقارنة الفروع', header: ['الفرع', 'المبيعات', 'FC%', 'العمالة%', 'التشغيلية', 'صافي الربح', 'الهامش%'], rows: branchRows.map((b) => [b.branchName, fmt(b.totalSales, 2), b.foodCostPercent.toFixed(1), b.laborCostPercent.toFixed(1), fmt(b.operatingExpenses, 2), fmt(b.netProfit, 2), b.netProfitPercent.toFixed(1)]) },
            ],
            totals: [], footer: 'قائمة الدخل — RestoCost ERP',
          })}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => { rebuildPLSummaries(undefined); setBuiltNote('أُعيد بناء القائمة من المحرك المالي الموحد (الحركات الفعلية).'); }}><RefreshCw className="w-4 h-4" /> إعادة البناء (المحرك الموحد)</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV(`قائمة_الدخل_${period || 'الكل'}.csv`, ['البند', 'القيمة'], rows.map((r) => [r.label, r.value]))}><FileDown className="w-4 h-4" /> تصدير</Btn>
        </>} />

      {builtNote && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-2 text-[11px] font-bold">{builtNote}</div>}

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="الفترة">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls + ' !w-48'}>
            <option value="">كل الفترات</option>
            {allPeriods.map((p) => <option key={p} value={p}>{p}</option>)}
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
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الإيراد</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(effRevenue, 0)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">Food Cost</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{fcPct.toFixed(2)}%</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي الربح</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{fmt(netProfit, 0)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي الهامش</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{netMargin.toFixed(2)}%</strong></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">القائمة التدريجية</h3>
          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.label} className={`flex items-center justify-between rounded-xl px-3 py-2 ${r.isBold ? 'font-extrabold text-slate-900' : 'text-slate-600 font-bold'} ${r.highlight ? 'bg-brand-50 border border-brand-100' : 'bg-slate-50 border border-slate-100'} text-xs`}>
                <span>{r.label}</span>
                <span className={`font-mono ${r.value < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{r.value < 0 ? `(${fmt(-r.value, 0)})` : fmt(r.value, 0)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">توزيع التكاليف</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={costBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
                {costBreakdown.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-xs mb-3">مقارنة أداء الفروع {period ? `— ${period}` : ''}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                <th className="text-right p-2 font-bold">#</th>
                <th className="text-right p-2 font-bold">الفرع</th>
                <th className="text-right p-2 font-bold">المبيعات</th>
                <th className="text-right p-2 font-bold">Food Cost</th>
                <th className="text-right p-2 font-bold">العمالة</th>
                <th className="text-right p-2 font-bold">التشغيلية</th>
                <th className="text-right p-2 font-bold">صافي الربح</th>
                <th className="text-right p-2 font-bold">الهامش</th>
              </tr>
            </thead>
            <tbody>
              {branchRows.map((b, i) => (
                <tr key={b.branchId} className={`border-b border-slate-50 hover:bg-slate-50 ${i === 0 ? 'bg-amber-50/60' : ''}`}>
                  <td className="p-2"><span className={`w-6 h-6 inline-flex items-center justify-center rounded-lg font-extrabold ${i === 0 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span></td>
                  <td className="p-2 font-bold text-slate-800">{b.branchName}</td>
                  <td className="tnum text-left p-2 font-bold text-brand-700">{fmt(b.totalSales)}</td>
                  <td className="tnum text-left p-2 font-bold text-rose-600">{b.foodCostPercent.toFixed(2)}%</td>
                  <td className="tnum text-left p-2 font-bold text-amber-700">{b.laborCostPercent.toFixed(2)}%</td>
                  <td className="tnum text-left p-2 font-bold text-slate-600">{fmt(b.operatingExpenses)}</td>
                  <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(b.netProfit)}</td>
                  <td className="tnum text-left p-2 font-bold text-slate-900">{b.netProfitPercent.toFixed(2)}%</td>
                </tr>
              ))}
              {branchRows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500 font-bold">لا توجد بيانات لهذه الفترة</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
