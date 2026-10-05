// js/shop-desktop.js - la tienda LEBYCLE en la computadora (shop.html).
//
// Es la tienda que Diego eligio en el canvas de bocetos, con la estructura de
// rockandroad.cl: portada con banner, catalogo con filtros a la izquierda y 20
// por pagina, ficha con selector de medidas, carrito en un cajon a la derecha.
// La primera version de escritorio era la pantalla del celular estirada a
// cuatro columnas; Diego, el 03-oct: "eso esta erroneo... debe parecerse a la
// de rock and road que nosotros diseñamos".
//
// La logica (catalogo, filtros, carrito, quien puede verla) vive en js/shop.js,
// la misma que usa el celular. Aca solo se dibuja.
//
// Todo el estado de la vista va en el hash (#all?s=parts&pg=2): el boton
// Atras del navegador vuelve a la pagina y a los filtros donde estaba, y un
// link copiado abre lo mismo.

import { sb } from './supabase.js';
import { ensureLang, getLang, translateScreen } from './i18n.js';
import {
  canSeeShop,
  loadCatalog,
  forgetCatalog,
  findProduct,
  findVariant,
  sectionName,
  countsBySection,
  countsByBand,
  PRICE_BANDS,
  filterProducts,
  SORTS,
  sortProducts,
  getCart,
  cartCount,
  addToCart,
  setQty,
  removeFromCart,
  clearCart,
  priceCart,
  goneLabel,
  maxQty,
  shippingFor,
  deliveryHtml,
  shippingNoteHtml,
} from './shop.js';
import { startCheckout, confirmOrder, mountCard } from './shop-pay.js';

const main = document.getElementById('shop-main');
const PER_PAGE = [20, 30, 50];

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const money = (n) => '$' + Number(n).toFixed(2);

const getToken = async () => {
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || null;
};

let catalog = null;

// ── El hash ──────────────────────────────────────────────────────────────────

