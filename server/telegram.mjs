/**
 * server/telegram.mjs — وحدة إرسال تنبيهات تليجرام عبر Bot API.
 * تُستدعى من hooks في data.mjs عند حفظ سجلات مراقبة (جرد، مبيعات، هدر...).
 * تقرأ الإعدادات من rcerp_telegram_settings في قاعدة البيانات.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptSecret } from './secrets.mjs';

const TELEGRAM_API = 'https://api.telegram.org/bot';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// فك تشفير التوكنات المخزنة (AES-GCM عند الراحة) للاستخدام الفعلي في الاتصال.
const tokenOf = (settings, purchase) => {
  if (!settings || typeof settings !== 'object') return '';
  const raw = purchase ? settings.purchaseBotToken : settings.botToken;
  return decryptSecret(raw ?? '');
};

/**
 * إرسال رسالة نصية لقائمة محادثات (chat_ids).
 * @param {object} store - كائن store من store.mjs
 * @param {string} text - نص الرسالة (يدعم Markdown)
 * @param {object} [opts] - خيارات إضافية: parseMode, silent
 * @returns {{ ok: boolean, sent: number, errors: string[] }}
 */
export const sendTelegram = async (store, text, opts = {}) => {
  const settings = store.getKV('rcerp_telegram_settings');
  // channel: 'main' → البوت الرئيسي إلى chatIds، 'purchase' → بوت المستندات (إن ضُبط) إلى purchaseChatIds
  const channel = opts.channel || 'main';
  const purchaseBot = channel === 'purchase' && settings && settings.purchaseEnabled && tokenOf(settings, true);
  const botToken = purchaseBot ? tokenOf(settings, true) : tokenOf(settings, false);
  if (!settings || !settings.enabled || !botToken) {
    return { ok: false, sent: 0, errors: ['تليجرام غير مُفعّل أو التوكن غير موجود'] };
  }
  const ids = channel === 'purchase' ? settings.purchaseChatIds : settings.chatIds;
  const chatIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (chatIds.length === 0) {
    return { ok: false, sent: 0, errors: [channel === 'purchase' ? 'لا توجد مجموعة شراء (chat_ids) مسجلة لإعدادات المشتريات' : 'لا توجد chat IDs مسجلة'] };
  }

  const parseMode = opts.parseMode || 'HTML';
  const disableNotification = opts.silent || false;
  let sent = 0;
  const errors = [];

  // إرسال متوازٍ لكل المحادثات — الإرسال التسلسلي كان يكدّس (مهلة 10ث × عدد الأجهزة)
  // ويتجاوز مهلة استجابة العميل، فيظهر «انتهت مهلة الاتصال بالخادم (30 ثانية)».
  await Promise.all(chatIds.map(async (chatId) => {
    try {
      const url = `${TELEGRAM_API}${botToken}/sendMessage`;
      const body = JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_notification: disableNotification,
      });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (data.ok) {
        sent += 1;
      } else {
        errors.push(`chat ${chatId}: ${data.description || 'unknown error'}`);
      }
    } catch (e) {
      errors.push(`chat ${chatId}: ${e.message || 'network error'}`);
    }
  }));

  // تسيل في السجل
  try {
    const logDir = path.join(__dirname, 'data');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'telegram.log'),
      `${new Date().toISOString()} | sent=${sent} | errors=${errors.length ? errors.join('; ') : 'none'} | text=${text.slice(0, 120)}\n`
    );
  } catch { /* تجاهل */ }

  return { ok: sent > 0, sent, errors };
};

/**
 * إرسال مستند (PDF) لقائمة محادثات (chat_ids) عبر sendDocument.
 * @param {object} store - كائن store من store.mjs
 * @param {Buffer} buffer - محتوى الملف
 * @param {string} filename - اسم الملف (مثال: daily-count-01.pdf)
 * @param {string} [caption] - نص وصفي قصير (يدعم HTML)
 * @returns {{ ok: boolean, sent: number, errors: string[] }}
 */
