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
import { dataDir, readBindHost, portInUse, sessionUser, readToken } from './core.mjs';
import { ensureStore, store, probeStore } from './store.mjs';
import { requestLogger, writeLog } from './logger.mjs';
import { PKG_VERSION, buildFingerprint, serverStamp } from './version.mjs';
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
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https: http:",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data: https: http:",
    "connect-src 'self' http: https:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  next();
});

// ---- Route groups ----
app.use(requestLogger);

// ---- Server-enforced must-change-password ----
// Accounts seeded/recovered with a known default password are blocked from every
// write (saves, users, backup, telegram, AI …) until they change it. Reads stay
// open; auth/totp/change-password endpoints are exempt so the flow completes.
const AUTH_EXEMPT_WRITES = new Set([
  '/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/me',
  '/api/auth/verify-password', '/api/auth/change-password',
  '/api/auth/totp/setup', '/api/auth/totp/enable', '/api/auth/totp/disable',
]);
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (AUTH_EXEMPT_WRITES.has(req.path)) return next();
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
    build: buildFingerprint,
    server: serverStamp,
  });
});

app.get('/ready', async (req, res) => {
  const reqId = req.reqId;
  try {
    const probe = await probeStore();
    writeLog({ reqId, action: 'GET /ready', status: probe.ok ? 200 : 503, msg: probe.ok ? '' : probe.error });
    if (!probe.ok) return res.status(503).json({ status: 'not_ready', backend: probe.backend, error: probe.error });
    res.json({ status: 'ready', backend: probe.backend, version: PKG_VERSION, build: buildFingerprint, server: serverStamp, ts: new Date().toISOString() });
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

// ---- Static (production build) ----
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distDir, 'index.html'));
    }
    next();
  });
}

// ---- API 404 + global error handler (JSON contract instead of HTML) ----
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'المسار غير موجود' });
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  try { console.error('[routes] unhandled error:', err && (err.stack || err.message)); } catch { /* noop */ }
  if (res.headersSent) return next(err);
  const status = (err && (err.status || err.statusCode)) || 500;
  if (status >= 500) return res.status(500).json({ ok: false, error: 'خطأ داخلي في الخادم' });
  res.status(status).json({ ok: false, error: 'بيانات الطلب غير صالحة' });
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
    process.exit(0);
  })();
};
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

(async () => {
  // --- Database bootstrap: PostgreSQL (Prisma) if configured, else SQLite. ---
  const engine = await ensureStore();
  console.log(`RestoCost ERP Pro: دعم البيانات عبر ${engine.backend === 'postgresql' ? 'PostgreSQL (Prisma)' : 'SQLite (fallback)'}`);
  try { migrateSecretsAtRest(store); } catch (e) { console.error('[secrets] migrate failed:', e && (e.stack || e.message)); }

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
  while (!(await allFree(port)) && port < 3100) port += 1;
  fs.writeFileSync(path.join(__dirname, 'port.txt'), String(port));
  const results = await Promise.all(hosts.map((h) => new Promise((resolve) => {
    const s = http.createServer(app);
    s.once('error', (e) => resolve({ h, ok: false, error: e.message }));
    s.listen(port, h, () => resolve({ h, ok: true }));
  })));
  const bound = results.filter((r) => r.ok).length;
  results.filter((r) => !r.ok).forEach((r) => console.log(`RestoCost ERP Pro: could not bind ${r.h}:${port} — ${r.error}`));
  if (bound === 0) {
    console.error('RestoCost ERP Pro: no address available to bind. Exiting.');
    process.exit(1);
  }
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