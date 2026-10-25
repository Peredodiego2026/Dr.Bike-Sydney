// tests/unit/restock-report.test.js - item 6 (26-oct-2026): what to buy and
// when, from the stock history (parts are never deleted, so the history is
// whole). Usage is net of reverts over 30 and 90 days; "reorder now" at the
// minimum or with 14 days of stock or less, "soon" at 30 or less; buy brings
// the stock to the minimum plus 30 days of use.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';

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

const NOW = Date.parse('2026-12-01T00:00:00Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();

let parts;
let movements;
let asked;
globalThis.fetch = async (url) => {
  const u = String(url);
  asked.push(u);
  const json = (b) => ({ ok: true, status: 200, json: async () => b });
  if (u.includes('/auth/v1/user')) return json({ factors: [] });
  if (u.includes('/rest/v1/parts_inventory')) return json(parts);
  if (u.includes('/rest/v1/stock_movements')) return json(movements);
  return json([]);
};

const { restockReport, handleAdminInventoryReorder } = await import('../../api/auth.js');

beforeEach(() => {
  asked = [];
  parts = [];
  movements = [];
});

describe('the numbers', () => {
  const P = (id, stock, min, extra = {}) => ({
    id,
    name: id,
    stock,
    min_stock: min,
    cost_price: 2,
    ...extra,
  });

  it('usage is net of reverts, over 30 and 90 days; older moves do not count', () => {
    const r = restockReport(
      [P('tube', 10, 2)],
      [
        { part_id: 'tube', delta: -3, created_at: ago(10) },
        { part_id: 'tube', delta: 1, created_at: ago(9) }, // a cancelled job gave one back
        { part_id: 'tube', delta: -4, created_at: ago(60) },
        { part_id: 'tube', delta: -20, created_at: ago(120) },
      ],
      NOW
    );
    expect(r.rows[0]).toMatchObject({ used_30: 2, used_90: 6 });
  });

  it('at or below the minimum: reorder now, buy back up to the minimum even with no use yet', () => {
    const r = restockReport([P('tube 20"', 1, 2)], [], NOW);
    expect(r.rows[0]).toMatchObject({
      status: 'reorder',
      days_left: null,
      suggested: 1,
      est_cost: 2,
    });
  });

  it('14 days of stock or less: reorder now; 30 or less: soon; more: fine', () => {
    // 90 used in 90 days = 1 a day
    const daily = (id) =>
      Array.from({ length: 9 }, (_, i) => ({
        part_id: id,
        delta: -10,
        created_at: ago(i * 10 + 1),
      }));
    const r = restockReport(
      [P('a', 10, 2), P('b', 25, 2), P('c', 60, 2)],
      [...daily('a'), ...daily('b'), ...daily('c')],
      NOW
    );
    const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(by.a).toMatchObject({ days_left: 10, status: 'reorder', suggested: 22 }); // 2 + 30 - 10
    expect(by.b).toMatchObject({ days_left: 25, status: 'soon', suggested: 7 });
    expect(by.c).toMatchObject({ days_left: 60, status: 'ok', suggested: 0 });
    // most urgent first
    expect(r.rows.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r).toMatchObject({ reorder: 1, soon: 1, est_cost: 58 });
  });

  it('a deactivated part is not on the list', () => {
    const r = restockReport([P('old', 0, 2, { active: false }), P('tube', 0, 2)], [], NOW);
    expect(r.rows.map((x) => x.id)).toEqual(['tube']);
  });
});

describe('the admin role', () => {
  it('reads only the job moves of the last 90 days, and answers the report', async () => {
    parts = [{ id: 't', name: 'Tube 20"', stock: 1, min_stock: 2, cost_price: 2 }];
    const res = { statusCode: null, body: null, headers: {} };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => ((res.body = b), res);
    res.setHeader = (k, v) => (res.headers[k] = v);
    await handleAdminInventoryReorder({ body: { access_token: 'admin' }, headers: {} }, res);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ name: 'Tube 20"', status: 'reorder', suggested: 1 });
    const mv = asked.find((u) => u.includes('/stock_movements'));
    expect(mv).toContain('reason=in.(job_used,job_reverted)');
    expect(mv).toContain('created_at=gte.');
  });

  it('is admin-only', async () => {
    const res = { statusCode: null, body: null };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => ((res.body = b), res);
    await handleAdminInventoryReorder({ body: { access_token: 'client' }, headers: {} }, res);
    expect(res.statusCode).toBe(403);
  });

  it('is routed, and Admin > Spare Parts draws it', () => {
    const auth = readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
    expect(auth).toMatch(
      /if \(role === 'admin-inventory-reorder'\) return handleAdminInventoryReorder\(req, res\);/
    );
    const admin = readFileSync(new URL('../../js/admin.js', import.meta.url), 'utf8');
    expect(admin).toMatch(/photosApi\('admin-inventory-reorder'\)/);
    expect(readFileSync(new URL('../../admin.html', import.meta.url), 'utf8')).toContain(
      'id="inv-reorder"'
    );
  });
});
