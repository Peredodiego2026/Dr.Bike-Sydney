// tests/unit/google-reviews-section.test.js
//
// landing.html once carried three fabricated testimonials labelled "Google
// Review" - invented names, invented quotes. They were removed as a real ACCC
// risk and replaced by the public_reviews view, which shows only reviews
// clients actually left in the app (scripts/create-public-reviews-view.sql).
//
// This section brings Google reviews back, but by hand and quoted verbatim,
// because the Places API caps at five reviews Google picks and costs a Cloud
// account. Hand-written means a human can get it wrong, so the things that
// would turn it back into the old problem are pinned here:
//
//   - the count on the badge has to match the cards actually shown;
//   - every quote has to be a declared verbatim quote, not free-form copy;
//   - the link to the real profile has to be there, so any claim is checkable.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const landing = read('landing.html');
const check = read('scripts/i18n-check.mjs');
const inline = read('js/landing-inline.js');

// The block, from its marker to the end of its grid.
const section = (() => {
  const start = landing.indexOf('<!-- ── Reviews on Google');
  expect(start, 'the Google reviews block is gone').toBeGreaterThan(-1);
  const gridAt = landing.indexOf('id="google-reviews-grid"', start);
  expect(gridAt).toBeGreaterThan(-1);
  return landing.slice(start, landing.indexOf('<div id="reviews-grid"', gridAt));
})();

const cards = [...section.matchAll(/class="review-card"/g)];
const quotes = [...section.matchAll(/<p style="[^"]*">([^<]+)<\/p>/g)].map((m) => m[1].trim());

describe('the badge cannot claim more than it shows', () => {
  it('renders at least one review', () => {
    expect(cards.length).toBeGreaterThan(0);
  });

  // "2 reviews on Google" over three cards, or over one, is the page lying
  // about its own content - the exact failure the fabricated cards were.
  it('the count in the link matches the number of cards', () => {
    const m = section.match(/>(\d+) reviews? on Google</);
    expect(m, 'the "N reviews on Google" link is gone').not.toBeNull();
    expect(Number(m[1])).toBe(cards.length);
  });

  it('every card shows five stars, matching the 5.0 headline', () => {
    expect(section).toContain('>5.0<');
    const starRuns = [...section.matchAll(/aria-label="5 out of 5 stars"/g)];
    // One per card, plus the headline.
    expect(starRuns.length).toBe(cards.length + 1);
  });
});

describe('every quote is a real, declared quote', () => {
  it('found the quotes', () => {
    expect(quotes.length).toBe(cards.length);
  });

  // A quote lives in i18n-check's ALLOWED because it must NOT be translated -
  // somebody else's words. That list is the reviewable record of what this page
  // claims was said. Copy written here without going through it would be
  // invisible marketing text dressed as a customer's voice.
  for (const quote of quotes) {
    it(`"${quote.slice(0, 40)}..." is declared verbatim in i18n-check`, () => {
      expect(check).toContain(quote);
    });
  }

  it('and the profile link is present, so the claims are checkable', () => {
    expect(section).toMatch(/href="https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9]+"/);
  });
});

describe('the in-app reviews grid is untouched by this', () => {
  it('still exists and is still filled from public_reviews', () => {
    expect(landing).toContain('id="reviews-grid"');
    expect(inline).toContain("_sb.from('public_reviews')");
  });

  // "Be the first to leave a review" under two visible reviews contradicted
  // what the visitor could see, so it went - and nothing may still reach for it.
  it('the removed empty state is not referenced anywhere', () => {
    expect(landing).not.toContain('id="reviews-empty"');
    expect(inline).not.toContain('reviews-empty');
  });
});
