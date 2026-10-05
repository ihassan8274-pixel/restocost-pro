import React, { useMemo } from 'react';
import { Sparkles, AlertTriangle, Target, TrendingUp, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader } from '../ui';
import { fmt, fmtMoney } from '../../utils/helpers';

interface Advice {
  title: string;
  detail: string;
  impact: 'high' | 'medium' | 'low';
  module: string;
}

export const AICostAdvisorView: React.FC = () => {
const {
  batchSalesRecords, recipes, rawMaterials, inventory, wastageLogs, operatingExpenses,
  globalTargetMarginPercent, calculateRecipeCosts, getRawMaterialName, can,
} = useApp();

  const advice = useMemo<Advice[]>(() => {
    const list: Advice[] = [];

    const totalRevenue = batchSalesRecords.reduce((s, b) => s + (b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15))), 0);
    const totalFoodCost = batchSalesRecords.reduce((s, b) => s + b.totalFoodCost, 0);
    const fcPct = totalRevenue ? (totalFoodCost / totalRevenue) * 100 : 0;

    if (fcPct > 0) {
      const targetFc = 100 - globalTargetMarginPercent;
      if (fcPct > targetFc) {
        list.push({
          title: `ارتفاع Food Cost إلى ${fcPct.toFixed(2)}% (المستهدف ${targetFc}%)`,
          detail: `الفجوة الحالية: ${(fcPct - targetFc).toFixed(2)} نقطة مئوية — أعد التفاوض مع الموردين أو راجع مقادير الوصفات، أو اضبط أسعار المنيو للأصناف ذات الهامش المنخفض.`,
          impact: 'high', module: 'food_cost',
        });
      } else {
        list.push({
          title: `Food Cost ضمن المستهدف (${fcPct.toFixed(2)}%)`,
          detail: 'الأداء جيد. حافظ على مراقبة الأسعار أسبوعياً وتابع هوامش الأصناف الأكثر مبيعاً.',
          impact: 'low', module: 'food_cost',
        });
      }
    }

    const highFC = recipes
      .filter((r) => !r.isCentralKitchenPrep)
      .map((r) => {
        const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
        const price = r.actualMenuPrice || costs.suggestedPrice;
        const pct = price ? (costs.foodCost / price) * 100 : 0;
        return { r, pct, target: r.targetMarginPercent ?? globalTargetMarginPercent };
      })
      .filter((x) => x.pct > (100 - x.target))
      .sort((a, b) => b.pct - a.pct);

    if (highFC.length > 0) {
      list.push({
        title: `${highFC.length} أطباق تتجاوز الهامش المستهدف`,
        detail: `الأعلى: ${highFC[0].r.nameAr} بـ ${highFC[0].pct.toFixed(2)}% Food Cost. راجع مكوناتها أو ارفع سعرها.`,
        impact: 'high', module: 'recipes',
      });
    }

    const lowStock = inventory.filter((i) => {
      const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
      return mat && i.quantity <= mat.minStockLevel;
    });
    if (lowStock.length > 0) {
      const materials = lowStock.slice(0, 3).map((i) => getRawMaterialName(i.rawMaterialId)).join('، ');
      list.push({
        title: `${lowStock.length} أصناف تحت الحد الأدنى للمخزون`,
        detail: `مثل: ${materials}. أنشئ أوامر شراء قبل نفادها لتجنب توقف العمليات أو الشراء الطارئ بأسعار أعلى.`,
        impact: 'medium', module: 'inventory',
      });
    }

    const totalWastage = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);
    if (totalWastage > 0) {
      const wastagePct = totalRevenue ? (totalWastage / totalRevenue) * 100 : 0;
      list.push({
        title: `هوالك بقيمة ${fmtMoney(totalWastage)} (${wastagePct.toFixed(2)}% من الإيراد)`,
        detail: wastagePct > 2
          ? 'نسبة الهوالك مرتفعة. طبّق قاعدة "الأقدم يُستخدم أولاً" (FIFO) وراجع طرق التخزين ومقادير التحضير.'
          : 'الهوالك ضمن الحدود المقبولة. استمر بتتبعها أسبوعياً.',
        impact: wastagePct > 2 ? 'high' : 'low', module: 'wastage',
      });
    }

    const overdueExpenses = operatingExpenses.filter((e) => e.paymentStatus === 'overdue');
    if (overdueExpenses.length > 0) {
      list.push({
        title: `${overdueExpenses.length} مصروفات متأخرة`,
        detail: `إجمالي المتأخر: ${fmtMoney(overdueExpenses.reduce((s, e) => s + e.amount, 0))}. عالجها لتجنب غرامات التأخير وفقدان خصومات السداد المبكر.`,
        impact: 'medium', module: 'expenses',
      });
    }

    const paidExpenses = operatingExpenses.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
    const overheadPct = totalRevenue ? (paidExpenses / totalRevenue) * 100 : 0;
    if (overheadPct > 30) {
      list.push({
        title: `المصاريف التشغيلية ${overheadPct.toFixed(2)}% من الإيراد`,
        detail: 'أعلى من النسبة المعتادة (20-30%). قارن المصاريف بالموازنة وراجع عقود الإيجار وعمولات منصات التوصيل.',
        impact: 'medium', module: 'expenses',
      });
    }

    const avgOrderValue = batchSalesRecords.length
      ? batchSalesRecords.reduce((s, b) => s + b.totalRevenue, 0) / batchSalesRecords.length
      : 0;
    list.push({
      title: `متوسط قيمة إدخال المبيعات اليومية ${fmt(avgOrderValue, 0)} ر.س`,
      detail: 'أدخل المبيعات يومياً بدقة — البيانات الدقيقة أساس كل تحليلات التكلفة والقرارات.',
      impact: 'low', module: 'sales',
    });

    return list;
  }, [batchSalesRecords, recipes, rawMaterials, inventory, wastageLogs, operatingExpenses, globalTargetMarginPercent, calculateRecipeCosts, getRawMaterialName]);

  const impactOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...advice].sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);
  const impactColor = { high: 'bg-rose-100 text-rose-700 border-rose-200', medium: 'bg-amber-100 text-amber-700 border-amber-200', low: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  const impactIcon = { high: <AlertTriangle className="w-4 h-4" />, medium: <Clock className="w-4 h-4" />, low: <TrendingUp className="w-4 h-4" /> };

  return (
    <div className="space-y-6">
      <PageHeader title="المستشار الذكي للتكاليف" subtitle="تحليل تلقائي للبيانات مع توصيات قابلة للتنفيذ لخفض التكاليف ورفع الهامش" icon={<Sparkles className="w-6 h-6 text-brand-600" />} />

      <div className="flex items-start gap-3 bg-gradient-to-l from-brand-50 to-violet-50 border border-brand-100 rounded-2xl p-4">
        <Sparkles className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-extrabold text-brand-800">رؤية سريعة</p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">يستعرض هذا المستشار بياناتك الفعلية (مخزون، مبيعات، هوالك، مصاريف) وينتج توصيات مرتّبة حسب الأولوية. استخدمه بانتظام مع تقارير التكلفة لاتخاذ قرارات مبنية على الأرقام.</p>
        </div>
      </div>

      {!can('use_ai') && (
        <Card className="p-4 text-center text-xs font-bold text-slate-500">صلاحيتك الحالية لا تسمح باستخدام المستشار الذكي — تواصل مع مدير النظام.</Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((a, idx) => (
          <Card key={idx} className={`p-4 border ${impactColor[a.impact]}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-600"><Target className="w-3.5 h-3.5 text-brand-500" /> {a.module}</span>
              <span className={`flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${impactColor[a.impact]}`}>{impactIcon[a.impact]}{a.impact === 'high' ? 'أولوية عالية' : a.impact === 'medium' ? 'أولوية متوسطة' : 'متابعة'}</span>
            </div>
            <p className="font-extrabold text-slate-900 text-xs">{a.title}</p>
            <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">{a.detail}</p>
          </Card>
        ))}
        {sorted.length === 0 && <Card className="p-6 col-span-full text-center text-slate-500 text-xs font-bold">أدخل بيانات (مبيعات، مخزون، مصاريف) لتوليد التوصيات</Card>}
      </div>
    </div>
  );
};