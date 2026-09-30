# مخطط الإصلاح الشامل — RestoCost ERP Pro v2.0.0

**تاريخ:** 2026-09-30
**مدة التنفيذ:** 14 أسبوع
**الأولوية:** أمان → موثوقية → بنية → جودة

---

## الفهرس

1. [المرحلة 1: إيقاف النزيف الأمني (P0)](#المرحلة-1)
2. [المرحلة 2: حوكمة الأمان والموثوقية (P1)](#المرحلة-2)
3. [المرحلة 3: إعادة هيكلة AppContext (P2)](#المرحلة-3)
4. [المرحلة 4: إعادة هيكلة التقارير](#المرحلة-4)
5. [المرحلة 5: الجودة والاختبار والتوسعة](#المرحلة-5)
6. [مؤشرات النجاح](#مؤشرات-النجاح)

---

<a id="المرحلة-1"></a>
## المرحلة 1: إيقاف النزيف الأمني (P0) — 1-3 أيام

### 1.1 إزالة كلمة المرور الثابتة

**المشكلة:** `admin123` موجودة في `src/context/AppContext.tsx:3868`

**الإصلاح:**

```typescript
// src/context/AppContext.tsx — حذف السطر 3868
// ❌ حذف هذا السطر:
const ADMIN_PASSWORD = 'admin123';

// ✅ استبداله بتحقق من الخادم فقط:
const verifyAdmin = async (password: string) => {
  const res = await fetch('/api/auth/verify-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return res.ok;
};
```

**الملفات:**
- `src/context/AppContext.tsx` — حذف `ADMIN_PASSWORD`
- `src/context/AppContext.tsx` — إضافة `verifyAdmin` من الخادم

---

### 1.2 قفل المسارات المفتوحة

**المشكلة:** `/api/companies`, `/api/start-company`, `/api/instance` بدون مصادقة

**الإصلاح:**

```javascript
// server/routes/data.mjs — إضافة requireAuth
import { requireAuth, requireRole } from '../core.mjs';

// ❌ قبل:
router.post('/api/companies', async (req, res) => { ... });

// ✅ بعد:
router.post('/api/companies', requireAuth, requireRole('admin'), async (req, res) => { ... });
router.post('/api/start-company', requireAuth, requireRole('admin'), async (req, res) => { ... });
router.post('/api/instance', requireAuth, requireRole('admin'), async (req, res) => { ... });
```

**الملفات:**
- `server/routes/data.mjs` — إضافة `requireAuth` + `requireRole`
- `server/routes/start.mjs` — إن وجد

---

### 1.3 إصلاح استعادة النسخ الاحتياطية

**المشكلة:** `applySnapshot` تستبدل البيانات بالكامل بدلاً من الدمج

**الإصلاح:**

```javascript
// server/routes/backup.mjs — دمج آمن بدلاً من الاستبدال
// ❌ قبل:
router.post('/api/backups/:id/restore', async (req, res) => {
  const snapshot = await getBackup(req.params.id);
  await replaceAll(snapshot.data); // خطير!
  res.json({ ok: true });
});

// ✅ بعد:
router.post('/api/backups/:id/restore', requireAuth, requireRole('admin'), async (req, res) => {
  const snapshot = await getBackup(req.params.id);
  const result = await mergeSnapshot(snapshot.data); // دمج آمن
  res.json({ ok: true, merged: result.merged, conflicts: result.conflicts });
});

async function mergeSnapshot(data) {
  const merged = {};
  const conflicts = [];
  for (const [key, value] of Object.entries(data)) {
    const current = await getCollection(key);
    const result = mergeById(current, value); // دمج بـ ID
    if (result.conflicts.length > 0) {
      conflicts.push({ key, conflicts: result.conflicts });
    }
    await setCollection(key, result.merged);
    merged[key] = result.merged.length;
  }
  return { merged, conflicts };
}
```

**الملفات:**
- `server/routes/backup.mjs` — استبدال `replaceAll` بـ `mergeById`
- `server/mergeCore.mjs` — استخدام الدمج الموجود

---

### 1.4 نقل الأسرار إلى متغيرات البيئة

**المشكلة:** `JWT_SECRET`, `SESSION_SECRET` نصية في `.env`

**الإصلاح:**

```bash
# 1. توليد secrets جديدة
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. تحديث .env
JWT_SECRET=<new-random-64-char>
SESSION_SECRET=<new-random-64-char>
SECRETS_KEY=<new-random-32-char>

# 3. إضافة إلى .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo "login.json" >> .gitignore
echo "test-login.json" >> .gitignore
echo "tools/.srvcred.json" >> .gitignore
```

```javascript
// server/core.mjs — قراءة من process.env
// ❌ قبل:
const JWT_SECRET = 'c40g53GorwJJom4VlUmRyOL9UmN9r1MK4Huo1s6j/VuVNC+YOdmb7wgQHjC0OP/9';

// ✅ بعد:
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}
```

**الملفات:**
- `.env` — تحديث القيم
- `.gitignore` — إضافة الملفات الحساسة
- `server/core.mjs` — قراءة من `process.env`
- `server/index.js` — قراءة من `process.env`
- `server/secrets.mjs` — قراءة `SECRETS_KEY` من env

---

### 1.5 حذف الملفات الحساسة

```bash
# حذف الملفات من المستودع
git rm login.json
git rm test-login.json
git rm tools/.srvcred.json

# الالتزام
git commit -m "security: remove sensitive files from repository"
```

---

### 1.6 إضافة CSRF Protection

```javascript
// server/index.js
import csrf from 'csurf';

const csrfProtection = csrf({
  cookie: {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  }
});

app.use(csrfProtection);
app.use((req, res, next) => {
  res.cookie('XSRF-TOKEN', req.csrfToken(), {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });
  next();
});
```

---

### 1.7 إضافة Rate Limiting على AI Endpoints

```javascript
// server/routes/ai.mjs
import rateLimit from 'express-rate-limit';

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // دقيقة واحدة
  max: 10, // 10 طلبات كحد أقصى
  message: { ok: false, error: 'طلبات كثيرة — أعد المحاولة بعد دقيقة' }
});

router.use('/api/ai', aiLimiter);
```

---

### 1.8 معالجة نمو change_log

```javascript
// server/store.mjs — إضافة سقف للسجل
const CHANGE_LOG_MAX_ROWS = 50000;
const CHANGE_LOG_RETENTION_DAYS = 7;

async function pruneChangeLog() {
  const cutoff = Date.now() - (CHANGE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.execute({
    sql: 'DELETE FROM change_log WHERE ts < ?',
    args: [cutoff]
  });
}

// تشغيل كل ساعة
setInterval(pruneChangeLog, 60 * 60 * 1000);
```

---

### قائمة التحقق — المرحلة 1

- [ ] `admin123` محذوفة من كل الكود
- [ ] كل المسارات الحساسة تتطلب مصادقة
- [ ] استعادة النسخ تستخدم الدمج الآمن
- [ ] الأسرار في متغيرات البيئة
- [ ] الملفات الحساسة محذوفة من المستودع
- [ ] CSRF protection مفعّل
- [ ] Rate limiting على AI endpoints
- [ ] change_log له سقف واحتفاظ

---

<a id="المرحلة-2"></a>
## المرحلة 2: حوكمة الأمان والموثوقية (P1) — أسابيع 1-3

### 2.1 إغلاق الفترات على الخادم

**المشكلة:** الإغلاق فقط من الواجهة، لا يوجد تحقق من الخادم

**الإصلاح:**

```javascript
// server/periodLock.mjs — تعزيز
export async function enforcePeriodLock(key, period, collections) {
  const closed = await collections.get('rcerp_closed_periods') || [];
  if (closed.includes(`${key}:${period}`)) {
    throw new Error('الفترة مغلقة — لا يمكن التعديل');
  }
}

// server/routes/data.mjs — استخدامام
router.post('/api/collections/:key', requireAuth, async (req, res) => {
  try {
    await enforcePeriodLock(req.params.key, req.body.period, collections);
    // ... معالجة الحفظ
  } catch (err) {
    res.status(403).json({ ok: false, error: err.message });
  }
});
```

---

### 2.2 إصلاح Dev Proxy

**المشكلة:** `vite.config.ts` proxy يشير إلى `localhost:3001` لكن الخادم على `3033`

**الإصلاح:**

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:3033', // ✅ تصحيح المنفذ
        changeOrigin: true
      }
    }
  }
});
```

---

### 2.3 بوابة Sync البداية (?since=)

**المشكلة:** كل تحديث يكتب الكل (3.17MB)

**الإصلاح:**

```javascript
// server/routes/data.mjs — دعم ?since=
router.get('/api/sync/cdc', requireAuth, async (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const changes = await getChangesSince(since);
  res.json({ ok: true, changes, rev: await getRev() });
});

// src/context/syncEngine.ts — استخدام ?since=
export async function syncSince(lastRev: number) {
  const res = await fetch(`/api/sync/cdc?since=${lastRev}`);
  const { changes, rev } = await res.json();
  await applyChanges(changes);
  return rev;
}
```

---

### 2.4 الصلاحيات القائمة على الخادم

**المشكلة:** `AdminUser` يعتمد على كلمة مرور المتصفح

**الإصلاح:**

```javascript
// server/routes/auth.mjs — إرجاع الصلاحيات
router.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await getUser(req.userId);
  const permissions = await getRolePermissions(user.role);
  res.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email },
    role: user.role,
    permissions // ✅ إرجاع الصلاحيات من الخادم
  });
});

