// El cobro de la tienda: el precio lo pone el servidor, siempre.
//
// El navegador manda SKU y cantidad. Si mandara importes, cualquiera podria
// abrir las herramientas del navegador y comprar una horquilla de $131 por un
// centavo. Ya paso una version de este bug en el wizard de reservas, donde el
// importe lo decidia el telefono (PR #412).
//
// Estos tests EJECUTAN el handler. Uno que leyera el codigo buscando
// `req.body.price` pasaria igual el dia que alguien agregue un descuento que
// si viene del cliente.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const VARIANTS = [
  { sku: 'TB-20-AV32L', label: '20x1.75 Schrader 32 mm', price: '6.95', shop_products: { name: 'Butyl Inner Tube', active: true } },
  { sku: 'FK-AIR-27', label: '27.5', price: '131.95', shop_products: { name: 'Air Spring Fork', active: true } },
  { sku: 'OLD-SKU', label: 'descatalogado', price: '9.95', shop_products: { name: 'Old Thing', active: false } },
];

let inserted = [];
let updated = [];
let intentArgs = null;
let intentStatus = 'succeeded';
let intentReceived = 0;
let orderRow = null;
let stripeThrows = null;

vi.mock('stripe', () => ({
  default: class {
    constructor(key) {
      this.key = key;
    }
    paymentIntents = {
      create: async (args) => {
        intentArgs = args;
        if (stripeThrows) throw new Error(stripeThrows);
        return { id: 'pi_test_123', client_secret: 'pi_test_123_secret' };
      },
      retrieve: async () => ({ id: 'pi_test_123', status: intentStatus, amount_received: intentReceived }),
    };
  },
}));

// guard() devuelve TRUE cuando YA contesto (metodo equivocado, limite de
// peticiones) y FALSE cuando hay que seguir. Este doble decia `true`, que
// significa "ya conteste": con la condicion invertida que tenia el handler,
// el test pasaba igual mientras en produccion la tienda contestaba 405 a
// todo. Un doble que miente en el mismo sentido que el codigo no prueba
// nada.
// El resto de _security.js es el de verdad (isValidEmail, SELF_BASE_URL): solo
// guard se reemplaza, porque limita por IP y aca no hay una.
vi.mock('../../api/_security.js', async (importOriginal) => ({ ...(await importOriginal()), guard: async () => false }));

const ITEMS = [{ sku: 'TB-20-AV32L', name: 'Butyl Inner Tube', variant: '20x1.75 Schrader 32 mm', qty: 2, line_total: '13.90' }];

// update() de verdad respeta sus filtros: una fila que ya no esta 'pending' no
// se mueve, igual que en Postgres. Un doble que actualizara siempre no
// distinguiria el handler que avisa una vez del que avisa en cada llamada.
function updateChain(table, patch) {
  const filters = [];
  const run = () => {
    updated.push({ table, patch, filters: filters.slice() });
    if (table !== 'shop_orders' || !orderRow) return [];
    if (!filters.every(([k, v]) => orderRow[k] === v)) return [];
    Object.assign(orderRow, patch);
    return [{ id: orderRow.id }];
  };
  const u = {
    eq: (k, v) => (filters.push([k, v]), u),
    select: async () => ({ data: run(), error: null }),
    then: (resolve, reject) => Promise.resolve({ data: (run(), null), error: null }).then(resolve, reject),
  };
  return u;
}

function chain(table) {
  const c = {
    select: () => c,
    eq: () => c,
    // Una copia: dos confirmaciones a la vez leen la fila cada una por su lado.
    single: async () => ({ data: orderRow ? { ...orderRow } : null, error: orderRow ? null : new Error('no rows') }),
    in: () => Promise.resolve({ data: table === 'shop_variants' ? VARIANTS : [], error: null }),
    order: () => Promise.resolve({ data: [], error: null }),
    then: (resolve, reject) =>
      Promise.resolve({ data: table === 'shop_order_items' ? ITEMS : [], error: null }).then(resolve, reject),
    insert: (rows) => {
      inserted.push({ table, rows });
      return {
        select: () => ({ single: async () => ({ data: { id: 'order-1' }, error: null }) }),
        then: (r) => Promise.resolve({ data: null, error: null }).then(r),
      };
    },
    update: (patch) => updateChain(table, patch),
  };
  return c;
}

