// tests/e2e/all-pages-smoke.test.js — crawls every static page in production and
// fails on console errors or failed (4xx/5xx) requests. Not a behaviour test -
// interaction is covered elsewhere (homepage.test.js, mobile-spa.test.js). This
// only answers "does the page load clean".
// Run: npx playwright test tests/e2e/all-pages-smoke.test.js --project="Desktop Chrome"

import { test, expect } from './fixtures.js';

const SUBURBS = [
  'bondi', 'cbd', 'chatswood', 'eastern-suburbs', 'hills-district', 'hornsby',
  'inner-west', 'manly', 'marrickville', 'mosman', 'newtown', 'north-shore',
  'northern-beaches', 'parramatta', 'penrith', 'ryde', 'st-george',
  'strathfield', 'surry-hills', 'sutherland-shire',
];

const BLOG_POSTS = [
  'best-bikes-for-sydney-commuting-2026',
  'cycling-safety-tips-sydney-roads',
  'electric-bike-laws-nsw-2026',
  'how-to-choose-a-bike-mechanic-sydney',
  'how-to-clean-your-bike-chain-sydney',
];

const LANGS = ['', 'es/', 'zh/'];

const CORE_PAGES = [
  '/', '/landing.html', '/admin.html', '/mechanic.html', '/track.html',
  '/terms.html', '/privacy.html', '/business', '/bike-check', '/cycling-map',
  '/applepay.html', '/claims.html',
];

// The 75 suburb and blog pages are static marketing: one pass a day is enough
// to know they load. The 6-hourly run (SMOKE_SCOPE=core, set by
// .github/workflows/e2e-smoke.yml) checks the 12 pages the business runs on.
// Every run is real traffic against the live Supabase - see ./fixtures.js.
const MARKETING_PAGES = [
  ...LANGS.flatMap((l) => SUBURBS.map((s) => `/${l}${s}`)),
  ...LANGS.flatMap((l) => BLOG_POSTS.map((b) => `/${l}blog/${b}`)),
];
const PAGES = process.env.SMOKE_SCOPE === 'core' ? CORE_PAGES : [...CORE_PAGES, ...MARKETING_PAGES];

// Known-benign console noise, not app bugs - excluded so a real regression
// doesn't get lost in expected third-party chatter.
const IGNORE_CONSOLE = [
  /Cloudflare Turnstile/i, // fails outside the allowed domain, expected in this environment
  // Turnstile pide su propio /cdn-cgi/challenge-platform/ y ese pedido
  // devuelve 401 en un navegador automatizado: Cloudflare le niega el
  // desafio a propósito. Hacia caer 13 tests, todos la misma pagina - la
  // portada, mas /parramatta, /penrith, /st-george y /sutherland-shire, que
  // REDIRIGEN a la portada, por tres idiomas.
  //
  // Comprobado en el navegador de Diego el 30-sep-2026: el widget se dibuja
  // y dice "Verify you are human" en el formulario de flotas y en el
  // newsletter. El 401 es del entorno de prueba, no del sitio.
  //
  // Solo esa ruta. Un 404 en turnstile/v0/api.js - el script de verdad -
  // tiene que seguir rompiendo el test.
  /challenges\.cloudflare\.com\/cdn-cgi\/challenge-platform/,
  // Desde el 15-oct-2026, entre dos corridas programadas y sin ningun deploy
  // en el medio (mismo commit de main, 10:42 verde y 16:07 rojo, UTC), el
  // iframe de Turnstile prueba fetch('data:,') y lo bloquea SU PROPIA politica
  // de seguridad: la que sirve challenges.cloudflare.com para su iframe, con
  // sus hosts hagen./brunhild. y dnstest.dev. No es la nuestra - la nuestra no
  // nombra ninguno de esos - y por eso agregar data: a nuestro connect-src no
  // cambia nada: es otro documento, de otro origen. El mensaje sale del frame
  // challenges.cloudflare.com/cdn-cgi/challenge-platform/... (medido el 24-oct)
  // y el widget se dibuja igual en los dos formularios.
  //
  // Sigue siendo angosto: si NUESTRA pagina pidiera data:, Chrome nombraria
  // nuestro connect-src ('self' https://*.supabase.co ...), que no matchea la
  // primera expresion, y el test cae igual. La segunda sola no alcanza para
  // tapar eso, porque los dos mensajes salen juntos.
  /Connecting to 'data:,' violates the following Content Security Policy directive: "connect-src 'self' https:\/\/[a-z0-9-]+\.challenges\.cloudflare\.com /,
  /^Fetch API cannot load data:,\. Refused to connect because it violates the document's Content Security Policy\.$/,
  /Failed to load resource.*404.*favicon/i,
  // GrowthBook's own CDN bundle (js/landing-modules.js) prints this on
  // landing.html - a styled debug line with a NaN in it. Traced to their
  // minified code, not ours; whether it affects the hero-cta-copy experiment
  // itself was NOT verified (would need a live page, see docs/PENDIENTES.md).
  /%c%d font-size:0;color:transparent/,
];

test.describe('All pages load clean', () => {
  test.skip(({ isMobile }) => isMobile, 'One pass is enough - this checks page load, not layout');

  for (const path of PAGES) {
    test(`${path || '/'} has no console errors or failed requests`, async ({ page }) => {
      const consoleErrors = [];
      const failedRequests = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));
      page.on('response', (res) => {
        if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
      });

      // 'networkidle' never fires on landing.html: PostHog/Sentry/GA keep making
      // background requests by design, so the wait times out on a page that is
      // actually fine. 'load' + a short settle window catches the same errors
      // without depending on third-party polling ever going quiet.
      const resp = await page.goto(path, { waitUntil: 'load', timeout: 20000 });
      expect(resp?.status(), `top-level response for ${path}`).toBeLessThan(400);
      await page.waitForTimeout(1500);

      const realErrors = consoleErrors.filter((e) => !IGNORE_CONSOLE.some((re) => re.test(e)));
      const realFailures = failedRequests.filter((f) => !IGNORE_CONSOLE.some((re) => re.test(f)));

      expect(realErrors, `console errors on ${path}`).toEqual([]);
      expect(realFailures, `failed requests on ${path}`).toEqual([]);
    });
  }
});
