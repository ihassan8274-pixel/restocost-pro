import { describe, it, expect, vi } from 'vitest';
import { decideFlush, runFlushQueue, sortEntriesBySize, mergeByIdLocal } from './syncEngine';
import type { FlushHandlers } from './syncEngine';

describe('decideFlush', () => {
  it('يعتبر 2xx نجاحاً', () => {
    expect(decideFlush(200)).toEqual({ kind: 'saved' });
    expect(decideFlush(204)).toEqual({ kind: 'saved' });
  });
  it('يعتبر 409 رفضاً لبيانات تجريبية (shrink)', () => {
    expect(decideFlush(409)).toEqual({ kind: 'shrunk', note: 'رفض (بيانات تجريبية)' });
  });
  it('يعتبر 401 انتهاء جلسة، و403 نقص صلاحية (ليس انتهاء جلسة)', () => {
    expect(decideFlush(401)).toEqual({ kind: 'auth', note: '401' });
    expect(decideFlush(403)).toEqual({ kind: 'forbidden', note: '403' });
  });
  it('يعيد محاولة أي رمز آخر', () => {
    expect(decideFlush(500)).toEqual({ kind: 'retry', note: 'HTTP 500' });
    expect(decideFlush(429)).toEqual({ kind: 'retry', note: 'HTTP 429' });
  });
});

describe('sortEntriesBySize', () => {
  it('يرتب المفاتيح الصغيرة أولاً فلا يحجب الكبير بقية التعديلات', () => {
    const entries = [
      { key: 'big', value: Array.from({ length: 1000 }, (_, i) => ({ id: i })) },
      { key: 'small', value: [{ id: 1 }] },
    ];
    const sorted = sortEntriesBySize(entries);
    expect(sorted[0].key).toBe('small');
    expect(sorted[1].key).toBe('big');
    expect(entries[0].key).toBe('big'); // غير مهيأة مصدرية
  });
});

describe('mergeByIdLocal', () => {
  const rec = (id: string, m: number) => ({ id, _mtime: m, name: id });

  it('يضيف سجلات جديدة من الخادم ولا يفقد المحلية', () => {
    const out = mergeByIdLocal([rec('A', 10)], [rec('B', 20), rec('C', 30)]);
    expect(out.map((r) => r.id).sort()).toEqual(['A', 'B', 'C']);
  });

  it('السجل الأحدث _mtime يفوز عند تعارض المعرّف', () => {
    const out = mergeByIdLocal([rec('A', 50)], [rec('A', 10)]);
    expect(out).toHaveLength(1);
    expect(out[0]._mtime).toBe(50);
  });

  it('قائمة واردة فارغة [] لا تحذف أي سجل محلي', () => {
    expect(mergeByIdLocal([rec('A', 10), rec('B', 20)], [])).toEqual([rec('A', 10), rec('B', 20)]);
  });

  it('قائمة واردة غير مصفوفة تعيد المحلية كما هي', () => {
    expect(mergeByIdLocal([rec('A', 1)], ('x' as unknown))).toEqual([rec('A', 1)]);
  });

  it('سجلات بدون id تُتجاهل في الدمج', () => {
    const out = mergeByIdLocal([{ name: 'no-id' } as { id?: unknown; _mtime?: number }], [{ id: 'X', _mtime: 1 }]);
    expect(out.map((r) => r?.id)).toEqual(['X']);
  });

  it('سلوك الاستقرار: سجلات لا _mtime تُعامَل كأقدم (0)', () => {
    const out = mergeByIdLocal([rec('A', 5)], [{ id: 'A' }]);
    expect(out).toHaveLength(1);
    expect(out[0]._mtime).toBe(5);
  });
});

