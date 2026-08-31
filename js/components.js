// Dr. Bike Sydney — Reusable UI components
// All components return HTML strings; inject with innerHTML or insertAdjacentHTML.
// Colors reference CSS variables from variables.css — no hardcoded values.

import { translateValue } from './i18n.js';
import { toDisplayTime } from './time-format.js';

// ── Header ────────────────────────────────────────────────────────────────────
export function createHeader(title, showBack = false, backUrl = '#home') {
  return `
<header class="app-header">
  ${
    showBack
      ? `
  <a href="${backUrl}" class="header-back" aria-label="Back">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  </a>`
      : '<div class="header-spacer"></div>'
  }
  <span class="header-title">${title}</span>
  <div class="header-spacer"></div>
</header>`;
}

// ── Bottom Navigation ─────────────────────────────────────────────────────────
export function createBottomNav(activeTab = 'home') {
  const tabs = [
    {
      id: 'home',
      label: 'Home',
      href: '#home',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    },
    {
      id: 'my-bookings',
      label: 'Bookings',
      href: '#my-bookings',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
    },
    {
      id: 'tracking',
      label: 'Track',
      href: '#tracking',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
    },
    {
      id: 'my-bikes',
      label: 'My Bikes',
      href: '#my-bikes',
      icon: `<span style="display:inline-block;width:25px;height:25px;background-color:currentColor;-webkit-mask:url('images/bike-icon.png') center/contain no-repeat;mask:url('images/bike-icon.png') center/contain no-repeat"></span>`,
    },
    {
      id: 'profile',
      label: 'Profile',
      href: '#profile',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
    },
  ];

  return `
<nav class="bottom-nav" role="navigation" aria-label="Main navigation">
  ${tabs
    .map(
      (t) => `
  <a href="${t.href}" class="bottom-nav__tab${t.id === activeTab ? ' active' : ''}" aria-label="${t.label}">
    ${t.icon}
    <span>${t.label}</span>
  </a>`
    )
    .join('')}
</nav>`;
}

// ── Button ────────────────────────────────────────────────────────────────────
export function createButton(text, variant = 'primary', fullWidth = false) {
  return `<button class="btn btn--${variant}${fullWidth ? ' btn--full' : ''}">${text}</button>`;
}

// ── Service Card ──────────────────────────────────────────────────────────────
export function formatServiceDuration(service) {
  if (!service) return '';
  if (service.duration) return service.duration;
  const fmt = (m) =>
    m < 60 ? m + ' min' : Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'min' : '');
  const { duration_min: min, duration_max: max } = service;
  if (!min && !max) return '';
  if (min && max && min !== max) return fmt(min) + ' - ' + fmt(max);
  return fmt(min || max);
}

export function createServiceCard(service) {
  const { id = '', name = '', description = '', price = 0 } = service;
  const duration = formatServiceDuration(service);
  // Emergency Service never reaches the booking wizard - the click handler in
  // js/app.js matches this same name and opens the contact modal instead. The
  // modifier is only a hook: css/landing.css tints the card there so it does
  // not read like the bookable ones. Unstyled (so unchanged) in the mobile SPA.
  const emergency = name === 'Emergency Service';
  return `
<div class="service-card${emergency ? ' service-card--emergency' : ''}" data-service-id="${id}" role="button" tabindex="0">
  <div class="service-card__body">
    <div class="service-card__name">${name}</div>
    ${description ? `<div class="service-card__desc">${description}</div>` : ''}
    ${duration ? `<div class="service-card__meta">${duration}</div>` : ''}
  </div>
  <div class="service-card__price">
    <span class="service-card__amount">${
      // Quoted services (Emergency Service) live in the table with price 0.
      // Showing "$0" reads as free; the card is a contact prompt instead.
      Number(price) > 0 ? `$${price}` : translateValue('Contact us')
    }</span>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
  </div>
</div>`;
}

// ── Time Slot ─────────────────────────────────────────────────────────────────
export function createTimeSlot(time, available = true, isSelected = false) {
  return `
<button class="time-slot${available ? '' : ' time-slot--unavailable'}${isSelected ? ' selected' : ''}" ${available ? '' : 'disabled aria-disabled="true"'} data-time="${time}" type="button">
  ${time}
</button>`;
}

// ── Date Item ─────────────────────────────────────────────────────────────────
export function createDateItem(dateStr, isSelected = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `
<button class="date-item${isSelected ? ' selected' : ''}" data-date="${dateStr}" type="button" aria-label="${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}">
  <span class="date-item__day">${DAY_NAMES[date.getDay()]}</span>
  <span class="date-item__num">${date.getDate()}</span>
  <span class="date-item__month">${MONTH_NAMES[date.getMonth()]}</span>
</button>`;
}

