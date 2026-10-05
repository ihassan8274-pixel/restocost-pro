// server/test/health-counters.test.mjs
//
// ⛔⛔ حارس عدّادات /api/admin/health — Added 2026-10-05
//
// المشكلة: عدّادان كانا-fiction تماماً، ومفيش أي خطأ في الـ logs:
//
//   sessions       getKV('rcerp_sessions') — مفتاح مش موجود في KV أصلاً.
//                  الجلسات في جدول sessions.            => 0 دائماً
//   changeLogCount store.getChangeLogCount ? ... : 0 — الدالة نفسها مش موجودة
//                  في أي engine، فالـ guard رجّع 0.        => 0 دائماً
//
// ⭐ المقاس على الإنتاج (PG 127.0.0.1:5433/restocost2):
//    sessions      = 34     كان بيعرض 0
//    change_log    = 8053   كان بيعرض 0
//    rcerp_audit   = 1495   ده كان شغال (مجموعة KV، مش جدول)
//
// ⭐ الاختبارات 1-4 سلوكية على store حقيقي في الذاكرة، مش مسح نصي.
//    الاختبارات 5-11 على الكود، ولازم تتجاهل التعليقات — لأن أول نسخة من
//    الاختبار كانت تفشل بسبب الكلام العربي اللي أنا كاتبه في التعليق نفسه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteStore } from '../store.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

/**
 * ⭐ Strip comments so a guard never fires on prose.
 *    A guard that matches the very sentence explaining the bug is worse than
 *    no guard — it teaches you to ignore failures.
 *    `//` preceded by `:` is left alone so URLs inside strings survive.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ⛔ ':memory:' is explicitly allowed by store.mjs's production guard, so this
//    cannot reach 127.0.0.1:5433. Never call ensureStore() from a test.
const store = createSqliteStore(':memory:');

// ---------------------------------------------------------------------------
// 1. behavioural: the counters must reflect reality
// ---------------------------------------------------------------------------

test('[HC-01] sanity: the three counters exist on the store', () => {
  for (const name of ['sessionCount', 'changeLogCount', 'auditLogCount']) {
    assert.equal(typeof store[name], 'function', `store.${name} must be a function`);
  }
});

test('[HC-02] sessionCount() counts real sessions', async () => {
  assert.equal(await store.sessionCount(), 0, 'empty store starts at 0');
  store.createSession('tok-a', 'user-1');
  store.createSession('tok-b', 'user-1');
  assert.equal(await store.sessionCount(), 2, 'two sessions must be counted');
  store.deleteSession('tok-a');
  assert.equal(await store.sessionCount(), 1, 'deleting one must decrement');
  store.purgeAllSessions();
  assert.equal(await store.sessionCount(), 0, 'purgeAllSessions must leave 0');
});

test('[HC-03] ⛔ changeLogCount() tracks the real change_log rows', async () => {
  assert.equal(await store.changeLogCount(), 0, 'empty store starts at 0');
  store.setKV('rcerp_branches', [{ id: 'b1' }]);
  store.setKV('rcerp_branches', [{ id: 'b1' }, { id: 'b2' }]);
  const afterTwoSets = await store.changeLogCount();
  assert.ok(
    Number.isInteger(afterTwoSets) && afterTwoSets > 0,
    `change_log must have rows after two setKV calls, got ${afterTwoSets}`,
  );
  store.setKV('rcerp_branches', [{ id: 'b3' }]);
  assert.equal(await store.changeLogCount(), afterTwoSets + 1, 'each setKV adds one row');
});

test('[HC-04] ⭐ مفيش engine يحوّل الفشل لصفر', () => {
  // "could not count" must stay distinguishable from "counted, and it is 0".
  // A silent 0 in a health endpoint is exactly the bug this file exists for.
  //
  // ⭐ The two engines signal failure DIFFERENTLY, on purpose:
  //    postgresql — prisma.count() throws (loud), sessionCount reads a Map so
  //                 it cannot fail at all.
  //    sqlite     — returns null, because a missing table must not read as 0.
  // So the rule is: inside any counter, a `catch` may exist but must never
  // `return 0`. A counter with no catch is allowed (it throws).
  const src = read('server/store.mjs');
  const counters = ['sessionCount', 'changeLogCount', 'auditLogCount'];
  const checked = [];
  for (const name of counters) {
    // every definition of this name in the file (one per engine)
    let idx = -1;
    while ((idx = src.indexOf(`const ${name}`, idx + 1)) > -1) {
      const at = src.indexOf('=>', idx);
      const body = src.slice(at, src.indexOf('\n  };', at) === -1 ? at + 400 : src.indexOf('\n  };', at));
      const catchAt = body.indexOf('catch');
      if (catchAt === -1) {
        assert.doesNotMatch(
          body, /return\s+0\s*;/,
          `${name}: a counter with no try/catch must let errors propagate, not swallow them`,
        );
      } else {
        assert.doesNotMatch(
          body.slice(catchAt), /return\s+0\s*;/,
          `${name}: the catch must return null, never 0`,
        );
      }
      checked.push(name);
    }
  }
  assert.equal(checked.length, counters.length * 2, `expected 2 definitions each, saw ${checked.length}`);
});

// ---------------------------------------------------------------------------
// 2. the facade must list a method that BOTH engines implement
//    The facade calls engine[name](...args) unguarded, so a method missing from
//    one engine is a TypeError at call time, not at boot.
// ---------------------------------------------------------------------------

const SRC = read('server/store.mjs');

const facadeMethods = (() => {
  const block = SRC.split('const M = [')[1]?.split('];')[0] ?? '';
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
})();

/**
 * ⛔ The engine `return { ... };` block.
 *    Do NOT search for the first `return {` after the factory name — both
 *    factories contain inner helpers that `return { ... }` (e.g. rateLimitGet).
 *    Anchor on `backend: '<name>'` and walk out to the enclosing return.
 */
