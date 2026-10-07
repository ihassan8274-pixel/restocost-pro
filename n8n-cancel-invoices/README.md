# نظام متابعة الفواتير الملغية والتعويضات — تليجرام + n8n

## الفكرة
- الكاشير في كل فرع يرسل على بوت التليجرام:
  - **صورة الفاتورة الملغية** وكابشن بالشكل ده:
    ```
    الغاء
    الفرع: الرياض - الشمال
    رقم الفاتورة: 10452
    السبب: خطأ إدخال
    ```
  - ولاحقًا لما يعوّض العميل يرسل **صورة التعويض** وكابشن:
    ```
    تعويض
    رقم الفاتورة: 10452
    ```
- n8n يستقبل الرسائل، يسجلها في Google Sheet، ويبعتلك تنبيه فوري على بوت المالك.
- تقرير يومي الساعة 11 مساءً بعدد الإلغاءات والتعويضات لكل فرع.

## خطوات الإعداد

### 1) تشغيل n8n
```bash
cd "E:\MASSOBI APP\NEW APP\n8n-cancel-invoices"
docker compose up -d
```
افتح http://localhost:5678 وأنشئ حساب المالك.

### 2) إنشاء البوتات في تليجرام
- من @BotFather أنشئ بوت الاستقبال (بتستقبل عليه رسائل الكاشير) → خد الـ Token.
- أنشئ بوت المالك (أو استخدم جروب خاص بيك) → خد chat_id بتاعك.

### 3) Google Sheets
- أنشئ ملف Google Sheet وسمّه `CancelledInvoices`.
- الصف الأول رؤوس الأعمدة:
  `التاريخ | الفرع | رقم الفاتورة | السبب | الكاشير | ملف الفاتورة | حالة التعويض | ملف التعويض | وقت التعويض`
- في n8n: Credentials → Google Sheets OAuth2 → اربط حسابك.

### 4) استيراد الـ Workflows
من n8n: Menu → Import from File، واستورد:
1. `01-cancel-and-compensation.json` — الإلغاءات والتعويضات (ملف واحد)
2. `03-daily-report.json` — التقرير اليومي

عدّل داخل كل Workflow:
- Telegram Trigger/Credential → حط توكن بوت الاستقبال.
- عقد Google Sheets → حط ID الشيت.
- عقد Telegram "notify owner" → حط توكن بوت المالك + chat_id بتاعك.

### 5) تفعيل
اضغط Active على الـ Workflows. من دلوقتي أي كاشير يبعت «الغاء» + صورة هتوصلك فورًا.

## لوحة التحكم والتقارير (الواجهة)
فولدر `dashboard` فيه واجهة ويب بسيطة تعرض كل السجل مع فلترة بالفرع/الحالة/التاريخ/رقم الفاتورة، وعدّادات، وتصدير CSV، وطباعة.

```bash
cd "E:\MASSOBI APP\NEW APP\n8n-cancel-invoices\dashboard"
npm install
$env:SHEET_CSV_URL="رابط الـ CSV المنشور من Google Sheets"
npm start
```
افتح http://localhost:4100

للحصول على SHEET_CSV_URL: من Google Sheets → File → Share → Publish to web → اختر الشيت وصيغة CSV → انسخ الرابط.

### نشر الواجهة مجانًا على الإنترنت (Render)
1. ارفع فولدر المشروع على GitHub.
2. ادخل render.com وسجّل بحساب GitHub.
3. New → Blueprint → اختار الريبو (هيقرا `render.yaml` تلقائيًا).
4. حط قيمة `SHEET_CSV_URL` في إعدادات الـ Environment.
5. بعد النشر هيديك رابط عام زي `https://cancelled-invoices-dashboard.onrender.com`.

⚠️ خطة Render المجانية بتنام بعد 15 دقيقة عدم استخدام. عشان تفضل شغالة 24 ساعة: سجّل في cron-job.org مجاني وحط URLين (الواجهة + n8n) يتنادوا كل 10 دقائق.

ملاحظة مهمة: n8n على Render المجاني من غير قرص تخزين دائم — كل فترة صدّر الـ workflows (Download JSON) كـ backup، وحدّث webhook التليجرام بعنوان Render بعد كل deploy (Telegram Trigger → فعّل Webhook mode).

## ملف Excel جاهز
`CancelledInvoices-Template.xlsx` — ارفعه على drive.google.com وافتحه بـ Google Sheets (File → Import) عشان يكون الشيت بنفس الأعمدة المطلوبة، وبعدها اعمل Publish to web → CSV واستخرج SHEET_CSV_URL.

### الصور
عند استقبال أي صورة (إلغاء أو تعويض)، الـ workflow بيحمّلها من تليجرام ويحفظها تلقائيًا في:
`E:\MASSOBI APP\NEW APP\n8n-cancel-invoices\photos\`
باسم `cancel-<رقم الفاتورة>.jpg` و `comp-<رقم الفاتورة>.jpg`.

### النسخ الاحتياطي التلقائي
مهمة مجدولة `CancelInvoicesBackup` شغالة كل ساعتين:
- تنسخ الشيت (CSV) إلى `backups/sheet-<تاريخ>.csv`
- تنسخ فولدر الصور إلى `backups/photos-<تاريخ>`
- بتمسح النسخ الأقدم من 7 أيام
- محتاج تحط رابط CSV المنشور في `backup.env` مقابل `SHEET_CSV_URL`

## ملاحظات
- لو الكاشير بعت رسالة ناقصة (مفيش رقم فاتورة مثلًا)، n8n هيرد عليه برسالة بالصيغة المطلوبة.
- صور الفواتير والتعويضات بتتخزن كـ file_id في الشيت، وتقدر تفتحها من رسالة التنبيه.
