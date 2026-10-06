// ============ بوابة صلاحيات الكتابة على مجموعات المزامنة ============
// كان الفحص يتم بأدوار مكتوبة يدوياً داخل المسار: 'admin' / 'manager' / 'executive'.
// الدور 'manager' غير موجود في نموذج الصلاحيات أصلاً (الأدوار الحقيقية:
// executive, admin, branch_manager, cost_controller, chef, storekeeper, waiter, counter)،
// فكان الرفض يقع على كل مستخدم غير (admin|executive) — ومنهم عداد الجرد (counter)
// وأمين المخزن (storekeeper) ومدير الفرع — فيرفض الخادم حفظ الجرد بخطأ 403،
// وكان العميل يقرأ 403 على أنه "انتهت الجلسة" فيُخرج المستخدم.
//
// الآن: كل مفتاح مجموعة مربوط بصلاحية حقيقية من ROLE_PERMISSIONS،
// ويُحترم الدور المخصّص (roleId) عبر baseRole الخاص به.

export const ROLE_PERMISSIONS = {
  admin: [
    'view_dashboard', 'manage_branches', 'manage_inventory', 'mobile_count', 'manage_grn', 'approve_grn',
    'manage_recipes', 'manage_central_kitchen', 'manage_wastage', 'manage_labor', 'manage_pos',
    'manage_expenses', 'approve_expenses', 'manage_customers', 'manage_reservations',
    'manage_purchase_orders', 'approve_purchase_orders', 'manage_invoices', 'manage_suppliers',
    'manage_users', 'view_reports', 'view_accounting', 'manage_accounting', 'export_data', 'delete_data', 'manage_menus',
    'manage_batch_sales', 'use_ai', 'reset_system', 'manage_requisitions', 'approve_requisitions',
  ],
  executive: [
    'view_dashboard', 'manage_branches', 'manage_inventory', 'mobile_count', 'manage_grn', 'approve_grn',
    'manage_recipes', 'manage_central_kitchen', 'manage_wastage', 'manage_labor', 'manage_pos',
    'manage_expenses', 'approve_expenses', 'manage_customers', 'manage_reservations',
    'manage_purchase_orders', 'approve_purchase_orders', 'manage_invoices', 'manage_suppliers',
    'view_reports', 'view_accounting', 'manage_accounting', 'export_data', 'delete_data', 'manage_menus',
    'manage_batch_sales', 'use_ai', 'manage_requisitions', 'approve_requisitions',
  ],
  branch_manager: [
    'view_dashboard', 'manage_inventory', 'mobile_count', 'manage_grn', 'manage_recipes', 'manage_wastage',
    'manage_labor', 'manage_pos', 'manage_expenses', 'manage_customers', 'manage_reservations',
    'manage_purchase_orders', 'manage_invoices', 'manage_suppliers', 'view_reports', 'export_data',
    'manage_menus', 'manage_batch_sales', 'manage_requisitions', 'approve_requisitions',
  ],
  cost_controller: [
    'view_dashboard', 'manage_inventory', 'mobile_count', 'manage_grn', 'approve_grn', 'manage_recipes',
    'manage_central_kitchen', 'manage_wastage', 'manage_labor', 'manage_pos', 'manage_expenses',
    'approve_expenses', 'manage_purchase_orders', 'approve_purchase_orders', 'manage_invoices',
    'manage_suppliers', 'view_reports', 'view_accounting', 'manage_accounting', 'export_data',
    'manage_menus', 'manage_batch_sales', 'use_ai', 'manage_requisitions', 'approve_requisitions',
  ],
  chef: [
    'view_dashboard', 'manage_recipes', 'manage_central_kitchen', 'manage_wastage', 'manage_labor',
    'manage_inventory', 'mobile_count', 'view_reports', 'manage_requisitions',
  ],
  storekeeper: [
    'view_dashboard', 'manage_inventory', 'mobile_count', 'manage_grn', 'manage_purchase_orders',
    'manage_suppliers', 'view_reports', 'export_data', 'manage_requisitions',
  ],
  waiter: [
    'view_dashboard', 'manage_reservations', 'manage_pos', 'manage_customers',
  ],
  counter: [
    'mobile_count',
  ],
};

