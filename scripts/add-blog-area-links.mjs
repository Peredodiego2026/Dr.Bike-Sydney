// scripts/add-blog-area-links.mjs — adds an "areas we service" internal-link
// block to each blog post, just above the footer.
//
// Run: node scripts/add-blog-area-links.mjs   (idempotent - re-running does
// nothing once the block is present)
//
// The posts already cross-link to each other and to /bike-check, but nothing
// pointed at the 20 suburb pages, so the traffic and authority the articles
// attract never reached the pages that actually rank for "bike mechanic
// <suburb>". Links only, no copy duplication.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const MARKER = 'data-area-links';

const AREAS = [
  ['/inner-west', 'Inner West'],
  ['/newtown', 'Newtown'],
  ['/bondi', 'Bondi'],
  ['/eastern-suburbs', 'Eastern Suburbs'],
  ['/cbd', 'Sydney CBD'],
  ['/north-shore', 'North Shore'],
  ['/manly', 'Manly'],
  ['/northern-beaches', 'Northern Beaches'],
  ['/parramatta', 'Parramatta'],
  ['/sutherland-shire', 'Sutherland Shire'],
];

const block = `<div class="section" ${MARKER} style="max-width:820px;margin:0 auto;padding:0 24px 48px">
  <h2 style="font-size:22px;font-weight:800;color:#0D1F3C;margin-bottom:6px">We come to you across Sydney</h2>
  <p style="font-size:15px;color:#4B5563;line-height:1.7;margin-bottom:12px">Mobile bike repair, at your home, office or park. Pick your area:</p>
  <p style="display:flex;flex-wrap:wrap;gap:10px 18px">
    ${AREAS.map(([href, label]) => `<a href="${href}" style="color:#0A58CA;font-weight:600;text-decoration:none;font-size:15px">${label}</a>`).join('\n    ')}
  </p>
</div>
`;

let changed = 0;
for (const name of fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.html'))) {
  const file = path.join(BLOG_DIR, name);
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes(MARKER)) {
    console.log(`- ${name}: already has the block`);
    continue;
  }
  if (!html.includes('<footer>')) {
    console.log(`! ${name}: no <footer> to anchor to, skipped`);
    continue;
  }
  fs.writeFileSync(file, html.replace('<footer>', `${block}<footer>`));
  console.log(`✓ ${name}`);
  changed++;
}
console.log(`${changed} post(s) updated`);
