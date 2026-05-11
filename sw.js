const CACHE = 'drbike-v5';

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let payload = { title: 'Dr. Bike', body: 'New update', icon: '/icon-mech-192.png', url: '/mechanic.html' };
  try { payload = Object.assign(payload, e.data.json()); } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: '/icon-mech-192.png',
      vibrate: [200, 100, 200],
      tag: payload.tag || 'drbike',
      renotify: true,
      data: { url: payload.url }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/mechanic.html';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(wins => {
      const match = wins.find(w => w.url.includes('mechanic.html'));
      if(match) return match.focus();
      return clients.openWindow(url);
    })
  );
});
