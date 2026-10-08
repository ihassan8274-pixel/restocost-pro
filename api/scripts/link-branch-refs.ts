// Build the Foodics branch-ref -> branch-name mapping from the 744 export files,
// and match it against the branch records in the live system.
//
// DRY RUN BY DEFAULT. It prints exactly what it would write and nothing else.
// Nothing is written until --apply is passed, and --apply also refuses unless
// every one of the 12 Foodics refs matched exactly one branch record.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIngestPlan } from '../src/foodics/plan.js';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIVE_DB = resolve(REPO, 'server/data/restocost.db');
const APPLY = process.argv.includes('--apply');

/**
 *  Normalise an Arabic branch name for matching.
 *
 *  ⛔ Deliberately does NOT reuse foodics/normalize.ts. That module strips
 *     diacritics and folds Arabic-Indic digits for product search. Branch
 *     matching is a one-time identity decision, and folding there could make
 *     two different branches collide. This only removes what is genuinely
 *     invisible in a branch name: spaces, and the alef/ya/teh-marbuta forms
 *     that Arabic typing produces interchangeably.
 *
 *     Measured reason this matters: the export writes "الجامعيين" while the
 *     branch record says "الجامعين". Exact string equality fails on that pair.
 */
const normAr = (s) =>
  String(s ?? '')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim()
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // alef variants -> alef
    .replace(/\u0649/g, '\u064A')                      // alef maqsura -> ya
    .replace(/\u0629/g, '\u0647')                      // teh marbuta -> heh
    .replace(/\u0624/g, '\u0648')                      // waw with hamza -> waw
    .replace(/[\u064B-\u0652\u0670]/g, '')            // harakat
    .toLowerCase();

// ── 1. the mapping, straight from the files ───────────────────────────────
const plan = buildIngestPlan();
const byRef = new Map();
let conflictingNames = 0;
for (const d of plan.deduped) {
  for (const l of d.canonical.lines) {
    if (!l.branchRef) continue;
    const seen = byRef.get(l.branchRef);
    if (!seen) byRef.set(l.branchRef, { ref: l.branchRef, names: new Set<string>(), rows: 0, qty: 0 });
    const e = byRef.get(l.branchRef);
    e.names.add(l.branchName.trim());
    e.rows++;
    e.qty += l.qty;
  }
}
for (const e of byRef.values()) if (e.names.size > 1) conflictingNames++;

console.log('=== Foodics branch refs, read from the export files ===');
console.log('  refs found: ' + byRef.size + (conflictingNames ? '   refs with more than one name: ' + conflictingNames : '   every ref has exactly one name'));
console.log('');
console.log('  ref    name in the export              rows     qty');
for (const [ref, e] of [...byRef].sort()) {
  console.log('  ' + ref.padEnd(6) + [...e.names].join(' | ').slice(0, 30).padEnd(32) +
              String(e.rows).padStart(5) + e.qty.toFixed(0).padStart(9));
}

// ── 2. the branch records in the live system ───────────────────────────────
const db = new DatabaseSync(LIVE_DB, { readOnly: true });
const raw = db.prepare("SELECT value FROM kv WHERE key='rcerp_branches'").get().value as string;
const branches = (typeof raw === 'string' ? JSON.parse(raw) : raw) as any[];
db.close();

console.log('');
console.log('=== branch records in the live system: ' + branches.length + ' ===');

const normToRecords = new Map<string, any[]>();
for (const b of branches) {
  const k = normAr(b.nameAr ?? b.nameEn);
  if (!normToRecords.has(k)) normToRecords.set(k, []);
  normToRecords.get(k)!.push(b);
}

const plan2 = new Array<{ ref: string; record: any | null; how: string; exportName: string }>();
for (const [ref, e] of [...byRef].sort()) {
  const exportName = [...e.names][0] ?? '';
  const hits = normToRecords.get(normAr(exportName)) ?? [];
  if (hits.length === 1) plan2.push({ ref, record: hits[0], how: 'exact after folding', exportName });
  else if (hits.length > 1) plan2.push({ ref, record: null, how: 'AMBIGUOUS: ' + hits.length + ' records share that name', exportName });
  else plan2.push({ ref, record: null, how: 'NO MATCH', exportName });
}

