import { useEffect, useRef, useState } from 'react';
import { runFlushQueue, sortEntriesBySize } from './syncEngine';

// نواة مزامنة المعطيات (مستخرجة من AppProvider): طابور الحفظ الدائم في المتصفح،
// إرسال تلقائي عند عودة الاتصال/إعادة الدخول/دورياً، واستطلاع تغييرات الخادم بلا طمس
// التعديلات المحلية. الآثار الجانبية (fetch/setState) تُحقن كاعتماديات — سلوك مطابق للأصل.
// طابور الحفظ الدائم: يُستعاد من المتصفح عند كل فتح للنظام حتى لا تُفقد التعديلات المعلّقة
const PENDING_SAVES_KEY = 'rcerp_pending_saves';
const hydratePendingSaves = (): Map<string, unknown> => {
  try {
    const raw = localStorage.getItem(PENDING_SAVES_KEY);
    if (raw) return new Map(JSON.parse(raw) as [string, unknown][]);
  } catch { /* تجاهل التالف */ }
  return new Map();
};

interface SyncCoreDeps {
  ready: boolean;
  currentUser: { id?: string | number } | null;
  booting: boolean;
  setCurrentUser: (u: any) => void;
  applyData: (d: Record<string, unknown>) => void;
  fpOf: (d: Record<string, unknown>) => string;
  serverFpRef: { current: string | null };
  appliedRefsRef: { current: Map<string, unknown> };
  COLLECTION_SETTERS: Record<string, (v: unknown) => void>;
  setOffline: (v: boolean) => void;
  setOfflineSince: (v: string) => void;
}

