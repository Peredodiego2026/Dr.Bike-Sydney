// ── Surge & Early Bird Pricing ─────────────────────────────────────────────
const AU_PUBLIC_HOLIDAYS_2026 = [
  '2026-01-01',
  '2026-01-26',
  '2026-04-03',
  '2026-04-04',
  '2026-04-05',
  '2026-04-06',
  '2026-04-25',
  '2026-06-08',
  '2026-08-03',
  '2026-10-05',
  '2026-12-25',
  '2026-12-26',
  '2026-12-28',
];

function getSurcharge(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  if (!dateStr) return { surge: 0, earlyBird: 0, label: '' };
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun,6=Sat
  const isWeekend = day === 0 || day === 6;
  const isHoliday = AU_PUBLIC_HOLIDAYS_2026.includes(dateStr);
  const surge = isWeekend || isHoliday ? 15 : 0;
  // Early bird: booking made 48h+ before scheduled date
  const now = new Date();
  const scheduled = new Date(dateStr + 'T08:00:00');
  const hoursAhead = (scheduled - now) / 36e5;
  const earlyBird = hoursAhead >= 48 ? -10 : 0;
  const labels = [];
  if (isHoliday) labels.push('Public holiday surcharge +$15');
  else if (isWeekend) labels.push('Weekend surcharge +$15');
  if (earlyBird) labels.push('Early bird discount -$10');
  return { surge, earlyBird, label: labels.join(' · ') };
}

function applyPricingAdjustments(basePrice, dateStr) {
  const { surge, earlyBird, label } = getSurcharge(dateStr);
  return { total: basePrice + surge + earlyBird, surge, earlyBird, label };
}
// ───────────────────────────────────────────────────────────────────────────

import router from './router.js';
import {
  sb,
  getServices,
  getAvailableSlots,
  createBooking,
  getCalloutFee,
  subscribeToMechanicLocation,
  submitReview,
  signIn,
  signUp,
  getMyBookings,
} from './supabase.js';
import {
  createHeader,
  createBottomNav,
  createServiceCard,
  formatServiceDuration,
  createTimeSlot,
  createDateItem,
  createSummaryRow,
  createBookingCard,
  createEmptyState,
  showToast,
} from './components.js';
import { getRiderTier } from './rider-tier.js';
import { getLang, setLang, translateScreen, LANGUAGES } from './i18n.js';
import {
  createPaymentForm,
  createPaymentRequestButton,
  processPayment,
  destroyPaymentForm,
  createCheckoutSession,
  verifyCheckoutSession,
} from './stripe.js';

window.appState = {
  service: null,
  date: null,
  time: null,
  location: 'Home',
  bookingId: null,
  bikeId: null,
  trackingToken: null,
};

const CHECKOUT_DRAFT_KEY = 'dbs_checkout_draft';

// Capture ?ref=CODE from URL and store for after login
(function captureReferralCode() {
  const p = new URLSearchParams(window.location.search);
  const ref = p.get('ref');
  if (ref) {
    localStorage.setItem('dbs_pending_ref', ref.trim().toUpperCase());
    history.replaceState({}, '', window.location.pathname);
  }
})();

// Handle return from Stripe Checkout (Apple Pay / Google Pay / card via hosted page)
(function handleCheckoutReturn() {
  const p = new URLSearchParams(window.location.search);
  const sessionId = p.get('session_id');

  if (p.get('payment') === 'success' && sessionId) {
    history.replaceState({}, '', '/');
    document.addEventListener(
      'routerinit',
      async () => {
        const draftRaw = sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
        sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
        try {
          if (!draftRaw) throw new Error('Booking details missing');
          const draft = JSON.parse(draftRaw);
          const {
            data: { session },
          } = await sb.auth.getSession();
          if (!session?.user) throw new Error('Please sign in to complete your booking.');
          // Server verifies the Stripe checkout, looks up the price, and inserts the booking.
          const resp = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'create-booking',
              access_token: session.access_token,
              service_name: draft.serviceName,
              scheduled_date: draft.date,
              scheduled_time: draft.time,
              address: draft.location || 'Home',
              checkout_session_id: sessionId,
              discount_code: draft.discountCode || null,
              utm_source: sessionStorage.getItem('utm_source') || null,
              utm_medium: sessionStorage.getItem('utm_medium') || null,
              utm_campaign: sessionStorage.getItem('utm_campaign') || null,
            }),
          });
          const d = await resp.json();
          if (!resp.ok) throw new Error(d.error || 'Payment could not be confirmed');
          window.appState.bookingId = d.id;
          if (window.gtag)
            gtag('event', 'purchase', {
              transaction_id: d.id,
              value: draft.calloutFee,
              currency: 'AUD',
              items: [{ item_name: draft.serviceName }],
            });
          if (window.posthog)
            posthog.capture('booking_completed', {
              value: draft.calloutFee,
              currency: 'AUD',
              service: draft.serviceName,
            });
          router.navigate('tracking');
        } catch (e) {
          showToast(
            e.message || 'Payment could not be confirmed. Please contact us if you were charged.'
          );
          router.navigate('book-service');
        }
      },
      { once: true }
    );
  }
  if (p.get('payment') === 'cancelled') {
    sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
    history.replaceState({}, '', '/');
  }
  // Handle review link from SMS/email: /?review=bookingId
  const reviewId = p.get('review');
  if (reviewId) {
    history.replaceState({}, '', '/');
    window.appState.bookingId = reviewId;
    window._pendingReview = reviewId;
  }
})();

let _trackingMap = null;
let _mechanicMarker = null;
let _unsubTracking = null;
let _trackingMechId = null;
let _loginMode = 'signin';
let _bookingsTab = 'upcoming';

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateDates(count = 7) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function bookingRef(id) {
  if (!id) return '#DBS-XXXX';
  return `#DBS-${String(id).replace(/-/g, '').substring(0, 6).toUpperCase()}`;
}

function updateContinueBtn(screen) {
  const btn = screen.querySelector('#continue-btn');
  if (btn)
    btn.disabled = !(window.appState.service && window.appState.date && window.appState.time);
}

async function loadTimeSlots(screen, date, serviceId) {
  const grid = screen.querySelector('#time-grid');
  if (!grid) return;
  grid.innerHTML =
    '<div class="skeleton" style="height:44px;grid-column:1/-1"></div>' +
    '<div class="skeleton" style="height:44px;grid-column:1/-1"></div>';
  const slots = await getAvailableSlots(date, serviceId);
  const allBooked = slots.length > 0 && slots.every((s) => !s.available);
  if (allBooked) {
    grid.innerHTML =
      '<div style="grid-column:1/-1;padding:20px 0">' +
      '<div style="text-align:center;margin-bottom:16px">' +
      '<div style="font-size:24px;margin-bottom:6px">😔</div>' +
      '<div style="font-weight:700;color:#111827;font-size:15px;margin-bottom:4px">Fully booked on this date</div>' +
      '<div style="font-size:13px;color:#6B7280">Please choose another day or join the waitlist</div></div>' +
      '<button id="waitlist-btn" style="width:100%;padding:13px;background:#2563EB;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">' +
      'Join Waitlist for ' +
      date +
      '</button>' +
      '<div id="waitlist-form" style="display:none;margin-top:14px;background:#F8FAFF;border:1px solid #DBEAFE;border-radius:10px;padding:16px">' +
      '<div style="font-weight:700;color:#0D1F3C;font-size:14px;margin-bottom:10px">Which times work for you?</div>' +
      '<div id="waitlist-times" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">' +
      slots
        .map(
          (s) =>
            '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer">' +
            '<input type="checkbox" value="' +
            s.time +
            '" style="accent-color:#2563EB"> ' +
            s.time +
            '</label>'
        )
        .join('') +
      '</div>' +
      '<div id="waitlist-msg" style="font-size:12px;color:#DC2626;margin-bottom:10px;display:none"></div>' +
      '<button id="waitlist-submit" style="width:100%;padding:12px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Notify Me When a Slot Opens</button>' +
      '</div></div>';

    screen.querySelector('#waitlist-btn').addEventListener('click', () => {
      const form = screen.querySelector('#waitlist-form');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

    screen.querySelector('#waitlist-submit').addEventListener('click', async () => {
      const btn = screen.querySelector('#waitlist-submit');
      const msg = screen.querySelector('#waitlist-msg');
      const times = [...screen.querySelectorAll('#waitlist-times input:checked')].map(
        (i) => i.value
      );
      if (!times.length) {
        msg.textContent = 'Please select at least one time slot.';
        msg.style.display = 'block';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Joining...';
      msg.style.display = 'none';
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!session) throw new Error('Please sign in first to join the waitlist.');
        const user = session.user;
        const resp = await fetch('/api/auth?role=join-waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: session.access_token,
            client_id: user.id,
            email: user.email,
            name: user.user_metadata?.full_name || user.user_metadata?.name || '',
            date,
            preferred_times: times,
            service_name: window.appState?.service?.name || '',
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to join waitlist');
        screen.querySelector('#waitlist-form').innerHTML =
          '<div style="text-align:center;padding:8px 0">' +
          '<div style="font-size:22px;margin-bottom:8px">✅</div>' +
          '<div style="font-weight:700;color:#059669;font-size:14px">You\'re on the waitlist!</div>' +
          '<div style="font-size:13px;color:#6B7280;margin-top:4px">We\'ll email ' +
          user.email +
          ' if a slot opens up on ' +
          date +
          '.</div>' +
          '</div>';
      } catch (e) {
        msg.textContent = e.message;
        msg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Notify Me When a Slot Opens';
      }
    });
    return;
  }
  grid.innerHTML = slots.map((s) => createTimeSlot(s.time, s.available, false)).join('');
  grid.querySelectorAll('.time-slot:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.time-slot').forEach((s) => s.classList.remove('selected'));
      btn.classList.add('selected');
      window.appState.time = btn.dataset.time;
      updateContinueBtn(screen);
    });
  });
}

function cleanupTracking() {
  if (_unsubTracking) {
    _unsubTracking();
    _unsubTracking = null;
  }
  if (_trackingMap) {
    _trackingMap.remove();
    _trackingMap = null;
    _mechanicMarker = null;
  }
  _trackingMechId = null;
}

