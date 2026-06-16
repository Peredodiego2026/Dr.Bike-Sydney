
// ── Surge & Early Bird Pricing ─────────────────────────────────────────────
const AU_PUBLIC_HOLIDAYS_2026 = [
  '2026-01-01','2026-01-26','2026-04-03','2026-04-04','2026-04-05','2026-04-06',
  '2026-04-25','2026-06-08','2026-08-03','2026-10-05','2026-12-25','2026-12-26','2026-12-28'
];

function getSurcharge(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  if (!dateStr) return { surge: 0, earlyBird: 0, label: '' };
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun,6=Sat
  const isWeekend = day === 0 || day === 6;
  const isHoliday = AU_PUBLIC_HOLIDAYS_2026.includes(dateStr);
  const surge = (isWeekend || isHoliday) ? 15 : 0;
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
import { sb, getServices, getAvailableSlots, createBooking, subscribeToMechanicLocation, submitReview, signIn, signUp, getMyBookings } from './supabase.js';
import { createHeader, createBottomNav, createServiceCard, formatServiceDuration, createTimeSlot, createDateItem, createSummaryRow, createBookingCard, createEmptyState, showToast } from './components.js';
import { createPaymentForm, createPaymentRequestButton, processPayment, destroyPaymentForm, createCheckoutSession } from './stripe.js';

window.appState = { service: null, date: null, time: null, location: 'Home', bookingId: null };

// Handle return from Stripe Checkout
(function handleCheckoutReturn() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('payment') === 'success') {
    const bookingId = p.get('booking');
    if (bookingId) window.appState.bookingId = bookingId;
    history.replaceState({}, '', '/');
    // Navigate to tracking after router initialises
    document.addEventListener('routerinit', () => router.navigate('tracking'), { once: true });
  }
  if (p.get('payment') === 'cancelled') {
    history.replaceState({}, '', '/');
  }
})();

let _trackingMap = null;
let _mechanicMarker = null;
let _unsubTracking = null;
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
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function bookingRef(id) {
  if (!id) return '#DBS-XXXX';
  return `#DBS-${String(id).replace(/-/g, '').substring(0, 6).toUpperCase()}`;
}

function updateContinueBtn(screen) {
  const btn = screen.querySelector('#continue-btn');
  if (btn) btn.disabled = !(window.appState.service && window.appState.date && window.appState.time);
}

async function loadTimeSlots(screen, date, serviceId) {
  const grid = screen.querySelector('#time-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="skeleton" style="height:44px;grid-column:1/-1"></div>'
    + '<div class="skeleton" style="height:44px;grid-column:1/-1"></div>';
  const slots = await getAvailableSlots(date, serviceId);
  grid.innerHTML = slots.map(s => createTimeSlot(s.time, s.available, false)).join('');
  grid.querySelectorAll('.time-slot:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
      btn.classList.add('selected');
      window.appState.time = btn.dataset.time;
      updateContinueBtn(screen);
    });
  });
}

function cleanupTracking() {
  if (_unsubTracking) { _unsubTracking(); _unsubTracking = null; }
  if (_trackingMap) { _trackingMap.remove(); _trackingMap = null; _mechanicMarker = null; }
}

