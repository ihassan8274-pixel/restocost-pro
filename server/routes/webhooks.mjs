// Webhooks management endpoints (admin-only).
import { readToken, sessionUser } from '../core.mjs';
import { store } from '../store.mjs';
import { listWebhooks, saveWebhooks, fireSingleWebhook, ALLOWED_EVENTS, EVENT_KEYS, getWebhookStatus } from '../webhooks.mjs';

export const registerWebhooksRoutes = (app) => {
  const admin = (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return { user: null, error: res.status(401).json({ ok: false, error: 'غير مصادق' }) };
    if (user.role !== 'admin') return { user, error: res.status(403).json({ ok: false, error: 'غير مصرح' }) };
    return { user };
  };

  app.get('/api/webhooks', (req, res) => {
    const { error } = admin(req, res);
    if (error) return;
    const list = listWebhooks(store).map((w) => ({
      ...w,
      secret: w.secret ? `${'•'.repeat(8)}${String(w.secret).slice(-3)}` : '',
      status: getWebhookStatus(w.id) || undefined,
    }));
    res.json({ ok: true, webhooks: list, events: ALLOWED_EVENTS, mappedKeys: EVENT_KEYS });
  });

  app.post('/api/webhooks', (req, res) => {
    const { error } = admin(req, res);
    if (error) return;
    const body = req.body || {};
    const incoming = Array.isArray(body.webhooks) ? body.webhooks : [];
    const prev = listWebhooks(store);
    const secretIndex = new Map(prev.map((w) => [w.id, w.secret]));
    const list = incoming
      .filter((w) => w && w.url && typeof w.url === 'string' && /^https?:\/\/.+/i.test(w.url.trim()))
      .map((w) => {
        const kept = secretIndex.get(w.id);
        let secret = '';
        if (w.secret && typeof w.secret === 'string' && !w.secret.includes('•')) secret = String(w.secret).trim().slice(0, 200);
        else if (kept) secret = String(kept);
        return {
          id: String(w.id || `wh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
          name: String(w.name || '').trim().slice(0, 80),
          url: String(w.url).trim().slice(0, 500),
          secret,
          events: Array.isArray(w.events) ? w.events.filter((e) => ALLOWED_EVENTS.includes(e)) : [],
          enabled: w.enabled !== false,
        };
      });
    try {
      saveWebhooks(store, list);
    } catch (e) {
      return res.json({ ok: false, error: e && e.message ? e.message : 'تعذر الحفظ' });
    }
    res.json({ ok: true, count: list.length });
  });

  app.post('/api/webhooks/test', async (req, res) => {
    const { error } = admin(req, res);
    if (error) return;
    const body = req.body || {};
    const wh = body.url
      ? { id: 'test', name: 'اختبار', url: String(body.url), secret: body.secret ? String(body.secret) : undefined }
      : listWebhooks(store).find((w) => w && w.id === body.id);
    if (!wh) return res.status(404).json({ ok: false, error: 'الويب هوك غير موجود' });
    const r = await fireSingleWebhook(store, wh, {
      event: 'test',
      at: new Date().toISOString(),
      message: 'اختبار اتصال Webhook من RestoCost ERP Pro',
      instance: 'restocost',
    });
    res.json(r.ok ? { ok: true, status: r.status } : { ok: false, error: r.error || `HTTP ${r.status}` });
  });
};