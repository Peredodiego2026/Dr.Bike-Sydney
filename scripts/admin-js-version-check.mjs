// admin.html loads js/admin.js with a ?v= that has to move every time
// admin.js's content changes, or sw.js's stale-while-revalidate keeps
// serving the OLD file to any browser that already has it cached. That
// exact bug shipped twice the same day (docs/PENDIENTES.md 21.5 and
// 21.9-cache): the code was fixed, tests were green, the PR merged, and
// Diego kept seeing the pre-fix behaviour because nothing forced the ?v=
// to move - manual date-string bumps are easy to forget mid-PR.
//
// This makes it impossible to forget: the ?v= IS a hash of admin.js's own
// content, so it is either right or wrong, never merely "not updated yet".
// When admin.js changes, `npm run check` fails here and prints the exact
// value to paste into admin.html.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const JS_PATH = 'js/admin.js';
const HTML_PATH = 'admin.html';

const jsContent = readFileSync(JS_PATH, 'utf8');
const expected = createHash('sha256').update(jsContent).digest('hex').slice(0, 10);

const html = readFileSync(HTML_PATH, 'utf8');
const m = html.match(/src="js\/admin\.js\?v=([a-zA-Z0-9]+)"/);
if (!m) {
  console.error(
    `x ${HTML_PATH} does not load js/admin.js with a ?v= query - cache-busting is gone.`
  );
  process.exit(1);
}
const actual = m[1];

if (actual !== expected) {
  console.error(`\nx admin.js changed but ${HTML_PATH}'s ?v= was not updated.\n`);
  console.error(`  admin.html has:  ?v=${actual}`);
  console.error(`  should be:       ?v=${expected}\n`);
  console.error(
    `sw.js serves js/admin.js stale-while-revalidate by exact URL - without this,\n` +
      `every browser that already visited admin.html keeps running the OLD code\n` +
      `forever, silently (docs/PENDIENTES.md 21.5, 21.9).\n`
  );
  process.exit(1);
}

console.log(`✓ admin.js version: ?v=${actual} matches the file's content`);
