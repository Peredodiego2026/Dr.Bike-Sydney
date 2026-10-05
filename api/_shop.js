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
import { guard, isValidEmail, SELF_BASE_URL } from './_security.js';
import Stripe from 'stripe';

// Con el mismo respaldo que TODOS los demas archivos de api/. La primera
// version no lo tenia, y en Vercel SUPABASE_URL no esta configurada - el
// proyecto entero vive de este respaldo. Sin el, la linea del handler que
// exige SUPABASE_URL contestaba 404 a todo el mundo, incluida la unica cuenta
// que tiene permiso. Diego, el 02-oct: "dice que shop no esta disponible en
// esta cuenta, y en esta cuenta es donde si debe estar disponible".
//
// Los tests no lo vieron porque ponian process.env.SUPABASE_URL a mano: el
// entorno de prueba tenia algo que produccion no tiene.
// tests/unit/shop-really-answers.test.js ahora corre SIN esa variable.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
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

// La mitad publica de la misma clave: el navegador la necesita para dibujar
// el campo de la tarjeta. NO es la de js/stripe.js, que es la LIVE del
// negocio - con esa, el formulario hablaria con otra cuenta que la que creo
// el cobro, y Stripe lo rechaza. Va por el servidor y no escrita en el
// navegador para que pasar de pruebas a real sea cambiar dos variables en
// Vercel, no editar codigo.
const SHOP_STRIPE_PUBLISHABLE = process.env.SHOP_STRIPE_PUBLISHABLE_KEY || '';
// Una de pruebas con una real no funciona: Stripe contesta "no such
// payment_intent" recien al pagar, con el cliente ya mirando la tarjeta.
// Mejor saberlo antes de crear el pedido.
const SHOP_KEYS_MATCH = SHOP_STRIPE_PUBLISHABLE.startsWith(SHOP_MODE === 'live' ? 'pk_live_' : 'pk_test_');

// Diego. Es el mismo numero que BUSINESS_PHONES en _security.js, asi que
// send-message lo acepta como destino de una llamada interna.
const SHOP_ALERT_PHONE = '0433963250';

// Tope por pedido. No es una regla de negocio: es un freno. Un bug de
// cantidades o alguien jugando con el carrito no puede terminar en un cobro
// de cuatro cifras sin que nadie lo mire.
const MAX_ORDER_AUD = 2000;

// Una hora, igual que las fotos de los trabajos. Lo suficiente para recorrer la
// tienda sin volver a pedir, y lo bastante corto para que un link reenviado no
// sirva al otro dia.
const SIGN_SECONDS = 3600;

