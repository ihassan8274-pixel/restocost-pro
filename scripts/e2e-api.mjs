// E2E — المسار الحرج كما يراه المستخدم الحقيقي.
//
// لماذا عبر nginx وليس مباشرة على :3033؟
// لأن الخلل الذي كشفه الفحص كان هنا تحديداً: `nginx-spa.conf` كان بلا أي
// `proxy_pass`، فكل نداء `/api/...` كان يُبتلع بـ SPA fallback ويعيد
// `index.html` بحالة 200 — بينما كانت كل الحاويات تُبلّغ "healthy".
// أي اختبار يضرب :3033 مباشرة كان سينجح بينما التطبيق مكسور كلياً.
//
// لذلك يضرب هذا السكربت **المنشأة العامة وحدها** (النافذة التي يفتحها
// المستخدم)، ويرفض أي ردّ ليس JSON — لأن `200 text/html` عند طلب `/api`
// ليس "نجاحاً"، بل هو الخلل نفسه.
//
// الاستخدام:
//   node scripts/e2e-api.mjs                       # افتراضي http://127.0.0.1:3000
//   E2E_BASE_URL=http://127.0.0.1:8080 node scripts/e2e-api.mjs
//
// يتوقّع **قاعدة فارغة** (كما في CI): أول تسجيل يمرّ في وضع `first-admin`.
//
// لا تبعيات — fetch مدمج في Node 18+.

