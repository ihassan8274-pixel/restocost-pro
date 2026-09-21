// server/test/shrink.test.mjs — حماية "الكتابة فوق المختصرة" (نمط بيانات تجريبية).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRejectShrink, mergeById } from '../mergeCore.mjs';

// مجموعة كبيرة (محتوى حقيقي)
const bigExisting = (n = 2000) =>
  Array.from({ length: n }, (_, i) => ({ id: `r-${i}`, name: `صنف ${i}`, qty: i * 3.7, notes: 'بيانات حقيقية مخزنة' }));

test('الوارد الصغير جداً على مجموعة كبيرة → يُرفض (shrink-overwrite-guard)', () => {
  const reject = shouldRejectShrink(bigExisting(), [{ id: 'r-0', name: 'تجربة' }]);
  assert.ok(reject);
  assert.equal(reject.reason, 'shrink-overwrite-guard');
});

test('مجموعة محادثة كبيرة/معقولة → مقبولة بلا حماية', () => {
  assert.equal(shouldRejectShrink(bigExisting(), bigExisting()), null);
  // وارد كبير بحجم مقارب لحجم المجموعة السابقة (لا توجد مصلحة مالية في رفضه)
  assert.equal(shouldRejectShrink(bigExisting(), bigExisting(1500)), null);
  // وارد لا يقل عن 500 بايت — قارب العتبة السفلية لكنه فوقها فلا يُرفض
  assert.equal(shouldRejectShrink(bigExisting(), Array.from({ length: 60 }, (_, i) => ({ id: `x-${i}`, name: `صنف مكرر ${i}`, note: 'نبضة تدقيق' }))), null);
});

test('لا رفض عندما لا توجد بيانات سابقة', () => {
  assert.equal(shouldRejectShrink(null, [{ id: 'a' }]), null);
  assert.equal(shouldRejectShrink(undefined, [{ id: 'a' }]), null);
});

test('لا رفض لمجموعة صغيرة أصلاً (بدون حماية عند صغر الحجم الأصلي)', () => {
  assert.equal(shouldRejectShrink([{ id: 'a', name: 'صغير' }], [{ id: 'a' }]), null);
});

test('محتوى فارغ فوق مجموعة كبيرة → يُرفض (مسح من نسخة تجريبية هو أخطر الأنماط)', () => {
  const r1 = shouldRejectShrink(bigExisting(), []);
  assert.ok(r1);
  assert.equal(r1.reason, 'shrink-overwrite-guard');
  const r2 = shouldRejectShrink(bigExisting(), null);
  assert.ok(r2?.inLen >= 0);
});

test('الاستثناءات لا تكسر الحماية — تُرجع null بأمان', () => {
  assert.equal(shouldRejectShrink(Symbol('boom'), null), null);
});

// --- إضافات دمج: شاهد الحذف + تنقيته من مجموعات أخرى (يمارس نفس سلوك المسار) ---
test('شاهد الحذف يُنقي السجل المحذوف من أي مجموعة مجاورة (تنقية فورية)', () => {
  const tomb = new Set(['dead-1', 'dead-2']);
  const out = mergeById(
    [{ id: 'dead-1' }, { id: 'dead-2' }, { id: 'alive' }],
    [{ id: 'dead-1' }, { id: 'alive' }],
    tomb,
  );
  assert.deepEqual(out.map((r) => r.id), ['alive']);
});

test('الدمج بالمعرّف لا يعيد سجلًّا محذوفاً حتى لو دفعه جهاز قديم مع تعديلات', () => {
  const tomb = new Set(['gone']);
  const out = mergeById([], [{ id: 'gone', name: 'عودة مُجرَّبة', _mtime: 999 }], tomb);
  assert.equal(out.length, 0);
});

test('الدمج الجديد: لا يطمس سجلات جهاز آخر — السجلات المجاورة تبقى', () => {
  const out = mergeById(
    [{ id: 'a', n: 1 }, { id: 'b', n: 2 }],
    [{ id: 'a', n: 9 }],
  );
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.id === 'b').n, 2);
  assert.equal(out.find((r) => r.id === 'a').n, 9);
});