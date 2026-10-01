// El carrito de la tienda LEBYCLE, y de donde sale el catalogo.
//
// Un carrito que guarda el precio adentro es un carrito que el cliente puede
// editar: abrir las herramientas del navegador, poner 0.01 y pagar. Por eso
// aca solo se guarda SKU y cantidad, y el precio lo pone el catalogo cada vez
// que se lee. Estos tests EJECUTAN las funciones contra un localStorage de
// mentira; uno que mirara el codigo pasaria igual con el precio guardado.
import { describe, it, expect, beforeEach, vi } from 'vitest';

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
}

const CATALOG = {
  sections: [
    { id: 'parts', name: 'Parts' },
    { id: 'tools', name: 'Tools' },
  ],
  products: [
    {
      slug: 'butyl-inner-tube',
      name: 'Butyl Inner Tube',
      cat: 'parts',
      from: 6.95,
      to: 8.95,
      img: 'https://signed.example/shop/butyl-inner-tube.webp?token=xyz',
      variants: [
        { sku: 'TB-20-AV32L', label: '20x1.75 Schrader 32 mm', price: 6.95 },
        { sku: 'TB-26-FV48L', label: '26x1.5 Presta 48 mm', price: 8.95 },
      ],
    },
    {
      slug: 'bb-socket',
      name: 'BB Socket',
      cat: 'tools',
      from: 21.95,
      to: 21.95,
      img: null,
      variants: [{ sku: 'TS-BBT-S39', label: 'S39/16', price: 21.95 }],
    },
    {
      slug: 'air-spring-fork',
      name: 'Air Spring Fork',
      cat: 'parts',
      from: 131.95,
      to: 160.95,
      img: null,
      variants: [{ sku: 'FK-AIR-27', label: '27.5', price: 131.95 }],
    },
  ],
};

let shop;
beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', fakeStorage());
  shop = await import('../../js/shop.js');
});

describe('el catalogo no se baja sin sesion', () => {
  it('sin token no se llama al servidor siquiera', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(shop.loadCatalog(null)).rejects.toThrow(/sign in/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('manda el token como Bearer', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => CATALOG }));
    vi.stubGlobal('fetch', fetchSpy);
    await shop.loadCatalog('tok-123');
    expect(fetchSpy).toHaveBeenCalledWith('/api/shop', { headers: { Authorization: 'Bearer tok-123' } });
  });

  it('un 404 se traduce a que esta cuenta no tiene la tienda', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    await expect(shop.loadCatalog('tok')).rejects.toThrow(/not available on this account/i);
  });

  it('dos llamadas a la vez bajan el catalogo una sola vez', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => CATALOG }));
    vi.stubGlobal('fetch', fetchSpy);
    await Promise.all([shop.loadCatalog('tok'), shop.loadCatalog('tok')]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('si falla, el siguiente intento vuelve a pedirlo', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      n++;
      if (n === 1) throw new Error('offline');
      return { ok: true, status: 200, json: async () => CATALOG };
    });
    await expect(shop.loadCatalog('tok')).rejects.toThrow('offline');
    await expect(shop.loadCatalog('tok')).resolves.toMatchObject({ products: expect.any(Array) });
    expect(n).toBe(2);
  });
});

describe('quien ve el boton de la tienda', () => {
  it('lo ve Diego, y nadie mas', () => {
    expect(shop.canSeeShop({ email: 'peredo.dm@gmail.com' })).toBe(true);
    expect(shop.canSeeShop({ email: 'PEREDO.DM@Gmail.com  ' })).toBe(true);
    expect(shop.canSeeShop({ email: 'alguien@gmail.com' })).toBe(false);
  });

  it('no lo ve quien no inicio sesion', () => {
    expect(shop.canSeeShop(null)).toBe(false);
    expect(shop.canSeeShop({})).toBe(false);
    expect(shop.canSeeShop({ email: '' })).toBe(false);
  });
});

describe('el carrito guarda cantidades, nunca precios', () => {
  it('lo que se escribe en localStorage no tiene ningun importe', () => {
    shop.addToCart('TB-20-AV32L', 2);
    const raw = localStorage.getItem('drbike-shop-cart');
    expect(raw).toContain('TB-20-AV32L');
    expect(raw).not.toContain('6.95');
    expect(JSON.parse(raw)).toEqual([{ sku: 'TB-20-AV32L', qty: 2 }]);
  });

  it('sumar el mismo SKU acumula en vez de duplicar la linea', () => {
    shop.addToCart('TB-20-AV32L', 1);
    shop.addToCart('TB-20-AV32L', 3);
    expect(shop.getCart()).toEqual([{ sku: 'TB-20-AV32L', qty: 4 }]);
  });

  it('no deja pasar de 20 por linea', () => {
    shop.addToCart('TB-20-AV32L', 999);
    expect(shop.getCart()[0].qty).toBe(20);
    shop.setQty('TB-20-AV32L', 50);
    expect(shop.getCart()[0].qty).toBe(20);
  });

  it('poner cantidad 0 saca la linea', () => {
    shop.addToCart('TB-20-AV32L', 2);
    shop.setQty('TB-20-AV32L', 0);
    expect(shop.getCart()).toEqual([]);
  });

  it('cuenta las unidades, no las lineas', () => {
    shop.addToCart('TB-20-AV32L', 3);
    shop.addToCart('TS-BBT-S39', 2);
    expect(shop.cartCount()).toBe(5);
  });
});

