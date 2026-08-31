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
import { missingCatalogTranslations } from './lib/dict-keys.mjs';

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
// The optional "From" covers cards that advertise a floor (data-price-from)
// instead of a fixed price. Without it those cards match no pattern at all and
// drop silently out of this check - the exact blindness it exists to remove.
function cardsIn(file) {
  const html = readFileSync(file, 'utf8');
  const out = [];

  // Suburb pages (incl. es/ and zh/, whose headings are translated but which
  // carry the English name in data-service).
  for (const m of html.matchAll(
    /data-service="([^"]+)"[\s\S]{0,400}?class="price"[^>]*>(?:From\s+)?\$?([\d,]+)/g
  )) {
    out.push({ file, name: decodeEntities(m[1]), price: Number(m[2].replace(/,/g, '')) });
  }
  // index.html
  for (const m of html.matchAll(
    /class="service-name"[^>]*>([^<]+)<[\s\S]{0,400}?class="service-price"[^>]*>(?:From\s+)?\$?([\d,]+)/g
  )) {
    out.push({ file, name: decodeEntities(m[1]).trim(), price: Number(m[2].replace(/,/g, '')) });
  }
  // landing.html "All Services" modal
  for (const m of html.matchAll(
    /class="svc-name"[^>]*>([^<]+)<[\s\S]{0,400}?class="svc-price"[^>]*>(?:From\s+)?\$?([\d,]+)/g
  )) {
    out.push({ file, name: decodeEntities(m[1]).trim(), price: Number(m[2].replace(/,/g, '')) });
  }
  return out;
}

// ── Structured data (JSON-LD), the half nothing was watching ────────────────
// Every page carries <script type="application/ld+json"> blocks declaring the
// services and their prices. That is what Google prints in search results.
//
// js/live-prices.js does NOT touch them - it rewrites cards in the DOM, and
// Google reads the served HTML anyway, not the page after our script ran. The
// suburb pages do read the live table, but only at GENERATION time, so from the
// moment Diego edits a price in Admin the structured data of 60-odd pages is
// stale until someone regenerates them. landing.html's block is hand-written
// and does not even have that.
//
// Nothing caught this before: plan-prices-check.mjs watches membership prices,
// the card sweep above watches cards, and the JSON-LD sat between the two.

// The suburb pages declare their offers in the language of the page ("Ajuste",
// "基础保养"), so a lookup against the English catalog would miss 240 of the 244
// blocks. The generator already holds those translations, positionally aligned
// with the English keys - read them from there rather than keeping a second
// copy that could drift from what actually gets generated.
function loadSuburbNameMap() {
  const src = readFileSync('scripts/generate-suburb-pages.mjs', 'utf8');
  const keys = src.match(/const SERVICE_KEYS = \[([\s\S]*?)\];/);
  if (!keys) {
    console.error(
      'x Could not read SERVICE_KEYS out of scripts/generate-suburb-pages.mjs.\n' +
        '  Fix this parser before trusting the result: an empty map would report\n' +
        '  every translated offer as broken.'
    );
    process.exit(1);
  }
  const english = [...keys[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const map = {};
  for (const block of src.matchAll(/serviceNames: \[([\s\S]*?)\]/g)) {
    const names = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    // The two lists are positional. A misaligned one would map prices onto the
    // wrong services and report drift that does not exist.
    if (names.length !== english.length) {
      console.error(
        `x A serviceNames list in generate-suburb-pages.mjs has ${names.length} entries ` +
          `but SERVICE_KEYS has ${english.length}. The two are positional; fix the generator.`
      );
      process.exit(1);
    }
    names.forEach((n, i) => (map[n] = english[i]));
  }
  return map;
}

// Walks a parsed block for anything carrying a price. Offers nest differently
// depending on the schema (`offers[]`, `hasOfferCatalog.itemListElement[]`), so
// this finds the price first and then asks where the name is, instead of
// assuming one shape and silently skipping the other.
function jsonLdIn(file) {
  const html = readFileSync(file, 'utf8');
  const offers = [];
  const unreadable = [];
  const ranges = [];
  for (const m of html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
  )) {
    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch (e) {
      // Loudly: a block Node cannot read is a block Google cannot read either.
      unreadable.push({ file, why: e.message.slice(0, 80) });
      continue;
    }
    (function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (node.price !== undefined) {
        const price = Number(String(node.price).replace(/[$,]/g, ''));
        const name = node.itemOffered?.name || node.name;
        if (name && Number.isFinite(price)) offers.push({ file, name, price });
      }
      // priceRange is prose ("$109-$369"), not an offer, but it is the first
      // number Google shows and it is hardcoded in the generator.
      if (typeof node.priceRange === 'string') {
        const nums = [...node.priceRange.matchAll(/\$?([\d,]+)/g)].map((x) =>
          Number(x[1].replace(/,/g, ''))
        );
        if (nums.length === 2) ranges.push({ file, from: nums[0], to: nums[1] });
      }
      for (const v of Object.values(node)) walk(v);
    })(parsed);
  }
  return { offers, unreadable, ranges };
}

