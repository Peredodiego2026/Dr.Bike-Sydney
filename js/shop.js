// js/shop.js — the LEBYCLE parts shop, shared by the mobile SPA and the
// desktop landing page.
//
// This file is deliberately free of DOM work: it loads the catalogue, keeps
// the cart, and answers who may see the shop. The screens that draw it live in
// js/app.js (mobile) and js/landing-modules.js (desktop), and both go through
// the functions here so a price or a quantity rule can only be written once.

const CATALOG_URL = '/api/shop';
const CART_KEY = 'drbike-shop-cart';
const MAX_QTY = 20;

// Las fotos vienen firmadas por una hora. A los 50 minutos el catalogo se
// considera vencido: una foto firmada que expira no da error, simplemente deja
// de cargar, y una tienda con huecos grises donde iban las fotos parece rota
// sin que nadie entienda por que.
const CATALOG_TTL_MS = 50 * 60 * 1000;

// ══ EL INTERRUPTOR DE LA TIENDA ══════════════════════════════════════════
//
// false = la ve solo PREVIEW_EMAILS (hoy, Diego). true = la ve todo el mundo.
//
// Vive en DOS archivos a proposito y tienen que decir lo mismo: este, que
// decide si se dibujan el tab, la franja y el enlace del menu, y
// api/_shop.js, que decide si el servidor entrega el catalogo. El de este
// archivo es cortesia de interfaz; el del servidor es el permiso de verdad.
// tests/unit/shop-switch.test.js falla si no coinciden.
//
// Para abrirla a todos: poner true aca Y en api/_shop.js, y sacar el
// <meta name="robots" content="noindex"> de shop.html si Google la tiene que
// encontrar. La lista completa esta en docs/SHOP-OPEN.md.
export const SHOP_IS_PUBLIC = false;
const PREVIEW_EMAILS = ['peredo.dm@gmail.com'];

export function canSeeShop(user) {
  if (SHOP_IS_PUBLIC) return true;
  const email = (user?.email || '').trim().toLowerCase();
  return !!email && PREVIEW_EMAILS.includes(email);
}

let _catalog = null;
let _loadedAt = 0;
let _loading = null;

export function forgetCatalog() {
  _catalog = null;
  _loadedAt = 0;
  _loading = null;
}

// `getToken` lo pasa quien llama: en la SPA sale de la sesion de Supabase. Sin
// token no se intenta siquiera la llamada - el endpoint contestaria 404 y
// quedaria en la consola un error que no significa nada.
export async function loadCatalog(getToken) {
  if (_catalog && Date.now() - _loadedAt < CATALOG_TTL_MS) return _catalog;
  // Sin memorizar la promesa, abrir la tienda y tocar un producto en el mismo
  // gesto piden el catalogo dos veces.
  if (!_loading) {
    _loading = (async () => {
      const token = typeof getToken === 'function' ? await getToken() : getToken;
      if (!token) throw new Error('Please sign in to open the shop.');
      const r = await fetch(CATALOG_URL, { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 404) throw new Error('The shop is not available on this account.');
      if (!r.ok) throw new Error('Could not load the shop (' + r.status + ')');
      return r.json();
    })()
      .then((data) => {
        _catalog = data;
        _loadedAt = Date.now();
        _loading = null;
        return data;
      })
      .catch((e) => {
        _loading = null;
        throw e;
      });
  }
  return _loading;
}

export function findProduct(catalog, slug) {
  return catalog?.products?.find((p) => p.slug === slug) || null;
}

export function findVariant(product, sku) {
  return product?.variants?.find((v) => v.sku === sku) || null;
}

export function sectionName(catalog, id) {
  return catalog?.sections?.find((s) => s.id === id)?.name || id;
}

export function countsBySection(catalog) {
  const out = {};
  for (const p of catalog?.products || []) out[p.cat] = (out[p.cat] || 0) + 1;
  return out;
}

// Los tramos de precio del filtro. Se calculan sobre el precio desde el que
// arranca cada producto, que es el que se muestra en la tarjeta: filtrar por
// un precio que el cliente no ve en ningun lado no se entiende.
export const PRICE_BANDS = [
  { id: 'under10', name: 'Under $10', min: 0, max: 10 },
  { id: '10to25', name: '$10 - $25', min: 10, max: 25 },
  { id: '25to60', name: '$25 - $60', min: 25, max: 60 },
  { id: 'over60', name: 'Over $60', min: 60, max: Infinity },
];

export function countsByBand(catalog) {
  const out = {};
  for (const b of PRICE_BANDS) out[b.id] = 0;
  for (const p of catalog?.products || []) {
    const b = PRICE_BANDS.find((x) => p.from >= x.min && p.from < x.max);
    if (b) out[b.id]++;
  }
  return out;
}

export function filterProducts(catalog, { sections = [], bands = [], query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return (catalog?.products || []).filter((p) => {
    if (sections.length && !sections.includes(p.cat)) return false;
    if (bands.length) {
      const b = PRICE_BANDS.find((x) => p.from >= x.min && p.from < x.max);
      if (!b || !bands.includes(b.id)) return false;
    }
    if (q) {
      const hay = p.name.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q));
      if (!hay) return false;
    }
    return true;
  });
}