// ══ EL INTERRUPTOR DE LA TIENDA ══════════════════════════════════════════
//
// false = solo entran los emails de previewEmails() (hoy, Diego).
// true  = el catalogo se entrega a cualquiera, con o sin sesion. Comprar
//         sigue pidiendo sesion: un pedido tiene que ser de alguien.
//
// Tiene un gemelo en js/shop.js (SHOP_IS_PUBLIC) que decide si se dibujan el
// tab, la franja y el enlace. tests/unit/shop-switch.test.js falla si los dos
// no dicen lo mismo. Lista completa para abrirla: docs/SHOP-OPEN.md.
//
// Abrirla NO expone el costo: `cost` no se selecciona nunca, ni para Diego.
export const SHOP_IS_PUBLIC = false;

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
  if (SHOP_IS_PUBLIC) return true;
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
export async function signPhotos(sb, refs) {
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

// Las secciones de la tienda. Admin > Shop Products las usa para el selector.
// ── Envio y plazo ────────────────────────────────────────────────────────────
//
// Los pone Diego en Admin > Shop Products > Shop settings (tabla shop_settings,
// scripts/shop-catalog-admin.sql). Sin configurar - o antes del SQL - el envio
// es 0 y la tienda muestra el texto provisorio, igual que hasta ahora.
export async function loadShopSettings(sb) {
  const { data, error } = await sb.from('shop_settings').select('key, value');
  if (error) {
    // Antes del SQL la tabla no existe: la tienda sigue sin envio ni plazo.
    if (!/does not exist|schema cache|PGRST20|42P01/i.test(String(error.message) + ' ' + String(error.code || ''))) {
      console.error('[shop] no pude leer shop_settings', error.message);
    }
    return {};
  }
  return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
}

// El envio de un pedido: la tarifa, salvo que el subtotal llegue al "gratis
// desde". La misma cuenta hace js/shop.js para mostrarlo; esta es la que cobra.
export function shippingFor(settings, subtotal) {
  const sh = settings?.shipping;
  const fee = Number(sh?.fee);
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  const free = Number(sh?.freeOver);
  if (Number.isFinite(free) && free > 0 && subtotal >= free) return 0;
  return Number(fee.toFixed(2));
}

// Lo que el navegador necesita saber del envio y el plazo (nada mas).
export function publicSettings(settings) {
  const out = {};
  const fee = Number(settings?.shipping?.fee);
  if (Number.isFinite(fee) && fee >= 0 && settings?.shipping) {
    const free = Number(settings.shipping.freeOver);
    out.shipping = { fee, freeOver: Number.isFinite(free) && free > 0 ? free : null };
  }
  const min = Number(settings?.delivery?.minDays);
  if (Number.isInteger(min) && min > 0) {
    const max = Number(settings.delivery.maxDays);
    out.delivery = { minDays: min, maxDays: Number.isInteger(max) && max >= min ? max : min };
  }
  return out;
}

export const SHOP_SECTIONS = [
  { id: 'parts', name: 'Parts' },
  { id: 'tools', name: 'Tools' },
  { id: 'accessories', name: 'Accessories' },
  { id: 'care', name: 'Care' },
  { id: 'gear', name: 'Gear' },
];

// Hasta que se corra scripts/shop-catalog-admin.sql, las columnas nuevas
// (description, stock...) no existen, y pedirlas rompe la consulta ENTERA. Se
// piden con ellas y, si la base contesta que no existen, se vuelven a pedir
// sin ellas: la tienda sigue andando igual que antes del SQL.
export function isMissingColumn(err) {
  const msg = String(err?.message || '') + ' ' + String(err?.code || '');
  return /does not exist|schema cache|PGRST204|42703/i.test(msg);
}
export async function selectWithFallback(build, full, basic) {
  const r = await build(full);
  if (r.error && isMissingColumn(r.error)) return build(basic);
  return r;
}

async function handleCheckout(req, res, sb, user) {
  const lines = cleanLines(req.body?.items);
  if (!lines.length) return res.status(400).json({ error: 'Your cart is empty.' });

  // El precio sale de la base, no del pedido.
  const { data: rows, error } = await selectWithFallback(
    (cols) =>
      sb
        .from('shop_variants')
        .select(cols)
        .in(
          'sku',
          lines.map((l) => l.sku)
        ),
    'sku, label, price, stock, shop_products!inner(name, active)',
    'sku, label, price, shop_products!inner(name, active)'
  );
  if (error) return res.status(500).json({ error: 'Could not price the cart: ' + error.message });

  const bySku = new Map((rows || []).filter((r) => r.shop_products?.active).map((r) => [r.sku, r]));
  const missing = lines.filter((l) => !bySku.has(l.sku));
  if (missing.length) {
    // Se nombra lo que falta para que el carrito pueda marcarlo. Un "algo
    // salio mal" obliga al cliente a vaciar el carrito y empezar de nuevo.
    return res.status(409).json({ error: 'Some items are no longer available.', missing: missing.map((l) => l.sku) });
  }
  // Stock: null es sin limite. Agotado, o menos de lo pedido, se rechaza ANTES
  // de cobrar, y se dice cuantos quedan para que el carrito lo muestre.
  const short = lines.filter((l) => {
    const left = bySku.get(l.sku).stock;
    return left !== null && left !== undefined && l.qty > Number(left);
  });
  if (short.length) {
    return res.status(409).json({
      error: 'Some items are sold out or have fewer left than you asked for.',
      soldOut: short.map((l) => ({ sku: l.sku, left: Number(bySku.get(l.sku).stock) })),
    });
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
  // El envio sale de Admin > Shop settings. Sin configurar, 0.
  const shipping = shippingFor(await loadShopSettings(sb), subtotal);
  const total = Number((subtotal + shipping).toFixed(2));

  if (total <= 0) return res.status(400).json({ error: 'Your cart is empty.' });
  if (total > MAX_ORDER_AUD) {
    return res.status(400).json({ error: 'That order is over $' + MAX_ORDER_AUD + '. Call us on 0433 963 250 and we sort it out.' });
  }
  if (!SHOP_STRIPE_KEY || !SHOP_STRIPE_PUBLISHABLE) {
    return res.status(503).json({ error: 'The shop checkout is not switched on yet.' });
  }
  if (!SHOP_KEYS_MATCH) {
    console.error('[shop] SHOP_STRIPE_SECRET_KEY y SHOP_STRIPE_PUBLISHABLE_KEY no son del mismo modo (test/live)');
    return res.status(503).json({ error: 'The shop checkout is not switched on yet.' });
  }

  // A este email va la confirmacion, asi que tiene que ser uno. Si lo que
  // escribio no lo es, se usa el de la cuenta, que Supabase ya verifico.
  const typed = str(req.body?.email, 160);
  const email = isValidEmail(typed) ? typed : user.email;
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
      // Solo tarjeta, que es lo unico que el formulario ofrece. Con los
      // metodos automaticos, Stripe puede habilitar uno que redirige a otra
      // pagina, y el cobro quedaria esperando un regreso que esta pagina no
      // sabe atender.
      payment_method_types: ['card'],
      metadata: {
        kind: 'shop_order',
        // El idioma en que compro: Admin lo lee de aca para mandarle el email
        // de 'enviado' o de reembolso en su idioma.
        ...(str(req.body?.lang, 8) ? { lang: str(req.body?.lang, 8) } : {}),
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
    ref: orderRef(saved.id),
    clientSecret: intent.client_secret,
    publishableKey: SHOP_STRIPE_PUBLISHABLE,
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

  const { data: order, error } = await sb.from('shop_orders').select(ORDER_FOR_SETTLE).eq('id', orderId).single();
  if (error || !order) return res.status(404).json({ error: 'Not found' });
  // Un pedido es de quien lo hizo. Sin esto, cambiar el id en la llamada
  // mostraria el pedido de otra persona.
  if (order.client_id && order.client_id !== user.id) return res.status(404).json({ error: 'Not found' });
  const out = await settleOrder(sb, order, str(req.body?.lang, 8));
  return res.status(out.code).json(out.body);
}

// Las columnas que settleOrder() necesita. Admin lee el pedido con estas mismas.
export const ORDER_FOR_SETTLE =
  'id, client_id, client_email, client_name, client_phone, ship_address, ship_suburb, ship_postcode, payment_intent_id, status, shipping, total, mode';

// Lo que decide si un pedido quedo pagado, en un solo lugar. Lo llaman el
// navegador del cliente (action=confirm) y Admin > Shop Orders ("Check with
// Stripe", para el pago que el navegador no llego a confirmar). Devuelve
// { code, body } en vez de contestar, para que cada uno conteste a su manera.
export async function settleOrder(sb, order, lang) {
  const ref = orderRef(order.id);
  // Pagado, enviado, cancelado: ya no es cosa de esta funcion. Se contesta el
  // estado y nada mas - sobre todo, no se vuelve a avisar.
  if (order.status !== 'pending') return { code: 200, body: { status: order.status, orderId: order.id, ref } };
  if (!order.payment_intent_id || !SHOP_STRIPE_KEY) return { code: 409, body: { error: 'That order has no payment yet.' } };

  let intent;
  try {
    const stripe = new Stripe(SHOP_STRIPE_KEY);
    intent = await stripe.paymentIntents.retrieve(order.payment_intent_id);
  } catch (e) {
    return { code: 502, body: { error: 'Could not check the payment: ' + e.message } };
  }

  if (intent.status !== 'succeeded') {
    return { code: 200, body: { status: intent.status, orderId: order.id, ref } };
  }
  // El importe tambien se comprueba: un cobro por menos de lo que el pedido
  // dice no lo deja pagado.
  if (Math.round(Number(order.total) * 100) !== intent.amount_received) {
    await sb.from('shop_orders').update({ notes: 'Importe cobrado distinto al del pedido' }).eq('id', order.id);
    return { code: 409, body: { error: 'The amount paid does not match the order.' } };
  }

  // pending -> paid en UNA escritura condicionada. Dos llamadas a la vez (un
  // doble toque, el reintento del navegador, Admin revisando al mismo tiempo)
  // pasan las dos por el chequeo de arriba; solo una encuentra la fila todavia
  // en 'pending', y solo esa avisa. Sin la condicion, Diego recibiria un
  // WhatsApp por cada llamada y el cliente un email por cada una.
  const { data: moved, error: mErr } = await sb
    .from('shop_orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id');
  if (mErr) return { code: 500, body: { error: 'Could not save the payment: ' + mErr.message } };
  // Admin ("Check with Stripe") no sabe en que idioma compro el cliente: lo
  // dice la metadata del cobro, que se escribio en el checkout.
  if (moved?.length) {
    await takeStock(sb, order.id);
    await notifyPaid(sb, order, ref, lang || intent.metadata?.lang || '');
  }
  return { code: 200, body: { status: 'paid', orderId: order.id, ref } };
}

// El stock baja recien cuando el pedido se cobra, y solo el de las variantes
// que tienen limite (null = sin limite, no se toca). Es mejor esfuerzo: dos
// pedidos cobrados en el mismo segundo podrian descontar sobre el mismo
// numero. En dropshipping el stock de aca es una referencia, no un deposito:
// el de verdad lo tiene LEBYCLE. Nunca tumba el cobro, que ya paso.
async function takeStock(sb, orderId) {
  // Un corte de red aca no puede tumbar settleOrder: el pedido ya esta pagado y
  // lo que sigue son los avisos. Sin este try, una excepcion dejaba el pedido
  // en 'paid' sin WhatsApp a Diego ni email al cliente.
  try {
    await moveStock(sb, orderId, -1);
  } catch (e) {
    console.error('[shop] no pude bajar el stock del pedido', orderId, e?.message || e);
  }
}

// Devuelve el stock de un pedido reembolsado antes de pedirselo a LEBYCLE: esas
// piezas nunca salieron. Mejor esfuerzo, igual que takeStock.
export async function giveStockBack(sb, orderId) {
  try {
    await moveStock(sb, orderId, +1);
  } catch (e) {
    console.error('[shop] no pude devolver el stock del pedido', orderId, e?.message || e);
  }
}

async function moveStock(sb, orderId, sign) {
  const { data: lines, error } = await sb.from('shop_order_items').select('sku, qty').eq('order_id', orderId);
  if (error || !lines?.length) return;
  const { data: vars, error: vErr } = await sb
    .from('shop_variants')
    .select('sku, stock')
    .in(
      'sku',
      lines.map((l) => l.sku)
    );
  if (vErr) {
    if (!isMissingColumn(vErr)) console.error('[shop] no pude leer el stock', orderId, vErr.message);
    return;
  }
  for (const v of vars || []) {
    if (v.stock === null || v.stock === undefined) continue;
    const qty = lines.filter((l) => l.sku === v.sku).reduce((n, l) => n + Number(l.qty), 0);
    const { error: uErr } = await sb
      .from('shop_variants')
      .update({ stock: Math.max(0, Number(v.stock) + sign * qty) })
      .eq('sku', v.sku);
    if (uErr) console.error('[shop] no pude mover el stock', v.sku, uErr.message);
  }
}

// La cuenta de Stripe de la tienda (no la del negocio). null si no esta puesta.
export function shopStripe() {
  return SHOP_STRIPE_KEY ? new Stripe(SHOP_STRIPE_KEY) : null;
}
export { SHOP_MODE };

// Lo que el cliente y Diego ven como numero de pedido. El id completo es un
// uuid de 36 caracteres; 8 alcanzan para encontrarlo en el panel y dictarlo
// por telefono. Es la misma forma que ya tienen las reservas.
export function orderRef(id) {
  return String(id || '')
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase();
}

// Los dos avisos de un pedido pagado: WhatsApp a Diego (que tiene que pedirle
// las piezas a LEBYCLE) y email al cliente. Se esperan, porque Vercel congela
// la funcion apenas contesta y un fetch suelto se pierde. Pero ninguno puede
// tumbar la respuesta: el cobro ya esta hecho y el pedido ya dice 'paid'. Lo
// que falle queda escrito en `notes` del pedido, que es donde Diego lo va a
// ver, y en los logs.
export async function notifyPaid(sb, order, ref, lang) {
  const { data: items, error: iErr } = await sb
    .from('shop_order_items')
    .select('sku, name, variant, qty, line_total')
    .eq('order_id', order.id);
  if (iErr) console.error('[shop] no pude leer las lineas del pedido', ref, iErr.message);
  const rows = items || [];
  const address = [order.ship_address, order.ship_suburb, order.ship_postcode].filter(Boolean).join(', ');

  const calls = [
    {
      name: 'whatsapp',
      path: '/api/send-message?channel=whatsapp',
      body: {
        to: SHOP_ALERT_PHONE,
        template: 'shop_order',
        data: {
          ref,
          clientName: order.client_name,
          phone: order.client_phone,
          email: order.client_email,
          address,
          // Con el SKU: es lo que Diego le pide a LEBYCLE.
          lines: rows.map(
            (i) => `${i.qty} x ${i.name}${i.variant ? ' (' + i.variant + ')' : ''} - ${i.sku} - $${Number(i.line_total).toFixed(2)}`
          ),
          total: Number(order.total).toFixed(2),
          test: order.mode !== 'live',
        },
      },
    },
    {
      name: 'email',
      path: '/api/send-email',
      body: {
        type: 'shop_order',
        to: order.client_email,
        name: order.client_name || String(order.client_email || '').split('@')[0],
        orderRef: ref,
        mode: order.mode,
        items: rows,
        shipping: Number(order.shipping) || 0,
        total: Number(order.total),
        lang,
      },
    },
  ];

  const results = await Promise.allSettled(
    calls.map((c) =>
      fetch(SELF_BASE_URL + c.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_SECRET || '' },
        body: JSON.stringify(c.body),
      })
    )
  );
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.ok) return;
    const why = r.status === 'rejected' ? r.reason?.message || String(r.reason) : 'HTTP ' + r.value.status;
    failed.push(calls[i].name + ': ' + why);
  });
  if (failed.length) {
    console.error('[shop] aviso fallido para el pedido', ref, failed.join('; '));
    const { error: nErr } = await sb
      .from('shop_orders')
      .update({ notes: 'Aviso fallido - ' + failed.join('; ') })
      .eq('id', order.id);
    if (nErr) console.error('[shop] tampoco pude anotarlo en el pedido', ref, nErr.message);
  }
  return { sent: calls.length - failed.length, failed };
}

