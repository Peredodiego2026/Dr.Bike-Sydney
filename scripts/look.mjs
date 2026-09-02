// scripts/look.mjs - abre una pagina del proyecto en un Chromium sin ventana,
// la mide, y deja una captura en disco.
//
// Run: npm run look -- <pagina> [opciones]
//
// POR QUE EXISTE
//
// Diego encuentra un problema visual, saca un pantallazo con el celular, lo
// manda, y recien ahi empieza el diagnostico - sin poder abrir la pagina, sin
// medir nada, y adivinando que CSS lo causa. Son 77 paginas. No se puede
// trabajar a pantallazos.
//
// Esto NO es el panel del navegador de Claude. Ese abre una ventana con GPU y
// viene congelando Claude Desktop (van 10 cierres, todos despues de abrirlo), y
// esta bloqueado a proposito en .claude/settings.local.json. Esto es Chromium
// headless dentro de un proceso de node: sin ventana, sin GPU, sin panel.
//
// LO QUE MIDE, ADEMAS DE LA FOTO
//
// Mirar una captura encuentra lo obvio y se pierde lo importante. El reporte
// dice, con numeros:
//   - errores de consola, filtrando el ruido de las extensiones de Diego
//   - si la pagina se va de ancho, y QUE elemento la empuja
//   - cajas que se desbordan de su contenedor (el "se ve desordenado" tipico)
//   - texto cortado por un contenedor sin scroll
//
// EJEMPLOS
//   npm run look -- index.html --mobile
//   npm run look -- landing.html --desktop --lang es
//   npm run look -- admin.html --dark --eval "byId('admin-create-booking-modal').style.display='flex'"
//   npm run look -- index.html#book-service --mobile --click "[data-service]"
//   npm run look -- landing.html --strips      (tiras del alto de la pantalla)
//   npm run look -- admin.html --el "#admin-create-booking-modal"
//   npm run look -- landing.html --prod        (produccion, no el repo local)
import { chromium, devices } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.look');
const PROD = 'https://drbikesydney.com.au';

const VIEWPORTS = {
  mobile: { width: 390, height: 844 }, // iPhone 14
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

// ── argumentos ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = {
    target: null,
    viewport: VIEWPORTS.desktop,
    vpName: 'desktop',
    dark: false,
    lang: null,
    clicks: [],
    fills: [],
    evals: [],
    wait: 0,
    name: null,
    prod: false,
    keepAnim: false,
    el: null,
    strips: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--mobile' || a === '--tablet' || a === '--desktop') {
      o.vpName = a.slice(2);
      o.viewport = VIEWPORTS[o.vpName];
    } else if (a === '--size') {
      const [w, h] = next().split('x').map(Number);
      o.viewport = { width: w, height: h };
      o.vpName = `${w}x${h}`;
    } else if (a === '--dark') o.dark = true;
    else if (a === '--lang') o.lang = next();
    else if (a === '--click') o.clicks.push(next());
    else if (a === '--fill') o.fills.push(next());
    else if (a === '--eval') o.evals.push(next());
    else if (a === '--wait') o.wait = Number(next());
    else if (a === '--name') o.name = next();
    else if (a === '--prod') o.prod = true;
    else if (a === '--el') o.el = next();
    else if (a === '--strips') o.strips = true;
    else if (a === '--keep-animations') o.keepAnim = true;
    else if (a.startsWith('--')) throw new Error(`opcion desconocida: ${a}`);
    else o.target = a;
  }
  if (!o.target) throw new Error('falta la pagina. Ej: npm run look -- index.html --mobile');
  return o;
}

