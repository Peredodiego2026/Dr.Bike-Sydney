// tests/unit/long-services-end-by-five.test.js - Diego, 25-oct-2026: a service
// of more than an hour cannot be booked to start at 4pm or later (its last
// start is 3pm, so the job ends inside working hours). A Tune-Up (60 min) still
// can. The 4pm hour is shown unavailable WITH a reason, so the client is told
// why; the booking itself is refused on the server too.
//
// Same fake Supabase as guest-books-end-to-end.test.js: the assertions are
// about what the endpoints answer and what lands in the table, not the source.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// duration_max as in the live table on 25-oct-2026
const SERVICES = [
  { id: 'svc-std', name: 'Standard Service', price: 159, duration_max: 90 },
  { id: 'svc-tune', name: 'Tune-Up', price: 119, duration_max: 60 },
  { id: 'svc-ult', name: 'Ultimate Overhaul', price: 379, duration_max: 240 },
];

let db;
let seq;
const freshDb = () =>
  new Proxy(
    { bookings: [], services: SERVICES, van_zones: [{ van_number: 1 }] },
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
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: (t) => table(t),
    rpc: async () => ({ data: null, error: null }),
  }),
}));
globalThis.fetch = async () => ({
  ok: false,
  status: 503,
  json: async () => ({}),
  text: async () => '',
});

const {
  handleCreateBooking,
  handleGetAvailability,
  computeAvailableSlots,
  isLongServiceTooLate,
  LONG_SERVICE_MESSAGE,
} = await import('../../api/auth.js');

const makeRes = () => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
};
const GUEST = {
  access_token: null,
  client_name: 'Test Client',
  client_email: 'client@example.com',
  client_phone: '0400000000',
  client_lang: 'en',
  scheduled_date: '2026-10-29', // a Thursday
  address: '12 Myoora Rd, Terrey Hills NSW 2084',
  hold_only: true,
  hold_booking_id: null,
};
const hold = async (svc, time, extra = {}) => {
  const res = makeRes();
  await handleCreateBooking(
    {
      body: {
        ...GUEST,
        service_id: svc.id,
        service_name: svc.name,
        scheduled_time: time,
        ...extra,
      },
    },
    res
  );
  return res;
};
const availability = async (query) => {
  const res = makeRes();
  await handleGetAvailability(
    {
      method: 'GET',
      headers: { 'x-forwarded-for': `10.0.0.${++seq}` },
      query: { role: 'get-availability', date: GUEST.scheduled_date, ...query },
    },
    res
  );
  return res;
};

beforeEach(() => {
  db = freshDb();
  seq = 0;
  refunds.length = 0;
});

describe('the rule', () => {
  it('more than an hour: 3pm yes, 4pm no', () => {
    expect(isLongServiceTooLate(90, '15:00')).toBe(false);
    expect(isLongServiceTooLate(90, '16:00')).toBe(true);
    expect(isLongServiceTooLate(90, '4:00 PM')).toBe(true);
    expect(isLongServiceTooLate(240, '16:00:00')).toBe(true);
  });
  it('an hour or less can still start at 4pm', () => {
    expect(isLongServiceTooLate(60, '16:00')).toBe(false);
    expect(isLongServiceTooLate(20, '4:00 PM')).toBe(false);
  });
  it('an unknown duration is not treated as long', () => {
    expect(isLongServiceTooLate(null, '16:00')).toBe(false);
  });
  it('the slot list marks 4pm with the reason, and nothing else changes', () => {
    const args = {
      allSlots: ['3:00 PM', '4:00 PM'],
      vans: [1],
      busyIntervals: [],
      neededMin: 120,
      blockIntervals: [],
      isToday: false,
      nowMin: 0,
    };
    expect(computeAvailableSlots({ ...args, longService: true })).toEqual([
      { time: '3:00 PM', available: true },
      { time: '4:00 PM', available: false, reason: 'long-service' },
    ]);
    expect(computeAvailableSlots(args)[1]).toEqual({ time: '4:00 PM', available: true });
  });
});

describe('the availability the client sees', () => {
  it('a long service: 4pm unavailable, with the reason', async () => {
    const r = await availability({ serviceId: 'svc-std' });
    expect(r.statusCode).toBe(200);
    expect(r.body.find((s) => s.time === '4:00 PM')).toEqual({
      time: '4:00 PM',
      available: false,
      reason: 'long-service',
    });
    expect(r.body.find((s) => s.time === '3:00 PM').available).toBe(true);
  });
  it('a Tune-Up: 4pm still on offer', async () => {
    const r = await availability({ serviceId: 'svc-tune' });
    expect(r.body.find((s) => s.time === '4:00 PM').available).toBe(true);
  });
  it('a reschedule, which only knows the service NAME, gets the same answer', async () => {
    const r = await availability({ serviceName: 'Ultimate Overhaul' });
    expect(r.body.find((s) => s.time === '4:00 PM').reason).toBe('long-service');
  });
});

describe('the booking itself', () => {
  it('refuses a long service at 4pm, says why, and writes nothing', async () => {
    const r = await hold(SERVICES[0], '16:00');
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe('long-service-cutoff');
    expect(r.body.error).toBe(LONG_SERVICE_MESSAGE);
    expect(db.bookings.length).toBe(0);
  });
  it('takes the same service at 3pm', async () => {
    const r = await hold(SERVICES[0], '15:00');
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
    expect(db.bookings.length).toBe(1);
  });
  it('takes a Tune-Up at 4pm', async () => {
    const r = await hold(SERVICES[1], '16:00');
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
  });
  it('a paid booking refused for this reason is refunded', async () => {
    const r = await hold(SERVICES[2], '16:00', {
      hold_only: false,
      payment_intent_id: 'pi_test_1',
    });
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toMatch(/refunded/);
    expect(refunds).toEqual([{ payment_intent: 'pi_test_1' }]);
  });
});
