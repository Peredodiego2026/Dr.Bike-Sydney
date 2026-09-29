// Diego, 30-sep-2026, mirando Stripe: "yo no hice nada pero aparece como
// refunded". Iniciado, autorizado y reembolsado, los tres a las 10:02.
//
// El registro de produccion lo dijo con el mismo numero de pago:
//
//   [webhook] amount mismatch for pi_3UKoVPPPGSm5cT7J1vttUHp5:
//   charged $45, authoritative price $20 - refunding instead of creating a booking
//
// El navegador ya habia creado la reserva un segundo antes. Quedo una visita
// agendada con la plata devuelta.
//
// LA CAUSA: este webhook calculaba la visita mirando SOLO `callout_zones`, con
// $20 de respaldo si el suburbio no tenia fila. El resto de la app cobra por
// TIEMPO DE MANEJO desde la base (api/_coverage.js). Los suburbios sin fila -
// North Sydney, Balmain, Potts Point, Maroubra - se cobran $45 y aca se
// recalculaban $20. CLAUDE.md ya documentaba esta trampa para
// handleCreateBooking; el arreglo nunca llego hasta este archivo.
//
// Estos CORREN handlePaymentIntentSucceeded. Un test que lea el codigo no
// distingue un reembolso que ocurre de uno que no.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_unit_tests';
process.env.SUPABASE_SERVICE_KEY = 'service_dummy_for_unit_tests';

const refunds = vi.fn(async () => ({ id: 're_test' }));
const inserted = [];
// Lo que responde el resolutor de cobertura en cada caso.
let coverageAnswer = { coverage: { covered: 'in', calloutFee: 45 }, fee: 45 };

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.refunds = { create: refunds };
      this.webhooks = { constructEvent: () => ({}) };
    }
  },
}));

vi.mock('../../api/auth.js', () => ({
  calloutFeeForAddress: async () => coverageAnswer,
  applySurcharge: (n) => n,
  applyMembershipPricing: async (_sb, _id, _date, _svc, calloutFee) => ({ calloutFee }),
}));

vi.mock('@supabase/supabase-js', () => {
  const build = (rows) => {
    const q = {
      select: () => q,
      eq: () => q,
      ilike: () => q,
      neq: () => q,
      limit: () => q,
      single: async () => ({ data: rows[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return q;
  };
  return {
    createClient: () => ({
      from: (table) => {
        if (table === 'services') return build([{ id: 'svc-1', name: 'Tune-Up', price: 109 }]);
        if (table === 'bookings') {
          const q = build([]); // ninguna reserva existe todavia: el webhook gana la carrera
          q.insert = (rows) => {
            inserted.push(Array.isArray(rows) ? rows[0] : rows);
            return { select: () => ({ single: async () => ({ data: { id: 'bk-1' }, error: null }) }) };
          };
          return q;
        }
        return build([]);
      },
    }),
  };
});

globalThis.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });

const { handlePaymentIntentSucceeded } = await import('../../api/stripe-webhook.js');

const intent = (amountDollars) => ({
  id: 'pi_test_123',
  amount_received: amountDollars * 100,
  receipt_email: 'client@example.com',
  metadata: {
    bk_service_id: 'svc-1',
    bk_service_name: 'Tune-Up',
    bk_date: '2026-10-15',
    bk_time: '09:00',
    bk_address: '12 Test St, North Sydney NSW 2060',
    bk_name: 'Test Client',
    bk_phone: '0400000000',
    bk_guest: '1',
    email: 'client@example.com',
  },
});

beforeEach(() => {
  refunds.mockClear();
  inserted.length = 0;
  coverageAnswer = { coverage: { covered: 'in', calloutFee: 45 }, fee: 45 };
});

describe('un suburbio sin fila en callout_zones ya no pierde la plata', () => {
  it('no devuelve un pago que coincide con el tiempo de manejo', async () => {
    const out = await handlePaymentIntentSucceeded(intent(45));
    expect(refunds, 'se devolvio un pago correcto').not.toHaveBeenCalled();
    expect(out.rejected, JSON.stringify(out)).toBeUndefined();
    expect(inserted.length).toBe(1);
  });

  it('y el importe que guarda es el resuelto, no el de la tabla de zonas', async () => {
    await handlePaymentIntentSucceeded(intent(45));
    expect(inserted[0].callout_fee).toBe(45);
  });
});

describe('lo que si se sigue rechazando', () => {
  it('un importe que no coincide con la cifra resuelta', async () => {
    const out = await handlePaymentIntentSucceeded(intent(5));
    expect(refunds).toHaveBeenCalledTimes(1);
    expect(out.rejected).toBe('amount mismatch');
    expect(inserted.length).toBe(0);
  });

  it('una direccion fuera del perimetro', async () => {
    coverageAnswer = { coverage: { covered: 'out', calloutFee: null }, fee: null };
    const out = await handlePaymentIntentSucceeded(intent(45));
    expect(refunds).toHaveBeenCalledTimes(1);
    expect(out.rejected).toBe('out of area');
    expect(inserted.length).toBe(0);
  });
});

// Un geocodificador caido no puede costarle la reserva a quien ya pago: es la
// misma regla que ya sigue handleCreateBooking.
describe('cuando la direccion no se puede resolver', () => {
  beforeEach(() => {
    coverageAnswer = { coverage: { covered: 'unknown', calloutFee: null }, fee: null };
  });

  it('acepta lo cobrado si es una banda real', async () => {
    const out = await handlePaymentIntentSucceeded(intent(45));
    expect(refunds, 'se devolvio un pago de una banda valida').not.toHaveBeenCalled();
    expect(out.rejected).toBeUndefined();
    expect(inserted[0].callout_fee).toBe(45);
  });

  it('pero no un importe inventado', async () => {
    const out = await handlePaymentIntentSucceeded(intent(0.5));
    expect(refunds).toHaveBeenCalledTimes(1);
    expect(out.rejected).toBe('unresolved address');
    expect(inserted.length).toBe(0);
  });
});
