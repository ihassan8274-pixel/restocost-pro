// server/test/repo/cdc.test.mjs — Change Data Capture log.
// يُشغَّل بواسطة Vitest على store SQLite داخل الذاكرة.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSqliteStore } from '../../store.mjs';
import { CollectionRepository, UnitOfWork } from '../../repository.mjs';

let store;
beforeEach(() => { store = createSqliteStore(':memory:'); });
afterEach(() => { try { store.db?.close(); } catch { /* noop */ } });

describe('CDC — سجل التغييرات التنبثقي', () => {
  it('setKV يُسجل إدخال set والنسخة تتصاعد', () => {
    store.setKV('rcerp_branches', [{ id: 'b1' }]);
    store.setKV('rcerp_suppliers', [{ id: 's1' }]);
    const all = store.cdcSince(0);
    expect(all).toHaveLength(2);
    expect(all[0].key).toBe('rcerp_branches');
    expect(all[0].op).toBe('set');
    expect(all[1].seq).toBe(all[0].seq + 1);
  });

  it('deleteKV يُسجل op=del', () => {
    store.setKV('rcerp_branches', [{ id: 'b1' }]);
    store.deleteKV('rcerp_branches');
    const entries = store.cdcSince(0);
    expect(entries).toHaveLength(2);
    expect(entries[1].op).toBe('del');
  });

  it('cdcSince(since) يعيد فقط ما بعد النسخة المعطاة', () => {
    store.setKV('a', 1);
    const mark = store.revState().cdc;
    store.setKV('b', 2);
    store.setKV('c', 3);
    const entries = store.cdcSince(mark);
    expect(entries).toHaveLength(2);
    expect(entries[0].key).toBe('b');
    expect(entries[1].key).toBe('c');
  });

  it('setKVMany يكتب كل المفاتيح مع نسخ متصاعدة', () => {
    const batch = new Map([['rcerp_branches', [{ id: 'b1' }]], ['rcerp_suppliers', [{ id: 's1' }]], ['rcerp_units', []]]);
    store.setKVMany(batch);
    const entries = store.cdcSince(0);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.key)).toEqual(['rcerp_branches', 'rcerp_suppliers', 'rcerp_units']);
  });

  it('UnitOfWork.commit يكتب CDC واحداً لكل مجموعة', () => {
    const uow = new UnitOfWork(store);
    const branches = uow.repository('rcerp_branches');
    const suppliers = uow.repository('rcerp_suppliers');
    uow.begin();
    branches.upsert({ id: 'b1', name: 'x' });
    suppliers.upsert({ id: 's1', name: 'y' });
    uow.commit();
    const entries = store.cdcSince(0);
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((e) => e.key))).toEqual(new Set(['rcerp_branches', 'rcerp_suppliers']));
  });

  it('UnitOfWork.rollback لا يُسجل أي تغيير', () => {
    const uow = new UnitOfWork(store);
    const branches = uow.repository('rcerp_branches');
    uow.begin();
    branches.upsert({ id: 'b1' });
    uow.rollback();
    expect(store.cdcSince(0)).toHaveLength(0);
  });

  it('revState يكشف watermark (cdc) = آخر نسخة', () => {
    store.setKV('a', 1);
    store.setKV('b', 2);
    expect(store.revState().cdc).toBe(2);
  });
});