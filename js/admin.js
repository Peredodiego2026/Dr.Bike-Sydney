window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'G-GXYD68JXZW');

// ── THEME ────────────────────────────────────────────────────────────────────
(function () {
  const saved = localStorage.getItem('drbike-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', saved || (prefersDark ? 'dark' : 'light'));
})();

const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storageKey: 'dr-bike-admin-session', persistSession: false },
});

// persistSession:false means supabase-js keeps the live session in memory only,
// so localStorage is ours to maintain. It auto-refreshes roughly hourly and
// Supabase ROTATES the refresh token on every refresh, retiring the previous
// one. The pair written at login used to be the only pair ever stored, so the
// stored refresh token was stale within the hour and the next boot had to fall
// back to the login form. Every rotation is written back here instead.
sb.auth.onAuthStateChange((event, session) => {
  if (session) {
    storeAdminSession(session);
    return;
  }
  // No session in the event. At boot that is just INITIAL_SESSION firing before
  // restoreAdminSession() has run - not a sign-out, and treating it as one
  // would throw the login form over a panel that is about to work fine.
  //
  // SIGNED_OUT with nothing in hand is different, and there is no logout button
  // in this file: the only way to get here is a refresh that finally failed,
  // typically because a second admin tab refreshed first and rotated this tab's
  // token away. That is the state Diego photographed - the whole panel on
  // screen, and "Admin session expired - sign in again" inside every feature,
  // with no login form anywhere to fix it. Put the form back.
  if (event !== 'SIGNED_OUT') return;
  clearAdminSession();
  // Safe to call unguarded: checkAdminAuth() refuses to build a second overlay.
  checkAdminAuth();
});

// ── TASK-023: onclick -> addEventListener (see tasks.md) ────────────────────
// Script runs at the end of body so the DOM already exists - no need to wait
// for DOMContentLoaded. byId() no-ops safely if an element is not present
// (some ids only exist behind conditional rendering).
function byId(id) {
  const el = document.getElementById(id);
  return el || { addEventListener: () => {} };
}
(function wireStaticAdminButtons() {
  byId('sb-overlay').addEventListener('click', function (event) {
    closeSidebar();
  });
  byId('theme-btn-admin').addEventListener('click', function (event) {
    toggleAdminTheme();
  });
  byId('notif-btn').addEventListener('click', function (event) {
    toggleNotifPanel();
  });
  byId('auto-wire-1').addEventListener('click', function (event) {
    toggleSidebar();
  });
  byId('auto-wire-2').addEventListener('click', function (event) {
    applyBookingFilters();
  });
  byId('auto-wire-3').addEventListener('click', function (event) {
    resetBookingFilters();
  });
  byId('bk-load-more').addEventListener('click', function (event) {
    loadMoreBookings();
  });
  byId('auto-wire-4').addEventListener('click', function (event) {
    confirmCancel();
  });
  byId('auto-wire-5').addEventListener('click', function (event) {
    document.getElementById('cancel-modal').style.display = 'none';
  });
  byId('auto-wire-6').addEventListener('click', function (event) {
    doReassign(1);
  });
  byId('auto-wire-7').addEventListener('click', function (event) {
    doReassign(2);
  });
  byId('auto-wire-8').addEventListener('click', function (event) {
    document.getElementById('reassign-modal').style.display = 'none';
  });
  byId('route-mode-btn').addEventListener('click', function (event) {
    toggleRouteMode();
  });
  byId('fv-month').addEventListener('click', function (event) {
    setFinView('month', event.currentTarget);
  });
  byId('fv-quarter').addEventListener('click', function (event) {
    setFinView('quarter', event.currentTarget);
  });
  byId('fv-year').addEventListener('click', function (event) {
    setFinView('year', event.currentTarget);
  });
  byId('auto-wire-9').addEventListener('click', function (event) {
    exportFinancePDF();
  });
  byId('auto-wire-10').addEventListener('click', function (event) {
    exportFinanceCSV();
  });
  byId('auto-wire-11').addEventListener('click', function (event) {
    exportBAS();
  });
  byId('auto-wire-12').addEventListener('click', function (event) {
    openContactModal();
  });
  byId('auto-wire-13').addEventListener('click', function (event) {
    saveContact();
  });
  byId('auto-wire-14').addEventListener('click', function (event) {
    closeContactModal();
  });
  byId('auto-wire-15').addEventListener('click', function (event) {
    addVan();
  });
  byId('auto-wire-16').addEventListener('click', function (event) {
    exportAnalyticsCSV();
  });
  byId('btn-toggle-coupon-form').addEventListener('click', function (event) {
    toggleCouponForm();
  });
  byId('auto-wire-17').addEventListener('click', function (event) {
    document.getElementById('c-code').value =
      'BIKE' + Math.random().toString(36).substr(2, 5).toUpperCase();
  });
  byId('auto-wire-18').addEventListener('click', function (event) {
    toggleCouponForm();
  });
  byId('c-save-btn').addEventListener('click', function (event) {
    saveCoupon();
  });
  byId('reminder-btn').addEventListener('click', function (event) {
    sendReminders();
  });
  byId('auto-wire-19').addEventListener('click', function (event) {
    sendBroadcastPush();
  });
  byId('auto-wire-20').addEventListener('click', function (event) {
    exportNewsletterCSV();
  });
  byId('auto-wire-21').addEventListener('click', function (event) {
    openNotifModal();
  });
  byId('auto-wire-22').addEventListener('click', function (event) {
    saveBusinessDetails();
  });
  byId('auto-wire-23').addEventListener('click', function (event) {
    saveWhatsappNumber();
  });
  byId('auto-wire-24').addEventListener('click', function (event) {
    sendTestSMS();
  });
  byId('trig-new_booking').addEventListener('click', function (event) {
    toggleTrigger(event.currentTarget, 'new_booking');
  });
  byId('trig-enroute').addEventListener('click', function (event) {
    toggleTrigger(event.currentTarget, 'enroute');
  });
  byId('trig-completed').addEventListener('click', function (event) {
    toggleTrigger(event.currentTarget, 'completed');
  });
  byId('trig-payment').addEventListener('click', function (event) {
    toggleTrigger(event.currentTarget, 'payment');
  });
  byId('trig-cancelled').addEventListener('click', function (event) {
    toggleTrigger(event.currentTarget, 'cancelled');
  });
  byId('trig-reminders').addEventListener('click', function (event) {
    toggleTrigger(event.currentTarget, 'reminders');
  });
  byId('trig-mechanic_preference').addEventListener('click', function (event) {
    toggleTrigger(event.currentTarget, 'mechanic_preference');
  });
  byId('auto-wire-25').addEventListener('click', function (event) {
    openPartModal();
  });
  byId('auto-wire-26').addEventListener('click', function (event) {
    openServiceModal();
  });
  byId('auto-wire-27').addEventListener('click', function (event) {
    calPrev();
  });
  byId('auto-wire-28').addEventListener('click', function (event) {
    calNext();
  });
  byId('auto-wire-29').addEventListener('click', function (event) {
    openBlockModal();
  });
  byId('cv-month').addEventListener('click', function (event) {
    setCalView('month', event.currentTarget);
  });
  byId('cv-week').addEventListener('click', function (event) {
    setCalView('week', event.currentTarget);
  });
  byId('cv-day').addEventListener('click', function (event) {
    setCalView('day', event.currentTarget);
  });
  byId('auto-wire-30').addEventListener('click', function (event) {
    closeAdminChat();
  });
  byId('auto-wire-31').addEventListener('click', function (event) {
    closeNotifModal();
  });
  byId('auto-wire-32').addEventListener('click', function (event) {
    saveNotifNumber();
  });
  byId('notif-modal-pin-btn').addEventListener('click', function (event) {
    generateMechanicPin();
  });
  byId('auto-wire-33').addEventListener('click', function (event) {
    closeMechProfileModal();
  });
  byId('auto-wire-34').addEventListener('click', function (event) {
    saveMechProfile();
  });
  byId('crop-cancel-btn').addEventListener('click', function (event) {
    closePhotoCropModal();
  });
  byId('crop-confirm-btn').addEventListener('click', function (event) {
    confirmPhotoCrop();
  });
  byId('mbnav-more').addEventListener('click', function (event) {
    toggleSidebar();
  });

  // Audit 12.17: the filter/search controls in admin.html carried onchange /
  // oninput. Same elements, same functions, wired here instead.
  byId('bk-f-van').addEventListener('change', function (event) {
    applyBookingFilters();
  });
  byId('bk-f-status').addEventListener('change', function (event) {
    applyBookingFilters();
  });
  byId('bk-f-search').addEventListener('input', function (event) {
    applyBookingFilters();
  });
  byId('route-van').addEventListener('change', function (event) {
    renderRouteMap();
  });
  byId('fin-month').addEventListener('change', function (event) {
    loadFinance();
  });
  byId('fin-year').addEventListener('change', function (event) {
    loadFinance();
  });
  byId('inv-search').addEventListener('input', function (event) {
    renderInventory();
  });
  byId('svc-search').addEventListener('input', function (event) {
    renderServices();
  });
  byId('mem-filter-plan').addEventListener('change', function (event) {
    loadMemberships();
  });
  byId('mem-filter-status').addEventListener('change', function (event) {
    loadMemberships();
  });
  byId('notif-modal-role').addEventListener('change', function (event) {
    updateZoneVisibility();
  });
  byId('mech-profile-modal-photo-file').addEventListener('change', function (event) {
    previewMechProfilePhoto(this);
  });
})();

// Sidebar / quick-action / mobile-nav page navigation - all converted from
// onclick="go('page',...)" to data-page="page" (see admin.html). One
// delegated listener replicates the original behaviour: whichever element
// was clicked navigates, and the matching .sb-item (if any) gets the
// active/'on' highlight, same as go(page, btn) always did.
document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-page]');
  if (!el) return;
  const sbBtn = document.querySelector('.sb-item[data-page="' + el.dataset.page + '"]');
  go(el.dataset.page, sbBtn);
});

// Dynamically-rendered content (tables/modals built via template strings) -
// all converted from inline onclick="fn(...)" to data-action + data-* (see
// tasks.md TASK-023). One delegated listener dispatches by data-action,
// same pattern as js/mechanic.js.
document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const d = el.dataset;
  switch (d.action) {
    case 'close-block-modal':
      document.getElementById('block-modal')?.remove();
      break;
    case 'select-all-slots':
      selectAllSlots(d.value === 'true');
      break;
    case 'save-blocks':
      saveBlocks();
      break;
    case 'run-orphan-audit':
      runOrphanAudit();
      break;
    case 'unblock-date':
      unblockDate();
      break;
    case 'toggle-coupon':
      toggleCoupon(d.id, d.value === 'true');
      break;
    case 'delete-coupon':
      deleteCoupon(d.id, d.code);
      break;
    case 'submit-admin-login':
      submitAdminLogin();
      break;
    case 'submit-totp-code':
      submitTOTPCode();
      break;
    case 'submit-mfa-setup-code':
      submitMFASetupCode();
      break;
    case 'remove-van':
      removeVan(parseInt(d.id));
      break;
    case 'save-van-zone':
      saveVanZone(parseInt(d.id));
      break;
    case 'remove-suburb':
      removeSuburb(parseInt(d.id), d.suburb);
      break;
    case 'add-suburb':
      addSuburb(parseInt(d.id));
      break;
    case 'adjust-stock':
      adjustStock(d.id, parseInt(d.stock), parseInt(d.delta));
      break;
    case 'open-part-modal':
      openPartModal(d.id);
      break;
    case 'delete-part':
      deletePart(d.id);
      break;
    case 'close-part-modal':
      document.getElementById('part-modal')?.remove();
      break;
    case 'save-part':
      savePart(d.id);
      break;
    case 'save-expense':
      saveExpense();
      break;
    case 'delete-expense':
      deleteExpense(d.id, d.desc);
      break;
    case 'set-service-category-filter':
      setServiceCategoryFilter(d.cat || null);
      break;
    case 'open-service-modal':
      openServiceModal(d.id);
      break;
    case 'delete-service':
      deleteService(d.id);
      break;
    case 'close-service-modal':
      document.getElementById('service-modal')?.remove();
      break;
    case 'save-service':
      saveService(d.id);
      break;
    case 'open-photo':
      window.open(d.url, '_blank');
      break;
    case 'edit-notif-number':
      editNotifNumber(d.id);
      break;
    case 'delete-notif-number':
      deleteNotifNumber(d.id);
      break;
    case 'open-mech-profile-modal':
      openMechProfileModal(d.id);
      break;
    case 'close-reassign-modal': {
      const rm = document.getElementById('reassign-modal');
      if (rm) rm.style.display = 'none';
      break;
    }
    case 'mark-all-read':
      markAllRead();
      break;
    case 'edit-contact':
      editContact(d.id, d.firstName, d.lastName, d.phone, d.email, d.role);
      break;
    case 'delete-contact':
      deleteContact(d.id);
      break;
  }
});

// Audit 12.17: inputs inside those same template strings carried
// onkeydown="if(event.key==='Enter')fn()". Deliberately NOT data-action: the
// click listener above would then fire on every click into the field, and
// 'submit-admin-login' is a real case there - clicking the password box would
// submit the form. Separate attribute, separate listener.
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  const el = e.target.closest('[data-enter]');
  if (!el) return;
  switch (el.dataset.enter) {
    case 'focus-admin-pass':
      document.getElementById('admin-pass-inp')?.focus();
      break;
    case 'submit-admin-login':
      submitAdminLogin();
      break;
    case 'submit-totp-code':
      submitTOTPCode();
      break;
    case 'submit-mfa-setup-code':
      submitMFASetupCode();
      break;
    case 'add-suburb':
      addSuburb(parseInt(el.dataset.id));
      break;
  }
});

// onblur -> focusout, because blur does not bubble and this input is rendered
// into the van cards long after the script runs.
document.addEventListener('focusout', function (e) {
  const el = e.target.closest('[data-blur]');
  if (!el) return;
  if (el.dataset.blur === 'save-driver-name') {
    saveDriverName(parseInt(el.dataset.id), el.value);
  }
});

// ── NAVIGATION ───────────────────────────────────────────────────────────────
const titles = {
  dashboard: 'Dashboard',
  contacts: 'Escalation Contacts',
  bookings: 'Bookings',
  vans: 'Vans & Mechanics',
  'mechanic-profile': 'Mechanic Profile',
  clients: 'Clients',
  finance: 'Finance',
  zones: 'Zone Manager',
  claims: 'Claims',
  orphans: 'Orphan Payments',
  expenses: 'Expenses',
  settings: 'Settings',
  coupons: 'Discount Codes',
  reminders: 'Service Reminders',
  inventory: 'Spare Parts',
  calendar: 'Calendar',
  memberships: 'Memberships',
  services: 'Services & Prices',
};
const subs = {
  dashboard: 'Live operations · Sydney',
  contacts: 'Manage who receives escalated chats',
  bookings: 'Live bookings from Supabase',
  vans: '2 vans online · both active',
  'mechanic-profile': 'What clients see when a mechanic accepts their job',
  clients: 'Client database',
  finance: 'Financial overview',
  analytics: 'Sign-ups · bookings · revenue · funnel · traffic',
  zones: 'Assign suburbs to each van',
  claims: 'Warranty claims from clients - review evidence and resolve',
  orphans: 'Money Stripe took with no booking behind it - read-only, refunds stay in Stripe',
  expenses: 'What the business actually spent - this is what the P&L subtracts',
  settings: 'System settings',
  memberships: 'Active plans · Stripe subscriptions',
  inventory: 'Stock, internal cost and client price per part',
  services: 'One catalog for the whole site - edit a price here and it updates everywhere',
};

function go(page, btn) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach((b) => b.classList.remove('on'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('on');
  document.getElementById('page-title').textContent = titles[page] || page;
  document.getElementById('page-sub').textContent = subs[page] || '';
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-overlay').classList.remove('open');
  if (page === 'zones') loadVanZones();
  if (page === 'claims') loadClaims();
  if (page === 'expenses') loadExpenses();
  if (page === 'finance') {
    const now = new Date();
    document.getElementById('fin-month').value = now.getMonth() + 1;
    document.getElementById('fin-year').value = now.getFullYear();
    loadFinance();
  }
  if (page === 'vans') {
    renderMechStats();
    renderRouteMap();
  }
  if (page === 'mechanic-profile') loadMechanicProfiles();
  if (page === 'analytics') {
    wireAnalytics();
    loadAnalytics();
  }
  if (page === 'contacts') loadContacts();
  if (page === 'bookings') loadBookings();
  if (page === 'clients') loadClients();
  if (page === 'dashboard') loadDashboard();
  if (page === 'coupons') loadCoupons();
  if (page === 'settings') loadSettings();
  if (page === 'inventory') loadInventory();
  if (page === 'services') loadServices();
  if (page === 'calendar') loadCalendar();
  if (page === 'reminders') {
    loadTriggers();
    loadReferralLeaderboard();
    loadNewsletter();
  }
  if (page === 'memberships') loadMemberships();
  setTimeout(applyDarkModeInline, 100);

  // Update mobile bottom nav active state
  ['dashboard', 'bookings', 'clients', 'finance'].forEach((p) => {
    const el = document.getElementById('mbnav-' + p);
    if (el) el.classList.toggle('active', p === page);
  });

  // Scroll to top so the new page is visible (fixes mobile "View all" appearing to do nothing)
  const content = document.querySelector('.content');
  if (content) content.scrollTop = 0;
  window.scrollTo(0, 0);
}

function applyDarkModeInline() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  // Fix all inline style elements that use navy/mgray colors
  document.querySelectorAll('[style]').forEach((el) => {
    const s = el.style;
    if (isDark) {
      if (
        s.color === 'var(--navy)' ||
        el.getAttribute('style')?.includes('color:var(--navy)') ||
        el.getAttribute('style')?.includes('color: var(--navy)')
      ) {
        el.style.setProperty('color', '#F2F2F7', 'important');
      }
      if (
        s.color === 'var(--mgray)' ||
        el.getAttribute('style')?.includes('color:var(--mgray)') ||
        el.getAttribute('style')?.includes('color: var(--mgray)')
      ) {
        el.style.setProperty('color', '#8E8E93', 'important');
      }
      if (
        el.getAttribute('style')?.includes('background:#fff') ||
        el.getAttribute('style')?.includes('background: #fff') ||
        el.getAttribute('style')?.includes('background:var(--off)') ||
        el.getAttribute('style')?.includes('background:var(--off)')
      ) {
        if (!el.getAttribute('style')?.includes('rgba')) {
          el.style.setProperty('background', '#242426', 'important');
        }
      }
      if (
        el.getAttribute('style')?.includes('border-color:var(--border)') ||
        el.getAttribute('style')?.includes('border:1px solid var(--border)') ||
        el.getAttribute('style')?.includes('border: 1px solid #E2E8F0')
      ) {
        el.style.setProperty('border-color', '#38383A', 'important');
      }
      // The four hex in this block are NEEDLES, not colours: they are compared
      // against the text of a style attribute. Turning one into var(--gray) or
      // var(--navy) does not change a colour, it makes the test stop matching
      // and dark mode stops repainting these elements (docs/PENDIENTES.md
      // 12.14). Same coupling as the [style*='...'] rules in css/admin.css.
      if (
        el.getAttribute('style')?.includes('color:var(--mgray)') ||
        el.getAttribute('style')?.includes('color: #475569')
      ) {
        el.style.setProperty('color', '#8E8E93', 'important');
      }
      if (
        el.getAttribute('style')?.includes('color:var(--navy)') ||
        el.getAttribute('style')?.includes('color:#0d1f3c')
      ) {
        el.style.setProperty('color', '#F2F2F7', 'important');
      }
    } else {
      // Restore light mode - undo exactly what the dark-mode branch above
      // forced. Previously this loop computed `orig` and did nothing with
      // it, so switching back to light mode without navigating away left
      // dark colors stuck on-screen.
      ['color', 'background', 'border-color'].forEach((prop) => {
        if (el.style.getPropertyPriority(prop) === 'important') {
          el.style.removeProperty(prop);
        }
      });
    }
  });
}

const _adminMoonSVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const _adminSunSVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
function toggleAdminTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('drbike-theme', next);
  const btn = document.getElementById('theme-btn-admin');
  if (btn) btn.innerHTML = next === 'dark' ? _adminSunSVG : _adminMoonSVG;
  setTimeout(applyDarkModeInline, 50);
}
// Init theme button icon
(function () {
  const t =
    localStorage.getItem('drbike-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('theme-btn-admin');
  if (btn) btn.innerHTML = t === 'dark' ? _adminSunSVG : _adminMoonSVG;
  const db = document.getElementById('admin-date-badge');
  if (db)
    db.textContent = new Date().toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  setTimeout(applyDarkModeInline, 100);
})();

// ── SIDEBAR TOGGLE ─────────────────────────────────────────────────────────────
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sb-overlay');
  sb.classList.toggle('open');
  ov.classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-overlay').classList.remove('open');
}

// ── FINANCE ───────────────────────────────────────────────────────────────────
// Every cost below used to be a constant written here by hand - fleet 960,
// insurance 360, marketing 400, software 120, other 360, payroll 0, plus $10 of
// "parts" per job. They summed to exactly the -$2,200 the P&L showed with zero
// revenue. Nobody had ever entered them, they had never changed, and they did
// not correspond to a dollar anyone had spent: the card was not calculating,
// it was subtracting a constant.
//
// They now come from the `expenses` table (scripts/add-expenses-table.sql),
// loaded through /api/auth because that table is RLS-on with no policy.
const EXPENSE_LABELS = {
  payroll: 'Payroll',
  fleet: 'Fleet & van',
  insurance: 'Insurance',
  marketing: 'Marketing',
  software: 'Software & phone',
  parts: 'Parts & supplies',
  other: 'Other',
};
let _expenses = null; // {available, expenses[]} | {available:false, reason}

// Every 'YYYY-MM' the range touches. A quarter view spans three, a year twelve,
// and a recurring expense has to be counted once in each of them.
function expMonthsInRange(dateFrom, dateTo) {
  const out = [];
  const [fy, fm] = dateFrom.split('-').map(Number);
  const [ty, tm] = dateTo.split('-').map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// A one-off counts only if it falls inside the range. A recurring one counts
// once per month of the range from the month it started - that is the whole
// difference between "the Claude subscription" and "the van".
//
// ISO dates compare correctly as strings, which is why there is no Date() here:
// building one from 'YYYY-MM-DD' parses as UTC and shifts the day in Sydney.
function expTotalsInRange(rows, dateFrom, dateTo) {
  const months = expMonthsInRange(dateFrom, dateTo);
  const byCat = {};
  let total = 0;
  for (const e of rows || []) {
    const amount = Number(e.amount) || 0;
    const times = e.recurring_monthly
      ? months.filter((mm) => String(e.spent_on).slice(0, 7) <= mm).length
      : e.spent_on >= dateFrom && e.spent_on <= dateTo
        ? 1
        : 0;
    if (!times || !amount) continue;
    const cat = EXPENSE_LABELS[e.category] ? e.category : 'other';
    byCat[cat] = (byCat[cat] || 0) + amount * times;
    total += amount * times;
  }
  return { byCat, total };
}

// ── ALERT TRIGGERS (persistentes en Supabase) ────────────────────────────────
const TRIGGER_KEYS = [
  'new_booking',
  'enroute',
  'completed',
  'payment',
  'cancelled',
  'reminders',
  'mechanic_preference',
];

async function loadTriggers() {
  try {
    const { data } = await sb
      .from('van_zones')
      .select('suburb,postcode')
      .eq('van_number', 0)
      .in(
        'suburb',
        TRIGGER_KEYS.map((k) => '__trig_' + k + '__')
      );
    const map = {};
    (data || []).forEach((r) => {
      map[r.suburb] = r.postcode;
    });
    TRIGGER_KEYS.forEach((k) => {
      const el = document.getElementById('trig-' + k);
      if (!el) return;
      const saved = map['__trig_' + k + '__'];
      // Default: todos on excepto reminders y mechanic_preference (opt-in)
      const isOn =
        saved !== undefined ? saved === '1' : k !== 'reminders' && k !== 'mechanic_preference';
      el.classList.toggle('on', isOn);
    });
  } catch (e) {
    console.warn('loadTriggers:', e);
  }
}

async function toggleTrigger(el, key) {
  el.classList.toggle('on');
  const val = el.classList.contains('on') ? '1' : '0';
  try {
    await sb
      .from('van_zones')
      .upsert(
        { van_number: 0, suburb: '__trig_' + key + '__', postcode: val, active: true },
        { onConflict: 'van_number,suburb' }
      );
  } catch (e) {
    console.warn('toggleTrigger save error:', e);
  }
}

async function sendTestSMS() {
  const btn = event.target;
  btn.textContent = 'Sending...';
  btn.disabled = true;
  try {
    // Get manager number from escalation_contacts
    const { data } = await sb
      .from('escalation_contacts')
      .select('phone')
      .eq('role', 'manager')
      .limit(1)
      .single();
    if (!data?.phone) {
      showToast('No manager number found — add one in Notification Numbers');
      btn.textContent = '📱 Send test SMS to your number';
      btn.disabled = false;
      return;
    }
    const res = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: data.phone,
        name: 'Diego',
        service: 'Tune-Up',
        address: 'Newtown',
        price: 109,
        type: 'test',
        bookingId: 'TEST-001',
      }),
    });
    const json = await res.json();
    if (res.ok) {
      showToast('✓ Test SMS sent to ' + data.phone);
    } else {
      showToast('SMS failed: ' + (json.error || 'unknown error'));
    }
  } catch (e) {
    showToast('Error: ' + e.message);
  }
  btn.textContent = '📱 Send test SMS to your number';
  btn.disabled = false;
}

function setFinView(view, btn) {
  // Update hidden select (loadFinance lo lee)
  const sel = document.getElementById('fin-view');
  if (sel) sel.value = view;
  // Update pill styles
  ['month', 'quarter', 'year'].forEach((v) => {
    const b = document.getElementById('fv-' + v);
    if (!b) return;
    if (v === view) {
      b.style.background = 'var(--blue)';
      b.style.color = '#fff';
    } else {
      b.style.background = 'transparent';
      b.style.color = 'var(--mgray)';
    }
  });
  loadFinance();
}

// Weekly cash reconciliation: cash-paid completed jobs not yet handed over,
// grouped per mechanic. Deliberately NOT filtered by the finance month picker -
// unsettled cash is owed regardless of which period it was collected in.
async function loadCashHandover() {
  const el = document.getElementById('fin-cash');
  if (!el) return;
  const [{ data: rows, error }, { data: mechs }] = await Promise.all([
    sb
      .from('bookings')
      .select(
        'id,client_name,service_name,scheduled_date,final_charge_amount,tip_amount,mechanic_id,van_number'
      )
      .eq('status', 'completed')
      .eq('final_charge_status', 'cash')
      .is('cash_settled_at', null)
      .order('scheduled_date', { ascending: true }),
    sb.from('escalation_contacts').select('id,first_name,last_name'),
  ]);
  if (error) {
    el.innerHTML = `<div style="color:var(--mgray);font-size:13px">Could not load cash data${/cash_settled_at/.test(error.message) ? ' - add the cash_settled_at column to bookings' : ': ' + esc(error.message)}</div>`;
    return;
  }
  if (!rows || !rows.length) {
    el.innerHTML =
      '<div style="color:var(--mgray);font-size:13px">✓ No cash pending handover - all settled.</div>';
    return;
  }
  const mechName = (id) => {
    const m = (mechs || []).find((x) => x.id === id);
    return m ? `${m.first_name} ${m.last_name}` : null;
  };
  const groups = {};
  rows.forEach((b) => {
    const key = b.mechanic_id || 'van' + (b.van_number || '?');
    if (!groups[key])
      groups[key] = {
        name: mechName(b.mechanic_id) || 'Van ' + (b.van_number || '?'),
        jobs: [],
        total: 0,
      };
    groups[key].jobs.push(b);
    groups[key].total += (b.final_charge_amount || 0) + (b.tip_amount || 0);
  });
  el.innerHTML = Object.entries(groups)
    .map(
      ([key, g]) => `
    <div style="border:1px solid var(--border);border-left:3px solid var(--green);border-radius:12px;padding:14px 16px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--navy)">${esc(g.name)}</div>
          <div style="font-size:13px;color:var(--mgray)">${g.jobs.length} cash job${g.jobs.length !== 1 ? 's' : ''} pending</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:20px;font-weight:800;color:var(--green)">$${g.total.toLocaleString('en-AU')}</span>
          <button data-cash-settle="${esc(key)}" style="background:var(--green);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">Mark handed over</button>
        </div>
      </div>
      <div style="font-size:13px;color:var(--mgray)">
        ${g.jobs.map((j) => `${esc(j.scheduled_date || '')} · ${esc(j.client_name || 'Client')} · ${esc(j.service_name || '')} · $${((j.final_charge_amount || 0) + (j.tip_amount || 0)).toLocaleString('en-AU')}`).join('<br>')}
      </div>
    </div>`
    )
    .join('');

  el.querySelectorAll('[data-cash-settle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const g = groups[btn.dataset.cashSettle];
      if (!g) return;
      if (
        !confirm(
          `Confirm ${g.name} handed over $${g.total.toLocaleString('en-AU')} in cash (${g.jobs.length} jobs)?`
        )
      )
        return;
      btn.disabled = true;
      btn.textContent = 'Saving...';
      const { error: upErr } = await sb
        .from('bookings')
        .update({ cash_settled_at: new Date().toISOString() })
        .in(
          'id',
          g.jobs.map((j) => j.id)
        );
      if (upErr) {
        showToast('Could not settle: ' + upErr.message);
        btn.disabled = false;
        btn.textContent = 'Mark handed over';
        return;
      }
      showToast('Cash handover recorded ✓');
      loadCashHandover();
    });
  });
}

// ── Expenses screen ─────────────────────────────────────────────────────────
async function fetchExpenses() {
  try {
    const token = await adminAccessToken();
    if (!token) return { available: false, reason: 'Your admin session expired - reload and sign in' };
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin-expenses-list', access_token: token }),
    });
    const d = await r.json();
    if (!r.ok) return { available: false, reason: d.error || `HTTP ${r.status}` };
    return d;
  } catch (e) {
    return { available: false, reason: e.message };
  }
}

// Two numbers, never one. A one-off row's amount IS what was spent; a recurring
// row's amount is what is spent EVERY MONTH, so adding the two columns together
// produces a total that means nothing - it would count the Claude subscription
// once no matter how many months it has been running. So: "spent so far" counts
// the one-offs, "every month" is the standing commitment, and they are labelled
// as the different things they are.
function renderExpenseTotals(rows) {
  const box = document.getElementById('exp-totals');
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = '';
    return;
  }
  const money = (n) => '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2 });
  let oneOff = 0;
  let monthly = 0;
  const byCat = {};
  for (const e of rows) {
    const amount = Number(e.amount) || 0;
    if (e.recurring_monthly) monthly += amount;
    else oneOff += amount;
    const cat = EXPENSE_LABELS[e.category] ? e.category : 'other';
    byCat[cat] = (byCat[cat] || 0) + amount;
  }
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const tile = (label, value, note) => `
    <div style="flex:1;min-width:150px">
      <div style="font-size:11px;font-weight:600;color:var(--mgray);text-transform:uppercase;letter-spacing:.05em">${esc(label)}</div>
      <div class="exp-total-value">${esc(value)}</div>
      <div style="font-size:12px;color:var(--mgray);margin-top:2px">${esc(note)}</div>
    </div>`;

  box.innerHTML = `
    <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:${cats.length ? '14px' : '0'}">
        ${tile(
          'Spent so far',
          money(oneOff),
          rows.filter((e) => !e.recurring_monthly).length + ' one-off expense' +
            (rows.filter((e) => !e.recurring_monthly).length === 1 ? '' : 's')
        )}
        ${
          monthly
            ? tile(
                'Every month',
                money(monthly),
                'standing cost, not a total — ' +
                  rows.filter((e) => e.recurring_monthly).length +
                  ' recurring'
              )
            : ''
        }
      </div>
      ${
        cats.length
          ? `<div style="border-top:1px solid var(--border-lt);padding-top:12px">
               <div style="font-size:11px;font-weight:600;color:var(--mgray);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">By category</div>
               ${cats
                 .map(
                   ([c, v]) => `<div style="display:flex;justify-content:space-between;gap:16px;padding:4px 0;font-size:13px">
                     <span>${esc(EXPENSE_LABELS[c])}</span>
                     <span style="font-weight:700;white-space:nowrap">${esc(money(v))}</span>
                   </div>`
                 )
                 .join('')}
             </div>`
          : ''
      }
    </div>`;
}

async function loadExpenses() {
  const box = document.getElementById('exp-list');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--mgray);font-size:13px;padding:20px 0">Loading...</div>';
  const dateEl = document.getElementById('exp-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];

  const totalsBox = document.getElementById('exp-totals');
  if (totalsBox) totalsBox.innerHTML = '';

  _expenses = await fetchExpenses();
  if (!_expenses.available) {
    box.innerHTML = `<div style="color:var(--red);font-size:13px;line-height:1.6;padding:16px 0">${esc(_expenses.reason || 'Could not read the expenses')}</div>`;
    return;
  }
  const rows = _expenses.expenses || [];
  renderExpenseTotals(rows);
  if (!rows.length) {
    box.innerHTML =
      '<div style="text-align:center;padding:40px 16px"><div style="font-size:32px;margin-bottom:8px">&#128179;</div>' +
      '<div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:4px">Nothing loaded yet</div>' +
      '<div style="font-size:13px;color:var(--mgray);line-height:1.5">Until you add something here, the P&amp;L shows revenue with no costs against it.</div></div>';
    return;
  }
  box.innerHTML = rows
    .map(
      (e) => `
      <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--border-lt)">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.description)}</div>
          <div style="font-size:12px;color:var(--mgray);margin-top:2px">
            ${esc(e.spent_on)} · ${esc(EXPENSE_LABELS[e.category] || 'Other')}${
              e.recurring_monthly ? ' · every month' : ''
            }
          </div>
        </div>
        <div class="exp-amount">–$${Number(e.amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</div>
        <button data-action="delete-expense" data-id="${esc(e.id)}" data-desc="${esc(e.description)}" title="Delete"
          style="background:var(--red-lt);border:1.5px solid var(--red-edge);color:var(--red);border-radius:6px;min-width:34px;min-height:34px;font-size:14px;cursor:pointer">&#10005;</button>
      </div>`
    )
    .join('');
}

async function saveExpense() {
  const err = document.getElementById('exp-form-err');
  const show = (m) => {
    if (err) {
      err.textContent = m;
      err.style.display = 'block';
    }
  };
  if (err) err.style.display = 'none';

  const payload = {
    role: 'admin-expenses-save',
    access_token: await adminAccessToken(),
    spent_on: document.getElementById('exp-date')?.value,
    description: document.getElementById('exp-desc')?.value,
    amount: document.getElementById('exp-amount')?.value,
    category: document.getElementById('exp-category')?.value,
    recurring_monthly: !!document.getElementById('exp-recurring')?.checked,
  };
  if (!payload.access_token) return show('Your admin session expired - reload and sign in');

  try {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) return show(d.error || `Could not save (HTTP ${r.status})`);
    showToast('Expense added ✓');
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-recurring').checked = false;
    _expenses = null; // the P&L has to re-read
    loadExpenses();
  } catch (e) {
    show(e.message);
  }
}

async function deleteExpense(id, description) {
  if (!id) return;
  // Deleting changes what the P&L says the business spent, so it asks first.
  if (!confirm(`Delete "${description || 'this expense'}"?\n\nThe P&L will stop counting it.`)) return;
  try {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'admin-expenses-delete',
        access_token: await adminAccessToken(),
        id,
      }),
    });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || `Could not delete (HTTP ${r.status})`);
    showToast('Expense deleted');
    _expenses = null;
    loadExpenses();
  } catch (e) {
    showToast(e.message);
  }
}

