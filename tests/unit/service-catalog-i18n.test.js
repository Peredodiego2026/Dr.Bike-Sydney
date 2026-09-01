// tests/unit/service-catalog-i18n.test.js
//
// Booking step 1 renders the Supabase `services` catalog verbatim: js/app.js
// renderStep1 -> createServiceCard prints `name` and `description` exactly as
// the table returns them, and js/i18n.js translates them afterwards as a text
// pass keyed on the exact English string.
//
// So the catalog's wording is user-facing copy that lives in a database, and
// scripts/i18n-check.mjs - which reads the SURFACES - has never been able to
// see it. On 2026-08-31 that blind spot was hiding 32 of 33 descriptions and
// 11 of 33 names, rendering in English to every Spanish and Chinese client
// while `npm run check` printed a clean run.
//
// What is pinned here:
//   1. the block-slicing bug that made the same class of check lie before
//      (docs/PENDIENTES.md 66) cannot come back;
//   2. every catalog string as of 2026-08-31 has an es AND a zh entry;
//   3. renaming a catalog row to a translation a MARKETING name already owns
//      does not break js/live-prices.js's reverse lookup;
//   4. the hero button's rename landed on both surfaces and in both languages.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { hasKey, dictBlock, missingCatalogTranslations } from '../../scripts/lib/dict-keys.mjs';
import { dictSource, composedSource } from '../helpers/i18n-source.js';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
// Un archivo por idioma desde el split del 01-sep-2026. Se componen con los
// marcadores viejos para que el recorte de abajo siga funcionando igual - y
// ahora el aislamiento es estructural: el contenido de `es` termina donde
// empieza el archivo de `zh`, asi que una traduccion china ya no puede
// satisfacer una afirmacion sobre el espanol (PENDIENTES 66).
const i18nSrc = ['  es: {', dictSource('es'), '  zh: {', dictSource('zh')].join('\n');

// setLang() dispatches on `document`, which the node test environment has no
// version of. The shim has to be in place before the module is evaluated, and
// a static import would hoist above it.
globalThis.document = globalThis.document || { dispatchEvent: () => {} };
const { setLang, translateValue, sourceOf } = await import('../../js/i18n.js');

// The Supabase `services` table as read on 2026-08-31 (33 rows, `npm run
// services:check` reads the live one). Frozen here so the dictionary entries
// cannot be deleted without a red test - and so this suite says nothing about
// rows added later, which is what the network check is for.
const CATALOG = [
  ['Brake Adjustment', 'Pad alignment, cable tension, lever reach'],
  ['Hydro Brake Install', 'Full hydraulic brake system installation.'],
  ['Brake Pad Install', 'Disc brake pad replacement per end.'],
  ['Brake Bleed', 'Full hydraulic bleed per end. Both ends $105.'],
  ['Saddle Fitting', 'Height, fore-aft and tilt optimised'],
  ['Bar Tape Install', 'Professional bar tape wrap on drop bars.'],
  ['Handlebar Install', 'Remove and refit handlebars.'],
  ['Headset Service', 'Clean, adjust and regrease headset'],
  [
    'True Hanger Derailleur',
    'True the hanger derailleur with specifics tools. The setting of the gears are included in the price',
  ],
  ['Chain Install', 'Fit and size a new chain.'],
  ['Cassette Install', 'Cassette removal and refitting.'],
  ['Bottom Bracket Install', 'BB removal and new unit installation.'],
  ['Firmware Update', 'Software update for e-bike motor and display.'],
  ['E-bike Diagnostic', 'Full system scan, firmware check and error code review.'],
  [
    'E-bike service',
    'Check cables connections and all the bolts and adjustments of brakes and gears',
  ],
  ['Derailleur Install', 'Front or rear derailleur installation.'],
  ['Gear Adjustment', 'Derailleur indexing and cable tension adjustment.'],
  ['External Cable Install', 'Replace outer and inner cables.'],
  ['Accessory / Part Install', 'Professional fitting of accessories.'],
  [
    'Bike Assembly',
    'Full assembly of a new boxed bike. Price change depending on the size and kind of bike.',
  ],
  [
    'Emergency Service',
    'Urgent same-day help. Contact us directly on 0433 963 250 and we quote your repair.',
  ],
  ['Tune-Up', 'Safety check, gear & brake adjustment, tyre pressure and drivetrain lube.'],
  ['Standard Service', 'Tune-Up plus drivetrain clean, minor wheel true and inspection report.'],
  ['Standard+ Service', 'Everything in Standard plus new cables, wheel truing and headset check.'],
  [
    'Ultimate Overhaul',
    'Complete strip-and-rebuild. Every component inspected, adjusted or replaced.',
  ],
  ['Air Can Service', 'Air spring disassembly and new o-rings.'],
  ['Lower Leg Service', 'Full lower leg strip, clean and oil refresh.'],
  ['Wheel Truing — Minor', 'Spoke tension adjustment for small deviations.'],
  ['Tyre / Tube Install', 'Tyre and tube replacement per wheel.'],
  ['Wheel Truing — Major', 'Significant spoke tension correction.'],
  ['Tubeless Tyre Install', 'Tubeless conversion per wheel.'],
  ['Spoke Replacement', 'Per spoke, includes wheel re-true'],
  ['Tyre Replacement', 'New tyre fitted, tyre cost extra'],
];
const services = CATALOG.map(([name, description]) => ({ name, description }));

