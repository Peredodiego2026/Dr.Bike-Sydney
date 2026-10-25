// tests/unit/gift-cards-issue.test.js - found 25-oct-2026: every gift card sold
// was charged and never delivered. The code went into discount_codes as
// `discount_amount` (a column that does not exist in production), and the email
// went to /api/send-email without x-internal-token (403). The failure was
// swallowed, so Stripe never retried.
//
// issueGiftCard (api/_gift-cards.js) against a fake Supabase that, like
// production, REJECTS an unknown column. Plus the two admin roles that find and
// issue the purchases that already failed.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.INTERNAL_API_SECRET = 'internal-secret';

// ── fake Supabase: gift_cards and discount_codes, columns enforced ──────────
const COLUMNS = {
  gift_cards: [
    'id',
    'code',
    'amount',
    'purchaser_email',
    'recipient_email',
    'recipient_name',
    'sender_name',
    'message',
    'status',
    'stripe_session_id',
    'created_at',
    'redeemed_at',
  ],
  discount_codes: [
    'id',
    'code',
    'discount_value',
    'discount_type',
    'max_uses',
    'uses_count',
    'active',
    'created_at',
    'expires_at',
  ],
};
let db;
let failInsert = null;
function table(name) {
  const filters = [];
  const q = {
    select: () => q,
    eq: (c, v) => (filters.push((r) => r[c] === v), q),
    in: (c, v) => (filters.push((r) => v.includes(r[c])), q),
    maybeSingle: async () => ({
      data: db[name].filter((r) => filters.every((f) => f(r)))[0] ?? null,
      error: null,
    }),
    insert: async (row) => {
      const bad = Object.keys(row).filter((k) => !COLUMNS[name].includes(k));
      if (bad.length)
        return { error: { message: `column "${bad[0]}" of relation "${name}" does not exist` } };
      if (failInsert === name) return { error: { message: 'connection reset' } };
      db[name].push({ ...row });
      return { error: null };
    },
    then: (resolve) =>
      Promise.resolve(
        resolve({ data: db[name].filter((r) => filters.every((f) => f(r))), error: null })
      ),
  };
  return q;
}
const fakeSb = { from: (t) => table(t) };

let emails = [];
let emailStatus = 200;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('/api/send-email')) {
    emails.push({ headers: init.headers, body: JSON.parse(init.body) });
    return { ok: emailStatus === 200, status: emailStatus, json: async () => ({}) };
  }
  if (u.includes('/auth/v1/user'))
    return { ok: true, status: 200, json: async () => ({ factors: [] }) };
  return { ok: false, status: 404, json: async () => ({}) };
};

// ── fake Stripe for the admin roles ─────────────────────────────────────────
let sessions = [];
vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.checkout = {
        sessions: {
          list: () => ({
            async *[Symbol.asyncIterator]() {
              yield* sessions;
            },
          }),
          retrieve: async (id) => {
            const s = sessions.find((x) => x.id === id);
            if (!s) throw new Error('No such checkout.session');
            return s;
          },
        },
      };
    }
  },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (tok) =>
        tok === 'admin'
          ? { data: { user: { id: 'u1', email: 'peredo.dm@gmail.com' } }, error: null }
          : { data: { user: { id: 'u2', email: 'someone@example.com' } }, error: null },
    },
    from: (t) => table(t),
  }),
}));

const { issueGiftCard, genGiftCode } = await import('../../api/_gift-cards.js');
const { handleAdminGiftCardsCheck, handleAdminGiftCardsIssue } = await import('../../api/auth.js');

const session = (id, extra = {}) => ({
  id,
  payment_status: 'paid',
  created: 1760000000,
  amount_total: 5000,
  customer_details: { email: 'bob@example.com' },
  metadata: {
    giftCard: 'true',
    amount: '50',
    recipientEmail: 'ana@example.com',
    recipientName: 'Ana',
    senderName: 'Bob',
    message: 'Enjoy',
    purchaserEmail: 'bob@example.com',
  },
  ...extra,
});
const run = async (handler, body) => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  await handler({ body, headers: {} }, res);
  return res;
};

beforeEach(() => {
  db = { gift_cards: [], discount_codes: [] };
  failInsert = null;
  emails = [];
  emailStatus = 200;
  sessions = [];
});

