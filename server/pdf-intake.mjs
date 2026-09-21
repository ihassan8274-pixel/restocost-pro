/**
 * server/pdf-intake.mjs — معالجة ملفات PDF الواردة من البوت:
 * تنزيل المرفق، أرشفته (الملف على القرص + فهرس في rcerp_documents)، استخراج نصه
 * ومحاولة استقباله كتوزيع/مشتريات عبر processInboundMessage (نفس محرك النص النصي).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadTelegramFile, processInboundMessage } from './telegram.mjs';
import { extractPdfText } from './pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACH_DIR = path.join(__dirname, 'data', 'attachments');
const MAX_BYTES = 4 * 1024 * 1024; // نفس حد إرسال التليجرام

/**
 * @param {object} store - من store.mjs
 * @param {string} token - توكن البوت الذي استقبل الرسالة
 * @param {object} msg - كائن الرسالة من getUpdates (message/document)
 * @returns {Promise<{handled: boolean, reply: string|null}>}
 */
export const handleInboundDocument = async (store, token, msg) => {
  const chatId = msg.chat && msg.chat.id;
  const doc = msg.document;
  const name = (doc && doc.file_name) || (doc && doc.file_id) || 'ملف';
  const mime = doc && doc.mime_type;
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);
  if (!isPdf) {
    // نستقبل PDF فقط — نُعلم المستخدم دون تحطيم الدورة.
    store.writeAudit('telegram-bot', 'رفض مرفق', null, `ملف غير PDF: ${name}`);
    return { handled: true, reply: `الملف «${name}» ليس PDF — نستقبل ملفات PDF فقط للأرشفة والمعالجة.` };
  }

  const buf = await downloadTelegramFile(token, doc.file_id);
  if (!buf || buf.length === 0) {
    return { handled: true, reply: `تعذر تنزيل الملف «${name}» من تليجرام.` };
  }
  if (buf.length > MAX_BYTES) {
    return { handled: true, reply: `الملف أكبر من 4MB ولا يمكن أرشفته (${(buf.length / 1048576).toFixed(1)}MB).` };
  }

  const id = `doc-${Date.now()}`;
  let text = null;
  try {
    text = await extractPdfText(buf);
  } catch {
    text = null;
  }

  // الأرشفة: الملف على القرص، والفهرس (نص مختصر) في قاعدة البيانات
  try {
    fs.mkdirSync(ATTACH_DIR, { recursive: true });
    fs.writeFileSync(path.join(ATTACH_DIR, `${id}.pdf`), buf);
  } catch (e) {
    return { handled: true, reply: `فشل حفظ الملف على القرص: ${e && e.message || 'خطأ'}` };
  }

  const archive = {
    id,
    name,
    size: buf.length,
    chatId: chatId != null ? String(chatId) : '',
    date: new Date().toISOString(),
    pages: 0,
    chars: text ? text.length : 0,
    textPrefix: text ? text.slice(0, 300) : '',
    source: 'telegram',
    linked: [],
  };

  let intakeReply = null;
  if (text && text.trim()) {
    // محاولة استقبال التوزيع/المشتريات من نص الملف (نفس صيغة الرسائل النصية)
    const res = await processInboundMessage(store, { text });
    if (res && res.handled) {
      const m = (res.reply || '').match(/مراجع:\s*([^\n]+)/);
      if (m && m[1]) archive.linked = m[1].split('،').map((x) => x.trim()).filter(Boolean);
      intakeReply = res.reply;
    }
  }

  const arr = Array.isArray(store.getKV('rcerp_documents')) ? store.getKV('rcerp_documents') : [];
  store.setKV('rcerp_documents', [archive, ...arr]);
  try {
    store.writeAudit('telegram-bot', 'استلام PDF', id, `${name} (${archive.chars} حرف مستخرج)`);
  } catch { /* ignore */ }

  const lines = [
    `📎 تم أرشفة الملف «${name}»`,
    `المرجع: ${id} · الحجم: ${(buf.length / 1024).toFixed(1)}KB`,
  ];
  if (text && text.trim()) {
    lines.push(archive.chars > 0 ? `استُخرج نص (${archive.chars} حرف)` : 'لا يحتوي الملف على نص قابل للاستخراج');
  } else {
    lines.push('تعذر استخراج نص (ماسح ضوئي؟) — أُرشف الملف فقط');
  }
  if (intakeReply) lines.push(`\n${intakeReply}`);

  return { handled: true, reply: lines.join('\n') };
};