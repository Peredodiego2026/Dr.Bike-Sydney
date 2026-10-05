// api/_shop-admin-catalog.js - Admin > Shop Products: el catalogo de la tienda
// LEBYCLE, editable por Diego. Precios, costo, stock, descripcion, foto,
// agregar, ocultar y borrar.
//
// Se llega desde api/_shop-admin.js (role 'admin-shop'), que a su vez solo se
// alcanza despues de verifyAdminSession en api/auth.js. Este archivo no decide
// quien entra.
//
// El costo viaja SOLO por aca: es la unica respuesta del sistema que lo lleva
// junto con el catalogo, y solo para admin.

import { SHOP_BUCKET, SHOP_SECTIONS, signPhotos, isMissingColumn } from './_shop.js';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const SECTION_IDS = SHOP_SECTIONS.map((s) => s.id);
// Los SKU de LEBYCLE traen asteriscos y barras ("BP-LE**-RP"): se aceptan, pero
// nada que pueda romper una URL o un filtro de PostgREST (comas, parentesis).
const SKU_RE = /^[A-Za-z0-9*._/+-]{1,40}$/;
const PHOTO_RE = new RegExp('^' + SHOP_BUCKET + '/[a-z0-9-]{1,80}\\.(webp|jpg|jpeg|png)$');

const MIGRATION_MSG =
  'The database is missing scripts/shop-catalog-admin.sql. Run it in Supabase > SQL Editor, then try again.';

function slugify(name) {
  return (
    String(name || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'product'
  );
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// ── La lista ─────────────────────────────────────────────────────────────────

export async function listProducts(sb, res) {
  let migrated = true;
  let { data: products, error } = await sb
    .from('shop_products')
    .select('id, slug, name, section, price_from, price_to, photo_ref, sort_rank, active, description, featured')
    .order('sort_rank', { ascending: true });
  if (error && isMissingColumn(error)) {
    migrated = false;
    ({ data: products, error } = await sb
      .from('shop_products')
      .select('id, slug, name, section, price_from, price_to, photo_ref, sort_rank, active')
      .order('sort_rank', { ascending: true }));
  }
  if (error) return res.status(500).json({ error: 'Could not read the products: ' + error.message });

  const { data: variants, error: vErr } = await sb
    .from('shop_variants')
    .select(migrated ? 'sku, label, price, cost, stock, position, product_id' : 'sku, label, price, cost, position, product_id')
    .order('position', { ascending: true });
  if (vErr) return res.status(500).json({ error: 'Could not read the variants: ' + vErr.message });

  const signed = await signPhotos(sb, (products || []).map((p) => p.photo_ref));
  const byProduct = {};
  for (const v of variants || []) {
    (byProduct[v.product_id] ||= []).push({
      sku: v.sku,
      label: v.label,
      price: Number(v.price),
      cost: num(v.cost),
      stock: v.stock === undefined ? null : num(v.stock),
    });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    migrated,
    sections: SHOP_SECTIONS,
    products: (products || []).map((p) => ({
      slug: p.slug,
      name: p.name,
      section: p.section,
      active: p.active !== false,
      featured: !!p.featured,
      description: p.description || '',
      photoRef: p.photo_ref || null,
      img: signed[p.photo_ref] || null,
      variants: byProduct[p.id] || [],
    })),
  });
}

// ── Guardar ──────────────────────────────────────────────────────────────────
//
// Un solo llamado guarda el producto y todas sus variantes, igual que lo que
// Diego ve en la pantalla. Lo que llega se valida entero ANTES de escribir
// nada: un precio mal escrito en la tercera fila no puede dejar guardadas las
// dos primeras.

function cleanVariants(raw) {
  if (!Array.isArray(raw) || !raw.length) return { error: 'A product needs at least one size or option.' };
  if (raw.length > 200) return { error: 'Too many options in one product.' };
  const seen = new Set();
  const out = [];
  for (const [i, v] of raw.entries()) {
    const sku = str(v?.sku, 40);
    const label = str(v?.label, 80);
    const price = Number(v?.price);
    const cost = num(v?.cost);
    const stock = num(v?.stock);
    const row = `Row ${i + 1}`;
    if (!SKU_RE.test(sku)) return { error: `${row}: the code (SKU) can only have letters, numbers and - _ . * / +` };
    if (seen.has(sku)) return { error: `${row}: the code ${sku} is repeated.` };
    seen.add(sku);
    if (!label) return { error: `${row}: write what this option is (size, colour...).` };
    if (!Number.isFinite(price) || price <= 0 || price > 5000) return { error: `${row}: the price has to be between $0.01 and $5000.` };
    if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 5000)) return { error: `${row}: the cost is not a valid amount.` };
    if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 100000)) {
      return { error: `${row}: stock is a whole number, or empty for no limit.` };
    }
    out.push({ sku, label, price: Number(price.toFixed(2)), cost: cost === null ? null : Number(cost.toFixed(2)), stock, position: i });
  }
  return { variants: out };
}

