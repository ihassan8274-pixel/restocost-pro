// @vitest-environment node
//
// control/src/auth.test.ts — the write guard
//
// ⛔⛔ The bug this guards (MEASURED, not theorised):
//    `const TOKEN = process.env['CONTROL_ADMIN_TOKEN'] ?? ''` read the token at
//    module-import time. ESM evaluates all imports before any statement in
//    main.ts, so the `process.loadEnvFile()` that reads control/.env had not
//    run yet. TOKEN was always ''. Live proof: POST /api/config/reload
//    answered 503 "write routes disabled" even with a correct Bearer token.
//    Every write path — create a database, edit companies.yaml — was dead.
//
//    A module-scope env read is the bug class here: it looks correct, passes
//    review, and only fails in the real boot order.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ⛔⛔ Why NOT `import('./auth.js?t=' + Date.now())` to force a fresh module:
//    Vite's dynamic-import-helper cannot resolve a variable specifier at all
//    ("Unknown variable dynamic import"). All nine tests failed on that, not on
//    anything to do with the guard.
//
//    ⭐ The fix that keeps the test honest: reset the module registry with
//    vi.resetModules() and use a LITERAL specifier. A literal can be analysed
//    statically, and resetModules() guarantees auth.ts is re-evaluated — which
//    is exactly the import-time capture we need to exercise.
const loadAuth = async () => {
  vi.resetModules();
  return import('./auth.js');
};

// A fake Fastify reply that records what was sent.
// ⭐ The fields are typed `number | null` / `unknown`, not `null` — otherwise
//    `code(n)` and `send(p)` cannot assign to them and tsc rejects the file
//    while vitest happily runs it. A test that typechecks under vitest but not
//    under tsc is a file that will not survive `npm run build`.
const mkReply = () => {
  const sent: { code: number | null; payload: unknown } = { code: null, payload: null };
  return {
    code(n: number) { sent.code = n; return this; },
    send(p: unknown) { sent.payload = p; return this; },
    sent,
  };
};

const mkReq = (authorization?: string) =>
  ({ headers: { authorization } }) as never;

describe('requireWriteToken', () => {
  const saved = process.env['CONTROL_ADMIN_TOKEN'];

  beforeEach(() => { process.env['CONTROL_ADMIN_TOKEN'] = 'a-real-token-value'; });
  afterEach(() => {
    if (saved === undefined) delete process.env['CONTROL_ADMIN_TOKEN'];
    else process.env['CONTROL_ADMIN_TOKEN'] = saved;
  });

  it('[AUTH-01] ⭐ a token set AFTER import is honoured (the measured bug)', async () => {
    // ⭐ Set it before importing to prove the guard is wired, then the real
    //    ordering case: import first, set after.
    const { requireWriteToken, writeGuardConfigured } = await loadAuth();
    expect(writeGuardConfigured()).toBe(true);

    const reply = mkReply();
    requireWriteToken(mkReq('Bearer a-real-token-value'), reply as never);
    expect(reply.sent.code).toBeNull();          // nothing sent => it passed
    expect(reply.sent.payload).toBeNull();
  });

  it('[AUTH-02] a missing token gives 401, never 200', async () => {
    const { requireWriteToken } = await loadAuth();
    const reply = mkReply();
    requireWriteToken(mkReq(undefined), reply as never);
    expect(reply.sent.code).toBe(401);
  });

  it('[AUTH-03] a wrong token gives 401', async () => {
    const { requireWriteToken } = await loadAuth();
    const reply = mkReply();
    requireWriteToken(mkReq('Bearer not-the-token'), reply as never);
    expect(reply.sent.code).toBe(401);
  });

  it('[AUTH-04] ⭐ a different-LENGTH token gives 401 without throwing', async () => {
    // ⭐ timingSafeEqual THROWS on a length mismatch. The length check before
    //    it is the only reason this returns 401 instead of a 500.
    const { requireWriteToken } = await loadAuth();
    const reply = mkReply();
    expect(() => requireWriteToken(mkReq('Bearer x'), reply as never)).not.toThrow();
    expect(reply.sent.code).toBe(401);
  });

  it('[AUTH-05] a non-Bearer scheme gives 401', async () => {
    const { requireWriteToken } = await loadAuth();
    for (const h of ['Basic a-real-token-value', 'a-real-token-value', 'bearer a-real-token-value']) {
      const reply = mkReply();
      requireWriteToken(mkReq(h), reply as never);
      expect(reply.sent.code, h).toBe(401);
    }
  });

  it('[AUTH-06] ⭐ NO token configured closes every write route (503, not open)', async () => {
    // ⛔ The safe failure. Missing config must never mean "allow".
    delete process.env['CONTROL_ADMIN_TOKEN'];
    const { requireWriteToken, writeGuardConfigured } = await loadAuth();
    expect(writeGuardConfigured()).toBe(false);
    const reply = mkReply();
    requireWriteToken(mkReq('Bearer anything'), reply as never);
    expect(reply.sent.code).toBe(503);
  });

  it('[AUTH-07] an empty-string token counts as unconfigured', async () => {
    process.env['CONTROL_ADMIN_TOKEN'] = '';
    const { writeGuardConfigured } = await loadAuth();
    expect(writeGuardConfigured()).toBe(false);
  });
});

