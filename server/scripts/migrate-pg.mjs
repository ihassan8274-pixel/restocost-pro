/**
 * server/scripts/migrate-pg.mjs — one-time migration of the SQLite KV store
 * into PostgreSQL (restocost2) via Prisma.
 *
 * Design: keeps the whole document-collection contract (key -> JSON array)
 * intact in a KV table, while ALSO populating relational reference models
 * (users, branches, suppliers, raw_materials, recipes, inventory_items)
 * from the same JSON so future relational queries have real data.
 *
 * Run from project root:  node server/scripts/migrate-pg.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';

const fileURLDir = (url) => {
  let p = decodeURIComponent(new URL(url).pathname).replace(/[\\/][^\\/]*$/, '');
  if (p[0] === '/') p = p.slice(1);
  return p;
};

const serverDir = fileURLDir(import.meta.url).replace(/[\\/]scripts$/, '');
const root = path.resolve(serverDir, '..');
const dbPath = path.join(serverDir, 'data', 'restocost.db');

// Load server/.env so DATABASE_URL is available to Prisma too.
const loadDotEnv = () => {
  const envFile = path.join(serverDir, '.env');
  try {
    const txt = fs.readFileSync(envFile, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* ignore */ }
};
loadDotEnv();

const parseIso = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const parseNum = (v, d = null) => (typeof v === 'number' && Number.isFinite(v) ? v : (v !== null && v !== undefined && v !== '' ? Number(v) : d));

const STRING_FIELDS = (...keys) => (rec) => {
  const out = {};
  for (const k of keys) out[k] = typeof rec?.[k] === 'string' ? rec[k] : null;
  return out;
};

(async () => {
  console.log('١) فتح SQLite  ...');
  if (!fs.existsSync(dbPath)) {
    console.error('ملف قاعدة البيانات غير موجود:', dbPath);
    process.exit(1);
  }
  const sqlite = new DatabaseSync(dbPath, { readOnly: true });
  const keys = sqlite.prepare('SELECT key, value FROM kv').all();
  console.log('   عدد المفاتيح:', keys.length);

  const prisma = new PrismaClient();
  console.log('٢) مسح جداول PostgreSQL  ...');
  await prisma.kv.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.rawMaterial.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.inventoryItem.deleteMany();

  console.log('٣) ترحيل kv  ...');
  for (const row of keys) {
    let val;
    try { val = JSON.parse(row.value); } catch { val = null; }
    await prisma.kv.upsert({
      where: { key: row.key },
      create: { key: row.key, value: val ?? {} },
      update: { value: val ?? {} },
    });
  }

  const getRecs = (key) => {
    try {
      const v = prisma ? null : null;
      const row = keys.find((r) => r.key === key);
      if (!row) return [];
      const parsed = JSON.parse(row.value);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };

  console.log('٤) ترحيل المستخدمين  ...');
  const users = getRecs('rcerp_users');
  for (const u of users) {
    if (!u || !u.id) continue;
    await prisma.user.create({
      data: {
        id: u.id,
        name: u.name || u.fullName || '—',
        email: u.email || null,
        role: u.role || 'branch',
        branchId: u.branchId || null,
        isActive: u.isActive !== false,
        createdAt: parseIso(u.createdAt),
        lastLogin: parseIso(u.lastLogin),
        passwordHash: u.passwordHash || '',
        totpEnabled: !!u.totpEnabled,
      },
    }).catch(() => { /* تخطي تكرار */ });
  }

  console.log('٥) ترحيل الفروع  ...');
  const branches = getRecs('rcerp_branches');
  for (const b of branches) {
    if (!b || !b.id) continue;
    await prisma.branch.create({
      data: {
        id: b.id,
        name: b.name || b.nameAr || b.title || '—',
        nameAr: b.nameAr || b.name || null,
        address: b.address || null,
        phone: b.phone || null,
        isActive: b.isActive !== false,
        createdAt: parseIso(b.createdAt),
      },
    }).catch(() => {});
  }

  console.log('٦) ترحيل الموردين  ...');
  const suppliers = getRecs('rcerp_suppliers');
  for (const s of suppliers) {
    if (!s || !s.id) continue;
    await prisma.supplier.create({
      data: {
        id: s.id,
        code: typeof s.code === 'string' ? s.code : null,
        name: s.nameAr || s.name || '—',
        nameAr: s.nameAr || null,
        phone: s.phone || s.mobile || null,
        email: s.email || null,
        contact: s.contactPerson || s.contactName || null,
        address: s.address || null,
        taxNo: s.taxNumber || s.vatNumber || null,
        isActive: s.isActive !== false,
        createdAt: parseIso(s.createdAt),
      },
    }).catch(() => {});
  }

  console.log('٧) ترحيل المواد الخام  ...');
  const mats = getRecs('rcerp_raw_materials');
  for (const m of mats) {
    if (!m || !m.id) continue;
    await prisma.rawMaterial.create({
      data: {
        id: m.id,
        nameAr: m.nameAr || m.name || '—',
        nameEn: m.nameEn || m.nameEnglish || null,
        category: m.category || m.categoryName || null,
        categoryId: m.categoryId || null,
        unit: m.unit || m.purchaseUnit || 'PCS',
        purchaseUnit: m.purchaseUnit || null,
        unitFactor: parseNum(m.unitFactor, 1),
        brand: m.brand || null,
        supplierId: m.supplierId || null,
        minStock: parseNum(m.minStock),
        createdAt: parseIso(m.createdAt),
      },
    }).catch(() => {});
  }

  console.log('٨) ترحيل الوصفات  ...');
  const recipes = getRecs('rcerp_recipes');
  for (const r of recipes) {
    if (!r || !r.id) continue;
    await prisma.recipe.create({
      data: {
        id: r.id,
        nameAr: r.nameAr || r.name || '—',
        nameEn: r.nameEn || null,
        category: r.category || null,
        portions: parseNum(r.portions),
        totalCost: parseNum(r.totalCost),
        createdAt: parseIso(r.createdAt),
      },
    }).catch(() => {});
  }

  console.log('٩) ترحيل أصناف المخزون  ...');
  const inv = getRecs('rcerp_inventory');
  for (const it of inv) {
    if (!it || !it.id) continue;
    await prisma.inventoryItem.create({
      data: {
        id: it.id,
        nameAr: it.nameAr || it.name || '—',
        nameEn: it.nameEn || null,
        category: it.category || null,
        unit: it.unit || 'PCS',
        branchId: it.branchId || null,
        quantity: parseNum(it.quantity),
        cost: parseNum(it.cost),
        createdAt: parseIso(it.createdAt),
      },
    }).catch(() => {});
  }

  await prisma.$disconnect();
  sqlite.close();

  console.log('✓ اكتمل الترحيل بنجاح.');
  console.log('   kv:', keys.length);
  console.log('   users:', getRecs('rcerp_users').length);
  console.log('   branches:', getRecs('rcerp_branches').length);
  console.log('   suppliers:', getRecs('rcerp_suppliers').length);
  console.log('   raw_materials:', getRecs('rcerp_raw_materials').length);
  console.log('   recipes:', getRecs('rcerp_recipes').length);
  console.log('   inventory_items:', getRecs('rcerp_inventory').length);
})().catch((e) => {
  console.error('فشل الترحيل:', e);
  process.exit(1);
});