export async function saveProduct(sb, req, res) {
  const p = req.body?.product || {};
  const name = str(p.name, 120);
  const section = str(p.section, 20);
  const description = str(p.description, 2000);
  const active = p.active !== false;
  // El editor de hoy no muestra "destacado": si no lo manda, no se toca. Antes
  // cada "Save" lo dejaba en false sin que nadie lo pidiera.
  const featured = typeof p.featured === 'boolean' ? p.featured : undefined;
  const photoRef = p.photoRef ? str(p.photoRef, 120) : null;
  if (!name) return res.status(400).json({ error: 'The product needs a name.' });
  if (!SECTION_IDS.includes(section)) return res.status(400).json({ error: 'Pick a section.' });
  if (photoRef && !PHOTO_RE.test(photoRef)) return res.status(400).json({ error: 'That photo reference is not valid. Upload the photo again.' });
  const cv = cleanVariants(req.body?.variants);
  if (cv.error) return res.status(400).json({ error: cv.error });
  const variants = cv.variants;

  // ¿Existe? Se busca por el slug que manda el panel, nunca por el nombre: el
  // nombre se puede cambiar y el slug no.
  const slugIn = str(p.slug, 80);
  let product = null;
  if (slugIn) {
    const { data, error } = await sb.from('shop_products').select('id, slug').eq('slug', slugIn).maybeSingle();
    if (error) return res.status(500).json({ error: 'Could not read the product: ' + error.message });
    if (!data) return res.status(404).json({ error: 'That product no longer exists. Reload.' });
    product = data;
  }

  // Un SKU es unico en toda la tienda: no puede quedar en dos productos.
  const { data: taken, error: tErr } = await sb
    .from('shop_variants')
    .select('sku, product_id')
    .in(
      'sku',
      variants.map((v) => v.sku)
    );
  if (tErr) return res.status(500).json({ error: 'Could not check the codes: ' + tErr.message });
  const clash = (taken || []).find((t) => !product || t.product_id !== product.id);
  if (clash) return res.status(409).json({ error: `The code ${clash.sku} already belongs to another product.` });

  const prices = variants.map((v) => v.price);
  const row = {
    name,
    section,
    active,
    price_from: Math.min(...prices),
    price_to: Math.max(...prices),
    photo_ref: photoRef,
    description: description || null,
    ...(featured === undefined ? {} : { featured }),
    updated_at: new Date().toISOString(),
  };

  try {
    if (product) {
      const { error } = await sb.from('shop_products').update(row).eq('id', product.id);
      if (error) throw error;
    } else {
      // Slug nuevo y libre: "brake-pads", "brake-pads-2"...
      const base = slugify(name);
      const { data: like } = await sb.from('shop_products').select('slug').like('slug', base + '%');
      const used = new Set((like || []).map((r) => r.slug));
      let slug = base;
      for (let n = 2; used.has(slug); n++) slug = base + '-' + n;
      const { data: created, error } = await sb
        .from('shop_products')
        .insert({ ...row, slug, sort_rank: 9999 })
        .select('id, slug')
        .single();
      if (error) throw error;
      product = created;
    }

    // Variantes: lo que ya no esta en la lista se borra (Diego lo quito en la
    // pantalla y lo confirmo); lo demas se actualiza o se crea.
    const { data: current, error: cErr } = await sb.from('shop_variants').select('sku').eq('product_id', product.id);
    if (cErr) throw cErr;
    const keep = new Set(variants.map((v) => v.sku));
    const gone = (current || []).map((c) => c.sku).filter((s) => !keep.has(s));
    if (gone.length) {
      const { error } = await sb.from('shop_variants').delete().eq('product_id', product.id).in('sku', gone);
      if (error) throw error;
    }
    const have = new Set((current || []).map((c) => c.sku));
    for (const v of variants) {
      const fields = { label: v.label, price: v.price, cost: v.cost, stock: v.stock, position: v.position };
      const { error } = have.has(v.sku)
        ? await sb.from('shop_variants').update(fields).eq('product_id', product.id).eq('sku', v.sku)
        : await sb.from('shop_variants').insert({ ...fields, sku: v.sku, product_id: product.id });
      if (error) throw error;
    }
  } catch (e) {
    if (isMissingColumn(e)) return res.status(409).json({ error: MIGRATION_MSG });
    return res.status(500).json({ error: 'Could not save: ' + (e?.message || e) });
  }
  return res.status(200).json({ ok: true, slug: product.slug });
}

