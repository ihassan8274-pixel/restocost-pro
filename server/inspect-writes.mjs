import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const tables = await p.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  console.log('TABLES:', tables.map(t => t.table_name).join(', '));

  try {
    const cl = await p.$queryRawUnsafe(`SELECT seq, key, op, ts FROM change_log WHERE key ILIKE '%grn%' ORDER BY seq DESC LIMIT 8`);
    console.log('\nchange_log (grn, newest first):');
    cl.forEach(r => console.log(`  seq=${r.seq} op=${r.op} key=${r.key} ts=${r.ts}`));
  } catch (e) { console.log('change_log query err:', e.message); }

  try {
    const newest = await p.$queryRawUnsafe(`SELECT seq, key, op, ts FROM change_log ORDER BY seq DESC LIMIT 6`);
    console.log('\nchange_log (newest overall):');
    newest.forEach(r => console.log(`  seq=${r.seq} op=${r.op} key=${r.key} ts=${r.ts}`));
  } catch (e) {}

  try {
    const au = await p.$queryRawUnsafe(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5`);
    console.log('\naudit_logs (newest):');
    au.forEach(r => console.log('  ' + JSON.stringify(r).slice(0, 200)));
  } catch (e) { console.log('audit_logs err:', e.message); }

  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });