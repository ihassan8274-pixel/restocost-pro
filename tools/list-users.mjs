import { readFileSync } from 'node:fs';
const url = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: url });
await client.connect();
const r = await client.query('SELECT value FROM kv WHERE key = $1', ['rcerp_users']);
const users = r.rows[0] ? (Array.isArray(r.rows[0].value) ? r.rows[0].value : JSON.parse(r.rows[0].value)) : [];
console.log('Users found:', users.length);
for (const u of users) {
  console.log(`  ${u.email} | ${u.role} | mustChangePassword: ${u.mustChangePassword}`);
}
await client.end();