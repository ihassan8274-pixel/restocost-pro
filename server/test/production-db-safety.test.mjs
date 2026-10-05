// server/test/production-db-safety.test.mjs
//
// ⛔⛔⛔ حارس دائم — يمنع تكرارincident 2026-10-05
//
//Incident: server/test/delta-bootstrap.test.mjs استدعى ensureStore().
// store.mjs يحمّل server/.env تلقائياً ⇒ DATABASE_URL موجود ⇒
// الاختبار اتصل بـ PostgreSQL الإنتاجي وكتب 245 صفاً في change_log
// عبر 35 تشغيلاً.
//
// هذا الملف يفشل إن عاد أي اختبار يستدعي ensureStore أو يشير إلى مسار الإنتاج.
// أي محاولة لإزالة الحارس من store.mjs تُفشل هذا الاختبار.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

// ⛔ callables التي تحلّ إلى محرّك الإنتاج
const PRODUCTION_CALLABLES = [
  { re: /\bensureStore\s*\(/,        why: 'ensureStore() يحلّ إلى DATABASE_URL ⇒ الإنتاج' },
  { re: /\bcreatePgStore\s*\(/,      why: 'createPgStore() يتصل بـ PostgreSQL مباشرة' },
  { re: /\bprobeStore\s*\(\s*\)/,    why: 'probeStore() يقرأ من القاعدة الحقيقية' },
  { re: /\bprisma\s*\.\w+\.(findMany|findUnique|create|update|delete|count|upsert|createMany|deleteMany|updateMany)\s*\(/,
    why: 'استعلام Prisma مباشر — يلمس قاعدة الإنتاج' },
];

// ⛔ مسارات ملفات الإنتاج
const PRODUCTION_PATHS = [
  /['"`]data\/restocost\.db['"`]/,
  /['"`][^'"`]*server[\\/]data[\\/]restocost\.db['"`]/,
  /['"`]restocost\.db['"`]/,
];

// ⭐ يُسمح به: هذا الملف نفسه يذكر الأنماط أعلاه كنصوص
const SELF = path.basename(fileURLToPath(import.meta.url));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.test\.(mjs|js|cjs|ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

function scanFiles() {
  const roots = [
    path.join(REPO, 'server', 'test'),
    path.join(REPO, 'server', 'tests'),
    path.join(REPO, 'src'),
    path.join(REPO, 'test'),
  ].filter((d) => fs.existsSync(d));
  const seen = new Set();
  for (const r of roots) for (const f of walk(r)) seen.add(f);
  return [...seen];
}

const files = scanFiles();

test('يوجد ملفات اختبار لفحصها', () => {
  assert.ok(files.length >= 10, `expected >=10 test files, scanned ${files.length}`);
});

test('⛔ لا اختبار يستدعي ensureStore/createPgStore/probeStore', () => {
  const offenders = [];
  for (const f of files) {
    if (path.basename(f) === SELF) continue;
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(REPO, f).replace(/\\/g, '/');
    // ⛔ نتجاهل السطور المعلّقة — التوثيق يذكر ensureStore عمداً
    const code = src.split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    for (const { re, why } of PRODUCTION_CALLABLES) {
      if (re.test(code)) offenders.push(`${rel} → ${why}`);
    }
  }
  assert.deepEqual(offenders, [], 'اختبارات تلمس الإنتاج:\n  ' + offenders.join('\n  '));
});

test('⛔ لا اختبار يشير إلى مسار قاعدة الإنتاج', () => {
  const offenders = [];
  for (const f of files) {
    if (path.basename(f) === SELF) continue;
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(REPO, f).replace(/\\/g, '/');
    const code = src.split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    for (const re of PRODUCTION_PATHS) {
      if (re.test(code)) offenders.push(`${rel} → ${re}`);
    }
  }
  assert.deepEqual(offenders, [], 'اختبارات تشير لملف الإنتاج:\n  ' + offenders.join('\n  '));
});

test('⭐ الحارس ما زال موجوداً في store.mjs', () => {
  const src = fs.readFileSync(path.join(REPO, 'server', 'store.mjs'), 'utf8');
  assert.match(src, /assertNotProduction/, 'assertNotProduction must stay in store.mjs');
  assert.match(src, /IN_TEST_PROCESS/, 'IN_TEST_PROCESS must stay in store.mjs');
  // ⭐ createSqliteStore ينادي الحارس قبل الفتح
  const cs = src.slice(src.indexOf('const createSqliteStore'));
  assert.match(cs.slice(0, 400), /assertNotProduction\(dbPath\)/);
  // ⭐ ensureStore يرفض في بيئة الاختبار
  const es = src.slice(src.indexOf('export const ensureStore'));
  assert.match(es.slice(0, 900), /IN_TEST_PROCESS/, 'ensureStore must refuse test processes');
});

test('⭐ delta-bootstrap يستخدم متجراً معزولاً', () => {
  const p = path.join(REPO, 'server', 'test', 'delta-bootstrap.test.mjs');
  if (!fs.existsSync(p)) return;                       // الملف اختياري
  const src = fs.readFileSync(p, 'utf8');
  assert.match(src, /createSqliteStore\(':memory:'\)/, 'must build an isolated in-memory store');
  assert.doesNotMatch(
    src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'),
    /\bensureStore\s*\(/,
  );
});

test('⭐ كل اختبار يستخدم متجراً صريحاً (لا يستورد facade المجهول)', () => {
  const offenders = [];
  for (const f of files) {
    if (path.basename(f) === SELF) continue;
    const src = fs.readFileSync(f, 'utf8');
    // ⛔ استيراد { store } بدون createSqliteStore ⇒ مجهول ⇒ قد يفتح الإنتاج
    if (/import\s*\{[^}]*\bstore\b[^}]*\}\s*from\s*['"][^'"]*store\.mjs['"]/.test(src)) {
      if (!/createSqliteStore/.test(src)) {
        offenders.push(path.relative(REPO, f).replace(/\\/g, '/'));
      }
    }
  }
  assert.deepEqual(offenders, [], 'اختبارات تستورد facade بلا متجر صريح:\n  ' + offenders.join('\n  '));
});