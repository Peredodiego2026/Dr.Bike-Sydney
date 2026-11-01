// Tres correos que existian y que ningun codigo mandaba hasta el 01-nov-2026:
// la cancelacion al cliente, la confirmacion de lista de espera y el aviso al
// que refirio a un amigo. Y la reprogramacion: confirmada solo si la hace el
// admin (Diego: "si admin acepta, pasalo a confirmed. No antes").
//
// Se corre el codigo real de api/auth.js contra un Supabase, un Stripe y un
// fetch falsos, y se mira lo que le habria llegado a /api/send-email. Las
// plantillas se renderizan con el api/send-email.js real.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.INTERNAL_API_SECRET = 'internal-secret';
process.env.RESEND_API_KEY = 'resend-test';

let refundFails;
let refundCalls;
vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.refunds = {
        create: async () => {
          refundCalls++;
          if (refundFails) throw new Error('card_declined');
          return { id: 're_1', amount: 4500 };
        },
      };
    }
  },
}));

// Every chain ends in db(table, filters, 'single' | 'many').
let db;
let inserts;
let insertError;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (tok) =>
        tok === 'admin'
          ? { data: { user: { id: 'admin-1', email: 'peredo.dm@gmail.com' } }, error: null }
          : { data: { user: null }, error: { message: 'bad' } },
    },
    from: (table) => {
      const f = {};
      const q = {
        select: () => q,
        eq: (c, v) => ((f[c] = v), q),
        gt: () => q,
        contains: () => q,
        order: () => q,
        limit: () => q,
        update: () => q,
        insert: async (rows) => {
          inserts.push({ table, rows });
          return { error: insertError };
        },
        single: async () => ({ data: db(table, f, 'single'), error: null }),
        then: (ok) => Promise.resolve(ok({ data: db(table, f, 'many'), error: null })),
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

let authUser;
let booking;
let emails;
let whatsapps;
let emailFails;
let resendMail;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || 'GET';
  const json = (body, ok = true) => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => '',
  });
  if (u.includes('resend.com')) {
    resendMail = JSON.parse(init.body);
    return json({ id: 'x' });
  }
  if (u.includes('/auth/v1/user')) return json(authUser);
  if (u.includes('/rest/v1/bookings') && method === 'GET') return json([booking]);
  if (u.includes('/rest/v1/bookings') && method === 'PATCH')
    return json([{ ...booking, status: 'cancelled' }]);
  if (u.includes('/api/send-email')) {
    emails.push(JSON.parse(init.body));
    return json({ ok: !emailFails }, !emailFails);
  }
  if (u.includes('/api/send-message')) {
    whatsapps.push(JSON.parse(init.body));
    return json({ success: true });
  }
  return json([]);
};

const {
  handleClientCancel,
  handleAdminCancelBooking,
  handleJoinWaitlist,
  handleApplyReferral,
  handleClientReschedule,
} = await import('../../api/auth.js');
const sendEmail = (await import('../../api/send-email.js')).default;

const run = async (handler, body) => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await handler({ body, headers: {} }, res);
  return res;
};

beforeEach(() => {
  refundFails = false;
  refundCalls = 0;
  insertError = null;
  emailFails = false;
  inserts = [];
  emails = [];
  whatsapps = [];
  resendMail = null;
  authUser = { id: 'client-1' };
  booking = {
    id: 'bk-1',
    status: 'confirmed',
    client_id: 'client-1',
    client_name: 'Ana Perez',
    client_email: 'ana@example.com',
    client_lang: 'es',
    service_name: 'Tune-Up',
    address: '1 Test St, Manly',
    scheduled_date: '2099-03-10', // 24h+ notice
    scheduled_time: '10:00',
    stripe_payment_intent_id: 'pi_1',
    callout_fee: 45,
    google_event_id: null,
    completed_at: null,
  };
  db = (table, f, kind) => {
    if (table === 'bookings' && kind === 'single') return { referral_credit_applied: 0 };
    return kind === 'single' ? null : [];
  };
});

// The client's cancel answers first; the refund and both messages follow.
const clientCancel = async () => {
  const r = await run(handleClientCancel, {
    access_token: 'tok',
    booking_id: 'bk-1',
    client_id: 'client-1',
  });
  expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
  for (let i = 0; i < 100 && !whatsapps.length; i++) await new Promise((s) => setTimeout(s, 0));
  expect(whatsapps).toHaveLength(1);
  return emails;
};