// The selected period, as the two shapes the screen needs: 'YYYY-MM-DD'
// strings for the expenses (dated by day) and Date instants for the bookings
// (dated by timestamp). rangeEndExclusive is the first day AFTER the period,
// so the comparison is [start, end) and the last day is never half-counted.
function finRange(view, month, year) {
  const startY = year;
  let startM = month - 1; // JS months are 0-based
  let months = 1;
  if (view === 'quarter') {
    startM = (Math.ceil(month / 3) - 1) * 3;
    months = 3;
  } else if (view !== 'month') {
    startM = 0;
    months = 12;
  }
  const rangeStart = new Date(startY, startM, 1);
  const rangeEndExclusive = new Date(startY, startM + months, 1);
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const lastDay = new Date(startY, startM + months, 0);
  return { dateFrom: iso(rangeStart), dateTo: iso(lastDay), rangeStart, rangeEndExclusive };
}

function periodLabel(view, month, year) {
  return view === 'month'
    ? new Date(year, month - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' })
    : view === 'quarter'
      ? `Q${Math.ceil(month / 3)} ${year}`
      : `FY ${year}`;
}

// The date a job's money belongs to: when it was finished. Falls back to
// created_at for rows written before completed_at existed - the same rule
// anCompletedInRange() uses on the Analytics screen.
function finRevenueDate(j) {
  const t = new Date(j.completed_at || j.created_at);
  if (!Number.isFinite(t.getTime())) return j.scheduled_date || '';
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// Everything money-shaped on this screen goes blank, and the P&L says why.
// Leaving the zeros on screen was the actual bug: a permissions error, a dead
// session or a dropped connection all rendered as a month with no work.
function showFinanceError(message, periodStr) {
  const dash = (id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  };
  ['fk-revenue', 'fk-jobs', 'fk-gst', 'fk-net', 'fk-avg', 'fk-profit', 'fk-margin'].forEach(dash);
  ['bas-g1', 'bas-1a', 'bas-1b', 'bas-net'].forEach(dash);
  const period = document.getElementById('fin-pl-period');
  if (period) period.textContent = periodStr;
  const rows = document.getElementById('fin-pl-rows');
  if (rows)
    rows.innerHTML = `<div class="pl-row" style="color:var(--red);font-size:13px;line-height:1.5;display:block">Could not read the bookings for this period, so there are no figures to show: ${esc(message)}<br>This is NOT a month with no work - nothing was read at all. Reload the page, and sign in again if it keeps happening.</div>`;
  const chart = document.getElementById('fin-chart');
  if (chart)
    chart.innerHTML =
      '<div style="color:var(--red);font-size:13px;margin:auto">No data read - see the message above</div>';
  const txSub = document.getElementById('fin-tx-sub');
  if (txSub) txSub.textContent = 'Could not be read · ' + periodStr;
  const txBody = document.getElementById('fin-tx-body');
  if (txBody)
    txBody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:32px;font-size:13px">Could not read the transactions for this period</td></tr>';
  // Nothing to export, and the old figures must not survive as if they were
  // this period's.
  window._finData = null;
}

async function loadFinance() {
  loadCashHandover();
  const month = parseInt(document.getElementById('fin-month')?.value || new Date().getMonth() + 1);
  const year = parseInt(document.getElementById('fin-year')?.value || new Date().getFullYear());
  const view = document.getElementById('fin-view')?.value || 'month';

  // Two shapes of the same range. The strings still drive the expenses, which
  // are dated 'YYYY-MM-DD'; the Dates drive the bookings query, which now
  // compares against a timestamp and therefore needs real instants.
  const { dateFrom, dateTo, rangeStart, rangeEndExclusive } = finRange(view, month, year);

  // The money is dated by when the job was FINISHED, not by when it was
  // booked in. Until 2026-08-16 this screen filtered on scheduled_date while
  // Analytics filtered on completed_at, so a job scheduled 31-Jul and finished
  // 2-Aug landed in July on one screen and August on the other - two revenue
  // figures for the same month, and the BAS took the one nobody had agreed on.
  // Diego chose completed_at for both (16-Aug-2026); it is also the rule the
  // Analytics code already documented.
  //
  // The boundaries are built from the LOCAL midnight and sent as instants.
  // Sending the plain 'YYYY-MM-DD' would compare a timestamptz against UTC
  // midnight, and a job finished at 08:00 in Sydney is still the previous day
  // in UTC - it would drop out of its own month.
  // Rows written before completed_at existed have none. They fall back to
  // created_at, exactly like anCompletedInRange() does, so the two screens
  // agree on those too instead of one of them silently dropping them.
  const completedWindow = `and(completed_at.gte.${rangeStart.toISOString()},completed_at.lt.${rangeEndExclusive.toISOString()}),and(completed_at.is.null,created_at.gte.${rangeStart.toISOString()},created_at.lt.${rangeEndExclusive.toISOString()})`;
  const { data: bookings, error: bookingsError } = await sb
    .from('bookings')
    .select('*,profiles(full_name,email)')
    .eq('status', 'completed')
    .or(completedWindow)
    .order('completed_at', { ascending: true });

  // A failed query used to render exactly like a month with no work: $0
  // revenue, 0 jobs, an empty P&L and a BAS of zero. Nothing on the screen
  // said the number had not been read. This is the "No silent errors" rule in
  // CLAUDE.md, and the Analytics screen next door already obeys it.
  if (bookingsError) {
    showFinanceError(bookingsError.message, periodLabel(view, month, year));
    return;
  }

  const jobs = bookings || [];
  const revenue = anRevenueOf(jobs);
  const jobCount = jobs.length;
  const gst = Math.round(revenue / 11); // GST inclusive: 1/11
  const netRevenue = revenue - gst;
  if (!_expenses) _expenses = await fetchExpenses();
  const exp = expTotalsInRange(
    _expenses.available ? _expenses.expenses : [],
    dateFrom,
    dateTo
  );
  // Parts is a category like any other now, not jobCount x $10.
  const varCosts = exp.byCat.parts || 0;
  const fixedTotal = exp.total - varCosts;
  const grossProfit = netRevenue - varCosts;
  const netProfit = grossProfit - fixedTotal;
  const margin = netRevenue > 0 ? Math.round((netProfit / netRevenue) * 100) : 0;
  const avgJob = jobCount > 0 ? Math.round(revenue / jobCount) : 0;

  // KPIs
  document.getElementById('fk-revenue').textContent = '$' + revenue.toLocaleString('en-AU');
  // A booking with no callout_fee recorded contributes zero call-out, never an
  // assumed $20 - inventing a fee here would land in a BAS lodgement. Say how
  // many rows are in that state instead of quietly absorbing them, same as the
  // Analytics screen does.
  const calloutGaps = anCalloutGaps(jobs);
  document.getElementById('fk-jobs').textContent =
    jobCount +
    ' job' +
    (jobCount !== 1 ? 's' : '') +
    (calloutGaps ? ` · ${calloutGaps} with no call-out fee recorded` : '');
  document.getElementById('fk-gst').textContent = '$' + gst.toLocaleString('en-AU');
  document.getElementById('fk-net').textContent = '$' + netRevenue.toLocaleString('en-AU');
  document.getElementById('fk-avg').textContent = 'avg ' + anMoney(avgJob) + ' / job';
  const profitEl = document.getElementById('fk-profit');
  profitEl.textContent = (netProfit < 0 ? '-$' : '$') + Math.abs(netProfit).toLocaleString('en-AU');
  profitEl.style.color = netProfit >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('fk-margin').textContent = margin + '% margin';

  // P&L rows
  const plRows = [
    { label: 'Revenue (incl. GST)', val: revenue, bold: true, color: 'var(--green)' },
    { label: 'GST collected (1/11)', val: -gst, neg: true },
    { label: 'Net revenue (ex GST)', val: netRevenue, bold: true, sub: true },
    { label: 'Variable costs (parts)', val: -varCosts, neg: true },
    { label: 'Gross profit', val: grossProfit, bold: true, color: 'var(--green)' },
    // Only the categories that actually have something in them. A row of six
    // zeros reads like six costs the business has and is not paying; an absent
    // row reads like what it is - nothing loaded under that heading.
    ...Object.keys(EXPENSE_LABELS)
      .filter((c) => c !== 'parts' && exp.byCat[c])
      .map((c) => ({ label: EXPENSE_LABELS[c], val: -exp.byCat[c], neg: true })),
    {
      label: 'Net profit',
      val: netProfit,
      bold: true,
      total: true,
      color: netProfit >= 0 ? 'var(--green)' : 'var(--red)',
    },
  ];

  const periodStr = periodLabel(view, month, year);

  document.getElementById('fin-pl-period').textContent = periodStr;
  // Never let an unreadable expense table look like a business with no costs.
  const expNote = !_expenses.available
    ? `<div class="pl-row" style="color:var(--red);font-size:13px;line-height:1.5;display:block">Costs are missing from this P&amp;L: ${esc(_expenses.reason || 'the expenses could not be read')}</div>`
    : exp.total === 0
      ? '<div class="pl-row" style="color:var(--mgray);font-size:13px;line-height:1.5;display:block">No expenses loaded for this period. Add them on the Expenses screen - until then this is revenue, not profit.</div>'
      : '';
  document.getElementById('fin-pl-rows').innerHTML = expNote + plRows
    .map(
      (r) => `
    <div class="pl-row${r.sub ? ' subtotal' : ''}${r.total ? ' total' : ''}">
      <span class="pl-label${r.bold ? ' dark' : ''}">${esc(r.label)}</span>
      <span style="font-weight:${r.bold ? '700' : '500'};color:${r.color || (r.neg ? 'var(--red)' : 'var(--navy)')}">
        ${r.val >= 0 ? '$' : '–$'}${Math.abs(r.val).toLocaleString('en-AU')}
      </span>
    </div>`
    )
    .join('');

  // Daily chart
  const dailyMap = {};
  jobs.forEach((j) => {
    // Bucketed by the day the money was recognised, same as the totals above.
    // Bucketing by scheduled_date while the total counted completions put a
    // bar on a day that contributed nothing to it.
    const d = finRevenueDate(j);
    if (!d) return;
    dailyMap[d] = (dailyMap[d] || 0) + anBookingRevenue(j);
  });
  const days = Object.keys(dailyMap).sort();
  const maxVal = Math.max(...Object.values(dailyMap), 1);
  document.getElementById('fin-chart-sub').textContent = periodStr + ' · ' + jobCount + ' jobs';
  document.getElementById('fin-chart').innerHTML = days.length
    ? days
        .map((d) => {
          const v = dailyMap[d];
          const h = Math.max(8, Math.round((v / maxVal) * 140));
          const label = new Date(d + 'T00:00:00').getDate();
          return `<div style="display:flex;flex-direction:column;align-items:center;flex:1 1 0;max-width:32px;gap:3px" title="${d}: ${anMoney(v)}">
      <div style="width:100%;background:var(--blue);border-radius:3px 3px 0 0;height:${h}px;min-height:4px"></div>
      <div style="font-size:11px;color:var(--mgray)">${label}</div>
    </div>`;
        })
        .join('')
    : '<div style="color:var(--mgray);font-size:13px;margin:auto">No completed jobs in this period</div>';

  // BAS
  document.getElementById('bas-g1').textContent = '$' + revenue.toLocaleString('en-AU');
  document.getElementById('bas-1a').textContent = '$' + gst.toLocaleString('en-AU');
  document.getElementById('bas-1b').textContent = '$0'; // no GST on purchases yet
  document.getElementById('bas-net').textContent = '$' + gst.toLocaleString('en-AU');

  // Transactions table
  document.getElementById('fin-tx-sub').textContent = jobCount + ' completed jobs · ' + periodStr;
  document.getElementById('fin-tx-body').innerHTML = jobs.length
    ? jobs
        .map((j) => {
          const price = anBookingRevenue(j);
          const jGst = Math.round(price / 11);
          const jNet = price - jGst;
          const name =
            j.client_name || j.profiles?.full_name || j.profiles?.email?.split('@')[0] || 'Client';
          return `<tr>
      <td data-label="Date">${esc(finRevenueDate(j))}</td>
      <td data-label="Client">${esc(name)}</td>
      <td data-label="Service">${esc(j.service_name || 'Service')}</td>
      <td data-label="Amount" style="font-weight:600">$${price.toLocaleString('en-AU')}</td>
      <td data-label="GST" style="color:var(--orange)">${anMoney(jGst)}</td>
      <td data-label="Net">${anMoney(jNet)}</td>
      <td data-label="Status"><span style="background:var(--green-lt);color:var(--green-ink);border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600">Paid</span></td>
    </tr>`;
        })
        .join('')
    : '<tr><td colspan="7"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;gap:10px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><div style="font-size:15px;font-weight:600;color:var(--mgray)">No transactions yet</div><div style="font-size:13px;color:var(--mgray);opacity:0.7">Completed jobs will appear here</div></div></td></tr>';

  // Store for export
  window._finData = {
    jobs,
    revenue,
    gst,
    netRevenue,
    grossProfit,
    netProfit,
    margin,
    jobCount,
    avgJob,
    calloutGaps,
    periodStr,
    dateFrom,
    dateTo,
  };
}

function exportFinanceCSV() {
  const d = window._finData;
  if (!d) return;
  const rows = [
    ['Date', 'Client', 'Service', 'Amount (incl GST)', 'GST', 'Net Amount', 'Status'],
    ...d.jobs.map((j) => {
      const price = anBookingRevenue(j);
      const gst = Math.round(price / 11);
      return [
        finRevenueDate(j),
        j.profiles?.full_name || j.profiles?.email || '',
        j.service_name || '',
        price,
        gst,
        price - gst,
        'Completed',
      ];
    }),
    [],
    ['SUMMARY', '', '', '', '', '', ''],
    ['Period', d.periodStr, '', '', '', '', ''],
    ['Total Revenue (incl GST)', d.revenue, '', '', '', '', ''],
    ['GST Collected', d.gst, '', '', '', '', ''],
    ['Net Revenue', d.netRevenue, '', '', '', '', ''],
    ['Net Profit', d.netProfit, '', '', '', '', ''],
    ['Margin', d.margin + '%', '', '', '', '', ''],
  ];
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `DrBike_Finance_${d.periodStr.replace(/ /g, '_')}.csv`;
  a.click();
}

function exportBAS() {
  const d = window._finData;
  if (!d) return;
  const content = `DR. BIKE SYDNEY — BAS SUMMARY
Period: ${d.periodStr}
ABN: [Your ABN here]
Generated: ${new Date().toLocaleDateString('en-AU')}

G1 — Total Sales (incl GST): $${d.revenue.toLocaleString('en-AU')}
G2 — Export Sales: $0
G3 — Other GST-free Sales: $0
G10 — Capital Purchases: $0
G11 — Non-capital Purchases: $0

1A — GST on Sales (G1/11): $${d.gst.toLocaleString('en-AU')}
1B — GST Credits on Purchases: $0
NET GST PAYABLE TO ATO: $${d.gst.toLocaleString('en-AU')}

Jobs completed: ${d.jobCount}
Average job value: ${anMoney(d.avgJob)}
Basis: service_price + callout_fee, as recorded on each completed booking.
${
  d.calloutGaps
    ? `WARNING: ${d.calloutGaps} of those ${d.jobCount} bookings have no call-out fee
recorded. They are counted with a $0 call-out, so G1 above is UNDERSTATED.
Check those rows before lodging.`
    : 'All completed bookings in this period have a call-out fee recorded.'
}

NOTE: This is an estimate. Please verify with your registered tax agent before lodging.`;
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `DrBike_BAS_${d.periodStr.replace(/ /g, '_')}.txt`;
  a.click();
}

function exportFinancePDF() {
  const d = window._finData;
  if (!d) {
    toast('Load finance data first');
    return;
  }

  // Service breakdown
  const svcMap = {};
  (d.jobs || []).forEach((j) => {
    const k = j.service_name || 'Other';
    svcMap[k] = (svcMap[k] || 0) + anBookingRevenue(j);
  });
  const topSvcs = Object.entries(svcMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxSvc = topSvcs[0]?.[1] || 1;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Dr. Bike Sydney — Finance Report</title>
  <style>
    /* window.open('') is a BRAND NEW document: it does not load
       css/variables.css, so every var(--x) below this line resolved to nothing
       and the declaration was dropped - the report printed with no brand blue,
       no KPI backgrounds and no grey subtitles (docs/PENDIENTES.md 12.14).
       Re-declaring the seven tokens the report uses keeps it self-contained and
       keeps the values in one place. These are DEFINITIONS: never turn them
       into var() themselves. */
    :root{--blue:#2563EB;--green:#15803D;--gray:#475569;--gray-lt:#94A3B8;--border:#E2E8F0;--border-lt:#F1F5F9;--surface:#F8FAFC}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#0D1F3C;background:#fff}
    .page{max-width:820px;margin:0 auto;padding:48px 40px}
    .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid var(--blue)}
    .brand{display:flex;align-items:center;gap:12px}
    .brand-icon{width:42px;height:42px;background:var(--blue);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:800}
    .brand-name{font-size:20px;font-weight:800;color:#0D1F3C}
    .brand-sub{font-size:13px;color:var(--gray);margin-top:1px}
    .report-info{text-align:right}
    .report-title{font-size:15px;font-weight:700;color:#0D1F3C}
    .report-period{font-size:13px;color:var(--gray);margin-top:2px}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:32px}
    .kpi{background:var(--surface);border-radius:12px;padding:16px;border-left:3px solid var(--blue)}
    .kpi.green{border-left-color:var(--green)}
    .kpi.orange{border-left-color:#B45309}
    .kpi.red{border-left-color:#CF2020}
    .kpi-label{font-size:11px;font-weight:600;color:var(--gray);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}
    .kpi-val{font-size:24px;font-weight:800;color:#0D1F3C}
    .kpi-sub{font-size:11px;color:var(--gray-lt);margin-top:3px}
    .section-title{font-size:13px;font-weight:700;color:#0D1F3C;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid var(--border)}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
    .bar-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .bar-label{font-size:11px;color:var(--gray);min-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bar-bg{flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden}
    .bar-fill{height:100%;background:var(--blue);border-radius:4px}
    .bar-val{font-size:11px;font-weight:700;color:#0D1F3C;min-width:44px;text-align:right}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:32px}
    thead th{background:#0D1F3C;color:#fff;padding:10px 12px;text-align:left;font-size:11px;font-weight:600;letter-spacing:0.04em}
    tbody tr:nth-child(even){background:var(--surface)}
    tbody td{padding:9px 12px;border-bottom:1px solid var(--border-lt);color:var(--gray)}
    tbody td.bold{font-weight:700;color:#0D1F3C}
    tbody td.blue{font-weight:700;color:var(--blue)}
    .footer{margin-top:24px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
    .footer-left{font-size:11px;color:var(--gray-lt)}
    .print-btn{background:var(--blue);color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer}
    @media print{.print-btn{display:none}.page{padding:20px}}
  </style></head>
  <body><div class="page">
    <div class="header">
      <div class="brand">
        <div class="brand-icon">🚲</div>
        <div>
          <div class="brand-name">Dr. Bike Sydney</div>
          <div class="brand-sub">drbikesydney.com.au · ABN 87 654 025 287</div>
        </div>
      </div>
      <div class="report-info">
        <div class="report-title">Finance Report</div>
        <div class="report-period">${d.periodStr} · Generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Revenue (incl GST)</div><div class="kpi-val">$${d.revenue.toLocaleString('en-AU')}</div><div class="kpi-sub">${(d.jobs || []).length} completed jobs</div></div>
      <div class="kpi green"><div class="kpi-label">Net Revenue</div><div class="kpi-val">$${d.netRevenue.toLocaleString('en-AU')}</div><div class="kpi-sub">excl. GST</div></div>
      <div class="kpi orange"><div class="kpi-label">GST Collected</div><div class="kpi-val">$${d.gst.toLocaleString('en-AU')}</div><div class="kpi-sub">payable to ATO</div></div>
      <div class="kpi"><div class="kpi-label">Est. Net Profit</div><div class="kpi-val">$${d.netProfit.toLocaleString('en-AU')}</div><div class="kpi-sub">after expenses</div></div>
    </div>

    <div class="two-col">
      <div>
        <div class="section-title">Revenue by service</div>
        ${topSvcs
          .map(
            ([name, val]) => `
          <div class="bar-row">
            <div class="bar-label">${name}</div>
            <div class="bar-bg"><div class="bar-fill" style="width:${Math.round((val / maxSvc) * 100)}%"></div></div>
            <div class="bar-val">${anMoney(val)}</div>
          </div>`
          )
          .join('')}
      </div>
      <div>
        <div class="section-title">Summary</div>
        <table style="margin:0">
          <tbody>
            <tr><td>Total bookings</td><td class="bold" style="text-align:right">${(d.jobs || []).length}</td></tr>
            <tr><td>Avg order value</td><td class="bold" style="text-align:right">$${(d.jobs || []).length ? Math.round(d.revenue / (d.jobs || []).length) : 0}</td></tr>
            <tr><td>Revenue (incl GST)</td><td class="blue" style="text-align:right">$${d.revenue.toLocaleString('en-AU')}</td></tr>
            <tr><td>GST (10%)</td><td class="bold" style="text-align:right">$${d.gst.toLocaleString('en-AU')}</td></tr>
            <tr><td>Net revenue</td><td class="bold" style="text-align:right">$${d.netRevenue.toLocaleString('en-AU')}</td></tr>
            <tr><td>Est. expenses</td><td class="bold" style="text-align:right">$${(d.netRevenue - d.netProfit).toLocaleString('en-AU')}</td></tr>
            <tr><td style="font-weight:700">Est. net profit</td><td class="blue" style="text-align:right;font-weight:800">$${d.netProfit.toLocaleString('en-AU')}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-title">Transaction detail</div>
    <table>
      <thead><tr><th>Date</th><th>Client</th><th>Service</th><th>Van</th><th>Amount</th><th>GST</th><th>Net</th></tr></thead>
      <tbody>${(d.jobs || [])
        .map((j) => {
          const p = anBookingRevenue(j),
            g = Math.round(p / 11);
          return (
            '<tr><td>' +
            (finRevenueDate(j) || '—') +
            '</td><td class="bold">' +
            escapeHtml(j.profiles?.full_name || 'Client') +
            '</td><td>' +
            escapeHtml(j.service_name || '—') +
            '</td><td>Van ' +
            (j.van_number || 1) +
            '</td><td class="blue">$' +
            p +
            '</td><td>$' +
            g +
            '</td><td>$' +
            (p - g) +
            '</td></tr>'
          );
        })
        .join('')}
      ${!(d.jobs || []).length ? '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gray-lt)">No completed bookings in this period</td></tr>' : ''}
      </tbody>
    </table>

    <div class="footer">
      <div class="footer-left">Dr. Bike Sydney · ABN 87 654 025 287 · hello@drbikesydney.com.au · This report is for internal use only.</div>
      <button class="print-btn" onclick="window.print()">🖨️ Save as PDF</button>
    </div>
  </div></body></html>`);
  win.document.close();
}

// ── AVAILABILITY BLOCKING ─────────────────────────────────────────────────────
function openBlockModal() {
  document.getElementById('block-modal')?.remove();
  const today = new Date().toISOString().split('T')[0];
  const modal = document.createElement('div');
  modal.id = 'block-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px;padding:24px;width:100%;max-width:420px;font-family:var(--sans)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-size:15px;font-weight:700;color:var(--navy)">🚫 Block availability</div>
        <button data-action="close-block-modal" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--mgray)">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:6px;text-transform:uppercase">Van</div>
          <select id="block-van" class="inp" aria-label="Van" style="margin:0">
            <option value="1">Van 1 — Inner West / Eastern / CBD</option>
            <option value="2">Van 2 — North Shore / Manly / Beaches</option>
            <option value="0">All vans</option>
          </select>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:6px;text-transform:uppercase">Date</div>
          <input type="date" id="block-date" class="inp" aria-label="Date" style="margin:0" min="${today}" value="${today}">
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:8px;text-transform:uppercase">Time slots to block</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px" id="block-slots">
            ${[
              '8:00',
              '8:30',
              '9:00',
              '9:30',
              '10:00',
              '10:30',
              '11:00',
              '11:30',
              '12:00',
              '12:30',
              '13:00',
              '13:30',
              '14:00',
              '14:30',
              '15:00',
              '15:30',
              '16:00',
              '16:30',
            ]
              .map(
                (t) =>
                  `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:6px;border:1px solid var(--border);border-radius:6px;color:var(--navy)">
                <input type="checkbox" value="${t}" style="accent-color:var(--blue)"> ${t}
              </label>`
              )
              .join('')}
          </div>
          <button data-action="select-all-slots" data-value="true" style="background:none;border:none;color:var(--blue);font-size:13px;cursor:pointer;font-family:var(--sans);margin-top:6px;padding:0">Select all</button>
          <button data-action="select-all-slots" data-value="false" style="background:none;border:none;color:var(--mgray);font-size:13px;cursor:pointer;font-family:var(--sans);margin-top:6px;padding:0;margin-left:12px">Clear all</button>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:6px;text-transform:uppercase">Reason (optional)</div>
          <input type="text" id="block-reason" class="inp" aria-label="Reason" style="margin:0" placeholder="e.g. Public holiday, mechanic unavailable">
        </div>
        <div style="display:flex;gap:10px;margin-top:4px">
          <button data-action="save-blocks" style="flex:1;padding:12px;background:var(--blue);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;font-family:var(--sans)">Block selected slots</button>
          <button data-action="unblock-date" style="flex:1;padding:12px;background:var(--off);color:var(--red);border:1.5px solid var(--red-edge);border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;font-family:var(--sans)">Unblock all</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function selectAllSlots(sel) {
  document
    .querySelectorAll('#block-slots input[type=checkbox]')
    .forEach((cb) => (cb.checked = sel));
}

async function saveBlocks() {
  const van = parseInt(document.getElementById('block-van').value);
  const date = document.getElementById('block-date').value;
  const reason = document.getElementById('block-reason').value;
  const slots = [...document.querySelectorAll('#block-slots input:checked')].map((cb) => cb.value);

  if (!date) {
    showToast('Pick a date');
    return;
  }
  if (!slots.length) {
    showToast('Select at least one slot');
    return;
  }

  // `available: false` - there is no `blocked` column and never was. Writing
  // one meant every save failed with 42703 and nothing was ever stored: the
  // table held 0 rows on 2026-08-16, years in (PENDIENTES 21).
  //
  // van_number 0 rather than null for "all vans": null never conflicts with
  // null in a unique index, so the upsert would insert a duplicate row every
  // time instead of updating the existing block. 0 is the sentinel van_zones
  // already uses.
  const rows = slots.map((time) => ({
    date,
    time_slot: time,
    van_number: van || 0,
    available: false,
    reason: reason || null,
  }));

  const { error } = await sb
    .from('availability')
    .upsert(rows, { onConflict: 'date,time_slot,van_number' });
  if (error) {
    showToast('Error: ' + error.message);
    return;
  }

  document.getElementById('block-modal').remove();
  showToast(
    `✅ ${slots.length} slot${slots.length > 1 ? 's' : ''} blocked for ${new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`
  );
  loadCalendar();
}

async function unblockDate() {
  const van = parseInt(document.getElementById('block-van').value);
  const date = document.getElementById('block-date').value;
  if (!date) {
    showToast('Pick a date');
    return;
  }

  // Same column as saveBlocks writes. This filtered on `blocked` too, so
  // Unblock could not have worked even if Block had.
  let q = sb.from('availability').delete().eq('date', date).eq('available', false);
  if (van) q = q.eq('van_number', van);

  const { error } = await q;
  if (error) {
    showToast('Error: ' + error.message);
    return;
  }

  document.getElementById('block-modal').remove();
  showToast(
    `✅ All slots unblocked for ${new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`
  );
  loadCalendar();
}

// ── BROADCAST PUSH ────────────────────────────────────────────────────────────
async function sendBroadcastPush() {
  const title = document.getElementById('bc-title').value.trim();
  const body = document.getElementById('bc-body').value.trim();
  const url = document.getElementById('bc-url').value;
  const res = document.getElementById('bc-result');

  if (!title || !body) {
    showToast('Fill in title and message');
    return;
  }

  res.style.display = 'block';
  res.innerHTML = '<span style="color:var(--mgray)">Sending...</span>';

  try {
    // /api/send-push needs a real credential now, not just our Origin header.
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session?.access_token) {
      res.innerHTML = '<span style="color:var(--red)">Session expired - sign in again.</span>';
      return;
    }

    // Get all client IDs with push subscriptions
    const { data: profiles } = await sb
      .from('profiles')
      .select('id')
      .eq('role', 'client')
      .not('push_subscription', 'is', null);
    if (!profiles?.length) {
      res.innerHTML = '<span style="color:var(--mgray)">No subscribed clients yet.</span>';
      return;
    }

    let sent = 0;
    await Promise.allSettled(
      (profiles || []).map(async (p) => {
        try {
          await fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId: p.id,
              title,
              body,
              url,
              tag: 'broadcast-' + Date.now(),
              access_token: session.access_token,
            }),
          });
          sent++;
        } catch (e) {}
      })
    );

    res.innerHTML = `<span style="color:var(--green)">✅ Sent to ${sent} subscriber${sent !== 1 ? 's' : ''}!</span>`;
    document.getElementById('bc-title').value = '';
    document.getElementById('bc-body').value = '';
  } catch (e) {
    res.innerHTML = `<span style="color:var(--red)">Error: ${e.message}</span>`;
  }
}

// ── REFERRAL LEADERBOARD ──────────────────────────────────────────────────────
async function loadReferralLeaderboard() {
  const el = document.getElementById('referral-leaderboard');
  if (!el) return;

  const { data } = await sb
    .from('profiles')
    .select('full_name,email,referral_code,referral_count,membership_plan')
    .gt('referral_count', 0)
    .order('referral_count', { ascending: false })
    .limit(10);

  if (!data?.length) {
    el.innerHTML =
      '<div style="text-align:center;padding:20px;color:var(--mgray);font-size:13px">No referrals yet — share the app!</div>';
    return;
  }

  el.innerHTML = data
    .map((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const savings = (p.referral_count || 0) * 15;
      return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:18px;min-width:28px;text-align:center">${medal || '#' + (i + 1)}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:var(--navy)">${esc(p.full_name || p.email?.split('@')[0] || 'Client')}</div>
        <div style="font-size:11px;color:var(--mgray)">Code: ${esc(p.referral_code || '—')} · ${esc(p.membership_plan || 'No plan')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:700;color:var(--blue)">${p.referral_count} referral${p.referral_count !== 1 ? 's' : ''}</div>
        <div style="font-size:11px;color:var(--mgray)">saved $${savings}</div>
      </div>
    </div>`;
    })
    .join('');
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
function showToast(msg) {
  let t = document.getElementById('admin-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'admin-toast';
    t.style.cssText =
      'position:fixed;bottom:24px;right:24px;background:#0D1F3C;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;z-index:9999;opacity:0;transition:opacity .3s;font-family:Inter,sans-serif';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(() => (t.style.opacity = '0'), 3000);
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
// ── DISCOUNT CODES ────────────────────────────────────────────────────────────
async function loadCoupons() {
  const grid = document.getElementById('coupons-grid');
  if (!grid) return;
  grid.innerHTML =
    '<div style="text-align:center;padding:48px;color:var(--mgray);grid-column:1/-1;font-size:13px">Loading...</div>';

  try {
    const { data, error } = await sb
      .from('discount_codes')
      .select('*')
      .order('created_at', { ascending: false });
    console.log('[loadCoupons]', { data, error });

    if (error) {
      grid.innerHTML = `<div style="text-align:center;padding:48px;color:var(--red);grid-column:1/-1">❌ ${error.message}<br><small style="color:var(--mgray)">Check that the discount_codes table exists in Supabase and RLS allows select.</small></div>`;
      return;
    }
    if (!data?.length) {
      grid.innerHTML =
        '<div style="text-align:center;padding:48px;color:var(--mgray);grid-column:1/-1;font-size:13px">No codes yet — create your first one above! 🎟️</div>';
      return;
    }

    grid.innerHTML = data
      .map((c) => {
        const isActive = c.active;
        const isPct = c.discount_type === 'percent';
        const valDisplay = isPct ? `${c.discount_value}%` : `$${c.discount_value}`;
        const usesDisplay = `${c.uses_count || 0}${c.max_uses ? ' / ' + c.max_uses : ''}`;
        const expDisplay = c.expires_at
          ? new Date(c.expires_at).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : 'No expiry';
        const expired = c.expires_at && new Date(c.expires_at) < new Date();

        return `
      <div style="background:var(--white);border:1.5px solid ${isActive && !expired ? 'var(--border)' : 'var(--red-edge)'};border-radius:16px;padding:20px;box-shadow:var(--shadow);position:relative;overflow:hidden;transition:box-shadow .2s">
        <!-- Color accent top bar -->
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${isActive && !expired ? 'linear-gradient(90deg,var(--blue),#6366F1)' : '#FCA5A5'}"></div>

        <!-- Code + status -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;margin-top:4px">
          <div style="font-size:18px;font-weight:800;color:var(--navy);letter-spacing:0.08em;font-variant-numeric:tabular-nums">${esc(c.code)}</div>
          <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.05em;background:${isActive && !expired ? '#DCFCE7' : '#FEE2E2'};color:${isActive && !expired ? 'var(--green)' : 'var(--red)'}">${expired ? 'Expired' : isActive ? 'Active' : 'Inactive'}</span>
        </div>

        <!-- Big value display -->
        <div style="background:${isPct ? 'var(--blue-tint)' : 'var(--green-tint)'};border-radius:12px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px">
          <div style="font-size:28px;font-weight:800;color:${isPct ? 'var(--blue)' : 'var(--green)'}">${valDisplay}</div>
          <div style="font-size:13px;color:var(--mgray);line-height:1.4">${isPct ? 'percentage<br>discount' : 'fixed amount<br>discount'}</div>
        </div>

        <!-- Stats row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div style="background:var(--off);border-radius:10px;padding:10px 12px">
            <div style="font-size:11px;font-weight:600;color:var(--mgray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Uses</div>
            <div style="font-size:15px;font-weight:700;color:var(--navy)">${usesDisplay}</div>
          </div>
          <div style="background:var(--off);border-radius:10px;padding:10px 12px">
            <div style="font-size:11px;font-weight:600;color:var(--mgray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Expires</div>
            <div style="font-size:13px;font-weight:600;color:${expired ? 'var(--red)' : 'var(--navy)'}">${expDisplay}</div>
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:8px">
          <button data-action="toggle-coupon" data-id="${c.id}" data-value="${!isActive}" style="flex:1;padding:9px;border:1.5px solid ${isActive ? '#FCA5A5' : '#86EFAC'};border-radius:8px;background:${isActive ? '#FEF2F2' : '#F0FDF4'};color:${isActive ? 'var(--red)' : 'var(--green)'};font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
            ${isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button data-action="delete-coupon" data-id="${c.id}" data-code="${esc(c.code)}" style="padding:9px 14px;border:1.5px solid #FCA5A5;border-radius:8px;background:#FEF2F2;color:var(--red);font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>`;
      })
      .join('');
  } catch (e) {
    console.error('[loadCoupons] exception:', e);
    grid.innerHTML = `<div style="text-align:center;padding:48px;color:var(--red);grid-column:1/-1">❌ Exception: ${escapeHtml(e.message)}</div>`;
  }
}

function toggleCouponForm() {
  const form = document.getElementById('coupon-inline-form');
  const btn = document.getElementById('btn-toggle-coupon-form');
  if (!form) return;
  const isHidden = form.style.display === 'none';
  form.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? '✕ Cancel' : '+ Create code';
  if (isHidden) {
    // Reset form fields when opening
    document.getElementById('c-code').value = '';
    document.getElementById('c-type').value = 'fixed';
    document.getElementById('c-value').value = '';
    document.getElementById('c-maxuses').value = '';
    document.getElementById('c-expires').value = '';
  }
}

function toast(msg) {
  let t = document.getElementById('admin-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'admin-toast';
    t.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0D1F3C;color:#fff;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:500;z-index:9999;opacity:0;transition:opacity .2s;pointer-events:none;font-family:Inter,sans-serif';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(() => (t.style.opacity = '0'), 3000);
}

let savingCoupon = false;
async function saveCoupon() {
  if (savingCoupon) return;
  savingCoupon = true;

  const code = (document.getElementById('c-code')?.value || '').trim().toUpperCase();
  const type = document.getElementById('c-type')?.value || 'fixed';
  const value = parseFloat(document.getElementById('c-value')?.value);
  const maxUses = parseInt(document.getElementById('c-maxuses')?.value) || null;
  const expires = document.getElementById('c-expires')?.value || null;

  if (!code) {
    toast('⚠️ Please enter a code');
    savingCoupon = false;
    return;
  }
  if (!value || isNaN(value)) {
    toast('⚠️ Please enter a discount value');
    savingCoupon = false;
    return;
  }

  const btn = document.getElementById('c-save-btn');
  if (btn) {
    btn.textContent = 'Creating…';
    btn.disabled = true;
  }

  try {
    const insertData = {
      code,
      discount_type: type,
      discount_value: value,
      active: true,
      uses_count: 0,
    };
    if (maxUses && !isNaN(maxUses)) insertData.max_uses = maxUses;
    if (expires) insertData.expires_at = new Date(expires).toISOString();

    const { data, error } = await sb.from('discount_codes').insert(insertData).select();

    if (error) {
      toast('❌ Error: ' + error.message);
      if (btn) {
        btn.textContent = 'Create code';
        btn.disabled = false;
      }
      savingCoupon = false;
      return;
    }

    // Hide form and reload table
    document.getElementById('coupon-inline-form').style.display = 'none';
    const toggleBtn = document.getElementById('btn-toggle-coupon-form');
    if (toggleBtn) toggleBtn.textContent = '+ Create code';
    await loadCoupons();
    toast('✅ Code ' + code + ' created!');
  } catch (e) {
    console.error('saveCoupon exception:', e);
    toast('❌ Exception: ' + e.message);
    if (btn) {
      btn.textContent = 'Create code';
      btn.disabled = false;
    }
  }
  savingCoupon = false;
}

async function toggleCoupon(id, active) {
  await sb.from('discount_codes').update({ active }).eq('id', id);
  loadCoupons();
}

async function deleteCoupon(id, code) {
  if (!confirm(`Delete code "${code}"? This cannot be undone.`)) return;
  await sb.from('discount_codes').delete().eq('id', id);
  loadCoupons();
  toast('🗑️ Code ' + code + ' deleted');
}

// ── REMINDERS ─────────────────────────────────────────────────────────────────
async function sendReminders() {
  const btn = document.getElementById('reminder-btn');
  const result = document.getElementById('reminder-result');
  btn.textContent = '⏳ Sending...';
  btn.disabled = true;
  result.style.display = 'none';
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      result.style.display = 'block';
      result.textContent = '❌ Your admin session expired - sign in again';
      btn.textContent = '📨 Send Reminders';
      btn.disabled = false;
      return;
    }
    const res = await fetch('/api/send-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session.access_token }),
    });
    const data = await res.json();
    result.style.display = 'block';
    result.style.color = res.ok ? 'var(--green)' : 'var(--red)';
    result.textContent = res.ok ? `✅ ${data.message}` : `❌ Error: ${data.error}`;
  } catch (e) {
    result.style.display = 'block';
    result.textContent = '❌ ' + e.message;
  }
  btn.textContent = '🚲 Send reminders now';
  btn.disabled = false;
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
// ── ADMIN AUTH ────────────────────────────────────────────────────────────────
// Admin user must be created in:
//   Supabase Dashboard -> Authentication -> Users -> Add User

function checkAdminAuth() {
  if (localStorage.getItem('drbike-admin-token')) return true;
  // One overlay, always. Two callers reach this in the same tick on a failed
  // boot: the onAuthStateChange listener, because setSession() rejecting the
  // stored pair emits SIGNED_OUT, and initAdmin() immediately after
  // restoreAdminSession() returns false. A second overlay puts a duplicate
  // #admin-email-inp / #admin-pass-inp in the DOM - and the duplicate is the
  // one the admin sees, since it paints on top at the same z-index, while
  // getElementById() keeps handing the submit handler the FIRST, empty pair.
  // Signing in then fails with "Missing credentials" no matter what is typed,
  // and _showLoginCard() renders the MFA step into the hidden card.
  if (document.getElementById('admin-login-overlay')) return false;
  const overlay = document.createElement('div');
  overlay.id = 'admin-login-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0D1F3C;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:40px 36px;width:100%;max-width:360px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="width:56px;height:56px;background:#fff;border:1px solid var(--border);border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px"><img src="images/logo-db.png" alt="Dr. Bike Sydney" height="30" style="width:auto;display:block"></div>
      <div style="font-size:20px;font-weight:800;color:#0D1F3C;margin-bottom:4px">Dr. Bike Admin</div>
      <div style="font-size:13px;color:var(--gray);margin-bottom:28px">Operations dashboard</div>
      <input type="email" id="admin-email-inp" placeholder="Email" aria-label="Email" autocomplete="username"
        style="width:100%;padding:13px 16px;border:1.5px solid var(--border);border-radius:10px;font-size:15px;color:#0D1F3C;font-family:Inter,sans-serif;outline:none;margin-bottom:10px;box-sizing:border-box"
        data-enter="focus-admin-pass">
      <input type="password" id="admin-pass-inp" placeholder="Password" aria-label="Password" autocomplete="current-password"
        style="width:100%;padding:13px 16px;border:1.5px solid var(--border);border-radius:10px;font-size:15px;color:#0D1F3C;font-family:Inter,sans-serif;outline:none;margin-bottom:12px;box-sizing:border-box"
        data-enter="submit-admin-login">
      <div id="admin-pass-err" style="color:var(--red);font-size:13px;margin-bottom:10px;display:none">Invalid credentials</div>
      <button data-action="submit-admin-login" style="width:100%;padding:13px;background:var(--blue);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">Sign in →</button>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('admin-email-inp')?.focus(), 100);
  return false;
}

// MFA state (module-level, cleared on overlay remove)
let _mfaFactorId = null,
  _mfaChallengeId = null,
  _mfaTempToken = null,
  _mfaTempRefresh = null,
  _mfaEnrollId = null;

async function submitAdminLogin() {
  const email = document.getElementById('admin-email-inp')?.value?.trim() || '';
  const password = document.getElementById('admin-pass-inp')?.value || '';
  const errEl = document.getElementById('admin-pass-err');
  const btn = document.querySelector('#admin-login-overlay button');
  if (!email || !password) {
    if (errEl) {
      errEl.textContent = 'Email and password required';
      errEl.style.display = 'block';
    }
    return;
  }
  if (btn) {
    btn.textContent = 'Signing in...';
    btn.disabled = true;
  }
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'admin', email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Invalid credentials');
    if (data.mfa_required) {
      _mfaFactorId = data.factor_id;
      _mfaChallengeId = data.challenge_id;
      _mfaTempToken = data.temp_token;
      _mfaTempRefresh = data.temp_refresh;
      _showLoginCard(_totpInputHTML());
      setTimeout(() => document.getElementById('admin-totp-inp')?.focus(), 80);
      return;
    }
    if (data.setup_mfa) {
      _mfaTempToken = data.access_token;
      _mfaTempRefresh = data.refresh_token;
      await _startMFAEnrollment();
      return;
    }
    _completeAdminLogin(data);
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.message || 'Invalid credentials';
      errEl.style.display = 'block';
    }
    const inp = document.getElementById('admin-pass-inp');
    if (inp) {
      inp.value = '';
      inp.style.borderColor = 'var(--red)';
      inp.focus();
    }
    if (btn) {
      btn.textContent = 'Sign in →';
      btn.disabled = false;
    }
  }
}

async function submitTOTPCode() {
  const code = document.getElementById('admin-totp-inp')?.value?.replace(/\s/g, '') || '';
  const errEl = document.getElementById('admin-totp-err');
  const btn = document.querySelector('#admin-login-overlay button');
  if (code.length !== 6) {
    if (errEl) {
      errEl.textContent = 'Enter 6-digit code';
      errEl.style.display = 'block';
    }
    return;
  }
  if (btn) {
    btn.textContent = 'Verifying...';
    btn.disabled = true;
  }
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'admin',
        totp_code: code,
        factor_id: _mfaFactorId,
        challenge_id: _mfaChallengeId,
        temp_token: _mfaTempToken,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Invalid code');
    _completeAdminLogin(data);
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
    const inp = document.getElementById('admin-totp-inp');
    if (inp) {
      inp.value = '';
      inp.style.borderColor = 'var(--red)';
      inp.focus();
    }
    if (btn) {
      btn.textContent = 'Verify →';
      btn.disabled = false;
    }
  }
}

async function _startMFAEnrollment() {
  _showLoginCard(
    '<div style="font-size:13px;color:var(--gray);margin:20px 0">Loading QR code...</div>'
  );
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'mfa-enroll', temp_token: _mfaTempToken }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Enrollment failed');
    _mfaEnrollId = data.factor_id;
    _showLoginCard(_enrollHTML(data.qr_code, data.secret));
    setTimeout(() => document.getElementById('admin-enroll-inp')?.focus(), 80);
  } catch (e) {
    // Enrollment failed — don't lock the admin out. The password was already verified,
    // so log in with the token in hand; 2FA can be set up another time.
    if (_mfaTempToken && _mfaTempRefresh) {
      _completeAdminLogin({ access_token: _mfaTempToken, refresh_token: _mfaTempRefresh });
    } else {
      _showLoginCard(
        '<div style="color:var(--red);padding:20px;font-size:13px">' +
          (e.message || 'Setup failed') +
          '</div>'
      );
    }
  }
}

async function submitMFASetupCode() {
  const code = document.getElementById('admin-enroll-inp')?.value?.replace(/\s/g, '') || '';
  const errEl = document.getElementById('admin-enroll-err');
  const btn = document.querySelector('#admin-login-overlay button');
  if (code.length !== 6) {
    if (errEl) {
      errEl.textContent = 'Enter 6-digit code';
      errEl.style.display = 'block';
    }
    return;
  }
  if (btn) {
    btn.textContent = 'Activating...';
    btn.disabled = true;
  }
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mfa-enroll-verify',
        totp_code: code,
        factor_id: _mfaEnrollId,
        temp_token: _mfaTempToken,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Invalid code');
    _completeAdminLogin(data);
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
    const inp = document.getElementById('admin-enroll-inp');
    if (inp) {
      inp.value = '';
      inp.style.borderColor = 'var(--red)';
      inp.focus();
    }
    if (btn) {
      btn.textContent = 'Activate 2FA →';
      btn.disabled = false;
    }
  }
}

async function _completeAdminLogin(data) {
  storeAdminSession(data);
  // await, not fire-and-forget: without it the dashboard starts loading and
  // subscribeToBookings() opens its realtime channel before the session exists,
  // so the first screen after signing in can hit RLS with no identity. Any
  // failure here has to be visible - a login that silently produced no session
  // is exactly how the panel ended up "logged in" with nothing working.
  //
  // It must also never REJECT. All four callers invoke it without `await`
  // (they are inside their own try/catch, which a floating promise does not
  // reach), so a throw here - setSession can throw on a network failure rather
  // than returning {error} - would become an unhandled rejection: the overlay
  // would sit there saying nothing while the tokens stayed in localStorage.
  // That is the same dead end this whole function exists to close, so the
  // throw is turned into the same visible message as a returned error.
  let error = null;
  try {
    ({ error } = await sb.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    }));
  } catch (e) {
    error = e;
  }
  if (error) {
    clearAdminSession();
    // whichever step of the login is on screen right now
    const errEl =
      document.getElementById('admin-enroll-err') ||
      document.getElementById('admin-totp-err') ||
      document.getElementById('admin-pass-err');
    if (errEl) {
      errEl.textContent = 'Signed in, but the session could not be opened: ' + error.message;
      errEl.style.display = 'block';
    } else {
      alert('Signed in, but the session could not be opened: ' + error.message);
    }
    return;
  }
  document.getElementById('admin-login-overlay')?.remove();
  go('dashboard');
  subscribeToBookings();
}

function _showLoginCard(innerHtml) {
  const card = document.querySelector('#admin-login-overlay > div');
  if (card) card.innerHTML = _loginCardHeader() + innerHtml;
}

function _loginCardHeader() {
  return '<div style="width:56px;height:56px;background:#fff;border:1px solid var(--border);border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px"><img src="images/logo-db.png" alt="Dr. Bike Sydney" height="30" style="width:auto;display:block"></div><div style="font-size:20px;font-weight:800;color:#0D1F3C;margin-bottom:4px">Dr. Bike Admin</div>';
}

const _inp =
  'width:100%;padding:13px 16px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:15px;color:#0D1F3C;font-family:Inter,sans-serif;outline:none;box-sizing:border-box;margin-bottom:12px';
const _btn =
  'width:100%;padding:13px;background:var(--blue);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif';

function _totpInputHTML() {
  return `<div style="font-size:13px;color:var(--gray);margin-bottom:28px">Enter the 6-digit code from your authenticator app</div>
  <input type="text" id="admin-totp-inp" placeholder="000000" aria-label="6-digit authentication code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code"
    style="${_inp}font-size:24px;font-weight:700;text-align:center;letter-spacing:10px"
    data-enter="submit-totp-code">
  <div id="admin-totp-err" style="color:var(--red);font-size:13px;margin-bottom:10px;display:none"></div>
  <button data-action="submit-totp-code" style="${_btn}">Verify →</button>`;
}

function _enrollHTML(qrSvg, secret) {
  return `<div style="font-size:13px;color:var(--gray);margin-bottom:16px">Scan with Google Authenticator or Authy to enable 2FA on this account</div>
  <div style="margin:0 auto 12px;max-width:180px">${qrSvg}</div>
  <div style="font-size:11px;color:var(--gray);margin-bottom:16px">Or enter manually: <code style="background:var(--border-lt);padding:2px 6px;border-radius:4px;font-size:11px;letter-spacing:1px">${secret}</code></div>
  <input type="text" id="admin-enroll-inp" placeholder="Enter 6-digit code to confirm" aria-label="6-digit code to confirm" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code"
    style="${_inp}font-size:20px;font-weight:700;text-align:center;letter-spacing:8px"
    data-enter="submit-mfa-setup-code">
  <div id="admin-enroll-err" style="color:var(--red);font-size:13px;margin-bottom:10px;display:none"></div>
  <button data-action="submit-mfa-setup-code" style="${_btn}">Activate 2FA →</button>`;
}

function showDashboardError(msg) {
  const box = document.getElementById('dash-error');
  if (box) {
    box.textContent = '❌ Could not load dashboard data: ' + msg;
    box.style.display = 'block';
  }
  // Leave the "$—" placeholders alone: showing $0 here would look like real
  // data, which is exactly the bug this guard exists to prevent.
  document.querySelectorAll('#page-dashboard .kpi-sub').forEach((el) => {
    el.textContent = 'unavailable';
  });
}

async function loadDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';
  const errBox = document.getElementById('dash-error');
  if (errBox) errBox.style.display = 'none';

  const results = await Promise.all([
    sb.from('bookings').select('*').eq('scheduled_date', today),
    sb.from('bookings').select('*').gte('scheduled_date', firstOfMonth).neq('status', 'cancelled'),
    sb.from('bookings').select('*').eq('status', 'pending'),
    sb.from('bookings').select('*').order('created_at', { ascending: false }).limit(5),
    sb.from('profiles').select('id'),
    sb
      .from('newsletter_subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('active', true),
    sb.from('bikes').select('*', { count: 'exact', head: true }),
  ]).catch((e) => e);

  if (results instanceof Error) return showDashboardError(results.message);
  // Supabase resolves (not rejects) on a query error, so an RLS or schema
  // problem would otherwise render as a silent $0 instead of a failure.
  const queryErr = results.find((r) => r && r.error)?.error;
  if (queryErr) return showDashboardError(queryErr.message);

  const [
    { data: todayJobs },
    { data: monthJobs },
    { data: pendingJobs },
    { data: recentBookings },
    { data: allClients },
    { count: newsletterCount },
    { count: bikesCount },
  ] = results;

  // Revenue is recognised when the job is finished. These two tiles used to sum
  // EVERY booking in the period - a pending job scheduled for today, or a
  // confirmed one nobody has ridden out to yet, counted as money already made.
  // Finance filters on status='completed' and so does the Analytics screen, so
  // the dashboard was the third screen with its own private definition of
  // "revenue" and the only one that flattered the number.
  const completedTodayJobs = (todayJobs || []).filter((b) => b.status === 'completed');
  const completedMonth = (monthJobs || []).filter((b) => b.status === 'completed');
  const todayRev = anRevenueOf(completedTodayJobs);
  const monthRev = anRevenueOf(completedMonth);
  const completedToday = completedTodayJobs.length;
  const avgOrder = completedMonth.length
    ? Math.round(anRevenueOf(completedMonth) / completedMonth.length)
    : 0;
  const cancelRate = (monthJobs || []).length
    ? Math.round(
        ((monthJobs || []).filter((b) => b.status === 'cancelled').length /
          (monthJobs || []).length) *
          100
      )
    : 0;

  const kpis = document.querySelectorAll('#page-dashboard .kpi-value');
  if (kpis[0]) {
    kpis[0].textContent = '$' + todayRev.toLocaleString('en-AU');
    kpis[0].nextElementSibling.textContent =
      completedToday +
      ' completed today · ' +
      anMoney(todayRev / Math.max(completedToday, 1)) +
      ' avg';
  }
  if (kpis[1]) {
    kpis[1].textContent = '$' + monthRev.toLocaleString('en-AU');
    kpis[1].nextElementSibling.textContent =
      completedMonth.length + ' completed · ' + anMoney(avgOrder) + ' avg order';
  }
  if (kpis[2]) {
    kpis[2].textContent = (pendingJobs || []).length;
    kpis[2].nextElementSibling.textContent =
      'awaiting confirmation · ' + cancelRate + '% cancel rate';
  }
  if (kpis[3]) {
    kpis[3].textContent = (allClients || []).length;
    kpis[3].nextElementSibling.textContent = 'total clients registered';
  }
  const newsletterEl = document.getElementById('kpi-newsletter');
  const newsletterSub = document.getElementById('kpi-newsletter-sub');
  if (newsletterEl) newsletterEl.textContent = newsletterCount || 0;
  if (newsletterSub) newsletterSub.textContent = 'active subscribers';
  const bikesEl = document.getElementById('kpi-bikes');
  const bikesSub = document.getElementById('kpi-bikes-sub');
  if (bikesEl) bikesEl.textContent = bikesCount || 0;
  if (bikesSub) bikesSub.textContent = 'client bikes on file';

  // Recent bookings table
  const tbody = document.querySelector('#page-dashboard .tbl tbody');
  if (tbody && recentBookings) {
    const stClass = {
      confirmed: 'confirmed',
      pending: 'pending',
      enroute: 'enroute',
      completed: 'completed',
      cancelled: 'cancelled',
    };
    tbody.innerHTML =
      recentBookings
        .map((b) => {
          const name = b.client_name || b.profiles?.full_name || 'Client';
          const initials = name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          const st = b.status || 'pending';
          const stColors = {
            pending: 'var(--amber)',
            confirmed: 'var(--blue)',
            enroute: 'var(--green)',
            completed: '#475569',
            cancelled: 'var(--red)',
          };
          const stBg = {
            pending: '#FEF3C7',
            confirmed: 'var(--blue-tint)',
            enroute: 'var(--green-tint)',
            completed: 'var(--border-lt)',
            cancelled: '#FEF2F2',
          };
          const stLabel = {
            pending: 'Pending',
            confirmed: 'Confirmed',
            enroute: 'En route',
            completed: 'Completed',
            cancelled: 'Cancelled',
          };
          const vanColors = { 1: 'var(--blue)', 2: 'var(--amber)', 3: 'var(--purple)', 4: 'var(--red)' };
          const vanNum = b.van_number || 1;
          return `<tr>
        <td data-label="Client" style="font-weight:700">${esc(name)}</td>
        <td data-label="Service">${esc(b.service_name || '—')}</td>
        <td data-label="Date">${b.scheduled_date || '—'}</td>
        <td data-label="Van"><span class="mech-tag v${vanNum}">Van ${vanNum}</span></td>
        <td data-label="Status"><span style="background:${stBg[st] || 'var(--border-lt)'};color:${stColors[st] || '#475569'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${stLabel[st] || st}</span></td>
        <td data-label="Price" style="font-weight:700;color:var(--blue)">${anBookingRevenue(b)}</td>
      </tr>`;
        })
        .join('') ||
      '<tr><td colspan="6" style="text-align:center;color:var(--mgray);padding:24px">No bookings yet — ready to go!</td></tr>';
  }

  // ── Today's bookings table ──
  const todayDate = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const todaySub = document.getElementById('dash-today-sub');
  if (todaySub)
    todaySub.textContent = `${todayDate} · ${(todayJobs || []).length} job${(todayJobs || []).length !== 1 ? 's' : ''}`;

  const todayTbody = document.getElementById('dash-today-tbody');
  if (todayTbody) {
    const stColors2 = {
      pending: 'var(--amber)',
      confirmed: 'var(--blue)',
      enroute: 'var(--green)',
      completed: '#475569',
      cancelled: 'var(--red)',
    };
    const stBg2 = {
      pending: '#FEF3C7',
      confirmed: 'var(--blue-tint)',
      enroute: 'var(--green-tint)',
      completed: 'var(--border-lt)',
      cancelled: '#FEF2F2',
    };
    const stLabel2 = {
      pending: 'Pending',
      confirmed: 'Confirmed',
      enroute: 'En route',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };
    if (todayJobs && todayJobs.length > 0) {
      const sorted = [...todayJobs].sort((a, b) =>
        (a.scheduled_time || '').localeCompare(b.scheduled_time || '')
      );
      todayTbody.innerHTML = sorted
        .map((b) => {
          const st = b.status || 'pending';
          const vanNum = b.van_number || 1;
          const clientName = b.profiles?.full_name || b.client_name || 'Client';
          const timeStr = b.scheduled_time || '—';
          return `<tr>
          <td data-label="Client" style="font-weight:600">${esc(clientName)}</td>
          <td data-label="Service">${esc(b.service_name || '—')}</td>
          <td data-label="Time">${timeStr}</td>
          <td data-label="Van"><span class="mech-tag v${vanNum}">Van ${vanNum}</span></td>
          <td data-label="Status"><span style="background:${stBg2[st]};color:${stColors2[st]};padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600">${stLabel2[st] || st}</span></td>
          <td data-label="Total" style="font-weight:700;color:var(--blue)">${anBookingRevenue(b)}</td>
        </tr>`;
        })
        .join('');
    } else {
      todayTbody.innerHTML = `<tr><td colspan="6"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;gap:8px">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div style="font-size:15px;font-weight:600;color:var(--mgray)">No jobs today</div>
        <div style="font-size:13px;color:var(--mgray);opacity:.7">New bookings appear here automatically</div>
      </div></td></tr>`;
    }
  }

  // ── Schedule timeline ──
  const schList = document.getElementById('dash-schedule-list');
  const schSub = document.getElementById('dash-schedule-sub');
  if (schList) {
    const upcoming = (todayJobs || [])
      .filter((b) => b.status !== 'completed' && b.status !== 'cancelled')
      .sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || ''));
    if (schSub) schSub.textContent = `${upcoming.length} upcoming today`;
    const stDotColors = {
      pending: 'var(--amber-bright)',
      confirmed: 'var(--blue)',
      enroute: 'var(--green)',
      completed: '#475569',
      cancelled: 'var(--red)',
    };
    if (upcoming.length > 0) {
      schList.innerHTML = upcoming
        .map(
          (b) => `
        <div class="sch-item">
          <div class="sch-time">${b.scheduled_time || '—'}</div>
          <div class="sch-dot" style="background:${stDotColors[b.status || 'pending']}"></div>
          <div style="flex:1;min-width:0">
            <div class="sch-name">${esc(b.profiles?.full_name || b.client_name || 'Client')}</div>
            <div class="sch-svc">${esc(b.service_name || 'Service')} · ${esc(b.suburb || '—')}</div>
          </div>
          <div class="sch-price">${anBookingRevenue(b)}</div>
        </div>`
        )
        .join('');
    } else {
      schList.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;gap:8px">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <div style="font-size:15px;font-weight:600;color:var(--mgray)">All clear for today</div>
        <div style="font-size:13px;color:var(--mgray);opacity:.7">No upcoming jobs</div>
      </div>`;
    }
  }
}

// ── BOOKINGS ──────────────────────────────────────────────────────────────────
let allBookings = [];

// TASK-030: filters now run server-side (not a client-side re-filter of a
// capped fetch) so a date range reaches data beyond the first page instead
// of silently returning nothing once there are more than one page of
// bookings. Pagination via .range() with a "Load more" button.
const BK_PAGE_SIZE = 100;
let bkOffset = 0;
let bkHasMore = false;

function buildBookingsQuery() {
  const from = document.getElementById('bk-f-from')?.value;
  const to = document.getElementById('bk-f-to')?.value;
  const van = document.getElementById('bk-f-van')?.value;
  const status = document.getElementById('bk-f-status')?.value;
  const search = document.getElementById('bk-f-search')?.value?.trim();

  let q = sb.from('bookings').select('*').order('created_at', { ascending: false });
  if (from) q = q.gte('scheduled_date', from);
  if (to) q = q.lte('scheduled_date', to);
  if (van) q = q.eq('van_number', parseInt(van));
  if (status) q = q.eq('status', status);
  if (search) q = q.ilike('client_name', `%${search}%`);
  return q;
}

async function loadBookings(reset = true) {
  if (reset) {
    bkOffset = 0;
    allBookings = [];
  }
  const { data, error } = await buildBookingsQuery().range(bkOffset, bkOffset + BK_PAGE_SIZE - 1);

  if (error) {
    showToast('Error cargando bookings: ' + error.message);
    return;
  }
  allBookings = reset ? data || [] : allBookings.concat(data || []);
  bkOffset += (data || []).length;
  bkHasMore = (data || []).length === BK_PAGE_SIZE;

  const loadMoreBtn = document.getElementById('bk-load-more');
  if (loadMoreBtn) loadMoreBtn.style.display = bkHasMore ? 'inline-block' : 'none';

  renderBookingsTable(allBookings);
}

function loadMoreBookings() {
  loadBookings(false);
}

function applyBookingFilters() {
  loadBookings(true);
}

function resetBookingFilters() {
  ['bk-f-from', 'bk-f-to', 'bk-f-search'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['bk-f-van', 'bk-f-status'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  applyBookingFilters();
}

function renderBookingsTable(data) {
  const tbody = document.getElementById('bk-tbody');
  if (!tbody) return;
  const stClass = {
    confirmed: 'confirmed',
    pending: 'pending',
    enroute: 'enroute',
    completed: 'completed',
    cancelled: 'cancelled',
  };

  const completed = (data || []).filter((b) => b.status === 'completed');
  const revenue = anRevenueOf(completed);
  const el = (id) => document.getElementById(id);
  if (el('bk-total')) el('bk-total').textContent = data.length;
  if (el('bk-confirmed'))
    el('bk-confirmed').textContent = data.filter((b) => b.status === 'confirmed').length;
  if (el('bk-pending'))
    el('bk-pending').textContent = data.filter((b) => b.status === 'pending').length;
  if (el('bk-revenue')) el('bk-revenue').textContent = '$' + revenue.toLocaleString('en-AU');
  if (el('bk-sub'))
    el('bk-sub').textContent = `${data.length} booking${data.length !== 1 ? 's' : ''} · filtered`;

  if (!data.length) {
    tbody.innerHTML =
      '<tr><td colspan="8"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;gap:10px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><div style="font-size:15px;font-weight:600;color:var(--mgray)">No bookings found</div><div style="font-size:13px;color:var(--mgray);opacity:0.7">Try adjusting your filters</div></div></td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map((b) => {
      const name =
        b.client_name || b.profiles?.full_name || b.profiles?.email?.split('@')[0] || 'Client';
      const date = b.scheduled_date
        ? new Date(b.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
          })
        : '—';
      const st = b.status || 'pending';
      const isPending = st === 'pending';
      const isCancelled = st === 'cancelled' || st === 'completed';
      return `<tr>
      <td data-label="Date">${date}</td>
      <td data-label="Client"><b>${esc(name)}</b></td>
      <td data-label="Service">${esc(b.service_name || '—')}</td>
      <td data-label="Suburb">${esc(b.suburb || '—')}</td>
      <td data-label="Van"><span class="mech-tag v${b.van_number || 1}">Van ${b.van_number || 1}</span></td>
      <td data-label="Status"><span class="status ${stClass[st] || 'pending'}"><span class="status-dot"></span>${st.charAt(0).toUpperCase() + st.slice(1)}</span></td>
      <td data-label="Price"><b>${anBookingRevenue(b)}</b></td>
      <td data-label="Actions" style="white-space:nowrap">
        ${isPending ? `<button data-bk-action="confirm" data-id="${b.id}" style="background:var(--green-lt);color:var(--green);border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-right:4px">Confirm</button>` : ''}
        ${!isCancelled ? `<button data-bk-action="chat" data-id="${b.id}" data-name="${esc(name)}" style="background:#F5F0FF;color:var(--purple);border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-right:4px">Chat</button>` : ''}
        ${b.tracking_token ? `<button data-bk-action="track" data-token="${b.tracking_token}" style="background:#EFF6FF;color:var(--blue);border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-right:4px" title="Copy tracking link">Track</button>` : ''}
        ${!isCancelled ? `<button data-bk-action="cancel" data-id="${b.id}" style="background:#FEF2F2;color:var(--red);border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Cancel</button>` : ''}
      </td>
    </tr>`;
    })
    .join('');

  // #bk-tbody survives every re-render, so an unguarded bind stacked one
  // listener per render. On a table refreshed 3 times, one click on Cancel
  // opened the cancel flow 3 times - the worst instance of this bug in the
  // app, since it acts on a real booking.
  if (!tbody.dataset.clickBound) {
    tbody.dataset.clickBound = '1';
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bk-action]');
      if (!btn) return;
      const action = btn.dataset.bkAction;
      if (action === 'confirm') confirmBookingAdmin(btn.dataset.id);
      else if (action === 'chat') openAdminChat(btn.dataset.id, btn.dataset.name);
      else if (action === 'track') copyTrackLink(btn.dataset.token);
      else if (action === 'cancel') openCancel(btn.dataset.id);
    });
  }
}

function copyTrackLink(token) {
  const url = 'https://drbikesydney.com.au/track.html?token=' + token;
  navigator.clipboard
    .writeText(url)
    .then(() => showToast('🔗 Tracking link copied!'))
    .catch(() => prompt('Copy this link:', url));
}

async function confirmBookingAdmin(id) {
  await sb.from('bookings').update({ status: 'confirmed' }).eq('id', id);
  const b = allBookings.find((x) => x.id === id);
  if (b) b.status = 'confirmed';
  applyBookingFilters();
  showToast('✅ Booking confirmed');
}

function openCancel(id) {
  document.getElementById('cancel-booking-id').value = id;
  document.getElementById('cancel-notes').value = '';
  document.getElementById('cancel-modal').style.display = 'flex';
}

async function confirmCancel() {
  const id = document.getElementById('cancel-booking-id').value;
  const reason = document.getElementById('cancel-reason').value;
  const notes = document.getElementById('cancel-notes').value;
  const fullReason = [reason, notes].filter(Boolean).join(' — ');
  const { data: upd, error: cErr } = await sb
    .from('bookings')
    .update({ status: 'cancelled', cancellation_reason: fullReason })
    .eq('id', id)
    .select();
  if (cErr || !upd || !upd.length) {
    showToast(
      'Could not cancel: ' + (cErr?.message || 'no permission / run add-cancellation-reason.sql')
    );
    return;
  }
  const b = allBookings.find((x) => x.id === id);
  if (b) {
    b.status = 'cancelled';
    b.cancellation_reason = fullReason;
  }
  document.getElementById('cancel-modal').style.display = 'none';
  applyBookingFilters();
  showToast('Booking cancelled');

  if (upd[0]?.google_event_id) {
    const { data: sess } = await sb.auth.getSession();
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'admin-delete-calendar-event',
        access_token: sess?.session?.access_token,
        event_id: upd[0].google_event_id,
      }),
    }).catch(() => {});
  }
}

function openReassign(id) {
  document.getElementById('reassign-booking-id').value = id;
  document.getElementById('reassign-modal').style.display = 'flex';
}

async function doReassign(vanNum) {
  const id = document.getElementById('reassign-booking-id').value;
  await sb.from('bookings').update({ van_number: vanNum }).eq('id', id);
  const b = allBookings.find((x) => x.id === id);
  if (b) b.van_number = vanNum;
  document.getElementById('reassign-modal').style.display = 'none';
  applyBookingFilters();
  showToast(`Reassigned to Van ${vanNum} ✓`);
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
let unreadCount = 0;
let notifPanelOpen = false;

function toggleNotifPanel() {
  notifPanelOpen = !notifPanelOpen;
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.style.display = notifPanelOpen ? 'block' : 'none';
  if (notifPanelOpen) {
    unreadCount = 0;
    updateNotifBadge();
    loadRecentNotifications();
  }
}

document.addEventListener('click', (e) => {
  if (
    !document.getElementById('notif-btn')?.contains(e.target) &&
    !document.getElementById('notif-panel')?.contains(e.target)
  ) {
    const panel = document.getElementById('notif-panel');
    if (panel) panel.style.display = 'none';
    notifPanelOpen = false;
  }
});

function updateNotifBadge() {
  const dot = document.getElementById('notif-dot');
  const cnt = document.getElementById('notif-count');
  if (dot) dot.style.display = unreadCount > 0 ? 'block' : 'none';
  if (cnt) {
    cnt.style.display = unreadCount > 0 ? 'block' : 'none';
    cnt.textContent = unreadCount > 9 ? '9+' : unreadCount;
  }
  const sb2 = document.querySelector('#sidebar .sb-badge');
  if (sb2) {
    sb2.textContent = unreadCount > 0 ? unreadCount : '';
    sb2.style.display = unreadCount > 0 ? '' : 'none';
  }
}

async function loadRecentNotifications() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from('bookings')
    .select('*, profiles(full_name,email)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!data?.length) {
    list.innerHTML =
      '<div style="padding:20px;text-align:center;color:var(--mgray);font-size:13px">No new bookings in the last 24h</div>';
    return;
  }
  const stColors = {
    pending: 'var(--amber)',
    confirmed: 'var(--green)',
    enroute: 'var(--blue)',
    completed: '#475569',
    cancelled: 'var(--red)',
  };
  list.innerHTML = data
    .map((b) => {
      const name =
        b.client_name || b.profiles?.full_name || b.profiles?.email?.split('@')[0] || 'Client';
      const time = new Date(b.created_at).toLocaleTimeString('en-AU', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const st = b.status || 'pending';
      return `<div style="padding:10px 12px;border-radius:8px;margin-bottom:4px;background:var(--off);cursor:pointer" data-page="bookings">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <div style="font-size:13px;font-weight:600;color:var(--navy)">${esc(name)}</div>
        <span style="font-size:11px;color:#fff;background:${stColors[st] || '#475569'};padding:2px 7px;border-radius:10px;font-weight:600">${st}</span>
      </div>
      <div style="font-size:13px;color:var(--mgray)">${esc(b.service_name || 'Service')} · ${esc(b.suburb || '—')}</div>
      <div style="font-size:11px;color:var(--mgray);margin-top:2px">${time} · ${anBookingRevenue(b)}</div>
    </div>`;
    })
    .join('');
}

function prependNotification(b) {
  const list = document.getElementById('notif-list');
  if (!list) return;
  const time = new Date(b.created_at || Date.now()).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const div = document.createElement('div');
  div.style.cssText =
    'padding:10px 12px;border-radius:8px;margin-bottom:4px;background:var(--blue-tint);border-left:3px solid var(--blue);animation:fadeSlideIn .3s';
  div.innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--navy)">🔔 New booking</div>
    <div style="font-size:13px;color:var(--mgray)">${b.service_name || 'Service'} · ${esc(b.suburb || '—')}</div>
    <div style="font-size:11px;color:var(--mgray);margin-top:2px">${time} · ${anBookingRevenue(b)}</div>`;
  list.prepend(div);
}

function markAllRead() {
  unreadCount = 0;
  updateNotifBadge();
}

function subscribeToBookings() {
  sb.channel('admin-bookings-notifs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, (payload) => {
      allBookings.unshift(payload.new);
      unreadCount++;
      updateNotifBadge();
      prependNotification(payload.new);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, (payload) => {
      const idx = allBookings.findIndex((b) => b.id === payload.new.id);
      if (idx >= 0) allBookings[idx] = { ...allBookings[idx], ...payload.new };
    })
    .subscribe();
}

// ── MECHANIC STATS ────────────────────────────────────────────────────────────
async function loadMechStats(vanNum) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data } = await sb
    .from('bookings')
    .select('service_price,callout_fee,client_rating,completed_at,scheduled_date,status')
    .eq('van_number', vanNum)
    .eq('status', 'completed')
    .gte('scheduled_date', weekAgo);
  return data || [];
}

// ── Daily route optimisation ────────────────────────────────────────────────
// Static Sydney suburb coordinates (CSP-safe, no geocoding API).
const SUBURB_COORDS = {
  sydney: [-33.8688, 151.2093],
  cbd: [-33.8688, 151.2093],
  haymarket: [-33.88, 151.205],
  'surry hills': [-33.886, 151.211],
  darlinghurst: [-33.879, 151.222],
  paddington: [-33.8847, 151.227],
  woollahra: [-33.887, 151.24],
  bondi: [-33.8915, 151.2767],
  'bondi junction': [-33.8932, 151.247],
  'bondi beach': [-33.8908, 151.2743],
  coogee: [-33.919, 151.256],
  randwick: [-33.914, 151.241],
  maroubra: [-33.95, 151.237],
  newtown: [-33.8983, 151.179],
  erskineville: [-33.901, 151.186],
  marrickville: [-33.911, 151.155],
  enmore: [-33.9, 151.17],
  'st peters': [-33.91, 151.179],
  alexandria: [-33.902, 151.194],
  redfern: [-33.893, 151.204],
  glebe: [-33.879, 151.186],
  annandale: [-33.88, 151.169],
  leichhardt: [-33.884, 151.157],
  balmain: [-33.858, 151.179],
  rozelle: [-33.862, 151.171],
  lilyfield: [-33.87, 151.164],
  ashfield: [-33.889, 151.125],
  'summer hill': [-33.892, 151.139],
  'dulwich hill': [-33.905, 151.138],
  petersham: [-33.894, 151.154],
  camperdown: [-33.89, 151.177],
  ultimo: [-33.881, 151.198],
  pyrmont: [-33.869, 151.195],
  chippendale: [-33.887, 151.199],
  waterloo: [-33.902, 151.208],
  zetland: [-33.907, 151.208],
  mascot: [-33.93, 151.194],
  rosebery: [-33.918, 151.203],
  manly: [-33.7969, 151.287],
  mosman: [-33.829, 151.241],
  cremorne: [-33.829, 151.227],
  'neutral bay': [-33.835, 151.218],
  'north sydney': [-33.84, 151.207],
  chatswood: [-33.797, 151.18],
  'lane cove': [-33.814, 151.17],
  'crows nest': [-33.826, 151.201],
  'st leonards': [-33.823, 151.194],
  'dee why': [-33.751, 151.286],
  brookvale: [-33.765, 151.271],
  freshwater: [-33.779, 151.287],
  parramatta: [-33.815, 151.0],
  drummoyne: [-33.852, 151.154],
  'five dock': [-33.868, 151.129],
  concord: [-33.854, 151.103],
  hurstville: [-33.967, 151.102],
  kogarah: [-33.963, 151.133],
  rockdale: [-33.952, 151.138],
  cronulla: [-34.058, 151.153],
  miranda: [-34.035, 151.1],
  sutherland: [-34.031, 151.057],
};

let _routeMap = null,
  _routeLayer = null,
  _routeOptimised = false;
let _routeBookingsCache = null;

// Guessing the suburb out of free text.
//
// The original loop walked SUBURB_COORDS in key order and returned the first
// name found anywhere in the address string. `sydney` is the first key, so
// every address that ends in the city name - which in Australia is most of
// them - resolved to the CBD:
//
//   "The Palladium 102 Miller Street, Pyrmont, Sydney"  ->  CBD
//   "5 Hall St, Bondi Beach, Sydney"                    ->  CBD
//
// The heatmap piled those jobs onto George St and optimiseRoute() planned the
// day around a van that was never going there. `north sydney` and
// `bondi beach` lost the same way, swallowed by `sydney` and `bondi`.
//
// Three rules decide between the names that do match, in this order:
//
//   1. `sydney`/`cbd` lose to anything else. They name the fallback, not a
//      suburb, so they only win when nothing more specific matched.
//   2. The match closest to the END of the text wins. An Australian address
//      reads street -> suburb -> city, so a suburb name appearing early is a
//      STREET named after a suburb, not the destination. Ranking by name
//      length instead (the first version of this fix) sent
//      "123 Parramatta Rd, Ashfield" to Parramatta, 25 km from the job.
//   3. Same starting position: the longer name wins, so `bondi beach` and
//      `north sydney` beat the `bondi`/`sydney` sitting inside them.
const CITY_WIDE = new Set(['sydney', 'cbd']);
const SUBURB_MATCHERS = Object.keys(SUBURB_COORDS).map((name) => ({
  name,
  cityWide: CITY_WIDE.has(name),
  // Word boundaries, because includes() also matched inside a word: `cbd`
  // hit "cbdoil", and any street whose name happens to contain a suburb
  // would have counted as being in it.
  re: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
}));

function suburbFromText(text) {
  const t = (text || '').toLowerCase();
  if (!t) return null;
  let best = null;
  for (const { name, cityWide, re } of SUBURB_MATCHERS) {
    const hit = re.exec(t);
    if (!hit) continue;
    const cand = { name, cityWide, at: hit.index, len: name.length };
    if (!best) {
      best = cand;
    } else if (best.cityWide !== cand.cityWide) {
      if (best.cityWide) best = cand;
    } else if (cand.at > best.at || (cand.at === best.at && cand.len > best.len)) {
      best = cand;
    }
  }
  return best ? SUBURB_COORDS[best.name] : null;
}

function suburbCoord(b) {
  const key = (b.suburb || '').trim().toLowerCase();
  if (SUBURB_COORDS[key]) return SUBURB_COORDS[key];
  // The suburb field gets scanned too, not only the address: a value like
  // "Sydney CBD" or "Bondi Beach NSW 2026" is not a key in the table and used
  // to fall straight through as if the field had been left empty.
  return suburbFromText(b.suburb) || suburbFromText(b.address);
}

function routeDistKm(a, b) {
  const R = 6371,
    toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]),
    dLng = toRad(b[1] - a[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Nearest-neighbour ordering from the Sydney CBD depot.
function optimiseRoute(stops) {
  const depot = SUBURB_COORDS['sydney'];
  const remaining = stops.slice();
  const ordered = [];
  let cur = depot;
  while (remaining.length) {
    let bestI = 0,
      bestD = Infinity;
    remaining.forEach((s, i) => {
      const d = routeDistKm(cur, s.coord);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    const next = remaining.splice(bestI, 1)[0];
    ordered.push(next);
    cur = next.coord;
  }
  return ordered;
}

function toggleRouteMode() {
  _routeOptimised = !_routeOptimised;
  const btn = document.getElementById('route-mode-btn');
  if (btn) {
    btn.textContent = _routeOptimised ? 'Order by time' : 'Optimise by distance';
    btn.style.background = _routeOptimised ? 'var(--blue)' : 'var(--white)';
    btn.style.color = _routeOptimised ? '#fff' : 'var(--navy)';
  }
  renderRouteMap(true);
}

async function renderRouteMap(useCache) {
  const mapEl = document.getElementById('route-map');
  if (!mapEl || typeof L === 'undefined') return;
  const today = new Date().toISOString().split('T')[0];

  let bookings = _routeBookingsCache;
  if (!useCache || !bookings) {
    const { data } = await sb
      .from('bookings')
      .select('id,client_name,service_name,suburb,address,van_number,scheduled_time,status')
      .eq('scheduled_date', today)
      .in('status', ['pending', 'confirmed', 'enroute', 'en_route', 'in_progress', 'arrived']);
    bookings = data || [];
    _routeBookingsCache = bookings;
  }

  const vanFilter = document.getElementById('route-van')?.value || '';
  let stops = bookings
    .filter((b) => !vanFilter || String(b.van_number) === vanFilter)
    .map((b) => ({ ...b, coord: suburbCoord(b) }))
    .filter((b) => b.coord);

  // Order: by distance (nearest-neighbour) or by scheduled_time
  if (_routeOptimised) stops = optimiseRoute(stops);
  else stops.sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || ''));

  const sub = document.getElementById('route-sub');
  const unmapped = bookings.filter(
    (b) => (!vanFilter || String(b.van_number) === vanFilter) && !suburbCoord(b)
  ).length;
  if (sub)
    sub.textContent = stops.length
      ? `${stops.length} stop${stops.length !== 1 ? 's' : ''} today${unmapped ? ` · ${unmapped} without a known suburb` : ''}${_routeOptimised ? ' · distance-optimised' : ' · by time'}`
      : 'No mapped jobs scheduled today';

  // Init / reset map
  if (!_routeMap) {
    _routeMap = L.map(mapEl, { zoomControl: false, attributionControl: false }).setView(
      [-33.8688, 151.2093],
      12
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(
      _routeMap
    );
  }
  if (_routeLayer) {
    _routeMap.removeLayer(_routeLayer);
    _routeLayer = null;
  }
  _routeLayer = L.layerGroup().addTo(_routeMap);

  const VAN_COLORS = { 1: 'var(--blue)', 2: 'var(--amber)' };
  const latlngs = [];
  stops.forEach((s, i) => {
    const color = VAN_COLORS[s.van_number] || 'var(--blue)';
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${i + 1}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    L.marker(s.coord, { icon })
      .bindPopup(
        `<b>${i + 1}. ${esc(s.client_name || 'Client')}</b><br>${esc(s.service_name || '')}<br>${esc(s.suburb || '')} · ${s.scheduled_time || '—'} · Van ${s.van_number || 1}`
      )
      .addTo(_routeLayer);
    latlngs.push(s.coord);
  });
  if (latlngs.length > 1)
    L.polyline(latlngs, { color: 'var(--blue)', weight: 3, opacity: 0.5, dashArray: '6 6' }).addTo(
      _routeLayer
    );
  if (latlngs.length) _routeMap.fitBounds(L.latLngBounds(latlngs).pad(0.2));
  setTimeout(() => _routeMap && _routeMap.invalidateSize(), 100);

  // Ordered itinerary list
  const list = document.getElementById('route-list');
  if (list) {
    if (!stops.length) {
      list.innerHTML = '';
      return;
    }
    let totalKm = 0;
    let prev = SUBURB_COORDS['sydney'];
    list.innerHTML =
      stops
        .map((s, i) => {
          const leg = routeDistKm(prev, s.coord);
          totalKm += leg;
          prev = s.coord;
          const color = VAN_COLORS[s.van_number] || 'var(--blue)';
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--off);border-radius:8px;border-left:3px solid ${color}">
        <div style="width:24px;height:24px;border-radius:50%;background:${color};color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--navy)">${esc(s.client_name || 'Client')} · ${esc(s.suburb || '—')}</div>
          <div style="font-size:11px;color:var(--mgray)">${esc(s.service_name || '')} · ${s.scheduled_time || '—'} · Van ${s.van_number || 1}</div>
        </div>
        <div style="font-size:11px;color:var(--mgray);white-space:nowrap">${leg.toFixed(1)} km</div>
      </div>`;
        })
        .join('') +
      `<div style="text-align:right;font-size:13px;color:var(--mgray);padding:4px 12px 0;font-weight:600">Total: ${totalKm.toFixed(1)} km</div>`;
  }
}

// ── Analytics: funnel, heatmap, margins, LTV/churn (#20-23) ──────────────────
let _heatMap = null,
  _heatLayer = null;

let _analyticsData = null;

// ── Analytics state ──────────────────────────────────────────────────────────
// The one rule this whole section is written to: a number on screen is either
// measured or it is absent. No zero stands in for "the query failed", no
// average is computed over an empty denominator, and every card that cannot
// answer says which of the two it is - no data yet, or the read broke.
const BOOKINGS_FETCH_CAP = 5000;
let _anRange = 30; // days; 0 = all time
let _anServer = null; // /api/analytics payload (checkout_attempts + PostHog)
const _anTables = {}; // chart id -> { rows, cols, showing }

function anRangeLabel() {
  return _anRange === 0
    ? 'all time'
    : _anRange === 365
      ? 'last 12 months'
      : `last ${_anRange} days`;
}
function anRangeStart() {
  if (_anRange === 0) return null;
  const d = new Date();
  d.setDate(d.getDate() - _anRange);
  d.setHours(0, 0, 0, 0);
  return d;
}
function anInRange(iso, from, to) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (from && t < from.getTime()) return false;
  if (to && t >= to.getTime()) return false;
  return true;
}
function anMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-AU');
}
function anCompact(n) {
  return n >= 1000000
    ? (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
    : n >= 10000
      ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
      : n.toLocaleString('en-AU');
}
// Revenue is recognised when the job is finished, so anything money-shaped is
// dated by completed_at - not by when the booking was created. One helper for
// the KPI tile and the chart both, because two definitions of "revenue this
// month" on one screen is how a dashboard starts lying quietly.
function anCompletedInRange(all, from, to) {
  return all.filter(
    (b) => b.status === 'completed' && anInRange(b.completed_at || b.created_at, from, to)
  );
}
// What the client was actually billed. `bookings` splits the amount across two
// columns - `service_price` and `callout_fee`, the latter set per zone from
// `callout_zones`, so it is NOT always $20 - and summing only the first
// understated every revenue figure on this screen by roughly the call-out on
// every job.
//
// A missing callout_fee is counted as zero, never as an assumed $20: the other
// surfaces fall back to `?? 20` for display, but inventing a fee on a metrics
// screen is exactly the failure this screen is built to avoid. How many rows
// are in that state is reported instead - see anCalloutGaps().
function anBookingRevenue(b) {
  return (Number(b.service_price) || 0) + (Number(b.callout_fee) || 0);
}
function anRevenueOf(rows) {
  return rows.reduce((s, b) => s + anBookingRevenue(b), 0);
}
function anCalloutGaps(rows) {
  return rows.filter((b) => b.callout_fee === null || b.callout_fee === undefined).length;
}

function anState(html, kind) {
  return `<div class="an-state${kind === 'error' ? ' is-error' : ''}">${html}</div>`;
}
function anEmpty(title, detail) {
  return anState(
    `<span class="an-state-icon">&#9675;</span><strong>${esc(title)}</strong>${esc(detail || '')}`
  );
}
function anError(detail) {
  // The 'error' kind is what turns the heading red. Without it a failed query
  // and an empty result render identically apart from the wording, which is
  // the exact confusion this screen exists to prevent.
  return anState(
    `<span class="an-state-icon">&#9888;</span><strong>Could not load this</strong>${esc(detail || '')}`,
    'error'
  );
}

async function loadAnalytics() {
  const errBox = document.getElementById('an-error');
  if (errBox) errBox.style.display = 'none';

  // profiles and bookings are read with the admin's own session (same as every
  // other admin screen). checkout_attempts is not: its RLS policy is
  // `auth.uid() = client_id`, so an admin session reads zero rows however many
  // exist - that one, and PostHog, come back from /api/analytics.
  const [bookingsRes, profilesRes, catalogRes, serverRes] = await Promise.all([
    sb
      .from('bookings')
      .select(
        'id,client_id,client_name,client_email,service_name,service_price,callout_fee,suburb,address,status,scheduled_date,created_at,completed_at,mechanic_accepted_at,time_to_book_seconds,utm_source,utm_medium,utm_campaign,profiles(full_name,email)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .limit(BOOKINGS_FETCH_CAP),
    sb.from('profiles').select('id,created_at', { count: 'exact' }).limit(20000),
    sb.from('services').select('name'),
    fetchAnalyticsServer(),
  ]);

  // The expenses, so the margins table has a cost basis of its own instead of
  // depending on somebody having opened the Finance screen first.
  if (!_expenses) _expenses = await fetchExpenses();

  const failures = [];
  if (bookingsRes.error) failures.push('bookings: ' + bookingsRes.error.message);
  if (profilesRes.error) failures.push('accounts: ' + profilesRes.error.message);
  if (catalogRes.error) failures.push('services: ' + catalogRes.error.message);
  // Hitting the row cap means every total on this screen is a floor, not a
  // count. Silently truncated numbers that still look precise are worse than
  // no numbers, so this says it out loud.
  //
  // Compared against the row count the DATABASE reports, not against the
  // .limit() asked for. Supabase caps a single response at the project's
  // max-rows whatever the client requests, so if that cap is lower than these
  // limits - and nobody on this project knows what it is set to - the old
  // `length >= 20000` test could never be true and the warning could never
  // appear, which is precisely the silence it exists to break.
  const shortBy = (res, asked) => {
    const got = (res.data || []).length;
    if (res.count === null || res.count === undefined) return got >= asked ? got : 0;
    return res.count > got ? res.count : 0;
  };
  const bookingsTotal = shortBy(bookingsRes, BOOKINGS_FETCH_CAP);
  const profilesTotal = shortBy(profilesRes, 20000);
  if (bookingsTotal)
    failures.push(
      `only ${(bookingsRes.data || []).length.toLocaleString('en-AU')} of ${bookingsTotal.toLocaleString('en-AU')} bookings were read - totals below are undercounted`
    );
  if (profilesTotal)
    failures.push(
      `only ${(profilesRes.data || []).length.toLocaleString('en-AU')} of ${profilesTotal.toLocaleString('en-AU')} accounts were read - sign-up totals are undercounted`
    );
  if (failures.length && errBox) {
    errBox.textContent = 'Heads up - ' + failures.join(' · ');
    errBox.style.display = 'block';
  }

  _analyticsData = {
    all: bookingsRes.data || [],
    bookingsError: bookingsRes.error ? bookingsRes.error.message : null,
    profiles: profilesRes.data || [],
    profilesError: profilesRes.error ? profilesRes.error.message : null,
    catalog: catalogRes.data || [],
    catalogError: catalogRes.error ? catalogRes.error.message : null,
    truncated: Boolean(bookingsTotal),
  };
  _anServer = serverRes;

  renderAnalytics();
}

// The single writer of the stored pair. Both tokens move together on purpose:
// an access token kept next to the refresh token that did NOT mint it is the
// state that broke the panel, so a half-write is worse than no write.
function storeAdminSession(session) {
  if (!session?.access_token || !session?.refresh_token) return false;
  localStorage.setItem('drbike-admin-token', session.access_token);
  localStorage.setItem('drbike-admin-refresh', session.refresh_token);
  return true;
}

function clearAdminSession() {
  localStorage.removeItem('drbike-admin-token');
  localStorage.removeItem('drbike-admin-refresh');
}

// The token in localStorage is written once at login and never again, but a
// Supabase access token only lives about an hour. restoreAdminSession() hands
// the refresh token to supabase-js on every page load, which mints a fresh
// access token - and because the client runs with persistSession:false, that
// fresh one stays in memory while localStorage keeps the expired original.
//
// So the panel itself keeps working (its reads use the live session) while any
// server call reading localStorage sends a dead JWT and gets "Invalid session"
// back. That is exactly what the Analytics screen hit in production.
//
// Ask the client for the live session, and write the fresh token back so the
// stored copy stops rotting for every other caller of this key too.
async function adminAccessToken() {
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (session?.access_token) {
      storeAdminSession(session);
      return session.access_token;
    }
  } catch (e) {
    console.warn('[admin] could not read the live session:', e.message);
  }
  return localStorage.getItem('drbike-admin-token') || '';
}

async function fetchAnalyticsServer() {
  try {
    const token = await adminAccessToken();
    if (!token) return { error: 'Your admin session has expired - reload the page and sign in.' };
    const r = await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, days: _anRange === 0 ? 730 : _anRange }),
    });
    const json = await r.json().catch(() => ({}));
    // 401 back from the server means the session died between reading it and
    // sending it. "Invalid session" is true but says nothing Diego can act on.
    if (r.status === 401)
      return { error: 'Your admin session has expired - reload the page and sign in again.' };
    if (!r.ok) return { error: json.error || `HTTP ${r.status}` };
    return json;
  } catch (e) {
    return { error: e.message };
  }
}

// Everything below re-renders from the cached rows, so changing the range is
// instant and never re-queries Supabase. Only the traffic half depends on the
// server, and only that half is re-fetched.
function renderAnalytics() {
  const d = _analyticsData;
  if (!d) return;
  const from = anRangeStart();
  const all = d.all;
  const inRange = from ? all.filter((b) => anInRange(b.created_at, from, null)) : all;

  renderAnalyticsKPIs(d, inRange, from);
  renderFunnel(d, from);
  renderBookingStatus(inRange, d);
  renderRevenueChart(d, from);
  renderSignupsChart(d, from);
  // Completed-in-range, the same basis as Revenue. Filtering these by creation
  // date instead would mean "Services sold" and "Revenue" summed two different
  // sets of jobs under the same range label, and the services would not add up
  // to the money.
  renderServicePopularity(anCompletedInRange(all, from, null), d.catalog, d);
  renderSuburbs(inRange, d);
  renderSources(inRange, d);
  renderCheckoutCard();
  renderTrafficCard();

  // Lifetime by design - their subtitles say so.
  const plotted = renderHeatmap(all);
  renderMargins(all);
  renderLTV(all);
  renderTargetMetrics(all);

  const sub = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  sub('an-revenue-sub', 'Completed bookings · ' + anRangeLabel());
  sub('an-signups-sub', 'Sign-ups · ' + anRangeLabel());
  sub('an-popularity-sub', 'Jobs completed per service · ' + anRangeLabel());
  sub('an-suburbs-sub', 'Bookings created · ' + anRangeLabel());
  sub('an-sources-sub', 'Bookings created · ' + anRangeLabel());
  sub(
    'an-heatmap-sub',
    plotted === null
      ? 'The map library did not load - reload the page to try again'
      : plotted === 0
        ? 'No bookings with a recognised suburb yet - the map has nothing to plot'
        : 'Booking volume by suburb · lifetime, not filtered by the range above'
  );

  // A card that fell back to an empty state has no chart to swap, so its
  // toggle must not still offer "Chart".
  document.querySelectorAll('#page-analytics [data-an-table]').forEach((btn) => {
    const t = _anTables[btn.dataset.anTable];
    const live = document.getElementById(btn.dataset.anTable);
    const hasChart = live && (live.querySelector('svg') || live.querySelector('table'));
    btn.style.display = hasChart ? '' : 'none';
    btn.textContent = t && t.showing ? 'Chart' : 'Table';
  });
}

// ── KPI row ──────────────────────────────────────────────────────────────────
// Deltas compare against the immediately preceding window of the same length.
// "All time" has no preceding window, so it shows no delta rather than a
// made-up one, and a previous window of zero reads as "first data" instead of
// a +infinity percentage.
function renderAnalyticsKPIs(d, inRange, from) {
  const el = document.getElementById('an-kpis');
  if (!el) return;

  if (d.bookingsError && d.profilesError) {
    el.innerHTML = `<div style="grid-column:1/-1">${anError(d.bookingsError)}</div>`;
    return;
  }

  // The current window runs from midnight N days ago to *now*, so it is N days
  // plus however much of today has elapsed. Stepping the comparison back by a
  // whole N days would measure the current period against a strictly shorter
  // one and quietly inflate every delta by up to a day's trading. The previous
  // window is therefore the same elapsed duration, not the same day count.
  let prevFrom = null;
  if (from) {
    const spanMs = Date.now() - from.getTime();
    prevFrom = new Date(from.getTime() - spanMs);
  }
  const prevBookings = prevFrom ? d.all.filter((b) => anInRange(b.created_at, prevFrom, from)) : [];
  const prevProfiles = prevFrom
    ? d.profiles.filter((p) => anInRange(p.created_at, prevFrom, from))
    : [];

  const signups = from ? d.profiles.filter((p) => anInRange(p.created_at, from, null)) : d.profiles;
  const completed = anCompletedInRange(d.all, from, null);
  const prevCompleted = prevFrom ? anCompletedInRange(d.all, prevFrom, from) : [];
  const revenue = anRevenueOf(completed);
  const prevRevenue = anRevenueOf(prevCompleted);

  const tiles = [
    {
      label: 'New accounts',
      value: d.profilesError ? null : anCompact(signups.length),
      now: signups.length,
      prev: prevProfiles.length,
      error: d.profilesError,
    },
    {
      label: 'Bookings',
      value: d.bookingsError ? null : anCompact(inRange.length),
      now: inRange.length,
      prev: prevBookings.length,
      error: d.bookingsError,
    },
    {
      // Counted by when the job was finished, which is a different cohort from
      // "Bookings" above (counted by when it was made). Deliberately not
      // divided by it - that ratio would compare two different sets of jobs.
      label: 'Jobs completed',
      value: d.bookingsError ? null : anCompact(completed.length),
      now: completed.length,
      prev: prevCompleted.length,
      error: d.bookingsError,
      note: 'finished in this period',
    },
    {
      label: 'Revenue',
      value: d.bookingsError ? null : anMoney(revenue),
      now: revenue,
      prev: prevRevenue,
      error: d.bookingsError,
    },
    {
      label: 'Avg ticket',
      // The one number most likely to become a lie: an average needs a
      // non-zero denominator, so with no completed job it stays blank.
      value: d.bookingsError ? null : completed.length ? anMoney(revenue / completed.length) : null,
      empty: 'No completed jobs',
      note: completed.length
        ? `across ${completed.length} completed job${completed.length === 1 ? '' : 's'}`
        : 'nothing to average yet',
      error: d.bookingsError,
      skipDelta: true,
    },
  ];

  el.innerHTML = tiles
    .map((t) => {
      let body;
      if (t.error) {
        body = `<div class="an-tile-value is-empty">Unavailable</div><div class="an-tile-note">${esc(t.error)}</div>`;
      } else if (t.value === null || t.value === undefined) {
        body = `<div class="an-tile-value is-empty">${esc(t.empty || 'No data')}</div>${t.note ? `<div class="an-tile-note">${esc(t.note)}</div>` : ''}`;
      } else {
        body = `<div class="an-tile-value">${esc(t.value)}</div>${anDelta(t)}${t.note ? `<div class="an-tile-note">${esc(t.note)}</div>` : ''}`;
      }
      return `<div class="an-tile"><div class="an-tile-label">${esc(t.label)}</div>${body}</div>`;
    })
    .join('');
}

function anDelta(t) {
  if (t.skipDelta || _anRange === 0)
    return `<div class="an-tile-delta flat">${_anRange === 0 ? 'all time' : ''}</div>`;
  if (!t.prev) {
    return `<div class="an-tile-delta flat">${t.now ? 'no prior period to compare' : ''}</div>`;
  }
  const pct = Math.round(((t.now - t.prev) / t.prev) * 100);
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const arrow = pct > 0 ? '&#9650;' : pct < 0 ? '&#9660;' : '&#8212;';
  // "previous period", not "previous N days" - the window is N days plus the
  // part of today that has happened, and the comparison matches that exactly.
  return `<div class="an-tile-delta ${dir}">${arrow} ${Math.abs(pct)}% vs previous period</div>`;
}

// Diego's KPI scorecard: the 3 targets that had no measurement anywhere before
// (booking-flow completion time, mechanic response time, 6-month retention).
// Each shows "No data yet" instead of a misleading 0/0% until real bookings
// carry the new columns (time_to_book_seconds, mechanic_accepted_at) or the
// business has enough history for the 6-month cohort to be non-empty.
function renderTargetMetrics(all) {
  const el = document.getElementById('an-targets');
  if (!el) return;

  // 1. Avg time to book (target: < 60s)
  const withTiming = all.filter((b) => Number.isFinite(b.time_to_book_seconds));
  const avgBookSec = withTiming.length
    ? Math.round(withTiming.reduce((s, b) => s + b.time_to_book_seconds, 0) / withTiming.length)
    : null;
  const bookLabel =
    avgBookSec === null
      ? 'No data yet'
      : avgBookSec < 60
        ? `${avgBookSec}s`
        : `${Math.floor(avgBookSec / 60)}m ${avgBookSec % 60}s`;
  const bookOk = avgBookSec !== null && avgBookSec < 60;

  // 2. Avg mechanic response time (target: < 5 min) - time from booking
  // creation to a mechanic accepting it.
  const withResponse = all.filter((b) => b.created_at && b.mechanic_accepted_at);
  const avgResponseMin = withResponse.length
    ? Math.round(
        withResponse.reduce(
          (s, b) => s + (new Date(b.mechanic_accepted_at) - new Date(b.created_at)) / 60000,
          0
        ) / withResponse.length
      )
    : null;
  const responseLabel = avgResponseMin === null ? 'No data yet' : `${avgResponseMin} min`;
  const responseOk = avgResponseMin !== null && avgResponseMin < 5;

  // 3. 6-month retention: of clients with a completed booking 6-12 months ago
  // (old enough to have had a full 6-month window to come back), what % have
  // another completed booking in the last 6 months? No schema change needed -
  // computed entirely from data already fetched for the rest of this page.
  const completed = all.filter((b) => b.status === 'completed' && b.scheduled_date);
  const now = new Date();
  const sixMoAgo = new Date(now);
  sixMoAgo.setMonth(sixMoAgo.getMonth() - 6);
  const twelveMoAgo = new Date(now);
  twelveMoAgo.setMonth(twelveMoAgo.getMonth() - 12);
  const clientKey = (b) => b.client_id || b.client_email || b.profiles?.email;
  const cohort = new Set();
  completed.forEach((b) => {
    const d = new Date(b.scheduled_date + 'T00:00:00');
    if (d >= twelveMoAgo && d < sixMoAgo) cohort.add(clientKey(b));
  });
  const returned = new Set();
  completed.forEach((b) => {
    const key = clientKey(b);
    if (!cohort.has(key)) return;
    const d = new Date(b.scheduled_date + 'T00:00:00');
    if (d >= sixMoAgo) returned.add(key);
  });
  const retention = cohort.size ? Math.round((returned.size / cohort.size) * 100) : null;
  const retentionLabel = retention === null ? 'No data yet' : `${retention}%`;
  const retentionOk = retention !== null && retention >= 40;

  // An average of one measurement is not an average. Naming the sample size
  // stops a single slow booking from reading as a standing problem - which is
  // exactly how "6m 52s, target < 60s" looked in red on the first real run,
  // off one booking.
  const n = (count) => (count ? ` · from ${count} booking${count === 1 ? '' : 's'}` : '');
  const cards = [
    ['Avg time to book', bookLabel, 'Target: < 60s' + n(withTiming.length), bookOk],
    [
      'Mechanic response time',
      responseLabel,
      'Target: < 5 min' + n(withResponse.length),
      responseOk,
    ],
    [
      '6-month retention',
      retentionLabel,
      'Target: > 40%' + (cohort.size ? ` · from ${cohort.size} customers` : ''),
      retentionOk,
    ],
  ];
  el.innerHTML = cards
    .map(([label, val, target, ok]) => {
      const color = val === 'No data yet' ? 'var(--mgray)' : ok ? 'var(--green)' : 'var(--red)';
      return `<div style="background:var(--off);border-radius:10px;padding:14px 16px">
        <div style="font-size:11px;color:var(--mgray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${label}</div>
        <div style="font-size:24px;font-weight:800;color:${color}">${val}</div>
        <div style="font-size:11px;color:var(--mgray);margin-top:2px">${target}</div>
      </div>`;
    })
    .join('');
}

// Exports every Analytics section into one CSV - conversion funnel, service
// popularity, suburb breakdown, margins, and client LTV, each as its own
// section so it opens cleanly in Excel/Sheets.
function exportAnalyticsCSV() {
  if (!_analyticsData) {
    showToast('Analytics still loading - try again in a moment');
    return;
  }
  const { all, catalog } = _analyticsData;
  const completed = all.filter((b) => b.status === 'completed');
  const rows = [];

  rows.push(['DR. BIKE SYDNEY - ANALYTICS EXPORT']);
  rows.push(['Generated', new Date().toISOString().slice(0, 10)]);
  // The screen has a date filter; this file does not. Say so, or the numbers
  // read as if they matched what was on screen when the button was pressed.
  rows.push(['Scope', 'Lifetime - NOT the date range selected on screen']);
  rows.push(['Revenue basis', 'service_price + callout_fee, on completed bookings only']);
  const gaps = anCalloutGaps(all.filter((b) => b.status === 'completed'));
  if (gaps)
    rows.push([
      'Warning',
      `${gaps} completed booking(s) have no callout_fee recorded and are counted at their service price only`,
    ]);
  if (_analyticsData.truncated)
    rows.push([
      'Warning',
      `only the ${BOOKINGS_FETCH_CAP} most recent bookings were read - totals are undercounted`,
    ]);
  rows.push([]);

  rows.push(['CONVERSION FUNNEL']);
  rows.push(['Stage', 'Count']);
  rows.push(['Bookings created', all.length]);
  rows.push([
    'Confirmed / assigned',
    all.filter((b) =>
      ['confirmed', 'enroute', 'en_route', 'in_progress', 'arrived', 'completed'].includes(b.status)
    ).length,
  ]);
  rows.push(['Completed', completed.length]);
  rows.push(['Cancelled', all.filter((b) => b.status === 'cancelled').length]);
  rows.push([]);

  rows.push(['SERVICE POPULARITY (most to least requested)']);
  rows.push(['Service', 'Completed jobs']);
  const popCounts = {};
  catalog.forEach((s) => {
    popCounts[s.name] = 0;
  });
  completed.forEach((b) => {
    const n = b.service_name || 'Other';
    popCounts[n] = (popCounts[n] || 0) + 1;
  });
  Object.entries(popCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, n]) => rows.push([name, n]));
  rows.push([]);

  rows.push(['BOOKINGS BY SUBURB']);
  rows.push(['Suburb', 'Bookings', 'Revenue']);
  const bySuburb = {};
  completed.forEach((b) => {
    const key = (b.suburb || 'Unknown').trim();
    if (!bySuburb[key]) bySuburb[key] = { n: 0, rev: 0 };
    bySuburb[key].n++;
    bySuburb[key].rev += anBookingRevenue(b);
  });
  Object.entries(bySuburb)
    .sort((a, b) => b[1].n - a[1].n)
    .forEach(([name, d]) => rows.push([name, d.n, d.rev]));
  rows.push([]);

  rows.push(['MARGINS PER SERVICE']);
  rows.push(['Service', 'Jobs', 'Revenue', 'Avg ticket', 'Est. cost', 'Margin %']);
  const csvParts = analyticsPartsPerJob(completed);
  if (!csvParts.available)
    rows.push(['(no parts expenses recorded - est. cost and margin cannot be worked out)']);
  const byService = {};
  completed.forEach((b) => {
    const name = b.service_name || 'Other';
    if (!byService[name]) byService[name] = { jobs: 0, rev: 0 };
    byService[name].jobs++;
    byService[name].rev += anBookingRevenue(b);
  });
  Object.entries(byService)
    .sort((a, b) => b[1].rev - a[1].rev)
    .forEach(([name, d]) => {
      const avg = Math.round(d.rev / d.jobs);
      const net = d.rev - Math.round(d.rev / 11);
      // The same basis as the table on screen. This used to read the variable
      // only the Finance screen filled in, so the export could leave with 100%
      // on everything, or with one month's ratio applied to all of history.
      const cost = csvParts.available ? Math.round(d.jobs * csvParts.perJob) : null;
      const margin = cost === null ? '' : net > 0 ? Math.round(((net - cost) / net) * 100) : 0;
      rows.push([name, d.jobs, d.rev, avg, cost === null ? 'no data' : cost, margin]);
    });
  rows.push([]);

  rows.push(['CLIENT LIFETIME VALUE']);
  rows.push(['Client', 'Jobs', 'LTV', 'Last service']);
  const byClient = {};
  completed.forEach((b) => {
    const key = b.client_id || b.client_email || b.profiles?.email || b.client_name || 'unknown';
    if (!byClient[key])
      byClient[key] = {
        name: b.client_name || b.profiles?.full_name || b.profiles?.email || 'Client',
        jobs: 0,
        ltv: 0,
        last: '',
      };
    byClient[key].jobs++;
    byClient[key].ltv += anBookingRevenue(b);
    if (!byClient[key].last || b.scheduled_date > byClient[key].last)
      byClient[key].last = b.scheduled_date;
  });
  Object.values(byClient)
    .sort((a, b) => b.ltv - a.ltv)
    .forEach((c) => rows.push([c.name, c.jobs, c.ltv, c.last]));

  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `DrBike_Analytics_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ── Horizontal bar list ──────────────────────────────────────────────────────
// One series, so one colour for every bar (a darker-where-bigger ramp would
// just re-encode the bar length and spend the only free channel). Every row
// carries its value as visible text, which is also what makes a separate
// table view unnecessary here.
function anBarList(rows, opts = {}) {
  const fmt = opts.format || ((n) => n.toLocaleString('en-AU'));
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows
    .map((r) => {
      const pct = (r.value / max) * 100;
      const cls = r.value === 0 ? 'is-zero' : r.ctx ? 'is-ctx' : '';
      return `<div class="an-bar-row">
        <div class="an-bar-name" title="${esc(r.name)}">${esc(r.name)}</div>
        <div class="an-bar-track"><div class="an-bar-fill ${cls}" style="width:${r.value === 0 ? 0 : Math.max(pct, 1.5)}%"></div></div>
        <div class="an-bar-val">${fmt(r.value)}${r.sub ? ` <small>${esc(r.sub)}</small>` : ''}</div>
      </div>`;
    })
    .join('');
}

// ── Column chart (SVG, no library - the CSP allows no chart CDN) ─────────────
// Specs from the dataviz skill: columns capped at 24px with a 2px surface gap,
// 4px rounded cap and a square foot on the baseline, solid hairline gridlines,
// no number on every column (only the peak is labelled), tooltip on hover.
function anColumnChart(id, points, opts = {}) {
  const fmt = opts.format || ((n) => n.toLocaleString('en-AU'));
  const W = 700;
  const H = 210;
  const padL = 46;
  const padR = 8;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxVal = Math.max(...points.map((p) => p.value), 0);
  // Pick a clean tick *step* and let the top of the scale follow, rather than
  // rounding the max and slicing it in four - that is what produces axis
  // labels like $63 and $188.
  const ticks = anTicks(maxVal, opts.integer);
  const niceMax = ticks[ticks.length - 1];
  const y = (v) => padT + plotH - (niceMax ? (v / niceMax) * plotH : 0);
  const band = plotW / points.length;
  const barW = Math.max(2, Math.min(24, band - 2)); // the 2px surface gap
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);

  const grid = ticks
    .map(
      (t) =>
        `<line class="an-gridline" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"></line>` +
        `<text class="an-tick" x="${padL - 8}" y="${y(t) + 3.5}" text-anchor="end">${esc(opts.tickFormat ? opts.tickFormat(t) : anCompact(t))}</text>`
    )
    .join('');

  // Label every Nth column so the axis never turns into a smear.
  const step = Math.ceil(points.length / 8);
  const cols = points
    .map((p, i) => {
      const x = padL + i * band + (band - barW) / 2;
      const top = y(p.value);
      const h = padT + plotH - top;
      const r = Math.min(4, barW / 2, h);
      const path =
        h <= 0
          ? ''
          : `<path class="an-col" d="M${x},${padT + plotH} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${padT + plotH} Z"></path>`;
      const tick =
        i % step === 0
          ? `<text class="an-tick" x="${padL + i * band + band / 2}" y="${H - 10}" text-anchor="middle">${esc(p.label)}</text>`
          : '';
      const peakLabel =
        i === peak && p.value > 0
          ? `<text class="an-tick" x="${padL + i * band + band / 2}" y="${top - 5}" text-anchor="middle" style="font-weight:700">${esc(fmt(p.value))}</text>`
          : '';
      return `<g class="an-colgroup" data-tip="${esc(p.full || p.label)}: ${esc(fmt(p.value))}">
        <rect class="an-hit" x="${padL + i * band}" y="${padT}" width="${band}" height="${plotH}"></rect>
        ${path}${peakLabel}</g>${tick}`;
    })
    .join('');

  _anTables[id] = {
    cols: [opts.xLabel || 'Period', opts.yLabel || 'Value'],
    rows: points.map((p) => [p.full || p.label, fmt(p.value)]),
    showing: _anTables[id] ? _anTables[id].showing : false,
  };

  if (_anTables[id].showing) return anTableView(id);

  return `<svg class="an-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria || 'Column chart')}">
    ${grid}
    <line class="an-baseline" x1="${padL}" x2="${W - padR}" y1="${padT + plotH}" y2="${padT + plotH}"></line>
    ${cols}
  </svg>`;
}