// مجموعات لا يكتبها إلا مسؤول النظام.
export const ADMIN_ONLY_KEYS = new Set([
  'rcerp_users', 'rcerp_access_roles', 'rcerp_ai_settings', 'rcerp_telegram_settings',
  'rcerp_custom_roles', 'rcerp_automation_rules', 'rcerp_scheduled_reports',
]);

// صلاحية الكتابة المطلوبة لكل مجموعة. ما ليس مذكوراً هنا يبقى للإدارة فقط.
const KEY_PERMISSION = {
  // ---- الجرد ----
  rcerp_daily_counts: 'mobile_count',
  rcerp_physical_counts: 'mobile_count',
  // ---- المخزون ----
  rcerp_inventory: 'manage_inventory',
  rcerp_inventory_batches: 'manage_inventory',
  rcerp_inventory_movements: 'manage_inventory',
  rcerp_opening_balances: 'manage_inventory',
  rcerp_monthly_inventory: 'manage_inventory',
  rcerp_branch_stock_limits: 'manage_inventory',
  rcerp_distributions: 'manage_inventory',
  rcerp_stock_transfers: 'manage_inventory',
  rcerp_work_orders: 'manage_inventory',
  rcerp_recipe_inventory: 'manage_inventory',
  rcerp_raw_materials: 'manage_inventory',
  rcerp_material_categories: 'manage_inventory',
  rcerp_material_barcodes: 'manage_inventory',
  rcerp_units: 'manage_inventory',
  // ---- المشتريات ----
  rcerp_grn: 'manage_grn',
  rcerp_purchase_orders: 'manage_purchase_orders',
  rcerp_purchase_requests: 'manage_purchase_orders',
  rcerp_suppliers: 'manage_suppliers',
  rcerp_supplier_quotes: 'manage_suppliers',
  rcerp_supplier_returns: 'manage_suppliers',
  rcerp_requisitions: 'manage_requisitions',
  // ---- الوصفات والإنتاج ----
  rcerp_recipes: 'manage_recipes',
  rcerp_recipe_sections: 'manage_recipes',
  rcerp_food_menus: 'manage_recipes',
  rcerp_menu_plans: 'manage_recipes',
  rcerp_production_runs: 'manage_central_kitchen',
  rcerp_intake_inbox: 'manage_central_kitchen',
  rcerp_butcher_tests: 'manage_central_kitchen',
  // ---- التشغيل ----
  rcerp_wastage: 'manage_wastage',
  rcerp_employees: 'manage_labor',
  rcerp_shifts: 'manage_labor',
  rcerp_attendance: 'manage_labor',
  rcerp_payroll: 'manage_labor',
  rcerp_employee_meals: 'manage_labor',
  // ---- المبيعات ----
  rcerp_pos_orders: 'manage_pos',
  rcerp_pos_returns: 'manage_pos',
  rcerp_delivery_sales: 'manage_pos',
  rcerp_delivery_apps: 'manage_pos',
  rcerp_customer_orders: 'manage_pos',
  rcerp_customers: 'manage_customers',
  rcerp_reservations: 'manage_reservations',
  rcerp_invoices: 'manage_invoices',
  rcerp_batch_sales: 'manage_batch_sales',
  // ---- المالية ----
  rcerp_accounts: 'manage_accounting',
  rcerp_journal: 'manage_accounting',
  rcerp_operating_expenses: 'manage_accounting',
  rcerp_expense_budgets: 'manage_accounting',
  rcerp_fixed_assets: 'manage_accounting',
  rcerp_pl_summaries: 'manage_accounting',
};

// أدوار الإدارة:Fallback افتراضي لأي مجموعة غير مربوطة بصلاحية.
const MANAGEMENT_ROLES = new Set(['admin', 'executive', 'branch_manager', 'cost_controller']);

