// tests/unit/guarantee.test.js
//
// Until 3-nov-2026 the business promised three different guarantees at once:
// the terms said 3 days, the chatbot said 30 days and the pages said "100%
// satisfaction", which nobody can prove. Diego set the real one: 14 days of
// free repair for what we left wrong, not after repeated off-road riding.
// Every place that states it is pinned here, so the next change moves all of
// them or fails.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const terms = read('terms.html');
const claims = read('claims.html');
const chat = read('api/chat.js');
const landing = read('landing.html');
const index = read('index.html');

describe('one guarantee, 14 days, everywhere it is stated', () => {
  it('the terms: section 16 is 14 days in all three languages, and has an anchor', () => {
    expect(terms).toContain('<h2 id="warranty" data-i18n="s16-h">');
    expect(terms).toContain('<strong>14-day warranty window.</strong>');
    expect(terms).toContain('<strong>Ventana de garantía de 14 días.</strong>');
    expect(terms).toContain('<strong>14天保修期。</strong>');
    expect(terms).not.toMatch(/3-day warranty|garantía de 3 días|3天保修/);
  });

  // Diego extended the free repair, not the refund.
  it('the refund window stays at 3 days', () => {
    expect(terms).toContain('If you would prefer a refund instead, ask within 3 days of your service');
  });

  it('the claims page asks for 14 days', () => {
    expect(claims).toContain('Tell us within 14 days');
    expect(claims).not.toMatch(/within 3 days|los 3 días|3天内/);
  });

  it('the chatbot quotes 14 days, never 30', () => {
    expect(chat).toContain('GUARANTEE: 14-day workmanship guarantee.');
    expect(chat).not.toMatch(/30-day satisfaction/);
  });

  it('both pages show it under "How it works" and link to the terms', () => {
    for (const html of [landing, index]) {
      expect(html).toContain('14-day workmanship guarantee');
      expect(html).toContain('href="/terms.html#warranty"');
      // Comments may tell the history; the page must not say it.
      expect(html.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/Satisfaction guaranteed|100% Satisfaction/);
    }
  });

  // Phase 3 of the conversion study: claims with no number behind them. The
  // hero already shows the live Google rating (#hero-proof), so a hand-typed
  // "5 Star Rated" beside it could only ever go stale; the guarantee is ours
  // to state.
  // index.html's hero traded its three words for the data bar on 2026-11-03
  // (the phone redesign Diego approved: live rating, Tune-Up price, visit fee),
  // so on the phone the guarantee is the chip just above the hero.
  it('the hero states the guarantee, not a hand-typed rating', () => {
    for (const html of [landing, index]) {
      const page = html.replace(/<!--[\s\S]*?-->/g, '');
      expect(page).toMatch(
        html === landing
          ? /<\/svg>\s*14-Day Guarantee\s*<\/div>/
          : /<\/svg>\s*14-day guarantee\s*<\/span>/
      );
      expect(page).not.toContain('5 Star Rated');
      expect(page).not.toMatch(/hundreds of satisfied/i);
    }
  });

  it('no generated page promises "100% satisfaction" any more', () => {
    for (const file of ['scripts/generate-suburb-pages.mjs', 'business.html', 'cbd.html', 'es/cbd.html', 'zh/cbd.html']) {
      expect(read(file), file).not.toMatch(/100% Satisfaction|Satisfaction guarantee|100% de satisfacción|100% 满意/);
    }
  });
});
