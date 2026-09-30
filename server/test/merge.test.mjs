// server/test/merge.test.mjs — الوحدة الجوهرية للمزامنة: دمج المجموعات بالأحدثية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeById, mtimeOf } from '../mergeCore.mjs';

const grnApproved = (id, mtime) => ({ id, code: `GRN-${id}`, status: 'approved', _mtime: mtime });
const grnSubmitted = (id, mtime) => ({ id, code: `GRN-${id}`, status: 'submitted', _mtime: mtime });

test('سجل جديد يُضاف مع الحفاظ على الموجود', () => {
  const out = mergeById([grnApproved('a', 10)], [grnSubmitted('b', 5)]);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.id === 'a').status, 'approved');
  assert.equal(out.find((r) => r.id === 'b').status, 'submitted');
});

test('الاعتماد الأحدث لا يُرجع للمراجعة بنسخة قديمة (أصل إصلاح العطل)', () => {
  // جهاز B قديم يدفع "قيد المراجعة" بعد أن اعتمد جهاز A — يجب أن يبقى معتمداً.
  const serverHas = [grnApproved('x', 200)];
  const staleIncoming = [grnSubmitted('x', 100)];
  const out = mergeById(serverHas, staleIncoming);
  assert.equal(out[0].status, 'approved');
  assert.equal(mtimeOf(out[0]), 200);
});

test('الكاتب الأحدث لنفس السجل يفوز (تعديل صحيح جديد)', () => {
  const serverHas = [grnSubmitted('x', 100)];
  const newerIncoming = [grnApproved('x', 300)];
  const out = mergeById(serverHas, newerIncoming);
  assert.equal(out[0].status, 'approved');
  assert.equal(mtimeOf(out[0]), 300);
});

test('بيانات قديمة دون _mtime: الوارد يفوز كما كان سابقاً', () => {
  const out = mergeById([{ id: 'x', status: 'approved' }], [{ id: 'x', status: 'submitted' }]);
  assert.equal(out[0].status, 'submitted');
});

test('وارد قديم دون _mtime لا ينحدر فوق سجل مختوم حديثاً', () => {
  const out = mergeById([grnApproved('x', 250)], [{ id: 'x', status: 'submitted' }]);
  assert.equal(out[0].status, 'approved');
});

test('سجل جديد مختوم يُحدّث قديماً غير مختوم', () => {
  const out = mergeById([{ id: 'x', status: 'submitted' }], [grnApproved('x', 250)]);
  assert.equal(out[0].status, 'approved');
});

test('تساوي _mtime: الوارد يفوز بلا تذبذب (ثبات السلوك)', () => {
  const out = mergeById([grnApproved('x', 10), grnSubmitted('y', 7)], [grnSubmitted('x', 10), grnApproved('y', 7)]);
  assert.equal(out.find((r) => r.id === 'x').status, 'submitted');
  assert.equal(out.find((r) => r.id === 'y').status, 'approved');
});

test('شاهد الحذف: السجل المُحذوف لا يعود حتى لو حاول جهاز آخر دفعه', () => {
  const tomb = new Set(['dead']);
  const out = mergeById([{ id: 'dead', status: 'approved' }], [{ id: 'dead', status: 'approved' }, { id: 'alive', status: 'submitted' }], tomb);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'alive');
});

test('سجلات مجاورة غير متعارضة تُحفظ كما هي (لا مساس بغير المتضارب)', () => {
  const serverHas = [grnApproved('x', 100), grnApproved('y', 90)];
  const staleIncoming = [grnSubmitted('x', 50)];
  const out = mergeById(serverHas, staleIncoming);
  assert.equal(out.find((r) => r.id === 'y').status, 'approved');
});

test('سلسلة تاريخية (أشهر الإغلاق): الوارد يُضاف بالاتحاد ولا يُحذف من الموجود', () => {
  const out = mergeById(['2025-01', '2025-03'], ['2025-03', '2025-07']);
  assert.deepEqual(out, ['2025-01', '2025-03', '2025-07']);
});

test('مصفوفة بدائية فارغة تتقبل الوارد (النشأة الأولى)', () => {
  assert.deepEqual(mergeById([], ['2026-01']), ['2026-01']);
  assert.deepEqual(mergeById(null, ['2026-01']), ['2026-01']);
});

test('سجلات كائنات لا تتأثر بمسار البدائي', () => {
  const out = mergeById([grnApproved('a', 10)], [grnSubmitted('b', 5)]);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.id === 'b').status, 'submitted');
});

test('أرقام بدائية تُدمج بالاتحاد مع إزالة المكرر', () => {
  assert.deepEqual(mergeById([1, 2, 3], [3, 4]), [1, 2, 3, 4]);
});