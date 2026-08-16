// ── Sunday / NSW public holiday surcharge (+20%) ────────────────────────────
// Display-side mirror of the authoritative copy in api/auth.js (isSurchargeDay
// / applySurcharge) - the server recomputes both prices in handleCreateBooking
// and verifies the Stripe charge against ITS number, so these two lists must
// stay in sync or Sunday/holiday payments will be rejected as amount mismatch.
// Saturday is deliberately normal price (Diego's rule, 12 Jul 2026).
const NSW_PUBLIC_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-26', // Australia Day
  '2026-04-03', // Good Friday
  '2026-04-04', // Easter Saturday
  '2026-04-05', // Easter Sunday
  '2026-04-06', // Easter Monday
  '2026-04-25', // Anzac Day
  '2026-04-27', // Anzac Day additional public holiday
  '2026-06-08', // King's Birthday
  '2026-10-05', // Labour Day
  '2026-12-25', // Christmas Day
  '2026-12-26', // Boxing Day
  '2026-12-28', // Boxing Day additional public holiday
];
const SURCHARGE_MULTIPLIER = 1.2;

function isSurchargeDay(dateStr) {
  const [Y, Mo, D] = String(dateStr || '')
    .split('-')
    .map(Number);
  if (!Y || !Mo || !D) return false;
  if (new Date(Y, Mo - 1, D).getDay() === 0) return true; // Sunday
  return NSW_PUBLIC_HOLIDAYS_2026.includes(dateStr);
}

function applySurcharge(amount, dateStr) {
  if (!isSurchargeDay(dateStr)) return amount;
  return Math.round(amount * SURCHARGE_MULTIPLIER * 100) / 100;
}
// ───────────────────────────────────────────────────────────────────────────

import router from './router.js';
import {
  sb,
  getServices,
  getAvailableSlots,
  getCalloutFee,
  submitReview,
  signIn,
  signUp,
  getMyBookings,
  bookingsTruncated,
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
  createBrandLoader,
  showToast,
  createTierBadge,
  confirmDialog,
} from './components.js';
import { getRiderTier } from './rider-tier.js';
import { toDbTime, toDisplayTime, sameTime } from './time-format.js';
import {
  getLang,
  setLang,
  translateScreen,
  translateValue,
  dateLocale,
  sourceOf,
  LANGUAGES,
} from './i18n.js';
import {
  createPaymentForm,
  createPaymentRequestButton,
  processPayment,
  confirmCardSetup,
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
  preferredMechanicId: null,
  // Service to auto-select when the wizard opens, as an id OR a name - the
  // landing page CTAs only know the name printed on the card they sit in.
  // Consumed and cleared by renderBookService()'s step 1.
  preselect: null,
};

const CHECKOUT_DRAFT_KEY = 'dbs_checkout_draft';

// ── The half-built booking ───────────────────────────────────────────────────
// window.appState lives in the page and nowhere else, so any full page load
// threw away everything the client had chosen. Moving between screens never
// did - that was measured - but a reload does, and there are several ways to
// cause one without meaning to: signing in with Google takes the whole page
// and comes back at /, iOS reloads a tab it evicted while you were in another
// app copying a code, a stray refresh. Diego lost a finished booking to this
// on the way to look up his referral code.
//
// localStorage, not sessionStorage: the OAuth round trip and an evicted tab
// both survive one and not the other.
const BOOKING_DRAFT_KEY = 'drbike-booking-draft';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Where to go back to after signing in. Set when the summary sends someone to
// create an account, so they land back on their booking instead of on the home
// screen wondering what happened to it. localStorage rather than session
// storage for the same reason as the draft above: the Google round trip
// reloads the whole page.
const RETURN_TO_KEY = 'drbike-return-to';

// Consumed once. If nothing was pending, signing in lands on home as before.
function goAfterLogin() {
  let dest = null;
  try {
    dest = localStorage.getItem(RETURN_TO_KEY);
    localStorage.removeItem(RETURN_TO_KEY);
  } catch {
    /* private mode: fall through to home */
  }
  router.navigate(dest || 'home');
}

function saveBookingDraft(step) {
  try {
    const { service, date, time, location, bikeId } = window.appState;
    if (!service && !date && !time) return; // nothing worth keeping yet
    localStorage.setItem(
      BOOKING_DRAFT_KEY,
      JSON.stringify({ service, date, time, location, bikeId, step, savedAt: Date.now() })
    );
  } catch {}
}

