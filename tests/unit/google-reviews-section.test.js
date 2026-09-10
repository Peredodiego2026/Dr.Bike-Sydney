// tests/unit/google-reviews-section.test.js
//
// landing.html once carried three fabricated testimonials labelled "Google
// Review" - invented names, invented quotes. They were removed as a real ACCC
// risk and replaced by the public_reviews view, which shows only reviews
// clients actually left in the app (scripts/create-public-reviews-view.sql).
//
// This section brings Google reviews back, but by hand and quoted verbatim,
// because the Places API caps at five reviews Google picks and costs a Cloud
// account. Hand-written means a human can get it wrong, so the things that
// would turn it back into the old problem are pinned here:
//
//   - the count on the badge has to match the cards actually shown;
//   - every quote has to be a declared verbatim quote, not free-form copy;
//   - the link to the real profile has to be there, so any claim is checkable.
//
// AND ON BOTH CLIENT SURFACES. This file used to read landing.html alone, which
// is exactly how #382 shipped the block to desktop and left the mobile SPA -
// where most clients actually arrive - still saying "Be the first to leave a
// review" under a profile that already had two 5-star reviews. CLAUDE.md's rule
// is four surfaces; the test was checking one, so it could not see the gap.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const check = read('scripts/i18n-check.mjs');
const inline = read('js/landing-inline.js');

const SURFACES = ['landing.html', 'index.html'];

