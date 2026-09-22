import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  User, UserRole, Permission, Branch, RawMaterial, Supplier, StandardRecipe, InventoryRecord,
  GoodsReceiptNote, WorkOrder, WastageLog, Employee, LaborShift, POSOrder, POSOrderItem, StockTransfer,
  PhysicalStockCount, BranchPLSummary, CustomCategory, FoodCostAlert, FoodMenu, BatchSalesRecord,
  OperatingExpense, ExpenseBudget, Customer, Reservation, PurchaseOrder, Invoice, AuditLogEntry,
  MaterialCategory, RecipeInventory, Account, JournalEntry, JournalLine, POSReturn, SystemNotification,
  FixedAsset, ScheduledReport, AutomationRule, ReportType, DailyInventoryCount, EmployeeMealRecord,
  ProductionRun, ProductionRunItem, OpeningBalanceRecord, OpeningBalanceItem, SupplierQuote, SupplierReturn,
  MonthlyInventoryPeriod, MonthlyInventoryItem, Currency, Company, DepartmentRequisition,
  StockTransferItem, SubPrepIngredient, DeliveryApp, DeliverySale, BranchStockLimit, StockLevels,
  AccessRole, InventoryMovementLog, CustomerOrder, CustomerOrderStatus, MenuPlan,
  AttendanceRecord, PayrollPeriod, PayrollLine, ButcherTest, MaterialCategoryDef,
  UnitOfMeasure, Distribution, PurchaseRequest, IntakeInboxEntry, RecipeCostHistoryEntry, Task,
  InventoryBatch, GoodsReceiptItem, TempLogEntry, HaccpInspection,
  CustomReport, EodClosure, SupplierQuoteVersion, MaterialBarcode,
} from '../types';
import { ROLE_PERMISSIONS } from '../types';
import { getNavItem } from '../navigation';
import {
  DEMO_CREDENTIALS, INITIAL_CATEGORIES, INITIAL_BRANCHES, INITIAL_SUPPLIERS, INITIAL_RAW_MATERIALS,
  INITIAL_RECIPES, INITIAL_INVENTORY, INITIAL_GRN_NOTES, INITIAL_PURCHASE_ORDERS, INITIAL_WORK_ORDERS,
  INITIAL_WASTAGE_LOGS, INITIAL_EMPLOYEES, INITIAL_LABOR_SHIFTS, INITIAL_POS_ORDERS, INITIAL_STOCK_TRANSFERS,
  INITIAL_PL_SUMMARIES, INITIAL_FOOD_MENUS, INITIAL_BATCH_SALES, INITIAL_OPERATING_EXPENSES,
  INITIAL_EXPENSE_BUDGETS, INITIAL_CUSTOMERS, INITIAL_RESERVATIONS, INITIAL_INVOICES,
  INITIAL_RECIPE_INVENTORY, INITIAL_ACCOUNTS, INITIAL_JOURNAL_ENTRIES, INITIAL_FIXED_ASSETS, INITIAL_SCHEDULED_REPORTS, INITIAL_AUTOMATION_RULES,
  INITIAL_CURRENCIES, INITIAL_COMPANIES, INITIAL_DELIVERY_APPS, DEFAULT_RECIPE_SECTIONS,
  INITIAL_UNITS,
} from '../mockData';
import { parseNum } from '../utils/excel';
import { normalizeAISettings, type AIModelConfig } from '../utils/ai';
import { buildPLSummaries, monthLabelFor } from '../utils/financials';
import { EMPLOYEE_ROLE_LABELS, VAT_RATE, netOfGross, fmtMoney } from '../utils/helpers';
import { vatSplit } from '../utils/vat';
import { averageUnitCostFromReceipts, movingWeightedAverage } from '../business/costs';
import { stockLevelsFor } from '../business/stock';
import { computeRecipeCosts, recipeUsesAnyMaterial } from '../business/recipes';
import { stockPerPurchase } from '../business/units';
import { buildPreliminaryPOs, lowestPrice30Days, lastSupplierIdFor } from '../business/purchaseRequests';
import { nextDocSequence } from '../business/docNumbers';
import type { NumeralSystem } from '../utils/helpers';
import { hashPassword, verifyPassword } from './appAuth';
import { useAISettings, type AISettings } from './useAISettings';
import { usePreferences } from './usePreferences';
import { useToasts, type ToastEntry } from './useToasts';
import { useSyncCore } from './useSyncCore';
import { useAuthCore } from './useAuthCore';
import { useTasks } from './useTasks';
import { useHaccp } from './useHaccp';
import { useCustomerOrders } from './useCustomerOrders';
import { useUnitsAndBarcodes } from './useUnitsAndBarcodes';
import { useInventoryCore } from './useInventoryCore';

const loadState = <T,>(_key: string, fallback: T): T => fallback;

const today = () => new Date().toISOString().split('T')[0];

export interface SystemCheckResult {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export interface DataHealthPart {
  label: string;
  pct: number;
  detail: string;
}

export interface DataHealthScore {
  score: number;
  grade: 'excellent' | 'good' | 'attention';
  parts: DataHealthPart[];
}

export interface SystemRebuildResult {
  fixes: string[];
  recalcs: string[];
  issues: string[];
}

// "واصل من حيث توقفت" — وثيقة حديثة العمل عليها تُعرض في اللوحة (آخر 8 بند 48)
export type RecentDoc = { id: string; type: string; title: string; tab: string; at: number };

interface AppContextType {
  // Auth
  booting: boolean; // true while initial server sync is in progress
  currentUser: User | null;
  mustChangePassword: boolean;
  setMustChangePassword: (v: boolean) => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  users: User[];
  login: (email: string, password: string, totpCode?: string) => Promise<{ ok: boolean; error?: string; totpRequired?: boolean }>;
  register: (name: string, email: string, password: string, role: UserRole, branchId: string) => Promise<{ ok: boolean; error?: string; pending?: boolean }>;
  logout: () => void;
  updateUser: (id: string, data: Partial<User>, opts?: { resetPassword?: string }) => Promise<{ ok: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ ok: boolean; error?: string }>;
  revokeSessions: (id: string) => Promise<{ ok: boolean; error?: string }>;
  totpSetup: () => Promise<{ ok: boolean; error?: string; secret?: string; otpauthUrl?: string; enabled?: boolean }>;
  totpEnable: (code: string) => Promise<{ ok: boolean; error?: string }>;
  totpDisable: (code: string) => Promise<{ ok: boolean; error?: string }>;
  // Permissions
  can: (permission: Permission) => boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  // Access scoping
  visibleBranchIds: string[]; // branches the current user can operate on
  // Data
  branches: Branch[];
  suppliers: Supplier[];
  rawMaterials: RawMaterial[];
  materialBarcodes: MaterialBarcode[];
  addMaterialBarcode: (b: Omit<MaterialBarcode, 'id'>) => void;
  updateMaterialBarcode: (id: string, b: Partial<MaterialBarcode>) => void;
  deleteMaterialBarcode: (id: string) => void;
  barcodesForMaterial: (rawMaterialId: string) => MaterialBarcode[];
  findByBarcode: (code: string) => MaterialBarcode | undefined;
  unitsOfMeasure: UnitOfMeasure[];
  addUnitOfMeasure: (u: Omit<UnitOfMeasure, 'id'>) => void;
  updateUnitOfMeasure: (id: string, u: Partial<UnitOfMeasure>) => void;
  deleteUnitOfMeasure: (id: string) => { ok: boolean; error?: string };
  recipes: StandardRecipe[];
  inventory: InventoryRecord[];
  inventoryBatches: InventoryBatch[];
  addInventoryBatches: (grnId: string, branchId: string, items: GoodsReceiptItem[]) => void;
  consumeInventoryBatch: (batchId: string, qty: number) => void;
  getFefoBatches: (branchId?: string, rawMaterialId?: string) => InventoryBatch[];
  expiringBatches: (days: number) => { expired: InventoryBatch[]; soon: InventoryBatch[] };
  grnNotes: GoodsReceiptNote[];
  purchaseOrders: PurchaseOrder[];
  purchaseRequests: PurchaseRequest[];
  workOrders: WorkOrder[];
  wastageLogs: WastageLog[];
  inventoryMovements: InventoryMovementLog[];
  closedDays: string[];
  closeDay: (date: string) => void;
  reopenDay: (date: string) => void;
  eodClosures: EodClosure[];
  tasks: Task[];
  addTask: (data: Omit<Task, 'id' | 'createdAt' | 'status' | 'assignedBy'>) => void;
  updateTask: (id: string, data: Partial<Task>) => void;
  completeTask: (id: string) => void;
  reopenTask: (id: string) => void;
  cancelTask: (id: string) => void;
  tempLogs: TempLogEntry[];
  addTempLog: (data: Omit<TempLogEntry, 'id' | 'recordedBy'>) => void;
  deleteTempLog: (id: string) => void;
  haccpInspections: HaccpInspection[];
  addHaccpInspection: (data: Omit<HaccpInspection, 'id' | 'createdAt'>) => void;
  customReports: CustomReport[];
  setCustomReports: (updater: (prev: CustomReport[]) => CustomReport[]) => void;
  deleteTask: (id: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  customerOrders: CustomerOrder[];
  addCustomerOrder: (o: Omit<CustomerOrder, 'id' | 'orderNumber' | 'createdAt' | 'status'>) => CustomerOrder;
  updateCustomerOrderStatus: (id: string, status: CustomerOrderStatus, paymentMethod?: string) => void;
  employees: Employee[];
  shifts: LaborShift[];
  posOrders: POSOrder[];
  stockTransfers: StockTransfer[];
  physicalCounts: PhysicalStockCount[];
  plSummaries: BranchPLSummary[];
  setPlSummaries: React.Dispatch<React.SetStateAction<BranchPLSummary[]>>;
  customCategories: CustomCategory[];
  foodMenus: FoodMenu[];
  menuPlans: MenuPlan[];
  batchSalesRecords: BatchSalesRecord[];
  operatingExpenses: OperatingExpense[];
  expenseBudgets: ExpenseBudget[];
  customers: Customer[];
  reservations: Reservation[];
  invoices: Invoice[];
  auditLogs: AuditLogEntry[];
  globalTargetMarginPercent: number;
  dataHealth: DataHealthScore;
  recentDocs: RecentDoc[];
  addRecentDoc: (doc: { type: string; title: string; tab: string }, id?: string) => void;
  clearRecentDocs: () => void;
  // Mutations
  addBranch: (b: Omit<Branch, 'id' | 'code'>) => void;
  updateBranch: (id: string, b: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;
  addSupplier: (s: Omit<Supplier, 'id' | 'code'>) => Supplier;
  updateSupplier: (id: string, s: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  addRawMaterial: (m: Omit<RawMaterial, 'id' | 'code'>) => void;
  updateRawMaterial: (id: string, m: Partial<RawMaterial>) => void;
  deleteRawMaterial: (id: string) => { ok: boolean; error?: string };
  importRawMaterials: (records: Record<string, unknown>[]) => { added: number; updated: number };
  importSuppliers: (records: Record<string, unknown>[]) => { added: number; updated: number };
  importCustomers: (records: Record<string, unknown>[]) => { added: number; updated: number };
  fixedAssets: FixedAsset[];
  scheduledReports: ScheduledReport[];
  automationRules: AutomationRule[];
  addFixedAsset: (a: Omit<FixedAsset, 'id' | 'code'>) => void;
  updateFixedAsset: (id: string, d: Partial<FixedAsset>) => void;
  deleteFixedAsset: (id: string) => void;
  recordDepreciation: (monthKey: string) => { ok: boolean; message: string };
  getMonthlyDepreciation: (a: FixedAsset) => number;
  addScheduledReport: (d: Omit<ScheduledReport, 'id'>) => void;
  setScheduledReport: (id: string, d: Partial<ScheduledReport>) => void;
  runScheduledReport: (id: string) => string;
  setAutomationRule: (id: string, enabled: boolean) => void;
  runAutomation: () => { ok: boolean; message: string };
  addRecipe: (r: Omit<StandardRecipe, 'id' | 'code' | 'totalCalculatedCost' | 'suggestedPrice'>) => void;
  updateRecipe: (id: string, r: Partial<StandardRecipe>) => void;
  deleteRecipe: (id: string) => void;
  recipeSections: Record<string, string[]>;
  updateRecipeSections: (category: string, sections: string[]) => void;
  addGoodsReceiptNote: (g: Omit<GoodsReceiptNote, 'id' | 'grnNumber'>) => void;
  updateGRNStatus: (id: string, status: GoodsReceiptNote['status']) => void;
  revertGoodsReceiptToDraft: (id: string) => number;
  updateGoodsReceiptNote: (id: string, g: Partial<GoodsReceiptNote>) => void;
  addPurchaseOrder: (p: Omit<PurchaseOrder, 'id' | 'poNumber'>) => void;
  updatePurchaseOrder: (id: string, p: Partial<PurchaseOrder>) => void;
  addPurchaseRequest: (r: Omit<PurchaseRequest, 'id' | 'requestNumber' | 'createdAt'>) => PurchaseRequest;
  updatePurchaseRequest: (id: string, r: Partial<PurchaseRequest>) => void;
  deletePurchaseRequest: (id: string) => void;
  convertRequestToPOs: (requestId: string) => { ok: boolean; count: number; poIds: string[]; error?: string };
  receivePurchaseOrder: (id: string) => void;
  recordPurchaseReceipt: (id: string, itemsReceived: { rawMaterialId: string; quantity: number }[]) => void;
  addSupplierQuote: (q: Omit<SupplierQuote, 'id'>) => void;
  updateSupplierQuote: (id: string, q: Partial<SupplierQuote>) => void;
  deleteSupplierQuote: (id: string) => void;
  getQuotePrice: (supplierId: string, rawMaterialId: string) => number | undefined;
  supplierQuotes: SupplierQuote[];
  addSupplierReturn: (r: Omit<SupplierReturn, 'id' | 'returnNumber'>) => void;
  updateSupplierReturn: (id: string, r: Partial<SupplierReturn>) => void;
  approveSupplierReturn: (id: string) => void;
  reprocessSupplierReturn: (id: string) => void;
  revertSupplierReturnToDraft: (id: string) => void;
  reprocessAllApprovedReturns: () => void;
  supplierReturns: SupplierReturn[];
  monthlyInventory: MonthlyInventoryPeriod[];
  closedMonths: string[];
  isMonthClosed: (monthKey: string) => boolean;
  startMonthlyInventory: (branchId: string, monthKey: string) => void;
  saveMonthlyInventoryCounts: (id: string, counted: Record<string, number>) => void;
  closeMonthlyInventory: (id: string) => void;
  deleteMonthlyInventory: (id: string) => void;
  reopenMonthlyInventory: (id: string) => void;
  rebuildPLSummaries: (monthKey?: string) => void;
  addWastageLog: (l: Omit<WastageLog, 'id' | 'date'>) => void;
  addWorkOrder: (o: Omit<WorkOrder, 'id' | 'orderNumber' | 'startDate' | 'status' | 'rawMaterialsDeducted'>) => void;
  updateWorkOrderStatus: (id: string, status: WorkOrder['status']) => void;
  addShift: (s: Omit<LaborShift, 'id' | 'date'>) => void;
  addEmployee: (e: Omit<Employee, 'id' | 'code'>) => void;
  updateEmployee: (id: string, e: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  customRoles: string[];
  attendance: AttendanceRecord[];
  addAttendance: (a: Omit<AttendanceRecord, 'id' | 'employeeName' | 'recordedBy'>) => void;
  updateAttendance: (id: string, a: Partial<AttendanceRecord>) => void;
  deleteAttendance: (id: string) => void;
  payrollPeriods: PayrollPeriod[];
  generatePayroll: (month: string) => { ok: boolean; error?: string };
  confirmPayroll: (id: string) => void;
  deletePayrollPeriod: (id: string) => void;
  // نموذج صلاحيات الشاشات المتقدم
  accessRoles: AccessRole[];
  upsertAccessRole: (role: AccessRole) => void;
  removeAccessRole: (id: string) => void;
  screenCan: (screenId: string, action?: 'view' | 'add' | 'edit' | 'delete') => boolean;
  syncNow: (key?: string) => Promise<boolean>;
  addRole: (role: string) => void;
  deleteRole: (role: string) => void;
  addPOSOrder: (o: Omit<POSOrder, 'id' | 'orderNumber' | 'vatAmount' | 'totalAmount' | 'totalCost' | 'subtotal' | 'date'> & { date?: string }) => { ok: boolean; autoSupplied: string[] };
  updatePOSOrder: (id: string, o: Partial<POSOrder>) => void;
  deletePOSOrder: (id: string) => void;
  addStockTransfer: (t: Omit<StockTransfer, 'id' | 'transferNumber' | 'date' | 'status'>) => void;
  updateStockTransfer: (id: string, data: Partial<StockTransfer>) => void;
  submitStockTransfer: (id: string) => void;
  approveStockTransfer: (id: string) => void;
  rejectStockTransfer: (id: string, reason: string) => void;
  revertStockTransferToDraft: (id: string) => void;
  deleteStockTransfer: (id: string) => void;
  adjustInventory: (branchId: string, rawMaterialId: string, delta: number, batchInfo?: { batchNumber?: string; expiryDate?: string }, reason?: { type: string; ref?: string }) => void;
  distributions: Distribution[];
  approveDistribution: (id: string) => void;
  rejectDistribution: (id: string) => void;
  updateDistribution: (id: string, data: Partial<Distribution>) => void;
  intakeInbox: IntakeInboxEntry[];
  raiseInboxItem: (id: string) => void;
  rejectInboxItem: (id: string) => void;
  raiseAllMatchedInbox: () => Promise<number>;
  bindAndRaiseInboxItem: (id: string, body: { itemId?: string; fromId?: string; targets?: { index: number; toBranchId: string }[] }) => Promise<{ ok: boolean; distId?: string; transferNumbers?: string[]; learned?: number } | undefined>;
  dailyCounts: DailyInventoryCount[];
  addDailyCount: (c: Omit<DailyInventoryCount, 'id'>) => void;
  updateDailyCount: (id: string, c: Partial<Omit<DailyInventoryCount, 'id'>>) => void;
  deleteDailyCount: (id: string) => void;
  employeeMeals: EmployeeMealRecord[];
  addEmployeeMeal: (m: Omit<EmployeeMealRecord, 'id'>) => void;
  deleteEmployeeMeal: (id: string) => void;
  productionRuns: ProductionRun[];
  manufactureRecipe: (data: { branchId: string; recipeId: string; batchSize: number; producedBy: string }) => { ok: boolean; error?: string };
  deleteProductionRun: (id: string) => void;
  adjustRecipeInventory: (branchId: string, recipeId: string, delta: number) => void;
  getRecipeStock: (branchId: string, recipeId: string) => number;
  recipeInventory: RecipeInventory[];
  setOpeningBalances: (branchId: string, quantities: Record<string, number>) => void;
  openingBalances: OpeningBalanceRecord[];
  addOpeningBalance: (r: Omit<OpeningBalanceRecord, 'id'>) => void;
  updateOpeningBalance: (id: string, r: Partial<OpeningBalanceRecord>) => void;
  deleteOpeningBalance: (id: string) => void;
  accounts: Account[];
  journalEntries: JournalEntry[];
  addAccount: (a: Omit<Account, 'id'>) => void;
  addJournalEntry: (e: { date: string; description: string; lines: JournalLine[] }) => { ok: boolean; error?: string };
  posReturns: POSReturn[];
  addPOSReturn: (orderId: string, items: { recipeId: string; quantity: number }[], reason: string) => { ok: boolean; error?: string };
  getNotifications: () => SystemNotification[];
  toast: ToastEntry | null;
  showToast: (message: string, opts?: Partial<Omit<ToastEntry, 'message'>>) => void;
  verifyAdminPassword: (password: string) => Promise<boolean>;
  ADMIN_PASSWORD: string;
  recordPhysicalCount: (c: Omit<PhysicalStockCount, 'id' | 'date'>) => void;
  addOperatingExpense: (e: Omit<OperatingExpense, 'id' | 'expenseNumber' | 'createdAt'>) => void;
  updateOperatingExpense: (id: string, e: Partial<OperatingExpense>) => void;
  deleteOperatingExpense: (id: string) => void;
  setExpenseBudget: (branchId: string, month: string, items: ExpenseBudget['items']) => void;
  addCustomer: (c: Omit<Customer, 'id' | 'code'>) => void;
  updateCustomer: (id: string, c: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  butcherTests: ButcherTest[];
  addButcherTest: (t: Omit<ButcherTest, 'id'>) => void;
  updateButcherTest: (id: string, t: Partial<ButcherTest>) => void;
  deleteButcherTest: (id: string) => void;
  postButcherTest: (id: string) => { ok: boolean; error?: string };
  materialCategories: MaterialCategoryDef[];
  addMaterialCategory: (d: Omit<MaterialCategoryDef, 'id' | 'createdAt'>) => void;
  updateMaterialCategory: (id: string, d: Partial<MaterialCategoryDef>) => void;
  deleteMaterialCategory: (id: string) => void;
  addReservation: (r: Omit<Reservation, 'id' | 'reservationNumber' | 'createdAt'>) => void;
  updateReservationStatus: (id: string, status: Reservation['status']) => void;
  deleteReservation: (id: string) => void;
  addInvoice: (i: Omit<Invoice, 'id' | 'invoiceNumber'>) => void;
  updateInvoice: (id: string, i: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  recordInvoicePayment: (id: string, amount: number) => void;
  addFoodMenu: (m: Omit<FoodMenu, 'id' | 'code'>) => void;
  updateFoodMenu: (id: string, m: Partial<FoodMenu>) => void;
  deleteFoodMenu: (id: string) => void;
  addMenuPlan: (p: Omit<MenuPlan, 'id'>) => void;
  updateMenuPlan: (id: string, p: Partial<MenuPlan>) => void;
  deleteMenuPlan: (id: string) => void;
  addBatchSalesRecord: (r: Omit<BatchSalesRecord, 'id' | 'batchNumber' | 'createdAt'>) => void;
  updateBatchSalesRecord: (id: string, data: Partial<BatchSalesRecord>) => void;
  deleteBatchSalesRecord: (id: string) => void;
  addCategory: (c: Omit<CustomCategory, 'id'>) => void;
  deleteCategory: (id: string) => void;
  // Multi-currency
  currencies: Currency[];
  addCurrency: (c: Omit<Currency, 'code'> & { code: string }) => void;
  updateCurrency: (code: string, d: Partial<Currency>) => void;
  deleteCurrency: (code: string) => void;
  getCurrencyRate: (code: string) => number;
  convertToBase: (amount: number, code: string) => number;
  // Companies
  companies: Company[];
  addCompany: (c: Omit<Company, 'id' | 'code'>) => void;
  updateCompany: (id: string, c: Partial<Company>) => void;
  deleteCompany: (id: string) => void;
  getCompanyName: (id: string) => string;
  // Department requisitions
  requisitions: DepartmentRequisition[];
  addRequisition: (r: Omit<DepartmentRequisition, 'id' | 'reqNumber' | 'status' | 'totalQty'>) => void;
  submitRequisition: (id: string) => void;
  approveRequisition: (id: string) => void;
  rejectRequisition: (id: string, reason: string) => void;
  cancelRequisition: (id: string) => void;
  deleteRequisition: (id: string) => void;
  setGlobalTargetMarginPercent: (m: number) => void;
  vatPercent: number;
  setVatPercent: (v: number) => void;
  // Delivery apps
  deliveryApps: DeliveryApp[];
  addDeliveryApp: (a: Omit<DeliveryApp, 'id'>) => void;
  updateDeliveryApp: (id: string, a: Partial<DeliveryApp>) => void;
  deleteDeliveryApp: (id: string) => void;
  getDeliveryAppName: (id: string) => string;
  // مبيعات تطبيقات التوصيل المستوردة
  deliverySales: DeliverySale[];
  addDeliverySale: (s: Omit<DeliverySale, 'id'>) => void;
  updateDeliverySale: (id: string, s: Partial<DeliverySale>) => void;
  deleteDeliverySale: (id: string) => void;
  vatInclusive: boolean;
  setVatInclusive: (v: boolean) => void;
  deductSalesFromInventory: boolean;
  setDeductSalesFromInventory: (v: boolean) => void;
  updateRecipeTargetMargin: (recipeId: string, targetMarginPercent: number) => void;
  acknowledgeAlert: (recipeId: string) => void;
  unacknowledgeAlert: (recipeId: string) => void;
  getFoodCostAlerts: () => FoodCostAlert[];
  resetDemoData: () => void;
  clearSystemData: () => void;
  /** تفريغ محدد: حذف الجداول المختارة فقط (مفاتيح rcerp_*) */
  clearCollections: (keys: string[]) => void;
  // Offline / sync state
  offline: boolean;
  offlineSince: string;
  retryBootstrap: () => void;
  // مؤشر فشل الحفظ على الخادم (طابور إعادة المحاولة يعمل تلقائياً)
  saveFailed: boolean;
  // انتهت صلاحية جلسة الدخول — التغييرات محفوظة محلياً وتُرسل بعد إعادة الدخول
  authExpired: boolean;
  // عدد العمليات المعلّقة بانتظار المزامنة مع الخادم (شريط المزامنة)
  pendingSavesCount: number;
  // تفاصيل آخر إخفاق حفظ (المجموعة والسبب) للعرض في المؤشر
  saveErrorDetail: string;
  // System branding
  logo: string | null;
  setLogo: (value: string | null) => void;
  // AI settings — نماذج متعددة (لكل نموذج مفتاح/مزوّد مستقل) + نموذج نشط افتراضي
  aiSettings: AISettings;
  aiModels: AIModelConfig[];
  activeAIModelId: string;
  addAIModel: (cfg: Partial<AIModelConfig>) => string;
  updateAIModel: (cfg: Partial<AIModelConfig> & { id: string }) => void;
  deleteAIModel: (id: string) => void;
  setActiveAIModel: (id: string) => void;
  updateAISettings: (patch: Partial<AIModelConfig>) => void;
  // نظام الأرقام المعروضة (إنجليزية/عربية)
  numerals: NumeralSystem;
  setNumerals: (v: NumeralSystem) => void;
  decimals: number;
  setDecimals: (v: number) => void;
  // وضع الكثافة (مريح/مضغوط) — بند 18
  density: 'comfortable' | 'compact';
  setDensity: (v: 'comfortable' | 'compact') => void;
  // التقويم الهجري في كل التواريخ (خيار) — بند 37
  hijriMode: boolean;
  setHijriMode: (v: boolean) => void;
  // تفضيلات المستخدم المحفوظة — بند 19
  preferences: Record<string, unknown>;
  setPreference: (key: string, value: unknown) => void;
  // Helpers
  getBranchName: (id: string) => string;
  getRawMaterialName: (id: string) => string;
  getRawMaterialUnitCost: (id: string) => number;
  getAverageUnitCost: (id: string) => number;
  getBranchAverageUnitCost: (branchId: string, id: string, asOf?: string) => number;
  getLastPurchaseCost: (branchId: string, id: string) => number;
  getReturnedQtyForGrn: (grnId: string, rawMaterialId: string) => number;
  // Branch stock limits (حدود المخزون لكل فرع)
  branchStockLimits: BranchStockLimit[];
  getStockLevelsFor: (rawMaterialId: string, branchId: string) => StockLevels;
  upsertBranchStockLimit: (branchId: string, rawMaterialId: string, data: Partial<Omit<BranchStockLimit, 'id' | 'branchId' | 'rawMaterialId'>>) => void;
  removeBranchStockLimit: (branchId: string, rawMaterialId: string) => void;
  calculateRecipeCosts: (ingredients: StandardRecipe['ingredients'], labor: number, packaging: number, subPrep?: SubPrepIngredient[], yieldPieces?: number) => { foodCost: number; subPrepCost: number; totalCost: number; suggestedPrice: number; pieceCost: number };
  logAudit: (action: string, module: string, details?: string) => void;
  runSystemCheck: () => SystemCheckResult[];
  rebuildSystem: () => SystemRebuildResult;
}

const AppContext = createContext<AppContextType | undefined>(undefined);


export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ==== AI settings — نماذج متعددة (لكل نموذج إعداداته المستقلة) + نموذج نشط افتراضي ====
  const { aiSettings, setAISettings, aiModels, activeAIModelId, addAIModel, updateAIModel, deleteAIModel, setActiveAIModel, updateAISettings } = useAISettings();

  // ---- Auth state ----
  const [users, setUsers] = useState<User[]>(() => loadState<User[]>('rcerp_users', []));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const serverUsersLoadedRef = useRef(false);
  const [booting, setBooting] = useState(true);
  const [ready, setReady] = useState(false);
  // "واصل من حيث توقفت": آخر المستندات التي عمل عليها المستخدم (محلي لجهاز هذا المستخدم)
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>(() => {
    try { return JSON.parse(localStorage.getItem('rcerp_recent_docs') || '[]'); } catch { return [] as RecentDoc[]; }
  });
  useEffect(() => {
    try { localStorage.setItem('rcerp_recent_docs', JSON.stringify(recentDocs.slice(0, 8))); } catch { /* ignore */ }
  }, [recentDocs]);
  const addRecentDoc = (doc: { type: string; title: string; tab: string }, id?: string) => {
    setRecentDocs((prev) => [{ ...doc, id: id || `${doc.type}-${Date.now()}`, at: Date.now() }, ...prev.filter((d) => !(d.type === doc.type && d.id === (id || d.id)))].slice(0, 8));
  };
  const clearRecentDocs = () => setRecentDocs([]);
  const [offline, setOffline] = useState(false);
  const [offlineSince, setOfflineSince] = useState('');
  const [refresh, setRefresh] = useState(0);
  const retryBootstrap = () => setRefresh((n) => n + 1);

  // ==== تفضيلات لكل جهاز: المظهر، نظام الأرقام، العلامات العشرية، الكثافة، الهجري، العامة، الشعار ====
  const {
    theme, toggleTheme,
    numerals, setNumerals,
    decimals, setDecimals,
    density, setDensity,
    hijriMode: hijriModeState, setHijriMode: setHijriModePref,
    preferences, setPreference,
    logo, setLogo, setLogoState,
  } = usePreferences();

  // ---- Data state ----
  const isCorrupted = (s?: string | null) => !!s && /[\uFFFD\u061F?]/.test(s);
  const healSeed = <T extends { id: string }>(loaded: T[], initial: T[], fields: (keyof T)[]): T[] =>
    loaded.map((item) => {
      const src = initial.find((x) => x.id === item.id);
      if (!src) return item;
      const patched = { ...item };
      fields.forEach((f) => {
        const v = item[f];
        const sv = src[f];
        if (typeof v === 'string' && typeof sv === 'string' && isCorrupted(v)) (patched as Record<string, unknown>)[f as string] = sv;
      });
      return patched;
    });

  const [branches, setBranches] = useState<Branch[]>(() => loadState('rcerp_branches', INITIAL_BRANCHES));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => healSeed(loadState('rcerp_suppliers', INITIAL_SUPPLIERS), INITIAL_SUPPLIERS, ['name', 'contactPerson']));
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>(() => healSeed(loadState('rcerp_raw_materials', INITIAL_RAW_MATERIALS), INITIAL_RAW_MATERIALS, ['nameAr', 'nameEn']));
  const [recipes, setRecipes] = useState<StandardRecipe[]>(() => healSeed(loadState('rcerp_recipes', INITIAL_RECIPES), INITIAL_RECIPES, ['nameAr', 'nameEn', 'description']));
  // أقسام مخصصة لكل تصنيف (هوية افتراضية من DEFAULT_RECIPE_SECTIONS وتُتعدّل من شاشة الوصفات)
  const [recipeSections, setRecipeSections] = useState<Record<string, string[]>>(() => loadState('rcerp_recipe_sections', DEFAULT_RECIPE_SECTIONS));
  const [grnNotes, setGrnNotes] = useState<GoodsReceiptNote[]>(() => loadState('rcerp_grn', INITIAL_GRN_NOTES));
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => loadState('rcerp_purchase_orders', INITIAL_PURCHASE_ORDERS));
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>(() => loadState('rcerp_purchase_requests', []));
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() => loadState('rcerp_work_orders', INITIAL_WORK_ORDERS));
  const [wastageLogs, setWastageLogs] = useState<WastageLog[]>(() => loadState('rcerp_wastage', INITIAL_WASTAGE_LOGS));
  const [closedDays, setClosedDays] = useState<string[]>(() => loadState<string[]>('rcerp_closed_days', []));
  const [customReports, setCustomReports] = useState<CustomReport[]>(() => loadState<CustomReport[]>('rcerp_custom_reports', []));
  const [employees, setEmployees] = useState<Employee[]>(() => loadState('rcerp_employees', INITIAL_EMPLOYEES));
  const [customRoles, setCustomRoles] = useState<string[]>(() => loadState('rcerp_custom_roles', Object.values(EMPLOYEE_ROLE_LABELS)));
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>(() => loadState('rcerp_access_roles', []));
  const [shifts, setShifts] = useState<LaborShift[]>(() => loadState('rcerp_shifts', INITIAL_LABOR_SHIFTS));
  const [posOrders, setPosOrders] = useState<POSOrder[]>(() => loadState('rcerp_pos_orders', INITIAL_POS_ORDERS));
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>(() => loadState('rcerp_stock_transfers', INITIAL_STOCK_TRANSFERS));
  const [recipeInventory, setRecipeInventory] = useState<RecipeInventory[]>(() => loadState('rcerp_recipe_inventory', INITIAL_RECIPE_INVENTORY));
  const [accounts, setAccounts] = useState<Account[]>(() => loadState('rcerp_accounts', INITIAL_ACCOUNTS));
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => loadState('rcerp_journal', INITIAL_JOURNAL_ENTRIES));
  const [posReturns, setPosReturns] = useState<POSReturn[]>(() => loadState('rcerp_pos_returns', []));
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>(() => loadState('rcerp_fixed_assets', INITIAL_FIXED_ASSETS));
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>(() => healSeed(loadState('rcerp_scheduled_reports', INITIAL_SCHEDULED_REPORTS), INITIAL_SCHEDULED_REPORTS, ['name']));
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>(() => healSeed(loadState('rcerp_automation_rules', INITIAL_AUTOMATION_RULES), INITIAL_AUTOMATION_RULES, ['label', 'description']));
  const [physicalCounts, setPhysicalCounts] = useState<PhysicalStockCount[]>(() => loadState('rcerp_physical_counts', []));
  const [dailyCounts, setDailyCounts] = useState<DailyInventoryCount[]>(() => loadState('rcerp_daily_counts', []));
  const [distributions, setDistributions] = useState<Distribution[]>(() => loadState('rcerp_distributions', []));
  const [intakeInbox, setIntakeInbox] = useState<IntakeInboxEntry[]>(() => loadState('rcerp_intake_inbox', []));
  const [openingBalances, setOpeningBalancesRec] = useState<OpeningBalanceRecord[]>(() => loadState('rcerp_opening_balances', []));
  const [employeeMeals, setEmployeeMeals] = useState<EmployeeMealRecord[]>(() => loadState('rcerp_employee_meals', []));
  const [butcherTests, setButcherTests] = useState<ButcherTest[]>(() => loadState('rcerp_butcher_tests', []));
  const [materialCategories, setMaterialCategories] = useState<MaterialCategoryDef[]>(() => loadState('rcerp_material_categories', []));
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>(() => loadState('rcerp_production_runs', []));
  const [plSummaries, setPlSummaries] = useState<BranchPLSummary[]>(() => loadState('rcerp_pl_summaries', INITIAL_PL_SUMMARIES));
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() => loadState('rcerp_categories', INITIAL_CATEGORIES));
  const [foodMenus, setFoodMenus] = useState<FoodMenu[]>(() => loadState('rcerp_food_menus', INITIAL_FOOD_MENUS));
  const [menuPlans, setMenuPlans] = useState<MenuPlan[]>(() => loadState('rcerp_menu_plans', []));
  const [batchSalesRecords, setBatchSalesRecords] = useState<BatchSalesRecord[]>(() => loadState('rcerp_batch_sales', INITIAL_BATCH_SALES));

