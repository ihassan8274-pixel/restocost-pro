// @vitest-environment node
//
// control/src/config.test.ts — environment interpolation + the write-path gap
//
// ⛔⛔ Why these exist as BEHAVIOURAL tests on a pure function, not text scans:
//    The bug being guarded is "a value silently became something it should not
//    have". A text scan cannot observe that. Only calling the function can.
//    (Same lesson as server/test/health-counters.test.mjs.)
//
// ⛔⛔ The write path had NO password check at all. loadConfig() checked, but
//    assertValid() — the thing POST/PATCH on /api/config goes through — did not.
//    So a literal password could be written into a git-committed YAML file over
//    the API. CFG-09..CFG-12 below close that.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  interpolateEnv,
  ENV_REF,
  LEGACY_DATABASES,
  dbNameFrom,
} from './config.js';

// ── CFG-01..CFG-05  interpolateEnv ────────────────────────────────────────

describe('interpolateEnv', () => {
  it('[CFG-01] expands ${NAME} from the given env', () => {
    expect(interpolateEnv('a${ONE}b${TWO}c', { ONE: '1', TWO: '2' })).toBe('a1b2c');
  });

  it('[CFG-02] ⭐ a missing variable THROWS — never an empty string', () => {
    // ⭐ the whole point. Substituting '' would yield
    //    postgres://restocost_app:@127.0.0.1:5433/db which looks valid and
    //    connects somewhere wrong. Same instinct as commit d6a9523:
    //    a value we could not determine must never look like a real value.
    expect(() => interpolateEnv('${NOPE}', {})).toThrow(/غير معرّف/);
    expect(() => interpolateEnv('${NOPE}', {})).toThrow(/NOPE/);
    expect(() => interpolateEnv('${NOPE}', { NOPE: '' })).toThrow(/NOPE/);
  });

  it('[CFG-03] ${NAME:-default} only falls back when unset or empty', () => {
    expect(interpolateEnv('${A:-fallback}', {})).toBe('fallback');
    expect(interpolateEnv('${A:-fallback}', { A: '' })).toBe('fallback');
    expect(interpolateEnv('${A:-fallback}', { A: 'real' })).toBe('real');
  });

  it('[CFG-04] ⭐ a malformed ${ is rejected, not passed through to the driver', () => {
    // ${DABASE_URL} (typo) would survive a naive replace and reach the DB driver
    // as a literal, failing later with a confusing network error.
    for (const bad of ['${DABASE_URL}', '${}', '${1BAD}', '${ UNSPACED}']) {
      expect(() => interpolateEnv(`x${bad}y`, {}), bad).toThrow();
    }
  });

  it('[CFG-05] text without ${} is returned untouched', () => {
    const url = 'postgresql://u:p@127.0.0.1:5433/db?connection_limit=5';
    expect(interpolateEnv(url, {})).toBe(url);
  });
});

// ── CFG-06..CFG-08  the regex itself ──────────────────────────────────────

describe('ENV_REF', () => {
  it('[CFG-06] ⭐ is stateless across calls', () => {
    // ⭐ /g regexes carry lastIndex. A shared /g regex without a fresh instance
    // returns true once then false — a guard that passes on the first call and
    // silently stops guarding. This asserts the exported regex is safe to reuse
    // only if callers copy it, so the guard tests the behaviour that matters.
    const src = ENV_REF.source;
    const re = () => new RegExp(src);
    expect(re().test('${A}')).toBe(true);
    expect(re().test('${A}')).toBe(true);
    expect(re().test('${A}')).toBe(true);
    expect(re().test('no refs here')).toBe(false);
  });

  it('[CFG-07] rejects a ${} with an illegal name rather than matching loosely', () => {
    const re = new RegExp(ENV_REF.source);
    expect(re.test('${Valid_Name1}')).toBe(true);
    expect(re.test('${1nvalid}')).toBe(false);
    expect(re.test('${has-dash}')).toBe(false);
  });
});

// ── CFG-08  dbNameFrom ────────────────────────────────────────────────────