function anTableView(id) {
  const t = _anTables[id];
  if (!t) return '';
  return `<div class="an-tablewrap"><table><thead><tr>${t.cols
    .map((c) => `<th>${esc(c)}</th>`)
    .join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

// Ticks a person would write by hand: 0 / 50 / 100 / 150 / 200, never
// 0 / 63 / 125 / 188. Aims for 4-5 gridlines.
function anTicks(max, integer) {
  if (!max || max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  // People and jobs come in whole units - a "1.5 accounts" gridline is noise.
  if (integer) step = Math.max(1, Math.round(step));
  const out = [];
  for (let v = 0; v < max + step; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

// Buckets: daily up to a month, weekly up to a quarter, monthly beyond. Empty
// buckets are emitted as zero on purpose - a week with no revenue is a fact,
// and dropping it would flatter the chart.
function anBuckets(from, to) {
  const spanDays = Math.round((to - from) / 86400000);
  const mode = spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month';
  const out = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  if (mode === 'week') cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
  if (mode === 'month') cur.setDate(1);
  let guard = 0;
  while (cur <= to && guard++ < 800) {
    const start = new Date(cur);
    if (mode === 'day') cur.setDate(cur.getDate() + 1);
    else if (mode === 'week') cur.setDate(cur.getDate() + 7);
    else cur.setMonth(cur.getMonth() + 1);
    out.push({
      start,
      end: new Date(cur),
      label:
        mode === 'month'
          ? start.toLocaleDateString('en-AU', { month: 'short' })
          : start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      full:
        mode === 'month'
          ? start.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
          : mode === 'week'
            ? 'Week of ' + start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
            : start.toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
      value: 0,
    });
  }
  return out;
}

function anSeriesFrom(records, dateKey, from, valueFn) {
  const dates = records
    .map((r) => new Date(r[dateKey]).getTime())
    .filter((t) => Number.isFinite(t));
  if (!dates.length) return [];
  const start = from || new Date(Math.min(...dates));
  const buckets = anBuckets(start, new Date());
  records.forEach((r) => {
    const t = new Date(r[dateKey]).getTime();
    if (!Number.isFinite(t)) return;
    const b = buckets.find((x) => t >= x.start.getTime() && t < x.end.getTime());
    if (b) b.value += valueFn ? valueFn(r) : 1;
  });
  return buckets;
}

function renderRevenueChart(d, from) {
  const el = document.getElementById('an-revenue');
  if (!el) return;
  if (d.bookingsError) return void (el.innerHTML = anError(d.bookingsError));
  const completed = anCompletedInRange(d.all, from, null);
  if (!completed.length) {
    el.innerHTML = anEmpty(
      'No completed bookings in this range',
      'Nothing has been invoiced in the ' + anRangeLabel() + '.'
    );
    return;
  }
  const rows = completed.map((b) => ({
    at: b.completed_at || b.created_at,
    v: anBookingRevenue(b),
  }));
  const series = anSeriesFrom(rows, 'at', from, (r) => r.v);
  el.innerHTML = anColumnChart('an-revenue', series, {
    format: anMoney,
    tickFormat: (t) => '$' + anCompact(t),
    xLabel: 'Period',
    yLabel: 'Revenue',
    aria: 'Revenue by period',
  });

  // Rows written before callout_fee existed have no fee to add. They are
  // counted at their service price rather than topped up with an assumed $20,
  // and the shortfall is named instead of hidden.
  const note = document.getElementById('an-revenue-note');
  if (note) {
    const gaps = anCalloutGaps(completed);
    const basis = `Adds <code>service_price</code> and <code>callout_fee</code> as recorded on each completed booking &mdash; what was actually charged, not today's price list.`;
    note.innerHTML = gaps
      ? `${basis} <strong>${gaps} of ${completed.length} completed ${completed.length === 1 ? 'booking' : 'bookings'} in this range ${gaps === 1 ? 'has' : 'have'} no call-out fee recorded</strong>, so ${gaps === 1 ? 'it counts' : 'they count'} only the service price and the real total is higher.`
      : basis;
  }
}

