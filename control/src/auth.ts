import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

// ═══════════════════════════════════════════════════════
//  ⛔ حارس الكتابة
//  مسارات الكتابة تُنشئ قواعد بيانات وتكتب ملفات
//  ⇒ لا تُكشَف أبداً بلا token
// ═══════════════════════════════════════════════════════

const TOKEN = process.env['CONTROL_ADMIN_TOKEN'] ?? '';

export const writeGuardConfigured = TOKEN.length > 0;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // ⭐ timingSafeEqual يرمي إذا اختلف الطول — قارن الأطوال أولاً
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function requireWriteToken(
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  // ⛔ لا token مضبوط = مسارات الكتابة مغلقة بالكامل
  if (!writeGuardConfigured) {
    reply.code(503).send({
      ok: false,
      error:
        'مسارات الكتابة معطّلة. عيّن CONTROL_ADMIN_TOKEN في control/.env ثم أعد التشغيل.',
    });
    return;
  }

  const header = req.headers.authorization ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!provided || !safeEqual(provided, TOKEN)) {
    reply.code(401).send({ ok: false, error: 'token غير صحيح' });
    return;
  }
}

/** ⭐ واجهة لقراءة حالة الحماية — بدون كشف القيمة */
export function guardStatus(): { writeEnabled: boolean } {
  return { writeEnabled: writeGuardConfigured };
}