// A card carrying data-price-from="cheapest" names a CATEGORY, not a bookable
// service - "Repairs" is the only one today. live-prices.js computes its floor
// from the whole table, so having no row of its own is correct. Listing it as
// broken would be a permanent false alarm, and a check with a permanent false
// alarm is one nobody reads.
function categoryCardNames(file) {
  const html = readFileSync(file, 'utf8');
  const out = new Set();
  for (const m of html.matchAll(
    /data-price-from="cheapest"[\s\S]{0,600}?class="(?:service|svc)-name"[^>]*>([^<]+)</g
  )) {
    out.add(decodeEntities(m[1]).trim());
  }
  return out;
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/services?select=name,price,description`, {
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
const categoryNames = new Set(pages.flatMap((f) => [...categoryCardNames(f)]));
const unmatched = [];
const priceDrift = [];
const advertised = new Set();

for (const card of cards) {
  const lookup = NAME_MAP[card.name] || card.name;
  if (!byName.has(lookup)) {
    if (!categoryNames.has(card.name)) unmatched.push({ ...card, lookup });
    continue;
  }
  advertised.add(lookup);
  if (byName.get(lookup) !== card.price) priceDrift.push({ ...card, live: byName.get(lookup) });
}

// ── The JSON-LD sweep ───────────────────────────────────────────────────────
// A separate page list from the card one: a page can carry structured data
// without carrying a price card, and landing.html does exactly that.
const ldPages = [];
for (const dir of ['.', 'es', 'zh']) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    const path = dir === '.' ? f : `${dir}/${f}`;
    if (readFileSync(path, 'utf8').includes('application/ld+json')) ldPages.push(path);
  }
}

const SUBURB_MAP = loadSuburbNameMap();
const ldOffers = [];
const ldUnreadable = [];
const ldRanges = [];
for (const p of ldPages) {
  const r = jsonLdIn(p);
  ldOffers.push(...r.offers);
  ldUnreadable.push(...r.unreadable);
  ldRanges.push(...r.ranges);
}

// A parser that quietly stops matching is the failure mode this project keeps
// hitting: the i18n check passed green through three separate blind spots
// because "found nothing" and "nothing to find" printed the same. There are 63
// pages of structured data in this repo and there is no version of it being
// right for that sweep to come back empty.
if (!ldPages.length || !ldOffers.length || !Object.keys(SUBURB_MAP).length) {
  console.error(
    `x The structured-data sweep found ${ldPages.length} page(s), ${ldOffers.length} offer(s) ` +
      `and ${Object.keys(SUBURB_MAP).length} translated name(s).\n` +
      '  Any of those being zero means the parser broke, not that the site is clean.\n' +
      '  Fix it before trusting a green run.'
  );
  process.exit(1);
}

// Same resolution order the browser would use, plus the generator's
// translations: exact catalog name, then the marketing alias, then the
// per-language name.
const resolve = (name) => {
  if (byName.has(name)) return name;
  if (NAME_MAP[name] && byName.has(NAME_MAP[name])) return NAME_MAP[name];
  if (SUBURB_MAP[name] && byName.has(SUBURB_MAP[name])) return SUBURB_MAP[name];
  return null;
};

const ldDrift = [];
const ldUnmatched = [];
for (const o of ldOffers) {
  const key = resolve(o.name);
  if (!key) {
    ldUnmatched.push(o);
    continue;
  }
  if (byName.get(key) !== o.price) ldDrift.push({ ...o, key, live: byName.get(key) });
}

// The range Google prints next to the business. Its ends are the cheapest and
// dearest of the four headline services the pages actually advertise, not of
// the whole table - a $17 wheel true is not what "from" means here.
const headline = [...new Set(Object.values(SUBURB_MAP))]
  .map((n) => byName.get(n))
  .filter((p) => typeof p === 'number');
const rangeDrift = [];
if (headline.length) {
  const lo = Math.min(...headline);
  const hi = Math.max(...headline);
  for (const r of ldRanges) {
    if (r.from !== lo || r.to !== hi) rangeDrift.push({ ...r, lo, hi });
  }
}

// A $0 service has no price to put on a price card - Emergency Service is a
// "call us and we quote you" path, and live-prices.js would stamp "$0" on any
// card it found, which reads as free. Those are advertised as prose instead,
// so they are checked for a mention rather than for a card.
const pageText = pages.map((p) => readFileSync(p, 'utf8')).join('\n');
const unadvertised = [];
const unpricedMissing = [];
for (const s of services) {
  if (advertised.has(s.name)) continue;
  if (Number(s.price) === 0) {
    if (!pageText.includes(s.name)) unpricedMissing.push(s.name);
    continue;
  }
  unadvertised.push(s.name);
}

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

if (unpricedMissing.length) {
  bad++;
  console.log('UNPRICED SERVICES NOT MENTIONED ANYWHERE');
  console.log('These have no price, so they get prose rather than a price card -');
  console.log('but right now no page names them at all.\n');
  for (const n of unpricedMissing) console.log(`  ! ${n}`);
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

// The JSON-LD problems are reported apart from the card ones and worded harder
// on purpose. A stale CARD is cosmetic - live-prices.js rewrites it on load.
// A stale OFFER is what Google prints, and nothing rewrites it ever.
if (ldUnreadable.length) {
  bad++;
  console.log('STRUCTURED DATA THAT DOES NOT PARSE  (Google cannot read it either)\n');
  for (const u of ldUnreadable) console.log(`  x ${u.file}: ${u.why}`);
  console.log('');
}

if (ldDrift.length) {
  bad++;
  console.log('GOOGLE IS BEING TOLD THE WRONG PRICE  (JSON-LD, nothing rewrites this)');
  console.log('These are the numbers that show up in search results. live-prices.js');
  console.log('does not touch structured data.\n');
  for (const d of ldDrift.slice(0, 12)) {
    console.log(`  x ${d.file}: "${d.name}" says $${d.price}, table says $${d.live}`);
  }
  if (ldDrift.length > 12) console.log(`  ...and ${ldDrift.length - 12} more`);
  console.log('\n  fix: regenerate the suburb pages -> npm run suburbs:generate');
  console.log('       landing.html and index.html are hand-written: edit those by hand.\n');
}

if (rangeDrift.length) {
  bad++;
  console.log('THE PRICE RANGE GOOGLE SHOWS IS STALE  (priceRange in JSON-LD)\n');
  const r = rangeDrift[0];
  console.log(`  x says $${r.from}-$${r.to}, the headline services are $${r.lo}-$${r.hi}`);
  console.log(`      on ${rangeDrift.length} page(s)`);
  console.log('      fix: priceRange in scripts/generate-suburb-pages.mjs is hardcoded,');
  console.log('           unlike the offers. Update it there, then regenerate.\n');
}

if (ldUnmatched.length) {
  bad++;
  console.log('OFFERS ADVERTISED TO GOOGLE THAT MATCH NO SERVICE\n');
  for (const [name, files] of groupByName(ldUnmatched)) {
    console.log(`  x "${name}" on ${files.length} page(s): ${files.slice(0, 3).join(', ')}`);
  }
  console.log('');
}

// ── The catalog's own words ─────────────────────────────────────────────────
// The booking wizard prints `name` and `description` from this table verbatim
// (js/app.js renderStep1 -> createServiceCard), and js/i18n.js translates them
// as a post-render pass keyed on the exact English text. So a row whose wording
// is not in the dictionary renders in English to Spanish and Chinese clients,
// and nothing anywhere says so: scripts/i18n-check.mjs reads the surfaces, not
// the table. That is how 32 of 33 descriptions and 11 of 33 names sat
// untranslated with a green `npm run check` (docs/PENDIENTES.md 69).
//
// This is also the ONLY thing that notices an edit made in Admin > Services &
// Prices: rewording a description there detaches it from its dictionary key and
// that card quietly falls back to English.
const i18nMissing = missingCatalogTranslations(services, readFileSync('js/i18n.js', 'utf8'));

if (i18nMissing.length) {
  bad++;
  console.log('CATALOG WORDING WITH NO TRANSLATION  (renders in English to es/zh)');
  console.log('The booking wizard prints these straight from the table. i18n-check');
  console.log('cannot see them - they are data, not markup.\n');
  for (const r of i18nMissing) {
    console.log(`  x ${r.service} (${r.kind}) - missing ${r.missing.join(' and ')}`);
    console.log(`      "${r.text.length > 90 ? r.text.slice(0, 90) + '...' : r.text}"`);
  }
  console.log('\n  fix: add the exact English string to the Supabase catalog block at the');
  console.log('       end of both dictionaries in js/i18n.js, then bump CACHE_STATIC in');
  console.log('       sw.js or returning visitors keep the old dictionary.\n');
}

console.log(
  `Checked ${cards.length} cards on ${pages.length} pages, and ${ldOffers.length} structured-data ` +
    `offers on ${ldPages.length} pages, against ${services.length} services.`
);
if (!bad && !priceDrift.length)
  console.log('Everything in the catalog is advertised, matched and translated.');
// Deliberately never fails the build: this is a report for Diego, and a
// transient network blip must not look like a content problem.
