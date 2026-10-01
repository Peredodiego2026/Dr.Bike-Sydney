// api/_shop.js - el catalogo de repuestos LEBYCLE, para quien tenga permiso.
//
// Empieza con guion bajo, igual que _security.js o _eta.js, porque NO es una
// funcion propia: el plan de Vercel admite 12 y el proyecto ya tenia 12. Esta
// habria sido la 13 y el deploy fallaba entero. Se entra por /api/shop, que
// vercel.json reescribe a /api/auth?role=shop - el mismo arreglo que ya usan
// /api/send-b2b-inquiry y /api/mechanic-auth.
//
// POR QUE ESTO ES UN ENDPOINT Y NO UN ARCHIVO
//
// La primera version del catalogo era `data/shop-catalog.json` servido como
// cualquier imagen del sitio. Andaba, y cualquier persona del planeta podia
// abrirlo: 314 productos con el precio al que Diego los compra y el precio al
// que los vende. El acuerdo con LEBYCLE no esta cerrado y en Australia ya hay
// un distribuidor (Cycle Motion). Diego, el 01-oct: "si haz que quede
// cerrado... no quiero que alguien lo mire".
//
// Asi que el catalogo vive en dos tablas con RLS encendido y cero politicas
// (scripts/shop-catalog.sql), y la unica forma de leerlo es esta funcion, que
// corre en Vercel con la service key y antes de responder mira de quien es la
// sesion.
//
// TRES CERROJOS, NO UNO
//
//   1. Las tablas no se dejan leer con la anon key. Ni una fila, ni vacia.
//   2. Esta funcion exige un token valido de Supabase y que el email este en
//      la lista. Sin eso contesta 404.
//   3. Las fotos estan en un bucket privado y se firman por una hora.
//
// Si manana alguien se olvida de la lista de emails, el cerrojo 1 sigue
// puesto. Si alguien hace publica la tabla, el cerrojo 2 sigue puesto.
//
// POR QUE 404 Y NO 403
//
// Un 403 confirma que la tienda existe. Un 404 no dice nada: para quien no
// tiene permiso, /api/shop es una direccion que no lleva a ningun lado, igual
// que /api/cualquier-cosa. Que exista un proyecto de dropshipping con LEBYCLE
// es informacion comercial, no solo los precios.

import { createClient } from '@supabase/supabase-js';
import { guard } from './_security.js';
import Stripe from 'stripe';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

export const SHOP_BUCKET = 'shop-photos';

// La tienda cobra con su PROPIA clave de Stripe, no con la del negocio. Hoy
// es una clave de pruebas: mientras el acuerdo con LEBYCLE no este cerrado,
// un pedido no puede mover plata de verdad. Si la variable no esta puesta, el
// checkout contesta que no esta configurado en vez de caer en la clave LIVE
// del resto del sitio - una tienda a medio terminar que cobra en serio es
// peor que una tienda que no cobra.
const SHOP_STRIPE_KEY = process.env.SHOP_STRIPE_SECRET_KEY || '';
const SHOP_MODE = SHOP_STRIPE_KEY.startsWith('sk_live_') ? 'live' : 'test';

// Tope por pedido. No es una regla de negocio: es un freno. Un bug de
// cantidades o alguien jugando con el carrito no puede terminar en un cobro
// de cuatro cifras sin que nadie lo mire.
const MAX_ORDER_AUD = 2000;

// Una hora, igual que las fotos de los trabajos. Lo suficiente para recorrer la
// tienda sin volver a pedir, y lo bastante corto para que un link reenviado no
// sirva al otro dia.
const SIGN_SECONDS = 3600;

