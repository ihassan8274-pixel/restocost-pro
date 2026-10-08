# تقرير الفحص الشامل — RestoCost ERP Pro v2.0.0

**تاريخ الفحص:** 2026-09-30
**الملفود:** كامل المستودع (server + frontend + tools + docs)

---

## نظرة عامة

| البند | التفاصيل |
|-------|----------|
| الاسم | RestoCost ERP Pro |
| الإصدار | v2.0.0 |
| اللغة | TypeScript (ESM) |
| الواجهة | React 19 + Vite 6 + Tailwind 4 + Zustand 5 |
| الخادم | Express 4 + Prisma 6 |
| قاعدة البيانات | PostgreSQL (أساسي) + SQLite (احتياطي) |
| الاختبارات | Vitest + node:test (7 ملفات اختبار) |
| النشر | IIS + Windows Service (يدوي) |
| التغليف | Capacitor 8 (Android) |

---

## هيكل المشروع

```
NEW APP/
├── server/              # خادم Express (40+ ملف، ~8000 سطر)
│   ├── index.js         # نقطة الدخول (341 سطر)
│   ├── core.mjs         # المصادقة والجلسات (182 سطر)
│   ├── store.mjs        # طبقة البيانات (502 سطر)
│   ├── repository.mjs   # Repository + Unit of Work (181 سطر)
│   ├── auth-utils.mjs   # تشفير وكلمات المرور (50 سطر)
│   ├── totp.mjs         # TOTP 2FA (78 سطر)
│   ├── secrets.mjs      # AES-256-GCM (140 سطر)
│   ├── logger.mjs       # تسجيل منظم (114 سطر)
│   ├── mergeCore.mjs    # دمج بـ ID (50 سطر)
│   ├── paginate.mjs     # ترقيم بـ Cursor (38 سطر)
│   ├── periodLock.mjs   # قفل الفترات (84 سطر)
│   ├── openapi.mjs      # OpenAPI 3.0.3 (109 سطر)
│   ├── version.mjs      # بصمة البناء (31 سطر)
│   ├── telegram.mjs     # بوت تيليجرام (374 سطر)
│   ├── webhooks.mjs     # Webhooks (123 سطر)
│   ├── bot-poll.mjs     # Long-polling (218 سطر)
│   ├── tg-catalog.mjs   # كتالوج تلقائي (135 سطر)
│   ├── intake.mjs       # محرك تحليل نص عربي (1066+ سطر)
│   ├── intake-inbox.mjs # صندوق التحقق (296 سطر)
│   ├── intake-flow.mjs  # تدفق تفاعلي (382 سطر)
│   ├── pdf.mjs          # توليد PDF (385 سطر)
│   ├── pdf-intake.mjs   # معالجة PDF مرفق (100 سطر)
│   ├── watcher.mjs      # مشرف العمليات (74 سطر)
│   ├── seed.mjs         # بيانات تجريبية SQLite (62 سطر)
│   ├── seed-pg.mjs      # بيانات تجريبية PostgreSQL (105 سطر)
│   ├── routes/          # مسارات API
│   │   ├── auth.mjs     # مصادقة + مستخدمين + تدقيق (343 سطر)
│   │   ├── data.mjs     # بيانات أساسية (852 سطر)
│   │   ├── report.mjs   # تقارير PDF (146 سطر)
│   │   ├── backup.mjs   # نسخ احتياطي (405 سطر)
│   │   ├── ai.mjs       # وكيل AI (188 سطر)
│   │   └── webhooks.mjs # إدارة Webhooks (72 سطر)
│   ├── lib/prisma.ts    # Prisma singleton (12 سطر)
│   ├── scripts/         # سكربتات مساعدة
│   └── test/            # اختبارات (7 ملفات)
├── src/                 # واجهة React
│   ├── main.tsx         # نقطة الدخول (54 سطر)
│   ├── App.tsx          # الهيكل الرئيسي (483 سطر)
│   ├── i18n.ts          # ترجمة عربي/إنجليزي (167 سطر)
│   ├── navigation.ts    # 100+ عنصر تنقل (199 سطر)
│   ├── context/         # React Context
│   │   ├── AppContext.tsx  # 3600+ سطر (ضخم جداً)
│   │   ├── domainBridge.tsx # ربط Context بـ Zustand (159 سطر)
│   │   ├── syncEngine.ts    # إعادة إرسال (106 سطر)
│   │   ├── selectors.ts    # محددات محسوبة (173 سطر)
│   │   └── domains/        # Zustand stores
│   ├── stores/          # Zustand stores
│   ├── components/      # مكونات (100+ view)
│   ├── utils/           # أدوات مساعدة
│   └── test/            # إعداد الاختبارات
├── prisma/              # Prisma schema (186 سطر)
├── tools/               # أدوات مساعدة
├── docs/                # توثيق
└── scripts/             # سكربتات تطوير
```