async function loadLeaflet() {
  if (window.L) return;
  await new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = Object.assign(document.createElement('link'), {
        id: 'leaflet-css', rel: 'stylesheet',
        href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      });
      document.head.appendChild(link);
    }
    if (document.querySelector('script[src*="leaflet"]')) { resolve(); return; }
    const s = Object.assign(document.createElement('script'), {
      src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    });
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Book a Service ────────────────────────────────────────────────────────────
async function renderBookService() {
  const screen = document.querySelector('[data-screen="book-service"]');
  if (!screen) return;
  if (window.gtag) gtag('event', 'begin_checkout');
  if (window.fbq) fbq('track', 'InitiateCheckout');

  window.appState.time = null;

  const dates = generateDates(7);
  const todayStr = dates[0];
  const initialDate = (window.appState.date && dates.includes(window.appState.date))
    ? window.appState.date : todayStr;
  window.appState.date = initialDate;

  screen.innerHTML = `
    ${createHeader('Book a Service', true, '#home')}
    <div id="diag-block" style="background:#EEF3FC;border-radius:12px;padding:16px;margin:0 0 20px;border:1px solid #C7D9F8">
      <div style="font-size:13px;font-weight:700;color:#1848C8;margin-bottom:8px">&#128269; Not sure what your bike needs?</div>
      <div style="font-size:12px;color:#374151;margin-bottom:12px">Take a photo or describe the problem — our AI will recommend the right service.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <label style="flex:1;min-width:120px;cursor:pointer">
          <input type="file" accept="image/*" capture="environment" id="diag-photo" style="display:none">
          <div id="diag-photo-btn" style="background:white;border:2px solid #C7D9F8;border-radius:8px;padding:10px;text-align:center;font-size:12px;font-weight:600;color:#1848C8;cursor:pointer">&#128247; Take a Photo</div>
        </label>
        <div style="flex:2;min-width:140px">
          <textarea id="diag-text" placeholder="Describe the problem... (e.g. clicking noise when pedalling)" style="width:100%;border:2px solid #C7D9F8;border-radius:8px;padding:8px;font-size:12px;height:42px;resize:none;outline:none;box-sizing:border-box;font-family:inherit"></textarea>
        </div>
        <button id="diag-ask-btn" style="background:#1848C8;color:white;border:none;border-radius:8px;padding:10px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Ask AI &#8594;</button>
      </div>
      <div id="diag-result" style="margin-top:10px;display:none"></div>
    </div>
    <div class="section-label">Service Type</div>
    <div class="services-list" id="services-list">
      <div class="loading-row"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    </div>
    <div class="section-label mt-5">Select Date</div>
    <div class="date-carousel" id="date-carousel">
      ${dates.map(d => createDateItem(d, d === initialDate)).join('')}
    </div>
    <div class="section-label mt-5">Select Time</div>
    <div class="time-grid" id="time-grid">
      <div class="skeleton" style="height:44px;grid-column:1/-1"></div>
      <div class="skeleton" style="height:44px;grid-column:1/-1"></div>
    </div>
    <div class="section-label mt-5">Location</div>
    <div class="location-row">
      <div class="location-info">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <div>
          <div class="fw-600">Home</div>
          <div class="text-secondary text-sm">Service at your location</div>
        </div>
      </div>
      <button class="btn btn--ghost" id="change-location-btn">Change</button>
    </div>
    <div class="sticky-bottom">
      <button class="btn btn--primary btn--full" id="continue-btn" disabled>Continue</button>
    </div>
    ${createBottomNav('home')}
  `;

  window.appState.location = 'Home';

  const diagPhoto = screen.querySelector('#diag-photo');
  screen.querySelector('#diag-photo-btn').addEventListener('click', () => diagPhoto.click());
  diagPhoto.addEventListener('change', () => runAIDiagnosis(screen));
  screen.querySelector('#diag-ask-btn').addEventListener('click', () => runAIDiagnosisText(screen));
  screen.querySelector('#diag-text').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAIDiagnosisText(screen); }
  });

  const [services] = await Promise.all([
    getServices(),
    loadTimeSlots(screen, initialDate, window.appState.service?.id),
  ]);

  const list = screen.querySelector('#services-list');
  list.innerHTML = services.map(s => createServiceCard(s)).join('');

  if (window.appState.service) {
    const pre = list.querySelector(`[data-service-id="${window.appState.service.id}"]`);
    if (pre) { pre.classList.add('selected'); updateContinueBtn(screen); }
  }

  list.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('click', () => {
      list.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
      if (window.gtag) gtag('event', 'view_item', { currency: 'AUD', items: [{ item_name: s.name, price: s.price }] });
      card.classList.add('selected');
      window.appState.service = services.find(s => String(s.id) === card.dataset.serviceId);
      if (window.gtag) gtag('event', 'add_to_cart', { currency: 'AUD', items: [{ item_name: window.appState.service?.name, price: window.appState.service?.price }] });
      window.appState.time = null;
      updateContinueBtn(screen);
      loadTimeSlots(screen, window.appState.date, window.appState.service?.id);
    });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') card.click(); });
  });

  screen.querySelectorAll('.date-item').forEach(item => {
    item.addEventListener('click', () => {
      screen.querySelectorAll('.date-item').forEach(d => d.classList.remove('selected'));
      item.classList.add('selected');
      window.appState.date = item.dataset.date;
      window.appState.time = null;
      updateContinueBtn(screen);
      loadTimeSlots(screen, window.appState.date, window.appState.service?.id);
    });
  });

  screen.querySelector('#change-location-btn').addEventListener('click', () => {
    alert('Location change coming soon');
  });

  screen.querySelector('#continue-btn').addEventListener('click', () => {
    if (window.appState.service && window.appState.date && window.appState.time) {
      if (window.gtag) gtag('event', 'checkout_progress', { step: 2 });
      router.navigate('service-summary');
    }
  });
}

// ── Service Summary ───────────────────────────────────────────────────────────
async function renderServiceSummary() {
  const screen = document.querySelector('[data-screen="service-summary"]');
  if (!screen) return;

  const { service, date, time, location } = window.appState;
  if (!service) { router.navigate('book-service'); return; }
  if (window.gtag) gtag('event', 'checkout_progress', { step: 3 });

  screen.innerHTML = `
    ${createHeader('Service Summary', true, '#book-service')}
    <div class="summary-bike">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle>
        <path d="M5.5 17.5l4-10h6l3 6h-5l-2-3.5"></path>
        <circle cx="12" cy="5" r="2" fill="currentColor" stroke="none"></circle>
      </svg>
    </div>
    <div class="summary-card">
      ${createSummaryRow('Service', service.name)}
      ${(() => { const dur = formatServiceDuration(service); return dur ? createSummaryRow('Est. Duration', dur) : ''; })()}
      ${createSummaryRow('Date', formatDate(date))}
      ${createSummaryRow('Time', time || '-')}
      ${createSummaryRow('Location', location || 'Home')}
    </div>
    ${(() => {
      const adj = applyPricingAdjustments(Number(service.price||0), date);
      if (!adj.label) return '';
      return '<div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:10px 14px;font-size:13px;color:var(--color-text-secondary);margin-bottom:12px">' + adj.label + '</div>';
    })()}
    <div style="margin-bottom:16px">
      <div class="text-secondary text-sm" style="margin-bottom:6px">Referral or promo code</div>
      <div style="display:flex;gap:8px">
        <input id="referral-input" type="text" placeholder="Enter code (optional)"
          style="flex:1;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:10px 14px;color:var(--color-text);font-size:14px;outline:none;text-transform:uppercase" />
        <button id="referral-apply-btn" class="btn btn--secondary" style="padding:10px 16px;font-size:13px;white-space:nowrap">Apply</button>
      </div>
      <div id="referral-msg" style="font-size:12px;margin-top:6px;min-height:16px"></div>
    </div>
    <div class="summary-total">
      <span class="text-secondary">Total</span>
      <span class="summary-total__amount" id="summary-total-amount">$${(() => { const adj = applyPricingAdjustments(Number(service.price||0), date); return adj.total.toFixed(2); })()}</span>
    </div>
    <div id="booking-error" class="booking-error" hidden></div>
    <div class="sticky-bottom">
      <button class="btn btn--primary btn--full" id="proceed-btn">Proceed to Payment</button>
    </div>
    ${createBottomNav('home')}
  `;

  let _appliedDiscount = 0;
  screen.querySelector('#referral-apply-btn').addEventListener('click', async () => {
    const input = screen.querySelector('#referral-input');
    const msg   = screen.querySelector('#referral-msg');
    const code  = (input.value || '').trim().toUpperCase();
    if (!code) return;
    msg.style.color = 'var(--color-text-secondary)';
    msg.textContent = 'Checking...';
    try {
      const { data, error } = await sb.from('discount_codes')
        .select('discount_amount, discount_type, max_uses, uses_count, active')
        .eq('code', code).single();
      if (error || !data || !data.active) throw new Error('Invalid or expired code');
      if (data.max_uses && data.uses_count >= data.max_uses) throw new Error('Code has reached its limit');
      const base = service.price || 0;
      const disc = data.discount_type === 'percentage'
        ? Math.round(base * data.discount_amount / 100 * 100) / 100
        : Math.min(data.discount_amount, base);
      _appliedDiscount = disc;
      window.appState.discountCode   = code;
      window.appState.discountAmount = disc;
      const el = screen.querySelector('#summary-total-amount');
      if (el) el.textContent = '$' + Math.max(0, base - disc).toFixed(2);
      msg.style.color = 'var(--color-success)';
      msg.textContent = 'Code applied! -$' + disc.toFixed(2) + ' off';
      input.disabled = true;
      screen.querySelector('#referral-apply-btn').disabled = true;
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
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('Please sign in to complete your booking.');
      const meta = user.user_metadata || {};
      const booking = await createBooking({
        user_id: user.id,
        client_id: user.id,
        client_name: meta.full_name || meta.name || '',
        client_email: user.email || '',
        service_name: service.name,
        scheduled_date: date,
        scheduled_time: time,
        address: location || 'Home',
        status: 'pending',
        service_price: service.price,
      });
      window.appState.bookingId = booking.id;
      router.navigate('payment');
    } catch (e) {
      window.appState.bookingId = null;
      errEl.textContent = e.message || 'Could not save booking. Please try again.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Proceed to Payment';
    }
  });
}

