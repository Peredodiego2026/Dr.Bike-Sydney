// tests/unit/finance-income.test.js - Diego, 25-oct-2026: memberships and shop
// sales are sales, and Finance's Revenue and BAS added up bookings only.
// handleAdminFinanceIncome reads membership payments from Stripe (the webhook
// stores no amount) and live paid shop orders, for the Finance period.
//
// Stripe and Supabase are faked; the assertions are about which payments come
// back for the period and how each source fails on its own.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const sec = (iso) => Math.floor(new Date(iso).getTime() / 1000);
let invoices = [];
let stripeFails = null;
let listParams = null;
vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.invoices = {
        list: (params) => {
          listParams = params;
          if (stripeFails) throw new Error(stripeFails);
          return {
            async *[Symbol.asyncIterator]() {
              yield* invoices;
            },
          };
        },
      };
    }
  },
}));

let orders = [];
let shopError = null;
let shopFilters = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (tok) =>
        tok === 'admin'
          ? { data: { user: { id: 'u1', email: 'peredo.dm@gmail.com' } }, error: null }
          : { data: { user: { id: 'u2', email: 'someone@example.com' } }, error: null },
    },
    from: () => {
      const q = {
        select: () => q,
        eq: (c, v) => (shopFilters.push(['eq', c, v]), q),
        in: (c, v) => (shopFilters.push(['in', c, v]), q),
        then: (resolve) =>
          Promise.resolve(
            resolve(
              shopError
                ? { data: null, error: shopError }
                : {
                    data: orders.filter(
                      (o) =>
                        o.mode === 'live' &&
                        ['paid', 'ordered', 'packed', 'sent', 'delivered'].includes(o.status)
                    ),
                    error: null,
                  }
            )
          ),
      };
      return q;
    },
  }),
}));
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ factors: [] }),
  text: async () => '',
});

const { handleAdminFinanceIncome } = await import('../../api/auth.js');

const run = async (body) => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  await handleAdminFinanceIncome({ body, headers: {} }, res);
  return res;
};
// October 2026 in Sydney (AEDT, +11)
const OCT = {
  access_token: 'admin',
  from: '2026-09-30T14:00:00.000Z',
  to: '2026-10-31T13:00:00.000Z',
};
const inv = (paidIso, cents, extra = {}) => ({
  amount_paid: cents,
  status_transitions: { paid_at: sec(paidIso) },
  customer_name: 'Mia',
  customer_email: 'mia@example.com',
  lines: { data: [{ description: '1 × Standard (at $97.00 / month)' }] },
  parent: { subscription_details: { subscription: 'sub_1' } },
  ...extra,
});

beforeEach(() => {
  invoices = [];
  orders = [];
  stripeFails = null;
  shopError = null;
  listParams = null;
  shopFilters = [];
});

describe('memberships, from Stripe', () => {
  it('counts each subscription payment paid inside the period, on the day it was paid', async () => {
    invoices = [
      inv('2026-10-05T01:00:00Z', 9700),
      inv('2026-10-20T01:00:00Z', 6700, { parent: null, subscription: 'sub_2' }), // older API shape
      inv('2026-09-28T01:00:00Z', 9700), // paid in September
      inv('2026-10-10T01:00:00Z', 5000, { parent: null }), // a one-off invoice, not a membership
      inv('2026-10-11T01:00:00Z', 0), // a free trial invoice
    ];
    const r = await run(OCT);
    expect(r.statusCode).toBe(200);
    expect(r.body.memberships.available).toBe(true);
    expect(r.body.memberships.total).toBe(164);
    expect(r.body.memberships.items.map((i) => i.amount)).toEqual([97, 67]);
    expect(r.body.memberships.items[0]).toMatchObject({ name: 'Mia', email: 'mia@example.com' });
    expect(r.body.memberships.items[0].description).toMatch(/Standard/);
  });

  it('asks Stripe only for paid invoices, from far enough back to catch late renewals', async () => {
    await run(OCT);
    expect(listParams.status).toBe('paid');
    expect(listParams.created.lt).toBe(sec(OCT.to));
    expect(listParams.created.gte).toBeLessThan(sec(OCT.from));
  });

  it('Stripe down: memberships say why, the shop still answers', async () => {
    stripeFails = 'connection timeout';
    orders = [
      {
        mode: 'live',
        status: 'paid',
        total: 52,
        paid_at: '2026-10-07T03:00:00Z',
        created_at: '2026-10-07T02:59:00Z',
      },
    ];
    const r = await run(OCT);
    expect(r.statusCode).toBe(200);
    expect(r.body.memberships).toMatchObject({ available: false });
    expect(r.body.memberships.reason).toMatch(/connection timeout/);
    expect(r.body.shop.total).toBe(52);
  });
});

