// scripts/i18n-check.mjs — fails the build when client-facing copy is missing
// from the Spanish or Chinese dictionary.
//
// Run: npm run i18n:check   (also part of npm run check, so CI's quality-gate
// blocks the merge)
//
// Why this exists: the app ships in en/es/zh and the runtime already translates
// automatically - index.html, landing.html and track.html all re-translate on
// every render. The half that kept breaking was the dictionary: someone adds a
// string in English, nobody adds the two translations, and it silently ships in
// English because a missing key falls back to the source language. That is
// invisible in review and only a Spanish-speaking client ever sees it.
//
// What it checks:
//   1. every user-visible string on the client surfaces has an es AND a zh entry
//   2. es and zh cover exactly the same keys (no language left behind)
//   3. no duplicate keys - a duplicate silently keeps the LAST definition, so
//      editing the first one changes nothing (35 of these existed on 2026-07-26)
//
// If a string legitimately must stay untranslated (a brand, a person's name, a
// price, a promo code), add it to ALLOWED below. That has to be a deliberate,
// reviewable act - which is the whole point.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Surfaces whose English text must exist in the shared dictionary. The generated
// suburb pages are not here: they are emitted per language by
// scripts/generate-suburb-pages.mjs, so they cannot drift out of sync.
const HTML_SURFACES = ['index.html', 'landing.html', 'track.html'];
const JS_SURFACES = ['js/app.js', 'js/components.js'];

// Strings that stay in English on purpose.
const ALLOWED = new Set([
  // Brand and people
  'Dr. Bike Sydney',
  'Dr. Bike',
  'Bike',
  'Sydney',
  'Sydney, NSW',
  'Diego Peredo',
  'WhatsApp',
  '💬 WhatsApp',
  'Facebook',
  'Instagram',
  'YouTube',
  'Stripe',
  'Google',
  'Apple Pay',
  'Google Pay',
  // Bike brands
  'Specialized',
  'Trek',
  'Giant',
  'Cannondale',
  'BMC',
  // Membership plan names - product names, and code elsewhere matches on them
  'Basic',
  'Standard',
  'VIP',
  'Popular',
  'E-Bike',
  'Total',
  'Plan',
  'Color',
  // Contact details, codes and sample placeholders
  'contact@drbikesydney.com.au',
  'your@email.com',
  'your@email.com.au',
  'jane@acme.com',
  'Jane Smith',
  'Acme Co.',
  '04XX XXX XXX',
  'WELCOME10',
  'BACK15',
  'BDAY20',
  'Dr. Bike Sydney - Professional Mobile Bicycle Mechanic',
]);

