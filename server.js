const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { query, withTransaction } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3032);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;

app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));

// Ensure DB indexes for performance (non-blocking)
setImmediate(async () => {
  const idx = [
    `CREATE INDEX IF NOT EXISTS idx_monthly_records_month_branch ON monthly_records (month, branch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_month_branch ON expenses (month, branch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses (expense_type_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
  ];
  for (const sql of idx) {
    try { await query(sql); } catch (_) {}
  }
});

// ============================================================
// HELPERS
// ============================================================
function number(value) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function monthDate(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Invalid month: ${month}`);
  return `${month}-01`;
}

function prevMonthStr(month) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// ============================================================
// AUTH + SECURITY + AUDIT HELPERS
// ============================================================
const crypto = require('crypto');
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !String(stored).includes(':') || !password) return false;
  const [salt, hash] = String(stored).split(':');
  try {
    const test = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return test.length === expected.length && crypto.timingSafeEqual(test, expected);
  } catch (_) { return false; }
}
function makeToken() { return crypto.randomBytes(32).toString('hex'); }

function extractToken(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.query && req.query.token) return req.query.token;
  if (req.body && req.body.token) return req.body.token;
  return null;
}

async function addAudit(req, action, entity, entityId, details) {
  try {
    const u = req.user || null;
    await query(
      `INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [u ? u.id : null, u ? u.username : 'نظام', action, entity, entityId || null, details ? JSON.stringify(details) : null]
    );
  } catch (e) { /* audit must never break requests */ }
}

async function notify(kind, title, message, userId = null) {
  try {
    await query(
      `INSERT INTO notifications (kind, title, message, user_id) VALUES ($1,$2,$3,$4)`,
      [kind, title, message, userId]
    );
  } catch (e) { /* ignore */ }
}

async function isMonthLocked(month) {
  const m = monthDate(month);
  const r = await query('SELECT COALESCE(locked,0) AS locked FROM monthly_records WHERE month=$1 LIMIT 1', [m]);
  if (r.rows.length && Number(r.rows[0].locked)) return true;
  const a = await query('SELECT status FROM report_approvals WHERE month=$1', [m]);
  return a.rows.length > 0 && a.rows[0].status === 'locked';
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'تسجيل الدخول مطلوب' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'لا تملك الصلاحية لهذا الإجراء' });
    next();
  };
}
const canApprove = requireRole('admin', 'finance_manager', 'reviewer');
const canEdit = requireRole('admin', 'finance_manager', 'branch_manager');

// Auth middleware: resolves the user from Bearer token (all /api except login + health)
app.use('/api', (req, res, next) => {
  const p = req.path;
  if (p === '/health' || p === '/auth/login') return next();
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'غير مسجل دخول' });
  query(
    `SELECT s.token, s.expires_at, u.id AS uid, u.username, u.display_name, u.role, u.active
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`,
    [token]
  ).then((r) => {
    if (!r.rows.length) return res.status(401).json({ error: 'جلسة غير صالحة' });
    const s = r.rows[0];
    if (new Date(s.expires_at) < new Date()) return res.status(401).json({ error: 'انتهت الجلسة، سجل دخول من جديد' });
    if (Number(s.active) !== 1) return res.status(403).json({ error: 'الحساب معطل' });
    req.user = { id: s.uid, username: s.username, name: s.display_name, role: s.role, token };
    query('UPDATE sessions SET last_seen=NOW() WHERE token=$1', [token]).catch(() => {});
    next();
  }).catch((e) => {
    console.error('[auth]', e.message);
    res.status(500).json({ error: 'خطأ في التحقق من الجلسة' });
  });
});

// Auto-audit: log every successful mutation
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !req.path.includes('/auth/login')) {
    res.on('finish', () => {
      if (res.statusCode < 400 && req.user) {
        const seg = req.path.split('/').filter(Boolean);
        const entity = seg[1] || req.method.toLowerCase();
        const entityId = seg.slice(2).join('/') || null;
        let details = null;
        if (req.body) {
          const b = { ...req.body };
          delete b.password; delete b.token;
          if (Object.keys(b).length) details = { body: b };
        }
        addAudit(req, `${req.method.toLowerCase()}_${entity}`, entity, entityId, details);
      }
    });
  }
  next();
});

// ============================================================
// AUTH ROUTES
// ============================================================
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  const r = await query('SELECT * FROM users WHERE username=$1 AND active=1', [String(username).trim()]);
  if (!r.rows.length || !verifyPassword(password, r.rows[0].password_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  const u = r.rows[0];
  const token = makeToken();
  await query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)',
    [token, u.id, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()]
  );
  res.json({ token, user: { id: u.id, username: u.username, name: u.display_name, role: u.role } });
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  const token = extractToken(req);
  if (token) await query('DELETE FROM sessions WHERE token=$1', [token]);
  res.status(204).end();
}));

app.get('/api/auth/me', asyncRoute(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'غير مسجل' });
  res.json({ user: { id: req.user.id, username: req.user.username, name: req.user.name, role: req.user.role } });
}));

app.post('/api/auth/change-password', asyncRoute(async (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !next) return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
  if (String(next).length < 6) return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة (6 أحرف على الأقل)' });
  const r = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!r.rows.length || !verifyPassword(current, r.rows[0].password_hash)) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  await query('UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1', [req.user.id, hashPassword(next)]);
  res.json({ ok: true });
}));

// ============================================================
// USERS CRUD (admin)
// ============================================================
const userSelect = 'SELECT id, username, display_name AS "displayName", role, active, created_at AS "createdAt" FROM users';

app.get('/api/users', requireRole('admin'), asyncRoute(async (_req, res) => {
  res.json((await query(`${userSelect} ORDER BY id`)).rows);
}));

app.post('/api/users', requireRole('admin'), asyncRoute(async (req, res) => {
  const { username, password, name, role = 'viewer', active = 1 } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username و password مطلوبان' });
  if (String(password).length < 6) return res.status(400).json({ error: 'كلمة المرور قصيرة (6 أحرف على الأقل)' });
  const roles = ['admin', 'finance_manager', 'branch_manager', 'reviewer', 'viewer'];
  if (!roles.includes(role)) return res.status(400).json({ error: 'دور غير صالح' });
  const r = await query(
    `INSERT INTO users (username, password_hash, display_name, role, active)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [String(username).trim().toLowerCase(), hashPassword(password), name || username, role, active ? 1 : 0]
  );
  res.status(201).json((await query(`${userSelect} WHERE id=$1`, [r.rows[0].id])).rows[0]);
}));

app.put('/api/users/:id', requireRole('admin'), asyncRoute(async (req, res) => {
  const { name, role, active, password } = req.body || {};
  const roles = ['admin', 'finance_manager', 'branch_manager', 'reviewer', 'viewer'];
  if (role && !roles.includes(role)) return res.status(400).json({ error: 'دور غير صالح' });
  const id = Number(req.params.id);
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'كلمة المرور قصيرة' });
    await query('UPDATE users SET password_hash=$2 WHERE id=$1', [id, hashPassword(password)]);
  }
  const r = await query(
    `UPDATE users SET display_name=COALESCE($2, display_name), role=COALESCE($3, role), active=COALESCE($4, active), updated_at=NOW()
     WHERE id=$1 RETURNING id`,
    [id, name !== undefined ? String(name) : null, role || null, active !== undefined ? (active ? 1 : 0) : null]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'User not found' });
  res.json((await query(`${userSelect} WHERE id=$1`, [id])).rows[0]);
}));

app.delete('/api/users/:id', requireRole('admin'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.id === id) return res.status(400).json({ error: 'لا يمكن حذف حسابك الحالي' });
  const r = await query('DELETE FROM users WHERE id=$1 RETURNING id', [id]);
  await query('DELETE FROM sessions WHERE user_id=$1', [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'User not found' });
  res.status(204).end();
}));

// ============================================================
// BRANDS CRUD
// ============================================================
app.get('/api/brands', asyncRoute(async (_req, res) => {
  const result = await query('SELECT id, name, color FROM brands ORDER BY id');
  res.json(result.rows);
}));

app.post('/api/brands', asyncRoute(async (req, res) => {
  const { name, color = '#D4AF37' } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const result = await query(
    `INSERT INTO brands (name, color) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET color=EXCLUDED.color, updated_at=NOW()
     RETURNING id, name, color`,
    [String(name).trim(), color]
  );
  res.status(201).json(result.rows[0]);
}));