function renderSignupsChart(d, from) {
  const el = document.getElementById('an-signups');
  if (!el) return;
  if (d.profilesError) return void (el.innerHTML = anError(d.profilesError));
  const rows = (
    from ? d.profiles.filter((p) => anInRange(p.created_at, from, null)) : d.profiles
  ).filter((p) => p.created_at);
  if (!rows.length) {
    el.innerHTML = anEmpty(
      'No accounts created in this range',
      'Nobody signed up in the ' + anRangeLabel() + '.'
    );
    return;
  }
  const series = anSeriesFrom(rows, 'created_at', from);
  el.innerHTML = anColumnChart('an-signups', series, {
    integer: true,
    xLabel: 'Period',
    yLabel: 'New accounts',
    aria: 'New accounts by period',
  });
}

// ── Acquisition funnel ───────────────────────────────────────────────────────
// One unit the whole way down - people, not a mix of accounts and bookings -
// so each percentage means something and the stages can only shrink. The
// cohort is the accounts created inside the range; their bookings are counted
// whenever they happened.
function renderFunnel(d, from) {
  const el = document.getElementById('an-funnel');
  const note = document.getElementById('an-funnel-note');
  const sub = document.getElementById('an-funnel-sub');
  if (!el) return;
  if (sub)
    sub.textContent = 'Accounts created ' + anRangeLabel() + ', followed through to completion';

  if (d.profilesError || d.bookingsError) {
    el.innerHTML = anError(d.profilesError || d.bookingsError);
    if (note) note.textContent = '';
    return;
  }

  const cohort = from ? d.profiles.filter((p) => anInRange(p.created_at, from, null)) : d.profiles;
  const ids = new Set(cohort.map((p) => p.id));
  if (!ids.size) {
    el.innerHTML = anEmpty(
      'No accounts created in this range',
      'The funnel starts from sign-ups, and there were none in the ' + anRangeLabel() + '.'
    );
    if (note) note.textContent = '';
    return;
  }

  const booked = new Set();
  const finished = new Set();
  d.all.forEach((b) => {
    if (!b.client_id || !ids.has(b.client_id)) return;
    booked.add(b.client_id);
    if (b.status === 'completed') finished.add(b.client_id);
  });

  const ord = ['var(--an-ord-1)', 'var(--an-ord-2)', 'var(--an-ord-3)', 'var(--an-ord-4)'];
  const steps = [
    { label: 'Created an account', n: ids.size },
    { label: 'Made at least one booking', n: booked.size },
    { label: 'Had a booking completed', n: finished.size },
  ];
  el.innerHTML = steps
    .map((s, i) => {
      const pct = Math.round((s.n / ids.size) * 100);
      const prev = i > 0 ? steps[i - 1].n : 0;
      const ofPrev = i > 0 && prev ? ` · ${Math.round((s.n / prev) * 100)}% of previous step` : '';
      return `<div class="an-funnel-row">
        <div class="an-funnel-head">
          <span class="an-funnel-label">${esc(s.label)}</span>
          <span class="an-funnel-meta">${s.n.toLocaleString('en-AU')} · ${pct}%${ofPrev}</span>
        </div>
        <div class="an-funnel-track"><div class="an-funnel-fill" style="width:${Math.max(pct, s.n ? 1.5 : 0)}%;background:${ord[i]}"></div></div>
      </div>`;
    })
    .join('');

  const guests = d.all.filter((b) => !b.client_id).length;
  if (note) {
    note.textContent =
      'Follows the ' +
      ids.size.toLocaleString('en-AU') +
      ' people who signed up in this range, wherever their bookings landed on the calendar. ' +
      (guests
        ? guests.toLocaleString('en-AU') +
          ' booking(s) in the database have no account attached (desktop and phone bookings) and cannot appear here - the Bookings tile above counts them.'
        : 'Every booking in the database is attached to an account.');
  }
}

// ── Booking status ───────────────────────────────────────────────────────────
// Part-to-whole, so a single stacked bar rather than six bars that make the
// reader add up. The two terminal states wear status colours (they mean good
// and bad); the in-flight ones wear ordinal blue, because they mean "further
// along", not "better". Every segment carries a label, so hue is never the
// only channel. An unrecognised status gets its own labelled segment instead
// of being quietly folded into "other".
const AN_STATUS_GROUPS = [
  { key: 'pending', label: 'Pending', match: ['pending'], color: 'var(--an-warn)' },
  { key: 'confirmed', label: 'Scheduled', match: ['confirmed'], color: 'var(--an-ord-2)' },
  {
    key: 'active',
    label: 'In progress',
    match: ['enroute', 'en_route', 'in_progress', 'arrived'],
    color: 'var(--an-ord-3)',
  },
  { key: 'completed', label: 'Completed', match: ['completed'], color: 'var(--an-good)' },
  { key: 'cancelled', label: 'Cancelled', match: ['cancelled'], color: 'var(--an-crit)' },
];

function renderBookingStatus(inRange, d) {
  const el = document.getElementById('an-status');
  const sub = document.getElementById('an-status-sub');
  if (!el) return;
  if (sub) sub.textContent = 'Bookings created · ' + anRangeLabel();
  if (d.bookingsError) return void (el.innerHTML = anError(d.bookingsError));
  if (!inRange.length) {
    el.innerHTML = anEmpty(
      'No bookings in this range',
      'Nothing was booked in the ' + anRangeLabel() + '.'
    );
    return;
  }

  const counts = {};
  const unknown = {};
  inRange.forEach((b) => {
    const s = String(b.status || '').toLowerCase();
    const g = AN_STATUS_GROUPS.find((x) => x.match.includes(s));
    if (g) counts[g.key] = (counts[g.key] || 0) + 1;
    else unknown[s || 'no status'] = (unknown[s || 'no status'] || 0) + 1;
  });

  const segs = AN_STATUS_GROUPS.filter((g) => counts[g.key]).map((g) => ({
    label: g.label,
    n: counts[g.key],
    color: g.color,
  }));
  Object.entries(unknown).forEach(([label, n]) =>
    segs.push({ label: label + ' (unrecognised)', n, color: 'var(--an-ctx)' })
  );

  const total = inRange.length;
  el.innerHTML = `<div class="an-body"><div class="an-stack">${segs
    .map(
      (s) =>
        `<div class="an-stack-seg" style="flex:${s.n};background:${s.color}" title="${esc(s.label)}: ${s.n}"></div>`
    )
    .join('')}</div></div>
    <div class="an-legend">${segs
      .map(
        (s) =>
          `<span><i style="background:${s.color}"></i>${esc(s.label)} &middot; ${s.n} (${Math.round((s.n / total) * 100)}%)</span>`
      )
      .join('')}</div>`;
}

// ── Services sold ────────────────────────────────────────────────────────────
// `completed` arrives already filtered to jobs finished inside the range - the
// caller does it, so this shares one definition with the Revenue card.
function renderServicePopularity(completed, catalog, d) {
  const el = document.getElementById('an-popularity');
  if (!el) return;
  if (d && d.bookingsError) return void (el.innerHTML = anError(d.bookingsError));
  if (d && d.catalogError) return void (el.innerHTML = anError(d.catalogError));
  const counts = {};
  (catalog || []).forEach((s) => {
    counts[s.name] = 0;
  });
  completed.forEach((b) => {
    const name = b.service_name || 'Unspecified';
    counts[name] = (counts[name] || 0) + 1;
  });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!rows.length) {
    el.innerHTML = anEmpty('No services in the catalog', 'Add services under Services & Prices.');
    return;
  }
  el.innerHTML = anBarList(
    rows.map(([name, n]) => ({ name, value: n, sub: n === 1 ? 'job' : 'jobs' }))
  );
}

// ── Bookings by suburb ───────────────────────────────────────────────────────
function renderSuburbs(inRange, d) {
  const el = document.getElementById('an-suburbs');
  if (!el) return;
  if (d.bookingsError) return void (el.innerHTML = anError(d.bookingsError));
  if (!inRange.length) {
    el.innerHTML = anEmpty(
      'No bookings in this range',
      'Nothing was booked in the ' + anRangeLabel() + '.'
    );
    return;
  }
  const counts = {};
  inRange.forEach((b) => {
    const key = (b.suburb || '').trim() || 'Not recorded';
    if (!counts[key]) counts[key] = { n: 0, rev: 0 };
    counts[key].n++;
    if (b.status === 'completed') counts[key].rev += anBookingRevenue(b);
  });
  const rows = Object.entries(counts)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([name, v]) => ({
      name,
      value: v.n,
      ctx: name === 'Not recorded',
      sub: v.rev ? anMoney(v.rev) : '',
    }));
  el.innerHTML = anBarList(rows);
}

// ── Where bookings come from ─────────────────────────────────────────────────
// Untagged is its own bar in the context grey, never folded into "Direct" as
// if it had been measured. A booking with no utm_source is a booking we do not
// know the origin of.
function renderSources(inRange, d) {
  const el = document.getElementById('an-sources');
  if (!el) return;
  if (d.bookingsError) return void (el.innerHTML = anError(d.bookingsError));
  if (!inRange.length) {
    el.innerHTML = anEmpty(
      'No bookings in this range',
      'Nothing was booked in the ' + anRangeLabel() + '.'
    );
    return;
  }
  const counts = {};
  let untagged = 0;
  inRange.forEach((b) => {
    const src = (b.utm_source || '').trim();
    if (!src) {
      untagged++;
      return;
    }
    counts[src] = (counts[src] || 0) + 1;
  });
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ name, value: n }));
  if (untagged) rows.push({ name: 'Direct / untagged', value: untagged, ctx: true });
  el.innerHTML = anBarList(rows);
}

// ── Unpaid checkouts (server-side, see api/auth.js handleAdminAnalytics) ─────
function renderCheckoutCard() {
  const el = document.getElementById('an-checkout');
  if (!el) return;
  const s = _anServer;
  if (!s) return void (el.innerHTML = anError('The analytics endpoint did not respond.'));
  if (s.error) return void (el.innerHTML = anError(s.error));
  const c = s.checkout;
  if (!c) return void (el.innerHTML = anError('No checkout data in the response.'));
  if (!c.available) return void (el.innerHTML = anError(c.reason));

  if (!c.open) {
    el.innerHTML = anEmpty(
      'Nobody is stuck at payment',
      'Zero open unpaid checkouts right now. Tracking has been live since 28 Jul 2026.'
    );
    return;
  }

  const tiles = [
    ['Open now', String(c.open)],
    ['Reminder sent', `${c.reminded} of ${c.open}`],
    ['Value at risk', anMoney(c.value)],
    ['Oldest', c.oldest_hours === null ? '—' : c.oldest_hours + 'h ago'],
  ];
  el.innerHTML =
    `<div class="an-kpis" style="margin-bottom:16px">${tiles
      .map(
        ([l, v]) =>
          `<div class="an-tile"><div class="an-tile-label">${esc(l)}</div><div class="an-tile-value" style="font-size:22px">${esc(v)}</div></div>`
      )
      .join('')}</div>` +
    (c.by_service && c.by_service.length
      ? `<div class="an-bars">${anBarList(c.by_service.map((r) => ({ name: r.name, value: r.n })))}</div>`
      : '');
}

// ── Traffic (PostHog) ────────────────────────────────────────────────────────
function renderTrafficCard() {
  const el = document.getElementById('an-traffic');
  const sub = document.getElementById('an-traffic-sub');
  if (!el) return;
  const s = _anServer;
  if (!s) return void (el.innerHTML = anError('The analytics endpoint did not respond.'));
  if (s.error) return void (el.innerHTML = anError(s.error));
  const t = s.traffic;
  if (!t) return void (el.innerHTML = anError('No traffic data in the response.'));

  if (!t.configured) {
    if (sub) sub.textContent = 'Not connected yet';
    el.innerHTML = anState(
      `<span class="an-state-icon">&#9679;</span><strong>PostHog is not connected to this panel</strong>
       The site has been sending events to PostHog since July, so the history is already there &mdash; this screen just cannot read it yet.<br><br>
       ${esc(t.reason)}.<br>
       Add them in Vercel &rarr; Settings &rarr; Environment Variables, then redeploy:<br>
       <code>POSTHOG_API_KEY</code> (Personal API Key, scope <em>Query: read</em>) and <code>POSTHOG_PROJECT_ID</code>.<br><br>
       The key is only ever read on the server. It never reaches this page.`
    );
    return;
  }
  if (t.error) {
    if (sub) sub.textContent = 'Connected, but the query failed';
    el.innerHTML = anError(t.error);
    return;
  }

  // Labelled from what the server actually queried, not from the button that
  // was pressed: "All time" sends 730 days because PostHog needs a bound, and
  // calling that "all time" would overstate how far back the numbers reach.
  if (sub) sub.textContent = `PostHog · last ${Number(t.days || 0).toLocaleString('en-AU')} days`;

  // null from the server means that one query failed; an empty array means it
  // ran and found nothing. They must not look the same on screen.
  const num = (v) => (v === null || v === undefined ? null : anCompact(v));
  // `rec`, not `r`: the list() callbacks below all take a row called `r`.
  const rec = s.recon || null;
  const pct =
    t.visitors && t.returning !== null ? Math.round((t.returning / t.visitors) * 100) : null;
  const tiles = [
    ['Visitors', num(t.visitors)],
    ['Page views', num(t.views)],
    [
      'Came back',
      t.returning === null
        ? null
        : pct === null
          ? 'No visits yet'
          : `${anCompact(t.returning)} · ${pct}%`,
      'seen on 2+ separate days',
    ],
    // Counted in the bookings table, NOT from booking_completed. That event
    // fires in the browser after the payment returns, so a client who closes
    // the tab - or a booking the Stripe webhook writes server-side - leaves a
    // real row and no event. The tile used to read booking_completed under the
    // title "Bookings started", which is neither the event's meaning nor a
    // number you could act on: it said 0 over a funnel showing 5 people at the
    // payment screen. The event is still shown, one row down, as what it is.
    [
      'Bookings created',
      rec && rec.bookings !== null && rec.bookings !== undefined ? num(rec.bookings) : null,
      'rows written in the bookings table',
    ],
  ];

  const list = (title, rows, fmtName) =>
    `<div><div class="an-tile-label" style="margin-bottom:10px">${esc(title)}</div>` +
    (rows === null || rows === undefined
      ? anError('this query did not come back')
      : rows.length
        ? `<div class="an-bars">${anBarList(rows.map(fmtName))}</div>`
        : anEmpty('Nothing recorded', '')) +
    '</div>';

  const stepOrder = ['select_service', 'select_date', 'address', 'quote_summary', 'payment'];
  const stepNames = {
    select_service: 'Chose a service',
    select_date: 'Picked a date',
    address: 'Entered address',
    quote_summary: 'Saw the quote',
    payment: 'Reached payment',
  };
  const byStep = Object.fromEntries((t.funnel || []).map((f) => [f.step, f.people]));
  const funnelRows = stepOrder
    .filter((s2) => byStep[s2] !== undefined)
    .map((s2) => ({ name: stepNames[s2], value: byStep[s2] }));
  // The event is named booking_completed but fires when the booking is
  // CREATED, not when the job is done (docs/tracking-plan.md). Labelling it
  // "Completed a booking" put it next to a "Jobs completed: 0" tile reading
  // 1, which looks like the screen contradicting itself.
  if (t.booking_completed)
    funnelRows.push({ name: 'Finished the booking flow', value: t.booking_completed });

  // Names the sections that did not come back, so a partial card is never
  // mistaken for a complete one.
  const failedNote = t.failed
    ? `<div class="an-note" style="padding:0 0 14px;color:var(--an-crit)">Some queries failed and are shown as "could not load": ${esc(
        Object.entries(t.failed)
          .map(([k, v]) => `${k} (${v})`)
          .join(' · ')
      )}</div>`
    : '';

  // ── Do the three sources agree? ───────────────────────────────────────────
  // Sits above the funnel because it is the question the funnel makes people
  // ask. Intent is measured in the browser, money in Stripe, and the booking
  // in the database - and only the last one is the system of record. When
  // these disagree the difference has a name, and each name is a different
  // problem: an orphan is money taken with nothing written; a browser event
  // missing under a real row is a measurement gap, not a lost sale.
  const reachedPayment = byStep.payment ?? null;
  const reconRow = (label, value, note, tone) =>
    `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--an-grid)">
       <div>
         <div style="font-size:14px;font-weight:600;color:var(--an-ink)">${esc(label)}</div>
         <div style="font-size:12px;color:var(--an-muted);margin-top:2px">${esc(note)}</div>
       </div>
       <div style="font-size:19px;font-weight:800;white-space:nowrap;color:${tone || 'var(--an-ink)'}">${
         value === null || value === undefined ? '—' : esc(anCompact(value))
       }</div>
     </div>`;

  let reconBody;
  if (!rec) {
    reconBody = anError('the reconciliation did not come back');
  } else if (rec.error) {
    reconBody = anError(rec.error);
  } else {
    const gaps = [];
    if (rec.orphans > 0)
      gaps.push(
        `${rec.orphans} payment${rec.orphans === 1 ? '' : 's'} with no booking behind ${rec.orphans === 1 ? 'it' : 'them'}` +
          (rec.orphans_value ? ` ($${rec.orphans_value.toFixed(2)} AUD)` : '') +
          ' — see Orphan Payments'
      );
    // The browser event under a real row is the measurement gap that made this
    // block necessary. Only worth saying when there ARE rows to be missing.
    if (
      rec.bookings > 0 &&
      t.booking_completed !== null &&
      t.booking_completed !== undefined &&
      t.booking_completed < rec.bookings
    )
      gaps.push(
        `${rec.bookings - t.booking_completed} booking${rec.bookings - t.booking_completed === 1 ? '' : 's'} exist that the browser never reported — the funnel below undercounts by that much`
      );
    if (rec.truncated) gaps.push('Stripe had more payments than one read returns — the payment numbers are a floor, not a total');
    if (rec.bookings_error) gaps.push(`bookings count failed: ${rec.bookings_error}`);
    if (rec.stripe_error) gaps.push(`Stripe not read: ${rec.stripe_error}`);

    reconBody =
      reconRow('Reached payment', reachedPayment, 'PostHog · measured in the browser', null) +
      reconRow(
        'Payments Stripe returned',
        rec.payments_checked,
        'every payment intent in the range, successful or not',
        null
      ) +
      reconRow(
        'Bookings written',
        rec.bookings,
        rec.bookings_paid === null || rec.bookings_paid === undefined
          ? 'rows in the database — the only source of record'
          : `rows in the database · ${rec.bookings_paid} carry a Stripe payment`,
        'var(--an-good)'
      ) +
      reconRow(
        'Payments with no booking',
        rec.orphans,
        'money taken with nothing written',
        rec.orphans > 0 ? 'var(--an-crit)' : null
      ) +
      (gaps.length
        ? `<div style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--an-crit)">${gaps
            .map((g) => `• ${esc(g)}`)
            .join('<br>')}</div>`
        : `<div style="margin-top:12px;font-size:13px;color:var(--an-good)">The three sources agree over this range.</div>`);
  }

  el.innerHTML = `<div class="an-body">
      ${failedNote}
      <div class="an-kpis" style="margin-bottom:20px">${tiles
        .map(
          ([l, v, n]) =>
            `<div class="an-tile"><div class="an-tile-label">${esc(l)}</div>${
              v === null
                ? '<div class="an-tile-value is-empty">Could not load</div>'
                : `<div class="an-tile-value" style="font-size:24px">${esc(v)}</div>`
            }${n && v !== null ? `<div class="an-tile-note">${esc(n)}</div>` : ''}</div>`
        )
        .join('')}</div>
      <div class="an-grid-2" style="gap:24px">
        ${list('Most viewed pages', t.pages, (r) => ({ name: r.path || 'unknown', value: r.views }))}
        ${list('Countries', t.countries, (r) => ({ name: r.country || 'Unknown', value: r.visitors, ctx: !r.country }))}
        ${list('Referrers', t.referrers, (r) => {
          // PostHog writes "$direct" for a visit with no referrer. Shown raw it
          // reads like a broken value sitting next to real domain names.
          const direct = !r.source || r.source === '$direct';
          return {
            name: direct ? 'Direct / no referrer' : r.source,
            value: r.visitors,
            ctx: direct,
          };
        })}
        ${list('Most clicked buttons', t.ctas, (r) => ({ name: `${r.label || 'unlabelled'} (${r.location || 'unknown'})`, value: r.clicks }))}
      </div>
      <div style="margin-top:24px">
        <div class="an-tile-label" style="margin-bottom:4px">Do the three sources agree?</div>
        <div style="font-size:12px;color:var(--an-muted);margin-bottom:10px">Same date range, asked three times: the browser, Stripe, and the database.</div>
        ${reconBody}
      </div>
      <div style="margin-top:24px">
        <div class="an-tile-label" style="margin-bottom:10px">Booking flow, step by step</div>
        ${
          t.funnel === null
            ? anError('this query did not come back')
            : funnelRows.length
              ? `<div class="an-bars">${anBarList(funnelRows)}</div>`
              : anEmpty('No booking steps recorded', '')
        }
      </div>
    </div>`;
}

// ── Wiring: range filter, refresh, table toggles, chart tooltip ─────────────
// Delegated from #page-analytics and registered once, so re-rendering a card
// never leaves a listener behind. No inline handlers anywhere.
let _anWired = false;
function wireAnalytics() {
  if (_anWired) return;
  const page = document.getElementById('page-analytics');
  if (!page) return;
  _anWired = true;

  page.addEventListener('click', (ev) => {
    const range = ev.target.closest('[data-an-range]');
    if (range) {
      const days = parseInt(range.dataset.anRange, 10);
      if (days === _anRange) return;
      _anRange = days;
      page
        .querySelectorAll('[data-an-range]')
        .forEach((b) => b.setAttribute('aria-pressed', b === range ? 'true' : 'false'));
      // The DB half re-renders from cache; only the traffic half needs the
      // server again, because its window is baked into the PostHog query.
      renderAnalytics();
      fetchAnalyticsServer().then((s) => {
        _anServer = s;
        renderCheckoutCard();
        renderTrafficCard();
      });
      return;
    }
    const toggle = ev.target.closest('[data-an-table]');
    if (toggle) {
      const id = toggle.dataset.anTable;
      if (!_anTables[id]) return;
      _anTables[id].showing = !_anTables[id].showing;
      toggle.textContent = _anTables[id].showing ? 'Chart' : 'Table';
      renderAnalytics();
      // renderAnalytics rebuilt the card, so put the label back.
      const fresh = page.querySelector(`[data-an-table="${id}"]`);
      if (fresh) fresh.textContent = _anTables[id].showing ? 'Chart' : 'Table';
      return;
    }
    if (ev.target.closest('#an-refresh')) loadAnalytics();
  });

  // Hover layer. One tooltip node for the whole page.
  let tip = document.getElementById('an-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'an-tip';
    tip.className = 'an-tip';
    document.body.appendChild(tip);
  }
  page.addEventListener('mousemove', (ev) => {
    const g = ev.target.closest('.an-colgroup');
    if (!g) {
      tip.classList.remove('on');
      return;
    }
    tip.textContent = g.dataset.tip || '';
    tip.style.left = ev.clientX + 14 + 'px';
    tip.style.top = ev.clientY - 34 + 'px';
    tip.classList.add('on');
  });
  page.addEventListener('mouseleave', () => tip.classList.remove('on'));
}

