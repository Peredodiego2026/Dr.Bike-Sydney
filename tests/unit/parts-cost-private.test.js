// tests/unit/parts-cost-private.test.js - Diego, 25-oct-2026: "el cliente
// nunca debe saber cuanto me costo". A job's parts cost used to live on the
// bookings row, and a client can read their own bookings row (policy
// bookings_select_own) - so the cost reached their browser even though no
// screen showed it. It now goes to booking_costs, which only the admin can
// read (scripts/add-booking-costs-private.sql).
//
// Driven through the real completion handler with a fake Supabase: the
// assertions are about what was written where.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

vi.mock('stripe', () => ({ default: class {} }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }),
}));

const P1 = '22222222-2222-2222-2222-222222222222';
const MID = '44444444-4444-4444-4444-444444444444';
const B1 = '66666666-6666-6666-6666-666666666666';

let calls = [];
let costsTable = true;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ u, method, body });
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => '' });
  if (u.includes('/rest/v1/escalation_contacts'))
    return ok([{ id: MID, name: 'Will', session_version: 0 }]);
  if (u.includes('/rest/v1/bookings?select=status,final_charge_status'))
    return ok([{ status: 'confirmed', service_price: 119, discount_applied: 0 }]);
  if (u.includes('/rest/v1/parts_inventory?select=id,sell_price'))
    return ok([{ id: P1, sell_price: 15 }]);
  if (u.includes('/rest/v1/parts_inventory?select=id,cost_price'))
    return ok([{ id: P1, cost_price: 2 }]);
  if (u.includes('/rest/v1/rpc/adjust_part_stock'))
    return ok([{ id: P1, name: 'Tube', new_stock: 3, min_stock: 2, applied: body.p_delta }]);
  if (u.includes('/rest/v1/booking_costs'))
    return costsTable
      ? ok([])
      : {
          ok: false,
          status: 404,
          json: async () => ({ code: '42P01' }),
          text: async () => 'relation does not exist',
        };
  return ok([]);
};

const { handleMechanicComplete, jobPartsCost } = await import('../../api/auth.js');
const src = readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
const makeToken = new Function(
  'crypto',
  `${src.match(/const TOKEN_TTL_MS = [^;]+;/)[0]}
   ${src.match(/function b64url\(buf\) \{[\s\S]*?\n\}/)[0]}
   ${src.match(/function makeToken\(mid, sv = 0\) \{[\s\S]*?\n\}/)[0]}
   return makeToken;`
)(crypto);

const complete = async () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await handleMechanicComplete(
    {
      headers: {},
      body: {
        token: makeToken(MID, 0),
        booking_id: B1,
        parts_used: [{ id: P1, name: 'Tube', qty: 2 }],
        parts_charged: { items: [{ id: P1, name: 'Tube', qty: 2, unit_price: 15, total: 30 }] },
        final_charge_amount: 149,
        tip_amount: 0,
        final_charge_status: 'charged_manual',
        skip_auto_charge: true,
      },
    },
    res
  );
  return res;
};
const bookingPatches = () =>
  calls
    .filter((c) => c.method === 'PATCH' && c.u.includes(`/rest/v1/bookings?id=eq.${B1}`))
    .map((c) => c.body);
const costWrites = () =>
  calls.filter((c) => c.method === 'POST' && c.u.includes('/rest/v1/booking_costs'));

beforeEach(() => {
  calls = [];
  costsTable = true;
});

describe('completing a job with parts', () => {
  it('writes the cost to booking_costs and NOT to the bookings row the client can read', async () => {
    const r = await complete();
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
    expect(costWrites()).toHaveLength(1);
    expect(costWrites()[0].body).toMatchObject({ booking_id: B1, parts_cost: 4 }); // 2 tubes x $2
    const patch = bookingPatches()[0];
    expect(patch.status).toBe('completed');
    expect(patch.parts_cost_actual).toBeNull();
  });

  it('a replayed completion updates the same row instead of adding one', async () => {
    await complete();
    expect(costWrites()[0].u).toContain('on_conflict=booking_id');
    expect(calls.find((c) => c.u.includes('/rest/v1/booking_costs')).method).toBe('POST');
  });

  it('before the migration runs, the cost stays on the booking - nothing is lost', async () => {
    costsTable = false;
    const r = await complete();
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
    expect(bookingPatches()[0].parts_cost_actual).toBe(4);
  });
});

describe('reading it back (admin only)', () => {
  it('booking_costs first, the old column for older jobs, null when unknown', () => {
    expect(jobPartsCost({ booking_costs: { parts_cost: 4 }, parts_cost_actual: null })).toBe(4);
    expect(jobPartsCost({ booking_costs: [{ parts_cost: '2.50' }] })).toBe(2.5);
    expect(jobPartsCost({ booking_costs: null, parts_cost_actual: 3 })).toBe(3);
    expect(jobPartsCost({ booking_costs: null, parts_cost_actual: null })).toBeNull();
    expect(jobPartsCost({ parts_cost_actual: 0 })).toBe(0);
  });
});
