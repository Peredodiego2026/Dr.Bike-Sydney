// tests/unit/login-inputs-dark.test.js
//
// #380 fixed the admin sign-in card and the .inp CSS class, and the 2FA screen
// was STILL unreadable: the email, password and 6-digit fields are built from
// inline styles in js/admin.js that never mention a background.
//
// An <input> with no background falls back to the browser's own white. The
// colour beside it is var(--navy), which dark mode repaints to #eef2f7 - ink
// meant for dark grounds. Near-white text on white, 1.12:1, while you type.
//
// dark-theme-check.mjs could not see it: there is no literal to flag. The bug
// is what the style DOESN'T say. That is the shape pinned here - a field that
// sets its ink and stays silent about its ground.
//
// Found by rendering the page (npm run look), not by reading it. #380 shipped
// claiming the screen was fixed, and it was half fixed.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const adminJs = read('js/admin.js');
const variables = read('css/variables.css');

// Every inline style in the file that paints text with a token.
const inlineStyles = [...adminJs.matchAll(/style="([^"]*color:var\(--navy\)[^"]*)"/g)].map(
  (m) => m[1]
);
// ...plus the shared `_inp` / `_btn` constants, which are style strings too.
const styleConsts = [...adminJs.matchAll(/^const _\w+\s*=\s*\n?\s*'([^']+)'/gm)].map((m) => m[1]);

describe('a field that declares its ink also declares its ground', () => {
  const fields = [...inlineStyles, ...styleConsts].filter(
    (s) => s.includes('color:var(--navy)') && /padding:\d+px \d+px;border:/.test(s)
  );

  it('found the login and 2FA field styles', () => {
    // Email, password, and the shared _inp the 2FA/enrol screens use.
    expect(fields.length).toBeGreaterThanOrEqual(3);
  });

  for (const [i, style] of fields.entries()) {
    it(`field style #${i + 1} sets a background`, () => {
      expect(style, `no background: ${style.slice(0, 90)}...`).toMatch(/background:\s*var\(--/);
    });
  }
});

describe('and that background is readable against the ink in dark', () => {
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
  const lum = (rgb) =>
    rgb
      .map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      })
      .reduce((a, c, i) => a + [0.2126, 0.7152, 0.0722][i] * c, 0);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(toRgb(a)), lum(toRgb(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const darkToken = (name) => {
    const start = variables.indexOf("[data-theme='dark']");
    const block = variables.slice(start, variables.indexOf('\n}', start));
    const m = block.match(new RegExp('--' + name + ':\\s*([^;]+);'));
    expect(m, `--${name} has no dark value`).not.toBeNull();
    return m[1].trim();
  };

  // What you see while typing your password.
  it('typed text clears AA on the field', () => {
    const r = ratio(darkToken('navy'), darkToken('white'));
    expect(r, `--navy on --white in dark is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