describe('runFlushQueue', () => {
  const entry = (key: string, value: unknown) => ({ key, value });

  it('ينجح كل المفاتيح ويمسحها من الطابور في دورات تالية', async () => {
    const sent: string[] = [];
    const onSaved = vi.fn();
    const handlers: FlushHandlers = {
      send: async (key) => { sent.push(key); return 200; },
      onSaved,
      onShrinkRejected: async () => {},
    };
    const res = await runFlushQueue([entry('a', 1), entry('b', 2)], handlers);
    expect(sent).toEqual(['a', 'b']);
    expect(onSaved).toHaveBeenCalledTimes(2);
    expect(res.hadFailures).toBe(false);
    expect(res.gotAuthError).toBe(false);
    expect(res.failures).toEqual([]);
  });

  it('يحذف المفتاح المرفوض (409) ويستدعي استرجاع الحقيقة', async () => {
    const onShrinkRejected = vi.fn(async () => {});
    const res = await runFlushQueue(
      [entry('big', [])],
      {
        send: async () => 409,
        onSaved: vi.fn(),
        onShrinkRejected,
      },
      { failures: [] },
    );
    expect(onShrinkRejected).toHaveBeenCalledWith('big');
    expect(res.hadFailures).toBe(true);
    expect(res.failures).toEqual(['big→رفض (بيانات تجريبية)']);
  });

  it('ينتقل للمفتاح التالي عند فشل واحد (بدون استجابة) دون تجميد البقية', async () => {
    const sent: string[] = [];
    const res = await runFlushQueue(
      [entry('offline', 1), entry('ok', 2)],
      {
        send: async (key) => { if (key === 'offline') throw new Error('no network'); sent.push(key); return 200; },
        onSaved: vi.fn(),
        onShrinkRejected: async () => {},
      },
      { failures: [] },
    );
    expect(sent).toEqual(['ok']);
    expect(res.hadFailures).toBe(true);
    expect(res.failures).toContain('offline→لا استجابة');
  });

  it('يتوقف فور 401 ويضع علامة انتهاء الجلسة', async () => {
    const sent: string[] = [];
    const res = await runFlushQueue(
      [entry('a', 1), entry('b', 2)],
      {
        send: async (key) => { sent.push(key); return key === 'a' ? 401 : 200; },
        onSaved: vi.fn(),
        onShrinkRejected: async () => {},
      },
      { failures: [] },
    );
    expect(sent).toEqual(['a']); // break بعد أول 401
    expect(res.gotAuthError).toBe(true);
    expect(res.hadFailures).toBe(true);
  });

  it('عند 403 لا يوقف الطابور ولا يضع علامة انتهاء الجلسة (نقص صلاحية لا جلسة منتهية)', async () => {
    const sent: string[] = [];
    const res = await runFlushQueue(
      [entry('denied', 1), entry('allowed', 2)],
      {
        send: async (key) => { sent.push(key); return key === 'denied' ? 403 : 200; },
        onSaved: vi.fn(),
        onShrinkRejected: async () => {},
      },
      { failures: [] },
    );
    expect(sent).toEqual(['denied', 'allowed']); // لا break
    expect(res.gotAuthError).toBe(false);
    expect(res.hadFailures).toBe(true);
    expect(res.failures).toContain('denied→صلاحية غير كافية (403)');
  });

  it('يلغي الطلب عند انتهاء المهلة ويعتبره لا استجابة', async () => {
    const res = await runFlushQueue(
      [entry('slow', 1)],
      {
        send: async (_k, _v, signal) => {
          // fetch الملغى يرفض بـ AbortError — نفس سلوك الشبكة الحقيقية
          await new Promise((_resolve, reject) => {
            const t = setTimeout(() => reject(new Error('fetch aborted')), 50);
            signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('The operation was aborted.', 'AbortError')); });
          });
          return 200;
        },
        onSaved: vi.fn(),
        onShrinkRejected: async () => {},
      },
      { abortMs: 5, failures: [] },
    );
    expect(res.hadFailures).toBe(true);
    expect(res.failures).toContain('slow→لا استجابة');
  });

  it('يستخدم قناة failures مشتركة لإضافة ملاحظات الاسترجاع بعد الرفض', async () => {
    const shared: string[] = [];
    const res = await runFlushQueue(
      [entry('k', [])],
      {
        send: async () => 409,
        onSaved: vi.fn(),
        onShrinkRejected: async () => { shared.push('→تم استرجاع البيانات الحقيقية (k)'); },
      },
      { failures: shared },
    );
    expect(shared).toEqual(['k→رفض (بيانات تجريبية)', '→تم استرجاع البيانات الحقيقية (k)']);
    expect(res.failures).toBe(shared);
  });
});