---

## نقاط القوة

### 1. البنية المعمارية

| النمط | الوصف |
|-------|-------|
| Repository Pattern | CollectionRepository + UnitOfWork لوصول البيانات |
| CDC (Change Data Capture) | سجل تغييرات للتزامن التدريجي |
| Tombstone Pattern | حذف ناعم مع تتبع دائم |
| CRDT-like Merge | دمج بـ ID بدون تعارضات |
| Domain Bridge | ربط React Context بـ Zustand |
| Capsule Pattern | كبسولات للتوافق الخلفي |

### 2. قاعدة البيانات

- **PostgreSQL** كقاعدة أساسية عبر Prisma
- **SQLite** كاحتياطي تلقائي عند فشل PostgreSQL
- **فهارس** على كل المفاتيح الأجنبية والطوابع الزمنية
- **Connection pooling** (connection_limit=20, pool_timeout=10)
- **In-memory cache** — كل القراءات من Map بدون استعلامات
- **Serialized write queue** — الكتابات لا تمنع القراءات

### 3. الأمان

| الميزة | التفاصيل |
|--------|----------|
| تشفير كلمات المرور | bcrypt + ترحيل من SHA-256 القديم |
| TOTP 2FA | RFC 6238 مع متجهات اختبار |
| تشفير البيانات | AES-256-GCM مع AAD |
| إدارة الجلسات | TTL + تعطيل عند الحذف |
| سجل كلمات المرور | آخر 5 كلمات مرور ممنوعة |
| Rate limiting | قفل الحساب بعد 5 محاولات فاشلة |
| Secret stripping | لا تُرسل كلمات المرور أو TOTP للعميل |
| AI key masking | يُرسل hasKey فقط |
| Headers أمنية | X-Content-Type-Options, X-Frame-Options, CSP |
| Single-instance lock | منع تكرار الخادم |
| Mojibake detection | كشف تلف النص العربي |

### 4. المرونة

- **Crash resilience** — uncaughtException و unhandledRejection handlers
- **Graceful degradation** — PostgreSQL → SQLite، PyMuPDF → jsPDF
- **Port conflict detection** — رفض التشغيل إذا المنفذ مشغول
- **Shrink guard** — منع بيانات الاختبار من الكتابة فوق البيانات الحقيقية
- **Empty overwrite guard** — منع المصفوفات الفارغة من مسح البيانات
- **Period lock** — قفل الفترات المغلقة من الخادم

### 5. الاختبارات

| الملف | الاختبارات | العدد |
|-------|-----------|-------|
| merge.test.mjs | منطق الدمج | 9 |
| auth-utils.test.mjs | أدوات المصادقة | 8 |
| paginate.test.mjs | الترقيم | 7 |
| totp.test.mjs | TOTP | 7 |
| shrink.test.mjs | الحارس | 10 |
| repository.test.mjs | Repository | 12 |
| cdc.test.mjs | CDC | 7 |
| **المجموع** | | **60 اختبار** |

### 6. PWA والعمل بدون اتصال

- Service worker للتخزين المؤقت
- Offline fallback إلى localStorage
- Stale chunk recovery عند فشل التحميل
- Zustand persist middleware
- قائمة حفظ موثوقة مع abort controllers

### 7. الأداء

- **Code splitting** — 100+ view محمّلة كسولاً عبر React.lazy()
- **Manual chunk splitting** — React, router, zustand, lucide-react منفصلة
- **In-memory reads** — كل القراءات متزامنة من Map
- **CDC sync** — جلب التغييرات فقط
- **Cursor pagination** — للمجموعات الكبيرة
- **Gzip compression** — للاستجابات أكبر من 1KB
- **Debounced sync** — 500ms بدلاً من المزامنة عند الرسم

### 8. واجهة المستخدم

