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
