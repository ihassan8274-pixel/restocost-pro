import { readFileSync } from 'node:fs';
const url = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: url });
await client.connect();

const r = await client.query('SELECT email, "passwordHash" FROM users WHERE email = $1', ['admin@restocost.com']);
if (r.rows.length > 0) {
  console.log('Current hash:', r.rows[0].passwordHash);
  // Test password
  const { verifyPassword } = await import('./dist/auth-utils.mjs');
  const valid = await verifyPassword('Admin@123', r.rows[0].passwordHash);
  console.log('Admin@123 valid:', valid);
} else {
  console.log('User not found');
}
await client.end();