// #21 Geographic heatmap
function renderHeatmap(all) {
  const mapEl = document.getElementById('an-heatmap');
  // null = could not render at all (Leaflet did not load); 0 = rendered, but
  // nothing to plot. The caller tells those two apart in the subtitle.
  if (!mapEl || typeof L === 'undefined') return null;
  const counts = {};
  all.forEach((b) => {
    const c = suburbCoord(b);
    if (!c) return;
    // Key on the resolved coordinate, never on the suburb field. Keying on the
    // field split one suburb into two circles stacked on the same point - one
    // for the bookings that filled it in, one for the bookings guessed from the
    // address - with the count and the revenue divided between them. Fixing
    // suburbCoord() made that worse, not better: far more bookings resolve now.
    const key = c.join(',');
    if (!counts[key]) counts[key] = { coord: c, n: 0, name: '', rev: 0 };
    counts[key].n++;
    counts[key].rev += anBookingRevenue(b);
    if (!counts[key].name && b.suburb) counts[key].name = String(b.suburb).trim();
  });
  const points = Object.values(counts);
  if (!_heatMap) {
    _heatMap = L.map(mapEl, { zoomControl: false, attributionControl: false }).setView(
      [-33.8688, 151.2093],
      11
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(
      _heatMap
    );
  }
  if (_heatLayer) {
    _heatMap.removeLayer(_heatLayer);
    _heatLayer = null;
  }
  _heatLayer = L.layerGroup().addTo(_heatMap);
  const maxN = Math.max(1, ...points.map((p) => p.n));
  points.forEach((p) => {
    const intensity = p.n / maxN;
    const radius = 12 + intensity * 28;
    const color = intensity > 0.66 ? 'var(--red)' : intensity > 0.33 ? 'var(--amber)' : 'var(--blue)';
    L.circleMarker(p.coord, { radius, color, weight: 1, fillColor: color, fillOpacity: 0.45 })
      .bindPopup(
        `<b>${esc(p.name || 'Area')}</b><br>${p.n} booking${p.n !== 1 ? 's' : ''}<br>${anMoney(p.rev)} revenue`
      )
      .addTo(_heatLayer);
  });
  // maxZoom, because fitBounds on a single suburb zooms to street level and
  // the card stops looking like a map of Sydney - which is what it did the
  // first time it ran against real data holding one booking.
  if (points.length)
    _heatMap.fitBounds(L.latLngBounds(points.map((p) => p.coord)).pad(0.2), { maxZoom: 12 });
  setTimeout(() => _heatMap && _heatMap.invalidateSize(), 100);
  // An empty map and a map of a quiet week look identical, so say which it is.
  // Returned rather than written here: renderAnalytics sets this subtitle a few
  // lines after calling us, so writing it directly was dead code.
  return points.length;
}

// Parts spend per job over the WHOLE life of the business - which is the
// period this table covers, and not whichever month was last looked at on the
// Finance screen.
//
// The margins table used to read `_partsPerJob`, a variable only loadFinance()
// ever wrote. Opening Analytics directly left it at 0: est. cost $0 and a
// green 100% margin on every service - the absence of the number painted as a
// result. And if Finance HAD been opened first, a lifetime table ended up
// using one month's ratio, so changing the month over there moved the historic
// margins over here.
//
// Returns available:false when there is nothing to work it out from. Callers
// must render "no data", never a percentage.
function analyticsPartsPerJob(completed) {
  if (!_expenses || !_expenses.available)
    return { available: false, reason: _expenses?.reason || 'expenses not loaded' };
  const rows = _expenses.expenses || [];
  if (!rows.length) return { available: false, reason: 'no expenses recorded' };
  if (!completed.length) return { available: false, reason: 'no completed jobs' };

  // From the month of the oldest expense to today: expTotalsInRange counts a
  // recurring expense once per month of the range, so the range has to be the
  // real one and not some arbitrary month.
  const earliest = rows
    .map((e) => String(e.spent_on || ''))
    .filter(Boolean)
    .sort()[0];
  if (!earliest) return { available: false, reason: 'no expenses recorded' };
  const today = new Date();
  const dateTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const parts = expTotalsInRange(rows, earliest, dateTo).byCat.parts || 0;
  if (!parts) return { available: false, reason: 'nothing recorded under parts' };
  return { available: true, perJob: parts / completed.length, parts, jobs: completed.length };
}

// #23 Margins per service
function renderMargins(all) {
  const tbody = document.getElementById('an-margins');
  if (!tbody) return;
  const completed = all.filter((b) => b.status === 'completed');
  const byService = {};
  completed.forEach((b) => {
    const name = b.service_name || 'Other';
    if (!byService[name]) byService[name] = { jobs: 0, rev: 0 };
    byService[name].jobs++;
    byService[name].rev += anBookingRevenue(b);
  });
  const rows = Object.entries(byService).sort((a, b) => b[1].rev - a[1].rev);
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--mgray);padding:24px">No completed jobs yet</td></tr>';
    return;
  }

  const parts = analyticsPartsPerJob(completed);
  // Where the number comes from, said on the card itself: the cost is a flat
  // average of parts spend per job, not the real cost of each service. It is
  // an estimate and has to read as one (PENDIENTES 18.3).
  const sub = document.getElementById('an-margins-sub');
  if (sub)
    sub.textContent = parts.available
      ? `Lifetime, not filtered by the range above · est. cost = ${anMoney(parts.parts)} of parts / ${parts.jobs} jobs = ${anMoney(Math.round(parts.perJob))} a job`
      : 'Lifetime, not filtered by the range above · no parts expenses recorded, so there is nothing to work a margin out of';

  tbody.innerHTML = rows
    .map(([name, d]) => {
      const avg = Math.round(d.rev / d.jobs);
      const net = d.rev - Math.round(d.rev / 11); // ex-GST
      if (!parts.available) {
        // A margin with no cost is not a 100% margin, it is a margin that
        // cannot be worked out. Say so - do not paint it green.
        return `<tr>
      <td data-label="Service"><b>${esc(name)}</b></td>
      <td data-label="Jobs">${d.jobs}</td>
      <td data-label="Revenue">${anMoney(d.rev)}</td>
      <td data-label="Avg ticket">${anMoney(avg)}</td>
      <td data-label="Est. cost" style="color:var(--mgray)">&mdash;</td>
      <td data-label="Margin" style="color:var(--mgray)">Add expenses</td>
    </tr>`;
      }
      const cost = Math.round(d.jobs * parts.perJob);
      const profit = net - cost;
      const margin = net > 0 ? Math.round((profit / net) * 100) : 0;
      const mColor = margin >= 70 ? 'var(--green)' : margin >= 50 ? 'var(--amber)' : 'var(--red)';
      return `<tr>
      <td data-label="Service"><b>${esc(name)}</b></td>
      <td data-label="Jobs">${d.jobs}</td>
      <td data-label="Revenue">${anMoney(d.rev)}</td>
      <td data-label="Avg ticket">${anMoney(avg)}</td>
      <td data-label="Est. cost">${anMoney(cost)}</td>
      <td data-label="Margin" style="color:${mColor};font-weight:700">${margin}%</td>
    </tr>`;
    })
    .join('');
}

// #22 Customer LTV & churn
function renderLTV(all) {
  const rowsEl = document.getElementById('an-ltv-rows');
  const kpisEl = document.getElementById('an-ltv-kpis');
  const subEl = document.getElementById('an-churn-sub');
  if (!rowsEl) return;
  const completed = all.filter((b) => b.status === 'completed');
  const byClient = {};
  completed.forEach((b) => {
    const key = b.client_id || b.client_email || b.profiles?.email || b.client_name || 'unknown';
    if (!byClient[key])
      byClient[key] = {
        name: b.client_name || b.profiles?.full_name || b.profiles?.email || 'Client',
        jobs: 0,
        ltv: 0,
        last: '',
      };
    byClient[key].jobs++;
    byClient[key].ltv += anBookingRevenue(b);
    if (!byClient[key].last || b.scheduled_date > byClient[key].last)
      byClient[key].last = b.scheduled_date;
  });
  const clients = Object.values(byClient).sort((a, b) => b.ltv - a.ltv);
  const now = new Date();
  const CHURN_DAYS = 120;
  const daysSince = (d) => (d ? Math.floor((now - new Date(d + 'T00:00:00')) / 86400000) : 9999);
  const churned = clients.filter((c) => daysSince(c.last) > CHURN_DAYS);
  const active = clients.length - churned.length;

  // With no completed jobs there is no customer to average over. Showing
  // "$0" and "0%" here would read as a measured result rather than an empty
  // denominator - the same trap the Target metrics card already avoids.
  if (!clients.length) {
    if (subEl) subEl.textContent = 'No completed jobs yet - nothing to measure';
    if (kpisEl)
      kpisEl.innerHTML = ['Avg LTV', 'Active customers', 'Churned', 'Repeat rate']
        .map(
          (l) => `<div style="background:var(--off);border-radius:10px;padding:14px 16px">
      <div style="font-size:11px;color:var(--mgray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${l}</div>
      <div style="font-size:20px;font-weight:600;color:var(--mgray)">No data yet</div></div>`
        )
        .join('');
    rowsEl.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--mgray);padding:24px">No completed jobs yet</td></tr>';
    return;
  }

  const avgLtv = Math.round(clients.reduce((s, c) => s + c.ltv, 0) / clients.length);
  const repeatRate = Math.round((clients.filter((c) => c.jobs > 1).length / clients.length) * 100);

  if (subEl)
    subEl.textContent = `${clients.length} customers · churn after ${CHURN_DAYS} days inactive`;
  if (kpisEl)
    kpisEl.innerHTML = [
      ['Avg LTV', anMoney(avgLtv), 'var(--green)'],
      ['Active customers', String(active), 'var(--blue)'],
      ['Churned', String(churned.length), 'var(--red)'],
      ['Repeat rate', repeatRate + '%', 'var(--navy)'],
    ]
      .map(
        ([l, v, c]) => `<div style="background:var(--off);border-radius:10px;padding:14px 16px">
      <div style="font-size:11px;color:var(--mgray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${l}</div>
      <div style="font-size:24px;font-weight:800;color:${c}">${v}</div></div>`
      )
      .join('');

  rowsEl.innerHTML = clients
    .slice(0, 50)
    .map((c) => {
      const ds = daysSince(c.last);
      const isChurned = ds > CHURN_DAYS;
      const lastStr = c.last
        ? new Date(c.last + 'T00:00:00').toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '—';
      return `<tr>
      <td data-label="Client"><b>${esc(c.name)}</b></td>
      <td data-label="Jobs">${c.jobs}</td>
      <td data-label="LTV"><b style="color:var(--green)">${anMoney(c.ltv)}</b></td>
      <td data-label="Last service">${lastStr} <span style="color:var(--mgray);font-size:11px">(${ds > 9000 ? 'never' : ds <= 0 ? 'today' : ds + 'd ago'})</span></td>
      <td data-label="Status"><span class="status ${isChurned ? 'cancelled' : 'confirmed'}">${isChurned ? 'Churned' : 'Active'}</span></td>
    </tr>`;
    })
    .join('');
}

async function renderMechStats() {
  const vansDiv = document.querySelector('#page-vans');
  if (!vansDiv) return;
  let statsDiv = document.getElementById('mech-stats-section');
  if (!statsDiv) {
    statsDiv = document.createElement('div');
    statsDiv.id = 'mech-stats-section';
    vansDiv.appendChild(statsDiv);
  }
  const vanNums = [1, 2];
  const allStats = await Promise.all(vanNums.map((v) => loadMechStats(v)));
  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return d.toISOString().split('T')[0];
  });
  statsDiv.innerHTML = `<div class="card" style="margin-top:0">
    <div class="card-hdr"><div><div class="card-title">7-Day Mechanic Performance</div><div class="card-sub">Last 7 days · completed jobs</div></div></div>
    <div id="mech-perf-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px">
    ${vanNums
      .map((v, i) => {
        const data = allStats[i];
        const totalJobs = data.length;
        const totalRev = anRevenueOf(data);
        const ratings = data.filter((b) => b.client_rating);
        const avgRating = ratings.length
          ? (ratings.reduce((s, b) => s + (b.client_rating || 0), 0) / ratings.length).toFixed(1)
          : '—';
        const maxSlots = 7 * 9;
        const util = Math.round((totalJobs / maxSlots) * 100);
        const byDay = {};
        days7.forEach((d) => (byDay[d] = 0));
        data.forEach((b) => {
          if (byDay[b.scheduled_date] !== undefined) byDay[b.scheduled_date]++;
        });
        const vals = Object.values(byDay);
        const maxVal = Math.max(...vals, 1);
        const colors = { 1: 'var(--blue)', 2: 'var(--amber)' };
        return `<div style="background:var(--off);border-radius:10px;padding:16px">
        <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:12px">🚐 Van ${v}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
          <div style="background:var(--white);border-radius:8px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:${colors[v]}">${totalJobs}</div><div style="font-size:11px;color:var(--mgray);margin-top:2px;text-transform:uppercase">Jobs done</div></div>
          <div style="background:var(--white);border-radius:8px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:var(--green)">${anMoney(totalRev)}</div><div style="font-size:11px;color:var(--mgray);margin-top:2px;text-transform:uppercase">Revenue</div></div>
          <div style="background:var(--white);border-radius:8px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:var(--gold)">${avgRating}${avgRating !== '—' ? '★' : ''}</div><div style="font-size:11px;color:var(--mgray);margin-top:2px;text-transform:uppercase">Avg rating</div></div>
        </div>
        <div style="font-size:11px;color:var(--mgray);margin-bottom:6px">Utilisation: ${util}% · ${totalJobs}/${maxSlots} slots</div>
        <div style="height:5px;background:var(--border);border-radius:3px;margin-bottom:12px"><div style="height:100%;width:${Math.min(util, 100)}%;background:${colors[v]};border-radius:3px"></div></div>
        <div style="display:flex;align-items:flex-end;gap:3px;height:60px">
          ${days7
            .map((d, di) => {
              const v2 = byDay[d] || 0;
              const h = Math.max((v2 / maxVal) * 100, v2 > 0 ? 8 : 4);
              const day = new Date(d + 'T00:00:00')
                .toLocaleDateString('en-AU', { weekday: 'short' })
                .slice(0, 2);
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:100%;height:${h}%;background:${v2 > 0 ? colors[v] : '#E2E8F0'};border-radius:3px 3px 0 0;transition:height .4s" title="${v2} job${v2 !== 1 ? 's' : ''}"></div><div style="font-size:11px;color:var(--mgray)">${day}</div></div>`;
            })
            .join('')}
        </div>
      </div>`;
      })
      .join('')}
    </div>
  </div>`;
}

// ── CLIENTS ───────────────────────────────────────────────────────────────────
// Midnight on the 1st of the month `d` falls in. The Clients KPI used to do
// `const t = new Date(); t.setDate(1);` and compare against that - which moves
// the day but NOT the time, so the cut sat at "the 1st, at whatever o'clock it
// is now". Looking at the panel on the 1st at 18:00 hid everyone who signed up
// that morning. anRangeStart() on the Analytics screen already zeroes the time;
// this is the same rule, named, so it can be tested.
function startOfMonth(d) {
  const out = new Date(d);
  out.setDate(1);
  out.setHours(0, 0, 0, 0);
  return out;
}

async function loadClients() {
  const monthStart = startOfMonth(new Date());
  // The three KPIs are asked of the database, not counted off the rows that
  // came back. A single select returns at most the project's max-rows, and
  // this screen has no .limit() and no way to notice it was cut: "Total
  // clients" would be a floor rendered as a total, and the other two would
  // count only the page of rows that happened to arrive. `head: true` sends
  // no rows at all, so this is three cheap queries, not three more downloads.
  const [{ data, error }, totalRes, vipRes, newRes] = await Promise.all([
    sb.from('profiles').select('*').order('created_at', { ascending: false }),
    sb.from('profiles').select('id', { count: 'exact', head: true }),
    sb.from('profiles').select('id', { count: 'exact', head: true }).eq('membership_plan', 'vip'),
    sb
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart.toISOString()),
  ]);
  const grid = document.querySelector('#page-clients .clients-grid');
  if (!grid) return;
  const colors = ['var(--blue)', 'var(--green)', 'var(--amber)', 'var(--purple)', 'var(--cyan)', 'var(--red)'];
  // Without this, a permissions or network failure rendered the friendly
  // "No clients yet" message - indistinguishable from genuinely having none.
  if (error) {
    grid.innerHTML = `<div style="grid-column:1/-1;background:#FEF2F2;border:1px solid var(--red-edge);color:var(--red);padding:14px 16px;border-radius:10px;font-size:13px;font-weight:600">❌ Could not load clients: ${esc(error.message)}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    grid.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;color:var(--mgray);padding:48px;font-size:15px">No clients yet — they will appear here when they sign up.</div>';
    return;
  }
  grid.innerHTML = data
    .map((c, i) => {
      const name = c.full_name || c.email?.split('@')[0] || 'Client';
      const initials = name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      const mem = c.membership_plan || 'none';
      const segClass =
        { vip: 'seg-vip', basic: 'seg-reg', std: 'seg-reg', none: 'seg-new' }[mem] || 'seg-new';
      const segLabel =
        { vip: 'VIP', basic: 'Basic', std: 'Standard', none: 'No plan' }[mem] || 'No plan';
      return `<div class="client-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div class="cl-av" style="background:${colors[i % colors.length]}">${esc(initials)}</div>
        <div style="flex:1"><div class="cl-name">${esc(name)}</div><div class="cl-suburb">${esc(c.email || '')}</div></div>
        <span class="cl-seg ${segClass}">${segLabel}</span>
      </div>
      <div class="cl-stats">
        <div class="cl-stat"><div class="cl-stat-n">${mem !== 'none' ? '✓' : '—'}</div><div class="cl-stat-l">Member</div></div>
        <div class="cl-stat"><div class="cl-stat-n">${c.role || 'client'}</div><div class="cl-stat-l">Role</div></div>
        <div class="cl-stat"><div class="cl-stat-n">${new Date(c.created_at).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}</div><div class="cl-stat-l">Joined</div></div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button data-cl-action="bikes" data-id="${c.id}" data-name="${esc(name).replace(/"/g, '&quot;')}" style="flex:1;padding:7px;background:var(--off);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans);color:var(--navy)">Bikes</button>
        <button data-cl-action="chat" data-id="${c.id}" data-name="${esc(name).replace(/"/g, '&quot;')}" style="flex:1;padding:7px;background:var(--off);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans);color:var(--navy)">Chat</button>
      </div>
    </div>`;
    })
    .join('');
  // Bound once. loadClients() runs on every visit to the Clients page, so
  // attaching here unguarded stacked a listener per visit and fired the
  // handler N times on one click - the same bug already fixed in mechanic.js.
  if (!grid.dataset.clickBound) {
    grid.dataset.clickBound = '1';
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cl-action]');
      if (!btn) return;
      if (btn.dataset.clAction === 'bikes') viewClientBikes(btn.dataset.id, btn.dataset.name);
      else if (btn.dataset.clAction === 'chat') openAdminChat(btn.dataset.id, btn.dataset.name);
    });
  }
  // A count query that failed falls back to what was rendered, and says so
  // rather than printing a smaller number as if it were the total.
  const kpis = document.querySelectorAll('#page-clients .kpi-value');
  const shown = (res, fallback) =>
    res.error || res.count === null || res.count === undefined
      ? String(fallback)
      : String(res.count);
  if (kpis[0]) kpis[0].textContent = shown(totalRes, data.length);
  if (kpis[1])
    kpis[1].textContent = shown(vipRes, data.filter((c) => c.membership_plan === 'vip').length);
  if (kpis[2])
    kpis[2].textContent = shown(
      newRes,
      data.filter((c) => new Date(c.created_at) >= monthStart).length
    );

  // The grid itself can still be short of the real total - that is the row cap
  // doing its job, not an error - but it must not look like the whole list.
  const total = totalRes.error ? null : totalRes.count;
  if (total !== null && total > data.length) {
    grid.insertAdjacentHTML(
      'afterbegin',
      `<div style="grid-column:1/-1;background:var(--off);border:1px solid var(--border);color:var(--mgray);padding:10px 14px;border-radius:10px;font-size:13px">Showing the ${data.length.toLocaleString('en-AU')} most recent of ${total.toLocaleString('en-AU')} clients. The counters above are the real totals.</div>`
    );
  }
}

// ── VAN ZONES ─────────────────────────────────────────────────────────────────
let vanZones = [];

async function loadVanZones() {
  const { data } = await sb.from('van_zones').select('*').eq('active', true).order('van_number');
  if (data && data.length > 0) {
    const grouped = {};
    data.forEach((row) => {
      if (!grouped[row.van_number]) {
        const colors = { 1: 'var(--blue)', 2: 'var(--amber)', 3: 'var(--purple)', 4: 'var(--red)' };
        grouped[row.van_number] = {
          id: row.van_number,
          name: 'Van ' + row.van_number,
          color: colors[row.van_number] || 'var(--blue)',
          suburbs: [],
          driverName: '',
        };
      }
      if (row.suburb === '__driver__') {
        grouped[row.van_number].driverName = row.postcode || '';
      } else {
        grouped[row.van_number].suburbs.push(row.suburb);
      }
    });
    vanZones = Object.values(grouped)
      .filter((v) => v.id !== 0 && !v.suburbs.every((s) => s === '__whatsapp__'))
      .sort((a, b) => a.id - b.id);
  }
  renderVanZones();
}

// Saving a van's suburbs means replacing its rows, and there is no transaction
// available from the browser client. This used to be a bare delete followed by
// a bare insert with neither result checked, and a "saved" toast that fired
// either way: one failed insert and the van silently ended up covering NO
// suburbs, which is how a van stops being offered any jobs at all.
//
// So: keep a copy of the rows first, and if the insert fails put them back and
// say what happened instead of claiming success.
async function saveVanZone(vanId) {
  const van = vanZones.find((v) => v.id === vanId);
  if (!van) return;

  const { data: previous, error: readErr } = await sb
    .from('van_zones')
    .select('*')
    .eq('van_number', vanId);
  if (readErr) {
    showToast('Could not read the current zones: ' + readErr.message, 'error');
    return;
  }

  const { error: delErr } = await sb.from('van_zones').delete().eq('van_number', vanId);
  if (delErr) {
    showToast('Could not save: ' + delErr.message, 'error');
    return;
  }

  if (van.suburbs.length > 0) {
    const { error: insErr } = await sb
      .from('van_zones')
      .insert(
        van.suburbs.map((s) => ({ van_number: vanId, suburb: s, postcode: '', active: true }))
      );
    if (insErr) {
      // Put back exactly what was there, so a failure costs nothing.
      let restored = false;
      if (previous?.length) {
        const { error: backErr } = await sb.from('van_zones').insert(previous);
        restored = !backErr;
      } else {
        restored = true; // there was nothing to lose
      }
      showToast(
        restored
          ? 'Could not save the zones: ' + insErr.message + '. Nothing was changed.'
          : 'Could not save the zones AND could not restore the old ones. Van ' +
              vanId +
              ' has no zones right now: ' +
              insErr.message,
        'error'
      );
      return;
    }
  }
  showToast('Van ' + vanId + ' zones saved ✓');
}

function renderVanZones() {
  const container = document.getElementById('zones-container');
  if (!container) return;
  container.innerHTML = vanZones
    .map((van) => {
      return `
    <div style="background:var(--white);border-radius:12px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 16px;background:${van.color}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:15px;font-weight:600;color:#fff">${van.name}</div>
          ${vanZones.length > 1 ? `<button data-action="remove-van" data-id="${van.id}" style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.7);padding:4px 8px;border-radius:6px;font-size:13px;cursor:pointer">✕</button>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:11px;color:rgba(255,255,255,0.7);white-space:nowrap">👤</span>
          <input id="driver-${van.id}" value="${esc(van.driverName || '')}" placeholder="Mechanic name" aria-label="Mechanic name"
            style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:6px 10px;font-size:13px;color:#fff;font-family:Inter,sans-serif;outline:none;flex:1;min-width:0"
            data-blur="save-driver-name" data-id="${van.id}">
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:11px;color:rgba(255,255,255,0.6)">${van.suburbs.length} suburbs</div>
          <button data-action="save-van-zone" data-id="${van.id}" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:500;font-family:Inter,sans-serif">Save changes</button>
        </div>
      </div>
      <div style="padding:16px 20px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
          ${van.suburbs.map((s) => `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--blue-lt);color:var(--blue);border:1px solid rgba(24,72,200,0.2);border-radius:20px;padding:5px 12px;font-size:13px;font-weight:500">${s}<span data-action="remove-suburb" data-id="${van.id}" data-suburb="${esc(s)}" style="cursor:pointer;font-size:15px;opacity:.6;line-height:1">×</span></span>`).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <input id="inp-${van.id}" placeholder="Add suburb (e.g. Bondi)" aria-label="Add suburb" data-enter="add-suburb" data-id="${van.id}"
            style="flex:1;border:1.5px solid var(--border);border-radius:8px;padding:9px 14px;font-size:13px;font-family:Inter,sans-serif;outline:none">
          <button data-action="add-suburb" data-id="${van.id}" style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif">+ Add</button>
        </div>
      </div>
    </div>`;
    })
    .join('');
}

async function saveDriverName(vanId, name) {
  // Store driver name as special suburb row with suburb='__driver__' and postcode=name
  await sb.from('van_zones').delete().eq('van_number', vanId).eq('suburb', '__driver__');
  if (name.trim()) {
    await sb
      .from('van_zones')
      .insert({ van_number: vanId, suburb: '__driver__', postcode: name.trim(), active: true });
  }
  const van = vanZones.find((v) => v.id === vanId);
  if (van) van.driverName = name.trim();
  showToast('Mechanic name saved ✓');
}

function addSuburb(vanId) {
  const inp = document.getElementById('inp-' + vanId);
  const suburb = inp.value.trim().toLowerCase();
  if (!suburb) return;
  const van = vanZones.find((v) => v.id === vanId);
  if (!van || van.suburbs.some((s) => s.toLowerCase() === suburb)) {
    showToast('Already added');
    return;
  }
  van.suburbs.push(suburb);
  inp.value = '';
  renderVanZones();
}

function removeSuburb(vanId, suburb) {
  const van = vanZones.find((v) => v.id === vanId);
  if (van) van.suburbs = van.suburbs.filter((s) => s !== suburb);
  renderVanZones();
}

function addVan() {
  const newId = vanZones.length > 0 ? Math.max(...vanZones.map((v) => v.id)) + 1 : 1;
  const colors = { 1: 'var(--blue)', 2: 'var(--amber)', 3: 'var(--purple)', 4: 'var(--red)' };
  vanZones.push({
    id: newId,
    name: 'Van ' + newId,
    color: colors[newId] || '#475569',
    suburbs: [],
  });
  renderVanZones();
}

function removeVan(vanId) {
  if (vanZones.length <= 1) {
    showToast('Need at least one van');
    return;
  }
  vanZones = vanZones.filter((v) => v.id !== vanId);
  renderVanZones();
}

// ── CLAIMS ────────────────────────────────────────────────────────────────────
// Reads/updates go through /api/auth (service key server-side) because the
// claims table has RLS with no public policies - the anon-key client used for
// most other admin reads can't see it.
const CLAIM_STATUS = {
  new: { label: 'New', color: 'var(--amber)', bg: 'var(--amber-tint)' },
  reviewing: { label: 'Reviewing', color: 'var(--blue)', bg: 'var(--blue-tint)' },
  resolved: { label: 'Resolved', color: 'var(--green)', bg: 'var(--green-tint)' },
  rejected: { label: 'Rejected', color: 'var(--red)', bg: '#FEF2F2' },
};

// Payments Stripe took that no booking ever claimed. Read-only on purpose:
// every row links out to Stripe, and the refund is Diego's decision made
// there. Nothing in this file gives money back.
async function runOrphanAudit() {
  const box = document.getElementById('orphan-results');
  const btn = document.getElementById('orphan-run');
  if (!box) return;
  const from = document.getElementById('orphan-from')?.value;
  const to = document.getElementById('orphan-to')?.value;
  if (!from || !to) {
    box.innerHTML = orphanNote('Pick both dates first.', 'amber');
    return;
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    box.innerHTML = orphanNote('Admin session expired - sign in again.', 'red');
    return;
  }

  const label = btn?.textContent;
  if (btn) {
    btn.textContent = 'Checking Stripe...';
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  }
  box.innerHTML =
    '<div style="text-align:center;color:var(--mgray);padding:40px;font-size:13px">Reading every payment in that range and cross-checking bookings...</div>';

  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'admin-orphan-audit',
        access_token: session.access_token,
        from,
        to,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      box.innerHTML = orphanNote(data.error || 'Could not read from Stripe.', 'red');
      return;
    }
    renderOrphanResults(box, data);
  } catch (e) {
    box.innerHTML = orphanNote(e.message, 'red');
  } finally {
    if (btn) {
      btn.textContent = label || 'Check this range';
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = 'pointer';
    }
  }
}

function orphanNote(msg, tone) {
  const bg = tone === 'red' ? 'var(--red-lt)' : 'var(--amber-lt)';
  const fg = tone === 'red' ? 'var(--red)' : 'var(--amber-ink)';
  return `<div style="background:${bg};color:${fg};border-radius:8px;padding:12px 14px;font-size:13px;font-weight:600">${esc(msg)}</div>`;
}

function renderOrphanResults(box, data) {
  const orphans = data.orphans || [];
  const scanned = `<div style="font-size:12px;color:var(--mgray);padding:2px 2px 0">Checked ${data.checked} payments between ${esc(data.from)} and ${esc(data.to)}.</div>`;

  if (!orphans.length) {
    box.innerHTML =
      '<div style="text-align:center;padding:48px;color:var(--mgray)"><div style="font-size:36px;margin-bottom:8px">✅</div><div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:4px">No orphan payments in this range</div><div style="font-size:13px">Every payment Stripe accepted has a booking behind it.</div></div>' +
      scanned;
    return;
  }

  // The truncation warning goes FIRST and is loud: a partial list read as
  // complete would leave real people unrefunded, which is the exact failure
  // this whole page exists to end.
  const truncated = data.truncated
    ? orphanNote(
        'That range has more payments than one pass can read. This list is INCOMPLETE - narrow the dates and run it again.',
        'amber'
      )
    : '';

  const header = `<div style="background:var(--red-lt);border-left:4px solid var(--red);border-radius:8px;padding:14px 16px">
      <div style="font-size:15px;font-weight:700;color:var(--navy)">${orphans.length} payment${orphans.length === 1 ? '' : 's'} with no booking</div>
      <div style="font-size:13px;color:var(--gray);margin-top:2px">$${data.total.toFixed(2)} AUD taken from people who got nothing.</div>
    </div>`;

  const rows = orphans
    .map((o) => {
      const when = new Date(o.created).toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const flag = o.alertedBefore
        ? '<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:var(--amber-lt);color:var(--amber-ink);margin-left:8px">alerted before</span>'
        : '';
      const who = o.email
        ? esc(o.email)
        : '<span style="color:var(--red)">no email on the payment</span>';
      return `<a href="${esc(o.stripeUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:12px;text-decoration:none;background:var(--white);border:1px solid var(--border);border-left:3px solid var(--red);border-radius:12px;padding:14px 16px;cursor:pointer">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;color:var(--navy)">$${o.amount.toFixed(2)} ${esc(o.currency)}${flag}</div>
          <div style="font-size:12px;color:var(--gray);margin-top:4px">${who}${o.name ? ' &middot; ' + esc(o.name) : ''}</div>
          <div style="font-size:12px;color:var(--mgray);margin-top:2px">${esc(when)} &middot; ${esc(o.id)}</div>
        </div>
        <div style="color:var(--mgray);font-size:18px">&rsaquo;</div>
      </a>`;
    })
    .join('');

  box.innerHTML = truncated + header + rows + scanned;
}

async function loadClaims() {
  const list = document.getElementById('claims-list');
  if (!list) return;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    list.innerHTML =
      '<div style="text-align:center;color:var(--mgray);padding:40px;font-size:13px">Admin session expired - sign in again</div>';
    return;
  }
  const resp = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin-claims-list', access_token: session.access_token }),
  });
  const claims = resp.ok ? await resp.json() : null;
  if (!claims) {
    list.innerHTML =
      '<div style="text-align:center;color:var(--mgray);padding:40px;font-size:13px">Could not load claims - check that the claims table exists</div>';
    return;
  }
  if (!claims.length) {
    list.innerHTML =
      '<div style="text-align:center;padding:48px;color:var(--mgray)"><div style="font-size:36px;margin-bottom:8px">📭</div><div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:4px">No claims yet</div><div style="font-size:13px">Client warranty claims from /claims.html will appear here.</div></div>';
    return;
  }

  list.innerHTML = claims
    .map((c) => {
      const st = CLAIM_STATUS[c.status] || CLAIM_STATUS.new;
      const when = c.created_at
        ? new Date(c.created_at).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '—';
      const photos = (c.photo_urls || [])
        .map(
          (u) =>
            `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;border:1px solid var(--border)"></a>`
        )
        .join('');
      const invoice = c.invoice_url
        ? `<a href="${esc(c.invoice_url)}" target="_blank" rel="noopener" style="font-size:13px;color:var(--blue);text-decoration:underline">View invoice screenshot</a>`
        : '<span style="font-size:13px;color:var(--mgray)">No invoice attached</span>';
      return `
    <div style="background:var(--white);border:1px solid var(--border);border-left:3px solid ${st.color};border-radius:12px;padding:14px 16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="min-width:0">
          <div style="font-size:15px;font-weight:700;color:var(--navy)">${esc(c.client_name)}</div>
          <div style="font-size:13px;color:var(--mgray)">${esc(c.client_email)}${c.phone ? ' · ' + esc(c.phone) : ''} · submitted ${when}${c.service_date ? ' · service on ' + esc(c.service_date) : ''}</div>
        </div>
        <span style="background:${st.bg};color:${st.color};font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;flex-shrink:0">${st.label}</span>
      </div>
      <div style="font-size:13px;color:var(--gray);margin:10px 0;white-space:pre-wrap">${esc(c.description)}</div>
      ${photos ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">${photos}</div>` : ''}
      <div style="margin-bottom:12px">${invoice}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select data-claim-status="${esc(c.id)}" class="inp" aria-label="Claim status" style="width:auto;padding:7px 10px;font-size:13px;cursor:pointer">
          ${Object.entries(CLAIM_STATUS)
            .map(
              ([k, v]) =>
                `<option value="${k}"${k === c.status ? ' selected' : ''}>${v.label}</option>`
            )
            .join('')}
        </select>
        <input data-claim-notes="${esc(c.id)}" class="inp" placeholder="Resolution notes" aria-label="Resolution notes" value="${esc(c.resolution_notes || '')}" style="flex:1;min-width:180px;padding:7px 10px;font-size:13px">
        <button data-claim-save="${esc(c.id)}" style="background:var(--blue);color:#fff;border:none;border-radius:7px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Save</button>
      </div>
    </div>`;
    })
    .join('');

  list.querySelectorAll('[data-claim-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.claimSave;
      const status = list.querySelector(`[data-claim-status="${id}"]`).value;
      const notes = list.querySelector(`[data-claim-notes="${id}"]`).value;
      btn.disabled = true;
      btn.textContent = 'Saving...';
      const {
        data: { session: s2 },
      } = await sb.auth.getSession();
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'admin-claims-update',
          access_token: s2?.access_token,
          id,
          status,
          resolution_notes: notes,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast('Save failed: ' + (d.error || 'Unknown error'));
        btn.disabled = false;
        btn.textContent = 'Save';
        return;
      }
      showToast('Claim updated ✓');
      loadClaims();
    });
  });
}

// ── ESCALATION CONTACTS ───────────────────────────────────────────────────────
async function loadContacts() {
  const { data } = await sb
    .from('escalation_contacts')
    .select('*')
    .order('role')
    .order('first_name');
  const list = document.getElementById('contacts-list');
  if (!list) return;
  if (!data || data.length === 0) {
    list.innerHTML =
      '<div style="text-align:center;color:var(--mgray);padding:48px;font-size:15px">No contacts yet. Add your first contact above.</div>';
    return;
  }
  const roleColors = { manager: 'var(--blue)', mechanic: 'var(--green)' };
  const roleBg = { manager: 'var(--blue-tint)', mechanic: 'var(--green-tint)' };
  list.innerHTML = data
    .map(
      (c) => `
    <div style="background:var(--white);border-radius:12px;border:1px solid var(--border);padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:40px;height:40px;border-radius:50%;background:${roleBg[c.role] || 'var(--border-lt)'};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:${roleColors[c.role] || '#475569'};flex-shrink:0">
          ${c.first_name[0]}${c.last_name[0]}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600;color:var(--navy)">${c.first_name} ${c.last_name}</div>
          <div style="font-size:13px;color:var(--mgray)">${c.phone}</div>
          ${c.email ? `<div style="font-size:13px;color:var(--mgray)">${c.email}</div>` : ''}
        </div>
        <span style="background:${roleBg[c.role] || 'var(--border-lt)'};color:${roleColors[c.role] || '#475569'};font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;text-transform:capitalize;flex-shrink:0">${c.role}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button data-action="edit-contact" data-id="${c.id}" data-first-name="${esc(c.first_name)}" data-last-name="${esc(c.last_name)}" data-phone="${esc(c.phone)}" data-email="${esc(c.email || '')}" data-role="${esc(c.role)}" style="flex:1;background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:7px;padding:7px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif;font-weight:500">Edit</button>
        <button data-action="delete-contact" data-id="${c.id}" style="flex:1;background:#FEF2F2;border:1.5px solid var(--red-edge);color:var(--red);border-radius:7px;padding:7px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif;font-weight:500">Delete</button>
      </div>
    </div>`
    )
    .join('');
}

function openContactModal() {
  document.getElementById('modal-title').textContent = 'New Contact';
  document.getElementById('modal-id').value = '';
  document.getElementById('modal-fname').value = '';
  document.getElementById('modal-lname').value = '';
  document.getElementById('modal-phone').value = '';
  document.getElementById('modal-email').value = '';
  document.getElementById('modal-role').value = 'mechanic';
  document.getElementById('contact-modal').style.display = 'flex';
}

function closeContactModal() {
  document.getElementById('contact-modal').style.display = 'none';
}

function editContact(id, fname, lname, phone, email, role) {
  document.getElementById('modal-title').textContent = 'Edit Contact';
  document.getElementById('modal-id').value = id;
  document.getElementById('modal-fname').value = fname;
  document.getElementById('modal-lname').value = lname;
  document.getElementById('modal-phone').value = phone;
  document.getElementById('modal-email').value = email || '';
  document.getElementById('modal-role').value = role;
  document.getElementById('contact-modal').style.display = 'flex';
}

async function saveContact() {
  const id = document.getElementById('modal-id').value;
  const fname = document.getElementById('modal-fname').value.trim();
  const lname = document.getElementById('modal-lname').value.trim();
  const phone = document.getElementById('modal-phone').value.trim();
  const email = document.getElementById('modal-email').value.trim();
  const role = document.getElementById('modal-role').value;
  if (!fname || !lname || !phone) {
    showToast('Please fill all fields');
    return;
  }
  if (id) {
    await sb
      .from('escalation_contacts')
      .update({ first_name: fname, last_name: lname, phone, email: email || null, role })
      .eq('id', id);
    showToast('Contact updated ✓');
  } else {
    await sb.from('escalation_contacts').insert({
      first_name: fname,
      last_name: lname,
      phone,
      email: email || null,
      role,
      active: true,
    });
    showToast('Contact added ✓');
  }
  closeContactModal();
  loadContacts();
}

async function deleteContact(id) {
  if (!confirm('Delete this contact?')) return;
  await sb.from('escalation_contacts').delete().eq('id', id);
  showToast('Contact deleted');
  loadContacts();
}

// ── INVENTORY / SPARE PARTS ────────────────────────────────────────────────────
let inventoryData = [];
const PART_CATEGORIES = [
  'Brakes',
  'Drivetrain',
  'Wheels & Tyres',
  'Cockpit',
  'Cables',
  'Suspension',
  'Lubrication',
  'General',
];

async function loadInventory() {
  const tbody = document.getElementById('inv-tbody');
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--mgray)">Loading...</td></tr>';

  const { data, error } = await sb.from('parts_inventory').select('*').order('name');
  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--red)">Error: ${escapeHtml(error.message)}<br><small>Run the SQL migration first (see console)</small></td></tr>`;
    console.log(
      `SQL: CREATE TABLE parts_inventory (id uuid PRIMARY KEY, name text, category text, stock integer, min_stock integer, cost_price numeric, created_at timestamptz)`
    );
    return;
  }

  inventoryData = data || [];
  renderInventory();
}

