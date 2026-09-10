// tests/unit/public-reviews-name-masked.test.js
//
// Habia DOS caminos por los que una resena sale a internet, y hasta el
// 2026-09-03 solo uno recortaba el nombre:
//
//   1. La vista `public_reviews` -> "Sarah M.", recortado en SQL.
//      Es la que consultan index.html y js/landing-inline.js con la anon key.
//   2. `GET /api/chat?type=reviews` -> nombre y apellido enteros.
//      Publico, sin autenticacion, y leia `bookings` con la service key, que
//      ignora RLS. Se le puso el mismo enmascarado el 03-sep.
//
// **El segundo ya no existe: se borro el 2026-09-10.** No lo llamaba nadie -
// ni el repo, ni nadie desde internet: 30 dias de logs de produccion daban 2
// llamadas a `/api/chat`, y las dos eran pruebas propias. Una ruta publica sin
// autenticacion que nadie usa es superficie regalada, y taparle la fuga no la
// justifica.
//
// Asi que ahora este archivo vigila dos cosas distintas: que el camino que
// queda siga enmascarando, y que **el que se fue no vuelva**. Lo segundo
// importa porque el codigo borrado es facil de resucitar de un git revert sin
// que nadie recuerde por que se habia ido.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { shortClientName } from '../../api/_privacy.js';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('shortClientName, ahora en el modulo de privacidad', () => {
  it('recorta el apellido a la inicial', () => {
    expect(shortClientName('Sarah Miller')).toBe('Sarah M.');
  });

  it('un nombre solo queda igual', () => {
    expect(shortClientName('Solo')).toBe('Solo');
  });

  it('sin nombre no inventa uno', () => {
    for (const v of ['', null, undefined, '   ']) {
      expect(shortClientName(v)).toBe('Dr. Bike client');
    }
  });

  it('tres nombres tampoco filtran el resto', () => {
    expect(shortClientName('Ana Maria Perez Gomez')).toBe('Ana M.');
  });

  // api/auth.js lo sigue exportando: mechanic-stats.test.js lo importa de ahi
  // y lo LLAMA, asi que la resolucion en tiempo de ejecucion ya esta probada
  // -- este archivo no vuelve a importar auth.js a proposito, y esa decision
  // tiene su propia evidencia: cuando lo hacia, el import tardaba mas de 5s con
  // la suite entera corriendo y el test moria por timeout. Es exactamente el
  // motivo por el que chat.js no puede importarlo tampoco.
  //
  // Lo que si se fija aca es la FORMA. Tiene que ser import + export por
  // separado: `export { x } from './y.js'` re-exporta pero no trae el nombre al
  // alcance local, y auth.js lo llama doce lineas mas abajo. Eso habria sido un
  // ReferenceError en produccion, y `node --check` lo da por bueno porque es
  // sintaxis valida.
  it('api/auth.js lo importa de verdad, no solo lo re-exporta', () => {
    const src = read('api/auth.js');
    expect(src).toMatch(/import \{ shortClientName \} from '\.\/_privacy\.js'/);
    expect(src).not.toMatch(/export \{ shortClientName \} from/);
    expect(src).toMatch(/export \{ shortClientName \};/);
  });
});

describe('el camino que se borro no vuelve', () => {
  const chat = read('api/chat.js');
  // El comentario que explica el borrado nombra `?type=reviews`, asi que hay
  // que sacar los comentarios antes de buscarlo. Es el mismo tropiezo que ya
  // se repitio tres veces en esta area del codigo.
  const code = chat
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\r/g, '').replace(/\/\/.*$/, ''))
    .join('\n');

  it('la deteccion funciona (el resto del archivo sigue ahi)', () => {
    // Sin esto, un stripComments roto dejaria `code` vacio y las dos
    // afirmaciones de abajo pasarian sobre la nada.
    expect(code).toMatch(/req\.query\.type === 'health'/);
    expect(code).toMatch(/req\.query\.type === 'site-stats'/);
  });

  it('no hay ninguna rama que responda ?type=reviews', () => {
    expect(code, 'volvio el endpoint que nadie llamaba').not.toMatch(
      /req\.query\.type === 'reviews'/
    );
  });

  it('ni quedo el import que solo servia para eso', () => {
    expect(code, 'shortClientName ya no se usa en chat.js').not.toMatch(/shortClientName/);
  });
});

describe('el camino publico que queda enmascara', () => {
  it('la vista lo recorta en SQL', () => {
    const sql = read('scripts/create-public-reviews-view.sql');
    expect(sql).toMatch(/split_part\(b\.client_name/);
    expect(sql).toMatch(/as display_name/);
    // La vista no puede exponer la columna cruda con ese nombre.
    expect(sql).not.toMatch(/b\.client_name as client_name/);
  });

  it('las superficies publicas leen la vista, no la tabla', () => {
    for (const f of ['index.html', 'js/landing-inline.js']) {
      const src = read(f);
      expect(src, `${f} deberia leer public_reviews`).toMatch(/from\('public_reviews'\)/);
      expect(src, `${f} no puede consultar bookings con la anon key`).not.toMatch(
        /\.from\('bookings'\)/
      );
    }
  });
});
