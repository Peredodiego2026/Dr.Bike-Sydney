// tests/unit/hidden-services.test.js - Diego, 25-oct-2026: a service switched
// off in Admin (`active` false) must disappear for everyone without being
// deleted, and come back when it is switched on again. The booking wizard, the
// price cards and the chatbot stop listing it; these are the server-side rules
// behind that, for a page that was already open when it was hidden:
//   - it cannot be priced, enquired about or booked;
//   - a card charged in the minute between the hold and the booking is refunded;
//   - visible again = bookable again, nothing to re-create;
//   - Admin's save only touches `active` when the form sent it.
//
// Same fake Supabase as long-services-end-by-five.test.js: the assertions are
// about what the endpoints answer and what lands in the table.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const services = () => [
  { id: 'svc-tune', name: 'Tune-Up', price: 119, duration_max: 60, active: true },
  { id: 'svc-wash', name: 'Bike Wash', price: 50, duration_max: 45, active: false },
  // The column predates the switch: NULL has always meant "on offer".
  { id: 'svc-old', name: 'Chain Install', price: 79, duration_max: 20, active: null },
];

let db;
let seq;
const freshDb = () =>
  new Proxy(
    { bookings: [], services: services(), van_zones: [{ van_number: 1 }] },
    { get: (t, k) => (typeof k === 'string' && !(k in t) ? (t[k] = []) : t[k]) }
  );
const matches = (row, filters) =>
  filters.every((f) => {
    if (f.op === 'eq') return row[f.col] === f.val;
    if (f.op === 'neq') return row[f.col] !== f.val;
    if (f.op === 'is') return (row[f.col] ?? null) === f.val;
    if (f.op === 'in') return f.val.includes(row[f.col]);
    return true;
  });
function table(name) {
  const filters = [];
  let inserted = null;
  let patch = null;
  const rows = () => {
    if (patch) {
      const hit = db[name].filter((r) => matches(r, filters));
      for (const r of hit) Object.assign(r, patch);
      return hit;
    }
    if (inserted) return inserted;
    return db[name].filter((r) => matches(r, filters));
  };
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    gte: () => q,
    lte: () => q,
    eq: (c, v) => (filters.push({ op: 'eq', col: c, val: v }), q),
    neq: (c, v) => (filters.push({ op: 'neq', col: c, val: v }), q),
    is: (c, v) => (filters.push({ op: 'is', col: c, val: v }), q),
    in: (c, v) => (filters.push({ op: 'in', col: c, val: v }), q),
    insert: (r) => {
      const row = { id: 'row-' + ++seq, tracking_token: 'tok-' + seq, ...(Array.isArray(r) ? r[0] : r) };
      db[name].push(row);
      inserted = [row];
      return q;
    },
    update: (p) => ((patch = p), q),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => {
      const r = rows()[0] ?? null;
      return { data: r, error: r ? null : { message: 'no rows' } };
    },
    then: (resolve) => Promise.resolve(resolve({ data: rows(), error: null })),
  };
  return q;
}

const refunds = [];
vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.paymentIntents = { retrieve: async (id) => ({ id, status: 'succeeded', amount: 3500 }) };
      this.refunds = { create: async (r) => (refunds.push(r), { id: 're_1' }) };
    }
  },
}));
// A token decides who is calling: 'client' is a signed-in client, 'admin' the
// one admin address, anything else nobody.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (t) => {
        if (t === 'client') return { data: { user: { id: 'u-1', email: 'c@example.com' } }, error: null };
        if (t === 'admin') return { data: { user: { id: 'u-a', email: 'peredo.dm@gmail.com' } }, error: null };
        return { data: { user: null }, error: null };
      },
    },
    from: (t) => table(t),
    rpc: async () => ({ data: null, error: null }),
  }),
}));
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' });

const {
  handleCreateBooking,
  handleRequestQuote,
  handleGetPrice,
  handleAdminServicesSave,
  SERVICE_HIDDEN_MESSAGE,
} = await import('../../api/auth.js');

const makeRes = () => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
};
const call = async (handler, body) => {
  const res = makeRes();
  await handler({ method: 'POST', headers: {}, body }, res);
  return res;
};
const BOOKING = {
  access_token: null,
  client_name: 'Test Client',
  client_email: 'client@example.com',
  client_phone: '0400000000',
  client_lang: 'en',
  scheduled_date: '2026-10-29', // a Thursday
  scheduled_time: '10:00',
  address: '12 Myoora Rd, Terrey Hills NSW 2084',
  hold_only: true,
  hold_booking_id: null,
};
const svc = (id) => db.services.find((s) => s.id === id);

