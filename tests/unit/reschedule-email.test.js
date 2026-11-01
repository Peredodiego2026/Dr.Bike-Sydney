// El correo de "tu reserva cambio de hora" (diseno V04, elegido por Diego el
// 01-nov-2026), renderizado de verdad: se ejecuta api/send-email.js con fetch
// reemplazado y se mira lo que se le habria mandado a Resend. Mismo metodo que
// shop-order-email.test.js.
//
// Hasta ese dia mover una reserva no le avisaba nada al cliente: Diego movio la
// de Andrew Madry desde el admin y el cliente se entero preguntando por
// WhatsApp. Y la base no guardaba la fecha anterior.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let mail = null;
let handler;

beforeAll(async () => {
  handler = (await import('../../api/send-email.js')).default;
}, 30000);

beforeEach(() => {
  mail = null;
  process.env.INTERNAL_API_SECRET = 'internal-test';
  process.env.RESEND_API_KEY = 'resend-test';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      if (String(url).includes('resend.com')) mail = JSON.parse(init.body);
      return { ok: true, json: async () => ({ id: 'x' }) };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.INTERNAL_API_SECRET;
  delete process.env.RESEND_API_KEY;
});

async function render(body) {
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
  await handler(
    {
      method: 'POST',
      headers: {
        'x-internal-token': 'internal-test',
        'content-type': 'application/json',
        'x-forwarded-for': '10.8.8.' + Math.floor(Math.random() * 250),
      },
      body: {
        type: 'rescheduled',
        to: 'andrew@example.com',
        name: 'Andrew',
        service: 'Standard Service',
        address: '27 Balgowlah Road, Manly',
        bookingId: 'f3848a24-c6ee-496d-8f65-7f066935b306',
        newDate: '2026-11-11',
        newTime: '10:00',
        oldDate: '2026-11-05',
        oldTime: '14:00',
        durationMin: 90,
        lang: 'en',
        ...body,
      },
    },
    res
  );
  return { res, mail };
}

describe('el correo de reprogramacion', () => {
  it('sale con su plantilla, no con la de confirmacion', async () => {
    const { res, mail } = await render({});
    expect(res.statusCode).toBe(200);
    expect(mail.to).toEqual(['andrew@example.com']);
    expect(mail.subject).toBe('📅 New time confirmed — Standard Service · Wed, 11 Nov');
    expect(mail.html).toContain('Rescheduled and confirmed');
    expect(mail.html).not.toContain('Booking confirmed!');
  });

  it('el bloque de fecha dice NOV / 11 / Wed y la hora nueva', async () => {
    const { mail } = await render({});
    expect(mail.html).toContain('>NOV<');
    expect(mail.html).toContain('>11<');
    expect(mail.html).toContain('>Wed<');
    expect(mail.html).toMatch(/10:00\s?am · Standard Service/);
    expect(mail.html).toContain('27 Balgowlah Road, Manly');
  });

  it('muestra el horario anterior tachado', async () => {
    const { mail } = await render({});
    expect(mail.html).toMatch(
      /Previous slot: <span style="text-decoration:line-through">Thu, 5 Nov · 2:00\s?pm<\/span>/
    );
  });

  it('sin fecha anterior no inventa una', async () => {
    const { mail } = await render({ oldDate: '', oldTime: '' });
    expect(mail.html).not.toContain('Previous slot');
  });

  it('el boton de calendario lleva la hora de Sydney y la duracion del servicio', async () => {
    const { mail } = await render({});
    expect(mail.html).toContain(
      'href="https://calendar.google.com/calendar/render?action=TEMPLATE'
    );
    expect(mail.html).toContain(
      '&amp;dates=20261111T100000/20261111T113000&amp;ctz=Australia/Sydney'
    );
    expect(mail.html).toContain('href="tel:+61433963250"');
  });

  it('el nombre del cliente se escapa', async () => {
    const { mail } = await render({ name: '<img src=x onerror=alert(1)>' });
    expect(mail.html).not.toContain('<img src=x');
  });

  it('una hora rara no rompe el correo, solo saca el boton de calendario', async () => {
    const { res, mail } = await render({ newTime: 'soon' });
    expect(res.statusCode).toBe(200);
    expect(mail.html).toContain('Rescheduled and confirmed');
    expect(mail.html).not.toContain('calendar.google.com');
  });

  it('llega en espanol', async () => {
    const { mail } = await render({ lang: 'es' });
    expect(mail.subject.startsWith('📅 Nueva hora confirmada — Standard Service · ')).toBe(true);
    expect(mail.html).toContain('Reprogramada y confirmada');
    expect(mail.html).toContain('>Hola <strong');
    expect(mail.html).toContain('tu cita tiene nueva fecha y hora');
    expect(mail.html).toContain('>Agregar al calendario<');
    expect(mail.html).toContain('>Llámanos<');
    expect(mail.html).toContain('Horario anterior:');
    expect(mail.html).toContain('>NOV<');
    expect(mail.html).not.toContain('Rescheduled and confirmed');
  });

  it('llega en chino', async () => {
    const { mail } = await render({ lang: 'zh' });
    expect(mail.subject.startsWith('📅 新时间已确认 — ')).toBe(true);
    expect(mail.html).toContain('已改期并确认');
    expect(mail.html).toContain('>添加到日历<');
    expect(mail.html).toContain('原时段：');
    expect(mail.html).toContain('11月');
  });
});

