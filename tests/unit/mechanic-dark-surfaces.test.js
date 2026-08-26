// tests/unit/mechanic-dark-surfaces.test.js
//
// The dark theme now has a complete token table (css/variables.css), but a
// token can only reach a colour that was WRITTEN as a token. Four places in
// js/mechanic.js painted `background:#fff` as a literal, so in dark mode they
// opened as sheets of white paper on the navy ground - and no amount of work on
// the palette could have touched them.
//
// Diego found the biggest one himself: "aprete en history en el pc y se ve un
// history abajo como en la foto nose si me gusta ese banner abajo".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const mech = read('js/mechanic.js');
const css = read('css/mechanic.css');

describe('nothing paints itself white behind the theme s back', () => {
  // Exactly one survivor, and it is deliberate: you sign on white paper in
  // either theme, the stroke is drawn in a dark ink that only reads on white,
  // and the image ends up in the client's invoice.
  it('only the signature canvas keeps a literal white', () => {
    // Real declarations only. The comment above the canvas quotes the string it
    // is explaining, and a comment is not a painted surface.
    const painted = mech
      .split('\n')
      .filter(
        (line) =>
          line.includes('background:#fff') &&
          !line.trimStart().startsWith('<!--') &&
          !line.trimStart().startsWith('//')
      );
    expect(painted).toHaveLength(1);
    expect(painted[0]).toMatch(/sig-canvas/);
  });

  it('and it says why, so nobody "fixes" it', () => {
    expect(mech).toMatch(/background:#fff is deliberate and must stay a literal/);
  });
});

describe('the service-history panel', () => {
  it('follows the theme now', () => {
    expect(css).toMatch(/\.sheet-panel \{[^}]*background: var\(--white\)/s);
  });

  // A sheet rising from the bottom edge is right on a phone - it is where the
  // thumb is - and reads as a notification bar on a desktop. Every other
  // overlay in this app is centred.
  it('rises from the bottom on a phone', () => {
    const base = css.slice(css.indexOf('.sheet-overlay {'), css.indexOf('.sheet-panel {'));
    expect(base).toMatch(/align-items: flex-end;/);
  });

  it('and is centred on a desktop', () => {
    const i = css.indexOf('@media (min-width: 768px)', css.indexOf('.sheet-panel {'));
    const block = css.slice(i, i + 400);
    expect(block).toMatch(/align-items: center;/);
    expect(block).toMatch(/border-radius: 16px;/);
  });

  it('the inline styles it replaced are gone', () => {
    expect(mech).toMatch(/overlay\.className = 'sheet-overlay';/);
    expect(mech).toMatch(/<div class="sheet-panel">/);
    expect(mech).not.toMatch(/border-radius:20px 20px 0 0;width:100%;max-width:480px/);
  });
});
