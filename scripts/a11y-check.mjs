#!/usr/bin/env node
// scripts/a11y-check.mjs — the keyboard basics, enforced.
//
// Audit point 13. Two things were missing and neither is visible to anyone
// using a mouse, which is why they survived this long:
//
//   1. No skip link anywhere. A keyboard user tabbed through the entire header
//      before reaching the page, on every single screen change.
//   2. No global focus style, and four inputs zeroed the browser's own ring
//      with `outline: none` in their BASE rule - which applies on focus too.
//      One of them is the mechanic's PIN field: tab into it and nothing on
//      screen tells you where you are.
//
// Both are the kind of regression that reappears the moment someone thinks a
// focus ring looks untidy, so they are checked rather than remembered.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const problems = [];

// ── 1. The pages a visitor actually lands on need a skip link ───────────────
// admin and mechanic are staff tools behind a login, reached by people who use
// them all day; the public pages are where this matters.
for (const page of ['index.html', 'landing.html']) {
  const html = read(page);
  if (!/class="skip-link"/.test(html)) {
    problems.push(`${page}: no skip link. A keyboard user tabs the whole header first.`);
    continue;
  }
  const href = /class="skip-link"\s+href="#([^"]+)"/.exec(html)?.[1];
  if (!href) {
    problems.push(`${page}: the skip link has no href="#target".`);
  } else if (!new RegExp(`id="${href}"`).test(html)) {
    problems.push(`${page}: the skip link points at #${href}, which does not exist on the page.`);
  }
  // It has to be reachable before everything else, or it is decoration.
  //
  // Both positions are measured from the START OF THE TAG. The first version
  // compared the index of `class="skip-link"` - an attribute, so always a few
  // characters INSIDE its own <a> - against the index of the first `<a`, and
  // so reported every correct page as broken.
  const body = html.slice(html.indexOf('<body'));
  const linkAt = body.search(/<a\b[^>]*class="skip-link"/i);
  const firstFocusable = body.search(/<(a|button|input|select|textarea)\b/i);
  if (linkAt !== firstFocusable) {
    problems.push(`${page}: the skip link is not the first focusable thing in the body.`);
  }
}

// ── 2. A focus ring that exists, and is not thrown away ─────────────────────
const vars = read('css/variables.css');
if (!/:focus-visible\s*\{[^}]*outline:/.test(vars)) {
  problems.push('css/variables.css: no global :focus-visible outline.');
}
// variables.css is the only stylesheet all five surfaces load - track.html
// loads nothing else - so a focus style anywhere else leaves a surface bare.
if (!/--focus-ring:/.test(vars)) {
  problems.push('css/variables.css: --focus-ring is not defined.');
}
const darkBlock = vars.slice(vars.indexOf("[data-theme='dark']"));
if (!/--focus-ring:/.test(darkBlock)) {
  problems.push("css/variables.css: --focus-ring has no [data-theme='dark'] value.");
}

// `outline: none` in a rule that is not itself a :focus-visible rule removes
// the ring for keyboard users. Allowed only where a focus style sits in the
// same file for the same selector - which is what the comment below asks the
// author to add.
const SHEETS = [
  'css/main.css',
  'css/admin.css',
  'css/mechanic.css',
  'css/landing.css',
  'css/home.css',
];
for (const sheet of SHEETS) {
  let css;
  try {
    css = read(sheet);
  } catch {
    continue;
  }
  // Split into rules so the selector that owns each declaration is knowable.
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const body = m[2];
    if (!/outline:\s*(none|0)\b/.test(body)) continue;
    if (/:focus-visible/.test(selector)) continue; // deliberate, and scoped
    if (/a11y-check:\s*off/.test(body)) continue; // opt out, in writing
    const line = css.slice(0, m.index).split('\n').length;
    problems.push(
      `${sheet}:${line}: \`${selector}\` sets outline:none, which also removes the ` +
        `keyboard focus ring. Scope it to :focus-visible, or add a visible focus ` +
        `style and mark this rule with /* a11y-check: off */ saying why.`
    );
  }
}


