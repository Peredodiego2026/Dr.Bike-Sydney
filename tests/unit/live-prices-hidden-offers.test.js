// tests/unit/live-prices-hidden-offers.test.js - Diego, 25-oct-2026: a service
// unticked in Admin has to disappear everywhere on its own, Google included.
// js/live-prices.js already hid its price card; these pin that it also drops the
// service's offer from the page's JSON-LD, in the three shapes the site ships:
//   - landing.html / index.html: hasOfferCatalog.itemListElement[].itemOffered.name
//   - suburb pages:              offers[].name, in English
//   - es/zh suburb pages:        offers[].name, translated like the card heading
// and that a page with nothing hidden is not rewritten at all.
//
// No DOM library in this repo, so the file runs in a vm context against the
// handful of DOM calls it makes. The JSON-LD below is copied from the pages.
// Run: npm test
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../../js/live-prices.js', import.meta.url), 'utf8');

const LANDING_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Dr. Bike Sydney',
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Bike Services',
    itemListElement: [
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Tune-Up' }, price: '119' },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Standard Service' }, price: '159' },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Flat Tyre Repair' }, price: '37' },
    ],
  },
});
const SUBURB_LD = (names) =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Service',
    offers: names.map(([name, price]) => ({ '@type': 'Offer', name, price })),
  });
const FAQ_LD = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] });

const card = (heading, price, dataset = {}) => {
  const h = { textContent: heading };
  const p = { textContent: price };
  return {
    dataset,
    style: {},
    hasAttribute: () => false,
    querySelector: (sel) => (sel.includes('h3') ? h : p),
  };
};

// Runs live-prices.js once against `cards` and `ld` (JSON strings) with the
// services table answering `services`; resolves to the scripts after the sync.
async function run({ cards, ld, services }) {
  const scripts = ld.map((textContent) => ({ textContent }));
  const warnings = [];
  const document = {
    readyState: 'complete',
    addEventListener: () => {},
    querySelectorAll: (sel) => (sel.includes('ld+json') ? scripts : cards),
  };
  const fetch = async () => ({ ok: true, status: 200, json: async () => services });
  const console = { warn: (m) => warnings.push(m) };
  vm.runInNewContext(SRC, { window: {}, document, fetch, console });
  await new Promise((r) => setTimeout(r, 0));
  return { scripts, warnings, offers: (i) => JSON.parse(scripts[i].textContent) };
}

const TABLE = (hiddenNames = [], nullNames = []) =>
  [
    ['Tune-Up', 119],
    ['Standard Service', 159],
    ['Standard+ Service', 209],
    ['Ultimate Overhaul', 379],
    ['Tyre / Tube Install', 37],
  ].map(([name, price]) => ({
    name,
    price,
    active: hiddenNames.includes(name) ? false : nullNames.includes(name) ? null : true,
  }));

describe('a hidden service leaves the structured data too', () => {
  it("landing's offer catalog loses it, keeps the rest, and the card is hidden", async () => {
    const tune = card('Basic Tune-Up', '$119');
    const { offers } = await run({
      cards: [tune, card('Standard Service', '$159')],
      ld: [LANDING_LD, FAQ_LD],
      services: TABLE(['Tune-Up']),
    });
    const names = offers(0).hasOfferCatalog.itemListElement.map((o) => o.itemOffered.name);
    expect(names).toEqual(['Standard Service', 'Flat Tyre Repair']);
    expect(tune.style.display).toBe('none');
    expect(offers(1)).toEqual(JSON.parse(FAQ_LD));
  });

  it('a marketing name is resolved like the cards are (Flat Tyre Repair -> Tyre / Tube Install)', async () => {
    const { offers } = await run({
      cards: [card('Flat Tyre Repair', '$37')],
      ld: [LANDING_LD],
      services: TABLE(['Tyre / Tube Install']),
    });
    const names = offers(0).hasOfferCatalog.itemListElement.map((o) => o.itemOffered.name);
    expect(names).toEqual(['Tune-Up', 'Standard Service']);
  });

  it('an English suburb page drops the offer by its catalog name', async () => {
    const { offers } = await run({
      cards: [card('Ultimate Overhaul', '$379', { service: 'Ultimate Overhaul' })],
      ld: [SUBURB_LD([['Tune-Up', '119'], ['Ultimate Overhaul', '379']])],
      services: TABLE(['Ultimate Overhaul']),
    });
    expect(offers(0).offers.map((o) => o.name)).toEqual(['Tune-Up']);
  });

  it('a translated suburb page drops it by the heading its hidden card carries', async () => {
    const { offers } = await run({
      cards: [card('Ajuste', '$119', { service: 'Tune-Up' }), card('Revisión Definitiva', '$379', { service: 'Ultimate Overhaul' })],
      ld: [SUBURB_LD([['Ajuste', '119'], ['Revisión Definitiva', '379']])],
      services: TABLE(['Tune-Up']),
    });
    expect(offers(0).offers.map((o) => o.name)).toEqual(['Revisión Definitiva']);
  });

  it('nothing hidden - and NULL is not hidden - leaves the JSON-LD byte for byte', async () => {
    const { scripts } = await run({
      cards: [card('Basic Tune-Up', '$119')],
      ld: [LANDING_LD],
      services: TABLE([], ['Tune-Up']),
    });
    expect(scripts[0].textContent).toBe(LANDING_LD);
  });

  it('unreadable structured data is left alone and said so, and the rest still syncs', async () => {
    const tune = card('Basic Tune-Up', '$119');
    const { scripts, warnings, offers } = await run({
      cards: [tune],
      ld: ['{ not json', LANDING_LD],
      services: TABLE(['Tune-Up']),
    });
    expect(scripts[0].textContent).toBe('{ not json');
    expect(warnings.some((w) => w.includes('unreadable structured data'))).toBe(true);
    expect(offers(1).hasOfferCatalog.itemListElement).toHaveLength(2);
  });
});
