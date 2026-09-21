import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(__dirname, 'watcher.log');
const MAX_RESTARTS = 20;
const WINDOW_MS = 60_000;

let alive = true;
let timestamps = [];

function log(msg) {
  const line = `${new Date().toISOString()} | ${msg}\n`;
  try { appendFileSync(LOG, line); } catch {}
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
  const child = spawn('node', ['index.js'], { cwd: __dirname, stdio: 'inherit', windowsHide: true });

  child.on('exit', (code, sig) => {
    if (!alive) return process.exit(0);
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
