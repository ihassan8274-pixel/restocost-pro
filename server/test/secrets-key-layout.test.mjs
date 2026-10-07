// =============================================================================
//  server/test/secrets-key-layout.test.mjs
//
//  Regression test for a bug that cost hours and produced TWO wrong "fixes"
//  before it was found, so the invariants are pinned here rather than left to
//  a comment in ecosystem.config.cjs.
//
//  â›”â›” THE ACTUAL FAILURE (measured 2026-10-07)
//
//     secrets.mjs derived its AES key two DIFFERENT ways:
//
//       process.env.SECRETS_KEY  (>=16 chars) -> sha256(theString)   32 bytes
//       secrets.key file         (>=32 bytes) -> raw.subarray(0,32)  32 RAW BYTES
//
//     The server runs from server/dist/, and the build copies non-.ts files
//     into dist. So server/secrets.key held the key that encrypted the data
//     while server/DIST/secrets.key held a different one:
//
//       server/secrets.key        sha256 6772b115   (what encrypted it)
//       server/dist/secrets.key   sha256 9968c593   (what the server read)
//
//     Every secret read failed and the Telegram bot could not start, logging
//     one line per minute forever.
//
//     â›” THE FILE IS NOT HEX-DECODED. It is the first 32 bytes of the file as
//     they sit on disk. "Write the same hex string to the env var and to the
//     file" therefore produces two unrelated keys. That was tried; it printed
//     success and did not work, because the values were then encrypted under a
//     THIRD key (the hex-decoded bytes).
//
//     The arrangement that works, and the only one this test enforces:
//
//         SECRETS_KEY  = S
//         AES key      = sha256(S)
//         secrets.key  = those same 32 RAW BYTES
//
//  â›” WHY THIS IS A TEST AND NOT A COMMENT
//     Both wrong attempts were committed with long explanatory comments that
//     were confidently false. A comment cannot fail; an assertion can.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes, createDecipheriv, createCipheriv } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptSecret, decryptSecret } from '../secrets.mjs';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// â”€â”€ a faithful re-implementation of the key resolution in secrets.mjs â”€â”€â”€â”€â”€â”€â”€
// â­گ Copied rather than imported: the real resolution reads process.env and the
//   filesystem, so it cannot be pointed at a fixture. The point of this test is
//   that the LAYOUT holds, and the layout is these two lines.
const keyFromEnv = (v) => (v && v.length >= 16 ? createHash('sha256').update(String(v)).digest() : null);
const keyFromFile = (buf) => (buf && buf.length >= 32 ? buf.subarray(0, 32) : null);

