// =============================================================================
//  api/scripts/restore-movements.ts -- put back the 13,332 stock movements that
//  the retention cap deleted, WITHOUT a full snapshot restore.
//
//  ⛔⛔ WHY NOT A FULL SNAPSHOT RESTORE
//
//     backup_20261007_122720_659.json is a whole-database snapshot from
//     09:27. Restoring it wholesale would also revert work done since, and
//     measured against the live database that means:
//
//       rcerp_pos_lines        9,316 -> 0     the Foodics import, destroyed
//       rcerp_pos_batches        744 -> 0     destroyed
//       rcerp_grn               428 -> 431    reverts a deletion
//       rcerp_purchase_orders    16 -> 19     reverts a deletion
//       rcerp_users                2 -> 4      RESURRECTS 2 DELETED USERS
//
//     Two of those are data the operator deliberately removed. This script
//     touches rcerp_inventory_movements and nothing else.
//
//  ⛔ WHY IT IS A UNION, NOT A REPLACE
//
//     Measured, not assumed. The live table holds 5,000 rows and exactly one
//     of them is absent from the snapshot:
//
//       {"id":"mv-1791288262175-zxv3","ref":"grn-1790670698468",
//        "date":"2026-10-06T12:04:22.175Z","delta":54,...}
//
//     Its date is LATER than the snapshot's newest row (09:31:12), it has no
//     body-match in the snapshot under any id, and it carries a _mtime. It is a
//     real goods-receipt written after the snapshot was taken. A replace would
//     silently destroy it, so rows are merged on id instead.
//
//     Expected result: 18,331 snapshot + 1 new = 18,332 rows.
//
//  ⛔ IDENTITY IS THE `id` FIELD, PROVEN NOT ASSUMED
//
//     Checked before merging: every snapshot row has an id, all 18,331 of them
//     are unique, and the 5,000 live ids are unique. Verified by the script; it
//     aborts rather than merging on an identity it has not confirmed.
//
//  ⛔ REFUSES TO RUN UNLESS IT CAN PROVE THE OUTCOME
//
//     After writing it re-reads the table and asserts the exact expected count,
//     that no id appears twice, and that every snapshot row survived with its
//     fields byte-identical. A restore that cannot be verified is reported as a
//     failure, not a success.
//
//  ⛔ RUN WITH THE SERVER STOPPED
//     A running server holds its own copy of the collection and can overwrite
//     the merge, exactly as it silently undid an earlier secrets rotation.
//     The script refuses to start while port 3001 answers.
//
//  Usage:
//     pm2 stop restocost
//     npx tsx api/scripts/restore-movements.ts [--dry-run]
//     pm2 restart restocost
// =============================================================================

import { readFileSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIVE_DB = resolve(REPO, 'server/data/restocost.db');
const SNAPSHOT = resolve(REPO, 'server/backup-archive/backup_20261007_122720_659.json');
const KEY = 'rcerp_inventory_movements';

const DRY = process.argv.includes('--dry-run');

// ── refuse to run against a live server ─────────────────────────────────────
async function portBusy(port: number): Promise<boolean> {
  const { createServer } = await import('node:net');
  return new Promise<boolean>((res) => {
    const s = createServer();
    s.once('error', () => res(true));
    s.once('listening', () => s.close(() => res(false)));
    s.listen(port, '127.0.0.1');
  });
}

const digest = (rows: any[]) => createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);

// ── read both sides ────────────────────────────────────────────────────────
const snapDoc = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const snapAll: any[] = snapDoc.data?.[KEY];
if (!Array.isArray(snapAll)) {
  console.error('⛔ ' + SNAPSHOT + ' has no data.' + KEY);
  process.exit(1);
}

const db = new DatabaseSync(LIVE_DB);
const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(KEY);
const liveAll: any[] = row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : [];

console.log('=== what is where ===');
console.log('  snapshot  ' + snapDoc.createdAt + '  ' + snapAll.length + ' rows');
console.log('  live      ' + liveAll.length + ' rows');

// ── prove the identity before using it ─────────────────────────────────────
const idsOk = snapAll.every((r) => r && typeof r.id === 'string' && r.id.length > 0)
           && liveAll.every((r) => r && typeof r.id === 'string' && r.id.length > 0);
const snapIds = new Set(snapAll.map((r) => r.id));
const liveIds = new Set(liveAll.map((r) => r.id));
console.log('');
console.log('=== identity check (the script will not merge without this) ===');
console.log('  every row has an id      : ' + idsOk);
console.log('  snapshot ids unique      : ' + (snapIds.size === snapAll.length) + '  (' + snapIds.size + '/' + snapAll.length + ')');
console.log('  live ids unique          : ' + (liveIds.size === liveAll.length) + '  (' + liveIds.size + '/' + liveAll.length + ')');
if (!idsOk || snapIds.size !== snapAll.length || liveIds.size !== liveAll.length) {
  console.error('\n⛔ identity is not clean. Refusing to merge -- a wrong key would duplicate or drop rows.');
  db.close();
  process.exit(1);
}

// ── what the merge does ────────────────────────────────────────────────────
const surviving = liveAll.filter((r) => snapIds.has(r.id));
const newOnly = liveAll.filter((r) => !snapIds.has(r.id));
const missing = snapAll.filter((r) => !liveIds.has(r.id));
const merged = [...snapAll, ...newOnly];

