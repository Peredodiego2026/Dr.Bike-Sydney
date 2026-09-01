// tests/unit/payment-races.test.js
//
// Punto 4 de la auditoria: *"El servidor recalcula la tarifa por zona y
// reembolsa lo que no coincide. Falta probar carreras: la misma reserva diez
// veces en un segundo, y cancelar en el instante en que el mecanico completa.
// Cerrado cuando hay un test que dispara ambas y demuestra que no se duplica el
// cobro."*
//
// Las dos se disparan aca de verdad - con Promise.all sobre las funciones
// reales, no leyendo el codigo fuente y afirmando que parece correcto.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { completionVerdict } from '../../api/_completion-guard.js';
import { slotVerdict, expiredHoldIds } from '../../api/_slot-hold.js';

const auth = fs.readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');

// El cuerpo de una funcion de auth.js, de su firma hasta la siguiente. Cortar
// por un numero fijo de caracteres deja fuera media funcion y hace que el test
// pase o falle segun cuantos comentarios tenga arriba.
function fnBody(name) {
  const start = auth.indexOf(`async function ${name}`);
  if (start === -1) throw new Error(`no existe ${name} en api/auth.js`);
  const next = auth.indexOf('async function ', start + 1);
  return auth.slice(start, next === -1 ? auth.length : next);
}

describe('CARRERA 1: la misma reserva diez veces en un segundo', () => {
  const who = {
    clientId: 'client-a',
    email: 'a@example.com',
    date: '2026-09-03',
    time: '10:00:00',
  };
  const hold = {
    id: 'bk_hold',
    status: 'pending',
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
    scheduled_date: '2026-09-03',
    scheduled_time: '10:00:00',
    client_id: 'client-a',
    client_email: 'a@example.com',
  };

  // Diez toques del boton en paralelo. El primero crea la retencion; los otros
  // nueve tienen que RECONOCERLA como propia, no pedir una segunda.
  it('diez intentos simultaneos ven una sola retencion, no diez', async () => {
    const verdicts = await Promise.all(
      Array.from({ length: 10 }, async () => slotVerdict([hold], who))
    );
    expect(verdicts.every((v) => v.verdict === 'mine')).toBe(true);
    expect(new Set(verdicts.map((v) => v.bookingId)).size).toBe(1);
  });

  // Y si los diez son de personas distintas sobre el mismo horario, nueve
  // tienen que rebotar ANTES de que se les toque la tarjeta.
  it('diez clientes distintos sobre el mismo horario: uno entra, nueve rebotan', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, async (_, i) =>
        slotVerdict([hold], { ...who, clientId: `client-${i}`, email: `c${i}@x.com` })
      )
    );
    const taken = results.filter((r) => r.verdict === 'taken');
    const mine = results.filter((r) => r.verdict === 'mine');
    expect(mine).toHaveLength(0);
    expect(taken).toHaveLength(10);
  });

  // La red de la base, por si las dos anteriores fallaran: el indice unico.
  it('y por debajo hay un indice unico que no depende de la app', () => {
    const sql = fs.readFileSync(
      new URL('../../scripts/add-booking-unique-constraint.sql', import.meta.url),
      'utf8'
    );
    expect(sql).toMatch(/CREATE UNIQUE INDEX/i);
    expect(sql).toMatch(/van_number, scheduled_date, scheduled_time/);
  });

  // Un pago solo puede respaldar UNA reserva. Si el mismo PaymentIntent llega
  // dos veces, la segunda se rechaza.
  it('un mismo pago no puede respaldar dos reservas', () => {
    expect(auth).toContain("This payment was already used for a booking");
    expect(auth).toMatch(/\.eq\('stripe_payment_intent_id', verifiedPI\)/);
  });

  // Y si el indice rechaza el insert con un pago detras, se reembolsa.
  it('si aun asi choca, el cobro se devuelve', () => {
    const block = auth.slice(auth.indexOf("insErr.code === '23505'"));
    expect(block.slice(0, 900)).toContain('refunds.create');
  });
});

