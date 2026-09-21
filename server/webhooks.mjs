// Webhooks: outbound dispatch to external systems (delivery/accounting/anything
// HTTP-able) with a watchdog that alerts the admin via Telegram when an
// external endpoint "goes down" (consecutive failures).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendTelegram } from './telegram.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

// خريطة مفاتيح التخزين → أحداث Webhook (يستدعيها سيرفر الحفظ عند أي تعديل)
export const EVENT_KEYS = {
  rcerp_pos_orders: 'sales',
  rcerp_batch_sales: 'sales',
  rcerp_customer_orders: 'sales',
  rcerp_purchase_orders: 'purchase',
  rcerp_grn: 'purchase',
  rcerp_supplier_returns: 'purchase',
  rcerp_inventory: 'inventory',
  rcerp_inventory_batches: 'inventory',
  rcerp_stock_transfers: 'transfer',
  rcerp_operating_expenses: 'expense',
  rcerp_wastage: 'wastage',
  rcerp_daily_counts: 'inventory',
};

export const ALLOWED_EVENTS = ['sales', 'purchase', 'inventory', 'transfer', 'expense', 'wastage', '*'];

// حالة فورية خفيفة (لمراقب الانقطاع) — لا تُحفظ على القرص
const statuses = new Map(); // id -> { consecutiveFailures, lastStatus, lastAt }

const log = (line) => {
  try { fs.appendFileSync(path.join(dataDir, 'savelog.txt'), `${new Date().toISOString()} | ${line}\n`); } catch { /* تجاهل */ }
};

export const listWebhooks = (store) => {
  const v = store.getKV('rcerp_webhooks');
  return Array.isArray(v) ? v : [];
};

export const saveWebhooks = (store, list) => {
  store.setKV('rcerp_webhooks', list);
};

export const fireSingleWebhook = async (_store, wh, payload) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(wh.secret ? { 'X-RC-Webhook-Secret': String(wh.secret) } : {}),
        'User-Agent': 'RestoCost-ERP/1.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e && e.name === 'AbortError' ? 'timeout' : ((e && e.message) || 'network') };
  } finally {
    clearTimeout(t);
  }
};

let lastAdminAlertAt = 0;

const alertAdmin = async (store, wh, st) => {
  const now = Date.now();
  if (now - lastAdminAlertAt < 10 * 60 * 1000) return; // تنبيه واحد كل 10 دقائق
  lastAdminAlertAt = now;
  const tg = store.getKV('rcerp_telegram_settings');
  if (!tg || !tg.enabled || !tg.botToken) return;
  const text =
    `<b>🚨 انقطاع ويب هوك خارجي (Webhook Down)</b>\n` +
    `الاسم: ${wh.name || '—'}\n` +
    `الرابط: <span dir="ltr">${wh.url}</span>\n` +
    `الحالة: ${st.lastStatus || '—'} (${st.consecutiveFailures} محاولات فاشلة متتالية)\n` +
    `الوقت: ${new Date().toLocaleString('ar-SA-u-nu-latn')}\n` +
    `تحقق من النظام الخارجي أو راجع إعدادات الويب هوك في النظام.`;
  const r = await sendTelegram(store, text).catch(() => ({ ok: false, errors: [] }));
  log(`WEBHOOK-ALERT name=${wh.name || wh.url} failures=${st.consecutiveFailures} tg=${r.ok ? 'sent' : 'failed'}`);
};

// إرسال حدث لكل الويب هوك المشترك بحدثه (غير متزامن — لا يبطئ الحفظ)
export const dispatchWebhookEvent = async (store, event, payload) => {
  const list = listWebhooks(store).filter((wh) => wh && wh.enabled !== false && wh.url && Array.isArray(wh.events) && (wh.events.includes(event) || wh.events.includes('*')));
  if (!list.length) return;
  for (const wh of list) {
    const r = await fireSingleWebhook(store, wh, payload);
    const st = statuses.get(wh.id) || { consecutiveFailures: 0 };
    st.lastAt = new Date().toISOString();
    if (r.ok) {
      st.consecutiveFailures = 0;
      st.lastStatus = `ok:${r.status}`;
    } else {
      st.consecutiveFailures = (st.consecutiveFailures || 0) + 1;
      st.lastStatus = r.error ? `err:${r.error}` : `http:${r.status}`;
    }
    statuses.set(wh.id, st);
    if (!r.ok && st.consecutiveFailures >= 3) await alertAdmin(store, wh, st);
  }
};

export const getWebhookStatus = (id) => statuses.get(id) || null;

// مراقب الانقطاع: يفحص حالة كل ويب هوك كل 60 ثانية ويعيد تنبيه المسؤول
// عندما يتجاوز الفشل المتتالي 3 مرات (يُخصم التنبيه المكرر عبر alertAdmin).
export const startWebhookWatchdog = (store) => {
  const timer = setInterval(() => {
    try {
      for (const wh of listWebhooks(store)) {
        if (!wh || wh.enabled === false) continue;
        const st = statuses.get(wh.id);
        if (st && st.consecutiveFailures >= 3) alertAdmin(store, wh, st);
      }
    } catch { /* تجاهل */ }
  }, 60 * 1000);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
};