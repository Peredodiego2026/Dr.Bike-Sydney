import router from './router.js';
import { getServices } from './supabase.js';
import { createHeader, createBottomNav, createServiceCard } from './components.js';

// ── Global state ──────────────────────────────────────────────────────────────
window.appState = { service: null, date: null, time: null, location: null };

// ── Book a Service screen ─────────────────────────────────────────────────────
async function renderBookService() {
  const screen = document.querySelector('[data-screen="book-service"]');
  if (!screen) return;

  // Loading state
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
    ${createBottomNav('home')}
  `;

  const services = await getServices();
  const list = screen.querySelector('#services-list');

  list.innerHTML = services.map(s => createServiceCard(s)).join('');

  // Sticky Continue button (inserted before bottom nav)
  const nav = screen.querySelector('.bottom-nav');
  const stickyWrap = document.createElement('div');
  stickyWrap.className = 'sticky-bottom';
  stickyWrap.innerHTML = `<button class="btn btn--primary btn--full" id="continue-btn" disabled>Continue</button>`;
  screen.insertBefore(stickyWrap, nav);

  // Service selection
  list.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('click', () => {
      list.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      window.appState.service = services.find(s => String(s.id) === card.dataset.serviceId);
      screen.querySelector('#continue-btn').disabled = false;
    });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') card.click(); });
  });

  screen.querySelector('#continue-btn').addEventListener('click', () => {
    if (window.appState.service) router.navigate('service-summary');
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
document.addEventListener('screenchange', ({ detail }) => {
  if (detail.route === 'book-service') renderBookService();
});

// ── Init ──────────────────────────────────────────────────────────────────────
router.init();