// ── Borrar ───────────────────────────────────────────────────────────────────
//
// Borra el producto y sus variantes (on delete cascade). Los pedidos no pierden
// nada: cada linea de pedido guarda su propia copia del nombre, el SKU y el
// precio (scripts/shop-orders.sql). Para sacarlo de la tienda sin perderlo,
// esta "Hide" - el panel ofrece las dos y pide confirmacion para esta.
export async function deleteProduct(sb, req, res) {
  const slug = str(req.body?.slug, 80);
  if (!slug) return res.status(400).json({ error: 'Which product?' });
  const { data, error } = await sb.from('shop_products').delete().eq('slug', slug).select('slug');
  if (error) return res.status(500).json({ error: 'Could not delete: ' + error.message });
  if (!data?.length) return res.status(404).json({ error: 'That product no longer exists.' });
  return res.status(200).json({ ok: true });
}

// ── Foto ─────────────────────────────────────────────────────────────────────
//
// El navegador achica la foto y la sube DIRECTO al bucket privado con un
// permiso firmado de un solo uso: la foto no pasa por esta funcion (Vercel
// corta los cuerpos de mas de 4.5 MB). Despues se guarda la referencia con el
// producto. La foto vieja queda en el bucket: no se borra nada sin pedirlo.
export async function photoUploadUrl(sb, req, res) {
  const base = slugify(str(req.body?.slug, 80) || str(req.body?.name, 120));
  // WebP si el navegador lo sabe generar; si no (Safari viejo), JPG.
  const ext = req.body?.ext === 'jpg' ? 'jpg' : 'webp';
  const path = `${base}-${Date.now().toString(36)}.${ext}`;
  const { data, error } = await sb.storage.from(SHOP_BUCKET).createSignedUploadUrl(path);
  if (error) return res.status(500).json({ error: 'Could not prepare the upload: ' + error.message });
  return res.status(200).json({ bucket: SHOP_BUCKET, path, token: data.token, photoRef: SHOP_BUCKET + '/' + path });
}

// ── Ajustes: envio, plazo, reglas de precio ──────────────────────────────────
//
// Las reglas de precio por defecto son las del catalogo original (las mismas
// que js/shop-import.js DEFAULT_PRICING): el panel las muestra aunque nunca se
// hayan guardado.
const DEFAULT_PRICING = {
  fx: 1.4352,
  minPrice: 4.95,
  bands: [
    { upTo: 10, mult: 3.5 },
    { upTo: 30, mult: 2.1 },
    { upTo: 80, mult: 2.7 },
    { upTo: null, mult: 1.6 },
  ],
};

