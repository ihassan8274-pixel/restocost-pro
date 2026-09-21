// server/test/repo/repository.test.mjs — Repository Pattern + Unit of Work
// تُشغَّل بواسطة Vitest فقط (vitest) على store SQLite داخل الذاكرة معزولاً عن
// أي قاعدة حقيقية. تختبِر دلالات المزامنة: الدمج بالمعرّف، شواهد الحذف، _mtime.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSqliteStore } from '../../store.mjs';
import { CollectionRepository, UnitOfWork } from '../../repository.mjs';
import { mergeById } from '../../mergeCore.mjs';

const newStore = () => createSqliteStore(':memory:');

let store;
beforeEach(() => { store = newStore(); });
afterEach(() => { try { store.db?.close(); } catch { /* noop */ } });

const grnApproved = (id, mtime) => ({ id, code: `GRN-${id}`, status: 'approved', _mtime: mtime });
const grnSubmitted = (id, mtime) => ({ id, code: `GRN-${id}`, status: 'submitted', _mtime: mtime });
const branch = (id, name, extra = {}) => ({ id, name, _mtime: Date.now(), ...extra });

describe('CollectionRepository', () => {
  it('يقرأ مجموعة فارغة كـ []', () => {
    const repo = new CollectionRepository(store, 'rcerp_branches');
    expect(repo.all()).toEqual([]);
    expect(repo.count()).toBe(0);
    expect(repo.byId('x')).toBeNull();
  });

  it('upsert يضيف سجلاً جديداً ويحدّث الموجود', () => {
    const repo = new CollectionRepository(store, 'rcerp_branches');
    repo.upsert(branch('b1', 'الفرع الأول'));
    expect(repo.count()).toBe(1);
    expect(repo.byId('b1').name).toBe('الفرع الأول');
    repo.upsert(branch('b1', 'الفرع المحدّث', { _mtime: Date.now() + 1 }));
    expect(repo.count()).toBe(1);
    expect(repo.byId('b1').name).toBe('الفرع المحدّث');
  });

  it('upsert يحترم شاهد الحذف — لا يعيد سجلاً محذوفاً نهائياً', () => {
    const repo = new CollectionRepository(store, 'rcerp_branches');
    repo.upsert(branch('dead', 'x'));
    repo.remove('dead');
    const dup = { id: 'dead', name: 'y', _mtime: Date.now() + 1000 };
    repo.upsert(dup);
    expect(repo.byId('dead')).toBeNull();
    expect(store.getKV('rcerp_deleted_ids')).toContain('dead');
  });

  it('upsertMany يدمج عدة سجلات بحيث يفوز الأحدث لكل معرّف', () => {
    const repo = new CollectionRepository(store, 'rcerp_grn');
    repo.upsertMany([grnApproved('a', 100), grnApproved('b', 100)]);
    repo.upsertMany([grnSubmitted('a', 200), grnApproved('c', 300)]);
    expect(repo.count()).toBe(3);
    expect(repo.byId('a').status).toBe('submitted'); // الوارد الأحدث يفوز
    expect(repo.byId('b').status).toBe('approved');
    expect(repo.byId('c').status).toBe('approved');
  });

  it('المحفوظ يكتب إلى المخزن فعلياً (getKV يرى النتيجة)', () => {
    const repo = new CollectionRepository(store, 'rcerp_branches');
    repo.upsert(branch('b1', 'الجبيل'));
    expect(store.getKV('rcerp_branches')).toHaveLength(1);
  });

  it('remove يحذف ويضيف شاهد حذف مشترك لكل المجموعات', () => {
    const repoA = new CollectionRepository(store, 'rcerp_grn');
    const repoB = new CollectionRepository(store, 'rcerp_purchase_orders');
    repoA.upsert({ id: 'shared', x: 1, _mtime: Date.now() });
    repoB.upsert({ id: 'shared', y: 2, _mtime: Date.now() });
    repoA.remove('shared');
    expect(repoB.byId('shared')).toBeNull(); // شاهد الحذف يطهر كل مجموعة
    expect(store.getKV('rcerp_deleted_ids')).toContain('shared');
  });
});

describe('UnitOfWork', () => {
  it('جلسة واحدة: يرى كل التغييرات ثم يكتبها بدفعة واحدة', () => {
    const uow = new UnitOfWork(store);
    const grn = uow.repository('rcerp_grn');
    const branches = uow.repository('rcerp_branches');
    uow.begin();
    grn.upsert(grnApproved('a', 100));
    grn.upsert(grnApproved('b', 100));
    branches.upsert(branch('b1', 'الجبيل'));
    expect(grn.count()).toBe(2); // القراءة داخل الجلسة ترى staging
    expect(branches.count()).toBe(1);
    uow.commit();
    expect(store.getKV('rcerp_grn')).toHaveLength(2);
    expect(store.getKV('rcerp_branches')).toHaveLength(1);
    expect(store.revState().rev).toBeGreaterThan(0);
  });

  it('rollback لا يكتب أي شيء للقاعدة', () => {
    const uow = new UnitOfWork(store);
    const grn = uow.repository('rcerp_grn');
    uow.begin();
    grn.upsert(grnApproved('a', 100));
    uow.rollback();
    expect(store.getKV('rcerp_grn')).toBeNull();
    uow.begin();
    // بعد التراجع يمكن إعادة فتح جلسة جديدة
    grn.upsert(grnApproved('b', 50));
    uow.commit();
    expect(store.getKV('rcerp_grn')).toHaveLength(1);
  });

  it('commit يكون آتومياً: خطأ في التعامل لا يترك نصف مجموعة', () => {
    const uow = new UnitOfWork(store);
    const grn = uow.repository('rcerp_grn');
    uow.begin();
    grn.upsert(grnApproved('a', 100));
    // إدخال قيمة دائرية (JSON.stringify ستُرْمى TypeError) — يحاكي فشل قاعدة وسط الدفعة.
    const cyclic = {}; cyclic.self = cyclic;
    uow.touched.add('rcerp_grn'); // نفس المجموعة التي بها تعديل سبق
    uow.staged.set('rcerp_grn', { boom: cyclic });
    expect(() => uow.commit()).toThrow();
    // بعد التراجع يمكن فتح جلسة جديدة، ولا شيء وصل للقاعدة نصف مكتوب.
    const after = new UnitOfWork(store);
    after.begin();
    after.repository('rcerp_grn').upsert(grnApproved('z', 5));
    after.commit();
    expect(store.getKV('rcerp_grn')).toHaveLength(1);
  });
});

describe('mergeCore invariants (still hold)', () => {
  it('دمج كامل بمفاهيم المزامنة يبقي غير المتضارب كما هو', () => {
    const out = mergeById([grnApproved('x', 100), grnApproved('y', 90)], [grnSubmitted('x', 50)]);
    expect(out.find((r) => r.id === 'y').status).toBe('approved');
    expect(out.find((r) => r.id === 'x').status).toBe('approved');
  });

  it('شاهد الحذف يمنع عودة السجل حتى ببيانات أحدث', () => {
    const out = mergeById([{ id: 'dead', status: 'approved' }], [{ id: 'dead', status: 'submitted', _mtime: 999999 }], new Set(['dead']));
    expect(out.length).toBe(0);
  });
});