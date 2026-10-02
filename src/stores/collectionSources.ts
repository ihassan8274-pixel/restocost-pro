import { useSettingsStore } from './settingsStore';
import { useInventoryStore } from './inventoryStore';
import { useProcurementStore } from './procurementStore';
import { useProductionStore } from './productionStore';
import { useFinancialStore } from './financialStore';
import { useSalesStore } from './salesStore';
import { useHRStore } from './hrStore';
import { usePeriodStore } from './periodStore';
import { useAuthStore } from './authStore';
import { useLegacyCompatStore } from './legacyCompatStore';
import { useSyncStore } from './syncStore';
import { registerCollection, getCollectionValue, isApplying } from './collectionRegistry';

// خريطة مفاتيح المزامنة التاريخية (rcerp_*) إلى حقول الستورات الحديثة (الستور + اسم الحقل).
// تُثبَّت المجموعات في السجل المركزي ويُشترك على كل ستور ليرفع التعديلات المحلية
// إلى طابور الحفظ (syncStore.persist) — بينما تحمي isApplying() أثناء تطبيق بيانات
// الخادم الواردة من إعادة رفع نفس القيم (منع الصدى).
import { removedIdsBetween } from '../business/collection-tombstone';

interface Pair {
  store: { setState: (p: object) => void; getState: () => unknown };
  field: string;
  filterTombstones?: boolean;
  // قوائم ذات سقف مقصود (truncate): اختفاء أقدم عناصرها نافذ محلياً ولا يُسجَّل
  // شاهد حذف — وإلا لأعادت كل إضافة فوق السقف توليد شواهد حذف لأقدم السجلات
  // فمُحيت من الخادم.
  cappedList?: boolean;
}

