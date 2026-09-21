// ============================================================
// طبقة الوصول للبيانات (Data Sources)
// محولات موحدة من KV store إلى هياكل موحدة للتقارير
// ============================================================

import type { 
  ReportFilters, 
  PeriodRange, 
} from '../types';

// أنواع البيانات الخام من KV store
export interface RawBatchSale {
  id: string;
  branchId: string;
  branchName: string;
  date: string; // YYYY-MM-DD
  items: RawBatchSaleItem[];
  totalRevenue?: number;
  totalCost?: number;
}

export interface RawBatchSaleItem {
  recipeId: string;
  recipeNameAr: string;
  category: string;
  quantitySold: number;
  unitPrice: number;
  unitCost: number;
  lineTotalRevenue: number;
  lineTotalCost: number;
}

export interface RawGRN {
  id: string;
  grnNumber: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  branchName?: string;
  date: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  vatRate: number;
  vatAmount: number;
  vatInclusive: boolean;
  status: string;
  items: RawGRNItem[];
}

export interface RawGRNItem {
  rawMaterialId: string;
  quantityReceived: number;
  unitPrice: number;
  batchNumber?: string;
  expiryDate?: string;
  qualityPassed: boolean;
}

export interface RawInventory {
  id: string;
  branchId: string;
  rawMaterialId: string;
  quantity: number;
  lastUpdated: string;
}

export interface RawInventoryMovement {
  id: string;
  date: string; // ISO
  branchId: string;
  rawMaterialId: string;
  delta: number;
  type: string; // استلام/صرف/تحويل/جرد/هالك/تعديل
  ref: string;
}

export interface RawDailyCount {
  id: string;
  branchId: string;
  branchName?: string;
  date: string;
  countedBy: string;
  status: string;
  items: RawDailyCountItem[];
  totalConsumedValue?: number;
}

export interface RawDailyCountItem {
  rawMaterialId: string;
  itemName: string;
  unit: string;
  openingQty: number;
  purchasedQty: number;
  theoreticalQty: number;
  countedQty: number;
  consumedQty: number;
  unitCost: number;
  consumedValue: number;
}

export interface RawRecipe {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  portionSize: string;
  yieldPieces: number;
  prepTimeMins: number;
  directLaborCost: number;
  packagingCost: number;
  actualMenuPrice: number;
  isCentralKitchenPrep: boolean;
  isActive: boolean;
  targetMarginPercent: number;
  ingredients: RawRecipeIngredient[];
  subPrepIngredients: RawSubPrepIngredient[];
  totalCalculatedCost: number;
  suggestedPrice: number;
}

export interface RawRecipeIngredient {
  rawMaterialId: string;
  quantity: number;
  wastagePercent: number;
}

export interface RawSubPrepIngredient {
  recipeId: string;
  quantity: number;
}

export interface RawOperatingExpense {
  id: string;
  expenseNumber: string;
  branchId: string;
  category: string;
  description: string;
  amount: number;
  dueDate: string;
  paymentStatus: string;
  paymentMethod: string;
  recurrence: string;
  vendor: string;
  invoiceNumber: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface RawJournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  lines: RawJournalLine[];
  source: string;
  refNumber: string;
}

export interface RawJournalLine {
  accountId: string;
  debit: number;
  credit: number;
}

export interface RawAccount {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: string;
  parentId?: string;
  isActive: boolean;
}

export interface RawBranch {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: 'central_kitchen' | 'restaurant';
  city: string;
  region?: string;
  address: string;
  managerName: string;
  phone: string;
  isActive: boolean;
  companyId?: string;
}

export interface RawRawMaterial {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  unit: string;
  standardPrice: number;
  minStockLevel: number;
  maxStockLevel: number;
  yieldPercentage: number;
  supplierId: string;
  storageType: string;
  isActive: boolean;
  purchaseUnit: string;
  purchaseUnitConversion: number;
  purchaseUnitPrice: number;
}

export interface RawSupplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  rating: number;
  paymentTermsDays: number;
  categories: string[];
  notes: string;
  isActive: boolean;
}

export interface RawStockTransfer {
  id: string;
  transferNumber: string;
  fromBranchId: string;
  toBranchId: string;
  date: string;
  status: string;
  items: RawStockTransferItem[];
  requestedBy: string;
  approvedBy?: string;
}

export interface RawStockTransferItem {
  itemType: 'raw_material' | 'recipe';
  rawMaterialId?: string;
  recipeId?: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  purchaseUnit?: string;
  purchaseUnitQty?: number;
}

export interface RawDistribution {
  id: string;
  fromBranchId: string;
  fromBranchName: string;
  itemName: string;
  rawMaterialId: string;
  unit: string;
  purchaseUnit: string;
  conversion: number;
  unitCost: number;
  rows: RawDistributionRow[];
  date: string | null;
  status: string;
  createdAt: string;
}

