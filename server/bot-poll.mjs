/**
 * server/bot-poll.mjs — استماع دوري (long polling) لرسائل البوت عبر getUpdates.
 * يعالج رسائل توزيع المخزون الواردة من المستخدمين المصرح لهم (chatIds) ويخزّن
 * مسودة في rcerp_distributions، ثم يرد على المرسل برسالة تأكيد.
 * يُشغَّل من index.js بعد الإقلاع.
 */
import { store } from './store.mjs';
import { processInboundMessage } from './telegram.mjs';
import { decryptSecret } from './secrets.mjs';
import { handleInboundDocument } from './pdf-intake.mjs';
import { startFlow, flowButton, flowText, isFlowCommand, isFlowCancel, flowKey } from './intake-flow.mjs';
import { formatCatalog, saveCatalogMsgId, CATALOG_REFRESH_CB } from './tg-catalog.mjs';

const TELEGRAM_API = 'https://api.telegram.org/bot';
const POLL_INTERVAL_MS = 3000;
const OFFSET_KEY = 'rcerp_telegram_updates_offset';

let running = false;
let busy = false;

const getToken = () => {
  const s = store.getKV('rcerp_telegram_settings');
  const t = s && s.enabled ? decryptSecret(s.botToken || '', 'tg:botToken') : '';
  return t ? t : null;
};

const isAuthorizedChat = (chatId) => {
  const s = store.getKV('rcerp_telegram_settings');
  const allowed = Array.isArray(s && s.chatIds) ? s.chatIds.map(String) : [];
  return allowed.includes(String(chatId));
};

