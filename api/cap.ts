import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const db = new DatabaseSync('E:/MASSOBI APP/NEW APP/server/data/restocost.db', { readOnly: true });
const raw = db.prepare("SELECT value FROM kv WHERE key='rcerp_inventory_movements'").get().value as string;
const a = (typeof raw === 'string' ? JSON.parse(raw) : raw) as any[];
console.log('rcerp_inventory_movements rows NOW :', a.length);
console.log('raw bytes in the file              :', raw.length);
console.log('file mtime                         :', (await import('node:fs')).statSync('E:/MASSOBI APP/NEW APP/server/data/restocost.db').mtime.toISOString());

console.log('');
console.log('--- date range of the rows present ---');
const byDate = new Map<string, number>();
for (const m of a) {
  const d = m.date ?? m.createdAt ?? '?';
  byDate.set(d, (byDate.get(d) ?? 0) + 1);
}
const d = [...byDate].sort();
console.log('distinct dates:', d.length);
console.log('earliest:', d[0]?.[0], 'with', d[0]?.[1], 'rows');
console.log('latest  :', d[d.length - 1]?.[0], 'with', d[d.length - 1]?.[1], 'rows');

console.log('');
console.log('--- is 5000 a cap? count per date, to see if the tail is clipped ---');
const last20 = d.slice(-8);
for (const [date, n] of last20) console.log('  ' + date + '  ' + n);
db.close();

console.log('');
console.log('--- what does the retention code say? ---');
const src = readFileSync('E:/MASSOBI APP/NEW APP/server/routes/data.mjs', 'utf8');
for (const m of src.matchAll(/RETENTION[\s\S]{0,400}/g)) {
  console.log(m[0].split('\n').slice(0, 8).join('\n'));
  console.log('---');
}