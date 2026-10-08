// Adding netWithVat to the fingerprint may have SPLIT fingerprint groups --
// a key can only split, never merge. Re-measure the plan rather than quote the
// earlier 408 / 8,787 figures.
import { buildIngestPlan } from './src/foodics/plan.js';
import { dedupeKey } from './src/foodics/parse.js';

const plan = buildIngestPlan();
const s = plan.stats;
console.log('=== plan stats now ===');
console.log('  files discovered   :', s.totalFiles);
console.log('  files readable     :', s.readableFiles);
console.log('  files rejected     :', s.rejectedFiles);
console.log('  rows in all files  :', s.totalRows);
console.log('  duplicate files    :', s.duplicateFiles);
console.log('  unique reports     :', s.uniqueReports, s.uniqueReports === 408 ? '(unchanged)' : '<-- CHANGED from 408');
console.log('  canonical rows     :', s.canonicalRows, s.canonicalRows === 8787 ? '(unchanged)' : '<-- CHANGED from 8787');
console.log('  business days      :', s.distinctDates);

console.log('');
console.log('=== is any (branch, business day) slot now covered twice? ===');
const slots = new Map();
for (const d of plan.deduped) {
  for (const ref of new Set(d.canonical.lines.map((l) => l.branchRef))) {
    const k = ref + '|' + d.canonical.dateFrom;
    slots.set(k, (slots.get(k) ?? 0) + 1);
  }
}
const doubled = [...slots].filter(([, n]) => n > 1);
console.log('  distinct (branch, day) slots :', slots.size);
console.log('  slots covered more than once :', doubled.length);
for (const [k, n] of doubled.slice(0, 12)) console.log('    DOUBLE', k, 'x' + n);

console.log('');
console.log('=== if slots split, which days are affected? ===');
const days = new Map();
for (const d of plan.deduped) {
  const k = d.canonical.dateFrom;
  days.set(k, (days.get(k) ?? 0) + 1);
}
const odd = [...days].filter(([, n]) => n !== 12);
console.log('  days without exactly 12 reports:', odd.length);
for (const [d, n] of odd.sort()) console.log('    ' + d + ' -> ' + n + ' reports');