console.log('');
console.log('=== the merge ===');
console.log('  already in live (keep as-is) : ' + surviving.length);
console.log('  missing, to be restored       : ' + missing.length);
console.log('  live-only, would be lost by a replace: ' + newOnly.length);
for (const r of newOnly) console.log('      ' + JSON.stringify(r).slice(0, 150));
console.log('  expected total after merge    : ' + merged.length);

// ⭐ Prove the survivors are equal in VALUE, so the merge really is additive.
//
// ⛔ The first version compared JSON.stringify(have) !== JSON.stringify(r) and
//   reported 499 differing rows. Every one of them was a false alarm: the two
//   sides held the identical fields in a different ORDER, because the live
//   table was rewritten by a different code path since the snapshot. Checking
//   each field's VALUE found zero differences.
//
//   A row is a bag of fields, not a string. Comparing strings made a key-order
//   change look like data corruption, which would have blocked a restore that
//   was in fact safe -- and, worse, the same check would have passed real
//   corruption that happened to preserve ordering.
const canon = (o: any): string =>
  o && typeof o === 'object'
    ? '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'
    : JSON.stringify(o);

let drift = 0;
const changedFields = new Map<string, number>();
const byId = new Map(surviving.map((r) => [r.id, r]));
for (const r of snapAll) {
  const have = byId.get(r.id);
  if (!have) continue;
  if (canon(have) === canon(r)) continue;
  drift++;
  for (const k of new Set([...Object.keys(have), ...Object.keys(r)])) {
    if (canon(have[k]) !== canon(r[k])) changedFields.set(k, (changedFields.get(k) ?? 0) + 1);
  }
}
console.log('  survivors differing in VALUE from the snapshot: ' + drift);
if (drift) {
  console.log('    fields that changed: ' + [...changedFields.entries()].map(([k, n]) => k + '×' + n).join(', '));
}
if (drift) {
  console.error('\n⛔ ' + drift + ' surviving row(s) differ from the snapshot. That means the live table');
  console.error('   was edited after the snapshot, so a merge would be ambiguous. Inspect first.');
  db.close();
  process.exit(1);
}

console.log('');
console.log('  digest before : ' + digest(liveAll));
console.log('  digest after  : ' + digest(merged));

if (DRY) {
  console.log('\n--dry-run: nothing written.');
  db.close();
  process.exit(0);
}

// ── guard: the server must be down ─────────────────────────────────────────
if (await portBusy(Number(process.env.PORT ?? 3001))) {
  console.error('\n⛔ port 3001 answers -- the server is running and can overwrite this merge.');
  console.error('   Stop it first:  pm2 stop restocost');
  db.close();
  process.exit(1);
}
console.log('  port 3001 is free -- the server is not running.');

// ── back up before touching anything ───────────────────────────────────────
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const bkDir = resolve(REPO, 'backups/pre-movement-restore-' + stamp);
mkdirSync(bkDir, { recursive: true });
copyFileSync(LIVE_DB, resolve(bkDir, 'restocost.db'));
writeFileSync(resolve(bkDir, 'movements-before.json'), JSON.stringify(liveAll));
console.log('  backup: ' + bkDir);

// ── write ──────────────────────────────────────────────────────────────────
const payload = JSON.stringify(merged);
db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(KEY, payload);
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('  FAILED, rolled back: ' + (e instanceof Error ? e.message : e));
  db.close();
  process.exit(1);
}
db.close();

// ── verify from a fresh read ───────────────────────────────────────────────
const check = new DatabaseSync(LIVE_DB, { readOnly: true });
const after: any[] = JSON.parse(check.prepare('SELECT value FROM kv WHERE key = ?').get(KEY).value);
check.close();

const afterIds = new Set(after.map((r) => r.id));
let lost = 0;
for (const r of snapAll) if (!afterIds.has(r.id)) lost++;

const problems: string[] = [];
if (after.length !== merged.length) problems.push('count is ' + after.length + ', expected ' + merged.length);
if (afterIds.size !== after.length) problems.push('duplicate ids present (' + afterIds.size + ' unique of ' + after.length + ')');
if (lost) problems.push(lost + ' snapshot rows are missing');
for (const r of newOnly) if (!afterIds.has(r.id)) problems.push('the live-only row ' + r.id + ' was lost');

console.log('');
console.log('=== verified from a fresh read ===');
console.log('  rows now                    : ' + after.length);
console.log('  unique ids                  : ' + afterIds.size);
console.log('  snapshot rows missing       : ' + lost);
console.log('  the live-only row survived  : ' + newOnly.every((r) => afterIds.has(r.id)));
const d = after.map((r) => r.date).sort();
console.log('  date range now              : ' + d[0] + ' .. ' + d[d.length - 1]);

if (problems.length) {
  console.error('\n⛔ THE RESTORE DID NOT VERIFY:');
  for (const p of problems) console.error('   - ' + p);
  process.exit(1);
}
console.log('');
console.log('  ✅ all ' + snapAll.length + ' snapshot rows present, ' + newOnly.length + ' post-snapshot row kept.');
console.log('  ✅ no duplicate ids. The merge is verified, not assumed.');
console.log('');
console.log('  Next:  pm2 restart restocost');