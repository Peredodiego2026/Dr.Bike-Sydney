// Admin inventory, server-side: list is admin-only, and every stock change is
// routed through the adjust_part_stock ledger (restock/adjustment), never a
// blind overwrite. Runs the real handlers against a fake Supabase.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const ADMIN = 'peredo.dm@gmail.com';
const P1 = '22222222-2222-2222-2222-222222222222';

vi.mock('stripe', () => ({ default: class {} }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (tok) =>
        tok === 'admin'
          ? { data: { user: { id: 'u1', email: ADMIN } }, error: null }
          : tok === 'client'
            ? { data: { user: { id: 'u2', email: 'someone@example.com' } }, error: null }
            : { data: { user: null }, error: { message: 'bad' } },
    },
  }),
}));

let calls = [];
let currentStock = 5;
let partExists = true;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || 'GET';
  calls.push({ u, method, body: init.body ? JSON.parse(init.body) : null });
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => '' });
  if (u.includes('/auth/v1/user')) return ok({ factors: [] }); // AAL factor lookup
  if (u.includes('/rest/v1/parts_inventory?select=*'))
    return ok([{ id: P1, name: 'Tube', stock: 5 }]);
  if (u.includes('/rest/v1/parts_inventory') && method === 'POST')
    return ok([{ id: 'new-id', name: 'New part', stock: 3 }]);
  if (u.includes('/rest/v1/parts_inventory') && method === 'PATCH')
    return ok(partExists ? [{ id: P1, name: 'Tube', stock: currentStock }] : []);
  if (u.includes('/rest/v1/parts_inventory') && method === 'DELETE') return ok({});
  if (u.includes('/rest/v1/rpc/adjust_part_stock'))
    return ok([{ id: P1, name: 'Tube', new_stock: 9, min_stock: 2, applied: 1 }]);
  if (u.includes('/rest/v1/stock_movements') && method === 'POST') return ok({});
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};

const {
  handleAdminInventoryList,
  handleAdminInventoryUpsert,
  handleAdminInventoryMove,
  handleAdminInventoryDelete,
} = await import('../../api/auth.js');

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
  currentStock = 5;
  partExists = true;
});

describe('access control', () => {
  it('list needs an admin', async () => {
    expect((await run(handleAdminInventoryList, {})).statusCode).toBe(401);
    expect((await run(handleAdminInventoryList, { access_token: 'client' })).statusCode).toBe(403);
    expect((await run(handleAdminInventoryList, { access_token: 'admin' })).statusCode).toBe(200);
  });
  it('a write needs an admin, and never touches the DB otherwise', async () => {
    const r = await run(
      handleAdminInventoryMove,
      { access_token: 'client', id: P1, qty: 3 },
      'restock'
    );
    expect(r.statusCode).toBe(403);
    expect(rpc()).toEqual([]);
  });
});

describe('stock changes go through the ledger', () => {
  it('restock adds a positive restock movement', async () => {
    const r = await run(
      handleAdminInventoryMove,
      { access_token: 'admin', id: P1, qty: 4 },
      'restock'
    );
    expect(r.statusCode).toBe(200);
    expect(rpc()).toEqual([
      expect.objectContaining({ p_part_id: P1, p_delta: 4, p_reason: 'restock' }),
    ]);
  });
  it('restock forces a positive delta even if a negative sneaks in', async () => {
    await run(handleAdminInventoryMove, { access_token: 'admin', id: P1, qty: -4 }, 'restock');
    expect(rpc()[0]).toMatchObject({ p_delta: 4, p_reason: 'restock' });
  });
  it('adjust passes the signed delta as an adjustment', async () => {
    await run(handleAdminInventoryMove, { access_token: 'admin', id: P1, delta: -2 }, 'adjustment');
    expect(rpc()[0]).toMatchObject({ p_part_id: P1, p_delta: -2, p_reason: 'adjustment' });
  });
  it('a zero / missing amount is rejected', async () => {
    expect(
      (
        await run(
          handleAdminInventoryMove,
          { access_token: 'admin', id: P1, delta: 0 },
          'adjustment'
        )
      ).statusCode
    ).toBe(400);
    expect(rpc()).toEqual([]);
  });
});

