# RestoCost Pro v7.0 — Local PostgreSQL Edition

هذه النسخة تحول النظام من تخزين المتصفح إلى نظام محلي كامل يتكون من **واجهة HTML**، وخادم **Node.js/Express**، وقاعدة بيانات **PostgreSQL** تعمل محلياً عبر Docker. المنفذ الافتراضي للخادم هو **3031**.

## المتطلبات

- Node.js 18 أو أحدث
- npm
- Docker و Docker Compose

## التثبيت والتشغيل

من داخل مجلد المشروع:

```bash
chmod +x install.sh start.sh stop.sh
./install.sh
./start.sh
```

ثم افتح:

```text
http://127.0.0.1:3031
```

لإيقاف قاعدة البيانات المحلية:

```bash
./stop.sh
```

## Windows وملفات BAT وEXE

يوجد مجلد `windows/` يحتوي على ملفات التثبيت والتشغيل والإيقاف والتشغيل التلقائي. ابدأ بقراءة [دليل Windows](windows/README-WINDOWS.md). يعمل النظام على المنفذ `3031`، ويمكن بناء مثبت EXE عبر ملف `windows/RestoCostPro.iss` باستخدام Inno Setup 6.

للتثبيت بضغطة واحدة استخدم [RestoCostPro-Setup.bat](RestoCostPro-Setup.bat)، حيث يثبت المتطلبات، ينسخ النظام، ينشئ اختصار سطح المكتب، ويفعّل التشغيل التلقائي.

لإضافة بيانات تجريبية اختيارياً:

```bash
SEED_RESTOCOST=true ./install.sh
# أو بعد التثبيت
npm run db:seed
```

## الملفات الرئيسية

| الملف | الوظيفة |
|---|---|
| `restocost-pro.html` | واجهة الإصدار v7.0، وتستخدم API بدلاً من `localStorage`. |
| `backend/server.js` | خادم Express، تقديم الواجهة وواجهات API. |
| `backend/db.js` | Pool الاتصال بـ PostgreSQL وإدارة المعاملات. |
| `backend/schema.sql` | مخطط الجداول والفهارس. |
| `backend/migrate.js` | إنشاء/تحديث الجداول. |
| `backend/seed.js` | إدخال بيانات تجريبية اختيارية. |
| `docker-compose.yml` | تشغيل PostgreSQL مع Volume دائم. |
| `.env.example` | إعدادات الاتصال والمنفذ. |
| `install.sh` / `start.sh` / `stop.sh` | ملفات التثبيت والتشغيل والإيقاف. |

## واجهات API

- `GET /api/health` فحص الخادم وقاعدة البيانات.
- `GET /api/state` قراءة حالة النظام كاملة.
- `PUT /api/state` حفظ الفروع والعلامات والسجلات والإعدادات في معاملة PostgreSQL واحدة.
- `POST /api/backups` إنشاء نسخة احتياطية في قاعدة البيانات.
- `GET /api/backups` عرض آخر 10 نسخ.
- `POST /api/backups/:id/restore` استعادة نسخة.
- `DELETE /api/backups` حذف كل النسخ الاحتياطية.

## نموذج البيانات

- `brands`: العلامات التجارية.
- `branches`: الفروع وربطها بالعلامات والمناطق.
- `monthly_records`: السجلات الشهرية لكل فرع، مع مفتاح مركب من الشهر والفرع.
- `app_settings`: الشعار والثيم والإعدادات العامة.
- `state_backups`: النسخ الاحتياطية داخل PostgreSQL.

## ملاحظات مهمة

هذه النسخة تحفظ البيانات التشغيلية **على PostgreSQL المحلي** وليس داخل المتصفح. الواجهة لا تستخدم `localStorage` للبيانات التشغيلية. يجب إبقاء خدمة PostgreSQL والخادم يعملين حتى يمكن فتح النظام وحفظ البيانات.

قبل الاستخدام على شبكة أو في بيئة إنتاجية، غيّر كلمة مرور PostgreSQL، وضع الخادم خلف HTTPS، وأضف مصادقة للمستخدمين وصلاحيات حسب الفرع أو العلامة التجارية.
