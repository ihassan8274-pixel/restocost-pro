import React from 'react';
import { Sparkles, TrendingUp, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const InsightsStrip: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { plSummaries, operatingExpenses, wastageLogs, getFoodCostAlerts, getBranchName } = useApp();

  const groupSales = plSummaries.reduce((s, p) => s + p.totalSales, 0);
  const groupFood = plSummaries.reduce((s, p) => s + p.foodCost, 0);
  const groupProfit = plSummaries.reduce((s, p) => s + p.netProfit, 0);
  const foodPct = groupSales ? (groupFood / groupSales) * 100 : 0;
  const profitPct = groupSales ? (groupProfit / groupSales) * 100 : 0;
  const totalWastage = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);
  const unack = getFoodCostAlerts().filter((a) => !a.isAcknowledged);

  const best = plSummaries.length
    ? plSummaries.reduce((a, b) => (b.totalSales > a.totalSales ? b : a))
    : null;

  const insights: { text: string; tone: 'good' | 'warn' | 'info'; nav: string }[] = [];

  if (groupSales > 0) {
    if (foodPct <= 35) insights.push({ text: `تكلفة الأغذية ${foodPct.toFixed(2)}% ضمن الهدف (35%) — أداء ممتاز`, tone: 'good', nav: 'cost_reports' });
    else insights.push({ text: `Food Cost ${foodPct.toFixed(2)}% يتجاوز الحد (35%) — راجع أسعار الأطباق أو الموردين`, tone: 'warn', nav: 'cost_reports' });
  }
  if (profitPct >= 25) insights.push({ text: `هامش الربح ${profitPct.toFixed(2)}% فوق المستهدف — استمر في النهج الحالي`, tone: 'good', nav: 'dashboard' });
  else if (profitPct > 0) insights.push({ text: `هامش الربح ${profitPct.toFixed(2)}% دون المستهدف (25%) — خفض التكاليف أو ارفع الأسعار`, tone: 'warn', nav: 'cost_analysis' });
  if (best && plSummaries.length > 1) insights.push({ text: `أعلى مبيعات: ${getBranchName(best.branchId)} — احتذِ بممارساته`, tone: 'info', nav: 'dashboard' });
  if (totalWastage > 0) {
    const pct = groupFood ? (totalWastage / groupFood) * 100 : 0;
    if (pct > 5) insights.push({ text: `الهالك ${pct.toFixed(2)}% من تكلفة الطعام يتجاوز الحد (5%)`, tone: 'warn', nav: 'wastage' });
  }
  if (unack.length > 0) insights.push({ text: `${unack.length} طبقاً فوق هامش التكلفة المستهدف — راجعها الآن`, tone: 'warn', nav: 'cost_analysis' });
  const monthlyOpex = operatingExpenses.reduce((s, e) => s + e.amount, 0);
  if (monthlyOpex > 0 && groupSales > 0) {
    const opexPct = (monthlyOpex / groupSales) * 100;
    if (opexPct > 20) insights.push({ text: `المصاريف التشغيلية ${opexPct.toFixed(2)}% مرتفعة نسبياً من المبيعات`, tone: 'warn', nav: 'cost_centers' });
  }
  if (groupFood * 4 > groupSales && groupSales > 0) insights.push({ text: `نسبة التكلفة إلى المبيعات غير متوازنة — راجع هيكل التسعير`, tone: 'warn', nav: 'cost_reports' });
  if (groupProfit < 0) insights.push({ text: `المجموعة بفترة خسارة — أوقف التسريبات واعتمد على تقرير كشف الانحراف`, tone: 'warn', nav: 'dashboard' });
  if (!insights.length) insights.push({ text: 'لا توجد بيانات كافية بعد لعرض رؤى — أضف مبيعات ومصروفات لتفعيل التحليل الذكي', tone: 'info', nav: 'dashboard' });

  const top3 = insights.slice(0, 3);

  return (
    <div className="bg-gradient-to-l from-primary-700 via-amber-600 to-primary-700 rounded-2xl p-3 text-white shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold shrink-0">
          <Sparkles className="w-4 h-4" /> رؤى النظام:
        </span>
        {top3.map((ins, i) => (
          <button
            key={i}
            onClick={() => onNavigate?.(ins.nav)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
              ins.tone === 'good' ? 'bg-emerald-500/25 border-emerald-300/50 hover:bg-emerald-500/40'
              : ins.tone === 'warn' ? 'bg-rose-500/25 border-rose-300/50 hover:bg-rose-500/40'
              : 'bg-white/10 border-white/30 hover:bg-white/20'
            }`}
          >
            {ins.tone === 'good' ? <TrendingUp className="w-3.5 h-3.5" />
              : ins.tone === 'warn' ? <AlertTriangle className="w-3.5 h-3.5" />
              : <ArrowUpRight className="w-3.5 h-3.5" />}
            {ins.text}
          </button>
        ))}
      </div>
    </div>
  );
};