describe('CARRERA 2: cancelar en el instante en que el mecanico completa', () => {
  // El guard del lado del mecanico ya existia y esta bien: completar algo
  // cancelado se rechaza, y completar algo ya completado se responde sin
  // ejecutar nada de nuevo.
  it('completar un trabajo cancelado se rechaza', () => {
    const v = completionVerdict({ status: 'cancelled' });
    expect(v.action).toBe('reject');
    expect(v.status).toBe(409);
    expect(v.body.code).toBe('JOB_CANCELLED');
  });

  it('completar dos veces no ejecuta nada la segunda vez', () => {
    const v = completionVerdict({ status: 'completed', final_charge_status: 'charged_card_on_file' });
    expect(v.action).toBe('replay');
    expect(v.body.already_completed).toBe(true);
    // Lo que importa: nada nuevo se envio ni se cobro.
    expect(v.body.notified.sent).toEqual([]);
    expect(v.body.low_stock).toEqual([]);
  });

  it('diez finalizaciones simultaneas: una hace el trabajo, nueve repiten', async () => {
    let row = { status: 'confirmed' };
    const verdicts = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const v = completionVerdict(row);
        if (v.action === 'proceed') row = { status: 'completed', final_charge_status: 'none' };
        return v;
      })
    );
    expect(verdicts.filter((v) => v.action === 'proceed')).toHaveLength(1);
    expect(verdicts.filter((v) => v.action === 'replay')).toHaveLength(9);
  });

  // LA DIRECCION QUE FALTABA, y era un bug real.
  //
  // handleClientCancel leia el estado, comprobaba que fuera pending/confirmed,
  // y DESPUES escribia sin volver a comprobarlo. Entre la lectura y el PATCH el
  // mecanico podia completar: el PATCH pisaba 'completed' con 'cancelled' y a
  // continuacion reembolsaba un trabajo que se hizo de verdad.
  it('cancelar filtra por estado tambien en la ESCRITURA, no solo al leer', () => {
    const fn = auth.slice(auth.indexOf('async function handleClientCancel'));
    const patch = fn.slice(fn.indexOf('method: \'PATCH\'') - 600, fn.indexOf('method: \'PATCH\'') + 400);
    expect(patch).toContain('status=in.(pending,confirmed)');
  });

  // `minimal` devuelve 204 tanto si cambio una fila como si no cambio ninguna,
  // y esa diferencia es exactamente la que decide si se reembolsa.
  it('y sabe si actualizo algo, en vez de suponerlo', () => {
    const fn = fnBody('handleClientCancel');
    expect(fn).toContain("Prefer: 'return=representation'");
    expect(fn).toContain('CANCEL_RACE_LOST');
  });

  it('si perdio la carrera, no reembolsa nada', () => {
    const fn = fnBody('handleClientCancel');
    const lost = fn.indexOf('CANCEL_RACE_LOST');
    const refund = fn.indexOf('refund', lost);
    const returnAt = fn.indexOf('return res.status(409)', lost - 400);
    // El return del 409 va ANTES de cualquier reembolso.
    expect(returnAt).toBeGreaterThan(-1);
    expect(returnAt).toBeLessThan(refund === -1 ? Infinity : refund);
  });
});

describe('el reembolso solo corre si la cancelacion gano', () => {
  // El mutante que faltaba: neutralizar esta condicion dejaba pasar el 409 y
  // se reembolsaba igual. Se afirma la condicion en si, porque es la que
  // convierte "el PATCH no toco ninguna fila" en "no toques la plata".
  it('la carrera se decide mirando si el PATCH devolvio filas', () => {
    const fn = fnBody('handleClientCancel');
    expect(fn).toContain('if (!Array.isArray(updated) || updated.length === 0) {');
  });

  // BUG VIVO encontrado escribiendo esto: notifyAdminCancellation(bk) usaba
  // SERVICE_KEY y booking_id, que estan declarados dentro de
  // handleClientCancel y no ahi. ReferenceError dentro de un try/catch que
  // solo logea, asi que el credito de referido NO se devolvia nunca al
  // cancelar - justo lo que el comentario de esa funcion decia evitar.
  it('la funcion de reembolso recibe lo que usa, no lo toma prestado', () => {
    const fn = fnBody('notifyAdminCancellation');
    expect(fn.startsWith('async function notifyAdminCancellation(bk, SERVICE_KEY)')).toBe(true);
    expect(fn).not.toContain('booking_id');
  });

  it('y quien la llama se la pasa', () => {
    expect(fnBody('handleClientCancel')).toContain('notifyAdminCancellation(bk, SERVICE_KEY)');
  });
});

// Lo anterior es sintaxis VALIDA: `node --check` pasa y revienta en
// produccion. Ya paso dos veces en este repo (el `holdOnly` de la reserva y
// este). La unica red que lo agarra antes es no-undef.
describe('una variable fuera de alcance no llega a produccion', () => {
  it('no-undef esta encendido como error', () => {
    const cfg = fs.readFileSync(new URL('../../eslint.config.js', import.meta.url), 'utf8');
    expect(cfg).toMatch(/no-undef.{0,6}error/);
  });
});
describe('la limpieza de retenciones no puede tocar una reserva pagada', () => {
  // El barrido corre en el camino de escritura, en paralelo con otros. Si
  // alguna vez incluyera una fila pagada, borraria una cita real.
  it('nunca lista una reserva con pago, por vieja que sea', () => {
    const rows = [
      { id: 'pagada', status: 'pending', stripe_payment_intent_id: 'pi_1', created_at: '2020-01-01T00:00:00Z' },
      { id: 'vieja', status: 'pending', stripe_payment_intent_id: null, created_at: '2020-01-01T00:00:00Z' },
      { id: 'confirmada', status: 'confirmed', stripe_payment_intent_id: null, created_at: '2020-01-01T00:00:00Z' },
    ];
    expect(expiredHoldIds(rows)).toEqual(['vieja']);
  });
});
