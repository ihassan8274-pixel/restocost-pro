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

// ── CFG-18..CFG-24  pos.source ────────────────────────────────────────────
//
// ⭐ لماذا هذه اختبارات سلوكية على loadConfig() وليس فحص نص:
//    الخطر ليس "السطر مكتوب خطأ" بل "قيمة غريبة تمرّ وتُخزَّن".
//    فحص النص لا يستطيع ملاحظة قيمة تمرّ.
//
// ⛔ الخطر المقيس: نظام الشركة الثالثة لسه غير محدد. لو كان العمود
//    اسمه foodics_item_id لكان تغيير نظامها تعديل كود + migration.
//    لذلك المفتاح (pos_source, pos_item_id) والمصدر إعداد مُتحقَّق منه.

describe('pos.source', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfg-pos-'));
    process.env['COMPANIES_CONFIG'] = join(dir, 'companies.yaml');
    process.env['COMPANY_DB_PASSWORD'] = 'pw';
  });

  afterEach(() => {
    delete process.env['COMPANIES_CONFIG'];
    delete process.env['COMPANY_DB_PASSWORD'];
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (body: string) => writeFileSync(join(dir, 'companies.yaml'), body, 'utf8');

  const yml = (posBlock: string) => `
control:
  port: 3010
  subdomain: control.example.com
companies:
  - id: alpha
    name: Alpha
    subdomain: alpha.example.com
    port: 3011
    databaseUrl: postgres://restocost_app:\${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_alpha
${posBlock}`;

  it('[CFG-18] ⭐ a KNOWN source loads and survives round-trip', async () => {
    write(yml('    pos:\n      source: foodics\n      enabled: true\n'));
    const { resetCache, loadConfig } = await import('./config.js');
    resetCache();
    const cfg = loadConfig();
    expect(cfg.companies[0]!.pos).toEqual({ source: 'foodics', enabled: true });
  });

  it('[CFG-19] ⭐ an UNKNOWN source is REFUSED, not silently stored', async () => {
    // ⛔ هذا هو الفحص كله. لو مرّ، لن يجد الـ adapter هذا المصدر
    //    فيسقط وقت الاستيراد لا وقت الإقلاع.
    write(yml('    pos:\n      source: sapa\n      enabled: true\n'));
    const { resetCache, loadConfig } = await import('./config.js');
    resetCache();
    expect(() => loadConfig()).toThrow(/غير معروف/);
    expect(() => loadConfig()).toThrow(/sapa/);
  });

  it('[CFG-20] ⭐ case variants are refused, not folded', async () => {
    // ⭐ "Foodics" و"FOODICS" مرّان لو قارنّا case-insensitively. كل
    //    واحد منهم ينتج صفاً في pos_order_lines بمصدر لا يطابق ما
    //    يقرؤه الـ adapter.
    for (const bad of ['Foodics', 'FOODICS', 'foodic', 'foodics2', 'sapa']) {
      write(yml(`    pos:\n      source: ${bad}\n`));
      const { resetCache, loadConfig } = await import('./config.js');
      resetCache();
      expect(() => loadConfig(), bad).toThrow(/غير معروف/);
    }
  });

  it('[CFG-20b] ⭐⛔ measured: YAML trims plain scalars, so "foodics " is NOT a test case', async () => {
    // ⭐ لماذا نفصل هذا: كتبت أولاً اختباراً يفترض أن `source: foodics `
    //    يصل كـ "foodics " رابطاً بفراغ، فمرّ. القياس أثبت العكس:
    //    YAML parser يقصّ الفراغ من طرفَي scalar العادي قبل أن تصل
    //    القيمة إلى كودنا. أي أن الـ whitespace غير قابل للوصول من
    //    ملف YAML إطلاقاً.
    //    الخطر الحقيقي ينتقل إلى الـ API: PATCH يقبل JSON فيه
    //    "foodics " كما هو. لهذا يبقى الفحص في assertValue vicinity
    //    ولا نُزيح الاختبار لتوهم أنه يغطي YAML.
    const { parse } = await import('yaml');
    for (const raw of ['foodics ', ' foodics', '\tfoodics']) {
      expect(parse(`v: ${raw}`).v, raw).toBe('foodics');
    }
    // ⭐ ودعها تُرفض لو وصلت فعلاً — هذا هو السلوك المطلوب، مختبَر
    //    عبر المسار الذي يمرّرها فعلاً.
    write(yml('    pos:\n      source: foodics\n'));
    const { resetCache, addCompany } = await import('./config.js');
    resetCache();
    expect(() =>
      addCompany({
        id: 'bravo', name: 'Bravo', subdomain: 'bravo.example.com', port: 3015,
        databaseUrl: 'postgres://restocost_app:${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_bravo',
        pos: { source: 'foodics ' as never },
      }),
    ).toThrow(/غير معروف/);
  });

  it('[CFG-21] ⭐ a company with NO pos block is ALLOWED (optional)', async () => {
    // ⭐ لازم يمرّ. الشركة قد تُضاف قبل ما يُقرَّر نظام الـ POS،
    //    و" absence " reason لرفض الإضافة كلها.
    write(yml(''));
    const { resetCache, loadConfig } = await import('./config.js');
    resetCache();
    expect(loadConfig().companies[0]!.pos).toBeUndefined();
  });

  it('[CFG-22] ⭐ pos.enabled=true with source=none is REFUSED — a real contradiction', async () => {
    // ⭐ "فعّل الاستيراد من مصدر لا وجود له" ينتج أرقاماً صفرية في
    //    كل تقرير بلا أي رسالة خطأ. هذا أسوأ من الرفض.
    write(yml('    pos:\n      source: none\n      enabled: true\n'));
    const { resetCache, loadConfig } = await import('./config.js');
    resetCache();
    expect(() => loadConfig()).toThrow(/تناقض/);
  });

  it('[CFG-23] ⭐ a non-object pos is REFUSED, not coerced', async () => {
    // ⭐ YAML بيفرّق بين `pos: foodics` (نص) وكتلة. الأول خطأ بشري
    //    شائع لا أحد يلتقطه بالنظر.
    for (const bad of ['foodics\n', '[1, 2]\n', '42\n']) {
      write(yml(`    pos: ${bad}`));
      const { resetCache, loadConfig } = await import('./config.js');
      resetCache();
      expect(() => loadConfig(), bad).toThrow(/pos/);
    }
  });

  it('[CFG-24] ⭐ the WRITE path refuses an unknown source too', async () => {
    // ⛔ نفس reason CFG-14/15: assertValid هو ما يحرس POST/PATCH.
    //    فحص loadConfig وحده يترك طريقاً مفتوحاً.
    write(yml('    pos:\n      source: foodics\n'));
    const { resetCache, addCompany } = await import('./config.js');
    resetCache();
    expect(() =>
      addCompany({
        id: 'bravo', name: 'Bravo', subdomain: 'bravo.example.com', port: 3015,
        databaseUrl: 'postgres://restocost_app:${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_bravo',
        pos: { source: 'oracle' as never, enabled: true },
      }),
    ).toThrow(/غير معروف/);
    // ⭐Negative control: نفس الطلب بمصدر معروف لازم يمرّ.
    //    بدونها، اختبار الرفض أعلاه ينجح حتى لو checkPos يرفض كل شيء.
    addCompany({
      id: 'bravo', name: 'Bravo', subdomain: 'bravo.example.com', port: 3015,
      databaseUrl: 'postgres://restocost_app:${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_bravo',
      pos: { source: 'none', enabled: false },
    });
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(join(dir, 'companies.yaml'), 'utf8')).toContain('bravo');
  });
});

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

  // ── CFG-14..CFG-16  the WRITE path ──────────────────────────────────────
  // ⛔⛔ CFG-09..CFG-13 all go through loadConfig() — the READ path. The write
  //    path (addCompany → assertValid → commitDoc) had NO behavioural test at
  //    all, so deleting its checkDatabaseUrl call left all 14 tests green.
  //    Measured: injecting that regression produced zero red tests.
  //    A guard nobody exercises is not a guard.
  it('[CFG-14] ⭐ addCompany() REFUSES a literal password', async () => {
    write(good('postgres://restocost_app:${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_alpha'));
    const { resetCache, addCompany } = await import('./config.js');
    resetCache();
    expect(() =>
      addCompany({
        id: 'bravo', name: 'Bravo', subdomain: 'bravo.example.com', port: 3015,
        databaseUrl: 'postgres://restocost_app:literalSecret@127.0.0.1:5433/restocost_bravo',
      }),
    ).toThrow(/حرفية/);
  });

  it('[CFG-15] ⭐ addCompany() REFUSES CHANGE_ME', async () => {
    write(good('postgres://restocost_app:${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_alpha'));
    const { resetCache, addCompany } = await import('./config.js');
    resetCache();
    expect(() =>
      addCompany({
        id: 'bravo', name: 'Bravo', subdomain: 'bravo.example.com', port: 3015,
        databaseUrl: 'postgres://restocost_app:CHANGE_ME@127.0.0.1:5433/restocost_bravo',
      }),
    ).toThrow(/CHANGE_ME/);
  });

  it('[CFG-16] ⭐ addCompany() ACCEPTS a good entry and the YAML keeps its comments', async () => {
    // ⭐ not just a rejection test. If the guard rejects everything, CFG-14/15
    //    pass while the Control Plane is unusable. This proves a valid company
    //    still gets through AND that the atomic write preserves comments.
    write(
      '# ⭐ hand-written comment that must survive\n' +
      'control:\n  port: 3010\n  subdomain: control.example.com\n' +
      'companies:\n  - id: alpha\n    name: Alpha\n' +
      '    subdomain: alpha.example.com\n    port: 3011\n' +
      '    databaseUrl: postgres://restocost_app:${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_alpha\n',
    );
    process.env['COMPANY_DB_PASSWORD'] = 'pw';
    const { resetCache, addCompany } = await import('./config.js');
    resetCache();
    addCompany({
      id: 'bravo', name: 'Bravo', subdomain: 'bravo.example.com', port: 3015,
      databaseUrl: 'postgres://restocost_app:${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_bravo',
    });
    const { readFileSync } = await import('node:fs');
    const saved = readFileSync(join(dir, 'companies.yaml'), 'utf8');
    expect(saved).toContain('hand-written comment that must survive');
    expect(saved).toContain('bravo');
    expect(saved).not.toContain('CHANGE_ME');
    expect(saved).not.toContain('literalSecret');
  });

  it('[CFG-17] ⭐ saveDoc writes atomically: tmp+rename, and leaves no .tmp behind', async () => {
    // ⭐ Measured gap: replacing renameSync with a direct writeFileSync left
    //    every other test green — including CFG-16's comment check. Nothing
    //    guarded the atomicity itself.
    //    Why it matters: a half-written companies.yaml is not a corrupted file
    //    the app can recover from, it is an empty or truncated one. Both
    //    companies vanish from the Control Plane with no error anywhere.
    write(good('postgres://restocost_app:${COMPANY_DB_PASSWORD}@127.0.0.1:5433/restocost_alpha'));
    const { resetCache, loadDoc, saveDoc } = await import('./config.js');
    const { existsSync } = await import('node:fs');
    resetCache();

    saveDoc(loadDoc());   // a no-op rewrite: same content, must still be atomic

    expect(existsSync(join(dir, 'companies.yaml.tmp'))).toBe(false);
    // the real file must be intact and still parse
    const { resetCache: rc2, loadConfig } = await import('./config.js');
    rc2();
    expect(loadConfig().companies[0]!.id).toBe('alpha');
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
    // ⭐ النظام الثالث لسه غير محدد — لازم يقبل سطر واحد يغيّره
    expect(text).toMatch(/pos:\s*\n\s*source: foodics/);
    // ⭐⛔ و company3 لازم يبدأ بـ source: none وليس foodics.
    //    سبب التسجيل: لو تُرك foodics افتراضياً، أول استيراد لهذه
    //    الشركة سيُكتب pos_source='foodics' لبيانات ليست من Foodics،
    //    وجدول الربط سينتج 34 صفاً وهمياً لنفس الأصناف.
    const c3 = text.slice(text.indexOf('id: company3'));
    expect(c3).toMatch(/source: none/);
    expect(c3).not.toMatch(/source: foodics/);
    // ⭐⚠️ واسمها مؤقت — الاختبار يقول ذلك صراحةً حتى لا يتحول
    //    إلى اسم دائم بالصدفة.
    expect(c3).toContain('TODO: rename');

    expect(text).not.toContain('CHANGE_ME');
    expect(text).toContain('${COMPANY_DB_PASSWORD}');
    expect(text).not.toMatch(/@127\.0\.0\.1:5432\//);
    expect(text).toMatch(/@127\.0\.0\.1:5433\//);

    // ⭐⛔ ولا منفذ ولا نطاق مكرر — الفحص موجود في assertValid لكن
    //    هذا الملف يتغير باليد. تكرار المنفذ يعني عمليتين على نفس
    //    المنفذ: واحدة ما تراه اللوحة.
    const ports = [...text.matchAll(/^\s+port:\s*(\d+)/gm)].map((m) => m[1]!);
    expect(new Set(ports).size, `duplicate port in ${JSON.stringify(ports)}`).toBe(ports.length);
    const subs = [...text.matchAll(/^\s+subdomain:\s*(\S+)/gm)].map((m) => m[1]!);
    expect(new Set(subs).size, `duplicate subdomain in ${JSON.stringify(subs)}`).toBe(subs.length);
  });

  it('[CFG-26] ⭐ the SHIPPED file passes loadConfig() with company3 inactive', async () => {
    // ⭐ لماذا هذا غير CFG-13: CFG-13 يفحص النص. هذا يستدعي
    //    loadConfig() على الملف الحقيقي، فأي شركة مرفوضة توقف
    //    Control Plane عن الإقلاع بالكامل — والاثنتان متعاشتان.
    const { resetCache, loadConfig, listCompanies } = await import('./config.js');
    process.env['COMPANIES_CONFIG'] = '';
    delete process.env['COMPANIES_CONFIG'];
    resetCache();
    const cfg = loadConfig();
    expect(cfg.companies.length).toBe(3);

    // ⭐ company3 غير مفعّلة ⇒ لا تظهر في اللوحة ⇒ لا probe على 3013
    const active = listCompanies().map((c) => c.id);
    expect(active).toContain('massobi');
    expect(active).toContain('bukharo');
    expect(active).not.toContain('company3');

    // ⭐Negative control: لو كانت مفعّلة أو مرفوضة، الاخنان يفشلان.
    expect(cfg.companies.find((c) => c.id === 'company3')!.active).toBe(false);
  });
});