import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { applyTheme } from './utils/theme';

// Apply the persisted theme before the first paint. React state is not ready
// this early, so read the same localStorage key the store persists to and set
// the class on <html> directly — otherwise a dark-mode user sees a white flash
// on every reload.
try {
  const stored = localStorage.getItem('rcerp-ui');
  if (stored) {
    const parsed = JSON.parse(stored) as { state?: { theme?: 'light' | 'dark' } };
    if (parsed?.state?.theme) applyTheme(parsed.state.theme);
  }
} catch {
  /* private mode / corrupt entry — fall back to light */
}

// حارس النسخ القديمة: عند فشل تحميل chunk ديناميكي (نشرنا نسخة جديدة وأسماؤها تغيّرت)
// أعد تحميل الصفحة مرة واحدة ليتناول المتصفح أحدث index.html وأحدث الشل.
let chunkReloaded = false;
const reloadOnStaleChunk = () => {
  if (chunkReloaded) return;
  chunkReloaded = true;
  try {
    const regs = navigator.serviceWorker?.getRegistrations();
    if (regs) regs.then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  } catch { /* noop */ }
  window.location.reload();
};
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e.reason && (e.reason.message || e.reason)) || '';
  if (/Failed to fetch dynamically imported module|Failed to resolve module specifier|importing a module script failed/i.test(msg)) {
    reloadOnStaleChunk();
  }
});
window.addEventListener('error', (e) => {
  const msg = String((e.error && (e.error.message || e.error)) || e.message || '');
  if (/Failed to fetch dynamically imported module|Failed to resolve module specifier|importing a module script failed/i.test(msg)) {
    reloadOnStaleChunk();
  }
});

// منع عجلة الماوس من تغيير قيمة أي حقل رقمي أثناء الوقوف عليه
document.addEventListener(
  'wheel',
  (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'number') {
      t.blur();
    }
  },
  { passive: true },
);

// PWA: register the service worker (production only) for offline shell + installability.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
