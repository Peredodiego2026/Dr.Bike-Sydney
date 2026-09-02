// Any page that loads a local .js/.css with a ?v= has to move that ?v= every
// time the file's content changes, or sw.js's stale-while-revalidate keeps
// serving the OLD file to any browser that already has it cached. That exact
// bug shipped twice in one day for admin.js alone (docs/PENDIENTES.md 21.5,
// then again on 21.9): the code was fixed, tests were green, the PR merged,
// and Diego kept seeing the pre-fix behaviour because nothing forced the ?v=
// to move - manual date-string bumps are easy to forget mid-PR. admin.css
// joined this check the same week (21.11).
//
// js/landing-inline.js and js/landing-modules.js joined 2026-08-18: the 3.2
// diet moved landing.html's inline <script> content into these two real
// files, loaded with NO ?v= at all - the exact gap this file's own opening
// comment (in sw.js) warns about ("give new scripts a ?v= in the page - do
// not rely on this list"). Before that PR the code was inline in landing.html
// itself, which sw.js serves network-first, so it was never stale; moving it
// to separate cache-first-served .js files without a ?v= froze them on any
// browser that had already visited, from the very first deploy - not caught
// before merge because nothing checked for it yet. This is that check.
//
// This makes it impossible to forget: the ?v= IS a hash of the file's own
// content, so it is either right or wrong, never merely "not updated yet".
// When any covered file changes, `npm run check` fails here and prints the
// exact value to paste into the page.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// js/app.js joined 2026-08-23: it's the SPA's core, loaded on BOTH index.html
// and landing.html, and the audit found the two pages carried different ?v=
// values (20260806b vs 20260728f) - both stale, both a manual date-string
// nobody kept in sync. Converting it to the same content-hash scheme as
// admin.js means index and landing can never again disagree about which
// app.js is fresh, and a single content edit fails here for both until both
// move to the new hash.
const PAGES = [
  {
    html: 'admin.html',
    assets: [
      { path: 'js/admin.js', re: /src="js\/admin\.js\?v=([a-zA-Z0-9]+)"/ },
      { path: 'css/admin.css', re: /href="css\/admin\.css\?v=([a-zA-Z0-9]+)"/ },
    ],
  },
  // mechanic.html joined 2026-08-26. Its two assets carried hand-typed date
  // strings ("20260810b"), which CLAUDE.md already flagged as the remaining
  // gap - and it bit exactly as predicted: a merge between two branches that
  // had both bumped that line resolved to the older value and silently undid
  // the cache bust, with nothing red anywhere. A content hash cannot be
  // resolved to the wrong side and stay green.
  {
    html: 'mechanic.html',
    assets: [
      { path: 'js/mechanic.js', re: /src="js\/mechanic\.js\?v=([a-zA-Z0-9]+)"/ },
      { path: 'css/mechanic.css', re: /href="css\/mechanic\.css\?v=([a-zA-Z0-9]+)"/ },
    ],
  },
  // css/main.css joined 2026-08-30. It carried a hand-typed date string
  // ("20260827a") and was NOT in this list, which is the same gap that bit
  // mechanic.html four days earlier. It bit again immediately: the audit's
  // keyboard-access work (point 13) edited main.css and `npm run check` stayed
  // green, so the focus ring would have shipped invisible to every returning
  // browser. Both pages load it, so both are checked.
  // css/home.css se suma el 2026-09-02, por la misma razon exacta que main.css
  // cuatro dias antes: era el ultimo `?v=` escrito a mano de index.html
  // ("20260825b"), no estaba en esta lista, y mordio apenas alguien lo toco.
  // Arreglando el desborde de las tarjetas de servicio en el celular,
  // `npm run check` quedo verde con el archivo cambiado y el `?v=` viejo - el
  // arreglo habria salido invisible para todo navegador que ya hubiera
  // entrado. index.html es la pagina de celular, o sea la superficie principal.
  {
    html: 'index.html',
    assets: [
      { path: 'js/app.js', re: /src="js\/app\.js\?v=([a-zA-Z0-9]+)"/ },
      { path: 'css/main.css', re: /href="css\/main\.css\?v=([a-zA-Z0-9]+)"/ },
      { path: 'css/home.css', re: /href="css\/home\.css\?v=([a-zA-Z0-9]+)"/ },
    ],
  },
  {
    html: 'landing.html',
    assets: [
      { path: 'js/app.js', re: /src="js\/app\.js\?v=([a-zA-Z0-9]+)"/ },
      { path: 'css/main.css', re: /href="css\/main\.css\?v=([a-zA-Z0-9]+)"/ },
      { path: 'js/landing-inline.js', re: /src="js\/landing-inline\.js\?v=([a-zA-Z0-9]+)"/ },
      { path: 'js/landing-modules.js', re: /src="js\/landing-modules\.js\?v=([a-zA-Z0-9]+)"/ },
    ],
  },
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

for (const { html: htmlPath, assets } of PAGES) {
  const html = readFileSync(htmlPath, 'utf8');
  for (const { path, re } of assets) {
    const expected = hashOf(path);
    const m = html.match(re);
    if (!m) {
      console.error(
        `x ${htmlPath} does not load ${path} with a ?v= query - cache-busting is gone.`
      );
      failed = true;
      continue;
    }
    const actual = m[1];
    if (actual !== expected) {
      console.error(`\nx ${path} changed but ${htmlPath}'s ?v= was not updated.\n`);
      console.error(`  ${htmlPath} has: ?v=${actual}`);
      console.error(`  should be:      ?v=${expected}\n`);
      failed = true;
    } else {
      console.log(`✓ ${path} version: ?v=${actual} matches the file's content`);
    }
  }
}

if (failed) {
  console.error(
    `sw.js serves these under stale-while-revalidate by exact URL - without a\n` +
      `matching ?v=, every browser that already cached the file keeps running the\n` +
      `OLD version forever, silently (docs/PENDIENTES.md 21.5, 21.9, 21.11, 3.2-cache).\n`
  );
  process.exit(1);
}
