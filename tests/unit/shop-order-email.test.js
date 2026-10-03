// El email de "pedido recibido" de la tienda LEBYCLE, renderizado de verdad:
// se ejecuta api/send-email.js con fetch reemplazado y se mira lo que se le
// habria mandado a Resend.
//
// Los nombres de producto vienen del catalogo y el nombre del cliente de su
// propio formulario. Los dos terminan dentro de un HTML que se manda desde
// nuestro dominio verificado, asi que se escapan como todo lo demas.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

let mail = null;
let handler;

// Una sola vez y con margen: la primera importacion de send-email.js (Sentry,
// Supabase) tarda, y con toda la bateria corriendo en paralelo pasaba de los
// 5 segundos de un test. Fallaba siempre el primero, y solo a veces.
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
  const res = { statusCode: 0, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler(
    {
      method: 'POST',
      headers: { 'x-internal-token': 'internal-test', 'content-type': 'application/json', 'x-forwarded-for': '10.9.9.' + Math.floor(Math.random() * 250) },
      body: {
        type: 'shop_order',
        to: 'ana@example.com',
        name: 'Ana',
        orderRef: 'ab12cd34',
        mode: 'test',
        shipping: 0,
        total: 41.9,
        items: [
          { name: 'Inner tube <img src=x onerror=alert(1)>', variant: '700c Presta 48 mm', qty: 2, line_total: 13.9 },
          { name: 'Brake pads', variant: '', qty: 1, line_total: '28.00' },
        ],
        ...body,
      },
    },
    res
  );
  return { res, mail };
}

describe('el email del pedido', () => {
  it('sale con su propia plantilla, no con la de reservas', async () => {
    const { mail } = await render({});
    expect(mail.subject).toBe('📦 Order received — #AB12CD34');
    expect(mail.html).toContain('Order received!');
    expect(mail.html).not.toContain('Booking confirmed');
    expect(mail.to).toEqual(['ana@example.com']);
  });

  it('lista cada linea con su cantidad y su importe', async () => {
    const { mail } = await render({});
    expect(mail.html).toContain('2 &times; Inner tube');
    expect(mail.html).toContain('700c Presta 48 mm');
    expect(mail.html).toContain('$13.90');
    expect(mail.html).toContain('$28.00');
    expect(mail.html).toContain('$41.90 AUD');
  });

  it('escapa lo que viene del catalogo', async () => {
    const { mail } = await render({});
    expect(mail.html).not.toContain('<img src=x');
  });

  it('dice que es de prueba solo cuando lo es', async () => {
    expect((await render({ mode: 'test' })).mail.html).toContain('Test order &mdash; no money was taken.');
    expect((await render({ mode: 'live' })).mail.html).not.toContain('Test order');
  });

  it('el envio aparece solo cuando se cobra', async () => {
    expect((await render({ shipping: 0 })).mail.html).not.toContain('>Shipping<');
    expect((await render({ shipping: 9.5, total: 51.4 })).mail.html).toContain('$9.50');
  });

  it('llega traducido', async () => {
    const es = (await render({ lang: 'es' })).mail;
    expect(es.subject).toBe('📦 Pedido recibido — #AB12CD34');
    expect(es.html).toContain('Gracias por tu pedido,');
    expect(es.html).toContain('Total pagado');
    const zh = (await render({ lang: 'zh' })).mail;
    expect(zh.html).toContain('感谢您的订单');
  });
});

describe('el email de enviado', () => {
  const shipped = (extra) => render({ type: 'shop_shipped', items: undefined, carrier: 'AusPost', trackingNumber: 'AP 123', ...extra });

  it('lleva el numero de seguimiento y el transportista', async () => {
    const { mail } = await shipped({});
    expect(mail.subject).toBe('🚚 Your order is on its way — #AB12CD34');
    expect(mail.html).toContain('AP 123');
    expect(mail.html).toContain('AusPost');
  });

  it('el boton aparece solo con un link https', async () => {
    const ok = (await shipped({ trackingUrl: 'https://auspost.com.au/track?id=AP1&x=2' })).mail.html;
    expect(ok).toContain('href="https://auspost.com.au/track?id=AP1&amp;x=2"');
    expect(ok).toContain('Track my parcel');
    const bad = (await shipped({ trackingUrl: 'javascript:alert(1)' })).mail.html;
    expect(bad).not.toContain('javascript:');
    expect(bad).not.toContain('Track my parcel');
    const quote = (await shipped({ trackingUrl: 'https://x.com/"onmouseover="alert(1)' })).mail.html;
    expect(quote).not.toContain('onmouseover');
  });

  it('escapa el transportista', async () => {
    expect((await shipped({ carrier: '<script>x</script>' })).mail.html).not.toContain('<script>');
  });

  it('llega traducido', async () => {
    const es = (await shipped({ lang: 'es' })).mail;
    expect(es.subject).toBe('🚚 Tu pedido va en camino — #AB12CD34');
    expect(es.html).toContain('Número de seguimiento');
    expect(es.html).toContain('>Transportista<');
  });
});

describe('el email de reembolso', () => {
  it('dice cuanto se devolvio', async () => {
    const { mail } = await render({ type: 'shop_refunded', total: 41.9 });
    expect(mail.subject).toBe('↩️ Refund for order #AB12CD34');
    expect(mail.html).toContain('$41.90 AUD');
    expect(mail.html).toContain('5 to 10 business days');
  });

  it('llega traducido', async () => {
    const zh = (await render({ type: 'shop_refunded', lang: 'zh' })).mail;
    expect(zh.subject).toBe('↩️ 订单退款 #AB12CD34');
    expect(zh.html).toContain('>已退款<');
  });
});
