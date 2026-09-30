import Database from 'better-sqlite3';
const db = new Database('data/restocost.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Check key collections
const keys = ['rcerp_pos_orders', 'rcerp_inventory', 'rcerp_invoices', 'rcerp_recipes', 'rcerp_raw_materials', 'rcerp_purchase_orders', 'rcerp_employees', 'rcerp_shifts', 'rcerp_customers', 'rcerp_suppliers'];
for (const key of keys) {
  try {
    const count = db.prepare(`SELECT COUNT(*) as c FROM kv WHERE key = ?`).get(key);
    if (count && count.c > 0) {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
      if (row) {
        const data = JSON.parse(row.value);
        console.log(`${key}: ${Array.isArray(data) ? data.length : 'object'} items`);
      }
    }
  } catch (e) {
    console.log(`${key}: error - ${e.message}`);
  }
}