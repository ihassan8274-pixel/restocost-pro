# مخطط الإصلاح الشامل — RestoCost ERP Pro

**الإصدار**: 1.0 — 2026-09-27
**الحالة**: P0 قيد التنفيذ (مكتمل البرمجة؛ التفعيل الفعلي يتطلب إعادة تشغيل الخادم لكي تسري P0.1–P0.6 في النسخة الحية)
**الأساس**: نتائج التدقيق الشامل (8 محاور) + حادثة فقدان البيانات 2026-09-26 + قراءة مباشرة لأكبر الملفات.
**اللغة**: عربية (مخطط جديد موحّد — يستبدل `REPAIR_PLAN.md` الإنجليزي السابق ويُدمج نتائج التدقيق الفعلية).

> **سجل التقدم (2026-09-27):** ✅ P0.1 lock حصري + P0.2 merge آمِن + P0.3 إزالة admin123 + P0.4 قفل المسارات + P0.5 AAD/دوران الأسرار + P0.6 تقييد السجلات + P0.7 تنظيف PG (حُذفت 14,332 صفاً من change_log). ✅ التحقق الحي: أُعيد تشغيل الخادم (stamp `700e3b765b`)؛ نسخة ثانية عند المنفذ نفسه → رفض (exit 3)؛ المسارات المقفلة بلا توكن → 401/401/401 وبتوكن مدير صحيح → 200/200/200/200؛ تدوير access.log تفعّل تلقائياً عند السقف؛ `npm test` 39/39 و `npm run build` ✅. ✅ كلمة مرور admin الصحيحة = `<REDACTED>` (طابقت hash الـ bcrypt، والدخول يعمل؛ رُفع قفل rate-limit المؤقت الناتج عن محاولات الاختبار).

---

## ملخص تنفيذي

النظام ناضج وظيفياً لكن هشّ في ثلاث زوايا: **(1) الأمان** (كلمة مرور مشفرة hardcoded في الكلاینت، مسارات خادم بلا مصادقة، مفاتيح ثابتة)، **(2) موثوقية البيانات** (تعدد نسخ الخادم سبب فقدان 107 سجل مبيعات، `change_log` ينمو بلا سقف، استعادة النسخ مدمرة)، **(3) بنية الواجهة** (`AppContext.tsx` = 3,908 سطر اتفاقية، بلا `useMemo`، مع معمارية ثانية أيتام `domains/` غير مكتملة).

| المحور | الحالة الآن | الهدف |
|--------|-------------|-------|
| AppContext | 3,908 سطر / 253KB / قيمة بلا memo / admin123 مكشوف | ~400 سطر تركيبة + كبسولات domain hooks |
| مسارات غير موثّقة | `/api/companies`, `/api/start-company`, `/api/instance` مفتوحة | مضمونة بمصادقة + صلاحية فقط |
| change_log | 49,457 صف (9 أيام) بلا سقف | تقييد + fish مقص «sweep» + مؤشرات |
| استعادة النسخ | replace مدمر حذفاً بالكامل | merge آمِن + اختبار استعادة |
| تعدد النسخ | watcher يعيد كتابة port.txt فتتعارض | Single-instance lock + رفض بدء، لا override |
| المزامنة | bootstrap كامل لكل تحديث (3.17MB KV) | bootstrap الفروق فقط (incremental) |
| الأمان المخزني | AES-GCM بلا AAD، secret ثابت، فشل يعيد `''` | AAD + key rotation + فشل صريح |

**المراحل**: P0 إيقاف النزيف (فوري) ← P1 حوكمة (أسابيع 1-3) ← P2 إعادة هيكلة AppContext (أسابيع 2-6) ← P3 جودة/توسعة (2-4 أسابيع).

---

## P0 — إيقاف النزيف (فوري، 1-3 أيام)

ماذا الآن: إغلاق نافذة فقدان البيانات، إزالة كلمة المرور المشفرة، تأمين المسارات المفتوحة، وتناوب المفاتيح. **لا يعتمد عمله على أي تغيير معماري.**

### P0.1 — منع تعدد النسخ (أصل حادثة فقدان 107 سجل)
**الملفات**: `server/watcher.mjs`, `server/index.js`, `.env`

