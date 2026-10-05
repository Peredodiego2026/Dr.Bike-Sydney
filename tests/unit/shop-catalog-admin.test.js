// Admin > Shop Products y el stock de la tienda, ejecutados contra una base en
// memoria. La base sabe estar "antes del SQL" (scripts/shop-catalog-admin.sql
// sin correr): pedir description o stock devuelve el mismo error que
// PostgREST, para probar que la tienda sigue andando igual.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SHOP_STRIPE_SECRET_KEY = 'sk_test_x';
process.env.SHOP_STRIPE_PUBLISHABLE_KEY = 'pk_test_x';

let piState;
let intentArgs;
vi.mock('stripe', () => ({
  default: class {
    paymentIntents = {
      create: async (args) => {
        intentArgs = args;
        return { id: 'pi_new', client_secret: 'pi_new_secret' };
      },
      retrieve: async (id) => ({ id, ...piState }),
    };
  },
}));
vi.mock('../../api/_security.js', async (importOriginal) => ({ ...(await importOriginal()), guard: async () => false }));

// ── La base ──────────────────────────────────────────────────────────────────
let db;
let migrated;
let uploads;
const NEW_COLS = ['description', 'stock', 'featured', 'gallery', 'updated_at'];

function table(name) {
  const eqs = [];
  const ins = [];
  let likeF = null;
  let patch = null;
  let del = false;
  let insertRow = null;
  let upsertRows = null;
  let upsertKey = null;
  let cols = '*';
  const rows = () =>
    (db[name] || []).filter(
      (r) =>
        eqs.every(([k, v]) => r[k] === v) &&
        ins.every(([k, vs]) => vs.includes(r[k])) &&
        (!likeF || String(r[likeF[0]]).startsWith(likeF[1].replace('%', '')))
    );
  const missing = (obj) => !migrated && Object.keys(obj).some((k) => NEW_COLS.includes(k));
  const pick = (r) => {
    const out = { ...r };
    // Antes del SQL esas columnas no existen: no pueden volver en la fila.
    if (!migrated) for (const c of NEW_COLS) delete out[c];
    if (name === 'shop_variants') {
      const p = db.shop_products.find((x) => x.id === r.product_id);
      out.shop_products = p ? { name: p.name, active: p.active, slug: p.slug } : null;
    }
    return out;
  };
  const run = () => {
    // Un corte de red justo al leer el stock: se tira, no vuelve como error.
    if (db.stockThrows && name === 'shop_variants' && cols === 'sku, stock') throw new Error('fetch failed');
    if (!migrated && NEW_COLS.some((c) => cols.includes(c))) {
      return { data: null, error: { message: 'column ' + name + '.' + NEW_COLS.find((c) => cols.includes(c)) + ' does not exist', code: '42703' } };
    }
    if (upsertRows) {
      if (!migrated && name === 'shop_settings') return { data: null, error: { message: 'relation "shop_settings" does not exist', code: '42P01' } };
      const key = upsertKey || 'id';
      for (const r of upsertRows) {
        const hit = (db[name] ||= []).find((x) => x[key] === r[key]);
        if (hit) Object.assign(hit, r);
        else db[name].push({ ...r });
      }
      return { data: null, error: null };
    }
    if (!migrated && name === 'shop_settings') return { data: null, error: { message: 'relation "shop_settings" does not exist', code: '42P01' } };
    if (insertRow) {
      if (missing(insertRow)) return { data: null, error: { message: "Could not find the 'description' column of '" + name + "' in the schema cache", code: 'PGRST204' } };
      const row = { id: 'id-' + Math.random().toString(36).slice(2), ...insertRow };
      (db[name] ||= []).push(row);
      return { data: [row], error: null };
    }
    if (patch) {
      if (missing(patch)) return { data: null, error: { message: "Could not find the 'description' column of '" + name + "' in the schema cache", code: 'PGRST204' } };
      const hit = rows();
      hit.forEach((r) => Object.assign(r, patch));
      return { data: hit.map((r) => ({ id: r.id, slug: r.slug })), error: null };
    }
    if (del) {
      const hit = rows();
      db[name] = db[name].filter((r) => !hit.includes(r));
      if (name === 'shop_products') db.shop_variants = db.shop_variants.filter((v) => !hit.some((p) => p.id === v.product_id));
      return { data: hit.map((r) => ({ slug: r.slug, sku: r.sku })), error: null };
    }
    return { data: rows().map(pick), error: null };
  };
  const q = {
    select: (c) => ((cols = c || '*'), q),
    order: () => q,
    eq: (k, v) => (eqs.push([k, v]), q),
    in: (k, vs) => (ins.push([k, vs]), q),
    like: (k, v) => ((likeF = [k, v]), q),
    update: (p) => ((patch = p), q),
    delete: () => ((del = true), q),
    insert: (r) => ((insertRow = r), q),
    upsert: (r, opts) => ((upsertRows = r), (upsertKey = opts?.onConflict), q),
    single: async () => {
      const r = run();
      if (r.error) return r;
      return r.data?.[0] ? { data: r.data[0], error: null } : { data: null, error: new Error('no rows') };
    },
    maybeSingle: async () => {
      const r = run();
      if (r.error) return r;
      return { data: r.data?.[0] || null, error: null };
    },
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return q;
}
const storage = {
  from: () => ({
    createSignedUrls: async (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: 'https://signed/' + p })), error: null }),
    createSignedUploadUrl: async (path) => {
      uploads.push(path);
      return { data: { token: 'tok-' + path }, error: null };
    },
  }),
};
const sb = { from: (n) => table(n), storage, auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'peredo.dm@gmail.com' } }, error: null }) } };
vi.mock('@supabase/supabase-js', () => ({ createClient: () => sb }));

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}

