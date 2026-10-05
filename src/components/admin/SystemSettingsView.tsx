import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ImagePlus, Trash2, Save, ShieldCheck, Info, Activity, Wrench, CheckCircle2,
  AlertTriangle, XCircle, Loader2, Globe, Wifi, WifiOff, Power, RefreshCw, Sparkles, Eye, EyeOff, KeyRound, Hash, Plus, Send, BadgeDollarSign, HeartPulse, CalendarDays, DatabaseBackup, Clock, Pencil, Star,
} from 'lucide-react';
import { useApp, SystemCheckResult, SystemRebuildResult } from '../../context/AppContext';
import { Card, PageHeader, Btn, SectionHeader, Modal, Field, inputCls } from '../ui';
import { testAIKey, testSavedAIModel, AI_PROVIDERS, DEFAULT_MODEL, type AIModelConfig, type AIProvider } from '../../utils/ai';

interface NetworkInfo {
  host: string;
  public: boolean;
  port: number;
  localIPs: { name: string; address: string }[];
}

export const SystemSettingsView: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { logo, setLogo, runSystemCheck, rebuildSystem, aiModels, activeAIModelId, addAIModel, updateAIModel, deleteAIModel, setActiveAIModel, vatPercent, setVatPercent, numerals, setNumerals, decimals, setDecimals, density, setDensity, deductSalesFromInventory, setDeductSalesFromInventory, hijriMode, setHijriMode, dataHealth, offline, pendingSavesCount } = useApp();
  const [vatVal, setVatVal] = useState(vatPercent);
  const [vatMsg, setVatMsg] = useState('');
  useEffect(() => { setVatVal(vatPercent); }, [vatPercent]);
  const saveVat = () => {
    const v = Number(vatVal);
    if (isNaN(v) || v < 0 || v > 100) { alert('أدخل نسبة ضريبة صحيحة بين 0 و 100'); return; }
    setVatPercent(v);
    setVatMsg('تم حفظ نسبة الضريبة بنجاح — سارية على جميع الحسابات والمبيعات');
    setTimeout(() => setVatMsg(''), 3000);
  };
  const [preview, setPreview] = useState<string | null>(logo);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // AI settings — نموذج متعدد (لكل نموذج مفتاح/مزوّد مستقل) مع نموذج افتراضي للنظام
  const emptyAiForm = (): { name: string; provider: AIProvider; apiKey: string; model: string; baseURL: string; enabled: boolean } => ({ name: '', provider: 'gemini' as AIProvider, apiKey: '', model: '', baseURL: '', enabled: true });
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiEditingId, setAiEditingId] = useState<string | null>(null);
  const [aiEditingHasKey, setAiEditingHasKey] = useState(false);
  const [aiForm, setAiForm] = useState(emptyAiForm());
  const setAiF = (patch: Partial<ReturnType<typeof emptyAiForm>>) => setAiForm((prev) => ({ ...prev, ...patch }));
  const [aiMsg, setAiMsg] = useState('');
  const [aiErr, setAiErr] = useState('');
  const [aiTesting, setAiTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const openAddModel = () => { setAiEditingId(null); setAiEditingHasKey(false); setAiForm(emptyAiForm()); setShowKey(false); setAiErr(''); setAiMsg(''); setAiModalOpen(true); };
  const openEditModel = (m: AIModelConfig) => {
    setAiEditingId(m.id);
    setAiEditingHasKey(Boolean(m.hasKey || m.apiKey));
    setAiForm({ name: m.name, provider: m.provider, apiKey: m.apiKey, model: m.model, baseURL: m.baseURL || '', enabled: m.enabled });
    setShowKey(false); setAiErr(''); setAiMsg(''); setAiModalOpen(true);
  };
  const saveAIModel = () => {
    setAiErr(''); setAiMsg('');
    const provider = aiForm.provider;
    if (provider !== 'local' && provider !== 'custom' && !aiForm.apiKey.trim() && !(aiEditingId && aiEditingHasKey)) { setAiErr('أدخل مفتاح API لهذا النموذج'); return; }
    const cfg = { name: aiForm.name.trim() || 'نموذج', provider, apiKey: aiForm.apiKey.trim(), baseURL: aiForm.baseURL.trim() || undefined, model: aiForm.model.trim(), enabled: aiForm.enabled };
    if (aiEditingId) updateAIModel(aiEditingId, { ...cfg });
    else addAIModel({ ...cfg, id: `ai-${Date.now()}` });
    setAiModalOpen(false);
    setAiMsg('تم حفظ النموذج — ساري على جميع الأجهزة المتصلة');
  };
  const testModelConfig = async () => {
    setAiErr(''); setAiMsg('');
    const provider = aiForm.provider;
    const hasStored = Boolean(aiEditingId && aiEditingHasKey);
    if (provider === 'custom') {
      if (!aiForm.baseURL.trim()) { setAiErr('أدخل عنوان الخادم (Base URL) أولاً'); return; }
    } else if (provider !== 'local') {
      if (!aiForm.apiKey.trim() && !hasStored) { setAiErr('أدخل مفتاح API أولاً'); return; }
    }
    setAiTesting(true);
    const r = aiForm.apiKey.trim()
      ? await testAIKey(aiForm.apiKey.trim(), provider)
      : hasStored
        ? await testSavedAIModel(aiEditingId || undefined)
        : { ok: true };
    setAiTesting(false);
    if (r.ok) setAiMsg(`الاتصال يعمل — خدمة ${AI_PROVIDERS.find((p) => p.id === provider)?.label || provider} متاحة`);
    else setAiErr(r.error || 'تعذر التحقق من الاتصال');
  };
  const removeAIModelNow = (m: AIModelConfig) => {
    if (!window.confirm(`حذف النموذج «${m.name}»؟ سيُحذف مفتاحه نهائياً.`)) return;
    deleteAIModel(m.id);
    setAiMsg('تم حذف النموذج');
  };
  const onProviderChange = (p: AIProvider) => {
    setAiF({
      provider: p,
      model: aiForm.model && AI_PROVIDERS.find((x) => x.id === p)?.models.some((md) => md.id === aiForm.model) ? aiForm.model : (DEFAULT_MODEL[p] || ''),
    });
  };
  const aiKeyHint: Record<string, string> = Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, p.hint]));

  // ---- إعدادات تنبيهات تليجرام ----
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgToken, setTgToken] = useState('');
  const [tgTokenLoaded, setTgTokenLoaded] = useState(false);
  const [tgTokenVisible, setTgTokenVisible] = useState(false);
  const [tgSendPdf, setTgSendPdf] = useState(true);
  const [tgChatIds, setTgChatIds] = useState<string[]>([]);
  const [tgPurchaseChatIds, setTgPurchaseChatIds] = useState<string[]>([]);
  const [tgPurchaseEnabled, setTgPurchaseEnabled] = useState(false);
  const [tgPurchaseToken, setTgPurchaseToken] = useState('');
  const [tgPurchaseTokenLoaded, setTgPurchaseTokenLoaded] = useState(false);
  const [tgPurchaseTokenVisible, setTgPurchaseTokenVisible] = useState(false);
  const [tgDiscovered, setTgDiscovered] = useState<{ id: string; title: string }[]>([]);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgMsg, setTgMsg] = useState('');
  const [tgErr, setTgErr] = useState('');
  const [tgNewChat, setTgNewChat] = useState('');
  const [tgPurchaseNewChat, setTgPurchaseNewChat] = useState('');
  const [tgPTestLoading, setTgPTestLoading] = useState(false);
  const [tgPMsg, setTgPMsg] = useState('');
  const [tgPErr, setTgPErr] = useState('');

  const token = () => localStorage.getItem('rcerp_token');
  const api = async (path: string, body?: unknown) => {
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    return res.json();
  };

  useEffect(() => {
    api('/api/telegram/settings').then((j) => {
      if (j.ok) {
        setTgEnabled(!!j.enabled);
        setTgChatIds(Array.isArray(j.chatIds) ? j.chatIds : []);
        setTgPurchaseChatIds(Array.isArray(j.purchaseChatIds) ? j.purchaseChatIds : []);
        setTgPurchaseEnabled(!!j.purchaseEnabled);
        setTgPurchaseTokenLoaded(!!j.purchaseHasToken);
        setTgPurchaseToken(j.purchaseMaskedToken || '');
        setTgSendPdf(j.sendPdf !== false);
        setTgTokenLoaded(!!j.hasToken);
        setTgToken(j.maskedToken || '');
      }
    }).catch(() => {});
  }, []);

  const saveTelegram = async () => {
    setTgErr('');
    setTgMsg('جارٍ حفظ الإعدادات...');
    setTgLoading(true);
    let j: { ok?: boolean; chatCount?: number; hasToken?: boolean; error?: string };
    try {
      j = await api('/api/telegram/settings', {
        enabled: tgEnabled,
        botToken: tgToken && !tgToken.includes('…') ? tgToken : undefined,
        chatIds: tgChatIds,
        purchaseEnabled: tgPurchaseEnabled,
        purchaseBotToken: tgPurchaseToken && !tgPurchaseToken.includes('…') ? tgPurchaseToken : undefined,
        purchaseChatIds: tgPurchaseChatIds,
        sendPdf: tgSendPdf,
      });
    } catch {
      setTgLoading(false);
      setTgErr('انتهت مهلة الاتصال بالخادم (30 ثانية) — تحقق من الشبكة وأعد المحاولة');
      return;
    }
    setTgLoading(false);
    if (j.ok) {
      setTgMsg(`تم حفظ الإعدادات — ${j.chatCount} جهاز مستلم، ${tgSendPdf ? 'مع إرسال ملف PDF الجرد' : 'بدون PDF'}`);
      setTgTokenLoaded(!!j.hasToken);
    } else setTgErr(j.error || 'تعذر الحفظ');
  };

  const discoverChats = async () => {
    setTgErr('');
    setTgMsg('جارِ الاتصال بتليجرام لجلب الأجهزة... قد يستغرق عدة ثوانٍ');
    setTgLoading(true);
    let j: { ok?: boolean; chats?: { id: string; title: string }[]; error?: string };
    try {
      j = await api('/api/telegram/get-chat-ids');
    } catch {
      setTgLoading(false);
      setTgErr('انتهت مهلة الاتصال بتليجرام (30 ثانية) — تحقق من الإنترنت وأعد المحاولة');
      return;
    }
    setTgLoading(false);
    if (j.ok) {
      const chats = Array.isArray(j.chats) ? j.chats : [];
      setTgDiscovered(chats);
      const newOnes = chats.map((c: { id: string }) => String(c.id)).filter((id: string) => !tgChatIds.includes(id));
      if (newOnes.length) setTgChatIds((p) => [...p, ...newOnes]);
      setTgMsg(`${chats.length} جهاز تواصل مع البوت${newOnes.length ? ` — أُضيف ${newOnes.length} جديد تلقائياً` : ''}`);
    } else setTgErr(j.error || 'فشل جلب الأجهزة');
  };

  const discoverPurchaseChats = async () => {
    setTgPErr('');
    setTgPMsg('جارِ الاتصال بتليجرام لجلب مجموعات بوت المشتريات... قد يستغرق عدة ثوانٍ');
    setTgLoading(true);
    let j: { ok?: boolean; chats?: { id: string; title: string }[]; error?: string };
    try {
      j = await api('/api/telegram/get-chat-ids', { channel: 'purchase' });
    } catch {
      setTgLoading(false);
      setTgPErr('انتهت مهلة الاتصال بتليجرام (30 ثانية) — تحقق من الشبكة وأعد المحاولة');
      return;
    }
    setTgLoading(false);
    if (j.ok) {
      const chats = Array.isArray(j.chats) ? j.chats : [];
      const newOnes = chats.map((c: { id: string }) => String(c.id)).filter((id: string) => !tgPurchaseChatIds.includes(id));
      if (newOnes.length) setTgPurchaseChatIds((p) => [...p, ...newOnes]);
      setTgPMsg(`${chats.length} محادثة لبوت المشتريات${newOnes.length ? ` — أُضيفت ${newOnes.length} جديدة تلقائياً` : ''}`);
    } else setTgPErr(j.error || 'فشل جلب المجموعات');
  };

  const testTelegramBtn = async () => {
    setTgErr('');
    setTgMsg('جارِ إرسال رسالة الاختبار إلى تليجرام... قد يستغرق عدة ثوانٍ');
    setTgLoading(true);
    let j: { ok?: boolean; error?: string };
    try {
      j = await api('/api/telegram/test');
    } catch {
      setTgLoading(false);
      setTgErr('انتهت مهلة الاتصال بالخادم (30 ثانية) — تحقق من الشبكة وأعد المحاولة');
      return;
    }
    setTgLoading(false);
    if (j.ok) setTgMsg('رسالة اختبار أُرسلت بنجاح إلى جوالك');
    else setTgErr(j.error || 'فشل إرسال رسالة الاختبار');
  };

  const testPurchaseBot = async () => {
    setTgPErr('');
    setTgPMsg('جارِ إرسال رسالة الاختبار إلى بوت المشتريات المستقل...');
    setTgPTestLoading(true);
    let j: { ok?: boolean; error?: string };
    try {
      j = await api('/api/telegram/test', { channel: 'purchase' });
    } catch {
      setTgPTestLoading(false);
      setTgPErr('انتهت مهلة الاتصال بتليجرام (30 ثانية) — تحقق من الشبكة وأعد المحاولة');
      return;
    }
    setTgPTestLoading(false);
    if (j.ok) setTgPMsg('رسالة اختبار أُرسلت بنجاح إلى مجموعة المشتريات عبر بوت المشتريات المستقل');
    else setTgPErr(j.error || 'فشل إرسال رسالة الاختبار');
  };

  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<SystemCheckResult[] | null>(null);
  const [rebuildResult, setRebuildResult] = useState<SystemRebuildResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [backupState, setBackupState] = useState<{ loading: boolean; count: number; lastDate: string | null; error: string }>({ loading: true, count: 0, lastDate: null, error: '' });
  useEffect(() => {
    api('/api/backups')
      .then((j) => {
        const list = Array.isArray(j?.backups) ? j.backups as { createdAt?: string }[] : [];
        setBackupState({ loading: false, count: list.length, lastDate: list.length && list[0]?.createdAt ? list[0].createdAt : null, error: '' });
      })
      .catch(() => setBackupState((p) => ({ ...p, loading: false, error: 'تعذر الاتصال بخدمة النسخ الاحتياطية' })));
  }, []);
  const backupAge = useMemo(() => {
    if (!backupState.lastDate) return null;
    const ms = Date.now() - new Date(backupState.lastDate).getTime();
    if (ms < 0) return 'الآن';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return mins <= 1 ? 'منذ دقيقة' : `منذ ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs <= 1 ? 'منذ ساعة' : `منذ ${hrs} ساعة`;
    const days = Math.floor(hrs / 24);
    return days <= 1 ? 'منذ يوم' : `منذ ${days} يوم`;
  }, [backupState.lastDate]);
  const backupHealth = backupState.loading ? 'busy' : !backupState.lastDate ? 'none' : (Date.now() - new Date(backupState.lastDate).getTime() < 7 * 24 * 3600 * 1000 ? 'fresh' : 'stale');

  const [serverState, setServerState] = useState<{ loading: boolean; ok: boolean | null; rev: number; boot: number; ms: number | null; error: string }>({ loading: true, ok: null, rev: 0, boot: 0, ms: null, error: '' });
  const checkServer = () => {
    setServerState((p) => ({ ...p, loading: true, error: '' }));
    const token = localStorage.getItem('rcerp_token');
    const start = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch('/api/sync-state', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => setServerState({ loading: false, ok: !!j?.ok, rev: j?.rev || 0, boot: j?.boot || 0, ms: Math.round(performance.now() - start), error: '' }))
      .catch(() => setServerState((p) => ({ ...p, loading: false, ok: false, ms: Math.round(performance.now() - start), error: 'لا يوجد اتصال بالخادم — تحقق من أن الخادم يعمل على هذا الجهاز' })))
      .finally(() => clearTimeout(timer));
  };
  useEffect(() => { checkServer(); }, []);

  const [netInfo, setNetInfo] = useState<NetworkInfo | null>(null);
  const [netError, setNetError] = useState('');
  const [netSaving, setNetSaving] = useState(false);
  const [netMsg, setNetMsg] = useState('');

  const loadNetwork = () => {
    setNetError('');
    const token = localStorage.getItem('rcerp_token');
    fetch('/api/network', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.json())
      .then((j) => j.ok ? setNetInfo(j) : setNetError(j.error || 'تعذر قراءة حالة الشبكة'))
      .catch(() => setNetError('تعذر الاتصال بالخادم'));
  };

  useEffect(() => { loadNetwork(); }, []);

  const setHost = (host: string) => {
    setNetError('');
    setNetMsg('');
    setNetSaving(true);
    const token = localStorage.getItem('rcerp_token');
    fetch('/api/network/set-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ host }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setNetMsg(host === '0.0.0.0'
            ? 'تم تفعيل الوصول عبر الإنترنت — أعد تشغيل الخادم (من مشغّل النظام) ليصبح سارياً، ثم استخدم Cloudflare Tunnel كخطوة أخيرة.'
            : 'تم إيقاف الوصول الخارجي — أعد تشغيل الخادم ليصبح الخادم محلياً فقط.');
          setNetInfo((p) => (p ? { ...p, host, public: host !== '127.0.0.1' } : p));
        } else {
          setNetError(j.error || 'تعذر الحفظ');
        }
      })
      .catch(() => setNetError('تعذر الاتصال بالخادم'))
      .finally(() => setNetSaving(false));
  };

  const readFile = (file: File | undefined) => {
    setError('');
    setSavedMsg('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('الرجاء اختيار ملف صورة (JPG أو PNG أو WEBP)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('حجم الصورة كبير جداً — الحد الأقصى 2 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result || ''));
    reader.onerror = () => setError('تعذر قراءة الملف — جرّب صورة أخرى');
    reader.readAsDataURL(file);
  };

  const save = () => {
    setError('');
    setSavedMsg('');
    if (!preview) { setError('اختر صورة شعار أولاً'); return; }
    setLogo(preview);
    setSavedMsg('تم حفظ شعار النظام بنجاح — يظهر الآن في الواجهة والتقارير');
  };

  const remove = () => {
    setLogo('');
    setPreview(null);
    setSavedMsg('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const runCheck = () => {
    setChecking(true);
    setRebuildResult(null);
    // defer so the spinner paints before the synchronous battery finishes
    setTimeout(() => {
      setCheckResults(runSystemCheck());
      setChecking(false);
    }, 60);
  };

  const doRebuild = () => {
    setConfirmOpen(false);
    setChecking(true);
    setTimeout(() => {
      const r = rebuildSystem();
      setRebuildResult(r);
      setCheckResults(runSystemCheck());
      setChecking(false);
    }, 60);
  };

  const okCount = checkResults?.filter((c) => c.status === 'ok').length ?? 0;
  const warnCount = checkResults?.filter((c) => c.status === 'warn').length ?? 0;
  const failCount = checkResults?.filter((c) => c.status === 'fail').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="إعدادات النظام"
        subtitle="الشعار والهوية البصرية، فحص تكامل النماذج، وإعادة هيكلة وترميم البيانات"
        icon={<ShieldCheck className="w-5 h-5" />}
      />

      {onNavigate && (
        <Card className="p-4">
          <SectionHeader
            title="تفريغ بيانات محدد (حذف مجمع للجداول)"
            subtitle="اختر نوع البيانات المطلوب تفريغها فقط (طلبات، مصاريف، مخزون، عملاء...) دون مسح النظام كاملاً — يتطلب صلاحية مسؤول النظام"
            icon={<Trash2 className="w-5 h-5 text-rose-500" />}
            extra={<Btn tone="danger" onClick={() => onNavigate('system_center')}><Trash2 className="w-4 h-4" /> فتح شاشة التفريغ المحدد</Btn>}
          />
        </Card>
      )}

      <Card>
        <SectionHeader
          title="التصدير عبر الإنترنت (الخادم المحلي)"
          subtitle="بياناتك تبقى محفوظة 100% على هذا الجهاز — الخادم هنا، والمتصفحات الخارجية تعمل كعملاء متصلين به"
          icon={<Globe className="w-4 h-4 text-brand-500" />}
          extra={<Btn onClick={loadNetwork} tone="ghost"><RefreshCw className="w-4 h-4" /> تحديث</Btn>}
        />

        {netInfo ? (
          <div className="mt-4 space-y-4">
            <div className="grid sm:grid-cols-2 gap-2">
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${netInfo.public ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${netInfo.public ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                  {netInfo.public ? <Wifi className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">حالة الوصول</p>
                  <p className="text-[11px] font-bold text-slate-500">{netInfo.public ? 'الخادم يستقبل الاتصالات الخارجية (المنفذ ' + netInfo.port + ')' : 'محلي فقط على هذا الجهاز'}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 mb-1.5">عناوين الوصول من نفس الشبكة (LAN)</p>
                <div className="flex flex-wrap gap-1.5">
                  {netInfo.localIPs.length > 0 ? netInfo.localIPs.map((ip) => (
                    <span key={ip.address} dir="ltr" className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200">{ip.address}:{netInfo.port}</span>
                  )) : <span className="text-[11px] font-bold text-slate-400">لا توجد واجهات شبكة نشطة</span>}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {!netInfo.public ? (
                <Btn onClick={() => setHost('0.0.0.0')} disabled={netSaving} tone="primary">
                  <Wifi className="w-4 h-4" /> تفعيل الوصول الخارجي
                </Btn>
              ) : (
                <Btn onClick={() => setHost('127.0.0.1')} disabled={netSaving} tone="danger">
                  <Power className="w-4 h-4" /> إيقاف الوصول الخارجي (محلي فقط)
                </Btn>
              )}
            </div>

            {netMsg && <p className="text-xs font-bold text-emerald-600">{netMsg}</p>}
            {netError && <p className="text-xs font-bold text-rose-600">{netError}</p>}

            <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-xl p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-500" />
              <span>
                للوصول من الإنترنت بأمان (مع بقاء البيانات على هذا الجهاز): فعّل الوصول الخارجي، أعد تشغيل الخادم،
                ثم شغّل <b dir="ltr">cloudflared tunnel</b> لربط النظام برابط HTTPS عام بدون فتح أي منفذ على الراوتر.
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs font-bold text-brand-600 flex items-center gap-2">
            {netError ? <AlertTriangle className="w-4 h-4 text-rose-500" /> : <Loader2 className="w-4 h-4 animate-spin" />}
            {netError || 'جارٍ قراءة حالة الشبكة...'}
          </p>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="الذكاء الاصطناعي — نماذج متعددة"
          subtitle="أضف أكثر من نموذج، ولكل نموذج مفتاح API ومزوّد مستقل تماماً (لا يتسرب مفتاح نموذج إلى نموذج آخر). اختر نموذجاً افتراضياً، ولكل شاشة ذكاء اصطناعي قائمة اختيار خاصة بها. الإعدادات محفوظة على الخادم وتُشارك بين الأجهزة المتصلة"
          icon={<Sparkles className="w-4 h-4 text-purple-500" />}
        />

        <div className="mt-4 space-y-3">
          {aiModels.length === 0 && (
            <p className="text-xs font-bold text-slate-400 py-2">لا توجد نماذج — أضف نموذجك الأول.</p>
          )}
          {aiModels.map((m) => {
            const p = AI_PROVIDERS.find((x) => x.id === m.provider);
            const isActive = m.id === activeAIModelId;
            return (
              <div key={m.id} className={`flex items-start justify-between gap-3 border rounded-xl px-4 py-3 ${isActive ? 'border-violet-300 bg-violet-50/60 dark:bg-violet-900/10' : 'border-slate-200 bg-slate-50/60 dark:bg-slate-800/40'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-slate-800 text-sm">{m.name || 'نموذج'}</span>
                    {isActive && <span className="text-[10px] font-black bg-violet-600 text-white px-2 py-0.5 rounded-full">الافتراضي</span>}
                    {!m.enabled && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">معطّل</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-slate-500 font-bold">
                    <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3 text-violet-500" /> {p?.label || m.provider}</span>
                    {m.model && <span className="font-mono dir-ltr">{m.model}</span>}
                    {m.provider === 'custom' && m.baseURL && <span className="text-[10px] truncate max-w-[220px] font-mono dir-ltr">{m.baseURL}</span>}
                  </div>
                  <div className="mt-1 text-[10px] font-bold">
                    {m.provider === 'local' ? (
                      <span className="text-slate-400">تحليل محلي — دون إنترنت</span>
                    ) : m.provider === 'custom' ? (
                      m.baseURL ? <span className="text-emerald-600">خادم مخصص مهيأ</span> : <span className="text-amber-600">ينقصه Base URL</span>
                    ) : m.apiKey || m.hasKey ? (
                      <span className="text-emerald-600">المفتاح مضبوط — لا يُعرض</span>
                    ) : (
                      <span className="text-amber-600">ينقصه مفتاح API</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isActive && (
                    <button onClick={() => { setActiveAIModel(m.id); setAiMsg('تم تعيين النموذج الافتراضي'); }} className="p-2 rounded-lg text-slate-400 hover:text-violet-700 hover:bg-violet-100 transition-colors" title="تعيين كنموذج افتراضي"><Star className="w-4 h-4" /></button>
                  )}
                  <button onClick={() => openEditModel(m)} className="p-2 rounded-lg text-slate-400 hover:text-brand-700 hover:bg-brand-100 transition-colors" title="تعديل النموذج"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => removeAIModelNow(m)} className="p-2 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-100 transition-colors" title="حذف النموذج"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}

          <Btn onClick={openAddModel} tone="primary"><Plus className="w-4 h-4" /> إضافة نموذج</Btn>

          {aiMsg && <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {aiMsg}</p>}
          {aiErr && <p className="text-xs font-bold text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {aiErr}</p>}

          <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-purple-500" />
            <span>
              كل نموذج يحمل مفتاحه ومزوّده وموديله دون أن يشاركها مع غيره. عند فتح شاشة ذكاء اصطناعي تعمل بالنموذج الافتراضي
              (الكعكة <b>الافتراضي</b>) ما لم تختَر نموذجاً محدداً من القائمة داخل الشاشة نفسها.
              بيانات النظام المالية/المخزنية لا تُرسل — نُرسل فقط ملخصات مؤشرات محدودة حسب الشاشة.
              للحصول على مفتاح <b dir="ltr">Gemini</b> مجاني: <b dir="ltr">aistudio.google.com/apikey</b> (يبدأ بـ AIza).
            </span>
          </div>
        </div>
      </Card>

      {/* نافذة إضافة/تعديل نموذج */}
      <Modal open={aiModalOpen} onClose={() => setAiModalOpen(false)} title={aiEditingId ? 'تعديل النموذج' : 'إضافة نموذج ذكاء اصطناعي'} wide>
        <div className="space-y-3">
          <Field label="اسم النموذج (لتمييزه في القوائم)">
            <input type="text" value={aiForm.name} onChange={(e) => setAiF({ name: e.target.value })} placeholder="مثال: تحليل المخزون / التقارير التنفيذية / موديل المساء" className={inputCls} />
          </Field>
          <Field label="مزوّد الذكاء الاصطناعي">
            <select value={aiForm.provider} onChange={(e) => onProviderChange(e.target.value as AIProvider)} className={inputCls}>
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] font-bold text-slate-500">{aiKeyHint[aiForm.provider]}</p>
          </Field>
          {aiForm.provider === 'custom' && (
            <Field label="عنوان الخادم (Base URL)">
              <input dir="ltr" type="text" value={aiForm.baseURL} onChange={(e) => setAiF({ baseURL: e.target.value })} placeholder="http://localhost:11434/v1" className={inputCls + ' font-mono'} />
              <p className="mt-1 text-[11px] font-bold text-slate-500">أمثلة: <span dir="ltr">http://localhost:11434/v1</span> (Ollama) أو <span dir="ltr">https://api.deepseek.com</span> — أي مزوّد متوافق مع OpenAI API.</p>
            </Field>
          )}
          {aiForm.provider === 'custom' || aiForm.provider === 'local' ? (
            aiForm.provider === 'custom' && (
              <Field label="اسم النموذج (حر)">
                <input dir="ltr" type="text" value={aiForm.model} onChange={(e) => setAiF({ model: e.target.value })} placeholder="deepseek-chat / llama3.2 / gpt-4o..." className={inputCls} />
              </Field>
            )
          ) : (
            <Field label="النموذج">
              <select value={aiForm.model} onChange={(e) => setAiF({ model: e.target.value })} className={inputCls}>
                {AI_PROVIDERS.find((p) => p.id === aiForm.provider)?.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label={aiForm.provider === 'custom' ? 'مفتاح API (اختياري للموارد المحلية)' : 'مفتاح API'}>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={aiForm.apiKey}
                onChange={(e) => setAiF({ apiKey: e.target.value })}
                disabled={aiForm.provider === 'local'}
                dir="ltr"
                className={inputCls + ' pl-9 font-mono'}
                placeholder={aiEditingId && aiEditingHasKey ? 'مفتاح محفوظ على الخادم — اتركه فارغاً للإبقاء' : AI_PROVIDERS.find((p) => p.id === aiForm.provider)?.keyPlaceholder}
              />
              <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title={showKey ? 'إخفاء المفتاح' : 'إظهار المفتاح'}>
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] font-bold text-slate-500">يُحفظ على الخادم فقط ولا يُعرض لأي جهاز آخر.</p>
          </Field>
          <label className="flex items-center gap-2.5 cursor-pointer select-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <input type="checkbox" checked={aiForm.enabled} onChange={(e) => setAiF({ enabled: e.target.checked })} className="w-4 h-4 accent-brand-600" />
            <div>
              <span className="text-xs font-extrabold text-slate-900 block">تفعيل هذا النموذج</span>
              <span className="text-[11px] font-bold text-slate-500">عند التعطيل تتحول الشاشات التي تستخدمه إلى التحليل الآلي المحلي</span>
            </div>
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <Btn onClick={saveAIModel} tone="primary"><Save className="w-4 h-4" /> {aiEditingId ? 'حفظ التعديلات' : 'إضافة النموذج'}</Btn>
            <Btn onClick={() => { void testModelConfig(); }} disabled={aiTesting} tone="ghost">
              {aiTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} اختبار الاتصال
            </Btn>
          </div>
          {aiMsg && <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {aiMsg}</p>}
          {aiErr && <p className="text-xs font-bold text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {aiErr}</p>}
        </div>
      </Modal>

      <Card className="p-4">
        <SectionHeader title="إعداد نسبة ضريبة القيمة المضافة (VAT)" subtitle="تعيين نسبة الضريبة المطبقة على المبيعات والفواتير في النظام" icon={<Globe className="w-5 h-5 text-brand-500" />} />
        {vatMsg && <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl p-3">{vatMsg}</div>}
        <div className="mt-4 flex items-center gap-3">
          <div className="w-48">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">نسبة الضريبة %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={vatVal}
              onChange={(e) => setVatVal(parseFloat(e.target.value) || 0)}
              className={inputCls}
            />
          </div>
          <div className="mt-5">
            <Btn onClick={saveVat}><Save className="w-4 h-4" /> حفظ نسبة الضريبة</Btn>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="خصم المبيعات من المخزون" subtitle="عند التفعيل: كل عملية بيع (نقطة بيع + بيع مجمعة) تُخصم المواد الخام من المخزون تلقائياً. عند التعطيل: المبيعات لا تؤثر على المخزون وتكلفة المبيعات تُحسب بالجرد (الجرد أول + المشتريات - الجرد آخر)" icon={<Hash className="w-5 h-5 text-brand-500" />} />
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {([
            { key: true as const, label: 'مفعّل', hint: 'المبيعات تُخصم من المخزون تلقائياً (يتطلب التنشيط اليدوي)' },
            { key: false as const, label: 'معطّل', hint: 'المبيعات لا تؤثر على المخزون — تكلفة المبيعات بالجرد (الوضع الافتراضي)' },
          ]).map((opt) => (
            <button key={String(opt.key)} onClick={() => setDeductSalesFromInventory(opt.key)}
              className={`text-right rounded-xl border px-4 py-3 transition-colors ${deductSalesFromInventory === opt.key ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30 ring-1 ring-brand-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className={`text-xs font-extrabold ${deductSalesFromInventory === opt.key ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-slate-100'}`}>{opt.label}</span>
                {deductSalesFromInventory === opt.key && <CheckCircle2 className="w-4 h-4 text-brand-600" />}
              </span>
              <span className="block mt-1.5 text-[11px] font-bold text-slate-500">{opt.hint}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="تنسيق الأرقام المعروضة" subtitle="اختر شكل الأرقام في كامل الشاشات والتقارير المطبوعة (المبالغ، الكميات، النسب)" icon={<Hash className="w-5 h-5 text-brand-500" />} />
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {([
            { key: 'en' as const, label: 'أرقام إنجليزية', sample: '12,500.00 ر.س', hint: '1234567890 — الموصى به للتقارير وExcel' },
            { key: 'ar' as const, label: 'أرقام عربية', sample: '١٢٬٥٠٠٫٠٠ ر.س', hint: '٠١٢٣٤٥٦٧٨٩ — التنسيق العربي التقليدي' },
          ]).map((opt) => (
            <button key={opt.key} onClick={() => setNumerals(opt.key)}
              className={`text-right rounded-xl border px-4 py-3 transition-colors ${numerals === opt.key ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30 ring-1 ring-brand-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className={`text-xs font-extrabold ${numerals === opt.key ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-slate-100'}`}>{opt.label}</span>
                {numerals === opt.key && <CheckCircle2 className="w-4 h-4 text-brand-600" />}
              </span>
              <span dir={opt.key === 'en' ? 'ltr' : 'rtl'} className="block mt-1.5 font-mono text-lg font-extrabold text-slate-800 dark:text-slate-200">{opt.sample}</span>
              <span className="block mt-1 text-[11px] font-bold text-slate-500">{opt.hint}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="وضع الكثافة" subtitle="تحكم في كثافة المساحات والجداول — مريح للشاشات الكبيرة ومضغوط للمراقبة اليومية" icon={<Wrench className="w-5 h-5 text-brand-500" />} />
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {([
            { key: 'comfortable' as const, label: 'مريح', sample: 'مساحات واسعة', hint: 'أفضل للشاشات الكبيرة وعرض التقارير' },
            { key: 'compact' as const, label: 'مضغوط', sample: 'كثافة أعلى', hint: 'يعرض صفوفاً أكثر في الجداول — للمراقبة اليومية' },
          ]).map((opt) => (
            <button key={opt.key} onClick={() => setDensity(opt.key)}
              className={`text-right rounded-xl border px-4 py-3 transition-colors ${density === opt.key ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30 ring-1 ring-brand-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className={`text-xs font-extrabold ${density === opt.key ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-slate-100'}`}>{opt.label}</span>
                {density === opt.key && <CheckCircle2 className="w-4 h-4 text-brand-600" />}
              </span>
              <span className="block mt-1.5 text-[11px] font-bold text-slate-500">{opt.sample}</span>
              <span className="block mt-1 text-[11px] font-bold text-slate-500">{opt.hint}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="التقويم الهجري في التواريخ" subtitle="عند التفعيل تظهر كل التواريخ في الشاشات والتقارير بالهجري (أم القرى)، مع بقاء الميلادي ظاهراً عند تمرير المؤشر" icon={<CalendarDays className="w-5 h-5 text-emerald-500" />} extra={
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[11px] font-bold text-slate-500">{hijriMode ? 'هجري' : 'ميلادي'}</span>
            <span className={`relative inline-flex w-11 h-6 rounded-full transition-colors ${hijriMode ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <input type="checkbox" checked={hijriMode} onChange={(e) => setHijriMode(e.target.checked)} className="sr-only" />
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${hijriMode ? 'left-5' : 'left-0.5'}`} />
            </span>
          </label>
        } />
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <div className={`rounded-xl border px-4 py-3 ${hijriMode ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 bg-white dark:bg-slate-800 opacity-60'}`}>
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">عرض هجري (أم القرى)</span>
            <span dir="rtl" className="block mt-1.5 font-mono text-lg font-extrabold text-emerald-700 dark:text-emerald-300">١٤٤٧/٩/١٦ هـ — يومياً</span>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${!hijriMode ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 bg-white dark:bg-slate-800 opacity-60'}`}>
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">عرض ميلادي</span>
            <span dir="ltr" className="block mt-1.5 font-mono text-lg font-extrabold text-slate-800 dark:text-slate-200">2026/09/19</span>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="تنبيهات تليجرام الواردة" subtitle="عند حفظ جرد يومي من الجوال أو مبيعات أو هدر — يُرسَل إشعار لجميع الأجهزة المسجلة + ملف PDF للجرد" icon={<Wifi className="w-5 h-5 text-sky-500" />} extra={
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[11px] font-bold text-slate-500">{tgEnabled ? 'مفعّل' : 'معطّل'}</span>
            <span className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${tgEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} className="sr-only" />
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${tgEnabled ? 'left-5' : 'left-0.5'}`} />
            </span>
          </label>
        } />
        <div className="mt-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="توكن البوت (من BotFather)">
              <div className="relative">
                <input
                  type={tgTokenVisible ? 'text' : 'password'}
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                  dir="ltr"
                  placeholder={tgTokenLoaded ? '— محفوظ — اتركه كما هو أو استبدله —' : '1234567890:AAH...'}
                  className={inputCls + ' pl-9 font-mono'}
                />
                <button type="button" onClick={() => setTgTokenVisible((v) => !v)} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title={tgTokenVisible ? 'إخفاء' : 'إظهار'}>
                  {tgTokenVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] font-bold text-slate-500">أنشئ البوت عبر رسالة <b dir="ltr">/newbot</b> إلى <b dir="ltr">@BotFather</b> ثم انسخ التوكن</p>
            </Field>
            <Field label="الأجهزة المستلمة (chat IDs)">
              <div className="flex flex-col gap-1.5 min-h-[42px]">
                {tgChatIds.length === 0 && <span className="text-[11px] font-bold text-slate-400 py-2">لا توجد أجهزة بعد — فعّل البوت وابدأ محادثة من الجهاز ثم «جلب الأجهزة»</span>}
                {tgChatIds.map((cid) => (
                  <div key={cid} className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5">
                    <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200" dir="ltr">{cid}</span>
                    <button type="button" onClick={() => setTgChatIds((p) => p.filter((x) => x !== cid))} className="text-rose-500 hover:text-rose-700" title="إزالة"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-1.5">
                <input value={tgNewChat} onChange={(e) => setTgNewChat(e.target.value)} dir="ltr" placeholder="معرّف يدوي..." className={inputCls + ' font-mono text-xs'} />
                <Btn tone="ghost" onClick={() => { const v = tgNewChat.trim(); if (v && !tgChatIds.includes(v)) { setTgChatIds((p) => [...p, v]); } setTgNewChat(''); }}>
                  <Plus className="w-4 h-4" /> أضف
                </Btn>
              </div>
</Field>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl px-4 py-3">
            <input type="checkbox" checked={tgSendPdf} onChange={(e) => setTgSendPdf(e.target.checked)} className="w-4 h-4 accent-sky-600" />
            <div>
              <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 block">إرسال ملف PDF الجرد كمرفق</span>
              <span className="text-[11px] font-bold text-slate-500">تُرسَل رسالة نصية دائماً، وإذا فعّلت هذا يُرفق ملف الجرد PDF لكل جرد يومي</span>
            </div>
          </label>

          <div className="flex flex-wrap gap-2">
            <Btn onClick={saveTelegram} disabled={tgLoading} tone="primary">
              {tgLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ الإعدادات
            </Btn>
            <Btn onClick={discoverChats} disabled={tgLoading} tone="ghost">
              <RefreshCw className="w-4 h-4" /> جلب الأجهزة تلقائياً
            </Btn>
            <Btn onClick={testTelegramBtn} disabled={tgLoading} tone="ghost">
              <Send className="w-4 h-4" /> إرسال رسالة اختبار
            </Btn>
          </div>

          {tgMsg && <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {tgMsg}</p>}
          {tgErr && <p className="text-xs font-bold text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {tgErr}</p>}

          {tgDiscovered.length > 0 && (
            <div className="bg-brand-50/60 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-xl p-3">
              <p className="text-[11px] font-extrabold text-brand-700 dark:text-brand-300 mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> الأجهزة المتاحة:</p>
              <div className="flex flex-wrap gap-1.5">
                {tgDiscovered.map((d) => (
                  <span key={d.id} className="text-[10px] font-bold bg-white dark:bg-slate-800 border border-brand-200 dark:border-brand-700 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                    {d.title}
                    {tgChatIds.includes(d.id) ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-rose-400" />}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-500" />
            <span>
              حتى يصل الإشعار لجهاز، افتح تليجرام على هذا الجهاز وابدأ محادثة مع البوت (اضغط <b dir="ltr">/start</b>) ثم اضغط «جلب الأجهزة تلقائياً» — يُضاف تلقائياً لكل الأجهزة التي تتحدث مع البوت.
              <b> ملاحظة:</b> التوجيه يعتمد على معرّف المحادثة (chat_id) وليس رقم الهاتف.
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader
          title="بوت طلبات الشراء المستقل"
          subtitle="بوت منفصل يرسل طلبات الشراء وأوامر التوريد المبدئية إلى مجموعة المشتريات — أنشئه من BotFather وأضِف التوكن أدناه"
          icon={<BadgeDollarSign className="w-5 h-5 text-emerald-500" />}
          extra={
            <label className="flex items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={tgPurchaseEnabled}
                onChange={(e) => { setTgPurchaseEnabled(e.target.checked); setTgPMsg(''); setTgPErr(''); }}
                className="w-4 h-4 accent-emerald-600"
              />
              تفعيل البوت المستقل
            </label>
          }
        />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="توكن بوت المشتريات">
            <div className="flex gap-1.5">
              <div className="flex-1 relative">
                <input
                  type={tgPurchaseTokenVisible ? 'text' : 'password'}
                  dir="ltr"
                  value={tgPurchaseToken}
                  onChange={(e) => { setTgPurchaseToken(e.target.value); setTgPurchaseTokenLoaded(false); }}
                  placeholder={tgPurchaseTokenLoaded ? 'تم الحفظ سابقاً' : '123456789:AA...'}
                  className={inputCls + ' font-mono text-xs pl-9 pr-9'}
                />
                {tgPurchaseTokenLoaded && tgPurchaseToken && (
                  <button type="button"
                    onClick={() => { setTgPurchaseToken(''); setTgPurchaseTokenLoaded(false); }}
                    title="حذف التوكن المحفوظ" className="absolute right-2 top-1/2 -translate-y-1/2 text-rose-400 hover:text-rose-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <span title="إظهار التوكن">
                <Btn tone="ghost" onClick={() => setTgPurchaseTokenVisible((v) => !v)}>
                  <Eye className="w-4 h-4" />
                </Btn>
              </span>
            </div>
            <p className="text-[11px] font-bold text-slate-500 mt-1.5">@MassobiPurchasing_bot — التوكن يُعرض مختصراً بعد الحفظ وسيُرسل كل شيء للمجموعات المحددة أدناه فقط.</p>
          </Field>

          <Field label="مجموعة المشتريات (chat ID)">
            <p className="text-[11px] font-bold text-slate-500 mb-2">أضِف @MassobiPurchasing_bot إلى مجموعة المشتريات ثم اضغط «جلب مجموعات بوت المشتريات» — سيُكتشف المعرّف تلقائياً حتى دون كتابة رسالة، وستُضاف المجموعات فقط (لن يُرسَل إلى رقمك الشخصي).</p>
            <div className="flex flex-col gap-1.5 min-h-[42px]">
              {tgPurchaseChatIds.length === 0 && <span className="text-[11px] font-bold text-slate-400 py-2">لا توجد مجموعة شراء بعد — أضف المعرّف يدوياً أو من «جلب المجموعات»</span>}
              {tgPurchaseChatIds.map((cid) => (
                <div key={cid} className="flex items-center justify-between gap-2 bg-emerald-50 dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 rounded-lg px-3 py-1.5">
                  <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200" dir="ltr">{cid}</span>
                  <button type="button" onClick={() => setTgPurchaseChatIds((p) => p.filter((x) => x !== cid))} className="text-rose-500 hover:text-rose-700" title="إزالة"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1.5">
              <input value={tgPurchaseNewChat} onChange={(e) => setTgPurchaseNewChat(e.target.value)} dir="ltr" placeholder="معرّف مجموعة الشراء (غالباً يبدأ بـ -100...)" className={inputCls + ' font-mono text-xs'} />
              <Btn tone="ghost" onClick={() => { const v = tgPurchaseNewChat.trim(); if (v && !tgPurchaseChatIds.includes(v)) setTgPurchaseChatIds((p) => [...p, v]); setTgPurchaseNewChat(''); }}>
                <Plus className="w-4 h-4" /> أضف
              </Btn>
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Btn onClick={saveTelegram} disabled={tgLoading} tone="primary">
            {tgLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ الإعدادات
          </Btn>
          <Btn onClick={discoverPurchaseChats} disabled={tgLoading} tone="ghost">
            <RefreshCw className="w-4 h-4" /> جلب مجموعات بوت المشتريات
          </Btn>
          <Btn onClick={testPurchaseBot} disabled={tgPTestLoading} tone="ghost">
            {tgPTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} إرسال رسالة اختبار للمشتريات
          </Btn>
        </div>

        {tgPMsg && <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 mt-3"><CheckCircle2 className="w-4 h-4" /> {tgPMsg}</p>}
        {tgPErr && <p className="text-xs font-bold text-rose-600 flex items-center gap-1.5 mt-3"><AlertTriangle className="w-4 h-4" /> {tgPErr}</p>}
      </Card>

      <Card className="p-4">
        <SectionHeader title="العلامات العشرية المعروضة" subtitle="عدد الخانات العشرية في جميع المبالغ والكميات والنسب في النظام (0 = بدون كسور، 4 = أقصى دقة)" icon={<Hash className="w-5 h-5 text-brand-500" />} />
        <div className="mt-4 grid grid-cols-5 gap-3">
          {[0,1,2,3,4].map((d) => {
            const sample = 12345.6789;
            const shown = sample.toLocaleString(numerals === 'ar' ? 'ar-SA' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
            return (
              <button key={d} onClick={() => setDecimals(d)}
                className={`text-center rounded-xl border px-3 py-3 transition-colors ${decimals === d ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30 ring-1 ring-brand-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                <span className="flex items-center justify-center gap-1">
                  <span className={`text-xl font-extrabold font-mono ${decimals === d ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-slate-100'}`}>{d}</span>
                  {decimals === d && <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />}
                </span>
                <span dir={numerals === 'ar' ? 'rtl' : 'ltr'} className="block mt-1.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 truncate">{shown}</span>
                <span className="block text-[9px] font-bold text-slate-500">{d === 0 ? ' بدون كسور' : d + ' خانات'}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] font-bold text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> يُطبَّق تلقائياً على كل الشاشات والمطبوعات ويُحفظ لهذا الجهاز فوراً</p>
      </Card>

      <Card>
        <SectionHeader
          title="شعار النظام"
          subtitle="يظهر في أعلى الواجهة والقائمة الجانبية وصفحة تسجيل الدخول وفي رأس كل التقارير المطبوعة"
          icon={<ImagePlus className="w-4 h-4" />}
        />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="w-40 h-40 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
            {preview ? (
              <img src={preview} alt="شعار النظام" className="w-full h-full object-contain p-2" />
            ) : (
              <div className="text-center text-slate-400 p-4">
                <ImagePlus className="w-8 h-8 mx-auto mb-2" />
                <span className="text-[11px] font-bold">لا يوجد شعار</span>
              </div>
            )}
          </div>

          <div className="space-y-3 flex-1 w-full">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => readFile(e.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => inputRef.current?.click()} tone="primary">
                <ImagePlus className="w-4 h-4" /> اختيار صورة
              </Btn>
              {preview && preview !== logo && (
                <Btn onClick={save} tone="success">
                  <Save className="w-4 h-4" /> حفظ الشعار
                </Btn>
              )}
              {logo && (
                <Btn onClick={remove} tone="danger">
                  <Trash2 className="w-4 h-4" /> حذف الشعار
                </Btn>
              )}
            </div>

            {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
            {savedMsg && <p className="text-xs font-bold text-emerald-600">{savedMsg}</p>}

            <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-500" />
              <span>
                نصائح: يُفضّل صورة بخلفية شفافة (PNG) وبأبعاد مربعة. الحد الأقصى 2 ميجابايت.
                الشعار محفوظ على الخادم فيتشارك مع كل الأجهزة المتصلة بالنظام.
                لإظهار الشعار فوراً على أي جهاز متصل، حدّث الصفحة (Ctrl+F5).
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader
          title="فحص تكامل النماذج والترابط"
          subtitle="محرك تشخيصي يتحقق من الترابط بين كل النماذج (الوصفات ← الخامات، المخزون، الفواتير، القيود المحاسبية) وصحة الاحتسابات"
          icon={<Activity className="w-4 h-4 text-brand-500" />}
          extra={
            <Btn onClick={runCheck} disabled={checking} tone="dark">
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              {checking ? 'جارٍ الفحص...' : 'تشغيل الفحص الشامل'}
            </Btn>
          }
        />

        {checkResults && !checking && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">{okCount} سليم</span>
              <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-full bg-amber-100 text-amber-700">{warnCount} ملاحظة</span>
              <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-full bg-rose-100 text-rose-700">{failCount} مشكلة</span>
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              {checkResults.map((c) => (
                <div key={c.id} className={`flex items-start gap-2.5 border rounded-xl px-3 py-2.5 text-xs font-bold ${
                  c.status === 'ok' ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800'
                  : c.status === 'warn' ? 'border-amber-200 bg-amber-50/50 text-amber-800'
                  : 'border-rose-200 bg-rose-50/50 text-rose-800'
                }`}>
                  {c.status === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    : c.status === 'warn' ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    : <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />}
                  <div>
                    <p className="text-slate-900 dark:text-slate-100">{c.label}</p>
                    <p className="font-medium text-slate-500 dark:text-slate-400 mt-0.5">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {checking && <p className="mt-4 text-xs font-bold text-brand-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> فحص الترابط بين النماذج ومدخلات النظام...</p>}
      </Card>

      <Card>
        <SectionHeader
          title={`صحة البيانات — ${dataHealth.score}/100`}
          subtitle="نسبة اكتمال السجلات الأساسية (أسعار، مقادير، تواصل، صلاحيات، توازن قيود، مراجع سليمة)"
          icon={<HeartPulse className="w-4 h-4 text-primary-600" />}
        />
        <div className="mt-4">
          <div className="flex items-center gap-4 mb-4">
            <div className={`shrink-0 w-20 h-20 rounded-2xl border-4 flex items-center justify-center text-xl font-black ${
              dataHealth.grade === 'excellent' ? 'border-emerald-400 text-emerald-600'
              : dataHealth.grade === 'good' ? 'border-primary-300 text-primary-600'
              : 'border-amber-400 text-amber-600'
            }`}>
              {dataHealth.score}
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900">
                {dataHealth.grade === 'excellent' ? 'ممتازة — البيانات جاهزة للتقارير والقرارات'
                  : dataHealth.grade === 'good' ? 'جيدة — ننصح باستكمال النواقص لرفع الجودة'
                  : 'تحتاج عناية — أكمل السجلات الأساسية المصغّرة بالأحمر'}
              </p>
              <p className="text-xs font-bold text-slate-500 mt-1">تُحدَّث تلقائياً من بياناتك الحالية في كل مرة تُفتح فيها الشاشة.</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {dataHealth.parts.map((p) => (
              <div key={p.label} className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">{p.label}</span>
                  <span className={`text-[11px] font-black font-mono ${p.pct >= 90 ? 'text-emerald-600' : p.pct >= 70 ? 'text-primary-700' : 'text-amber-600'}`}>{p.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full ${p.pct >= 90 ? 'bg-emerald-500' : p.pct >= 70 ? 'bg-primary-500' : 'bg-amber-500'}`} style={{ width: `${p.pct}%` }} />
                </div>
                <p className="mt-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">{p.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader
          title="حالة النسخ الاحتياطي"
          subtitle="آخر نسخة احتياطية كاملة من بيانات النظام — يُنصح بعمل نسخة دورية على الأقل مرة أسبوعياً"
          icon={<DatabaseBackup className="w-4 h-4 text-emerald-600" />}
          extra={onNavigate ? <Btn tone="ghost" onClick={() => onNavigate('backup_center')}><DatabaseBackup className="w-4 h-4" /> شاشة النسخ الاحتياطي</Btn> : undefined}
        />
        <div className="mt-4">
          {backupState.loading ? (
            <p className="text-xs font-bold text-brand-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ قراءة حالة النسخ الاحتياطي...</p>
          ) : backupState.error ? (
            <div className="flex items-center gap-2 text-xs font-bold text-rose-600"><XCircle className="w-4 h-4" /> {backupState.error}</div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-2">
              <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${backupHealth === 'fresh' ? 'border-emerald-200 bg-emerald-50/60' : backupHealth === 'stale' ? 'border-amber-200 bg-amber-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${backupHealth === 'fresh' ? 'bg-emerald-100 text-emerald-600' : backupHealth === 'stale' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>
                  {backupHealth === 'fresh' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-900">آخر نسخة: {backupAge || 'لا توجد نسخة بعد'}</p>
                  <p className="text-[11px] font-bold text-slate-500">
                    {backupHealth === 'fresh' ? 'النسخ الاحتياطي سليم ومحدّث'
                      : backupHealth === 'stale' ? 'آخر نسخة أقدم من أسبوع — يُنصح بنسخة جديدة'
                      : 'لا توجد نسخة احتياطية — أنشئ واحدة الآن'}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center shrink-0"><DatabaseBackup className="w-4 h-4" /></div>
                <div>
                  <p className="text-xs font-extrabold text-slate-900">{backupState.count} نسخة مخزنة</p>
                  <p className="text-[11px] font-bold text-slate-500">على هذا الجهاز — الأحدث أولاً</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center shrink-0"><Clock className="w-4 h-4" /></div>
                <div>
                  <p className="text-xs font-extrabold text-slate-900">التوصية: نسخة أسبوعي</p>
                  <p className="text-[11px] font-bold text-slate-500">والمتابعة عبر شاشة النسخ الاحتياطي المخصصة</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader
          title="لوحة حالة الخوادم"
          subtitle="فحص مباشر للخادم وقاعدة البيانات والمزامنة وأجهزة نقاط البيع المتصلة"
          icon={<Activity className="w-4 h-4 text-brand-500" />}
          extra={<Btn onClick={checkServer} disabled={serverState.loading} tone="ghost">{serverState.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} تحديث</Btn>}
        />
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${serverState.ok ? 'border-emerald-200 bg-emerald-50/60' : serverState.loading ? 'border-slate-200 bg-slate-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${serverState.ok ? 'bg-emerald-100 text-emerald-600' : serverState.loading ? 'bg-slate-200 text-slate-500' : 'bg-rose-100 text-rose-600'}`}>
              {serverState.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : serverState.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">قاعدة البيانات (DB)</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                {serverState.loading ? 'جارٍ الفحص...'
                  : serverState.ok ? `متصل · مراجعة rev ${serverState.rev} · ${serverState.ms}ms`
                  : serverState.error}
              </p>
              {serverState.ok && <p className="text-[10px] font-mono text-slate-400 mt-0.5">boot {serverState.boot}</p>}
            </div>
          </div>

          <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${!offline ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${!offline ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
              {!offline ? <CheckCircle2 className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">المزامنة بين الأجهزة</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                {offline ? 'دون اتصال — التعديلات تُحفظ محلياً وتُرسل عند عودة الاتصال'
                  : pendingSavesCount > 0 ? `${pendingSavesCount} عملية بانتظار المزامنة`
                  : 'شبه لحظية (فحص كل 5 ثوانٍ)'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center shrink-0"><Wifi className="w-4 h-4" /></div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">نقاط البيع (POS)</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                {netInfo && netInfo.public ? `أجهزة الكاشير تتصل عبر الشبكة — المنفذ ${netInfo.port}` : 'تعمل أجهزة الكاشير على نفس الشبكة المحلية'}
              </p>
              {netInfo && netInfo.localIPs.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {netInfo.localIPs.map((ip) => <span key={ip.address} dir="ltr" className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">{ip.address}:{netInfo.port}</span>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader
          title="إعادة هيكلة النظام"
          subtitle="إصلاح المراجع المكسورة بين النماذج، إعادة احتساب جميع التكاليف والقوائم المالية، وضمان عمل كل أوامر النظام"
          icon={<Wrench className="w-4 h-4 text-amber-600" />}
          extra={
            <Btn onClick={() => setConfirmOpen(true)} disabled={checking} tone="primary">
              <Wrench className="w-4 h-4" /> تنفيذ إعادة الهيكلة
            </Btn>
          }
        />

        <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>
            ترميم وترتيب آمن: تُحذف الأسطر المكسورة التي تشير لخامات/وصفات غير موجودة، ويُصفّر المخزون السالب،
            وتُعاد احتساب تكاليف الوصفات وأسعارها المقترحة، وتُعاد بناء قائمة الدخل الموحدة، ثم يُعاد الفحص الشامل للتأكد من سلامة النتيجة.
          </span>
        </div>

        {rebuildResult && !checking && (
          <div className="mt-4 space-y-4">
            {rebuildResult.fixes.length > 0 && (
              <div>
                <p className="text-xs font-extrabold text-emerald-700 mb-1.5">الإصلاحات المنفذة ({rebuildResult.fixes.length})</p>
                <ul className="space-y-1">
                  {rebuildResult.fixes.map((f, i) => (
                    <li key={i} className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-xs font-extrabold text-brand-700 mb-1.5">إعادة الاحتساب والتحقق ({rebuildResult.recalcs.length})</p>
              <ul className="space-y-1">
                {rebuildResult.recalcs.map((r, i) => (
                  <li key={i} className="text-xs font-bold text-brand-800 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <Activity className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-600" /> {r}
                  </li>
                ))}
              </ul>
            </div>
            {rebuildResult.issues.length > 0 && (
              <div>
                <p className="text-xs font-extrabold text-rose-700 mb-1.5">مشكلات متبقية ({rebuildResult.issues.length})</p>
                <ul className="space-y-1">
                  {rebuildResult.issues.map((i2, i) => (
                    <li key={i} className="text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-start gap-2">
                      <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" /> {i2}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {rebuildResult && rebuildResult.fixes.length === 0 && rebuildResult.issues.length === 0 && !checking && (
          <p className="mt-4 text-xs font-bold text-emerald-700">بيانات النظام سليمة — لم تتطلب الهيكلة أي إصلاحات إضافية.</p>
        )}
      </Card>

      <Card>
        <SectionHeader title="أماكن ظهور الشعار" subtitle="عند تعيين شعار يحل محل الأيقونة الافتراضية في المواضع التالية" icon={<Info className="w-4 h-4" />} />
        <ul className="grid sm:grid-cols-2 gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <li className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5">• شريط العنوان العلوي (Header)</li>
          <li className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5">• القائمة الجانبية (Sidebar)</li>
          <li className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5">• صفحة تسجيل الدخول</li>
          <li className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5">• رأس كل التقارير المطبوعة (Print)</li>
        </ul>
      </Card>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="تأكيد إعادة هيكلة النظام">
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            سيتم تنفيذ إجراء الترميم الكامل: إصلاح المراجع المكسورة، إعادة احتساب تكاليف الوصفات وقائمة الدخل،
            ثم إعادة الفحص الشامل. هل تريد المتابعة؟
          </p>
          <div className="flex gap-2 justify-end">
            <Btn tone="ghost" onClick={() => setConfirmOpen(false)}>إلغاء</Btn>
            <Btn tone="primary" onClick={doRebuild}>
              <Wrench className="w-4 h-4" /> تنفيذ الآن
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};