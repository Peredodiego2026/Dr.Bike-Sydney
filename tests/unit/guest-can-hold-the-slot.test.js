// The bug a real customer reported on 2026-09-28, reproduced by Diego on the
// 29th and then confirmed against production: nobody without an account could
// pay. Not by card, not by Apple Pay, not by Google Pay.
//
//   POST /api/auth  role=hold-slot  (no access_token)
//   -> 402 {"error":"Payment required"}
//
// `hold-slot` is the call that RESERVES the hour before the card is touched
// (PR #376, "el turno se reserva antes de cobrar"). It cannot carry a payment
// - that is the entire point of it - but the guest gate in handleCreateBooking
// demanded one anyway. The client threw, the card was never reached, and:
//
//   card   -> "Payment required" in red, above the button they just pressed
//   wallet -> the sheet failed with no message at all (js/stripe.js)
//
// Diego could still pay because he was signed in, which is why it survived
// 29 days (31-aug to 29-sep 2026) and why testing it from his own account
// proved nothing.
//
// These RUN the handler. Twenty-one tests already existed for the hold and
// every one of them reads the source instead of calling it - including one
// asserting the twin exemption on the coverage gate, which WAS remembered.
// Grepping for `!holdOnly` would have passed on the broken code the whole
// time, because the flag was read; it was this other gate that refused first.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';

const SERVICE = { id: 'svc-1', name: 'Hydro Brake Install', price: 65, duration_max: 40 };

let inserted = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      // No token is ever passed in these tests, so this is never consulted;
      // it exists so a stray call cannot blow up as "not a function".
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: (table) => {
      if (table === 'services') {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: SERVICE, error: null }) };
        return q;
      }
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        is: () => q,
        lt: () => q,
        neq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (res) => res({ data: [], error: null }),
        insert: (rows) => {
          inserted.push(Array.isArray(rows) ? rows[0] : rows);
          return { select: () => ({ single: async () => ({ data: { id: 'hold-1' }, error: null }) }) };
        },
        update: () => q,
      };
      return q;
    },
  }),
}));

// Terrey Hills resolves without a network call at all (api/_coverage.js keeps
// the two hand-drawn zones as postcode/suburb matches precisely so an outage
// cannot turn a booking away), but resolveAddressCoverage still ASKS the
// router in parallel. Stubbed so the suite never touches OSRM or Nominatim.
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });

const { handleCreateBooking } = await import('../../api/auth.js');

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

const call = (over = {}) => {
  const res = makeRes();
  return handleCreateBooking(
    {
      body: {
        access_token: null, // a guest: exactly what Will O'Shea was
        client_name: 'Test Client',
        client_email: 'client@example.com',
        client_phone: '0400000000',
        client_lang: 'en',
        service_id: 'svc-1',
        service_name: SERVICE.name,
        scheduled_date: '2026-10-15', // a Thursday - no surcharge
        scheduled_time: '09:00',
        address: '12 Myoora Rd, Terrey Hills NSW 2084',
        ...over,
      },
    },
    res
  ).then(() => res);
};

beforeEach(() => {
  inserted = [];
});

describe('a guest can reserve the hour before paying', () => {
  it('does not answer "Payment required" to a hold', async () => {
    const res = await call({ hold_only: true, hold_booking_id: null });
    expect(res.statusCode, 'the hold was refused for lack of the payment it cannot have yet').not.toBe(402);
    expect(res.body?.error).not.toBe('Payment required');
  });

  it('writes the hold with no payment attached', async () => {
    await call({ hold_only: true, hold_booking_id: null });
    expect(inserted.length, 'no row was written, so no hour was held').toBe(1);
    expect(inserted[0].payment_intent_id ?? null).toBeNull();
  });
});

describe('and the hold is the ONLY thing that gets in without paying', () => {
  // The gate exists for a reason: for a guest there is no account behind the
  // request, so the verified Stripe payment is the only credential. That must
  // stay true for the booking itself.
  it('a real booking with no payment is still refused', async () => {
    const res = await call({ hold_only: false });
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toBe('Payment required');
  });

  it('and hold_only has to be exactly true, not any truthy value', async () => {
    const res = await call({ hold_only: 'yes' });
    expect(res.statusCode).toBe(402);
  });

  it('an email is still required before anything else', async () => {
    const res = await call({ hold_only: true, client_email: 'not-an-email' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });
});

globalThis.fetch = realFetch;
