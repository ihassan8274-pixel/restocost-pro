// server/schemas/collection-schemas.mjs — مخططات Zod للمجموعات الحرجة
// تُستدعى من POST /api/collections/:key قبل الدمج.
// الملاحظات:
// - المخططات جزئية: تغطي الحقول المالية + المعرّفات فقط.
// - لا نرفض الحقول الزائدة (passthrough) — الدمج يحتاجها.
// - `delta` في الحركات يسمح بالسالب (صادر/مرتجع).
//
// ⭐ عطل 2026-10-07: المخططات كُتبت على عقود متخيلة لا على بيانات الإنتاج
// الفعلية، فرُفضت دفعات كاملة بـ400 (18,331 حركة مخزون لا تمرّ أبداً:
// تاريخها ISO وليس YYYY-MM-DD، وثلاثة أنواع شائعة غائبة عن القائمة).
// القواعد الآن:
//   1. التاريخ بأي صيغة واقعية: YYYY-MM-DD · طابع ISO كامل · DD-MM-YYYY ·
//      سلسلة فارغة في الحقول الاختيارية (expiryDate قد تكون '').
//   2. الكميات كسورية (1.5 كجم) — ليست أعداداً صحيحة.
//   3. validateCollectionBody يصفّي السجل الفاسد ولا يرفض الدفعة كلها.

import { z } from 'zod';

// ===== أنواع مساعدة =====
const Id = z.string().min(1);
// YYYY-MM-DD · طابع ISO (2026-09-09T08:14:11.845Z) · DD-MM-YYYY (بيانات قديمة)
const DateStr = z.string().regex(/^(?:\d{4}-\d{2}-\d{2}(?:[T ].*)?|\d{2}-\d{2}-\d{4})$/);
const DateOpt = z.union([DateStr, z.literal('')]); // حقل اختياري قد يكون فارغاً
const Money = z.number().nonnegative();           // مبالغ لا تقبل السالب
const SignedMoney = z.number();                   // يقبل السالب (delta)
const PositiveQty = z.number().positive();        // كميات كسورية حقيقية (1.5 كجم)
const NonNegQty = z.number().nonnegative();

// ===== GRN — إشعارات استلام =====
export const GrnItemSchema = z.object({
  rawMaterialId: Id,
  quantityReceived: z.number().positive(),
  unitPrice: Money,
  // قد يغيب من العميل (lineTotal? في types/procurement.ts)
  lineTotal: Money.optional(),
  unit: z.string().optional(),
  batchNumber: z.string().optional(),
  // الفعلي في الإنتاج: '' أو طابع ISO — ليس YYYY-MM-DD وحده
  expiryDate: DateOpt.optional(),
  qualityPassed: z.boolean().optional(),
}).passthrough();

export const GrnSchema = z.object({
  grnNumber: Id,
  supplierId: Id,
  branchId: Id,
  date: DateStr,
  invoiceNumber: z.string().optional(),
  invoiceDate: DateOpt.optional(),
  totalAmount: Money,
  currencyCode: z.string().length(3).optional(),
  exchangeRate: z.number().positive().optional(),
  vatRate: Money.optional(),
  vatAmount: Money.optional(),
  vatInclusive: z.boolean().optional(),
  items: z.array(GrnItemSchema).min(1),
  notes: z.string().optional(),
}).passthrough();

// ===== Purchase Orders =====
export const PoItemSchema = z.object({
  rawMaterialId: Id,
  quantity: PositiveQty,
  unitPrice: Money,
  lineTotal: Money.optional(),
}).passthrough();

export const PurchaseOrderSchema = z.object({
  poNumber: Id,
  supplierId: Id,
  branchId: Id,
  orderDate: DateStr,
  expectedDate: DateStr,
  currencyCode: z.string().length(3).optional(),
  exchangeRate: z.number().positive().optional(),
  items: z.array(PoItemSchema).min(1),
  // عقد العميل الفعلي (types/procurement.ts): draft|submitted|approved|
  // partially_received|received|cancelled|rejected — الإنتاج يحتوي 'submitted'
  status: z.enum(['draft', 'sent', 'submitted', 'approved', 'partially_received', 'received', 'cancelled', 'rejected']).optional(),
  notes: z.string().optional(),
}).passthrough();

