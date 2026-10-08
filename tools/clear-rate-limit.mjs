import { readFileSync } from 'node:fs';
const url = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { default: pg } = await import('pg');
const c = new pg.Client({ connectionString: url });
await c.connect();

const r = await c.query('SELECT value FROM kv WHERE key = $1', ['rcerp_rate_limits']);
const limits = r.rows[0] ? (Array.isArray(r.rows[0].value) ? r.rows[0].value : JSON.parse(r.rows[0].value)) : {};

console.log('Current rate limits:');
for (const [key, val] of Object.entries(limits)) {
  if (val.lockedUntil && val.lockedUntil > Date.now()) {
    const mins = Math.ceil((val.lockedUntil - Date.now()) / 60000);
    console.log(`  ${key}: LOCKED for ${mins} more minutes`);
  } else {
    console.log(`  ${key}: ${val.count || 0} attempts`);
  }
}

// Clear admin lockouts
let changed = 0;
for (const [key, val] of Object.entries(limits)) {
  if (key.includes('admin@restocost.com') || key.includes('login:ip:')) {
    if (val.lockedUntil && val.lockedUntil > Date.now()) {
      delete limits[key];
      changed++;
      console.log(`Cleared lockout: ${key}`);
    }
  }
}

if (changed > 0) {
  await c.query('UPDATE kv SET value = $1 WHERE key = $2', [JSON.stringify(limits), 'rcerp_rate_limits']);
  console.log(`\nCleared ${changed} lockout(s)`);
} else {
  console.log('\nNo active lockouts to clear');
}

await c.end();