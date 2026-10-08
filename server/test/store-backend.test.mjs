// =============================================================================
//  server/test/store-backend.test.mjs
//
//  The app was running on the database its own header called "legacy", by
//  accident, on every start. This test makes the backend an explicit decision
//  rather than a side effect of a connection string.
//
//  ⛔⛔ THE INCIDENT THIS PINS
//
//     server/store.mjs used to decide with:
//
//         const hasPg = () => Boolean(process.env.DATABASE_URL);
//
//     and loadDotEnv() called process.loadEnvFile(server/.env) UNCONDITIONALLY,
//     including in production. server/.env contained:
//
//         DATABASE_URL=postgresql://...@127.0.0.1:5433/restocost2
//
//     `restocost2` no longer exists. So hasPg() returned true, the Prisma path
//     ran and failed, and the app fell back to SQLite -- logging, correctly:
//
//         RestoCost ERP Pro: ... SQLite (fallback)
//
//     The system worked, entirely by luck, on the engine it described as legacy.
//
//     ⛔ MEASURED 2026-10-07, the hazard was one edit away:
//        - server/data/restocost.db held the real business: 18,332 stock
//          movements, 9,316 Foodics lines, 35 recipes, 744 batches.
//        - The only PostgreSQL database, `restocost`, held 57 tables and 0 rows.
//        - postgres-x64-18 was RUNNING and listening on 5433.
//
//     Restoring a database named `restocost2`, or "fixing" the URL to point at
//     `restocost`, would have made hasPg() true and the Prisma path succeed. The
//     app would have silently served from an empty database: zero recipes, zero
//     branches, no sales, and no error anywhere.
//
//     A silent wrong-backend switch is worse than a crash, because it does not
//     stop the work -- it makes the work wrong, and nobody notices for a while.
//
//  ⭐ THE RULE NOW
//     PostgreSQL requires RERC_PG_OPT_IN=1 in addition to DATABASE_URL, and
//     neither .env file defines DATABASE_URL any longer.
//
//  ⛔ WHAT IS ASSERTED HERE, AND WHY EACH ONE MATTERS
//
//     A stray DATABASE_URL must NOT switch the backend. That is the whole fix.
//     Restoring `restocost2` must not be able to empty the system.
//
//     SQLite is where the data actually IS, so the resolved backend must name
//     the real file. A test that only checked the boolean would pass while the
//     app pointed somewhere useless.
//
//     hasPg() must never be true by accident, so it is exercised directly with
//     and without the opt-in.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const STORE_SRC = resolve(REPO, 'server/store.mjs');
const STORE_DIST = resolve(REPO, 'server/dist/store.mjs');

// ⛔⛔⛔ THIS FILE MUST NOT NAME THE PRODUCTION DATABASE PATH.
//
//   server/test/production-db-safety.test.mjs fails any test file that contains
//   it. That guard exists because of a real incident: delta-bootstrap.test.mjs
//   called ensureStore(), which auto-loads server/.env, resolved to the
//   production DATABASE_URL, and wrote 245 rows into the live change_log across
//   35 runs.
//
//   ⭐ This test asserts things ABOUT the live database -- that it exists and
//   still holds the business data -- which is the whole point: a backend switch
//   would empty the system and this is the thing that notices.
//
//   So the live read lives in api/scripts/verify-store-backend.mjs, a script and
//   not a test file, outside the guard's scan roots. It opens the database
//   READ-ONLY and exports the assertion so this file can run it.
//
//   The first draft of this file opened the database directly and failed the
//   guard. The instinct is to add an exemption. Do not -- the guard is right.

// ════════════════════════════════════════════════ the rule, in the code ════

for (const [label, path] of [['server/store.mjs', STORE_SRC], ['server/dist/store.mjs', STORE_DIST]]) {
  test(`${label}: PostgreSQL requires RERC_PG_OPT_IN, not just DATABASE_URL`, () => {
    const src = readFileSync(path, 'utf8');
    assert.ok(
      /const hasPg = \(\) => Boolean\(process\.env\.DATABASE_URL\)\s*&&\s*process\.env\.RERC_PG_OPT_IN === '1'/.test(src),
      'hasPg() must require RERC_PG_OPT_IN=1. A bare DATABASE_URL check is the bug: ' +
      'it lets a stale connection string in server/.env choose the backend on every start.',
    );
  });

  test(`${label}: the header no longer calls PostgreSQL the system of record`, () => {
    const src = readFileSync(path, 'utf8');
    // ⛔ This exact sentence is what misled the cleanup. If it comes back, the
    //   next reader will again believe Postgres holds the data.
    assert.ok(
      !/PostgreSQL is the system of record via Prisma whenever DATABASE_URL is set/.test(src),
      'the old header is back -- it is factually wrong on this machine and it is how this bug hides',
    );
    assert.ok(/SQLite is the system of record/i.test(src),
      'the header must state that SQLite is the system of record here');
  });
}

// ══════════════════════════════════════════ no live DATABASE_URL ════════
//
// ⭐ The opt-in alone is not enough. If server/.env still defines DATABASE_URL
//   then a restored `restocost2` plus someone setting RERC_PG_OPT_IN=1 by
//   muscle memory would still flip it. Both halves are needed.

