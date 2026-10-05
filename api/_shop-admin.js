// api/_shop-admin.js - Admin > Shop Orders: lo que pasa con un pedido de la
// tienda LEBYCLE despues de que el cliente paga.
//
// Se entra por /api/auth con role 'admin-shop' y una `action`. api/auth.js ya
// comprobo la sesion de admin antes de llamar aca (verifyAdminSession) y pasa
// el cliente de Supabase con la service key: este archivo no decide quien
// entra, solo que se puede hacer con cada pedido.
//
// EL CAMINO (scripts/shop-orders-fulfillment.sql)
//
//   pending -> paid -> ordered -> sent -> delivered
//      |        \________\_________\________\-> refunded
//      '-> cancelled
//
// Cada paso es una escritura CONDICIONADA al estado de origen
// (.eq('status', ...)). Dos pestañas de Admin abiertas, o un doble clic, no
// pueden mandar dos emails de "enviado" ni hacer dos reembolsos.
//
// Nada se borra desde aca. Un pedido es un documento: se cancela o se
// reembolsa, y queda.

import { SELF_BASE_URL } from './_security.js';
import { ORDER_FOR_SETTLE, settleOrder, orderRef, shopStripe, SHOP_MODE } from './_shop.js';
import { listProducts, saveProduct, deleteProduct, photoUploadUrl, getSettings, saveSettings, applyImport } from './_shop-admin-catalog.js';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Se cobro, y por lo tanto se puede devolver.
const REFUNDABLE = ['paid', 'ordered', 'packed', 'sent', 'delivered'];

// Lo que contesta la base cuando falta scripts/shop-orders-fulfillment.sql: la
// columna nueva no existe, o el CHECK viejo no conoce 'ordered'. Se traduce a
// lo que hay que hacer, porque "column supplier_ref does not exist" no le dice
// nada a quien tiene que arreglarlo.
function dbError(res, err) {
  const msg = String(err?.message || err || '');
  // PostgREST no siempre deja pasar el texto de Postgres: una columna que no
  // existe llega como "Could not find the 'x' column ... in the schema cache"
  // (PGRST204), no como "column x does not exist" (42703).
  if (/column .* does not exist|schema cache|PGRST204|42703|shop_orders_status_check|violates check constraint/i.test(msg + ' ' + (err?.code || ''))) {
    return res
      .status(409)
      .json({ error: 'The database is missing scripts/shop-orders-fulfillment.sql. Run it in Supabase > SQL Editor, then try again.' });
  }
  return res.status(500).json({ error: 'Could not save: ' + msg });
}

async function loadOrder(sb, id) {
  const { data, error } = await sb.from('shop_orders').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data;
}

// Mueve el pedido de uno de `from` a `patch.status`, solo si sigue en uno de
// `from`. Devuelve true si esta llamada fue la que lo movio.
async function move(sb, id, from, patch) {
  const { data, error } = await sb.from('shop_orders').update(patch).eq('id', id).in('status', from).select('id');
  if (error) throw error;
  return !!data?.length;
}

// Los emails al cliente salen por /api/send-email, igual que el de "pedido
// recibido" (api/_shop.js, notifyPaid). Nunca tumban la accion: el estado ya
// cambio. Lo que falle queda en `notes`.
async function emailClient(sb, order, type, extra) {
  let lang = 'en';
  // El idioma en que compro viaja en la metadata del cobro (no hay columna
  // para eso, y agregarla habria roto el checkout hasta correr un SQL).
  const stripe = shopStripe();
  if (stripe && order.payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);
      lang = pi?.metadata?.lang || 'en';
    } catch (e) {
      console.error('[shop-admin] no pude leer el idioma del cobro', order.id, e.message);
    }
  }
  try {
    const r = await fetch(SELF_BASE_URL + '/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({
        type,
        to: order.client_email,
        name: order.client_name || String(order.client_email || '').split('@')[0],
        orderRef: orderRef(order.id),
        mode: order.mode,
        total: Number(order.total),
        lang,
        ...extra,
      }),
    });
    if (r.ok) return true;
    throw new Error('HTTP ' + r.status);
  } catch (e) {
    console.error('[shop-admin] email', type, 'fallido para', order.id, e.message);
    // Las notas se releen: Diego puede haber guardado una mientras tanto.
    const { data: now } = await sb.from('shop_orders').select('notes').eq('id', order.id).single();
    await sb
      .from('shop_orders')
      .update({ notes: [now?.notes, 'Email ' + type + ' fallido - ' + e.message].filter(Boolean).join(' | ') })
      .eq('id', order.id);
    return false;
  }
}

