// tests/unit/completion-retry-columns.test.js
//
// El reintento de notificaciones (`/api/send-cron?type=completion-retry`, que
// corre dentro del cron diario `type=all`) vuelve a armar la factura, el email
// de resena y el SMS con `buildCompletionCalls`, pero a partir de una fila que
// arma SU PROPIA consulta.
//
// Cuando esas dos listas se separan no pasa nada visible. PostgREST no se
// queja: la columna simplemente no viene, llega `undefined`, y el reintento
// sale con un dato menos que el envio original. Nadie ve un error.
//
// Ya paso: el 2026-09-03 el link de resena empezo a llevar el `tracking_token`
// (es lo unico que le permite resenar a un invitado, PENDIENTES 89) y esta
// consulta no lo pedia. O sea que justo el cliente cuyo primer intento fallo -
// el unico al que el reintento existe para rescatar - recibia el link viejo,
// el que no lo deja resenar.
//
// El test no fija una lista escrita a mano: la deduce de lo que
// _completion-notify.js lee de verdad, asi que agregar un campo nuevo alla y
// olvidarse aca falla sin que nadie tenga que acordarse de nada.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Los comentarios de este repo citan codigo constantemente - el propio
// _completion-notify.js explica el bug del invitado escribiendo
// `booking.client_id` en prosa. Sin sacarlos, el test pediria una columna que
// nadie lee. Se saca el comentario, no la linea: `const x = 1; // booking.foo`
// tiene que conservar el codigo.
//
// El `.replace(/\r/g, '')` NO es cosmetico. Los archivos de este repo llegan
// con CRLF en Windows, `.` no matchea un terminador de linea, y `$` sin la
// bandera `m` pide fin de cadena: `//.*$` no borraba NADA en una linea que
// termina en `\r`. Este mismo error ya hizo pasar un guard sobre un bug vivo
// antes (docs/PENDIENTES.md, "un test que nunca se vio fallar no prueba nada").
const stripComments = (src) =>
  src
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

// Campos que buildCompletionCalls / calcCompletionTotals leen de la fila.
function fieldsReadOffBooking(src) {
  const found = new Set();
  for (const m of stripComments(src).matchAll(/\bbooking\??\.(\w+)/g)) found.add(m[1]);
  return found;
}

// La lista de columnas del select del reintento, sea cual sea la forma en que
// esten concatenadas las cadenas.
function retrySelectColumns(src) {
  const fn = src.slice(src.indexOf('async function handleCompletionRetry'));
  const call = fn.slice(fn.indexOf('.select('), fn.indexOf('.eq('));
  return new Set(
    [...call.matchAll(/'([^']*)'/g)]
      .map((m) => m[1])
      .join('')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
  );
}

describe('el reintento pide todo lo que despues va a leer', () => {
  const notify = read('api/_completion-notify.js');
  const cron = read('api/send-cron.js');
  const fields = fieldsReadOffBooking(notify);
  const columns = retrySelectColumns(cron);

  it('la deteccion funciona (si no, este test no probaria nada)', () => {
    // Sin esto, un regex que deje de matchear haria pasar el test siempre.
    expect(fields.size).toBeGreaterThan(5);
    expect(columns.size).toBeGreaterThan(5);
    expect(fields.has('client_email')).toBe(true);
  });

  it('ninguna columna que _completion-notify.js lee falta en el select', () => {
    const missing = [...fields].filter((f) => !columns.has(f));
    expect(missing, `faltan en el select del reintento: ${missing.join(', ')}`).toEqual([]);
  });

  // Nombrado aparte porque es el que costo caro y el que un futuro "limpiemos
  // columnas que no se usan" es mas probable que saque.
  it('tracking_token esta, que es lo que deja resenar a un invitado', () => {
    expect(columns.has('tracking_token')).toBe(true);
  });

  it('y el reintento sigue estando enganchado al cron diario', () => {
    // Un handler que no llama nadie es una red que no existe.
    expect(cron).toMatch(/wrap\(\(r\) => handleCompletionRetry\(req, r\)\)/);
    const vercel = JSON.parse(read('vercel.json'));
    expect(vercel.crons.some((c) => c.path.includes('send-cron?type=all'))).toBe(true);
  });
});
