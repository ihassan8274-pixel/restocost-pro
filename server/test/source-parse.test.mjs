// server/test/source-parse.test.mjs
//
// حارس: كل ملف في الخادم لازم يكون parsable — Added 2026-10-05
//
// لماذا هذا الحارس موجود ( incident حقيقي ):
//   أثناء إصلاح snapshotAll() قصَّ PowerShell السطور فكرّر
//   `const VERIFY_LOG_KEY` مرتين => SyntaxError: already declared.
//   الاختبارات كلها مرّت 89/89 لأن الاختبارات السابقة تقرأ الكود كنص
//   ولا تحمّله. الخادم كان سيتوقف بالكامل والـ suite كان يقول "تمام".
//
// ⭐ القاعدة: أي إصلاح في server/ لا يُعتبر تمّ إلا إذا مرّ هذا الحارس.
//
// ⭐ لماذا `node --check` وليس `new Function`:
//   new Function ينشئ scope مشابه لـ script لا module، فيرفض
//   import.meta و top-level await ⇒ false positives على 23 ملفاً.
//   node --check هو المدقّق الرسمي نفسه، ومقيس: 0 ملفات فاشلة قبل الحارس.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER = path.join(REPO, 'server');
const SKIP_DIRS = ['node_modules', 'backup-archive', 'data', 'coverage', '.git'];

function jsFiles(dir = SERVER) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(full));
    else if (/\.(mjs|cjs|js)$/.test(e.name)) out.push(full);
  }
  return out;
}

const FILES = jsFiles();

test('sanity: the file walk actually found server files', () => {
  assert.ok(FILES.length >= 20, `found only ${FILES.length} — the walk is broken`);
});

test('every file in server/ passes node --check', () => {
  const failures = [];
  for (const file of FILES) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) {
      const msg = (r.stderr || '').split('\n').filter((l) => /Error|error/.test(l))[0] ?? 'unknown';
      failures.push(`${path.relative(REPO, file)}  ->  ${msg.trim()}`);
    }
  }
  assert.deepEqual(
    failures, [],
    `\n${failures.length} file(s) do not parse:\n${failures.join('\n')}\n`
      + '⛔ server will not start. Fix before anything else.',
  );
});

test('no top-level identifier is declared twice in one file', () => {
  const failures = [];
  for (const file of FILES) {
    const src = fs.readFileSync(file, 'utf8');
    // top-level only (column 0), same scope as a real module
    const names = [...src.matchAll(/^(?:const|let|class|function)\s+([A-Za-z_$][\w$]*)/gm)]
      .map((m) => m[1]);
    const seen = new Map();
    for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
    for (const [name, count] of seen) {
      if (count > 1) failures.push(`${path.relative(REPO, file)}: '${name}' declared ${count}x`);
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
});

test('no import alias renames a name to itself', () => {
  const failures = [];
  for (const file of FILES) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\b/g)) {
      if (m[1] === m[2]) failures.push(`${path.relative(REPO, file)}: '${m[1]} as ${m[2]}'`);
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
});

test('no file carries a U+FFFD replacement character', () => {
  // ⛔ U+FFFD means text was written through a wrong codepage at some point.
  //    It is invisible in most editors and silently corrupts Arabic strings.
  const failures = [];
  for (const file of FILES) {
    const src = fs.readFileSync(file, 'utf8');
    if (src.includes('\uFFFD')) {
      const lines = src.split('\n');
      const at = lines.reduce((acc, l, i) => (l.includes('\uFFFD') ? [...acc, i + 1] : acc), []);
      failures.push(`${path.relative(REPO, file)}  lines ${at.join(', ')}`);
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
});
