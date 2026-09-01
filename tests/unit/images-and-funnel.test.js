// tests/unit/images-and-funnel.test.js
//
// Puntos 11 y 17 de la auditoria.
//
// PUNTO 11 - imagenes. "Formato moderno, width/height para que no salte el
// layout, lazy loading abajo de la linea de flotacion."
//
// PUNTO 17 - embudo. "Hay eventos de analytics, pero no sabemos en que paso
// exacto se va la gente: servicio, horario, precio de la visita, o tarjeta."
// Medido: los cinco pasos SI se median. Lo que faltaba era la razon de la
// ultima caida, que es la cara.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const PAGES = ['index.html', 'landing.html', 'track.html'];
const app = read('js/app.js');

const imgs = (html) => [...html.matchAll(/<img\b[\s\S]*?>/g)].map((m) => m[0].replace(/\s+/g, ' '));
const attr = (tag, name) => new RegExp('\\b' + name + '=').test(tag);
const srcOf = (tag) => (/src="([^"]+)"/.exec(tag) || [])[1] || '';

describe('ninguna imagen hace saltar la pagina', () => {
  // Sin width/height el navegador no sabe cuanto espacio reservar: dibuja, la
  // imagen aterriza, y todo lo de abajo salta. El cliente que iba a tocar un
  // boton toca otra cosa. Google lo mide y lo usa para posicionar.
  for (const page of PAGES) {
    it(`${page}: todas declaran sus dimensiones`, () => {
      const missing = imgs(read(page))
        // Una src interpolada se dimensiona en tiempo de ejecucion: el tamano
        // lo decide el dato, no el HTML.
        .filter((t) => !srcOf(t).includes('${'))
        .filter((t) => !attr(t, 'width') || !attr(t, 'height'))
        .map(srcOf);
      expect(missing).toEqual([]);
    });
  }

  // No son las dimensiones de pantalla - el CSS sigue mandando - sino la
  // PROPORCION, que es lo que el navegador usa para reservar el hueco. Por eso
  // tienen que ser las del archivo, no un numero cualquiera.
  it('y son las dimensiones reales del archivo', () => {
    const REAL = {
      'images/logo-db.png': [600, 423],
      'images/hero-van.webp': [1672, 941],
      'images/mechanic-working.webp': [1122, 1402],
    };
    for (const page of PAGES) {
      for (const tag of imgs(read(page))) {
        const real = REAL[srcOf(tag)];
        if (!real) continue;
        const w = Number((/\bwidth="(\d+)"/.exec(tag) || [])[1]);
        const h = Number((/\bheight="(\d+)"/.exec(tag) || [])[1]);
        if (!w || !h) continue;
        // Se compara la proporcion: un logo puede ir con height="36" a mano y
        // seguir siendo correcto mientras la relacion se respete.
        expect(Math.abs(w / h - real[0] / real[1]), `${page} ${srcOf(tag)}`).toBeLessThan(0.02);
      }
    }
  });
});

describe('lazy donde ayuda, eager donde estorbaria', () => {
  for (const page of PAGES) {
    it(`${page}: todas dicen como cargar`, () => {
      const missing = imgs(read(page))
        .filter((t) => !attr(t, 'loading'))
        .map(srcOf);
      expect(missing).toEqual([]);
    });
  }

  // `loading="lazy"` en algo que se ve al abrir la pagina lo RETRASA: el
  // navegador lo descubre mas tarde. El logo y el hero son lo primero que se
  // ve.
  it('el hero y el logo cargan de inmediato', () => {
    for (const page of PAGES) {
      for (const tag of imgs(read(page))) {
        const src = srcOf(tag);
        if (!/logo-db\.png|hero-van\.webp/.test(src)) continue;
        expect(tag, `${page} ${src}`).toMatch(/loading="eager"/);
      }
    }
  });

  it('y lo de mas abajo espera', () => {
    const below = imgs(read('index.html')).filter((t) => /mechanic-working/.test(srcOf(t)));
    expect(below.length).toBeGreaterThan(0);
    for (const t of below) expect(t).toMatch(/loading="lazy"/);
  });

  it('las imagenes grandes ya estan en formato moderno', () => {
    // hero-van y mechanic-working son webp. logo-db.png es un PNG a proposito:
    // lleva transparencia y lo usan el manifest y los iconos.
    for (const page of PAGES) {
      for (const tag of imgs(read(page))) {
        expect(srcOf(tag), `${page}`).not.toMatch(/\.(jpe?g)$/i);
      }
    }
  });
});

describe('el embudo ya decia donde, ahora dice por que', () => {
  // Los cinco pasos estaban medidos desde antes. Esto lo verifica para que una
  // limpieza futura no se lleve uno por delante sin que nadie lo note.
  it('los cinco pasos siguen medidos', () => {
    for (const step of ['select_service', 'select_date', 'address', 'quote_summary', 'payment']) {
      expect(app, `falta el paso ${step}`).toContain(`step: '${step}'`);
    }
    expect(app).toContain("posthog.capture('booking_completed'");
  });

  // "Se va por el precio de la visita?" no se puede contestar sin el numero.
  it('el resumen lleva el precio de la visita', () => {
    const ev = app.slice(app.indexOf("step: 'quote_summary'"));
    expect(ev.slice(0, 500)).toContain('callout_fee: calloutFee');
  });

  it('y un pago fallido dice de que tipo fue', () => {
    expect(app).toContain("posthog.capture('payment_failed'");
    for (const reason of ['card_declined', 'slot_taken', 'missing_email']) {
      expect(app, `falta la categoria ${reason}`).toContain(`'${reason}'`);
    }
  });

  // Si ya se habia cobrado, el problema es escribir la reserva y no el cobro -
  // y eso se arregla distinto.
  it('distingue el fallo antes del cobro del fallo despues', () => {
    const ev = app.slice(app.indexOf("posthog.capture('payment_failed'"));
    expect(ev.slice(0, 400)).toContain('after_charge');
  });

  // Esto sale a un servicio de terceros. El mensaje crudo de Stripe puede traer
  // datos del banco o del cliente.
  it('manda una categoria, nunca el mensaje crudo del error', () => {
    const ev = app.slice(
      app.indexOf('if (window.posthog) {'),
      app.indexOf("posthog.capture('payment_failed'") + 400
    );
    expect(ev).not.toMatch(/reason:\s*raw/);
    expect(ev).not.toMatch(/message:\s*e\.message/);
  });
});