// ملاحظة على الشواهد هنا: هذه المجموعات كانت بلا filterTombstones، فحذفُ
// فرع أو شركة أو وحدة يعود بعد المزامنة (نفس فئة ثغرة "الحذف الذي يعود").
// الاستثناءات موثّقة عمداً:
//   - rcerp_custom_roles  : string[] (بلا id) — لا يمكن شاهد بمعرّف.
//   - rcerp_currencies    : المفتاح code لا id — يلزم تحويل بنيوي للـschema.
//   - rcerp_access_roles / automation_rules / scheduled_reports :
//     ADMIN_ONLY_KEYS على الخادم — لا شاهد لها بحكم البوابة.
const pairs: [string, Pair][] = [
  ['rcerp_branches', { store: useSettingsStore, field: 'branches', filterTombstones: true }],
  ['rcerp_units', { store: useSettingsStore, field: 'unitsOfMeasure', filterTombstones: true }],
  ['rcerp_material_barcodes', { store: useSettingsStore, field: 'materialBarcodes', filterTombstones: true }],
  ['rcerp_material_categories', { store: useSettingsStore, field: 'materialCategories', filterTombstones: true }],
  ['rcerp_categories', { store: useSettingsStore, field: 'customCategories', filterTombstones: true }],
  ['rcerp_currencies', { store: useSettingsStore, field: 'currencies' }], // مفتاحه code لا id
  ['rcerp_companies', { store: useSettingsStore, field: 'companies', filterTombstones: true }],
  ['rcerp_custom_roles', { store: useSettingsStore, field: 'customRoles' }], // string[]
  ['rcerp_automation_rules', { store: useSettingsStore, field: 'automationRules' }], // admin-only
  ['rcerp_scheduled_reports', { store: useSettingsStore, field: 'scheduledReports' }], // admin-only

  ['rcerp_inventory', { store: useInventoryStore, field: 'inventory', filterTombstones: true }],
  ['rcerp_inventory_batches', { store: useInventoryStore, field: 'inventoryBatches', filterTombstones: true }],
  ['rcerp_inventory_movements', { store: useInventoryStore, field: 'inventoryMovements', filterTombstones: true, cappedList: true }],
  ['rcerp_recipe_inventory', { store: useInventoryStore, field: 'recipeInventory', filterTombstones: true }],
  ['rcerp_physical_counts', { store: useInventoryStore, field: 'physicalCounts', filterTombstones: true }],
  ['rcerp_daily_counts', { store: useInventoryStore, field: 'dailyCounts', filterTombstones: true }],
  ['rcerp_opening_balances', { store: useInventoryStore, field: 'openingBalances', filterTombstones: true }],
  ['rcerp_branch_stock_limits', { store: useInventoryStore, field: 'branchStockLimits', filterTombstones: true }],
  ['rcerp_stock_transfers', { store: useInventoryStore, field: 'stockTransfers', filterTombstones: true }],
  ['rcerp_distributions', { store: useInventoryStore, field: 'distributions', filterTombstones: true }],
  ['rcerp_intake_inbox', { store: useInventoryStore, field: 'intakeInbox', filterTombstones: true }],

  ['rcerp_suppliers', { store: useProcurementStore, field: 'suppliers', filterTombstones: true }],
  ['rcerp_grn', { store: useProcurementStore, field: 'grnNotes', filterTombstones: true }],
  ['rcerp_purchase_orders', { store: useProcurementStore, field: 'purchaseOrders', filterTombstones: true }],
  ['rcerp_purchase_requests', { store: useProcurementStore, field: 'purchaseRequests', filterTombstones: true }],
  ['rcerp_supplier_quotes', { store: useProcurementStore, field: 'supplierQuotes', filterTombstones: true }],
  ['rcerp_supplier_returns', { store: useProcurementStore, field: 'supplierReturns', filterTombstones: true }],

  ['rcerp_recipes', { store: useProductionStore, field: 'recipes', filterTombstones: true }],
  ['rcerp_recipe_sections', { store: useProductionStore, field: 'recipeSections', filterTombstones: true }],
  ['rcerp_production_runs', { store: useProductionStore, field: 'productionRuns', filterTombstones: true }],
  ['rcerp_butcher_tests', { store: useProductionStore, field: 'butcherTests', filterTombstones: true }],
  ['rcerp_work_orders', { store: useProductionStore, field: 'workOrders', filterTombstones: true }],
  ['rcerp_food_menus', { store: useProductionStore, field: 'foodMenus', filterTombstones: true }],
  ['rcerp_menu_plans', { store: useProductionStore, field: 'menuPlans', filterTombstones: true }],

  ['rcerp_accounts', { store: useFinancialStore, field: 'accounts', filterTombstones: true }],
  ['rcerp_journal', { store: useFinancialStore, field: 'journalEntries', filterTombstones: true }],
  ['rcerp_pos_returns', { store: useFinancialStore, field: 'posReturns', filterTombstones: true }],
  ['rcerp_fixed_assets', { store: useFinancialStore, field: 'fixedAssets', filterTombstones: true }],
  ['rcerp_operating_expenses', { store: useFinancialStore, field: 'operatingExpenses', filterTombstones: true }],
  ['rcerp_expense_budgets', { store: useFinancialStore, field: 'expenseBudgets', filterTombstones: true }],
  ['rcerp_pl_summaries', { store: useFinancialStore, field: 'plSummaries', filterTombstones: true }],

  ['rcerp_pos_orders', { store: useSalesStore, field: 'posOrders', filterTombstones: true }],
  ['rcerp_batch_sales', { store: useSalesStore, field: 'batchSalesRecords', filterTombstones: true }],
  ['rcerp_customers', { store: useSalesStore, field: 'customers', filterTombstones: true }],
  ['rcerp_reservations', { store: useSalesStore, field: 'reservations', filterTombstones: true }],
  ['rcerp_invoices', { store: useSalesStore, field: 'invoices', filterTombstones: true }],
  ['rcerp_delivery_apps', { store: useSalesStore, field: 'deliveryApps', filterTombstones: true }],
  ['rcerp_delivery_sales', { store: useSalesStore, field: 'deliverySales', filterTombstones: true }],

  ['rcerp_employees', { store: useHRStore, field: 'employees', filterTombstones: true }],
  ['rcerp_shifts', { store: useHRStore, field: 'shifts', filterTombstones: true }],
  ['rcerp_attendance', { store: useHRStore, field: 'attendance', filterTombstones: true }],
  ['rcerp_payroll', { store: useHRStore, field: 'payrollPeriods', filterTombstones: true }],
  ['rcerp_employee_meals', { store: useHRStore, field: 'employeeMeals', filterTombstones: true }],
  ['rcerp_tasks', { store: useHRStore, field: 'tasks', filterTombstones: true }],
  ['rcerp_temp_logs', { store: useHRStore, field: 'tempLogs', filterTombstones: true }],
  ['rcerp_haccp_inspections', { store: useHRStore, field: 'haccpInspections', filterTombstones: true }],

  ['rcerp_closed_months', { store: usePeriodStore, field: 'closedMonths', filterTombstones: true }],
  ['rcerp_closed_days', { store: usePeriodStore, field: 'closedDays', filterTombstones: true }],
  ['rcerp_eod_closures', { store: usePeriodStore, field: 'eodClosures', filterTombstones: true }],
  ['rcerp_monthly_inventory', { store: usePeriodStore, field: 'monthlyInventory', filterTombstones: true }],

  ['rcerp_users', { store: useAuthStore, field: 'users', filterTombstones: true }],
  ['rcerp_access_roles', { store: useAuthStore, field: 'accessRoles', filterTombstones: true }],

  ['rcerp_raw_materials', { store: useLegacyCompatStore, field: 'rawMaterials', filterTombstones: true }],
  ['rcerp_wastage', { store: useLegacyCompatStore, field: 'wastageLogs', filterTombstones: true }],
  ['rcerp_requisitions', { store: useLegacyCompatStore, field: 'requisitions', filterTombstones: true }],
  ['rcerp_customer_orders', { store: useLegacyCompatStore, field: 'customerOrders', filterTombstones: true }],
  ['rcerp_audit', { store: useLegacyCompatStore, field: 'auditLogs', filterTombstones: true, cappedList: true }],
  ['rcerp_custom_reports', { store: useLegacyCompatStore, field: 'customReports', filterTombstones: true }],
  ['rcerp_recent_docs', { store: useLegacyCompatStore, field: 'recentDocs', filterTombstones: true, cappedList: true }],
  ['rcerp_deleted_ids', { store: useLegacyCompatStore, field: 'deletedIds' }],
  ['rcerp_ack_alerts', { store: useLegacyCompatStore, field: 'acknowledgedAlertIds', filterTombstones: true }],
  ['rcerp_target_margin', { store: useLegacyCompatStore, field: 'globalTargetMarginPercent', filterTombstones: true }],
  ['rcerp_vat_percent', { store: useLegacyCompatStore, field: 'vatPercent', filterTombstones: true }],
  ['rcerp_vat_inclusive', { store: useLegacyCompatStore, field: 'vatInclusive', filterTombstones: true }],
  ['rcerp_deduct_sales', { store: useLegacyCompatStore, field: 'deductSalesFromInventory', filterTombstones: true }],
];