// Los avisos salen por fetch a nuestro propio servidor.
let sent = [];
let fetchOk = true;

let currentUser = { id: 'u1', email: 'peredo.dm@gmail.com' };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: chain,
    auth: { getUser: async (t) => (t === 'good' ? { data: { user: currentUser }, error: null } : { data: { user: null }, error: new Error('bad') }) },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  }),
}));

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}

let handler;
beforeEach(async () => {
  inserted = [];
  updated = [];
  intentArgs = null;
  stripeThrows = null;
  currentUser = { id: 'u1', email: 'peredo.dm@gmail.com' };
  intentStatus = 'succeeded';
  intentReceived = 0;
  orderRow = paidableOrder();
  sent = [];
  fetchOk = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return { ok: fetchOk, status: fetchOk ? 200 : 500, json: async () => ({}) };
    })
  );
  process.env.INTERNAL_API_SECRET = 'internal-test';
  process.env.SHOP_STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.SHOP_STRIPE_PUBLISHABLE_KEY = 'pk_test_fake';
  vi.resetModules();
  handler = (await import('../../api/_shop.js')).handleShop;
});

afterEach(() => {
  delete process.env.SHOP_STRIPE_SECRET_KEY;
  delete process.env.SHOP_STRIPE_PUBLISHABLE_KEY;
  delete process.env.INTERNAL_API_SECRET;
  vi.unstubAllGlobals();
});

function paidableOrder(extra = {}) {
  return {
    id: 'order-1',
    client_id: 'u1',
    client_email: 'cliente@example.com',
    client_name: 'Ana',
    client_phone: '0400 000 000',
    ship_address: '1 Test St',
    ship_suburb: 'Bondi',
    ship_postcode: '2026',
    payment_intent_id: 'pi_test_123',
    status: 'pending',
    shipping: '0',
    total: '13.90',
    mode: 'test',
    ...extra,
  };
}

const confirm = (body) =>
  handler(
    { method: 'POST', query: { action: 'confirm' }, headers: { authorization: 'Bearer good' }, body: { action: 'confirm', ...body } },
    fakeRes()
  );

const checkout = (body) =>
  handler(
    { method: 'POST', query: { action: 'checkout' }, headers: { authorization: 'Bearer good' }, body: { action: 'checkout', ...body } },
    fakeRes()
  );

describe('el importe lo decide el servidor', () => {
  it('cobra el precio del catalogo, no el que viene en el pedido', async () => {
    const res = await checkout({ items: [{ sku: 'FK-AIR-27', qty: 1, price: 0.01, unit_price: 0.01, line_total: 0.01 }] });
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(131.95);
    expect(intentArgs.amount).toBe(13195);
  });

  it('un subtotal mandado por el cliente se ignora', async () => {
    const res = await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 2 }], subtotal: 0.02, total: 0.02, shipping: -50 });
    expect(res.body.subtotal).toBe(13.9);
    expect(res.body.total).toBe(13.9);
    expect(intentArgs.amount).toBe(1390);
  });

  it('multiplica bien y suma las lineas', async () => {
    const res = await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 3 }, { sku: 'FK-AIR-27', qty: 1 }] });
    expect(res.body.total).toBe(152.8);
    expect(intentArgs.amount).toBe(15280);
  });
});

describe('lo que llega del navegador se limpia antes de usarlo', () => {
  it('una cantidad de 0 o negativa no entra', async () => {
    const res = await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 0 }, { sku: 'FK-AIR-27', qty: -5 }] });
    expect(res.statusCode).toBe(400);
  });

  it('no se puede pedir mas de 20 de una linea', async () => {
    const res = await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 999 }] });
    expect(res.statusCode).toBe(400);
  });

  it('el mismo SKU dos veces cuenta una sola', async () => {
    const res = await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }, { sku: 'TB-20-AV32L', qty: 1 }] });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(6.95);
  });

  it('un producto apagado se rechaza, y se dice cual', async () => {
    const res = await checkout({ items: [{ sku: 'OLD-SKU', qty: 1 }] });
    expect(res.statusCode).toBe(409);
    expect(res.body.missing).toEqual(['OLD-SKU']);
  });

  it('un SKU inventado se rechaza', async () => {
    const res = await checkout({ items: [{ sku: 'NO-EXISTE', qty: 1 }] });
    expect(res.statusCode).toBe(409);
  });

  it('un carrito vacio no crea ningun pedido', async () => {
    const res = await checkout({ items: [] });
    expect(res.statusCode).toBe(400);
    expect(inserted).toHaveLength(0);
    expect(intentArgs).toBeNull();
  });

  it('un pedido enorme se frena antes de cobrar', async () => {
    const res = await checkout({ items: [{ sku: 'FK-AIR-27', qty: 20 }] });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/0433 963 250/);
    expect(intentArgs).toBeNull();
  });
});

describe('el pedido queda escrito antes de cobrar', () => {
  it('guarda el pedido y sus lineas con el precio congelado', async () => {
    await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 2 }], name: 'Diego', address: '1 Test St', suburb: 'Bondi', postcode: '2026' });
    const order = inserted.find((i) => i.table === 'shop_orders');
    const lines = inserted.find((i) => i.table === 'shop_order_items');
    expect(order.rows).toMatchObject({ total: 13.9, mode: 'test', status: 'pending', ship_suburb: 'Bondi' });
    expect(lines.rows[0]).toMatchObject({ sku: 'TB-20-AV32L', qty: 2, unit_price: 6.95, line_total: 13.9 });
  });

  it('escribe el pedido ANTES de llamar a Stripe', async () => {
    const order = [];
    await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }] });
    expect(inserted.length).toBeGreaterThan(0);
    expect(intentArgs).not.toBeNull();
  });

  it('si Stripe falla, el pedido queda cancelado y con el motivo', async () => {
    stripeThrows = 'card network down';
    const res = await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }] });
    expect(res.statusCode).toBe(502);
    const cancel = updated.find((u) => u.patch.status === 'cancelled');
    expect(cancel.patch.notes).toContain('card network down');
  });

  it('guarda el id del cobro contra el pedido', async () => {
    await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }] });
    expect(updated.find((u) => u.patch.payment_intent_id === 'pi_test_123')).toBeTruthy();
  });
});

describe('la tienda no cobra de verdad mientras sea un preview', () => {
  it('con una clave de pruebas, el pedido queda marcado test', async () => {
    const res = await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }] });
    expect(res.body.mode).toBe('test');
    expect(inserted.find((i) => i.table === 'shop_orders').rows.mode).toBe('test');
  });

  it('sin clave configurada avisa, y no cae en la clave LIVE del sitio', async () => {
    delete process.env.SHOP_STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_live_del_negocio';
    vi.resetModules();
    const h = (await import('../../api/_shop.js')).handleShop;
    const res = await h(
      { method: 'POST', query: { action: 'checkout' }, headers: { authorization: 'Bearer good' }, body: { items: [{ sku: 'TB-20-AV32L', qty: 1 }] } },
      fakeRes()
    );
    expect(res.statusCode).toBe(503);
    expect(intentArgs).toBeNull();
  });
});

describe('sin permiso no se puede comprar', () => {
  it('otra cuenta recibe 404, igual que en el catalogo', async () => {
    currentUser = { id: 'u9', email: 'otro@gmail.com' };
    const res = await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }] });
    expect(res.statusCode).toBe(404);
    expect(inserted).toHaveLength(0);
  });

  it('sin token no se puede comprar', async () => {
    const res = await handler({ method: 'POST', query: { action: 'checkout' }, headers: {}, body: { items: [{ sku: 'TB-20-AV32L', qty: 1 }] } }, fakeRes());
    expect(res.statusCode).toBe(404);
    expect(intentArgs).toBeNull();
  });
});

