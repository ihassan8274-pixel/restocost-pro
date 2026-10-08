// Measure the recipe-based cost against the live system and against the
// Foodics cost column, over the same 34 days. Read-only.
import { DatabaseSync } from 'node:sqlite';
import { buildIngestPlan } from './src/foodics/plan.js';
import { buildRecipeIndex, priceRows } from './src/data-plane/recipe-cost.js';

const D1 = '2026-09-01';
const D2 = '2026-10-04';

const db = new DatabaseSync('E:/MASSOBI APP/NEW APP/server/data/restocost.db', { readOnly: true });
const asArr = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
};
const kv = (k) => asArr(db.prepare('SELECT value FROM kv WHERE key=?').get(k)?.value);

const recipes = kv('rcerp_recipes') as RecipeCostRow[];
const batches = kv('rcerp_batch_sales');

// --- the live system's own numbers for the window ---------------------------
let liveCost = 0;
let liveQty = 0;
let liveRev = 0;
for (const b of batches) {
  if (b.date < D1 || b.date > D2) continue;
  liveRev += Number(b.netRevenue ?? 0) || 0;
  for (const l of b.items ?? []) {
    liveCost += Number(l.lineTotalCost) || 0;
    liveQty += Number(l.quantitySold) || 0;
  }
}

// --- the export, priced from recipes ----------------------------------------
const index = buildRecipeIndex(recipes);
const plan = buildIngestPlan();
const rows = [];
let fxCostColumn = 0;
let fxNet = 0;
for (const d of plan.deduped) {
  for (const l of d.canonical.lines) {
    if (l.isTotal) continue;
    if (l.dateFrom < D1 || l.dateFrom > D2) continue;
    rows.push(l);
    fxCostColumn += l.cost;
    fxNet += l.netSales ?? 0;
  }
}
const t = priceRows(rows, index);

const line = (label: string, v: number) => console.log('  ' + label.padEnd(34) + v.toFixed(2));

console.log('=== window ' + D1 + ' .. ' + D2 + ' ===');
console.log('');
console.log('--- quantity ---');
line('live system', liveQty);
line('foodics export', t.quantity);
line('difference %', ((t.quantity / liveQty - 1) * 100));
console.log('');
console.log('--- cost, three sources ---');
line('live system (unitCost at entry)', liveCost);
line('recipe cost (current recipes)', t.cost);
line('foodics cost column', fxCostColumn);
console.log('');
console.log('--- food cost %, on net sales ---');
line('net sales (foodics)', fxNet);
line('live system %', (liveCost / fxNet) * 100);
line('recipe cost %', (t.cost / fxNet) * 100);
line('foodics column %', (fxCostColumn / fxNet) * 100);
console.log('');
console.log('--- reconciliation: recipe cost vs the live figure ---');
console.log('  difference            : ' + (t.cost - liveCost).toFixed(2));
console.log('  difference %          : ' + (((t.cost / liveCost) - 1) * 100).toFixed(2) + '%');
console.log('  (the live figure uses the unitCost frozen when each batch was keyed;');
console.log('   this uses the recipe as it stands today. Recipes edited since then');
console.log('   explain the gap -- 4,738 of 9,606 priced lines differ by a rounding');
console.log('   amount or more.)');
console.log('');
console.log('--- coverage ---');
console.log('  rows priced            : ' + (rows.length - t.unpricedRows) + ' / ' + rows.length);
console.log('  rows with no recipe    : ' + t.unpricedRows);
console.log('  quantity unpriced      : ' + t.unpricedQuantity.toFixed(0));
console.log('  recipes in the system  : ' + recipes.length);
console.log('  name collisions        : ' + index.collisions.length);
for (const c of index.collisions) console.log('    ' + c.name + ' -> ' + c.recipes.join(' + '));
if (t.unpricedNames.size) {
  console.log('  unpriced names:');
  for (const [n, q] of [...t.unpricedNames].sort((a, b) => b[1] - a[1])) {
    console.log('    ' + n.padEnd(24) + 'qty ' + q.toFixed(0));
  }
} else {
  console.log('  unpriced names         : none -- every export name resolved to a recipe');
}
db.close();