// The block on one surface, from its marker to the end of its grid.
function sectionOf(file) {
  const html = read(file);
  const start = html.indexOf('<!-- ── Reviews on Google');
  expect(start, `the Google reviews block is gone from ${file}`).toBeGreaterThan(-1);
  const gridAt = html.indexOf('id="google-reviews-grid"', start);
  expect(gridAt, `no google-reviews-grid in ${file}`).toBeGreaterThan(-1);
  const end = html.indexOf('id="reviews-grid"', gridAt);
  return html.slice(start, end > -1 ? end : undefined);
}
const cardsIn = (sec) => [...sec.matchAll(/class="review-card"/g)];
// Whitespace is collapsed because prettier wraps a long <p> across lines and
// the browser collapses it back when it renders. Comparing raw text would make
// this test fail on formatting rather than on content.
const quotesIn = (sec) =>
  [...sec.matchAll(/<p style="[^"]*">([\s\S]*?)<\/p>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  );

for (const file of SURFACES) {
  describe(`${file}: the badge cannot claim more than it shows`, () => {
    const section = sectionOf(file);
    const cards = cardsIn(section);

    it('renders at least one review', () => {
      expect(cards.length).toBeGreaterThan(0);
    });

    // CAMBIO DE INVARIANTE, 2026-09-10. Esto exigia que el numero del badge
    // fuera igual a la cantidad de tarjetas: "2 reviews on Google" sobre tres
    // tarjetas era la pagina mintiendo sobre su propio contenido.
    //
    // Ya no se puede exigir eso, y no por comodidad: el badge dejo de estar
    // escrito en el HTML. Ahora sale de /api/chat?type=site-stats con el numero
    // que Diego copia de su ficha, y las tarjetas siguen siendo un par de citas
    // textuales elegidas a mano. Son dos cosas distintas: el badge describe la
    // FICHA de Google, las tarjetas son una MUESTRA de ella. Un negocio con 14
    // resenas que muestra 2 citas no miente - manda a leer las 14.
    //
    // Lo que sigue siendo mentira, y sigue vigilado: una tarjeta que no sea una
    // cita real (el bloque de abajo), y un numero escrito a mano que despues
    // nadie actualiza (tests/unit/review-stats.test.js).
    it('the badge is not hand-typed any more', () => {
      const clean = section.replace(/<!--[\s\S]*?-->/g, ' ');
      expect(clean, 'a count was typed back into the page').not.toMatch(
        /\d+\s*reviews? on Google/i
      );
      expect(section, 'the slot the server fills is gone').toContain('id="google-count-link"');
    });

    it('every card shows five stars, and the headline no longer claims one', () => {
      const starRuns = [...section.matchAll(/aria-label="5 out of 5 stars"/g)];
      // Una por tarjeta y ninguna mas: la del encabezado se fue con el "5.0"
      // fijo. Cinco estrellas al lado de un promedio que puede no ser 5 son una
      // afirmacion que el propio numero desmiente, asi que ahora las dibuja
      // js/app.js a partir de la nota real.
      expect(starRuns.length).toBe(cards.length);
      expect(section.replace(/<!--[\s\S]*?-->/g, ' ')).not.toContain('>5.0<');
    });
  });

  describe(`${file}: every quote is a real, declared quote`, () => {
    const section = sectionOf(file);
    const quotes = quotesIn(section);

    it('found the quotes', () => {
      expect(quotes.length).toBe(cardsIn(section).length);
    });

    // A quote lives in i18n-check's ALLOWED because it must NOT be translated -
    // somebody else's words. That list is the reviewable record of what this
    // page claims was said. Copy written here without going through it would be
    // invisible marketing text dressed as a customer's voice.
    it('each one is declared verbatim in i18n-check', () => {
      for (const quote of quotes) {
        expect(check, `not declared: "${quote.slice(0, 50)}..."`).toContain(quote);
      }
    });

    it('and the profile link is present, so the claims are checkable', () => {
      expect(section).toMatch(/href="https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9]+"/);
    });
  });
}

// Both surfaces quote the same profile, so they must quote the same reviews.
// One updated and the other not is how desktop and mobile start telling a
// visitor different things about the same business.
describe('the two surfaces agree', () => {
  it('same quotes, same order', () => {
    const [a, b] = SURFACES.map((f) => quotesIn(sectionOf(f)));
    expect(a).toEqual(b);
  });

  // Antes esto comparaba los dos numeros escritos a mano. Ya no hay dos
  // numeros: hay un endpoint, y las dos paginas lo leen con los mismos ids
  // desde js/app.js, que las dos cargan. No pueden discrepar salvo que alguien
  // le cambie el id a una sola - que es lo que se comprueba aca.
  it('same headline, because both read the same slots', () => {
    for (const id of ['google-rating', 'google-stars', 'google-count-link', 'own-stats']) {
      for (const f of SURFACES) {
        expect(sectionOf(f), `${f} perdio #${id}`).toContain(`id="${id}"`);
      }
    }
  });
});

describe('the in-app reviews grid is untouched by this', () => {
  it('still exists on both surfaces, still filled from public_reviews', () => {
    for (const file of SURFACES) expect(read(file)).toContain('id="reviews-grid"');
    expect(inline).toContain("_sb.from('public_reviews')");
  });

  // "Be the first to leave a review" under two visible reviews contradicted
  // what the visitor could see, so it went - and nothing may still reach for it.
  it('the removed empty state is not referenced anywhere', () => {
    for (const file of SURFACES) expect(read(file)).not.toContain('id="reviews-empty"');
    expect(inline).not.toContain('reviews-empty');
    expect(read('index.html')).not.toContain("getElementById('reviews-empty')");
  });
});

// Diego reads mail at contact@. hello@ was in two places and in neither was it
// the address anyone reads - api/_security.js's BUSINESS_EMAILS already listed
// only contact@ and noreply@, so hello@ was not even recognised as our own.
describe('one contact address, not two', () => {
  const files = ['api/send-push.js', 'js/admin.js', 'landing.html', 'index.html'];

  it('nothing points at hello@ any more', () => {
    for (const f of files) {
      expect(read(f), `${f} still uses hello@`).not.toContain('hello@drbikesydney.com.au');
    }
  });

  it('and contact@ is the one the security list knows', () => {
    expect(read('api/_security.js')).toContain("'contact@drbikesydney.com.au'");
  });
});
