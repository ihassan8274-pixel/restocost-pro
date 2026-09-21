import React, { useEffect, useState } from 'react';
import { Sparkles, BrainCircuit, Loader2, Copy, Printer, KeyRound, X, Check } from 'lucide-react';
import { Card, inputCls } from '../ui';
import { openPrintWindow } from '../../utils/print';
import { runAISummary, AI_PROVIDERS, getAIModels, getActiveAIModelId, upsertAIModel, type AIProvider } from '../../utils/ai';
import { AIModelPicker } from './AIModelPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  insights: string[];
  buildPrompt: () => string;
  systemPrompt?: string;
}

export const AIAnalyzeModal: React.FC<Props> = ({ open, onClose, title, insights, buildPrompt, systemPrompt }) => {
  const [modelPick, setModelPick] = useState<string>(() => getActiveAIModelId());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiNote, setAiNote] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [key, setKey] = useState('');
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [copied, setCopied] = useState(false);

  const selectedCfg = getAIModels().find((m) => m.id === modelPick);
  const aiConfigured = !!(selectedCfg && (selectedCfg.provider === 'local' || !!selectedCfg.apiKey || !!selectedCfg.hasKey || (selectedCfg.provider === 'custom' && !!selectedCfg.baseURL)));

  useEffect(() => {
    const m = getAIModels().find((x) => x.id === modelPick);
    if (m) {
      setKey(m.apiKey);
      setProvider(m.provider);
      setBaseUrl(m.baseURL || '');
      setModel(m.model);
    }
  }, [modelPick]);

  if (!open) return null;

  const generate = async () => {
    setAiLoading(true);
    setAiNote('');
    const result = await runAISummary(systemPrompt || 'أنت محلل مالي وتكلفة خبير لسلسلة مطاعم. استخدم الأرقام المقدمة حرفياً ولا تختلق قيماً.', buildPrompt(), modelPick);
    setAiLoading(false);
    if (result) {
      setAiResult(result);
      setAiNote(`تم توليد التحليل عبر مزوّد الذكاء الاصطناعي (${AI_PROVIDERS.find((p) => p.id === selectedCfg?.provider)?.label || selectedCfg?.provider || 'غير محدد'}).`);
    } else {
      setAiResult('');
      setAiNote(aiConfigured ? 'تعذّر الوصول للمزوّد (تحقق من المفتاح والاتصال) — اعتمد على التحليل الآلي أدناه.' : 'أدخل مفتاح مزوّد الذكاء الاصطناعي في الإعدادات للتحليل المتقدم، أو اعتمد على التحليل الآلي الفوري.');
    }
  };

  const saveSettings = () => {
    upsertAIModel({ id: modelPick, provider, apiKey: key.trim(), baseURL: baseUrl.trim() || undefined, model: model.trim(), enabled: true });
    setShowSettings(false);
    setAiNote(aiConfigured ? 'تم حفظ إعدادات الذكاء الاصطناعي لهذا النموذج.' : 'الإعدادات محفوظة — التحليل الآلي المحلي يعمل.');
  };

  const copyResult = async () => {
    const text = aiResult || insights.join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const printAnalysis = () => {
    openPrintWindow({
      title: `التحليل الذكي — ${title}`,
      subtitle: 'تحليل مدعوم بالذكاء الاصطناعي',
      meta: [['تاريخ التحليل', new Date().toLocaleString('ar-SA-u-nu-latn')], ['المصدر', aiConfigured ? 'ذكاء اصطناعي + تحليل آلي' : 'تحليل آلي محلي']],
      tables: [
        { title: 'الملاحظات الآلية', header: ['الملاحظة'], rows: insights.map((i) => [i]) },
        ...(aiResult ? [{ title: 'التحليل التنفيذي (ذكاء اصطناعي)', header: ['النص'], rows: aiResult.split('\n').filter((l) => l.trim()).map((l) => [l]) }] : []),
      ],
      footer: 'تقرير تحليلي مولّد آلياً — RestoCost ERP',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto" >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-2 font-extrabold text-slate-900 text-sm"><Sparkles className="w-4 h-4 text-indigo-600" /> {title}</h3>
            <div className="flex items-center gap-1">
              <AIModelPicker value={modelPick} onChange={setModelPick} />
              <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" title="إعدادات النموذج المحدد"><KeyRound className="w-4 h-4" /></button>
              <button onClick={onClose} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
          </div>

          {showSettings && (
            <div className="mb-4 space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
              <div>
                <span className="font-bold text-slate-700 block mb-1">المزوّد</span>
                <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)} className={inputCls}>
                  {AI_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              {provider === 'custom' && (
                <>
                  <div>
                    <span className="font-bold text-slate-700 block mb-1">عنوان الخادم (Base URL)</span>
                    <input dir="ltr" type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" className={inputCls} />
                  </div>
                  <div>
                    <span className="font-bold text-slate-700 block mb-1">اسم النموذج</span>
                    <input dir="ltr" type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat / llama3.2..." className={inputCls} />
                  </div>
                </>
              )}
              <div>
                <span className="font-bold text-slate-700 block mb-1">مفتاح API {provider === 'custom' ? '(اختياري للمزوّد المحلي)' : ''}</span>
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={AI_PROVIDERS.find((p) => p.id === provider)?.keyPlaceholder || '—'} className={inputCls} />
                <p className="text-[10px] text-slate-400 mt-1">يُحفظ على النموذج المحدد فقط ولا يشارك مع النماذج الأخرى.</p>
              </div>
              {provider !== 'local' && provider !== 'custom' && provider !== 'gemini' && AI_PROVIDERS.find((p) => p.id === provider)?.models.length ? (
                <div>
                  <span className="font-bold text-slate-700 block mb-1">النموذج</span>
                  <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
                    {AI_PROVIDERS.find((p) => p.id === provider)?.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowSettings(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-600">إغلاق</button>
                <button onClick={saveSettings} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg font-bold">حفظ</button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button onClick={generate} disabled={aiLoading} className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-extrabold disabled:opacity-50">
              <BrainCircuit className="w-4 h-4" /> {aiLoading ? 'جارٍ التحليل...' : 'توليد تحليل ذكي'}
            </button>
            <button onClick={copyResult} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-extrabold">
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} نسخ
            </button>
            <button onClick={printAnalysis} className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-extrabold">
              <Printer className="w-4 h-4" /> طباعة التحليل
            </button>
          </div>

          {aiLoading && <div className="flex items-center gap-2 text-violet-700 text-xs font-bold py-4"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الاتصال بالمزوّد وتحليل المؤشرات...</div>}

          {aiResult && <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap mb-3">{aiResult}</div>}

          {aiNote && <p className="text-[10px] text-slate-500 font-bold mb-3">{aiNote}</p>}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-[10px] font-extrabold text-indigo-700 mb-2 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> التحليل الآلي الفوري</p>
            <div className="space-y-1.5">
              {insights.map((i, idx) => (
                <p key={idx} className="text-[11px] text-slate-700 font-bold leading-relaxed">• {i}</p>
              ))}
              {insights.length === 0 && <p className="text-[11px] text-slate-400">لا توجد بيانات كافية للتحليل.</p>}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};