// المجموعات المستثناة من شاهد الحذف: إما ثابتة (capped) مثل inventoryMovements،
// أو إدارية (admin-only) لا يمكن لأي جلسة كتابة فيها على الإطلاق.
export const CAPPED_LIST_KEYS = new Set([
  'rcerp_inventory_movements',
  'rcerp_audit',
  'rcerp_recent_docs',
]);

export const ADMIN_ONLY_KEYS_FOR_TOMBSTONE = new Set([...ADMIN_ONLY_KEYS, ...CAPPED_LIST_KEYS]);

// الدور الفعّال: إن كان للمستخدم دور مخصّص (roleId) فالدور الأساسي هو baseRole الخاص به.
const effectiveRole = (user, accessRoles) => {
  if (user.role === 'admin') return 'admin';
  const custom = user.roleId ? (accessRoles || []).find((r) => r.id === user.roleId) : undefined;
  return (custom && custom.baseRole) || user.role || '';
};

const hasPermission = (user, perm, accessRoles) => {
  if (user.role === 'admin') return true;
  const role = effectiveRole(user, accessRoles);
  return (ROLE_PERMISSIONS[role] || []).includes(perm);
};

/**
 * هل يملك المستخدم حق الكتابة في مجموعة المزامنة؟
 * @returns {{ ok: true } | { ok: false, code: 'admin_only' | 'forbidden', message: string }}
 */
export const canWriteCollection = (user, key, accessRoles) => {
  if (!user) return { ok: false, code: 'forbidden', message: 'غير مصادق' };
  if (user.role === 'admin') return { ok: true };
  // شواهد الحذف مفتوح لكل جلسة مصادَق عليها: أي دور قد يحذف سجلاً من مجموعة
  // يملك حقّ الكتابة فيها (counter/storekeeper مثلاً)، وقطعُ سجل مُشوهد يُمنع
  // ما لم يملك صاحب الجلسة صلاحية الكتابة في المجموعة التي تضمّه.
  if (key === 'rcerp_deleted_ids') return { ok: true };
  if (ADMIN_ONLY_KEYS.has(key)) {
    return { ok: false, code: 'admin_only', message: 'غير مصرح — هذا المفتاح يتطلب صلاحيات مسؤول النظام' };
  }
  const perm = KEY_PERMISSION[key];
  if (perm) {
    if (hasPermission(user, perm, accessRoles)) return { ok: true };
    return {
      ok: false,
      code: 'forbidden',
      message: `غير مصرح — حفظ هذه البيانات يتطلب صلاحية (${perm})`,
    };
  }
  const role = effectiveRole(user, accessRoles);
  if (MANAGEMENT_ROLES.has(role)) return { ok: true };
  return { ok: false, code: 'forbidden', message: 'غير مصرح — هذا المفتاح يتطلب صلاحيات إدارة' };
};

/**
 * هل يحقّ لشاهد حذف أن يقطع سجلاً من هذه المجموعة؟
 * القطع هنا يوازي الكتابة: من لا يملك حق الكتابة في المجموعة لا يحذف منها،
 * وإلا أكفي شاهد بمعرّف واحد لمحو أي سجل في النظام.
 * مستخدمو rcerp_users مستثنون دائماً: مسارهم الإداري الخاص لا شاهدَ حذف.
 */
export const canPurgeTombstone = (user, collectionKey, accessRoles) => {
  if (collectionKey === 'rcerp_deleted_ids' || collectionKey === 'rcerp_users') return false;
  if (ADMIN_ONLY_KEYS_FOR_TOMBSTONE.has(collectionKey)) return false;
  return canWriteCollection(user, collectionKey, accessRoles).ok;
};