async function loadLeaflet() {
  if (window.L) return;
  await new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = Object.assign(document.createElement('link'), {
        id: 'leaflet-css',
        rel: 'stylesheet',
        href: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css',
      });
      document.head.appendChild(link);
    }
    if (document.querySelector('script[src*="leaflet"]')) {
      resolve();
      return;
    }
    const s = Object.assign(document.createElement('script'), {
      src: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
    });
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Book a Service (3-step wizard) ───────────────────────────────────────────
async function renderBookService() {
  const screen = document.querySelector('[data-screen="book-service"]');
  if (!screen) return;
  if (window.gtag) gtag('event', 'begin_checkout');
  if (window.fbq) fbq('track', 'InitiateCheckout');
  if (!window.appState.location) window.appState.location = 'Home';
  window.appState.bikeId = null;

  let _services = null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let _calYear = today.getFullYear();
  let _calMonth = today.getMonth();

  const CAT_ORDER = [
    'Scheduled services',
    'Brakes',
    'Cockpit & levers',
    'Drivetrain',
    'Gears & cables',
    'Wheels & tyres',
    'Electronic & e-bike',
    'Suspension',
    'General & assembly',
  ];
  const CAT_ICON = {
    'Scheduled services': '🔧',
    Brakes: '🛑',
    'Cockpit & levers': '🎛️',
    Drivetrain: '⚙️',
    'Gears & cables': '🔩',
    'Wheels & tyres': '🔄',
    'Electronic & e-bike': '⚡',
    Suspension: '🏔️',
    'General & assembly': '🔨',
  };

  // ── Step 1: Choose Service ────────────────────────────────────────────────
  function renderStep1() {
    if (window.posthog) posthog.capture('booking_step_viewed', { step: 'select_service' });
    const groups = {};
    CAT_ORDER.forEach((c) => {
      groups[c] = [];
    });
    (_services || []).forEach((s) => {
      const c = s.category || 'General & assembly';
      if (!groups[c]) groups[c] = [];
      groups[c].push(s);
    });

    const categoriesHtml = _services
      ? CAT_ORDER.filter((cat) => groups[cat].length > 0)
          .map(
            (cat) => `
          <div class="category-section">
            <div class="category-header" data-cat="${cat}"><span aria-hidden="true">${CAT_ICON[cat] || ''}</span> ${cat}</div>
            <div class="services-list">${groups[cat].map((s) => createServiceCard(s)).join('')}</div>
          </div>`
          )
          .join('')
      : '<div class="loading-row"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';

    if (!document.getElementById('chip-styles')) {
      const s = document.createElement('style');
      s.id = 'chip-styles';
      s.textContent = `.cat-chip:hover{background:#1E40AF!important;color:#fff!important;border-color:#1E40AF!important}.cat-chip.active{background:#1E40AF!important;color:#fff!important;border-color:#1E40AF!important}`;
      document.head.appendChild(s);
    }
    const CAT_SHORT = {
      'Scheduled services': 'Scheduled',
      Brakes: 'Brakes',
      'Cockpit & levers': 'Cockpit',
      Drivetrain: 'Drivetrain',
      'Gears & cables': 'Gears',
      'Wheels & tyres': 'Wheels',
      'Electronic & e-bike': 'E-Bike',
      Suspension: 'Suspension',
      'General & assembly': 'General',
    };

    screen.innerHTML = `
      ${createHeader('Book a Service', true, '#home')}
      <div id="diag-block" style="background:#EFF6FF;border-radius:12px;padding:16px;margin:0 0 20px;border:1px solid #BFDBFE">
        <div style="font-size:13px;font-weight:700;color:#1E40AF;margin-bottom:6px">Not sure what your bike needs?</div>
        <div style="font-size:12px;color:#475569;margin-bottom:12px">Take a photo or describe the problem — our AI will recommend the right service.</div>
        <div style="display:flex;align-items:center;gap:8px;width:100%">
          <label style="flex-shrink:0;cursor:pointer">
            <input type="file" accept="image/*" capture="environment" id="diag-photo" style="display:none">
            <div id="diag-photo-btn" style="height:44px;display:inline-flex;align-items:center;gap:6px;background:white;border:1.5px solid #BFDBFE;border-radius:8px;padding:0 12px;font-size:13px;font-weight:600;color:#1E40AF;cursor:pointer;white-space:nowrap">Photo</div>
          </label>
          <input type="text" id="diag-text" placeholder="Describe the problem..." style="flex:1;min-width:0;height:44px;border:1.5px solid #BFDBFE;border-radius:8px;padding:0 12px;font-size:16px;outline:none;box-sizing:border-box;font-family:inherit;background:#fff">
          <button id="diag-ask-btn" style="flex-shrink:0;height:44px;background:#1E40AF;color:white;border:none;border-radius:8px;padding:0 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Ask AI</button>
        </div>
        <div id="diag-result" style="margin-top:10px;display:none"></div>
      </div>
      <div id="cat-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding:4px 0">
        ${CAT_ORDER.map((cat) => `<button class="cat-chip" data-cat="${cat}" style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;height:32px;background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:0 14px;font-size:12px;font-weight:600;cursor:pointer;color:#475569;font-family:inherit;white-space:nowrap;transition:all 150ms ease"><span aria-hidden="true">${CAT_ICON[cat] || ''}</span>${CAT_SHORT[cat]}</button>`).join('')}
      </div>
      <div class="section-label">Select Service</div>
      <div id="step1-services">${categoriesHtml}</div>
      <div id="bike-selector-wrap"></div>
      <div class="sticky-bottom">
        <button class="btn btn--primary btn--full" id="s1-continue" disabled>Continue</button>
      </div>
      ${createBottomNav('home')}
    `;

    const diagPhoto = screen.querySelector('#diag-photo');
    diagPhoto.addEventListener('change', () => runAIDiagnosis(screen));
    screen
      .querySelector('#diag-ask-btn')
      .addEventListener('click', () => runAIDiagnosisText(screen));
    screen.querySelector('#diag-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runAIDiagnosisText(screen);
      }
    });

    const continueBtn = screen.querySelector('#s1-continue');

    if (window.appState.service) {
      const pre = screen.querySelector(`[data-service-id="${window.appState.service.id}"]`);
      if (pre) {
        pre.classList.add('selected');
        continueBtn.disabled = false;
      }
    }

    screen.querySelectorAll('.service-card').forEach((card) => {
      card.addEventListener('click', () => {
        screen.querySelectorAll('.service-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        const prev = window.appState.service;
        window.appState.service = (_services || []).find(
          (s) => String(s.id) === card.dataset.serviceId
        );
        if (!prev || prev.id !== window.appState.service?.id) {
          window.appState.date = null;
          window.appState.time = null;
        }
        if (window.gtag)
          gtag('event', 'add_to_cart', {
            currency: 'AUD',
            items: [
              { item_name: window.appState.service?.name, price: window.appState.service?.price },
            ],
          });
        continueBtn.disabled = false;
        renderStep2();
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') card.click();
      });
    });

    continueBtn.addEventListener('click', () => {
      if (window.appState.service) renderStep2();
    });

    screen.querySelectorAll('.cat-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const header = screen.querySelector(`.category-header[data-cat="${chip.dataset.cat}"]`);
        if (header) header.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Load user bikes async and render selector chips if any exist
    (async () => {
      const wrap = screen.querySelector('#bike-selector-wrap');
      if (!wrap) return;
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!session) return;
        const { data: bikes, error } = await sb
          .from('bikes')
          .select('id, name, brand, model')
          .eq('client_id', session.user.id)
          .order('created_at', { ascending: false });
        if (error || !bikes || bikes.length === 0) return;
        wrap.innerHTML = `
          <div class="section-label" style="margin-top:8px">Which bike?</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding:4px 0" id="bike-chips">
            <button class="bike-chip active" data-bike-id="" style="flex-shrink:0;display:inline-flex;align-items:center;height:32px;background:#1E40AF;color:#fff;border:1px solid #1E40AF;border-radius:16px;padding:0 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">Skip</button>
            ${bikes.map((b) => `<button class="bike-chip" data-bike-id="${b.id}" style="flex-shrink:0;display:inline-flex;align-items:center;height:32px;background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:0 14px;font-size:12px;font-weight:600;cursor:pointer;color:#475569;font-family:inherit;white-space:nowrap">${b.name}${b.brand ? ' · ' + b.brand : ''}</button>`).join('')}
          </div>`;
        wrap.querySelectorAll('.bike-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            wrap.querySelectorAll('.bike-chip').forEach((c) => {
              c.style.background = '#fff';
              c.style.color = '#475569';
              c.style.borderColor = '#E2E8F0';
            });
            chip.style.background = '#1E40AF';
            chip.style.color = '#fff';
            chip.style.borderColor = '#1E40AF';
            window.appState.bikeId = chip.dataset.bikeId || null;
          });
        });
      } catch {}
    })();
  }

  // ── Step 2: Date & Time ───────────────────────────────────────────────────
  async function renderStep2() {
    if (window.posthog) posthog.capture('booking_step_viewed', { step: 'select_date' });
    if (!document.getElementById('cal-styles')) {
      const s = document.createElement('style');
      s.id = 'cal-styles';
      s.textContent = `
        .cal-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .cal-month{font-weight:700;font-size:15px;color:var(--color-text)}
        .cal-arrow{background:#fff;border:1px solid #E2E8F0;border-radius:8px;width:36px;height:36px;cursor:pointer;font-size:20px;color:#0F172A;display:flex;align-items:center;justify-content:center;line-height:1;transition:background 150ms ease}
        .cal-arrow:hover:not(:disabled){background:#F8FAFC}
        .cal-arrow:disabled{opacity:0.3;cursor:default}
        .cal-month{font-weight:800;font-size:15px;color:#0F172A}
        .cal-dow{text-align:center;font-size:11px;font-weight:700;color:#94A3B8;padding:4px 0;text-transform:uppercase;letter-spacing:0.05em}
        .cal-day{background:none;border:none;border-radius:8px;padding:9px 2px;font-size:14px;cursor:pointer;color:#0F172A;text-align:center;width:100%;transition:background 120ms}
        .cal-day:hover:not(:disabled){background:#F1F5F9}
        .cal-day.cal-today{font-weight:800;color:#1E40AF}
        .cal-day.cal-sel{background:#1E40AF!important;color:#fff;font-weight:700;border-radius:8px}
        .cal-day.cal-dis,.cal-day:disabled{color:#94A3B8;opacity:0.4;cursor:default}
        .category-header{font-size:11px;font-weight:700;color:#94A3B8;padding:16px 0 8px;letter-spacing:0.08em;text-transform:uppercase}
        .category-section{margin-bottom:4px}
      `;
      document.head.appendChild(s);
    }

    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 90);
    const MONTH_NAMES = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    function buildCal() {
      const firstDow = new Date(_calYear, _calMonth, 1).getDay();
      const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
      const prevOk =
        new Date(_calYear, _calMonth - 1, 1) >= new Date(today.getFullYear(), today.getMonth(), 1);
      const nextOk =
        new Date(_calYear, _calMonth + 1, 1) <=
        new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
      let cells = '';
      for (let i = 0; i < firstDow; i++) cells += '<div></div>';
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${_calYear}-${String(_calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dt = new Date(_calYear, _calMonth, d);
        const disabled = dt < today || dt > maxDate;
        const isSel = ds === window.appState.date;
        const isToday = dt.getTime() === today.getTime();
        cells += `<button type="button" class="cal-day${isSel ? ' cal-sel' : ''}${isToday ? ' cal-today' : ''}${disabled ? ' cal-dis' : ''}" ${disabled ? 'disabled' : ''} data-date="${ds}">${d}</button>`;
      }
      return `
        <div class="cal-nav">
          <button type="button" id="cal-prev" class="cal-arrow" ${prevOk ? '' : 'disabled'}>&#8249;</button>
          <span class="cal-month"><span>${MONTH_NAMES[_calMonth]}</span> ${_calYear}</span>
          <button type="button" id="cal-next" class="cal-arrow" ${nextOk ? '' : 'disabled'}>&#8250;</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
          ${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
          ${cells}
        </div>`;
    }

    screen.innerHTML = `
      ${createHeader('Choose Date & Time', true, '#book-service')}
      <div class="section-label">Select Date</div>
      <div id="cal-wrap" style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-bottom:20px">${buildCal()}</div>
      <div class="section-label">Select Time</div>
      <div class="time-grid" id="time-grid">
        <div class="skeleton" style="height:44px;grid-column:1/-1"></div>
        <div class="skeleton" style="height:44px;grid-column:1/-1"></div>
      </div>
      <div class="sticky-bottom">
        <button class="btn btn--primary btn--full" id="continue-btn" disabled>Continue</button>
      </div>
      ${createBottomNav('home')}
    `;

    function wireCal() {
      const wrap = screen.querySelector('#cal-wrap');
      wrap.querySelector('#cal-prev')?.addEventListener('click', () => {
        _calMonth--;
        if (_calMonth < 0) {
          _calMonth = 11;
          _calYear--;
        }
        wrap.innerHTML = buildCal();
        wireCal();
      });
      wrap.querySelector('#cal-next')?.addEventListener('click', () => {
        _calMonth++;
        if (_calMonth > 11) {
          _calMonth = 0;
          _calYear++;
        }
        wrap.innerHTML = buildCal();
        wireCal();
      });
      wrap.querySelectorAll('.cal-day:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.appState.date = btn.dataset.date;
          window.appState.time = null;
          screen.querySelector('#continue-btn').disabled = true;
          wrap.innerHTML = buildCal();
          wireCal();
          loadTimeSlots(screen, window.appState.date, window.appState.service?.id);
        });
      });
    }
    wireCal();

    // Back: override header link to go to Step 1 (not hash nav)
    screen.querySelector('.header-back')?.addEventListener('click', (e) => {
      e.preventDefault();
      renderStep1();
    });

    screen.querySelector('#continue-btn').addEventListener('click', () => {
      if (window.appState.date && window.appState.time) renderStep3();
    });

    if (window.appState.date) {
      await loadTimeSlots(screen, window.appState.date, window.appState.service?.id);
    }
  }

  // ── Step 3: Address ───────────────────────────────────────────────────────
  function renderStep3() {
    if (window.posthog) posthog.capture('booking_step_viewed', { step: 'address' });
    const saved = window.appState.location !== 'Home' ? window.appState.location : '';
    screen.innerHTML = `
      ${createHeader('Your Address', true, '#book-service')}
      <div style="padding-top:8px">
        <div class="section-label">Where should we come?</div>
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E40AF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:14px">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <div style="flex:1;position:relative">
              <label style="font-size:12px;color:var(--color-text-secondary);font-weight:600;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Address</label>
              <input id="location-input" type="text" placeholder="e.g. 14 Smith St, Surry Hills NSW 2010"
                value="${saved.replace(/"/g, '"')}"
                style="width:100%;border:none;outline:none;background:transparent;font-size:16px;color:var(--color-text);padding:0;font-family:inherit;box-sizing:border-box" autocomplete="off">
              <div id="address-suggestions" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:1px solid var(--color-border);border-radius:8px;margin-top:4px;max-height:200px;overflow-y:auto;z-index:10;box-shadow:var(--shadow-md)"></div>
              <div style="height:1px;background:var(--color-border);margin-top:8px"></div>
              <div style="margin-top:6px;font-size:12px;color:var(--color-text-secondary)">Your mechanic will come to this address</div>
            </div>
          </div>
        </div>
        <div style="font-size:12px;color:#475569;padding:0 4px;line-height:1.6">The $20 call-out fee covers the mechanic's trip. Most areas in Sydney are covered.</div>
      </div>
      <div class="sticky-bottom">
        <button class="btn btn--primary btn--full" id="s3-continue">Continue to Summary</button>
      </div>
      ${createBottomNav('home')}
    `;

    const input = screen.querySelector('#location-input');
    const suggestionsBox = screen.querySelector('#address-suggestions');
    let debounceTimer = null;

    async function fetchSuggestions(query) {
      if (query.length < 3) {
        suggestionsBox.style.display = 'none';
        return;
      }
      try {
        const q = encodeURIComponent(query + ', Sydney, NSW, Australia');
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&addressdetails=1`,
          {
            headers: { 'Accept-Language': 'en', 'User-Agent': 'DrBikeSydney/1.0' },
          }
        );
        const data = await res.json();
        if (!data.length) {
          suggestionsBox.style.display = 'none';
          return;
        }
        suggestionsBox.innerHTML = data
          .map(
            (item) => `
          <button type="button" class="address-suggestion" data-address="${item.display_name.replace(/"/g, '"')}"
            style="display:block;width:100%;text-align:left;padding:12px 14px;border:none;background:none;cursor:pointer;font-size:14px;color:var(--color-text);font-family:inherit;border-bottom:1px solid var(--color-border)">
            ${item.display_name.split(',')[0]}<br>
            <span style="font-size:12px;color:var(--color-text-secondary)">${item.display_name.split(',').slice(1).join(',')}</span>
          </button>
        `
          )
          .join('');
        suggestionsBox.style.display = 'block';

        suggestionsBox.querySelectorAll('.address-suggestion').forEach((btn) => {
          btn.addEventListener('click', () => {
            input.value = btn.dataset.address;
            window.appState.location = btn.dataset.address;
            suggestionsBox.style.display = 'none';
            input.focus();
          });
        });
      } catch {
        suggestionsBox.style.display = 'none';
      }
    }

    input.addEventListener('input', (e) => {
      window.appState.location = e.target.value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchSuggestions(e.target.value), 250);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        suggestionsBox.style.display = 'none';
      }, 200);
    });

    // Back: go to Step 2
    screen.querySelector('.header-back')?.addEventListener('click', (e) => {
      e.preventDefault();
      renderStep2();
    });

    screen.querySelector('#s3-continue').addEventListener('click', () => {
      window.appState.location = input.value.trim() || 'Home';
      if (window.gtag) gtag('event', 'checkout_progress', { step: 2 });
      router.navigate('service-summary');
    });
  }

  // ── Init: render Step 1 immediately (skeleton), then load services ─────────
  renderStep1();
  _services = await getServices();
  renderStep1();
}

// ── Service Summary / Quote ───────────────────────────────────────────────────
const SERVICE_INCLUSIONS = {
  tune: [
    'Gear adjustment & cable tension',
    'Brake check & pad inspection',
    'Wheel true & tyre pressure',
    'Chain lube & basic clean',
    'Safety inspection',
  ],
  standard: [
    'Everything in Tune-Up',
    'Full drivetrain clean & degrease',
    'Cable check & replace if worn',
    'Bearing check (BB, headset, hubs)',
  ],
  major: [
    'Everything in Standard Service',
    'Bottom bracket service',
    'Headset adjustment & grease',
    'Comprehensive component report',
  ],
  ultimate: [
    'Full bike rebuild',
    'All bearings serviced or replaced',
    'Before & after photos',
    'Detailed parts condition report',
  ],
  safety: [
    'Brake pad check',
    'Tyre & wheel inspection',
    'Drivetrain check',
    'Headset & stem safety check',
  ],
  flat: ['Tube replacement', 'Tyre inspection', 'Pressure set to spec'],
  gear: ['Derailleur alignment', 'Cable tension adjustment', 'Limit screw set', 'Test ride'],
  brake: ['Pad replacement', 'Cable tension & rotor/rim check', 'Bedding in if disc'],
  chain: ['Remove, clean & replace chain', 'Check cassette wear'],
  wheel: ['True wheel (spoke tension)', 'Rim or rotor inspection'],
};
function getServiceInclusions(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('ultimate') || n.includes('overhaul')) return SERVICE_INCLUSIONS['ultimate'];
  if (n.includes('major')) return SERVICE_INCLUSIONS['major'];
  if (n.includes('standard')) return SERVICE_INCLUSIONS['standard'];
  if (n.includes('tune')) return SERVICE_INCLUSIONS['tune'];
  if (n.includes('safety')) return SERVICE_INCLUSIONS['safety'];
  if (n.includes('flat') || n.includes('tyre')) return SERVICE_INCLUSIONS['flat'];
  if (n.includes('gear')) return SERVICE_INCLUSIONS['gear'];
  if (n.includes('brake') || n.includes('bleed')) return SERVICE_INCLUSIONS['brake'];
  if (n.includes('chain')) return SERVICE_INCLUSIONS['chain'];
  if (n.includes('wheel') || n.includes('true')) return SERVICE_INCLUSIONS['wheel'];
  return null;
}

async function renderServiceSummary() {
  const screen = document.querySelector('[data-screen="service-summary"]');
  if (!screen) return;

  const { service, date, time, location } = window.appState;
  if (!service) {
    router.navigate('book-service');
    return;
  }
  if (window.gtag) gtag('event', 'checkout_progress', { step: 3 });
  if (window.posthog) posthog.capture('booking_step_viewed', { step: 'quote_summary' });

  const adj = applyPricingAdjustments(Number(service.price || 0), date);
  const serviceTotal = adj.total;
  const calloutFee = await getCalloutFee(location);
  const grandTotal = serviceTotal + calloutFee;
  const inclusions = getServiceInclusions(service.name);
  const dur = formatServiceDuration(service);

  screen.innerHTML = `
    ${createHeader('Your Quote', true, '#book-service')}
    <div style="padding:4px 0 16px">

      <!-- Quote card -->
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:14px;overflow:hidden;margin-bottom:14px">
        <div style="background:#0D1F3C;padding:14px 16px;display:flex;align-items:center;gap:10px">
          <img src="images/logo-db.png" alt="Dr. Bike Sydney" height="20" style="width:auto;display:block">
          <div>
            <div style="color:#fff;font-size:14px;font-weight:700">${service.name}</div>
            ${dur ? `<div style="color:rgba(255,255,255,0.65);font-size:11px;margin-top:1px">Est. ${dur}</div>` : ''}
          </div>
        </div>
        <div style="padding:2px 0">
          ${createSummaryRow('Date', formatDate(date))}
          ${createSummaryRow('Time', time || '-')}
          ${createSummaryRow('Location', location || 'Home')}
        </div>
      </div>

      ${
        inclusions
          ? `
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:14px;padding:14px 16px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-secondary);margin-bottom:10px">What's included</div>
        ${inclusions
          .map(
            (item) => `
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:7px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0;margin-top:2px"><polyline points="20 6 9 17 4 12"/></svg>
            <span style="font-size:13px;color:var(--color-text);line-height:1.4">${item}</span>
          </div>`
          )
          .join('')}
      </div>`
          : ''
      }

      ${adj.label ? `<div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:10px;padding:10px 14px;font-size:13px;color:var(--color-text-secondary);margin-bottom:14px">${adj.label}</div>` : ''}

      <!-- Pricing breakdown -->
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:14px;overflow:hidden;margin-bottom:14px">
        <div style="padding:0 0 2px">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid var(--color-border)">
            <span style="font-size:13px;color:var(--color-text-secondary)">Service fee</span>
            <span style="font-size:13px;font-weight:600" id="q-service-price">$${serviceTotal.toFixed(2)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid var(--color-border)">
            <div>
              <span style="font-size:13px;color:var(--color-text-secondary)">Mobile call-out fee</span>
              <div style="font-size:11px;color:var(--color-text-secondary);opacity:0.7;margin-top:1px">Paid online now via Stripe</div>
            </div>
            <span style="font-size:13px;font-weight:600">$${calloutFee.toFixed(2)}</span>
          </div>
          <div id="q-discount-row" style="display:none;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid var(--color-border)">
            <span style="font-size:13px;color:var(--color-success)">Promo discount</span>
            <span style="font-size:13px;font-weight:600;color:var(--color-success)" id="q-discount-amt"></span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:var(--color-bg)">
          <span style="font-size:15px;font-weight:700">Total</span>
          <span style="font-size:19px;font-weight:800;color:var(--color-primary)" id="summary-total-amount">$${grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <!-- Discount code -->
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-secondary);margin-bottom:8px">Promo or referral code</div>
        <div style="display:flex;gap:8px">
          <input id="referral-input" type="text" placeholder="Enter code (optional)"
            style="flex:1;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:10px 14px;color:var(--color-text);font-size:16px;outline:none;text-transform:uppercase" />
          <button id="referral-apply-btn" class="btn btn--secondary" style="padding:10px 16px;font-size:13px;white-space:nowrap">Apply</button>
        </div>
        <div id="referral-msg" style="font-size:12px;margin-top:6px;min-height:16px"></div>
      </div>

      <!-- Payment split note -->
      <div style="display:flex;gap:10px;background:#EEF3FC;border-radius:10px;padding:12px 14px;margin-bottom:16px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style="font-size:12px;color:#1848C8;line-height:1.55">
          <strong>How payment works:</strong> The $${calloutFee.toFixed(2)} call-out fee is charged now via Stripe. The service fee ($<span id="q-svc-note">${serviceTotal.toFixed(2)}</span>) is paid to the mechanic directly by card (EFTPOS) when they arrive.
        </div>
      </div>

    </div>
    <div id="booking-error" class="booking-error" hidden></div>
    <div class="sticky-bottom">
      <button class="btn btn--primary btn--full" id="proceed-btn">Confirm & Pay $${calloutFee.toFixed(2)} Call-out Fee</button>
    </div>
    ${createBottomNav('home')}
  `;

  let _appliedDiscount = 0;
  let _currentServiceTotal = serviceTotal;

  screen.querySelector('#referral-apply-btn').addEventListener('click', async () => {
    const input = screen.querySelector('#referral-input');
    const msg = screen.querySelector('#referral-msg');
    const code = (input.value || '').trim().toUpperCase();
    if (!code) return;
    msg.style.color = 'var(--color-text-secondary)';
    msg.textContent = 'Checking...';

    const applyDiscount = (disc, label) => {
      _appliedDiscount = disc;
      _currentServiceTotal = Math.max(0, serviceTotal - disc);
      window.appState.discountCode = code;
      window.appState.discountAmount = disc;
      const newGrand = _currentServiceTotal + calloutFee;
      const totalEl = screen.querySelector('#summary-total-amount');
      if (totalEl) totalEl.textContent = '$' + newGrand.toFixed(2);
      const svcEl = screen.querySelector('#q-service-price');
      if (svcEl) svcEl.textContent = '$' + _currentServiceTotal.toFixed(2);
      const svcNoteEl = screen.querySelector('#q-svc-note');
      if (svcNoteEl) svcNoteEl.textContent = _currentServiceTotal.toFixed(2);
      const discRow = screen.querySelector('#q-discount-row');
      const discAmt = screen.querySelector('#q-discount-amt');
      if (discRow && discAmt) {
        discRow.style.display = 'flex';
        discAmt.textContent = '-$' + disc.toFixed(2);
      }
      msg.style.color = 'var(--color-success)';
      msg.textContent = label;
      input.disabled = true;
      screen.querySelector('#referral-apply-btn').disabled = true;
    };

    try {
      // 1. Try discount_codes table first
      const { data, error } = await sb
        .from('discount_codes')
        .select('discount_value, discount_type, max_uses, uses_count, active')
        .eq('code', code)
        .single();
      if (!error && data && data.active) {
        if (data.max_uses && data.uses_count >= data.max_uses)
          throw new Error('Code has reached its limit');
        const base = service.price || 0;
        const disc =
          data.discount_type === 'percent'
            ? Math.round(((base * data.discount_value) / 100) * 100) / 100
            : Math.min(data.discount_value, base);
        applyDiscount(disc, 'Promo code applied! -$' + disc.toFixed(2) + ' off service fee');
        return;
      }

      // 2. Try as referral code
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) throw new Error('Sign in first to use a referral code');
      const refResp = await fetch('/api/auth?role=apply-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session.access_token, referral_code: code }),
      });
      const refData = await refResp.json();
      if (!refResp.ok) throw new Error(refData.error || 'Invalid code');
      applyDiscount(
        refData.credit,
        'Referral credit applied! -$' + refData.credit.toFixed(2) + ' off'
      );
    } catch (e) {
      _appliedDiscount = 0;
      msg.style.color = 'var(--color-error)';
      msg.textContent = e.message || 'Invalid code';
    }
  });

  screen.querySelector('#proceed-btn').addEventListener('click', async () => {
    const btn = screen.querySelector('#proceed-btn');
    const errEl = screen.querySelector('#booking-error');
    btn.disabled = true;
    btn.textContent = 'Confirming...';
    errEl.hidden = true;
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();
      // Allow guest checkout - no login required for $20 call-out
      // If logged in, associate booking with user; if not, create as guest
      window.appState.bookingId = null;
      window.appState.isGuest = !user;
      router.navigate('payment');
    } catch (e) {
      errEl.textContent = e.message || 'Please try again.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = `Confirm & Pay $${calloutFee.toFixed(2)} Call-out Fee`;
    }
  });
}

// ── Payment ───────────────────────────────────────────────────────────────────
async function renderPayment() {
  const screen = document.querySelector('[data-screen="payment"]');
  if (!screen) return;

  destroyPaymentForm();

  const { service, date, time, location } = window.appState;
  if (!service) {
    router.navigate('book-service');
    return;
  }
  if (window.posthog) posthog.capture('booking_step_viewed', { step: 'payment' });
  const calloutFee = await getCalloutFee(location);

  const {
    data: { user: currentUser },
  } = await sb.auth.getUser();
  const isTestAdmin = currentUser?.email === 'peredo.dm@gmail.com';

  const waText = encodeURIComponent(
    `Hi Dr. Bike! I'd like to book a ${service.name} on ${date} at ${time} at ${location}. Can you confirm my slot?`
  );
  screen.innerHTML = `
    ${createHeader('Confirm Booking', true, '#service-summary')}
    <div style="padding:0 16px 24px">
      <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:12px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;color:#6B7280;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Your selection</div>
        <div style="font-weight:700;color:#0D1F3C;font-size:15px">${service.name}</div>
        <div style="font-size:13px;color:#374151;margin-top:4px">${date} &bull; ${time}</div>
        <div style="font-size:13px;color:#374151">${location}</div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:#6B7280">Call-out fee</span>
          <span style="font-weight:700;color:#0D1F3C">$${calloutFee.toFixed(2)}</span>
        </div>
      </div>

      <div style="background:#FFFBEB;border:2px solid #FCD34D;border-radius:16px;padding:28px 20px;margin-bottom:24px;text-align:center">
        <div style="width:52px;height:52px;background:#FEF3C7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div style="font-weight:800;color:#0D1F3C;font-size:17px;margin-bottom:8px">Online payments coming soon</div>
        <div style="font-size:13px;color:#6B7280;line-height:1.6">We're finalising our business setup. Contact us directly to lock in your slot at the same price.</div>
      </div>

      <a href="https://wa.me/61433963250?text=${waText}"
         style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;background:#25D366;color:#fff;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:10px;box-sizing:border-box">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
        Book via WhatsApp
      </a>
      <a href="tel:+61433963250"
         style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;background:#fff;color:#2563EB;border:2px solid #2563EB;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;box-sizing:border-box">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Call 0433 963 250
      </a>
    </div>
    ${
      isTestAdmin
        ? `
    <div style="padding:0 16px 16px">
      <button class="btn btn--secondary btn--full" id="test-booking-btn" style="border-style:dashed">
        Test booking - no charge (admin only)
      </button>
    </div>`
        : ''
    }
    ${createBottomNav('home')}
  `;

  async function finalizeBooking(paymentIntent, { feeOverride = null, isTest = false } = {}) {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session?.user) throw new Error('Please sign in to complete your booking.');
    const user = session.user;
    const meta = user.user_metadata || {};
    const _clientName = meta.full_name || meta.name || '';
    const fee = feeOverride !== null ? feeOverride : calloutFee;
    // Real Stripe payment id only (admin test passes a fake "test_" id → no payment).
    const realPI =
      paymentIntent && paymentIntent.id && !String(paymentIntent.id).startsWith('test_')
        ? paymentIntent.id
        : null;
    // Server is authoritative: it looks up the price, verifies payment, and inserts.
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'create-booking',
        access_token: session.access_token,
        service_id: service.id || null,
        service_name: service.name,
        scheduled_date: date,
        scheduled_time: time,
        address: location || 'Home',
        bike_id: window.appState.bikeId || null,
        payment_intent_id: realPI,
        discount_code:
          !isTest && window.appState.discountCode ? window.appState.discountCode : null,
        utm_source: sessionStorage.getItem('utm_source') || null,
        utm_medium: sessionStorage.getItem('utm_medium') || null,
        utm_campaign: sessionStorage.getItem('utm_campaign') || null,
      }),
    });
    const _bk = await resp.json();
    if (!resp.ok) throw new Error(_bk.error || 'Could not create booking');
    const booking = { id: _bk.id, tracking_token: _bk.tracking_token };
    window.appState.bookingId = booking.id;
    window.appState.trackingToken = booking.tracking_token || null;
    if (!isTest && window.gtag)
      gtag('event', 'purchase', {
        transaction_id: booking.id,
        value: fee,
        currency: 'AUD',
        items: [{ item_name: service?.name || 'Service' }],
      });
    if (!isTest && window.posthog)
      posthog.capture('booking_completed', {
        value: fee,
        currency: 'AUD',
        service: service?.name || 'Service',
      });
    const _bId = booking.id;
    const _total = fee + service.price;
    Promise.allSettled([
      fetch('/api/send-message?channel=whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: '0433963250',
          template: 'new_booking',
          data: {
            service: service.name,
            date,
            time,
            address: location || 'Home',
            clientName: _clientName,
            price: _total,
            trackUrl: 'https://drbikesydney.com.au/index.html#tracking',
          },
        }),
      }),
      fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: '0433963250',
          name: _clientName,
          service: service.name,
          address: location || 'Home',
          time,
          price: _total,
          type: 'new_booking',
          bookingId: _bId,
        }),
      }),
      fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.email,
          name: _clientName,
          service: service.name,
          date,
          time,
          address: location || 'Home',
          price: _total,
          bookingId: _bId,
          type: 'confirmation',
        }),
      }),
    ]).then((results) =>
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(`[booking-notif ${i}] failed:`, r.reason);
      })
    );
    router.navigate('tracking');
  }

  if (isTestAdmin) {
    screen.querySelector('#test-booking-btn')?.addEventListener('click', async () => {
      const btn = screen.querySelector('#test-booking-btn');
      btn.disabled = true;
      btn.textContent = 'Creating test booking...';
      try {
        await finalizeBooking({ id: `test_${Date.now()}` }, { feeOverride: 0, isTest: true });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Test booking - no charge (admin only)';
        showToast(e.message || 'Test booking failed');
      }
    });
  }
}