// src/context/AppContext.tsx — استخدام صلاحيات الخادم
const { permissions } = useApp();
const canEdit = permissions?.includes('inventory:edit') ?? false;
```

---

### 2.5 حوكمة الأمان (ZATCA)

```javascript
// src/utils/zatca.ts — التحقق من QR TLV
export function validateQR_TLV(qrData: string): boolean {
  try {
    const decoded = decodeBase64(qrData);
    // التحقق من بنية TLV
    if (decoded.length < 20) return false;
    // التحقق من الحقول الإلزامية
    const sellerName = extractTLV(decoded, 1);
    const vatNumber = extractTLV(decoded, 2);
    const timestamp = extractTLV(decoded, 3);
    const invoiceTotal = extractTLV(decoded, 4);
    const vatTotal = extractTLV(decoded, 5);
    return !!(sellerName && vatNumber && timestamp && invoiceTotal && vatTotal);
  } catch {
    return false;
  }
}
```

---

### 2.6 المراقبة والصيانة

```javascript
// server/routes/backup.mjs — فحص صحة
router.get('/api/admin/health', requireAuth, requireRole('admin'), async (req, res) => {
  const health = {
    database: await checkDatabase(),
    changeLog: await getChangeLogStats(),
    backups: await getBackupStats(),
    diskSpace: await getDiskSpace(),
    uptime: process.uptime()
  };
  res.json({ ok: true, health });
});
```

---

### قائمة التحقق — المرحلة 2

- [ ] إغلاق الفترات مفروض من الخادم
- [ ] dev proxy يعمل على المنفذ الصحيح
- [ ] المزامنة تستخدم ?since= بدلاً من الكتابة الكاملة
- [ ] الصلاحيات تُرجع من الخادم
- [ ] ZATCA QR TLV متحقق منه
- [ ] endpoint صحة موجود

---

<a id="المرحلة-3"></a>
## المرحلة 3: إعادة هيكلة AppContext (P2) — أسابيع 2-6

### 3.1 الوضع الحالي

| المؤشر | القيمة |
|--------|--------|
| الحجم | 3900 سطر |
| الأعضاء | 300+ |
| المستهلكون | 139 |
| useMemo | 0 |
| الاعتماديات الدائرية | موجودة |

### 3.2 الهدف

| المؤشر | الهدف |
|--------|-------|
| AppContext.tsx | ≤ 500 سطر |
| كل كبسولة | ≤ 300 سطر |
| useMemo | في كل مكان مناسب |
| الاعتماديات الدائرية | 0 |

### 3.3 هيكل الكبسولات الجديد

```
src/context/
├── AppContext.tsx           # طبقة تركيبة رفيعة (~400 سطر)
├── AuthContext.tsx          # المصادقة والجلسات
├── InventoryContext.tsx     # المخزون
├── SalesContext.tsx         # المبيعات
├── SettingsContext.tsx      # الإعدادات
├── SyncContext.tsx          # المزامنة
├── FinancialContext.tsx     # المالية
├── ProductionContext.tsx    # الإنتاج
├── HRContext.tsx            # الموارد البشرية
├── ProcurementContext.tsx   # المشتريات
├── CatalogContext.tsx       # الكتالوج
├── index.tsx                # يجمع كل الـ providers
└── domains/                 # Zustand stores (موجودة)
```

### 3.4 خطوة 0 — تحصين أولي

```typescript
// src/context/AppContext.tsx — إضافة useMemo مؤقتاً
// هذا مؤقت حتى يتم التقسيم الكامل
const value = useMemo(() => ({
  // ... كل الحالة
}), [/* dependencies */]);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
```

### 3.5 خطوة 1 — آليات الجمع الآلي

```typescript
// src/context/collectionHelpers.ts
export const COLLECTION_SETTERS = {
  inventory: 'setInventory',
  sales: 'setSales',
  purchases: 'setPurchases',
  // ... كل المجموعات
};