// ── Payment ───────────────────────────────────────────────────────────────────
async function renderPayment() {
  const screen = document.querySelector('[data-screen="payment"]');
  if (!screen) return;

  destroyPaymentForm();

  const { service, bookingId } = window.appState;
  const price = service?.price || 0;
  const amountCents = Math.round(price * 100);
  const ref = bookingRef(bookingId);

  const cardIcons = `
    <svg width="38" height="24" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg" style="border-radius:3px">
      <rect width="38" height="24" fill="#1A1F71"/><text x="5" y="17" font-family="system-ui" font-weight="900" font-size="12" fill="white">VISA</text>
    </svg>
    <svg width="38" height="24" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg" style="border-radius:3px">
      <rect width="38" height="24" fill="#252525"/>
      <circle cx="14" cy="12" r="8" fill="#EB001B"/>
      <circle cx="24" cy="12" r="8" fill="#F79E1B"/>
      <path d="M19 5.5A8 8 0 0 1 22.8 12 8 8 0 0 1 19 18.5 8 8 0 0 1 15.2 12 8 8 0 0 1 19 5.5Z" fill="#FF5F00"/>
    </svg>`;

  screen.innerHTML = `
    ${createHeader('Payment', true, '#service-summary')}
    <div class="payment-amount">
      <div class="text-secondary text-sm">Total Amount</div>
      <div class="payment-amount__total">$${Number(price).toFixed(2)}</div>
    </div>
    <div class="payment-ref text-secondary text-sm">Booking ${ref}</div>
    <div class="payment-methods">${cardIcons}<span class="text-secondary text-xs" style="margin-left:auto">Apple Pay &bull; Google Pay</span></div>
    <button class="btn btn--checkout btn--full" id="checkout-btn" style="background:#0A58CA;color:#fff;border:none;border-radius:12px;height:52px;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm0-4h2v2h-2zm-6 0h4v2h-4z"/></svg>
      Pay with Apple Pay / Google Pay / Card
    </button>
    <div class="payment-divider" id="card-divider"><span>or pay by entering card details</span></div>
    <div id="payment-request-btn" hidden></div>
    <div class="section-label">Card Details</div>
    <div id="card-element" class="card-element"></div>
    <div id="payment-error" class="booking-error" hidden></div>
    <div class="payment-security">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      <span>Secure payment powered by Stripe. Encrypted and safe.</span>
    </div>
    <div class="sticky-bottom">
      <button class="btn btn--primary btn--full" id="pay-btn">Pay $${Number(price).toFixed(2)}</button>
    </div>
    ${createBottomNav('home')}
  `;

  await createPaymentForm('card-element');

  screen.querySelector('#checkout-btn').addEventListener('click', async () => {
    const btn = screen.querySelector('#checkout-btn');
    const errEl = screen.querySelector('#payment-error');
    btn.disabled = true;
    btn.textContent = 'Redirecting to secure checkout...';
    errEl.hidden = true;
    try {
      const email = await getEmail();
      await createCheckoutSession({
        amountCents,
        description: service?.name || 'Dr. Bike Sydney service',
        bookingId,
        email,
      });
    } catch (e) {
      errEl.textContent = e.message || 'Checkout failed. Please use card below.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Pay with Apple Pay / Google Pay / Card';
    }
  });

  const getEmail = async () => {
    try { const { data: { user } } = await sb.auth.getUser(); return user?.email || 'guest@drbikesydney.com.au'; }
    catch { return 'guest@drbikesydney.com.au'; }
  };

  const prSupported = await createPaymentRequestButton('payment-request-btn', {
    amountCents,
    label: service?.name || 'Dr. Bike Sydney',
    onPayment: async (paymentMethodId) => {
      const email = await getEmail();
      await processPayment(amountCents, bookingId, email, paymentMethodId);
      if (window.gtag) gtag('event', 'purchase', { transaction_id: bookingId, value: price, currency: 'AUD', items: [{ item_name: service?.name || 'Service' }] });
      router.navigate('tracking');
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
    btn.textContent = 'Processing...';
    errEl.hidden = true;
    try {
      const email = await getEmail();
      await processPayment(amountCents, bookingId, email);
      if (window.gtag) gtag('event', 'purchase', { transaction_id: bookingId, value: price, currency: 'AUD', items: [{ item_name: service?.name || 'Service' }] });
      router.navigate('tracking');
    } catch (err) {
      errEl.textContent = err.message || 'Payment failed. Please try again.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = `Pay $${Number(price).toFixed(2)}`;
    }
  });
}

// ── Tracking ──────────────────────────────────────────────────────────────────
// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
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
  pending:   { dot: '#F59E0B', label: 'Booking confirmed — assigning mechanic...' },
  confirmed: { dot: '#0A58CA', label: 'Mechanic assigned — preparing to depart' },
  en_route:  { dot: '#22C55E', label: 'Mechanic is on the way!' },
  arrived:   { dot: '#22C55E', label: 'Mechanic has arrived!' },
  completed: { dot: '#6B7280', label: 'Service completed' },
};

