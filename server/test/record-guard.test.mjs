import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeRecords, moneyKeyCount } from '../record-guard.mjs';

// ── هل الحارس موصول فعلاً؟ ──
// دالة ممتازة لا تفيد شيئاً إن لم تُستدعَ. هذا الاختبار يمنع أن becomes
// الحارس كوداً ميّتاً: يحرس الاستيراد، وموضع الاستدعاء قبل الدمج.
test('الحارس موصول بنقطة الكتابة، وقبل الدمج لا بعده', () => {
  const src = fs.readFileSync(new URL('../routes/data.mjs', import.meta.url), 'utf8');
  assert.ok(
    /import\s*\{[^}]*\bsanitizeRecords\b[^}]*\}\s*from\s*'\.\.\/record-guard\.mjs'/.test(src),
    'data.mjs لا يستورد sanitizeRecords — الحارس غير موصول',
  );
  const callIdx = src.indexOf('sanitizeRecords(incomingData)');
  const mergeIdx = src.indexOf('mergeById(existingArr, incomingData');
  assert.ok(callIdx > 0, 'لا يوجد استدعاء لـ sanitizeRecords');
  assert.ok(mergeIdx > 0, 'لم يُعثر على الدمج — تغيّر الكود راجع الاختبار');
  assert.ok(callIdx < mergeIdx, 'الحارس يجب أن يعمل قبل الدمج، وإلا دخل الفاسد المخزن');
});

// ── لماذا هذه الاختبارات ──
// كل حالة هنا كانت ثغرة أو عطلاً فعلياً. الاختبار يحرس السلوك حتى لا
// يعود أحدهم ليُضعف الحارس ويعتقد أنه تحسين.

test('مبلغ قادم نصاً يُحوَّل رقماً — علة "5000" + 100 = "500010"', () => {
  const { clean, coerced } = sanitizeRecords([{ id: 'a', totalAmount: '5000' }]);
  assert.equal(clean[0].totalAmount, 5000);
  assert.equal(clean[0].totalAmount + 100, 5100, 'الجمع يجب أن يكون حساباً لا لصقاً');
  assert.equal(coerced, 1);
});

test('لصق نصوص لا يشبه المبلغ لا يُحوَّل — الرقم الفارغ ليس صفراً', () => {
  // Number('') = 0 و Number(' ') = 0: تحويلهما يجعل حقلاً فارغاً يبدو مبلغاً
  const { clean, coerced } = sanitizeRecords([{ id: 'a', total: '', cost: '   ' }]);
  assert.equal('total' in clean[0], false);
  assert.equal('cost' in clean[0], false);
  assert.equal(coerced, 0);
});

test('السالب والعلامة العشرية الصفرية تُقبل', () => {
  const { clean } = sanitizeRecords([{ id: 'a', amount: '-150.5', price: '.75', total: '12.00' }]);
  assert.equal(clean[0].amount, -150.5);
  assert.equal(clean[0].price, 0.75);
  assert.equal(clean[0].total, 12);
});

test('مفتاح __proto__ يُسقَط — منع تلويث النماذج الأولية', () => {
  const payload = JSON.parse('{"id":"x","totalAmount":10,"__proto__":{"polluted":true}}');
  const { clean } = sanitizeRecords([payload]);
  // ملاحظة: 'x' in obj ليست دليلاً — __proto__ موجود على Object.prototype دائماً.
  // الفحص الصحيح بالملكية الخاصة وحدها.
  assert.equal(Object.hasOwn(clean[0], '__proto__'), false);
  assert.equal(clean[0].polluted, undefined);
  assert.equal({}.polluted, undefined, 'Object.prototype يجب أن يبقى نظيفاً');
});

test('constructor و prototype يُسقطان أيضاً', () => {
  const payload = JSON.parse('{"id":"x","constructor":{"a":1},"prototype":{"b":2}}');
  const { clean } = sanitizeRecords([payload]);
  assert.equal(Object.hasOwn(clean[0], 'constructor'), false);
  assert.equal(Object.hasOwn(clean[0], 'prototype'), false);
  assert.equal(clean[0].id, 'x', 'بقية السجل تُحفظ سليمة');
});

test('سجل بلا معرّف يُسقَط ويُبلَّغ — لا يختفي بصمت', () => {
  const { clean, rejected } = sanitizeRecords([{ totalAmount: 10 }, { id: 'ok', totalAmount: 20 }]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].id, 'ok');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'missing-id');
});

test('معرّف فارغ أو null لا يُقبل معرّفاً', () => {
  const { clean, rejected } = sanitizeRecords([{ id: '', v: 1 }, { id: null, v: 2 }]);
  assert.equal(clean.length, 0);
  assert.equal(rejected.every((r) => r.reason === 'missing-id'), true);
});

test('نص داخل مصفوفة سجلات يُسقَط — كان يُسقطه الدمج ثم ينهار العرض', () => {
  const { clean, rejected } = sanitizeRecords(['ليس سجلاً', { id: 'a', v: 1 }]);
  assert.equal(clean.length, 1);
  assert.equal(rejected[0].reason, 'not-an-object');
});

