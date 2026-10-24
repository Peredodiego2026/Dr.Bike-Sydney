// tests/unit/sw-takeover-reload.test.js
//
// Diego, on his phone, mid-booking: pressed Continue and the screen went
// totally white. No spinner, no error, nothing tappable. It happened more than
// once on 2026-09-02, the day four deploys went out in a row.
//
// The cause is in sw.js, and it is structural rather than any one change:
//
//   install:   self.skipWaiting()                  activates without waiting
//   activate:  caches.delete(old)                  DELETES the caches in use
//              self.clients.claim()                takes over the open tab
//
// ...and nobody reloaded. So a page that was already running the previous
// version kept running it while its cache was deleted underneath and a new
// worker took control. The next module that page asks for is gone, the import
// rejects, and the render dies half-way: a white screen.
//
// It is not particular to Diego. Any client with the app open during a deploy
// lands in the same state, and a client would just leave.
//
// The fix is the standard companion to skipWaiting + claim: reload once when
// the controller changes. The booking draft lives in localStorage, so the
// client comes back to "you have a booking in progress" rather than to nothing.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const sw = read('sw.js');

// Both surfaces register the worker, so both need the reload.
const SURFACES = ['index.html', 'js/landing-inline.js'];

describe('the worker still takes over immediately', () => {
  // Not a bug on its own - it is what gets a fix to a client without waiting
  // for every tab to close. It is only dangerous WITHOUT the reload below, so
  // this test exists to tie the two together: if someone removes skipWaiting,
  // the reload becomes unnecessary and this file should be revisited.
  it('sw.js calls skipWaiting and claim', () => {
    expect(sw).toContain('self.skipWaiting()');
    expect(sw).toContain('self.clients.claim()');
  });

  it('and deletes the caches it replaces', () => {
    expect(sw).toMatch(/caches\.delete\(/);
  });
});

describe('every page that registers the worker reloads when it takes over', () => {
  for (const file of SURFACES) {
    const src = read(file);

    it(`${file} registers the worker`, () => {
      expect(src).toContain("serviceWorker.register('/sw.js')");
    });

    it(`${file} listens for controllerchange`, () => {
      expect(src, 'a takeover would leave this page running against a deleted cache').toContain(
        "addEventListener('controllerchange'"
      );
    });

    // Without the guard, two workers changing hands in quick succession put the
    // page in a reload loop - which is worse than the white screen it fixes.
    it(`${file} reloads once, not in a loop`, () => {
      const i = src.indexOf("addEventListener('controllerchange'");
      const block = src.slice(i, i + 400);
      expect(block).toMatch(/location\.reload\(\)/);
      expect(block, 'no guard against reloading twice').toMatch(/swReloaded|__swReloaded/);
    });
  }
});

// A first visit has no controller. The freshly installed worker still calls
// clients.claim(), and that fires controllerchange too - but this page came
// whole from the network, so there is no old cache to lose. Reloading there
// loaded the page twice for every new visitor, about a second after arrival:
// measured on production on 2026-10-24, mobile and desktop alike. It is also
// what broke mobile-spa.test.js ("Execution context was destroyed"), since
// every Playwright test is a first visit.
//
// These run the real snippet from each page against a fake service worker, so
// they test what the code does, not what it looks like.
function loadTakeover(src, { controlled }) {
  const start = src.indexOf("if ('serviceWorker' in navigator)");
  const listener = src.indexOf("addEventListener('controllerchange'", start);
  const end = src.indexOf('});', listener) + 3;
  const listeners = [];
  const page = { reloads: 0 };
  const serviceWorker = {
    controller: controlled ? {} : null,
    register: () => Promise.resolve(),
    addEventListener: (type, fn) => type === 'controllerchange' && listeners.push(fn),
  };
  vm.runInNewContext(src.slice(start, end), {
    navigator: { serviceWorker },
    location: { reload: () => page.reloads++ },
  });
  page.takeOver = () => {
    serviceWorker.controller = {};
    listeners.forEach((fn) => fn());
  };
  return page;
}

describe('the takeover reload only fires for a page that had a worker', () => {
  for (const file of SURFACES) {
    const src = read(file);

    it(`${file}: a first visit is not reloaded when the new worker claims it`, () => {
      const page = loadTakeover(src, { controlled: false });
      page.takeOver();
      expect(page.reloads).toBe(0);
    });

    it(`${file}: a page running under the old worker reloads once on a deploy`, () => {
      const page = loadTakeover(src, { controlled: true });
      page.takeOver();
      page.takeOver();
      expect(page.reloads).toBe(1);
    });
  }
});
