// tests/unit/prices-sync.test.js
//
// scripts/prices-sync.mjs rewrites prices in index.html and landing.html for
// Diego, unattended, the next time the `services` table moves. A wrong rewrite
// there is a wrong price on the live site, so the pure half is pinned here:
// what it writes, what it refuses to write, and that on the files as they are
// committed it writes nothing at all.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  decodeEntities,
  parseNameMap,
  rewriteCards,
  rewriteJsonLd,
  rewriteGeneratorDefaults,
  findMentions,
} from '../../scripts/lib/price-sync.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const table = (rows) => (name) => rows[decodeEntities(name).trim()];

const card = (name, price, attrs = '') =>
  `<div class="svc-card"${attrs}>\n  <div class="svc-name">${name}</div>\n  <div class="svc-price">${price}</div>\n</div>\n`;

describe('rewriteCards', () => {
  it('writes the table price onto the card with that name', () => {
    const html = card('Basic Tune-Up', '$109') + card('Standard Service', '$149');
    const out = rewriteCards(html, table({ 'Basic Tune-Up': 119, 'Standard Service': 159 }));
    expect(out.html).toBe(card('Basic Tune-Up', '$119') + card('Standard Service', '$159'));
    expect(out.changes).toEqual([
      { name: 'Basic Tune-Up', from: 109, to: 119 },
      { name: 'Standard Service', from: 149, to: 159 },
    ]);
  });

  it('matches on the decoded name, the way the browser reads textContent', () => {
    const out = rewriteCards(card('Cable &amp; Housing', '$89'), table({ 'Cable & Housing': 99 }));
    expect(out.html).toContain('<div class="svc-price">$99</div>');
  });

  it('keeps "From " - it is copy, not data', () => {
    const out = rewriteCards(card('Bike Assembly', 'From $80', ' data-price-from'), table({ 'Bike Assembly': 90 }));
    expect(out.html).toContain('<div class="svc-price">From $90</div>');
  });

  it('gives a category card the cheapest price, not a price of its own', () => {
    const html = card('Repairs', 'From $17', ' data-price-from="cheapest"');
    const out = rewriteCards(html, table({}), 27);
    expect(out.html).toContain('From $27');
    expect(out.changes).toEqual([{ name: 'Repairs (cheapest)', from: 17, to: 27 }]);
    // A category card is not a service: it must not become a "before" price.
    expect(out.seen).toEqual([]);
  });

  it('never writes $0 - that row is "call us for a quote"', () => {
    const out = rewriteCards(card('Wheel Build', '$150'), table({ 'Wheel Build': 0 }));
    expect(out.html).toContain('$150');
    expect(out.unmatched).toEqual(['Wheel Build']);
  });

  it('leaves a card with no row in the table alone and reports it', () => {
    const out = rewriteCards(card('Something New', '$45'), table({}));
    expect(out.html).toBe(card('Something New', '$45'));
    expect(out.unmatched).toEqual(['Something New']);
  });

  it('does not let a card without a price borrow its neighbour\'s', () => {
    const noPrice = '<div class="svc-card">\n  <div class="svc-name">Gift Card</div>\n</div>\n';
    const html = noPrice + card('Saddle Fitting', '$59');
    const out = rewriteCards(html, table({ 'Gift Card': 50, 'Saddle Fitting': 69 }));
    expect(out.html).toBe(noPrice + card('Saddle Fitting', '$69'));
  });

  it('reads the index.html card shape too', () => {
    const html =
      '<div class="service-card">\n<div class="service-name">Tune-Up</div>\n<div class="service-price">$109</div>\n</div>';
    const out = rewriteCards(html, table({ 'Tune-Up': 119 }));
    expect(out.html).toContain('<div class="service-price">$119</div>');
  });
});

