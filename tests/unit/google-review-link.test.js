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
// This does not prove a link resolves - a test cannot, without hitting Google
// on every run. It pins the SHAPE, and since 2026-09-10 it pins the ROLE.
//
// TWO LINKS, TWO JOBS
//
// Until 2026-09-10 there was one link everywhere and this file asserted that
// every occurrence was identical. That was the wrong invariant: one URL was
// doing two different jobs, and it was only right for one of them.
//
//   READ   "5.0 - 2 reviews on Google"     the visitor wants to READ them.
//          -> the Maps listing. Correct, unchanged.
//
//   WRITE  "Leave a Google Review"         the client just gave 5 stars in the
//          "Leave us a review"             app and wants to WRITE one.
//          "Also leave a Google review?"   -> has to open the review box.
//
// The write CTAs pointed at the listing, which drops the client on a screen
// offering Directions, Call, Website, Photos and Save, where they still have to
// find "Reviews" and then "Write a review". The review request goes out ONCE
// per job (api/_completion-notify.js - the daily retry re-sends deliveries that
// FAILED, never ones the client ignored), so a tap lost there is a review lost
// for good. With 2 reviews against a neighbouring competitor's 11, that is the
// whole point of the feature.
//
// The write link comes from Google Business Profile > "Pedir una resena", and
// was verified on 2026-09-10 by following it:
//
//   https://g.page/r/CbDo2zM02zFaEBM/review
//     -> search.google.com/local/writereview?placeid=ChIJb5jxLY1G_yQRsOjbMzTbMVo
//
// The sign-in wall in between is Google's, not ours: leaving a review requires
// an account. A client already signed in lands on the stars.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// index.html carries the READ link only: the SPA's "leave a review" CTA is
// built in js/app.js, not in the page.
const SURFACES = ['js/app.js', 'js/landing-inline.js', 'landing.html', 'index.html'];
const sources = SURFACES.map((f) => ({ file: f, src: readFileSync(join(root, f), 'utf8') }));

const LINK_RE = /https:\/\/(?:maps\.app\.goo\.gl|g\.page|search\.google\.com)\/[^\s"'<)]+/g;

// Which job each occurrence is doing, decided by the label that follows the
// href rather than by a hand-kept list of file:line - a list like that goes
// stale the first time somebody moves a block.
//
// The inline styles and the four-path Google logo SVG sit BETWEEN the href and
// its label, and they are long: a plain 400-character window reached the end of
// a `style="..."` and never got to the words. They get stripped first, so the
// window is measured in text rather than in markup. Found by printing the
// windows instead of trusting them - the first version of this classified all
// three write CTAs as 'unknown' and still went green on two assertions.
const LABEL_WINDOW = 1500;
const textAfter = (src, at) =>
  src
    .slice(at, at + LABEL_WINDOW)
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/style\s*=\s*"[^"]*"/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

// 'write' is tested first on purpose: a read label never contains a write
// phrase, but a window can run past the end of its own anchor.
function occurrences(src) {
  const out = [];
  for (const m of src.matchAll(LINK_RE)) {
    const after = textAfter(src, m.index);
    const role = /leave (a|us a) (quick )?google review|leave us a review|also leave a google review/.test(
      after
    )
      ? 'write'
      : /reviews? on google/.test(after)
        ? 'read'
        : 'unknown';
    out.push({ url: m[0], role });
  }
  return out;
}

const all = sources.flatMap(({ file, src }) => occurrences(src).map((o) => ({ ...o, file })));

describe('the Google review link', () => {
  it('the role detection works at all', () => {
    // Without this, a label edit that defeats the regex would turn every
    // occurrence into 'unknown' and the assertions below would pass over an
    // empty set. A guard that cannot fail proves nothing.
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.filter((o) => o.role === 'write').length).toBeGreaterThanOrEqual(3);
    expect(all.filter((o) => o.role === 'read').length).toBeGreaterThanOrEqual(2);
  });

  it('classifies every occurrence - none left unknown', () => {
    const unknown = all.filter((o) => o.role === 'unknown');
    expect(
      unknown.map((o) => `${o.file}: ${o.url}`),
      'a Google link with no recognisable label - relabel it, or teach this test'
    ).toEqual([]);
  });

  it('is present on every surface', () => {
    for (const { file, src } of sources) {
      expect(occurrences(src).length, `${file} has no Google link`).toBeGreaterThan(0);
    }
  });

  it('every WRITE cta opens the review box, not the listing', () => {
    for (const o of all.filter((x) => x.role === 'write')) {
      expect(o.url, `${o.file} sends a review-writer to the listing`).toMatch(
        /^https:\/\/(g\.page\/r\/[^/]+\/review|search\.google\.com\/local\/writereview\?)/
      );
    }
  });

  it('every READ link goes to the listing, where the reviews are', () => {
    for (const o of all.filter((x) => x.role === 'read')) {
      expect(o.url, `${o.file} sends a reader to the write box`).toMatch(
        /^https:\/\/maps\.app\.goo\.gl\//
      );
    }
  });

  it('there is one link per role, not one per file', () => {
    for (const role of ['write', 'read']) {
      const found = new Set(all.filter((o) => o.role === role).map((o) => o.url));
      expect(found.size, `${role}: found ${[...found].join(' AND ')}`).toBe(1);
    }
  });

  it('never goes back to a name-based short link, which is the format Google killed', () => {
    for (const { file, src } of sources) {
      expect(src, `${file} still has a retired g.page short name`).not.toMatch(
        /g\.page\/r\/[a-z]+\/review/i
      );
    }
  });

  it('both use an opaque Google-issued id, not the business name', () => {
    for (const o of all) {
      // The id is the last meaningful segment: the code in
      // g.page/r/<id>/review, and the one after the slash in
      // maps.app.goo.gl/<id>.
      const id = o.url
        .replace(/\/review\/?$/, '')
        .split('/')
        .pop();
      expect(id.length, `${o.file}: ${o.url}`).toBeGreaterThanOrEqual(10);
      // a readable word here means somebody hand-wrote it again
      expect(id.toLowerCase()).not.toContain('drbike');
      expect(id.toLowerCase()).not.toContain('sydney');
    }
  });
});
