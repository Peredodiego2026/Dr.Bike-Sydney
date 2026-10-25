// scripts/prices-sync.mjs - after a price changes in Supabase, bring the site's
// static copy of it into line and list everything a person still has to read.
//
// Run:  npm run prices:sync               (writes)
//       npm run prices:sync -- --dry-run  (prints what it would do, writes nothing)
//
// Why: the +$10 of 24-oct-2026 touched 56 files by hand - 98 price cards, 64
// structured-data offers, the suburb generator, terms in 3 languages, emails,
// blog posts, the chatbot. The booking wizard, the chatbot and Admin already
// read the `services` table live; everything else is a copy. This script
// rewrites the copies that are machine-readable and hands over a line-by-line
// list of the ones that are prose. The procedure around it - SQL first, then
// this, then the list, then the checks - is .claude/skills/drbike-prices.
//
// What it does, in order:
//   1. Reads `services` and `callout_zones` (public anon key, read-only).
//   2. Rewrites the price cards on index.html and landing.html and the
//      structured-data offers on landing.html, matched by name exactly the way
//      js/live-prices.js matches them in the browser.
//   3. Moves SERVICE_PRICES in the suburb generator to the table and
//      regenerates the 15 suburb pages and the sitemap.
//   4. Compares against HEAD: every service whose committed card price differs
//      from the table is a change, and every "$<old price>" still left in a
//      customer-facing file is printed with its line, to be read and fixed
//      (or left, if that $ means something else). Until you commit, re-running
//      prints the same list minus what you already fixed.
//   5. Checks the visit fees in the table against api/_coverage.js, and the
//      membership "minor repair" ceiling against the services that moved.
//   6. Runs scripts/services-sync-check.mjs for the full audit.
//
// Needs network, so it is not part of `npm run check`.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  decodeEntities,
  parseNameMap,
  rewriteCards,
  rewriteJsonLd,
  rewriteGeneratorDefaults,
  findMentions,
} from './lib/price-sync.mjs';
import { FEE_BANDS, VALID_FEES } from '../api/_coverage.js';

const ROOT = path.join(import.meta.dirname, '..');
const DRY = process.argv.includes('--dry-run');
const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
// Public anon key - the same one js/live-prices.js ships to every browser.
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atHead = (rel) => {
  try {
    return git('show', `HEAD:${rel}`);
  } catch {
    return '';
  }
};

async function table(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
  });
  if (!r.ok) throw new Error(`${query.split('?')[0]}: HTTP ${r.status}`);
  return r.json();
}

let services, zones;
try {
  [services, zones] = await Promise.all([
    table('services?select=name,price,active'),
    table('callout_zones?select=name,callout_fee'),
  ]);
} catch (e) {
  console.error(`x Could not read Supabase (${e.message}). Nothing was changed.`);
  process.exit(1);
}
if (!services.length) {
  console.error('x The services table came back empty. Nothing was changed.');
  process.exit(1);
}

const byName = new Map(services.map((s) => [s.name, Number(s.price)]));
const NAME_MAP = parseNameMap(read('js/live-prices.js'));
const priceFor = (raw) => {
  const name = decodeEntities(String(raw)).trim();
  const key = byName.has(name) ? name : NAME_MAP[name];
  return byName.has(key) ? byName.get(key) : undefined;
};
// The category card's floor, as js/live-prices.js computes it: hidden rows out.
const priced = services
  .filter((s) => s.active !== false)
  .map((s) => Number(s.price))
  .filter((p) => p > 0);
const cheapest = priced.length ? Math.min(...priced) : undefined;

// ── 2. Cards and structured data on the hand-written pages ──────────────────
const HAND_WRITTEN = ['index.html', 'landing.html'];
const written = new Map();
const changeLog = [];
const unmatchedCards = new Set();

