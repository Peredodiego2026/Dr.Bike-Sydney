const CACHE_STATIC = 'drbike-static-v10';
const CACHE_PAGES  = 'drbike-pages-v10';

const STATIC_ASSETS = [
  '/mechanic.html',
  '/index.html',
  '/icon-mech-192.png',
  '/icon-512.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
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
  if(e.request.method !== 'GET') return;

  // APIs — no cache nunca
  if(url.hostname.includes('supabase.co') || url.hostname.includes('stripe.com') || url.pathname.startsWith('/api/')) return;

  // Páginas HTML — network first, fallback cache
  if(e.request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request).then(res => {
        caches.open(CACHE_PAGES).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request) || caches.match('/mechanic.html') || caches.match('/index.html'))
    );
    return;
  }

  // Assets estáticos — cache first
  if(url.pathname.match(/\.(js|css|png|svg|ico|woff2?|jpg|webp)$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if(cached) return cached;
        return fetch(e.request).then(res => {
          caches.open(CACHE_STATIC).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => new Response('', {status:408}));
      })
    );
    return;
  }

  // CDN — stale while revalidate
  if(url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) {
    e.respondWith(
      caches.open(CACHE_STATIC).then(cache =>
        cache.match(e.request).then(cached => {
          const fresh = fetch(e.request).then(res => { cache.put(e.request, res.clone()); return res; }).catch(()=>cached);
          return cached || fresh;
        })
      )
    );
  }
});

self.addEventListener('push', e => {
  let p = { title:'Dr. Bike', body:'New update', icon:'/icon-mech-192.png', url:'/mechanic.html' };
  try { p = Object.assign(p, e.data.json()); } catch(err) {}
  e.waitUntil(self.registration.showNotification(p.title, {
    body:p.body, icon:p.icon, badge:'/icon-mech-192.png',
    vibrate:[200,100,200], tag:p.tag||'drbike', renotify:true, data:{url:p.url}
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({type:'window'}).then(wins => {
    const m = wins.find(w => w.url.includes(url));
    return m ? m.focus() : clients.openWindow(url);
  }));
});

// Background sync — reintenta updates cuando vuelve internet
self.addEventListener('sync', e => {
  if(e.tag === 'sync-job-updates') e.waitUntil(syncPending());
});

async function syncPending() {
  try {
    const db = await new Promise((res,rej) => {
      const r = indexedDB.open('drbike-sync',1);
      r.onerror = ()=>rej(r.error); r.onsuccess = ()=>res(r.result);
      r.onupgradeneeded = e => e.target.result.createObjectStore('q',{keyPath:'id',autoIncrement:true});
    });
    const items = await new Promise(res => { const r=db.transaction('q','readonly').objectStore('q').getAll(); r.onsuccess=()=>res(r.result); });
    for(const item of items) {
      try {
        await fetch(item.url, {method:item.method||'POST', headers:{'Content-Type':'application/json'}, body:item.body});
        db.transaction('q','readwrite').objectStore('q').delete(item.id);
      } catch(e) {}
    }
  } catch(e) {}
}
