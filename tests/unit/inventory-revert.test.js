// Cancelling a completed job must give its parts back - exactly what is still
// out, from the ledger (not the free-text parts_used), once - whether the
// mechanic or the admin cancels it. Runs the real code against a fake Supabase.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

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
          : tok === 'client'
            ? { data: { user: { id: 'u2', email: 'someone@example.com' } }, error: null }
            : { data: { user: null }, error: { message: 'bad' } },
    },
  }),
}));

const B1 = '11111111-1111-1111-1111-111111111111';
const P1 = '22222222-2222-2222-2222-222222222222';
const P2 = '33333333-3333-3333-3333-333333333333';

let ledger = [];
let rpcCalls = [];
let patches = [];
let ledgerFails = false;
let bookingIsCancellable = true;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || 'GET';
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
  if (u.includes('/auth/v1/user')) return ok({ factors: [] });
  if (u.includes('/rest/v1/stock_movements') && method === 'GET') {
    if (ledgerFails)
      return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
    return ok(ledger);
  }
  if (u.includes('/rest/v1/rpc/adjust_part_stock')) {
    rpcCalls.push(JSON.parse(init.body));
    return ok([{ id: JSON.parse(init.body).p_part_id, new_stock: 9, min_stock: 2, applied: 1 }]);
  }
  if (u.includes('/rest/v1/bookings') && method === 'PATCH') {
    patches.push({ u, body: JSON.parse(init.body) });
    return ok(bookingIsCancellable ? [{ id: B1, status: 'cancelled', google_event_id: 'g1' }] : []);
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};

const { revertJobStock, handleAdminCancelBooking } = await import('../../api/auth.js');

const run = async (handler, body) => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await handler({ body, headers: {} }, res);
  return res;
};

beforeEach(() => {
  ledger = [];
  rpcCalls = [];
  patches = [];
  ledgerFails = false;
  bookingIsCancellable = true;
});

describe('revertJobStock', () => {
  it('returns exactly what the job used, as job_reverted (positive inverse)', async () => {
    ledger = [
      { part_id: P1, delta: -2, reason: 'job_used' },
      { part_id: P2, delta: -1, reason: 'job_used' },
    ];
    const back = await revertJobStock(B1, 'test-service-key', 'tester');
    expect(rpcCalls).toHaveLength(2);
    const byPart = Object.fromEntries(rpcCalls.map((c) => [c.p_part_id, c]));
    expect(byPart[P1]).toMatchObject({ p_delta: 2, p_reason: 'job_reverted', p_job_id: B1 });
    expect(byPart[P2]).toMatchObject({ p_delta: 1, p_reason: 'job_reverted', p_job_id: B1 });
    expect(back).toEqual({ [P1]: 2, [P2]: 1 });
  });

  it('sums multiple job_used lines for the same part', async () => {
    ledger = [
      { part_id: P1, delta: -2, reason: 'job_used' },
      { part_id: P1, delta: -3, reason: 'job_used' },
    ];
    await revertJobStock(B1, 'test-service-key');
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ p_part_id: P1, p_delta: 5, p_reason: 'job_reverted' });
  });

  it('is idempotent: a job already given back gives nothing more', async () => {
    ledger = [
      { part_id: P1, delta: -2, reason: 'job_used' },
      { part_id: P1, delta: 2, reason: 'job_reverted' },
    ];
    await revertJobStock(B1, 'test-service-key');
    expect(rpcCalls).toEqual([]);
  });

  it('cancelled, reopened, completed again, cancelled again: returns the second use too', async () => {
    // A first version stopped at "a job_reverted row exists" and kept this 1.
    ledger = [
      { part_id: P1, delta: -2, reason: 'job_used' },
      { part_id: P1, delta: 2, reason: 'job_reverted' },
      { part_id: P1, delta: -1, reason: 'job_used' },
    ];
    await revertJobStock(B1, 'test-service-key');
    expect(rpcCalls).toEqual([
      expect.objectContaining({ p_part_id: P1, p_delta: 1, p_reason: 'job_reverted' }),
    ]);
  });

  it('ignores initial / restock / adjustment rows tagged with the job', async () => {
    ledger = [
      { part_id: P1, delta: 5, reason: 'restock' },
      { part_id: P1, delta: -1, reason: 'adjustment' },
    ];
    await revertJobStock(B1, 'test-service-key');
    expect(rpcCalls).toEqual([]);
  });

  it('a failed ledger read returns stock to nobody (safe, not a guess)', async () => {
    ledgerFails = true;
    expect(await revertJobStock(B1, 'test-service-key')).toEqual({});
    expect(rpcCalls).toEqual([]);
  });
});

describe('admin cancel (role admin-cancel-booking)', () => {
  it('is admin-only and touches nothing otherwise', async () => {
    expect((await run(handleAdminCancelBooking, { id: B1 })).statusCode).toBe(401);
    expect(
      (await run(handleAdminCancelBooking, { access_token: 'client', id: B1 })).statusCode
    ).toBe(403);
    expect(patches).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it('cancels, gives the parts back, and reports them', async () => {
    ledger = [{ part_id: P1, delta: -2, reason: 'job_used' }];
    const r = await run(handleAdminCancelBooking, {
      access_token: 'admin',
      id: B1,
      reason: 'Client request — moved away',
    });
    expect(r.statusCode).toBe(200);
    expect(patches[0].body).toEqual({
      status: 'cancelled',
      cancellation_reason: 'Client request — moved away',
    });
    expect(rpcCalls[0]).toMatchObject({
      p_part_id: P1,
      p_delta: 2,
      p_reason: 'job_reverted',
      p_job_id: B1,
    });
    expect(r.body.parts_returned).toEqual({ [P1]: 2 });
    expect(r.body.booking.google_event_id).toBe('g1');
  });

  it('only matches a booking that is not cancelled yet (the transition fires once)', async () => {
    await run(handleAdminCancelBooking, { access_token: 'admin', id: B1 });
    expect(patches[0].u).toContain('status=neq.cancelled');
  });

  it('already cancelled: 409 and no stock moves', async () => {
    bookingIsCancellable = false;
    ledger = [{ part_id: P1, delta: -2, reason: 'job_used' }];
    const r = await run(handleAdminCancelBooking, { access_token: 'admin', id: B1 });
    expect(r.statusCode).toBe(409);
    expect(rpcCalls).toEqual([]);
  });
});

describe('mechanic cancel (handleMechanicUpdateStatus)', () => {
  // Not exported (it needs a signed mechanic token), so this reads the code:
  // the cancel must be a transition and the revert must sit behind a real update.
  const src = readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('async function handleMechanicUpdateStatus'));
  const body = fn.slice(0, fn.indexOf('\nasync function '));
  it('matches only a not-yet-cancelled job when cancelling', () => {
    expect(body).toMatch(/status === 'cancelled' \? '&status=neq\.cancelled'/);
  });
  it('returns stock only after an update that actually hit a row', () => {
    expect(body).toMatch(/updated\.length\)\s*\{\s*await revertJobStock\(/);
  });
});
