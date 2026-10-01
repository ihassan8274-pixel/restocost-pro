// server/test/broadcast-sanitize.test.mjs — تعرية الأسرار عند بث rcerp_users.
//
// أي مسار يقرأ من KV ويكتب استجابة للمتصفح يجب أن يمرّ بـ sanitizeCollectionForBroadcast
// وإلا تسريب هاشات كلمات المرور وأسرار TOTP عبر مسار جديد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCollectionForBroadcast } from '../sanitize.mjs';

const userRow = (over = {}) => ({
  id: 'u1',
  name: 'مدير',
  email: 'a@b.com',
  role: 'admin',
  passwordHash: '$2b$10$supersecret',
  passwordHistory: [{ hash: '$2b$10$old' }],
  totpSecret: 'JBSWY3DPEHPK3PXP',
  ...over,
});

test('صفحة rcerp_users لا تحمل hash ولا سر TOTP', () => {
  const out = sanitizeCollectionForBroadcast('rcerp_users', [userRow(), userRow({ id: 'u2', role: 'counter' })]);
  assert.equal(out.length, 2);
  for (const u of out) {
    assert.equal('passwordHash' in u, false);
    assert.equal('passwordHistory' in u, false);
    assert.equal('totpSecret' in u, false);
  }
  // الحقول الوظيفية تبقى كما هي (الاسم والبريد والدور تُستخدم في القوائم)
  assert.equal(out[0].email, 'a@b.com');
  assert.equal(out[1].role, 'counter');
});

test('القيم غير الكائنية أو غير المصفوفة لا تكسر المسار', () => {
  assert.deepEqual(sanitizeCollectionForBroadcast('rcerp_users', null), []);
  assert.deepEqual(sanitizeCollectionForBroadcast('rcerp_users', undefined), []);
  assert.deepEqual(sanitizeCollectionForBroadcast('rcerp_users', { weird: true }), []);
});

test('مفاتيح غير حساسة تمرّ كما هي بلا نسخ', () => {
  const inv = [{ id: 'i1', qty: 5 }];
  assert.equal(sanitizeCollectionForBroadcast('rcerp_inventory', inv), inv);
  assert.equal(sanitizeCollectionForBroadcast('rcerp_vat_percent', 15), 15);
  const tomb = ['x-1', 'x-2'];
  assert.deepEqual(sanitizeCollectionForBroadcast('rcerp_deleted_ids', tomb), tomb);
});

// إعدادات الذكاء الاصطناعي وتليجرام لا تُبث أسرارها، بل مؤشرات فقط.
test('مفتاح الذكاء الاصطناعي يُبث كمؤشر hasKey بلا قيمة', () => {
  const out = sanitizeCollectionForBroadcast('rcerp_ai_settings', {
    apiKey: 'sk-live-abcdefghijklmnop',
    items: [{ id: 'm1', model: 'gemini', apiKey: 'sk-live-zzzz' }],
  });
  assert.equal(out.apiKey, undefined);
  assert.equal(out.items[0].apiKey, '');
  assert.equal('hasKey' in out.items[0], true);
});

test('توكن تليجرام يُبث مقنّعاً فقط بلا قيمة كاملة', () => {
  const out = sanitizeCollectionForBroadcast('rcerp_telegram_settings', {
    enabled: true,
    chatIds: [-100123],
    botToken: '1234567890:AAHsupersecrettoken',
    purchaseBotToken: '',
  });
  const serialized = JSON.stringify(out);
  assert.equal(serialized.includes('supersecret'), false);
  assert.deepEqual(out.chatIds, [-100123]);
  assert.equal('hasBotToken' in out, true);
  assert.equal('maskedBotToken' in out, true);
});
