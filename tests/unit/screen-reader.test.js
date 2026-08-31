// tests/unit/screen-reader.test.js
//
// Audit point 15: "que anuncie el cambio de paso, que lea los errores al
// ocurrir, y que el mapa tenga alternativa en texto."
//
// The app had exactly two aria-live regions and both were loading spinners.
// A failed payment, a step change in the booking wizard, and the mechanic
// moving across the map were all announced to nobody.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const components = read('js/components.js');
const app = read('js/app.js');
const vars = read('css/variables.css');
const i18n = read('js/i18n.js');

// One language block, not "from here to the end of the file". Slicing to the
// end lets a Chinese-only translation satisfy the Spanish assertion - a bug
// that shipped in the first version of scripts/a11y-check.mjs and passed on a
// real missing translation until it was deleted on purpose.
function langBlock(lang) {
  const start = i18n.indexOf(`  ${lang}: {`);
  const others = ['en', 'es', 'zh']
    .filter((l) => l !== lang)
    .map((l) => i18n.indexOf(`  ${l}: {`, start + 1))
    .filter((i) => i > start);
  return i18n.slice(start, others.length ? Math.min(...others) : undefined);
}

describe('there is a way to reach a screen reader at all', () => {
  it('announce() exists and is exported', () => {
    expect(components).toContain('export function announce(');
  });

  // Persistent regions written into, not a fresh element carrying its text.
  // A live region is announced when its CONTENT changes; an element that
  // arrives already holding the text is announced inconsistently, and in some
  // combinations not at all.
  it('writes into persistent regions rather than inserting new ones', () => {
    expect(components).toContain("el.setAttribute('aria-live', mode)");
    expect(components).toMatch(/_liveRegions\s*=\s*\{ polite:/);
  });

  it('has both a polite and an assertive channel', () => {
    expect(components).toContain("make('polite')");
    expect(components).toContain("make('assertive')");
    expect(components).toContain("mode === 'assertive' ? 'alert' : 'status'");
  });

  // Two failed payments in a row is a real sequence, and a live region whose
  // text did not change says nothing at all.
  it('re-announces the same string by clearing first', () => {
    const fn = components.slice(components.indexOf('export function announce('));
    expect(fn).toContain("region.textContent = ''");
    expect(fn).toContain('requestAnimationFrame');
  });

  it('the hidden regions are hidden without leaving the a11y tree', () => {
    const rule = vars.slice(vars.indexOf('.sr-only {'), vars.indexOf('.sr-only {') + 400);
    expect(rule).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(rule).not.toMatch(/display:\s*none/);
    expect(rule).not.toMatch(/visibility:\s*hidden/);
  });
});

describe('errors are read when they happen', () => {
  it('showToast announces, and errors interrupt', () => {
    const fn = components.slice(components.indexOf("export function showToast("));
    expect(fn).toContain("announce(message, { assertive: type === 'error' })");
  });

  // Without this the reader says the same sentence twice: once for the toast
  // appearing, once for the live region.
  it('the toast itself is hidden from the reader', () => {
    expect(components).toContain("toast.setAttribute('aria-hidden', 'true')");
  });
});

describe('the booking wizard says which step you are on', () => {
  // The three steps re-render inside the SAME screen without touching the
  // hash, so a screen reader got no signal at all - the reader just found
  // different content under the cursor.
  it('all three steps announce themselves', () => {
    const calls = app.match(/scrollStepToTop\('Step \d of 3/g) || [];
    expect(calls).toHaveLength(3);
  });

  it('announces from the one place that runs on every step change', () => {
    const fn = app.slice(app.indexOf('function scrollStepToTop('), app.indexOf('function renderStep1'));
    expect(fn).toContain('if (stepLabel) announce(stepLabel)');
  });
});

describe('the map has a text alternative', () => {
  // A canvas of map tiles is not readable. A reader landing in it finds an
  // unlabelled blank, which is worse than nothing.
  it('the map is hidden from the reader', () => {
    expect(app).toMatch(/id="tracking-map"[^>]*aria-hidden="true"/);
  });

  it('and is replaced by text that says the same thing', () => {
    expect(app).toContain('id="map-alt"');
    expect(app).toContain('function describeMap(');
  });

  it('the text follows the ETA, so it is never stale', () => {
    const fn = app.slice(app.indexOf('function paintETA('), app.indexOf('function describeMap('));
    expect(fn).toContain('describeMap(');
  });

  // This repaints every few seconds as the mechanic moves. A reader repeating
  // the same sentence on a loop is worse than silence.
  it('does not repeat itself on every position update', () => {
    const fn = app.slice(app.indexOf('function describeMap('));
    expect(fn).toContain('text === _lastMapAlt');
  });

  it('covers the arrival case too', () => {
    expect(app).toContain("describeMap(translateValue('Mechanic is right outside!'))");
  });
});

describe('every spoken string exists in all three languages', () => {
  // These are passed INTO translateValue() through announce(), and
  // scripts/i18n-check.mjs only sees strings OUTSIDE it. That is the gap
  // CLAUDE.md documents: a missing translation here is silent, the string
  // simply comes out in English. So it is asserted here instead.
  const SPOKEN = [
    'Step 1 of 3: choose a service',
    'Step 2 of 3: choose a date and time',
    'Step 3 of 3: your address',
    'Mechanic on the way',
    'Live map. Waiting for the mechanic position.',
  ];

  for (const lang of ['es', 'zh']) {
    it(`${lang} has all ${SPOKEN.length}`, () => {
      const block = langBlock(lang);
      expect(block.length).toBeGreaterThan(100);
      for (const s of SPOKEN) {
        expect(block, `${lang} is missing "${s}"`).toContain(`'${s}'`);
      }
    });
  }

  // The slicing bug this file's langBlock() exists to avoid: if the helper
  // ran to the end of the file, the es block would contain the zh block and
  // any zh-only translation would pass as Spanish.
  it('a language block stops before the next language', () => {
    expect(langBlock('es')).not.toContain("  zh: {");
  });
});

describe('the guard covers all of this', () => {
  const guard = read('scripts/a11y-check.mjs');

  it('checks the announcer, the map and the steps', () => {
    expect(guard).toContain('export function announce(');
    expect(guard).toContain('id="map-alt"');
    expect(guard).toContain("scrollStepToTop\\('Step ");
  });

  it('slices one language block, not to end of file', () => {
    expect(guard).toContain('function langBlockOf(');
    expect(guard).not.toContain('dict.slice(dict.indexOf(`  ${lang}: {`))');
  });
});
