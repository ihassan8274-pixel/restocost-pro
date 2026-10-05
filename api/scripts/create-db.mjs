// ⛔ One-off helper: create a company database using the Control Plane admin role.
// Credentials come from control/.env (PG_ADMIN_URL). Nothing is hardcoded here.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function readEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2];
  }
  return out;
}

const env = readEnv(resolve(REPO, 'control/.env'));
const adminUrl = env.PG_ADMIN_URL;
if (!adminUrl) throw new Error('PG_ADMIN_URL missing from control/.env');

const target = process.argv[2];
if (!target) throw new Error('usage: node create-db.mjs <dbname>');

const sql = postgres(adminUrl, { max: 1 });
try {
  const existing = await sql`SELECT 1 FROM pg_database WHERE datname = ${target}`;
  if (existing.length) {
    console.log(`exists   ${target}`);
  } else {
    // CREATE DATABASE cannot be parameterised; the name is validated first.
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(target)) throw new Error(`unsafe db name: ${target}`);
    await sql.unsafe(`CREATE DATABASE "${target}"`);
    console.log(`created  ${target}`);
  }
  const who = await sql`SELECT current_user AS u`;
  console.log(`as       ${who[0].u}`);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}