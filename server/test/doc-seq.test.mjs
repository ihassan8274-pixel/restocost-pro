// server/test/doc-seq.test.mjs — تخصيص أرقام المستندات على الخادم.
// كانت الأرقام تُولّد في العميل من max+1 محلي: جهازان يكتبان في اللحظة نفسها
// فيأخذان الرقم نفسه (GRN-2026-0394 بمعرّفين، نفس المورّد والمبلغ). الخادم
// هنا يحجز تسلسًا تصاعدياً، فيكون التفرّد مضموناً.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteStore } from '../store.mjs';

const fresh = () => createSqliteStore(':memory:');

test('أول حجز يبدأ من 0001، ثم يزيد', () => {
  const s = fresh();
  assert.deepEqual(s.reserveDocNumbers('GRN', 1, 2026), ['GRN-2026-0001']);
  assert.deepEqual(s.reserveDocNumbers('GRN', 1, 2026), ['GRN-2026-0002']);
  assert.deepEqual(s.reserveDocNumbers('GRN', 3, 2026), ['GRN-2026-0003', 'GRN-2026-0004', 'GRN-2026-0005']);
});

test('حجز عدة دفعة واحدة يعطي أرقاماً متتابعة بلا فجوة', () => {
  const s = fresh();
  const nums = s.reserveDocNumbers('PO', 5, 2026);
  assert.equal(nums.length, 5);
  nums.forEach((n, i) => assert.equal(n, `PO-2026-${String(i + 1).padStart(4, '0')}`));
});

test('بادئات مختلفة لا تتقاطع', () => {
  const s = fresh();
  assert.equal(s.reserveDocNumbers('GRN', 1, 2026)[0], 'GRN-2026-0001');
  assert.equal(s.reserveDocNumbers('PO', 1, 2026)[0], 'PO-2026-0001');
  assert.equal(s.reserveDocNumbers('PR', 1, 2026)[0], 'PR-2026-0001');
});

test('سنوات مختلفة تسلسلات مستقلة', () => {
  const s = fresh();
  assert.equal(s.reserveDocNumbers('GRN', 1, 2026)[0], 'GRN-2026-0001');
  assert.equal(s.reserveDocNumbers('GRN', 1, 2027)[0], 'GRN-2027-0001');
  assert.equal(s.reserveDocNumbers('GRN', 1, 2026)[0], 'GRN-2026-0002');   // 2026 لم تتأثر
});

test('حجزان متتاليان لا يعيدان رقماً واحداً (العلة الأصلية)', () => {
  const s = fresh();
  const a = s.reserveDocNumbers('GRN', 1, 2026);
  const b = s.reserveDocNumbers('GRN', 1, 2026);
  assert.notEqual(a[0], b[0]);
});

test('حجز大批عة كبيرة (50) ثم صغير — لا تداخل', () => {
  const s = fresh();
  const big = s.reserveDocNumbers('GRN', 50, 2026);
  const small = s.reserveDocNumbers('GRN', 1, 2026);
  assert.equal(big.length, 50);
  assert.equal(small[0], 'GRN-2026-0051');
  assert.ok(!big.includes(small[0]));
});

test('seedDocSeqFromData يملأ من أعلى رقم في البيانات', () => {
  const s = fresh();
  s.setKV('rcerp_grn', [
    { id: 'g1', grnNumber: 'GRN-2026-0393', status: 'approved', branchId: 'b1', date: '2026-09-01', items: [] },
    { id: 'g2', grnNumber: 'GRN-2026-0394', status: 'approved', branchId: 'b1', date: '2026-09-01', items: [] },
  ]);
  s.seedDocSeqFromData('GRN');
  assert.equal(s.reserveDocNumbers('GRN', 1, 2026)[0], 'GRN-2026-0395');
});

test('seed يقرأ أرقام أوامر الشراء أيضاً (حقل مختلف)', () => {
  const s = fresh();
  s.setKV('rcerp_purchase_orders', [
    { id: 'p1', poNumber: 'PO-2026-0107', status: 'draft', branchId: 'b1', orderDate: '2026-09-01', items: [], totalAmount: 0, requestedBy: 'x' },
  ]);
  s.seedDocSeqFromData('PO');
  assert.equal(s.reserveDocNumbers('PO', 1, 2026)[0], 'PO-2026-0108');
});

test('seed على بادئة بلا بيانات ⇒ يبدأ من 1', () => {
  const s = fresh();
  s.seedDocSeqFromData('RET');
  assert.equal(s.reserveDocNumbers('RET', 1, 2026)[0], 'RET-2026-0001');
});