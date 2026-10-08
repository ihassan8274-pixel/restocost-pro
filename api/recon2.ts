// Reconciliation: system prices (qty x recipe menu price) against Foodics.
// No commission anywhere -- the operator decided that is out of scope.
import { DatabaseSync } from 'node:sqlite';
import { buildIngestPlan } from './src/foodics/plan.js';
import { buildRecipeIndex, PRODUCT_NAME_ALIASES, normaliseProductName } from './src/data-plane/recipe-cost.js';

const D1 = '2026-09-01';
const D2 = '2026-10-04';

const db = new DatabaseSync('E:/MASSOBI APP/NEW APP/server/data/restocost.db', { readOnly: true });
const asArr = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
};
const kv = (k) => asArr(db.prepare('SELECT value FROM kv WHERE key=?').get(k)?.value);

const index = buildRecipeIndex(kv('rcerp_recipes'));
const plan = buildIngestPlan();

let sysRevenue = 0;
let sysCost = 0;
let qty = 0;
const foodics = {
  gross: 0,        // إجمالي المبيعات
  netWithVat: 0,   // صافي المبيعات مع الضريبة
  discount: 0,     // مبلغ الخصم
  totalExVat: 0,   // إجمالي المبيعات من غير ضريبة
  net: 0,          // صافي المبيعات
  vat: 0,          // الضرائب
  costColumn: 0,   // التكلفة  (wrong, shown for contrast only)
};

for (const d of plan.deduped) {
  for (const l of d.canonical.lines) {
    if (l.isTotal) continue;
    if (l.dateFrom < D1 || l.dateFrom > D2) continue;

    foodics.gross += l.sales;
    foodics.netWithVat += l.netWithVat ?? 0;
    foodics.discount += l.discount ?? 0;
    foodics.totalExVat += l.totalExVat ?? 0;
    foodics.net += l.netSales ?? 0;
    foodics.vat += l.vat ?? 0;
    foodics.costColumn += l.cost;

    const q = Number(l.qty) || 0;
    qty += q;
    const raw = normaliseProductName(l.productName);
    const r = index.byName.get(PRODUCT_NAME_ALIASES[raw] ?? raw);
    if (!r) continue;
    sysRevenue += q * (Number(r.actualMenuPrice) || 0);
    sysCost += q * (Number(r.totalCalculatedCost) || 0);
  }
}

const n = (v: number) => v.toFixed(2).padStart(16);
const pct = (a: number, b: number) => ((a / b) * 100).toFixed(2) + '%';

console.log('=== ' + D1 + ' .. ' + D2 + ' ===');
console.log('  quantity (from Foodics)          ' + qty.toFixed(0));
console.log('');
console.log('=== SYSTEM (recipe prices x Foodics quantity) ===');
console.log('  revenue  qty x actualMenuPrice    ' + n(sysRevenue));
console.log('  cost     qty x totalCalcCost     ' + n(sysCost));
console.log('  FOOD COST %                      ' + (sysCost / sysRevenue * 100).toFixed(2) + '%');
console.log('  gross margin %                   ' + (100 - sysCost / sysRevenue * 100).toFixed(2) + '%');
console.log('');
console.log('=== FOODICS (for comparison) ===');
console.log('  إجمالي المبيعات            gross' + n(foodics.gross));
console.log('  مبلغ الخصم                  disc' + n(foodics.discount));
console.log('  صافي المبيعات مع الضريبة  netVat' + n(foodics.netWithVat) + '   <-- the column to compare');
console.log('  صافي المبيعات من غير ضريبةexVat' + n(foodics.totalExVat));
console.log('  الضرائب                      vat' + n(foodics.vat));
console.log('  صافي المبيعات                net' + n(foodics.net));
console.log('  التكلفة (wrong column)    costCol' + n(foodics.costColumn));
console.log('');
console.log('=== RECONCILIATION: system revenue vs Foodics صافي المبيعات مع الضريبة ===');
const v = sysRevenue - foodics.netWithVat;
console.log('  system revenue                ' + n(sysRevenue));
console.log('  foodics  net-with-VAT         ' + n(foodics.netWithVat));
console.log('  VARIANCE                     ' + n(v) + '   (' + pct(v, sysRevenue) + ' of system revenue)');
console.log('');
console.log('=== is the variance just the discount? ===');
console.log('  foodics discount              ' + n(foodics.discount));
console.log('  variance - discount           ' + n(v - foodics.discount));
console.log('  gross - discount == netVat ?  ' +
  (Math.abs(foodics.gross - foodics.discount - foodics.netWithVat) < 0.01 ? 'YES, exact' : 'no, off by ' + (foodics.gross - foodics.discount - foodics.netWithVat).toFixed(2)));
console.log('');
console.log('=== VAT rate implied by the export ===');
console.log('  vat / netVat                   ' + (foodics.vat / foodics.netWithVat * 100).toFixed(2) + '%');
console.log('  netVat - vat == net ?          ' + (Math.abs(foodics.netWithVat - foodics.vat - foodics.net) < 0.01 ? 'YES, exact' : 'no, off by ' + (foodics.netWithVat - foodics.vat - foodics.net).toFixed(2)));
db.close();