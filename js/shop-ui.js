// js/shop-ui.js — las pantallas de la tienda en la SPA del celular.
//
// Vive aparte de js/app.js a proposito: app.js ya tiene 6400 lineas y la
// tienda es un bloque entero que no se cruza con las reservas. Lo unico que
// app.js hace es importar estas tres funciones y enchufarlas en su tabla de
// rutas.
//
// La logica (catalogo, filtros, carrito) esta en js/shop.js, que no toca el
// DOM y lo comparte la landing de escritorio. Aca solo se dibuja.

import {
  loadCatalog,
  findProduct,
  findVariant,
  filterProducts,
  sortProducts,
  countsBySection,
  countsByBand,
  PRICE_BANDS,
  SORTS,
  getCart,
  cartCount,
  addToCart,
  setQty,
  removeFromCart,
  priceCart,
} from './shop.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n) => '$' + Number(n).toFixed(2);

// El estado de la tienda vive aca y no en la URL: volver atras del producto a
// la lista tiene que devolver los filtros como estaban. Si estuvieran en el
// hash, el router los perderia en cada navegacion.
const state = { sections: [], bands: [], query: '', sort: 'stocked' };

let getToken = async () => null;
let onError = (msg) => console.error(msg);

export function configureShop(opts) {
  if (opts.getToken) getToken = opts.getToken;
  if (opts.onError) onError = opts.onError;
}

function cartBtn() {
  const n = cartCount();
  return `<button type="button" class="shop-cart-btn" data-shop-cart aria-label="Cart, ${n} ${n === 1 ? 'item' : 'items'}">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.3 11.5a2 2 0 0 0 2 1.5h7.9a2 2 0 0 0 2-1.6L20 7H5.3"/></svg>
      ${n ? `<span class="shop-cart-btn__n">${n}</span>` : ''}
    </button>`;
}

function backBtn(label) {
  // La flecha de arriba a la izquierda. Diego: "mucha gente la sigue usando".
  // Hace lo mismo que arrastrar desde el borde izquierdo.
  return `<button type="button" class="shop-back" data-shop-back style="width:44px;height:44px;border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0" aria-label="${esc(label)}">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>
    </button>`;
}

function card(p) {
  const n = p.variants.length;
  return `<a class="shop-card" href="#shop-product?slug=${encodeURIComponent(p.slug)}" data-shop-link="${esc(p.slug)}">
      <div class="shop-card__shot">
        ${n > 1 ? `<span class="shop-card__sizes">${n} sizes</span>` : ''}
        ${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">` : ''}
      </div>
      <div class="shop-card__price">${n > 1 ? 'From ' : ''}${money(p.from)}</div>
      <div class="shop-card__name">${esc(p.name)}</div>
    </a>`;
}

function spinner(msg) {
  return `<div class="shop-empty"><div class="shop-empty__icon">&#128269;</div><div class="shop-empty__title">${esc(msg)}</div></div>`;
}

function failed(screen, e) {
  // Nunca un catch vacio: si la tienda no carga, el motivo se lee en pantalla.
  screen.innerHTML = `<div class="screen-content"><div class="shop-empty">
      <div class="shop-empty__icon">&#9888;&#65039;</div>
      <div class="shop-empty__title">The shop did not load</div>
      <div class="shop-empty__sub">${esc(e?.message || String(e))}</div>
      <button type="button" class="btn btn-secondary" data-shop-retry style="margin-top:16px">Try again</button>
    </div></div>`;
}

// ── La tienda ────────────────────────────────────────────────────────────────

export async function renderShop() {
  const screen = document.querySelector('[data-screen="shop"]');
  if (!screen) return;
  screen.innerHTML = `<div class="screen-content">${spinner('Loading the shop...')}</div>`;

  let catalog;
  try {
    catalog = await loadCatalog(getToken);
  } catch (e) {
    failed(screen, e);
    return;
  }
  paintShop(screen, catalog);
}