  const [supplierQuotes, setSupplierQuotes] = useState<SupplierQuote[]>(() => loadState('rcerp_supplier_quotes', []));

  const [supplierReturns, setSupplierReturns] = useState<SupplierReturn[]>(() => loadState('rcerp_supplier_returns', []));

  const [monthlyInventory, setMonthlyInventory] = useState<MonthlyInventoryPeriod[]>(() => loadState('rcerp_monthly_inventory', []));

  const [closedMonths, setClosedMonths] = useState<string[]>(() => loadState('rcerp_closed_months', []));
  const [eodClosures, setEodClosures] = useState<EodClosure[]>(() => loadState('rcerp_eod_closures', []));
  const { toast, showToast } = useToasts();

  const ADMIN_PASSWORD = 'admin123';

  // يتحقق من كلمة مرور المسؤول: كلمة مرور الحساب الحالي المسجّل دخوله (عبر الخادم)،
  // أو كلمة مرور النظام الأساسية، أو التحقق المحلي عند عدم توفر الخادم.
  const verifyAdminPassword = async (password: string): Promise<boolean> => {
    if (!password) return false;
    if (password === ADMIN_PASSWORD) return true;
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (json.ok) return true;
    } catch {
      // الخادم غير متاح — تحقق محلي من كلمة مرور المستخدم
    }
    if (currentUser && currentUser.passwordHash) {
      return verifyPassword(password, currentUser.passwordHash);
    }
    return false;
  };

