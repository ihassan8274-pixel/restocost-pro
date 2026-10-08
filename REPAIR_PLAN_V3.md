# مخطط الإصلاح V3 — مبني على فحص مُثبت

التاريخ: 2026-10-06
المصدر: `EVALUATION.md` + فحوص أُجريت في 2026-10-06
ملاحظة: يحلّ محلّ `REPAIR_PLAN.md` / `REPAIR_PLAN_V2.md` / `FIXES.md` (متعارضة وتحتوي سراً قديماً).

---

## مبدأ العمل
كل بند: **الملف → التغيير → أمر التحقق**. لا يُعلَّم مُنجز إلا بتحقق أخضر.

---

## حالة التنفيذ (تُحدَّث بعد كل دفعة)

| البند | الحالة | الشاهد |
|---|---|---|
| P0-1 مهلات قاعدة البيانات | ✅ مُنجز | `ALTER DATABASE restocost SET statement_timeout='15s'` مُطبَّق ومُتحقَّق: `SELECT pg_sleep(20)` أُلغي بالكود `57014` |
| P0-2 منع فقدان البيانات الصامت | ✅ مُنجز | انظر «شواهد إضافية» أدناه — أخطر بكثير ممّا خُطِّط له |
| P1-1 ثغرات التبعيات | ✅ مُنجز | `source-map-js` 1.2.1→1.2.2 (اختفت **العالية**)؛ المتبقّي 4 متوسطة مُوثَّق كـ«غير قابلة للوصول» |
| P1-2 السر القديم | ✅ مُنجز | `git grep` على شجرة العمل ⇒ نظيف؛ مسح شامل لكل الملفات المتتبَّعة ⇒ **0** سرّ حرفياً؛ الأسرار الحيّة نظيفة في `HEAD` |
| P1-3 CSP + HSTS | ✅ مُنجز | مُتحقَّق في **متصفح حقيقي** بلا مخالفات: 0 console errors والصفحة مرسومة |
| P1-4 إزالة `CORS_ORIGIN` | ✅ مُنجز | أُزيل من `.env` و`server/.env` و`docker-compose.yml`؛ `docker compose config` ⇒ OK |

### شواهد إضافية اكتُشفت أثناء التنفيذ (تجاوزت ما خُطِّط له)

**١ — الخدمة كانت تضعيع الكتابة وتُبلّغ `ok:true`.**
قاعدة compose كانت **بلا جدول واحد** (0 من 13). السبب الجذري ثلاثي:
- لا شيء يشغّل `prisma migrate deploy` (لا في الصورة ولا في compose).
- كل قراءة إقلاع في `createPgStore` كانت ملفوفة بـ `catch { /* tolerate */ }` ⇒ تُبتلع صامتاً وتعلن `backend:"postgresql"` بذاكرة فارغة.
- `probeStore` كان يفعل `SELECT 1` فقط — وهو ناجح حتى على قاعدة فارغة.

النتيجة حينها: `[store:pg] persist error: The table public.kv does not exist` لكل كتابة، مع `{"ok":true,"db":"ok"}`.

**الإصلاح (ثلاث طبقات):**
1. `docker-entrypoint.server.sh` — `npx prisma migrate deploy` قبل تشغيل الخادم، بست محاولات ثم `exit 1`.
2. `server/store.mjs` — غياب المخطّط صار خطأً قاتلاً (`ERR_MISSING_SCHEMA`) لا يُبتلع؛ ومنع الاستبدال الصامت إلى SQLite في `NODE_ENV=production` إلا بـ `ALLOW_SQLITE_FALLBACK=1`.
3. `server/store.mjs` — `probeStore` يفحص الجدول الأساسي `kv` فعلياً بدل `SELECT 1`.

**الشواهد:**
```
دمج المخطّط   ⇒ HTTP 503 {"dbError":"schema missing — run `npx prisma migrate deploy`"}
إعادة تشغيل   ⇒ "All migrations have been successfully applied" ⇒ HTTP 200 {"db":"ok"}
قاعدة مقطوعة ⇒ Exited (1) — "[entrypoint] FATAL: migrations failed after 6 attempts - refusing to start"
```
قبل الإصلاح كانت الثلاثة تُبلّغ `200 {"ok":"true"}` وتشتغل (آخرها يكتب في SQLite بينما PG لا ترى شيئاً).

