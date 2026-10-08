// server/test/backup-coverage.test.mjs
//
// ⛔⛔⛔ حارس تغطية النسخ الاحتياطي — Added 2026-10-05
//
// المشكلة الأصلية: snapshotAll() كانت تكرّر COLLECTION_KEYS فقط (79 مفتاحاً).
// أي مفتاح rcerp_* يُكتب خارج تلك القائمة لم يكن يُنسخ إطلاقاً — بلا تحذير.
//
// ⭐ المقاس على الإنتاج (PostgreSQL 127.0.0.1:5433 / restocost2، 81 صفاً):
//    rcerp_backup_settings         object       163 B  ⛔ ضياع الجدولة + retention
//    rcerp_backup_verify_log       array     20591 B  ⛔ سجل التحقق كاملاً
//    rcerp_telegram_updates_offset  number        9 B  ⛔ البوت يعيد كل رسالة قديمة
//   ومفاتيح مؤجّلة (لا وجود لها بعد، لكن تُكتب عند أول استخدام):
//    rcerp_webhooks · rcerp_intake_aliases · rcerp_tg_catalog_msgs
//    rcerp_tg_flow:<chatId> · rcerp_tg_flow_msg:<chatId>
//
// ⭐ المنطق كله في server/backup-keys.mjs purposely بلا أي اعتماد،
//   فالاختبار هنا سلوكي (بيستدعي الدوال) لا مجرد مسح نصي للملفات.
//   لو رجعنا للمسح النصي، الحارس يفقد قيمته: الحارس النصي الأول لم يرَ
//   تكرار const ولا بادئة rcerp_tg_flow_msg ولا انقلاباً في منطق المطابقة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BACKUP_EXTRA_KEYS, BACKUP_PREFIXES, NEVER_BACK_UP, VERIFY_EXCLUDE,
  makeKeyClassifier,
} from '../src/modules/backup/backup-keys.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const COLLECTIONS = [...read('server/core.mjs')
  .split('COLLECTION_KEYS = [')[1].split('];')[0]
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);

const { isBlocked, isKnown, scrub } = makeKeyClassifier(COLLECTIONS);

// ---------------------------------------------------------------------------
// coverage: scan the server for every rcerp_* key and prefix it actually uses
// ---------------------------------------------------------------------------

function serverFiles() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'backup-archive', 'data', 'test', 'tests'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(mjs|js|cjs)$/.test(e.name)) out.push(full);
    }
  };
  walk(path.join(REPO, 'server'));
  return out;
}

const SERVER_SRC = serverFiles().map((f) => read(path.relative(REPO, f))).join('\n');