test('مصفوفة قيم بدائية تمرّ كما هي (الأدوار، الشهور المغلقة)', () => {
  const roles = ['مدير', 'شيف', 'كاشير'];
  const { clean, rejected } = sanitizeRecords(roles);
  assert.deepEqual(clean, roles);
  assert.equal(rejected.length, 0);
});

test('خلط القيم البدائية بسجلات: البدائية تُبلَّغ ولا تُفسد السجل', () => {
  const { clean, rejected } = sanitizeRecords(['نص', { id: 'a', v: 1 }]);
  assert.deepEqual(clean, [{ id: 'a', v: 1 }]);
  assert.equal(rejected.length, 1);
});

test('قيمة منطقية أو كائن في حقل مبلغ يُسقَط الحقل ولا يُسقط السجل', () => {
  // رفض السجل الكامل كان سيمسح مستند استلام بأصنافه كلها بسبب حقل واحد
  const { clean, rejected } = sanitizeRecords([
    { id: 'a', totalAmount: true, cost: { v: 1 }, unitPrice: [5], id2: 'ok', branchId: 'b1' },
  ]);
  assert.equal(clean.length, 1, 'السجل يبقى');
  assert.equal(clean[0].branchId, 'b1', 'الحقول السليمة تبقى');
  assert.equal(rejected.length, 0, 'ليس رفضاً — تطبيع');
  for (const k of ['totalAmount', 'cost', 'unitPrice']) {
    assert.equal(k in clean[0], false, `${k} يجب أن يُسقط`);
  }
});

test('قيم المال غير المنتهية تُسقَط (لا NaN ولا ما لا نهاية)', () => {
  const { clean } = sanitizeRecords([
    { id: 'a', totalAmount: Number.POSITIVE_INFINITY, cost: Number.NaN, price: 10 },
  ]);
  assert.equal('totalAmount' in clean[0], false);
  assert.equal('cost' in clean[0], false);
  assert.equal(clean[0].price, 10);
});

test('الحقول غير المالية لا تُمسّ — النصوص والتواريخ والأعلام', () => {
  const rec = {
    id: 'g1',
    grnNumber: 'GRN-1001',
    date: '2026-10-06',
    branchId: 'b1',
    isPosted: false,
    notes: 'ملاحظة حرّة',
    items: [{ rawMaterialId: 'r1', quantity: 5 }],
    totalAmount: '250.75',
  };
  const { clean } = sanitizeRecords([rec]);
  assert.equal(clean[0].grnNumber, 'GRN-1001');
  assert.equal(clean[0].date, '2026-10-06');
  assert.equal(clean[0].isPosted, false, 'القيم المنطقية غير المالية تُحفظ');
  assert.equal(clean[0].notes, 'ملاحظة حرّة');
  assert.deepEqual(clean[0].items, [{ rawMaterialId: 'r1', quantity: 5 }], 'العناصر_array تُحفظ كما هي');
  assert.equal(clean[0].totalAmount, 250.75);
});

test('المدخل ليس مصفوفة → يمرّ كما هو بلا معالجة', () => {
  const obj = { settings: true };
  assert.equal(sanitizeRecords(obj).clean, obj);
});

test('المعرّف الرقمي أو غير النصي يبقى كما هو — لا نغيّر نظام المفاتيح', () => {
  const { clean } = sanitizeRecords([{ id: 42, v: 1 }]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].id, 42);
});

test('عدد حقول المال محصور — اتساع القائمة يعني تلطيخاً عَرَضياً', () => {
  assert.ok(moneyKeyCount() > 10 && moneyKeyCount() < 60,
    `عدد حقول المال ${moneyKeyCount()} — راجع القائمة`);
});

test('دفعة كبيرة مختلطة: الصالح يمرّ كاملاً والفاسد وحده يُسقَط', () => {
  const batch = [
    { id: 'a', totalAmount: '10' },
    'نص',
    { totalAmount: 10 },
    { id: 'b', totalAmount: 20 },
    { id: 'c', totalAmount: 'حرّة' },
    { id: 'd', totalAmount: 30 },
  ];
  const { clean, rejected } = sanitizeRecords(batch);
  // 'c' يبقى: حقله المالي غير رقمي فيُسقط الحقل وحده — رفض السجل كان سيمحو
  // مستنداً كاملاً بسبب حقل واحد. الفرق بين التطبيع والرفض هو جوهر التصميم.
  assert.deepEqual(clean.map((r) => r.id), ['a', 'b', 'c', 'd']);
  assert.equal(rejected.length, 2, 'لا يُرفض شيء بدل التصفية: نص بلا سجل، وسجل بلا معرّف');
  assert.deepEqual(rejected.map((r) => r.reason), ['not-an-object', 'missing-id']);
  const c = clean.find((r) => r.id === 'c');
  assert.equal('totalAmount' in c, false, 'الحقل غير الرقمي يُسقط');
});