let shop;
let admin;
let sent;

beforeEach(async () => {
  migrated = true;
  uploads = [];
  sent = [];
  intentArgs = null;
  piState = { status: 'succeeded', amount_received: 1800, metadata: {} };
  db = {
    shop_products: [
      { id: 'p1', slug: 'brake-pads', name: 'Brake Pads', section: 'parts', price_from: 9, price_to: 12, photo_ref: 'shop-photos/brake-pads.webp', sort_rank: 1, active: true, description: 'Resin pads.', featured: false },
      { id: 'p2', slug: 'bb-socket', name: 'BB Socket', section: 'tools', price_from: 21.95, price_to: 21.95, photo_ref: null, sort_rank: 2, active: true, description: null, featured: false },
    ],
    shop_variants: [
      { sku: 'BP-1', label: 'Resin', price: 9, cost: 1.5, stock: null, position: 0, product_id: 'p1' },
      { sku: 'BP-2', label: 'Metal', price: 12, cost: 2, stock: 0, position: 1, product_id: 'p1' },
      { sku: 'TS-1', label: 'S39', price: 21.95, cost: 6, stock: 3, position: 0, product_id: 'p2' },
    ],
    shop_orders: [],
    shop_order_items: [],
  };
  process.env.INTERNAL_API_SECRET = 'internal-test';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({}) };
    })
  );
  vi.resetModules();
  shop = await import('../../api/_shop.js');
  admin = await import('../../api/_shop-admin-catalog.js');
});
afterEach(() => vi.unstubAllGlobals());

const asDiego = (method, body, query = {}) => ({ method, query, body, headers: { authorization: 'Bearer good' } });
const catalog = () => shop.handleShop(asDiego('GET', {}), fakeRes());
const checkout = (items) => shop.handleShop(asDiego('POST', { action: 'checkout', items }, { action: 'checkout' }), fakeRes());

// ── La tienda ────────────────────────────────────────────────────────────────

