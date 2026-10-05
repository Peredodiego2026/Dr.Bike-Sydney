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
  const featured = !!p.featured;
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
    featured,
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