// ============ بوابة صلاحيات القراءة ============
// كان /api/bootstrap و /api/collections/:key/paginated يتحققان من existence
// الجلسة فقط (sessionUser) دون أي فحص صلاحية — فأي دور مصادَق عليه (counter مثلاً)
// كان يسحب القيود المالية وأسعار الشراء ومبيعات كل الفروع.
//
// القراءة **أوسع من الكتابة عمداً** (قوائم الاختيار والمعارف المشتركة تحتاج
// قراءة فروع ومواد لا يملك المستخدم حق تعديلها)، لكنها ليست مفتوحة للجميع:
//  - الأدوار الإدارية والمالية والإعلانية ترى كل شيء.
//  - الأدوار التشغيلية (waiter/chef/storekeeper/counter) تُقصر على مجموعات
//    العرض الأساسية، ويُمنع عنها كل ما يمسّ المال أو المستخدمين أو الإعدادات.
//
// ملاحظة: هذا تحقق على مستوى **المفتاح** فقط. القيد على مستوى **الفرع**
// (أن يرى counter فرعَه وحده) بند منفصل — انظر A4 في مخطط الإصلاح.

export const FINANCIAL_READ_KEYS = new Set([
  'rcerp_journal', 'rcerp_accounts', 'rcerp_pl_summaries', 'rcerp_pos_returns',
  'rcerp_fixed_assets', 'rcerp_operating_expenses', 'rcerp_expense_budgets',
  'rcerp_invoices', 'rcerp_purchase_orders', 'rcerp_purchase_requests',
  'rcerp_supplier_quotes', 'rcerp_supplier_returns', 'rcerp_grn', 'rcerp_suppliers',
  'rcerp_currencies', 'rcerp_companies',
]);

// مجموعات مرجعية مشتركة: كل دور يحتاجها لعرض القوائم (أسماء المواد والفروع
// والعملاء)، ولا تكشف أرقاماً مالية — مسموحة للجميع.
// ملاحظة: rcerp_access_roles ليست هنا عمداً — كشف خريطة الأدوار يتيح معرفة
// أي دور يملك أي صلاحية، وهو مُستخدم في تصعيد الصلاحيات. للإدارة فقط.
export const SHARED_REFERENCE_KEYS = new Set([
  'rcerp_raw_materials', 'rcerp_material_categories', 'rcerp_material_barcodes',
  'rcerp_categories', 'rcerp_branches', 'rcerp_units', 'rcerp_customers',
  'rcerp_custom_roles', 'rcerp_closed_months', 'rcerp_closed_days',
]);

// ما يراه دور Runs بلا صلاحية إدارية: مخزون ومبيعات وتشغيل، بلا دفاتر مالية
// ولا مستخدمين ولا إعدادات نظام.
export const OPERATIONAL_READABLE = new Set([
  'rcerp_inventory', 'rcerp_inventory_batches', 'rcerp_inventory_movements',
  'rcerp_recipe_inventory', 'rcerp_physical_counts',
  'rcerp_opening_balances', 'rcerp_branch_stock_limits', 'rcerp_stock_transfers',
  'rcerp_distributions', 'rcerp_recipes', 'rcerp_recipe_sections', 'rcerp_food_menus',
  'rcerp_menu_plans', 'rcerp_production_runs', 'rcerp_work_orders', 'rcerp_butcher_tests',
  'rcerp_pos_orders', 'rcerp_delivery_apps', 'rcerp_delivery_sales', 'rcerp_reservations',
  'rcerp_batch_sales', 'rcerp_custom_reports', 'rcerp_audit', 'rcerp_recent_docs',
  'rcerp_deleted_ids', 'rcerp_ack_alerts', 'rcerp_target_margin',
  'rcerp_vat_percent', 'rcerp_vat_inclusive', 'rcerp_deduct_sales',
]);

// جرد outpost: الجرد اليومي والفيزيائي settlementRestricted لأدوار المخزون
// فقط (counter/storekeeper) — waiter لا يقرأ سجلات جرد المطبخ ولا habil.
export const COUNTING_READ_KEYS = new Set(['rcerp_daily_counts']);