describe('el precio sale del catalogo cada vez', () => {
  it('multiplica el precio de la variante por la cantidad', () => {
    shop.addToCart('TB-20-AV32L', 2);
    shop.addToCart('TS-BBT-S39', 1);
    const { items, subtotal } = shop.priceCart(CATALOG);
    expect(items[0]).toMatchObject({ name: 'Butyl Inner Tube', variant: '20x1.75 Schrader 32 mm', unit: 6.95, total: 13.9 });
    expect(subtotal).toBe(35.85);
  });

  it('un SKU manipulado a mano no inventa un precio: queda marcado', () => {
    localStorage.setItem('drbike-shop-cart', JSON.stringify([{ sku: 'NO-EXISTE', qty: 1 }]));
    const { items, subtotal, hasGone } = shop.priceCart(CATALOG);
    expect(items[0].gone).toBe(true);
    expect(items[0].unit).toBe(0);
    expect(subtotal).toBe(0);
    expect(hasGone).toBe(true);
  });

  it('un carrito con un precio escrito a mano se ignora: manda el catalogo', () => {
    localStorage.setItem('drbike-shop-cart', JSON.stringify([{ sku: 'TS-BBT-S39', qty: 1, price: 0.01 }]));
    expect(shop.priceCart(CATALOG).subtotal).toBe(21.95);
  });
});

describe('un localStorage roto no rompe la tienda', () => {
  it('con basura adentro, el carrito arranca vacio', () => {
    localStorage.setItem('drbike-shop-cart', 'esto no es json');
    expect(shop.getCart()).toEqual([]);
    expect(shop.cartCount()).toBe(0);
  });

  it('si leer tira una excepcion, el carrito arranca vacio', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
    });
    const s = await import('../../js/shop.js');
    expect(s.getCart()).toEqual([]);
    expect(() => s.addToCart('TB-20-AV32L', 1)).not.toThrow();
  });

  it('descarta las lineas sin SKU o sin cantidad usable', () => {
    localStorage.setItem('drbike-shop-cart', JSON.stringify([{ sku: 'TS-BBT-S39', qty: 1 }, { qty: 3 }, { sku: 'X', qty: 'dos' }]));
    expect(shop.getCart()).toEqual([{ sku: 'TS-BBT-S39', qty: 1 }]);
  });
});

describe('filtros y orden', () => {
  it('filtra por seccion', () => {
    expect(shop.filterProducts(CATALOG, { sections: ['tools'] }).map((p) => p.slug)).toEqual(['bb-socket']);
  });

  it('filtra por tramo de precio usando el precio que se ve en la tarjeta', () => {
    expect(shop.filterProducts(CATALOG, { bands: ['under10'] }).map((p) => p.slug)).toEqual(['butyl-inner-tube']);
  });

  it('busca por nombre y por SKU', () => {
    expect(shop.filterProducts(CATALOG, { query: 'socket' }).map((p) => p.slug)).toEqual(['bb-socket']);
    expect(shop.filterProducts(CATALOG, { query: 'tb-26' }).map((p) => p.slug)).toEqual(['butyl-inner-tube']);
  });

  it('combina seccion y tramo', () => {
    expect(shop.filterProducts(CATALOG, { sections: ['parts'], bands: ['over60'] }).map((p) => p.slug)).toEqual(['air-spring-fork']);
  });

  it('ordena de barato a caro sin tocar la lista original', () => {
    const original = CATALOG.products.map((p) => p.slug);
    expect(shop.sortProducts(CATALOG.products, 'cheap').map((p) => p.slug)).toEqual(['butyl-inner-tube', 'bb-socket', 'air-spring-fork']);
    expect(CATALOG.products.map((p) => p.slug)).toEqual(original);
  });

  it('el orden por defecto pone adelante lo que mas medidas tiene', () => {
    expect(shop.sortProducts(CATALOG.products, 'stocked')[0].slug).toBe('butyl-inner-tube');
  });

  it('cuenta por seccion y por tramo para los filtros', () => {
    expect(shop.countsBySection(CATALOG)).toEqual({ parts: 2, tools: 1 });
    expect(shop.countsByBand(CATALOG)).toMatchObject({ under10: 1, '10to25': 1, over60: 1 });
  });
});
