import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, renameSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(__dirname, 'watcher.log');
const MAX_RESTARTS = 20;
const WINDOW_MS = 60_000;

// watcher.log grew to 8MB with no rotation. Rotate once past LOG_MAX_MB (default 10),
// keep the newest LOG_KEEP (default 5) archives.
const LOG_MAX_BYTES = (() => { const n = Number(process.env.LOG_MAX_MB); return Number.isFinite(n) && n > 0 ? n * 1024 * 1024 : 10 * 1024 * 1024; })();
const LOG_KEEP = (() => { const n = Number(process.env.LOG_KEEP); return Number.isFinite(n) && n > 0 ? n : 5; })();

let alive = true;
let timestamps = [];

function rotateLog() {
  try {
    if (!existsSync(LOG)) return;
    const st = statSync(LOG);
    if (!st || st.size < LOG_MAX_BYTES) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    renameSync(LOG, `${LOG}.${stamp}`);
    let arch;
    try { arch = readdirSync(__dirname).filter((f) => f.startsWith('watcher.log.')).sort().reverse(); } catch { arch = []; }
    for (const old of arch.slice(LOG_KEEP)) {
      try { unlinkSync(path.join(__dirname, old)); } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
}

function log(msg) {
  const line = `${new Date().toISOString()} | ${msg}\n`;
  try { rotateLog(); appendFileSync(LOG, line); } catch {}
  process.stdout.write(line);
}

function start() {
  const now = Date.now();
  timestamps = timestamps.filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_RESTARTS) {
    log(`FATAL: ${MAX_RESTARTS} restarts in ${WINDOW_MS / 1000}s — giving up`);
    process.exit(1);
  }
  timestamps.push(now);

  log('Starting server...');
  const child = spawn('node', ['index.js'], { cwd: __dirname, stdio: 'inherit', windowsHide: true, env: { ...process.env, PORT: '3001' } });

  child.on('exit', (code, sig) => {
    if (!alive) return process.exit(0);
    if (code === 3) {
      // Another instance already owns this data dir (single-instance lock). Refusing
      // to run duplicates — do NOT restart-loop against a live server.
      log('Another RestoCost instance already runs in this folder — exiting watcher (no duplicate).');
      return process.exit(0);
    }
    log(`Server died (code=${code} signal=${sig}) — restarting in 3s`);
    setTimeout(start, 3000);
  });

  child.on('error', (e) => {
    log(`Spawn error: ${e.message} — retrying in 5s`);
    setTimeout(start, 5000);
  });
}

process.on('SIGINT', () => { alive = false; });
process.on('SIGTERM', () => { alive = false; });

log('=== Watcher started ===');
start();
