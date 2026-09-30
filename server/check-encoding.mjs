import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const mojibake = /[ÃÂØÙÐÑï¿½\uFFFD]/;

function scan(label, arr, fields) {
  const bad = [];
  for (const r of arr) {
    for (const f of fields) {
      const v = r && r[f];
      if (typeof v === 'string' && (v.includes('\uFFFD') || /[ÃÂØÙ][\x80-\xBF]/.test(v))) {
        bad.push({ id: r.id, field: f, value: v.slice(0, 60) });
      }
    }
  }
  console.log(`${label}: total=${Array.isArray(arr) ? arr.length : 'n/a'} | mojibake=${bad.length}`);
  bad.slice(0, 5).forEach((b) => console.log('   BAD', JSON.stringify(b)));
  if (Array.isArray(arr) && arr[0]) {
    const sample = {};
    for (const f of fields) sample[f] = arr[0][f];
    console.log('   sample:', JSON.stringify(sample).slice(0, 200));
  }
}

(async () => {
  const sup = await p.kv.findUnique({ where: { key: 'rcerp_suppliers' } });
  const supArr = typeof sup.value === 'string' ? JSON.parse(sup.value) : sup.value;
  scan('rcerp_suppliers', supArr, ['name', 'nameAr', 'nameEn', 'contactPerson', 'address']);

  const grn = await p.kv.findUnique({ where: { key: 'rcerp_grn' } });
  const grnArr = typeof grn.value === 'string' ? JSON.parse(grn.value) : grn.value;
  scan('rcerp_grn', grnArr, ['supplierName', 'notes', 'receivedBy']);

  const rm = await p.kv.findUnique({ where: { key: 'rcerp_raw_materials' } });
  const rmArr = typeof rm.value === 'string' ? JSON.parse(rm.value) : rm.value;
  scan('rcerp_raw_materials', rmArr, ['name', 'nameAr', 'nameEn']);

  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });