// "Fully booked until ___".
//
// The calendar offered every hour of every day, so a client in Curl Curl could
// pay for tomorrow while the van is a thousand kilometres away. On 29-sep-2026
// one nearly did: she reached the last step for the next morning, and the only
// reason it did not happen is that her address was out of the service area.
// Diego, that afternoon: "acabamos de tener ahora un nuevo booking pero yo no
// estoy en la ciudad aun".
//
// These RUN handleCreateBooking. A test that greps for the gate would pass on
// a gate placed after the Stripe charge, which is the version that takes the
// money first and apologises second.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const SERVICE = { id: 'svc-1', name: 'Tune-Up', price: 109, duration_max: 60 };

// What the sentinel row holds. null = the setting has never been set.
let setting = null;
let rows = [];

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.paymentIntents = { retrieve: async (id) => ({ id, status: 'succeeded', amount: 2500 }) };
      this.checkout = { sessions: { retrieve: async () => ({}) } };
      this.refunds = { create: async () => ({ id: 're_1' }) };
    }
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: (t) => {
      const q = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        is: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: t === 'services' ? SERVICE : null, error: null }),
        single: async () => ({ data: { id: 'bk-1' }, error: null }),
        then: (r) => r({ data: [], error: null }),
        insert: (x) => {
          rows.push(Array.isArray(x) ? x[0] : x);
          return { select: () => ({ single: async () => ({ data: { id: 'bk-1' }, error: null }) }) };
        },
        update: () => q,
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

// closedUntil() reads PostgREST directly rather than through the client, so
// this is where the setting comes from. Everything else fails, which is also
// what keeps the suite off OSRM and Nominatim.
globalThis.fetch = async (url) => {
  if (String(url).includes('__setting_closed_until__')) {
    return { ok: true, json: async () => (setting ? [{ postcode: setting }] : []) };
  }
  return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
};

const { handleCreateBooking } = await import('../../api/auth.js');

const makeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

// Far enough out that no other gate has an opinion about it.
const call = (over = {}) => {
  const res = makeRes();
  return handleCreateBooking(
    {
      body: {
        access_token: null,
        client_name: 'Test Client',
        client_email: 'client@example.com',
        client_phone: '0400000000',
        client_lang: 'en',
        service_id: 'svc-1',
        service_name: SERVICE.name,
        scheduled_date: '2026-10-15',
        scheduled_time: '09:00',
        address: '12 Myoora Rd, Terrey Hills NSW 2084',
        hold_only: true,
        ...over,
      },
    },
    res
  ).then(() => res);
};

beforeEach(() => {
  setting = null;
  rows = [];
});

describe('a date Diego cannot serve never reaches a card', () => {
  it('refuses a booking before the return date, and says when', async () => {
    setting = '2026-11-03';
    const res = await call({ scheduled_date: '2026-10-15' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('2026-11-03');
  });

  it('and nothing is written when it refuses', async () => {
    setting = '2026-11-03';
    await call({ scheduled_date: '2026-10-15' });
    expect(rows.length, 'a row was written for a date that was refused').toBe(0);
  });

  it('lets the return date itself through', async () => {
    setting = '2026-11-03';
    const res = await call({ scheduled_date: '2026-11-03' });
    expect(res.statusCode, JSON.stringify(res.body)).not.toBe(409);
  });

  it('and every date after it', async () => {
    setting = '2026-11-03';
    const res = await call({ scheduled_date: '2026-12-01' });
    expect(res.statusCode, JSON.stringify(res.body)).not.toBe(409);
  });

  it('changes nothing when the setting was never set', async () => {
    setting = null;
    const res = await call({ scheduled_date: '2026-10-15' });
    expect(res.statusCode).not.toBe(409);
  });

  // A shop that stays shut forever because nobody cleared the field is worse
  // than no setting at all, and it would fail silently.
  it('ignores a date that has already gone by', async () => {
    setting = '2020-01-01';
    const res = await call({ scheduled_date: '2026-10-15' });
    expect(res.statusCode).not.toBe(409);
  });

  it('ignores a value that is not a date', async () => {
    setting = 'yes';
    const res = await call({ scheduled_date: '2026-10-15' });
    expect(res.statusCode).not.toBe(409);
  });
});