describe('el catalogo', () => {
  it('trae la descripcion y el stock de cada opcion, y nunca el costo', async () => {
    const res = await catalog();
    expect(res.statusCode).toBe(200);
    const pads = res.body.products.find((p) => p.slug === 'brake-pads');
    expect(pads.desc).toBe('Resin pads.');
    expect(pads.variants.map((v) => v.stock)).toEqual([null, 0]);
    expect(JSON.stringify(res.body)).not.toMatch(/"cost"/);
  });

  it('antes del SQL sigue andando: sin descripcion ni stock, pero 200', async () => {
    migrated = false;
    const res = await catalog();
    expect(res.statusCode).toBe(200);
    expect(res.body.products).toHaveLength(2);
    expect(res.body.products[0].desc).toBe('');
    expect(res.body.products[0].variants[0].stock).toBeNull();
  });
});

describe('el cobro mira el stock', () => {
  it('una opcion agotada no se cobra', async () => {
    const res = await checkout([{ sku: 'BP-2', qty: 1 }]);
    expect(res.statusCode).toBe(409);
    expect(res.body.soldOut).toEqual([{ sku: 'BP-2', left: 0 }]);
    expect(intentArgs).toBeNull();
    expect(db.shop_orders).toHaveLength(0);
  });

  it('pedir mas de lo que queda tampoco, y dice cuantos quedan', async () => {
    const res = await checkout([{ sku: 'TS-1', qty: 4 }]);
    expect(res.statusCode).toBe(409);
    expect(res.body.soldOut).toEqual([{ sku: 'TS-1', left: 3 }]);
  });

  it('sin limite, o dentro de lo que queda, se cobra', async () => {
    const res = await checkout([
      { sku: 'BP-1', qty: 5 },
      { sku: 'TS-1', qty: 3 },
    ]);
    expect(res.statusCode).toBe(200);
    expect(intentArgs).not.toBeNull();
  });

  it('antes del SQL el cobro sigue andando', async () => {
    migrated = false;
    const res = await checkout([{ sku: 'BP-2', qty: 1 }]);
    expect(res.statusCode).toBe(200);
  });
});

describe('el stock baja cuando se cobra', () => {
  const order = (status = 'pending') => ({
    id: 'o1', client_id: 'u1', client_email: 'a@b.com', client_name: 'Ana', client_phone: null,
    ship_address: '1 St', ship_suburb: 'Bondi', ship_postcode: '2026',
    payment_intent_id: 'pi_1', status, shipping: 0, total: 18, mode: 'test',
  });
  beforeEach(() => {
    db.shop_order_items = [
      { order_id: 'o1', sku: 'TS-1', qty: 2, name: 'BB Socket', variant: 'S39', line_total: 43.9 },
      { order_id: 'o1', sku: 'BP-1', qty: 1, name: 'Brake Pads', variant: 'Resin', line_total: 9 },
    ];
  });

  it('las opciones con limite bajan; las sin limite no se tocan', async () => {
    db.shop_orders = [order()];
    await shop.settleOrder(sb, order(), '');
    expect(db.shop_variants.find((v) => v.sku === 'TS-1').stock).toBe(1);
    expect(db.shop_variants.find((v) => v.sku === 'BP-1').stock).toBeNull();
  });

  it('un pedido que ya estaba pagado no vuelve a descontar', async () => {
    db.shop_orders = [order('paid')];
    await shop.settleOrder(sb, order('paid'), '');
    expect(db.shop_variants.find((v) => v.sku === 'TS-1').stock).toBe(3);
  });

  it('nunca queda negativo', async () => {
    db.shop_variants.find((v) => v.sku === 'TS-1').stock = 1;
    db.shop_orders = [order()];
    await shop.settleOrder(sb, order(), '');
    expect(db.shop_variants.find((v) => v.sku === 'TS-1').stock).toBe(0);
  });
});

// ── Admin > Shop Products ────────────────────────────────────────────────────

const save = (product, variants) => admin.saveProduct(sb, { body: { product, variants } }, fakeRes());
const v = (sku, label, price, extra = {}) => ({ sku, label, price, cost: null, stock: null, ...extra });