describe('dbNameFrom', () => {
  it('[CFG-08] extracts the database name, including from a ${...} path', () => {
    expect(dbNameFrom('postgres://u:p@h:5433/restocost_massobi')).toBe('restocost_massobi');
    expect(dbNameFrom('postgres://u:p@h:5433/restocost_bukharo?x=1')).toBe('restocost_bukharo');
  });

  it('[CFG-08b] ⭐ returns "unknown" rather than guessing when it cannot resolve', () => {
    // removeCompany() calls this on the DELETE path. A throw there leaves a
    // half-finished delete; a wrong name lets a caller act on a guess.
    expect(dbNameFrom('postgres://u:${MISSING_VAR}@h:5433/db')).toBe('db'); // fallback, raw path
    expect(dbNameFrom('nonsense')).toBe('unknown');
  });
});

// ── CFG-09..CFG-12  the legacy-database guard + real file loading ─────────

const LEGACY = [...LEGACY_DATABASES];
const BUKHARO_DB = LEGACY[1] ?? 'restocost2';

describe('the real config file', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfg-test-'));
    process.env['COMPANIES_CONFIG'] = join(dir, 'companies.yaml');
  });

  afterEach(() => {
    delete process.env['COMPANIES_CONFIG'];
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (body: string) => writeFileSync(join(dir, 'companies.yaml'), body, 'utf8');

  const good = (dbUrl: string) => `
control:
  port: 3010
  subdomain: control.example.com
companies:
  - id: alpha
    name: Alpha
    subdomain: alpha.example.com
    port: 3011
    databaseUrl: ${dbUrl}
    active: true
`;

  it('[CFG-09] ⭐ a company pointing at the production database is REFUSED', async () => {
    // Measured: a brand-new PostgreSQL role with zero grants CAN connect to
    // restocost2 (CONNECT is granted to PUBLIC by default) and is stopped only
    // at the table level. So a config typo aimed at production is a real,
    // reachable outcome — not a hypothetical.
    process.env['COMPANY_DB_PASSWORD'] = 'secret';
    write(good(`postgres://restocost_app:\${COMPANY_DB_PASSWORD}@127.0.0.1:5433/${BUKHARO_DB}`));
    const { resetCache, loadConfig } = await import('./config.js');
    resetCache();
    expect(() => loadConfig()).toThrow(/legacy/);
  });

  it('[CFG-10] ⭐ CHANGE_ME is refused', async () => {
    write(good('postgres://restocost_app:CHANGE_ME@127.0.0.1:5433/restocost_alpha'));
    const { resetCache, loadConfig } = await import('./config.js');
    resetCache();
    expect(() => loadConfig()).toThrow(/CHANGE_ME/);
  });

  it('[CFG-11] ⭐ a literal password is refused', async () => {
    write(good('postgres://restocost_app:literalSecret@127.0.0.1:5433/restocost_alpha'));
    const { resetCache, loadConfig } = await import('./config.js');
    resetCache();
    expect(() => loadConfig()).toThrow(/حرفية/);
  });

  it('[CFG-12] ⭐ a good file loads AND the returned URL is fully expanded', async () => {
    process.env['COMPANY_DB_PASSWORD'] = 'topsecret';
    write(good('postgres://restocost_app:${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_alpha?connection_limit=5'));
    const { resetCache, loadConfig } = await import('./config.js');
    resetCache();
    const cfg = loadConfig();
    expect(cfg.companies[0]!.databaseUrl).toBe(
      'postgres://restocost_app:topsecret@127.0.0.1:5433/restocost_alpha?connection_limit=5',
    );
    expect(cfg.companies[0]!.databaseUrl).not.toContain('${');
  });

  it('[CFG-13] ⭐ the SHIPPED config/companies.yaml has no CHANGE_ME and no wrong port', async () => {
    // ⭐ 5432 is Docker. PostgreSQL 18 listens on 5433. The shipped file had 5432
    // in four places, which would have connected to the Docker forwarder.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const shipped = resolve(process.cwd(), '..', 'config', 'companies.yaml');
    let text: string;
    try {
      text = readFileSync(shipped, 'utf8');
    } catch {
      text = readFileSync(
        resolve(process.cwd(), 'config', 'companies.yaml'),
        'utf8',
      );
    }
    expect(text).not.toContain('CHANGE_ME');
    expect(text).toContain('${COMPANY_DB_PASSWORD}');
    expect(text).not.toMatch(/@127\.0\.0\.1:5432\//);
    expect(text).toMatch(/@127\.0\.0\.1:5433\//);
  });
});