async function renderTracking() {
  const screen = document.querySelector('[data-screen="tracking"]');
  if (!screen) return;

  cleanupTracking();

  const { bookingId } = window.appState;
  const ref = bookingRef(bookingId);

  screen.innerHTML = `
    ${createHeader('Live Tracking', false)}
    <div class="status-indicator" id="status-indicator">
      <div class="status-dot" id="status-dot" style="background:#0A58CA"></div>
      <span class="status-text" id="status-text">Loading booking...</span>
    </div>
    <div class="map-container" id="tracking-map"></div>
    <div class="estimated-arrival" id="mechanic-card">
      <div class="mechanic-avatar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
      <div>
        <div class="fw-600" id="mechanic-name">Your mechanic</div>
        <div class="text-secondary text-sm" id="eta-text">Calculating ETA...</div>
      </div>
    </div>
    <div id="tracking-progress" style="display:flex;gap:0;margin:0 0 20px;border-radius:8px;overflow:hidden">
      ${['Confirmed','En Route','Arrived','Done'].map((s,i) => `<div style="flex:1;padding:6px 4px;text-align:center;font-size:10px;font-weight:600;background:var(--color-surface);color:var(--color-text-secondary);border-right:1px solid var(--color-border)" id="step-${i}">${s}</div>`).join('')}
    </div>
    <button class="btn btn--secondary btn--full mb-4" id="message-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      Message Mechanic
    </button>
    <div style="padding:0 0 12px;text-align:center">
      <button onclick="shareTrackingLink()" style="background:var(--color-surface);border:1px solid var(--color-border);color:var(--color-text);padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        🔗 Share tracking link
      </button>
    </div>
    ${createBottomNav('tracking')}
  `;

  await loadLeaflet();
  if (!screen.classList.contains('active')) return;

  const SYDNEY_DEFAULT = [-33.8688, 151.2093];
  const MECH_DEFAULT   = [-33.820,  151.180];
  const CITY_SPEED_KMH = 30; // average van speed in Sydney

  // ── Init map ──────────────────────────────────────────────────────────────
  const map = window.L.map('tracking-map', { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
  }).addTo(map);
  map.setView(SYDNEY_DEFAULT, 13);
  _trackingMap = map;

  const clientIcon = window.L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:#0A58CA;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32],
  });
  const mechIcon = window.L.divIcon({
    className: '',
    html: `<div style="width:40px;height:40px;background:#22C55E;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5)"><svg width="20" height="14" viewBox="0 0 24 16" fill="white"><rect x="0" y="3" width="16" height="13" rx="1"/><path d="M16 6h5l3 4v6h-8V6z"/><circle cx="5" cy="16" r="3" fill="white"/><circle cx="19" cy="16" r="3" fill="white"/></svg></div>`,
    iconSize: [40, 40], iconAnchor: [20, 20],
  });

  let clientCoords = SYDNEY_DEFAULT;
  let clientMarker = window.L.marker(clientCoords, { icon: clientIcon }).bindPopup('Your location').addTo(map);
  _mechanicMarker  = window.L.marker(MECH_DEFAULT,  { icon: mechIcon  }).bindPopup('Your mechanic').addTo(map);

  // ── ETA updater ───────────────────────────────────────────────────────────
  function updateETA(mechCoords) {
    const distKm = haversineKm(mechCoords, clientCoords);
    const mins   = Math.max(1, Math.round((distKm / CITY_SPEED_KMH) * 60));
    const eta    = new Date(Date.now() + mins * 60000);
    const etaStr = eta.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    const el = screen.querySelector('#eta-text');
    if (el) el.textContent = distKm < 0.1
      ? 'Mechanic is right outside!'
      : `ETA: ${etaStr} (~${mins} min · ${distKm.toFixed(1)} km away)`;
  }

  // ── Status updater ────────────────────────────────────────────────────────
  function applyStatus(status) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.confirmed;
    const dot  = screen.querySelector('#status-dot');
    const text = screen.querySelector('#status-text');
    if (dot)  dot.style.background  = cfg.dot;
    if (text) text.textContent = cfg.label;
    // Progress bar highlight
    const stepMap = { pending: -1, confirmed: 0, en_route: 1, arrived: 2, completed: 3 };
    const activeStep = stepMap[status] ?? 0;
    for (let i = 0; i <= 3; i++) {
      const el = screen.querySelector(`#step-${i}`);
      if (!el) continue;
      el.style.background = i <= activeStep ? 'var(--color-primary)' : 'var(--color-surface)';
      el.style.color = i <= activeStep ? '#fff' : 'var(--color-text-secondary)';
    }
  }

  // ── Load booking from Supabase ────────────────────────────────────────────
  try {
    const { data: booking } = await sb.from('bookings')
      .select('status, address, client_name, mechanic_id')
      .eq('id', bookingId || '')
      .single();

    if (booking) {
      applyStatus(booking.status || 'confirmed');

      // Geocode client address
      if (booking.address) {
        const coords = await geocodeAddress(booking.address);
        if (coords) {
          clientCoords = coords;
          clientMarker.setLatLng(coords);
          map.setView(coords, 13);
        }
      }

      // Load mechanic name
      if (booking.mechanic_id) {
        const { data: mech } = await sb.from('escalation_contacts')
          .select('name, phone').eq('id', booking.mechanic_id).single();
        // 1.1: Also fetch mechanic profile (avatar, bio, years_experience)
        let mechProfile = null;
        if (booking.mechanic_id) {
          const { data: mp } = await sb.from('profiles')
            .select('avatar_url, bio, years_experience, full_name')
            .eq('id', booking.mechanic_id).single();
          mechProfile = mp;
        }
        if (mech) {
          const nameEl = screen.querySelector('#mechanic-name');
          const mechName = mechProfile?.full_name || mech.name || 'Your mechanic';
          if (nameEl) nameEl.textContent = mechName;
          // Update mechanic avatar if available
          const avatarEl = screen.querySelector('.mechanic-avatar');
          if (avatarEl && mechProfile?.avatar_url) {
            avatarEl.innerHTML = '<img src="' + mechProfile.avatar_url + '" alt="' + mechName + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover">';
          }
          // Show bio/experience below ETA
          if (mechProfile?.bio || mechProfile?.years_experience) {
            const etaEl = screen.querySelector('#eta-text');
            if (etaEl && etaEl.parentElement) {
              const bioEl = document.createElement('div');
              bioEl.style.cssText = 'font-size:12px;color:var(--color-text-secondary);margin-top:2px';
              bioEl.textContent = (mechProfile.years_experience ? mechProfile.years_experience + 'yrs exp · ' : '') + (mechProfile.bio || '');
              etaEl.parentElement.appendChild(bioEl);
            }
          }
          screen.querySelector('#message-btn')?.addEventListener('click', () => {
            const phone = (mech.phone || '61433963250').replace(/[^0-9]/g, '');
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent('Hi, tracking booking ' + ref)}`, '_blank');
          });
          return; // skip default message btn below
        }
      }

      // Real-time booking status updates
      const bookingChannel = sb.channel('booking-status-' + bookingId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: 'id=eq.' + bookingId },
          payload => { if (payload.new?.status) applyStatus(payload.new.status); })
        .subscribe();
      const origCleanup = _unsubTracking;
      _unsubTracking = () => {
        if (origCleanup) origCleanup();
        try { sb.removeChannel(bookingChannel); } catch {}
      };
    } else {
      applyStatus('confirmed');
    }
  } catch {
    applyStatus('confirmed');
  }

  updateETA(MECH_DEFAULT);

  // ── Realtime mechanic location ────────────────────────────────────────────
  _unsubTracking = subscribeToMechanicLocation(bookingId, ({ latitude, longitude }) => {
    const coords = [latitude, longitude];
    if (_mechanicMarker) { _mechanicMarker.setLatLng(coords); updateETA(coords); }
    if (_trackingMap) _trackingMap.panTo(coords, { animate: true, duration: 1 });
  });

  requestAnimationFrame(() => { setTimeout(() => { if (_trackingMap) _trackingMap.invalidateSize(); }, 350); });

  screen.querySelector('#message-btn')?.addEventListener('click', () => {
    window.open(`https://wa.me/61433963250?text=${encodeURIComponent('Hi Dr. Bike, tracking booking ' + ref)}`, '_blank');
  });
}

// ── Review ────────────────────────────────────────────────────────────────────
async function shareTrackingLink() {
  const bookingId = window.appState.bookingId;
  if (!bookingId) return;
  try {
    const { data } = await sb.from('bookings').select('tracking_token').eq('id', bookingId).single();
    const token = data?.tracking_token;
    if (!token) { alert('Tracking link not available yet.'); return; }
    const url = window.location.origin + '/track?token=' + token;
    if (navigator.share) {
      await navigator.share({ title: 'Track my Dr. Bike service', url });
    } else {
      await navigator.clipboard.writeText(url);
      showToast('Tracking link copied to clipboard!');
    }
  } catch(e) {
    console.warn('shareTrackingLink error:', e);
    showToast('Could not share tracking link.');
  }
}

async function renderReview() {
  const screen = document.querySelector('[data-screen="review"]');
  if (!screen) return;

  let currentRating = 0;
  const { bookingId } = window.appState;

  screen.innerHTML = `
    ${createHeader('Review Service', true, '#home')}
    <div class="review-prompt">
      <div class="review-icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle>
          <path d="M5.5 17.5l4-10h6l3 6h-5l-2-3.5"></path>
          <circle cx="12" cy="5" r="2" fill="var(--color-primary)" stroke="none"></circle>
        </svg>
      </div>
      <p class="review-question">How was your experience?<br>We'd love to hear your feedback.</p>
    </div>
    <div class="star-row" id="star-row" role="group" aria-label="Rate your experience">
      ${[1,2,3,4,5].map(i => `
        <button class="star-btn" data-value="${i}" type="button" aria-label="${i} star${i > 1 ? 's' : ''}">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>`).join('')}
    </div>
    <div class="review-field">
      <textarea id="review-comment" class="review-textarea" placeholder="Tell us about your experience..." maxlength="500" rows="4"></textarea>
      <div class="char-counter"><span id="char-count">0</span>/500</div>
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

  stars.forEach(star => {
    star.addEventListener('mouseenter', () => highlight(Number(star.dataset.value)));
    star.addEventListener('mouseleave', () => highlight(currentRating));
    star.addEventListener('click', () => { currentRating = Number(star.dataset.value); highlight(currentRating); });
  });

  const textarea = screen.querySelector('#review-comment');
  const counter = screen.querySelector('#char-count');
  textarea.addEventListener('input', () => { counter.textContent = textarea.value.length; });

  screen.querySelector('#submit-review-btn').addEventListener('click', async () => {
    const btn = screen.querySelector('#submit-review-btn');
    const errEl = screen.querySelector('#review-error');
    if (!currentRating) { errEl.textContent = 'Please select a rating.'; errEl.hidden = false; return; }
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    errEl.hidden = true;
    try {
      await submitReview(bookingId || 'demo', currentRating, textarea.value.trim());
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
          <div style="font-size:48px;margin-bottom:16px">⭐⭐⭐⭐⭐</div>
          <h2 style="font-size:22px;font-weight:800;color:var(--color-text);margin-bottom:8px">Thanks for the 5 stars!</h2>
          <p style="font-size:14px;color:var(--color-text-secondary);line-height:1.6;margin-bottom:28px">
            Would you mind leaving a quick Google review? It helps other Sydney cyclists find us.
          </p>
          <div style="display:flex;flex-direction:column;gap:12px;max-width:280px;margin:0 auto">
            <a href="https://g.page/r/drbikesydney/review" target="_blank" rel="noopener"
              onclick="if(window.gtag)gtag('event','review_click',{platform:'google'})"
              style="display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;border:2px solid #E5E7EB;border-radius:10px;padding:14px 20px;text-decoration:none;font-weight:600;font-size:14px;color:#374151;box-shadow:0 1px 4px rgba(0,0,0,.08)">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Leave a Google Review
            </a>
            <a href="https://www.facebook.com/drbikesydney" target="_blank" rel="noopener"
              onclick="if(window.gtag)gtag('event','review_click',{platform:'facebook'})"
              style="display:flex;align-items:center;justify-content:center;gap:10px;background:#1877F2;border-radius:10px;padding:14px 20px;text-decoration:none;font-weight:600;font-size:14px;color:#fff">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Share on Facebook
            </a>
            <button onclick="router.navigate('home')" style="background:transparent;border:none;color:var(--color-text-secondary);font-size:13px;cursor:pointer;padding:8px">
              Skip — back to home
            </button>
          </div>
        </div>
      `;
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
      <div class="login-logo">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0A58CA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="5.5" cy="17.5" r="3"></circle><circle cx="18.5" cy="17.5" r="3"></circle>
          <path d="M5.5 17.5l3.5-9h5l3.5 6h-5l-2-3.5"></path>
          <circle cx="12" cy="6" r="1.5" fill="#0A58CA" stroke="none"></circle>
        </svg>
        <span>DR BIKE SYDNEY</span>
      </div>
      <h2 class="login-title">${isSignup ? 'Create Account' : 'Welcome Back!'}</h2>
      <p class="login-sub text-secondary text-center">${isSignup ? 'Join Dr. Bike Sydney' : 'Login to your account'}</p>
      <button type="button" id="google-btn" style="width:100%;padding:14px;background:#1a1a1a;border:2px solid #2a2a2a;border-radius:10px;color:white;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;transition:all 200ms ease" onmouseover="this.style.borderColor='#4285f4'" onmouseout="this.style.borderColor='#2a2a2a'">
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="flex:1;height:1px;background:#2a2a2a"></div>
        <span style="color:#a0a0a0;font-size:13px">or</span>
        <div style="flex:1;height:1px;background:#2a2a2a"></div>
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
        ${isSignup
          ? `Already have an account? <button class="link-btn" id="toggle-mode">Sign in</button>`
          : `Don't have an account? <button class="link-btn" id="toggle-mode">Sign up</button>`}
      </div>
    </div>
    ${createBottomNav('profile')}
  `;

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
    } catch(e) {
      errEl.textContent = e.message || 'Google login failed. Please try again.';
      errEl.hidden = false;
    }
  });

  screen.querySelector('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = screen.querySelector('#login-submit');
    const errEl = screen.querySelector('#login-error');
    const email = screen.querySelector('#login-email').value.trim();
    const password = screen.querySelector('#login-password').value;
    const name = isSignup ? (screen.querySelector('#login-name')?.value.trim() || '') : '';

    if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.hidden = false; return; }

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
      <button class="tab-btn${_bookingsTab === 'history'  ? ' active' : ''}" data-tab="history">History</button>
    </div>
    <div id="bookings-list" class="bookings-list">
      <div class="loading-row"><div class="skeleton"></div><div class="skeleton"></div></div>
    </div>
    ${createBottomNav('my-bookings')}
  `;

  const allBookings = await getMyBookings();
  const ACTIVE = new Set(['pending', 'confirmed', 'enroute', 'in_progress']);
  const DONE   = new Set(['completed', 'cancelled']);
  const calIcon = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

  function renderList(tab) {
    const list = screen.querySelector('#bookings-list');
    const filtered = allBookings.filter(b => tab === 'upcoming' ? ACTIVE.has(b.status) : DONE.has(b.status));

    if (!filtered.length) {
      list.innerHTML = createEmptyState(
        calIcon,
        tab === 'upcoming' ? 'No upcoming bookings' : 'No booking history',
        tab === 'upcoming' ? 'Book your first service today!' : 'Completed services will appear here.'
      );
      return;
    }

    list.innerHTML = filtered.map(b => createBookingCard(b)).join('');

    if (tab === 'history') {
      list.querySelectorAll('.booking-card').forEach(card => {
        const booking = filtered.find(b => String(b.id) === card.dataset.bookingId);
        if (booking?.status === 'completed' && !booking.rating) {
          card.insertAdjacentHTML('afterend',
            `<button class="btn btn--secondary btn--full" data-rebook style="margin-top:calc(-1 * var(--space-2))">Book Again</button>`);
        }
      });
      list.querySelectorAll('[data-rebook]').forEach(btn => {
        btn.addEventListener('click', () => router.navigate('book-service'));
      });
    }
  }

  renderList(_bookingsTab);

  screen.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      screen.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
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
  try { const { data } = await sb.auth.getUser(); user = data?.user || null; } catch {}
  if (!user) { router.navigate('login'); return; }

  const name = user.user_metadata?.full_name || user.email;
  const refCode = 'DBK' + (user.id || '').replace(/-/g, '').slice(0, 5).toUpperCase();

  let credits = 0, referralCount = 0;
  try {
    const { data: profile } = await sb.from('profiles')
      .select('referral_code, referral_credits, referral_count')
      .eq('id', user.id).single();
    if (profile) {
      credits = profile.referral_credits || 0;
      referralCount = profile.referral_count || 0;
      if (!profile.referral_code)
        await sb.from('profiles').update({ referral_code: refCode }).eq('id', user.id).catch(() => {});
    }
  } catch {}

  const shareMsg = encodeURIComponent('Get $15 off your first Dr. Bike Sydney service! Use my code ' + refCode + ' at checkout. Book at https://drbikesydney.com.au');

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

      <div style="background:linear-gradient(135deg,#0A58CA,#1848C8);border-radius:16px;padding:20px;margin:20px 0;text-align:center">
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">Your referral code</div>
        <div id="ref-code-display" style="font-size:28px;font-weight:900;color:#fff;letter-spacing:0.18em;margin-bottom:4px">${refCode}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-bottom:16px">You and your friend each get $15 off</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button id="copy-code-btn" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer">Copy code</button>
          <a href="https://wa.me/?text=${shareMsg}" target="_blank" style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:6px">📱 Share</a>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div style="background:var(--color-surface);border-radius:12px;padding:16px;text-align:center;border:1px solid var(--color-border)">
          <div style="font-size:24px;font-weight:800;color:var(--color-primary)">${referralCount}</div>
          <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px">Friends referred</div>
        </div>
        <div style="background:var(--color-surface);border-radius:12px;padding:16px;text-align:center;border:1px solid var(--color-border)">
          <div style="font-size:24px;font-weight:800;color:var(--color-success)">$${credits}</div>
          <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px">Credits earned</div>
        </div>
      </div>

      <div style="background:var(--color-surface);border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid var(--color-border)">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px">How it works</div>
        <div style="font-size:12px;color:var(--color-text-secondary);line-height:1.8">
          1. Share your code with friends<br>
          2. They get $15 off their first service<br>
          3. You get $15 credit when they book
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

  screen.querySelector('#copy-code-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(refCode)
      .then(() => showToast('Code copied!', 'success'))
      .catch(() => showToast(refCode + ' - copy manually', 'success'));
  });

  screen.querySelector('#signout-btn').addEventListener('click', async () => {
    await sb.auth.signOut().catch(() => {});
    showToast('Signed out successfully', 'success');
    router.navigate('home');
  });
}


// ── My Bikes screen (task 1.3) ───────────────────────────────────────────────
async function renderMyBikes() {
  const screen = document.querySelector('[data-screen="my-bikes"]');
  if (!screen) return;

  let user = null;
  try { const { data } = await sb.auth.getUser(); user = data?.user || null; } catch {}
  if (!user) { router.navigate('login'); return; }

  screen.innerHTML = `
    ${createHeader('My Bikes', false)}
    <div class="profile-wrap">
      <div id="bikes-list" style="margin-bottom:16px">
        <div style="text-align:center;padding:40px 0;color:var(--color-text-secondary)">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle><path d="M5.5 17.5l4-10h6l3 6h-5l-2-3.5"></path><circle cx="12" cy="5" r="2" fill="currentColor" stroke="none"></circle></svg>
          <div style="margin-top:12px;font-size:14px">Loading bikes...</div>
        </div>
      </div>
      <button class="btn btn--primary btn--full" id="add-bike-btn">+ Add a Bike</button>

      <!-- Add bike form (hidden by default) -->
      <div id="add-bike-form" style="display:none;margin-top:20px;background:var(--color-surface);border-radius:16px;padding:20px;border:1px solid var(--color-border)">
        <div style="font-size:15px;font-weight:700;margin-bottom:16px">New Bike</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <input id="bike-nickname" type="text" placeholder="Nickname (e.g. Red Trek)*" maxlength="60"
            style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:14px;outline:none"/>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <input id="bike-brand" type="text" placeholder="Brand" maxlength="40"
              style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:14px;outline:none"/>
            <input id="bike-model" type="text" placeholder="Model" maxlength="40"
              style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:14px;outline:none"/>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <input id="bike-color" type="text" placeholder="Color" maxlength="30"
              style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:14px;outline:none"/>
            <input id="bike-year" type="number" placeholder="Year" min="1990" max="2030"
              style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:14px;outline:none"/>
          </div>
          <select id="bike-type"
            style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;color:var(--color-text);font-size:14px;outline:none;appearance:none">
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
      const { data, error } = await sb.from('bikes')
        .select('id, nickname, brand, model, color, year, bike_type, created_at')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        list.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--color-text-secondary)">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle><path d="M5.5 17.5l4-10h6l3 6h-5l-2-3.5"></path><circle cx="12" cy="5" r="2" fill="currentColor" stroke="none"></circle></svg>
          <div style="margin-top:12px;font-size:14px">No bikes added yet</div>
          <div style="font-size:12px;margin-top:4px;opacity:0.7">Add your first bike below</div>
        </div>`;
        return;
      }
      const TYPE_LABELS = { road:'Road', mtb:'MTB', hybrid:'Hybrid', ebike:'E-Bike', cargo:'Cargo', folding:'Folding' };
      list.innerHTML = data.map(bike => `
        <div style="background:var(--color-surface);border-radius:14px;padding:16px;margin-bottom:12px;border:1px solid var(--color-border);display:flex;align-items:center;gap:14px">
          <div style="width:44px;height:44px;border-radius:12px;background:var(--color-primary-alpha,rgba(10,88,202,0.12));display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1.8"><circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle><path d="M5.5 17.5l4-10h6l3 6h-5l-2-3.5"></path><circle cx="12" cy="5" r="2" fill="currentColor" stroke="none"></circle></svg>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px">${bike.nickname}</div>
            <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px">
              ${[bike.brand, bike.model, bike.color, bike.year, TYPE_LABELS[bike.bike_type]].filter(Boolean).join(' · ') || 'No details'}
            </div>
          </div>
          <button data-bike-id="${bike.id}" class="delete-bike-btn" style="background:none;border:none;padding:8px;cursor:pointer;color:var(--color-error);opacity:0.7">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>
          </button>
        </div>
      `).join('');
      list.querySelectorAll('.delete-bike-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.bikeId;
          if (!confirm('Remove this bike?')) return;
          await sb.from('bikes').delete().eq('id', id).eq('client_id', user.id);
          loadBikes();
        });
      });
    } catch (e) {
      list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--color-error);font-size:13px">Failed to load bikes</div>`;
    }
  }

  loadBikes();

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
    if (!nickname) { errEl.textContent = 'Nickname is required'; return; }
    errEl.textContent = '';
    const btn = screen.querySelector('#save-bike-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const { error } = await sb.from('bikes').insert({
        client_id: user.id,
        nickname: nickname.slice(0, 60),
        brand: (screen.querySelector('#bike-brand').value || '').trim().slice(0, 40) || null,
        model: (screen.querySelector('#bike-model').value || '').trim().slice(0, 40) || null,
        color: (screen.querySelector('#bike-color').value || '').trim().slice(0, 30) || null,
        year: parseInt(screen.querySelector('#bike-year').value) || null,
        bike_type: screen.querySelector('#bike-type').value || null
      });
      if (error) throw error;
      showToast('Bike added!', 'success');
      screen.querySelector('#add-bike-form').style.display = 'none';
      screen.querySelector('#add-bike-btn').style.display = 'block';
      // Reset form
      ['bike-nickname','bike-brand','bike-model','bike-color','bike-year'].forEach(id => {
        screen.querySelector('#' + id).value = '';
      });
      screen.querySelector('#bike-type').value = '';
      loadBikes();
    } catch (e) {
      errEl.textContent = 'Could not save bike. Try again.';
    } finally {
      btn.disabled = false; btn.textContent = 'Save Bike';
    }
  });
}