// Antes del SQL la tabla shop_settings no existe.
const noTable = (e) => isMissingColumn(e) || /42P01|PGRST205|relation .* does not exist|Could not find the table/i.test(String(e?.message) + ' ' + String(e?.code || ''));

export async function getSettings(sb, res) {
  const { data, error } = await sb.from('shop_settings').select('key, value');
  if (error) {
    if (noTable(error)) return res.status(200).json({ migrated: false, shipping: null, delivery: null, pricing: DEFAULT_PRICING });
    return res.status(500).json({ error: 'Could not read the settings: ' + error.message });
  }
  const by = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  return res.status(200).json({
    migrated: true,
    shipping: by.shipping || null,
    delivery: by.delivery || null,
    pricing: by.pricing || DEFAULT_PRICING,
  });
}

const n2 = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export function cleanSettings(b) {
  const out = {};
  if (b.shipping) {
    const fee = n2(b.shipping.fee);
    const freeOver = n2(b.shipping.freeOver);
    if (fee === null || !Number.isFinite(fee) || fee < 0 || fee > 200) return { error: 'Shipping: the fee has to be between $0 and $200.' };
    if (freeOver !== null && (!Number.isFinite(freeOver) || freeOver <= 0 || freeOver > 5000)) {
      return { error: 'Shipping: "free over" is an amount up to $5000, or empty for never free.' };
    }
    out.shipping = { fee: Number(fee.toFixed(2)), freeOver: freeOver === null ? null : Number(freeOver.toFixed(2)) };
  }
  if (b.delivery) {
    const min = n2(b.delivery.minDays);
    const max = n2(b.delivery.maxDays);
    if (!Number.isInteger(min) || min < 1 || min > 90) return { error: 'Delivery: the minimum is a whole number of business days, 1 to 90.' };
    if (max !== null && (!Number.isInteger(max) || max < min || max > 120)) return { error: 'Delivery: the maximum has to be at least the minimum.' };
    out.delivery = { minDays: min, maxDays: max === null ? min : max };
  }
  if (b.pricing) {
    const fx = n2(b.pricing.fx);
    const minPrice = n2(b.pricing.minPrice);
    const bands = Array.isArray(b.pricing.bands) ? b.pricing.bands : [];
    if (!Number.isFinite(fx) || fx < 0.1 || fx > 10) return { error: 'Pricing: the exchange rate looks wrong.' };
    if (!Number.isFinite(minPrice) || minPrice < 0 || minPrice > 1000) return { error: 'Pricing: the minimum price looks wrong.' };
    if (!bands.length || bands.length > 8) return { error: 'Pricing: between 1 and 8 cost bands.' };
    const clean = [];
    for (const [i, band] of bands.entries()) {
      const last = i === bands.length - 1;
      const upTo = last ? null : n2(band.upTo);
      const mult = n2(band.mult);
      if (!last && (!Number.isFinite(upTo) || upTo <= 0 || (clean.length && upTo <= clean[clean.length - 1].upTo))) {
        return { error: `Pricing: band ${i + 1} needs an "up to" amount bigger than the one before.` };
      }
      if (!Number.isFinite(mult) || mult < 1 || mult > 20) return { error: `Pricing: band ${i + 1} needs a multiplier between 1 and 20.` };
      clean.push({ upTo, mult });
    }
    out.pricing = { fx, minPrice, bands: clean };
  }
  return { settings: out };
}

export async function saveSettings(sb, req, res) {
  const cs = cleanSettings(req.body || {});
  if (cs.error) return res.status(400).json({ error: cs.error });
  const rows = Object.entries(cs.settings).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  if (!rows.length) return res.status(400).json({ error: 'Nothing to save.' });
  const { error } = await sb.from('shop_settings').upsert(rows, { onConflict: 'key' });
  if (error) {
    if (noTable(error)) return res.status(409).json({ error: MIGRATION_MSG });
    return res.status(500).json({ error: 'Could not save the settings: ' + error.message });
  }
  return res.status(200).json({ ok: true, ...cs.settings });
}

