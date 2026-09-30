import { PrismaClient } from '@prisma/client';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://restocost:restocost@127.0.0.1:5433/restocost2' } } });

async function main() {
  // Read SQLite users
  const sqliteDb = new DatabaseSync(path.join(__dirname, '..', 'server', 'data', 'restocost.db'));
  const users = JSON.parse(sqliteDb.prepare('SELECT value FROM kv WHERE key = ?').get('rcerp_users').value);
  console.log(`Found ${users.length} users in SQLite`);

  // Upsert into PostgreSQL KV table
  for (const user of users) {
    // Convert user object to JSON string for KV value
    const value = JSON.stringify(users);
    await prisma.kv.upsert({
      where: { key: 'rcerp_users' },
      create: { key: 'rcerp_users', value: users },
      update: { value: users },
    });
    console.log('Upserted rcerp_users to PostgreSQL');
    break; // only need to do it once for the whole array
  }

  // Verify
  const row = await prisma.kv.findUnique({ where: { key: 'rcerp_users' } });
  if (row) {
    const arr = JSON.parse(row.value);
    console.log(`Verified: ${arr.length} users in PostgreSQL KV`);
    arr.forEach(u => console.log(`  - ${u.email} (${u.name}) role=${u.role}`));
  }
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });