# RestoCost Pro v7.0 — Windows

## التشغيل من ملفات BAT

للتثبيت الكامل بضغطة واحدة استخدم الملف الموجود في جذر المشروع:

```text
RestoCostPro-Setup.bat
```

هذا الملف يثبت Node.js وDocker Desktop عبر `winget` عند توفره، ينسخ النظام إلى مجلد ثابت، يثبت الحزم، يشغل PostgreSQL، ينشئ الجداول، ينشئ اختصار سطح المكتب، يفعّل التشغيل التلقائي، ويفتح النظام على المنفذ 3031.

المتطلبات:

1. Windows 10 أو Windows 11.
2. Node.js 18 أو أحدث.
3. Docker Desktop يعمل في الخلفية.

شغّل الملفات بالترتيب:

- `install-windows.bat`: تثبيت الحزم، تشغيل PostgreSQL، إنشاء الجداول، وإعداد التشغيل التلقائي.
- `start-server.bat`: تشغيل الخادم وقاعدة البيانات وفتح النظام.
- `open-restocost.bat`: تشغيل النظام من اختصار Windows.
- `stop-server.bat`: إيقاف الخادم وقاعدة البيانات.
- `uninstall-windows.bat`: إزالة التشغيل التلقائي وإيقاف الخدمات مع إبقاء بيانات PostgreSQL.
- `install-extensions.bat`: تثبيت الاعتماديات فقط، ويستخدمه مثبت EXE.

النظام يعمل على:

```text
http://127.0.0.1:3031
```

## التشغيل مع بدء Windows

ملف `install-windows.bat` ينشئ مهمة Windows باسم:

```text
RestoCost Pro v7.0 Server
```

كما يضع اختصاراً في مجلد Startup للمستخدم الحالي. يمكن إزالة ذلك عبر `uninstall-windows.bat`.

## بناء ملف EXE

لبناء مثبت احترافي، نزّل وثبّت **Inno Setup 6** على جهاز Windows، ثم افتح الملف:

```text
RestoCostPro.iss
```

اضغط **Compile**. سيتم إنشاء الملف:

```text
installer-output\RestoCostPro-v7-Setup.exe
```

المثبت يقوم بنسخ ملفات النظام، تثبيت حزم Node.js، تشغيل PostgreSQL عبر Docker، إنشاء الجداول، وإضافة التشغيل التلقائي.

> Docker Desktop وNode.js متطلبات خارجية ويجب تثبيتهما مسبقاً. لا يتم تضمين Docker أو Node.js داخل ملف EXE لتجنب إنشاء مثبت ضخم وغير آمن.
