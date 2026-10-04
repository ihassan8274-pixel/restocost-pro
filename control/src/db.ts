// ═══════════════════════════════════════════════════════
//  ⭐ إنشاء قواعد البيانات
//  ⛔ العنوان يأتي من PG_ADMIN_URL env — لا من companies.yaml
//     ولا يُكتب في أي ملف، ولا يُعاد أبداً في أي رد
// ═══════════════════════════════════════════════════════

import postgres from 'postgres';

export interface DbResult {
  ok: boolean;
  created: boolean;
  message: string;
}

const IDENT_RE = /^[a-z][a-z0-9_]{0,62}$/;

export function adminUrl(): string | null {
  return process.env['PG_ADMIN_URL'] ?? null;
}

/**
 * ⭐ CREATE DATABASE لا يقبل parameter داخل معاملة ولا identifier مقتبس.
 *   postgres.js يرسل literals كـ $1 Parameters ⇒ نتحقق بالـ regex ونُمررها
 *   كـ sql() مع raw:true لتكون identifier آمنة بعد التحقق.
 */
export async function ensureDatabase(dbName: string): Promise<DbResult> {
  const url = adminUrl();

  if (!url) {
    return {
      ok: false,
      created: false,
      message:
        'PG_ADMIN_URL غير مضبوط. أنشئ role بـ CREATEDB ثم ضع العنوان في control/.env. ' +
        'القاعدة لن تُنشأ — يمكنك إنشاءها يدوياً بالأمر المرفق.',
    };
  }
  if (!IDENT_RE.test(dbName)) {
    return {
      ok: false,
      created: false,
      message: `اسم قاعدة غير صالح: ${dbName} (أحرف صغيرة + أرقام + _ فقط)`,
    };
  }

  const sql = postgres(url, { max: 1, connect_timeout: 5 });

  try {
    const exists = await sql<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${dbName}) AS exists
    `;
    if (exists[0]?.exists) {
      return { ok: true, created: false, message: `القاعدة ${dbName} موجودة بالفعل` };
    }

    // 🔴 identifier: آمن لأنّه مرّ عبر IDENT_RE أعلاه
    await sql.unsafe(`CREATE DATABASE "${dbName}"`);
    return { ok: true, created: true, message: `✅ أُنشئت قاعدة ${dbName}` };
  } catch (e) {
    return { ok: false, created: false, message: `فشل الإنشاء: ${(e as Error).message}` };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}
