export type AIProvider = 'openai' | 'gemini' | 'groq' | 'openrouter' | 'local' | 'custom';

export interface AIProviderInfo {
  id: AIProvider;
  label: string;
  hint: string;
  keyPlaceholder: string;
  models: { id: string; label: string }[];
}

// ==== نماذج ذكاء اصطناعي متعددة — لكل نموذج إعدادات مستقلة تماماً (مزوّد + مفتاح + موديل) ====
export interface AIModelConfig {
  id: string;
  name: string;            // اسم يعرّفه المستخدم (مثال: "تحليل المخزون")
  provider: AIProvider;
  apiKey: string;
  baseURL?: string;
  model: string;
  enabled: boolean;
  hasKey?: boolean;        // مؤشر من الخادم: يوجد مفتاح محفوظ (لا يُبث المفتاح نفسه)
}

export type AISettingsStore = { items: AIModelConfig[]; activeId: string };

const AI_MODELS_KEY = 'rcerp_ai_models';
const AI_ACTIVE_KEY = 'rcerp_ai_active_model';

const validModelConfig = (m: unknown): m is AIModelConfig => {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.provider === 'string' && typeof o.apiKey === 'string';
};

// تخزين قائمة النماذج + عكس النموذج النشط إلى مفاتيح الوراثة القديمة
// (rcerp_ai_provider/baseurl/model/enabled) حتى تبقى كل شاشات AI الحالية تعمل بنفس الشكل.
// الأمان: لا تُخزَّن مفاتيح API محلياً إطلاقاً — المفتاح يبقى على الخادم مشفراً.
export const saveAIModelList = (items: AIModelConfig[], activeId: string): void => {
  const safe = items.map((m) => {
    const hasKey = m.hasKey || Boolean(m.apiKey);
    const { apiKey, ...rest } = m;
    return { ...rest, apiKey: '', hasKey };
  });
  try { localStorage.setItem(AI_MODELS_KEY, JSON.stringify(safe)); } catch { /* ignore */ }
  const active = items.find((x) => x.id === activeId) || items[0];
  localStorage.setItem(AI_ACTIVE_KEY, active ? active.id : '');
  localStorage.removeItem('rcerp_ai_key');
  if (active) {
    localStorage.setItem('rcerp_ai_provider', active.provider);
    localStorage.setItem('rcerp_ai_enabled', String(active.enabled));
    if (active.baseURL) localStorage.setItem('rcerp_ai_baseurl', active.baseURL);
    else localStorage.removeItem('rcerp_ai_baseurl');
    if (active.model) localStorage.setItem('rcerp_ai_model', active.model);
    else localStorage.removeItem('rcerp_ai_model');
  }
};

// قراءة قائمة النماذج — مع ترحيل تلقائي من إعداد المفتاح الواحد القديم إن لم توجد قائمة بعد
export const getAIModels = (): AIModelConfig[] => {
  try {
    const raw = localStorage.getItem(AI_MODELS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.some(validModelConfig)) return arr.filter(validModelConfig);
    }
  } catch { /* تجاهل التالف */ }
  const legacy: AIModelConfig = {
    id: 'ai-default',
    name: 'النموذج الافتراضي',
    provider: getAIProvider(),
    apiKey: getAIKey(),
    baseURL: getAIBaseURL() || undefined,
    model: getAIModel(),
    enabled: getAIEnabled(),
  };
  saveAIModelList([legacy], legacy.id);
  return [legacy];
};

export const getActiveAIModelId = (): string => {
  const stored = localStorage.getItem(AI_ACTIVE_KEY);
  if (stored) return stored;
  const list = getAIModels();
  return list[0]?.id || 'ai-default';
};

export const setActiveAIModelId = (id: string): void => {
  const list = getAIModels();
  saveAIModelList(list, id);
};

export const getActiveAIModel = (): AIModelConfig | undefined => {
  const list = getAIModels();
  return list.find((x) => x.id === getActiveAIModelId()) || list[0];
};

