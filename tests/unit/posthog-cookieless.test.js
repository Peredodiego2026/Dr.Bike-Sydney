// tests/unit/posthog-cookieless.test.js
//
// Until 2026-11-04 PostHog started only after the visitor pressed Accept, so
// anyone who declined - or never answered the banner - did not exist in the
// numbers. Now it starts for everyone: cookieless (nothing written to the
// device) unless the visitor accepted, and upgraded to cookies on Accept.
//
// These run the real PostHog block from both surfaces - index.html's inline
// tag and the slice of js/landing-inline.js - against a fake browser, and read
// the config it actually hands to posthog.init(). PostHog's own side (that
// cookieless mode stores nothing and still sends) is PostHog's contract, and
// was checked in a real browser when this landed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const index = read('index.html');
const OPEN = '<script data-consent="cookieless">';
const indexStart = index.indexOf(OPEN) + OPEN.length;
const indexBlock = index.slice(indexStart, index.indexOf('</script>', indexStart));

const landing = read('js/landing-inline.js');
const SNIPPET = '!function(t,e){let o,n,p,r;e.__SV';
const END = '_initPosthog();';
const landingBlock = landing.slice(landing.indexOf(SNIPPET), landing.indexOf(END) + END.length);

const SURFACES = [
  ['index.html', indexBlock],
  ['js/landing-inline.js', landingBlock],
];

function run(code, { host = 'drbikesydney.com.au', saved = null, storageThrows = false } = {}) {
  const store = saved ? { 'drbike-consent': saved } : {};
  const localStorage = {
    getItem(k) {
      if (storageThrows) throw new Error('storage blocked');
      return k in store ? store[k] : null;
    },
    setItem(k, v) {
      if (storageThrows) throw new Error('storage blocked');
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
  };
  const firstScript = { parentNode: { insertBefore() {} } };
  const onConsent = [];
  const ctx = {
    document: { createElement: () => ({}), getElementsByTagName: () => [firstScript] },
    location: { hostname: host, search: '' },
    localStorage,
    URLSearchParams,
    drbikeOnConsent: (fn) => onConsent.push(fn),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const ph = ctx.posthog;
  return { ph, config: ph && ph._i && ph._i[0] && ph._i[0][1], onConsent };
}

describe('the PostHog block was found on both surfaces', () => {
  for (const [name, code] of SURFACES) {
    it(name, () => {
      expect(code).toContain('posthog.init(');
      expect(code.length).toBeGreaterThan(500);
    });
  }
});

for (const [name, code] of SURFACES) {
  describe(`${name}: what each choice configures`, () => {
    it('no answer yet: counted, cookieless', () => {
      const { config } = run(code);
      expect(config.cookieless_mode).toBe('on_reject');
      expect(config.opt_out_capturing_by_default).toBe(true);
    });

    it('declined: counted, cookieless', () => {
      const { config } = run(code, { saved: 'denied' });
      expect(config.cookieless_mode).toBe('on_reject');
      expect(config.opt_out_capturing_by_default).toBe(true);
    });

    // The returning-visitor cookie of someone who accepted before this change
    // must survive it, so their init is exactly the one they always had.
    it('accepted: the same init as before, with cookies', () => {
      const { config, onConsent } = run(code, { saved: 'granted' });
      expect(config).toEqual({
        api_host: 'https://eu.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
      });
      expect(onConsent).toHaveLength(0);
    });

    it('Accept on the page upgrades to cookies straight away', () => {
      const { ph, onConsent } = run(code);
      expect(onConsent).toHaveLength(1);
      onConsent[0]();
      // The stub queues each call as [method, ...args] until PostHog loads.
      expect(ph.some((call) => Array.isArray(call) && call[0] === 'opt_in_capturing')).toBe(true);
    });

    // A browser that refuses storage cannot have accepted, and must get the
    // mode that writes nothing.
    it('storage blocked: cookieless, and the page does not crash', () => {
      const { config } = run(code, { storageThrows: true });
      expect(config.cookieless_mode).toBe('on_reject');
    });

    it('off production: nothing starts and the stub is cleared', () => {
      const { ph } = run(code, { host: 'localhost' });
      expect(ph).toBeUndefined();
    });
  });
}