- **RTL كامل** — اتجاه عربي من اليمين لليسار
- **i18n** — نظام ترجمة عربي/إنجليزي
- **CommandPalette** — بحث واختصارات
- **ErrorBoundary** — معالجة أخطاء عامة
- **Undo/Redo** — تراجع/إعادة عالمي
- **Toast notifications** — مع إمكانية التراجع
- **Keyboard shortcuts** — Ctrl+Z/Y, /, N, E

### 9. التكاملات

- **Telegram Bot** — إرسال تقارير ورسائل
- **Webhooks** — إشعارات خارجية
- **AI proxy** — OpenAI, Groq, OpenRouter, Gemini
- **PDF generation** — PyMuPDF + jsPDF fallback
- **Excel import/export** — exceljs
- **ZATCA compliance** — ضريبة القيمة المضافة السعودية

### 10. التوثيق

- 25+ ملف توثيق بالعربية
- OpenAPI 3.0.3 spec
- خطط إصلاح متعددة (REPAIR_PLAN, AUDIT_PLAN, etc.)
- تقارير معمارية مفصلة

---

## نقاط الضعف

### حرجة (Critical)

| # | المشكلة | الموقع | الخطورة |
|---|---------|--------|---------|
| 1 | **JWT_SECRET مكشوف** | `.env` سطر 10 | اختراق كامل — يمكن تزوير أي token |
| 2 | **SESSION_SECRET مكشوف** | `.env` سطر 12 | اختراق كامل — يمكن تزوير الجلسات |
| 3 | **بيانات دخول تجريبية في seed** | `server/seed.mjs` أسطر 17-22 | دخول غير مصرح به بـ admin123 |
| 4 | **login.json / test-login.json** | جذر المشروع | كلمات مرور بنص صريح |
| 5 | **tools/.srvcred.json** | tools/ | بيانات اعتماد الخدمة مكشوفة |
| 6 | **لا يوجد CSRF protection** | كل الـ endpoints | هجمات CSRF على تغيير الحالة |

### عالية (High)

| # | المشكلة | الموقع | التأثير |
|---|---------|--------|---------|
| 7 | **AppContext = 3600+ سطر** | `src/context/AppContext.tsx` | God Object — صعوبة صيانة وأخطاء |
| 8 | **لا يوجد CI/CD** | — | نشر يدوي — أخطاء وعدم اتساق |
| 9 | **لا يوجد Docker** | — | صعوبة نشر في بيئات مختلفة |
| 10 | **Polling كل 500ms** | `src/context/domainBridge.tsx` | استهلاك CPU غير ضروري |
| 11 | **لا rate limiting على AI** | `server/routes/ai.mjs` | إساءة استخدام محتملة |
| 12 | **لا input sanitization على HTML** | `server/routes/report.mjs` | ثغرة XSS محتملة |
| 13 | **لا database migrations** | `prisma/` | صعوبة تتبع تغييرات الـ schema |
| 14 | **Python paths hardcoded** | `server/pdf.mjs` أسطر 23-28 | كسر في بيئات مختلفة |
| 15 | **AI provider URLs hardcoded** | `server/routes/ai.mjs` أسطر 13-17 | صعوبة التكوين |

### متوسطة (Medium)

| # | المشكلة | الموقع | التأثير |
|---|---------|--------|---------|
| 16 | **i18n غير مكتمل** | أغلب الـ views | صعوبة الترجمة المستقبلية |
| 17 | **لا accessibility (a11y)** | كل الواجهة | تجربة سيئة لذوي الإعاقة |
| 18 | **لا HTTPS enforcement** | `server/index.js` | هجمات MITM |
| 19 | **لا frontend tests** | `src/` | ثغرات في واجهة المستخدم |
| 20 | **لا integration tests** | — | مشاكل في التكامل بين الوحدات |
| 21 | **Invoice platform URL hardcoded** | `server/index.js` سطر 145 | صعوبة التكوين |
| 22 | **Telegram API URL hardcoded** | `server/telegram.mjs` سطر 11 | صعوبة التكوين |
| 23 | **لا error boundary مخصص** | كل قسم | تجربة خطأ عامة |
| 24 | **لا يوجد logging مركزي** | — | صعوبة تتبع الأخطاء |
| 25 | **لا يوجد request tracing** | — | صعوبة تحليل الأداء |

### منخفضة (Low)

