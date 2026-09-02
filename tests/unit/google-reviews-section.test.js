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
//
// AND ON BOTH CLIENT SURFACES. This file used to read landing.html alone, which
// is exactly how #382 shipped the block to desktop and left the mobile SPA -
// where most clients actually arrive - still saying "Be the first to leave a
// review" under a profile that already had two 5-star reviews. CLAUDE.md's rule
// is four surfaces; the test was checking one, so it could not see the gap.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const check = read('scripts/i18n-check.mjs');
const inline = read('js/landing-inline.js');

const SURFACES = ['landing.html', 'index.html'];

// The block on one surface, from its marker to the end of its grid.
function sectionOf(file) {
  const html = read(file);
  const start = html.indexOf('<!-- ── Reviews on Google');
  expect(start, `the Google reviews block is gone from ${file}`).toBeGreaterThan(-1);
  const gridAt = html.indexOf('id="google-reviews-grid"', start);
  expect(gridAt, `no google-reviews-grid in ${file}`).toBeGreaterThan(-1);
  const end = html.indexOf('id="reviews-grid"', gridAt);
  return html.slice(start, end > -1 ? end : undefined);
}
const cardsIn = (sec) => [...sec.matchAll(/class="review-card"/g)];
// Whitespace is collapsed because prettier wraps a long <p> across lines and
// the browser collapses it back when it renders. Comparing raw text would make
// this test fail on formatting rather than on content.
const quotesIn = (sec) =>
  [...sec.matchAll(/<p style="[^"]*">([\s\S]*?)<\/p>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  );

for (const file of SURFACES) {
  describe(`${file}: the badge cannot claim more than it shows`, () => {
    const section = sectionOf(file);
    const cards = cardsIn(section);

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

  describe(`${file}: every quote is a real, declared quote`, () => {
    const section = sectionOf(file);
    const quotes = quotesIn(section);

    it('found the quotes', () => {
      expect(quotes.length).toBe(cardsIn(section).length);
    });

    // A quote lives in i18n-check's ALLOWED because it must NOT be translated -
    // somebody else's words. That list is the reviewable record of what this
    // page claims was said. Copy written here without going through it would be
    // invisible marketing text dressed as a customer's voice.
    it('each one is declared verbatim in i18n-check', () => {
      for (const quote of quotes) {
        expect(check, `not declared: "${quote.slice(0, 50)}..."`).toContain(quote);
      }
    });

    it('and the profile link is present, so the claims are checkable', () => {
      expect(section).toMatch(/href="https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9]+"/);
    });
  });
}

// Both surfaces quote the same profile, so they must quote the same reviews.
// One updated and the other not is how desktop and mobile start telling a
// visitor different things about the same business.
describe('the two surfaces agree', () => {
  it('same quotes, same order', () => {
    const [a, b] = SURFACES.map((f) => quotesIn(sectionOf(f)));
    expect(a).toEqual(b);
  });

  it('same headline count', () => {
    const counts = SURFACES.map((f) => sectionOf(f).match(/>(\d+) reviews? on Google</)[1]);
    expect(new Set(counts).size, `counts differ: ${counts.join(' vs ')}`).toBe(1);
  });
});

describe('the in-app reviews grid is untouched by this', () => {
  it('still exists on both surfaces, still filled from public_reviews', () => {
    for (const file of SURFACES) expect(read(file)).toContain('id="reviews-grid"');
    expect(inline).toContain("_sb.from('public_reviews')");
  });

  // "Be the first to leave a review" under two visible reviews contradicted
  // what the visitor could see, so it went - and nothing may still reach for it.
  it('the removed empty state is not referenced anywhere', () => {
    for (const file of SURFACES) expect(read(file)).not.toContain('id="reviews-empty"');
    expect(inline).not.toContain('reviews-empty');
    expect(read('index.html')).not.toContain("getElementById('reviews-empty')");
  });
});

// Diego reads mail at contact@. hello@ was in two places and in neither was it
// the address anyone reads - api/_security.js's BUSINESS_EMAILS already listed
// only contact@ and noreply@, so hello@ was not even recognised as our own.
describe('one contact address, not two', () => {
  const files = ['api/send-push.js', 'js/admin.js', 'landing.html', 'index.html'];

  it('nothing points at hello@ any more', () => {
    for (const f of files) {
      expect(read(f), `${f} still uses hello@`).not.toContain('hello@drbikesydney.com.au');
    }
  });

  it('and contact@ is the one the security list knows', () => {
    expect(read('api/_security.js')).toContain("'contact@drbikesydney.com.au'");
  });
});