export const ensureCollectionSources = (): void => {
  for (const [key, { store, field, filterTombstones }] of pairs) {
    registerCollection(
      key,
      (v) => store.setState({ [field]: v }),
      () => (store.getState() as Record<string, unknown>)[field],
      filterTombstones
    );
  }

  // اشتراك على كل زوج (ستور/حقل): يرفع التعديل المحلي على أي حقل مسجَّل إلى طابور الحفظ.
  const subscribe = (key: string) => {
    // rcerp_deleted_ids يجب أن تُرفع للخادم ليتمكن من تصفية السجلات المحذوفة عند الدمج
    const entry = pairs.find(([k]) => k === key);
    if (!entry) return;
    const { store, field, filterTombstones, cappedList } = entry[1];
    const bind = store as { subscribe?: (l: (s: unknown, p: unknown) => void) => () => void };
    if (!bind.subscribe) return;
    bind.subscribe((_state: unknown, prev: unknown) => {
      if (isApplying()) return;
      const cur = (store.getState() as Record<string, unknown>)[field];
      const prevV = (prev as Record<string, unknown>)?.[field];
      if (cur === prevV) return;
      const sync = useSyncStore.getState();
      const applied = sync.appliedRefsRef.current.get(key);
      if (applied === cur) {
        sync.appliedRefsRef.current.delete(key);
        return;
      }
      // دمج الخادم اتحادٌ فقط، فلا يُحذف سجل بمجرد اختفائه محلياً: يعود مع
      // bootstrap التالي. لذلك أي معرّف اختفى من تعديل محلي (وليس من تحميل
      // خادم — محميٌّ بـ isApplying أعلاه) يُسجَّل شاهد حذف، فيثبت الحذف.
      if (filterTombstones && !cappedList) {
        const gone = removedIdsBetween(prevV, cur);
        if (gone.length) useLegacyCompatStore.getState().tombstoneIds(gone);
      }
      sync.persist(key, cur);
    });
  };
  for (const [key] of pairs) subscribe(key);

  // لقطة لدعم القراءات القديمة لـ COLLECTION_SETTERS من useApp.
  const setters: Record<string, (v: unknown) => void> = {};
  for (const [key] of pairs) setters[key] = (v) => useSyncStore.getState().applyData({ [key]: v });
  useSyncStore.setState({ COLLECTION_SETTERS: setters });
};

// قائمة المجموعات المسجَّلة (تُستخدم في clearCollections).
export const getSyncCollectionKeys = (): string[] => pairs.map(([k]) => k).concat(['rcerp_material_barcodes']);

// تهيئة فورية عند تحميل الوحدة (تسجيل المجموعات + الاشتراكات + لقطة COLLECTION_SETTERS).
ensureCollectionSources();

export { getCollectionValue }; // إعادة تصدير مريحة