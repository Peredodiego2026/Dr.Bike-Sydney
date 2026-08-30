// tests/unit/keyboard-access.test.js
//
// Audit point 13. Two failures, neither of them visible to anyone using a
// mouse, which is exactly why they survived this long:
//
//   1. No skip link on index.html or landing.html. A keyboard user tabbed
//      through the entire header before reaching the page - on the SPA, on
//      every screen change.
//   2. No global focus style at all. Two components styled :focus-visible;
//      everything else relied on the browser's own ring, and six rules threw
//      that ring away with `outline: none`. Four of those were in the BASE
//      rule, which applies on focus too - including `.pin-inp`, the mechanic's
//      PIN field. Tab into it and nothing on screen tells you where you are.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const vars = read('css/variables.css');

describe('a keyboard user can reach the content', () => {
  for (const page of ['index.html', 'landing.html']) {
    it(`${page} has a skip link that points somewhere real`, () => {
      const html = read(page);
      const m = /<a\b[^>]*class="skip-link"[^>]*href="#([^"]+)"/.exec(html);
      expect(m, `${page} has no skip link`).not.toBeNull();
      expect(html).toContain(`id="${m[1]}"`);
    });

    it(`${page}'s skip link is the FIRST focusable thing`, () => {
      const body = read(page).slice(read(page).indexOf('<body'));
      const link = body.search(/<a\b[^>]*class="skip-link"/i);
      const first = body.search(/<(a|button|input|select|textarea)\b/i);
      expect(link).toBe(first);
    });
  }

  // display:none would remove it from the tab order, which is the one thing it
  // must never do. Off-screen positioning keeps it focusable.
  it('the skip link is hidden by position, not by display', () => {
    const rule = vars.slice(vars.indexOf('.skip-link {'), vars.indexOf('.skip-link:focus'));
    expect(rule).toMatch(/left:\s*-9999px/);
    expect(rule).not.toMatch(/display:\s*none/);
    expect(vars).toMatch(/\.skip-link:focus\s*\{[^}]*left:\s*0/);
  });
});

