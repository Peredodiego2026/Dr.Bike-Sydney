// Parts are deactivated, never deleted, and every stock change - the
// mechanic's +/- included - lands in the history. Diego, 23-oct-2026: the usage
// history is what a repurchase study is built on. Runs the real handlers
// against a fake Supabase, with a mechanic token minted by auth.js's own code.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

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

const P1 = '22222222-2222-2222-2222-222222222222';
const MID = '44444444-4444-4444-4444-444444444444';

let calls = [];
let activeColumn = true;
let partExists = true;
let currentStock = 5;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ u, method, body });
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => '' });
  const bad = (status, text) => ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  });
  if (u.includes('/auth/v1/user')) return ok({ factors: [] });
  if (u.includes('/rest/v1/escalation_contacts'))
    return ok([{ id: MID, name: 'Will', session_version: 0 }]);
  if (u.includes('/rest/v1/parts_inventory?select=*')) {
    if (u.includes('active=is.true') && !activeColumn)
      return bad(400, 'column parts_inventory.active does not exist');
    return ok([{ id: P1, name: 'Tube', stock: 5, active: true }]);
  }
  if (u.includes('/rest/v1/parts_inventory?select=stock')) return ok([{ stock: currentStock }]);
  if (u.includes('/rest/v1/parts_inventory') && method === 'PATCH') {
    if (!activeColumn && body && 'active' in body)
      return bad(400, 'column "active" of relation "parts_inventory" does not exist');
    return ok(partExists ? [{ id: P1, active: body.active }] : []);
  }
  if (u.includes('/rest/v1/parts_inventory') && method === 'DELETE') return ok({});
  if (u.includes('/rest/v1/rpc/adjust_part_stock'))
    return ok([{ id: P1, name: 'Tube', new_stock: 7, min_stock: 2, applied: body.p_delta }]);
  return bad(404, '');
};

const auth = await import('../../api/auth.js');
const { handleAdminInventoryActive, handleMechanicParts, handleMechanicPartsUpdate } = auth;

// The real token, made by auth.js's own makeToken (not exported, so lifted).
const src = readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
const makeToken = new Function(
  'crypto',
  `${src.match(/const TOKEN_TTL_MS = [^;]+;/)[0]}
   ${src.match(/function b64url\(buf\) \{[\s\S]*?\n\}/)[0]}
   ${src.match(/function makeToken\(mid, sv = 0\) \{[\s\S]*?\n\}/)[0]}
   return makeToken;`
)(crypto);
const TOKEN = makeToken(MID, 0);

const run = async (handler, body) => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await handler({ body, headers: {} }, res);
  return res;
};
const rpc = () => calls.filter((c) => c.u.includes('/rpc/adjust_part_stock')).map((c) => c.body);
const deletes = () => calls.filter((c) => c.method === 'DELETE');

beforeEach(() => {
  calls = [];
  activeColumn = true;
  partExists = true;
  currentStock = 5;
});