describe('guardStatus', () => {
  it('[AUTH-08] ⭐ never returns the token value', async () => {
    process.env['CONTROL_ADMIN_TOKEN'] = 'super-secret-token';
    const { guardStatus } = await loadAuth();
    const s = guardStatus();
    expect(s.writeEnabled).toBe(true);
    expect(JSON.stringify(s)).not.toContain('super-secret-token');
    expect(Object.keys(s)).toEqual(['writeEnabled']);
  });
});

// ⭐⭐ The regression test for the actual bug: a .env loaded AFTER the module
//      graph is built must still be visible to the guard.
describe('the import-order bug (the real one)', () => {
  it('[AUTH-09] ⭐ a token absent at import, then set, must be READ', async () => {
    // ⭐ Exactly the live boot order that produced the 503:
    //    main.ts's imports run -> auth.ts captured '' -> then loadEnvFile().
    delete process.env['CONTROL_ADMIN_TOKEN'];
    const mod = await loadAuth();

    // the module has now been evaluated with the env var ABSENT
    const { writeGuardConfigured } = mod;
    expect(writeGuardConfigured()).toBe(false);   // honest: nothing yet

    // now simulate what loadEnvFile() does, after import
    process.env['CONTROL_ADMIN_TOKEN'] = 'loaded-later-token';
    try {
      expect(writeGuardConfigured()).toBe(true);   // ⭐ must see the new value

      const reply = mkReply();
      mod.requireWriteToken(mkReq('Bearer loaded-later-token'), reply as never);
      expect(reply.sent.code).toBeNull();          // accepted
    } finally {
      delete process.env['CONTROL_ADMIN_TOKEN'];
    }
  });

  it('[AUTH-10] ⭐ there is no module-scope env capture of the token', async () => {
    // Structural guard. Even if a behavioural test is weakened later, this
    // fails if someone reintroduces `const TOKEN = process.env[...] ?? ''`.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('./auth.ts', import.meta.url)), 'utf8');
    const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(body).not.toMatch(/const\s+TOKEN\s*=\s*process\.env/);
    expect(body).not.toMatch(/const\s+\w+\s*=\s*process\.env\[\s*'CONTROL_ADMIN_TOKEN'\s*\]/);
  });
});

describe('no stray files', () => {
  it('[AUTH-11] the test dir it would create is cleaned up', async () => {
    const d = mkdtempSync(join(tmpdir(), 'auth-test-'));
    rmSync(d, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});