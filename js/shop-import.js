// js/shop-import.js - leer la lista de precios de LEBYCLE y compararla con la
// tienda. Lo usa Admin > Shop Products > "Import LEBYCLE list".
//
// Logica pura, sin pantalla: se prueba con vitest (tests/unit/shop-import.test.js)
// y Admin la toma de window.ShopImport (admin.js es un script clasico).
//
// POR QUE UN LECTOR PROPIO Y NO UNA LIBRERIA
//
// La lista de LEBYCLE es un .xlsx de 43 MB: casi todo son las fotos de cada
// producto. Lo que importa son cinco hojas de texto. Un .xlsx es un zip; el
// navegador ya trae como descomprimir (DecompressionStream), asi que se leen
// solo esas hojas y nunca se toca el resto. Cero codigo de terceros dentro de
// Admin, que es donde estan las claves de todo el negocio.

// ── Reglas de precio ─────────────────────────────────────────────────────────
//
// Las mismas con que se armo el catalogo el 2026-10-01: costo en USD por el
// tipo de cambio, un multiplicador segun cuanto cuesta, redondeado hacia
// arriba a .95, y nunca menos del minimo. Diego las cambia en Admin.
export const DEFAULT_PRICING = {
  fx: 1.4352,
  minPrice: 4.95,
  bands: [
    { upTo: 10, mult: 3.5 },
    { upTo: 30, mult: 2.1 },
    { upTo: 80, mult: 2.7 },
    { upTo: null, mult: 1.6 },
  ],
};

const round2 = (n) => Math.round(n * 100) / 100;

// Costo en AUD -> precio sugerido.
export function priceFor(costAud, rules = DEFAULT_PRICING) {
  const c = Number(costAud);
  if (!Number.isFinite(c) || c <= 0) return null;
  const band = (rules.bands || []).find((b) => b.upTo === null || b.upTo === undefined || c < Number(b.upTo)) || { mult: 1 };
  const raw = Math.ceil(c * Number(band.mult)) - 0.05;
  return round2(Math.max(Number(rules.minPrice) || 0, raw));
}

export function costAud(costUsd, rules = DEFAULT_PRICING) {
  return round2(Number(costUsd) * Number(rules.fx || 1));
}

// ── El .xlsx ─────────────────────────────────────────────────────────────────

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Lee el indice del zip (el "central directory", al final del archivo) y
// devuelve un lector de entradas por nombre. Solo se descomprime lo que se pide.
function zipIndex(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This file is not an Excel workbook (.xlsx).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The workbook is damaged.');
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    has: (name) => entries.has(name),
    async text(name) {
      const e = entries.get(name);
      if (!e) return null;
      const lNameLen = dv.getUint16(e.local + 26, true);
      const lExtraLen = dv.getUint16(e.local + 28, true);
      const start = e.local + 30 + lNameLen + lExtraLen;
      const raw = u8.subarray(start, start + e.size);
      const data = e.method === 0 ? raw : await inflateRaw(raw);
      return dec.decode(data);
    },
  };
}

const unxml = (s) =>
  String(s)
    .replace(/&#10;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

function sheetRows(xml, shared) {
  const rows = {};
  // Celdas que se cierran solas (<c r="C2" s="46"/>) son reales y comunes en
  // esta planilla: una regex que solo buscara <c ...>...</c> corria todas las
  // columnas siguientes una a la izquierda.
  for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, col, row, attrs, tail, inner] = m;
    if (tail === '/>') continue;
    const t = (attrs.match(/t="([^"]+)"/) || [])[1];
    const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    const isT = (inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
    let val = isT !== undefined ? unxml(isT) : v;
    if (t === 's' && v !== undefined) val = shared[Number(v)];
    if (val === undefined || val === null) continue;
    (rows[row] ||= {})[col] = String(val).trim();
  }
  return Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => rows[k]);
}

// La fila de encabezados se busca, no se supone: la de LEBYCLE dice "Product
// Model" y "Wholesale Price", y una planilla editada a mano puede decir "SKU"
// y "Price". Devuelve las letras de las columnas.
function findColumns(row) {
  const cols = Object.entries(row || {});
  // La hoja "Cycling Gear" de LEBYCLE trae los encabezados en chino: 产品型号
  // (modelo) y 品名 (nombre). Sin estos, sus filas no se leian.
  const sku = cols.find(([, v]) => /^(product\s*model|model|sku|code|item\s*code|产品型号|型号)$/i.test(String(v).trim()));
  const cost = cols.find(([, v]) => /(wholesale\s*price|unit\s*price|cost|^price$|批发价)/i.test(String(v).trim()));
  const name = cols.find(([, v]) => /(product\s*name|^name$|description|品名|产品名称)/i.test(String(v).trim()));
  return sku && cost ? { sku: sku[0], cost: cost[0], name: name ? name[0] : null } : null;
}

