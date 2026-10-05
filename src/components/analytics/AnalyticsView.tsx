import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { BarChart3, TrendingUp, Wallet, Trophy, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Btn, Card, PageHeader, SectionHeader, StatCard } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { openPrintWindow } from '../../utils/print';
import { fmt, monthLabel } from '../../utils/helpers';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#8b5cf6', '#84cc16', '#0ea5e9', '#d946ef', '#64748b'];

const chartTooltipStyle = {
  direction: 'rtl' as const,
  fontSize: 11,
  fontFamily: 'inherit',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
};

const moneyFmt = (v: unknown) => fmt(Number(v));

export const AnalyticsView: React.FC = () => {
  const { posOrders, batchSalesRecords, operatingExpenses, plSummaries } = useApp();

  const monthly = useMemo(() => {
    const map: Record<string, { revenue: number; cogs: number; opex: number }> = {};
    const add = (key: string, patch: Partial<{ revenue: number; cogs: number; opex: number }>) => {
      if (!map[key]) map[key] = { revenue: 0, cogs: 0, opex: 0 };
      map[key].revenue += patch.revenue || 0;
      map[key].cogs += patch.cogs || 0;
      map[key].opex += patch.opex || 0;
    };
    posOrders.forEach((o) => add(o.date.slice(0, 7), { revenue: o.subtotal, cogs: o.totalCost }));
    batchSalesRecords.forEach((b) => add(b.date.slice(0, 7), { revenue: b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15)), cogs: b.totalFoodCost }));
    operatingExpenses.forEach((e) => add(e.createdAt.slice(0, 7), { opex: e.amount }));
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ month: monthLabel(key), revenue: Math.round(v.revenue), cogs: Math.round(v.cogs), opex: Math.round(v.opex), profit: Math.round(v.revenue - v.cogs - v.opex) }));
  }, [posOrders, batchSalesRecords, operatingExpenses]);

  const branchData = useMemo(() => plSummaries.map((p) => ({
    name: p.branchName, sales: Math.round(p.totalSales), profit: Math.round(p.netProfit),
    foodCostPercent: p.foodCostPercent, netProfitPercent: p.netProfitPercent,
  })), [plSummaries]);

  const printBranchDistribution = () => {
    openPrintWindow({
      title: 'توزيع المبيعات حسب الفرع',
      subtitle: 'المبيعات والأرباح والهوامش لكل فرع',
      meta: [
        ['عدد الفروع', `${branchData.length}`],
        ['إجمالي المبيعات', fmt(branchData.reduce((s, b) => s + b.sales, 0))],
      ],
      tables: [{
        title: 'المبيعات حسب الفرع',
        header: ['الفرع', 'المبيعات', 'صافي الربح', 'FC %', 'الهامش %'],
        rows: branchData.map((b) => [b.name, fmt(b.sales), fmt(b.profit), fmt(b.foodCostPercent), fmt(b.netProfitPercent)]),
      }],
      charts: [],
      footer: 'تقرير توزيع المبيعات حسب الفرع — RestoCost ERP Pro',
    });
  };

  const topItems = useMemo(() => {
    const map: Record<string, number> = {};
    posOrders.forEach((o) => o.items.forEach((i) => { map[i.recipeName] = (map[i.recipeName] || 0) + i.lineTotal; }));
    batchSalesRecords.forEach((b) => b.items.forEach((i) => { map[i.recipeNameAr] = (map[i.recipeNameAr] || 0) + i.lineTotalRevenue; }));
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, revenue: Math.round(value) }));
  }, [posOrders, batchSalesRecords]);

  const expenseBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    operatingExpenses.forEach((e) => {
      const label = {
        rent: 'إيجارات', utilities: 'كهرباء وماء', internet_telecom: 'إنترنت واتصالات', maintenance_repairs: 'صيانة',
        cleaning_supplies: 'تنظيف', marketing_advertising: 'تسويق', delivery_platform_commissions: 'عمولات منصات',
        licensing_permits: 'تراخيص', software_subscriptions: 'اشتراكات', insurance: 'تأمين', misc: 'أخرى',
      }[e.category] || e.category;
      map[label] = (map[label] || 0) + e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [operatingExpenses]);

  const totalRevenue = plSummaries.reduce((s, p) => s + p.totalSales, 0);
  const totalProfit = plSummaries.reduce((s, p) => s + p.netProfit, 0);
  const avgFoodCost = plSummaries.length ? plSummaries.reduce((s, p) => s + p.foodCostPercent, 0) / plSummaries.length : 0;
  const liveRevenue = posOrders.reduce((s, o) => s + o.subtotal, 0) + batchSalesRecords.reduce((s, b) => s + b.totalRevenue, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="التحليلات والرسوم البيانية" subtitle="مؤشرات الأداء: اتجاهات المبيعات والتكلفة، مقارنة الفروع، أعلى الأصناف ربحية وتوزيع المصروفات" icon={<BarChart3 className="w-6 h-6 text-emerald-600" />}
        actions={
          <ViewToolbar
            filename="التحليلات"
            sheets={[
              { name: 'الاتجاه الشهري', header: ['الشهر', 'الإيراد', 'تكلفة الطعام', 'المصروفات', 'الربح'], rows: monthly.map((m) => [m.month, m.revenue, m.cogs, m.opex, m.profit]) },
              { name: 'مبيعات الفروع', header: ['الفرع', 'المبيعات', 'الربح', 'Food Cost %', 'هامش %'], rows: branchData.map((b) => [b.name, fmt(b.sales), fmt(b.profit), fmt(b.foodCostPercent), fmt(b.netProfitPercent)]) },
              { name: 'أعلى الأصناف إيراداً', header: ['الصنف', 'الإيراد'], rows: topItems.map((t) => [t.name, t.revenue]) },
              { name: 'توزيع المصروفات', header: ['التصنيف', 'المبلغ'], rows: expenseBreakdown.map((e) => [e.name, e.value]) },
            ]}
          />
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="إجمالي مبيعات الفروع" value={fmt(totalRevenue)} tone="indigo" icon={<TrendingUp className="w-4 h-4 text-brand-400" />} sub={`${branchData.length} فروع`} />
        <StatCard label="صافي الربح الكلي" value={fmt(totalProfit)} tone="emerald" icon={<Wallet className="w-4 h-4 text-emerald-400" />} sub={`هامش ${plSummaries.length ? Math.round(totalProfit / totalRevenue * 100) : 0}%`} />
        <StatCard label="متوسط تكلفة الطعام" value={`${fmt(avgFoodCost, 1)}%`} tone="amber" icon={<BarChart3 className="w-4 h-4 text-amber-400" />} sub="المستهدف ≤ 33%" />
        <StatCard label="إيراد عمليات النقاط" value={fmt(liveRevenue)} tone="rose" icon={<Trophy className="w-4 h-4 text-rose-400" />} sub="POS + مبيعات مجمعة" />
      </div>

      {/* Monthly trend */}
      <Card className="p-5">
        <SectionHeader title="الاتجاه الشهري" subtitle="الإيراد مقابل تكلفة الطعام والمصروفات والربح حسب الشهر" icon={<TrendingUp className="w-5 h-5 text-brand-600" />} />
        <div dir="ltr" className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={moneyFmt} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v, name) => [moneyFmt(v), name === 'revenue' ? 'الإيراد' : name === 'cogs' ? 'تكلفة الطعام' : name === 'opex' ? 'المصروفات' : 'الربح']} />
              <Legend formatter={(v: string) => ({ revenue: 'الإيراد', cogs: 'تكلفة الطعام', opex: 'المصروفات', profit: 'الربح' }[v] || v)} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#revGrad)" />
              <Area type="monotone" dataKey="cogs" stroke="#f59e0b" strokeWidth={2} fill="none" />
              <Area type="monotone" dataKey="opex" stroke="#f43f5e" strokeWidth={2} fill="none" />
              <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} fill="url(#profitGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top items */}
        <Card className="p-5">
          <SectionHeader title="أعلى الأصناف إيراداً" subtitle="أعلى 10 أصناف من حيث الإيراد" icon={<Trophy className="w-5 h-5 text-amber-600" />} />
          <div dir="ltr" className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topItems} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={moneyFmt} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [moneyFmt(v), 'الإيراد']} />
                <Bar dataKey="revenue" fill="#6366f1" radius={[0, 8, 8, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Sales by branch */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeader title="توزيع المبيعات حسب الفرع" subtitle="المبيعات الإجمالية لكل فرع" icon={<BarChart3 className="w-5 h-5 text-emerald-600" />} />
            <Btn tone="ghost" onClick={printBranchDistribution}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div dir="ltr" className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={branchData} dataKey="sales" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={50} paddingAngle={3} label={({ value }) => fmt(Number(value))}>
                  {branchData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [moneyFmt(v), 'المبيعات']} />
                <Legend formatter={(v: string) => v} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Branch margins comparison */}
        <Card className="p-5">
          <SectionHeader title="مقارنة هامش الربح بين الفروع" subtitle="تكلفة الطعام % مقابل هامش صافي الربح %" icon={<Wallet className="w-5 h-5 text-rose-600" />} />
          <div dir="ltr" className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Number(v)}%`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v, name) => [`${Number(v)}%`, name === 'foodCostPercent' ? 'تكلفة الطعام' : 'هامش صافي']} />
                <Legend formatter={(v: string) => ({ foodCostPercent: 'تكلفة الطعام %', netProfitPercent: 'هامش صافي %' }[v] || v)} />
                <Bar dataKey="foodCostPercent" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={28} />
                <Bar dataKey="netProfitPercent" fill="#10b981" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Expense breakdown */}
        <Card className="p-5">
          <SectionHeader title="توزيع المصروفات التشغيلية" subtitle="حسب التصنيف — من شاشة المصاريف" icon={<Wallet className="w-5 h-5 text-brand-600" />} />
          <div dir="ltr" className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={45} paddingAngle={3}>
                  {expenseBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [moneyFmt(v), 'المبلغ']} />
                <Legend formatter={(v: string) => v} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};