/** every rcerp_* appearing as a quoted string literal */
const keysIn = (src) => new Set([...src.matchAll(/['"`](rcerp_[a-z0-9_]+)['"`]/g)].map((m) => m[1]));

/** every prefix built dynamically: rcerp_tg_flow:${chatId} */
const prefixesIn = (src) => new Set([
  ...[...src.matchAll(/rcerp_[a-z0-9_]+:\$\{/g)].map((m) => m[0].replace('${', '')),
  ...[...src.matchAll(/['"`](rcerp_[a-z0-9_]+:)['"`]/g)].map((m) => m[1]),
]);

/**
 * ⭐ Names that appear in the code but are NOT KV keys — nothing to back up.
 *   A new name not listed here fails the test, which is the point.
 *
 *  rcerp_targets      permissions.mjs:261 — read-only permission label.
 *                      Verified: absent from kv, and no setKV anywhere.
 *  rcerp_telegram_    store.mjs — CDC exclusion prefix, not a key. Its real
 *                      members are handled explicitly:
 *                        rcerp_telegram_settings       ∈ COLLECTION_KEYS
 *                        rcerp_telegram_updates_offset ∈ BACKUP_EXTRA_KEYS
 */
const NOT_A_KV_KEY = new Set(['rcerp_targets', 'rcerp_telegram_']);

// ---------------------------------------------------------------------------
// 1. the lists themselves
// ---------------------------------------------------------------------------

test('the extractor found the real collection list', () => {
  assert.ok(COLLECTIONS.length >= 70, `COLLECTION_KEYS = ${COLLECTIONS.length}`);
  assert.ok(BACKUP_EXTRA_KEYS.length >= 6, `BACKUP_EXTRA_KEYS = ${BACKUP_EXTRA_KEYS.length}`);
  assert.ok(BACKUP_PREFIXES.length >= 2, `BACKUP_PREFIXES = ${BACKUP_PREFIXES.length}`);
  assert.ok(NEVER_BACK_UP.length >= 2, `NEVER_BACK_UP = ${NEVER_BACK_UP.length}`);
});

test('⛔ لا مفتاح مكرر في BACKUP_EXTRA_KEYS', () => {
  const dupes = BACKUP_EXTRA_KEYS.filter((k, i) => BACKUP_EXTRA_KEYS.indexOf(k) !== i);
  assert.deepEqual(dupes, [], `duplicate keys: ${dupes.join(', ')}`);
});

// ---------------------------------------------------------------------------
// 2. ⛔ THE REGRESSION THAT MATTERS MOST
//    A blocklist entry is a PREFIX and blocks only what starts with it.
//    'rcerp_telegram_' once sat in NEVER_BACK_UP, so it swallowed
//    rcerp_telegram_updates_offset — exactly the key whose loss makes the
//    telegram bot replay every message it ever received.
// ---------------------------------------------------------------------------

test('⛔ offset البوت مُغطّى وليس محظوراً', () => {
  const OFFSET = 'rcerp_telegram_updates_offset';
  assert.ok(
    BACKUP_EXTRA_KEYS.includes(OFFSET),
    `${OFFSET} must be in BACKUP_EXTRA_KEYS — losing it replays every old message`,
  );
  assert.equal(isBlocked(OFFSET), false, `NEVER_BACK_UP swallows ${OFFSET}`);
  assert.equal(isKnown(OFFSET), true, `${OFFSET} must pass isKnown`);
  for (const p of NEVER_BACK_UP) {
    assert.equal(
      OFFSET.startsWith(p), false,
      `blocklist entry '${p}' is a prefix of ${OFFSET} — it would exclude the bot cursor`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. behavioural coverage tests
// ---------------------------------------------------------------------------

test('⛔ كل مفتاح مفرد يُكتب في الخادم مُغطّى', () => {
  // isBlocked covers the NEVER_BACK_UP entries themselves (they now live in
  // backup-keys.mjs, which this scan reads). Each one is separately asserted
  // blocked by the "الجلسات وعدّادات الحجب مرفوضة" test above.
  const uncovered = [...keysIn(SERVER_SRC)].filter(
    (k) => !isKnown(k) && !isBlocked(k) && !NOT_A_KV_KEY.has(k),
  );
  assert.deepEqual(
    uncovered, [],
    'rcerp_* keys written by the server but not in COLLECTION_KEYS/BACKUP_EXTRA_KEYS:\n  '
      + uncovered.join('\n  '),
  );
});

test('⛔ كل بادئة ديناميكية مُغطّاة', () => {
  const uncovered = [...prefixesIn(SERVER_SRC)].filter(
    (p) => !BACKUP_PREFIXES.some((c) => p === c || p.startsWith(c)),
  );
  assert.deepEqual(
    uncovered, [],
    'rcerp_*:<id> prefixes covered by neither BACKUP_PREFIXES nor NEVER_BACK_UP:\n  '
      + uncovered.join('\n  '),
  );
});

test('⛔ الجلسات وعدّادات الحجب مرفوضة', () => {
  for (const key of ['rcerp_sessions', 'rcerp_sessions:abc123', 'rcerp_rate_limits', 'rcerp_rate_limits:1.2.3.4']) {
    assert.equal(isBlocked(key), true, `${key} must be blocked`);
    assert.equal(isKnown(key), false, `${key} must never enter a backup`);
  }
});

test('⛔ الحظر يسبق كل القوائم — حتى لو ظهر المفتاح في COLLECTION_KEYS', () => {
  // ⛔ This is the precedence rule, and it is the one that was untested.
  //    Dropping `if (isBlocked(key)) return false;` from isKnown() leaves every
  //    other test green, because a blocked key is not in any list anyway.
  //    It only bites the day someone adds 'rcerp_sessions' to COLLECTION_KEYS:
  //    sessions would start landing in every backup file with no error.
  for (const key of NEVER_BACK_UP) {
    const { isKnown: isKnownHere, isBlocked: blockedHere } = makeKeyClassifier([...COLLECTIONS, key]);
    assert.equal(
      blockedHere(key), true,
      `sanity: '${key}' must be blocked even when declared as a collection`,
    );
    assert.equal(
      isKnownHere(key), false,
      `'${key}' is in COLLECTION_KEYS but the blocklist must win`,
    );
  }
});

test('⭐ البادئات الديناميكية مقبولة', () => {
  for (const key of ['rcerp_tg_flow:998877', 'rcerp_tg_flow_msg:998877']) {
    assert.equal(isKnown(key), true, `${key} must be backed up`);
  }
});

test('⭐ المفاتيح-collection مقبولة', () => {
  assert.equal(isKnown('rcerp_branches'), true);
  assert.equal(isKnown('rcerp_invoices'), true);
});

test('⭐ المفاتيح المجهولة مرفوضة', () => {
  assert.equal(isKnown('some_random_key'), false);
  assert.equal(isKnown('rcerp_totally_made_up'), false);
});

// ---------------------------------------------------------------------------
// 4. scrub — the last line of defence
// ---------------------------------------------------------------------------

test('⛔ scrub يحذف المفاتيح المحظورة من البيانات والعدّادات', () => {
  const data = {
    rcerp_branches: [{ id: 'a' }],
    rcerp_sessions: ['secret-token'],
    rcerp_rate_limits: [{ count: 9 }],
  };
  const counts = { rcerp_branches: 1, rcerp_sessions: 1, rcerp_rate_limits: 1 };

  scrub(data, counts);

  assert.deepEqual(Object.keys(data), ['rcerp_branches'], `leaked: ${Object.keys(data)}`);
  assert.deepEqual(counts, { rcerp_branches: 1 });
});

test('⭐ scrub يمسّ بيانات نظيفة بلا تغيير', () => {
  const data = { rcerp_branches: [], rcerp_telegram_updates_offset: 42 };
  const counts = { rcerp_branches: 0, rcerp_telegram_updates_offset: 1 };
  scrub(data, counts);
  assert.deepEqual(Object.keys(data).sort(), ['rcerp_branches', 'rcerp_telegram_updates_offset']);
  assert.equal(counts.rcerp_telegram_updates_offset, 1, 'scrub must keep the bot cursor');
});

// ---------------------------------------------------------------------------
// 5. verifyBackup must skip the two self-referential keys
// ---------------------------------------------------------------------------

test('⭐ المفاتيح التي تتغير لحظُة الإنشاء محفوظة لكنها غير مقارَنة', () => {
  assert.equal(VERIFY_EXCLUDE.has('rcerp_backup_settings'), true);
  assert.equal(VERIFY_EXCLUDE.has('rcerp_backup_verify_log'), true);
  // ⛔ excluded from COMPARISON, never from SAVING
  assert.equal(isKnown('rcerp_backup_settings'), true, 'must still be backed up');
  assert.equal(isKnown('rcerp_backup_verify_log'), true, 'must still be backed up');
});

// ---------------------------------------------------------------------------
// 6. backup.mjs must actually use the module, not keep a private copy
// ---------------------------------------------------------------------------

const BACKUP_SRC = read('server/routes/backup.mjs');

test('⭐ backup.mjs يستخدم الوحدة المشتركة بدل نسخة خاصة', () => {
  assert.match(BACKUP_SRC, /from '\.\.\/backup-keys\.mjs'/, 'must import the shared lists');
  assert.match(BACKUP_SRC, /makeKeyClassifier\(COLLECTION_KEYS\)/, 'must build the classifier once');
  for (const name of ['BACKUP_EXTRA_KEYS', 'BACKUP_PREFIXES', 'NEVER_BACK_UP', 'VERIFY_EXCLUDE']) {
    const local = new RegExp(`^const ${name} =`, 'm');
    assert.doesNotMatch(BACKUP_SRC, local, `${name} must not be redeclared locally`);
  }
});

test('⭐ applySnapshot لا يرفض المفاتيح الإضافية', () => {
  const body = BACKUP_SRC.split('const applySnapshot')[1]?.split('\n};')[0] ?? '';
  assert.match(body, /isKnownBackupKey/, 'must accept the extras, else they are saved then rejected');
  assert.doesNotMatch(body, /COLLECTION_KEYS\.includes/, 'COLLECTION_KEYS.includes drops the extras');
});

test('⭐ استيراد ملف نسخة يتحقق بـ isKnownBackupKey', () => {
  const m = BACKUP_SRC.match(/const unknown = keys\.filter\((.*?)\);/);
  assert.ok(m, 'could not find the unknown-keys validation line');
  assert.match(m[1], /isKnownBackupKey/, 'import must validate against isKnownBackupKey');
});

test('⭐ prefix scan لا يسقط بصمت إن غاب helper', () => {
  // ⛔ a silent `|| []` fallback here would drop every telegram flow session
  //    from every backup with no error at all.
  const body = BACKUP_SRC.split('const snapshotAll')[1]?.split('\n};')[0] ?? '';
  assert.match(body, /kvKeysByPrefix/, 'must enumerate prefix keys');
  assert.doesNotMatch(body, /\?\s*\[\]/, 'no silent empty-array fallback for the prefix scan');
});

test('⭐ /api/clear لا يحذف المفاتيح الخاصة بالخادم', () => {
  const body = BACKUP_SRC.split("/api/clear'")[1]?.split('});')[0] ?? '';
  assert.doesNotMatch(
    body, /BACKUP_EXTRA_KEYS/,
    '/api/clear must not delete the telegram offset — it would replay every old message',
  );
});