describe('the dictionary slicer', () => {
  // The bug this replaces: slicing from '  es: {' to the end of the file
  // carries the zh block along, so a string translated ONLY into Chinese
  // reports as present in Spanish and ships in English.
  const fake = [
    'const dict = {',
    '  es: {',
    "    'only in spanish': 'solo en espanol',",
    '  },',
    '  zh: {',
    "    'only in chinese': 'zhi you zhongwen',",
    '  },',
    '};',
  ].join('\n');

  it('does not let the zh block leak into es', () => {
    expect(hasKey(dictBlock(fake, 'es'), 'only in chinese')).toBe(false);
  });

  it('and reads the last language up to the closing brace, not past it', () => {
    expect(hasKey(dictBlock(fake, 'zh'), 'only in chinese')).toBe(true);
    expect(hasKey(dictBlock(fake, 'zh'), 'only in spanish')).toBe(false);
  });

  // Returning '' would report every key as missing, which reads like a content
  // problem instead of the parser problem it is.
  it('returns null when the marker is gone, rather than an empty block', () => {
    expect(dictBlock('const dict = { fr: {} };', 'es')).toBe(null);
  });

  it('finds a key under either quote style prettier may pick', () => {
    expect(hasKey(`  'plain': 'x',`, 'plain')).toBe(true);
    expect(hasKey(`  "it's": 'x',`, "it's")).toBe(true);
  });

  // lint-staged runs `prettier --write` on every js/**/*.js at commit time, and
  // quoteProps: "as-needed" drops the quotes from identifier-like keys. Two
  // older tests counted occurrences of "'ETA':" and "'Saved':" and went red the
  // first time anything touched js/i18n.js through that hook.
  it('finds a key prettier has unquoted', () => {
    expect(hasKey("  ETA: 'Llegada',", 'ETA')).toBe(true);
    expect(hasKey("{ Saved: 'Guardado' }", 'Saved')).toBe(true);
  });

  it('does not mistake a longer key for a shorter one', () => {
    expect(hasKey("  NotETA: 'x',", 'ETA')).toBe(false);
    expect(hasKey("  'ETA sign': 'x',", 'ETA')).toBe(false);
  });
});

describe('missingCatalogTranslations', () => {
  it('names the languages a string is missing from', () => {
    const src = [
      'const dict = {',
      '  es: {',
      "    'Tune-Up': 'Puesta a punto',",
      "    'Nice.': 'Lindo.',",
      '  },',
      '  zh: {',
      "    'Tune-Up': '基础保养',",
      '  },',
      '};',
    ].join('\n');
    const rows = missingCatalogTranslations([{ name: 'Tune-Up', description: 'Nice.' }], src);
    expect(rows).toEqual([
      { service: 'Tune-Up', kind: 'description', text: 'Nice.', missing: ['zh'] },
    ]);
  });

  it('says nothing about a service with no description', () => {
    const src = "const dict = {\n  es: {\n    'X': 'X',\n  },\n  zh: {\n    'X': 'X',\n  },\n};";
    expect(missingCatalogTranslations([{ name: 'X', description: null }], src)).toEqual([]);
  });

  // A parser that quietly stops matching is the failure mode this repo keeps
  // hitting. Silence must not be mistakable for success.
  it('throws rather than reporting a clean run when the dictionary is unreadable', () => {
    expect(() => missingCatalogTranslations(services, 'not a dictionary')).toThrow(/js\/i18n\.js/);
  });
});

