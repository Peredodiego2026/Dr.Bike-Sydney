// v107 (2026-08-31): la landing muestra las resenas de Google. Son las 2 reales
// del perfil, citadas a mano y textuales, con link al perfil para que cualquiera
// las verifique. Se quito el empty state "Be the first to leave a review", que
// contradecia lo que el visitante ve. Toca landing.html, js/landing-inline.js
// y js/i18n.js (que se importa sin ?v=, solo este bump lo renueva).
// v106 (2026-08-31): el arreglo de v104 no servia. `async = false` ordena los
// scripts con src ENTRE SI; un script inline corre apenas se inserta y no
// espera a ninguno, asi que el init de Sentry seguia ganandole a su loader.
// Ahora es un solo bloque que carga el SDK el mismo y arranca en su onload.
// Toca landing.html, index.html y js/consent.js.
// v105 (2026-08-31): la pantalla de login y 2FA del admin era ilegible en modo
// oscuro. La tarjeta era background:#fff escrito a mano y su texto es
// var(--navy), que en oscuro es #eef2f7: 1.12:1, casi blanco sobre blanco.
// El fondo tenia el bug espejo (var(--navy) usado como fondo). Toca
// js/admin.js, css/admin.css (mas .inp) y js/mechanic.js.
// v104 (2026-08-31): aceptar las cookies tiraba `Sentry is not defined` desde
// consent.js. Un <script> creado con createElement es async POR DEFECTO, asi
// que el loader clonado corria DESPUES del bloque de init que lo necesita, y
// Sentry quedaba sin inicializar para todo el que aceptaba. Toca js/consent.js
// (que no lleva ?v=, solo este bump lo renueva), manifest.json y el meta
// mobile-web-app-capable de admin/index/landing.
// v103 (2026-08-31): la landing no tenia NINGUN boton funcionando para quien
// no aceptaba cookies. js/landing-inline.js llamaba Sentry.onLoad() en la linea
// 9 y el loader de Sentry esta detras del consentimiento: ReferenceError, y el
// archivo entero (un solo scope) moria antes de enganchar un solo listener.
// El init de Sentry y el bootstrap de gtag vuelven al HTML, gateados. Toca
// landing.html, admin.html, mechanic.html, js/landing-inline.js, js/admin.js
// y js/mechanic.js.
// v102 (2026-08-31): el catalogo de servicios de Supabase se traduce. Las 33
// descripciones y 11 de los 33 nombres salian en ingles porque son DATOS de la
// tabla `services`, no markup, y scripts/i18n-check.mjs no los ve. Tambien el
// boton del hero pasa de "What does a visit cost?" a "Check my diagnosis fee".
// Toca js/i18n.js, que se importa sin ?v= y solo este bump lo renueva.
// v90 (2026-08-26): el fee pasa a llamarse "Visita y diagnostico" en las 21
// superficies, con la explicacion de que cubre arriba del boton de pagar.
// Toca js/i18n.js, que se importa sin ?v= y solo este bump lo renueva.
// v88 (2026-08-25): el saludo de cumpleanos gana profundidad real (capas en
// translateZ, entrada escalonada, salida propia) y el email deja de perderse
// si el envio falla. Toca css/main.css y js/app.js.
// v87 (2026-08-25): la gift card pasa a js/gift-card.js, un modulo nuevo que
// comparten la landing y la SPA. Se importa sin ?v=, asi que solo este bump lo
// renueva. Tambien cambia css/main.css (el modal) y js/landing-inline.js.
// v79 (2026-08-25): el "What does a visit cost" fuera de zona seguia mostrando el
// callejon viejo: la copia que se usa esta en js/app.js, y landing.html
// tambien carga ese archivo, asi que fallaba en las dos superficies.
// v78 (2026-08-25): las tarjetas de membresia entran en una pantalla (1356px
// -> 851px) y ganan profundidad 3D discreta. Toca css/home.css, que comparten
// la landing y la SPA.
// v77 (2026-08-25): FAQ, chatbot y terminos explican que el precio va por
// tiempo de manejo; el "What does a visit cost" fuera de zona ahora invita a seguir
// con la consulta gratis en vez de mandar a llamar. Toca js/i18n.js.
// v76 (2026-08-25): la barra "Trusted by" con marcas de fabricantes tambien
// estaba en la SPA, no solo en la landing. Toca index.html y css/home.css.
// v75 (2026-08-25): el boton "Leave us a review" apuntaba a un link de
// Google muerto desde 2022 (nombre corto retirado) - caia en google.com a
// secas. Toca js/app.js y js/landing-inline.js.
// v74 (2026-08-25): flujo de consulta de precio para fuera de zona - toca
// js/app.js, js/router.js y js/i18n.js.
// v73 (2026-08-24): el autocompletado de direcciones dejo de llamar a
// Nominatim desde el navegador de cada cliente (5-10 consultas por direccion
// tipeada, sin User-Agent porque el navegador lo descarta) y pasa por el
// servidor con cache. Toca js/app.js.
// v72 (2026-08-24): the "we don't service that address" message was a toast
// with `white-space: nowrap` - an 85-character string (longer in es/zh) blew
// past both screen edges and was unreadable, then vanished after 3s leaving a
// dead button with no explanation. Now a panel that stays put and offers
// WhatsApp. Touches css/main.css and js/i18n.js, so the cache has to move.
// v71 (2026-08-23): audit fixes touched js/supabase.js (getCalloutFee /
// getMechanicInfo now log instead of swallowing), js/app.js (reschedule
// date-picker timezone) and js/i18n.js (3 dead "$20 visit & diagnosis fee" keys
// removed). supabase.js and i18n.js are imported as ES modules with no ?v=,
// so only a cache bump reaches them - the ?v= tags on app.js/landing-inline.js/
// landing.css are bumped in their pages too, this covers the modules.
// v70 (2026-08-24): the My Bikes bottom-nav icon went 28px -> 22px in v69 to
// match its siblings exactly, but Diego then said it read as too small - the
// bike PNG traces its silhouette with more internal padding than the stroke
// SVGs use, so identical bounding boxes don't read as identical visual
// weight. Settled on 25px. Same reasoning as v69: js/components.js's
// createBottomNav() has no `?v=`, so this bump is what actually delivers it.
//
// v69 (2026-08-24): the My Bikes bottom-nav icon was 28px next to its four
// 22px siblings (Home/Bookings/Track/Profile), reported by Diego as
// mismatched size AND height - a taller flex item shifts where its label
// sits relative to the others even though the label's own font-size never
// changed. Fixed in both places it's defined, index.html's static markup
// and js/components.js's createBottomNav() - the second is imported with no
// `?v=` (same reasoning as js/i18n.js, see CLAUDE.md), so only this cache
// bump actually delivers it to a returning browser.
//
// v68 (2026-08-18, docs/PENDIENTES.md 3.2-cache): the 3.2 landing.html diet
// (PR #291) moved ~2155 lines of inline <script> content out into two real
// files, js/landing-inline.js and js/landing-modules.js, loaded with NO ?v=
// at all. Before that PR the code was inline in landing.html itself, which
// this file serves NETWORK FIRST (see below), so it was never stale; once it
// became separate .js files this file's own STATIC_ASSETS comment applies to
// them too ("give new scripts a ?v= in the page - do not rely on this
// list") - cache-first with no version query meant they froze on any browser
// that had already visited, from the PR's first deploy. landing.html now
// loads both with a content-hash ?v= (scripts/versioned-assets-check.mjs
// enforces it stays correct), but browsers that cached the un-versioned
// files under the OLD cache name would never have picked that up on their
// own - this bump is what actually clears them.
//
// v67 (#235): #223 replaced the "Ride Happy" step-4 icon with the real bike and
// Diego kept seeing the old mangled SVG after a Ctrl+Shift+R. Bumping the cache
// names is the right cure - activate() drops the old CACHE_PAGES, which is the
// only place a pre-#223 landing.html can still live on a returning device.
//
// The original note here went further and said that stale copy was what
// returning browsers were being drawn. It is not, and the correction matters
// because the next person to debug "I deployed it and still see the old page"
// will start from this comment: HTML is served NETWORK FIRST (see the fetch
// handler below), and it has been since the service worker's first commit
// (b93bac6) - no client ever ran a cache-first-HTML version. On a load that
// reaches the network the cached page is never consulted. It is a fallback for
// a failed fetch, so it can only surface offline, on a dropped connection, or
// on a PWA cold start with no network.
//
// Re-verified on 16-Aug against production, and every server-side suspect came
// back clean: the root URL, www, /landing.html and /index.html all return the
// mask markup and zero copies of the old SVG path, for Firefox, Chrome, Edge,
// Safari and iPhone user agents (the page is edge-cached with
// `Vary: User-Agent`, so each one is a separate CDN entry and had to be checked
// separately); images/bike-icon.png is RGBA with a real alpha channel (78.5%
// transparent, a bike silhouette, not an opaque square, so the mask has
// something to cut out); and i18n only rewrites text nodes, so it cannot swap
// an icon back. What Diego's browser was holding was never captured, so the
// cache bump is the cure, not the proven diagnosis.
const CACHE_STATIC = 'drbike-static-v111';
const CACHE_PAGES  = 'drbike-pages-v78';

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
  // The `?v=` matters here: every .png and .svg is served
  // `max-age=31536000, immutable` (vercel.json), so a browser that already
  // holds the old icon will never revalidate it. The query is the only thing
  // that dislodges it. Keep these identical to the hrefs in the pages and the
  // srcs in manifest.json - caches.match() keys on the full URL, so a mismatch
  // silently precaches a file that is never served.
  // (Unrelated to the js/i18n.js `?v=` ban in CLAUDE.md: that one was about ES
  // modules getting a second instance. These are images.)
  '/icon-192.png?v=2',
  '/icon-512.png?v=2',
  '/icon-512.svg?v=2',
  '/favicon-32.png?v=2',
  '/apple-touch-icon.png?v=2',
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
  let p = { title: 'Dr. Bike', body: 'New update', icon: '/icon-512.png?v=2', url: '/' };
  try { p = Object.assign(p, e.data?.json()); } catch {}
  e.waitUntil(self.registration.showNotification(p.title, {
    body: p.body,
    icon: p.icon,
    badge: '/icon-192.png?v=2',
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
