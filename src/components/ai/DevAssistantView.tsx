import React, { useState } from 'react';
import { Sparkles, Loader2, Copy, Check, FileCode2, FileJson, TerminalSquare, Wand2, Info, Printer, Trash2 } from 'lucide-react';
import { Card, PageHeader, Btn, inputCls } from '../ui';
import { useApp } from '../../context/AppContext';
import { runAISummary, AI_PROVIDERS, getAIModels, getActiveAIModelId } from '../../utils/ai';
import { AIModelPicker } from './AIModelPicker';

type Mode = 'template' | 'automation' | 'code';

// قالب افتراضي يُستخدم عند غياب مزوّد الذكاء الاصطناعي (يعمل دون إنترنت)
const localTemplate = (description: string) => {
  const title = description.trim() || 'تقرير النظام';
  return `<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="utf-8"/>
  <style>
    @page { size: A4; margin: 1.2cm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; color: #1f2937; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #b45309; padding-bottom: 10px; margin-bottom: 14px; }
    .logo { font-size: 20px; font-weight: 900; color: #b45309; }
    .title { text-align: left; color: #6b7280; font-size: 11px; }
    h2 { color: #b45309; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #fef3c7; color: #92400e; font-weight: 800; padding: 8px; border: 1px solid #e5e7eb; }
    td { padding: 7px 8px; border: 1px solid #e5e7eb; text-align: right; }
    tbody tr:nth-child(even) { background: #fffbeb; }
    .summary { margin-top: 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 11px; }
    .summary b { color: #b45309; }
    .footer { margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 10px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">RestoCost ERP — ${title}</div>
    <div class="title">{{date}}<br/>{{user}}</div>
  </div>
  <table>
    <thead><tr>{{#each header}}<th>{{this}}</th>{{/each}}</tr></thead>
    <tbody>{{#each rows}}<tr>{{#each cells}}<td>{{this}}</td>{{/each}}</tr>{{/each}}</tbody>
  </table>
  <div class="footer">تقرير مولّد آلياً عبر نظام محاسبة التكاليف RestoCost ERP</div>
</body>
</html>`;
};

const SAMPLE_DATA = JSON.stringify(
  {
    date: '2026-09-19',
    user: 'مسؤول النظام',
    header: ['الصنف', 'الكمية', 'الوحدة', 'التكلفة'],
    rows: [
      { cells: ['دجاج طازج', 10, 'كغ', 85] },
      { cells: ['أرز بسمتي', 25, 'كغ', 120] },
      { cells: ['زيت نباتي', 5, 'لتر', 34] },
    ],
  },
  null,
  2,
);

const DEFAULT_RULE = `{
  "name": "تنبيه عند نهاية المخزون",
  "event": "inventory:low",
  "condition": {
    "field": "quantityRatio",
    "op": "<",
    "value": 0.15
  },
  "actions": [
    { "type": "notify", "channel": "telegram", "message": "مخزون منخفض: {{item}}" },
    { "type": "create", "entity": "purchase-request", "data": { "priority": "high" } }
  ]
}`;

