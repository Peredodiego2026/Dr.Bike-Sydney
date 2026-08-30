// tests/unit/cookie-consent.test.js
//
// Audit point 7. Google Analytics, PostHog and Sentry session replay all
// started on page load across 44 pages, before anybody agreed to anything, and
// there was no banner at all. Session replay records what the visitor does on
// screen; starting that unasked is not a technicality.
//
// WHY THE BLOCK IS A BLOCK AND NOT JUST CONSENT MODE
//
// Google's Consent Mode stops GA writing cookies, but the script still loads
// and still talks to Google, and it does nothing for PostHog or Sentry. So
// every analytics tag ships as <script type="text/plain" data-consent="analytics">,
// which no browser executes, and js/consent.js rewrites them into real scripts
// only once consent exists. Nothing to un-send, because nothing was sent.
// Consent Mode is declared on top of that, defaulting to denied, so a tag
// added later without the wrapper degrades to cookieless rather than tracked.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const consent = read('js/consent.js');
const gate = read('scripts/consent-gate.mjs');

function htmlFiles(dir = '.', acc = []) {
  const abs = path.join(new URL(root).pathname.replace(/^\/([A-Za-z]:)/, '$1'), dir);
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', '.git', 'tests', '.claude'].includes(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(rel, acc);
    else if (e.name.endsWith('.html')) acc.push(rel.replace(/\\/g, '/'));
  }
  return acc;
}

const pages = htmlFiles();
const VENDORS = /googletagmanager\.com|sentry-cdn\.com|connect\.facebook\.net/;

describe('no analytics runs before the visitor agrees', () => {
  it('found the pages to check', () => {
    expect(pages.length).toBeGreaterThan(40);
  });

  // The whole point of the audit finding. One page left ungated is one page
  // that still tracks silently, and it would be invisible.
  it('every analytics tag on every page is inert', () => {
    const live = [];
    for (const p of pages) {
      const html = read(p);
      for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
        const attrs = m[1];
        if (!VENDORS.test(attrs)) continue;
        if (!/data-consent="analytics"/.test(attrs)) live.push(`${p}: ${attrs.trim()}`);
      }
    }
    expect(live).toEqual([]);
  });

  it('every page that has analytics also loads the consent gate', () => {
    const missing = pages.filter(
      (p) => read(p).includes('data-consent="analytics"') && !read(p).includes('/js/consent.js')
    );
    expect(missing).toEqual([]);
  });

  // Ordering is not cosmetic: Consent Mode's default has to be set before any
  // tag could read it, so the gate must come first in the document.
  it('the gate loads before the first blocked tag', () => {
    const wrong = [];
    for (const p of pages) {
      const html = read(p);
      const g = html.indexOf('/js/consent.js');
      const t = html.search(/<script[^>]*data-consent="analytics"/i);
      if (g === -1 || t === -1) continue;
      if (g > t) wrong.push(p);
    }
    expect(wrong).toEqual([]);
  });

  // A `defer` or `async` on the gate would let the tags be parsed first.
  it('the gate is synchronous', () => {
    const bad = pages.filter((p) =>
      /<script[^>]*\/js\/consent\.js[^>]*(defer|async)/i.test(read(p))
    );
    expect(bad).toEqual([]);
  });
});

