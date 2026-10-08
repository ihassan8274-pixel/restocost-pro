# مخطط الإصلاح الشامل — خطة تنفيذ مُعتمدة قبل البدء
## RestoCost ERP Pro v2.0.0

**التاريخ:** 2026-10-02
**الحالة المرجعية:** `master` @ `2f04839` — شجرة عمل **نظيفة**
**المرجع التحليلي:** `AUDIT_FINAL_2026-10-02.md`
**الطبيعة:** **خطة فقط — لم يُنفَّذ أي إجراء. بانتظار الموافقة.**

---

# 0. تصحيحات على تقرير الفحص (يجب تطبيقها)

| البند | ما قاله التقرير | الواقع الآن |
|---|---|---|
| تصحيح RBAC | «غير مُودَع» | ✅ **صار مُودَعاً** في `2f04839 fix(security): add read-permission gate`. لم يبقَ إلزام الـ commit — **لكن يبقى إلزام ضمّ الاختبار إلى `npm test`** |
| شجرة العمل | 4 تغييرات | **نظيفة تماماً** |
| ملفات جديدة | — | `scripts/tmp-branch.mjs` (سكربت تشخيصي مؤقت يتصل بـ Prisma) — **يجب حذفه** |
| **اختبارا `server/test/repo/`** | «18 اختباراً ناجحاً معطلاً» | ⚠️ **تصحيح مهم:** هما ينجحان تحت **vitest** فقط. تحت `node --test` **يفشلان** لأنهما يستوردان `from 'vitest'`. ⇒ لا يمكن ببساطة إضافة الـ glob — يجب توحيد المشغّل أولاً |

> **الدليل على التصحيح الأخير:** `node --test "server/test/*.test.mjs" "server/test/repo/*.test.mjs"` ⇒ `✖ failing tests: cdc.test.mjs, repository.test.mjs`.
> السبب: `cdc.test.mjs:3` و`repository.test.mjs:3` ← `import { describe, it, expect } from 'vitest'`، بينما بقية الملفات تستخدم `import { test } from 'node:test'`.

---

# 1. قواعد التنفيذ (تُقرأ قبل أي إجراء)

| # | القاعدة |
|---:|---|
| R1 | **لا تلمس `server/data/` ولا `server/backup-archive/`** إلا للقراءة. قاعدة البيانات تُدار عبر `store.mjs` فقط. |
| R2 | **كل مرحلة تنتهي بـ `git commit` مستقل** قابل للتراجع بـ `git revert` فوراً. لا تدمج مرحلتين في commit. |
| R3 | **كل تعديل يُتبع باختبار** يثبت السلوك قبل/بعد. لا تعديل بلا اختبار إن أمكن. |
| R4 | **لا تُعدّل `dist/`** يدوياً أبداً. يُعاد بناؤه فقط عبر `npm run build`. |
| R5 | **أي تغيير في `server/routes/*` يُختبر عبر `npm test` + تشغيل حقيقي.** |
| R6 | **تغيير قاعدة البيانات (المرحلة 5) ممنوع قبل اجتياز بوابة T5.** |
| R7 | **لا تلمس `.env` القائم.** أضف مفاتيح جديدة فقط. التدوير يدوي من المشغّل. |
| R8 | **أعد قراءة الملف قبل تعديله** — بعض الملفات تغيّرت أثناء التحليل. |
| R9 | **مرحلة واحدة في اليوم.** لا تدمج المرحلتين 5 و6. |
| R10 | **كل commit يبدأ بـ** `fix(security):` أو `perf:` أو `refactor:` أو `chore:` أو `test:` — بلا استثناء. |

---

# 2. خريطة الاعتماديات

```
M0  شبكة الأمان ─────────────────────────────────────────────► شرط لكل شيء
     │
     ├─► M1  الحرجة (24–48 ساعة)
     │      ├─► M2  منع الانحدار (CI + نظافة)
     │      │      └─► M3  المتوسطة
     │      │                ├─► M4  الأداء
     │      │                │      └─► M5  نموذج البيانات  🚧 يحتاج اختبارات
     │      │                └─► M6  البنية (حذف/Router/دمج)
     │      └─► M4 ──► M5 ──► M6
     │
     └─► M7  الجودة المستمرة (متوازٍ من اليوم الأول)
```

**القاعدة الذهبية:** M2 (CI) **قبل** M3. لأن M3 فيه تغييرات سلوكية، وبدون بوابةAutomated لا يمكن التحقق من عدم الانحدار.

---

# 3. المرحلة M0 — شبكة الأمان (يوم واحد) ⛔ شرط مُلزِم

| # | الفعل | الأمر | ملاحظات |
|---:|---|---|---|
| 0.1 | نسخة احتياطية خارجية كاملة | انسخ مجلد `server/data/` + `server/backup-archive/` إلى قرص/تخزين خارج المجلد | **خارج المستودع تماماً** — النسخة داخل نفس القرص لا تحمي من فقد القرص |
| 0.2 | تصدير قاعدة PostgreSQL | `pg_dump` على `restocost2` | راجع `DATABASE_URL` في `.env` |
| 0.3 | فرع إنقاذ | `git branch rescue/pre-repair-2026-10-02` | نقطة رجوع دائمة |
| 0.4 | وسم الحالة | `git tag pre-repair-2026-10-02` | لا يُحذف |
| 0.5 | تسجيل بصمات SHA-256 للأسرار قبل التدوير | `$env:JWT_SECRET`، `SESSION_SECRET`، بصمة المدير الحالية | لتوثيق ما تدوّر |
| 0.6 | قياس خط الأساس | شغّل: `npm test` · `npm run test:repo` · `npm run lint` · `npm run build` وسجّل الأرقام الزمنية | للمقارنة بعد كل مرحلة |
| 0.7 | حذف `scripts/tmp-branch.mjs` | `Remove-Item scripts/tmp-branch.mjs` | ملف تشخيصي مؤقت |

**🚦 بوابة M0 → M1:** لا تبدأ M1 قبل تأكيد 0.1 و 0.3.

---

# 4. المرحلة M1 — إغلاق الثغرات الحرجة (24–48 ساعة)

## 4.1 المجموعة أ — الأسرار المُسرَّبة (DESTRUCTIVE على التاريخ)