describe('a client cancels: they get an email that says what happened to the fee', () => {
  it('24h+ notice and Stripe refunded it', async () => {
    const [mail, ...rest] = await clientCancel();
    expect(rest).toEqual([]);
    expect(mail).toMatchObject({
      type: 'cancellation_client',
      to: 'ana@example.com',
      lang: 'es',
      date: '2099-03-10',
      cancelReason: 'client',
      refundState: 'refunded',
      refundAmount: 45,
    });
  });

  it('Stripe refused the refund: "we will be in touch", not "refunded"', async () => {
    refundFails = true;
    const [mail] = await clientCancel();
    expect(mail).toMatchObject({ refundState: 'contact', refundAmount: 45 });
  });

  it('under 24h: the fee is not refundable, and the email says so', async () => {
    booking.scheduled_date = '2020-01-01';
    const [mail] = await clientCancel();
    expect(mail.refundState).toBe('late');
  });

  it('nothing was charged: no fee box at all', async () => {
    booking.stripe_payment_intent_id = null;
    const [mail] = await clientCancel();
    expect(mail.refundState).toBe('');
  });

  it('no email on the booking: Diego still gets his WhatsApp', async () => {
    booking.client_email = null;
    expect(await clientCancel()).toEqual([]);
  });
});

describe('the admin cancels', () => {
  const adminCancel = (extra = {}) =>
    run(handleAdminCancelBooking, {
      access_token: 'admin',
      id: 'bk-1',
      reason: 'Mechanic unavailable — van broke down',
      reason_code: 'Mechanic unavailable',
      ...extra,
    });

  it('an upcoming booking: the client is emailed the reason, never the notes', async () => {
    const r = await adminCancel();
    expect(r.statusCode).toBe(200);
    expect(r.body.emailed).toBe(true);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      type: 'cancellation_client',
      to: 'ana@example.com',
      cancelReason: 'mechanic',
      // Without the "Refund" box ticked, nothing goes back.
      refundState: 'contact',
      refundAmount: 45,
    });
    expect(JSON.stringify(emails[0])).not.toContain('van broke down');
  });

  it('"Other" gets the neutral line', async () => {
    await adminCancel({ reason_code: 'Other' });
    expect(emails[0].cancelReason).toBe('');
  });

  it('the box unticked: no email', async () => {
    const r = await adminCancel({ notify_client: false });
    expect(r.body.emailed).toBe(null);
    expect(emails).toEqual([]);
  });

  it('a past booking or a finished job is bookkeeping: no email', async () => {
    booking.scheduled_date = '2020-01-01';
    expect((await adminCancel()).body.emailed).toBe(null);
    booking.scheduled_date = '2099-03-10';
    booking.completed_at = '2099-03-10T11:00:00Z';
    expect((await adminCancel()).body.emailed).toBe(null);
    expect(emails).toEqual([]);
  });

  it('a send that fails is reported, so the admin toast can say it', async () => {
    emailFails = true;
    expect((await adminCancel()).body.emailed).toBe(false);
  });

  it('"Refund" ticked: Stripe gives the fee back and the email says refunded', async () => {
    const r = await adminCancel({ refund: true });
    expect(refundCalls).toBe(1);
    expect(r.body).toMatchObject({ refunded: true, refund_amount: 45 });
    expect(emails[0]).toMatchObject({ refundState: 'refunded', refundAmount: 45 });
  });

  it('"Refund" unticked: no refund, "we will be in touch"', async () => {
    const r = await adminCancel({ refund: false });
    expect(refundCalls).toBe(0);
    expect(r.body.refunded).toBe(null);
    expect(emails[0].refundState).toBe('contact');
  });

  it('Stripe refuses: reported as failed, and the client is told we will be in touch', async () => {
    refundFails = true;
    const r = await adminCancel({ refund: true });
    expect(r.body.refunded).toBe(false);
    expect(emails[0].refundState).toBe('contact');
  });

  it('never refunds a finished job, or a booking nothing was charged for', async () => {
    booking.completed_at = '2099-03-10T11:00:00Z';
    expect((await adminCancel({ refund: true })).body.refunded).toBe(null);
    booking.completed_at = null;
    booking.stripe_payment_intent_id = null;
    expect((await adminCancel({ refund: true })).body.refunded).toBe(null);
    expect(refundCalls).toBe(0);
  });

  it('the client asked to cancel within 24h and no refund: "not refundable"', async () => {
    booking.scheduled_date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Sydney',
    }).format(new Date());
    booking.scheduled_time = '23:59';
    await adminCancel({ reason_code: 'Client request' });
    expect(emails[0]).toMatchObject({ cancelReason: 'client', refundState: 'late' });
  });

  it('already cancelled: a second click refunds nothing', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) =>
      String(url).includes('/rest/v1/bookings') && init.method === 'PATCH'
        ? { ok: true, status: 200, json: async () => [] }
        : realFetch(url, init);
    try {
      const r = await adminCancel({ refund: true });
      expect(r.statusCode).toBe(409);
      expect(refundCalls).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('joining the waitlist sends the confirmation', () => {
  const join = (extra = {}) =>
    run(handleJoinWaitlist, {
      access_token: 'tok',
      client_id: 'client-1',
      email: 'ana@example.com',
      name: 'Ana Perez',
      date: '2099-03-10',
      preferred_times: ['10:00'],
      ...extra,
    });

  beforeEach(() => {
    authUser = { id: 'client-1', email: 'ana@example.com', user_metadata: {} };
    db = (table, f, kind) =>
      table === 'profiles' && f.id === 'client-1'
        ? [{ preferred_lang: 'es' }]
        : kind === 'single'
          ? null
          : [];
  });

  it("in the account's language, with the raw date for send-email to format", async () => {
    expect((await join()).statusCode).toBe(200);
    expect(emails).toEqual([
      expect.objectContaining({
        type: 'waitlist_confirmation',
        to: 'ana@example.com',
        date: '2099-03-10',
        lang: 'es',
      }),
    ]);
  });

  it("to the account's own address, never to an email typed in the body", async () => {
    await join({ email: 'stranger@example.com' });
    expect(emails.map((m) => m.to)).toEqual(['ana@example.com']);
  });

  it('not signed in: no email', async () => {
    await join({ access_token: undefined });
    expect(emails).toEqual([]);
  });

  it('the insert failed: an error, not a fake "you are on the list"', async () => {
    insertError = { message: 'boom' };
    expect((await join()).statusCode).toBe(500);
    expect(emails).toEqual([]);
  });
});

describe('using a referral code tells the referrer', () => {
  let referrerContact;
  beforeEach(() => {
    authUser = { id: 'friend-1', user_metadata: { full_name: 'Maria Gonzalez Soto' } };
    referrerContact = { email: 'ana@example.com', full_name: 'Ana Perez', preferred_lang: 'zh' };
    db = (table, f, kind) => {
      if (table !== 'profiles') return kind === 'single' ? null : [];
      if (f.referral_code) return { id: 'ref-1', referral_count: 2, referral_credits: 15 };
      if (f.id === 'friend-1')
        return kind === 'single' ? { referred_by: null, referral_credits: 0 } : [];
      if (f.id === 'ref-1') return referrerContact ? [referrerContact] : [];
      return [];
    };
  });
  const apply = () => run(handleApplyReferral, { access_token: 'tok', referral_code: 'ana15' });

  it('first name, the friend as "Maria G.", the new count, the referrer language', async () => {
    expect((await apply()).statusCode).toBe(200);
    expect(emails).toEqual([
      expect.objectContaining({
        type: 'referral_success',
        to: 'ana@example.com',
        name: 'Ana',
        friendName: 'Maria G.',
        referralCount: 3,
        lang: 'zh',
      }),
    ]);
  });

  it('a friend with no name is "a friend", not "Dr. Bike client"', async () => {
    authUser.user_metadata = {};
    await apply();
    expect(emails[0].friendName).toBe('');
  });

  it('no address for the referrer: the referral still goes through', async () => {
    referrerContact = null;
    expect((await apply()).statusCode).toBe(200);
    expect(emails).toEqual([]);
  });
});

// ── The templates, rendered ────────────────────────────────────────────────
const render = async (body) => {
  const res = {
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
        'x-internal-token': 'internal-secret',
        'content-type': 'application/json',
        'x-forwarded-for': '10.9.9.' + Math.floor(Math.random() * 250),
      },
      body: {
        to: 'ana@example.com',
        name: 'Ana',
        service: 'Tune-Up',
        date: '2099-03-10',
        time: '10:00',
        address: '1 Test St, Manly',
        bookingId: 'bk-1',
        lang: 'en',
        ...body,
      },
    },
    res
  );
  expect(resendMail, JSON.stringify(res.body)).toBeTruthy();
  return resendMail;
};

describe('the cancellation email', () => {
  it('a refund, in Spanish, with the real amount and no "5-7 days" promise', async () => {
    const { html } = await render({
      type: 'cancellation_client',
      lang: 'es',
      cancelReason: 'client',
      refundState: 'refunded',
      refundAmount: 45,
    });
    expect(html).toContain('tu reserva fue cancelada como pediste.');
    expect(html).toContain('Te devolvimos los $45.00 de la tarifa de visita.');
    expect(html).not.toContain('5–7');
    expect(html).not.toMatch(/refunded|visit fee/);
  });

  it("the admin's reason: no mechanic, in Chinese", async () => {
    const { html } = await render({
      type: 'cancellation_client',
      lang: 'zh',
      cancelReason: 'mechanic',
      refundState: 'contact',
      refundAmount: 45,
    });
    expect(html).toContain('该时段没有可用的技师');
    expect(html).toContain('关于您已支付的 $45.00 上门费，我们会与您联系。');
  });

  it('no amounts: the callers send no price, and "Total $0" read as a bill', async () => {
    const { html } = await render({
      type: 'cancellation_client',
      refundState: 'refunded',
      refundAmount: 45,
    });
    expect(html).not.toContain('Total');
    expect(html).not.toContain('Net amount');
    expect(html).toContain('Tune-Up');
  });

  it('late: not refundable', async () => {
    const { html } = await render({ type: 'cancellation_client', refundState: 'late' });
    expect(html).toContain('not refundable under our terms');
  });

  it('nothing paid: no fee box; an unknown reason: the neutral line', async () => {
    const { html } = await render({ type: 'cancellation_client', cancelReason: 'constructor' });
    expect(html).toContain('</strong>, your booking has been cancelled.</p>');
    expect(html).not.toContain('Visit fee');
    expect(html).not.toContain('function');
  });
});