describe('structured data is not collateral damage', () => {
  // <script type="application/ld+json"> is what Google reads to show prices and
  // service areas in search results. Blocking it would quietly cost the SEO
  // work the suburb pages exist for.
  it('no JSON-LD block was gated', () => {
    const broken = pages.filter((p) =>
      /data-consent="analytics"[^>]*>\s*\{"@context"/.test(read(p))
    );
    expect(broken).toEqual([]);
  });

  it('the pages that had JSON-LD still have it live', () => {
    const withLd = pages.filter((p) => read(p).includes('application/ld+json'));
    expect(withLd.length).toBeGreaterThan(5);
  });
});

describe('the default is no tracking, in every direction', () => {
  it('Consent Mode defaults to denied', () => {
    const block = consent.slice(consent.indexOf("gtag('consent', 'default'"));
    for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']) {
      expect(block).toMatch(new RegExp(`${k}: 'denied'`));
    }
  });

  it('the language choice is not treated as tracking', () => {
    expect(consent).toMatch(/functionality_storage: 'granted'/);
  });

  // A visitor who declines must not be asked again on every page load, and
  // must not be tracked either.
  it('a declined choice is remembered and enables nothing', () => {
    expect(consent).toMatch(/if \(saved === 'denied'\) return;/);
  });

  it('a granted choice skips the banner and enables the tags', () => {
    expect(consent).toMatch(/if \(saved === 'granted'\)/);
  });

  // localStorage throws outright in some privacy modes. A consent banner that
  // crashes the page it is protecting is worse than no banner.
  it('survives localStorage being unavailable', () => {
    expect(consent).toMatch(/function read\(k\) \{\s*try \{/);
    expect(consent).toMatch(/function write\(k, v\) \{\s*try \{/);
  });
});

describe('analytics that is not a script tag is gated too', () => {
  // PostHog on the landing is started from inside js/landing-inline.js, so
  // there is no tag to make inert. It registers a callback instead.
  const landing = read('js/landing-inline.js');

  it('consent.js exposes the hook', () => {
    expect(consent).toMatch(/window\.drbikeOnConsent = function/);
    expect(consent).toMatch(/window\.drbikeAnalyticsAllowed = function/);
  });

  it('the landing initialises PostHog through it, not directly', () => {
    expect(landing).toMatch(/window\.drbikeOnConsent\(_initPosthog\)/);
    // The init call must not sit at top level any more.
    const idx = landing.indexOf('posthog.init(');
    const initFn = landing.indexOf('const _initPosthog');
    expect(initFn).toBeGreaterThan(-1);
    expect(idx).toBeGreaterThan(initFn);
  });

  // js/app.js and js/cta-tracking.js guard every capture() on `window.posthog`
  // being truthy. The install snippet leaves a truthy stub behind, so it has to
  // be cleared or they would all believe tracking is live and queue events for
  // a consent that may never come.
  it('the stub is cleared until consent, so capture() guards read false', () => {
    expect(landing).toMatch(/window\.posthog = undefined;/);
    expect(landing).toMatch(/const _phStub = window\.posthog;/);
  });

  // If consent.js ever fails to load, the safe outcome is no tracking - never
  // tracking without being asked.
  it('fails closed when the consent script is missing', () => {
    expect(landing).toMatch(/typeof window\.drbikeOnConsent === 'function'/);
  });
});

describe('the banner is usable', () => {
  it('ships all three languages in the same commit', () => {
    for (const lang of ['en:', 'es:', 'zh:']) expect(consent).toContain(lang);
    // Every language needs every string, or one of them silently shows English.
    for (const key of ['text:', 'accept:', 'decline:', 'more:']) {
      expect(consent.split(key).length - 1).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back to the browser language, then English', () => {
    expect(consent).toMatch(/navigator\.language/);
    expect(consent).toMatch(/COPY\[nav\] \|\| COPY\.en/);
  });

  it('meets the 44px touch target the project requires on mobile', () => {
    expect(consent).toMatch(/min-height:44px/);
  });

  it('uses design tokens, with a literal only as the var() fallback', () => {
    for (const t of ['var(--white', 'var(--border', 'var(--blue', 'var(--navy', 'var(--gray']) {
      expect(consent).toContain(t);
    }
  });

  it('links to the privacy page, and that page exists', () => {
    expect(consent).toContain("link.href = '/privacy.html'");
    expect(fs.existsSync(new URL('privacy.html', root))).toBe(true);
  });

  it('can be reopened, so a choice is not permanent', () => {
    expect(consent).toMatch(/window\.drbikeConsentReset = function/);
    // Defined before the early returns, or someone who already chose could
    // never change their mind.
    expect(consent.indexOf('drbikeConsentReset')).toBeLessThan(
      consent.indexOf("if (saved === 'granted')")
    );
  });
});

describe('the gate script is repeatable and guards itself', () => {
  it('is idempotent, so it can run after new pages are generated', () => {
    expect(gate).toMatch(/data-consent\\s\*=/);
    expect(gate).toMatch(/alreadyGated/);
  });

  it('has a --check mode that exits non-zero', () => {
    expect(gate).toContain('--check');
    expect(gate).toContain('process.exit(1)');
  });

  it('refuses to touch JSON-LD', () => {
    expect(gate).toMatch(/application\\\/ld\\\+json/);
  });

  it('is wired into package.json both ways', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['consent:gate']).toBe('node scripts/consent-gate.mjs');
    expect(pkg.scripts['consent:check']).toBe('node scripts/consent-gate.mjs --check');
  });
});

// ---------------------------------------------------------------------------
// Diego, seeing the first version live on drbikesydney.com.au: "esta muy
// ancho... hacerlo de otro color como azul claro difuminado y mas chico".
//
// He was right: it was an edge-to-edge white slab across a 1900px page for one
// sentence. These pin the compact version so it does not drift back, and check
// the thing that cannot be judged by looking - whether the text on the new
// tinted ground still clears AA.
// ---------------------------------------------------------------------------
describe('the banner is a card, not a slab', () => {
  it('is bounded, not full width', () => {
    expect(consent).toMatch(/max-width:440px/);
    expect(consent).not.toMatch(/'left:0'/);
    expect(consent).not.toMatch(/'right:0'/);
  });

  it('floats with a gap on every side, clear of the home indicator', () => {
    expect(consent).toMatch(/left:16px/);
    expect(consent).toMatch(/bottom:calc\(16px \+ env\(safe-area-inset-bottom/);
    expect(consent).toMatch(/border-radius:14px/);
  });

  // "Smaller" must not come out of the touch target - that would trade one
  // accessibility problem for another.
  it('keeps the 44px touch target the project requires', () => {
    expect(consent).toMatch(/min-height:44px/);
  });

  // One expression has to serve both themes, because --white is white in light
  // mode and the dark card colour in dark mode. A [data-theme] branch here
  // would be a second place to keep in sync.
  it('tints with color-mix over the themed card, not a fixed colour', () => {
    expect(consent).toMatch(/color-mix\(in srgb, var\(--blue/);
    expect(consent).toMatch(/backdrop-filter:blur/);
    // Only the style string, not the whole file. The prose right above it in
    // js/consent.js explains WHY there is no [data-theme] branch, and the
    // first version of this test matched its own explanation and failed - the
    // same trap as the SQL guard in PENDIENTES 58. Assert on code, not on
    // comments.
    const css = consent.slice(consent.indexOf('bar.style.cssText'), consent.indexOf('const msg'));
    expect(css).not.toContain('[data-theme');
    expect(css).toContain('color-mix');
  });

  // A browser without nested color-mix must still get a readable card, so the
  // plain themed background is declared first and overridden.
  it('declares a plain background before the frosted one', () => {
    const bg = [...consent.matchAll(/'background:([^']+)'/g)].map((m) => m[1]);
    expect(bg.length).toBeGreaterThanOrEqual(2);
    expect(bg[0]).toBe('var(--white,#fff)');
    expect(bg[1]).toContain('color-mix');
  });
});

describe('the text on the new ground still clears AA', () => {
  // Measured, not eyeballed. The card and the page were once the same colour
  // at 1.07:1 and the check that only measured ink passed it (PENDIENTES 57).
  const toRgb = (h) => {
    const v = h.replace('#', '');
    const f = v.length === 3 ? [...v].map((c) => c + c).join('') : v;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  };
  const lum = (rgb) =>
    rgb
      .map((x) => {
        const c = x / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      })
      .reduce((a, c, i) => a + [0.2126, 0.7152, 0.0722][i] * c, 0);
  const ratio = (a, b) => {
    const [l1, l2] = [lum(toRgb(a)), lum(toRgb(b))];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // 7% --blue over white, the light-mode result of the color-mix above.
  const mix = (a, b, p) => toRgb(a).map((x, i) => Math.round(x * p + toRgb(b)[i] * (1 - p)));
  const hex = (r) => '#' + r.map((x) => x.toString(16).padStart(2, '0')).join('');
  const GROUND = hex(mix('#2563eb', '#ffffff', 0.07));

  it('the message text clears 4.5:1', () => {
    expect(ratio('#475569', GROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it('the Privacy link clears 4.5:1', () => {
    expect(ratio('#2563eb', GROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it('the Decline label clears 4.5:1', () => {
    expect(ratio('#0d1f3c', GROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it('white on the Accept button clears 4.5:1', () => {
    expect(ratio('#ffffff', '#2563eb')).toBeGreaterThanOrEqual(4.5);
  });
});