  const [operatingExpenses, setOperatingExpenses] = useState<OperatingExpense[]>(() => loadState('rcerp_operating_expenses', INITIAL_OPERATING_EXPENSES));
  const [expenseBudgets, setExpenseBudgets] = useState<ExpenseBudget[]>(() => loadState('rcerp_expense_budgets', INITIAL_EXPENSE_BUDGETS));
  const [customers, setCustomers] = useState<Customer[]>(() => loadState('rcerp_customers', INITIAL_CUSTOMERS));
  const [reservations, setReservations] = useState<Reservation[]>(() => loadState('rcerp_reservations', INITIAL_RESERVATIONS));
  const [invoices, setInvoices] = useState<Invoice[]>(() => loadState('rcerp_invoices', INITIAL_INVOICES));
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => loadState('rcerp_audit', []));
  // التكلفة المستهدفة في كامل النظام: 28% Food Cost = هامش 72% (ترقية تلقائية من القديم 68%)
  const [globalTargetMarginPercent, setGlobalTargetMarginPercent] = useState<number>(() => {
    const v = loadState<number>('rcerp_target_margin', 72);
    return v === 68 ? 72 : (v >= 30 && v <= 95 ? v : 72);
  });
  const [vatPercent, setVatPercent] = useState<number>(() => loadState('rcerp_vat_percent', 15));
  const [vatInclusive, setVatInclusive] = useState<boolean>(() => loadState('rcerp_vat_inclusive', true));
  const [deductSalesFromInventory, setDeductSalesFromInventory] = useState<boolean>(() => loadState('rcerp_deduct_sales', false));
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = useState<string[]>(() => loadState('rcerp_ack_alerts', []));
  const [currencies, setCurrencies] = useState<Currency[]>(() => loadState('rcerp_currencies', INITIAL_CURRENCIES));
  const [companies, setCompanies] = useState<Company[]>(() => loadState('rcerp_companies', INITIAL_COMPANIES));
  const [deletedIds, setDeletedIds] = useState<string[]>(() => loadState<string[]>('rcerp_deleted_ids', []));
  // شاهد الحذف (tombstone): أي معرّف يدخل هنا يُفلتر دائماً عند سحب البيانات من الخادم
  // ولا يمكن أن يعود أبداً مهما أعاد أي جهاز/تبويب رفعه.
  const tombstoneIds = (ids: string[]) => setDeletedIds((prev) => Array.from(new Set([...(Array.isArray(prev) ? prev : []), ...ids])));
  const [requisitions, setRequisitions] = useState<DepartmentRequisition[]>(() => loadState('rcerp_requisitions', []));
  const [deliveryApps, setDeliveryApps] = useState<DeliveryApp[]>(() => loadState('rcerp_delivery_apps', INITIAL_DELIVERY_APPS));
  const [deliverySales, setDeliverySales] = useState<DeliverySale[]>(() => loadState('rcerp_delivery_sales', []));
  const [branchStockLimits, setBranchStockLimits] = useState<BranchStockLimit[]>(() => loadState('rcerp_branch_stock_limits', []));
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => loadState('rcerp_attendance', []));
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>(() => loadState('rcerp_payroll', []));

  // Seed demo users on first run (server DB is empty on very first boot).
  // Uses a ref so a slow bootstrap that loads REAL server users is never
  // overwritten by this async seed (which would replace the real users —
  // and thus the logged-in identity — with demo users).
  useEffect(() => {
    if (serverUsersLoadedRef.current) return;
    if (users.length === 0 && !seeding) {
      setSeeding(true);
      (async () => {
        const seeded: User[] = [];
        for (const cred of DEMO_CREDENTIALS) {
          seeded.push({
            id: `user-${cred.email.split('@')[0]}`,
            name: cred.name,
            email: cred.email,
            passwordHash: await hashPassword(cred.password),
            role: cred.role,
            branchId: cred.branchId,
            isActive: true,
            createdAt: new Date().toISOString(),
          });
        }
        if (serverUsersLoadedRef.current) { setSeeding(false); return; }
        setUsers((prev) => (serverUsersLoadedRef.current || prev.length > 0 ? prev : seeded));
        setSeeding(false);
      })();
    }
  }, [users, seeding]);

  // Load everything from the server (SQLite) on mount; fall back to the last synced
  // snapshot (offline cache) if the server is unreachable, and cache on every success.
  const applyData = (d: Record<string, unknown>) => {
    if (d.rcerp_branches) {
      setBranches((d.rcerp_branches as Branch[]).map((b) => ({ ...b, companyId: b.companyId || INITIAL_BRANCHES.find((ib) => ib.id === b.id)?.companyId })));
    }
    // دمج المحذوفات: المحلية + من الخادم — لا نستبدل أبداً حتى لا يعود مُحذَف في أي جهاز أو تبويب.
    const serverTomb = Array.isArray(d.rcerp_deleted_ids) ? (d.rcerp_deleted_ids as string[]) : [];
    if (serverTomb.length) setDeletedIds((prev) => Array.from(new Set([...(Array.isArray(prev) ? prev : []), ...serverTomb])));
    const tombstones = new Set<string>([...(Array.isArray(deletedIds) ? deletedIds : []), ...serverTomb]);
    if (d.rcerp_suppliers) setSuppliers((d.rcerp_suppliers as Supplier[]).filter((s) => s && !tombstones.has(s.id)));
    if (d.rcerp_raw_materials) setRawMaterials((d.rcerp_raw_materials as RawMaterial[]).filter((r) => r && !tombstones.has(r.id)));
    if (d.rcerp_material_barcodes) setMaterialBarcodes((d.rcerp_material_barcodes as MaterialBarcode[]).filter((b) => b && !tombstones.has(b.id)));
    if (d.rcerp_units && Array.isArray(d.rcerp_units) && (d.rcerp_units as UnitOfMeasure[]).length > 0) setUnitsOfMeasure(d.rcerp_units as UnitOfMeasure[]);
    if (d.rcerp_recipes) setRecipes((d.rcerp_recipes as StandardRecipe[]).filter((r) => r && !tombstones.has(r.id)));
    if (d.rcerp_inventory) setInventory(d.rcerp_inventory as InventoryRecord[]);
    if (d.rcerp_inventory_batches) setInventoryBatches(d.rcerp_inventory_batches as InventoryBatch[]);
    if (d.rcerp_temp_logs) setTempLogs(d.rcerp_temp_logs as TempLogEntry[]);
    if (d.rcerp_haccp_inspections) setHaccpInspections(d.rcerp_haccp_inspections as HaccpInspection[]);
    if (d.rcerp_grn) setGrnNotes((d.rcerp_grn as GoodsReceiptNote[]).filter((g) => g && !tombstones.has(g.id)));
    if (d.rcerp_purchase_orders) setPurchaseOrders(d.rcerp_purchase_orders as PurchaseOrder[]);
    if (d.rcerp_purchase_requests) setPurchaseRequests(d.rcerp_purchase_requests as PurchaseRequest[]);
    if (d.rcerp_work_orders) setWorkOrders(d.rcerp_work_orders as WorkOrder[]);
    if (d.rcerp_wastage) setWastageLogs(d.rcerp_wastage as WastageLog[]);
    if (d.rcerp_inventory_movements) setInventoryMovements(d.rcerp_inventory_movements as InventoryMovementLog[]);
    if (d.rcerp_closed_days) setClosedDays(d.rcerp_closed_days as string[]);
    if (d.rcerp_tasks) setTasks(d.rcerp_tasks as Task[]);
    if (d.rcerp_customer_orders) setCustomerOrders(d.rcerp_customer_orders as CustomerOrder[]);
    if (d.rcerp_employees) setEmployees(d.rcerp_employees as Employee[]);
    if (d.rcerp_custom_roles) setCustomRoles(d.rcerp_custom_roles as string[]);
  if (d.rcerp_access_roles) setAccessRoles(d.rcerp_access_roles as AccessRole[]);
    if (d.rcerp_shifts) setShifts(d.rcerp_shifts as LaborShift[]);
    if (d.rcerp_pos_orders) setPosOrders(d.rcerp_pos_orders as POSOrder[]);
    if (d.rcerp_stock_transfers) setStockTransfers(d.rcerp_stock_transfers as StockTransfer[]);
    if (d.rcerp_recipe_inventory) setRecipeInventory(d.rcerp_recipe_inventory as RecipeInventory[]);
    if (d.rcerp_accounts) setAccounts(d.rcerp_accounts as Account[]);
    if (d.rcerp_journal) setJournalEntries(d.rcerp_journal as JournalEntry[]);
    if (d.rcerp_pos_returns) setPosReturns(d.rcerp_pos_returns as POSReturn[]);
    if (d.rcerp_fixed_assets) setFixedAssets(d.rcerp_fixed_assets as FixedAsset[]);
    if (d.rcerp_scheduled_reports) setScheduledReports(d.rcerp_scheduled_reports as ScheduledReport[]);
    if (d.rcerp_automation_rules) setAutomationRules(d.rcerp_automation_rules as AutomationRule[]);
    if (d.rcerp_physical_counts) setPhysicalCounts(d.rcerp_physical_counts as PhysicalStockCount[]);
    if (d.rcerp_daily_counts) setDailyCounts(d.rcerp_daily_counts as DailyInventoryCount[]);
    if (d.rcerp_distributions) setDistributions(d.rcerp_distributions as Distribution[]);
    if (d.rcerp_employee_meals) setEmployeeMeals(d.rcerp_employee_meals as EmployeeMealRecord[]);
    if (d.rcerp_butcher_tests) setButcherTests(d.rcerp_butcher_tests as ButcherTest[]);
    if (d.rcerp_material_categories) setMaterialCategories(d.rcerp_material_categories as MaterialCategoryDef[]);
    if (d.rcerp_production_runs) setProductionRuns(d.rcerp_production_runs as ProductionRun[]);
    if (d.rcerp_pl_summaries) setPlSummaries(d.rcerp_pl_summaries as BranchPLSummary[]);
    if (d.rcerp_categories) setCustomCategories(healSeed(d.rcerp_categories as CustomCategory[], INITIAL_CATEGORIES, ['nameAr', 'nameEn']));
    if (d.rcerp_food_menus) setFoodMenus((d.rcerp_food_menus as FoodMenu[]).filter((m) => m && !tombstones.has(m.id)));
    if (d.rcerp_menu_plans) setMenuPlans(d.rcerp_menu_plans as MenuPlan[]);
    if (d.rcerp_batch_sales) setBatchSalesRecords((d.rcerp_batch_sales as BatchSalesRecord[]).filter((b) => b && !tombstones.has(b.id)));
    if (d.rcerp_operating_expenses) setOperatingExpenses(d.rcerp_operating_expenses as OperatingExpense[]);
    if (d.rcerp_expense_budgets) setExpenseBudgets(d.rcerp_expense_budgets as ExpenseBudget[]);
    if (d.rcerp_customers) setCustomers(d.rcerp_customers as Customer[]);
    if (d.rcerp_reservations) setReservations(d.rcerp_reservations as Reservation[]);
    if (d.rcerp_invoices) setInvoices(d.rcerp_invoices as Invoice[]);
    if (d.rcerp_audit) setAuditLogs(d.rcerp_audit as AuditLogEntry[]);
    if (d.rcerp_users && Array.isArray(d.rcerp_users)) {
      serverUsersLoadedRef.current = true;
      setUsers(d.rcerp_users as User[]);
    }
    if (d.rcerp_opening_balances) setOpeningBalancesRec(d.rcerp_opening_balances as OpeningBalanceRecord[]);
    if (d.rcerp_supplier_quotes) setSupplierQuotes(d.rcerp_supplier_quotes as SupplierQuote[]);
    if (d.rcerp_supplier_returns) setSupplierReturns(d.rcerp_supplier_returns as SupplierReturn[]);
    if (d.rcerp_monthly_inventory) setMonthlyInventory(d.rcerp_monthly_inventory as MonthlyInventoryPeriod[]);
    if (d.rcerp_closed_months) setClosedMonths(d.rcerp_closed_months as string[]);
    if (d.rcerp_eod_closures) setEodClosures(d.rcerp_eod_closures as EodClosure[]);
    if (typeof d.rcerp_target_margin === 'number') setGlobalTargetMarginPercent(d.rcerp_target_margin as number);
    if (typeof d.rcerp_vat_percent === 'number') setVatPercent(d.rcerp_vat_percent as number);
    if (typeof d.rcerp_vat_inclusive === 'boolean') setVatInclusive(d.rcerp_vat_inclusive as boolean);
    if (typeof d.rcerp_deduct_sales === 'boolean') setDeductSalesFromInventory(d.rcerp_deduct_sales as boolean);
    if (d.rcerp_ack_alerts) setAcknowledgedAlertIds(d.rcerp_ack_alerts as string[]);
    if (d.rcerp_currencies) setCurrencies((d.rcerp_currencies as Currency[]).map((c) => {
      if (isCorrupted(c.nameAr) || isCorrupted(c.symbol)) {
        const src = INITIAL_CURRENCIES.find((x) => x.code === c.code);
        if (src) return { ...c, nameAr: isCorrupted(c.nameAr) ? src.nameAr : c.nameAr, symbol: isCorrupted(c.symbol) ? src.symbol : c.symbol };
      }
      return c;
    }));
    if (d.rcerp_companies) {
      const companiesFromServer = (d.rcerp_companies as Company[]).filter((c) => c && !tombstones.has(c.id));
      setCompanies(healSeed(companiesFromServer, INITIAL_COMPANIES, ['nameAr', 'nameEn']));
    }
    if (d.rcerp_recipe_sections) setRecipeSections(d.rcerp_recipe_sections as Record<string, string[]>);
    if (d.rcerp_requisitions) setRequisitions(d.rcerp_requisitions as DepartmentRequisition[]);
    if (d.rcerp_delivery_apps) setDeliveryApps(d.rcerp_delivery_apps as DeliveryApp[]);
    if (d.rcerp_delivery_sales) setDeliverySales(d.rcerp_delivery_sales as DeliverySale[]);
    if (d.rcerp_branch_stock_limits) setBranchStockLimits(d.rcerp_branch_stock_limits as BranchStockLimit[]);
    if (d.rcerp_attendance) setAttendance(d.rcerp_attendance as AttendanceRecord[]);
    if (d.rcerp_payroll) setPayrollPeriods(d.rcerp_payroll as PayrollPeriod[]);
    const logoVal = (d.rcerp_logo as { v?: string } | null | undefined)?.v;
    if (typeof logoVal === 'string') {
      setLogoState(logoVal);
      localStorage.setItem('rcerp_logo', logoVal);
    }
    if (d.rcerp_ai_settings) {
      const s = d.rcerp_ai_settings as unknown;
      const migrated = normalizeAISettings(s);
      if (migrated) {
        setAISettings(migrated);
        try { localStorage.setItem('rcerp_ai_models', JSON.stringify(migrated.items.map((x) => ({ ...x, apiKey: x.apiKey || '' })))); } catch { /* ignore */ }
        localStorage.setItem('rcerp_ai_active_model', migrated.activeId);
        const active = migrated.items.find((x) => x.id === migrated.activeId) || migrated.items[0];
        if (active) {
          localStorage.setItem('rcerp_ai_provider', active.provider);
          localStorage.setItem('rcerp_ai_enabled', String(active.enabled));
          localStorage.removeItem('rcerp_ai_key');
          if (active.baseURL) localStorage.setItem('rcerp_ai_baseurl', active.baseURL);
          else localStorage.removeItem('rcerp_ai_baseurl');
          if (active.model) localStorage.setItem('rcerp_ai_model', active.model);
          else localStorage.removeItem('rcerp_ai_model');
        }
      }
    }
    // تذكّر مراجع البيانات المستوردة من الخادم: أي تأثير لاحق يعيد نفس المرجع
    // لا يُعدّ تعديلاً محلياً جديداً فلا يُعاد رفعه (منع "صدى" إعادة الرفع بعد كل تحميل).
    for (const k of Object.keys(d)) appliedRefsRef.current.set(k, d[k]);
  };

  // خريطة setter لكل مجموعة — تُستخدم لإعادة تطبيق التعديلات المحلية المعلّقة
  // فوق بيانات الخادم عند التحميل (المحلي أحدث دائماً — الحذف لا يعود بعد التحديث).
  const COLLECTION_SETTERS: Record<string, (v: unknown) => void> = {
    rcerp_branches: (v) => setBranches(v as Branch[]),
    rcerp_suppliers: (v) => setSuppliers(v as Supplier[]),
    rcerp_raw_materials: (v) => setRawMaterials(v as RawMaterial[]),
    rcerp_material_barcodes: (v) => setMaterialBarcodes(v as MaterialBarcode[]),
    rcerp_units: (v) => setUnitsOfMeasure(v as UnitOfMeasure[]),
    rcerp_recipes: (v) => setRecipes(v as StandardRecipe[]),
    rcerp_inventory: (v) => setInventory(v as InventoryRecord[]),
    rcerp_inventory_batches: (v) => setInventoryBatches(v as InventoryBatch[]),
    rcerp_grn: (v) => setGrnNotes(v as GoodsReceiptNote[]),
    rcerp_purchase_orders: (v) => setPurchaseOrders(v as PurchaseOrder[]),
    rcerp_purchase_requests: (v) => setPurchaseRequests(v as PurchaseRequest[]),
    rcerp_work_orders: (v) => setWorkOrders(v as WorkOrder[]),
    rcerp_wastage: (v) => setWastageLogs(v as WastageLog[]),
    rcerp_inventory_movements: (v) => setInventoryMovements(v as InventoryMovementLog[]),
    rcerp_closed_days: (v) => setClosedDays(v as string[]),
    rcerp_temp_logs: (v) => setTempLogs(v as TempLogEntry[]),
    rcerp_haccp_inspections: (v) => setHaccpInspections(v as HaccpInspection[]),
    rcerp_tasks: (v) => setTasks(v as Task[]),
    rcerp_customer_orders: (v) => setCustomerOrders(v as CustomerOrder[]),
    rcerp_employees: (v) => setEmployees(v as Employee[]),
    rcerp_custom_roles: (v) => setCustomRoles(v as string[]),
    rcerp_access_roles: (v) => setAccessRoles(v as AccessRole[]),
    rcerp_shifts: (v) => setShifts(v as LaborShift[]),
    rcerp_pos_orders: (v) => setPosOrders(v as POSOrder[]),
    rcerp_stock_transfers: (v) => setStockTransfers(v as StockTransfer[]),
    rcerp_recipe_inventory: (v) => setRecipeInventory(v as RecipeInventory[]),
    rcerp_accounts: (v) => setAccounts(v as Account[]),
    rcerp_journal: (v) => setJournalEntries(v as JournalEntry[]),
    rcerp_pos_returns: (v) => setPosReturns(v as POSReturn[]),
    rcerp_fixed_assets: (v) => setFixedAssets(v as FixedAsset[]),
    rcerp_scheduled_reports: (v) => setScheduledReports(v as ScheduledReport[]),
    rcerp_automation_rules: (v) => setAutomationRules(v as AutomationRule[]),
    rcerp_physical_counts: (v) => setPhysicalCounts(v as PhysicalStockCount[]),
    rcerp_daily_counts: (v) => setDailyCounts(v as DailyInventoryCount[]),
    rcerp_distributions: (v) => setDistributions(v as Distribution[]),
    rcerp_intake_inbox: (v) => setIntakeInbox(v as IntakeInboxEntry[]),
    rcerp_employee_meals: (v) => setEmployeeMeals(v as EmployeeMealRecord[]),
    rcerp_butcher_tests: (v) => setButcherTests(v as ButcherTest[]),
    rcerp_material_categories: (v) => setMaterialCategories(v as MaterialCategoryDef[]),
    rcerp_production_runs: (v) => setProductionRuns(v as ProductionRun[]),
    rcerp_pl_summaries: (v) => setPlSummaries(v as BranchPLSummary[]),
    rcerp_categories: (v) => setCustomCategories(v as CustomCategory[]),
    rcerp_food_menus: (v) => setFoodMenus(v as FoodMenu[]),
    rcerp_menu_plans: (v) => setMenuPlans(v as MenuPlan[]),
    rcerp_batch_sales: (v) => setBatchSalesRecords(v as BatchSalesRecord[]),
    rcerp_operating_expenses: (v) => setOperatingExpenses(v as OperatingExpense[]),
    rcerp_expense_budgets: (v) => setExpenseBudgets(v as ExpenseBudget[]),
    rcerp_customers: (v) => setCustomers(v as Customer[]),
    rcerp_reservations: (v) => setReservations(v as Reservation[]),
    rcerp_invoices: (v) => setInvoices(v as Invoice[]),
    rcerp_audit: (v) => setAuditLogs(v as AuditLogEntry[]),
    rcerp_users: (v) => {
      serverUsersLoadedRef.current = true;
      setUsers(v as User[]);
    },
    rcerp_opening_balances: (v) => setOpeningBalancesRec(v as OpeningBalanceRecord[]),
    rcerp_supplier_quotes: (v) => setSupplierQuotes(v as SupplierQuote[]),
    rcerp_supplier_returns: (v) => setSupplierReturns(v as SupplierReturn[]),
    rcerp_monthly_inventory: (v) => setMonthlyInventory(v as MonthlyInventoryPeriod[]),
    rcerp_closed_months: (v) => setClosedMonths(v as string[]),
    rcerp_eod_closures: (v) => setEodClosures(v as EodClosure[]),
    rcerp_ack_alerts: (v) => setAcknowledgedAlertIds(v as string[]),
    rcerp_currencies: (v) => setCurrencies(v as Currency[]),
    rcerp_companies: (v) => setCompanies(v as Company[]),
    rcerp_recipe_sections: (v) => setRecipeSections(v as Record<string, string[]>),
    rcerp_requisitions: (v) => setRequisitions(v as DepartmentRequisition[]),
    rcerp_delivery_apps: (v) => setDeliveryApps(v as DeliveryApp[]),
    rcerp_delivery_sales: (v) => setDeliverySales(v as DeliverySale[]),
    rcerp_branch_stock_limits: (v) => setBranchStockLimits(v as BranchStockLimit[]),
    rcerp_attendance: (v) => setAttendance(v as AttendanceRecord[]),
    rcerp_payroll: (v) => setPayrollPeriods(v as PayrollPeriod[]),
    rcerp_logo: (v) => {
      const val = (v as { v?: string } | null)?.v;
      if (typeof val === 'string') { setLogoState(val); localStorage.setItem('rcerp_logo', val); }
    },
    rcerp_ai_settings: (v) => {
      const n = normalizeAISettings(v);
      if (n) setAISettings(n);
    },
  };

  // بصمة آخر بيانات مطبّقة من الخادم — يُستخدم لتقليل التحديثات التلقائية إلى التغييرات الفعلية فقط
  const serverFpRef = useRef<string | null>(null);
  const appliedRefsRef = useRef<Map<string, unknown>>(new Map());
  const fpOf = (d: Record<string, unknown>) => JSON.stringify(d);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const loadFromServer = async (): Promise<{ ok: boolean; auth: boolean }> => {
      const token = localStorage.getItem('rcerp_token');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const res = await fetch('/api/bootstrap', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return { ok: false, auth: res.status === 401 || res.status === 403 };
        const json = await res.json();
        if (!json || !json.ok) return { ok: false, auth: false };
        if (cancelled) return { ok: true, auth: false };
        const d: Record<string, unknown> = json.data || {};
        applyData(d);
        // الخادم قاعدة، ثم نعيد المحلي المعلّق فوقه: الحذف/التعديل الذي لم يتم رفعه
        // بعد (أو فشل رفعه) يبقى حاضراً ويُرفع — المحلي دائماً أحدث من الخادم.
        if (pendingSaves.size > 0) reapplyPending();
        serverFpRef.current = fpOf(d);
        localStorage.setItem('rcerp_offline_cache', JSON.stringify({ savedAt: new Date().toISOString(), data: d }));
        setOffline(false);
        setOfflineSince('');
        if (json.user) {
          setCurrentUser(json.user);
          if (json.mustChangePassword) setMustChangePassword(true);
        } else if (token) {
          localStorage.removeItem('rcerp_token');
        }
        return { ok: true, auth: false };
      } catch {
        return { ok: false, auth: false };
      } finally {
        clearTimeout(timer);
      }
    };
    (async () => {
      let r = await loadFromServer();
      let ok = r.ok;
      const authFail = r.auth;
      // رفض التوكن (401/403) ليس انقطاعاً بالشبكة: نعرض شاشة الدخول ولا نُظهر
      // "دون اتصال" ولا نكشف الكاش. إعادة الدخول تستدعي retryBootstrap.
      if (!authFail && !ok && !cancelled) {
        // survive a transient blip (tunnel/lock) before falling back to cache
        for (let i = 0; i < 3 && !ok && !cancelled; i++) {
          await new Promise((r2) => setTimeout(r2, 1500 * (i + 1)));
          r = await loadFromServer();
          ok = r.ok;
        }
      }
      if (!ok && !authFail && !cancelled) {
        // الخادم غير متاح — نُقدم آخر نسخة متزامنة من الكاش إن لم تكن هناك تعديلات
        // محلية معلّقة: لا نبدّل أبداً الحالة المحلية الأحدث (حذف/تعديل لم يصلا)
        // بنسخة قديمة من الكاش — وإلا أعاد "الأشياء المحذوفة" بعد التحديث.
        if (pendingSaves.size === 0) {
          try {
            const cached = localStorage.getItem('rcerp_offline_cache');
            if (cached) {
              const obj = JSON.parse(cached) as { savedAt?: string; data?: Record<string, unknown> };
              if (obj && obj.data) {
                applyData(obj.data);
                setOffline(true);
                setOfflineSince(obj.savedAt || '');
              }
            }
          } catch { /* ignore */ }
        } else {
          setOffline(true);
          setOfflineSince('');
        }
        // keep polling in the background; clear the banner as soon as it reconnects
        const attempt = async () => {
          if (cancelled) return;
          const rr = await loadFromServer();
          if (rr.ok) setOffline(false);
          else if (!rr.auth) pollTimer = setTimeout(attempt, 20000);
        };
        pollTimer = setTimeout(attempt, 20000);
      }
      if (!cancelled) {
        setReady(true);
        setBooting(false);
      }
    })();
    return () => { cancelled = true; if (pollTimer) clearTimeout(pollTimer); };
  }, [refresh]);

  // Track live network state so the offline banner reflects the connection too.
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ---- موثوقية الحفظ + التزامن: طابور دائم في المتصفح + استطلاع الخادم (useSyncCore) ----
  const {
    saveFailed, authExpired, saveErrorDetail, pendingSavesCount, pendingSaves,
    setAuthExpired, persist, flushSaves, reapplyPending, syncNow,
  } = useSyncCore({
    ready, currentUser, booting, setCurrentUser,
    applyData, fpOf, serverFpRef, appliedRefsRef, COLLECTION_SETTERS,
    setOffline, setOfflineSince,
  });
  const upsertAccessRole = (role: AccessRole) =>
    setAccessRoles((prev) => (prev.some((r) => r.id === role.id) ? prev.map((r) => (r.id === role.id ? role : r)) : [...prev, role]));
  const removeAccessRole = (id: string) => setAccessRoles((prev) => prev.filter((r) => r.id !== id));

  // فحص صلاحية مستخدم على شاشة محددة (عرض/إضافة/تعديل/حذف)
  const screenCan = (screenId: string, action: 'view' | 'add' | 'edit' | 'delete' = 'view'): boolean => {
    const u = currentUser;
    if (!u || !u.isActive) return false;
    if (u.role === 'admin' || u.role === 'executive') return true;
    const navPerm = getNavItem(screenId)?.permission;
    const role = u.roleId ? accessRoles.find((r) => r.id === u.roleId) : undefined;
    if (!role) {
      if (!navPerm) return action === 'view';
      const legacy = ((ROLE_PERMISSIONS[u.role] || []) as string[]).includes(navPerm);
      return action === 'view' ? legacy : true; // قبل اعتماد دور مخصص: من يرى الشاشة يستخدمها (السلوك الحالي)
    }
    const p = role.screenPerms[screenId];
    if (p) {
      if (action === 'view') return !!p.view;
      if (action === 'add') return !!p.view && !!p.add;
      if (action === 'edit') return !!p.view && !!p.edit;
      return !!p.view && !!p.del;
    }
    // لا قاعدة صريحة لهذه الشاشة (شاشة أُضيفت للنظام بعد إنشاء الدور)
    // → ترث المشاهدة من الدور الأساسي، والإجراءات تبقى مرفوضة إلا بمنح صريح
    const baseOk = !!navPerm && ((ROLE_PERMISSIONS[role.baseRole] || []) as string[]).includes(navPerm);
    return baseOk && action === 'view';
  };
  const logAudit = useCallback((action: string, module: string, details?: string, entity?: { type: string; id: string }) => {
    if (!currentUser) return;
    const entry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      action,
      module,
      timestamp: new Date().toISOString(),
      details,
      entityType: entity?.type,
      entityId: entity?.id,
    };
    setAuditLogs((prev) => [entry, ...prev].slice(0, 500));
  }, [currentUser]);

  // ---- Auth (useAuthCore: login/logout/password/TOTP + إدارة المستخدمين) ----
  const { login, register, logout, changePassword, updateUser, deleteUser, revokeSessions, totpSetup, totpEnable, totpDisable } = useAuthCore({
    users, setUsers, currentUser, setCurrentUser, setMustChangePassword, setAuthExpired, pendingSaves, flushSaves, retryBootstrap,
  });

  // ---- كبسولات مكتفية ذاتياً: المهام / سلامة الغذاء / طلبات العميل ----
  const { tasks, setTasks, addTask, updateTask, completeTask, reopenTask, cancelTask, deleteTask } = useTasks({ currentUser, logAudit, showToast });
  const { tempLogs, setTempLogs, haccpInspections, setHaccpInspections, addTempLog, addHaccpInspection, deleteTempLog } = useHaccp({ currentUser, logAudit, showToast });
  const { customerOrders, setCustomerOrders, addCustomerOrder, updateCustomerOrderStatus } = useCustomerOrders({ logAudit });

  const getRawMaterialName = (id: string) => rawMaterials.find((m) => m.id === id)?.nameAr || id;

  // ---- سجل تراجع/إعادة (Undo/Redo): جذور البيانات الأساس + أرضية كبسولة الوحدات والباركود ----
  const [undoStack, setUndoStack] = useState<{ snap: ModelSnapshot; label: string }[]>([]);
  const [redoStack, setRedoStack] = useState<{ snap: ModelSnapshot; label: string }[]>([]);
  const captureSnap = (): ModelSnapshot => ({ recipes, rawMaterials, suppliers, branches, unitsOfMeasure });
  const pushSnap = (label: string) => {
    setUndoStack((prev) => [...prev.slice(-49), { snap: captureSnap(), label }]);
    setRedoStack([]);
  };

  // ---- كبسولة الوحدات والباركود (useUnitsAndBarcodes) ----
  const { unitsOfMeasure, setUnitsOfMeasure, materialBarcodes, setMaterialBarcodes, addMaterialBarcode, updateMaterialBarcode, deleteMaterialBarcode, barcodesForMaterial, findByBarcode, addUnitOfMeasure, updateUnitOfMeasure, deleteUnitOfMeasure } = useUnitsAndBarcodes({ logAudit, pushSnap, getRawMaterialName, rawMaterials });
  // ---- كبسولة المخزون الأساسي (useInventoryCore: رصيد المخزون + دفعات FEFO + الحركات) ----
  const { inventory, setInventory, inventoryBatches, setInventoryBatches, inventoryMovements, setInventoryMovements, adjustInventory, recipeStockQty, addInventoryBatches, consumeInventoryBatch, getFefoBatches, expiringBatches } = useInventoryCore({ rawMaterials });

  // كتابة الحالة إلى طابور الحفظ: تأثير واحد لجميع المجموعات — نفس سلوك الجدار السابق
  // (persist يرفض أي قيمة لم يتغيّر مرجعها)، وفي الاعتماديات كل القيم المعنية.
  useEffect(() => {
    persist('rcerp_branches', branches);
    persist('rcerp_suppliers', suppliers);
    persist('rcerp_raw_materials', rawMaterials);
    persist('rcerp_material_barcodes', materialBarcodes);
    if (unitsOfMeasure && unitsOfMeasure.length) persist('rcerp_units', unitsOfMeasure);
    persist('rcerp_recipes', recipes);
    persist('rcerp_recipe_sections', recipeSections);
    persist('rcerp_inventory', inventory);
    persist('rcerp_inventory_batches', inventoryBatches);
    persist('rcerp_grn', grnNotes);
    persist('rcerp_purchase_orders', purchaseOrders);
    persist('rcerp_purchase_requests', purchaseRequests);
    persist('rcerp_work_orders', workOrders);
    persist('rcerp_wastage', wastageLogs);
    persist('rcerp_inventory_movements', inventoryMovements);
    persist('rcerp_closed_days', closedDays);
    persist('rcerp_tasks', tasks);
    persist('rcerp_temp_logs', tempLogs);
    persist('rcerp_haccp_inspections', haccpInspections);
    persist('rcerp_custom_reports', customReports);
    persist('rcerp_customer_orders', customerOrders);
    persist('rcerp_employees', employees);
    persist('rcerp_custom_roles', customRoles);
    persist('rcerp_access_roles', accessRoles);
    persist('rcerp_shifts', shifts);
    persist('rcerp_attendance', attendance);
    persist('rcerp_payroll', payrollPeriods);
    persist('rcerp_pos_orders', posOrders);
    persist('rcerp_stock_transfers', stockTransfers);
    persist('rcerp_recipe_inventory', recipeInventory);
    persist('rcerp_accounts', accounts);
    persist('rcerp_journal', journalEntries);
    persist('rcerp_pos_returns', posReturns);
    persist('rcerp_fixed_assets', fixedAssets);
    persist('rcerp_scheduled_reports', scheduledReports);
    persist('rcerp_automation_rules', automationRules);
    persist('rcerp_physical_counts', physicalCounts);
    persist('rcerp_daily_counts', dailyCounts);
    persist('rcerp_distributions', distributions);
    persist('rcerp_intake_inbox', intakeInbox);
    persist('rcerp_opening_balances', openingBalances);
    persist('rcerp_employee_meals', employeeMeals);
    persist('rcerp_butcher_tests', butcherTests);
    persist('rcerp_material_categories', materialCategories);
    persist('rcerp_production_runs', productionRuns);
    persist('rcerp_supplier_quotes', supplierQuotes);
    persist('rcerp_supplier_returns', supplierReturns);
    persist('rcerp_monthly_inventory', monthlyInventory);
    persist('rcerp_closed_months', closedMonths);
    persist('rcerp_eod_closures', eodClosures);
    persist('rcerp_pl_summaries', plSummaries);
    persist('rcerp_categories', customCategories);
    persist('rcerp_food_menus', foodMenus);
    persist('rcerp_menu_plans', menuPlans);
    persist('rcerp_batch_sales', batchSalesRecords);
    persist('rcerp_operating_expenses', operatingExpenses);
    persist('rcerp_expense_budgets', expenseBudgets);
    persist('rcerp_customers', customers);
    persist('rcerp_reservations', reservations);
    persist('rcerp_invoices', invoices);
    persist('rcerp_audit', auditLogs);
    persist('rcerp_target_margin', globalTargetMarginPercent);
    persist('rcerp_vat_percent', vatPercent);
    persist('rcerp_vat_inclusive', vatInclusive);
    persist('rcerp_deduct_sales', deductSalesFromInventory);
    persist('rcerp_ack_alerts', acknowledgedAlertIds);
    persist('rcerp_currencies', currencies);
    persist('rcerp_companies', companies);
    persist('rcerp_deleted_ids', deletedIds);
    persist('rcerp_requisitions', requisitions);
    persist('rcerp_delivery_apps', deliveryApps);
    persist('rcerp_delivery_sales', deliverySales);
    persist('rcerp_branch_stock_limits', branchStockLimits);
    persist('rcerp_logo', { v: logo });
    persist('rcerp_ai_settings', aiSettings);
  }, [ready, branches, suppliers, rawMaterials, materialBarcodes, unitsOfMeasure, recipes, recipeSections, inventory, inventoryBatches, grnNotes, purchaseOrders, purchaseRequests, workOrders, wastageLogs, inventoryMovements, closedDays, tasks, tempLogs, haccpInspections, customReports, customerOrders, employees, customRoles, accessRoles, shifts, attendance, payrollPeriods, posOrders, stockTransfers, recipeInventory, accounts, journalEntries, posReturns, fixedAssets, scheduledReports, automationRules, physicalCounts, dailyCounts, distributions, intakeInbox, openingBalances, employeeMeals, butcherTests, materialCategories, productionRuns, supplierQuotes, supplierReturns, monthlyInventory, closedMonths, eodClosures, plSummaries, customCategories, foodMenus, menuPlans, batchSalesRecords, operatingExpenses, expenseBudgets, customers, reservations, invoices, auditLogs, globalTargetMarginPercent, vatPercent, vatInclusive, deductSalesFromInventory, acknowledgedAlertIds, currencies, companies, deletedIds, requisitions, deliveryApps, deliverySales, branchStockLimits, logo, aiSettings]);

  // ---- Permissions ----
  const can = useCallback((permission: Permission): boolean => {
    if (!currentUser) return false;
    const perms = ROLE_PERMISSIONS[currentUser.role] || [];
    return perms.includes(permission);
  }, [currentUser]);

  const hasRole = useCallback((...roles: UserRole[]): boolean => {
    if (!currentUser) return false;
    return roles.includes(currentUser.role);
  }, [currentUser]);

  const visibleBranchIds = useMemo<string[]>(() => {
    if (!currentUser) return [];
    if (currentUser.branchId === 'all') return branches.map((b) => b.id);
    return [currentUser.branchId];
  }, [currentUser, branches]);

  // ---- Helpers ----
  const getBranchName = (id: string) => {
    if (id === 'all') return 'جميع الفروع';
    return branches.find((b) => b.id === id)?.nameAr || id;
  };

  const getRawMaterialUnitCost = (id: string) => rawMaterials.find((m) => m.id === id)?.standardPrice || 0;

  const getAverageUnitCost = (id: string) => averageUnitCostFromReceipts(grnNotes, id, getRawMaterialUnitCost(id));

  const getBranchAverageUnitCost = (branchId: string, id: string, asOf?: string) =>
    movingWeightedAverage(openingBalances, grnNotes, stockTransfers, branchId, id, asOf, getRawMaterialUnitCost(id));

  // آخر سعر شراء فعلي للصنف في الفرع (أحدث استلام معتمد) — يتوافق مع الخادم
  const getLastPurchaseCost = (branchId: string, id: string): number => {
    const approved = grnNotes
      .filter((g) => g.status === 'approved' && g.branchId === branchId)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    for (const g of approved) {
      const item = g.items.find((i) => i.rawMaterialId === id && Number(i.quantityReceived) > 0 && Number(i.unitPrice) > 0);
      if (item) return Number(item.unitPrice);
    }
    return getRawMaterialUnitCost(id);
  };

  // ---- حدود المخزون لكل فرع (Min/Max per branch) ----
  // تعيد الحدود الفعلية للصنف في الفرع: المخصص للفرع إن وجد وإلا الافتراضي العام
  const getStockLevelsFor = (rawMaterialId: string, branchId: string): StockLevels =>
    stockLevelsFor(rawMaterials, branchStockLimits, rawMaterialId, branchId);

  const upsertBranchStockLimit = (branchId: string, rawMaterialId: string, data: Partial<Omit<BranchStockLimit, 'id' | 'branchId' | 'rawMaterialId'>>) => {
    setBranchStockLimits((prev) => {
      const idx = prev.findIndex((b) => b.branchId === branchId && b.rawMaterialId === rawMaterialId);
      const id = `${branchId}__${rawMaterialId}`;
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...data };
        return next;
      }
      const mat = rawMaterials.find((m) => m.id === rawMaterialId);
      return [...prev, {
        id, branchId, rawMaterialId,
        minStockLevel: data.minStockLevel ?? mat?.minStockLevel ?? 0,
        maxStockLevel: data.maxStockLevel ?? mat?.maxStockLevel ?? 0,
        alwaysOrderFullMax: data.alwaysOrderFullMax ?? false,
      }];
    });
  };

  const removeBranchStockLimit = (branchId: string, rawMaterialId: string) => {
    setBranchStockLimits((prev) => prev.filter((b) => !(b.branchId === branchId && b.rawMaterialId === rawMaterialId)));
  };

  const calculateRecipeCosts = (ingredients: StandardRecipe['ingredients'], directLabor: number, packaging: number, subPrep?: SubPrepIngredient[], yieldPieces?: number, _depth = 0) =>
    computeRecipeCosts(rawMaterials, recipes, ingredients, directLabor, packaging, subPrep, yieldPieces, _depth, (id) => getAverageUnitCost(id));

  // إعادة احتساب تكاليف الوصفات المتأثرة تلقائياً عند تغيّر السعر (اعتماد GRN / تعديل سعر مادة / استيراد /
  // تحميل النظام). يُمرَّر قائمتا المواد والاستلامات الفعليتان (بعد التغيير مباشرة) فيُحسب المتوسط منها لحظياً —
  // فلا يعتمد الحساب على حالة قديمة، ويُكتب سجل تغيير (costHistory) داخل كل وصفة تغيّرت تكلفتها فقط.
  const refreshRecipesCosts = (
    grnList: GoodsReceiptNote[],
    matList: RawMaterial[],
    changedMaterialIds: string[],
    reason: string,
  ): void => {
    setRecipes((prev) => {
      let anyChanged = false;
      const next = prev.map((r) => {
        if (changedMaterialIds.length && !recipeUsesAnyMaterial(r, prev, changedMaterialIds)) return r;
        const costs = computeRecipeCosts(
          matList, prev, r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces, 0,
          (id) => averageUnitCostFromReceipts(grnList, id, matList.find((m) => m.id === id)?.standardPrice || 0),
        );
        const oldCost = Number(r.totalCalculatedCost ?? 0);
        if (!isFinite(costs.totalCost) || Math.abs(costs.totalCost - oldCost) < 0.005) return r;
        anyChanged = true;
        const entry: RecipeCostHistoryEntry = {
          id: `rch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          oldTotalCost: oldCost,
          newTotalCost: costs.totalCost,
          oldSuggestedPrice: Number(r.suggestedPrice ?? 0),
          newSuggestedPrice: costs.suggestedPrice,
          reason,
          changedMaterials: changedMaterialIds,
        };
        return { ...r, totalCalculatedCost: costs.totalCost, suggestedPrice: costs.suggestedPrice, costHistory: [...(r.costHistory || []), entry] };
      });
      return anyChanged ? next : prev;
    });
  };

  const bootSyncedRef = useRef(false);
  useEffect(() => {
    if (!ready || bootSyncedRef.current) return;
    bootSyncedRef.current = true;
    refreshRecipesCosts(grnNotes, rawMaterials, [], 'مزامنة تلقائية بعد التحميل');
  }, [ready, grnNotes, rawMaterials]);

  const getFoodCostAlerts = (): FoodCostAlert[] => {
    const alerts: FoodCostAlert[] = [];
    recipes.forEach((recipe) => {
      if (!recipe.actualMenuPrice || recipe.actualMenuPrice <= 0 || recipe.isCentralKitchenPrep || !recipe.isActive) return;
      const costs = calculateRecipeCosts(recipe.ingredients, recipe.directLaborCost, recipe.packagingCost, recipe.subPrepIngredients, recipe.yieldPieces);
      const targetMargin = recipe.targetMarginPercent ?? globalTargetMarginPercent;
      const targetFoodCost = recipe.targetFoodCostPercent ?? (100 - targetMargin);
      const actualFoodCostPercent = Number(((costs.foodCost / recipe.actualMenuPrice) * 100).toFixed(1));
      const actualMarginPercent = Number((((recipe.actualMenuPrice - costs.totalCost) / recipe.actualMenuPrice) * 100).toFixed(1));
      if (actualFoodCostPercent > targetFoodCost || actualMarginPercent < targetMargin) {
        const excessCostPercent = Number((actualFoodCostPercent - targetFoodCost).toFixed(1));
        const maxAllowedFoodCost = recipe.actualMenuPrice * (targetFoodCost / 100);
        alerts.push({
          recipeId: recipe.id, recipeCode: recipe.code, recipeNameAr: recipe.nameAr, category: recipe.category,
          actualMenuPrice: recipe.actualMenuPrice, totalCost: costs.totalCost, foodCostOnly: costs.foodCost,
          actualFoodCostPercent, targetFoodCostPercent: targetFoodCost, actualMarginPercent, targetMarginPercent: targetMargin,
          excessCostPercent,
          excessCostPerPortion: Number((costs.foodCost - maxAllowedFoodCost).toFixed(2)),
          suggestedPriceForTarget: Number((costs.foodCost / (targetFoodCost / 100)).toFixed(2)),
          severity: excessCostPercent >= 5 ? 'critical' : 'warning',
          isAcknowledged: acknowledgedAlertIds.includes(recipe.id),
          dateTriggered: today(),
        });
      }
    });
    return alerts.sort((a, b) => {
      if (a.isAcknowledged !== b.isAcknowledged) return a.isAcknowledged ? 1 : -1;
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return b.excessCostPercent - a.excessCostPercent;
    });
  };

  // ---- Inventory mutation helpers ----
  // ---- (رصيد المخزون / الدفعات / الحركات استُخرجت إلى useInventoryCore.ts) ----

  const monthOfKey = (date: string) => date.slice(0, 7);
  const isMonthClosed = (monthKey: string) => closedMonths.includes(monthKey);
  const isDateClosed = (date: string) => closedMonths.includes(monthOfKey(date)) || closedDays.includes((date || '').slice(0, 10));

  const closeDay = (date: string) => {
    const d = (date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { showToast('تاريخ غير صالح'); return; }
    if (closedDays.includes(d)) { showToast('اليوم مغلق بالفعل'); return; }
    setClosedDays((prev) => [...prev, d].sort());
    // سجل إقفال لكل فرع بأرقام لحظة الإقفال (بند 66) — يظهر في لوحة الإقفال الموحدة
    const closures: EodClosure[] = branches.map((b) => {
      const pos = posOrders.filter((o) => o.branchId === b.id && String(o.date || '').slice(0, 10) === d);
      const bs = batchSalesRecords.filter((x) => x.branchId === b.id && String(x.date || '').slice(0, 10) === d);
      const revenue = pos.reduce((s, o) => s + (Number(o.subtotal) || 0), 0)
        + bs.reduce((s, x) => s + (Number(x.netRevenue) || (Number(x.totalRevenue) / (1 + (Number(x.vatRate) || 0.15))) || 0), 0);
      const foodCost = pos.reduce((s, o) => s + (Number(o.totalCost) || 0), 0)
        + bs.reduce((s, x) => s + (Number(x.totalFoodCost) || 0), 0);
      const laborCost = shifts.filter((s) => s.branchId === b.id && String(s.date || '').slice(0, 10) === d)
        .reduce((s, x) => s + (Number(x.totalShiftCost) || 0), 0);
      const operatingCost = operatingExpenses
        .filter((e) => e.branchId === b.id && e.paymentStatus === 'paid' && String(e.dueDate || e.createdAt || '').slice(0, 10) === d)
        .reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const wastageCost = wastageLogs.filter((w) => w.branchId === b.id && String(w.date || '').slice(0, 10) === d)
        .reduce((s, x) => s + (Number(x.totalCostImpact) || 0), 0);
      const profit = revenue - foodCost - laborCost - operatingCost - wastageCost;
      return {
        id: `eod-${b.id}-${d}`,
        branchId: b.id,
        date: d,
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.name || '—',
        revenue: Math.round(revenue),
        foodCost: Math.round(foodCost),
        laborCost: Math.round(laborCost),
        operatingCost: Math.round(operatingCost),
        wastageCost: Math.round(wastageCost),
        profit: Math.round(profit),
        marginPct: revenue ? Math.round((profit / revenue) * 1000) / 10 : 0,
      };
    });
    setEodClosures((prev) => [...prev.filter((c) => c.date !== d), ...closures]);
    logAudit('إغلاق يوم تشغيلي', 'التشغيل', d);
    showToast(`أُغلق يوم ${d} — يُمنع الإضافة أو التعديل على هذا التاريخ`);
  };
  const reopenDay = (date: string) => {
    const d = (date || '').slice(0, 10);
    setClosedDays((prev) => prev.filter((x) => x !== d));
    setEodClosures((prev) => prev.filter((c) => c.date !== d));
    logAudit('إعادة فتح يوم', 'التشغيل', d);
    showToast(`أُعيد فتح يوم ${d}`);
  };

  // ---- (كبسولات المهام / سلامة الغذاء / طلبات العميل استُخرجت إلى useTasks / useHaccp / useCustomerOrders) ----

  // ---- Monthly inventory (Oracle Material Control month-end) ----
  const startMonthlyInventory = (branchId: string, monthKey: string) => {
    if (isMonthClosed(monthKey)) { showToast(`الشهر ${monthKey} مقفل بالفعل — لا يمكن بدء جرد جديد`); return; }
    const inMonth = (d: string) => monthOfKey(d) === monthKey;
    const items: MonthlyInventoryItem[] = rawMaterials.filter((m) => m.isActive).map((mat) => {
      const purchased = grnNotes.filter((g) => g.branchId === branchId && g.status === 'approved' && inMonth(g.date))
        .reduce((s, g) => s + g.items.filter((x) => x.rawMaterialId === mat.id).reduce((si, x) => si + x.quantityReceived, 0), 0);
      const trIn = stockTransfers.filter((t) => t.toBranchId === branchId && inMonth(t.date))
        .reduce((s, t) => s + t.items.filter((x) => x.itemType !== 'recipe' && x.rawMaterialId === mat.id).reduce((si, x) => si + x.quantity, 0), 0);
      const trOut = stockTransfers.filter((t) => t.fromBranchId === branchId && inMonth(t.date))
        .reduce((s, t) => s + t.items.filter((x) => x.itemType !== 'recipe' && x.rawMaterialId === mat.id).reduce((si, x) => si + x.quantity, 0), 0);
      const theoreticalUsage = posOrders.filter((o) => o.branchId === branchId && inMonth(o.date.slice(0, 10)))
        .reduce((s, o) => s + o.items.reduce((si, it) => {
          const r = recipes.find((rr) => rr.id === it.recipeId);
          return si + (r ? r.ingredients.filter((ing) => ing.rawMaterialId === mat.id).reduce((ss, ing) => ss + recipeStockQty(mat.id, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * it.quantity), 0) : 0);
        }, 0), 0);
      const ob = openingBalances.filter((r) => r.branchId === branchId && r.date.slice(0, 7) <= monthKey).sort((a, b) => b.date.localeCompare(a.date))[0];
      const openingQty = ob?.items.find((x) => x.rawMaterialId === mat.id)?.quantity ?? 0;
      const theoreticalQty = openingQty + purchased + trIn - trOut - theoreticalUsage;
      return {
        rawMaterialId: mat.id, itemName: mat.nameAr, unit: mat.unit,
        openingQty: Number(openingQty.toFixed(2)), purchasedQty: Number(purchased.toFixed(2)),
        transferredIn: Number(trIn.toFixed(2)), transferredOut: Number(trOut.toFixed(2)),
        theoreticalQty: Number(theoreticalQty.toFixed(2)), countedQty: Number(theoreticalQty.toFixed(2)),
        varianceQty: 0, unitCost: getAverageUnitCost(mat.id), varianceCost: 0,
        theoreticalUsage: Number(theoreticalUsage.toFixed(2)), actualUsage: Number(theoreticalUsage.toFixed(2)), usageVariance: 0,
      };
    });
    setMonthlyInventory((prev) => [{ id: `mi-${Date.now()}`, branchId, monthKey, status: 'counting' as const, createdAt: today(), items, totalTheoreticalUsage: items.reduce((s, i) => s + i.theoreticalUsage, 0), totalActualUsage: items.reduce((s, i) => s + i.actualUsage, 0), totalUsageVariance: 0, totalVarianceCost: 0 }, ...prev]);
    logAudit('بدء جرد شهر', 'المخزون', `${getBranchName(branchId)} — ${monthKey}`);
  };

  const saveMonthlyInventoryCounts = (id: string, counted: Record<string, number>) => {
    setMonthlyInventory((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const items = p.items.map((it) => {
        const countedQty = counted[it.rawMaterialId];
        if (countedQty === undefined) return it;
        const varianceQty = Number((countedQty - it.theoreticalQty).toFixed(2));
        const actualUsage = Number((it.theoreticalUsage + varianceQty).toFixed(2));
        return { ...it, countedQty, varianceQty, varianceCost: Number((varianceQty * it.unitCost).toFixed(2)), actualUsage, usageVariance: Number((it.theoreticalUsage - actualUsage).toFixed(2)) };
      });
      return {
        ...p, items,
        totalVarianceCost: items.reduce((s, i) => s + i.varianceCost, 0),
        totalActualUsage: items.reduce((s, i) => s + i.actualUsage, 0),
        totalTheoreticalUsage: items.reduce((s, i) => s + i.theoreticalUsage, 0),
        totalUsageVariance: items.reduce((s, i) => s + i.usageVariance, 0),
      };
    }));
  };

  const closeMonthlyInventory = (id: string) => {
    const p = monthlyInventory.find((x) => x.id === id);
    if (!p) return;
    setMonthlyInventory((prev) => prev.map((x) => x.id === id ? { ...x, status: 'closed' as const, closedAt: new Date().toISOString(), closedBy: currentUser?.name || 'النظام' } : x));
    p.items.forEach((it) => { if (it.varianceQty !== 0) adjustInventory(p.branchId, it.rawMaterialId, it.varianceQty, undefined, { type: 'تسوية جرد فعلي' }); });
    if (p.totalVarianceCost !== 0) {
      postEntry(`إقفال جرد ${monthLabelFor(p.monthKey)} - ${getBranchName(p.branchId)}`,
        p.totalVarianceCost > 0
          ? [{ accountId: 'acc-inv', debit: p.totalVarianceCost, credit: 0 }, { accountId: 'acc-cogs', debit: 0, credit: p.totalVarianceCost }]
          : [{ accountId: 'acc-cogs', debit: -p.totalVarianceCost, credit: 0 }, { accountId: 'acc-inv', debit: 0, credit: -p.totalVarianceCost }],
        'auto', `MI-${p.monthKey}`);
    }
    setClosedMonths((prev) => prev.includes(p.monthKey) ? prev : [...prev, p.monthKey]);
    logAudit('إقفال جرد شهر', 'المخزون', `${getBranchName(p.branchId)} — ${p.monthKey} — فرق ${p.totalVarianceCost.toFixed(2)}`);
  };

  const deleteMonthlyInventory = (id: string) => {
    const p = monthlyInventory.find((x) => x.id === id);
    if (!p) return;
    if (p.status === 'closed') { showToast('لا يمكن حذف جرد مقفل — افتح الفترة أولاً', { level: 'error' }); return; }
    setMonthlyInventory((prev) => prev.filter((x) => x.id !== id));
    logAudit('حذف جرد شهر', 'المخزون', `${getBranchName(p.branchId)} — ${p.monthKey}`);
    showToast('تم حذف دورة الجرد', {
      level: 'success',
      undo: () => setMonthlyInventory((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev])),
    });
  };

  const reopenMonthlyInventory = (id: string) => {
    const p = monthlyInventory.find((x) => x.id === id);
    if (!p) return;
    if (p.status === 'counting') { showToast('الفترة مفتوحة بالفعل'); return; }
    p.items.forEach((it) => { if (it.varianceQty !== 0) adjustInventory(p.branchId, it.rawMaterialId, -it.varianceQty, undefined, { type: 'فتح إقفال جرد' }); });
    const v = p.totalVarianceCost;
    if (v !== 0) {
      postEntry(`فتح إقفال جرد ${monthLabelFor(p.monthKey)} - ${getBranchName(p.branchId)}`,
        v > 0
          ? [{ accountId: 'acc-cogs', debit: v, credit: 0 }, { accountId: 'acc-inv', debit: 0, credit: v }]
          : [{ accountId: 'acc-inv', debit: -v, credit: 0 }, { accountId: 'acc-cogs', debit: 0, credit: -v }],
        'auto', `MI-R-${p.monthKey}`);
    }
    setMonthlyInventory((prev) => prev.map((x) => x.id === id ? { ...x, status: 'counting' as const, closedAt: undefined, closedBy: undefined } : x));
    setClosedMonths((prev) => prev.filter((m) => m !== p.monthKey));
    logAudit('إعادة فتح جرد شهر', 'المخزون', `${getBranchName(p.branchId)} — ${p.monthKey}`);
    showToast(`أُعيد فتح ${monthLabelFor(p.monthKey)} للمراجعة والتعديل`);
  };

  // ---- Mutations ----
  const addBranch = (data: Omit<Branch, 'id' | 'code'>) => {
    pushSnap('إضافة فرع');
    setBranches((prev) => [...prev, { ...data, id: `b-${Date.now()}`, code: `BR-${Math.floor(100 + Math.random() * 900)}` }]);
    logAudit('إضافة فرع', 'الفروع', data.nameAr);
  };

  const updateBranch = (id: string, data: Partial<Branch>) => {
    pushSnap('تعديل فرع');
    setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)));
    // نشر إعادة التسمية تلقائياً على كل السجلات المخزنة التي تحمل نسخة من اسم الفرع
    if (data.nameAr) {
      setDeliverySales((prev) => prev.map((s) => (s.branchId === id && s.branchName !== data.nameAr ? { ...s, branchName: data.nameAr! } : s)));
      setBatchSalesRecords((prev) => prev.map((b) => (b.branchId === id && b.branchName !== data.nameAr ? { ...b, branchName: data.nameAr! } : b)));
    }
  };

  const deleteBranch = (id: string) => {
    pushSnap('حذف فرع');
    tombstoneIds([id]);
    setBranches((prev) => prev.filter((b) => b.id !== id));
    setInventory((prev) => prev.filter((i) => i.branchId !== id));
    setInventoryMovements((prev) => prev.filter((m) => m.branchId !== id));
    setDailyCounts((prev) => prev.filter((c) => c.branchId !== id));
    logAudit('حذف فرع', 'الفروع', id);
  };

  const addSupplier = (data: Omit<Supplier, 'id' | 'code'>) => {
    pushSnap('إضافة مورد');
    const created = { ...data, id: `sup-${Date.now()}`, code: `SUP-${Math.floor(100 + Math.random() * 900)}` };
    setSuppliers((prev) => [...prev, created]);
    logAudit('إضافة مورد', 'الموردين', data.name);
    return created;
  };
  const updateSupplier = (id: string, data: Partial<Supplier>) => {
    pushSnap('تعديل مورد');
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
  };

  const deleteSupplier = (id: string) => {
    pushSnap('حذف مورد');
    tombstoneIds([id]);
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
    logAudit('حذف مورد', 'الموردين', id);
  };

  const addRawMaterial = (data: Omit<RawMaterial, 'id' | 'code'>) => {
    pushSnap('إضافة مادة خام');
    setRawMaterials((prev) => [...prev, { ...data, id: `rm-${Date.now()}`, code: `RM-${Math.floor(100 + Math.random() * 900)}` }]);
    logAudit('إضافة مادة خام', 'المخزون', data.nameAr);
  };
  const updateRawMaterial = (id: string, data: Partial<RawMaterial>) => {
    pushSnap('تعديل مادة خام');
    setRawMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...data } : m)));
    // إعادة احتساب تلقائية للوصفات المتأثرة عند تغيّر أي حقل سعري يؤثر على التكلفة
    const priceFields: (keyof RawMaterial)[] = ['standardPrice', 'purchaseUnitPrice', 'purchaseUnitConversion', 'tradeUomConversion', 'tradeUomId', 'tradeUomName', 'yieldPercentage'];
    if (priceFields.some((f) => data[f] !== undefined)) {
      refreshRecipesCosts(grnNotes, rawMaterials.map((m) => (m.id === id ? { ...m, ...data } : m)), [id], 'تعديل سعر مادة خام');
    }
    // نشر إعادة التسمية تلقائياً على كل السجلات المخزنة في النظام
    if (data.nameAr) {
      const nm = data.nameAr;
      setPurchaseOrders((prev) => prev.map((p) => ({ ...p, items: p.items.map((it) => (it.rawMaterialId === id && it.materialName !== nm ? { ...it, materialName: nm } : it)) })));
      setSupplierReturns((prev) => prev.map((r) => ({ ...r, items: r.items.map((it) => (it.rawMaterialId === id && it.itemName !== nm ? { ...it, itemName: nm } : it)) })));
      setMonthlyInventory((prev) => prev.map((p) => ({ ...p, items: p.items.map((it) => (it.rawMaterialId === id && it.itemName !== nm ? { ...it, itemName: nm } : it)) })));
      setDailyCounts((prev) => prev.map((c) => ({ ...c, items: c.items.map((it) => (it.rawMaterialId === id && it.itemName !== nm ? { ...it, itemName: nm } : it)) })));
      setStockTransfers((prev) => prev.map((t) => ({ ...t, items: t.items.map((it) => (it.rawMaterialId === id ? { ...it, ...(it.itemName !== nm ? { itemName: nm } : {}), ...(it.materialName && it.materialName !== nm ? { materialName: nm as string } : {}) } : it)) })));
      setProductionRuns((prev) => prev.map((p) => ({ ...p, items: p.items.map((it) => (it.rawMaterialId === id && it.materialName !== nm ? { ...it, materialName: nm } : it)) })));
      setRequisitions((prev) => prev.map((r) => ({ ...r, items: r.items.map((it) => (it.rawMaterialId === id && it.itemName !== nm ? { ...it, itemName: nm } : it)) })));
      setWastageLogs((prev) => prev.map((w) => (w.rawMaterialId === id && w.itemName !== nm ? { ...w, itemName: nm } : w)));
    }
  };

  const deleteRawMaterial = (id: string): { ok: boolean; error?: string } => {
    const usedInRecipe = recipes.some((r) => r.ingredients.some((ing) => ing.rawMaterialId === id));
    const hasStock = inventory.some((i) => i.rawMaterialId === id);
    const hasReceipt = grnNotes.some((g) => g.items.some((i) => i.rawMaterialId === id));
    const hasWastage = wastageLogs.some((w) => w.rawMaterialId === id);
    const hasTransfers = stockTransfers.some((t) => t.items.some((i) => i.rawMaterialId === id));
    const hasProduction = productionRuns.some((p) => p.items.some((i) => i.rawMaterialId === id));
    const hasDailyCount = dailyCounts.some((d) => d.items.some((i) => i.rawMaterialId === id));
    const hasOpeningBalance = openingBalances.some((ob) => ob.items.some((i) => i.rawMaterialId === id));
    const hasPhysicalCount = physicalCounts.some((pc) => pc.items.some((i) => i.rawMaterialId === id));
    const hasReq = requisitions.some((rq) => rq.items.some((i) => i.rawMaterialId === id));
    const hasPO = purchaseOrders.some((po) => po.items.some((i) => i.rawMaterialId === id));
    const hasSO = supplierReturns.some((sr) => sr.items.some((i) => i.rawMaterialId === id));
    const hasMovement = hasWastage || hasTransfers || hasProduction || hasDailyCount || hasOpeningBalance || hasPhysicalCount || hasReq || hasPO || hasSO;
    if (usedInRecipe) return { ok: false, error: 'لا يمكن الحذف — المادة مستخدمة في وصفة معيارية. أوقفها بدلاً من ذلك.' };
    if (hasStock || hasReceipt || hasMovement) return { ok: false, error: 'لا يمكن الحذف — توجد حركات مخزون (استلامات، تحويلات، هالك، إنتاج، جرد، فواتير، أوامر شراء/إرجاع) لهذه المادة. أوقفها بدلاً من ذلك.' };
    pushSnap('حذف مادة خام');
    tombstoneIds([id]);
    setRawMaterials((prev) => prev.filter((m) => m.id !== id));
    setMaterialBarcodes((prev) => prev.filter((b) => b.rawMaterialId !== id));
    logAudit('حذف مادة خام', 'المخزون', id);
    return { ok: true };
  };

  // ---- (كبسولة الوحدات والباركود استُخرجت إلى useUnitsAndBarcodes.ts) ----

  const importRawMaterials = (records: Record<string, unknown>[]): { added: number; updated: number } => {
    let added = 0, updated = 0;
    {
      const next = [...rawMaterials];
      records.forEach((rec) => {
        const nameAr = String(rec.nameAr || rec.name || '').trim();
        if (!nameAr) return;
        const code = String(rec.code || '').trim();
        const exists = next.find((m) => m.code === code || m.nameAr === nameAr);
        const base: Omit<RawMaterial, 'id' | 'code'> = {
          nameAr,
          nameEn: String(rec.nameEn || rec.name_en || ''),
          category: (['meat_poultry', 'seafood', 'vegetables_fruits', 'dairy_eggs', 'dry_goods', 'oils_sauces', 'packaging', 'beverages'] as MaterialCategory[]).includes(rec.category as MaterialCategory)
            ? rec.category as MaterialCategory : 'dry_goods',
          unit: String(rec.unit || 'كغم'),
          standardPrice: parseNum(rec.standardPrice ?? rec.price ?? rec.cost),
          minStockLevel: parseNum(rec.minStockLevel ?? rec.min_stock),
          maxStockLevel: parseNum(rec.maxStockLevel ?? rec.max_stock) || parseNum(rec.minStockLevel ?? rec.min_stock) * 2,
          yieldPercentage: parseNum(rec.yieldPercentage ?? rec.yield) || 100,
          supplierId: String(rec.supplierId ?? rec.supplier ?? ''),
          storageType: (rec.storageType === 'frozen' || rec.storageType === 'chilled' || rec.storageType === 'dry') ? rec.storageType as RawMaterial['storageType'] : 'dry',
          isActive: !(rec.isActive === false || String(rec.isActive).toLowerCase() === 'false' || String(rec.isActive).toLowerCase() === 'no'),
        };
        if (exists) { Object.assign(exists, base); updated++; }
        else {
          next.push({ ...base, id: `rm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, code: code || `RM-${Math.floor(100 + Math.random() * 900)}` });
          added++;
        }
      });
      setRawMaterials(next);
      if (added > 0 || updated > 0) refreshRecipesCosts(grnNotes, next, [], 'استيراد أصناف من Excel');
    }
    logAudit('استيراد أصناف من Excel', 'المخزون', `${records.length} صف`);
    return { added, updated };
  };

  const importSuppliers = (records: Record<string, unknown>[]): { added: number; updated: number } => {
    let added = 0, updated = 0;
    setSuppliers((prev) => {
      const next = [...prev];
      records.forEach((rec) => {
        const name = String(rec.name || rec.nameAr || '').trim();
        if (!name) return;
        const code = String(rec.code || '').trim();
        const exists = next.find((s) => s.code === code || s.name === name);
        const cats = String(rec.categories || '').split(/[,،]/).map((c) => c.trim()).filter(Boolean);
        const base: Omit<Supplier, 'id' | 'code'> = {
          name,
          contactPerson: String(rec.contactPerson || rec.contact || ''),
          phone: String(rec.phone || rec.mobile || ''),
          email: String(rec.email || ''),
          rating: Math.max(1, Math.min(5, Math.round(parseNum(rec.rating) || 3))),
          paymentTermsDays: parseNum(rec.paymentTermsDays ?? rec.payment_terms) || 30,
          categories: (cats as MaterialCategory[]).filter((c) => ['meat_poultry', 'seafood', 'vegetables_fruits', 'dairy_eggs', 'dry_goods', 'oils_sauces', 'packaging', 'beverages'].includes(c)),
          isActive: !(rec.isActive === false || String(rec.isActive).toLowerCase() === 'false'),
          notes: String(rec.notes || ''),
        };
        if (exists) { Object.assign(exists, base); updated++; }
        else { next.push({ ...base, id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, code: code || `SUP-${Math.floor(100 + Math.random() * 900)}` }); added++; }
      });
      return next;
    });
    logAudit('استيراد موردين من Excel', 'الموردون', `${records.length} صف`);
    return { added, updated };
  };

  const importCustomers = (records: Record<string, unknown>[]): { added: number; updated: number } => {
    let added = 0, updated = 0;
    setCustomers((prev) => {
      const next = [...prev];
      records.forEach((rec) => {
        const name = String(rec.name || '').trim();
        if (!name) return;
        const code = String(rec.code || '').trim();
        const exists = next.find((c) => c.code === code || (c.name === name && c.phone === String(rec.phone || '')));
        const base: Omit<Customer, 'id' | 'code'> = {
          name,
          phone: String(rec.phone || ''),
          email: String(rec.email || ''),
          type: (rec.type === 'corporate' || rec.type === 'loyalty') ? rec.type as Customer['type'] : 'individual',
          city: String(rec.city || ''),
          branchId: String(rec.branchId || 'b-01'),
          joinDate: String(rec.joinDate || new Date().toISOString().split('T')[0]),
          totalSpent: parseNum(rec.totalSpent ?? rec.spent),
          visits: parseNum(rec.visits),
          lastVisit: String(rec.lastVisit || ''),
          notes: String(rec.notes || ''),
          isVip: rec.isVip === true || String(rec.isVip).toLowerCase() === 'true' || String(rec.isVip).toLowerCase() === 'نعم',
        };
        if (exists) { Object.assign(exists, base); updated++; }
        else { next.push({ ...base, id: `cus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, code: code || `C-${Math.floor(1000 + Math.random() * 9000)}` }); added++; }
      });
      return next;
    });
    logAudit('استيراد عملاء من Excel', 'العملاء', `${records.length} صف`);
    return { added, updated };
  };

  const addRecipe = (data: Omit<StandardRecipe, 'id' | 'code' | 'totalCalculatedCost' | 'suggestedPrice'>) => {
    pushSnap('إضافة وصفة');
    const costs = calculateRecipeCosts(data.ingredients, data.directLaborCost, data.packagingCost, data.subPrepIngredients, data.yieldPieces);
    const newRecipe: StandardRecipe = {
      ...data, id: `rec-${Date.now()}`, code: `RCP-${data.category.toUpperCase().slice(0, 3)}-${Math.floor(100 + Math.random() * 900)}`,
      totalCalculatedCost: costs.totalCost, suggestedPrice: costs.suggestedPrice,
      costHistory: [{ id: `rch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date().toISOString(), oldTotalCost: 0, newTotalCost: costs.totalCost, oldSuggestedPrice: 0, newSuggestedPrice: costs.suggestedPrice, reason: 'إنشاء الوصفة' }],
    };
    setRecipes((prev) => [newRecipe, ...prev]);
    logAudit('إضافة وصفة', 'الوصفات', data.nameAr, { type: 'recipe', id: newRecipe.id });
  };
  // تحديث أقسام تصنيف معيّن (إضافة/إعادة تسمية/حذف أسماء أقسام مخصصة) — تُحفظ وتُستخدم كاقتراحات
  const updateRecipeSections = (category: string, sections: string[]) => {
    setRecipeSections((prev) => ({ ...prev, [category]: sections.filter((s) => s.trim()).map((s) => s.trim()) }));
  };
  const updateRecipe = (id: string, data: Partial<StandardRecipe>) => {
    pushSnap('تعديل وصفة');
    setRecipes((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const merged = { ...r, ...data };
      const costs = calculateRecipeCosts(merged.ingredients, merged.directLaborCost, merged.packagingCost, merged.subPrepIngredients, merged.yieldPieces);
      const oldCost = Number(r.totalCalculatedCost ?? 0);
      if (Math.abs(costs.totalCost - oldCost) < 0.005) return { ...merged, totalCalculatedCost: costs.totalCost, suggestedPrice: costs.suggestedPrice };
      const entry: RecipeCostHistoryEntry = {
        id: `rch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        oldTotalCost: oldCost,
        newTotalCost: costs.totalCost,
        oldSuggestedPrice: Number(r.suggestedPrice ?? 0),
        newSuggestedPrice: costs.suggestedPrice,
        reason: 'تعديل الوصفة',
      };
      return { ...merged, totalCalculatedCost: costs.totalCost, suggestedPrice: costs.suggestedPrice, costHistory: [...(r.costHistory || []), entry] };
    }));
    // نشر إعادة التسمية تلقائياً على كل السجلات المخزنة في النظام
    if (data.nameAr) {
      const nm = data.nameAr;
      setWorkOrders((prev) => prev.map((w) => (w.recipeId === id && w.recipeName !== nm ? { ...w, recipeName: nm } : w)));
      setPosOrders((prev) => prev.map((o) => ({ ...o, items: o.items.map((it) => (it.recipeId === id && it.recipeName !== nm ? { ...it, recipeName: nm } : it)) })));
      setPosReturns((prev) => prev.map((o) => ({ ...o, items: o.items.map((it) => (it.recipeId === id && it.recipeName !== nm ? { ...it, recipeName: nm } : it)) })));
      setProductionRuns((prev) => prev.map((p) => (p.recipeId === id && p.recipeName !== nm ? { ...p, recipeName: nm } : p)));
      setDeliverySales((prev) => prev.map((s) => ({ ...s, items: s.items.map((it) => (it.recipeId === id && it.recipeNameAr !== nm ? { ...it, recipeNameAr: nm } : it)) })));
      setBatchSalesRecords((prev) => prev.map((b) => ({ ...b, items: b.items.map((it) => (it.recipeId === id && it.recipeNameAr !== nm ? { ...it, recipeNameAr: nm } : it)) })));
      setWastageLogs((prev) => prev.map((w) => (w.recipeId === id && !w.rawMaterialId && w.itemName !== nm ? { ...w, itemName: nm } : w)));
    }
    logAudit('تعديل وصفة', 'الوصفات', data.nameAr || id, { type: 'recipe', id });
  };

  const deleteRecipe = (id: string) => {
    pushSnap('حذف وصفة');
    tombstoneIds([id]);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    logAudit('حذف وصفة', 'الوصفات', id, { type: 'recipe', id });
  };

  const addGoodsReceiptNote = (data: Omit<GoodsReceiptNote, 'id' | 'grnNumber'>) => {
    if (isDateClosed(data.date || new Date().toISOString())) { showToast('شهر مقفل — لا يمكن تسجيل إشعار استلام في شهر مغلق'); return; }
    const newGrn: GoodsReceiptNote = {
      ...data, id: `grn-${Date.now()}`,
      grnNumber: nextDocSequence('GRN', { existing: grnNotes.map((g) => g.grnNumber) }),
    };
    setGrnNotes((prev) => [newGrn, ...prev]);
    if (newGrn.status === 'approved') {
      newGrn.items.forEach((item) => adjustInventory(newGrn.branchId, item.rawMaterialId, item.quantityReceived, { batchNumber: item.batchNumber, expiryDate: item.expiryDate }, { type: 'استلام مشتريات', ref: newGrn.id }));
      addInventoryBatches(newGrn.id, newGrn.branchId, newGrn.items);
      const netAmount = newGrn.totalAmount - (newGrn.vatAmount || 0);
      const entries = [{ accountId: 'acc-inv', debit: netAmount, credit: 0 }, { accountId: 'acc-ap', debit: 0, credit: newGrn.totalAmount }];
      if ((newGrn.vatAmount || 0) > 0) entries.splice(1, 0, { accountId: 'acc-vat', debit: newGrn.vatAmount as number, credit: 0 });
      postEntry(`استلام بضاعة ${newGrn.grnNumber} - ${newGrn.supplierName}`, entries, 'auto', newGrn.grnNumber);
      if (newGrn.purchaseOrderId) recordPurchaseReceipt(newGrn.purchaseOrderId, newGrn.items.map((it) => ({ rawMaterialId: it.rawMaterialId, quantity: it.quantityReceived })));
      refreshRecipesCosts([newGrn, ...grnNotes], rawMaterials, Array.from(new Set(newGrn.items.map((i) => i.rawMaterialId))), 'إضافة إشعار استلام معتمد (GRN)');
    }
    logAudit('إضافة إشعار استلام', 'GRN', newGrn.grnNumber, { type: 'grn', id: newGrn.id });
  };

  const updateGoodsReceiptNote = (id: string, data: Partial<GoodsReceiptNote>) => setGrnNotes((prev) => prev.map((g) => (g.id === id ? { ...g, ...data } : g)));

  const updateGRNStatus = (id: string, status: GoodsReceiptNote['status']) => {
    const target = grnNotes.find((g) => g.id === id);
    if (status === 'approved' && target && target.status !== 'approved' && isDateClosed(target.date)) { showToast('شهر مقفل — لا يمكن اعتماد إشعار استلام في شهر مغلق'); return; }
    setGrnNotes((prev) => prev.map((g) => {
      if (g.id !== id) return g;
      if (status === 'approved' && g.status !== 'approved') {
        g.items.forEach((item) => adjustInventory(g.branchId, item.rawMaterialId, item.quantityReceived, { batchNumber: item.batchNumber, expiryDate: item.expiryDate }, { type: 'استقبال استلام', ref: g.id }));
        addInventoryBatches(g.id, g.branchId, g.items);
        const netAmount = g.totalAmount - (g.vatAmount || 0);
        const entries = [{ accountId: 'acc-inv', debit: netAmount, credit: 0 }, { accountId: 'acc-ap', debit: 0, credit: g.totalAmount }];
        if ((g.vatAmount || 0) > 0) entries.splice(1, 0, { accountId: 'acc-vat', debit: g.vatAmount as number, credit: 0 });
        postEntry(`استلام بضاعة ${g.grnNumber} - ${g.supplierName}`, entries, 'auto', g.grnNumber);
        if (g.purchaseOrderId) recordPurchaseReceipt(g.purchaseOrderId, g.items.map((it) => ({ rawMaterialId: it.rawMaterialId, quantity: it.quantityReceived })));
      }
      return { ...g, status };
    }));
    if (status === 'approved' && target) {
      refreshRecipesCosts(
        grnNotes.map((g) => (g.id === id ? { ...g, status } : g)),
        rawMaterials,
        Array.from(new Set(target.items.map((i) => i.rawMaterialId))),
        'اعتماد إشعار استلام (GRN)',
      );
    }
    logAudit('تحديث حالة GRN', 'GRN', `إلى ${status}`, { type: 'grn', id });
  };

  const revertGoodsReceiptToDraft = (id: string) => {
    const g = grnNotes.find((x) => x.id === id);
    if (!g) return 0;
    if (g.status !== 'approved' && g.status !== 'submitted') return 0;
    let movements = 0;
    if (g.status === 'approved') {
      g.items.forEach((item) => adjustInventory(g.branchId, item.rawMaterialId, -item.quantityReceived));
      setInventoryBatches((prev) => prev.filter((b) => b.grnId !== id));
      movements = g.items.length;
      const netAmount = Number((g.totalAmount - (g.vatAmount || 0)).toFixed(2));
      const entries = [{ accountId: 'acc-ap', debit: g.totalAmount, credit: 0 }, { accountId: 'acc-inv', debit: 0, credit: netAmount }];
      if ((g.vatAmount || 0) > 0) entries.splice(1, 0, { accountId: 'acc-vat', debit: 0, credit: g.vatAmount as number });
      postEntry(`إلغاء استلام ${g.grnNumber} - ${g.supplierName}`, entries, 'auto', g.grnNumber);
    }
    setGrnNotes((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'draft' as const } : x)));
    if (g.status === 'approved') {
      refreshRecipesCosts(grnNotes.map((x) => (x.id === id ? { ...x, status: 'draft' as const } : x)), rawMaterials, Array.from(new Set(g.items.map((i) => i.rawMaterialId))), 'إلغاء اعتماد إشعار استلام (GRN)');
    }
    if (g.purchaseOrderId) {
      setPurchaseOrders((prev) => prev.map((p) => p.id === g.purchaseOrderId ? { ...p, items: p.items.map((it) => {
        const rec = g.items.find((x) => x.rawMaterialId === it.rawMaterialId);
        return rec ? { ...it, receivedQty: Math.max(0, (it.receivedQty || 0) - rec.quantityReceived) } : it;
      }) } : p));
    }
    logAudit('إرجاع GRN لمسودة', 'GRN', `${g.grnNumber} — ${g.supplierName}`, { type: 'grn', id: g.id });
    return movements;
  };

  const addPurchaseOrder = (data: Omit<PurchaseOrder, 'id' | 'poNumber'>) => {
    const newPO: PurchaseOrder = { ...data, id: `po-${Date.now()}`, poNumber: nextDocSequence('PO', { existing: purchaseOrders.map((p) => p.poNumber) }) };
    setPurchaseOrders((prev) => [newPO, ...prev]);
    logAudit('إضافة أمر شراء', 'المشتريات', data.supplierName, { type: 'po', id: newPO.id });
  };
  const updatePurchaseOrder = (id: string, data: Partial<PurchaseOrder>) => setPurchaseOrders((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));

  // ═══════════════ طلبات الشراء ═══════════════
  const addPurchaseRequest = (r: Omit<PurchaseRequest, 'id' | 'requestNumber' | 'createdAt'>): PurchaseRequest => {
    const rec: PurchaseRequest = {
      ...r,
      id: `pr-${Date.now()}`,
      requestNumber: nextDocSequence('PR', { existing: purchaseRequests.map((r) => r.requestNumber) }),
      createdAt: new Date().toISOString(),
    };
    setPurchaseRequests((prev) => [rec, ...prev]);
    logAudit('إضافة طلب شراء', 'المشتريات', `${rec.requestNumber} — فرع ${rec.branchName} (${rec.items.length} صنف)`, { type: 'purchaseRequest', id: rec.id });
    return rec;
  };
  const updatePurchaseRequest = (id: string, data: Partial<PurchaseRequest>) =>
    setPurchaseRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)));
  const deletePurchaseRequest = (id: string) => {
    setPurchaseRequests((prev) => prev.filter((r) => r.id !== id));
    logAudit('حذف طلب شراء', 'المشتريات', id, { type: 'purchaseRequest', id });
  };
  const convertRequestToPOs = (requestId: string): { ok: boolean; count: number; poIds: string[]; error?: string } => {
    const request = purchaseRequests.find((r) => r.id === requestId);
    if (!request) return { ok: false, count: 0, poIds: [], error: 'الطلب غير موجود' };
    if (request.status === 'converted') return { ok: false, count: 0, poIds: [], error: 'تم تحويل هذا الطلب مسبقاً' };
    if (request.items.length === 0) return { ok: false, count: 0, poIds: [], error: 'الطلب لا يحتوي على بنود' };

    const groups = buildPreliminaryPOs({ requestItems: request.items });
    const cy = new Date().getFullYear();
    let poMax = 0;
    purchaseOrders.forEach((p) => {
      const m = String(p.poNumber).match(new RegExp(`^PO-${cy}-(\\d+)$`));
      if (m) poMax = Math.max(poMax, parseInt(m[1], 10));
    });
    const poRows = groups.map((g, idx) => ({
      id: `po-${Date.now()}-${idx}`,
      poNumber: `PO-${cy}-${String(poMax + idx + 1).padStart(4, '0')}`,
      supplierId: g.supplierId,
      supplierName: g.supplierName,
      branchId: request.branchId,
      orderDate: today(),
      expectedDate: today(),
      status: 'submitted' as const,
      poType: 'preliminary' as const,
      sourceRequestId: request.id,
      items: g.items,
      totalAmount: g.items.reduce((s, i) => s + i.lineTotal, 0),
      requestedBy: request.createdBy,
      notes: `أمر توريد مبدئي من طلب شراء ${request.requestNumber} — فرع ${request.branchName} (سعر = أقل سعر خلال 30 يوم)`,
    }));
    if (poRows.length === 0) return { ok: false, count: 0, poIds: [], error: 'لا توجد بنود قابلة للتحويل' };

    setPurchaseOrders((prev) => [...poRows, ...prev]);
    const poIds = poRows.map((p) => p.id);
    setPurchaseRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: 'converted' as const, convertedToPOs: poIds } : r)),
    );
    logAudit('تحويل طلب شراء إلى أوامر توريد مبدئية', 'المشتريات', `${request.requestNumber} → ${poRows.length} أمر (${poRows.reduce((s, p) => s + p.totalAmount, 0).toFixed(2)})`);
    return { ok: true, count: poRows.length, poIds };
  };

  const receivePurchaseOrder = (id: string) => {
    const po = purchaseOrders.find((p) => p.id === id);
    if (!po) return;
    if (isDateClosed(po.orderDate)) { showToast('شهر مقفل — لا يمكن استلام أمر شراء في شهر مغلق'); return; }
    const remaining = po.items.filter((it) => (it.receivedQty || 0) < it.quantity);
    if (remaining.length === 0) { showToast('تم استلام هذا الأمر بالكامل بالفعل'); return; }
    setPurchaseOrders((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      return { ...p, status: 'received' as const, items: p.items.map((it) => ({ ...it, receivedQty: it.quantity })) };
    }));
    remaining.forEach((item) => adjustInventory(po.branchId, item.rawMaterialId, item.quantity - (item.receivedQty || 0)));
    const total = remaining.reduce((s, i) => s + (i.quantity - (i.receivedQty || 0)) * i.unitPrice, 0);
    if (total > 0) {
      postEntry(`استلام أمر شراء ${po.poNumber} - ${getBranchName(po.branchId)}`, [
        { accountId: 'acc-inv', debit: total, credit: 0 },
        { accountId: 'acc-ap', debit: 0, credit: total },
      ], 'auto', po.poNumber);
    }
    logAudit('استلام أمر شراء', 'المشتريات', po.poNumber, { type: 'po', id: po.id });
  };

  const recordPurchaseReceipt = (id: string, itemsReceived: { rawMaterialId: string; quantity: number }[]) => {
    const po = purchaseOrders.find((p) => p.id === id);
    if (!po) return;
    if (isDateClosed(po.orderDate)) { showToast('شهر مقفل — لا يمكن تسجيل استلام في شهر مغلق'); return; }
    setPurchaseOrders((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const items = p.items.map((it) => {
        const rec = itemsReceived.find((x) => x.rawMaterialId === it.rawMaterialId);
        return rec ? { ...it, receivedQty: (it.receivedQty || 0) + rec.quantity } : it;
      });
      const allReceived = items.every((it) => (it.receivedQty || 0) >= it.quantity);
      return { ...p, items, status: allReceived ? 'received' as const : 'partially_received' as const };
    }));
    logAudit('تسجيل استلام (جزئي/كامل)', 'المشتريات', id, { type: 'po', id });
  };

  const addSupplierQuote = (data: Omit<SupplierQuote, 'id'>) => {
    setSupplierQuotes((prev) => [{ ...data, id: `quote-${Date.now()}` }, ...prev]);
    logAudit('إضافة عرض سعر مورد', 'المشتريات', data.supplierId);
  };
  const updateSupplierQuote = (id: string, data: Partial<SupplierQuote>) =>
    setSupplierQuotes((prev) => prev.map((q) => {
      if (q.id !== id) return q;
      // سجل إصدارات الأسعار (بند 56): نلتقط النسخة الحالية قبل استبدالها
      const hist = Array.isArray(q.history) ? q.history : [];
      const version: SupplierQuoteVersion = {
        price: q.price,
        validFrom: q.validFrom,
        validTo: q.validTo,
        currencyCode: q.currencyCode,
        changedAt: new Date().toISOString(),
        changedBy: currentUser?.name || '—',
      };
      return { ...q, ...data, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name || '—', history: [...hist, version].slice(-50) };
    }));
  const deleteSupplierQuote = (id: string) => setSupplierQuotes((prev) => prev.filter((q) => q.id !== id));
  const getQuotePrice = (supplierId: string, rawMaterialId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const q = supplierQuotes
      .filter((x) => x.supplierId === supplierId && x.rawMaterialId === rawMaterialId && (!x.validTo || x.validTo >= today))
      .sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''))[0];
    return q?.price;
  };

  const addSupplierReturn = (data: Omit<SupplierReturn, 'id' | 'returnNumber'>) => {
    if (isDateClosed(data.date || new Date().toISOString())) { showToast('شهر مقفل — لا يمكن إنشاء مذكرة إرجاع في شهر مغلق'); return; }
    const newReturn: SupplierReturn = { ...data, id: `sr-${Date.now()}`, returnNumber: nextDocSequence('RET', { existing: supplierReturns.map((r) => r.returnNumber) }) };
    setSupplierReturns((prev) => [newReturn, ...prev]);
    logAudit('إنشاء مذكرة إرجاع مورد', 'المشتريات', data.supplierName, { type: 'supplierReturn', id: newReturn.id });
  };
  const updateSupplierReturn = (id: string, data: Partial<SupplierReturn>) => setSupplierReturns((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)));
  const approveSupplierReturn = (id: string) => {
    const r0 = supplierReturns.find((r) => r.id === id);
    if (!r0) return;
    if (isDateClosed(r0.date)) { showToast('شهر مقفل — لا يمكن اعتماد إرجاع في شهر مغلق'); return; }
    const warnings: string[] = [];
    r0.items.forEach((item) => {
      const inv = inventory.find((i) => i.branchId === r0.branchId && i.rawMaterialId === item.rawMaterialId);
      const currentQty = inv?.quantity || 0;
      if (currentQty < item.quantity) {
        const mat = rawMaterials.find((m) => m.id === item.rawMaterialId);
        warnings.push(`${mat?.nameAr || item.rawMaterialId}: الرصيد ${currentQty}، الكمية المرتجعة ${item.quantity} — سيصبح الرصيد سالباً`);
      }
    });
    if (warnings.length > 0) {
      showToast('تنبيه: ' + warnings.join(' | '));
    }
    setSupplierReturns((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (r.status !== 'approved') {
        r.items.forEach((item) => adjustInventory(r.branchId, item.rawMaterialId, -item.quantity));
        postEntry(`إرجاع بضاعة للمورد ${r.supplierName}`, [
          { accountId: 'acc-ap', debit: r.totalAmount, credit: 0 },
          { accountId: 'acc-inv', debit: 0, credit: r.totalAmount },
        ], 'auto', r.returnNumber);
      }
      return { ...r, status: 'approved' as const, approvedBy: currentUser?.name || 'النظام' };
    }));
    logAudit('اعتماد مذكرة إرجاع', 'المشتريات', id, { type: 'supplierReturn', id });
  };

  const getReturnedQtyForGrn = (grnId: string, rawMaterialId: string) =>
    supplierReturns
      .filter((r) => r.sourceGrnId === grnId && r.status === 'approved')
      .reduce((s, r) => s + r.items.filter((i) => i.rawMaterialId === rawMaterialId).reduce((si, i) => si + i.quantity, 0), 0);

  const reprocessSupplierReturn = (id: string) => {
    const r0 = supplierReturns.find((r) => r.id === id);
    if (!r0 || r0.status !== 'approved') return;
    // عكس ثم إعادة تطبيق (idempotent): إن كان قد طُبّق فعلاً فالناتج صفر، وإن لم يُطبّق فيُطبق مرة واحدة.
    r0.items.forEach((item) => adjustInventory(r0.branchId, item.rawMaterialId, item.quantity));
    postEntry(`عكس إعادة ترحيل ${r0.returnNumber}`, [
      { accountId: 'acc-inv', debit: r0.totalAmount, credit: 0 },
      { accountId: 'acc-ap', debit: 0, credit: r0.totalAmount },
    ], 'auto', r0.returnNumber);
    r0.items.forEach((item) => adjustInventory(r0.branchId, item.rawMaterialId, -item.quantity));
    postEntry(`إرجاع بضاعة للمورد ${r0.supplierName} (إعادة ترحيل)`, [
      { accountId: 'acc-ap', debit: r0.totalAmount, credit: 0 },
      { accountId: 'acc-inv', debit: 0, credit: r0.totalAmount },
    ], 'auto', r0.returnNumber);
    logAudit('إعادة ترحيل مذكرة إرجاع', 'المشتريات', id, { type: 'supplierReturn', id });
    showToast('تمت إعادة ترحيل الإرجاع وإنشاء حركات المخزون (متوازنة)');
  };

  const reprocessAllApprovedReturns = () => {
    const approved = supplierReturns.filter((r) => r.status === 'approved');
    let count = 0;
    approved.forEach((r) => {
      r.items.forEach((item) => adjustInventory(r.branchId, item.rawMaterialId, item.quantity));
      postEntry(`عكس إعادة ترحيل ${r.returnNumber}`, [
        { accountId: 'acc-inv', debit: r.totalAmount, credit: 0 },
        { accountId: 'acc-ap', debit: 0, credit: r.totalAmount },
      ], 'auto', r.returnNumber);
      r.items.forEach((item) => adjustInventory(r.branchId, item.rawMaterialId, -item.quantity));
      postEntry(`إرجاع بضاعة للمورد ${r.supplierName} (إعادة ترحيل)`, [
        { accountId: 'acc-ap', debit: r.totalAmount, credit: 0 },
        { accountId: 'acc-inv', debit: 0, credit: r.totalAmount },
      ], 'auto', r.returnNumber);
      count++;
    });
    logAudit('إعادة ترحيل جميع الإرجاعات المعتمدة', 'المشتريات', `${count} سجل`);
    showToast(`تمت إعادة ترحيل ${count} إرجاع معتمد`);
  };

  const revertSupplierReturnToDraft = (id: string) => {
    const r0 = supplierReturns.find((r) => r.id === id);
    if (!r0) return;
    if (r0.status !== 'approved' && r0.status !== 'submitted') { showToast('السجل مسودة بالفعل'); return; }
    if (r0.status === 'approved') {
      r0.items.forEach((item) => adjustInventory(r0.branchId, item.rawMaterialId, item.quantity));
      postEntry(`إلغاء إرجاع بضاعة للمورد ${r0.supplierName}`, [
        { accountId: 'acc-inv', debit: r0.totalAmount, credit: 0 },
        { accountId: 'acc-ap', debit: 0, credit: r0.totalAmount },
      ], 'auto', r0.returnNumber);
    }
    setSupplierReturns((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'draft' as const, approvedBy: undefined } : r)));
    logAudit('إرجاع مذكرة إرجاع لمسودة', 'المشتريات', `${r0.returnNumber} — ${r0.supplierName}`, { type: 'supplierReturn', id: r0.id });
    showToast(`أُعيد ${r0.returnNumber} لمسودة`);
  };

  const rebuildPLSummaries = (monthKey?: string) => {
    const nameOf = (id: string) => {
      if (id === 'b-ck') return 'المطبخ المركزي';
      return branches.find((b) => b.id === id)?.nameAr || id;
    };
    const rows = buildPLSummaries({
      posOrders: posOrders.map((o) => ({ branchId: o.branchId, date: o.date, subtotal: o.subtotal, totalCost: o.totalCost })),
      batchSales: batchSalesRecords.map((b) => ({ branchId: b.branchId, date: b.date, netRevenue: b.netRevenue ?? (b.vatAmount != null ? b.totalRevenue - b.vatAmount : netOfGross(b.totalRevenue, b.vatRate ?? vatPercent / 100)), totalFoodCost: b.totalFoodCost })),
      shifts,
      expenses: operatingExpenses,
      wastage: wastageLogs,
    }, nameOf, { monthKey });
    setPlSummaries(rows);
    logAudit('إعادة بناء قائمة الدخل الموحدة', 'المالية', `${rows.length} سطراً`);
  };

  const runSystemCheck = (ctx?: {
    recipes?: StandardRecipe[];
    inventory?: InventoryRecord[];
    grnNotes?: GoodsReceiptNote[];
    purchaseOrders?: PurchaseOrder[];
    posOrders?: POSOrder[];
    stockTransfers?: StockTransfer[];
    foodMenus?: FoodMenu[];
  }): SystemCheckResult[] => {
    const rc = ctx?.recipes ?? recipes;
    const inv = ctx?.inventory ?? inventory;
    const grn = ctx?.grnNotes ?? grnNotes;
    const po = ctx?.purchaseOrders ?? purchaseOrders;
    const pos = ctx?.posOrders ?? posOrders;
    const trf = ctx?.stockTransfers ?? stockTransfers;
    const menu = ctx?.foodMenus ?? foodMenus;
    const res: SystemCheckResult[] = [];
    const ok = (id: string, label: string, detail: string) => res.push({ id, label, status: 'ok', detail });
    const warn = (id: string, label: string, detail: string) => res.push({ id, label, status: 'warn', detail });
    const fail = (id: string, label: string, detail: string) => res.push({ id, label, status: 'fail', detail });
    const matIds = new Set(rawMaterials.map((m) => m.id));
    const recipeIds = new Set(rc.map((r) => r.id));
    const branchIds = new Set(branches.map((b) => b.id));
    const custIds = new Set(customers.map((c) => c.id));
    const supIds = new Set(suppliers.map((s) => s.id));

    let orphanIng = 0;
    rc.forEach((r) => r.ingredients.forEach((ing) => { if (!matIds.has(ing.rawMaterialId)) orphanIng++; }));
    orphanIng > 0 ? fail('ing', 'الوصفات ← المواد الخام', `${orphanIng} مكوناً يشير لخامة غير موجودة`) : ok('ing', 'الوصفات ← المواد الخام', `${rc.length} وصفة بمراجع سليمة`);

    const orphanInv = inv.filter((i) => !matIds.has(i.rawMaterialId));
    orphanInv.length > 0 ? fail('inv', 'سجلات المخزون', `${orphanInv.length} سجلاً بخامة غير موجودة`) : ok('inv', 'سجلات المخزون', `${inv.length} سجلاً سليماً`);

    const orphanGrn = grn.filter((g) => g.items.some((i) => !matIds.has(i.rawMaterialId))).length;
    orphanGrn > 0 ? warn('grn', 'إيصالات الاستلام (GRN)', `${orphanGrn} إيصالاً فيه أصناف مكسورة`) : ok('grn', 'إيصالات الاستلام (GRN)', `${grn.length} إيصالاً سليماً`);

    const orphanPo = po.filter((p) => p.items.some((i) => !matIds.has(i.rawMaterialId)) || (p.supplierId ? !supIds.has(p.supplierId) : false)).length;
    orphanPo > 0 ? warn('po', 'أوامر الشراء', `${orphanPo} أمراً بمرجع مكسور`) : ok('po', 'أوامر الشراء', `${po.length} أمراً سليماً`);

    const orphanPos = pos.filter((o) => o.items.some((i) => !recipeIds.has(i.recipeId))).length;
    orphanPos > 0 ? warn('pos', 'أوامر نقطة البيع', `${orphanPos} أمراً فيه أصناف مكسورة`) : ok('pos', 'أوامر نقطة البيع', `${pos.length} أمراً سليماً`);

    const orphanTrf = trf.filter((t) => t.items.some((i) => (i.itemType === 'recipe' ? !recipeIds.has(i.recipeId!) : (i.rawMaterialId ? !matIds.has(i.rawMaterialId) : true)))).length;
    orphanTrf > 0 ? warn('trf', 'تحويلات المخزون', `${orphanTrf} تحويلاً بمرجع مكسور`) : ok('trf', 'تحويلات المخزون', `${trf.length} تحويلاً سليماً`);

    const orphanWo = workOrders.filter((w) => !recipeIds.has(w.recipeId)).length;
    orphanWo > 0 ? warn('wo', 'أوامر التصنيع', `${orphanWo} أمراً لوصفة غير موجودة`) : ok('wo', 'أوامر التصنيع', `${workOrders.length} أمراً سليماً`);

    const orphanMenu = menu.filter((m) => m.items.some((i) => !recipeIds.has(i.recipeId))).length;
    orphanMenu > 0 ? warn('menu', 'قوائم الطعام', `${orphanMenu} قائمة فيها أصناف مكسورة`) : ok('menu', 'قوائم الطعام', `${menu.length} قائمة سليمة`);

    const badInv = invoices.filter((i) => (i.type === 'sales' ? !custIds.has(i.partyId) : !supIds.has(i.partyId))).length;
    badInv > 0 ? warn('inv9', 'الفواتير', `${badInv} فاتورة بمرجع عميل/مورد مكسور`) : ok('inv9', 'الفواتير', `${invoices.length} فاتورة سليمة`);

    const badRes = reservations.filter((r) => (r.customerId ? !custIds.has(r.customerId) : false) || (r.branchId ? !branchIds.has(r.branchId) : false)).length;
    badRes > 0 ? warn('res', 'الحجوزات', `${badRes} حجزاً بمرجع مكسور`) : ok('res', 'الحجوزات', `${reservations.length} حجزاً سليماً`);

    const badUser = users.filter((u) => u.branchId !== 'all' && !branchIds.has(u.branchId)).length;
    badUser > 0 ? warn('user', 'المستخدمون ← الفروع', `${badUser} مستخدماً بفرع غير موجود`) : ok('user', 'المستخدمون ← الفروع', `${users.length} مستخدماً سليماً`);

    const unbalanced = journalEntries.filter((j) => Math.abs(j.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)) > 0.01).length;
    unbalanced > 0 ? fail('jrn', 'توازن القيود المحاسبية', `${unbalanced} قيداً غير متوازن`) : ok('jrn', 'توازن القيود المحاسبية', `${journalEntries.length} قيداً متوازناً`);

    const overPaid = invoices.filter((i) => i.paidAmount > i.totalAmount).length;
    overPaid > 0 ? warn('pay', 'التحصيلات والمدفوعات', `${overPaid} فاتورة مدفوعة بأكثر من قيمتها`) : ok('pay', 'التحصيلات والمدفوعات', 'الدفعات ضمن حدود الفواتير');

    const posBad = pos.filter((o) => {
      const subtotal = o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const vat = vatInclusive ? 0 : Number(((subtotal * vatPercent) / 100).toFixed(2));
      return Math.abs(o.totalAmount - (subtotal + vat)) > 0.5;
    }).length;
    posBad > 0 ? warn('poscalc', 'احتساب فواتير نقطة البيع', `${posBad} أمراً لا يطابق مجموع أصنافه`) : ok('poscalc', 'احتساب فواتير نقطة البيع', 'جميع الأوامر محتسبة بصورة صحيحة');

    const negStock = inv.filter((i) => i.quantity < 0).length;
    negStock > 0 ? fail('neg', 'أرصدة المخزون السالبة', `${negStock} رصيداً سالباً`) : ok('neg', 'أرصدة المخزون السالبة', 'لا توجد أرصدة سالبة');

    const negRecipeStock = recipeInventory.filter((r) => r.quantity < 0).length;
    negRecipeStock > 0 ? warn('negr', 'مخزون الأصناف المصنّعة', `${negRecipeStock} رصيداً سالباً`) : ok('negr', 'مخزون الأصناف المصنّعة', 'لا توجد أرصدة سالبة');

    let badCost = 0;
    rc.forEach((r) => {
      const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      if (!isFinite(c.foodCost) || c.foodCost < 0) badCost++;
    });
    badCost > 0 ? fail('cost', 'محرك احتساب التكاليف', `${badCost} وصفة بتكلفة غير صحيحة`) : ok('cost', 'محرك احتساب التكاليف', 'يعمل على جميع الوصفات بدون أخطاء');

    const badCur = currencies.filter((c) => getCurrencyRate(c.code) <= 0).length;
    badCur > 0 ? warn('cur', 'أسعار الصرف', `${badCur} عملة بسعر صرف غير صالح`) : ok('cur', 'أسعار الصرف', `${currencies.length} عملة بسعر سليم`);

    const roles = [...new Set(users.map((u) => u.role))];
    const missingPerm = roles.filter((r) => !(ROLE_PERMISSIONS as Record<string, string[]>)[r]);
    missingPerm.length > 0 ? fail('perm', 'خريطة الصلاحيات', `${missingPerm.join('، ')} غير معرّفة`) : ok('perm', 'خريطة الصلاحيات', `${roles.length} دوراً معرّفاً`);

    let plOk = true;
    try {
      const nameOf = (id: string) => (id === 'b-ck' ? 'المطبخ المركزي' : branches.find((b) => b.id === id)?.nameAr || id);
      buildPLSummaries({
        posOrders,
        batchSales: batchSalesRecords.map((b) => ({
          branchId: b.branchId,
          date: b.date,
          netRevenue: b.netRevenue ?? b.totalRevenue / 1.15,
          totalFoodCost: b.totalFoodCost,
        })),
        shifts,
        expenses: operatingExpenses,
        wastage: wastageLogs,
      }, nameOf, { monthKey: undefined });
    } catch { plOk = false; }
    plOk ? ok('pl', 'محرك قائمة الدخل الموحدة', 'يعيد بناء التقارير لجميع الفروع بنجاح') : fail('pl', 'محرك قائمة الدخل الموحدة', 'حدث خطأ أثناء إعادة البناء');

    return res;
  };

  // صحة البيانات: نسبة اكتمال محسوبة مباشرة من الحالة الحالية (تُستخدم في بطاقة صحة البيانات بالضبط)
  const dataHealth = useMemo<DataHealthScore>(() => {
    const pct = (okCount: number, total: number) => (total > 0 ? Number(((okCount / total) * 100).toFixed(0)) : 100);

    const activeMats = rawMaterials.filter((m) => m.isActive);
    const matsWithCost = activeMats.filter((m) => getAverageUnitCost(m.id) > 0).length;
    const partMats = { label: 'المواد الخام (سعر تكلفة)', pct: pct(matsWithCost, activeMats.length), detail: `${matsWithCost.toLocaleString('en')} / ${activeMats.length.toLocaleString('en')} صنفاً له سعر تكلفة` };

    const activeRecipes = recipes.filter((r) => r.isActive);
    const completeRecipes = activeRecipes.filter((r) => (r.ingredients?.length || 0) > 0 && (r.actualMenuPrice > 0 || (r.suggestedPrice || 0) > 0)).length;
    const partRecipes = { label: 'الوصفات (مكونات + سعر)', pct: pct(completeRecipes, activeRecipes.length), detail: `${completeRecipes.toLocaleString('en')} / ${activeRecipes.length.toLocaleString('en')} وصفة بمقادير وسعر بيع` };

    const activeSuppliers = suppliers.filter((s) => s.isActive);
    const suppliersWithContact = activeSuppliers.filter((s) => !!(s.phone || s.email || s.contactPerson)).length;
    const partSuppliers = { label: 'الموردون (بيانات التواصل)', pct: pct(suppliersWithContact, activeSuppliers.length), detail: `${suppliersWithContact.toLocaleString('en')} / ${activeSuppliers.length.toLocaleString('en')} مورداً بمعلومات تواصل` };

    const roleMap = ROLE_PERMISSIONS as Record<string, string[]>;
    const activeUsers = users.filter((u) => u.isActive);
    const readyUsers = activeUsers.filter((u) => !!roleMap[u.role] || !!u.roleId).length;
    const partUsers = { label: 'المستخدمون (أدوار/صلاحيات)', pct: pct(readyUsers, activeUsers.length), detail: `${readyUsers.toLocaleString('en')} / ${activeUsers.length.toLocaleString('en')} مستخدماً نشطاً بدور محدّد` };

    const balancedEntries = journalEntries.filter((j) => Math.abs(j.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)) <= 0.01).length;
    const partLedger = { label: 'القيود المحاسبية (توازن)', pct: pct(balancedEntries, journalEntries.length), detail: `${balancedEntries.toLocaleString('en')} / ${journalEntries.length.toLocaleString('en')} قيداً متوازناً` };

    const matIds = new Set(rawMaterials.map((m) => m.id));
    const recipeIds = new Set(recipes.map((r) => r.id));
    const invBroken = inventory.filter((i) => !matIds.has(i.rawMaterialId)).length;
    const recBroken = recipes.filter((r) => r.ingredients.some((ing) => !matIds.has(ing.rawMaterialId))).length + recipeInventory.filter((r) => !recipeIds.has(r.recipeId)).length;
    const refTotal = inventory.length + recipes.length + recipeInventory.length;
    const refOk = refTotal - invBroken - recBroken;
    const partRefs = { label: 'المراجع التكاملية (لا أيتام)', pct: pct(refOk, refTotal), detail: invBroken || recBroken ? `${invBroken + recBroken} مرجعاً مكسوراً` : `لا توجد مراجع مكسورة في ${refTotal.toLocaleString('en')} سجل` };

    const parts = [partMats, partRecipes, partSuppliers, partUsers, partLedger, partRefs];
    const score = Math.round(parts.reduce((s, p) => s + p.pct, 0) / parts.length);
    const grade: DataHealthScore['grade'] = score >= 90 ? 'excellent' : score >= 70 ? 'good' : 'attention';
    return { score, grade, parts };
  }, [rawMaterials, recipes, suppliers, users, journalEntries, inventory, recipeInventory, getAverageUnitCost]);

  // ---- سجل تراجع/إعادة (Undo/Redo) لبيانات الأساسية (فروع، موردون، خامات، وحدات، وصفات) ----
  interface ModelSnapshot {
    recipes: StandardRecipe[];
    rawMaterials: RawMaterial[];
    suppliers: Supplier[];
    branches: Branch[];
    unitsOfMeasure: UnitOfMeasure[];
  }
  // (جذور captureSnap / pushSnap انتقلت لموقع مبكر قبل كبسولة الوحدات والباركود)
  const applySnap = (snap: ModelSnapshot) => {
    setRecipes(snap.recipes);
    setRawMaterials(snap.rawMaterials);
    setSuppliers(snap.suppliers);
    setBranches(snap.branches);
    setUnitsOfMeasure(snap.unitsOfMeasure);
  };
  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setRedoStack((prev) => [...prev.slice(-49), { snap: captureSnap(), label: last.label }]);
    setUndoStack((prev) => prev.slice(0, -1));
    applySnap(last.snap);
    logAudit('تراجع (Undo)', 'النظام', last.label);
  };
  const redo = () => {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setUndoStack((prev) => [...prev.slice(-49), { snap: captureSnap(), label: last.label }]);
    setRedoStack((prev) => prev.slice(0, -1));
    applySnap(last.snap);
    logAudit('إعادة (Redo)', 'النظام', last.label);
  };

  const rebuildSystem = (): SystemRebuildResult => {
    const fixes: string[] = [];
    const recalcs: string[] = [];
    const issues: string[] = [];
    const matIds = new Set(rawMaterials.map((m) => m.id));
    const recipeIds = new Set(recipes.map((r) => r.id));

    let removedInv = 0;
    const healedInv = inventory.filter((i) => { if (!matIds.has(i.rawMaterialId)) { removedInv++; return false; } return true; });
    setInventory(healedInv);
    if (removedInv > 0) fixes.push(`حُذف ${removedInv} سجل مخزون بخامة غير موجودة`);

    let removedGrn = 0;
    const healedGrn = grnNotes.map((g) => ({ ...g, items: g.items.filter((i) => { if (!matIds.has(i.rawMaterialId)) { removedGrn++; return false; } return true; }) })).filter((g) => g.items.length > 0);
    setGrnNotes(healedGrn);
    if (removedGrn > 0) fixes.push(`أُزيل ${removedGrn} سطراً مكسوراً من إيصالات الاستلام`);

    let removedPo = 0;
    const healedPo = purchaseOrders.map((p) => ({ ...p, items: p.items.filter((i) => { if (!matIds.has(i.rawMaterialId)) { removedPo++; return false; } return true; }) })).filter((p) => p.items.length > 0);
    setPurchaseOrders(healedPo);
    if (removedPo > 0) fixes.push(`أُزيل ${removedPo} سطراً مكسوراً من أوامر الشراء`);

    let removedPos = 0;
    const healedPos = posOrders.map((o) => ({ ...o, items: o.items.filter((i) => { if (!recipeIds.has(i.recipeId)) { removedPos++; return false; } return true; }) })).filter((o) => o.items.length > 0);
    setPosOrders(healedPos);
    if (removedPos > 0) fixes.push(`أُزيل ${removedPos} صنفاً مكسوراً من أوامر نقطة البيع`);

    let removedTrf = 0;
    const healedTrf = stockTransfers.map((t) => ({ ...t, items: t.items.filter((i) => { const bad = i.itemType === 'recipe' ? !recipeIds.has(i.recipeId!) : (i.rawMaterialId ? !matIds.has(i.rawMaterialId) : true); if (bad) removedTrf++; return !bad; }) })).filter((t) => t.items.length > 0);
    setStockTransfers(healedTrf);
    if (removedTrf > 0) fixes.push(`أُزيل ${removedTrf} سطراً مكسوراً من تحويلات المخزون`);

    let removedIng = 0;
    let recalcCount = 0;
    const healedRecipes = recipes.map((r) => {
      const ingredients = r.ingredients.filter((ing) => { if (!matIds.has(ing.rawMaterialId)) { removedIng++; return false; } return true; });
      const c = calculateRecipeCosts(ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      if (isFinite(c.foodCost)) {
        recalcCount++;
        const oldCost = Number(r.totalCalculatedCost ?? 0);
        if (Math.abs(c.totalCost - oldCost) < 0.005) return { ...r, ingredients, totalCalculatedCost: c.totalCost, suggestedPrice: c.suggestedPrice };
        const entry: RecipeCostHistoryEntry = {
          id: `rch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          oldTotalCost: oldCost,
          newTotalCost: c.totalCost,
          oldSuggestedPrice: Number(r.suggestedPrice ?? 0),
          newSuggestedPrice: c.suggestedPrice,
          reason: 'إصلاح النظام — إعادة احتساب',
        };
        return { ...r, ingredients, totalCalculatedCost: c.totalCost, suggestedPrice: c.suggestedPrice, costHistory: [...(r.costHistory || []), entry] };
      }
      return { ...r, ingredients };
    });
    setRecipes(healedRecipes);
    if (removedIng > 0) fixes.push(`أُزيل ${removedIng} مكوناً مكسوراً من الوصفات`);
    recalcs.push(`أُعيد احتساب تكاليف ${recalcCount} وصفة (خامات + تشغيل + سعر مقترح)`);

    let removedMenu = 0;
    const healedMenu = foodMenus.map((m) => ({ ...m, items: m.items.filter((i) => { if (!recipeIds.has(i.recipeId)) { removedMenu++; return false; } return true; }) }));
    setFoodMenus(healedMenu);
    if (removedMenu > 0) fixes.push(`أُزيل ${removedMenu} صنفاً مكسوراً من قوائم الطعام`);

    let clampedNeg = 0;
    const clampedInv = healedInv.map((i) => { if (i.quantity < 0) { clampedNeg++; return { ...i, quantity: 0 }; } return i; });
    if (clampedNeg > 0) { setInventory(clampedInv); fixes.push(`صُفّر ${clampedNeg} رصيد مخزون سالباً`); }

    rebuildPLSummaries(undefined);
    recalcs.push('أُعيد بناء قائمة الدخل الموحدة لجميع الفروع ونُشر سجل تدقيق');

    recalcs.push(`أُعيد التحقق من متوسط تكلفة ${rawMaterials.length} خامة وارتباطها بالأسعار المعيارية`);

    const checks = runSystemCheck({ recipes: healedRecipes, inventory: clampedNeg > 0 ? clampedInv : healedInv, grnNotes: healedGrn, purchaseOrders: healedPo, posOrders: healedPos, stockTransfers: healedTrf, foodMenus: healedMenu });
    const fails = checks.filter((c) => c.status === 'fail');
    const warns = checks.filter((c) => c.status === 'warn');
    if (fails.length === 0) recalcs.push(`نجح فحص التكامل الشامل: ${checks.length} فحصاً، ${warns.length} ملاحظة تستحق الانتباه`);
    else issues.push(`${fails.length} فحصاً فاشلاً بعد الهيكلة: ${fails.map((f) => f.label).join('، ')}`);

    logAudit('إعادة هيكلة النظام', 'النظام', `إصلاحات ${fixes.length}، إعادة احتساب ${recalcCount} وصفة، فحوصات ${checks.length}`);
    return { fixes, recalcs, issues };
  };

  const bootRebuilt = useRef(false);
  useEffect(() => {
    if (ready && !bootRebuilt.current) {
      bootRebuilt.current = true;
      rebuildPLSummaries(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ═══ ترقية: ترقيم تسلسلي منتظم لكل الادخالات الموجودة (مرة واحدة) ═══
  const docNumMigrationDone = useRef(loadState('rcerp_migration_docnum_v1', false));
  useEffect(() => {
    if (!ready || docNumMigrationDone.current) return;

    const year = new Date().getFullYear();
    const padN = (n: number) => String(n).padStart(4, '0');
    const numMap: Record<string, string> = {};

    const applySeq = <T extends { id: string }>(
      list: T[],
      setter: (next: T[]) => void,
      getNumber: (r: T) => string,
      setNumber: (r: T, num: string) => T,
      dateFields: (keyof T)[],
      prefix: string,
      segment?: (r: T) => string,
    ) => {
      const sorted = [...list].sort((a, b) => {
        for (const f of dateFields) {
          const va = String((a as unknown as Record<string, unknown>)[f as string] ?? '');
          const vb = String((b as unknown as Record<string, unknown>)[f as string] ?? '');
          if (va !== vb) return va < vb ? -1 : 1;
        }
        return a.id < b.id ? -1 : 1;
      });
      const counters = new Map<string, number>();
      const nextSeq = (seg: string) => {
        const n = (counters.get(seg) || 0) + 1;
        counters.set(seg, n);
        return `${prefix}${seg ? `-${seg}` : ''}-${year}-${padN(n)}`;
      };
      const result = sorted.map((r) => {
        const num = nextSeq(segment ? String(segment(r)).toUpperCase() : '');
        const old = getNumber(r);
        if (old && !numMap[old]) numMap[old] = num;
        return setNumber(r, num);
      });
      if (counters.size === 0) return;
      setter(result);
    };

    applySeq(grnNotes, setGrnNotes, (r) => r.grnNumber, (r, n) => ({ ...r, grnNumber: n }), ['date'], 'GRN');
    applySeq(purchaseOrders, setPurchaseOrders, (r) => r.poNumber, (r, n) => ({ ...r, poNumber: n }), ['orderDate', 'expectedDate'], 'PO');
    applySeq(purchaseRequests, setPurchaseRequests, (r) => r.requestNumber, (r, n) => ({ ...r, requestNumber: n }), ['date', 'createdAt'], 'PR');
    applySeq(supplierReturns, setSupplierReturns, (r) => r.returnNumber, (r, n) => ({ ...r, returnNumber: n }), ['date'], 'RET');
    applySeq(posReturns, setPosReturns, (r) => r.returnNumber, (r, n) => ({ ...r, returnNumber: n }), ['date'], 'RET');
    applySeq(workOrders, setWorkOrders, (r) => r.orderNumber, (r, n) => ({ ...r, orderNumber: n }), ['startDate', 'completionDate'], 'WO');
    applySeq(customerOrders, setCustomerOrders, (r) => r.orderNumber, (r, n) => ({ ...r, orderNumber: n }), ['createdAt'], 'ORD');
    applySeq(posOrders, setPosOrders, (r) => r.orderNumber, (r, n) => ({ ...r, orderNumber: n }), ['date'], 'POS', (r) => r.branchId);
    applySeq(dailyCounts, setDailyCounts, (r) => r.docNo || '', (r, n) => ({ ...r, docNo: n }), ['date', 'today'], 'DC');
    applySeq(operatingExpenses, setOperatingExpenses, (r) => r.expenseNumber, (r, n) => ({ ...r, expenseNumber: n }), ['createdAt', 'dueDate'], 'EXP');
    applySeq(reservations, setReservations, (r) => r.reservationNumber, (r, n) => ({ ...r, reservationNumber: n }), ['date', 'createdAt'], 'RES');
    applySeq(invoices, setInvoices, (r) => r.invoiceNumber, (r, n) => ({ ...r, invoiceNumber: n }), ['date', 'dueDate'], 'INV', (r) => (r.type === 'sales' ? 'SL' : 'PU'));
    applySeq(batchSalesRecords, setBatchSalesRecords, (r) => r.batchNumber, (r, n) => ({ ...r, batchNumber: n }), ['date'], 'BS');
    applySeq(requisitions, setRequisitions, (r) => r.reqNumber, (r, n) => ({ ...r, reqNumber: n }), ['date'], 'ISSUE');

    if (Object.keys(numMap).length > 0) {
      const entries = Object.entries(numMap).sort((a, b) => b[0].length - a[0].length);
      const repl = (s: string): string => {
        if (!entries.length) return s;
        let out = s;
        for (const [o, n] of entries) out = out.split(o).join(n);
        return out;
      };
      setJournalEntries((prev) => prev.map((j) => ({ ...j, description: repl(j.description), refNumber: j.refNumber ? repl(j.refNumber) : undefined })));
      setAuditLogs((prev) => prev.map((a) => ({ ...a, details: a.details ? repl(a.details) : a.details })));
      setPosReturns((prev) => prev.map((r) => ({ ...r, orderNumber: repl(r.orderNumber) })));
      setGrnNotes((prev) => prev.map((g) => (g.poNumber ? { ...g, poNumber: repl(g.poNumber) } : g)));
      setPurchaseOrders((prev) => prev.map((p) => (p.notes ? { ...p, notes: repl(p.notes) } : p)));
      setPurchaseRequests((prev) => prev.map((p) => (p.notes ? { ...p, notes: repl(p.notes) } : p)));
      setRequisitions((prev) => prev.map((r) => ({ ...r, notes: r.notes ? repl(r.notes) : r.notes, rejectReason: r.rejectReason ? repl(r.rejectReason) : r.rejectReason })));

      logAudit('ترقيم تسلسلي للنماذج', 'النظام', `أعيد ترقيم ${Object.keys(numMap).length} وثيقة بأرقام متسلسلة`);
    }

    localStorage.setItem('rcerp_migration_docnum_v1', '1');
    docNumMigrationDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const nextTransferNumbers = (count: number): string[] => {
    const year = new Date().getFullYear();
    const prefix = `TRF-${year}-`;
    let max = 0;
    stockTransfers.forEach((t) => {
      const n = t.transferNumber && t.transferNumber.startsWith(prefix) ? parseInt(t.transferNumber.slice(prefix.length), 10) : NaN;
      if (Number.isFinite(n) && n > max) max = n;
    });
    const nums: string[] = [];
    for (let i = 0; i < count; i++) nums.push(`${prefix}${String(max + i + 1).padStart(3, '0')}`);
    return nums;
  };

  const addWastageLog = (data: Omit<WastageLog, 'id' | 'date'>) => {
    if (isDateClosed(today())) { showToast('شهر مقفل — لا يمكن تسجيل هالك في شهر مغلق'); return; }
    const newLog: WastageLog = { ...data, id: `wst-${Date.now()}`, date: today() };
    setWastageLogs((prev) => [newLog, ...prev]);
    if (newLog.rawMaterialId) adjustInventory(newLog.branchId, newLog.rawMaterialId, -newLog.quantity, undefined, { type: 'هدر', ref: newLog.itemName });
    logAudit('تسجيل هالك', 'الهوالك', newLog.itemName);
  };

  const addWorkOrder = (data: Omit<WorkOrder, 'id' | 'orderNumber' | 'startDate' | 'status' | 'rawMaterialsDeducted'>) => {
    setWorkOrders((prev) => [{
      ...data, id: `wo-${Date.now()}`,
      orderNumber: nextDocSequence('WO', { existing: workOrders.map((w) => w.orderNumber) }),
      startDate: today(), status: 'planned', rawMaterialsDeducted: false,
    }, ...prev]);
  };

  const updateWorkOrderStatus = (id: string, status: WorkOrder['status']) => {
    setWorkOrders((prev) => prev.map((wo) => {
      if (wo.id !== id) return wo;
      const updated = { ...wo, status };
      if (status === 'completed' && !wo.rawMaterialsDeducted) {
        const recipe = recipes.find((r) => r.id === wo.recipeId);
        if (recipe) {
          recipe.ingredients.forEach((ing) => adjustInventory(wo.centralKitchenId, ing.rawMaterialId, -recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * wo.targetQuantity)));
        }
        // finished goods are added to the central kitchen stock for later transfer to branches
        adjustRecipeInventory(wo.centralKitchenId, wo.recipeId, wo.targetQuantity);
        // auto-transfer the produced quantity to the target branch when it is a real branch
        if (wo.targetBranchId && wo.targetBranchId !== wo.centralKitchenId && wo.targetBranchId !== 'b-ck') {
          const qty = wo.producedQuantity > 0 ? wo.producedQuantity : wo.targetQuantity;
          setStockTransfers((prev) => [{
            id: `trf-${Date.now()}`,
transferNumber: nextTransferNumbers(1)[0],
            fromBranchId: wo.centralKitchenId, toBranchId: wo.targetBranchId,
            date: today(), status: 'approved',
            items: [{ itemType: 'recipe' as const, recipeId: wo.recipeId, itemName: wo.recipeName, quantity: qty, unit: recipe?.portionSize || 'وحدة', unitCost: (recipe?.totalCalculatedCost || 0) / (Number(recipe?.yieldPieces) > 0 ? Number(recipe?.yieldPieces) : (Number(recipe?.portionSize) > 0 ? Number(recipe?.portionSize) : 1)) }],
            requestedBy: 'ترحيل تلقائي - المطبخ المركزي', approvedBy: 'النظام',
          }, ...prev]);
          adjustRecipeInventory(wo.centralKitchenId, wo.recipeId, -qty);
          adjustRecipeInventory(wo.targetBranchId, wo.recipeId, qty);
          logAudit('ترحيل تلقائي لأمر تصنيع', 'المطبخ المركزي', `${wo.orderNumber} إلى ${wo.targetBranchId}`);
        }
        updated.rawMaterialsDeducted = true;
        updated.completionDate = today();
      }
      return updated;
    }));
  };

  const addShift = (data: Omit<LaborShift, 'id' | 'date'>) => {
    const newShift: LaborShift = { ...data, id: `sft-${Date.now()}`, date: today() };
    setShifts((prev) => [newShift, ...prev]);
    postEntry(`رواتب وأجور ${data.employeeName} - ${data.branchId}`, [
      { accountId: 'acc-payroll', debit: data.totalShiftCost, credit: 0 },
      { accountId: 'acc-cash', debit: 0, credit: data.totalShiftCost },
    ], 'auto');
  };

  const addEmployee = (data: Omit<Employee, 'id' | 'code'>) => {
    setEmployees((prev) => [...prev, { ...data, id: `emp-${Date.now()}`, code: `EMP-${String(prev.length + 1).padStart(3, '0')}` }]);
    logAudit('إضافة موظف', 'قوى العمل', data.name);
  };
  const updateEmployee = (id: string, data: Partial<Employee>) => setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)));
  const deleteEmployee = (id: string) => setEmployees((prev) => prev.filter((e) => e.id !== id));

  // ====== الحضور والرواتب ======
  const addAttendance = (a: Omit<AttendanceRecord, 'id' | 'employeeName' | 'recordedBy'>) => {
    const emp = employees.find((e) => e.id === a.employeeId);
    if (!emp) return;
    const rec: AttendanceRecord = {
      ...a, id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      employeeName: emp.name, recordedBy: currentUser?.name || 'المستخدم',
    };
    setAttendance((prev) => (prev.some((x) => x.employeeId === a.employeeId && x.date === a.date && x.branchId === a.branchId)
      ? prev.map((x) => (x.employeeId === a.employeeId && x.date === a.date && x.branchId === a.branchId ? { ...x, ...rec, id: x.id } : x))
      : [rec, ...prev]));
    logAudit('تسجيل حضور', 'الرواتب', `${emp.name} - ${a.date}`);
  };

  const updateAttendance = (id: string, data: Partial<AttendanceRecord>) =>
    setAttendance((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)));

  const deleteAttendance = (id: string) => setAttendance((prev) => prev.filter((r) => r.id !== id));

  const generatePayroll = (month: string): { ok: boolean; error?: string } => {
    if (payrollPeriods.some((p) => p.month === month)) return { ok: false, error: 'يوجد كشف رواتب لهذا الشهر — احذفه أولاً لإعادة توليده' };
    const inMonth = (d: string) => String(d).startsWith(month);
    const monthAttendance = attendance.filter((a) => inMonth(a.date));
    const daysInMonth = new Date(new Date(month + '-01T12:00:00').getFullYear(), new Date(month + '-01T12:00:00').getMonth() + 1, 0).getDate();

    const lines: PayrollLine[] = employees
      .filter((e) => e.isActive)
      .map((e) => {
        const recs = monthAttendance.filter((a) => a.employeeId === e.id);
        const present = recs.filter((r) => r.status === 'present' || r.status === 'late').length;
        const absent = recs.filter((r) => r.status === 'absent').length;
        const hoursWorked = recs.reduce((s, r) => s + (r.hoursWorked || 0), 0);
        const overtimeHours = recs.reduce((s, r) => s + (r.overtimeHours || 0), 0);
        const bonus = recs.reduce((s, r) => s + (r.bonus || 0), 0);
        const deduction = recs.reduce((s, r) => s + (r.deduction || 0), 0);
        const hourlyRate = e.hourlyRate || 0;
        const isHourly = hourlyRate > 0 && e.monthlyBaseSalary <= 0;
        const overtimePay = overtimeHours * hourlyRate * 1.5;
        const baseSalary = isHourly ? hoursWorked * hourlyRate : e.monthlyBaseSalary;
        const absentDeduction = isHourly ? 0 : (e.monthlyBaseSalary / daysInMonth) * absent;
        const grossSalary = baseSalary + overtimePay + bonus;
        const netSalary = grossSalary - deduction - absentDeduction;
        return {
          employeeId: e.id, employeeName: e.name, branchId: e.branchId,
          baseSalary, workedDays: present, absentDays: absent, hoursWorked: Math.round(hoursWorked * 100) / 100,
          overtimeHours: Math.round(overtimeHours * 100) / 100, overtimePay: Math.round(overtimePay * 100) / 100,
          bonus, deduction: Math.round((deduction + absentDeduction) * 100) / 100,
          grossSalary: Math.round(grossSalary * 100) / 100, netSalary: Math.round(netSalary * 100) / 100,
          hourlyRate, isHourly,
        };
      })
      .filter((l) => l.grossSalary > 0 || l.workedDays > 0 || l.baseSalary > 0);

    const period: PayrollPeriod = {
      id: `prp-${Date.now()}`,
      month,
      status: 'draft',
      lines,
      totalGross: Math.round(lines.reduce((s, l) => s + l.grossSalary, 0) * 100) / 100,
      totalDeductions: Math.round(lines.reduce((s, l) => s + l.deduction, 0) * 100) / 100,
      totalNet: Math.round(lines.reduce((s, l) => s + l.netSalary, 0) * 100) / 100,
      generatedBy: currentUser?.name || 'المستخدم',
      createdAt: new Date().toISOString(),
    };
    setPayrollPeriods((prev) => [period, ...prev]);
    logAudit('توليد كشف رواتب', 'الرواتب', `${month} — ${period.lines.length} موظف بإجمالي ${period.totalNet} ر.س`);
    return { ok: true };
  };

  const confirmPayroll = (id: string) => {
    setPayrollPeriods((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const period: PayrollPeriod = { ...p, status: 'confirmed', confirmedBy: currentUser?.name || 'المستخدم', confirmedAt: new Date().toISOString() };
      if (period.totalNet > 0) {
        postEntry(`كشف رواتب ${period.month} (معتمد)`, [
          { accountId: 'acc-payroll', debit: period.totalNet, credit: 0 },
          { accountId: 'acc-cash', debit: 0, credit: period.totalNet },
        ], 'auto');
      }
      return period;
    }));
    logAudit('اعتماد كشف رواتب', 'الرواتب', id);
  };

  const deletePayrollPeriod = (id: string) => setPayrollPeriods((prev) => prev.filter((p) => p.id !== id));

  const addRole = (role: string) => setCustomRoles((prev) => (prev.includes(role) ? prev : [...prev, role]));
  const deleteRole = (role: string) => setCustomRoles((prev) => prev.filter((r) => r !== role));

  const posVatSplit = (gross: number) => vatSplit(gross, vatPercent / 100, vatInclusive);

  // استهلاك مخزون البيع مع تغطية العجز تلقائياً من المطبخ المركزي (b-ck)؛
  // تُسجَّل حصة المطبخ المركزي في عنصر الفاتورة (ckRawUsed/ckRecipeUsed) ليُعكس بدقة عند الإلغاء/التعديل.
  const consumePOSStock = (branchId: string, items: POSOrderItem[]) => {
    const autoSupplied: string[] = [];
    const branchUsed: Record<string, number> = {};
    const ckUsed: Record<string, number> = {};
    const ckRaw: Record<string, number> = {};
    const ckRecipes: Record<string, number> = {};
    const stockAt = (bid: string, matId: string) => inventory.find((i) => i.branchId === bid && i.rawMaterialId === matId)?.quantity || 0;
    const recipeStockAt = (bid: string, recipeId: string) => recipeInventory.find((r) => r.branchId === bid && r.recipeId === recipeId)?.quantity || 0;

    items.forEach((item) => {
      if (!item.ckRawUsed) item.ckRawUsed = {};
      if (!item.ckRecipeUsed) item.ckRecipeUsed = {};
      const recipe = recipes.find((r) => r.id === item.recipeId);
      recipe?.ingredients.forEach((ing) => {
        const needed = recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * item.quantity);
        if (needed <= 0) return;
        const bAvail = Math.max(0, stockAt(branchId, ing.rawMaterialId) - (branchUsed[ing.rawMaterialId] || 0));
        const takeBranch = Math.min(needed, bAvail);
        adjustInventory(branchId, ing.rawMaterialId, -takeBranch);
        branchUsed[ing.rawMaterialId] = (branchUsed[ing.rawMaterialId] || 0) + takeBranch;
        const shortfall = needed - takeBranch;
        if (shortfall > 0 && branchId !== 'b-ck') {
          const ckAvail = Math.max(0, stockAt('b-ck', ing.rawMaterialId) - (ckUsed[ing.rawMaterialId] || 0));
          const takeCk = Math.min(shortfall, ckAvail);
          if (takeCk > 0) {
            ckUsed[ing.rawMaterialId] = (ckUsed[ing.rawMaterialId] || 0) + takeCk;
            adjustInventory('b-ck', ing.rawMaterialId, -takeCk);
            ckRaw[ing.rawMaterialId] = (ckRaw[ing.rawMaterialId] || 0) + takeCk;
            item.ckRawUsed![ing.rawMaterialId] = (item.ckRawUsed![ing.rawMaterialId] || 0) + takeCk;
            autoSupplied.push(getRawMaterialName(ing.rawMaterialId));
          }
        }
      });
      recipe?.subPrepIngredients?.forEach((sp) => {
        const needed = sp.quantity * item.quantity;
        if (needed <= 0) return;
        const key = `r:${sp.recipeId}`;
        const bAvail = Math.max(0, recipeStockAt(branchId, sp.recipeId) - (branchUsed[key] || 0));
        const takeBranch = Math.min(needed, bAvail);
        adjustRecipeInventory(branchId, sp.recipeId, -takeBranch);
        branchUsed[key] = (branchUsed[key] || 0) + takeBranch;
        const shortfall = needed - takeBranch;
        if (shortfall > 0 && branchId !== 'b-ck') {
          const ckAvail = Math.max(0, recipeStockAt('b-ck', sp.recipeId) - (ckUsed[key] || 0));
          const takeCk = Math.min(shortfall, ckAvail);
          if (takeCk > 0) {
            ckUsed[key] = (ckUsed[key] || 0) + takeCk;
            adjustRecipeInventory('b-ck', sp.recipeId, -takeCk);
            ckRecipes[sp.recipeId] = (ckRecipes[sp.recipeId] || 0) + takeCk;
            item.ckRecipeUsed![sp.recipeId] = (item.ckRecipeUsed![sp.recipeId] || 0) + takeCk;
            autoSupplied.push(recipes.find((r) => r.id === sp.recipeId)?.nameAr || sp.recipeId);
          }
        }
      });
    });

    // تسجيل تحويل آلي (توثيقي) من المطبخ المركزي للفرع دون تعديل المخزون — تم الخصم أعلاه.
    if (branchId !== 'b-ck' && (Object.keys(ckRaw).length > 0 || Object.keys(ckRecipes).length > 0)) {
      const transferItems: StockTransferItem[] = [
        ...Object.keys(ckRaw).map((matId) => ({
          itemType: 'raw_material' as const, rawMaterialId: matId,
          itemName: getRawMaterialName(matId),
          quantity: Number((ckRaw[matId] || 0).toFixed(3)),
          unit: rawMaterials.find((m) => m.id === matId)?.unit || '',
          unitCost: getAverageUnitCost(matId),
        })),
        ...Object.keys(ckRecipes).map((recipeId) => ({
          itemType: 'recipe' as const, recipeId,
          itemName: recipes.find((r) => r.id === recipeId)?.nameAr || recipeId,
          quantity: Number((ckRecipes[recipeId] || 0).toFixed(3)),
          unit: recipes.find((r) => r.id === recipeId)?.portionSize || '',
          unitCost: 0,
        })),
      ];
      const newTransfer: StockTransfer = {
        id: `trf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        transferNumber: nextTransferNumbers(1)[0],
        fromBranchId: 'b-ck', toBranchId: branchId, date: today(), status: 'approved',
        items: transferItems, requestedBy: 'توريد تلقائي من المطبخ المركزي', approvedBy: 'النظام',
      };
      setStockTransfers((prev) => [newTransfer, ...prev]);
      logAudit('توريد تلقائي من المطبخ المركزي', 'المخزون', `${newTransfer.transferNumber}: ${transferItems.length} صنف`);
    }
    return { autoSupplied };
  };

  const addPOSOrder = (data: Omit<POSOrder, 'id' | 'orderNumber' | 'vatAmount' | 'totalAmount' | 'totalCost' | 'subtotal' | 'date'> & { date?: string }) => {
    const orderDate = data.date || new Date().toISOString();
    if (isDateClosed(orderDate)) { showToast('شهر مقفل — لا يمكن إصدار فاتورة POS في شهر مغلق'); return { ok: false, autoSupplied: [] as string[] }; }
    const gross = data.items.reduce((s, i) => s + i.lineTotal, 0);
    const totalCost = data.items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
    const { vat, total, net } = posVatSplit(gross);
    const newOrder: POSOrder = {
      ...data,
      subtotal: net, vatAmount: vat, totalAmount: total, totalCost,
      rawMaterialsDeducted: deductSalesFromInventory,
      id: `ord-${Date.now()}`,
      orderNumber: nextDocSequence('POS', { existing: posOrders.map((o) => o.orderNumber), segment: data.branchId.toUpperCase() }),
      date: orderDate,
    };
    setPosOrders((prev) => [newOrder, ...prev]);

    if (!deductSalesFromInventory) {
      return { ok: true, autoSupplied: [] as string[] };
    }

    const autoSupplied = consumePOSStock(newOrder.branchId, data.items).autoSupplied;

    // auto-posting: sales revenue + VAT, and COGS against inventory
    postEntry(`مبيعات نقطة البيع ${newOrder.orderNumber} - ${newOrder.branchId}`, [
      { accountId: 'acc-cash', debit: newOrder.totalAmount, credit: 0 },
      { accountId: 'acc-rev', debit: 0, credit: newOrder.subtotal },
      { accountId: 'acc-vat', debit: 0, credit: newOrder.vatAmount },
    ], 'auto', newOrder.orderNumber);
    postEntry(`تكلفة المبيعات ${newOrder.orderNumber}`, [
      { accountId: 'acc-cogs', debit: newOrder.totalCost, credit: 0 },
      { accountId: 'acc-inv', debit: 0, credit: newOrder.totalCost },
    ], 'auto', newOrder.orderNumber);
    if (data.customerId) {
      setCustomers((prev) => prev.map((c) => c.id === data.customerId ? { ...c, visits: c.visits + 1, totalSpent: c.totalSpent + newOrder.totalAmount, lastVisit: today() } : c));
    }
    logAudit('إضافة طلب POS', 'المبيعات', newOrder.orderNumber, { type: 'posOrder', id: newOrder.id });
    return { ok: true, autoSupplied };
  };

  const reversePOSConsumption = (o: POSOrder) => {
    o.items.forEach((item) => {
      const recipe = recipes.find((r) => r.id === item.recipeId);
      recipe?.ingredients.forEach((ing) => {
        const total = recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * item.quantity);
        if (total <= 0) return;
        const ck = item.ckRawUsed?.[ing.rawMaterialId] || 0;
        const br = Number((total - ck).toFixed(3));
        if (br > 0) adjustInventory(o.branchId, ing.rawMaterialId, br, undefined, { type: 'إرجاع نقطة بيع', ref: o.id });
        if (ck > 0) adjustInventory('b-ck', ing.rawMaterialId, ck, undefined, { type: 'إرجاع نقطة بيع', ref: o.id });
      });
      recipe?.subPrepIngredients?.forEach((sp) => {
        const total = sp.quantity * item.quantity;
        if (total <= 0) return;
        const ck = item.ckRecipeUsed?.[sp.recipeId] || 0;
        const br = Number((total - ck).toFixed(3));
        if (br > 0) adjustRecipeInventory(o.branchId, sp.recipeId, br);
        if (ck > 0) adjustRecipeInventory('b-ck', sp.recipeId, ck);
      });
    });
  };

  const updatePOSOrder = (id: string, data: Partial<POSOrder>) => {
    const existing = posOrders.find((o) => o.id === id);
    if (!existing) return;
    const branchId = data.branchId || existing.branchId;
    const items = data.items || existing.items;
    if (existing.rawMaterialsDeducted !== false) {
      reversePOSConsumption(existing);
      consumePOSStock(branchId, items);
    }
    const gross = items.reduce((s, i) => s + i.lineTotal, 0);
    const totalCost = items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
    const { vat, total, net } = posVatSplit(gross);
    const dSales = net - existing.subtotal;
    const dVat = vat - existing.vatAmount;
    const dTotal = total - existing.totalAmount;
    const dCogs = totalCost - existing.totalCost;
    if (dTotal !== 0 || dCogs !== 0) {
      postEntry(`تعديل فاتورة POS ${existing.orderNumber} (تسوية)`, [
        ...(dTotal !== 0 ? [{ accountId: 'acc-cash', debit: dTotal > 0 ? dTotal : 0, credit: dTotal > 0 ? 0 : -dTotal }] : []),
        ...(dSales !== 0 ? [{ accountId: 'acc-rev', debit: dSales > 0 ? 0 : -dSales, credit: dSales > 0 ? dSales : 0 }] : []),
        ...(dVat !== 0 ? [{ accountId: 'acc-vat', debit: dVat > 0 ? 0 : -dVat, credit: dVat > 0 ? dVat : 0 }] : []),
        ...(dCogs !== 0 ? [{ accountId: 'acc-cogs', debit: dCogs > 0 ? dCogs : 0, credit: dCogs > 0 ? 0 : -dCogs }, { accountId: 'acc-inv', debit: dCogs > 0 ? 0 : -dCogs, credit: dCogs > 0 ? dCogs : 0 }] : []),
      ], 'auto', existing.orderNumber);
    }
    setPosOrders((prev) => prev.map((o) => (o.id !== id ? o : { ...o, ...data, branchId, items, subtotal: net, vatAmount: vat, totalAmount: total, totalCost })));
    logAudit('تعديل فاتورة POS', 'المبيعات', id, { type: 'posOrder', id });
  };

  const deletePOSOrder = (id: string) => {
    const order = posOrders.find((o) => o.id === id);
    if (!order) return;
    if (order.rawMaterialsDeducted !== false) {
      reversePOSConsumption(order);
      posReturns.filter((r) => r.orderId === id).forEach((ret) => {
        ret.items.forEach((i) => {
          const recipe = recipes.find((r) => r.id === i.recipeId);
          recipe?.ingredients.forEach((ing) => adjustInventory(order.branchId, ing.rawMaterialId, -recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * i.quantity)));
          recipe?.subPrepIngredients?.forEach((sp) => adjustRecipeInventory(order.branchId, sp.recipeId, -(sp.quantity * i.quantity)));
        });
      });
    }
    setPosOrders((prev) => prev.filter((o) => o.id !== id));
    setPosReturns((prev) => prev.filter((r) => r.orderId !== id));
    postEntry(`حذف فاتورة POS ${order.orderNumber} (عكس الإيراد)`, [
      { accountId: 'acc-cash', debit: 0, credit: order.totalAmount },
      { accountId: 'acc-rev', debit: order.subtotal, credit: 0 },
      { accountId: 'acc-vat', debit: order.vatAmount, credit: 0 },
    ], 'auto', order.orderNumber);
    if (order.totalCost > 0) {
      postEntry(`حذف فاتورة POS ${order.orderNumber} (عكس التكلفة)`, [
        { accountId: 'acc-cogs', debit: 0, credit: order.totalCost },
        { accountId: 'acc-inv', debit: order.totalCost, credit: 0 },
      ], 'auto', order.orderNumber);
    }
    logAudit('حذف فاتورة POS', 'المبيعات', order.orderNumber, { type: 'posOrder', id: order.id });
  };

  const addPOSReturn = (orderId: string, items: { recipeId: string; quantity: number }[], reason: string): { ok: boolean; error?: string } => {
    if (isDateClosed(today())) { showToast('شهر مقفل — لا يمكن تسجيل مرتجعات'); return { ok: false, error: 'شهر مغلق — لا يمكن تسجيل مرتجعات' }; }
    const order = posOrders.find((o) => o.id === orderId);
    if (!order) return { ok: false, error: 'الطلب غير موجود' };
    const valid = items.filter((i) => i.quantity > 0);
    if (valid.length === 0) return { ok: false, error: 'أدخل كميات للإرجاع' };
    // prevent returning more than sold minus already returned
    const alreadyReturned = posReturns.filter((r) => r.orderId === orderId)
      .flatMap((r) => r.items);
    for (const it of valid) {
      const sold = order.items.find((x) => x.recipeId === it.recipeId)?.quantity || 0;
      const ret = alreadyReturned.filter((x) => x.recipeId === it.recipeId).reduce((s, x) => s + x.quantity, 0);
      if (it.quantity > sold - ret) return { ok: false, error: `كمية الإرجاع تتجاوز المتبقي من «${order.items.find((x) => x.recipeId === it.recipeId)?.recipeName || it.recipeId}»` };
    }
    const returnItems = valid.map((i) => {
      const sold = order.items.find((x) => x.recipeId === i.recipeId)!;
      return { recipeId: i.recipeId, recipeName: sold.recipeName, quantity: i.quantity, unitPrice: sold.unitPrice, unitCost: sold.unitCost, lineTotal: sold.unitPrice * i.quantity };
    });
    const gross = returnItems.reduce((s, i) => s + i.lineTotal, 0);
    const totalCost = returnItems.reduce((s, i) => s + i.unitCost * i.quantity, 0);
    const { vat, total, net } = posVatSplit(gross);
    const newReturn: POSReturn = {
      id: `ret-${Date.now()}`, returnNumber: nextDocSequence('RET', { existing: posReturns.map((r) => r.returnNumber) }),
      orderId: order.id, orderNumber: order.orderNumber, branchId: order.branchId, date: today(),
      items: returnItems, subtotal: net, vatAmount: vat, totalAmount: total, totalCost, reason: reason || 'مرتجع من العملاء', refundedBy: 'المستخدم',
    };
    setPosReturns((prev) => [newReturn, ...prev]);
    returnItems.forEach((i) => {
      const recipe = recipes.find((r) => r.id === i.recipeId);
      recipe?.ingredients.forEach((ing) => adjustInventory(order.branchId, ing.rawMaterialId, recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * i.quantity)));
      recipe?.subPrepIngredients?.forEach((sp) => adjustRecipeInventory(order.branchId, sp.recipeId, sp.quantity * i.quantity));
    });
    postEntry(`مرتجع مبيعات ${newReturn.returnNumber} - ${order.orderNumber}`, [
      { accountId: 'acc-rev', debit: net, credit: 0 },
      { accountId: 'acc-vat', debit: vat, credit: 0 },
      { accountId: 'acc-cash', debit: 0, credit: total },
    ], 'auto', newReturn.returnNumber);
    postEntry(`تكلفة المرتجع ${newReturn.returnNumber}`, [
      { accountId: 'acc-inv', debit: totalCost, credit: 0 },
      { accountId: 'acc-cogs', debit: 0, credit: totalCost },
    ], 'auto', newReturn.returnNumber);
    logAudit('مرتجع مبيعات', 'المبيعات', `${newReturn.returnNumber} بقيمة ${total} ر.س`);
    return { ok: true };
  };

  const adjustRecipeInventory = (branchId: string, recipeId: string, delta: number) => {
    setRecipeInventory((prev) => {
      const idx = prev.findIndex((r) => r.branchId === branchId && r.recipeId === recipeId);
      const next = [...prev];
      if (idx >= 0) {
        next[idx] = { ...next[idx], quantity: Math.max(0, next[idx].quantity + delta), lastUpdated: today() };
      } else if (delta > 0) {
        next.push({ id: `ri-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, branchId, recipeId, quantity: delta, lastUpdated: today() });
      }
      return next;
    });
  };

  const getRecipeStock = (branchId: string, recipeId: string) => recipeInventory.find((r) => r.branchId === branchId && r.recipeId === recipeId)?.quantity || 0;

  // Set exact opening stock quantities for a branch (upsert by branch+rawMaterial) and record a dated history entry
  const setOpeningBalances = (branchId: string, quantities: Record<string, number>) => {
    setInventory((prev) => {
      const next = [...prev];
      Object.entries(quantities).forEach(([rawMaterialId, quantity]) => {
        if (!(quantity > 0)) return;
        const idx = next.findIndex((i) => i.branchId === branchId && i.rawMaterialId === rawMaterialId);
        if (idx >= 0) next[idx] = { ...next[idx], quantity, lastUpdated: today() };
        else next.push({ id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, branchId, rawMaterialId, quantity, lastUpdated: today() });
      });
      return next;
    });
    const items: OpeningBalanceItem[] = Object.entries(quantities).filter(([, q]) => q > 0).map(([rawMaterialId, quantity]) => ({
      rawMaterialId, quantity, unitCost: getAverageUnitCost(rawMaterialId),
    }));
    setOpeningBalancesRec((prev) => [{ id: `ob-${Date.now()}`, branchId, date: today(), items }, ...prev]);
    logAudit('تحديث الأرصدة الافتتاحية', 'المخزون', `${getBranchName(branchId)} — ${Object.keys(quantities).filter((k) => quantities[k] > 0).length} صنف`);
  };

  const addOpeningBalance = (r: Omit<OpeningBalanceRecord, 'id'>) => {
    setOpeningBalancesRec((prev) => [{ ...r, id: `ob-${Date.now()}` }, ...prev]);
    logAudit('إضافة رصيد افتتاحي', 'المخزون', `${getBranchName(r.branchId)} — ${r.date} — ${r.items.length} صنف`);
  };

  const updateOpeningBalance = (id: string, r: Partial<OpeningBalanceRecord>) => {
    setOpeningBalancesRec((prev) => prev.map((x) => x.id === id ? { ...x, ...r } : x));
  };

  const deleteOpeningBalance = (id: string) => setOpeningBalancesRec((prev) => prev.filter((x) => x.id !== id));

  const getNotifications = (): SystemNotification[] => {
    const notes: SystemNotification[] = [];
    const scope = visibleBranchIds;
    const daysToExpiry = (d: string) => Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
    const matName = (id: string) => rawMaterials.find((m) => m.id === id)?.nameAr || id;
    const branchName = (id: string) => branches.find((b) => b.id === id)?.nameAr || id;

    // low stock — حسب حدود كل فرع الفعلية (المخصصة أو الافتراضي العام)، مع أصناف «طلب كامل» الدورية
    inventory.filter((i) => scope.includes(i.branchId)).forEach((i) => {
      const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
      if (!mat || !mat.isActive) return;
      const lv = getStockLevelsFor(mat.id, i.branchId);
      const belowMin = lv.minStockLevel > 0 && i.quantity <= lv.minStockLevel;
      if (!lv.alwaysOrderFullMax && !belowMin) return;
      const suggested = lv.alwaysOrderFullMax ? Math.max(0, lv.maxStockLevel) : Math.max(0, lv.maxStockLevel - i.quantity);
      notes.push({
        id: `ls-${i.id}`, type: 'low_stock',
        severity: belowMin ? 'critical' : 'warning',
        title: lv.alwaysOrderFullMax && !belowMin ? `طلب دوري كامل: ${mat.nameAr}` : `نقص مخزون: ${mat.nameAr}`,
        description: `${branchName(i.branchId)} — الرصيد ${i.quantity} ${mat.unit}، الحد الأدنى ${lv.minStockLevel}، المقترح طلبه ${suggested} ${mat.unit}${lv.isOverride ? ' (حدود فرع مخصصة)' : ''}`,
        tab: 'low_stock_alerts',
      });
    });
    // expiry
    const expiryRule = automationRules.find((r) => r.key === 'expiry_alert');
    const expiryDays = expiryRule?.enabled ? (expiryRule.config?.daysBefore ?? 14) : 14;
    inventory.filter((i) => scope.includes(i.branchId) && i.expiryDate).forEach((i) => {
      const rem = daysToExpiry(i.expiryDate!);
      if (rem <= expiryDays) {
        notes.push({
          id: `ex-${i.id}`, type: 'expiry',
          severity: rem <= 7 ? 'critical' : 'warning',
          title: `${rem <= 0 ? 'انتهت صلاحية' : 'اقتراب انتهاء الصلاحية'}: ${matName(i.rawMaterialId)}`,
          description: `${branchName(i.branchId)} — ${rem <= 0 ? 'منتهية منذ' : 'متبقي'} ${Math.abs(rem)} يوم (${i.expiryDate})، الكمية ${i.quantity}`,
          tab: 'inventory',
        });
      }
    });
    // overdue invoices
    invoices.filter((inv) => inv.type === 'sales' && inv.status === 'overdue').forEach((inv) => {
      notes.push({ id: `ov-${inv.id}`, type: 'overdue_invoice', severity: 'critical', title: `فاتورة متأخرة: ${inv.partyName}`, description: `${inv.invoiceNumber} — متبقي ${(inv.totalAmount - inv.paidAmount).toFixed(2)} ر.س`, tab: 'invoices' });
    });
    // unpaid / overdue operating expenses
    operatingExpenses.filter((e) => e.paymentStatus === 'overdue').forEach((e) => {
      notes.push({ id: `ed-${e.id}`, type: 'expense_due', severity: 'warning', title: `مصروف متأخر: ${e.description}`, description: `${branchName(e.branchId)} — ${e.amount.toFixed(2)} ر.س (${e.dueDate})`, tab: 'operating_expenses' });
    });
    // cost alerts (unacknowledged critical)
    getFoodCostAlerts().filter((a) => !a.isAcknowledged && a.severity === 'critical').forEach((a) => {
      notes.push({ id: `ca-${a.recipeId}`, type: 'cost_alert', severity: 'critical', title: `انحراف تكلفة حرج: ${a.recipeNameAr}`, description: `Food Cost ${a.actualFoodCostPercent.toFixed(1)}% مقابل هدف ${a.targetFoodCostPercent.toFixed(1)}%`, tab: 'recipes' });
    });

    // المهام المفتوحة الموكلة للمستخدم الحالي
    const myId = currentUser?.id;
    const myName = currentUser?.name;
    tasks.filter((t) => t.status === 'open' && (t.assigneeIds.includes(myId || '') || t.assigneeIds.includes(myName || ''))).forEach((t) => {
      notes.push({
        id: `ta-${t.id}`, type: 'task_assigned',
        severity: t.priority === 'critical' ? 'critical' : t.priority === 'high' ? 'warning' : 'info',
        title: t.title,
        description: `${t.type === 'approval' ? 'اعتماد' : t.type === 'stock_count' ? 'جرد' : t.type === 'grn_verify' ? 'تدقيق GRN' : t.type === 'purchase_request' ? 'طلب شراء' : t.type === 'review' ? 'مراجعة' : 'مهمة'}${t.dueDate ? ' — مستحقة ' + t.dueDate : ''}`,
        tab: 'tasks',
      });
    });

    // scheduled reports due
    const reportsRule = automationRules.find((r) => r.key === 'reports_due');
    if (reportsRule?.enabled) {
      const dayMs = 86400000;
      const overdue = (r: ScheduledReport) => {
        if (!r.lastRun) return true;
        const since = Math.floor((Date.now() - new Date(r.lastRun).getTime()) / dayMs);
        const maxDays = r.frequency === 'daily' ? 1 : r.frequency === 'weekly' ? 7 : 30;
        return since >= maxDays;
      };
      scheduledReports.filter((r) => r.enabled && overdue(r)).forEach((r) => {
        const fr = { daily: 'يومياً', weekly: 'أسبوعياً', monthly: 'شهرياً' }[r.frequency];
        notes.push({ id: `rd-${r.id}`, type: 'report_due', severity: 'info', title: `تقرير مستحق: ${r.name}`, description: `الجدولة ${fr} — لم يُشغّل منذ ${r.lastRun || 'البداية'}`, tab: 'automation' });
      });
    }

    return notes.slice(0, 50);
  };

  // ---- Fixed assets & depreciation ----
  const getMonthlyDepreciation = (a: FixedAsset) => {
    const base = Math.max(0, a.purchaseCost - a.salvageValue);
    return a.usefulLifeYears > 0 ? Number((base / (a.usefulLifeYears * 12)).toFixed(2)) : 0;
  };

  const addFixedAsset = (data: Omit<FixedAsset, 'id' | 'code'>) => {
    const asset: FixedAsset = { ...data, id: `fa-${Date.now()}`, code: `FA-${Math.floor(100 + Math.random() * 900)}` };
    setFixedAssets((prev) => [asset, ...prev]);
    postEntry(`اقتناء أصل ثابت ${asset.name}`, [
      { accountId: 'acc-fa', debit: asset.purchaseCost, credit: 0 },
      { accountId: 'acc-cash', debit: 0, credit: asset.purchaseCost },
    ], 'auto', asset.code);
    logAudit('إضافة أصل ثابت', 'الأصول الثابتة', `${asset.code} - ${asset.name}`);
  };

  const updateFixedAsset = (id: string, d: Partial<FixedAsset>) => setFixedAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...d } : a)));

  const deleteFixedAsset = (id: string) => {
    const asset = fixedAssets.find((a) => a.id === id);
    setFixedAssets((prev) => prev.filter((a) => a.id !== id));
    if (asset) logAudit('حذف أصل ثابت', 'الأصول الثابتة', `${asset.code} - ${asset.name}`);
  };

  const recordDepreciation = (monthKey: string): { ok: boolean; message: string } => {
    let totalDep = 0;
    let posted = 0;
    const updated = fixedAssets.map((a) => {
      if (!a.isActive || a.lastDepreciationDate === monthKey) return a;
      const monthly = getMonthlyDepreciation(a);
      const cap = Math.max(0, a.purchaseCost - a.salvageValue);
      const newAcc = Math.min(cap, a.accumulatedDepreciation + monthly);
      if (newAcc <= a.accumulatedDepreciation + 0.001) return { ...a, lastDepreciationDate: monthKey };
      totalDep += newAcc - a.accumulatedDepreciation;
      posted++;
      return { ...a, accumulatedDepreciation: Number(newAcc.toFixed(2)), lastDepreciationDate: monthKey };
    });
    if (posted === 0) return { ok: false, message: 'لا توجد أصول تحتاج ترحيل اهتلاك لهذا الشهر' };
    setFixedAssets(updated);
    const amount = Number(totalDep.toFixed(2));
    postEntry(`اهتلاك الأصول الثابتة - ${monthKey}`, [
      { accountId: 'acc-dep', debit: amount, credit: 0 },
      { accountId: 'acc-acc-dep', debit: 0, credit: amount },
    ], 'auto', `DEPR-${monthKey}`);
    logAudit('ترحيل اهتلاك', 'الأصول الثابتة', `${monthKey} بمبلغ ${amount}`);
    return { ok: true, message: `تم ترحيل اهتلاك ${posted} أصل بقيمة ${amount} ر.س` };
  };

  // ---- Scheduled reports & automation ----
  const REPORT_TABS: Record<ReportType, string> = {
    sales_summary: 'analytics', cost_report: 'cost_reports', pl_statement: 'pl_statement',
    inventory_report: 'inventory', wastage_report: 'wastage', variance_report: 'purchase_variance',
  };

  const addScheduledReport = (d: Omit<ScheduledReport, 'id'>) => setScheduledReports((prev) => [{ ...d, id: `sr-${Date.now()}` }, ...prev]);

  const setScheduledReport = (id: string, d: Partial<ScheduledReport>) => setScheduledReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...d } : r)));

  const runScheduledReport = (id: string): string => {
    const report = scheduledReports.find((r) => r.id === id);
    if (!report) return 'dashboard';
    setScheduledReports((prev) => prev.map((r) => (r.id === id ? { ...r, lastRun: today() } : r)));
    logAudit('تشغيل تقرير مجدول', 'الأتمتة', report.name);
    return REPORT_TABS[report.type];
  };

  const setAutomationRule = (id: string, enabled: boolean) => setAutomationRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));

  const runAutomation = (): { ok: boolean; message: string } => {
    const results: string[] = [];
    const enabledKeys = automationRules.filter((r) => r.enabled).map((r) => r.key);

    // auto purchase orders: مسودات أوامر شراء لكل فرع من حدود المخزون + الطلبات المعلّقة
    if (enabledKeys.includes('auto_po')) {
      const openKey = (bid: string, rid: string) => `${bid}|${rid}`;
      const openBy: Record<string, number> = {};
      purchaseOrders
        .filter((p) => ['submitted', 'approved', 'partially_received'].includes(p.status))
        .forEach((p) => p.items.forEach((it) => {
          const k = openKey(p.branchId, it.rawMaterialId);
          openBy[k] = (openBy[k] || 0) + (it.quantity || 0);
        }));
      const reqQty: Record<string, number> = {};
      requisitions
        .filter((r) => r.status === 'pending')
        .forEach((r) => r.items.forEach((it) => {
          const k = openKey(r.branchId, it.rawMaterialId);
          reqQty[k] = (reqQty[k] || 0) + (it.quantity || 0);
        }));
      const alreadyDrafted = (bid: string, rid: string) =>
        purchaseOrders.some((p) => p.status === 'draft' && p.branchId === bid && p.items.some((it) => it.rawMaterialId === rid));

      const poGroups: Record<string, {
        branchId: string;
        supplierId: string;
        supplierName: string;
        items: { rawMaterialId: string; materialName: string; quantity: number; unit: string; unitPrice: number; lineTotal: number; purchaseUnit?: string; purchaseUnitConversion?: number; purchaseQty?: number }[];
      }> = {};
      inventory.forEach((i) => {
        if (!visibleBranchIds.includes(i.branchId)) return;
        const bid = i.branchId;
        const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
        if (!mat || !mat.isActive) return;
        if ((mat.minStockLevel || 0) <= 0 && (mat.maxStockLevel || 0) <= 0) return;
        if (alreadyDrafted(bid, mat.id)) return;
        const lim = getStockLevelsFor(mat.id, bid);
        const max = lim.maxStockLevel;
        if (max <= 0) return;
        const min = lim.minStockLevel;
        const always = lim.alwaysOrderFullMax;
        const k = openKey(bid, mat.id);
        const stock = i.quantity;
        const onOrder = openBy[k] || 0;
        const reqs = reqQty[k] || 0;
        const available = stock + onOrder;
        const belowMin = always || available <= min;
        const needReorder = always ? Math.max(0, max - onOrder) : Math.max(0, max - available);
        const needReqs = Math.max(0, reqs - onOrder);
        const need = Math.max(belowMin ? needReorder : 0, needReqs);
        if (need <= 0) return;

        const conv = stockPerPurchase(mat);
        const quantity = conv > 0 ? Math.ceil(need / conv) * conv : Math.ceil(need);
        if (quantity <= 0) return;
        const cheapest = lowestPrice30Days(grnNotes, mat);
        const unitPrice = cheapest && cheapest.pricePU != null
          ? cheapest.pricePU / (conv > 0 ? conv : 1)
          : getBranchAverageUnitCost(bid, mat.id);
        const supplierId = lastSupplierIdFor(grnNotes, mat.id, mat.supplierId || '');
        const supplier = suppliers.find((s) => s.id === supplierId);
        const gKey = `${bid}__${supplierId}`;
        poGroups[gKey] = poGroups[gKey] || { branchId: bid, supplierId, supplierName: supplier ? supplier.name : (supplierId ? '' : '—'), items: [] };
        poGroups[gKey].items.push({
          rawMaterialId: mat.id,
          materialName: mat.nameAr,
          quantity: Math.round(quantity * 100) / 100,
          unit: mat.unit,
          unitPrice: Math.round(unitPrice * 100) / 100,
          lineTotal: Math.round(quantity * unitPrice * 100) / 100,
          purchaseUnit: mat.purchaseUnit || mat.unit,
          purchaseUnitConversion: conv,
          purchaseQty: conv > 0 ? Math.round((quantity / conv) * 100) / 100 : quantity,
        });
      });

      let poCount = 0;
      let skippedNoSupplier = 0;
      Object.values(poGroups).forEach((grp) => {
        if (grp.items.length === 0) return;
        if (!grp.supplierId) { skippedNoSupplier += grp.items.length; return; }
        addPurchaseOrder({
          supplierId: grp.supplierId,
          supplierName: grp.supplierName,
          branchId: grp.branchId,
          orderDate: today(),
          expectedDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
          status: 'draft',
          poType: 'regular',
          items: grp.items,
          totalAmount: Math.round(grp.items.reduce((s, it) => s + it.lineTotal, 0) * 100) / 100,
          requestedBy: 'أتمتة - النظام',
          notes: `توليد تلقائي من حدود المخزون والطلبات المعلّقة — فرع ${getBranchName(grp.branchId)} (مسودة للمراجعة)`,
        });
        poCount++;
      });
      const extra = skippedNoSupplier > 0 ? ` (تخطّى ${skippedNoSupplier} صنف بلا مورد)` : '';
      results.push(poCount > 0 ? `أُنشئ ${poCount} مسودة أمر شراء${extra}` : `لا توجد أصناف تحتاج شراء${extra}`);
    }

    // auto work orders for prep recipes below minimum at central kitchen
    if (enabledKeys.includes('auto_workorder')) {
      const prepRecipes = recipes.filter((r) => r.isCentralKitchenPrep || r.category === 'sub_prep');
      const minStock = 50;
      let woCount = 0;
      prepRecipes.forEach((r) => {
        const stock = getRecipeStock('b-ck', r.id);
        if (stock >= minStock) return;
        const qty = Math.max((minStock * 2) - stock, minStock);
        addWorkOrder({ recipeId: r.id, recipeName: r.nameAr, centralKitchenId: 'b-ck', targetBranchId: 'b-ck', targetQuantity: Math.round(qty), prepChef: 'الشيف - أتمتة', producedQuantity: 0 });
        woCount++;
      });
      results.push(woCount > 0 ? `أُنشئ ${woCount} أمر تصنيع تلقائي` : 'الأصناف المصنّعة ضمن الحدود');
    }

    return { ok: true, message: results.join(' · ') || 'لا توجد قواعد أتمتة مفعّلة' };
  };

  const addStockTransfer = (data: Omit<StockTransfer, 'id' | 'transferNumber' | 'date' | 'status'>) => {
    if (isDateClosed(today())) { showToast('شهر مقفل — لا يمكن تحويل أصناف في شهر مغلق'); return; }
    const newTransfer: StockTransfer = { ...data, id: `trf-${Date.now()}`, transferNumber: nextTransferNumbers(1)[0], date: today(), status: 'draft' };
    setStockTransfers((prev) => [newTransfer, ...prev]);
    logAudit('إنشاء إذن تحويل بين الفروع', 'المخزون', `${newTransfer.transferNumber}: ${newTransfer.items.length} صنف (مسودة)`, { type: 'stockTransfer', id: newTransfer.id });
  };

  // تحديث بيانات إذن التحويل (تعديل الأصناف/الكميات/الأسعار) — للمسودات والمراجع المرفوضة
  const updateStockTransfer = (id: string, data: Partial<StockTransfer>) => {
    setStockTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    logAudit('تعديل إذن تحويل', 'المخزون', id, { type: 'stockTransfer', id });
  };

  // إرسال الإذن للاعتماد (مسودة → مقدَّم)
  const submitStockTransfer = (id: string) => {
    setStockTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'submitted' } : t)));
    logAudit('إرسال إذن تحويل للاعتماد', 'المخزون', id, { type: 'stockTransfer', id });
  };

  // اعتماد الإذن: تطبيق حركة المخزون على الفرعين + قيد محاسبي
  const approveStockTransfer = (id: string) => {
    const target = stockTransfers.find((t) => t.id === id);
    if (!target || target.status !== 'submitted') return;
    if (isDateClosed(target.date)) { showToast('شهر مقفل — لا يمكن اعتماد تحويل في شهر مغلق'); return; }
    target.items.forEach((item) => {
      if (item.itemType === 'recipe' && item.recipeId) {
        adjustRecipeInventory(target.fromBranchId, item.recipeId, -item.quantity);
        adjustRecipeInventory(target.toBranchId, item.recipeId, item.quantity);
      } else {
        adjustInventory(target.fromBranchId, item.rawMaterialId!, -item.quantity, undefined, { type: 'تحويل صادر', ref: target.id });
        adjustInventory(target.toBranchId, item.rawMaterialId!, item.quantity, undefined, { type: 'تحويل وارد', ref: target.id });
      }
    });
    setStockTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'approved', approvedBy: currentUser?.name || 'المستخدم', approvedAt: new Date().toISOString() } : t)));
    logAudit('اعتماد إذن تحويل', 'المخزون', `${target.transferNumber}`, { type: 'stockTransfer', id: target.id });
  };

  // رفض الإذن
  const rejectStockTransfer = (id: string, reason: string) =>
    setStockTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'rejected', rejectReason: reason } : t)));

  // حذف سجل تحويل نهائياً (سجلات خاطئة/شركات محذوفة)
  const deleteStockTransfer = (id: string) => {
    const target = stockTransfers.find((t) => t.id === id);
    setStockTransfers((prev) => prev.filter((t) => t.id !== id));
    if (target) logAudit('حذف إذن تحويل نهائي', 'المخزون', target.transferNumber, { type: 'stockTransfer', id: target.id });
  };

  // اعتماد توزيع ورد من البوت: إنشاء إذن تحويل لكل هدف (فرع) من نفس المصدر والصنف
  const approveDistribution = (id: string) => {
    const dist = distributions.find((d) => d.id === id);
    if (!dist || dist.status !== 'pending') return;
    if (isDateClosed(dist.date || today())) { showToast('شهر مقفل — لا يمكن اعتماد توزيع في شهر مغلق'); return; }
    if (dist.multiSource && dist.multiSource.length >= 2) { showToast('توزيع متعدد المصادر — أنشئ التحويلات يدويًا من شاشة التحويلات'); return; }
    if (!dist.fromBranchId) { showToast('حدد فرع المصدر (من) قبل الاعتماد'); return; }
    if (!dist.rawMaterialId) { showToast('حدد الصنف قبل الاعتماد'); return; }
    const validRows = dist.rows.filter((r) => r.toBranchId);
    if (!validRows.length) { showToast('لا أهداف صالحة للاعتماد — حدّد أهدافًا قبل الاعتماد'); return; }
    const draftNumbers = nextTransferNumbers(validRows.length);
    let draftIdx = 0;
    validRows.forEach((row) => {
      const newTransfer: StockTransfer = {
        id: `trf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        transferNumber: draftNumbers[draftIdx++],
        fromBranchId: dist.fromBranchId,
        toBranchId: row.toBranchId,
        date: dist.date || today(),
        status: 'draft',
        items: [{
          itemType: 'raw_material',
          rawMaterialId: dist.rawMaterialId,
          itemName: dist.itemName,
          quantity: row.inventoryQty ?? row.qty,
          unit: row.unit || '',
          unitCost: row.unitCost || 0,
          purchaseUnit: row.purchaseUnit || undefined,
          purchaseUnitQty: row.inventoryQty ? row.qty : undefined,
        }],
        requestedBy: currentUser?.name || 'توزيع واتس/بوت',
      };
      setStockTransfers((prev) => [newTransfer, ...prev]);
    });
    setDistributions((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'approved', convertedAt: new Date().toISOString() } : d)));
    logAudit('اعتماد توزيع ورد من البوت', 'المخزون', `${dist.itemName}: ${validRows.length} تحويل من ${dist.fromBranchName}`);
    showToast(`تم إنشاء ${validRows.length} تحويل مخزني — راجعها واعتمدها من شاشة التحويلات`);
  };

  const rejectDistribution = (id: string) =>
    setDistributions((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'rejected' } : d)));

  // تعديل مسودة وردت من البوت (الصنف/المصدر/الإجماليات) قبل الاعتماد
  const updateDistribution = (id: string, data: Partial<Distribution>) =>
    setDistributions((prev) => prev.map((d) => (d.id === id ? { ...d, ...data } : d)));

  // ---- صندوق التحقق قبل الرفع ----
  const raiseInboxItem = async (id: string) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const r = await fetch(`/api/intake-inbox/${encodeURIComponent(id)}/raise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const j = await r.json();
      if (j.ok) {
        setIntakeInbox((prev) => prev.map((e) => e.id === id ? { ...e, status: 'raised' as const, raisedAt: new Date().toISOString(), raisedDistId: j.distId } : e));
        showToast(`تم الرفع — التوزيعة ${j.distId?.replace('dist-', '') || ''} و${j.transferNumbers?.length || 0} تحويلات مسودّة`);
      } else showToast(j.error || 'فشل الرفع');
    } catch { showToast('تعذر الاتصال بالخادم'); }
  };

  const rejectInboxItem = async (id: string) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const r = await fetch(`/api/intake-inbox/${encodeURIComponent(id)}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const j = await r.json();
      if (j.ok) setIntakeInbox((prev) => prev.map((e) => e.id === id ? { ...e, status: 'rejected' as const, rejectedAt: new Date().toISOString() } : e));
      else showToast(j.error || 'فشل الرفض');
    } catch { showToast('تعذر الاتصال بالخادم'); }
  };

  const raiseAllMatchedInbox = async (): Promise<number> => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const r = await fetch('/api/intake-inbox/raise-all-matched', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const j = await r.json();
      if (j.ok && j.raised > 0) {
        showToast(`تم رفع ${j.raised} رسالة متطابقة تلقائياً`);
        setIntakeInbox((prev) => prev.map((e) => e.status === 'pending' && e.quality?.score === 100 ? { ...e, status: 'raised' as const, raisedAt: new Date().toISOString() } : e));
        return j.raised;
      }
    } catch { /* noop */ }
    return 0;
  };

  const bindAndRaiseInboxItem = async (id: string, body: { itemId?: string; fromId?: string; targets?: { index: number; toBranchId: string }[] }) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const r = await fetch(`/api/intake-inbox/${encodeURIComponent(id)}/bind-raise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.ok) {
        setIntakeInbox((prev) => prev.map((e) => e.id === id ? { ...e, status: 'raised' as const, raisedAt: new Date().toISOString(), raisedDistId: j.distId } : e));
        const learnMsg = j.learned ? ` + ${j.learned} مرادف جديد` : '';
        showToast(`تم الربط والرفع — ${j.transferNumbers?.length || 0} تحويلات مسودّة${learnMsg}`);
      } else showToast(j.error || 'فشل الربط والرفع');
      return j;
    } catch { showToast('تعذر الاتصال بالخادم'); return { ok: false }; }
  };

  // إرجاع الإذن المعتمد إلى مسودة: عكس حركة المخزون + قيد محاسبي عكسي
  const revertStockTransferToDraft = (id: string) => {
    const target = stockTransfers.find((t) => t.id === id);
    if (!target || target.status !== 'approved') return;
    if (isDateClosed(target.date)) { showToast('شهر مقفل — لا يمكن إرجاع تحويل معتمد في شهر مغلق'); return; }
    target.items.forEach((item) => {
      if (item.itemType === 'recipe' && item.recipeId) {
        adjustRecipeInventory(target.fromBranchId, item.recipeId, item.quantity);
        adjustRecipeInventory(target.toBranchId, item.recipeId, -item.quantity);
      } else {
        adjustInventory(target.fromBranchId, item.rawMaterialId!, item.quantity, undefined, { type: 'إلغاء تحويل', ref: target.id });
        adjustInventory(target.toBranchId, item.rawMaterialId!, -item.quantity, undefined, { type: 'إلغاء تحويل', ref: target.id });
      }
    });
    setStockTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'draft', approvedBy: undefined } : t)));
    logAudit('إرجاع إذن تحويل معتمد للمسودة', 'المخزون', target.transferNumber, { type: 'stockTransfer', id: target.id });
  };

  const addAccount = (data: Omit<Account, 'id'>) => {
    setAccounts((prev) => [{ ...data, id: `acc-${Date.now()}`, isActive: data.isActive ?? true }, ...prev]);
    logAudit('إضافة حساب', 'المحاسبة', data.name);
  };

  const postEntry = (description: string, lines: JournalLine[], source: 'manual' | 'auto' = 'auto', refNumber?: string) => {
    if (lines.length === 0) return;
    const total = lines.reduce((s, l) => s + l.debit, 0);
    const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(total - creditTotal) > 0.01) return;
    setJournalEntries((prev) => [{
      id: `je-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entryNumber: `JE-${new Date().getFullYear()}-${String(prev.length + 1).padStart(4, '0')}`,
      date: today(), description, lines, source, refNumber,
    }, ...prev]);
  };

  const addJournalEntry = (e: { date: string; description: string; lines: JournalLine[] }): { ok: boolean; error?: string } => {
    const lines = e.lines.filter((l) => l.debit > 0 || l.credit > 0);
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    if (lines.length < 2) return { ok: false, error: 'يجب إدخال سطرين على الأقل (مدين ودائن)' };
    if (Math.abs(debit - credit) > 0.01) return { ok: false, error: 'القيد غير متوازن: إجمالي المدين يجب أن يساوي إجمالي الدائن' };
    setJournalEntries((prev) => [{
      id: `je-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entryNumber: `JE-${new Date().getFullYear()}-${String(prev.length + 1).padStart(4, '0')}`,
      date: e.date || today(), description: e.description, lines, source: 'manual',
    }, ...prev]);
    logAudit('إضافة قيد يومية', 'المحاسبة', e.description);
    return { ok: true };
  };

  const recordPhysicalCount = (data: Omit<PhysicalStockCount, 'id' | 'date'>) => {
    const newCount: PhysicalStockCount = { ...data, id: `psc-${Date.now()}`, date: today() };
    setPhysicalCounts((prev) => [newCount, ...prev]);
    newCount.items.forEach((item) => {
      setInventory((prev) => prev.map((i) => i.branchId === newCount.branchId && i.rawMaterialId === item.rawMaterialId ? { ...i, quantity: item.actualQty, lastUpdated: today() } : i));
    });
    logAudit('جرد مخزون فعلي', 'المخزون', `فرق ${newCount.totalVarianceCost} ر.س`);
  };

  const addDailyCount = (data: Omit<DailyInventoryCount, 'id'>) => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newCount: DailyInventoryCount = {
      ...data,
      id: `dc-${Date.now()}`,
      docNo: data.docNo || nextDocSequence('DC', { existing: dailyCounts.map((d) => d.docNo || '') }),
      today: data.today || todayStr,
    };
    setDailyCounts((prev) => [newCount, ...prev]);
  };

  const deleteDailyCount = (id: string) => {
    // حذف نهائي عبر شاهد (tombstone): الخادم يحذف السجل من كل مجموعاته ولا يعود أبداً
    setDeletedIds((prev) => (Array.isArray(prev) && prev.includes(id) ? prev : [...(Array.isArray(prev) ? prev : []), id]));
    setDailyCounts((prev) => prev.filter((c) => c.id !== id));
  };

  const updateDailyCount = (id: string, data: Partial<Omit<DailyInventoryCount, 'id'>>) =>
    setDailyCounts((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));

  const addEmployeeMeal = (data: Omit<EmployeeMealRecord, 'id'>) => {
    const meal: EmployeeMealRecord = { ...data, id: `meal-${Date.now()}` };
    setEmployeeMeals((prev) => [meal, ...prev]);
    logAudit('تسجيل وجبة عامل', 'العمالة', `${meal.employeeName} - ${meal.menuItem}`);
  };

  const deleteEmployeeMeal = (id: string) => setEmployeeMeals((prev) => prev.filter((m) => m.id !== id));

  const addButcherTest = (data: Omit<ButcherTest, 'id'>) => {
    const test: ButcherTest = { ...data, id: `bt-${Date.now()}` };
    setButcherTests((prev) => [test, ...prev]);
    logAudit('إضافة اختبار جزارة', 'المخزون', `${data.rawMaterialName} — ${data.yieldPercent.toFixed(1)}% إنتاجية`);
  };

  const updateButcherTest = (id: string, data: Partial<ButcherTest>) =>
    setButcherTests((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));

  const deleteButcherTest = (id: string) => setButcherTests((prev) => prev.filter((t) => t.id !== id));

  const postButcherTest = (id: string): { ok: boolean; error?: string } => {
    const test = butcherTests.find((t) => t.id === id);
    if (!test) return { ok: false, error: 'الاختبار غير موجود' };
    if (test.posted) return { ok: false, error: 'تم ترحيل الاختبار مسبقاً' };
    const material = rawMaterials.find((m) => m.id === test.rawMaterialId);
    if (!material) return { ok: false, error: 'مادة خام غير موجودة' };
    const newPrice = Number(test.costPerUsableKg.toFixed(2));
    updateRawMaterial(test.rawMaterialId, { standardPrice: newPrice });
    setButcherTests((prev) => prev.map((t) => (t.id === id ? { ...t, posted: true } : t)));
    logAudit('ترحيل اختبار جزارة', 'المخزون', `${test.rawMaterialName}: السعر الجديد ${fmtMoney(newPrice)}/كجم`);
    showToast(`تم تحديث سعر ${material.nameAr} إلى ${fmtMoney(newPrice)}/كجم`);
    return { ok: true };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // تصنيفات المواد المخصصة — CRUD
  // ═══════════════════════════════════════════════════════════════════════════
  const addMaterialCategory = (data: Omit<MaterialCategoryDef, 'id' | 'createdAt'>) => {
    const cat: MaterialCategoryDef = {
      ...data,
      id: `mc-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setMaterialCategories((prev) => [cat, ...prev]);
  };

  const updateMaterialCategory = (id: string, data: Partial<MaterialCategoryDef>) =>
    setMaterialCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));

  const deleteMaterialCategory = (id: string) => {
    const cat = materialCategories.find((c) => c.id === id);
    if (cat?.isDefault) { showToast('لا يمكن حذف التصنيفات الافتراضية', { level: 'error' }); return; }
    setMaterialCategories((prev) => prev.filter((c) => c.id !== id));
    showToast(`تم حذف التصنيف "${cat?.labelAr || ''}"`, {
      level: 'success',
      undo: () => { if (cat) setMaterialCategories((prev) => [cat, ...prev]); },
    });
  };

  const manufactureRecipe = (data: { branchId: string; recipeId: string; batchSize: number; producedBy: string }): { ok: boolean; error?: string } => {
    if (isDateClosed(today())) { showToast('شهر مقفل — لا يمكن التصنيع'); return { ok: false, error: 'شهر مغلق — لا يمكن التصنيع' }; }
    const recipe = recipes.find((r) => r.id === data.recipeId);
    if (!recipe) return { ok: false, error: 'الوصفة غير موجودة' };
    if (data.batchSize <= 0) return { ok: false, error: 'أدخل عدد الدفعات' };
    const items: ProductionRunItem[] = recipe.ingredients.map((ing) => {
      const availableQty = inventory.find((i) => i.branchId === data.branchId && i.rawMaterialId === ing.rawMaterialId)?.quantity || 0;
      return {
        rawMaterialId: ing.rawMaterialId,
        materialName: getRawMaterialName(ing.rawMaterialId),
        unit: rawMaterials.find((m) => m.id === ing.rawMaterialId)?.unit || '',
        requiredQty: recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * data.batchSize),
        availableQty,
        unitCost: getAverageUnitCost(ing.rawMaterialId),
      };
    });
    const short = items.find((i) => i.requiredQty > i.availableQty + 0.0001);
    if (short) return { ok: false, error: `رصيد غير كافٍ لـ ${short.materialName}` };
    items.forEach((i) => adjustInventory(data.branchId, i.rawMaterialId, -i.requiredQty, undefined, { type: 'تصنيع' }));
    adjustRecipeInventory(data.branchId, recipe.id, data.batchSize);
    const totalCost = items.reduce((s, i) => s + i.requiredQty * i.unitCost, 0);
    const run: ProductionRun = {
      id: `pr-${Date.now()}`,
      branchId: data.branchId,
      recipeId: recipe.id,
      recipeCode: recipe.code,
      recipeName: recipe.nameAr,
      batchSize: data.batchSize,
      producedQty: data.batchSize,
      unit: recipe.portionSize || 'وحدة',
      producedBy: data.producedBy || 'المستخدم',
      date: today(),
      items,
      totalCost,
      status: 'completed',
    };
    setProductionRuns((prev) => [run, ...prev]);
    logAudit('تصنيع صنف أساسي', 'الإنتاج', `${recipe.nameAr} - ${data.batchSize} ${recipe.portionSize || 'وحدة'} بقيمة ${totalCost.toFixed(2)}`);
    return { ok: true };
  };

  const deleteProductionRun = (id: string) => setProductionRuns((prev) => prev.filter((r) => r.id !== id));

  const addOperatingExpense = (data: Omit<OperatingExpense, 'id' | 'expenseNumber' | 'createdAt'>) => {
    const expenseNumber = nextDocSequence('EXP', { existing: operatingExpenses.map((e) => e.expenseNumber) });
    setOperatingExpenses((prev) => [{
      ...data, id: `exp-${Date.now()}`,
      expenseNumber,
      createdAt: new Date().toISOString(),
    }, ...prev]);
    postEntry(`مصروف ${data.description} - ${data.branchId}`, [
      { accountId: 'acc-opex', debit: data.amount, credit: 0 },
      { accountId: 'acc-cash', debit: 0, credit: data.amount },
    ], 'auto', expenseNumber);
    logAudit('إضافة مصروف', 'المصاريف', data.description);
  };
  const updateOperatingExpense = (id: string, data: Partial<OperatingExpense>) => setOperatingExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)));
  const deleteOperatingExpense = (id: string) => setOperatingExpenses((prev) => prev.filter((e) => e.id !== id));

  const setExpenseBudget = (branchId: string, month: string, items: ExpenseBudget['items']) => {
    setExpenseBudgets((prev) => {
      const existing = prev.find((b) => b.branchId === branchId && b.month === month);
      if (existing) return prev.map((b) => (b.branchId === branchId && b.month === month ? { ...b, items } : b));
      return [...prev, { branchId, month, items }];
    });
  };

  const addCustomer = (data: Omit<Customer, 'id' | 'code'>) => {
    setCustomers((prev) => [{ ...data, id: `cus-${Date.now()}`, code: `CUS-${String(prev.length + 1).padStart(3, '0')}` }, ...prev]);
    logAudit('إضافة عميل', 'العملاء', data.name);
  };
  const updateCustomer = (id: string, data: Partial<Customer>) => setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));

  const deleteCustomer = (id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    logAudit('حذف عميل', 'العملاء', id);
  };

  const addReservation = (data: Omit<Reservation, 'id' | 'reservationNumber' | 'createdAt'>) => {
    setReservations((prev) => [{
      ...data, id: `res-${Date.now()}`,
      reservationNumber: nextDocSequence('RES', { existing: reservations.map((r) => r.reservationNumber) }),
      createdAt: new Date().toISOString(),
    }, ...prev]);
    logAudit('إضافة حجز', 'الحجوزات', data.customerName);
  };
  const updateReservationStatus = (id: string, status: Reservation['status']) => setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

  const deleteReservation = (id: string) => {
    setReservations((prev) => prev.filter((r) => r.id !== id));
    logAudit('حذف حجز', 'الحجوزات', id);
  };

  const addInvoice = (data: Omit<Invoice, 'id' | 'invoiceNumber'>) => {
    const prefix = data.type === 'sales' ? 'SL' : 'PU';
    const number = nextDocSequence('INV', { existing: invoices.map((i) => i.invoiceNumber), segment: prefix });
    setInvoices((prev) => [{
      ...data, id: `inv-${Date.now()}`,
      invoiceNumber: number,
    }, ...prev]);
    if (data.type === 'sales') {
      postEntry(`فاتورة مبيعات ${number} - ${data.partyName}`, [
        { accountId: 'acc-ar', debit: data.totalAmount, credit: 0 },
        { accountId: 'acc-rev', debit: 0, credit: data.subtotal },
        { accountId: 'acc-vat', debit: 0, credit: data.vatAmount },
      ], 'auto', number);
    } else {
      postEntry(`فاتورة مشتريات ${number} - ${data.partyName}`, [
        { accountId: 'acc-inv', debit: data.totalAmount, credit: 0 },
        { accountId: 'acc-ap', debit: 0, credit: data.totalAmount },
      ], 'auto', number);
    }
    logAudit('إضافة فاتورة', 'الفواتير', data.partyName);
  };
  const updateInvoice = (id: string, data: Partial<Invoice>) => setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)));

  const deleteInvoice = (id: string) => {
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    logAudit('حذف فاتورة', 'الفواتير', id);
  };

  const recordInvoicePayment = (id: string, amount: number) => {
    let paidInfo: { inv: Invoice | undefined; paidAmount: number } = { inv: undefined, paidAmount: 0 };
    setInvoices((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const paidAmount = Math.min(i.totalAmount, i.paidAmount + amount);
      const status: Invoice['status'] = paidAmount >= i.totalAmount ? 'paid' : paidAmount > 0 ? 'partially_paid' : i.status;
      paidInfo = { inv: i, paidAmount };
      return { ...i, paidAmount, status };
    }));
    if (paidInfo.inv) {
      const amt = paidInfo.paidAmount - (paidInfo.inv.paidAmount || 0);
      if (amt > 0) {
        if (paidInfo.inv.type === 'sales') {
          postEntry(`تحصيل من العميل ${paidInfo.inv.partyName} (${paidInfo.inv.invoiceNumber})`, [
            { accountId: 'acc-cash', debit: amt, credit: 0 },
            { accountId: 'acc-ar', debit: 0, credit: amt },
          ], 'auto', paidInfo.inv.invoiceNumber);
        } else {
          postEntry(`دفعة لمورد ${paidInfo.inv.partyName} (${paidInfo.inv.invoiceNumber})`, [
            { accountId: 'acc-ap', debit: amt, credit: 0 },
            { accountId: 'acc-cash', debit: 0, credit: amt },
          ], 'auto', paidInfo.inv.invoiceNumber);
        }
      }
    }
    logAudit('تسجيل دفعة فاتورة', 'الفواتير', `${amount} ر.س`);
  };

  const addFoodMenu = (data: Omit<FoodMenu, 'id' | 'code'>) => setFoodMenus((prev) => [{ ...data, id: `menu-${Date.now()}`, code: `MENU-${Math.floor(100 + Math.random() * 900)}` }, ...prev]);
  const updateFoodMenu = (id: string, data: Partial<FoodMenu>) => setFoodMenus((prev) => prev.map((m) => (m.id === id ? { ...m, ...data } : m)));
  const deleteFoodMenu = (id: string) => { tombstoneIds([id]); setFoodMenus((prev) => prev.filter((m) => m.id !== id)); };
  const addMenuPlan = (data: Omit<MenuPlan, 'id'>) => setMenuPlans((prev) => [{ ...data, id: `plan-${Date.now()}` }, ...prev]);
  const updateMenuPlan = (id: string, data: Partial<MenuPlan>) => setMenuPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
  const deleteMenuPlan = (id: string) => setMenuPlans((prev) => prev.filter((p) => p.id !== id));

  const addDeliveryApp = (data: Omit<DeliveryApp, 'id'>) => setDeliveryApps((prev) => [{ ...data, id: `app-${Date.now()}` }, ...prev]);
  const updateDeliveryApp = (id: string, data: Partial<DeliveryApp>) => {
    setDeliveryApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
    // نشر إعادة تسمية التطبيق على سجلات المبيعات المخزنة
    if (data.name) {
      setDeliverySales((prev) => prev.map((s) => (s.platformId === id && s.platformName !== data.name ? { ...s, platformName: data.name! } : s)));
    }
  };
  const deleteDeliveryApp = (id: string) => setDeliveryApps((prev) => prev.filter((a) => a.id !== id));
  const getDeliveryAppName = (id: string) => deliveryApps.find((a) => a.id === id)?.name || id;

  const addDeliverySale = (data: Omit<DeliverySale, 'id'>) => setDeliverySales((prev) => [{ ...data, id: `dsale-${Date.now()}` }, ...prev]);
  const updateDeliverySale = (id: string, data: Partial<DeliverySale>) => setDeliverySales((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
  const deleteDeliverySale = (id: string) => setDeliverySales((prev) => prev.filter((s) => s.id !== id));

  const addBatchSalesRecord = (data: Omit<BatchSalesRecord, 'id' | 'batchNumber' | 'createdAt'>) => {
    if (isDateClosed(data.date || new Date().toISOString())) { showToast('شهر مقفل — لا يمكن تسجيل مبيعات دفعة في شهر مغلق'); return; }
    const netRevenue = data.netRevenue ?? netOfGross(data.totalRevenue, data.vatRate ?? VAT_RATE);
    const commissionPercent = data.source === 'delivery' ? (data.commissionPercent ?? 0) : 0;
    const commissionAmount = commissionPercent ? netRevenue * (commissionPercent / 100) : 0;
    const netAfterCommission = netRevenue - commissionAmount;
    const newRecord: BatchSalesRecord = {
      ...data, id: `bs-${Date.now()}`, batchNumber: nextDocSequence('BS', { existing: batchSalesRecords.map((r) => r.batchNumber) }),
      vatRate: data.vatRate ?? VAT_RATE,
      netRevenue,
      vatAmount: data.vatAmount ?? (data.totalRevenue - netRevenue),
      commissionAmount: Number(commissionAmount.toFixed(2)),
      netAfterCommission: Number(netAfterCommission.toFixed(2)),
      foodCostPercent: netAfterCommission ? (data.totalFoodCost / netAfterCommission) * 100 : 0,
      createdAt: new Date().toISOString(), rawMaterialsDeducted: deductSalesFromInventory,
    };
    setBatchSalesRecords((prev) => [newRecord, ...prev]);

    // ---- خصم المبيعات من المخزون (حسب إعداد النظام) ----
    if (deductSalesFromInventory) {
      newRecord.items.forEach((item) => {
        const recipe = recipes.find((r) => r.id === item.recipeId);
        recipe?.ingredients.forEach((ing) => adjustInventory(newRecord.branchId, ing.rawMaterialId, -recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * item.quantitySold), undefined, { type: 'بيع مجمعة', ref: newRecord.batchNumber }));
        recipe?.subPrepIngredients?.forEach((sp) => adjustRecipeInventory(newRecord.branchId, sp.recipeId, -(sp.quantity * item.quantitySold)));
      });
    }
    postEntry(`مبيعات مجمعة ${newRecord.batchNumber} - ${newRecord.branchName}`, [
      { accountId: 'acc-cash', debit: newRecord.totalRevenue, credit: 0 },
      { accountId: 'acc-rev', debit: 0, credit: newRecord.totalRevenue },
    ], 'auto', newRecord.batchNumber);
    postEntry(`تكلفة المبيعات ${newRecord.batchNumber}`, [
      { accountId: 'acc-cogs', debit: newRecord.totalFoodCost, credit: 0 },
      { accountId: 'acc-inv', debit: 0, credit: newRecord.totalFoodCost },
    ], 'auto', newRecord.batchNumber);
    logAudit('إدخال مبيعات مجمعة', 'المبيعات', newRecord.batchNumber, { type: 'batchSales', id: newRecord.id });
  };

  const updateBatchSalesRecord = (id: string, data: Partial<BatchSalesRecord>) => {
    setBatchSalesRecords((prev) => prev.map((b) => {
      if (b.id !== id) return b;
      const branchId = data.branchId || b.branchId;
      const items = data.items || b.items;
      const totalRevenue = items.reduce((s, i) => s + i.lineTotalRevenue, 0);
      const totalFoodCost = items.reduce((s, i) => s + i.lineTotalCost, 0);
      const vatRate = data.vatRate ?? b.vatRate ?? VAT_RATE;
      const netRevenue = data.netRevenue ?? netOfGross(totalRevenue, vatRate);
      const vatAmount = data.vatAmount ?? (totalRevenue - netRevenue);
      const commissionPercent = data.source === 'delivery' ? (data.commissionPercent ?? b.commissionPercent ?? 0) : (b.source === 'delivery' ? (b.commissionPercent ?? 0) : 0);
      const commissionAmount = commissionPercent ? netRevenue * (commissionPercent / 100) : 0;
      const netAfterCommission = netRevenue - commissionAmount;
      const foodCostPercent = netAfterCommission ? (totalFoodCost / netAfterCommission) * 100 : 0;

      // ---- عكس الخصم القديم (إذا كان السجل قد خصم فعلاً حين إنشائه) ----
      if (b.rawMaterialsDeducted) {
        b.items.forEach((item) => {
          const recipe = recipes.find((r) => r.id === item.recipeId);
          recipe?.ingredients.forEach((ing) => adjustInventory(b.branchId, ing.rawMaterialId, recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * item.quantitySold), undefined, { type: 'تراجع تعديل بيع', ref: b.batchNumber }));
          recipe?.subPrepIngredients?.forEach((sp) => adjustRecipeInventory(b.branchId, sp.recipeId, sp.quantity * item.quantitySold));
        });
      }

      // ---- تطبيق الخصم الجديد (إذا كان الإعداد مفعّلاً) ----
      if (deductSalesFromInventory) {
        items.forEach((item) => {
          const recipe = recipes.find((r) => r.id === item.recipeId);
          recipe?.ingredients.forEach((ing) => adjustInventory(branchId, ing.rawMaterialId, -recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * item.quantitySold), undefined, { type: 'تعديل بيع مجمعة', ref: b.batchNumber }));
          recipe?.subPrepIngredients?.forEach((sp) => adjustRecipeInventory(branchId, sp.recipeId, -(sp.quantity * item.quantitySold)));
        });
      }

      const dRevenue = totalRevenue - b.totalRevenue;
      const dCogs = totalFoodCost - b.totalFoodCost;
      if (dRevenue !== 0 || dCogs !== 0) {
        postEntry(`تعديل مبيعات ${b.batchNumber}`, [
          ...(dRevenue !== 0 ? [
            { accountId: 'acc-cash', debit: dRevenue > 0 ? dRevenue : 0, credit: dRevenue > 0 ? 0 : -dRevenue },
            { accountId: 'acc-rev', debit: dRevenue > 0 ? 0 : -dRevenue, credit: dRevenue > 0 ? dRevenue : 0 },
          ] : []),
          ...(dCogs !== 0 ? [
            { accountId: 'acc-cogs', debit: dCogs > 0 ? dCogs : 0, credit: dCogs > 0 ? 0 : -dCogs },
            { accountId: 'acc-inv', debit: dCogs > 0 ? 0 : -dCogs, credit: dCogs > 0 ? dCogs : 0 },
          ] : []),
        ], 'auto', b.batchNumber);
      }
      return { ...b, ...data, branchId, items, totalRevenue, totalFoodCost, foodCostPercent, vatRate, netRevenue, vatAmount, commissionAmount: Number(commissionAmount.toFixed(2)), netAfterCommission: Number(netAfterCommission.toFixed(2)), rawMaterialsDeducted: deductSalesFromInventory };
    }));
    logAudit('تعديل مبيعات مجمعة', 'المبيعات', id, { type: 'batchSales', id });
  };

  const deleteBatchSalesRecord = (id: string) => {
    const rec = batchSalesRecords.find((b) => b.id === id);
    if (!rec) return;
    // ---- عكس الخصم عند الحذف (إذا كان السجل قد خصم المخزون حين إنشائه) ----
    if (rec.rawMaterialsDeducted) {
      rec.items.forEach((item) => {
        const recipe = recipes.find((r) => r.id === item.recipeId);
        recipe?.ingredients.forEach((ing) => adjustInventory(rec.branchId, ing.rawMaterialId, recipeStockQty(ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * item.quantitySold), undefined, { type: 'إرجاع حذف بيع', ref: rec.batchNumber }));
        recipe?.subPrepIngredients?.forEach((sp) => adjustRecipeInventory(rec.branchId, sp.recipeId, sp.quantity * item.quantitySold));
      });
    }
    postEntry(`حذف مبيعات ${rec.batchNumber} (إرجاع)`, [
      { accountId: 'acc-cash', debit: 0, credit: rec.totalRevenue },
      { accountId: 'acc-rev', debit: rec.totalRevenue, credit: 0 },
    ], 'auto', rec.batchNumber);
    postEntry(`إرجاع تكلفة ${rec.batchNumber}`, [
      { accountId: 'acc-cogs', debit: 0, credit: rec.totalFoodCost },
      { accountId: 'acc-inv', debit: rec.totalFoodCost, credit: 0 },
    ], 'auto', rec.batchNumber);
    tombstoneIds([id]);
    setBatchSalesRecords((prev) => prev.filter((b) => b.id !== id));
    logAudit('حذف مبيعات مجمعة', 'المبيعات', rec.batchNumber, { type: 'batchSales', id: rec.id });
  };

  const addCategory = (data: Omit<CustomCategory, 'id'>) => setCustomCategories((prev) => [{ ...data, id: `cat-${Date.now()}` }, ...prev]);
  const deleteCategory = (id: string) => setCustomCategories((prev) => prev.filter((c) => c.id !== id));

  // ---- Multi-currency ----
  const getCurrencyRate = (code: string) => {
    if (!code || code === 'SAR') return 1;
    return currencies.find((c) => c.code === code)?.rateToBase ?? 1;
  };
  const convertToBase = (amount: number, code: string) => amount * getCurrencyRate(code);
  const addCurrency = (c: { code: string; nameAr: string; symbol: string; rateToBase: number; isActive: boolean }) => {
    if (!c.code.trim()) return;
    const code = c.code.trim().toUpperCase();
    if (currencies.some((x) => x.code === code)) { showToast(`العملة ${code} موجودة مسبقاً`); return; }
    setCurrencies((prev) => [{ ...c, code, isBase: false }, ...prev]);
    logAudit('إضافة عملة', 'العملات', `${code} بسعر ${c.rateToBase}`);
  };
  const updateCurrency = (code: string, d: Partial<Currency>) => setCurrencies((prev) => prev.map((c) => (c.code === code ? { ...c, ...d } : c)));
  const deleteCurrency = (code: string) => {
    if (code === 'SAR') { showToast('لا يمكن حذف عملة الأساس (الريال)'); return; }
    setCurrencies((prev) => prev.filter((c) => c.code !== code));
    logAudit('حذف عملة', 'العملات', code);
  };

  // ---- Companies ----
  const getCompanyName = (id: string) => companies.find((c) => c.id === id)?.nameAr || id;
  const addCompany = (data: Omit<Company, 'id' | 'code'>) => {
    const newCompany: Company = { ...data, id: `co-${Date.now()}`, code: `CO-${Math.floor(100 + Math.random() * 900)}` };
    setCompanies((prev) => [newCompany, ...prev]);
    logAudit('إضافة شركة', 'الشركات', newCompany.nameAr);
  };
  const updateCompany = (id: string, data: Partial<Company>) => setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
  const deleteCompany = (id: string) => {
    const used = branches.filter((b) => b.companyId === id).length;
    if (used > 0) { showToast(`لا يمكن حذف الشركة — مرتبط بها ${used} فرع`); return; }
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    // تسجيل في قائمة "المحذوفة نهائياً" حتى لا يعيد الخادم زرعها من أي نسخة/جهاز آخر.
    const current = Array.isArray(deletedIds) ? deletedIds : [];
    if (!current.includes(id)) setDeletedIds((prev) => (Array.isArray(prev) && prev.includes(id) ? prev : [...(Array.isArray(prev) ? prev : []), id]));
    logAudit('حذف شركة', 'الشركات', id);
  };

  // ---- Department requisitions (internal issue) ----
  const addRequisition = (data: Omit<DepartmentRequisition, 'id' | 'reqNumber' | 'status' | 'totalQty'>) => {
    if (isDateClosed(data.date || new Date().toISOString())) { showToast('شهر مقفل — لا يمكن إنشاء أذن صرف في شهر مغلق'); return; }
    const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);
    const newReq: DepartmentRequisition = { ...data, totalQty, id: `req-${Date.now()}`, reqNumber: nextDocSequence('ISSUE', { existing: requisitions.map((r) => r.reqNumber) }), status: 'draft' };
    setRequisitions((prev) => [newReq, ...prev]);
    logAudit('إنشاء أذن صرف داخلي', 'المشتريات', `${newReq.reqNumber} — ${newReq.department}`, { type: 'requisition', id: newReq.id });
  };
  const submitRequisition = (id: string) => setRequisitions((prev) => prev.map((r) => (r.id === id && r.status === 'draft' ? { ...r, status: 'pending' as const } : r)));
  const approveRequisition = (id: string) => {
    const r0 = requisitions.find((r) => r.id === id);
    if (!r0) return;
    if (isDateClosed(r0.date)) { showToast('شهر مقفل — لا يمكن اعتماد أذن صرف في شهر مغلق'); return; }
    const shortage: string[] = [];
    r0.items.forEach((item) => {
      const available = inventory.filter((i) => i.branchId === r0.branchId && i.rawMaterialId === item.rawMaterialId).reduce((s, i) => s + i.quantity, 0);
      if (available < item.quantity) shortage.push(`${item.itemName} (المتوفر ${available} ${item.unit}، المطلوب ${item.quantity})`);
    });
    if (shortage.length > 0) { showToast(`رصيد غير كافٍ لاعتماد الصرف: ${shortage.join('، ')}`); return; }
    const totalCost = r0.items.reduce((s, i) => s + i.quantity * getAverageUnitCost(i.rawMaterialId), 0);
    setRequisitions((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (r.status === 'pending') {
        r.items.forEach((item) => adjustInventory(r.branchId, item.rawMaterialId, -item.quantity));
        if (totalCost > 0) postEntry(`صرف داخلي ${r.reqNumber} - ${r.department} (${getBranchName(r.branchId)})`, [
          { accountId: 'acc-cogs', debit: totalCost, credit: 0 },
          { accountId: 'acc-inv', debit: 0, credit: totalCost },
        ], 'auto', r.reqNumber);
      }
      return { ...r, status: 'approved' as const, approvedBy: currentUser?.name || 'النظام', approvedAt: new Date().toISOString() };
    }));
    logAudit('اعتماد أذن صرف داخلي', 'المشتريات', `${r0.reqNumber} — ${r0.department} بقيمة ${totalCost.toFixed(2)} ر.س`, { type: 'requisition', id: r0.id });
  };
  const rejectRequisition = (id: string, reason: string) => setRequisitions((prev) => prev.map((r) => (r.id === id && r.status === 'pending' ? { ...r, status: 'rejected' as const, rejectReason: reason } : r)));
  const cancelRequisition = (id: string) => setRequisitions((prev) => prev.map((r) => (r.id === id && (r.status === 'draft' || r.status === 'pending') ? { ...r, status: 'cancelled' as const } : r)));
  const deleteRequisition = (id: string) => {
    const r0 = requisitions.find((r) => r.id === id);
    if (r0 && r0.status === 'approved') { showToast('لا يمكن حذف أذن صرف معتمد'); return; }
    setRequisitions((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRecipeTargetMargin = (recipeId: string, targetMarginPercent: number) => {
    setRecipes((prev) => prev.map((r) => r.id === recipeId ? { ...r, targetMarginPercent, targetFoodCostPercent: 100 - targetMarginPercent } : r));
  };

  const acknowledgeAlert = (recipeId: string) => setAcknowledgedAlertIds((prev) => prev.includes(recipeId) ? prev : [...prev, recipeId]);
  const unacknowledgeAlert = (recipeId: string) => setAcknowledgedAlertIds((prev) => prev.filter((id) => id !== recipeId));

  const resetDemoData = () => {
    setBranches(INITIAL_BRANCHES); setSuppliers(INITIAL_SUPPLIERS); setRawMaterials(INITIAL_RAW_MATERIALS);
    setRecipes(INITIAL_RECIPES); setInventory(INITIAL_INVENTORY); setInventoryBatches([]); setGrnNotes(INITIAL_GRN_NOTES);
    setTempLogs([]); setHaccpInspections([]);
    setPurchaseOrders(INITIAL_PURCHASE_ORDERS); setPurchaseRequests([]); setWorkOrders(INITIAL_WORK_ORDERS); setWastageLogs(INITIAL_WASTAGE_LOGS); setInventoryMovements([]); setClosedDays([]);
    setEmployees(INITIAL_EMPLOYEES); setShifts(INITIAL_LABOR_SHIFTS); setPosOrders(INITIAL_POS_ORDERS);
    setStockTransfers(INITIAL_STOCK_TRANSFERS); setRecipeInventory(INITIAL_RECIPE_INVENTORY); setPhysicalCounts([]); setCustomCategories(INITIAL_CATEGORIES);
    setFoodMenus(INITIAL_FOOD_MENUS); setBatchSalesRecords(INITIAL_BATCH_SALES); setMenuPlans([]);
    setOperatingExpenses(INITIAL_OPERATING_EXPENSES); setExpenseBudgets(INITIAL_EXPENSE_BUDGETS);
    setCustomers(INITIAL_CUSTOMERS); setReservations(INITIAL_RESERVATIONS); setInvoices(INITIAL_INVOICES);
    setAccounts(INITIAL_ACCOUNTS); setJournalEntries(INITIAL_JOURNAL_ENTRIES); setPosReturns([]);
    setFixedAssets(INITIAL_FIXED_ASSETS); setScheduledReports(INITIAL_SCHEDULED_REPORTS); setAutomationRules(INITIAL_AUTOMATION_RULES);
    setDailyCounts([]); setEmployeeMeals([]); setProductionRuns([]); setOpeningBalancesRec([]);
    setAttendance([]); setPayrollPeriods([]);
    setCurrencies(INITIAL_CURRENCIES); setCompanies(INITIAL_COMPANIES); setRequisitions([]);
    setRecipeSections(DEFAULT_RECIPE_SECTIONS);
    setUnitsOfMeasure(INITIAL_UNITS); setTasks([]);
  };

  const clearSystemData = () => {
    const emptyArrays: [string, (v: any[]) => void][] = [
      ['rcerp_branches', setBranches], ['rcerp_suppliers', setSuppliers], ['rcerp_raw_materials', setRawMaterials],
      ['rcerp_recipes', setRecipes], ['rcerp_inventory', setInventory], ['rcerp_inventory_batches', setInventoryBatches], ['rcerp_grn', setGrnNotes],
      ['rcerp_purchase_orders', setPurchaseOrders], ['rcerp_purchase_requests', setPurchaseRequests], ['rcerp_work_orders', setWorkOrders], ['rcerp_wastage', setWastageLogs],
      ['rcerp_employees', setEmployees], ['rcerp_shifts', setShifts], ['rcerp_pos_orders', setPosOrders],
      ['rcerp_stock_transfers', setStockTransfers], ['rcerp_physical_counts', setPhysicalCounts],
      ['rcerp_recipe_inventory', setRecipeInventory],
      ['rcerp_food_menus', setFoodMenus], ['rcerp_batch_sales', setBatchSalesRecords], ['rcerp_menu_plans', setMenuPlans],
      ['rcerp_operating_expenses', setOperatingExpenses], ['rcerp_expense_budgets', setExpenseBudgets],
      ['rcerp_customers', setCustomers], ['rcerp_reservations', setReservations], ['rcerp_invoices', setInvoices],
      ['rcerp_accounts', setAccounts], ['rcerp_journal', setJournalEntries], ['rcerp_audit', setAuditLogs],
      ['rcerp_pos_returns', setPosReturns], ['rcerp_daily_counts', setDailyCounts], ['rcerp_opening_balances', setOpeningBalancesRec], ['rcerp_employee_meals', setEmployeeMeals], ['rcerp_production_runs', setProductionRuns],
      ['rcerp_fixed_assets', setFixedAssets], ['rcerp_scheduled_reports', setScheduledReports], ['rcerp_automation_rules', setAutomationRules],
      ['rcerp_currencies', setCurrencies], ['rcerp_companies', setCompanies], ['rcerp_requisitions', setRequisitions],
      ['rcerp_attendance', setAttendance], ['rcerp_payroll', setPayrollPeriods],
      ['rcerp_units', setUnitsOfMeasure], ['rcerp_tasks', setTasks],
    ];
    emptyArrays.forEach(([_key, setter]) => { setter([]); });
    setCustomCategories(INITIAL_CATEGORIES);
    const token = localStorage.getItem('rcerp_token');
    if (token) {
      fetch('/api/clear', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  };

  /** تفريغ محدد: يمسح فقط الجداول المختارة (المفاتيح rcerp_*)، ويُرسل للخادم لنفس الحذف */
  const clearCollections = (keys: string[]) => {
    const setterMap: Record<string, (v: any[]) => void> = {
      rcerp_branches: setBranches, rcerp_suppliers: setSuppliers, rcerp_raw_materials: setRawMaterials,
      rcerp_recipes: setRecipes, rcerp_inventory: setInventory, rcerp_inventory_batches: setInventoryBatches, rcerp_grn: setGrnNotes,
      rcerp_purchase_orders: setPurchaseOrders, rcerp_purchase_requests: setPurchaseRequests, rcerp_work_orders: setWorkOrders, rcerp_wastage: setWastageLogs,
      rcerp_employees: setEmployees, rcerp_shifts: setShifts, rcerp_pos_orders: setPosOrders,
      rcerp_stock_transfers: setStockTransfers, rcerp_physical_counts: setPhysicalCounts,
      rcerp_intake_inbox: setIntakeInbox,
      rcerp_recipe_inventory: setRecipeInventory,
      rcerp_food_menus: setFoodMenus, rcerp_batch_sales: setBatchSalesRecords, rcerp_menu_plans: setMenuPlans,
      rcerp_operating_expenses: setOperatingExpenses, rcerp_expense_budgets: setExpenseBudgets,
      rcerp_customers: setCustomers, rcerp_reservations: setReservations, rcerp_invoices: setInvoices,
      rcerp_accounts: setAccounts, rcerp_journal: setJournalEntries, rcerp_audit: setAuditLogs,
      rcerp_pos_returns: setPosReturns, rcerp_daily_counts: setDailyCounts, rcerp_opening_balances: setOpeningBalancesRec,
      rcerp_employee_meals: setEmployeeMeals, rcerp_production_runs: setProductionRuns,
      rcerp_fixed_assets: setFixedAssets, rcerp_scheduled_reports: setScheduledReports, rcerp_automation_rules: setAutomationRules,
      rcerp_currencies: setCurrencies, rcerp_companies: setCompanies, rcerp_requisitions: setRequisitions,
      rcerp_attendance: setAttendance, rcerp_payroll: setPayrollPeriods, rcerp_pl_summaries: setPlSummaries,
      rcerp_monthly_inventory: setMonthlyInventory, rcerp_closed_months: setClosedMonths,
      rcerp_eod_closures: setEodClosures,
      rcerp_closed_days: setClosedDays, rcerp_inventory_movements: setInventoryMovements,
      rcerp_customer_orders: setCustomerOrders, rcerp_delivery_sales: setDeliverySales,
      rcerp_temp_logs: setTempLogs, rcerp_haccp_inspections: setHaccpInspections,
      rcerp_supplier_quotes: setSupplierQuotes, rcerp_supplier_returns: setSupplierReturns,
      rcerp_units: setUnitsOfMeasure, rcerp_tasks: setTasks,
    };
    const keysToClear = keys.filter((k) => !!setterMap[k]);
    keysToClear.forEach((k) => setterMap[k]([]));
    if (keys.includes('rcerp_categories')) setCustomCategories(INITIAL_CATEGORIES);
    const token = localStorage.getItem('rcerp_token');
    if (token) {
      fetch('/api/clear-collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collections: keysToClear }),
      }).catch(() => {});
    }
  };

  const value: AppContextType = {
    booting, currentUser, users, login, register, logout, updateUser, deleteUser, revokeSessions, totpSetup, totpEnable, totpDisable,
    mustChangePassword, setMustChangePassword, changePassword,
    theme, toggleTheme,
    can, hasRole, visibleBranchIds,
    branches, suppliers, rawMaterials, unitsOfMeasure, addUnitOfMeasure, updateUnitOfMeasure, deleteUnitOfMeasure, materialBarcodes, addMaterialBarcode, updateMaterialBarcode, deleteMaterialBarcode, barcodesForMaterial, findByBarcode, recipes, inventory, inventoryBatches, addInventoryBatches, consumeInventoryBatch, getFefoBatches, expiringBatches, grnNotes, purchaseOrders, purchaseRequests, workOrders,
    wastageLogs, inventoryMovements, closedDays, closeDay, reopenDay, eodClosures, tasks, addTask, updateTask, completeTask, reopenTask, cancelTask, deleteTask, tempLogs, addTempLog, deleteTempLog, haccpInspections, addHaccpInspection, customReports, setCustomReports, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, undo, redo, customerOrders, addCustomerOrder, updateCustomerOrderStatus, employees, shifts, posOrders, stockTransfers, recipeInventory, physicalCounts, plSummaries,
    distributions, approveDistribution, rejectDistribution, updateDistribution,
intakeInbox, raiseInboxItem, rejectInboxItem, 
raiseAllMatchedInbox, bindAndRaiseInboxItem,
    accounts, journalEntries, posReturns,
    fixedAssets, scheduledReports, automationRules,
    setPlSummaries,
    customCategories, foodMenus, menuPlans, batchSalesRecords, operatingExpenses, expenseBudgets,
    customers, reservations, invoices, auditLogs, globalTargetMarginPercent, dataHealth,
    recentDocs, addRecentDoc, clearRecentDocs,
    vatPercent, setVatPercent, vatInclusive, setVatInclusive, deductSalesFromInventory, setDeductSalesFromInventory, deliveryApps, addDeliveryApp, updateDeliveryApp, deleteDeliveryApp, getDeliveryAppName,
    deliverySales, addDeliverySale, updateDeliverySale, deleteDeliverySale,
    addBranch, updateBranch, deleteBranch, addSupplier, updateSupplier, deleteSupplier, addRawMaterial, updateRawMaterial, deleteRawMaterial,
    importRawMaterials, importSuppliers, importCustomers,
    addRecipe, updateRecipe, deleteRecipe, addGoodsReceiptNote, updateGRNStatus, revertGoodsReceiptToDraft, updateGoodsReceiptNote, addPurchaseOrder,
    updatePurchaseOrder, receivePurchaseOrder, recordPurchaseReceipt, rebuildPLSummaries, addWastageLog, addWorkOrder, updateWorkOrderStatus,
    addPurchaseRequest, updatePurchaseRequest, deletePurchaseRequest, convertRequestToPOs,
    addSupplierQuote, updateSupplierQuote, deleteSupplierQuote, getQuotePrice, supplierQuotes,
    addSupplierReturn, updateSupplierReturn, approveSupplierReturn, reprocessSupplierReturn, revertSupplierReturnToDraft, reprocessAllApprovedReturns, supplierReturns,
    monthlyInventory, closedMonths, isMonthClosed, startMonthlyInventory, saveMonthlyInventoryCounts, closeMonthlyInventory, deleteMonthlyInventory, reopenMonthlyInventory,
    addShift, addEmployee, updateEmployee, deleteEmployee, customRoles, addRole, deleteRole, addPOSOrder, updatePOSOrder, deletePOSOrder, addStockTransfer, updateStockTransfer, submitStockTransfer, approveStockTransfer, rejectStockTransfer, revertStockTransferToDraft, deleteStockTransfer, adjustInventory, adjustRecipeInventory, getRecipeStock, addAccount, addJournalEntry,
    attendance, addAttendance, updateAttendance, deleteAttendance, payrollPeriods, generatePayroll, confirmPayroll, deletePayrollPeriod,
    setOpeningBalances,
    addOpeningBalance, updateOpeningBalance, deleteOpeningBalance, openingBalances,
    addPOSReturn, getNotifications, toast, showToast, verifyAdminPassword, ADMIN_PASSWORD,
    recordPhysicalCount, addOperatingExpense,
    dailyCounts, addDailyCount, updateDailyCount, deleteDailyCount, employeeMeals, addEmployeeMeal, deleteEmployeeMeal,
    butcherTests, addButcherTest, updateButcherTest, deleteButcherTest, postButcherTest,
    materialCategories, addMaterialCategory, updateMaterialCategory, deleteMaterialCategory,
    productionRuns, manufactureRecipe, deleteProductionRun,
    updateOperatingExpense, deleteOperatingExpense, setExpenseBudget, addCustomer, updateCustomer, deleteCustomer,
    addReservation, updateReservationStatus, deleteReservation, addInvoice, updateInvoice, deleteInvoice, recordInvoicePayment,
    addFoodMenu, updateFoodMenu, deleteFoodMenu, addMenuPlan, updateMenuPlan, deleteMenuPlan, addBatchSalesRecord, updateBatchSalesRecord, deleteBatchSalesRecord, addCategory, deleteCategory,
    setGlobalTargetMarginPercent, updateRecipeTargetMargin, acknowledgeAlert, unacknowledgeAlert,
    getFoodCostAlerts, resetDemoData, clearSystemData, clearCollections, getBranchName, getRawMaterialName,
    getRawMaterialUnitCost, calculateRecipeCosts, logAudit, runSystemCheck, rebuildSystem,
    getAverageUnitCost,
    getBranchAverageUnitCost,
    getLastPurchaseCost,
    getReturnedQtyForGrn,
    branchStockLimits, getStockLevelsFor, upsertBranchStockLimit, removeBranchStockLimit,
    offline, offlineSince, retryBootstrap, saveFailed, authExpired, pendingSavesCount, saveErrorDetail,
    accessRoles, upsertAccessRole, removeAccessRole, screenCan,
    syncNow,
    logo, setLogo,
    aiSettings, updateAISettings, aiModels, activeAIModelId, addAIModel, updateAIModel, deleteAIModel, setActiveAIModel,
    numerals, setNumerals, decimals, setDecimals,
    density, setDensity, preferences, setPreference,
    hijriMode: hijriModeState, setHijriMode: setHijriModePref,
    addFixedAsset, updateFixedAsset, deleteFixedAsset, recordDepreciation, getMonthlyDepreciation,
    addScheduledReport, setScheduledReport, runScheduledReport, setAutomationRule, runAutomation,
    currencies, addCurrency, updateCurrency, deleteCurrency, getCurrencyRate, convertToBase,
    companies, addCompany, updateCompany, deleteCompany, getCompanyName,
    requisitions, addRequisition, submitRequisition, approveRequisition, rejectRequisition, cancelRequisition, deleteRequisition,
    recipeSections, updateRecipeSections,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
