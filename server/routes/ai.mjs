// AI server-side proxy: the server holds the model API keys (encrypted at rest)
// and calls providers directly. Browser clients never receive the keys â€” this
// closes the /api/bootstrap key-leak and makes AI work from any logged-in device.
import { readToken, sessionUser } from '../core.mjs';
import { store } from '../store.mjs';
import { decryptSecret } from '../secrets.mjs';

const VALID_PROVIDERS = ['openai', 'gemini', 'groq', 'openrouter', 'local', 'custom'];
const DEFAULT_MODEL = {
  local: '', gemini: 'gemini-3.5-flash-lite', openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile', openrouter: 'openai/gpt-4o-mini', custom: '',
};
const OPENAI_URLS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

const normalizeAiItem = (m) => ({
  id: m.id,
  name: m.name || 'ظ†ظ…ظˆط°ط¬',
  provider: VALID_PROVIDERS.includes(m.provider) ? m.provider : 'local',
  apiKey: decryptSecret(m.apiKey ?? ''),
  baseURL: typeof m.baseURL === 'string' && m.baseURL ? m.baseURL : undefined,
  model: m.model || '',
  enabled: m.enabled !== false,
});

export const resolveServerAIModel = (store, modelId) => {
  const s = store.getKV('rcerp_ai_settings');
  if (!s || typeof s !== 'object') return null;
  const list = Array.isArray(s.items) ? s.items.filter((m) => m && m.id) : [];
  let m = modelId ? list.find((x) => x.id === modelId) : null;
  if (!m) m = list.find((x) => x.id === s.activeId) || list[0];
  if (m) return normalizeAiItem(m);
  if (typeof s.provider === 'string' || typeof s.apiKey === 'string') {
    return {
      id: 'ai-default', name: 'ط§ظ„ظ†ظ…ظˆط°ط¬ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ',
      provider: VALID_PROVIDERS.includes(s.provider) ? s.provider : 'local',
      apiKey: decryptSecret(s.apiKey ?? ''),
      baseURL: typeof s.baseURL === 'string' && s.baseURL ? s.baseURL : undefined,
      model: s.model || '',
      enabled: s.enabled !== false,
    };
  }
  return null;
};

const buildCustomEndpoint = (baseURL) => {
  const base = String(baseURL || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base) || /\/chat\/completions\?/i.test(base)) return base;
  if (/\/v[0-9]+\/?$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
};

const callProvider = async (cfg, systemPrompt, userPrompt) => {
  if (!cfg || cfg.provider === 'local') return { ok: false, error: 'ظ†ظ…ظˆط°ط¬ ظ…ط­ظ„ظٹ â€” ظ„ط§ ظٹظڈط±ط³ظ„ ظ„ظ„ط®ط§ط¯ظ…' };
  const model = cfg.model || DEFAULT_MODEL[cfg.provider];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    if (cfg.provider === 'gemini') {
      if (!cfg.apiKey) return { ok: false, error: 'ظ„ط§ ظٹظˆط¬ط¯ ظ…ظپطھط§ط­ Gemini ظ…ط­ظپظˆط¸' };
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok) return { ok: false, error: `ط§ظ„ط®ط§ط¯ظ… ط±ظپط¶ ط§ظ„ط·ظ„ط¨ (${res.status})` };
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? { ok: true, text } : { ok: false, error: 'ط§ط³طھط¬ط§ط¨ط© ظپط§ط±ط؛ط© ظ…ظ† ط§ظ„ظ…ط²ظˆظ‘ط¯' };
    }
    const url = cfg.provider === 'custom' ? buildCustomEndpoint(cfg.baseURL || '') : OPENAI_URLS[cfg.provider];
    if (!url) return { ok: false, error: 'ظ…ط²ظˆظ‘ط¯ ط؛ظٹط± ظ…ط¹ط±ظˆظپ' };
    if (cfg.provider !== 'custom' && !cfg.apiKey) return { ok: false, error: 'ظ„ط§ ظٹظˆط¬ط¯ ظ…ظپطھط§ط­ API ظ…ط­ظپظˆط¸' };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 900,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `ط§ظ„ط®ط§ط¯ظ… ط±ظپط¶ ط§ظ„ط·ظ„ط¨ (${res.status})` };
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return text ? { ok: true, text } : { ok: false, error: 'ط§ط³طھط¬ط§ط¨ط© ظپط§ط±ط؛ط© ظ…ظ† ط§ظ„ظ…ط²ظˆظ‘ط¯' };
  } catch (e) {
    const aborted = e && e.name === 'AbortError';
    return { ok: false, error: aborted ? 'ط§ظ†طھظ‡طھ ظ…ظ‡ظ„ط© ط§ظ„ط§طھطµط§ظ„ ط¨ط§ظ„ظ…ط²ظˆظ‘ط¯' : ((e && e.message) || 'طھط¹ط°ط± ط§ظ„ط§طھطµط§ظ„ ط¨ط§ظ„ظ…ط²ظˆظ‘ط¯') };
  } finally {
    clearTimeout(timer);
  }
};

