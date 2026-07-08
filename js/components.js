// Dr. Bike Sydney — Reusable UI components
// All components return HTML strings; inject with innerHTML or insertAdjacentHTML.
// Colors reference CSS variables from variables.css — no hardcoded values.

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
      icon: `<span style="display:inline-block;width:28px;height:28px;background-color:currentColor;-webkit-mask:url('images/bike-icon.png') center/contain no-repeat;mask:url('images/bike-icon.png') center/contain no-repeat"></span>`,
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
  return `
<div class="service-card" data-service-id="${id}" role="button" tabindex="0">
  <div class="service-card__body">
    <div class="service-card__name">${name}</div>
    ${description ? `<div class="service-card__desc">${description}</div>` : ''}
    ${duration ? `<div class="service-card__meta">${duration}</div>` : ''}
  </div>
  <div class="service-card__price">
    <span class="service-card__amount">$${price}</span>
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
    pending: { label: 'Pending', bg: '#D977061A', color: '#D97706', border: '#D97706' },
    confirmed: { label: 'Confirmed', bg: '#1E40AF1A', color: '#1E40AF', border: '#1E40AF' },
    enroute: { label: 'En Route', bg: '#16A34A1A', color: '#16A34A', border: '#16A34A' },
    en_route: { label: 'En Route', bg: '#16A34A1A', color: '#16A34A', border: '#16A34A' },
    in_progress: { label: 'In Progress', bg: '#16A34A1A', color: '#16A34A', border: '#16A34A' },
    inprogress: { label: 'In Progress', bg: '#16A34A1A', color: '#16A34A', border: '#16A34A' },
    arrived: { label: 'Arrived', bg: '#16A34A1A', color: '#16A34A', border: '#16A34A' },
    completed: { label: 'Completed', bg: '#64748B1A', color: '#64748B', border: '#64748B' },
    cancelled: { label: 'Cancelled', bg: '#DC26261A', color: '#DC2626', border: '#DC2626' },
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
  <div class="booking-card__date" style="font-size:18px;font-weight:800;color:#0F172A;text-align:center;line-height:1.1;flex-shrink:0;width:44px">${dateLabel}</div>
  <div class="booking-card__info">
    <div class="booking-card__service">${service_name || 'Service'}</div>
    <div style="font-size:12px;color:#475569;margin-top:2px">${scheduled_time || ''}</div>
    ${rating ? `<div class="booking-card__rating" style="margin-top:4px">${createStarRating(rating, false)}</div>` : ''}
  </div>
  <div class="booking-card__right">
    <span class="booking-chip" style="background:${s.bg};color:${s.color}">${s.label}</span>
    <span style="font-size:13px;color:#475569;font-weight:600">$${service_price || 0}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
  </div>
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
export function showToast(message, type = 'success') {
  document.querySelector('.toast')?.remove();
  const toast = Object.assign(document.createElement('div'), {
    className: `toast toast--${type}`,
    textContent: message,
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3000);
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

// ── Component System v2 ─────────────────────────────────────────────────────

// B) Service Card Premium (icon + name + price + desc + CTA)
export function createServiceCardV2({ iconSvg, name, price, description, duration, dataId, onClick }) {
  return `
<div class="dbs-card-service" data-service-id="${dataId || ''}" role="button" tabindex="0" style="cursor:pointer">
  ${iconSvg ? `<div class="dbs-card-service__icon">${iconSvg}</div>` : ''}
  <div class="dbs-card-service__body">
    <div class="dbs-card-service__name">${name || ''}</div>
    ${description ? `<div class="dbs-card-service__desc">${description}</div>` : ''}
    ${duration ? `<div class="dbs-card-service__meta">${duration}</div>` : ''}
  </div>
  <div class="dbs-card-service__price">$${price || 0}</div>
  <button class="dbs-card-service__cta" onclick="event.stopPropagation()">Book now</button>
</div>`;
}

// D) Progress Bar
export function createProgressBar({ progress = 0, label = '', variant = 'primary' }) {
  return `
<div class="dbs-progress dbs-progress--${variant}">
  <div class="dbs-progress__track">
    <div class="dbs-progress__fill" style="width:${Math.min(100, Math.max(0, progress))}%"></div>
  </div>
  ${label ? `<div class="dbs-progress__label">${label}</div>` : ''}
