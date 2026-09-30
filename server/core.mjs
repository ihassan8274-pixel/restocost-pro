// Shared server helpers: identity, data paths, auth plumbing used by all routers.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { legacyHash, isBcryptHash } from './auth-utils.mjs';
import { store, SESSION_TTL_MS } from './store.mjs';

const { getKV, sessionRow, deleteSession } = store;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.join(__dirname, 'data');

// Per-copy identity: every independent company copy has a unique id written to
// server/instance.txt so the launcher can tell its own server apart from other copies.
const instanceFile = path.join(__dirname, 'instance.txt');
let instanceId = '';
try {
  instanceId = fs.readFileSync(instanceFile, 'utf8').trim();
} catch { /* file missing */ }
if (!instanceId) {
  instanceId = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(instanceFile, instanceId);
}
export { instanceId };

export const COLLECTION_KEYS = [
  'rcerp_branches', 'rcerp_suppliers', 'rcerp_raw_materials', 'rcerp_recipes', 'rcerp_inventory',
  'rcerp_grn', 'rcerp_purchase_orders', 'rcerp_work_orders', 'rcerp_wastage', 'rcerp_employees',
  'rcerp_shifts', 'rcerp_pos_orders', 'rcerp_stock_transfers', 'rcerp_recipe_inventory', 'rcerp_physical_counts', 'rcerp_pl_summaries',
  'rcerp_categories', 'rcerp_food_menus', 'rcerp_menu_plans', 'rcerp_batch_sales', 'rcerp_operating_expenses', 'rcerp_expense_budgets',
  'rcerp_customers', 'rcerp_reservations', 'rcerp_invoices', 'rcerp_accounts', 'rcerp_journal', 'rcerp_audit', 'rcerp_users',
  'rcerp_pos_returns', 'rcerp_fixed_assets', 'rcerp_scheduled_reports', 'rcerp_automation_rules',
  'rcerp_daily_counts', 'rcerp_employee_meals', 'rcerp_production_runs',
  'rcerp_target_margin', 'rcerp_ack_alerts',
  'rcerp_custom_roles', 'rcerp_opening_balances', 'rcerp_supplier_quotes', 'rcerp_supplier_returns',
  'rcerp_monthly_inventory', 'rcerp_closed_months', 'rcerp_vat_percent', 'rcerp_vat_inclusive',
  'rcerp_currencies', 'rcerp_companies', 'rcerp_requisitions',
  'rcerp_logo', 'rcerp_ai_settings', 'rcerp_delivery_apps',
  'rcerp_telegram_settings',
  'rcerp_branch_stock_limits', 'rcerp_delivery_sales',
  'rcerp_purchase_requests',
  'rcerp_access_roles',
  'rcerp_material_categories', 'rcerp_inventory_movements', 'rcerp_closed_days',
  'rcerp_customer_orders', 'rcerp_deduct_sales',
  'rcerp_attendance', 'rcerp_payroll', 'rcerp_butcher_tests',
  'rcerp_recipe_sections',
  'rcerp_distributions',
  'rcerp_intake_inbox',
  'rcerp_documents',
  'rcerp_deleted_ids',
  'rcerp_units',
  'rcerp_inventory_batches', 'rcerp_temp_logs', 'rcerp_haccp_inspections', 'rcerp_tasks', 'rcerp_custom_reports',
  'rcerp_eod_closures',
  'rcerp_material_barcodes',
  'rcerp_recent_docs',
];

export const publicUser = (u) => (u ? { id: u.id, name: u.name, email: u.email, role: u.role, branchId: u.branchId, isActive: u.isActive, createdAt: u.createdAt, lastLogin: u.lastLogin, totpEnabled: !!u.totpEnabled, needsActivation: !!u.needsActivation, requestedRole: u.requestedRole, requestedBranchId: u.requestedBranchId } : null);

export const readToken = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

