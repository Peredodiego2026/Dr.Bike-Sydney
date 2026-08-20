// admin.html loads js/admin.js and css/admin.css with a ?v= that has to
// move every time the file's content changes, or sw.js's
// stale-while-revalidate keeps serving the OLD file to any browser that
// already has it cached. That exact bug shipped twice in one day for
// admin.js alone (docs/PENDIENTES.md 21.5, then again on 21.9): the code
// was fixed, tests were green, the PR merged, and Diego kept seeing the
// pre-fix behaviour because nothing forced the ?v= to move - manual
// date-string bumps are easy to forget mid-PR. admin.css joined this check
// the same week, edited in the same PR that finally added it (21.11) -
// touching one cached admin asset without the other one having a guard yet
// is exactly how the next miss would happen.
//
// This makes it impossible to forget: the ?v= IS a hash of the file's own
// content, so it is either right or wrong, never merely "not updated yet".
// When either file changes, `npm run check` fails here and prints the
// exact value to paste into admin.html.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const HTML_PATH = 'admin.html';
const html = readFileSync(HTML_PATH, 'utf8');

const ASSETS = [
  { path: 'js/admin.js', re: /src="js\/admin\.js\?v=([a-zA-Z0-9]+)"/ },
  { path: 'css/admin.css', re: /href="css\/admin\.css\?v=([a-zA-Z0-9]+)"/ },
];

// Normalize CRLF -> LF before hashing. This repo has no .gitattributes and
// core.autocrlf varies by machine: a Windows checkout reads these files
// with \r\n, the ubuntu-latest CI runner reads the same commit with \n.
// Hashing the raw bytes made the check disagree with itself between the
// two - the first CI run after this script existed failed on exactly that,
// not on a real missing bump.
const hashOf = (path) =>
  createHash('sha256')
    .update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex')
    .slice(0, 10);

let failed = false;

for (const { path, re } of ASSETS) {
  const expected = hashOf(path);
  const m = html.match(re);
  if (!m) {
    console.error(`x ${HTML_PATH} does not load ${path} with a ?v= query - cache-busting is gone.`);
    failed = true;
    continue;
  }
  const actual = m[1];
  if (actual !== expected) {
    console.error(`\nx ${path} changed but ${HTML_PATH}'s ?v= was not updated.\n`);
    console.error(`  admin.html has:  ?v=${actual}`);
    console.error(`  should be:       ?v=${expected}\n`);
    failed = true;
  } else {
    console.log(`✓ ${path} version: ?v=${actual} matches the file's content`);
  }
}

if (failed) {
  console.error(
    `sw.js serves js/css under admin.html stale-while-revalidate by exact URL - without\n` +
      `a matching ?v=, every browser that already visited admin.html keeps running the\n` +
      `OLD file forever, silently (docs/PENDIENTES.md 21.5, 21.9, 21.11).\n`
  );
  process.exit(1);
}