// ── Tracking ──────────────────────────────────────────────────────────────────
// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371,
    dLat = ((lat2 - lat1) * Math.PI) / 180,
    dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Geocode address via Nominatim (free, no key needed) ───────────────────────
async function geocodeAddress(address) {
  if (!address) return null;
  try {
    const q = encodeURIComponent(address + ', Sydney, NSW, Australia');
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'DrBikeSydney/1.0' },
    });
    const data = await r.json();
    if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch {}
  return null;
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending: { dot: '#D97706', label: 'Booking received - assigning mechanic...' },
  confirmed: { dot: '#1E40AF', label: 'Mechanic assigned - preparing to depart' },
  enroute: { dot: '#16A34A', label: 'Mechanic is on the way!' },
  en_route: { dot: '#16A34A', label: 'Mechanic is on the way!' },
  in_progress: { dot: '#16A34A', label: 'Mechanic has arrived!' },
  inprogress: { dot: '#16A34A', label: 'Mechanic has arrived!' },
  arrived: { dot: '#16A34A', label: 'Mechanic has arrived!' },
  completed: { dot: '#64748B', label: 'Service completed' },
};

async function renderTrackingPicker(screen) {
  const ST_COLORS = {
    pending: '#D97706',
    confirmed: '#1E40AF',
    enroute: '#16A34A',
    en_route: '#16A34A',
    in_progress: '#16A34A',
    arrived: '#16A34A',
    completed: '#64748B',
    cancelled: '#DC2626',
  };
  const ST_LABELS = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    enroute: 'En Route',
    en_route: 'En Route',
    in_progress: 'In Progress',
    arrived: 'Arrived',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  screen.innerHTML = `
    ${createHeader('My Bookings', false)}
    <div style="padding:16px;overflow-y:auto;max-height:calc(100vh - 112px)">
      <div id="booking-picker-list">
        <div class="loading-row"><div class="skeleton"></div><div class="skeleton"></div></div>
      </div>
    </div>
    ${createBottomNav('tracking')}
  `;

  const listEl = screen.querySelector('#booking-picker-list');

  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:40px 0">
          <div style="font-size:40px;margin-bottom:12px">🔒</div>
          <div style="font-size:15px;font-weight:700;color:#0D1F3C;margin-bottom:6px">Sign in to track bookings</div>
          <div style="font-size:13px;color:#6B7280;margin-bottom:20px">Your bookings will appear here</div>
          <button class="btn btn--primary" id="picker-signin-btn" style="padding:12px 28px;font-size:14px;font-weight:700">Sign in</button>
        </div>`;
      listEl
        .querySelector('#picker-signin-btn')
        ?.addEventListener('click', () => router.navigate('login'));
      return;
    }

    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'client-bookings',
        access_token: session.access_token,
        client_id: session.user.id,
      }),
    });
    const bookings = await resp.json();
    const active = (bookings || []).filter((b) => b.status !== 'cancelled');

    if (!active.length) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:40px 0">
          <div style="font-size:40px;margin-bottom:12px">📋</div>
          <div style="font-size:15px;font-weight:700;color:#0D1F3C;margin-bottom:6px">No bookings yet</div>
          <div style="font-size:13px;color:#6B7280">Book a service to track it here</div>
        </div>`;
      return;
    }

    const upcoming = active.filter((b) => !['completed'].includes(b.status));
    const past = active.filter((b) => b.status === 'completed');

    let html = '';
    if (upcoming.length) {
      html += `<div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Active</div>`;
      upcoming.forEach((b) => {
        const color = ST_COLORS[b.status] || '#64748B';
        html += `
          <div class="booking-pick-item" data-id="${b.id}" data-token="${b.tracking_token || ''}"
            style="background:#fff;border:1px solid #E2E8F0;border-left:4px solid ${color};border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;min-height:64px;transition:background 150ms ease">
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:700;color:#0F172A;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.service_name || 'Service'}</div>
              <div style="font-size:12px;color:#475569">${b.scheduled_date || ''}${b.scheduled_time ? ' · ' + b.scheduled_time : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:12px">
              <span style="font-size:11px;font-weight:600;color:${color};background:${color}1A;padding:3px 10px;border-radius:20px;white-space:nowrap">${ST_LABELS[b.status] || b.status}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>`;
      });
    }

    if (past.length) {
      html += `<div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 8px">History</div>`;
      past.slice(0, 5).forEach((b) => {
        const color = ST_COLORS[b.status] || '#64748B';
        html += `
          <div class="booking-pick-item" data-id="${b.id}" data-token="${b.tracking_token || ''}"
            style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid ${color};border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;min-height:64px;transition:background 150ms ease">
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:700;color:#0F172A;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.service_name || 'Service'}</div>
              <div style="font-size:12px;color:#475569">${b.scheduled_date || ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:12px">
              <span style="font-size:11px;font-weight:600;color:${color};background:${color}1A;padding:3px 10px;border-radius:20px;white-space:nowrap">${ST_LABELS[b.status] || b.status}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>`;
      });
    }

    listEl.innerHTML = html;
    listEl.querySelectorAll('.booking-pick-item').forEach((item) => {
      item.addEventListener('click', () => {
        window.appState.bookingId = item.dataset.id;
        window.appState.trackingToken = item.dataset.token || null;
        renderTracking();
      });
    });
  } catch (e) {
    listEl.innerHTML = `<div style="text-align:center;padding:32px 0;color:#DC2626;font-size:13px">Could not load bookings. Try again.</div>`;
  }
}

