import React, { useEffect, useMemo, useState } from 'react';
import { Network, Sparkles, KeyRound, Loader2, TrendingUp, TrendingDown, Printer, BrainCircuit, Send } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { AI_PROVIDERS, getAIModels, getActiveAIModelId, upsertAIModel, type AIProvider } from '../../utils/ai';
import { AIModelPicker } from './AIModelPicker';
import { runAIAgent, publishToTelegram } from '../../utils/aiTools';
import type { AIContext } from '../../utils/aiTools';

interface BranchKpi {
  id: string;
  name: string;
  revenue: number;
  foodCost: number;
  fcPct: number;
  labor: number;
  laborPct: number;
  operating: number;
  wastage: number;
  wastagePct: number;
  totalCost: number;
  profit: number;
  margin: number;
  orders: number;
  avgOrder: number;
}

export const AIBranchSummaryView: React.FC = () => {
  const { branches, visibleBranchIds, batchSalesRecords, posOrders, shifts, operatingExpenses, wastageLogs, can, inventory, getAverageUnitCost, recipes, rawMaterials, globalTargetMarginPercent, calculateRecipeCosts } = useApp();
  const [showKey, setShowKey] = useState(false);
  const [modelPick, setModelPick] = useState<string>(() => getActiveAIModelId());
  const [aiKey, setAiKeyLocal] = useState('');
  const [aiProvider, setAiProviderLocal] = useState<AIProvider>('gemini');
  const [aiBaseUrl, setAiBaseUrlLocal] = useState('');
  const [aiModel, setAiModelLocal] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string>('');
  const [aiNote, setAiNote] = useState('');
  const [tgSending, setTgSending] = useState(false);
  const [tgNote, setTgNote] = useState('');

  const selectedCfg = getAIModels().find((m) => m.id === modelPick);
  const aiConfigured = !!(selectedCfg && (selectedCfg.provider === 'local' || !!selectedCfg.apiKey || !!selectedCfg.hasKey || (selectedCfg.provider === 'custom' && !!selectedCfg.baseURL)));
  const providerName = AI_PROVIDERS.find((p) => p.id === selectedCfg?.provider)?.label.split(' (')[0] || selectedCfg?.provider || 'غير محدد';

  useEffect(() => {
    const m = getAIModels().find((x) => x.id === modelPick);
    if (m) {
      setAiKeyLocal(m.apiKey);
      setAiProviderLocal(m.provider);
      setAiBaseUrlLocal(m.baseURL || '');
      setAiModelLocal(m.model);
    }
  }, [modelPick]);

  const scope = visibleBranchIds;

  const rows = useMemo<BranchKpi[]>(() => {
    const ids = Array.from(new Set([...scope, 'b-ck', ...posOrders.map((o) => o.branchId), ...batchSalesRecords.map((b) => b.branchId), ...shifts.map((s) => s.branchId), ...operatingExpenses.map((e) => e.branchId), ...wastageLogs.map((w) => w.branchId)]));
    return ids.map((id) => {
      const name = id === 'b-ck' ? 'المطبخ المركزي' : branches.find((b) => b.id === id)?.nameAr || id;
      const pos = posOrders.filter((o) => o.branchId === id);
      const bs = batchSalesRecords.filter((b) => b.branchId === id);
      const revenue = pos.reduce((s, o) => s + o.subtotal, 0) + bs.reduce((s, b) => s + (b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15))), 0);
      const foodCost = pos.reduce((s, o) => s + o.totalCost, 0) + bs.reduce((s, b) => s + b.totalFoodCost, 0);
      const labor = shifts.filter((s) => s.branchId === id).reduce((s, sh) => s + sh.totalShiftCost, 0);
      const operating = operatingExpenses.filter((e) => e.branchId === id && e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
      const wastage = wastageLogs.filter((w) => w.branchId === id).reduce((s, w) => s + w.totalCostImpact, 0);
      const totalCost = foodCost + labor + operating + wastage;
      const profit = revenue - totalCost;
      const orders = pos.length + bs.length;
      return {
        id, name, revenue, foodCost,
        fcPct: revenue ? (foodCost / revenue) * 100 : 0,
        labor, laborPct: revenue ? (labor / revenue) * 100 : 0,
        operating, wastage, wastagePct: revenue ? (wastage / revenue) * 100 : 0,
        totalCost, profit, margin: revenue ? (profit / revenue) * 100 : 0,
        orders, avgOrder: orders ? revenue / orders : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [scope, branches, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const overallMargin = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;
  const stockRows = rows.map((r) => {
    const value = inventory.filter((i) => i.branchId === r.id).reduce((s, i) => s + i.quantity * getAverageUnitCost(i.rawMaterialId), 0);
    return { name: r.name, value };
  });
  const totalStock = stockRows.reduce((s, r) => s + r.value, 0);
  const best = rows.length ? [...rows].sort((a, b) => b.margin - a.margin)[0] : null;
  const worst = rows.length ? [...rows].sort((a, b) => a.margin - b.margin)[0] : null;
  const highFC = rows.length ? [...rows].sort((a, b) => b.fcPct - a.fcPct)[0] : null;
  const highWaste = rows.length ? [...rows].sort((a, b) => b.wastagePct - a.wastagePct)[0] : null;

  const chartData = rows.map((r) => ({ name: r.name, الإيراد: Math.round(r.revenue), التكلفة: Math.round(r.foodCost) }));

  const autoInsights: { text: string; tone: 'good' | 'warn' }[] = useMemo(() => {
    const out: { text: string; tone: 'good' | 'warn' }[] = [];
    if (!rows.length) return out;
    if (best && best.margin > 0) out.push({ text: `أفضل فرع هامشاً: ${best.name} بهامش ${best.margin.toFixed(2)}% — تعمّد إجراءاتها على باقي الفروع.`, tone: 'good' });
    if (worst && worst.margin < 0) out.push({ text: `فرع خاسر: ${worst.name} بهامش ${worst.margin.toFixed(2)}% — راجع تسعير قائمته وتكاليف العمالة والتشغيلية.`, tone: 'warn' });
    if (highFC && highFC.fcPct > 35) out.push({ text: `أعلى تكلفة طعام: ${highFC.name} بنسبة ${highFC.fcPct.toFixed(2)}% (يُفضَّل أقل من 35%) — تفاوض مع مورديه أو ارفع أسعار الأصناف منخفضة الهامش.`, tone: 'warn' });
    if (highWaste && highWaste.wastagePct > 2) out.push({ text: `أعلى هالك: ${highWaste.name} بنسبة ${highWaste.wastagePct.toFixed(2)}% من الإيراد — طبّق FIFO وراجع التخزين والمقادير.`, tone: 'warn' });
    const laborPct = totalRevenue ? (rows.reduce((s, r) => s + r.labor, 0) / totalRevenue) * 100 : 0;
    if (laborPct > 25) out.push({ text: `تكلفة العمالة الإجمالية ${laborPct.toFixed(2)}% من الإيراد (أعلى من 25%) — راجع جداول الورديات والمناوبات.`, tone: 'warn' });
    else if (rows.length) out.push({ text: `تكلفة العمالة ${laborPct.toFixed(2)}% من الإيراد — ضمن الحد المقبول.`, tone: 'good' });
    if (overallMargin >= 0) out.push({ text: `إجمالي الهامش عبر كل الفروع ${overallMargin.toFixed(2)}% بإجمالي ربح ${fmtMoney(totalProfit)}.`, tone: 'good' });
    else out.push({ text: `النظام ككل يحقق خسارة (هامش ${overallMargin.toFixed(2)}%) — تدخّل عاجل على تكلفة الطعام والعمالة.`, tone: 'warn' });
    const noData = rows.filter((r) => r.revenue === 0);
    if (noData.length) out.push({ text: `فروع بدون مبيعات مسجلة: ${noData.map((r) => r.name).join('، ')} — أدخل مبيعاتها لتحليل دقيق.`, tone: 'warn' });
    return out;
  }, [rows, best, worst, highFC, highWaste, overallMargin, totalProfit, totalRevenue]);

  const generateAI = async () => {
    setAiLoading(true);
    setAiNote('');
    const table = rows.map((r) => `${r.name}: إيراد ${r.revenue.toFixed(2)}, تكلفة طعام ${r.foodCost.toFixed(2)} (${r.fcPct.toFixed(2)}%), عمالة ${r.labor.toFixed(2)}, تشغيلية ${r.operating.toFixed(2)}, هالك ${r.wastage.toFixed(2)} (${r.wastagePct.toFixed(2)}%), ربح ${r.profit.toFixed(2)}, هامش ${r.margin.toFixed(2)}%`).join('\n');
    const rules = autoInsights.map((i) => `- ${i.text}`).join('\n');
    const userPrompt = `فرع/مطبخ ومؤشراته:\n${table}\n\nملاحظات آلية أولية:\n${rules}\n\nقدّم تحليلاً تنفيذياً موجزاً بالعربية مع 3-5 توصيات قابلة للتنفيذ ومرتبة بالأولوية لكل فرع، وركّز على خفض التكلفة ورفع الهامش.`;
    const ctx: AIContext = { branches, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs, inventory, recipes, rawMaterials, globalTargetMarginPercent, getAverageUnitCost, calculateRecipeCosts };
    const result = await runAIAgent('أنت محلل تكاليف خبير لسلسلة مطاعم. استخدم الأرقام المقدمة حرفياً ولا تختلق قيماً.', userPrompt, ctx, undefined, modelPick);
    setAiLoading(false);
    if (result) {
      setAiResult(result);
      setAiNote(`تم توليد التحليل عبر مزوّد الذكاء الاصطناعي (${providerName}).`);
    } else {
      setAiResult('');
      setAiNote(aiConfigured ? 'تعذّر الوصول لمزوّد الذكاء الاصطناعي (تحقق من المفتاح والاتصال) — عُرض التحليل الآلي أدناه.' : 'أدخل مفتاح مزوّد في الإعدادات لتوليد تحليل بالذكاء الاصطناعي، أو اعتمد على التحليل الآلي الفوري.');
    }
  };

  const saveKey = () => {
    upsertAIModel({ id: modelPick, provider: aiProvider, apiKey: aiKey.trim(), baseURL: aiBaseUrl.trim() || undefined, model: aiModel.trim(), enabled: true });
    setShowKey(false);
    setAiNote(aiConfigured ? 'تم حفظ إعدادات الذكاء الاصطناعي لهذا النموذج.' : 'الإعدادات محفوظة — ستُستخدم طريقة التحليل الآلي المحلية.');
  };

  const publishReport = async () => {
    setTgSending(true);
    setTgNote('');
    const header = `🏢 الشاشة المجمعة للفروع\nإجمالي الإيراد: ${fmtMoney(totalRevenue)} | الربح: ${fmtMoney(totalProfit)} | الهامش: ${overallMargin.toFixed(2)}% | أفضل فرع: ${best ? best.name : '—'}\n${'─'.repeat(30)}\n`;
    const body = aiResult || autoInsights.map((i) => `• ${i.text}`).join('\n') || 'لا توجد بيانات متاحة.';
    const r = await publishToTelegram(header + body);
    setTgSending(false);
    setTgNote(r.ok ? 'نُشر التحليل إلى مجموعة تليجرام الرئيسية ✓' : (r.error || 'تعذر النشر — تأكد من تفعيل بوت تليجرام في إعدادات النظام'));
    if (r.ok) setTimeout(() => setTgNote(''), 4000);
  };

  const printReport = () => {
    openPrintWindow({
      title: 'الشاشة المجمعة للفروع — تحليل ذكي',
      subtitle: 'تحليل تكلفة وأرباح موحد',
      meta: [
        ['إجمالي الإيراد', `${fmtMoney(totalRevenue)}`],
        ['إجمالي الربح', `${fmtMoney(totalProfit)}`],
        ['الهامش الإجمالي', `${overallMargin.toFixed(2)}%`],
        ['عدد الفروع', `${rows.length}`],
        ['أفضل فرع', best ? `${best.name} (${best.margin.toFixed(2)}%)` : '—'],
        ['قيمة المخزون', `${fmtMoney(totalStock)}`],
      ],
      tables: [{
        title: 'المؤشرات الموحدة لكل فرع',
        header: ['الفرع', 'الإيراد', 'تكلفة الطعام', 'FC %', 'العمالة', 'التشغيلية', 'الهالك %', 'إجمالي التكاليف', 'الربح', 'الهامش %'],
        rows: rows.map((r) => [r.name, fmt(r.revenue, 0), fmt(r.foodCost, 0), r.fcPct.toFixed(2), fmt(r.labor, 0), fmt(r.operating, 0), r.wastagePct.toFixed(2), fmt(r.totalCost, 0), fmt(r.profit, 0), r.margin.toFixed(2)]),
      }, {
        title: 'قيمة المخزون الحالي حسب الفرع',
        header: ['الفرع', 'قيمة المخزون'],
        rows: stockRows.map((r) => [r.name, fmt(r.value, 0)]),
      }, {
        title: 'الملاحظات الآلية',
        header: ['الملاحظة'],
        rows: autoInsights.map((i) => [i.text]),
      }],
      totals: [
        ['إجمالي الإيراد', `${fmtMoney(totalRevenue)}`],
        ['إجمالي الربح', `${fmtMoney(totalProfit)}`],
        ['الهامش الإجمالي', `${overallMargin.toFixed(2)}%`],
        ['قيمة المخزون الحالي', `${fmtMoney(totalStock)}`],
      ],
      footer: 'شاشة مجمعة للفروع مولّدة آلياً — RestoCost ERP',
    });
  };

  if (!can('use_ai')) {
    return <PageHeader title="الشاشة المجمعة للفروع بالذكاء الاصطناعي" subtitle="تحليل موحد لكل الفروع مع توصيات ذكية" icon={<Network className="w-6 h-6 text-indigo-300" />} actions={<Card className="p-4 text-center text-xs font-bold text-slate-500">صلاحيتك الحالية لا تسمح بالوصول — تواصل مع مدير النظام.</Card>} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="الشاشة المجمعة للفروع بالذكاء الاصطناعي" subtitle="دمج مؤشرات كل الفروع (إيراد، تكلفة طعام، عمالة، تشغيلية، هالك، ربح) مع تحليل ذكي وتوصيات" icon={<Network className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar filename="الشاشة_المجمعة_للفروع" sheets={[
            {
              name: 'مؤشرات الفروع الموحدة',
              header: ['الفرع', 'الإيراد', 'تكلفة الطعام', 'FC %', 'العمالة', 'Labor %', 'التشغيلية', 'الهالك', 'Wastage %', 'إجمالي التكاليف', 'الربح', 'الهامش %', 'عدد العمليات', 'متوسط الفاتورة'],
              rows: rows.map((r) => [r.name, r.revenue, r.foodCost, r.fcPct.toFixed(2), r.labor, r.laborPct.toFixed(2), r.operating, r.wastage, r.wastagePct.toFixed(2), r.totalCost, r.profit, r.margin.toFixed(2), r.orders, r.avgOrder.toFixed(2)]),
            },
            { name: 'قيمة المخزون حسب الفرع', header: ['الفرع', 'قيمة المخزون'], rows: stockRows.map((r) => [r.name, r.value]) },
            { name: 'الملاحظات الآلية', header: ['الملاحظة'], rows: autoInsights.map((i) => [i.text]) },
          ]} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة</Btn>
          <AIModelPicker value={modelPick} onChange={setModelPick} />
          <Btn tone="ghost" onClick={() => setShowKey(true)}><KeyRound className="w-4 h-4" /> إعدادات الذكاء الاصطناعي</Btn>
          <Btn onClick={generateAI} disabled={aiLoading}><BrainCircuit className="w-4 h-4" /> {aiLoading ? 'جارٍ التحليل...' : 'توليد تحليل ذكي'}</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الإيراد</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmtMoney(totalRevenue)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الربح</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${totalProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(totalProfit)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الهامش الإجمالي</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${overallMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{overallMargin.toFixed(2)}%</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أفضل فرع</span><strong className="text-sm font-extrabold text-slate-900 block mt-1">{best ? best.name : '—'}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مزود الذكاء الاصطناعي</span><strong className="text-sm font-extrabold text-slate-900 block mt-1">{aiConfigured ? providerName : 'تحليل محلي'}</strong></div>
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-xs mb-3">الإيراد مقابل تكلفة الطعام لكل فرع</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
            <Bar dataKey="الإيراد" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="التكلفة" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-2">الفرع</th><th className="p-2">الإيراد</th><th className="p-2">تكلفة الطعام</th><th className="p-2">FC %</th><th className="p-2">العمالة</th><th className="p-2">التشغيلية</th><th className="p-2">الهالك %</th><th className="p-2">إجمالي التكاليف</th><th className="p-2">الربح</th><th className="p-2">الهامش %</th><th className="p-2">متوسط الفاتورة</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="p-2 font-extrabold text-slate-900">{r.name}</td>
                  <td className="p-2 font-mono font-bold">{fmt(r.revenue, 0)}</td>
                  <td className="p-2 font-mono">{fmt(r.foodCost, 0)}</td>
                  <td className={`p-2 font-mono font-bold ${r.fcPct > 35 ? 'text-rose-700' : 'text-emerald-700'}`}>{r.fcPct.toFixed(2)}%</td>
                  <td className="p-2 font-mono">{fmt(r.labor, 0)}</td>
                  <td className="p-2 font-mono">{fmt(r.operating, 0)}</td>
                  <td className={`p-2 font-mono ${r.wastagePct > 2 ? 'text-rose-700' : 'text-slate-600'}`}>{r.wastagePct.toFixed(2)}%</td>
                  <td className="p-2 font-mono font-extrabold">{fmt(r.totalCost, 0)}</td>
                  <td className={`p-2 font-mono font-extrabold ${r.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(r.profit, 0)}</td>
                  <td className={`p-2 font-mono font-extrabold ${r.margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{r.margin.toFixed(2)}%</td>
                  <td className="p-2 font-mono text-slate-600">{fmt(r.avgOrder, 2)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-slate-400 text-xs">لا توجد بيانات للفروع — أدخل مبيعات وفروعاً أولاً</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><Sparkles className="w-4 h-4 text-indigo-600" /> التحليل الآلي الفوري</h3>
          <div className="space-y-2">
            {autoInsights.map((i, idx) => (
              <div key={idx} className={`flex items-start gap-2 rounded-xl p-3 border text-[11px] leading-relaxed ${i.tone === 'good' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                {i.tone === 'good' ? <TrendingUp className="w-4 h-4 mt-0.5 shrink-0" /> : <TrendingDown className="w-4 h-4 mt-0.5 shrink-0" />}
                <span className="font-bold">{i.text}</span>
              </div>
            ))}
            {autoInsights.length === 0 && <p className="text-slate-400 text-xs text-center py-4">أدخل بيانات لتوليد الملاحظات</p>}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><BrainCircuit className="w-4 h-4 text-violet-600" /> التحليل التنفيذي بالذكاء الاصطناعي</h3>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-violet-700 text-xs font-bold py-6"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الاتصال بالمزوّد وتحليل المؤشرات...</div>
          ) : aiResult ? (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap">{aiResult}</div>
          ) : (
            <div className="text-slate-500 text-[11px] leading-relaxed">
              <p>اضغط "توليد تحليل ذكي" للحصول على تقرير تنفيذي بالعربية يعتمد على أرقام الفروع الفعلية. يعمل حالياً بالتحليل المحلي (قواعد مبنية على مؤشراتك).</p>
              {!aiConfigured && <p className="mt-2 text-indigo-700 font-bold">فعّل مزوّد الذكاء الاصطناعي (Gemini أو Groq مجانيان، أو OpenAI/OpenRouter) في "إعدادات النظام" للتحليل المتقدم (اختياري).</p>}
            </div>
          )}
          {aiNote && <p className="mt-2 text-[10px] text-slate-500 font-bold">{aiNote}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={publishReport} disabled={tgSending} className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-extrabold disabled:opacity-50">{tgSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {tgSending ? 'جارٍ النشر...' : 'نشر إلى تليجرام'}</button>
          </div>
          {tgNote && <p className="mt-1 text-[10px] font-bold text-sky-700">{tgNote}</p>}
        </Card>
      </div>

      {showKey && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowKey(false)}>
          <Card className="p-5 w-full max-w-md" >
            <div onClick={(e) => e.stopPropagation()}>
              <h3 className="font-extrabold text-slate-900 text-sm mb-3">إعدادات إضافة الذكاء الاصطناعي</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-bold text-slate-700 block mb-1">المزوّد</span>
                  <select value={aiProvider} onChange={(e) => setAiProviderLocal(e.target.value as AIProvider)} className={inputCls}>
                    {AI_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                {aiProvider === 'custom' && (
                  <>
                    <div>
                      <span className="font-bold text-slate-700 block mb-1">عنوان الخادم (Base URL)</span>
                      <input dir="ltr" type="text" value={aiBaseUrl} onChange={(e) => setAiBaseUrlLocal(e.target.value)} placeholder="http://localhost:11434/v1" className={inputCls} />
                      <p className="text-[10px] text-slate-400 mt-1">أمثلة: Ollama/LM Studio محلياً أو رابط DeepSeek / Azure / أي مزوّد متوافق مع OpenAI API.</p>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700 block mb-1">اسم النموذج</span>
                      <input dir="ltr" type="text" value={aiModel} onChange={(e) => setAiModelLocal(e.target.value)} placeholder="deepseek-chat / llama3.2 / gpt-4o..." className={inputCls} />
                    </div>
                  </>
                )}
                <div>
                  <span className="font-bold text-slate-700 block mb-1">مفتاح API {aiProvider === 'custom' ? '(اختياري للمزوّد المحلي)' : ''}</span>
                  <input type="password" value={aiKey} onChange={(e) => setAiKeyLocal(e.target.value)} placeholder={AI_PROVIDERS.find((p) => p.id === aiProvider)?.keyPlaceholder || '—'} className={inputCls} />
                  <p className="text-[10px] text-slate-400 mt-1">يُحفظ المفتاح محلياً على جهازك فقط ولا يُرسل إلى الخادم.</p>
                </div>
                {aiProvider !== 'local' && aiProvider !== 'custom' && aiProvider !== 'gemini' && AI_PROVIDERS.find((p) => p.id === aiProvider)?.models.length ? (
                  <div>
                    <span className="font-bold text-slate-700 block mb-1">النموذج</span>
                    <select value={aiModel} onChange={(e) => setAiModelLocal(e.target.value)} className={inputCls}>
                      {AI_PROVIDERS.find((p) => p.id === aiProvider)?.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </div>
                ) : null}
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => setShowKey(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
                  <button onClick={saveKey} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">حفظ</button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};