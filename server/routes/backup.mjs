// Backup & restore subsystem lives here (settings, snapshot, backup CRUD,
// verification, restore, auto-scheduler, destructive clears).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  COLLECTION_KEYS, instanceId, readToken, sessionUser,
} from '../core.mjs';
import {
  BACKUP_SETTINGS_KEY, VERIFY_LOG_KEY, BACKUP_EXTRA_KEYS, BACKUP_PREFIXES,
  NEVER_BACK_UP, VERIFY_EXCLUDE, makeKeyClassifier,
} from '../backup-keys.mjs';
import { store } from '../store.mjs';

const { getKV, setKV, deleteKV, setKVMany, purgeAllSessions, createSession } = store;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Advanced Backup & Restore subsystem ----
const BACKUP_VERSION = 1;
// Backups live in a dedicated, easy-to-find folder inside the system files.
// ⭐ توحيد 2026-10-07: هذا السطر كان يشير من dist إلى server/dist/backup-archive
//   ومن المصدر إلى server/backup-archive — فمع كل إعادة بناء كان المسار يهرب
//   لمجلد جديد وتتعدد طرق النسخ الاحتياطي (وكتب الأدوات المساعدة يدوياً
//   على server/backup-archive، فلم يرَ ما يحفظه الإنتاج في dist أبداً).
//   الآن يتسلق خارج dist/ تماماً كـ core.mjs — وجهة واحدة دائماً:
//   server/backup-archive.
const rootDir = (() => {
  // من server/routes أو server/dist/routes — اصعد حتى مجلد server الحقيقي.
  let dir = __dirname;
  if (path.basename(dir).toLowerCase() === 'routes') dir = path.dirname(dir); // server أو server/dist
  if (path.basename(dir).toLowerCase() === 'dist') dir = path.dirname(dir);   // server
  return dir;
})();
const backupDir = path.join(rootDir, 'backup-archive');
fs.mkdirSync(backupDir, { recursive: true });
// Migrate backups left behind in the old dist-relative location (before unification).
const distLegacyDir = path.join(__dirname, '..', 'backup-archive');
if (distLegacyDir !== backupDir) {
  try {
    const stale = fs.readdirSync(distLegacyDir).filter((f) => f.startsWith('backup_') && f.endsWith('.json'));
    stale.forEach((f) => {
      const src = path.join(distLegacyDir, f);
      const dst = path.join(backupDir, f);
      if (!fs.existsSync(dst)) fs.renameSync(src, dst);
    });
  } catch { /* no dist folder */ }
}
// Migrate backups from the legacy server/backups location, if present.
const legacyDir = path.join(rootDir, 'backups');
try {
  const legacy = fs.readdirSync(legacyDir).filter((f) => f.startsWith('backup_') && f.endsWith('.json'));
  legacy.forEach((f) => {
    const src = path.join(legacyDir, f);
    const dst = path.join(backupDir, f);
    if (!fs.existsSync(dst)) fs.renameSync(src, dst);
  });
} catch { /* no legacy folder */ }
// ⭐ This block used to live inline in backup.mjs. It moved to ../backup-keys.mjs
//    so it can be unit-tested WITHOUT opening the production database —
//    core.mjs imports store.mjs, so a module importing COLLECTION_KEYS from
//    core.mjs could only be tested against live data. See backup-keys.mjs.
const { isKnown: isKnownBackupKey, scrub: scrubBackupData } =
  makeKeyClassifier(COLLECTION_KEYS);

const DEFAULT_BACKUP_SETTINGS = { enabled: true, intervalHours: 1, retention: 72, lastRunAt: null, nextRunAt: null, verifyAfterBackup: true };

const readBackupSettings = () => ({ ...DEFAULT_BACKUP_SETTINGS, ...(getKV(BACKUP_SETTINGS_KEY) || {}) });
const writeBackupSettings = (s) => setKV(BACKUP_SETTINGS_KEY, s);

