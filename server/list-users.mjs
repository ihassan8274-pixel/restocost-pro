import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const r = await p.kv.findUnique({ where: { key: 'rcerp_users' } });
const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
for (const u of v) {
  console.log(`${u.id} | email=${u.email} | role=${u.role} | ${u.mustChangePassword ? 'MUSTCHG' : 'ok'}`);
  console.log(`   keys: ${Object.keys(u).join(', ')}`);
}
await p.$disconnect();