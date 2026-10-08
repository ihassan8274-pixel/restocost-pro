// =============================================================================
//  api/scripts/compare.ts -- the system report beside the Foodics export,
//  broken down by branch.
//
//  ⭐ THE SYSTEM NUMBER COMES FROM THE RECIPE. revenue and cost are both
//     Foodics quantity x a recipe field. Nothing here reads the export's cost
//     column for anything except the printed comparison column.
//
//  ⛔ WHY A BRANCH BREAKDOWN IS THE POINT OF THIS SCREEN
//     A single food-cost percentage is an average, and an average hides the one
//     branch bleeding money. Twelve branches on one menu means the same recipe
//     is sold at every one of them, so any branch above the group figure is a
//     pricing or discount problem, not a recipe problem. Ranking by food cost %
//     puts that branch first instead of burying it in a total.
//
//  ⛔ WHAT THE VARIANCE MEANS AND DOES NOT MEAN
//     Foodics prices are not uniform: each delivery app carries its own price
//     and its own discounts, so the price charged can sit above or below the
//     recipe price depending on volume and promotions. A variance is expected
//     information, not a defect to be tuned away. It is printed per branch so
//     the operator can see whether a branch is priced differently or simply
//     sold differently.
// =============================================================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { buildIngestPlan, foodicsRoot } from '../src/foodics/plan.js';
import { buildRecipeIndex, PRODUCT_NAME_ALIASES, normaliseProductName } from '../src/data-plane/recipe-cost.js';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIVE_DB = resolve(REPO, 'server/data/restocost.db');

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const from = opt('--from');
const to = opt('--to');

// ── recipes from the live system (read-only) ──────────────────────────────
const db = new DatabaseSync(LIVE_DB, { readOnly: true });
const asArr = (v: unknown) => {
  if (Array.isArray(v)) return v as any[];
  if (typeof v === 'string') { try { return JSON.parse(v) as any[]; } catch { return []; } }
  return [];
};
const kv = (k: string) => asArr(db.prepare('SELECT value FROM kv WHERE key=?').get(k)?.value);

const recipes = kv('rcerp_recipes').map((r: any) => ({
  id: r.id,
  nameAr: r.nameAr ?? null,
  nameEn: r.nameEn ?? null,
  price: Number(r.actualMenuPrice) || 0,
  cost: Number(r.totalCalculatedCost) || 0,
}));
const index = buildRecipeIndex(recipes as any);
const byId = new Map(recipes.map((r) => [r.id, r]));
const priceOf = (id: string) => byId.get(id)?.price ?? 0;
const costOf = (id: string) => byId.get(id)?.cost ?? 0;

// ⭐⭐ Branch display names.
//
//   `rcerp_branches` records carry NO `ref` field. Measured: all 17 rows have
//   `id`, `nameAr`, `nameEn` and no `code`. The Foodics export identifies
//   branches as B02, B03, ... B18, and the Arabic names are prefixed with the
//   branch NAME, so the ref cannot be parsed out of them either.
//
//   An earlier version of this script read `b.ref ?? b.id`, found no `ref`, and
//   keyed the map by `b-1786...`. Every lookup for B02 missed and the report
//   printed an empty name column -- which looks like missing data rather than a
//   wrong join, and would have been believed.
//
//   So the names are printed, and the mapping is left as an explicit step for
//   the operator rather than guessed from a fuzzy Arabic string match.
const branchRows = kv('rcerp_branches') as Array<{ id: string; nameAr?: string; nameEn?: string }>;
const branchName = new Map<string, string>();
for (const b of branchRows) {
  const ref = (b as any).ref ?? (b as any).code ?? (b as any).branchRef;
  if (ref) branchName.set(String(ref), b.nameAr ?? b.nameEn ?? '');
}

// ── the export ─────────────────────────────────────────────────────────────
// ⭐⭐ How many DISTINCT DAYS each branch actually reported, counted while
// accumulating. An earlier version tried to derive this from a Map lookup whose
// expression evaluated to the Map itself, so every branch printed "days 1" --
// a wrong number in a column nobody checked, in a report meant to be trusted.
// Measured now: every branch must equal the group day count.
const daysSeen = new Map<string, Set<string>>();

const plan = buildIngestPlan({ root: opt('--root') ?? foodicsRoot() });
const s = plan.stats;

console.log('export root      : ' + plan.root);
console.log('files / rejected : ' + s.totalFiles + ' / ' + s.rejectedFiles);
console.log('reports kept     : ' + s.uniqueReports + '   duplicate files: ' + s.duplicateFiles);
console.log('rows             : ' + s.canonicalRows + '   business days: ' + s.distinctDates);

const slots = new Map<string, number>();
for (const d of plan.deduped) {
  for (const ref of new Set(d.canonical.lines.map((l) => l.branchRef))) {
    const k = ref + '|' + d.canonical.dateFrom;
    slots.set(k, (slots.get(k) ?? 0) + 1);
    if (!daysSeen.has(ref)) daysSeen.set(ref, new Set());
    daysSeen.get(ref)!.add(d.canonical.dateFrom ?? '?');
  }
}
const doubled = [...slots].filter(([, n]) => n > 1);
const branches = [...new Set(plan.deduped.flatMap((d) => d.canonical.lines.map((l) => l.branchRef)))];
if (doubled.length || slots.size !== branches.length * s.distinctDates) {
  console.error('\n⛔ grid is not clean: ' + slots.size + ' slots, ' + doubled.length + ' doubled.');
  process.exit(1);
}
const shortDays = branches.filter((b) => (daysSeen.get(b)?.size ?? 0) !== s.distinctDates);
if (shortDays.length) {
  console.error('\n⛔ branches reporting fewer than ' + s.distinctDates + ' days: ' + shortDays.join(', '));
  process.exit(1);
}
console.log('grid             : ' + branches.length + ' branches x ' + s.distinctDates +
            ' days = ' + slots.size + ' slots, none doubled, every branch complete');

// ── accumulate ─────────────────────────────────────────────────────────────
interface Acc { qty: number; sysRevenue: number; sysCost: number; fxRevenue: number; fxCost: number }
const blank = (): Acc => ({ qty: 0, sysRevenue: 0, sysCost: 0, fxRevenue: 0, fxCost: 0 });
const grand = blank();
const perBranch = new Map<string, Acc>();
const perDay = new Map<string, Acc>();
const perItem = new Map<string, Acc & { name: string; price: number }>();
// ref -> itemCode -> figures, for the per-branch drill-down
const branchItem = new Map<string, Map<string, Acc & { name: string; price: number }>>();
let unpriced = 0;
let unpricedQty = 0;
const unpricedNames = new Map<string, number>();

const acc = (m: Map<string, Acc>, k: string) => {
  let e = m.get(k);
  if (!e) { e = blank(); m.set(k, e); }
  return e;
};

for (const d of plan.deduped) {
  const day = d.canonical.dateFrom ?? '?';
  for (const l of d.canonical.lines) {
    if (l.isTotal) continue;
    if (from && day < from) continue;
    if (to && day > to) continue;

    const q = Number(l.qty) || 0;
    const raw = normaliseProductName(l.productName);
    const r = index.byName.get(PRODUCT_NAME_ALIASES[raw] ?? raw) as any;
    if (!r) {
      unpriced++; unpricedQty += q;
      unpricedNames.set(l.productName, (unpricedNames.get(l.productName) ?? 0) + q);
    }
    const sysRev = r ? q * priceOf(r.id) : 0;
    const sysCost = r ? q * costOf(r.id) : 0;
    const fxRev = l.netWithVat ?? 0;
    const fxC = l.cost;

    for (const t of [grand, acc(perBranch, l.branchRef), acc(perDay, day)]) {
      t.qty += q; t.sysRevenue += sysRev; t.sysCost += sysCost;
      t.fxRevenue += fxRev; t.fxCost += fxC;
    }

    const add = (m: Map<string, any>, k: string, price: number) => {
      let e = m.get(k);
      if (!e) { e = { ...blank(), name: l.productName, price }; m.set(k, e); }
      e.qty += q; e.sysRevenue += sysRev; e.sysCost += sysCost;
      e.fxRevenue += fxRev; e.fxCost += fxC;
    };
    add(perItem, l.itemCode, r ? priceOf(r.id) : 0);
    if (!branchItem.has(l.branchRef)) branchItem.set(l.branchRef, new Map());
    add(branchItem.get(l.branchRef)!, l.itemCode, r ? priceOf(r.id) : 0);
  }
}