const testModel = async (cfg) => {
  if (!cfg || cfg.provider === 'local') return { ok: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    if (cfg.provider === 'gemini') {
      if (!cfg.apiKey) return { ok: false, error: 'ظ„ط§ ظٹظˆط¬ط¯ ظ…ظپطھط§ط­ Gemini ظ…ط­ظپظˆط¸' };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.apiKey)}`, { signal: controller.signal });
      if (res.ok) return { ok: true };
      return { ok: false, error: res.status === 400 ? 'ظ…ظپطھط§ط­ Gemini ط؛ظٹط± طµط§ظ„ط­ (400)' : `ط§ظ„ط®ط§ط¯ظ… ط±ظپط¶ ط§ظ„ط·ظ„ط¨ (${res.status})` };
    }
    if (cfg.provider === 'custom') {
      const base = (cfg.baseURL || '').trim().replace(/\/+$/, '');
      if (!base) return { ok: false, error: 'ط£ط¯ط®ظ„ ط¹ظ†ظˆط§ظ† ط§ظ„ط®ط§ط¯ظ… (Base URL) ط£ظˆظ„ط§ظ‹' };
      const res = await fetch(`${base}${/\/v[0-9]+\/?$/i.test(base) ? '' : '/v1'}/models`, {
        headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
        signal: controller.signal,
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: `ط§ظ„ط®ط§ط¯ظ… ط±ظپط¶ ط§ظ„ط·ظ„ط¨ (${res.status}) â€” طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„ط¹ظ†ظˆط§ظ† ظˆط§ظ„طµظ„ط§ط­ظٹط©` };
    }
    const url = cfg.provider === 'groq'
      ? 'https://api.groq.com/openai/v1/models'
      : cfg.provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/models'
        : 'https://api.openai.com/v1/models';
    if (!cfg.apiKey) return { ok: false, error: 'ظ„ط§ ظٹظˆط¬ط¯ ظ…ظپطھط§ط­ API ظ…ط­ظپظˆط¸' };
    const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.apiKey}` }, signal: controller.signal });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: 'ظ…ظپطھط§ط­ API ط؛ظٹط± طµط§ظ„ط­ (401)' };
    return { ok: false, error: `ط§ظ„ط®ط§ط¯ظ… ط±ظپط¶ ط§ظ„ط·ظ„ط¨ (${res.status})` };
  } catch (e) {
    return { ok: false, error: (e && e.name === 'AbortError') ? 'ط§ظ†طھظ‡طھ ظ…ظ‡ظ„ط© ط§ظ„ط§طھطµط§ظ„' : ((e && e.message) || 'طھط¹ط°ط± ط§ظ„ط§طھطµط§ظ„ ط¨ط§ظ„ط®ط§ط¯ظ…') };
  } finally {
    clearTimeout(timer);
  }
};

export const registerAI = (app) => {
  // Any authenticated user can ask the server to call the configured model â€”
  // the server answers using its stored key; the key never leaves the server.
  app.post('/api/ai/chat', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'ط؛ظٹط± ظ…طµط§ط¯ظ‚' });
    const body = req.body || {};
    const system = typeof body.system === 'string' ? body.system : 'ظƒظ† ظ…ط³ط§ط¹ط¯ط§ظ‹ ط®ط¨ظٹط±ط§ظ‹';
    const prompt = typeof body.user === 'string' && body.user.trim() ? body.user : '';
    if (!prompt) return res.status(400).json({ ok: false, error: 'ظ†طµ ط§ظ„ط·ظ„ط¨ ظپط§ط±ط؛' });
    const cfg = resolveServerAIModel(store, typeof body.modelId === 'string' ? body.modelId : undefined);
    if (!cfg) return res.json({ ok: false, error: 'ظ„ط§ طھظˆط¬ط¯ ط¥ط¹ط¯ط§ط¯ط§طھ ط°ظƒط§ط، ط§طµط·ظ†ط§ط¹ظٹ' });
    const r = await callProvider(cfg, system, prompt);
    if (r.ok && r.text) return res.json({ ok: true, content: r.text });
    return res.json({ ok: false, error: r.error || 'طھط¹ط°ط± طھظ†ظپظٹط° ط§ظ„ط·ظ„ط¨' });
  });

  // Admin-only: test a saved model (by id) or a freshly typed key (by provider).
  app.post('/api/ai/test', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'ط؛ظٹط± ظ…طµط§ط¯ظ‚' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'ط؛ظٹط± ظ…طµط±ط­' });
    const body = req.body || {};
    let cfg = null;
    if (typeof body.key === 'string' && body.key.trim()) {
      cfg = {
        id: 'test', name: 'ط§ط®طھط¨ط§ط±', provider: VALID_PROVIDERS.includes(body.provider) ? body.provider : 'openai',
        apiKey: body.key.trim(),
        baseURL: typeof body.baseURL === 'string' && body.baseURL ? body.baseURL : undefined,
        model: typeof body.model === 'string' ? body.model : '',
        enabled: true,
      };
    } else {
      cfg = resolveServerAIModel(store, typeof body.modelId === 'string' ? body.modelId : undefined);
    }
    if (!cfg) return res.json({ ok: false, error: 'ظ„ط§ ظٹظˆط¬ط¯ ظ†ظ…ظˆط°ط¬ ظ„ظ„ط§ط®طھط¨ط§ط±' });
    const r = await testModel(cfg);
    res.json(r);
  });
};