export const DevAssistantView: React.FC = () => {
  const { can } = useApp();
  const [mode, setMode] = useState<Mode>('template');
  const [task, setTask] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [dataJson, setDataJson] = useState(SAMPLE_DATA);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [modelPick, setModelPick] = useState<string>(() => getActiveAIModelId());

  if (!can('use_ai')) {
    return <PageHeader title="مساعد التطوير المدمج" subtitle="توليد قوالب التقارير واختبارها وقواعد الأتمتة بمساعدة الذكاء الاصطناعي" icon={<Wand2 className="w-6 h-6 text-violet-600" />} actions={<Card className="p-4 text-center text-xs font-bold text-slate-500">صلاحيتك الحالية لا تسمح — تواصل مع مدير النظام.</Card>} />;
  }

  const selectedCfg = getAIModels().find((m) => m.id === modelPick);
  const aiReady = !!(selectedCfg && (selectedCfg.provider === 'local' || !!selectedCfg.apiKey || !!selectedCfg.hasKey || (selectedCfg.provider === 'custom' && !!selectedCfg.baseURL)));
  const providerLabel = AI_PROVIDERS.find((p) => p.id === selectedCfg?.provider)?.label.split(' (')[0] || selectedCfg?.provider || 'غير محدد';

  const systemPrompt = () => {
    if (mode === 'template') return 'أنت خبير تقارير HTML وHandlebars. ولّد قالب HTML كاملاً (RTL، عربي، ألوان ذهبية هادئة، A4) جاهزاً لمحرك jsreport بوضع القالب المخصص. استخدم عناصر {{placeholders}} بفاصلة مزدوجة بلغة Handlebars، ودع البيانات تُمرَّر عبر كائن data. أخرج HTML فقط بدون أي شرح.';
    if (mode === 'automation') return 'أنت خبير نمذجة أتمتة. ولّد قاعدة أتمتة بصيغة JSON مطابقة لهذا المخطط: { name, event, condition: { field, op, value }, actions: [ { type, channel/mainView?, message? }... ] }. الأحداث المدعومة: inventory:low, inventory:expiring, sales:threshold, purchase:due, payroll:due, wastage:high. أخرج JSON فقط بدون شرح.';
    return 'أنت مساعد تطوير أنظمة حسابات. أجب بالعربية بشكل عملي ومركّز مع أمثلة كود عند الحاجة.';
  };

  const userPrompt = () => {
    if (mode === 'template') return `إنشاء قالب تقرير PDF بوضع القالب المخصص (html+data) لجسر jsreport، بما يناسب الوصف التالي:\n\n${task || 'تقرير عام للبيانات الجدولية'}`;
    if (mode === 'automation') return `كُن قاعدة أتمتة JSON لما يلي:\n\n${task || 'تنبيه عند انخفاض المخزون مع إنشاء طلب شراء تلقائي'}`;
    return `${task}\n\n(اختياري) أعطني الحل مقسماً: الفكرة، التنفيذ/الكود، والخطوات إذا لزمت.`;
  };

  const generate = async () => {
    setNote('');
    setOutput('');
    setBusy(true);
    if (!aiReady) {
      // معالجة محلية — تعمل دون إنترنت
      if (mode === 'template') setOutput(localTemplate(task));
      else if (mode === 'automation') setOutput(DEFAULT_RULE);
      else setNote('الأسئلة الحرة تتطلب تفعيل مزوّد ذكاء اصطناعي (Gemini أو Groq مجانيان أو مزوّد مخصص مثل Ollama/DeepSeek من "إعدادات النظام").');
      setBusy(false);
      return;
    }
    const result = await runAISummary(systemPrompt(), userPrompt(), modelPick);
    setBusy(false);
    if (result) {
      setOutput(result.replace(/^```(html|json|js|ts|sql)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim());
      setNote(`تم التوليد عبر ${providerLabel}.`);
    } else {
      if (mode === 'template') setOutput(localTemplate(task));
      else if (mode === 'automation') setOutput(DEFAULT_RULE);
      setNote('تعذّر الوصول للمزوّد — عُرض ناتج محلي جاهز (يعمل دون إنترنت).');
    }
  };

  const copyOutput = async () => {
    if (!output) return;
    try { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const tryPdf = async () => {
    if (!output) { setNote('ولّد القالب أولاً.'); return; }
    let data: unknown;
    try {
      data = JSON.parse(dataJson);
    } catch {
      setNote('بيانات التجربة غير صالحة كـ JSON — صحّحها ثم أعد المحاولة.');
      return;
    }
    setPdfBusy(true);
    setNote('');
    try {
      const token = localStorage.getItem('rcerp_token') || '';
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ html: output, data, engine: 'handlebars' }),
      });
      if (res.status === 401) { setNote('انتهت الجلسة — أعد تسجيل الدخول'); return; }
      if (res.status === 501) { setNote('توليد PDF مخصص غير متاح على الخادم (jsreport غير مثبت)'); return; }
      if (!res.ok) { const j = await res.json().catch(() => null); setNote(j?.error || `فشل التوليد (${res.status})`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dev_report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNote('تم توليد PDF تجريبي بنجاح');
    } catch {
      setNote('فشل الاتصال بخادم التقارير');
    } finally {
      setPdfBusy(false);
    }
  };

  const placeholders: Record<Mode, string> = {
    template: 'صف ما تريد التقرير عنه (جدول مبيعات/كامة، فاتورة، جرد...) — سيولّد النموذج قالب HTML كاملاً بهوية النظام',
    automation: 'صف السيناريو (مثل: تنبيه تليجرام عندما تنخفض الكمية عن 15% مع إنشاء طلب شراء) — سيولّد قاعدة JSON جاهزة',
    code: 'اطرح أي استفسار تطويري (صيغة Excel، شروط تقارير، منطق حساب، خطوات توثيق...)',
  };

  const tabs: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: 'template', label: 'قالب تقرير PDF', icon: <FileCode2 className="w-4 h-4" /> },
    { id: 'automation', label: 'قاعدة أتمتة (JSON)', icon: <FileJson className="w-4 h-4" /> },
    { id: 'code', label: 'استفسار تطويري', icon: <TerminalSquare className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="مساعد التطوير المدمج" subtitle="توليد قوالب التقارير وتجربتها كـ PDF، وبناء قواعد الأتمتة، والإجابة عن استفسارات التطوير — عبر مزوّد الذكاء المفعّل أو محلياً دون إنترنت" icon={<Wand2 className="w-6 h-6 text-violet-600" />}
        actions={<span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${aiReady ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{aiReady ? `مزوّد متصل: ${providerLabel}` : 'تحليل/توليد محلي'}</span>} />

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setMode(t.id); setOutput(''); setNote(''); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${mode === t.id ? 'bg-violet-600 text-white shadow' : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-300'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <Card className="p-5">
        <div className="space-y-3">
          <div>
            <label className="block font-bold text-slate-800 mb-1.5 text-xs">الوصف / الطلب</label>
            <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={3} placeholder={placeholders[mode]}
              className={inputCls + ' leading-relaxed resize-y'} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn onClick={generate} disabled={busy} tone="primary">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {busy ? 'جارٍ التوليد...' : 'توليد'}
            </Btn>
            <AIModelPicker value={modelPick} onChange={setModelPick} />
            <Btn onClick={copyOutput} disabled={!output} tone="ghost">{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} نسخ</Btn>
            {mode === 'template' && output && (
              <Btn onClick={tryPdf} disabled={pdfBusy} tone="dark">
                {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} تجربة PDF (html + data)
              </Btn>
            )}
          </div>

          {mode === 'template' && (
            <div>
              <label className="block font-bold text-slate-800 mb-1.5 text-xs">بيانات التجربة (JSON) — ستُمرَّر لقالب Handlebars</label>
              <div className="relative">
                <textarea value={dataJson} onChange={(e) => setDataJson(e.target.value)} rows={8} dir="ltr"
                  className={inputCls + ' font-mono text-[11px] leading-relaxed resize-y text-left'} />
                <button onClick={() => setDataJson(SAMPLE_DATA)} className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg"><Trash2 className="w-3 h-3" /> استعادة الافتراضي</button>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-800 text-xs">الناتج</label>
              <span className="text-[10px] text-slate-400">{output ? `${output.length} حرف` : ''}</span>
            </div>
            <textarea value={output} onChange={(e) => setOutput(e.target.value)} rows={mode === 'template' ? 16 : 10} dir="ltr" readOnly={!output}
              placeholder="الناتج سيظهر هنا — يمكنك تعديله ثم نسخه أو تجربته"
              className={inputCls + ' font-mono text-[11px] leading-relaxed resize-y text-left bg-slate-50'} />
          </div>

          {note && <p className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg p-2">{note}</p>}

          <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-violet-500" />
            <span>
              يعمل بأي مزوّد مفعّل في "إعدادات النظام"، ويدعم المزوّد المخصص عبر Base URL (Ollama / LM Studio / DeepSeek) دون إنترنت.
              عند غياب المزوّد تُستخدم قوالب محلية جاهزة. لطباعة الناتج كـ PDF حقيقي استخدم "تجربة PDF" التي ترسله إلى محرك jsreport على الخادم.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};