| # | الفعل | الأوامر | الخطر | التحقق | التراجع |
|---:|---|---|---|---|---|
| **A1** | تدوير كلمة مرور `admin@restocost.com` | من شاشة إعدادات النظام، أو: احذف السطر `<REDACTED>` وغيّر عبر `/api/auth/change-password` | ⚠️ يعطّل أي جلسة河西ئة تستخدمها | `POST /api/auth/login` بالكلمة الجديدة ينجح، بالقديمة يفشل | لا رجعة — لا تعِد الكلمة القديمة أبداً |
| **A2** | تدوير **كل** كلمات المرور + كل بذور TOTP | لكل مستخدم (15 مستخدماً تقريباً) | ⚠️ يعطّل كل المستخدمين | دخول كل حساب | لا رجعة |
| **A3** | `git rm --cached` للملفات المُسرَّبة | `git rm --cached backup-archive-legacy-before-pg.zip login.json test-login.json tools/.srvcred.json lint-output.txt lint-output2.txt server/prod.pid server/server.err` | آمن (يبقى الملف على القرص) | `git ls-files \| Select-String "zip\|login.json\|srvcred\|lint-output"` ⇒ **فارغ** | `git reset HEAD <file>` |
| **A4** | حذف القيم الصريحة من النصوص | `AUDIT_REPAIR_PLAN.md:8` · `server/verify.mjs:8` · `server/verify-clean.mjs:6` · `server/test-guard.mjs:8` · `server/test-login-detailed.mjs:33-35` · `REPAIR_PLAN.md:147` | آمن | `Select-String -Path "*.md","server/*.mjs" -Pattern "<REDACTED>|JWT_SECRET\s*="` ⇒ **فارغ** | `git checkout` |
| **A5** | **تطهير التاريخ** (اختياري — انظر §11.1) | `git filter-repo --path backup-archive-legacy-before-pg.zip --invert-paths` | 🔴 **إعادة كتابة التاريخ** — تُبطل كل الـ SHAs | `git log --all --oneline -- backup-archive-legacy-before-pg.zip` ⇒ **فارغ** | غير قابل للتراجع ⇒ نسخة من `.git` قبلها |
| **A6** | تدوير أسرار `.env` | `JWT_SECRET` · `SESSION_SECRET` · `DATABASE_URL` كلمة المرور | ⚠️ كسر الاتصال | `npm start` يعمل، `/ready` = 200 | لا رجعة |
| **A7** | **حذف `JWT_SECRET` و`SESSION_SECRET` من `.env` و`.env.example`** | أضف سطراً `# ازالة: النظام يستخدم جلسات معمّاة لا JWT` | **⚠️ كسر `docker-compose.yml`** (يستخدمه) — يُحدَّث في B4 | — | `git checkout` |
| **A8** | تشفير `server/secrets.key.backup-20260921-121034` | احذفه بعد التحقق من decryption | ⚠️ | نسخ احتياطية تقرأ بنجاح | — |

> **⚠️ قرار مطلوب منك:** A5 (تطهير التاريخ) **يستلزم** إبلاغ كل من نسخ المستودع. إذا كان `erp.restocost.shop` أو أي بيئة خارجية تعتمد على هذا الـ git، فالتطهير يكسرها. **الأوصى: نفّذ A1–A4 فوراً، وأجّل A5决策اً منفصلاً.**

## 4.2 المجموعة ب — مسار النشر الخاطئ

| # | الفعل | التفصيل | الخطر | التحقق |
|---:|---|---|---|---|
| **B1** | `Dockerfile:46` | `CMD ["node", "server.js"]` ⇒ `CMD ["server/index.js"]` | منخفض | بناء الصورة وتشغيلها |
| **B2** | `Dockerfile` — إعادة كتابته بالكامل | 46 سطر تُبنى تطبيق Vue ثم `COPY . .` بلا `.dockerignore` | متوسط | `docker build` + `curl /health` |
| **B3** | `railway.json:8` | `"startCommand": "node server.js"` ⇒ `server/index.js` | منخفض | — |
| **B4** | `railway.json:9` | `"healthcheckPath": "/api/health"` ⇒ `"/health"` ⚠️ **المسار `/api/health` غير موجود** — Railway سيفشل كل نشر | منخفض | `curl localhost:3001/health` = 200 |
| **B5** | إنشاء `.dockerignore` | `node_modules` `.env*` `server/.env` `server/secrets.key` `server/data` `server/backup-archive` `server/logs` `backups` `backup7` `.git` `dist` `*.zip` `*.log` `tools/node-portable` | **حاسم** (C7) | `docker run` ⇒ `ls /app/.env` ⇒ **لا يوجد** |
| **B6** | **حذف `server.js` من الجذر** (2,097 سطر) | + `db.js` + `migrate.js` + `seed.js` | ⚠️ راجع 11.2 أولاً | `git ls-files server.js` ⇒ فارغ؛ `npm start` يعمل |
| **B7** | `docker-compose.yml` | حذف 3 أسرار مكتوبة · `command: npm run dev` ⇒ `npm start` · إزالة الربط الحجمي `.:/app` | متوسط | `docker compose up` ⇒ `/health` = 200 |
| **B8** | `capacitor.config.ts:11` | حذف `server: { url: 'https://erp.restocost.shop' }` (يُبطل `webDir: 'dist'` ⇒ لا PWA دون اتصال) | ⚠️ يعطّل الاختبار عن بُعد | `npx cap sync android` |

## 4.3 المجموعة ج — تجاوز المصادقة

| # | الفعل | الملف:السطر | التفصيل |
|---:|---|---|---|
| **C1** | حذف فرع الـ catch في `useAuthCore.ts` | **50–60** | استبدله بـ: `catch { return { ok: false, error: 'تعذّر الاتصال بالخادم — تحقّق من الشبكة' }; }` |
| **C2** | حذف فرع الـ catch في `authStore.ts` | **66–74** | ⚠️ **الأخطر في الكود كله** — لا يتحقق من كلمة المرور إطلاقاً. استبدله بنفس الرسالة |
| **C3** | `src/context/appAuth.ts:20-23` | `verifyPassword` | يحذف `bcryptjs.compare` في المتصفح + يزيل 19.8 ك.ب من التحميل الأول |
| **C4** | `package.json` | احذف `bcryptjs` و`@types/bcryptjs` | C3 يجعلهما بلا استخدام |
| **C5** | `server/seed-pg.mjs:66-76` | يبدّل المستخدمين الموجودين | اجعله `if (userIndex >= 0) continue;` (يطابق `seed.mjs:37-41`) |
| **C6** | `server/routes/auth.mjs:266-291` | `POST /api/users` ينشئ بلا `mustChangePassword` | أضف `mustChangePassword: true` عند الإنشاء بكلمة مرور مولّدة |
| **C7** | `server/index.js:102-108` | `if (me && me.mustChangePassword === true)` ⇒ fail-open | `if (me?.mustChangePassword === true)` **أو** `if (!me) return 403` |
| **C8** | `server/core.mjs:90` | `bcrypt.compareSync` متزامن ~250 م.ث على حلقة الأحداث | اجعله `async` بـ `bcrypt.compare` |

