import Database from 'better-sqlite3';
const db = new Database('data/restocost.db');
db.prepare("DELETE FROM rate_limits WHERE key LIKE 'login:%'").run();
console.log('Rate limits cleared');