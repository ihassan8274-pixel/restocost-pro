// تعرية الأسرار قبل بثّ أي مجموعة إلى المتصفح.
//
// كل مسار يقرأ من KV ويكتب استجابة (bootstrap، paginated، bootstrap-full،
// ولا شيء غيرها) يجب أن يمرّ من هنا. وجود المساعد في وحدة مستقلة يتيح
// اختباره مباشرة بدل الاعتماد على رفع سيرفر كامل.
import { decryptSecret } from './secrets.mjs';

// يزيل hash كلمة المرور وسجلّها وسر TOTP، ويُبقي الحقول الوظيفية
// (الاسم/البريد/الدور/الفرع) التي تعتمد عليها القوائم في الواجهة.
export const stripUserForBroadcast = (u) => {
  if (!u || typeof u !== 'object') return u;
  const { passwordHash, passwordHistory, totpSecret, ...rest } = u;
  return rest;
};

// لا يُبث مفتاح الذكاء الاصطناعي نفسه: يُبث مؤشر hasKey فقط.
export const sanitizeAISettingsForBroadcast = (v) => {
  if (!v || typeof v !== 'object') return v;
  const items = Array.isArray(v.items) ? v.items : [];
  const sanitized = items.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const hasKey = !!decryptSecret(m.apiKey ?? '', 'ai:apiKey');
    const { apiKey, hasKey: _hasKey, ...rest } = m;
    return { ...rest, apiKey: '', hasKey };
  });
  const out = { ...v, items: sanitized };
  delete out.apiKey;
  delete out.hasKey;
  out.hasKey = sanitized.some((m) => m && m.hasKey) || !!decryptSecret(v.apiKey ?? '', 'ai:apiKey');
  return out;
};

// لا يُبث توكن تليجرام: مؤشرات hasBotToken + نسخة مقنّعة (أول 6 وآخر 4).
export const sanitizeTelegramSettingsForBroadcast = (v) => {
  if (!v || typeof v !== 'object') return v;
  const mask = (enc) => {
    const m = String(decryptSecret(enc, ''));
    return m ? `${m.slice(0, 6)}…${m.slice(-4)}` : '';
  };
  return {
    enabled: !!v.enabled,
    chatIds: Array.isArray(v.chatIds) ? v.chatIds : [],
    sendPdf: v.sendPdf !== false,
    hasBotToken: !!decryptSecret(v.botToken ?? '', 'tg:botToken'),
    purchaseEnabled: !!v.purchaseEnabled,
    purchaseChatIds: Array.isArray(v.purchaseChatIds) ? v.purchaseChatIds : [],
    purchaseHasToken: !!decryptSecret(v.purchaseBotToken ?? '', 'tg:purchaseBotToken'),
    maskedBotToken: v.botToken ? mask(v.botToken) : '',
    maskedPurchaseBotToken: v.purchaseBotToken ? mask(v.purchaseBotToken) : '',
  };
};

/**
 * نقطة تعقيم واحدة لكل مسارات البث. أي مفتاح حساس جديد يجب أن يُعرَّف هنا،
 * وإلا تسرب عبر المسار الذي نسيه.
 */
export const sanitizeCollectionForBroadcast = (key, v) => {
  if (key === 'rcerp_users') return (Array.isArray(v) ? v : []).map(stripUserForBroadcast);
  if (key === 'rcerp_ai_settings') return sanitizeAISettingsForBroadcast(v);
  if (key === 'rcerp_telegram_settings') return sanitizeTelegramSettingsForBroadcast(v);
  return v;
};