| # | المشكلة | الموقع | التأثير |
|---|---------|--------|---------|
| 26 | **TODO: raw material price update** | `useInventoryCapsule.tsx:337` | ميزة غير مكتملة |
| 27 | **TODO: تحقق من closed_months** | `aggregationEngine.ts:535` | تحقق ناقص |
| 28 | **CO-XXX placeholder** | `CompaniesView.tsx:228` | قيمة وهمية |
| 29 | **لا يوجد skip navigation** | الواجهة | صعوبة تنقل لذوي الإعاقة |
| 30 | **لا يوجد focus management** | الـ modals | تجربة مستخدم سيئة |

---

## مخطط الإصلاح الشامل

### المرحلة 1: الأمان الحرج (1-2 يوم)

#### 1.1 نقل الـ secrets

```bash
# إنشاء ملف .env.local (مضاف إلى .gitignore)
JWT_SECRET=<random-64-char>
SESSION_SECRET=<random-64-char>
SECRETS_KEY=<random-32-char>

# تعديل server/core.mjs لقراءة من process.env
```

#### 1.2 إزالة الـ demo credentials

```javascript
// server/seed.mjs — استبدال القيم الثابتة
const adminPass = process.argv[2] || crypto.randomBytes(12).toString('hex');
```

#### 1.3 حذف الملفات الحساسة

```bash
# إضافة إلى .gitignore
login.json
test-login.json
tools/.srvcred.json
.env
.env.local
```

#### 1.4 إضافة CSRF protection

```javascript
// server/index.js
import csrf from 'csurf';
app.use(csrf({ cookie: { sameSite: 'strict', secure: true } }));
```

#### 1.5 Rate limiting على AI endpoints

```javascript
// server/routes/ai.mjs
const aiLimiter = rateLimit({ windowMs: 60000, max: 10 });
app.use('/api/ai', aiLimiter);
```

---

### المرحلة 2: البنية التحتية (2-3 أيام)

#### 2.1 CI/CD مع GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

#### 2.2 Docker

```dockerfile
# Dockerfile.server
FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
EXPOSE 3001
CMD ["node", "index.js"]
```

```dockerfile
# Dockerfile.web
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

#### 2.3 Database migrations

```bash
# إنشاء migrations من الـ schema
npx prisma migrate dev --name init
npx prisma migrate deploy
```

---

### المرحلة 3: إعادة هيكلة الكود (3-5 أيام)

#### 3.1 تقسيم AppContext

```
src/context/
├── AuthContext.tsx        # المصادقة والجلسات
├── InventoryContext.tsx   # المخزون
├── SalesContext.tsx       # المبيعات
├── SettingsContext.tsx    # الإعدادات
├── SyncContext.tsx        # المزامنة
├── FinancialContext.tsx   # المالية
├── ProductionContext.tsx  # الإنتاج
└── index.tsx              # يجمع كل الـ providers
```

#### 3.2 استبدال DomainBridge polling

```typescript
// بدلاً من setInterval(500ms)
// استخدام zustand subscribe
useEffect(() => {
  const unsub = useAppStore.subscribe(
    (state) => state.data,
    (data) => { /* تحديث الـ bridge */ }
  );
  return unsub;
}, []);
```

#### 3.3 Input sanitization على التقارير

```javascript
// server/routes/report.mjs
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userHtml, {
  ALLOWED_TAGS: ['b', 'i', 'u', 'table', 'tr', 'td', 'th'],
  ALLOWED_ATTR: ['class', 'style']
});
```

---

### المرحلة 4: الاختبارات (2-3 أيام)

#### 4.1 Frontend tests

```typescript
// src/components/ui/Modal.test.tsx
import { render, screen } from '@testing-library/react';
import { Modal } from './Modal';

test('renders modal with title', () => {
  render(<Modal title="Test">Content</Modal>);
  expect(screen.getByText('Test')).toBeInTheDocument();
});
```

#### 4.2 Integration tests

```javascript
// server/test/integration/auth.test.mjs
test('full auth flow: register → login → access protected', async () => {
  // 1. Register
  // 2. Login
  // 3. Access protected route
  // 4. Logout
  // 5. Verify token invalid
});
```

#### 4.3 E2E tests

```javascript
// e2e/pos.spec.ts
test('complete sale flow', async ({ page }) => {
  await page.goto('/pos');
  await page.click('[data-testid="product-1"]');
  await page.click('[data-testid="checkout"]');
  await page.click('[data-testid="pay-cash"]');
  await expect(page.getByText('تم البيع بنجاح')).toBeVisible();
});
```

---

### المرحلة 5: تجربة المستخدم (2-3 أيام)

#### 5.1 إكمال i18n

```typescript
// src/i18n/ar.ts
export default {
  'pos.title': 'نقطة البيع',
  'pos.checkout': 'إتمام البيع',
  'pos.payment': 'الدفع',
  // ... كل النصوص
};

