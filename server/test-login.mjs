import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function test() {
  const user = await prisma.user.findFirst({ where: { email: 'admin@restocost.com' } });
  console.log('User:', user ? { email: user.email, hasHash: !!user.passwordHash } : 'not found');
  if (user) {
    const valid = await bcrypt.compare('admin123', user.passwordHash);
    console.log('Password valid:', valid);
  }
  await prisma.$disconnect();
}

test().catch((e) => {
  console.error(e);
  process.exit(1);
});