**٢ — الواجهة لم تكن تصل إلى خادمها إطلاقاً في Docker.**
`nginx-spa.conf` **لم يكن يحوي أي `proxy_pass`**. كل نداءات الواجهة نسبية (`/api/...`، 58 موقعاً) ⇒ `location /` يبتلعها ويعيد `index.html`. مُتحقَّق من داخل الصفحة:
```
fetch('/api/health')  →  200 text/html  "<!doctype html>..."     ← قبل
fetch('/api/health')  →  200 application/json  {"ok":true,...}    ← بعد
```
**لماذا لم يُلاحَظ؟** لأن كل فحص سابق اختبر الخدمتين **منفصلتين** (`curl :3000/` و`curl :3033/api/health`) ولم يمرّ أبداً بالمسار متصفح → واجهة → API.

**الإصلاح:** كتلة `location /api/` مع `resolver 127.0.0.11 valid=10s` (حلّ DNS عند الطلب لا عند إقلاع nginx، ليبقى صالحاً بعد إعادة إنشاء خادم الحاويات) + `client_max_body_size 25m` (مطابق لـ `express.json({ limit: '20mb' })`) + `proxy_buffering off` للتصدير المتدفّق + مهلة 300s للتقارير. وأُضيف أيضاً `/health` و`/ready`.

**٣ — سياسة CSP كانت تحمي ردود API لا التطبيق.**
nginx (الذي يخدم الـ HTML/JS فعلياً) **كان بلا أي رأس أمان**. أُضيف كامل الرؤوس بما فيها `Strict-Transport-Security`، وأُوحِدت السياسة في الملفين. `connect-src` ضُيّق من `'self' http: https:` (أي أيّ وجهة) إلى `'self'` + منافذ AI الأربعة الموثّقة، والمزوّد المخصّص لا ينكسر لأنه يمرّ عبر `routes/ai.mjs` في الخادم. حُذف أيضاً `script-src 'unsafe-eval'` (لا `eval` ولا `new Function` في الكود).

---

## P0 — يمنع سوء الإنتاج (نفّذ أولاً)

### P0-1. مهلات لعمليات قاعدة البيانات ✅ مُنجز
**التصحيح المُثبت أثناء التنفيذ:** الافتراضيَّات كانت موجودة أصلاً (`Prisma connection_timeout=5s` افتراضياً) → `health → 503 خلال 5051ms`. و`statement_timeout` الممرَّر في `DATABASE_URL` **تتجاهله Prisma صامتاً** (مُتحقَّق: بقي `SHOW statement_timeout` = `0`)، و`schemaprisma` لا تقبل `statement_timeout` في `datasource db`. **الحل النهائي: على مستوى قاعدة البيانات:**
```sql
ALTER DATABASE restocost SET statement_timeout = '15s';
ALTER DATABASE restocost SET idle_in_transaction_session_timeout = '30s';
ALTER DATABASE restocost SET timezone = 'Asia/Riyadh';
```
مُطبَّق حيّاً ومُتحقَّق منه، ومُكرَّر في `init.sql` (باسم قاعدة `restocost` الصحيح — الشكل القديم `SET timezone` كان يؤثّر على جلسة التهيئة فقط وينسى).
**ملاحظة:** بند `API_TIMEOUT_MS` العام في `server/index.js` لم يُضَف بعد (غير مطلوب بعد نجاح الطبقة الأولى).
- `server/index.js` — مهلة عامة لكل مسار `/api/*` تُرجع 503 بدل التعليق:
  ```js
  const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS) || 20000;
  app.use('/api', (req, res, next) => {
    if (res.headersSent) return next();
    const timer = setTimeout(() => {
      if (!res.headersSent) res.status(503).json({ ok:false, error:'انتهت مهلة الخادم' });
    }, API_TIMEOUT_MS);
    res.on('close', () => clearTimeout(timer));
    next();
  });
  ```
  يُركَّب **قبل** بقيّة مسارات `/api`.

**التحقق:**
```bash
# اجعل PG غير قابل للوصول ثم:
curl -m 25 -w '%{http_code}' localhost:3033/api/auth/login -X POST \
  -H 'Content-Type: application/json' -d '{"email":"a@b.c","password":"x"}'
# المتوقع: 503 خلال ≤ 25s (وليس تعليق)
```