describe('la lista de Admin', () => {
  it('trae costo, stock, ocultos y la foto firmada', async () => {
    db.shop_products[1].active = false;
    const res = await admin.listProducts(sb, fakeRes());
    expect(res.body.migrated).toBe(true);
    const pads = res.body.products.find((p) => p.slug === 'brake-pads');
    expect(pads.variants[0]).toMatchObject({ sku: 'BP-1', cost: 1.5, stock: null });
    expect(pads.img).toBe('https://signed/brake-pads.webp');
    expect(res.body.products.find((p) => p.slug === 'bb-socket').active).toBe(false);
  });

  it('antes del SQL lista igual y lo avisa', async () => {
    migrated = false;
    const res = await admin.listProducts(sb, fakeRes());
    expect(res.statusCode).toBe(200);
    expect(res.body.migrated).toBe(false);
    expect(res.body.products).toHaveLength(2);
  });
});

describe('guardar un producto', () => {
  it('cambia precios, costo y stock, y recalcula el "desde/hasta"', async () => {
    const res = await save({ slug: 'brake-pads', name: 'Brake Pads', section: 'parts', description: 'New text', active: true }, [
      v('BP-1', 'Resin', 10, { cost: 2, stock: 7 }),
      v('BP-2', 'Metal', 14, { stock: 0 }),
    ]);
    expect(res.statusCode).toBe(200);
    const p = db.shop_products.find((x) => x.slug === 'brake-pads');
    expect(p).toMatchObject({ price_from: 10, price_to: 14, description: 'New text' });
    expect(db.shop_variants.find((x) => x.sku === 'BP-1')).toMatchObject({ price: 10, cost: 2, stock: 7 });
  });

  it('una opcion que se quito en la pantalla se borra; una nueva se crea', async () => {
    await save({ slug: 'brake-pads', name: 'Brake Pads', section: 'parts', active: true }, [v('BP-1', 'Resin', 9), v('BP-3', 'Ceramic', 15)]);
    const skus = db.shop_variants.filter((x) => x.product_id === 'p1').map((x) => x.sku).sort();
    expect(skus).toEqual(['BP-1', 'BP-3']);
  });

  it('un producto nuevo recibe un slug libre', async () => {
    const res = await save({ name: 'Brake Pads', section: 'parts', active: true }, [v('BP-NEW', 'Organic', 11)]);
    expect(res.statusCode).toBe(200);
    expect(res.body.slug).toBe('brake-pads-2');
    expect(db.shop_products.find((x) => x.slug === 'brake-pads-2')).toMatchObject({ price_from: 11, active: true });
  });

  it('ocultar no borra: active = false', async () => {
    await save({ slug: 'bb-socket', name: 'BB Socket', section: 'tools', active: false }, [v('TS-1', 'S39', 21.95)]);
    expect(db.shop_products.find((x) => x.slug === 'bb-socket').active).toBe(false);
    expect(db.shop_variants.some((x) => x.sku === 'TS-1')).toBe(true);
  });

  it.each([
    ['sin nombre', { name: '', section: 'parts' }, [v('A-1', 'x', 5)], /name/],
    ['seccion inventada', { name: 'X', section: 'weapons' }, [v('A-1', 'x', 5)], /section/],
    ['sin opciones', { name: 'X', section: 'parts' }, [], /at least one/],
    ['precio cero', { name: 'X', section: 'parts' }, [v('A-1', 'x', 0)], /price/],
    ['stock con decimales', { name: 'X', section: 'parts' }, [v('A-1', 'x', 5, { stock: 1.5 })], /whole number/],
    ['SKU repetido', { name: 'X', section: 'parts' }, [v('A-1', 'x', 5), v('A-1', 'y', 6)], /repeated/],
    ['SKU con coma', { name: 'X', section: 'parts' }, [v('A,1', 'x', 5)], /code/],
    ['foto inventada', { name: 'X', section: 'parts', photoRef: 'https://evil.example/x.png' }, [v('A-1', 'x', 5)], /photo/],
  ])('rechaza %s sin escribir nada', async (_, product, variants, re) => {
    const before = JSON.stringify(db);
    const res = await save({ active: true, ...product }, variants);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(re);
    expect(JSON.stringify(db)).toBe(before);
  });

  it('un SKU que ya es de otro producto se rechaza', async () => {
    const res = await save({ name: 'Other', section: 'parts', active: true }, [v('TS-1', 'x', 5)]);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/another product/);
  });

  it('antes del SQL dice que SQL falta, en vez de un error de base', async () => {
    migrated = false;
    const res = await save({ slug: 'brake-pads', name: 'Brake Pads', section: 'parts', active: true }, [v('BP-1', 'Resin', 9)]);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('shop-catalog-admin.sql');
  });
});