export const SORTS = {
  stocked: { name: 'Most stocked first', fn: (a, b) => b.variants.length - a.variants.length || a.from - b.from },
  cheap: { name: 'Price, low to high', fn: (a, b) => a.from - b.from },
  dear: { name: 'Price, high to low', fn: (a, b) => b.from - a.from },
  name: { name: 'Name, A to Z', fn: (a, b) => a.name.localeCompare(b.name) },
};

export function sortProducts(list, sort) {
  return [...list].sort((SORTS[sort] || SORTS.stocked).fn);
}

// ── El carrito ───────────────────────────────────────────────────────────────
//
// Vive en localStorage, que es del navegador y de nadie mas: no viaja al
// servidor ni se comparte entre dispositivos. Guarda SKU y cantidad, nunca el
// precio - el precio lo pone el servidor al cobrar, leyendo la misma tabla.
// Un carrito que lleva el importe adentro es un carrito que el cliente puede
// editar desde las herramientas del navegador.

function readRaw() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && typeof l.sku === 'string' && Number.isFinite(l.qty))
      .map((l) => ({ sku: l.sku, qty: clampQty(l.qty) }));
  } catch {
    // Ventana privada, almacenamiento bloqueado o un JSON a medio escribir.
    // Un carrito vacio es la respuesta correcta: la tienda sigue andando.
    return [];
  }
}

function writeRaw(lines) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(lines));
  } catch {
    // Si no se puede guardar, el carrito dura lo que dure la pagina. Es mejor
    // que no poder agregar nada.
  }
  return lines;
}

export function clampQty(n) {
  const q = Math.floor(Number(n) || 0);
  if (q < 0) return 0;
  return Math.min(q, MAX_QTY);
}

export function getCart() {
  return readRaw();
}

export function cartCount(lines = readRaw()) {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function addToCart(sku, qty = 1) {
  const lines = readRaw();
  const found = lines.find((l) => l.sku === sku);
  if (found) found.qty = clampQty(found.qty + qty);
  else lines.push({ sku, qty: clampQty(qty) });
  return writeRaw(lines.filter((l) => l.qty > 0));
}

export function setQty(sku, qty) {
  const lines = readRaw().map((l) => (l.sku === sku ? { ...l, qty: clampQty(qty) } : l));
  return writeRaw(lines.filter((l) => l.qty > 0));
}

export function removeFromCart(sku) {
  return writeRaw(readRaw().filter((l) => l.sku !== sku));
}

export function clearCart() {
  return writeRaw([]);
}

// Le pone nombre y precio a cada linea del carrito. Si un SKU ya no esta en el
// catalogo la linea se marca `gone` en vez de desaparecer: el cliente tiene que
// ver que algo cambio, no encontrarse el carrito mas barato sin aviso.
//
// Esto es para MOSTRAR. El importe que se cobra lo calcula el servidor con la
// misma tabla, y si no coincide manda el servidor.
// Lo que dice una linea que no se puede comprar. Partido en spans para que cada
// texto fijo pase por el diccionario (translateScreen reemplaza nodos enteros).
export function goneLabel(item) {
  if (item.why === 'soldout') return '<span>Sold out</span>';
  if (item.why === 'short') return '<span>Only</span> ' + Number(item.left) + ' <span>left</span>';
  return '<span>No longer available</span>';
}

// Si la variante tiene limite, no se puede elegir mas de lo que queda.
export function maxQty(variant) {
  const left = variant?.stock ?? null;
  return left === null ? 20 : Math.max(0, Math.min(20, left));
}

export function priceCart(catalog, lines = readRaw()) {
  const items = lines.map((l) => {
    for (const p of catalog?.products || []) {
      const v = findVariant(p, l.sku);
      if (v) {
        // Stock: null = sin limite, 0 = agotado. Pedir mas de lo que queda
        // tambien frena el pago, y el carrito dice cuantos quedan.
        const left = v.stock ?? null;
        const why = left === 0 ? 'soldout' : left !== null && l.qty > left ? 'short' : '';
        return {
          sku: l.sku,
          qty: l.qty,
          name: p.name,
          slug: p.slug,
          img: p.img,
          variant: v.label,
          unit: v.price,
          total: Number((v.price * l.qty).toFixed(2)),
          gone: !!why,
          why,
          left,
        };
      }
    }
    return { sku: l.sku, qty: l.qty, name: l.sku, slug: null, img: null, variant: '', unit: 0, total: 0, gone: true, why: 'gone', left: 0 };
  });
  const subtotal = Number(items.reduce((s, i) => s + i.total, 0).toFixed(2));
  return { items, subtotal, count: cartCount(lines), hasGone: items.some((i) => i.gone) };
}