export const sendTelegramDocument = async (store, buffer, filename, caption = '', channel = 'main') => {
  const settings = store.getKV('rcerp_telegram_settings');
  const purchaseBot = channel === 'purchase' && settings && settings.purchaseEnabled && tokenOf(settings, true);
  const botToken = purchaseBot ? tokenOf(settings, true) : tokenOf(settings, false);
  if (!settings || !settings.enabled || !botToken) {
    return { ok: false, sent: 0, errors: ['تليجرام غير مُفعّل أو التوكن غير موجود'] };
  }
  const ids = channel === 'purchase' ? settings.purchaseChatIds : settings.chatIds;
  const chatIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (chatIds.length === 0) {
    return { ok: false, sent: 0, errors: [channel === 'purchase' ? 'لا توجد مجموعة شراء (chat_ids) مسجلة لإعدادات المشتريات' : 'لا توجد chat IDs مسجلة'] };
  }

  let sent = 0;
  const errors = [];

  // إرسال متوازٍ (كما في الرسائل النصية) حتى لا تتجاوز المدة الإجمالية مهلة العميل.
  await Promise.all(chatIds.map(async (chatId) => {
    try {
      const url = `${TELEGRAM_API}${botToken}/sendDocument`;
      const fd = new FormData();
      fd.append('chat_id', String(chatId));
      fd.append('document', new Blob([buffer], { type: 'application/pdf' }), filename);
      if (caption) fd.append('caption', caption);
      fd.append('parse_mode', 'HTML');
      fd.append('disable_notification', 'false');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (data.ok) {
        sent += 1;
      } else {
        errors.push(`chat ${chatId}: ${data.description || 'unknown error'}`);
      }
    } catch (e) {
      errors.push(`chat ${chatId}: ${e.message || 'network error'}`);
    }
  }));

  // تسيل في السجل
  try {
    const logDir = path.join(__dirname, 'data');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'telegram.log'),
      `${new Date().toISOString()} | doc=${filename} | sent=${sent} | errors=${errors.length ? errors.join('; ') : 'none'} | caption=${caption.slice(0, 120)}\n`
    );
  } catch { /* تجاهل */ }

  return { ok: sent > 0, sent, errors };
};

/**
 * تنزيل مرفق من تليجرام عبر getFile API.
 * @returns {Promise<Buffer>} محتوى الملف (فارغ عند فشل).
 */
export const downloadTelegramFile = async (botToken, fileId) => {
  try {
    const infoRes = await fetch(`${TELEGRAM_API}${botToken}/getFile?file_id=${encodeURIComponent(String(fileId))}`);
    const info = await infoRes.json();
    const filePath = info && info.result && info.result.file_path;
    if (!filePath) return Buffer.alloc(0);
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const fb = await fetch(fileUrl);
    if (!fb.ok) return Buffer.alloc(0);
    return Buffer.from(await fb.arrayBuffer());
  } catch {
    return Buffer.alloc(0);
  }
};

/**
 * اختبار الاتصال: يُرسل رسالة اختبار إلى أول chat_id.
 * يستخدم من POST /api/telegram/test. channel: 'main' أو 'purchase' (بوت مستقل).
 */
