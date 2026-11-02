// Los ocho correos que no pasan por api/send-email.js salian solo en ingles
// hasta el 01-nov-2026: recordatorio de servicio, lo que encontro el mecanico,
// consulta de flota, bienvenida al newsletter, horario liberado, cambio de
// contrasena, links de seguimiento y el recibo.
//
// Se corre cada handler real contra un Supabase, un Resend y un fetch falsos y
// se mira el correo que habria salido: el idioma correcto, y ninguna frase en
// ingles colgando.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.INTERNAL_API_SECRET = 'internal-secret';
process.env.RESEND_API_KEY = 'resend-test';
process.env.TURNSTILE_SECRET_KEY = 'turnstile-test';
process.env.CRON_SECRET = 'cron-test';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      this.refunds = { create: async () => ({ id: 're_1', amount: 3500 }) };
    }
  },
}));

// Every chain ends in db(table, filters, 'single' | 'many').
let db;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      admin: {
        generateLink: async () => ({
          data: { properties: { action_link: 'https://example.supabase.co/verify?token=abc' } },
          error: null,
        }),
      },
    },
    from: (table) => {
      const f = {};
      const q = new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === 'eq') return (c, v) => ((f[c] = v), q);
            if (prop === 'single' || prop === 'maybeSingle')
              return async () => ({ data: db(table, f, 'single'), error: null });
            if (prop === 'upsert' || prop === 'insert') return async () => ({ error: null });
            if (prop === 'then')
              return (ok) => Promise.resolve(ok({ data: db(table, f, 'many'), error: null }));
            return () => q;
          },
        }
      );
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

// send-invoice.js sends through the Resend SDK, the rest through fetch.
vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: async (payload) => (mail.push(payload), { id: 'x' }) };
    }
  },
}));

let mail;
let restBookings;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
  if (u.includes('resend.com')) {
    mail.push(JSON.parse(init.body));
    return json({ id: 'x' });
  }
  if (u.includes('turnstile')) return json({ success: true });
  if (u.includes('/auth/v1/user')) return json({ id: 'client-1' });
  if (u.includes('/rest/v1/bookings') && (init.method || 'GET') === 'GET') return json(restBookings);
  if (u.includes('/rest/v1/bookings')) return json([{ ...restBookings[0], status: 'cancelled' }]);
  return json([]);
};

const auth = (await import('../../api/auth.js')).default;
const { handleClientCancel } = await import('../../api/auth.js');
const cron = (await import('../../api/send-cron.js')).default;
const newsletter = (await import('../../api/subscribe-newsletter.js')).default;
const invoice = (await import('../../api/send-invoice.js')).default;