describe('los correos en espanol y chino ya no mezclan ingles', () => {
  const booking = {
    type: 'confirmation',
    date: 'mié, 11 nov',
    time: '10:00',
    price: 194,
    calloutPaid: 35,
  };

  it('la confirmacion: titulo, el parrafo del pago y lo ya pagado', async () => {
    const { mail } = await render({ ...booking, lang: 'es' });
    expect(mail.html).toContain('¡Reserva confirmada!');
    expect(mail.html).toContain('El resto se paga al terminar');
    expect(mail.html).toContain('Visita y diagnóstico &mdash; ya pagado');
    expect(mail.html).not.toMatch(/Booking confirmed!|The rest is paid|already paid/);
  });

  it('el nombre del servicio no se traduce: "Standard Service", no "Standard Servicio"', async () => {
    for (const lang of ['es', 'zh']) {
      const { mail } = await render({ ...booking, lang });
      expect(mail.html).toContain('Standard Service');
      expect(mail.html).not.toMatch(/Standard (Servicio|服务)/);
    }
    // pero la etiqueta de la tabla si
    expect((await render({ ...booking, lang: 'es' })).mail.html).toContain('>Servicio<');
  });

  it('la resena ya no dice "Hola Andrew, your Standard Service"', async () => {
    const { mail } = await render({ type: 'review_request', lang: 'es' });
    expect(mail.html).toContain(', tu <strong>Standard Service</strong> está listo');
    expect(mail.html).toContain('¿Qué tal el servicio?');
  });

  it('los titulos de cabecera se traducen en chino', async () => {
    const { mail } = await render({ type: 'abandoned_recovery', lang: 'zh', date: 'Wed 11 Nov' });
    expect(mail.html).toContain('还在考虑吗？');
    expect(mail.html).not.toContain('Still thinking about it?');
  });
});

describe('rescheduleBookingCore - avisa, guarda el historial y reinicia los recordatorios', () => {
  const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');
  const core = authjs.match(/async function rescheduleBookingCore\([\s\S]*?\n\}/)[0];

  it('le manda al cliente el correo rescheduled con la fecha anterior', () => {
    expect(core).toMatch(/type: 'rescheduled'/);
    expect(core).toMatch(/oldDate,\s*oldTime,/);
    expect(core).toMatch(/'x-internal-token'/);
  });

  it('guarda el cambio en booking_reschedules con quien lo hizo', () => {
    expect(core).toMatch(/rest\/v1\/booking_reschedules/);
    expect(core).toMatch(/changed_by: byClient \? 'client' : 'admin'/);
  });

  it('los recordatorios vuelven a salir para la hora nueva', () => {
    expect(core).toMatch(/reminder_days_sent = false/);
    expect(core).toMatch(/reminder_2h_sent = false/);
  });

  it('los dos llamadores leen las columnas que el core necesita (callout_fee incluido)', () => {
    const cols = authjs.match(/const RESCHEDULE_BOOKING_COLS =\s*([\s\S]*?);/)[1];
    for (const c of [
      'callout_fee',
      'scheduled_date',
      'scheduled_time',
      'client_email',
      'client_lang',
    ])
      expect(cols).toContain(c);
    const client = authjs.match(/async function handleClientReschedule\([\s\S]*?\n\}/)[0];
    const admin = authjs.match(/async function handleAdminReschedule\([\s\S]*?\n\}/)[0];
    expect(client).toContain('RESCHEDULE_BOOKING_COLS');
    expect(admin).toContain('RESCHEDULE_BOOKING_COLS');
  });
});

