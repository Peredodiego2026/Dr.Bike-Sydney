// tests/unit/consent-gated-vendors.test.js
//
// On 2026-08-31 the landing page had no working buttons for anyone who had not
// accepted cookies. Book a Service, View Services, My Account and the mechanics
// carousel all did nothing, and the page looked fine.
//
// One line did it. js/landing-inline.js is fifteen extracted <script> blocks
// sharing ONE top-level scope, and line 9 was `Sentry.onLoad(...)`. The Sentry
// loader is consent-gated, so with no consent `Sentry` is undefined, the
// ReferenceError killed the file, and every addEventListener below it - about
// 1500 lines of them - never ran.
//
// The extraction (d5bb2f8) is what created it: moving those blocks out of the
// HTML took them out of scripts/consent-gate.mjs's sight, so the gate came off
// the CALLER while it stayed on the LOADER it needs.
//
// Two invariants are pinned here:
//   1. a script the page loads unconditionally never touches a gated vendor;
//   2. the bootstraps live in the HTML, where the gate can see them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { VENDOR_USES } from '../../scripts/lib/consent-vendors.mjs';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

describe('the detector matches the shape that shipped', () => {
  const sentry = VENDOR_USES.find((v) => v.name === 'Sentry');
  const ga = VENDOR_USES.find((v) => v.name === 'Google Analytics');

  it('knows both vendors', () => {
    expect(sentry).toBeDefined();
    expect(ga).toBeDefined();
  });

  // The exact text of js/landing-inline.js line 9, as deployed.
  it('catches the Sentry call that killed the page', () => {
    expect(sentry.re.test('  Sentry.onLoad(function() {')).toBe(true);
    expect(sentry.re.test('Sentry.init({')).toBe(true);
  });

  it('catches the GA bootstrap', () => {
    expect(ga.re.test("gtag('js', new Date());")).toBe(true);
    expect(ga.re.test("gtag('config', 'G-GXYD68JXZW');")).toBe(true);
    expect(ga.re.test('gtag("config", "G-GXYD68JXZW");')).toBe(true);
  });

  // A check that fires on ordinary code gets switched off, and then it protects
  // nothing. These are the shapes that must stay quiet.
  it('stays quiet on code that only mentions them', () => {
    expect(sentry.re.test('// Sentry init lives in landing.html')).toBe(false);
    expect(sentry.re.test('if (window.Sentry) window.Sentry.captureException(e);')).toBe(false);
    expect(ga.re.test('if (window.gtag) gtag("event", "purchase");')).toBe(false);
    expect(ga.re.test('  gtag("event", "add_to_cart", {});')).toBe(false);
  });
});

describe('no unconditionally-loaded script touches a gated vendor', () => {
  // The four app surfaces plus the two pages whose bootstraps were also loose.
  const pages = ['index.html', 'landing.html', 'admin.html', 'mechanic.html', 'track.html'];

  for (const page of pages) {
    it(`${page} loads nothing that would throw before consent`, () => {
      const html = read(page);
      const offenders = [];
      for (const m of html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)) {
        if (/data-consent/.test(m[1] + m[3])) continue;
        const src = m[2];
        if (/^https?:|^\/\//.test(src)) continue;
        const file = src.replace(/^\//, '').split('?')[0];
        let js;
        try {
          js = read(file);
        } catch {
          continue;
        }
        for (const v of VENDOR_USES) {
          if (v.re.test(js)) offenders.push(`${file} uses ${v.name}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});

describe('the bootstraps are in the HTML, where the gate can see them', () => {
  // Guarding in place would have stopped the crash and left Sentry and GA dead
  // forever: those files run once, before consent is ever given. The bootstrap
  // has to sit in a text/plain block that js/consent.js can revive.
  const gatedBlocks = (html) =>
    [...html.matchAll(/<script type="text\/plain" data-consent="analytics">([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .join('\n');

  it('landing.html carries the Sentry init it lost', () => {
    const blocks = gatedBlocks(read('landing.html'));
    expect(blocks).toMatch(/Sentry\.onLoad\(/);
    expect(blocks).toMatch(/Sentry\.init\(/);
  });

  it('and js/landing-inline.js no longer runs it', () => {
    // Comments may still explain the history; code may not.
    const code = read('js/landing-inline.js')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/Sentry\s*\./);
  });

  for (const [page, js] of [
    ['landing.html', 'js/landing-inline.js'],
    ['admin.html', 'js/admin.js'],
    ['mechanic.html', 'js/mechanic.js'],
  ]) {
    it(`${page} configures Google Analytics behind the gate, not in ${js}`, () => {
      expect(gatedBlocks(read(page))).toMatch(/gtag\(\s*['"]config['"]/);
      const code = read(js)
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      expect(code).not.toMatch(/^\s*gtag\(\s*['"](?:js|config)['"]/m);
    });
  }
});