// Quien puede ver la tienda. Se configura en Vercel con SHOP_PREVIEW_EMAILS,
// separados por coma. El valor por defecto es el de Diego: si la variable no
// esta puesta, la tienda no se abre sola para nadie mas.
export function previewEmails() {
  const raw = process.env.SHOP_PREVIEW_EMAILS || 'peredo.dm@gmail.com';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function maySeeShop(email) {
  const e = (email || '').trim().toLowerCase();
  return !!e && previewEmails().includes(e);
}

// El token puede venir en el header o en el cuerpo. El header es lo correcto;
// el cuerpo esta aceptado porque el resto de los endpoints de este proyecto lo
// hacen asi y un cliente ya escrito lo manda ahi.
function readToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  if (m) return m[1].trim();
  const t = req.body?.access_token;
  return typeof t === 'string' && t ? t.trim() : '';
}

// Las fotos se piden todas juntas. De a una seria una llamada por producto:
// 307 idas y vueltas para dibujar una grilla.
async function signPhotos(sb, refs) {
  const paths = [...new Set(refs.filter(Boolean))].map((r) => r.replace(SHOP_BUCKET + '/', ''));
  if (!paths.length) return {};
  const { data, error } = await sb.storage.from(SHOP_BUCKET).createSignedUrls(paths, SIGN_SECONDS);
  // Sin bucket todavia, la tienda se dibuja sin fotos en vez de no dibujarse.
  // Es el mismo acuerdo que api/_job-photos.js: el bucket se crea a mano en el
  // panel de Supabase, y el dia que este codigo llegue a produccion puede que
  // no exista.
  if (error || !Array.isArray(data)) return {};
  const out = {};
  for (const row of data) {
    if (row?.signedUrl && row?.path) out[SHOP_BUCKET + '/' + row.path] = row.signedUrl;
  }
  return out;
}


// ── El cobro ─────────────────────────────────────────────────────────────────
//
// Lo unico que llega del navegador es [{ sku, qty }] y los datos de envio. Los
// precios NO viajan: se leen de shop_variants aca. Esa es toda la defensa, y
// es la misma regla que ya salvo al wizard de reservas cuando el importe lo
// decidia el telefono (PR #412).

