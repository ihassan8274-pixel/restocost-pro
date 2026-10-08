// Where does the live system's unitCost come from? Recipes have no unitCost
// field, so the number in batch_sales is derived somewhere.
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('E:/MASSOBI APP/NEW APP/server/data/restocost.db', { readOnly: true });
const asArr = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
};
const kv = (k) => asArr(db.prepare('SELECT value FROM kv WHERE key=?').get(k)?.value);

const recipes = kv('rcerp_recipes');
const bs = kv('rcerp_batch_sales');

const sample = recipes.find((r) => r.nameEn === 'Masoobi');
console.log('=== recipe: Masoobi ===');
console.log('  id                  :', sample.id);
console.log('  portionSize         :', sample.portionSize);
console.log('  yieldPieces         :', sample.yieldPieces);
console.log('  totalCalculatedCost :', sample.totalCalculatedCost);
console.log('  packagingCost       :', sample.packagingCost);
console.log('  directLaborCost     :', sample.directLaborCost);
console.log('  ingredients         :', sample.ingredients.length, 'line(s)');
console.log('  first ingredient    :', JSON.stringify(sample.ingredients[0]));
const sumIng = sample.ingredients.reduce((s, i) => s + (Number(i.cost ?? i.lineCost ?? i.total ?? 0) || 0), 0);
console.log('  sum of ingredient cost:', sumIng);

console.log('');
console.log('=== the live batch_sales lines for that recipe ===');
const hit = [];
for (const b of bs) for (const l of b.items ?? []) if (l.recipeId === sample.id) hit.push(l);
console.log('  lines found:', hit.length);
const ucs = [...new Set(hit.map((l) => Number(l.unitCost)))];
console.log('  distinct unitCost values:', ucs.join(', '));
const one = hit[0];
console.log('  example: qty', one.quantitySold, 'x unitCost', one.unitCost, '=', one.lineTotalCost);
console.log('  qty x unitCost == lineTotalCost ?', Math.abs(one.quantitySold * Number(one.unitCost) - one.lineTotalCost) < 0.005);

// Does unitCost equal totalCalculatedCost, or totalCalculatedCost / something?
console.log('');
console.log('=== candidate derivations ===');
const tcc = Number(sample.totalCalculatedCost) || 0;
console.log('  observed unitCost      :', ucs[0]);
console.log('  totalCalculatedCost    :', tcc);
console.log('  tcc / portionSize      :', sample.portionSize ? (tcc / sample.portionSize).toFixed(4) : 'n/a');
console.log('  tcc / yieldPieces      :', sample.yieldPieces ? (tcc / sample.yieldPieces).toFixed(4) : 'n/a');
console.log('  sum ingredients        :', sumIng);
console.log('  tcc + packaging        :', tcc + (Number(sample.packagingCost) || 0));

// Across every recipe the live system priced, does unitCost == tcc?
console.log('');
console.log('=== across ALL priced items: does unitCost equal totalCalculatedCost? ===');
let same = 0, diff = 0;
const diffs = [];
for (const b of bs) {
  for (const l of b.items ?? []) {
    const r = recipes.find((x) => x.id === l.recipeId);
    if (!r) continue;
    const a = Number(l.unitCost), c = Number(r.totalCalculatedCost) || 0;
    if (Math.abs(a - c) < 0.005) same++; else { diff++; if (diffs.length < 8) diffs.push({ name: r.nameEn || r.nameAr, unitCost: a, tcc: c }); }
  }
}
console.log('  unitCost == totalCalculatedCost :', same);
console.log('  different                        :', diff);
for (const d of diffs) console.log('    ' + String(d.name).padEnd(20) + 'unitCost ' + d.unitCost + '  vs  tcc ' + d.tcc);
db.close();