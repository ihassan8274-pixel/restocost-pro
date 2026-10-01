import { describe, it, expect } from 'vitest';
// يستورد وحدة السيرفر (خام .mjs) للتحقق من بوابة الصلاحيات التي تحمي حفظ الجرد والمبيعات.
import { canWriteCollection, canPurgeTombstone } from '../../server/permissions.mjs';

const ROLES = ['executive', 'admin', 'branch_manager', 'cost_controller', 'chef', 'storekeeper', 'waiter', 'counter'] as const;

describe('canWriteCollection', () => {
  it('admin يكتب كل شيء', () => {
    for (const key of ['rcerp_daily_counts', 'rcerp_batch_sales', 'rcerp_users', 'rcerp_closed_months']) {
      expect(canWriteCollection({ role: 'admin' }, key, []).ok).toBe(true);
    }
  });

  it('عداد الجرد (counter) يحفظ الجرد فقط', () => {
    expect(canWriteCollection({ role: 'counter' }, 'rcerp_daily_counts', []).ok).toBe(true);
    expect(canWriteCollection({ role: 'counter' }, 'rcerp_physical_counts', []).ok).toBe(true);
    expect(canWriteCollection({ role: 'counter' }, 'rcerp_batch_sales', []).ok).toBe(false);
    expect(canWriteCollection({ role: 'counter' }, 'rcerp_invoices', []).ok).toBe(false);
  });

  it('أمين المخزن (storekeeper) يحفظ الجرد والمخزون ومشتريات الموردين', () => {
    for (const key of ['rcerp_daily_counts', 'rcerp_inventory', 'rcerp_grn', 'rcerp_purchase_orders', 'rcerp_suppliers']) {
      expect(canWriteCollection({ role: 'storekeeper' }, key, []).ok).toBe(true);
    }
    expect(canWriteCollection({ role: 'storekeeper' }, 'rcerp_journal', []).ok).toBe(false);
  });

  it('مدير الفرع ومحاسب التكاليف يحفظان المبيعات المجمعة (استيراد فودكس)', () => {
    for (const role of ['branch_manager', 'cost_controller']) {
      expect(canWriteCollection({ role }, 'rcerp_batch_sales', []).ok).toBe(true);
      expect(canWriteCollection({ role }, 'rcerp_delivery_sales', []).ok).toBe(true);
      expect(canWriteCollection({ role }, 'rcerp_daily_counts', []).ok).toBe(true);
    }
  });

  it('الكاشير (waiter) يحفظ POS والحجز والعملاء فقط', () => {
    expect(canWriteCollection({ role: 'waiter' }, 'rcerp_pos_orders', []).ok).toBe(true);
    expect(canWriteCollection({ role: 'waiter' }, 'rcerp_customers', []).ok).toBe(true);
    expect(canWriteCollection({ role: 'waiter' }, 'rcerp_reservations', []).ok).toBe(true);
    expect(canWriteCollection({ role: 'waiter' }, 'rcerp_daily_counts', []).ok).toBe(false);
    expect(canWriteCollection({ role: 'waiter' }, 'rcerp_batch_sales', []).ok).toBe(false);
  });

  it('لا أحد غير admin يكتب مفاتيح الإدارة', () => {
    const adminKeys = ['rcerp_users', 'rcerp_access_roles', 'rcerp_ai_settings', 'rcerp_custom_roles'];
    for (const role of ROLES.filter((r) => r !== 'admin')) {
      for (const key of adminKeys) {
        expect(canWriteCollection({ role }, key, []).ok).toBe(false);
      }
    }
  });

  it('يستخدم الدور الأساسي للدور المخصّص (roleId)', () => {
    const accessRoles = [{ id: 'r1', baseRole: 'storekeeper' }];
    expect(canWriteCollection({ role: 'waiter', roleId: 'r1' }, 'rcerp_daily_counts', accessRoles).ok).toBe(true);
    expect(canWriteCollection({ role: 'counter', roleId: 'r1' }, 'rcerp_journal', accessRoles).ok).toBe(false);
  });

  it('المفاتيح غير المرتبطة بصلاحية تبقى للإدارة فقط', () => {
    for (const key of ['rcerp_closed_months', 'rcerp_branches', 'rcerp_audit']) {
      expect(canWriteCollection({ role: 'storekeeper' }, key, []).ok).toBe(false);
      expect(canWriteCollection({ role: 'branch_manager' }, key, []).ok).toBe(true);
    }
  });

  // شواهد الحذف مفتوحة لكل دور يملك حق الكتابة في مجموعة ما (كي يستطيع
  // حذف سجله)، لكن القطع النهائي يبقى محكوماً بصلاحية المجموعة نفسها.
  it('كل الأدوار المصادَق عليها تكتب شواهد الحذف', () => {
    for (const role of ROLES) {
      expect(canWriteCollection({ role }, 'rcerp_deleted_ids', []).ok).toBe(true);
    }
    expect(canWriteCollection(null, 'rcerp_deleted_ids', []).ok).toBe(false);
  });

  // witness بمعرّف واحد كان يكفي لمحو أي سجل في النظام بلا فحص ثانٍ.
  it('شاهد الحذف لا يقطع من مجموعة لا يملك صاحبها حق الكتابة فيها', () => {
    expect(canPurgeTombstone({ role: 'counter' }, 'rcerp_daily_counts', [])).toBe(true);
    expect(canPurgeTombstone({ role: 'counter' }, 'rcerp_journal', [])).toBe(false);
    expect(canPurgeTombstone({ role: 'waiter' }, 'rcerp_pos_orders', [])).toBe(true);
    expect(canPurgeTombstone({ role: 'waiter' }, 'rcerp_batch_sales', [])).toBe(false);
  });

  it('شاهد الحذف لا يقطع المستخدمين أبداً مهما كان الدور', () => {
    for (const role of ROLES) {
      expect(canPurgeTombstone({ role }, 'rcerp_users', [])).toBe(false);
    }
    expect(canPurgeTombstone({ role: 'admin' }, 'rcerp_users', [])).toBe(false);
  });

  it('شاهد الحذف لا يقطع قائمة الشواهد نفسها (لا حذف متسلسل للجميع)', () => {
    for (const role of ROLES) {
      expect(canPurgeTombstone({ role }, 'rcerp_deleted_ids', [])).toBe(false);
    }
  });

  it('زائر غير مصادق لا يقطع شيئاً', () => {
    expect(canPurgeTombstone(null, 'rcerp_daily_counts', [])).toBe(false);
  });

  it('الدور المخصّص يحدّد ما يمكن حذفه', () => {
    const accessRoles = [{ id: 'r1', baseRole: 'storekeeper' }];
    expect(canPurgeTombstone({ role: 'waiter', roleId: 'r1' }, 'rcerp_purchase_orders', accessRoles)).toBe(true);
    expect(canPurgeTombstone({ role: 'waiter', roleId: 'r1' }, 'rcerp_journal', accessRoles)).toBe(false);
  });
});
