# خطة الإصلاحات الشاملة — RestoCost ERP Pro
# تاريخ: 2026-09-29
# التقييم الحالي: 6.5/10 → الهدف: 8.5/10

---

## المرحلة 0: نقل إلى Zustand (مكتمل)

### Zustand Stores — `src/stores/`

| Store | المجال | الحالة |
|-------|--------|--------|
| `authStore.ts` | المصادقة، المستخدمون، الصلاحيات | ✅ مكتمل |
| `inventoryStore.ts` | المخزون، الدفعات، الحركات، التحويلات | ✅ مكتمل |
| `procurementStore.ts` | الموردون، GRN، أوامر الشراء | ✅ مكتمل |
| `productionStore.ts` | الوصفات، التصنيع، أوامر العمل | ✅ مكتمل |
| `financialStore.ts` | الحسابات، القيود، الأصول الثابتة | ✅ مكتمل |
| `salesStore.ts` | POS، المبيعات، العملاء، الفواتير | ✅ مكتمل |
| `settingsStore.ts` | الفروع، الوحدات، العملات، الشركات | ✅ مكتمل |
| `hrStore.ts` | الموظفون، الحضور، الرواتب | ✅ مكتمل |
| `periodStore.ts` | إغلاق الفترات، الجرد الشهري | ✅ مكتمل |
| `syncStore.ts` | المزامنة، bootstrap، offline | ✅ مكتمل |

### Hooks Wrapper — `src/stores/hooks/`

| Hook | المصدر | الحالة |
|------|--------|--------|
| `useAuth` | `authStore` | ✅ مكتمل |
| `useInventory` | `inventoryStore` | ✅ مكتمل |
| `useProcurement` | `procurementStore` | ✅ مكتمل |
| `useProduction` | `productionStore` | ✅ مكتمل |
| `useFinancial` | `financialStore` | ✅ مكتمل |
| `useSales` | `salesStore` | ✅ مكتمل |
| `useSettings` | `settingsStore` | ✅ مكتمل |
| `useHR` | `hrStore` | ✅ مكتمل |
| `usePeriod` | `periodStore` | ✅ مكتمل |
| `useSync` | `syncStore` | ✅ مكتمل |

### خطة الدمج مع Zustand
1. تحديث `main.tsx` لاستخدام `useAuth` + `useInventory` + ... بدلاً من `useApp()`
2. تحديث المكونات لاستخدام hooks الجديدة (`useAuth`, `useInventory`, إلخ) بدلاً من `useApp()`
3. إزالة `AppContext.tsx` بعد التأكد من عمل كل شيء

---

## المرحلة 1: إصلاحات حرجة (أمان + استقرار)

### 1.1 إصلاح البروكسي بلا مصادقة
**الملف:** `server/index.js` (الأسطر 145-202)
**المشكلة:** `/invoice-platform*` يسمح بأي طلب غير مصادق → SSRF proxy مفتوح
**الإصلاح:**
```javascript
// إضافة فحص المصادقة قبل البروكسي
app.all('/invoice-platform*', (req, res, next) => {
  const user = sessionUser(readToken(req));
  if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
  next();
}, proxyInvoicePlatform);
```

### 1.2 إزالة مفتاح API من URL
**الملف:** `src/utils/ai.ts` (السطر 303)
**المشكلة:** مفتاح Gemini يُرسل كـ query parameter (يُسجَّل في السجلات)
**الإصلاح:** استخدام POST body بدلاً من GET query parameter

### 1.3 إصلاح loadState (no-op)
**الملف:** `src/context/AppContext.tsx` (السطر 76)
**المشكلة:** `loadState` دائماً يُرجع fallback ولا يقرأ localStorage
**الإصلاح:**
```typescript
const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
};
```

### 1.4 إصلاح تسرب الذاكرة (Blob URLs)
**الملفات:** `src/utils/helpers.ts` (184-195)، `src/utils/excel.ts` (136-147)، `src/utils/print.ts` (141-249)، `src/utils/pdf.ts` (348-352)
**المشكلة:** Blob URLs لا تُحرَّر أبداً
**الإصلاح:** إضافة `URL.revokeObjectURL(url)` بعد الاستخدام

### 1.5 إصلاح تزامن الكتابة (Race Condition)
**الملف:** `server/routes/data.mjs` (الأسطر 379-392)
**المشكلة:** طلبات متزامنة قد تُفقد البيانات
**الإصلاح:** إضافة قفل لكل مفتاح (per-key lock)

---

## المرحلة 2: إصلاحات أداء

### 2.1 تحميل كسول للمجموعات الثقيلة
**الملف:** `server/routes/data.mjs` (تم تطبيقه جزئياً)
**المشكلة:** bootstrap يحمل 61K سجل
**الإصلاح:** استثناء المجموعات الثقيلة (تم تطبيق LAZY_KEYS)

### 2.2 إضافة useCallback للدوال
**الملف:** `src/context/AppContext.tsx`
**المشكلة:** دوال جديدة كل render → re-renders غير ضرورية
**الإصلاح:** تغليف كل دوال التعديل بـ useCallback

