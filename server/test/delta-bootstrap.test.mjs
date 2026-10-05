// server/test/delta-bootstrap.test.mjs — أساس /api/bootstrap?since=N
//
// كان المسار يستدعي store.getKvMeta وهو غير معرَّف إطلاقاً، فيعود null ⇒
// lastMod = 0 ⇒ `0 <= since` لكل since ≥ 0 ⇒ كل مفتاح يُتخطّى ⇒
// data فارغة دوماً في وضع delta. النتيجة: المزامنة التلقائية بين الأجهزة
// مكسورة بصمت — الجهاز يسأل "هل تغيّر شيء؟" فيستقبل فارغاً فيظنّ أنه لا جديد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteStore } from '../store.mjs';

// ⛔⛔⛔ كان هنا `await ensureStore()` — وهذا كان يكتب في الإنتاج.
//
// ما كان يحدث: store.mjs يحمّل server/.env تلقائياً عبر process.loadEnvFile،
// وفيه DATABASE_URL ⇒ hasPg() = true ⇒ الاختبار كان يتصل بـ PostgreSQL
// الإنتاجي على 127.0.0.1:5433 (قاعدة restocost2) ويكتب في change_log.
//
// الأثر المقيس: 35 تشغيلاً للاختبار = 245 صفاً في change_log الإنتاجي
// (cdcPush لكل setKV/deleteKV). الصفوف تُحذف من kv، لكن يبقى الأثر في
// سجل المزامنة — وهو ما تستخدمه الأجهزة في /api/bootstrap?since=N.
//
// ⭐ الآن: متجر معزول في الذاكرة. صفر اتصال، صفر كتابة، صفر تسريب.
const store = createSqliteStore(':memory:');

// ⭐ لا يعتمد على rcerp_inventory الموجود في الإنتاج
//    (kvSeq هي Map داخل المتجر المعزول — تبدأ فارغة)
test('مفتاح لم يُكتب بعد ⇒ null (يُرسل كاملاً لا delta)', () => {
  assert.equal(store.getKvMeta('rcerp_key_never_written_zzz'), null);
});

test('بعد كتابة مفتاح، getKvMeta يعيد seq صحيحاً', () => {
  const before = store.getKvMeta('rcerp_inventory');
  const seqBefore = before ? before.seq : 0;
  store.setKV('rcerp_test_delta_key', [{ id: 'a', qty: 1 }]);
  const meta = store.getKvMeta('rcerp_test_delta_key');
  assert.ok(meta, 'meta must exist after write');
  assert.equal(typeof meta.seq, 'number');
  assert.ok(meta.seq > seqBefore, 'seq must advance');
  assert.equal(meta.lastModified, meta.seq);
  store.deleteKV('rcerp_test_delta_key');
});

test('تعديل لاحق يرفع seq (الفهرس لا يتجمّد)', () => {
  store.setKV('rcerp_test_delta_key2', [{ id: 'a', qty: 1 }]);
  const s1 = store.getKvMeta('rcerp_test_delta_key2').seq;
  store.setKV('rcerp_test_delta_key2', [{ id: 'a', qty: 2 }]);
  const s2 = store.getKvMeta('rcerp_test_delta_key2').seq;
  assert.ok(s2 > s1, 'second write must raise seq');
  store.deleteKV('rcerp_test_delta_key2');
});

test('semantics: lastModified <= since يعني "لا تغيير بعد العلامة"', () => {
  store.setKV('rcerp_test_delta_key3', [{ id: 'x', qty: 1 }]);
  const meta = store.getKvMeta('rcerp_test_delta_key3');
  // since = seq ⇒ يُتخطّى (لا تغيير بعد العلامة المائية)
  assert.ok(meta.lastModified <= meta.seq);
  // since أقل ⇒ يُرسل
  assert.ok(meta.lastModified > meta.seq - 1);
  store.deleteKV('rcerp_test_delta_key3');
});