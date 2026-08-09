// The colour ratchet: hand-written hex can only go down, never up.
//
// Why it exists: docs/PENDIENTES.md 12.14. There was no single source of truth
// for colour in this app, there were three, and they disagreed. Fixing that
// took five PRs (#181-#183, #194) and moved ~900 hand-written hex onto
// `css/variables.css` tokens. Nothing stopped it happening in the first place
// and, until this file existed, nothing stopped it happening again: every hex
// in the repo got there one line at a time, each one reasonable on its own.
//
// What this does NOT do: it does not demand zero hex. There are still 1138 in
// the five app surfaces and most of them cannot be converted today - see the
// two documented traps in 12.14 (a hex that is the VALUE of a custom property
// must never become var(), and in the dark-themed staff apps `#fff` and
// `var(--white)` are genuinely different colours). Pretending otherwise is how
// the last attempt turned 12 landing headings navy.
//
// So it is a ratchet, not a gate. Every file has a budget equal to what it has
// today. Add a hex and the build fails. Remove one and the build ALSO fails,
// telling you to lower the number - that is deliberate, it is the only way the
// budget stays honest instead of drifting into a ceiling nobody has met in
// months.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── what counts as a colour ────────────────────────────────────────────────
// 3, 4, 6 or 8 hex digits. Not 5 or 7: those are only ever HTML entities
// (`&#10003;`). Three more things look like hex and are not, and each one
// produced a false positive while this script was being written:
//   - `&#215;`             an HTML entity
//   - `#add-card-btn`      a CSS id selector that happens to start with hex
//   - `href="#pricing"`    an anchor
const HEX = /#([0-9a-fA-F]{3,8})\b/g;

// Colours that belong to someone else. Google's four, Facebook's blue and
// WhatsApp's green are brand marks: matching them to our palette would make
// the buttons wrong, not consistent.
const FOREIGN_BRAND = new Set([
  '4285f4', '34a853', 'fbbc05', 'ea4335', // Google
  '1877f2', // Facebook
  '25d366', // WhatsApp
]);

// Files the sweep below never reads: dependencies, git internals, and docs -
// where #1848C8 appears on purpose, in prose explaining that it is retired.
const SWEEP_SKIP_DIR = new Set(['node_modules', '.git', 'docs']);
// This file names the colour it bans, and icons-check.mjs bans it in brand
// assets. Neither is an occurrence.
const SWEEP_SKIP_FILE = new Set(['scripts/color-check.mjs', 'scripts/icons-check.mjs']);

// The staff apps re-declare --white, --navy and --blue-lt inside
// [data-theme='dark'] (css/admin.css:2-10, css/mechanic.css:2-14). There, a
// hand-written `#fff` stays white in dark mode and `var(--white)` turns dark.
// White in those files is therefore a decision, not debt.
const DARK_THEMED = /^(admin\.html|mechanic\.html|css\/admin\.css|css\/mechanic\.css|js\/admin\.js|js\/mechanic\.js)$/;

// Budgets: the count each file has today. Lower them as you convert; the
// script tells you the new number when you do.
const BUDGET = {
  'index.html': 20,
  'landing.html': 118,
  'track.html': 3,
  'admin.html': 28,
  'mechanic.html': 12,
  'css/variables.css': 0,
  'css/main.css': 3,
  'css/home.css': 3,
  'css/landing.css': 4,
  'css/admin.css': 257,
  'css/mechanic.css': 39,
  'js/app.js': 106,
  'js/admin.js': 185,
  'js/mechanic.js': 76,
  'js/components.js': 28,
  'js/stripe.js': 5,
  // Emails cannot use var() at all - Gmail and Outlook drop custom properties -
  // so these two will never reach zero. They are here so they cannot get worse
  // while the separate email PR is pending.
  'api/send-email.js': 250,
  'api/send-invoice.js': 107,
};

function normalise(hex) {
  const h = hex.toLowerCase();
  if (h.length === 3) return h.split('').map(c => c + c).join('');
  if (h.length === 4) return h.slice(0, 3).split('').map(c => c + c).join('');
  if (h.length === 8) return h.slice(0, 6);
  return h;
}

// Comments are prose about colour, not colour. This file's own header would
// otherwise fail the check, and so would track.html:13, which is a comment
// explaining that the retired blue used to live there. Blanked out rather than
// deleted so line numbers in the output still point at the real line.
function stripComments(src) {
  const blank = m => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
}

function colours(file) {
  const found = [];
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(HEX)) {
      const len = m[1].length;
      if (len === 5 || len === 7) continue;
      const before = line.slice(Math.max(0, m.index - 8), m.index);
      const after = line[m.index + m[0].length] || '';
      if (before.endsWith('&')) continue;
      if (/href=["']$/.test(before)) continue;
      if (/[-_\w]/.test(after)) continue;
      found.push({ value: normalise(m[1]), line: i + 1, text: line.trim() });
    }
  });
  return found;
}

const problems = [];
const wins = [];

for (const [file, budget] of Object.entries(BUDGET)) {
  let counted = 0;
  for (const hit of colours(file)) {
    if (FOREIGN_BRAND.has(hit.value)) continue;
    // `--name: #hex` is a definition, not a use. Converting it to var() makes
    // the property reference itself, which is invalid and wipes the colour off
    // the element and every descendant (12.14, HALLAZGO 1).
    if (/(^|[;{*/\s])--[\w-]+\s*:\s*[^;]*$/.test(hit.text.slice(0, hit.text.indexOf('#')))) continue;
    // <meta name="theme-color"> and manifest.json do not accept var().
    if (/theme-color/.test(hit.text)) continue;
    if (DARK_THEMED.test(file) && /^f{6}$/.test(hit.value)) continue;
    counted++;
  }

  if (counted > budget) {
    problems.push(
      `${file}: ${counted} hand-written hex, budget is ${budget}. ` +
      `Use var(--token) from css/variables.css, or promote the colour to a new token. ` +
      `Do not raise the budget.`
    );
  } else if (counted < budget) {
    wins.push(`${file}: down to ${counted} from ${budget} - lower BUDGET in scripts/color-check.mjs to ${counted}`);
  }
}

// ── the retired blue, everywhere, not just in the budgeted files ───────────
// #1848C8 is not "a colour we still use somewhere". It was the third palette's
// blue and it is gone as of 2026-08-09 - but it had reached 74 files, including
// every customer email and all ~60 suburb pages, so the ban has to cover the
// whole repo or it comes back through a file nobody budgeted.
function sweep(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SWEEP_SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sweep(p, acc);
    else if (/\.(html|css|js|mjs|json)$/.test(name)) acc.push(p.replace(/\\/g, '/').replace(/^\.\//, ''));
  }
  return acc;
}

for (const file of sweep('.')) {
  if (SWEEP_SKIP_FILE.has(file)) continue;
  const src = stripComments(readFileSync(file, 'utf8'));
  src.split('\n').forEach((line, i) => {
    if (/#1848c8\b/i.test(line)) {
      problems.push(`${file}:${i + 1}: #1848C8 is the retired blue - use #2563EB / var(--blue). See docs/PENDIENTES.md 13.5`);
    }
  });
}

if (wins.length) {
  console.log('color-check: the budget is stale, these files improved:');
  for (const w of wins) console.log('  - ' + w);
}

if (problems.length) {
  console.error('\ncolor-check FAILED:\n');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

if (wins.length) process.exit(1);

console.log('color-check: OK - no new hand-written colour.');