// ── Screen event router ───────────────────────────────────────────────────────
document.addEventListener('screenchange', ({ detail }) => {
  if (window.gtag) gtag('event', 'page_view', { page_title: detail.route, page_location: '/#' + detail.route });
  if (detail.prev === 'tracking' && detail.route !== 'tracking') cleanupTracking();
  if (detail.prev === 'payment'  && detail.route !== 'payment') {
    destroyPaymentForm();
    if (window.appState.bookingId && detail.route !== 'tracking') {
      if (window.gtag) gtag('event', 'booking_abandoned', { currency: 'AUD', value: window.appState.service?.price || 0, items: [{ item_name: window.appState.service?.name }] });
    }
  }
  if (detail.route === 'book-service')    renderBookService();
  if (detail.route === 'service-summary') renderServiceSummary();
  if (detail.route === 'payment')         renderPayment();
  if (detail.route === 'tracking')        renderTracking();
  if (detail.route === 'review')          renderReview();
  if (detail.route === 'login')           renderLogin();
  if (detail.route === 'my-bookings')     renderMyBookings();
  if (detail.route === 'profile')         renderProfile();
  if (detail.route === 'my-bikes')         renderMyBikes();
});

// ── AI Bike Diagnosis ────────────────────────────────────────────────────────
async function runAIDiagnosis(screen) {
  const input = screen.querySelector('#diag-photo');
  if (!input || !input.files[0]) return;
  const file = input.files[0];
  const resultEl = screen.querySelector('#diag-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<div style="font-size:12px;color:#6b7280">&#128269; Analysing your photo...</div>';
  try {
    const reader = new FileReader();
    reader.onload = async e => {
      const base64 = e.target.result.split(',')[1];
      const resp = await fetch('/api/chat?type=diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type || 'image/jpeg' })
      });
      showDiagResult(screen, await resp.json());
    };
    reader.readAsDataURL(file);
  } catch {
    resultEl.innerHTML = '<div style="font-size:12px;color:#ef4444">Could not analyse photo. Please describe the problem instead.</div>';
  }
}