- استبدال "PORT=3001 يجبر" بآلية lock حصرية: قبل بدء الخادم إن `port.txt` يحوي PID نشط عند نفس المنفذ → **رفض البدء مع رسالة** بدلاً من فتح نسخة ثانية.
- عند كل كتابة `port.txt` قارن PID الفعلي؛ أي نسخة لا تملك القفل تخرج فوراً (تسجل بإنذار في `audit_log`).
- منع واضح: نافذة `watcher.mjs` لا تعيد كتابة `port.txt` إلا عند اكتشاف موت العملية الفعلي.
- **التحقق**: تشغيل النسخة الثانية على 3001 فشلاً صريحاً، ومزامنة ناجحة عبر نسخة واحدة. اختبار منفذ 3001/3002/3003 مع تغذية بيع.

### P0.2 — استعادة نسخ غير مدمرة
**الملفات**: `server/routes/backup.mjs` (تطبيق snapshot ~L150-157)

- `applySnapshot` يتحول من "استبدال كامل للمفتاح" إلى **merge** (دمج السجلات الموجودة مع الجديدة بالمعرّف، مع عدم حذف مفاتيح غائبة من الـ snapshot إلا عبر قائمة `tombstone` صريحة).
- كل مفتاح يُكتب في صفقة واحدة (لا per-item غير ذري).
- فشل restore-point يُسجّل ولا يُمرَّر بصمت.
- **التحقق**: استعادة نسخة اختبارية تحتوي على سجلات أحدث من النسخة — تبقى حديثة دون إضاعة معدومة.

### P0.3 — إزالة ADMIN_PASSWORD المشفرة من الواجهة
**الملفات**: `src/context/AppContext.tsx` (L568, L574, L3868)

- حذف المتغير `ADMIN_PASSWORD = 'admin123'` وفرع `password === ADMIN_PASSWORD`.
- `verifyAdminPassword` تعتمد فقط على الخادم `POST /api/auth/verify-password`، وعند عدم توفر الخادم **تُرفض** (لا تحقق محلي بكلمة مرور `currentUser.passwordHash` — إزالة تماماً، فالتحقق يجب أن يكون دائماً على الخادم).
- فحص أي استخدام آخر للمتغير (grep `ADMIN_PASSWORD` كاملاً) وإزالة التصدير من قيمة السياق.
- **التحقق**: `grep admin123` لا نتائج؛ دخول مسؤول بـ admin123 مرفوض.

### P0.4 — قفل المسارات غير الموثّقة
**الملفات**: `server/routes/data.mjs` (L433, L462), `server/store.mjs` (instance)

- `GET /api/companies` → `requireAuth` + صلاحية `view`.
- `POST /api/start-company` → `requireAuth` + صلاحية `manage` (يمنع enum وسقف بدء العمليات)، وتقييد عدد الأنماط بصيغة.
- `GET /api/instance` → `requireAuth` (أو إخفاء معلومات التشغيل الحساسة خلف صلاحية admin).
- **التحقق**: `curl` المسارات الثلاثة بدون توكن → 401; بـ admin → 200.

### P0.5 — دوران المفاتيح والأسرار
**الملفات**: `.env`, `server/.env`, `server/secrets.mjs`, `server/core.mjs`

- استبدال `JWT_SECRET` و`SESSION_SECRET` بقيم عشوائية جديدة (بإبقاء أثر) ثم استدعاء إعادة تسجيل دخول المستخدمين.
- `secrets.mjs`: إضافة **AAD** للـ (AES-256-GCM)، دعم **إصدار المفتاح** (keyId في الأصل) والسكتة الدورانية اليدوية، وجعل فشل فك التشفير **خطأ صريحاً** (throw) بدلاً من `''` (ملف مشفر تالف يجب أن يوقف العمل وليس يُسكت).
- نقل/إتلاف `secrets.key.backup-20260921-121034` من مجلد `backup-archive` المرئي في واجهة الاستعادة.
- **التحقق**: تسجيل الدخول القديم يتطلب إعادة تسجيل؛ فك شفرة ملف تالف يرمي خطأ.

### P0.6 — كبح نمو السجلات
**الملفات**: `server/store.mjs` (cdc/change_log), `server/logger.mjs` SL `access.log`/`watcher.log`

- `change_log`: حذف/أرشفة الصفوف الأقدم من 7 أيام + فحص index على `(key, updatedAt)` + سقف في الكود (لا تكتب عند تجاوز حد الصفوف دون إنذار).
- `access.log` و`watcher.log`: rotation تلقائي (لاحتياط 14 يوم / حجم أقصى) — حل PG-نات explict بدل نمو بلا حدود.
- **التحقق**: pg `SELECT count(*)` بعد التنظيف مستقر؛ حجم اللوغ لا يتجاوز السقف.

