// server/test/register-mode.test.mjs — مسار إنشاء الحسابات ومنع تصعيد الصلاحيات.
//
// registrations ليست كلها سواسية: زائر يسجّل نفسه، ومسؤول النظام ينشئ موظفاً.
// الخلط بين المسارين يسمح لأي موظف بطلب دور "admin" فتصعد موافقته صلاحيته.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRegisterMode } from '../routes/auth.mjs';

test('أول حساب في نظام فارغ → مدير بلا جلسة (تهيئة أولى)', () => {
  assert.equal(resolveRegisterMode({ userCount: 0, voterRole: undefined }), 'first-admin');
});

test('مسؤول النظام ينشئ حساباً نشطاً بالدور المُمرَّر', () => {
  assert.equal(resolveRegisterMode({ userCount: 3, voterRole: 'admin' }), 'activate');
});

test('الزائر يسجّل طلباً بانتظار التفعيل لا حساباً نشطاً', () => {
  assert.equal(resolveRegisterMode({ userCount: 3, voterRole: undefined }), 'pending');
});

// الثغرة: أي جلسة موجودة كانت تتجاوز مسار الموافقة وتُنشئ حساباً نشطاً.
for (const role of ['counter', 'storekeeper', 'waiter', 'chef', 'branch_manager', 'cost_controller', 'executive']) {
  test(`جلسة دور ${role} لا تنشئ حساباً نشطاً — طلب بانتظار التفعيل`, () => {
    assert.equal(resolveRegisterMode({ userCount: 5, voterRole: role }), 'pending');
  });
}

test('الدور admin وحده يفعّل الحساب مباشرة بعد التهيئة', () => {
  for (const voterRole of [undefined, null, '', 'admin', ...['counter', 'waiter', 'executive']]) {
    const expected = voterRole === 'admin' ? 'activate' : 'pending';
    assert.equal(resolveRegisterMode({ userCount: 5, voterRole }), expected, `voterRole=${voterRole}`);
  }
});