async function runAIDiagnosisText(screen) {
  const text = screen.querySelector('#diag-text')?.value?.trim() || '';
  if (!text) return;
  const resultEl = screen.querySelector('#diag-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<div style="font-size:12px;color:#6b7280">&#128269; Analysing...</div>';
  try {
    const resp = await fetch('/api/chat?type=diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text })
    });
    showDiagResult(screen, await resp.json());
  } catch {
    resultEl.innerHTML = '<div style="font-size:12px;color:#ef4444">Could not process. Please select a service manually.</div>';
  }
}

function showDiagResult(screen, data) {
  const resultEl = screen.querySelector('#diag-result');
  if (!resultEl) return;
  const sev = data.severity || 'medium';
  const sevColor = sev === 'high' ? '#DC2626' : sev === 'low' ? '#059669' : '#D97706';
  const urgColor = data.urgency === 'Urgent' ? '#DC2626' : data.urgency === 'Book soon' ? '#D97706' : '#059669';
  const chips = (data.services || []).map(s =>
    `<span class="diag-chip" data-svc="${s.replace(/"/g, '&quot;')}" style="background:#EEF3FC;color:#1848C8;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:600;margin-right:4px;cursor:pointer">${s}</span>`
  ).join('');
  resultEl.innerHTML = `
    <div style="background:white;border-radius:8px;padding:12px;border:1px solid #E5E7EB">
      <div style="font-size:12px;font-weight:700;color:#0D1F3C;margin-bottom:6px">&#129302; AI Recommendation</div>
      <div style="font-size:12px;color:#374151;margin-bottom:8px">${data.diagnosis || 'Bike issue detected'}</div>
      ${chips ? `<div style="margin-bottom:8px">${chips}</div>` : ''}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:11px;color:${sevColor};font-weight:600">${sev.charAt(0).toUpperCase() + sev.slice(1)} severity</span>
        <span style="color:#d1d5db">&#183;</span>
        <span style="font-size:11px;color:${urgColor};font-weight:600">${data.urgency || 'Book soon'}</span>
        ${data.details ? `<span style="color:#d1d5db">&#183;</span><span style="font-size:11px;color:#6b7280">${data.details}</span>` : ''}
      </div>
    </div>`;
  resultEl.querySelectorAll('.diag-chip').forEach(chip => {
    chip.addEventListener('click', () => autoSelectService(screen, chip.dataset.svc));
  });
}

function autoSelectService(screen, serviceName) {
  const list = screen.querySelector('#services-list');
  if (!list) return;
  const target = serviceName.toLowerCase();
  let best = null;
  list.querySelectorAll('.service-card').forEach(card => {
    const name = (card.querySelector('.service-card__name')?.textContent || '').toLowerCase();
    if (name === target) { best = card; return; }
    if (!best && (name.includes(target) || target.includes(name))) best = card;
  });
  if (best) {
    best.click();
    best.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

router.init();
document.dispatchEvent(new Event('routerinit'));
