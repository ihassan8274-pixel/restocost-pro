import React, { useMemo, useEffect, useRef, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
  BarChart, Bar, Legend, Line,
} from 'recharts';
import { TrendingUp, TrendingDown, Wallet, Users as UsersIcon, AlertTriangle, ArrowLeft, Sparkles, History, Rocket } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StatCard, Card, SectionHeader, PageHeader, Sparkline, Btn } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { MorningBriefingCard } from './MorningBriefingCard';
import { InsightsStrip } from './InsightsStrip';
import { fmt, forecastSeries, monthLabel, EXPENSE_CATEGORY_LABELS } from '../../utils/helpers';
import type { RecentDoc } from '../../context/AppContext';
import { SetupWizard } from '../setup/SetupWizard';

const PIE_COLORS = ['#d97706', '#f59e0b', '#0d9488', '#e11d48', '#10b981', '#8b5cf6', '#0ea5e9', '#64748b', '#ca8a04', '#84cc16', '#94a3b8'];

const RECENT_TYPE_LABELS: Record<string, string> = {
  order: 'أمر شراء', po: 'أمر شراء', recipe: 'وصفة', pos: 'مبيعة',
  inventory_count: 'جرد', grn: 'إشعار استلام', return: 'مرتجع', invoice: 'فاتورة', task: 'مهمة',
};

