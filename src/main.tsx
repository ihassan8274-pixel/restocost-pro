import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

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
