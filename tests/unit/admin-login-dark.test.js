// tests/unit/admin-login-dark.test.js
//
// Diego, in dark mode, could not read the admin sign-in screen: the title, the
// subtitle and the 2FA code he was typing were all near-invisible.
//
// The card was `background:#fff` written straight into the inline style, and
// its text is `color:var(--navy)`. In dark --navy is #eef2f7 - ink meant for a
// dark ground. Near-white ink on a white card: 1.12:1. The backdrop had the
// mirror-image bug: `background:var(--navy)` used INK as a GROUND, so the
// full-screen backdrop turned near-white too.
//
// dark-theme-check.mjs did not catch either one. Its pattern matched only
// SIX-digit hex, so the three-digit #fff was never looked at - and --navy is a
// token, so nothing flagged using it as a background. Both holes are closed;
// this pins the result.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const adminJs = read('js/admin.js');
const adminCss = read('css/admin.css');
const variables = read('css/variables.css');

// ── contrast, measured rather than eyeballed ────────────────────────────────
const toRgb = (h) => {
  const s = h.trim().replace('#', '');
  const full =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// --border in dark is rgba(255,255,255,.22); compose it over its own card to
// get the pixel the eye actually sees.
const mix = (fg, alpha, bg) => {
  const F = toRgb(fg);
  const B = toRgb(bg);
  return (
    '#' +
    F.map((c, i) =>
      Math.round(alpha * c + (1 - alpha) * B[i])
        .toString(16)
        .padStart(2, '0')
    ).join('')
  );
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(toRgb(a)), luminance(toRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Read a token's value out of the dark block, the same way dark-theme-check does.
function darkToken(name) {
  const start = variables.indexOf("[data-theme='dark']");
  expect(start, 'no dark block in css/variables.css').toBeGreaterThan(-1);
  const block = variables.slice(start, variables.indexOf('\n}', start));
  const m = block.match(new RegExp('--' + name + ':\\s*([^;]+);'));
  expect(m, `--${name} has no dark value`).not.toBeNull();
  return m[1].trim();
}

// The sign-in card's inline style, whatever it currently says.
function loginCardStyle() {
  const i = adminJs.indexOf("overlay.id = 'admin-login-overlay'");
  expect(i, 'login overlay not found - fix this extractor').toBeGreaterThan(-1);
  const anchor = adminJs.indexOf('border-radius:20px', i);
  expect(anchor, 'login card not found - fix this extractor').toBeGreaterThan(-1);
  const open = adminJs.lastIndexOf('style="', anchor);
  return adminJs.slice(open + 7, adminJs.indexOf('"', open + 7));
}

describe('the sign-in card is readable in dark mode', () => {
  it('the card takes its ground from a token, not a literal', () => {
    const style = loginCardStyle();
    expect(style).toContain('background:var(--white)');
    expect(style).not.toMatch(/background:\s*#/);
  });

  // The numbers that were wrong: title and the 2FA digits are var(--navy),
  // the subtitle is var(--gray), all three on the card.
  it('its ink clears AA against the card in dark', () => {
    const card = darkToken('white');
    for (const ink of ['navy', 'gray']) {
      const r = ratio(darkToken(ink), card);
      expect(r, `--${ink} on --white in dark is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Ground separation is its own requirement - readable text on a card with no
  // edge is still not a card. 1.15 is the project's own step, from
  // scripts/dark-theme-check.mjs.
  // The card sits on --navy-surface, which is dark in both themes, so in dark
  // the two grounds are close (1.13:1). What separates them is the card's
  // border - which is why the fix added one rather than only swapping the fill.
  it('and the card has an edge that separates it from the backdrop', () => {
    expect(loginCardStyle()).toContain('border:1px solid var(--border)');
    const cardBorder = mix('#ffffff', 0.22, darkToken('white')); // --border dark
    const r = ratio(cardBorder, '#0d1f3c');
    expect(r, `the card's edge against the backdrop is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      2
    );
  });
});

describe('the backdrop is a ground, not ink used as one', () => {
  // --navy-surface is the token for exactly this: the same navy, declared as a
  // dark GROUND and deliberately not inverted in dark mode. --navy is ink, and
  // tests/unit/dark-theme.test.js already forbids painting a background with it
  // - a rule that caught the first version of this fix.
  it('it uses --navy-surface, not the ink token', () => {
    const i = adminJs.indexOf("overlay.id = 'admin-login-overlay'");
    expect(i).toBeGreaterThan(-1);
    const cssText = adminJs.slice(i, i + 400);
    expect(cssText).toContain('background:var(--navy-surface)');
    expect(cssText).not.toContain('background:var(--navy);');
  });

  it('which is the same dark value in both themes', () => {
    const light = variables.slice(
      variables.indexOf(':root'),
      variables.indexOf("[data-theme='dark']")
    );
    expect(light).toMatch(/--navy-surface:\s*#0d1f3c/i);
    // If dark ever inverts it, the sign-in screen turns near-white again.
    const darkStart = variables.indexOf("[data-theme='dark']");
    const darkBlock = variables.slice(darkStart, variables.indexOf('\n}', darkStart));
    expect(darkBlock).not.toMatch(/--navy-surface:/);
  });
});

describe('.inp', () => {
  const rule = adminCss.slice(
    adminCss.indexOf('\n.inp {'),
    adminCss.indexOf('}', adminCss.indexOf('\n.inp {'))
  );

  it('takes its colours from tokens', () => {
    expect(rule).toContain('background: var(--white)');
    expect(rule).toContain('border: 1.5px solid var(--border)');
    expect(rule).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  // Two inputs side by side in a flex row pushed a horizontal scrollbar into
  // the phone-in booking modal: an <input> carries an implicit min-width from
  // its size attribute and refuses to shrink below it.
  it('can shrink inside a flex row', () => {
    expect(rule).toContain('min-width: 0');
  });
});