export const testTelegram = async (store, customChatId, channel = 'main') => {
  const settings = store.getKV('rcerp_telegram_settings');
  const isPurchase = channel === 'purchase';
  const usePurchaseBot = isPurchase && settings && settings.purchaseEnabled && tokenOf(settings, true);
  const botToken = usePurchaseBot ? tokenOf(settings, true) : tokenOf(settings, false);
  if (!settings || !botToken) {
    return { ok: false, error: 'التوكن غير موجود' };
  }
  const source = isPurchase ? settings.purchaseChatIds : settings.chatIds;
  const chatId = customChatId || (Array.isArray(source) ? source[0] : null);
  if (!chatId) {
    return { ok: false, error: isPurchase ? 'لا توجد مجموعة شراء مسجلة' : 'لا يوجد chat_id' };
  }
  try {
    const url = `${TELEGRAM_API}${botToken}/sendMessage`;
    const body = JSON.stringify({
      chat_id: chatId,
      text: isPurchase
        ? '✅ اتصال بوت المشتريات يعمل!\nRestoCost ERP — ستصلك طلبات الشراء وأوامر التوريد المبدئية هنا.'
        : '✅ تم الاتصال بنجاح!\nRestoCost ERP — تنبيهات تليجرام مُفعّلة.',
      parse_mode: 'HTML',
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.ok) return { ok: true, chatId };
    return { ok: false, error: data.description || 'فشل الإرسال' };
  } catch (e) {
    return { ok: false, error: e.message || 'خطأ في الشبكة' };
  }
};

/**
 * الحصول على محادثات البوت المتاحة (chat_id + اسم المستخدم لعرضها في الإعدادات).
 * يعمل عبر getUpdates — يجلب كل من تواصل مع البوت (بعد /start).
 */
export const getBotChatIds = async (store, channel = 'main') => {
  const settings = store.getKV('rcerp_telegram_settings');
  const isPurchase = channel === 'purchase';
  const usePurchaseBot = isPurchase && settings && settings.purchaseEnabled && tokenOf(settings, true);
  const botToken = usePurchaseBot ? tokenOf(settings, true) : tokenOf(settings, false);
  if (!settings || !botToken) return { ok: false, error: 'التوكن غير موجود' };
  try {
    const url = `${TELEGRAM_API}${botToken}/getUpdates`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description || 'فشل جلب التحديثات' };
    const seen = new Map();
    (data.result || []).forEach((u) => {
      const m = u.message || u.edited_message;
      let chat = m ? m.chat : null;
      let date = m ? m.date : null;
      // عند إضافة البوت إلى مجموعة يصل تحديث my_chat_member — نلتقط معرّف المجموعة منه أيضاً
      if (!chat && u.my_chat_member && u.my_chat_member.chat) {
        chat = u.my_chat_member.chat;
        date = u.my_chat_member.date;
      }
      if (!chat) return;
      // قناة المشتريات: المجموعات فقط (لا محادثات شخصية) — حتى لا يُرسل لرقمك الشخصي
      if (isPurchase && chat.type !== 'group' && chat.type !== 'supergroup' && chat.type !== 'channel') return;
      const item = {
        id: String(chat.id),
        title: chat.username
          ? `@${chat.username}`
          : (chat.title || (chat.first_name ? `${chat.first_name} ${chat.last_name || ''}`.trim() : String(chat.id))),
        username: chat.username || null,
        type: chat.type || null,
        date: date || null,
      };
      if (!seen.has(item.id)) seen.set(item.id, item);
    });
    const chats = Array.from(seen.values());
    // مرتّب بترتيب آخر تواصل
    chats.sort((a, b) => (b.date || 0) - (a.date || 0));
    return { ok: true, chats };
  } catch (e) {
    return { ok: false, error: e.message || 'خطأ في الشبكة' };
  }
};

/**
 * أشكال التنبيهات — تُولّد نصوص تليجرام حسب نوع الحدث.
 */
export const buildNotificationText = (event) => {
  const { type, actor, branch, date, itemCount, totalValue, details } = event;
  switch (type) {
    case 'daily_count':
      return [
        `📦 <b>جرد يومي جديد</b>`,
        `🏪 الفرع: <b>${branch || '—'}</b>`,
        `👤 القائم بالجرد: <b>${actor || '—'}</b>`,
        `📅 التاريخ: ${date || '—'}`,
        `📊 عدد الأصناف: ${itemCount || 0}`,
        totalValue ? `💰 القيمة: ${Number(totalValue).toLocaleString('ar-SA')}` : null,
        details ? `📝 ${details}` : null,
        `\n<i>RestoCost ERP</i>`,
      ].filter(Boolean).join('\n');

    case 'batch_sales':
      return [
        `🧾 <b>سجل مبيعات جديد</b>`,
        `🏪 الفرع: <b>${branch || '—'}</b>`,
        `👤 القائم: <b>${actor || '—'}</b>`,
        `📅 التاريخ: ${date || '—'}`,
        totalValue ? `💰 الإجمالي: ${Number(totalValue).toLocaleString('ar-SA')}` : null,
        `\n<i>RestoCost ERP</i>`,
      ].filter(Boolean).join('\n');

    case 'wastage':
      return [
        `⚠️ <b>تسجيل هدر جديد</b>`,
        `🏪 الفرع: <b>${branch || '—'}</b>`,
        `👤 القائم: <b>${actor || '—'}</b>`,
        details ? `📝 ${details}` : null,
        `\n<i>RestoCost ERP</i>`,
      ].filter(Boolean).join('\n');

    case 'low_stock':
      return [
        `🔔 <b>تنبيه: مخزون منخفض</b>`,
        `📦 الصنف: <b>${details || '—'}</b>`,
        `\n<i>RestoCost ERP</i>`,
      ].filter(Boolean).join('\n');

    case 'custom':
      return event.text || '🔔 تنبيه من RestoCost ERP';

    default:
      return [
        `🔔 <b>تنبيه جديد</b>`,
        `📋 النوع: ${type}`,
        actor ? `👤 بواسطة: ${actor}` : null,
        details ? `📝 ${details}` : null,
        `\n<i>RestoCost ERP</i>`,
      ].filter(Boolean).join('\n');
  }
};