function loadBookingDraft() {
  try {
    const raw = localStorage.getItem(BOOKING_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    // A day-old draft is a different intention, and the slot it holds has
    // probably been taken by someone else.
    if (!d?.savedAt || Date.now() - d.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(BOOKING_DRAFT_KEY);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

function clearBookingDraft() {
  try {
    localStorage.removeItem(BOOKING_DRAFT_KEY);
  } catch {}
}

// Restored before the router runs, so the first screen already knows what the
// client had picked. The date is dropped if it has gone past - offering
// yesterday would be worse than offering nothing.
(function restoreBookingDraft() {
  const d = loadBookingDraft();
  if (!d) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const stillAhead = (ds) => {
    if (!ds) return false;
    const [y, m, day] = String(ds).split('-').map(Number);
    return new Date(y, (m || 1) - 1, day || 1) >= today;
  };
  window.appState.service = d.service || null;
  window.appState.date = stillAhead(d.date) ? d.date : null;
  window.appState.time = window.appState.date ? d.time || null : null;
  window.appState.location = d.location || 'Home';
  window.appState.bikeId = d.bikeId || null;
  window.__bookingDraftStep = window.appState.date && window.appState.time ? d.step : null;
})();

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
              client_lang: getLang(),
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
            translateValue(
              e.message || 'Payment could not be confirmed. Please contact us if you were charged.'
            )
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
// Bumped on every renderTracking() call so a stale call (superseded by a
// newer one before its own async setup finished - e.g. rapid double-nav to
// the tracking screen) can tell it's stale and bail instead of fighting the
// newer call over _trackingMap/DOM state.
let _trackingRenderSeq = 0;
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
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), {
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
  let slots;
  try {
    slots = await getAvailableSlots(date, serviceId);
  } catch (e) {
    grid.innerHTML =
      '<div style="grid-column:1/-1;padding:20px 0;text-align:center">' +
      '<div style="font-size:24px;margin-bottom:6px">⚠️</div>' +
      '<div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:4px">Could not load available times</div>' +
      '<div style="font-size:13px;color:var(--gray);margin-bottom:14px">Please check your connection and try again.</div>' +
      '<button id="retry-slots-btn" style="padding:11px 20px;background:var(--blue);color:var(--white);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Retry</button>' +
      '</div>';
    screen
      .querySelector('#retry-slots-btn')
      ?.addEventListener('click', () => loadTimeSlots(screen, date, serviceId));
    return;
  }
  const allBooked = slots.length > 0 && slots.every((s) => !s.available);
  if (allBooked) {
    grid.innerHTML =
      '<div style="grid-column:1/-1;padding:20px 0">' +
      '<div style="text-align:center;margin-bottom:16px">' +
      '<div style="font-size:24px;margin-bottom:6px">😔</div>' +
      '<div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:4px">Fully booked on this date</div>' +
      '<div style="font-size:13px;color:var(--gray)">Please choose another day or join the waitlist</div></div>' +
      '<button id="waitlist-btn" style="width:100%;padding:13px;background:var(--blue);color:var(--white);border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">' +
      '<span>Join Waitlist for</span> ' +
      date +
      '</button>' +
      '<div id="waitlist-form" style="display:none;margin-top:14px;background:var(--surface);border:1px solid #DBEAFE;border-radius:10px;padding:16px">' +
      '<div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:10px">Which times work for you?</div>' +
      '<div id="waitlist-times" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">' +
      slots
        .map(
          (s) =>
            '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--gray);cursor:pointer">' +
            '<input type="checkbox" value="' +
            s.time +
            '" style="accent-color:var(--blue)"> ' +
            s.time +
            '</label>'
        )
        .join('') +
      '</div>' +
      '<div id="waitlist-msg" style="font-size:13px;color:var(--red);margin-bottom:10px;display:none"></div>' +
      '<button id="waitlist-submit" style="width:100%;padding:12px;background:var(--green);color:var(--white);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Notify Me When a Slot Opens</button>' +
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
          '<div style="font-size:24px;margin-bottom:8px">✅</div>' +
          '<div style="font-weight:700;color:var(--green);font-size:15px">You\'re on the waitlist!</div>' +
          '<div style="font-size:13px;color:var(--gray);margin-top:4px"><span>We\'ll email</span> ' +
          user.email +
          ' <span>if a slot opens up on</span> ' +
          date +
          '.</div>' +
          '</div>';
      } catch (e) {
        msg.textContent = translateValue(e.message);
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
      saveBookingDraft('time');
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

// Tracks the in-flight load so two near-simultaneous callers (e.g. rapid
// double-navigation to the tracking screen) await the SAME promise instead
// of the second one seeing the <script> tag already in the DOM and
// resolving immediately, before window.L actually exists.
let _leafletLoadPromise = null;
async function loadLeaflet() {
  if (window.L) return;
  if (_leafletLoadPromise) return _leafletLoadPromise;
  _leafletLoadPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = Object.assign(document.createElement('link'), {
        id: 'leaflet-css',
        rel: 'stylesheet',
        href: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css',
      });
      document.head.appendChild(link);
    }
    const existing = document.querySelector('script[src*="leaflet"]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const s = Object.assign(document.createElement('script'), {
      src: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
    });
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  try {
    await _leafletLoadPromise;
  } finally {
    _leafletLoadPromise = null;
  }
}

// ── Book a Service (3-step wizard) ───────────────────────────────────────────
// Emergency Service (services table row, category "Scheduled services") is
// intercepted before it ever reaches the normal booking wizard - see the
// service-card click handler in renderStep1() below.
function showEmergencyServiceModal() {
  document.getElementById('emergency-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'emergency-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px';
  const waText = encodeURIComponent(
    'Hi Dr. Bike! I need emergency service - can you help me right away?'
  );
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px;padding:24px;width:100%;max-width:360px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px" aria-hidden="true">🚨</div>
      <div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:6px">Emergency Service</div>
      <div style="font-size:13px;color:var(--gray);margin-bottom:20px;line-height:1.5;text-align:left">Emergency visits depend on where our mechanic already is, so we confirm these directly - call or WhatsApp us and we'll tell you right away if we can help and what it'll cost.</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <a href="tel:+61433963250" style="flex:1;text-align:center;background:var(--blue);color:var(--white);padding:12px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none">📞 Call</a>
        <a href="https://wa.me/61433963250?text=${waText}" style="flex:1;text-align:center;background:var(--wa);color:var(--white);padding:12px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none">💬 WhatsApp</a>
      </div>
      <button id="emergency-modal-close" class="btn btn--secondary btn--full">Back to services</button>
    </div>
  `;
  document.body.appendChild(modal);
  translateScreen(modal); // outside [data-screen], not covered by the router's auto-translate observer
  modal.querySelector('#emergency-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Outside the function on purpose. Entering this screen can render it more
// than once, and a fresh call starting from null would paint skeletons over an
// error we already know about - leaving the reader with a spinner that never
// resolves, which is the exact thing this is here to stop.
let _servicesError = null;

async function renderBookService() {
  const screen = document.querySelector('[data-screen="book-service"]');
  if (!screen) return;
  if (window.gtag) gtag('event', 'begin_checkout');
  if (window.fbq) fbq('track', 'InitiateCheckout');
  sessionStorage.setItem('drbike-booking-start', String(Date.now()));
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
  const svgIco = (inner) =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const CAT_ICON = {
    'Scheduled services': svgIco(
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>'
    ),
    Brakes: svgIco(
      '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>'
    ),
    'Cockpit & levers': svgIco(
      '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>'
    ),
    Drivetrain: svgIco(
      '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="2"></circle>'
    ),
    'Gears & cables': svgIco(
      '<circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><line x1="7.5" y1="7.5" x2="16.5" y2="16.5"></line>'
    ),
    'Wheels & tyres': svgIco(
      '<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="3" x2="12" y2="21"></line><line x1="3" y1="12" x2="21" y2="12"></line>'
    ),
    'Electronic & e-bike': svgIco(
      '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>'
    ),
    Suspension: svgIco('<polyline points="3 12 8 12 10 6 14 18 16 12 21 12"></polyline>'),
    'General & assembly': svgIco(
      '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>'
    ),
  };

  // ── Step 1: Choose Service ────────────────────────────────────────────────
  // router.js scrolls the new screen to the top, but only when the route
  // actually changes. The wizard's three steps all re-render inside the same
  // book-service screen without touching the hash, so stepping 1->2->3 (or
  // back) left the reader wherever the previous step had put them - halfway
  // down a service list, or mid-calendar. Same intent as the router's call,
  // applied per step.
  function scrollStepToTop() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // On landing.html this screen is a fixed full-screen overlay with its own
    // scrollbar (css/landing.css), so scrollIntoView has nothing to scroll -
    // the step would open wherever the previous one was left.
    if (document.body.dataset.surface === 'landing') {
      screen.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    screen.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function renderStep1() {
    if (window.posthog) posthog.capture('booking_step_viewed', { step: 'select_service' });
    scrollStepToTop();
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
      : _servicesError
        ? // Skeletons that never resolve read as a frozen app. Say what
          // happened, and separate "no signal" from "our end broke" - the
          // reader can do something about the first one.
          `<div style="grid-column:1/-1;padding:24px 0;text-align:center">
             <div style="font-size:24px;margin-bottom:6px" aria-hidden="true">${navigator.onLine ? '⚠️' : '📡'}</div>
             <div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:4px">${navigator.onLine ? 'Could not load services' : "You're offline"}</div>
             <div style="font-size:13px;color:var(--gray);margin-bottom:14px">Please check your connection and try again.</div>
             <button id="retry-services-btn" style="padding:11px 20px;background:var(--blue);color:var(--white);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Retry</button>
           </div>`
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

    // Everything the client had picked is still here after a reload, but
    // making them click through three steps to find that out is its own kind
    // of loss. One tap back to where they were.
    const draftStep = window.__bookingDraftStep;
    const canResume =
      draftStep &&
      window.appState.service &&
      window.appState.date &&
      window.appState.time &&
      window.appState.location;
    const resumeHtml = canResume
      ? `<div id="resume-draft" style="display:flex;align-items:center;gap:12px;background:var(--blue-lt);border:1px solid var(--blue-edge);border-radius:12px;padding:12px 14px;margin:0 0 16px">
           <span style="font-size:20px" aria-hidden="true">↩️</span>
           <div style="flex:1;min-width:0">
             <div style="font-size:13px;font-weight:700;color:var(--blue-dark)">You have a booking in progress</div>
             <div style="font-size:12px;color:var(--gray);margin-top:2px">${escapeHtml(window.appState.service.name || '')}</div>
           </div>
           <button id="resume-draft-btn" style="flex-shrink:0;min-height:36px;padding:8px 14px;background:var(--blue-dark);color:var(--white);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Continue</button>
         </div>`
      : '';

    screen.innerHTML = `
      ${createHeader('Book a Service', true, '#home')}
      ${resumeHtml}
      <div id="diag-block" style="background:var(--blue-lt);border-radius:12px;padding:16px;margin:0 0 20px;border:1px solid var(--blue-edge)">
        <div style="font-size:13px;font-weight:700;color:var(--blue-dark);margin-bottom:6px">Not sure what your bike needs?</div>
        <div style="font-size:13px;color:var(--gray);margin-bottom:12px">Take a photo or describe the problem — our AI will recommend the right service.</div>
        <div style="display:flex;align-items:center;gap:8px;width:100%">
          <label style="flex-shrink:0;cursor:pointer">
            <input type="file" accept="image/*" capture="environment" id="diag-photo" style="display:none">
            <div id="diag-photo-btn" style="height:44px;display:inline-flex;align-items:center;gap:6px;background:white;border:1.5px solid var(--blue-edge);border-radius:8px;padding:0 12px;font-size:13px;font-weight:600;color:var(--blue-dark);cursor:pointer;white-space:nowrap">Photo</div>
          </label>
          <input type="text" id="diag-text" placeholder="Describe the problem..." aria-label="Describe the problem" style="flex:1;min-width:0;height:44px;border:1.5px solid var(--blue-edge);border-radius:8px;padding:0 12px;font-size:15px;outline:none;box-sizing:border-box;font-family:inherit;background:var(--white)">
          <button id="diag-ask-btn" style="flex-shrink:0;height:44px;background:var(--blue-dark);color:white;border:none;border-radius:8px;padding:0 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Ask AI</button>
        </div>
        <div id="diag-result" style="margin-top:10px;display:none"></div>
      </div>
      <div id="cat-chips" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:4px 0">
        ${CAT_ORDER.map((cat) => `<button class="cat-chip" data-cat="${cat}" style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;min-height:44px;background:var(--white);border:1px solid var(--border);border-radius:22px;padding:0 14px;font-size:13px;font-weight:600;cursor:pointer;color:var(--gray);font-family:inherit;white-space:nowrap;transition:all 150ms ease"><span aria-hidden="true">${CAT_ICON[cat] || ''}</span>${CAT_SHORT[cat]}</button>`).join('')}
      </div>
      <div class="section-label">Select Service</div>
      <div id="step1-services">${categoriesHtml}</div>
      <div id="bike-selector-wrap"></div>
      <div class="sticky-bottom">
        <button class="btn btn--primary btn--full" id="s1-continue" disabled>Continue</button>
      </div>
      ${createBottomNav('home')}
    `;

    screen.querySelector('#resume-draft-btn')?.addEventListener('click', () => {
      window.__bookingDraftStep = null; // one shot: taken, or dismissed by moving on
      router.navigate('service-summary');
    });

    const retryBtn = screen.querySelector('#retry-services-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        retryBtn.disabled = true;
        retryBtn.textContent = 'Loading...';
        try {
          _services = await getServices();
          _servicesError = null;
        } catch (e) {
          _servicesError = e;
        }
        renderStep1();
      });
    }

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
        const svc = (_services || []).find((s) => String(s.id) === card.dataset.serviceId);
        // Emergency Service skips the normal calendar/payment flow entirely -
        // availability and price depend on where the mechanic already is, so
        // Diego confirms these by phone/WhatsApp himself rather than through
        // an automated slot (Diego, 2026-07-22: "que lleve al numero de
        // contacto del administrador... asi el puede tomar la decision").
        if (svc?.name === 'Emergency Service') {
          showEmergencyServiceModal();
          return;
        }
        screen.querySelectorAll('.service-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        const prev = window.appState.service;
        window.appState.service = svc;
        saveBookingDraft('service');
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
            <button class="bike-chip active" data-bike-id="" style="flex-shrink:0;display:inline-flex;align-items:center;height:32px;background:var(--blue-dark);color:var(--white);border:1px solid var(--blue-dark);border-radius:16px;padding:0 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">Skip</button>
            ${bikes.map((b) => `<button class="bike-chip" data-bike-id="${b.id}" style="flex-shrink:0;display:inline-flex;align-items:center;height:32px;background:var(--white);border:1px solid var(--border);border-radius:16px;padding:0 14px;font-size:13px;font-weight:600;cursor:pointer;color:var(--gray);font-family:inherit;white-space:nowrap">${b.name}${b.brand ? ' · ' + b.brand : ''}</button>`).join('')}
          </div>`;
        wrap.querySelectorAll('.bike-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            wrap.querySelectorAll('.bike-chip').forEach((c) => {
              c.style.background = 'var(--white)';
              c.style.color = 'var(--gray)';
              c.style.borderColor = 'var(--border)';
            });
            chip.style.background = 'var(--blue-dark)';
            chip.style.color = 'var(--white)';
            chip.style.borderColor = 'var(--blue-dark)';
            window.appState.bikeId = chip.dataset.bikeId || null;
          });
        });
      } catch {}
    })();

    // Preselection, e.g. from a landing page service card. Only once the real
    // services are in - the first renderStep1() paints skeletons and has no
    // cards to match against. Resolves an id or a name, same as the old bk-
    // modal did, because the callers only have the name on screen.
    if (_services && window.appState.preselect) {
      const want = String(window.appState.preselect);
      window.appState.preselect = null; // one shot: don't re-fire on Back
      const svc = _services.find((s) => String(s.id) === want || s.name === want);
      const card = svc && screen.querySelector(`[data-service-id="${svc.id}"]`);
      // A real click rather than setting the state by hand, so preselection
      // inherits everything a click already does: the Emergency Service
      // interception, the add_to_cart event and the jump to step 2. A name
      // that matches nothing just leaves the list open on step 1.
      if (card) card.click();
    }
  }

  // ── Step 2: Date & Time ───────────────────────────────────────────────────
  async function renderStep2() {
    if (window.posthog) posthog.capture('booking_step_viewed', { step: 'select_date' });
    scrollStepToTop();
    if (!document.getElementById('cal-styles')) {
      const s = document.createElement('style');
      s.id = 'cal-styles';
      s.textContent = `
        .cal-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .cal-month{font-weight:700;font-size:15px;color:var(--color-text)}
        .cal-arrow{background:#fff;border:1px solid #E2E8F0;border-radius:8px;width:36px;height:36px;cursor:pointer;font-size:20px;color:#0D1F3C;display:flex;align-items:center;justify-content:center;line-height:1;transition:background 150ms ease}
        .cal-arrow:hover:not(:disabled){background:#F8FAFC}
        .cal-arrow:disabled{opacity:0.3;cursor:default}
        .cal-month{font-weight:800;font-size:15px;color:#0D1F3C}
        .cal-dow{text-align:center;font-size:11px;font-weight:700;color:#94A3B8;padding:4px 0;text-transform:uppercase;letter-spacing:0.05em}
        .cal-day{background:none;border:none;border-radius:8px;padding:9px 2px;font-size:15px;cursor:pointer;color:#0D1F3C;text-align:center;width:100%;transition:background 120ms}
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
      <div id="cal-wrap" style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:20px">${buildCal()}</div>
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
          saveBookingDraft('date');
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
    scrollStepToTop();
    const saved = window.appState.location !== 'Home' ? window.appState.location : '';
    screen.innerHTML = `
      ${createHeader('Your Address', true, '#book-service')}
      <div style="padding-top:8px">
        <div class="section-label">Where should we come?</div>
        <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E40AF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:14px">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <div style="flex:1;position:relative">
              <label for="location-input" style="font-size:13px;color:var(--color-text-secondary);font-weight:600;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Address</label>
              <input id="location-input" type="text" placeholder="e.g. 14 Smith St, Surry Hills NSW 2010"
                value="${escapeHtml(saved)}"
                style="width:100%;border:none;outline:none;background:transparent;font-size:15px;color:var(--color-text);padding:0;font-family:inherit;box-sizing:border-box" autocomplete="off">
              <div id="address-suggestions" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:1px solid var(--color-border);border-radius:8px;margin-top:4px;max-height:200px;overflow-y:auto;z-index:10;box-shadow:var(--shadow-md)"></div>
              <div style="height:1px;background:var(--color-border);margin-top:8px"></div>
              <div style="margin-top:6px;font-size:13px;color:var(--color-text-secondary)">Your mechanic will come to this address</div>
            </div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--gray);padding:0 4px;line-height:1.6">The $20 call-out fee covers the mechanic's trip. Most areas in Sydney are covered.</div>
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
        const raw = await res.json();
        if (!raw.length) {
          suggestionsBox.style.display = 'none';
          return;
        }
        // Nominatim can return multiple distinct records that render to the
        // exact same display_name (separate OSM way segments for the same
        // street, etc.) - dedupe on the visible text so the dropdown never
        // shows the identical suggestion two or three times in a row.
        const seen = new Set();
        const data = raw.filter((item) => {
          if (seen.has(item.display_name)) return false;
          seen.add(item.display_name);
          return true;
        });
        suggestionsBox.innerHTML = data
          .map(
            (item) => `
          <button type="button" class="address-suggestion" data-address="${escapeHtml(item.display_name)}"
            style="display:block;width:100%;text-align:left;padding:12px 14px;border:none;background:none;cursor:pointer;font-size:15px;color:var(--color-text);font-family:inherit;border-bottom:1px solid var(--color-border)">
            ${escapeHtml(item.display_name.split(',')[0])}<br>
            <span style="font-size:13px;color:var(--color-text-secondary)">${escapeHtml(item.display_name.split(',').slice(1).join(','))}</span>
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

    screen.querySelector('#s3-continue').addEventListener('click', async () => {
      const addr = input.value.trim() || 'Home';
      window.appState.location = addr;
      saveBookingDraft('address');
      const btn = screen.querySelector('#s3-continue');
      btn.textContent = 'Checking address...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'check-coverage', address: addr }),
        });
        const data = res.ok ? await res.json() : { covered: true };
        if (data.covered === false) {
          showToast(
            "Sorry, we don't currently service that address. Try a different address or contact us.",
            'error'
          );
          btn.textContent = 'Continue to Summary';
          btn.disabled = false;
          return;
        }
      } catch {
        // Coverage check failed (network) - don't block booking on it, the
        // server re-checks authoritatively in create-booking anyway.
      }
      if (window.gtag) gtag('event', 'checkout_progress', { step: 2 });
      router.navigate('service-summary');
    });
  }

  // ── Init: render Step 1 immediately (skeleton), then load services ─────────
  renderStep1();
  try {
    _services = await getServices();
    _servicesError = null;
  } catch (e) {
    // getServices() used to answer with four hardcoded prices here, so a
    // client with no signal was quoted a stale price list as if it were live.
    _servicesError = e;
  }
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

// The two pay buttons carry the amount, so their finished text can never match
// a dictionary key - they shipped in English in Spanish and Chinese until this
// was noticed on 2026-07-28. Same fix the "How payment works" note already
// used: keep CALLOUT as a placeholder in the key, substitute after the lookup.
function payButtonLabel(key, amount) {
  return translateValue(key).replace('CALLOUT', amount.toFixed(2));
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

  // getCalloutFee() below hits Supabase, so this screen has the same blank-box
  // problem as Profile - and this one sits in the middle of the paid flow.
  screen.innerHTML = `
    ${createHeader('Your Quote', true, '#book-service')}
    ${createBrandLoader()}
    ${createBottomNav('home')}
  `;

  const surcharged = isSurchargeDay(date);
  const serviceTotal = applySurcharge(Number(service.price || 0), date);
  const calloutFee = applySurcharge(await getCalloutFee(location), date);
  const grandTotal = serviceTotal + calloutFee;
  const inclusions = getServiceInclusions(service.name);
  const dur = formatServiceDuration(service);

  screen.innerHTML = `
    ${createHeader('Your Quote', true, '#book-service')}
    <div style="padding:4px 0 16px">

      <!-- Quote card -->
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:14px;overflow:hidden;margin-bottom:14px">
        <div style="background:var(--navy);padding:14px 16px;display:flex;align-items:center;gap:10px">
          <img src="images/logo-db.png" alt="Dr. Bike Sydney" height="20" style="width:auto;display:block">
          <div>
            <div style="color:var(--white);font-size:15px;font-weight:700">${service.name}</div>
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

      ${surcharged ? `<div style="background:var(--amber-lt);border:1px solid var(--amber-lt);border-radius:10px;padding:10px 14px;font-size:13px;color:var(--amber-ink);margin-bottom:14px;display:flex;justify-content:space-between;gap:8px"><span>Sunday &amp; public holiday rate</span><span style="font-weight:700;white-space:nowrap">+20%</span></div>` : ''}

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
          <span style="font-size:20px;font-weight:800;color:var(--color-primary)" id="summary-total-amount">$${grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <!-- Discount code -->
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-secondary);margin-bottom:8px">Promo or referral code</div>
        <div style="display:flex;gap:8px">
          <input id="referral-input" type="text" placeholder="Enter code (optional)" aria-label="Promo or referral code"
            style="flex:1;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:10px 14px;color:var(--color-text);font-size:15px;outline:none;text-transform:uppercase" />
          <button id="referral-apply-btn" class="btn btn--secondary" style="padding:10px 16px;font-size:13px;white-space:nowrap">Apply</button>
        </div>
        <div id="referral-msg" style="font-size:13px;margin-top:6px;min-height:16px"></div>
      </div>

      <!-- Payment split note -->
      <div style="display:flex;gap:10px;background:var(--blue-lt);border-radius:10px;padding:12px 14px;margin-bottom:16px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style="font-size:13px;color:var(--blue);line-height:1.55">
          <strong>How payment works:</strong> ${translateValue(
            'The $CALLOUT call-out fee is charged now via Stripe. The service fee ($SERVICE) is paid to the mechanic directly by card (EFTPOS) when they arrive.'
          )
            .replace('CALLOUT', calloutFee.toFixed(2))
            .replace('SERVICE', `<span id="q-svc-note">${serviceTotal.toFixed(2)}</span>`)}
        </div>
      </div>

    </div>
    <div id="booking-error" class="booking-error" hidden></div>
    <div class="sticky-bottom">
      <button class="btn btn--primary btn--full" id="proceed-btn">${payButtonLabel('Confirm & Pay $CALLOUT Call-out Fee', calloutFee)}</button>
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
      // 1. Try discount_codes table first (via RPC - direct table SELECT
      // was removed, it let anon enumerate every active code, see
      // scripts/fix-discount-code-enumeration-2026-07-19.sql)
      const { data: rows, error } = await sb.rpc('validate_discount_code', { p_code: code });
      const data = rows && rows[0];
      if (!error && data) {
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
      msg.textContent = translateValue(e.message || 'Invalid code');
    }
  });

  // Booking without an account. Three fields, not a sign-up: the mechanic is
  // driving to a stranger's address, so a name and a phone are operational
  // necessities, and the email is where the receipt, the confirmation and the
  // tracking link go. An account is offered afterwards, never demanded.
  //
  // Same shell as confirmDialog() so the scrim, the sizing, the 44px targets
  // and the reduced-motion behaviour are the ones already reviewed.
  function askGuestContact() {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const field = (id, label, type, placeholder, autocomplete) => `
      <label for="${id}" style="display:block;font-size:12px;font-weight:600;color:var(--gray);margin:12px 0 4px">${translateValue(label)}</label>
      <input id="${id}" type="${type}" autocomplete="${autocomplete}" placeholder="${translateValue(placeholder)}"
             style="width:100%;min-height:44px;padding:11px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:var(--font-family);outline:none">`;
    overlay.innerHTML = `
<div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="guest-title">
  <h2 class="confirm-box__title" id="guest-title">${translateValue('Where do we send your booking?')}</h2>
  <p class="confirm-box__msg">${translateValue('No account needed. We only use this to confirm your booking and let the mechanic reach you.')}</p>
  ${field('guest-name', 'Your name', 'text', 'Jane Smith', 'name')}
  ${field('guest-email', 'Email', 'email', 'you@email.com', 'email')}
  ${field('guest-phone', 'Mobile', 'tel', '0400 000 000', 'tel')}
  <div id="guest-err" style="display:none;color:var(--red);font-size:13px;margin-top:10px"></div>
  <div class="confirm-box__actions">
    <button type="button" class="confirm-box__btn confirm-box__btn--go" data-act="go">${translateValue('Continue')}</button>
  </div>
  <button type="button" data-act="signin"
          style="display:block;width:100%;min-height:44px;margin-top:8px;background:none;border:none;color:var(--blue);font-family:var(--font-family);font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline">
    ${translateValue('I already have an account')}
  </button>
</div>`;

    const close = () => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('confirm-overlay--closing');
      setTimeout(() => overlay.remove(), 250);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return close();
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'signin') {
        try {
          localStorage.setItem(RETURN_TO_KEY, 'service-summary');
        } catch {
          /* private mode: they resume from the draft on the home screen */
        }
        close();
        router.navigate('login');
        return;
      }
      if (act !== 'go') return;

      const name = overlay.querySelector('#guest-name').value.trim();
      const email = overlay.querySelector('#guest-email').value.trim();
      const phone = overlay.querySelector('#guest-phone').value.trim();
      const err = overlay.querySelector('#guest-err');
      const fail = (msg) => {
        err.textContent = translateValue(msg);
        err.style.display = 'block';
      };
      if (!name) return fail('Please enter your name');
      // The same shape the server enforces. Better to say so here than to take
      // the card and bounce afterwards.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email');
      if (phone.replace(/\D/g, '').length < 8) return fail('Please enter a valid mobile number');

      window.appState.guestName = name;
      window.appState.guestEmail = email;
      window.appState.guestPhone = phone;
      close();
      screen.querySelector('#proceed-btn')?.click();
    });

    document.body.appendChild(overlay);
    overlay.querySelector('#guest-name').focus();
  }

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

      // NOTHING IS CHARGED UNTIL WE HAVE A WAY TO REACH THE PERSON.
      //
      // The rule is about the contact details, not about having an account.
      // Being asked to register is the barrier - being asked for an email is
      // not - so someone who never signs up can book, and still gets their
      // receipt, their confirmation and their tracking link.
      //
      // The old version let anyone pay and only then asked them to sign in.
      // create-booking answered 401, so the charge went through and the booking
      // never existed. That happened to every guest, every time, between
      // 2026-07-04 and 2026-08-05, when a real customer paid $20 and got
      // nothing (docs/PENDIENTES.md 14).
      if (!user && !window.appState.guestEmail) {
        btn.disabled = false;
        btn.textContent = payButtonLabel('Confirm & Pay $CALLOUT Call-out Fee', calloutFee);
        askGuestContact();
        return;
      }

      window.appState.bookingId = null;
      window.appState.isGuest = false;
      router.navigate('payment');
    } catch (e) {
      errEl.textContent = translateValue(e.message || 'Please try again.');
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = payButtonLabel('Confirm & Pay $CALLOUT Call-out Fee', calloutFee);
    }
  });
}