## 4.4 المجموعة د — تحديد المعدل والتحقق من المدخلات

| # | الفعل | الملف | التفصيل |
|---:|---|---|---|
| **D1** | تفعيل `express-rate-limit` | `server/index.js` بعد السطر 42 | `app.use('/api', rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }))` |
| **D2** | حدّ صارم على الكتابة | `server/index.js:42` | `express.json({ limit: '2mb', strict: true })` — ⚠️ **اختبر: هل أي مجموعة تتجاوز 2 م.ب؟** (`rcerp_inventory_movements` = 3.43 م.ب!) ⇒ اجعلها `20mb` للـ collections و`2mb` لغيرها عبر مسارين |
| **D3** | حد على `/invoice-platform*` | `server/index.js:170` | `readRawBody(req, 100MB)` ⇒ `10MB` (راجع: هل المنصة ترفع ملفات PDF كبيرة فعلاً؟) |
| **D4** | حد على `/api/ai/chat` | `server/routes/ai.mjs:152` | `rateLimit({ windowMs: 60_000, max: 10 })` + **فحص `use_ai`** |
| **D5** | حد على `/api/collections/:key` | `server/routes/data.mjs:157` | `rateLimit({ windowMs: 10_000, max: 50 })` (5.6 ألف POST/يوم حالياً) |
| **D6** | حد على `POST /api/report` | `server/routes/report.mjs:94` | `rateLimit({ windowMs: 60_000, max: 5 })` |
| **D7** | حد على `/api/telegram/send*` | `server/routes/data.mjs:674,710,750` | + **فحص `manage_*`** (M4) |
| **D8** | **`zod` لـ `POST /api/report`** | `server/routes/report.mjs:94-133` | ⚠️ **احذف فرع `custom`/`html`/`engine` كلياً** (H3) — `engine` مقبول بـ `/^[a-zA-Z0-9_-]+$/` يعني أي محرك ⇒ SSTI |
| **D9** | `zod` لـ `/api/ai/chat` | `server/routes/ai.mjs` | `{ message: string ≤ 4000, history: array ≤ 20 }` |

## 4.5 المجموعة هـ — بوابة القراءة الناقصة (H1)

| # | الفعل | الملف:السطر | التفصيل |
|---:|---|---|---|
| **E1** | `GET /api/live` | `server/routes/data.mjs:913-959` | مرّر `inventoryValue` و`revenueToday` عبر فحص الدور؛ `waiter`/`counter` لا يراهما |
| **E2** | `GET /api/sync/cdc` | `server/routes/data.mjs:136-149` | ⚠️ **الأخطر** — يعيد `{seq,key,op,ts}` لكل مفتاح. رشّح `key` عبر `canReadCollection` |
| **E3** | `GET /api/intake-inbox` | `server/routes/data.mjs:810-815` | `manage_central_kitchen` أو `manage_grn` |
| **E4** | `GET /api/daily-count-pdf/:id` | `server/routes/data.mjs:853-869` | `mobile_count` + تحقق أن `:id` ينتمي لفرع المستخدم |
| **E5** | **تقييد النطاق على الفرع** | `server/permissions.mjs` | الكود يعترف بتقصيره (`permissions.mjs:203-205`). أضف `branchScope(user)` وطبّقه على `rcerp_pos_orders` · `rcerp_batch_sales` · `rcerp_inventory` · `rcerp_grn` |
| **E6** | قراءة `deniedKeys` في العميل | `src/stores/hooks/useSyncBridge.ts` | الحقل يُعيده الخادم ولا يقرأه العميل ⇒ بيانات الجلسة السابقة تبقى بعد تبديل الدور |
| **E7** | مسح الذاكرة عند الخروج | `src/stores/authStore.ts:77-84` · `useAuthCore.ts:92-103` | امسح المتاجر المُصانة عند logout — 23 مفتاح localStorage فيها بيانات ERP كاملة |

## 4.6 المجموعة و — إصلاحات متفرقة عالية القيمة

| # | الفعل | الملف:السطر |
|---:|---|---|
| **F1** | `rcerp_deleted_ids` مفتوح لكل دور | `server/permissions.mjs:162` — `if (key === 'rcerp_deleted_ids') return { ok: true }` ⇒ اشترط صلاحية كتابة على **الcollection نفسها** (يُغلق M10) |
| **F2** | مرشّح الأثر معتمد على الترتيب | `server/routes/data.mjs:208-235` — `break` عند أول تطابق ⇒ **افحص كل المجموعات** واحسب الصلاحية لأي مجموعة تضمّ المعرّف |
| **F3** | `repository.remove()` بلا فحص | `server/repository.mjs:88-93` — أضف تخطّي `rcerp_users` + `canPurgeTombstone` |
| **F4** | `report.mjs` — حذف فرع HTML | `server/routes/report.mjs:107` — أزل `rows.length > 8000` المطبَّق على المسار الميت فقط |
| **F5** | `hsts` + `rejectUnauthorized: true` + حد TOTP | `server/index.js:65-84` · `db.js:12` · `server/totp.mjs:70-78` (سجّل `lastUsedStep` ورفض إعادة الاستخدام) |
| **F6** | `hash(token)` في `Session` | `prisma/schema.prisma:27-36` — `sha256(token)` بدل النص الصريح (يتطلب migration) |
| **F7** | تعقيم `/api/backup` | `server/routes/backup.mjs:203-209` و `:355-362` — أزل `passwordHash` · `passwordHistory` · `totpSecret` من التصدير |
| **F8** | `sessionUser` بفهرس Map | `server/core.mjs:76-77` — `users.find()` مرتين لكل طلب ⇒ `Map` يُبنى مرة عند الإقلاع |

## 4.7 🚦 بوابة M1