describe('borrar y fotos', () => {
  it('borrar se lleva el producto y sus opciones', async () => {
    const res = await admin.deleteProduct(sb, { body: { slug: 'brake-pads' } }, fakeRes());
    expect(res.statusCode).toBe(200);
    expect(db.shop_products.some((x) => x.slug === 'brake-pads')).toBe(false);
    expect(db.shop_variants.some((x) => x.product_id === 'p1')).toBe(false);
  });

  it('borrar uno que no existe es 404', async () => {
    expect((await admin.deleteProduct(sb, { body: { slug: 'nope' } }, fakeRes())).statusCode).toBe(404);
  });

  it('la subida de foto pide un permiso al bucket privado, con un nombre limpio', async () => {
    const res = await admin.photoUploadUrl(sb, { body: { slug: '', name: 'Brake Pads <b>', ext: 'jpg' } }, fakeRes());
    expect(res.statusCode).toBe(200);
    expect(res.body.path).toMatch(/^brake-pads-b-[a-z0-9]+\.jpg$/);
    expect(res.body.photoRef).toBe('shop-photos/' + res.body.path);
    expect(uploads).toEqual([res.body.path]);
  });
});

describe('lo que encontro la segunda revision', () => {
  it('si leer el stock se cae, el pedido queda pagado Y salen los avisos', async () => {
    const order = { id: 'o9', client_id: 'u1', client_email: 'a@b.com', client_name: 'Ana', client_phone: null, ship_address: '1 St', ship_suburb: 'Bondi', ship_postcode: '2026', payment_intent_id: 'pi_9', status: 'pending', shipping: 0, total: 18, mode: 'test' };
    db.shop_orders = [order];
    db.shop_order_items = [{ order_id: 'o9', sku: 'TS-1', qty: 1, name: 'BB Socket', variant: 'S39', line_total: 18 }];
    db.stockThrows = true;
    const out = await shop.settleOrder(sb, { ...order }, '');
    expect(out.body.status).toBe('paid');
    expect(sent).toHaveLength(2);
  });

  it('guardar desde el editor no le quita el "destacado"', async () => {
    db.shop_products[0].featured = true;
    await save({ slug: 'brake-pads', name: 'Brake Pads', section: 'parts', active: true }, [v('BP-1', 'Resin', 9), v('BP-2', 'Metal', 12)]);
    expect(db.shop_products[0].featured).toBe(true);
  });

  it('pero si lo manda explicito, se guarda', async () => {
    db.shop_products[0].featured = true;
    await save({ slug: 'brake-pads', name: 'Brake Pads', section: 'parts', active: true, featured: false }, [v('BP-1', 'Resin', 9)]);
    expect(db.shop_products[0].featured).toBe(false);
  });
});

// ── PR 4: envio, plazo, reglas e importacion ─────────────────────────────────