// ── Optional preferred-mechanic picker (admin-toggleable, see Admin > Settings) ──
async function loadMechanicPreferencePicker() {
  try {
    const statusResp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'mechanic-preference-status' }),
    });
    const { enabled } = statusResp.ok ? await statusResp.json() : { enabled: false };
    if (!enabled) return { html: '', mechanics: [] };

    const listResp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'public-mechanics' }),
    });
    const mechanics = listResp.ok ? await listResp.json() : [];
    if (!mechanics.length) return { html: '', mechanics: [] };

    const cards = mechanics
      .map((m) => {
        const initials = m.name
          .split(' ')
          .slice(0, 2)
          .map((w) => w[0])
          .join('')
          .toUpperCase();
        const avatarHTML = m.photo_url
          ? `<img src="${escapeHtml(m.photo_url)}" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover">`
          : `<div style="width:52px;height:52px;border-radius:50%;background:var(--blue-lt);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--blue)">${escapeHtml(initials)}</div>`;
        // "jobs" stays its own text node (not pre-translated into the string)
        // so translateScreen's automatic re-walk can still catch it if the
        // user switches language after this card is already on screen -
        // baking a translateValue() result into a fused string would freeze
        // it in whatever language was active at render time.
        const metaHTML = [];
        if (m.jobs_completed > 0) metaHTML.push(`${m.jobs_completed} <span>jobs</span>`);
        if (m.rating) metaHTML.push(`★ ${m.rating}`);
        return `
          <button type="button" class="mechanic-pref-card" data-mechanic-id="${escapeHtml(m.id)}"
            style="flex-shrink:0;width:104px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border-radius:12px;border:1.5px solid var(--color-border);background:var(--white);cursor:pointer">
            ${avatarHTML}
            <div style="font-size:13px;font-weight:700;color:var(--navy);text-align:center;line-height:1.3">${escapeHtml(m.name)}</div>
            ${metaHTML.length ? `<div style="font-size:11px;color:var(--gray)">${metaHTML.join(' · ')}</div>` : ''}
          </button>`;
      })
      .join('');

    const html = `
      <div style="margin-bottom:20px">
        <div style="font-size:13px;color:var(--gray);margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Prefer a specific mechanic? (optional)</div>
        <div id="mechanic-pref-row" style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px">${cards}</div>
        <div id="mechanic-pref-note" style="font-size:11px;color:var(--gray-lt);margin-top:8px" hidden>We'll try to send your job to them first.</div>
      </div>`;
    return { html, mechanics };
  } catch {
    return { html: '', mechanics: [] };
  }
}

function wireMechanicPreferencePicker(screen, mechanics) {
  if (!mechanics.length) return;
  const row = screen.querySelector('#mechanic-pref-row');
  const note = screen.querySelector('#mechanic-pref-note');
  if (!row) return;
  row.addEventListener('click', (e) => {
    const card = e.target.closest('.mechanic-pref-card');
    if (!card) return;
    const id = card.dataset.mechanicId;
    const wasSelected = card.classList.contains('is-selected');
    row.querySelectorAll('.mechanic-pref-card').forEach((c) => {
      c.classList.remove('is-selected');
      c.style.borderColor = 'var(--color-border)';
      c.style.background = 'var(--white)';
    });
    if (wasSelected) {
      window.appState.preferredMechanicId = null;
    } else {
      card.classList.add('is-selected');
      card.style.borderColor = 'var(--blue)';
      card.style.background = 'var(--blue-lt)';
      window.appState.preferredMechanicId = id;
    }
    if (note) note.hidden = !window.appState.preferredMechanicId;
  });
}

// ── Payment ───────────────────────────────────────────────────────────────────
// A PaymentIntent that already went through, and the booking it was for. These
// have to outlive renderPayment(): the screen is re-rendered on every
// navigation to #payment, and a guard that lives inside it is no guard at all
// once the client leaves the screen and comes back. Cleared as soon as the
// booking exists, so the next booking pays for itself.
let _paidIntent = null;
let _paidBookingKey = null;