beforeEach(() => {
  db = freshDb();
  seq = 0;
  refunds.length = 0;
});

describe('a hidden service cannot be booked', () => {
  it('the hold is refused before any card is touched, and nothing is written', async () => {
    const r = await call(handleCreateBooking, { ...BOOKING, service_id: 'svc-wash', service_name: 'Bike Wash' });
    expect(r.statusCode).toBe(409);
    expect(r.body).toEqual({ error: SERVICE_HIDDEN_MESSAGE, code: 'service-hidden' });
    expect(db.bookings).toHaveLength(0);
    expect(refunds).toEqual([]);
  });

  it('by name too - a page that only sends the name gets the same answer', async () => {
    const r = await call(handleCreateBooking, { ...BOOKING, service_id: null, service_name: 'Bike Wash' });
    expect(r.body.code).toBe('service-hidden');
  });

  it('a card charged after the hold is refunded and told so', async () => {
    const r = await call(handleCreateBooking, {
      ...BOOKING,
      service_id: 'svc-wash',
      service_name: 'Bike Wash',
      hold_only: false,
      payment_intent_id: 'pi_test_1',
    });
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toMatch(/refunded/);
    expect(refunds).toEqual([{ payment_intent: 'pi_test_1' }]);
    expect(db.bookings).toHaveLength(0);
  });

  it('a visible service still holds - and so does one whose column is NULL', async () => {
    const tune = await call(handleCreateBooking, { ...BOOKING, service_id: 'svc-tune', service_name: 'Tune-Up' });
    expect(tune.statusCode, JSON.stringify(tune.body)).toBe(200);
    const old = await call(handleCreateBooking, { ...BOOKING, service_id: 'svc-old', service_name: 'Chain Install' });
    expect(old.statusCode, JSON.stringify(old.body)).toBe(200);
  });

  it('switched back on, it books again with nothing re-created', async () => {
    svc('svc-wash').active = true;
    const r = await call(handleCreateBooking, { ...BOOKING, service_id: 'svc-wash', service_name: 'Bike Wash' });
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
    expect(db.bookings[0].service_name).toBe('Bike Wash');
  });
});

describe('a hidden service cannot be priced or enquired about', () => {
  it('get-price answers 409, not a price', async () => {
    const r = await call(handleGetPrice, {
      access_token: 'client',
      service_id: 'svc-wash',
      scheduled_date: BOOKING.scheduled_date,
      address: BOOKING.address,
    });
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe('service-hidden');
  });

  it('get-price still answers for a visible one', async () => {
    const r = await call(handleGetPrice, {
      access_token: 'client',
      service_id: 'svc-tune',
      scheduled_date: BOOKING.scheduled_date,
      address: BOOKING.address,
    });
    expect(r.body?.code).not.toBe('service-hidden');
  });

  it('an enquiry for it is refused and writes nothing', async () => {
    const r = await call(handleRequestQuote, {
      ...BOOKING,
      service_id: 'svc-wash',
      service_name: 'Bike Wash',
    });
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe('service-hidden');
    expect(db.bookings).toHaveLength(0);
  });
});

describe("Admin's save", () => {
  const base = { access_token: 'admin', name: 'Bike Wash', category: 'Scheduled services', price: 50 };

  it('hides and shows it again', async () => {
    let r = await call(handleAdminServicesSave, { ...base, id: 'svc-tune', name: 'Tune-Up', price: 119, active: false });
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
    expect(svc('svc-tune').active).toBe(false);
    r = await call(handleAdminServicesSave, { ...base, id: 'svc-tune', name: 'Tune-Up', price: 119, active: true });
    expect(svc('svc-tune').active).toBe(true);
  });

  it('a save that does not send `active` leaves it alone (an admin.js still cached)', async () => {
    await call(handleAdminServicesSave, { ...base, id: 'svc-wash', price: 55 });
    expect(svc('svc-wash').price).toBe(55);
    expect(svc('svc-wash').active).toBe(false);
  });

  it('a new service starts visible', async () => {
    await call(handleAdminServicesSave, { ...base, name: 'Wheel Build', price: 249 });
    expect(db.services.find((s) => s.name === 'Wheel Build').active).toBe(true);
  });

  it('nobody but the admin can flip it', async () => {
    const r = await call(handleAdminServicesSave, { ...base, access_token: 'client', id: 'svc-tune', active: false });
    expect(r.statusCode).toBe(403);
    expect(svc('svc-tune').active).toBe(true);
  });
});