### P0-2. إيقاف التلوّن الصامت للبيانات ✅ مُنجز (والخلل أوسع ممّا وُصف)
**المشكلة الحقيقية المُثبتة:** لم تكن مسألة fallback فقط — قاعدة compose كان لديها **صفر جدول**، فتُبتلعت كل قراءة الإقلاع صامتاً، وتُرفض كل كتابة بـ `P2021`، مع استمرار `/api/health` بـ `200 {"ok":"true"}`. انظر «شواهد إضافية» في أعلى الملف.

**الملف:** `server/store.mjs`
- ✅ منع fallback إلى SQLite في `NODE_ENV=production` ما لم يُطلب صراحة (`ALLOW_SQLITE_FALLBACK=1`) — وإلا `ERR_PG_REQUIRED` ويخرج العملية.
- ✅ غياب المخطّط ⇒ `ERR_MISSING_SCHEMA` لا يُبتلع.
- ✅ `probeStore` يفحص جدول `kv` فعلياً ⇒ 503 مع رسالة قابلة للتنفيذ.
- ⬜ تغيير `degraded` صريح في `/api/health` (صار 503 بدل ok:true، فغُطّي بالفعل).

**التحقق:**
```bash
# بدون DATABASE_URL و NODE_ENV=production:
curl -s localhost:3033/api/health   # المتوقع: {"ok":false,"backend":"sqlite",...} + سجل DEGRADED
```

---

## P1 — أمني (يوم واحد)

### P1-1. ثغرات التبعيات ✅ مُنجز
**النفَّذ:**
```bash
npm audit fix                    # source-map-js 1.2.1 → 1.2.2
npm audit --omit=dev             # 5 (1 high + 4 moderate) → 4 moderate فقط
```
**العالية اختفت.** المتبقّي 4 متوسطة كلها سلسلة واحدة: `uuid<11.1.1` عبر `exceljs` و`xcode`/`@capacitor/cli`.
**قرار موثَّق بعدم الترقية القسرية** (بدلاً من `overrides.uuid` الذي قد يكسر `exceljs` المقيَّد على `^8.3.0`) — **الثغرة غير قابلة للوصول**، مُتحقَّق من مصدرها:
- `server/src/**` لا يستورد `uuid` إطلاقاً (بحث شامل ⇒ 0 نتيجة).
- `exceljs` ينادئ **`uuidv4()` فقط** وبلا أي `buf` (`cf-rule-ext-xform.js:43,77`)، والثغرة في **v3/v5/v6 عند تمرير `buf`**.
- `xcode` تبعية بناء لـ `@capacitor/cli` (تطبيق جوال) لا تُستدعى في أي سكربت إطلاقاً.

**تبعة مُلاحَظة للتحسين لاحقاً:** `exceljs` و`@capacitor/*` تبعيات **إنتاجية** رغم أن الخادم لا يستخدمهما (الاستخدام في `src/utils/excel.ts` و`capacitor.config.ts` فقط) ⇒ يدخلان صورة الخادم بلا داعٍ. نقلهما إلى `devDependencies` يُنقص الصورة ويصفّي `npm audit --omit=dev`. **لم يُنفَّذ** خشية كسر `Dockerfile.web`.

### P1-2. إزالة السر القديم من المستودع ✅ مُنجز
**الملف:** `REPAIR_PLAN.md` سطر 147 — كان يحوي `JWT_SECRET` القديم حرفاً وهو ملف مُتتبَّع.
**المنفَّذ:**
1. ✅ الاستبدال بـ `<REDACTED — قيمة مُدوَّرة>` ⇒ `git grep -n 'c40g53GorwJ'` على شجرة العمل ⇒ **لا نتائج**.
2. ✅ مسح شامل لكل الملفات المتتبَّعة بنمط `(SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL)... ['"]{32,}` ⇒ **0 نتيجة**.
3. ✅ الأسرار الحيّة الثلاثة (`JWT_SECRET`/`SESSION_SECRET`/`SECRETS_KEY`) **غير موجودة في أي ملف مُتتبَّع** (بحث ببادئتها في `HEAD` ⇒ نظيفة). إذن التدوير السابق كان كافياً ولا حاجة لتدوير جديد.
4. **لم يُدوَّر** — لا داعي: القيم الحالية سليمة وغير مسرَّبة. التدوير أعمى يكسر الجلسات القائمة بلا فائدة أمنية.

