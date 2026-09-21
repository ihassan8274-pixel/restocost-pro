// server/test/paginate.test.mjs — الترقيم الخفيف بالنقطة (cursor) للمجموعات الكبيرة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCursor, encodeCursor, paginateCollection } from '../paginate.mjs';

const rows = Array.from({ length: 21 }, (_, i) => ({ id: `r${i}`, n: i }));

test('يقسّم كل القائمة عبر الصفحات بالـ cursor دون تكرار أو نقصان', () => {
  const ids = [];
  let cursor = null;
  let guard = 0;
  do {
    const p = paginateCollection(rows, cursor, 10);
    ids.push(...p.items.map((r) => r.id));
    cursor = p.nextCursor;
    guard++;
  } while (cursor && guard < 10);
  assert.deepEqual(ids, rows.map((r) => r.id));
});

test('يحترم حدّ الحجم (limit): سقف 2000، و0/فارغ يعيدان الافتراضي', () => {
  assert.equal(paginateCollection(rows, null, 10000).items.length, 21);
  assert.equal(paginateCollection(rows, null, 0).items.length, 21); // 0 → افتراضي 500
  assert.equal(paginateCollection(rows, null, -5).items.length, 1); // حد أدنى 1
});

test('قائمة فارغة تُرجع بدون nextCursor', () => {
  assert.deepEqual(paginateCollection([], null, 500), { items: [], total: 0, nextCursor: null, start: 0 });
});

test('cursor غير صالح يُعيد بهدوء إلى البداية', () => {
  assert.equal(paginateCollection(rows, 'not-a-cursor!!!', 5).items[0].id, 'r0');
});

test('الترحيل يبقى مستقراً عند حذف سجل قبل موضع آخر cursor', () => {
  const p1 = paginateCollection(rows, null, 10);
  assert.ok(p1.nextCursor);
  const shrunk = rows.filter((r) => r.id !== 'r0' && r.id !== 'r1');
  const p2 = paginateCollection(shrunk, p1.nextCursor, 10);
  assert.equal(p2.items[0].id, 'r10'); // لا تكرار ولا قفزة بسبب الحذف
  assert.equal(p2.start, 8); // أُعيد التموضع بمعرّف آخر سجل (r9) بعد حذف سجلين
});

test('encode/decode cursor دائري وآمن للقيم التالفة', () => {
  assert.deepEqual(decodeCursor(encodeCursor(7, { id: 'abc' })), { i: 7, id: 'abc' });
  assert.deepEqual(decodeCursor(''), { i: 0, id: null });
  assert.deepEqual(decodeCursor(null), { i: 0, id: null });
  assert.deepEqual(decodeCursor('!!!!'), { i: 0, id: null });
});