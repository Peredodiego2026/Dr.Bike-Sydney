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
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { IGNORED_DIRS } from './lib/ignored-dirs.mjs';

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

// Directories the sweep below never reads: everything git ignores - build
// output, coverage, playwright-report - plus docs/, where #1848C8 appears on
// purpose, in prose explaining that it is retired.
const SWEEP_SKIP_DIR = new Set([...IGNORED_DIRS, 'docs']);
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
  'index.html': 8,
  // 3.2: the 15 inline <script> blocks this file used to carry moved to
  // js/landing-inline.js, and took most of the hand-written hex with them -
  // budget for that file is set the same placeholder-run way, see below.
  'landing.html': 11,
  'track.html': 2,
  'admin.html': 7,
  'mechanic.html': 8,
  'css/variables.css': 0,
  'css/main.css': 0,
  'css/home.css': 2,
  'css/landing.css': 1,
  'css/admin.css': 114,
  'css/mechanic.css': 29,
  'js/app.js': 96,
  'js/admin.js': 11,
  'js/mechanic.js': 0,
  'js/components.js': 28,
  'js/stripe.js': 5,
  'js/landing-inline.js': 68,
  'js/landing-modules.js': 0,
  // The four files that build customer email. Gmail and Outlook drop custom
  // properties, so these will NEVER reach zero: the only thing possible here is
  // that the hex matches the token, which it now does except for 7 occurrences
  // (#d1d5db light text on a blue header, #fcd34d the gold of a star).
  // send-cron.js and auth.js were outside the budget until 2026-08-09, which is
  // how auth.js kept 3 occurrences of the retired blue while everything else
  // was cleaned.
  'api/send-email.js': 223,
  'api/send-invoice.js': 107,
  'api/send-cron.js': 49,
  'api/auth.js': 39,
  // These 7 were outside the ratchet entirely until 2026-08-16 (docs/PENDIENTES.md
  // 19.3) - not urgent, nothing here is broken, but it is exactly how #1848C8
  // got into 74 files before 2026-08-09: one unwatched line at a time. terms.html,
  // privacy.html and claims.html declare their own local :root (see 19.2 - it
  // does not match css/variables.css), which is why their budget is lower than
  // a raw grep of the file: this script does not count a custom property's own
  // definition as a "use" of hand-written colour.
  'business.html': 41,
  'bike-check.html': 40,
  'cycling-map.html': 32,
  'terms.html': 16,
  'privacy.html': 13,
  'applepay.html': 15,
  'claims.html': 3,
};

// ── the generated pages ────────────────────────────────────────────────────
// The 20 suburb pages exist three times over (root, es/, zh/) and the 5 blog
// posts alongside them: 65 files, all written by
// scripts/generate-suburb-pages.mjs. Budgeting them one by one would be 65
// near-identical numbers that nobody would ever read, and editing one by hand
// is the wrong fix anyway - the generator is the file to change.
//
// So they share ONE budget. It exists because they were outside the check
// entirely until 2026-08-09, and #1848C8 had reached all 60 of them.
//
// The 5 blog posts got es/zh translations too (4.2, scripts/translate-blog-posts.mjs)
// - three copies each now, same as the suburb pages, so they read the same way:
// root name, es/blog/<name>, zh/blog/<name>. Before this the loop only ever
// looked at the root blog/ folder, because es/blog and zh/blog did not exist
// yet - it would have silently kept ignoring the new translations otherwise.
//
// business.html and bike-check.html got es/zh translations too (4.1,
// scripts/translate-static-pages.mjs), which live in the same es/ and zh/
// directories as the suburb pages and would otherwise be swept in here by
// name alone. Their root English file is NOT one of the "three copies":
// it is the hand-authored source those two translations are generated FROM,
// already tracked in its own BUDGET entry above - counting it here too would
// budget the same file in two places at once.
const GENERATED_BUDGET = 1479;
const INDIVIDUALLY_BUDGETED_ROOT = new Set(['business.html', 'bike-check.html']);

function generatedPages() {
  const suburbs = readdirSync('es').filter(f => f.endsWith('.html'));
  const pages = [];
  for (const s of suburbs) {
    const variants = INDIVIDUALLY_BUDGETED_ROOT.has(s) ? [`es/${s}`, `zh/${s}`] : [s, `es/${s}`, `zh/${s}`];
    for (const p of variants) if (existsSync(p)) pages.push(p);
  }
  for (const b of readdirSync('blog').filter(f => f.endsWith('.html'))) {
    for (const p of [`blog/${b}`, `es/blog/${b}`, `zh/blog/${b}`]) if (existsSync(p)) pages.push(p);
  }
  return pages;
}

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