const engineBlock = (factoryName, backendName) => {
  const fail = (msg) => { throw new Error(`engineBlock(${factoryName}): ${msg}`); };
  const start = SRC.indexOf(`const ${factoryName}`);
  if (start === -1) fail(`${factoryName} not found`);
  const marker = SRC.indexOf(`backend: '${backendName}'`, start);
  if (marker === -1) fail(`backend: '${backendName}' not found after ${factoryName}`);
  const at = SRC.lastIndexOf('return {', marker);
  if (at < start) fail(`no engine return block before backend: '${backendName}'`);
  // both engines' return objects are indented 2 spaces and close with `  };`
  const end = SRC.indexOf('\n  };', marker);
  if (end === -1 || end < marker) fail(`no closing '  };' after backend: '${backendName}'`);
  return SRC.slice(at, end);
};

const ENGINES = (() => {
  try {
    return {
      postgresql: engineBlock('createPgStore', 'postgresql'),
      sqlite: engineBlock('createSqliteStore', 'sqlite'),
    };
  } catch (e) {
    // surfaced by the 'the facade list and both engines were found' test below,
    // instead of taking the whole file down at import time
    return { __error: e.message };
  }
})();

/** the top-level keys an engine return object lists (see the duplicate-key test) */
const engineKeys = (block) => {
  const keys = new Set();
  for (const line of stripComments(block).split('\n')) {
    for (const token of line.split(',')) {
      const m = /^([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(token.trim());
      if (m) keys.add(m[1]);
    }
  }
  return keys;
};

// ⭐ allowed differences between the two engines: how each one identifies its
//    backend and how it flushes. Everything else must match.
const ENGINE_ONLY_KEYS = new Set(['db', 'pg', '_prisma', 'flush']);

test('[HC-05] the facade list and both engines were found', () => {
  assert.ok(facadeMethods.length >= 20, `facade list = ${facadeMethods.length}`);
  assert.equal(ENGINES.__error, undefined, `engineBlock failed: ${ENGINES.__error}`);
  const keys = {};
  for (const [name, block] of Object.entries(ENGINES)) {
    assert.match(block, new RegExp(`backend:\\s*'${name}'`), `${name} block lacks its marker`);
    keys[name] = engineKeys(block);
    assert.ok(keys[name].size >= 25, `${name} block only found ${keys[name].size} keys — likely truncated`);
  }
  // ⭐ both engines must implement the same surface. A method added to one and
  //    not the other is a TypeError at call time (the facade calls it unguarded).
  const [a, b] = Object.keys(keys);
  const onlyA = [...keys[a]].filter((k) => !keys[b].has(k));
  const onlyB = [...keys[b]].filter((k) => !keys[a].has(k));
  const unexpected = [...onlyA, ...onlyB].filter((k) => !ENGINE_ONLY_KEYS.has(k));
  assert.deepEqual(
    unexpected, [],
    `engines diverge on: ${unexpected.join(', ')}\n  only ${a}: ${onlyA.join(', ')}\n  only ${b}: ${onlyB.join(', ')}`,
  );
});

test('[HC-06] ⛔ كل method في الـ facade موجود في كل engine', () => {
  assert.equal(ENGINES.__error, undefined, `engineBlock failed: ${ENGINES.__error}`);
  const failures = [];
  for (const [engine, block] of Object.entries(ENGINES)) {
    for (const name of facadeMethods) {
      if (!new RegExp(`\\b${name}\\b`).test(block)) failures.push(`${engine}: missing '${name}'`);
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
});

test('[HC-07] ⭐ مفيش مفتاح مكرر في block أي engine', () => {
  // ⛔⛔ This is not theoretical: adding the three counters with a PowerShell
  //    splice left `writeAudit, getAuditLogs,` in place AND appended an
  //    augmented copy. `node --check` PASSED — duplicate keys in an object
  //    literal are legal JS (last wins). Only this test caught it.
  for (const [engine, block] of Object.entries(ENGINES)) {
    if (engine === '__error') continue;
    const counts = new Map();
    for (const line of stripComments(block).split('\n')) {
      for (const token of line.split(',')) {
        const m = /^([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(token.trim());
        if (!m) continue;
        counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      }
    }
    const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`);
    assert.deepEqual(dupes, [], `${engine} return object has duplicate keys: ${dupes.join(', ')}`);
  }
});

test('[HC-08] ⛔ العدّادات الثلاثة في الـ facade', () => {
  for (const name of ['sessionCount', 'changeLogCount', 'auditLogCount']) {
    assert.ok(facadeMethods.includes(name), `${name} must be in the facade list`);
  }
});

// ---------------------------------------------------------------------------
// 3. the route must not reintroduce the silent-zero guard
// ---------------------------------------------------------------------------

const healthBody = (() => {
  const src = stripComments(read('server/routes/data.mjs'));
  const body = src.split("app.get('/api/admin/health'")[1]?.split('\n  });')[0] ?? '';
  return body;
})();

test('[HC-09] sanity: the health route body was extracted', () => {
  assert.ok(healthBody.length > 200, `body length ${healthBody.length}`);
});

test('[HC-10] ⛔ /api/admin/health ما يقراش الجلسات من KV', () => {
  assert.doesNotMatch(
    healthBody, /getKV\('rcerp_sessions'/,
    'rcerp_sessions is not a KV key, so the count was permanently 0',
  );
  assert.match(healthBody, /store\.sessionCount\(\)/, 'must use the real counter');
});

test('[HC-11] ⛔ /api/admin/health ما يستخدمش حارس الصفر الصامت', () => {
  // ⛔ the exact shape that hid the bug: `store.getChangeLogCount ? ... : 0`
  assert.doesNotMatch(
    healthBody, /store\.\w+\s*\?\s*store\.\w+\(\)[^:]*:\s*0\b/,
    'a `method ? method() : 0` guard turns a missing method into a permanent 0',
  );
  assert.match(healthBody, /store\.changeLogCount\(\)/, 'must use the real counter');
});

test('[HC-12] ⭐ نقطة health بتبلّغ عن الفشل بدل ما تخفيه', () => {
  assert.match(healthBody, /warnings/, 'must collect warnings');
  assert.match(
    healthBody, /status:\s*warnings\.length\s*\?\s*'degraded'\s*:\s*'healthy'/,
    "a counter we could not read must not be reported as 'healthy'",
  );
});

test('[HC-13] ⭐ /api/live و /api/admin/health متسقين في حساب اليوم', () => {
  // ⚠️ Both currently use the UTC day, which is 3h off the Riyadh business day.
  //    Recorded as a known finding, NOT fixed here: stored timestamps are UTC
  //    (e.g. "2026-09-24T11:14:05.115Z"), so both sides are self-consistent and
  //    fixing one side alone would make the two disagree.
  const src = stripComments(read('server/routes/data.mjs'));
  const liveBody = src.split("app.get('/api/live'")[1]?.split('\n  });')[0] ?? '';
  assert.ok(liveBody.length > 200, 'live route not found');
  assert.match(liveBody, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.match(healthBody, /toISOString\(\)\.slice\(0,\s*10\)/);
});