function cleanLines(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const l of raw.slice(0, 50)) {
    const sku = typeof l?.sku === 'string' ? l.sku.trim() : '';
    const qty = Math.floor(Number(l?.qty));
    if (!sku || seen.has(sku) || !Number.isFinite(qty) || qty < 1 || qty > 20) continue;
    seen.add(sku);
    out.push({ sku, qty });
  }
  return out;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function handleCheckout(req, res, sb, user) {
  const lines = cleanLines(req.body?.items);
  if (!lines.length) return res.status(400).json({ error: 'Your cart is empty.' });

  // El precio sale de la base, no del pedido.
  const { data: rows, error } = await sb
    .from('shop_variants')
    .select('sku, label, price, shop_products!inner(name, active)')
    .in(
      'sku',
      lines.map((l) => l.sku)
    );
  if (error) return res.status(500).json({ error: 'Could not price the cart: ' + error.message });

  const bySku = new Map((rows || []).filter((r) => r.shop_products?.active).map((r) => [r.sku, r]));
  const missing = lines.filter((l) => !bySku.has(l.sku));
  if (missing.length) {
    // Se nombra lo que falta para que el carrito pueda marcarlo. Un "algo
    // salio mal" obliga al cliente a vaciar el carrito y empezar de nuevo.
    return res.status(409).json({ error: 'Some items are no longer available.', missing: missing.map((l) => l.sku) });
  }

  const items = lines.map((l) => {
    const r = bySku.get(l.sku);
    const unit = Number(r.price);
    return {
      sku: l.sku,
      name: r.shop_products.name,
      variant: r.label,
      qty: l.qty,
      unit_price: unit,
      line_total: Number((unit * l.qty).toFixed(2)),
    };
  });
  const subtotal = Number(items.reduce((s, i) => s + i.line_total, 0).toFixed(2));
  const shipping = 0; // [CONFIRMAR COSTO DE ENVIO] - hasta entonces no se cobra.
  const total = Number((subtotal + shipping).toFixed(2));

  if (total <= 0) return res.status(400).json({ error: 'Your cart is empty.' });
  if (total > MAX_ORDER_AUD) {
    return res.status(400).json({ error: 'That order is over $' + MAX_ORDER_AUD + '. Call us on 0433 963 250 and we sort it out.' });
  }
  if (!SHOP_STRIPE_KEY) {
    return res.status(503).json({ error: 'The shop checkout is not switched on yet.' });
  }

  const email = str(req.body?.email, 160) || user.email;
  const order = {
    client_id: user.id,
    client_email: email,
    client_name: str(req.body?.name, 120) || null,
    client_phone: str(req.body?.phone, 40) || null,
    ship_address: str(req.body?.address, 240) || null,
    ship_suburb: str(req.body?.suburb, 80) || null,
    ship_postcode: str(req.body?.postcode, 12) || null,
    subtotal,
    shipping,
    total,
    mode: SHOP_MODE,
    status: 'pending',
  };

  // La fila se escribe ANTES de cobrar. Si Stripe contesta y el servidor se
  // cae en el medio, queda un pedido pendiente que se puede cerrar a mano; al
  // reves quedaria un cobro sin ningun rastro de que se compro.
  const { data: saved, error: oErr } = await sb.from('shop_orders').insert(order).select('id').single();
  if (oErr) return res.status(500).json({ error: 'Could not save the order: ' + oErr.message });

  const { error: iErr } = await sb.from('shop_order_items').insert(items.map((i) => ({ ...i, order_id: saved.id })));
  if (iErr) return res.status(500).json({ error: 'Could not save the order: ' + iErr.message });

  let intent;
  try {
    const stripe = new Stripe(SHOP_STRIPE_KEY);
    intent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      metadata: {
        kind: 'shop_order',
        order_id: saved.id,
        email,
        items: items.map((i) => i.sku + ' x' + i.qty).join(', ').slice(0, 480),
      },
    });
  } catch (e) {
    // El pedido queda marcado, no borrado: un pedido que desaparece no deja
    // ver que el cobro fallo.
    await sb.from('shop_orders').update({ status: 'cancelled', notes: 'Stripe: ' + e.message }).eq('id', saved.id);
    return res.status(502).json({ error: 'The payment could not be started: ' + e.message });
  }

  await sb.from('shop_orders').update({ payment_intent_id: intent.id }).eq('id', saved.id);

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    orderId: saved.id,
    clientSecret: intent.client_secret,
    mode: SHOP_MODE,
    // Se devuelve lo que el servidor calculo, para que el carrito pueda
    // comparar y avisar si no coincide con lo que mostraba.
    items,
    subtotal,
    shipping,
    total,
  });
}


// Marcar un pedido como pagado. NO se confia en que el navegador diga que
// pago: se le pregunta a Stripe por ese cobro y se mira su estado. Un cliente
// puede llamar a este endpoint cuantas veces quiera; lo unico que decide es lo
// que Stripe conteste.
async function handleConfirm(req, res, sb, user) {
  const orderId = str(req.body?.orderId, 64);
  if (!orderId) return res.status(400).json({ error: 'Which order?' });

  const { data: order, error } = await sb
    .from('shop_orders')
    .select('id, client_id, payment_intent_id, status, total')
    .eq('id', orderId)
    .single();
  if (error || !order) return res.status(404).json({ error: 'Not found' });
  // Un pedido es de quien lo hizo. Sin esto, cambiar el id en la llamada
  // mostraria el pedido de otra persona.
  if (order.client_id && order.client_id !== user.id) return res.status(404).json({ error: 'Not found' });
  if (order.status === 'paid') return res.status(200).json({ status: 'paid', orderId: order.id });
  if (!order.payment_intent_id || !SHOP_STRIPE_KEY) return res.status(409).json({ error: 'That order has no payment yet.' });

  let intent;
  try {
    const stripe = new Stripe(SHOP_STRIPE_KEY);
    intent = await stripe.paymentIntents.retrieve(order.payment_intent_id);
  } catch (e) {
    return res.status(502).json({ error: 'Could not check the payment: ' + e.message });
  }

  if (intent.status !== 'succeeded') {
    return res.status(200).json({ status: intent.status, orderId: order.id });
  }
  // El importe tambien se comprueba: un cobro por menos de lo que el pedido
  // dice no lo deja pagado.
  if (Math.round(Number(order.total) * 100) !== intent.amount_received) {
    await sb.from('shop_orders').update({ notes: 'Importe cobrado distinto al del pedido' }).eq('id', order.id);
    return res.status(409).json({ error: 'The amount paid does not match the order.' });
  }

  await sb.from('shop_orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', order.id);
  return res.status(200).json({ status: 'paid', orderId: order.id });
}

