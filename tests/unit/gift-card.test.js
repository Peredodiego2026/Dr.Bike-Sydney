// tests/unit/gift-card.test.js
//
// The gift card modal was ~25 lines of markup inlined in landing.html plus its
// own handlers in js/landing-inline.js. `grep -c gift index.html js/app.js`
// returned 0, so the mobile SPA had no gift card at all - which is how Diego
// found it.
//
// That is the fifth time this month the same shape has bitten: the "Trusted
// by" bar, the fee-check dead end, four separate call-out fee calculators, an
// unreachable Profile screen, and now this. So the modal lives in one module
// that both surfaces open, and these tests exist to keep it that way.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const gift = read('js/gift-card.js');
const appjs = read('js/app.js');
const landingHtml = read('landing.html');
const landingInline = read('js/landing-inline.js');
const mainCss = read('css/main.css');
const i18nCheck = read('scripts/i18n-check.mjs');

describe('there is exactly one gift card modal', () => {
  it('the markup is gone from landing.html', () => {
    expect(landingHtml).not.toMatch(/id="giftcard-modal"/);
    expect(landingHtml).not.toMatch(/id="gift-amount-custom"/);
  });

  it('the duplicate handlers are gone from landing-inline.js', () => {
    expect(landingInline).not.toMatch(/async function submitGiftCard/);
    expect(landingInline).not.toMatch(/let _giftAmount/);
  });

  it('both surfaces open the same module', () => {
    expect(appjs).toMatch(/import \{ openGiftCardModal \} from '\.\/gift-card\.js';/);
    // landing-inline.js is a classic script and cannot import a module, so
    // app.js publishes one handle rather than the landing keeping a copy.
    expect(appjs).toMatch(/window\.drbikeOpenGiftCard = openGiftCardModal;/);
    expect(landingInline).toMatch(/window\.drbikeOpenGiftCard === 'function'/);
  });

  it('the SPA has an entry point, which it never had', () => {
    expect(appjs).toMatch(/id="gift-open-btn"/);
    expect(appjs).toMatch(/#gift-open-btn'\)\?\.addEventListener\('click', openGiftCardModal\)/);
  });
});

// The sheet grew past the viewport and the pay button sat at the bottom of it,
// so on a phone the modal ended at the message field with no way to pay.
describe('the pay button is always on screen', () => {
  it('the sheet is capped and its body scrolls', () => {
    expect(mainCss).toMatch(/\.gift-sheet\s*\{[^}]*max-height: min\(92vh, 780px\)/s);
    expect(mainCss).toMatch(/\.gift-body\s*\{[^}]*overflow-y: auto/s);
  });

  it('the footer is a separate, non-shrinking row', () => {
    expect(mainCss).toMatch(/\.gift-foot\s*\{[^}]*flex-shrink: 0/s);
    expect(gift).toMatch(/<div class="gift-foot">[\s\S]{0,200}id="gift-submit"/);
  });

  it('the submit button is outside the scrolling body', () => {
    const bodyEnd = gift.indexOf('</div>', gift.indexOf('gift-error'));
    expect(gift.indexOf('gift-foot')).toBeGreaterThan(bodyEnd);
  });
});

// Every field was placeholder-only, so the moment you typed the box no longer
// said what it was - and the custom amount read as a bare "28".
describe('every field says what it is', () => {
  it.each([
    ['gift-to-email', "Recipient's email"],
    ['gift-to-name', "Recipient's name"],
    ['gift-from-name', 'Your name'],
    ['gift-message', 'Message'],
  ])('%s has a real label', (id, label) => {
    // A label containing an apostrophe is written with double quotes in the
    // source, so the assertion has to accept either delimiter.
    const q = '[\'"]';
    expect(gift).toMatch(new RegExp(`for="${id}">\\$\\{t\\(${q}${label}${q}\\)`));
  });

  it('the amount group is a fieldset with a legend', () => {
    expect(gift).toMatch(/<fieldset class="gift-field">/);
    expect(gift).toMatch(/<legend class="gift-label">\$\{t\('Amount'\)\}/);
  });

  it('the custom amount carries a $ so it cannot read as a quantity', () => {
    expect(gift).toMatch(/gift-custom__prefix" aria-hidden="true">\$</);
    expect(mainCss).toMatch(/\.gift-custom input\s*\{\s*padding-left: 28px/);
  });

  it('and states the range instead of hiding it in a placeholder', () => {
    expect(gift).toMatch(/\$\{t\('Between \$20 and \$1000\.'\)\}/);
  });
});

describe('the preview is the 3D part, and it is live', () => {
  // perspective belongs on the stage; on the card it would apply to its
  // children instead.
  it('the stage holds the vanishing point', () => {
    expect(mainCss).toMatch(/\.gift-stage\s*\{[^}]*perspective: 900px/s);
    expect(mainCss).toMatch(/\.gift-card3d\s*\{[^}]*transform: rotateX\(12deg\) rotateZ\(-2deg\)/s);
  });

  it('amount, recipient and sender update as you type', () => {
    expect(gift).toMatch(/function paint\(\)/);
    expect(gift).toMatch(/custom\.addEventListener\('input'/);
    expect(gift).toMatch(/\$\('gift-to-name'\)\.addEventListener\('input', paint\)/);
    expect(gift).toMatch(/\$\('gift-from-name'\)\.addEventListener\('input', paint\)/);
  });

  it('flattens when motion is reduced', () => {
    const i = mainCss.indexOf('@media (prefers-reduced-motion: reduce)', mainCss.indexOf('.gift-scrim'));
    expect(mainCss.slice(i, i + 260)).toMatch(/\.gift-card3d\s*\{\s*transform: none/);
  });
});

describe('choosing an amount is unambiguous', () => {
  // Two amounts looking chosen at once, when only one is charged, is worse
  // than either being wrong.
  it('typing a custom amount clears the presets', () => {
    expect(gift).toMatch(/if \(custom\.value\.trim\(\)\) \{[\s\S]{0,140}classList\.remove\('is-on'\)/);
  });

  it('picking a preset clears the custom box', () => {
    expect(gift).toMatch(/custom\.value = '';/);
  });

  it('the charged amount comes from one place', () => {
    expect(gift).toMatch(/const currentAmount = \(\) => \{[\s\S]{0,140}typed \? Number\(typed\) : amount;/);
  });
});

describe('it validates before charging, and never fails silently', () => {
  it('rejects an amount outside the range', () => {
    expect(gift).toMatch(/if \(!Number\.isFinite\(v\) \|\| v < MIN \|\| v > MAX\)/);
  });

  it('rejects an address that is not one', () => {
    expect(gift).toMatch(/\/\^\[\^@\\s\]\+@\[\^@\\s\]\+\\\.\[\^@\\s\]\+\$\//);
  });

  it('shows the real error and re-enables the button', () => {
    expect(gift).toMatch(/fail\(e\.message \|\| 'Something went wrong'\)/);
    expect(gift).toMatch(/submit\.disabled = false;/);
  });

  it('moves focus to the field that is wrong', () => {
    expect(gift).toMatch(/custom\.focus\(\);/);
    expect(gift).toMatch(/\$\('gift-to-email'\)\.focus\(\);/);
  });
});

describe('the modal behaves like the others', () => {
  it('closes on the X, the backdrop and Escape', () => {
    expect(gift).toMatch(/\$\('gift-close'\)\.addEventListener\('click', close\)/);
    expect(gift).toMatch(/if \(e\.target === scrim\) close\(\);/);
    expect(gift).toMatch(/if \(e\.key === 'Escape'\) close\(\);/);
  });

  it('removes its key listener and cannot leave the scrim behind', () => {
    expect(gift).toMatch(/document\.removeEventListener\('keydown', onKey\)/);
    expect(gift).toMatch(/setTimeout\(drop, 500\)/);
  });

  it('escapes everything it interpolates', () => {
    expect(gift).toMatch(/const t = \(s\) => esc\(translateValue\(s\)\);/);
  });

  it('is announced as a dialog', () => {
    expect(gift).toMatch(/setAttribute\('role', 'dialog'\)/);
    expect(gift).toMatch(/setAttribute\('aria-modal', 'true'\)/);
  });
});

// A new file full of user-facing copy that the checker does not read is copy
// that ships untranslated and nobody notices.
describe('the new module is covered by the i18n check', () => {
  it('is in JS_SURFACES', () => {
    expect(i18nCheck).toMatch(/JS_SURFACES = \[[^\]]*'js\/gift-card\.js'/s);
  });
});