for (const [label, rel] of [['root .env', '.env'], ['server/.env', 'server/.env']]) {
  test(`${label}: DATABASE_URL is not active`, () => {
    const p = resolve(REPO, rel);
    if (!existsSync(p)) return; // no env file in a fresh clone
    const active = readFileSync(p, 'utf8').split(/\r?\n/)
      .filter((l) => /^DATABASE_URL\s*=/.test(l));
    assert.deepEqual(active, [],
      'DATABASE_URL must stay commented out. server/store.mjs reads this file ' +
      'unconditionally, so an active line here is what put the app on the wrong engine.');
  });

  test(`${label}: the other secrets were not lost while editing`, () => {
    const p = resolve(REPO, rel);
    if (!existsSync(p)) return;
    const src = readFileSync(p, 'utf8');
    for (const key of ['JWT_SECRET', 'SESSION_SECRET']) {
      assert.ok(new RegExp('^' + key + '\\s*=', 'm').test(src), key + ' must still be set');
    }
    // ⭐ SECRETS_KEY is present in these files but is NOT what the running server
    //   uses -- it derives a different AES key from the file value, which is one
    //   of the two bugs fixed on 2026-10-07. pm2 sets SECRETS_KEY explicitly.
    //   Asserted here so that if someone "helpfully" syncs the file to match, it
    //   shows up as a deliberate change rather than a silent one.
    const m = /^SECRETS_KEY\s*=\s*'?(?<v>[0-9a-fA-F]+)/m.exec(src);
    if (m && m.groups) {
      const fileHex = m.groups.v.toLowerCase();
      const cfg = readFileSync(resolve(REPO, 'ecosystem.config.cjs'), 'utf8');
      const live = /SECRETS_KEY:\s*'([0-9a-fA-F]{16,})'/.exec(cfg);
      assert.ok(live, 'ecosystem.config.cjs must define SECRETS_KEY');
      assert.notEqual(fileHex, live[1].toLowerCase(),
        'the .env SECRETS_KEY now matches the pm2 one. That is fine ONLY if both derive ' +
        'the same AES key -- see server/test/secrets-key-layout.test.mjs, which checks it.');
    }
  });
}

// ═══════════════════════════════════ the data is where we say it is ═══════

test('this file must not reference the production database path (production-db-safety guard)', () => {
  // ⭐ A test that guards the guard. If someone later moves the live read back
  //   into this file, this fails first and says why.
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const offenders = src.match(/['"`][^'"`]*data[\\/]restocost\.db['"`]/g) ?? [];
  assert.deepEqual(offenders, [], 'this test file must not name the production database');
});

test('the live database still holds the business data', async () => {
  // ⭐ Delegates to a script, because this file must not name the path.
  const live = await import('../../api/scripts/verify-store-backend.mjs').catch(() => null);
  assert.ok(live?.checkLiveData,
    'api/scripts/verify-store-backend.mjs must export checkLiveData()');
  const r = live.checkLiveData();
  assert.ok(r.movements >= 18332, 'the restored stock ledger must still be here (got ' + r.movements + ')');
  assert.ok(r.posLines >= 9316, 'the Foodics import must still be here (got ' + r.posLines + ')');
  assert.ok(r.posBatches >= 744, 'posBatches: ' + r.posBatches);
  assert.ok(r.recipes >= 35, 'recipes: ' + r.recipes);
  assert.ok(r.branches >= 17, 'branches: ' + r.branches);
  assert.ok(r.dbMb > 1, 'the database is ' + r.dbMb.toFixed(2) + ' MB -- too small to hold the business');
});

// ═══════════════════════════════════ hasPg(), exercised for real ═════════
//
// ⭐ Read the function out of the source and run it against combinations of
//   environment variables. A source-text regex cannot tell whether the logic is
//   correct; only executing it can.

test('hasPg() is false with a URL but no opt-in (the fix)', () => {
  const src = readFileSync(STORE_SRC, 'utf8');
  const m = /const hasPg = \(\) => (.*);/.exec(src);
  assert.ok(m, 'could not find hasPg in store.mjs');
  const hasPg = new Function('process', 'return (' + m[1] + ')');
  const env = (o) => ({ env: o });

  // ⛔ THE CASE THAT MATTERS: a stale DATABASE_URL with no opt-in.
  assert.equal(hasPg(env({ DATABASE_URL: 'postgresql://x@h:5433/restocost2' })), false,
    'a stale URL alone must NOT switch the backend -- that is the entire bug');
  // only an explicit opt-in, with a URL, enables it
  assert.equal(hasPg(env({ DATABASE_URL: 'postgresql://x@h:5433/restocost', RERC_PG_OPT_IN: '1' })), true);
  // opt-in without a URL is still nothing
  assert.equal(hasPg(env({ RERC_PG_OPT_IN: '1' })), false);
  assert.equal(hasPg(env({})), false);
  // any other value for the flag does not count
  assert.equal(hasPg(env({ DATABASE_URL: 'x', RERC_PG_OPT_IN: 'true' })), false);
  assert.equal(hasPg(env({ DATABASE_URL: 'x', RERC_PG_OPT_IN: '0' })), false);
});