قبل الانتقال لـ M2:
- [ ] `npm test` — 59/59 ✅
- [ ] `npm run test:repo` — 92/92 ✅
- [ ] `npm run lint` — 0 أخطاء ✅
- [ ] `npm run build` — نجاح ✅
- [ ] `docker build` + `docker run` ⇒ `curl /health` = 200
- [ ] دخول حقيقي بـ 5 أدوار مختلفة (admin / branch_manager / cost_controller / storekeeper / waiter) والتحقق من 403 الصحيح على كل مجموعة
- [ ] `Select-String "<REDACTED>"` في كل الملفات ⇒ **فارغ**
- [ ] `git ls-files` ⇒ لا `*.zip` ولا `login.json` ولا `srvcred`
- [ ] **4 commits منفصلة** (أسرار / نشر / مصادقة / صلاحيات)

---

# 5. المرحلة M2 — منع الانحدار + النظافة (يومان)

| # | الفعل | التفصيل | الجهد |
|---:|---|---|---|
| **G1** | **توحيد مشغّل الاختبارات** | ⚠️ **الأهم في هذه المرحلة.** `server/test/repo/*.test.mjs` تستورد `from 'vitest'` بينما البقية `from 'node:test'`. **الخيار المُوصى:** حوّل الملفين إلى `node:test` (يطابق العرف في 7 من 9 ملفات) ⇒ `npm test` يغطي الـ 9 كلها. **الخيار البديل:** وسّع `vitest.config.ts` ليشمل `server/test/repo/**` بـ`environment: 'node'` واحذف `vitest.config.mjs` | **ساعة** |
| **G2** | تحديث `package.json:11` | بعد G1: `"test": "node --test \"server/test/*.test.mjs\" \"server/test/repo/*.test.mjs\""` | 5 د |
| **G3** | `read-permissions.test.ts` في الاختبار الرسمي | بعد G1 يتحوّل تلقائياً (يُستدعى عبر vitest؛ أو انقله إلى `server/test/` كـ `node:test`) | 30 د |
| **G4** | حذف `vitest.config.mjs` | ميت (يُحلَّل `.ts` أولاً) | 1 د |
| **G5** | **`.github/workflows/ci.yml`** | `lint` + `test` + `test:repo` + `build` — **YAML جاهز في `AUDIT_REPORT.md:300-316`** | **ساعة** |
| **G6** | `codeql.yml` أو `trivy` | فحص أسرار + ثغرات الحاويات | 30 د |
| **G7** | `pre-commit` secret scan | يمنع عودة A1 | 30 د |
| **G8** | `.gitignore` | أضف: `lint-output*` · `login.json` · `test-login.json` · `tools/.srvcred.json` · `*.zip` · `scripts/tmp-*.mjs` | 10 د |
| **G9** | حذف الملفات الميتة | `lint-output.txt` · `lint-output2.txt` (143 ك.ب) · `SKILL.md` (22 ك.ب — **عن خادم PowerPoint، لا علاقة له بالمشروع**) | 5 د |
| **G10** | حذف المجلدات الميتة | `deploy_pkg/` (50 م.ب) · `backup7/` (4.15 م.ب) · `qwen app erp/` (0) · `restocost-next/` (0) · `backup-archive/` الجذري (0) · 4 مجلدات `src/components/` فارغة | 15 د |
| **G11** | تتبّع النسخ الاحتياطية | **ممنوع منعاً باتاً** `backups/` — بيانات مستخدمين حقيقية | — |
| **G12** | `Dockerfile` — `HEALTHCHECK` | `HEALTHCHECK CMD curl -f http://localhost:3001/health` — الخيار الوحيد المفقود في B2 | 5 د |

## 5.1 🚦 بوابة M2
- [ ] `npm test` — **77/77** (59 + 18 المعطّلون) ✅
- [ ] `npm run test:repo` — 92/92 (أو ينتقل سكربت واحد)
- [ ] دفع `master` ⇒ **CI أخضر على GitHub**首次 مرة في تاريخ المشروع
- [ ] `git ls-files | Measure-Object` ⇒ Fewer files

---

# 6. المرحلة M3 — إصلاحات المتوسطة (أسبوع)

| # | الفعل | التفصيل | الجهد |
|---:|---|---|---|
| **H-1** | **ضغط النسخ الاحتياطي بـ gzip** | `server/routes/backup.mjs:93` — `writeFileSync(path, JSON.stringify(payload))` ⇒ `gzipSync` + `.json.gz`. **القياس على ملف حقيقي: 6,964,664 ← 524,394 بايت = 7.5%** | **ساعتان** · توفير **434 م.ب فوراً** |
| **H-2** | تدوير `savelog.txt` | 34 م.ب بلا حد. 22 موقع كتابة كلها `appendFileSync`. أضف نفس منطق `logger.mjs:24-40`، أو **الأفضل: أوقف الكتابة نهائياً** (Diagnostic لا قيمة إنتاجية) | ساعة · 1 م.ب/يوم |
| **H-3** | تدوير `rotateLogFile` | `server/logger.mjs:26,34` — `statSync` + `readdirSync` **لكل طلب** ⇒ خزّن آخر فحص في الذاكرة (TTL دقيقة) | ساعتان |
| **H-4** | **`getKvMeta` حقيقي** | `server/routes/data.mjs:96` يستدعي دالة **غير موجودة** ⇒ `bootstrap?since=N` يُعيد `data` فارغاً دائماً ⇒ **المزامنة التزايدي مكسورة بصمت** | 3 ساعات |
| **H-5** | **`useShallow` على محدّدات `context/domains/*`** | محدّدات تُعيد كائناً جديداً (مثل `inventory.ts:201-210`) ⇒ في zustand v5 خطر **حلقة لا نهائية**. **هذا يمكن أن يُجمِّد الواجهة** | ساعتان |
| **H-6** | `try/catch` على التخزين المحلي | `src/stores/syncStore.ts:269` · `useSyncBridge.ts:54` ⇒ `QuotaExceededError` غير ملتقَط يكسر المُستدعي | 30 د |
| **H-7** | إصلاح `uncaughtException` | `server/index.js:33-35` — بلا `process.exit()` ⇒ خادم زومبي يخدم بيانات تالفة. **قرار مطلوب:** الخروج التام (سلامة) أم الاستمرار (توفّر)؟ أوصي الخروج + `restartPolicy` | 10 د |
| **H-8** | `server/repository.mjs:47-50` | `tombstones()` ينشئ `Set` جديداً **داخل `.filter`** ⇒ `O(n × \|tombstones\|)` = **34.6 مليون عملية عند السقف** ⇒ استخرجه خارج | 30 د |
| **H-9** | `server/backup.mjs:151-165` | `mergeById` الثاني فيه `.some()` داخل حلقة ⇒ `O(b×n)` حقيقي | ساعة |
| **H-10** | مسارات ميتة | `server/routes/data.mjs:990,1023` — `useSyncStore` غير موجود ⇒ `ReferenceError` دائم | 20 د |
| **H-11** | `logger.mjs:15` | `BACKUP_DIR` يُستخدم كجذر سجلات ⇒ السجلات تُكنس في النسخ الاحتياطية | 20 د |
| **H-12** | `store.mjs:262` | فهرس مركّب `(key, seq)` على `change_log` | 30 د |
| **H-13** | احتفاظ لـ`audit_log` | 14 موقع كتابة، **بلا تنظيف** ⇒ نمو بلا حد | ساعتان |
| **H-14** | `core.mjs:94-108` | `requireAdminUser` و`requireAdmin` متطابقان حرفياً ⇒ ادمجهما | 10 د |
| **H-15** | فحص `manage_*` على تيليجرام | `data.mjs:674,710,750` | ساعة |
| **H-16** | `repository.mjs:80-95` | `remove()` سلاح محمَّل بلا فحص ⇒ احذفه أو أضف الحُرّاس | 30 د |

