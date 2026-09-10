// tests/unit/review-stats.test.js
//
// Los dos contadores de resenas de la landing y la home estaban escritos a mano
// ("5.0" y "2 reviews on Google", en las dos paginas). El problema no era que
// estuvieran mal ese dia: era que nadie los iba a actualizar nunca. El dia de
// la tercera resena las dos paginas iban a seguir diciendo dos, y el dia de la
// vigesima tambien - justo cuando mas conviene mostrar traccion.
//
// Ahora hay dos origenes y solo uno se puede automatizar:
//
//   own     las resenas de la app. Salen de `bookings` y se actualizan solas.
//   google  Google NO nos avisa nada de nuestra propia ficha: leerla necesita
//           la Places API, que exige tarjeta. Los carga Diego en Admin.
//
// Y por eso lo que mas importa probar aca no es el promedio: es LO QUE SE
// DESCARTA. El bloque de Google lo escribe una persona a mano, y un "4,9" con
// coma, un 6 o un -2 tienen que desaparecer, no llegar a la landing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { reviewStats, googleStats } from '../../api/_review-stats.js';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// Los comentarios de este repo citan el codigo que reemplazan, asi que el
// comentario que explica por que se fue el "2 reviews on Google" contiene esa
// misma frase. Sin sacarlos, el guard se acusa a si mismo. Es la tercera vez
// que este patron muerde en esta area del codigo.
const noComments = (src) => src.replace(/<!--[\s\S]*?-->/g, ' ');

describe('las resenas propias', () => {
  it('sin resenas no hay promedio, y la cantidad es 0', () => {
    expect(reviewStats([])).toEqual({ rating: null, count: 0 });
    expect(reviewStats(null)).toEqual({ rating: null, count: 0 });
  });

  it('promedia a un decimal', () => {
    expect(reviewStats([5, 5, 4])).toEqual({ rating: '4.7', count: 3 });
  });

  it('un 5 perfecto sale "5.0", no "5"', () => {
    // toFixed y no Math.round(x*10)/10. Un "5" suelto al lado de las estrellas
    // se lee como algo a medio cargar.
    expect(reviewStats([5, 5]).rating).toBe('5.0');
  });

  // PostgREST devuelve numeros como texto tan seguido como numeros.
  it('acepta notas que llegan como texto', () => {
    expect(reviewStats(['5', '4'])).toEqual({ rating: '4.5', count: 2 });
  });

  it('descarta lo que no sea una nota de 1 a 5, y no lo cuenta', () => {
    // Una fila corrupta arrastraria el promedio de todas las demas.
    expect(reviewStats([5, 4, null, undefined, 0, 9, 'x'])).toEqual({ rating: '4.5', count: 2 });
  });
});

describe('los numeros de Google, escritos a mano', () => {
  it('los toma tal cual cuando son validos', () => {
    expect(googleStats('5', '14')).toEqual({ rating: '5.0', count: 14 });
  });

  // Diego escribe en espanol y el teclado de un celular ofrece coma.
  it('acepta la coma decimal', () => {
    expect(googleStats('4,8', '3')).toEqual({ rating: '4.8', count: 3 });
  });

  it('un promedio fuera de rango no llega a la pagina', () => {
    for (const bad of ['6', '-1', 'cinco', '', null, undefined]) {
      expect(googleStats(bad, '3').rating, `deberia descartar ${bad}`).toBeNull();
    }
  });

  // 0 significa "no cargado", no "cero estrellas": un negocio con resenas no
  // tiene promedio 0, y uno sin resenas no tiene promedio.
  it('un promedio de 0 se descarta', () => {
    expect(googleStats('0', '3').rating).toBeNull();
  });

  it('una cantidad que no sea un entero no llega a la pagina', () => {
    for (const bad of ['2.5', '-2', 'dos', '', null, undefined]) {
      expect(googleStats('5', bad).count, `deberia descartar ${bad}`).toBeNull();
    }
  });

  // Cargar uno y todavia no el otro es un estado normal mientras Diego escribe.
  it('los dos campos son independientes', () => {
    expect(googleStats('4.9', '')).toEqual({ rating: '4.9', count: null });
    expect(googleStats('', '7')).toEqual({ rating: null, count: 7 });
  });
});

describe('las dos paginas ya no tienen numeros escritos a mano', () => {
  // Esta es la regresion que importa: que alguien vuelva a tipear un numero
  // "para que se vea algo mientras tanto".
  for (const file of ['index.html', 'landing.html']) {
    it(`${file} no dice una cantidad de resenas fija`, () => {
      const src = noComments(read(file));
      expect(src, `${file} volvio a tener un contador tipeado`).not.toMatch(
        /\d+\s*reviews? on Google/i
      );
    });

    it(`${file} tiene los huecos que llena el servidor`, () => {
      const src = read(file);
      for (const id of ['google-rating', 'google-stars', 'google-count-link', 'own-stats']) {
        expect(src, `${file} perdio #${id}`).toContain(`id="${id}"`);
      }
    });

    // Sin `hidden` el hueco vacio se dibuja igual y queda un espacio raro al
    // lado del logo mientras carga - o para siempre, si el fetch falla.
    it(`${file} arranca con los numeros ocultos`, () => {
      const src = read(file).replace(/\s+/g, ' ');
      for (const id of ['google-rating', 'google-stars', 'own-stats']) {
        const tag = src.slice(src.indexOf(`id="${id}"`));
        expect(tag.slice(0, tag.indexOf('>')), `#${id} deberia arrancar hidden`).toContain('hidden');
      }
    });
  }
});

describe('el resto del cableado', () => {
  it('el endpoint existe y no invento un archivo nuevo', () => {
    // El proyecto esta en 12 de 12 funciones de Vercel: una funcion mas no
    // desplegaria.
    const src = read('api/chat.js');
    expect(src).toMatch(/req\.query\.type === 'site-stats'/);
    expect(fs.existsSync(path.join(ROOT, 'api', 'site-stats.js'))).toBe(false);
  });

  it('el admin guarda y lee las dos claves', () => {
    const src = read('js/admin.js');
    expect(src).toContain("'__google_rating__'");
    expect(src).toContain("'__google_reviews__'");
    expect(src).toMatch(/function saveGoogleReviews/);
    // Sin esto el boton es decoracion. Ya paso en este repo.
    expect(src).toMatch(/byId\('google-reviews-save-btn'\)\.addEventListener/);
  });

  it('las 5 cadenas nuevas estan en los tres idiomas', () => {
    const es = read('js/i18n-es.js');
    const zh = read('js/i18n-zh.js');
    const keys = [
      'Reviews on Google',
      '{n} review on Google',
      '{n} reviews on Google',
      '{n} review from our clients',
      '{n} reviews from our clients',
    ];
    for (const k of keys) {
      expect(es, `falta en es: ${k}`).toContain(`'${k}'`);
      expect(zh, `falta en zh: ${k}`).toContain(`'${k}'`);
    }
  });

  it('el plural se elige antes de traducir, no concatenando', () => {
    // `${n} + t('reviews')` da "1 reseñas" en espanol y ordena mal el chino.
    const src = read('js/app.js');
    expect(src).toMatch(/translateValue\(n === 1 \? one : many\)\.replace\('\{n\}', n\)/);
  });
});
