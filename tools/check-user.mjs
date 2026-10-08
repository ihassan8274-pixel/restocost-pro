import { readFileSync } from 'node:fs';
const url = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: url });
await client.connect();

const r = await client.query('SELECT email, "passwordHash", "lockedUntil" FROM users WHERE email = $1', ['admin@restocost.com']);
if (r.rows.length > 0) {
  console.log('User:', JSON.stringify(r.rows[0], null, 2));
} else {
  console.log('User not found');
}
await client.end();