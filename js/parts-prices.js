// The parts price list, open to anyone - built once for both surfaces, like
// js/gift-card.js. Opened from the price notes on index.html and landing.html,
// from the booking summary, and from terms.html (/?view=parts-prices).
//
// Decided 25-oct-2026: shown BEFORE booking, not only after the visit is paid.
// A client who has to pay to find out what a tube costs reads it as a trap; a
// price they saw up front is the one they approve at the door. Only the final
// price ever reaches this file - api/auth.js `parts-prices` selects name,
// category and sell_price and nothing else.
import { translateValue, translateScreen } from './i18n.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

// $15, $12.50 - the same shape as the service prices next to the link.
export function formatPartPrice(n) {
  const v = Number(n) || 0;
  return '$' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

// Admin types categories freely ("brakes", "Brakes ", "BRAKES"); one heading
// each, in alphabetical order, parts alphabetical inside it.
export function groupParts(parts) {
  const groups = new Map();
  for (const p of parts) {
    const raw = String(p.category || 'General').trim() || 'General';
    const key = raw.toLowerCase();
    if (!groups.has(key))
      groups.set(key, { label: raw.charAt(0).toUpperCase() + raw.slice(1), parts: [] });
    groups.get(key).parts.push(p);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => ({ ...g, parts: g.parts.sort((x, y) => x.name.localeCompare(y.name)) }));
}

export function partsListHtml(parts, query = '') {
  const q = query.trim().toLowerCase();
  const shown = q ? parts.filter((p) => p.name.toLowerCase().includes(q)) : parts;
  if (!shown.length) return '';
  return groupParts(shown)
    .map(
      (g) => `
      <section style="margin-bottom:14px">
        <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--gray);margin:0 0 4px">${esc(g.label)}</h3>
        ${g.parts
          .map(
            (p) => `
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--border-lt)">
          <span style="font-size:14px;font-weight:600;color:var(--navy);line-height:1.35">${esc(p.name)}</span>
          <span style="font-size:15px;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums;flex-shrink:0">${esc(formatPartPrice(p.price))}</span>
        </div>`
          )
          .join('')}
      </section>`
    )
    .join('');
}

// Above this many parts a search box earns its place; below it, it is clutter.
const SEARCH_FROM = 10;

export async function openPartsPrices() {
  document.getElementById('parts-scrim')?.remove();
  const opener = document.activeElement;

  const scrim = document.createElement('div');
  scrim.id = 'parts-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-labelledby', 'parts-title');
  // A sheet from the bottom on a phone, a centred dialog on a wide screen.
  const wide = window.matchMedia('(min-width: 768px)').matches;
  scrim.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:${wide ? 'center' : 'flex-end'};justify-content:center;padding:${wide ? '24px' : '0'}`;
  scrim.innerHTML = `
    <div id="parts-sheet" style="background:var(--white);width:100%;max-width:480px;max-height:85vh;display:flex;flex-direction:column;border-radius:${wide ? '16px' : '16px 16px 0 0'};box-shadow:0 4px 24px rgba(0,0,0,0.12);padding-bottom:env(safe-area-inset-bottom,0px)">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:18px 16px 10px">
        <div style="flex:1">
          <h2 id="parts-title" style="font-size:16px;font-weight:700;color:var(--navy);margin:0 0 4px">Parts prices</h2>
          <p style="font-size:13px;color:var(--gray);margin:0;line-height:1.5">Final prices, fitted by your mechanic.</p>
        </div>
        <button type="button" id="parts-close" aria-label="Close" style="width:44px;height:44px;margin:-8px -8px 0 0;border:none;background:none;font-size:26px;line-height:1;color:var(--gray);cursor:pointer">&times;</button>
      </div>
      <div id="parts-search-wrap" hidden style="padding:0 16px 8px">
        <input id="parts-search" type="search" placeholder="Search parts" aria-label="Search parts" autocomplete="off" style="width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;font-size:15px;color:var(--navy);background:var(--white)">
      </div>
      <div id="parts-body" style="flex:1;overflow-y:auto;padding:4px 16px 8px;min-height:120px">
        <p id="parts-status" role="status" style="font-size:13px;color:var(--gray);margin:16px 0;line-height:1.5"></p>
        <div id="parts-list"></div>
      </div>
      <div style="padding:10px 16px 16px;border-top:1px solid var(--border)">
        <p style="font-size:12px;color:var(--gray);margin:0;line-height:1.55">Your mechanic shows you the part and its price before fitting it - nothing goes on without your OK.</p>
      </div>
    </div>`;
  document.body.appendChild(scrim);
  translateScreen(scrim); // outside [data-screen], not covered by the router's auto-translate observer

  const close = () => {
    scrim.remove();
    document.removeEventListener('keydown', onKey, true);
    if (opener && typeof opener.focus === 'function') opener.focus();
  };
  // Capture phase, and stopped there: on the landing this sheet opens over the
  // services modal, whose own Escape listener would otherwise close it too.
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    close();
  };
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  scrim.querySelector('#parts-close').addEventListener('click', close);
  scrim.querySelector('#parts-close').focus();

  const status = scrim.querySelector('#parts-status');
  const list = scrim.querySelector('#parts-list');
  const searchWrap = scrim.querySelector('#parts-search-wrap');
  const search = scrim.querySelector('#parts-search');

  let parts = [];
  const paint = () => {
    const html = partsListHtml(parts, search.value);
    list.innerHTML = html;
    translateScreen(list);
    status.hidden = !!html;
    if (!html) status.textContent = translateValue('No parts match your search.');
  };
  search.addEventListener('input', paint);

  const load = async () => {
    status.hidden = false;
    status.textContent = translateValue('Loading prices...');
    list.innerHTML = '';
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'parts-prices' }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(data)) throw new Error(data?.error || `HTTP ${r.status}`);
      parts = data.filter((p) => p && p.name && Number(p.price) > 0);
    } catch (e) {
      console.error('[parts-prices] load failed:', e.message);
      status.textContent = translateValue(
        'The price list could not be loaded right now. Your mechanic will still show you every price before fitting anything.'
      );
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn--secondary';
      retry.style.cssText = 'display:block;margin-top:12px;min-height:44px';
      retry.textContent = translateValue('Try again');
      retry.addEventListener('click', load);
      status.appendChild(retry);
      return;
    }
    if (!parts.length) {
      status.textContent = translateValue(
        'Parts are quoted on the spot - your mechanic tells you the price before fitting anything.'
      );
      return;
    }
    searchWrap.hidden = parts.length < SEARCH_FROM;
    paint();
  };
  load();
}
