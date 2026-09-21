import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  legacyHash, isBcryptHash, hashPassword, verifyPassword, needsRehash,
  validatePassword, recordPasswordHistory, isPasswordReused,
  PASSWORD_HISTORY_SIZE,
} from '../auth-utils.mjs';

test('legacyHash is deterministic sha-256 with salt', () => {
  const a = legacyHash('admin123');
  const b = legacyHash('admin123');
  const c = legacyHash('admin124');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('bcrypt round-trip and legacy verification', async () => {
  const h = await hashPassword('Str0ngPass');
  assert.ok(isBcryptHash(h));
  assert.equal(await verifyPassword('Str0ngPass', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
  const legacy = legacyHash('oldpass');
  assert.equal(await verifyPassword('oldpass', legacy), true);
  assert.equal(await verifyPassword('oldpass2', legacy), false);
});

test('needsRehash flags legacy hashes only', () => {
  assert.equal(needsRehash(legacyHash('x')), true);
  assert.equal(needsRehash('$2b$12$abcdefghijklmnopqrstuvwxyz'), false);
});

test('invalid hashed input does not crash verifyPassword', async () => {
  assert.equal(await verifyPassword('x', undefined), false);
  assert.equal(await verifyPassword('x', null), false);
});

test('validatePassword enforces length, character classes, and forbidden words', () => {
  assert.match(validatePassword('short1'), /8/);
  assert.match(validatePassword('LOWERCASE1'), /صغير/);
  assert.match(validatePassword('nocaps123'), /كبير/);
  assert.match(validatePassword('NoNumberAn'), /رقم/);
  assert.match(validatePassword('Admin123'), /سهلة/);
  assert.equal(validatePassword('Admin123!'), null);
  assert.equal(validatePassword('S3cure!Pass'), null);
});

test('recordPasswordHistory keeps at most N entries', () => {
  const user = {};
  for (let i = 0; i < PASSWORD_HISTORY_SIZE + 3; i++) recordPasswordHistory(user, `hash-${i}`);
  assert.equal(user.passwordHistory.length, PASSWORD_HISTORY_SIZE);
  assert.equal(user.passwordHistory[user.passwordHistory.length - 1], `hash-${PASSWORD_HISTORY_SIZE + 2}`);
});

test('isPasswordReused detects the current and past passwords', async () => {
  const user = {
    passwordHash: await hashPassword('Curr3ntPass'),
    passwordHistory: [await hashPassword('AblatedPass1'), await hashPassword('PastPass22')],
  };
  assert.equal(await isPasswordReused(user, 'Curr3ntPass'), true);
  assert.equal(await isPasswordReused(user, 'AblatedPass1'), true);
  assert.equal(await isPasswordReused(user, 'FreshPassX1'), false);
});

test('isPasswordReused works against legacy hashes too', async () => {
  const user = { passwordHash: legacyHash('LegacyPass'), passwordHistory: [] };
  assert.equal(await isPasswordReused(user, 'LegacyPass'), true);
});