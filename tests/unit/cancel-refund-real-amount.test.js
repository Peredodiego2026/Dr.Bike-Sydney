// tests/unit/cancel-refund-real-amount.test.js - when a client cancels with
// 24h+ notice, Diego's WhatsApp said "Reembolso de $20" (25-oct-2026). The
// visit fee has been per zone ($35, $45, $55...) since the flat $20 went away,
// so the message quoted an amount nobody was ever refunded.
//
// The real client-cancel handler against a fake Supabase and Stripe, then the
// real WhatsApp template it feeds.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.INTERNAL_API_SECRET = 'internal-secret';

let refundCents;
let refundFails;
let refundCalls;
vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.refunds = {
        create: async (args) => {
          refundCalls.push(args);
          if (refundFails) throw new Error('card_declined');
          return { id: 're_1', amount: refundCents };
        },
      };
    }
  },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q = {
      select: () => q,
      eq: () => q,
      gt: () => q,
      contains: () => q,
      order: () => q,
      limit: () => q,
      update: () => q,
      single: async () => ({ data: { referral_credit_applied: 0 }, error: null }),
      then: (resolve) => Promise.resolve(resolve({ data: [], error: null })),
    };
    return { from: () => q, rpc: async () => ({ data: null, error: null }) };
  },
}));

let booking;
let sent;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body });
  if (u.includes('/auth/v1/user')) return json({ id: 'client-1' });
  if (u.includes('/rest/v1/bookings') && (init.method || 'GET') === 'GET') return json([booking]);
  if (u.includes('/rest/v1/bookings') && init.method === 'PATCH')
    return json([{ ...booking, status: 'cancelled' }]);
  if (u.includes('/api/send-message')) {
    sent.push(JSON.parse(init.body));
    return json({ success: true });
  }
  return json([]);
};

const { handleClientCancel } = await import('../../api/auth.js');

// The template is not exported; lift it from the file, as the admin tests do.
const src = readFileSync(new URL('../../api/send-message.js', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n'
);
const start = src.indexOf('function buildWAMessage');
const body = src.slice(start, src.indexOf('\n}\n', start) + 2);
const buildWAMessage = new Function('waBody', `${body}\nreturn buildWAMessage;`)(() => null);

const cancel = async () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await handleClientCancel(
    { body: { access_token: 'tok', booking_id: 'bk-1', client_id: 'client-1' } },
    res
  );
  expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
  // Diego's message goes out after the client already has their answer.
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((r) => setTimeout(r, 0));
  expect(sent).toHaveLength(1);
  return { data: sent[0].data, text: buildWAMessage('client_cancelled', sent[0].data, 'es') };
};

beforeEach(() => {
  booking = {
    id: 'bk-1',
    status: 'confirmed',
    client_id: 'client-1',
    client_name: 'Ana',
    service_name: 'Tune-Up',
    scheduled_date: '2027-03-10', // far enough out to be 24h+ notice
    scheduled_time: '10:00',
    stripe_payment_intent_id: 'pi_1',
    callout_fee: 45,
    google_event_id: null,
  };
  refundCents = 4500;
  refundFails = false;
  refundCalls = [];
  sent = [];
});

describe('a client cancels with 24h+ notice', () => {
  it('Diego is told the amount Stripe actually refunded, not $20', async () => {
    const { data, text } = await cancel();
    expect(refundCalls).toEqual([{ payment_intent: 'pi_1' }]);
    expect(data).toMatchObject({ refunded: true, amount: 45 });
    expect(text).toContain('Reembolso de $45 procesado');
    expect(text).not.toContain('$20');
  });

  it('cents are kept when the fee has them', async () => {
    refundCents = 5550;
    expect((await cancel()).text).toContain('Reembolso de $55.50 procesado');
  });

  it('if Stripe fails, the amount to refund by hand is the booking own fee', async () => {
    refundFails = true;
    booking.callout_fee = 55;
    const { data, text } = await cancel();
    expect(data).toMatchObject({ refunded: false, amount: 55 });
    expect(text).toContain('Debía reembolsarse $55');
    expect(text).toContain('Revisa manualmente en Stripe');
  });

  it('a booking that charged nothing says there is nothing to refund', async () => {
    booking.stripe_payment_intent_id = null;
    booking.callout_fee = 0;
    const { text } = await cancel();
    expect(refundCalls).toHaveLength(0);
    expect(text).toContain('no hay nada que reembolsar');
    expect(text).not.toContain('Revisa manualmente en Stripe');
  });
});

describe('no flat refund amount is left in the message', () => {
  it('send-message.js quotes no "$20" refund', () => {
    expect(src).not.toMatch(/reembols\w*( de)? \$20/i);
  });
});
