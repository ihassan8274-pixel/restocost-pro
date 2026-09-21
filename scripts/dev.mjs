import { spawn } from 'node:child_process';

const procs = [];
const run = (cmd, args) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: true });
  procs.push(p);
  p.on('error', (err) => console.error(`[dev] failed to start ${cmd}:`, err.message));
};

run('node', ['server/index.js']);
run('node', ['node_modules/vite/bin/vite.js']);

const shutdown = () => {
  procs.forEach((p) => {
    try { p.kill(); } catch { /* noop */ }
  });
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