describe('the waitlist and referral emails', () => {
  it('the waitlist no longer promises a 30-minute hold that does not exist', async () => {
    const { html } = await render({ type: 'waitlist_confirmation', lang: 'es' });
    expect(html).not.toMatch(/30 min/);
    expect(html).toContain('Se lo lleva quien reserve primero');
  });

  it('the referral says "used your code", which is when the credit is given', async () => {
    const { html } = await render({ type: 'referral_success', friendName: 'Maria G.', lang: 'es' });
    expect(html).toContain('Maria G. acaba de usar tu código de referido.');
  });
});

describe('reschedule: confirmed only when the admin did it', () => {
  it('moved by the admin: "Rescheduled and confirmed"', async () => {
    const mail = await render({ type: 'rescheduled', newDate: '2099-03-11', newTime: '10:00' });
    expect(mail.subject).toContain('📅 New time confirmed —');
    expect(mail.html).toContain('Rescheduled and confirmed');
  });

  it('moved by the client: received, waiting for us - in Spanish too', async () => {
    const mail = await render({
      type: 'rescheduled',
      newDate: '2099-03-11',
      newTime: '10:00',
      confirmed: false,
      lang: 'es',
    });
    expect(mail.subject).toContain('📅 Reserva reprogramada —');
    expect(mail.html).toContain('Recibimos tu nuevo horario');
    expect(mail.html).toContain('Te la confirmamos en breve.');
    expect(mail.html).not.toContain('confirmada');
  });

  const auth = readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
  const core = auth.slice(
    auth.indexOf('async function rescheduleBookingCore'),
    auth.indexOf('const RESCHEDULE_BOOKING_COLS')
  );

  it('the booking: admin -> confirmed, client -> pending', () => {
    expect(core).toContain("if (!byClient) updatePayload.status = 'confirmed';");
    expect(core).toContain("else if (moved) updatePayload.status = 'pending';");
    expect(core).toContain('confirmed: !byClient');
  });

  it("a client's move reaches Diego on WhatsApp", () => {
    expect(core).toMatch(
      /if \(byClient\) \{\s+await fetch\(`\$\{SELF_BASE_URL\}\/api\/send-message/
    );
    expect(core).toContain("template: 'client_rescheduled'");
    const msg = readFileSync(new URL('../../api/send-message.js', import.meta.url), 'utf8');
    expect(msg).toContain("'client_rescheduled',");
    expect(msg).toContain("case 'client_rescheduled':");
  });
});

// The app used to change only the date and time on its card, so a confirmed
// booking the client had just moved still said "Confirmed" until a reload.
describe("a client reschedules: the answer carries the booking's new state", () => {
  const reschedule = (time) =>
    run(handleClientReschedule, {
      access_token: 'tok',
      booking_id: 'bk-1',
      client_id: 'client-1',
      scheduled_date: '2099-03-11',
      scheduled_time: time,
    });

  it('moved: pending, with the new time and the fee it was saved with', async () => {
    const r = await reschedule('11:00');
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
    expect(r.body.booking).toEqual({
      status: 'pending',
      scheduled_date: '2099-03-11',
      scheduled_time: '11:00',
      callout_fee: 45,
    });
  });

  it('same slot sent again: the status it already had', async () => {
    booking.scheduled_date = '2099-03-11';
    const r = await reschedule('10:00');
    expect(r.body.booking.status).toBe('confirmed');
  });

  it('the app applies it to the card', () => {
    const app = readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
    expect(app).toMatch(
      /Object\.assign\(\s*booking,\s*\{ scheduled_date: newDate, scheduled_time: newTime \},\s*d\.booking\s*\);/
    );
  });
});
