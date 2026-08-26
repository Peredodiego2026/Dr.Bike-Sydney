// tests/unit/landing-layout.test.js
//
// "en el lateral de la landing me aparecen dos barras para ver en que lugar de
//  la pagina estoy para scrollear" ... "las lineas del scroll solo aparecen en
//  el pc en el celular no"
// "el cuadro del mecanico en el pc azul detras abarca mucha pantalla hay que
//  achicarlo para que entre en una sola pantalla al 100%"
// "el cuadro del mecanico se ve muy chico no tiene la animacion flotante 3D"
// "choose your plan tambien se ve muy grande debe entrar entero en la landing"
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const mainCss = read('css/main.css');
const landingCss = read('css/landing.css');
const landing = read('landing.html');
const inline = read('js/landing-inline.js');

describe('one scrollbar, not two', () => {
  // The cause, in four lines of css/main.css. `overflow-x: hidden` forces the
  // other axis from `visible` to `auto`, so declaring it on <html> AND <body>
  // made both scroll containers - and the viewport only inherits body's
  // overflow while html's is `visible`, so body stopped propagating and grew a
  // second bar beside html's.
  it('overflow-x is declared on body, never on html', () => {
    expect(mainCss).not.toMatch(/^html,\s*\r?\n\s*body \{\s*\r?\n\s*overflow-x: hidden;/m);
    const htmlRule = mainCss.match(/^html \{[^}]*\}/m)?.[0] ?? '';
    expect(htmlRule, '<html> must not carry overflow-x').not.toMatch(/overflow-x/);
  });

  it('but sideways scrolling is still suppressed', () => {
    expect(mainCss).toMatch(/^body \{\s*\r?\n\s*overflow-x: hidden;\s*\r?\n\}/m);
  });

  // The one case where both SHOULD be locked: the booking wizard opens as a
  // full-screen overlay and the marketing page behind it must not scroll.
  it('the wizard overlay still freezes the page behind it', () => {
    expect(landingCss).toMatch(/html\.drbike-wizard-open,\s*\r?\n?html\.drbike-wizard-open body \{\s*\r?\n?\s*overflow: hidden;/s);
  });
});

describe('the two big sections land as one screenful', () => {
  it('both are marked', () => {
    expect((landing.match(/class="fits-one-screen"/g) || []).length).toBe(2);
    expect(landing).toMatch(/<section id="mechanics" class="fits-one-screen"/);
    expect(landing).toMatch(/<section id="memberships" class="fits-one-screen"/);
  });

  // On a phone a full-height section pushes the next one entirely out of view
  // and makes the page feel twice as long.
  it('desktop only', () => {
    const i = landingCss.indexOf('.fits-one-screen');
    const media = landingCss.lastIndexOf('@media', i);
    expect(landingCss.slice(media, i)).toMatch(/min-width: 768px/);
  });

  // A plan card cut in half is worse than a section that runs a little over.
  it('min-height, so a section that needs more room grows instead of clipping', () => {
    const rule = landingCss.slice(landingCss.indexOf('.fits-one-screen'));
    expect(rule.slice(0, 220)).toMatch(/min-height: 100svh;/);
    expect(rule.slice(0, 220)).not.toMatch(/[^-]height: 100svh;/);
  });

  // Tied to the viewport rather than to a guess at a screen size - which is the
  // only honest way to do this without a browser to measure in.
  it('and the spacing inside them follows the viewport', () => {
    expect(landing).toMatch(/padding:clamp\(36px,5vh,72px\) 0 clamp\(40px,6vh,80px\)/);
    expect(landing).toMatch(/height:clamp\(300px,42vh,420px\);perspective:1400px/);
    expect(landing).toMatch(/<section id="memberships"[^>]*padding:clamp\(28px,4vh,44px\) 0/);
    expect(landing).toMatch(/gap:clamp\(12px,1\.6vw,24px\)/);
  });

  it('no fixed 420px carousel or 80px padding is left', () => {
    expect(landing).not.toMatch(/height:420px;perspective/);
    expect(landing).not.toMatch(/<section id="mechanics"[^>]*padding:80px 0 96px/);
  });
});

describe('the mechanic card is an object, not a stamp', () => {
  it('it is bigger, and fluid', () => {
    expect(landing).toMatch(/width: clamp\(250px, 23vw, 320px\);/);
    expect(landing).not.toMatch(/\.mech-card \{[^}]*width: 240px/s);
  });

  // The carousel writes `transform` on the card from JS. Animating the same
  // property from CSS means one of them silently loses, so the float lives on
  // an inner element.
  it('the float is on an inner layer, not on the card itself', () => {
    expect(inline).toMatch(/<div class="mech-card__float">/);
    expect(landing).toMatch(/\.mech-card\.is-active \.mech-card__float \{ animation: mech-float/);
    expect(landing).toMatch(/@keyframes mech-float/);
  });

  it('and depth is preserved so the movement reads as 3D', () => {
    expect(landing).toMatch(/\.mech-card \{[^}]*transform-style: preserve-3d;/s);
    expect(landing).toMatch(/\.mech-card__float \{ transform-style: preserve-3d; \}/);
  });

  // With one mechanic the carousel maths give offset 0: no rotation, no depth,
  // scale 1. Nothing about it read as 3D because nothing was moving - which is
  // exactly what Diego was looking at.
  it('only the front card floats', () => {
    expect(inline).toMatch(/card\.classList\.toggle\('is-active', abs === 0\);/);
  });

  it('and it stops for reduced motion', () => {
    expect(landing).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\r?\n?\s*\.mech-card\.is-active \.mech-card__float \{ animation: none; \}/s
    );
  });

  // The old 190px step was hard-coded for a 240px card. Now that the card is
  // fluid, a wide screen would overlap the cards and a narrow one leave a gap.
  it('the spacing between cards follows the card width', () => {
    expect(inline).toMatch(/const cardW = card\.offsetWidth \|\| 240;/);
    expect(inline).toMatch(/const tx = offset \* cardW \* 0\.79;/);
    expect(inline).not.toMatch(/const tx = offset \* 190;/);
  });
});
