// Which recipe field is the sale price, and does the delivery commission
// explain the gap against Foodics?
import { DatabaseSync } from 'node:sqlite';
import { buildIngestPlan } from './src/foodics/plan.js';
import { buildRecipeIndex, PRODUCT_NAME_ALIASES, normaliseProductName } from './src/data-plane/recipe-cost.js';

const D1 = '2026-09-01';
const D2 = '2026-10-04';

const db = new DatabaseSync('E:/MASSOBI APP/NEW APP/server/data/restocost.db', { readOnly: true });
const asArr = (v: any) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
};
const kv = (k: string) => asArr(db.prepare('SELECT value FROM kv WHERE key=?').get(k)?.value);

const recipes = kv('rcerp_recipes');
const batches = kv('rcerp_batch_sales');

// --- the live system's own figures for the window ---------------------------
let liveNet = 0;
let liveGross = 0;
let liveVat = 0;
let liveCommission = 0;
let liveNetAfterCommission = 0;
let liveCost = 0;
let liveQty = 0;
let withCommission = 0;
for (const b of batches) {
  if (b.date < D1 || b.date > D2) continue;
  liveNet += Number(b.netRevenue ?? 0) || 0;
  liveGross += Number(b.totalRevenue ?? 0) || 0;
  liveVat += Number(b.vatAmount ?? 0) || 0;
  liveCommission += Number(b.commissionAmount ?? 0) || 0;
  liveNetAfterCommission += Number(b.netAfterCommission ?? 0) || 0;
  for (const l of b.items ?? []) {
    liveCost += Number(l.lineTotalCost) || 0;
    liveQty += Number(l.quantitySold) || 0;
  }
  if (Number(b.commissionAmount) > 0) withCommission++;
}

// --- Foodics, limited to the same window ------------------------------------
const index = buildRecipeIndex(recipes);
const plan = buildIngestPlan();
let fxNet = 0;
let fxGross = 0;
let byActual = 0;
let bySuggested = 0;
let byPriceField: Record<string, number> = {};
let rowsCount = 0;

const priceFields = ['actualMenuPrice', 'suggestedPrice', 'totalCalculatedCost'];

for (const d of plan.deduped) {
  for (const l of d.canonical.lines) {
    if (l.isTotal) continue;
    if (l.dateFrom < D1 || l.dateFrom > D2) continue;
    rowsCount++;
    fxNet += l.netSales ?? 0;
    fxGross += l.sales;

    const raw = normaliseProductName(l.productName);
    const r = index.byName.get(PRODUCT_NAME_ALIASES[raw] ?? raw);
    if (!r) continue;
    const qty = Number(l.qty) || 0;
    byActual += qty * (Number(r.actualMenuPrice) || 0);
    bySuggested += qty * (Number(r.suggestedPrice) || 0);
    for (const f of priceFields) {
      byPriceField[f] = (byPriceField[f] ?? 0) + qty * (Number((r as any)[f]) || 0);
    }
  }
}

const f = (v: number) => v.toFixed(2);
console.log('=== ' + D1 + ' .. ' + D2 + ' | ' + rowsCount + ' export rows ===');
console.log('');
console.log('--- candidate revenue built from the recipe x Foodics quantity ---');
console.log('  qty x actualMenuPrice  ' + f(byActual));
console.log('  qty x suggestedPrice  ' + f(bySuggested));
console.log('');
console.log('--- the live system, same window ---');
console.log('  totalRevenue (gross)  ' + f(liveGross));
console.log('  netRevenue            ' + f(liveNet));
console.log('  vatAmount             ' + f(liveVat));
console.log('  commissionAmount      ' + f(liveCommission) + '   on ' + withCommission + ' batch(es)');
console.log('  netAfterCommission    ' + f(liveNetAfterCommission));
console.log('');
console.log('--- the Foodics export ---');
console.log('  net sales             ' + f(fxNet));
console.log('  gross sales           ' + f(fxGross));
console.log('');
console.log('--- which candidate matches the live net revenue? ---');
console.log('  live netRevenue       ' + f(liveNet));
for (const [k, v] of Object.entries(byPriceField)) {
  console.log('  qty x ' + k.padEnd(20) + f(v) + '   diff ' + f(v - liveNet));
}
console.log('');
console.log('--- quantity check ---');
console.log('  live qty              ' + liveQty.toFixed(0));
console.log('  export qty            ' + plan.deduped.reduce((s, d) => s + d.canonical.lines.filter((l) => !l.isTotal && l.dateFrom >= D1 && l.dateFrom <= D2).reduce((a, l) => a + (Number(l.qty) || 0), 0), 0).toFixed(0));
db.close();