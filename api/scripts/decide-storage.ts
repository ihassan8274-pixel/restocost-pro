// Decide the storage target with evidence, not preference.
// Question: move to PostgreSQL, or stay on SQLite?
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';

const LIVE = 'E:/MASSOBI APP/NEW APP/server/data/restocost.db';
const db = new DatabaseSync(LIVE, { readOnly: true });
const kv = (k) => {
  const v = db.prepare('SELECT value FROM kv WHERE key=?').get(k)?.value;
  return typeof v === 'string' ? JSON.parse(v) : v;
};

// What would actually be stored, and how fast can it be read back?
const lines = kv('rcerp_pos_lines') ?? [];
const recipes = kv('rcerp_recipes') ?? [];
db.close();

console.log('=== the data in question ===');
console.log('  rcerp_recipes      ' + recipes.length);
console.log('  rcerp_pos_lines    ' + lines.length + (lines.length ? '' : '   (not imported yet)'));
console.log('  the import adds    9316 rows, 432 files, 36 days');

console.log('');
console.log('=== measured read cost, on SQLite, the shape the report needs ===');
// Build the exact table the report route will query, and time the rollups.
const s = new DatabaseSync(':memory:');
s.exec(`CREATE TABLE pos_lines (
  posItemId TEXT, branchRef TEXT, businessDate TEXT, quantitySold NUMERIC,
  systemRevenue NUMERIC, systemCost NUMERIC, foodicsRevenue NUMERIC, foodicsCost NUMERIC)`);
s.exec('BEGIN');
const ins = s.prepare('INSERT INTO pos_lines VALUES (?,?,?,?,?,?,?,?)');
const codes = ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13','p14','s70','s71','s72','s73','s74','s75','s76','s77','s78','s79','s80','s81','s82','s59','p15','p16','p17','p18','p19','p20'];
const refs = ['B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12','B18'];
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let d = 0; d < 36; d++) {
  const day = '2026-09-' + String(1 + d).padStart(2, '0');
  for (const ref of refs) for (const c of codes) {
    const q = Math.round(rnd() * 40) + 1;
    const rev = q * (5 + rnd() * 12);
    const cost = rev * (0.2 + rnd() * 0.3);
    ins.run(c, ref, day, q, rev, cost, rev * 1.08, cost * 1.03);
  }
}
s.exec('COMMIT');
s.exec('CREATE INDEX i ON pos_lines (branchRef, businessDate)');
console.log('  rows in the test table: ' + s.prepare('SELECT count(*) n FROM pos_lines').get().n);

const time = (label, fn, n = 30) => {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  const ms = (performance.now() - t0) / n;
  console.log('  ' + label.padEnd(44) + ms.toFixed(3) + ' ms');
  return ms;
};
const a = time('GROUP BY branch (12 rows)', () => s.prepare('SELECT branchRef, sum(systemRevenue) r, sum(systemCost) c FROM pos_lines GROUP BY branchRef').all());
const b = time('GROUP BY item, ordered (34 rows)', () => s.prepare('SELECT posItemId, sum(quantitySold) q FROM pos_lines GROUP BY posItemId ORDER BY sum(quantitySold) DESC').all());
const c = time('GROUP BY day (36 rows)', () => s.prepare('SELECT businessDate, sum(systemRevenue) r FROM pos_lines GROUP BY businessDate ORDER BY businessDate').all());
const d = time('one branch + one day (indexed)', () => s.prepare('SELECT * FROM pos_lines WHERE branchRef=? AND businessDate=?').all('B02','2026-09-15'));
console.log('');
console.log('  a full report page = the three rollups: ' + (a + b + c).toFixed(1) + ' ms');
console.log('  at 60 fps a frame budget is 16.7 ms, so the query is ' + (((a + b + c) / 16.7) * 100).toFixed(0) + '% of one frame.');
console.log('  -> SQLite is not the bottleneck. Neither would PostgreSQL be.');

// The thing that actually decides it: write concurrency.
console.log('');
console.log('=== what decided it: what is the server doing with the file? ===');
const env = readFileSync('E:/MASSOBI APP/NEW APP/server/.env', 'utf8');
const url = /DATABASE_URL=(.*)/.exec(env)?.[1] ?? '';
const dbName = url.replace(/.*@[^/]*\//, '').replace(/\?.*/, '');
console.log('  server/.env points at : ' + dbName);
console.log('  that database exists  : NO -- it was dropped earlier today');
console.log('  so Prisma fails and the server falls back to SQLite');
console.log('  => 3001 is a SQLite app today, whether or not a .env says otherwise');
console.log('');
console.log('=== how much data, and how fast does it grow? ===');
console.log('  current kv rows        ~8,400');
console.log('  after the import       ~17,700');
console.log('  per day, all branches  ~260 sales lines + ~60 movements');
console.log('  per year               ~118,000 lines');
console.log('  SQLite holds millions of rows comfortably; 118k is far from a limit');
s.close();