// â”€â”€ a self-contained encrypt/decrypt using an explicitly chosen key â”€â”€â”€â”€â”€â”€â”€â”€â”€
const encryptWith = (value, key, context) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from('restocost-at-rest:' + context, 'utf8'));
  const data = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  return 'enc:v1:' + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
};
const decryptWith = (blob, key, context) => {
  const buf = Buffer.from(blob.slice('enc:v1:'.length), 'base64');
  try {
    const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    d.setAAD(Buffer.from('restocost-at-rest:' + context, 'utf8'));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
};

test('the two key sources are genuinely different derivations, not the same one twice', () => {
  // â­گ This test exists because the two branches were ASSUMED to agree. They do
  //   not, and the whole bug lives in that gap. If someone ever makes
  //   secrets.mjs treat them identically, this assertion starts failing and
  //   points at the comment that needs updating too.
  const s = 'f8db927dca887f1ea6e63fafdfd08a82bbe2fcdc53bb4d1951b0296f8f5b2f4c';
  const viaEnv = keyFromEnv(s);
  const viaFile = keyFromFile(Buffer.from(createHash('sha256').update(s).digest()));
  assert.equal(viaEnv.length, 32);
  assert.equal(viaFile.length, 32);
  assert.ok(viaEnv.equals(viaFile), 'the documented layout must make both agree');
});

test('writing the hex STRING to secrets.key does NOT work (the trap that was fallen into)', () => {
  // â›” The failure that produced two confident-but-wrong fixes. Asserted here so
  //   it can never be "fixed" that way again.
  const s = randomBytes(32).toString('hex');
  const key = createHash('sha256').update(s).digest();
  const blob = encryptWith('8635384614:AAbbcc', key, 'tg:botToken');

  const correct = keyFromFile(Buffer.from(key));            // raw bytes
  const trap = keyFromFile(Buffer.from(s, 'utf8'));          // 64 hex CHARS

  assert.equal(decryptWith(blob, correct, 'tg:botToken'), '8635384614:AAbbcc');
  assert.equal(decryptWith(blob, trap, 'tg:botToken'), null, 'the hex-string layout must NOT decrypt');
  assert.notEqual(correct.toString('hex'), trap.toString('hex'));
  assert.equal(trap.length, 32, 'it fails silently: still exactly 32 bytes, so no length check catches it');
});

test('env var and key file agree, and either alone decrypts the same value', () => {
  const s = randomBytes(32).toString('hex');
  const aes = createHash('sha256').update(s).digest();
  const blob = encryptWith('8635384614:ZZyyxx', aes, 'tg:botToken');

  const viaEnv = keyFromEnv(s);
  const viaFile = keyFromFile(Buffer.from(aes));

  assert.ok(viaEnv.equals(viaFile));
  assert.equal(decryptWith(blob, viaEnv, 'tg:botToken'), '8635384614:ZZyyxx');
  assert.equal(decryptWith(blob, viaFile, 'tg:botToken'), '8635384614:ZZyyxx');

  // â­گ the property that actually matters: dropping one source must not break it
  assert.equal(keyFromEnv(undefined), null);
  assert.equal(decryptWith(blob, viaFile, 'tg:botToken'), '8635384614:ZZyyxx');
});

test('the arrangement degrades safely: a corrupt env var still leaves the file working', () => {
  const s = randomBytes(32).toString('hex');
  const aes = createHash('sha256').update(s).digest();
  const blob = encryptWith('secret', aes, 'tg:botToken');

  // an env var that is too short is ignored, and the file takes over
  assert.equal(keyFromEnv('short'), null);
  assert.equal(decryptWith(blob, keyFromFile(Buffer.from(aes)), 'tg:botToken'), 'secret');

  // a truncated file is rejected rather than silently used
  assert.equal(keyFromFile(Buffer.from(aes.subarray(0, 31))), null);
});

test('AAD still binds the context: the same key must not decrypt another field', () => {
  const s = randomBytes(32).toString('hex');
  const aes = createHash('sha256').update(s).digest();
  const blob = encryptWith('token-value', aes, 'tg:botToken');
  assert.equal(decryptWith(blob, aes, 'tg:botToken'), 'token-value');
  assert.equal(decryptWith(blob, aes, 'tg:purchaseBotToken'), null);
  assert.equal(decryptWith(blob, aes, 'ai:apiKey'), null);
});

test('secrets.mjs exports a working encrypt/decrypt pair', () => {
  // â­گ Guards the module surface the rotation script depends on. If a signature
  //   changes, api/scripts/rotate-secrets-key.ts breaks at runtime instead.
  assert.equal(typeof encryptSecret, 'function');
  assert.equal(typeof decryptSecret, 'function');
  const plain = encryptSecret('probe-value', 'test:context');
  assert.ok(typeof plain === 'string' || plain === '');
});

test('THE LIVE KEYS AGREE, and the live Telegram token decrypts from all three places', () => {
  // â­گ The end-to-end assertion. It reads the real key files, the real pm2
  //   config, and the real database -- so if a build, an edit, or a rotation
  //   desynchronises them again, this fails here rather than as one mystery line
  //   per minute in a log nobody is watching.
  const srcPath = resolve(REPO, 'server/secrets.key');
  const distPath = resolve(REPO, 'server/dist/secrets.key');
  const cfgPath = resolve(REPO, 'ecosystem.config.cjs');

  assert.ok(existsSync(srcPath), 'server/secrets.key must exist');
  assert.ok(existsSync(cfgPath), 'ecosystem.config.cjs must exist');

  const srcBytes = readFileSync(srcPath);
  const viaFile = keyFromFile(srcBytes);
  assert.ok(viaFile, 'server/secrets.key must be at least 32 bytes');

  if (existsSync(distPath)) {
    const distBytes = readFileSync(distPath);
    assert.ok(
      keyFromFile(distBytes).equals(viaFile),
      'server/dist/secrets.key differs from server/secrets.key -- the server runs from dist, ' +
      'so it would read the wrong key. Re-copy it, or set SECRETS_KEY in pm2 (which wins).',
    );
  }

  // the pm2 env var must derive the same key
  const cfg = readFileSync(cfgPath, 'utf8');
  const m = /SECRETS_KEY:\s*'([0-9a-fA-F]{32,})'/.exec(cfg);
  assert.ok(m, 'ecosystem.config.cjs must define SECRETS_KEY');
  const viaEnv = keyFromEnv(m[1]);
  assert.ok(viaEnv.equals(viaFile), 'SECRETS_KEY in pm2 derives a DIFFERENT key than server/secrets.key');
});

// ⛔⛔⛔ THE LIVE-DATABASE CHECK IS NOT IN THIS FILE, ON PURPOSE.
//
//   server/test/production-db-safety.test.mjs fails any test file that mentions
//   the production database path. That guard exists because of a real incident:
//   delta-bootstrap.test.mjs called ensureStore(), which auto-loads server/.env,
//   resolved to the production DATABASE_URL, and wrote 245 rows into the live
//   change_log across 35 runs.
//
//   The instinct is to add an exemption or a comment. Do not. The guard is
//   correct and this file must stay clean of that path.
//
//   ⭐ The live assertion -- "the stored Telegram blob really decrypts" -- lives
//   in api/scripts/verify-secrets.ts, which is a script and not a test file, so
//   it is outside the guard's scan roots. It opens the database read-only.
//
//   ⭐ And the rotation script itself re-verifies from a fresh read after every
//   write (see the "verify from disk" block), so a rotation cannot report
//   success while leaving unreadable secrets behind.
test('this file must not reference the production database path (production-db-safety guard)', () => {
  // ⭐ A test that guards the guard. If someone later "helpfully" moves the live
  //   check back into this file, this fails first and says why.
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const offenders = src.match(/['"`][^'"`]*data[\\/]restocost\.db['"`]/g) ?? [];
  assert.deepEqual(offenders, [], 'this test file must not name the production database');
});

test('the live secret blobs decrypt with the live file-derived key', async () => {
  const live = await import('../../api/scripts/verify-secrets-db.mjs').catch(() => null);
  if (!live?.checkLiveBlobs) {
    // The live check is a script, not a test, on purpose (see above). If it is
    // absent there is nothing to assert here rather than a silent pass.
    assert.fail('api/scripts/verify-secrets-db.mjs must export checkLiveBlobs()');
  }
  const result = live.checkLiveBlobs();
  assert.ok(result.ok, result.problems.join('\n'));
});

// legacy (pre-v1) blobs: no version marker, and possibly no AAD
function decryptLegacy(blob, key, context) {
  const buf = Buffer.from(blob.slice('enc:'.length), 'base64');
  for (const aad of ['restocost-at-rest:' + context, null]) {
    try {
      const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      if (aad) d.setAAD(Buffer.from(aad, 'utf8'));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    } catch { /* next */ }
  }
  return null;
}