function readRoute() {
  const raw = window.location.hash.replace(/^#/, '');
  const [route, query] = raw.split('?');
  return { route: route || '', params: new URLSearchParams(query || '') };
}

function go(route, params) {
  const q = params && params.toString();
  const next = '#' + route + (q ? '?' + q : '');
  if (window.location.hash === next) render();
  else window.location.hash = next;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

const svgBack =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
const svgCheck =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

// Una tarjeta. Con una sola medida se agrega directo; con varias, el boton
// lleva a la ficha: no se puede agregar "unas pastillas" sin saber cuales.
function card(p, withButton = true) {
  const n = p.variants.length;
  const soldOut = p.variants.every((v) => v.stock === 0);
  const href = '#product?slug=' + encodeURIComponent(p.slug);
  return `<div class="sd-card">
    <a class="sd-card__link" href="${href}">
      <div class="sd-card__shot">
        ${n > 1 ? `<span class="sd-card__sizes">${n} <span>sizes</span></span>` : ''}
        ${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">` : ''}
      </div>
      <div class="sd-card__price">${n > 1 ? '<span>From</span> ' : ''}${money(p.from)}${soldOut ? ' <span class="sd-card__sold">Sold out</span>' : ''}</div>
      <div class="sd-card__name">${esc(p.name)}</div>
    </a>
    ${
      withButton
        ? n > 1
          ? `<a class="sd-card__add" href="${href}" style="display:flex;align-items:center;justify-content:center;text-decoration:none">Choose size</a>`
          : soldOut
            ? '<button type="button" class="sd-card__add" disabled>Sold out</button>'
            : `<button type="button" class="sd-card__add" data-add="${esc(p.variants[0].sku)}">Add to cart</button>`
        : ''
    }
  </div>`;
}

function state(icon, title, sub, actions = '') {
  return `<div class="sd-wrap"><div class="sd-state">
    <div class="sd-state__icon" aria-hidden="true">${icon}</div>
    <h1 class="sd-state__title">${esc(title)}</h1>
    ${sub ? `<div class="sd-state__sub">${esc(sub)}</div>` : ''}
    ${actions ? `<div class="sd-state__actions">${actions}</div>` : ''}
  </div></div>`;
}

// ── La portada ───────────────────────────────────────────────────────────────

function viewHome() {
  const picks = sortProducts(catalog.products, 'stocked')
    .filter((p) => p.img)
    .slice(0, 6);
  const hero = findProduct(catalog, 'bicycle-wheelset') || picks[0];
  return `
  <section class="sd-hero">
    <div class="sd-wrap">
      <div class="sd-hero__text">
        <div class="sd-hero__kicker">Workshop grade, trade price</div>
        <h1 class="sd-hero__title">The parts we use,<br>for sale</h1>
        <a class="sd-hero__cta" href="#all">Shop all <span aria-hidden="true">&rarr;</span></a>
      </div>
      ${
        hero && hero.img
          ? `<div style="margin-left:auto;margin-right:40px;width:300px;height:250px;border-radius:16px;background:var(--white);display:flex;align-items:center;justify-content:center;flex-shrink:0">
               <img src="${esc(hero.img)}" alt="${esc(hero.name)}" style="max-height:84%;max-width:84%;object-fit:contain;mix-blend-mode:multiply">
             </div>`
          : ''
      }
    </div>
  </section>
  <div class="sd-trust"><div class="sd-wrap">
    <span>${svgCheck} LEBYCLE, straight from the maker</span>
    <span>${svgCheck} Delivered across Australia</span>
    <span>${svgCheck} Secure checkout with Stripe</span>
    <span>${svgCheck} Help on WhatsApp: 0433 963 250</span>
  </div></div>
  <div class="sd-wrap">
    <div class="sd-brand">
      <div class="sd-brand__name">LEBYCLE</div>
      <div class="sd-brand__rule" aria-hidden="true"></div>
      <p class="sd-brand__text">One brand, on purpose. LEBYCLE makes the workshop stands, the tools and the wear parts our own mechanics use, and we sell the same parts here, ordered straight from the factory.</p>
    </div>
    <section class="sd-sec">
      <div class="sd-sec__head">
        <h2 class="sd-sec__title">Most stocked</h2>
        <a class="sd-sec__more" href="#all"><span>See all</span> &rarr;</a>
      </div>
      <div class="sd-grid6">${picks.map((p) => card(p, false)).join('')}</div>
    </section>
    <section class="sd-workshop">
      <div class="sd-workshop__text">
        <h2 class="sd-workshop__title">Our workshop has wheels</h2>
        <p>There is no shop to drive to. The van carries the tools and the mechanic, and it comes to your door anywhere in Sydney.</p>
        <p>The parts in this shop are the ones our mechanics reach for. Not sure which one fits your bike? Send us a photo on WhatsApp and we tell you.</p>
        <div class="sd-workshop__hours">Mon - Sun: 8:30AM - 4:00PM</div>
      </div>
      <img class="sd-workshop__img" src="images/hero-van.webp" alt="The Dr. Bike Sydney van" loading="lazy">
    </section>
  </div>`;
}

// ── El catalogo ──────────────────────────────────────────────────────────────

function readFilters(params) {
  const list = (k) => (params.get(k) || '').split(',').filter(Boolean);
  const n = Number(params.get('n'));
  return {
    sections: list('s'),
    bands: list('b'),
    query: params.get('q') || '',
    sort: SORTS[params.get('sort')] ? params.get('sort') : 'stocked',
    perPage: PER_PAGE.includes(n) ? n : 20,
    page: Math.max(1, Math.floor(Number(params.get('pg')) || 1)),
  };
}

function writeFilters(f) {
  const p = new URLSearchParams();
  if (f.sections.length) p.set('s', f.sections.join(','));
  if (f.bands.length) p.set('b', f.bands.join(','));
  if (f.query) p.set('q', f.query);
  if (f.sort !== 'stocked') p.set('sort', f.sort);
  if (f.perPage !== 20) p.set('n', String(f.perPage));
  if (f.page > 1) p.set('pg', String(f.page));
  return p;
}

function viewCatalog(params) {
  const f = readFilters(params);
  const list = sortProducts(filterProducts(catalog, f), f.sort);
  const pages = Math.max(1, Math.ceil(list.length / f.perPage));
  const page = Math.min(f.page, pages);
  const from = (page - 1) * f.perPage;
  const shown = list.slice(from, from + f.perPage);
  const bySec = countsBySection(catalog);
  const byBand = countsByBand(catalog);

  const title = f.query
    ? 'Results for "' + f.query + '"'
    : f.sections.length === 1
      ? sectionName(catalog, f.sections[0])
      : 'All products';
  const crumb = f.sections.length === 1 && !f.query ? title : '';
  // La busqueda va en dos nodos: translateScreen cambia nodos de texto
  // EXACTOS, y 'Results for "tube"' no puede estar en ningun diccionario.
  const titleHtml = f.query ? '<span>Results for</span> "' + esc(f.query) + '"' : esc(title);

  const pageBtns = [];
  for (let i = 1; i <= pages; i++) {
    if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - page) > 1) {
      if (pageBtns[pageBtns.length - 1] !== '...') pageBtns.push('...');
      continue;
    }
    pageBtns.push(i);
  }

  return `<div class="sd-wrap">
    <div class="sd-crumbs">
      <a class="sd-back" href="#" aria-label="Back to the shop">${svgBack}</a>
      <div>
        <div class="sd-crumbs__path"><a href="#">Shop</a>${crumb ? ' &nbsp;/&nbsp; ' + esc(crumb) : ''}</div>
        <h1 class="sd-crumbs__title">${titleHtml}</h1>
        <div class="sd-crumbs__sub">${list.length} <span>products</span> &middot; <span>every size and fit lives inside its product</span></div>
      </div>
    </div>
    <div class="sd-layout">
      <aside class="sd-side" aria-label="Filters">
        <h2 class="sd-side__group">Section</h2>
        ${(catalog.sections || [])
          .filter((s) => bySec[s.id])
          .map(
            (s) => `<label class="sd-check">
              <input type="checkbox" data-fsec="${esc(s.id)}"${f.sections.includes(s.id) ? ' checked' : ''}>
              <span class="sd-check__name">${esc(s.name)}</span>
              <span class="sd-check__n">${bySec[s.id] || 0}</span>
            </label>`
          )
          .join('')}
        <div class="sd-side__rule" aria-hidden="true"></div>
        <h2 class="sd-side__group">Price</h2>
        ${PRICE_BANDS.map(
          (b) => `<label class="sd-check">
            <input type="checkbox" data-fband="${esc(b.id)}"${f.bands.includes(b.id) ? ' checked' : ''}>
            <span class="sd-check__name">${esc(b.name)}</span>
            <span class="sd-check__n">${byBand[b.id] || 0}</span>
          </label>`
        ).join('')}
        ${
          f.sections.length || f.bands.length || f.query
            ? `<button type="button" class="sd-side__clear" data-clear-filters>Clear all filters</button>`
            : ''
        }
      </aside>
      <div class="sd-main">
        <div class="sd-toolbar">
          <div class="sd-toolbar__count">${
            list.length ? `<span>Showing</span> ${from + 1}-${from + shown.length} <span>of</span> ${list.length}` : ''
          }</div>
          <div class="sd-toolbar__right">
            <div class="sd-perpage"><span>Show</span>
              ${PER_PAGE.map((n) => `<button type="button" data-perpage="${n}" aria-pressed="${n === f.perPage}">${n}</button>`).join('')}
            </div>
            <label class="sd-sort"><span>Sort</span>
              <select data-sort aria-label="Sort the products">
                ${Object.entries(SORTS)
                  .map(([k, v]) => `<option value="${k}"${k === f.sort ? ' selected' : ''}>${esc(v.name)}</option>`)
                  .join('')}
              </select>
            </label>
          </div>
        </div>
        ${
          shown.length
            ? `<div class="sd-grid4">${shown.map((p) => card(p)).join('')}</div>`
            : `<div class="sd-state" style="padding:60px 0">
                 <div class="sd-state__icon" aria-hidden="true">&#128269;</div>
                 <h2 class="sd-state__title">Nothing matches those filters</h2>
                 <div class="sd-state__sub">Try removing one of them.</div>
                 <div class="sd-state__actions"><button type="button" class="sd-btn" data-clear-filters>Clear all filters</button></div>
               </div>`
        }
        ${
          pages > 1
            ? `<nav class="sd-pager" aria-label="Pages">
                <button type="button" data-page="${page - 1}"${page === 1 ? ' disabled' : ''}>&larr; <span>Previous</span></button>
                ${pageBtns
                  .map((b) =>
                    b === '...'
                      ? '<span style="color:var(--gray-lt);padding:0 4px">...</span>'
                      : `<button type="button" data-page="${b}"${b === page ? ' aria-current="page"' : ''}>${b}</button>`
                  )
                  .join('')}
                <button type="button" data-page="${page + 1}"${page === pages ? ' disabled' : ''}><span>Next</span> &rarr;</button>
              </nav>
              <div class="sd-pager__info"><span>Page</span> ${page} <span>of</span> ${pages}</div>`
            : ''
        }
      </div>
    </div>
  </div>`;
}

// ── La ficha ─────────────────────────────────────────────────────────────────

// Las camaras vienen con etiquetas "20x1.75/2.125 Schrader 32 mm". Si casi
// todas las variantes siguen ese molde, el producto se ofrece con tres
// preguntas (medida, valvula, largo) en vez de una lista de 41. Es lo que
// muestra la ficha que Diego aprobo en el canvas.
const TUBE = /^(.+?) (Schrader|Presta) (\d+ mm)$/;

function axesOf(product) {
  const hits = product.variants.map((v) => ({ v, m: TUBE.exec(v.label) })).filter((x) => x.m);
  if (product.variants.length < 4 || hits.length < product.variants.length * 0.8) return null;
  const uniq = (a) => [...new Set(a)];
  return {
    names: ['Wheel size', 'Valve', 'Valve length'],
    values: [0, 1, 2].map((i) => uniq(hits.map((x) => x.m[i + 1]))),
    of: new Map(hits.map((x) => [x.v.sku, [x.m[1], x.m[2], x.m[3]]])),
  };
}

const pd = { slug: null, sku: null, qty: 1 };

function viewProduct(params) {
  const product = findProduct(catalog, params.get('slug'));
  if (!product) {
    return state('&#128269;', 'That product is no longer in the shop', '', `<a class="sd-btn sd-btn--primary" href="#all">See all products</a>`);
  }
  if (pd.slug !== product.slug) {
    pd.slug = product.slug;
    // Arranca elegida la mas barata, que es el precio que se vio en la
    // tarjeta: si arrancara otra, el precio de la ficha no coincidiria.
    pd.sku = [...product.variants].sort((a, b) => a.price - b.price)[0].sku;
    pd.qty = 1;
  }
  const v = findVariant(product, pd.sku) || product.variants[0];
  // Cambiar a una opcion con menos stock no deja la cantidad por encima.
  pd.qty = Math.max(1, Math.min(pd.qty, maxQty(v) || 1));
  const n = product.variants.length;
  const axes = axesOf(product);

  let options = '';
  if (axes) {
    const cur = axes.of.get(v.sku) || [];
    options = axes.names
      .map((name, i) => {
        const chips = axes.values[i]
          .map((val) => {
            const exact = product.variants.some((x) => {
              const t = axes.of.get(x.sku);
              return t && t[i] === val && t.every((tv, j) => j === i || tv === cur[j]);
            });
            const on = cur[i] === val;
            return `<button type="button" class="sd-opt${!on && !exact ? ' sd-opt--far' : ''}" data-axis="${i}" data-val="${esc(val)}" aria-pressed="${on}">${esc(val)}</button>`;
          })
          .join('');
        return `<div class="sd-pd__label"><span>${esc(name)}</span>${i === 0 ? '<span class="sd-pd__hint">Not sure? Read it off the tyre wall</span>' : ''}</div><div class="sd-opts">${chips}</div>`;
      })
      .join('');
  } else if (n > 1 && n <= 12) {
    options = `<div class="sd-pd__label"><span>Size and fit</span></div><div class="sd-opts">${product.variants
      .map(
        (x) => `<button type="button" class="sd-opt${x.stock === 0 ? ' sd-opt--out' : ''}" data-pick="${esc(x.sku)}" aria-pressed="${x.sku === v.sku}">${esc(x.label)}${
          x.stock === 0
            ? '<span class="sd-opt__hint">Sold out</span>'
            : x.price !== v.price
              ? `<span class="sd-opt__hint">${money(x.price)}</span>`
              : ''
        }</button>`
      )
      .join('')}</div>`;
  } else if (n > 12) {
    options = `<label class="sd-pd__label" for="sd-pick"><span>Size and fit</span><span class="sd-pd__hint">${n} <span>options</span></span></label>
      <select id="sd-pick" class="sd-select" data-pick-select>${product.variants
        .map((x) => `<option value="${esc(x.sku)}"${x.sku === v.sku ? ' selected' : ''}>${esc(x.label)} - ${x.stock === 0 ? 'Sold out' : money(x.price)}</option>`)
        .join('')}</select>`;
  }

  const related = sortProducts(
    catalog.products.filter((p) => p.cat === product.cat && p.slug !== product.slug && p.img),
    'stocked'
  ).slice(0, 4);

  return `<div class="sd-wrap">
    <div class="sd-crumbs" style="border-bottom:none;padding-bottom:12px">
      <a class="sd-back" href="#all?s=${esc(product.cat)}" aria-label="Back to ${esc(sectionName(catalog, product.cat))}">${svgBack}</a>
      <div class="sd-crumbs__path"><a href="#">Shop</a> &nbsp;/&nbsp; <a href="#all?s=${esc(product.cat)}">${esc(sectionName(catalog, product.cat))}</a> &nbsp;/&nbsp; <span style="color:var(--navy)">${esc(product.name)}</span></div>
    </div>
    <div class="sd-pd">
      <div class="sd-pd__shot">${product.img ? `<img src="${esc(product.img)}" alt="${esc(product.name)}">` : ''}</div>
      <div class="sd-pd__info">
        <div class="sd-pd__brand">${esc(catalog.brand || 'LEBYCLE')}</div>
        <h1 class="sd-pd__title">${esc(product.name)}</h1>
        <div class="sd-pd__priceline">
          <span class="sd-pd__price">${money(v.price)}</span>
          <span class="sd-pd__note">${n > 1 ? `${n} <span>sizes and fits</span>` : '<span>One size</span>'}</span>
        </div>
        ${product.desc ? `<p class="sd-pd__desc">${esc(product.desc).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="sd-pd__rule" aria-hidden="true"></div>
        ${options}
        <div class="sd-buy">
          <div class="sd-qty">
            <button type="button" data-pqty="-1" aria-label="One less">&minus;</button>
            <span class="sd-qty__n">${pd.qty}</span>
            <button type="button" data-pqty="1" aria-label="One more">+</button>
          </div>
          ${
            v.stock === 0
              ? '<button type="button" class="sd-addbig" disabled><span>Sold out</span></button>'
              : `<button type="button" class="sd-addbig" data-padd><span>Add to cart</span><span> &middot; ${money(v.price * pd.qty)}</span></button>`
          }
        </div>
        <div class="sd-boxes">
          <div class="sd-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="6" width="13" height="10.5" rx="1.6"/><path d="M14.5 10h3.4l3.1 3.1v3.4h-6.5z"/><circle cx="6" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/></svg>
            <div><div class="sd-box__title">Delivered across Australia</div><div class="sd-box__sub">${deliveryHtml(catalog)}</div></div>
          </div>
          <div class="sd-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/></svg>
            <div><div class="sd-box__title">Not sure which one fits?</div><div class="sd-box__sub"><span>Send us a photo on</span> <a href="https://wa.me/61433963250">WhatsApp</a></div></div>
          </div>
        </div>
      </div>
    </div>
    <section class="sd-specs">
      <h2 class="sd-specs__title">Specs</h2>
      ${[
        ['Brand', catalog.brand || 'LEBYCLE'],
        ['Section', sectionName(catalog, product.cat)],
        ['Selected', v.label],
        ['Code', v.sku],
        ['Sizes in this product', String(n)],
      ]
        .map(([k, val]) => `<div class="sd-specs__row"><div class="sd-specs__k">${esc(k)}</div><div class="sd-specs__v">${esc(val)}</div></div>`)
        .join('')}
    </section>
    ${
      related.length
        ? `<section class="sd-sec" style="margin-bottom:72px">
            <div class="sd-sec__head"><h2 class="sd-sec__title">More in ${esc(sectionName(catalog, product.cat))}</h2>
            <a class="sd-sec__more" href="#all?s=${esc(product.cat)}"><span>See all</span> &rarr;</a></div>
            <div class="sd-grid4" style="margin-top:24px">${related.map((p) => card(p)).join('')}</div>
          </section>`
        : '<div style="height:72px"></div>'
    }
  </div>`;
}

// ── El pago ──────────────────────────────────────────────────────────────────
//
// En dos pasos. Primero los datos de envio: el servidor pone los precios,
// guarda el pedido y crea el cobro. Recien entonces aparece la tarjeta, con el
// importe que el servidor calculo escrito en el boton. Lo que se cobra es
// exactamente lo que el cliente ve antes de tocar Pagar.

// El cobro en curso, entre "Continuar al pago" y "Pagar".
let pay = null; // { orderId, ref, clientSecret, publishableKey, total, mode, card, details }
// Lo escrito en el formulario. Redibujar la pantalla (abrir el carrito y
// volver, cambiar una cantidad) no tiene que obligar a escribir todo de nuevo.
const draft = {};

function resetPay() {
  if (pay?.card) pay.card.destroy();
  pay = null;
}

function viewCheckout() {
  resetPay();
  const { items, subtotal, hasGone } = priceCart(catalog, getCart());
  if (!items.length) {
    return state('&#128722;', 'Your cart is empty', 'Parts you add show up here.', `<a class="sd-btn sd-btn--primary" href="#all">Go to the shop</a>`);
  }
  const ship = shippingFor(catalog, subtotal);
  const field = (id, label, type, ac) =>
    `<label class="sd-field" for="${id}"><span>${label}</span><input id="${id}" type="${type}" autocomplete="${ac}" value="${esc(draft[id] || '')}"></label>`;
  return `<div class="sd-wrap">
    <div class="sd-crumbs" style="border-bottom:none">
      <button type="button" class="sd-back" data-open-cart aria-label="Back to the cart">${svgBack}</button>
      <div><div class="sd-crumbs__path"><a href="#">Shop</a> &nbsp;/&nbsp; <span>Checkout</span></div>
      <h1 class="sd-crumbs__title">Checkout</h1></div>
    </div>
    <div class="sd-co">
      <form class="sd-co__form" id="sd-co-form" novalidate>
        <fieldset class="sd-co__details" id="sd-co-details">
          <legend class="sd-side__group">Where it goes</legend>
          ${field('co-name', 'Your name', 'text', 'name')}
          <div class="sd-co__row">${field('co-email', 'Email', 'email', 'email')}${field('co-phone', 'Phone', 'tel', 'tel')}</div>
          ${field('co-address', 'Street address', 'text', 'street-address')}
          <div class="sd-co__row">${field('co-suburb', 'Suburb', 'text', 'address-level2')}${field('co-postcode', 'Postcode', 'text', 'postal-code')}</div>
        </fieldset>
        <button type="submit" class="sd-addbig" id="sd-co-next" style="width:100%;margin-top:24px"${hasGone ? ' disabled' : ''}><span>Continue to payment</span><span> &middot; ${money(subtotal + ship)}</span></button>
        <section class="sd-pay" id="sd-pay" aria-labelledby="sd-pay-title" hidden>
          <div class="sd-pay__head">
            <h2 class="sd-side__group" id="sd-pay-title">Card</h2>
            <button type="button" class="sd-pay__edit" data-edit-details>Change my details</button>
          </div>
          <p class="sd-pay__test" id="sd-pay-test" hidden>Test mode: no money is taken. Use the card 4242 4242 4242 4242, any future date and any CVC.</p>
          <div class="shop-cardform" id="sd-card"></div>
          <button type="button" class="sd-addbig" data-pay style="width:100%;margin-top:18px"><span>Pay</span><span id="sd-pay-amt"></span></button>
          <p class="sd-pay__secure">Your card goes straight to Stripe. We never see the number.</p>
        </section>
        <div class="sd-msg" id="sd-co-msg" role="status"></div>
      </form>
      <aside class="sd-co__sum" aria-label="Your order">
        <h2 class="sd-side__group">Your order</h2>
        ${items
          .map(
            (i) => `<div class="sd-co__item"><span>${esc(i.name)} <span style="color:var(--gray)">x${i.qty}</span></span><b>${money(i.total)}</b></div>`
          )
          .join('')}
        <div class="sd-pd__rule" aria-hidden="true" style="margin:14px 0"></div>
        ${
          catalog.shipping
            ? `<div class="sd-co__item"><span>Subtotal</span><b>${money(subtotal)}</b></div>
               <div class="sd-co__item"><span>Shipping</span><b>${ship ? money(ship) : '<span>Free</span>'}</b></div>
               <div class="sd-total"><span class="sd-total__label">Total</span><span class="sd-total__value">${money(subtotal + ship)}</span></div>
               <div class="sd-note">${deliveryHtml(catalog)}</div>`
            : `<div class="sd-total"><span class="sd-total__label">Subtotal</span><span class="sd-total__value">${money(subtotal)}</span></div>
               <div class="sd-note">Delivery is worked out at checkout. [CONFIRMAR PLAZO DE ENTREGA]</div>`
        }
      </aside>
    </div>
  </div>`;
}

function coSay(cls, text) {
  const msg = document.getElementById('sd-co-msg');
  if (!msg) return;
  msg.className = 'sd-msg ' + cls;
  msg.textContent = text;
  // Un mensaje puesto despues de dibujar no pasa por translateScreen solo.
  translateScreen(msg);
}

// Paso 1: los datos, el precio del servidor, y la tarjeta.
async function placeOrder(form) {
  if (pay) return;
  const btn = document.getElementById('sd-co-next');
  const val = (id) => form.querySelector('#' + id)?.value.trim() || '';
  if (!val('co-address') || !val('co-suburb')) {
    coSay('sd-msg--err', 'We need an address and a suburb to send this to.');
    form.querySelector('#co-address').focus();
    return;
  }
  const details = {
    name: val('co-name'),
    email: val('co-email'),
    phone: val('co-phone'),
    address: val('co-address'),
    suburb: val('co-suburb'),
    postcode: val('co-postcode'),
  };
  const { subtotal } = priceCart(catalog, getCart());
  const expected = subtotal + shippingFor(catalog, subtotal);
  btn.disabled = true;
  coSay('', 'Preparing the payment...');
  try {
    const data = await startCheckout(await getToken(), getCart(), details, getLang());
    // El servidor manda lo que de verdad va a cobrar. Si no coincide con lo
    // que se mostraba, se dice antes: no se cobra callando la diferencia.
    if (Math.abs(Number(data.total) - expected) > 0.009) {
      coSay('sd-msg--warn', 'The price changed to ' + money(data.total) + ' while you were here. Check the cart before going on.');
      btn.disabled = false;
      return;
    }
    const box = document.getElementById('sd-pay');
    const card = await mountCard(document.getElementById('sd-card'), data.publishableKey, getLang());
    pay = { ...data, card, details };
    document.getElementById('sd-co-details').disabled = true;
    btn.hidden = true;
    document.getElementById('sd-pay-test').hidden = data.mode === 'live';
    document.getElementById('sd-pay-amt').textContent = ' · ' + money(data.total);
    box.hidden = false;
    translateScreen(box);
    coSay('', '');
    // La tarjeta aparece debajo de los datos, fuera de la vista en una
    // pantalla normal. Sin esto, el boton parece no haber hecho nada.
    box.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (e) {
    // Nunca un catch vacio: si no se pudo, el motivo se lee en pantalla.
    coSay('sd-msg--err', e.message);
    btn.disabled = false;
  }
}

// Volver a los datos. El cobro que se habia creado queda pendiente y sin
// tocar: no se cobra nada que no se confirme con la tarjeta.
function editDetails() {
  resetPay();
  document.getElementById('sd-co-details').disabled = false;
  document.getElementById('sd-pay').hidden = true;
  const next = document.getElementById('sd-co-next');
  next.hidden = false;
  next.disabled = false;
  coSay('', '');
}

// Paso 2: la tarjeta. Si no pasa, se corrige y se vuelve a tocar Pagar sobre
// el mismo cobro - no se crea otro pedido por cada intento.
async function payNow(btn) {
  if (!pay || btn.disabled) return;
  btn.disabled = true;
  coSay('', 'Paying...');
  let status;
  try {
    status = await pay.card.pay(pay.clientSecret, pay.details);
  } catch (e) {
    coSay('sd-msg--err', e.message);
    btn.disabled = false;
    return;
  }
  if (status !== 'succeeded') {
    coSay('sd-msg--warn', 'Your bank has not confirmed the payment yet. We will email you as soon as it does.');
    return;
  }

  // Stripe dice que se cobro. Ahora nuestro servidor lo comprueba con Stripe,
  // marca el pedido y manda los avisos.
  const done = { ref: pay.ref, test: pay.mode !== 'live', emailed: false };
  try {
    const r = await confirmOrder(await getToken(), pay.orderId, getLang());
    done.emailed = r.status === 'paid';
  } catch (e) {
    // El cobro ya esta hecho: lo que fallo es avisarle a nuestro servidor. El
    // cliente no puede quedar pensando que no pago, asi que la pantalla de
    // pagado sale igual, con el telefono para llamar.
    console.error('[shop] confirm failed:', e.message);
  }
  clearCart();
  refreshCartCount();
  resetPay();
  main.innerHTML = viewPaid(done);
  translateScreen(main);
  scrollTop();
}

function viewPaid({ ref, test, emailed }) {
  return `<div class="sd-wrap"><div class="sd-state">
    <div class="sd-state__icon" aria-hidden="true">&#10003;</div>
    <h1 class="sd-state__title">Your order is paid</h1>
    <div class="sd-state__sub"><span>Order</span> <b>#${esc(ref)}</b></div>
    <div class="sd-state__sub">${
      emailed
        ? '<span>We emailed you the details. The tracking number follows as soon as it ships.</span>'
        : '<span>Your payment went through. If no email arrives in a few minutes, call 0433 963 250.</span>'
    }</div>
    ${test ? '<div class="sd-state__sub"><span>Test order: no money was taken.</span></div>' : ''}
    <div class="sd-state__actions"><a class="sd-btn sd-btn--primary" href="#">Back to the shop</a></div>
  </div></div>`;
}

// ── El carrito ───────────────────────────────────────────────────────────────

function refreshCartCount() {
  const el = document.getElementById('sd-cart-n');
  const n = cartCount();
  el.textContent = String(n);
  el.hidden = n === 0;
  el.parentElement.setAttribute('aria-label', 'Open the cart, ' + n + ' ' + (n === 1 ? 'item' : 'items'));
}

// Cambiar el carrito con la tarjeta ya a la vista dejaria un cobro por otro
// importe. La pantalla de pago se redibuja con los numeros nuevos y vuelve al
// paso de los datos (lo escrito se conserva en `draft`).
function cartChanged() {
  refreshCartCount();
  paintCart();
  if (pay && readRoute().route === 'checkout') render();
}

function paintCart() {
  const body = document.getElementById('sd-drawer-body');
  const foot = document.getElementById('sd-drawer-foot');
  if (!catalog) return;
  const { items, subtotal, hasGone } = priceCart(catalog, getCart());
  if (!items.length) {
    body.innerHTML = `<div class="sd-state" style="padding:60px 0">
      <div class="sd-state__icon" aria-hidden="true">&#128722;</div>
      <div class="sd-state__title" style="font-size:18px">Your cart is empty</div>
      <div class="sd-state__sub">Parts you add show up here.</div></div>`;
    foot.innerHTML = `<a class="sd-btn sd-btn--block" href="#all" data-close-cart>Go to the shop</a>`;
  } else {
    body.innerHTML = items
      .map(
        (i) => `<div class="sd-line${i.gone ? ' sd-line--gone' : ''}">
          <div class="sd-line__shot">${i.img ? `<img src="${esc(i.img)}" alt="">` : ''}</div>
          <div style="flex-grow:1;min-width:0">
            <div class="sd-line__name">${esc(i.name)}</div>
            <div class="sd-line__variant">${i.gone ? goneLabel(i) : esc(i.variant)}</div>
            <div class="sd-line__ctrl">
              <div class="sd-qty">
                <button type="button" data-cq="${esc(i.sku)}" data-d="-1" aria-label="One less">&minus;</button>
                <span class="sd-qty__n">${i.qty}</span>
                <button type="button" data-cq="${esc(i.sku)}" data-d="1" aria-label="One more">+</button>
              </div>
              <button type="button" class="sd-line__drop" data-drop="${esc(i.sku)}">Remove</button>
            </div>
          </div>
          <div class="sd-line__price">${money(i.total)}</div>
        </div>`
      )
      .join('');
    foot.innerHTML = `<div class="sd-total"><span class="sd-total__label">Subtotal</span><span class="sd-total__value">${money(subtotal)}</span></div>
      <div class="sd-note">${shippingNoteHtml(catalog, subtotal)}</div>
      ${hasGone ? `<div class="sd-note" style="color:var(--red)">One of these cannot be bought right now. Remove it or lower the quantity to keep going.</div>` : ''}
      <a class="sd-btn sd-btn--primary sd-btn--block" href="#checkout" data-close-cart style="margin-top:14px${hasGone ? ';pointer-events:none;opacity:.5' : ''}"><span>Checkout</span><span> &middot; ${money(subtotal)}</span></a>
      <button type="button" class="sd-btn sd-btn--block" data-close-cart style="margin-top:8px">Keep shopping</button>`;
  }
  translateScreen(document.getElementById('sd-drawer'));
}

let lastFocus = null;
function openCart() {
  paintCart();
  lastFocus = document.activeElement;
  document.getElementById('sd-veil').hidden = false;
  const d = document.getElementById('sd-drawer');
  d.hidden = false;
  d.querySelector('.sd-drawer__close').focus();
}

function closeCart() {
  document.getElementById('sd-veil').hidden = true;
  document.getElementById('sd-drawer').hidden = true;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

// ── Dibujar ──────────────────────────────────────────────────────────────────

function markCategory(route, params) {
  const sec = route === 'all' ? readFilters(params).sections : [];
  const active = sec.length === 1 ? sec[0] : route === 'all' && !params.get('q') && !sec.length ? '' : null;
  document.querySelectorAll('.sd-cats [data-cat]').forEach((a) => {
    if (a.dataset.cat === active) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  });
  const q = document.getElementById('sd-q');
  if (q && document.activeElement !== q) q.value = route === 'all' ? params.get('q') || '' : '';
}

function render() {
  if (!catalog) return;
  const { route, params } = readRoute();
  let html;
  if (route === 'all') html = viewCatalog(params);
  else if (route === 'product') html = viewProduct(params);
  else if (route === 'checkout') html = viewCheckout();
  else html = viewHome();
  // Salir del pago suelta la tarjeta: el campo de Stripe no sobrevive a que se
  // redibuje la pantalla, y un `pay` colgado haria creer que se puede pagar.
  if (route !== 'checkout') resetPay();
  main.innerHTML = html;
  markCategory(route, params);
  translateScreen(main);
  if (route === 'cart') openCart();
}

function scrollTop() {
  window.scrollTo(0, 0);
}

// Cambiar de pantalla cierra el carrito. Sin esto, abrirlo y despues usar el
// boton Atras del navegador dejaba el cajon abierto tapando la pantalla nueva.
window.addEventListener('hashchange', () => {
  if (!document.getElementById('sd-drawer').hidden) closeCart();
  render();
  scrollTop();
});

// ── Los toques, todos por delegacion: las vistas se redibujan enteras ──────

document.addEventListener('click', (ev) => {
  const t = ev.target;

  if (t.closest('[data-open-cart]')) {
    ev.preventDefault();
    openCart();
    return;
  }
  if (t.closest('[data-close-cart]')) {
    // Los enlaces del cajon (a la tienda, al pago) navegan igual.
    if (!t.closest('a[href]')) ev.preventDefault();
    closeCart();
    return;
  }

  const add = t.closest('[data-add]');
  if (add) {
    addToCart(add.dataset.add, 1);
    refreshCartCount();
    add.textContent = 'Added';
    add.disabled = true;
    translateScreen(add);
    setTimeout(() => {
      add.textContent = 'Add to cart';
      add.disabled = false;
      translateScreen(add);
    }, 1100);
    return;
  }

  const cq = t.closest('[data-cq]');
  if (cq) {
    const cur = getCart().find((l) => l.sku === cq.dataset.cq);
    setQty(cq.dataset.cq, (cur?.qty || 0) + Number(cq.dataset.d));
    cartChanged();
    return;
  }
  const drop = t.closest('[data-drop]');
  if (drop) {
    removeFromCart(drop.dataset.drop);
    cartChanged();
    return;
  }

  const payBtn = t.closest('[data-pay]');
  if (payBtn) {
    payNow(payBtn);
    return;
  }
  if (t.closest('[data-edit-details]')) {
    editDetails();
    return;
  }

  const { route, params } = readRoute();

  const per = t.closest('[data-perpage]');
  if (per) {
    const f = readFilters(params);
    f.perPage = Number(per.dataset.perpage);
    f.page = 1;
    go('all', writeFilters(f));
    return;
  }
  const pg = t.closest('[data-page]');
  if (pg && !pg.disabled) {
    const f = readFilters(params);
    f.page = Number(pg.dataset.page);
    go('all', writeFilters(f));
    return;
  }
  if (t.closest('[data-clear-filters]')) {
    go('all', new URLSearchParams());
    return;
  }

  // La ficha
  const pick = t.closest('[data-pick]');
  if (pick) {
    pd.sku = pick.dataset.pick;
    render();
    return;
  }
  const axis = t.closest('[data-axis]');
  if (axis && route === 'product') {
    const product = findProduct(catalog, params.get('slug'));
    const axes = product && axesOf(product);
    if (axes) {
      const i = Number(axis.dataset.axis);
      const cur = axes.of.get(pd.sku) || [];
      const want = cur.slice();
      want[i] = axis.dataset.val;
      // La variante que respeta lo que se toco y coincide en lo demas lo mas
      // posible: tocar "Presta" no tiene que perder la medida elegida.
      let best = null;
      let bestScore = -1;
      for (const v of product.variants) {
        const tv = axes.of.get(v.sku);
        if (!tv || tv[i] !== want[i]) continue;
        const score = tv.reduce((s, x, j) => s + (x === want[j] ? 1 : 0), 0);
        if (score > bestScore || (score === bestScore && best.price > v.price)) {
          best = v;
          bestScore = score;
        }
      }
      if (best) {
        pd.sku = best.sku;
        render();
      }
    }
    return;
  }
  const pq = t.closest('[data-pqty]');
  if (pq) {
    const max = maxQty(findVariant(findProduct(catalog, readRoute().params.get('slug')), pd.sku)) || 1;
    pd.qty = Math.max(1, Math.min(max, pd.qty + Number(pq.dataset.pqty)));
    render();
    return;
  }
  const padd = t.closest('[data-padd]');
  if (padd) {
    addToCart(pd.sku, pd.qty);
    refreshCartCount();
    pd.qty = 1;
    render();
    openCart();
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  const { params } = readRoute();
  if (t.matches('[data-fsec], [data-fband]')) {
    const f = readFilters(params);
    const key = t.matches('[data-fsec]') ? 'sections' : 'bands';
    const val = t.dataset.fsec || t.dataset.fband;
    f[key] = t.checked ? [...new Set([...f[key], val])] : f[key].filter((x) => x !== val);
    f.page = 1;
    go('all', writeFilters(f));
    return;
  }
  if (t.matches('[data-sort]')) {
    const f = readFilters(params);
    f.sort = t.value;
    f.page = 1;
    go('all', writeFilters(f));
    return;
  }
  if (t.matches('[data-pick-select]')) {
    pd.sku = t.value;
    render();
  }
});

document.addEventListener('submit', (ev) => {
  if (ev.target.id === 'sd-search') {
    ev.preventDefault();
    const q = document.getElementById('sd-q').value.trim();
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    go('all', p);
    return;
  }
  if (ev.target.id === 'sd-co-form') {
    ev.preventDefault();
    placeOrder(ev.target);
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id && t.closest('#sd-co-form')) draft[t.id] = t.value;
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !document.getElementById('sd-drawer').hidden) closeCart();
});

// ── Arranque ─────────────────────────────────────────────────────────────────

async function start() {
  await ensureLang(getLang()).catch(() => {});
  translateScreen(document.body);

  const { data } = await sb.auth.getSession();
  const user = data?.session?.user || null;
  const account = document.getElementById('sd-account');
  if (user) {
    const name = (user.user_metadata?.full_name || user.email || '').split('@')[0].split(' ')[0];
    account.textContent = 'Hi, ' + name;
  }

  // Cortesia de interfaz, no un permiso: el que decide es /api/shop. Sin
  // sesion valida y email en la lista, el servidor no manda el catalogo.
  if (!canSeeShop(user)) {
    main.innerHTML = state(
      '&#128274;',
      'This page is not available',
      '',
      `<a class="sd-btn sd-btn--primary" href="/landing.html">Go to Dr. Bike Sydney</a>`
    );
    translateScreen(main);
    return;
  }

  refreshCartCount();
  try {
    catalog = await loadCatalog(getToken);
  } catch (e) {
    main.innerHTML = state(
      '&#9888;&#65039;',
      'The shop did not load',
      e.message,
      `<button type="button" class="sd-btn" id="sd-retry">Try again</button><a class="sd-btn sd-btn--primary" href="/landing.html">Go to the home screen</a>`
    );
    translateScreen(main);
    document.getElementById('sd-retry')?.addEventListener('click', () => {
      forgetCatalog();
      start();
    });
    return;
  }
  render();
}

start();