async function renderTracking() {
  const screen = document.querySelector('[data-screen="tracking"]');
  if (!screen) return;

  cleanupTracking();

  const { bookingId } = window.appState;

  if (!bookingId) {
    return renderTrackingPicker(screen);
  }

  const ref = bookingRef(bookingId);

  // Screen is 100dvh flex-column with no padding/animation (see CSS override for [data-screen="tracking"].active)
  screen.innerHTML = `
    <!-- Header -->
    <div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;background:#fff;border-bottom:1px solid #E5E7EB">
      <div style="font-size:17px;font-weight:700;color:#0D1F3C">Live Tracking</div>
      <button id="change-booking-btn" style="background:none;border:none;font-size:12px;color:#2563EB;cursor:pointer;font-weight:600;font-family:inherit;padding:8px 0;display:flex;align-items:center;gap:4px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Change booking
      </button>
    </div>

    <!-- Status bar -->
    <div style="flex-shrink:0;display:flex;align-items:center;gap:8px;padding:9px 16px;background:#fff;border-bottom:1px solid #F3F4F6">
      <div id="status-dot" style="width:8px;height:8px;border-radius:50%;background:#1E40AF;flex-shrink:0;transition:background 0.3s"></div>
      <span id="status-text" style="font-size:13px;font-weight:600;color:#0D1F3C">Loading booking...</span>
    </div>

    <!-- Map: flex:1 fills all remaining space between status bar and bottom panel -->
    <div id="tracking-map" style="flex:1;min-height:0;display:block"></div>

    <!-- Bottom panel -->
    <div style="flex-shrink:0;background:#fff;border-top:1px solid #E5E7EB">
      <div id="mechanic-card" style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid #F3F4F6">
        <div id="mechanic-avatar" style="width:40px;height:40px;background:#EFF6FF;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;font-weight:700;color:#2563EB">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div style="min-width:0">
          <div id="mechanic-name" style="font-size:14px;font-weight:700;color:#0D1F3C">Your mechanic</div>
          <div id="mechanic-meta" style="font-size:12px;color:#6B7280;margin-top:1px"></div>
        </div>
        <div id="eta-badge" style="margin-left:auto;flex-shrink:0;text-align:right">
          <div id="eta-text" style="font-size:12px;color:#6B7280">On the way to you</div>
        </div>
        <svg id="mechanic-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2.5" style="display:none;flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div id="arrival-pin-badge" style="display:none;align-items:center;gap:10px;padding:10px 16px;background:#EFF6FF;border-bottom:1px solid #F3F4F6">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <div style="font-size:12px;color:#1848C8"><b>Your code: <span id="arrival-pin-value" style="font-size:14px;letter-spacing:1px">----</span></b> — read this to your mechanic when they arrive</div>
      </div>
      <div style="display:flex;gap:4px;padding:10px 16px">
        ${['Confirmed', 'En Route', 'Arrived', 'Done']
          .map(
            (s, i) =>
              `<div id="step-${i}" style="flex:1;padding:5px 2px;text-align:center;font-size:10px;font-weight:700;border-radius:6px;background:#F3F4F6;color:#9CA3AF;transition:all 0.3s">${s}</div>`
          )
          .join('')}
      </div>
      <div style="display:flex;gap:8px;padding:0 16px 12px">
        <button id="message-btn" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px 8px;background:#fff;border:1.5px solid #E5E7EB;border-radius:10px;font-size:13px;font-weight:600;color:#0D1F3C;cursor:pointer;font-family:inherit">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Message
        </button>
        <button id="share-tracking-btn" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px 8px;background:#fff;border:1.5px solid #E5E7EB;border-radius:10px;font-size:13px;font-weight:600;color:#0D1F3C;cursor:pointer;font-family:inherit">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share link
        </button>
      </div>
    </div>
    ${createBottomNav('tracking')}
  `;

  screen.querySelector('#share-tracking-btn')?.addEventListener('click', shareTrackingLink);
  screen.querySelector('#change-booking-btn')?.addEventListener('click', () => {
    window.appState.bookingId = null;
    window.appState.trackingToken = null;
    renderTrackingPicker(screen);
  });

  await loadLeaflet();
  if (!screen.classList.contains('active')) return;

  const SYDNEY_DEFAULT = [-33.8688, 151.2093];
  const CITY_SPEED_KMH = 30;

  // Set explicit pixel height on map container before Leaflet reads dimensions.
  // flex:1 can return 0 in some browsers/timing; explicit px is always reliable.
  const mapEl = screen.querySelector('#tracking-map');
  const bottomPanel = mapEl.nextElementSibling;
  const topH = 89; // header(52) + status bar(37)
  const navH = 56; // bottom nav (position:fixed)
  const bottomH = bottomPanel ? bottomPanel.getBoundingClientRect().height : 158;
  const mapH = Math.max(140, window.innerHeight - topH - navH - bottomH);
  mapEl.style.height = mapH + 'px';
  mapEl.style.flex = 'none';

  // ── Init map ──────────────────────────────────────────────────────────────
  const map = window.L.map('tracking-map', {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
  });
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  map.setView(SYDNEY_DEFAULT, 14);
  _trackingMap = map;
  requestAnimationFrame(() => map.invalidateSize({ animate: false }));

  const clientIcon = window.L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:#0A58CA;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
  const mechIcon = window.L.divIcon({
    className: '',
    html: `<div style="width:40px;height:40px;background:#22C55E;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5)"><svg width="20" height="14" viewBox="0 0 24 16" fill="white"><rect x="0" y="3" width="16" height="13" rx="1"/><path d="M16 6h5l3 4v6h-8V6z"/><circle cx="5" cy="16" r="3" fill="white"/><circle cx="19" cy="16" r="3" fill="white"/></svg></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

  let clientCoords = SYDNEY_DEFAULT;
  const clientMarker = window.L.marker(clientCoords, { icon: clientIcon })
    .bindPopup('Your location')
    .addTo(map);
  // Mechanic marker not added until real GPS coordinates arrive (avoids showing default Sydney pin)
  _mechanicMarker = null;

  // ── ETA updater ───────────────────────────────────────────────────────────
  function updateETA(mechCoords) {
    const distKm = haversineKm(mechCoords, clientCoords);
    const mins = Math.max(1, Math.round((distKm / CITY_SPEED_KMH) * 60));
    const eta = new Date(Date.now() + mins * 60000);
    const etaStr = eta.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    const el = screen.querySelector('#eta-text');
    if (el)
      el.textContent =
        distKm < 0.1
          ? 'Mechanic is right outside!'
          : `ETA: ${etaStr} (~${mins} min · ${distKm.toFixed(1)} km away)`;
  }

  // ── Status updater ────────────────────────────────────────────────────────
  function applyStatus(status) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.confirmed;
    const dot = screen.querySelector('#status-dot');
    const text = screen.querySelector('#status-text');
    if (dot) dot.style.background = cfg.dot;
    if (text) text.textContent = cfg.label;
    // Progress bar highlight
    const stepMap = {
      pending: -1,
      confirmed: 0,
      enroute: 1,
      en_route: 1,
      in_progress: 2,
      inprogress: 2,
      arrived: 2,
      completed: 3,
    };
    const activeStep = stepMap[status] ?? 0;
    for (let i = 0; i <= 3; i++) {
      const el = screen.querySelector(`#step-${i}`);
      if (!el) continue;
      el.style.background = i <= activeStep ? '#1E40AF' : 'var(--surface)';
      el.style.color = i <= activeStep ? '#fff' : 'var(--gray)';
    }
  }

  // ── Load booking via server-side API (bypasses RLS, includes mechanic_location) ──
  const trackingToken = window.appState.trackingToken;

  async function pollBooking() {
    try {
      const resp = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'public-track',
          ...(trackingToken ? { tracking_token: trackingToken } : { booking_id: bookingId }),
        }),
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  // Real GPS position - always use device location, not geocoded address
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        clientCoords = coords;
        clientMarker.setLatLng(coords);
        map.setView(coords, 14);
        map.invalidateSize({ animate: false });
      },
      null,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  const booking = await pollBooking();

  if (booking) {
    applyStatus(booking.status || 'confirmed');

    // Show assigned mechanic as soon as one has accepted the job (mechanic_id set)
    if (booking.mechanic_id && booking.mechanic_profile?.name) {
      const p = booking.mechanic_profile;
      const nameEl = screen.querySelector('#mechanic-name');
      const metaEl = screen.querySelector('#mechanic-meta');
      const avatarEl = screen.querySelector('#mechanic-avatar');
      if (nameEl) nameEl.textContent = p.name.split(' ')[0];
      if (metaEl) {
        const parts = [];
        if (p.jobs_completed > 0) parts.push(`${p.jobs_completed} services`);
        if (p.rating) parts.push(`★ ${p.rating}`);
        metaEl.textContent = parts.join('  ·  ') || 'Dr. Bike Sydney';
      }
      if (avatarEl) {
        if (p.photo_url) {
          avatarEl.innerHTML = `<img src="${p.photo_url}" alt="${p.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
          avatarEl.style.background = 'transparent';
        } else {
          const initials = p.name
            .split(' ')
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
            .toUpperCase();
          avatarEl.innerHTML = '';
          avatarEl.textContent = initials;
          avatarEl.style.fontSize = '15px';
        }
      }
      const cardEl = screen.querySelector('#mechanic-card');
      const chevronEl = screen.querySelector('#mechanic-card-chevron');
      if (chevronEl) chevronEl.style.display = 'block';
      if (cardEl) {
        cardEl.style.cursor = 'pointer';
        cardEl.addEventListener('click', () => openMechanicProfile(p, booking, screen));
      }
      // Show the arrival PIN only before the mechanic has arrived - once they're
      // in progress/done, it's already served its purpose.
      const preArrival = ['confirmed', 'enroute', 'en_route'].includes(booking.status);
      if (booking.arrival_pin && preArrival) {
        const pinBadge = screen.querySelector('#arrival-pin-badge');
        const pinValue = screen.querySelector('#arrival-pin-value');
        if (pinValue) pinValue.textContent = booking.arrival_pin;
        if (pinBadge) pinBadge.style.display = 'flex';
      }
    }

    // Place mechanic marker only if coordinates are valid (within 150km of Sydney)
    if (booking.mechanic_location?.lat && booking.mechanic_location?.lng) {
      const mc = [booking.mechanic_location.lat, booking.mechanic_location.lng];
      const distFromSydney = haversineKm(mc, SYDNEY_DEFAULT);
      if (distFromSydney < 150) {
        if (!_mechanicMarker)
          _mechanicMarker = window.L.marker(mc, { icon: mechIcon })
            .bindPopup('Your mechanic')
            .addTo(map);
        else _mechanicMarker.setLatLng(mc);
        updateETA(mc);
        if (_trackingMap) _trackingMap.panTo(mc, { animate: true, duration: 1 });
      }
    }

    screen
      .querySelector('#message-btn')
      ?.addEventListener('click', () => openClientChat(bookingId, screen));
  } else {
    applyStatus('confirmed');
    screen
      .querySelector('#message-btn')
      ?.addEventListener('click', () => openClientChat(bookingId, screen));
  }

  // ── Real-time: Supabase Realtime subscription (Uber-style push, no polling) ──
  // Subscribe to mechanic_locations changes for instant map updates
  let realtimeChannel = null;
  let lastMechId = booking?.mechanic_location?.mechanic_id || null;

  function applyMechLocation(lat, lng) {
    if (!lat || !lng) return;
    const mc = [lat, lng];
    if (haversineKm(mc, SYDNEY_DEFAULT) > 150) return;
    if (!_mechanicMarker)
      _mechanicMarker = window.L.marker(mc, { icon: mechIcon })
        .bindPopup('Your mechanic')
        .addTo(map);
    else _mechanicMarker.setLatLng(mc);
    updateETA(mc);
    if (_trackingMap) _trackingMap.panTo(mc, { animate: true, duration: 0.8 });
  }

  function subscribeRealtime(mechId) {
    if (realtimeChannel) sb.removeChannel(realtimeChannel);
    realtimeChannel = sb
      .channel(`mech-loc-${mechId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mechanic_locations',
          filter: `mechanic_id=eq.${mechId}`,
        },
        (payload) => {
          if (payload.new?.lat && payload.new?.lng)
            applyMechLocation(payload.new.lat, payload.new.lng);
        }
      )
      .subscribe();
  }

  if (lastMechId) subscribeRealtime(lastMechId);

  // ── Fallback poll every 5s (catches status changes + location when realtime not subscribed) ──
  let lastStatus = booking?.status;
  const pollInterval = setInterval(async () => {
    if (!screen.classList.contains('active')) {
      clearInterval(pollInterval);
      return;
    }
    const updated = await pollBooking();
    if (!updated) return;
    if (updated.status !== lastStatus) {
      applyStatus(updated.status);
      lastStatus = updated.status;
    }
    // Subscribe to realtime once mechanic_id becomes known
    const newMechId = updated.mechanic_location?.mechanic_id;
    if (newMechId && newMechId !== lastMechId) {
      lastMechId = newMechId;
      subscribeRealtime(newMechId);
    }
    // If realtime not subscribed yet, update from poll
    if (!realtimeChannel || !lastMechId) {
      if (updated.mechanic_location?.lat && updated.mechanic_location?.lng) {
        applyMechLocation(updated.mechanic_location.lat, updated.mechanic_location.lng);
      }
    }
  }, 5000);

  const prev = _unsubTracking;
  _unsubTracking = () => {
    if (prev) prev();
    clearInterval(pollInterval);
    if (realtimeChannel) sb.removeChannel(realtimeChannel);
  };
}

// ── Mechanic profile panel (tap "Your Mechanic" bar for details) ────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMiniStars(rating) {
  return Array.from({ length: 5 }, (_, i) => (i < rating ? '★' : '☆')).join('');
}

function renderReviewSection(booking) {
  if (booking.status !== 'completed') return '';
  if (booking.client_rating) {
    return `
    <div style="border-top:1px solid #E5E7EB;padding:16px 20px">
      <div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">Your review</div>
      <div style="font-size:18px;color:#F59E0B;letter-spacing:2px">${renderMiniStars(booking.client_rating)}</div>
      ${booking.client_review ? `<div style="font-size:13px;color:#374151;margin-top:6px;line-height:1.5">"${escapeHtml(booking.client_review)}"</div>` : ''}
    </div>`;
  }
  return `
    <div style="border-top:1px solid #E5E7EB;padding:16px 20px">
      <button data-rate-booking-id="${booking.id}" class="rate-mechanic-btn" style="width:100%;background:#F59E0B;color:#fff;border:none;border-radius:10px;padding:12px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">⭐ Rate this mechanic</button>
    </div>`;
}

