/**
 * server/logger.mjs — structured request/event logging.
 *
 * One line per event with stable fields so tools can grep/correlate:
 *   ts | level | reqId | action | key | status | ms | ip | ua
 *
 * It replaces the historical scatter of console.log/console.error while
 * keeping the existing savelog.txt behavior available via writeAccessLog.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataBase = process.env.BACKUP_DIR || __dirname;
const logFile = path.join(dataBase, 'logs', 'access.log');

// ---- Rotation (size + count bounded) ----
// access.log grew to 20.5MB unserved. Rotate to access.log.<ts> once past
// LOG_MAX_MB (default 10), keep the newest LOG_KEEP (default 5) archives.
const LOG_MAX_BYTES = (() => { const n = Number(process.env.LOG_MAX_MB); return Number.isFinite(n) && n > 0 ? n * 1024 * 1024 : 10 * 1024 * 1024; })();
const LOG_KEEP = (() => { const n = Number(process.env.LOG_KEEP); return Number.isFinite(n) && n > 0 ? n : 5; })();

const rotateLogFile = () => {
  try {
    let st;
    try { st = fs.statSync(logFile); } catch { return; }
    if (!st || st.size < LOG_MAX_BYTES) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotateTo = `${logFile}.${stamp}`;
    fs.renameSync(logFile, rotateTo);
    // prune old archives: keep newest LOG_KEEP
    let arch;
    try { arch = fs.readdirSync(path.dirname(logFile)).filter((f) => f.startsWith(path.basename(logFile) + '.')).sort().reverse(); } catch { arch = []; }
    for (const old of arch.slice(LOG_KEEP)) {
      try { fs.unlinkSync(path.join(path.dirname(logFile), old)); } catch { /* best-effort */ }
    }
    try { console.log(`[logger] rotated access.log → ${path.basename(rotateTo)}`); } catch { /* noop */ }
  } catch { /* best-effort */ }
};

const esc = (v) => {
  if (v == null) return '-';
  const s = String(v);
  return /[\s"\\]/.test(s) ? `"${s.replace(/["\\]/g, '\\$&')}"` : s;
};

const pad = (n) => String(n).padStart(4, ' ');

let lastEnsure = 0;

const ensureFile = () => {
  const now = Date.now();
  if (now - lastEnsure < 60_000) return;
  lastEnsure = now;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  } catch { /* best-effort */ }
};

// Writes a structured line to logs/access.log (also kept on console on error).
export const writeLog = (entry = {}) => {
  const {
    level = 'info',
    reqId = '-',
    action = '-',
    key = '-',
    status = '-',
    ms = '-',
    ip = '-',
    ua = '-',
    msg = '',
  } = entry;
  const line = `${new Date().toISOString()} | ${level} | ${pad(reqId)} | ${esc(action)} | ${esc(key)} | ${status} | ${ms}ms | ${esc(ip)} | ${esc(ua)}${msg ? ' | ' + esc(msg) : ''}`;
  ensureFile();
  rotateLogFile();
  try {
    fs.appendFileSync(logFile, line + '\n', 'utf8');
  } catch { /* best-effort */ }
  if (level === 'error' || level === 'warn') {
    try {
      const c = level === 'error' ? console.error : console.warn;
      c('[log]', line);
    } catch { /* noop */ }
  }
};

// Middleware: assign a per-request id, log after completion, and expose it on
// the response header so clients can correlate errors with the server log.
export const requestLogger = (req, res, next) => {
  const started = Date.now();
  const reqId = (req.get && req.get('x-request-id')) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  req.reqId = reqId;
  res.setHeader('X-Request-ID', reqId);

  const done = (status) => {
    res.off('finish', done);
    res.off('close', done);
    writeLog({
      level: status >= 500 ? 'error' : 'info',
      reqId,
      action: `${req.method} ${(req.originalUrl || req.url).split('?')[0]}`,
      status,
      ms: Date.now() - started,
      ip: req.ip || req.socket?.remoteAddress || '-',
      ua: (req.get && req.get('user-agent')) || '-',
    });
  };
  res.once('finish', () => done(res.statusCode));
  res.once('close', done);
  next();
};

export default { writeLog, requestLogger, logFile };