describe('el envio y el plazo', () => {
  const setShip = (fee, freeOver, delivery) => {
    db.shop_settings = [{ key: 'shipping', value: { fee, freeOver } }];
    if (delivery) db.shop_settings.push({ key: 'delivery', value: delivery });
  };

  it('sin configurar: envio 0 y el catalogo no dice nada de envio ni plazo', async () => {
    const res = await catalog();
    expect(res.body.shipping).toBeUndefined();
    expect(res.body.delivery).toBeUndefined();
    const co = await checkout([{ sku: 'BP-1', qty: 1 }]);
    expect(co.body.shipping).toBe(0);
    expect(co.body.total).toBe(9);
  });

  it('configurado: el catalogo lo dice y el cobro lo suma', async () => {
    setShip(9.95, 100, { minDays: 5, maxDays: 10 });
    const res = await catalog();
    expect(res.body.shipping).toEqual({ fee: 9.95, freeOver: 100 });
    expect(res.body.delivery).toEqual({ minDays: 5, maxDays: 10 });
    const co = await checkout([{ sku: 'BP-1', qty: 1 }]);
    expect(co.body).toMatchObject({ subtotal: 9, shipping: 9.95, total: 18.95 });
    expect(intentArgs.amount).toBe(1895);
  });

  it('desde el "gratis desde", no se cobra envio', async () => {
    setShip(9.95, 100);
    const co = await checkout([{ sku: 'TS-1', qty: 3 }, { sku: 'BP-1', qty: 5 }]);
    expect(co.body.subtotal).toBe(110.85);
    expect(co.body.shipping).toBe(0);
  });

  it('antes del SQL el cobro sigue andando, sin envio', async () => {
    migrated = false;
    const co = await checkout([{ sku: 'BP-1', qty: 1 }]);
    expect(co.statusCode).toBe(200);
    expect(co.body.shipping).toBe(0);
  });

  it('la cuenta del servidor y la del navegador son la misma', async () => {
    const client = await import('../../js/shop.js');
    for (const [fee, freeOver, sub] of [[9.95, 100, 50], [9.95, 100, 100], [9.95, null, 500], [0, null, 10]]) {
      const settings = { shipping: { fee, freeOver } };
      expect(client.shippingFor(shop.publicSettings(settings), sub)).toBe(shop.shippingFor(settings, sub));
    }
  });
});

const call = (fn, body) => fn(sb, { body }, fakeRes());

describe('guardar los ajustes', () => {
  it('sin guardar nunca, trae las reglas de precio originales', async () => {
    const res = await admin.getSettings(sb, fakeRes());
    expect(res.body.pricing.fx).toBe(1.4352);
    expect(res.body.pricing.bands).toHaveLength(4);
  });

  it('guarda envio, plazo y reglas, y se leen igual', async () => {
    const body = { shipping: { fee: 9.95, freeOver: 100 }, delivery: { minDays: 5, maxDays: 10 }, pricing: { fx: 1.5, minPrice: 5.95, bands: [{ upTo: 20, mult: 3 }, { upTo: null, mult: 2 }] } };
    expect((await call(admin.saveSettings, body)).statusCode).toBe(200);
    const res = await admin.getSettings(sb, fakeRes());
    expect(res.body).toMatchObject(body);
  });

  it.each([
    ['envio negativo', { shipping: { fee: -1 } }, /fee/],
    ['plazo al reves', { delivery: { minDays: 10, maxDays: 5 } }, /maximum/],
    ['plazo con decimales', { delivery: { minDays: 2.5 } }, /whole number/],
    ['tasa absurda', { pricing: { fx: 0, minPrice: 5, bands: [{ upTo: null, mult: 2 }] } }, /exchange rate/],
    ['bandas desordenadas', { pricing: { fx: 1.4, minPrice: 5, bands: [{ upTo: 30, mult: 2 }, { upTo: 10, mult: 3 }, { upTo: null, mult: 1.5 }] } }, /bigger/],
    ['multiplicador menor a 1', { pricing: { fx: 1.4, minPrice: 5, bands: [{ upTo: null, mult: 0.5 }] } }, /multiplier/],
  ])('rechaza %s sin guardar nada', async (_, body, re) => {
    const res = await call(admin.saveSettings, body);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(re);
    expect(db.shop_settings || []).toHaveLength(0);
  });

  it('antes del SQL dice que SQL falta', async () => {
    migrated = false;
    const res = await call(admin.saveSettings, { shipping: { fee: 5 } });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('shop-catalog-admin.sql');
  });
});

