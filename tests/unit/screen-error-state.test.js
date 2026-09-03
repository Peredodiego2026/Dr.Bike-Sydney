// tests/unit/screen-error-state.test.js
//
// index.html ships every screen as an empty div; js/app.js is the only thing
// that fills them. So a render that throws before its first
// `screen.innerHTML =` leaves a full-bleed white page with nothing to tap -
// the bottom nav lives inside that innerHTML too.
//
// That is not a hypothetical. It is what a customer got for a whole day
// (docs/PENDIENTES.md 81): one variable read above its own `const`, and the
// booking flow became a dead end with no error, no spinner and no way back.
// That cause is fixed and its class is blocked by scripts/tdz-check.mjs. This
// covers the next one.
//
// Two behaviours are worth pinning, and the second is the one that makes the
// net safe to have:
//
//   1. A screen that rendered NOTHING gets an error card with a retry.
//   2. A screen that rendered and THEN failed keeps its content. Wiping a
//      usable page to show an error card would be a downgrade, so that case
//      gets a toast instead.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs
  .readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8')
  .split('\r\n')
  .join('\n');

// Pull the three functions that make up the net and run them for real.
function sliceFn(head) {
  const start = src.indexOf(head);
  expect(start, `${head} is gone from js/app.js`).toBeGreaterThan(-1);
  const end = src.indexOf('\n}\n', start);
  return src.slice(start, end + 2);
}

function buildNet({ renderedHtml = '', throwSync = false } = {}) {
  const screen = {
    innerHTML: renderedHtml,
    _listeners: {},
    querySelector() {
      return {
        addEventListener: (evt, fn) => {
          screen._listeners[evt] = fn;
        },
      };
    },
  };

  const toasts = [];
  const errors = [];
  const sentry = [];

  const stub = () => '';
  const defined = {
    document: { querySelector: () => screen },
    window: { Sentry: { captureException: (e, ctx) => sentry.push([e, ctx]) } },
    console: { error: (...a) => errors.push(a) },
    showToast: (m) => toasts.push(m),
    translateValue: (s) => s,
    translateScreen: () => {},
    Boolean,
    String,
  };
  const ctx = vm.createContext(
    new Proxy(defined, { has: () => true, get: (t, k) => (k in t ? t[k] : stub) })
  );

  vm.runInContext(sliceFn('function screenErrorHtml()'), ctx);
  vm.runInContext(sliceFn('function handleScreenError('), ctx);
  vm.runInContext(sliceFn('function runScreenRender('), ctx);

  const render = throwSync
    ? vi.fn(() => {
        throw new Error('boom');
      })
    : vi.fn(async () => {
        throw new Error('boom');
      });

  return { ctx, screen, toasts, errors, sentry, render };
}

const run = (ctx, route, render) =>
  ctx.runScreenRender
    ? ctx.runScreenRender(route, render)
    : vm.runInContext('runScreenRender', ctx)(route, render);

describe('a render that dies leaves something on screen', () => {
  it('an empty screen gets an error card, not a white page', async () => {
    const net = buildNet();
    run(net.ctx, 'service-summary', net.render);
    await new Promise((r) => setTimeout(r, 0));

    expect(net.screen.innerHTML, 'the screen was left blank').not.toBe('');
    expect(net.screen.innerHTML).toContain('This screen did not load');
    expect(net.screen.innerHTML).toContain('screen-error-retry');
  });

  it('catches a synchronous throw the same way', () => {
    const net = buildNet({ throwSync: true });
    run(net.ctx, 'my-bookings', net.render);
    expect(net.screen.innerHTML).toContain('This screen did not load');
  });

  it('reassures rather than alarms - nothing is said to be lost', async () => {
    const net = buildNet();
    run(net.ctx, 'payment', net.render);
    await new Promise((r) => setTimeout(r, 0));
    expect(net.screen.innerHTML).toContain('Nothing you entered has been lost');
    expect(net.screen.innerHTML).toContain('#home');
  });

  it('retry re-runs the render', async () => {
    const net = buildNet();
    run(net.ctx, 'profile', net.render);
    await new Promise((r) => setTimeout(r, 0));
    expect(net.render).toHaveBeenCalledTimes(1);

    net.screen._listeners.click();
    expect(net.render, 'the retry button did not call the render again').toHaveBeenCalledTimes(2);
  });
});

describe('a screen that already rendered is never wiped', () => {
  // The dangerous half of a safety net: replacing a working page.
  it('keeps its content and warns with a toast instead', async () => {
    const net = buildNet({ renderedHtml: '<div>the real screen</div>' });
    run(net.ctx, 'tracking', net.render);
    await new Promise((r) => setTimeout(r, 0));

    expect(net.screen.innerHTML, 'a usable screen was replaced').toBe('<div>the real screen</div>');
    expect(net.toasts).toHaveLength(1);
  });
});

describe('nothing is swallowed', () => {
  it('reports to the console and to Sentry, tagged with the route', async () => {
    const net = buildNet();
    run(net.ctx, 'my-bikes', net.render);
    await new Promise((r) => setTimeout(r, 0));

    expect(net.errors).toHaveLength(1);
    expect(net.errors[0][0]).toContain('my-bikes');
    expect(net.sentry).toHaveLength(1);
    expect(net.sentry[0][1]).toEqual({ tags: { screen: 'my-bikes' } });
  });
});

describe('every screen goes through the net', () => {
  // The bug this prevents: someone adds an eleventh screen and calls its
  // render bare, and that one screen is back to a white page.
  it('the router dispatches through runScreenRender only', () => {
    const dispatcher = src.slice(src.indexOf("document.addEventListener('screenchange'"));
    const bare = [...dispatcher.matchAll(/detail\.route === '([a-z-]+)'\)\s*render[A-Z]/g)];
    expect(
      bare.map((m) => m[1]),
      'these screens bypass the error net'
    ).toEqual([]);
    expect(dispatcher).toContain('runScreenRender(detail.route, render)');
  });

  it('covers all ten rendered screens', () => {
    const map = src.slice(
      src.indexOf('const RENDERERS = {'),
      src.indexOf('const render = RENDERERS')
    );
    for (const route of [
      'book-service',
      'service-summary',
      'quote-sent',
      'payment',
      'tracking',
      'review',
      'login',
      'my-bookings',
      'profile',
      'my-bikes',
    ]) {
      expect(map, `${route} is not in RENDERERS`).toContain(route);
    }
  });
});
