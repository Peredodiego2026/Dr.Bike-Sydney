// Composes every icon and brand asset from images/brand/db-mark.svg.
//
// Run it after touching the mark, then re-rasterise the PNGs from the SVGs it
// writes (see the PR that introduced it, fix/unify-app-icon). Nothing here is
// meant to be hand-edited: the point is that one source produces the whole set,
// so the launcher icon, the browser tab and a printed sticker cannot drift.
//
// Two colour rules, and they are not the same rule:
//  - The MARK keeps the logo file's own #0055de / #061f42. Those are not
//    css/variables.css tokens on purpose - the icon has to be the same blue as
//    images/logo-db.png, which is what renders in the page header.
//  - BACKGROUNDS are tokens: --white, --navy, --green. The blue circle is the
//    exception and uses the logo blue, so a blue sticker matches the mark.
//
// On coloured backgrounds the mark goes WHITE WITH THE CROSSING KNOCKED OUT.
// Filled flat white, the D and the B merge into one blob - the only thing
// separating them is the darker overlap. Combining both paths under
// fill-rule="evenodd" turns that overlap into a hole, so the background shows
// through and the mark reads exactly like the two-tone original.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const src = readFileSync(ROOT + 'images/brand/db-mark.svg', 'utf8');

const D_ALL = src.match(/<path fill="#0055de" fill-rule="evenodd" d="([^"]+)"/)[1];
const D_INK = src.match(/<path fill="#061f42" fill-rule="evenodd" d="([^"]+)"/)[1];
const MARK_W = 1000;
const MARK_H = Number(src.match(/viewBox="0 0 1000 (\d+)"/)[1]);

const BLUE = '#0055de'; // the logo file's blue
const INK = '#061f42'; // the logo file's overlap
const WHITE = '#ffffff'; // --white
const BORDER = '#e2e8f0'; // --border
const NAVY = '#0d1f3c'; // --navy
const GREEN = '#16a34a'; // --green

const r2 = n => Math.round(n * 100) / 100;

// Two-tone mark, for light backgrounds.
const markTwoTone = () =>
  `<path fill="${BLUE}" fill-rule="evenodd" d="${D_ALL}"/>\n    ` +
  `<path fill="${INK}" fill-rule="evenodd" d="${D_INK}"/>`;

// One-colour mark with the crossing knocked out, for coloured backgrounds.
const markKnockout = (fill = WHITE) =>
  `<path fill="${fill}" fill-rule="evenodd" d="${D_ALL}${D_INK}"/>`;

function placed(cx, cy, width, mark) {
  const s = width / MARK_W;
  return `  <g transform="translate(${r2(cx - width / 2)} ${r2(cy - (MARK_H * s) / 2)}) scale(${r2(s * 1000) / 1000})">
    ${mark}
  </g>`;
}

// ── brand circles ──────────────────────────────────────────────────────────
// A real circle with transparency outside it: for stickers, print, avatars and
// anywhere a round logo is wanted. NOT the app icons - those must stay square
// or the platform crops an already-round file a second time and eats the edge.
function circle({ size = 1024, bg, mark, logoPct = 0.64 }) {
  const r = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${r}" cy="${r}" r="${r}" fill="${bg}"/>
${placed(r, r, size * logoPct, mark)}
</svg>
`;
}

// ── app icons ──────────────────────────────────────────────────────────────
// shape 'rounded' is shown as-is; 'bleed' is the maskable file the platform
// crops to a circle at 80%, so it carries no corner radius of its own.
function appIcon({ size, bg, mark, logoPct, shape, hairline = false }) {
  const rx = r2(size * 0.225);
  const parts = [];
  if (shape === 'rounded') {
    parts.push(`  <rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/>`);
    if (hairline) {
      // A white icon on a light launcher wallpaper has no silhouette at all.
      const sw = Math.max(1, r2(size * 0.024));
      parts.push(
        `  <rect x="${r2(sw / 2)}" y="${r2(sw / 2)}" width="${r2(size - sw)}" height="${r2(size - sw)}" rx="${r2(rx - sw / 2)}" fill="none" stroke="${BORDER}" stroke-width="${sw}"/>`
      );
    }
  } else {
    parts.push(`  <rect width="${size}" height="${size}" fill="${bg}"/>`);
  }
  parts.push(placed(size / 2, size / 2, size * logoPct, mark));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${parts.join('\n')}
</svg>
`;
}

const TWO = markTwoTone();
const KO = markKnockout();

