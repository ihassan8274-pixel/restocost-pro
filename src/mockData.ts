import {
  Branch, RawMaterial, Supplier, StandardRecipe, InventoryRecord, GoodsReceiptNote,
  WorkOrder, WastageLog, Employee, LaborShift, POSOrder, StockTransfer, BranchPLSummary,
  CustomCategory, FoodMenu, BatchSalesRecord, OperatingExpense, ExpenseBudget, Customer,
  Reservation, PurchaseOrder, Invoice, MaterialCategory, RecipeInventory, Account, JournalEntry,
  FixedAsset, ScheduledReport, AutomationRule, Currency, Company, UnitOfMeasure,
} from './types';

export const INITIAL_CATEGORIES: CustomCategory[] = [
  { id: 'cat-01', nameAr: 'لحوم ودواجن طازجة', nameEn: 'Meat & Poultry', type: 'raw_material' },
  { id: 'cat-02', nameAr: 'أسماك ومأكولات بحرية', nameEn: 'Seafood', type: 'raw_material' },
  { id: 'cat-03', nameAr: 'خضروات وفواكه طازجة', nameEn: 'Vegetables & Fruits', type: 'raw_material' },
  { id: 'cat-04', nameAr: 'زيوت وصوصات وتتبيلات', nameEn: 'Oils & Sauces', type: 'raw_material' },
  { id: 'cat-05', nameAr: 'خلطات تحضير مسبق', nameEn: 'Sub-prep Base Mixes', type: 'recipe' },
  { id: 'cat-06', nameAr: 'الأطباق الرئيسية والمشاوي', nameEn: 'Main Courses & Grills', type: 'recipe' },
  { id: 'cat-07', nameAr: 'المقبلات والسلطات', nameEn: 'Appetizers & Salads', type: 'recipe' },
  { id: 'cat-08', nameAr: 'المشروبات والعصائر', nameEn: 'Beverages & Juices', type: 'recipe' },
];

// الفروع الفعلية تُحمَّل دائماً من الخادم. نحتفظ فقط بالمطبخ المركزي كمرجع وظيفي افتراضي.
export const INITIAL_BRANCHES: Branch[] = [
  { id: 'b-ck', code: 'CK-01', nameAr: 'المطبخ المركزي والمستودع العام', nameEn: 'Central Kitchen & Main Hub', type: 'central_kitchen', city: 'الرياض', address: 'المنطقة الصناعية الثانية - الرياض', managerName: 'الشيف إبراهيم العلي', phone: '0501112233', isActive: true, companyId: 'co-01' },
];

export const INITIAL_COMPANIES: Company[] = [
  { id: 'co-01', code: 'MAASOUBI-KSA', nameAr: 'شركة معصوب حليب لتقديم الوجبات', nameEn: 'Maasoubi Company for Meals Services', address: 'الرياض - المملكة العربية السعودية', phone: '0501112233', vatNumber: '310000000000003', isActive: true },
];

// وحدات القياس القياسية — تُستخدم لتحويل وحدة المخزون إلى وحدات الوصفات
export const INITIAL_UNITS: UnitOfMeasure[] = [
  { id: 'uom-ltr', code: 'LTR', nameAr: 'لتر', nameEn: 'Liter', uomClass: 'volume', isActive: true },
  { id: 'uom-ml', code: 'ML', nameAr: 'مليلتر', nameEn: 'Milliliter', uomClass: 'volume', isActive: true },
  { id: 'uom-kg', code: 'KG', nameAr: 'كيلوغرام', nameEn: 'Kilogram', uomClass: 'weight', isActive: true },
  { id: 'uom-gm', code: 'GM', nameAr: 'جرام', nameEn: 'Gram', uomClass: 'weight', isActive: true },
  { id: 'uom-pc', code: 'PC', nameAr: 'قطعة', nameEn: 'Piece', uomClass: 'count', isActive: true },
  { id: 'uom-m', code: 'M', nameAr: 'متر', nameEn: 'Meter', uomClass: 'length', isActive: true },
];

