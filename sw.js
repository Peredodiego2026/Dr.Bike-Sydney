const CACHE_STATIC = 'drbike-static-v12';
const CACHE_PAGES  = 'drbike-pages-v12';

const STATIC_ASSETS = [
  '/index.html',
  '/mechanic.html',
  '/icon-512.svg'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_STATIC).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(()=>{})))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => {
        if(k !== CACHE_STATIC && k !== CACHE_PAGES) return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Nunca interceptar: POST, APIs, Supabase, Stripe, extensiones
  if(e.request.method !== 'GET') return;
  if(url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;
  if(url.hostname.includes('supabase.co')) return;
  if(url.hostname.includes('stripe.com')) return;
  if(url.hostname.includes('googleapis.com')) return;
  if(url.hostname.includes('twilio.com')) return;
  if(url.pathname.startsWith('/api/')) return;

  // Solo cachear assets estáticos propios
  if(url.pathname.match(/\.(js|css|png|svg|ico|woff2?|jpg|webp|gif)$/) && url.hostname === self.location.hostname) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if(cached) return cached;
        return fetch(e.request).then(res => {
          if(res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(e.request, clone)).catch(()=>{});
          }
          return res;
        }).catch(() => cached || new Response('', {status: 408}));
      })
    );
    return;
  }

  // HTML pages — network first, cache fallback
  if(e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if(res.ok) {
            const clone = res.clone();
            caches.open(CACHE_PAGES).then(c => c.put(e.request, clone)).catch(()=>{});
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  // Todo lo demás: network directo sin cache
});

// Push notifications
self.addEventListener('push', e => {
  let p = { title:'Dr. Bike', body:'New update', icon:'/icon-512.svg', url:'/' };
  try { p = Object.assign(p, e.data?.json()); } catch(err) {}
  e.waitUntil(self.registration.showNotification(p.title, {
    body: p.body,
    icon: p.icon,
    badge: '/icon-512.svg',
    vibrate: [200, 100, 200],
    tag: p.tag || 'drbike',
    renotify: true,
    data: { url: p.url }
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