const snapshotAll = () => {
  const data = {};
  const counts = {};

  COLLECTION_KEYS.forEach((key) => {
    const v = getKV(key);
    if (v !== null) { data[key] = v; counts[key] = Array.isArray(v) ? v.length : 1; }
  });

  // ⭐ server-local state (backup schedule, bot cursor, webhooks, aliases)
  BACKUP_EXTRA_KEYS.forEach((key) => {
    const v = getKV(key);
    if (v !== null) { data[key] = v; counts[key] = Array.isArray(v) ? v.length : 1; }
  });

  // ⭐ one key per entity: rcerp_tg_flow:<chatId> can never be a static list.
  //    ⛔ kvKeysByPrefix is mandatory, not optional — without it the telegram
  //    flow sessions silently vanish from every backup. No fallback.
  for (const prefix of BACKUP_PREFIXES) {
    const keys = typeof store.kvKeysByPrefix === 'function'
      ? store.kvKeysByPrefix(prefix)
      : (() => { throw new Error(`store.kvKeysByPrefix is missing — ${prefix} would be silently dropped from backups`); })();
    for (const key of keys) {
      if (!isKnownBackupKey(key)) continue;
      const v = getKV(key);
      if (v !== null) { data[key] = v; counts[key] = Array.isArray(v) ? v.length : 1; }
    }
  }

  // ⛔ zero leakage: sessions / throttle counters, even if one slipped in
  scrubBackupData(data, counts);

  return { data, counts };
};

const pad2 = (n) => String(n).padStart(2, '0');
const backupFileName = (createdAt) => {
  const d = new Date(createdAt);
  return `backup_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}_${String(d.getMilliseconds()).padStart(3, '0')}.json`;
};

const verifyBackup = (backupData, backupCounts) => {
  const results = [];
  let allMatch = true;
  const liveSnap = snapshotAll();
  const allKeys = new Set([...Object.keys(backupData), ...Object.keys(liveSnap.data)]);
  let skipped = 0;
  for (const key of allKeys) {
    // ⭐ لا مقارنة — لكن يُحسب ضمن الإجمالي ليظهر في التقرير
    if (VERIFY_EXCLUDE.has(key)) { skipped += 1; continue; }
    const inBackup = key in backupData;
    const inLive = key in liveSnap.data;
    if (!inBackup && inLive) {
      results.push({ key, status: 'missing_in_backup', backupRecords: 0, liveRecords: liveSnap.counts[key] || 0 });
      allMatch = false;
    } else if (inBackup && !inLive) {
      results.push({ key, status: 'missing_in_live', backupRecords: backupCounts[key] || 0, liveRecords: 0 });
      allMatch = false;
    } else {
      const backupLen = Array.isArray(backupData[key]) ? backupData[key].length : 1;
      const liveLen = Array.isArray(liveSnap.data[key]) ? liveSnap.data[key].length : 1;
      if (backupLen !== liveLen) {
        results.push({ key, status: 'count_mismatch', backupRecords: backupLen, liveRecords: liveLen });
        allMatch = false;
      } else {
        const backupStr = JSON.stringify(backupData[key]);
        const liveStr = JSON.stringify(liveSnap.data[key]);
        if (backupStr !== liveStr) {
          results.push({ key, status: 'content_mismatch', backupRecords: backupLen, liveRecords: liveLen });
          allMatch = false;
        }
      }
    }
  }
  return { allMatch, results, verifiedAt: new Date().toISOString(), totalKeys: allKeys.size, comparedKeys: allKeys.size - skipped, skippedKeys: skipped, mismatchedKeys: results.length };
};

const createBackup = (createdBy, type, label) => {
  const snap = snapshotAll();
  const createdAt = new Date().toISOString();
  const payload = { version: BACKUP_VERSION, createdAt, createdBy, type, label: label || '', instanceId, counts: snap.counts, data: snap.data };
  const fileName = backupFileName(createdAt);
  fs.writeFileSync(path.join(backupDir, fileName), JSON.stringify(payload));
  // Enforce retention policy
  const settings = readBackupSettings();
  const files = listBackups();
  if (files.length > settings.retention) {
    files.slice(settings.retention).forEach((f) => { try { fs.unlinkSync(path.join(backupDir, f.fileName)); } catch { /* ignore */ } });
  }
  // Verify backup matches live data
  let verification = null;
  if (settings.verifyAfterBackup !== false) {
    verification = verifyBackup(snap.data, snap.counts);
    const logEntry = { backupFile: fileName, createdAt, ...verification };
    const log = getKV(VERIFY_LOG_KEY) || [];
    log.unshift(logEntry);
    if (log.length > 100) log.length = 100;
    setKV(VERIFY_LOG_KEY, log);
    if (!verification.allMatch) {
      console.log(`[backup] WARNING: backup verification found ${verification.mismatchedKeys} mismatch(es) in ${fileName}`);
    }
  }
  return { fileName, createdAt, type, label: payload.label, units: Object.keys(snap.counts).length, verification };
};

