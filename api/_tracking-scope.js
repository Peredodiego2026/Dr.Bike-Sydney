// api/_tracking-scope.js — cuanto tiempo, y cuanto, entrega un link de
// seguimiento.
//
// PORQUE EXISTE
//
// Punto 5 de la auditoria: *"el tracking_token es la credencial: da direccion,
// codigo de llegada y posicion en vivo. Es correcto que sea compartible.
// Cerrado cuando esta decidido y aplicado si caduca, cuando, y que largo
// tiene."*
//
// Hasta el 2026-09-01 la respuesta era: no caduca nunca. Un link mandado por
// email en agosto seguia devolviendo la direccion exacta del cliente y su PIN
// de llegada en diciembre, con el trabajo terminado hace meses.
//
// EL LARGO YA ESTABA BIEN
//
// El token es un UUID v4 (`gen_random_uuid()` en scripts/add-tracking-token.sql):
// 122 bits de aleatoriedad. Adivinarlo no es una amenaza realista y no hay nada
// que cambiar ahi. Lo que faltaba era el tiempo.
//
// POR QUE NO SE APAGA DE GOLPE AL TERMINAR EL TRABAJO
//
// El mismo link se le manda al cliente para que deje su resena despues del
// servicio (api/auth.js manda el email de review con /track.html?token=...).
// Matarlo al completar romperia ese flujo, que es de donde salen las resenas
// que la landing muestra.
//
// Asi que caduca en dos escalones, y cada dato se apaga cuando deja de tener
// sentido:
//
//   FULL      el trabajo esta por venir, en curso, o termino hace poco.
//             Todo: direccion, arrival_pin, GPS del mecanico.
//
//   LIMITED   pasada esa ventana. El link SIGUE funcionando - la resena se
//             puede dejar igual - pero ya no entrega direccion, PIN ni
//             posicion. Ninguno de los tres significa nada para un trabajo
//             terminado hace semanas, y son justo los que dolerian si el link
//             se filtra.
//
//   EXPIRED   pasado el plazo largo. 410 Gone.
//
// El ancla es `scheduled_date`, no `completed_at`: siempre esta presente en la
// fila y en la consulta que ya hace el endpoint, asi que esto no depende de
// ninguna migracion - y en este proyecto el codigo llega a main antes de que
// el SQL se corra a mano.

/** Dias tras la fecha del turno en que el link sigue dando todo. */
export const FULL_DAYS = 7;

/**
 * Dias tras los cuales el link deja de responder.
 *
 * 90 da tiempo de sobra para dejar una resena (el pedido sale el mismo dia) y
 * para que el cliente vuelva a mirar su comprobante, sin dejar un link con la
 * direccion de alguien vivo para siempre.
 */
export const EXPIRY_DAYS = 90;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Que puede ver este link ahora mismo.
 *
 * Devuelve 'full' | 'limited' | 'expired'. Puro, para poder testear la decision
 * sin base de datos - que es la parte que lleva el razonamiento.
 */
export function trackingScope(booking, nowMs = Date.now()) {
  if (!booking || typeof booking !== 'object') return 'expired';

  // Un trabajo que todavia no termino da todo, sin importar la fecha: una
  // reserva reprogramada varias veces puede tener una scheduled_date vieja y
  // seguir siendo el trabajo de manana.
  const done = ['completed', 'cancelled', 'no_show'].includes(booking.status);
  if (!done) return 'full';

  // Sin fecha no hay edad demostrable. Se degrada a 'limited' en vez de
  // 'expired': quitar los datos sensibles es la respuesta segura, y romper el
  // link de alguien por una fila rara seria peor que el riesgo que evita.
  const at = Date.parse(booking.scheduled_date || '');
  if (!Number.isFinite(at)) return 'limited';

  const age = nowMs - at;
  if (age > EXPIRY_DAYS * DAY) return 'expired';
  if (age > FULL_DAYS * DAY) return 'limited';
  return 'full';
}

/**
 * Quita del cuerpo lo que este alcance no permite ver.
 *
 * Se BORRAN las claves en vez de mandarlas en null: un cliente que ve
 * `address: null` cree que se perdio su direccion. Ausente es "esto ya no se
 * informa"; null seria "esto esta vacio".
 */
export function applyTrackingScope(body, scope) {
  if (scope === 'full') return body;
  const out = { ...body };
  for (const k of ['address', 'address_lat', 'address_lng', 'arrival_pin', 'mechanic_notes']) {
    delete out[k];
  }
  // La posicion en vivo tampoco: el mecanico no esta yendo a ningun lado.
  out.mechanic_location = null;
  out.tracking_scope = scope;
  return out;
}
