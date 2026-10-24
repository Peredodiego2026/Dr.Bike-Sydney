// Admin > Spare Parts: a part's history (with the job each use belongs to),
// this month's usage in Sydney's month, and notes on restock/adjust that do
// not cost the stock change when the note column is not there yet.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

vi.mock('stripe', () => ({ default: class {} }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (tok) =>
        tok === 'admin'
          ? { data: { user: { id: 'u1', email: 'peredo.dm@gmail.com' } }, error: null }
          : { data: { user: { id: 'u2', email: 'someone@example.com' } }, error: null },
    },
  }),
}));

const P1 = '22222222-2222-2222-2222-222222222222';
const J1 = '55555555-5555-5555-5555-555555555555';

let calls = [];
let movements = [];
let monthMoves = [];
let monthBookings = [];
let bookingCostsTable = true;
let noteColumn = true;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ u, method, body });
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => '' });
  if (u.includes('/auth/v1/user')) return ok({ factors: [] });
  if (u.includes('/rest/v1/stock_movements?select=*')) return ok(movements);
  if (u.includes('/rest/v1/stock_movements?select=delta')) return ok(monthMoves);
  if (u.includes('/rest/v1/bookings?select=id,client_name'))
    return ok([
      { id: J1, client_name: 'Alice', service_name: 'Tune-Up', scheduled_date: '2026-10-20' },
    ]);
  // This month's completed jobs with their cost (bookingsWithCost in api/auth.js):
  // booking_costs embedded, unless the test says the table is not there yet.
  if (u.includes('/rest/v1/bookings?status=eq.completed')) {
    if (u.includes('booking_costs') && !bookingCostsTable)
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
        text: async () => 'no relationship',
      };
    return ok(monthBookings);
  }
  if (u.includes('/rest/v1/rpc/adjust_part_stock')) {
    if (body && 'p_note' in body && !noteColumn)
      return {
        ok: false,
        status: 404,
        json: async () => ({ code: 'PGRST202' }),
        text: async () => 'PGRST202',
      };
    return ok([{ id: P1, name: 'Tube', new_stock: 14, min_stock: 2, applied: body.p_delta }]);
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};

const { handleAdminInventoryHistory, handleAdminInventorySummary, handleAdminInventoryMove } =
  await import('../../api/auth.js');

const run = async (handler, body, extra) => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await handler({ body, headers: {} }, res, extra);
  return res;
};
const rpc = () => calls.filter((c) => c.u.includes('/rpc/adjust_part_stock')).map((c) => c.body);

beforeEach(() => {
  calls = [];
  movements = [];
  monthMoves = [];
  monthBookings = [];
  bookingCostsTable = true;
  noteColumn = true;
});
afterEach(() => vi.useRealTimers());

describe('history (role admin-inventory-history)', () => {
  it('is admin-only', async () => {
    expect(
      (await run(handleAdminInventoryHistory, { access_token: 'client', id: P1 })).statusCode
    ).toBe(403);
  });

  it('lists the movements newest first, each use with its job', async () => {
    movements = [
      {
        created_at: '2026-10-22T03:00:00Z',
        delta: -1,
        reason: 'job_used',
        created_by: 'Will',
        job_id: J1,
      },
      {
        created_at: '2026-10-21T01:00:00Z',
        delta: 10,
        reason: 'restock',
        created_by: 'diego',
        note: 'Duro AU',
        job_id: null,
      },
    ];
    const r = await run(handleAdminInventoryHistory, { access_token: 'admin', id: P1 });
    expect(r.statusCode).toBe(200);
    const q = calls.find((c) => c.u.includes('stock_movements?select=*')).u;
    expect(q).toContain(`part_id=eq.${P1}`);
    expect(q).toContain('order=created_at.desc');
    expect(r.body.movements[0]).toEqual({
      at: '2026-10-22T03:00:00Z',
      delta: -1,
      reason: 'job_used',
      by: 'Will',
      note: null,
      job: { id: J1, client_name: 'Alice', service_name: 'Tune-Up', date: '2026-10-20' },
    });
    expect(r.body.movements[1]).toMatchObject({ reason: 'restock', note: 'Duro AU', job: null });
  });

  it('does not look up bookings when no movement has a job', async () => {
    movements = [
      { created_at: 'x', delta: 5, reason: 'initial', created_by: 'seed', job_id: null },
    ];
    await run(handleAdminInventoryHistory, { access_token: 'admin', id: P1 });
    expect(calls.some((c) => c.u.includes('bookings?select=id,client_name'))).toBe(false);
  });
});

