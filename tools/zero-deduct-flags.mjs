// تصفير بصمة rawMaterialsDeducted على سجلات المبيعات المجمّعة.
//
// لماذا هو تصحيح وليس تجميلياً: دفتر الحركات فيه **صفر** حركة باسم
// «خصم مبيعات»، بينما 203 سجلاً يدّعي أنها خُصمت. البصمة ادّعاء لا واقعة،
// فتصفيرها يطابق السجل مع الدفتر.
//
// الخطر المرصود: العميل يحتفظ بنسخة محلية قديمة. mergeById يختار الأحدث
// بالـ_mtime — فلو لم نرفع _mtime لدفع العميل نسخته فوقنا وأعاد البصمة.
//
// ⚠️ يكتب نسخة احتياطية قبل أي تعديل. للتشغيل:
//     node tools/zero-deduct-flags.mjs --dry     معاينة فقط
//     node tools/zero-deduct-flags.mjs --apply    تنفيذ فعلي
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env', 'utf8');
const url = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: url });
await client.connect();

const KEY = 'rcerp_batch_sales';
const r = await client.query('SELECT value FROM kv WHERE key = $1', [KEY]);
const recs = Array.isArray(r.rows[0].value) ? r.rows[0].value : JSON.parse(r.rows[0].value);

const flagged = recs.filter((x) => x && x.rawMaterialsDeducted === true);
const untouched = recs.filter((x) => !x || x.rawMaterialsDeducted !== true);

console.log(`السجلات: ${recs.length}`);
console.log(`بصمة true (ستُصفَّر): ${flagged.length}`);
console.log(`بصمة غير true (تُترك): ${untouched.length}`);

if (flagged.length === 0) { console.log('لا شيء للعمل.'); await client.end(); process.exit(0); }

// ── نسخة احتياطية (قبل أي كتابة) ────────────────────────────────────────
if (!existsSync('backups')) mkdirSync('backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `backups/${KEY}__${stamp}.json`;
writeFileSync(backupPath, JSON.stringify(recs, null, 2), 'utf8');
console.log(`\nنسخة احتياطية: ${backupPath}  (${recs.length} سجل)`);

if (!APPLY) {
  console.log('\n--dry: لم يُكتب شيء. أضف --apply للتنفيذ.');
  const sample = flagged.slice(0, 4).map((x) => `  ${x.batchNumber}  ${x.date}  ${x.branchName || x.branchId}  (${x._mtime})`);
  console.log('عيّنة:\n' + sample.join('\n'));
  await client.end();
  process.exit(0);
}

// ── التنفيذ: تصفير + رفع _mtime ─────────────────────────────────────────
const now = Date.now();
let changed = 0;
for (const rec of recs) {
  if (!rec || rec.rawMaterialsDeducted !== true) continue;
  rec.rawMaterialsDeducted = false;   // لا نحذف المفتاح: يطابق ما يكتبه الكود الجديد
  rec._mtime = now;                   // الأحدث يفوز في الدمج
  changed++;
}

await client.query('UPDATE kv SET value = $1::jsonb WHERE key = $2', [JSON.stringify(recs), KEY]);
console.log(`\nعُدّل ${changed} سجل، ورُفع _mtime إلى ${now}`);

// ── التحقق ─────────────────────────────────────────────────────────────
const v = await client.query('SELECT value FROM kv WHERE key = $1', [KEY]);
const after = Array.isArray(v.rows[0].value) ? v.rows[0].value : JSON.parse(v.rows[0].value);
const stillTrue = after.filter((x) => x && x.rawMaterialsDeducted === true).length;
console.log(`تحقّق: ${after.length} سجل، ما زال true = ${stillTrue}  ${stillTrue === 0 ? '✓' : '✗'}`);
console.log(`مثال بعد التعديل: ${JSON.stringify({ batchNumber: after.find(x => x.batchNumber === flagged[0].batchNumber)?.batchNumber, rawMaterialsDeducted: after.find(x => x.batchNumber === flagged[0].batchNumber)?.rawMaterialsDeducted })}`);

await client.end();