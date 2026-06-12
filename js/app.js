import router from './router.js';
import { sb, getServices, getAvailableSlots, createBooking, subscribeToMechanicLocation, submitReview, signIn, signUp, getMyBookings } from './supabase.js';
import { createHeader, createBottomNav, createServiceCard, createTimeSlot, createDateItem, createSummaryRow, createBookingCard, createEmptyState, showToast } from './components.js';
import { createPaymentForm, createPaymentRequestButton, processPayment, destroyPaymentForm } from './stripe.js';

window.appState = { service: null, date: null, time: null, location: 'Home', bookingId: null };

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

  window.appState.time = null;

  const dates = generateDates(7);
  const todayStr = dates[0];
  const initialDate = (window.appState.date && dates.includes(window.appState.date))
    ? window.appState.date : todayStr;
  window.appState.date = initialDate;

  screen.innerHTML = `
    ${createHeader('Book a Service', true, '#home')}
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
      card.classList.add('selected');
      window.appState.service = services.find(s => String(s.id) === card.dataset.serviceId);
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
      ${createSummaryRow('Date', formatDate(date))}
      ${createSummaryRow('Time', time || '-')}
      ${createSummaryRow('Location', location || 'Home')}
    </div>
    <div class="summary-total">
      <span class="text-secondary">Total</span>
      <span class="summary-total__amount">$${Number(service.price || 0).toFixed(2)}</span>
    </div>
    <div id="booking-error" class="booking-error" hidden></div>
    <div class="sticky-bottom">
      <button class="btn btn--primary btn--full" id="proceed-btn">Proceed to Payment</button>
    </div>
    ${createBottomNav('home')}
  `;

  screen.querySelector('#proceed-btn').addEventListener('click', async () => {
    const btn = screen.querySelector('#proceed-btn');
    btn.disabled = true;
    btn.textContent = 'Confirming...';
    try {
      const { data: { user } } = await sb.auth.getUser();
      const booking = await createBooking({
        client_id: user?.id || null,
        service_id: service.id,
        scheduled_date: date,
        scheduled_time: time,
        location: location || 'Home',
        status: 'pending',
        total_price: service.price,
      });
      window.appState.bookingId = booking.id;
    } catch {
      window.appState.bookingId = null;
    }
    router.navigate('payment');
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
    <div id="payment-request-btn" hidden></div>
    <div class="payment-divider" id="card-divider" hidden><span>or pay with card</span></div>
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
async function renderTracking() {
  const screen = document.querySelector('[data-screen="tracking"]');
  if (!screen) return;

  cleanupTracking();

  const { bookingId } = window.appState;
  const ref = bookingRef(bookingId);

  screen.innerHTML = `
    ${createHeader('Tracking ' + ref, false)}
    <div class="status-indicator">
      <div class="status-dot status-dot--enroute"></div>
      <span class="status-text">Mechanic is on the way!</span>
    </div>
    <div class="map-container" id="tracking-map"></div>
    <div class="estimated-arrival">
      <div class="mechanic-avatar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
      <div>
        <div class="fw-600">Diego, your mechanic</div>
        <div class="text-secondary text-sm" id="eta-text">Calculating arrival time...</div>
      </div>
    </div>
    <button class="btn btn--secondary btn--full mb-4" id="message-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      Message Mechanic
    </button>
    ${createBottomNav('tracking')}
  `;

  await loadLeaflet();
  if (!screen.classList.contains('active')) return;

  const sydneyCenter = [-33.8688, 151.2093];
  const mechanicStart = [-33.820, 151.180];

  const map = window.L.map('tracking-map', { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  map.setView(sydneyCenter, 13);

  const clientIcon = window.L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:#0A58CA;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32],
  });
  window.L.marker(sydneyCenter, { icon: clientIcon }).bindPopup('Your location').addTo(map);

  const mechIcon = window.L.divIcon({
    className: '',
    html: `<div style="width:40px;height:40px;background:#22C55E;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5)"><svg width="20" height="14" viewBox="0 0 24 16" fill="white"><rect x="0" y="3" width="16" height="13" rx="1"/><path d="M16 6h5l3 4v6h-8V6z"/><circle cx="5" cy="16" r="3" fill="white"/><circle cx="19" cy="16" r="3" fill="white"/></svg></div>`,
    iconSize: [40, 40], iconAnchor: [20, 20],
  });
  _mechanicMarker = window.L.marker(mechanicStart, { icon: mechIcon }).bindPopup('Your mechanic').addTo(map);
  _trackingMap = map;

  function updateETA(lat, lng) {
    const distKm = Math.sqrt(Math.pow((lat - sydneyCenter[0]) * 111, 2) + Math.pow((lng - sydneyCenter[1]) * 85, 2));
    const mins = Math.max(1, Math.round(distKm * 4));
    const eta = new Date(Date.now() + mins * 60000);
    const etaStr = eta.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    const el = screen.querySelector('#eta-text');
    if (el) el.textContent = `Estimated arrival: ${etaStr} (${mins} min)`;
  }

  updateETA(mechanicStart[0], mechanicStart[1]);
  _unsubTracking = subscribeToMechanicLocation(bookingId, ({ latitude, longitude }) => {
    if (_mechanicMarker) { _mechanicMarker.setLatLng([latitude, longitude]); updateETA(latitude, longitude); }
  });

  requestAnimationFrame(() => { setTimeout(() => { if (_trackingMap) _trackingMap.invalidateSize(); }, 350); });

  screen.querySelector('#message-btn').addEventListener('click', () => {
    window.open(`https://wa.me/61433963250?text=${encodeURIComponent(`Hi Dr. Bike, tracking booking ${ref}`)}`, '_blank');
  });
}

// ── Review ────────────────────────────────────────────────────────────────────
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
    try { await submitReview(bookingId || 'demo', currentRating, textarea.value.trim()); } catch {}
    showToast('Thanks for your feedback!', 'success');
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
        showToast('Account created! Check your email to verify.', 'success');
      } else {
        await signIn(email, password);
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

// ── Profile ───────────────────────────────────────────────────────────────────
async function renderProfile() {
  const screen = document.querySelector('[data-screen="profile"]');
  if (!screen) return;

  let user = null;
  try { const { data } = await sb.auth.getUser(); user = data?.user || null; } catch {}

  if (!user) { router.navigate('login'); return; }

  const name = user.user_metadata?.full_name || user.email;

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
      <button class="btn btn--secondary btn--full mt-5" id="signout-btn">Sign Out</button>
    </div>
    ${createBottomNav('profile')}
  `;

  screen.querySelector('#signout-btn').addEventListener('click', async () => {
    await sb.auth.signOut().catch(() => {});
    showToast('Signed out successfully', 'success');
    router.navigate('home');
  });
}

// ── Screen event router ───────────────────────────────────────────────────────
document.addEventListener('screenchange', ({ detail }) => {
  if (detail.prev === 'tracking' && detail.route !== 'tracking') cleanupTracking();
  if (detail.prev === 'payment'  && detail.route !== 'payment')  destroyPaymentForm();
  if (detail.route === 'book-service')    renderBookService();
  if (detail.route === 'service-summary') renderServiceSummary();
  if (detail.route === 'payment')         renderPayment();
  if (detail.route === 'tracking')        renderTracking();
  if (detail.route === 'review')          renderReview();
  if (detail.route === 'login')           renderLogin();
  if (detail.route === 'my-bookings')     renderMyBookings();
  if (detail.route === 'profile')         renderProfile();
});

router.init();