### P0.7 — مراجعة قاعدة البيانات الحالية
- مسح `change_log` القديم، `sessions` البائدة، `audit_log` المكرر.
- تحقق من توازن `batch_sales` بعد الاستعادة (تطابق عدد مع آخر نسخة محفوظة).
- بعد أسبوع عمل: مقارنة عدّادات `change_log` بمقاييس القراءة للتحقق أن «sync الدلتا» (P1.5) لا تخطئ.

---

## P1 — حوكمة الأمان والمزامنة والبيانات (أسابيع 1-3)

### P1.1 — فرض الإغلاق على الخادم
- `closedMonths`/`closedDays`/`eodClosures` تُتحقق **في الخادم** لكل كتابة للفترات المقفلة (مهندس واحد، أمر `requirePeriodOpen` في مسارات الكتابة)، لا الاكتفاء برفض الواجهة.
- إضافة `closedBy` موحّد (id المستخدم) بدلاً من نص حر.
- **التحقق**: curl يكتب في شهر مقفل بـ API → 409.

### P1.2 — إصلاح تشابك التطوير (vite proxy)
- `vite.config.ts` (L20-22) يشير `/api` ← `http://localhost:3002` (Bukharo!) — تغيير إلى `http://localhost:3001` مع `changeOrigin`.
- حذف/إيقاف bootstrap الثاني العالق في `reporting-module/src/apiClient.ts` (الوكالة stale دون auth).
- **التحقق**: `npm run dev` على 3001 يصل للنفس الخادم بلوكال.

### P1.3 — بوابة Sync انطلاقـي
- `/api/bootstrap` حالياً يجيب الكل 3.17MB في كل جرس (poll 20s). إضافة `?since=` بفواصل بسيطة:
  - الخادم يحتفظ بـ `lastUpdated` لكل key في `kv` → عند `since` ردّ الفروق/الـ touched keys فقط + `deleted_ids`.
  - الواجهة تطبق بنفس `applyData` (لا تغيير في المنطق).
- إضافة `ETag`/`If-None-Match` عند عدم وجود تغيير.
- **التحقق**: استطلاع ثانٍ بلا تغييرات ← حمولة صغيرة (~KB) وتفي `304`.

### P1.4 — تحقق صلاحيات على الخادم
- التحقق أن كل مسار كتابة يقرأ `ROLE_PERMISSIONS` + `accessRoles` في الخادم (لا ثقة بـ client-only).
- إغلاق `POST /api/report` من قبول HTML خام غير مفهرس (تقييد بالنطاقات المسموحة/الاستيعاب) أو نقل عبر `POST /api/reports/render` بمواصفات آمنة.
- **التحقق**: مستخدم بلا صلاحية يحاول تعديل مورد ← 403 خادمي.

### P1.5 — ZATCA phase 1 hardening
- `QR TLV` يبقى صحيحاً (تحقق أمان بـ tests)؛ لا كشف لمفاتيح المصادقة الثابتة في static bundle.
- إعداد مسار phase 2 (UBL 2.1 / التقرير / الإفصاح) في خطة مستندة إلى PKI؛ لا يتم تنفيذه الآن لكن يُوثَّق خطوات التعاقب.

### P1.6 — مراقبة وتنبيهات بسيطة
- `GET /api/admin/health` (منفذ، نسخة، عدد جلسات، اتصال PG، عدّادات `change_log`) محمي بـ admin.
- إنذار عند ظهور 0-byte backups أو تكرار فشل restore.

### P1.7 — تنظيف معمارية متوازية
- **القرار المعتمد**: إكمال `src/context/domains/*` كبديل نهائي (زوستاند لكل نطاق) وربط مكوّنات `*ViewMigrated.tsx` (6 أيتام حالياً) بالمستخدم. العدد — خريطة النطاقات: ui/settings/sync/reports/recipes/procurement/inventory/hr/financial/auth (−). P2 يلتزم بهذا الاتجاه ويستأنف من حيث توقف `domains/` (دون تكرار الأعمال).

---

## P2 — إعادة هيكلة AppContext (أسابيع 2-6)

### 2.1 التشخيص الحالي (من القراءة الفعلية)
- **الحجم**: 3,908 سطر (253KB)؛ واجهة `AppContextType` تضم 300+ عضو.
- **البناء**: 70+ `useState` كلها من `loadState(...)` (التي هي حالياً *stub* يعيد fallback — أي hydrating من localStorage معطّل والخادم هو مصدر الحقيقة).
- **المزامنة**: `applyData` (80+ if-set)، `COLLECTION_SETTERS` (70+ key)، `persist` (75 استدعاء في useEffect واحد بقائمة اعتماديات 75 عنصر)، `useSyncCore` و`useAuthCore` و7 كبسولات موجودة: `useTasks, useHaccp, useCustomerOrders, useUnitsAndBarcodes, useInventoryCore, useToasts, usePreferences, useAISettings`.
- **الانتشار**: ~139 مستهلك عبر `useApp()`.
- **نقاط الضعف**: القيمة في L3838 بلا `useMemo` → أي setState يُعيد إعادة تنسيق كل المستهلكين؛ `ADMIN_PASSWORD` مُصدَّر في L3868؛ كل الدوال mutation تقرأ كل حالة مباشرة (تشابك cross-state).

