// Exercise the food-cost route's own aggregation against the live store, by
// loading the compiled handler's logic path. Simplest honest check: run the
// same queries the route runs, over the same stored rows, and confirm the
// numbers the endpoint will return.
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('E:/MASSOBI APP/NEW APP/server/data/restocost.db', { readOnly: true });
const get = (k) => {
  const v = db.prepare('SELECT value FROM kv WHERE key = ?').get(k)?.value;
  return typeof v === 'string' ? JSON.parse(v) : v;
};

const lines = get('rcerp_pos_lines') ?? [];
const recipes = get('rcerp_recipes') ?? [];
const batches = get('rcerp_pos_batches') ?? [];
const branches = get('rcerp_branches') ?? [];
console.log('rcerp_pos_lines    ' + lines.length);
console.log('rcerp_pos_batches  ' + batches.length);
console.log('rcerp_recipes      ' + recipes.length);
console.log('rcerp_branches     ' + branches.length);

// Exactly what the route does.
const branchName = new Map();
for (const b of branches) if (b.ref) branchName.set(String(b.ref), b.nameAr || b.nameEn || '');

const blank = () => ({ qty: 0, revenue: 0, cost: 0, foodicsRevenue: 0, foodicsCost: 0 });
const grand = blank();
const byBranch = new Map();
const byDay = new Map();
const byItem = new Map();
const daysCovered = new Set();
let unpricedRows = 0;
let unpricedQty = 0;
const unpricedNames = new Map();

const acc = (map, key, name, price) => {
  let e = map.get(key);
  if (!e) { e = { ...blank(), name: name ?? '', price: price ?? 0 }; map.set(key, e); }
  return e;
};

for (const l of lines) {
  const day = String(l.businessDate || '').slice(0, 10);
  if (!day) { unpricedRows++; continue; }
  daysCovered.add(day);
  const qty = Number(l.quantitySold) || 0;
  const revenue = Number(l.systemRevenue) || 0;
  const cost = Number(l.systemCost) || 0;
  const fxRevenue = Number(l.foodicsRevenue) || 0;
  const fxCost = Number(l.foodicsCost) || 0;
  if (!l.recipeId) { unpricedRows++; unpricedQty += qty; unpricedNames.set(l.nameAr || l.posItemId, (unpricedNames.get(l.nameAr || l.posItemId) || 0) + qty); }
  for (const t of [grand, acc(byBranch, l.branchRef), acc(byDay, day)]) {
    t.qty += qty; t.revenue += revenue; t.cost += cost; t.foodicsRevenue += fxRevenue; t.foodicsCost += fxCost;
  }
  const e = acc(byItem, l.posItemId, l.nameAr || l.nameEn || l.posItemId, Number(l.recipePrice) || 0);
  e.qty += qty; e.revenue += revenue; e.cost += cost; e.foodicsRevenue += fxRevenue; e.foodicsCost += fxCost;
}

