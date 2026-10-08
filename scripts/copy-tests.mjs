// scripts/copy-tests.mjs — copy test files to dist/test/ after server build
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');
const SRC_TEST = join(ROOT, 'server', 'test');
const SRC_TESTS = join(ROOT, 'server', 'tests');
const DEST = join(ROOT, 'server', 'dist', 'test');

function copyDir(src, dest) {
  if (!statSync(src).isDirectory()) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      copyDir(s, d);
    } else if (entry.endsWith('.test.mjs') || entry.endsWith('.test.js')) {
      copyFileSync(s, d);
    }
  }
}

mkdirSync(DEST, { recursive: true });
copyDir(SRC_TEST, DEST);
if (statSync(SRC_TESTS).isDirectory()) copyDir(SRC_TESTS, DEST);
console.log('[copy-tests] copied test files to', DEST);