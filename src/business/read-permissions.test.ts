import { describe, it, expect } from 'vitest';
// خادم — بوابة صلاحيات القراءة (canReadCollection)
// كان /api/bootstrap و /api/collections/:key/paginated يتحققان من وجود الجلسة
// فقط، فأي دور مصادَق عليه كان يسحب القيود المالية وأسعار الشراء لكل الفروع.
// هذه الاختبارات تفشل إن عاد الخلل.
import { canReadCollection } from '../../server/permissions.mjs';

describe('canReadCollection', () => {
  it('admin يقرأ كل شيء بلا استثناء', () => {
    for (const key of [
      'rcerp_journal', 'rcerp_grn', 'rcerp_users', 'rcerp_custom_roles',
      'rcerp_inventory', 'rcerp_pos_orders', 'rcerp_purchase_orders',
    ]) {
      expect(canReadCollection({ role: 'admin' }, key, []).ok).toBe(true);
    }
  });

  it('counter (جرد) لا يرى الدفاتر المالية ولا المشتريات', () => {
    // ما يحتاجه للجرد الفعلي
    for (const key of ['rcerp_daily_counts', 'rcerp_physical_counts', 'rcerp_inventory', 'rcerp_audit']) {
      expect(canReadCollection({ role: 'counter' }, key, []).ok).toBe(true);
    }
    // ما لا يجب أن يراه أبداً
    for (const key of [
      'rcerp_journal', 'rcerp_accounts', 'rcerp_pl_summaries',
      'rcerp_grn', 'rcerp_suppliers', 'rcerp_purchase_orders',
      'rcerp_invoices', 'rcerp_fixed_assets', 'rcerp_currencies',
      'rcerp_companies', 'rcerp_users', 'rcerp_access_roles',
    ]) {
      expect(canReadCollection({ role: 'counter' }, key, []).ok).toBe(false);
    }
  });

  it('waiter لا يرى إلا المبيعات والحجوزات والمخزون', () => {
    for (const key of ['rcerp_pos_orders', 'rcerp_delivery_sales', 'rcerp_reservations', 'rcerp_customers', 'rcerp_inventory']) {
      expect(canReadCollection({ role: 'waiter' }, key, []).ok).toBe(true);
    }
    for (const key of ['rcerp_journal', 'rcerp_grn', 'rcerp_daily_counts', 'rcerp_users']) {
      expect(canReadCollection({ role: 'waiter' }, key, []).ok).toBe(false);
    }
  });

  it('chef لا يرى المال ولا المشتريات', () => {
    for (const key of ['rcerp_recipes', 'rcerp_food_menus', 'rcerp_production_runs', 'rcerp_inventory']) {
      expect(canReadCollection({ role: 'chef' }, key, []).ok).toBe(true);
    }
    for (const key of ['rcerp_journal', 'rcerp_grn', 'rcerp_suppliers', 'rcerp_invoices']) {
      expect(canReadCollection({ role: 'chef' }, key, []).ok).toBe(false);
    }
  });

  it('المرجع المشترك متاح للجميع (أسماء لا أرقام مالية)', () => {
    for (const role of ['counter', 'waiter', 'chef', 'storekeeper']) {
      for (const key of ['rcerp_raw_materials', 'rcerp_branches', 'rcerp_material_categories', 'rcerp_customers']) {
        expect(canReadCollection({ role }, key, []).ok).toBe(true);
      }
    }
  });

  it('أدوار الإدارة والمالية ترى كل شيء', () => {
    for (const role of ['executive', 'branch_manager', 'cost_controller']) {
      expect(canReadCollection({ role }, 'rcerp_journal', []).ok).toBe(true);
      expect(canReadCollection({ role }, 'rcerp_grn', []).ok).toBe(true);
    }
  });

  it('مستخدم غير مصادَق يُرفض', () => {
    expect(canReadCollection(null, 'rcerp_inventory', []).ok).toBe(false);
  });

  it('الدور المخصّص يُحترم عبر baseRole', () => {
    // دور مخصص قاعدته cost_controller → يرى الدفاتر المالية
    const accessRoles = [{ id: 'r1', name: 'مدقق', baseRole: 'cost_controller' }];
    expect(canReadCollection({ role: 'staff', roleId: 'r1' }, 'rcerp_journal', accessRoles).ok).toBe(true);
    // دور مخصص قاعدته counter → لا يرى الدفاتر المالية
    const accessRoles2 = [{ id: 'r2', name: 'عداد', baseRole: 'counter' }];
    expect(canReadCollection({ role: 'staff', roleId: 'r2' }, 'rcerp_journal', accessRoles2).ok).toBe(false);
  });
});