export const INITIAL_CURRENCIES: Currency[] = [
  { code: 'SAR', nameAr: 'ريال سعودي', symbol: 'ر.س', rateToBase: 1, isBase: true, isActive: true },
  { code: 'USD', nameAr: 'دولار أمريكي', symbol: '$', rateToBase: 3.75, isActive: true },
  { code: 'EUR', nameAr: 'يورو', symbol: '€', rateToBase: 4.05, isActive: true },
  { code: 'AED', nameAr: 'درهم إماراتي', symbol: 'د.إ', rateToBase: 1.02, isActive: true },
  { code: 'KWD', nameAr: 'دينار كويتي', symbol: 'د.ك', rateToBase: 12.2, isActive: true },
  { code: 'EGP', nameAr: 'جنيه مصري', symbol: 'ج.م', rateToBase: 0.075, isActive: true },
  { code: 'BHD', nameAr: 'دينار بحريني', symbol: 'د.ب', rateToBase: 9.95, isActive: true },
  { code: 'QAR', nameAr: 'ريال قطري', symbol: 'ر.ق', rateToBase: 1.03, isActive: true },
  { code: 'OMR', nameAr: 'ريال عماني', symbol: 'ر.ع', rateToBase: 9.74, isActive: true },
];

// الموردون والمواد والوصفات تُحمَّل كلها من الخادم (لا توجد بيانات تجريبية افتراضية بعد الآن).
export const INITIAL_SUPPLIERS: Supplier[] = [];

export const INITIAL_RAW_MATERIALS: RawMaterial[] = [];

// الأقسام الافتراضية لكل تصنيف — قابلة للتخصيص من شاشة الوصفات المعيارية
export const DEFAULT_RECIPE_SECTIONS: Record<string, string[]> = {
  main_dish: ['مشويات وشوي', 'تجهيز مسبق للخضار أو غير', 'الأطباق الرئيسية الأخرى'],
  appetizer: ['مقبلات باردة', 'سلطات', 'مقبلات ساخنة'],
  beverage: ['مشروبات ساخنة', 'مشروبات باردة', 'عصائر طازجة'],
  dessert: ['حلويات باردة', 'حلويات ساخنة'],
  sub_prep: [],
};

export const INITIAL_RECIPES: StandardRecipe[] = [];

export const INITIAL_INVENTORY: InventoryRecord[] = [];

export const INITIAL_GRN_NOTES: GoodsReceiptNote[] = [];

export const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [];

export const INITIAL_WORK_ORDERS: WorkOrder[] = [];

export const INITIAL_WASTAGE_LOGS: WastageLog[] = [];

export const INITIAL_EMPLOYEES: Employee[] = [];

export const INITIAL_LABOR_SHIFTS: LaborShift[] = [];

export const INITIAL_POS_ORDERS: POSOrder[] = [];

export const INITIAL_STOCK_TRANSFERS: StockTransfer[] = [];

export const INITIAL_RECIPE_INVENTORY: RecipeInventory[] = [];

export const INITIAL_PL_SUMMARIES: BranchPLSummary[] = [];

export const INITIAL_FOOD_MENUS: FoodMenu[] = [];

export const INITIAL_BATCH_SALES: BatchSalesRecord[] = [];

export const INITIAL_OPERATING_EXPENSES: OperatingExpense[] = [];

export const INITIAL_EXPENSE_BUDGETS: ExpenseBudget[] = [];

export const INITIAL_CUSTOMERS: Customer[] = [];

export const INITIAL_RESERVATIONS: Reservation[] = [];

export const INITIAL_INVOICES: Invoice[] = [];

// شجرة الحسابات القياسية — مرجع وظيفي يبدأ به دفتر الأستاذ.
export const INITIAL_ACCOUNTS: Account[] = [
  { id: 'acc-cash', code: '1001', name: 'الصندوق (خزينة النقد)', type: 'asset', isActive: true },
  { id: 'acc-bank', code: '1101', name: 'البنوك', type: 'asset', isActive: true },
  { id: 'acc-ar', code: '1201', name: 'ذمم العملاء', type: 'asset', isActive: true },
  { id: 'acc-inv', code: '1301', name: 'المخزون', type: 'asset', isActive: true },
  { id: 'acc-fa', code: '1401', name: 'الأصول الثابتة', type: 'asset', isActive: true },
  { id: 'acc-ap', code: '2101', name: 'ذمم الموردين', type: 'liability', isActive: true },
  { id: 'acc-vat', code: '2201', name: 'ضريبة القيمة المضافة', type: 'liability', isActive: true },
  { id: 'acc-capital', code: '3001', name: 'رأس المال', type: 'equity', isActive: true },
  { id: 'acc-retained', code: '3101', name: 'الأرباح المحتجزة', type: 'equity', isActive: true },
  { id: 'acc-rev', code: '4001', name: 'إيراد المبيعات', type: 'revenue', isActive: true },
  { id: 'acc-cogs', code: '5001', name: 'تكلفة المبيعات', type: 'expense', isActive: true },
  { id: 'acc-opex', code: '5002', name: 'مصروفات التشغيل', type: 'expense', isActive: true },
  { id: 'acc-payroll', code: '5003', name: 'الرواتب والأجور', type: 'expense', isActive: true },
  { id: 'acc-dep', code: '5004', name: 'مصروف الاهتلاك', type: 'expense', isActive: true },
  { id: 'acc-acc-dep', code: '1302', name: 'مجمع اهتلاك الأصول الثابتة', type: 'asset', isActive: true },
];

