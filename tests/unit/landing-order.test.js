// tests/unit/landing-order.test.js
//
// Conversion study, 2026-11-03. The desktop page asked for a $67-$197 a month
// plan in its fifth block, showed its only real proof (the Google reviews) in
// the eighth, and never showed a service price at all outside a modal. A
// visitor asks, roughly in this order: what is it, what does it cost, can I
// trust it, how does it work. Phase 1 puts the blocks that already existed in
// that order - nothing here is new copy.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const landing = read('landing.html');
const landingCss = read('css/landing.css');
const index = read('index.html');
const app = read('js/app.js');
const inline = read('js/landing-inline.js');

const pos = (html, needle) => {
  const i = html.indexOf(needle);
  expect(i, `${needle} is missing`).toBeGreaterThan(-1);
  return i;
};
const inOrder = (html, needles) => {
  const at = needles.map((n) => pos(html, n));
  expect(at).toEqual([...at].sort((a, b) => a - b));
};
const sectionOf = (html, open) => {
  const a = pos(html, open);
  return html.slice(a, html.indexOf('</section>', a));
};

describe('desktop: the price and the proof come before the asks', () => {
  it('hero, prices, reviews, how it works - then the team and the plans', () => {
    inOrder(landing, [
      '<section class="hero">',
      '<section id="services"',
      '<section id="reviews"',
      'Simple 4-Step Process',
      '<section id="mechanics"',
      '<section id="memberships"',
    ]);
  });

  // The modal still has all of them; the page shows the six the phone shows.
  it('six prices are on the page, in the card shape every price tool reads', () => {
    const s = sectionOf(landing, '<section id="services"');
    expect((s.match(/class="svc-card"/g) || []).length).toBe(6);
    expect(s).toMatch(/data-price-from="cheapest">[\s\S]*?class="svc-name">Repairs</);
    expect(s).toContain('id="home-view-all-btn"');
  });

  // "Repairs" is a category. Opening the wizard with it would preselect
  // nothing, so its button opens the full list - and it has to bail out
  // BEFORE the line that opens the wizard.
  it('the Repairs card opens the list, not an empty wizard', () => {
    const s = sectionOf(landing, '<section id="services"');
    expect(s).toMatch(/class="svc-btn" data-open-services>/);
    const handler = inline.slice(inline.indexOf("document.querySelectorAll('.svc-btn')"));
    expect(handler.indexOf("hasAttribute('data-open-services')")).toBeGreaterThan(-1);
    expect(handler.indexOf("hasAttribute('data-open-services')")).toBeLessThan(
      handler.indexOf('openBooking(')
    );
  });
});

describe('desktop: one main action in the hero', () => {
  it('Book a Service, and the fee check as the second - nothing else', () => {
    const hero = sectionOf(landing, '<section class="hero">');
    const btns = hero.slice(hero.indexOf('<div class="hero-btns">'));
    const ids = [...btns.slice(0, btns.indexOf('</div>')).matchAll(/<button id="([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(ids).toEqual(['hero-book-btn', 'hero-fee-btn']);
    expect(landing).not.toContain('id="hero-services-btn"');
  });

  it('the moving trust bar is gone, markup and styles', () => {
    expect(landing).not.toContain('trust-marquee');
    expect(landingCss).not.toContain('trust-marquee');
  });

  // It asked for other fields than the wizard and then opened the wizard.
  it('there is one way to book, not two', () => {
    expect(landing).not.toMatch(/lform-/);
    expect(inline).not.toMatch(/lform-/);
  });
});

describe('the real rating, on the first screen of both pages', () => {
  for (const [name, html] of [
    ['landing.html', landing],
    ['index.html', index],
  ]) {
    it(`${name} carries it inside the hero, hidden until there is data`, () => {
      const hero = sectionOf(html, '<section class="hero">');
      expect(hero).toMatch(/<p id="hero-proof"[^>]*hidden>/);
      for (const part of ['hero-proof__stars', 'hero-proof__rating', 'hero-proof__count']) {
        expect(hero).toContain(`class="${part}"`);
      }
      // Empty in the HTML: a number typed here would go stale the day of the
      // next review, which is exactly what happened to the old "2 reviews".
      expect(hero).toMatch(/class="hero-proof__rating"[^>]*><\/span>/);
    });
  }

  // "5.0" with no count behind it proves nothing, and "0 reviews" proves the
  // opposite - so it needs both before it shows.
  it('js/app.js shows it only with a rating AND a count', () => {
    expect(app).toMatch(/if \(proof && g\.rating && g\.count\) \{/);
    expect(app).toMatch(/proof\.hidden = false;/);
  });
});

describe('phone: reviews third, after the prices', () => {
  it('services, reviews, how it works', () => {
    inOrder(index, [
      '<section class="hero">',
      '<section id="services"',
      '<section id="reviews"',
      '<section id="how-it-works"',
    ]);
  });

  it('and nothing else about the order moved', () => {
    inOrder(index, [
      '<section id="how-it-works"',
      '<section id="shop-band"',
      '<section id="about"',
      '<section id="recent-work"',
      '<section id="memberships"',
      '<section id="faq"',
    ]);
  });
});