describe('a purchase as it happens (the webhook)', () => {
  it('makes a redeemable code with the REAL column, records the purchase, and emails it with the internal token', async () => {
    const r = await issueGiftCard(fakeSb, session('cs_1'));
    expect(r).toMatchObject({ status: 'issued', emailed: true });
    expect(db.discount_codes).toHaveLength(1);
    expect(db.discount_codes[0]).toMatchObject({
      code: r.code,
      discount_value: 50,
      discount_type: 'fixed',
      max_uses: 1,
      active: true,
    });
    expect(db.gift_cards[0]).toMatchObject({
      code: r.code,
      amount: 50,
      stripe_session_id: 'cs_1',
      recipient_email: 'ana@example.com',
    });
    expect(emails).toHaveLength(1);
    expect(emails[0].headers['x-internal-token']).toBe('internal-secret');
    expect(emails[0].body).toMatchObject({
      type: 'gift_card',
      to: 'ana@example.com',
      code: r.code,
      amount: 50,
    });
  });

  it('run again for the same purchase (a Stripe retry): nothing new, no second email', async () => {
    const first = await issueGiftCard(fakeSb, session('cs_1'));
    const again = await issueGiftCard(fakeSb, session('cs_1'));
    expect(again).toEqual({ status: 'already', code: first.code });
    expect(db.discount_codes).toHaveLength(1);
    expect(db.gift_cards).toHaveLength(1);
    expect(emails).toHaveLength(1);
  });

  it('a purchase left half-done is completed with its own code', async () => {
    db.gift_cards.push({ code: 'GIFT-HALFDONE', amount: 50, stripe_session_id: 'cs_2' });
    const r = await issueGiftCard(fakeSb, session('cs_2'));
    expect(r).toMatchObject({ status: 'issued', code: 'GIFT-HALFDONE' });
    expect(db.discount_codes.map((d) => d.code)).toEqual(['GIFT-HALFDONE']);
    expect(emails).toHaveLength(1);
  });

  it('if the code cannot be made redeemable it THROWS - the webhook answers 500 and Stripe retries', async () => {
    failInsert = 'discount_codes';
    await expect(issueGiftCard(fakeSb, session('cs_3'))).rejects.toThrow(
      /discount_codes insert failed/
    );
    expect(emails).toHaveLength(0);
    // ...and the retry, once the database is back, finishes the same card
    failInsert = null;
    const r = await issueGiftCard(fakeSb, session('cs_3'));
    expect(r.status).toBe('issued');
    expect(db.gift_cards).toHaveLength(1);
    expect(db.discount_codes).toHaveLength(1);
  });

  it('a failed email is reported but the card exists', async () => {
    emailStatus = 403;
    const r = await issueGiftCard(fakeSb, session('cs_4'));
    expect(r).toMatchObject({ status: 'issued', emailed: false });
    expect(db.discount_codes).toHaveLength(1);
  });

  it('a purchase with no amount or recipient is not retried forever', async () => {
    const r = await issueGiftCard(fakeSb, session('cs_5', { metadata: { giftCard: 'true' } }));
    expect(r).toEqual({ status: 'invalid' });
    expect(db.discount_codes).toHaveLength(0);
  });

  it('codes are GIFT- plus 8 unambiguous characters', () => {
    for (let i = 0; i < 200; i++)
      expect(genGiftCode()).toMatch(/^GIFT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });
});

describe('the purchases that already failed (Admin > Discount Codes)', () => {
  it('lists every paid gift card session with no card, and nothing else', async () => {
    sessions = [
      session('cs_paid_missing'),
      session('cs_paid_issued'),
      session('cs_unpaid', { payment_status: 'unpaid' }),
      session('cs_not_gift', { metadata: { plan: 'basic' } }),
    ];
    db.gift_cards.push({ code: 'GIFT-ISSUED00', stripe_session_id: 'cs_paid_issued' });
    const r = await run(handleAdminGiftCardsCheck, { access_token: 'admin' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ paid: 2, issued: 1 });
    expect(r.body.missing.map((m) => m.session_id)).toEqual(['cs_paid_missing']);
    expect(r.body.missing[0]).toMatchObject({
      amount: 50,
      recipient_email: 'ana@example.com',
      purchaser_email: 'bob@example.com',
    });
  });

  it('issues one from the session as STRIPE has it', async () => {
    sessions = [session('cs_paid_missing')];
    const r = await run(handleAdminGiftCardsIssue, {
      access_token: 'admin',
      session_id: 'cs_paid_missing',
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ status: 'issued', emailed: true });
    expect(db.discount_codes[0].discount_value).toBe(50);
  });

  it('refuses a payment that is not a gift card, or was never paid', async () => {
    sessions = [
      session('cs_not_gift', { metadata: { plan: 'basic' } }),
      session('cs_unpaid', { payment_status: 'unpaid' }),
    ];
    expect(
      (await run(handleAdminGiftCardsIssue, { access_token: 'admin', session_id: 'cs_not_gift' }))
        .statusCode
    ).toBe(400);
    expect(
      (await run(handleAdminGiftCardsIssue, { access_token: 'admin', session_id: 'cs_unpaid' }))
        .statusCode
    ).toBe(409);
    expect(db.discount_codes).toHaveLength(0);
  });

  it('is admin-only, and takes nothing from the browser but a session id', async () => {
    expect((await run(handleAdminGiftCardsCheck, { access_token: 'client' })).statusCode).toBe(403);
    expect(
      (await run(handleAdminGiftCardsIssue, { access_token: 'admin', session_id: 'not-a-session' }))
        .statusCode
    ).toBe(400);
  });
});

describe('the webhook', () => {
  const src = readFileSync(new URL('../../api/stripe-webhook.js', import.meta.url), 'utf8');
  it('issues gift cards through the shared, idempotent function', () => {
    expect(src).toMatch(/await issueGiftCard\(sb, session\)/);
    expect(src).not.toMatch(/discount_amount: amount/);
  });
  it('every call it makes to send-email / send-message carries the internal token', () => {
    const fetches = src
      .split(/\bfetch\(/)
      .slice(1)
      .map((s) => s.slice(0, 600));
    const internal = fetches.filter((f) => /send-email|send-message|\$\{SELF\}/.test(f));
    expect(internal.length).toBeGreaterThanOrEqual(3);
    for (const f of internal) expect(f).toContain("'x-internal-token'");
  });
});