async function renderPayment() {
  const screen = document.querySelector('[data-screen="payment"]');
  if (!screen) return;

  destroyPaymentForm();

  const { service, date, time, location } = window.appState;
  if (!service) {
    router.navigate('book-service');
    return;
  }
  // Fresh each visit to this screen - an old selection from a previous,
  // possibly-abandoned booking should never silently carry over.
  window.appState.preferredMechanicId = null;
  // Marks how far they got, so a restored draft can offer to come straight
  // back here instead of walking the wizard again.
  saveBookingDraft('payment');
  if (window.posthog) posthog.capture('booking_step_viewed', { step: 'payment' });

  // Four network calls run before this screen can paint (session, server
  // price, callout zones, mechanic list). It is the last thing a client sees
  // before paying, so it must never be an empty box.
  screen.innerHTML = `
    ${createHeader('Confirm Booking', true, '#service-summary')}
    ${createBrandLoader()}
    ${createBottomNav('home')}
  `;

  const {
    data: { session: paySession },
  } = await sb.auth.getSession();
  const currentUser = paySession?.user || null;
  const isTestAdmin = currentUser?.email === 'peredo.dm@gmail.com';

  // Reaching this screen without paying is the one thing the abandoned-cart
  // reminder could never see: no booking row exists until the charge succeeds,
  // so api/send-cron.js had nothing to find. This is that missing trace.
  //
  // Signed-in clients only (Diego, 2026-07-28): we already have their email and
  // their consent. One row each, upserted, so the table cannot grow without
  // bound - and reminder_sent_at is cleared, because a second abandonment
  // deserves its own reminder. Fire and forget: nothing here may delay or block
  // the payment screen.
  if (currentUser) {
    sb.from('checkout_attempts')
      .upsert({
        client_id: currentUser.id,
        service_name: service.name || null,
        service_price: Number(service.price) || null,
        scheduled_date: date || null,
        scheduled_time: time || null,
        address: location || null,
        reached_payment_at: new Date().toISOString(),
        reminder_sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.warn('[checkout_attempts] not recorded:', error.message);
      });
  }

  // Authoritative price from the server (membership waiver/discount + Sunday
  // surcharge already applied) - must match exactly what handleCreateBooking
  // will verify, or a paid charge gets rejected as "amount mismatch" and a
  // membership visit that should be free would otherwise still show a card
  // form asking to pay for it.
  let calloutFee = 0;
  let isIncludedVisit = false;
  if (currentUser && !isTestAdmin) {
    try {
      const priceResp = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'get-price',
          access_token: paySession.access_token,
          service_id: service.id || null,
          service_name: service.name,
          scheduled_date: date,
          address: location,
        }),
      });
      if (priceResp.ok) {
        const priced = await priceResp.json();
        calloutFee = priced.calloutFee;
        isIncludedVisit = priced.isIncludedVisit;
      } else {
        calloutFee = applySurcharge(await getCalloutFee(location), date);
      }
    } catch {
      calloutFee = applySurcharge(await getCalloutFee(location), date);
    }
  } else {
    calloutFee = applySurcharge(await getCalloutFee(location), date);
  }
  const mechanicPicker = await loadMechanicPreferencePicker();

  const waText = encodeURIComponent(
    `Hi Dr. Bike! I'd like to book a ${service.name} on ${date} at ${time} at ${location}. Can you confirm my slot?`
  );
  screen.innerHTML = `
    ${createHeader('Confirm Booking', true, '#service-summary')}
    <div style="padding:0 16px 24px">
      <div style="background:var(--blue-lt);border:1px solid #BAE6FD;border-radius:12px;padding:16px;margin-bottom:20px">
        <div style="font-size:13px;color:var(--gray);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Your selection</div>
        <div style="font-weight:700;color:var(--navy);font-size:15px">${service.name}</div>
        <div style="font-size:13px;color:var(--gray);margin-top:4px">${date} &bull; ${time}</div>
        <div style="font-size:13px;color:var(--gray)">${location}</div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:var(--gray)">Call-out fee</span>
          ${
            isIncludedVisit
              ? `<span style="font-size:11px;font-weight:700;color:var(--green);background:#05966915;padding:3px 10px;border-radius:20px">Included in your membership</span>`
              : `<span style="font-weight:700;color:var(--navy)">$${calloutFee.toFixed(2)}</span>`
          }
        </div>
      </div>

      ${mechanicPicker.html}

      ${
        calloutFee <= 0
          ? `
      <div id="payment-error" class="booking-error" hidden style="margin-bottom:12px"></div>
      <button class="btn btn--primary btn--full" id="pay-btn">Confirm booking</button>`
          : `
      <div id="payment-request-btn" style="margin-bottom:12px" hidden></div>
      <div class="payment-divider" id="card-divider" hidden><span>or pay by card</span></div>
      <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">Card details</div>
        <div id="card-element" class="card-element"></div>
      </div>
      <div id="payment-error" class="booking-error" hidden style="margin-bottom:12px"></div>
      <div class="payment-security" style="margin-bottom:16px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span>Secure payment powered by Stripe. Encrypted and safe.</span>
      </div>
      <button class="btn btn--primary btn--full" id="pay-btn">${payButtonLabel('Pay $CALLOUT Call-out Fee', calloutFee)}</button>`
      }

      <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--gray-lt)">
        Prefer to book manually?
        <a href="https://wa.me/61433963250?text=${waText}" style="color:var(--blue);font-weight:600">WhatsApp us</a>
        or
        <a href="tel:+61433963250" style="color:var(--blue);font-weight:600">call 0433 963 250</a>
      </div>
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

  wireMechanicPreferencePicker(screen, mechanicPicker.mechanics);

  async function finalizeBooking(paymentIntent, { feeOverride = null, isTest = false } = {}) {
    const {
      data: { session },
    } = await sb.auth.getSession();
    const user = session?.user || null;
    // No session is fine now - it means a guest, who gave their details at the
    // contact step. What is NOT fine is having neither, because then there is
    // nobody to send the confirmation to and nobody for the mechanic to call.
    const guestEmail = window.appState.guestEmail || null;
    if (!user && !guestEmail) throw new Error('We need an email to send your receipt.');
    const meta = (user && user.user_metadata) || {};
    const _clientName = meta.full_name || meta.name || window.appState.guestName || '';
    const _clientEmail = user ? user.email : guestEmail;
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
        // Absent for a guest. The server treats the verified Stripe payment as
        // the credential in that case - no payment, no booking.
        access_token: session?.access_token || null,
        client_name: _clientName,
        client_email: _clientEmail,
        client_phone: window.appState.guestPhone || null,
        client_lang: getLang(),
        service_id: service.id || null,
        service_name: service.name,
        scheduled_date: date,
        scheduled_time: time,
        address: location || 'Home',
        bike_id: window.appState.bikeId || null,
        preferred_mechanic_id: window.appState.preferredMechanicId || null,
        payment_intent_id: realPI,
        discount_code:
          !isTest && window.appState.discountCode ? window.appState.discountCode : null,
        utm_source: sessionStorage.getItem('utm_source') || null,
        utm_medium: sessionStorage.getItem('utm_medium') || null,
        utm_campaign: sessionStorage.getItem('utm_campaign') || null,
        time_to_book_seconds: (() => {
          const start = parseInt(sessionStorage.getItem('drbike-booking-start'), 10);
          return Number.isFinite(start) ? Math.round((Date.now() - start) / 1000) : null;
        })(),
      }),
    });
    const _bk = await resp.json();
    if (!resp.ok) throw new Error(_bk.error || 'Could not create booking');
    sessionStorage.removeItem('drbike-booking-start');
    // It exists in the database now - the draft has done its job.
    clearBookingDraft();
    window.__bookingDraftStep = null;
    // The charge has a booking attached, so it must stop standing in for the
    // next one. Released here and not on leaving the screen: while the booking
    // does not exist yet, this is the only record that the client already paid.
    _paidIntent = null;
    _paidBookingKey = null;
    // And the checkout is no longer abandoned, so the row that would have
    // triggered a "do you still need it?" email in three hours has to go. RLS
    // limits the delete to their own row; best effort, because a booking that
    // succeeded must never fail on its way out.
    sb.auth.getSession().then(({ data }) => {
      const uid = data?.session?.user?.id;
      if (!uid) return;
      sb.from('checkout_attempts')
        .delete()
        .eq('client_id', uid)
        .then(({ error }) => {
          if (error) console.warn('[checkout_attempts] not cleared:', error.message);
        });
    });
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
    const _total = fee + applySurcharge(Number(service.price || 0), date);
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
          to: _clientEmail,
          name: _clientName,
          service: service.name,
          date,
          time,
          address: location || 'Home',
          price: _total,
          bookingId: _bId,
          type: 'confirmation',
          lang: getLang(),
        }),
      }),
    ]).then((results) =>
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(`[booking-notif ${i}] failed:`, r.reason);
      })
    );
    router.navigate('tracking');
  }

  // Guards against double-charging if a payment somehow completes twice
  // (e.g. the Payment Request Button fires, then the card form is also
  // submitted) - the second call reuses the first PaymentIntent instead of
  // charging again.
  //
  // The memo lives at module scope, NOT in this function. It used to be a local
  // `let paidIntent`, and js/app.js's screen router calls renderPayment() on
  // every navigation to #payment - so a client who paid, hit the "booking could
  // not be saved" error, went back a screen and returned got a brand new
  // closure with the guard reset, and paying again charged them a second time.
  // Keyed to the booking so it only ever suppresses a repeat charge for the
  // same one; a genuinely new booking gets a fresh charge.
  const paymentKey = [
    service?.id || service?.name || '',
    date || '',
    time || '',
    location || '',
    calloutFee,
  ].join('|');
  if (_paidBookingKey !== paymentKey) _paidIntent = null;
  _paidBookingKey = paymentKey;

  async function chargeOnce(paymentMethodId) {
    if (_paidIntent) return _paidIntent;
    const {
      data: { user: payingUser },
    } = await sb.auth.getUser();

    // This used to fall back to 'guest@drbikesydney.com.au'. That address goes
    // to Diego's own catch-all, and it is what Stripe puts in receipt_email -
    // so on 2026-08-05 a customer paid $20 and her receipt was delivered to
    // Diego. She got nothing: not the receipt, not a confirmation (there was no
    // booking), and not even the refund notice, because that goes to the same
    // address. Four ways to reach her, all silent.
    //
    // Never invent an address for somebody. The rule is about the ADDRESS, not
    // about being signed in: when guest checkout lands (PENDIENTES 14.2) this
    // reads the address the guest gave at the contact step instead, and the
    // rule still holds unchanged - no address, no charge.
    const email = payingUser?.email || window.appState?.guestEmail || null;
    if (!email) throw new Error('We need an email to send your receipt.');

    // What the booking is for travels WITH the payment. Stripe hands it back
    // on the webhook, so the server can build the booking even if this browser
    // never gets to ask for it - which is how a paid booking was lost on
    // 2026-08-05 (docs/PENDIENTES.md 14).
    const meta = payingUser?.user_metadata || {};
    _paidIntent = await processPayment(Math.round(calloutFee * 100), null, email, paymentMethodId, {
      serviceId: service?.id || null,
      serviceName: service?.name || null,
      date,
      time,
      address: location || 'Home',
      clientName: meta.full_name || meta.name || window.appState?.guestName || '',
      clientPhone: meta.phone || window.appState?.guestPhone || '',
      bikeId: window.appState?.bikeId || null,
      lang: getLang(),
      isGuest: !payingUser,
    });
    return _paidIntent;
  }

  if (calloutFee > 0) {
    await createPaymentForm('card-element');

    const prSupported = await createPaymentRequestButton('payment-request-btn', {
      amountCents: Math.round(calloutFee * 100),
      label: 'Dr. Bike Sydney - Call-out fee',
      onPayment: async (paymentMethodId) => {
        const pi = await chargeOnce(paymentMethodId);
        await finalizeBooking(pi, { isTest: false });
      },
    });
    if (prSupported) {
      screen.querySelector('#payment-request-btn').hidden = false;
      screen.querySelector('#card-divider').hidden = false;
    }

    screen.querySelector('#pay-btn').addEventListener('click', async () => {
      const btn = screen.querySelector('#pay-btn');
      const errEl = screen.querySelector('#payment-error');
      btn.disabled = true;
      btn.textContent = 'Processing payment...';
      errEl.hidden = true;
      try {
        const paymentIntent = await chargeOnce();
        await finalizeBooking(paymentIntent, { isTest: false });
      } catch (e) {
        // translateValue, not a bare literal: this is the single most important
        // sentence in the app - it tells a client their money left and their
        // booking did not - and it was shipping in English to es/zh clients.
        errEl.textContent = _paidIntent
          ? translateValue(
              'Payment received but the booking could not be saved. Tap Pay again to retry, or contact us.'
            )
          : e.message ||
            translateValue('Payment failed. Please check your card details and try again.');
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = payButtonLabel('Pay $CALLOUT Call-out Fee', calloutFee);
      }
    });
  } else {
    screen.querySelector('#pay-btn').addEventListener('click', async () => {
      const btn = screen.querySelector('#pay-btn');
      const errEl = screen.querySelector('#payment-error');
      btn.disabled = true;
      btn.textContent = 'Confirming...';
      errEl.hidden = true;
      try {
        await finalizeBooking(null, { isTest: false });
      } catch (e) {
        errEl.textContent = translateValue(
          e.message || 'Could not confirm booking. Please try again.'
        );
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Confirm booking';
      }
    });
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
        showToast(translateValue(e.message || 'Test booking failed'));
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
  pending: { dot: '#B45309', label: 'Booking received - assigning mechanic...' },
  confirmed: { dot: '#1E40AF', label: 'Mechanic assigned - preparing to depart' },
  enroute: { dot: '#15803D', label: 'Mechanic is on the way!' },
  en_route: { dot: '#15803D', label: 'Mechanic is on the way!' },
  in_progress: { dot: '#15803D', label: 'Mechanic has arrived!' },
  inprogress: { dot: '#15803D', label: 'Mechanic has arrived!' },
  arrived: { dot: '#15803D', label: 'Mechanic has arrived!' },
  completed: { dot: '#64748B', label: 'Service completed' },
};

async function renderTrackingPicker(screen) {
  const ST_COLORS = {
    pending: '#B45309',
    confirmed: '#1E40AF',
    enroute: '#15803D',
    en_route: '#15803D',
    in_progress: '#15803D',
    arrived: '#15803D',
    completed: '#64748B',
    cancelled: '#CF2020',
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
          <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:6px">Sign in to track bookings</div>
          <div style="font-size:13px;color:var(--gray);margin-bottom:20px">Your bookings will appear here</div>
          <button class="btn btn--primary" id="picker-signin-btn" style="padding:12px 28px;font-size:15px;font-weight:700">Sign in</button>
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
          <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:6px">No bookings yet</div>
          <div style="font-size:13px;color:var(--gray)">Book a service to track it here</div>
        </div>`;
      return;
    }

    const upcoming = active.filter((b) => !['completed'].includes(b.status));
    const past = active.filter((b) => b.status === 'completed');

    let html = '';
    if (upcoming.length) {
      html += `<div style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Active</div>`;
      upcoming.forEach((b) => {
        const color = ST_COLORS[b.status] || '#64748B';
        html += `
          <div class="booking-pick-item" data-id="${b.id}" data-token="${b.tracking_token || ''}"
            style="background:var(--white);border:1px solid var(--border);border-left:4px solid ${color};border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;min-height:64px;transition:background 150ms ease">
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.service_name || 'Service'}</div>
              <div style="font-size:13px;color:var(--gray)">${b.scheduled_date || ''}${toDisplayTime(b.scheduled_time) ? ' · ' + toDisplayTime(b.scheduled_time) : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:12px">
              <span style="font-size:11px;font-weight:600;color:${color};background:${color}1A;padding:3px 10px;border-radius:20px;white-space:nowrap">${ST_LABELS[b.status] || b.status}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>`;
      });
    }

    if (past.length) {
      html += `<div style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 8px">History</div>`;
      past.slice(0, 5).forEach((b) => {
        const color = ST_COLORS[b.status] || '#64748B';
        html += `
          <div class="booking-pick-item" data-id="${b.id}" data-token="${b.tracking_token || ''}"
            style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${color};border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;min-height:64px;transition:background 150ms ease">
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.service_name || 'Service'}</div>
              <div style="font-size:13px;color:var(--gray)">${b.scheduled_date || ''}</div>
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
    listEl.innerHTML = `<div style="text-align:center;padding:32px 0;color:var(--red);font-size:13px">Could not load bookings. Try again.</div>`;
  }
}

async function renderTracking() {
  const screen = document.querySelector('[data-screen="tracking"]');
  if (!screen) return;

  const _renderSeq = ++_trackingRenderSeq;
  cleanupTracking();

  const { bookingId } = window.appState;

  if (!bookingId) {
    return renderTrackingPicker(screen);
  }

  const ref = bookingRef(bookingId);

  // Screen is 100dvh flex-column with no padding/animation (see CSS override for [data-screen="tracking"].active)
  screen.innerHTML = `
    <!-- Header -->
    <div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;background:var(--white);border-bottom:1px solid var(--border)">
      <div style="font-size:18px;font-weight:700;color:var(--navy)">Live Tracking</div>
      <button id="change-booking-btn" style="background:none;border:none;font-size:13px;color:var(--blue);cursor:pointer;font-weight:600;font-family:inherit;padding:8px 0;display:flex;align-items:center;gap:4px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Change booking
      </button>
    </div>

    <!-- Status bar -->
    <div style="flex-shrink:0;display:flex;align-items:center;gap:8px;padding:9px 16px;background:var(--white);border-bottom:1px solid var(--border-lt)">
      <div id="status-dot" style="width:8px;height:8px;border-radius:50%;background:var(--blue-dark);flex-shrink:0;transition:background 0.3s"></div>
      <span id="status-text" style="font-size:13px;font-weight:600;color:var(--navy)">Loading booking...</span>
    </div>

    <!-- Map: flex:1 fills all remaining space between status bar and bottom panel -->
    <div id="tracking-map" style="flex:1;min-height:0;display:block"></div>

    <!-- Bottom panel -->
    <div style="flex-shrink:0;background:var(--white);border-top:1px solid var(--border)">
      <div id="mechanic-card" style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--border-lt)">
        <div id="mechanic-avatar" style="width:40px;height:40px;background:var(--blue-lt);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px;font-weight:700;color:var(--blue)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div style="min-width:0">
          <div id="mechanic-name" style="font-size:15px;font-weight:700;color:var(--navy)">Your mechanic</div>
          <div id="mechanic-meta" style="font-size:13px;color:var(--gray);margin-top:1px"></div>
        </div>
        <div id="eta-badge" style="margin-left:auto;flex-shrink:0;text-align:right">
          <div id="eta-text" style="font-size:13px;color:var(--gray)">On the way to you</div>
        </div>
        <svg id="mechanic-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gray-lt)" stroke-width="2.5" style="display:none;flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div id="arrival-pin-badge" style="display:none;align-items:center;gap:10px;padding:10px 16px;background:var(--blue-lt);border-bottom:1px solid var(--border-lt)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <div style="font-size:13px;color:var(--blue)"><b>Your code: <span id="arrival-pin-value" style="font-size:15px;letter-spacing:1px">----</span></b> — read this to your mechanic when they arrive</div>
      </div>
      <div style="display:flex;gap:4px;padding:10px 16px">
        ${['Confirmed', 'En Route', 'Arrived', 'Done']
          .map(
            (s, i) =>
              `<div id="step-${i}" style="flex:1;padding:5px 2px;text-align:center;font-size:11px;font-weight:700;border-radius:6px;background:var(--border-lt);color:var(--gray-lt);transition:all 0.3s">${s}</div>`
          )
          .join('')}
      </div>
      <div style="display:flex;gap:8px;padding:0 16px 12px">
        <button id="message-btn" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px 8px;background:var(--white);border:1.5px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer;font-family:inherit">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Message
        </button>
        <button id="share-tracking-btn" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px 8px;background:var(--white);border:1.5px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer;font-family:inherit">
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
  if (_renderSeq !== _trackingRenderSeq || !screen.classList.contains('active')) return;

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
    html: `<div style="width:32px;height:32px;background:var(--blue);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid var(--white);box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
  const mechIcon = window.L.divIcon({
    className: '',
    html: `<div style="width:40px;height:40px;background:var(--green);border-radius:50%;border:3px solid var(--white);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5)"><svg width="20" height="14" viewBox="0 0 24 16" fill="white"><rect x="0" y="3" width="16" height="13" rx="1"/><path d="M16 6h5l3 4v6h-8V6z"/><circle cx="5" cy="16" r="3" fill="white"/><circle cx="19" cy="16" r="3" fill="white"/></svg></div>`,
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
    const etaStr = eta.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
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
        body: JSON.stringify({ role: 'public-track', tracking_token: trackingToken }),
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
  if (_renderSeq !== _trackingRenderSeq) return;

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
          avatarEl.innerHTML = `<img src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
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
        // mapH below was computed against the bottom panel's height BEFORE
        // this badge existed - showing it grows the panel by ~40px with
        // nothing to absorb the difference (this screen has no scroll
        // anywhere by design), which pushed the Message/Share buttons
        // behind the fixed bottom nav with no way to reach them. Redo the
        // same calculation now that the panel's real height is final.
        if (bottomPanel) {
          const newBottomH = bottomPanel.getBoundingClientRect().height;
          const newMapH = Math.max(140, window.innerHeight - topH - navH - newBottomH);
          mapEl.style.height = newMapH + 'px';
          requestAnimationFrame(() => _trackingMap?.invalidateSize?.({ animate: false }));
        }
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
// The textContent/innerHTML round-trip this used to do escapes &, <, > but
// NOT quotes - safe for text nodes, but every call site here that uses it
// inside an attribute (src="...", value="...", data-*="...") was still
// breakout-able via a plain double-quote. Explicit replace matches the esc()
// implementations already used correctly in mechanic.js/admin.js.
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMiniStars(rating) {
  return Array.from({ length: 5 }, (_, i) => (i < rating ? '★' : '☆')).join('');
}

function renderReviewSection(booking) {
  if (booking.status !== 'completed') return '';
  if (booking.client_rating) {
    return `
    <div style="border-top:1px solid var(--border);padding:16px 20px">
      <div style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">Your review</div>
      <div style="font-size:18px;color:var(--amber-bright);letter-spacing:2px">${renderMiniStars(booking.client_rating)}</div>
      ${booking.client_review ? `<div style="font-size:13px;color:var(--gray);margin-top:6px;line-height:1.5">"${escapeHtml(booking.client_review)}"</div>` : ''}
    </div>`;
  }
  return `
    <div style="border-top:1px solid var(--border);padding:16px 20px">
      <button data-rate-booking-id="${booking.id}" class="rate-mechanic-btn" style="width:100%;background:var(--amber-bright);color:var(--white);border:none;border-radius:10px;padding:12px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">⭐ Rate this mechanic</button>
    </div>`;
}

function renderMechanicTrackRecord(p) {
  if (!p.reviews || !p.reviews.length) return '';
  return `
    <div style="border-top:1px solid var(--border);padding:16px 20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.04em">Client reviews</div>
        ${p.rating ? `<div style="font-size:13px;color:var(--amber-bright);font-weight:700">★ ${p.rating}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${p.reviews
          .map(
            (r) => `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
              <span style="font-size:13px;font-weight:600;color:var(--navy)">${escapeHtml(r.client_name)}</span>
              ${r.rating ? `<span style="color:var(--amber-bright);font-size:13px">${renderMiniStars(r.rating)}</span>` : ''}
            </div>
            <p style="font-size:13px;color:var(--gray);line-height:1.5;margin:0">"${escapeHtml(r.comment)}"</p>
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
    ? `<img src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.name)}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid var(--white);box-shadow:0 2px 8px rgba(0,0,0,0.15)">`
    : `<div style="width:88px;height:88px;border-radius:50%;background:var(--blue-lt);border:3px solid var(--white);box-shadow:0 2px 8px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:var(--blue)">${escapeHtml(initials)}</div>`;

  const statParts = [];
  if (p.jobs_completed > 0)
    statParts.push(
      `<div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--navy)">${p.jobs_completed}</div><div style="font-size:11px;color:var(--gray)">Jobs done</div></div>`
    );
  if (p.rating)
    statParts.push(
      `<div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--navy)">★ ${p.rating}</div><div style="font-size:11px;color:var(--gray)">Rating</div></div>`
    );

  const panel = document.createElement('div');
  panel.id = 'mechanic-profile-panel';
  panel.style.cssText =
    'position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;z-index:2000';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:0 12px;height:52px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--white)">
      <button id="close-mech-profile-btn" style="background:none;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;color:var(--gray)" aria-label="Close">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span style="font-size:15px;font-weight:700;color:var(--navy)">Mechanic profile</span>
    </div>
    <div style="flex:1;overflow-y:auto">
      <div style="height:84px;width:100%;overflow:hidden;background:var(--blue-lt)">
        <img src="images/mechanic-working.webp" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
      </div>
      <div style="display:flex;justify-content:center;margin-top:-44px">${avatarHTML}</div>
      <div style="text-align:center;padding:10px 20px 0">
        <div style="font-size:18px;font-weight:700;color:var(--navy)">${escapeHtml(p.name)}</div>
        <div style="font-size:13px;color:var(--gray);margin-top:2px">Dr. Bike Mobile Mechanic</div>
        ${p.bio ? `<div style="font-size:13px;color:var(--gray);margin-top:10px;line-height:1.5">${escapeHtml(p.bio)}</div>` : ''}
      </div>
      ${statParts.length ? `<div style="display:flex;justify-content:center;gap:32px;padding:16px 20px">${statParts.join('')}</div>` : ''}
      <div style="display:flex;gap:8px;padding:16px 20px">
        <a href="tel:+61433963250" style="flex:1;text-align:center;background:var(--blue);color:var(--white);padding:12px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none">📞 Call</a>
        <a href="https://wa.me/61433963250" style="flex:1;text-align:center;background:var(--wa);color:var(--white);padding:12px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none">💬 WhatsApp</a>
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
      <div style="display:flex;align-items:center;gap:12px;padding:0 12px 0 6px;height:56px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--white)">
        <button id="close-chat-btn" style="background:none;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;color:var(--gray)" aria-label="Close chat">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style="width:38px;height:38px;border-radius:50%;background:var(--blue-dark);display:flex;align-items:center;justify-content:center;color:var(--white);flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg></div>
        <div style="min-width:0;flex:1">
          <div style="font-size:15px;font-weight:700;color:var(--navy)">Your mechanic</div>
          <div style="display:flex;align-items:center;gap:5px;font-size:13px;color:var(--green)"><span style="width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block"></span>Online now</div>
        </div>
      </div>
      <div id="client-chat-msgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:var(--surface)"></div>
      <div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--border);flex-shrink:0;background:var(--white)">
        <input id="client-chat-inp" style="flex:1;padding:10px 14px;border:1.5px solid var(--border);border-radius:20px;font-family:inherit;font-size:15px;outline:none;color:var(--navy);background:var(--white)" placeholder="Type a message..." aria-label="Type a message" maxlength="500">
        <button id="client-chat-send" style="background:var(--blue);color:var(--white);border:none;border-radius:50%;width:40px;height:40px;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center">
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
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!session?.user) throw new Error('Please sign in to send a message.');
        const resp = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'client-message-send',
            booking_id: bookingId,
            access_token: session.access_token,
            client_id: session.user.id,
            message: text,
          }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error);
        // The realtime subscription below normally echoes this back as an
        // INSERT event, but appending it directly here means the message
        // shows up immediately even if that channel is slow or drops it.
        const msgs = panel.querySelector('#client-chat-msgs');
        if (msgs) {
          msgs.querySelector('[data-empty]')?.remove();
          appendClientMsg(
            { sender_role: 'client', message: text, created_at: new Date().toISOString() },
            msgs,
            true
          );
        }
      } catch (e) {
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
      '<div style="text-align:center;font-size:13px;color:var(--gray);padding:20px">Loading messages...</div>';
    let data = [];
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (session?.user) {
        const resp = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'client-messages',
            booking_id: bookingId,
            access_token: session.access_token,
            client_id: session.user.id,
          }),
        });
        if (resp.ok) data = await resp.json();
      }
    } catch {}
    msgs.innerHTML = '';
    if (!data?.length) {
      msgs.innerHTML =
        '<div data-empty style="text-align:center;padding:40px 20px;color:var(--gray);margin:auto"><div style="font-size:40px;margin-bottom:10px">💬</div><div style="font-size:15px;font-weight:600;color:var(--navy)">No messages yet</div><div style="font-size:13px;margin-top:4px">Send a message to your mechanic</div></div>';
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
  bubble.style.cssText = `max-width:75%;padding:9px 13px;border-radius:${isClient ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};font-size:15px;line-height:1.4;word-break:break-word;background:${isClient ? '#2563EB' : '#fff'};color:${isClient ? '#fff' : '#0D1F3C'};border:${isClient ? 'none' : '1px solid #E2E8F0'}`;
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
  time.style.cssText = 'font-size:11px;color:var(--gray-lt)';
  time.textContent = new Date(msg.created_at).toLocaleTimeString(dateLocale(), {
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
      <div style="font-size:11px;font-weight:600;color:var(--gray);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Add a photo <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--gray-lt)">(optional)</span></div>
      <label id="review-photo-label" style="display:flex;align-items:center;gap:10px;height:56px;padding:0 14px;border:1.5px dashed var(--border);border-radius:10px;cursor:pointer;background:var(--surface)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray-lt)" stroke-width="1.5" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <span id="review-photo-txt" style="font-size:13px;color:var(--gray)">Tap to add a photo (optional)</span>
        <input type="file" accept="image/*" capture="environment" id="review-photo-inp" style="display:none">
      </label>
      <div id="review-photo-preview" style="display:none;margin-top:10px;position:relative;width:80px;height:80px">
        <img id="review-photo-img" style="width:80px;height:80px;object-fit:cover;border-radius:10px;display:block" alt="Your photo">
        <button type="button" id="review-photo-remove" aria-label="Remove photo" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.55);border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--white)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
    lbl.style.background = 'var(--blue-lt)';
  });

  screen.querySelector('#review-photo-remove').addEventListener('click', function (e) {
    e.preventDefault();
    reviewPhotoFile = null;
    screen.querySelector('#review-photo-preview').style.display = 'none';
    screen.querySelector('#review-photo-inp').value = '';
    screen.querySelector('#review-photo-txt').textContent = 'Tap to add a photo (optional)';
    const lbl = screen.querySelector('#review-photo-label');
    lbl.style.borderColor = 'var(--border)';
    lbl.style.background = 'var(--surface)';
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
      errEl.textContent = translateValue(e.message || 'Could not submit review. Please try again.');
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
          <h2 style="font-size:24px;font-weight:800;color:var(--color-text);margin-bottom:8px">Thanks for the 5 stars!</h2>
          <p style="font-size:15px;color:var(--color-text-secondary);line-height:1.6;margin-bottom:28px">
            Would you mind leaving a quick Google review? It helps other Sydney cyclists find us.
          </p>
          <div style="display:flex;flex-direction:column;gap:12px;max-width:280px;margin:0 auto">
            <a id="google-review-link" href="https://g.page/r/drbikesydney/review" target="_blank" rel="noopener"
              style="display:flex;align-items:center;justify-content:center;gap:10px;background:var(--white);border:2px solid var(--border);border-radius:10px;padding:14px 20px;text-decoration:none;font-weight:600;font-size:15px;color:var(--gray)">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Leave a Google Review
            </a>
            <a id="fb-share-link" href="https://www.facebook.com/drbikesydney" target="_blank" rel="noopener"
              style="display:flex;align-items:center;justify-content:center;gap:10px;background:#1877F2;border-radius:10px;padding:14px 20px;text-decoration:none;font-weight:600;font-size:15px;color:var(--white)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--white)"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
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
  const isReset = _loginMode === 'reset';
  const eyeOpen = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const eyeClosed = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

  screen.innerHTML = `
    <div class="login-wrap">
      <div class="login-logo" style="letter-spacing:-0.3px;font-size:24px">
        <img src="images/logo-db.png" alt="Dr. Bike Sydney" height="32" style="width:auto;display:block">
        <span>Dr. <span style="color:var(--blue)">Bike</span> Sydney</span>
      </div>
      <p style="text-align:center;font-size:13px;font-weight:600;color:var(--blue);margin:0 0 12px">Healthy bikes, happy riders</p>
      <h2 class="login-title">${isReset ? 'Reset Password' : isSignup ? 'Create Account' : 'Welcome Back!'}</h2>
      <p class="login-sub text-secondary text-center">${isReset ? "Enter your email and we'll send you a reset link" : isSignup ? 'Join Dr. Bike Sydney' : 'Login to your account'}</p>
      ${
        isReset
          ? ''
          : `<button type="button" id="google-btn" class="google-btn" style="width:100%;padding:14px;min-height:48px;background:var(--white);border-radius:10px;color:var(--navy);font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px">
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
      </div>`
      }
      <form class="login-form" id="login-form" novalidate>
        ${isSignup ? `<div class="form-field"><input type="text" id="login-name" class="form-input" placeholder="Full Name" aria-label="Full Name" autocomplete="name"></div>` : ''}
        <div class="form-field">
          <input type="email" id="login-email" class="form-input" placeholder="your@email.com" aria-label="Email address" autocomplete="email">
        </div>
        ${
          isReset
            ? ''
            : `<div class="form-field form-field--password">
          <input type="password" id="login-password" class="form-input" placeholder="Password" aria-label="Password" autocomplete="${isSignup ? 'new-password' : 'current-password'}">
          <button type="button" class="password-toggle" id="pwd-toggle" aria-label="Toggle password visibility">
            <span id="eye-icon">${eyeOpen}</span>
          </button>
        </div>`
        }
        ${!isSignup && !isReset ? `<div class="forgot-wrap" style="gap:14px"><button type="button" class="btn btn--ghost forgot-link" id="forgot-email-btn">Forgot your email?</button><button type="button" class="btn btn--ghost forgot-link" id="forgot-btn">Forgot Password?</button></div>` : ''}
        <div id="login-error" class="booking-error" hidden></div>
        <div id="login-info" class="booking-success" hidden></div>
        <button type="submit" class="btn btn--primary btn--full mt-4" id="login-submit">${isReset ? 'Send reset link' : isSignup ? 'Create Account' : 'Login'}</button>
      </form>
      <div class="login-footer">
        ${
          isReset
            ? `<button class="link-btn" id="toggle-mode">Back to sign in</button>`
            : isSignup
              ? `Already have an account? <button class="link-btn" id="toggle-mode">Sign in</button>`
              : `Don't have an account? <button class="link-btn" id="toggle-mode">Sign up</button>`
        }
      </div>
      ${
        isReset
          ? `<div style="text-align:center;margin-top:14px">
        <a href="https://wa.me/61433963250?text=${encodeURIComponent("Hi Dr. Bike! I can't remember which email I used to sign up - can you help me find my account?")}" target="_blank" rel="noopener" style="font-size:13px;color:var(--color-text-secondary)">Don't remember your email either? <span style="color:var(--blue);font-weight:600">WhatsApp us</span></a>
      </div>`
          : ''
      }
    </div>
    ${createBottomNav('profile')}
  `;

  const googleBtn = screen.querySelector('#google-btn');

  const pwdInput = screen.querySelector('#login-password');
  const eyeEl = screen.querySelector('#eye-icon');
  screen.querySelector('#pwd-toggle')?.addEventListener('click', () => {
    const show = pwdInput.type === 'password';
    pwdInput.type = show ? 'text' : 'password';
    eyeEl.innerHTML = show ? eyeClosed : eyeOpen;
  });

  screen.querySelector('#toggle-mode').addEventListener('click', () => {
    _loginMode = isReset ? 'signin' : _loginMode === 'signin' ? 'signup' : 'signin';
    renderLogin();
  });

  screen.querySelector('#forgot-btn')?.addEventListener('click', () => {
    _loginMode = 'reset';
    renderLogin();
  });

  // "I forgot which email I used." An address cannot be reset, only recalled,
  // so this asks for the phone on the account and texts the masked address
  // back. It never appears on screen: otherwise anyone could type numbers into
  // a form and harvest addresses.
  screen.querySelector('#forgot-email-btn')?.addEventListener('click', async () => {
    const phone = await confirmDialog({
      title: 'Forgot your email?',
      message:
        'Enter the mobile number on your account and we will text you the email you signed up with.',
      confirmLabel: 'Send it to me',
      cancelLabel: 'Cancel',
      prompt: { id: 'recover-phone', type: 'tel', placeholder: '0400 000 000' },
    });
    if (!phone) return;
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'recover-email', phone, lang: getLang() }),
      });
    } catch (e) {
      /* the message below is deliberately the same either way */
    }
    // Always the same answer, registered or not - the server works the same
    // way, and saying "no account with that number" would confirm to a
    // stranger which numbers are on file.
    showToast('If that number has an account, we just texted you the email', 'success');
  });

  googleBtn?.addEventListener('click', async () => {
    const errEl = screen.querySelector('#login-error');
    errEl.hidden = true;
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/index.html' },
      });
      if (error) throw error;
    } catch (e) {
      errEl.textContent = translateValue(e.message || 'Google login failed. Please try again.');
      errEl.hidden = false;
    }
  });

  screen.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = screen.querySelector('#login-submit');
    const errEl = screen.querySelector('#login-error');
    const infoEl = screen.querySelector('#login-info');
    const email = screen.querySelector('#login-email').value.trim();
    errEl.hidden = true;
    infoEl.hidden = true;

    if (isReset) {
      if (!email) {
        errEl.textContent = 'Please enter your email.';
        errEl.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const resp = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'request-password-reset', email }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error);
        renderResetSent(email);
      } catch (err) {
        errEl.textContent = translateValue(
          err.message || 'Could not send reset link. Please try again.'
        );
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Send reset link';
      }
      return;
    }

    const password = screen.querySelector('#login-password').value;
    const name = isSignup ? screen.querySelector('#login-name')?.value.trim() || '' : '';

    if (!email || !password) {
      errEl.textContent = 'Please fill in all fields.';
      errEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = isSignup ? 'Creating account...' : 'Logging in...';

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
        _loginMode = 'signin';
        // Back to the booking they were sending us to sign in for, if any.
        goAfterLogin();
        return;
      }
      // Sign-up has no session until the email is verified, so there is
      // nothing to go back TO yet - sending them to the summary would just
      // bounce off the same check and land them back here.
      _loginMode = 'signin';
      router.navigate('home');
    } catch (err) {
      errEl.textContent = translateValue(err.message || 'Authentication failed. Please try again.');
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = isSignup ? 'Create Account' : 'Login';
    }
  });
}

// ── Password reset: "check your email" confirmation ─────────────────────────
function renderResetSent(email) {
  const screen = document.querySelector('[data-screen="login"]');
  if (!screen) return;
  const mailIcon = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 7l9 6 9-6"></path></svg>`;

  screen.innerHTML = `
    <div class="login-wrap">
      <div class="reset-sent-icon">${mailIcon}</div>
      <h2 class="login-title" style="text-align:center">Check your email</h2>
      <p class="login-sub text-secondary text-center">We sent a password reset link to <strong style="color:var(--color-text)">${escapeHtml(email)}</strong></p>
      <p class="login-sub text-secondary text-center" style="margin-top:-8px">It can take a minute to arrive.</p>
      <button type="button" class="btn btn--secondary btn--full mt-4" id="resend-reset-btn">Resend email</button>
      <div class="login-footer">
        <button class="link-btn" id="back-to-signin-btn">Back to sign in</button>
      </div>
      <div style="text-align:center;margin-top:14px">
        <a href="https://wa.me/61433963250?text=${encodeURIComponent("Hi Dr. Bike! I can't remember which email I used to sign up - can you help me find my account?")}" target="_blank" rel="noopener" style="font-size:13px;color:var(--color-text-secondary)">Don't remember your email either? <span style="color:var(--blue);font-weight:600">WhatsApp us</span></a>
      </div>
    </div>
    ${createBottomNav('profile')}
  `;

  screen.querySelector('#back-to-signin-btn').addEventListener('click', () => {
    _loginMode = 'signin';
    renderLogin();
  });

  const resendBtn = screen.querySelector('#resend-reset-btn');
  resendBtn.addEventListener('click', async () => {
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending...';
    try {
      const resp = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'request-password-reset', email }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error);
      resendBtn.textContent = 'Link sent';
    } catch (err) {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend email';
      showToast(
        translateValue(err.message || 'Could not send reset link. Please try again.'),
        'error'
      );
    }
  });
}