function renderInventory() {
  const tbody = document.getElementById('inv-tbody');
  if (!tbody) return;

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);

  const totalParts = inventoryData.length;
  const lowStock = inventoryData.filter((p) => p.stock <= p.min_stock).length;
  const stockValue = inventoryData.reduce((s, p) => s + p.stock * (p.cost_price || 0), 0);

  document.getElementById('inv-total-parts').textContent = totalParts;
  document.getElementById('inv-low-stock').textContent = lowStock;
  document.getElementById('inv-stock-value').textContent = anMoney(stockValue);
  document.getElementById('inv-used-month').textContent = '$0'; // updated from bookings later

  if (!inventoryData.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div style="display:flex;flex-direction:column;align-items:center;padding:48px 24px;gap:10px">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      <div style="font-size:15px;font-weight:600;color:var(--mgray)">No parts yet</div>
      <div style="font-size:13px;color:var(--mgray);opacity:.7">Add your first part to start tracking stock</div>
    </div></td></tr>`;
    return;
  }

  const q = (document.getElementById('inv-search')?.value || '').trim().toLowerCase();
  const filtered = q
    ? inventoryData.filter((p) => p.name.toLowerCase().includes(q))
    : inventoryData;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--mgray)">No parts match "${escapeHtml(q)}"</td></tr>`;
    return;
  }

  const byCat = {};
  filtered.forEach((p) => {
    const cat = PART_CATEGORIES.includes(p.category) ? p.category : 'General';
    (byCat[cat] = byCat[cat] || []).push(p);
  });

  function partRow(p) {
    const isLow = p.stock <= p.min_stock;
    const isOut = p.stock === 0;
    const statusTxt = isOut ? '🔴 Out of stock' : isLow ? '🟡 Low stock' : '🟢 OK';
    const statusBg = isOut ? '#FEF2F2' : isLow ? 'var(--amber-tint)' : '#F0FDF4';
    const statusCl = isOut ? 'var(--red)' : isLow ? 'var(--amber-ink)' : 'var(--green)';
    return `<tr>
      <td data-label="Part" style="font-weight:600">${escapeHtml(p.name)}</td>
      <td data-label="Stock" style="font-weight:700;font-size:15px;color:${isLow ? 'var(--red)' : 'var(--navy)'}">${p.stock}</td>
      <td data-label="Min" style="color:var(--mgray)">${p.min_stock}</td>
      <td data-label="Cost">$${parseFloat(p.cost_price || 0).toFixed(2)}</td>
      <td data-label="Client price" style="font-weight:700;color:var(--blue)">${p.sell_price !== null && p.sell_price !== undefined ? '$' + parseFloat(p.sell_price).toFixed(2) : '—'}</td>
      <td data-label="Status"><span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:${statusBg};color:${statusCl}">${statusTxt}</span></td>
      <td data-label="Actions">
        <div style="display:flex;gap:6px">
          <button data-action="adjust-stock" data-id="${p.id}" data-stock="${p.stock}" data-delta="-1" style="background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:3px 10px;font-size:15px;cursor:pointer;font-weight:700">−</button>
          <button data-action="adjust-stock" data-id="${p.id}" data-stock="${p.stock}" data-delta="1"  style="background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:3px 10px;font-size:15px;cursor:pointer;font-weight:700">+</button>
          <button data-action="open-part-modal" data-id="${p.id}" style="background:var(--white);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:3px 8px;font-size:13px;cursor:pointer">Edit</button>
          <button data-action="delete-part" data-id="${p.id}" style="background:#FEF2F2;border:1.5px solid var(--red-edge);color:var(--red);border-radius:6px;padding:3px 8px;font-size:13px;cursor:pointer">✕</button>
        </div>
      </td>
    </tr>`;
  }

  tbody.innerHTML = PART_CATEGORIES.filter((cat) => byCat[cat]?.length)
    .map(
      (cat) =>
        `<tr><td colspan="7" style="background:var(--off);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--mgray);padding:8px 12px">${cat}</td></tr>` +
        byCat[cat].map(partRow).join('')
    )
    .join('');
}

async function adjustStock(id, current, delta) {
  const newStock = Math.max(0, current + delta);
  await sb.from('parts_inventory').update({ stock: newStock }).eq('id', id);
  const part = inventoryData.find((p) => p.id === id);
  if (part) part.stock = newStock;
  renderInventory();
}

function openPartModal(id) {
  const p = id ? inventoryData.find((x) => x.id === id) : null;
  const cats = PART_CATEGORIES;
  let modal = document.getElementById('part-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'part-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `<div style="background:var(--white);border-radius:16px;padding:24px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
    <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:16px">${p ? 'Edit part' : 'Add part'}</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Part name</div>
        <input class="inp" id="pm-name" value="${esc(p?.name || '')}" placeholder="e.g. Brake pads (Shimano B01S)" aria-label="Part name"></div>
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Category</div>
        <select class="inp" id="pm-cat" aria-label="Category" style="cursor:pointer">${cats.map((c) => `<option value="${c}"${(p?.category || 'General') === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Current stock</div>
          <input class="inp" id="pm-stock" type="number" min="0" value="${p?.stock || 0}" aria-label="Current stock"></div>
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Min stock</div>
          <input class="inp" id="pm-min" type="number" min="0" value="${p?.min_stock || 5}" aria-label="Min stock"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Cost price ($)</div>
          <input class="inp" id="pm-cost" type="number" min="0" step="0.01" value="${p?.cost_price || 0}" placeholder="0.00" aria-label="Cost price"></div>
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Client price ($)</div>
          <input class="inp" id="pm-sell" type="number" min="0" step="0.01" value="${p?.sell_price ?? ''}" placeholder="0.00" aria-label="Client price"></div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button data-action="close-part-modal" style="flex:1;background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">Cancel</button>
      <button data-action="save-part" data-id="${p?.id || ''}" style="flex:2;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">Save</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function savePart(id) {
  const name = document.getElementById('pm-name')?.value?.trim();
  const cat = document.getElementById('pm-cat')?.value;
  const stock = parseInt(document.getElementById('pm-stock')?.value || 0);
  const min = parseInt(document.getElementById('pm-min')?.value || 5);
  const cost = parseFloat(document.getElementById('pm-cost')?.value || 0);
  const sellRaw = document.getElementById('pm-sell')?.value;
  const sell = sellRaw === '' ? null : parseFloat(sellRaw);
  if (!name) {
    showToast('Part name is required');
    return;
  }

  const payload = {
    name,
    category: cat,
    stock,
    min_stock: min,
    cost_price: cost,
    sell_price: sell,
  };
  let error;
  if (id) {
    ({ error } = await sb.from('parts_inventory').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('parts_inventory').insert(payload));
  }
  if (error) {
    showToast('Save failed: ' + error.message);
    return;
  }
  document.getElementById('part-modal').remove();
  showToast(id ? 'Part updated ✓' : 'Part added ✓');
  loadInventory();
}

async function deletePart(id) {
  if (!confirm('Delete this part from inventory?')) return;
  await sb.from('parts_inventory').delete().eq('id', id);
  showToast('Part removed');
  loadInventory();
}

// ── SERVICES & PRICES ───────────────────────────────────────────────────────
// Single source of truth for every price shown on the site: PC (landing +
// suburb pages), the mobile SPA, the mechanic app and the chatbot all read
// this same `services` table. Editing here is the only place a price should
// ever be changed.
let servicesData = [];
const SERVICE_CATEGORIES = [
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

async function loadServices() {
  const tbody = document.getElementById('svc-tbody');
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--mgray)">Loading...</td></tr>';

  const { data, error } = await sb.from('services').select('*').order('name');
  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--red)">Error: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  servicesData = data || [];
  renderServices();
}

let _svcCategoryFilter = null;

function setServiceCategoryFilter(cat) {
  _svcCategoryFilter = _svcCategoryFilter === cat ? null : cat;
  renderServices();
}

function renderServiceCatChips() {
  const wrap = document.getElementById('svc-cat-chips');
  if (!wrap) return;
  const present = SERVICE_CATEGORIES.filter((cat) =>
    servicesData.some((s) => (s.category || 'General & assembly') === cat)
  );
  const chip = (label, cat, active) =>
    `<button data-action="set-service-category-filter" data-cat="${cat === null ? '' : esc(cat)}" style="height:30px;padding:0 14px;border-radius:15px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans);white-space:nowrap;border:1.5px solid ${active ? 'var(--blue)' : 'var(--border)'};background:${active ? 'var(--blue)' : 'var(--white)'};color:${active ? '#fff' : 'var(--navy)'}">${escapeHtml(label)}</button>`;
  wrap.innerHTML =
    chip('All', null, _svcCategoryFilter === null) +
    present.map((cat) => chip(cat, cat, _svcCategoryFilter === cat)).join('');
}

function renderServices() {
  const tbody = document.getElementById('svc-tbody');
  if (!tbody) return;

  const total = servicesData.length;
  const cats = new Set(servicesData.map((s) => s.category)).size;
  const avg = total ? servicesData.reduce((sum, s) => sum + (s.price || 0), 0) / total : 0;
  const prices = servicesData.map((s) => s.price || 0);

  document.getElementById('svc-total').textContent = total;
  document.getElementById('svc-cats').textContent = cats;
  document.getElementById('svc-avg').textContent = anMoney(avg);
  document.getElementById('svc-range').textContent = total
    ? '$' + Math.min(...prices) + ' - $' + Math.max(...prices)
    : '$—';

  renderServiceCatChips();

  if (!total) {
    tbody.innerHTML = `<tr><td colspan="5"><div style="display:flex;flex-direction:column;align-items:center;padding:48px 24px;gap:10px">
      <div style="font-size:15px;font-weight:600;color:var(--mgray)">No services yet</div>
      <div style="font-size:13px;color:var(--mgray);opacity:.7">Add your first service to start the catalog</div>
    </div></td></tr>`;
    applyDarkModeInline();
    return;
  }

  const q = (document.getElementById('svc-search')?.value || '').trim().toLowerCase();
  let filtered = q
    ? servicesData.filter(
        (s) => s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q)
      )
    : servicesData;
  if (_svcCategoryFilter) {
    filtered = filtered.filter((s) => (s.category || 'General & assembly') === _svcCategoryFilter);
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--mgray)">No services match "${escapeHtml(q)}"</td></tr>`;
    applyDarkModeInline();
    return;
  }

  const byCat = {};
  filtered.forEach((s) => {
    const cat = s.category || 'General & assembly';
    (byCat[cat] = byCat[cat] || []).push(s);
  });

  function durationLabel(s) {
    if (!s.duration_min && !s.duration_max) return '—';
    if (s.duration_min === s.duration_max) return s.duration_min + ' min';
    return `${s.duration_min || 0}-${s.duration_max || 0} min`;
  }

  function svcRow(s) {
    return `<tr>
      <td data-label="Service" style="font-weight:600;color:var(--navy)">${escapeHtml(s.name)}</td>
      <td data-label="Category" style="color:var(--mgray)">${escapeHtml(s.category || '')}</td>
      <td data-label="Price" style="font-weight:700;font-size:15px;color:var(--blue)">$${parseFloat(s.price || 0).toFixed(0)}</td>
      <td data-label="Duration" style="color:var(--mgray)">${durationLabel(s)}</td>
      <td data-label="Actions">
        <div style="display:flex;gap:6px">
          <button data-action="open-service-modal" data-id="${s.id}" style="background:var(--white);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:3px 8px;font-size:13px;cursor:pointer">Edit</button>
          <button data-action="delete-service" data-id="${s.id}" style="background:#FEF2F2;border:1.5px solid var(--red-edge);color:var(--red);border-radius:6px;padding:3px 8px;font-size:13px;cursor:pointer">✕</button>
        </div>
      </td>
    </tr>`;
  }

  tbody.innerHTML = SERVICE_CATEGORIES.filter((cat) => byCat[cat]?.length)
    .map(
      (cat) =>
        `<tr><td colspan="5" style="background:var(--off);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--navy);padding:8px 12px">${escapeHtml(cat)}</td></tr>` +
        byCat[cat].map(svcRow).join('')
    )
    .join('');

  applyDarkModeInline();
}

function openServiceModal(id) {
  const s = id ? servicesData.find((x) => x.id === id) : null;
  let modal = document.getElementById('service-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'service-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `<div style="background:var(--white);border-radius:16px;padding:24px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.2);max-height:90vh;overflow-y:auto">
    <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:16px">${s ? 'Edit service' : 'Add service'}</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Service name</div>
        <input class="inp" id="sm-name" value="${s?.name ? escapeHtml(s.name) : ''}" placeholder="e.g. Chain Install" aria-label="Service name"></div>
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Category</div>
        <select class="inp" id="sm-cat" aria-label="Category" style="cursor:pointer">${SERVICE_CATEGORIES.map((c) => `<option value="${c}"${(s?.category || SERVICE_CATEGORIES[0]) === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Price ($)</div>
        <input class="inp" id="sm-price" type="number" min="0" step="1" value="${s?.price ?? ''}" placeholder="0" aria-label="Price"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Min duration (min)</div>
          <input class="inp" id="sm-dmin" type="number" min="0" value="${s?.duration_min ?? ''}" aria-label="Min duration"></div>
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Max duration (min)</div>
          <input class="inp" id="sm-dmax" type="number" min="0" value="${s?.duration_max ?? ''}" aria-label="Max duration"></div>
      </div>
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Description</div>
        <input class="inp" id="sm-desc" value="${s?.description ? escapeHtml(s.description) : ''}" placeholder="Shown to clients when booking" aria-label="Description"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button data-action="close-service-modal" style="flex:1;background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">Cancel</button>
      <button data-action="save-service" data-id="${s?.id || ''}" style="flex:2;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">Save</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  applyDarkModeInline();
}

async function saveService(id) {
  const name = document.getElementById('sm-name')?.value?.trim();
  const category = document.getElementById('sm-cat')?.value;
  const priceRaw = document.getElementById('sm-price')?.value;
  const price = priceRaw === '' ? null : parseFloat(priceRaw);
  const dminRaw = document.getElementById('sm-dmin')?.value;
  const dmaxRaw = document.getElementById('sm-dmax')?.value;
  const description = document.getElementById('sm-desc')?.value?.trim();

  if (!name) {
    showToast('Service name is required');
    return;
  }
  if (price === null || Number.isNaN(price)) {
    showToast('Price is required');
    return;
  }

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    showToast('Your admin session expired - sign in again');
    return;
  }

  const resp = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'admin-services-save',
      access_token: session.access_token,
      id: id || null,
      name,
      category,
      price,
      duration_min: dminRaw === '' ? null : parseInt(dminRaw),
      duration_max: dmaxRaw === '' ? null : parseInt(dmaxRaw),
      description: description || null,
    }),
  });
  const result = await resp.json();
  if (!resp.ok) {
    showToast('Save failed: ' + (result.error || 'Unknown error'));
    return;
  }
  document.getElementById('service-modal').remove();
  showToast(id ? 'Service updated ✓' : 'Service added ✓');
  loadServices();
}

async function deleteService(id) {
  const s = servicesData.find((x) => x.id === id);
  if (!confirm(`Delete "${s?.name || 'this service'}"? It will disappear from booking everywhere.`))
    return;

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    showToast('Your admin session expired - sign in again');
    return;
  }

  const resp = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'admin-services-delete',
      access_token: session.access_token,
      id,
    }),
  });
  const result = await resp.json();
  if (!resp.ok) {
    showToast('Delete failed: ' + (result.error || 'Unknown error'));
    return;
  }
  showToast('Service removed');
  loadServices();
}

// ── CALENDAR ──────────────────────────────────────────────────────────────────
let calWeekStart = new Date();
let calView = 'month';
let calMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function startOfWeek(d) {
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Mon
  return new Date(d.setDate(diff));
}

function setCalView(view, btn) {
  calView = view;
  ['month', 'week', 'day'].forEach((v) => {
    const b = document.getElementById('cv-' + v);
    if (!b) return;
    b.style.background = v === view ? 'var(--blue)' : 'transparent';
    b.style.color = v === view ? '#fff' : 'var(--mgray)';
  });
  loadCalendar();
}

function calPrev() {
  if (calView === 'month') {
    calMonthDate = new Date(calMonthDate.getFullYear(), calMonthDate.getMonth() - 1, 1);
  } else if (calView === 'week') {
    calWeekStart.setDate(calWeekStart.getDate() - 7);
    calWeekStart = new Date(calWeekStart);
  } else {
    calWeekStart.setDate(calWeekStart.getDate() - 1);
    calWeekStart = new Date(calWeekStart);
  }
  loadCalendar();
}

function calNext() {
  if (calView === 'month') {
    calMonthDate = new Date(calMonthDate.getFullYear(), calMonthDate.getMonth() + 1, 1);
  } else if (calView === 'week') {
    calWeekStart.setDate(calWeekStart.getDate() + 7);
    calWeekStart = new Date(calWeekStart);
  } else {
    calWeekStart.setDate(calWeekStart.getDate() + 1);
    calWeekStart = new Date(calWeekStart);
  }
  loadCalendar();
}

async function loadCalendar() {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  if (calView === 'month') {
    const year = calMonthDate.getFullYear();
    const month = calMonthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dateFrom = firstDay.toISOString().split('T')[0];
    const dateTo = lastDay.toISOString().split('T')[0];
    const title = document.getElementById('cal-title');
    if (title)
      title.textContent = firstDay.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
    grid.innerHTML =
      '<div style="text-align:center;padding:30px;color:var(--mgray)">Loading...</div>';
    const { data: bookings } = await sb
      .from('bookings')
      .select('*, profiles(full_name)')
      .gte('scheduled_date', dateFrom)
      .lte('scheduled_date', dateTo)
      .neq('status', 'cancelled')
      .order('scheduled_time');
    const jobs = bookings || [];
    const stColors = {
      pending: 'var(--amber-bright)',
      confirmed: 'var(--blue)',
      enroute: 'var(--green)',
      completed: '#475569',
    };
    const stBg = {
      pending: 'var(--amber-tint)',
      confirmed: 'var(--blue-tint)',
      enroute: 'var(--green-tint)',
      completed: 'var(--border-lt)',
    };
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(firstDay);
    const dow = startDate.getDay();
    startDate.setDate(startDate.getDate() - (dow === 0 ? 6 : dow - 1));
    let html =
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);border:1px solid var(--border);border-radius:12px;overflow:hidden;min-width:560px">';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => {
      html += `<div style="padding:8px 4px;text-align:center;background:var(--off);border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--mgray);text-transform:uppercase">${d}</div>`;
    });
    const cur = new Date(startDate);
    let cells = 0;
    while (cur <= lastDay || cells % 7 !== 0) {
      const dateStr = cur.toISOString().split('T')[0];
      const isToday = dateStr === today;
      const isCurMonth = cur.getMonth() === month;
      const dayJobs = jobs.filter((j) => j.scheduled_date === dateStr);
      html += `<div style="min-height:80px;padding:6px;border-right:1px solid var(--border);border-bottom:1px solid var(--border)${isToday ? ';background:rgba(24,72,200,0.06)' : ''}">
        <div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;margin-bottom:4px;font-size:13px;font-weight:${isToday ? '700' : '400'};background:${isToday ? 'var(--blue)' : 'transparent'};color:${isToday ? '#fff' : isCurMonth ? 'var(--navy)' : 'var(--mgray)'}">${cur.getDate()}</div>
        ${dayJobs
          .slice(0, 3)
          .map((j) => {
            const st = j.status || 'pending';
            const nm = j.profiles?.full_name?.split(' ')[0] || 'Client';
            const tm = j.scheduled_time || '';
            return `<div style="font-size:11px;background:${stBg[st] || 'var(--border-lt)'};border-left:2px solid ${stColors[st] || '#475569'};border-radius:3px;padding:2px 4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" data-page="bookings">${tm} ${esc(nm)}</div>`;
          })
          .join('')}
        ${dayJobs.length > 3 ? `<div style="font-size:11px;color:var(--mgray)">+${dayJobs.length - 3} more</div>` : ''}
      </div>`;
      cur.setDate(cur.getDate() + 1);
      cells++;
    }
    html += '</div>';
    grid.innerHTML = html;
    return;
  }

  // Set week start to Monday
  calWeekStart = startOfWeek(new Date(calWeekStart));

  const days = calView === 'week' ? 7 : 1;
  const dateFrom = calWeekStart.toISOString().split('T')[0];
  const dateTo = new Date(new Date(calWeekStart).setDate(calWeekStart.getDate() + days - 1))
    .toISOString()
    .split('T')[0];

  const title = document.getElementById('cal-title');
  if (title) {
    if (calView === 'week') {
      title.textContent =
        calWeekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) +
        ' – ' +
        new Date(new Date(calWeekStart).setDate(calWeekStart.getDate() + 6)).toLocaleDateString(
          'en-AU',
          { day: 'numeric', month: 'short', year: 'numeric' }
        );
    } else {
      title.textContent = calWeekStart.toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  }

  grid.innerHTML =
    '<div style="text-align:center;padding:30px;color:var(--mgray)">Loading...</div>';

  const { data: bookings } = await sb
    .from('bookings')
    .select('*, profiles(full_name)')
    .gte('scheduled_date', dateFrom)
    .lte('scheduled_date', dateTo)
    .neq('status', 'cancelled')
    .order('scheduled_time');

  const jobs = bookings || [];

  // Build day columns
  const dayDates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(calWeekStart);
    d.setDate(d.getDate() + i);
    dayDates.push(d);
  }

  const stColors = {
    pending: 'var(--amber-bright)',
    confirmed: 'var(--blue)',
    enroute: 'var(--green)',
    completed: '#475569',
  };
  const stBg = {
    pending: 'var(--amber-tint)',
    confirmed: 'var(--blue-tint)',
    enroute: 'var(--green-tint)',
    completed: 'var(--border-lt)',
  };
  const today = new Date().toISOString().split('T')[0];

  const colWidth = calView === 'week' ? Math.floor(100 / days) : 100;

  let html = `<div style="display:flex;min-width:${calView === 'week' ? '700px' : '300px'};gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden">`;

  dayDates.forEach((d, i) => {
    const dateStr = d.toISOString().split('T')[0];
    const isToday = dateStr === today;
    const dayJobs = jobs.filter((j) => j.scheduled_date === dateStr);
    const dayName = d.toLocaleDateString('en-AU', { weekday: 'short' });
    const dayNum = d.getDate();

    html += `<div style="flex:1;min-width:0;border-right:${i < days - 1 ? '1px solid var(--border)' : 'none'}">
      <!-- Header -->
      <div style="padding:10px 8px;text-align:center;background:${isToday ? 'var(--blue)' : 'var(--off)'};border-bottom:1px solid var(--border)">
        <div style="font-size:11px;font-weight:600;color:${isToday ? 'rgba(255,255,255,0.8)' : 'var(--mgray)'};text-transform:uppercase">${dayName}</div>
        <div style="font-size:18px;font-weight:700;color:${isToday ? '#fff' : 'var(--navy)'}">${dayNum}</div>
        ${dayJobs.length > 0 ? `<div style="font-size:11px;color:${isToday ? 'rgba(255,255,255,0.7)' : 'var(--mgray)'};">${dayJobs.length} job${dayJobs.length > 1 ? 's' : ''}</div>` : ''}
      </div>
      <!-- Jobs -->
      <div style="padding:8px;display:flex;flex-direction:column;gap:6px;min-height:120px">
        ${
          dayJobs.length === 0
            ? `<div style="font-size:11px;color:var(--mgray);text-align:center;padding:16px 4px;opacity:.5">Free</div>`
            : dayJobs
                .map((j) => {
                  const st = j.status || 'pending';
                  const name = j.profiles?.full_name?.split(' ')[0] || 'Client';
                  const time = j.scheduled_time || '';
                  const van = j.van_number || 1;
                  return `<div style="background:${stBg[st] || 'var(--border-lt)'};border-left:3px solid ${stColors[st] || '#475569'};border-radius:6px;padding:6px 8px;cursor:pointer" data-page="bookings">
              <div style="font-size:11px;font-weight:700;color:${stColors[st] || '#475569'}">${time}</div>
              <div style="font-size:13px;font-weight:600;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div>
              <div style="font-size:11px;color:var(--mgray);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.service_name || '')}</div>
              <div style="font-size:11px;font-weight:600;color:${stColors[st]};margin-top:2px">Van ${van}</div>
            </div>`;
                })
                .join('')
        }
      </div>
    </div>`;
  });

  html += '</div>';
  grid.innerHTML = html;
}

// ── ADMIN CHAT ────────────────────────────────────────────────────────────────
let adminChatBookingId = null;
let adminChatChannel = null;

function openAdminChat(bookingId, clientName) {
  adminChatBookingId = bookingId;
  document.getElementById('admin-chat-title').textContent = `Job: ${clientName}`;
  document.getElementById('admin-chat-modal').style.display = 'flex';
  loadAdminChatMessages(bookingId);

  // Subscribe to realtime new messages
  if (adminChatChannel) sb.removeChannel(adminChatChannel);
  adminChatChannel = sb
    .channel('admin-chat-' + bookingId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'job_messages',
        filter: `booking_id=eq.${bookingId}`,
      },
      (payload) => appendAdminChatMsg(payload.new)
    )
    .subscribe();
}

function closeAdminChat() {
  document.getElementById('admin-chat-modal').style.display = 'none';
  if (adminChatChannel) {
    sb.removeChannel(adminChatChannel);
    adminChatChannel = null;
  }
  adminChatBookingId = null;
}

async function loadAdminChatMessages(bookingId) {
  const { data } = await sb
    .from('job_messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  const msgs = document.getElementById('admin-chat-msgs');
  if (!data?.length) {
    msgs.innerHTML =
      '<div style="text-align:center;color:var(--mgray);font-size:13px;padding:20px">No messages yet.</div>';
    return;
  }
  msgs.innerHTML = '';
  data.forEach((m) => appendAdminChatMsg(m, false));
  msgs.scrollTop = msgs.scrollHeight;
}

function appendAdminChatMsg(msg, scroll = true) {
  const msgs = document.getElementById('admin-chat-msgs');
  const isAdmin = msg.sender_role === 'admin';
  const isMech = msg.sender_role === 'mechanic';
  const isClient = msg.sender_role === 'client';
  const time = new Date(msg.created_at).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const bubble = document.createElement('div');
  bubble.style.cssText = `display:flex;flex-direction:column;align-items:${isAdmin ? 'flex-end' : 'flex-start'};gap:2px`;

  const label = isAdmin ? 'You (Admin)' : isMech ? '🔧 Mechanic' : '👤 Client';
  const bg = isAdmin ? 'var(--blue)' : 'var(--off)';
  const color = isAdmin ? '#fff' : 'var(--navy)';

  // Photo message
  const isPhoto = msg.message?.startsWith('[PHOTO:');
  const photoUrl = isPhoto ? msg.message.replace('[PHOTO:', '').replace(']', '') : null;

  bubble.innerHTML = `
    <div style="font-size:11px;color:var(--mgray);font-weight:600">${label}</div>
    ${
      isPhoto
        ? `<img src="${esc(photoUrl)}" style="max-width:200px;border-radius:10px;cursor:pointer" data-action="open-photo" data-url="${esc(photoUrl)}">`
        : `<div style="background:${bg};color:${color};padding:8px 12px;border-radius:12px;font-size:13px;max-width:280px;word-break:break-word">${esc(msg.message)}</div>`
    }
    <div style="font-size:11px;color:var(--mgray)">${time}</div>
  `;
  msgs.appendChild(bubble);
  if (scroll) msgs.scrollTop = msgs.scrollHeight;
}

async function sendAdminMsg() {
  if (!adminChatBookingId) return;
  const input = document.getElementById('admin-chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from('job_messages').insert({
    booking_id: adminChatBookingId,
    sender_role: 'admin',
    sender_id: u?.user?.id || null,
    message: text,
  });
  if (error) {
    input.value = text;
    alert('Could not send message: ' + error.message);
  }
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
const SETTING_KEYS = [
  '__biz_name__',
  '__biz_phone__',
  '__biz_email__',
  '__biz_abn__',
  '__whatsapp__',
];

async function loadSettings() {
  const { data: rows } = await sb
    .from('van_zones')
    .select('suburb,postcode')
    .eq('van_number', 0)
    .in('suburb', SETTING_KEYS);

  const map = {};
  (rows || []).forEach((r) => {
    map[r.suburb] = r.postcode;
  });

  const set = (id, key) => {
    const el = document.getElementById(id);
    if (el && map[key]) el.value = map[key];
  };
  set('set-biz-name', '__biz_name__');
  set('set-biz-phone', '__biz_phone__');
  set('set-biz-email', '__biz_email__');
  set('set-biz-abn', '__biz_abn__');

  const waInput = document.getElementById('wa-number-input');
  const waStatus = document.getElementById('wa-status');
  if (map['__whatsapp__']) {
    if (waInput) waInput.value = map['__whatsapp__'];
    if (waStatus) {
      waStatus.textContent = `Active ✓ — messages sent from ${map['__whatsapp__']}`;
      waStatus.style.color = 'var(--green)';
    }
    const twilioEl = document.getElementById('integ-twilio');
    if (twilioEl) {
      twilioEl.textContent = '✓ Active';
      twilioEl.style.color = 'var(--green)';
    }
  } else {
    if (waStatus) {
      waStatus.textContent = 'No number configured — WhatsApp messages are currently disabled.';
      waStatus.style.color = '';
    }
    const twilioEl = document.getElementById('integ-twilio');
    if (twilioEl) {
      twilioEl.textContent = 'SMS only (no WhatsApp number)';
      twilioEl.style.color = 'var(--amber-bright)';
    }
  }

  // Load notification numbers
  loadNotifNumbers();

  // Load alert triggers
  loadTriggers();

  // Check Twilio status dynamically
  checkTwilioStatus();
}

async function saveWhatsappNumber() {
  const raw = (document.getElementById('wa-number-input')?.value || '').trim();
  if (!raw) {
    showToast('Enter a phone number first');
    return;
  }
  const normalized = raw.startsWith('+')
    ? raw
    : raw.startsWith('0')
      ? '+61' + raw.slice(1)
      : '+61' + raw;
  if (!/^\+61\d{9}$/.test(normalized)) {
    showToast('Enter a valid AU mobile number (+61XXXXXXXXX)');
    return;
  }

  const { error } = await sb
    .from('van_zones')
    .upsert(
      { van_number: 0, suburb: '__whatsapp__', postcode: normalized, active: true },
      { onConflict: 'van_number,suburb' }
    );
  if (error) {
    showToast('Save failed: ' + error.message);
    return;
  }

  document.getElementById('wa-number-input').value = normalized;
  const waStatus = document.getElementById('wa-status');
  if (waStatus) {
    waStatus.textContent = `Active ✓ — messages sent from ${normalized}`;
    waStatus.style.color = 'var(--green)';
  }
  const twilioEl = document.getElementById('integ-twilio');
  if (twilioEl) {
    twilioEl.textContent = '✓ Active';
    twilioEl.style.color = 'var(--green)';
  }
  showToast('WhatsApp number saved ✓');
}

async function saveBusinessDetails() {
  const fields = [
    { key: '__biz_name__', id: 'set-biz-name' },
    { key: '__biz_phone__', id: 'set-biz-phone' },
    { key: '__biz_email__', id: 'set-biz-email' },
    { key: '__biz_abn__', id: 'set-biz-abn' },
  ];
  const rows = fields.map((f) => ({
    van_number: 0,
    suburb: f.key,
    postcode: (document.getElementById(f.id)?.value || '').trim().slice(0, 200),
    active: true,
  }));
  const { error } = await sb.from('van_zones').upsert(rows, { onConflict: 'van_number,suburb' });
  if (error) {
    showToast('Save failed: ' + error.message);
    return;
  }
  showToast('Business details saved ✓');
}

async function checkTwilioStatus() {
  const el = document.getElementById('integ-twilio');
  if (!el) return;
  try {
    // Intentar llamar a la API de SMS — si responde (aunque sea error de params) Twilio está configurado
    const res = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _ping: true }),
    });
    const data = await res.json().catch(() => ({}));
    // Si el error es "Missing phone" y no "Twilio not configured", las keys están ok
    if (res.status === 400 || res.status === 200) {
      // Verificar si hay número WhatsApp configurado
      const { data: waRow } = await sb
        .from('van_zones')
        .select('postcode')
        .eq('suburb', '__whatsapp__')
        .eq('van_number', 0)
        .maybeSingle();
      if (waRow?.postcode) {
        el.textContent = '✓ SMS + WhatsApp';
        el.style.color = 'var(--green)';
      } else {
        el.textContent = '✓ SMS active';
        el.style.color = 'var(--green)';
      }
    } else {
      el.textContent = '⚠ Needs keys';
      el.style.color = 'var(--amber-bright)';
    }
  } catch (e) {
    el.textContent = '⚠ Needs keys';
    el.style.color = 'var(--amber-bright)';
  }
}

