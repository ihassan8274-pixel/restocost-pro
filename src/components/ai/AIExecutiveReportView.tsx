import React, { useMemo, useState } from 'react';
import { FileText, Sparkles, BrainCircuit, Printer, Loader2, Check, Copy, Send } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, TabBar, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV, monthLabel } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { AI_PROVIDERS, getAIModels, getActiveAIModelId } from '../../utils/ai';
import { AIModelPicker } from './AIModelPicker';
import { runAIAgent, publishToTelegram } from '../../utils/aiTools';
import type { AIContext } from '../../utils/aiTools';

type TabId = 'overview' | 'details' | 'recommendations';

export const AIExecutiveReportView: React.FC = () => {
  const {
    branches, visibleBranchIds, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs,
    grnNotes, invoices, posReturns, inventory, rawMaterials, recipes, getAverageUnitCost, getBranchName,
    calculateRecipeCosts, globalTargetMarginPercent, can, vatPercent,
  } = useApp();
  const [tab, setTab] = useState<TabId>('overview');
  const [modelPick, setModelPick] = useState<string>(() => getActiveAIModelId());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiNote, setAiNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [qaText, setQaText] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [qaNote, setQaNote] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [tgSending, setTgSending] = useState(false);
  const [tgNote, setTgNote] = useState('');

  const selectedCfg = getAIModels().find((m) => m.id === modelPick);
  const providerName = AI_PROVIDERS.find((p) => p.id === selectedCfg?.provider)?.label.split(' (')[0] || selectedCfg?.provider || 'غير محدد';

  const monthKey = new Date().toISOString().slice(0, 7);

  const revenue = posOrders.reduce((s, o) => s + o.subtotal, 0) + batchSalesRecords.reduce((s, b) => s + (b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15))), 0);
  const foodCost = posOrders.reduce((s, o) => s + o.totalCost, 0) + batchSalesRecords.reduce((s, b) => s + b.totalFoodCost, 0);
  const labor = shifts.reduce((s, sh) => s + sh.totalShiftCost, 0);
  const opex = operatingExpenses.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
  const wastage = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);
  const totalCost = foodCost + labor + opex + wastage;
  const profit = revenue - totalCost;
  const margin = revenue ? (profit / revenue) * 100 : 0;
  const fcPct = revenue ? (foodCost / revenue) * 100 : 0;
  const laborPct = revenue ? (labor / revenue) * 100 : 0;
  const opexPct = revenue ? (opex / revenue) * 100 : 0;
  const wastagePct = revenue ? (wastage / revenue) * 100 : 0;
  const orders = posOrders.length + batchSalesRecords.length;
  const avgOrder = orders ? revenue / orders : 0;

  const vatOutput = posOrders.reduce((s, o) => s + o.vatAmount, 0) + invoices.filter((i) => i.type === 'sales').reduce((s, i) => s + i.vatAmount, 0) - posReturns.reduce((s, r) => s + r.vatAmount, 0);
  const vatInput = invoices.filter((i) => i.type === 'purchase').reduce((s, i) => s + i.vatAmount, 0) + grnNotes.filter((g) => g.status === 'approved').reduce((s, g) => s + (g.vatAmount || 0), 0);
  const vatNet = vatOutput - vatInput;

  const stockValue = inventory.reduce((s, i) => s + i.quantity * getAverageUnitCost(i.rawMaterialId), 0);
  const lowStock = inventory.filter((i) => {
    const m = rawMaterials.find((x) => x.id === i.rawMaterialId);
    return m && i.quantity <= m.minStockLevel;
  }).length;

  const balanceByMaterial = inventory.reduce<Record<string, { name: string; unit: string; qty: number; value: number }>>((acc, i) => {
    const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
    if (!acc[i.rawMaterialId]) acc[i.rawMaterialId] = { name: mat?.nameAr || i.rawMaterialId, unit: mat?.unit || '', qty: 0, value: 0 };
    acc[i.rawMaterialId].qty += i.quantity;
    acc[i.rawMaterialId].value += i.quantity * getAverageUnitCost(i.rawMaterialId);
    return acc;
  }, {});
  const balanceRows = Object.values(balanceByMaterial).sort((a, b) => b.value - a.value);

  const topItems = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
    posOrders.forEach((o) => o.items.forEach((it) => {
      const cur = m.get(it.recipeId) || { name: it.recipeName, qty: 0, revenue: 0, cost: 0 };
      cur.qty += it.quantity; cur.revenue += it.lineTotal; cur.cost += it.quantity * it.unitCost;
      m.set(it.recipeId, cur);
    }));
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [posOrders]);

  const recipeCostRows = useMemo(() => recipes
    .filter((r) => !r.isCentralKitchenPrep)
    .map((r) => {
      const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
      const price = r.actualMenuPrice || c.suggestedPrice;
      const pct = price ? (c.foodCost / price) * 100 : 0;
      const target = r.targetMarginPercent ?? globalTargetMarginPercent;
      const targetFc = 100 - target;
      return { name: r.nameAr, price, pct, targetFc, gap: pct - targetFc };
    })
    .filter((r) => r.price > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5), [recipes, calculateRecipeCosts, globalTargetMarginPercent]);

  const branchMargin = useMemo(() => {
    const ids = Array.from(new Set([...visibleBranchIds, 'b-ck', ...batchSalesRecords.map((b) => b.branchId), ...posOrders.map((o) => o.branchId)]));
    return ids.map((id) => {
      const name = id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id);
      const rev = posOrders.filter((o) => o.branchId === id).reduce((s, o) => s + o.subtotal, 0) + batchSalesRecords.filter((b) => b.branchId === id).reduce((s, b) => s + (b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15))), 0);
      const fc = posOrders.filter((o) => o.branchId === id).reduce((s, o) => s + o.totalCost, 0) + batchSalesRecords.filter((b) => b.branchId === id).reduce((s, b) => s + b.totalFoodCost, 0);
      const lab = shifts.filter((s) => s.branchId === id).reduce((s, sh) => s + sh.totalShiftCost, 0);
      const op = operatingExpenses.filter((e) => e.branchId === id && e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
      const wa = wastageLogs.filter((w) => w.branchId === id).reduce((s, w) => s + w.totalCostImpact, 0);
      const p = rev - (fc + lab + op + wa);
      return { id, name, rev, p, m: rev ? (p / rev) * 100 : 0 };
    }).sort((a, b) => b.m - a.m);
  }, [visibleBranchIds, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs, branches, getBranchName]);

  const best = branchMargin[0];
  const worst = branchMargin[branchMargin.length - 1];

  const insights = useMemo<string[]>(() => {
    const out: string[] = [];
    if (fcPct > 0) out.push(fcPct > 100 - globalTargetMarginPercent ? `Food Cost ${fcPct.toFixed(2)}% أعلى من المستهدف (${(100 - globalTargetMarginPercent)}%) — تفاوض مع الموردين أو ارفع أسعار الأطباق المنخفضة الهامش.` : `Food Cost ${fcPct.toFixed(2)}% ضمن المستهدف.`);
    if (laborPct > 25) out.push(`تكلفة العمالة ${laborPct.toFixed(2)}% من الإيراد (أعلى من 25%) — راجع جداول الورديات.`);
    if (wastagePct > 2) out.push(`الهالك ${wastagePct.toFixed(2)}% من الإيراد — طبّق FIFO وراجع التخزين والمقادير.`);
    if (best) out.push(`أفضل مركز تكلفة: ${best.name} بهامش ${best.m.toFixed(2)}% — انقل إجراءاته للفروع الأخرى.`);
    if (worst && worst.m < 0) out.push(`مركز خاسر: ${worst.name} بهامش ${worst.m.toFixed(2)}% — تدخّل عاجل.`);
    if (lowStock > 0) out.push(`${lowStock} صنفاً تحت الحد الأدنى للمخزون — أنشئ أوامر شراء قبل النفاد.`);
    if (vatNet > 0) out.push(`صافي ضريبة القيمة المضافة المستحقة ${fmtMoney(vatNet)} (خرج ${fmtMoney(vatOutput)} − دخل ${fmtMoney(vatInput)}).`);
    if (topItems.length > 0) out.push(`الأعلى مبيعاً: ${topItems[0].name} (${fmtMoney(topItems[0].revenue)}).`);
    if (recipeCostRows.length > 0) out.push(`الأعلى تكلفة: ${recipeCostRows[0].name} بـ ${recipeCostRows[0].pct.toFixed(2)}% FC (المستهدف ${recipeCostRows[0].targetFc.toFixed(2)}%).`);
    if (margin >= 0) out.push(`النتيجة الصافية: ربح ${fmtMoney(profit)} بهامش ${margin.toFixed(2)}%.`);
    else out.push(`النتيجة الصافية: خسارة ${fmtMoney(-profit)} بهامش ${margin.toFixed(2)}% — خطة تصحيح عاجلة مطلوبة.`);
    return out;
  }, [fcPct, globalTargetMarginPercent, laborPct, wastagePct, best, worst, lowStock, vatNet, vatOutput, vatInput, topItems, recipeCostRows, margin, profit]);

  const buildPrompt = () => {
    const centerLines = branchMargin.map((b) => `${b.name}: إيراد ${b.rev.toFixed(2)}، هامش ${b.m.toFixed(2)}%`).join('\n');
    const top = topItems.map((t) => `${t.name}: إيراد ${t.revenue.toFixed(2)}، كميات ${t.qty}`).join('\n');
    const highCost = recipeCostRows.map((r) => `${r.name}: FC ${r.pct.toFixed(2)}% (مستهدف ${r.targetFc.toFixed(2)}%)`).join('\n');
    return [
      `الفترة: ${monthLabel(monthKey)} (شهر ${monthKey}).`,
      `الإيراد: ${revenue.toFixed(2)}، تكلفة الطعام: ${foodCost.toFixed(2)} (${fcPct.toFixed(2)}%)، العمالة: ${labor.toFixed(2)} (${laborPct.toFixed(2)}%)، التشغيلية المدفوعة: ${opex.toFixed(2)}، الهالك: ${wastage.toFixed(2)} (${wastagePct.toFixed(2)}%)، إجمالي التكاليف: ${totalCost.toFixed(2)}، الربح: ${profit.toFixed(2)}، الهامش: ${margin.toFixed(2)}%، عدد العمليات: ${orders}، متوسط الفاتورة: ${avgOrder.toFixed(2)}.`,
      `الضريبة: خرج ${vatOutput.toFixed(2)}، دخل ${vatInput.toFixed(2)}، صافي مستحق ${vatNet.toFixed(2)}.`,
      `المخزون: قيمة ${stockValue.toFixed(2)}، أصناف تحت الحد ${lowStock}.`,
      `مراكز التكلفة:\n${centerLines}`,
      `الأعلى مبيعاً:\n${top}`,
      `الأعلى تكلفة (Food Cost):\n${highCost}`,
      'اكتب تقريراً تنفيذياً بالعربية من 5-7 فقرات: نظرة عامة، تحليل التكاليف، مراكز التكلفة، المخزون والضريبة، ثم 5 توصيات مرقمة بأولوية واضحة. استخدم الأرقام حرفياً.',
    ].join('\n');
  };

  const generateAI = async () => {
    setAiLoading(true);
    setAiNote('');
    const ctx: AIContext = { branches, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs, inventory, recipes, rawMaterials, globalTargetMarginPercent, getAverageUnitCost, calculateRecipeCosts };
    const result = await runAIAgent('أنت مدير مالي تنفيذي لسلسلة مطاعم متعددة الفروع. ركّز على الوضوح والقابلية للتنفيذ بالعربية.', buildPrompt(), ctx, undefined, modelPick);
    setAiLoading(false);
    if (result) { setAiResult(result); setAiNote(`تم توليد التقرير عبر مزوّد الذكاء الاصطناعي (${providerName}).`); }
    else { setAiResult(''); setAiNote(selectedCfg ? 'تعذّر الوصول للمزوّد — اعتمد على التوصيات الآلية أدناه.' : 'فعّل مزوّد الذكاء الاصطناعي (Gemini أو Groq مجانيان، أو OpenAI/OpenRouter) في "إعدادات النظام" للحصول على التقرير التنفيذي الكامل، أو اعتمد على التوصيات الآلية.'); }
  };

  const copyResult = async () => {
    try { await navigator.clipboard.writeText(aiResult || insights.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const publishReport = async () => {
    setTgSending(true);
    setTgNote('');
    const header = `📊 التقرير التنفيذي الذكي — ${monthLabel(monthKey)}\n${'─'.repeat(30)}\n`;
    const body = aiResult || insights.join('\n') || 'لا توجد بيانات متاحة للتقرير.';
    const r = await publishToTelegram(header + body);
    setTgSending(false);
    setTgNote(r.ok ? 'نُشر التقرير إلى مجموعة تليجرام الرئيسية ✓' : (r.error || 'تعذر النشر — تأكد من تفعيل بوت تليجرام في إعدادات النظام'));
    if (r.ok) setTimeout(() => setTgNote(''), 4000);
  };

  const answerQuestion = (q: string) => {
    const s = q.toLowerCase();
    const lines: string[] = [];
    if (s.includes('ربح') || s.includes('ربحي') || s.includes('خسار')) {
      lines.push(`صافي الربح ${fmtMoney(profit)} بهامش ${margin.toFixed(2)}%.`);
      if (best) lines.push(`أفضل مركز: ${best.name} (${best.m.toFixed(2)}%).`);
      if (worst && worst.m < 0) lines.push(`مركز خاسر: ${worst.name} (${worst.m.toFixed(2)}%).`);
    }
    if (s.includes('هالك') || s.includes('فاقد')) lines.push(`الهالك ${fmtMoney(wastage)} (${wastagePct.toFixed(2)}% من الإيراد).`);
    if (s.includes('تكلفة') || s.includes('food')) lines.push(`Food Cost ${fcPct.toFixed(2)}% من الإيراد = ${fmtMoney(foodCost)}. أعلى الأطباق تكلفة: ${recipeCostRows.slice(0, 3).map((r) => `${r.name} (${r.pct.toFixed(2)}%)`).join('، ')}.`);
    if (s.includes('مخزون') || s.includes('جرد') || s.includes('صنف')) lines.push(`قيمة المخزون ${fmtMoney(stockValue)} و${lowStock} صنفاً تحت الحد الأدنى.`);
    if (s.includes('ضريبة') || s.includes('vat') || s.includes('ق.م')) lines.push(`صافي الضريبة المستحقة ${fmtMoney(vatNet)} (خرج ${fmtMoney(vatOutput)} − دخل ${fmtMoney(vatInput)}).`);
    if (s.includes('مبيع') || s.includes('الأعلى')) lines.push(`الأعلى مبيعاً: ${topItems.slice(0, 3).map((t) => `${t.name} (${fmtMoney(t.revenue)})`).join('، ')}.`);
    if (s.includes('عمالة') || s.includes('رواتب') || s.includes('وردي')) lines.push(`تكلفة العمالة ${fmtMoney(labor)} (${laborPct.toFixed(2)}% من الإيراد).`);
    if (s.includes('إيراد') || s.includes('مبيعات')) lines.push(`الإيراد ${fmtMoney(revenue)} عبر ${orders} عملية بمتوسط ${fmtMoney(avgOrder)}.`);
    if (lines.length === 0) lines.push(`الإيراد ${fmtMoney(revenue)} بهامش ${margin.toFixed(2)}%، Food Cost ${fcPct.toFixed(2)}%، الهالك ${fmtMoney(wastage)}، صافي الضريبة ${fmtMoney(vatNet)}. اسأل عن: الربح، الهالك، المخزون، الضريبة، الأعلى مبيعاً، العمالة، المراكز.`);
    return lines.join('\n');
  };

  const askQuestion = () => {
    if (!qaText.trim()) return;
    setQaAnswer(answerQuestion(qaText.trim()));
    setQaNote('إجابة آلية فورية من بيانات النظام.');
  };

  const expandQuestion = async () => {
    if (!qaText.trim()) return;
    setQaLoading(true);
    const ctx: AIContext = { branches, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs, inventory, recipes, rawMaterials, globalTargetMarginPercent, getAverageUnitCost, calculateRecipeCosts };
    const r = await runAIAgent('أنت مستشار مالي تنفيذي لسلسلة مطاعم. أجب بإيجاز بالعربية اعتماداً على الأرقام المقدمة حرفياً.', `السؤال: ${qaText}\nالبيانات المباشرة: ${answerQuestion(qaText.trim())}`, ctx, undefined, modelPick);
    setQaLoading(false);
    if (r) { setQaAnswer(r); setQaNote('إجابة موسعة بالذكاء الاصطناعي.'); }
    else setQaNote('تعذّر الوصول للمزوّد — الإجابة الآلية أعلاه.');
  };

  const printReport = () => {
    openPrintWindow({
      title: 'التقرير التنفيذي الذكي',
      subtitle: monthLabel(monthKey),
      meta: [
        ['الإيراد', `${fmtMoney(revenue)}`], ['تكلفة الطعام', `${fmtMoney(foodCost)} (${fcPct.toFixed(2)}%)`],
        ['العمالة', `${fmtMoney(labor)} (${laborPct.toFixed(2)}%)`], ['التشغيلية', `${fmtMoney(opex)} (${opexPct.toFixed(2)}%)`],
        ['الهالك', `${fmtMoney(wastage)} (${wastagePct.toFixed(2)}%)`], ['الربح', `${fmtMoney(profit)}`],
        ['الهامش', `${margin.toFixed(2)}%`], ['صافي الضريبة', `${fmtMoney(vatNet)}`],
        ['قيمة المخزون', `${fmtMoney(stockValue)}`], ['مواد تحت حد الطلب', `${lowStock}`],
      ],
      tables: [
        {
          title: 'الأرصدة الحالية (المخزون)',
          header: ['المادة', 'الوحدة', 'الكمية', 'القيمة'],
          rows: balanceRows.map((b) => [b.name, b.unit, fmt(b.qty), fmt(b.value)]),
        },
        {
          title: 'مراكز التكلفة حسب الهامش',
          header: ['مركز التكلفة', 'الإيراد', 'الربح', 'الهامش %'],
          rows: branchMargin.map((b) => [b.name, fmt(b.rev, 0), fmt(b.p, 0), b.m.toFixed(2)]),
        },
        {
          title: 'الأعلى مبيعاً',
          header: ['الصنف', 'الكمية', 'الإيراد'],
          rows: topItems.map((t) => [t.name, t.qty, t.revenue.toFixed(2)]),
        },
        {
          title: 'الأعلى تكلفة (Food Cost)',
          header: ['الصنف', 'FC %', 'المستهدف %'],
          rows: recipeCostRows.map((r) => [r.name, r.pct.toFixed(2), r.targetFc.toFixed(2)]),
        },
        ...(aiResult ? [{ title: 'التقرير التنفيذي (ذكاء اصطناعي)', header: ['النص'], rows: aiResult.split('\n').filter((l) => l.trim()).map((l) => [l]) }] : []),
      ],
      totals: [
        ['إجمالي الإيراد', `${fmtMoney(revenue)}`],
        ['إجمالي الربح', `${fmtMoney(profit)}`],
        ['الهامش', `${margin.toFixed(2)}%`],
        ['صافي الضريبة المستحقة', `${fmtMoney(vatNet)}`],
        ['قيمة المخزون الحالي', `${fmtMoney(stockValue)}`],
      ],
      footer: 'التقرير التنفيذي الذكي — RestoCost ERP',
    });
  };

  if (!can('use_ai')) {
    return <PageHeader title="التقرير التنفيذي الذكي" subtitle="تقرير موحّد بالذكاء الاصطناعي لكل المؤشرات" icon={<FileText className="w-6 h-6 text-indigo-300" />} actions={<Card className="p-4 text-center text-xs font-bold text-slate-500">صلاحيتك الحالية لا تسمح — تواصل مع مدير النظام.</Card>} />;
  }

  const kpis = [
    { label: 'الإيراد', value: fmtMoney(revenue), tone: 'text-indigo-700' },
    { label: 'تكلفة الطعام', value: `${fcPct.toFixed(2)}%`, tone: fcPct > 35 ? 'text-rose-600' : 'text-emerald-700' },
    { label: 'العمالة', value: `${laborPct.toFixed(2)}%`, tone: 'text-violet-700' },
    { label: 'التشغيلية', value: `${opexPct.toFixed(2)}%`, tone: 'text-amber-700' },
    { label: 'الهالك', value: `${wastagePct.toFixed(2)}%`, tone: 'text-rose-700' },
    { label: 'الربح', value: fmtMoney(profit), tone: profit >= 0 ? 'text-emerald-700' : 'text-rose-700' },
    { label: 'الهامش', value: `${margin.toFixed(2)}%`, tone: margin >= 0 ? 'text-emerald-700' : 'text-rose-700' },
    { label: 'صافي الضريبة', value: fmtMoney(vatNet), tone: 'text-amber-700' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="التقرير التنفيذي الذكي" subtitle="تقرير موحّد: مبيعات، تكاليف، مراكز تكلفة، مخزون، ضريبة — مع توليد تقرير تنفيذي بالذكاء الاصطناعي" icon={<FileText className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar filename="التقرير_التنفيذي_الذكي" sheets={[
            { name: 'ملخص تنفيذي', header: ['المؤشر', 'القيمة'], rows: [['الإيراد', revenue], ['تكلفة الطعام', foodCost], ['Food Cost %', fcPct.toFixed(2)], ['العمالة', labor], ['التشغيلية', opex], ['الهالك', wastage], ['الربح', profit], ['الهامش %', margin.toFixed(2)], ['صافي الضريبة', vatNet]] },
            { name: 'مراكز التكلفة', header: ['المركز', 'الإيراد', 'الربح', 'الهامش %'], rows: branchMargin.map((b) => [b.name, b.rev, b.p, b.m.toFixed(2)]) },
            { name: 'الأعلى مبيعاً', header: ['الصنف', 'الكمية', 'الإيراد'], rows: topItems.map((t) => [t.name, t.qty, t.revenue]) },
            { name: 'الأرصدة الحالية', header: ['المادة', 'الوحدة', 'الكمية', 'القيمة'], rows: balanceRows.map((b) => [b.name, b.unit, b.qty, b.value]) },
            { name: 'التوصيات الآلية', header: ['التوصية'], rows: insights.map((i) => [i]) },
          ]} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('Executive_Report.csv', ['المؤشر', 'القيمة'], [['الإيراد', revenue], ['التكلفة', totalCost], ['الربح', profit], ['الهامش', margin.toFixed(2)], ['ضريبة', vatNet]])}>تصدير CSV</Btn>
          <AIModelPicker value={modelPick} onChange={setModelPick} />
          <Btn onClick={generateAI} disabled={aiLoading}><Sparkles className="w-4 h-4" /> {aiLoading ? 'جارٍ التوليد...' : 'توليد التقرير بالذكاء الاصطناعي'}</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-slate-500 text-[10px] block">{k.label}</span>
            <strong className={`text-sm font-extrabold font-mono block mt-1 ${k.tone}`}>{k.value}</strong>
          </div>
        ))}
      </div>

      <TabBar tabs={[{ id: 'overview', label: 'نظرة عامة' }, { id: 'details', label: 'التفاصيل' }, { id: 'recommendations', label: 'التوصيات' }]} active={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">الأعلى مبيعاً (8 أصناف)</h3>
            <div className="space-y-2">
              {topItems.map((t, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="font-bold text-slate-700 text-xs">{idx + 1}. {t.name}</span>
                  <span className="font-mono font-extrabold text-slate-900 text-xs">{fmtMoney(t.revenue)}</span>
                </div>
              ))}
              {topItems.length === 0 && <p className="text-center text-slate-400 text-xs py-6">لا توجد مبيعات POS</p>}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">مراكز التكلفة (حسب الهامش)</h3>
            <div className="space-y-2">
              {branchMargin.map((b) => (
                <div key={b.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="font-bold text-slate-700 text-xs">{b.name}</span>
                  <span className={`font-mono font-extrabold text-xs ${b.m >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{b.m.toFixed(2)}%</span>
                </div>
              ))}
              {branchMargin.length === 0 && <p className="text-center text-slate-400 text-xs py-6">لا توجد بيانات</p>}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">الأعلى تكلفة (Food Cost)</h3>
            <div className="space-y-2">
              {recipeCostRows.map((r, idx) => (
                <div key={idx} className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <span className="font-bold text-slate-700 text-xs">{idx + 1}. {r.name}</span>
                  <span className={`font-mono font-extrabold text-xs ${r.gap > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{r.pct.toFixed(2)}% (مستهدف {r.targetFc.toFixed(2)}%)</span>
                </div>
              ))}
              {recipeCostRows.length === 0 && <p className="text-center text-slate-400 text-xs py-6">لا توجد أصناف</p>}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">الوضع العام</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3"><span className="font-bold text-slate-700 text-xs">قيمة المخزون الحالي</span><span className="font-mono font-extrabold text-slate-900 text-xs">{fmtMoney(stockValue)}</span></div>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3"><span className="font-bold text-slate-700 text-xs">أصناف تحت الحد الأدنى</span><span className={`font-mono font-extrabold text-xs ${lowStock > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{lowStock}</span></div>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3"><span className="font-bold text-slate-700 text-xs">متوسط قيمة العملية</span><span className="font-mono font-extrabold text-slate-900 text-xs">{fmtMoney(avgOrder)}</span></div>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3"><span className="font-bold text-slate-700 text-xs">إجمالي العمليات</span><span className="font-mono font-extrabold text-slate-900 text-xs">{orders}</span></div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'details' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-2">البند</th><th className="p-2">المبلغ</th><th className="p-2">النسبة من الإيراد</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr><td className="p-2 font-bold">الإيراد</td><td className="p-2 font-mono font-extrabold">{fmtMoney(revenue)}</td><td className="p-2 font-mono">100%</td></tr>
                <tr><td className="p-2 font-bold">تكلفة الطعام</td><td className="p-2 font-mono">{fmtMoney(foodCost)}</td><td className="p-2 font-mono">{fcPct.toFixed(2)}%</td></tr>
                <tr><td className="p-2 font-bold">العمالة</td><td className="p-2 font-mono">{fmtMoney(labor)}</td><td className="p-2 font-mono">{laborPct.toFixed(2)}%</td></tr>
                <tr><td className="p-2 font-bold">التشغيلية المدفوعة</td><td className="p-2 font-mono">{fmtMoney(opex)}</td><td className="p-2 font-mono">{opexPct.toFixed(2)}%</td></tr>
                <tr><td className="p-2 font-bold">الهوالك</td><td className="p-2 font-mono">{fmtMoney(wastage)}</td><td className="p-2 font-mono">{wastagePct.toFixed(2)}%</td></tr>
                <tr className="bg-indigo-50/60"><td className="p-2 font-extrabold">إجمالي التكاليف</td><td className="p-2 font-mono font-extrabold">{fmtMoney(totalCost)}</td><td className="p-2 font-mono font-extrabold">{revenue ? ((totalCost / revenue) * 100).toFixed(2) : '0'}%</td></tr>
                <tr className="bg-emerald-50/60"><td className="p-2 font-extrabold text-emerald-800">الربح الصافي</td><td className="p-2 font-mono font-extrabold text-emerald-800">{fmtMoney(profit)}</td><td className="p-2 font-mono font-extrabold text-emerald-800">{margin.toFixed(2)}%</td></tr>
                <tr><td className="p-2 font-bold">ضريبة خرج (مبيعات)</td><td className="p-2 font-mono">{fmtMoney(vatOutput)}</td><td className="p-2 font-mono">—</td></tr>
                <tr><td className="p-2 font-bold">ضريبة دخل (مشتريات)</td><td className="p-2 font-mono">{fmtMoney(vatInput)}</td><td className="p-2 font-mono">—</td></tr>
                <tr><td className="p-2 font-bold">صافي الضريبة المستحقة ({vatPercent}%)</td><td className="p-2 font-mono font-extrabold text-amber-700">{fmtMoney(vatNet)}</td><td className="p-2 font-mono">—</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'recommendations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><Sparkles className="w-4 h-4 text-indigo-600" /> التوصيات الآلية الفورية</h3>
            <div className="space-y-2">
              {insights.map((i, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] leading-relaxed font-bold text-slate-700">• {i}</div>
              ))}
              {insights.length === 0 && <p className="text-center text-slate-400 text-xs py-6">لا توجد بيانات</p>}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><BrainCircuit className="w-4 h-4 text-violet-600" /> التقرير التنفيذي بالذكاء الاصطناعي</h3>
            {aiLoading ? (
              <div className="flex items-center gap-2 text-violet-700 text-xs font-bold py-6"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ توليد التقرير التنفيذي...</div>
            ) : aiResult ? (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap">{aiResult}</div>
            ) : (
              <p className="text-slate-500 text-[11px] leading-relaxed">اضغط "توليد التقرير بالذكاء الاصطناعي" للحصول على تقرير تنفيذي كامل بالعربية (نظرة عامة + تحليل تكاليف + مراكز تكلفة + مخزون وضريبة + 5 توصيات مرقمة). يعمل حالياً بالتحليل المحلي.</p>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={generateAI} disabled={aiLoading} className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-extrabold disabled:opacity-50"><BrainCircuit className="w-4 h-4" /> توليد</button>
              <AIModelPicker value={modelPick} onChange={setModelPick} />
              <button onClick={copyResult} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-extrabold">{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} نسخ</button>
              <button onClick={publishReport} disabled={tgSending} className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-extrabold disabled:opacity-50">{tgSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {tgSending ? 'جارٍ النشر...' : 'نشر إلى تليجرام'}</button>
              <button onClick={printReport} className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-extrabold"><Printer className="w-4 h-4" /> طباعة</button>
            </div>
            {aiNote && <p className="mt-2 text-[10px] text-slate-500 font-bold">{aiNote}</p>}
            {tgNote && <p className="mt-1 text-[10px] font-bold text-sky-700">{tgNote}</p>}
          </Card>
        </div>
      )}

      {tab === 'recommendations' && (
        <Card className="p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><Sparkles className="w-4 h-4 text-indigo-600" /> اسأل نظامك مباشرة (بالعربية)</h3>
          <p className="text-[11px] text-slate-500 font-bold leading-relaxed mb-3">مثال: "أين زادت تكلفة الطعام؟"، "كم الهالك؟"، "أفضل مركز هامشاً؟"، "قيمة المخزون؟" — إجابة آلية فورية، ويمكن توسيعها بالذكاء الاصطناعي.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <input value={qaText} onChange={(e) => setQaText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askQuestion()} placeholder="اكتب سؤالك هنا..." className={inputCls + ' flex-1 min-w-56'} />
            <Btn onClick={askQuestion}>إجابة فورية</Btn>
            <AIModelPicker value={modelPick} onChange={setModelPick} />
            <Btn onClick={expandQuestion} disabled={qaLoading} tone="ghost">{qaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} توسيع بالذكاء الاصطناعي</Btn>
          </div>
          {qaAnswer && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed font-bold text-slate-800">{qaAnswer}</p>
            </div>
          )}
          {qaNote && <p className="mt-2 text-[10px] text-slate-500 font-bold">{qaNote}</p>}
        </Card>
      )}
    </div>
  );
};