// ── the generated pages, as one number ─────────────────────────────────────
{
  const pages = generatedPages();
  let counted = 0;
  for (const page of pages) {
    for (const hit of colours(page)) {
      if (FOREIGN_BRAND.has(hit.value)) continue;
      if (/(^|[;{*/\s])--[\w-]+\s*:\s*[^;]*$/.test(hit.text.slice(0, hit.text.indexOf('#')))) continue;
      if (/theme-color/.test(hit.text)) continue;
      counted++;
    }
  }
  if (counted > GENERATED_BUDGET) {
    problems.push(
      `the ${pages.length} generated pages hold ${counted} hand-written hex, budget is ${GENERATED_BUDGET}. ` +
      `Do NOT edit them one by one - change scripts/generate-suburb-pages.mjs and regenerate.`
    );
  } else if (counted < GENERATED_BUDGET) {
    wins.push(`the ${pages.length} generated pages: down to ${counted} from ${GENERATED_BUDGET} - lower GENERATED_BUDGET to ${counted}`);
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

// ── the [style*='...'] couplings ───────────────────────────────────────────
// The staff apps theme themselves by matching the TEXT of the inline styles
// their JS writes: `[data-theme='dark'] [style*='color:#0d1f3c']` in
// css/admin.css only applies while that exact string is still in js/admin.js.
//
// Converting that hex to var(--navy) looks like precisely the cleanup 12.14
// asks for, and it silently moves the element out of the rule: dark mode
// breaks, nothing fails, and the next person finds it in a screenshot. Until
// now the only thing guarding it was a comment at the top of css/admin.css.
//
// So: every [style*='X'] selector must still match an X somebody writes. The
// match is case-sensitive because CSS attribute matching is - which is why
// `background:#FEF2F2` in the stylesheet and `background:#fef2f2` in the JS
// would NOT be the same rule.
// Pinned per FILE, not per stylesheet: "somebody still writes this string" is
// too weak. admin.html and js/admin.js both write `background:#FEF2F2`, so
// converting the JS one alone left the selector still matching the HTML and
// the check stayed green while the JS-rendered cards lost their dark styling.
// Recorded 2026-08-11 against origin/main. A new writer of an existing string
// is fine and does not need adding; a writer that STOPS is the failure.
const COUPLED = {
  // Emptied 2026-08-27. Every one of these pinned a [style*='...'] rule in
  // css/admin.css to the JS that wrote the matching string. Those rules existed
  // only because the dark theme had no tokens and a colour had to be forced by
  // matching the TEXT of a style attribute. css/variables.css now themes every
  // token, the rules are gone, and so are the pins.
  'css/admin.css': {},
  'css/mechanic.css': {},
};
for (const [sheet, pinned] of Object.entries(COUPLED)) {
  const css = stripComments(readFileSync(sheet, 'utf8'));
  const live = new Set([...css.matchAll(/\[style\*=['"]([^'"]+)['"]\]/g)].map(m => m[1]));
  for (const selector of live) {
    const writers = pinned[selector];
    if (!writers) {
      problems.push(
        `${sheet}: [style*='${selector}'] is a new inline-style coupling. Add it to COUPLED ` +
        `in scripts/color-check.mjs with the file(s) that write that string, so the next ` +
        `person cannot convert the colour out from under it.`
      );
      continue;
    }
    for (const writer of writers) {
      if (!readFileSync(writer, 'utf8').includes(selector)) {
        problems.push(
          `${writer} no longer writes the inline style \`${selector}\`, which ${sheet} ` +
          `selects on. Most likely a hand-written hex just became var() - that is the ` +
          `cleanup 12.14 asks for everywhere EXCEPT here, because it moves the element out ` +
          `of the [data-theme='dark'] rule and breaks dark mode with nothing else failing. ` +
          `Revert it, or change the selector in the same commit.`
        );
      }
    }
  }
  for (const selector of Object.keys(pinned)) {
    if (!live.has(selector)) {
      problems.push(
        `${sheet} no longer has the selector [style*='${selector}'] - remove it from COUPLED ` +
        `in scripts/color-check.mjs so the list stays honest.`
      );
    }
  }
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
