import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

// ═══════════════════════════════════════════════════════
//  ⛔ حارس الكتابة
//  مسارات الكتابة تُنشئ قواعد بيانات وتكتب ملفات
//  ⇒ لا تُكشَف أبداً بلا token
// ═══════════════════════════════════════════════════════

/**
 * ⭐ Read the token LAZILY, never at module scope.
 *
 * ⛔⛔ MEASURED BUG: `const TOKEN = process.env[...] ?? ''` at line 10 captured
 *    the value at import time. ESM evaluates every import before any statement
 *    in main.ts runs, so main.ts's `process.loadEnvFile()` — the code that
 *    actually reads control/.env — had not run yet. TOKEN was therefore always
 *    ''. Every write route answered 503 "write routes disabled" even WITH a
 *    correct Bearer token. Confirmed live:
 *      POST /api/config/reload   -> 503   (with the correct token)
 *    So the Control Plane's write paths — create a database, edit companies.yaml
 *    — were dead on arrival, and the 503 read like a config problem rather
 *    than an ordering one.
 *
 * ⭐ Why lazy is also safer: a module-scope copy of a secret lives in the
 *    module's closure for the process lifetime; there is no reason for it.
 */
const token = (): string => process.env['CONTROL_ADMIN_TOKEN'] ?? '';

export const writeGuardConfigured = (): boolean => token().length > 0;

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
  const TOKEN = token();
  if (TOKEN.length === 0) {
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
  return { writeEnabled: writeGuardConfigured() };
}
