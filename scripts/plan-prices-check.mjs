// Membership prices live in Stripe, but five files carry their own hand-typed
// copy of them. This script does not fix that - it makes the drift loud.
//
// Why it exists: on 2026-07-22 a Basic/VIP price bump ($57->$67, $147->$197)
// went live on the pricing pages while admin.js's MRR maths, terms.html in
// three languages, api/chat.js's chatbot knowledge and an e2e test were all
// left on the old numbers. Nothing failed; the wrong figures were simply
// quoted to customers for a while. CLAUDE.md records it as a recurring bug
// class. `npm run check` now blocks a repeat.
//
// WHEN YOU CHANGE A PRICE IN STRIPE: update CURRENT below, move the old value
// into RETIRED, then run `npm run check`. It will name every file still
// carrying the old number.
import { readFileSync, existsSync } from 'node:fs';

// The prices as they exist in Stripe today. This is a mirror, not the source.
const CURRENT = {
  'Basic monthly': 67,
  'Basic annual': 643,
  'Standard monthly': 97,
  'Standard annual': 931,
  'VIP monthly': 197,
  'VIP annual': 1891,
};

// Every value these plans have ever had that must no longer appear anywhere.
// A survivor here is the exact failure this script exists to catch.
const RETIRED = [57, 147];

// Files known to quote plan prices. Adding a new surface that mentions a plan
// price means adding it here, or the drift goes unwatched again.
const SURFACES = ['landing.html', 'index.html', 'terms.html', 'api/chat.js', 'js/admin.js'];

const allowed = new Set(Object.values(CURRENT));
const problems = [];

for (const file of SURFACES) {
  if (!existsSync(file)) {
    problems.push(`${file}: listed as a plan-price surface but the file does not exist`);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`;

    // Comment lines are skipped on purpose. Several files carry a note
    // explaining the 2026-07-22 bump ("$57->$67, $147->$197") - that is the
    // history of the bug, not a price being quoted to anyone. A stale number
    // in a comment misleads nobody; one in markup or in MRR maths does.
    const trimmed = line.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('<!--')
    )
      return;

    // A retired price, in any context. Word-boundaried so 57 inside 1057 or a
    // hex colour does not trip it.
    for (const old of RETIRED) {
      if (new RegExp(`\\$${old}\\b`).test(line)) {
        problems.push(
          `${at}: still quotes the retired price $${old} - ${line.trim().slice(0, 100)}`
        );
      }
    }

    // Any per-period price must be one of the current ones. This is what
    // catches a new wrong number (e.g. someone types $77/month in one file).
    //
    // Two details that are not optional here, because both were live in the
    // repo when this script was written and each would have hidden a real
    // mismatch: thousands separators ($1,891 is written with a comma while
    // $643 is not), and the Spanish and Chinese period suffixes in terms.html
    // - which is exactly the file that kept the old prices last time.
    const periodic = line.matchAll(
      /\$(\d{1,3}(?:,\d{3})+|\d+)\s*\/\s*(mo\b|month|yr\b|year|mes|año|ano|月|年)/gi
    );
    for (const m of periodic) {
      const value = Number(m[1].replace(/,/g, ''));
      if (!allowed.has(value)) {
        problems.push(
          `${at}: $${m[1]}/${m[2]} is not a current plan price - ${line.trim().slice(0, 100)}`
        );
      }
    }
  });
}

// Coverage: a canonical price that appears nowhere usually means a rename or a
// deletion nobody finished. Reported, not fatal - not every surface quotes
// every plan (admin.js only needs the monthlies for its MRR maths).
// Written with or without a thousands separator depending on the file, so a
// bare `$1891` search reports a false gap on the one price that has a comma.
const withCommas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const missing = Object.entries(CURRENT).filter(([, value]) => {
  const pattern = new RegExp(`\\$(${value}|${withCommas(value)})\\b`);
  return SURFACES.every((f) => !existsSync(f) || !pattern.test(readFileSync(f, 'utf8')));
});

if (problems.length) {
  console.error('\nPlan prices disagree across surfaces:\n');
  problems.forEach((p) => console.error('  x ' + p));
  console.error(
    `\nFix every file above, or update CURRENT/RETIRED in scripts/plan-prices-check.mjs` +
      ` if the price genuinely changed in Stripe.\n`
  );
  process.exit(1);
}

if (missing.length) {
  console.warn(
    `! plan prices: ${missing.map(([k, v]) => `${k} ($${v})`).join(', ')} appear on no surface`
  );
}
console.log(
  `✓ plan prices: ${Object.keys(CURRENT).length} checked across ${SURFACES.length} surfaces, no retired values`
);