function rowsFromTable(table, sheet) {
  const out = [];
  let cols = null;
  for (const [i, row] of table.entries()) {
    if (!cols) {
      // El encabezado se busca solo en las primeras filas. Mas abajo, una fila
      // de datos se podia tomar por encabezado y se perdian todas las de antes:
      // le paso a "Cycling Gear", que se salteaba sus 10 primeros productos.
      if (i >= 5) break;
      cols = findColumns(row);
      continue;
    }
    const sku = String(row[cols.sku] || '').trim();
    const cost = Number(String(row[cols.cost] || '').replace(/[^0-9.]/g, ''));
    if (!sku || !Number.isFinite(cost) || cost <= 0) continue;
    // El nombre viene en chino y en ingles: "维修架-09 Repair Stand". Se queda
    // la parte en ingles cuando la hay.
    const rawName = cols.name ? String(row[cols.name] || '') : '';
    const name = rawName.replace(/[^\x20-\x7E]/g, ' ').replace(/^[\s\-\d.]+/, '').replace(/\s+/g, ' ').trim() || rawName.trim();
    out.push({ sku, name, costUsd: cost, sheet });
  }
  return out;
}

export async function readWorkbook(buf) {
  const zip = zipIndex(buf);
  const sharedXml = (await zip.text('xl/sharedStrings.xml')) || '';
  const shared = sharedXml
    .split('<si>')
    .slice(1)
    .map((si) => unxml([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')));
  const wb = (await zip.text('xl/workbook.xml')) || '';
  const rels = (await zip.text('xl/_rels/workbook.xml.rels')) || '';
  const target = {};
  for (const m of rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) target[m[1]] = m[2];
  for (const m of rels.matchAll(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) target[m[2]] = m[1];
  const sheets = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({
    name: unxml(m[1]),
    path: 'xl/' + String(target[m[2]] || '').replace(/^\/?xl\//, ''),
  }));
  const rows = [];
  for (const s of sheets) {
    const xml = await zip.text(s.path);
    if (xml) rows.push(...rowsFromTable(sheetRows(xml, shared), s.name));
  }
  if (!rows.length) throw new Error('No product codes and prices found. Is this the LEBYCLE price list?');
  return dedupe(rows);
}

// ── El .csv (por si Diego exporta desde Excel) ───────────────────────────────

export function readCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0] || '').split(';').length > (lines[0] || '').split(',').length ? ';' : ',';
  const parse = (line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const letters = (arr) => Object.fromEntries(arr.map((v, i) => [String.fromCharCode(65 + i), v]));
  const rows = rowsFromTable(lines.map((l) => letters(parse(l))), 'CSV');
  if (!rows.length) throw new Error('No product codes and prices found. The file needs a column for the code and one for the price.');
  return dedupe(rows);
}

// Un SKU repetido en la lista (pasa entre hojas) cuenta una vez: la ultima.
function dedupe(rows) {
  const by = new Map();
  for (const r of rows) by.set(r.sku, r);
  return [...by.values()];
}

// ── Comparar con la tienda ───────────────────────────────────────────────────
//
// products: lo que devuelve Admin (cada uno con variants: sku, label, price,
// cost). Devuelve tres listas y lo que no cambio.
export function diffCatalog(products, rows, rules = DEFAULT_PRICING) {
  const inShop = new Map();
  for (const p of products || []) for (const v of p.variants || []) inShop.set(v.sku, { product: p, variant: v });
  const listed = new Set();
  const changed = [];
  const added = [];
  let same = 0;
  for (const r of rows) {
    listed.add(r.sku);
    const newCost = costAud(r.costUsd, rules);
    const hit = inShop.get(r.sku);
    if (!hit) {
      added.push({ sku: r.sku, name: r.name, sheet: r.sheet, newCost, suggested: priceFor(newCost, rules) });
      continue;
    }
    const oldCost = hit.variant.cost === null || hit.variant.cost === undefined ? null : Number(hit.variant.cost);
    if (oldCost !== null && Math.abs(oldCost - newCost) < 0.005) {
      same++;
      continue;
    }
    changed.push({
      sku: r.sku,
      slug: hit.product.slug,
      product: hit.product.name,
      option: hit.variant.label,
      oldCost,
      newCost,
      price: Number(hit.variant.price),
      suggested: priceFor(newCost, rules),
    });
  }
  const missing = [];
  for (const [sku, hit] of inShop) {
    if (!listed.has(sku)) missing.push({ sku, slug: hit.product.slug, product: hit.product.name, option: hit.variant.label, stock: hit.variant.stock ?? null });
  }
  return { changed, added, missing, same, total: rows.length };
}

if (typeof window !== 'undefined') {
  window.ShopImport = { DEFAULT_PRICING, priceFor, costAud, readWorkbook, readCsv, diffCatalog };
}