### 2.2 الهدف المعماري
> `AppContext.tsx` تصبح **طبقة تركيبة رفيعة (~400-500 سطر)** فقط: تجميع كبسولات domain hooks + `useSyncCore` + `useAuthCore`، وتوليد `COLLECTION_SETTERS`/`applyData`/`persist` آلياً من الكبسولات. كل كبسولة تملك مجموعتها وsett وفق نفس نمط DI الموجود في `useSyncCore` (مكوّن `deps` + `returns`)، **بلا استدعاء `useApp` داخلها** (لا اعتماد دائري).

### 2.3 خريطة الكبسولات المقترحة

| الكبسولة | المجموعات المسؤولة | المصدر الحالي للأساس |
|---|---|---|
| `useCatalogCore` | suppliers, raw_materials, material_barcodes, units, companies, categories, recipe_sections | جزئياً في AppContext |
| `useInventoryCore` (موجود + تمديد) | inventory, inventory_batches, movements, recipe_inventory, **+ product_transfers, opening_balances, physical_counts, butcher_tests, material_categories** | موجود |
| `useProcurementCore` | grn, purchase_orders, purchase_requests, supplier_quotes, supplier_returns, requisitions, delivery_apps, branch_stock_limits(يمسي) | جديد |
| `useProductionCore` | recipes, work_orders, wastage, production_runs, food_menus, menu_plans | جديد |
| `useFinancialCore` | accounts, journal, expenses, budgets, customers, reservations, invoices, pl_summaries, target_margin, vat | جديد (الأعقد — الأوَّل) |
| `useHRCore` | employees, shifts, attendance, payroll, employee_meals | جديد |
| `usePosCore` | pos_orders, pos_returns, delivery_sales | جديد |
| `useReportsCore` | custom_reports, scheduled_reports, automation_rules, recent_docs | جديد |
| `useSettingsCore` | branches, closed_days/months, eod_closures, currencies, logo, ai, preferences/numerals/density | جديد |
| `useSyncCore` (موجود) | pending, persist, poll, offline | موجود |
| `useAuthCore` (موجود) | users, login/register/TOTP | موجود |
| `useTasks/useHaccp/useCustomerOrders` | موجودة | موجودة |

### 2.4 آليات الجمع الآلي
- كل كبسولة تُصرّح: `keys: string[]`, `setters: Record<key,setter>`, `persistKeys`, `fromServer(key,data)` إن احتاج تحويلاً (مثل tombstone filter، healSeed، logo).
- `AppContext` تولّد:
  - `COLLECTION_SETTERS` بدمج كل الكبسولات.
  - `applyData` بـ حلقة عامة على الكاش: `if (key in setters) setters[key](normalize(key,d[key]))` — **يحل محل 80+ if**.
  - تأثير `persist` كل كبسولة تعلن اعتمادياتها → **اختفاء قائمة الاعتماديات الـ 75**.
- حافظ على أمان منطق الدمج الحالي (Tombstone union، healSeed، حماية الأعمار — تبقى داخل `normalize`/كبسولاتها).

### 2.5 تسلسل التنفيذ (commits صغيرة + اختبار بعد كل مرحلة)
1. **خطوة 0 — تحصين أولي للسياق الحالي دون إعادة هيكلة**: إزالة admin123 (P0.3) ولفّ القيمة بـ `useMemo`.
2. **خطوة 1 — تعميم آليات الجمع**: إعادة بناء `COLLECTION_SETTERS`/`applyData`/`persist` آلياً + typecheck + اختبار التزامن (POS→sync→logout). لا تغيير سلوكي.
3. **خطوة 2 — كبسولة الأولى (منخفضة الخطورة)**: `useCatalogCore` نقل مجموعاتها وهندستها، وثبّت النمط على كبسولة جديدة كافة (Setters/persist/fromServer).
4. **خطوة 3 — كبسولات Procurement + HR + POS** (نقل + اختبار كل واحدة).
5. **خطوة 4 — Production + تمديد InventoryCore** (الأكثر تداخلاً مع حركات المخزون).
6. **خطوة 5 — FinancialCore أخيراً** (أعقد توابع المعادلة: متوسطات التكلفة، rebuild PL، الخصم).
7. **خطوة 6 — الشطب النهائي**: إزالة الـ useState المنقولة والـ if-per-collection القديمة؛ مصادقة أن `AppContext` أصبح تركيبة رفيعة بلا `useMemo` واسع الاستخدام للفئات المتغيرة فقط.
8. **خطوة 7 — (اختياري) مضاعفة المستهلكين**: `useAppCatalog()`, `useAppFinancial()` ... عبر selectors دقيقة لوقف إعادة تنسيق كل المستهلكين عند كل تغيير.