// إنشاء/تحديث نموذج معيّن (لا يمسّ مفاتيح النماذج الأخرى — يُحل مشكلة تسرّب المفتاح بين النماذج)
export const upsertAIModel = (cfg: Partial<AIModelConfig> & { id?: string; name?: string }): string => {
  const list = getAIModels();
  const id = cfg.id && list.some((x) => x.id === cfg.id) ? cfg.id : `ai-${Date.now()}`;
  const idx = list.findIndex((x) => x.id === id);
  const merged: AIModelConfig = {
    id,
    name: cfg.name?.trim() || (idx >= 0 ? list[idx].name : AI_PROVIDERS.find((p) => p.id === cfg.provider)?.label.split(' (')[0] || 'نموذج'),
    provider: cfg.provider || (idx >= 0 ? list[idx].provider : 'local'),
    apiKey: cfg.apiKey !== undefined ? cfg.apiKey : (idx >= 0 ? list[idx].apiKey : ''),
    baseURL: cfg.baseURL !== undefined ? cfg.baseURL || undefined : (idx >= 0 ? list[idx].baseURL : undefined),
    model: cfg.model !== undefined ? cfg.model : (idx >= 0 ? list[idx].model : ''),
    enabled: cfg.enabled !== undefined ? cfg.enabled : (idx >= 0 ? list[idx].enabled : true),
  };
  const next = idx >= 0 ? list.map((x) => (x.id === id ? merged : x)) : [...list, merged];
  saveAIModelList(next, getActiveAIModelId());
  return id;
};

export const removeAIModelConfig = (id: string): void => {
  const list = getAIModels();
  const next = list.filter((x) => x.id !== id);
  if (next.length === 0) {
    const blank: AIModelConfig = { id: 'ai-default', name: 'النموذج الافتراضي', provider: 'local', apiKey: '', model: '', enabled: true };
    saveAIModelList([blank], blank.id);
    return;
  }
  saveAIModelList(next, getActiveAIModelId() === id ? next[0].id : getActiveAIModelId());
};

// توليد كائن الإعدادات التخزينية من أي شكل (قائمة جديدة أو شكل قديم بمفتاح واحد)
export const normalizeAISettings = (v: unknown): AISettingsStore | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.items) && (o.items as unknown[]).some(validModelConfig)) {
    const items = (o.items as unknown[]).filter(validModelConfig);
    const activeId = typeof o.activeId === 'string' && items.some((x) => x.id === o.activeId) ? o.activeId : items[0].id;
    return { items, activeId };
  }
  if (typeof o.provider === 'string' || typeof o.apiKey === 'string' || typeof o.enabled === 'boolean') {
    const provider = (o.provider as AIProvider) && AI_PROVIDERS.some((p) => p.id === o.provider) ? (o.provider as AIProvider) : 'local';
    const item: AIModelConfig = {
      id: 'ai-default',
      name: 'النموذج الافتراضي',
      provider,
      apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
      hasKey: !!o.hasKey,
      baseURL: typeof o.baseURL === 'string' && o.baseURL ? o.baseURL : undefined,
      model: typeof o.model === 'string' ? o.model : '',
      enabled: o.enabled !== false,
    };
    return { items: [item], activeId: item.id };
  }
  return null;
};

