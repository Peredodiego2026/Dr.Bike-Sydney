// Cancelling a completed job must give its parts back - exactly what the
// completion took, once, from the ledger (not the free-text parts_used).
// Runs the real revertJobStock against a fake Supabase.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

vi.mock('stripe', () => ({ default: class {} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const B1 = '11111111-1111-1111-1111-111111111111';
const P1 = '22222222-2222-2222-2222-222222222222';
const P2 = '33333333-3333-3333-3333-333333333333';

let ledger = [];
let rpcCalls = [];
let ledgerFails = false;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
  if (u.includes('/rest/v1/stock_movements') && (init.method || 'GET') === 'GET') {
    if (ledgerFails)
      return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
    return ok(ledger);
  }
  if (u.includes('/rest/v1/rpc/adjust_part_stock')) {
    rpcCalls.push(JSON.parse(init.body));
    return ok([{ id: JSON.parse(init.body).p_part_id, new_stock: 9, min_stock: 2, applied: 1 }]);
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};

const { revertJobStock } = await import('../../api/auth.js');

beforeEach(() => {
  ledger = [];
  rpcCalls = [];
  ledgerFails = false;
});

describe('revertJobStock', () => {
  it('returns exactly what the job used, as job_reverted (positive inverse)', async () => {
    ledger = [
      { part_id: P1, delta: -2, reason: 'job_used' },
      { part_id: P2, delta: -1, reason: 'job_used' },
    ];
    await revertJobStock(B1, 'test-service-key', 'tester');
    expect(rpcCalls).toHaveLength(2);
    const byPart = Object.fromEntries(rpcCalls.map((c) => [c.p_part_id, c]));
    expect(byPart[P1]).toMatchObject({ p_delta: 2, p_reason: 'job_reverted', p_job_id: B1 });
    expect(byPart[P2]).toMatchObject({ p_delta: 1, p_reason: 'job_reverted', p_job_id: B1 });
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

  it('is idempotent: a job already reverted gives nothing back', async () => {
    ledger = [
      { part_id: P1, delta: -2, reason: 'job_used' },
      { part_id: P1, delta: 2, reason: 'job_reverted' },
    ];
    await revertJobStock(B1, 'test-service-key');
    expect(rpcCalls).toEqual([]);
  });

  it('no-op when the job never used parts', async () => {
    ledger = [{ part_id: P1, delta: 5, reason: 'initial' }];
    await revertJobStock(B1, 'test-service-key');
    expect(rpcCalls).toEqual([]);
  });

  it('a failed ledger read returns stock to nobody (safe, not a guess)', async () => {
    ledgerFails = true;
    await revertJobStock(B1, 'test-service-key');
    expect(rpcCalls).toEqual([]);
  });
});