console.log('');
console.log('  ref    export name             -> live record                     how');
for (const p of plan2) {
  const rec = p.record ? (p.record.id + '  ' + (p.record.nameAr ?? '')) : '(none)';
  console.log('  ' + p.ref.padEnd(6) + p.exportName.slice(0, 24).padEnd(26) + '-> ' + rec.padEnd(34) + p.how);
}

const matched = plan2.filter((p) => p.record);
const unmatched = plan2.filter((p) => !p.record);
console.log('');
console.log('  would set ref on ' + matched.length + ' of ' + plan2.length + ' Foodics refs');

const already = branches.filter((b) => b.ref);
console.log('  records that ALREADY carry a ref: ' + already.length + (already.length ? '  -> ' + already.map((b) => b.ref).join(', ') : ''));

const untouched = branches.filter((b) => !matched.some((p) => p.record?.id === b.id));
console.log('');
console.log('  records left without a ref (' + untouched.length + '):');
for (const b of untouched) console.log('    ' + b.id.padEnd(24) + (b.nameAr ?? ''));

if (!APPLY) {
  console.log('');
  console.log('DRY RUN -- nothing written. Re-run with --apply to set the ' + matched.length + ' refs.');
  if (unmatched.length) {
    console.log('');
    console.log('⛔ ' + unmatched.length + ' ref(s) did not resolve, so --apply would refuse:');
    for (const u of unmatched) console.log('    ' + u.ref + '  ' + u.exportName + '  -- ' + u.how);
  }
  process.exit(0);
}

if (unmatched.length) {
  console.error('');
  console.error('⛔ REFUSING to write: ' + unmatched.length + ' Foodics ref(s) did not resolve to a branch record.');
  console.error('   A partial mapping would leave a branch priced off a stale name.');
  process.exit(1);
}

console.log('');
console.log('=== WRITING ' + matched.length + ' ref values ===');

// ⛔ A short, single-statement write. The live app on port 3001 holds this
//    SQLite file open and reads it on every request, so the transaction has to
//    be brief -- a long write risks "database is locked" in the app.
//    Only the `ref` field is touched. Nothing is added, removed or reordered.
const updated = branches.map((b) => {
  const hit = matched.find((p) => p.record?.id === b.id);
  if (!hit) return b;
  if (b.ref === hit.ref) return b;
  return { ...b, ref: hit.ref };
});

const payload = JSON.stringify(updated);
const wdb = new DatabaseSync(LIVE_DB);
wdb.exec('BEGIN IMMEDIATE');
try {
  wdb.prepare("UPDATE kv SET value = ? WHERE key = 'rcerp_branches'").run(payload);
  wdb.exec('COMMIT');
  console.log('  wrote ' + (payload.length / 1024).toFixed(1) + ' KB to kv.rcerp_branches');
} catch (e) {
  wdb.exec('ROLLBACK');
  console.error('  FAILED and rolled back: ' + (e instanceof Error ? e.message : e));
  process.exit(1);
}
wdb.close();

// ── 3. read it back, from a fresh connection ──────────────────────────────
const vdb = new DatabaseSync(LIVE_DB, { readOnly: true });
const back = JSON.parse(vdb.prepare("SELECT value FROM kv WHERE key='rcerp_branches'").get().value as string) as any[];
vdb.close();

const refsNow = back.filter((b) => b.ref);
console.log('');
console.log('=== VERIFY, read back from the file ===');
console.log('  branch records        : ' + back.length + '  (was ' + branches.length + ')');
console.log('  records with a ref     : ' + refsNow.length);
console.log('  unique refs            : ' + new Set(refsNow.map((b) => b.ref)).size);
const refLookup = new Map(refsNow.map((b) => [b.ref, b.nameAr]));
console.log('');
for (const p of plan2) {
  console.log('  ' + p.ref.padEnd(6) + '-> ' + String(refLookup.get(p.ref) ?? '(lost)'));
}
const lost = plan2.filter((p) => !refLookup.has(p.ref));
const changedElsewhere = back.filter((b, i) => b.id !== branches[i]?.id);
console.log('');
console.log('  refs lost in the write : ' + lost.length + (lost.length ? '  ' + lost.map((p) => p.ref).join(', ') : ''));
console.log('  record count changed   : ' + (back.length === branches.length ? 'no' : 'YES -- ' + back.length + ' vs ' + branches.length));
console.log('  order preserved        : ' + (changedElsewhere.length === 0 ? 'yes' : 'CHECK'));
void changedElsewhere;