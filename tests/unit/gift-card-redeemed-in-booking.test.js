// tests/unit/gift-card-redeemed-in-booking.test.js - a gift card used on a
// booking is a sale, not a discount (25-oct-2026). The booking records the part
// that came off the GIFT- code in gift_applied (Finance adds it back into
// revenue), and the card is marked redeemed in the gift_cards ledger - which
// until now only the separate consume-code path did.
//
// The real create-booking handler, hold then pay, against a fake Supabase.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const SERVICE = { id: 'svc-tune', name: 'Tune-Up', price: 119, duration_max: 60 };
let db;
let seq;
let giftColumn = true;
const freshDb = () =>
  new Proxy(
    {
      bookings: [],
      services: [SERVICE],
      van_zones: [{ van_number: 1 }],
      gift_cards: [{ code: 'GIFT-ABCD2345', amount: 50, status: 'active' }],
    },
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
      const row = {
        id: 'bk-' + ++seq,
        tracking_token: 'tok-' + seq,
        ...(Array.isArray(r) ? r[0] : r),
      };
      db[name].push(row);
      inserted = [row];
      return q;
    },
    update: (p) => {
      if (name === 'bookings' && 'gift_applied' in p && !giftColumn) {
        const fail = {
          ...q,
          then: (resolve) =>
            Promise.resolve(
              resolve({
                data: null,
                error: { message: 'column "gift_applied" of relation "bookings" does not exist' },
              })
            ),
        };
        return { eq: () => fail };
      }
      patch = p;
      return q;
    },
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
      // $35 is Terrey Hills' visit fee - what the booking actually charges.
      this.paymentIntents = { retrieve: async (id) => ({ id, status: 'succeeded', amount: 3500 }) };
      this.checkout = { sessions: { retrieve: async () => ({}) } };
      this.refunds = { create: async () => ({ id: 're_1' }) };
    }
  },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: (t) => table(t),
    rpc: async (fn, args) =>
      fn === 'consume_discount_code' && args.p_code === 'GIFT-ABCD2345'
        ? {
            data: [{ id: 'dc1', discount_value: 50, discount_type: 'fixed', remaining: 0 }],
            error: null,
          }
        : { data: null, error: null },
  }),
}));
globalThis.fetch = async () => ({
  ok: false,
  status: 503,
  json: async () => ({}),
  text: async () => '',
});

const { handleCreateBooking } = await import('../../api/auth.js');

const GUEST = {
  access_token: null,
  client_name: 'Test Client',
  client_email: 'client@example.com',
  client_phone: '0400000000',
  client_lang: 'en',
  service_id: 'svc-tune',
  service_name: 'Tune-Up',
  scheduled_date: '2026-11-12', // a Thursday
  scheduled_time: '09:00',
  address: '12 Myoora Rd, Terrey Hills NSW 2084',
};
const call = async (over) => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await handleCreateBooking({ body: { ...GUEST, ...over } }, res);
  return res;
};
const book = async (code) => {
  const hold = await call({ hold_only: true, hold_booking_id: null });
  expect(hold.statusCode, JSON.stringify(hold.body)).toBe(200);
  const r = await call({
    hold_only: false,
    hold_booking_id: hold.body.id,
    payment_intent_id: 'pi_1',
    discount_code: code,
  });
  expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
  return db.bookings[0];
};

beforeEach(() => {
  db = freshDb();
  seq = 0;
  giftColumn = true;
});

describe('a booking paid partly with a gift card', () => {
  it('records the gift card part, so Finance counts it as a sale', async () => {
    const row = await book('GIFT-ABCD2345');
    expect(row.discount_applied).toBe(50);
    expect(row.discount_code).toBe('GIFT-ABCD2345');
    expect(row.gift_applied).toBe(50);
  });

  it('marks the card redeemed in the ledger', async () => {
    await book('GIFT-ABCD2345');
    expect(db.gift_cards[0].status).toBe('redeemed');
    expect(db.gift_cards[0].redeemed_at).toBeTruthy();
  });

  it('before the migration runs, the discount itself is never lost', async () => {
    giftColumn = false;
    const row = await book('GIFT-ABCD2345');
    expect(row.discount_applied).toBe(50);
    expect(row.gift_applied).toBeUndefined();
  });

  it('a booking without a gift card gets no gift_applied', async () => {
    const row = await book(undefined);
    expect(row.gift_applied).toBeUndefined();
  });
});