export function applyData(collections, key, data) {
  const setter = COLLECTION_SETTERS[key];
  if (!setter) return;
  collections[setter](data);
}

export function persistCollection(key, data) {
  localStorage.setItem(`rcerp_${key}`, JSON.stringify(data));
}
```

### 3.6 خطوة 2-5 — نقل كل وحدة تباعاً

#### 2.1 CatalogContext

```typescript
// src/context/CatalogContext.tsx
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface CatalogContextValue {
  items: Item[];
  categories: Category[];
  units: Unit[];
  setItems: (items: Item[]) => void;
  setCategories: (categories: Category[]) => void;
  setUnits: (units: Unit[]) => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const value = useMemo(() => ({
    items, categories, units,
    setItems, setCategories, setUnits
  }), [items, categories, units]);

  return (
    <CatalogContext.Provider value={value}>
      {children}
    </CatalogContext.Provider>
  );
}

export const useCatalog = () => {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider');
  return ctx;
};
```

#### 2.2 InventoryContext

```typescript
// src/context/InventoryContext.tsx
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface InventoryContextValue {
  materials: RawMaterial[];
  stock: StockLevel[];
  movements: StockMovement[];
  setMaterials: (materials: RawMaterial[]) => void;
  setStock: (stock: StockLevel[]) => void;
  setMovements: (movements: StockMovement[]) => void;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const value = useMemo(() => ({
    materials, stock, movements,
    setMaterials, setStock, setMovements
  }), [materials, stock, movements]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export const useInventory = () => {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
};
```

#### 2.3 SalesContext

```typescript
// src/context/SalesContext.tsx
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface SalesContextValue {
  invoices: Invoice[];
  payments: Payment[];
  orders: Order[];
  setInvoices: (invoices: Invoice[]) => void;
  setPayments: (payments: Payment[]) => void;
  setOrders: (orders: Order[]) => void;
}

const SalesContext = createContext<SalesContextValue | null>(null);

export function SalesProvider({ children }: { children: ReactNode }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const value = useMemo(() => ({
    invoices, payments, orders,
    setInvoices, setPayments, setOrders
  }), [invoices, payments, orders]);

  return (
    <SalesContext.Provider value={value}>
      {children}
    </SalesContext.Provider>
  );
}

export const useSales = () => {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used within SalesProvider');
  return ctx;
};
```

#### 2.4 FinancialContext

```typescript
// src/context/FinancialContext.tsx
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface FinancialContextValue {
  accounts: Account[];
  journalEntries: JournalEntry[];
  expenses: Expense[];
  setAccounts: (accounts: Account[]) => void;
  setJournalEntries: (entries: JournalEntry[]) => void;
  setExpenses: (expenses: Expense[]) => void;
}

const FinancialContext = createContext<FinancialContextValue | null>(null);

export function FinancialProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const value = useMemo(() => ({
    accounts, journalEntries, expenses,
    setAccounts, setJournalEntries, setExpenses
  }), [accounts, journalEntries, expenses]);

  return (
    <FinancialContext.Provider value={value}>
      {children}
    </FinancialContext.Provider>
  );
}

export const useFinancial = () => {
  const ctx = useContext(FinancialContext);
  if (!ctx) throw new Error('useFinancial must be used within FinancialProvider');
  return ctx;
};
```

#### 2.5 HRContext

```typescript
// src/context/HRContext.tsx
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface HRContextValue {
  employees: Employee[];
  attendance: AttendanceRecord[];
  payrolls: PayrollRun[];
  setEmployees: (employees: Employee[]) => void;
  setAttendance: (attendance: AttendanceRecord[]) => void;
  setPayrolls: (payrolls: PayrollRun[]) => void;
}

const HRContext = createContext<HRContextValue | null>(null);

export function HRProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRun[]>([]);

  const value = useMemo(() => ({
    employees, attendance, payrolls,
    setEmployees, setAttendance, setPayrolls
  }), [employees, attendance, payrolls]);

  return (
    <HRContext.Provider value={value}>
      {children}
    </HRContext.Provider>
  );
}

