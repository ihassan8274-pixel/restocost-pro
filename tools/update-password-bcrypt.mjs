import { readFileSync } from 'node:fs';
const url = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { default: pg } = await import('pg');
const bcrypt = await import('bcrypt');

const client = new pg.Client({ connectionString: url });
await client.connect();

// Bcrypt hash for Admin@123
const hash = await bcrypt.hash('Admin@123', 10);

await client.query(
  'UPDATE users SET "passwordHash" = $1 WHERE email = $2',
  [hash, 'admin@restocost.com']
);

console.log('✅ تم تحديث كلمة مرور admin@restocost.com إلى bcrypt hash');
await client.end();