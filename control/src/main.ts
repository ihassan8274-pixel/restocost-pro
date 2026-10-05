import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ═══════════════════════════════════════════════════════
//  ⭐ تحميل control/.env قبل أي قراءة للإعدادات
//  ⛔⛔ هذا كان ناقصاً تماماً. main.ts كان يقرأ PG_ADMIN_URL و
//    DATABASE_URL_TEMPLATE من process.env مباشرة، وفيهBearer token
//    ماكانش بيتقرا من أي مكان — يعني التشغيل الحقيقي كان بيضيع السر.
//    الأسوأ: config.ts بقى الآن يرمي عند غياب متغير بيئة، فبدون هذا
//    السطر كان Control Plane بيفشل عند الإقلاع ويقول "COMPANY_DB_PASSWORD
//    غير معرّف" وإنت واقف على 4 أسطر في ملف موجود.
//
//  ⭐ process.loadEnvFile موجود في Node 20.12+ / 22+ — مفيش اعتماديات.
//  ⭐ ESM: الاستيرادات بتتنفّذ قبل أي كود في الملف ده، لكن كل حاجة بتقرا
//    process.env بتعمله وقت تشغيل الدوال (مش وقت التحميل)، فالسطر ده
//    بيشتغل قبل أول استدعاء لـ loadConfig().
//  ⭐ الملف اختياري — لو مش موجود (container/deploy) بنكمل بدونه.
// ═══════════════════════════════════════════════════════
for (const rel of ['../control/.env', '../.env', '.env']) {
  const p = resolve(fileURLToPath(new URL('.', import.meta.url)), rel);
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p);
      console.log(`[config] loaded ${rel}`);
    } catch (e) {
      // ⛔ ما بنرميش هنا: ملف .env ناقص أو فيه سطر مش صالح. نترك
      //    loadConfig يبلّغ بمشكلة محددة بدل رسالة غامضة عن .env نفسه.
      console.warn(`[config] ${rel} موجود لكن تعذّر تحميله: ${(e as Error).message}`);
    }
    break;
  }
}

import {
  controlConfig,
  listCompanies,
  getCompany,
  resetCache,
  addCompany,
  updateCompany,
  removeCompany,
  dbNameFrom,
  nextPort,
  POS_SOURCES,
} from './config.js';
import type { PosConfig, PosSource } from './config.js';
import { probe, backupAge } from './health.js';
import { requireWriteToken, guardStatus } from './auth.js';
import { ensureDatabase } from './db.js';

// ═══════════════════════════════════════════════════════
//  ⭐ Control Plane
//  لوحة حالة فقط — بلا قاعدة بيانات، بلا وصول لبيانات الأعمال
// ═══════════════════════════════════════════════════════

const app = Fastify({
  logger: { level: process.env['LOG_LEVEL'] ?? 'info' },
  trustProxy: true,
});

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null,   // ⛔ يفسّر localhost over http
    },
  },
});

await app.register(fastifyStatic, {
  root: fileURLToPath(new URL('../public', import.meta.url)),
  index: ['index.html'],
  cacheControl: true,
  maxAge: 0,
});

// ── صحة اللوحة نفسها ──
app.get('/health', async () => ({
  ok: true,
  service: 'control-plane',
  version: '1.0.0',
  uptime: Math.round(process.uptime()),
}));

// ── ⭐ القائمة الرئيسية ──
app.get('/api/companies', async (_req, reply) => {
  try {
    const companies = await Promise.all(listCompanies().map(probe));
    return {
      ok: true,
      companies: companies.map((c) => ({
        ...c,
        backup: backupAge(c.lastBackup),
      })),
      summary: {
        total: companies.length,
        healthy: companies.filter((c) => c.healthy).length,
        down: companies.filter((c) => !c.healthy).length,
        staleBackup: companies.filter((c) => backupAge(c.lastBackup).stale).length,
        versions: [...new Set(companies.map((c) => c.appVersion ?? '—'))].sort(),
      },
    };
  } catch (e) {
    app.log.error({ err: e }, 'فشل تحميل الإعدادات');
    return reply
      .code(500)
      .send({ ok: false, error: (e as Error).message, companies: [] });
  }
});

// ── شركة واحدة ──
app.get<{ Params: { id: string } }>('/api/companies/:id', async (req, reply) => {
  const c = getCompany(req.params.id);
  if (!c) return reply.code(404).send({ ok: false, error: 'شركة غير معروفة' });
  const status = await probe(c);
  return { ok: true, company: { ...status, backup: backupAge(status.lastBackup) } };
});

