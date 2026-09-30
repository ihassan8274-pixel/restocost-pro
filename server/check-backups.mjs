import fs from 'fs';
import path from 'path';

const dir = 'E:/MASSOBI APP/NEW APP/server/backup-archive';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse();

const isBad = (s) => typeof s === 'string' && /[\u2500-\u257F]|[\u00C0-\u00FF][\u0080-\u00BF]/.test(s);

for (const f of files.slice(0, 12)) {
  let json;
  try { json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { console.log(f, 'PARSE_FAIL', e.message); continue; }
  const data = json.data || json;
  const grn = data.rcerp_grn;
  let first = '', badCount = 0, dateMax = '';
  if (Array.isArray(grn)) {
    first = grn[0]?.supplierName ?? '';
    badCount = grn.filter((r) => isBad(r?.supplierName)).length;
    dateMax = grn.map((r) => r?.date || r?.createdAt || '').sort().slice(-1)[0];
  }
  console.log(`${f} | grn=${Array.isArray(grn) ? grn.length : 'n/a'} | badSupplierName=${badCount} | maxDate=${dateMax} | first="${first}"`);
}