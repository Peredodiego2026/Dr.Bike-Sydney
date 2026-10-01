// The guest path, walked the way js/app.js walks it: hold the hour, pay, then
// turn the hold into the booking. Two calls into the same handler, with state
// carried between them.
//
// Written because the path had been dead for 29 days (PR #376, 31-aug to
// 29-sep-2026) and a single-gate fix proves only that the FIRST wall is gone.
// If there had been a second one, a real customer would have found it - which
// is how this bug was found in the first place, by a man with a flat tyre on a
// cargo e-bike who could not pay by card or by Google Pay.
//
// Nothing here asserts on the source text. The fake Supabase holds rows, so
// the assertions are about what ended up in the table.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const SERVICE = { id: 'svc-1', name: 'Hydro Brake Install', price: 65, duration_max: 40 };

// Any table the handler asks for that nobody seeded answers "no rows" rather
// than undefined - callout_zones, van_zones and availability are all read on
// this path and none of them need to hold anything for it to work.
let db;
let seq;
const freshDb = () =>
  new Proxy(
    { bookings: [], services: [SERVICE] },
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
    eq: (c, v) => (filters.push({ op: 'eq', col: c, val: v }), q),
    neq: (c, v) => (filters.push({ op: 'neq', col: c, val: v }), q),
    is: (c, v) => (filters.push({ op: 'is', col: c, val: v }), q),
    in: (c, v) => (filters.push({ op: 'in', col: c, val: v }), q),
    insert: (r) => {
      const row = { id: 'bk-' + ++seq, tracking_token: 'tok-' + seq, ...(Array.isArray(r) ? r[0] : r) };
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

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      // $25 is Terrey Hills' band fee, which is what the address below
      // resolves to with no network at all (api/_coverage.js). A different
      // number here would be refunded as an amount mismatch, correctly.
      this.paymentIntents = { retrieve: async (id) => ({ id, status: 'succeeded', amount: 2500 }) };
      this.checkout = { sessions: { retrieve: async () => ({}) } };
      this.refunds = { create: async () => ({ id: 're_1' }) };
    }
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: (t) => table(t),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

// Terrey Hills is one of the two hand-drawn zones, matched on the postcode
// alone precisely so an outage cannot turn a booking away - but
// resolveAddressCoverage still ASKS the router in parallel. Stubbed so the
// suite never reaches OSRM or Nominatim.
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' });

const { handleCreateBooking } = await import('../../api/auth.js');

const makeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

const GUEST = {
  access_token: null, // no account: exactly the case that was broken
  client_name: 'Test Client',
  client_email: 'client@example.com',
  client_phone: '0400000000',
  client_lang: 'en',
  service_id: 'svc-1',
  service_name: SERVICE.name,
  scheduled_date: '2026-10-15', // a Thursday - no Sunday surcharge
  scheduled_time: '09:00',
  address: '12 Myoora Rd, Terrey Hills NSW 2084',
};

const call = (over) => {
  const res = makeRes();
  return handleCreateBooking({ body: { ...GUEST, ...over } }, res).then(() => res);
};

beforeEach(() => {
  db = freshDb();
  seq = 0;
});

describe('a guest gets all the way through', () => {
  it('holds the hour, pays, and ends up with one booking', async () => {
    const hold = await call({ hold_only: true, hold_booking_id: null });
    expect(hold.statusCode, `the hold was refused: ${JSON.stringify(hold.body)}`).toBe(200);
    expect(hold.body.id).toBeTruthy();

    const booking = await call({
      hold_only: false,
      hold_booking_id: hold.body.id,
      payment_intent_id: 'pi_test_123',
    });
    expect(booking.statusCode, `the booking was refused: ${JSON.stringify(booking.body)}`).toBe(200);

    // One row, not two: the second call UPDATES the hold. A booking beside it
    // would mean the held hour was never released and the calendar shows the
    // slot twice.
    expect(db.bookings.length, 'the hold and the booking are separate rows').toBe(1);
    const row = db.bookings[0];
    expect(row.id).toBe(hold.body.id);
    expect(row.stripe_payment_intent_id).toBe('pi_test_123');
    expect(row.client_email).toBe(GUEST.client_email);
    expect(row.client_phone).toBe(GUEST.client_phone);
    // A guest has no account, and must not be able to attach someone else's.
    expect(row.user_id ?? null).toBeNull();
  });

  it('and the hold itself carries no payment while it waits', async () => {
    const hold = await call({ hold_only: true, hold_booking_id: null });
    expect(hold.statusCode).toBe(200);
    expect(db.bookings[0].stripe_payment_intent_id ?? null).toBeNull();
    expect(db.bookings[0].status).toBe('pending');
  });
});
