// api/shop.js - el catalogo de repuestos LEBYCLE, para quien tenga permiso.
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

export const SHOP_BUCKET = 'shop-photos';

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

export default async function handler(req, res) {
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