const files = {
  // brand circles - one solid colour edge to edge, mark in the middle
  'images/brand/db-circle-white.svg': circle({ bg: WHITE, mark: TWO }),
  'images/brand/db-circle-blue.svg': circle({ bg: BLUE, mark: KO }),
  'images/brand/db-circle-navy.svg': circle({ bg: NAVY, mark: KO }),
  'images/brand/db-circle-green.svg': circle({ bg: GREEN, mark: KO }),

  // client app - the mark stays two-tone on white
  'icon-512.svg': appIcon({ size: 512, bg: WHITE, mark: TWO, logoPct: 0.68, shape: 'rounded', hairline: true }),
  'icon-192.svg': appIcon({ size: 192, bg: WHITE, mark: TWO, logoPct: 0.68, shape: 'rounded', hairline: true }),

  // admin and mechanic - solid colour, knocked-out mark, no white card
  'icon-admin-512.svg': appIcon({ size: 512, bg: NAVY, mark: KO, logoPct: 0.66, shape: 'rounded' }),
  'icon-admin-192.svg': appIcon({ size: 192, bg: NAVY, mark: KO, logoPct: 0.66, shape: 'rounded' }),
  'icon-mech-512.svg': appIcon({ size: 512, bg: GREEN, mark: KO, logoPct: 0.66, shape: 'rounded' }),
  'icon-mech-192.svg': appIcon({ size: 192, bg: GREEN, mark: KO, logoPct: 0.66, shape: 'rounded' }),
};

// The maskable files and the PNG-only sizes are written to a staging folder and
// rasterised from there; they have no committed .svg of their own.
const raster = [
  { png: 'icon-512.png', svg: files['icon-512.svg'], size: 512 },
  { png: 'icon-192.png', svg: files['icon-192.svg'], size: 192 },
  { png: 'icon-maskable-512.png', svg: appIcon({ size: 512, bg: WHITE, mark: TWO, logoPct: 0.6, shape: 'bleed' }), size: 512, opaque: true },
  { png: 'icon-maskable-192.png', svg: appIcon({ size: 192, bg: WHITE, mark: TWO, logoPct: 0.6, shape: 'bleed' }), size: 192, opaque: true },
  { png: 'apple-touch-icon.png', svg: appIcon({ size: 180, bg: WHITE, mark: TWO, logoPct: 0.72, shape: 'bleed' }), size: 180, opaque: true },
  { png: 'favicon-32.png', svg: appIcon({ size: 32, bg: WHITE, mark: TWO, logoPct: 0.86, shape: 'rounded', hairline: true }), size: 32 },

  { png: 'icon-admin-512.png', svg: files['icon-admin-512.svg'], size: 512 },
  { png: 'icon-admin-192.png', svg: files['icon-admin-192.svg'], size: 192 },
  { png: 'icon-admin-maskable-512.png', svg: appIcon({ size: 512, bg: NAVY, mark: KO, logoPct: 0.6, shape: 'bleed' }), size: 512, opaque: true },

  { png: 'icon-mech-512.png', svg: files['icon-mech-512.svg'], size: 512 },
  { png: 'icon-mech-192.png', svg: files['icon-mech-192.svg'], size: 192 },
  { png: 'icon-mech-maskable-512.png', svg: appIcon({ size: 512, bg: GREEN, mark: KO, logoPct: 0.6, shape: 'bleed' }), size: 512, opaque: true },

  { png: 'images/brand/db-mark.png', svg: src, size: 1024, aspect: MARK_H / MARK_W },
  { png: 'images/brand/db-circle-white.png', svg: files['images/brand/db-circle-white.svg'], size: 1024 },
  { png: 'images/brand/db-circle-blue.png', svg: files['images/brand/db-circle-blue.svg'], size: 1024 },
  { png: 'images/brand/db-circle-navy.png', svg: files['images/brand/db-circle-navy.svg'], size: 1024 },
  { png: 'images/brand/db-circle-green.png', svg: files['images/brand/db-circle-green.svg'], size: 1024 },
];

mkdirSync(ROOT + 'images/brand', { recursive: true });
for (const [path, svg] of Object.entries(files)) {
  writeFileSync(ROOT + path, svg);
  console.log('svg    ', path, svg.length, 'bytes');
}

const stage = process.argv[2];
if (stage) {
  mkdirSync(stage, { recursive: true });
  const spec = raster.map((r, i) => {
    const name = 'stage-' + i + '.svg';
    writeFileSync(stage + '/' + name, r.svg);
    return { png: r.png, svg: name, size: r.size, opaque: !!r.opaque, aspect: r.aspect || 1 };
  });
  writeFileSync(stage + '/raster-spec.json', JSON.stringify(spec, null, 1));
  console.log('\nstaged', spec.length, 'SVGs for rasterising ->', stage);
} else {
  console.log('\n' + raster.length + ' PNGs need rasterising; pass a staging dir to write their sources');
}
