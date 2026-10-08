// `npm run dev` — runs the backend and the Vite dev server together.
//
// This file is a repair, not a feature. package.json has pointed `dev` at
// `scripts/dev.mjs` all along, but the file was never committed: it is absent
// from HEAD, so a fresh clone failed with ENOENT the moment anyone ran the
// documented first command. (`test:reports` → `scripts/verify-unified.mjs` had
// the same problem; see the note in package.json.)
//
// Why both processes here rather than two terminals:
//   * vite.config.ts proxies /api → http://localhost:3001, so the backend has
//     to be on 3001 or every API call from the browser silently 404s against
//     Vite's own fallback — the same class of failure the nginx proxy gap was.
//   * one Ctrl-C must stop both; leaving an orphan on 3001 makes the next
//     `npm run dev` refuse to start (server/index.js port-conflict guard) and
//     the user has to hunt for the process.
//
// No dependencies: node:child_process + node:readline only.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SERVER_PORT = 3001; // must match vite.config.ts proxy target
const VITE_PORT = Number(process.env.VITE_PORT) || 5173;

const COLORS = { server: '\x1b[36m', vite: '\x1b[35m' }; // cyan / magenta
const RESET = '\x1b[0m';
const paint = process.stdout.isTTY ? (c, s) => `${COLORS[c]}${s}${RESET}` : (_c, s) => s;

function say(msg) {
  process.stdout.write(`${paint('server', '[dev]')} ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`${paint('server', '[dev] ')}${msg}\n`);
  process.exit(1);
}

// ── preflight ────────────────────────────────────────────────────────────────

const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(viteBin)) {
  fail(`vite is not installed (expected ${path.relative(ROOT, viteBin)}).\n       Run \`npm ci\` first.`);
}
// Build the server (TypeScript + allowed JS) -> server/dist/
say('building server -> server/dist/');
try {
  const { spawnSync } = await import('node:child_process');
  const build = spawnSync(process.execPath, ['node_modules/.bin/tsc', '-p', 'server/tsconfig.json'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  if (build.status !== 0) fail('server build failed');
} catch (e) {
  fail(`server build error: ${e.message}`);
}
if (!fs.existsSync(path.join(ROOT, 'server', 'dist', 'index.js'))) {
  fail('server/dist/index.js not produced — build step failed silently.');
}

// store.mjs reads server/.env itself, but starting without it is the usual
// reason a first run "can't reach the database" — say so before it happens.
const serverEnv = path.join(ROOT, 'server', '.env');
if (!fs.existsSync(serverEnv)) {
  say(
    `${paint('server', 'warning:')} server/.env not found — the backend will fall back to SQLite.\n` +
      `         Copy server/.env.example (or your own) to server/.env before testing against PostgreSQL.`,
  );
}

// ── process plumbing ─────────────────────────────────────────────────────────

/** Prefix each line a child emits so the two logs stay separable. */
function pipe(name, stream, target) {
  // `input` is required: without it createInterface attaches to process.stdin
  // (the TTY) instead of the child, and stream.pipe(rl) then throws because rl
  // is not a Writable.
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  rl.on('line', (line) => target.write(`${paint(name, `[${name}]`)} ${line}\n`));
  // A child that dies mid-write can surface here rather than on the stream;
  // let it through as text instead of taking the dev runner down with it.
  rl.on('error', (err) => target.write(`${paint(name, `[${name}]`)} log error: ${err.message}\n`));
}

const children = [];
let shuttingDown = false;

function start(name, args, extraEnv) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      // NODE_ENV must stay unset/development: store.mjs refuses its SQLite
      // fallback in production, which would kill a dev run before it starts.
      NODE_ENV: process.env.NODE_ENV || 'development',
      FORCE_COLOR: process.stdout.isTTY ? '1' : '0',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pipe(name, child.stdout, process.stdout);
  pipe(name, child.stderr, process.stderr);

  child.on('error', (err) => {
    process.stderr.write(`${paint(name, `[${name}]`)} failed to start: ${err.message}\n`);
    stopAll(1);
  });

  // Whichever process dies takes the other with it: a dev stack where half the
  // pair is gone is worse than a clean exit, because the surviving half keeps
  // serving stale results and masking the failure.
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const why = signal ? `signal ${signal}` : `code ${code}`;
    process.stderr.write(`\n${paint('server', '[dev]')} ${name} exited (${why}) — stopping the other process.\n`);
    stopAll(code === 0 ? 1 : (code ?? 1));
  });

  children.push({ name, child });
  return child;
}

function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      // Windows has no SIGKILL semantics for detached trees; force after a beat.
      const t = setTimeout(() => child.kill('SIGKILL'), 4000);
      t.unref();
    }
  }
  // Give the children a moment to flush, then leave.
  setTimeout(() => process.exit(code), 600);
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    process.stdout.write(`\n${paint('server', '[dev]')} shutting down…\n`);
    stopAll(0);
  });
}

// ── go ───────────────────────────────────────────────────────────────────────

say(`starting backend on http://localhost:${SERVER_PORT} (PORT pinned to match the vite proxy)`);
start('server', [path.join(ROOT, 'server', 'dist', 'index.js')], { PORT: String(SERVER_PORT) });

say(`starting vite on http://localhost:${VITE_PORT}`);
start('vite', [viteBin], { VITE_PORT: String(VITE_PORT) });

say(
  `open ${paint('vite', `http://localhost:${VITE_PORT}`)} — the browser talks to /api through the vite proxy.\n` +
    `         Ctrl-C stops both.`,
);