const pct = (c, r) => (r > 0 ? c / r : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const shape = (t) => ({
  qty: r2(t.qty), revenue: r2(t.revenue), cost: r2(t.cost),
  grossProfit: r2(t.revenue - t.cost),
  foodCostPct: r2(pct(t.cost, t.revenue) * 100),
  grossMarginPct: r2((1 - pct(t.cost, t.revenue)) * 100),
  foodicsRevenue: r2(t.foodicsRevenue), foodicsCost: r2(t.foodicsCost),
  varianceVsFoodics: r2(t.revenue - t.foodicsRevenue),
  variancePct: r2((t.foodicsRevenue > 0 ? (t.revenue - t.foodicsRevenue) / t.foodicsRevenue : 0) * 100),
});

const branchRows = [...byBranch].map(([ref, t]) => ({ ref, name: branchName.get(ref) || '', ...shape(t) }))
  .sort((a, b) => b.foodCostPct - a.foodCostPct);

let saving = 0;
if (branchRows.length > 1) {
  const best = pct(branchRows[branchRows.length - 1].cost, branchRows[branchRows.length - 1].revenue);
  for (const b of branchRows) { const c = b.revenue * best; if (b.cost > c) saving += b.cost - c; }
}

console.log('\n=== what /api/report/food-cost will return ===');
console.log('  window         ' + daysCovered.size + ' days, ' + branchRows.length + ' branches, no filter');
console.log('  totals         ' + JSON.stringify(shape(grand)));
console.log('  branchSpread   ' + JSON.stringify({
  best: branchRows[branchRows.length - 1].ref, worst: branchRows[0].ref,
  points: r2(branchRows[0].foodCostPct - branchRows[branchRows.length - 1].foodCostPct),
  savingIfBestRate: r2(saving),
}));
console.log('  unpriced       rows=' + unpricedRows + ' qty=' + unpricedQty + ' names=' + unpricedNames.size);
console.log('  byBranch rows  ' + branchRows.length);
console.log('  byDay rows     ' + byDay.size);
console.log('  byItem rows    ' + byItem.size);

console.log('\n=== BY BRANCH, worst food cost first (this is the screen) ===');
console.log('  ref    name                 qty   revenue         cost     profit    fc%  margin%   foodics rev    variance');
for (const b of branchRows) {
  console.log('  ' + b.ref.padEnd(6) + b.name.slice(0, 18).padEnd(20) +
    String(b.qty).padStart(7) + b.revenue.toFixed(2).padStart(14) + b.cost.toFixed(2).padStart(13) +
    b.grossProfit.toFixed(2).padStart(13) + '  ' + b.foodCostPct.toFixed(2).padStart(5) +
    '  ' + b.grossMarginPct.toFixed(2).padStart(7) + '%' + b.foodicsRevenue.toFixed(2).padStart(14) +
    b.varianceVsFoodics.toFixed(2).padStart(14));
}
console.log('  ' + '-'.repeat(118));
const t = shape(grand);
console.log('  TOTAL' + String(t.qty).padStart(28) + t.revenue.toFixed(2).padStart(14) +
  t.cost.toFixed(2).padStart(13) + t.grossProfit.toFixed(2).padStart(13) + '  ' +
  t.foodCostPct.toFixed(2).padStart(5) + '  ' + t.grossMarginPct.toFixed(2).padStart(7) + '%' +
  t.foodicsRevenue.toFixed(2).padStart(14) + t.varianceVsFoodics.toFixed(2).padStart(14));

console.log('\n=== TOP 10 ITEMS BY REVENUE ===');
const items = [...byItem].map(([code, t2]) => ({ code, ...t2, ...shape(t2) })).sort((a, b) => b.revenue - a.revenue);
console.log('  code         name              price  qty   revenue         cost     fc%   foodics rev    variance');
for (const e of items.slice(0, 10)) {
  console.log('  ' + e.code.padEnd(13) + String(e.name).slice(0, 16).padEnd(18) + e.price.toFixed(2).padStart(5) +
    String(e.qty).padStart(7) + e.revenue.toFixed(2).padStart(14) + e.cost.toFixed(2).padStart(13) +
    '  ' + e.foodCostPct.toFixed(2).padStart(5) + '%' + e.foodicsRevenue.toFixed(2).padStart(14) +
    e.varianceVsFoodics.toFixed(2).padStart(14));
}

console.log('\n=== the expensive items, ranked by food cost % ===');
console.log('  (anything above 50% is being sold below a sane margin)');
const bad = items.filter((e) => e.foodCostPct > 50 && e.revenue > 1000).sort((a, b) => b.foodCostPct - a.foodCostPct);
for (const e of bad) {
  console.log('  ' + e.code.padEnd(13) + String(e.name).slice(0, 16).padEnd(18) +
    'price ' + e.price.toFixed(2).padStart(6) + '  cost ' + e.cost.toFixed(2).padStart(9) +
    '  fc ' + e.foodCostPct.toFixed(2).padStart(6) + '%  margin ' + e.grossMarginPct.toFixed(2).padStart(6) + '%');
}
db.close();