// src/i18n/en.ts
export default {
  'pos.title': 'Point of Sale',
  'pos.checkout': 'Checkout',
  'pos.payment': 'Payment',
};
```

#### 5.2 تحسين accessibility

```tsx
// إضافة ARIA labels
<button aria-label="إغلاق النافذة" role="button">
  <X />
</button>

// Focus management في modals
useEffect(() => {
  const modal = ref.current;
  const focusable = modal.querySelectorAll('button, [href], input');
  focusable[0]?.focus();
  return () => focusable[0]?.blur();
}, []);
```

#### 5.3 Error boundaries مخصصة

```tsx
// src/components/error/InventoryErrorBoundary.tsx
class InventoryErrorBoundary extends Component {
  componentDidCatch(error, info) {
    logErrorToService(error, info);
  }
  render() {
    return this.state.hasError
      ? <ErrorFallback onRetry={() => this.setState({ hasError: false })} />
      : this.props.children;
  }
}
```

---

### المرحلة 6: التحسينات (1-2 يوم)

#### 6.1 نقل الـ hardcoded paths إلى config

```javascript
// config.js
export const PYTHON_PATH = process.env.PYTHON_PATH || 'python3';
export const AI_PROVIDERS = {
  openai: process.env.OPENAI_URL || 'https://api.openai.com/v1',
  groq: process.env.GROQ_URL || 'https://api.groq.com/openai/v1',
};
```

#### 6.2 HTTPS enforcement

```javascript
// server/index.js
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
```

#### 6.3 Request tracing

```javascript
// server/core.mjs
import { v4 as uuid } from 'uuid';
app.use((req, res, next) => {
  req.id = uuid();
  res.setHeader('X-Request-ID', req.id);
  next();
});
```

---

## ترتيب الأولويات والجدول الزمني

```
الأسبوع 1:
  ✅ المرحلة 1: الأمان الحرج (1-2 يوم)
  ✅ المرحلة 2: البنية التحتية (2-3 أيام)

الأسبوع 2:
  ✅ المرحلة 3: إعادة هيكلة الكود (3-5 أيام)

الأسبوع 3:
  ✅ المرحلة 4: الاختبارات (2-3 أيام)
  ✅ المرحلة 5: تجربة المستخدم (2-3 أيام)

الأسبوع 4:
  ✅ المرحلة 6: التحسينات (1-2 يوم)
  ✅ مراجعة شاملة وتنظيف
```

---

## مؤشرات النجاح

| المؤشر | الوضع الحالي | الهدف |
|--------|-------------|-------|
| تغطية الاختبارات | ~15% (60 اختبار) | 70%+ |
| حجم AppContext | 3600+ سطر | < 500 سطر لكل context |
| الـ secrets المكشوفة | 6 | 0 |
| CI/CD | لا يوجد | GitHub Actions |
| Docker | لا يوجد | Dockerfile + compose |
| Accessibility | 0% | WCAG 2.1 AA |
| i18n | ~10% | 100% |

---

## الخلاصة

النظام **قوي جداً** من الناحية المعمارية والوظيفية. يستخدم أنماط تصميم متقدمة (Repository, CDC, CRDT, Tombstone) ويغطي مجالات واسعة (مخزون، مبيعات، إنتاج، مالية، رواتب، تقارير).

**الأولوية القصوى:** إصلاح الثغرات الأمنية الحرجة (secrets مكشوفة، CSRF، demo credentials).

**الأولوية الثانية:** إعادة هيكلة AppContext الضخم وإضافة CI/CD و Docker.

**الأولوية الثالثة:** إكمال الاختبارات وتحسين تجربة المستخدم والوصول.

بإصلاح هذه النقاط، سيصبح النظام جاهزاً للإنتاج على نطاق واسع مع ثقة عالية في الأمان والاستقرار.
