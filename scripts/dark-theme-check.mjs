#!/usr/bin/env node
// scripts/dark-theme-check.mjs
//
// Fails if a colour token that admin or mechanic actually uses has no value
// under [data-theme='dark'] in css/variables.css.
//
// WHY THIS EXISTS
// Dark mode used to be maintained by hand, one CSS rule at a time:
// css/admin.css carried 149 [data-theme='dark'] selectors patching individual
// classes, and css/mechanic.css redefined 11 tokens of its own. Anything
// nobody remembered to patch kept its LIGHT value, and nothing anywhere said
// so. js/admin.js writes `color:var(--navy)` inline 68 times; --navy is
// #0d1f3c, so in dark mode that was near-black ink on a near-black card. The
// borders were worse: #e2e8f0, a light-grey hairline, drawn on navy - which is
// why the report was "no se notan los cuadros ni las divisiones".
//
// The failure mode is invisible to every other check in this repo. The page
// renders, the CSS is valid, no test fails, and the text is simply unreadable
// for anyone with the theme switched on. So the token table itself is the
// thing under test: use a colour token on a dark surface and it must have a
// dark value.
//
// SCOPE: only the two surfaces that can BE dark. Nothing sets data-theme on
// index.html or landing.html (grep documentElement.setAttribute), so the
// client SPA and the landing are deliberately out of scope - adding them would
// demand dark values for tokens no dark page ever renders.
import { readFileSync } from 'node:fs';

const VARS = 'css/variables.css';
const SURFACES = ['css/admin.css', 'js/admin.js', 'admin.html', 'css/mechanic.css', 'js/mechanic.js', 'mechanic.html'];

// A token whose value is deliberately the same in both themes. Each one needs
// a reason, so an omission can never hide here as an "exception".
const SAME_IN_BOTH = new Set([
  // A dark ground in BOTH themes - the admin sidebar, the report header. This
  // is the half of the old --navy that must NOT follow the theme; splitting it
  // out is what let --navy become themable ink at all.
  '--navy-surface',
  // WhatsApp's own green. It identifies WhatsApp, not us - shifting it for the
  // theme would make the button read as some other product's.
  '--wa',
  // Not colours.
  '--sans',
  '--r',
  '--radius',
]);

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const vars = readFileSync(VARS, 'utf8');
const rootBlock = strip(vars).split(/:root\s*\{/)[1]?.split(/^\}/m)[0] ?? '';
const darkBlock = strip(vars).match(/\[data-theme='dark'\]\s*\{([\s\S]*?)^\}/m)?.[1] ?? '';

const valueOf = (block, token) =>
  block.match(new RegExp('(?:^|;|\\{)\\s*' + token + '\\s*:\\s*([^;]+);', 'm'))?.[1]?.trim() ?? null;

const declared = [...rootBlock.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)].map((m) => [
  m[1],
  m[2].trim(),
]);
const isColour = (v) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v);
const colourTokens = new Map(declared.filter(([, v]) => isColour(v)));

const problems = [];

if (!darkBlock.trim()) {
  problems.push(
    `${VARS} has no [data-theme='dark'] block. That block is the whole dark theme; ` +
      `without it every token keeps its light value on a dark page.`
  );
}

// Which tokens do the two dark-capable surfaces actually reference?
const used = new Map();
for (const file of SURFACES) {
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const m of src.matchAll(/var\((--[a-z0-9-]+)/gi)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(file);
  }
}

for (const [token, files] of [...used].sort()) {
  if (SAME_IN_BOTH.has(token)) continue;
  if (!colourTokens.has(token)) continue; // not a colour, or not declared here
  if (valueOf(darkBlock, token) !== null) continue;
  problems.push(
    `${token} is used by ${[...files].join(', ')} but has no value under ` +
      `[data-theme='dark'] in ${VARS}, so it keeps its light value (${colourTokens.get(token)}) ` +
      `on a dark page. Add a dark value, or add ${token} to SAME_IN_BOTH in this script ` +
      `with the reason it must not follow the theme.`
  );
}

// A dark value that is byte-identical to the light one is almost always a
// copy-paste rather than a decision - and it is exactly what an unreadable
// token looks like from the outside. SAME_IN_BOTH is where a real one goes.
for (const [token, lightValue] of colourTokens) {
  const darkValue = valueOf(darkBlock, token);
  if (darkValue === null || SAME_IN_BOTH.has(token)) continue;
  if (darkValue.toLowerCase() === lightValue.toLowerCase()) {
    problems.push(
      `${token} has the same value in both themes (${lightValue}). If that is deliberate, ` +
        `move it to SAME_IN_BOTH in this script and say why; if it is not, give it a dark value.`
    );
  }
}

