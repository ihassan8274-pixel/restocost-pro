const path = require('path');
const { DatabaseSync: Database } = require('node:sqlite');

const db = new Database(path.join(__dirname, '..', 'server', 'data', 'restocost.db'), {});
const rows = db.prepare("SELECT key, value FROM kv").all();
for (const r of rows) {
  let v;
  try { v = JSON.parse(r.value); } catch { console.log(r.key, '= NON-JSON len', r.value.length); continue; }
  if (Array.isArray(v)) {
    console.log(`${r.key}: ${v.length} items`);
  } else if (v && typeof v === 'object') {
    console.log(`${r.key}: object keys=${Object.keys(v).slice(0,8).join(',')}`);
  } else {
    console.log(`${r.key}: ${String(v).slice(0,60)}`);
  }
}
// integrity checks
const get = (k) => { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.value) : []; };
const branches = get('rcerp_branches');
const branchIds = new Set(branches.map(b => b.id));
const recipes = get('rcerp_recipes');
const recipeIds = new Set(recipes.map(r => r.id));
console.log('\n--- integrity ---');
console.log('branches:', branches.map(b=>`${b.id}(${b.nameAr})`).join(' | '));
const bs = get('rcerp_batch_sales');
let badBranch=0, badDate=0, negRev=0;
for (const b of bs) { if (!branchIds.has(b.branchId)) badBranch++; if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')) badDate++; if ((b.totalRevenue??0)<0) negRev++; }
console.log(`batch_sales=${bs.length} badBranchRef=${badBranch} badDate=${badDate} negRevenue=${negRev}`);
const ob = get('rcerp_opening_balances');
console.log(`opening_balances=${ob.length}`, ob.map(o=>`${o.branchId}@${o.date}=${o.totalValue}`).join(' | '));
const inv = get('rcerp_inventory');
console.log('inventory items:', inv.length);
const movs = get('rcerp_inventory_movements');
let orphanMov = 0;
for (const m of movs) { if (m.branchId && !branchIds.has(m.branchId)) orphanMov++; }
console.log(`movements=${movs.length} orphanBranchRefs=${orphanMov}`);
const users = get('rcerp_users');
console.log('users:', users.map(u=>u.username+'('+u.role+')').join(', '));
db.close();