function renderMechanicTrackRecord(p) {
  if (!p.reviews || !p.reviews.length) return '';
  return `
    <div style="border-top:1px solid #E5E7EB;padding:16px 20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em">Client reviews</div>
        ${p.rating ? `<div style="font-size:13px;color:#F59E0B;font-weight:700">★ ${p.rating}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${p.reviews
          .map(
            (r) => `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
              <span style="font-size:12px;font-weight:600;color:#0D1F3C">${escapeHtml(r.client_name)}</span>
              ${r.rating ? `<span style="color:#F59E0B;font-size:12px">${renderMiniStars(r.rating)}</span>` : ''}
            </div>
            <p style="font-size:13px;color:#374151;line-height:1.5;margin:0">"${escapeHtml(r.comment)}"</p>
          </div>`
          )
          .join('')}
      </div>
    </div>`;
}

function wireRateMechanicButtons(root) {
  root.querySelectorAll('.rate-mechanic-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.appState.bookingId = btn.dataset.rateBookingId;
      router.navigate('review');
    });
  });
}

function openMechanicProfile(p, booking, screen) {
  screen.querySelector('#mechanic-profile-panel')?.remove();

  const initials = p.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const avatarHTML = p.photo_url
    ? `<img src="${p.photo_url}" alt="${p.name}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.15)">`
    : `<div style="width:88px;height:88px;border-radius:50%;background:#EFF6FF;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#2563EB">${initials}</div>`;

  const statParts = [];
  if (p.jobs_completed > 0)
    statParts.push(
      `<div style="text-align:center"><div style="font-size:17px;font-weight:800;color:#0D1F3C">${p.jobs_completed}</div><div style="font-size:11px;color:#6B7280">Jobs done</div></div>`
    );
  if (p.rating)
    statParts.push(
      `<div style="text-align:center"><div style="font-size:17px;font-weight:800;color:#0D1F3C">★ ${p.rating}</div><div style="font-size:11px;color:#6B7280">Rating</div></div>`
    );

  const panel = document.createElement('div');
  panel.id = 'mechanic-profile-panel';
  panel.style.cssText =
    'position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;z-index:2000';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:0 12px;height:52px;border-bottom:1px solid #E5E7EB;flex-shrink:0;background:#fff">
      <button id="close-mech-profile-btn" style="background:none;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;color:#374151" aria-label="Close">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span style="font-size:15px;font-weight:700;color:#0D1F3C">Mechanic profile</span>
    </div>
    <div style="flex:1;overflow-y:auto">
      <div style="height:84px;width:100%;overflow:hidden;background:#EFF6FF">
        <img src="images/mechanic-working.webp" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
      </div>
      <div style="display:flex;justify-content:center;margin-top:-44px">${avatarHTML}</div>
      <div style="text-align:center;padding:10px 20px 0">
        <div style="font-size:17px;font-weight:700;color:#0D1F3C">${p.name}</div>
        <div style="font-size:12px;color:#6B7280;margin-top:2px">Dr. Bike Mobile Mechanic</div>
        ${p.bio ? `<div style="font-size:13px;color:#374151;margin-top:10px;line-height:1.5">${p.bio}</div>` : ''}
      </div>
      ${statParts.length ? `<div style="display:flex;justify-content:center;gap:32px;padding:16px 20px">${statParts.join('')}</div>` : ''}
      <div style="display:flex;gap:8px;padding:16px 20px">
        <a href="tel:+61433963250" style="flex:1;text-align:center;background:#2563EB;color:#fff;padding:12px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none">📞 Call</a>
        <a href="https://wa.me/61433963250" style="flex:1;text-align:center;background:#25D366;color:#fff;padding:12px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none">💬 WhatsApp</a>
      </div>
      ${renderMechanicTrackRecord(p)}
      ${renderReviewSection(booking)}
    </div>
  `;
  screen.style.position = 'relative';
  screen.appendChild(panel);
  wireRateMechanicButtons(panel);

  // Leaflet's panes use a high z-index and bleed through overlays - hide the map while open
  const trackMapEl = screen.querySelector('#tracking-map');
  if (trackMapEl) trackMapEl.style.visibility = 'hidden';

  panel.querySelector('#close-mech-profile-btn').addEventListener('click', () => {
    panel.remove();
    if (trackMapEl) trackMapEl.style.visibility = 'visible';
    _trackingMap?.invalidateSize?.({ animate: false });
  });
}

// ── Client Chat (in-app, writes to job_messages) ─────────────────────────────
let _clientChatChannel = null;