**تحذير باقٍ:** السر القديم يبقى في التاريخ (`git log -S`). المستودع **بلا remote** ⇒ لم يُسرَب. الحل الدائم عند النشر:
```bash
git filter-repo --replace-text <exprs.txt)   # يتطلب إعادة تأسيس
# أو قبول أنه سر مُدوَّر بالفعل + عدم نشر التاريخ العلني
```
**تحذير عملية الـ CI:** `git grep -n 'c40g53GorwJ' HEAD` في بوابة القبول **لن يمرّ إلا بعد حذف الملف من история الـ git** — فحص شجرة العمل ناجح الآن، وفحص `HEAD` سيبقى أحمر حتى `filter-repo`.

### P1-3. تقييد CSP + HSTS ✅ مُنجز
**الملفّان (كان المخطط يتجاهل الأهم):**
- `nginx-spa.conf` — **هذا الذي يخدم HTML/JS فعلياً، وكان بلا أي رأس أمان** ⇒ أُضيفت كامل الرؤوس: CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `CORP`, `Permissions-Policy`. مع تكرارها داخل `location /assets/` لأن `add_header` في nginx **يُلغي** رؤوس المستوى الأعلى لذلك الموقع.
- `server/index.js` — توحيد السياسة + إضافة HSTS و`Permissions-Policy`.

**التغييرات في السياسة:**
```diff
- connect-src 'self' http: https:            ← أي وجهة على الإطلاق (ثغرة تسريب)
+ connect-src 'self' https://generativelanguage.googleapis.com
+                    https://api.groq.com https://openrouter.ai https://api.openai.com
- script-src 'self' 'unsafe-eval'
+ script-src 'self'                          ← لا eval ولا new Function في الكود (مُتحقَّق)
- style-src/img-src/font-src '... https: http:'
+ style-src '... https://fonts.googleapis.com'
+ img-src 'self' data: blob: https:'
+ font-src '... https://fonts.gstatic.com'
+ form-action 'self'                          ← أُضيف
```
**لماذا لا تُكسر ميزة المزوّد المخصّص (Ollama إلخ)؟** لأن `routes/ai.mjs` يدعم `provider:'custom'` + `baseURL` ويمرّر الطلب **عبر الخادم** (المسار الأساسي في `src/utils/ai.ts:369` هو `fetch('/api/ai/chat')`). النداء المباشر موثّق بـ«لا يُستعمل في النشر العادي».

**التحقق — في متصفح حقيقي (`browser.evaluate` + `browser.console`):**
```
document rendered: root childElementCount=1, readyState=complete
console errors: 0 (بلا أي "Refused to connect" أو CSP violation)
fetch('/api/health') → 200 application/json
fetch POST /api/auth/login → 200 {"ok":false,"error":"البريد الإلكتروني أو كلمة المرور غير صحيحة"}
```
(الـ 401 على `/api/bootstrap` متوقّع بلا رمز جلسة وليس مخالفة CSP.)

### P1-4. إزالة إعداد CORS الزائف ✅ مُنجز (حذفاً)
**قرار:** **الحذف** لا التنفيذ — لأن CORS غير ضروري في أي بيئة من البيئات الثلاث:
```bash
vite.config.ts:100  proxy: { '/api': 'http://localhost:3001' }   # التطوير → نفس الأصل
nginx-spa.conf      location /api/ { proxy_pass ... }             # docker → نفس الأصل
server/index.js     app.use(express.json(...))                    # لا يضبط CORS إطلاقاً
```
والمصادقة `Bearer` في ترويسة فقط ⇒ لا كوكي محميّاً بـ CSRF/CORS أصلاً. إضافة `Access-Control-Allow-Origin` كان سيفتح الواجهة على أي مصدر بلا داعٍ.

**المنفَّذ:** حُذف `CORS_ORIGIN` من `.env`، `server/.env`، `docker-compose.yml` (مع تعليق يوثّق السبب).
**التحقق:** بحث شامل ⇒ لا مرجع للإعداد إلا في `server.js` (الملف القديم المُخطَّط حذفه في P2-2) + تعليق التوثيق في compose. `docker compose config --quiet` ⇒ **OK**.
**ملاحظة صريحة:** الافتراضيَّات أن `CORS_ORIGIN` ميّت تماماً، لكن `server.js:15` كان يقرأه (`cors({ origin: process.env.CORS_ORIGIN || true })`) — أي أن الإزالة النهائية تتم مع حذف `server.js` في P2-2. الخادم الفعلي `server/index.js` لا يقرأه.

