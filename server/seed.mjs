#!/usr/bin/env node
/**
 * RestoCost ERP — Initial seed script.
 * Run explicitly with `npm run seed` on first install ONLY.
 * It is intentionally NOT run automatically, so real users are never
 * overwritten by demo data.
 */
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcrypt';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEMO_USERS = [
  { email: 'admin@restocost.com', password: 'admin123', name: 'مدير النظام', role: 'admin', branchId: 'all' },
  { email: 'ceo@restocost.com', password: 'ceo123', name: 'أحمد السفير', role: 'executive', branchId: 'all' },
  { email: 'cost@restocost.com', password: 'cost123', name: 'طارق عبدالمقصود', role: 'cost_controller', branchId: 'all' },
  { email: 'saud@restocost.com', password: 'saud123', name: 'سعود المطيري', role: 'branch_manager', branchId: 'b-01' },
  { email: 'chef@restocost.com', password: 'chef123', name: 'إبراهيم العلي', role: 'chef', branchId: 'b-ck' },
  { email: 'store@restocost.com', password: 'store123', name: 'علي الشمري', role: 'storekeeper', branchId: 'b-ck' },
];

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'restocost.db'));

function getKV(key) {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}
function setKV(key, value) {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

const existing = getKV('rcerp_users');
if (existing && existing.length > 0) {
  console.log(`Seed skipped — rcerp_users already has ${existing.length} user(s): ${existing.map((u) => u.email).join(', ')}`);
  process.exit(0);
}

const users = [];
for (const cred of DEMO_USERS) {
  users.push({
    id: `user-${cred.email.split('@')[0]}`,
    name: cred.name,
    email: cred.email,
    passwordHash: await bcrypt.hash(cred.password, 12),
    role: cred.role,
    branchId: cred.branchId,
    isActive: true,
    // Passwords above are known/demo — force a change on first login.
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });
}

setKV('rcerp_users', users);
console.log(`Seeded ${users.length} demo users:`);
users.forEach((u) => console.log(`  - ${u.email} (${u.role})`));
console.log('\nImportant: change the default admin password right after first login.');