describe('rewriteJsonLd', () => {
  const block = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const catalog = {
    '@type': 'OfferCatalog',
    priceRange: '$$',
    itemListElement: [
      { '@type': 'Offer', price: '109', itemOffered: { '@type': 'Service', name: 'Tune-Up' } },
      { '@type': 'Offer', price: 149, itemOffered: { '@type': 'Service', name: 'Standard Service' } },
    ],
  };

  it('moves each offer to the table price and keeps its type', () => {
    const out = rewriteJsonLd(block(catalog), table({ 'Tune-Up': 119, 'Standard Service': 159 }));
    const data = JSON.parse(out.html.replace(/<\/?script[^>]*>/g, ''));
    expect(data.itemListElement[0].price).toBe('119');
    expect(data.itemListElement[1].price).toBe(159);
    // "$$" in the JSON must survive - a string replacement would read it as a pattern.
    expect(data.priceRange).toBe('$$');
    expect(out.changes).toHaveLength(2);
  });

  it('refuses a block that is not in JSON.stringify form instead of reformatting it', () => {
    const pretty = `<script type="application/ld+json">\n${JSON.stringify(catalog, null, 2)}\n</script>`;
    const out = rewriteJsonLd(pretty, table({ 'Tune-Up': 119 }));
    expect(out.html).toBe(pretty);
    expect(out.skipped).toHaveLength(1);
  });

  it('leaves blocks with no price alone', () => {
    const faq = block({ '@type': 'FAQPage', mainEntity: [] });
    expect(rewriteJsonLd(faq, table({})).html).toBe(faq);
  });
});

describe('rewriteGeneratorDefaults', () => {
  const src = [
    "const SERVICE_KEYS = ['Tune-Up', 'Standard Service'];",
    "const SERVICE_PRICES = ['$109', '$149'];",
  ].join('\n');

  it('moves the offline fallback to the table', () => {
    const out = rewriteGeneratorDefaults(src, table({ 'Tune-Up': 119, 'Standard Service': 159 }));
    expect(out.src).toContain("const SERVICE_PRICES = ['$119', '$159'];");
    expect(out.missing).toEqual([]);
  });

  it('changes nothing when a headline service has no row', () => {
    const out = rewriteGeneratorDefaults(src, table({ 'Tune-Up': 119 }));
    expect(out.src).toBe(src);
    expect(out.missing).toEqual(['Standard Service']);
  });
});

describe('findMentions', () => {
  it('finds whole amounts only, with their line numbers', () => {
    const text = 'Tune-Up $109\nTotal $1,099\nwash $35 and $109.50\n$1090';
    expect(findMentions(text, new Set([109]))).toEqual([
      { line: 1, amount: 109, text: 'Tune-Up $109' },
      { line: 3, amount: 109, text: 'wash $35 and $109.50' },
    ]);
  });
});

describe('on the committed pages', () => {
  // The script can only be trusted with Diego's next price change if, given the
  // prices the pages already show, it changes nothing.
  for (const rel of ['index.html', 'landing.html']) {
    it(`${rel}: rewriting with its own card prices is a no-op`, () => {
      const html = read(rel);
      const own = Object.fromEntries(rewriteCards(html, () => undefined).seen.map((s) => [s.name, s.price]));
      expect(Object.keys(own).length).toBeGreaterThan(3);
      const cheapest = Number(html.match(/data-price-from="cheapest"[\s\S]*?\$(\d+)/)?.[1]);
      const out = rewriteCards(html, table(own), Number.isFinite(cheapest) ? cheapest : undefined);
      expect(out.changes).toEqual([]);
      expect(out.html).toBe(html);
    });

    it(`${rel}: every structured-data block with prices can be machine-edited`, () => {
      // A block reformatted by hand would be skipped, and its prices would go
      // stale silently the next time they change.
      expect(rewriteJsonLd(read(rel), () => undefined).skipped).toEqual([]);
    });
  }

  it('NAME_MAP is still readable out of js/live-prices.js', () => {
    const map = parseNameMap(read('js/live-prices.js'));
    expect(Object.keys(map).length).toBeGreaterThan(0);
  });
});
