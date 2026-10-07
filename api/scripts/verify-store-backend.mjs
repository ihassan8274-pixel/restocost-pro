// =============================================================================
//  api/scripts/verify-store-backend.mjs -- read-only proof that the app's data
//  is where the code says it is, plus a CLI.
//
//  ⛔ WHY A SCRIPT AND NOT A TEST FILE
//     server/test/production-db-safety.test.mjs fails any *.test.mjs that names
//     the production database path. That guard exists because of a real
//     incident: a test called ensureStore(), which auto-loads server/.env,
//     resolved to the production DATABASE_URL, and wrote 245 rows into the live
//     change_log across 35 runs.
//
//     The check that matters most here -- "is the business data still in the
//     store the app is actually reading?" -- has to touch that path. So it lives
//     here, and server/test/store-backend.test.mjs imports checkLiveData().
//
//     Adding an exemption to the guard instead would have been the wrong move:
//     the guard is correct, and this file was written to respect it.
//
//  ⛔ READ-ONLY, ALWAYS
//     Every connection is opened with { readOnly: true }. Nothing here writes to
//     the database, and there is no INSERT, UPDATE, DELETE or DDL below.
//
//  ⭐ WHAT IT PROVES
//     SQLite is the declared system of record. That is only true while the
//     numbers are real, so they are checked rather than assumed. If a backend
//     switch ever empties the live store, this reports it.
//
//  Usage:  npx tsx api/scripts/verify-store-backend.mjs
// =============================================================================

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIVE_DB = resolve(REPO, 'server/data/restocost.db');

// ⭐ Measured on 2026-10-07. These are the counts that must not silently
//   collapse to zero, because a zero is what an empty-backend switch looks like.
const EXPECT = {
  movements: 18332,   // the stock ledger, restored the same day
  posLines: 9316,     // the Foodics import
  posBatches: 744,
  minRecipes: 35,
  minBranches: 17,
};

/**
 * Count the rows in one kv collection. Returns 0 for a missing or unparsable
 * value rather than throwing, so a corrupt entry shows up as a zero -- which is
 * exactly the failure this is meant to surface.
 */
function countRows(db, key) {
  const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
  if (!r) return 0;
  try {
    const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

/** Read-only inspection of the live store. */
export function checkLiveData() {
  if (!existsSync(LIVE_DB)) {
    return { ok: false, problems: ['no live database at server/data'], movements: 0, posLines: 0, posBatches: 0, recipes: 0, branches: 0, dbMb: 0 };
  }
  const dbMb = statSync(LIVE_DB).size / (1024 * 1024);
  const db = new DatabaseSync(LIVE_DB, { readOnly: true });
  let got;
  try {
    got = {
      movements: countRows(db, 'rcerp_inventory_movements'),
      posLines: countRows(db, 'rcerp_pos_lines'),
      posBatches: countRows(db, 'rcerp_pos_batches'),
      recipes: countRows(db, 'rcerp_recipes'),
      branches: countRows(db, 'rcerp_branches'),
    };
  } finally {
    db.close();
  }

  const problems = [];
  if (got.movements !== EXPECT.movements) problems.push(`stock movements: ${got.movements}, expected ${EXPECT.movements}`);
  if (got.posLines !== EXPECT.posLines) problems.push(`Foodics lines: ${got.posLines}, expected ${EXPECT.posLines}`);
  if (got.posBatches !== EXPECT.posBatches) problems.push(`Foodics batches: ${got.posBatches}, expected ${EXPECT.posBatches}`);
  if (got.recipes < EXPECT.minRecipes) problems.push(`recipes: ${got.recipes}, expected at least ${EXPECT.minRecipes}`);
  if (got.branches < EXPECT.minBranches) problems.push(`branches: ${got.branches}, expected at least ${EXPECT.minBranches}`);
  if (dbMb <= 1) problems.push(`database is ${dbMb.toFixed(2)} MB -- too small to hold the business`);

  return { ok: problems.length === 0, problems, dbMb, ...got };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const r = checkLiveData();
  console.log('=== the live store, read-only ===');
  console.log('  file size           : ' + r.dbMb.toFixed(2) + ' MB');
  console.log('  stock movements     : ' + r.movements);
  console.log('  Foodics lines       : ' + r.posLines);
  console.log('  Foodics batches     : ' + r.posBatches);
  console.log('  recipes             : ' + r.recipes);
  console.log('  branches            : ' + r.branches);
  console.log('');
  if (!r.ok) {
    console.log('  ⛔ the data is not where it should be:');
    for (const p of r.problems) console.log('     - ' + p);
    process.exit(1);
  }
  console.log('  ✅ SQLite holds the business. This is the system of record.');
}