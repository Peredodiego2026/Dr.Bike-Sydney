// Admin > Shop Orders (api/_shop-admin.js), ejecutado.
//
// La base de datos de mentira respeta los filtros de cada escritura igual que
// Postgres: un .update().in('status', [...]) que no encuentra la fila no la
// mueve. Sin eso, un handler que reembolsa o manda "enviado" dos veces pasaria
// estos tests igual.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

process.env.SHOP_STRIPE_SECRET_KEY = 'sk_test_admin';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

let piState;
let piCancelled;
let refundCalls;

vi.mock('stripe', () => ({
  default: class {
    paymentIntents = {
      retrieve: async (id) => ({ id, ...piState }),
      cancel: async (id) => {
        piCancelled.push(id);
        return { id, status: 'canceled' };
      },
    };
    refunds = {
      create: async (args, opts) => {
        refundCalls.push({ args, opts });
        return { id: 're_test_1' };
      },
    };
  },
}));
vi.mock('../../api/_security.js', async (importOriginal) => ({ ...(await importOriginal()), guard: async () => false }));

// ── La base en memoria ───────────────────────────────────────────────────────
let db;
let migrated;
// Como contesta PostgREST de verdad una columna que no existe (PGRST204), en vez
// del texto de Postgres. La primera version del handler solo reconocia este ultimo.
let pgrstStyle = false;

function table(name) {
  const eqs = [];
  const ins = [];
  let patch = null;
  const rows = () =>
    db[name].filter((r) => eqs.every(([k, v]) => r[k] === v) && ins.every(([k, vs]) => vs.includes(r[k])));
  const run = () => {
    if (patch) {
      if (!migrated && Object.keys(patch).some((k) => ['supplier_ref', 'carrier', 'tracking_url', 'sent_at'].includes(k))) {
        const col = Object.keys(patch)[1];
        const err = pgrstStyle
          ? Object.assign(new Error("Could not find the '" + col + "' column of 'shop_orders' in the schema cache"), { code: 'PGRST204' })
          : new Error('column "' + col + '" of relation "shop_orders" does not exist');
        return { data: null, error: err };
      }
      const hit = rows();
      hit.forEach((r) => Object.assign(r, patch));
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    }
    return { data: rows().map((r) => ({ ...r })), error: null };
  };
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (k, v) => (eqs.push([k, v]), q),
    in: (k, vs) => (ins.push([k, vs]), q),
    update: (p) => ((patch = p), q),
    single: async () => {
      const r = rows()[0];
      return r ? { data: { ...r }, error: null } : { data: null, error: new Error('no rows') };
    },
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return q;
}
const sb = { from: (n) => table(n) };

function order(extra = {}) {
  const base = {
    id: 'aaaa1111-2222-3333-4444-555566667777',
    client_id: 'u1',
    client_email: 'ana@example.com',
    client_name: 'Ana',
    client_phone: '0400 000 000',
    ship_address: '1 Test St',
    ship_suburb: 'Bondi',
    ship_postcode: '2026',
    subtotal: '13.90',
    shipping: '0',
    total: '13.90',
    status: 'paid',
    mode: 'test',
    payment_intent_id: 'pi_1',
    notes: null,
    created_at: '2026-10-04T01:00:00Z',
    paid_at: '2026-10-04T01:01:00Z',
    ...extra,
  };
  if (migrated) {
    Object.assign(base, { supplier_ref: null, carrier: null, tracking_url: null, ordered_at: null, sent_at: null, delivered_at: null, refunded_at: null, refund_id: null }, extra);
  }
  return base;
}

let sent;
let handleShopAdmin;

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}
const act = (body) => handleShopAdmin({ method: 'POST', headers: {}, body }, fakeRes(), sb);
const ID = 'aaaa1111-2222-3333-4444-555566667777';
const row = () => db.shop_orders[0];

beforeEach(async () => {
  migrated = true;
  pgrstStyle = false;
  piState = { status: 'succeeded', amount_received: 1390, metadata: { lang: 'es' } };
  piCancelled = [];
  refundCalls = [];
  sent = [];
  db = {
    shop_orders: [order()],
    shop_order_items: [{ order_id: ID, sku: 'TB-20', name: 'Butyl Inner Tube', variant: '20x1.75', qty: 2, unit_price: '6.95', line_total: '13.90' }],
    shop_variants: [{ sku: 'TB-20', cost: '1.25' }],
  };
  process.env.INTERNAL_API_SECRET = 'internal-test';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({}) };
    })
  );
  vi.resetModules();
  handleShopAdmin = (await import('../../api/_shop-admin.js')).handleShopAdmin;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.INTERNAL_API_SECRET;
});

