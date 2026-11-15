// Diego gets an email for every new booking (asked for on 2026-11-15).
//
// Until then the only email a booking produced went to the client. The
// owner's template - `booking_confirmation`, fixed to contact@, which forwards
// to Diego's inbox - existed in api/send-email.js and nothing ever sent it, so
// a booking made at 20:38 reached him as an SMS and, the next morning, as a
// row in the nightly backup.
//
// Both halves run for real: the template is rendered by the handler with fetch
// replaced, and the webhook's booking path is executed with the database
// faked, so a call that is written but never made fails here.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_unit_tests';
process.env.SUPABASE_SERVICE_KEY = 'service_dummy_for_unit_tests';

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.refunds = { create: vi.fn(async () => ({ id: 're_test' })) };
      this.webhooks = { constructEvent: () => ({}) };
    }
  },
}));

// Same stand-ins as webhook-unknown-service.test.js: auth.js opens its own
// clients on import and only its pricing helpers are reached from here.
vi.mock('../../api/auth.js', () => ({
  calloutFeeForAddress: async () => ({ coverage: { covered: 'in', calloutFee: 35 }, fee: 35 }),
  applySurcharge: (n) => n,
  applyMembershipPricing: async (_sb, _id, _date, _svc, calloutFee) => ({ calloutFee }),
}));

vi.mock('@supabase/supabase-js', () => {
  const build = (rows) => {
    const q = {
      select: () => q,
      eq: () => q,
      ilike: () => q,
      neq: () => q,
      limit: () => q,
      single: async () => ({ data: rows[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return q;
  };
  return {
    createClient: () => ({
      from: (table) => {
        if (table === 'services') return build([{ name: 'Standard Service', price: 159 }]);
        if (table === 'van_zones') return build([{ van_number: 1, suburb: 'Manly' }]);
        if (table === 'bookings') {
          const q = build([]);
          q.insert = (rows) => build([{ id: 'bk_created', ...rows[0] }]);
          return q;
        }
        return build([]);
      },
    }),
  };
});

const CLIENT = {
  clientName: 'Test Client',
  phone: '0400000000',
  clientEmail: 'client@example.com',
  service: 'Standard Service',
  date: '2026-11-17',
  time: '10:00',
  address: '9 Test Street, Manly 2095',
  price: 194,
  bookingId: 'c16229a8-0000-4000-8000-000000000000',
};

let sendEmail;
let handlePaymentIntentSucceeded;
let mail;
let calls;

beforeAll(async () => {
  sendEmail = (await import('../../api/send-email.js')).default;
  ({ handlePaymentIntentSucceeded } = await import('../../api/stripe-webhook.js'));
}, 30000);

beforeEach(() => {
  mail = null;
  calls = [];
  process.env.RESEND_API_KEY = 'resend-test';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      if (String(url).includes('resend.com')) mail = JSON.parse(init.body);
      return { ok: true, json: async () => ({ id: 'x' }) };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
});

// A call from the page itself: no internal token, our own Origin - the way
// js/app.js sends it after a booking.
async function fromTheBrowser(body) {
  const res = {
    statusCode: 0,
    setHeader() {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
  };
  await sendEmail(
    {
      method: 'POST',
      headers: {
        origin: 'https://drbikesydney.com.au',
        'content-type': 'application/json',
        'x-forwarded-for': '10.9.9.' + Math.floor(Math.random() * 250),
      },
      body,
    },
    res
  );
  return res;
}

describe("the owner's new-booking email", () => {
  it('goes to contact@ with everything needed to call the client', async () => {
    const res = await fromTheBrowser({ type: 'booking_confirmation', ...CLIENT });
    expect(res.statusCode).toBe(200);
    expect(mail.to).toEqual(['contact@drbikesydney.com.au']);
    expect(mail.subject).toContain('Standard Service');
    expect(mail.subject).toContain('Test Client');
    for (const v of [
      'Test Client',
      '0400000000',
      'client@example.com',
      '9 Test Street, Manly 2095',
    ])
      expect(mail.html).toContain(v);
    // With the weekday: "Monday 17" vs "Tuesday 17" is the mix-up a bare date invites.
    expect(mail.html).toContain('Tue, 17 Nov at 10:00');
  });

  it('cannot be pointed at anyone else from the browser', async () => {
    await fromTheBrowser({ type: 'booking_confirmation', ...CLIENT, to: 'someone@example.com' });
    expect(mail.to).toEqual(['contact@drbikesydney.com.au']);
  });

  it('escapes what the client typed', async () => {
    await fromTheBrowser({
      type: 'booking_confirmation',
      ...CLIENT,
      clientEmail: '<img src=x onerror=alert(1)>',
    });
    expect(mail.html).not.toContain('<img src=x');
  });
});

describe('a booking the webhook creates (the browser died after paying)', () => {
  it("also sends the owner's email, with the client's phone and email", async () => {
    const out = await handlePaymentIntentSucceeded({
      id: 'pi_owner_email',
      amount_received: 3500,
      metadata: {
        bk_service_name: 'Standard Service',
        bk_date: '2026-11-17',
        bk_time: '10:00',
        bk_address: '9 Test Street, Manly 2095',
        bk_name: 'Test Client',
        bk_phone: '0400000000',
        email: 'client@example.com',
      },
    });
    expect(out).toMatchObject({ created: 'bk_created' });
    const owner = calls.find(
      (c) => c.url.endsWith('/api/send-email') && c.body?.type === 'booking_confirmation'
    );
    expect(owner).toBeTruthy();
    expect(owner.body).toMatchObject({
      clientName: 'Test Client',
      phone: '0400000000',
      clientEmail: 'client@example.com',
      service: 'Standard Service',
      bookingId: 'bk_created',
    });
  });
});