// ── La lista ─────────────────────────────────────────────────────────────────

async function list(sb, res) {
  const { data: orders, error } = await sb.from('shop_orders').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: 'Could not read the orders: ' + error.message });
  const ids = (orders || []).map((o) => o.id);
  let items = [];
  if (ids.length) {
    const { data, error: iErr } = await sb
      .from('shop_order_items')
      .select('order_id, sku, name, variant, qty, unit_price, line_total')
      .in('order_id', ids);
    if (iErr) return res.status(500).json({ error: 'Could not read the order lines: ' + iErr.message });
    items = data || [];
  }
  // Lo que le cuesta a Diego cada pieza, para el margen. Esto es Admin: es la
  // unica respuesta del sistema que lleva `cost`, y solo la ve quien paso
  // verifyAdminSession.
  const skus = [...new Set(items.map((i) => i.sku))];
  const costBySku = {};
  if (skus.length) {
    const { data: costs } = await sb.from('shop_variants').select('sku, cost').in('sku', skus);
    for (const c of costs || []) if (c.cost !== null && c.cost !== undefined) costBySku[c.sku] = Number(c.cost);
  }
  const byOrder = {};
  for (const i of items) {
    (byOrder[i.order_id] ||= []).push({
      sku: i.sku,
      name: i.name,
      variant: i.variant,
      qty: i.qty,
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
      unitCost: costBySku[i.sku] ?? null,
    });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    shopMode: SHOP_MODE,
    orders: (orders || []).map((o) => ({
      id: o.id,
      ref: orderRef(o.id),
      status: o.status,
      mode: o.mode,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      orderedAt: o.ordered_at ?? null,
      sentAt: o.sent_at ?? null,
      deliveredAt: o.delivered_at ?? null,
      refundedAt: o.refunded_at ?? null,
      client: { name: o.client_name, email: o.client_email, phone: o.client_phone },
      address: [o.ship_address, o.ship_suburb, o.ship_postcode].filter(Boolean).join(', '),
      subtotal: Number(o.subtotal),
      shipping: Number(o.shipping),
      total: Number(o.total),
      supplierRef: o.supplier_ref ?? null,
      carrier: o.carrier ?? null,
      trackingNumber: o.tracking_number ?? null,
      trackingUrl: o.tracking_url ?? null,
      notes: o.notes,
      // false hasta que se corra scripts/shop-orders-fulfillment.sql: el panel
      // lo avisa en vez de ofrecer botones que van a fallar.
      migrated: 'supplier_ref' in o,
      items: byOrder[o.id] || [],
    })),
  });
}

// ── Las acciones ─────────────────────────────────────────────────────────────