// ── servidor estatico del repo ──────────────────────────────────────────────
// El repo es HTML estatico, pero los modulos ES no cargan desde file:// - hace
// falta un origen http. No hay build: se sirven los archivos tal cual.
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      const file = path.join(ROOT, rel === '/' ? '/index.html' : rel);
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      fs.readFile(file, (err, buf) => {
        if (err) return res.writeHead(404).end('not found');
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ── lo que se mide dentro de la pagina ──────────────────────────────────────
// Corre en el navegador. Devuelve datos, no opiniones.
const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const label = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
    const txt = (el.textContent || '').trim().slice(0, 40).replace(/\s+/g, ' ');
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ''}`;
  };
  const visible = (el, r) => {
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };

  const all = [...document.querySelectorAll('body *')];

  // 1. Lo que se sale del ancho de la pantalla.
  const pastViewport = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    const over = Math.round(r.right - vw);
    if (over > 1) pastViewport.push({ el: label(el), over, width: Math.round(r.width) });
  }

  // 2. Cajas cuyo contenido no entra y que NO pueden scrollear: el contenido
  //    queda cortado o pisando lo de al lado. Este es el "se ve desordenado".
  const clipped = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    const scrollable = /auto|scroll/.test(cs.overflowX) || /auto|scroll/.test(cs.overflowY);
    if (scrollable) continue;
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    const overX = el.scrollWidth - el.clientWidth;
    if (overX > 1 && el.clientWidth > 0) clipped.push({ el: label(el), overX });
  }

  // 3. Cajas que SI scrollean horizontalmente. En un formulario o un modal eso
  //    casi siempre es un error de box-sizing, no una decision.
  const hScroll = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!/auto|scroll/.test(cs.overflowX)) continue;
    if (el.scrollWidth - el.clientWidth > 1) {
      hScroll.push({ el: label(el), overX: el.scrollWidth - el.clientWidth });
    }
  }

  // 4. Hijos que se pasan del borde de su padre.
  const spilling = [];
  for (const el of all) {
    const p = el.parentElement;
    if (!p || p === document.body) continue;
    const r = el.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    if (!visible(el, r) || pr.width === 0) continue;
    const cs = getComputedStyle(p);
    if (cs.overflow !== 'visible' && cs.overflowX !== 'visible') continue;
    if (getComputedStyle(el).position === 'absolute' || getComputedStyle(el).position === 'fixed')
      continue;
    const over = Math.round(r.right - pr.right);
    if (over > 1) spilling.push({ el: label(el), parent: label(p), over });
  }

  const sort = (arr, k) => arr.sort((a, b) => b[k] - a[k]).slice(0, 12);
  return {
    viewportWidth: vw,
    pageScrollWidth: document.documentElement.scrollWidth,
    pageOverflowsX: document.documentElement.scrollWidth > vw + 1,
    lang: document.documentElement.lang || null,
    theme: document.documentElement.getAttribute('data-theme') || '(sistema)',
    pastViewport: sort(pastViewport, 'over'),
    clipped: sort(clipped, 'overX'),
    hScroll: sort(hScroll, 'overX'),
    spilling: sort(spilling, 'over'),
  };
};

// ── main ────────────────────────────────────────────────────────────────────
const o = parseArgs(process.argv.slice(2));
fs.mkdirSync(OUT, { recursive: true });

const local = o.prod ? null : await serve();
const base = o.prod ? PROD : `http://127.0.0.1:${local.port}`;
const url = `${base}/${o.target.replace(/^\//, '')}`;

const browser = await chromium.launch();
// --mobile tiene que EMULAR un telefono, no solo achicar la ventana.
// index.html mira navigator.userAgent y redirige a landing.html si no reconoce
// un movil: con el user-agent de escritorio que trae Playwright, pedir
// index.html a 390px devolvia la LANDING apretada en 390px, y sus desbordes se
// leian como bugs de la app movil. Ninguno era real.
const device =
  o.vpName === 'mobile'
    ? devices['iPhone 14']
    : o.vpName === 'tablet'
      ? devices['iPad (gen 7)']
      : null;
const context = await browser.newContext({
  ...(device || {}),
  viewport: o.viewport,
  colorScheme: o.dark ? 'dark' : 'light',
  deviceScaleFactor: 2,
  // Sin esto la landing puede pedir permiso de ubicacion y quedarse esperando.
  permissions: [],
});

// El idioma se guarda en localStorage, asi que hay que ponerlo ANTES de que
// corra el primer script de la pagina.
if (o.lang) {
  await context.addInitScript((lang) => {
    try {
      localStorage.setItem('drbike_lang', lang);
    } catch {}
  }, o.lang);
}

// El service worker sirve JS viejo por stale-while-revalidate: sin esto un
// arreglo correcto se ve roto. Ya paso.
await context.addInitScript(() => {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister()));
  }
});

const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const loc = m.location()?.url || '';
  // La consola de Diego es casi toda ruido de extensiones. Solo cuentan los
  // archivos del proyecto.
  if (/extension:|normal\?lang=auto/.test(loc)) return;
  consoleErrors.push(`${m.text().slice(0, 160)}  <- ${loc.split('/').pop()}`);
});
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));

