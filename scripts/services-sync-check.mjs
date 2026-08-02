// Compares the live `services` table against the service cards hand-written
// into the marketing pages, and names every card the browser cannot match.
//
// Why it exists: js/live-prices.js keeps card PRICES in sync with Supabase,
// but it can only rewrite a card that already exists and whose name it can
// match. So:
//   - adding a service in Admin puts it in the booking wizard and the chatbot
//     immediately, and on no marketing page ever;
//   - deleting one leaves its card advertised at a price nobody can book;
//   - renaming one silently detaches the card, which then shows its stale
//     hardcoded price forever.
// All three fail quietly - live-prices.js logs a console warning nobody reads.
// This turns them into something Diego can run after editing services.
//
//   npm run services:check
//
// Needs network (reads Supabase with the public anon key), so it is NOT part
// of `npm run check` - CI must not depend on a live table.
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';

// Read NAME_MAP out of live-prices.js rather than keeping a second copy. If
// this check used its own map it would drift from the one the browser applies
// and start reporting matches that do not actually happen in production.
function loadNameMap() {
  const src = readFileSync('js/live-prices.js', 'utf8');
  const block = src.match(/const NAME_MAP = \{([\s\S]*?)\};/);
  if (!block) {
    console.error(
      'x Could not read NAME_MAP out of js/live-prices.js - the shape changed.\n' +
        '  Fix this parser before trusting the result; a silently empty map would\n' +
        '  report every renamed card as broken.'
    );
    process.exit(1);
  }
  const map = {};
  for (const m of block[1].matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

// The browser matches on heading.textContent, which has already decoded HTML
// entities; this script reads the raw file, so without decoding here a card
// written "Cable &amp; Housing" looks broken when it matches perfectly in
// production. Reporting a false break is worse than reporting nothing - it
// sends Diego to "fix" markup that is already correct.
function decodeEntities(s) {
  return (
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Escape sequences, not literal dashes: a service really is named
      // "Bike Build — New Bike", and a mis-encoded literal here would make
      // that one card look broken for reasons nobody could see in a diff.
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
  );
}

// The three card shapes on the site, all documented in js/live-prices.js.
function cardsIn(file) {
  const html = readFileSync(file, 'utf8');
  const out = [];

  // Suburb pages (incl. es/ and zh/, whose headings are translated but which
  // carry the English name in data-service).
  for (const m of html.matchAll(
    /data-service="([^"]+)"[\s\S]{0,400}?class="price"[^>]*>\$?([\d,]+)/g
  )) {
    out.push({ file, name: decodeEntities(m[1]), price: Number(m[2].replace(/,/g, '')) });
  }
  // index.html
  for (const m of html.matchAll(
    /class="service-name"[^>]*>([^<]+)<[\s\S]{0,400}?class="service-price"[^>]*>\$?([\d,]+)/g
  )) {
    out.push({ file, name: decodeEntities(m[1]).trim(), price: Number(m[2].replace(/,/g, '')) });
  }
  // landing.html "All Services" modal
  for (const m of html.matchAll(
    /class="svc-name"[^>]*>([^<]+)<[\s\S]{0,400}?class="svc-price"[^>]*>\$?([\d,]+)/g
  )) {
    out.push({ file, name: decodeEntities(m[1]).trim(), price: Number(m[2].replace(/,/g, '')) });
  }
  return out;
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/services?select=name,price`, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
});
if (!res.ok) {
  console.error(`x Could not read the services table (HTTP ${res.status}). No comparison made.`);
  process.exit(1);
}
const services = await res.json();
if (!Array.isArray(services) || !services.length) {
  console.error('x The services table returned nothing. No comparison made.');
  process.exit(1);
}
const byName = new Map(services.map((s) => [s.name, s.price]));
const NAME_MAP = loadNameMap();

// Every page that carries hand-written service cards.
const pages = ['index.html', 'landing.html'];
for (const dir of ['.', 'es', 'zh']) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    const path = dir === '.' ? f : `${dir}/${f}`;
    if (pages.includes(path)) continue;
    if (readFileSync(path, 'utf8').includes('data-service=')) pages.push(path);
  }
}

const cards = pages.flatMap(cardsIn);
const unmatched = [];
const priceDrift = [];
const advertised = new Set();

for (const card of cards) {
  const lookup = NAME_MAP[card.name] || card.name;
  if (!byName.has(lookup)) {
    unmatched.push({ ...card, lookup });
    continue;
  }
  advertised.add(lookup);
  if (byName.get(lookup) !== card.price) priceDrift.push({ ...card, live: byName.get(lookup) });
}

const unadvertised = services.filter((s) => !advertised.has(s.name)).map((s) => s.name);

// ── Report ──────────────────────────────────────────────────────────────────
const groupByName = (rows) => {
  const g = new Map();
  for (const r of rows) g.set(r.name, [...(g.get(r.name) || []), r.file]);
  return g;
};

let bad = 0;

if (unmatched.length) {
  bad++;
  console.log('\nCARDS THAT MATCH NO SERVICE  (renamed or deleted in Admin)');
  console.log('These keep the price hardcoded in the HTML forever, and a customer');
  console.log('can see them advertised but cannot book them.\n');
  for (const [name, files] of groupByName(unmatched)) {
    console.log(`  x "${name}"  -> looked up as "${NAME_MAP[name] || name}"`);
    console.log(
      `      on ${files.length} page(s): ${files.slice(0, 4).join(', ')}${files.length > 4 ? ` +${files.length - 4} more` : ''}`
    );
    console.log(`      fix: rename the card, or add a NAME_MAP entry in js/live-prices.js\n`);
  }
}

if (unadvertised.length) {
  bad++;
  console.log('SERVICES ON NO MARKETING PAGE  (bookable, but nobody is told)');
  console.log('These work in the booking wizard and the chatbot already.\n');
  for (const n of unadvertised) console.log(`  ! ${n} ($${byName.get(n)})`);
  console.log('');
}

if (priceDrift.length) {
  console.log('CARDS WHOSE HARDCODED PRICE IS STALE  (cosmetic - live-prices.js');
  console.log('rewrites these on load, but a visitor sees the old one if it fails)\n');
  for (const d of priceDrift.slice(0, 12)) {
    console.log(`  - ${d.file}: "${d.name}" says $${d.price}, table says $${d.live}`);
  }
  if (priceDrift.length > 12) console.log(`  ...and ${priceDrift.length - 12} more`);
  console.log('');
}

console.log(
  `Checked ${cards.length} cards on ${pages.length} pages against ${services.length} services.`
);
if (!bad && !priceDrift.length) console.log('Everything in the catalog is advertised and matched.');
// Deliberately never fails the build: this is a report for Diego, and a
// transient network blip must not look like a content problem.
