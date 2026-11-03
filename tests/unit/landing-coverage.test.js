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
  NORTH_NEAR_FEE,
  NORTH_NEAR_SUBURBS,
  PENINSULA_FAR_FEE,
  PENINSULA_FAR_SUBURBS,
  PERIMETER_MAX_MINUTES,
} from '../../api/_coverage.js';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const landing = read('landing.html');
const inline = read('js/landing-inline.js');

const a = landing.indexOf('<section id="coverage"');
const section = landing.slice(a, landing.indexOf('</section>', a));
const row = (fee) => {
  const m = section.match(
    new RegExp(`<li>\\s*<div><strong>([^<]+)</strong><span>([^<]+)</span></div>\\s*<b data-fee="${fee}">([^<]+)</b>`)
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

  it('home corridor: the first band', () => {
    expect(row('near').price).toBe(`$${FEE_BANDS[0].fee}`);
    // Terrey Hills is past the first band by the clock; it is on this row
    // because NORTH_NEAR prices it at the first band's fee.
    expect(NORTH_NEAR_FEE).toBe(FEE_BANDS[0].fee);
    expect(row('near').places).toContain('Terrey Hills');
    expect(NORTH_NEAR_SUBURBS.has('terrey hills')).toBe(true);
  });

  it('the far peninsula: its own fee, and only suburbs the module knows', () => {
    expect(row('peninsula').price).toBe(`$${PENINSULA_FAR_FEE}`);
    for (const place of placesIn(row('peninsula').places)) {
      expect(PENINSULA_FAR_SUBURBS.has(place), `${place} is not a far-peninsula suburb`).toBe(true);
    }
  });

  it('the perimeter: the last band, and the same number of minutes', () => {
    expect(row('perimeter').price).toBe(`Up to $${FEE_BANDS.at(-1).fee}`);
    expect(row('perimeter').title).toContain(String(PERIMETER_MAX_MINUTES));
  });

  // Past the perimeter resolveCoverage() returns no fee and the booking ends in
  // a quote request with no card - so the page must not print a price there.
  it('further out: no price, a quote', () => {
    expect(row('quote').price).toBe('Quote');
    expect(row('quote').places).toMatch(/Nothing is charged online/);
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
