// OpenAPI 3.0.3 وثيقة موجزة لـ RestoCost ERP Pro — توثيق نواة المزامنة والنقاط العامة.
// تُقدَّم عبر GET /api/openapi (بدون مصادقة — مجرد توثيق) وتسهل الربط الخارجي.

const SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'RestoCost ERP Pro API',
    version: '2.0.0',
    description: 'نواة المزامنة والبيانات: السحب الكامل (bootstrap)، بصمة المراجعة (rev/Cdc)، حفظ المجموعات بالدمج بالمعرّف، وترقيم المجموعات الكبيرة بالنقطة (cursor). الترويض: POST /api/collections/:key مع Authorization.',
  },
  servers: [{ url: '{scheme}://{host}:{port}', variables: { scheme: { default: 'http', enum: ['http', 'https'] }, host: { default: 'localhost' }, port: { default: '3001' } } }],
  tags: [
    { name: 'health', description: 'الفحص العام والجاهزية' },
    { name: 'auth', description: 'الدخول والجلسات' },
    { name: 'data', description: 'المزامنة والبيانات' },
  ],
  paths: {
    '/health': {
      get: { tags: ['health'], summary: 'خدمة حية (لا مصادقة)', responses: { 200: { description: 'ok' } } },
    },
    '/ready': {
      get: { tags: ['health'], summary: 'جاهزية قاعدة البيانات (لا مصادقة)', responses: { 200: { description: 'ready + backend' }, 503: { description: 'not_ready' } } },
    },
    '/openapi': {
      get: { tags: ['health'], summary: 'هذه الوثيقة', responses: { 200: { description: 'OpenAPI spec' } } },
    },
    '/api/auth/login': {
      post: {
        tags: ['auth'], summary: 'دخول وإصدار توكن',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' }, totpCode: { type: 'string', description: 'لحسابات المشرفين المفعّلة بالتحقق الثنائي' } } } } } },
        responses: { 200: { description: 'ok + token' } },
      },
    },
    '/api/auth/me': {
      get: { tags: ['auth'], summary: 'المستخدم الحالي', security: [{ bearer: [] }], responses: { 200: { description: 'user' }, 401: { description: 'غير مصادق' } } },
    },
    '/api/bootstrap': {
      get: {
        tags: ['data'], summary: 'سحب كامل لكل المجموعات (الأساس في المزامنة)', security: [{ bearer: [] }],
        responses: { 200: { description: 'ok + data (كل المفاتيح)' }, 401: { description: 'غير مصادق' } },
      },
    },
    '/api/sync-state': {
      get: { tags: ['data'], summary: 'بصمة مراجعة خفيفة (rev/boot) لقرر إن تغيّر شيء', security: [{ bearer: [] }], responses: { 200: { description: '{ rev, boot }' }, 401: { description: 'غير مصادق' } } },
    },
    '/api/sync/cdc': {
      get: {
        tags: ['data'], summary: 'ما تغيّر فقط منذ آخر seq', security: [{ bearer: [] }],
        parameters: [
          { in: 'query', name: 'since', required: true, schema: { type: 'integer' }, description: 'آخر seq عند الجهاز' },
          { in: 'query', name: 'limit', schema: { type: 'integer', maximum: 2000, default: 500 } },
        ],
        responses: { 200: { description: '{ since, changes, rev, windowed }' }, 401: { description: 'غير مصادق' } },
      },
    },
    '/api/collections/{key}': {
      parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' }, description: 'مفتاح المجموعة مثل rcerp_branches' }],
      post: {
        tags: ['data'], summary: 'حفظ مجموعة بدمج بالمعرّف (لا استبدال كامل)', security: [{ bearer: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'array' } } } },
        responses: {
          200: { description: 'ok' },
          401: { description: 'غير مصادق' },
          409: { description: 'شاهد الحماية shrink-overwrite-guard' },
        },
      },
    },
    '/api/collections/{key}/paginated': {
      parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
      get: {
        tags: ['data'], summary: 'صفحة من مجموعة كبيرة بالنقطة (cursor)', security: [{ bearer: [] }],
        parameters: [
          { in: 'query', name: 'cursor', schema: { type: 'string' }, description: 'معتم base64url من الاستجابة السابقة (nextCursor)' },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 2000, default: 500 } },
        ],
        responses: { 200: { description: '{ items, total, nextCursor, start }' }, 401: { description: 'غير مصادق' } },
      },
    },
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'توكن من POST /api/auth/login' } },
  },
  security: [{ bearer: [] }],
};

export const registerOpenApi = (app) => {
  app.get('/api/openapi', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(SPEC);
  });
  // صفحة بسيطة لعرض الوثيقة من المتصفح (HTML بدون مكتبات خارجية).
  app.get('/api/docs', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>RestoCost API</title>
<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;background:#0f172a;color:#e2e8f0}
code{background:#1e293b;padding:.1rem .35rem;border-radius:.3rem}pre{background:#0b1220;padding:1rem;border-radius:.5rem;overflow:auto}
a{color:#38bdf8}</style></head><body><h1>RestoCost ERP Pro — توثيق API</h1>
<p>المواصفة الكاملة متاحة بصيغة OpenAPI 3.0 على <code><a href="/api/openapi">/api/openapi</a></code>.</p>
<p>يمكن فتحها في أي أداة (Swagger UI/Stoplight…) بالأمر:<br><code>npx swagger-cli validate ... </code>أو لصق الرابط في <a href="https://editor.swagger.io" target="_blank" rel="noopener">editor.swagger.io</a>.</p>
<p>نظرة عامة على النقاط الأساسية:</p>
<ul>
<li><code>GET /api/bootstrap</code> — سحب كامل (مصادقة)</li>
<li><code>GET /api/sync-state</code> + <code>GET /api/sync/cdc?since=N</code> — بصمة + سحب ما تغيّر فقط</li>
<li><code>POST /api/collections/:key</code> — حفظ بدمج بالمعرّف (409 على نمط بيانات تجريبية)</li>
<li><code>GET /api/collections/:key/paginated?cursor=…&limit=…</code> — ترقيم المجموعات الكبيرة</li>
<li><code>GET /health</code> + <code>GET /ready</code> — فحص الخدمة والجاهزية</li>
</ul></body></html>`);
  });
};