import Database from 'better-sqlite3';
const db = new Database('data/restocost.db');
const users = db.prepare('SELECT id, email, role, passwordHash, isActive, mustChangePassword FROM rcerp_users').all();
console.log(JSON.stringify(users, null, 2));
db.close();