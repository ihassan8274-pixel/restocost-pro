// server/schemas/collection-schemas.mjs — مخططات Zod للمجموعات الحرجة
// تُستدعى من POST /api/collections/:key قبل الدمج.
// الملاحظات:
// - المخططات جزئية: تغطي الحقول المالية + المعرّفات فقط.
// - لا نرفض الحقول الزائدة (passthrough) — الدمج يحتاجها.
// - التواريخ بصيغة YYYY-MM-DD نصية — التحويل يتم في الواجهة.
// - `delta` في الحركات يسمح بالسالب (صادر/مرتجع).

import { z } from 'zod';

// ===== أنواع مساعدة =====
const Id = z.string().min(1);
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Money = z.number().nonnegative();           // مبالغ لا تقبل السالب
const SignedMoney = z.number();                   // يقبل السالب (delta)
const PositiveInt = z.number().int().positive();
const NonNegInt = z.number().int().nonnegative();

// ===== GRN — إشعارات استلام =====
export const GrnItemSchema = z.object({
  rawMaterialId: Id,
  quantityReceived: z.number().positive(),
  unitPrice: Money,
  lineTotal: Money,
  unit: z.string().optional(),
  batchNumber: z.string().optional(),
  expiryDate: DateStr.optional(),
  qualityPassed: z.boolean().optional(),
}).passthrough();

export const GrnSchema = z.object({
  grnNumber: Id,
  supplierId: Id,
  branchId: Id,
  date: DateStr,
  invoiceNumber: z.string().optional(),
  invoiceDate: DateStr.optional(),
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
  quantity: PositiveInt,
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
  status: z.enum(['draft', 'sent', 'approved', 'received', 'cancelled']).optional(),
  notes: z.string().optional(),
}).passthrough();

// ===== Inventory Movements — حركات مخزون (delta سالب/موجب) =====
export const InventoryMovementSchema = z.object({
  rawMaterialId: Id,
  delta: SignedMoney,
  type: z.enum(['استقبال استلام', 'إرجاع حذف بيع', 'تراجع تعديل بيع', 'تسوية', 'تحويل وارد', 'تحويل صادر']),
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
  quantity: PositiveInt,
  unit: z.string().optional(),
  batchNumber: z.string().optional(),
  expiryDate: DateStr.optional(),
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
    quantity: NonNegInt,
    unitCost: Money,
    batchNumber: z.string().optional(),
    expiryDate: DateStr.optional(),
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
    quantityReturned: PositiveInt,
    unitPrice: Money,
    lineTotal: Money,
    reason: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
}).passthrough();

// ===== Employees (salary) =====
export const EmployeeSchema = z.object({
  empCode: Id,
  nameAr: z.string().min(1),
  nameEn: z.string().optional(),
  branchId: Id,
  role: z.enum(['manager', 'chef', 'waiter', 'cashier', 'storekeeper', 'accountant', 'cleaner', 'driver', 'other']),
  hireDate: DateStr,
  baseSalary: Money,
  allowances: Money.optional(),
  deductions: Money.optional(),
  status: z.enum(['active', 'inactive', 'terminated']).optional(),
  bankAccount: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

// ===== Suppliers =====
export const SupplierSchema = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  taxNumber: z.string().optional(),
  paymentTerms: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  creditLimit: Money.optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
}).passthrough();

// ===== Branches =====
export const BranchSchema = z.object({
  code: Id,
  nameAr: z.string().min(1),
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
export const validateCollectionBody = (key, body) => {
  const schema = COLLECTION_SCHEMAS[key];
  if (!schema) return { success: true, data: body }; // لا مخطط = تمرير (للجموعات غير المغطاة)
  const result = schema.safeParse(body);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error.flatten() };
};