// ── Password recovery: Supabase redirects here with a recovery session and
// fires PASSWORD_RECOVERY instead of SIGNED_IN. Prompt for a new password
// rather than dropping the user on Home still holding their old one.
function promptNewPassword() {
  document.getElementById('reset-pw-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'reset-pw-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px;padding:24px;width:100%;max-width:360px">
      <div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:6px">Set a new password</div>
      <div style="font-size:13px;color:var(--gray);margin-bottom:16px">Choose a new password for your account.</div>
      <input id="reset-pw-inp" type="password" placeholder="New password" aria-label="New password" autocomplete="new-password"
        style="width:100%;box-sizing:border-box;padding:12px 14px;font-size:15px;border:1.5px solid var(--border);border-radius:10px;font-family:inherit;margin-bottom:10px">
      <div id="reset-pw-err" style="display:none;color:var(--red);font-size:13px;margin-bottom:10px"></div>
      <button id="reset-pw-btn" class="btn btn--primary btn--full">Update password</button>
    </div>
  `;
  document.body.appendChild(modal);
  translateScreen(modal); // outside [data-screen], not covered by the router's auto-translate observer
  const inp = modal.querySelector('#reset-pw-inp');
  inp.focus();
  const errEl = modal.querySelector('#reset-pw-err');
  const btn = modal.querySelector('#reset-pw-btn');

  async function submit() {
    const password = inp.value;
    if (password.length < 6) {
      errEl.textContent = 'Password must be at least 6 characters.';
      errEl.style.display = 'block';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Updating...';
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      modal.remove();
      showToast('Password updated - you are signed in.', 'success');
      router.navigate('home');
    } catch (e) {
      errEl.textContent = translateValue(
        e.message || 'Could not update password. Please try again.'
      );
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Update password';
    }
  }
  btn.addEventListener('click', submit);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
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

  // null = not signed in, [] = signed in with none yet, throw = we could not
  // find out. Each one reads differently, and until 2026-07-28 all three
  // showed the same thing: two invented bookings.
  let allBookings;
  try {
    allBookings = await getMyBookings();
  } catch {
    screen.querySelector('#bookings-list').innerHTML = createEmptyState(
      `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l22 22"></path><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>`,
      navigator.onLine ? 'Could not load your bookings' : "You're offline",
      'Please check your connection and try again.'
    );
    translateScreen(screen);
    return;
  }
  if (allBookings === null) {
    screen.querySelector('#bookings-list').innerHTML =
      createEmptyState(
        '<div style="font-size:40px" aria-hidden="true">🔒</div>',
        'Sign in to see your bookings',
        'Your bookings will appear here'
      ) +
      '<div style="text-align:center;margin-top:4px"><a href="#login" class="btn btn--primary" style="text-decoration:none">Sign in</a></div>';
    translateScreen(screen);
    return;
  }
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

    const truncatedNote =
      tab === 'history' && bookingsTruncated
        ? '<div style="text-align:center;padding:10px;font-size:12px;color:var(--gray)">Showing your most recent bookings</div>'
        : '';
    list.innerHTML = truncatedNote + filtered.map((b) => createBookingCard(b)).join('');

    list.querySelectorAll('.booking-card').forEach((card) => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const booking = allBookings.find((b) => String(b.id) === card.dataset.bookingId);
        if (!booking) return;
        const STATUS_COLORS = {
          pending: '#B45309',
          confirmed: '#1E40AF',
          enroute: '#15803D',
          en_route: '#15803D',
          in_progress: '#15803D',
          inprogress: '#15803D',
          arrived: '#15803D',
          completed: '#64748B',
          cancelled: '#CF2020',
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
          <div id="detail-panel" style="background:var(--white);border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;box-shadow:var(--elevation-2)">
            <div style="width:36px;height:4px;background:var(--border);border-radius:4px;margin:0 auto 20px"></div>
            <div style="font-size:18px;font-weight:800;color:var(--navy);margin-bottom:4px">${booking.service_name || 'Service'}</div>
            <div style="display:inline-block;font-size:11px;font-weight:600;color:${sc};background:${sc}1A;padding:3px 10px;border-radius:20px;margin-bottom:20px">${sl}</div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;background:var(--surface);border-radius:12px;padding:16px;border:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;font-size:15px"><span style="color:var(--gray)">Date</span><span style="font-weight:600;color:var(--navy)">${booking.scheduled_date || '--'}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:15px"><span style="color:var(--gray)">Time</span><span style="font-weight:600;color:var(--navy)">${toDisplayTime(booking.scheduled_time) || '--'}</span></div>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;font-size:15px"><span style="color:var(--gray)">Address</span><span style="font-weight:600;color:var(--navy);text-align:right;max-width:60%">${booking.address || '--'}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:15px"><span style="color:var(--gray)">Call-out fee</span><span style="font-weight:600;color:var(--navy)">$${booking.callout_fee ?? 20}</span></div>
            </div>
            ${booking.status === 'cancelled' && booking.cancellation_reason ? `<div style="background:var(--red-lt);border:1px solid var(--red-edge);border-radius:12px;padding:14px 16px;margin-bottom:16px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--red);margin-bottom:4px">Cancellation reason</div><div style="font-size:15px;color:#7F1D1D">${booking.cancellation_reason}</div></div>` : ''}
            ${
              booking.status === 'completed' &&
              (booking.photo_before_url || booking.photo_after_url)
                ? `<div style="margin-bottom:16px">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--gray);margin-bottom:8px">Photos</div>
                    <div style="display:flex;gap:8px">
                      ${
                        booking.photo_before_url
                          ? `<a href="${escapeHtml(booking.photo_before_url)}" target="_blank" rel="noopener" style="flex:1;min-width:0;text-decoration:none">
                              <img src="${escapeHtml(booking.photo_before_url)}" alt="Before" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;border:1px solid var(--border);display:block">
                              <div style="font-size:11px;color:var(--gray);text-align:center;margin-top:4px">Before</div>
                            </a>`
                          : ''
                      }
                      ${
                        booking.photo_after_url
                          ? `<a href="${escapeHtml(booking.photo_after_url)}" target="_blank" rel="noopener" style="flex:1;min-width:0;text-decoration:none">
                              <img src="${escapeHtml(booking.photo_after_url)}" alt="After" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;border:1px solid var(--border);display:block">
                              <div style="font-size:11px;color:var(--gray);text-align:center;margin-top:4px">After</div>
                            </a>`
                          : ''
                      }
                    </div>
                  </div>`
                : ''
            }
            <div style="display:flex;flex-direction:column;gap:8px">
              ${booking.status === 'completed' ? '<button id="book-again-btn" class="btn btn--primary btn--full btn-press"><span aria-hidden="true">↻</span> <span>Book Again</span></button>' : ''}
              ${booking.status === 'enroute' || booking.status === 'en_route' || booking.status === 'in_progress' ? '<button id="track-live-btn" class="btn btn--primary btn--full btn-press">Track Live</button>' : ''}
              ${booking.tracking_token ? '<button id="share-track-btn" class="btn btn--secondary btn--full btn-press">Share tracking link</button>' : ''}
              ${canCancel ? '<button id="reschedule-btn" class="btn btn--secondary btn--full btn-press">Reschedule</button>' : ''}
              ${canCancel ? '<button id="cancel-booking-btn" class="btn btn--danger btn--full btn-press">Cancel booking</button>' : ''}
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
            body: JSON.stringify({ role: 'public-track', tracking_token: booking.tracking_token }),
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
                ? `<img src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.name)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
                : `<div style="width:44px;height:44px;border-radius:50%;background:var(--blue-lt);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--blue)">${escapeHtml(initials)}</div>`;
              const metaParts = [];
              if (p.jobs_completed > 0) metaParts.push(`${p.jobs_completed} services`);
              if (p.rating) metaParts.push(`★ ${p.rating}`);
              sectionEl.style.cssText =
                'margin-top:16px;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden';
              sectionEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;padding:14px 16px">
                  ${avatarHTML}
                  <div style="min-width:0">
                    <div style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.04em">Your mechanic</div>
                    <div style="font-size:15px;font-weight:700;color:var(--navy)">${escapeHtml(p.name)}</div>
                    ${metaParts.length ? `<div style="font-size:13px;color:var(--gray)">${metaParts.join('  ·  ')}</div>` : ''}
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
          let services;
          try {
            services = await getServices();
          } catch {
            showToast('Could not load services', 'error');
            btn.innerHTML = '<span aria-hidden="true">↻</span> <span>Book Again</span>';
            btn.disabled = false;
            return;
          }
          const match = (services || []).find((s) => s.name === booking.service_name);
          if (!match) {
            showToast('That service is no longer available. Please pick a new one.', 'error');
            // Rebuild the split icon/text spans - textContent would flatten them
            // back into one node and break the i18n exact-match lookup.
            btn.innerHTML = '<span aria-hidden="true">↻</span> <span>Book Again</span>';
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
              <div style="font-size:18px;font-weight:700;margin-bottom:20px">📅 <span>Reschedule</span></div>
              <div style="margin-bottom:16px">
                <label for="resched-date" style="font-size:13px;color:var(--color-text-secondary);display:block;margin-bottom:6px">New date</label>
                <input id="resched-date" type="date" min="${tomorrow}" value="${escapeHtml(booking.scheduled_date || '')}"
                  style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-size:15px;background:var(--color-bg);color:var(--color-text)">
              </div>
              <div style="margin-bottom:24px">
                <label for="resched-time" style="font-size:13px;color:var(--color-text-secondary);display:block;margin-bottom:6px">New time</label>
                <select id="resched-time" disabled style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-size:15px;background:var(--color-bg);color:var(--color-text)">
                  <option>Loading available times...</option>
                </select>
                <div id="resched-time-err" style="display:none;font-size:13px;color:var(--color-error);margin-top:6px"></div>
              </div>
              <button id="confirm-resched-btn" class="btn btn--primary btn--full" style="margin-bottom:10px">Confirm reschedule</button>
              <button id="back-detail-btn" class="btn btn--secondary btn--full">Back</button>
            `;
            panel
              .querySelector('#back-detail-btn')
              .addEventListener('click', () => overlay.remove());

            // Real availability, same check the booking wizard uses - the old
            // fixed 8-slot list didn't know which times were actually taken.
            async function loadReschedTimes(date) {
              const timeSel = panel.querySelector('#resched-time');
              const errEl = panel.querySelector('#resched-time-err');
              if (!timeSel) return;
              errEl.style.display = 'none';
              timeSel.disabled = true;
              timeSel.innerHTML = '<option>Loading available times...</option>';
              try {
                const slots = await getAvailableSlots(date);
                const anyAvailable = slots.some((s) => s.available);
                // The option VALUE is the 24h time the endpoint validates
                // (`client-reschedule` rejects anything but HH:MM); the label
                // stays the 12-hour slot name the client already sees in the
                // booking wizard. Posting the label is what made every
                // reschedule fail with "Invalid time format (HH:MM)".
                timeSel.innerHTML = slots
                  .map((s) => {
                    const value = toDbTime(s.time);
                    const isCurrent = sameTime(s.time, booking.scheduled_time);
                    return `<option value="${escapeHtml(value || '')}" ${!s.available ? 'disabled' : ''} ${isCurrent && s.available ? 'selected' : ''}>${escapeHtml(toDisplayTime(s.time) || s.time)}${!s.available ? translateValue(' - unavailable') : ''}</option>`;
                  })
                  .join('');
                timeSel.disabled = !anyAvailable;
                if (!anyAvailable) {
                  errEl.textContent = 'No times available that day - try another date.';
                  errEl.style.display = 'block';
                }
              } catch {
                timeSel.innerHTML = '<option>Could not load times</option>';
                errEl.textContent = 'Could not check availability. Try again.';
                errEl.style.display = 'block';
              }
            }
            panel
              .querySelector('#resched-date')
              .addEventListener('change', (e) => loadReschedTimes(e.target.value));
            loadReschedTimes(booking.scheduled_date || tomorrow);

            panel.querySelector('#confirm-resched-btn').addEventListener('click', async () => {
              const newDate = panel.querySelector('#resched-date').value;
              // Already 24h - the <option> values are built with toDbTime().
              // Converted again rather than trusted, so a slot the endpoint
              // would reject is caught here instead of after the round trip.
              const newTime = toDbTime(panel.querySelector('#resched-time').value);
              if (!newDate) {
                showToast('Select a date.', 'error');
                return;
              }
              if (!newTime) {
                showToast('Select a time.', 'error');
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

// Converts the VAPID public key (base64url, from the server) into the raw byte
// array format pushManager.subscribe() expects.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Requests notification permission, subscribes via the service worker's push
// manager, and saves the subscription on the client's profile so
// notifyClientOfMechanicMessage (api/auth.js) can reach them.
async function enablePushNotifications() {
  if (
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    showToast('Push notifications are not supported on this browser', 'error');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      showToast('Notification permission was not granted', 'error');
      return;
    }
    const keyResp = await fetch('/api/auth?role=vapid-public-key');
    const { key } = await keyResp.json();
    if (!key) {
      showToast('Notifications are not set up yet - try again later', 'error');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    await sb
      .from('profiles')
      .update({ push_subscription: JSON.stringify(sub) })
      .eq('id', user.id);
    showToast('Notifications enabled!', 'success');
  } catch (e) {
    showToast('Could not enable notifications: ' + e.message, 'error');
  }
}

// ── Profile + Referral ────────────────────────────────────────────────
async function renderProfile() {
  const screen = document.querySelector('[data-screen="profile"]');
  if (!screen) return;

  // Painted before the first await, with the same header and nav the finished
  // screen uses: sb.auth.getUser() is a network round trip, and until it came
  // back this screen was an empty box. On a slow connection that is
  // indistinguishable from the app being broken.
  screen.innerHTML = `
    ${createHeader('Profile', false)}
    ${createBrandLoader()}
    ${createBottomNav('profile')}
  `;

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
    membershipPlan = null,
    savedCardId = null;
  try {
    const { data: profile } = await sb
      .from('profiles')
      .select(
        'referral_code, referral_credits, referral_count, membership_status, membership_plan, membership_started_at, stripe_default_payment_method_id'
      )
      .eq('id', user.id)
      .single();
    if (profile) {
      credits = profile.referral_credits || 0;
      referralCount = profile.referral_count || 0;
      membershipStatus = profile.membership_status || null;
      membershipPlan = profile.membership_plan || null;
      savedCardId = profile.stripe_default_payment_method_id || null;
      if (!profile.referral_code) {
        const { error: refCodeErr } = await sb
          .from('profiles')
          .update({ referral_code: refCode })
          .eq('id', user.id);
        if (refCodeErr)
          console.warn('[renderProfile] could not save referral_code:', refCodeErr.message);
      }
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

      <div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:16px;margin-top:16px;box-shadow:var(--elevation-0)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          ${createTierBadge(riderTier, 'lg')}
          <div style="font-size:13px;color:var(--gray)"><span>${completedJobs}</span> <span>${completedJobs === 1 ? 'service completed' : 'services completed'}</span></div>
        </div>
        ${
          riderTier.nextAt
            ? `<div style="height:6px;background:var(--border-lt);border-radius:4px;overflow:hidden;margin-bottom:6px">
                 <div style="height:100%;width:${riderTier.progressPct}%;background:${riderTier.color};border-radius:4px;transition:width var(--motion-base)"></div>
               </div>
               <div style="font-size:13px;color:var(--gray)"><span>${riderTier.nextAt - completedJobs}</span> <span>${riderTier.nextAt - completedJobs === 1 ? 'more service to reach' : 'more services to reach'}</span> <span>${riderTier.nextLabel}</span></div>`
            : `<div style="font-size:13px;color:var(--gray)">You've reached our highest tier - thank you for riding with us!</div>`
        }
      </div>

      <div style="background:linear-gradient(135deg,var(--blue-dark),var(--blue2));border-radius:16px;padding:20px;margin:20px 0;text-align:center">
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">Your referral code</div>
        <div id="ref-code-display" style="font-size:28px;font-weight:900;color:var(--white);letter-spacing:0.18em;margin-bottom:4px">${refCode}</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-bottom:16px">You and your friend each get $15 off</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button id="copy-code-btn" style="background:rgba(255,255,255,0.15);color:var(--white);border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer">Copy code</button>
          <a href="https://wa.me/?text=${shareMsg}" target="_blank" style="background:var(--wa);color:var(--white);border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:6px"><span aria-hidden="true">📱</span><span>Share</span></a>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div style="background:var(--blue-lt);border-radius:12px;padding:16px;text-align:center;border:1px solid var(--blue-edge)">
          <div style="font-size:28px;font-weight:800;color:var(--blue-dark)">${referralCount}</div>
          <div style="font-size:13px;color:var(--gray);margin-top:2px;font-weight:600">Friends referred</div>
        </div>
        <div style="background:var(--green-lt);border-radius:12px;padding:16px;text-align:center;border:1px solid #BBF7D0">
          <div style="font-size:28px;font-weight:800;color:var(--green)">$${credits}</div>
          <div style="font-size:13px;color:var(--gray);margin-top:2px;font-weight:600">Credits earned</div>
        </div>
      </div>

      <div style="background:var(--surface);border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid var(--border)">
        <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:10px">How it works</div>
        <div style="font-size:13px;color:var(--gray);line-height:1.8">
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
                ? '<span style="background:rgba(255,255,255,0.2);color:var(--white);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">Paused</span>'
                : '<span style="background:rgba(255,255,255,0.2);color:var(--white);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px"><span style="width:6px;height:6px;border-radius:50%;background:#4ADE80;display:inline-block"></span>Active</span>';
              return `<div style="margin-bottom:20px">
          <div style="background:linear-gradient(135deg,${planColor},var(--blue));border-radius:16px;padding:18px;color:var(--white);margin-bottom:10px;box-shadow:var(--elevation-1)">
            <div style="font-size:11px;font-weight:700;opacity:0.7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Membership</div>
            <div style="font-size:20px;font-weight:800"><span>${planLabel}</span> <span>Plan</span></div>
            <div style="margin-top:8px">${statusBadge}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button id="membership-toggle-btn" class="btn-press" style="flex:1;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid ${isPaused ? '#15803D' : '#B45309'};color:${isPaused ? '#15803D' : '#B45309'};background:#fff">
              ${isPaused ? 'Resume membership' : 'Pause membership'}
            </button>
            <button id="membership-cancel-btn" class="btn-press" style="flex:1;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid var(--border);color:var(--gray);background:var(--white)">Cancel</button>
          </div>
        </div>`;
            })()
          : ''
      }

      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Language</div>
        <div style="display:flex;gap:8px" id="lang-switcher">
          ${LANGUAGES.map(
            (l) =>
              `<button data-lang="${l.code}" class="lang-btn" style="flex:1;padding:10px 8px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid ${l.code === getLang() ? '#2563EB' : '#E2E8F0'};background:${l.code === getLang() ? '#EFF6FF' : '#fff'};color:${l.code === getLang() ? '#2563EB' : '#475569'}">${l.label}</button>`
          ).join('')}
        </div>
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Payment Method</div>
        <div id="card-on-file-section" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px">
          ${
            savedCardId
              ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                <div style="min-width:0">
                  <div style="font-size:15px;font-weight:600;color:var(--navy)">💳 Card on file</div>
                  <div style="font-size:13px;color:var(--gray);margin-top:2px">Auto-charged when your mechanic completes a job</div>
                </div>
                <button id="remove-card-btn" style="flex-shrink:0;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid var(--red);color:var(--red);background:var(--white);white-space:nowrap">Remove</button>
              </div>`
              : `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                <div style="min-width:0">
                  <div style="font-size:15px;font-weight:600;color:var(--navy)">No card saved</div>
                  <div style="font-size:13px;color:var(--gray);margin-top:2px">Save a card so your mechanic can charge you automatically instead of using EFTPOS</div>
                </div>
                <button id="add-card-btn" style="flex-shrink:0;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid var(--blue);color:var(--blue);background:var(--white);white-space:nowrap">Add card</button>
              </div>`
          }
        </div>
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Notifications</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px">
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:600;color:var(--navy)">Mechanic messages</div>
            <div style="font-size:13px;color:var(--gray);margin-top:2px">Get a phone alert when your mechanic messages you</div>
          </div>
          ${
            typeof Notification !== 'undefined' && Notification.permission === 'granted'
              ? '<span style="flex-shrink:0;font-size:13px;font-weight:600;color:var(--green);white-space:nowrap">✓ <span>Enabled</span></span>'
              : '<button id="push-enable-btn" style="flex-shrink:0;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid var(--blue);color:var(--blue);background:var(--white);white-space:nowrap">Enable</button>'
          }
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
      // Paint the selected state immediately - the highlight used to wait for
      // the full renderProfile() round-trip (getUser + profile + bookings
      // queries), which lags well behind the instant text translation and
      // looked "stuck" until a second tap forced a re-render.
      const chosen = btn.dataset.lang;
      screen.querySelectorAll('.lang-btn').forEach((b) => {
        const active = b.dataset.lang === chosen;
        b.style.borderColor = active ? '#2563EB' : '#E2E8F0';
        b.style.background = active ? '#EFF6FF' : '#fff';
        b.style.color = active ? '#2563EB' : '#475569';
      });
      setLang(chosen);
      // Persist it on the profile too: the reminder/birthday/re-engagement
      // emails are sent by crons with no browser to ask what language this
      // client reads. Best-effort - a failure here must not block the switch.
      sb.from('profiles')
        .update({ preferred_lang: chosen })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) console.error('[lang] could not save preferred_lang:', error.message);
        });
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

  screen.querySelector('#add-card-btn')?.addEventListener('click', async () => {
    const section = screen.querySelector('#card-on-file-section');
    section.innerHTML = `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">
        <div id="new-card-element" class="card-element"></div>
      </div>
      <div id="add-card-error" class="booking-error" hidden style="margin-bottom:10px"></div>
      <div style="display:flex;gap:8px">
        <button id="add-card-cancel-btn" class="btn btn--secondary" style="flex:1">Cancel</button>
        <button id="add-card-save-btn" class="btn btn--primary" style="flex:1">Save card</button>
      </div>`;
    await createPaymentForm('new-card-element');
    section.querySelector('#add-card-cancel-btn').addEventListener('click', () => renderProfile());
    section.querySelector('#add-card-save-btn').addEventListener('click', async () => {
      const btn = section.querySelector('#add-card-save-btn');
      const errEl = section.querySelector('#add-card-error');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      errEl.hidden = true;
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!session) throw new Error('Please sign in again.');
        const setupResp = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'save-card-setup',
            access_token: session.access_token,
            client_id: session.user.id,
          }),
        });
        const setupData = await setupResp.json();
        if (!setupResp.ok) throw new Error(setupData.error || 'Could not start card setup');
        const setupIntent = await confirmCardSetup(setupData.clientSecret);
        const confirmResp = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'save-card-confirm',
            access_token: session.access_token,
            client_id: session.user.id,
            setup_intent_id: setupIntent.id,
          }),
        });
        const confirmData = await confirmResp.json();
        if (!confirmResp.ok) throw new Error(confirmData.error || 'Could not save card');
        showToast('Card saved', 'success');
        renderProfile();
      } catch (e) {
        errEl.textContent = translateValue(e.message || 'Could not save card. Please try again.');
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Save card';
      }
    });
  });

  screen.querySelector('#remove-card-btn')?.addEventListener('click', async () => {
    const btn = screen.querySelector('#remove-card-btn');
    btn.disabled = true;
    btn.textContent = 'Removing...';
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) throw new Error('Please sign in again.');
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'remove-card',
          access_token: session.access_token,
          client_id: session.user.id,
        }),
      });
      showToast('Card removed', 'success');
      renderProfile();
    } catch (e) {
      showToast(translateValue(e.message || 'Could not remove card'), 'error');
      btn.disabled = false;
      btn.textContent = 'Remove';
    }
  });

  screen.querySelector('#push-enable-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Enabling...';
    await enablePushNotifications();
    renderProfile();
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
        showToast(translateValue(e.message || 'Something went wrong'), 'error');
        toggleBtn.disabled = false;
        toggleBtn.textContent = isPaused ? 'Resume membership' : 'Pause membership';
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      const goAhead = await confirmDialog({
        title: 'Cancel your membership?',
        message: 'It will stay active until the end of the current billing period.',
        confirmLabel: 'Cancel membership',
        cancelLabel: 'Keep it',
        destructive: true,
      });
      if (!goAhead) return;
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
        showToast(translateValue(e.message || 'Something went wrong'), 'error');
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

  // Same reason as renderProfile: two network calls run before the first line
  // of this screen's HTML exists.
  screen.innerHTML = `
    ${createHeader('My Bikes', false)}
    ${createBrandLoader()}
    ${createBottomNav('my-bikes')}
  `;

  let user = null;
  try {
    const { data } = await sb.auth.getUser();
    user = data?.user || null;
  } catch {}
  if (!user) {
    router.navigate('login');
    return;
  }

  // Service history is a Standard/VIP perk (Diego, 2026-07-22) - Basic and
  // non-members still get the bike list and Bike Health Score, just not the
  // per-service log. Fetched once here rather than per-bike-click.
  let hasHistoryAccess = false;
  try {
    const { data: profile } = await sb
      .from('profiles')
      .select('membership_plan, membership_status')
      .eq('id', user.id)
      .maybeSingle();
    hasHistoryAccess =
      ['standard', 'vip'].includes(profile?.membership_plan) &&
      profile?.membership_status === 'active';
  } catch {}

  screen.innerHTML = `
    ${createHeader('My Bikes', false)}
    <div class="profile-wrap">
      <div id="predicted-service-card" style="margin-bottom:16px"></div>
      <div id="bikes-list" style="margin-bottom:16px">
        <div style="text-align:center;padding:40px 0;color:var(--color-text-secondary)">
          <div style="width:88px;height:88px;border-radius:20px;background:var(--blue);display:flex;align-items:center;justify-content:center;margin:0 auto;opacity:0.5">
            <span style="display:inline-block;width:56px;height:38px;background-color:#fff;-webkit-mask:url('images/bike-icon.png') center/contain no-repeat;mask:url('images/bike-icon.png') center/contain no-repeat"></span>
          </div>
          <div style="margin-top:12px;font-size:15px">Loading bikes...</div>
        </div>
      </div>
      <button class="btn btn--primary btn--full" id="add-bike-btn">+ Add a Bike</button>

      <!-- Add bike form (hidden by default) -->
      <div id="add-bike-form" style="display:none;margin-top:20px;background:var(--color-surface);border-radius:16px;padding:20px;border:1px solid var(--color-border);box-shadow:var(--elevation-0)">
        <div style="font-size:15px;font-weight:700;margin-bottom:16px">New Bike</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <input id="bike-nickname" type="text" placeholder="Name (e.g. Red Trek)*" aria-label="Bike name" maxlength="60"
            style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:15px;outline:none"/>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <input id="bike-brand" type="text" placeholder="Brand" aria-label="Brand" maxlength="40"
              style="min-width:0;background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:15px;outline:none"/>
            <input id="bike-model" type="text" placeholder="Model" aria-label="Model" maxlength="40"
              style="min-width:0;background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:15px;outline:none"/>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <input id="bike-color" type="text" placeholder="Color" aria-label="Color" maxlength="30"
              style="min-width:0;background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:15px;outline:none"/>
            <input id="bike-year" type="number" placeholder="Year" aria-label="Year" min="1990" max="2030"
              style="min-width:0;background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:15px;outline:none"/>
          </div>
          <select id="bike-type" aria-label="Bike type"
            style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:15px;outline:none;appearance:none">
            <option value="">Type (optional)</option>
            <option value="road">Road</option>
            <option value="mtb">Mountain Bike</option>
            <option value="hybrid">Hybrid</option>
            <option value="ebike">E-Bike</option>
            <option value="cargo">Cargo</option>
            <option value="folding">Folding</option>
          </select>
          <div id="bike-form-error" style="font-size:13px;color:var(--color-error);min-height:16px"></div>
          <div style="display:flex;gap:10px">
            <button id="cancel-bike-btn" class="btn btn--secondary btn-press" style="flex:1">Cancel</button>
            <button id="save-bike-btn" class="btn btn--primary btn-press" style="flex:1">Save Bike</button>
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
          <div style="width:88px;height:88px;border-radius:20px;background:var(--blue);display:flex;align-items:center;justify-content:center;margin:0 auto">
            <span style="display:inline-block;width:56px;height:38px;background-color:#fff;-webkit-mask:url('images/bike-icon.png') center/contain no-repeat;mask:url('images/bike-icon.png') center/contain no-repeat"></span>
          </div>
          <div style="margin-top:14px;font-size:15px">No bikes added yet</div>
          <div style="font-size:13px;margin-top:4px;opacity:0.7">Add your first bike below</div>
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
        <div data-bike-id="${bike.id}" class="bike-card" style="cursor:pointer;background:var(--white);border-radius:14px;padding:16px;margin-bottom:12px;border:1px solid var(--color-border);display:flex;align-items:center;gap:14px">
          <div style="width:44px;height:44px;border-radius:12px;background:var(--color-primary-alpha,rgba(10,88,202,0.12));display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="display:inline-block;width:26px;height:18px;background-color:var(--color-primary);-webkit-mask:url('images/bike-icon.png') center/contain no-repeat;mask:url('images/bike-icon.png') center/contain no-repeat"></span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px">${bike.name}</div>
            <div style="font-size:13px;color:var(--color-text-secondary);margin-top:2px">
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
                <div style="font-size:18px;font-weight:700">${bike.name}</div>
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
                      `<div style="display:flex;justify-content:space-between;font-size:15px"><span style="color:var(--color-text-secondary)">${r[0]}</span><span style="font-weight:500">${r[1]}</span></div>`
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

          // Per-bike service history (bookings linked via bike_id) - Standard/VIP only
          (async () => {
            const hEl = overlay.querySelector('#history-list');
            if (!hEl) return;
            if (!hasHistoryAccess) {
              hEl.style.textAlign = 'left';
              hEl.style.padding = '0';
              hEl.innerHTML = `
                <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">
                  <span style="font-size:20px" aria-hidden="true">🔒</span>
                  <div style="min-width:0">
                    <div style="font-size:13px;font-weight:600;color:var(--color-text)">Service history is a Standard/VIP perk</div>
                    <div style="font-size:13px;color:var(--color-text-secondary);margin-top:2px">Upgrade your membership to see every past service for this bike.</div>
                  </div>
                </div>`;
              return;
            }
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
                completed: '#475569',
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
                    <div style="font-size:11px;color:var(--color-text-secondary);margin-top:2px">${b.scheduled_date || ''} · <span style="color:${SC[b.status] || '#475569'};font-weight:600">${(b.status || '').replace('_', ' ')}</span></div>
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
            const goAhead = await confirmDialog({
              title: 'Delete this bike?',
              message: 'This cannot be undone.',
              confirmLabel: 'Delete',
              cancelLabel: 'Cancel',
              destructive: true,
            });
            if (!goAhead) return;
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
              const COLOR = { ok: '#15803D', warn: '#B45309', critical: '#CF2020' };
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
              const scoreColor = avg >= 75 ? '#15803D' : avg >= 50 ? '#B45309' : '#CF2020';
              const scoreLabel =
                avg >= 75 ? 'Good' : avg >= 50 ? 'Needs attention' : 'Critical issues';
              const lastDate = new Date(bkgs[0].scheduled_date).toLocaleDateString(dateLocale(), {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              healthEl.innerHTML = `
                <div style="height:1px;background:var(--color-border);margin-bottom:16px"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-secondary)">Bike Health Score</div>
                  <div style="font-size:11px;color:var(--color-text-secondary)">Last service: ${lastDate}</div>
                </div>
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
                  <div style="width:64px;height:64px;flex-shrink:0;position:relative">
                    <svg viewBox="0 0 36 36" style="width:64px;height:64px;transform:rotate(-90deg)">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-border)" stroke-width="3"/>
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="${scoreColor}" stroke-width="3"
                        stroke-dasharray="${avg} ${100 - avg}" stroke-dashoffset="0" stroke-linecap="round"/>
                    </svg>
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:${scoreColor}">${avg}%</div>
                  </div>
                  <div>
                    <div style="font-size:18px;font-weight:700;color:${scoreColor}">${scoreLabel}</div>
                    <div style="font-size:13px;color:var(--color-text-secondary);margin-top:2px">${scored.length} components checked</div>
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

  // Predictive maintenance: estimate the next service date as a fixed 3-month
  // interval from the client's last completed service - matches the 3-month
  // minimum on every subscription plan, rather than an actual-history average
  // (which reads as "we want you back sooner" when history is short/sparse).
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

    if (completedDates.length < 1) return; // no service history yet

    const SERVICE_INTERVAL_DAYS = 90; // 3 months
    const lastDate = completedDates[completedDates.length - 1];
    const predicted = new Date(lastDate.getTime() + SERVICE_INTERVAL_DAYS * 86400000);
    const daysUntil = Math.round((predicted - new Date()) / 86400000);
    const dateLabel = predicted.toLocaleDateString(dateLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const overdue = daysUntil < 0;
    card.innerHTML = `
      <div style="background:${overdue ? '#FFFBEB' : '#EFF6FF'};border:1px solid ${overdue ? '#FCD34D' : '#BFDBFE'};border-radius:14px;padding:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:18px">${overdue ? '⚠️' : '📊'}</span>
          <span style="font-size:13px;font-weight:700;color:var(--navy)">${overdue ? "You're likely due for a service" : 'Predicted next service'}</span>
        </div>
        <div style="font-size:13px;color:var(--gray);line-height:1.5">
          <span>We recommend a service roughly every 3 months.</span>
          <span>${overdue ? 'You were due around' : 'Your next one is around'}</span>
          <b>${dateLabel}</b>.
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
      errEl.textContent = translateValue('Nickname is required');
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
  const targets = [
    { label: 'home-nav-auth-label', btn: 'home-nav-auth-btn' },
    { label: 'home-mobile-auth-label', btn: 'home-mobile-auth-btn' },
  ]
    .map((t) => ({
      labelEl: document.getElementById(t.label),
      btnEl: document.getElementById(t.btn),
    }))
    .filter((t) => t.btnEl);
  if (!targets.length) return;

  try {
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      targets.forEach(({ labelEl, btnEl }) => {
        if (labelEl) labelEl.textContent = 'Sign In';
        btnEl.href = '#login';
      });
      return;
    }

    const name = (user.user_metadata?.full_name || user.email || '').split('@')[0].split(' ')[0];

    // Text-only greeting - no tier icon/badge next to it (Diego: no photo or
    // logo beside "Hi, {name}" in the nav).
    targets.forEach(({ labelEl, btnEl }) => {
      if (labelEl) {
        labelEl.innerHTML = '';
        labelEl.append(document.createTextNode('Hi, '), document.createTextNode(name));
      }
      btnEl.href = '#profile';
    });
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
    '<div style="font-size:13px;color:var(--color-text-secondary)">&#128269; Analysing your photo...</div>';
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
      '<div style="font-size:13px;color:var(--color-error)">Could not analyse photo. Please describe the problem instead.</div>';
  }
}

async function runAIDiagnosisText(screen) {
  const text = screen.querySelector('#diag-text')?.value?.trim() || '';
  if (!text) return;
  const resultEl = screen.querySelector('#diag-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML =
    '<div style="font-size:13px;color:var(--color-text-secondary)">&#128269; Analysing...</div>';
  try {
    const resp = await fetch('/api/chat?type=diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text }),
    });
    showDiagResult(screen, await resp.json());
  } catch {
    resultEl.innerHTML =
      '<div style="font-size:13px;color:var(--color-error)">Could not process. Please select a service manually.</div>';
  }
}

function showDiagResult(screen, data) {
  const resultEl = screen.querySelector('#diag-result');
  if (!resultEl) return;
  const sev = data.severity || 'medium';
  const sevColor = sev === 'high' ? '#CF2020' : sev === 'low' ? '#15803D' : '#B45309';
  const urgColor =
    data.urgency === 'Urgent' ? '#CF2020' : data.urgency === 'Book soon' ? '#B45309' : '#15803D';
  const bookLabel = data.recommended_service_name
    ? 'Book ' +
      data.recommended_service_name +
      (data.recommended_service_price ? ' - $' + data.recommended_service_price : '') +
      ' →'
    : '';
  const bookHtml =
    data.recommended_service_id && bookLabel
      ? `<button id="diag-book-btn" style="width:100%;margin-top:10px;background:var(--color-primary);color:var(--white);border:none;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;text-align:left">${bookLabel}</button>`
      : '';
  resultEl.innerHTML = `
    <div style="background:var(--color-bg);border-radius:8px;padding:12px;border:1px solid var(--color-border)">
      <div style="font-size:13px;font-weight:700;color:var(--color-text);margin-bottom:6px">&#129302; AI Recommendation</div>
      <div style="font-size:13px;color:var(--color-text);margin-bottom:8px">${data.diagnosis || 'Bike issue detected'}</div>
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

// Auto-apply pending referral code after login; prompt for a new password
// when Supabase redirects back here from a password-reset email link.
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    promptNewPassword();
    return;
  }
  if (event !== 'SIGNED_IN' || !session) return;

  // Google takes the whole page and comes back at /, so the email form's own
  // goAfterLogin() never runs for that route. The key is only ever set when
  // the summary sent someone here to sign in, and it is consumed once, so
  // this cannot hijack an ordinary sign-in.
  if (localStorage.getItem(RETURN_TO_KEY)) goAfterLogin();

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

// ── Language control in the top bar ──────────────────────────────────────────
// The app already had a language picker, buried three taps deep in Profile.
// This is the same one landing.html carries in its header: one control that
// opens the three options, next to the sign-in button (Diego, 2026-07-28).
const SPA_LANG_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
const SPA_LANG_CARET =
  '<svg class="spa-lang__caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
const SPA_LANG_CHECK =
  '<svg class="spa-lang__check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

function renderSpaLangSwitcher() {
  const wrap = document.getElementById('spa-lang');
  if (!wrap) return;
  const code = getLang();
  const current = LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];

  // Icon only. This bar also holds the wordmark and the sign-in button, and at
  // 375px any text here pushed "Iniciar Sesión" onto two lines - in Spanish
  // and Chinese, which are exactly the readers who need this control. The
  // globe is the standard mark for it, the menu spells all three out, and
  // aria-label carries the name for a screen reader.
  wrap.innerHTML = `
    <button type="button" class="spa-lang__toggle" id="spa-lang-toggle" aria-haspopup="listbox" aria-expanded="false" aria-controls="spa-lang-menu" aria-label="Language" title="${current.label}">
      ${SPA_LANG_ICON}
    </button>
    <div class="spa-lang__menu" id="spa-lang-menu" role="listbox" aria-label="Language" hidden>
      ${LANGUAGES.map(
        (l) =>
          `<button type="button" class="spa-lang__option" role="option" data-lang="${l.code}" aria-selected="${l.code === current.code}"><span>${l.label}</span>${SPA_LANG_CHECK}</button>`
      ).join('')}
    </div>`;

  const toggle = wrap.querySelector('#spa-lang-toggle');
  const menu = wrap.querySelector('#spa-lang-menu');
  const options = [...menu.querySelectorAll('.spa-lang__option')];

  // Bound on open, unbound on close: this re-renders on every language change,
  // so a listener left on document would pile up one per switch.
  const onOutside = (e) => {
    if (!wrap.contains(e.target)) closeMenu(false);
  };
  function openMenu(index) {
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    const selected = options.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    options[typeof index === 'number' ? index : Math.max(0, selected)].focus();
  }
  function closeMenu(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onOutside);
    document.removeEventListener('touchstart', onOutside);
    if (refocus) toggle.focus();
  }

  toggle.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu(true)));
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openMenu(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(options.length - 1);
    }
  });
  options.forEach((opt, i) => {
    opt.addEventListener('click', () => {
      closeMenu(false);
      setLang(opt.dataset.lang);
      document.getElementById('spa-lang-toggle')?.focus();
    });
    opt.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        options[(i + 1) % options.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        options[(i - 1 + options.length) % options.length].focus();
      } else if (e.key === 'Tab') closeMenu(false);
    });
  });
}

router.init();
document.dispatchEvent(new Event('routerinit'));
renderSpaLangSwitcher();
updateHomeNav();
if (window._pendingReview) {
  setTimeout(() => router.navigate('review'), 200);
}

// Published for the non-module scripts on the page (js/live-prices.js needs
// sourceOf to map a translated service-card heading back to its English name).
// Object.assign because landing.html's own inline module publishes the same
// global and load order between the two is not guaranteed.
window.__drbikeI18n = Object.assign(window.__drbikeI18n || {}, {
  getLang,
  setLang,
  translateScreen,
  translateValue,
  dateLocale,
  sourceOf,
});

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
  renderSpaLangSwitcher();
});
