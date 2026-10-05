// ظٹظ…ظ†ط¹ ظƒط´ظپ ظˆط¬ظˆط¯ ط§ظ„ط­ط³ط§ط¨ ظپظٹ /api/auth/login.
//
// ظƒط§ظ† ظ„ظ„ط­ط§ظ„ط© ط£ط±ط¨ط¹ ط±ط¯ظˆط¯ ظ…ط®طھظ„ظپط©طŒ ظˆظƒظ„ظ‡ط§ طھظƒط´ظپ ط´ظٹط¦ط§ظ‹:
//   آ«ط§ظ„ط¨ط±ظٹط¯ ط؛ظٹط± ظ…ط³ط¬ظ„آ» آ· آ«ظپظٹ ط§ظ†طھط¸ط§ط± ط§ظ„طھظپط¹ظٹظ„آ» آ· آ«ط§ظ„ط­ط³ط§ط¨ ظ…ظˆظ‚ظˆظپآ» آ· آ«ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط؛ظٹط± طµط­ظٹط­ط©آ»
// ظپظ…ظ‡ط§ط¬ظ… ظٹط¬ط±ظ‘ط¨ 100 ط¨ط±ظٹط¯ ظٹط®ط±ط¬ ط¨ظ‚ط§ط¦ظ…ط© ط­ط³ط§ط¨ط§طھظƒ.
//
// ط§ظ„ط§ط®طھط¨ط§ط± ظٹظپط­طµ ط§ظ„ط´ظٹظپط±ط© ظ†ظپط³ظ‡ط§ (ظ„ط§ ظٹط´ط؛ظ‘ظ„ ط®ط§ط¯ظ…ط§ظ‹): ط£ظٹ ط±ط³ط§ظ„ط© ظپط´ظ„ ظپظٹ ظ…ط³ط§ط± ط§ظ„ط¯ط®ظˆظ„
// ظٹط¬ط¨ ط£ظ† طھظƒظˆظ† ظˆط§ط­ط¯ط©طŒ ظˆط£ظ† ظٹظڈط³ط¬ظژظ‘ظ„ ط§ظ„ط³ط¨ط¨ ظپظٹ writeAudit ظ„ط§ ظپظٹ ط±ط¯ظ‘ ط§ظ„ط´ط¨ظƒط©.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'server', 'routes', 'auth.mjs'),
  'utf8',
);

// ط¬ط³ظ… ط¯ط§ظ„ط© ط§ظ„ط¯ط®ظˆظ„: ظ…ظ† app.post('/api/auth/login') ط­طھظ‰ ظ…ط§ ظ‚ط¨ظ„ app.post ط§ظ„طھط§ظ„ظٹ
function loginBody() {
  const start = SRC.indexOf("app.post('/api/auth/login'");
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf("app.post(", start + 10);
  return SRC.slice(start, end === -1 ? undefined : end);
}