const listBackups = () => {
  let files = [];
  try { files = fs.readdirSync(backupDir).filter((f) => f.startsWith('backup_') && f.endsWith('.json')); } catch { return []; }
  return files.map((f) => {
    const full = path.join(backupDir, f);
    let size = 0, meta = { createdAt: null, createdBy: null, type: 'unknown', label: '', counts: {} };
    try { size = fs.statSync(full).size; } catch { return null; }
    try {
      const p = JSON.parse(fs.readFileSync(full, 'utf8'));
      meta = { createdAt: p.createdAt, createdBy: p.createdBy, type: p.type || 'unknown', label: p.label || '', counts: p.counts || {} };
    } catch { /* corrupt file - still listable */ }
    const totalRecords = Object.values(meta.counts).reduce((s, c) => s + (Number(c) || 0), 0);
    return {
      id: f.replace(/^backup_/, '').replace(/\.json$/, ''),
      fileName: f,
      size,
      createdAt: meta.createdAt,
      createdBy: meta.createdBy,
      type: meta.type,
      label: meta.label,
      units: Object.keys(meta.counts).length,
      records: totalRecords,
    };
  }).filter(Boolean).sort((a, b) => String(b.fileName).localeCompare(String(a.fileName)));
};

const readBackupById = (id) => {
  const fileName = `backup_${String(id || '').replace(/[^A-Za-z0-9_]/g, '')}.json`;
  const full = path.join(backupDir, fileName);
  if (!fs.existsSync(full)) return null;
  try { return JSON.parse(fs.readFileSync(full, 'utf8')); } catch { return null; }
};

// Merge two arrays by id: backup takes precedence for matching ids, live-only
// entries are preserved (a restore must never silently drop newer records).
const mergeById = (liveArr, backupArr) => {
  if (!Array.isArray(liveArr) || !Array.isArray(backupArr)) return backupArr;
  // Primitive arrays (closedDays, deletedIds, ...) — union, never shrink.
  const isPrimitive = (a) => a.every((x) => x === null || typeof x !== 'object');
  if (isPrimitive(liveArr) || isPrimitive(backupArr)) {
    const set = new Set([...(liveArr || []), ...(backupArr || [])].filter((x) => x !== undefined && x !== null));
    return Array.from(set);
  }
  const byId = new Map((backupArr || []).map((x) => [x && x.id, x]));
  const merged = (liveArr || []).map((x) => (x && x.id && byId.has(x.id) ? byId.get(x.id) : x));
  for (const b of backupArr || []) {
    if (b && b.id && !merged.some((x) => x && x.id === b.id)) merged.push(b);
  }
  return merged;
};

// Apply a validated snapshot to the DB. NON-DESTRUCTIVE: keys present in the
// snapshot overwrite live data (merging collections by id so newer live records
// survive), and keys ABSENT from the backup are LEFT UNTOUCHED. Restoring a
// partial/corrupt backup (e.g. a 0-byte or truncated file) can therefore never
// wipe collections it doesn't contain. Writes are batched atomically via setKVMany.
const applySnapshot = (data = {}) => {
  // ⭐ isKnownBackupKey لا COLLECTION_KEYS — يجب أن تُستعاد المفاتيح الإضافية والبادئات أيضاً،
  //    وإلا حُفظت في النسخة ورُفضت عند الاسترجاع ⇒ استرجاع ناقص بلا أي رسالة خطأ.
  const keys = Object.keys(data).filter((k) => isKnownBackupKey(k));
  const entries = new Map();
  for (const key of keys) {
    // ⛔ شرط ثانٍ حتى لو تسلّل مفتاح محظور إلى ملف نسخة محرَّر يدوياً
    if (NEVER_BACK_UP.some((p) => key.startsWith(p))) continue;
    const backupValue = data[key];
    if (Array.isArray(backupValue)) {
      entries.set(key, mergeById(getKV(key) || [], backupValue));
    } else {
      entries.set(key, backupValue);
    }
  }
  if (entries.size) setKVMany(entries);
  return entries.size;
};

