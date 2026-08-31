// tests/unit/profile-card-and-birthday.test.js
//
// Five things Diego hit on his own phone the day the birthday field shipped.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { hasKey, dictBlock } from '../../scripts/lib/dict-keys.mjs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const appjs = read('js/app.js');
const stripejs = read('js/stripe.js');
const mainCss = read('css/main.css');
const i18njs = read('js/i18n.js');

// Stripe's combined `card` element reveals its fields progressively: you see
// the number, and expiry and CVC slide in only once a valid number is typed.
// On a phone that reads as a form with two fields missing.
describe('the card form is three visible boxes', () => {
  it('uses the split elements, not the combined one', () => {
    expect(stripejs).toMatch(/elements\.create\('cardNumber'/);
    expect(stripejs).toMatch(/elements\.create\('cardExpiry'/);
    expect(stripejs).toMatch(/elements\.create\('cardCvc'/);
    expect(stripejs).not.toMatch(/elements\.create\('card',/);
  });

  // confirmCardPayment/confirmCardSetup find the siblings only when all three
  // come from the same elements() instance.
  it('all three come from one elements() instance', () => {
    // Scoped to createPaymentForm: the Apple Pay / Google Pay button below it
    // legitimately builds its own instance.
    const i = stripejs.indexOf('export async function createPaymentForm');
    const fn = stripejs.slice(i, stripejs.indexOf('export async function', i + 10));
    const hits = fn.match(/stripe\.elements\(\)/g) || [];
    expect(hits.length).toBe(1);
    expect(fn).toMatch(/elements\.create\('cardNumber'/);
    expect(fn).toMatch(/elements\.create\('cardCvc'/);
  });

  it('destroying the form tears down all three', () => {
    const i = stripejs.indexOf('export function destroyPaymentForm');
    const fn = stripejs.slice(i, i + 500);
    expect(fn).toMatch(/\[_card, _cardExpiry, _cardCvc\]/);
  });

  it('the three boxes have their own borders, not one wrapper', () => {
    expect(mainCss).toMatch(/\.card-field\s*\{/);
    expect(mainCss).toMatch(/\.card-field:focus-within/);
    expect(mainCss).toMatch(/\.card-element__row/);
  });
});

// css/fonts.css forces every input to 16px on coarse pointers, because below
// that iOS Safari zooms the page in on focus and never zooms back. Stripe's
// fields live in a cross-origin iframe that no stylesheet of ours can reach -
// the style object is the only way in, and it was 15px.
describe('the card fields do not trigger the iOS zoom', () => {
  it('Stripe is told 16px', () => {
    expect(stripejs).toMatch(/fontSize: '16px'/);
    expect(stripejs).not.toMatch(/fontSize: '1[0-5]px'/);
  });
});

describe('saving a birthday says so, and keeps saying so', () => {
  it('there is a persistent marker, not only a toast', () => {
    expect(appjs).toMatch(/id="bday-status"/);
    expect(appjs).toMatch(/if \(status\) status\.style\.display = 'flex';/);
  });

  it('it starts visible only when a date is already stored', () => {
    expect(appjs).toMatch(/display:\$\{bdayDay && bdayMonth \? 'flex' : 'none'\}/);
  });

  // Changing the selects means the shown date is no longer the saved one.
  it('changing either select clears it', () => {
    expect(appjs).toMatch(/\['#bday-day', '#bday-month'\]\.forEach/);
    expect(appjs).toMatch(/if \(status\) status\.style\.display = 'none';/);
  });

  // Asked per dictionary rather than by counting quoted occurrences: prettier
  // unquotes an identifier-like key like Saved on the next commit that touches
  // i18n.js, and the old count went to zero (docs/PENDIENTES.md 69).
  it('"Saved" is translated', () => {
    for (const lang of ['es', 'zh']) {
      expect(hasKey(dictBlock(i18njs, lang), 'Saved'), `missing from ${lang}`).toBe(true);
    }
  });
});

// renderProfile() repaints the screen as a spinner before it fetches. Calling
// it after a DENIED permission wiped the profile to a blank page with an error
// toast floating over it - it read as a crash.
describe('declining notifications does not wipe the screen', () => {
  it('enablePushNotifications reports whether it worked', () => {
    const i = appjs.indexOf('async function enablePushNotifications');
    const fn = appjs.slice(i, appjs.indexOf('\n}', appjs.indexOf('catch (e)', i)) + 2);
    expect(fn).toMatch(/return true;/);
    const bareReturns = fn.match(/\n\s*return;\s*\n/g) || [];
    expect(bareReturns.length).toBe(0);
  });

  it('the profile is only re-rendered on success', () => {
    expect(appjs).toMatch(/const granted = await enablePushNotifications\(\);/);
    expect(appjs).toMatch(/if \(granted\) \{\s*\r?\n\s*renderProfile\(\);/);
  });
});

// Superseded by tests/unit/birthday-modal.test.js: the inline banner became a
// modal, and the "was an email really sent?" question moved to the server,
// which now sends it at the moment the modal opens.