function paintShop(screen, catalog) {
  const list = sortProducts(filterProducts(catalog, state), state.sort);
  const active = state.sections.length + state.bands.length;

  screen.innerHTML = `
    <div class="screen-header" style="display:flex;align-items:center;gap:6px;padding-left:4px">
      ${backBtn('Back')}
      <h1 class="screen-title" style="flex-grow:1;margin:0">Shop</h1>
      ${cartBtn()}
    </div>
    <div class="screen-content">
      <div class="shop-top">
        <button type="button" class="shop-filter-btn" data-shop-filters>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          <span>${active ? `Filters &middot; ${active}` : 'All products'}</span>
        </button>

        <select class="shop-sort" data-shop-sort aria-label="Sort the products">
          ${Object.entries(SORTS)
            .map(([k, v]) => `<option value="${k}"${k === state.sort ? ' selected' : ''}>${esc(v.name)}</option>`)
            .join('')}
        </select>
      </div>
      ${
        list.length
          ? `<div class="shop-grid">${list.map(card).join('')}</div>`
          : `<div class="shop-empty">
               <div class="shop-empty__icon">&#128269;</div>
               <div class="shop-empty__title">Nothing matches those filters</div>
               <div class="shop-empty__sub">Try removing one of them.</div>
             </div>`
      }
    </div>`;

  screen.querySelector('[data-shop-sort]')?.addEventListener('change', (ev) => {
    state.sort = ev.target.value;
    paintShop(screen, catalog);
  });
  screen.querySelector('[data-shop-filters]')?.addEventListener('click', () => openFilters(screen, catalog));
}

// ── El panel de filtros ──────────────────────────────────────────────────────

function openFilters(screen, catalog) {
  const bySection = countsBySection(catalog);
  const byBand = countsByBand(catalog);
  // Se trabaja sobre una copia: cerrar con la X tiene que dejar todo como
  // estaba, no aplicar a medias lo que se toco.
  const draft = { sections: [...state.sections], bands: [...state.bands] };

  const sheet = document.createElement('div');
  sheet.className = 'shop-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Filters');
  sheet.innerHTML = `
    <div class="shop-sheet__head">
      <span class="shop-sheet__title" style="flex-grow:1">Filters</span>
      <button type="button" data-close style="width:44px;height:44px;border:none;background:none;cursor:pointer" aria-label="Close filters">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" stroke-width="2.1" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
      </button>
    </div>
    <div class="shop-sheet__body">
      <div class="shop-group">Section</div>
      ${(catalog.sections || [])
        .map(
          (s) => `<label class="shop-check">
            <input type="checkbox" data-sec="${esc(s.id)}"${draft.sections.includes(s.id) ? ' checked' : ''}>
            <span class="shop-check__name">${esc(s.name)}</span>
            <span class="shop-check__n">${bySection[s.id] || 0}</span>
          </label>`
        )
        .join('')}
      <div class="shop-group">Price</div>
      ${PRICE_BANDS.map(
        (b) => `<label class="shop-check">
          <input type="checkbox" data-band="${esc(b.id)}"${draft.bands.includes(b.id) ? ' checked' : ''}>
          <span class="shop-check__name">${esc(b.name)}</span>
          <span class="shop-check__n">${byBand[b.id] || 0}</span>
        </label>`
      ).join('')}
    </div>
    <div class="shop-sheet__foot">
      <button type="button" class="btn btn-secondary" data-clear style="flex:1">Clear</button>
      <button type="button" class="btn btn-primary" data-apply style="flex:2">Show products</button>
    </div>`;
  document.body.appendChild(sheet);

  sheet.addEventListener('change', (ev) => {
    const sec = ev.target.dataset.sec;
    const band = ev.target.dataset.band;
    const flip = (arr, v) => (ev.target.checked ? [...new Set([...arr, v])] : arr.filter((x) => x !== v));
    if (sec) draft.sections = flip(draft.sections, sec);
    if (band) draft.bands = flip(draft.bands, band);
  });
  const close = () => sheet.remove();
  sheet.querySelector('[data-close]').addEventListener('click', close);
  sheet.querySelector('[data-clear]').addEventListener('click', () => {
    draft.sections = [];
    draft.bands = [];
    sheet.querySelectorAll('input[type="checkbox"]').forEach((i) => (i.checked = false));
  });
  sheet.querySelector('[data-apply]').addEventListener('click', () => {
    state.sections = draft.sections;
    state.bands = draft.bands;
    close();
    paintShop(screen, catalog);
  });
}

// ── La ficha del producto ────────────────────────────────────────────────────

