const CACHE_STATIC = 'drbike-static-v23';
const CACHE_PAGES  = 'drbike-pages-v23';

const STATIC_ASSETS = [
  '/index.html',
  '/mechanic.html',
  '/css/variables.css',
  '/css/main.css',
  '/css/mechanic.css',
  '/js/router.js',
  '/js/supabase.js',
  '/js/components.js',
  '/js/app.js',
  '/js/stripe.js',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512.svg',
  '/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_STATIC).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', e => {
  const keep = new Set([CACHE_STATIC, CACHE_PAGES]);
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('stripe.com')) return;
  if (url.hostname.includes('googleapis.com')) return;
  if (url.hostname.includes('twilio.com')) return;
  if (url.hostname.includes('unpkg.com')) return;
  if (url.hostname.includes('cdn.jsdelivr.net')) return;
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: cache first
  if (url.pathname.match(/\.(js|css|png|svg|ico|woff2?|jpg|webp|gif)$/) && url.hostname === self.location.hostname) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        }).catch(() => cached || new Response('', { status: 408 }));
      })
    );
    return;
  }

  // HTML: network first, cache fallback
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_PAGES).then(c => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
    );
    return;
  }
});

self.addEventListener('push', e => {
  let p = { title: 'Dr. Bike', body: 'New update', icon: '/icon-512.png', url: '/' };
  try { p = Object.assign(p, e.data?.json()); } catch {}
  e.waitUntil(self.registration.showNotification(p.title, {
    body: p.body,
    icon: p.icon,
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: p.tag || 'drbike',
    renotify: true,
    data: { url: p.url },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(wins => {
      const m = wins.find(w => w.url.includes(url));
      return m ? m.focus() : clients.openWindow(url);
    })
  );
});