const BASE = (process.env.E2E_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');

const EMAIL = process.env.E2E_EMAIL || `e2e-${Date.now()}@restocost.test`;
const PASSWORD = process.env.E2E_PASSWORD || 'E2ePass123456789';

let passed = 0;
let failed = 0;

const out = (s) => process.stdout.write(s + '\n');
const ok = (name, detail = '') => {
  passed++;
  out(`  ok  ${name}${detail ? ` — ${detail}` : ''}`);
};
const bad = (name, detail) => {
  failed++;
  out(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};
const check = (cond, name, detail) => (cond ? ok(name, detail) : bad(name, detail));

/**
 *  A single request against the public origin.
 *
 *  The `wantJson` assertion is the heart of this file: a `/api/*` response
 *  served as text/html means nginx swallowed it into the SPA fallback, which
 *  is a hard failure regardless of what the status code says.
 */
async function req(method, path, { token, body } = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep null */
  }

  return { status: res.status, ct, text, json };
}

function assertJson(r, label, { allowHtmlOk = false } = {}) {
  const isJson = r.ct.includes('application/json') && r.json !== null;
  const looksLikeHtml = /^\s*<!doctype html>/i.test(r.text);
  if (looksLikeHtml && !allowHtmlOk) {
    bad(label, `the API returned index.html (HTTP ${r.status}) — nginx is not proxying /api`);
    return false;
  }
  if (!isJson) {
    bad(label, `expected JSON, got "${r.ct}" (HTTP ${r.status}): ${r.text.slice(0, 120)}`);
    return false;
  }
  return true;
}

async function step(label, fn) {
  out(`\n— ${label}`);
  try {
    await fn();
  } catch (e) {
    bad(label, `threw: ${e && e.message ? e.message : e}`);
  }
}

// ─── البدء ────────────────────────────────────────────────────────────────────

out(`E2E — critical path against PUBLIC origin: ${BASE}`);
out(`account: ${EMAIL} (fresh-database run)`);

await step('GET /api/health — reaches PostgreSQL, not a silent SQLite fallback', async () => {
  const r = await req('GET', '/api/health');
  if (!assertJson(r, 'health')) return;
  check(r.status === 200, 'health HTTP 200', `got ${r.status}`);
  check(r.json.backend === 'postgresql', 'backend is postgresql', `got ${JSON.stringify(r.json.backend)}`);
  check(r.json.db === 'ok', 'db ok', `got ${JSON.stringify(r.json.db)}`);
});

let registerToken = null;

await step('POST /api/auth/register — first admin on an empty database', async () => {
  const r = await req('POST', '/api/auth/register', {
    body: { name: 'E2E Admin', email: EMAIL, password: PASSWORD, role: 'admin', branchId: 'main' },
  });
  if (!assertJson(r, 'register')) return;
  check(r.status === 200 && r.json.ok === true, 'register accepted', `HTTP ${r.status} ok=${r.json.ok} ${r.json.error || ''}`);
  registerToken = r.json.token || null;
  check(Boolean(registerToken), 'register returned a session token');
  check(r.json.user && r.json.user.role === 'admin', 'first user is an admin', `got ${r.json.user && r.json.user.role}`);
});

const authed = (token) => ({ token });

await step('GET /api/bootstrap — the snapshot the UI needs, with the session', async () => {
  if (!registerToken) return bad('bootstrap', 'no token from register');
  const r = await req('GET', '/api/bootstrap', authed(registerToken));
  if (!assertJson(r, 'bootstrap')) return;
  check(r.status === 200, 'bootstrap HTTP 200', `got ${r.status}`);
  check(r.json.ok === true, 'bootstrap ok', JSON.stringify(r.json).slice(0, 120));
});

await step('GET /api/auth/me — who am I', async () => {
  if (!registerToken) return bad('me', 'no token');
  const r = await req('GET', '/api/auth/me', authed(registerToken));
  if (!assertJson(r, 'me')) return;
  check(r.status === 200 && r.json.ok === true, 'me OK', `HTTP ${r.status}`);
  check(r.json.user && r.json.user.email === EMAIL.toLowerCase(), 'email round-trips', r.json.user && r.json.user.email);
});

await step('POST /api/auth/logout — the session must actually end', async () => {
  if (!registerToken) return bad('logout', 'no token');
  const r = await req('POST', '/api/auth/logout', authed(registerToken));
  if (!assertJson(r, 'logout')) return;
  check(r.status === 200 && r.json.ok === true, 'logout OK', `HTTP ${r.status}`);
});

await step('GET /api/auth/me after logout — token must be rejected', async () => {
  if (!registerToken) return bad('post-logout me', 'no token');
  const r = await req('GET', '/api/auth/me', authed(registerToken));
  if (!assertJson(r, 'post-logout me')) return;
  check(r.status === 401, 'stale token rejected with 401', `got ${r.status}`);
});

let loginToken = null;

await step('POST /api/auth/login — the path the login screen actually calls', async () => {
  const r = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (!assertJson(r, 'login')) return;
  check(r.status === 200 && r.json.ok === true, 'login accepted', `HTTP ${r.status} ${r.json.error || ''}`);
  loginToken = r.json.token || null;
  check(Boolean(loginToken), 'login returned a session token');
});

await step('GET /api/bootstrap with the fresh login token', async () => {
  if (!loginToken) return bad('bootstrap (login)', 'no token from login');
  const r = await req('GET', '/api/bootstrap', authed(loginToken));
  if (!assertJson(r, 'bootstrap (login)')) return;
  check(r.status === 200 && r.json.ok === true, 'bootstrap OK after login', `HTTP ${r.status}`);
});

await step('POST /api/auth/login with a wrong password — generic denial, no enumeration', async () => {
  const r = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: 'WrongPassword999' } });
  if (!assertJson(r, 'wrong-password login')) return;
  check(r.json.ok === false, 'wrong password denied', `ok=${r.json.ok}`);
  // The server collapses every failure into one message; none of them may leak
  // whether the account exists.
  const err = String(r.json.error || '');
  check(!/غير مسجل|موقوف|بانتظار التفعيل/.test(err), 'no account-existence leak in the error', err);
  check(err.includes('غير صحيحة'), 'generic message used', err);
});

// ─── النتيجة ─────────────────────────────────────────────────────────────────

out('');
out('='.repeat(60));
if (failed === 0) {
  out(`E2E PASSED — ${passed} assertion(s)`);
  out(`Stack responded as a user would experience it: ${BASE}`);
  process.exit(0);
}
out(`E2E FAILED — ${failed} failed, ${passed} passed`);
process.exit(1);