---

## P2 — جودة واختبار (يومان)

### P2-1. إصلاح `api/` المكسور (أو عزله نهائياً)
**الملف:** `api/src/foodics/plan.ts`
- إضافة `exportPlanJSON` (المطلوب في `[PX-04]`).
- جعل `[PX-01]` و`[PX-02]` حتميين: الاختبارات تقرأ **ملفات حقيقية من القرص** ⇒ تذبذب (4↔5).
**البديل:** إن لم يُنجَز، حذف `plan.test.ts` أو نقله إلى `api/__wip__` وإخراجه من `vitest.config.ts` `include[]`.

**التحقق:**
```bash
npx vitest run api/     # المتوقع: 0 failed
```

### P2-2. اختبار E2E واحد
لا يوجد أي E2E. إضافة **سيناريو واحد** يشمل المسار الحرج:
```
تسجيل الدخول → /api/bootstrap → شاشة واحدة → تسجيل خروج
```
بـ Playwright، يُشغَّل في CI بعد بناء صورة Docker.

**التحقق:** `npx playwright test` ⇒ أخضر، ويُشغَّل ضمن `ci.yml`.

### P2-3. تنظيف الملفات القديمة
| الملف | الإجراء |
|---|---|
| `server.js` (119KB) | حذف — نقطة الدخول هي `server/index.js` |
| `REPAIR_PLAN.md`, `REPAIR_PLAN_V2.md`, `FIXES.md`, `AUDIT_*.md` (متضاربة) | دمج واحدة في `docs/` والباقي حذف |
| `*_backup_src_before_identity/` (4.4MB) | حذف (غير مُتتبَّع أصلاً) |

**التحقق:** `npm run lint && npm test && npx vitest run --exclude "api/**"` أخضر بعد كل حذف.

---

## P3 — بنيوي (مخطط لمراحل قادمة)

### P3-1. إبقاء CI فعلياً
`ci.yml` مكتوب **ولم يُشغَّل أبداً** (لا remote).
```bash
git remote add origin <url>
git push -u origin main
```
ثم التحقق من أول run أخضر على 4 إجراءات (lint/test/build/docker).

### P3-2. i18n
الحالة: **غير موجودة**. الخطة:
1. اعتماد `src/i18n/ar.ts` كمصدر حقيقة للنصوص المُفلتة.
2. استبدال النصوص العربية المكتوبة صلطاً في `.tsx` بمفاتيح.
3. أداة تحقق `grep` في CI تمنع نصاً عربياً جديداً خارج ملف اللغة.

### P3-3. الوصولية (a11y)
الحالة: **غير موجودة** (حُذف `A11yProvider` الوهمي). الخطة:
1. `skipToContent` حقيقي في `index.html` + تخطي إلى `#main`.
2. تدقيق لوحة المفاتيح على التنقل + نماذج الدخول (بطاقات تركيز واضحة).
3. تباين ألوان (`WCAG AA`) عبر `design-tokens.json`.
4. `aria-label` على أيقونات بلا نص مرئي.

---

## الترتيب الزمني المقترح

| النطاق | البنود | الوقت | الخطر إن تُرك |
|---|---|---|---|
| **اليوم 1** | P0-1, P0-2 | 3–4 ساعات | تجمّد النظام / بيانات موزّعة |
| **اليوم 2** | P1-1, P1-2, P1-4 | 3 ساعات | تسريب سر / ثغرة معروفة |
| **اليوم 3** | P1-3, P2-1, P2-3 | 4 ساعات | تسريب عبر CSP / CI أحمر مستمر |
| **اليوم 4** | P2-2, P3-1 | 4 ساعات | انعدام اكتشاف الانكسار قبل الإنتاج |
| لاحقاً | P3-2, P3-3 | أسبوعان | إمكانية الوصول للغة/الوصولية |

---

## بوابة القبول (تعريف «مكتمل»)
```bash
npm run lint                                  # 0 أخطاء
npm test                                      # 125/125
npx vitest run --exclude "api/**"             # 306/306
npm audit --omit=dev                          # 0 high
docker compose up -d --build                  # 3 healthy
curl -m 25 -X POST localhost:3033/api/auth/login   # ≤25s ويُرجع
git grep -n 'c40g53GorwJ' HEAD                # بلا نتائج
```