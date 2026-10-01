// La tienda esta cerrada, y lo que Diego paga por cada pieza no sale de la base.
//
// Diego, el 01-oct: "nadie puede ver mis precios de wholesale seller porque son
// solo para mi por eso hay que dejar todo esto blindado de alguna forma".
//
// Estos tests EJECUTAN el handler contra un Supabase de mentira. Uno que
// leyera el codigo buscando la palabra `cost` pasaria igual el dia que alguien
// cambie el select por `*`, que es exactamente como se filtran estas cosas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

// El catalogo de mentira trae `cost` en cada variante, como la tabla real.
// Si el handler lo dejara pasar, se veria en la respuesta.
const ROWS = {
  shop_products: [
    {
      slug: 'butyl-inner-tube',
      name: 'Butyl Inner Tube',
      section: 'parts',
      price_from: '6.95',
      price_to: '8.95',
      photo_ref: 'shop-photos/butyl-inner-tube.webp',
      sort_rank: 0,
      cost: '2.80',
    },
  ],
  shop_variants: [
    { sku: 'TB-20-AV32L', label: '20x1.75 Schrader 32 mm', price: '6.95', cost: '2.80', position: 0, shop_products: { slug: 'butyl-inner-tube' } },
    { sku: 'TB-26-FV48L', label: '26x1.5 Presta 48 mm', price: '8.95', cost: '3.10', position: 1, shop_products: { slug: 'butyl-inner-tube' } },
  ],
};

let selects = [];
let signedFor = [];

function fakeClient(user) {
  const q = (table) => {
    const chain = {
      select(cols) {
        selects.push({ table, cols });
        return chain;
      },
      eq: () => chain,
      order: () => Promise.resolve({ data: ROWS[table], error: null }),
      then: (res) => Promise.resolve({ data: ROWS[table], error: null }).then(res),
    };
    return chain;
  };
  return {
    from: q,
    auth: {
      getUser: async (token) =>
        token === 'good-token' ? { data: { user }, error: null } : { data: { user: null }, error: new Error('bad token') },
    },
    storage: {
      from: () => ({
        createSignedUrls: async (paths) => {
          signedFor = paths;
          return { data: paths.map((p) => ({ path: p, signedUrl: 'https://signed.example/' + p + '?token=xyz' })), error: null };
        },
      }),
    },
  };
}

let currentUser = { id: 'u1', email: 'peredo.dm@gmail.com' };

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient(currentUser) }));
vi.mock('../../api/_security.js', () => ({ guard: async () => true }));

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = (c) => {
    r.statusCode = c;
    return r;
  };
  r.json = (b) => {
    r.body = b;
    return r;
  };
  r.setHeader = (k, v) => {
    r.headers[k] = v;
  };
  return r;
}

let handler;
beforeEach(async () => {
  selects = [];
  signedFor = [];
  currentUser = { id: 'u1', email: 'peredo.dm@gmail.com' };
  vi.resetModules();
  handler = (await import('../../api/shop.js')).default;
});

afterEach(() => {
  delete process.env.SHOP_PREVIEW_EMAILS;
});

const call = (over = {}) => handler({ method: 'GET', headers: { authorization: 'Bearer good-token' }, body: {}, ...over }, fakeRes());

describe('el costo mayorista no sale de la base', () => {
  it('ninguna variante de la respuesta trae el costo', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    const variants = res.body.products.flatMap((p) => p.variants);
    expect(variants.length).toBe(2);
    for (const v of variants) {
      expect(v).not.toHaveProperty('cost');
      expect(Object.values(v)).not.toContain('2.80');
    }
  });

  it('la palabra costo no aparece en ningun lado de la respuesta', async () => {
    const res = await call();
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/cost/i);
    expect(json).not.toContain('2.80');
    expect(json).not.toContain('3.10');
  });

  it('el select nombra las columnas una por una: nunca select(*)', async () => {
    await call();
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) {
      expect(s.cols).not.toBe('*');
      expect(s.cols).not.toContain('cost');
    }
  });
});

describe('sin permiso no hay tienda, y no se nota que existe', () => {
  it('sin token: 404', async () => {
    const res = await call({ headers: {} });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/shop|LEBYCLE|precio/i);
  });

  it('con token invalido: 404, no 401', async () => {
    const res = await call({ headers: { authorization: 'Bearer basura' } });
    expect(res.statusCode).toBe(404);
  });

  it('sesion valida de otra persona: 404, igual que un token roto', async () => {
    currentUser = { id: 'u2', email: 'cualquiera@gmail.com' };
    const res = await call();
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('un token roto y una sesion sin permiso contestan exactamente lo mismo', async () => {
    const roto = await call({ headers: { authorization: 'Bearer basura' } });
    currentUser = { id: 'u2', email: 'cualquiera@gmail.com' };
    const sinPermiso = await call();
    expect(roto.statusCode).toBe(sinPermiso.statusCode);
    expect(roto.body).toEqual(sinPermiso.body);
  });

  it('la lista de emails se puede ampliar por variable de entorno', async () => {
    process.env.SHOP_PREVIEW_EMAILS = 'otro@drbikesydney.com.au, peredo.dm@gmail.com';
    vi.resetModules();
    handler = (await import('../../api/shop.js')).default;
    currentUser = { id: 'u3', email: 'OTRO@drbikesydney.com.au' };
    expect((await call()).statusCode).toBe(200);
  });

  it('sin la variable puesta, solo entra Diego', async () => {
    const { previewEmails, maySeeShop } = await import('../../api/shop.js');
    expect(previewEmails()).toEqual(['peredo.dm@gmail.com']);
    expect(maySeeShop('alguien@gmail.com')).toBe(false);
    expect(maySeeShop('')).toBe(false);
    expect(maySeeShop(null)).toBe(false);
  });
});

describe('las fotos van firmadas, no publicas', () => {
  it('la URL de la foto es una firmada, no una ruta del bucket', async () => {
    const res = await call();
    const img = res.body.products[0].img;
    expect(img).toContain('signed.example');
    expect(img).toContain('token=');
  });

  it('se firman todas de una sola vez, no una llamada por producto', async () => {
    await call();
    expect(signedFor).toEqual(['butyl-inner-tube.webp']);
  });

  it('la respuesta no se guarda en ningun cache compartido', async () => {
    const res = await call();
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});
