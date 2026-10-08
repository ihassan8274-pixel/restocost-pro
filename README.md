# ═══════════════════════════════════════════════════════════════
#  ⭐ README — RestoCost ERP Pro (Rebuild)
#  ⭐ Arabic / Egyptian dialect — real measured output, not claims
# ═══════════════════════════════════════════════════════════════

## حالة النظام الحالي (قياسة)

- الفرع: `next` — HEAD `613664a` (18 commit ahead master)
- `npm test`: 350/350 ✅
- `vitest api/src/foodics`: 56/56 ✅ (parse + plan + normalize)
- `vitest control`: 48/48 ✅
- `db restocost2`: 13 جدول، 6107 `change_log` — لم تُكتب بيانات اختبار (إصلاح التسرب `bc6f703`)

## ما تم بناؤه من العدم (من 0$)

### Stack
- TypeScript + Fastify 5 + PostgreSQL 17 + Drizzle ORM + ESM
- `i18next` + `react-i18next` (لم يُثبّت بعد — متوقع في المرحلة 3)

### Data Plane (`api/`)
- `foodics/`: parser + dedup + fixtures (744 ملف حقيقي)
- `data-plane/schema.ts`: `pos_item_map`, `pos_order_lines`, `ingestion_batches`, `branches`
- `plan.ts`: `buildIngestPlan()` + `exportPlanJSON/CSV`

### Control Plane (`control/`)
- 14 ملف (`68ca6fc`) — Config + DB + Auth + Health
- `checkPos()`: `foodics | none` — لا migration لو تغيّر POS

### الأمن + البنية
- `pg_hba.conf`: `scram-sha-256` (0 `trust` متبقي)
- `restocost_app`: رفض `CONNECT` على `restocost2` / `postgres` (تم إصلاحه في `db.ts`)
- `pos_item_map`: مفتاح `(pos_source, pos_item_id)` — لا migration

### البيانات (Foodics Export — مقاسة)
- 744 ملف `.xls` (محتوى HTML، ليس OLE2)
- 16,044 صف بيانات
- 29 منتج، 34 كود منتج
- 6 أسماء تحمل >1 كود (`juice` → 2 رمز)
- 1 كود يحمل >1 اسم (`product-3` → 2 اسم)
- 336 مكرر (10.2026/5..31 = نسخ من 09.2026/5..30)
- 0 صف `الإجمالي`
- 12 فرع (B02..B18) — كل واحد مرجع ثابت

## الملفات المحمية (لم تُتلف)

- `design-tokens.json` (معدّل)
- `scripts/` (14 ملف غير متتبع)
- `*.txt` (2 ملف غير متتبع)
- `.env` (غير معدّل — `DATABASE_URL` يشير لـ `restocost2`)

## ما يتبقى (حسب الوقت / الأولوية)

1. **DB creation**: `restocost_massobi` (محظور `CREATEDB` — يحتاج `restocost_admin`)
2. **Drizzle migrate**: `npx drizzle-kit push` (يتطلب TTY أو `--reset`)
3. **Food Cost % report**: بناء على 389 `foodics` batch موجودة في `restocost2`
4. **i18n**: `npm install i18next react-i18next` (6,272 سلسلة عربية في 298 ملف)
5. **NSSM / Cloudflare Tunnel**: تشغيل `restocostprov7` + `cloudflared`
6. **Riyadh day bug**: `todayOrders` / `isToday` يستخدم UTC (خطأ 21:00–24:00 الرياض)

## قرارات ثابتة

- **لا POS** — Foodics SaaS فقط
- **لا Consolidated Group Report** — كل شركة منفصلة
- **English primary, Arabic secondary, menus only**
- `name_en` = NULL (ليس `''`) عندما فارغ
- `norm_name_en` / `norm_name_ar`: `normalizeArabic()` أولاً (الرقم قبل الحرك)
- **No Docker** — Windows مباشرة
- **$0 total** — لا استضافة، لا Windows Server
