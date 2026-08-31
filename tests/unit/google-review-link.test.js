// tests/unit/google-review-link.test.js
//
// The "Leave us a review" button pointed at https://g.page/r/drbikesydney/review
// and had done for months. Diego clicked it on 2026-08-25, about to send it to
// his first real customers, and it landed on plain www.google.com - Google
// retired custom short names like `drbikesydney` in 2022, and the link had
// been quietly dead ever since.
//
// Nothing caught it because a dead Google link still answers HTTP 200: it just
// redirects to the home page. The only signal was clicking it.
//
// This does not prove the link resolves - a test cannot, without hitting
// Google on every run. It pins the SHAPE: the working link is an opaque
// Google-issued id, and the format that broke was one built from the business
// name. If somebody types a friendly-looking URL here again, this fails.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SURFACES = ['js/app.js', 'js/landing-inline.js', 'landing.html'];
const sources = SURFACES.map((f) => ({ file: f, src: readFileSync(join(root, f), 'utf8') }));

describe('the Google review link', () => {
  // Was an exact count of 3. That broke the moment the link was used a fourth
  // time legitimately (the Google reviews badge on the landing), while a count
  // never checked the thing that matters - three copies could all sit in one
  // file and two surfaces could have none. Per-surface presence plus global
  // identity is what "one place to change" actually means.
  const linksIn = (src) =>
    [...src.matchAll(/https:\/\/(?:maps\.app\.goo\.gl|g\.page|search\.google\.com)\/[^\s"'<)]+/g)].map(
      (m) => m[0]
    );

  it('is present on every surface', () => {
    for (const { file, src } of sources) {
      expect(linksIn(src).length, `${file} has no Google review link`).toBeGreaterThan(0);
    }
  });

  it('and every occurrence is the same link', () => {
    const found = sources.flatMap(({ src }) => linksIn(src));
    expect(found.length).toBeGreaterThanOrEqual(sources.length);
    expect(new Set(found).size, `found ${[...new Set(found)].join(' AND ')}`).toBe(1);
  });

  it('never goes back to a name-based short link, which is the format Google killed', () => {
    for (const { file, src } of sources) {
      expect(src, `${file} still has a retired g.page short name`).not.toMatch(
        /g\.page\/r\/[a-z]+\/review/i
      );
    }
  });

  it('uses an opaque Google-issued id, not the business name', () => {
    const [{ src }] = sources;
    const url = src.match(/https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9]+/)[0];
    const id = url.split('/').pop();
    expect(id.length).toBeGreaterThanOrEqual(10);
    // a readable word here means somebody hand-wrote it again
    expect(id.toLowerCase()).not.toContain('drbike');
    expect(id.toLowerCase()).not.toContain('sydney');
  });
});
