import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Encode, base32Decode, generateSecret, currentTotp, verifyTotp, totpUrl } from '../totp.mjs';

test('base32 round-trip', () => {
  const buf = Buffer.from('hello-totp');
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
});

test('base32Encode matches known value', () => {
  // RFC 4648 test vector: "foobar" -> "MZXW6YTBOI======" (our encoder emits no padding)
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
});

test('generateSecret produces a base32 string of 32 chars (160 bits)', () => {
  const s = generateSecret();
  assert.equal(s.length, 32);
  assert.match(s, /^[A-Z2-7]+$/);
});

test('RFC 6238 SHA-1 test vectors (6-digit)', () => {
  const secret = '12345678901234567890'; // 20-byte key, base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
  const b32 = base32Encode(Buffer.from(secret));
  // RFC 6238 8-digit outputs; the 6-digit TOTP equals the last six digits.
  // T=59          -> 94287082 -> 287082
  // T=1111111109  -> 07081804 -> 081804
  // T=2000000000  -> 69279037 -> 279037
  // T=20000000000 -> 65353130 -> 353130
  const at0 = 59 * 1000;
  const at1 = 1111111109 * 1000;
  const at2 = 2000000000 * 1000;
  const at3 = 20000000000 * 1000;
  assert.equal(currentTotp(b32, at0), '287082');
  assert.equal(currentTotp(b32, at1), '081804');
  assert.equal(currentTotp(b32, at2), '279037');
  assert.equal(currentTotp(b32, at3), '353130');
});

test('verifyTotp accepts a current, previous, or next window code', () => {
  const secret = generateSecret();
  const now = Date.now();
  assert.equal(verifyTotp(secret, currentTotp(secret, now)), true);
  assert.equal(verifyTotp(secret, currentTotp(secret, now - 30 * 1000)), true);
  assert.equal(verifyTotp(secret, currentTotp(secret, now + 30 * 1000)), true);
  assert.equal(verifyTotp(secret, currentTotp(secret, now - 90 * 1000)), false);
});

test('verifyTotp rejects malformed input', () => {
  const secret = generateSecret();
  assert.equal(verifyTotp(secret, '12345'), false);
  assert.equal(verifyTotp(secret, 'abcdef'), false);
  assert.equal(verifyTotp(secret, ''), false);
  assert.equal(verifyTotp(secret, null), false);
});

test('totpUrl produces the expected otpauth format', () => {
  const url = totpUrl('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'admin@restocost.com', 'RestoCost ERP');
  assert.match(url, /^otpauth:\/\/totp\//);
  assert.match(url, /secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ/);
  assert.match(url, /issuer=RestoCost%20ERP/);
  assert.match(url, /digits=6&period=30/);
});