/**
 * استقبال رسالة واردة من تليجرام: إذا بدأت بـ "من" (توزيع مخزون) يُنشئ مسودة في
 * rcerp_distributions ليُراجعها مدير المخزون من شاشة «توزيع المخزون»، ويرد على المرسل.
 * @param {object} store - من store.mjs
 * @param {object} msg - كائن الرسالة من getUpdates (message)
 * @returns {Promise<{handled: boolean, reply: string|null}>}
 */
export const processInboundMessage = async (store, msg) => {
  try {
    const text = (msg.text || '').trim();
    const hasIntakeHint = /(من|سحب|إلى|الى|تقسيم|تم تحويل|خذيت|شلت|حطيت)/.test(text);
    if (!text || !hasIntakeHint) return { handled: false, reply: null };

    const { processIntakeText } = await import('./intake.mjs');
    const res = processIntakeText(store, text);
    if (!res.ok || !res.drafts || res.drafts.length === 0) {
      if (!res.handled) return { handled: false, reply: null };
      return { handled: true, reply: `تعذر تحليل الرسالة:\n${res.error}\n\nالصيغة المتوقعة:\n١٠ سبتمبر\nمن مخزن الجامعين ١٥٠ قشطة السعيدة.\nإلى\n٢٥ الجبيل\n٢٠ المنار` };
    }

    const { analyzeMatchQuality, isFullyMatched, autoRaiseDistribution, addToInbox } = await import('./intake-inbox.mjs');
    const savedIds = [];
    const inboxIds = [];
    res.drafts.forEach((d, idx) => {
      const quality = analyzeMatchQuality(d);
      if (isFullyMatched(quality)) {
        const { distId } = autoRaiseDistribution(store, d, text);
        savedIds.push(distId);
      } else {
        const { inboxId } = addToInbox(store, d, text, msg.chat && msg.chat.id, msg.from && msg.from.first_name);
        inboxIds.push(inboxId);
      }
    });

    const reply = [
      res.reply,
      ...(res.warnings || []),
      savedIds.length ? `✅ رُفعت تلقائياً (مطابقة 100%): ${savedIds.map((x) => x.replace('dist-', '')).join('، ')} — اذهب لشاشة التحويلات لاعتمادها.` : '',
      inboxIds.length ? `⚠️ دخلت صندوق التحقق (نقص/تشابه في المطابقة): ${inboxIds.length} رسالة — راجعها من شاشة «صندوق التحقق» لرفعها أو رفضها.` : '',
      '💡 لتوزيع باللمس دون كتابة أسماء: أرسل /توزيع',
    ].filter(Boolean).join('\n');

    return { handled: true, reply };
  } catch (e) {
    try {
      store.writeAudit('telegram-bot', 'فشل استقبال', null, String(e && e.message || ''));
    } catch { /* ignore */ }
    return { handled: false, reply: `حدث خطأ أثناء معالجة الرسالة: ${e && e.message || 'غير معروف'}` };
  }
};
