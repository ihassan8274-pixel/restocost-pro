import fs from 'fs';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const BOX = /[\u2500-\u257F]/; // box-drawing chars produced by UTF-8 bytes read as CP437

function countBad(obj, acc, pathStr) {
  if (typeof obj === 'string') { if (BOX.test(obj)) acc.push(pathStr + ' = ' + obj.slice(0, 50)); return; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => countBad(v, acc, `${pathStr}[${i}]`)); return; }
  if (obj && typeof obj === 'object') { for (const k of Object.keys(obj)) countBad(obj[k], acc, pathStr ? `${pathStr}.${k}` : k); }
}

(async () => {
  const rows = await p.kv.findMany();
  console.log('KV keys:', rows.length);
  for (const r of rows) {
    const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
    const acc = [];
    countBad(v, acc, '');
    if (acc.length) console.log(`  CORRUPT ${r.key}: ${acc.length} fields e.g. ${acc[0]}`);
  }

  // compare live grn ids/dates with newest clean backup
  const dir = 'E:/MASSOBI APP/NEW APP/server/backup-archive';
  const latest = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse()[0];
  const b = JSON.parse(fs.readFileSync(`${dir}/${latest}`, 'utf8'));
  const bGrn = (b.data || b).rcerp_grn;
  const live = await p.kv.findUnique({ where: { key: 'rcerp_grn' } });
  const lGrn = typeof live.value === 'string' ? JSON.parse(live.value) : live.value;
  const bIds = new Set(bGrn.map((r) => r.id));
  const lIds = new Set(lGrn.map((r) => r.id));
  const missing = [...bIds].filter((i) => !lIds.has(i));
  const extra = [...lIds].filter((i) => !bIds.has(i));
  console.log(`\nGRN live=${lGrn.length} backup=${bGrn.length} (${latest})`);
  console.log('  ids only in backup:', missing.length, missing.slice(0, 5));
  console.log('  ids only in live  :', extra.length, extra.slice(0, 5));
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });