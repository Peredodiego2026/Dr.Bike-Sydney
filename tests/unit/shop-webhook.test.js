// El aviso de Stripe para la tienda LEBYCLE (api/stripe-webhook.js), ejecutado
// con firmas reales: Stripe.webhooks.generateTestHeaderString firma el cuerpo
// con el secreto, igual que Stripe.
//
// Lo que no se puede romper:
//   - Un pago de la tienda que el navegador no confirmo queda pagado, con sus
//     avisos, una sola vez.
//   - Un aviso firmado con el secreto de la TIENDA (modo pruebas) nunca toca
//     reservas ni membresias, que viven en la cuenta real.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';

process.env.STRIPE_SECRET_KEY = 'sk_test_main_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_main_for_tests';
process.env.SHOP_STRIPE_WEBHOOK_SECRET = 'whsec_shop_for_tests';
process.env.SHOP_STRIPE_SECRET_KEY = 'sk_test_shop_for_tests';
process.env.SUPABASE_SERVICE_KEY = 'service_for_tests';

let piState;

// Stripe de verdad (para firmar y verificar), salvo la pregunta por el cobro.
vi.mock('stripe', async (importOriginal) => {
  const Real = (await importOriginal()).default;
  class FakeStripe extends Real {
    constructor(key) {
      super(key);
      this.paymentIntents = { retrieve: async (id) => ({ id, ...piState }) };
    }
  }
  FakeStripe.webhooks = Real.webhooks;
  return { default: FakeStripe };
});
vi.mock('../../api/_security.js', async (importOriginal) => ({ ...(await importOriginal()), guard: async () => false }));

// ── La base en memoria: respeta los filtros, como Postgres ───────────────────
let db;
const touched = new Set();
function table(name) {
  touched.add(name);
  const eqs = [];
  const ins = [];
  let patch = null;
  const rows = () => (db[name] || []).filter((r) => eqs.every(([k, v]) => r[k] === v) && ins.every(([k, vs]) => vs.includes(r[k])));
  const run = () => {
    if (patch) {
      const hit = rows();
      hit.forEach((r) => Object.assign(r, patch));
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    }
    return { data: rows().map((r) => ({ ...r })), error: null };
  };
  const q = {
    select: () => q,
    eq: (k, v) => (eqs.push([k, v]), q),
    in: (k, vs) => (ins.push([k, vs]), q),
    update: (p) => ((patch = p), q),
    insert: (row) => {
      (db[name] ||= []).push(row);
      return Promise.resolve({ data: null, error: null });
    },
    single: async () => {
      const r = rows()[0];
      return r ? { data: { ...r }, error: null } : { data: null, error: new Error('no rows') };
    },
    maybeSingle: async () => {
      if (name === 'shop_orders' && db.failShopLookup) return { data: null, error: new Error('connection reset') };
      const r = rows()[0];
      return { data: r ? { ...r } : null, error: null };
    },
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return q;
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (n) => table(n) }) }));

const ORDER_ID = 'bbbb1111-2222-3333-4444-555566667777';
const shopPi = (extra = {}) => ({
  id: 'pi_shop_1',
  object: 'payment_intent',
  amount_received: 1390,
  metadata: { kind: 'shop_order', order_id: ORDER_ID, lang: 'es' },
  ...extra,
});

let Stripe;
let mod;
let sent;

beforeAll(async () => {
  Stripe = (await import('stripe')).default;
  mod = await import('../../api/stripe-webhook.js');
}, 30000);

beforeEach(() => {
  touched.clear();
  sent = [];
  piState = { status: 'succeeded', amount_received: 1390, metadata: { lang: 'es' } };
  db = {
    shop_orders: [
      {
        id: ORDER_ID,
        client_id: 'u1',
        client_email: 'ana@example.com',
        client_name: 'Ana',
        client_phone: null,
        ship_address: '1 Test St',
        ship_suburb: 'Bondi',
        ship_postcode: '2026',
        payment_intent_id: 'pi_shop_1',
        status: 'pending',
        shipping: '0',
        total: '13.90',
        mode: 'test',
      },
    ],
    shop_order_items: [{ order_id: ORDER_ID, sku: 'TB-20', name: 'Tube', variant: '', qty: 2, line_total: '13.90' }],
    stripe_events: [],
  };
  process.env.INTERNAL_API_SECRET = 'internal-test';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({}) };
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

function signedRequest(event, secret) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const req = Readable.from([Buffer.from(payload)]);
  req.method = 'POST';
  req.headers = { 'stripe-signature': header, 'content-type': 'application/json' };
  return req;
}
function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  r.end = () => r;
  return r;
}
const deliver = async (event, secret) => {
  const res = fakeRes();
  await mod.default(signedRequest(event, secret), res);
  return res;
};
const evt = (type, object, id = 'evt_' + Math.random().toString(36).slice(2)) => ({ id, object: 'event', type, data: { object } });

describe('handleShopPaymentSucceeded', () => {
  it('ignora un cobro que no es de la tienda', async () => {
    expect(await mod.handleShopPaymentSucceeded({ id: 'pi_x', metadata: { bk_service_name: 'Tune' } })).toBeNull();
  });

  it('el pago que el navegador no confirmo queda pagado, con sus dos avisos', async () => {
    const out = await mod.handleShopPaymentSucceeded(shopPi());
    expect(out.shop.status).toBe('paid');
    expect(db.shop_orders[0].status).toBe('paid');
    expect(sent).toHaveLength(2);
    // El email sale en el idioma en que se compro.
    expect(sent.find((s) => s.body.type === 'shop_order').body.lang).toBe('es');
  });

  it('si el navegador ya lo confirmo, no avisa de nuevo', async () => {
    db.shop_orders[0].status = 'paid';
    const out = await mod.handleShopPaymentSucceeded(shopPi());
    expect(out.shop.status).toBe('paid');
    expect(sent).toHaveLength(0);
  });

  it('un cobro que no es el de ese pedido no lo toca', async () => {
    const out = await mod.handleShopPaymentSucceeded(shopPi({ id: 'pi_otro' }));
    expect(out.shop).toMatch(/does not belong/);
    expect(db.shop_orders[0].status).toBe('pending');
  });

  it('un pedido que no existe no hace reintentar a Stripe', async () => {
    db.shop_orders = [];
    await expect(mod.handleShopPaymentSucceeded(shopPi())).resolves.toMatchObject({ shop: 'no order for this payment' });
  });

  it('un error de la base si: Stripe tiene que reintentar', async () => {
    db.failShopLookup = true;
    await expect(mod.handleShopPaymentSucceeded(shopPi())).rejects.toThrow(/lookup failed/);
  });
});

describe('el aviso firmado', () => {
  it('con el secreto de la tienda, marca el pedido pagado', async () => {
    const res = await deliver(evt('payment_intent.succeeded', shopPi()), 'whsec_shop_for_tests');
    expect(res.statusCode).toBe(200);
    expect(db.shop_orders[0].status).toBe('paid');
  });

  it('con el secreto de la tienda, cualquier otra cosa se ignora: no toca reservas ni membresias', async () => {
    const res = await deliver(
      // Este, en la cuenta real, cancela la membresia del cliente en profiles.
      evt('customer.subscription.deleted', { id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'canceled' }),
      'whsec_shop_for_tests'
    );
    expect(res.statusCode).toBe(200);
    expect([...touched].filter((t) => t !== 'stripe_events')).toEqual([]);
  });

  it('con el secreto de la tienda, un cobro que no es de la tienda tampoco crea una reserva', async () => {
    const res = await deliver(
      evt('payment_intent.succeeded', { id: 'pi_b', amount_received: 2000, metadata: { bk_service_name: 'Tune', bk_date: '2026-10-10', bk_time: '10:00' } }),
      'whsec_shop_for_tests'
    );
    expect(res.statusCode).toBe(200);
    expect(touched.has('bookings')).toBe(false);
  });

  it('con el secreto de la cuenta real, un cobro de la tienda va a la tienda y no a reservas', async () => {
    const res = await deliver(evt('payment_intent.succeeded', shopPi()), 'whsec_main_for_tests');
    expect(res.statusCode).toBe(200);
    expect(db.shop_orders[0].status).toBe('paid');
    expect(touched.has('bookings')).toBe(false);
  });

  it('con un secreto cualquiera, 400 y nada cambia', async () => {
    const res = await deliver(evt('payment_intent.succeeded', shopPi()), 'whsec_de_otro');
    expect(res.statusCode).toBe(400);
    expect(db.shop_orders[0].status).toBe('pending');
  });
});
