// Entradas adversariales a todos los handlers de la tienda. Un handler que
// revienta con un cuerpo raro es un 500 sin mensaje para el cliente y, peor,
// una pista para quien prueba. Cada accion tiene que CONTESTAR (un numero de
// estado), nunca tirar una excepcion sin atrapar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'k';
process.env.SHOP_STRIPE_SECRET_KEY = 'sk_test_x';
process.env.SHOP_STRIPE_PUBLISHABLE_KEY = 'pk_test_x';
process.env.INTERNAL_API_SECRET = 'int';

vi.mock('stripe', () => ({
  default: class {
    paymentIntents = { create: async () => ({ id: 'pi', client_secret: 'cs' }), retrieve: async () => ({ id: 'pi', status: 'succeeded', amount_received: 0, metadata: {} }) };
    refunds = { create: async () => ({ id: 're' }) };
  },
}));
vi.mock('../../api/_security.js', async (o) => ({ ...(await o()), guard: async () => false }));

// Base minima que nunca rompe: todo devuelve [] o una fila inocua.
function chain() {
  const c = {
    select: () => c, eq: () => c, in: () => c, order: () => c, limit: () => c, gte: () => c, like: () => c,
    update: () => c, delete: () => c, insert: () => c, upsert: () => c,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (r) => Promise.resolve({ data: [], error: null }).then(r),
  };
  return c;
}
const sb = {
  from: chain,
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }), createSignedUploadUrl: async () => ({ data: { token: 't' }, error: null }) }) },
  auth: { getUser: async () => ({ data: { user: { id: 'u', email: 'peredo.dm@gmail.com' } }, error: null }) },
};

function fakeRes() {
  const r = { statusCode: 0, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = () => {};
  r.end = () => r;
  return r;
}

let admin, catalog;
beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
  vi.resetModules();
  admin = await import('../../api/_shop-admin.js');
  catalog = await import('../../api/_shop-admin-catalog.js');
});
afterEach(() => vi.unstubAllGlobals());

// Cuerpos venenosos: tipos equivocados, anidados, enormes, con prototipos.
const POISON = [
  undefined, null, 0, '', 'x', [], {},
  { product: null, variants: null },
  { product: [], variants: 'no' },
  { product: { name: {}, section: [], gallery: {} }, variants: [{ sku: {}, price: 'abc' }] },
  { product: { name: 'x'.repeat(9999), section: 'parts' }, variants: Array(999).fill({ sku: 'A', price: 1, label: 'l' }) },
  { updates: 'no', soldOut: {} },
  { updates: [{ sku: null, cost: 'x' }], soldOut: [null, 1, {}] },
  { updates: Array(9999).fill({ sku: 'A', cost: 1 }) },
  { shipping: { fee: 'x' }, delivery: { minDays: [] }, pricing: { bands: 'no' } },
  { shipping: { fee: NaN, freeOver: Infinity } },
  { pricing: { fx: 'x', minPrice: {}, bands: [{ upTo: 'a', mult: null }] } },
  { days: 'abc', includeTest: 'yes' },
  { days: -999, includeTest: null },
  { days: 1e99 },
  { orderId: {}, action: [] },
  { orderId: 'x'.repeat(5000) },
  { action: '__proto__' },
  JSON.parse('{"__proto__":{"polluted":true}}'),
  { product: { name: 'x', section: 'parts', photoRef: 'javascript:alert(1)' }, variants: [{ sku: 'A', price: 1, label: 'l' }] },
  { slug: '../../etc/passwd' },
  { trackingNumber: '<script>', carrier: 'x'.repeat(9999), trackingUrl: 'http://insecure' },
  { supplierRef: '\u0000\u0000', notes: 'x'.repeat(99999) },
];

const ACTIONS = ['list', 'products', 'product-save', 'product-delete', 'photo-upload', 'settings', 'settings-save', 'import-apply', 'report', 'check', 'cancel', 'ordered', 'sent', 'delivered', 'refund', 'note', 'nonexistent-action', ''];

describe('ningun handler de admin revienta con un cuerpo venenoso', () => {
  for (const action of ACTIONS) {
    it(`action="${action}" siempre contesta un estado`, async () => {
      for (const body of POISON) {
        const req = { method: 'POST', query: {}, headers: {}, body: body && typeof body === 'object' ? { ...body, action } : body };
        let res;
        try {
          res = await admin.handleShopAdmin(req, fakeRes(), sb);
        } catch (e) {
          throw new Error(`action=${action} body=${JSON.stringify(body)} TIRO: ${e.message}`);
        }
        expect(typeof res.statusCode, `action=${action} body=${JSON.stringify(body)}`).toBe('number');
        expect(res.statusCode).toBeGreaterThanOrEqual(200);
        expect(res.statusCode).toBeLessThan(600);
      }
    });
  }
  it('Object.prototype no quedo contaminado', () => {
    expect({}.polluted).toBeUndefined();
  });
});

describe('las funciones puras del catalogo no revientan', () => {
  it('cleanSettings con basura', () => {
    for (const body of POISON) {
      expect(() => catalog.cleanSettings(body && typeof body === 'object' ? body : {})).not.toThrow();
    }
  });
});

describe('el handler publico de la tienda no revienta', () => {
  let handleShop;
  beforeEach(async () => {
    vi.resetModules();
    handleShop = (await import('../../api/_shop.js')).handleShop;
  });
  const ITEM_POISON = [
    undefined, null, 'x', 42, {}, [],
    [null], [undefined], [42], ['x'],
    [{ sku: null, qty: null }], [{ sku: {}, qty: [] }],
    [{ sku: 'A', qty: -1 }], [{ sku: 'A', qty: 1e99 }], [{ sku: 'A', qty: NaN }],
    [{ sku: 'x'.repeat(9999), qty: 1 }],
    Array(999).fill({ sku: 'A', qty: 1 }),
    [{ sku: 'A', qty: 1, price: 0.01, unit_price: -5, line_total: 'free' }],
    [{ sku: "'; DROP TABLE shop_orders; --", qty: 1 }],
  ];
  it('GET del catalogo con una cuenta cualquiera', async () => {
    for (const q of [{}, { action: [] }, { action: '__proto__' }]) {
      const res = await handleShop({ method: 'GET', query: q, headers: { authorization: 'Bearer good' }, body: {} }, fakeRes());
      expect(typeof res.statusCode).toBe('number');
    }
  });
  it('POST checkout con carritos venenosos', async () => {
    for (const items of ITEM_POISON) {
      let res;
      try {
        res = await handleShop({ method: 'POST', query: { action: 'checkout' }, headers: { authorization: 'Bearer good' }, body: { action: 'checkout', items, email: {}, name: [], address: 42 } }, fakeRes());
      } catch (e) {
        throw new Error(`items=${String(JSON.stringify(items)).slice(0, 60)} TIRO: ${e.message}`);
      }
      expect(res.statusCode, `items=${String(JSON.stringify(items)).slice(0, 60)}`).toBeGreaterThanOrEqual(200);
      expect(res.statusCode).toBeLessThan(600);
    }
  });
  it('POST confirm con orderId venenoso', async () => {
    for (const orderId of [undefined, null, {}, [], 42, 'x'.repeat(9999), '../../x']) {
      const res = await handleShop({ method: 'POST', query: { action: 'confirm' }, headers: { authorization: 'Bearer good' }, body: { action: 'confirm', orderId } }, fakeRes());
      expect(typeof res.statusCode).toBe('number');
    }
  });
});
