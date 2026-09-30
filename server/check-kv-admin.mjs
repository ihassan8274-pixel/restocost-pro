import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkKv() {
  const kv = await prisma.kv.findUnique({ where: { key: 'rcerp_users' } });
  if (kv && kv.value) {
    try {
      const users = typeof kv.value === 'string' ? JSON.parse(kv.value) : kv.value;
      const admin = users.find(u => u.email === 'admin@restocost.com');
      if (admin) {
        console.log('Admin user in KV:', {
          email: admin.email,
          passwordHash: admin.passwordHash ? admin.passwordHash.substring(0, 30) + '...' : 'none',
          isActive: admin.isActive
        });
      }
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