// ── ⛔ إعادة تحميل الإعدادات (كتابة ⇒ token) ──
app.post('/api/config/reload', async (req, reply) => {
  requireWriteToken(req, reply);
  if (reply.sent) return;
  try {
    resetCache();
    return { ok: true, reloaded: listCompanies().length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// ═══════════════════════════════════════════════════════
//  ⭐ إدارة الشركات — ⛔ كلها تتطلب token
// ═══════════════════════════════════════════════════════

app.get('/api/admin/status', async () => ({
  ok: true,
  ...guardStatus(),
  pgAdminConfigured: Boolean(process.env['PG_ADMIN_URL']),
}));

// ── ما الذي تحتاجه شركة جديدة؟ (لعرضه في النافذة) ──
app.get('/api/admin/suggest', async () => {
  const list = listCompanies();
  const base = (process.env['PUBLIC_DOMAIN'] ?? 'restocost.shop').replace(/^\./, '');
  return {
    ok: true,
    port: nextPort(list),
    subdomain: 'NEWCOMPANY.' + base,
    databaseName: 'restocost_NEWCOMPANY',
  };
});

// ── إضافة شركة ──
app.post<{
  Body: {
    id?: string; name?: string; nameAr?: string;
    subdomain?: string; port?: number; timezone?: string;
    createDatabase?: boolean;
    pos?: { source?: string; enabled?: boolean };
  };
}>('/api/companies', async (req, reply) => {
  requireWriteToken(req, reply);
  if (reply.sent) return;

  const b = req.body ?? {};
  const id = (b.id ?? '').trim().toLowerCase();
  const name = (b.name ?? '').trim();

  const problems: string[] = [];
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) problems.push('id: أحرف صغيرة + أرقام + شرطات (2-31 حرفاً)');
  if (!name) problems.push('name: مطلوب');
  if (!Number.isInteger(b.port) || (b.port as number) < 1024) problems.push('port: مطلوب (≥1024)');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(b.subdomain ?? '')) problems.push('subdomain: غير صالح');
  if (problems.length) return reply.code(422).send({ ok: false, problems });

  const dbName = `restocost_${id.replace(/-/g, '_')}`;

  // ⭐ pos.source يُرفض هنا قبل إنشاء قاعدة البيانات — خطأ في الإعداد
  //    لا ينبغي أن يترك قاعدة يتيمة على القرص.
  const posSource = (b.pos?.source ?? 'foodics').trim().toLowerCase();
  if (!POS_SOURCES.includes(posSource as PosSource)) {
    return reply.code(422).send({
      ok: false,
      problems: [`pos.source غير معروف: "${posSource}" — المتاح: ${POS_SOURCES.join(' | ')}`],
    });
  }
  const pos: PosConfig = { source: posSource as PosSource, enabled: b.pos?.enabled !== false };

  // ⭐ قاعدة البيانات أولاً — لو فشلت، لا نكتب في الملف
  let db: Awaited<ReturnType<typeof ensureDatabase>> | null = null;
  if (b.createDatabase !== false) {
    db = await ensureDatabase(dbName);
    if (!db.ok) {
      return reply.code(502).send({
        ok: false,
        error: db.message,
        hint: `أنشئها يدوياً ثم أعد المحاولة:\n  CREATE DATABASE ${dbName};`,
        problems: [],
      });
    }
  }

  try {
    const created = addCompany({
      id,
      name,
      nameAr: b.nameAr?.trim() || undefined,
      subdomain: b.subdomain!.trim(),
      port: b.port!,
      databaseUrl: (process.env['DATABASE_URL_TEMPLATE'] ??
        'postgres://restocost:CHANGE_ME@127.0.0.1:5432/PLACEHOLDER')
        .replace('PLACEHOLDER', dbName),
      timezone: b.timezone || 'Asia/Riyadh',
      active: true,
      pos,
    });
    return reply.code(201).send({ ok: true, company: created, database: db });
  } catch (e) {
    return reply.code(409).send({ ok: false, error: (e as Error).message, problems: [] });
  }
});

// ── تعديل شركة ──
app.patch<{
  Params: { id: string };
  Body: Partial<{
    name: string; nameAr: string; subdomain: string; port: number;
    timezone: string; active: boolean;
    pos: PosConfig;
  }>;
}>('/api/companies/:id', async (req, reply) => {
  requireWriteToken(req, reply);
  if (reply.sent) return;

  const patch: Record<string, unknown> = {};
  for (const k of ['name', 'nameAr', 'subdomain', 'timezone'] as const) {
    if (typeof req.body?.[k] === 'string') patch[k] = (req.body[k] as string).trim();
  }
  if (typeof req.body?.port === 'number') patch['port'] = req.body.port;
  if (typeof req.body?.active === 'boolean') patch['active'] = req.body.active;
  // ⭐ تغيير نظام POS للشركة = تعديل إعداد، لا تعديل كود ولا migration.
  if (req.body?.pos && typeof req.body.pos === 'object') {
    const s = (req.body.pos as PosConfig).source;
    if (typeof s !== 'string' || !POS_SOURCES.includes(s as PosSource)) {
      return reply.code(422).send({
        ok: false,
        error: `pos.source غير معروف: "${String(s)}" — المتاح: ${POS_SOURCES.join(' | ')}`,
      });
    }
    patch['pos'] = {
      source: s as PosSource,
      enabled: (req.body.pos as PosConfig).enabled !== false,
    };
  }

  if (Object.keys(patch).length === 0) {
    return reply.code(422).send({ ok: false, error: 'لا حقول للتعديل' });
  }

  try {
    const updated = updateCompany(req.params.id, patch as never);
    return { ok: true, company: updated };
  } catch (e) {
    return reply.code(409).send({ ok: false, error: (e as Error).message });
  }
});

// ── ⛔⛔ حذف — يزيل من الإعدادات فقط. القاعدة لا تُمس. ──
app.delete<{ Params: { id: string }; Querystring: { confirm?: string } }>(
  '/api/companies/:id',
  async (req, reply) => {
    requireWriteToken(req, reply);
    if (reply.sent) return;

    if (req.query.confirm !== req.params.id) {
      return reply.code(400).send({
        ok: false,
        error: 'يلزم ?confirm=<id> لتأكيد الحذف',
        danger: 'هذا يزيل الشركة من الإعدادات فقط — لن تُحذف قاعدة البيانات.',
      });
    }

    try {
      const { id, dbName } = removeCompany(req.params.id);
      return {
        ok: true,
        removed: id,
        databaseKept: dbName,
        nextStep: `حذف القاعدة يدوياً إن أردت:\n  DROP DATABASE ${dbName};  ⛔ بعد التأكد من وجود نسخة`,
      };
    } catch (e) {
      return reply.code(404).send({ ok: false, error: (e as Error).message });
    }
  },
);

// ── ⭐ خطوات ما بعد الإضافة — لا تُؤتمت عمداً (صلاحيات مرتفعة) ──
app.get<{ Params: { id: string } }>('/api/companies/:id/next-steps', async (req, reply) => {
  requireWriteToken(req, reply);
  if (reply.sent) return;

  const c = getCompany(req.params.id);
  if (!c) return reply.code(404).send({ ok: false, error: 'شركة غير معروفة' });

  const dbName = dbNameFrom(c.databaseUrl);
  return {
    ok: true,
    steps: [
      { n: 1, done: false, cmd: `nssm install RestoCost-${c.id} node "E:\\MASSOBI APP\\NEW APP\\api\\dist\\main.js"`, note: 'needs admin PowerShell' },
      { n: 2, done: false, cmd: `nssm set RestoCost-${c.id} AppEnvironmentExtra COMPANY_ID=${c.id} PORT=${c.port}`, note: 'environment' },
      { n: 3, done: false, cmd: `nssm set RestoCost-${c.id} AppEnvironmentExtra DATABASE_URL="<password>@127.0.0.1:5432/${dbName}"`, note: '⚠️ ضع كلمة المرور في .env لا هنا' },
      { n: 4, done: false, cmd: `nssm start RestoCost-${c.id}`, note: 'migrations تُشغّل تلقائياً عند أول إقلاع' },
      { n: 5, done: false, cmd: `cloudflared tunnel route dns restocost ${c.subdomain}`, note: '⛔ سِجل CNAME في لوحة Cloudflare' },
      { n: 6, done: false, cmd: `UPDATE tunnel-ingress` , note: 'أضف اسم المضيف في cloudflared tunnel ingress' },
    ],
  };
});

// ── ⛔ 404 عربي نظيف ──
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/')) {
    return reply.code(404).send({ ok: false, error: `لا يوجد: ${req.url}` });
  }
  return reply.code(404).type('text/html; charset=utf-8').send(
    '<meta charset="utf-8"><h1>404</h1><p><a href="/">العودة للوحة التحكم</a></p>',
  );
});

// ── ⛔ إيقاف نظيف ──
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    app.log.info({ sig }, 'إيقاف نظيف');
    await app.close();
    process.exit(0);
  });
}

// ═══════════════════════════════════════════════════════

const { port } = controlConfig();

try {
  await app.listen({ port, host: '127.0.0.1' });   // 🔴 loopback فقط — أمان
  app.log.info(`🏛️  Control Plane → http://127.0.0.1:${port}`);
} catch (e) {
  app.log.error({ err: e }, 'فشل الإقلاع — تحقّق من config/companies.yaml');
  process.exit(1);
}
