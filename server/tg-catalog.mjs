/**
 * server/tg-catalog.mjs — قالب مرجعي تلقائي في تليجرام
 * ────────────────────────────────────────────────────
 * يُنشئ رسالة مُنسّقة تحتوي جميع الفروع والأصناف من النظام، ويحدّثها تلقائياً
 * عند أي تعديل في الأصناف/الفروع. إرسال/تعديل الرسائل يتم من bot-poll.mjs
 * (نفس دالة post الموجودة)، وهذا الملف يتولى النص + تتبع معرّفات الرسائل.
 */
import { store } from './store.mjs';
import { decryptSecret } from './secrets.mjs';

const CATALOG_MSGS_KEY = 'rcerp_tg_catalog_msgs';

const getMsgs = () => {
  const m = store.getKV(CATALOG_MSGS_KEY);
  return m && typeof m === 'object' ? m : {};
};

export const saveCatalogMsgId = (chatId, msgId) => {
  const m = getMsgs();
  m[String(chatId)] = msgId;
  store.setKV(CATALOG_MSGS_KEY, m);
};

export const getCatalogMsgId = (chatId) => getMsgs()[String(chatId)] || null;

export const deleteCatalogMsgId = (chatId) => {
  const m = getMsgs();
  delete m[String(chatId)];
  store.setKV(CATALOG_MSGS_KEY, m);
};

const seal = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * توليد نص القالب (HTML) من بيانات النظام لحظياً
 */
export const formatCatalog = (db) => {
  const branches = (db.getKV('rcerp_branches') || []).filter((b) => b && !b.deleted);
  const materials = (db.getKV('rcerp_raw_materials') || []).filter((m) => m && !m.deleted);
  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-SA-u-ca-gregory', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const lines = [`📋 <b>دليل التوزيع المخزني</b>`];

  lines.push('', `🏪 <b>الفروع (${branches.length})</b>`);
  const cols = 3;
  for (let i = 0; i < branches.length; i += cols) {
    const cells = branches.slice(i, i + cols).map((b, j) => `<i>${i + j + 1}</i>. ${seal(b.nameAr)}`);
    lines.push(cells.join(' — '));
  }

  const grouped = {};
  materials.forEach((m) => {
    const cat = m.category || 'أخرى';
    (grouped[cat] = grouped[cat] || []).push(m);
  });
  const catNames = [...new Set(materials.map((m) => (m.category || 'أخرى')))].sort((a, b) => a === 'أخرى' ? 1 : b === 'أخرى' ? -1 : a.localeCompare(b, 'ar'));

  lines.push('', `📦 <b>الأصناف (${materials.length})</b>`);
  for (const cat of catNames) {
    const ms = grouped[cat];
    if (!ms) continue;
    lines.push(`┌─ ${seal(cat)} (${ms.length})`);
    for (const m of ms) {
      const unit = m.purchaseUnit || m.unit || '';
      const conv = m.purchaseUnitConversion && m.purchaseUnitConversion > 1 ? ` <i>(١→${m.purchaseUnitConversion})</i>` : '';
      lines.push(`│ • ${seal(m.nameAr)}${unit ? ' [' + seal(unit) + ']' : ''}${conv}`);
    }
  }

  lines.push('', `🔄 <b>آخر تحديث:</b> ${dateStr}`);
  lines.push('💡 أرسل <code>/توزيع</code> للتوزيع بدون كتابة أسماء');

  return lines.join('\n');
};

export const CATALOG_REFRESH_CB = 'cat:refresh';

const TELEGRAM_API = 'https://api.telegram.org/bot';

const post = async (token, method, payload) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(`${TELEGRAM_API}${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
};

/**
 * يستطلع إعدادات التليجرام الحالية ويكون الإرسال اللازم (edit أو send)
 */
const deliver = async (token, chatId, text, createIfMissing = false) => {
  const savedMsgId = getCatalogMsgId(chatId);
  if (savedMsgId) {
    const r = await post(token, 'editMessageText', {
      chat_id: String(chatId), message_id: savedMsgId, text, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🔄 تحديث القائمة', callback_data: CATALOG_REFRESH_CB }]] },
    });
    if (r && r.ok) return true;
    // فشل التعديل (رسالة محذوفة/معطوبة) — نحذف المعرّف ونرسل جديداً
    deleteCatalogMsgId(chatId);
  }
  if (!createIfMissing) return false;
  const r = await post(token, 'sendMessage', {
    chat_id: String(chatId), text, parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🔄 تحديث القائمة', callback_data: CATALOG_REFRESH_CB }]] },
  });
  if (r && r.ok && r.result && r.result.message_id) saveCatalogMsgId(chatId, r.result.message_id);
  return !!(r && r.ok);
};

/**
 * تحديث القالب في كل المجموعات المصرّح بها (يُستدعى عند أي تعديل أصناف/فروع).
 * استدعاء غير متزامن بدون انتظار — لا يبطئ استجابة الحفظ.
 */
export const publishCatalogUpdate = async () => {
  try {
    const settings = store.getKV('rcerp_telegram_settings');
    const token = settings && settings.enabled ? decryptSecret(settings.botToken || '', 'tg:botToken') : '';
    if (!settings || !settings.enabled || !token) return;
    const chatIds = Array.isArray(settings.chatIds) ? settings.chatIds : [];
    const text = formatCatalog(store);
    for (const chatId of chatIds) {
      try { await deliver(token, String(chatId), text, false); } catch { /* مجموعة واحدة تعطّلت لا تعطّل الباقي */ }
    }
  } catch { /* تجاهل */ }
};