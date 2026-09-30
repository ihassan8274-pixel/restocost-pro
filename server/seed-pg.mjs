import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_USERS = [
  { email: 'admin@restocost.com', password: 'admin123', name: 'Admin', role: 'admin', branchId: 'all' },
  { email: 'ceo@restocost.com', password: 'ceo123', name: 'CEO', role: 'executive', branchId: 'all' },
  { email: 'cost@restocost.com', password: 'cost123', name: 'Cost Controller', role: 'cost_controller', branchId: 'all' },
  { email: 'saud@restocost.com', password: 'saud123', name: 'Branch Manager', role: 'branch_manager', branchId: 'b-01' },
  { email: 'chef@restocost.com', password: 'chef123', name: 'Chef', role: 'chef', branchId: 'b-ck' },
  { email: 'store@restocost.com', password: 'store123', name: 'Storekeeper', role: 'storekeeper', branchId: 'b-ck' }
];

async function seed() {
  console.log('Seeding PostgreSQL database...');
  
  for (const cred of DEMO_USERS) {
    // Ensure user exists in User model
    const existing = await prisma.user.findFirst({ where: { email: cred.email } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(cred.password, 10);
      await prisma.user.create({
        data: {
          id: `user-${cred.email.split('@')[0]}`,
          email: cred.email,
          name: cred.name,
          passwordHash: await bcrypt.hash(cred.password, 10),
          role: cred.role,
          branchId: cred.branchId,
          isActive: true,
          createdAt: new Date(),
        },
      });
      console.log(`Created user: ${cred.email}`);
    } else {
      console.log(`User ${cred.email} already exists in User model`);
    }

    // Always update KV store for authentication
    const passwordHash = await bcrypt.hash(cred.password, 10);
    const existingKv = await prisma.kv.findUnique({ where: { key: 'rcerp_users' } });
    let users = [];
    if (existingKv && existingKv.value) {
      try {
        users = typeof existingKv.value === 'string' ? JSON.parse(existingKv.value) : existingKv.value;
      } catch (e) {
        users = [];
      }
    } else {
      users = [];
    }
    const userIndex = users.findIndex(u => u.email === cred.email);
    const userData = {
      id: `user-${cred.email.split('@')[0]}`,
      email: cred.email,
      name: cred.name,
      passwordHash: await bcrypt.hash(cred.password, 10),
      role: cred.role,
      branchId: cred.branchId,
      isActive: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    };
    if (userIndex >= 0) {
      users[userIndex] = {
        id: `user-${cred.email.split('@')[0]}`,
        email: cred.email,
        name: cred.name,
        passwordHash: await bcrypt.hash(cred.password, 10),
        role: cred.role,
        branchId: cred.branchId,
        isActive: true,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      };
    } else {
      users.push({
        id: `user-${cred.email.split('@')[0]}`,
        email: cred.email,
        name: cred.name,
        passwordHash: await bcrypt.hash(cred.password, 10),
        role: cred.role,
        branchId: cred.branchId,
        isActive: true,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      });
    }
    await prisma.kv.upsert({
      where: { key: 'rcerp_users' },
      create: { key: 'rcerp_users', value: users },
      update: { value: users },
    });
    console.log(`Updated KV store for: ${cred.email}`);
  }
  
  console.log('Seeding complete!');
  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});