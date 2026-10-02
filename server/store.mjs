/**
 * server/store.mjs — data-access layer for the RestoCost ERP server.
 *
 * Architecture (PostgreSQL migration step):
 *  - PostgreSQL is the system of record via Prisma whenever DATABASE_URL is set.
 *  - An in-memory cache mirrors the KV/session/rate-limit/audit state so the
 *    existing synchronous callers (routes, telegram, intake, pdf …) keep working
 *    unchanged.
 *  - Writes update the cache synchronously, then flow to PostgreSQL through a
 *    serialized async queue (order preserved, never blocks callers).
 *  - If DATABASE_URL is missing, the legacy SQLite path is used as a fallback
 *    (seed scripts, tests, or environments without PostgreSQL).
 *
 * The exported `store` object has a stable shape (methods are always present),
 * so `const { getKV } = store` inside importing modules stays valid. The store
 * must be initialized once via `await ensureStore()` before the HTTP server
 * starts (index.js does this). Before that, methods call into the resolver and
 * behave as a no-op-safe SQLite fallback.
 */

import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const fileURLDir = (url) => {
  let p = decodeURIComponent(new URL(url).pathname).replace(/[\\/][^\\/]*$/, '');
  if (p[0] === '/') p = p.slice(1);
  return p;
};

// Load server/.env if present (Node 20.12+ built-in, no dotenv dependency).
const loadDotEnv = () => {
  try {
    const envFile = path.join(fileURLDir(import.meta.url), '.env');
    if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  } catch { /* .env is optional */ }
};
loadDotEnv();

const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; };

export const SESSION_TTL_MS = num(process.env.SESSION_TTL_MS, 30 * 24 * 3600 * 1000); // sessions expire after 30 days of inactivity
export const LOGIN_MAX_ATTEMPTS = num(process.env.LOGIN_MAX_ATTEMPTS, 5);              // lock an account after 5 failed logins
export const LOGIN_LOCK_MS = num(process.env.LOGIN_LOCK_MS, 10 * 60 * 1000);            // ...for 10 minutes
export const CHANGELOG_RETENTION_MS = num(process.env.CHANGELOG_RETENTION_DAYS, 7) * 24 * 3600 * 1000; // keep change_log rows for this long (configurable)
const CHANGELOG_FLOOR = 5000; // never prune the most recent rows even if stale

const hasPg = () => Boolean(process.env.DATABASE_URL);

// Serialized async write queue: preserves order of every mutation while never
// blocking synchronous callers. A failure is logged and the queue keeps going
// (the in-memory cache stays authoritative for the process lifetime).
const makeQueue = () => {
  let chain = Promise.resolve();
  const push = (fn) => {
    chain = chain.then(fn).catch((err) => {
      try { console.error('[store:pg] persist error:', err && (err.message || err)); } catch { /* noop */ }
    });
    return chain;
  };
  // Await every queued write (and anything scheduled afterwards) — used by the
  // graceful-shutdown path so no acknowledged write is lost on restart.
  const flush = async () => chain;
  return { push, flush };
};