## 6.1 🚦 بوابة M3
- [ ] `server/backup-archive/` يُنتج `.json.gz` وحجمه < 15% من الأصل
- [ ] `GET /api/bootstrap?since=N` يرجع `delta:true` **مع بيانات فعلية** (H-4)
- [ ] `npm test` + `test:repo` + `lint` + `build` ✅
- [ ] قياس زمن الاستجابة لـ `GET /api/bootstrap` قبل/بعد (H-3)

---

# 7. المرحلة M4 — الأداء (أسبوعان)

| # | الفعل | التفصيل | المكسب |
|---:|---|---|---|
| **I-1** | **إخراج jsPDF من الرسم الأول** | **381 ك.ب** تُحمَّل عند أول رسم رغم `await import('jspdf')` في `src/utils/pdf.ts:177`. السبب: `manualChunks` في `vite.config.ts:28` (`v-<pkg>`) يفرضها على الرسم الثابت. **الحل:** امنع تجزئة `jspdf`/`pako`/`fflate`/`iobuffer`/`fast-png` (اجمعها في حزمة واحدة تُستورد ديناميكياً فقط) | **-381 ك.ب** |
| **I-2** | إخراج `bcryptjs` | يأتي مع M3/C3 | -20 ك.ب |
| **I-3** | تقسيم `AdvancedReportingSystemView` | **697 ك.ب** — أكبر حزمة | -400 ك.ب |
| **I-4** | `v-exceljs` (940 ك.ب) و `v-xlsx` (500 ك.ب) | تحقّق أنهما ليسا في الرسم الأول | تأكيد |
| **I-5** | `Cache-Control: immutable` لـ `dist/fonts/**` | 2,627 ك.ب؛ 1,180 ك.ب في المسار الحرج | -1.2 م.ب/تحميل |
| **I-6** | ضغط `express.static` + `Vary: Accept-Encoding` | 8,320 ك.ب JS **غير مضغوطة** اليوم؛ `web.config` بلا `<httpCompression>` | **-70%** |
| **I-7** | **`partialize` على 20 متجراً** | 20 متجراً بلا `partialize` ⇒ JSON كامل عند كل `set()`؛ `adjustInventory` يستدعي `set()` **3 مرات** ⇒ 3 تسلسلات كاملة | **-90%** كتابة |
| **I-8** | **`rcerp_pending_saves` — تسجيل الفروق** | يحمل المصفوفة كاملة (1.66 م.ب لعنصر واحد) | يمنع تجاوز الحصة |
| **I-9** | نقل التخزين البارد إلى IndexedDB | `rcerp_inventory` = 3,858,861 بايت في localStorage. **القياس الواقعي: 3,368 ك.ب من حصة 5,120 ك.ب = 66%** | يمنع انهيار المتصفح |
| **I-10** | `sortEntriesBySize` — طول محفوظ | `src/utils/syncEngine.ts:89-90` — المقارن ينفّذ `JSON.stringify` مرتين لكل مقارنة ⇒ **~990 تسلسل كامل حتى 1.7 م.ب لكل flush = 265 م.ب تخصيص** | **-265 م.ب/flush** |
| **I-11** | `stampLocalMtime` — رقم إصدار | `src/stores/syncStore.ts:122` — `JSON.stringify` لكل سجل ⇒ **17,289 تسلسل مزدوج لكل تغيير** | تحسّن كبير |
| **I-12** | `React.memo` على 15 مكوّناً حرجاً | **صفر `React.memo` في 70,778 سطر** | -إعادة رسم |
| **I-13** | `store.mjs:76` — تحميل `Kv` بالصفوف | `prisma.kv.findMany()` بلا `select` ولا تقسيم ⇒ 6.96 م.ب تُقرأ كلها عند كل إقلاع | إقلاع أسرع |
| **I-14** | `repository.upsert` — كتابة صف واحد | اليوم استنساخ كامل + إعادة بناء + إعادة كتابة JSONB كاملة |，见 M5 |
| **I-15** | `/api/live` — تخزين مؤقت 30 ثانية | `data.mjs:922-968` يعيد حساب التجميعات **لكل استطلاع** (يوصف بـ5 ثوانٍ) على مصفوفة 1.7 م.ب | يخفّض الحمل |

## 7.1 🚦 بوابة M4
- [ ] حجم التحميل الأول ≤ 1.2 م.ب (مضغوط) — القياس: `dist/index.html` modulepreload
- [ ] لا حزمة `v-jspdf*` في `<script type=module>` في `dist/index.html`
- [ ] إجمالي `localStorage` < 1 م.ب (قياس بأداة DevTools)
- [ ] زمن `GET /api/bootstrap` (p95) انخفض ≥ 30% مقابل خط أساس M0
- [ ] زمن الإقلاع انخفض

---

# 8. المرحلة M5 — نموذج البيانات 🚧 (4–6 أسابيع) **الأخطر**

> **🚨 بوابة الدخول الإلزامية:** لا تبدأ M5 قبل اجتياز:
> - [ ] اختبار استعادة نسخة احتياطية (T5-1)
> - [ ] 20 اختبار تكامل للمسارات (T5-2)
> - [ ] CI أخضر مع بوابة تغطية (T5-3)
> - [ ] نسخة احتياطية خارجية **مُختبَرة** (لا مجرّدة)

## 8.1 السلسلة الإلزامية قبل أي ترحيل