export async function handleShop(req, res) {
  if (!(await guard(req, res, { methods: ['GET', 'POST'], limit: 60 }))) return;

  const token = readToken(req);
  if (!token || !SUPABASE_URL || !SERVICE_KEY) return res.status(404).json({ error: 'Not found' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const {
    data: { user },
    error: uErr,
  } = await sb.auth.getUser(token);
  // Sesion invalida y sesion sin permiso contestan lo mismo, a proposito: dos
  // respuestas distintas le dirian a quien prueba tokens cual de las dos cosas
  // fallo.
  if (uErr || !user || !maySeeShop(user.email)) return res.status(404).json({ error: 'Not found' });

  // Todo lo que sigue ya probo quien es. El catalogo se pide con GET; el
  // cobro, con POST y ?action=checkout.
  if (req.method === 'POST' && (req.query?.action === 'checkout' || req.body?.action === 'checkout')) {
    return handleCheckout(req, res, sb, user);
  }
  if (req.method === 'POST' && (req.query?.action === 'confirm' || req.body?.action === 'confirm')) {
    return handleConfirm(req, res, sb, user);
  }

  const { data: products, error: pErr } = await sb
    .from('shop_products')
    .select('slug, name, section, price_from, price_to, photo_ref, sort_rank')
    .eq('active', true)
    .order('sort_rank', { ascending: true });
  if (pErr) return res.status(500).json({ error: 'Could not load the shop: ' + pErr.message });

  const { data: variants, error: vErr } = await sb
    .from('shop_variants')
    .select('sku, label, price, position, product_id, shop_products!inner(slug)')
    .order('position', { ascending: true });
  if (vErr) return res.status(500).json({ error: 'Could not load the shop: ' + vErr.message });

  const signed = await signPhotos(sb, (products || []).map((p) => p.photo_ref));

  const bySlug = new Map();
  for (const p of products || []) {
    bySlug.set(p.slug, {
      slug: p.slug,
      name: p.name,
      cat: p.section,
      from: Number(p.price_from),
      to: Number(p.price_to),
      img: signed[p.photo_ref] || null,
      variants: [],
    });
  }
  for (const v of variants || []) {
    // `cost` no se selecciona arriba. Lo que Diego paga por cada pieza no
    // tiene por que salir del servidor ni para el: el navegador no lo usa, y
    // lo que no viaja no se filtra.
    const p = bySlug.get(v.shop_products?.slug);
    if (p) p.variants.push({ sku: v.sku, label: v.label, price: Number(v.price) });
  }

  const list = [...bySlug.values()].filter((p) => p.variants.length);

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    brand: 'LEBYCLE',
    currency: 'AUD',
    photosExpireIn: SIGN_SECONDS,
    sections: [
      { id: 'parts', name: 'Parts' },
      { id: 'tools', name: 'Tools' },
      { id: 'accessories', name: 'Accessories' },
      { id: 'care', name: 'Care' },
      { id: 'gear', name: 'Gear' },
    ],
    products: list,
  });
}