// ── MEMBERSHIPS ───────────────────────────────────────────────────────────────
// List prices, monthly and annual. The same numbers as landing.html's
// PLAN_PRICES and terms.html - Stripe is the real source and nothing serves
// them to the browser, so they live in more than one place. That is exactly how
// a $57/$147 bump once shipped while this screen kept doing its maths on the
// old figures (CLAUDE.md, 2026-07-22). Change one, grep the number everywhere.
const PLAN_PRICES = {
  basic: { name: 'Basic', monthly: 67, annual: 643 },
  standard: { name: 'Standard', monthly: 97, annual: 931 },
  vip: { name: 'VIP', monthly: 197, annual: 1891 },
};

// What one active member is worth per month. An annual member contributes their
// yearly price spread over twelve months: counting a $1,891/yr VIP at $197/mo
// overstated MRR by $39.42 for every one of them. The term is in
// `membership_billing` ('monthly' | 'annual', see api/_validate.js), written by
// api/stripe-webhook.js and, until this change, read by nothing at all.
//
// No recorded term is treated as monthly, which is what the row was worth
// before - it is the status quo, not a guess dressed up as data. An unknown
// plan is worth zero and gets counted separately rather than silently dropped.
function memberMonthlyValue(m) {
  const p = PLAN_PRICES[m.membership_plan];
  if (!p) return 0;
  return m.membership_billing === 'annual' ? p.annual / 12 : p.monthly;
}

async function loadMemberships() {
  const tbody = document.getElementById('mem-tbody');
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--mgray)">Loading...</td></tr>';

  const planFilter = document.getElementById('mem-filter-plan')?.value || '';
  const statusFilter = document.getElementById('mem-filter-status')?.value || '';

  let query = sb
    .from('profiles')
    .select(
      // membership_billing is what tells an annual member from a monthly one.
      // It was missing here, so every annual subscriber arrived looking monthly
      // and the MRR below could not have been right no matter how it was summed.
      'full_name,email,membership_plan,membership_status,membership_billing,membership_started_at,membership_renewed_at,stripe_subscription_id'
    )
    .not('membership_status', 'is', null)
    .neq('membership_status', 'none');

  if (planFilter) query = query.eq('membership_plan', planFilter);
  if (statusFilter) query = query.eq('membership_status', statusFilter);

  const { data, error } = await query.order('membership_started_at', { ascending: false });

  if (error) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:40px;color:red">Error: ' +
      error.message +
      '</td></tr>';
    return;
  }

  const activeMembers = (data || []).filter((m) => m.membership_status === 'active');
  const active = activeMembers.length;
  const pastDue = (data || []).filter((m) => m.membership_status === 'past_due').length;
  const mrr = activeMembers.reduce((s, m) => s + memberMonthlyValue(m), 0);
  // Same idea as anCalloutGaps(): a plan we cannot price contributes zero and
  // is named, rather than being absorbed into the total.
  const unpriced = activeMembers.filter((m) => !PLAN_PRICES[m.membership_plan]).length;

  const kpiActive = document.getElementById('mem-kpi-active');
  const kpiPastdue = document.getElementById('mem-kpi-pastdue');
  const kpiMrr = document.getElementById('mem-kpi-mrr');
  if (kpiActive) kpiActive.textContent = active;
  if (kpiPastdue) kpiPastdue.textContent = pastDue;
  if (kpiMrr) {
    kpiMrr.textContent = '$' + Math.round(mrr).toLocaleString('en-AU') + '/mo';
    kpiMrr.title = unpriced
      ? `${unpriced} active membership(s) on an unknown plan are counted as $0`
      : '';
  }

  if (!data?.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:48px;color:var(--mgray);font-size:15px">No active memberships yet</td></tr>';
    return;
  }

  // Built from PLAN_PRICES so the label can never drift from the maths above.
  const planLabel = Object.fromEntries(
    Object.entries(PLAN_PRICES).map(([k, p]) => [k, `${p.name} $${p.monthly}`])
  );
  const statusBadge = {
    active:
      '<span style="background:var(--green-lt);color:var(--green);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">Active</span>',
    past_due:
      '<span style="background:var(--amber-lt);color:var(--amber);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">Past Due</span>',
    cancelled:
      '<span style="background:var(--red-lt);color:var(--red);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">Cancelled</span>',
    paused:
      '<span style="background:var(--border-lt);color:var(--gray);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">Paused</span>',
  };

  tbody.innerHTML = data
    .map((m) => {
      const name = m.full_name || m.email?.split('@')[0] || '—';
      // Show what this member actually pays. Printing the monthly list price
      // next to an annual subscriber is the display half of the same mistake
      // the MRR sum was making.
      const planInfo = PLAN_PRICES[m.membership_plan];
      const plan = planInfo
        ? m.membership_billing === 'annual'
          ? `${planInfo.name} $${planInfo.annual.toLocaleString('en-AU')}/yr`
          : `${planInfo.name} $${planInfo.monthly}/mo`
        : planLabel[m.membership_plan] || m.membership_plan || '—';
      const badge = statusBadge[m.membership_status] || m.membership_status || '—';
      const started = m.membership_started_at
        ? new Date(m.membership_started_at).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '—';
      const renewed = m.membership_renewed_at
        ? new Date(m.membership_renewed_at).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '—';
      const subId = m.stripe_subscription_id
        ? '<span style="font-size:11px;color:var(--mgray);font-family:monospace">' +
          m.stripe_subscription_id +
          '</span>'
        : '—';
      return (
        '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:12px 16px;font-weight:600;color:var(--navy)">' +
        esc(name) +
        '</td>' +
        '<td style="padding:12px 16px;font-size:13px;color:var(--mgray)">' +
        esc(m.email || '—') +
        '</td>' +
        '<td style="padding:12px 16px">' +
        plan +
        '</td>' +
        '<td style="padding:12px 16px">' +
        badge +
        '</td>' +
        '<td style="padding:12px 16px;font-size:13px;white-space:nowrap">' +
        started +
        '</td>' +
        '<td style="padding:12px 16px;font-size:13px;white-space:nowrap">' +
        renewed +
        '</td>' +
        '<td style="padding:12px 16px">' +
        subId +
        '</td>' +
        '</tr>'
      );
    })
    .join('');
}

// ── NOTIFICATION NUMBERS ──────────────────────────────────────────────────────
// Stored in escalation_contacts with role='manager' or role='mechanic'
// and a new 'zone' field (1, 2, or 'all') and 'channel' field (sms/whatsapp/both)

async function loadNotifNumbers() {
  const list = document.getElementById('notif-numbers-list');
  if (!list) return;
  list.innerHTML =
    '<div style="text-align:center;color:var(--mgray);padding:20px;font-size:13px">Loading…</div>';

  const { data, error } = await sb
    .from('escalation_contacts')
    .select('*')
    .order('role')
    .order('first_name');
  if (error || !data || data.length === 0) {
    list.innerHTML =
      '<div style="text-align:center;color:var(--mgray);padding:24px;font-size:13px">No numbers yet — add your first one above.</div>';
    return;
  }

  const zoneLabel = { 1: 'Van 1', 2: 'Van 2', all: 'All zones', '': 'All zones' };
  const zoneBg = { 1: 'var(--blue-tint)', 2: '#F0FDF4', all: 'var(--amber-tint)', '': 'var(--amber-tint)' };
  const zoneColor = {
    1: 'var(--blue)',
    2: 'var(--green)',
    all: 'var(--amber-ink)',
    '': 'var(--amber-ink)',
  };
  const channelIcon = { sms: '📱', whatsapp: '💬', both: '📱💬' };
  const roleIcon = { manager: '⭐', mechanic: '🔧' };

  list.innerHTML = data
    .map((c) => {
      const zone = c.zone || 'all';
      const channel = c.channel || 'sms';
      const initials = ((c.first_name || '?')[0] + (c.last_name || '')[0]).toUpperCase();
      return `
    <div style="padding:12px 14px;background:var(--off);border-radius:10px;border:1px solid var(--border)">
      <!-- Fila 1: avatar + nombre + zona badge -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:36px;height:36px;border-radius:50%;background:${zoneBg[zone]};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${zoneColor[zone]};flex-shrink:0">${esc(initials)}</div>
        <div style="font-size:15px;font-weight:600;color:var(--navy);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${roleIcon[c.role] || ''} ${esc(c.first_name)} ${esc(c.last_name)}</div>
        <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:${zoneBg[zone]};color:${zoneColor[zone]};white-space:nowrap;flex-shrink:0">${zoneLabel[zone]}</span>
      </div>
      <!-- Fila 2: teléfono + canal + botones -->
      <div style="display:flex;align-items:center;gap:8px;padding-left:46px">
        <span style="font-size:13px;color:var(--mgray);flex:1">${c.phone} · ${channelIcon[channel]} ${channel.toUpperCase()}</span>
        <button data-action="edit-notif-number" data-id="${c.id}"
          style="background:var(--white);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:4px 12px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif;font-weight:500;white-space:nowrap">Edit</button>
        <button data-action="delete-notif-number" data-id="${c.id}"
          style="background:#FEF2F2;border:1.5px solid var(--red-edge);color:var(--red);border-radius:6px;padding:4px 10px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif;font-weight:500">✕</button>
      </div>
    </div>`;
    })
    .join('');
}

function openNotifModal() {
  document.getElementById('notif-modal-title').textContent = 'Add notification number';
  document.getElementById('notif-modal-id').value = '';
  document.getElementById('notif-modal-name').value = '';
  document.getElementById('notif-modal-phone').value = '';
  document.getElementById('notif-modal-role').value = 'mechanic';
  document.getElementById('notif-modal-zone').value = '1';
  document.getElementById('notif-modal-channel').value = 'sms';
  const pinBtn = document.getElementById('notif-modal-pin-btn');
  pinBtn.disabled = true;
  pinBtn.textContent = 'Generate PIN';
  document.getElementById('notif-modal-pin-status').textContent =
    'Save the contact first to set a PIN';
  updateZoneVisibility();
  document.getElementById('notif-modal').style.display = 'flex';
}

function closeNotifModal() {
  document.getElementById('notif-modal').style.display = 'none';
}

function updateZoneVisibility() {
  const role = document.getElementById('notif-modal-role').value;
  const zoneWrap = document.getElementById('notif-modal-zone-wrap');
  const pinWrap = document.getElementById('notif-modal-pin-wrap');
  if (zoneWrap) zoneWrap.style.display = role === 'manager' ? 'none' : 'block';
  if (pinWrap) pinWrap.style.display = role === 'mechanic' ? 'block' : 'none';
}

async function editNotifNumber(id) {
  const { data: c, error } = await sb.from('escalation_contacts').select('*').eq('id', id).single();
  if (error || !c) {
    showToast('Could not load contact: ' + (error?.message || 'not found'));
    return;
  }
  document.getElementById('notif-modal-title').textContent = 'Edit notification number';
  document.getElementById('notif-modal-id').value = c.id;
  document.getElementById('notif-modal-name').value = [c.first_name, c.last_name]
    .filter(Boolean)
    .join(' ');
  document.getElementById('notif-modal-phone').value = c.phone || '';
  document.getElementById('notif-modal-role').value = c.role || 'mechanic';
  document.getElementById('notif-modal-zone').value = c.zone || '1';
  document.getElementById('notif-modal-channel').value = c.channel || 'sms';
  const pinBtn = document.getElementById('notif-modal-pin-btn');
  pinBtn.disabled = false;
  pinBtn.textContent = c.pin_hash ? 'Reset PIN' : 'Generate PIN';
  document.getElementById('notif-modal-pin-status').textContent = c.pin_hash
    ? 'PIN is set'
    : 'No PIN set yet - mechanic cannot log in';
  updateZoneVisibility();
  document.getElementById('notif-modal').style.display = 'flex';
}

// Server hop is required: pin_hash is an HMAC keyed on the service key, which
// the admin panel's browser client (anon key only) cannot compute (see
// handleAdminSetMechanicPin in api/auth.js). The plaintext PIN is shown here
// exactly once via alert() - deliberately not a toast, since it must not
// auto-dismiss before the admin can copy it down for the mechanic.
async function generateMechanicPin() {
  const id = document.getElementById('notif-modal-id').value;
  if (!id) return;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    showToast('Admin session expired - sign in again');
    return;
  }
  const btn = document.getElementById('notif-modal-pin-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'admin-set-mechanic-pin',
        access_token: session.access_token,
        contact_id: id,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      showToast('Could not set PIN: ' + (data.error || 'unknown error'));
      return;
    }
    document.getElementById('notif-modal-pin-status').textContent = 'PIN is set';
    alert(
      `Login PIN for mechanic.html: ${data.pin}\n\nShare this with the mechanic now - it won't be shown again.`
    );
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reset PIN';
  }
}

async function uploadMechanicPhoto(file, contactId) {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `profiles/${contactId || 'new'}_${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('job-photos').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = sb.storage.from('job-photos').getPublicUrl(path);
  return urlData?.publicUrl || null;
}

async function saveNotifNumber() {
  const id = document.getElementById('notif-modal-id').value;
  const fullName = document.getElementById('notif-modal-name').value.trim();
  const phone = document.getElementById('notif-modal-phone').value.trim();
  const role = document.getElementById('notif-modal-role').value;
  const zone = role === 'manager' ? 'all' : document.getElementById('notif-modal-zone').value;
  const channel = document.getElementById('notif-modal-channel').value;

  if (!fullName || !phone) {
    showToast('Name and phone are required');
    return;
  }

  const parts = fullName.split(' ');
  const fname = parts[0];
  const lname = parts.slice(1).join(' ') || '-';

  const payload = { first_name: fname, last_name: lname, phone, role, zone, channel, active: true };

  let error, newId;
  if (id) {
    ({ error } = await sb.from('escalation_contacts').update(payload).eq('id', id));
  } else {
    const result = await sb.from('escalation_contacts').insert(payload).select('id').single();
    error = result.error;
    newId = result.data?.id;
  }

  if (error) {
    showToast('Save failed: ' + error.message);
    return;
  }
  closeNotifModal();
  showToast(id ? 'Number updated ✓' : 'Number added ✓');
  loadNotifNumbers();

  // Brand-new mechanic: generate their login PIN right away instead of
  // making the admin reopen Edit just to set one - onboarding in one step.
  if (!id && role === 'mechanic' && newId) {
    document.getElementById('notif-modal-id').value = newId;
    await generateMechanicPin();
  }
}

async function deleteNotifNumber(id) {
  if (!confirm('Remove this notification number?')) return;
  await sb.from('escalation_contacts').delete().eq('id', id);
  showToast('Number removed');
  loadNotifNumbers();
}

// ── MECHANIC PROFILE (client-facing photo/bio, separate from notification role) ─────
async function loadMechanicProfiles() {
  const list = document.getElementById('mech-profile-list');
  if (!list) return;
  list.innerHTML =
    '<div style="text-align:center;color:var(--mgray);padding:20px;font-size:13px">Loading…</div>';

  const { data: contacts, error } = await sb
    .from('escalation_contacts')
    .select('*')
    .order('first_name');
  if (error || !contacts || contacts.length === 0) {
    list.innerHTML =
      '<div style="text-align:center;color:var(--mgray);padding:24px;font-size:13px">No contacts yet — add one in Notification Numbers first.</div>';
    return;
  }

  const { data: bookings } = await sb
    .from('bookings')
    .select('mechanic_id,status,client_rating')
    .not('mechanic_id', 'is', null);

  list.innerHTML = contacts
    .map((c) => {
      const jobs = (bookings || []).filter(
        (b) => b.mechanic_id === c.id && b.status === 'completed'
      );
      const rated = jobs.filter((b) => b.client_rating !== null && b.client_rating !== undefined);
      const rating = rated.length
        ? Math.round((rated.reduce((s, b) => s + b.client_rating, 0) / rated.length) * 10) / 10
        : null;
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed contact';
      const initials = ((c.first_name || '?')[0] + (c.last_name || '')[0]).toUpperCase();
      const avatarHTML = c.photo_url
        ? `<img src="${esc(c.photo_url)}" alt="${esc(name)}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--white);box-shadow:0 2px 8px rgba(0,0,0,0.15)">`
        : `<div style="width:80px;height:80px;border-radius:50%;background:#EFF6FF;border:3px solid var(--white);box-shadow:0 2px 8px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:var(--blue)">${esc(initials)}</div>`;
      const roleTag =
        c.role === 'manager'
          ? '<span style="position:absolute;top:10px;right:10px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:var(--amber-lt);color:var(--amber-ink)">⭐ Manager</span>'
          : '<span style="position:absolute;top:10px;right:10px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:var(--green-lt);color:var(--green)">🔧 Mechanic</span>';

      return `
    <div class="card" style="padding:0;overflow:hidden;width:300px;position:relative">
      ${roleTag}
      <div style="height:90px;width:100%;overflow:hidden;background:#EFF6FF">
        <img src="images/mechanic-working.webp" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
      </div>
      <div style="display:flex;justify-content:center;margin-top:-40px">${avatarHTML}</div>
      <div style="text-align:center;padding:10px 20px 0">
        <div style="font-size:15px;font-weight:700;color:var(--navy)">${esc(name)}</div>
        <div style="font-size:13px;color:var(--mgray);margin-top:2px">Dr. Bike Mobile Mechanic</div>
        <div style="font-size:13px;color:var(--gray);margin-top:8px;min-height:20px">${esc(c.bio) || '<span style="color:var(--mgray);font-style:italic">No bio yet — add one so clients feel confident.</span>'}</div>
      </div>
      <div style="display:flex;justify-content:center;gap:24px;padding:14px 20px;margin-top:8px;border-top:1px solid var(--border)">
        <div style="text-align:center"><div style="font-weight:800;font-size:15px;color:var(--navy)">${jobs.length}</div><div style="font-size:11px;color:var(--mgray)">Jobs done</div></div>
        <div style="width:1px;background:var(--border)"></div>
        <div style="text-align:center"><div style="font-weight:800;font-size:15px;color:var(--navy)">${rating ? '★ ' + rating : '—'}</div><div style="font-size:11px;color:var(--mgray)">Rating</div></div>
      </div>
      <div style="padding:14px 20px">
        <button data-action="open-mech-profile-modal" data-id="${c.id}" style="width:100%;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:11px;font-weight:700;font-size:13px;cursor:pointer;font-family:var(--sans)">Edit profile</button>
      </div>
    </div>`;
    })
    .join('');
}

function openMechProfileModal(id) {
  sb.from('escalation_contacts')
    .select('*')
    .eq('id', id)
    .single()
    .then(({ data: c, error }) => {
      if (error || !c) {
        showToast('Could not load contact: ' + (error?.message || 'not found'));
        return;
      }
      _pendingCroppedPhotoBlob = null;
      document.getElementById('mech-profile-modal-id').value = c.id;
      document.getElementById('mech-profile-modal-name').value = [c.first_name, c.last_name]
        .filter(Boolean)
        .join(' ');
      document.getElementById('mech-profile-modal-photo-file').value = '';
      document.getElementById('mech-profile-modal-photo-url').value = c.photo_url || '';
      const preview = document.getElementById('mech-profile-modal-photo-preview');
      if (c.photo_url) {
        preview.src = c.photo_url;
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
      document.getElementById('mech-profile-modal-bio').value = c.bio || '';
      document.getElementById('mech-profile-modal-van').value =
        c.van_number !== null ? String(c.van_number) : '';
      document.getElementById('mech-profile-modal').style.display = 'flex';
    });
}

function closeMechProfileModal() {
  document.getElementById('mech-profile-modal').style.display = 'none';
}

function previewMechProfilePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  openPhotoCropModal(file);
}

async function saveMechProfile() {
  const id = document.getElementById('mech-profile-modal-id').value;
  const fullName = document.getElementById('mech-profile-modal-name').value.trim();
  const bio = document.getElementById('mech-profile-modal-bio').value.trim();
  const vanRaw = document.getElementById('mech-profile-modal-van').value;
  const van_number = vanRaw ? parseInt(vanRaw, 10) : null;

  if (!fullName) {
    showToast('Name is required');
    return;
  }
  const parts = fullName.split(' ');
  const first_name = parts[0];
  const last_name = parts.slice(1).join(' ') || '-';

  let photo_url = document.getElementById('mech-profile-modal-photo-url').value || null;
  if (_pendingCroppedPhotoBlob) {
    try {
      const file = new File([_pendingCroppedPhotoBlob], 'profile.jpg', { type: 'image/jpeg' });
      photo_url = await uploadMechanicPhoto(file, id);
    } catch (e) {
      showToast('Photo upload failed: ' + e.message);
      return;
    }
  }

  const { error } = await sb
    .from('escalation_contacts')
    .update({ first_name, last_name, photo_url, bio: bio || null, van_number })
    .eq('id', id);

  if (error) {
    showToast('Save failed: ' + error.message);
    return;
  }
  _pendingCroppedPhotoBlob = null;
  closeMechProfileModal();
  showToast('Mechanic profile updated ✓');
  loadMechanicProfiles();
}

// ── Photo crop tool (drag to reposition, scroll/slider to zoom, matches the
// circular avatar clients will see) ──────────────────────────────────────────
const CROP_SIZE = 280;
const CROP_OUTPUT_SIZE = 400;
let _pendingCroppedPhotoBlob = null;
const _cropState = {
  naturalW: 0,
  naturalH: 0,
  baseScale: 1,
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  startX: 0,
  startY: 0,
  startPanX: 0,
  startPanY: 0,
};
let _cropObjectUrl = null;

function openPhotoCropModal(file) {
  const img = document.getElementById('crop-img');
  if (_cropObjectUrl) URL.revokeObjectURL(_cropObjectUrl);
  _cropObjectUrl = URL.createObjectURL(file);
  img.onload = () => {
    _cropState.naturalW = img.naturalWidth;
    _cropState.naturalH = img.naturalHeight;
    _cropState.baseScale = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
    _cropState.zoom = 1;
    _cropState.panX = 0;
    _cropState.panY = 0;
    document.getElementById('crop-zoom-slider').value = 0;
    applyCropTransform();
    document.getElementById('photo-crop-modal').style.display = 'flex';
  };
  img.src = _cropObjectUrl;
}

function closePhotoCropModal() {
  document.getElementById('photo-crop-modal').style.display = 'none';
  document.getElementById('mech-profile-modal-photo-file').value = '';
}

function applyCropTransform() {
  const img = document.getElementById('crop-img');
  const scale = _cropState.baseScale * _cropState.zoom;
  img.style.width = _cropState.naturalW * scale + 'px';
  img.style.height = _cropState.naturalH * scale + 'px';
  img.style.transform = `translate(calc(-50% + ${_cropState.panX}px), calc(-50% + ${_cropState.panY}px))`;
}

function clampCropPan() {
  const scale = _cropState.baseScale * _cropState.zoom;
  const dispW = _cropState.naturalW * scale;
  const dispH = _cropState.naturalH * scale;
  const maxPanX = Math.max(0, (dispW - CROP_SIZE) / 2);
  const maxPanY = Math.max(0, (dispH - CROP_SIZE) / 2);
  _cropState.panX = Math.max(-maxPanX, Math.min(maxPanX, _cropState.panX));
  _cropState.panY = Math.max(-maxPanY, Math.min(maxPanY, _cropState.panY));
}

function confirmPhotoCrop() {
  const img = document.getElementById('crop-img');
  const canvas = document.createElement('canvas');
  canvas.width = CROP_OUTPUT_SIZE;
  canvas.height = CROP_OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  const ratio = CROP_OUTPUT_SIZE / CROP_SIZE;
  const scale = _cropState.baseScale * _cropState.zoom;
  const dispW = _cropState.naturalW * scale * ratio;
  const dispH = _cropState.naturalH * scale * ratio;
  const dx = CROP_OUTPUT_SIZE / 2 + _cropState.panX * ratio - dispW / 2;
  const dy = CROP_OUTPUT_SIZE / 2 + _cropState.panY * ratio - dispH / 2;
  ctx.drawImage(img, dx, dy, dispW, dispH);
  canvas.toBlob(
    (blob) => {
      _pendingCroppedPhotoBlob = blob;
      const previewUrl = URL.createObjectURL(blob);
      const preview = document.getElementById('mech-profile-modal-photo-preview');
      preview.src = previewUrl;
      preview.style.display = 'block';
      document.getElementById('photo-crop-modal').style.display = 'none';
    },
    'image/jpeg',
    0.9
  );
}

(function initCropViewportEvents() {
  const viewport = document.getElementById('crop-viewport');
  if (!viewport) return;

  viewport.addEventListener('pointerdown', (e) => {
    _cropState.dragging = true;
    _cropState.startX = e.clientX;
    _cropState.startY = e.clientY;
    _cropState.startPanX = _cropState.panX;
    _cropState.startPanY = _cropState.panY;
    viewport.setPointerCapture(e.pointerId);
    viewport.style.cursor = 'grabbing';
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!_cropState.dragging) return;
    _cropState.panX = _cropState.startPanX + (e.clientX - _cropState.startX);
    _cropState.panY = _cropState.startPanY + (e.clientY - _cropState.startY);
    clampCropPan();
    applyCropTransform();
  });
  const endCropDrag = () => {
    _cropState.dragging = false;
    viewport.style.cursor = 'grab';
  };
  viewport.addEventListener('pointerup', endCropDrag);
  viewport.addEventListener('pointerleave', endCropDrag);
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const slider = document.getElementById('crop-zoom-slider');
      const v = Math.max(0, Math.min(100, Number(slider.value) - Math.sign(e.deltaY) * 5));
      slider.value = v;
      slider.dispatchEvent(new Event('input'));
    },
    { passive: false }
  );

  document.getElementById('crop-zoom-slider').addEventListener('input', (e) => {
    _cropState.zoom = 1 + (Number(e.target.value) / 100) * 2;
    clampCropPan();
    applyCropTransform();
  });
})();

// ── INIT ──────────────────────────────────────────────────────────────────────
// ── View client bikes modal ───────────────────────────────────────────────────
async function viewClientBikes(clientId, clientName) {
  const { data: bikes } = await sb
    .from('bikes')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  const TYPE_LABELS = {
    road: 'Road',
    mtb: 'MTB',
    hybrid: 'Hybrid',
    ebike: 'E-Bike',
    cargo: 'Cargo',
    folding: 'Folding',
  };
  const bikeRows =
    (bikes || []).length === 0
      ? '<p style="color:var(--mgray);font-size:15px;text-align:center;padding:20px">No bikes registered yet.</p>'
      : (bikes || [])
          .map(
            (b) => `
        <div style="background:var(--off);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px">
          <div style="font-weight:700;font-size:15px">${esc(b.nickname)}</div>
          <div style="font-size:13px;color:var(--mgray);margin-top:3px">
            ${[b.year, b.brand, b.model, b.color, TYPE_LABELS[b.bike_type]].filter(Boolean).join(' · ') || 'No details'}
          </div>
        </div>`
          )
          .join('');

  // Reuse reassign-modal as generic modal
  const modal = document.getElementById('reassign-modal');
  if (!modal) return;
  modal.querySelector('div').innerHTML = `
    <div style="background:var(--white);border-radius:16px;padding:24px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--navy)">🚲 ${esc(clientName)}'s Bikes</div>
        <button data-action="close-reassign-modal" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>
      ${bikeRows}
    </div>`;
  modal.style.display = 'flex';
}

// ── Newsletter subscribers ────────────────────────────────────────────────────
async function loadNewsletter() {
  const { data } = await sb
    .from('newsletter_subscribers')
    .select('email, name, source, subscribed_at, active')
    .order('subscribed_at', { ascending: false })
    .limit(50);

  const el = document.getElementById('newsletter-list');
  if (!el) return;
  if (!data || data.length === 0) {
    el.innerHTML =
      '<div style="text-align:center;padding:20px;color:var(--mgray);font-size:13px">No subscribers yet.</div>';
    return;
  }
  el.innerHTML = `
    <div style="font-size:13px;color:var(--mgray);margin-bottom:10px">${data.filter((s) => s.active).length} active · ${data.filter((s) => !s.active).length} unsubscribed</div>
    <table class="tbl">
      <thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Subscribed</th><th>Status</th></tr></thead>
      <tbody>${data
        .map(
          (s) => `<tr>
        <td style="font-size:13px">${esc(s.email)}</td>
        <td style="font-size:13px">${esc(s.name || '—')}</td>
        <td style="font-size:13px">${esc(s.source || 'website')}</td>
        <td style="font-size:13px">${new Date(s.subscribed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td><span style="background:${s.active ? 'var(--green-tint)' : '#FEF2F2'};color:${s.active ? 'var(--green)' : 'var(--red)'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${s.active ? 'Active' : 'Unsub'}</span></td>
      </tr>`
        )
        .join('')}</tbody>
    </table>`;
}

function exportNewsletterCSV() {
  const rows = document.querySelectorAll('#newsletter-list tbody tr');
  if (!rows.length) {
    showToast('No data to export');
    return;
  }
  const headers = ['Email', 'Name', 'Source', 'Subscribed', 'Status'];
  const csv = [
    headers.join(','),
    ...Array.from(rows).map((r) =>
      Array.from(r.querySelectorAll('td'))
        .map((td) => '"' + td.textContent.trim().replace(/"/g, '""') + '"')
        .join(',')
    ),
  ].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'newsletter-subscribers-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
}

// This one reads the raw key ON PURPOSE and must keep doing so: it runs at boot
// to hand the stored pair to setSession() and create the session in the first
// place. Routing it through adminAccessToken() would be circular - that helper
// asks getSession() for the very session this function exists to restore - and
// would leave a returning admin logged out.
// Returns true only if there is a LIVE Supabase session afterwards.
//
// It used to ignore what setSession() returned, and that was a dead end: a
// refresh token dies (they rotate, and an unused one expires), setSession fails
// silently, and checkAdminAuth() keeps saying "logged in" because it only looks
// at whether the localStorage key EXISTS. The panel then renders the sidebar
// with your name on it while every Supabase-authenticated screen answers
// "Admin session expired - sign in again" - and nothing ever shows the login
// form again, so there is no way to sign in again short of clearing storage by
// hand. Reproduced with a deliberately stale token pair: the login overlay
// never appeared and Supabase had stored no session at all.
async function restoreAdminSession() {
  const access_token = localStorage.getItem('drbike-admin-token');
  const refresh_token = localStorage.getItem('drbike-admin-refresh');
  if (!access_token || !refresh_token) return false;
  let session = null;
  let why = '';
  try {
    const { data, error } = await sb.auth.setSession({ access_token, refresh_token });
    session = data?.session || null;
    why = error?.message || '';
  } catch (e) {
    why = e.message;
  }
  // setSession() refreshes when the stored access token has expired, and that
  // mints a NEW refresh token - the one just read from localStorage is retired
  // the moment it is used. Writing the fresh pair back is what stops the next
  // boot from presenting a token Supabase has already thrown away.
  if (session) {
    storeAdminSession(session);
    return true;
  }
  // The stored pair is dead. Drop it, so checkAdminAuth() stops claiming we are
  // signed in and puts the password form back on screen.
  console.warn('[admin] stored session could not be restored:', why || 'no session returned');
  clearAdminSession();
  return false;
}

async function initAdmin() {
  // Auth via Supabase (api/admin-auth.js). Token stored in localStorage.
  if (!checkAdminAuth()) return;
  if (!(await restoreAdminSession())) {
    // restoreAdminSession() just cleared the dead tokens, so this second call
    // takes the other branch and shows the login overlay.
    checkAdminAuth();
    return;
  }
  go('dashboard');
  subscribeToBookings();
  handleUrlParams();
}

// Reads ?page= and ?calendar= set by the Google Calendar OAuth callback
// redirect (see api/google-calendar-callback.js) - lands the admin back on
// Settings with a clear success/error message instead of just the dashboard.
function handleUrlParams() {
  const params = new URLSearchParams(location.search);
  const page = params.get('page');
  const calendar = params.get('calendar');
  if (page) go(page);
  const statusEl = document.getElementById('gcal-status');
  if (statusEl && calendar === 'connected') {
    statusEl.textContent = '✓ Connected';
    statusEl.style.color = 'var(--green)';
  } else if (statusEl && calendar === 'error') {
    statusEl.textContent = '✗ Connection failed - try again';
    statusEl.style.color = 'var(--red)';
  }
  if (page || calendar) history.replaceState(null, '', location.pathname);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}

// Pre-cargar bookings en background para que estén listos al navegar
setTimeout(() => {
  try {
    loadBookings();
  } catch (e) {}
}, 2000);

// Inject notification panel into body
(function () {
  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.style.cssText =
    'display:none;position:fixed;top:68px;right:16px;width:360px;max-height:480px;overflow-y:auto;background:var(--white);border:1px solid var(--border);border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.18);z-index:200';
  panel.innerHTML = `<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--white)">
    <div style="font-size:15px;font-weight:700;color:var(--navy)">🔔 Notifications</div>
    <button data-action="mark-all-read" style="font-size:13px;color:var(--blue);background:none;border:none;cursor:pointer;font-family:Inter,sans-serif;font-weight:500">Mark all read</button>
  </div>
  <div id="notif-list" style="padding:8px"><div style="padding:20px;text-align:center;color:var(--mgray);font-size:13px">Loading...</div></div>`;
  document.body.appendChild(panel);
})();

// ── Avg Service Time KPI (T02) ────────────────────────────────────────────────
// `service_name`, not `service_type`. There is no service_type column on
// bookings - the real one is service_name (see the column list in
// scripts/restore-thais-booking-2026-08-05.sql, an insert that ran against
// production). PostgREST answers an unknown column with 400, so this query
// never returned a row, and because the destructuring took only `data` and
// dropped `error`, the KPI simply stayed blank and said nothing. Diego found
// it as a red 400 in the browser console, not from the screen.
//
// The same typo is in scripts/add-service-timing-columns.sql, which is why the
// index that migration creates does not exist either.
async function loadAvgServiceTime() {
  const sub = document.getElementById('kpi-avg-time-sub');
  try {
    const { data, error } = await sb
      .from('bookings')
      .select('service_name, service_duration_seconds')
      .not('service_duration_seconds', 'is', null)
      .eq('status', 'completed');
    // Say it out loud. A KPI that cannot be read is not the same as a KPI with
    // nothing in it, and for a year this screen showed both as blank.
    if (error) {
      if (sub) sub.textContent = 'Could not read: ' + error.message;
      console.error('[admin] average service time query failed:', error.message);
      return;
    }
    if (!data?.length) {
      if (sub) sub.textContent = 'No completed jobs with a recorded duration yet';
      return;
    }
    const byType = {};
    data.forEach((b) => {
      const t = (b.service_name || 'Other').replace(/\s+/g, '_');
      if (!byType[t]) byType[t] = [];
      byType[t].push(b.service_duration_seconds);
    });
    const overall = data.reduce((a, b) => a + b.service_duration_seconds, 0) / data.length;
    const el = document.getElementById('kpi-avg-time');
    if (el) el.textContent = Math.round(overall / 60) + ' min';
    if (sub)
      sub.textContent = Object.entries(byType)
        .map(
          ([t, arr]) =>
            t.replace(/_/g, ' ') +
            ': ' +
            Math.round(arr.reduce((a, b) => a + b, 0) / arr.length / 60) +
            'min'
        )
        .join(' · ');
  } catch (e) {
    if (sub) sub.textContent = 'Could not read: ' + e.message;
    console.error('[admin] average service time failed:', e.message);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => loadAvgServiceTime(), 1200);
});

// The Connect button used to be a plain link to an endpoint that asked for no
// credentials at all. It now trades the admin session for a 5-minute ticket
// first, and that ticket is what authorises the redirect.
byId('gcal-connect-btn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Connecting...';
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'google-calendar-ticket',
        // adminAccessToken(), not the raw key: the stored copy goes stale as
        // soon as the client refreshes the session in memory, and this call
        // then hands the server a dead JWT. Same bug the Analytics screen hit.
        access_token: await adminAccessToken(),
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ticket) throw new Error(data.error || 'Could not start the connection');
    window.location.href = '/api/google-calendar-connect?ticket=' + encodeURIComponent(data.ticket);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    showToast('Google Calendar: ' + err.message);
  }
});
