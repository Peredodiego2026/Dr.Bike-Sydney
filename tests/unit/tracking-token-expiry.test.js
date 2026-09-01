// tests/unit/tracking-token-expiry.test.js
//
// Punto 5 de la auditoria: *"el tracking_token es la credencial: da direccion,
// codigo de llegada y posicion en vivo. Es correcto que sea compartible.
// Cerrado cuando esta decidido y aplicado si caduca, cuando, y que largo
// tiene."*
//
// La respuesta era: no caducaba nunca. Un link mandado por email en agosto
// seguia devolviendo la direccion exacta del cliente y su PIN de llegada en
// diciembre, con el trabajo terminado hace meses.
//
// EL LARGO no habia que cambiarlo: es un UUID v4, 122 bits. Adivinarlo no es
// una amenaza realista. Lo que faltaba era el tiempo.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  trackingScope,
  applyTrackingScope,
  FULL_DAYS,
  EXPIRY_DAYS,
} from '../../api/_tracking-scope.js';

const NOW = Date.parse('2026-09-01T10:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString().slice(0, 10);

const bk = (over = {}) => ({
  status: 'completed',
  scheduled_date: daysAgo(1),
  address: '10 Example St, Curl Curl',
  arrival_pin: '3352',
  mechanic_notes: 'gear cable frayed',
  ...over,
});

describe('un trabajo que todavia no termino da todo', () => {
  // Sin importar la fecha: una reserva reprogramada varias veces puede tener
  // una scheduled_date vieja y seguir siendo el trabajo de manana.
  for (const status of ['pending', 'confirmed', 'enroute', 'in_progress', 'arrived']) {
    it(`${status} es full aunque la fecha sea vieja`, () => {
      expect(trackingScope(bk({ status, scheduled_date: daysAgo(300) }), NOW)).toBe('full');
    });
  }
});

describe('despues del trabajo, por escalones', () => {
  it('recien terminado sigue dando todo', () => {
    expect(trackingScope(bk({ scheduled_date: daysAgo(0) }), NOW)).toBe('full');
    expect(trackingScope(bk({ scheduled_date: daysAgo(FULL_DAYS - 1) }), NOW)).toBe('full');
  });

  it(`pasados ${FULL_DAYS} dias deja de dar los datos sensibles`, () => {
    expect(trackingScope(bk({ scheduled_date: daysAgo(FULL_DAYS + 1) }), NOW)).toBe('limited');
  });

  it(`pasados ${EXPIRY_DAYS} dias no responde mas`, () => {
    expect(trackingScope(bk({ scheduled_date: daysAgo(EXPIRY_DAYS + 1) }), NOW)).toBe('expired');
  });

  it('cancelado y con no-show cuentan como terminados', () => {
    for (const status of ['cancelled', 'no_show']) {
      expect(trackingScope(bk({ status, scheduled_date: daysAgo(30) }), NOW)).toBe('limited');
    }
  });
});

describe('lo que se degrada, y lo que sobrevive', () => {
  const body = {
    id: 'bk1',
    status: 'completed',
    service_name: 'Tune-Up',
    scheduled_date: '2026-07-01',
    address: '10 Example St',
    address_lat: -33.7,
    address_lng: 151.3,
    arrival_pin: '3352',
    mechanic_notes: 'nota interna',
    client_rating: null,
    client_review: null,
    mechanic_location: { lat: -33.7, lng: 151.3 },
  };

  // Los cuatro que dolerian si el link se filtra, y que no significan nada para
  // un trabajo terminado hace semanas.
  it('limited quita direccion, PIN, notas y posicion', () => {
    const out = applyTrackingScope(body, 'limited');
    expect(out.address).toBeUndefined();
    expect(out.address_lat).toBeUndefined();
    expect(out.address_lng).toBeUndefined();
    expect(out.arrival_pin).toBeUndefined();
    expect(out.mechanic_notes).toBeUndefined();
    expect(out.mechanic_location).toBeNull();
  });

  // El mismo link se usa para dejar la resena despues del servicio: matarlo al
  // completar romperia el flujo del que salen las resenas de la landing.
  it('pero deja intacto lo que la resena necesita', () => {
    const out = applyTrackingScope(body, 'limited');
    expect(out.id).toBe('bk1');
    expect(out.service_name).toBe('Tune-Up');
    expect(out.scheduled_date).toBe('2026-07-01');
    expect(out).toHaveProperty('client_rating');
    expect(out).toHaveProperty('client_review');
  });

  // `address: null` le dice al cliente que se perdio su direccion. Ausente dice
  // "esto ya no se informa", que es lo que pasa.
  it('las claves se borran, no se mandan en null', () => {
    const out = applyTrackingScope(body, 'limited');
    expect('address' in out).toBe(false);
    expect('arrival_pin' in out).toBe(false);
  });

  it('full no toca nada', () => {
    expect(applyTrackingScope(body, 'full')).toBe(body);
  });

  it('y dice en que alcance esta, para que el cliente pueda mostrarlo', () => {
    expect(applyTrackingScope(body, 'limited').tracking_scope).toBe('limited');
  });
});

describe('no rompe un link por una fila rara', () => {
  // Quitar los datos sensibles es la respuesta segura; romper el link de
  // alguien por una fecha ausente seria peor que el riesgo que evita.
  it('sin fecha degrada a limited, no a expired', () => {
    expect(trackingScope(bk({ scheduled_date: null }), NOW)).toBe('limited');
    expect(trackingScope(bk({ scheduled_date: 'no es una fecha' }), NOW)).toBe('limited');
  });

  it('y no explota con basura', () => {
    expect(trackingScope(null, NOW)).toBe('expired');
    expect(trackingScope(undefined, NOW)).toBe('expired');
    expect(trackingScope('nope', NOW)).toBe('expired');
  });
});

describe('los plazos son una decision, no un accidente', () => {
  it('7 dias de acceso completo', () => {
    expect(FULL_DAYS).toBe(7);
  });

  // 90 da tiempo de sobra para la resena (el pedido sale el mismo dia) y para
  // que el cliente vuelva a mirar su comprobante.
  it('90 dias hasta que el link muere', () => {
    expect(EXPIRY_DAYS).toBe(90);
  });

  it('y el corte completo es anterior al de caducidad', () => {
    expect(FULL_DAYS).toBeLessThan(EXPIRY_DAYS);
  });
});

describe('el endpoint lo aplica', () => {
  const auth = fs.readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
  const fn = auth.slice(auth.indexOf('async function handlePublicTrack'));

  it('corta el link vencido con 410, no con 200 vacio', () => {
    expect(fn.slice(0, 4000)).toMatch(/scope === 'expired'/);
    expect(fn.slice(0, 4000)).toMatch(/status\(410\)/);
  });

  // Un link vencido no tiene por que costar una consulta a mechanic_locations.
  it('y corta ANTES de ir a buscar la posicion del mecanico', () => {
    const cut = fn.indexOf("scope === 'expired'");
    const loc = fn.indexOf('mechanic_locations');
    expect(cut).toBeGreaterThan(-1);
    expect(cut).toBeLessThan(loc);
  });

  it('la respuesta pasa por applyTrackingScope', () => {
    expect(fn).toMatch(/applyTrackingScope\(\{ \.\.\.booking/);
  });

  // El largo del token no se toca: 122 bits de UUID v4 no son el problema.
  it('el token sigue siendo el UUID que ya era', () => {
    const sql = fs.readFileSync(
      new URL('../../scripts/add-tracking-token.sql', import.meta.url),
      'utf8'
    );
    expect(sql).toMatch(/tracking_token UUID DEFAULT gen_random_uuid\(\)/i);
  });
});
