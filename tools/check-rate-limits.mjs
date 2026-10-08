import { readFileSync } from 'node:fs';
const url = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { default: pg } = await import('pg');
const c = new pg.Client({ connectionString: url });
await c.connect();

const r = await c.query("SELECT key, value FROM kv WHERE key LIKE 'rcerp_rate_limits%' OR key LIKE '%login%' OR key LIKE '%attempt%'");
for (const row of r.rows) {
  const val = Array.isArray(row.value) ? row.value : JSON.parse(row.value);
  console.log(`${row.key}:`, JSON.stringify(val, null, 2));
}
await c.end();