// A dark value for a token nobody declares in :root would never apply.
for (const m of darkBlock.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)) {
  const token = m[1];
  if (!declared.some(([t]) => t === token)) {
    problems.push(
      `${token} is defined under [data-theme='dark'] but never in :root. A token that only ` +
        `exists in one theme is undefined in the other - remove it or declare it in :root too.`
    );
  }
}

// ── Contrast ────────────────────────────────────────────────────────────────
// Presence is not the point; readability is. A token can have a dark value and
// still be unreadable, which is the whole failure this script exists to stop.
//
// Two roles, pulled from how admin and mechanic actually use each token (the
// counts are `background:var(--x)` vs `color:var(--x)` across css/admin.css,
// js/admin.js, css/mechanic.css and js/mechanic.js):
//
//   INK  - written as text on a dark ground.
//   FILL - a filled button or badge, under hard-coded white text.
//
// The three in BOTH lists are the hard case. Their two constraints move in
// opposite directions: light enough to read as text on navy means too light to
// carry white text, and there is no value that clears AA (4.5) both ways. They
// are tuned to clear AA-large (3.0) in both roles, which is the band bold UI
// text lives in, and this check pins that so a later "let's brighten the
// green" cannot quietly make every green button unreadable.
const GROUNDS = { 'the card (--white)': null, 'the panel (--off)': null, 'the page': '#0f1a2e' };
const INK = ['--navy','--gray','--gray-lt','--slate','--blue','--blue-dark','--blue-deep',
  '--blue-soft','--green','--green-bright','--green-ink','--amber','--amber-ink','--amber-bright',
  '--red','--red-bright','--purple','--cyan'];
// --amber is deliberately absent: its only filled site is the mechanic's
// "En route" button, and css/mechanic.css gives that button dark ink in dark
// mode precisely so --amber can stay bright for the many places it is text.
// --wa is absent too - white on WhatsApp green is 1.98:1 in BOTH themes, which
// is WhatsApp's own button and not something this theme introduced or may fix.
const FILL = ['--blue','--blue-dark','--green','--red','--purple','--cyan'];
const MIN = 3.0;

const toRgb = (h) => {
  const v = h.trim().replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((x) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const l1 = luminance(toRgb(a));
  const l2 = luminance(toRgb(b));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const isHex = (v) => /^#[0-9a-f]{3,8}$/i.test((v || '').trim());

GROUNDS['the card (--white)'] = valueOf(darkBlock, '--white');
GROUNDS['the panel (--off)'] = valueOf(darkBlock, '--off');

for (const [groundName, ground] of Object.entries(GROUNDS)) {
  if (!isHex(ground)) {
    problems.push(`Cannot read the dark value of ${groundName} as a hex colour: ${ground}`);
    continue;
  }
  for (const token of INK) {
    const value = valueOf(darkBlock, token);
    if (!isHex(value)) continue; // absence is already reported above
    const r = ratio(value, ground);
    if (r < MIN) {
      problems.push(
        `${token} (${value}) is ${r.toFixed(2)}:1 against ${groundName} (${ground}) in dark mode. ` +
          `Below ${MIN}:1 it is not readable. Lighten it.`
      );
    }
  }
}

for (const token of FILL) {
  const value = valueOf(darkBlock, token);
  if (!isHex(value)) continue;
  const r = ratio('#ffffff', value);
  if (r < MIN) {
    problems.push(
      `${token} (${value}) carries hard-coded white text on filled buttons, and white on it is ` +
        `only ${r.toFixed(2)}:1 in dark mode. Darken it, or the button label disappears.`
    );
  }
}

if (problems.length) {
  console.error('\nDark theme check FAILED:\n');
  for (const p of problems) console.error('  - ' + p);
  console.error(`\n${problems.length} problem(s).\n`);
  process.exit(1);
}

const covered = [...used.keys()].filter((t) => colourTokens.has(t) && !SAME_IN_BOTH.has(t)).length;
const worstInk = Math.min(
  ...Object.values(GROUNDS).flatMap((g) =>
    INK.map((t) => (isHex(valueOf(darkBlock, t)) ? ratio(valueOf(darkBlock, t), g) : Infinity))
  )
);
const worstFill = Math.min(
  ...FILL.map((t) => (isHex(valueOf(darkBlock, t)) ? ratio('#ffffff', valueOf(darkBlock, t)) : Infinity))
);
console.log(
  `dark-theme-check: OK (${covered} colour tokens with dark values; worst ink ` +
    `${worstInk.toFixed(2)}:1, worst white-on-fill ${worstFill.toFixed(2)}:1)`
);