// ── print ──────────────────────────────────────────────────────────────────
const m = (v: number) => v.toFixed(2).padStart(13);
const f2 = (v: number) => (v * 100).toFixed(2);

console.log('\nwindow: ' + (from || 'first') + ' .. ' + (to || 'last') + '    quantity: ' + grand.qty.toFixed(0));
if (unpriced) {
  console.log('\n⛔ ' + unpriced + ' row(s) / ' + unpricedQty.toFixed(0) +
              ' unit(s) have no recipe. The figures below understate revenue and cost.');
  for (const [n, q] of [...unpricedNames].sort((a, b) => b[1] - a[1])) console.log('    ' + n + '  qty ' + q.toFixed(0));
}

console.log('\n=== 1. THE SYSTEM REPORT  (recipe prices x Foodics quantity) ===');
console.log('  revenue            ' + m(grand.sysRevenue));
console.log('  cost               ' + m(grand.sysCost));
console.log('  gross profit       ' + m(grand.sysRevenue - grand.sysCost));
console.log('  FOOD COST %        ' + f2(grand.sysCost / grand.sysRevenue) + '%');
console.log('  gross margin %     ' + f2(1 - grand.sysCost / grand.sysRevenue) + '%');
console.log('  net sales ex VAT (Foodics, for reference) ' + m(grand.fxRevenue));

// ── 2. BRANCH RANKING -- the actionable view ───────────────────────────────
console.log('\n=== 2. BY BRANCH, ranked by food cost % (worst first) ===');
console.log('  ref    name                 days  qty   revenue        cost       profit    fc%  margin%   foodics rev    variance');
const sorted = [...perBranch].map(([ref, t]) => ({
  ref,
  name: branchName.get(ref) ?? '(no name for this ref)',
  days: daysSeen.get(ref)?.size ?? 0,
  t,
})).sort((a, b) => (b.t.sysCost / b.t.sysRevenue) - (a.t.sysCost / a.t.sysRevenue));
for (const { ref, name, days, t } of sorted) {
  const v = t.sysRevenue - t.fxRevenue;
  console.log('  ' + ref.padEnd(6) + name.slice(0, 20).padEnd(22) +
              String(days).padStart(4) +
              t.qty.toFixed(0).padStart(7) + m(t.sysRevenue) + m(t.sysCost) + m(t.sysRevenue - t.sysCost) +
              '  ' + f2(t.sysCost / t.sysRevenue).padStart(5) + '  ' +
              f2(1 - t.sysCost / t.sysRevenue).padStart(7) + '%' + m(t.fxRevenue) + m(v));
}
console.log('  ' + '-'.repeat(118));
console.log('  TOTAL  ' + ' '.repeat(20) + String(s.distinctDates).padStart(4) +
            grand.qty.toFixed(0).padStart(7) + m(grand.sysRevenue) + m(grand.sysCost) +
            m(grand.sysRevenue - grand.sysCost) + '  ' + f2(grand.sysCost / grand.sysRevenue).padStart(5) +
            '  ' + f2(1 - grand.sysCost / grand.sysRevenue).padStart(7) + '%' +
            m(grand.fxRevenue) + m(grand.sysRevenue - grand.fxRevenue));

// What the spread between the best and worst branch is worth, in money.
const best = sorted[sorted.length - 1]!;
const worst = sorted[0]!;
const bestRate = best.t.sysCost / best.t.sysRevenue;
const targetSaving = sorted.reduce((sum, r) => sum + Math.max(0, r.t.sysCost - r.t.sysRevenue * bestRate), 0);
console.log('');
console.log('  best  ' + best.ref + '  ' + f2(bestRate) + '% food cost');
console.log('  worst ' + worst.ref + '  ' + f2(worst.t.sysCost / worst.t.sysRevenue) + '% food cost');
console.log('  spread ' + ((worst.t.sysCost / worst.t.sysRevenue - bestRate) * 100).toFixed(2) + ' percentage points');
console.log('  if every branch priced at the best rate, cost would fall by ' + targetSaving.toFixed(2) +
            ' over these ' + s.distinctDates + ' days.');