function openClientChat(bookingId, screen) {
  let panel = screen.querySelector('#client-chat-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'client-chat-panel';
    panel.style.cssText =
      'position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;z-index:2000';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:0 12px 0 6px;height:56px;border-bottom:1px solid #E5E7EB;flex-shrink:0;background:#fff">
        <button id="close-chat-btn" style="background:none;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;color:#374151" aria-label="Close chat">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style="width:38px;height:38px;border-radius:50%;background:#1E40AF;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🔧</div>
        <div style="min-width:0;flex:1">
          <div style="font-size:15px;font-weight:700;color:#0D1F3C">Your mechanic</div>
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:#059669"><span style="width:7px;height:7px;border-radius:50%;background:#22C55E;display:inline-block"></span>Online now</div>
        </div>
      </div>
      <div id="client-chat-msgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:#F9FAFB"></div>
      <div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid #E5E7EB;flex-shrink:0;background:#fff">
        <input id="client-chat-inp" style="flex:1;padding:10px 14px;border:1.5px solid #E5E7EB;border-radius:20px;font-family:inherit;font-size:16px;outline:none;color:#0D1F3C;background:#fff" placeholder="Type a message..." maxlength="500">
        <button id="client-chat-send" style="background:#2563EB;color:#fff;border:none;border-radius:50%;width:40px;height:40px;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    `;
    screen.style.position = 'relative';
    screen.appendChild(panel);

    panel.querySelector('#close-chat-btn').addEventListener('click', () => {
      panel.remove();
      const tm = screen.querySelector('#tracking-map');
      if (tm) tm.style.visibility = 'visible';
      _trackingMap?.invalidateSize?.({ animate: false });
      if (_clientChatChannel) {
        sb.removeChannel(_clientChatChannel);
        _clientChatChannel = null;
      }
    });

    const inp = panel.querySelector('#client-chat-inp');
    const sendBtn = panel.querySelector('#client-chat-send');

    async function sendMsg() {
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      let userId = 'client';
      try {
        const { data } = await sb.auth.getUser();
        userId = data?.user?.id || 'client';
      } catch {}
      const { error } = await sb
        .from('job_messages')
        .insert({ booking_id: bookingId, sender_role: 'client', sender_id: userId, message: text });
      if (error) {
        showToast('Message failed to send', 'error');
        inp.value = text;
      }
    }
    sendBtn.addEventListener('click', sendMsg);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
      }
    });
  }

  panel.style.display = 'flex';

  // Hide the Leaflet map behind the chat (its panes use high z-index and bleed through).
  const trackMapEl = screen.querySelector('#tracking-map');
  if (trackMapEl) trackMapEl.style.visibility = 'hidden';

  // Load existing messages
  (async () => {
    const msgs = panel.querySelector('#client-chat-msgs');
    msgs.innerHTML =
      '<div style="text-align:center;font-size:12px;color:#6B7280;padding:20px">Loading messages...</div>';
    const { data } = await sb
      .from('job_messages')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    msgs.innerHTML = '';
    if (!data?.length) {
      msgs.innerHTML =
        '<div data-empty style="text-align:center;padding:40px 20px;color:#6B7280;margin:auto"><div style="font-size:40px;margin-bottom:10px">💬</div><div style="font-size:14px;font-weight:600;color:#0D1F3C">No messages yet</div><div style="font-size:12px;margin-top:4px">Send a message to your mechanic</div></div>';
    } else {
      data.forEach((m) => appendClientMsg(m, msgs, false));
    }
    msgs.scrollTop = msgs.scrollHeight;
  })();

  // Realtime subscription
  if (_clientChatChannel) sb.removeChannel(_clientChatChannel);
  _clientChatChannel = sb
    .channel(`client-chat-${bookingId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'job_messages',
        filter: `booking_id=eq.${bookingId}`,
      },
      (payload) => {
        const msgs = panel.querySelector('#client-chat-msgs');
        if (msgs) {
          msgs.querySelector('[data-empty]')?.remove();
          appendClientMsg(payload.new, msgs, true);
        }
      }
    )
    .subscribe();
}

function appendClientMsg(msg, container, scroll) {
  const isClient = msg.sender_role === 'client';
  const wrap = document.createElement('div');
  wrap.style.cssText = `display:flex;flex-direction:column;align-items:${isClient ? 'flex-end' : 'flex-start'};gap:2px`;
  const bubble = document.createElement('div');
  bubble.style.cssText = `max-width:75%;padding:9px 13px;border-radius:${isClient ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};font-size:14px;line-height:1.4;word-break:break-word;background:${isClient ? '#2563EB' : '#fff'};color:${isClient ? '#fff' : '#0D1F3C'};border:${isClient ? 'none' : '1px solid #E5E7EB'}`;
  const photoMatch = msg.message?.match(/^\[PHOTO:(.*)\]$/);
  if (photoMatch) {
    const img = document.createElement('img');
    img.src = photoMatch[1];
    img.alt = 'Photo';
    img.style.cssText = 'max-width:200px;border-radius:10px;display:block;cursor:pointer';
    img.addEventListener('click', () => window.open(photoMatch[1], '_blank'));
    bubble.style.padding = '4px';
    bubble.appendChild(img);
  } else {
    bubble.textContent = msg.message;
  }
  const time = document.createElement('div');
  time.style.cssText = 'font-size:10px;color:#9CA3AF';
  time.textContent = new Date(msg.created_at).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  wrap.appendChild(bubble);
  wrap.appendChild(time);
  container.appendChild(wrap);
  if (scroll) container.scrollTop = container.scrollHeight;
}

// ── Review ────────────────────────────────────────────────────────────────────
async function shareTrackingLink() {
  const bookingId = window.appState.bookingId;
  if (!bookingId) {
    showToast('No active booking.');
    return;
  }
  let token = window.appState.trackingToken;
  if (!token) {
    try {
      const { data } = await sb
        .from('bookings')
        .select('tracking_token')
        .eq('id', bookingId)
        .single();
      token = data?.tracking_token || null;
    } catch {}
  }
  const url =
    window.location.origin + '/track.html' + (token ? '?token=' + token : '?id=' + bookingId);
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Track my Dr. Bike service', url });
    } else {
      await navigator.clipboard.writeText(url);
      showToast('Tracking link copied!');
    }
  } catch (e) {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Tracking link copied!');
    } catch {}
  }
}

function compressImageToBase64(file, maxPx = 1920, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth,
        h = img.naturalHeight;
      if (w > maxPx || h > maxPx) {
        if (w >= h) {
          h = Math.round((h * maxPx) / w);
          w = maxPx;
        } else {
          w = Math.round((w * maxPx) / h);
          h = maxPx;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function renderReview() {
  const screen = document.querySelector('[data-screen="review"]');
  if (!screen) return;

  let currentRating = 0;
  let reviewPhotoFile = null;
  const { bookingId } = window.appState;

  screen.innerHTML = `
    ${createHeader('Review Service', true, '#home')}
    <div class="review-prompt">
      <div class="review-icon">
        <img src="images/logo-db.png" alt="Dr. Bike Sydney" height="40" style="width:auto;display:block;margin:0 auto">
      </div>
      <p class="review-question">How was your experience?<br>We'd love to hear your feedback.</p>
    </div>
    <div class="star-row" id="star-row" role="group" aria-label="Rate your experience">
      ${[1, 2, 3, 4, 5]
        .map(
          (i) => `
        <button class="star-btn" data-value="${i}" type="button" aria-label="${i} star${i > 1 ? 's' : ''}">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>`
        )
        .join('')}
    </div>
    <div class="review-field">
      <textarea id="review-comment" class="review-textarea" placeholder="Tell us about your experience..." maxlength="500" rows="4"></textarea>
      <div class="char-counter"><span id="char-count">0</span>/500</div>
    </div>
    <div style="margin:0 24px 16px">
      <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Add a photo <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#9CA3AF">(optional)</span></div>
      <label id="review-photo-label" style="display:flex;align-items:center;gap:10px;height:56px;padding:0 14px;border:1.5px dashed #E5E7EB;border-radius:10px;cursor:pointer;background:#F9FAFB">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <span id="review-photo-txt" style="font-size:13px;color:#6B7280">Tap to add a photo (optional)</span>
        <input type="file" accept="image/*" capture="environment" id="review-photo-inp" style="display:none">
      </label>
      <div id="review-photo-preview" style="display:none;margin-top:10px;position:relative;width:80px;height:80px">
        <img id="review-photo-img" style="width:80px;height:80px;object-fit:cover;border-radius:10px;display:block" alt="Your photo">
        <button type="button" id="review-photo-remove" aria-label="Remove photo" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.55);border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div id="review-error" class="booking-error" hidden></div>
    <button class="btn btn--primary btn--full" id="submit-review-btn">Submit Review</button>
    <button class="btn btn--ghost btn--full mt-3" id="skip-btn">Maybe Later</button>
    ${createBottomNav('home')}
  `;

  const stars = [...screen.querySelectorAll('.star-btn')];

  function highlight(n) {
    stars.forEach((star, i) => {
      star.querySelector('svg').style.fill = i < n ? 'var(--color-primary)' : 'none';
      star.classList.toggle('star-btn--active', i < n);
    });
  }

  stars.forEach((star) => {
    star.addEventListener('mouseenter', () => highlight(Number(star.dataset.value)));
    star.addEventListener('mouseleave', () => highlight(currentRating));
    star.addEventListener('click', () => {
      currentRating = Number(star.dataset.value);
      highlight(currentRating);
    });
  });

  const textarea = screen.querySelector('#review-comment');
  const counter = screen.querySelector('#char-count');
  textarea.addEventListener('input', () => {
    counter.textContent = textarea.value.length;
  });

  screen.querySelector('#review-photo-inp').addEventListener('change', function () {
    if (!this.files[0]) return;
    reviewPhotoFile = this.files[0];
    const previewUrl = URL.createObjectURL(reviewPhotoFile);
    screen.querySelector('#review-photo-img').src = previewUrl;
    screen.querySelector('#review-photo-preview').style.display = 'block';
    screen.querySelector('#review-photo-txt').textContent = 'Photo selected — tap to change';
    const lbl = screen.querySelector('#review-photo-label');
    lbl.style.borderColor = 'var(--color-primary)';
    lbl.style.background = '#EEF3FC';
  });

  screen.querySelector('#review-photo-remove').addEventListener('click', function (e) {
    e.preventDefault();
    reviewPhotoFile = null;
    screen.querySelector('#review-photo-preview').style.display = 'none';
    screen.querySelector('#review-photo-inp').value = '';
    screen.querySelector('#review-photo-txt').textContent = 'Tap to add a photo (optional)';
    const lbl = screen.querySelector('#review-photo-label');
    lbl.style.borderColor = '#E5E7EB';
    lbl.style.background = '#F9FAFB';
  });

  screen.querySelector('#submit-review-btn').addEventListener('click', async () => {
    const btn = screen.querySelector('#submit-review-btn');
    const errEl = screen.querySelector('#review-error');
    if (!currentRating) {
      errEl.textContent = 'Please select a rating.';
      errEl.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    errEl.hidden = true;
    try {
      let photoBase64 = null;
      if (reviewPhotoFile) {
        btn.textContent = 'Uploading photo...';
        photoBase64 = await compressImageToBase64(reviewPhotoFile);
      }
      await submitReview(bookingId || 'demo', currentRating, textarea.value.trim(), photoBase64);
    } catch (e) {
      errEl.textContent = e.message || 'Could not submit review. Please try again.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Submit Review';
      return;
    }
    showToast('Thanks for your feedback!', 'success');
    // 2.3: If 5-star review, show social share nudge before navigating home
    if (currentRating === 5) {
      screen.innerHTML = `
        <div style="padding:48px 24px;text-align:center">
          <div style="font-size:48px;margin-bottom:16px">&#11088;&#11088;&#11088;&#11088;&#11088;</div>
          <h2 style="font-size:22px;font-weight:800;color:var(--color-text);margin-bottom:8px">Thanks for the 5 stars!</h2>
          <p style="font-size:14px;color:var(--color-text-secondary);line-height:1.6;margin-bottom:28px">
            Would you mind leaving a quick Google review? It helps other Sydney cyclists find us.
          </p>
          <div style="display:flex;flex-direction:column;gap:12px;max-width:280px;margin:0 auto">
            <a id="google-review-link" href="https://g.page/r/drbikesydney/review" target="_blank" rel="noopener"
              style="display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;border:2px solid #E5E7EB;border-radius:10px;padding:14px 20px;text-decoration:none;font-weight:600;font-size:14px;color:#374151">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Leave a Google Review
            </a>
            <a id="fb-share-link" href="https://www.facebook.com/drbikesydney" target="_blank" rel="noopener"
              style="display:flex;align-items:center;justify-content:center;gap:10px;background:#1877F2;border-radius:10px;padding:14px 20px;text-decoration:none;font-weight:600;font-size:14px;color:#fff">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Share on Facebook
            </a>
            <button id="review-skip-home-btn" style="background:transparent;border:none;color:var(--color-text-secondary);font-size:13px;cursor:pointer;padding:8px">
              Skip — back to home
            </button>
          </div>
        </div>
      `;
      screen.querySelector('#google-review-link').addEventListener('click', () => {
        if (window.gtag) gtag('event', 'review_click', { platform: 'google' });
      });
      screen.querySelector('#fb-share-link').addEventListener('click', () => {
        if (window.gtag) gtag('event', 'review_click', { platform: 'facebook' });
      });
      screen
        .querySelector('#review-skip-home-btn')
        .addEventListener('click', () => router.navigate('home'));
      return; // don't navigate home yet
    }
    router.navigate('home');
  });

  screen.querySelector('#skip-btn').addEventListener('click', () => router.navigate('home'));
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function renderLogin() {
  const screen = document.querySelector('[data-screen="login"]');
  if (!screen) return;

  const isSignup = _loginMode === 'signup';
  const eyeOpen = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const eyeClosed = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

  screen.innerHTML = `
    <div class="login-wrap">
      <div class="login-logo" style="letter-spacing:-0.3px;font-size:22px">
        <img src="images/logo-db.png" alt="Dr. Bike Sydney" height="32" style="width:auto;display:block">
        <span>Dr. <span style="color:#2563EB">Bike</span> Sydney</span>
      </div>
      <p style="text-align:center;font-size:13px;font-weight:600;color:#2563EB;margin:0 0 12px">Healthy bikes, happy riders</p>
      <h2 class="login-title">${isSignup ? 'Create Account' : 'Welcome Back!'}</h2>
      <p class="login-sub text-secondary text-center">${isSignup ? 'Join Dr. Bike Sydney' : 'Login to your account'}</p>
      <button type="button" id="google-btn" style="width:100%;padding:14px;min-height:48px;background:#fff;border:1.5px solid #E2E8F0;border-radius:10px;color:#0F172A;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;transition:border-color 150ms ease,background 150ms ease">
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="flex:1;height:1px;background:var(--color-border)"></div>
        <span style="color:var(--color-text-secondary);font-size:13px">or</span>
        <div style="flex:1;height:1px;background:var(--color-border)"></div>
      </div>
      <form class="login-form" id="login-form" novalidate>
        ${isSignup ? `<div class="form-field"><input type="text" id="login-name" class="form-input" placeholder="Full Name" autocomplete="name"></div>` : ''}
        <div class="form-field">
          <input type="email" id="login-email" class="form-input" placeholder="hello@drbike.com.au" autocomplete="email">
        </div>
        <div class="form-field form-field--password">
          <input type="password" id="login-password" class="form-input" placeholder="Password" autocomplete="${isSignup ? 'new-password' : 'current-password'}">
          <button type="button" class="password-toggle" id="pwd-toggle" aria-label="Toggle password visibility">
            <span id="eye-icon">${eyeOpen}</span>
          </button>
        </div>
        ${!isSignup ? `<div class="forgot-wrap"><button type="button" class="btn btn--ghost forgot-link" id="forgot-btn">Forgot Password?</button></div>` : ''}
        <div id="login-error" class="booking-error" hidden></div>
        <button type="submit" class="btn btn--primary btn--full mt-4" id="login-submit">${isSignup ? 'Create Account' : 'Login'}</button>
      </form>
      <div class="login-footer">
        ${
          isSignup
            ? `Already have an account? <button class="link-btn" id="toggle-mode">Sign in</button>`
            : `Don't have an account? <button class="link-btn" id="toggle-mode">Sign up</button>`
        }
      </div>
    </div>
    ${createBottomNav('profile')}
  `;

  const googleBtn = screen.querySelector('#google-btn');
  googleBtn.addEventListener('mouseover', () => {
    googleBtn.style.borderColor = '#4285f4';
  });
  googleBtn.addEventListener('mouseout', () => {
    googleBtn.style.borderColor = '';
  });

  const pwdInput = screen.querySelector('#login-password');
  const eyeEl = screen.querySelector('#eye-icon');
  screen.querySelector('#pwd-toggle').addEventListener('click', () => {
    const show = pwdInput.type === 'password';
    pwdInput.type = show ? 'text' : 'password';
    eyeEl.innerHTML = show ? eyeClosed : eyeOpen;
  });

  screen.querySelector('#toggle-mode').addEventListener('click', () => {
    _loginMode = _loginMode === 'signin' ? 'signup' : 'signin';
    renderLogin();
  });

  screen.querySelector('#forgot-btn')?.addEventListener('click', () => {
    alert('A password reset link will be sent to your email address.');
  });

  screen.querySelector('#google-btn').addEventListener('click', async () => {
    const errEl = screen.querySelector('#login-error');
    errEl.hidden = true;
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/index.html' },
      });
      if (error) throw error;
    } catch (e) {
      errEl.textContent = e.message || 'Google login failed. Please try again.';
      errEl.hidden = false;
    }
  });

  screen.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = screen.querySelector('#login-submit');
    const errEl = screen.querySelector('#login-error');
    const email = screen.querySelector('#login-email').value.trim();
    const password = screen.querySelector('#login-password').value;
    const name = isSignup ? screen.querySelector('#login-name')?.value.trim() || '' : '';

    if (!email || !password) {
      errEl.textContent = 'Please fill in all fields.';
      errEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = isSignup ? 'Creating account...' : 'Logging in...';
    errEl.hidden = true;

    try {
      if (isSignup) {
        await signUp(email, password, name);
        if (window.gtag) gtag('event', 'sign_up', { method: 'email' });
        if (window.fbq) fbq('track', 'Lead');
        showToast('Account created! Check your email to verify.', 'success');
      } else {
        await signIn(email, password);
        if (window.gtag) gtag('event', 'login', { method: 'email' });
        showToast('Welcome back!', 'success');
      }
      _loginMode = 'signin';
      router.navigate('home');
    } catch (err) {
      errEl.textContent = err.message || 'Authentication failed. Please try again.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = isSignup ? 'Create Account' : 'Login';
    }
  });
}

// ── My Bookings ───────────────────────────────────────────────────────────────
async function renderMyBookings() {
  const screen = document.querySelector('[data-screen="my-bookings"]');
  if (!screen) return;

  screen.innerHTML = `
    ${createHeader('My Bookings', false)}
    <div class="tabs-row">
      <button class="tab-btn${_bookingsTab === 'upcoming' ? ' active' : ''}" data-tab="upcoming">Upcoming</button>
      <button class="tab-btn${_bookingsTab === 'history' ? ' active' : ''}" data-tab="history">History</button>
    </div>
    <div id="bookings-list" class="bookings-list">
      <div class="loading-row"><div class="skeleton"></div><div class="skeleton"></div></div>
    </div>
    ${createBottomNav('my-bookings')}
  `;

  const allBookings = await getMyBookings();
  const ACTIVE = new Set([
    'pending',
    'confirmed',
    'enroute',
    'en_route',
    'arrived',
    'in_progress',
    'inprogress',
  ]);
  const DONE = new Set(['completed', 'cancelled']);
  const calIcon = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

  function renderList(tab) {
    const list = screen.querySelector('#bookings-list');
    const filtered = allBookings.filter((b) =>
      tab === 'upcoming' ? ACTIVE.has(b.status) : DONE.has(b.status)
    );

    if (!filtered.length) {
      list.innerHTML = createEmptyState(
        calIcon,
        tab === 'upcoming' ? 'No upcoming bookings' : 'No booking history',
        tab === 'upcoming'
          ? 'Book your first service today!'
          : 'Completed services will appear here.'
      );
      return;
    }

    list.innerHTML = filtered.map((b) => createBookingCard(b)).join('');

    list.querySelectorAll('.booking-card').forEach((card) => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const booking = allBookings.find((b) => String(b.id) === card.dataset.bookingId);
        if (!booking) return;
        const STATUS_COLORS = {
          pending: '#D97706',
          confirmed: '#1E40AF',
          enroute: '#16A34A',
          en_route: '#16A34A',
          in_progress: '#16A34A',
          inprogress: '#16A34A',
          arrived: '#16A34A',
          completed: '#64748B',
          cancelled: '#DC2626',
        };
        const STATUS_LABELS = {
          pending: 'Pending',
          confirmed: 'Confirmed',
          enroute: 'En Route',
          en_route: 'En Route',
          in_progress: 'In Progress',
          inprogress: 'In Progress',
          arrived: 'Arrived',
          completed: 'Completed',
          cancelled: 'Cancelled',
        };
        const canCancel = booking.status === 'pending' || booking.status === 'confirmed';
        const overlay = document.createElement('div');
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center';
        const sc = STATUS_COLORS[booking.status] || '#64748B';
        const sl = STATUS_LABELS[booking.status] || booking.status;
        overlay.innerHTML = `
          <div id="detail-panel" style="background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;box-shadow:0 -8px 32px rgba(0,0,0,0.12)">
            <div style="width:36px;height:4px;background:#E2E8F0;border-radius:4px;margin:0 auto 20px"></div>
            <div style="font-size:18px;font-weight:800;color:#0F172A;margin-bottom:4px">${booking.service_name || 'Service'}</div>
            <div style="display:inline-block;font-size:11px;font-weight:600;color:${sc};background:${sc}1A;padding:3px 10px;border-radius:20px;margin-bottom:20px">${sl}</div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;background:#F8FAFC;border-radius:12px;padding:16px;border:1px solid #E2E8F0">
              <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:#475569">Date</span><span style="font-weight:600;color:#0F172A">${booking.scheduled_date || '--'}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:#475569">Time</span><span style="font-weight:600;color:#0F172A">${booking.scheduled_time || '--'}</span></div>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;font-size:14px"><span style="color:#475569">Address</span><span style="font-weight:600;color:#0F172A;text-align:right;max-width:60%">${booking.address || '--'}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:#475569">Call-out fee</span><span style="font-weight:600;color:#0F172A">$${booking.callout_fee ?? 20}</span></div>
            </div>
            ${booking.status === 'cancelled' && booking.cancellation_reason ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px 16px;margin-bottom:16px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#DC2626;margin-bottom:4px">Cancellation reason</div><div style="font-size:14px;color:#7F1D1D">${booking.cancellation_reason}</div></div>` : ''}
            <div style="display:flex;flex-direction:column;gap:8px">
              ${booking.status === 'completed' ? '<button id="book-again-btn" class="btn btn--primary btn--full">↻ Book Again</button>' : ''}
              ${booking.status === 'enroute' || booking.status === 'en_route' || booking.status === 'in_progress' ? '<button id="track-live-btn" class="btn btn--primary btn--full">Track Live</button>' : ''}
              ${booking.tracking_token ? '<button id="share-track-btn" class="btn btn--secondary btn--full">Share tracking link</button>' : ''}
              ${canCancel ? '<button id="reschedule-btn" class="btn btn--secondary btn--full">Reschedule</button>' : ''}
              ${canCancel ? '<button id="cancel-booking-btn" class="btn btn--danger btn--full">Cancel booking</button>' : ''}
            </div>
            ${booking.mechanic_id ? '<div id="detail-mechanic-section"></div>' : ''}
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
              <button id="close-detail-btn" class="btn btn--secondary btn--full">Close</button>
            </div>
          </div>
        `;
        screen.appendChild(overlay);
        overlay
          .querySelector('#close-detail-btn')
          .addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) overlay.remove();
        });
        if (booking.mechanic_id) {
          fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'public-track', booking_id: booking.id }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              const p = data?.mechanic_profile;
              const sectionEl = overlay.querySelector('#detail-mechanic-section');
              if (!p?.name || !sectionEl) return;
              const initials = p.name
                .split(' ')
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase();
              const avatarHTML = p.photo_url
                ? `<img src="${p.photo_url}" alt="${p.name}" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
                : `<div style="width:44px;height:44px;border-radius:50%;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#2563EB">${initials}</div>`;
              const metaParts = [];
              if (p.jobs_completed > 0) metaParts.push(`${p.jobs_completed} services`);
              if (p.rating) metaParts.push(`★ ${p.rating}`);
              sectionEl.style.cssText =
                'margin-top:16px;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden';
              sectionEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;padding:14px 16px">
                  ${avatarHTML}
                  <div style="min-width:0">
                    <div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em">Your mechanic</div>
                    <div style="font-size:14px;font-weight:700;color:#0F172A">${p.name}</div>
                    ${metaParts.length ? `<div style="font-size:12px;color:#6B7280">${metaParts.join('  ·  ')}</div>` : ''}
                  </div>
                </div>
                ${renderReviewSection(booking)}
              `;
              wireRateMechanicButtons(sectionEl);
            })
            .catch(() => {});
        }
        overlay.querySelector('#book-again-btn')?.addEventListener('click', async () => {
          const btn = overlay.querySelector('#book-again-btn');
          btn.textContent = 'Loading...';
          btn.disabled = true;
          const services = await getServices();
          const match = (services || []).find((s) => s.name === booking.service_name);
          if (!match) {
            showToast('That service is no longer available. Please pick a new one.', 'error');
            btn.textContent = '↻ Book Again';
            btn.disabled = false;
            return;
          }
          window.appState.service = match;
          window.appState.location = booking.address || 'Home';
          window.appState.bikeId = null;
          window.appState.date = null;
          window.appState.time = null;
          overlay.remove();
          router.navigate('book-service');
        });
        overlay.querySelector('#track-live-btn')?.addEventListener('click', () => {
          window.appState.bookingId = booking.id;
          window.appState.trackingToken = booking.tracking_token || null;
          overlay.remove();
          router.navigate('tracking');
        });
        overlay.querySelector('#share-track-btn')?.addEventListener('click', async () => {
          const url = window.location.origin + '/track.html?token=' + booking.tracking_token;
          try {
            if (navigator.share) {
              await navigator.share({ title: 'Track my Dr. Bike service', url });
            } else {
              await navigator.clipboard.writeText(url);
              showToast('Tracking link copied!');
            }
          } catch {
            try {
              await navigator.clipboard.writeText(url);
              showToast('Tracking link copied!');
            } catch {}
          }
        });
        if (canCancel) {
          overlay.querySelector('#cancel-booking-btn').addEventListener('click', async () => {
            const {
              data: { user },
            } = await sb.auth.getUser();
            if (!user) return;
            const session = (await sb.auth.getSession()).data.session;
            if (!session) return;
            const btn = overlay.querySelector('#cancel-booking-btn');
            btn.textContent = 'Cancelling...';
            btn.disabled = true;
            const resp = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role: 'client-cancel',
                access_token: session.access_token,
                booking_id: booking.id,
                client_id: user.id,
              }),
            });
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              showToast(err.error || 'Could not cancel booking.', 'error');
              btn.textContent = 'Cancel booking';
              btn.disabled = false;
              return;
            }
            booking.status = 'cancelled';
            overlay.remove();
            renderList(tab);
            showToast('Booking cancelled.');
          });

          overlay.querySelector('#reschedule-btn').addEventListener('click', () => {
            const panel = document.getElementById('detail-panel');
            const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
            panel.innerHTML = `
              <div style="font-size:17px;font-weight:700;margin-bottom:20px">📅 Reschedule</div>
              <div style="margin-bottom:16px">
                <label style="font-size:13px;color:var(--color-text-secondary);display:block;margin-bottom:6px">New date</label>
                <input id="resched-date" type="date" min="${tomorrow}" value="${booking.scheduled_date || ''}"
                  style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;background:var(--color-bg);color:var(--color-text)">
              </div>
              <div style="margin-bottom:24px">
                <label style="font-size:13px;color:var(--color-text-secondary);display:block;margin-bottom:6px">New time</label>
                <select id="resched-time" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;background:var(--color-bg);color:var(--color-text)">
                  ${['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']
                    .map(
                      (t) =>
                        `<option value="${t}" ${booking.scheduled_time === t ? 'selected' : ''}>${t.replace(':00', '') + (parseInt(t) < 12 ? 'am' : 'pm')}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <button id="confirm-resched-btn" class="btn btn--primary btn--full" style="margin-bottom:10px">Confirm reschedule</button>
              <button id="back-detail-btn" class="btn btn--secondary btn--full">Back</button>
            `;
            panel
              .querySelector('#back-detail-btn')
              .addEventListener('click', () => overlay.remove());
            panel.querySelector('#confirm-resched-btn').addEventListener('click', async () => {
              const newDate = panel.querySelector('#resched-date').value;
              const newTime = panel.querySelector('#resched-time').value;
              if (!newDate) {
                showToast('Select a date.', 'error');
                return;
              }
              const {
                data: { user },
              } = await sb.auth.getUser();
              if (!user) return;
              const session = (await sb.auth.getSession()).data.session;
              if (!session) return;
              const btn = panel.querySelector('#confirm-resched-btn');
              btn.textContent = 'Saving...';
              btn.disabled = true;
              const resp = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  role: 'client-reschedule',
                  access_token: session.access_token,
                  booking_id: booking.id,
                  client_id: user.id,
                  scheduled_date: newDate,
                  scheduled_time: newTime,
                }),
              });
              if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                showToast(err.error || 'Could not reschedule.', 'error');
                btn.textContent = 'Confirm reschedule';
                btn.disabled = false;
                return;
              }
              booking.scheduled_date = newDate;
              booking.scheduled_time = newTime;
              overlay.remove();
              renderList(tab);
              showToast('Booking rescheduled!');
            });
          });
        }
      });
    });

    if (tab === 'history') {
      list.querySelectorAll('.booking-card').forEach((card) => {
        const booking = filtered.find((b) => String(b.id) === card.dataset.bookingId);
        if (booking?.status === 'completed' && !booking.rating) {
          card.insertAdjacentHTML(
            'afterend',
            `<button class="btn btn--secondary btn--full" data-rebook style="margin-top:calc(-1 * var(--space-2))">Book Again</button>`
          );
        }
      });
      list.querySelectorAll('[data-rebook]').forEach((btn) => {
        btn.addEventListener('click', () => router.navigate('book-service'));
      });
    }
  }

  renderList(_bookingsTab);

  screen.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      screen.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      _bookingsTab = btn.dataset.tab;
      renderList(_bookingsTab);
    });
  });
}