| # | الفعل | لماذا | الجهد |
|---:|---|---|---|
| **T5-1** | **اختبار استعادة نسخة احتياطية** | ⚠️ **صفر تغطية اليوم لمسار `applySnapshot` · `verifyBackup` · `readBackupById` · `mergeById` (نسخة backup)** — وهو أعلى مسار مخاطرة في النظام. **أنشئ بيئة اختبار، استعِد نسخة، تحقّق من التطابق** | **أسبوع** |
| **T5-2** | **20 اختبار تكامل للمسارات** | 67 مساراً، صفر تغطية. اختبار `/api/collections/:key` (قراءة/كتابة/403) · `/api/bootstrap` · `/api/auth/login` · `/api/backup` · `/api/restore` | أسبوعان |
| **T5-3** | `@vitest/coverage-v8` + بوابة | يجعل «~15%» التقديري رقماً حقيقياً. ابدأ بالعتبة على `src/business/` و`server/permissions.mjs` فقط | ساعتان |
| **T5-4** | E2E بـ Playwright | **دورة شراء كاملة** تُثبت أن النظام يعمل | أسبوعان |

## 8.2 ترحيل البيانات

| # | الفعل | التفصيل | الجهد |
|---:|---|---|---|
| **D-1** | جدول `inventory_movements` | **17,289 سجل = 49.31% من القاعدة.** أعمدة: `id` · `materialId` · `branchId` · `qtyDelta` · `unitCost` · `occurredAt` · `sourceType` · `sourceId` · `userId`. فهارس: `(materialId, occurredAt)` · `(branchId, occurredAt)` · `(sourceType, sourceId)` | أسبوع |
| **D-2** | هجرة D-2 للجدول | سكربت قراءة من `rcerp_inventory_movements` وكتابة بالجداول — **مع عدّاد ومقارنة قبل/بعد** | 3 أيام |
| **D-3** | قراءة من الجدول | `GET /api/collections/rcerp_inventory_movements` تقرأ من الجدول + ترقيم صفحات | 3 أيام |
| **D-4** | كتابة صف واحد | `POST /api/collections/rcerp_inventory_movements/:id` — **يقتل تضخيم الكتابة ×384** | 3 أيام |
| **D-5** | جدول `batch_sales` + سطوره | 384 سجل = 24.39% | 4 أيام |
| **D-6** | فهارس على مفاتيح الأيتمة | `supplierId` · `branchId` · `categoryId` — **صفر فهرس اليوم**. **مجموع العلاقات المعلنة في المخطط كله = 1** | 3 أيام |
| **D-7** | مفاتيح خارجية فعلية | `RawMaterial.supplierId` → `Supplier.id` · `InventoryItem.branchId` → `Branch.id` | 3 أيام |
| **D-8** | قيود فريدة | `Supplier.code` · `Supplier.taxNo` ⇒ `@unique` | 10 د |
| **D-9** | إزالة 6 نماذج ميتة | `Branch` · `Supplier` · `RawMaterial` · `Recipe` · `InventoryItem` · `DocumentNr` — **ميتة في التشغيل** (17 استدعاء Prisma كلها في سكربتات مؤقتة). احذفها أو فعّلها | 3 أيام |
| **D-10** | `prisma` seed في `package.json` | `npx prisma db seed` يفشل اليوم. أضف `"prisma": { "seed": "node server/seed-pg.mjs" }` | 10 د |
| **D-11** | `write-through` بدل `write-behind` | `store.mjs:145-147` — الاستجابة `ok:true` **قبل** وصول الصف لقاعدة البيانات. **قرار مطلوب:** أبقِ write-behind (سرعة) أم write-through (متانة)؟ أوصي write-through لـ المجموعات النقدية فقط | يوم |
| **D-12** | ترتيب CDC قبل البيانات | `store.mjs:153-154` — `cdcPush` **قبل** `$transaction` ⇒ قارئ CDC قد يقرأ قيمة قديمة | ساعة |

## 8.3 🚦 بوابة M5
- [ ] `T5-1`–`T5-4` مكتملة
- [ ] تغطية ≥ 70% على المجموعات المرحَّلة
- [ ] عدّاد السجلات متطابق قبل/بعد لكل هجرة
- [ ] `rcerp_inventory_movements` لم تعد في KV
- [ ] زمن كتابة الحركة < 50 م.ث (كان ~ثوانٍ)
- [ ] اختبار استعادة يمرّ على قاعدة البيانات الجديدة

---

# 9. المرحلة M6 — البنية (6–8 أسابيع)

> **ممنوعة قبل M4 و M5** — حذف `client/` و`server.js` يجب أن يأتي بعد استقرار البناء.

| # | الفعل | التفصيل | الجهد | الخطر |
|---:|---|---|---|---|
| **J-1** | **حذف `src/context/domains/`** (2,025 سطر) | 10 متاجر مكرّرة بنفس الأسماء. `inventory.ts` يُحجب `src/stores/inventoryStore.ts`. **لوحة المعلومات والمخزون يقرآن متجراً لا يُوصَّل بالخادم** | أسبوع | **⚠️ عالٍ** — ابدأ بتوحيد `inventory` فقط |
| **J-2** | حذف `client/` (6,196 سطر) | تطبيق Vue 3 v8.0.0 ميت تماماً | ساعة | منخفض |
| **J-3** | **تقديم `react-router-dom`** | مُثبَّت ومستورد **صفر مرات** + حجز حزمة في `vite.config.ts:8`. switch بـ102 ذراع ⇒ روابط، رجوع، Deep-linking، وحاجز تجزئة | أسبوع | **⚠️ عالٍ** — 102 حالة |
| **J-4** | تقسيم `useAppCompat.ts` (1,398) | أكبر ملف، يستخدمه ~180 مكوّناً | 3 أيام | متوسط |
| **J-5** | تقسيم `data.mjs` (1,068) | المعالج 379 سطر ⇒ وحدتين | 3 أيام | متوسط |
| **J-6** | **طبقة عميل API واحدة** | 45 مسار `/api/*` في 25 ملفاً عبر `fetch()` خام؛ منطق المصادقة **مكرّر 17 مرة**. وسّع `reporting-module/data/apiClient.ts` | أسبوع | منخفض |
| **J-7** | **دمج معماريات التقارير الثلاث** | 107 ملف / 29,397 سطر متداخلة | 4–6 أسابيع | **⚠️ عالٍ** — أضِف `__tests__` أولاً |
| **J-8** | **نظام مكوّنات حقيقي** | 28 من 28 مكوّن shadcn/ui **غائبة**؛ `src/components/ui/` لا يحتوي `Button` ولا `Input` ولا `Dialog` ولا `Table`. هذا هو **الحاجز الوحيد** لإصلاح a11y | 3 أسابيع | منخفض |
| **J-9** | حذف 11 ملف `*View*` غير قابل للوصول | 2,350 سطر (منها `PurchasesReportView.tsx` = 801) | 3 ساعات | منخفض — **تحقّق أولاً بـ grep** |
| **J-10** | `zod` لكل مدخلات الكتابة | M3/D8 بدأها — أكملها | أسبوع | منخفض |
| **J-21** | `repository.find` + فهرس `Kv.key` | 20 رابطاً خطياً | أسبوع | منخفض |