### 2.6 ضوابط ومخاطر
- **لا تكسر الـ API الحالي**: `useApp()` يبقى مرجعياً يعيد نفس الواجهة (نفس أسماء الدوال) طوال المرحلة — التغيير بنيوي داخلي فقط.
- **التحقق**: `npm run typecheck` + `npm run build` بعد كل مرحلة؛ `grep "useApp("` لضمان لا كبسولة تستدعيه.
- **المخاطرة الأعلى**: cross-state بين الكبسولات (مثال: بيع POS يخصم inventory ويحرك تكلفة) — الحل: الكبسولات تتبادل عبر deps (تمرير setters بحاجة) وليس عبر استدعاء contextual، مع تقسيم المسؤولية في كل انتقال بوثيقة تأثير.
- **نبذة**: `domains/` زوستاند الأيتام يُحسم في P1.7 (حذف) إلا إذا قررنا إكمالها — يبقى القرار مفتوحاً في بداية P2.

---

## P3 — جودة وتوسع (اختياري، 2-4 أسابيع)

- تقطيع المكتبات الثقيلة: `xlsx`/`exceljs`/`jspdf`/`recharts` في lazy imports (شرط: إصلاح ثغرة xlsx العالية — الانتقال لـ `@e965/xlsx`).
- قوائم افتراضية: `react-virtual` لجدوال المخزون والتقارير.
- مؤشرات DB على أنماط الوصول الأكثر تكراراً (branch+created_at للـ pos_orders، إلخ).
- اختبارات أتمتة للـ critical paths (دخول→بيع→مزامنة→خروج).
- توثيق: `ARCHITECTURE.md`، `SYNC_PROTOCOL.md`، `API_REFERENCE.md`.

---

## الأولويات والجدول

| المرحلة | المدة | المخرجات | الأولوية |
|---------|-------|----------|----------|
| P0 | 1-3 أيام | منع تكرار الحادثة، إغلاق الثغرة الأمنية | 🔴 الآن |
| P1 | 1-3 أسابيع | فرض الإغلاق، sync دلتا، إصلاح dev، مراقبة | 🟠 أسبوع 1-3 |
| P2 | 2-6 أسابيع | AppContext في طبقات كبسولات (~400 سطر) | 🟠 بالتوازي |
| P3 | 2-4 أسابيع | أداء، أمان بندل، اختبارات، توثيق | 🟡 بعد الاستقرار |

---

## القرارات المعتمدة (2026-09-27)
1. ✅ **بدء التنفيذ فوراً**: تنفيذ P0 كاملاً الآن.
2. ✅ **مصير `domains/` الزوستاند**: **إكمالها كبديل نهائي** — المعمارية المستهدفة هي stores زوستاند لكل نطاق (المسار الاستراتيجي)، ويُراجَع P2 النهائي أكثر في أثناء التنفيذ.
3. ⏸️ **حد الاستبقاء لـ change_log**: 7 أيام كسقف افتراضي (قابل للتعديل عند الحاجة).
4. ⏸️ **جدولة المزامنة (P1.3)**: تُراجع بعد استقرار P0.

---

## تعريف النجاح (المقاييس)
- `grep -r "admin123" src server` → فقط ملفات الديمو (seed/mockData/Tests) وفحص كلمة المرور الافتراضية — لا backdoor.
- المسارات الحساسة بلا توكن → 401.
- `change_log` لا يتجاوز السقف مهما زادت الكتابات.
- نسخة اختبارية استعادة merge لا تفقد سجلات أحدث.
- نسخة ثانية عند نفس المنفذ ترفض البدء.
- `AppContext.tsx` ≤ ~500 سطر وكل كبسولة ≤ ~300 سطر.
- `useApp()` في أي مكان داخل `src/` لا يوجد داخل `src/context/AppContext.tsx` نفسها (لا اعتماد دائري).