for (const rel of HAND_WRITTEN) {
  const before = read(rel);
  const cards = rewriteCards(before, priceFor, cheapest);
  const ld = rewriteJsonLd(cards.html, priceFor);
  cards.unmatched.forEach((n) => unmatchedCards.add(n));
  for (const c of cards.changes) changeLog.push(`  ${rel}: card "${c.name}" $${c.from} -> $${c.to}`);
  for (const c of ld.changes) changeLog.push(`  ${rel}: structured data "${c.name}" $${c.from} -> $${c.to}`);
  for (const s of ld.skipped) changeLog.push(`  ! ${rel}: a structured-data block ${s}`);
  if (ld.html !== before) written.set(rel, ld.html);
}

const GEN = 'scripts/generate-suburb-pages.mjs';
const gen = rewriteGeneratorDefaults(read(GEN), priceFor);
if (gen.missing.length) {
  changeLog.push(`  ! ${GEN}: no table row for ${gen.missing.join(', ')} - fallback prices left as they were`);
} else if (gen.src !== read(GEN)) {
  written.set(GEN, gen.src);
  changeLog.push(`  ${GEN}: SERVICE_PRICES (offline fallback) follows the table`);
}

if (!DRY) for (const [rel, text] of written) fs.writeFileSync(path.join(ROOT, rel), text);

console.log(`\nprices:sync${DRY ? ' (dry run - nothing written)' : ''}`);
console.log(`Read ${services.length} services and ${zones.length} visit zones from Supabase.\n`);
console.log(changeLog.length ? changeLog.join('\n') : '  Cards and structured data already match the table.');

// ── 3. Suburb pages ─────────────────────────────────────────────────────────
if (!DRY) {
  console.log('\nRegenerating the suburb pages:');
  const r = spawnSync(process.execPath, [GEN], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('x The suburb generator failed - fix that before going on.');
    process.exit(1);
  }
}

// ── 4. What changed since the last commit, and where its old price still is ─
// The committed cards are the "before": the price the site was last written
// against. A service with no card anywhere has no "before" here.
const before = new Map();
for (const rel of HAND_WRITTEN) {
  for (const s of rewriteCards(atHead(rel), () => undefined).seen) {
    const key = byName.has(s.name) ? s.name : NAME_MAP[s.name];
    if (byName.has(key)) before.set(key, s.price);
  }
}
const moved = [...before]
  .filter(([name, old]) => byName.get(name) !== old)
  .map(([name, old]) => ({ name, old, now: byName.get(name) }));