describe('the focus ring exists, in both themes', () => {
  // variables.css is the ONLY stylesheet all five surfaces load - track.html
  // loads nothing else - so a focus style anywhere else leaves a surface bare.
  it('lives in the one file every surface loads', () => {
    expect(vars).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus-ring\)/);
  });

  it('has a value in light and in dark', () => {
    const light = vars.slice(0, vars.indexOf("[data-theme='dark']"));
    const dark = vars.slice(vars.indexOf("[data-theme='dark']"));
    expect(light).toMatch(/--focus-ring:/);
    expect(dark).toMatch(/--focus-ring:/);
  });

  // WCAG 1.4.11 wants 3:1 against what sits next to it. Calculated, not
  // eyeballed - the lesson of PENDIENTES 57.
  it('clears 3:1 against its own ground in each theme', () => {
    const toRgb = (h) => {
      const v = h.replace('#', '');
      const f = v.length === 3 ? [...v].map((c) => c + c).join('') : v;
      return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
    };
    const lum = (r) =>
      r
        .map((x) => {
          const c = x / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        })
        .reduce((a, c, i) => a + [0.2126, 0.7152, 0.0722][i] * c, 0);
    const ratio = (a, b) => {
      const [l1, l2] = [lum(toRgb(a)), lum(toRgb(b))];
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const light = vars.slice(0, vars.indexOf("[data-theme='dark']"));
    const dark = vars.slice(vars.indexOf("[data-theme='dark']"));
    const lightRing = /--focus-ring:\s*(#[0-9a-f]{3,8})/i.exec(light)[1];
    const darkRing = /--focus-ring:\s*(#[0-9a-f]{3,8})/i.exec(dark)[1];
    expect(ratio(lightRing, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(ratio(darkRing, '#1a2942')).toBeGreaterThanOrEqual(3);
  });

  // :focus would leave a ring behind after a mouse click. The browser already
  // knows the difference; the point is to let it decide.
  //
  // Scoped to the ring rules on purpose. `.skip-link:focus` is plain :focus
  // and that is correct: the link is off-screen, so the only way to focus it
  // IS the keyboard, and :focus-visible would add nothing. The first version
  // of this test failed on exactly that correct rule.
  it('the ring rules use :focus-visible, not :focus', () => {
    const block = vars.slice(vars.indexOf('/* ── Focus ring'), vars.indexOf('.skip-link {'));
    expect(block).toMatch(/:focus-visible/);
    expect(block).not.toMatch(/[^-]:focus\s*[,{]/);
  });
});

describe('nothing throws the ring away again', () => {
  const SHEETS = [
    'css/main.css',
    'css/admin.css',
    'css/mechanic.css',
    'css/landing.css',
    'css/home.css',
  ];

  it('no stylesheet kills the outline outside a :focus-visible rule', () => {
    const offenders = [];
    for (const sheet of SHEETS) {
      let css;
      try {
        css = read(sheet);
      } catch {
        continue;
      }
      for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const sel = m[1].trim().replace(/\s+/g, ' ');
        if (!/outline:\s*(none|0)\b/.test(m[2])) continue;
        if (/:focus-visible/.test(sel)) continue;
        if (/a11y-check:\s*off/.test(m[2])) continue;
        offenders.push(`${sheet}: ${sel}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // The one that mattered most: a PIN field with no visible focus.
  it('the mechanic PIN field no longer zeroes its outline', () => {
    const css = read('css/mechanic.css');
    const rule = /(^|\n)\.pin-inp\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule[2]).not.toMatch(/outline:\s*(none|0)/);
  });
});

describe('the guard is wired in and catches regressions', () => {
  const script = read('scripts/a11y-check.mjs');

  it('runs as part of npm run check', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.check).toContain('a11y-check');
    expect(pkg.scripts['a11y:check']).toBe('node scripts/a11y-check.mjs');
  });

  it('exits non-zero when it finds something', () => {
    expect(script).toContain('process.exit(1)');
  });

  // The first version compared the index of `class="skip-link"` - an
  // attribute, always a few characters INSIDE its own <a> - against the index
  // of the first `<a`, and so reported every correct page as broken. Found by
  // running it.
  it('measures the skip link from its tag, not its attribute', () => {
    expect(script).toMatch(/body\.search\(\/<a\\b\[\^>\]\*class="skip-link"/);
    expect(script).not.toMatch(/indexOf\('class="skip-link"'\)/);
  });
});

describe('the new string ships in all three languages', () => {
  it('has es and zh, in the same commit that created it', () => {
    const i18n = read('js/i18n.js');
    for (const lang of ['es', 'zh']) {
      // One block only. Slicing to the end of the file would let a
      // Chinese-only translation satisfy the Spanish assertion - the same
      // bug this caught in scripts/a11y-check.mjs.
      const start = i18n.indexOf(`  ${lang}: {`);
      const others = ['en', 'es', 'zh']
        .filter((l) => l !== lang)
        .map((l) => i18n.indexOf(`  ${l}: {`, start + 1))
        .filter((i) => i > start);
      const block = i18n.slice(start, others.length ? Math.min(...others) : undefined);
      expect(block, `${lang} is missing "Skip to content"`).toContain("'Skip to content'");
    }
  });
});

describe('the changed CSS actually reaches a returning browser', () => {
  // css/main.css carried a hand-typed date string and was NOT in
  // versioned-assets-check, so editing it kept `npm run check` green while the
  // change stayed invisible behind the service worker. Same gap that bit
  // mechanic.html four days earlier.
  it('css/main.css is now a checked asset on both pages', () => {
    const check = read('scripts/versioned-assets-check.mjs');
    expect(check).toContain("path: 'css/main.css'");
    const pages = check.match(/path: 'css\/main\.css'/g) || [];
    expect(pages.length).toBe(2); // index.html and landing.html
  });
});