export const useHR = () => {
  const ctx = useContext(HRContext);
  if (!ctx) throw new Error('useHR must be used within HRProvider');
  return ctx;
};
```

#### 2.6 ProductionContext

```typescript
// src/context/ProductionContext.tsx
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface ProductionContextValue {
  recipes: Recipe[];
  productionRuns: ProductionRun[];
  setRecipes: (recipes: Recipe[]) => void;
  setProductionRuns: (runs: ProductionRun[]) => void;
}

const ProductionContext = createContext<ProductionContextValue | null>(null);

export function ProductionProvider({ children }: { children: ReactNode }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);

  const value = useMemo(() => ({
    recipes, productionRuns,
    setRecipes, setProductionRuns
  }), [recipes, productionRuns]);

  return (
    <ProductionContext.Provider value={value}>
      {children}
    </ProductionContext.Provider>
  );
}

export const useProduction = () => {
  const ctx = useContext(ProductionContext);
  if (!ctx) throw new Error('useProduction must be used within ProductionProvider');
  return ctx;
};
```

#### 2.7 ProcurementContext

```typescript
// src/context/ProcurementContext.tsx
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface ProcurementContextValue {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  setSuppliers: (suppliers: Supplier[]) => void;
  setPurchaseOrders: (orders: PurchaseOrder[]) => void;
  setGoodsReceipts: (receipts: GoodsReceipt[]) => void;
}