const headFloor = Number(atHead('api/_coverage.js').match(/FEE_BANDS = \[\s*\{[^}]*fee:\s*(\d+)/)?.[1]);
const floor = FEE_BANDS[0].fee;

console.log('\nWHAT MOVED SINCE THE LAST COMMIT');
if (!moved.length && headFloor === floor) {
  console.log('  No service price and no visit floor differs from HEAD.');
}
for (const m of moved) console.log(`  ${m.name}: $${m.old} -> $${m.now}`);
if (Number.isFinite(headFloor) && headFloor !== floor) {
  console.log(`  Visit & diagnosis floor (FEE_BANDS[0] in api/_coverage.js): $${headFloor} -> $${floor}`);
}

// The cheapest zone in the table is the visit floor customers are quoted ("from
// $35"), and it has to be the first band in the code. If the table moved and
// the code did not yet, the code's floor is the old amount.
const zoneFees = zones.map((z) => Number(z.callout_fee)).filter((f) => f > 0);
const tableFloor = zoneFees.length ? Math.min(...zoneFees) : floor;

const oldAmounts = new Set(moved.map((m) => m.old));
const oldFloors = new Set();
if (Number.isFinite(headFloor) && headFloor !== floor) oldFloors.add(headFloor);
if (tableFloor !== floor) oldFloors.add(floor);
oldFloors.forEach((f) => oldAmounts.add(f));

// What a line can call a service: its catalog name, every NAME_MAP alias that
// points at it, and the generator's es/zh names for the four headline ones.
// A line that names the service whose old price it quotes is almost certainly
// stale; one that only shares the number needs reading.
const callNames = new Map(services.map((s) => [s.name, [s.name]]));
for (const [alias, name] of Object.entries(NAME_MAP)) callNames.get(name)?.push(alias);
const genSrc = read(GEN);
const genKeys = [...(genSrc.match(/const SERVICE_KEYS = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const block of genSrc.matchAll(/serviceNames: \[([\s\S]*?)\]/g)) {
  [...block[1].matchAll(/'([^']+)'/g)].forEach((m, i) => callNames.get(genKeys[i])?.push(m[1]));
}
const VISIT_WORDS = /visit|visita|call-out|callout|上门/i;
const namesFor = (amount) =>
  moved.filter((m) => m.old === amount).flatMap((m) => callNames.get(m.name) ?? [m.name]);
const isNamed = (h) => {
  const line = h.text.toLowerCase();
  if (namesFor(h.amount).some((n) => line.includes(n.toLowerCase()))) return true;
  return oldFloors.has(h.amount) && VISIT_WORDS.test(h.text);
};
const isComment = (h) => /^(\/\/|\/\*|\*|<!--|--)/.test(h.text);
// After a +$10 the old price of one service is the new price of another
// ($99 -> $109 while the Tune-Up leaves $109). A line that names a service at
// the price the table now has is already right.
const isCurrent = (h) => {
  const line = h.text.toLowerCase();
  return services
    .filter((s) => Number(s.price) === h.amount)
    .some((s) => (callNames.get(s.name) ?? [s.name]).some((n) => line.includes(n.toLowerCase())));
};
// Lines this script already wrote: card prices on the hand-written pages (the
// card's name is on the line above, so they would otherwise read as unnamed).
const isOwned = (h) => HAND_WRITTEN.includes(h.file) && /class="(?:service|svc)-price"/.test(h.text);

// The suburb pages are the generator's output. Any old price left in them comes
// from the generator's source, which is in the list itself - listing every page
// too would print the same sentence fifteen times.
const suburbSlugs = [...(genSrc.match(/const SUBURBS = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/slug: '([^']+)'/g)].map((m) => m[1]);
const generated = new Set(suburbSlugs.flatMap((s) => [`${s}.html`, `es/${s}.html`, `zh/${s}.html`]));

if (oldAmounts.size) {
  // Customer-facing text: pages, the app and API copy (emails, chatbot), and
  // the scripts that generate translated pages. Tests are listed apart - a test
  // pinning an old price is a test to update, not copy to rewrite.
  const files = git('ls-files')
    .split('\n')
    .filter(
      (f) =>
        (/\.html$/.test(f) && !f.startsWith('docs/') && !generated.has(f)) ||
        /^js\/[^/]+\.js$/.test(f) ||
        /^api\/[^/]+\.js$/.test(f) ||
        /^scripts\/(generate-|translate-)[^/]+\.mjs$/.test(f) ||
        /^tests\/.+\.js$/.test(f)
    );
  const hits = [];
  for (const f of files) {
    const text = written.get(f) ?? read(f);
    for (const h of findMentions(text, oldAmounts)) hits.push({ file: f, ...h });
  }
  const list = (rows) => {
    for (const h of rows) {
      const t = h.text.length > 150 ? h.text.slice(0, 150) + '...' : h.text;
      console.log(`  ${h.file}:${h.line}  [$${h.amount}]  ${t}`);
    }
  };
  const tests = hits.filter((h) => h.file.startsWith('tests/'));
  const copy = hits.filter((h) => !h.file.startsWith('tests/') && !isOwned(h));
  const comments = copy.filter(isComment);
  const named = copy.filter((h) => !isComment(h) && isNamed(h));
  const unnamed = copy.filter((h) => !isComment(h) && !isNamed(h) && !isCurrent(h));

  console.log(`\nSTILL QUOTING AN OLD AMOUNT (${[...oldAmounts].map((a) => '$' + a).join(', ')})`);
  console.log(`\n  NAMES THE SERVICE OR THE VISIT - almost certainly stale: ${named.length} line(s)`);
  console.log('  Fix each one in en, es and zh.\n');
  list(named);
  console.log(`\n  SAME NUMBER, NO NAME ON THE LINE - read each and decide: ${unnamed.length} line(s)`);
  console.log('  Often a sentence about the service on the line above, a membership');
  console.log('  ceiling or a total built from prices - or an unrelated price. Leave those.\n');
  list(unnamed);
  if (comments.length) {
    console.log(`\n  CODE COMMENTS - documentation, never shown to a customer: ${comments.length} line(s)`);
    console.log(`  ${comments.map((h) => `${h.file}:${h.line}`).join('  ')}`);
  }
  if (tests.length) {
    console.log(`\nTESTS THAT MENTION AN OLD AMOUNT - ${tests.length} line(s)\n`);
    list(tests);
  }
}

// ── 5. Rules that hang off a price ──────────────────────────────────────────
const minorMax = Number(read('api/auth.js').match(/const MINOR_SERVICE_MAX_PRICE = (\d+)/)?.[1]);
if (Number.isFinite(minorMax)) {
  const crossed = moved.filter((m) => m.old < minorMax !== m.now < minorMax);
  if (crossed.length) {
    console.log(`\nMEMBERSHIP "MINOR REPAIR" CEILING ($${minorMax}, MINOR_SERVICE_MAX_PRICE in api/auth.js)`);
    console.log('Members get these free each month. These services changed side:\n');
    for (const m of crossed) {
      console.log(`  ${m.name}: $${m.old} -> $${m.now}  ${m.now < minorMax ? 'JOINS' : 'LEAVES'} the free bucket`);
    }
    console.log('\n  Ask Diego whether that is intended before moving the ceiling.');
  }
}

const topBand = Math.max(...FEE_BANDS.map((b) => b.fee));
const refused = zones.filter(
  (z) => Number(z.callout_fee) > 0 && Number(z.callout_fee) <= topBand && !VALID_FEES.includes(Number(z.callout_fee))
);
console.log(`\nVISIT FEES  table: ${[...new Set(zones.map((z) => Number(z.callout_fee)))].sort((a, b) => a - b).map((f) => '$' + f).join(' / ')}`);
console.log(`            code (VALID_FEES in api/_coverage.js): ${VALID_FEES.map((f) => '$' + f).join(' / ')}, above $${topBand} = outside the perimeter`);
const ladderAdvice = () => {
  console.log('    Move FEE_BANDS / PENINSULA_FAR_FEE / NORTH_NEAR_FEE in api/_coverage.js');
  console.log('    and tests/unit/coverage-resolution.test.js to the same ladder as the table.');
};
if (refused.length) {
  console.log('\n  x BLOCKER - these zones charge a fee the code refuses when routing is down:');
  for (const z of refused) console.log(`      ${z.name}: $${z.callout_fee}`);
  ladderAdvice();
}
// The table and the code price the same trips: layer 1 (driving time) charges
// the code's bands, layer 2 (routing down) charges the table. Their floors
// disagreeing means one was changed and the other was not, and a zone that
// moved above the top band would also start reading as "outside the perimeter".
if (tableFloor !== floor) {
  console.log(`\n  x BLOCKER - the cheapest zone in the table is $${tableFloor}, the first band in the code is $${floor}.`);
  console.log('    The visit fee was changed in one place and not the other.');
  ladderAdvice();
}

if (unmatchedCards.size) {
  console.log('\nCARDS LEFT ALONE (no priced row in the table)');
  for (const n of unmatchedCards) console.log(`  - ${n}`);
}

// ── 6. The full audit ───────────────────────────────────────────────────────
if (DRY) {
  console.log('\n(dry run: services:check skipped - it reads the files on disk, which were not changed)');
} else {
  console.log('\n── npm run services:check ──');
  spawnSync(process.execPath, ['scripts/services-sync-check.mjs'], { cwd: ROOT, stdio: 'inherit' });
}