export const DashboardView: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const { plSummaries, operatingExpenses, wastageLogs, can, getFoodCostAlerts, getBranchName, recentDocs, clearRecentDocs, suppliers, rawMaterials, recipes } = useApp();
  const [showSetup, setShowSetup] = useState(false);
  const autoOffered = useRef(false);
  const setupNeeded = suppliers.length === 0 && rawMaterials.length === 0;
  const setupIncomplete = suppliers.length === 0 || rawMaterials.length === 0 || recipes.length === 0;
  useEffect(() => {
    if (setupNeeded && !autoOffered.current) { autoOffered.current = true; setShowSetup(true); }
  }, [setupNeeded]);

  const relative = (at: number) => {
    const mins = Math.max(1, Math.round((Date.now() - at) / 60000));
    if (mins < 60) return `منذ ${mins} دقيقة`;
    if (mins < 1440) return `منذ ${Math.round(mins / 60)} ساعة`;
    return `منذ ${Math.round(mins / 1440)} يوم`;
  };

  const recentByTab = (d: RecentDoc) => d.tab;

  const groupSales = plSummaries.reduce((s, p) => s + p.totalSales, 0);
  const groupFood = plSummaries.reduce((s, p) => s + p.foodCost, 0);
  const groupLabor = plSummaries.reduce((s, p) => s + p.laborCost, 0);
  const groupOpex = plSummaries.reduce((s, p) => s + p.operatingExpenses, 0);
  const groupProfit = plSummaries.reduce((s, p) => s + p.netProfit, 0);

  const foodPct = groupSales ? (groupFood / groupSales) * 100 : 0;
  const laborPct = groupSales ? (groupLabor / groupSales) * 100 : 0;
  const opexPct = groupSales ? (groupOpex / groupSales) * 100 : 0;
  const profitPct = groupSales ? (groupProfit / groupSales) * 100 : 0;

  const alerts = getFoodCostAlerts();
  const unack = alerts.filter((a) => !a.isAcknowledged);

  // Monthly revenue trend (demo series derived from P&L for charting + forecasting)
  const monthlyTrend = useMemo(() => {
    const base = groupSales;
    const series = [base * 0.82, base * 0.88, base * 0.93, base * 0.98, base * 1.0];
    return series.map((v, i) => ({ name: monthLabel(`2026-0${i + 4}`), value: Math.round(v), فعلي: Math.round(v) }));
  }, [groupSales]);

  const forecast = useMemo(() => forecastSeries(monthlyTrend.map((m) => m.value), 3), [monthlyTrend]);
  const chartData = [
    ...monthlyTrend.map((m) => ({ name: m.name, المبيعات: m.value })),
    ...forecast.map((v, i) => ({ name: `توقع ${monthLabel(`2026-0${9 + i}`)}`, المبيعات: v, تنبؤ: v })),
  ];

  // Expense category breakdown
  const expenseByCat = useMemo(() => {
    const map = new Map<string, number>();
    operatingExpenses.forEach((e) => map.set(e.category, (map.get(e.category) || 0) + e.amount));
    return Array.from(map.entries()).map(([cat, value]) => ({ name: EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat, value }));
  }, [operatingExpenses]);

  const totalOpexActual = operatingExpenses.reduce((s, e) => s + e.amount, 0);
  const totalWastage = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);

  const branchPerformance = plSummaries.map((p) => ({
    name: getBranchName(p.branchId),
    المبيعات: p.totalSales, 'صافي الربح': p.netProfit,
  }));

  return (
    <div className="space-y-6">
      {setupIncomplete && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white flex items-center justify-center"><Rocket className="w-5 h-5" /></span>
              <div>
                <p className="text-sm font-black text-slate-900">أكمل إعداد نظام التكلفة</p>
                <p className="text-[11px] font-bold text-slate-500">{setupNeeded ? 'لم تتم إضافة مخازن ولا موردين بعد — معالج سريع في 4 خطوات.' : 'بعض الخطوات الأساسية لم تكتمل بعد (مخازن/موردون/أصناف/وصفات).'}</p>
              </div>
            </div>
            <button onClick={() => setShowSetup(true)} className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-sm">
              <Rocket className="w-4 h-4" /> تشغيل الإعداد الأولي
            </button>
          </div>
        </Card>
      )}
      <MorningBriefingCard />
      <InsightsStrip onNavigate={onNavigate} />
      {recentDocs.length > 0 && (
        <Card className="p-4">
          <SectionHeader
            title="واصل من حيث توقفت"
            subtitle="آخر المستندات التي عملت عليها — اضغط للعودة فوراً إلى شاشتها"
            icon={<History className="w-4 h-4 text-brand-500" />}
            extra={<Btn tone="ghost" onClick={clearRecentDocs} className="!px-2.5 !py-1 !text-[10px]">مسح السجل</Btn>}
          />
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {recentDocs.map((d) => (
              <button
                key={`${d.type}-${d.id}`}
                onClick={() => onNavigate(recentByTab(d))}
                className="text-right rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-brand-50 hover:border-brand-200 hover:shadow-sm transition-all px-3 py-2.5"
              >
                <p className="text-[11px] font-black text-brand-700">{RECENT_TYPE_LABELS[d.type] || d.type}</p>
                <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{d.title}</p>
                <p className="text-[9px] font-bold text-slate-400 mt-1">{relative(d.at)}</p>
              </button>
            ))}
          </div>
        </Card>
      )}
      <PageHeader
        title="لوحة التحكم والتحليلات التنفيذية"
        subtitle="مؤشرات الأداء الرئيسية، التوجهات المالية، التنبؤ بالتشغيل، ومتابعة الانحرافات"
        icon={<TrendingUp className="w-6 h-6 text-brand-600" />}
        actions={
          <ViewToolbar
            filename="لوحة التحكم"
            sheets={[
              {
                name: 'مؤشرات الأداء',
                header: ['المؤشر', 'القيمة', 'النسبة'],
                rows: [
                  ['إجمالي المبيعات', groupSales, ''],
                  ['تكلفة الأغذية', groupFood, `${foodPct.toFixed(2)}%`],
                  ['تكلفة العمالة', groupLabor, `${laborPct.toFixed(2)}%`],
                  ['المصاريف التشغيلية', groupOpex, `${opexPct.toFixed(2)}%`],
                  ['صافي الربح', groupProfit, `${profitPct.toFixed(2)}% هامش`],
                  ['الهوالك المسجلة', totalWastage, `${wastageLogs.length} وقائع`],
                ],
              },
              {
                name: 'أداء الفروع',
                header: ['الفرع', 'المبيعات', 'صافي الربح'],
                rows: branchPerformance.map((b) => [b.name, b['المبيعات'], b['صافي الربح']]),
              },
            ]}
          />
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="إجمالي المبيعات" value={fmt(groupSales)} sub="ر.س / أغسطس 2026" icon={<Sparkline data={monthlyTrend.map((m) => m.value)} color="#d97706" />} />
        <StatCard label="تكلفة الأغذية" value={`${foodPct.toFixed(2)}%`} sub={`${fmt(groupFood)} ر.س`} tone="indigo" icon={<Sparkline data={monthlyTrend.map((m) => m.value * 0.35)} color="#d97706" />} />
        <StatCard label="تكلفة العمالة" value={`${laborPct.toFixed(2)}%`} sub={`${fmt(groupLabor)} ر.س`} tone="amber" icon={<Sparkline data={monthlyTrend.map((m) => m.value * 0.25)} color="#0d9488" />} />
        <StatCard label="المصاريف التشغيلية" value={`${opexPct.toFixed(2)}%`} sub={`${fmt(groupOpex)} ر.س`} tone="rose" icon={<Sparkline data={monthlyTrend.map((m) => m.value * 0.18)} color="#e11d48" />} />
        <StatCard label="صافي الربح" value={fmt(groupProfit)} sub={`${profitPct.toFixed(2)}% هامش`} tone="emerald" icon={<Sparkline data={monthlyTrend.map((m) => m.value * 0.12)} color="#10b981" />} />
        <StatCard label="الهوالك المسجلة" value={fmt(totalWastage)} sub={`${wastageLogs.length} وقائع`} tone="rose" icon={<Sparkline data={monthlyTrend.map((m) => m.value * 0.02)} color="#e11d48" />} />
      </div>

      {/* Revenue trend + Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <SectionHeader
            title="توجه المبيعات والتنبؤ الشهري"
            subtitle="أداء المبيعات الشهرية مع تنبؤ بالانحدار الخطي للثلاثة أشهر القادمة"
            icon={<TrendingUp className="w-5 h-5 text-brand-600" />}
            extra={<span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg">نموذج تنبؤ مدمج</span>}
          />
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d97706" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#d97706" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v: unknown) => `${fmt(Number(v))} ر.س`} />
                <Area type="monotone" dataKey="المبيعات" stroke="#d97706" strokeWidth={2.5} fill="url(#rev)" />
                <Line type="monotone" dataKey="تنبؤ" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {forecast.map((v, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-2">
                <p className="text-[10px] text-amber-800 font-bold">التوقع {i + 1}</p>
                <p className="font-mono font-extrabold text-amber-900 text-sm">{fmt(v)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="توزيع المصاريف التشغيلية" icon={<Wallet className="w-5 h-5 text-brand-600" />} />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseByCat} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {expenseByCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v: unknown) => `${fmt(Number(v))} ر.س`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-xs font-bold text-slate-700 mt-1">إجمالي فعلي: {fmt(totalOpexActual)} ر.س</p>
        </Card>
      </div>

      {/* Branch performance + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <SectionHeader title="أداء الفروع" subtitle="المبيعات مقابل صافي الربح لكل فرع" icon={<UsersIcon className="w-5 h-5 text-brand-600" />} />
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v: unknown) => `${fmt(Number(v))} ر.س`} />
                <Legend />
                <Bar dataKey="المبيعات" fill="#d97706" radius={[4, 4, 0, 0]} />
                <Bar dataKey="صافي الربح" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="تنبيهات التكلفة" icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
            extra={<span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-2 py-1 rounded-full border border-rose-200">{unack.length} نشطة</span>} />
          <div className="mt-3 space-y-2">
            {unack.slice(0, 5).map((a) => (
              <div key={a.recipeId} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">{a.recipeNameAr}</p>
                  <p className="text-[10px] text-slate-500">Food Cost {a.actualFoodCostPercent}% (الحد {a.targetFoodCostPercent}%)</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                  +{a.excessCostPercent}%
                </span>
              </div>
            ))}
            {unack.length === 0 && <p className="text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 rounded-xl p-3">✓ لا توجد انحرافات تكلفة نشطة — الأداء ضمن الحدود</p>}
            <button onClick={() => onNavigate('cost_reports')} className="w-full text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center justify-center gap-1 mt-1">
              عرض تقارير التكلفة <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>
      </div>

      {/* Quick links */}
      {can('use_ai') && (
        <button onClick={() => onNavigate('ai_advisor')} className="w-full bg-gradient-to-l from-brand-600 to-violet-600 text-white rounded-2xl p-4 shadow-lg flex items-center justify-between hover:opacity-95 transition-opacity">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6" />
            <div className="text-right">
              <p className="font-extrabold text-sm">المستشار الذكي للتكاليف</p>
              <p className="text-[11px] text-brand-100">تحليل ذكي للانحرافات وتوصيات لخفض التكاليف ورفع الهامش</p>
            </div>
          </div>
          <TrendingDown className="w-5 h-5 opacity-80" />
        </button>
      )}
      <SetupWizard open={showSetup} onClose={() => setShowSetup(false)} />
    </div>
  );
};