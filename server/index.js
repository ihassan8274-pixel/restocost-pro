// RestoCost ERP Pro server — app wiring only.
// Auth/users/audit      → routes/auth.mjs
// Backup/restore/clear   → routes/backup.mjs
// Data/instance/network/companies → routes/data.mjs
// Shared helpers         → core.mjs
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dataDir, readBindHost, portInUse, sessionUser, readToken, isLiveRestoServer, acquireInstanceLock, releaseInstanceLock } from './core.mjs';
import { ensureStore, store, probeStore } from './store.mjs';
import { requestLogger, writeLog } from './logger.mjs';
import { PKG_VERSION, getBuildFingerprint, getClientStamp, serverStamp } from './version.mjs';
import { registerAuth } from './routes/auth.mjs';
import { registerBackup } from './routes/backup.mjs';
import { registerData } from './routes/data.mjs';
import { registerReports } from './routes/report.mjs';
import { registerWebhooksRoutes } from './routes/webhooks.mjs';
import { registerAI } from './routes/ai.mjs';
import { startWebhookWatchdog } from './webhooks.mjs';
import { startBotPolling } from './bot-poll.mjs';
import { registerOpenApi } from './openapi.mjs';
import { migrateSecretsAtRest } from './secrets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Crash resilience ----
// The server must not die because of a stray background error (e.g. an auto-backup
// or scheduler task throwing while the app is idle). Log and keep serving instead of
// letting Node's default behaviour terminate the whole process.
process.on('uncaughtException', (err) => {
  try { console.error('[crash] uncaughtException:', err && (err.stack || err.message)); } catch { /* noop */ }
});
process.on('unhandledRejection', (reason) => {
  try { console.error('[crash] unhandledRejection:', reason instanceof Error ? (reason.stack || reason.message) : reason); } catch { /* noop */ }
});

const app = express();
app.disable('x-powered-by');

// ---- CSRF note (P0 follow-up, NOT implemented) ----
// A naive cookie-token CSRF layer was previously inserted here and had to be
// removed: it ran before express.json() (so req.body was always undefined),
// issued the cookie after verification, and the frontend never sent the header
// — together that made every POST return 403. Real CSRF needs a maintained
// library plus coordinated frontend changes (double-submit cookie wired into
// the API client). Until then the API is protected by Bearer JWT auth, which is
// not attached automatically by browsers, so CSRF risk is low.
app.use(express.json({ limit: '20mb', strict: false }));

// ---- Response compression (no deps): gzip large JSON payloads ----
app.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    try {
      const accept = String(req.headers['accept-encoding'] || '');
      const buf = Buffer.from(JSON.stringify(body ?? ''));
      if (buf.length < 1024 || !accept.includes('gzip')) return origJson(body);
      zlib.gzip(buf, (err, out) => {
        if (err || out.length >= buf.length) return origJson(body);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', out.length);
        res.end(out);
      });
    } catch { return origJson(body); }
  };
  next();
});

// ---- Security headers ----
// NOTE: these apply to API responses. The HTML/JS that browsers actually render
// is served by nginx — see nginx-spa.conf, which carries the same policy plus
// the headers that protect the SPA itself. Keep the two in sync.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // Browsers ignore HSTS on plain http, so this cannot lock anyone out of a
  // local deployment; it activates automatically behind a TLS terminator.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    // 'unsafe-eval' removed: nothing in src/ uses eval or new Function, and the
    // bundle does not need it (verified in a browser with the policy enforced).
    "script-src 'self'",
    "worker-src 'self' blob:",
    // Only the font stylesheet origin instead of every https: origin.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Was `'self' http: https:` — i.e. any host at all, which made the policy
    // meaningless as an exfiltration barrier. All application traffic is
    // same-origin (`/api/...`, 58 call sites); custom AI endpoints are proxied
    // server-side by routes/ai.mjs so they never need browser access. These
    // four are the documented direct fallback used when no session token exists.
    "connect-src 'self' https://generativelanguage.googleapis.com https://api.groq.com https://openrouter.ai https://api.openai.com",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  next();
});

// ---- Route groups ----
app.use(requestLogger);

// ---- Server-enforced must-change-password ----
// Accounts seeded/recovered with a known default password are blocked from every
// endpoint (including reads) until they change it.
// Auth/totp/change-password endpoints are exempt so the flow completes.
const AUTH_EXEMPT_ALL = new Set([
  '/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/me',
  '/api/auth/verify-password', '/api/auth/change-password',
  '/api/auth/totp/setup', '/api/auth/totp/enable', '/api/auth/totp/disable',
]);
app.use((req, res, next) => {
  if (AUTH_EXEMPT_ALL.has(req.path)) return next();
  const u = sessionUser(readToken(req));
  if (!u) return next();
  const users = store.getKV('rcerp_users') || [];
  const me = users.find((x) => x && x.id === u.id);
  if (me && me.mustChangePassword === true) {
    return res.status(403).json({ ok: false, code: 'must_change_password', error: 'يجب تغيير كلمة المرور الافتراضية أولاً قبل استخدام النظام' });
  }
  next();
});

