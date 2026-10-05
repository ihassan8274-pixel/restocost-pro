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

/** ⭐ دور التشغيل لكل شركة — لا superuser ولا owner. */
const APP_ROLE = 'restocost_app';

export function adminUrl(): string | null {
  return process.env['PG_ADMIN_URL'] ?? null;
}

/**
 *  ⭐ عنوان اتصال مؤقت داخل قاعدة الشركة نفسها: نفس الدور، قاعدة مختلفة.
 *
 *  ⛔ تُحذف وسائط الاستعلام. connection_limit و pool_timeout براميترات
 *     node-postgres، و postgres.js يرفضها بالكامل:
 *       ERROR  unrecognized configuration parameter "connection_limit"
 *     فلا يتصل أصلاً. القياس الفعلي: قراءة قالب العنوان من
 *     DATABASE_URL_TEMPLATE بقت تفشل عند أول postgres(...).
 */
function urlForDb(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = '/' + dbName;
  u.search = '';
  return u.toString();
}

/**
 *  ⭐ صلاحيات قاعدة شركة جديدة — مُقاسة لا مُفترضة.
 *
 *  القياس الفعلي: بعد CREATE DATABASE ترث القاعدة من template1، فيقدر دور
 *  التشغيل يتصل إليها، لكنه يلقى "permission denied for schema public".
 *  السبب أن ملكية مخطط public في PG 15+ هي دور وهمي اسمه pg_database_owner
 *  أي مالك القاعدة الحالي، ودور التشغيل ليس هو. فبلا هذه السطور أول data
 *  plane يقوم ويفشل عند أول CREATE TABLE.
 *
 *  ⛔ هذه الأوامر تُنفَّذ من داخل قاعدة الشركة نفسها. ALTER SCHEMA لا يقبل
 *     اسم قاعدة، فتنفيذه أثناء الاتصال بقاعدة postgres يغيّر مخطط postgres
 *     لا مخطط الشركة. وهذا خطأ وقع فعلاً أثناء العمل على هذه الدالة.
 *
 *  مالك القاعدة هو الدور الذي أنشأها، فهو يقرأ كـ pg_database_owner ويحق له
 *  منح الصلاحيات على المخطط.
 *
 *  القصد idempotent: إعادة تشغيل الدالة بعد فشل جزئي آمنة.
 */
async function grantCompanyDatabase(
  dbName: string,
  adminUrlValue: string,
): Promise<{ ok: boolean; error?: string }> {
  const sql = postgres(urlForDb(adminUrlValue, dbName), { max: 1, connect_timeout: 5 });
  try {
    await sql.unsafe(`GRANT CONNECT, TEMPORARY ON DATABASE "${dbName}" TO ${APP_ROLE}`);
    await sql.unsafe(`GRANT CREATE, USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await sql.unsafe(`REVOKE ALL ON DATABASE "${dbName}" FROM PUBLIC`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
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
  } catch (e) {
    return { ok: false, created: false, message: `فشل الإنشاء: ${(e as Error).message}` };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }

  // ⭐ الصلاحيات بعد الإنشاء — لا تُترك على PUBLIC، ودور التشغيل يُمنح
  //    صراحةً على مخطط قاعدة الشركة. الفشل هنا لا يُخفي إنشاء القاعدة:
  //    نُبلغ عنه ونُبقي القاعدة موجودة حتى تُصحَّح يدوياً.
  const granted = await grantCompanyDatabase(dbName, url);
  if (!granted.ok) {
    return {
      ok: false,
      created: true,
      message:
        `أُنشئت قاعدة ${dbName} لكن فشلت إعطاء صلاحيات ${APP_ROLE}: ${granted.error}. ` +
        'القاعدة موجودة لكن صلاحياتها ناقصة — امنحها يدوياً قبل تشغيل الشركة.',
    };
  }

  return { ok: true, created: true, message: `✅ أُنشئت قاعدة ${dbName}` };
}
