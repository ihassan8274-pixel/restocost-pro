import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkKv() {
  const kv = await prisma.kv.findUnique({ where: { key: 'rcerp_users' } });
  if (kv && kv.value) {
    try {
      const users = typeof kv.value === 'string' ? JSON.parse(kv.value) : kv.value;
      console.log('Users in KV store:');
      users.forEach(u => console.log(`  ${u.email} - ${u.name} - ${u.role} - active: ${u.isActive}`));
    } catch (e) {
      console.log('Error parsing KV value:', e);
    }
  } else {
    console.log('No rcerp_users in KV store');
  }
  await prisma.$disconnect();
}

checkKv().catch((e) => {
  console.error(e);
  process.exit(1);
});