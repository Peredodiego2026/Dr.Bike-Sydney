// La consulta de flota (business.html y el formulario de la landing) existe
// solo como el email que le llega a Diego. Hasta el 02-nov-2026 el servidor
// contestaba 200 aunque Resend rechazara ese email, y la pagina decia
// "Enquiry sent!" con la consulta perdida.
//
// Se corre el handler real contra un Resend falso que acepta o rechaza cada
// envio, y se mira que contesta.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.RESEND_API_KEY = 'resend-test';
process.env.TURNSTILE_SECRET_KEY = 'turnstile-test';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const DIEGO = 'contact@drbikesydney.com.au';
const CLIENT = 'ana@acme.test';

// What Resend does with a send to each address: 'ok', a status code, or 'throw'.
let resend;
let mail;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const reply = (status, body) => ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  if (u.includes('turnstile')) return reply(200, { success: true });
  if (u.includes('resend.com')) {
    const m = JSON.parse(init.body);
    const outcome = resend[[].concat(m.to)[0]] ?? 'ok';
    if (outcome === 'throw') throw new Error('network down');
    if (outcome !== 'ok') return reply(outcome, { message: 'refused' });
    mail.push(m);
    return reply(200, { id: 'x' });
  }
  return reply(200, []);
};

const cron = (await import('../../api/send-cron.js')).default;

const enquire = async () => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k, v) => (res.headers[k] = v);
  await cron(
    {
      method: 'POST',
      query: { type: 'b2b' },
      body: {
        businessName: 'Acme',
        contactName: 'Ana',
        email: CLIENT,
        fleetSize: '12',
        'cf-turnstile-response': 'tok',
      },
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `10.1.0.${(Math.random() * 250) | 0}`,
      },
    },
    res
  );
  return res;
};

beforeEach(() => {
  resend = {};
  mail = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fleet enquiry delivery', () => {
  it('reports success when Diego gets it', async () => {
    const res = await enquire();
    expect(res.statusCode).toBe(200);
    expect(mail.map((m) => m.to)).toEqual([DIEGO, CLIENT]);
  });

  it('reports a failure when Resend refuses the email to Diego', async () => {
    resend[DIEGO] = 422;
    const res = await enquire();
    expect(res.statusCode).toBe(500);
    // The landing shows this text as is; business.html shows its own alert.
    expect(res.body.error).toContain('contact@drbikesydney.com.au');
    // No "we received your enquiry" for an enquiry nobody received.
    expect(mail).toEqual([]);
  });

  it('reports a failure when Resend cannot be reached', async () => {
    resend[DIEGO] = 'throw';
    const res = await enquire();
    expect(res.statusCode).toBe(500);
  });

  it('still reports success when only the confirmation to the client fails', async () => {
    resend[CLIENT] = 422;
    const res = await enquire();
    expect(res.statusCode).toBe(200);
    expect(mail.map((m) => m.to)).toEqual([DIEGO]);
    expect(console.error).toHaveBeenCalledWith(
      '[b2b] confirmation to the client failed:',
      expect.stringContaining('422')
    );
  });
});
