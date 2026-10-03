// بصمة البناء يجب أن تُحسب عند كل استدعاء، لا مرة واحدة عند الإقلاع.
//
// العيب الذي Showed: كانت ثابتة (IIFE وقت الاستيراد)، فأي `npm run build` دون
// إعادة تشغيل للسيرفر كان يُبقي /health يبلّغ عن البصمة القديمة. المتصفح يقارن
// تلك البصمة بما خزّنه في localStorage، فيطابقان، فيختفي شريط «تم نشر تحديث».
// النتيجة: المستخدم يبقى على واجهة قديمة بلا أي تنبيه — وهو العطل الذي أُبلّغ
// عنه فعلاً (شاشة قديمة بعد النشر).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_HTML = path.join(__dirname, '..', '..', 'dist', 'index.html');

const fingerprintOf = (html) =>
  crypto.createHash('sha256').update(html).digest('hex').slice(0, 10);

test('getBuildFingerprint يعيد الحساب بعد تغيّر dist/index.html', async (t) => {
  if (!fs.existsSync(DIST_HTML)) {
    t.skip('لا يوجد dist/index.html — شغّل npm run build أولاً');
    return;
  }
  const { getBuildFingerprint } = await import('../version.mjs');

  const original = fs.readFileSync(DIST_HTML, 'utf8');
  const before = getBuildFingerprint();
  assert.equal(before, fingerprintOf(original), 'البصمة الأولى تطابق محتوى dist/index.html');

  // نغيّر المحتوى (تعليق HTML)، ونضبط mTime في المستقبل لأن بعض أنظمة الملفات
  // تثبّت دقّة Timestamp إلى ثانية واحدة وتُبقيه كما هو داخل نفس اللحظة.
  const bumped = original.replace('</head>', `<!-- stamp-probe ${crypto.randomUUID()} -->\n  </head>`);
  assert.notEqual(bumped, original, 'التبديل لازم أن يغيّر المحتوى فعلاً');

  const realNow = Date.now;
  const touch = (d) => fs.utimesSync(DIST_HTML, d, d);
  fs.writeFileSync(DIST_HTML, bumped);
  touch(new Date(realNow() + 5000));

  try {
    const after = getBuildFingerprint();
    assert.notEqual(after, before, 'البصمة تغيّرت بعد تعديل dist/index.html — وهذا هو السلوك المطلوب');
    assert.equal(after, fingerprintOf(bumped), 'البصمة الجديدة تطابق المحتوى الجديد');
  } finally {
    fs.writeFileSync(DIST_HTML, original);
    touch(new Date(realNow()));
  }
});

test('getBuildFingerprint مستقر عندما لا يتغيّر البناء (مخزّأ بـ mtime)', async (t) => {
  if (!fs.existsSync(DIST_HTML)) { t.skip('لا يوجد dist/index.html'); return; }
  const { getBuildFingerprint } = await import('../version.mjs');

  const a = getBuildFingerprint();
  const b = getBuildFingerprint();
  assert.equal(a, b, 'استدعاءان متتاليان يعطيان نفس البصمة');
  assert.equal(a, fingerprintOf(fs.readFileSync(DIST_HTML, 'utf8')), 'ويطابق محتوى الملف');
});

test('البناء مُخبوز في الحزمة: __BUILD_STAMP__ موجود داخل dist', async (t) => {
  if (!fs.existsSync(DIST_HTML)) { t.skip('لا يوجد dist/index.html'); return; }
  const html = fs.readFileSync(DIST_HTML, 'utf8');
  const entry = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  if (!entry) { t.skip('لا يوجد ملف دخول في index.html'); return; }

  const asset = path.join(__dirname, '..', '..', 'dist', entry[1].slice(1));
  if (!fs.existsSync(asset)) { t.skip('ملف الدخول غير موجود'); return; }

  const js = fs.readFileSync(asset, 'utf8');
  assert.match(
    js,
    /[0-9a-f]{10}/,
    'بصمة البناء عشر خانات hex مخبوزة في الحزمة (تُعرض في تذييل الشريط الجانبي)',
  );
});