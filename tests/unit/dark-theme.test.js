// tests/unit/dark-theme.test.js
//
// Diego, four separate times while walking a real booking end to end: "en dark
// queda que desear la aplicacion, no se notan los cuadros ni las divisiones".
//
// The cause was not any one rule. Dark mode had no token layer at all: 98
// tokens in :root, zero dark values, and each surface patching its own classes
// by hand - 149 [data-theme='dark'] selectors in css/admin.css alone. Whatever
// nobody remembered to patch kept its LIGHT value, silently.
//
// scripts/dark-theme-check.mjs enforces coverage and contrast on every build.
// These tests protect the SHAPE that makes that check meaningful - a second
// private palette would pass the check and still put the app back where it was.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const vars = read('css/variables.css');
const adminCss = read('css/admin.css');
const mechCss = read('css/mechanic.css');

const darkBlock = vars.match(/\[data-theme='dark'\]\s*\{([\s\S]*?)^\}/m)?.[1] ?? '';

describe('one dark palette, in one file', () => {
  it('css/variables.css defines it', () => {
    expect(darkBlock).not.toBe('');
    const tokens = [...darkBlock.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)];
    expect(tokens.length).toBeGreaterThan(40);
  });

  // Both stylesheets load AFTER variables.css, so a private block here would
  // win over the shared one - which is exactly how the product ended up with
  // two disagreeing dark themes (#1c1c1e neutral in admin, #152035 navy in
  // mechanic) in the first place.
  it('and no surface keeps a private one', () => {
    for (const [name, css] of [
      ['css/admin.css', adminCss],
      ['css/mechanic.css', mechCss],
    ]) {
      const own = css.match(/\[data-theme='dark'\]\s*\{[^}]*--[a-z]/);
      expect(own, `${name} redefines tokens in its own [data-theme='dark'] block`).toBeNull();
    }
  });
});

describe('the two jobs --navy used to do are separate', () => {
  // --navy was the ink of nearly every label AND the background of the admin
  // sidebar. A token that means two things cannot be themed: lightening it for
  // dark text turns the sidebar white.
  it('--navy-surface exists for the background half', () => {
    expect(vars).toMatch(/--navy-surface:\s*#0d1f3c;/);
  });

  it('and nothing paints a background with --navy any more', () => {
    for (const [name, src] of [
      ['css/admin.css', adminCss],
      ['admin.html', read('admin.html')],
    ]) {
      expect(src, `${name} still uses --navy as a background`).not.toMatch(
        /background:\s*var\(--navy\)/
      );
    }
  });

  // The point of the split: --navy-surface must NOT follow the theme.
  it('--navy-surface stays dark in dark mode', () => {
    expect(darkBlock).not.toMatch(/--navy-surface\s*:/);
  });

  it('while --navy itself becomes light ink', () => {
    expect(darkBlock).toMatch(/--navy:\s*#eef2f7;/);
  });
});

describe('the fragile substring hacks are gone', () => {
  // `[data-theme='dark'] .main [style*='color:var(--navy)'] { color: #f2f2f7
  // !important }` matched an inline style by substring. It only ever worked
  // inside .main, so every modal js/admin.js appends to <body> was uncovered -
  // near-black text on a near-black card. The token now resolves correctly on
  // its own, which is what made these deletable.
  it('admin.css no longer patches --navy, --mgray or --gray by inline style', () => {
    for (const token of ['--navy', '--mgray', '--gray']) {
      expect(adminCss, `still patches ${token}`).not.toMatch(
        new RegExp(`\\[style\\*='color:var\\(${token}\\)'\\]`)
      );
    }
  });
});

describe('the guard is wired into the gate', () => {
  it('npm run check runs it', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.check).toMatch(/scripts\/dark-theme-check\.mjs/);
  });

  // A check that only reports missing tokens would pass a palette of navy on
  // navy. Contrast is the actual requirement.
  it('and the guard measures contrast, not just presence', () => {
    const guard = read('scripts/dark-theme-check.mjs');
    expect(guard).toMatch(/const INK = \[/);
    expect(guard).toMatch(/const FILL = \[/);
    expect(guard).toMatch(/0\.2126 \* r \+ 0\.7152 \* g \+ 0\.0722 \* b/);
  });
});

describe('the caches were bumped', () => {
  // css/variables.css and css/mechanic.css are served by sw.js. Without a new
  // ?v= and a new cache name, a returning browser keeps the old stylesheet and
  // the fix is invisible to exactly the people who already use the app.
  it('every dark-capable page asks for a versioned stylesheet', () => {
    for (const page of ['admin.html', 'mechanic.html']) {
      expect(read(page), `${page} loads variables.css with no ?v=`).toMatch(
        /css\/variables\.css\?v=[A-Za-z0-9-]+/
      );
    }
  });

  // css/mechanic.css and js/mechanic.js used to carry hand-typed date strings,
  // which CLAUDE.md flagged as the remaining cache gap. It bit exactly as
  // predicted: a merge between two branches that had both bumped that line
  // resolved to the OLDER value and silently undid the bust, with nothing red.
  // They are content hashes now, so scripts/versioned-assets-check.mjs cannot
  // be satisfied by the wrong side of a merge.
  it('and the mechanic assets are hashes the build can verify, not dates', () => {
    const check = read('scripts/versioned-assets-check.mjs');
    expect(check).toMatch(/html: 'mechanic\.html'/);
    expect(check).toMatch(/path: 'css\/mechanic\.css'/);
    expect(check).toMatch(/path: 'js\/mechanic\.js'/);
    expect(read('mechanic.html')).toMatch(/css\/mechanic\.css\?v=[0-9a-f]{10}/);
    expect(read('mechanic.html')).toMatch(/js\/mechanic\.js\?v=[0-9a-f]{10}/);
  });

  // Pinned as a MINIMUM, not as a literal. The first version of this test
  // asserted exactly v91 and went red the moment another branch bumped the same
  // line to v96 - a failure that reported a merge, not a bug. What has to stay
  // true is that the name moved past the value this fix shipped against.
  it('and the service worker cache name moved past the old one', () => {
    const name = read('sw.js').match(/CACHE_STATIC = 'drbike-static-v(\d+)'/);
    expect(name, 'CACHE_STATIC is missing or no longer numbered').not.toBeNull();
    expect(Number(name[1])).toBeGreaterThanOrEqual(91);
  });
});