describe("this month's usage (role admin-inventory-summary)", () => {
  it("uses Sydney's month: 31-oct 14:30 UTC is already 1-nov in Sydney", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T14:30:00Z'));
    const r = await run(handleAdminInventorySummary, { access_token: 'admin' });
    expect(r.body.month_start).toBe('2026-11-01');
    // Midnight 1-nov in Sydney (AEDT, +11) is 13:00 UTC on 31-oct.
    const q = calls.find((c) => c.u.includes('stock_movements?select=delta')).u;
    expect(decodeURIComponent(q)).toContain('created_at=gte.2026-10-31T13:00:00.000Z');
  });

  it('and mid-month in winter time (AEST, +10)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T02:00:00Z'));
    const r = await run(handleAdminInventorySummary, { access_token: 'admin' });
    expect(r.body.month_start).toBe('2026-07-01');
    const q = calls.find((c) => c.u.includes('bookings?status=eq.completed')).u;
    expect(decodeURIComponent(q)).toContain('completed_at=gte.2026-06-30T14:00:00.000Z');
  });

  it('units are used minus returned; cost is the per-job snapshot of completed jobs', async () => {
    monthMoves = [{ delta: -2 }, { delta: -1 }, { delta: 1 }]; // 3 used, 1 returned
    monthBookings = [
      { parts_cost_actual: 4 },
      { parts_cost_actual: 2.5 },
      { parts_cost_actual: null },
      { parts_cost_actual: 0 },
    ];
    const r = await run(handleAdminInventorySummary, { access_token: 'admin' });
    expect(r.body).toMatchObject({ units_used: 2, cost_used: 6.5, jobs_with_parts: 2 });
    const q = calls.find((c) => c.u.includes('bookings?status=eq.completed')).u;
    expect(q).toContain('status=eq.completed');
    expect(calls.find((c) => c.u.includes('stock_movements?select=delta')).u).toContain(
      'reason=in.(job_used,job_reverted)'
    );
  });

  it('reads the cost from booking_costs, where the client cannot see it', async () => {
    monthBookings = [
      { parts_cost_actual: null, booking_costs: { parts_cost: 4 } },
      { parts_cost_actual: null, booking_costs: [{ parts_cost: 2 }] }, // older PostgREST shape
      { parts_cost_actual: 3, booking_costs: null }, // finished before the move
      { parts_cost_actual: null, booking_costs: null }, // no parts recorded
    ];
    const r = await run(handleAdminInventorySummary, { access_token: 'admin' });
    expect(r.body).toMatchObject({ cost_used: 9, jobs_with_parts: 3 });
    expect(calls.find((c) => c.u.includes('bookings?status=eq.completed')).u).toContain(
      'booking_costs(parts_cost)'
    );
  });

  it('before the migration runs, falls back to the old column alone', async () => {
    bookingCostsTable = false;
    monthBookings = [{ parts_cost_actual: 4 }, { parts_cost_actual: 1.5 }];
    const r = await run(handleAdminInventorySummary, { access_token: 'admin' });
    expect(r.statusCode).toBe(200);
    expect(r.body.cost_used).toBe(5.5);
    const tried = calls.filter((c) => c.u.includes('bookings?status=eq.completed')).map((c) => c.u);
    expect(tried).toHaveLength(2);
    expect(tried[1]).not.toContain('booking_costs');
  });

  it('is admin-only', async () => {
    expect((await run(handleAdminInventorySummary, { access_token: 'client' })).statusCode).toBe(
      403
    );
  });
});

describe('restock / adjust with a note', () => {
  it('passes the note, trimmed', async () => {
    const r = await run(
      handleAdminInventoryMove,
      { access_token: 'admin', id: P1, qty: 10, note: '  Duro AU invoice 99 ' },
      'restock'
    );
    expect(r.statusCode).toBe(200);
    expect(rpc()[0]).toMatchObject({
      p_delta: 10,
      p_reason: 'restock',
      p_note: 'Duro AU invoice 99',
    });
    expect(r.body.note_kept).toBe(true);
  });

  it('no note, no p_note at all (the quick +/- buttons)', async () => {
    await run(handleAdminInventoryMove, { access_token: 'admin', id: P1, delta: -1 }, 'adjustment');
    expect('p_note' in rpc()[0]).toBe(false);
  });

  it('before the note column exists: the stock still moves, and it says the note was not kept', async () => {
    noteColumn = false;
    const r = await run(
      handleAdminInventoryMove,
      { access_token: 'admin', id: P1, delta: -2, note: 'damaged' },
      'adjustment'
    );
    expect(r.statusCode).toBe(200);
    expect(rpc()).toHaveLength(2);
    expect('p_note' in rpc()[1]).toBe(false);
    expect(rpc()[1]).toMatchObject({ p_delta: -2, p_reason: 'adjustment' });
    expect(r.body.note_kept).toBe(false);
  });

  it('refuses an absurd amount', async () => {
    expect(
      (
        await run(
          handleAdminInventoryMove,
          { access_token: 'admin', id: P1, qty: 50000 },
          'restock'
        )
      ).statusCode
    ).toBe(400);
    expect(rpc()).toEqual([]);
  });
});
