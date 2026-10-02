import { describe, it, expect } from 'vitest';
// قيد الفرع: الموظف غير الإداري لا يستقبل سجلات فروع غيره.
// القاعدة مطابقة لـ visibleBranchIdsFor في العميل (src/stores/hooks/useAuth.ts)
// حتى لا يختلف ما يراه المستخدم عن ما تصله البيانات.
import { scopeToBranches, visibleBranchIdsFor, BRANCH_SCOPED_KEYS } from '../../server/permissions.mjs';

const branches = [{ id: 'b-01' }, { id: 'b-02' }, { id: 'b-ck' }];

const rows = [
  { id: 'r1', branchId: 'b-01', qty: 10 },
  { id: 'r2', branchId: 'b-02', qty: 20 },
  { id: 'r3', branchId: 'b-01', qty: 30 },
  { id: 'r4', branchId: 'b-ck', qty: 40 },
];

describe('visibleBranchIdsFor', () => {
  it('admin / branchId=all يرى كل الفروع', () => {
    expect(visibleBranchIdsFor({ branchId: 'all' }, branches)).toEqual(['b-01', 'b-02', 'b-ck']);
  });
  it('موظف ب فرع مُسند يرى فرعه وحده', () => {
    expect(visibleBranchIdsFor({ branchId: 'b-01' }, branches)).toEqual(['b-01']);
  });
  it('موظف بلا فرع مُسند يرى لا شيء', () => {
    expect(visibleBranchIdsFor({}, branches)).toEqual([]);
    expect(visibleBranchIdsFor(null, branches)).toEqual([]);
  });
});

describe('scopeToBranches', () => {
  it('branchId=all لا ينقص شيئاً', () => {
    expect(scopeToBranches(rows, { branchId: 'all' }, branches)).toHaveLength(4);
  });

  it('موظف ب فرع يرى سجلات فرعه فقط', () => {
    const out = scopeToBranches(rows, { branchId: 'b-01' }, branches);
    expect(out.map((r) => r.id)).toEqual(['r1', 'r3']);
  });

  it('موظف بلا فرع يرى قائمة فارغة', () => {
    expect(scopeToBranches(rows, {}, branches)).toEqual([]);
  });

  it('سجل بلا branchId يمرّ (لا نفقد بيانات نطاقها مجهول)', () => {
    const withUnknown = [...rows, { id: 'r5', qty: 5 }];
    const out = scopeToBranches(withUnknown, { branchId: 'b-01' }, branches);
    expect(out.map((r) => r.id)).toEqual(['r1', 'r3', 'r5']);
  });

  it('قيم غير مصفوفة تمرّ بلا قصّ', () => {
    expect(scopeToBranches(null, { branchId: 'b-01' }, branches)).toBeNull();
    expect(scopeToBranches({ a: 1 }, { branchId: 'b-01' }, branches)).toEqual({ a: 1 });
    expect(scopeToBranches(15, { branchId: 'b-01' }, branches)).toBe(15);
  });

  it('المطبخ المركزي b-ck فرع مثل غيره — لا امتياز', () => {
    const out = scopeToBranches(rows, { branchId: 'b-ck' }, branches);
    expect(out.map((r) => r.id)).toEqual(['r4']);
  });
});

describe('BRANCH_SCOPED_KEYS', () => {
  it('يغطي المجموعات التي تحمل branchId فعلياً في البيانات', () => {
    // مجموعات مرجعية/إدارية يجب ألّا تُقصّ (تُقصّ بقواعد أخرى)
    const mustNotScope = [
      'rcerp_raw_materials', 'rcerp_branches', 'rcerp_users', 'rcerp_access_roles',
      'rcerp_journal', 'rcerp_accounts', 'rcerp_pl_summaries', 'rcerp_custom_categories_placeholder',
    ];
    for (const k of mustNotScope) expect(BRANCH_SCOPED_KEYS.has(k)).toBe(false);
  });

  it('يغطي المخزون والمبيعات والمشتريات التي تحمل فرعاً', () => {
    for (const k of [
      'rcerp_inventory', 'rcerp_inventory_movements', 'rcerp_grn', 'rcerp_pos_orders',
      'rcerp_batch_sales', 'rcerp_invoices', 'rcerp_daily_counts', 'rcerp_stock_transfers',
    ]) {
      expect(BRANCH_SCOPED_KEYS.has(k)).toBe(true);
    }
  });
});