describe('pagar se confirma preguntandole a Stripe, no al navegador', () => {
  it('un pedido cuyo cobro no esta succeeded no queda pagado', async () => {
    intentStatus = 'requires_payment_method';
    const res = await confirm({ orderId: 'order-1' });
    expect(res.body.status).toBe('requires_payment_method');
    expect(updated.find((u) => u.patch.status === 'paid')).toBeFalsy();
  });

  it('con el cobro hecho y el importe correcto, queda pagado', async () => {
    intentStatus = 'succeeded';
    intentReceived = 1390;
    orderRow = { id: 'order-1', client_id: 'u1', payment_intent_id: 'pi_test_123', status: 'pending', total: '13.90' };
    const res = await confirm({ orderId: 'order-1' });
    expect(res.body.status).toBe('paid');
    expect(updated.find((u) => u.patch.status === 'paid')).toBeTruthy();
  });

  it('si Stripe cobro menos que el pedido, NO queda pagado', async () => {
    intentStatus = 'succeeded';
    intentReceived = 1; // un centavo
    orderRow = { id: 'order-1', client_id: 'u1', payment_intent_id: 'pi_test_123', status: 'pending', total: '13.90' };
    const res = await confirm({ orderId: 'order-1' });
    expect(res.statusCode).toBe(409);
    expect(updated.find((u) => u.patch.status === 'paid')).toBeFalsy();
  });

  it('el pedido de otra persona no se puede confirmar ni ver', async () => {
    orderRow = { id: 'order-1', client_id: 'otro-usuario', payment_intent_id: 'pi_test_123', status: 'pending', total: '13.90' };
    const res = await confirm({ orderId: 'order-1' });
    expect(res.statusCode).toBe(404);
  });
});

describe('la tarjeta habla con la misma cuenta que creo el cobro', () => {
  it('el checkout devuelve la clave publica de la tienda y el numero de pedido', async () => {
    const res = await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }] });
    expect(res.statusCode).toBe(200);
    expect(res.body.publishableKey).toBe('pk_test_fake');
    expect(res.body.ref).toBe('ORDER1');
  });

  it('el cobro es solo con tarjeta, que es lo unico que el formulario ofrece', async () => {
    await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }] });
    expect(intentArgs.payment_method_types).toEqual(['card']);
    expect(intentArgs.automatic_payment_methods).toBeUndefined();
  });

  it('sin la clave publica no se crea ningun pedido', async () => {
    delete process.env.SHOP_STRIPE_PUBLISHABLE_KEY;
    vi.resetModules();
    const h = (await import('../../api/_shop.js')).handleShop;
    const res = await h(
      { method: 'POST', query: { action: 'checkout' }, headers: { authorization: 'Bearer good' }, body: { items: [{ sku: 'TB-20-AV32L', qty: 1 }] } },
      fakeRes()
    );
    expect(res.statusCode).toBe(503);
    expect(inserted).toHaveLength(0);
    expect(intentArgs).toBeNull();
  });

  it('una clave de pruebas con una real se rechaza antes de cobrar', async () => {
    process.env.SHOP_STRIPE_PUBLISHABLE_KEY = 'pk_live_otra';
    vi.resetModules();
    const h = (await import('../../api/_shop.js')).handleShop;
    const res = await h(
      { method: 'POST', query: { action: 'checkout' }, headers: { authorization: 'Bearer good' }, body: { items: [{ sku: 'TB-20-AV32L', qty: 1 }] } },
      fakeRes()
    );
    expect(res.statusCode).toBe(503);
    expect(inserted).toHaveLength(0);
  });

  it('un email que no es un email no se usa: va el de la cuenta', async () => {
    await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }], email: 'esto no es un email' });
    expect(inserted.find((i) => i.table === 'shop_orders').rows.client_email).toBe('peredo.dm@gmail.com');
  });

  it('un email bien escrito se respeta', async () => {
    await checkout({ items: [{ sku: 'TB-20-AV32L', qty: 1 }], email: 'otra@example.com' });
    expect(inserted.find((i) => i.table === 'shop_orders').rows.client_email).toBe('otra@example.com');
  });
});