export const AI_PROVIDERS: AIProviderInfo[] = [
  {
    id: 'local',
    label: 'تحليل محلي (بدون إنترنت)',
    hint: 'لا حاجة لمفتاح في الوضع المحلي',
    keyPlaceholder: '—',
    models: [],
  },
  {
    id: 'gemini',
    label: 'Google Gemini (مجاني)',
    hint: 'مفتاحك المجاني من aistudio.google.com/apikey يبدأ بـ AIza',
    keyPlaceholder: 'AIza...',
    models: [
      { id: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (سريع واقتصادي)' },
      { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash' },
      { id: 'gemini-3.6-flash', label: 'gemini-3.6-flash (أحدث)' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI (مفتاح API)',
    hint: 'مفتاحك من platform.openai.com يبدأ بـ sk-',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini (سريع واقتصادي)' },
      { id: 'gpt-4o', label: 'gpt-4o (أدق)' },
      { id: 'gpt-4-turbo', label: 'gpt-4-turbo' },
      { id: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
    ],
  },
  {
    id: 'groq',
    label: 'Groq (سريع ومجاني)',
    hint: 'مفتاحك من console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (سريع واقتصادي)' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (نماذج متعددة)',
    hint: 'مفتاحك من openrouter.ai/keys، يمكن ربط مزوّدات متعددة',
    keyPlaceholder: 'sk-or-...',
    models: [
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (سريع واقتصادي)' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { id: 'google/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    ],
  },
  {
    id: 'custom',
    label: 'مزوّد مخصص (OpenAI-compatible)',
    hint: 'أي خادم متوافق مع OpenAI API: Ollama / LM Studio محلياً، أو DeepSeek / Azure / أي مزوّد برابط (Base URL)',
    keyPlaceholder: 'مفتاح API (اختياري للخوادم المحلية)',
    models: [],
  },
];

export const DEFAULT_MODEL: Record<AIProvider, string> = {
  local: '',
  gemini: 'gemini-3.5-flash-lite',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'openai/gpt-4o-mini',
  custom: '',
};

export const getAISettings = () => ({
  provider: getAIProvider(),
  key: getAIKey(),
  model: getAIModel(),
  baseURL: getAIBaseURL(),
  enabled: getAIEnabled(),
});

export const getAIKey = (): string => localStorage.getItem('rcerp_ai_key') || '';
export const setAIKey = (key: string): void => {
  if (key.trim()) localStorage.setItem('rcerp_ai_key', key.trim());
  else localStorage.removeItem('rcerp_ai_key');
};
export const getAIBaseURL = (): string => localStorage.getItem('rcerp_ai_baseurl') || '';
export const setAIBaseURL = (url: string): void => {
  if (url.trim()) localStorage.setItem('rcerp_ai_baseurl', url.trim());
  else localStorage.removeItem('rcerp_ai_baseurl');
};
export const getAIProvider = (): AIProvider => {
  const p = localStorage.getItem('rcerp_ai_provider') as AIProvider | null;
  return p && AI_PROVIDERS.some((x) => x.id === p) ? p : 'local';
};
export const setAIProvider = (p: AIProvider): void => localStorage.setItem('rcerp_ai_provider', p);
export const getAIEnabled = (): boolean => localStorage.getItem('rcerp_ai_enabled') !== 'false';
export const getAIModel = (): string => {
  const stored = localStorage.getItem('rcerp_ai_model');
  const p = getAIProvider();
  if (stored) return stored;
  return DEFAULT_MODEL[p];
};
export const setAIModel = (model: string): void => {
  if (model.trim()) localStorage.setItem('rcerp_ai_model', model.trim());
  else localStorage.removeItem('rcerp_ai_model');
};

// بناء نقطة نهاية /chat/completions من رابط Base URL المخصص
export const buildCustomEndpoint = (baseURL: string): string => {
  const base = baseURL.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base) || /\/chat\/completions\?/i.test(base)) return base;
  if (/\/v[0-9]+\/?$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
};

export const hasAIConfigured = (): boolean => {
  if (getAIProvider() !== 'local' && getAIEnabled()) {
    if (getAIProvider() === 'custom') return Boolean(getAIBaseURL());
    return Boolean(getAIKey());
  }
  return false;
};

interface LLMResult {
  ok: boolean;
  text?: string;
  error?: string;
}

const callOpenAICompat = async (url: string, key: string, model: string, systemPrompt: string, userPrompt: string): Promise<LLMResult> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 900,
    }),
  });
  if (!res.ok) return { ok: false, error: `الخادم رفض الطلب (${res.status})` };
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  return text ? { ok: true, text } : { ok: false, error: 'استجابة فارغة من المزوّد' };
};

const callGemini = async (key: string, model: string, systemPrompt: string, userPrompt: string): Promise<LLMResult> => {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
    }),
  });
  if (!res.ok) return { ok: false, error: `الخادم رفض الطلب (${res.status})` };
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? { ok: true, text } : { ok: false, error: 'استجابة فارغة من المزوّد' };
};