export async function handleShopAdmin(req, res, sb) {
  const action = str(req.body?.action, 24);
  if (action === 'list') return list(sb, res);
  // Admin > Shop Products (api/_shop-admin-catalog.js)
  if (action === 'products') return listProducts(sb, res);
  if (action === 'product-save') return saveProduct(sb, req, res);
  if (action === 'product-delete') return deleteProduct(sb, req, res);
  if (action === 'photo-upload') return photoUploadUrl(sb, req, res);
  if (action === 'settings') return getSettings(sb, res);
  if (action === 'settings-save') return saveSettings(sb, req, res);
  if (action === 'import-apply') return applyImport(sb, req, res);

  const id = str(req.body?.orderId, 64);
  if (!id) return res.status(400).json({ error: 'Which order?' });
  const order = await loadOrder(sb, id);
  if (!order) return res.status(404).json({ error: 'That order does not exist.' });
  const now = new Date().toISOString();

  try {
    switch (action) {
      // El pago que el navegador no llego a confirmar: el cliente cerro la
      // pestaña justo despues de pagar. Misma decision que el navegador, en el
      // mismo lugar (settleOrder), y si se cobro salen los mismos avisos.
      case 'check': {
        const { data: full } = await sb.from('shop_orders').select(ORDER_FOR_SETTLE).eq('id', id).single();
        // Sin idioma: settleOrder lo toma de la metadata del cobro.
        const out = await settleOrder(sb, full || order, '');
        return res.status(out.code).json(out.body);
      }

      // Un pedido que nunca se pago. Antes de cancelarlo se le pregunta a
      // Stripe: cancelar uno que SI se cobro dejaria plata cobrada sin pedido.
      case 'cancel': {
        if (order.status !== 'pending') return res.status(409).json({ error: 'Only an unpaid order can be cancelled. A paid one is refunded.' });
        const stripe = shopStripe();
        if (stripe && order.payment_intent_id) {
          const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);
          if (pi.status === 'succeeded') {
            return res.status(409).json({ error: 'Stripe says this one WAS paid. Use "Check with Stripe" instead of cancelling.' });
          }
          if (!['canceled', 'succeeded'].includes(pi.status)) {
            try {
              await stripe.paymentIntents.cancel(order.payment_intent_id);
            } catch (e) {
              // Un cobro que ya no se puede cancelar en Stripe no impide
              // marcar el pedido: igual no se va a cobrar.
              console.error('[shop-admin] cancel PI', order.payment_intent_id, e.message);
            }
          }
        }
        const ok = await move(sb, id, ['pending'], { status: 'cancelled' });
        return res.status(ok ? 200 : 409).json(ok ? { status: 'cancelled' } : { error: 'Someone moved this order first. Reload.' });
      }

      // Diego se lo pidio a LEBYCLE. El numero de pedido de ELLOS es lo que
      // hay que citar si algo no llega.
      case 'ordered': {
        const supplierRef = str(req.body?.supplierRef, 80);
        if (!supplierRef) return res.status(400).json({ error: "Write LEBYCLE's order number first." });
        const ok = await move(sb, id, ['paid'], { status: 'ordered', supplier_ref: supplierRef, ordered_at: now });
        return res.status(ok ? 200 : 409).json(ok ? { status: 'ordered' } : { error: 'Only a paid order can be marked as ordered. Reload.' });
      }

      // Salio. El cliente recibe el numero de seguimiento por email.
      case 'sent': {
        const trackingNumber = str(req.body?.trackingNumber, 80);
        const carrier = str(req.body?.carrier, 60);
        const link = str(req.body?.trackingUrl, 300);
        if (!trackingNumber) return res.status(400).json({ error: 'Write the tracking number first.' });
        // Solo un https limpio: esto termina como un boton en un email nuestro.
        const trackingUrl = /^https:\/\/[^\s"'<>]+$/.test(link) ? link : '';
        if (link && !trackingUrl) return res.status(400).json({ error: 'The tracking link has to start with https://' });
        const ok = await move(sb, id, ['paid', 'ordered', 'packed'], {
          status: 'sent',
          tracking_number: trackingNumber,
          carrier: carrier || null,
          tracking_url: trackingUrl || null,
          sent_at: now,
        });
        if (!ok) return res.status(409).json({ error: 'Only a paid or ordered order can be marked as sent. Reload.' });
        const emailed = await emailClient(sb, order, 'shop_shipped', { trackingNumber, carrier, trackingUrl });
        return res.status(200).json({ status: 'sent', emailed });
      }

      case 'delivered': {
        const ok = await move(sb, id, ['sent'], { status: 'delivered', delivered_at: now });
        return res.status(ok ? 200 : 409).json(ok ? { status: 'delivered' } : { error: 'Only a sent order can be marked as delivered. Reload.' });
      }

      // Devolver todo lo cobrado. La clave de idempotencia hace que dos clics
      // (o dos pestañas) sean UN reembolso en Stripe, no dos.
      case 'refund': {
        if (!REFUNDABLE.includes(order.status)) return res.status(409).json({ error: 'Only a paid order can be refunded.' });
        if (!order.payment_intent_id) return res.status(409).json({ error: 'This order has no payment to refund.' });
        if (order.mode !== SHOP_MODE) {
          return res
            .status(409)
            .json({ error: 'This is a ' + order.mode + ' order and the shop is using ' + SHOP_MODE + ' keys now. Refund it from the Stripe dashboard.' });
        }
        const stripe = shopStripe();
        if (!stripe) return res.status(503).json({ error: 'The shop Stripe key is not set.' });
        const refund = await stripe.refunds.create(
          { payment_intent: order.payment_intent_id, metadata: { kind: 'shop_order', order_id: id } },
          { idempotencyKey: 'shop-refund-' + id }
        );
        const ok = await move(sb, id, REFUNDABLE, { status: 'refunded', refunded_at: now, refund_id: refund.id });
        if (!ok) return res.status(200).json({ status: 'refunded', refundId: refund.id });
        const emailed = await emailClient(sb, order, 'shop_refunded', {});
        return res.status(200).json({ status: 'refunded', refundId: refund.id, emailed });
      }

      case 'note': {
        const notes = str(req.body?.notes, 1000);
        const { error } = await sb.from('shop_orders').update({ notes: notes || null }).eq('id', id);
        if (error) return dbError(res, error);
        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(400).json({ error: 'Unknown action.' });
    }
  } catch (e) {
    if (e?.type?.startsWith?.('Stripe')) return res.status(502).json({ error: 'Stripe: ' + e.message });
    return dbError(res, e);
  }
}