describe('the shipped dictionary covers the whole catalog', () => {
  it('every name and description has an es and a zh entry', () => {
    expect(missingCatalogTranslations(services, i18nSrc)).toEqual([]);
  });

  // The point of the exercise: a Spanish client must not read English.
  it('really returns Spanish, not the English fallback', async () => {
    // setLang es asincrono desde que los diccionarios se cargan por idioma: el
    // idioma cambia RECIEN cuando su archivo llego, para que nada se pinte a
    // medio traducir. La app hace este mismo await en el arranque.
    await setLang('es');
    for (const [, description] of CATALOG) {
      expect(translateValue(description)).not.toBe(description);
    }
    expect(translateValue('Fit and size a new chain.')).toBe(
      'Colocamos una cadena nueva y la dejamos a la medida.'
    );
  });

  it('and really returns Chinese', async () => {
    await setLang('zh');
    for (const [, description] of CATALOG) {
      expect(translateValue(description)).not.toBe(description);
    }
    expect(translateValue('Fit and size a new chain.')).toBe('安装新链条并调整到合适长度。');
  });
});

// js/live-prices.js reads a rendered card heading back out of the DOM and maps
// it to a priced row: sourceOf(heading) -> NAME_MAP -> services.find(name).
// sourceOf's reverse index keeps the FIRST English source defined for a given
// translation, so any OTHER English string that happens to share a translation
// with a card heading steals the lookup, and that card keeps its hardcoded
// price forever for that language - silently, behind a console.warn.
//
// This is not hypothetical. Writing this test found two live ones, both
// Chinese-only and both older than the change that added it: the js/app.js
// bullet 'Pad replacement' and the card 'Brake Pad Replacement' both said
// 刹车片更换, and 'Bottom bracket service' and 'Bottom Bracket Service' both said
// 五通保养. Spanish had distinct wording for all four and was never affected,
// which is why nobody found it by reading the file. Fixed by rewording the two
// bullets - they are display-only and never read back out of the DOM.
describe('the reverse lookup still lands on a real service', () => {
  // Read the real map out of the real file. A regex over the whole file would
  // also swallow unrelated object literals and quietly test the wrong thing.
  const mapBlock = read('js/live-prices.js').match(/const NAME_MAP = \{([\s\S]*?)\n {2}\};/);
  const NAME_MAP = Object.fromEntries(
    [...(mapBlock?.[1] ?? '').matchAll(/'([^']+)':\s*'([^']+)',/g)].map((m) => [m[1], m[2]])
  );
  const catalogNames = new Set(CATALOG.map(([name]) => name));

  it('parsed the marketing alias map (an empty one would prove nothing)', () => {
    expect(Object.keys(NAME_MAP).length).toBeGreaterThan(8);
    for (const target of Object.values(NAME_MAP)) expect(catalogNames.has(target)).toBe(true);
  });

  // Everything a card heading can say in English: the marketing aliases and
  // the catalog names, since suburb pages and the wizard render both.
  const headings = [...new Set([...Object.keys(NAME_MAP), ...catalogNames])];

  for (const lang of ['es', 'zh']) {
    it(`resolves every translated card heading back to a catalog row in ${lang}`, () => {
      setLang(lang);
      for (const english of headings) {
        const heading = translateValue(english); // what the visitor sees
        const recovered = sourceOf(heading); // what live-prices.js gets back
        const lookup = NAME_MAP[recovered] || recovered;
        expect(
          catalogNames.has(lookup),
          `${lang}: "${english}" renders as "${heading}", recovered as "${recovered}", ` +
            `looked up as "${lookup}" - which is not a service`
        ).toBe(true);
      }
    });
  }
});

describe('the hero fee button', () => {
  const index = read('index.html');
  const landing = read('landing.html');

  it('says the same thing on mobile and desktop', () => {
    expect(index).toContain('Check my diagnosis fee');
    expect(landing).toContain('Check my diagnosis fee');
  });

  // An orphan key is dead weight the next reader has to disprove, and the old
  // wording reappearing on one surface is exactly how this project ends up
  // with two names for one thing.
  it('leaves no trace of the old wording on either surface or in the dictionary', () => {
    for (const src of [index, landing, i18nSrc]) {
      expect(src).not.toContain('What does a visit cost');
    }
  });

  // await en los dos setLang: desde que los diccionarios se cargan por idioma,
  // el cambio ocurre cuando su archivo llego, no antes. Sin esperar, esta
  // afirmacion leia el idioma que dejo puesto el test anterior.
  it('is translated into both languages', async () => {
    await setLang('es');
    expect(translateValue('Check my diagnosis fee')).toBe('Calculá el precio de tu diagnóstico');
    await setLang('zh');
    expect(translateValue('Check my diagnosis fee')).toBe('查询上门检查费');
  });

  // The button quotes a fee the invoice, the email, the admin and the pay
  // button all call "visit & diagnosis". "Diagnostic" would have been a fourth
  // word for one thing; the Chinese keeps 上门检查费 for the same reason.
  it('uses the same vocabulary as the service it prices', () => {
    setLang('en');
    expect(read('js/app.js')).toContain("We'll check your visit & diagnosis fee");
    expect(i18nSrc).toContain('上门检查费');
  });
});
