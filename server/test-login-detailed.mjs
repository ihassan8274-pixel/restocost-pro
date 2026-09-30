import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function test() {
  const user = await prisma.user.findFirst({ where: { email: 'admin@restocost.com' } });
  if (!user) {
    console.log('User not found');
    await prisma.$disconnect();
    return;
  }
  
  console.log('User found:', { 
    email: user.email, 
    passwordHash: user.passwordHash,
    hashLength: user.passwordHash.length,
    isBcrypt: user.passwordHash.startsWith('$2b$')
  });
  
  // Test with admin123
  const valid1 = await bcrypt.compare('admin123', user.passwordHash);
  console.log('Password "admin123" valid:', valid1);
  
  // Test with admin
  const valid2 = await bcrypt.compare('admin', user.passwordHash);
  console.log('Password "admin" valid:', valid2);
  
  // Test with Admin
  const valid3 = await bcrypt.compare('Admin', user.passwordHash);
  console.log('Password "Admin" valid:', valid3);
  
  // Test with 0553696633
  const valid4 = await bcrypt.compare('0553696633', user.passwordHash);
  console.log('Password "0553696633" valid:', valid4);
  
  // Check hash details
  const rounds = user.passwordHash.split('$')[2];
  console.log('Bcrypt rounds:', rounds);
  
  await prisma.$disconnect();
}

test().catch((e) => {
  console.error(e);
  process.exit(1);
});