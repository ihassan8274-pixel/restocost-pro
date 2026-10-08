import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarizeChange, summarizeDelete } from '../src/modules/utils/collection-audit.js';

// ── لماذا diff لا تسجيل_كل_طلب ──
// نقطة الكتابة تُستدعى عند كل مزامنة. لو سجّلنا كل طلب، امتلأ السجل بضجيج
// وتوقّف المشرف عن فتحه — وهو أسوأ من فراغه. الاختبار الأول يحرس هذا.

// المزامنة المتكررة بلا جديد يجب ألا تنتج سطراً واحداً
test('إعادة دفع نفس البيانات لا تُنتج تدقيقاً (المزامنة ليست حدثاً)', () => {
  const rows = [
    { id: 'grn-1', grnNumber: 'GRN-1', totalAmount: 100 },
    { id: 'grn-2', grnNumber: 'GRN-2', totalAmount: 200 },
  ];
  assert.equal(summarizeChange({ key: 'rcerp_grn', before: rows, after: rows }), null);
});

test('سجل جديد بلا مبلغ يُسجَّل بنوع DATA_WRITE', () => {
  const r = summarizeChange({
    key: 'rcerp_branches',
    before: [],
    after: [{ id: 'b1', nameAr: 'فرع الرياض' }],
  });
  assert.equal(r.action, 'DATA_WRITE');
  assert.match(r.detail, /rcerp_branches/);
  assert.match(r.detail, /جديد 1/);
});

test('سجل جديد بمبلغ يُسجَّل المبلغ نفسه — مَن أضاف وكم', () => {
  const r = summarizeChange({
    key: 'rcerp_grn',
    before: [],
    after: [{ id: 'grn-9', totalAmount: 1250.5 }],
  });
  assert.match(r.detail, /بمبالغ/);
  assert.match(r.detail, /grn-9=1250\.5/);
});

test('تغيير مبلغ على سجل قائم هو أخطر حالة — تُبرز قبل وبعد', () => {
  const r = summarizeChange({
    key: 'rcerp_grn',
    before: [{ id: 'grn-1', totalAmount: 100 }],
    after: [{ id: 'grn-1', totalAmount: 10000 }],
  });
  assert.equal(r.action, 'DATA_MONEY_EDIT');
  assert.match(r.detail, /100 ← 10000/);
  assert.match(r.detail, /تعديل مبلغ 1/);
});

test('تعديل حقل غير مالي لا يُسجَّل — لا ضجيج', () => {
  const r = summarizeChange({
    key: 'rcerp_grn',
    before: [{ id: 'grn-1', notes: 'ملاحظة', totalAmount: 100 }],
    after: [{ id: 'grn-1', notes: 'ملاحظة معدّلة', totalAmount: 100 }],
  });
  assert.equal(r, null);
});

test('تغيير قيمة داخل حقل مبلغ يُسجَّل — لا يمكن إخفاؤه', () => {
  const r = summarizeChange({
    key: 'rcerp_grn',
    before: [{ id: 'grn-1', totalAmount: 100 }],
    after: [{ id: 'grn-1', totalAmount: 700 }],
  });
  assert.equal(r.action, 'DATA_MONEY_EDIT');
});

test('الحذف من مجموعة لا يُحسب هنا — له مسار rcerp_deleted_ids', () => {
  // لو حُسب الحذف هنا لامتلأ السجل بـ«حذف» كاذب من فرط الاحتفاظ كل يوم
  const r = summarizeChange({
    key: 'rcerp_inventory_movements',
    before: [{ id: 'm1', amount: 10 }, { id: 'm2', amount: 20 }],
    after: [{ id: 'm1', amount: 10 }],
  });
  assert.equal(r, null, 'اختفاء سجل ليس حدثاً هنا');
});

test('مقارنة نصية بحقل مبلغ لا تُنتج سطراً — قفزة واحدة فقط', () => {
  // نص ← نص ليس تغيّراً مالياً؛ الحارس يحوّل النص قبل هذه النقطة
  const r = summarizeChange({
    key: 'rcerp_grn',
    before: [{ id: 'g1', totalAmount: 'حرّة' }],
    after: [{ id: 'g1', totalAmount: 'نص آخر' }],
  });
  assert.equal(r, null);
});