## 9.1 🚦 بوابة M6
- [ ] `npm test` ≥ 120 اختباراً · `lint` 0 · `build` نجاح
- [ ] صفر متجر مكرّر (`grep "context/domains" src/` ⇒ 0)
- [ ] `react-router` مُفعَّل و`useState('activeTab')` محذوف
- [ ] حزمة واحدة للتقارير
- [ ] `grep "client/" package.json vite.config.ts` ⇒ 0

---

# 10. المرحلة M7 — الجودة المستمرة (متوازٍ من اليوم الأول)

| # | الفعل | الجهد | ملاحظة |
|---:|---|---|---|
| **K-1** | `npm run lint` يشمل `server/**` | أسبوع | 8,433 سطر خارج التحقق اليوم (`tsconfig.json:26`) |
| **K-2** | `tsconfig` يوقف استثناء ملفات الاختبار | 5 د | `tsconfig.json:25-26` |
| **K-3** | ESLint + Prettier + husky | 3 ساعات | `lint` اليوم = `tsc` فقط، بلا أسلوب ولا خطافات |
| **K-4** | **اختبارات مكوّنات** لـ 10 شاشات | أسبوعان | `@testing-library` مُثبَّت و**بلا استخدام** |
| **K-5** | E2E Playwright | أسبوعان | مع T5-4 |
| **K-6** | OpenAPI من 15% إلى 100% | 3 أيام | `DEVELOPMENT_PROPOSALS.md` يدّعي أنها منجزة — **57 مساراً مفقوداً** |
| **K-7** | Sentry أو ما يماثله + تنبيه | يوم | صفر مراقبة |
| **K-8** | **`Vary: Accept-Encoding`** | 10 د | قد يخدم نسخة gzip لمتصفح لا يفكّها (Cloudflare أمامك) |
| **K-9** | توحيد المنفذ 3001 | ساعة | 4 منافذ في 5 ملفات (3032/3001/5173/3033) |
| **K-10** | **توحيد التوثيق: 27 ملف ⇒ 3** | ساعتان | 6 خطط إصلاح متنافسة؛ `REPAIR_PLAN.md` فيه **0 من 30** خانة ✔ |
| **K-11** | تصحيح إدّعاءات `ROADMAP.md` | ساعة | يعلن اكتمال i18n و a11y — كِلاهما **غير مكتمل** |
| **K-12** | تفعيل i18n أو حذف `i18n.ts` | أسبوع | **مستورد صفر ملفات** |
| **K-13** | ربط `arabic-reshaper`/`bidi-js` بمخرجات PDF أو حذفهما | 3 أيام | **مستوردان صفر مرات**؛ عربي PDF بلا تشكيل |
| **K-14** | a11y | أسبوع | **4 سمات ARIA في 190 ملف**؛ 20 نافذة بلا حصر تركيز |
| **K-15** | اختبار PDF عربي | يومان | لم تُختبر |

---

# 11. قرارات مطلوبة منك قبل التنفيذ

## 11.1 تطهير تاريخ git (A5) — **القرار الأكبر**

| الخيار | الوصف | العواقب |
|---|---|---|
| **① نعم، طهّر** | `git filter-repo` لإزالة الـ ZIP و`login.json` من كل التاريخ | ✅ الأسرار تختفي نهائياً · 🔴 **كل** الـ SHA تتغيّر · 🔴 كل clone/فور/PR يجب إعادة إنشاؤه · 🔴 أي بيئة خارجية تعتمد على هذا الـ git تنكسر |
| **② لا، أبقِ التاريخ** | اقبل أن الأسرار موجودة في التاريخ | ⚠️ بعد A1/A2 (تدوير كل الأسرار) **الخطر الفعلي = صفر** لأن لا شيء صالح للاستخدام باقى · ✅ صفر كسر · ⚠️/kg إذا تدفّق المستودع خارجياً someday |

> **الأوصي: ②.** تدوير كل كلمات المرور والبذور (A2) يُبطل كل ما في التاريخ. التطهير مفيد فقط إذا كان هناك **مستودع خارجي** (GitHub عام) — وقتها يصبح إلزامياً.

## 11.2 حذف `server.js` من الجذر (B6)

يستخدمه `Dockerfile:46` و`railway.json:8` فقط. **⚠️ تحقّق:** هل هناك أي بيئة عاملة تعتمد عليه الآن؟ (المسار الحقيقي `server/index.js`).
**الأوصي:** احذفه. إذا كانت هناك بيئة تعمل عليه، أصلحها أولاً (B1/B3) ثم احذفه.

## 11.3 `write-through` أم `write-behind` (D-11)؟

| الخيار | يكسب | يخسر |
|---|---|---|
| **write-behind** (الحالي) | سرعة استجابة | ⚠️ **الاستجابة `ok:true` قبل وصول الصف للقاعدة** — فقد عندMv typically/crash |
| **write-through** | **متانة** | زمن استجابة +2–8 م.ث للصفوف الكبيرة |
| **هجين (موصى)** | متانة للمجموعات النقدية فقط | تعقيد بسيط |

## 11.4 `uncaughtException` (H-7) — فِرَج أم بقاء؟

- **خروج تام** (`process.exit(1)`): أمان بيانات · يتوقف الخدمة حتى إعادة التشغيل
- **بقاء**: توفّر خدمة · خطر خدمة بيانات تالفة
> **الأوصي:** خروج تام + `restartPolicy: ON_FAILURE` في Railway ونافذة خدمة على Windows (يوجد `start-site-system.bat`). الخادم اليوم **يخفي الأعطال fatally** بدل أن يعلنها.

## 11.5 `savelog.txt` (H-2) — يُحذف أم يُدوَّر؟

