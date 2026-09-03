// tests/unit/guest-can-review.test.js
//
// El invitado recibia el email de resena y no podia dejarla. Nadie lo vio
// porque los dos muros estaban en archivos distintos y ninguno de los dos
// parece roto por separado:
//
//   js/supabase.js  -> sin sesion, "Please sign in to leave a review."
//   api/auth.js     -> booking.client_id !== client_id, 403
//
// Y `api/auth.js` crea las reservas de invitado con `client_id: null`. O sea
// que la segunda condicion no podia dar verdadera nunca para un invitado, ni
// siquiera si despues se creaba una cuenta: null no es igual a un uuid nuevo.
//
// Un negocio que todavia no lanzo no tiene ni una cuenta creada. Sus primeros
// clientes son todos invitados. Este era el camino de la PRIMERA resena.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { reviewCredential, reviewGate } from '../../api/_review-auth.js';
import { buildCompletionCalls } from '../../api/_completion-notify.js';
import { EXPIRY_DAYS, FULL_DAYS } from '../../api/_tracking-scope.js';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOKEN = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const NOW = Date.parse('2026-09-03T10:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString().slice(0, 10);

// Una reserva de invitado tal como la escribe api/auth.js: sin cuenta detras.
const guestBooking = (over = {}) => ({
  id: 'bk-1',
  status: 'completed',
  client_id: null,
  client_rating: null,
  scheduled_date: daysAgo(1),
  ...over,
});

describe('la credencial que trae el pedido', () => {
  it('sin sesion y sin token no alcanza, y lo dice nombrando las dos', () => {
    const r = reviewCredential({ booking_id: 'bk-1', rating: 5 });
    expect(r.status).toBe(400);
    expect(r.error).toMatch(/tracking_token/);
  });

  it('el token solo alcanza: identifica la reserva por si mismo', () => {
    expect(reviewCredential({ tracking_token: TOKEN, rating: 5 })).toEqual({ mode: 'token' });
  });

  it('la sesion sola alcanza, como siempre', () => {
    expect(
      reviewCredential({ booking_id: 'bk-1', access_token: 'a', client_id: 'u1', rating: 5 })
    ).toEqual({ mode: 'session' });
  });

  // Este es el caso que el arreglo ingenuo se pierde: el invitado que despues
  // se crea una cuenta y hace clic en el link del email ya firmado. Si gana la
  // sesion, el servidor compara null contra su uuid nuevo y contesta 403 por
  // un trabajo que es evidentemente suyo.
  it('con las dos, gana el token', () => {
    expect(
      reviewCredential({
        booking_id: 'bk-1',
        tracking_token: TOKEN,
        access_token: 'a',
        client_id: 'u1',
        rating: 5,
      })
    ).toEqual({ mode: 'token' });
  });

  it('el rating se sigue validando en los dos caminos', () => {
    for (const rating of [0, 6, null, undefined]) {
      expect(reviewCredential({ tracking_token: TOKEN, rating }).status).toBe(400);
      expect(
        reviewCredential({ booking_id: 'b', access_token: 'a', client_id: 'u', rating }).status
      ).toBe(400);
    }
  });
});

describe('la puerta: el invitado pasa, y sigue pasando lo que ya se cuidaba', () => {
  it('el invitado con su token deja la resena', () => {
    expect(reviewGate(guestBooking(), { mode: 'token' }, NOW)).toEqual({ ok: true });
  });

  // La regresion exacta que se arregla. Antes de 2026-09-03 esto era 403.
  it('el invitado que despues se creo una cuenta tambien', () => {
    expect(reviewGate(guestBooking(), { mode: 'token', client_id: 'uuid-nuevo' }, NOW)).toEqual({
      ok: true,
    });
  });

  it('con sesion, la reserva de otro sigue siendo 403', () => {
    const r = reviewGate(
      guestBooking({ client_id: 'u1' }),
      { mode: 'session', client_id: 'u2' },
      NOW
    );
    expect(r.status).toBe(403);
  });

  // La pertenencia se decide ANTES que el estado: contestar "todavia no esta
  // completado" sobre la reserva de otro ya cuenta algo de esa reserva.
  it('y contesta 403 antes de decir en que anda el trabajo', () => {
    const r = reviewGate(
      guestBooking({ client_id: 'u1', status: 'confirmed' }),
      { mode: 'session', client_id: 'u2' },
      NOW
    );
    expect(r.status).toBe(403);
  });

  it('un trabajo sin terminar no se puede resenar', () => {
    expect(reviewGate(guestBooking({ status: 'confirmed' }), { mode: 'token' }, NOW).status).toBe(
      400
    );
  });

  it('resenar dos veces sigue dando 409', () => {
    expect(reviewGate(guestBooking({ client_rating: 4 }), { mode: 'token' }, NOW).status).toBe(409);
  });

  it('una fila que no existe es 404 en los dos caminos', () => {
    expect(reviewGate(null, { mode: 'token' }, NOW).status).toBe(404);
    expect(reviewGate(undefined, { mode: 'session', client_id: 'u1' }, NOW).status).toBe(404);
  });
});

describe('el link no vale para siempre', () => {
  it(`sigue valiendo pasada la ventana completa de ${FULL_DAYS} dias`, () => {
    // 'limited' apaga direccion y PIN en la pagina de seguimiento, pero la
    // resena tiene que poder dejarse igual: ese es el motivo por el que el
    // token no se apaga al completar el trabajo.
    expect(reviewGate(guestBooking({ scheduled_date: daysAgo(FULL_DAYS + 5) }), { mode: 'token' }, NOW)).toEqual({
      ok: true,
    });
  });

  it(`a los ${EXPIRY_DAYS} dias se acabo, con 410`, () => {
    const r = reviewGate(
      guestBooking({ scheduled_date: daysAgo(EXPIRY_DAYS + 1) }),
      { mode: 'token' },
      NOW
    );
    expect(r.status).toBe(410);
    expect(r.expired).toBe(true);
  });

  // La caducidad no aplica al camino de la sesion: alguien entrando desde su
  // propia lista de reservas no trae ningun link.
  it('con sesion, una reserva vieja propia se puede resenar igual', () => {
    expect(
      reviewGate(
        guestBooking({ client_id: 'u1', scheduled_date: daysAgo(EXPIRY_DAYS + 30) }),
        { mode: 'session', client_id: 'u1' },
        NOW
      )
    ).toEqual({ ok: true });
  });
});

describe('el token viaja en el link que se manda', () => {
  const base = {
    booking: {
      id: 'bk-1',
      client_email: 'ana@example.com',
      client_phone: '0400000000',
      service_name: 'Tune-Up',
      service_price: 100,
      callout_fee: 25,
      tracking_token: TOKEN,
    },
    partsCharged: null,
    tipAmount: 0,
  };

  it('el SMS lleva el token', () => {
    const sms = buildCompletionCalls(base).find((c) => c.path === '/api/send-sms');
    expect(sms.body.reviewLink).toBe(`https://drbikesydney.com.au/?review=bk-1&t=${TOKEN}`);
  });

  it('y el email lo recibe aparte, para armar su propio href', () => {
    const email = buildCompletionCalls(base).find(
      (c) => c.path === '/api/send-email' && c.body.type === 'review_request'
    );
    expect(email.body.reviewToken).toBe(TOKEN);
  });

  // Un entorno donde scripts/add-tracking-token.sql no corrio. Verificado el
  // 2026-09-03 que en produccion la columna SI existe (public-track con un uuid
  // al azar contesta 404, cosa que solo puede hacer si la columna resuelve).
  it('sin token, el link sigue siendo el de antes en vez de decir undefined', () => {
    const sinToken = { ...base, booking: { ...base.booking, tracking_token: null } };
    const sms = buildCompletionCalls(sinToken).find((c) => c.path === '/api/send-sms');
    expect(sms.body.reviewLink).toBe('https://drbikesydney.com.au/?review=bk-1');
    expect(sms.body.reviewLink).not.toMatch(/undefined|null/);
  });
});

describe('las dos puntas que no son funciones puras', () => {
  it('la app lee `t` antes de borrar la query de la barra de direcciones', () => {
    const src = read('js/app.js');
    const block = src.slice(src.indexOf("p.get('review')"));
    const readsToken = block.indexOf("p.get('t')");
    const wipes = block.indexOf("history.replaceState({}, '', '/')");
    expect(readsToken).toBeGreaterThan(-1);
    expect(readsToken).toBeLessThan(wipes);
  });

  it('submitReview manda el token cuando no hay sesion', () => {
    const src = read('js/supabase.js');
    expect(src).toMatch(/tracking_token: trackingToken/);
    // Y no vuelve a exigir sesion a secas.
    expect(src).toMatch(/!session\?\.user && !trackingToken/);
  });

  it('los dos errores de esta pantalla estan en los tres idiomas', () => {
    const es = read('js/i18n-es.js');
    const zh = read('js/i18n-zh.js');
    for (const s of ['Please sign in to leave a review.', 'This review link has expired.']) {
      expect(es, `falta en es: ${s}`).toContain(`'${s}'`);
      expect(zh, `falta en zh: ${s}`).toContain(`'${s}'`);
    }
  });

  it('el email arma el href con el token, y descarta uno que no sea un uuid', () => {
    const src = read('api/send-email.js');
    expect(src).toMatch(/\?review=\$\{bookingId\}\$\{reviewToken \? `&t=\$\{reviewToken\}` : ''\}/);
    expect(src).toMatch(/\[0-9a-fA-F-\]\{36\}/);
  });

  it('la escritura usa el id de la fila, no el del pedido', () => {
    const src = read('api/auth.js');
    const fn = src.slice(src.indexOf('async function handleClientReview'));
    const body = fn.slice(0, fn.indexOf('\nconst ALL_SLOTS'));
    // Con el token, booking_id no es credencial: podria ser el de otra reserva.
    expect(body).toMatch(/const targetId = booking\.id/);
    expect(body).toMatch(/bookings\?id=eq\.\$\{encodeURIComponent\(targetId\)\}/);
    expect(body).not.toMatch(/bookings\?id=eq\.\$\{encodeURIComponent\(booking_id\)\}/);
  });
});