// networkidle no sirve en este sitio: el widget de chat y los analytics dejan
// conexiones abiertas y la espera nunca termina. Se espera la carga, y despues
// se le da un respiro corto a lo que se pinta solo.
await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(async (e) => {
  console.error('no cargo:', e.message.split('\n')[0]);
  await browser.close();
  local?.server.close();
  process.exit(1);
});

// Las animaciones de entrada dejan las pantallas corridas un viewport a la
// derecha mientras corren, y eso se mide como desbordamiento que no existe.
if (!o.keepAnim) {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}`,
  });
}

for (const js of o.evals)
  await page
    .evaluate((code) => eval(code), js)
    .catch((e) => console.error('eval fallo:', e.message.split('\n')[0]));
for (const f of o.fills) {
  const i = f.indexOf('=');
  await page
    .fill(f.slice(0, i), f.slice(i + 1))
    .catch((e) => console.error('fill fallo:', e.message.split('\n')[0]));
}
for (const sel of o.clicks) {
  await page
    .click(sel, { timeout: 8000 })
    .catch((e) => console.error('click fallo:', e.message.split('\n')[0]));
  await page.waitForTimeout(400);
}
await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
if (o.wait) await page.waitForTimeout(o.wait);

const m = await page.evaluate(MEASURE);

const name =
  o.name ||
  `${o.target.replace(/[^a-z0-9]+/gi, '-')}-${o.vpName}${o.dark ? '-dark' : ''}${o.lang ? '-' + o.lang : ''}`;

// Una pagina entera puede medir 18.000px de alto. En una sola imagen eso se
// achica hasta ser ilegible, asi que hay tres modos:
//   --el <sel>   solo ese elemento (un modal, una tarjeta)
//   --strips     tiras del alto de la pantalla, numeradas
//   (default)    la pagina entera, util solo si es corta
const shots = [];
if (o.el) {
  const target = page.locator(o.el).first();
  const f = path.join(OUT, name + '.png');
  await target.screenshot({ path: f });
  shots.push(f);
} else if (o.strips) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = o.viewport.height;
  const n = Math.min(Math.ceil(total / vh), 12);
  for (let i = 0; i < n; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * vh);
    await page.waitForTimeout(250);
    const f = path.join(OUT, `${name}-${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: f });
    shots.push(f);
  }
} else {
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f, fullPage: true });
  shots.push(f);
}

await browser.close();
local?.server.close();

// ── reporte ─────────────────────────────────────────────────────────────────
const line = (s) => console.log(s);
line('');
line(`  ${url}`);
line(
  `  ${o.viewport.width}x${o.viewport.height} · ${o.dark ? 'oscuro' : 'claro'} · lang=${m.lang || '?'} · theme=${m.theme}`
);
for (const f of shots) line(`  captura: ${path.relative(ROOT, f)}`);
line('');

if (pageErrors.length) {
  line('  ERRORES DE JS (la pagina se rompio):');
  for (const e of pageErrors) line('    ' + e);
  line('');
}
if (consoleErrors.length) {
  line('  ERRORES DE CONSOLA (del proyecto, no de extensiones):');
  for (const e of consoleErrors.slice(0, 10)) line('    ' + e);
  line('');
}

if (m.pageOverflowsX) {
  line(
    `  LA PAGINA SE VA DE ANCHO: ${m.pageScrollWidth}px de contenido en ${m.viewportWidth}px de pantalla`
  );
  for (const x of m.pastViewport) line(`    +${x.over}px  ${x.el}  (ancho ${x.width}px)`);
  line('');
}
if (m.hScroll.length) {
  line('  CAJAS CON SCROLL HORIZONTAL (en un modal o un form casi siempre es box-sizing):');
  for (const x of m.hScroll) line(`    +${x.overX}px  ${x.el}`);
  line('');
}
if (m.clipped.length) {
  line('  CONTENIDO CORTADO (no entra y la caja no puede scrollear):');
  for (const x of m.clipped) line(`    +${x.overX}px  ${x.el}`);
  line('');
}
if (m.spilling.length) {
  line('  HIJOS QUE SE PASAN DEL PADRE:');
  for (const x of m.spilling) line(`    +${x.over}px  ${x.el}`);
  line('');
}

const clean =
  !pageErrors.length &&
  !consoleErrors.length &&
  !m.pageOverflowsX &&
  !m.hScroll.length &&
  !m.clipped.length &&
  !m.spilling.length;
if (clean) line('  sin errores de consola ni desbordes medibles');
line('');
