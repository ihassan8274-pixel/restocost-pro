// Which backup, if any, still holds the 13,332 movements the retention
// deleted? The deletion happened at 2026-10-07T10:10:02Z, so only a backup
// taken BEFORE that can contain them.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// api/scripts/ -> repo root is two levels up, not one.
const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DIR = resolve(REPO, 'server/backup-archive');
const KEY = 'rcerp_inventory_movements';

const files = readdirSync(DIR).filter((f) => f.startsWith('backup_') && f.endsWith('.json')).sort();
console.log('scanning ' + files.length + ' backup files for ' + KEY);
console.log('');

const CANDIDATES = [
  'backup_20261006_145842_657.json',   // last on 06.10, 4.61 MB
  'backup_20261007_100038_885.json',   // 07.10 10:00 -- BEFORE the 10:10 deletion
  'backup_20261007_100745_410.json',   // 07.10 10:07 -- BEFORE, 6.39 MB
  'backup_20261007_102454_530.json',   // 07.10 10:24 -- after
];

for (const name of CANDIDATES) {
  const p = resolve(DIR, name);
  let j;
  try {
    j = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.log(name.padEnd(38) + ' unreadable: ' + (e instanceof Error ? e.message : e));
    continue;
  }
  const has = j.counts ? (j.counts[KEY] ?? 0) : null;
  const data = j.data?.[KEY];
  const rows = Array.isArray(data) ? data.length : (has ?? 'absent');
  const dates = Array.isArray(data) ? data.map((r) => r?.date).filter(Boolean).sort() : [];
  console.log(name.padEnd(38) + ' count=' + String(has).padEnd(8) + ' rows=' + String(rows).padEnd(8) +
    (dates.length ? '  ' + dates[0] + ' .. ' + dates[dates.length - 1] : ''));
}

console.log('');
console.log('=== also: what is in the newest one, for reference ===');
const newest = files[files.length - 1];
const j2 = JSON.parse(readFileSync(resolve(DIR, newest), 'utf8'));
const d2 = j2.data?.[KEY];
console.log(newest + '  ' + (Array.isArray(d2) ? d2.length : 'absent') + ' rows');
console.log('createdAt: ' + j2.createdAt + '   type: ' + j2.type + '   label: ' + (j2.label ?? '-'));