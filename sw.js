const CACHE = 'drbike-v3';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  // Network first - always get fresh content
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
