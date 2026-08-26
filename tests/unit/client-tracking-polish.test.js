// tests/unit/client-tracking-polish.test.js
//
// Three things Diego reported from the client's side of a real job:
//
//   "necesitamos que el proceso que se esta realizando en este momento... el
//    boton parpadee... y que dejen de parpadear cuando el otro proceso
//    empiece... done deberia salir en color verde"
//   "en la spa del cliente no puedo escrolear para abajo entonces no puedo ver
//    los botones de mesage ni de share link"
//   "el thanks for your feedback no me gusta tanto. debe estar mas arriba...
//    con fondo medio oscuro con opacidad en 3d mas de lujo... y que el cliente
//    pueda hacer click en cualquier parte fuera del cuadro para se cierre"
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const app = read('js/app.js');
const components = read('js/components.js');
const mainCss = read('css/main.css');
const vars = read('css/variables.css');
const indexHtml = read('index.html');
const i18n = read('js/i18n.js');

describe('the progress bar says which step is happening now', () => {
  // The old code had two states: passed and not passed, both flat. Every step
  // it had reached got the same solid blue, Done included, so a client could
  // not tell where the job actually was.
  it('three states, not two', () => {
    expect(app).toMatch(/const done = i < activeStep;/);
    expect(app).toMatch(/const live = i === activeStep;/);
  });

  it('and Done is green, only at the end', () => {
    expect(app).toMatch(/const liveColour = i === 3 \? 'var\(--green\)' : 'var\(--blue\)';/);
  });

  // Exactly one step is ever `live`, which is what makes the pulse stop by
  // itself when the job moves on - Diego asked for that explicitly.
  it('only the live step pulses', () => {
    expect(app).toMatch(/el\.classList\.toggle\('track-step--live', live && i !== 3\)/);
  });

  // A finished job that keeps blinking reads as something still owed.
  it('and Done does not pulse, because it is over', () => {
    expect(app).toMatch(/live && i !== 3/);
  });

  it('the animation exists', () => {
    expect(mainCss).toMatch(/\.track-step--live\s*\{[^}]*animation: track-step-pulse/s);
    expect(mainCss).toMatch(/@keyframes track-step-pulse/);
  });

  // Reduced motion turns off movement, not information: the halo stays so the
  // live step is still identifiable, it just stops breathing.
  it('and respects prefers-reduced-motion without hiding which step is live', () => {
    const i = mainCss.indexOf('@media (prefers-reduced-motion: reduce)', mainCss.indexOf('.track-step--live'));
    const block = mainCss.slice(i, i + 400);
    expect(block).toMatch(/animation: none/);
    expect(block).toMatch(/box-shadow: 0 0 0 3px/);
  });

  // Scoped to applyStatus: #1E40AF is still used elsewhere in this file (the
  // calendar, the category chips), and those are not this fix's business.
  it('no hard-coded blue is left in the bar itself', () => {
    const applyStatus = app.slice(
      app.indexOf('function applyStatus(status)'),
      app.indexOf('async function pollBooking')
    );
    expect(applyStatus).not.toMatch(/#1E40AF/i);
    expect(applyStatus).toMatch(/var\(--blue-dark\)/);
  });
});

describe('the buttons are no longer behind the bottom bar', () => {
  // The panel scrolled fine. The nav is position:fixed with z-index 100 and the
  // panel reserved no room for it, so Message and Share link sat underneath.
  it('the nav height is a token', () => {
    expect(vars).toMatch(/--bottom-nav-h: calc\(56px \+ env\(safe-area-inset-bottom\)\);/);
  });

  it('the bar itself uses it, so the two cannot drift apart', () => {
    expect(mainCss).toMatch(/\.bottom-nav\s*\{[^}]*height: var\(--bottom-nav-h\)/s);
  });

  it('and the tracking panel reserves exactly that much', () => {
    expect(app).toMatch(/padding:0 16px calc\(12px \+ var\(--bottom-nav-h\)\)/);
  });

  // Caught re-reading this: the bar is display:none on desktop, so a fixed
  // reservation would have left 56px of dead air at the bottom of every
  // desktop tracking screen. The token means "how much room the bar takes",
  // and a hidden bar takes none.
  it('and reserves nothing on desktop, where the bar is hidden', () => {
    const i = mainCss.indexOf('@media (min-width: 768px)', mainCss.indexOf('.bottom-nav {'));
    const block = mainCss.slice(i, i + 600);
    expect(block).toMatch(/display: none !important;/);
    expect(block).toMatch(/--bottom-nav-h: 0px;/);
  });
});

describe('the celebration sheet is shared, not copied', () => {
  it('it lives in components.js', () => {
    expect(components).toMatch(/export function showCelebration\(/);
  });

  // A second modal under a second name is how a product ends up with four
  // styles. The birthday greeting was the first user; the review is the second.
  it('and both callers use it', () => {
    expect(app).toMatch(/showCelebration\(\{\s*\r?\n?\s*emoji: '\\u\{1F382\}'/s);
    expect(app).toMatch(/const thankYou = \(message\) =>\s*\r?\n?\s*showCelebration\(\{/s);
  });

  it('the class names say what it is, not what it was first used for', () => {
    expect(mainCss).toMatch(/\.celebrate-scrim/);
    expect(mainCss).not.toMatch(/\.bday-scrim/);
  });

  // The profile screen's birthday CONTROLS are a different thing entirely and
  // must not have been swept up in that rename.
  it('but the profile birthday fields kept their own ids', () => {
    for (const id of ['bday-day', 'bday-month', 'bday-save', 'bday-status']) {
      expect(app, `${id} was renamed by mistake`).toMatch(new RegExp(id));
    }
  });

  it('dismissed by the backdrop, the X, or Escape', () => {
    const fn = components.slice(components.indexOf('export function showCelebration'));
    expect(fn).toMatch(/if \(e\.target === scrim\) close\(\);/);
    expect(fn).toMatch(/if \(e\.key === 'Escape'\) close\(\);/);
    expect(fn).toMatch(/#celebrate-close'\)\.addEventListener\('click', close\)/);
  });

  // Backdrop click and Escape can both land before the exit finishes.
  it('and closing twice is harmless', () => {
    const fn = components.slice(components.indexOf('export function showCelebration'));
    expect(fn).toMatch(/if \(closed\) return;/);
  });

  // Every caller gets escaping, not just the one whose author remembered.
  it('user text is escaped inside the helper', () => {
    const fn = components.slice(components.indexOf('export function showCelebration'));
    expect(fn).toMatch(/const esc = \(v\) =>/);
    expect(fn).toMatch(/\$\{esc\(title \|\| ''\)\}/);
    expect(fn).toMatch(/\$\{esc\(message \|\| ''\)\}/);
  });
});

describe('a new review shows up without reopening the app', () => {
  // "desde el celular tuve que cerrar la pagina y volver a abrirla para ver el
  // comentario. si aparece pero no es automatico". The grid was filled by an
  // IIFE that ran once, at page load.
  it('the loader is named and published', () => {
    expect(indexHtml).toMatch(/function loadReviews\(\) \{/);
    expect(indexHtml).toMatch(/window\.drbikeReloadReviews = loadReviews;/);
  });

  it('and the review flow calls it on the way out', () => {
    expect(app).toMatch(/window\.drbikeReloadReviews\?\.\(\)/);
  });

  // Now that it can run twice, the first review lands on a page currently
  // saying there are none.
  it('the empty state can go away again', () => {
    expect(indexHtml).toMatch(/if \(empty\) empty\.style\.display = 'none';/);
  });

  it('a missing loader does not break the thank-you', () => {
    expect(app).toMatch(/\[review\] could not refresh the reviews list:/);
  });
});

// scripts/i18n-check.mjs only flags literals OUTSIDE translateValue(). A string
// passed INTO it with no dictionary entry returns English and the check stays
// green - so these two have to be asserted by hand.
describe('the new copy exists in all three languages', () => {
  for (const key of [
    'Your review is now on our page. Thank you for taking the time.',
    'Would you share it on Google too? It helps other Sydney cyclists find us.',
  ]) {
    it(`"${key.slice(0, 34)}..." has es and zh`, () => {
      const first = i18n.indexOf(key);
      expect(first, 'missing entirely').toBeGreaterThan(-1);
      expect(i18n.indexOf(key, first + 1), 'only one language').toBeGreaterThan(-1);
    });
  }
});