app.put('/api/brands/:id', asyncRoute(async (req, res) => {
  const { name, color } = req.body || {};
  const result = await query(
    `UPDATE brands SET name=COALESCE($2, name), color=COALESCE($3, color), updated_at=NOW()
     WHERE id=$1 RETURNING id, name, color`,
    [Number(req.params.id), name || null, color || null]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Brand not found' });
  res.json(result.rows[0]);
}));

app.delete('/api/brands/:id', asyncRoute(async (req, res) => {
  const result = await query('DELETE FROM brands WHERE id=$1', [Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Brand not found' });
  res.status(204).end();
}));

// ============================================================
// BRANCHES CRUD
// ============================================================
const branchSelect = `
  SELECT b.id, b.name, b.brand_id AS "brandId", b.region, b.opening, b.closing,
         br.name AS "brandName", br.color AS "brandColor"
  FROM branches b LEFT JOIN brands br ON br.id = b.brand_id
`;

app.get('/api/branches', asyncRoute(async (_req, res) => {
  const result = await query(`${branchSelect} ORDER BY b.id`);
  res.json(result.rows.map(r => ({ ...r, opening: number(r.opening), closing: number(r.closing) })));
}));

app.post('/api/branches', asyncRoute(async (req, res) => {
  const { name, brandId = null, region = null, opening = 0, closing = 0 } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const result = await query(
    `INSERT INTO branches (name, brand_id, region, opening, closing)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (name) DO UPDATE SET brand_id=EXCLUDED.brand_id, region=EXCLUDED.region,
       opening=EXCLUDED.opening, closing=EXCLUDED.closing, updated_at=NOW()
     RETURNING id`,
    [String(name).trim(), brandId || null, region || null, number(opening), number(closing)]
  );
  const created = await query(`${branchSelect} WHERE b.id=$1`, [result.rows[0].id]);
  res.status(201).json(created.rows[0]);
}));

app.put('/api/branches/:id', asyncRoute(async (req, res) => {
  const { name, brandId, region, opening, closing } = req.body || {};
  const result = await query(
    `UPDATE branches SET
       name=COALESCE($2, name),
       brand_id=COALESCE($3, brand_id),
       region=COALESCE($4, region),
       opening=COALESCE($5, opening),
       closing=COALESCE($6, closing),
       updated_at=NOW()
     WHERE id=$1 RETURNING id`,
    [Number(req.params.id), name || null, brandId !== undefined ? brandId : null, region || null, opening !== undefined ? number(opening) : null, closing !== undefined ? number(closing) : null]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Branch not found' });
  const updated = await query(`${branchSelect} WHERE b.id=$1`, [Number(req.params.id)]);
  res.json(updated.rows[0]);
}));

app.delete('/api/branches/:id', asyncRoute(async (req, res) => {
  const result = await query('DELETE FROM branches WHERE id=$1', [Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Branch not found' });
  res.status(204).end();
}));

// ============================================================
// MONTHLY RECORDS
// ============================================================
app.get('/api/records', asyncRoute(async (req, res) => {
  const { month, branchId, brandId } = req.query;
  const params = [];
  let sql = `
    SELECT TO_CHAR(mr.month, 'YYYY-MM') AS month, mr.branch_id AS "branchId",
           mr.opening, mr.closing, mr.purchases, mr.transfers, mr.sales, mr.notes,
           b.name AS "branchName", b.brand_id AS "brandId", br.name AS "brandName", br.color AS "brandColor", b.region
    FROM monthly_records mr
    JOIN branches b ON b.id = mr.branch_id
    LEFT JOIN brands br ON br.id = b.brand_id
    WHERE 1=1
  `;
  if (month) { params.push(monthDate(String(month))); sql += ` AND mr.month=$${params.length}`; }
  if (branchId) { params.push(Number(branchId)); sql += ` AND mr.branch_id=$${params.length}`; }
  if (brandId) { params.push(Number(brandId)); sql += ` AND b.brand_id=$${params.length}`; }
  sql += ' ORDER BY mr.month, b.id';
  const result = await query(sql, params);
  res.json(result.rows.map(r => ({
    ...r,
    opening: number(r.opening), closing: number(r.closing),
    purchases: number(r.purchases), transfers: number(r.transfers), sales: number(r.sales)
  })));
}));

// Upsert one record
app.put('/api/records/:month/:branchId', canEdit, asyncRoute(async (req, res) => {
  if (await isMonthLocked(String(req.params.month))) return res.status(403).json({ error: `الشهر ${req.params.month} مقفول ولا يمكن تعديله` });
  const { opening, closing, purchases, transfers, sales, notes } = req.body || {};
  const result = await query(
    `INSERT INTO monthly_records (month, branch_id, opening, closing, purchases, transfers, sales, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (month, branch_id) DO UPDATE SET
       opening=EXCLUDED.opening, closing=EXCLUDED.closing,
       purchases=EXCLUDED.purchases, transfers=EXCLUDED.transfers, sales=EXCLUDED.sales,
       notes=EXCLUDED.notes, updated_at=NOW()
       RETURNING TO_CHAR(month,'YYYY-MM') AS month, branch_id AS "branchId"`,
    [monthDate(String(req.params.month)), Number(req.params.branchId),
     number(opening), number(closing), number(purchases), number(transfers), number(sales),
     notes != null ? String(notes) : '']
  );
  res.json(result.rows[0]);
}));

// Bulk upsert for a month
app.put('/api/records/:month', canEdit, asyncRoute(async (req, res) => {
  if (await isMonthLocked(String(req.params.month))) return res.status(403).json({ error: `الشهر ${req.params.month} مقفول ولا يمكن تعديله` });
  const rows = Array.isArray(req.body) ? req.body : [];
  await withTransaction(async (client) => {
    for (const row of rows) {
      await client.query(
        `INSERT INTO monthly_records (month, branch_id, opening, closing, purchases, transfers, sales, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (month, branch_id) DO UPDATE SET
           opening=EXCLUDED.opening, closing=EXCLUDED.closing,
           purchases=EXCLUDED.purchases, transfers=EXCLUDED.transfers, sales=EXCLUDED.sales,
           notes=EXCLUDED.notes, updated_at=NOW()`,
        [monthDate(String(req.params.month)), Number(row.branchId),
         number(row.opening), number(row.closing), number(row.purchases), number(row.transfers), number(row.sales),
         row.notes != null ? String(row.notes) : '']
      );
    }
  });
  res.json({ ok: true, updated: rows.length });
}));

// Delete a month entirely (cascades records + we also clean expenses for that month)
app.delete('/api/records/:month', asyncRoute(async (req, res) => {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM monthly_records WHERE month=$1', [monthDate(String(req.params.month))]);
    await client.query('DELETE FROM expenses WHERE month=$1', [monthDate(String(req.params.month))]);
  });
  res.status(204).end();
}));

// ============================================================
// EXPENSE TYPES CRUD
// ============================================================
app.get('/api/expense-types', asyncRoute(async (_req, res) => {
  const result = await query('SELECT id, name, category FROM expense_types ORDER BY id');
  res.json(result.rows);
}));

app.post('/api/expense-types', asyncRoute(async (req, res) => {
  const { name, category = 'other' } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const valid = ['fixed', 'variable', 'administrative', 'operational', 'other'];
  if (!valid.includes(category)) return res.status(400).json({ error: 'invalid category' });
  const result = await query(
    `INSERT INTO expense_types (name, category) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET category=EXCLUDED.category, updated_at=NOW()
     RETURNING id, name, category`,
    [String(name).trim(), category]
  );
  res.status(201).json(result.rows[0]);
}));

app.put('/api/expense-types/:id', asyncRoute(async (req, res) => {
  const { name, category } = req.body || {};
  const result = await query(
    `UPDATE expense_types SET name=COALESCE($2, name), category=COALESCE($3, category), updated_at=NOW()
     WHERE id=$1 RETURNING id, name, category`,
    [Number(req.params.id), name || null, category || null]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Expense type not found' });
  res.json(result.rows[0]);
}));

app.delete('/api/expense-types/:id', asyncRoute(async (req, res) => {
  const result = await query('DELETE FROM expense_types WHERE id=$1', [Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Expense type not found' });
  res.status(204).end();
}));

// ============================================================
// EXPENSES CRUD
// ============================================================
const expenseSelect = `
  SELECT e.id, TO_CHAR(e.month, 'YYYY-MM') AS month, e.branch_id AS "branchId",
         e.expense_type_id AS "expenseTypeId", e.amount, e.description,
         b.name AS "branchName", et.name AS "typeName", et.category
  FROM expenses e
  JOIN branches b ON b.id = e.branch_id
  JOIN expense_types et ON et.id = e.expense_type_id
`;

app.get('/api/expenses', asyncRoute(async (req, res) => {
  const { month, branchId, typeId, category } = req.query;
  const params = [];
  let sql = `${expenseSelect} WHERE 1=1`;
  if (month) { params.push(monthDate(String(month))); sql += ` AND e.month=$${params.length}`; }
  if (branchId) { params.push(Number(branchId)); sql += ` AND e.branch_id=$${params.length}`; }
  if (typeId) { params.push(Number(typeId)); sql += ` AND e.expense_type_id=$${params.length}`; }
  if (category) { params.push(category); sql += ` AND et.category=$${params.length}`; }
  sql += ' ORDER BY b.name, et.name, e.id';
  const result = await query(sql, params);
  res.json(result.rows.map(r => ({ ...r, amount: number(r.amount) })));
}));

app.post('/api/expenses', canEdit, asyncRoute(async (req, res) => {
  const { month, branchId, expenseTypeId, amount, description = '' } = req.body || {};
  if (!month || !branchId || !expenseTypeId) return res.status(400).json({ error: 'month, branchId, expenseTypeId are required' });
  if (await isMonthLocked(String(month))) return res.status(403).json({ error: `الشهر ${month} مقفول ولا يمكن تعديله` });
  const result = await query(
    `INSERT INTO expenses (month, branch_id, expense_type_id, amount, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [monthDate(String(month)), Number(branchId), Number(expenseTypeId), number(amount), description || null]
  );
  const created = await query(`${expenseSelect} WHERE e.id=$1`, [result.rows[0].id]);
  res.status(201).json(created.rows[0]);
}));

app.put('/api/expenses/:id', canEdit, asyncRoute(async (req, res) => {
  const m = await query("SELECT TO_CHAR(month,'YYYY-MM') AS month FROM expenses WHERE id=$1", [Number(req.params.id)]);
  if (!m.rowCount) return res.status(404).json({ error: 'Expense not found' });
  if (m.rows[0].month && await isMonthLocked(String(m.rows[0].month))) return res.status(403).json({ error: `شهر هذه المصروفات مقفول ولا يمكن تعديله` });
  const { amount, description, branchId, expenseTypeId, month } = req.body || {};
  if (month) {
    const newMonth = monthDate(String(month));
    if (await isMonthLocked(String(month))) return res.status(403).json({ error: `الشهر ${month} مقفول ولا يمكن تعديله` });
    var newMonthParam = newMonth;
  }
  const result = await query(
    `UPDATE expenses SET amount=COALESCE($2, amount), description=COALESCE($3, description),
     branch_id=COALESCE($4::integer, branch_id), expense_type_id=COALESCE($5::integer, expense_type_id),
     month=COALESCE($6::date, month), updated_at=NOW()
     WHERE id=$1 RETURNING id`,
    [Number(req.params.id), amount !== undefined ? number(amount) : null, description !== undefined ? description : null,
     branchId !== undefined && branchId !== null && branchId !== '' ? Number(branchId) : null,
     expenseTypeId !== undefined && expenseTypeId !== null && expenseTypeId !== '' ? Number(expenseTypeId) : null,
     newMonthParam ?? null]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Expense not found' });
  const updated = await query(`${expenseSelect} WHERE e.id=$1`, [Number(req.params.id)]);
  res.json(updated.rows[0]);
}));

app.delete('/api/expenses/:id', canEdit, asyncRoute(async (req, res) => {
  const m = await query("SELECT TO_CHAR(month,'YYYY-MM') AS month FROM expenses WHERE id=$1", [Number(req.params.id)]);
  if (m.rowCount && m.rows[0].month && await isMonthLocked(String(m.rows[0].month))) return res.status(403).json({ error: 'شهر هذه المصروفات مقفول ولا يمكن تعديله' });
  const result = await query('DELETE FROM expenses WHERE id=$1', [Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Expense not found' });
  res.status(204).end();
}));

// ============================================================
// BUDGETS CRUD
// ============================================================
const budgetSelect = `
  SELECT b.id, TO_CHAR(b.month, 'YYYY-MM') AS month, b.branch_id AS "branchId",
         b.type, b.planned, b.actual, br.name AS "branchName"
  FROM budgets b JOIN branches br ON br.id = b.branch_id
`;

app.get('/api/budgets', asyncRoute(async (req, res) => {
  const { month, year, branchId, type } = req.query;
  const params = [];
  let sql = `${budgetSelect} WHERE 1=1`;
  if (month) { params.push(monthDate(String(month))); sql += ` AND b.month=$${params.length}`; }
  if (year) {
    params.push(String(year));
    sql += ` AND TO_CHAR(b.month, 'YYYY') = $${params.length}`;
  }
  if (branchId) { params.push(Number(branchId)); sql += ` AND b.branch_id=$${params.length}`; }
  if (type) { params.push(String(type)); sql += ` AND b.type=$${params.length}`; }
  sql += ' ORDER BY b.month, br.name';
  const result = await query(sql, params);
  res.json(result.rows.map(r => ({ ...r, planned: number(r.planned), actual: number(r.actual) })));
}));

app.post('/api/budgets', canEdit, asyncRoute(async (req, res) => {
  const { month, branchId, type, planned = 0, actual = 0 } = req.body || {};
  if (!month || !branchId || !type) return res.status(400).json({ error: 'month, branchId, type are required' });
  if (await isMonthLocked(String(month))) return res.status(403).json({ error: `الشهر ${month} مقفول ولا يمكن تعديله` });
  const valid = ['revenue', 'cost', 'expense', 'profit'];
  if (!valid.includes(type)) return res.status(400).json({ error: 'invalid budget type' });
  const result = await query(
    `INSERT INTO budgets (month, branch_id, type, planned, actual)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (month, branch_id, type) DO UPDATE SET
       planned=EXCLUDED.planned, actual=EXCLUDED.actual, updated_at=NOW()
     RETURNING id`,
    [monthDate(String(month)), Number(branchId), type, number(planned), number(actual)]
  );
  const created = await query(`${budgetSelect} WHERE b.id=$1`, [result.rows[0].id]);
  res.status(201).json(created.rows[0]);
}));

app.put('/api/budgets/:id', canEdit, asyncRoute(async (req, res) => {
  const m = await query("SELECT TO_CHAR(month,'YYYY-MM') AS month FROM budgets WHERE id=$1", [Number(req.params.id)]);
  if (m.rowCount && m.rows[0].month && await isMonthLocked(String(m.rows[0].month))) return res.status(403).json({ error: 'شهر هذه الميزانية مقفول ولا يمكن تعديله' });
  const { planned, actual } = req.body || {};
  const result = await query(
    `UPDATE budgets SET planned=COALESCE($2, planned), actual=COALESCE($3, actual), updated_at=NOW()
     WHERE id=$1 RETURNING id`,
    [Number(req.params.id), planned !== undefined ? number(planned) : null, actual !== undefined ? number(actual) : null]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Budget not found' });
  const updated = await query(`${budgetSelect} WHERE b.id=$1`, [Number(req.params.id)]);
  res.json(updated.rows[0]);
}));

app.delete('/api/budgets/:id', canEdit, asyncRoute(async (req, res) => {
  const m = await query("SELECT TO_CHAR(month,'YYYY-MM') AS month FROM budgets WHERE id=$1", [Number(req.params.id)]);
  if (m.rowCount && m.rows[0].month && await isMonthLocked(String(m.rows[0].month))) return res.status(403).json({ error: 'شهر هذه الميزانية مقفول ولا يمكن تعديله' });
  const result = await query('DELETE FROM budgets WHERE id=$1', [Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Budget not found' });
  res.status(204).end();
}));

// ============================================================
// SETTINGS
// ============================================================
app.get('/api/settings', asyncRoute(async (_req, res) => {
  const result = await query('SELECT key, value FROM app_settings');
  const obj = {};
  for (const row of result.rows) obj[row.key] = typeof row.value === 'string' ? row.value : row.value;
  res.json(obj);
}));

app.put('/api/settings', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const entries = [];
  if (body.company !== undefined) entries.push(['company', body.company]);
  if (body.theme !== undefined) entries.push(['theme', body.theme]);
  if (body.currency !== undefined) entries.push(['currency', body.currency]);
  if (body.logo !== undefined) entries.push(['logo', body.logo]);
  if (body.dash !== undefined) entries.push(['dash', body.dash]);
  await withTransaction(async (client) => {
    for (const [key, value] of entries) {
      await client.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
        [key, JSON.stringify(value)]
      );
    }
  });
  res.json(await (async () => {
    const r = await query('SELECT key, value FROM app_settings');
    const o = {};
    for (const row of r.rows) o[row.key] = row.value;
    return o;
  })());
}));

// ============================================================
// GOVERNANCE: month approvals + locking
// ============================================================
app.get('/api/approvals', asyncRoute(async (_req, res) => {
  const result = await query(
    `SELECT TO_CHAR(month,'YYYY-MM') AS month, status, notes,
            submitted_by, approved_by, submitted_at AS "submittedAt", approved_at AS "approvedAt", updated_at AS "updatedAt"
     FROM report_approvals ORDER BY month DESC`
  );
  const summaries = await query(
    `SELECT TO_CHAR(r.month,'YYYY-MM') AS month,
            COUNT(DISTINCT r.branch_id) AS branches,
            COALESCE(SUM(r.sales),0) AS sales,
            COALESCE(SUM(r.purchases),0) AS purchases,
            COALESCE((SELECT SUM(amount) FROM expenses e WHERE e.month=r.month),0) AS expenses,
            COALESCE(r.locked,0) AS locked
     FROM monthly_records r
     GROUP BY r.month, r.locked ORDER BY r.month DESC LIMIT 24`
  );
  for (const s of summaries.rows) {
    s.sales = number(s.sales); s.purchases = number(s.purchases); s.expenses = number(s.expenses);
  }
  res.json({ approvals: result.rows, months: summaries.rows });
}));

app.put('/api/approvals/:month', canApprove, asyncRoute(async (req, res) => {
  const month = monthDate(String(req.params.month));
  const { status, notes } = req.body || {};
  const allowed = ['draft', 'review', 'approved', 'locked', 'unlocked'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'status غير صالح' });
  const cur = await query('SELECT status FROM report_approvals WHERE month=$1', [month]);
  const from = cur.rowCount ? cur.rows[0].status : null;
  const transitions = {
    'draft': ['review'],
    'review': ['approved'],
    'approved': ['locked'],
    'locked': [],
    'unlocked': ['draft', 'review'],
  };
  if (status !== 'unlocked' && from && !(transitions[from] || []).includes(status) && status !== from) {
    return res.status(400).json({ error: 'تسلسل الاعتماد غير صحيح (مسودة ← مراجعة ← معتمد ← مقفول)' });
  }
  if (!cur.rowCount) {
    await query(
      `INSERT INTO report_approvals (month, status, notes, submitted_by, approved_by, submitted_at, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [month, status, notes || null, req.user.id, req.user.id, status === 'review' ? new Date().toISOString() : null, status === 'approved' ? new Date().toISOString() : null]
    );
  } else {
    await query(
      `UPDATE report_approvals SET
         status=$2,
         notes=COALESCE($3, notes),
         approved_by=CASE WHEN $6 THEN $4 ELSE approved_by END,
         submitted_at=CASE WHEN $5 THEN COALESCE(submitted_at, NOW()) ELSE submitted_at END,
         approved_at=CASE WHEN $6 THEN NOW() ELSE approved_at END,
         updated_at=NOW()
       WHERE month=$1`,
      [month, status, notes || null, req.user.id, status === 'review', status === 'approved']
    );
  }
  if (status === 'locked') {
    await query('UPDATE monthly_records SET locked=1 WHERE month=$1', [month]);
    await notify('approval', `قفل شهر ${req.params.month}`, `تم قفل بيانات شهر ${req.params.month} عن التعديل`, null);
  } else if (status === 'unlocked') {
    await query('UPDATE monthly_records SET locked=0 WHERE month=$1', [month]);
  }
  await notify('approval', `تحديث شهر ${req.params.month}`, `تغيرت حالة اعتماد شهر ${req.params.month} إلى «${labelStatus(status)}»`, null);
  res.json({ ok: true, status });
}));

app.get('/api/audit-logs', asyncRoute(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const sources = {
    get: 'قراءة', list: 'قراءة', post: 'إنشاء', put: 'تعديل', delete: 'حذف',
  };
  const result = await query(
    `SELECT id, user_id AS "userId", username, action, entity, entity_id AS "entityId", details, created_at AS "createdAt"
     FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  res.json(result.rows.map(r => ({ ...r, actionLabel: String(r.action).split('_').map(p => sources[p] || p).join(' ') })));
}));

// ============================================================
// FINANCIAL EXCEPTIONS
// ============================================================
app.get('/api/exceptions', asyncRoute(async (req, res) => {
  const { month, status, severity, branchId } = req.query;
  const cond = []; const params = [];
  if (month) { params.push(monthDate(String(month))); cond.push(`e.month=$${params.length}`); }
  if (status) { params.push(String(status)); cond.push(`e.status=$${params.length}`); }
  if (severity) { params.push(String(severity)); cond.push(`e.severity=$${params.length}`); }
  if (branchId) { params.push(Number(branchId)); cond.push(`e.branch_id=$${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const result = await query(
    `SELECT e.id, TO_CHAR(e.month,'YYYY-MM') AS month, e.branch_id AS "branchId", b.name AS branch,
            e.kind, e.severity, e.title, e.details, e.status, e.due_date AS "dueDate",
            COALESCE(e.assigned_user_id,0) AS "assignedUserId", COALESCE(a.display_name,'') AS assigned,
            COALESCE(e.created_by,0) AS "createdBy", c.display_name AS creator, e.created_at AS "createdAt", e.updated_at AS "updatedAt"
     FROM financial_exceptions e
     JOIN branches b ON b.id=e.branch_id
     LEFT JOIN users a ON a.id=e.assigned_user_id
     LEFT JOIN users c ON c.id=e.created_by
     ${where} ORDER BY e.created_at DESC`,
    params
  );
  res.json(result.rows);
}));

app.post('/api/exceptions', canEdit, asyncRoute(async (req, res) => {
  const { month, branchId, kind = 'other', severity = 'medium', title, details = '', status = 'open', dueDate = null, assignedUserId = null } = req.body || {};
  if (!month || !branchId || !title) return res.status(400).json({ error: 'month, branchId, title مطلوبة' });
  const result = await query(
    `INSERT INTO financial_exceptions (month, branch_id, kind, severity, title, details, status, due_date, assigned_user_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [monthDate(String(month)), Number(branchId), kind, severity, title, toJson(details), status, dueDate ? dateOnly(dueDate) : null, assignedUserId ? Number(assignedUserId) : null, req.user.id]
  );
  await notify('exception', `استثناء مالي جديد`, title, assignedUserId ? Number(assignedUserId) : null);
  if (!assignedUserId) await notify('exception', `استثناء مالي جديد`, title, null);
  res.status(201).json({ ok: true, id: result.rows[0].id });
}));

app.put('/api/exceptions/:id', canEdit, asyncRoute(async (req, res) => {
  const { severity, status, notes, dueDate, assignedUserId, title } = req.body || {};
  const columns = [];
  const params = [];
  const push = (col, val) => { params.push(val); columns.push(`${col}=$${params.length}`); };
  if (title !== undefined) push('title', String(title));
  if (severity !== undefined) push('severity', String(severity));
  if (status !== undefined) push('status', String(status));
  if (notes !== undefined) push('details', toJson(notes));
  if (dueDate !== undefined) push('due_date', dueDate ? dateOnly(dueDate) : null);
  if (assignedUserId !== undefined) push('assigned_user_id', assignedUserId ? Number(assignedUserId) : null);
  if (!columns.length) return res.status(400).json({ error: 'no fields' });
  params.push(Number(req.params.id));
  const result = await query(
    `UPDATE financial_exceptions SET ${columns.join(', ')}, updated_at=NOW() WHERE id=$${params.length} RETURNING id`,
    params
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Exception not found' });
  if (status === 'open' || status === 'resolved') {
    await notify('exception', `تحديث استثناء #${result.rows[0].id}`, `تغيرت الحالة إلى ${labelStatus(status)}`, null);
  }
  res.json({ ok: true, id: result.rows[0].id });
}));

app.delete('/api/exceptions/:id', asyncRoute(async (req, res) => {
  const result = await query('DELETE FROM financial_exceptions WHERE id=$1', [Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Exception not found' });
  res.status(204).end();
}));

app.post('/api/exceptions/generate', requireRole('admin', 'finance_manager'), asyncRoute(async (req, res) => {
  const { month } = req.body || {};
  const m = monthDate(String(month || new Date().toISOString().slice(0, 7)));
  const r = await query(
    `SELECT b.id AS "branchId", b.name, TO_CHAR(r.month,'YYYY-MM') AS month, r.sales, r.purchases, r.closing,
            COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.month=r.month AND e.branch_id=r.branch_id),0) AS expenses
     FROM monthly_records r JOIN branches b ON b.id=r.branch_id WHERE r.month=$1 ORDER BY b.name`,
    [m]
  );
  const existing = await query(
    `SELECT branch_id, kind, TO_CHAR(month,'YYYY-MM') AS month FROM financial_exceptions WHERE month=$1`,
    [m]
  );
  const seen = new Set(existing.rows.map(x => `${x.month}|${x.branch_id}|${x.kind}`));
  const created = [];
  const seed = [
    { cond: row => row.sales > 0 && row.purchases > 0 && (row.purchases / row.sales) > 0.45, kind: 'high_purchase_ratio', severity: 'high', titleSuffix: 'نسبة المشتريات/المبيعات مرتفعة' },
    { cond: row => row.sales > 0 && row.expenses > 0 && (row.expenses / row.sales) > 0.35, kind: 'high_expense_ratio', severity: 'medium', titleSuffix: 'نسبة المصروفات/المبيعات مرتفعة' },
    { cond: row => row.closing < 0, kind: 'negative_closing', severity: 'high', titleSuffix: 'رصيد ختامي سالب' },
    { cond: row => row.sales === 0 && row.closing > 0, kind: 'no_sales', severity: 'low', titleSuffix: 'لا مبيعات مع وجود رصيد' },
  ];
  for (const row of r.rows) {
    for (const s of seed) {
      if (s.cond(row) && !seen.has(`${row.month}|${row.branchId}|${s.kind}`)) {
        await query(
          `INSERT INTO financial_exceptions (month, branch_id, kind, severity, title, details, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,'open',$7)`,
          [m, row.branchId, s.kind, s.severity, `${row.name}: ${s.titleSuffix}`,
           JSON.stringify({ sales: row.sales, purchases: row.purchases, expenses: row.expenses, closing: row.closing }), req.user.id]
        );
        created.push(`${row.name} - ${s.titleSuffix}`);
      }
    }
  }
  if (created.length) await notify('exception', `اكتشاف استثناءات لشهر ${month}`, `تم إنشاء ${created.length} استثناءات تلقائياً`, null);
  res.json({ created: created.length, items: created });
}));

function dateOnly(d) {
  const dt = new Date(String(d).includes('T') ? d : `${String(d)}T00:00:00`);
  return dt.toISOString().slice(0, 10);
}

function toJson(d) {
  if (d === undefined || d === null || d === '') return null;
  if (typeof d === 'object') return JSON.stringify(d);
  const s = String(d);
  try { JSON.parse(s); return s; } catch (_) { return JSON.stringify(s); }
}

// ============================================================
// KPI TARGETS
// ============================================================
app.get('/api/kpi-targets', asyncRoute(async (req, res) => {
  const { month } = req.query;
  const cond = month ? ['month=$1'] : [];
  const params = month ? [monthDate(String(month))] : [];
  const result = await query(
    `SELECT id, TO_CHAR(month,'YYYY-MM') AS month, branch_id AS "branchId", metric, target, updated_at AS "updatedAt"
     FROM kpi_targets ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY month DESC, branch_id`,
    params
  );
  res.json(result.rows);
}));

app.put('/api/kpi-targets', asyncRoute(async (req, res) => {
  const { month, targets } = req.body || {};
  if (!month || !Array.isArray(targets)) return res.status(400).json({ error: 'month و targets مطلوبان' });
  const m = monthDate(String(month));
  await withTransaction(async (client) => {
    await client.query('DELETE FROM kpi_targets WHERE month=$1', [m]);
    for (const t of targets) {
      const val = number(t.target);
      if (!t.branchId || !t.metric || !['sales', 'expenses', 'profit', 'costRatio'].includes(t.metric)) continue;
      if (val === 0 && !t.present) continue;
      await client.query(
        `INSERT INTO kpi_targets (month, branch_id, metric, target) VALUES ($1,$2,$3,$4)`,
        [m, Number(t.branchId), t.metric, val]
      );
    }
  });
  res.json({ ok: true });
}));

// ============================================================
// REPORT TEMPLATES / SETTINGS / VERSIONS
// ============================================================
app.get('/api/report-templates', asyncRoute(async (_req, res) => {
  res.json((await query(
    `SELECT t.id, t.name, t.report_type AS "reportType", t.config, t.is_default AS "isDefault",
            c.display_name AS creator, t.created_at AS "createdAt", t.updated_at AS "updatedAt"
     FROM report_templates t LEFT JOIN users c ON c.id=t.created_by ORDER BY t.id`
  )).rows);
}));

app.post('/api/report-templates', asyncRoute(async (req, res) => {
  const { name, reportType, config = {}, isDefault = false } = req.body || {};
  if (!name || !reportType) return res.status(400).json({ error: 'name و reportType مطلوبان' });
  const r = await query(
    `INSERT INTO report_templates (name, report_type, config, is_default, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [String(name), reportType, JSON.stringify(config), isDefault ? 1 : 0, req.user.id]
  );
  res.status(201).json({ ok: true, id: r.rows[0].id });
}));

app.put('/api/report-templates/:id', asyncRoute(async (req, res) => {
  const { name, config, isDefault } = req.body || {};
  const r = await query(
    `UPDATE report_templates SET name=COALESCE($2,name), config=COALESCE($3,config), is_default=COALESCE($4,is_default), updated_at=NOW()
     WHERE id=$1 RETURNING id`,
    [Number(req.params.id), name ? String(name) : null, config ? JSON.stringify(config) : null, isDefault !== undefined ? (isDefault ? 1 : 0) : null]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'Template not found' });
  res.json({ ok: true, id: r.rows[0].id });
}));

app.delete('/api/report-templates/:id', asyncRoute(async (req, res) => {
  const r = await query('DELETE FROM report_templates WHERE id=$1 RETURNING id', [Number(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ error: 'Template not found' });
  res.status(204).end();
}));

app.get('/api/report-settings', asyncRoute(async (_req, res) => {
  const result = await query(
    `SELECT report_type AS "reportType", primary_color AS "primaryColor", accent_color AS "accentColor", header_message AS "headerMessage", updated_at AS "updatedAt"
     FROM report_settings ORDER BY report_type`
  );
  res.json(result.rows);
}));

app.put('/api/report-settings', asyncRoute(async (req, res) => {
  const { reportType, primaryColor, accentColor, headerMessage } = req.body || {};
  if (!reportType) return res.status(400).json({ error: 'reportType مطلوب' });
  await query(
    `INSERT INTO report_settings (report_type, primary_color, accent_color, header_message, updated_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (report_type) DO UPDATE SET
       primary_color=COALESCE(EXCLUDED.primary_color, report_settings.primary_color),
       accent_color=COALESCE(EXCLUDED.accent_color, report_settings.accent_color),
       header_message=COALESCE(EXCLUDED.header_message, report_settings.header_message),
       updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
    [String(reportType), primaryColor || null, accentColor || null, headerMessage !== undefined ? String(headerMessage) : null, req.user.id]
  );
  res.json({ ok: true });
}));

app.get('/api/report-versions', asyncRoute(async (req, res) => {
  const { reportType, month } = req.query;
  const cond = []; const params = [];
  if (reportType) { params.push(String(reportType)); cond.push(`report_type=$${params.length}`); }
  if (month) { params.push(monthDate(String(month))); cond.push(`month=$${params.length}`); }
  const result = await query(
    `SELECT v.id, v.report_type AS "reportType", TO_CHAR(v.month,'YYYY-MM') AS month, v.version_no AS "versionNo", v.status,
            c.display_name AS creator, v.created_at AS "createdAt"
     FROM report_versions v LEFT JOIN users c ON c.id=v.created_by
     ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY v.created_at DESC LIMIT 200`,
    params
  );
  res.json(result.rows);
}));

app.post('/api/report-versions', asyncRoute(async (req, res) => {
  const { reportType, month, status = 'draft', snapshot } = req.body || {};
  if (!reportType || !month || !snapshot) return res.status(400).json({ error: 'reportType, month, snapshot مطلوبة' });
  const v = await query(
    `SELECT COALESCE(MAX(version_no),0) AS v FROM report_versions WHERE report_type=$1 AND month=$2`,
    [String(reportType), monthDate(String(month))]
  );
  const r = await query(
    `INSERT INTO report_versions (report_type, month, version_no, status, snapshot, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [String(reportType), monthDate(String(month)), Number(v.rows[0].v) + 1, status, JSON.stringify(snapshot), req.user.id]
  );
  res.status(201).json({ ok: true, id: r.rows[0].id, versionNo: Number(v.rows[0].v) + 1 });
}));

app.get('/api/report-versions/:id', asyncRoute(async (req, res) => {
  const r = await query('SELECT snapshot FROM report_versions WHERE id=$1', [Number(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ error: 'Version not found' });
  res.json({ snapshot: r.rows[0].snapshot });
}));

// ============================================================
// NOTIFICATIONS
// ============================================================
app.get('/api/notifications', asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT id, kind, title, message, user_id AS "userId", COALESCE(read_flag,0) AS "read", created_at AS "createdAt"
     FROM notifications WHERE user_id IS NULL OR user_id=$1
     ORDER BY created_at DESC LIMIT 60`,
    [req.user.id]
  );
  res.json(result.rows);
}));

app.get('/api/notifications/unread-count', asyncRoute(async (req, res) => {
  const r = await query(
    `SELECT COUNT(*) AS c FROM notifications WHERE (user_id IS NULL OR user_id=$1) AND COALESCE(read_flag,0)=0`,
    [req.user.id]
  );
  res.json({ count: Number(r.rows[0].c) });
}));

app.post('/api/notifications/:id/read', asyncRoute(async (req, res) => {
  await query(`UPDATE notifications SET read_flag=1 WHERE id=$1 AND (user_id IS NULL OR user_id=$2)`, [Number(req.params.id), req.user.id]);
  res.json({ ok: true });
}));

app.post('/api/notifications/read-all', asyncRoute(async (req, res) => {
  await query(`UPDATE notifications SET read_flag=1 WHERE (user_id IS NULL OR user_id=$1)`, [req.user.id]);
  res.json({ ok: true });
}));

// ============================================================
// SCHEDULED REPORTS
// ============================================================
const FREQ_MS = { weekly: 7 * 864e5, monthly: 30 * 864e5, quarterly: 91 * 864e5 };

function nextRunAt(frequency, from = new Date()) {
  const base = new Date(from);
  if (frequency === 'weekly') base.setDate(base.getDate() + 7);
  else if (frequency === 'quarterly') base.setDate(base.getDate() + 91);
  else base.setMonth(base.getMonth() + 1);
  return base.toISOString();
}

async function buildReportSnapshot(reportType, month) {
  const m = monthDate(month);
  const [records, expenses, settingsRows] = await Promise.all([
    query(`SELECT TO_CHAR(r.month,'YYYY-MM') AS month, b.id AS "branchId", b.name, r.opening, r.closing, r.purchases, r.transfers, r.sales
           FROM monthly_records r JOIN branches b ON b.id=r.branch_id WHERE r.month=$1 ORDER BY b.name`, [m]),
    query(`SELECT TO_CHAR(e.month,'YYYY-MM') AS month, b.name AS branch, t.name AS type, e.amount, e.description
           FROM expenses e JOIN branches b ON b.id=e.branch_id JOIN expense_types t ON t.id=e.expense_type_id
           WHERE e.month=$1 ORDER BY e.amount DESC`, [m]),
    query('SELECT key, value FROM app_settings'),
  ]);
  const settings = {};
  for (const s of settingsRows.rows) settings[s.key] = s.value;
  return { reportType, month, companyName: settings.companyName || '', generatedAt: new Date().toISOString(), records: records.rows.map(r => ({ ...r, opening: number(r.opening), closing: number(r.closing), purchases: number(r.purchases), transfers: number(r.transfers), sales: number(r.sales) })), expenses: expenses.rows.map(e => ({ ...e, amount: number(e.amount) })) };
}

async function runScheduledReport(id, user = null) {
  const s = await query('SELECT * FROM scheduled_reports WHERE id=$1', [Number(id)]);
  if (!s.rowCount) return;
  const rep = s.rows[0];
  const rscfg = typeof rep.config === 'object' ? rep.config : {};
  const targetMonth = rscfg.month || new Date().toISOString().slice(0, 7);
  const snapshot = await buildReportSnapshot(rep.report_type, targetMonth);
  const run = await query(
    `INSERT INTO scheduled_runs (scheduled_report_id, report_type, target_month, snapshot) VALUES ($1,$2,$3,$4) RETURNING id`,
    [rep.id, rep.report_type, monthDate(targetMonth), JSON.stringify(snapshot)]
  );
  await query(`UPDATE scheduled_reports SET last_run_at=NOW(), next_run_at=$2 WHERE id=$1`, [rep.id, nextRunAt(rep.frequency)]);
  await notify('schedule', `تقرير مجدول: ${rep.name}`, `تم توليد تقرير «${rep.name}» لشهر ${targetMonth}`, null);
  return { id: run.rows[0].id, targetMonth };
}

app.get('/api/scheduled-reports', asyncRoute(async (_req, res) => {
  res.json((await query(
    `SELECT s.id, s.name, s.report_type AS "reportType", s.frequency, COALESCE(s.enabled,0) AS enabled,
            s.config, s.last_run_at AS "lastRunAt", s.next_run_at AS "nextRunAt",
            c.display_name AS creator, s.created_at AS "createdAt"
     FROM scheduled_reports s LEFT JOIN users c ON c.id=s.created_by ORDER BY s.id DESC`
  )).rows);
}));

app.post('/api/scheduled-reports', asyncRoute(async (req, res) => {
  const { name, reportType, frequency = 'monthly', enabled = true, targetMonth = null } = req.body || {};
  if (!name || !reportType) return res.status(400).json({ error: 'name و reportType مطلوبان' });
  if (!FREQ_MS[frequency]) return res.status(400).json({ error: 'frequency غير صالح' });
  const config = targetMonth ? { month: String(targetMonth) } : {};
  const r = await query(
    `INSERT INTO scheduled_reports (name, report_type, frequency, enabled, config, created_by, next_run_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [String(name), reportType, frequency, enabled ? 1 : 0, JSON.stringify(config), req.user.id, nextRunAt(frequency)]
  );
  res.status(201).json({ ok: true, id: r.rows[0].id });
}));

app.put('/api/scheduled-reports/:id', asyncRoute(async (req, res) => {
  const { name, frequency, enabled, targetMonth } = req.body || {};
  const cols = []; const params = [];
  const push = (col, val) => { params.push(val); cols.push(`${col}=$${params.length}`); };
  if (name !== undefined) push('name', String(name));
  if (frequency !== undefined) {
    if (!FREQ_MS[frequency]) return res.status(400).json({ error: 'frequency غير صالح' });
    push('frequency', frequency); push('next_run_at', nextRunAt(frequency));
  }
  if (enabled !== undefined) push('enabled', enabled ? 1 : 0);
  if (targetMonth !== undefined) {
    const cur = await query('SELECT config FROM scheduled_reports WHERE id=$1', [Number(req.params.id)]);
    const cfg = cur.rowCount && typeof cur.rows[0].config === 'object' ? cur.rows[0].config : {};
    cfg.month = targetMonth;
    push('config', JSON.stringify(cfg));
  }
  if (!cols.length) return res.status(400).json({ error: 'no fields' });
  params.push(Number(req.params.id));
  const r = await query(`UPDATE scheduled_reports SET ${cols.join(', ')} WHERE id=$${params.length} RETURNING id`, params);
  if (!r.rowCount) return res.status(404).json({ error: 'Schedule not found' });
  res.json({ ok: true, id: r.rows[0].id });
}));

app.delete('/api/scheduled-reports/:id', asyncRoute(async (req, res) => {
  await query('DELETE FROM scheduled_runs WHERE scheduled_report_id=$1', [Number(req.params.id)]);
  const r = await query('DELETE FROM scheduled_reports WHERE id=$1 RETURNING id', [Number(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ error: 'Schedule not found' });
  res.status(204).end();
}));

app.post('/api/scheduled-reports/:id/run', asyncRoute(async (req, res) => {
  const run = await runScheduledReport(Number(req.params.id), req.user);
  if (!run) return res.status(404).json({ error: 'Schedule not found' });
  res.json({ ok: true, run });
}));

app.get('/api/scheduled-reports/:id/runs', asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT r.id, r.report_type AS "reportType", TO_CHAR(r.target_month,'YYYY-MM') AS month, r.created_at AS "ranAt"
     FROM scheduled_runs r WHERE r.scheduled_report_id=$1 ORDER BY r.created_at DESC LIMIT 50`,
    [Number(req.params.id)]
  );
  res.json(result.rows);
}));

app.get('/api/scheduled-runs/:id', asyncRoute(async (req, res) => {
  const r = await query('SELECT snapshot FROM scheduled_runs WHERE id=$1', [Number(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ error: 'Run not found' });
  res.json({ snapshot: r.rows[0].snapshot });
}));

// Scheduler loop (every minute)
setInterval(async () => {
  try {
    const due = await query('SELECT id FROM scheduled_reports WHERE enabled=1 AND next_run_at <= NOW() LIMIT 5');
    for (const row of due.rows) await runScheduledReport(row.id);
  } catch (e) { console.error('[scheduler]', e.message); }
}, 60_000);

// ============================================================
// GLOBAL SEARCH
// ============================================================
app.get('/api/search', asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ branches: [], brands: [], types: [] });
  const like = `%${q}%`;
  const [br, bd, ty] = await Promise.all([
    query('SELECT id, name, region FROM branches WHERE name ILIKE $1 OR region ILIKE $1 LIMIT 15', [like]),
    query('SELECT id, name, color FROM brands WHERE name ILIKE $1 LIMIT 15', [like]),
    query('SELECT id, name, category FROM expense_types WHERE name ILIKE $1 LIMIT 15', [like]),
  ]);
  res.json({ branches: br.rows, brands: bd.rows, types: ty.rows });
}));

// ============================================================
// BACKUPS
// ============================================================
async function readFullState() {
  const [brands, branches, records, expenseTypes, expenses, budgets, settings] = await Promise.all([
    query('SELECT id, name, color FROM brands ORDER BY id'),
    query('SELECT id, name, brand_id AS "brandId", region, opening, closing FROM branches ORDER BY id'),
    query(`SELECT TO_CHAR(month,'YYYY-MM') AS month, branch_id AS "branchId", opening, closing, purchases, transfers, sales, notes FROM monthly_records ORDER BY month, branch_id`),
    query('SELECT id, name, category FROM expense_types ORDER BY id'),
    query(`SELECT TO_CHAR(month,'YYYY-MM') AS month, branch_id AS "branchId", expense_type_id AS "expenseTypeId", amount, description FROM expenses ORDER BY month`),
    query(`SELECT TO_CHAR(month,'YYYY-MM') AS month, branch_id AS "branchId", type, planned, actual FROM budgets ORDER BY month`),
    query('SELECT key, value FROM app_settings'),
  ]);
  const settingMap = {};
  for (const s of settings.rows) settingMap[s.key] = s.value;
  return {
    version: 8,
    brands: brands.rows, branches: branches.rows,
    monthlyRecords: records.rows, expenseTypes: expenseTypes.rows,
    expenses: expenses.rows, budgets: budgets.rows,
    settings: settingMap,
  };
}

app.post('/api/backups', asyncRoute(async (_req, res) => {
  const state = await readFullState();
  const result = await query('INSERT INTO state_backups (snapshot) VALUES ($1) RETURNING id, created_at', [JSON.stringify(state)]);
  await query('DELETE FROM state_backups WHERE id NOT IN (SELECT id FROM state_backups ORDER BY created_at DESC LIMIT 10)');
  res.status(201).json({ ok: true, id: result.rows[0].id, date: result.rows[0].created_at });
}));

app.get('/api/backups', asyncRoute(async (_req, res) => {
  const result = await query('SELECT id, created_at, snapshot FROM state_backups ORDER BY created_at DESC LIMIT 10');
  res.json(result.rows.map(row => {
    const snap = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {};
    return { id: row.id, date: row.created_at, created_at: row.created_at, snapshot: snap, branchesCount: snap.branches?.length || 0, brandsCount: snap.brands?.length || 0, version: snap.version || null };
  }));
}));

app.post('/api/backups/:id/restore', asyncRoute(async (req, res) => {
  const result = await query('SELECT snapshot FROM state_backups WHERE id=$1', [Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Backup not found' });
  const snap = result.rows[0].snapshot;
  await withTransaction(async (client) => {
    await client.query('DELETE FROM monthly_records');
    await client.query('DELETE FROM expenses');
    await client.query('DELETE FROM budgets');
    await client.query('DELETE FROM branches');
    await client.query('DELETE FROM brands');
    await client.query('DELETE FROM expense_types');
    await client.query('DELETE FROM app_settings');
    const brands = snap.brands || [];
    const branches = snap.branches || [];
    const types = snap.expenseTypes || [];
    for (const b of brands) await client.query('INSERT INTO brands (id, name, color) VALUES ($1,$2,$3)', [b.id, b.name, b.color]);
    for (const t of types) await client.query('INSERT INTO expense_types (id, name, category) VALUES ($1,$2,$3)', [t.id, t.name, t.category]);
    for (const b of branches) await client.query('INSERT INTO branches (id, name, brand_id, region, opening, closing) VALUES ($1,$2,$3,$4,$5,$6)', [b.id, b.name, b.brandId, b.region, b.opening, b.closing]);
    for (const r of (snap.monthlyRecords || [])) await client.query('INSERT INTO monthly_records (month, branch_id, opening, closing, purchases, transfers, sales, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [monthDate(r.month), r.branchId, r.opening, r.closing, r.purchases, r.transfers, r.sales, r.notes || null]);
    for (const e of (snap.expenses || [])) await client.query('INSERT INTO expenses (month, branch_id, expense_type_id, amount, description) VALUES ($1,$2,$3,$4,$5)', [monthDate(e.month), e.branchId, e.expenseTypeId, e.amount, e.description || null]);
    for (const g of (snap.budgets || [])) await client.query('INSERT INTO budgets (month, branch_id, type, planned, actual) VALUES ($1,$2,$3,$4,$5)', [monthDate(g.month), g.branchId, g.type, g.planned, g.actual]);
    const settings = snap.settings || {};
    for (const [k, v] of Object.entries(settings)) await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)', [k, JSON.stringify(v)]);
  });
  res.json({ ok: true });
}));

app.delete('/api/backups', asyncRoute(async (_req, res) => {
  await query('DELETE FROM state_backups');
  res.status(204).end();
}));

// ============================================================
// ANALYTICS / REPORTS (aggregations in SQL)
// ============================================================
// Summary KPIs for a given month (costs, revenue, profit, expenses, ratios)
app.get('/api/summary', asyncRoute(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const brandId = req.query.brandId ? Number(req.query.brandId) : null;

  const params = [monthDate(month)];
  let branchSql = `SELECT b.id FROM branches b WHERE 1=1`;
  const bparams = [];
  if (branchId) { bparams.push(branchId); branchSql += ` AND b.id=$${bparams.length}`; }
  if (brandId) { bparams.push(brandId); branchSql += ` AND b.brand_id=$${bparams.length}`; }
  const branchesRes = await query(branchSql, bparams);

  const rows = (await query('SELECT * FROM monthly_records WHERE month=$1', params)).rows;
  const allowed = branchesRes.rows.map(r => r.id);
  const recs = rows.filter(r => allowed.includes(r.branch_id));

  const totalOpening = recs.reduce((s, r) => s + number(r.opening), 0);
  const totalClosing = recs.reduce((s, r) => s + number(r.closing), 0);
  const totalPurchases = recs.reduce((s, r) => s + number(r.purchases), 0);
  const totalTransfers = recs.reduce((s, r) => s + number(r.transfers), 0);
  const totalCost = totalOpening + totalPurchases + totalTransfers - totalClosing;
  const totalSales = recs.reduce((s, r) => s + number(r.sales), 0);

  // expenses for allowed branches in month
  const expParams = [monthDate(month)];
  let expSql = 'SELECT amount FROM expenses WHERE month=$1';
  if (branchId || brandId) {
    if (branchId) { expParams.push(branchId); expSql += ` AND branch_id=$${expParams.length}`; }
    else if (brandId) {
      // join to branch brand
      const ids = allowed;
      if (ids.length === 0) return res.json(emptySummary(month));
      expSql += ` AND branch_id = ANY($${expParams.length + 1})`;
      expParams.push(ids);
    }
  }
  const expRes = await query(expSql, expParams);
  const totalExpenses = expRes.rows.reduce((s, r) => s + number(r.amount), 0);

  const grossProfit = totalSales - totalCost;
  const netProfit = grossProfit - totalExpenses;
  const costRatio = totalSales > 0 ? (totalCost / totalSales) * 100 : 0;
  const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
  const netMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

  // Previous month for change comparison
  const d = new Date(monthDate(month));
  d.setMonth(d.getMonth() - 1);
  const prevMonth = d.toISOString().slice(0, 7);
  const prev = await query('SELECT * FROM monthly_records WHERE month=$1', [monthDate(prevMonth)]);
  const prevRecs = prev.rows.filter(r => allowed.includes(r.branch_id));
  const prevOpening = prevRecs.reduce((s, r) => s + number(r.opening), 0);
  const prevClosing = prevRecs.reduce((s, r) => s + number(r.closing), 0);
  const prevPurchases = prevRecs.reduce((s, r) => s + number(r.purchases), 0);
  const prevTransfers = prevRecs.reduce((s, r) => s + number(r.transfers), 0);
  const prevCost = prevOpening + prevPurchases + prevTransfers - prevClosing;
  const prevSales = prevRecs.reduce((s, r) => s + number(r.sales), 0);
  const expPrevIdxs = allowed;
  let prevExpSql = 'SELECT amount FROM expenses WHERE month=$1';
  const prevExpParams = [monthDate(prevMonth)];
  if (branchId || brandId) {
    if (branchId) { prevExpParams.push(branchId); prevExpSql += ` AND branch_id=$${prevExpParams.length}`; }
    else if (expPrevIdxs.length) { prevExpSql += ` AND branch_id = ANY($$${prevExpParams.length + 1})`; prevExpParams.push(expPrevIdxs); }
  }
  const prevExpRes = await query(prevExpSql, prevExpParams);
  const prevExpenses = prevExpRes.rows.reduce((s, r) => s + number(r.amount), 0);

  res.json({
    month,
    totalCost, totalSales, grossProfit, costRatio,
    totalExpenses, netProfit, netMargin, grossMargin,
    costChange: prevCost > 0 ? ((totalCost - prevCost) / prevCost) * 100 : null,
    salesChange: prevSales > 0 ? ((totalSales - prevSales) / prevSales) * 100 : null,
    profitChange: prevSales > 0 ? ((netProfit - (prevSales - prevCost - prevExpenses)) / prevSales) * 100 : null,
    branchCount: recs.length,
    activeBranches: recs.filter(r => number(r.sales) > 0).length,
  });
}));

function emptySummary(month) {
  return { month, totalCost: 0, totalSales: 0, grossProfit: 0, costRatio: 0, totalExpenses: 0, netProfit: 0, netMargin: 0, grossMargin: 0, costChange: null, salesChange: null, profitChange: null, branchCount: 0, activeBranches: 0 };
}

// ============================================================
// P&L REPORT (قائمة الدخل والمصروفات) — monthly for one branch,
// annual for one branch, or consolidated across all/brand branches
// ============================================================
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

app.get('/api/pl', asyncRoute(async (req, res) => {
  const month = req.query.month ? String(req.query.month) : '';
  const year = req.query.year ? String(req.query.year) : '';
  const fromMonth = req.query.fromMonth ? String(req.query.fromMonth) : '';
  const toMonth = req.query.toMonth ? String(req.query.toMonth) : '';
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const brandId = req.query.brandId ? Number(req.query.brandId) : null;

  let period, isYear = false, isRange = false, periodFilter, periodValue;

  if (fromMonth && toMonth) {
    isRange = true;
    periodFilter = "month BETWEEN $1 AND $2";
    periodValue = [monthDate(String(fromMonth)), monthDate(String(toMonth))];
    const [fy, fm] = fromMonth.split('-');
    const [ty, tm] = toMonth.split('-');
    period = `${AR_MONTHS[Number(fm) - 1] || fm} ${fy} — ${AR_MONTHS[Number(tm) - 1] || tm} ${ty}`;
  } else if (!month && !!year) {
    isYear = true;
    periodFilter = "TO_CHAR(month,'YYYY')=$1";
    periodValue = [year];
    period = `السنة ${year}`;
  } else if (month) {
    periodFilter = "month=$1";
    periodValue = [monthDate(String(month))];
    const [y, m] = month.split('-');
    period = `${AR_MONTHS[Number(m) - 1] || m} ${y}`;
  } else {
    return res.status(400).json({ error: 'month, year, or fromMonth+toMonth required' });
  }

  let branchSql = 'SELECT id, name, brand_id AS "brandId" FROM branches WHERE 1=1';
  const bparams = [];
  if (branchId) { bparams.push(branchId); branchSql += ` AND id=$${bparams.length}`; }
  if (brandId) { bparams.push(brandId); branchSql += ` AND brand_id=$${bparams.length}`; }
  const scopeRows = (await query(branchSql, bparams)).rows;
  const scopeIds = scopeRows.map(r => r.id);
  const scopeType = branchId ? 'branch' : brandId ? 'brand' : 'all';
  const branchNames = {};
  for (const r of scopeRows) branchNames[r.id] = r.name;

  if (!scopeIds.length) {
    return res.json({
      mode: isYear ? 'year' : isRange ? 'range' : 'month', period, periodLabel: period,
      scope: { type: scopeType, branch: branchId ? { id: branchId, name: '' } : null },
      totals: { revenue: 0, cogs: 0, cogsRatio: 0, grossProfit: 0, grossMargin: 0, totalExpenses: 0, netProfit: 0, netMargin: 0, expenseRatio: 0, branchesCount: 0, monthsCount: isYear ? 12 : 1 },
      expenseTypes: [], branchRows: [], months: [],
    });
  }

const branchParamPos = periodValue.length + 1;
  const recs = (await query(`SELECT *, TO_CHAR(month,'YYYY-MM') AS m FROM monthly_records WHERE ${periodFilter} AND branch_id=ANY($${branchParamPos}::int[]) ORDER BY month`, [...periodValue, scopeIds])).rows;
  const expRes = await query(
    `SELECT e.id, e.amount, e.description, e.branch_id AS "branchId",
            et.id AS "typeId", et.name AS "typeName", et.category,
            b.name AS "branchName", TO_CHAR(e.month,'YYYY-MM') AS m
     FROM expenses e
     JOIN branches b ON b.id=e.branch_id
     JOIN expense_types et ON et.id=e.expense_type_id
     WHERE ${periodFilter} AND e.branch_id=ANY($${branchParamPos}::int[])
     ORDER BY et.name, b.name, e.id`,
    [...periodValue, scopeIds]
  );
  const expRows = expRes.rows.map(r => ({ ...r, amount: number(r.amount) }));

  const monthAgg = {};
  const expByMonth = {};
  const addRec = (g, r) => { g.opening += number(r.opening); g.purchases += number(r.purchases); g.transfers += number(r.transfers); g.closing += number(r.closing); g.sales += number(r.sales); };
  for (const r of recs) {
    const key = r.m || String(r.month || '').slice(0, 7);
    if (!monthAgg[key]) monthAgg[key] = { opening: 0, purchases: 0, transfers: 0, closing: 0, sales: 0 };
    addRec(monthAgg[key], r);
  }
  for (const e of expRows) expByMonth[e.m] = (expByMonth[e.m] || 0) + e.amount;

  const branchAgg = {};
  for (const r of recs) {
    if (!branchAgg[r.branch_id]) branchAgg[r.branch_id] = { opening: 0, purchases: 0, transfers: 0, closing: 0, sales: 0 };
    addRec(branchAgg[r.branch_id], r);
  }
  const expByBranch = {};
  for (const e of expRows) expByBranch[e.branchId] = (expByBranch[e.branchId] || 0) + e.amount;

  let revenue = 0, totOpening = 0, totPurchases = 0, totTransfers = 0, totClosing = 0;
  for (const k of Object.keys(monthAgg)) { const g = monthAgg[k]; totOpening += g.opening; totPurchases += g.purchases; totTransfers += g.transfers; totClosing += g.closing; revenue += g.sales; }
  const cogs = totOpening + totPurchases + totTransfers - totClosing;
  const totalExpenses = expRows.reduce((s, e) => s + e.amount, 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - totalExpenses;
  const pct = (n) => (revenue > 0 ? (n / revenue) * 100 : 0);

  const typeMap = {};
  const typeIds = [];
  for (const e of expRows) {
    if (!typeMap[e.typeId]) { typeMap[e.typeId] = { typeId: e.typeId, typeName: e.typeName, category: e.category, total: 0, items: [] }; typeIds.push(e.typeId); }
    const g = typeMap[e.typeId];
    g.total += e.amount;
    g.items.push({ id: e.id, month: e.m, branchId: e.branchId, branchName: e.branchName, amount: e.amount, description: e.description || e.typeName || 'مصروف' });
  }

  const branchRows = scopeRows.map(b => {
    const g = branchAgg[b.id] || { opening: 0, purchases: 0, transfers: 0, closing: 0, sales: 0 };
    const bcogs = g.opening + g.purchases + g.transfers - g.closing;
    const bexp = expByBranch[b.id] || 0;
    const bsales = g.sales;
    return {
      branchId: b.id, name: b.name, revenue: bsales, cogs: bcogs,
      cogsRatio: bsales > 0 ? (bcogs / bsales) * 100 : 0, expenses: bexp,
      grossProfit: bsales - bcogs, netProfit: bsales - bcogs - bexp,
      netRatio: bsales > 0 ? ((bsales - bcogs - bexp) / bsales) * 100 : 0,
    };
  });

  const months = Object.keys(monthAgg).sort();
  const monthSeries = months.map(k => {
    const g = monthAgg[k];
    const mcogs = g.opening + g.purchases + g.transfers - g.closing;
    const mex = expByMonth[k] || 0;
    return {
      month: k, label: `${AR_MONTHS[Number(k.slice(5, 7)) - 1] || k} ${k.slice(0, 4)}`,
      revenue: g.sales, cogs: mcogs, expenses: mex, netProfit: g.sales - mcogs - mex,
    };
  });

  res.json({
    mode: isYear ? 'year' : (isRange ? 'range' : 'month'),
    period, periodLabel: period,
    scope: { type: scopeType, branch: branchId ? { id: branchId, name: branchNames[branchId] || '' } : null },
    totals: {
      revenue, cogs, cogsRatio: pct(cogs), grossProfit, grossMargin: pct(grossProfit),
      totalExpenses, netProfit, netMargin: pct(netProfit), expenseRatio: pct(totalExpenses),
      branchesCount: scopeIds.length, monthsCount: months.length,
    },
    expenseTypes: typeIds.map(id => typeMap[id]),
    branchRows,
    months: monthSeries,
  });
}));

// ====================================
// INSIGHTS: budget variance, expense analysis, MoM comparison
// ====================================
const INSIGHT_TYPE_LABELS = { revenue: 'الإيرادات', cost: 'تكلفة المبيعات', expense: 'المصروفات', profit: 'صافي الربح' };

// Budget variance: planned (from budgets) vs actual (from operational data)
app.get('/api/insights/budget-variance', asyncRoute(async (req, res) => {
  const month = req.query.month ? String(req.query.month) : '';
  const year = req.query.year ? String(req.query.year) : '';
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  if (!month && !year) return res.status(400).json({ error: 'month or year required' });

  let branchSql = 'SELECT id, name FROM branches WHERE 1=1';
  const bparams = [];
  if (branchId) { bparams.push(branchId); branchSql += ` AND id=$${bparams.length}`; }
  const branches = (await query(branchSql, bparams)).rows;
  const branchIds = branches.map(b => b.id);

  let periodFilter, periodValue;
  if (month) { periodFilter = 'month=$1'; periodValue = [monthDate(month)]; }
  else { periodFilter = "TO_CHAR(month,'YYYY')=$1"; periodValue = [year]; }

  const recs = branchIds.length ? (await query(
    `SELECT branch_id, COALESCE(SUM(opening),0) opening, COALESCE(SUM(purchases),0) purchases,
            COALESCE(SUM(transfers),0) transfers, COALESCE(SUM(closing),0) closing, COALESCE(SUM(sales),0) sales
     FROM monthly_records WHERE ${periodFilter} AND branch_id=ANY($2::int[]) GROUP BY branch_id`,
    [...periodValue, branchIds]
  )).rows : [];
  const expRes = branchIds.length ? (await query(
    `SELECT branch_id, COALESCE(SUM(amount),0) total FROM expenses WHERE ${periodFilter} AND branch_id=ANY($2::int[]) GROUP BY branch_id`,
    [...periodValue, branchIds]
  )).rows : [];
  const budRes = branchIds.length ? (await query(
    `SELECT branch_id, type, COALESCE(SUM(planned),0) planned FROM budgets WHERE ${periodFilter} AND branch_id=ANY($2::int[]) GROUP BY branch_id, type`,
    [...periodValue, branchIds]
  )).rows : [];

  const recMap = {}; for (const r of recs) recMap[r.branch_id] = r;
  const expMap = {}; for (const e of expRes) expMap[e.branch_id] = number(e.total);
  const budMap = {}; for (const b of budRes) { if (!budMap[b.branch_id]) budMap[b.branch_id] = {}; budMap[b.branch_id][b.type] = number(b.planned); }

  const buildMetrics = (revenue, cogs, expenses, bud) => ['revenue', 'cost', 'expense', 'profit'].map(key => {
    const actual = key === 'revenue' ? revenue : key === 'cost' ? cogs : key === 'expense' ? expenses : revenue - cogs - expenses;
    const planned = bud[key] || 0;
    return { key, label: INSIGHT_TYPE_LABELS[key], actual, planned, variance: actual - planned, variancePct: planned ? ((actual - planned) / Math.abs(planned)) * 100 : null };
  });

  const rows = branches.map(b => {
    const g = recMap[b.id] || { opening: 0, purchases: 0, transfers: 0, closing: 0, sales: 0 };
    const revenue = number(g.sales);
    const cogs = number(g.opening) + number(g.purchases) + number(g.transfers) - number(g.closing);
    const expenses = expMap[b.id] || 0;
    return { branchId: b.id, name: b.name, metrics: buildMetrics(revenue, cogs, expenses, budMap[b.id] || {}) };
  });

  const totals = ['revenue', 'cost', 'expense', 'profit'].map(key => {
    const actual = rows.reduce((s, r) => s + (r.metrics.find(m => m.key === key)?.actual || 0), 0);
    const planned = rows.reduce((s, r) => s + (r.metrics.find(m => m.key === key)?.planned || 0), 0);
    return { key, label: INSIGHT_TYPE_LABELS[key], actual, planned, variance: actual - planned, variancePct: planned ? ((actual - planned) / Math.abs(planned)) * 100 : null };
  });

  res.json({ month, year, scope: branchId ? 'branch' : 'all', rows, totals });
}));

// Expense analysis: by category, by branch, top items + MoM
app.get('/api/insights/expense-analysis', asyncRoute(async (req, res) => {
  const month = req.query.month ? String(req.query.month) : '';
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  if (!month) return res.status(400).json({ error: 'month required' });

  let sql = `SELECT e.id, e.amount, e.description, e.branch_id AS "branchId", b.name AS "branchName",
                    et.name AS "typeName", et.category
             FROM expenses e
             JOIN branches b ON b.id=e.branch_id
             JOIN expense_types et ON et.id=e.expense_type_id
             WHERE e.month=$1`;
  const params = [monthDate(month)];
  if (branchId) { params.push(branchId); sql += ` AND e.branch_id=$${params.length}`; }
  sql += ' ORDER BY e.amount DESC';
  const rows = (await query(sql, params)).rows.map(r => ({ ...r, amount: number(r.amount) }));

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const CAT_LABELS = { fixed: 'ثابتة', variable: 'متغيرة', administrative: 'إدارية', operational: 'تشغيلية', other: 'أخرى' };
  const byCategory = {};
  for (const r of rows) { const c = r.category || 'other'; byCategory[c] = (byCategory[c] || 0) + r.amount; }
  const categoryRows = Object.keys(byCategory).map(c => ({ category: c, label: CAT_LABELS[c] || c, total: byCategory[c], pct: total ? (byCategory[c] / total) * 100 : 0 })).sort((a, b) => b.total - a.total);

  const byBranch = {};
  for (const r of rows) { if (!byBranch[r.branchId]) byBranch[r.branchId] = { branchId: r.branchId, name: r.branchName, total: 0 }; byBranch[r.branchId].total += r.amount; }
  const branchRows = Object.values(byBranch).map(b => ({ ...b, pct: total ? (b.total / total) * 100 : 0 })).sort((a, b) => b.total - a.total);

  const topItems = rows.slice(0, 10).map(r => ({ id: r.id, description: r.description || r.typeName, typeName: r.typeName, category: r.category, amount: r.amount, branchName: r.branchName }));

  const prev = prevMonthStr(month);
  const prevRes = await query('SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE month=$1', [monthDate(prev)]);
  const prevTotal = number(prevRes.rows[0].total);

  res.json({ month, prevMonth: prev, scope: branchId ? 'branch' : 'all', total, prevTotal, categoryRows, branchRows, topItems });
}));

// Month-over-month comparison (revenue / cogs / expenses / net)
app.get('/api/insights/mom-comparison', asyncRoute(async (req, res) => {
  const month = req.query.month ? String(req.query.month) : '';
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  if (!month) return res.status(400).json({ error: 'month required' });
  const prev = prevMonthStr(month);

  async function agg(m) {
    const recRes = await query(
      `SELECT COALESCE(SUM(opening),0) opening, COALESCE(SUM(purchases),0) purchases,
              COALESCE(SUM(transfers),0) transfers, COALESCE(SUM(closing),0) closing, COALESCE(SUM(sales),0) sales
       FROM monthly_records WHERE month=$1${branchId ? ' AND branch_id=$2' : ''}`,
      branchId ? [monthDate(m), branchId] : [monthDate(m)]
    );
    const g = recRes.rows[0];
    const revenue = number(g.sales);
    const cogs = number(g.opening) + number(g.purchases) + number(g.transfers) - number(g.closing);
    const expRes = await query('SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE month=$1' + (branchId ? ' AND branch_id=$2' : ''), branchId ? [monthDate(m), branchId] : [monthDate(m)]);
    const expenses = number(expRes.rows[0].total);
    return { revenue, cogs, expenses, netProfit: revenue - cogs - expenses };
  }

  const cur = await agg(month);
  const prevAgg = await agg(prev);
  const keys = ['revenue', 'cogs', 'expenses', 'netProfit'];
  const deltas = {};
  for (const k of keys) {
    deltas[k] = { current: cur[k], previous: prevAgg[k], change: cur[k] - prevAgg[k], changePct: prevAgg[k] ? ((cur[k] - prevAgg[k]) / Math.abs(prevAgg[k])) * 100 : null };
  }
  res.json({ month, previousMonth: prev, deltas });
}));

// Data range: min/max month that actually has data (to auto-target the report period)
app.get('/api/insights/data-range', asyncRoute(async (req, res) => {
  const r = await query(`SELECT MIN(TO_CHAR(m,'YYYY-MM')) AS min, MAX(TO_CHAR(m,'YYYY-MM')) AS max FROM (
      SELECT month AS m FROM monthly_records WHERE opening<>0 OR purchases<>0 OR transfers<>0 OR closing<>0 OR sales<>0
      UNION
      SELECT month AS m FROM expenses WHERE amount<>0
    ) t`);
  res.json({ min: r.rows[0].min || null, max: r.rows[0].max || null });
}));

// Smart alerts: compare actuals vs KPI targets (costRatio, profit, expenses, sales)
app.get('/api/insights/alerts', asyncRoute(async (req, res) => {
  const month = req.query.month ? String(req.query.month) : '';
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  if (!month) return res.status(400).json({ error: 'month required' });

  const targets = (await query(
    `SELECT branch_id AS "branchId", metric, target FROM kpi_targets WHERE month=$1`,
    [monthDate(month)]
  )).rows;
  const targetMap = {};
  for (const t of targets) { if (!targetMap[t.branchId]) targetMap[t.branchId] = {}; targetMap[t.branchId][t.metric] = number(t.target); }

  const recs = (await query(
    `SELECT branch_id, COALESCE(SUM(opening),0) opening, COALESCE(SUM(purchases),0) purchases,
            COALESCE(SUM(transfers),0) transfers, COALESCE(SUM(closing),0) closing, COALESCE(SUM(sales),0) sales
     FROM monthly_records WHERE month=$1 GROUP BY branch_id`,
    [monthDate(month)]
  )).rows;
  const expRes = (await query(`SELECT branch_id, COALESCE(SUM(amount),0) total FROM expenses WHERE month=$1 GROUP BY branch_id`, [monthDate(month)])).rows;
  const expMap = {}; for (const e of expRes) expMap[e.branch_id] = number(e.total);
  const branches = (await query('SELECT id, name FROM branches ORDER BY id')).rows;
  const recMap = {}; for (const r of recs) recMap[r.branch_id] = r;

  const alerts = [];
  for (const b of branches) {
    if (branchId && b.id !== branchId) continue;
    const g = recMap[b.id] || { opening: 0, purchases: 0, transfers: 0, closing: 0, sales: 0 };
    const revenue = number(g.sales);
    const cogs = number(g.opening) + number(g.purchases) + number(g.transfers) - number(g.closing);
    const expenses = expMap[b.id] || 0;
    const profit = revenue - cogs - expenses;
    const costRatio = revenue > 0 ? (cogs / revenue) * 100 : 0;
    const t = targetMap[b.id] || {};
    if (t.costRatio && costRatio > t.costRatio) alerts.push({ branchId: b.id, branchName: b.name, type: 'costRatio', severity: 'high', message: `نسبة تكلفة المبيعات ${costRatio.toFixed(1)}% تجاوزت الهدف ${t.costRatio}%`, actual: costRatio, target: t.costRatio, unit: '%' });
    if (t.profit && profit < t.profit) alerts.push({ branchId: b.id, branchName: b.name, type: 'profit', severity: 'warning', message: `صافي الربح ${profit.toFixed(2)} أقل من الهدف ${t.profit.toFixed(2)}`, actual: profit, target: t.profit, unit: '' });
    if (t.expenses && expenses > t.expenses) alerts.push({ branchId: b.id, branchName: b.name, type: 'expenses', severity: 'warning', message: `المصروفات ${expenses.toFixed(2)} تجاوزت الهدف ${t.expenses.toFixed(2)}`, actual: expenses, target: t.expenses, unit: '' });
    if (t.sales && revenue < t.sales) alerts.push({ branchId: b.id, branchName: b.name, type: 'sales', severity: 'warning', message: `الإيرادات ${revenue.toFixed(2)} أقل من الهدف ${t.sales.toFixed(2)}`, actual: revenue, target: t.sales, unit: '' });
  }
  res.json({ month, alerts });
}));

// Food cost % trend across months of a year
app.get('/api/insights/food-cost-trend', asyncRoute(async (req, res) => {
  const year = req.query.year ? String(req.query.year) : String(new Date().getFullYear());
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const brandId = req.query.brandId ? Number(req.query.brandId) : null;
  let bjoin = '';
  const params = [year];
  if (branchId) { params.push(branchId); bjoin += ` AND mr.branch_id=$${params.length}`; }
  if (brandId) { params.push(brandId); bjoin += ` AND b.brand_id=$${params.length}`; }
  const recs = (await query(
    `SELECT TO_CHAR(mr.month,'YYYY-MM') AS m,
            COALESCE(SUM(mr.opening + mr.purchases + mr.transfers - mr.closing),0) AS cost,
            COALESCE(SUM(mr.sales),0) AS sales
     FROM monthly_records mr JOIN branches b ON b.id=mr.branch_id
     WHERE TO_CHAR(mr.month,'YYYY')=$1${bjoin}
     GROUP BY 1 ORDER BY 1`,
    params
  )).rows;
  const months = recs.map(r => ({ month: r.m, cost: number(r.cost), sales: number(r.sales), ratio: number(r.sales) > 0 ? (number(r.cost) / number(r.sales)) * 100 : 0 }));
  res.json({ year, months });
}));

// Brand performance: aggregate profitability by brand
app.get('/api/insights/brand-performance', asyncRoute(async (req, res) => {
  const month = req.query.month ? String(req.query.month) : '';
  const year = req.query.year ? String(req.query.year) : '';
  let recFilter, expFilter, params = [];
  if (month) { recFilter = 'mr.month=$1'; expFilter = 'e.month=$1'; params.push(monthDate(month)); }
  else if (year) { recFilter = "TO_CHAR(mr.month,'YYYY')=$1"; expFilter = "TO_CHAR(e.month,'YYYY')=$1"; params.push(year); }
  else return res.status(400).json({ error: 'month or year required' });

  const recs = (await query(
    `SELECT br.id AS "brandId", br.name AS "brandName", br.color AS "brandColor",
            COALESCE(SUM(mr.opening + mr.purchases + mr.transfers - mr.closing),0) AS cost,
            COALESCE(SUM(mr.sales),0) AS sales
     FROM monthly_records mr JOIN branches b ON b.id=mr.branch_id JOIN brands br ON br.id=b.brand_id
     WHERE ${recFilter} GROUP BY br.id, br.name, br.color ORDER BY sales DESC`,
    params
  )).rows;
  const expRes = (await query(
    `SELECT br.id AS "brandId", COALESCE(SUM(e.amount),0) AS total
     FROM expenses e JOIN branches b ON b.id=e.branch_id JOIN brands br ON br.id=b.brand_id
     WHERE ${expFilter} GROUP BY br.id`,
    params
  )).rows;
  const expMap = {}; for (const e of expRes) expMap[e.brandId] = number(e.total);
  const rows = recs.map(r => {
    const revenue = number(r.sales), cost = number(r.cost), expenses = expMap[r.brandId] || 0;
    const grossProfit = revenue - cost, netProfit = revenue - cost - expenses;
    return { brandId: r.brandId, brandName: r.brandName, brandColor: r.brandColor, revenue, cost, costRatio: revenue > 0 ? (cost / revenue) * 100 : 0, expenses, grossProfit, netProfit, netRatio: revenue > 0 ? (netProfit / revenue) * 100 : 0 };
  });
  res.json({ month, year, rows });
}));

// Top / bottom branches by net profit with a reason
app.get('/api/insights/top-branches', asyncRoute(async (req, res) => {
  const month = req.query.month ? String(req.query.month) : '';
  if (!month) return res.status(400).json({ error: 'month required' });
  const recs = (await query(
    `SELECT mr.branch_id AS "branchId", b.name, br.name AS "brandName",
            COALESCE(SUM(mr.opening + mr.purchases + mr.transfers - mr.closing),0) AS cost,
            COALESCE(SUM(mr.sales),0) AS sales
     FROM monthly_records mr JOIN branches b ON b.id=mr.branch_id LEFT JOIN brands br ON br.id=b.brand_id
     WHERE mr.month=$1 GROUP BY mr.branch_id, b.name, br.name`,
    [monthDate(month)]
  )).rows;
  const expRes = (await query(`SELECT branch_id, COALESCE(SUM(amount),0) total FROM expenses WHERE month=$1 GROUP BY branch_id`, [monthDate(month)])).rows;
  const expMap = {}; for (const e of expRes) expMap[e.branch_id] = number(e.total);
  const rows = recs.map(r => {
    const revenue = number(r.sales), cost = number(r.cost), expenses = expMap[r.branchId] || 0;
    const netProfit = revenue - cost - expenses;
    const costRatio = revenue > 0 ? (cost / revenue) * 100 : 0;
    const reason = revenue === 0 ? 'لا إيرادات' : costRatio > 45 ? 'تكلفة مرتفعة' : expenses > revenue * 0.2 ? 'مصروفات مرتفعة' : 'أداء جيد';
    return { branchId: r.branchId, name: r.name, brandName: r.brandName || '-', revenue, cost, costRatio, expenses, netProfit, reason };
  });
  rows.sort((a, b) => b.netProfit - a.netProfit);
  res.json({ month, rows });
}));

// Branch ranking by net profit for a month
app.get('/api/branch-ranking', asyncRoute(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const brandId = req.query.brandId ? Number(req.query.brandId) : null;

  const recs = (await query('SELECT * FROM monthly_records WHERE month=$1', [monthDate(month)])).rows;
  const expRes = await query('SELECT branch_id, SUM(amount) AS total FROM expenses WHERE month=$1 GROUP BY branch_id', [monthDate(month)]);
  const expMap = {};
  for (const e of expRes.rows) expMap[e.branch_id] = number(e.total);

  const branchesRes = await query(
    `SELECT b.*, br.name AS "brandName", br.color AS "brandColor" FROM branches b LEFT JOIN brands br ON br.id=b.brand_id WHERE 1=1`,
    []
  );
  let rows = branchesRes.rows;
  if (branchId) rows = rows.filter(b => b.id === branchId);
  if (brandId) rows = rows.filter(b => b.brand_id === brandId);

  const result = rows.map(b => {
    const r = recs.find(x => x.branch_id === b.id) || {};
    const cost = number(r.opening) + number(r.purchases) + number(r.transfers) - number(r.closing);
    const sales = number(r.sales);
    const expenses = expMap[b.id] || 0;
    const grossProfit = sales - cost;
    const netProfit = grossProfit - expenses;
    const ratio = sales > 0 ? (cost / sales) * 100 : 0;
    return {
      id: b.id, name: b.name, region: b.region || '-',
      brandName: b.brandName || 'بدون علامة', brandColor: b.brandColor || '#D4AF37',
      sales, cost, expenses, grossProfit, netProfit, ratio
    };
  });
  result.sort((a, b) => b.netProfit - a.netProfit);
  res.json(result);
}));

// Trend across months (costs / sales) for charts + optional AI forecast
app.get('/api/trend', asyncRoute(async (req, res) => {
  const months = (await query('SELECT DISTINCT TO_CHAR(month, \'YYYY-MM\') AS m FROM monthly_records ORDER BY m')).rows.map(r => r.m);
  const result = [];
  for (const m of months) {
    const sum = await query(
      `SELECT COALESCE(SUM(opening + purchases + transfers - closing),0) AS cost,
              COALESCE(SUM(sales),0) AS sales,
              COALESCE((SELECT SUM(amount) FROM expenses WHERE month=$2),0) AS expenses
       FROM monthly_records WHERE month=$1`,
      [monthDate(m), monthDate(m)]
    );
    result.push({ month: m, cost: number(sum.rows[0].cost), sales: number(sum.rows[0].sales), expenses: number(sum.rows[0].expenses) });
  }
  res.json(result);
}));

// Brand cost distribution
app.get('/api/brand-distribution', asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT br.name AS label, br.color, COALESCE(SUM(mr.opening + mr.purchases + mr.transfers - mr.closing),0) AS cost
     FROM branches b JOIN brands br ON br.id = b.brand_id
     LEFT JOIN monthly_records mr ON mr.branch_id = b.id
     GROUP BY br.id, br.name, br.color
     ORDER BY cost DESC`
  );
  res.json(result.rows);
}));

// Budget summary across the year vs actual
app.get('/api/budget-summary', asyncRoute(async (req, res) => {
  const year = String(req.query.year || new Date().getFullYear());
  const result = await query(
    `SELECT TO_CHAR(month,'YYYY-MM') AS month,
            COALESCE(SUM(planned),0) AS planned, COALESCE(SUM(actual),0) AS actual
     FROM budgets WHERE TO_CHAR(month,'YYYY')=$1 GROUP BY month ORDER BY month`,
    [year]
  );
  res.json(result.rows);
}));

// Year-over-year comparison: same calendar month across available years (or full years)
app.get('/api/year-comparison', asyncRoute(async (req, res) => {
  const refMonth = String(req.query.month || new Date().toISOString().slice(0, 7));
  const mm = refMonth.slice(5, 7); // '09'
  const useMonth = req.query.mode === 'full';

  const recSql = `
    SELECT TO_CHAR(month,'YYYY') AS year,
           COALESCE(SUM(opening + purchases + transfers - closing),0) AS cost,
           COALESCE(SUM(sales),0) AS sales,
           COUNT(DISTINCT branch_id) AS branches
    FROM monthly_records
    WHERE ${useMonth ? 'TRUE' : `TO_CHAR(month,'MM')=$1`}
    GROUP BY 1 ORDER BY 1 DESC`;
  const recs = (await query(recSql, useMonth ? [] : [mm])).rows;

  const rows = [];
  for (const r of recs) {
    const expSql = `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE TO_CHAR(month,'YYYY')=$1${useMonth ? '' : ' AND TO_CHAR(month,\'MM\')=$2'}`;
    const expParams = useMonth ? [r.year] : [r.year, mm];
    const expRes = await query(expSql, expParams);
    const cost = number(r.cost);
    const sales = number(r.sales);
    const expenses = number(expRes.rows[0].total);
    rows.push({ year: Number(r.year), cost, sales, expenses, grossProfit: sales - cost, netProfit: sales - cost - expenses, branches: Number(r.branches) });
  }

  let prev = null;
  const stats = [];
  for (const r of rows) {
    stats.push({
      year: r.year,
      salesGrowth: prev && prev.sales > 0 ? ((r.sales - prev.sales) / prev.sales) * 100 : null,
      costGrowth: prev && prev.cost > 0 ? ((r.cost - prev.cost) / prev.cost) * 100 : null,
      profitGrowth: prev && prev.netProfit > 0 ? ((r.netProfit - prev.netProfit) / prev.netProfit) * 100 : null,
    });
    prev = r;
  }
  res.json({ refMonth, mode: useMonth ? 'full' : 'same-month', rows, stats });
}));

// ============================================================
// AI - forecast / anomalies / recommendations (server-side)
// ============================================================
// moving average helper
function movingAverage(data, window = 3) {
  if (data.length < window) return data.map((_, i) => data.slice(Math.max(0, i - window + 1), i + 1).reduce((a, b) => a + b, 0) / Math.min(i + 1, window));
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    out.push(data.slice(start, i + 1).reduce((a, b) => a + b, 0) / (i - start + 1));
  }
  return out;
}

app.get('/api/ai/forecast', asyncRoute(async (_req, res) => {
  const trend = (await query('SELECT DISTINCT TO_CHAR(month,\'YYYY-MM\') AS m FROM monthly_records ORDER BY m')).rows.map(r => r.m);
  if (trend.length < 2) return res.json({ forecast: [], months: trend, slope: 0, intercept: 0, r2: null });
  const costData = [];
  for (const m of trend) {
    const sum = await query(`SELECT COALESCE(SUM(opening + purchases + transfers - closing),0) AS c FROM monthly_records WHERE month=$1`, [monthDate(m)]);
    costData.push(number(sum.rows[0].c));
  }
  const n = costData.length;
  const x = costData.map((_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = costData.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * costData[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = denom !== 0 ? (sumY - slope * sumX) / n : sumY / n;
  const linearForecast = Array.from({ length: 6 }, (_, i) => slope * (n + i) + intercept);

  // 3-month moving average forecast: average of last 3 actuals repeated
  const maWindow = Math.min(3, n);
  const lastAvg = costData.slice(n - maWindow).reduce((a, b) => a + b, 0) / maWindow;
  const maForecast = Array.from({ length: 6 }, () => lastAvg);

  res.json({ forecast: linearForecast, maForecast, actual: costData, months: trend, slope, intercept, r2: null });
}));

// Forecast monthly expenses (next month) using linear regression + moving average
app.get('/api/ai/expense-forecast', asyncRoute(async (_req, res) => {
  const trend = (await query('SELECT DISTINCT TO_CHAR(month,\'YYYY-MM\') AS m FROM expenses ORDER BY m')).rows.map(r => r.m);
  if (trend.length < 2) return res.json({ forecast: [], months: trend, slope: 0, intercept: 0 });
  const expData = [];
  for (const m of trend) {
    const sum = await query(`SELECT COALESCE(SUM(amount),0) AS c FROM expenses WHERE month=$1`, [monthDate(m)]);
    expData.push(number(sum.rows[0].c));
  }
  const n = expData.length;
  const x = expData.map((_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = expData.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * expData[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = denom !== 0 ? (sumY - slope * sumX) / n : sumY / n;
  const linearForecast = Array.from({ length: 3 }, (_, i) => slope * (n + i) + intercept);
  res.json({ forecast: linearForecast, actual: expData, months: trend, slope, intercept });
}));

app.get('/api/ai/anomalies', asyncRoute(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const recs = (await query('SELECT * FROM monthly_records WHERE month=$1', [monthDate(month)])).rows;
  const branchesRes = (await query('SELECT * FROM branches')).rows;
  const costs = recs.map(r => number(r.opening) + number(r.purchases) + number(r.transfers) - number(r.closing));
  const avg = costs.reduce((a, b) => a + b, 0) / (costs.length || 1);
  const stdDev = Math.sqrt(costs.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / (costs.length || 1));
  const threshold = avg + 2 * stdDev;
  const detected = recs
    .map(r => {
      const b = branchesRes.find(x => x.id === r.branch_id);
      return { branchId: r.branch_id, name: b?.name || '?', cost: number(r.opening) + number(r.purchases) + number(r.transfers) - number(r.closing) };
    })
    .filter(d => d.cost > threshold)
    .map(d => ({ ...d, alert: '🔴 تكلفة شاذة' }));

  // Expense anomalies: branch total expenses vs avg of branches in month
  const expRes = await query(
    `SELECT e.branch_id, SUM(e.amount) AS total, b.name
     FROM expenses e JOIN branches b ON b.id = e.branch_id
     WHERE e.month=$1 GROUP BY e.branch_id, b.name`, [monthDate(month)]
  );
  const expRows = expRes.rows;
  const expTotals = expRows.map(r => number(r.total));
  const expAvg = expTotals.reduce((a, b) => a + b, 0) / (expTotals.length || 1);
  const expStdDev = Math.sqrt(expTotals.reduce((s, v) => s + Math.pow(v - expAvg, 2), 0) / (expTotals.length || 1));
  const expThreshold = expAvg + 2 * expStdDev;
  const expenseAnomalies = expRows
    .filter(r => number(r.total) > expThreshold)
    .map(r => ({ branchId: r.branch_id, name: r.name, total: number(r.total), avg: expAvg, alert: '🧾 مصروفات شاذة' }));

  // Expense anomalies by type: types above avg for the month
  const typeRes = await query(
    `SELECT et.name, et.category, COALESCE(SUM(e.amount),0) AS total
     FROM expense_types et LEFT JOIN expenses e ON e.expense_type_id=et.id AND e.month=$1
     GROUP BY et.name, et.category ORDER BY total DESC`, [monthDate(month)]
  );
  const typeTotals = typeRes.rows.map(r => number(r.total));
  const typeAvg = typeTotals.reduce((a, b) => a + b, 0) / (typeTotals.length || 1);
  const typeThreshold = typeTotals.length > 3 ? 1.8 * typeAvg : 5 * typeAvg;
  const typeAnomalies = typeRes.rows
    .filter(r => number(r.total) > typeThreshold && number(r.total) > 0)
    .map(r => ({ name: r.name, category: r.category, total: number(r.total), avg: typeAvg, alert: '🏷️ نوع مصروف شاذ' }));

  res.json({ month, avg, stdDev, threshold, anomalies: detected, expAvg, expStdDev, expThreshold, expenseAnomalies, typeAvg, typeThreshold, typeAnomalies });
}));

app.get('/api/ai/recommendations', asyncRoute(async (_req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const recs = (await query('SELECT * FROM monthly_records WHERE month=$1', [monthDate(month)])).rows;
  if (recs.length === 0) return res.json({ recommendations: [{ title: 'لا توجد بيانات كافية', description: 'أضف بيانات الفروع للحصول على توصيات', impact: 'low' }] });

  const totalCost = recs.reduce((s, r) => s + number(r.opening) + number(r.purchases) + number(r.transfers) - number(r.closing), 0);
  const totalSales = recs.reduce((s, r) => s + number(r.sales), 0);
  const avgCost = totalCost / recs.length;
  const expRes = await query('SELECT branch_id, SUM(amount) AS total FROM expenses WHERE month=$1 GROUP BY branch_id', [monthDate(month)]);
  const expMap = {};
  for (const e of expRes.rows) expMap[e.branch_id] = number(e.total);
  const branchesRes = (await query('SELECT * FROM branches')).rows;
  const recommendations = [];

  const highCost = branchesRes.map(b => {
    const r = recs.find(x => x.branch_id === b.id);
    const c = r ? number(r.opening) + number(r.purchases) + number(r.transfers) - number(r.closing) : 0;
    return { b, cost: c };
  }).filter(x => x.cost > avgCost * 1.3);
  if (highCost.length) {
    recommendations.push({ title: '🔴 خفض التكاليف في الفروع عالية التكلفة', description: `الفروع التالية تتجاوز متوسط التكلفة: ${highCost.map(h => h.b.name).join('، ')}`, impact: 'high' });
  }

  const lossMaking = branchesRes
    .map(b => { const r = recs.find(x => x.branch_id === b.id); return { b, loss: (r ? number(r.sales) : 0) - (r ? number(r.opening) + number(r.purchases) + number(r.transfers) - number(r.closing) : 0) }; })
    .filter(x => x.loss < 0);
  if (lossMaking.length) {
    recommendations.push({ title: '📉 تحسين الربحية في الفروع الخاسرة', description: `${lossMaking.length} فروع تحقق خسائر. يوصى بتحليل الأسباب`, impact: 'high' });
  }

  const margin = totalSales > 0 ? ((totalSales - totalCost) / totalSales) * 100 : 0;
  if (margin < 10 && margin > 0) {
    recommendations.push({ title: '📊 زيادة هامش الربح', description: `هامش الربح الحالي ${margin.toFixed(1)}%، يوصى بزيادة المبيعات أو خفض التكاليف`, impact: 'high' });
  }
  if (margin > 25) {
    recommendations.push({ title: '💰 فرصة استثمارية', description: `هامش الربح ممتاز (${margin.toFixed(1)}%). يوصى باستثمار الفائض في التوسع`, impact: 'medium' });
  }
  recommendations.push({ title: '🔮 تتبع الاتجاهات شهرياً', description: 'يوصى بمراجعة التقرير المالي ولوحة المتابعة بشكل دوري', impact: 'low' });
  res.json({ recommendations });
}));

// ============================================================
// HEALTH + STATIC + FALLBACK
// ============================================================
app.get('/api/health', asyncRoute(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, service: 'restocost-pro', version: '10.0.0', database: 'postgresql' });
}));

// Seed demo data (only if no brands exist yet)
app.post('/api/seed', asyncRoute(async (_req, res) => {
  const { rows: existing } = await query('SELECT COUNT(*) AS c FROM brands');
  if (Number(existing[0].c) > 0) return res.json({ ok: true, skipped: true, message: 'توجد بيانات بالفعل' });

  const brandNames = [['برجر كينج', '#D4AF37'], ['كنتاكي', '#ff2400'], ['هرفي', '#0057a8']];
  const brandIds = [];
  for (const [name, color] of brandNames) {
    const r = await query('INSERT INTO brands (name, color) VALUES ($1, $2) RETURNING id', [name, color]);
    brandIds.push(r.rows[0].id);
  }

  const regions = ['الرياض', 'جدة', 'الدمام', 'مكة'];
  const branchData = [
    ['فرع النخيل', brandIds[0], 'الرياض'], ['فرع الروضة', brandIds[0], 'الرياض'],
    ['فرع السلام', brandIds[1], 'جدة'],   ['فرع الورود', brandIds[1], 'جدة'],
    ['فرع المروج', brandIds[2], 'الدمام'], ['فرع الشرائع', brandIds[2], 'مكة'],
  ];
  const branchIds = [];
  let i = 0;
  for (const [name, brandId, region] of branchData) {
    const opening = 8000 + i * 1500;
    const closing = opening - (2500 + i * 500);
    const r = await query('INSERT INTO branches (name, brand_id, region, opening, closing) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, brandId, region, opening, closing]);
    branchIds.push(r.rows[0].id);
    i++;
  }

  const base = new Date();
  const baseY = base.getFullYear();
  const baseM = base.getMonth();
  for (let k = 5; k >= 0; k--) {
    const d = new Date(baseY, baseM - k, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthFull = `${monthStr}-01`;
    const mi = 5 - k; // 0=oldest .. 5=current
    let step = 0;
    for (const bid of branchIds) {
      const opening = 9000 + step * 300 + mi * 400;
      const purchases = 15000 + step * 800 + mi * 1200;
      const transfers = (step % 3 === 0 ? 1000 : 500);
      const cost = 14000 + step * 700 + mi * 900 + (step % 2) * 300;
      const closing = opening + purchases + transfers - cost;
      const sales = Math.round(cost * (1.55 + step * 0.02));
      await query(
        `INSERT INTO monthly_records (month, branch_id, opening, purchases, transfers, closing, sales)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (month, branch_id) DO NOTHING`,
        [monthFull, bid, opening, purchases, transfers, closing, sales]
      );
      step++;
    }
  }

  const types = [['إيجار', 'fixed'], ['رواتب', 'fixed'], ['صيانة', 'variable'], ['تسويق', 'variable'], ['كهرباء وماء', 'fixed']];
  for (const [name, category] of types) {
    await query('INSERT INTO expense_types (name, category) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [name, category]);
  }
  const typeRes = await query('SELECT id, name FROM expense_types');
  const typeById = {};
  for (const t of typeRes.rows) typeById[t.name] = t.id;
  const now = new Date();
  const expMo = [];
  for (let ee = 0; ee < 3; ee++) {
    const d = new Date(now.getFullYear(), now.getMonth() - ee, 1);
    expMo.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  }
  const curFull = expMo[0];
  let step = 0;
  for (const bid of branchIds) {
    let j = 0;
    for (const mmFull of expMo) {
      const amount = 1500 + (step % 4) * 600 + (2 - j) * 300;
      const typeName = types[(step + j) % types.length][0];
      await query(
        `INSERT INTO expenses (month, branch_id, expense_type_id, amount, description)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [mmFull, bid, typeById[typeName], amount, `مصروف تجريبي ${step + 1}-${j + 1}`]
      );
      j++;
    }
    step++;
  }

  for (const bid of branchIds) {
    await query(`INSERT INTO budgets (month, branch_id, type, planned, actual)
                 VALUES ($1,$2,'revenue',$3,$4) ON CONFLICT DO NOTHING`,
      [curFull, bid, 25000 + bid * 500, 24000 + bid * 400]);
  }

  res.json({ ok: true, skipped: false, message: 'تم تعبئة البيانات التجريبية' });
}));

// Serve built client if exists, otherwise legacy pages
const clientDist = path.join(ROOT, 'client', 'dist');
// Always revalidate the HTML shell so browsers never cache a stale index referencing old hashed bundles
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/sw.js' || req.path.endsWith('.html')) res.set('Cache-Control', 'no-cache, must-revalidate');
  next();
});
app.use(express.static(clientDist, { maxAge: '1h', extensions: ['html'] }));
app.use(express.static(ROOT, { extensions: ['html'] }));

// API 404 handler
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.get('*', (_req, res) => {
  if (fs.existsSync(path.join(clientDist, 'index.html'))) return res.sendFile(path.join(clientDist, 'index.html'));
  res.sendFile(path.join(ROOT, 'restocost-pro.html'));
});

app.use((error, _req, res, _next) => {
  console.error('[API]', error.message);
  res.status(500).json({ error: 'Internal server error', detail: process.env.NODE_ENV === 'development' ? error.message : undefined });
});

// ============================================================
// BOOTSTRAP: schema + seed admin
// ============================================================
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(120),
  role VARCHAR(30) NOT NULL DEFAULT 'viewer',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  token VARCHAR(70) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  username VARCHAR(60),
  action VARCHAR(80),
  entity VARCHAR(60),
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS report_approvals (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  submitted_by INTEGER,
  approved_by INTEGER,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS financial_exceptions (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  kind VARCHAR(40) DEFAULT 'other',
  severity VARCHAR(20) DEFAULT 'medium',
  title TEXT NOT NULL,
  details JSONB,
  status VARCHAR(20) DEFAULT 'open',
  due_date DATE,
  assigned_user_id INTEGER,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS kpi_targets (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  metric VARCHAR(30) NOT NULL,
  target NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, branch_id, metric)
);
CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  report_type VARCHAR(30) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS report_settings (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(30) NOT NULL UNIQUE,
  primary_color VARCHAR(20),
  accent_color VARCHAR(20),
  header_message TEXT,
  updated_by INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS report_versions (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(30) NOT NULL,
  month DATE NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) DEFAULT 'draft',
  snapshot JSONB NOT NULL,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(30) DEFAULT 'system',
  title TEXT NOT NULL,
  message TEXT,
  user_id INTEGER,
  read_flag INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  report_type VARCHAR(30) NOT NULL,
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  enabled INTEGER NOT NULL DEFAULT 1,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS scheduled_runs (
  id SERIAL PRIMARY KEY,
  scheduled_report_id INTEGER NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  report_type VARCHAR(30) NOT NULL,
  target_month DATE NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE monthly_records ADD COLUMN IF NOT EXISTS locked INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exceptions_month ON financial_exceptions (month);
CREATE INDEX IF NOT EXISTS idx_exceptions_status ON financial_exceptions (status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read_flag);
CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_reports (enabled, next_run_at);
`;

function labelStatus(s) {
  return ({ draft: 'مسودة', review: 'قيد المراجعة', approved: 'معتمد', locked: 'مقفول', unlocked: 'غير مؤمّن', open: 'مفتوح', 'in_progress': 'قيد المتابعة', resolved: 'تمت المعالجة', closed: 'مغلق' })[s] || s;
}

async function bootstrap() {
  await query(SCHEMA_SQL);
  const admin = await query('SELECT id FROM users WHERE username=$1', ['admin']);
  if (!admin.rowCount) {
    await query(
      `INSERT INTO users (username, password_hash, display_name, role, active)
       VALUES ('admin', $1, 'مدير النظام', 'admin', 1)`,
      [hashPassword('admin123')]
    );
    console.log('[Bootstrap] admin user created (admin / admin123) — غيّر كلمة المرور فوراً');
  }
  const missing = await query('SELECT COUNT(*) AS c FROM users');
  console.log('[Bootstrap] schema ready, users =', Number(missing.rows[0].c));
}

bootstrap()
  .then(() => {
    const server = app.listen(PORT, HOST, async () => {
      console.log(`RestoCost Pro v10.0 running at http://${HOST}:${PORT}`);
      await autoBackup();
    });
    process.on('SIGINT', () => shutdown(server, 'SIGINT'));
    process.on('SIGTERM', () => shutdown(server, 'SIGTERM'));
  })
  .catch((err) => {
    console.error('[Bootstrap] FAILED:', err.message);
    process.exit(1);
  });

// Auto-backup on startup (deduplicated: one per calendar day)
async function autoBackup() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const check = await query("SELECT COUNT(*) AS c FROM state_backups WHERE TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')=$1", [today]);
    if (Number(check.rows[0].c) > 0) { console.log('[Backup] auto-backup already exists for today'); return; }
    const state = await readFullState();
    await query('INSERT INTO state_backups (snapshot) VALUES ($1)', [JSON.stringify(state)]);
    await query('DELETE FROM state_backups WHERE id NOT IN (SELECT id FROM state_backups ORDER BY created_at DESC LIMIT 10)');
    console.log('[Backup] auto-backup created on startup');
  } catch (e) {
    console.error('[Backup] auto-backup failed:', e.message);
  }
}

async function shutdown(server, signal) {
  console.log(`${signal}: shutting down`);
  server.close(async () => { const { close } = require('./db'); await close(); process.exit(0); });
}

module.exports = { app };