test('عدد كبير يُختصر بالعدد ولا يُقطع بلا نهاية', () => {
  const after = Array.from({ length: 40 }, (_, i) => ({ id: `id-${i}`, totalAmount: 10 }));
  const r = summarizeChange({ key: 'rcerp_grn', before: [], after });
  assert.match(r.detail, /جديد 40/);
  // لا تُدرج 40 معرّفاً كاملاً في سطر واحد
  const listed = (r.detail.match(/id-/g) || []).length;
  assert.ok(listed <= 12, `عدد المعرّفات المُدرجة ${listed} — يجب ألا يتجاوز 12`);
});

test('معدّل بين تعديل وجديد معاً', () => {
  const r = summarizeChange({
    key: 'rcerp_grn',
    before: [{ id: 'old', totalAmount: 10 }],
    after: [{ id: 'old', totalAmount: 99 }, { id: 'new', totalAmount: 5 }],
  });
  assert.match(r.detail, /جديد 1/);
  assert.match(r.detail, /تعديل مبلغ 1/);
});

test('مدخلات ليست مصفوفات → null بلا رمي', () => {
  assert.equal(summarizeChange({ key: 'k', before: null, after: [] }), null);
  assert.equal(summarizeChange({ key: 'k', before: [], after: undefined }), null);
});

test('سجل بلا معرّف يُتجاهل بصمت (الحارس يُسقطه قبل هذه النقطة)', () => {
  const r = summarizeChange({ key: 'k', before: [], after: [{ totalAmount: 5 }, { id: 'ok', totalAmount: 5 }] });
  assert.match(r.detail, /جديد 1/);
});

test('حذف نهائي — سطر مستقل باسم الإجراء', () => {
  const r = summarizeDelete({ key: 'rcerp_grn', ids: ['grn-1', 'grn-2'] });
  assert.equal(r.action, 'DATA_DELETE');
  assert.match(r.detail, /حذف نهائي 2/);
  assert.match(r.detail, /grn-1/);
});

test('حذف بلا معرّفات → null', () => {
  assert.equal(summarizeDelete({ key: 'rcerp_grn', ids: [] }), null);
  assert.equal(summarizeDelete({ key: 'rcerp_grn', ids: null }), null);
});

// ── هل التدقيق موصول فعلاً؟ ──
// دالة ممتازة لا تفيد شيئاً إن لم تُستدعَ. قبل هذا الاختبار كان كل بيانات
// الأعمال تُعدَّل بلا أثر — وهذا يمنع عودة ذلك.
test('التدقيق موصول بنقطة الكتابة، وعلى مسارَي الدمج والاستبدال', () => {
  const src = fs.readFileSync(new URL('../routes/data.mjs', import.meta.url), 'utf8');
  assert.ok(
    /import\s*\{[^}]*\bsummarizeChange\b[^}]*\}\s*from\s*'\.\.\/src\/modules\/utils\/collection-audit\.js'/.test(src),
    'data.mjs لا يستورد summarizeChange — التدقيق غير موصول',
  );
  // يجب أن يُستدعى على مسار الدمج (after: retained) وعلى مسار الاستبدال
  const calls = [...src.matchAll(/summarizeChange\(\{ key, before: existingArr, after: (\w+) \}\)/g)];
  assert.ok(calls.length >= 2, `عدد الاستدعاءات ${calls.length} — يجب أن يغطي مسارَي الدمج والاستبدال`);
  // الحذف النهائي يُسجَّل أيضاً
  assert.ok(/summarizeDelete\(\{ key, ids: validIncoming \}\)/.test(src), 'الحذف النهائي لا يُسجَّل');
  // الاستدعاء قبل الرد على العميل (لا تدقيق بعد الإرسال)
  const auditIdx = src.indexOf('store.writeAudit');
  const resIdx = src.indexOf('res.json({ ok: true, rejectedIds');
  assert.ok(auditIdx > 0 && resIdx > 0 && auditIdx < resIdx, 'التدقيق يجب أن يسبق الرد');
});

test('حذف كبير يُختصر', () => {
  const ids = Array.from({ length: 30 }, (_, i) => `x${i}`);
  const r = summarizeDelete({ key: 'rcerp_grn', ids });
  assert.match(r.detail, /حذف نهائي 30/);
  assert.ok((r.detail.match(/x\d/g) || []).length <= 12);
});