</div>`;
}

// E) Status Badge
export function createStatusBadge(status) {
  const map = {
    pending:     { cls: 'pending',     label: 'Pending' },
    confirmed:   { cls: 'confirmed',   label: 'Confirmed' },
    enroute:     { cls: 'enroute',     label: 'En Route' },
    en_route:    { cls: 'enroute',     label: 'En Route' },
    in_progress: { cls: 'inprogress',  label: 'In Progress' },
    inprogress:  { cls: 'inprogress',  label: 'In Progress' },
    arrived:     { cls: 'inprogress',  label: 'Arrived' },
    completed:   { cls: 'completed',   label: 'Completed' },
    cancelled:   { cls: 'cancelled',   label: 'Cancelled' },
  };
  const s = map[status] || map.pending;
  return `<span class="dbs-badge dbs-badge--${s.cls}"><span class="dbs-badge__dot"></span>${s.label}</span>`;
}

// E2) Status Progress Steps (Confirmed → En Route → Arrived → Done)
export function createStatusSteps(currentStatus, steps = ['Confirmed','En Route','Arrived','Done']) {
  const order = ['confirmed','confirmed','enroute','enroute','inprogress','inprogress','arrived','arrived','completed','completed'];
  const currentIdx = order.indexOf(currentStatus);
  return `
<div class="dbs-status-progress">
  ${steps.map((label, i) => {
    let cls = '';
    if (i <= Math.floor(currentIdx / 2)) cls = 'done';
    else if (i === Math.floor(currentIdx / 2) + 1 && currentIdx >= 0) cls = 'active';
    return `<div class="dbs-status-step${cls ? ' ' + cls : ''}">${label}</div>`;
  }).join('')}
</div>`;
}

// F) Empty State
export function createEmptyStateV2({ iconSvg, title, subtitle, actionLabel, actionHref }) {
  return `
<div class="dbs-empty-state">
  ${iconSvg ? `<div class="dbs-empty-state__icon">${iconSvg}</div>` : ''}
  <div class="dbs-empty-state__title">${title || ''}</div>
  ${subtitle ? `<div class="dbs-empty-state__sub">${subtitle}</div>` : ''}
  ${actionLabel ? `<a href="${actionHref || '#'}" class="dbs-card-service__cta">${actionLabel} →</a>` : ''}
</div>`;
}

// KPI Card (Admin / Mechanic dashboard)
export function createKpiCard({ value, label, trend, variant = '' }) {
  return `
<div class="dbs-kpi-card${variant ? ' dbs-kpi-card--' + variant : ''}">
  <div class="dbs-kpi-card__value">${value || '—'}</div>
  <div class="dbs-kpi-card__label">${label || ''}</div>
  ${trend ? `<div class="dbs-kpi-card__trend dbs-kpi-card__trend--${trend.dir || 'flat'}">${trend.text || ''}</div>` : ''}
</div>`;
}

// Bar Chart Item (horizontal, para ranking de servicios)
export function createBarItem({ label, count, maxCount, variant }) {
  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return `
<div class="dbs-bar-item">
  <div class="dbs-bar-item__label">${label || ''}</div>
  <div class="dbs-bar-item__track">
    <div class="dbs-bar-item__fill" style="width:${Math.max(2, pct)}%"></div>
  </div>
  <div class="dbs-bar-item__count">${count || 0}</div>
</div>`;
}

// Filter Chip
export function createChip({ label, active, dataCat }) {
  return `<button class="dbs-chip${active ? ' active' : ''}" data-cat="${dataCat || ''}">${label || ''}</button>`;
}

// Listing Card (bookings, jobs)
export function createListingCard({ title, subtitle, status, dataId, badgeHtml }) {
  return `
<div class="dbs-listing-card dbs-listing-card--${status || 'pending'}" data-id="${dataId || ''}" role="button" tabindex="0">
  <div class="dbs-listing-card__body">
    <div class="dbs-listing-card__title">${title || ''}</div>
    ${subtitle ? `<div class="dbs-listing-card__sub">${subtitle}</div>` : ''}
  </div>
  ${badgeHtml || ''}
  <div class="dbs-listing-card__chevron">›</div>
</div>`;
}
