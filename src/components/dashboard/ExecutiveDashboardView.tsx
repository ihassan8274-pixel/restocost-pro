import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  AreaChart, Area, Line, PieChart, Pie, Cell,
} from 'recharts';
import {
  Crown, TrendingUp, AlertTriangle, Wallet, Boxes, Users as UsersIcon, CalendarCheck,
  ArrowUpRight, ArrowDownRight, CheckCircle2, TimerReset, Printer, ListChecks, Store, Layers,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, StatCard, SectionHeader, Btn, Sparkline } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { InsightsStrip } from './InsightsStrip';
import { fmt, fmtMoney, EXPENSE_CATEGORY_LABELS, RESERVATION_STATUS_LABELS } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

const PIE_COLORS = ['#d97706', '#f59e0b', '#0d9488', '#e11d48', '#10b981', '#8b5cf6', '#64748b', '#f43f5e', '#06b6d4', '#ca8a04'];

export const ExecutiveDashboardView: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const {
    plSummaries, operatingExpenses, expenseBudgets, inventory, rawMaterials,
    invoices, reservations, customers, wastageLogs, getFoodCostAlerts, visibleBranchIds, getBranchName, getBranchAverageUnitCost, branches,
  } = useApp();

  // ---- Branch filter (V1-b بند 14) ----
  const candidateBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all');
  const effectiveBranchIds = branchFilter === 'all' ? visibleBranchIds : [branchFilter];

  // ---- Aggregate across visible branches ----
  const visiblePl = plSummaries.filter((p) => effectiveBranchIds.length === 0 || effectiveBranchIds.includes(p.branchId));
  const groupSales = visiblePl.reduce((s, p) => s + p.totalSales, 0);
  const groupFood = visiblePl.reduce((s, p) => s + p.foodCost, 0);
  const groupLabor = visiblePl.reduce((s, p) => s + p.laborCost, 0);
  const groupOpex = visiblePl.reduce((s, p) => s + p.operatingExpenses, 0);
  const groupProfit = visiblePl.reduce((s, p) => s + p.netProfit, 0);

  const foodPct = groupSales ? (groupFood / groupSales) * 100 : 0;
  const laborPct = groupSales ? (groupLabor / groupSales) * 100 : 0;
  const profitPct = groupSales ? (groupProfit / groupSales) * 100 : 0;

  // ---- Trend by month (from P&L period keys) ----
  const trendByPeriod = useMemo(() => {
    const map = new Map<string, { sales: number; profit: number; food: number }>();
    visiblePl.forEach((p) => {
      const key = p.period;
      const cur = map.get(key) || { sales: 0, profit: 0, food: 0 };
      cur.sales += p.totalSales; cur.profit += p.netProfit; cur.food += p.foodCost;
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([period, v]) => ({
      name: period,
      المبيعات: v.sales,
      'صافي الربح': v.profit,
      foodCostPercent: v.sales ? Math.round((v.food / v.sales) * 1000) / 10 : 0,
    }));
  }, [visiblePl]);

  const last = trendByPeriod[trendByPeriod.length - 1];
  const prev = trendByPeriod[trendByPeriod.length - 2];
  const momGrowth = prev && prev['المبيعات'] ? ((last['المبيعات'] - prev['المبيعات']) / prev['المبيعات']) * 100 : 0;

  // ---- Branch ranking ----
  const branchRanking = useMemo(() => {
    return visiblePl
      .map((p, i) => ({ rank: i + 1, ...p, branchName: getBranchName(p.branchId) }))
      .sort((a, b) => b.totalSales - a.totalSales)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  }, [visiblePl, getBranchName]);

  const bestBranch = branchRanking.length ? branchRanking[0] : null;

  // ---- Budget vs actual (current month) ----
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const budgetVsActual = useMemo(() => {
    const map = new Map<string, { budget: number; actual: number }>();
    expenseBudgets.filter((b) => b.month === currentMonth).forEach((b) => {
      b.items.forEach((it) => {
        const cur = map.get(it.category) || { budget: 0, actual: 0 };
        cur.budget += it.budgetedAmount;
        map.set(it.category, cur);
      });
    });
    operatingExpenses.filter((e) => e.paymentStatus === 'paid').forEach((e) => {
      const cur = map.get(e.category) || { budget: 0, actual: 0 };
      cur.actual += e.amount;
      map.set(e.category, cur);
    });
    return Array.from(map.entries()).map(([cat, v]) => ({
      name: EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat,
      الميزانية: v.budget,
      الفعلي: v.actual,
      pct: v.budget ? Math.round((v.actual / v.budget) * 100) : 0,
    }));
  }, [expenseBudgets, operatingExpenses, currentMonth]);

  const overBudget = budgetVsActual.filter((b) => b['الفعلي'] > b['الميزانية'] && b['الميزانية'] > 0);

  // ---- Inventory value ----
  const inventoryValue = useMemo(() => {
    return inventory.reduce((s, rec) => s + rec.quantity * getBranchAverageUnitCost(rec.branchId, rec.rawMaterialId), 0);
  }, [inventory, getBranchAverageUnitCost]);

  // ---- Cash at risk ----
  const overdueExpenses = operatingExpenses.filter((e) => e.paymentStatus === 'overdue');
  const overdueExpenseTotal = overdueExpenses.reduce((s, e) => s + e.amount, 0);
  const unpaidInvoices = invoices.filter((i) => i.status === 'issued' || i.status === 'partially_paid' || i.status === 'overdue');
  const receivables = unpaidInvoices.filter((i) => i.type === 'sales').reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
  const payables = unpaidInvoices.filter((i) => i.type === 'purchase').reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
  const cashAtRisk = overdueExpenseTotal + receivables;

  // ---- Today reservations ----
  const todayReservations = reservations.filter((r) => r.date === new Date().toISOString().split('T')[0] && r.status !== 'cancelled' && r.status !== 'no_show');

  // ---- Alerts ----
  const alerts = getFoodCostAlerts();
  const unack = alerts.filter((a) => !a.isAcknowledged);
  const totalWastage = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);

  const lowStockCount = rawMaterials.filter((m) => inventory.filter((i) => i.rawMaterialId === m.id).reduce((s, i) => s + i.quantity, 0) <= m.minStockLevel).length;
  const wastagePctOfFood = groupFood ? (totalWastage / groupFood) * 100 : 0;
  const costAlerts = [
    { key: 'fc', title: 'Food Cost مرتفعة', desc: `${foodPct.toFixed(2)}% من المبيعات (الحد 35%)`, active: foodPct > 35, nav: 'cost_reports' },
    { key: 'labor', title: 'تكلفة العمالة مرتفعة', desc: `${laborPct.toFixed(2)}% من المبيعات (الحد 25%)`, active: laborPct > 25, nav: 'reports_dashboard' },
    { key: 'wastage', title: 'الهالك فوق الحد', desc: `${wastagePctOfFood.toFixed(2)}% من تكلفة الطعام (الحد 5%)`, active: wastagePctOfFood > 5, nav: 'wastage' },
    { key: 'unack', title: 'تنبيهات تكلفة غير معترف بها', desc: `${unack.length} طبقاً فوق المستهدف`, active: unack.length > 0, nav: 'cost_analysis' },
    { key: 'budget', title: 'تجاوز موازنة', desc: `${overBudget.length} تصنيفاً تجاوز الموازنة`, active: overBudget.length > 0, nav: 'cost_centers' },
    { key: 'stock', title: 'مخزون تحت الحد الأدنى', desc: `${lowStockCount} صنفاً`, active: lowStockCount > 0, nav: 'inventory' },
  ];
  const activeCostAlerts = costAlerts.filter((a) => a.active);

  const vips = customers.filter((c) => c.isVip);
  const customerTotalSpend = customers.reduce((s, c) => s + c.totalSpent, 0);

  const avgBranchRevenue = visiblePl.length ? groupSales / visiblePl.length : 0;

  // بيانات خطوط الاتجاه المصغرة (sparklines) من نفس سلسلة الأداء الشهري
  const sparkSales = trendByPeriod.map((t) => t['المبيعات']);
  const sparkProfit = trendByPeriod.map((t) => t['صافي الربح']);
  const sparkFood = trendByPeriod.map((t) => t.foodCostPercent);
  const sparkOpex = trendByPeriod.map((t) => t['المبيعات']);

  const followUps = [
    { id: 'lowstock', icon: <Boxes className="w-4 h-4" />, title: `${lowStockCount} صنف تحت الحد الأدنى`, desc: 'راجع المخزون وفعّل طلبات التجديد', nav: 'inventory', tone: lowStockCount > 0 ? 'rose' : 'emerald', badge: lowStockCount > 0 },
    { id: 'unack', icon: <AlertTriangle className="w-4 h-4" />, title: `${unack.length} تنبيه تكلفة غير معترف به`, desc: 'أطباق تتجاوز الهامش المستهدف', nav: 'cost_analysis', tone: unack.length > 0 ? 'rose' : 'emerald', badge: unack.length > 0 },
    { id: 'cash', icon: <Wallet className="w-4 h-4" />, title: `مستحقات ${fmtMoney(receivables)} — التزامات ${fmtMoney(payables)}`, desc: `نقدية معرضة للخطر ${fmtMoney(cashAtRisk)}`, nav: 'cash_flow', tone: cashAtRisk > 0 ? 'amber' : 'emerald', badge: cashAtRisk > 0 },
    { id: 'res', icon: <CalendarCheck className="w-4 h-4" />, title: `${todayReservations.length} حجز اليوم`, desc: 'حجوزات اليوم حسب السجلات', nav: 'eod_board', tone: todayReservations.length > 0 ? 'amber' : 'emerald', badge: todayReservations.length > 0 },
    { id: 'budget', icon: <TrendingUp className="w-4 h-4" />, title: `${overBudget.length} تصنيف تجاوز الموازنة`, desc: 'انحراف فعلي فوق الميزانية المعتمدة', nav: 'cost_centers', tone: overBudget.length > 0 ? 'amber' : 'emerald', badge: overBudget.length > 0 },
  ];

  const printExecutiveSummary = () => {
    openPrintWindow({
      title: 'ملخص لوحة القيادة التنفيذية',
      subtitle: 'تقرير تنفيذي موجز',
      meta: [
        ['عدد الفروع', `${visiblePl.length}`],
        ['متوسط الإيراد/فرع', fmtMoney(avgBranchRevenue)],
        ['الفترة المرجعية', `${trendByPeriod.length} فترة`],
      ],
      tables: [
        {
          title: 'المؤشرات التنفيذية',
          header: ['المؤشر', 'القيمة', 'الملاحظة'],
          rows: [
            ['إجمالي المبيعات', `${fmt(groupSales)} ر.س`, `${visiblePl.length} فرع`],
            ['صافي الربح', `${fmt(groupProfit)} ر.س`, `${profitPct.toFixed(2)}% هامش`],
            ['Food Cost', `${foodPct.toFixed(2)}%`, `${fmt(groupFood)} ر.س`],
            ['العمالة', `${laborPct.toFixed(2)}%`, `${fmt(groupLabor)} ر.س`],
            ['قيمة المخزون', `${fmt(inventoryValue)} ر.س`, 'بالأسعار المعيارية'],
            ['مستحقات العملاء', `${fmt(receivables)} ر.س`, ''],
            ['الالتزامات للموردين', `${fmt(payables)} ر.س`, ''],
            ['نقدية معرضة للخطر', `${fmt(cashAtRisk)} ر.س`, ''],
          ],
        },
        {
          title: 'ترتيب الفروع',
          header: ['#', 'الفرع', 'المبيعات', 'FC %', 'العمالة %', 'صافي الربح', 'الهامش %'],
          rows: branchRanking.map((p) => [p.rank, p.branchName, p.totalSales, p.foodCostPercent, p.laborCostPercent, p.netProfit, p.netProfitPercent]),
        },
        {
          title: 'قائمة المتابعة التنفيذية',
          header: ['الإجراء', 'الوصف', 'الحالة'],
          rows: followUps.map((f) => [f.title, f.desc, f.badge ? 'يحتاج إجراء' : 'ممتاز']),
        },
      ],
      totals: [
        ['التغيّر الشهري في المبيعات', `${momGrowth >= 0 ? '+' : ''}${momGrowth.toFixed(2)}%`],
        ['Food Cost المحقق', `${foodPct.toFixed(2)}%`],
      ],
      footer: 'ملخص لوحة القيادة التنفيذية — RestoCost ERP Pro',
    });
  };

  const printBranchRanking = () => {
    openPrintWindow({
      title: 'ترتيب الفروع',
      subtitle: 'مقارنة أداء الفروع حسب المبيعات والهوامش',
      meta: [
        ['عدد الفروع', `${branchRanking.length}`],
        ['إجمالي مبيعات المجموعة', fmtMoney(groupSales)],
      ],
      tables: [
        {
          title: 'ترتيب الفروع',
          header: ['#', 'الفرع', 'المبيعات', 'FC %', 'العمالة %', 'التشغيلية', 'صافي الربح', 'الهامش %', 'المساهمة %'],
          rows: branchRanking.map((p) => [
            p.rank,
            p.branchName.replace('فرع ', ''),
            p.totalSales,
            p.foodCostPercent.toFixed(2),
            p.laborCostPercent.toFixed(2),
            p.operatingExpenses,
            p.netProfit,
            p.netProfitPercent.toFixed(2),
            groupSales ? ((p.totalSales / groupSales) * 100).toFixed(2) : '0',
          ]),
        },
      ],
      totals: [
        ['إجمالي المبيعات', fmtMoney(groupSales)],
        ['صافي الربح الكلي', `${fmtMoney(groupProfit)} (${profitPct.toFixed(2)}%)`],
      ],
      footer: 'تقرير ترتيب الفروع — RestoCost ERP Pro',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة القيادة التنفيذية (CEO)"
        subtitle="نظرة شاملة على أداء المجموعة، مقارنة الفروع، متابعة الميزانيات، والمخاطر النقدية"
        icon={<Crown className="w-6 h-6 text-amber-300" />}
        actions={
          <>
            <ViewToolbar
              filename="لوحة القيادة التنفيذية"
              sheets={[
              {
                name: 'مؤشرات تنفيذية',
                header: ['المؤشر', 'القيمة', 'ملاحظة'],
                rows: [
                  ['إجمالي المبيعات', groupSales, `${visiblePl.length} فرع`],
                  ['صافي الربح', groupProfit, `${profitPct.toFixed(2)}% هامش`],
                  ['Food Cost', groupFood, `${foodPct.toFixed(2)}%`],
                  ['العمالة', groupLabor, `${laborPct.toFixed(2)}%`],
                  ['قيمة المخزون', inventoryValue, 'بالأسعار المعيارية'],
                  ['نقدية معرضة للخطر', cashAtRisk, `+ ${fmt(payables)} مستحقات`],
                  ['مستحقات عملاء', receivables, ''],
                  ['مستحقات موردين', payables, ''],
                  ['هوالك الشهر', totalWastage, `${wastageLogs.length} وقائع`],
                ],
              },
              {
                name: 'ترتيب الفروع',
                header: ['الترتيب', 'الفرع', 'المبيعات', 'Food Cost %', 'العمالة %', 'التشغيلية', 'صافي الربح', 'الهامش %'],
                rows: branchRanking.map((p) => [p.rank, p.branchName.replace('فرع ', ''), p.totalSales, p.foodCostPercent, p.laborCostPercent, p.operatingExpenses, p.netProfit, p.netProfitPercent]),
              },
            ]}
          />
            <Btn tone="dark" onClick={printExecutiveSummary}>
              <Printer className="w-4 h-4" /> طباعة ملخص اللوحة
            </Btn>
          </>
        }
      />

      {/* Branch filter strip (بند 14) */}
      {candidateBranches.length > 1 && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-primary-700 shrink-0">
              <Store className="w-4 h-4" /> فلتر الفرع:
            </span>
            <button
              onClick={() => setBranchFilter('all')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-colors border ${branchFilter === 'all' ? 'bg-primary-700 text-white border-primary-700' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300'}`}
            >
              <Layers className="w-3.5 h-3.5" /> كل الفروع
            </button>
            {candidateBranches.map((b) => (
              <button
                key={b.id}
                onClick={() => setBranchFilter(branchFilter === b.id ? 'all' : b.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-colors border ${branchFilter === b.id ? 'bg-primary-700 text-white border-primary-700' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300'}`}
              >
                {b.nameAr}
              </button>
            ))}
          </div>
        </Card>
      )}

      <InsightsStrip onNavigate={onNavigate} />

      {/* Mobile-first executive follow-up list (قائمة متابعة تنفيذية) */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <SectionHeader title="قائمة المتابعة التنفيذية" subtitle="أولويات العمل اليومية للقيادة — مرتبة حسب الأهمية وتعمل بسلاسة على الهاتف" icon={<ListChecks className="w-5 h-5 text-amber-600" />} />
        </div>
        <div className="divide-y divide-slate-100">
          {followUps.map((f) => (
            <button key={f.id} onClick={() => onNavigate(f.nav)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${f.tone === 'rose' ? 'bg-rose-50 text-rose-600' : f.tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{f.icon}</span>
                <div className="min-w-0">
                  <p className="font-extrabold text-slate-900 text-[13px] truncate">{f.title}</p>
                  <p className="text-[11px] text-slate-500 truncate">{f.desc}</p>
                </div>
              </div>
              <span className={`shrink-0 text-[9px] font-extrabold px-2 py-1 rounded-full ${f.badge ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {f.badge ? 'يحتاج إجراء' : 'ممتاز'}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Executive KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="إجمالي المبيعات" value={fmt(groupSales)} sub={`متوسط ${fmt(avgBranchRevenue)} ر.س/فرع`} icon={<Sparkline data={sparkSales} color="#d97706" />} />
        <StatCard label="صافي الربح" value={fmt(groupProfit)} sub={`${profitPct.toFixed(2)}% هامش`} tone="emerald" icon={<Sparkline data={sparkProfit} color="#10b981" />} />
        <StatCard label="Food Cost" value={`${foodPct.toFixed(2)}%`} sub={`${fmt(groupFood)} ر.س`} tone="indigo" icon={<Sparkline data={sparkFood} color="#d97706" />} />
        <StatCard label="العمالة" value={`${laborPct.toFixed(2)}%`} sub={`${fmt(groupLabor)} ر.س`} tone="amber" icon={<Sparkline data={sparkOpex} color="#0d9488" />} />
        <StatCard label="قيمة المخزون" value={fmt(inventoryValue)} sub="بالأسعار المعيارية" icon={<Boxes className="w-4 h-4 text-cyan-600" />} />
        <StatCard label="نقدية معرضة للخطر" value={fmt(cashAtRisk)} sub={`+ ${fmt(payables)} مستحقات`} tone="rose" icon={<AlertTriangle className="w-4 h-4 text-rose-500" />} />
      </div>

      {/* Cost deviation auto-detection */}
      <Card className="p-4">
        <SectionHeader title="كشف الانحراف الآلي (التكلفة)" subtitle="تنبيهات تلقائية عند تجاوز الحدود — التقطها قبل أن تكبر"
          icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
          extra={<span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${activeCostAlerts.length ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{activeCostAlerts.length ? `${activeCostAlerts.length} تنبيه نشط` : 'كل المؤشرات ضمن الحدود ✓'}</span>} />
        {activeCostAlerts.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
            {activeCostAlerts.map((a) => (
              <button key={a.key} onClick={() => onNavigate(a.nav)} className="text-right bg-rose-50/60 border border-rose-200 rounded-xl p-3 hover:bg-rose-50 transition-colors">
                <p className="flex items-center gap-2 font-extrabold text-rose-800 text-xs"><AlertTriangle className="w-4 h-4" /> {a.title}</p>
                <p className="text-[11px] text-slate-600 font-bold mt-1">{a.desc}</p>
                <p className="text-[10px] text-rose-500 font-extrabold mt-1">انتقل للتحليل ←</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-emerald-700 text-xs font-extrabold mt-3"><CheckCircle2 className="w-4 h-4" /> لا توجد انحرافات حالياً — Food Cost والعمالة والهالك والمخزون ضمن الحدود.</p>
        )}
      </Card>

      {/* Group trend + best branch */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <SectionHeader title="أداء المجموعة الشهري" subtitle="المبيعات وصافي الربح حسب الفترة"
            icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
            extra={<span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${momGrowth >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
              {momGrowth >= 0 ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />} {Math.abs(momGrowth).toFixed(2)}% شهري
            </span>} />
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendByPeriod}>
                <defs>
                  <linearGradient id="ceoRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d97706" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#d97706" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v: unknown) => `${fmt(Number(v))} ر.س`} />
                <Area type="monotone" dataKey="المبيعات" stroke="#d97706" strokeWidth={2.5} fill="url(#ceoRev)" />
                <Line type="monotone" dataKey="صافي الربح" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="أفضل فرع هذا الشهر" icon={<Crown className="w-5 h-5 text-amber-500" />} />
          {bestBranch ? (
            <div className="mt-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center">
                <Crown className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="font-extrabold text-slate-900 mt-3 text-sm">{bestBranch.branchName.replace('فرع ', '')}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">الأعلى مبيعات بين {branchRanking.length} فرع</p>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                  <p className="text-[10px] text-slate-500 font-bold">المبيعات</p>
                  <p className="font-mono font-extrabold text-indigo-700 text-xs mt-0.5">{fmt(bestBranch.totalSales)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                  <p className="text-[10px] text-slate-500 font-bold">Food Cost</p>
                  <p className="font-mono font-extrabold text-rose-600 text-xs mt-0.5">{bestBranch.foodCostPercent.toFixed(2)}%</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                  <p className="text-[10px] text-slate-500 font-bold">الهامش</p>
                  <p className="font-mono font-extrabold text-emerald-700 text-xs mt-0.5">{bestBranch.netProfitPercent.toFixed(2)}%</p>
                </div>
              </div>
              <button onClick={() => onNavigate('pl_statement')} className="mt-4 w-full text-xs font-bold text-indigo-600 hover:text-indigo-800">
                الانتقال إلى القوائم المالية
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-4">لا توجد بيانات كافية</p>
          )}
        </Card>
      </div>

      {/* Branch ranking table */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title="ترتيب الفروع" subtitle="مقارنة أداء الفروع حسب المبيعات والهوامش"
            icon={<BarChart className="w-5 h-5 text-indigo-600" />} />
          <Btn tone="ghost" onClick={printBranchRanking}><Printer className="w-4 h-4" /> طباعة</Btn>
        </div>
        <div className="overflow-x-auto mt-4">
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
                <th className="text-right p-2 font-bold">المساهمة في الإيراد</th>
              </tr>
            </thead>
            <tbody>
              {branchRanking.map((p) => {
                const share = groupSales ? (p.totalSales / groupSales) * 100 : 0;
                return (
                  <tr key={p.branchId} className={`border-b border-slate-50 hover:bg-slate-50 ${p.rank === 1 ? 'bg-amber-50/60' : ''}`}>
                    <td className="p-2">
                      <span className={`w-6 h-6 inline-flex items-center justify-center rounded-lg font-extrabold ${p.rank === 1 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-600'}`}>{p.rank}</span>
                    </td>
                    <td className="p-2 font-bold text-slate-800">{p.branchName.replace('فرع ', '')}</td>
                    <td className="tnum text-left p-2 font-bold text-indigo-700">{fmt(p.totalSales)}</td>
                    <td className="tnum text-left p-2 font-bold text-rose-600">{p.foodCostPercent.toFixed(2)}%</td>
                    <td className="tnum text-left p-2 font-bold text-amber-700">{p.laborCostPercent.toFixed(2)}%</td>
                    <td className="tnum text-left p-2 font-bold text-slate-600">{fmt(p.operatingExpenses)}</td>
                    <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(p.netProfit)}</td>
                    <td className="tnum text-left p-2 font-bold text-slate-900">{p.netProfitPercent.toFixed(2)}%</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${share}%` }} /></div>
                        <span className="font-mono text-[10px] text-slate-500">{share.toFixed(2)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Budget vs actual + cost mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <SectionHeader title="الميزانية مقابل الفعلي" subtitle={`مصاريف ${currentMonth} حسب البند`}
            icon={<Wallet className="w-5 h-5 text-indigo-600" />}
            extra={overBudget.length > 0 ? <span className="text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-1 rounded-lg">{overBudget.length} بنود تجاوزت الميزانية</span> : <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg"><CheckCircle2 className="w-3 h-3 inline" /> ضمن الميزانية</span>} />
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetVsActual}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v: unknown) => `${fmt(Number(v))} ر.س`} />
                <Legend />
                <Bar dataKey="الميزانية" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="الفعلي" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="مكونات التكلفة" icon={<PieChart className="w-5 h-5 text-indigo-600" />} />
          <div className="h-48 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[
                  { name: 'تكلفة الأغذية', value: groupFood },
                  { name: 'العمالة', value: groupLabor },
                  { name: 'التشغيلية', value: groupOpex },
                  { name: 'صافي الربح', value: groupProfit },
                ]} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
                <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v: unknown) => `${fmt(Number(v))} ر.س`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {[['تكلفة الأغذية', groupFood], ['العمالة', groupLabor], ['التشغيلية', groupOpex], ['صافي الربح', groupProfit]].map(([label, v]) => (
              <div key={String(label)} className="bg-slate-50 border border-slate-100 rounded-lg p-1.5 text-[10px]">
                <span className="text-slate-500 font-bold">{label}</span>
                <span className="font-mono font-extrabold text-slate-800 block">{fmt(Number(v))}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Risk & focus panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4">
          <SectionHeader title="مخاطر نقدية" icon={<TimerReset className="w-5 h-5 text-rose-500" />} extra={<span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200">{fmt(cashAtRisk)} ر.س</span>} />
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between items-center bg-rose-50 border border-rose-100 rounded-xl p-2.5">
              <span className="text-rose-800 font-bold">مصاريف متأخرة ({overdueExpenses.length})</span>
              <span className="font-mono font-extrabold text-rose-700">{fmt(overdueExpenseTotal)}</span>
            </div>
            <div className="flex justify-between items-center bg-amber-50 border border-amber-100 rounded-xl p-2.5">
              <span className="text-amber-800 font-bold">مستحقات عملاء</span>
              <span className="font-mono font-extrabold text-amber-800">{fmt(receivables)}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-xl p-2.5">
              <span className="text-slate-600 font-bold">مستحقات موردين</span>
              <span className="font-mono font-extrabold text-slate-700">{fmt(payables)}</span>
            </div>
            <button onClick={() => onNavigate('cash_flow')} className="w-full text-[10px] font-bold text-indigo-600 hover:text-indigo-800 text-center">قائمة التدفقات النقدية</button>
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="حجوزات اليوم" icon={<CalendarCheck className="w-5 h-5 text-indigo-500" />} extra={<span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">{todayReservations.length}</span>} />
          <div className="mt-3 space-y-2">
            {todayReservations.length === 0 && <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">لا توجد حجوزات اليوم</p>}
            {todayReservations.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                <div>
                  <p className="text-xs font-bold text-slate-800">{r.customerName}</p>
                  <p className="text-[10px] text-slate-500">{r.time} · {r.guests} ضيوف</p>
                </div>
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{RESERVATION_STATUS_LABELS[r.status]}</span>
              </div>
            ))}
            <button onClick={() => onNavigate('eod_board')} className="w-full text-[10px] font-bold text-indigo-600 hover:text-indigo-800 text-center">لوحة الإقفال اليومي</button>
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="الانحرافات التكلفوية" icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} extra={<span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">{unack.length} نشطة</span>} />
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between items-center bg-amber-50 border border-amber-100 rounded-xl p-2.5">
              <span className="text-amber-800 font-bold">أطباق خارج الهامش</span>
              <span className="font-mono font-extrabold text-amber-800">{alerts.length}</span>
            </div>
            <div className="flex justify-between items-center bg-rose-50 border border-rose-100 rounded-xl p-2.5">
              <span className="text-rose-800 font-bold">هوالك الشهر</span>
              <span className="font-mono font-extrabold text-rose-700">{fmt(totalWastage)}</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
              <p className="text-slate-600 font-bold mb-1.5">أخطر انحراف:</p>
              {unack[0] ? (
                <p className="text-[11px] text-slate-800 font-bold">{unack[0].recipeNameAr} <span className="text-rose-600 font-mono">+{unack[0].excessCostPercent}%</span></p>
              ) : <p className="text-emerald-600 font-bold">لا توجد انحرافات</p>}
            </div>
            <button onClick={() => onNavigate('cost_reports')} className="w-full text-[10px] font-bold text-indigo-600 hover:text-indigo-800 text-center">تقارير التكلفة</button>
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="قاعدة العملاء" icon={<UsersIcon className="w-5 h-5 text-cyan-600" />} extra={<span className="text-[10px] font-bold bg-cyan-50 text-cyan-800 px-2 py-0.5 rounded-full border border-cyan-200">{customers.length}</span>} />
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between items-center bg-cyan-50 border border-cyan-100 rounded-xl p-2.5">
              <span className="text-cyan-800 font-bold">عملاء VIP</span>
              <span className="font-mono font-extrabold text-cyan-800">{vips.length}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-xl p-2.5">
              <span className="text-slate-600 font-bold">إجمالي الإنفاق</span>
              <span className="font-mono font-extrabold text-slate-700">{fmt(customerTotalSpend)}</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
              <p className="text-slate-600 font-bold mb-1.5">قيمة الهالك ({wastageLogs.length} وقائع)</p>
              <p className="font-mono font-extrabold text-slate-800 text-sm">{fmt(totalWastage)} ر.س</p>
            </div>
            <button onClick={() => onNavigate('analytics')} className="w-full text-[10px] font-bold text-indigo-600 hover:text-indigo-800 text-center">التحليلات والرسوم البيانية</button>
          </div>
        </Card>
      </div>

      {/* Footer note */}
      <p className="text-center text-[10px] text-slate-400 font-bold">
        يتطلب عرض كل المؤشرات الحصول على صلاحية عرض التقارير · بيانات القائمة المالية تُجمع من كل الفروع المتاحة للمستخدم
      </p>
    </div>
  );
};
