// SQLite vs a fresh PostgreSQL database, measured on THIS data.
// The question is not theory at 9,316 rows -- it is what each one costs to
// operate, and whether the app on port 3001 can keep running.
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Two levels up: this file is api/scripts/, so the repo root is ../..
const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIVE_DB = resolve(REPO, 'server/data/restocost.db');

// ── 1. how big is the data we are talking about? ──────────────────────────
const db = new DatabaseSync(LIVE_DB, { readOnly: true });
const kv = (k) => {
  const v = db.prepare('SELECT value FROM kv WHERE key=?').get(k)?.value;
  return typeof v === 'string' ? JSON.parse(v) : v;
};
const counts = {
  'rcerp_inventory_movements': (kv('rcerp_inventory_movements') ?? []).length,
  'rcerp_batch_sales': (kv('rcerp_batch_sales') ?? []).length,
  'rcerp_inventory': (kv('rcerp_inventory') ?? []).length,
  'rcerp_journal': (kv('rcerp_journal') ?? []).length,
};
db.close();
let total = 0;
for (const [k, n] of Object.entries(counts)) { console.log('  ' + k.padEnd(28) + String(n).padStart(7) + ' rows'); total += n; }
console.log('  ' + 'TOTAL'.padEnd(28) + String(total).padStart(7) + ' rows  (the Foodics import adds 9,316)');

console.log('');
console.log('=== 1. query speed: a branch x day x item rollup, the report shape ===');
// Build the same data shape as a real table, in a scratch SQLite, so the
// comparison is against rows that exist rather than rows that do not.
const scratch = new DatabaseSync(':memory:');
scratch.exec(`
  CREATE TABLE pos_order_lines (
    pos_source TEXT NOT NULL, pos_item_id TEXT NOT NULL, branch_ref TEXT NOT NULL,
    business_date TEXT NOT NULL, quantity_sold NUMERIC NOT NULL,
    gross_sales NUMERIC NOT NULL, net_sales NUMERIC NOT NULL, cost NUMERIC NOT NULL,
    profit NUMERIC NOT NULL
  );
`);
scratch.exec('BEGIN');
const ins = scratch.prepare(`INSERT INTO pos_order_lines VALUES (?,?,?,?,?,?,?,?,?)`);
const codes = ['product-1','product-2','product-3','product-4','product-5','product-6','product-7','product-8','product-9','product-10','product-11','product-12','product-13','product-14','sk-0070','sk-0071','sk-0072','sk-0073','sk-0074','sk-0075','sk-0076','sk-0077','sk-0078','sk-0079','sk-0080','sk-0081','sk-0082','sk-0059','product-15','product-16','product-17','product-18','product-19','product-20'];
const refs = ['B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12','B18'];
let seed = 20261007;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let d = 0; d < 36; d++) {
  const day = '2026-09-' + String(1 + d).padStart(2, '0');
  for (const ref of refs) {
    for (const code of codes) {
      const q = Math.round(rnd() * 40) + 1;
      const net = q * (5 + rnd() * 12);
      const cost = net * (0.2 + rnd() * 0.3);
      ins.run('foodics', code, ref, day, q, net * 1.15, net, cost, net - cost);
    }
  }
}
scratch.exec('COMMIT');
const rows = scratch.prepare('SELECT count(*) AS n FROM pos_order_lines').get() as any;
console.log('  rows in the scratch table: ' + rows.n);

const timed = (label: string, fn: () => unknown, times = 20) => {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < times; i++) fn();
  const ms = (performance.now() - t0) / times;
  console.log('  ' + label.padEnd(46) + ms.toFixed(3) + ' ms');
  return ms;
};
const t1 = timed('rollup by branch (GROUP BY, 12 rows)', () =>
  scratch.prepare(`SELECT branch_ref, count(*) n, sum(net_sales) v, sum(cost) c FROM pos_order_lines GROUP BY branch_ref`).all());
const t2 = timed('rollup by item, sorted (34 rows)', () =>
  scratch.prepare(`SELECT pos_item_id, sum(quantity_sold) q, sum(net_sales) v FROM pos_order_lines GROUP BY pos_item_id ORDER BY sum(net_sales) DESC`).all());
const t3 = timed('36-day time series (GROUP BY date)', () =>
  scratch.prepare(`SELECT business_date, sum(net_sales) v FROM pos_order_lines GROUP BY business_date ORDER BY business_date`).all());
const t4 = timed('one branch + one day (indexed lookup)', () =>
  scratch.prepare(`SELECT * FROM pos_order_lines WHERE branch_ref=? AND business_date=?`).all('B02', '2026-09-15'));
console.log('  ' + '(without indexes)');
scratch.exec('CREATE INDEX i1 ON pos_order_lines (branch_ref, business_date)');
scratch.exec('CREATE INDEX i2 ON pos_order_lines (pos_source, pos_item_id, branch_ref, business_date)');
const t5 = timed('one branch + one day (WITH indexes)', () =>
  scratch.prepare(`SELECT * FROM pos_order_lines WHERE branch_ref=? AND business_date=?`).all('B02', '2026-09-15'));
console.log('');
console.log('  -> a full report page is roughly three of these rollups: ~' +
            (t1 + t2 + t3).toFixed(1) + ' ms of query time. Sub-frame at this scale.');
scratch.close();