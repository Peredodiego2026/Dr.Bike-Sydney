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
const AMBER = '#f59e0b'; // --amber-bright, the star colour on reviews.html
const AMBER_LT = '#fffbeb'; // --amber-lt
const AMBER_INK = '#92400e'; // --amber-ink
const PRIMARY = '#2563eb'; // --blue, the page's "Write a review" button
const GRAY = '#475569'; // --gray

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

// ── reviews ────────────────────────────────────────────────────────────────
// reviews.html is saved to home screens and sent to customers as a link, so it
// gets its own look: amber (the page's star colour) with a row of five stars,
// so it reads as "reviews" and not as a fourth copy of the client app.
function starPath(cx, cy, R) {
  const r = R * 0.48;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (-90 + i * 36) * (Math.PI / 180);
    const rad = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + r2(cx + rad * Math.cos(a)) + ' ' + r2(cy + rad * Math.sin(a));
  }
  return d + 'Z';
}

// Rounded joins take the needle points off the stars - friendlier at icon size.
const stars = (centres, R, fill) =>
  `  <path fill="${fill}" stroke="${fill}" stroke-width="${r2(R * 0.22)}" stroke-linejoin="round" d="${centres.map(([x, y]) => starPath(x, y, R)).join('')}"/>`;

function starRow(cx, cy, R, gap, fill) {
  const step = 2 * R + gap;
  const x0 = cx - (step * 4) / 2;
  return stars([0, 1, 2, 3, 4].map(i => [x0 + i * step, cy]), R, fill);
}

function reviewsIcon({ size, shape }) {
  const rx = r2(size * 0.225);
  const bg =
    shape === 'rounded'
      ? `  <rect width="${size}" height="${size}" rx="${rx}" fill="${AMBER}"/>`
      : `  <rect width="${size}" height="${size}" fill="${AMBER}"/>`;
  const markW = size * (shape === 'rounded' ? 0.56 : 0.6);
  const R = size * 0.062;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${bg}
${placed(size / 2, size * 0.41, markW, KO)}
${starRow(size / 2, size * 0.75, R, size * 0.03, WHITE)}
</svg>
`;
}

// Link preview for drbikesydney.com.au/reviews (iMessage, WhatsApp, Facebook).
// Text is rendered with the system Inter when rasterised.
//
// Diego chose this one on 2026-11-20, out of five: the question on the left,
// and a review card like the one the client is about to write - stars, two
// lines of text, a photo and an empty photo slot - tilted on the right. No
// URL: Messages already prints the domain under the image.
function ogReviews() {
  const font = 'font-family="Inter,Arial,sans-serif"';
  const GRAY_LT = '#94a3b8'; // --gray-lt
  const AMBER_EDGE = '#fcd34d'; // --amber-edge, the photo in the card
  // The card, drawn at the origin and then placed and tilted as one group.
  const W = 440;
  const H = 386;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="22"/></filter></defs>
  <rect width="1200" height="630" fill="${AMBER_LT}"/>
  <text ${font} font-size="78" fill="${NAVY}" font-weight="800" letter-spacing="-2"><tspan x="84" y="210">Happy with</tspan><tspan x="84" y="291">your new bike?</tspan></text>
  <text ${font} font-size="31" fill="${GRAY}" font-weight="500"><tspan x="84" y="360">Tell other riders. It takes a minute.</tspan><tspan x="84" y="403">No account needed.</tspan></text>
${placed(119, 470, 70, TWO)}
  <text x="170" y="481" ${font} font-size="30" fill="${NAVY}" font-weight="700">Dr. Bike Sydney</text>
  <g transform="translate(696 122) rotate(-3 ${W / 2} ${H / 2})">
    <rect x="10" y="30" width="${W - 20}" height="${H - 10}" rx="28" fill="${NAVY}" opacity="0.16" filter="url(#soft)"/>
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="28" fill="${WHITE}" stroke="${BORDER}" stroke-width="2"/>
    <circle cx="66" cy="66" r="32" fill="${PRIMARY}"/>
    <text x="66" y="77" text-anchor="middle" ${font} font-size="30" fill="${WHITE}" font-weight="700">Y</text>
    <text x="114" y="62" ${font} font-size="28" fill="${NAVY}" font-weight="700">You</text>
    <text x="114" y="91" ${font} font-size="20" fill="${GRAY}" font-weight="500">just now</text>
${stars([0, 1, 2, 3, 4].map(i => [62 + i * 62, 150]), 24, AMBER)}
    <rect x="34" y="196" width="${W - 68}" height="18" rx="9" fill="${BORDER}"/>
    <rect x="34" y="226" width="290" height="18" rx="9" fill="${BORDER}"/>
    <rect x="34" y="268" width="110" height="84" rx="14" fill="${AMBER_EDGE}"/>
    <rect x="159.5" y="269.5" width="107" height="81" rx="13" fill="none" stroke="${GRAY_LT}" stroke-width="3" stroke-dasharray="9 7"/>
    <text x="213" y="324" text-anchor="middle" ${font} font-size="40" fill="${GRAY_LT}" font-weight="500">+</text>
  </g>
</svg>
`;
}

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

  // reviews page - amber with five stars, and its own link preview
  'icon-reviews-512.svg': reviewsIcon({ size: 512, shape: 'rounded' }),
  'og-reviews.svg': ogReviews(),
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

  { png: 'apple-touch-icon-reviews.png', svg: reviewsIcon({ size: 180, shape: 'bleed' }), size: 180, opaque: true },
  // 32px is too small for the stars to read - the mark alone, on amber.
  { png: 'favicon-reviews-32.png', svg: appIcon({ size: 32, bg: AMBER, mark: KO, logoPct: 0.8, shape: 'rounded' }), size: 32 },
  { png: 'og-reviews.png', svg: files['og-reviews.svg'], size: 1200, aspect: 630 / 1200, opaque: true },

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
