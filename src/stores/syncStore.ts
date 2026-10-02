import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { runFlushQueue, sortEntriesBySize } from '../business/syncEngine';
import { getCollectionSetter, getCollectionValue, isTombstoneKey, withApplying } from './collectionRegistry';
import { useAuthStore } from './authStore';
import { useLegacyCompatStore } from './legacyCompatStore';

// نواة المزامنة على مستوى الستور: نفس منطق useSyncCore المستخلص سابقاً من AppProvider —
// طابور حفظ دائم في المتصفح، إرسال عند عودة الاتصال/إعادة الدخول/دورياً، واستطلاع
// تغييرات الخادم بلا طمس التعديلات المحلية. الجلب/setState تُنفَّذ داخلياً الآن.

const PENDING_SAVES_KEY = 'rcerp_pending_saves';
const OFFLINE_CACHE_KEY = 'rcerp_offline_cache';

const hydratePendingSaves = (): Map<string, unknown> => {
  try {
    const raw = localStorage.getItem(PENDING_SAVES_KEY);
    if (raw) return new Map(JSON.parse(raw) as [string, unknown][]);
  } catch { /* تجاهل التالف */ }
  return new Map();
};

const syncFpOf = (d: Record<string, unknown>): string => {
  try { return JSON.stringify(d); } catch { return ''; }
};

const pendingSaves = new Map<string, unknown>();

// المتغيرات الآنية على مستوى الوحدة (ليست جزءاً من حالة الستور المستمرة).
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

interface SyncState {
  booting: boolean;
  setBooting: (v: boolean) => void;
  ready: boolean;
  setReady: (v: boolean) => void;
  offline: boolean;
  setOffline: (v: boolean) => void;
  offlineSince: string;
  setOfflineSince: (v: string) => void;
  refresh: number;
  retryBootstrap: () => void;
  saveFailed: boolean;
  setSaveFailed: (v: boolean) => void;
  saveErrorDetail: string;
  setSaveErrorDetail: (v: string) => void;
  pendingSavesCount: number;
  pendingSaves: Map<string, unknown>;
  applyData: (d: Record<string, unknown>) => void;
  persist: (key: string, value: unknown) => void;
  flushSaves: () => Promise<void>;
  reapplyPending: () => void;
  syncNow: (key?: string) => Promise<boolean>;
  serverFpRef: React.MutableRefObject<string | null>;
  appliedRefsRef: React.MutableRefObject<Map<string, unknown>>;
  COLLECTION_SETTERS: Record<string, (v: unknown) => void>;
  cacheOffline: (data: Record<string, unknown>) => void;
}

const snapshotPending = () => {
  try { localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(Array.from(pendingSaves.entries()))); } catch { /* تجاهل */ }
};

const scheduleFlush = (delay: number, _set: (p: Partial<SyncState>) => void) => {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (useAuthStore.getState().authExpired) return;
  flushTimer = setTimeout(() => { void useSyncStore.getState().flushSaves(); }, delay);
};

// إسقاط الشواهد المرفوضة من الستور المحلي (يتزامن بعد applyData).
const applyRejectedTombstones = (ids: string[]) => {
  useLegacyCompatStore.getState().dropTombstoneIds(ids);
};