describe('admin: deactivate, never delete (role admin-inventory-active)', () => {
  it('is admin-only', async () => {
    expect((await run(handleAdminInventoryActive, { id: P1, active: false })).statusCode).toBe(401);
    expect(
      (await run(handleAdminInventoryActive, { access_token: 'client', id: P1, active: false }))
        .statusCode
    ).toBe(403);
    expect(calls.filter((c) => c.u.includes('parts_inventory'))).toEqual([]);
  });

  it('deactivating sets active=false and deletes nothing', async () => {
    const r = await run(handleAdminInventoryActive, {
      access_token: 'admin',
      id: P1,
      active: false,
    });
    expect(r.statusCode).toBe(200);
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch.body).toEqual({ active: false });
    expect(deletes()).toEqual([]);
  });

  it('reactivating sets active=true', async () => {
    await run(handleAdminInventoryActive, { access_token: 'admin', id: P1, active: true });
    expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ active: true });
  });

  it('active must be a real true/false', async () => {
    for (const active of ['false', 0, undefined, null]) {
      const r = await run(handleAdminInventoryActive, { access_token: 'admin', id: P1, active });
      expect(r.statusCode, String(active)).toBe(400);
    }
  });

  it('a part that does not exist is a 404', async () => {
    partExists = false;
    expect(
      (await run(handleAdminInventoryActive, { access_token: 'admin', id: P1, active: false }))
        .statusCode
    ).toBe(404);
  });

  it('before the SQL is run, it says so instead of a bare 500', async () => {
    activeColumn = false;
    const r = await run(handleAdminInventoryActive, {
      access_token: 'admin',
      id: P1,
      active: false,
    });
    expect(r.statusCode).toBe(503);
    expect(r.body.error).toContain('add-parts-active-keep-history.sql');
  });

  it('there is no delete route left, and admin.js never calls one', () => {
    expect(src).not.toMatch(/admin-inventory-delete/);
    expect(src).not.toMatch(/handleAdminInventoryDelete/);
    const admin = readFileSync(new URL('../../js/admin.js', import.meta.url), 'utf8');
    expect(admin).not.toMatch(/admin-inventory-delete/);
  });
});

describe('mechanic lists hide deactivated parts (role mechanic-parts)', () => {
  it('asks only for active parts', async () => {
    const r = await run(handleMechanicParts, { token: TOKEN });
    expect(r.statusCode).toBe(200);
    expect(calls.find((c) => c.u.includes('parts_inventory?select=*')).u).toContain(
      'active=is.true'
    );
  });

  it('before the column exists, falls back to the full list instead of breaking', async () => {
    activeColumn = false;
    const r = await run(handleMechanicParts, { token: TOKEN });
    expect(r.statusCode).toBe(200);
    expect(r.body).toHaveLength(1);
    const lists = calls.filter((c) => c.u.includes('parts_inventory?select=*'));
    expect(lists).toHaveLength(2);
    expect(lists[1].u).not.toContain('active=');
  });

  it('needs a mechanic', async () => {
    expect((await run(handleMechanicParts, {})).statusCode).toBe(401);
  });
});

describe('mechanic +/- goes through the history (role mechanic-parts-update)', () => {
  it('a +1 from the phone becomes a +1 adjustment by that mechanic', async () => {
    const r = await run(handleMechanicPartsUpdate, { token: TOKEN, id: P1, delta: 1 });
    expect(r.statusCode).toBe(200);
    expect(rpc()).toEqual([
      expect.objectContaining({
        p_part_id: P1,
        p_delta: 1,
        p_reason: 'adjustment',
        p_created_by: 'Will',
      }),
    ]);
    expect(r.body.stock).toBe(7); // the real count, from the database
  });

  it('never overwrites stock directly any more', async () => {
    await run(handleMechanicPartsUpdate, { token: TOKEN, id: P1, delta: -1 });
    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches).toEqual([]);
  });

  it('an older cached app sending the absolute number still works, as the difference', async () => {
    currentStock = 5;
    await run(handleMechanicPartsUpdate, { token: TOKEN, id: P1, stock: 8 });
    expect(rpc()[0]).toMatchObject({ p_delta: 3, p_reason: 'adjustment' });
  });

  it('rejects nonsense', async () => {
    expect(
      (await run(handleMechanicPartsUpdate, { token: TOKEN, id: P1, delta: 'x' })).statusCode
    ).toBe(400);
    expect(
      (await run(handleMechanicPartsUpdate, { token: TOKEN, id: P1, delta: 5000 })).statusCode
    ).toBe(400);
    expect(
      (await run(handleMechanicPartsUpdate, { token: TOKEN, id: P1, stock: -1 })).statusCode
    ).toBe(400);
    expect(rpc()).toEqual([]);
  });

  it('needs a mechanic', async () => {
    expect((await run(handleMechanicPartsUpdate, { id: P1, delta: 1 })).statusCode).toBe(401);
    expect(rpc()).toEqual([]);
  });
});