describe('/api/auth/login â€” ظ…ظ†ط¹ ظƒط´ظپ ظˆط¬ظˆط¯ ط§ظ„ط­ط³ط§ط¨', () => {
  const body = loginBody();

  it('ظٹظˆط¬ط¯ ط±ط¯ظ‘ ظˆط§ط­ط¯ ط¹ط§ظ… ظ…ط³ظ…ظ‘ظ‰ GENERIC', () => {
    expect(body).toContain("const GENERIC =");
    expect(body).toContain('return res.json({ ok: false, error: GENERIC });');
  });

  it('ظ„ط§ ظٹط±ط¯ظ‘ ط¨ظ€آ«ط؛ظٹط± ظ…ط³ط¬ظ„آ» â€” ظپظ‡ظˆ ظٹط³ط£ظ„: ظ…ظˆط¬ظˆط¯ ط£ظ… ظ„ط§طں', () => {
    expect(body).not.toContain('ط؛ظٹط± ظ…ط³ط¬ظ„');
  });

  it('ظ„ط§ ظٹط±ط¯ظ‘ ط¨ظ€آ«ط؛ظٹط± طµط­ظٹط­ط©آ» ظˆط­ط¯ظ‡ط§ â€” ظٹط¬ط¨ ط£ظ† ظٹظ…ط±ظ‘ ط¨ظ€GENERIC', () => {
    // آ«ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط؛ظٹط± طµط­ظٹط­ط©آ» طھط¹ظ†ظٹ: ط§ظ„ط­ط³ط§ط¨ ظ…ظˆط¬ظˆط¯. ظ„ط§ طھظڈط³طھط®ط¯ظ… ظƒظ†طµظ‘ ظ…ط³طھظ‚ظ„.
    const standalone = body.match(/error:\s*'[^']*ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±[^']*'/);
    expect(standalone).toBeNull();
  });

  it('ظ„ط§ ظٹط±ط¯ظ‘ ط¨ط­ط§ظ„ط© ط§ظ„ط­ط³ط§ط¨ (ظ…ظˆظ‚ظˆظپ / ط¨ط§ظ†طھط¸ط§ط± ط§ظ„طھظپط¹ظٹظ„)', () => {
    expect(body).not.toContain('ظپظٹ ط§ظ†طھط¸ط§ط± طھظپط¹ظٹظ„');
    expect(body).not.toContain('ظ…ظˆظ‚ظˆظپطŒ طھظˆط§طµظ„');
  });

  it('ظƒظ„ ط§ظ„ط±ظپط¶ط§طھ طھظ…ط±ظ‘ ط¨ظ€deny ظپطھط³ط¬ظ‘ظ„ ط§ظ„ط³ط¨ط¨ ظپظٹ ط§ظ„ط³ط¬ظ„ ط§ظ„ط¯ط§ط®ظ„ظٹ', () => {
    // deny(...) ظٹظ…ط±ظ‘ ط¨ظ€writeAudit('LOGIN_DENIED') â€” ط§ظ„ط³ط¨ط¨ ظ„ظ„ط¯ط§ط®ظ„ ظ„ط§ ظ„ظ„ظ…ظ‡ط§ط¬ظ…
    expect(body).toContain("LOGIN_DENIED");
    expect(body).toContain('no_such_user');
    expect(body).toContain('needs_activation');
    expect(body).toContain('suspended');
  });

  it('ظ‚ط§ط±ظ† bcrypt ظˆظ‡ظ…ظٹط© ط¹ظ†ط¯ ط¹ط¯ظ… ظˆط¬ظˆط¯ ط§ظ„ظ…ط³طھط®ط¯ظ… â€” ظˆط¥ظ„ط§ ظƒط´ظپ ط§ظ„طھظˆظ‚ظٹطھ ظˆط¬ظˆط¯ظ‡', () => {
    // ط¨ط¯ظˆظ†ظ‡ط§: ط§ظ„ط­ط±ظپ `return` ظپظˆط±ظٹ (~1ms) ظ…ظ‚ط§ط¨ظ„ bcrypt (~100ms) â‡’ ظپط§ط±ظ‚ ط²ظ…ظ†ظٹ
    expect(body).toContain('DUMMY_HASH');
    expect(body).toMatch(/await verifyPassword\(password, DUMMY_HASH\)/);
  });

  it('DUMMY_HASH ط¨طµظٹط؛ط© bcrypt طµط§ظ„ط­ط©', () => {
    const m = SRC.match(/const DUMMY_HASH = '([^']+)'/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('طھط­ط¯ظٹط¯ ط§ظ„ظ…ط¹ط¯ظ‘ظ„ ظ…ط§ ط²ط§ظ„ ظٹط¹ظ…ظ„ â€” ظ„ط§ ظ†ظڈط¶ط¹ظپ ط§ظ„ط­ظ…ط§ظٹط© ظ„ظƒط³ط¨ ط§ظ„طھظˆط­ظٹط¯', () => {
    expect(body).toContain('rateLimitRegisterFailure(ipKey)');
    expect(body).toContain('rateLimitRegisterFailure(user.email)');
    expect(body).toContain('rateLimitGet(user.email)');
  });

  it('ط±ظ…ط² ط§ظ„طھط­ظ‚ظ‚ (2FA) ظ„ط§ ط²ط§ظ„ ظٹظڈط·ظ„ط¨ ظ„ظ„ظ…ط³ط¤ظˆظ„ â€” ظ„ط§ ط£ط«ط± ظ…ظ† ط§ظ„طھظˆط­ظٹط¯', () => {
    expect(body).toContain('totpRequired: true');
    expect(body).toContain('verifyTotp');
  });
});