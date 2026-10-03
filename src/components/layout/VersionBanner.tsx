import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// Version handshake: after a successful load we remember the build fingerprint
// the server reported. If the server later serves a DIFFERENT build, we show a
// one-tap reload banner — users must never keep working on a stale UI whose
// data contract no longer matches the server.
//
// Three bugs this file used to have, all producing the same symptom: the user
// kept seeing the old screens with no warning, and the banner never reappeared.
//
//  1) The check ran only in a mount effect. A tab left open across a deploy kept
//     running the old chunks for the rest of the session — navigating inside the
//     SPA never re-checks, so the banner never appears. → now polled.
//  2) It wrote the NEW fingerprint to localStorage as soon as it read it, before
//     any reload. Ignore the banner once and the comparison matched forever, so
//     the banner could never show a second time. → now it only advances when the
//     running UI is known to match.
//  3) The banner was dismissible-by-time only; a reload while offline would
//     re-arm the stale state correctly, so nothing to do — kept for clarity.
const LS_KEY = 'rcerp_build_seen';
const POLL_MS = 45_000;

export const VersionBanner: React.FC = () => {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/health', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        const build = typeof d.build === 'string' ? d.build : '';
        if (!build || build === 'no-dist' || cancelled) return;

        let seen: string | null = null;
        try { seen = localStorage.getItem(LS_KEY); } catch { /* private mode */ }

        if (!seen) {
          // First ever load on this browser: the UI we are running IS this build.
          try { localStorage.setItem(LS_KEY, build); } catch { /* ignore */ }
          return;
        }

        if (seen === build) {
          // Running UI matches the server → nothing to warn about.
          if (stale) setStale(false);
          return;
        }

        // Mismatch → warn, but do NOT overwrite `seen`: the stored value must keep
        // describing the build currently loaded in memory, or the banner would
        // silently disarm itself the first time it is shown.
        setStale(true);
      } catch { /* offline / unreachable — keep silent */ }
    };

    check();
    const t = window.setInterval(check, POLL_MS);
    const onFocus = () => { check(); };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [stale]);

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