const run = async (handler, { body = {}, query = {}, headers = {} } = {}) => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k, v) => (res.headers[k] = v);
  await handler(
    {
      method: 'POST',
      body,
      query,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.random() * 250 | 0}`, ...headers },
    },
    res
  );
  return res;
};

// Fire-and-forget work (the waitlist mail after a cancel) gets a few ticks.
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

const lastTo = (addr) => mail.filter((m) => [].concat(m.to).includes(addr)).at(-1);

beforeEach(() => {
  mail = [];
  restBookings = [];
  db = () => null;
});

describe('fleet enquiry echo', () => {
  it('answers in the language of the page the form was on', async () => {
    await run(cron, {
      query: { type: 'b2b' },
      body: {
        businessName: 'Acme',
        contactName: 'Ana',
        email: 'ana@acme.test',
        fleetSize: '12',
        'cf-turnstile-response': 'tok',
        lang: 'es',
      },
    });
    const echo = lastTo('ana@acme.test');
    expect(echo.subject).toBe('Recibimos tu consulta de flota — Dr. Bike Sydney');
    expect(echo.html).toContain('Gracias por tu consulta, Ana');
    expect(echo.html).toContain('Recibimos tu consulta de flota para');
    expect(echo.html).toContain('2 horas hábiles');
    expect(echo.html).not.toMatch(/We received|business hours|Sydney time/);
    // The copy to Diego stays in English.
    expect(lastTo('contact@drbikesydney.com.au').html).toContain('New B2B Fleet Enquiry');
  });

  it('stays in English with no language', async () => {
    await run(cron, {
      query: { type: 'b2b' },
      body: {
        businessName: 'Acme',
        contactName: 'Ana',
        email: 'ana@acme.test',
        fleetSize: '12',
        'cf-turnstile-response': 'tok',
      },
    });
    expect(lastTo('ana@acme.test').html).toContain('Thanks for your enquiry, Ana');
  });
});

describe('newsletter welcome', () => {
  it('is Chinese from the Chinese page', async () => {
    await run(newsletter, {
      body: { email: 'li@example.com', turnstileToken: 'tok', lang: 'zh-CN' },
    });
    const m = lastTo('li@example.com');
    expect(m.subject).toBe('订阅成功 — Dr. Bike Sydney 🚲');
    expect(m.html).toContain('感谢订阅!');
    expect(m.html).toContain('使用优惠码 <strong');
    expect(m.html).toContain('>退订<');
    expect(m.html).toContain('预订服务 →');
    expect(m.html).not.toMatch(/Thanks for subscribing|Unsubscribe|You'll receive/);
  });
});

describe("mechanic's upsell", () => {
  it('uses the booking language, and greets with no name as a bare "Hola"', async () => {
    db = (table) =>
      table === 'bookings'
        ? { service_name: 'Tune-Up', client_lang: 'es', profiles: { email: 'x@example.com', full_name: '' } }
        : null;
    await run(cron, { query: { type: 'upsell' }, body: { bookingId: 'bk-1', criticalItems: ['chain', 'brakes_front'] } });
    const m = lastTo('x@example.com');
    expect(m.subject).toBe('Tu mecánico encontró cosas que necesitan atención — Tune-Up');
    expect(m.html).toContain('>Hola, tu mecánico encontró algunas cosas');
    expect(m.html).not.toContain('there');
    expect(m.html).toContain('>Cambio de cadena<');
    expect(m.html).toContain('La cadena está estirada');
    expect(m.html).toContain('>Pastillas de freno delanteras<');
    expect(m.html).toContain('Para sumarlos a tu servicio actual, llama al');
    expect(m.html).not.toMatch(/Chain replacement|Recommended service|To add these|Book a follow-up/);
  });
});

describe('service reminder', () => {
  it('writes the date in Spanish and the copy in Spanish', async () => {
    const soon = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    db = (table, f, kind) => {
      // The date-based query is the one with a next_service_date; the
      // time-based fallbacks come back empty.
      if (table === 'bookings' && kind === 'many' && f.status === 'completed' && !mail.length)
        return [
          {
            id: 'bk-1',
            service_name: 'Tune-Up',
            next_service_date: soon,
            client_email: 'ana@example.com',
            client_name: 'Ana Perez',
            client_lang: 'es',
          },
        ];
      return kind === 'many' ? [] : null;
    };
    await run(cron, { query: { type: 'service' }, headers: { authorization: 'Bearer cron-test' } });
    const m = lastTo('ana@example.com');
    expect(m.subject).toMatch(/^Tu mecánico recomienda un servicio pronto — /);
    expect(m.html).toContain('>Hola <strong>Ana</strong>, tu próximo servicio se acerca');
    expect(m.html).toContain('Tu mecánico recomendó reservar tu próximo');
    expect(m.html).toContain('Reservar mi próximo servicio →');
    const dayName = new Date(`${soon}T00:00:00Z`).toLocaleDateString('es-ES', {
      timeZone: 'UTC',
      weekday: 'long',
    });
    expect(m.html).toContain(dayName);
    expect(m.html).not.toMatch(/Your mechanic|Regular servicing|Book your next/);
  });
});

describe('password reset', () => {
  it('is in the language the reset was asked from', async () => {
    await run(auth, { body: { role: 'request-password-reset', email: 'li@example.com', lang: 'zh' } });
    const m = lastTo('li@example.com');
    expect(m.subject).toBe('🔐 重设您的 Dr. Bike Sydney 密码');
    expect(m.html).toContain('>重设密码<');
    expect(m.html).toContain('为了您的安全，此链接将在 1 小时后失效。');
    // The link itself is never touched by the translation pass.
    expect(m.html).toContain('https://example.supabase.co/verify?token=abc');
    expect(m.html).not.toMatch(/Reset password|expires in|Didn't request/);
  });
});

describe('tracking links', () => {
  it('translates the status and writes the date in Spanish', async () => {
    restBookings = [
      {
        service_name: 'Tune-Up',
        scheduled_date: '2026-11-11',
        scheduled_time: '14:30',
        status: 'confirmed',
        tracking_token: 'tok123',
      },
    ];
    await run(auth, { body: { role: 'public-booking-list', email: 'ana@example.com', lang: 'es' } });
    const m = lastTo('ana@example.com');
    expect(m.subject).toBe('Tus enlaces de seguimiento de Dr. Bike Sydney');
    expect(m.html).toContain('<span>Confirmada</span>');
    expect(m.html).toContain('mié, 11 nov · 14:30');
    expect(m.html).toContain('Seguir esta reserva →');
    expect(m.html).toContain('track.html?token=tok123');
    expect(m.html).not.toMatch(/Track this booking|Here's every|>confirmed</);
  });
});

describe('waitlist slot opened', () => {
  it("is in the waiting client's language, time included", async () => {
    restBookings = [
      {
        id: 'bk-1',
        status: 'confirmed',
        client_id: 'client-1',
        client_email: 'ana@example.com',
        client_name: 'Ana',
        scheduled_date: '2099-03-10',
        scheduled_time: '14:30',
        stripe_payment_intent_id: null,
        completed_at: null,
      },
    ];
    db = (table, f, kind) => {
      if (table === 'waitlist' && kind === 'many')
        return [
          {
            id: 'w-1',
            client_id: 'client-9',
            client_email: 'li@example.com',
            client_name: 'Li',
            service_name: 'Tune-Up',
            preferred_date: '2099-03-10',
          },
        ];
      if (table === 'profiles' && kind === 'many') return [{ preferred_lang: 'zh' }];
      return kind === 'many' ? [] : null;
    };
    await run(handleClientCancel, {
      body: { access_token: 'tok', booking_id: 'bk-1', client_id: 'client-1' },
    });
    await settle();
    const m = lastTo('li@example.com');
    expect(m).toBeTruthy();
    expect(m.subject).toMatch(/^有空位了：/);
    expect(m.html).toContain('好消息，Li!');
    expect(m.html).toContain('有空位了：');
    expect(m.html).toContain('14:30');
    expect(m.html).toContain('&middot; Tune-Up');
    expect(m.html).toContain('>立即预订<');
    expect(m.html).not.toMatch(/Good news|Book now|A slot just/);
  });
});

describe('receipt & service report', () => {
  it('is Spanish in the email and keeps the PDF', async () => {
    db = (table, f, kind) =>
      table === 'bookings' && kind === 'single'
        ? {
            client_lang: 'es',
            pre_service_checklist: JSON.stringify({ brakes_front: 'ok', chain: 'warn' }),
            pre_service_notes: '',
            service_duration_seconds: 3600,
          }
        : null;
    const res = await run(invoice, {
      headers: { 'x-internal-token': 'internal-secret' },
      body: {
        bookingId: 'bk-1',
        to: 'ana@example.com',
        clientName: 'Ana',
        service: 'Tune-Up',
        date: '2026-11-11',
        time: '10:00',
        price: 119,
        calloutFee: 35,
        mechName: 'Diego',
        nextService: 'Your next recommended service is on 11 May 2027',
        nextServiceDate: '2027-05-11',
      },
    });
    expect(res.statusCode).toBe(200);
    const m = lastTo('ana@example.com');
    expect(m.subject).toMatch(/^Tu recibo e informe de servicio de Dr. Bike Sydney — DRBK-/);
    expect(m.html).toContain('Factura e informe de servicio');
    expect(m.html).toContain('>Facturado a<');
    expect(m.html).toContain('Visita y diagnóstico (pagado al reservar)');
    expect(m.html).toContain('>Frenos delanteros<');
    expect(m.html).toContain('✅ Bien');
    expect(m.html).toContain('⚠️ Revisar');
    expect(m.html).toContain('11 de noviembre de 2026 · 10:00');
    expect(m.html).toContain('Tu próximo servicio recomendado es el 11 de mayo de 2027');
    expect(m.html).not.toMatch(/Billed to|Service details|Rate your mechanic|Front brakes|Next service/);
    expect(m.attachments?.[0]?.contentType).toBe('application/pdf');
  });
});
