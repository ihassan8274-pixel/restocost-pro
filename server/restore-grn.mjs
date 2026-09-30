import fs from 'fs';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const BOX = /[\u2500-\u257F]/;

const dir = 'E:/MASSOBI APP/NEW APP/server/backup-archive';
const latest = fs.readdirSync(dir).filter((f) => f.startsWith('backup_') && f.endsWith('.json')).sort().reverse()[0];
const b = JSON.parse(fs.readFileSync(`${dir}/${latest}`, 'utf8'));
const clean = (b.data || b).rcerp_grn;

if (!Array.isArray(clean) || clean.length !== 292) throw new Error('unexpected backup grn: ' + (clean && clean.length));
const bad = clean.filter((r) => BOX.test(r?.supplierName || '')).length;
if (bad) throw new Error('backup itself corrupt: ' + bad);
console.log(`source backup: ${latest} | grn=${clean.length} | clean suppliers OK`);

const live = await p.kv.findUnique({ where: { key: 'rcerp_grn' } });
const liveVal = typeof live.value === 'string' ? JSON.parse(live.value) : live.value;
fs.writeFileSync('E:/MASSOBI APP/NEW APP/server/backup-archive/rcerp_grn.corrupted.bak.json', JSON.stringify(liveVal));
console.log('saved corrupted copy to rcerp_grn.corrupted.bak.json');

await p.kv.update({ where: { key: 'rcerp_grn' }, data: { value: clean } });
const after = await p.kv.findUnique({ where: { key: 'rcerp_grn' } });
const afterVal = typeof after.value === 'string' ? JSON.parse(after.value) : after.value;
const stillBad = afterVal.filter((r) => BOX.test(r?.supplierName || '')).length;
console.log(`RESTORED: grn=${afterVal.length} | corruptSuppliers=${stillBad} | first="${afterVal[0]?.supplierName}"`);
await p.$disconnect();