export const useSyncCore = (deps: SyncCoreDeps) => {
  const { ready, currentUser, booting, setCurrentUser, applyData, fpOf, serverFpRef, appliedRefsRef, COLLECTION_SETTERS, setOffline, setOfflineSince } = deps;

  // ---- موثوقية الحفظ: طابور دائم في المتصفح ----
  // أي تعديل لم يصل للخادم (انقطاع شبكة / انتهاء جلسة / إغلاق سريع للصفحة) يُخزَّن مؤقتاً
  // على الجهاز نفسه ويُرسل تلقائياً عند عودة الاتصال أو إعادة تسجيل الدخول — لا ضياع بيانات.
  const [saveFailed, setSaveFailed] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [saveErrorDetail, setSaveErrorDetail] = useState('');
  const [pendingSavesCount, setPendingSavesCount] = useState<number>(() => hydratePendingSaves().size);
  const [pendingSaves] = useState<Map<string, unknown>>(hydratePendingSaves);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  const snapshotPending = () => {
    try { localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(Array.from(pendingSaves.entries()))); } catch { /* تجاهل */ }
  };

  const flushSaves = async () => {
    if (flushingRef.current) return;
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    if (pendingSaves.size === 0) { setSaveFailed(false); setAuthExpired(false); setSaveErrorDetail(''); return; }
    flushingRef.current = true;
    let gotAuthError = false;
    let hadFailures = false;
    try {
      const token = localStorage.getItem('rcerp_token');
      // منطق الإرسال (ترتيب المفاتيح، المهلة، تصنيف 2xx/409/401/غيرها، إعادة المحاولة)
      // مستخرج في syncEngine و يبقى السلوك مطابقاً للأصل.
      const failures: string[] = [];
      const entries = sortEntriesBySize(Array.from(pendingSaves.entries(), ([key, value]) => ({ key, value })));
      const result = await runFlushQueue(entries, {
        send(key, value, signal) {
          return fetch(`/api/collections/${encodeURIComponent(key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(value),
            signal,
          }).then((res) => res.status);
        },
        onSaved(key) {
          pendingSaves.delete(key);
          setPendingSavesCount(pendingSaves.size);
        },
        async onShrinkRejected(key) {
          // الحماية من استبدال بيانات العرض: الخادم رفض الكتابة لأن بياناته الحقيقية
          // أكبر بكثير من هذه. نقبل رأي الخادم (هو مصدر الحقيقة) ونتجاهل هذا الحفظ
          // ثم نعيد تحميل البيانات الحقيقية من الخادم فوراً.
          pendingSaves.delete(key);
          setPendingSavesCount(pendingSaves.size);
          try {
            const b = await fetch('/api/bootstrap', {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }).then((r) => r.json());
            if (b && b.ok && b.data) {
              const ignored = key;
              applyData(b.data);
              serverFpRef.current = fpOf(b.data);
              localStorage.setItem('rcerp_offline_cache', JSON.stringify({ savedAt: new Date().toISOString(), data: b.data }));
              setOffline(false);
              setOfflineSince('');
              failures.push(`→تم استرجاع البيانات الحقيقية (${ignored})`);
            }
          } catch { /* تجاهل */ }
        },
      }, { failures });
      gotAuthError = result.gotAuthError;
      hadFailures = result.hadFailures;
      if (failures.length) console.warn('[RestoCost] إخفاق حفظ:', failures.join(' · '), '| المتبقي:', pendingSaves.size);
      snapshotPending();
      setSaveFailed(pendingSaves.size > 0);
      setAuthExpired(gotAuthError && pendingSaves.size > 0);
      setSaveErrorDetail(failures.slice(-3).join(' · '));
    } finally {
      flushingRef.current = false;
    }
    if (pendingSaves.size > 0 && !flushTimerRef.current) {
      flushTimerRef.current = setTimeout(flushSaves, gotAuthError ? 60000 : hadFailures ? 6000 : 600);
    }
  };

  // إعادة تطبيق التعديلات المحلية المعلّقة فوق بيانات الخادم بعد التحميل.
  // تُستدعى بعد applyData: الخادم قاعدة ثم المحلي (الذي لم يصل بعد) يعلوه — حتى لا
  // تُطمس بيانات الخادم القديمة حذفاً/تعديلاً محلياً جديداً (لا "يعود" المحذوف بعد التحديث).
  const reapplyPending = () => {
    for (const [key, value] of Array.from(pendingSaves.entries())) {
      const setter = COLLECTION_SETTERS[key];
      if (setter) setter(value);
      pendingSaves.set(key, value);
    setPendingSavesCount(pendingSaves.size);
    }
    snapshotPending();
    if (pendingSaves.size > 0 && !flushTimerRef.current && !authExpired) {
      flushTimerRef.current = setTimeout(flushSaves, 100);
    }
  };

  // مزامنة فورية: تُجبر إرسال كل التعديلات المعلَّقة للخادم الآن وتعود بنتيجة الإرسال
  const syncNow = async (key?: string): Promise<boolean> => {
    if (!ready || !currentUser) return false;
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    // انتظر انعكاس آخر تعديل في طابور الحفظ قبل إرساله (التأثيرات تُنفَّذ بعد الالتزام)
    for (let i = 0; i < 20; i++) {
      if (pendingSaves.size > 0 && (!key || pendingSaves.has(key))) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    await flushSaves();
    return pendingSaves.size === 0;
  };

  // ختم زمني للتعديلات المحلية: كل سجل غُيّر/أُنشئ محلياً (مقارنةً بآخر ما استُورد
  // من الخادم) يُختم بـ _mtime — يعتمد عليه الخادم في دمج الأجهزة بالأحدثية:
  // سجل الاعتماد الجديد أعلى _mtime، فلا يرجع "للمراجعة" عندما يدفع تبويب/جهاز
  // قديم نسخته الكاملة فوق الاعتماد الموثّق.
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
    if (!ready) return;
    // نفس المرجع الذي استُورد من الخادم (وليس تعديلاً محلياً جديداً) — لا نعيد رفعه
    if (appliedRefsRef.current.get(key) === value) return;
    pendingSaves.set(key, stampLocalMtime(key, value));
    setPendingSavesCount(pendingSaves.size);
    snapshotPending();
    if (!flushTimerRef.current && !authExpired) flushTimerRef.current = setTimeout(flushSaves, 600);
  };
  // عودة الاتصال بالإنترنت → حاول الإرسال فوراً
  useEffect(() => {
    const onOnline = () => { flushSaves(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // شبكة أمان: محاولة مزامنة دورية كل 45 ثانية إن وُجدت تعديلات معلّقة —
  // تغطي حالات لا يُطلق فيها حدث 'online' (سكون/إيقاظ الجهاز، تبديل شبكات، انقطاعات صامتة)
  useEffect(() => {
    const iv = setInterval(() => {
      if (!flushingRef.current && pendingSaves.size > 0 && navigator.onLine) flushSaves();
    }, 45000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // بعد تسجيل الدخول من جديد → أرسل كل ما تعلّق أثناء انتهاء الجلسة
  useEffect(() => {
    if (ready && currentUser) { flushSaves(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentUser?.id]);

  // عند إغلاق/تحديث الصفحة: محاولة أخيرة بإرسال مباشر (keepalive) لما يتسع له الطلب
  useEffect(() => {
    const onPageHide = () => {
      if (pendingSaves.size === 0) return;
      const token = localStorage.getItem('rcerp_token');
      pendingSaves.forEach((value, key) => {
        try {
          const body = JSON.stringify(value);
          if (body.length > 55000) return; // أكبر من حد keepalive — يغطيه الطابور الدائم بعد العودة
          fetch(`/api/collections/${encodeURIComponent(key)}`, {
            method: 'POST', keepalive: true,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body,
          }).catch(() => {});
        } catch { /* تجاهل */ }
      });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحميل أحدث البيانات من الخادم (تعديلات الأجهزة الأخرى) بدون إجبار المستخدم على
  // تحديث الصفحة يدوياً: عند عودة التبويب للواجهة + تكرار دوري خفيف (30 ثانية).
  // تُطبَّق البيانات فقط إذا تغيّرت فعلاً (بصمة) — وأبداً لا تُطمس تعديلات محلية معلّقة.
  // بصمة مراجعة الخادم (rev+boot) — للكشف عن تغيّر البيانات دون تنزيلها.
  const revRef = useRef<{ rev: number; boot: number } | null>(null);

  // تحديث الصفحة يدوياً: عند عودة التبويب للواجهة + دوري خفيف جداً (5 ثوانٍ).
  // نفحص /api/sync-state (بضعة بايتات) ثم نسحب كامل البيانات فقط إذا تغيّرت فعلاً —
  // المزامنة شبه اللحظية بين الأجهزة بلا حمولة ثقيلة وبلا تطميس للتعديلات المعلّقة.
  const pollServerState = async () => {
    if (booting || !ready || !currentUser) return;
    if (pendingSaves.size > 0 || flushingRef.current) return;
    if (!navigator.onLine) return;
    try {
      const token = localStorage.getItem('rcerp_token');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch('/api/sync-state', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const st = await res.json();
      if (!st || !st.ok) return;
      const cur = revRef.current;
      if (cur && cur.boot === st.boot && cur.rev === st.rev) return;
      revRef.current = { rev: st.rev, boot: st.boot };
      await tryPullFresh();
    } catch { /* صامت — سيُعاد في الدورة القادمة */ }
  };
  const tryPullFresh = async () => {
    if (booting || !ready || !currentUser) return;
    if (pendingSaves.size > 0 || flushingRef.current) return;
    if (!navigator.onLine) return;
    try {
      const token = localStorage.getItem('rcerp_token');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch('/api/bootstrap', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const json = await res.json();
      if (!json || !json.ok || !json.data) return;
      const d: Record<string, unknown> = json.data;
      const fp = fpOf(d);
      if (serverFpRef.current === fp) return;
      serverFpRef.current = fp;
      applyData(d);
      localStorage.setItem('rcerp_offline_cache', JSON.stringify({ savedAt: new Date().toISOString(), data: d }));
      setOffline(false);
      setOfflineSince('');
      if (json.user) setCurrentUser(json.user);
    } catch { /* صامت — سيُعاد في الدورة القادمة */ }
  };
  useEffect(() => {
    const onFocus = () => { pollServerState(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const iv = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) pollServerState(); }, 5000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentUser?.id]);

  return {
    saveFailed, authExpired, saveErrorDetail, pendingSavesCount, pendingSaves,
    setAuthExpired, persist, flushSaves, reapplyPending, syncNow,
  };
};