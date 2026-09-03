// api/_review-auth.js — quien puede dejar una resena, y con que.
//
// PORQUE EXISTE
//
// Hasta el 2026-09-03 dejar una resena exigia una sesion, y la fila tenia que
// ser de esa cuenta:
//
//   if (booking.client_id !== client_id) return 403
//
// `api/auth.js` crea las reservas de invitado con `user_id: null, client_id:
// null` - eso ES reservar sin cuenta. Asi que para un invitado esa condicion
// no podia dar verdadera nunca:
//
//   sin sesion     -> js/supabase.js tiraba "Please sign in to leave a review."
//   con cuenta nueva -> 403, porque null nunca es igual al uuid de la cuenta
//
// A todos se les mandaba el email de resena y ninguno podia dejarla. Para un
// negocio que todavia no tiene ni una cuenta creada, los invitados no son un
// caso borde: son los clientes.
//
// LA SEGUNDA CREDENCIAL
//
// El `tracking_token` de la propia reserva. Es un UUID v4 (122 bits) que
// `/api/auth?role=public-track` ya cambia por la direccion del cliente y su PIN
// de llegada. Aceptarlo aca concede estrictamente menos de lo que ya concede, y
// como tiene indice unico identifica la reserva por si solo: en el camino del
// token el `booking_id` del pedido no se consulta.
//
// Caduca con el mismo reloj que la pagina de seguimiento (_tracking-scope.js).
//
// Las dos funciones son puras a proposito: la decision se puede probar sin base
// de datos, que es la parte donde vivia el bug.

import { trackingScope } from './_tracking-scope.js';

/**
 * Que credencial trae el pedido.
 *
 * Devuelve { mode: 'token' | 'session' } o { status, error } listo para
 * responder. El token gana sobre la sesion aunque vengan las dos: esta atado a
 * ESTA reserva, y la sesion no. Un invitado que reserva sin cuenta y se crea
 * una despues llega firmado como alguien que la reserva no conoce.
 */
export function reviewCredential(body = {}) {
  const { booking_id, access_token, client_id, tracking_token, rating } = body;
  const byToken = !!tracking_token;

  if (!booking_id && !byToken) return { status: 400, error: 'booking_id required' };
  if (!byToken && (!access_token || !client_id))
    return { status: 400, error: 'access_token and client_id, or tracking_token, required' };
  if (!rating || rating < 1 || rating > 5) return { status: 400, error: 'rating must be 1-5' };

  return { mode: byToken ? 'token' : 'session' };
}

/**
 * Si esta fila, con esa credencial, admite una resena ahora.
 *
 * Devuelve { ok: true } o { status, error }. El orden importa:
 *
 *  - La pertenencia va primero. Contestar "todavia no esta completado" sobre
 *    la reserva de otro ya cuenta algo de esa reserva.
 *  - La caducidad va antes que el estado por lo mismo: un link vencido no
 *    tiene por que decir en que anda el trabajo.
 */
export function reviewGate(booking, { mode, client_id } = {}, nowMs = Date.now()) {
  if (!booking) return { status: 404, error: 'Booking not found' };

  if (mode !== 'token' && booking.client_id !== client_id)
    return { status: 403, error: 'Forbidden' };

  if (mode === 'token' && trackingScope(booking, nowMs) === 'expired')
    return { status: 410, error: 'This review link has expired.', expired: true };

  if (booking.status !== 'completed') return { status: 400, error: 'Booking not completed yet' };
  if (booking.client_rating) return { status: 409, error: 'Already reviewed' };

  return { ok: true };
}