const ProcurementContext = createContext<ProcurementContextValue | null>(null);

export function ProcurementProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);

  const value = useMemo(() => ({
    suppliers, purchaseOrders, goodsReceipts,
    setSuppliers, setPurchaseOrders, setGoodsReceipts
  }), [suppliers, purchaseOrders, goodsReceipts]);

  return (
    <ProcurementContext.Provider value={value}>
      {children}
    </ProcurementContext.Provider>
  );
}

export const useProcurement = () => {
  const ctx = useContext(ProcurementContext);
  if (!ctx) throw new Error('useProcurement must be used within ProcurementProvider');
  return ctx;
};
```

### 3.7 خطوة 6 — إعادة كتابة AppContext

```typescript
// src/context/AppContext.tsx — طبقة تركيبة رفيعة
import { createContext, useContext, useMemo, ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { CatalogProvider, useCatalog } from './CatalogContext';
import { InventoryProvider, useInventory } from './InventoryContext';
import { SalesProvider, useSales } from './SalesContext';
import { FinancialProvider, useFinancial } from './FinancialContext';
import { HRProvider, useHR } from './HRContext';
import { ProductionProvider, useProduction } from './ProductionContext';
import { ProcurementProvider, useProcurement } from './ProcurementContext';
import { SettingsProvider, useSettings } from './SettingsContext';
import { SyncProvider, useSync } from './SyncContext';

interface AppContextValue {
  auth: ReturnType<typeof useAuth>;
  catalog: ReturnType<typeof useCatalog>;
  inventory: ReturnType<typeof useInventory>;
  sales: ReturnType<typeof useSales>;
  financial: ReturnType<typeof useFinancial>;
  hr: ReturnType<typeof useHR>;
  production: ReturnType<typeof useProduction>;
  procurement: ReturnType<typeof useProcurement>;
  settings: ReturnType<typeof useSettings>;
  sync: ReturnType<typeof useSync>;
}

const AppContext = createContext<AppContextValue | null>(null);

function AppContent({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const catalog = useCatalog();
  const inventory = useInventory();
  const sales = useSales();
  const financial = useFinancial();
  const hr = useHR();
  const production = useProduction();
  const procurement = useProcurement();
  const settings = useSettings();
  const sync = useSync();

  const value = useMemo(() => ({
    auth, catalog, inventory, sales,
    financial, hr, production, procurement,
    settings, sync
  }), [auth, catalog, inventory, sales, financial, hr, production, procurement, settings, sync]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <SyncProvider>
          <CatalogProvider>
            <InventoryProvider>
              <SalesProvider>
                <FinancialProvider>
                  <HRProvider>
                    <ProductionProvider>
                      <ProcurementProvider>
                        <AppContent>{children}</AppContent>
                      </ProcurementProvider>
                    </ProductionProvider>
                  </HRProvider>
                </FinancialProvider>
              </SalesProvider>
            </InventoryProvider>
          </CatalogProvider>
        </SyncProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
```

### 3.8 خطوة 7 — تحديث المستهلكين

```typescript
// مثال: تحديث مكون يستخدم useApp
// ❌ قبل:
const { inventory, sales, financial } = useApp();

// ✅ بعد:
const { materials, stock } = useInventory();
const { invoices, payments } = useSales();
const { accounts, journalEntries } = useFinancial();
```

---

### قائمة التحقق — المرحلة 3

- [ ] AppContext.tsx ≤ 500 سطر
- [ ] كل كبسولة ≤ 300 سطر
- [ ] useMemo في كل مكان مناسب
- [ ] لا اعتماديات دائرية
- [ ] كل الـ 139 مستهلك محدّث

---

<a id="المرحلة-4"></a>
## المرحلة 4: إعادة هيكلة التقارير — أسابيع 5-8

### 4.1 الوضع الحالي

| المؤشر | القيمة |
|--------|--------|
| التقارير المنفصلة | 24+ |
| التقارير الحرجة | PLReport, CostReport, InventoryReport, ProcurementReport, OperationsReport, ExecutiveReport, HRReport, Dashboard |
| التكرار | عالي في أدوات التصدير |
| الاتساق | غير متسق بين التقارير |

### 4.2 هيكل التقارير الجديد

```
src/components/reports/
├── _core/                    # المحرك الموحد
│   ├── ReportEngine.tsx      # محرك التقارير
│   ├── ReportTypes.ts        # أنواع التقارير
│   ├── ReportTemplate.tsx    # قالب موحد
│   ├── ReportFilters.tsx     # فلاتر مشتركة
│   ├── ReportTable.tsx       # جدول موحد
│   ├── ReportSummaryCards.tsx# بطاقات ملخصة
│   └── ReportToolbar.tsx     # شريط أدوات
├── categories/               # التقارير المصنفة
│   ├── financial/            # تقارير مالية
│   ├── inventory/            # تقارير مخزون
│   ├── sales/                # تقارير مبيعات
│   ├── hr/                   # تقارير موارد بشرية
│   └── operations/           # تقارير عمليات
├── components/               # مكونات مشتركة
│   ├── ExportButtons.tsx     # أزرار تصدير
│   ├── DateRangePicker.tsx   # اختيار نطاق تاريخ
│   ├── PrintView.tsx         # عرض الطباعة
│   └── ChartWrapper.tsx      # غلاف الرسوم البيانية
└── utilities/                # أدوات مساعدة
    ├── financialMetrics.ts   # مقاييس مالية
    ├── salesMetrics.ts       # مقاييس مبيعات
    ├── inventoryMetrics.ts   # مقاييس مخزون
    └── exportHelpers.ts      # أدوات تصدير
```

### 4.3 المحرك الموحد

```typescript
// src/components/reports/_core/ReportEngine.tsx
import { ReportType, ReportData, ReportConfig } from './ReportTypes';

interface ReportEngineProps {
  type: ReportType;
  config: ReportConfig;
  data: ReportData;
}

export function ReportEngine({ type, config, data }: ReportEngineProps) {
  const filteredData = applyFilters(data, config.filters);
  const aggregated = aggregateData(filteredData, config.groupBy);
  const metrics = calculateMetrics(aggregated, type);

  return (
    <ReportTemplate
      title={config.title}
      filters={<ReportFilters config={config} />}
      summary={<ReportSummaryCards metrics={metrics} />}
      table={<ReportTable data={aggregated} columns={config.columns} />}
      toolbar={<ReportToolbar onExport={config.onExport} />}
    />
  );
}
```

### 4.4 مثال: تقرير موحد

```typescript
// src/components/reports/categories/financial/ProfitLossReport.tsx
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportType } from '../../_core/ReportTypes';
import { useFinancial } from '../../../../context/FinancialContext';

export function ProfitLossReport() {
  const { accounts, journalEntries } = useFinancial();

  const data = {
    accounts,
    entries: journalEntries,
    period: { start: '2026-01-01', end: '2026-12-31' }
  };

  const config = {
    title: 'قائمة الدخل',
    type: ReportType.PROFIT_LOSS,
    filters: ['dateRange', 'branch'],
    groupBy: 'account',
    columns: ['account', 'debit', 'credit', 'balance'],
    onExport: ['pdf', 'excel']
  };

  return <ReportEngine type={ReportType.PROFIT_LOSS} config={config} data={data} />;
}
```

---

### قائمة التحقق — المرحلة 4

- [ ] ReportEngine موحد يعمل
- [ ] كل التقارير الـ 24+ مهاجرة
- [ ] فلاتر مشتركة بين كل التقارير
- [ ] تصدير موحد (PDF + Excel)
- [ ] اتساق في واجهة التقارير

---

<a id="المرحلة-5"></a>
## المرحلة 5: الجودة والاختبار والتوسعة — أسابيع 9-14

### 5.1 اختبارات الوحدة

```typescript
// src/context/__tests__/InventoryContext.test.tsx
import { renderHook, act } from '@testing-library/react';
import { InventoryProvider, useInventory } from '../InventoryContext';

describe('InventoryContext', () => {
  it('should add material', () => {
    const { result } = renderHook(() => useInventory(), {
      wrapper: InventoryProvider
    });

    act(() => {
      result.current.setMaterials([
        { id: '1', name: 'طماطم', unit: 'kg', quantity: 10 }
      ]);
    });

    expect(result.current.materials).toHaveLength(1);
    expect(result.current.materials[0].name).toBe('طماطم');
  });

  it('should update stock', () => {
    const { result } = renderHook(() => useInventory(), {
      wrapper: InventoryProvider
    });

    act(() => {
      result.current.setStock([
        { materialId: '1', quantity: 100 }
      ]);
    });

    expect(result.current.stock[0].quantity).toBe(100);
  });
});
```

### 5.2 اختبارات التكامل

```javascript
// server/test/integration/auth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';

test('full auth flow: register → login → access → logout', async () => {
  // 1. Register
  const registerRes = await fetch('http://localhost:3033/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'Test1234!'
    })
  });
  assert.equal(registerRes.status, 200);

  // 2. Login
  const loginRes = await fetch('http://localhost:3033/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'Test1234!'
    })
  });
  const { token } = await loginRes.json();
  assert.ok(token);

  // 3. Access protected
  const meRes = await fetch('http://localhost:3033/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(meRes.status, 200);

  // 4. Logout
  const logoutRes = await fetch('http://localhost:3033/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(logoutRes.status, 200);

  // 5. Verify token invalid
  const invalidRes = await fetch('http://localhost:3033/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(invalidRes.status, 401);
});
```

### 5.3 اختبارات E2E

```typescript
// e2e/pos.spec.ts
import { test, expect } from '@playwright/test';

test('complete sale flow', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'admin@restocost.com');
  await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD!);
  await page.click('button[type="submit"]');

  await page.goto('/pos');
  await page.click('[data-testid="product-1"]');
  await page.click('[data-testid="product-2"]');
  await page.click('[data-testid="checkout"]');
  await page.click('[data-testid="pay-cash"]');

  await expect(page.getByText('تم البيع بنجاح')).toBeVisible();
});
```

### 5.4 تحسين الأداء

```typescript
// src/context/InventoryContext.tsx — تحسين الأداء
import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);

  // ✅ useCallback لمنع إعادة الإنشاء
  const addMaterial = useCallback((material: RawMaterial) => {
    setMaterials(prev => [...prev, material]);
  }, []);

  const updateStock = useCallback((materialId: string, quantity: number) => {
    setStock(prev => prev.map(s =>
      s.materialId === materialId ? { ...s, quantity } : s
    ));
  }, []);

  // ✅ useMemo للقيمة
  const value = useMemo(() => ({
    materials, stock,
    setMaterials, setStock,
    addMaterial, updateStock
  }), [materials, stock, addMaterial, updateStock]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}
