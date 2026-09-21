const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const db = new DatabaseSync(path.join(process.cwd(), 'server', 'data', 'restocost.db'));
const KEY = 'rcerp_opening_balances';
const BR = 'b-1786642709374';
const arr = JSON.parse(db.prepare('SELECT value FROM kv WHERE key = ?').get(KEY).value);
const dups = arr.filter(r => r.branchId === BR);
console.log('records for branch:', dups.map(r => `${r.id} date=${r.date} qty=${r.items.reduce((s,i)=>s+(+i.quantity||0),0).toFixed(1)}`).join(' | '));
if (dups.length < 2) { console.log('no duplicates - nothing deleted'); process.exit(0); }
dups.sort((a, b) => String(a.id).localeCompare(String(b.id)));
const victim = dups[0];
console.log('DELETING older:', victim.id);
const next = arr.filter(r => r.id !== victim.id);
db.prepare('UPDATE kv SET value = ? WHERE key = ?').run(JSON.stringify(next), KEY);
const after = JSON.parse(db.prepare('SELECT value FROM kv WHERE key = ?').get(KEY).value);
const kept = after.filter(r => r.branchId === BR);
console.log('total records now:', after.length, '| branch records:', kept.length);
kept.forEach(r => console.log('KEPT:', r.id, r.date, 'qty=', r.items.reduce((s,i)=>s+(+i.quantity||0),0).toFixed(1)));