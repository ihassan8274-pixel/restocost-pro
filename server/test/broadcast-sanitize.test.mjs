// server/test/broadcast-sanitize.test.mjs — تعرية الأسرار عند بث rcerp_users.
//
// أي مسار يقرأ من KV ويكتب استجابة للمتصفح يجب أن يمرّ بـ sanitizeCollectionForBroadcast
// وإلا تسريب هاشات كلمات المرور وأسرار TOTP عبر مسار جديد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCollectionForBroadcast } from '../sanitize.mjs';
import { encryptSecret } from '../secrets.mjs';

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

// ⛔ REGRESSION (2026-10-08) — the masked preview used to be built with an EMPTY
//   context while the stored token is encrypted with 'tg:botToken'. The AAD guard
//   then rejected it, the preview came back EMPTY and the server logged
//   "[secrets] decrypt failed: v1 blob undecryptable" on every broadcast.
//   A plaintext token passes through untouched, which is why the test above
//   stayed green the whole time the bug was live.
test('توكن تليجرام المشفّر يُقنَّع بنسخة صحيحة وبسياقه', () => {
  const token = '1234567890:AAHsupersecrettoken';
  const purchase = '9876543210:BBHotherpurchasetoken';
  const out = sanitizeCollectionForBroadcast('rcerp_telegram_settings', {
    enabled: true,
    botToken: encryptSecret(token, 'tg:botToken'),
    purchaseBotToken: encryptSecret(purchase, 'tg:purchaseBotToken'),
  });
  assert.equal(out.hasBotToken, true);
  assert.equal(out.maskedBotToken.length > 0, true);
  assert.equal(out.maskedBotToken, `${token.slice(0, 6)}…${token.slice(-4)}`);
  assert.equal(out.purchaseHasToken, true);
  assert.equal(out.maskedPurchaseBotToken, `${purchase.slice(0, 6)}…${purchase.slice(-4)}`);
  // the ciphertext/plain value itself must never reach the browser
  assert.equal(JSON.stringify(out).includes('supersecret'), false);
});