// ---------------------------------------------------------------------------
// PostgreSQL-backed store (primary)
// ---------------------------------------------------------------------------
const createPgStore = async (prisma) => {
  const queue = makeQueue();

  // ---- boot: load KV + sessions + rate limits + recent audit into cache ----
  const kv = new Map();
  try {
    const rows = await prisma.kv.findMany();
    for (const r of rows) {
      try {
        const raw = typeof r.value === 'string' ? r.value : JSON.stringify(r.value ?? 'null');
        kv.set(r.key, JSON.parse(raw));
      } catch { kv.set(r.key, null); }
    }
  } catch { /* tolerate */ }

  const sessions = new Map();
  try {
    for (const s of await prisma.session.findMany()) sessions.set(s.token, { userId: s.userId, createdAt: new Date(s.createdAt) });
  } catch { /* tolerate */ }

  const rateLimits = new Map();
  try {
    for (const row of await prisma.rateLimit.findMany()) {
      rateLimits.set(row.key, { count: Number(row.count) || 0, windowStart: Number(row.windowStart) || 0, lockedUntil: row.lockedUntil ? Number(row.lockedUntil) : null });
    }
  } catch { /* tolerate */ }

  let auditCache = [];
  try {
    const recent = await prisma.auditLog.findMany({ orderBy: [{ ts: 'desc' }, { id: 'desc' }], take: 1000 });
    auditCache = recent.reverse().map((r) => ({
      id: r.id, ts: r.ts, actorId: r.actorId, actorEmail: r.actorEmail,
      action: r.action, targetId: r.targetId, detail: r.detail,
    }));
  } catch { /* tolerate */ }

  let rev = 0;
  const bootAt = Date.now();

  // ---- CDC: change-data-capture log (تعويض الاعتماد على _mtime) ----
  // كل كتابة (set/delete) تُسجَّل بنسخة seq متزايدة في جدول change_log عبر
  // نفس قائمة الكتابة التسلسلية — فيأخذها الجهاز "ما تغيّر" بدل سحب الكل.
  const cdc = [];
  let cdcNext = 0;
  try {
    const last = await prisma.changeLog.aggregate({ _max: { seq: true } });
    cdcNext = Number(last?._max?.seq ?? 0) + 1;
  } catch { /* tolerate */ }
  // آخر seq تعديل لكل مفتاح — يخدم /api/bootstrap?since=N.
  // كان الطلب يستدعي store.getKvMeta وهو غير معرَّف، فيعود null دائماً ⇒
  // lastMod=0 ⇒ 0 <= since ⇒ كل مفتاح يُتخطّى ⇒ data فارغة في كل طلب delta
  // (المزامنة التلقائية بين الأجهزة مكسورة بصمت).
  const kvSeq = new Map();
  const getKvMeta = (key) => {
    const seq = kvSeq.get(key);
    return seq === undefined ? null : { lastModified: seq, seq };
  };
  const cdcPush = (key, op) => {
    // Skip CDC for high-frequency system keys to reduce DB writes
    if (key.startsWith('rcerp_sessions') || key.startsWith('rcerp_rate_limits') || key.startsWith('rcerp_audit') || key.startsWith('rcerp_telegram_')) return;
    const seq = cdcNext++;
    cdc.push({ seq, key, op, ts: Date.now() });
    kvSeq.set(key, seq);
    if (cdc.length > 5000) cdc.splice(0, cdc.length - 5000);
    queue.push(() => prisma.changeLog.create({ data: { seq, key, op } }));
    return seq;
  };
  const cdcSince = (since, limit = 500) => {
    const out = [];
    for (const e of cdc) { if (e.seq > since) out.push(e); if (out.length >= limit) break; }
    return out;
  };
  // على الإقلاع: بناء فهرس آخر seq لكل مفتاح من change_log (حتى بعد إعادة
  // التشغيل يعرف أي مفتاح تغيّر منذ أي watermark محفوظ في جهاز).
  const seedKvSeqFromLog = async () => {
    try {
      const rows = await prisma.changeLog.groupBy({ by: ['key'], _max: { seq: true } });
      for (const r of rows) if (r._max && r._max.seq !== null && r._max.seq !== undefined) kvSeq.set(r.key, r._max.seq);
      return kvSeq.size;
    } catch { return 0; }
  };

  function getKV(key) {
    return kv.has(key) ? kv.get(key) : null;
  }

  const persistKV = (key) => {
    const value = kv.get(key) ?? null;
    queue.push(() => prisma.kv.upsert({
      where: { key },
      create: { key, value: value ?? {} },
      update: { value: value ?? {} },
    }));
  };
  const setKV = (key, value) => {
    rev += 1; kv.set(key, value); persistKV(key); cdcPush(key, 'set');
  };
  const deleteKV = (key) => { rev += 1; kv.delete(key); queue.push(() => prisma.kv.deleteMany({ where: { key } })); cdcPush(key, 'del'); };
  const setKVMany = (entries) => {
    if (entries.size === 0) return;
    rev += 1;
    for (const [key, value] of entries) kv.set(key, value);
    for (const key of entries.keys()) cdcPush(key, 'set');
    queue.push(async () => {
      await prisma.$transaction(
        [...entries].map(([key, value]) => prisma.kv.upsert({
          where: { key },
          create: { key, value: value ?? {} },
          update: { value: value ?? {} },
        }))
      );
    });
  };
  const kvKeysByPrefix = (prefix) => Array.from(kv.keys()).filter((k) => k.startsWith(prefix));
  const kvEntriesByPrefix = (prefix) => kvKeysByPrefix(prefix).map((key) => ({ key, value: JSON.stringify(kv.get(key) ?? null) }));

  // ---- Sessions ----
  const persistSession = (token) => {
    const s = sessions.get(token);
    queue.push(() => prisma.session.upsert({
      where: { token },
      create: { token, userId: s ? s.userId : '', createdAt: s ? s.createdAt : new Date() },
      update: { userId: s ? s.userId : '' },
    }));
  };
  const persistSessionDelete = (token) => queue.push(() => prisma.session.deleteMany({ where: { token } }));

  const createSession = (token, userId) => { sessions.set(token, { userId, createdAt: new Date() }); persistSession(token); };
  const deleteSession = (token) => { sessions.delete(token); persistSessionDelete(token); };
  const deleteSessionsByUser = (userId) => {
    for (const [t, s] of sessions) { if (s.userId === userId) { sessions.delete(t); persistSessionDelete(t); } }
  };
  const deleteOtherSessions = (userId, exceptToken) => {
    for (const [t, s] of sessions) { if (s.userId === userId && t !== exceptToken) { sessions.delete(t); persistSessionDelete(t); } }
  };
  const purgeAllSessions = () => { sessions.clear(); queue.push(() => prisma.session.deleteMany({})); };
  const purgeExpiredSessions = () => {
    const cutoff = new Date(Date.now() - SESSION_TTL_MS);
    for (const [t, s] of sessions) { if (s.createdAt < cutoff) { sessions.delete(t); persistSessionDelete(t); } }
  };
  const sessionRow = (token) => sessions.get(token) || null;

  // ---- Rate limiting ----
  const persistRateLimit = (key) => {
    const row = rateLimits.get(key);
    queue.push(() => prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: row ? row.count : 0, windowStart: row ? row.windowStart : 0, lockedUntil: row ? row.lockedUntil : null },
      update: { count: row ? row.count : 0, windowStart: row ? row.windowStart : 0, lockedUntil: row ? row.lockedUntil : null },
    }));
  };
  const rateLimitGet = (key) => {
    const row = rateLimits.get(key);
    if (!row) return null;
    if (row.lockedUntil && row.lockedUntil > Date.now()) return { count: row.count, lockedUntil: row.lockedUntil };
    if (row.lockedUntil && row.lockedUntil <= Date.now()) {
      rateLimits.delete(key);
      queue.push(() => prisma.rateLimit.deleteMany({ where: { key } }));
      return null;
    }
    if (Date.now() - (row.windowStart || 0) > LOGIN_LOCK_MS) {
      row.count = 0; row.windowStart = Date.now(); row.lockedUntil = null;
      persistRateLimit(key);
      return { count: 0, lockedUntil: 0 };
    }
    return { count: row.count, lockedUntil: row.lockedUntil || 0 };
  };
  const rateLimitRegisterFailure = (key) => {
    const rec = rateLimitGet(key);
    const count = (rec ? rec.count : 0) + 1;
    const lockedUntil = count >= LOGIN_MAX_ATTEMPTS ? Date.now() + LOGIN_LOCK_MS : null;
    rateLimits.set(key, { count, windowStart: Date.now(), lockedUntil });
    persistRateLimit(key);
    return { count, lockedUntil };
  };
  const rateLimitClear = (key) => { rateLimits.delete(key); queue.push(() => prisma.rateLimit.deleteMany({ where: { key } })); };
  const purgeExpiredRateLimits = () => {
    const now = Date.now();
    for (const [k, row] of rateLimits) {
      if (row.lockedUntil && row.lockedUntil <= now) {
        rateLimits.delete(k);
        queue.push(() => prisma.rateLimit.deleteMany({ where: { key: k } }));
      }
    }
  };

  // ---- Audit log (append-only; cached for sync reads) ----
  const writeAudit = (actor, action, targetId = null, detail = '') => {
    const entry = {
      ts: new Date(),
      actorId: actor ? actor.id : null,
      actorEmail: actor ? actor.email : null,
      action,
      targetId: targetId || null,
      detail: detail || null,
    };
    auditCache.push(entry);
    if (auditCache.length > 2000) auditCache = auditCache.slice(-1500);
    queue.push(() => prisma.auditLog.create({ data: entry }));
  };
  const getAuditLogs = (limit = 200) => Array.from(auditCache).reverse().slice(0, limit);

  // ---- change_log pruning (bounded retention) ----
  // يحذف الصفوف الأقدم من فترة الاحتفاظ، مع طابق seq (حد أدنى) كي لا تُمسح
  // الأحداث الحديثة حتى لو مرّت فترة الاحتفاظ. يعتمد على فهرس ts القائم.
  const pruneChangeLog = async () => {
    try {
      const cutoff = new Date(Date.now() - CHANGELOG_RETENTION_MS);
      const max = await prisma.changeLog.aggregate({ _max: { seq: true } });
      const maxSeq = Number(max?._max?.seq ?? 0);
      const floor = Math.max(0, maxSeq - CHANGELOG_FLOOR);
      const res = await prisma.changeLog.deleteMany({ where: { ts: { lt: cutoff }, seq: { lt: floor } } });
      if (res.count > 0) console.log(`[store:pg] pruned ${res.count} change_log rows`);
      return res.count;
    } catch (e) {
      try { console.error('[store:pg] pruneChangeLog error:', e && (e.message || e)); } catch { /* noop */ }
      return 0;
    }
  };

  return {
    db: null, // مقروء من الكاش — لا اعتماد على SQLite
    backend: 'postgresql',
    pg: true,
    getKV, setKV, deleteKV, kvKeysByPrefix, kvEntriesByPrefix, setKVMany,
    cdcSince, pruneChangeLog,
    getKvMeta, seedKvSeqFromLog,
    createSession, deleteSession, deleteSessionsByUser, deleteOtherSessions,
    purgeAllSessions, purgeExpiredSessions, sessionRow,
    rateLimitGet, rateLimitRegisterFailure, rateLimitClear, purgeExpiredRateLimits,
    writeAudit, getAuditLogs,
    revState: () => ({ rev, boot: bootAt, cdc: cdcNext - 1 }),
    flush: queue.flush,
    _prisma: prisma,
  };
};