const confirmOffset = async (token, offset) => {
  try {
    await fetch(`${TELEGRAM_API}${token}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset: offset + 1, timeout: 0 }),
    });
  } catch { /* ignore */
  }
};

const flowMsgKey = (chatId) => `rcerp_tg_flow_msg:${chatId}`;

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

const answerCb = (token, callbackQueryId) => {
  try { return post(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId }); } catch { return null; }
};

const sendFlow = async (token, chatId, text, buttons) => {
  const payload = { chat_id: String(chatId), text, parse_mode: 'HTML' };
  if (buttons) payload.reply_markup = { inline_keyboard: buttons };
  const r = await post(token, 'sendMessage', payload);
  return r && r.ok && r.result && r.result.message_id ? r.result.message_id : null;
};

const editFlow = async (token, chatId, messageId, text, buttons) => {
  const payload = { chat_id: String(chatId), message_id: messageId, text, parse_mode: 'HTML' };
  if (buttons) payload.reply_markup = { inline_keyboard: buttons };
  const r = await post(token, 'editMessageText', payload);
  return !!(r && r.ok);
};

/** يطبّق نتيجة دالة التدفق: تعديل رسالة الالتقاط إن أمكن وإلا إرسال جديدة */
const applyFlowResult = async (token, chatId, res) => {
  if (!res || !res.text || res.kind === 'none') return;
  const msgKey = flowMsgKey(chatId);
  const canEdit = res.kind === 'edit' || res.kind === 'commit' || res.kind === 'cancel';
  if (canEdit) {
    const mid = Number(store.getKV(msgKey) || 0);
    if (mid) {
      const ok = await editFlow(token, chatId, mid, res.text, res.buttons || undefined);
      if (ok) {
        if (res.kind === 'commit' || res.kind === 'cancel') store.deleteKV(msgKey);
        return;
      }
    }
  }
  const mid = await sendFlow(token, chatId, res.text, res.buttons || undefined);
  if (mid) store.setKV(msgKey, mid);
};

const handleChatCallback = async (token, chatId, messageId, callbackQueryId, data) => {
  answerCb(token, callbackQueryId);
  if (data && data === CATALOG_REFRESH_CB) {
    const text = formatCatalog(store);
    await editFlow(token, chatId, messageId, text + `\n\n🔄 <b>آخر تحديث:</b> ${new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}`, [[{ text: '🔄 تحديث القائمة', callback_data: CATALOG_REFRESH_CB }]]);
    return;
  }
  const res = await flowButton(store, chatId, data);
  await applyFlowResult(token, chatId, res);
};

const handleChatMessage = async (token, msg) => {
  const chatId = msg.chat && msg.chat.id;
  if (msg.document) {
    const res = await handleInboundDocument(store, token, msg);
    if (res && res.handled && res.reply) await sendFlow(token, chatId, res.reply, undefined);
    return;
  }
  if (!msg.text) return;
  const txt = String(msg.text).trim();

  if (txt && /^\/(قائمة|دليل)\b/.test(txt)) {
    const text = formatCatalog(store);
    const mid = await sendFlow(token, chatId, text, [[{ text: '🔄 تحديث القائمة', callback_data: CATALOG_REFRESH_CB }]]);
    if (mid) saveCatalogMsgId(chatId, mid);
    return;
  }

  const sessionExists = !!store.getKV(flowKey(chatId));

  if (txt && isFlowCommand(txt)) {
    const res = await startFlow(store, chatId);
    if (res.kind === 'error') await sendFlow(token, chatId, res.text, undefined);
    else if (res.kind === 'send') {
      const mid = await sendFlow(token, chatId, res.text, res.buttons || undefined);
      if (mid) store.setKV(flowMsgKey(chatId), mid);
    }
    return;
  }

  if (sessionExists) {
    const res = await flowText(store, chatId, txt);
    if (res.kind !== 'none') { await applyFlowResult(token, chatId, res); return; }
  }

  const res = await processInboundMessage(store, msg);
  if (res && res.handled && res.reply) await sendFlow(token, chatId, res.reply, undefined);
};

export const startBotPolling = () => {
  if (running) return;
  running = true;

  const loop = async () => {
    if (busy) {
      // دورة سابقة ما زالت قيد المعالجة (إرسال بطيء أو استلام طويل) — لا نراكم طلبات.
      setTimeout(loop, POLL_INTERVAL_MS);
      return;
    }
    busy = true;
    try {
      const token = getToken();
      if (token) {
        const currentOffset = Number(store.getKV(OFFSET_KEY) || 0);
        // long-poll: تحدد timeout=30 تبقيه مفتوحاً حتى وصول رسالة جديدة
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 35000);
        const res = await fetch(`${TELEGRAM_API}${token}/getUpdates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset: currentOffset + 1, timeout: 30 }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          let maxId = currentOffset;
          for (const u of data.result) {
            if (typeof u.update_id === 'number' && u.update_id > maxId) maxId = u.update_id;
            // ضغط زر (Inline Keyboard) ← التدفق التفاعلي لتوزيع المخزون
            if (u.callback_query) {
              const cq = u.callback_query;
              const cid = cq.message && cq.message.chat && cq.message.chat.id;
              const cmid = cq.message && cq.message.message_id;
              if (isAuthorizedChat(cid) && cq.data && (cq.data.startsWith('tf:') || cq.data === CATALOG_REFRESH_CB)) {
                await handleChatCallback(token, cid, cmid, cq.id, cq.data);
              }
              continue;
            }
            const msg = u.message || u.edited_message;
            if (!msg) continue;
            const chatId = msg.chat && msg.chat.id;
            if (!isAuthorizedChat(chatId)) continue;
            await handleChatMessage(token, msg);
          }
          if (maxId > currentOffset) {
            store.setKV(OFFSET_KEY, maxId);
          }
        } else if (data.error_code === 409) {
          // تعارض: «جلب المحادثات» من الإعدادات يقطع البول مؤقتاً (تليجرام يسمح بطللب بول واحد
          // للتوكن الواحد). ننتظر أطول قبل إعادة المحاولة حتى يستقر.
          console.log('[bot-poll] 409 conflict — another poller/webhook is active; waiting 8s before retry');
          busy = false;
          setTimeout(loop, 8000);
          return;
        }
      }
    } catch (e) {
      // تجاهل أخطاء الشبكة/المهلات — نعيد المحاولة في الدورة التالية.
      try { console.log('[bot-poll] cycle error:', e && e.message || 'unknown'); } catch { /* ignore */ }
    }
    busy = false;
    setTimeout(loop, POLL_INTERVAL_MS);
  };

  loop();
  console.log('[bot-poll] started — استماع دوري لرسائل البوت');
};

export const stopBotPolling = () => { running = false; };