// ── Summary Row ───────────────────────────────────────────────────────────────
export function createSummaryRow(label, value) {
  return `
<div class="summary-row">
  <span class="summary-row__label">${label}</span>
  <span class="summary-row__value">${value}</span>
</div>`;
}

// ── Booking Card ─────────────────────────────────────────────────────────────
export function createBookingCard(booking) {
  const {
    id = '',
    service_name,
    scheduled_date,
    scheduled_time,
    service_price,
    status,
    rating,
  } = booking;
  const STATUS_MAP = {
    pending: { label: 'Pending', bg: '#D977061A', color: '#B45309', border: '#B45309' },
    confirmed: { label: 'Confirmed', bg: '#1E40AF1A', color: '#1E40AF', border: '#1E40AF' },
    enroute: { label: 'En Route', bg: '#16A34A1A', color: '#15803D', border: '#15803D' },
    en_route: { label: 'En Route', bg: '#16A34A1A', color: '#15803D', border: '#15803D' },
    in_progress: { label: 'In Progress', bg: '#16A34A1A', color: '#15803D', border: '#15803D' },
    inprogress: { label: 'In Progress', bg: '#16A34A1A', color: '#15803D', border: '#15803D' },
    arrived: { label: 'Arrived', bg: '#16A34A1A', color: '#15803D', border: '#15803D' },
    completed: { label: 'Completed', bg: '#64748B1A', color: '#64748B', border: '#64748B' },
    cancelled: { label: 'Cancelled', bg: '#DC26261A', color: '#CF2020', border: '#CF2020' },
  };
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  const MONTHS = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  let dateLabel = '--<br>---';
  if (scheduled_date) {
    const [, m, d] = scheduled_date.split('-').map(Number);
    dateLabel = `${d}<br>${MONTHS[m - 1]}`;
  }
  return `
<div class="booking-card" data-booking-id="${id}" style="border-left:4px solid ${s.border}">
  <div class="booking-card__date" style="font-size:18px;font-weight:800;color:var(--navy);text-align:center;line-height:1.1;flex-shrink:0;width:44px">${dateLabel}</div>
  <div class="booking-card__info">
    <div class="booking-card__service">${service_name || 'Service'}</div>
    <div style="font-size:12px;color:var(--gray);margin-top:2px">${toDisplayTime(scheduled_time)}</div>
    ${rating ? `<div class="booking-card__rating" style="margin-top:4px">${createStarRating(rating, false)}</div>` : ''}
  </div>
  <div class="booking-card__right">
    <span class="booking-chip" style="background:${s.bg};color:${s.color}">${s.label}</span>
    <span style="font-size:13px;color:var(--gray);font-weight:600">$${service_price || 0}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
  </div>
</div>`;
}