describe('aplicar una importacion', () => {
  it('actualiza costos siempre, precios solo donde se aceptaron, y agota lo marcado', async () => {
    const res = await call(admin.applyImport, {
      updates: [
        { sku: 'BP-1', cost: 2.5, price: 10.95 },
        { sku: 'TS-1', cost: 7, price: null },
      ],
      soldOut: ['BP-2'],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.updated).toBe(3);
    const v = (sku) => db.shop_variants.find((x) => x.sku === sku);
    expect(v('BP-1')).toMatchObject({ cost: 2.5, price: 10.95 });
    expect(v('TS-1')).toMatchObject({ cost: 7, price: 21.95 });
    expect(v('BP-2').stock).toBe(0);
    // El "desde/hasta" del producto se recalcula con el precio nuevo.
    expect(db.shop_products.find((p) => p.id === 'p1')).toMatchObject({ price_from: 10.95, price_to: 12 });
  });

  it('nunca crea opciones: un codigo que no esta en la tienda se salta', async () => {
    const res = await call(admin.applyImport, { updates: [{ sku: 'NO-EXISTE', cost: 1 }, { sku: 'BP-1', cost: 2 }] });
    expect(res.body).toMatchObject({ updated: 1, skipped: 1 });
    expect(db.shop_variants.some((x) => x.sku === 'NO-EXISTE')).toBe(false);
  });

  it.each([
    ['nada', {}, /Nothing/],
    ['costo negativo', { updates: [{ sku: 'BP-1', cost: -1 }] }, /cost/],
    ['precio cero', { updates: [{ sku: 'BP-1', cost: 1, price: 0 }] }, /price/],
    ['codigo raro', { updates: [{ sku: 'A,B', cost: 1 }] }, /code/],
  ])('rechaza %s sin escribir nada', async (_, body, re) => {
    const before = JSON.stringify(db.shop_variants);
    const res = await call(admin.applyImport, body);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(re);
    expect(JSON.stringify(db.shop_variants)).toBe(before);
  });
});

// ── PR 5: destacados y fotos extra ───────────────────────────────────────────

describe('destacados y fotos extra', () => {
  it('el catalogo dice cual es destacado y trae las fotos extra firmadas', async () => {
    db.shop_products[0].featured = true;
    db.shop_products[0].gallery = ['shop-photos/pads-2.webp', 'shop-photos/pads-3.webp'];
    const res = await catalog();
    const pads = res.body.products.find((p) => p.slug === 'brake-pads');
    expect(pads.featured).toBe(true);
    expect(pads.gallery).toEqual(['https://signed/pads-2.webp', 'https://signed/pads-3.webp']);
    expect(res.body.products.find((p) => p.slug === 'bb-socket').gallery).toEqual([]);
  });

  it('Admin guarda las fotos extra y el destacado', async () => {
    const res = await save(
      { slug: 'brake-pads', name: 'Brake Pads', section: 'parts', active: true, featured: true, gallery: ['shop-photos/a-1.webp', 'shop-photos/b-2.jpg'] },
      [v('BP-1', 'Resin', 9)]
    );
    expect(res.statusCode).toBe(200);
    expect(db.shop_products[0]).toMatchObject({ featured: true, gallery: ['shop-photos/a-1.webp', 'shop-photos/b-2.jpg'] });
  });

  it('si el panel no manda fotos extra, no se borran', async () => {
    db.shop_products[0].gallery = ['shop-photos/keep-1.webp'];
    await save({ slug: 'brake-pads', name: 'Brake Pads', section: 'parts', active: true }, [v('BP-1', 'Resin', 9)]);
    expect(db.shop_products[0].gallery).toEqual(['shop-photos/keep-1.webp']);
  });

  it.each([
    ['mas de 8', Array.from({ length: 9 }, (_, i) => 'shop-photos/p-' + i + '.webp'), /Up to 8/],
    ['una foto de afuera', ['https://evil.example/x.png'], /not valid/],
  ])('rechaza %s', async (_, gallery, re) => {
    const res = await save({ slug: 'brake-pads', name: 'Brake Pads', section: 'parts', active: true, gallery }, [v('BP-1', 'Resin', 9)]);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(re);
  });
});