export async function renderShopProduct() {
  const screen = document.querySelector('[data-screen="shop-product"]');
  if (!screen) return;
  const slug = new URLSearchParams(window.location.hash.split('?')[1] || '').get('slug');
  screen.innerHTML = `<div class="screen-content">${spinner('Loading...')}</div>`;

  let catalog;
  try {
    catalog = await loadCatalog(getToken);
  } catch (e) {
    failed(screen, e);
    return;
  }
  const product = findProduct(catalog, slug);
  if (!product) {
    failed(screen, new Error('That product is no longer in the catalogue.'));
    return;
  }
  // Arranca elegida la variante mas barata, que es el precio que el cliente
  // vio en la tarjeta. Si arrancara sin elegir, el precio de la ficha no
  // coincidiria con el de la lista y parece un error.
  let sku = [...product.variants].sort((a, b) => a.price - b.price)[0].sku;
  let qty = 1;

  const paint = () => {
    const v = findVariant(product, sku);
    screen.innerHTML = `
      <div class="screen-header" style="display:flex;align-items:center;gap:6px;padding-left:4px">
        ${backBtn('Back to the shop')}
        <h1 class="screen-title" style="flex-grow:1;margin:0;font-size:15px">${esc(product.name)}</h1>
        ${cartBtn()}
      </div>
      <div class="screen-content">
        <div class="shop-hero">${product.img ? `<img src="${esc(product.img)}" alt="${esc(product.name)}">` : ''}</div>
        <div class="shop-brand" style="margin-top:16px">${esc(catalog.brand || 'LEBYCLE')}</div>
        <h2 class="shop-title">${esc(product.name)}</h2>
        <div style="display:flex;align-items:baseline;gap:9px;margin-top:7px">
          <span class="shop-price">${money(v.price)}</span>
          ${
            product.variants.length > 1
              ? `<span style="font-size:12.5px;color:var(--gray)">${product.variants.length} <span>sizes and fits</span></span>`
              : ''
          }
        </div>
        ${
          product.variants.length > 1
            ? `<div class="shop-group">Size and fit</div>
               <div class="shop-opts" data-shop-opts>
                 ${product.variants
                   .map(
                     (x) => `<button type="button" class="shop-opt" data-sku="${esc(x.sku)}" aria-pressed="${x.sku === sku}">
                       <span>${esc(x.label)}</span>
                       ${x.price !== v.price ? `<span class="shop-opt__hint">${money(x.price)}</span>` : ''}
                     </button>`
                   )
                   .join('')}
               </div>`
            : ''
        }
        <div class="shop-group">Code</div>
        <div style="font-size:14px;color:var(--navy);font-weight:600">${esc(v.sku)}</div>
        <div class="shop-note" style="margin-top:18px">Not sure which one fits? Send us a photo on WhatsApp and we will tell you &mdash; 0433 963 250.</div>
      </div>
      <div class="shop-buy">
        <div class="shop-qty">
          <button type="button" data-qty="-1" aria-label="One less">&minus;</button>
          <span class="shop-qty__n" data-qty-n>${qty}</span>
          <button type="button" data-qty="1" aria-label="One more">+</button>
        </div>
        <button type="button" class="shop-add" data-shop-add><span>Add to cart</span><span> &middot; ${money(v.price * qty)}</span></button>
      </div>`;

    screen.querySelectorAll('[data-sku]').forEach((b) =>
      b.addEventListener('click', () => {
        sku = b.dataset.sku;
        paint();
      })
    );
    screen.querySelectorAll('[data-qty]').forEach((b) =>
      b.addEventListener('click', () => {
        qty = Math.max(1, Math.min(20, qty + Number(b.dataset.qty)));
        paint();
      })
    );
    screen.querySelector('[data-shop-add]')?.addEventListener('click', (ev) => {
      addToCart(sku, qty);
      const btn = ev.currentTarget;
      btn.textContent = 'Added';
      btn.disabled = true;
      // Se vuelve a dibujar para que el contador del carrito suba a la vista.
      setTimeout(() => {
        qty = 1;
        paint();
      }, 900);
    });
  };
  paint();
}

// ── El carrito ───────────────────────────────────────────────────────────────

