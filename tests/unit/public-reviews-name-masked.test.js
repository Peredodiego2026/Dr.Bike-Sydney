// tests/unit/public-reviews-name-masked.test.js
//
// Hay DOS caminos por los que una resena sale a internet, y hasta el
// 2026-09-03 solo uno recortaba el nombre:
//
//   1. La vista `public_reviews` -> "Sarah M.", recortado en SQL.
//      Es la que consultan index.html y js/landing-inline.js con la anon key.
//   2. `GET /api/chat?type=reviews` -> nombre y apellido enteros.
//      Publico, sin autenticacion, y lee `bookings` con la service key, que
//      ignora RLS. No lo llama nada del repo, pero responde igual desde
//      internet: verificado el 2026-09-03, contesta 200.
//
// Hoy los dos devuelven vacio porque no hay ninguna resena. El segundo se
// volvia fuga solo, el dia del primer trabajo terminado - que es justo lo que
// esta sesion estuvo desbloqueando.
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

describe('los dos caminos publicos enmascaran', () => {
  it('el endpoint de chat no devuelve el nombre crudo', () => {
    const src = read('api/chat.js');
    const block = src.slice(src.indexOf("req.query.type === 'reviews'"));
    const body = block.slice(0, block.indexOf('return res.status(200).json({ reviews })'));
    expect(body).toMatch(/client_name: shortClientName\(/);
    // La forma exacta que filtraba.
    expect(body).not.toMatch(/client_name: r\.client_name \|\|/);
  });

  it('y la vista lo recorta en SQL', () => {
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