- **حذف الكتابة نهائياً**: أنظف، لكن يفقد تشخيصاً
- **تدوير فقط**: يحفظ التشخيص بسقف
> **الأوصي:** تدوير بسقف 10 م.ب، **مع** سحب محتواه إلى `access.log` المنظّم (المستخدم → الإجراء → المفتاح) بدل ملف نصي خام.

---

# 12. سجل المخاطر

| الخطر | الاحتمال | الأثر | التخفيف |
|---|---|---|---|
| كسر الإنتاج أثناء M1 | متوسط | **عالٍ** | M0 (نسخة خارجية + فرع إنقاذ) · كل تعديل في commit منفصل |
| فقدان بيانات في ترحيل M5 | **عالٍ** | **حرج** | T5-1 (اختبار استعادة) **إلزامي** · هجرة نسخية (متزامن) · عدّاد ومقارنة |
| `J-3` Router يكسر التنقّل | عالٍ | متوسط | Framer-style: router خلف علم · اختبارات تنقّل |
| `J-7` دمج التقارير يفقد ميزات | عالٍ | متوسط | `__tests__` لكل تقرير قبل الدمج · قائمة ميزات |
| `I-9` IndexedDB يكسر المزامنة دون اتصال | متوسط | عالٍ |実施 على مفاتيح باردة فقط أولاً |
| تدوير الأسرار يكسر التشغيل المحلي | منخفض | عالٍ | نفّذه مع وجود المشغّل · وثّق القيم الجديدة في مكان آمن |
| ازدحام المراجعات على `permissions.mjs` | — | — | اعزل صلاحيات القراءة في ملف جديد `permissions-read.mjs` |

---

# 13. قائمة «لا تفعل» ❌

| ❌ | لماذا |
|---|---|
| **لا تستخدم `git reset --hard` / `git push --force`** | M0 أنشأ فرع `rescue/` — استخدمه |
| **لا تحذف `backups/`** | بيانات مستخدمين حقيقية (25.5 م.ب، آخر نسخة اليوم) |
| **لا ترحّل `server/data/restocost.db`** | ملف احتياطي من الـ SQLite القديم — احذفه إن أردت، لكن لا تلمسه |
| **لا تغيّر `schema.prisma` قبل M5** | ذلك مخطط M5/§8.2 |
| **لا تبدأ M5 قبل T5-1** | أعلى مسار مخاطرة في النظام — **بلا تغطية اليوم** |
| **لا تقدّم `react-router` قبل M4** |Routing بلا اختبارات تنقّل = كسر صامت |
| **لا تحذف `server/routes/data.mjs`** | 30 من 67 مساراً — قسّمه (J-5) لا تحذفه |
| **لا تشغّل `npm run dev` في الإنتاج** | `docker-compose.yml:39` يفعل ذلك اليوم |
| **لا تعمل على `master` مباشرة** | أنشئ فرعاً: `repair/m1-critical` لكل مرحلة |
| **لا تنفّذ 5 ملفات موحّدة** | درجة Coupling عالية جداً |
| **لا تنشر بعد A1** قبل أن يُختبر الدخول بكل الأدوار |

---

# 14. التقدير الإجمالي

| المرحلة | المدة | الجهد |Morris الجهد التراكمي |
|---|---|---|---|
| M0 — شبكة الأمان | يوم واحد | 4 ساعات | 4 س |
| M1 — الحرجة | 2–3 أيام | 2–3 أيام عمل | 3 أيام |
| M2 — منع الانحدار | يومان | 6 ساعات | 3.5 أيام |
| M3 — المتوسطة | أسبوع | 3 أيام | 6.5 أيام |
| M4 — الأداء | أسبوعان | 5 أيام | 11.5 يوم |
| M5 — نموذج البيانات 🚧 | 4–6 أسابيع | 20 يوم | 31.5 يوم |
| M6 — البنية | 6–8 أسابيع | 30 يوم | 61.5 يوم |
| M7 — الجودة | متوازٍ | 15 يوم | — |

**M0 → M3 = 6.5 أيام عمل** ويغطي **كل** الثغرات الحرجة والعالية + كل إجراءات الأداء فورية (434 م.ب، تدوير السجلات).
**M0 → M4 = 11.5 يوم** = النظام مُؤمَّن ومُراقَب وعلموياً.
**M0 → M6 = ≈ 12 أسبوعاً** = البنية السليمة.

> **ملاحظة مقارنة:** `REPAIR_PLAN.md` الحالي يقدّر **14 أسبوعاً** لـ 30 بنداً **بلا استيفاء أي خانة**. تحليلي يقدّر **6.5 أيام** للبندين 1–19 (معظمها سطر أو سطران من الكود). **الخطة الحالية مبالغة في حجم العمل ومتدنية في ترتيب الأولويات.**

---

# 15. قائمة التحقق قبل الموافقة

قبل أن أبدأ التنفيذ، أحتاج قرارك في:

- [ ] **§11.1** — تطهير تاريخ git: ① نعم / ② لا
- [ ] **§11.2** — هل هناك بيئة تعمل على `server.js` القديم؟
- [ ] **§11.3** — write-through أم write-behind أم هجين؟
- [ ] **§11.4** — `uncaughtException`: خروج تام أم بقاء؟
- [ ] **§11.5** — `savelog.txt`: حذف أم تدوير؟
- [ ] **النطاق**: هل نبدأ بـ M0+M1 فقط، أم M0→M3 دفعة واحدة؟
- [ ] **التراجع**: هل الالتزام الكامل بـ commit منفصل لكل مهمة مقبول؟ (مAIC: **نعم**)

---

**⏸️ بانتظار موافقتك. لم يُنفَّذ أي إجراء — الشجرة نظيفة على `2f04839` + ملفَّي التقرير والمخطط غير متتبَّعين.**

---

## حالة هذا المستند (محدّث 2026-10-02)

كُتب على `8eaf492`. المرحلة A (M0/M1) نُفِّذت بالكامل عبر 14 commit.
المتبقي من خطته:

- **M2 CI + اختبارات آلية** — اختبارات وحدة موجودة (201) لكن بلا CI (workflow).
- **M3 ملفات كبيرة** — `useAppCompat` من 1,416 → 1,253 (استُخرج monthly-count).
- **D1 مساحة أسماء الشواهد** — صفر تعارض فعلي مقيس على البيانات الحيّة؛ مؤجَّل.

راجع `docs/audit-2026-10-02.md` لتفصيل ما عولج وما بقي.
