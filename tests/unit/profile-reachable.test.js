// tests/unit/profile-reachable.test.js
//
// The Profile screen existed in landing.html's DOM and the router already
// rendered it as a full-screen overlay there - but NOTHING linked to it.
// `#profile` appeared zero times across landing.html, js/landing-inline.js
// and js/landing-modules.js, so on desktop the screen was unreachable.
//
// Everything that lives only on that screen was therefore mobile-only without
// anyone noticing: the language picker, push notifications, the card on file,
// the referral code - and the birthday field, which is how it was found. Diego
// merged the birthday feature, opened the landing, and there was nowhere to
// put his birthday.
//
// This is the same failure as the "Trusted by" bar, the fee-check dead end and
// the four fee calculators: a feature built on one surface, not wired on the
// other. Hence a test.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const landingHtml = read('landing.html');
const landingInline = read('js/landing-inline.js');
const appjs = read('js/app.js');
const mainCss = read('css/main.css');
const i18njs = read('js/i18n.js');

describe('Profile is reachable from the landing', () => {
  it('the screen is in the landing DOM at all', () => {
    expect(landingHtml).toMatch(/data-screen="profile"/);
  });

  it('the account panel has a way in', () => {
    expect(landingInline).toMatch(/account-profile-btn/);
    expect(landingInline).toMatch(/function profileLinkHtml\(\)/);
  });

  it('the link navigates to the profile route', () => {
    expect(landingInline).toMatch(/window\.location\.hash = '#profile'/);
  });

  // The panel is a fixed overlay. Left open, it covers the screen it opened.
  it('closes the account panel on the way out', () => {
    const i = landingInline.indexOf('.account-profile-btn');
    const block = landingInline.slice(i, i + 500);
    expect(block).toMatch(/getElementById\('account-panel'\)\?\.remove\(\)/);
  });
});

describe('and there is a way back out of it', () => {
  // css/main.css hides .bottom-nav above 768px, so on the landing the header
  // arrow is the ONLY visible exit. Without it the browser back button is the
  // only way, which nobody should have to discover.
  it('the bottom nav really is hidden on desktop', () => {
    const i = mainCss.indexOf('@media (min-width: 768px)');
    expect(i).toBeGreaterThan(-1);
    const block = mainCss.slice(i, i + 300);
    expect(block).toMatch(/\.bottom-nav\s*\{\s*display:\s*none/);
  });

  it('the profile header shows a back arrow on the landing surface', () => {
    expect(appjs).toMatch(/const needsBack = document\.body\.dataset\.surface === 'landing';/);
    expect(appjs).toMatch(/createHeader\('Profile', needsBack\)/);
    expect(appjs).not.toMatch(/createHeader\('Profile', false\)/);
  });

  // Both the loader and the finished render, or the arrow flickers away.
  it('both renders of the header agree', () => {
    const hits = appjs.match(/createHeader\('Profile', needsBack\)/g) || [];
    expect(hits.length).toBe(2);
  });
});

describe('the label is translated like everything else', () => {
  it('exists in es and zh', () => {
    const first = i18njs.indexOf("'Profile & settings'");
    const second = i18njs.indexOf("'Profile & settings'", first + 1);
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(-1);
  });
});