// من يملك صلاحية عرض كيان في القائمة (navigation.ts) يجب أن يقرأ بياناته،
// وإلا ظهرت الشاشة والقائمة فارغتين. القاعدة مشتقّة من الصلاحيات لا من
// قائمة مفاتيح مكتوبة يدوياً، فلا يمكن أن تتعارض مرتين.
const SCREEN_PERM_TO_KEYS = [
  ['view_dashboard', ['rcerp_tasks', 'rcerp_ack_alerts', 'rcerp_audit', 'rcerp_recent_docs']],
  ['manage_wastage', ['rcerp_wastage']],
  ['manage_labor', ['rcerp_employees', 'rcerp_shifts', 'rcerp_attendance', 'rcerp_payroll', 'rcerp_employee_meals']],
  ['manage_inventory', ['rcerp_intake_inbox', 'rcerp_haccp_inspections', 'rcerp_temp_logs',
    'rcerp_monthly_inventory', 'rcerp_eod_closures', 'rcerp_requisitions',
    'rcerp_customer_orders', 'rcerp_documents']],
  ['manage_customers', ['rcerp_customers', 'rcerp_customer_orders']],
  ['manage_reservations', ['rcerp_reservations']],
  ['manage_pos', ['rcerp_pos_orders', 'rcerp_delivery_apps', 'rcerp_delivery_sales']],
  ['manage_recipes', ['rcerp_recipes', 'rcerp_recipe_sections', 'rcerp_food_menus', 'rcerp_menu_plans']],
  ['manage_central_kitchen', ['rcerp_production_runs', 'rcerp_work_orders', 'rcerp_butcher_tests']],
  ['manage_grn', ['rcerp_grn']],
  ['manage_suppliers', ['rcerp_suppliers', 'rcerp_supplier_quotes', 'rcerp_supplier_returns']],
  ['manage_purchase_orders', ['rcerp_purchase_orders', 'rcerp_purchase_requests']],
  ['mobile_count', ['rcerp_daily_counts', 'rcerp_physical_counts']],
  ['manage_export', ['rcerp_custom_reports', 'rcerp_targets', 'rcerp_logo']],
];

/** المجموعات التي يقرأها دور بعينه استناداً إلى صلاحياته المعلنة. */
export const readableKeysFor = (role) => {
  const perms = ROLE_PERMISSIONS[role] || [];
  const keys = new Set();
  for (const [perm, ks] of SCREEN_PERM_TO_KEYS) {
    if (!perms.includes(perm)) continue;
    ks.forEach((k) => keys.add(k));
  }
  return keys;
};

/**
 * ما يراه الدور غير الإداري: فروعه فقط أم الكل؟
 * مطابق لـ visibleBranchIdsFor في العميل (src/stores/hooks/useAuth.ts) — نفس
 * القاعدة في الطرفين حتى لا يختلف ما يراه المستخدم عن ما تصله البيانات.
 * 'all' = كل الفروع. branchId فارغ = لا فرع مُسند بعد ⇒ لا شيء يُرسل
 * (سلوك مقصود: الموظف غير المُسند لا يرى بيانات أي فرع).
 */
export const visibleBranchIdsFor = (user, branches) => {
  if (!user) return [];
  const bid = user.branchId;
  if (bid === 'all') return (branches || []).map((b) => b.id);
  return bid ? [bid] : [];
};

