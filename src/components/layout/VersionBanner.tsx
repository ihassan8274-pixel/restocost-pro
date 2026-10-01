import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// Version handshake: after the first successful load we remember the deployed
// build fingerprint. If the server now serves a different build (a new deploy),
// we show a one-tap "reload" banner so users never keep working on a stale UI
// whose data contract no longer matches the server — the root cause of the
// production 500s that were previously diagnosed.
const LS_KEY = 'rcerp_build_seen';

export const VersionBanner: React.FC = () => {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/health', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        const build = typeof d.build === 'string' ? d.build : '';
        if (!build || build === 'no-dist') return;
        let seen: string | null = null;
        try { seen = localStorage.getItem(LS_KEY); } catch { /* private mode */ }
        if (seen && seen !== build && !cancelled) setStale(true);
        try { localStorage.setItem(LS_KEY, build); } catch { /* ignore */ }
      } catch { /* offline / not reachable — keep silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!stale) return null;

  return (
    <div className="fixed bottom-5 right-1/2 translate-x-1/2 z-[95] w-auto max-w-[92vw]" dir="rtl">
      <div className="flex items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl border border-amber-300 bg-amber-500 text-white">
        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
        <p className="text-xs font-extrabold leading-relaxed flex-1">تم نشر تحديث جديد للنظام — أعد تحميل الصفحة لتطبيقه</p>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 px-4 py-1.5 rounded-xl text-[11px] font-extrabold bg-white text-amber-700 hover:bg-amber-50 transition-colors"
        >
          إعادة التحميل الآن
        </button>
      </div>
    </div>
  );
};