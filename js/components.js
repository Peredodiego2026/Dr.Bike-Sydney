// Dr. Bike Sydney — Reusable UI components
// All components return HTML strings; inject with innerHTML or insertAdjacentHTML.
// Colors reference CSS variables from variables.css — no hardcoded values.

import { translateValue } from './i18n.js';

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
    textContent: translateValue(message),
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
  <span class="tier-badge__label" style="font-size:14px;font-weight:700;color:#0D1F3C">${label}</span>
</span>`;
}
