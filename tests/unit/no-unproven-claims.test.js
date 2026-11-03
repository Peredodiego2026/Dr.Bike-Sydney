// tests/unit/no-unproven-claims.test.js
//
// Diego, 3-nov-2026, asked one by one: no public liability insurance, no
// police check, no mechanic certificate - and 10 years of experience. The
// fleet numbers ("50+ bikes serviced", "2h response time", "$0 call-out") and
// business.html's "2h average on-site time" / "$0 transport cost" were not
// real either. The site said all of it, on every surface, in three languages.
//
// A claim like these is the kind nobody re-reads: it went in once and sat
// there. This keeps every one of them off every page that ships, including
// the generated ones, and pins the true replacement.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const visible = (p) => read(p).replace(/<!--[\s\S]*?-->/g, '');

const SUBURBS = ['bondi', 'cbd', 'inner-west', 'north-shore', 'northern-beaches'];
const PAGES = [
  'landing.html',
  'index.html',
  ...['', 'es/', 'zh/'].flatMap((l) => [`${l}business.html`, ...SUBURBS.map((s) => `${l}${s}.html`)]),
];

const FALSE_EN =
  /fully insured|background[- ]checked|verified mechanic|certified|qualified mechanic|qualified,|5\+ years|bikes serviced|response time|call-out for fleets|average on-site time|transport cost/i;
const FALSE_ES = /asegurado|antecedentes verificados|mecánico verificado|mecánico calificado|más de 5 años/i;
const FALSE_ZH = /投保|背景核查|技师已认证|持证技师|5 ?年以上/;

describe('no claim Diego said is untrue', () => {
  for (const page of PAGES) {
    it(page, () => {
      const html = visible(page);
      expect(html).not.toMatch(FALSE_EN);
      expect(html).not.toMatch(FALSE_ES);
      expect(html).not.toMatch(FALSE_ZH);
    });
  }

  // The blog keeps its general advice ("ask whether they are insured"); what
  // goes is what it said about us.
  it('the blog no longer calls us insured or "5+ years"', () => {
    for (const l of ['', 'es/', 'zh/']) {
      for (const post of ['how-to-choose-a-bike-mechanic-sydney', 'best-bikes-for-sydney-commuting-2026']) {
        const html = visible(`${l}blog/${post}.html`);
        expect(html, `${l}${post}`).not.toMatch(/5\+ years|insured, transparent|más de 5 años|5 年以上|5年以上|有保险保障|Experiencia, seguro/);
      }
    }
  });

  // Then Diego, same day: the general advice goes too. A post that tells
  // readers to ask about insurance, on the site of a mechanic who has none,
  // sends them to the question we can't answer. And the visit & diagnosis fee
  // is charged on its own, so "call-out included" was never true.
  it('the how-to-choose post no longer brings up insurance or an included call-out', () => {
    for (const l of ['', 'es/', 'zh/']) {
      const html = visible(`${l}blog/how-to-choose-a-bike-mechanic-sydney.html`);
      expect(html, l || 'en').not.toMatch(/insur|seguro|保险|call-out included|ya está incluida|已包含上门/i);
    }
  });

  it('the true version is on both home pages', () => {
    for (const page of ['landing.html', 'index.html']) {
      // The landing's hero says it in title case; the phone's hero became the
      // data bar (2026-11-03) and the phone says it in its chip row.
      expect(visible(page)).toMatch(/10 Years of Experience/i);
      expect(visible(page)).toContain('10 years of experience as a mechanic');
    }
    expect(visible('business.html')).toContain('<div class="stat-num">10</div><div class="stat-label">Years experience</div>');
  });
});
