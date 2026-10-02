import { describe, it, expect } from 'vitest';
// خادم — سلوك القائمة في /api/bootstrap عند تقييد القراءة.
// كان أي جلسة مسحوبة (bootstrap) تستقبل كل المجموعات بلا فحص صلاحية، فseeing
// الدور المحدود (counter) было يسحب القيود المالية وأسعار الشراء.
// هذه الاختبارات تحاكي منطق canReadCollection على قائمة COLLECTION_KEYS حقيقي.
import { canReadCollection, SHARED_REFERENCE_KEYS, OPERATIONAL_READABLE, COUNTING_READ_KEYS } from '../../server/permissions.mjs';

// قائمة-costume مجموعة من COLLECTION_KEYS كما في core.mjs
const COLLECTION_KEYS = [
  'rcerp_branches', 'rcerp_suppliers', 'rcerp_raw_materials', 'rcerp_recipes', 'rcerp_inventory',
  'rcerp_grn', 'rcerp_purchase_orders', 'rcerp_work_orders', 'rcerp_wastage', 'rcerp_employees',
  'rcerp_shifts', 'rcerp_pos_orders', 'rcerp_stock_transfers', 'rcerp_recipe_inventory', 'rcerp_physical_counts', 'rcerp_pl_summaries',
  'rcerp_categories', 'rcerp_food_menus', 'rcerp_menu_plans', 'rcerp_batch_sales', 'rcerp_operating_expenses', 'rcerp_expense_budgets',
  'rcerp_customers', 'rcerp_reservations', 'rcerp_invoices', 'rcerp_accounts', 'rcerp_journal', 'rcerp_audit', 'rcerp_users',
  'rcerp_pos_returns', 'rcerp_fixed_assets', 'rcerp_scheduled_reports', 'rcerp_automation_rules',
  'rcerp_daily_counts', 'rcerp_employee_meals', 'rcerp_production_runs',
  'rcerp_custom_roles', 'rcerp_opening_balances', 'rcerp_supplier_quotes', 'rcerp_supplier_returns',
  'rcerp_monthly_inventory', 'rcerp_closed_months', 'rcerp_vat_percent', 'rcerp_vat_inclusive',
  'rcerp_currencies', 'rcerp_companies', 'rcerp_requisitions',
  'rcerp_delivery_apps', 'rcerp_branch_stock_limits', 'rcerp_delivery_sales',
  'rcerp_purchase_requests',
  'rcerp_access_roles', 'rcerp_material_categories', 'rcerp_closed_days',
  'rcerp_customer_orders', 'rcerp_deduct_sales',
  'rcerp_attendance', 'rcerp_payroll', 'rcerp_butcher_tests', 'rcerp_recipe_sections',
  'rcerp_distributions', 'rcerp_intake_inbox', 'rcerp_documents', 'rcerp_deleted_ids',
  'rcerp_units', 'rcerp_inventory_batches', 'rcerp_temp_logs', 'rcerp_haccp_inspections', 'rcerp_tasks', 'rcerp_custom_reports',
  'rcerp_eod_closures',
];

describe('bootstrap read gating', () => {
  it('admin يستقبل كل المجموعات بلا استبعاد', () => {
    const denied = COLLECTION_KEYS.filter((k) => !canReadCollection({ role: 'admin' }, k, []).ok);
    expect(denied).toEqual([]);
  });

  it('counter لا يستقبل الدفاتر المالية ولا المستخدمين', () => {
    const user = { role: 'counter' };
    const denied = COLLECTION_KEYS.filter((k) => !canReadCollection(user, k, []).ok);
    // يجب أن يكون Among them: الدفاتر، المشتريات، المستخدمون، الأدوار
    for (const must of ['rcerp_journal', 'rcerp_accounts', 'rcerp_pl_summaries', 'rcerp_grn', 'rcerp_suppliers', 'rcerp_users', 'rcerp_access_roles', 'rcerp_invoices', 'rcerp_fixed_assets']) {
      expect(denied).toContain(must);
    }
    // لا يستقبل كل شيء: مخزونه وجرده متاح
    expect(denied.length).toBeLessThan(COLLECTION_KEYS.length / 2);
  });

  it('waiter لا يستقبل الجرد ولا الدفاتر', () => {
    const user = { role: 'waiter' };
    expect(canReadCollection(user, 'rcerp_daily_counts', []).ok).toBe(false);
    expect(canReadCollection(user, 'rcerp_journal', []).ok).toBe(false);
    // لكن مبيعاته وحجوزاته متاحة
    expect(canReadCollection(user, 'rcerp_pos_orders', []).ok).toBe(true);
    expect(canReadCollection(user, 'rcerp_reservations', []).ok).toBe(true);
  });

  it('كل مجموعة مُصنّفة في واحدة من القوائم المعروفة (لا مفاتيح يتيمة في الكود)', () => {
    // أي مفتاح غير مُصنَّف يُرفض لكل الأدوار التشغيلية — هذا مقصود (قائمة بيضاء)
    const counter = { role: 'counter' };
    const orphans = COLLECTION_KEYS.filter((k) => {
      const known = SHARED_REFERENCE_KEYS.has(k) || OPERATIONAL_READABLE.has(k) || COUNTING_READ_KEYS.has(k);
      const allowed = canReadCollection(counter, k, []).ok;
      // إن كان مسموحاً لقوقلط فهو يجب أن يكون مصنّفاً (أو دور له صلاحية خاصة)
      return !known && allowed;
    });
    expect(orphans).toEqual([]);
  });
});