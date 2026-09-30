import Database from 'better-sqlite3';
const db = new Database('data/restocost.db');
db.prepare("DELETE FROM kv WHERE key = 'rcerp_users'").run();
console.log('Users cleared');