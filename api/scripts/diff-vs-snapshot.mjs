import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const SNAP = 'E:/MASSOBI APP/NEW APP/server/backup-archive/backup_20261007_122720_659.json';
const LIVE = 'E:/MASSOBI APP/NEW APP/server/data/restocost.db';

const snap = JSON.parse(readFileSync(SNAP, 'utf8'));
const snapCounts = snap.counts ?? {};
const snapData = snap.data ?? {};

const db = new DatabaseSync(LIVE, { readOnly: true });
const liveKeys = db.prepare('SELECT key, value FROM kv').all();
db.close();

const live = new Map();
for (const r of liveKeys) {
  const v = r.value;
  try { live.set(r.key, typeof v === 'string' ? JSON.parse(v) : v); } catch { live.set(r.key, v); }
}

const len = (v) => Array.isArray(v) ? v.length : (v === null || v === undefined ? null : (typeof v === 'object' ? Object.keys(v).length : String(v).length));

console.log('snapshot: ' + snap.createdAt + '   type: ' + snap.type);
console.log('keys in snapshot: ' + Object.keys(snapCounts).length + '   keys live: ' + live.size);
console.log('');
console.log('key                          snapshot   live    delta');
console.log('-'.repeat(70));
const allKeys = [...new Set([...Object.keys(snapCounts), ...live.keys()])].sort();
const changed = [];
for (const k of allKeys) {
  const a = snapCounts[k];
  const b = live.has(k) ? len(live.get(k)) : null;
  const sa = a === undefined ? null : (typeof a === 'number' ? a : len(a));
  if (sa === b) continue;
  const d = (sa === null || b === null) ? (sa === null ? 'NEW' : 'GONE') : (b - sa);
  changed.push({ k, sa, b, d });
  console.log(k.padEnd(30) + String(sa).padStart(8) + String(b).padStart(8) + '   ' + d);
}
console.log('');
console.log('keys whose size differs: ' + changed.length + ' of ' + allKeys.length);
