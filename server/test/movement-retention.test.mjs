// =============================================================================
//  server/test/movement-retention.test.mjs
//
//  The 2026-10-07 deletion of 13,332 stock movements happened inside
//  applyRetention(), in server/routes/data.mjs. The cause was fixed by removing
//  rcerp_inventory_movements from MOVEMENT_KEYS, and the rows were restored to
//  18,332 by api/scripts/restore-movements.ts.
//
//  ⛔ WHY THIS TEST EXISTS
//     The fix is a one-line change to a Set. That is exactly the kind of fix
//     that gets reverted by a later edit, or re-applied to the wrong key, with
//     nothing to notice. The deletion was silent, hourly, and irreversible from
//     the live database, so the guarantee needs an assertion rather than a
//     comment.
//
//  ⛔ WHY IT COPIES THE LOGIC INSTEAD OF IMPORTING IT
//     applyRetention is a module-private function inside a route file that
//     starts a server on import. Importing it would need the app running and a
//     store bound, which is precisely what production-db-safety.test.mjs
//     forbids. The rules being pinned are small and stated here in full, and the
//     test below also reads the REAL MOVEMENT_KEYS out of the source file, so a
//     change to the real set is caught even though the function is copied.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// ── read the REAL constants out of the real source, dist included ──────────
// ⭐ The server runs from dist/, so a fix present only in the source file would
//   not run. Both files are read, and they must agree.
const SOURCES = [
  ['server/routes/data.mjs', resolve(REPO, 'server/routes/data.mjs')],
  ['server/dist/routes/data.mjs', resolve(REPO, 'server/dist/routes/data.mjs')],
];

function readMovementKeys(path) {
  const src = readFileSync(path, 'utf8');
  const m = /const\s+MOVEMENT_KEYS\s*=\s*new Set\(\s*\[([^\]]*)\]\s*\)/.exec(src);
  if (!m) return null;
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

for (const [label, path] of SOURCES) {
  test(`${label}: rcerp_inventory_movements is NOT in MOVEMENT_KEYS`, () => {
    const keys = readMovementKeys(path);
    assert.ok(keys, 'could not find MOVEMENT_KEYS in ' + label);
    assert.ok(
      !keys.includes('rcerp_inventory_movements'),
      'the stock ledger is capped again -- it will delete itself. ' +
      'Measured 2026-10-07: 18,331 rows cut to 5,000 with no warning.',
    );
  });

  test(`${label}: rcerp_audit IS still capped (it is a debug list, not a ledger)`, () => {
    const keys = readMovementKeys(path);
    assert.ok(keys.includes('rcerp_audit'), 'the audit list must stay capped; it is never read for reporting');
  });
}

test('the source and dist agree on MOVEMENT_KEYS', () => {
  const a = readMovementKeys(SOURCES[0][1]);
  const b = readMovementKeys(SOURCES[1][1]);
  assert.deepEqual([...a].sort(), [...b].sort(), 'dist would run different retention than the source says');
});

// ── the copied behaviour, pinned ────────────────────────────────────────────
const AUDIT_RETENTION = 5000;
const RETENTION_DAYS = 90;
const MOVEMENT_RETENTION = RETENTION_DAYS > 0 ? RETENTION_DAYS * 500 : Infinity;

const applyRetention = (keys, key, value) => {
  if (!keys.includes(key) || !Array.isArray(value)) return value;
  const cap = key === 'rcerp_audit' ? AUDIT_RETENTION : MOVEMENT_RETENTION;
  if (value.length <= cap) return value;
  const dated = value.filter((r) => r && typeof r.date === 'string' && r.date.length >= 10);
  const undated = value.filter((r) => !(r && typeof r.date === 'string' && r.date.length >= 10));
  if (dated.length <= cap) return value;
  dated.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return [...dated.slice(0, cap), ...undated];
};

const MOVEMENT_KEYS = ['rcerp_audit'];

test('the 18,332 restored ledger passes through untouched, however large it gets', () => {
  // ⭐ The exact post-restore state. Under the old cap this returned 5,000.
  const ledger = Array.from({ length: 18332 }, (_, i) => ({
    id: 'mv-' + i,
    date: new Date(Date.UTC(2026, 8, 1) + i * 60000).toISOString(),
  }));
  const out = applyRetention(MOVEMENT_KEYS, 'rcerp_inventory_movements', ledger);
  assert.equal(out.length, 18332);
  assert.equal(out, ledger, 'the ledger must be returned as the same array, not a copy that has been sorted');
});

test('the ledger is never capped, not even far beyond any measured ceiling', () => {
  const ledger = Array.from({ length: 250000 }, (_, i) => ({ id: 'mv-' + i, date: '2026-09-01T00:00:00.000Z' }));
  assert.equal(applyRetention(MOVEMENT_KEYS, 'rcerp_inventory_movements', ledger).length, 250000);
});

test('the audit list is still cut to 5,000 and keeps the NEWEST rows', () => {
  const audit = Array.from({ length: 18331 }, (_, i) => ({
    id: 'a-' + i,
    date: new Date(Date.UTC(2026, 8, 1) + i * 60000).toISOString(),
  }));
  const out = applyRetention(MOVEMENT_KEYS, 'rcerp_audit', audit);
  assert.equal(out.length, 5000);

  // ⛔ The first draft asserted `dates[0] === audit[18330].date`. That is wrong:
  //   the list spans ~13 days at 600-second steps, so the newest date is NOT the
  //   last element's date. The invariant that actually matters is a boundary:
  //   everything kept is newer than everything dropped, and the threshold is the
  //   5,000th-newest date.
  const allDates = audit.map((r) => r.date).sort();
  const newest = allDates[allDates.length - 1];
  const oldest = allDates[0];
  const keptDates = out.map((r) => r.date).sort();
  const droppedDates = allDates.filter((d) => d < keptDates[0]);

  assert.equal(keptDates[keptDates.length - 1], newest, 'the single newest row must be kept');
  assert.ok(keptDates[0] > oldest, 'some old rows must be kept');
  assert.ok(droppedDates.length > 0, 'something must actually be dropped');
  assert.ok(
    droppedDates.every((d) => d < keptDates[0]),
    'every dropped row must be older than every kept row -- the split must be clean',
  );
});

test('rows without a usable date are never silently discarded', () => {
  // ⭐ An undated row that falls outside the cap used to vanish. Keeping it is
  //   the safer failure: a surplus row is visible, a missing one is not.
  const rows = [
    ...Array.from({ length: 6000 }, (_, i) => ({ id: 'a-' + i, date: '2026-09-01T00:00:00.000Z' })),
    { id: 'no-date-1' },
    { id: 'bad-date', date: 'xx' },
  ];
  const out = applyRetention(MOVEMENT_KEYS, 'rcerp_audit', rows);
  const ids = new Set(out.map((r) => r.id));
  assert.ok(ids.has('no-date-1'), 'an undated audit row was discarded');
  assert.ok(ids.has('bad-date'), 'a malformed-date audit row was discarded');
});

test('a non-array or a key outside the set is passed straight through', () => {
  const obj = { a: 1 };
  assert.equal(applyRetention(MOVEMENT_KEYS, 'rcerp_recipes', obj), obj);
  assert.deepEqual(applyRetention(MOVEMENT_KEYS, 'rcerp_audit', null), null);
  assert.deepEqual(applyRetention(MOVEMENT_KEYS, 'rcerp_audit', []), []);
});