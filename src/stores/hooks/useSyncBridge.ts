import { useEffect } from 'react';
import { useSyncStore } from '../syncStore';
import { useAuthStore } from '../authStore';

import '../collectionSources';

// الجسر الجانبي للمزامنة: يُركَّب داخل AppProvider ويعيد إنتاج منطق useSyncCore —
// bootstrap من الخادم (مع إعادة محاولة عابرة)، مجموعات كسولة، وضع عدم الاتصال
// مع آخر نسخة مخزنة، استطلاع خلفي كل 20 ثانية، تتبُّع حالة الاتصال، وحفظ عند الخروج.

const LAZY_COLLECTIONS = [
  'rcerp_inventory_movements',
  'rcerp_audit',
  'rcerp_journal',
  'rcerp_batch_sales',
  'rcerp_grn',
  'rcerp_inventory',
  'rcerp_recipe_sections',
  'rcerp_inventory_batches',
  'rcerp_temp_logs',
  'rcerp_haccp_inspections',
  'rcerp_tasks',
  'rcerp_custom_reports',
  'rcerp_eod_closures',
];

const fpOf = (d: Record<string, unknown>): string => {
  try { return JSON.stringify(d); } catch { return ''; }
};

export const SyncBridge = () => {
  const refresh = useSyncStore((s) => s.refresh);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const loadFromServer = async (): Promise<{ ok: boolean; auth: boolean }> => {
      const token = localStorage.getItem('rcerp_token');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const res = await fetch('/api/bootstrap', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return { ok: false, auth: res.status === 401 || res.status === 403 };
        const json = await res.json();
        if (!json || !json.ok) return { ok: false, auth: false };
        if (cancelled) return { ok: true, auth: false };
        const d: Record<string, unknown> = json.data || {};
        useSyncStore.getState().applyData(d);
        // الخادم هو المرجع: أعِد تطبيق المحلي غير المرتفع (حذف/تعديل) فوقه كأحدث نسخة.
        if (useSyncStore.getState().pendingSaves.size > 0) useSyncStore.getState().reapplyPending();
        useSyncStore.getState().serverFpRef.current = fpOf(d);
        localStorage.setItem('rcerp_offline_cache', JSON.stringify({ savedAt: new Date().toISOString(), data: d }));
        useSyncStore.getState().setOffline(false);
        useSyncStore.getState().setOfflineSince('');
        if (json.user) {
          useAuthStore.getState().setCurrentUser(json.user);
          if (json.mustChangePassword) useAuthStore.getState().setMustChangePassword(true);
        } else if (token) {
          localStorage.removeItem('rcerp_token');
        }
        return { ok: true, auth: false };
      } catch {
        return { ok: false, auth: false };
      } finally {
        clearTimeout(timer);
      }
    };

    const loadLazyCollections = async () => {
      const token = localStorage.getItem('rcerp_token');
      if (!token) return;
      for (const key of LAZY_COLLECTIONS) {
        if (cancelled) break;
        try {
          const res = await fetch(`/api/collections/${key}/paginated?limit=500`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            if (json.ok && Array.isArray(json.items)) {
              useSyncStore.getState().applyData({ [key]: json.items });
            }
          }
        } catch { /* تجاهل إخفاق مجرد */ }
      }
    };

    void (async () => {
      let r = await loadFromServer();
      let ok = r.ok;
      const authFail = r.auth;
      // 401/403 ليس انقطاعاً بالشبكة: نعرض شاشة الدخول ولا نظهر "بلا اتصال" ولا نكشف الكاش.
      // إعادة الدخول تحفّز retryBootstrap.
      if (!authFail && !ok && !cancelled) {
        for (let i = 0; i < 3 && !ok && !cancelled; i++) {
          await new Promise((r2) => setTimeout(r2, 1500 * (i + 1)));
          r = await loadFromServer();
          ok = r.ok;
        }
      }
      if (!ok && !authFail && !cancelled) {
        // الخادم غير متاح — نقدّم آخر نسخة متزامنة من الكاش إن لم تكن هناك تعديلات محلية معلّقة
        // حتى لا نستبدل حالة محلية أحدث (حذف/تعديل لم تصل) بنسخة قديمة، مع إبقاء "المحذوف" بعد التحديث.
        if (useSyncStore.getState().pendingSaves.size === 0) {
          try {
            const cached = localStorage.getItem('rcerp_offline_cache');
            if (cached) {
              const obj = JSON.parse(cached) as { savedAt?: string; data?: Record<string, unknown> };
              if (obj && obj.data) {
                useSyncStore.getState().applyData(obj.data);
                useSyncStore.getState().setOffline(true);
                useSyncStore.getState().setOfflineSince(obj.savedAt || '');
              }
            }
          } catch { /* تجاهل */ }
        } else {
          useSyncStore.getState().setOffline(true);
          useSyncStore.getState().setOfflineSince('');
        }
        // نُبقي الاستطلاع في الخلفية ونزيل اللافتة فور عودة الاتصال.
        const attempt = async () => {
          if (cancelled) return;
          const rr = await loadFromServer();
          if (rr.ok) useSyncStore.getState().setOffline(false);
          else if (!rr.auth) pollTimer = setTimeout(attempt, 20000);
        };
        pollTimer = setTimeout(attempt, 20000);
      }
      if (!cancelled) {
        useSyncStore.getState().setReady(true);
        useSyncStore.getState().setBooting(false);
        void loadLazyCollections();
      }
    })();

    return () => { cancelled = true; if (pollTimer) clearTimeout(pollTimer); };
  }, [refresh]);

  // تتبُّع حالة الشبكة لتعكس اللافتة الوضع الحقيقي، مع دفع المعلّق فور العودة.
  useEffect(() => {
    const on = () => {
      useSyncStore.getState().setOffline(false);
      const s = useSyncStore.getState();
      if (s.ready && !useAuthStore.getState().authExpired && s.pendingSaves.size > 0) {
        void s.flushSaves();
      }
    };
    const off = () => useSyncStore.getState().setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // حفظ معلّق عند إغلاق الصفحة (متصفحات سطح المكتب فقط).
  useEffect(() => {
    const onHide = () => {
      const s = useSyncStore.getState();
      if (s.pendingSaves.size > 0 && !useAuthStore.getState().authExpired) void s.flushSaves();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  return null;
};

export default SyncBridge;