export const INITIAL_FIXED_ASSETS: FixedAsset[] = [];

export const INITIAL_SCHEDULED_REPORTS: ScheduledReport[] = [
  { id: 'sr-01', name: 'تقرير المبيعات اليومي', type: 'sales_summary', frequency: 'daily', branchScope: 'all', enabled: true, lastRun: '2026-08-12' },
  { id: 'sr-02', name: 'تقرير التكلفة الأسبوعي', type: 'cost_report', frequency: 'weekly', branchScope: 'all', enabled: true, lastRun: '2026-08-09' },
  { id: 'sr-03', name: 'قائمة الدخل الشهرية (P&L)', type: 'pl_statement', frequency: 'monthly', branchScope: 'all', enabled: true, lastRun: '2026-07-31' },
  { id: 'sr-04', name: 'مراجعة المخزون الأسبوعية', type: 'inventory_report', frequency: 'weekly', branchScope: 'all', enabled: true, lastRun: '2026-08-11' },
  { id: 'sr-05', name: 'تقرير الهالك الشهري', type: 'wastage_report', frequency: 'monthly', branchScope: 'all', enabled: true, lastRun: '2026-08-05' },
];

export const INITIAL_AUTOMATION_RULES: AutomationRule[] = [
  { id: 'ar-01', key: 'auto_po', label: 'توليد مسودات أوامر شراء عند نقص المخزون', description: 'عند ضغط "تنفيذ الأتمتة" تُنشأ مسودات أوامر شراء لكل فرع من حدود المخزون والطلبات المعلّقة (مع خصم الأوامر المفتوحة) — تُراجَع قبل الإرسال', enabled: true },
  { id: 'ar-02', key: 'auto_workorder', label: 'توليد أوامر تصنيع عند نقص الأصناف المصنّعة', description: 'تُنشأ أوامر تصنيع للمطبخ المركزي للأصناف الأساسية دون حد الأدنى', enabled: true },
  { id: 'ar-03', key: 'expiry_alert', label: 'تنبيه انتهاء الصلاحية قبل 14 يوم', description: 'إضافة تنبيهات الصلاحية لمركز التنبيهات قبل المدة المحددة', enabled: true, config: { daysBefore: 14 } },
  { id: 'ar-04', key: 'reports_due', label: 'تنبيه التقارير المجدولة المستحقة', description: 'إظهار إشعار عند استحقاق تقرير مجدول حسب دورته', enabled: true },
];

export const INITIAL_JOURNAL_ENTRIES: JournalEntry[] = [];

export const INITIAL_DELIVERY_APPS = [
  { id: 'app-01', name: 'جيمر (Jahez)', commissionPercent: 12, isActive: true },
  { id: 'app-02', name: 'سريع (Hungerstation)', commissionPercent: 15, isActive: true },
  { id: 'app-03', name: 'توصيل تو (Talabat)', commissionPercent: 18, isActive: true },
  { id: 'app-04', name: 'مارسول', commissionPercent: 10, isActive: true },
];

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  meat_poultry: 'لحوم ودواجن', seafood: 'أسماك ومأكولات بحرية', vegetables_fruits: 'خضروات وفواكه',
  dairy_eggs: 'ألبان وبيض', dry_goods: 'مواد جافة', oils_sauces: 'زيوت وصوصات', packaging: 'تغليف', beverages: 'مشروبات',
};