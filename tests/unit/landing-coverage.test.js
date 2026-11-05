// tests/unit/landing-coverage.test.js
//
// The coverage section (conversion study, 2026-11-03, phase 2) prints the
// visit fee ladder in plain text. The ladder lives in api/_coverage.js and the
// server charges from it, so the moment the two disagree the page is quoting a
// price nobody will be charged. Every number and suburb on the page is checked
// against the module here instead of against a copy of it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  BASE,
  FEE_BANDS,
  PENINSULA_FAR_FEE,
  PENINSULA_FAR_SUBURBS,
  PERIMETER_MAX_MINUTES,
  feeForMinutes,
} from '../../api/_coverage.js';
import { MEASURED_MINUTES } from '../../api/chat.js';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const landing = read('landing.html');
const inline = read('js/landing-inline.js');

const a = landing.indexOf('<section id="coverage"');
const section = landing.slice(a, landing.indexOf('</section>', a));
const row = (fee) => {
  const m = section.match(
    new RegExp(
      `<li>\\s*<div><strong>([^<]+)</strong><span>([^<]+)</span></div>\\s*<b data-fee="${fee}">([^<]+)</b>`
    )
  );
  expect(m, `row ${fee} is missing`).toBeTruthy();
  return { title: m[1], places: m[2], price: m[3] };
};
const placesIn = (text) =>
  text
    .replace(/ and /g, ', ')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

describe('the coverage section quotes the fees the server charges', () => {
  it('exists, between the team and the plans', () => {
    expect(a).toBeGreaterThan(landing.indexOf('<section id="mechanics"'));
    expect(a).toBeLessThan(landing.indexOf('<section id="memberships"'));
  });

  // Three bands from 5-nov-2026: each row names its band's minutes and fee.
  it('the first band', () => {
    expect(row('near').price).toBe(`$${FEE_BANDS[0].fee}`);
    expect(row('near').title).toBe(`Up to ${FEE_BANDS[0].maxMinutes} minutes`);
  });

  it('the middle band', () => {
    expect(row('mid').price).toBe(`$${FEE_BANDS[1].fee}`);
    expect(row('mid').title).toBe(
      `${FEE_BANDS[0].maxMinutes} to ${FEE_BANDS[1].maxMinutes} minutes`
    );
  });

  // Every suburb a row names was measured, and pays that row's fee. "Manly to
  // Mona Vale and Terrey Hills" stayed on the $35 row for a while after
  // neither was $35 any more - this is what stops that.
  it.each(['near', 'mid', 'perimeter'])('every suburb on the %s row pays its fee', (key) => {
    const { places, price } = row(key);
    const minutesOf = new Map(MEASURED_MINUTES.map(([n, m]) => [n.toLowerCase(), m]));
    for (const place of placesIn(places)) {
      const name = place === 'the cbd' ? 'sydney cbd' : place;
      expect(minutesOf.has(name), `${place} was never measured`).toBe(true);
      expect(`$${feeForMinutes(minutesOf.get(name))}`, place).toBe(price);
    }
  });

  it('the far peninsula: its own fee, and only suburbs the module knows', () => {
    expect(row('peninsula').price).toBe(`$${PENINSULA_FAR_FEE}`);
    for (const place of placesIn(row('peninsula').places)) {
      expect(PENINSULA_FAR_SUBURBS.has(place), `${place} is not a far-peninsula suburb`).toBe(true);
    }
  });

  it('the perimeter: the last band, and the same number of minutes', () => {
    expect(row('perimeter').price).toBe(`$${FEE_BANDS.at(-1).fee}`);
    expect(row('perimeter').title).toBe(
      `${FEE_BANDS.at(-2).maxMinutes} to ${PERIMETER_MAX_MINUTES} minutes`
    );
  });

  // Past the perimeter resolveCoverage() returns no fee and the booking ends in
  // a quote request with no card - so the page must not print a price there.
  it('further out: no price, a quote', () => {
    expect(row('quote').price).toBe('Quote');
    expect(row('quote').places).toMatch(/Nothing is charged online/);
  });

  // Production, 3-nov-2026: "Hornsby NSW 2077" measured 52 real minutes and
  // came back as a quote, while the page listed it under $55. The router is
  // the authority, so the copy moved - here and in the FAQ of both pages.
  it('Hornsby is with the quotes, not under the perimeter fee', () => {
    expect(row('perimeter').places).not.toContain('Hornsby');
    expect(row('quote').places).toContain('Hornsby');
    for (const html of [landing, read('index.html')]) {
      expect(html).not.toMatch(/North Shore, Hornsby, the CBD/);
    }
  });

  // Where the van starts its day is where Diego lives.
  it('never names the base suburb', () => {
    expect(section).not.toContain(BASE.suburb);
  });

  it('its button is the fee check the hero opens', () => {
    expect(section).toContain('<button id="coverage-fee-btn"');
    expect(inline).toMatch(
      /getElementById\('coverage-fee-btn'\);\s*if \(coverageFeeBtn\) coverageFeeBtn\.addEventListener\('click', openFeeCheckModal\);/
    );
  });
});