export const testAIKey = async (key: string, provider?: AIProvider): Promise<{ ok: boolean; error?: string }> => {
  const p = provider || getAIProvider();
  try {
    if (p === 'local') return { ok: true };
    if (p === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      if (res.ok) return { ok: true };
      return { ok: false, error: res.status === 400 ? 'مفتاح Gemini غير صالح (400)' : `الخادم رفض الطلب (${res.status})` };
    }
    if (p === 'custom') {
      const base = getAIBaseURL();
      if (!base) return { ok: false, error: 'أدخل عنوان الخادم (Base URL) أولاً' };
      const baseClean = base.trim().replace(/\/+$/, '');
      const res = await fetch(`${baseClean}${/\/v[0-9]+\/?$/i.test(baseClean) ? '' : '/v1'}/models`, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: `الخادم رفض الطلب (${res.status}) — تحقق من العنوان والصلاحية` };
    }
    const url = p === 'groq'
      ? 'https://api.groq.com/openai/v1/models'
      : p === 'openrouter'
        ? 'https://openrouter.ai/api/v1/models'
        : 'https://api.openai.com/v1/models';
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: 'مفتاح API غير صالح (401)' };
    return { ok: false, error: `الخادم رفض الطلب (${res.status})` };
  } catch {
    return { ok: false, error: 'تعذر الاتصال بخادم المزوّد — تحقق من الإنترنت أو من تشغيل الخادم المحلي' };
  }
};

// اختيار النموذج الذي سيُستخدم لطلب: معرّف صريح (modelId) أو النموذج النشط الافتراضي
export const resolveAIModelConfig = (modelId?: string): AIModelConfig | undefined => {
  const list = getAIModels();
  if (modelId) {
    const m = list.find((x) => x.id === modelId);
    if (m) return m;
  }
  return getActiveAIModel();
};

export const runAISummary = async (systemPrompt: string, userPrompt: string, modelId?: string): Promise<string | null> => {
  // المسار الآمن أولاً: مفاتيح النماذج محفوظة على الخادم فقط (AES-GCM) — يُمرَّر الطلب
  // عبر /api/ai/chat فينفّذه الخادم بمفتاحه دون إرسال المفتاح إلى المتصفح إطلاقاً.
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('rcerp_token') : null;
  if (token) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(modelId
          ? { modelId, system: systemPrompt, user: userPrompt }
          : { system: systemPrompt, user: userPrompt }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j && j.ok && j.content) return j.content;
      }
    } catch { /* نتابع للمسار الاحتياطي أدناه */ }
  }
  // احتياط مباشر: مفتاح محلي (تطوير/خادم غير متصل) — لا يُستعمل في النشر العادي.
  const cfg = resolveAIModelConfig(modelId);
  if (!cfg || cfg.provider === 'local' || !cfg.enabled) return null;
  if (cfg.provider !== 'custom' && !cfg.apiKey) return null;
  try {
    const model = cfg.model || DEFAULT_MODEL[cfg.provider];
    let r: LLMResult;
    if (cfg.provider === 'gemini') {
      r = await callGemini(cfg.apiKey, model, systemPrompt, userPrompt);
    } else if (cfg.provider === 'custom') {
      const base = cfg.baseURL;
      if (!base) return null;
      const url = buildCustomEndpoint(base);
      r = await callOpenAICompat(url, cfg.apiKey, model, systemPrompt, userPrompt);
    } else {
      const url = cfg.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : cfg.provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';
      r = await callOpenAICompat(url, cfg.apiKey, model, systemPrompt, userPrompt);
    }
    return r.ok ? r.text || null : null;
  } catch {
    return null;
  }
};

// اختبار نموذج محفوظ مفتاحه على الخادم (المسؤول فقط) — الخادم يختبره بمفتاحه الحقيقي.
export const testSavedAIModel = async (modelId?: string): Promise<{ ok: boolean; error?: string }> => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('rcerp_token') : null;
  if (!token) return { ok: false, error: 'لا توجد جلسة متصلة بالخادم' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    const res = await fetch('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(modelId ? { modelId } : {}),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const j = await res.json().catch(() => null);
    if (j && j.ok === true) return { ok: true };
    return { ok: false, error: (j && j.error) || 'تعذر التحقق من الاتصال' };
  } catch {
    return { ok: false, error: 'تعذر الاتصال بالخادم' };
  }
};