// ===== Inventory Movements — حركات مخزون (delta سالب/موجب) =====
export const InventoryMovementSchema = z.object({
  rawMaterialId: Id,
  delta: SignedMoney,
  // ⭐ الأنواع هنا يجب أن تغطي كل ما يرسله العميل وكل ما في الإنتاج، وإلا
  // سقطت الحركات عن دفتر المخزون (والآن تُصفّي per-record بدل رفض الدفعة).
  // أضيفت 2026-10-06: تسوية جرد · عكس تسوية جرد · خصم مبيعات · عكس خصم مبيعات
  //   · هدر · تصنيع · تراجع ترحيل استلام.
  // أضيفت 2026-10-07 بعد فحص قاعدة الإنتاج (18,331 حركة): بيع مجمعة (12,358!)
  //   · تعديل بيع مجمعة (2,227) · إلغاء تحويل (42) — أنواع من إصدارات أقدم
  //   لم تعد في مصدر العميل لكنها بيانات محفوظة تُدفع مع كل دفعة.
  // حارس src/business/movement-type-parity.test.ts يفحص الطرفين مقابل بعضهما.
  type: z.enum([
    'استقبال استلام',
    'تراجع ترحيل استلام',
    'إرجاع حذف بيع',
    'تراجع تعديل بيع',
    'تسوية',
    'تسوية جرد',
    'عكس تسوية جرد',
    'تحويل وارد',
    'تحويل صادر',
    'خصم مبيعات',
    'عكس خصم مبيعات',
    'هدر',
    'تصنيع',
    'بيع مجمعة',
    'تعديل بيع مجمعة',
    'إلغاء تحويل',
  ]),
  branchId: Id,
  ref: z.string().optional(),
  date: DateStr,
}).passthrough();

// ===== Physical Counts — جرد فيزيائي =====
export const PhysicalCountSchema = z.object({
  branchId: Id,
  date: DateStr,
  items: z.array(z.object({
    rawMaterialId: Id,
    countedQty: z.number().nonnegative(),
    theoreticalQty: z.number().nonnegative().optional(),
    unitCost: Money.optional(),
    varianceCost: z.number().optional(),
  })).min(1),
  notes: z.string().optional(),
}).passthrough();

// ===== Stock Transfers =====
export const TransferItemSchema = z.object({
  rawMaterialId: Id,
  quantity: PositiveQty,
  unit: z.string().optional(),
  batchNumber: z.string().optional(),
  expiryDate: DateOpt.optional(),
}).passthrough();