// ── Brand Loader ──────────────────────────────────────────────────────────────
// For screens that cannot paint anything until a network call answers. Those
// used to render an empty box, which on a slow connection is indistinguishable
// from a broken app - a client reported exactly that on 2026-07-27. Uses the
// DB mark (a real alpha channel, so the glow follows the letters rather than a
// rectangle) over a soft pulsing halo, with the tagline underneath. The
// animation lives in css/main.css and stops under prefers-reduced-motion.
export function createBrandLoader() {
  return `
<div class="brand-loader" role="status" aria-live="polite">
  <div class="brand-loader__mark">
    <img src="images/logo-db.png" alt="" width="88" height="62" fetchpriority="high">
  </div>
  <div class="brand-loader__tag">Healthy bikes, happy riders</div>
</div>`;
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function createEmptyState(iconHtml, title, subtitle = '') {
  return `
<div class="empty-state">
  <div class="empty-state__icon">${iconHtml}</div>
  <div class="empty-state__title">${title}</div>
  ${subtitle ? `<p class="empty-state__sub">${subtitle}</p>` : ''}
</div>`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
// ── Screen reader announcements ──────────────────────────────────────────────
// Audit point 15: the app had two aria-live regions, both loading spinners. An
// error, a step change, or the mechanic moving on the map was announced to
// nobody.
//
// Two PERSISTENT regions, created once and written into, rather than inserting
// a new element that carries role="alert". Screen readers announce a live
// region when its CONTENT changes; an element that arrives already holding its
// text is announced inconsistently, and not at all in some combinations. This
// is the shape that works everywhere.
//
// polite   - waits for a pause. Status, step changes, the mechanic moving.
// assertive - interrupts. Errors only: a payment that failed cannot wait for
//             the reader to finish the sentence it is on.
let _liveRegions = null;
function liveRegions() {
  if (_liveRegions) return _liveRegions;
  const make = (mode) => {
    const el = document.createElement('div');
    el.className = 'sr-only';
    el.setAttribute('aria-live', mode);
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', mode === 'assertive' ? 'alert' : 'status');
    document.body.appendChild(el);
    return el;
  };
  _liveRegions = { polite: make('polite'), assertive: make('assertive') };
  return _liveRegions;
}

/**
 * Say something to a screen reader. Invisible to everyone else.
 *
 * Re-announcing the SAME string is a real case (two failed payments in a row),
 * and a live region whose text did not change says nothing. Clearing it first,
 * then setting on the next frame, makes the repeat land.
 */
export function announce(message, { assertive = false } = {}) {
  if (!message) return;
  const region = liveRegions()[assertive ? 'assertive' : 'polite'];
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = translateValue(message);
  });
}
export function showToast(message, type = 'success') {
  document.querySelector('.toast')?.remove();
  const toast = Object.assign(document.createElement('div'), {
    className: `toast toast--${type}`,
    textContent: translateValue(message),
  });
  // aria-hidden: the words are announced through the live region below, and
  // without this a screen reader reads the same message twice.
  toast.setAttribute('aria-hidden', 'true');
  document.body.appendChild(toast);
  // An error interrupts; a success waits its turn.
  announce(message, { assertive: type === 'error' });
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3000);
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
// Promise<boolean>. Replaces confirm(), which renders in the browser's own
// language regardless of setLang() - so "Delete this bike?" was translated but
// its OK/Cancel buttons were not, and on iOS the dialog announced the domain
// instead of the app.
// `prompt` turns this into a one-field dialog: it resolves to the trimmed
// value instead of `true`, and still resolves false on cancel, so callers that
// do not pass it are unaffected. Added rather than reaching for window.prompt(),
// which 12.18 removed from the app for the same reasons as confirm().
export function confirmDialog({
  title,
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  prompt = null,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
<div class="confirm-box" role="${prompt ? 'dialog' : 'alertdialog'}" aria-modal="true" aria-labelledby="confirm-title">
  <h2 class="confirm-box__title" id="confirm-title">${translateValue(title)}</h2>
  ${message ? `<p class="confirm-box__msg">${translateValue(message)}</p>` : ''}
  ${
    prompt
      ? `<input id="${prompt.id || 'confirm-prompt'}" type="${prompt.type || 'text'}"
                inputmode="${prompt.type === 'tel' ? 'tel' : 'text'}"
                placeholder="${translateValue(prompt.placeholder || '')}"
                aria-label="${translateValue(title)}"
                style="width:100%;min-height:44px;margin-top:14px;padding:11px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:var(--font-family);outline:none">`
      : ''
  }
  <div class="confirm-box__actions">
    <button type="button" class="confirm-box__btn confirm-box__btn--cancel" data-act="no">${translateValue(cancelLabel)}</button>
    <button type="button" class="confirm-box__btn confirm-box__btn--${destructive ? 'danger' : 'go'}" data-act="yes">${translateValue(confirmLabel)}</button>
  </div>
</div>`;

    const previouslyFocused = document.activeElement;
    const close = (answer) => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('confirm-overlay--closing');
      // Plain timeout, not transitionend: that event does not fire under
      // reduced motion, and an overlay left in the DOM keeps eating taps.
      setTimeout(() => overlay.remove(), 250);
      previouslyFocused?.focus?.();
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };

    overlay.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'yes' && prompt) {
        // An empty field is not an answer - keep the dialog open rather than
        // resolving with nothing and leaving the caller to guess.
        const v = overlay.querySelector('input')?.value.trim() || '';
        if (!v) return overlay.querySelector('input')?.focus();
        return close(v);
      }
      if (act) return close(act === 'yes');
      if (e.target === overlay) close(false); // tap outside = cancel, never confirm
    });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    (overlay.querySelector('input') || overlay.querySelector('[data-act="no"]')).focus();
  });
}

// ── Star Rating ───────────────────────────────────────────────────────────────
export function createStarRating(rating = 0, interactive = false) {
  const stars = Array.from({ length: 5 }, (_, i) => {
    const filled = i < rating;
    return interactive
      ? `<button class="star${filled ? ' star--filled' : ''}" data-value="${i + 1}" aria-label="${i + 1} star${i > 0 ? 's' : ''}">
           <svg width="28" height="28" viewBox="0 0 24 24" fill="${filled ? 'var(--color-warning)' : 'none'}" stroke="var(--color-warning)" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
         </button>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="${filled ? 'var(--color-warning)' : 'none'}" stroke="var(--color-warning)" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
  });

  return `<div class="star-rating${interactive ? ' star-rating--interactive' : ''}" role="${interactive ? 'group' : 'img'}" aria-label="${rating} out of 5 stars">${stars.join('')}</div>`;
}

