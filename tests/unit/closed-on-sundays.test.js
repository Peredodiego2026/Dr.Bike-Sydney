// Monday to Saturday, 8am to 5pm - closed on Sundays.
//
// Diego, 12-nov-2026, while getting the Google Business Profile back: "que sea
// de lunes a sabado de 8 a 17". Google disabled the profile for "deceptive
// content", and the profile said 9-16 with Mondays and Tuesdays closed while
// the site said every day 8-5. Both now say the same thing, and the booking
// calendar stops selling the day the business says it is closed.
//
// The handlers are RUN, not grepped: a gate that sat after the Stripe charge
// would pass a grep and still take the money.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const SERVICE = { id: 'svc-1', name: 'Tune-Up', price: 119, duration_max: 60 };
let rows = [];

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.paymentIntents = { retrieve: async (id) => ({ id, status: 'succeeded', amount: 2500 }) };
      this.checkout = { sessions: { retrieve: async () => ({}) } };
      this.refunds = { create: async () => ({ id: 're_1' }) };
    }
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: (t) => {
      const q = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        is: () => q,
        in: () => q,
        gte: () => q,
        lte: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: t === 'services' ? SERVICE : null, error: null }),
        single: async () => ({ data: { id: 'bk-1' }, error: null }),
        then: (r) => r({ data: t === 'services' ? [SERVICE] : [], error: null }),
        insert: (x) => {
          rows.push(Array.isArray(x) ? x[0] : x);
          return { select: () => ({ single: async () => ({ data: { id: 'bk-1' }, error: null }) }) };
        },
        update: () => q,
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

// No closed window set; every other fetch fails, which keeps OSRM and
// Nominatim out of the suite.
globalThis.fetch = async (url) => {
  if (String(url).includes('__setting_closed_until__')) {
    return { ok: true, json: async () => [] };
  }
  return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
};

const { handleCreateBooking, handleGetAvailability, firstOpenSlot, isClosedDay } = await import(
  '../../api/auth.js'
);

const SUNDAY = '2026-11-15';
const SATURDAY = '2026-11-14';
const MONDAY = '2026-11-16';

const makeRes = () => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
};

const book = async (scheduled_date) => {
  const res = makeRes();
  await handleCreateBooking(
    {
      body: {
        access_token: null,
        client_name: 'Test Client',
        client_email: 'client@example.com',
        client_phone: '0400000000',
        client_lang: 'en',
        service_id: 'svc-1',
        service_name: SERVICE.name,
        scheduled_date,
        scheduled_time: '09:00',
        address: '12 Myoora Rd, Terrey Hills NSW 2084',
        hold_only: true,
      },
    },
    res
  );
  return res;
};

let seq = 0;
const slotsFor = async (date) => {
  const res = makeRes();
  await handleGetAvailability(
    {
      method: 'GET',
      headers: { 'x-forwarded-for': `10.1.0.${++seq}` },
      query: { role: 'get-availability', date },
    },
    res
  );
  return res;
};

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));

beforeEach(() => {
  rows = [];
});

describe('isClosedDay', () => {
  it('is Sunday and only Sunday', () => {
    expect(isClosedDay(SUNDAY)).toBe(true);
    expect(isClosedDay(SATURDAY)).toBe(false);
    expect(isClosedDay(MONDAY)).toBe(false);
  });

  it('a value that is not a date closes nothing', () => {
    expect(isClosedDay('')).toBe(false);
    expect(isClosedDay(undefined)).toBe(false);
    expect(isClosedDay('soon')).toBe(false);
  });
});

describe('a client cannot book a Sunday', () => {
  it('refuses it before anything is written, and says why', async () => {
    const res = await book(SUNDAY);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/closed on Sundays/);
    expect(rows.length, 'a row was written for a Sunday').toBe(0);
  });

  it('Saturday is an ordinary working day', async () => {
    const res = await book(SATURDAY);
    expect(res.statusCode, JSON.stringify(res.body)).not.toBe(409);
  });
});

describe('the calendar offers no time on a Sunday', () => {
  it('every slot of a Sunday comes back unavailable', async () => {
    const res = await slotsFor(SUNDAY);
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.filter((s) => s.available)).toEqual([]);
  });

  it('the Saturday before it is open', async () => {
    const res = await slotsFor(SATURDAY);
    expect(res.body.some((s) => s.available)).toBe(true);
  });

  it('"Next available" skips the Sunday', () => {
    expect(
      firstOpenSlot({
        dates: [SUNDAY, MONDAY],
        bookings: [],
        overrides: [],
        vans: [1],
        durationByService: {},
        todayStr: '2026-11-13',
        nowMin: 0,
        shutUntil: null,
      })
    ).toEqual({ date: MONDAY, time: '8:00 AM' });
  });
});

// The hours are written in a dozen places. Google compares them with the
// profile; a client compares them with the calendar.
describe('every surface states the same hours', () => {
  const pages = [
    'landing.html',
    'index.html',
    'business.html',
    'shop.html',
    'terms.html',
    'privacy.html',
    ...['es', 'zh'].map((l) => `${l}/business.html`),
    ...readdirSync('.').filter((f) =>
      ['bondi', 'cbd', 'inner-west', 'north-shore', 'northern-beaches'].some(
        (s) => f === `${s}.html`
      )
    ),
  ];
  const sources = [
    ...pages,
    'js/app.js',
    'js/shop-desktop.js',
    'js/i18n-es.js',
    'js/i18n-zh.js',
    'api/chat.js',
    'api/send-email.js',
    'api/_email-i18n.js',
    'scripts/generate-suburb-pages.mjs',
    'og-image.svg',
  ];

  it.each(pages.filter((p) => readFileSync(p, 'utf8').includes('"openingHours"')))(
    '%s declares Mo-Sa 08:00-17:00 to search engines',
    (page) => {
      const declared = [...readFileSync(page, 'utf8').matchAll(/"openingHours":"([^"]+)"/g)].map(
        (m) => m[1]
      );
      expect(declared).toEqual(declared.map(() => 'Mo-Sa 08:00-17:00'));
    }
  );

  // The phrases the site used for "open on Sundays", in all three languages.
  const SAYS_SUNDAY_OPEN =
    /Mon\s*(?:-|–|&ndash;)\s*Sun|Monday\s*-\s*Sunday|every day (?:from )?8|Mo-Su|lunes a domingo|Lun\s*-\s*Dom|lun–dom|todos los días de 8|周一至周日|每天 8/;

  it.each(sources)('%s never says the business is open on Sundays', (file) => {
    const hit = readFileSync(file, 'utf8').match(SAYS_SUNDAY_OPEN);
    expect(hit && hit[0], `${file} still says Sunday is a working day`).toBeNull();
  });
});
