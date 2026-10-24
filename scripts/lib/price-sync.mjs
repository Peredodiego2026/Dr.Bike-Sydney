// scripts/lib/price-sync.mjs - the pure half of scripts/prices-sync.mjs: text in,
// text out, no network and no disk, so tests/unit/prices-sync.test.js can pin it.

// Same decoding as scripts/services-sync-check.mjs: the browser matches card
// names on textContent, which has already decoded entities, so "Cable &amp;
// Housing" in the file is "Cable & Housing" to js/live-prices.js.
export function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

// NAME_MAP is read out of js/live-prices.js, never copied: a second copy would
// drift from the one the browser applies, and this script would then write a
// price onto a card the browser cannot match (or skip one it can).
export function parseNameMap(liveSrc) {
  const block = liveSrc.match(/const NAME_MAP = \{([\s\S]*?)\};/);
  if (!block) throw new Error('could not read NAME_MAP out of js/live-prices.js - its shape changed');
  const map = {};
  for (const m of block[1].matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g)) map[m[1]] = m[2];
  return map;
}

// The two hand-written card shapes (index.html .service-card, landing.html
// .svc-card). The generated suburb pages are left to their generator. Each card
// runs from its opening tag to the next one, so a card with no price element
// can never borrow its neighbour's.
//
// Mirrors js/live-prices.js: data-price-from="cheapest" is a category card whose
// floor is the cheapest priced service; any other card gets its own service's
// price. A "From " already in the text is kept - it is copy, not data.
const CARD_OPEN = /<div class="(?:service-card|svc-card)"[^>]*>/g;
const CARD_NAME = /class="(?:service-name|svc-name)"[^>]*>([^<]+)</;
const CARD_PRICE = /(class="(?:service-price|svc-price)"[^>]*>)(From )?\$([\d,]+)/;

export function rewriteCards(html, priceFor, cheapest) {
  const opens = [...html.matchAll(CARD_OPEN)];
  const changes = [];
  const seen = [];
  const unmatched = [];
  if (!opens.length) return { html, changes, seen, unmatched };

  let out = html.slice(0, opens[0].index);
  opens.forEach((open, i) => {
    const end = i + 1 < opens.length ? opens[i + 1].index : html.length;
    let card = html.slice(open.index, end);
    const nameM = card.match(CARD_NAME);
    const priceM = card.match(CARD_PRICE);
    if (nameM && priceM) {
      const name = decodeEntities(nameM[1]).trim();
      const old = Number(priceM[3].replace(/,/g, ''));
      const isCategory = /data-price-from="cheapest"/.test(open[0]);
      const live = isCategory ? cheapest : priceFor(name);
      if (!isCategory) seen.push({ name, price: old });
      // A $0 row is "call us for a quote" - "$0" on a card reads as free.
      if (live === undefined || live === null || live === 0) {
        if (!isCategory) unmatched.push(name);
      } else if (live !== old) {
        changes.push({ name: isCategory ? `${name} (cheapest)` : name, from: old, to: live });
        card = card.replace(CARD_PRICE, (_, tag, from) => `${tag}${from || ''}$${live}`);
      }
    }
    out += card;
  });
  return { html: out, changes, seen, unmatched };
}

// Structured data on the hand-written pages (landing.html's OfferCatalog). The
// block is only rewritten when JSON.stringify gives back exactly the bytes on
// disk - then parse/modify/stringify cannot reformat anything else in it. A
// block written any other way is reported and left alone.
export function rewriteJsonLd(html, priceFor) {
  const changes = [];
  const skipped = [];
  const out = html.replace(
    /(<script type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g,
    (whole, open, raw, close) => {
      if (!/"price"\s*:/.test(raw)) return whole;
      const body = raw.trim();
      let data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        skipped.push(`does not parse (${e.message.slice(0, 60)})`);
        return whole;
      }
      if (JSON.stringify(data) !== body) {
        skipped.push('not in JSON.stringify form - edit its prices by hand');
        return whole;
      }
      let touched = false;
      (function walk(node) {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== 'object') return;
        if (node.price !== undefined) {
          const name = node.itemOffered?.name || node.name;
          const live = name ? priceFor(name) : undefined;
          if (live && Number(node.price) !== live) {
            changes.push({ name, from: Number(node.price), to: live });
            node.price = typeof node.price === 'string' ? String(live) : live;
            touched = true;
          }
        }
        for (const v of Object.values(node)) walk(v);
      })(data);
      // Function replacements throughout: a "$" in the JSON ("priceRange":"$$")
      // would otherwise be read as a replacement pattern.
      return touched ? open + raw.replace(body, () => JSON.stringify(data)) + close : whole;
    }
  );
  return { html: out, changes, skipped };
}

// SERVICE_PRICES in scripts/generate-suburb-pages.mjs is only the offline
// fallback, but it is what the suburb pages would quote if Supabase were down
// at generation time - so it follows the table too.
export function rewriteGeneratorDefaults(src, priceFor) {
  const keys = src.match(/const SERVICE_KEYS = \[([\s\S]*?)\];/);
  if (!keys) throw new Error('could not read SERVICE_KEYS out of generate-suburb-pages.mjs');
  const names = [...keys[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const prices = names.map((n) => priceFor(n));
  const missing = names.filter((n, i) => !prices[i]);
  if (missing.length) return { src, missing };
  const line = `const SERVICE_PRICES = [${prices.map((p) => `'$${p}'`).join(', ')}];`;
  return { src: src.replace(/const SERVICE_PRICES = \[[^\]]*\];/, () => line), missing };
}

// Every "$N" whose N is one of `amounts`, line by line. Deliberately dumb: it
// cannot know that "Tune-Up ($119)" means the Tune-Up and "a wash ($35)" does
// not, so it lists both and a person (or Claude) decides. A cleverer matcher
// would be quietly wrong about the one sentence nobody thought of.
export function findMentions(text, amounts) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/\$(\d[\d,]*)(?!\d)/g)) {
      const amount = Number(m[1].replace(/,/g, ''));
      if (amounts.has(amount)) out.push({ line: i + 1, amount, text: line.trim() });
    }
  });
  return out;
}