// ── Rider Tier Badge ──────────────────────────────────────────────────────────
// size: 'sm' = icon only (nav, 18px) | 'lg' = icon + label (Profile card, 40px)
export function createTierBadge(riderTier, size = 'sm') {
  const { label, image, iconType, color } = riderTier;
  const px = size === 'lg' ? 40 : 18;
  const iconHTML =
    iconType === 'mask'
      ? `<span style="display:inline-block;width:${px}px;height:${Math.round(px * 0.7)}px;background-color:${color};-webkit-mask:url('${image}') center/contain no-repeat;mask:url('${image}') center/contain no-repeat;flex-shrink:0"></span>`
      : `<img src="${image}" alt="" width="${px}" height="${px}" style="width:${px}px;height:${px}px;object-fit:contain;flex-shrink:0">`;

  if (size === 'sm') {
    return `<span class="tier-badge tier-badge--sm">${iconHTML}</span>`;
  }

  return `
<span class="tier-badge tier-badge--lg" style="display:inline-flex;align-items:center;gap:10px">
  ${iconHTML}
  <span class="tier-badge__label" style="font-size:14px;font-weight:700;color:var(--navy)">${label}</span>
</span>`;
}

// ── Celebration sheet ─────────────────────────────────────────────────────────
// A card that folds down from the top of a darkened, blurred page. For the
// handful of moments that deserve one - a birthday, a review just left - rather
// than the strip at the bottom of the screen a toast gives them.
//
// Diego on the review thank-you, which was a toast: "no me gusta tanto. debe
// estar mas arriba. que aparezca con fondo medio oscuro con opacidad en 3d mas
// de lujo mas bonito... y que el cliente pueda hacer click en cualquier parte
// fuera del cuadro para se cierre".
//
// Extracted from the birthday greeting rather than copied: a second modal under
// a second name is how a product ends up with four of them. Dismissed by the
// close button, by the backdrop, or by Escape - never by a click inside the
// card, which would fire the moment someone tried to select the text.
export function showCelebration({ emoji, title, message, onClose } = {}) {
  document.getElementById('celebrate-scrim')?.remove();

  const scrim = document.createElement('div');
  scrim.id = 'celebrate-scrim';
  scrim.className = 'celebrate-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-labelledby', 'celebrate-title');
  const esc = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  scrim.innerHTML = `
    <div class="celebrate-card">
      <button class="celebrate-close" id="celebrate-close" aria-label="${esc(translateValue('Close'))}">&times;</button>
      <span class="celebrate-card__emoji" aria-hidden="true">${esc(emoji || '')}</span>
      <h2 class="celebrate-card__title" id="celebrate-title">${esc(title || '')}</h2>
      <p class="celebrate-card__msg">${esc(message || '')}</p>
    </div>`;
  document.body.appendChild(scrim);

  const previouslyFocused = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return; // backdrop click and Escape can both land
    closed = true;
    // is-closing rather than just dropping is-open: the exit is its own
    // animation (lifts away and shrinks), not the entrance played backwards.
    scrim.classList.remove('is-open');
    scrim.classList.add('is-closing');
    document.removeEventListener('keydown', onKey);
    // Let the exit finish, but never leave it behind if the transition never
    // fires - a hidden tab does not run them.
    const drop = () => scrim.remove();
    scrim.addEventListener('transitionend', drop, { once: true });
    setTimeout(drop, 600);
    if (previouslyFocused?.focus) previouslyFocused.focus();
    try {
      onClose?.();
    } catch (e) {
      console.warn('[celebrate] onClose failed:', e.message);
    }
  };
  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  scrim.querySelector('#celebrate-close').addEventListener('click', close);
  // Only the backdrop itself - a click inside the card must not dismiss it.
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  document.addEventListener('keydown', onKey);

  // Two frames: the element has to be in the DOM and have had its start styles
  // applied before the class flips, or the browser skips straight to the end
  // state and there is no fold at all.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      scrim.classList.add('is-open');
      scrim.querySelector('#celebrate-close')?.focus();
    })
  );

  return close;
}