describe('upsert', () => {
  it('editing stock becomes an adjustment for the difference, not an overwrite', async () => {
    currentStock = 5;
    await run(handleAdminInventoryUpsert, {
      access_token: 'admin',
      id: P1,
      name: 'Tube',
      stock: 8,
    });
    expect(rpc()).toEqual([
      expect.objectContaining({ p_part_id: P1, p_delta: 3, p_reason: 'adjustment' }),
    ]);
    // metadata still PATCHed, stock never PATCHed directly
    const patches = calls.filter((c) => c.u.includes('/parts_inventory') && c.method === 'PATCH');
    expect(patches.every((p) => !('stock' in (p.body || {})))).toBe(true);
  });
  it('same stock makes no movement', async () => {
    currentStock = 8;
    await run(handleAdminInventoryUpsert, {
      access_token: 'admin',
      id: P1,
      name: 'Tube',
      stock: 8,
    });
    expect(rpc()).toEqual([]);
  });
  it('a new part logs an initial movement for its starting stock', async () => {
    await run(handleAdminInventoryUpsert, { access_token: 'admin', name: 'New part', stock: 3 });
    const initial = calls.find((c) => c.u.includes('/stock_movements') && c.method === 'POST');
    expect(initial.body).toMatchObject({ delta: 3, reason: 'initial' });
  });
  it('name is required', async () => {
    expect(
      (await run(handleAdminInventoryUpsert, { access_token: 'admin', name: '  ' })).statusCode
    ).toBe(400);
  });
});

describe('delete', () => {
  it('admin only, deletes the part', async () => {
    const r = await run(handleAdminInventoryDelete, { access_token: 'admin', id: P1 });
    expect(r.statusCode).toBe(200);
    expect(calls.some((c) => c.u.includes('/parts_inventory') && c.method === 'DELETE')).toBe(true);
  });
});

describe('upsert validates what becomes a client price', () => {
  const up = (extra) =>
    run(handleAdminInventoryUpsert, { access_token: 'admin', id: P1, name: 'Tube', ...extra });
  it.each([
    [{ sell_price: -5 }, 'sell_price'],
    [{ cost_price: 'abc' }, 'cost_price'],
    [{ min_stock: 2.5 }, 'min_stock'],
    [{ stock: -1 }, 'stock'],
    [{ stock: 1.5 }, 'stock'],
    [{ valve_length_mm: -40 }, 'valve_length_mm'],
  ])('refuses %j', async (extra, field) => {
    const r = await up(extra);
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toContain(field);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(rpc()).toEqual([]);
  });
  it('a blank client price is allowed (no price yet)', async () => {
    const r = await up({ sell_price: '' });
    expect(r.statusCode).toBe(200);
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch.body.sell_price).toBeNull();
  });
  it('trims the name and caps its length', async () => {
    await run(handleAdminInventoryUpsert, { access_token: 'admin', id: P1, name: '  Tube 26  ' });
    expect(calls.find((c) => c.method === 'PATCH').body.name).toBe('Tube 26');
    const long = await run(handleAdminInventoryUpsert, {
      access_token: 'admin',
      id: P1,
      name: 'x'.repeat(121),
    });
    expect(long.statusCode).toBe(400);
  });
  it('only known fields reach the database', async () => {
    await up({ stock_value: 999, id_hack: 'x', created_at: 'now' });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(Object.keys(patch.body).sort()).toEqual(['name']);
  });
  it('editing a part that no longer exists is a 404, and no stock moves', async () => {
    partExists = false;
    const r = await up({ stock: 9 });
    expect(r.statusCode).toBe(404);
    expect(rpc()).toEqual([]);
  });
});

describe('admin categories', () => {
  // The 61 seeded tubes are category 'Tubes'. Missing from this list, the edit
  // modal selected nothing and the browser picked 'Brakes' - saving any tube
  // silently re-categorised it.
  const src = readFileSync(new URL('../../js/admin.js', import.meta.url), 'utf8');
  const list = src.slice(
    src.indexOf('const PART_CATEGORIES = ['),
    src.indexOf('];', src.indexOf('const PART_CATEGORIES = ['))
  );
  it("includes 'Tubes'", () => {
    expect(list).toContain("'Tubes'");
  });
});
