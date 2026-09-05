// Audit point 6 of the 20-point pre-launch list, recovered from the session
// transcripts on 2026-09-05 (its wording had only ever lived in a chat):
//
//   "ABN y GST visibles, y en las facturas - Atencion. Contable / ATO.
//    Grepeando el repo, solo admin.html menciona ABN o GST entre las paginas
//    principales. Una factura fiscal valida en Australia necesita ABN, la
//    palabra Tax Invoice y el GST desglosado."
//
// The invoice part is closed: api/send-invoice.js carries "Tax Invoice", the
// ABN and an itemised GST line. What is NOT closed is that the ABN is typed by
// hand in 46 files and nothing ties them together.
//
// That is not a hypothetical failure mode in this repo - it is the exact bug
// that shipped in the BAS export (docs/PENDIENTES.md 92, PR #410): the ABN was
// written by hand in three places in ONE file, somebody filled in two and
// missed the third, and the BAS went to the accountant reading
// "ABN: [Your ABN here]". Across 46 files the same mistake is far easier to
// make and far harder to see.
//
// Two things are checked, and the second is the one a human cannot do by eye:
//
//   1. Every ABN written anywhere in the repo is the SAME number.
//   2. That number passes the ATO's own checksum.
//
// A wrong ABN on a tax invoice is not a cosmetic bug in Australia.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

// .claude holds the skills, not the product. One of them - trademark-status -
// quotes the ABNs of OTHER companies found on IP Australia ("THE BIKE DOC" in
// Melbourne, a "DR BIKE" business name in VIC 3083). Those are somebody else's
// numbers by design, and scanning them would make this check cry wolf forever.
// It found them on its first run, which is at least good evidence the pattern
// works.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.vercel',
  'coverage',
  'dist',
  '.claude',
  // tests/ is excluded for the same reason: abn-single-source.test.js plants a
  // second, deliberately different ABN to prove this check catches one. A test
  // is never a tax document, so an ABN in one is test data by definition.
  'tests',
]);
const EXTS = new Set(['.js', '.mjs', '.html', '.json', '.sql', '.md']);

// Matches an ABN wherever it is written: "ABN 87 654 025 287", "ABN: 87...",
// spaced or not. The capture is normalised to digits before comparing, so a
// file that drops the spaces is still recognised as the same number - and a
// file that changes a DIGIT is not.
const ABN_RE = /ABN[:\s]*([0-9][0-9 ]{9,16}[0-9])/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name))) out.push(p);
  }
  return out;
}

// The ATO's algorithm: subtract 1 from the first digit, multiply by the
// positional weights, and the total must be divisible by 89. A transposed or
// mistyped digit fails this - which is the whole reason it exists.
export function isValidAbn(digits) {
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const d = [...digits].map(Number);
  d[0] -= 1;
  return d.reduce((sum, n, i) => sum + n * weights[i], 0) % 89 === 0;
}

// Everything below runs only when this file IS the command. Importing it (the
// test does, for isValidAbn) must not walk the tree and must not call
// process.exit - an earlier version did both, and the test file died on import
// before a single assertion ran.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const found = new Map(); // normalised digits -> [file, ...]
  for (const file of walk('.')) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(ABN_RE)) {
      const digits = m[1].replace(/\s/g, '');
      if (digits.length !== 11) continue; // not an ABN, some other number
      if (!found.has(digits)) found.set(digits, []);
      const list = found.get(digits);
      if (!list.includes(file)) list.push(file);
    }
  }

  if (found.size === 0) {
    console.error('x abn-check: no ABN found anywhere. Either the pattern broke or the ABN is gone.');
    process.exit(1);
  }

  if (found.size > 1) {
    console.error(`\nx abn-check: ${found.size} DIFFERENT ABNs are written in this repo.\n`);
    for (const [digits, files] of found) {
      console.error(`  ${digits}  (${files.length} file${files.length === 1 ? '' : 's'})`);
      for (const f of files.slice(0, 6)) console.error(`      ${f}`);
      if (files.length > 6) console.error(`      ... and ${files.length - 6} more`);
    }
    console.error(
      `\n  One of these is on a tax invoice a client keeps, and one is wrong.\n` +
        `  Pick the right one and make every file match it.\n`
    );
    process.exit(1);
  }

  const [digits, files] = [...found][0];
  if (!isValidAbn(digits)) {
    console.error(
      `\nx abn-check: ${digits} is not a valid ABN - it fails the ATO checksum.\n\n` +
        `  Eleven digits are not enough: the last digit is a check digit, so a\n` +
        `  typo or two transposed digits produces a number that LOOKS right and\n` +
        `  is not. It is currently on ${files.length} files, including tax invoices.\n`
    );
    process.exit(1);
  }

  console.log(
    `abn-check: OK - one ABN (${digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')}) ` +
      `across ${files.length} files, and it passes the ATO checksum.`
  );
}
