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
  it('is the same link on every surface - one place to change, not three', () => {
    const found = sources.flatMap(({ src }) =>
      [...src.matchAll(/https:\/\/(?:maps\.app\.goo\.gl|g\.page|search\.google\.com)\/[^\s"'<)]+/g)].map(
        (m) => m[0]
      )
    );
    expect(found.length).toBe(3); // landing, SPA, and the landing's rendered block
    expect(new Set(found).size).toBe(1); // all identical
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