export interface RawDistributionRow {
  toBranchId: string;
  toBranchName: string;
  qty: number;
  purchaseUnit: string;
  conversion: number;
  unit: string;
  inventoryQty: number;
  unitCost: number;
}

export interface RawAudit {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  timestamp: string;
  details: string;
}

export interface RawPurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  orderDate: string;
  expectedDate: string;
  status: string;
  items: RawPOItem[];
}

export interface RawPOItem {
  rawMaterialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface RawShift {
  id: string;
  branchId: string;
  employeeId: string;
  employeeName: string;
  hoursWorked: number;
  overtimeHours: number;
  totalShiftCost: number;
  ordersHandled: number;
  date: string;
}

export interface RawPayroll {
  id: string;
  month: string;
  status: string;
  lines: RawPayrollLine[];
}

export interface RawPayrollLine {
  employeeId: string;
  employeeName: string;
  branchId: string;
  baseSalary: number;
  workedDays: number;
}

// واجهة موحدة لمحول البيانات
export interface DataSourceAdapter<T> {
  key: string; // مفتاح KV
  load: (filters: ReportFilters) => Promise<T[]>;
  getAll: () => Promise<T[]>;
}

// مساعدات الفلترة المشتركة
export function filterByPeriod<T extends { date: string }>(items: T[], period: PeriodRange): T[] {
  const from = period.from;
  const to = period.to;
  return items.filter(item => item.date >= from && item.date <= to);
}

export function filterByBranch<T extends { branchId?: string }>(items: T[], branchIds?: string[]): T[] {
  if (!branchIds || branchIds.length === 0) return items;
  return items.filter(item => item.branchId && branchIds.includes(item.branchId));
}

export function filterByCompany<T extends { companyId?: string }>(items: T[], companyIds?: string[]): T[] {
  if (!companyIds || companyIds.length === 0) return items;
  return items.filter(item => item.companyId && companyIds.includes(item.companyId));
}

// دالة مساعدة لحساب الفترة من preset
export function resolvePeriod(preset: string, customFrom?: string, customTo?: string): PeriodRange {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const startOfWeek = (d: Date) => { const day = d.getDay(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day === 0 ? 6 : day - 1)); };
  const endOfWeek = (d: Date) => { const day = d.getDay(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (day === 0 ? 0 : 7 - day)); };
  const startOfQuarter = (d: Date) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  const endOfQuarter = (d: Date) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0);
  const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
  const endOfYear = (d: Date) => new Date(d.getFullYear(), 11, 31);
  
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  
  switch (preset) {
    case 'today': return { from: todayStr, to: todayStr, preset: 'today' };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y), preset: 'yesterday' };
    }
    case 'this-week': return { from: fmt(startOfWeek(today)), to: fmt(endOfWeek(today)), preset: 'this-week' };
    case 'last-week': {
      const lw = new Date(today); lw.setDate(lw.getDate() - 7);
      return { from: fmt(startOfWeek(lw)), to: fmt(endOfWeek(lw)), preset: 'last-week' };
    }
    case 'this-month': return { from: fmt(startOfMonth(today)), to: fmt(endOfMonth(today)), preset: 'this-month' };
    case 'last-month': {
      const lm = new Date(today); lm.setMonth(lm.getMonth() - 1);
      return { from: fmt(startOfMonth(lm)), to: fmt(endOfMonth(lm)), preset: 'last-month' };
    }
    case 'this-quarter': return { from: fmt(startOfQuarter(today)), to: fmt(endOfQuarter(today)), preset: 'this-quarter' };
    case 'last-quarter': {
      const lq = new Date(today); lq.setMonth(lq.getMonth() - 3);
      return { from: fmt(startOfQuarter(lq)), to: fmt(endOfQuarter(lq)), preset: 'last-quarter' };
    }
    case 'this-year': return { from: fmt(startOfYear(today)), to: fmt(endOfYear(today)), preset: 'this-year' };
    case 'last-year': {
      const ly = new Date(today); ly.setFullYear(ly.getFullYear() - 1);
      return { from: fmt(startOfYear(ly)), to: fmt(endOfYear(ly)), preset: 'last-year' };
    }
    case 'custom':
    default: return { from: customFrom || fmt(startOfMonth(today)), to: customTo || todayStr, preset: 'custom' };
  }
}

// حساب فترة المقارنة (PoP)
export function getComparePeriod(period: PeriodRange): PeriodRange | null {
  if (!period.preset || period.preset === 'custom') return null;
  
  const from = new Date(period.from);
  const to = new Date(period.to);
  const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  const compareFrom = new Date(from);
  compareFrom.setDate(compareFrom.getDate() - diffDays);
  const compareTo = new Date(to);
  compareTo.setDate(compareTo.getDate() - diffDays);
  
  return {
    from: compareFrom.toISOString().split('T')[0],
    to: compareTo.toISOString().split('T')[0],
  };
}