// المجموعات التي تحمل branchId على مستوى السجل — تُقصَّ على فروع المستخدم.
// أي مجموعة خارج هذه القائمة إما مرجع مشترك (مواد/فروع/أصناف) أو مست
// إداري بلا فرع، فلا يُقصّ.
export const BRANCH_SCOPED_KEYS = new Set([
  'rcerp_inventory', 'rcerp_inventory_batches', 'rcerp_inventory_movements',
  'rcerp_recipe_inventory', 'rcerp_opening_balances', 'rcerp_branch_stock_limits',
  'rcerp_daily_counts', 'rcerp_physical_counts', 'rcerp_stock_transfers',
  'rcerp_distributions', 'rcerp_grn', 'rcerp_purchase_orders', 'rcerp_purchase_requests',
  'rcerp_supplier_quotes', 'rcerp_supplier_returns', 'rcerp_requisitions',
  'rcerp_pos_orders', 'rcerp_pos_returns', 'rcerp_delivery_apps', 'rcerp_delivery_sales',
  'rcerp_invoices', 'rcerp_reservations', 'rcerp_customers', 'rcerp_batch_sales',
  'rcerp_customer_orders', 'rcerp_operating_expenses', 'rcerp_employees', 'rcerp_shifts',
  'rcerp_attendance', 'rcerp_payroll', 'rcerp_employee_meals', 'rcerp_wastage',
  'rcerp_production_runs', 'rcerp_work_orders', 'rcerp_butcher_tests',
  'rcerp_monthly_inventory', 'rcerp_eod_closures', 'rcerp_intake_inbox',
]);

/**
 * يقصّ قيمة مجموعة على فروع المستخدم.
 * سجل بلا branchId يمرّ بلا قصّ (سلوك متحفّظ: لا نفقد بيانات لا نعرف نطاقها).
 */
export const scopeToBranches = (value, user, branches) => {
  if (!Array.isArray(value)) return value;
  const allowed = new Set(visibleBranchIdsFor(user, branches));
  if (allowed.has('all')) return value; // لم نعدّل all هنا — الحالة تُمنح في visibleBranchIdsFor
  if (allowed.size === 0) return [];      // بلا فرع مُسند: لا يرى شيئاً
  return value.filter((r) => !r || typeof r !== 'object' || r.branchId === undefined || allowed.has(String(r.branchId)));
};

/**
 * هل يملك المستخدم حق قراءة مجموعة المزامنة؟
 * @returns {{ ok: true } | { ok: false, code: 'forbidden', message: string }}
 */
export const canReadCollection = (user, key, accessRoles) => {
  if (!user) return { ok: false, code: 'forbidden', message: 'غير مصادق' };
  if (user.role === 'admin') return { ok: true };
  const role = effectiveRole(user, accessRoles);
  const perms = ROLE_PERMISSIONS[role] || [];
  // الإدارة الكاملة ترى كل شيء.
  if (MANAGEMENT_ROLES.has(role)) return { ok: true };
  // من له صلاحية مالية على أي مستوى (cost_controller) يرى الدفاتر المالية.
  if (perms.includes('view_accounting') || perms.includes('manage_accounting') || perms.includes('approve_expenses')) {
    return { ok: true };
  }
  // من له حق رؤية المبيعات يرى فواتيرها ومبيعاتها.
  if (perms.includes('manage_invoices')) return { ok: true };
  // قاعدة الشاشة: من يملك صلاحية عرض كيان (navigation.ts) يقرأ بياناته.
  // بدونها ظهرت شاشات فارغة لأدوار مرئية (chef/storekeeper مع wastage
  // وintake_inbox وhaccp وmonthly_inventory وtasks).
  if (readableKeysFor(role).has(key)) return { ok: true };
  // المرجع المشترك متاح للجميع (أسماء لا أرقام).
  if (SHARED_REFERENCE_KEYS.has(key)) return { ok: true };
  // سجلات الجرد لمن يعدّ فقط (mobile_count صلاحيةُ-counter وstorekeeper).
  if (COUNTING_READ_KEYS.has(key)) {
    if (perms.includes('mobile_count')) return { ok: true };
    return { ok: false, code: 'forbidden', message: 'غير مصرح — سجلات الجرد لمن يعدّ فقط' };
  }
  // ما عدا ذلك: التشغيلية ترى مجموعتها المحددة فقط.
  if (OPERATIONAL_READABLE.has(key)) return { ok: true };
  return { ok: false, code: 'forbidden', message: 'غير مصرح — هذه البيانات خارج نطاق صلاحياتك' };
};