// ---------------------------------------------------------------------------
// Legacy SQLite-backed store (fallback)
// ---------------------------------------------------------------------------
const createSqliteStore = (dbPath) => {
  const dataDir = path.join(fileURLDir(import.meta.url), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbPath || path.join(dataDir, 'restocost.db'));

  db.exec(`
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(createdAt);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actorId TEXT,
  actorEmail TEXT,
  action TEXT NOT NULL,
  targetId TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actorId);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  windowStart INTEGER NOT NULL DEFAULT 0,
  lockedUntil INTEGER
);
CREATE TABLE IF NOT EXISTS change_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  op TEXT NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cdc_key ON change_log(key);
CREATE INDEX IF NOT EXISTS idx_cdc_ts ON change_log(ts);
`);

  let rev = 0;
  const bootAt = Date.now();

  // ---- CDC log (مثل PG): كل كتابة تُسجَّل بنسخة متزايدة ----
  let cdcNext = 1;
  try { const row = db.prepare('SELECT COALESCE(MAX(seq),0) AS m FROM change_log').get(); cdcNext = (row ? Number(row.m) : 0) + 1; } catch { /* tolerate */ }
  const kvSeq = new Map();
  const getKvMeta = (key) => {
    const seq = kvSeq.get(key);
    return seq === undefined ? null : { lastModified: seq, seq };
  };
  const seedKvSeqFromLog = async () => {
    try {
      const rows = db.prepare('SELECT key, MAX(seq) AS m FROM change_log GROUP BY key').all();
      for (const r of rows) if (r.m !== null && r.m !== undefined) kvSeq.set(r.key, Number(r.m));
      return kvSeq.size;
    } catch { return 0; }
  };
  const cdcPush = (key, op) => {
    if (key.startsWith('rcerp_sessions') || key.startsWith('rcerp_rate_limits') || key.startsWith('rcerp_audit') || key.startsWith('rcerp_telegram_')) return;
    const seq = cdcNext++;
    kvSeq.set(key, seq);
    const ts = new Date().toISOString();
    try { db.prepare('INSERT INTO change_log (seq, key, op, ts) VALUES (?, ?, ?, ?)').run(seq, key, op, ts); } catch { /* CDC must never break the app */ }
    return seq;
  };
  const cdcSince = (since, limit = 500) => {
    try {
      return db.prepare('SELECT seq, key, op, ts FROM change_log WHERE seq > ? ORDER BY seq ASC LIMIT ?').all(since, limit).map((r) => ({ seq: Number(r.seq), key: r.key, op: r.op, ts: new Date(r.ts).getTime() }));
    } catch { return []; }
  };

  // getKV must be defined before return object (hoisted function declaration)
  function getKV(key) {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  }

  const setKV = (key, value) => {
    rev += 1; db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value)); cdcPush(key, 'set');
  };
  const deleteKV = (key) => { db.prepare('DELETE FROM kv WHERE key = ?').run(key); cdcPush(key, 'del'); };
  const setKVMany = (entries) => {
    if (entries.size === 0) return;
    rev += 1;
    db.exec('BEGIN');
    try {
      const upsert = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [key, value] of entries) upsert.run(key, JSON.stringify(value));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    for (const key of entries.keys()) cdcPush(key, 'set');
  };
  const kvKeysByPrefix = (prefix) => db.prepare('SELECT key FROM kv WHERE key LIKE ?').all(prefix + '%').map((r) => r.key);
  const kvEntriesByPrefix = (prefix) => db.prepare('SELECT key, value FROM kv WHERE key LIKE ?').all(prefix + '%');

  const createSession = (token, userId) => { db.prepare('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)').run(token, userId, new Date().toISOString()); };
  const deleteSession = (token) => db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  const deleteSessionsByUser = (userId) => db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
  const deleteOtherSessions = (userId, exceptToken) => db.prepare('DELETE FROM sessions WHERE userId = ? AND token <> ?').run(userId, exceptToken);
  const purgeAllSessions = () => db.prepare('DELETE FROM sessions').run();
  const purgeExpiredSessions = () => { try { db.prepare('DELETE FROM sessions WHERE createdAt < ?').run(new Date(Date.now() - SESSION_TTL_MS).toISOString()); } catch { /* noop */ } };
  const sessionRow = (token) => db.prepare('SELECT userId, createdAt FROM sessions WHERE token = ?').get(token);

  const rateLimitGet = (key) => {
    try {
      const row = db.prepare('SELECT * FROM rate_limits WHERE key = ?').get(key);
      if (!row) return null;
      if (row.lockedUntil && row.lockedUntil > Date.now()) return { count: row.count, lockedUntil: row.lockedUntil };
      if (row.lockedUntil && row.lockedUntil <= Date.now()) { db.prepare('DELETE FROM rate_limits WHERE key = ? AND lockedUntil <= ?').run(key, Date.now()); return null; }
      if (Date.now() - (row.windowStart || 0) > LOGIN_LOCK_MS) { db.prepare('UPDATE rate_limits SET count = 0, windowStart = ?, lockedUntil = NULL WHERE key = ?').run(Date.now(), key); return { count: 0, lockedUntil: 0 }; }
      return { count: row.count, lockedUntil: row.lockedUntil || 0 };
    } catch { return null; }
  };
  const rateLimitRegisterFailure = (key) => { const rec = rateLimitGet(key); const count = (rec ? rec.count : 0) + 1; const lockedUntil = count >= LOGIN_MAX_ATTEMPTS ? Date.now() + LOGIN_LOCK_MS : null; db.prepare('INSERT INTO rate_limits (key, count, windowStart, lockedUntil) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = excluded.count, windowStart = excluded.windowStart, lockedUntil = excluded.lockedUntil').run(key, count, Date.now(), lockedUntil); return { count, lockedUntil }; };
  const rateLimitClear = (key) => { try { db.prepare('DELETE FROM rate_limits WHERE key = ?').run(key); } catch { /* noop */ } };
  const purgeExpiredRateLimits = () => { try { db.prepare('DELETE FROM rate_limits WHERE lockedUntil IS NOT NULL AND lockedUntil <= ?').run(Date.now()); } catch { /* noop */ } };

  const writeAudit = (actor, action, targetId = null, detail = '') => { try { db.prepare('INSERT INTO audit_log (ts, actorId, actorEmail, action, targetId, detail) VALUES (?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), actor ? actor.id : null, actor ? actor.email : null, action, targetId || null, detail || null); } catch { /* audit must never break the app */ } };
  const getAuditLogs = (limit = 200) => db.prepare('SELECT * FROM audit_log ORDER BY ts DESC, id DESC LIMIT ?').all(limit);

  const pruneChangeLog = () => {
    try {
      const cutoff = new Date(Date.now() - CHANGELOG_RETENTION_MS).toISOString();
      const m = db.prepare('SELECT COALESCE(MAX(seq),0) AS m FROM change_log').get();
      const maxSeq = Number(m ? m.m : 0);
      const floor = Math.max(0, maxSeq - CHANGELOG_FLOOR);
      const res = db.prepare('DELETE FROM change_log WHERE ts < ? AND seq < ?').run(cutoff, floor);
      if (res.changes > 0) console.log(`[store:sqlite] pruned ${res.changes} change_log rows`);
      return res.changes;
    } catch (e) {
      try { console.error('[store:sqlite] pruneChangeLog error:', e && (e.message || e)); } catch { /* noop */ }
      return 0;
    }
  };

  return {
    db,
    backend: 'sqlite',
    pg: false,
    getKV, setKV, deleteKV, kvKeysByPrefix, kvEntriesByPrefix, setKVMany, cdcSince, pruneChangeLog,
    getKvMeta, seedKvSeqFromLog,
    createSession, deleteSession, deleteSessionsByUser, deleteOtherSessions,
    purgeAllSessions, purgeExpiredSessions, sessionRow,
    rateLimitGet, rateLimitRegisterFailure, rateLimitClear, purgeExpiredRateLimits,
    writeAudit, getAuditLogs,
    revState: () => ({ rev, boot: bootAt, cdc: cdcNext - 1 }),
    flush: () => Promise.resolve(),
  };
};

// ---------------------------------------------------------------------------
// Singleton façade — stable shape; delegates to whichever backend is active.
// Modules destructure methods (const { getKV } = store) at import time, so the
// façade must expose all methods immediately. The actual backend is resolved by
// await ensureStore() before the HTTP server listens.
// ---------------------------------------------------------------------------
let backend = null; // set by init()

const façade = {};
const M = [
  'getKV', 'setKV', 'deleteKV', 'kvKeysByPrefix', 'kvEntriesByPrefix', 'setKVMany', 'cdcSince', 'pruneChangeLog', 'getKvMeta', 'seedKvSeqFromLog',
  'createSession', 'deleteSession', 'deleteSessionsByUser', 'deleteOtherSessions',
  'purgeAllSessions', 'purgeExpiredSessions', 'sessionRow',
  'rateLimitGet', 'rateLimitRegisterFailure', 'rateLimitClear', 'purgeExpiredRateLimits',
  'writeAudit', 'getAuditLogs', 'revState', 'flush',
];
// Simple synchronous store used until initialization completes (and as the
// permanent engine when DATABASE_URL is absent). Creating it early also keeps
// data.mjs/seed-style flows fully synchronous when no Postgres is configured.
let pending = null;

const freshFallback = () => (pending = createSqliteStore());

export const ensureStore = async () => {
  if (backend) return backend;
  if (!hasPg()) { backend = createSqliteStore(); return backend; }
  try {
    const { prisma } = await import('./lib/prisma.ts');
    const pg = await createPgStore(prisma);
    backend = pg;
    return backend;
  } catch (e) {
    try { console.error('[store] PostgreSQL init failed — falling back to SQLite:', e && (e.message || e)); } catch { /* noop */ }
    backend = createSqliteStore();
    return backend;
  }
};

for (const name of M) {
  façade[name] = (...args) => {
    const engine = backend || freshFallback();
    return engine[name](...args);
  };
}
Object.defineProperty(façade, 'db', {
  get() { return (backend || freshFallback()).db; },
  enumerable: true,
});
Object.defineProperty(façade, 'backend', {
  get() { return backend ? backend.backend : freshFallback().backend; },
  enumerable: true,
});
Object.defineProperty(façade, 'pg', {
  get() { return backend ? !!backend.pg : false; },
  enumerable: true,
});

export const store = façade;
export { createSqliteStore, createPgStore };

// Health probe: returns (ok, detail) for the active backend without throwing.
// Works for both engines regardless of initialization state.
export const probeStore = async () => {
  const engine = backend || freshFallback();
  try {
    if (engine.pg) {
      await engine._prisma?.$queryRawUnsafe('SELECT 1');
      return { ok: true, backend: 'postgresql' };
    }
    engine.db.prepare('SELECT 1').get();
    return { ok: true, backend: 'sqlite' };
  } catch (e) {
    return { ok: false, backend: engine.pg ? 'postgresql' : 'sqlite', error: (e && e.message) || e };
  }
};