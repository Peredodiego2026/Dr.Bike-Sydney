// tests/unit/consent-script-order.test.js
//
// Accepting cookies threw `Sentry is not defined` out of consent.js:96, and
// error monitoring was dead for every visitor who accepted.
//
// js/consent.js revives the gated <script> tags by cloning them. A script built
// with document.createElement() is async BY DEFAULT - the attribute is not
// needed and copying attributes does not change it - so the cloned Sentry
// LOADER was still in flight when the cloned Sentry INIT block, which sits
// after it in the document, executed. The loop's own comment said "Order is
// preserved by inserting each clone where the placeholder sat": it preserved
// position, not execution order.
//
// This runs the real loop out of the real file against a minimal fake DOM,
// because the invariant is behavioural: what matters is the flag on the node
// that gets inserted, not the text of the line that sets it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../js/consent.js', import.meta.url), 'utf8');

// Pull enableAnalytics' body out of the shipped file. Testing a copy would
// pass forever after someone edited the original.
function enableAnalyticsBody() {
  const start = src.indexOf('function enableAnalytics() {');
  expect(start, 'enableAnalytics not found - fix this extractor').toBeGreaterThan(-1);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced braces walking enableAnalytics');
}

// The smallest DOM the loop touches. Nodes record the order they were inserted
// so the test can assert on it.
function fakeDom(tags) {
  const inserted = [];
  const parent = {
    insertBefore: (node) => inserted.push(node),
    removeChild: () => {},
  };
  const nodes = tags.map((t) => ({
    src: t.src || '',
    textContent: t.text || '',
    attributes: Object.entries({
      type: 'text/plain',
      'data-consent': 'analytics',
      ...(t.src ? { src: t.src } : {}),
      ...(t.async ? { async: '' } : {}),
    }).map(([name, value]) => ({ name, value })),
    hasAttribute(name) {
      return this.attributes.some((a) => a.name === name);
    },
    parentNode: parent,
  }));
  const document = {
    querySelectorAll: () => nodes,
    createElement: () => ({
      attrs: {},
      async: true, // the browser default for a created script
      setAttribute(n, v) {
        this.attrs[n] = v;
        if (n === 'src') this.src = v;
        if (n === 'async') this.async = true;
      },
    }),
  };
  return { document, inserted };
}

function run(tags) {
  const { document, inserted } = fakeDom(tags);
  // eslint-disable-next-line no-new-func
  new Function('document', 'gtag', enableAnalyticsBody())(document, () => {});
  return inserted;
}

describe('reviving the gated scripts keeps them in order', () => {
  // Exactly the two tags landing.html and index.html carry, in document order.
  const SENTRY = [
    { src: 'https://js-de.sentry-cdn.com/abc.min.js' },
    { text: 'Sentry.onLoad(function () { Sentry.init({}); });' },
  ];

  it('the loader is not left async, so it runs before the init that needs it', () => {
    const [loader, init] = run(SENTRY);
    expect(loader.src).toBe('https://js-de.sentry-cdn.com/abc.min.js');
    expect(loader.async).toBe(false);
    expect(init.text).toContain('Sentry.init');
  });

  it('and both are still inserted, in document order', () => {
    const out = run(SENTRY);
    expect(out).toHaveLength(2);
    expect(out[0].src).toContain('sentry-cdn');
    expect(out[1].src).toBeUndefined();
  });

  // Google Analytics' loader carries async on purpose and needs no ordering:
  // gtag() is defined by the inline block, not by the loader. Forcing it to
  // block would be a regression in page speed for no benefit.
  it('a tag that asked to be async stays async', () => {
    const [loader] = run([
      { src: 'https://www.googletagmanager.com/gtag/js?id=G-X', async: true },
      { text: "gtag('config', 'G-X');" },
    ]);
    expect(loader.async).toBe(true);
  });

  it('an inline-only block still gets its code', () => {
    const [only] = run([{ text: "console.log('hi');" }]);
    expect(only.text).toBe("console.log('hi');");
    expect(only.async).toBe(true); // untouched: nothing to order against
  });
});

describe('the pages still declare the pair the fix depends on', () => {
  const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

  for (const page of ['landing.html', 'index.html']) {
    it(`${page} has the Sentry loader before the Sentry init`, () => {
      const html = read(page);
      const loader = html.indexOf('js-de.sentry-cdn.com');
      const init = html.indexOf('Sentry.onLoad(');
      expect(loader).toBeGreaterThan(-1);
      expect(init).toBeGreaterThan(-1);
      // Order is what consent.js now preserves; if these ever swap, the fix
      // above stops helping and the page throws again on accept.
      expect(loader).toBeLessThan(init);
    });
  }
});
