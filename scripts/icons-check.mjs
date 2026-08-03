// Every page must show the DB mark in the browser tab, and every icon a
// manifest or a page points at must actually exist.
//
// Why it exists: on 2026-08-03, 74 of the 77 HTML pages in this repo declared
// no favicon at all - only index.html, landing.html and admin.html did. Every
// suburb page, every blog post, the es/ and zh/ trees, track.html and
// mechanic.html rendered a blank tab. Nothing failed and nothing warned; the
// pages simply had no icon for however long. This makes a repeat loud.
//
// It also guards the icon files themselves: a manifest entry pointing at a
// missing PNG is silently ignored by Android, so the app installs with a
// generated letter icon and nobody finds out until a phone shows it.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];

// ── 1. every HTML page declares an icon ────────────────────────────────────
function htmlFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    // docs/ holds internal design mockups, never served to anyone.
    if (name === 'node_modules' || name === '.git' || name === 'docs' || name.startsWith('${')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, acc);
    else if (name.endsWith('.html')) acc.push(p.replace(/\\/g, '/').replace('./', ''));
  }
  return acc;
}

const pages = htmlFiles('.');
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  if (!/<link[^>]+rel=["']icon["']/i.test(html)) {
    problems.push(`${page}: no <link rel="icon"> - this page renders a blank browser tab`);
  }
}

// ── 2. every icon a manifest or page references exists on disk ──────────────
const manifests = ['manifest.json', 'admin-manifest.json', 'mechanic-manifest.json'];
for (const file of manifests) {
  if (!existsSync(file)) {
    problems.push(`${file}: referenced as a manifest but the file does not exist`);
    continue;
  }
  const m = JSON.parse(readFileSync(file, 'utf8'));
  const srcs = [
    ...(m.icons || []).map(i => i.src),
    ...(m.shortcuts || []).flatMap(s => (s.icons || []).map(i => i.src)),
    ...(m.screenshots || []).map(s => s.src),
  ];
  for (const src of srcs) {
    const local = src.replace(/^\//, '').split('?')[0];
    if (!existsSync(local)) problems.push(`${file}: points at ${src}, which does not exist`);
  }

  // An icon declared "maskable" is cropped to a circle by Android. Sharing one
  // file between "any" and "maskable" is how the mark ends up clipped.
  const any = new Set((m.icons || []).filter(i => (i.purpose || 'any').includes('any')).map(i => i.src));
  for (const i of m.icons || []) {
    if ((i.purpose || '').includes('maskable') && any.has(i.src)) {
      problems.push(`${file}: ${i.src} is declared both "any" and "maskable" - a maskable icon needs its own file with the mark inside the safe area`);
    }
  }
}

const referenced = new Set();
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  for (const m of html.matchAll(/<link[^>]+(?:rel=["'](?:icon|apple-touch-icon)["'])[^>]*>/gi)) {
    const href = (m[0].match(/href=["']([^"']+)["']/) || [])[1];
    if (href && !/^(https?:)?\/\//.test(href)) referenced.add({ page, href });
  }
}
for (const { page, href } of referenced) {
  const local = href.replace(/^\//, '').split('?')[0];
  if (!existsSync(local)) problems.push(`${page}: <link> points at ${href}, which does not exist`);
}

// ── 3. no ghost hex in the brand assets ────────────────────────────────────
// #1848C8 was never a token - see docs/PENDIENTES.md 12.14.
const assets = [
  ...readdirSync('.').filter(f => /^(icon|og-image|favicon).*\.svg$/.test(f)),
  ...(existsSync('images/brand') ? readdirSync('images/brand').filter(f => f.endsWith('.svg')).map(f => 'images/brand/' + f) : []),
];
for (const f of assets) {
  const text = readFileSync(f, 'utf8');
  if (/#1848c8/i.test(text)) problems.push(`${f}: contains #1848C8, which is not a token (docs/PENDIENTES.md 12.14)`);
}

// ── 4. the brand set is complete ───────────────────────────────────────────
// Every circle is generated from images/brand/db-mark.svg by
// scripts/build-brand-assets.mjs. A missing one means someone deleted a file
// instead of regenerating the set.
const BRAND = ['db-mark', 'db-circle-white', 'db-circle-blue', 'db-circle-navy', 'db-circle-green'];
for (const name of BRAND) {
  for (const ext of ['svg', 'png']) {
    const p = `images/brand/${name}.${ext}`;
    if (!existsSync(p)) problems.push(`${p}: missing - regenerate with scripts/build-brand-assets.mjs`);
  }
}

if (problems.length) {
  console.error('icons-check FAILED\n');
  for (const p of problems) console.error('  - ' + p);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`icons-check ok - ${pages.length} pages declare an icon, all icon files present`);