export async function renderCart() {
  const screen = document.querySelector('[data-screen="cart"]');
  if (!screen) return;
  screen.innerHTML = `<div class="screen-content">${spinner('Loading...')}</div>`;

  let catalog;
  try {
    catalog = await loadCatalog(getToken);
  } catch (e) {
    failed(screen, e);
    return;
  }

  const paint = () => {
    const { items, subtotal, hasGone } = priceCart(catalog, getCart());
    screen.innerHTML = `
      <div class="screen-header" style="display:flex;align-items:center;gap:6px;padding-left:4px">
        ${backBtn('Back to the shop')}
        <h1 class="screen-title" style="flex-grow:1;margin:0">Cart</h1>
      </div>
      <div class="screen-content">
        ${
          items.length
            ? items
                .map(
                  (i) => `<div class="shop-line${i.gone ? ' shop-line--gone' : ''}">
                  <div class="shop-line__shot">${i.img ? `<img src="${esc(i.img)}" alt="">` : ''}</div>
                  <div style="flex-grow:1;min-width:0">
                    <div class="shop-line__name">${esc(i.name)}</div>
                    <div class="shop-line__variant">${i.gone ? 'No longer available' : esc(i.variant)}</div>
                    <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
                      <div class="shop-qty" style="height:38px">
                        <button type="button" data-line="${esc(i.sku)}" data-d="-1" aria-label="One less">&minus;</button>
                        <span class="shop-qty__n">${i.qty}</span>
                        <button type="button" data-line="${esc(i.sku)}" data-d="1" aria-label="One more">+</button>
                      </div>
                      <button type="button" data-drop="${esc(i.sku)}" style="border:none;background:none;color:var(--red);font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;min-height:38px">Remove</button>
                    </div>
                  </div>
                  <div class="shop-line__price">${money(i.total)}</div>
                </div>`
                )
                .join('') +
              `<div class="shop-total">
                 <span class="shop-total__label">Subtotal</span>
                 <span class="shop-total__value">${money(subtotal)}</span>
               </div>
               <div class="shop-note">Delivery is worked out at checkout. [CONFIRMAR PLAZO DE ENTREGA]</div>
               ${hasGone ? `<div class="shop-note" style="color:var(--red)">One of these is no longer in the catalogue. Remove it to keep going.</div>` : ''}`
            : `<div class="shop-empty">
                 <div class="shop-empty__icon">&#128722;</div>
                 <div class="shop-empty__title">Your cart is empty</div>
                 <div class="shop-empty__sub">Parts you add show up here.</div>
                 <a href="#shop" class="btn btn-primary" style="margin-top:16px;display:inline-flex">Go to the shop</a>
               </div>`
        }
      </div>
      ${
        items.length
          ? `<div class="shop-buy">
               <button type="button" class="shop-add" data-shop-checkout${hasGone ? ' disabled' : ''}><span>Checkout</span><span> &middot; ${money(subtotal)}</span></button>
             </div>`
          : ''
      }`;

    screen.querySelectorAll('[data-line]').forEach((b) =>
      b.addEventListener('click', () => {
        const cur = getCart().find((l) => l.sku === b.dataset.line);
        setQty(b.dataset.line, (cur?.qty || 0) + Number(b.dataset.d));
        paint();
      })
    );
    screen.querySelectorAll('[data-drop]').forEach((b) =>
      b.addEventListener('click', () => {
        removeFromCart(b.dataset.drop);
        paint();
      })
    );
    screen.querySelector('[data-shop-checkout]')?.addEventListener('click', () => {
      window.location.hash = 'shop-checkout';
    });
  };
  paint();
}

// ── La franja del inicio ─────────────────────────────────────────────────────

export async function mountShopBand() {
  const band = document.getElementById('shop-band');
  if (!band || band.dataset.done) return;
  let catalog;
  try {
    catalog = await loadCatalog(getToken);
  } catch {
    // En el inicio, una tienda que no carga simplemente no aparece. Avisar de
    // algo que el visitante no pidio seria peor que el silencio.
    return;
  }
  const picks = sortProducts(catalog.products, 'stocked').slice(0, 8);
  band.innerHTML = `
    <div class="lp-container">
      <div class="shop-band__head">
        <div>
          <span class="section-badge">PARTS SHOP</span>
          <h2 class="shop-band__title">LEBYCLE parts, delivered</h2>
          <div class="shop-band__sub">The same parts we fit, at the door. Tracked delivery across Australia.</div>
        </div>
        <a href="#shop" class="shop-band__all">Shop all <span aria-hidden="true">&rarr;</span></a>
      </div>
      <div class="shop-band__rail">${picks.map(card).join('')}</div>
    </div>`;
  band.dataset.done = '1';
  band.hidden = false;
}

// Un solo oyente para toda la tienda. Delegado, porque las pantallas se
// vuelven a dibujar enteras y los oyentes puestos a mano se perderian.
document.addEventListener('click', (ev) => {
  const back = ev.target.closest('[data-shop-back]');
  if (back) {
    ev.preventDefault();
    window.history.length > 1 ? window.history.back() : (window.location.hash = 'shop');
    return;
  }
  const cart = ev.target.closest('[data-shop-cart]');
  if (cart) {
    ev.preventDefault();
    window.location.hash = 'cart';
    return;
  }
  const retry = ev.target.closest('[data-shop-retry]');
  if (retry) {
    ev.preventDefault();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
});