describe('shop sales', () => {
  it('live orders paid in the period - never test-mode, never refunded or unpaid', async () => {
    orders = [
      {
        mode: 'live',
        status: 'paid',
        total: 52,
        paid_at: '2026-10-07T03:00:00Z',
        created_at: '2026-10-07T02:59:00Z',
        client_name: 'Leo',
      },
      {
        mode: 'live',
        status: 'delivered',
        total: 30.5,
        paid_at: '2026-10-15T03:00:00Z',
        created_at: '2026-10-15T03:00:00Z',
      },
      {
        mode: 'test',
        status: 'paid',
        total: 999,
        paid_at: '2026-10-08T03:00:00Z',
        created_at: '2026-10-08T03:00:00Z',
      },
      {
        mode: 'live',
        status: 'refunded',
        total: 40,
        paid_at: '2026-10-09T03:00:00Z',
        created_at: '2026-10-09T03:00:00Z',
      },
      {
        mode: 'live',
        status: 'pending',
        total: 20,
        paid_at: null,
        created_at: '2026-10-09T03:00:00Z',
      },
      {
        mode: 'live',
        status: 'paid',
        total: 60,
        paid_at: '2026-11-02T03:00:00Z',
        created_at: '2026-11-02T03:00:00Z',
      },
    ];
    const r = await run(OCT);
    expect(r.body.shop.total).toBe(82.5);
    expect(r.body.shop.items.map((i) => i.amount)).toEqual([52, 30.5]);
    expect(r.body.shop.items[0].name).toBe('Leo');
    expect(shopFilters).toContainEqual(['eq', 'mode', 'live']);
  });

  it('no shop table yet is no sales, not an error', async () => {
    shopError = { message: 'relation "public.shop_orders" does not exist', code: '42P01' };
    const r = await run(OCT);
    expect(r.body.shop).toEqual({ available: true, total: 0, items: [] });
  });

  it('any other read error says so', async () => {
    shopError = { message: 'permission denied', code: '42501' };
    const r = await run(OCT);
    expect(r.body.shop.available).toBe(false);
    expect(r.body.shop.reason).toMatch(/permission denied/);
  });
});

describe('the gate', () => {
  it('is admin-only', async () => {
    expect((await run({ ...OCT, access_token: 'client' })).statusCode).toBe(403);
  });
  it('needs a real period', async () => {
    expect((await run({ access_token: 'admin', from: 'x', to: 'y' })).statusCode).toBe(400);
    expect((await run({ ...OCT, to: OCT.from })).statusCode).toBe(400);
  });
});

describe('Finance puts it into Revenue and the BAS', () => {
  const src = readFileSync(new URL('../../js/admin.js', import.meta.url), 'utf8');
  it('revenue is jobs + memberships + shop', () => {
    expect(src).toMatch(/const revenue = jobsRevenue \+ memberships\.total \+ shopSales\.total;/);
  });
  it('the ledger the table and CSV read holds all three, oldest first', () => {
    const m = src.match(/function finLedger\(jobs, membershipItems, shopItems\) \{[\s\S]*?\n\}/)[0];
    const finLocalDate = (iso) => new Date(iso).toISOString().slice(0, 10);
    const finRevenueDate = (j) => j.completed_at.slice(0, 10);
    const anBookingRevenue = (j) => j.amount;
    const finLedger = new Function(
      'finLocalDate',
      'finRevenueDate',
      'anBookingRevenue',
      `${m}; return finLedger;`
    )(finLocalDate, finRevenueDate, anBookingRevenue);
    const rows = finLedger(
      [
        {
          completed_at: '2026-10-09T00:00:00Z',
          amount: 184,
          client_name: 'Alice',
          service_name: 'Tune-Up',
        },
      ],
      [{ date: '2026-10-05T01:00:00Z', amount: 97, name: 'Mia', description: 'Standard' }],
      [{ date: '2026-10-07T03:00:00Z', amount: 52, name: 'Leo', description: 'Shop order' }]
    );
    expect(rows.map((r) => [r.kind, r.amount])).toEqual([
      ['membership', 97],
      ['shop', 52],
      ['job', 184],
    ]);
    expect(rows[0].what).toBe('Membership - Standard');
  });
});
