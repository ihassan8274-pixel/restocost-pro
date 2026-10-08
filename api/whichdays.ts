// The date-less / netWithVat-less fingerprint was losing business days.
// Which days, and which files? Verified against the raw export files.
import { buildIngestPlan, collectFiles, xlsxToArray, readReport } from './src/foodics/plan.js';

const plan = buildIngestPlan();
const days = [...new Set(plan.deduped.map((d) => d.canonical.dateFrom))].sort();
console.log('=== business days in the canonical set: ' + days.length + ' ===');
console.log('  ' + days.join('  '));

console.log('');
console.log('=== per-day report count (must be 12 everywhere) ===');
const byDay = new Map();
for (const d of plan.deduped) {
  const k = d.canonical.dateFrom;
  if (!byDay.has(k)) byDay.set(k, { reports: 0, rows: 0, qty: 0, sales: 0 });
  const e = byDay.get(k);
  e.reports++;
  for (const l of d.canonical.lines) {
    e.rows++; e.qty += l.qty; e.sales += l.sales;
  }
}
for (const [d, e] of [...byDay].sort()) {
  const flag = e.reports === 12 ? '' : '  <-- NOT 12';
  console.log('  ' + d + '  reports ' + String(e.reports).padStart(3) + '  rows ' + String(e.rows).padStart(4) +
              '  qty ' + e.qty.toFixed(0).padStart(7) + '  gross ' + e.sales.toFixed(2).padStart(12) + flag);
}

console.log('');
console.log('=== the days that the OLD 34-day figure did not include ===');
const old = new Set(['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06','2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13','2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20','2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
for (const d of days) if (!old.has(d)) console.log('  NEW DAY: ' + d);

console.log('');
console.log('=== which real files carry those new days? ===');
for (const f of collectFiles()) {
  const r = readReport(f);
  if (!r.ok) continue;
  const df = r.report.dateFrom;
  if (df && !old.has(df)) {
    console.log('  ' + f.replace(/\\/g, '/').split('/').slice(-3).join('/') + '   own date range: ' + df + ' .. ' + r.report.dateTo);
  }
}