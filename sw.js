const CACHE_STATIC = 'drbike-static-v51';
const CACHE_PAGES  = 'drbike-pages-v51';

// Only URLs the pages actually request. The CSS and JS used to be listed here
// too, without their query, and every one of those entries was dead weight:
// caches.match() keys on the full URL, the pages always ask for
// `app.js?v=...`, so a cached `/js/app.js` could never match. They were
// downloaded on every install and never served once.
//
// Which is also the rule for anything added below the fetch handler: every
// local .js and .css is served CACHE FIRST, so a file requested without a
// `?v=` is frozen on returning devices until CACHE_STATIC changes name. Give
// new scripts a `?v=` in the page - do not rely on this list.
const STATIC_ASSETS = [
  '/index.html',
  '/mechanic.html',
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

  // Images and fonts: cache first. They are immutable in practice (a new logo
  // gets a new filename) and they are the heavy ones, so serving them straight
  // from the cache is the whole point.
  if (url.pathname.match(/\.(png|svg|ico|woff2?|jpg|jpeg|webp|gif)$/) && url.hostname === self.location.hostname) {
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

  // Our own JS and CSS: stale-while-revalidate. Cache first was wrong for
  // these. A page asks for `app.js?v=...`, so a `?v=` bump did dodge the cache
  // - but everything a module imports (`./router.js`, `./i18n.js`) is asked
  // for WITHOUT a query, and those URLs were frozen until CACHE_STATIC changed
  // name. The whole class of "I deployed it and the phone still runs the old
  // one" lived here, and it depended on a human remembering to bump this file.
  //
  // Now the cached copy is served immediately (so the app still starts fast,
  // and works offline once a file has been fetched at least once - which cache
  // first never actually managed for the JS, because the precache stored
  // query-less URLs the pages never request), and the network copy replaces it
  // in the background for the next load.
  if (url.pathname.match(/\.(js|css)$/) && url.hostname === self.location.hostname) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fresh = fetch(e.request)
          .then(res => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_STATIC).then(c => c.put(e.request, clone)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached || new Response('', { status: 408 }));
        return cached || fresh;
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
