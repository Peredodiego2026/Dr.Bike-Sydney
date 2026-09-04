// Audit finding (2026-09-04): api/stripe-webhook.js let a browser-supplied
// string become a stored booking field.
//
// priceForService() returns null when nothing in `services` matches - it does
// not throw. The row then fell back to `svc?.name || md.bk_service_name`, and
// bk_service_name is 120 characters copied straight out of the page
// (api/create-payment-session.js:46). js/mechanic.js rendered that field into
// innerHTML unescaped, so one $25 call-out bought persistent script execution
// in the mechanic's app.
//
// This runs the function rather than reading its source: the earlier
// webhook tests assert on shape, and a shape assertion cannot tell whether a
// refund actually happened or a row actually got written.

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_unit_tests';
process.env.SUPABASE_SERVICE_KEY = 'service_dummy_for_unit_tests';

// What the fake `services` table holds for a given test.
let servicesRows = [];
// Every row handed to bookings.insert()
const inserted = [];
const refunds = vi.fn(async () => ({ id: 're_test' }));

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.refunds = { create: refunds };
      this.webhooks = { constructEvent: () => ({}) };
    }
  },
}));

// auth.js is a 5,000-line module that opens its own clients on import. Only
// three of its functions matter here and all three are pure arithmetic from
// the caller's point of view, so they are replaced rather than exercised.
vi.mock('../../api/auth.js', () => ({
  matchCalloutZone: async () => ({ calloutFee: 25 }),
  applySurcharge: (n) => n,
  applyMembershipPricing: async (_sb, _id, _date, _svc, calloutFee) => ({ calloutFee }),
}));

vi.mock('@supabase/supabase-js', () => {
  // Minimal thenable query builder: every filter returns `this`, and awaiting
  // it resolves to whatever the table was configured to hold.
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
        if (table === 'services') return build(servicesRows);
        if (table === 'van_zones') return build([{ van_number: 1, suburb: 'Bondi' }]);
        if (table === 'profiles') return build([]);
        if (table === 'bookings') {
          const q = build([]); // no existing booking for this payment intent
          q.insert = (rows) => {
            inserted.push(rows[0]);
            return build([{ id: 'bk_created', ...rows[0] }]);
          };
          return q;
        }
        return build([]);
      },
    }),
  };
});

const { handlePaymentIntentSucceeded } = await import('../../api/stripe-webhook.js');

const XSS = '<img src=x onerror=alert(1)>';

const payment = (serviceName) => ({
  id: 'pi_unknown_service',
  amount_received: 2500,
  metadata: {
    bk_service_name: serviceName,
    bk_date: '2026-09-10',
    bk_time: '14:30',
    bk_address: '12 Test Street, Bondi NSW 2026',
    bk_name: 'Test Client',
    bk_phone: '0400000000',
  },
});

beforeEach(() => {
  servicesRows = [];
  inserted.length = 0;
  refunds.mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
});

describe('a payment naming a service that does not exist', () => {
  it('is refunded, not booked', async () => {
    const out = await handlePaymentIntentSucceeded(payment(XSS));
    expect(out).toMatchObject({ rejected: 'unknown service' });
    expect(refunds).toHaveBeenCalledWith({ payment_intent: 'pi_unknown_service' });
    expect(inserted).toHaveLength(0);
  });

  it('never lets the browser string reach the database', async () => {
    await handlePaymentIntentSucceeded(payment(XSS));
    expect(JSON.stringify(inserted)).not.toContain('onerror');
  });
});

describe('a payment naming a real service', () => {
  beforeEach(() => {
    servicesRows = [{ name: 'Tyre and Tube Installed', price: 45 }];
  });

  it('still books, and is not refunded', async () => {
    const out = await handlePaymentIntentSucceeded(payment('Tyre and Tube Installed'));
    expect(out).toMatchObject({ created: 'bk_created' });
    expect(refunds).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(1);
  });

  it('stores the name from the services table, not the one the browser sent', async () => {
    // The metadata claims a different name for a service id that resolves to a
    // real row. Whichever one wins is the one that gets stored forever.
    await handlePaymentIntentSucceeded(payment(`Tyre and Tube Installed ${XSS}`));
    expect(inserted[0].service_name).toBe('Tyre and Tube Installed');
    expect(inserted[0].service_price).toBe(45);
  });
});
