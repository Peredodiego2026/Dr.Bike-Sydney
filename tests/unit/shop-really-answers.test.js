// La tienda contesta de verdad: este test NO simula guard().
//
// Los otros dos archivos de la tienda lo reemplazan por un doble, y ahi estuvo
// el agujero: el doble devolvia `true`, que en guard() significa "ya conteste,
// cortá". El handler tenia la condicion invertida, asi que con el doble seguia
// de largo y los 34 tests pasaban en verde mientras en produccion la tienda
// contestaba 405 a absolutamente todo. El catalogo no cargo nunca.
//
// Un doble que se equivoca en el MISMO sentido que el codigo no prueba nada.
// Por eso aca se usa el guard real: si alguien vuelve a invertir la condicion,
// o pone un guard que solo admite POST delante de un catalogo que se lee con
// GET, este archivo se pone rojo.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// SUPABASE_URL NO se pone, a proposito: en Vercel no esta configurada y el
// proyecto entero vive del respaldo escrito en cada archivo. La version
// anterior de esta linea la ponia a mano, y por eso ningun test vio que
// api/_shop.js no tenia respaldo y contestaba 404 a todos, incluida la cuenta
// de Diego. Un entorno de prueba con algo que produccion no tiene esconde
// exactamente esta clase de bug.
delete process.env.SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const c = {
        select: () => c,
        eq: () => c,
        in: () => Promise.resolve({ data: [], error: null }),
        order: () => Promise.resolve({ data: [], error: null }),
      };
      return c;
    },
    auth: {
      getUser: async (t) =>
        t === 'good'
          ? { data: { user: { id: 'u1', email: 'peredo.dm@gmail.com' } }, error: null }
          : { data: { user: null }, error: new Error('bad token') },
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  }),
}));

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {}, ended: false };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  r.end = () => ((r.ended = true), r);
  return r;
}

const req = (over = {}) => ({
  method: 'GET',
  url: '/api/shop',
  query: {},
  body: {},
  headers: { authorization: 'Bearer good', host: 'drbikesydney.com.au', origin: 'https://drbikesydney.com.au' },
  ...over,
});

let handleShop;
beforeEach(async () => {
  vi.resetModules();
  handleShop = (await import('../../api/_shop.js')).handleShop;
});

describe('el catalogo se pide con GET y tiene que pasar', () => {
  it('un GET con sesion valida NO devuelve 405', async () => {
    const res = await handleShop(req(), fakeRes());
    expect(res.statusCode).not.toBe(405);
    expect(res.statusCode).toBe(200);
  });

  it('el GET llega a contestar un catalogo, no a cortarse antes', async () => {
    const res = await handleShop(req(), fakeRes());
    expect(res.body).toHaveProperty('products');
    expect(res.body).toHaveProperty('sections');
  });

  it('un POST de cobro tampoco devuelve 405', async () => {
    const res = await handleShop(
      req({ method: 'POST', query: { action: 'checkout' }, body: { action: 'checkout', items: [] } }),
      fakeRes()
    );
    expect(res.statusCode).not.toBe(405);
  });

  it('sin permiso sigue siendo 404, con el guard de verdad puesto', async () => {
    const res = await handleShop(req({ headers: { authorization: 'Bearer basura', host: 'x', origin: 'https://drbikesydney.com.au' } }), fakeRes());
    expect(res.statusCode).toBe(404);
  });
});

describe('el despacho de /api/shop no queda detras de un guard de POST', () => {
  it('api/auth.js manda role=shop antes de su guard de POST', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/auth.js', 'utf8');
    const despacho = src.indexOf("if (role === 'shop') return handleShop(req, res);");
    const guardPost = src.indexOf("await guard(req, res, { method: 'POST'");
    expect(despacho, 'el despacho de shop desaparecio de auth.js').toBeGreaterThan(-1);
    expect(guardPost, 'el guard POST desaparecio de auth.js').toBeGreaterThan(-1);
    // Si el despacho queda DESPUES del guard que solo admite POST, el catalogo
    // -que se lee con GET- nunca llega: 405 para todo el mundo.
    expect(despacho).toBeLessThan(guardPost);
  });
});