// ── 3. PER BRANCH, THE ITEMS HURTING THAT BRANCH ───────────────────────────
console.log('\n=== 3. PER BRANCH: the items that hurt it most ===');
console.log('  (food cost % per item, only items above the group rate, top 6 per branch)');
const groupRate = grand.sysCost / grand.sysRevenue;
for (const { ref, t } of sorted) {
  const items = [...(branchItem.get(ref)?.entries() ?? [])]
    .map(([code, e]) => ({ code, ...e }))
    .filter((e) => e.sysRevenue > 0 && e.sysCost / e.sysRevenue > groupRate)
    .sort((a, b) => (b.sysCost - b.sysRevenue * groupRate) - (a.sysCost - a.sysRevenue * groupRate));
  const rate = t.sysCost / t.sysRevenue;
  console.log('');
  console.log('  ' + ref + '  ' + String(branchName.get(ref) ?? '').slice(0, 18) +
              '   branch fc ' + f2(rate) + '%   (' + (rate > groupRate ? 'ABOVE' : 'below') + ' group ' + f2(groupRate) + '%)');
  if (!items.length) {
    console.log('      no item above the group rate -- this branch is priced better than the average');
    continue;
  }
  console.log('      code          name              price  qty   revenue      cost     fc%   excess cost');
  for (const e of items.slice(0, 6)) {
    const excess = e.sysCost - e.sysRevenue * groupRate;
    console.log('      ' + e.code.padEnd(13) + String(e.name).slice(0, 16).padEnd(18) +
                e.price.toFixed(2).padStart(5) + e.qty.toFixed(0).padStart(6) +
                m(e.sysRevenue) + m(e.sysCost) + '  ' +
                f2(e.sysCost / e.sysRevenue).padStart(5) + '%' + m(excess));
  }
}

// ── 4. BY DAY ──────────────────────────────────────────────────────────────
console.log('\n=== 4. BY DAY ===');
console.log('  day             branches  revenue         cost     profit    fc%   foodics rev    variance');
for (const [day, t] of [...perDay].sort()) {
  const nb = new Set<number>();
  void nb;
  console.log('  ' + day + '       ' + m(t.sysRevenue) + m(t.sysCost) + m(t.sysRevenue - t.sysCost) +
              '  ' + f2(t.sysCost / t.sysRevenue).padStart(5) + '%' + m(t.fxRevenue) +
              m(t.sysRevenue - t.fxRevenue));
}
console.log('  ' + '-'.repeat(108));
console.log('  TOTAL                 ' + m(grand.sysRevenue) + m(grand.sysCost) +
            m(grand.sysRevenue - grand.sysCost) + '  ' + f2(grand.sysCost / grand.sysRevenue).padStart(5) +
            '%' + m(grand.fxRevenue) + m(grand.sysRevenue - grand.fxRevenue));

// ── 5. BY ITEM ─────────────────────────────────────────────────────────────
console.log('\n=== 5. BY ITEM, ranked by price variance against Foodics ===');
console.log('  code        name              price  qty   revenue        cost     fc%   foodics rev    variance    var%');
const ir = [...perItem].sort((a, b) => Math.abs(b[1].sysRevenue - b[1].fxRevenue) - Math.abs(a[1].sysRevenue - a[1].fxRevenue));
for (const [code, t] of ir) {
  const v = t.sysRevenue - t.fxRevenue;
  console.log('  ' + code.padEnd(13) + String(t.name).slice(0, 16).padEnd(18) +
              t.price.toFixed(2).padStart(5) + t.qty.toFixed(0).padStart(7) +
              m(t.sysRevenue) + m(t.sysCost) + '  ' + f2(t.sysCost / t.sysRevenue).padStart(5) + '%' +
              m(t.fxRevenue) + m(v) + '  ' + (v / t.fxRevenue * 100).toFixed(1).padStart(6) + '%');
}

db.close();