export async function handleShop(req, res) {
  // guard() devuelve TRUE cuando ya contesto (metodo equivocado, limite de
  // peticiones) y FALSE cuando todo esta bien. La primera version de esta linea
  // tenia la condicion al reves, asi que el handler hacia return siempre y la
  // tienda contestaba 405 a todo. Los tests no lo vieron porque el doble de
  // guard devolvia `true`, que con la condicion invertida significaba "segui":
  // el test heredo el error en vez de atraparlo.
  //
  // Un solo metodo por llamada, que es lo que guard admite: el catalogo se lee
  // con GET y el cobro se manda con POST.
  const method = req.method === 'GET' ? 'GET' : 'POST';
  if (await guard(req, res, { method, rateMax: 60, rateWindow: 60000, rateKey: 'shop' })) return;

  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(404).json({ error: 'Not found' });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const action = req.query?.action || req.body?.action || '';
  const buying = req.method === 'POST' && (action === 'checkout' || action === 'confirm');

  // Quien es. Con la tienda privada hace falta para TODO; con la tienda
  // abierta, solo para comprar - un pedido tiene que ser de alguien.
  const token = readToken(req);
  let user = null;
  if (token) {
    const { data, error: uErr } = await sb.auth.getUser(token);
    if (!uErr) user = data?.user || null;
  }
  // Sesion invalida y sesion sin permiso contestan lo mismo, a proposito: dos
  // respuestas distintas le dirian a quien prueba tokens cual de las dos cosas
  // fallo.
  const needsUser = buying || !SHOP_IS_PUBLIC;
  if (needsUser && (!user || !maySeeShop(user.email))) return res.status(404).json({ error: 'Not found' });

  if (req.method === 'POST' && action === 'checkout') return handleCheckout(req, res, sb, user);
  if (req.method === 'POST' && action === 'confirm') return handleConfirm(req, res, sb, user);

  const { data: products, error: pErr } = await selectWithFallback(
    (cols) => sb.from('shop_products').select(cols).eq('active', true).order('sort_rank', { ascending: true }),
    'slug, name, section, price_from, price_to, photo_ref, sort_rank, description, featured, gallery',
    'slug, name, section, price_from, price_to, photo_ref, sort_rank'
  );
  if (pErr) return res.status(500).json({ error: 'Could not load the shop: ' + pErr.message });

  const { data: variants, error: vErr } = await selectWithFallback(
    (cols) => sb.from('shop_variants').select(cols).order('position', { ascending: true }),
    'sku, label, price, position, stock, product_id, shop_products!inner(slug)',
    'sku, label, price, position, product_id, shop_products!inner(slug)'
  );
  if (vErr) return res.status(500).json({ error: 'Could not load the shop: ' + vErr.message });

  const [signed, settings] = await Promise.all([
    // Las fotos extra se firman en la MISMA llamada que las principales.
    signPhotos(sb, (products || []).flatMap((p) => [p.photo_ref, ...(Array.isArray(p.gallery) ? p.gallery : [])])),
    loadShopSettings(sb),
  ]);

  const bySlug = new Map();
  for (const p of products || []) {
    bySlug.set(p.slug, {
      slug: p.slug,
      name: p.name,
      cat: p.section,
      from: Number(p.price_from),
      to: Number(p.price_to),
      img: signed[p.photo_ref] || null,
      desc: p.description || '',
      featured: !!p.featured,
      gallery: (Array.isArray(p.gallery) ? p.gallery : []).map((ref) => signed[ref]).filter(Boolean),
      variants: [],
    });
  }
  for (const v of variants || []) {
    // `cost` no se selecciona arriba. Lo que Diego paga por cada pieza no
    // tiene por que salir del servidor ni para el: el navegador no lo usa, y
    // lo que no viaja no se filtra.
    const p = bySlug.get(v.shop_products?.slug);
    // stock: null = sin limite, 0 = agotado (se ve, no se compra), n = quedan n.
    if (p) p.variants.push({ sku: v.sku, label: v.label, price: Number(v.price), stock: v.stock ?? null });
  }

  const list = [...bySlug.values()].filter((p) => p.variants.length);

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    brand: 'LEBYCLE',
    currency: 'AUD',
    photosExpireIn: SIGN_SECONDS,
    sections: SHOP_SECTIONS,
    // Envio y plazo, si Diego los configuro. Ausentes = todavia no.
    ...publicSettings(settings),
    products: list,
  });
}
