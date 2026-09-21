/* RestoCost ERP Pro — Service Worker (PWA + offline shell) */
const CACHE = 'restocost-shell-v3';
const DATA_CACHE = 'restocost-data-v1';

const ASSETS = ['/index.html', '/manifest.webmanifest', '/app-icon-192.png', '/app-icon-256.png', '/app-icon-512.png', '/apple-touch-icon.png'];

// تثبيت SW وتخزين القشرة الأساسية
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// تفعيل: مسح الكاشات القديمة والسيطرة على العملاء فوراً
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// استراتيجية: Network-first للملاحة، Cache-first للموارد الثابتة، لا نلمس /api
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.origin !== self.location.origin) return;

  // طلبات الملاحة (الصفحات) — Network-first مع fallback للكاش
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // موارد静态 (JS/CSS/صور/خطوط) — Cache-first مع تحديث في الخلفية (Stale-While-Revalidate)
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff|woff2|ttf|eot|webp|json)$/)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        const network = fetch(e.request).then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // باقي الطلبات — Network-first مع fallback للكاش
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// استماع لرسائل من العميل (مثل تخطي الانتظار عند تحديث)
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});