describe('la fecha de cada correo se escribe en el idioma del cliente', () => {
  it('una fecha YYYY-MM-DD sale como "mié, 11 nov" en espanol y "Wed, 11 Nov" en ingles', async () => {
    const es = (
      await render({
        type: 'confirmation',
        date: '2026-11-11',
        time: '10:00',
        price: 194,
        lang: 'es',
      })
    ).mail;
    expect(es.subject).toBe('✅ Reserva confirmada — Standard Service · mié, 11 nov');
    expect(es.html).toContain('mié, 11 nov · 10:00');
    const en = (
      await render({
        type: 'confirmation',
        date: '2026-11-11',
        time: '10:00',
        price: 194,
        lang: 'en',
      })
    ).mail;
    expect(en.html).toContain('Wed, 11 Nov · 10:00');
    expect(en.html).not.toContain('2026-11-11');
  });

  it('una fecha que no es YYYY-MM-DD queda como vino', async () => {
    const { mail } = await render({
      type: 'upcoming',
      date: 'Friday 13 Nov',
      time: '10:00',
      lang: 'en',
    });
    expect(mail.html).toContain('Friday 13 Nov');
  });

  it('la reserva abandonada ya no deja un "for" en ingles', async () => {
    const es = (
      await render({
        type: 'abandoned_recovery',
        date: '2026-11-11',
        time: '10:00',
        price: 159,
        lang: 'es',
      })
    ).mail;
    expect(es.html).toContain(
      '<strong>Standard Service</strong> para el <strong>mié, 11 nov</strong> pero no la terminaste'
    );
    const zh = (
      await render({
        type: 'abandoned_recovery',
        date: '2026-11-11',
        time: '10:00',
        price: 159,
        lang: 'zh',
      })
    ).mail;
    expect(zh.html).not.toMatch(/ for </);
    expect(es.html).toContain('mié, 11 nov · 10:00');
    expect(es.html).not.toContain(' at 10:00');
  });

  const read = (f) => readFileSync(join(root, 'api', f), 'utf8');
  const fn = (src, name) => src.match(new RegExp(`async function ${name}\\([\\s\\S]*?\\n\\}`))[0];
  for (const [file, name] of [
    ['send-cron.js', 'handleAdvanceReminders'],
    ['send-cron.js', 'handleAbandoned'],
    ['send-reminders.js', 'handle2hReminders'],
  ]) {
    it(`${name} manda la fecha cruda y el idioma de la reserva`, () => {
      const body = fn(read(file), name);
      expect(body).toMatch(/client_lang/);
      expect(body).toMatch(/date: b\.scheduled_date/);
      expect(body).toMatch(/lang: b\.client_lang/);
      // The SMS of the advance reminder keeps its English label; the email may not.
      const email = body.slice(body.indexOf('/api/send-email'));
      expect(email.slice(0, email.indexOf('}),'))).not.toContain('dateLabel');
    });
  }

  it('handleAbandonedCheckout manda la fecha cruda', () => {
    expect(fn(read('send-cron.js'), 'handleAbandonedCheckout')).toMatch(/date: a\.scheduled_date/);
  });

  it('la confirmacion del webhook dice cuanto ya se pago', () => {
    const notify = fn(read('stripe-webhook.js'), 'notifyNewBooking');
    expect(notify).toMatch(/calloutPaid: Number\(booking\.callout_fee/);
  });
});

describe('los avisos de pago de la membresia llegan en el idioma del socio', () => {
  // No hay reserva de donde send-email saque el idioma, asi que sin `lang`
  // salian siempre en ingles.
  const hook = readFileSync(join(root, 'api', 'stripe-webhook.js'), 'utf8');
  for (const type of ['payment_failed', 'payment_action_required']) {
    it(type, () => {
      const at = hook.indexOf(`type: '${type}'`);
      const block = hook.slice(hook.lastIndexOf('.select(', at), hook.indexOf('}),', at));
      expect(block).toMatch(/\.select\('[^']*preferred_lang[^']*'\)/);
      expect(block).toMatch(/lang: profile\.preferred_lang/);
    });
  }

  it('el aviso de pago fallido llega en espanol', async () => {
    const { mail } = await render({
      type: 'payment_failed',
      name: 'Andrew',
      price: 67,
      attemptCount: 1,
      lang: 'es',
    });
    expect(mail.html).toContain('Intento número 1');
    expect(mail.html).not.toContain('This is attempt');
  });
});

describe('el correo de reserva abandonada no le llega a quien ya pago', () => {
  it('handleAbandoned solo mira reservas sin pago', () => {
    const cron = readFileSync(join(root, 'api', 'send-cron.js'), 'utf8');
    const fn = cron.match(/async function handleAbandoned\([\s\S]*?\n\}/)[0];
    expect(fn).toMatch(/\.is\('stripe_payment_intent_id', null\)/);
  });
});