// Shapes that are never translatable prose.
const IGNORE_PATTERNS = [
  /^[\s\d.,:;!?%$+\-–—·•()[\]{}<>/\\|&@#*"'`~^=_]+$/, // punctuation/numbers only
  /^\$?\d/, // starts with a digit or a price
  /^https?:/,
  /^(mailto|tel|wa):/,
  /^[a-z-]+\.(js|css|html|png|jpg|svg|webp)$/i,
  /^[A-Za-z-]+:\s*[\w#.-]+;/, // inline CSS fragments
  /\$\{/, // unresolved template interpolation
  /^&[a-z]+;$/i, // lone HTML entity
];

function isCandidate(text) {
  if (!text) return false;
  if (text.length < 3) return false;
  if (!/[A-Za-z]{3}/.test(text)) return false;
  if (ALLOWED.has(text)) return false;
  return !IGNORE_PATTERNS.some((re) => re.test(text));
}

// The dictionary is keyed on what the DOM ends up holding, so `&amp;` in the
// source is `&` at runtime. Decode before comparing or every entity-bearing
// string looks untranslated.
const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&middot;': '·',
  '&bull;': '•',
  '&mdash;': '—',
  '&ndash;': '–',
  '&rarr;': '→',
  '&larr;': '←',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&copy;': '©',
  '&times;': '×',
  '&check;': '✓',
};

function decodeEntities(text) {
  return text
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

const clean = (s) => decodeEntities(s).replace(/\s+/g, ' ').trim();

// A `>text<` match inside a .js file can also be two unrelated bits of code with
// a comparison between them, or a broken-up string concatenation. Those can
// never match a dictionary key at runtime either, so they are not findings.
const LOOKS_LIKE_CODE = [
  /['"`]\s*[+),;.]/,
  /[+),;]\s*['"`]/,
  / \+ /,
  /=>|;\s|\}\s|\bconst\b|\blet\b|\bfunction\b|\breturn\b/,
  /\w+\(/,
  /\.(join|replace|map|slice|filter|toFixed|getFullYear|getMonth)\b/,
];
const looksLikeCode = (text) => LOOKS_LIKE_CODE.some((re) => re.test(text));

// ── The dictionary ──────────────────────────────────────────────────────────
// js/i18n.js keeps `dict` module-private (nothing outside needs it), so load a
// copy with that one word exported rather than widening the real module's API.
async function loadDict() {
  const src = read('js/i18n.js');
  const tmp = path.join(ROOT, 'node_modules', '.i18n-check-probe.mjs');
  fs.writeFileSync(tmp, src.replace('const dict = {', 'export const dict = {'));
  try {
    const mod = await import(`file:///${tmp.replace(/\\/g, '/')}?t=${Date.now()}`);
    return mod.dict;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Duplicate keys survive `import` (the last one wins), so they have to be found
// in the source text.
function duplicateKeys(lang) {
  const src = read('js/i18n.js');
  const start = src.indexOf(`\n  ${lang}: {`);
  const end = lang === 'es' ? src.indexOf('\n  zh: {') : src.lastIndexOf('\n};');
  const block = src.slice(start, end);
  const seen = new Set();
  const dups = new Set();
  const re = /^\s{4}(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-z_$][\w$]*)):/gm;
  let m;
  while ((m = re.exec(block))) {
    const key = (m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (seen.has(key)) dups.add(key);
    seen.add(key);
  }
  return [...dups];
}

// ── Extraction ──────────────────────────────────────────────────────────────
// Mirrors what translateScreen() actually translates at runtime: text nodes,
// plus the placeholder and aria-label attributes.
function stringsFromHtml(file) {
  const whole = read(file);
  // translateScreen() walks the body, so <head> (title, meta) is out of scope -
  // those are translated per-URL by the page generator instead.
  const bodyStart = whole.indexOf('<body');
  const src = (bodyStart === -1 ? whole : whole.slice(bodyStart))
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const found = new Set();
  for (const m of src.matchAll(/>([^<>]+)</g)) {
    const t = clean(m[1]);
    if (isCandidate(t)) found.add(t);
  }
  for (const m of src.matchAll(/(?:placeholder|aria-label)="([^"]+)"/g)) {
    const t = clean(m[1]);
    if (isCandidate(t)) found.add(t);
  }
  return found;
}

function stringsFromJs(file) {
  const src = read(file);
  const found = new Set();
  // Text between tags inside template literals, and the attributes/toasts the
  // SPA renders. Fragments containing ${...} are skipped by isCandidate: they
  // can never match a dictionary key at runtime either.
  const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"');
  for (const m of src.matchAll(/>([^<>`]{3,200})</g)) {
    const t = clean(unescape(m[1]));
    if (isCandidate(t) && !/[{}]/.test(t) && !looksLikeCode(t)) found.add(t);
  }
  for (const m of src.matchAll(/(?:placeholder|aria-label|title)="([^"{}$<>]{3,120})"/g)) {
    const t = clean(m[1]);
    if (isCandidate(t)) found.add(t);
  }
  for (const m of src.matchAll(/showToast\(\s*(['"])((?:[^'"\\]|\\.){3,200}?)\1/g)) {
    const t = clean(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
    if (isCandidate(t) && !/[{}]/.test(t)) found.add(t);
  }
  return found;
}

// ── Run ─────────────────────────────────────────────────────────────────────
const dict = await loadDict();
const problems = [];

// 1. parity
const esKeys = new Set(Object.keys(dict.es));
const zhKeys = new Set(Object.keys(dict.zh));
const onlyEs = [...esKeys].filter((k) => !zhKeys.has(k));
const onlyZh = [...zhKeys].filter((k) => !esKeys.has(k));
if (onlyEs.length) problems.push(`${onlyEs.length} key(s) in es but not zh:\n    ${onlyEs.slice(0, 10).map((k) => JSON.stringify(k)).join('\n    ')}`);
if (onlyZh.length) problems.push(`${onlyZh.length} key(s) in zh but not es:\n    ${onlyZh.slice(0, 10).map((k) => JSON.stringify(k)).join('\n    ')}`);

// 2. duplicates
for (const lang of ['es', 'zh']) {
  const dups = duplicateKeys(lang);
  if (dups.length) {
    problems.push(
      `${dups.length} duplicate key(s) in the ${lang} block (the last definition silently wins):\n    ${dups.map((k) => JSON.stringify(k)).join('\n    ')}`
    );
  }
}

// 3. coverage per surface
let scanned = 0;
for (const file of [...HTML_SURFACES, ...JS_SURFACES]) {
  const strings = file.endsWith('.html') ? stringsFromHtml(file) : stringsFromJs(file);
  scanned += strings.size;
  const missing = [...strings].filter((s) => !esKeys.has(s) || !zhKeys.has(s));
  if (missing.length) {
    problems.push(
      `${file}: ${missing.length} string(s) with no es/zh translation:\n    ${missing.map((s) => JSON.stringify(s)).join('\n    ')}`
    );
  }
}

if (problems.length) {
  console.error('\n✖ i18n check failed\n');
  problems.forEach((p) => console.error('  - ' + p + '\n'));
  console.error(
    'Add the missing entries to BOTH the es and zh blocks of js/i18n.js.\n' +
      'If a string must stay in English (a brand, a name, a price, a code),\n' +
      'add it to ALLOWED in scripts/i18n-check.mjs so the exception is reviewable.\n'
  );
  process.exit(1);
}

console.log(
  `✓ i18n: ${esKeys.size} keys in es and zh, no duplicates, ${scanned} strings checked across ${HTML_SURFACES.length + JS_SURFACES.length} surfaces`
);
