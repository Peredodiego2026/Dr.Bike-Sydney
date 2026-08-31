// tests/unit/consent-script-order.test.js
//
// Accepting cookies threw `Sentry is not defined`, and error monitoring was
// dead for exactly the visitors who opted in.
//
// js/consent.js revives the gated <script> tags by cloning them. Sentry shipped
// as TWO gated tags - a loader with src, and an inline block calling
// Sentry.onLoad(). A cloned <script src> fetches asynchronously; a cloned INLINE
// script runs the instant it is inserted. The init always won that race.
//
// The first fix set async=false on the cloned loader, and this file asserted
// that flag. It passed while production still threw: async=false orders src
// scripts against EACH OTHER, and an inline script never waits for any of them.
// Asserting the flag was asserting the belief, not the behaviour.
//
// The real fix is structural - one gated block that loads the SDK itself and
// initialises inside its onload, the only thing that means "the SDK has run".
// That is what these tests pin, by structure, since the race cannot be
// reproduced in a fake DOM.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../js/consent.js', import.meta.url), 'utf8');
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const PAGES = ['landing.html', 'index.html'];

const gatedBlocks = (html) =>
  [
    ...html.matchAll(/<script type="text\/plain" data-consent="analytics">([\s\S]*?)<\/script>/g),
  ].map((m) => m[1]);

describe('Sentry does not race its own loader', () => {
  for (const page of PAGES) {
    const html = read(page);

    it(`${page} has exactly one Sentry block`, () => {
      const blocks = gatedBlocks(html).filter((b) => b.includes('Sentry.init('));
      expect(blocks).toHaveLength(1);
    });

    // The separate loader tag is what created the race. Its absence is the fix.
    it(`${page} has no standalone Sentry loader tag`, () => {
      const loaderTags = [...html.matchAll(/<script[^>]*\bsrc="[^"]*sentry-cdn[^"]*"[^>]*>/g)];
      expect(loaderTags).toHaveLength(0);
    });

    it(`${page} loads the SDK in-block and inits inside its onload`, () => {
      const block = gatedBlocks(html).find((b) => b.includes('Sentry.init('));
      expect(block).toContain('createElement(');
      expect(block).toContain('sentry-cdn.com');
      const onload = block.indexOf('s.onload');
      expect(onload, 'the block never sets onload').toBeGreaterThan(-1);
      // Every use of the global must sit after - and so inside - onload.
      for (const m of block.matchAll(/\bSentry\./g)) {
        expect(m.index, `a Sentry.* call at ${m.index} sits outside onload`).toBeGreaterThan(onload);
      }
    });
  }
});

describe('consent.js still orders the src clones it does control', () => {
  // Correct on its own terms and worth keeping - it just was never what fixed
  // Sentry, and the comment above it now says so.
  it('keeps cloned src scripts in document order', () => {
    expect(src).toContain("if (s.src && !old.hasAttribute('async')) s.async = false;");
  });

  it('and leaves a tag that asked to be async alone', () => {
    expect(src).toContain("!old.hasAttribute('async')");
    // Google Analytics' loader carries async on purpose.
    expect(read('index.html')).toMatch(/data-consent="analytics" async src="[^"]*googletagmanager/);
  });

  // The claim that used to live here was false. Keep it from coming back as a
  // comment that misleads the next reader.
  it('does not claim async=false orders inline scripts', () => {
    const start = src.indexOf('// A script built with createElement()');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('if (s.src &&', start));
    expect(block).toMatch(/does NOT do|never waits|runs the instant/i);
  });
});