// ---- Health endpoints (no auth, no DB dependency for /health) ----
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    ts: new Date().toISOString(),
    version: PKG_VERSION,
    build: getBuildFingerprint(),
  stamp: getClientStamp(),
    server: serverStamp,
  });
});

app.get('/ready', async (req, res) => {
  const reqId = req.reqId;
  try {
    const probe = await probeStore();
    writeLog({ reqId, action: 'GET /ready', status: probe.ok ? 200 : 503, msg: probe.ok ? '' : probe.error });
    if (!probe.ok) return res.status(503).json({ status: 'not_ready', backend: probe.backend, error: probe.error });
    res.json({ status: 'ready', backend: probe.backend, version: PKG_VERSION, build: getBuildFingerprint(),
  stamp: getClientStamp(), server: serverStamp, ts: new Date().toISOString() });
  } catch (e) {
    writeLog({ reqId, action: 'GET /ready', status: 500, msg: (e && e.message) || e });
    res.status(500).json({ status: 'error', msg: 'ready-check failed' });
  }
});

registerAuth(app);
registerBackup(app);
registerData(app);
registerReports(app);
registerWebhooksRoutes(app);
registerAI(app);
registerOpenApi(app);

// ---- جسر منصة استخراج الفواتير (تطبيق مستقل على منفذ 3100) ----
// يتيح الوصول إلى المنصة من نفس نطاق RestoCost: https://restocost.shop/invoice-platform
const INVOICE_PLATFORM = 'http://127.0.0.1:3100';

