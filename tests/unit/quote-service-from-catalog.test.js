// A live bug found while closing audit finding 2, and fixed on Diego's call
// (2026-09-04). Not in the auditor's report.
//
// handleRequestQuote wrote the enquiry straight into `bookings`:
//
//   service_name: String(service_name).slice(0, 120),
//   service_price: Number(service_price) || 0,
//
// Both off the request body. That was the SECOND route by which a browser
// could choose what goes in bookings.service_name - docs/PENDIENTES.md 93
// closed the first, in the Stripe webhook - and unlike that one it cost
// nothing, because an enquiry is never charged. `service_id` was already
// being sent by js/app.js and was simply never read.
//
// This RUNS the handler with a fake Supabase and asserts on the row that was
// actually written. Reading the source for "svc.name" would pass on a handler
// that resolved the service and then wrote the body's copy anyway.

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';

const CATALOGUE = { name: 'Tune-Up', price: 109 };
// What the fake `services` table answers with. null = no such service.
let serviceRow = CATALOGUE;
const inserted = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: (table) => {
      if (table === 'services') {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: serviceRow, error: null }),
        };
        return q;
      }
      return {
        insert: (rows) => {
          inserted.push(rows[0]);
          return {
            select: () => ({ single: async () => ({ data: { id: 'bk-1' }, error: null }) }),
          };
        },
      };
    },
  }),
}));

const { handleRequestQuote } = await import('../../api/auth.js');

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
}

const XSS = '<img src=x onerror=alert(1)>';

const call = (over = {}) => {
  const res = makeRes();
  return handleRequestQuote(
    {
      body: {
        service_id: 'svc-1',
        service_name: 'Tune-Up',
        service_price: 109,
        scheduled_date: '2026-09-10', // a Thursday - no surcharge
        scheduled_time: '14:30',
        address: '12 Test Street, Bondi NSW 2026',
        client_name: 'Test Client',
        client_phone: '0400000000',
        ...over,
      },
    },
    res
  ).then(() => res);
};

beforeEach(() => {
  serviceRow = CATALOGUE;
  inserted.length = 0;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});

describe('an ordinary enquiry', () => {
  it('is saved', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe('quote_requested');
  });

  it('costs nothing - an enquiry is not a booking', async () => {
    await call();
    expect(inserted[0].callout_fee).toBe(0);
  });
});

describe('the name the browser sent', () => {
  it('never reaches the database', async () => {
    await call({ service_name: `Tune-Up ${XSS}` });
    expect(inserted[0].service_name).toBe('Tune-Up');
    expect(JSON.stringify(inserted)).not.toContain('onerror');
  });

  it('is replaced by the catalogue name even when the id resolves to a different one', async () => {
    serviceRow = { name: 'Brake Service', price: 75 };
    await call({ service_name: 'Tune-Up' });
    expect(inserted[0].service_name).toBe('Brake Service');
  });
});

describe('the price the browser sent', () => {
  it('is ignored in favour of the catalogue price', async () => {
    await call({ service_price: 1 });
    expect(inserted[0].service_price).toBe(109);
  });

  it('is ignored when it is inflated too', async () => {
    await call({ service_price: 99999 });
    expect(inserted[0].service_price).toBe(109);
  });

  it('still carries the Sunday surcharge a real enquiry would show', async () => {
    // 2026-09-13 is a Sunday. js/app.js shows applySurcharge(price, date) on
    // the quote screen, so the row has to land on the same number.
    await call({ scheduled_date: '2026-09-13' });
    expect(inserted[0].service_price).toBeCloseTo(109 * 1.2, 2);
  });
});

describe('a service that is not in the catalogue', () => {
  beforeEach(() => {
    serviceRow = null;
  });

  it('is refused rather than saved with whatever was typed', async () => {
    const res = await call({ service_name: XSS });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Unknown service');
    expect(inserted).toHaveLength(0);
  });
});

describe("Diego's WhatsApp", () => {
  it('shows the catalogue name, not the one from the browser', async () => {
    await call({ service_name: `Tune-Up ${XSS}` });
    const sent = globalThis.fetch.mock.calls.find((c) => String(c[0]).includes('send-message'));
    expect(sent, 'no WhatsApp notification was sent').toBeTruthy();
    const body = JSON.parse(sent[1].body);
    expect(body.data.service).toBe('Tune-Up');
    expect(JSON.stringify(body)).not.toContain('onerror');
  });
});
