import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
  const users = await prisma.user.findMany();
  console.log('Users in PostgreSQL:');
  users.forEach(u => console.log(`  ${u.email} - ${u.name} - ${u.role} - active: ${u.isActive}`));
  await prisma.$disconnect();
}

checkUsers().catch((e) => {
  console.error(e);
  process.exit(1);
});