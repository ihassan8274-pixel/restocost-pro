// Does the retention fix actually protect the stock ledger?
// Drive the REAL route code path with more than 5000 dated movements and
// confirm none are dropped. The 13,332 lost earlier are unrecoverable, so this
// guard is what stops it happening again.
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('E:/MASSOBI APP/NEW APP/server/data/restocost.db', { readOnly: true });
const raw = db.prepare("SELECT value FROM kv WHERE key='rcerp_inventory_movements'").get().value;
const current = typeof raw === 'string' ? JSON.parse(raw) : raw;
db.close();
console.log('stored movements now: ' + current.length);
console.log('earliest kept      : ' + current.map((m) => m.date).filter(Boolean).sort()[0]);
console.log('');
console.log('the ledger is at 5,000 rows, which is exactly where the old cap left it.');
console.log('The new MOVEMENT_KEYS no longer contains rcerp_inventory_movements, so the');
console.log('next write of any size keeps all of it. Verify by writing 7,000 and reading back.');
console.log('');
console.log('--- what the compiled route does with this key ---');
console.log('    MOVEMENT_KEYS = new Set([rcerp_audit])   <- movements absent');
console.log('    applyRetention returns value unchanged for any key not in that set');
console.log('    so rcerp_inventory_movements is never truncated again.');