describe('la lista', () => {
  it('trae los pedidos con sus lineas, el costo y el numero corto', async () => {
    const res = await act({ action: 'list' });
    expect(res.statusCode).toBe(200);
    const o = res.body.orders[0];
    expect(o.ref).toBe('AAAA1111');
    expect(o.items[0]).toMatchObject({ sku: 'TB-20', qty: 2, lineTotal: 13.9, unitCost: 1.25 });
    expect(o.migrated).toBe(true);
    expect(res.body.shopMode).toBe('test');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('avisa cuando falta la migracion', async () => {
    migrated = false;
    db.shop_orders = [order()];
    const res = await act({ action: 'list' });
    expect(res.body.orders[0].migrated).toBe(false);
  });
});

describe('pedido a LEBYCLE', () => {
  it('sin el numero de LEBYCLE no avanza', async () => {
    const res = await act({ action: 'ordered', orderId: ID });
    expect(res.statusCode).toBe(400);
    expect(row().status).toBe('paid');
  });

  it('guarda su numero y pasa a ordered', async () => {
    const res = await act({ action: 'ordered', orderId: ID, supplierRef: 'LB-20481' });
    expect(res.statusCode).toBe(200);
    expect(row()).toMatchObject({ status: 'ordered', supplier_ref: 'LB-20481' });
    expect(row().ordered_at).toBeTruthy();
  });

  it('dos veces no: la segunda encuentra el pedido ya movido', async () => {
    await act({ action: 'ordered', orderId: ID, supplierRef: 'LB-1' });
    const res = await act({ action: 'ordered', orderId: ID, supplierRef: 'LB-2' });
    expect(res.statusCode).toBe(409);
    expect(row().supplier_ref).toBe('LB-1');
  });

  it('sin la migracion corrida, dice que SQL falta', async () => {
    migrated = false;
    db.shop_orders = [order()];
    const res = await act({ action: 'ordered', orderId: ID, supplierRef: 'LB-1' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('shop-orders-fulfillment.sql');
  });
});

describe('enviado', () => {
  beforeEach(() => {
    row().status = 'ordered';
  });

  it('sin numero de seguimiento no avanza', async () => {
    const res = await act({ action: 'sent', orderId: ID, carrier: 'AusPost' });
    expect(res.statusCode).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('un link que no es https no se acepta', async () => {
    const res = await act({ action: 'sent', orderId: ID, trackingNumber: 'AP123', trackingUrl: 'javascript:alert(1)' });
    expect(res.statusCode).toBe(400);
    expect(row().status).toBe('ordered');
  });

  it('pasa a sent y le manda el seguimiento al cliente, en su idioma', async () => {
    const res = await act({ action: 'sent', orderId: ID, carrier: 'AusPost', trackingNumber: 'AP123', trackingUrl: 'https://auspost.com.au/track/AP123' });
    expect(res.statusCode).toBe(200);
    expect(res.body.emailed).toBe(true);
    expect(row()).toMatchObject({ status: 'sent', tracking_number: 'AP123', carrier: 'AusPost', tracking_url: 'https://auspost.com.au/track/AP123' });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://drbikesydney.com.au/api/send-email');
    expect(sent[0].headers['x-internal-token']).toBe('internal-test');
    expect(sent[0].body).toMatchObject({ type: 'shop_shipped', to: 'ana@example.com', orderRef: 'AAAA1111', trackingNumber: 'AP123', lang: 'es' });
  });

  it('dos clics, un solo email', async () => {
    await act({ action: 'sent', orderId: ID, trackingNumber: 'AP123' });
    const res = await act({ action: 'sent', orderId: ID, trackingNumber: 'AP123' });
    expect(res.statusCode).toBe(409);
    expect(sent).toHaveLength(1);
  });

  it('un pedido sin pagar no se puede enviar', async () => {
    row().status = 'pending';
    const res = await act({ action: 'sent', orderId: ID, trackingNumber: 'AP123' });
    expect(res.statusCode).toBe(409);
    expect(sent).toHaveLength(0);
  });

  it('entregado solo despues de enviado', async () => {
    expect((await act({ action: 'delivered', orderId: ID })).statusCode).toBe(409);
    await act({ action: 'sent', orderId: ID, trackingNumber: 'AP123' });
    expect((await act({ action: 'delivered', orderId: ID })).statusCode).toBe(200);
    expect(row().status).toBe('delivered');
  });
});

describe('reembolso', () => {
  it('devuelve en Stripe con clave de idempotencia y avisa al cliente', async () => {
    const res = await act({ action: 'refund', orderId: ID });
    expect(res.statusCode).toBe(200);
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0].args.payment_intent).toBe('pi_1');
    expect(refundCalls[0].opts.idempotencyKey).toBe('shop-refund-' + ID);
    expect(row()).toMatchObject({ status: 'refunded', refund_id: 're_test_1' });
    expect(sent.map((s) => s.body.type)).toEqual(['shop_refunded']);
  });

  it('un pedido sin pagar no se reembolsa', async () => {
    row().status = 'pending';
    const res = await act({ action: 'refund', orderId: ID });
    expect(res.statusCode).toBe(409);
    expect(refundCalls).toHaveLength(0);
  });

  it('dos veces no: el segundo ya no encuentra nada que devolver', async () => {
    await act({ action: 'refund', orderId: ID });
    const res = await act({ action: 'refund', orderId: ID });
    expect(res.statusCode).toBe(409);
    expect(refundCalls).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('un pedido real con claves de prueba (o al reves) se manda al panel de Stripe', async () => {
    row().mode = 'live';
    const res = await act({ action: 'refund', orderId: ID });
    expect(res.statusCode).toBe(409);
    expect(refundCalls).toHaveLength(0);
  });
});

describe('el pago que el navegador no confirmo', () => {
  beforeEach(() => {
    row().status = 'pending';
  });

  it('"Check with Stripe" lo marca pagado y salen los mismos dos avisos', async () => {
    const res = await act({ action: 'check', orderId: ID });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(row().status).toBe('paid');
    expect(sent.map((s) => (s.url.includes('whatsapp') ? 'whatsapp' : s.body.type)).sort()).toEqual(['shop_order', 'whatsapp']);
  });

  it('si Stripe dice que no se cobro, no cambia nada', async () => {
    piState = { status: 'requires_payment_method', amount_received: 0, metadata: {} };
    const res = await act({ action: 'check', orderId: ID });
    expect(res.body.status).toBe('requires_payment_method');
    expect(row().status).toBe('pending');
    expect(sent).toHaveLength(0);
  });

  it('no se cancela uno que Stripe SI cobro', async () => {
    const res = await act({ action: 'cancel', orderId: ID });
    expect(res.statusCode).toBe(409);
    expect(row().status).toBe('pending');
    expect(piCancelled).toHaveLength(0);
  });

  it('uno que nunca se pago se cancela, tambien en Stripe', async () => {
    piState = { status: 'requires_payment_method', amount_received: 0, metadata: {} };
    const res = await act({ action: 'cancel', orderId: ID });
    expect(res.statusCode).toBe(200);
    expect(row().status).toBe('cancelled');
    expect(piCancelled).toEqual(['pi_1']);
  });
});

describe('quien entra', () => {
  // auth.js comprueba la sesion de admin ANTES de llegar al modulo. Se lee el
  // bloque del despachador: el modulo no decide nada sobre quien entra.
  const auth = fs.readFileSync('api/auth.js', 'utf8');
  const block = auth.slice(auth.indexOf("if (role === 'admin-shop') {"), auth.indexOf('return handleShopAdmin(req, res, auth.sb);') + 50);

  it('el rol pasa por verifyAdminSession y corta si da error', () => {
    expect(block).toMatch(/verifyAdminSession\(/);
    expect(block).toMatch(/if \(auth\.error\) return res\.status\(auth\.status\)/);
    expect(block.indexOf('verifyAdminSession')).toBeLessThan(block.indexOf('handleShopAdmin'));
  });

  it('es la unica puerta al modulo', () => {
    expect(auth.match(/handleShopAdmin\(/g)).toHaveLength(1);
  });
});

describe('lo que se arreglo en la revision', () => {
  it('sin la migracion, el error tal como lo manda PostgREST tambien dice que SQL falta', async () => {
    migrated = false;
    pgrstStyle = true;
    db.shop_orders = [order()];
    const res = await act({ action: 'ordered', orderId: ID, supplierRef: 'LB-1' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('shop-orders-fulfillment.sql');
  });

  it('"Check with Stripe" manda el email de pedido recibido en el idioma en que se compro', async () => {
    row().status = 'pending';
    piState = { status: 'succeeded', amount_received: 1390, metadata: { lang: 'zh' } };
    await act({ action: 'check', orderId: ID });
    const mail = sent.find((s) => s.body.type === 'shop_order');
    expect(mail.body.lang).toBe('zh');
  });

  it("un pedido en 'packed' (estado viejo) se puede enviar y reembolsar, como muestra el panel", async () => {
    row().status = 'packed';
    expect((await act({ action: 'sent', orderId: ID, trackingNumber: 'AP1' })).statusCode).toBe(200);
    db.shop_orders = [order({ status: 'packed' })];
    expect((await act({ action: 'refund', orderId: ID })).statusCode).toBe(200);
  });
});