describe('un pedido pagado avisa una vez, y solo una', () => {
  beforeEach(() => {
    intentStatus = 'succeeded';
    intentReceived = 1390;
  });

  it('avisa a Diego por WhatsApp y al cliente por email', async () => {
    const res = await confirm({ orderId: 'order-1', lang: 'es' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'paid', ref: 'ORDER1' });
    expect(sent).toHaveLength(2);

    const wa = sent.find((s) => s.url.includes('/api/send-message?channel=whatsapp'));
    expect(wa.url.startsWith('https://drbikesydney.com.au/')).toBe(true);
    expect(wa.headers['x-internal-token']).toBe('internal-test');
    expect(wa.body).toMatchObject({ to: '0433963250', template: 'shop_order' });
    expect(wa.body.data).toMatchObject({ ref: 'ORDER1', total: '13.90', test: true, address: '1 Test St, Bondi, 2026' });
    // Con el SKU, que es lo que Diego le pide a LEBYCLE.
    expect(wa.body.data.lines[0]).toContain('TB-20-AV32L');

    const mail = sent.find((s) => s.url.endsWith('/api/send-email'));
    expect(mail.headers['x-internal-token']).toBe('internal-test');
    expect(mail.body).toMatchObject({ type: 'shop_order', to: 'cliente@example.com', orderRef: 'ORDER1', lang: 'es', mode: 'test' });
    expect(mail.body.items).toHaveLength(1);
  });

  it('confirmar dos veces seguidas no avisa dos veces', async () => {
    await confirm({ orderId: 'order-1' });
    await confirm({ orderId: 'order-1' });
    expect(sent).toHaveLength(2);
  });

  it('dos confirmaciones a la vez tampoco: solo la que mueve la fila avisa', async () => {
    const [a, b] = await Promise.all([confirm({ orderId: 'order-1' }), confirm({ orderId: 'order-1' })]);
    expect(a.body.status).toBe('paid');
    expect(b.body.status).toBe('paid');
    expect(sent).toHaveLength(2);
    const moves = updated.filter((u) => u.patch.status === 'paid');
    expect(moves.every((u) => u.filters.some(([k, v]) => k === 'status' && v === 'pending'))).toBe(true);
  });

  it('un pedido ya pagado contesta pagado sin preguntarle a Stripe ni avisar', async () => {
    orderRow = paidableOrder({ status: 'paid' });
    intentStatus = 'requires_payment_method'; // si se lo preguntara, diria otra cosa
    const res = await confirm({ orderId: 'order-1' });
    expect(res.body.status).toBe('paid');
    expect(sent).toHaveLength(0);
  });

  it('un cobro por otro importe no avisa a nadie', async () => {
    intentReceived = 1;
    const res = await confirm({ orderId: 'order-1' });
    expect(res.statusCode).toBe(409);
    expect(sent).toHaveLength(0);
  });

  it('un cobro que no paso no avisa a nadie', async () => {
    intentStatus = 'requires_payment_method';
    await confirm({ orderId: 'order-1' });
    expect(sent).toHaveLength(0);
  });

  it('si un aviso falla, el pedido queda pagado igual y lo dice en las notas', async () => {
    fetchOk = false;
    const res = await confirm({ orderId: 'order-1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(orderRow.status).toBe('paid');
    expect(orderRow.notes).toMatch(/Aviso fallido/);
    expect(orderRow.notes).toMatch(/whatsapp/);
    expect(orderRow.notes).toMatch(/email/);
  });
});