export const useSyncStore = create<SyncState>()(
  persist(
    (set, _get) => {
      // تعبئة الطابور المستدام عند فتح الوحدة (يُرسل بعد الدخول عبر البطاقة الجسرية).
      hydratePendingSaves().forEach((value, key) => pendingSaves.set(key, value));
      const setCount = () => set({ pendingSavesCount: pendingSaves.size });

      const applyData = (d: Record<string, unknown>) => {
        withApplying(() => {
          const serverTomb = Array.isArray(d.rcerp_deleted_ids) ? (d.rcerp_deleted_ids as string[]) : [];
          const localTomb = Array.isArray(getCollectionValue('rcerp_deleted_ids')) ? (getCollectionValue('rcerp_deleted_ids') as string[]) : [];
          if (serverTomb.length) {
            const key = 'rcerp_deleted_ids';
            getCollectionSetter(key)?.([...new Set([...localTomb, ...serverTomb])]);
          }
          const tombstones = new Set<string>([...localTomb, ...serverTomb]);
          for (const k of Object.keys(d)) {
            if (k === 'rcerp_deleted_ids') continue;
            const setter = getCollectionSetter(k);
            if (!setter) continue;
            let v = d[k];
            if (v === undefined) continue;
            if (isTombstoneKey(k) && Array.isArray(v) && tombstones.size > 0) {
              v = (v as unknown[]).filter((r) => !(r && typeof r === 'object' && (r as { id?: unknown }).id !== undefined && tombstones.has(String((r as { id: unknown }).id))));
            }
            setter(v);
          }
        });
        for (const k of Object.keys(d)) {
          if (d[k] === undefined) continue;
          appliedRefsRef.current.set(k, d[k]);
        }
      };

      const stampLocalMtime = (key: string, value: unknown): unknown => {
        if (!Array.isArray(value)) return value;
        const applied = appliedRefsRef.current.get(key);
        if (!Array.isArray(applied)) return value;
        const appliedById = new Map<string, unknown>();
        applied.forEach((r) => { if (r && typeof r === 'object' && (r as { id?: unknown }).id !== undefined) appliedById.set(String((r as { id: unknown }).id), r); });
        const now = Date.now();
        return value.map((r) => {
          if (!r || typeof r !== 'object' || (r as { id?: unknown }).id === undefined) return r;
          const rec = r as Record<string, unknown>;
          const prev = appliedById.get(String(rec.id));
          if (prev === r) return r;
          if (prev === undefined || JSON.stringify(prev) !== JSON.stringify(r)) return { ...rec, _mtime: now };
          return r;
        });
      };

      const persist = (key: string, value: unknown) => {
        if (!useSyncStore.getState().ready) return;
        if (appliedRefsRef.current.get(key) === value) return;
        pendingSaves.set(key, stampLocalMtime(key, value));
        setCount();
        snapshotPending();
        scheduleFlush(600, set);
      };

      const flushSaves = async (): Promise<void> => {
        if (flushing) return;
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        if (pendingSaves.size === 0) { set({ saveFailed: false, saveErrorDetail: '' }); return; }
        flushing = true;
        let gotAuthError = false;
        let hadFailures = false;
        try {
          const token = localStorage.getItem('rcerp_token');
          const failures: string[] = [];
          const entries = sortEntriesBySize(Array.from(pendingSaves.entries(), ([key, value]) => ({ key, value })));
          const result = await runFlushQueue(entries, {
            async send(key, value, signal) {
              // الخادم يرسل rejectedIds عند شواهد الحذف (يقبل الدفعة ويسقط
              // المرفوض منها). نقرأ الرد مرة واحدة، نُسقط المرفوض من الطابور
              // ومن الستور المحلي، ثم نُرجع الحالة — لأن رفض 400 كان يُجمّد
              // المزامنة كاملة ويُسقط حفظ الجرد.
              const res = await fetch(`/api/collections/${encodeURIComponent(key)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify(value),
                signal,
              });
              if (key === 'rcerp_deleted_ids' && res.ok) {
                try {
                  const body = await res.json();
                  const rejected: string[] = Array.isArray(body?.rejectedIds) ? body.rejectedIds : [];
                  if (rejected.length) {
                    const cur = pendingSaves.get(key);
                    if (Array.isArray(cur)) {
                      const drop = new Set(rejected);
                      pendingSaves.set(key, cur.filter((x) => typeof x !== 'string' || !drop.has(x)));
                      setCount();
                    }
                    applyRejectedTombstones(rejected);
                  }
                } catch { /* لا يهم — الرد نجح */ }
              }
              return res.status;
            },
            onSaved(key) {
              pendingSaves.delete(key);
              setCount();
            },
            async onShrinkRejected(key) {
              pendingSaves.delete(key);
              setCount();
              try {
                const b = await fetch('/api/bootstrap', {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                }).then((r) => r.json());
                if (b && b.ok && b.data) {
                  applyData(b.data);
                  serverFpRef.current = syncFpOf(b.data as Record<string, unknown>);
                  localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: b.data }));
                  set({ offline: false, offlineSince: '' });
                  failures.push(`→تم استرجاع البيانات الحقيقية (${key})`);
                }
              } catch { /* تجاهل */ }
            },
          }, { failures });
          gotAuthError = result.gotAuthError;
          hadFailures = result.hadFailures;
          if (failures.length) console.warn('[RestoCost] إخفاق حفظ:', failures.join(' · '), '| المتبقي:', pendingSaves.size);
          snapshotPending();
          setCount();
          set({ saveFailed: pendingSaves.size > 0, saveErrorDetail: failures.slice(-3).join(' · ') });
          if (gotAuthError) useAuthStore.getState().setAuthExpired(true);
        } finally {
          flushing = false;
        }
        if (pendingSaves.size > 0 && !flushTimer) {
          scheduleFlush(gotAuthError ? 60000 : hadFailures ? 6000 : 600, set);
        }
      };

      const reapplyPending = () => {
        withApplying(() => {
          for (const [key, value] of pendingSaves.entries()) {
            const setter = getCollectionSetter(key);
            if (setter) setter(value);
          }
        });
        for (const [key, value] of pendingSaves.entries()) pendingSaves.set(key, value);
        setCount();
        snapshotPending();
        if (pendingSaves.size > 0 && !flushTimer && !useAuthStore.getState().authExpired) {
          scheduleFlush(100, set);
        }
      };

      const syncNow = async (key?: string): Promise<boolean> => {
        const { ready, currentUser } = {} as Record<string, unknown>;
        void ready; void currentUser;
        if (!useSyncStore.getState().ready || !useAuthStore.getState().currentUser) return false;
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        for (let i = 0; i < 20; i++) {
          if (pendingSaves.size > 0 && (!key || pendingSaves.has(key))) break;
          await new Promise((r) => setTimeout(r, 25));
        }
        await useSyncStore.getState().flushSaves();
        return pendingSaves.size === 0;
      };

      const serverFpRef = { current: null as string | null };
      const appliedRefsRef = { current: new Map<string, unknown>() };

      return {
        booting: true,
        setBooting: (v) => set({ booting: v }),
        ready: false,
        setReady: (v) => set({ ready: v }),
        offline: false,
        setOffline: (v) => set({ offline: v }),
        offlineSince: '',
        setOfflineSince: (v) => set({ offlineSince: v }),
        refresh: 0,
        retryBootstrap: () => set((state) => ({ refresh: state.refresh + 1 })),
        saveFailed: false,
        setSaveFailed: (v) => set({ saveFailed: v }),
        saveErrorDetail: '',
        setSaveErrorDetail: (v) => set({ saveErrorDetail: v }),
        pendingSavesCount: pendingSaves.size,
        pendingSaves,
        applyData,
        persist,
        flushSaves,
        reapplyPending,
        syncNow,
        serverFpRef,
        appliedRefsRef,
        COLLECTION_SETTERS: {},
        cacheOffline: (data) => {
          localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data }));
        },
      };
    },
    {
      name: 'rcerp_sync',
      partialize: (s) => ({ booting: s.booting, ready: s.ready, offline: s.offline, offlineSince: s.offlineSince }),
    }
  )
);