export const sessionUser = (token) => {
  if (!token) return null;
  const s = sessionRow(token);
  if (!s) return null;
  if (Date.now() - new Date(s.createdAt).getTime() > SESSION_TTL_MS) {
    deleteSession(token);
    return null;
  }
  const users = getKV('rcerp_users') || [];
  const u = users.find((x) => x.id === s.userId) || null;
  // A disabled account loses its sessions immediately (and can't authenticate from them).
  if (u && !u.isActive) {
    deleteSession(token);
    return null;
  }
  return u;
};

// True when the default admin password is still active — forces a change screen.
export const hasDefaultAdminPassword = () => {
  const users = getKV('rcerp_users') || [];
  return users.some((u) => u.role === 'admin' &&
    (u.passwordHash === legacyHash('admin123') || (isBcryptHash(u.passwordHash) && bcrypt.compareSync('admin123', u.passwordHash)))
  );
};

export const requireAdminUser = (req, res, next) => {
  const user = sessionUser(readToken(req));
  if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
  if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح لك' });
  req.authUser = user;
  next();
};

export const requireAdmin = (req, res, next) => {
  const user = sessionUser(readToken(req));
  if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
  if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح لك — هذه المنطقة مخصصة لمدير النظام' });
  req.authUser = user;
  next();
};

export const portInUse = (port, host = '127.0.0.1') => new Promise((resolve) => {
  const srv = net.createServer();
  srv.once('error', () => resolve(true));
  srv.once('listening', () => srv.close(() => resolve(false)));
  srv.listen(port, host);
});

// True when a live RestoCost server answers /health on the given port.
// Used to distinguish "intended port busy by our own app" (→ refuse to start,
// never clobber port.txt) from "busy by some other process" (→ safe to escalate).
export const isLiveRestoServer = (port, hosts = ['::1', '127.0.0.1']) => new Promise((resolve) => {
  let checked = 0;
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    resolve(ok);
  };
  for (const h of hosts) {
    const host = h === '0.0.0.0' ? '127.0.0.1' : h;
    fetch(`http://${host.includes(':') ? `[${host}]` : host}:${port}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(1200),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { checked += 1; if (j && j.server && j.build) finish(true); if (checked === hosts.length) finish(false); })
      .catch(() => { checked += 1; if (checked === hosts.length) finish(false); });
  }
});

// Per-directory single-instance lock: only one live server may own a company copy.
// Stale locks (crashed PID) are automatically taken over.
const LOCK_FILE = () => path.join(__dirname, 'instance.lock');
const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch (e) {
    // EPERM/EACCES: process exists but we cannot signal it (e.g. a higher
    // integrity-level process on Windows). Treat as ALIVE so we never start
    // a duplicate that would clobber port.txt / the data store.
    return !!(e && (e.code === 'EPERM' || e.code === 'EACCES'));
  }
};
export const acquireInstanceLock = () => {
  try {
    const raw = fs.readFileSync(LOCK_FILE(), 'utf8');
    const lock = JSON.parse(raw);
    if (lock && lock.pid && pidAlive(lock.pid)) return { ok: false, pid: lock.pid, startedAt: lock.startedAt };
  } catch { /* none or stale (bad JSON) */ }
  try {
    fs.writeFileSync(LOCK_FILE(), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
export const releaseInstanceLock = () => {
  try {
    const raw = fs.readFileSync(LOCK_FILE(), 'utf8');
    if (raw) {
      const lock = JSON.parse(raw);
      if (lock.pid === process.pid) fs.writeFileSync(LOCK_FILE(), '');
    }
  } catch { /* ignore */ }
};

export const readBindHost = () => {
  if (process.env.HOST) return process.env.HOST;
  const hostFile = path.join(__dirname, 'host.txt');
  try {
    const v = fs.readFileSync(hostFile, 'utf8').trim();
    if (v === '0.0.0.0' || v === '127.0.0.1') return v;
  } catch { /* noop */ }
  return '127.0.0.1';
};