// ── Importar la lista de LEBYCLE ─────────────────────────────────────────────
//
// El navegador lee la planilla, la compara y Diego elige que aplicar (Admin,
// js/shop-import.js). Aca llega solo eso: costos nuevos, precios nuevos donde
// los acepto, y codigos para marcar agotados. Todo en escrituras EN LOTE, no
// una por fila: mil filas de a una pasan el limite de tiempo de Vercel.
export async function applyImport(sb, req, res) {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  const soldOut = Array.isArray(req.body?.soldOut) ? req.body.soldOut : [];
  if (!updates.length && !soldOut.length) return res.status(400).json({ error: 'Nothing to apply.' });
  if (updates.length + soldOut.length > 3000) return res.status(400).json({ error: 'Too many changes in one go.' });

  const changes = new Map();
  for (const [i, u] of updates.entries()) {
    const sku = str(u?.sku, 40);
    const cost = n2(u?.cost);
    const price = n2(u?.price);
    if (!SKU_RE.test(sku)) return res.status(400).json({ error: `Change ${i + 1}: bad code.` });
    if (cost === null || !Number.isFinite(cost) || cost < 0 || cost > 5000) return res.status(400).json({ error: `${sku}: the cost is not a valid amount.` });
    if (price !== null && (!Number.isFinite(price) || price <= 0 || price > 5000)) return res.status(400).json({ error: `${sku}: the price is not a valid amount.` });
    changes.set(sku, { cost: Number(cost.toFixed(2)), price: price === null ? null : Number(price.toFixed(2)) });
  }
  for (const raw of soldOut) {
    const sku = str(raw, 40);
    if (!SKU_RE.test(sku)) return res.status(400).json({ error: 'Bad code in the sold-out list.' });
    changes.set(sku, { ...(changes.get(sku) || {}), stock: 0 });
  }

  const skus = [...changes.keys()];
  const { data: current, error: cErr } = await sb.from('shop_variants').select('*').in('sku', skus);
  if (cErr) return res.status(500).json({ error: 'Could not read the catalogue: ' + cErr.message });
  // Solo se tocan codigos que existen: la importacion nunca crea opciones.
  const rows = (current || []).map((v) => {
    const c = changes.get(v.sku);
    return {
      ...v,
      ...(c.cost !== undefined ? { cost: c.cost } : {}),
      ...(c.price ? { price: c.price } : {}),
      ...(c.stock === 0 ? { stock: 0 } : {}),
    };
  });
  if (!rows.length) return res.status(404).json({ error: 'None of those codes are in the shop.' });

  const { error: uErr } = await sb.from('shop_variants').upsert(rows, { onConflict: 'sku' });
  if (uErr) {
    if (isMissingColumn(uErr)) return res.status(409).json({ error: MIGRATION_MSG });
    return res.status(500).json({ error: 'Could not apply: ' + uErr.message });
  }

  // El "desde / hasta" de cada producto tocado, recalculado con todas sus opciones.
  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const { data: all, error: aErr } = await sb.from('shop_variants').select('product_id, price').in('product_id', productIds);
  const { data: prods, error: pErr } = await sb.from('shop_products').select('*').in('id', productIds);
  if (aErr || pErr) return res.status(500).json({ error: 'Prices saved, but the product ranges could not be updated: ' + (aErr || pErr).message });
  const range = {};
  for (const v of all || []) {
    const r = (range[v.product_id] ||= { from: Infinity, to: 0 });
    r.from = Math.min(r.from, Number(v.price));
    r.to = Math.max(r.to, Number(v.price));
  }
  const prodRows = (prods || []).map((p) => ({ ...p, price_from: range[p.id]?.from ?? p.price_from, price_to: range[p.id]?.to ?? p.price_to }));
  if (prodRows.length) {
    const { error } = await sb.from('shop_products').upsert(prodRows, { onConflict: 'id' });
    if (error) return res.status(500).json({ error: 'Prices saved, but the product ranges could not be updated: ' + error.message });
  }
  return res.status(200).json({ ok: true, updated: rows.length, skipped: skus.length - rows.length });
}
