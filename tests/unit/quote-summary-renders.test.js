// tests/unit/quote-summary-renders.test.js
//
// Diego, on his phone: Book a Service offered "you have a booking in progress",
// he pressed Continue, and the screen went totally white - no spinner, no
// error, nothing to tap. Every time, at the same place.
//
// Continue calls router.navigate('service-summary'). The router does not build
// screens; it toggles `active` on divs that already sit empty in index.html and
// lets js/app.js fill them. So a render function that throws before its first
// `screen.innerHTML =` leaves `<div data-screen="service-summary" class="screen
// active"></div>` - an empty, full-bleed white page. The bottom nav lives
// inside that innerHTML too, which is why the screen was untouchable.
//
// renderServiceSummary read `calloutFee` and `serviceTotal` 44 and 12 lines
// above their own `const`, inside `if (window.posthog)`. That is a temporal
// dead zone: ReferenceError, thrown before the loader was ever written.
//
// The `if (window.posthog)` is why nobody else saw it. PostHog is loaded by
// js/consent.js only after the visitor accepts analytics cookies, so the whole
// booking flow works for anyone who has not - which included every automated
// run of this flow, seeded backend and all.
//
// This test does not read the file and check line order; it EXECUTES the real
// function out of js/app.js with analytics present and asserts the screen ends
// up with a quote on it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs
  .readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8')
  .split('\r\n')
  .join('\n');

// The function's own source, from its declaration to the first line-start `}`.
function sourceOf(name) {
  const start = src.indexOf(`async function ${name}()`);
  expect(start, `${name} not found in js/app.js`).toBeGreaterThan(-1);
  const end = src.indexOf('\n}\n', start);
  expect(end, `could not find the end of ${name}`).toBeGreaterThan(start);
  return src.slice(start, end + 2);
}

// Runs renderServiceSummary against stub helpers and returns what it wrote.
// Every identifier the function reaches for that we have not defined resolves
// to a stub, so this exercises the function's own control flow - not the
// helpers', which have their own tests.
// `covered` decides what check-coverage answers. The default is the dropped
// request - no reply, so the function falls through to needsQuote, which is
// what every assertion in this file ran against until 2026-09-23.
function renderSummary({ analytics, covered = false }) {
  let html = '';
  // Any element the function looks up after writing the HTML: it only wires
  // listeners and flips styles on these, so one shape answers for all of them.
  const el = () => ({
    addEventListener: () => {},
    removeEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: {},
    dataset: {},
    querySelector: () => el(),
    querySelectorAll: () => [],
    focus: () => {},
    remove: () => {},
    textContent: '',
    value: '',
  });
  const screen = {
    set innerHTML(v) {
      html = v;
    },
    get innerHTML() {
      return html;
    },
    querySelector: () => el(),
    querySelectorAll: () => [],
  };

  const appState = {
    service: { name: 'Tune-Up', price: 109 },
    date: '2026-09-10',
    time: '09:00',
    location: '12 Campbell Pde, Bondi Beach NSW 2026',
  };
  const win = { appState };
  if (analytics) win.posthog = { capture: () => {} };

  const stub = () => '';
  const defined = {
    document: {
      querySelector: () => screen,
      querySelectorAll: () => [],
      createElement: () => el(),
      body: el(),
    },
    window: win,
    router: { navigate: stub },
    posthog: win.posthog,
    // Only the helpers whose RETURN VALUE this function does arithmetic or
    // branching on. The rest can be empty strings.
    applySurcharge: (n) => Number(n) || 0,
    isSurchargeDay: () => false,
    getServiceInclusions: () => [],
    fetch: async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      if (covered && body.role === 'check-coverage') {
        return {
          ok: true,
          json: async () => ({
            covered: true,
            needsQuote: false,
            calloutFee: 45,
            minutes: 12,
            km: 6,
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    },
    Number,
    Boolean,
    String,
    Math,
    JSON,
    console,
  };
  const sandbox = new Proxy(defined, {
    has: () => true,
    get: (target, key) => (key in target ? target[key] : stub),
  });

  const fn = vm.runInContext(
    '(' + sourceOf('renderServiceSummary') + ')',
    vm.createContext(sandbox)
  );
  return fn().then(
    () => ({ threw: null, html }),
    (e) => ({ threw: `${e.constructor.name}: ${e.message}`, html })
  );
}

describe('the quote summary renders instead of going white', () => {
  // The bug, exactly: analytics on, screen left at 0 characters.
  it('renders with analytics loaded (cookies accepted)', async () => {
    const { threw, html } = await renderSummary({ analytics: true });
    expect(threw, 'renderServiceSummary threw before writing anything').toBeNull();
    expect(html.length, 'the screen div was left empty - a white, untappable page').toBeGreaterThan(
      500
    );
    expect(html).toContain('Tune-Up');
  });

  it('renders with analytics absent (cookies declined)', async () => {
    const { threw, html } = await renderSummary({ analytics: false });
    expect(threw).toBeNull();
    expect(html.length).toBeGreaterThan(500);
  });

  // The two paths must not diverge. Accepting cookies is not supposed to
  // change what the booking flow does, and for one deploy it decided whether
  // the flow worked at all.
  it('renders the same quote either way', async () => {
    const on = await renderSummary({ analytics: true });
    const off = await renderSummary({ analytics: false });
    expect(on.html).toBe(off.html);
  });
});

// The 2026-09 rework made the visit fee the one figure on this screen that
// looks like a total. Out of the same-day area that fee is 0 and nothing is
// charged at all, so the card shipped reading "Pay online now $0.00" directly
// above a button that says "Ask for my price". Comments are stripped first:
// the ones explaining this bug name the very strings being searched for.
describe('what the quote screen promises depends on whether we can serve the address', () => {
  const strip = (h) => h.replace(/<!--[\s\S]*?-->/g, '');

  it('inside the area it shows the fee that Stripe is about to charge', async () => {
    const { html } = await renderSummary({ analytics: false, covered: true });
    const body = strip(html);
    expect(body).toContain('Pay online now');
    expect(body).toContain('$45.00');
    expect(body).toContain('Then, at your door');
  });

  it('outside it, no payment is announced and no zero is shown', async () => {
    const { html } = await renderSummary({ analytics: false, covered: false });
    const body = strip(html);
    expect(body).not.toContain('Pay online now');
    expect(body, 'a $0.00 "total" over an "Ask for my price" button').not.toContain('$0.00');
  });

  it('and nothing is promised about a trip nobody agreed to make', async () => {
    const { html } = await renderSummary({ analytics: false, covered: false });
    const body = strip(html);
    expect(body).not.toContain('Then, at your door');
    expect(body).toContain("We'll confirm the visit");
  });
});

describe('a render that throws would leave a blank screen', () => {
  // Why the symptom is white rather than a broken-looking screen: index.html
  // ships these divs empty, and js/app.js is the only thing that fills them.
  it('index.html ships the screen divs empty', () => {
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain('<div data-screen="service-summary" class="screen"></div>');
  });

  // And the router only toggles `active` - it never renders anything itself,
  // so it cannot fall back to anything either.
  it('the router only toggles active on screens that already exist', () => {
    const router = fs.readFileSync(new URL('../../js/router.js', import.meta.url), 'utf8');
    expect(router).toContain("nextScreen.classList.add('active')");
    expect(router).not.toMatch(/innerHTML\s*=/);
  });
});