### 2.3 إضافة useMemo لقيمة الـ context
**الملف:** `src/context/AppContext.tsx` (الأسطر 3634-3695)
**المشكلة:** قيمة الـ context تُعاد كل render
**الإصلاح:**
```typescript
const value = useMemo(() => ({ /* ... */ }), [/* dependencies */]);
```

### 2.4 تقليل chunkSizeWarningLimit
**الملف:** `vite.config.ts`
**المشكلة:** الحد 1200KB مرتفع جداً
**الإصلاح:** تغييره إلى 600KB

---

## المرحلة 3: إصلاحات أمان إضافية

### 3.1 إضافة Rate Limiting لكل المسارات
**الملف:** `server/index.js`
**الإصلاح:** middleware عام للـ rate limiting

### 3.2 إصلاح تسريب معلومات المستخدم
**الملف:** `server/routes/auth.mjs` (الأسطر 37-40, 50-58)
**المشكلة:** رسائل خطأ مختلفة تُتيح تخمين المستخدمين
**الإصلاح:** رسالة موحدة "بيانات الدخول غير صحيحة"

### 3.3 إضافة CORS
**الملف:** `server/index.js`
**الإصلاح:** إضافة middleware للـ CORS

### 3.4 إصلاح حجم الطلب
**الملف:** `server/index.js` (السطر 42)
**المشكلة:** حد 20MB كبير جداً
**الإصلاح:** تغييره إلى 5MB

### 3.5 إضافة تأكيد للعمليات المدمرة
**الملف:** `server/routes/backup.mjs` (الأسطر 384-404)
**المشكلة:** `/api/clear` و `/api/clear-collections` بلا تأكيد
**الإصلاح:** طلب token تأكيد

---

## المرحلة 4: إصلاحات جودة الكود

### 4.1 إضافة ESLint + Prettier
**الملف:** `package.json`
**الإصلاح:** تثبيت وإعداد eslint + prettier

### 4.2 إصلاح الأنواع الناقصة
**الملف:** `src/types/`
**الإصلاح:** إضافة أنواع ناقصة (Task, CustomerOrder, etc.)

### 4.3 إصلاح الـ stubs
**الملفات:** `src/context/domains/*.ts`
**المشكلة:** دوال مثل `recordDepreciation`, `generatePayroll`, `manufactureRecipe` هي stubs
**الإصلاح:** تنفيذها بشكل صحيح

### 4.4 إصلاح خطأ TypeScript
**الملف:** `src/App.tsx` (السطر 373)
**المشكلة:** `toast.level === 'success'` عندما level optional
**الإصلاح:** `toast.level === 'success'`

### 4.5 إصلاح مصدر البيانات الخاطئ
**الملف:** `src/context/domains/settings.ts` (الأسطر 200, 228)
**المشكلة:** `getRawMaterialName` يبحث في `materialCategories` بدلاً من `rawMaterials`
**الإصلاح:** تغيير مصدر البحث

---

## المرحلة 5: البنية والتقسيم

### 5.1 تقسيم AppContext
**الملف:** `src/context/AppContext.tsx` (3700 سطر)
**الإصلاح:** تقسيم إلى:
- AuthContext
- InventoryContext
- ProcurementContext
- ProductionContext
- FinancialContext
- SettingsContext

### 5.2 إصلاح الاعتماديات الدائرية
**الملف:** `src/context/capsules/useInventoryCapsule.tsx`
**المشكلة:** اعتماديات دائرية بين الكبسولات
**الإصلاح:** إعادة ترتيب الاستدعاءات

### 5.3 إصلاح Zustand persistence
**الملف:** `src/context/domains/*.ts`
**المشكلة:** `Map` غير قابل للـ serialization
**الإصلاح:** استخدام plain objects بدلاً من Map

---

## المرحلة 6: الاختبارات وCI/CD

### 6.1 توحيد الاختبارات
**الملف:** `package.json`
**الإصلاح:** دمج vitest.config.ts و vitest.config.mjs

### 6.2 إضافة اختبارات المكونات
**الملف:** `src/components/`
**الإصلاح:** اختبارات للمكونات الحرجة

### 6.3 إضافة اختبارات المسارات
**الملف:** `server/routes/`
**الإصلاح:** اختبارات لـ auth, data, report, backup

### 6.4 إضافة CI/CD
**الملف:** `.github/workflows/ci.yml`
**الإصلاح:** build + test على كل push

---

## المرحلة 7: التوثيق

### 7.1 إضافة OpenAPI
**الملف:** `server/openapi.mjs`
**الإصلاح:** توثيق كل المسارات

### 7.2 إضافة دليل الاختبارات
**الملف:** `TESTING.md`
**الإصلاح:** دليل لكتابة الاختبارات

---

## ملاحظات التنفيذ

- كل إصلاح يجب أن يُختبر قبل الانتقال للتالي
- الأولوية للأمان ثم الاستقرار ثم الأداء ثم الجودة
- يمكن تنفيذ بعض الإصلاحات بالتوازي
- يجب إضافة اختبار لكل إصلاح