// ── Profile + Referral ────────────────────────────────────────────────
async function renderProfile() {
  const screen = document.querySelector('[data-screen="profile"]');
  if (!screen) return;

  let user = null;
  try {
    const { data } = await sb.auth.getUser();
    user = data?.user || null;
  } catch {}
  if (!user) {
    router.navigate('login');
    return;
  }

  const name = user.user_metadata?.full_name || user.email;
  const refCode = 'DBK' + (user.id || '').replace(/-/g, '').slice(0, 5).toUpperCase();

  let credits = 0,
    referralCount = 0,
    membershipStatus = null,
    membershipPlan = null;
  try {
    const { data: profile } = await sb
      .from('profiles')
      .select(
        'referral_code, referral_credits, referral_count, membership_status, membership_plan, membership_started_at'
      )
      .eq('id', user.id)
      .single();
    if (profile) {
      credits = profile.referral_credits || 0;
      referralCount = profile.referral_count || 0;
      membershipStatus = profile.membership_status || null;
      membershipPlan = profile.membership_plan || null;
      if (!profile.referral_code)
        await sb
          .from('profiles')
          .update({ referral_code: refCode })
          .eq('id', user.id)
          .catch(() => {});
    }
  } catch {}

  const shareMsg = encodeURIComponent(
    'Get $15 off your first Dr. Bike Sydney service! Use my code ' +
      refCode +
      ' at checkout. Book at https://drbikesydney.com.au'
  );

  let completedJobs = 0;
  try {
    const myBookings = await getMyBookings();
    completedJobs = (myBookings || []).filter((b) => b.status === 'completed').length;
  } catch {}
  const riderTier = getRiderTier(completedJobs);

  screen.innerHTML = `
    ${createHeader('Profile', false)}
    <div class="profile-wrap">
      <div class="mechanic-avatar" style="width:72px;height:72px;margin:var(--space-6) auto var(--space-3)">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
      <div class="fw-600 text-center">${name}</div>
      <div class="text-secondary text-sm text-center">${user.email}</div>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;margin-top:16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="font-size:26px">${riderTier.emoji}</span>
          <div>
            <div style="font-size:14px;font-weight:700;color:#0D1F3C">${riderTier.label}</div>
            <div style="font-size:12px;color:#6B7280">${completedJobs} service${completedJobs === 1 ? '' : 's'} completed</div>
          </div>
        </div>
        ${
          riderTier.nextAt
            ? `<div style="height:6px;background:#F3F4F6;border-radius:4px;overflow:hidden;margin-bottom:6px">
                 <div style="height:100%;width:${riderTier.progressPct}%;background:${riderTier.color};border-radius:4px"></div>
               </div>
               <div style="font-size:12px;color:#6B7280">${riderTier.nextAt - completedJobs} more service${riderTier.nextAt - completedJobs === 1 ? '' : 's'} to reach ${riderTier.nextLabel}</div>`
            : `<div style="font-size:12px;color:#6B7280">You've reached our highest tier — thank you for riding with us!</div>`
        }
      </div>

      <div style="background:linear-gradient(135deg,#1E40AF,#1E3A8A);border-radius:16px;padding:20px;margin:20px 0;text-align:center">
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">Your referral code</div>
        <div id="ref-code-display" style="font-size:28px;font-weight:900;color:#fff;letter-spacing:0.18em;margin-bottom:4px">${refCode}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-bottom:16px">You and your friend each get $15 off</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button id="copy-code-btn" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer">Copy code</button>
          <a href="https://wa.me/?text=${shareMsg}" target="_blank" style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:6px">📱 Share</a>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div style="background:#EFF6FF;border-radius:12px;padding:16px;text-align:center;border:1px solid #BFDBFE">
          <div style="font-size:28px;font-weight:800;color:#1E40AF">${referralCount}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px;font-weight:600">Friends referred</div>
        </div>
        <div style="background:#F0FDF4;border-radius:12px;padding:16px;text-align:center;border:1px solid #BBF7D0">
          <div style="font-size:28px;font-weight:800;color:#16A34A">$${credits}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px;font-weight:600">Credits earned</div>
        </div>
      </div>

      <div style="background:#F8FAFC;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #E2E8F0">
        <div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:10px">How it works</div>
        <div style="font-size:13px;color:#475569;line-height:1.8">
          1. Share your code with friends<br>
          2. They get $15 off their first service<br>
          3. You get $15 credit when they book
        </div>
      </div>

      ${
        membershipPlan &&
        membershipStatus &&
        !['cancelled', 'inactive', 'none'].includes(membershipStatus)
          ? (() => {
              const PLAN_COLORS = { basic: '#0A58CA', standard: '#2563EB', vip: '#7C3AED' };
              const planColor = PLAN_COLORS[membershipPlan] || '#2563EB';
              const planLabel = membershipPlan.charAt(0).toUpperCase() + membershipPlan.slice(1);
              const isPaused = membershipStatus === 'paused';
              const statusBadge = isPaused
                ? '<span style="background:rgba(255,255,255,0.2);color:#fff;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">Paused</span>'
                : '<span style="background:rgba(255,255,255,0.2);color:#fff;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px"><span style="width:6px;height:6px;border-radius:50%;background:#4ADE80;display:inline-block"></span>Active</span>';
              return `<div style="margin-bottom:20px">
          <div style="background:linear-gradient(135deg,${planColor},#1848C8);border-radius:16px;padding:18px;color:#fff;margin-bottom:10px">
            <div style="font-size:11px;font-weight:700;opacity:0.7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Membership</div>
            <div style="font-size:20px;font-weight:800">${planLabel} Plan</div>
            <div style="margin-top:8px">${statusBadge}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button id="membership-toggle-btn" style="flex:1;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid ${isPaused ? '#059669' : '#D97706'};color:${isPaused ? '#059669' : '#D97706'};background:#fff">
              ${isPaused ? 'Resume membership' : 'Pause membership'}
            </button>
            <button id="membership-cancel-btn" style="flex:1;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid #E5E7EB;color:#6B7280;background:#fff">Cancel</button>
          </div>
        </div>`;
            })()
          : ''
      }

      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Language</div>
        <div style="display:flex;gap:8px" id="lang-switcher">
          ${LANGUAGES.map(
            (l) =>
              `<button data-lang="${l.code}" class="lang-btn" style="flex:1;padding:10px 8px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid ${l.code === getLang() ? '#2563EB' : '#E5E7EB'};background:${l.code === getLang() ? '#EFF6FF' : '#fff'};color:${l.code === getLang() ? '#2563EB' : '#374151'}">${l.label}</button>`
          ).join('')}
        </div>
      </div>

      <button class="btn btn--secondary btn--full" id="signout-btn">Sign Out</button>
      <div style="display:flex;gap:24px;justify-content:center;margin-top:24px;padding-top:20px;border-top:1px solid var(--color-border)">
        <a href="/terms.html" style="font-size:13px;color:var(--color-text-secondary);text-decoration:none">Terms &amp; Conditions</a>
        <a href="/privacy.html" style="font-size:13px;color:var(--color-text-secondary);text-decoration:none">Privacy Policy</a>
      </div>
    </div>
    ${createBottomNav('profile')}
  `;

  screen.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      renderProfile();
    });
  });

  screen.querySelector('#copy-code-btn').addEventListener('click', () => {
    navigator.clipboard
      .writeText(refCode)
      .then(() => showToast('Code copied!', 'success'))
      .catch(() => showToast(refCode + ' - copy manually', 'success'));
  });

  screen.querySelector('#signout-btn').addEventListener('click', async () => {
    await sb.auth.signOut().catch(() => {});
    showToast('Signed out successfully', 'success');
    router.navigate('home');
  });

  // Membership pause/resume/cancel
  const toggleBtn = screen.querySelector('#membership-toggle-btn');
  const cancelBtn = screen.querySelector('#membership-cancel-btn');
  const isPaused = membershipStatus === 'paused';

  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      toggleBtn.disabled = true;
      toggleBtn.textContent = isPaused ? 'Resuming...' : 'Pausing...';
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        const endpoint = isPaused ? '/api/resume-subscription' : '/api/pause-subscription';
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: session?.access_token }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast(isPaused ? 'Membership resumed' : 'Membership paused', 'success');
        renderProfile();
      } catch (e) {
        showToast(e.message || 'Something went wrong', 'error');
        toggleBtn.disabled = false;
        toggleBtn.textContent = isPaused ? 'Resume membership' : 'Pause membership';
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (
        !confirm(
          'Cancel your membership? It will stay active until the end of the current billing period.'
        )
      )
        return;
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling...';
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        const resp = await fetch('/api/cancel-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: session?.access_token }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast('Membership will cancel at period end', 'success');
        renderProfile();
      } catch (e) {
        showToast(e.message || 'Something went wrong', 'error');
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Cancel';
      }
    });
  }
}

// ── My Bikes screen (task 1.3) ───────────────────────────────────────────────
async function renderMyBikes() {
  const screen = document.querySelector('[data-screen="my-bikes"]');
  if (!screen) return;

  let user = null;
  try {
    const { data } = await sb.auth.getUser();
    user = data?.user || null;
  } catch {}
  if (!user) {
    router.navigate('login');
    return;
  }

  screen.innerHTML = `
    ${createHeader('My Bikes', false)}
    <div class="profile-wrap">
      <div id="predicted-service-card" style="margin-bottom:16px"></div>
      <div id="bikes-list" style="margin-bottom:16px">
        <div style="text-align:center;padding:40px 0;color:var(--color-text-secondary)">
          <div style="width:88px;height:88px;border-radius:20px;background:#2563EB;display:flex;align-items:center;justify-content:center;margin:0 auto;opacity:0.5">
            <span style="display:inline-block;width:56px;height:38px;background-color:#fff;-webkit-mask:url('images/bike-icon.png') center/contain no-repeat;mask:url('images/bike-icon.png') center/contain no-repeat"></span>
          </div>
          <div style="margin-top:12px;font-size:14px">Loading bikes...</div>
        </div>
      </div>
      <button class="btn btn--primary btn--full" id="add-bike-btn">+ Add a Bike</button>

      <!-- Add bike form (hidden by default) -->
      <div id="add-bike-form" style="display:none;margin-top:20px;background:var(--color-surface);border-radius:16px;padding:20px;border:1px solid var(--color-border)">
        <div style="font-size:15px;font-weight:700;margin-bottom:16px">New Bike</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <input id="bike-nickname" type="text" placeholder="Name (e.g. Red Trek)*" maxlength="60"
            style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:16px;outline:none"/>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <input id="bike-brand" type="text" placeholder="Brand" maxlength="40"
              style="min-width:0;background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:16px;outline:none"/>
            <input id="bike-model" type="text" placeholder="Model" maxlength="40"
              style="min-width:0;background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:16px;outline:none"/>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <input id="bike-color" type="text" placeholder="Color" maxlength="30"
              style="min-width:0;background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:16px;outline:none"/>
            <input id="bike-year" type="number" placeholder="Year" min="1990" max="2030"
              style="min-width:0;background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:16px;outline:none"/>
          </div>
          <select id="bike-type"
            style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:16px;outline:none;appearance:none">
            <option value="">Type (optional)</option>
            <option value="road">Road</option>
            <option value="mtb">Mountain Bike</option>
            <option value="hybrid">Hybrid</option>
            <option value="ebike">E-Bike</option>
            <option value="cargo">Cargo</option>
            <option value="folding">Folding</option>
          </select>
          <div id="bike-form-error" style="font-size:12px;color:var(--color-error);min-height:16px"></div>
          <div style="display:flex;gap:10px">
            <button id="cancel-bike-btn" class="btn btn--secondary" style="flex:1">Cancel</button>
            <button id="save-bike-btn" class="btn btn--primary" style="flex:1">Save Bike</button>
          </div>
        </div>
      </div>
    </div>
    ${createBottomNav('my-bikes')}
  `;

  // Load bikes
  async function loadBikes() {
    const list = screen.querySelector('#bikes-list');
    try {
      const { data, error } = await sb
        .from('bikes')
        .select('id, name, brand, model, color, year, type, created_at')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        list.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--color-text-secondary)">
          <div style="width:88px;height:88px;border-radius:20px;background:#2563EB;display:flex;align-items:center;justify-content:center;margin:0 auto">
            <span style="display:inline-block;width:56px;height:38px;background-color:#fff;-webkit-mask:url('images/bike-icon.png') center/contain no-repeat;mask:url('images/bike-icon.png') center/contain no-repeat"></span>
          </div>
          <div style="margin-top:14px;font-size:14px">No bikes added yet</div>
          <div style="font-size:12px;margin-top:4px;opacity:0.7">Add your first bike below</div>
        </div>`;
        return;
      }
      const TYPE_LABELS = {
        road: 'Road',
        mtb: 'MTB',
        hybrid: 'Hybrid',
        ebike: 'E-Bike',
        cargo: 'Cargo',
        folding: 'Folding',
      };
      list.innerHTML = data
        .map(
          (bike) => `
        <div data-bike-id="${bike.id}" style="cursor:pointer;background:var(--color-surface);border-radius:14px;padding:16px;margin-bottom:12px;border:1px solid var(--color-border);display:flex;align-items:center;gap:14px">
          <div style="width:44px;height:44px;border-radius:12px;background:var(--color-primary-alpha,rgba(10,88,202,0.12));display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="display:inline-block;width:26px;height:18px;background-color:var(--color-primary);-webkit-mask:url('images/bike-icon.png') center/contain no-repeat;mask:url('images/bike-icon.png') center/contain no-repeat"></span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px">${bike.name}</div>
            <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px">
              ${[bike.brand, bike.model, bike.color, bike.year, TYPE_LABELS[bike.type]].filter(Boolean).join(' · ') || 'No details'}
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      `
        )
        .join('');
      list.querySelectorAll('[data-bike-id]').forEach((card) => {
        card.addEventListener('click', () => {
          const bikeId = card.dataset.bikeId;
          const bike = data.find((b) => String(b.id) === bikeId);
          if (!bike) return;
          const overlay = document.createElement('div');
          overlay.style.cssText =
            'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center';
          overlay.innerHTML = `
            <div style="background:var(--color-bg);border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
                <div style="font-size:17px;font-weight:700">${bike.name}</div>
                <div style="font-size:11px;color:var(--color-text-secondary)">${TYPE_LABELS[bike.type] || ''}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
                ${[
                  ['Brand', bike.brand],
                  ['Model', bike.model],
                  ['Color', bike.color],
                  ['Year', bike.year],
                ]
                  .filter((r) => r[1])
                  .map(
                    (r) =>
                      `<div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--color-text-secondary)">${r[0]}</span><span style="font-weight:500">${r[1]}</span></div>`
                  )
                  .join('')}
              </div>
              <div id="health-section" style="margin-bottom:20px">
                <div style="height:1px;background:var(--color-border);margin-bottom:16px"></div>
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-secondary);margin-bottom:12px">Bike Health Score</div>
                <div class="skeleton" style="height:44px"></div>
              </div>
              <div id="history-section" style="margin-bottom:20px">
                <div style="height:1px;background:var(--color-border);margin-bottom:16px"></div>
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-secondary);margin-bottom:12px">Service history</div>
                <div id="history-list"><div class="skeleton" style="height:36px;margin-bottom:6px"></div><div class="skeleton" style="height:36px"></div></div>
              </div>
              <button id="delete-bike-btn" class="btn btn--secondary btn--full" style="margin-bottom:10px;color:var(--color-error);border-color:var(--color-error)">Delete bike</button>
              <button id="close-bike-btn" class="btn btn--secondary btn--full">Close</button>
            </div>
          `;
          screen.appendChild(overlay);
          overlay
            .querySelector('#close-bike-btn')
            .addEventListener('click', () => overlay.remove());
          overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
          });

          // Per-bike service history (bookings linked via bike_id)
          (async () => {
            const hEl = overlay.querySelector('#history-list');
            if (!hEl) return;
            try {
              const { data: hist } = await sb
                .from('bookings')
                .select('service_name, scheduled_date, service_price, status')
                .eq('bike_id', bike.id)
                .eq('client_id', user.id)
                .neq('status', 'cancelled')
                .order('scheduled_date', { ascending: false })
                .limit(20);
              if (!hist || !hist.length) {
                hEl.innerHTML = 'No services yet for this bike';
                return;
              }
              const SC = {
                completed: '#6B7280',
                confirmed: '#0A58CA',
                pending: '#F59E0B',
                enroute: '#22C55E',
                in_progress: '#22C55E',
              };
              hEl.style.textAlign = 'left';
              hEl.style.padding = '0';
              hEl.innerHTML = hist
                .map(
                  (b) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border)">
                  <div style="min-width:0">
                    <div style="font-size:13px;font-weight:600;color:var(--color-text)">${b.service_name || 'Service'}</div>
                    <div style="font-size:11px;color:var(--color-text-secondary);margin-top:2px">${b.scheduled_date || ''} · <span style="color:${SC[b.status] || '#6B7280'};font-weight:600">${(b.status || '').replace('_', ' ')}</span></div>
                  </div>
                  <div style="font-size:13px;font-weight:700;flex-shrink:0">$${b.service_price || 0}</div>
                </div>`
                )
                .join('');
            } catch (e) {
              hEl.innerHTML = 'Could not load history';
            }
          })();

          overlay.querySelector('#delete-bike-btn').addEventListener('click', async () => {
            if (!confirm('Delete this bike?')) return;
            const { error } = await sb
              .from('bikes')
              .delete()
              .eq('id', bikeId)
              .eq('client_id', user.id);
            if (error) {
              showToast('Could not delete bike. Try again.', 'error');
              return;
            }
            overlay.remove();
            loadBikes();
          });

          // Load bike health score from most recent completed booking with a checklist
          (async () => {
            const healthEl = overlay.querySelector('#health-section');
            if (!healthEl) return;
            try {
              const { data: bkgs } = await sb
                .from('bookings')
                .select('pre_service_checklist, scheduled_date, service_name')
                .eq('client_id', user.id)
                .eq('status', 'completed')
                .not('pre_service_checklist', 'is', null)
                .order('scheduled_date', { ascending: false })
                .limit(1);

              if (!bkgs?.length || !bkgs[0].pre_service_checklist) {
                healthEl.querySelector('div:last-child').textContent = 'No service data yet';
                return;
              }
              let checklist;
              try {
                checklist = JSON.parse(bkgs[0].pre_service_checklist);
              } catch {
                return;
              }

              const COMP_LABELS = {
                brakes_front: 'Front brakes',
                brakes_rear: 'Rear brakes',
                chain: 'Chain',
                cassette: 'Cassette',
                chainring: 'Chainrings',
                cables: 'Cables',
                wheels: 'Wheels',
                tyres: 'Tyres',
                handlebar: 'Handlebar',
                seatpost: 'Seatpost',
                headset: 'Headset',
                bb: 'Bottom bracket',
                lights: 'Lights',
                general: 'Frame',
              };
              const SCORE = { ok: 100, warn: 50, critical: 0 };
              const COLOR = { ok: '#059669', warn: '#D97706', critical: '#DC2626' };
              const LABEL = { ok: 'OK', warn: 'Warn', critical: 'Critical' };

              const scored = Object.entries(COMP_LABELS)
                .map(([id, lbl]) => ({ id, lbl, status: checklist[id] }))
                .filter((c) => c.status && SCORE[c.status] !== undefined);

              if (!scored.length) {
                healthEl.querySelector('div:last-child').textContent = 'No checklist data';
                return;
              }

              const avg = Math.round(
                scored.reduce((s, c) => s + SCORE[c.status], 0) / scored.length
              );
              const scoreColor = avg >= 75 ? '#059669' : avg >= 50 ? '#D97706' : '#DC2626';
              const scoreLabel =
                avg >= 75 ? 'Good' : avg >= 50 ? 'Needs attention' : 'Critical issues';
              const lastDate = new Date(bkgs[0].scheduled_date).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              healthEl.innerHTML = `
                <div style="height:1px;background:var(--color-border);margin-bottom:16px"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-secondary)">Bike Health Score</div>
                  <div style="font-size:10px;color:var(--color-text-secondary)">Last service: ${lastDate}</div>
                </div>
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
                  <div style="width:64px;height:64px;flex-shrink:0;position:relative">
                    <svg viewBox="0 0 36 36" style="width:64px;height:64px;transform:rotate(-90deg)">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-border)" stroke-width="3"/>
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="${scoreColor}" stroke-width="3"
                        stroke-dasharray="${avg} ${100 - avg}" stroke-dashoffset="0" stroke-linecap="round"/>
                    </svg>
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:${scoreColor}">${avg}%</div>
                  </div>
                  <div>
                    <div style="font-size:17px;font-weight:700;color:${scoreColor}">${scoreLabel}</div>
                    <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px">${scored.length} components checked</div>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  ${scored
                    .map(
                      (c) => `
                    <div style="display:flex;align-items:center;gap:10px">
                      <div style="width:8px;height:8px;border-radius:50%;background:${COLOR[c.status]};flex-shrink:0"></div>
                      <div style="flex:1;font-size:13px;color:var(--color-text)">${c.lbl}</div>
                      <div style="font-size:11px;font-weight:600;color:${COLOR[c.status]}">${LABEL[c.status]}</div>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `;
            } catch {
              healthEl.querySelector('div:last-child').textContent = 'Could not load health data';
            }
          })();
        });
      });
    } catch (e) {
      list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--color-error);font-size:13px">Failed to load bikes</div>`;
    }
  }

  // Predictive maintenance: estimate the next service date from the client's own
  // history (average gap between past completed services) rather than relying
  // only on whatever the mechanic manually noted on the last job.
  async function loadPredictedService() {
    const card = screen.querySelector('#predicted-service-card');
    if (!card) return;
    let bookings = [];
    try {
      bookings = await getMyBookings();
    } catch {
      return;
    }
    const completedDates = (bookings || [])
      .filter((b) => b.status === 'completed' && b.scheduled_date)
      .map((b) => new Date(b.scheduled_date))
      .sort((a, b) => a - b);

    if (completedDates.length < 2) return; // not enough history to predict yet

    let totalDays = 0;
    for (let i = 1; i < completedDates.length; i++) {
      totalDays += (completedDates[i] - completedDates[i - 1]) / 86400000;
    }
    const avgDays = Math.round(totalDays / (completedDates.length - 1));
    const lastDate = completedDates[completedDates.length - 1];
    const predicted = new Date(lastDate.getTime() + avgDays * 86400000);
    const daysUntil = Math.round((predicted - new Date()) / 86400000);
    const dateLabel = predicted.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const overdue = daysUntil < 0;
    card.innerHTML = `
      <div style="background:${overdue ? '#FFFBEB' : '#EFF6FF'};border:1px solid ${overdue ? '#FCD34D' : '#BFDBFE'};border-radius:14px;padding:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:18px">${overdue ? '⚠️' : '📊'}</span>
          <span style="font-size:13px;font-weight:700;color:#0D1F3C">${overdue ? "You're likely due for a service" : 'Predicted next service'}</span>
        </div>
        <div style="font-size:13px;color:#374151;line-height:1.5">
          ${
            overdue
              ? `Based on your history (services roughly every ${avgDays} days), you were due around <b>${dateLabel}</b>.`
              : `Based on your history (services roughly every ${avgDays} days), you'll likely need your next service around <b>${dateLabel}</b>.`
          }
        </div>
      </div>`;
  }

  loadBikes();
  loadPredictedService();

  // Add bike form toggle
  screen.querySelector('#add-bike-btn').addEventListener('click', () => {
    screen.querySelector('#add-bike-form').style.display = 'block';
    screen.querySelector('#add-bike-btn').style.display = 'none';
    screen.querySelector('#bike-nickname').focus();
  });
  screen.querySelector('#cancel-bike-btn').addEventListener('click', () => {
    screen.querySelector('#add-bike-form').style.display = 'none';
    screen.querySelector('#add-bike-btn').style.display = 'block';
  });

  screen.querySelector('#save-bike-btn').addEventListener('click', async () => {
    const errEl = screen.querySelector('#bike-form-error');
    const nickname = (screen.querySelector('#bike-nickname').value || '').trim();
    if (!nickname) {
      errEl.textContent = 'Nickname is required';
      return;
    }
    errEl.textContent = '';
    const btn = screen.querySelector('#save-bike-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const { error } = await sb.from('bikes').insert({
        client_id: user.id,
        name: nickname.slice(0, 60),
        brand: (screen.querySelector('#bike-brand').value || '').trim().slice(0, 40) || null,
        model: (screen.querySelector('#bike-model').value || '').trim().slice(0, 40) || null,
        color: (screen.querySelector('#bike-color').value || '').trim().slice(0, 30) || null,
        year: parseInt(screen.querySelector('#bike-year').value) || null,
        type: screen.querySelector('#bike-type').value || null,
      });
      if (error) throw error;
      showToast('Bike added!', 'success');
      screen.querySelector('#add-bike-form').style.display = 'none';
      screen.querySelector('#add-bike-btn').style.display = 'block';
      // Reset form
      ['bike-nickname', 'bike-brand', 'bike-model', 'bike-color', 'bike-year'].forEach((id) => {
        screen.querySelector('#' + id).value = '';
      });
      screen.querySelector('#bike-type').value = '';
      loadBikes();
    } catch (e) {
      errEl.textContent = e?.message || 'Could not save bike. Try again.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Bike';
    }
  });
}

async function updateHomeNav() {
  const btn = document.getElementById('home-nav-auth-btn');
  if (!btn) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    const label = btn.querySelector('span');
    if (user) {
      const name = (user.user_metadata?.full_name || user.email || '').split('@')[0].split(' ')[0];
      if (label) label.textContent = 'Hi, ' + name;
      btn.href = '#profile';
    } else {
      if (label) label.textContent = 'Sign In';
      btn.href = '#login';
    }
  } catch {}
}

// ── Screen event router ───────────────────────────────────────────────────────
document.addEventListener('screenchange', ({ detail }) => {
  if (window.gtag)
    gtag('event', 'page_view', { page_title: detail.route, page_location: '/#' + detail.route });
  if (detail.prev === 'tracking' && detail.route !== 'tracking') cleanupTracking();
  if (detail.prev === 'payment' && detail.route !== 'payment') {
    destroyPaymentForm();
    if (window.appState.bookingId && detail.route !== 'tracking') {
      if (window.gtag)
        gtag('event', 'booking_abandoned', {
          currency: 'AUD',
          value: window.appState.service?.price || 0,
          items: [{ item_name: window.appState.service?.name }],
        });
    }
  }
  if (detail.route === 'book-service') renderBookService();
  if (detail.route === 'service-summary') renderServiceSummary();
  if (detail.route === 'payment') renderPayment();
  if (detail.route === 'tracking') renderTracking();
  if (detail.route === 'review') renderReview();
  if (detail.route === 'login') renderLogin();
  if (detail.route === 'my-bookings') renderMyBookings();
  if (detail.route === 'profile') renderProfile();
  if (detail.route === 'my-bikes') renderMyBikes();
  if (detail.route === 'home') updateHomeNav();
});

// ── AI Bike Diagnosis ────────────────────────────────────────────────────────
async function runAIDiagnosis(screen) {
  const input = screen.querySelector('#diag-photo');
  if (!input || !input.files[0]) return;
  const file = input.files[0];
  const resultEl = screen.querySelector('#diag-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML =
    '<div style="font-size:12px;color:var(--color-text-secondary)">&#128269; Analysing your photo...</div>';
  try {
    const dataUrl = await compressImageToBase64(file);
    const base64 = dataUrl.split(',')[1];
    const resp = await fetch('/api/chat?type=diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
    });
    showDiagResult(screen, await resp.json());
  } catch {
    resultEl.innerHTML =
      '<div style="font-size:12px;color:var(--color-error)">Could not analyse photo. Please describe the problem instead.</div>';
  }
}

async function runAIDiagnosisText(screen) {
  const text = screen.querySelector('#diag-text')?.value?.trim() || '';
  if (!text) return;
  const resultEl = screen.querySelector('#diag-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML =
    '<div style="font-size:12px;color:var(--color-text-secondary)">&#128269; Analysing...</div>';
  try {
    const resp = await fetch('/api/chat?type=diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text }),
    });
    showDiagResult(screen, await resp.json());
  } catch {
    resultEl.innerHTML =
      '<div style="font-size:12px;color:var(--color-error)">Could not process. Please select a service manually.</div>';
  }
}

function showDiagResult(screen, data) {
  const resultEl = screen.querySelector('#diag-result');
  if (!resultEl) return;
  const sev = data.severity || 'medium';
  const sevColor = sev === 'high' ? '#DC2626' : sev === 'low' ? '#059669' : '#D97706';
  const urgColor =
    data.urgency === 'Urgent' ? '#DC2626' : data.urgency === 'Book soon' ? '#D97706' : '#059669';
  const bookLabel = data.recommended_service_name
    ? 'Book ' +
      data.recommended_service_name +
      (data.recommended_service_price ? ' - $' + data.recommended_service_price : '') +
      ' →'
    : '';
  const bookHtml =
    data.recommended_service_id && bookLabel
      ? `<button id="diag-book-btn" style="width:100%;margin-top:10px;background:var(--color-primary);color:#fff;border:none;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;text-align:left">${bookLabel}</button>`
      : '';
  resultEl.innerHTML = `
    <div style="background:var(--color-bg);border-radius:8px;padding:12px;border:1px solid var(--color-border)">
      <div style="font-size:12px;font-weight:700;color:var(--color-text);margin-bottom:6px">&#129302; AI Recommendation</div>
      <div style="font-size:12px;color:var(--color-text);margin-bottom:8px">${data.diagnosis || 'Bike issue detected'}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:11px;color:${sevColor};font-weight:600">${sev.charAt(0).toUpperCase() + sev.slice(1)} severity</span>
        <span style="color:var(--color-border)">&#183;</span>
        <span style="font-size:11px;color:${urgColor};font-weight:600">${data.urgency || 'Book soon'}</span>
        ${data.details ? `<span style="color:var(--color-border)">&#183;</span><span style="font-size:11px;color:var(--color-text-secondary)">${data.details}</span>` : ''}
      </div>
      ${bookHtml}
    </div>`;
  const bookBtn = resultEl.querySelector('#diag-book-btn');
  if (bookBtn) {
    bookBtn.addEventListener('click', () => {
      const card = screen.querySelector(
        `.service-card[data-service-id="${data.recommended_service_id}"]`
      );
      if (card) {
        card.click();
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }
}

function autoSelectService(screen, serviceId) {
  const card = screen.querySelector(`.service-card[data-service-id="${serviceId}"]`);
  if (card) {
    card.click();
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Auto-apply pending referral code after login
sb.auth.onAuthStateChange(async (event, session) => {
  if (event !== 'SIGNED_IN' || !session) return;
  const pendingRef = localStorage.getItem('dbs_pending_ref');
  if (!pendingRef) return;
  localStorage.removeItem('dbs_pending_ref');
  try {
    const resp = await fetch('/api/auth?role=apply-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session.access_token, referral_code: pendingRef }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok)
      showToast('$' + data.credit + ' referral credit added to your account!', 'success');
  } catch {}
});

router.init();
document.dispatchEvent(new Event('routerinit'));
updateHomeNav();
if (window._pendingReview) {
  setTimeout(() => router.navigate('review'), 200);
}

// i18n: translate every screen whenever its content changes, instead of
// threading a translateScreen() call through every render function. Also
// re-translates all screens immediately when the user switches language.
document.querySelectorAll('[data-screen]').forEach((screen) => {
  translateScreen(screen);
  const observer = new MutationObserver(() => translateScreen(screen));
  observer.observe(screen, { childList: true, subtree: true });
});
document.addEventListener('langchange', () => {
  document.querySelectorAll('[data-screen]').forEach((screen) => translateScreen(screen));
});