// Keep the requesting admin logged in while signing out everyone else after a restore.
const keepSessionAfterRestore = (req, user) => {
  const token = readToken(req);
  purgeAllSessions();
  if (token && user) {
    createSession(token, user.id);
  }
};

// Create a restore-point of the CURRENT state before a destructive operation.
const autoRestorePoint = (userName, cause) => {
  try { createBackup(userName || 'النظام', 'restore_point', `نقطة استعادة قبل: ${cause}`); } catch { /* ignore */ }
};

export const registerBackup = (app) => {
  // Live download of current data (kept for compatibility with the quick-export button).
  app.get('/api/backup', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const snap = snapshotAll();
    res.json({ ok: true, backup: { version: BACKUP_VERSION, createdAt: new Date().toISOString(), createdBy: user.name, instanceId, counts: snap.counts, data: snap.data } });
  });

  // List all stored backups (newest first).
  app.get('/api/backups', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const backups = listBackups();
    const sizeSum = backups.reduce((s, b) => s + b.size, 0);
    res.json({ ok: true, backups, settings: readBackupSettings(), totalSize: sizeSum, storedCount: backups.length, dir: backupDir });
  });

  // Create a manual backup now.
  app.post('/api/backups', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const label = String((req.body || {}).label || '').slice(0, 80);
    const created = createBackup(user.name, 'manual', label);
    res.json({ ok: true, backup: created });
  });

  // Restore from a stored backup. Creates a restore-point of current state first.
  app.post('/api/backups/:id/restore', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const backup = readBackupById(req.params.id);
    if (!backup) return res.status(404).json({ ok: false, error: 'النسخة غير موجودة' });
    if (backup.version !== BACKUP_VERSION) return res.status(400).json({ ok: false, error: 'نسخة غير مدعومة من ملف النسخ الاحتياطي' });
    autoRestorePoint(user.name, 'استعادة نسخة');
    const restored = applySnapshot(backup.data);
    keepSessionAfterRestore(req, user);
    res.json({ ok: true, restored, createdAt: backup.createdAt });
  });

  // Delete a stored backup.
  app.delete('/api/backups/:id', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const fileName = `backup_${String(req.params.id || '').replace(/[^A-Za-z0-9_]/g, '')}.json`;
    const full = path.join(backupDir, fileName);
    if (!fs.existsSync(full)) return res.status(404).json({ ok: false, error: 'النسخة غير موجودة' });
    fs.unlinkSync(full);
    res.json({ ok: true });
  });

  // Open the backup folder in Windows Explorer (this machine).
  app.get('/api/backups/open-folder', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    try {
      spawn('explorer.exe', [backupDir], { detached: true, stdio: 'ignore' }).unref();
    } catch { /* ignore */ }
    res.json({ ok: true, dir: backupDir });
  });

  // Read backup settings.
  app.get('/api/backups/settings', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    res.json({ ok: true, settings: readBackupSettings() });
  });

  // Save backup settings (auto-backup schedule + retention policy).
  app.post('/api/backups/settings', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const body = (req.body || {}).settings || {};
    const current = readBackupSettings();
    const intervalHours = Math.min(Math.max(Number(body.intervalHours) || 24, 1), 24 * 30);
    const retention = Math.min(Math.max(Number(body.retention) || 30, 1), 500);
    const settings = {
      enabled: Boolean(body.enabled),
      intervalHours,
      retention,
      verifyAfterBackup: body.verifyAfterBackup !== false,
      lastRunAt: current.lastRunAt,
      nextRunAt: current.nextRunAt,
    };
    if (!settings.lastRunAt) {
      settings.lastRunAt = new Date().toISOString();
      settings.nextRunAt = new Date(Date.now() + intervalHours * 3600 * 1000).toISOString();
    } else if (current.intervalHours !== intervalHours && settings.nextRunAt) {
      settings.nextRunAt = new Date(new Date(settings.lastRunAt).getTime() + intervalHours * 3600 * 1000).toISOString();
    }
    writeBackupSettings(settings);
    res.json({ ok: true, settings });
  });

  // Read backup verification log.
  app.get('/api/backups/verify-log', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const log = getKV(VERIFY_LOG_KEY) || [];
    res.json({ ok: true, log: log.slice(0, 50) });
  });

  // Run on-demand verification of latest backup vs live data.
  app.post('/api/backups/verify-now', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const files = listBackups();
    if (!files.length) return res.status(404).json({ ok: false, error: 'لا توجد نسخ احتياطية' });
    const latest = readBackupById(files[0].id);
    if (!latest) return res.status(500).json({ ok: false, error: 'تعذر قراءة أحدث نسخة' });
    const verification = verifyBackup(latest.data, latest.counts);
    const logEntry = { backupFile: files[0].fileName, createdAt: latest.createdAt, ...verification };
    const log = getKV(VERIFY_LOG_KEY) || [];
    log.unshift(logEntry);
    if (log.length > 100) log.length = 100;
    setKV(VERIFY_LOG_KEY, log);
    res.json({ ok: true, verification, backupFile: files[0].fileName });
  });

  // Uploaded-file restore (full snapshot from a downloaded JSON). Creates a restore-point first.
  app.post('/api/restore', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const backup = (req.body || {}).backup;
    if (!backup || typeof backup !== 'object' || !backup.data || typeof backup.data !== 'object') {
      return res.status(400).json({ ok: false, error: 'ملف النسخ الاحتياطي غير صالح' });
    }
    if (backup.version !== BACKUP_VERSION) {
      return res.status(400).json({ ok: false, error: `نسخة غير مدعومة من ملف النسخ الاحتياطي (المتوقع: ${BACKUP_VERSION})` });
    }
    const keys = Object.keys(backup.data);
    const unknown = keys.filter((k) => !isKnownBackupKey(k));
    if (unknown.length) {
      return res.status(400).json({ ok: false, error: `ملف يحتوي مفاتيح غير معروفة: ${unknown.slice(0, 3).join(', ')}` });
    }
    autoRestorePoint(user.name, 'استعادة من ملف');
    const restored = applySnapshot(backup.data);
    keepSessionAfterRestore(req, user);
    res.json({ ok: true, restored, createdAt: backup.createdAt });
  });

  // Download a specific stored backup (full JSON). Registered after the static
  // /open-folder, /settings and /verify-log routes so :id never swallows them.
  app.get('/api/backups/:id', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const backup = readBackupById(req.params.id);
    if (!backup) return res.status(404).json({ ok: false, error: 'النسخة غير موجودة' });
    res.json({ ok: true, backup });
  });

  // Auto-backup scheduler: checks every minute whether a scheduled backup is due.
  const runAutoBackup = () => {
    const settings = readBackupSettings();
    if (!settings.enabled) return;
    const now = Date.now();
    const intervalMs = (settings.intervalHours || 24) * 3600 * 1000;
    const last = settings.lastRunAt ? new Date(settings.lastRunAt).getTime() : 0;
    if (now - last >= intervalMs) {
      try {
        const created = createBackup('النظام (تلقائي)', 'auto', 'نسخة احتياطية تلقائية مجدولة');
        settings.lastRunAt = created.createdAt;
        settings.nextRunAt = new Date(new Date(created.createdAt).getTime() + intervalMs).toISOString();
        writeBackupSettings(settings);
        console.log(`[backup] auto backup created: ${created.fileName}`);
      } catch (e) { console.log('[backup] auto backup failed:', e && e.message); }
    }
  };
  setInterval(runAutoBackup, 60 * 1000);

  // Destructive operations are now guarded by an automatic restore-point.
  app.post('/api/clear', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    autoRestorePoint(user.name, 'تفريغ النظام');
    COLLECTION_KEYS.filter((k) => k !== 'rcerp_users').forEach((key) => deleteKV(key));
    res.json({ ok: true });
  });

  // Targeted bulk delete — clears only the collections the user selected.
  app.post('/api/clear-collections', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const incoming = Array.isArray(req.body && req.body.collections) ? req.body.collections : [];
    const keys = incoming.filter((k) => COLLECTION_KEYS.includes(k) && k !== 'rcerp_users');
    if (keys.length === 0) return res.status(400).json({ ok: false, error: 'لم يتم تحديد أي جدول صالح' });
    autoRestorePoint(user.name, `تفريغ بيانات محدد (${keys.length} جدول)`);
    keys.forEach((key) => deleteKV(key));
    res.json({ ok: true, cleared: keys });
  });
};