// Slice ONE language block, not "from here to the end of the file".
//
// The first version used dict.slice(indexOf(`  ${lang}: {`)) - which, for es,
// runs all the way past the zh block. A string translated ONLY into Chinese
// therefore satisfied the Spanish check too, and the guard passed on a real
// missing translation. Found by deleting one on purpose; it would never have
// shown up otherwise.
function langBlockOf(dict, lang) {
  const start = dict.indexOf(`  ${lang}: {`);
  if (start === -1) return '';
  const ends = ['en', 'es', 'zh']
    .filter((l) => l !== lang)
    .map((l) => dict.indexOf(`  ${l}: {`, start + 1))
    .filter((i) => i > start);
  return dict.slice(start, ends.length ? Math.min(...ends) : undefined);
}
// ── 3. A screen reader is told when something happens ───────────────────────
// Audit point 15: the app had two aria-live regions, both loading spinners. An
// error, a step change, and the mechanic moving on the map were all announced
// to nobody.
//
// Checked with includes() rather than regexes on purpose - these assertions are
// about literal source text, and a regex here buys nothing but escaping bugs.
const components = read('js/components.js');
const app = read('js/app.js');

if (!components.includes('export function announce(')) {
  problems.push('js/components.js: no announce() helper - nothing can reach a screen reader.');
}
// Persistent regions, written into. An element that arrives already holding its
// text is announced inconsistently, and not at all in some combinations.
if (!components.includes('aria-live')) {
  problems.push('js/components.js: announce() builds no aria-live region.');
}
// An error must interrupt; a success must not.
if (!components.includes("assertive: type === 'error'")) {
  problems.push('js/components.js: showToast does not announce errors assertively.');
}
// The toast text is announced through the live region; without aria-hidden a
// screen reader reads the same message twice.
if (!components.includes("toast.setAttribute('aria-hidden', 'true')")) {
  problems.push('js/components.js: the toast is not aria-hidden, so it is read twice.');
}

// The map is a canvas of tiles: hidden from the reader AND replaced by text.
if (!app.includes('id="tracking-map"') || !app.includes('aria-hidden="true" role="presentation"')) {
  problems.push('js/app.js: the tracking map is not aria-hidden - a reader finds an unlabelled blank.');
}
if (!app.includes('id="map-alt"')) {
  problems.push('js/app.js: the map has no #map-alt text equivalent.');
}

// The three wizard steps re-render inside the SAME screen without touching the
// hash, so nothing else signals the change.
const stepCalls = (app.match(/scrollStepToTop\('Step /g) || []).length;
if (stepCalls < 3) {
  problems.push(`js/app.js: only ${stepCalls} of 3 booking steps announce themselves.`);
}

// These strings go INTO translateValue() via announce(), so
// scripts/i18n-check.mjs cannot see them - the gap CLAUDE.md documents. A
// missing translation here is silent: the string simply comes out in English.
const SPOKEN = [
  'Step 1 of 3: choose a service',
  'Step 2 of 3: choose a date and time',
  'Step 3 of 3: your address',
  'Mechanic on the way',
  'Live map. Waiting for the mechanic position.',
];
const dict = read('js/i18n.js');
for (const lang of ['es', 'zh']) {
  const langBlock = langBlockOf(dict, lang);
  for (const s of SPOKEN) {
    if (!langBlock.includes(`'${s}'`)) {
      problems.push(
        `js/i18n.js: "${s}" has no ${lang} translation (spoken string - i18n-check cannot see it).`
      );
    }
  }
}

// ── 4. The skip link's own words exist in all three languages ───────────────
const i18n = read('js/i18n.js');
for (const lang of ['es', 'zh']) {
  const block = langBlockOf(i18n, lang);
  if (!block.includes("'Skip to content'")) {
    problems.push(`js/i18n.js: "Skip to content" has no ${lang} translation.`);
  }
}

if (problems.length) {
  console.error(`\na11y-check: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  x ${p}`);
  console.error('');
  process.exit(1);
}
console.log('a11y-check: OK - skip links present and wired, focus ring defined in both themes.');