// تجميع الجسد الخام كاملاً قبل التمرير — يمنع قطع multipart على المنصة ("Unexpected end of form")
const readRawBody = (req, limit) => new Promise((resolve, reject) => {
  const chunks = [];
  let total = 0;
  req.on('data', (c) => {
    total += c.length;
    if (total > limit) { reject(new Error('الجسد أكبر من الحد المسموح')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

async function proxyInvoicePlatform(req, res) {
  const suffix = req.originalUrl.replace(/^\/invoice-platform/, '') || '/';
  const target = INVOICE_PLATFORM + suffix;
  const isGet = req.method === 'GET' || req.method === 'HEAD';
  let body;
  let headers = { accept: 'application/json, text/plain, */*' };
  if (!isGet) {
    const ct = String(req.headers['content-type'] || '');
    if (ct.startsWith('multipart/form-data')) {
      // نمرر المرفقات كاملة (حتى 100MB) بعد تجميعها — busboy على المنصة يستقبلها سليمة
      body = await readRawBody(req, 100 * 1024 * 1024);
      headers['content-type'] = ct;
      headers['content-length'] = String(body.length);
    } else if (req.body !== undefined) {
      if (Buffer.isBuffer(req.body)) body = req.body;
      else if (typeof req.body === 'object') body = Buffer.from(JSON.stringify(req.body), 'utf8');
      else body = Buffer.from(String(req.body), 'utf8');
      headers['content-type'] = ct || 'application/json';
      headers['content-length'] = String(body.length);
    }
  }
  try {
    const r = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(90000),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.status(r.status);
    const ct = r.headers.get('content-type');
    if (ct) res.set('content-type', ct);
    const cd = r.headers.get('content-disposition');
    if (cd) res.set('content-disposition', cd);
    // منع Cloudflare من خزن الإصدارات القديمة (الوكيل لا يمّرر Cache-Control افتراضياً،
    // و Cloudflare يخمّن max-age=14400 عند غيابه فيبقى نسخة قديمة من app.js والصفحة).
    res.set('cache-control', 'no-cache, no-store, must-revalidate');
    return res.send(buf);
  } catch (e) {
    return res.status(502).json({ ok: false, error: `منصة استخراج الفواتير غير متاحة — شغّلها على المنفذ 3100 ثم أعد المحاولة (${String(e.message || e)})` });
  }
}
// حاجز مصادقة قبل الجسر: منع أي طلب غير مصادق من استخدام المنصة كأنه SSRF proxy مفتوح
// (كانت أي جهة على الشبكة تستطيع استدعاء المنفذ 3100 باسم المضيف). الجسر يستخدم نفس
// جلسة RestoCost — المتصفح يمرر الكوكي تلقائياً لكل الأصول تحت مسار الجسر.
app.all('/invoice-platform*', (req, res, next) => {
  const user = sessionUser(readToken(req));
  if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
  next();
}, proxyInvoicePlatform);

// ---- Static (production build) ----
// __dirname is server/dist; go up two levels to project root, then into dist
const distDir = path.join(__dirname, '..', '..', 'dist');
if (fs.existsSync(distDir)) {
  // index.html دائماً بدون تخزين (no-cache) ليتناول المتصفح أحدث الأسماء المُهاشَمة؛
  // بينما ملفات assets (JS/CSS/خطوط/صور) أسماؤها مُهاشَمة فتُخزَّن طويلاً (immutable).
  app.use(express.static(distDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.set('cache-control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.set('cache-control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    // الملفات ذات التوسعة الناقصة (chunks قديمة من نسخ سابقة) يجب أن تعيد 404 صريحاً
    // بدل index.html، لئلا يحاول المتصفح تنفيذ HTML كـ JS فيفشل الاستيراد الديناميكي.
    if (/\.(js|css|woff2?|ttf|png|svg|ico|json|webp|jpg|jpeg)$/i.test(req.path)) {
      return res.status(404).send('Not found');
    }
    res.set('cache-control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ---- Health check (used by Docker HEALTHCHECK + CI; no auth, cheap) ----
app.get('/api/health', async (req, res) => {
  const started = Date.now();
  let db = 'unknown';
  let backend = 'unknown';
  let dbError = null;
  let dbMs = null;
  try {
    const t0 = Date.now();
    // probeStore() issues a real `SELECT 1` against the active driver. Using
    // store.getKV() here would be WRONG: it is served from the in-memory cache,
    // so it returns "ok" even when PostgreSQL is unreachable (verified: the
    // Docker smoke test reported db:"ok" while every write failed).
    const probe = await probeStore();
    dbMs = Date.now() - t0;
    if (probe && probe.ok) {
      db = 'ok';
      backend = probe.backend;
    } else {
      db = 'unreachable';
      backend = (probe && probe.backend) || 'unknown';
      dbError = String((probe && probe.error) || 'unknown');
    }
  } catch (err) {
    db = 'unreachable';
    dbError = String((err && err.message) || 'unknown');
  }
  const healthy = db === 'ok';
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    version: PKG_VERSION,
    stamp: serverStamp,
    uptimeSec: Math.round(process.uptime()),
    db,
    backend,
    ...(dbError ? { dbError } : {}),
    dbMs,
    totalMs: Date.now() - started,
    ts: new Date().toISOString(),
  });
});

// ---- API 404 + global error handler (JSON contract instead of HTML) ----
app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, error: 'المسار غير موجود' });
  });
  app.use((req, res) => {
    // الملفات ذات التوسعة الناقصة (chunks قديمة) يجب أن تعيد 404 صريحاً —
    // لا أن نريلها index.html لئلا يحاول المتصفح تنفيذ HTML كـ JS.
    if (req.method === 'GET' && /\.(js|css|woff2?|ttf|png|svg|ico|json|webp|jpg|jpeg)$/i.test(req.path)) {
      return res.status(404).json({ ok: false, error: 'الملف غير موجود' });
    }
    const msg = 'المسار غير موجود';
    res.status(404).send(msg);
  });
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  try { console.error('[routes] unhandled error:', err && (err.stack || err.message)); } catch { /* noop */ }
  if (res.headersSent) return next(err);
  const status = (err && (err.status || err.statusCode)) || 500;
  if (status >= 500) return res.status(500).json({ ok: false, error: 'خطأ داخلي في الخادم' });
  res.status(status).json({ ok: false, error: err?.message || 'بيانات الطلب غير صالحة' });
});

// ---- Graceful shutdown: drain the async write queue before exiting ----
let shuttingDown = false;
const gracefulShutdown = (sig) => {
  if (shuttingDown) return;
  shuttingDown = true;
  try { console.log(`\n[shutdown] ${sig} received — draining write queue…`); } catch { /* noop */ }
  const bail = setTimeout(() => process.exit(0), 8000);
  (async () => {
    try { await store.flush(); } catch { /* ignore */ }
    clearTimeout(bail);
    releaseInstanceLock();
    process.exit(0);
  })();
};
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

(async () => {
  // --- Single-instance guard: only one live copy per data dir. Prevents the
  // multi-instance clobbering of port.txt that caused the 2026-09-26 data loss. ---
  const lock = acquireInstanceLock();
  if (!lock.ok) {
    console.error(`RestoCost ERP Pro: another instance is already running in this folder (PID ${lock.pid}). ` +
      'Refusing to start a duplicate to protect the data store and port.txt.');
    console.error('If you believe this is stale, delete server/instance.lock and try again.');
    process.exit(3);
  }
  // --- Database bootstrap: PostgreSQL (Prisma) if configured, else SQLite. ---
  const engine = await ensureStore();
  // ⭐ "fallback" was removed from this label on 2026-10-07 because it was
  //   false. SQLite is the DECLARED system of record on this machine -- see the
  //   header in store.mjs and server/test/store-backend.test.mjs.
  //
  //   Calling it a fallback is exactly what hid the stale DATABASE_URL: the log
  //   said "fallback" while store.mjs's header claimed PostgreSQL was the real
  //   system of record, and nobody reconciled the two statements. The app had
  //   been running on SQLite through an accident, on every start.
  const engineLabel = engine.backend === 'postgresql' ? 'PostgreSQL (Prisma, opted in)' : 'SQLite';
  console.log(`RestoCost ERP Pro: ${engineLabel}`);
  try { migrateSecretsAtRest(store); } catch (e) { console.error('[secrets] migrate failed:', e && (e.stack || e.message)); }
  // --- change_log bounded retention: prune on boot, then every 6h. Keeps the
  // CDC table from growing unbounded (49k+ rows / 9 days observed). ---
  try { await store.pruneChangeLog(); } catch (e) { console.error('[store] initial prune failed:', e && (e.message || e)); }
  // فهرس آخر seq لكل مفتاح: يجعل /api/bootstrap?since=N يعمل بعد إعادة التشغيل
  // (بلا ذلك كانت data فارغة دوماً في وضع delta فالمزامنة التلقائية معطّلة).
  try { await store.seedKvSeqFromLog(); } catch (e) { console.error('[store] seedKvSeq failed:', e && (e.message || e)); }
  // تهيئة تسلسلات أرقام المستندات من أعلى رقم فعلي في البيانات — حتى لا تبدأ
  // الترقيم من 0001 وت collide مع مستند قديم.
  for (const prefix of ['GRN', 'PO', 'PR', 'RET', 'TRF', 'ISS']) {
    try { store.seedDocSeqFromData(prefix); } catch { /* tolerate */ }
  }
  setInterval(() => { try { store.pruneChangeLog(); } catch (e) { console.error('[store] periodic prune failed:', e && (e.message || e)); } }, 6 * 3600 * 1000).unref();

  const bindHost = readBindHost();
  let port = Number(process.env.PORT);
  if (!port) {
    try { port = Number(fs.readFileSync(path.join(__dirname, 'port.txt'), 'utf8').trim()); } catch { /* ignore */ }
  }
  if (!port) port = 3001;
  // Hosts we'll bind to (IPv6 ::1 + IPv4)
  const hosts = ['::1', ...(bindHost === '0.0.0.0' ? ['0.0.0.0'] : ['127.0.0.1'])];
  const allFree = async (p) => {
    for (const h of hosts) {
      if (await portInUse(p, h)) return false;
    }
    return true;
  };
  // Port escalation must never clobber a live RestoCost instance. If the intended
  // port is already served by our app, REFUSE to start (this is the multi-instance
  // guard). Only escalate when the port is held by some unrelated process.
  if (!(await allFree(port))) {
    // Hard port-conflict guard: never escalate to another port silently.
    // External launchers may delete instance.lock before starting; without this
    // guard a new process would quietly move to a sibling port and run a second
    // instance against the same database. Single-instance protection wins.
    const live = await isLiveRestoServer(port, hosts);
    console.error(
      live
        ? `RestoCost ERP Pro: port ${port} is already served by a live RestoCost instance. Refusing to start a duplicate.`
        : `RestoCost ERP Pro: port ${port} is already in use. Refusing to start (no port escalation).`
    );
    releaseInstanceLock();
    process.exit(3);
  }
  const results = await Promise.all(hosts.map((h) => new Promise((resolve) => {
    const s = http.createServer(app);
    s.once('error', (e) => resolve({ h, ok: false, error: e.message }));
    s.listen(port, h, () => resolve({ h, ok: true }));
  })));
  const bound = results.filter((r) => r.ok).length;
  results.filter((r) => !r.ok).forEach((r) => console.log(`RestoCost ERP Pro: could not bind ${r.h}:${port} — ${r.error}`));
  if (bound === 0) {
    console.error('RestoCost ERP Pro: no address available to bind. Exiting.');
    releaseInstanceLock();
    process.exit(1);
  }
  fs.writeFileSync(path.join(__dirname, 'port.txt'), String(port));
  console.log(`RestoCost ERP Pro server running on ${hosts.map((h) => `http://${h}:${port}`).join(' , ')}`);
  console.log(`Backend: ${engine.backend === 'postgresql' ? 'PostgreSQL — restocost2 (Prisma)' : 'SQLite — ' + path.join(dataDir, 'restocost.db')}`);
  if (bindHost === '0.0.0.0') {
    console.log('Public access enabled — the server accepts connections from other devices on the network/internet.');
  } else {
    console.log('Local-only mode — the server is reachable from this device only. Enable public access via إعدادات النظام.');
  }
  startBotPolling();
  startWebhookWatchdog(store);
})();