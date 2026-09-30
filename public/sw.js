/* RestoCost ERP Pro — Service Worker (PWA + offline shell) */
const CACHE = 'restocost-shell-v7';
const DATA_CACHE = 'restocost-data-v2';

const BASE_ASSETS = ['/index.html', '/manifest.webmanifest', '/app-icon-192.png', '/app-icon-256.png', '/app-icon-512.png', '/apple-touch-icon.png', '/favicon.ico'];

let precacheQueue = [];

// تثبيت SW وتخزين القشرة الأساسية + كل ملفات البناء (JS/CSS/خطوط) حتى يعمل
// التطبيق بالكامل بدون إنترنت. تُقرأ ملفات البناء من index.html تلقائياً.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(BASE_ASSETS);
      const paths = await collectBuildAssets();
      await cache.addAll(paths);
      return cache;
    }).then(() => self.skipWaiting())
  );
});

// استخراج أسماء أصول البناء من نص index.html مباشرة
const collectBuildAssetsFromText = (html) => {
  try {
    const urls = new Set();
    const re = /(?:src|href)="(\/[^"]+\.(?:js|css|woff2?|ttf|eot|json|png|svg|ico|webp))"/g;
    let m;
    while ((m = re.exec(html)) !== null) urls.add(m[1]);
    urls.add('/index.html');
    return Array.from(urls);
  } catch {
    return ['/index.html'];
  }
};

// جمع ملفات البناء: كل <script src> و<link href> داخل index.html (مخزّن أو من الشبكة)
const collectBuildAssets = async () => {
  try {
    const cache = await caches.open(CACHE);
    let html = '';
    const cachedHtml = await cache.match('/index.html');
    if (cachedHtml) html = await cachedHtml.text();
    if (!html) {
      const res = await fetch('/index.html');
      if (res.ok) {
        const copy = res.clone();
        cache.put('/index.html', copy);
        html = await res.text();
      }
    }
    return collectBuildAssetsFromText(html);
  } catch {
    return [];
  }
};

// تفعيل: مسح الكاشات القديمة والسيطرة على العملاء فوراً
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(async (keys) => {
        await Promise.all(keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)));
        // بعد تثبيت نسخة جديدة، التقط index.html الحالي من الشبكة لبناء القشرة
        // على أسماء الملفات الجديدة بدل نسخة قديمة مخزّنة سابقاً.
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch('/index.html', { cache: 'reload' });
          if (res.ok) {
            const copy = res.clone();
            await cache.put('/index.html', copy);
            const paths = await collectBuildAssetsFromText(await res.text());
            await cache.addAll(paths.filter((p) => p !== '/index.html'));
          }
        } catch { /* offline — keep cached shell */ }
      })
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

  // موارد static (JS/CSS/صور/خطوط) — Network-first للأصول المhashed (أسماؤها تتغير
  // مع كل بناء فلا يُعاد إلا الأحدث)، مع fallback للكاش لضمان العمل دون إنترنت.
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff|woff2|ttf|eot|webp|json)$/)) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(e.request, { cache: 'no-store' });
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        } catch {
          const cached = await cache.match(e.request);
          if (cached) return cached;
          return new Response('', { status: 503 });
        }
      })()
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