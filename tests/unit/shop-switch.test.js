// El interruptor de la tienda: una sola decision, en dos archivos que no se
// pueden contradecir, y que de verdad abre la tienda cuando se da vuelta.
//
// Diego, 04-oct: "que con un solo texto en el futuro te pueda decir 'ahora
// implementalo para todo el mundo' y lo logres hacer". Para que eso sea un
// cambio de una palabra y no una investigacion, este archivo comprueba tres
// cosas:
//
//   1. js/shop.js y api/_shop.js dicen lo mismo. Si uno dice true y el otro
//      false, o se dibuja un boton que lleva a un 404, o el servidor entrega
//      un catalogo que nadie ve.
//   2. Mientras la tienda sea privada, shop.html no se deja indexar.
//   3. Dar vuelta el interruptor ABRE la tienda de verdad: se arma una copia
//      del servidor con true y se la ejecuta. Un test que solo mirara la
//      palabra pasaria igual con un handler que sigue pidiendo sesion.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(f, 'utf8');
const flagIn = (src) => {
  const m = /export const SHOP_IS_PUBLIC = (true|false);/.exec(src);
  return m ? m[1] === 'true' : null;
};

describe('una sola decision', () => {
  it('js/shop.js y api/_shop.js dicen lo mismo', () => {
    const client = flagIn(read('js/shop.js'));
    const server = flagIn(read('api/_shop.js'));
    expect(client, 'js/shop.js perdio SHOP_IS_PUBLIC').not.toBeNull();
    expect(server, 'api/_shop.js perdio SHOP_IS_PUBLIC').not.toBeNull();
    expect(client).toBe(server);
  });

  it('mientras sea privada, shop.html no se deja indexar', () => {
    if (flagIn(read('api/_shop.js'))) return;
    expect(read('shop.html')).toMatch(/<meta name="robots" content="noindex, nofollow">/);
  });

  it('la lista de pasos para abrirla existe y nombra los dos archivos', () => {
    const doc = read('docs/SHOP-OPEN.md');
    expect(doc).toContain('js/shop.js');
    expect(doc).toContain('api/_shop.js');
  });
});

// ── El interruptor dado vuelta, ejecutado ───────────────────────────────────

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
delete process.env.SUPABASE_URL;

const CATALOG = [{ slug: 'tube', name: 'Tube', section: 'parts', price_from: '6.95', price_to: '6.95', photo_ref: null, sort_rank: 0 }];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const c = {
        select: () => c,
        eq: () => c,
        in: () => Promise.resolve({ data: [], error: null }),
        order: () => Promise.resolve({ data: CATALOG, error: null }),
      };
      return c;
    },
    auth: {
      getUser: async (t) =>
        t === 'stranger'
          ? { data: { user: { id: 'u9', email: 'cualquiera@gmail.com' } }, error: null }
          : { data: { user: null }, error: new Error('bad token') },
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  }),
}));
vi.mock('../../api/_security.js', () => ({ guard: async () => false }));

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}

// La copia vive al lado del original para que sus imports relativos
// (./_security.js) resuelvan al mismo modulo, y al mismo doble.
const OPEN_COPY = path.join('api', '_shop.open-copy.test-tmp.js');
let openHandler;
let closedHandler;

beforeAll(async () => {
  const src = read('api/_shop.js');
  expect(src).toContain('export const SHOP_IS_PUBLIC = false;');
  fs.writeFileSync(OPEN_COPY, src.replace('export const SHOP_IS_PUBLIC = false;', 'export const SHOP_IS_PUBLIC = true;'));
  openHandler = (await import('../../' + OPEN_COPY.split(path.sep).join('/'))).handleShop;
  closedHandler = (await import('../../api/_shop.js')).handleShop;
});

afterAll(() => {
  fs.rmSync(OPEN_COPY, { force: true });
});

const get = (headers = {}) => ({ method: 'GET', query: {}, body: {}, headers });
const buy = (headers = {}) => ({
  method: 'POST',
  query: { action: 'checkout' },
  body: { action: 'checkout', items: [] },
  headers,
});

describe('con la tienda cerrada (hoy)', () => {
  it('sin sesion no hay catalogo', async () => {
    expect((await closedHandler(get(), fakeRes())).statusCode).toBe(404);
  });

  it('una cuenta cualquiera tampoco', async () => {
    expect((await closedHandler(get({ authorization: 'Bearer stranger' }), fakeRes())).statusCode).toBe(404);
  });
});

describe('con el interruptor en true', () => {
  it('cualquiera ve el catalogo, aun sin sesion', async () => {
    const res = await openHandler(get(), fakeRes());
    expect(res.statusCode).toBe(200);
    expect(res.body.products.length).toBeGreaterThanOrEqual(0);
    expect(res.body).toHaveProperty('sections');
  });

  it('una cuenta cualquiera puede llegar al cobro', async () => {
    // Carrito vacio: 400 "Your cart is empty". Lo que importa es que NO es 404,
    // o sea que paso la puerta.
    const res = await openHandler(buy({ authorization: 'Bearer stranger' }), fakeRes());
    expect(res.statusCode).not.toBe(404);
  });

  it('comprar sigue pidiendo sesion: un pedido tiene que ser de alguien', async () => {
    expect((await openHandler(buy(), fakeRes())).statusCode).toBe(404);
  });

  it('el catalogo abierto tampoco trae el costo', async () => {
    const res = await openHandler(get(), fakeRes());
    expect(JSON.stringify(res.body)).not.toMatch(/cost/i);
  });
});
