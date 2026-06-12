import router from './router.js';
import { sb, getServices, getAvailableSlots, createBooking } from './supabase.js';
import { createHeader, createBottomNav, createServiceCard, createTimeSlot, createDateItem, createSummaryRow } from './components.js';

window.appState = { service: null, date: null, time: null, location: 'Home', bookingId: null };

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
      <div class="loading-row">
        <div class="skeleton"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
      </div>
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

  // Restore previously selected service if still valid
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
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') card.click();
    });
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
        <circle cx="5.5" cy="17.5" r="3.5"></circle>
        <circle cx="18.5" cy="17.5" r="3.5"></circle>
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
      <button class="btn btn--primary btn--full" id="confirm-btn">Confirm Booking</button>
    </div>
    ${createBottomNav('home')}
  `;

  screen.querySelector('#confirm-btn').addEventListener('click', async () => {
    const btn = screen.querySelector('#confirm-btn');
    const errEl = screen.querySelector('#booking-error');
    btn.disabled = true;
    btn.textContent = 'Confirming...';
    errEl.hidden = true;
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
      router.navigate('tracking', { bookingId: booking.id });
    } catch {
      errEl.textContent = 'Could not confirm booking. Please try again.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Confirm Booking';
    }
  });
}

// ── Screen event router ───────────────────────────────────────────────────────
document.addEventListener('screenchange', ({ detail }) => {
  if (detail.route === 'book-service')    renderBookService();
  if (detail.route === 'service-summary') renderServiceSummary();
});

router.init();