export const StockTransferSchema = z.object({
  fromBranchId: Id,
  toBranchId: Id,
  date: DateStr,
  items: z.array(TransferItemSchema).min(1),
  ref: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

// ===== Opening Balances =====
export const OpeningBalanceSchema = z.object({
  branchId: Id,
  date: DateStr,
  items: z.array(z.object({
    rawMaterialId: Id,
    quantity: NonNegQty,
    unitCost: Money,
    batchNumber: z.string().optional(),
    expiryDate: DateOpt.optional(),
  })).min(1),
}).passthrough();

// ===== Supplier Returns =====
export const SupplierReturnSchema = z.object({
  returnNumber: Id,
  supplierId: Id,
  branchId: Id,
  date: DateStr,
  grnId: Id,
  totalAmount: Money,
  currencyCode: z.string().length(3).optional(),
  exchangeRate: z.number().positive().optional(),
  vatRate: Money.optional(),
  vatAmount: Money.optional(),
  items: z.array(z.object({
    rawMaterialId: Id,
    quantityReturned: PositiveQty,
    unitPrice: Money,
    lineTotal: Money,
    reason: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
}).passthrough();

// ===== Employees (salary) =====
// ⭐ العقد الفعلي (src/types/labor.ts): code · name · role نص حر ('شيف تنفيذي')
//   · hourlyRate · monthlyBaseSalary. المخطط القديم اخترع: empCode · nameAr ·
//   hireDate · baseSalary وقائمة أدوار إنجليزية — بيانات الإنتاج كلها تفشل.
// الآن: كل الحقول اختيارية (المخطط يغطي المال والمعرّفات فقط كما في الترويسة)،
//   والحقول القديمة محفوظة كاختيارية لتوافق الأجهزة التي لم تُحدَّث.
export const EmployeeSchema = z.object({
  code: z.string().min(1).optional(),
  empCode: z.string().min(1).optional(),          // توافق: المخطط القديم
  name: z.string().min(1).optional(),
  nameAr: z.string().min(1).optional(),           // توافق: المخطط القديم
  nameEn: z.string().optional(),
  branchId: Id.optional(),
  role: z.string().min(1).optional(),             // نص حر — القيم العربية في الإنتاج
  hireDate: DateOpt.optional(),
  hourlyRate: Money.optional(),
  monthlyBaseSalary: Money.optional(),
  baseSalary: Money.optional(),                   // توافق: المخطط القديم (سالب يُرفض)
  allowances: Money.optional(),
  deductions: Money.optional(),
  status: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  bankAccount: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

// ===== Suppliers =====
// ⭐ العقد الفعلي (src/types/procurement.ts): name (وليس nameAr) · code ·
//   rating · paymentTermsDays. المخطط القديم اشترط nameAr فرُفضت الموردون.
export const SupplierSchema = z.object({
  name: z.string().min(1).optional(),
  nameAr: z.string().min(1).optional(),           // توافق: المخطط القديم
  nameEn: z.string().optional(),
  code: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  rating: z.number().optional(),
  paymentTermsDays: z.number().nonnegative().optional(),
  address: z.string().optional(),
  taxNumber: z.string().optional(),
  paymentTerms: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  creditLimit: Money.optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
}).passthrough();

// ===== Branches =====
// الفرع 'test-branch-perm' بلا code — الحقل اختياري فعلاً في الإنتاج.
export const BranchSchema = z.object({
  code: Id.optional(),
  nameAr: z.string().min(1).optional(),
  nameEn: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  managerId: Id.optional(),
  isActive: z.boolean().optional(),
  timezone: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

// ===== خريطة المجموعة -> مخطط =====
export const COLLECTION_SCHEMAS = {
  rcerp_grn: z.array(GrnSchema),
  rcerp_purchase_orders: z.array(PurchaseOrderSchema),
  rcerp_inventory_movements: z.array(InventoryMovementSchema),
  rcerp_physical_counts: z.array(PhysicalCountSchema),
  rcerp_stock_transfers: z.array(StockTransferSchema),
  rcerp_opening_balances: z.array(OpeningBalanceSchema),
  rcerp_supplier_returns: z.array(SupplierReturnSchema),
  rcerp_employees: z.array(EmployeeSchema),
  rcerp_suppliers: z.array(SupplierSchema),
  rcerp_branches: z.array(BranchSchema),
};

// ===== دالة تحقق عامة =====
// ⭐ القرار الحرفي: "filter, never reject whole batch" — السجل الفاسد يُسقط
// وحده، والباقي يُدمج. الدفعة كلها تُرفض فقط إذا لم تكن مصفوفة أصلاً
// (خلل بنيوي في الطلب نفسه، لا في البيانات).
//   - success=false : بنيوية خاطئة (ليس مصفوفة) → 400 منطقي.
//   - dropped[]    : السجلات المستبعدة + أول أسباب رفضها — تُسجَّل في
//     savelog وتُعاد للعميل ليعرف ما لم يصل، لكن الدفعة تنجح.
export const validateCollectionBody = (key, body) => {
  const schema = COLLECTION_SCHEMAS[key];
  if (!schema) return { success: true, data: body, dropped: [] }; // لا مخطط = تمرير
  if (!Array.isArray(body)) {
    const result = schema.safeParse(body);
    return result.success
      ? { success: true, data: result.data, dropped: [] }
      : { success: false, error: result.error.flatten() };
  }
  const element = schema.element;
  const data = [];
  const dropped = [];
  body.forEach((record, index) => {
    const result = element.safeParse(record);
    if (result.success) {
      data.push(result.data);
    } else {
      const flat = result.error.flatten();
      dropped.push({
        index,
        id: record && typeof record === 'object' ? record.id : undefined,
        fieldErrors: flat.fieldErrors,
        formErrors: flat.formErrors,
      });
    }
  });
  return { success: true, data, dropped };
};