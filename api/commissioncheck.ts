// Can the delivery commission be computed from THIS export? Check the delivery
// app settings in the live system, then check whether the export carries any
// channel or order identifier that could attribute a sale to an app.
import { DatabaseSync } from 'node:sqlite';
import { buildIngestPlan } from './src/foodics/plan.js';
import { COL, REQUIRED_COLUMNS } from './src/foodics/columns.js';

const db = new DatabaseSync('E:/MASSOBI APP/NEW APP/server/data/restocost.db', { readOnly: true });
const asArr = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
};
const kv = (k) => asArr(db.prepare('SELECT value FROM kv WHERE key=?').get(k)?.value);

console.log('=== delivery apps configured in the live system ===');
for (const a of kv('rcerp_delivery_apps')) {
  console.log('  id       :', a.id);
  console.log('  name     :', a.name ?? a.nameAr ?? a.nameEn ?? '?');
  console.log('  enabled  :', a.enabled ?? a.isActive ?? '?');
  console.log('  fields   :', Object.keys(a).join(', '));
  console.log('  ---');
}

console.log('');
console.log('=== delivery apps: commission percentages ===');
for (const a of kv('rcerp_delivery_apps')) {
  console.log('  ' + String(a.name ?? a.id).padEnd(24) + ' commissionPercent = ' + a.commissionPercent + '%   active=' + a.isActive);
}

console.log('');
console.log('=== has any commission EVER been recorded on a batch? ===');
const batches = kv('rcerp_batch_sales');
let nonZero = 0;
let maxC = 0;
for (const b of batches) {
  const c = Number(b.commissionAmount) || 0;
  if (c > 0) nonZero++;
  if (c > maxC) maxC = c;
}
console.log('  batches                       :', batches.length);
console.log('  batches with commission > 0   :', nonZero);
console.log('  largest commission recorded   :', maxC);
const n = batches.filter((b) => b.netAfterCommission !== undefined && b.netAfterCommission !== null).length;
console.log('  batches carrying netAfterComm :', n);
if (n) {
  const withB = batches.find((b) => b.netAfterCommission != null);
  const net = Number(withB.netRevenue) || 0;
  const nac = Number(withB.netAfterCommission) || 0;
  console.log('  sample: netRevenue', net, '-> netAfterCommission', nac, ' (drop', (net - nac).toFixed(2) + ')');
  console.log('  sample totalFoodCost:', withB.totalFoodCost, ' commissionAmount:', withB.commissionAmount);
  console.log('  net - cost           :', (net - (Number(withB.totalFoodCost) || 0)).toFixed(2));
}

console.log('');
console.log('=== does the Foodics export carry ANY channel or order identifier? ===');
const plan = buildIngestPlan();
// Read one export file straight from disk: plan.parsed holds ParsedReport
// objects, and resolveColumns needs the raw grid.
const { xlsxToArray, collectFiles } = await import('./src/foodics/plan.js');
const file = collectFiles()[0];
const grid = xlsxToArray(file);
const { resolveColumns } = await import('./src/foodics/columns.js');
const cols = resolveColumns(grid);
const labels = [...cols.index.keys()];
console.log('  ' + labels.length + ' columns the export actually carries:');
for (const l of labels) console.log('    ' + l);
console.log('');
const channelish = labels.filter((l) => /طلب|توصيل|منص|قناة|طلب|order|channel|delivery|app|عمولة|commission/i.test(l));
console.log('  channel / order / commission columns:', channelish.length, channelish.length ? channelish.join(', ') : '(NONE)');
console.log('');
console.log('  -> a sales-by-product report has no order id and no channel, so a sale');
console.log('     cannot be attributed to a delivery app from this file.');
db.close();