```

### 5.5 التوسعة: إضافات جديدة

```typescript
// src/components/dashboard/KPIWidget.tsx
interface KPIWidgetProps {
  title: string;
  value: number;
  change: number;
  icon: ReactNode;
}

export function KPIWidget({ title, value, change, icon }: KPIWidgetProps) {
  const isPositive = change >= 0;
  return (
    <div className="kpi-widget">
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-content">
        <h3>{title}</h3>
        <p className="kpi-value">{value.toLocaleString('ar-SA')}</p>
        <p className={`kpi-change ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? '+' : ''}{change}%
        </p>
      </div>
    </div>
  );
}
```

---

### قائمة التحقق — المرحلة 5

- [ ] تغطية اختبارات ≥ 80%
- [ ] اختبارات وحدة لكل كبسولة
- [ ] اختبارات تكامل للتدفقات الحرجة
- [ ] اختبارات E2E للمسارات الرئيسية
- [ ] تحسين الأداء (useMemo + useCallback)
- [ ] إضافات جديدة (KPI, Alerts)

---

<a id="مؤشرات-النجاح"></a>
## مؤشرات النجاح (KPI)

| المؤشر | الوضع الحالي | الهدف | طريقة القياس |
|--------|-------------|-------|-------------|
| حجم AppContext | 3900 سطر | ≤ 500 سطر | `wc -l src/context/AppContext.tsx` |
| حجم الكبسولات | — | ≤ 300 سطر | `wc -l src/context/*Context.tsx` |
| المستهلكون | 139 | محدّثون | `grep -r "useApp()" src/` |
| تغطية الاختبارات | ~15% | ≥ 80% | `vitest --coverage` |
| الأمان | 6 ثغرات حرجة | 0 | فحص يدوي + آلي |
| الأداء | 3.17MB لكل تحديث | ≤ 100KB | Network tab |
| حجم التخزين | غير محدود | ≤ 10MB | `du -sh dist/` |
| التقارير الموحدة | 24+ منفصلة | 1 محرك موحد | فحص الكود |
| Accessibility | 0% | WCAG 2.1 AA | Lighthouse |
| i18n | ~10% | 100% | فحص النصوص |

---

## الجدول الزمني الإجمالي

```
الأسبوع 1:  المرحلة 1 (P0) — إيقاف النزيف الأمني
الأسبوع 2-3: المرحلة 2 (P1) — حوكمة الأمان والموثوقية
الأسبوع 4-6: المرحلة 3 (P2) — إعادة هيكلة AppContext
الأسبوع 7-8: المرحلة 4 — إعادة هيكلة التقارير
الأسبوع 9-12: المرحلة 5 — الجودة والاختبار
الأسبوع 13-14: مراجعة شاملة وتنظيف
```

---

## الموارد المطلوبة

| الدور | العدد | المدة |
|-------|-------|-------|
| مطور أساسي | 1-2 | 8-12 أسبوع |
| مراجع أكواد | 1 | كامل المشروع |
| مهندس جودة | 1 | أسابيع 9-14 |

---

## المخاطر والتخفيف

| الخطر | الاحتمال | التخفيف |
|-------|----------|---------|
| كسر الوظائف أثناء إعادة الهيكلة | عالي | اختبارات شاملة + تدريجي |
| تجاوز الجدول الزمني | متوسط | أولوية P0/P1 أولاً |
| فقدان البيانات أثناء الترحيل | منخفض | نسخ احتياطي قبل كل خطوة |
| مقاومة التغيير من الفريق | منخفض | توثيق + تدريب |

---

## الخلاصة

بعد تنفيذ هذا المخطط:

- نظام آمن بالكامل (لا ثغرات حرجة)
- بنية معمارية نظيفة (AppContext ≤ 500 سطر)
- تقارير موحدة (محرك واحد بدلاً من 24+)
- تغطية اختبارات ≥ 80%
- أداء محسّن (10x أقل في حجم الكتابة)
- قابلية صيانة ممتازة (وحدات مستقلة)
