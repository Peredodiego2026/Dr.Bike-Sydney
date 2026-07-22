window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'G-GXYD68JXZW');

// ── TASK-023: onclick → addEventListener (see tasks.md) ─────────────────────
// Static buttons that exist in the initial mechanic.html markup - script
// runs at the end of body so the DOM is already there, no need to wait for
// DOMContentLoaded.
(function wireStaticMechanicButtons() {
  const byId = (id) => document.getElementById(id);
  const wire = (id, fn) => {
    const el = byId(id);
    if (el) el.addEventListener('click', fn);
  };

  wire('v1', () => selVan(1));
  wire('v2', () => selVan(2));
  wire('login-btn', () => doLogin());
  wire('theme-btn-mech', () => toggleMechTheme());
  wire('status-btn', () => toggleStatus());
  wire('complete-service-btn', () => completeService());
  wire('checklist-close-btn', () => closeChecklist());
  wire('checklist-save-btn', () => saveChecklist());

  const navTabs = document.querySelector('.nav-tabs');
  if (navTabs) {
    navTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-tab');
      if (btn && btn.dataset.tab) goTab(btn.dataset.tab, btn);
    });
  }
})();

// Everything else (job cards, parts picker, checklist rows, chat, etc.) is
// built dynamically via innerHTML, so those buttons don't exist yet when
// this script runs. One delegated listener on document, dispatched by
// data-action, covers all of them regardless of when they're created.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case 'retry-load':
      load();
      break;
    case 'open-parts-picker':
      openPartsPicker();
      break;
    case 'apply-mech-discount':
      applyMechDiscount();
      break;
    case 'clear-sig':
      clearSig();
      break;
    case 'close-complete-modal':
      document.getElementById('complete-modal')?.remove();
      break;
    case 'submit-complete':
      submitComplete(id);
      break;
    case 'close-parts-picker':
      closePartsPicker();
      break;
    case 'confirm-parts':
      confirmParts(el.dataset.value === 'true');
      break;
    case 'parts-step':
      partsStep(id, parseInt(el.dataset.delta));
      break;
    case 'close-history-modal':
      document.getElementById('history-modal')?.remove();
      break;
    case 'update-qty':
      updateQty(id, parseInt(el.dataset.delta), el);
      break;
    case 'set-check':
      setCheck(id, el.dataset.status);
      break;
    case 'do-logout':
      doLogout();
      break;
    case 'open-mech-chat':
      openMechChat(id);
      break;
    case 'close-mech-chat':
      closeMechChat();
      break;
    case 'send-mech-message':
      sendMechMessage();
      break;
  }
});

// ── HTML ESCAPE HELPER (XSS protection) ──────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── PERSISTENT STORAGE ADAPTER (IndexedDB + localStorage) ───────────────────
const _IDB = (() => {
  const DB = 'dr-bike-mech-auth',
    ST = 's',
    VER = 1;
  let _db = null;
  const open = () =>
    new Promise((res, rej) => {
      if (_db) {
        res(_db);
        return;
      }
      const r = indexedDB.open(DB, VER);
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        _db = r.result;
        res(_db);
      };
      r.onupgradeneeded = (e) => e.target.result.createObjectStore(ST);
    });
  return {
    async get(k) {
      try {
        const ls = localStorage.getItem(k);
        if (ls) return ls;
        const db = await open();
        return new Promise((res) => {
          const req = db.transaction(ST, 'readonly').objectStore(ST).get(k);
          req.onsuccess = () => {
            if (req.result)
              try {
                localStorage.setItem(k, req.result);
              } catch (e) {}
            res(req.result ?? null);
          };
          req.onerror = () => res(null);
        });
      } catch {
        return localStorage.getItem(k);
      }
    },
    async set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {}
      try {
        const db = await open();
        db.transaction(ST, 'readwrite').objectStore(ST).put(v, k);
      } catch {}
    },
    async remove(k) {
      try {
        localStorage.removeItem(k);
      } catch {}
      try {
        const db = await open();
        db.transaction(ST, 'readwrite').objectStore(ST).delete(k);
      } catch {}
    },
  };
})();

const sb = supabase.createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'dr-bike-mech-session',
      storage: {
        getItem: (k) => _IDB.get(k),
        setItem: (k, v) => _IDB.set(k, v),
        removeItem: (k) => _IDB.remove(k),
      },
    },
  }
);
// Init theme - FORCE dark for mechanic app
(function () {
  document.documentElement.setAttribute('data-theme', 'dark');
})();
let mechanic = null,
  vanNum = 1,
  jobs = [],
  tab = 'today',
  online = true;
const timerIntervals = {};
let isOffline = !navigator.onLine;

// ── OFFLINE DETECTION ─────────────────────────────────────────────────────────
function updateOnlineStatus() {
  isOffline = !navigator.onLine;
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = isOffline ? 'flex' : 'none';
  if (!isOffline && mechanic) {
    load();
  } // auto-sync cuando vuelve internet
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function ratingHTML(jobs) {
  const rated = jobs.filter((j) => j.rating);
  if (rated.length === 0)
    return '<div style="text-align:center;padding:16px;background:#fff;border-radius:12px;border:1px solid var(--border);color:var(--mgray);font-size:13px">No ratings yet — complete jobs to get reviews!</div>';
  const avg = (rated.reduce((s, j) => s + (j.rating || 0), 0) / rated.length).toFixed(1);
  const stars = '⭐'.repeat(Math.round(avg));
  return `<div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:16px;text-align:center;margin-bottom:16px">
    <div style="font-size:32px;font-weight:800;color:var(--navy)">${avg}</div>
    <div style="font-size:20px;margin:4px 0">${stars}</div>
    <div style="font-size:13px;color:var(--mgray)">${rated.length} review${rated.length !== 1 ? 's' : ''}</div>
    ${rated
      .slice(-3)
      .reverse()
      .map(
        (
          j
        ) => `<div style="margin-top:10px;padding:10px;background:var(--off);border-radius:8px;text-align:left">
      <div style="font-size:11px;font-weight:600;color:var(--navy)">${'⭐'.repeat(j.rating || 0)} ${esc(j.client)}</div>
      ${j.review ? `<div style="font-size:11px;color:var(--mgray);margin-top:3px;font-style:italic">"${esc(j.review)}"</div>` : ''}
    </div>`
      )
      .join('')}
  </div>`;
}

async function init() {
  const s = localStorage.getItem('drbike-mech');
  if (!s) return;
  let parsed;
  try {
    parsed = JSON.parse(s);
  } catch (e) {
    localStorage.removeItem('drbike-mech');
    return;
  }
  // Force re-login if the saved session has no token (corrupt or pre-token session).
  if (!parsed.token) {
    localStorage.removeItem('drbike-mech');
    mechanic = null;
    return;
  }
  mechanic = parsed;
  vanNum = mechanic.van_number || 1;
  go('s-main');
  updateUI();
  const loadTimeout = setTimeout(() => {
    if (document.getElementById('jobs-list')?.innerHTML.includes('Loading')) {
      document.getElementById('jobs-list').innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--mgray)"><div style="font-size:32px;margin-bottom:12px">📡</div><div style="font-weight:600;color:var(--navy)">Taking longer than usual</div><div style="font-size:13px;margin-top:8px">Check your connection</div><button data-action="retry-load" style="margin-top:16px;padding:10px 24px;background:var(--blue);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:var(--sans)">Retry</button></div>';
    }
  }, 8000);
  // Transient failures here must NOT log the mechanic out — only a real 401 inside load() does.
  try {
    await load();
  } catch (e) {
    console.warn('[init] load failed', e);
  }
  clearTimeout(loadTimeout);
  try {
    sub();
  } catch (e) {}
  try {
    resumeTrackingIfNeeded();
  } catch (e) {}
  try {
    startBackgroundGPS();
  } catch (e) {}
}

async function doLogin() {
  const pin = document.getElementById('pin-inp').value.trim();
  if (pin.length < 4) {
    err('Enter your PIN');
    return;
  }
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in...';
  btn.disabled = true;

  try {
    const resp = await fetch('/api/mechanic-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const m = await resp.json();
    btn.textContent = 'Sign in →';
    btn.disabled = false;
    if (!resp.ok) {
      err(m.error || 'Invalid PIN');
      return;
    }
    // The server now says which van this PIN is actually bound to (set by
    // admin) - null means "all zones", in which case the picker on this
    // screen still decides which van's GPS position gets reported. A
    // bound mechanic's own value always wins over whatever they clicked.
    if (m.van_number !== null) vanNum = m.van_number;
    mechanic = { ...m, van_number: m.van_number ?? null };
    localStorage.setItem('drbike-mech', JSON.stringify(mechanic));
    go('s-main');
    updateUI();
    await load();
    sub();
    resumeTrackingIfNeeded();
    startBackgroundGPS();
  } catch (e) {
    btn.textContent = 'Sign in →';
    btn.disabled = false;
    err('Connection error — try again');
  }
}

function err(msg) {
  const e = document.getElementById('login-err');
  e.textContent = msg;
  e.style.display = 'block';
  setTimeout(() => (e.style.display = 'none'), 3000);
}
function doLogout() {
  if (!confirm('Sign out?')) return;
  stopGPS();
  stopBackgroundGPS();
  _gpsOk = false;
  localStorage.removeItem('drbike-mech');
  mechanic = null;
  jobs = [];
  go('s-login');
}

// Cached PIN no longer matches the server (e.g. the PIN was changed). Tear down the
// session and send the mechanic back to login instead of looping on 401 errors.
function forceRelogin(msg) {
  stopGPS();
  stopBackgroundGPS();
  _gpsOk = false;
  localStorage.removeItem('drbike-mech');
  mechanic = null;
  jobs = [];
  go('s-login');
  if (msg) err(msg);
}
function selVan(n) {
  vanNum = n;
  document.querySelectorAll('.van-opt').forEach((v) => v.classList.remove('sel'));
  document.getElementById('v' + n).classList.add('sel');
}

async function load() {
  try {
    const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'mechanic-jobs', van: vanNum, token: stored.token || '' }),
    });
    if (!resp.ok) {
      const e = await resp.json();
      if (resp.status === 401) {
        localStorage.removeItem('drbike-mech');
        mechanic = null;
        go('s-login');
        return;
      }
      throw new Error(e.error || 'Failed to load jobs');
    }
    const data = await resp.json();
    const mapped = (data || []).map((b) => ({
      id: b.id,
      client_id: b.client_id || null,
      client: b.client_name || b.client_email?.split('@')[0] || 'Client',
      email: b.client_email || '',
      phone: b.client_phone || '',
      service: b.service_name || 'Service',
      price: b.service_price || 0,
      callout_fee: b.callout_fee ?? 20,
      date: b.scheduled_date,
      time: b.scheduled_time || '',
      address: b.address || '',
      suburb: b.suburb || '',
      status: b.status || 'pending',
      notes: b.notes || '',
      mnotes: b.mechanic_notes || '',
      mechanic_id: b.mechanic_id || null,
      rating: b.client_rating,
      review: b.client_review,
      discount_applied: b.discount_applied || 0,
      discount_code: b.discount_code || '',
      membership_plan: b.client_membership_plan || null,
      membership_status: b.client_membership_status || null,
      has_card_on_file: !!b.client_has_card_on_file,
    }));
    jobs = mapped;
    try {
      localStorage.setItem('drbike-jobs-cache', JSON.stringify(jobs));
    } catch (e) {}
    render();
    badges();
  } catch (e) {
    console.error('load() CATCH ERROR:', e.message, e);
    const cached = localStorage.getItem('drbike-jobs-cache');
    if (cached) {
      jobs = JSON.parse(cached);
      render();
      badges();
      toast('⚡ Offline — showing cached jobs');
    } else {
      document.getElementById('jobs-list').innerHTML =
        '<div style="text-align:center;padding:40px;color:red">Error: ' + e.message + '</div>';
    }
  }
}

function sub() {
  const mechChannel = sb
    .channel('mech-jobs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (p) => {
      load();
      if (p.eventType === 'INSERT') {
        alert2(p.new);
        sendPushNotif(p.new);
      }
    })
    .subscribe();
  window.addEventListener('beforeunload', () => sb.removeChannel(mechChannel));
  requestPushPermission();
}

async function requestPushPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') return;
  const perm = await Notification.requestPermission();
  if (perm === 'granted') toast('🔔 Push notifications enabled!');
}

async function sendPushNotif(job) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // Show native browser notification (works even when app is open)
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification('🔔 New job — Dr. Bike', {
    body: `${job.service_name || 'Service'} · ${job.suburb || ''} · $${job.service_price || 0}`,
    icon: '/icon-mech-192.png',
    badge: '/icon-mech-192.png',
    vibrate: [200, 100, 200],
    tag: 'new-job-' + job.id,
    renotify: true,
    data: { url: '/mechanic.html' },
  });
}

function alert2(j) {
  const d = document.createElement('div');
  d.style.cssText =
    'position:fixed;top:80px;left:16px;right:16px;background:#059669;color:#fff;border-radius:14px;padding:16px 20px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.3);cursor:pointer';
  d.innerHTML = `<b>🔔 New booking!</b><br><span style="font-size:13px;opacity:.85">${j.service_name} · ${esc(j.suburb)} · $${j.service_price}</span>`;
  d.onclick = () => d.remove();
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 6000);
}

function render() {
  const today = new Date().toISOString().split('T')[0];
  let list;
  if (tab === 'today')
    list = jobs.filter(
      (j) => j.date === today && j.status !== 'completed' && j.status !== 'cancelled'
    );
  else if (tab === 'upcoming')
    list = jobs.filter(
      (j) => j.date > today && j.status !== 'cancelled' && j.status !== 'completed'
    );
  else if (tab === 'done') list = jobs.filter((j) => j.status === 'completed');
  else if (tab === 'agenda') {
    renderAgenda();
    return;
  } else {
    profile();
    return;
  }
  const c = document.getElementById('jobs-list');
  if (!list.length) {
    const m = {
      today: '☀️|No jobs today|New bookings appear instantly',
      upcoming: '📅|No upcoming jobs|Future bookings show here',
      done: '✅|No completed jobs|Completed jobs appear here',
    }[tab]?.split('|');
    c.innerHTML = `<div style="text-align:center;padding:60px 24px;color:var(--mgray)"><div style="font-size:48px;margin-bottom:16px">${m[0]}</div><div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:8px">${m[1]}</div><div style="font-size:13px">${m[2]}</div></div>`;
    return;
  }
  c.innerHTML = list.map((j) => card(j)).join('');

  // Event delegation for all card action buttons. render() runs on every
  // tab switch / data refresh, but #jobs-list is a single persistent
  // element (only innerHTML changes) - binding this listener unguarded on
  // every render() call stacked up N duplicate listeners over a session,
  // so one click fired the action N times (confirmed live: Navigate opened
  // 3 Maps tabs, WhatsApp sent the same message twice). Bind once.
  if (!c.dataset.actionsBound) {
    c.dataset.actionsBound = '1';
    c.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'navigate') {
        openMaps(btn.dataset.addr);
        return;
      }
      if (action === 'chat') {
        openMechChat(id);
        return;
      }
      if (action === 'whatsapp') {
        openWA(btn.dataset.phone, btn.dataset.client);
        return;
      }
      if (action === 'history') {
        openClientHistory(id, btn.dataset.client, btn.dataset.clientId);
        return;
      }
    });
  }

  // Wire notes inputs via blur delegation
  c.querySelectorAll('.notes-inp[data-notes-id]').forEach((inp) => {
    inp.addEventListener('blur', () => saveNotes(inp.dataset.notesId, inp.value));
  });

  // Attach swipe gestures for pending jobs
  list
    .filter((j) => j.status === 'pending')
    .forEach((j) => {
      const el = c.querySelector(`[data-job-id="${j.id}"]`);
      if (el) attachSwipe(el, j.id);
    });
  // Start timers for enroute jobs
  list.filter((j) => j.status === 'enroute').forEach((j) => startRouteTimer(j.id));
}

function attachSwipe(card, jobId) {
  let startX = 0,
    currentX = 0;
  card.addEventListener(
    'touchstart',
    (e) => {
      startX = e.touches[0].clientX;
    },
    { passive: true }
  );
  card.addEventListener(
    'touchmove',
    (e) => {
      currentX = e.touches[0].clientX - startX;
      if (currentX > 0) {
        card.style.transform = `translateX(${Math.min(currentX, 120)}px)`;
        card.style.transition = 'none';
        card.style.background = `rgba(5,150,105,${Math.min(currentX / 120, 1) * 0.25})`;
      }
    },
    { passive: true }
  );
  card.addEventListener('touchend', () => {
    card.style.transition = 'transform .3s,background .3s';
    if (currentX > 80) {
      card.style.transform = 'translateX(110%)';
      setTimeout(() => setStatus(jobId, 'confirmed'), 300);
    } else {
      card.style.transform = '';
      card.style.background = '';
    }
    currentX = 0;
  });
}

function startRouteTimer(jobId) {
  const key = 'enroute-start-' + jobId;
  if (!localStorage.getItem(key)) localStorage.setItem(key, Date.now());
  if (timerIntervals[jobId]) return;
  timerIntervals[jobId] = setInterval(() => {
    const start = parseInt(localStorage.getItem(key) || Date.now());
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const el = document.getElementById('timer-' + jobId);
    if (el) el.textContent = `🕐 En route: ${mm}:${ss}`;
    else {
      clearInterval(timerIntervals[jobId]);
      delete timerIntervals[jobId];
    }
  }, 1000);
}

function stopRouteTimer(jobId) {
  clearInterval(timerIntervals[jobId]);
  delete timerIntervals[jobId];
  localStorage.removeItem('enroute-start-' + jobId);
}

function checklistChanged() {
  const requiredItems = document.querySelectorAll(
    '#service-checklist .chk-item[data-required="true"]'
  );
  const allRequiredDone = requiredItems.length === 0 || [...requiredItems].every((c) => c.checked);
  const btn = document.querySelector('#complete-modal button[onclick^="submitComplete"]');
  if (btn) {
    btn.disabled = !allRequiredDone;
    btn.style.opacity = allRequiredDone ? '1' : '0.5';
    btn.style.cursor = allRequiredDone ? 'pointer' : 'not-allowed';
    btn.title = allRequiredDone ? '' : '⚠️ Complete the 3 required safety checks first';
  }
}

// Discount % shown here must stay in sync with MEMBERSHIP_PLANS in
// api/auth.js (kept as separate copies since this is browser code and that
// file is server-only). Lets the mechanic see at a glance whether - and how
// much - to discount this client's job before charging via EFTPOS.
const MEMBERSHIP_BADGE = {
  basic: { label: 'Basic member · 5% off', color: '#0A58CA' },
  standard: { label: 'Standard member · 10% off', color: '#2563EB' },
  vip: { label: 'VIP member · 15%+5% off', color: '#7C3AED' },
};

function card(j) {
  const today = new Date().toISOString().split('T')[0];
  const t = j.time ? j.time.substring(0, 5) : '';
  const d = j.date
    ? new Date(j.date + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '';
  const done = j.status === 'completed';
  const sc = {
    pending: '#F59E0B',
    confirmed: '#0A58CA',
    enroute: '#22C55E',
    in_progress: '#22C55E',
    inprogress: '#22C55E',
    arrived: '#22C55E',
    completed: '#6B7280',
    cancelled: '#EF4444',
  };
  const sl = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    enroute: 'En route',
    in_progress: 'In progress',
    inprogress: 'In progress',
    arrived: 'Arrived',
    completed: 'Done',
    cancelled: 'Cancelled',
  };
  const st = j.status || 'pending';
  const addr = (j.address || j.suburb || 'Sydney').replace(/\\/g, '').replace(/'/g, "\\'");
  const isPending = st === 'pending';
  const isEnroute = st === 'enroute';
  const isConfirmedNoMechanic = st === 'confirmed' && !j.mechanic_id;
  const borderColor = sc[st] || '#6B7280';
  return `<div class="job-card${done ? ' done' : ''}" data-job-id="${j.id}" style="overflow:hidden;position:relative;border-left:4px solid ${borderColor}">
    <div style="position:relative;z-index:1;background:var(--white);border-radius:14px">
    <div class="job-header">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:40px;height:40px;border-radius:50%;background:${sc[st]}1A;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:${sc[st]};flex-shrink:0;letter-spacing:-0.03em">${j.client
          .split(' ')
          .map((n) => n[0] || '')
          .join('')
          .slice(0, 2)
          .toUpperCase()}</div>
        <div><div class="job-client">${esc(j.client)}</div><div class="job-meta">${j.date === today ? 'Today' : ''}${t ? ' · ' + t : ''} ${j.date !== today ? '· ' + d : ''}</div></div>
      </div>
      <span class="status-badge" style="background:${sc[st]}1A;color:${sc[st]}">${sl[st] || st}</span>
    </div>
    ${
      j.membership_status === 'active' && MEMBERSHIP_BADGE[j.membership_plan]
        ? `<div style="padding:0 18px 6px"><span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${MEMBERSHIP_BADGE[j.membership_plan].color}15;color:${MEMBERSHIP_BADGE[j.membership_plan].color}">${MEMBERSHIP_BADGE[j.membership_plan].label}</span></div>`
        : ''
    }
    ${isEnroute ? `<div id="timer-${j.id}" style="font-size:13px;color:#D97706;font-weight:600;margin-bottom:6px;padding:0 18px">En route: 00:00</div>` : ''}
    <div class="job-service">${esc(j.service)}</div>
    <div class="job-addr">${j.address || j.suburb || '—'}</div>
    ${j.phone ? `<div class="job-addr">${esc(j.phone)}</div>` : ''}
    ${j.notes ? `<div class="job-notes">Note: ${esc(j.notes)}</div>` : ''}
    <div class="job-price">$${j.price}</div>
    <div class="actions">
      <button class="abtn nav" data-action="navigate" data-addr="${addr.replace(/"/g, '&quot;')}">Navigate</button>
      <button class="abtn" data-action="chat" data-id="${j.id}" style="background:#1E40AF1A;color:#1E40AF">Chat</button>
      <button class="abtn chat" data-action="whatsapp" data-phone="${(j.phone || j.email || '').replace(/"/g, '&quot;')}" data-client="${j.client.replace(/"/g, '&quot;')}">WhatsApp</button>
      <button class="abtn" data-action="history" data-id="${j.id}" data-client="${j.client.replace(/"/g, '&quot;')}" data-client-id="${j.client_id || ''}" style="background:#16A34A1A;color:#16A34A">History</button>
      ${!done ? `${isPending || (st === 'confirmed' && !j.mechanic_id) ? `<button class="abtn" data-action="accept" data-id="${j.id}" style="background:#16A34A1A;color:#16A34A;font-weight:700">Accept</button><button class="abtn" data-action="reject" data-id="${j.id}" style="background:#DC26261A;color:#DC2626">Reject</button>` : st === 'confirmed' ? `<button class="abtn go" data-action="enroute" data-id="${j.id}">En route</button>` : isEnroute ? `<button class="abtn" data-action="arrived" data-id="${j.id}" style="background:#16A34A1A;color:#16A34A">Arrived</button>` : st === 'arrived' || st === 'inprogress' || st === 'in_progress' ? `<button class="abtn done" data-action="complete" data-id="${j.id}">Complete</button>` : ``}` : `<button class="abtn undo" data-action="undo" data-id="${j.id}">Undo</button>`}
    </div>
    ${!done ? `<input class="notes-inp" placeholder="Mechanic notes..." aria-label="Mechanic notes" value="${esc(j.mnotes)}" data-notes-id="${j.id}">` : ''}
    ${isPending ? `<div style="text-align:center;font-size:11px;color:#16A34A;padding:6px 0;font-weight:600">Tap Accept to take this job</div>` : ''}
    </div>
  </div>`;
}

async function setStatus(id, status) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'mechanic-update-status',
        token: stored.token || '',
        booking_id: id,
        status,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      toast('Error: ' + (err.error || 'Could not update status'));
      return;
    }
  } catch (e) {
    toast('Error: ' + e.message);
    return;
  }
  const j = jobs.find((x) => x.id === id);
  if (j) j.status = status;
  render();
  badges();
  toast(status === 'enroute' ? '🚐 En route' : 'Updated');
  if (status === 'enroute') {
    startGPS(id);
    notifyClientEnroute(j);
  } else if (status === 'confirmed') {
    // Mechanic accepted the job — push notif to client
    if (j?.client_id)
      sendClientPush(j.client_id, {
        title: '🔧 Mechanic assigned — Dr. Bike Sydney',
        body: `${mechanic?.first_name || 'Your mechanic'} has accepted your ${j.service || 'booking'}. We'll notify you when they're on the way.`,
        url: '/',
        tag: 'booking-accepted-' + id,
      });
  } else if (status === 'completed' || status === 'cancelled') {
    stopGPS();
    stopRouteTimer(id);
  }
}

async function acceptJob(id) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'mechanic-accept',
        token: stored.token || '',
        booking_id: id,
        van_number: vanNum,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      toast(
        resp.status === 409
          ? err.error || 'Job already taken'
          : 'Error: ' + (err.error || 'Could not accept')
      );
      if (resp.status === 409) load(); // refresh so the taken job updates
      return;
    }
    const j = jobs.find((x) => x.id === id);
    if (j) {
      j.mechanic_id = stored.id || 'accepted';
      j.status = 'confirmed';
    }
    render();
    badges();
    toast('✅ Job accepted!');
  } catch (e) {
    toast('Error: ' + e.message);
  }
}

async function rejectJob(id) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'mechanic-reject', token: stored.token || '', booking_id: id }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      toast('Error: ' + (err.error || 'Could not reject'));
      return;
    }
    const j = jobs.find((x) => x.id === id);
    if (j) {
      j.status = 'pending';
      j.mechanic_id = null;
    }
    render();
    badges();
    toast('Job returned to pending');
  } catch (e) {
    toast('Error: ' + e.message);
  }
}

async function markArrived(id, pin) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'mechanic-arrived',
        token: stored.token || '',
        booking_id: id,
        pin,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      toast('Error: ' + (err.error || 'Could not mark arrived'));
      return false;
    }
    const j = jobs.find((x) => x.id === id);
    if (j) j.status = 'inprogress';
    render();
    badges();
    toast('📍 Arrived at location!');
    return true;
  } catch (e) {
    toast('Error: ' + e.message);
    return false;
  }
}

function promptArrivalPin(id) {
  document.getElementById('pin-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'pin-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:340px;padding:20px">
      <div style="font-weight:700;color:var(--navy);font-size:15px;margin-bottom:4px">Confirm arrival</div>
      <div style="font-size:13px;color:#6B7280;margin-bottom:16px">Ask the client for their 4-digit code and enter it below.</div>
      <input id="pin-input" type="tel" inputmode="numeric" maxlength="4" placeholder="0000" aria-label="4-digit arrival code"
        style="width:100%;box-sizing:border-box;padding:14px;text-align:center;font-size:24px;letter-spacing:8px;font-weight:700;border:1.5px solid var(--border);border-radius:10px;font-family:var(--sans);color:var(--navy);background:var(--off)">
      <div id="pin-error" style="display:none;color:#DC2626;font-size:13px;margin-top:8px"></div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button id="pin-cancel-btn" style="flex:1;background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:8px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;font-family:var(--sans)">Cancel</button>
        <button id="pin-confirm-btn" style="flex:2;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:var(--sans)">Confirm arrival</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const input = modal.querySelector('#pin-input');
  input.focus();

  modal.querySelector('#pin-cancel-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  async function submit() {
    const pin = input.value.trim();
    const errEl = modal.querySelector('#pin-error');
    if (pin.length !== 4) {
      errEl.textContent = 'Enter the 4-digit code the client gives you.';
      errEl.style.display = 'block';
      return;
    }
    const btn = modal.querySelector('#pin-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Checking...';
    const ok = await markArrived(id, pin);
    if (ok) {
      modal.remove();
    } else {
      btn.disabled = false;
      btn.textContent = 'Confirm arrival';
      errEl.textContent = 'Incorrect code - ask the client to read it again.';
      errEl.style.display = 'block';
    }
  }
  modal.querySelector('#pin-confirm-btn').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

// Send a push notification to a client via their stored browser subscription
async function sendClientPush(clientId, { title, body, url, tag }) {
  try {
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, title, body, url: url || '/', tag }),
    });
  } catch (e) {
    console.warn('Push to client failed:', e);
  }
}

function notifyClientEnroute(j) {
  if (!j) return;
  const mechName =
    ((mechanic?.first_name || '') + ' ' + (mechanic?.last_name || '')).trim() || 'Your mechanic';
  const trackUrl = `https://drbikesydney.com.au/?tracking=${j.id}`;

  // SMS + WhatsApp (works even if app not installed)
  if (j.phone) {
    const smsBody = JSON.stringify({
      to: j.phone,
      name: j.client,
      mechName,
      service: j.service,
      address: j.suburb,
      price: j.price,
      type: 'enroute',
      bookingId: j.id,
    });
    Promise.allSettled([
      fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: smsBody,
      }),
      fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: smsBody,
      }),
    ]);
  }

  // Push notification to app (if client has it installed + subscribed)
  if (j.client_id)
    sendClientPush(j.client_id, {
      title: `🚐 ${mechName} is on the way!`,
      body: `Heading to ${j.suburb || 'your address'} for your ${esc(j.service)}. Est. arrival: 10–20 min. Tap to track live 📍`,
      url: `/?action=dashboard&tracking=${j.id}`,
      tag: 'mechanic-enroute-' + j.id,
      badge: '/icon-mech-192.png',
      icon: '/icon-512.svg',
    });
}

// Push cuando el job es completado
function notifyClientComplete(j) {
  if (!j?.client_id) return;
  const mechName =
    ((mechanic?.first_name || '') + ' ' + (mechanic?.last_name || '')).trim() || 'Your mechanic';
  sendClientPush(j.client_id, {
    title: `✅ ${esc(j.service)} complete!`,
    body: `${mechName} has finished your service. Please leave a review — it helps us a lot! ⭐`,
    url: `/?action=dashboard&review=${j.id}`,
    tag: 'job-complete-' + j.id,
  });
}
let _sigDrawn = false;
let _partsUsed = {}; // { [partId]: { id, name, qty, category, sell_price } }
let _partsConfirmed = false; // true once parts chosen OR "no parts used" confirmed
let _completeJobId = null;
let _mechDiscount = null; // { code, type, value, amount } - discount applied at completion time (separate from any booking-time discount)
let _tipAmount = 0; // Optional tip, 100% to the mechanic, kept out of GST-taxable totals
let _skipAutoCharge = false; // true after a card-on-file auto-charge attempt failed once and the mechanic fell back to manual EFTPOS/Cash

function setMechTip(value) {
  _tipAmount = Math.max(0, Number(value) || 0);
  renderChargeBreakdown();
}
function openCompleteModal(id) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return;
  _partsUsed = {};
  _partsConfirmed = false;
  _completeJobId = id;
  _mechDiscount = null;
  _tipAmount = 0;
  _skipAutoCharge = false;
  let modal = document.getElementById('complete-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'complete-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:420px;max-height:90vh;overflow-y:auto">
      <div style="padding:16px;border-bottom:1px solid var(--border);font-weight:700;color:var(--navy);font-size:15px">✅ Complete job — ${esc(j.service)}</div>
      ${
        j.discount_applied > 0
          ? `<div style="margin:16px 16px 0;background:#ECFDF5;border:1.5px solid #A7F3D0;border-radius:10px;padding:12px 14px">
        <div style="font-size:13px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">💳 Discount to apply</div>
        <div style="font-size:15px;color:#065F46">Deduct <b>$${Number(j.discount_applied).toFixed(2)}</b>${j.discount_code ? ` (code ${esc(j.discount_code)})` : ''} from the service total. Collect <b>$${Math.max(0, (j.price || 0) - Number(j.discount_applied)).toFixed(2)}</b>.</div>
      </div>`
          : ''
      }
      <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:8px">✅ Service checklist</label>
          <div id="service-checklist" style="display:flex;flex-direction:column;gap:4px;background:var(--off);border-radius:8px;padding:10px"></div>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px">Work completed</label>
          <textarea id="comp-notes" placeholder="Describe what was done..." style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-family:var(--sans);font-size:13px;height:80px;resize:none;background:var(--white);color:var(--navy)">${esc(j.mnotes || '')}</textarea>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px">🔧 Parts used</label>
          <button type="button" data-action="open-parts-picker" id="parts-used-btn" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;background:var(--off);cursor:pointer;font-family:var(--sans)">
            <span id="parts-used-label" style="font-size:13px;font-weight:600;color:var(--navy)">Add parts used</span>
            <span style="display:flex;align-items:center;gap:8px">
              <span id="parts-used-count" style="display:none;font-size:11px;font-weight:700;color:#1E40AF;background:#1E40AF15;padding:2px 9px;border-radius:20px">0</span>
              <span style="color:#9CA3AF;font-size:18px;line-height:1">›</span>
            </span>
          </button>
          <div id="parts-banner" style="display:none;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-top:8px">⚠️ Select the parts you used, or confirm "No parts used"</div>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:8px">💳 Payment breakdown</label>
          <div id="charge-breakdown" style="background:var(--off);border:1px solid var(--border);border-radius:12px;padding:14px 16px"></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input id="mech-disc-code" placeholder="Discount code (optional)" aria-label="Discount code" style="flex:1;min-width:0;padding:11px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:var(--sans);background:var(--white);color:var(--navy);text-transform:uppercase" />
            <button type="button" data-action="apply-mech-discount" id="mech-disc-btn" style="flex-shrink:0;padding:0 16px;background:#0A58CA;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--sans)">Apply</button>
          </div>
          <div id="mech-disc-msg" style="display:none;font-size:13px;font-weight:600;margin-top:6px"></div>
        </div>
        <div>
          <label for="mech-tip-input" style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px">💚 Tip (optional, 100% goes to you)</label>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:15px;font-weight:700;color:var(--navy)">$</span>
            <input id="mech-tip-input" type="number" min="0" step="1" placeholder="0" inputmode="decimal"
              style="flex:1;padding:11px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;font-family:var(--sans);background:var(--white);color:var(--navy)"
              oninput="setMechTip(this.value)">
          </div>
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px">📸 Before & after photos</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:11px;color:#6B7280;margin-bottom:4px">Before</div>
              <label style="display:flex;align-items:center;justify-content:center;height:80px;border:2px dashed var(--border);border-radius:8px;cursor:pointer;background:var(--off);font-size:24px" id="before-label">
                📷
                <input type="file" accept="image/*" capture="environment" id="photo-before" aria-label="Before photo" style="display:none" onchange="previewPhoto('before')">
              </label>
            </div>
            <div>
              <div style="font-size:11px;color:#6B7280;margin-bottom:4px">After</div>
              <label style="display:flex;align-items:center;justify-content:center;height:80px;border:2px dashed var(--border);border-radius:8px;cursor:pointer;background:var(--off);font-size:24px" id="after-label">
                📷
                <input type="file" accept="image/*" capture="environment" id="photo-after" aria-label="After photo" style="display:none" onchange="previewPhoto('after')">
              </label>
            </div>
          </div>
        </div>
        <div>
          <label for="comp-next" style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px">Next service recommended</label>
          <input id="comp-next" type="date" style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-family:var(--sans);font-size:13px;background:var(--white);color:var(--navy)">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px">Client signature <span style="color:#DC2626">*</span></label>
          <canvas id="sig-canvas" width="100%" height="120" style="width:100%;border:1.5px solid var(--border);border-radius:8px;background:#fff;touch-action:none;display:block"></canvas>
          <button data-action="clear-sig" style="font-size:11px;color:#6B7280;background:none;border:none;cursor:pointer;margin-top:4px;font-family:var(--sans)">Clear signature</button>
        </div>
        <div id="sig-banner" style="display:none;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-top:8px">⚠️ Client signature is required to complete the job</div>
        <div id="pay-method-section">
          ${
            j.has_card_on_file
              ? `<div style="background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:10px">
                <span style="font-size:18px" aria-hidden="true">💳</span>
                <div style="font-size:13px;color:#1E40AF;font-weight:600">Will auto-charge the client's card on file - no EFTPOS needed.</div>
              </div>`
              : `<label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px">How did the client pay?</label>
              <div style="display:flex;gap:8px">
                <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer;background:var(--white)">
                  <input type="radio" name="pay-method" value="charged_manual" checked style="accent-color:#1848C8"> 💳 Card (EFTPOS)
                </label>
                <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer;background:var(--white)">
                  <input type="radio" name="pay-method" value="cash" style="accent-color:#059669"> 💵 Cash
                </label>
              </div>`
          }
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button data-action="close-complete-modal" style="flex:1;padding:12px;border:1.5px solid var(--border);border-radius:8px;background:none;font-family:var(--sans);cursor:pointer;font-size:13px;color:var(--navy)">Cancel</button>
          <button data-action="submit-complete" data-id="${id}" style="flex:2;padding:12px;background:#059669;color:#fff;border:none;border-radius:8px;font-family:var(--sans);font-size:13px;font-weight:700;cursor:pointer">💳 Marcar como cobrado (EFTPOS) y completar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  renderChargeBreakdown();

  // Build service checklist — required items first, then service-specific
  setTimeout(() => {
    const chkDiv = document.getElementById('service-checklist');
    if (chkDiv) {
      // MANDATORY safety checks — always required regardless of service type
      const required = [
        { label: '🔴 Brake check — front & rear (squeeze test + pad thickness)', required: true },
        {
          label: '🔴 Tyre check — pressure, sidewall condition, no cuts or bulges',
          required: true,
        },
        { label: '🔴 Chain wear check — measure with chain wear tool', required: true },
      ];
      // Optional service-specific items
      const svcLower = (j.service || '').toLowerCase();
      const optional = [
        { label: 'Cleaned work area', required: false },
        { label: 'Explained work done to client', required: false },
        { label: 'Checked bike for additional issues', required: false },
      ];
      if (svcLower.includes('tune'))
        optional.push(
          { label: 'Adjusted gears (front & rear derailleur)', required: false },
          { label: 'Adjusted brake cables & housing', required: false },
          { label: 'Lubricated chain & drivetrain', required: false },
          { label: 'Checked & tightened all bolts', required: false }
        );
      if (svcLower.includes('brake'))
        optional.push(
          { label: 'Tested brake lever feel & modulation', required: false },
          { label: 'Confirmed adequate stopping power', required: false }
        );
      if (svcLower.includes('chain') || svcLower.includes('cable'))
        optional.push({ label: 'Tested drivetrain under load', required: false });
      if (svcLower.includes('flat') || svcLower.includes('tyre'))
        optional.push(
          { label: 'Checked for sharp objects inside tyre', required: false },
          { label: 'Rim tape intact', required: false }
        );
      if (
        svcLower.includes('e-bike') ||
        svcLower.includes('ebike') ||
        svcLower.includes('electric')
      )
        optional.push(
          { label: 'Battery connections checked', required: false },
          { label: 'Motor assistance tested on all levels', required: false },
          { label: 'Display & controls functional', required: false }
        );

      const allItems = [...required, ...optional];
      chkDiv.innerHTML = allItems
        .map(
          (item, i) => `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--navy);cursor:pointer;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05)">
          <input type="checkbox" class="chk-item" data-idx="${i}" data-required="${item.required}" style="width:18px;height:18px;accent-color:${item.required ? '#DC2626' : '#059669'};flex-shrink:0" onchange="checklistChanged()">
          <span>${item.label}${item.required ? '<span style="color:#DC2626;font-size:11px;font-weight:700;margin-left:4px">REQUIRED</span>' : ''}</span>
        </label>`
        )
        .join('');
      checklistChanged();
    }
  }, 50);

  // Setup signature canvas
  setTimeout(() => {
    const canvas = document.getElementById('sig-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = 120 * window.devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '120px';
    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = '#0D1F3C';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    let drawing = false;
    _sigDrawn = false;
    const getPos = (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches?.[0] || e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    canvas.addEventListener('mousedown', (e) => {
      drawing = true;
      _sigDrawn = true;
      ctx.beginPath();
      const p = getPos(e);
      ctx.moveTo(p.x, p.y);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!drawing) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    canvas.addEventListener('mouseup', () => (drawing = false));
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      drawing = true;
      _sigDrawn = true;
      ctx.beginPath();
      const p = getPos(e);
      ctx.moveTo(p.x, p.y);
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!drawing) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    canvas.addEventListener('touchend', () => (drawing = false));
  }, 100);
}

// ── Parts-used picker (grouped by category, deducts stock on complete) ───────
const CATEGORY_META = {
  cockpit: { label: 'Cockpit', icon: '🎯', color: '#2563EB' },
  wheels: { label: 'Wheels', icon: '🛞', color: '#059669' },
  'wheels & tyres': { label: 'Wheels & Tyres', icon: '🛞', color: '#059669' },
  cables: { label: 'Cables', icon: '🔗', color: '#D97706' },
  drivetrain: { label: 'Drivetrain', icon: '⚙️', color: '#7C3AED' },
  brakes: { label: 'Brakes', icon: '🛑', color: '#DC2626' },
  suspension: { label: 'Suspension', icon: '🏔️', color: '#0891B2' },
  lubrication: { label: 'Lubrication', icon: '🧴', color: '#15803D' },
  general: { label: 'General', icon: '🔨', color: '#6B7280' },
};
function catMeta(cat) {
  const key = String(cat || '')
    .toLowerCase()
    .trim();
  return CATEGORY_META[key] || { label: cat || 'Other', icon: '📦', color: '#6B7280' };
}

async function openPartsPicker() {
  let panel = document.getElementById('parts-picker');
  if (panel) panel.remove();
  panel = document.createElement('div');
  panel.id = 'parts-picker';
  panel.style.cssText =
    'position:fixed;inset:0;background:var(--white);z-index:1100;display:flex;flex-direction:column';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:0 12px;height:56px;border-bottom:1px solid var(--border);flex-shrink:0">
      <button data-action="close-parts-picker" style="background:none;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;color:#374151" aria-label="Back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:700;color:var(--navy)">Parts used</div>
        <div style="font-size:13px;color:#6B7280"><span id="pp-count">0</span> selected · stock deducts on complete</div>
      </div>
    </div>
    <div id="pp-list" style="flex:1;overflow-y:auto;padding:14px 16px;background:var(--off)">
      <div style="text-align:center;color:#6B7280;font-size:13px;padding:30px">Loading parts...</div>
    </div>
    <div style="padding:10px 16px;border-top:1px solid var(--border);flex-shrink:0;background:var(--white);display:flex;flex-direction:column;gap:8px">
      <button data-action="confirm-parts" data-value="true" id="pp-done" disabled style="width:100%;padding:13px;background:#1E40AF;color:#fff;border:none;border-radius:10px;font-family:var(--sans);font-size:15px;font-weight:700;cursor:pointer;opacity:0.5">Confirm parts</button>
      <button data-action="confirm-parts" data-value="false" style="width:100%;padding:11px;background:none;border:1.5px solid var(--border);color:var(--navy);border-radius:10px;font-family:var(--sans);font-size:13px;font-weight:600;cursor:pointer">No parts used in this service</button>
    </div>`;
  document.body.appendChild(panel);

  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  let parts = [];
  try {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'mechanic-parts', token: stored.token || '' }),
    });
    parts = r.ok ? await r.json() : [];
  } catch (e) {}
  renderPartsPicker(parts);
}

function renderPartsPicker(parts) {
  const list = document.getElementById('pp-list');
  if (!list) return;
  if (!parts.length) {
    list.innerHTML =
      '<div style="text-align:center;padding:40px 20px;color:#6B7280"><div style="font-size:40px;margin-bottom:10px">📦</div><div style="font-size:15px;font-weight:600;color:var(--navy)">No parts in inventory</div><div style="font-size:13px;margin-top:4px">Add parts from the admin panel</div></div>';
    return;
  }
  // Stash for stepper lookups
  window._ppParts = {};
  const byCat = {};
  parts.forEach((p) => {
    window._ppParts[p.id] = p;
    const k = String(p.category || 'Other');
    (byCat[k] = byCat[k] || []).push(p);
  });
  let html = '';
  Object.keys(byCat)
    .sort()
    .forEach((cat) => {
      const m = catMeta(cat);
      html += `<div style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
        <span style="font-size:15px">${m.icon}</span>
        <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${m.color}">${esc(m.label)}</span>
      </div>`;
      byCat[cat].forEach((p) => {
        const qty = _partsUsed[p.id]?.qty || 0;
        const low = (p.stock || 0) <= (p.min_stock || 0);
        html += `<div id="pp-row-${p.id}" style="display:flex;align-items:center;gap:10px;background:var(--white);border:1px solid ${qty > 0 ? m.color : 'var(--border)'};border-left:3px solid ${m.color};border-radius:10px;padding:11px 12px;margin-bottom:7px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--navy)">${esc(p.name)}</div>
          <div style="font-size:11px;color:${low ? '#DC2626' : '#6B7280'};margin-top:2px">${low ? 'Low stock — ' : ''}${p.stock || 0} in stock</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <button data-action="parts-step" data-id="${p.id}" data-delta="-1" style="background:var(--off);border:1px solid var(--border);border-radius:7px;width:32px;height:32px;font-size:18px;cursor:pointer;font-weight:700;color:var(--navy)">−</button>
          <span id="pp-qty-${p.id}" style="font-size:15px;font-weight:700;min-width:22px;text-align:center;color:${qty > 0 ? m.color : 'var(--navy)'}">${qty}</span>
          <button data-action="parts-step" data-id="${p.id}" data-delta="1" style="background:var(--off);border:1px solid var(--border);border-radius:7px;width:32px;height:32px;font-size:18px;cursor:pointer;font-weight:700;color:var(--navy)">+</button>
        </div>
      </div>`;
      });
      html += '</div>';
    });
  list.innerHTML = html;
  updatePPCount();
}

function partsStep(id, delta) {
  const p = window._ppParts?.[id];
  if (!p) return;
  const cur = _partsUsed[id]?.qty || 0;
  const next = Math.max(0, Math.min(p.stock || 0, cur + delta));
  if (next === 0) delete _partsUsed[id];
  else
    _partsUsed[id] = {
      id: p.id,
      name: p.name,
      qty: next,
      category: p.category,
      sell_price: p.sell_price !== null && p.sell_price !== undefined ? Number(p.sell_price) : 0,
    };
  const m = catMeta(p.category);
  const qtyEl = document.getElementById('pp-qty-' + id);
  if (qtyEl) {
    qtyEl.textContent = next;
    qtyEl.style.color = next > 0 ? m.color : 'var(--navy)';
  }
  const row = document.getElementById('pp-row-' + id);
  if (row)
    ((row.style.borderColor = next > 0 ? m.color : 'var(--border)'),
      (row.style.borderLeftColor = m.color));
  updatePPCount();
}

function updatePPCount() {
  const n = Object.values(_partsUsed).reduce((s, p) => s + (p.qty || 0), 0);
  const el = document.getElementById('pp-count');
  if (el) el.textContent = n;
  const done = document.getElementById('pp-done');
  if (done) {
    done.disabled = n === 0;
    done.style.opacity = n === 0 ? '0.5' : '1';
    done.textContent = n > 0 ? `Confirm parts (${n})` : 'Confirm parts';
  }
}

// Confirm the parts step: withParts=true keeps the selection, false marks "no parts used".
function confirmParts(withParts) {
  if (!withParts) _partsUsed = {};
  _partsConfirmed = true;
  document.getElementById('parts-picker')?.remove();
  const banner = document.getElementById('parts-banner');
  if (banner) banner.style.display = 'none';
  updatePartsSummary();
}

function closePartsPicker() {
  document.getElementById('parts-picker')?.remove();
  updatePartsSummary();
}

function updatePartsSummary() {
  const items = Object.values(_partsUsed).filter((p) => p.qty > 0);
  const totalQty = items.reduce((s, p) => s + p.qty, 0);
  const label = document.getElementById('parts-used-label');
  const count = document.getElementById('parts-used-count');
  const btn = document.getElementById('parts-used-btn');
  if (label)
    label.textContent = items.length
      ? items.map((p) => `${p.qty}× ${p.name}`).join(', ')
      : _partsConfirmed
        ? 'No parts used ✓'
        : 'Add parts used';
  if (count) {
    count.style.display = items.length ? 'inline-block' : 'none';
    count.textContent = totalQty;
  }
  if (btn) btn.style.borderColor = _partsConfirmed ? '#059669' : 'var(--border)';
  renderChargeBreakdown();
}

// ── Payment breakdown + completion-time discount code (EFTPOS flow) ──────────
function calcChargeBreakdown() {
  const j = jobs.find((x) => x.id === _completeJobId);
  if (!j) return null;
  const calloutFee = Number(j.callout_fee ?? 20);
  const bookingDiscount = Number(j.discount_applied || 0);
  const service = Math.max(0, Number(j.price || 0) - bookingDiscount);
  const partsItems = Object.values(_partsUsed).filter((p) => p.qty > 0);
  const partsTotal = partsItems.reduce((s, p) => s + p.qty * (p.sell_price || 0), 0);
  const mechDiscountAmount = _mechDiscount ? Number(_mechDiscount.amount || 0) : 0;
  const tip = Number(_tipAmount) || 0;
  // chargeNow stays GST-taxable revenue only (service+parts-discount) - the tip is
  // 100% the mechanic's and reported separately, never folded into taxable totals.
  const chargeNow = Math.max(0, service + partsTotal - mechDiscountAmount);
  const totalToCollect = chargeNow + tip;
  return {
    j,
    calloutFee,
    service,
    partsItems,
    partsTotal,
    mechDiscountAmount,
    tip,
    chargeNow,
    totalToCollect,
  };
}

function renderChargeBreakdown() {
  const el = document.getElementById('charge-breakdown');
  if (!el) return;
  const b = calcChargeBreakdown();
  if (!b) return;
  let rows = '';
  rows += `<div style="display:flex;justify-content:space-between;font-size:13px;color:#9CA3AF;text-decoration:line-through;margin-bottom:6px"><span>Call-out fee (paid at booking)</span><span>$${b.calloutFee.toFixed(2)}</span></div>`;
  rows += `<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--navy);margin-bottom:6px"><span>Service</span><span>$${b.service.toFixed(2)}</span></div>`;
  if (b.partsItems.length) {
    b.partsItems.forEach((p) => {
      rows += `<div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;margin-bottom:4px;padding-left:8px"><span>${p.qty}× ${esc(p.name)}</span><span>$${(p.qty * (p.sell_price || 0)).toFixed(2)}</span></div>`;
    });
  }
  if (b.mechDiscountAmount > 0) {
    rows += `<div style="display:flex;justify-content:space-between;font-size:13px;color:#059669;font-weight:600;margin-bottom:6px"><span>Discount (${esc(_mechDiscount.code)})</span><span>−$${b.mechDiscountAmount.toFixed(2)}</span></div>`;
  }
  if (b.tip > 0) {
    rows += `<div style="display:flex;justify-content:space-between;font-size:13px;color:#059669;margin-bottom:6px"><span>💚 Tip (yours, 100%)</span><span>$${b.tip.toFixed(2)}</span></div>`;
  }
  rows += `<div style="height:1px;background:var(--border);margin:8px 0"></div>`;
  rows += `<div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:13px;font-weight:700;color:var(--navy)">TOTAL TO CHARGE (EFTPOS)</span><span style="font-size:20px;font-weight:800;color:#059669">$${b.totalToCollect.toFixed(2)}</span></div>`;
  el.innerHTML = rows;
}

async function applyMechDiscount() {
  const input = document.getElementById('mech-disc-code');
  const msg = document.getElementById('mech-disc-msg');
  const code = (input?.value || '').trim().toUpperCase();
  if (!code) return;
  msg.style.display = 'block';
  msg.style.color = '#6B7280';
  msg.textContent = 'Checking...';
  try {
    const { data: rows, error } = await sb.rpc('validate_discount_code', { p_code: code });
    const data = rows && rows[0];
    if (error || !data) throw new Error('Invalid or expired code');
    if (data.expires_at && new Date(data.expires_at) < new Date())
      throw new Error('Code has expired');
    if (data.max_uses && data.uses_count >= data.max_uses)
      throw new Error('Code has reached its limit');
    const b = calcChargeBreakdown();
    const base = b.service + b.partsTotal;
    const amount =
      data.discount_type === 'percent'
        ? Math.round(((base * data.discount_value) / 100) * 100) / 100
        : Math.min(data.discount_value, base);
    _mechDiscount = { code, type: data.discount_type, value: data.discount_value, amount };
    msg.style.color = '#059669';
    msg.textContent = `Code applied! −$${amount.toFixed(2)} off`;
    input.disabled = true;
    document.getElementById('mech-disc-btn').disabled = true;
    renderChargeBreakdown();
  } catch (e) {
    _mechDiscount = null;
    msg.style.color = '#DC2626';
    msg.textContent = e.message || 'Invalid code';
    renderChargeBreakdown();
  }
}

function previewPhoto(type) {
  const input = document.getElementById('photo-' + type);
  const label = document.getElementById(type + '-label');
  if (!input?.files?.[0] || !label) return;
  const url = URL.createObjectURL(input.files[0]);
  label.style.backgroundImage = `url(${url})`;
  label.style.backgroundSize = 'cover';
  label.style.backgroundPosition = 'center';
  label.textContent = '';
}

function clearSig() {
  const c = document.getElementById('sig-canvas');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  _sigDrawn = false;
}

async function uploadPhoto(bookingId, file, type) {
  if (!file) return null;
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `jobs/${bookingId}/${type}_${Date.now()}.${ext}`;
    const { data, error } = await sb.storage
      .from('job-photos')
      .upload(path, file, { upsert: true });
    if (error) {
      console.warn('Photo upload error:', error.message);
      return null;
    }
    const { data: urlData } = sb.storage.from('job-photos').getPublicUrl(path);
    return urlData?.publicUrl || null;
  } catch (e) {
    console.warn('Photo upload exception:', e);
    return null;
  }
}

async function submitComplete(id) {
  const notes = document.getElementById('comp-notes')?.value || '';
  const partsArr = Object.values(_partsUsed)
    .filter((p) => p.qty > 0)
    .map((p) => ({ id: p.id, name: p.name, qty: p.qty }));
  const partsCharged = Object.values(_partsUsed)
    .filter((p) => p.qty > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      qty: p.qty,
      unit_price: p.sell_price || 0,
      total: p.qty * (p.sell_price || 0),
    }));
  const breakdown = calcChargeBreakdown();
  const nextDate = document.getElementById('comp-next')?.value || null;
  const canvas = document.getElementById('sig-canvas');
  const signature = canvas ? canvas.toDataURL('image/png') : null;

  // Parts step is mandatory: must select parts OR confirm "no parts used"
  if (!_partsConfirmed) {
    const pb = document.getElementById('parts-banner');
    if (pb) {
      pb.style.display = 'block';
      pb.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  // Client signature is mandatory
  if (!_sigDrawn) {
    const banner = document.getElementById('sig-banner');
    if (banner) {
      banner.style.display = 'block';
      banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  const btn = document.querySelector('#complete-modal button[onclick*="submitComplete"]');
  if (btn) {
    btn.textContent = 'Saving...';
    btn.disabled = true;
  }

  // Upload photos
  const beforeFile = document.getElementById('photo-before')?.files?.[0];
  const afterFile = document.getElementById('photo-after')?.files?.[0];
  const [photoBeforeUrl, photoAfterUrl] = await Promise.all([
    uploadPhoto(id, beforeFile, 'before'),
    uploadPhoto(id, afterFile, 'after'),
  ]);

  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  const duration =
    activeTimerBookingId === id && serviceStartTime
      ? Math.floor((Date.now() - serviceStartTime) / 1000)
      : null;

  const resp = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'mechanic-complete',
      token: stored.token || '',
      booking_id: id,
      mechanic_notes: notes || null,
      parts_used: partsArr,
      parts_charged: {
        items: partsCharged,
        discount_code: _mechDiscount?.code || null,
        discount_amount: _mechDiscount?.amount || null,
      },
      final_charge_amount: breakdown ? breakdown.chargeNow : null,
      tip_amount: breakdown?.tip || 0,
      final_charge_status:
        document.querySelector('input[name="pay-method"]:checked')?.value || 'charged_manual',
      skip_auto_charge: _skipAutoCharge,
      photo_before_url: photoBeforeUrl || null,
      photo_after_url: photoAfterUrl || null,
      client_signature_url: signature || null,
      next_service_date: nextDate || null,
      duration_seconds: duration,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    if (err.code === 'AUTO_CHARGE_FAILED') {
      // Card on file exists but the charge failed - reveal the manual
      // EFTPOS/Cash picker in place (was hidden because a card was on file)
      // so the mechanic can collect payment and retry without losing their
      // signature/photos/notes already filled in.
      _skipAutoCharge = true;
      const section = document.getElementById('pay-method-section');
      if (section) {
        section.innerHTML = `
          <div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:8px;padding:10px 12px;color:#B91C1C;font-size:13px;font-weight:600;margin-bottom:10px">⚠️ ${esc(err.error || 'Card on file could not be charged')}</div>
          <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px">How did the client pay?</label>
          <div style="display:flex;gap:8px">
            <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer;background:var(--white)">
              <input type="radio" name="pay-method" value="charged_manual" checked style="accent-color:#1848C8"> 💳 Card (EFTPOS)
            </label>
            <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer;background:var(--white)">
              <input type="radio" name="pay-method" value="cash" style="accent-color:#059669"> 💵 Cash
            </label>
          </div>`;
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (btn) {
        btn.textContent = '💳 Marcar como cobrado (EFTPOS) y completar';
        btn.disabled = false;
      }
      toast('Auto-charge failed - please collect payment below and try again');
      return;
    }
    if (btn) {
      btn.textContent = '💳 Marcar como cobrado (EFTPOS) y completar';
      btn.disabled = false;
    }
    toast('Error: ' + (err.error || 'Could not complete job'));
    return;
  }

  const okData = await resp.json().catch(() => ({}));
  document.getElementById('complete-modal').remove();
  const j = jobs.find((x) => x.id === id);
  if (j) j.status = 'completed';
  render();
  badges();
  if (okData.auto_charged) toast('✅ Charged to card on file');
  stopGPS();
  toast('✅ Job completed!' + (photoBeforeUrl || photoAfterUrl ? ' Photos saved.' : ''));
  if (Array.isArray(okData.low_stock) && okData.low_stock.length) {
    setTimeout(
      () => toast('⚠️ Low stock: ' + okData.low_stock.join(', ') + ' — reorder soon'),
      1500
    );
  }
  // Push al cliente
  const jDone = jobs.find((x) => x.id === id);
  if (jDone) notifyClientComplete(jDone);

  stopGPS();

  // Send completion email + SMS review request (non-blocking, parallel)
  try {
    let clientEmail = j?.email || '';
    let clientPhone = j?.phone || '';
    const clientName = j?.client || 'Client';
    const reviewLink = `https://drbikesydney.com.au/?review=${id}`;

    // Si no tenemos email, buscar en el booking directo
    if (!clientEmail) {
      const { data: bkgFull } = await sb
        .from('bookings')
        .select('client_email, client_phone, client_id')
        .eq('id', id)
        .single();
      clientEmail = bkgFull?.client_email || '';
      clientPhone = bkgFull?.client_phone || clientPhone;
      if (!clientEmail)
        console.warn(
          '[submitComplete] no client email on file for booking',
          id,
          '- invoice/review email skipped'
        );
    }
    const nextSvcMsg = nextDate
      ? `Your next recommended service is on ${new Date(nextDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : 'We recommend a service check every 3–6 months.';

    console.log('📧 Sending notifications to:', clientEmail, clientPhone);
    // Fire all notifications in parallel
    await Promise.allSettled([
      // 1. Invoice/receipt email
      clientEmail
        ? fetch('/api/send-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId: id,
              to: clientEmail,
              clientName,
              service: j?.service_name || j?.service,
              date: j?.scheduled_date,
              time: j?.scheduled_time,
              address: j?.address || j?.suburb,
              price: Math.max(0, (j?.price || 0) - (j?.discount_applied || 0)),
              discount: j?.discount_applied || 0,
              calloutFee: breakdown?.calloutFee ?? 20,
              partsCharged: partsCharged,
              mechDiscountCode: _mechDiscount?.code || null,
              mechDiscountAmount: _mechDiscount?.amount || 0,
              finalChargeAmount: breakdown?.chargeNow ?? null,
              tipAmount: breakdown?.tip || 0,
              mechNotes: notes || null,
              mechName: ((mechanic?.first_name || '') + ' ' + (mechanic?.last_name || '')).trim(),
              nextService: nextSvcMsg,
              bookingRef: id.slice(0, 8).toUpperCase(),
            }),
          })
        : Promise.resolve(),
      // 2. Review request email
      clientEmail
        ? fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'review_request',
              to: clientEmail,
              name: clientName,
              service: j?.service_name || j?.service,
              bookingId: id,
            }),
          })
        : Promise.resolve(),
      // 3. SMS review request
      clientPhone
        ? fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: clientPhone,
              name: clientName,
              service: j?.service,
              price: j?.price,
              type: 'review_request',
              bookingId: id,
              reviewLink,
            }),
          })
        : Promise.resolve(),
      // 3. WhatsApp review request
      clientPhone
        ? fetch('/api/send-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: clientPhone,
              name: clientName,
              service: j?.service,
              price: j?.price,
              type: 'review_request',
              bookingId: id,
              reviewLink,
            }),
          })
        : Promise.resolve(),
    ]);
  } catch (e) {
    console.log('Notification error', e);
  }
}

async function completeJob(id) {
  openCompleteModal(id);
}
async function saveNotes(id, notes) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  const j = jobs.find((x) => x.id === id);
  if (!j) return;
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'mechanic-update-status',
        token: stored.token || '',
        booking_id: id,
        status: j.status,
        mechanic_notes: notes,
      }),
    });
    if (!resp.ok) toast('Could not save notes');
  } catch (e) {
    toast('Notes error: ' + e.message);
  }
}

async function openClientHistory(bookingId, clientName, clientId) {
  // Remove existing modal
  document.getElementById('history-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'history-modal';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9000;display:flex;align-items:flex-end;justify-content:center';

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--navy)">${esc(clientName)}</div>
          <div style="font-size:13px;color:var(--mgray)">Service history</div>
        </div>
        <button data-action="close-history-modal" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--mgray)">✕</button>
      </div>
      <div id="history-content" style="min-height:80px;display:flex;align-items:center;justify-content:center">
        <div style="color:var(--mgray);font-size:13px">Loading history...</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  try {
    const currentJob = jobs.find((j) => j.id === bookingId);
    const body = { role: 'client-history', token: mechanic.token || '' };
    if (clientId && clientId !== 'null' && clientId !== '') body.client_id = clientId;
    else if (currentJob?.email) body.client_email = currentJob.email;
    else body.booking_id = bookingId;

    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const history = await resp.json();
    const el = document.getElementById('history-content');
    if (!el) return;
    if (!resp.ok || !Array.isArray(history) || !history.length) {
      el.innerHTML =
        '<div style="text-align:center;padding:24px;color:var(--mgray);font-size:13px">No previous services found</div>';
      return;
    }
    const totalSpent = history.reduce((s, b) => s + (b.service_price || 0), 0);
    el.innerHTML = `
      <div style="background:#EEF3FC;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between">
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--navy)">${history.length}</div>
          <div style="font-size:11px;color:var(--mgray)">Services</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:800;color:#059669">$${totalSpent}</div>
          <div style="font-size:11px;color:var(--mgray)">Total spent</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:800;color:#F59E0B">${history.filter((b) => b.client_rating).length > 0 ? (history.filter((b) => b.client_rating).reduce((s, b) => s + (b.client_rating || 0), 0) / history.filter((b) => b.client_rating).length).toFixed(1) : '—'}</div>
          <div style="font-size:11px;color:var(--mgray)">Avg rating</div>
        </div>
      </div>
      ${history
        .map((b) => {
          const d = b.scheduled_date
            ? new Date(b.scheduled_date).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : '—';
          const stars = b.client_rating ? '⭐'.repeat(b.client_rating) : '';
          return `<div style="border-bottom:1px solid #F3F4F6;padding:12px 0">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
            <div style="font-size:13px;font-weight:600;color:var(--navy)">${esc(b.service_name || 'Service')}</div>
            <div style="font-size:13px;font-weight:700;color:#059669">$${b.service_price || 0}</div>
          </div>
          <div style="font-size:11px;color:var(--mgray);margin-bottom:4px">${d} ${stars ? '· ' + stars : ''}</div>
          ${b.client_review ? `<div style="font-size:13px;color:#6B7280;font-style:italic">&ldquo;${esc(b.client_review)}&rdquo;</div>` : ''}
          ${b.mechanic_notes ? `<div style="font-size:11px;color:#1848C8;margin-top:4px">📝 ${esc(b.mechanic_notes)}</div>` : ''}
        </div>`;
        })
        .join('')}
    `;
  } catch (e) {
    const el = document.getElementById('history-content');
    if (el)
      el.innerHTML =
        '<div style="text-align:center;padding:24px;color:#DC2626;font-size:13px">Error loading history</div>';
  }
}

function openMaps(a) {
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a + ', Sydney NSW')}`,
    '_blank'
  );
}
function openWA(phone, name) {
  let num = (phone || '').replace(/[^\d]/g, '');
  if (num.startsWith('0')) num = '61' + num.slice(1);
  window.open(
    `https://wa.me/${num}?text=${encodeURIComponent('Hi ' + name + '! This is your Dr. Bike mechanic. I am on my way! 🚲')}`,
    '_blank'
  );
}

function goTab(t, btn) {
  tab = t;
  document.querySelectorAll('.nav-tab').forEach((b) => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  if (t === 'inventory') {
    // Render inventory inside jobs-list using the template
    const c = document.getElementById('jobs-list');
    const tpl = document.getElementById('tpl-inventory');
    if (c && tpl) {
      c.innerHTML = '';
      c.appendChild(tpl.content.cloneNode(true));
    }
    loadInventory();
    return;
  }
  if (t === 'spareparts') {
    const c = document.getElementById('jobs-list');
    const tpl = document.getElementById('tpl-spareparts');
    if (c && tpl) {
      c.innerHTML = '';
      c.appendChild(tpl.content.cloneNode(true));
    }
    loadSpareParts();
    return;
  }
  render();
}

// ── Inventory (4.2) ──────────────────────────────────────────────────────────
async function loadInventory() {
  const loadingEl = document.getElementById('inventory-loading');
  const listEl = document.getElementById('inventory-list');
  const emptyEl = document.getElementById('inventory-empty');
  if (!loadingEl) return;
  loadingEl.style.display = 'block';
  if (listEl) listEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';
  try {
    const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
    const partsResp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'mechanic-parts', token: stored.token || '' }),
    });
    const data = partsResp.ok ? await partsResp.json() : [];
    const error = partsResp.ok ? null : true;
    if (error || !data?.length) {
      loadingEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    const byCategory = {};
    data.forEach((item) => {
      if (!byCategory[item.category]) byCategory[item.category] = [];
      byCategory[item.category].push(item);
    });
    let html = '';
    for (const [cat, items] of Object.entries(byCategory)) {
      html += `<div style="margin-bottom:20px"><h3 style="font-size:13px;font-weight:700;text-transform:uppercase;color:#6B7280;margin-bottom:8px">${esc(cat)}</h3>`;
      items.forEach((item) => {
        const low = item.stock <= item.min_stock;
        html += `<div class="inv-row${low ? ' low' : ''}">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--navy)">${esc(item.name)}</div>
            ${low ? '<div style="font-size:11px;color:#DC2626;font-weight:600;margin-top:2px">Low stock — reorder</div>' : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <button data-action="update-qty" data-id="${item.id}" data-delta="-1" style="background:var(--border);border:none;border-radius:6px;width:28px;height:28px;font-size:15px;cursor:pointer;font-weight:700;color:var(--navy)">−</button>
            <span style="font-size:15px;font-weight:700;min-width:28px;text-align:center;color:var(--navy)" id="qty-${item.id}">${item.stock}</span>
            <button data-action="update-qty" data-id="${item.id}" data-delta="1" style="background:var(--border);border:none;border-radius:6px;width:28px;height:28px;font-size:15px;cursor:pointer;font-weight:700;color:var(--navy)">+</button>
          </div>
        </div>`;
      });
      html += '</div>';
    }
    if (listEl) {
      listEl.innerHTML = html;
      listEl.style.display = 'block';
    }
    loadingEl.style.display = 'none';
  } catch (e) {
    if (loadingEl) loadingEl.textContent = 'Error loading inventory';
  }
}

async function updateQty(id, delta, btn) {
  const el = document.getElementById('qty-' + id);
  if (!el) return;
  const current = parseInt(el.textContent);
  const newQty = Math.max(0, current + delta);
  el.textContent = newQty;
  try {
    const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'mechanic-parts-update',
        token: stored.token || '',
        id,
        stock: newQty,
      }),
    });
    if (!r.ok) throw new Error('update failed');
  } catch (e) {
    el.textContent = current;
  }
}

// ── Spare Parts (client-facing price catalog, mechanic reference only) ───────
let sparePartsData = [];

async function loadSpareParts() {
  const loadingEl = document.getElementById('spareparts-loading');
  const listEl = document.getElementById('spareparts-list');
  const emptyEl = document.getElementById('spareparts-empty');
  if (!loadingEl) return;
  loadingEl.style.display = 'block';
  if (listEl) listEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';
  try {
    const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'mechanic-parts', token: stored.token || '' }),
    });
    sparePartsData = resp.ok ? await resp.json() : [];
    loadingEl.style.display = 'none';
    if (!sparePartsData.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    renderSpareParts();
  } catch (e) {
    loadingEl.textContent = 'Error loading parts';
  }
}

function renderSpareParts() {
  const listEl = document.getElementById('spareparts-list');
  const emptyEl = document.getElementById('spareparts-empty');
  if (!listEl) return;
  const q = (document.getElementById('sp-search')?.value || '').trim().toLowerCase();
  const filtered = q
    ? sparePartsData.filter((p) => p.name.toLowerCase().includes(q))
    : sparePartsData;

  if (!filtered.length) {
    listEl.style.display = 'none';
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.textContent = q ? `No parts match "${q}"` : 'No parts in the catalog yet.';
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const byCat = {};
  filtered.forEach((p) => {
    const key = String(p.category || 'general')
      .toLowerCase()
      .trim();
    (byCat[key] = byCat[key] || []).push(p);
  });

  let html = '';
  Object.keys(byCat)
    .sort()
    .forEach((cat) => {
      const m = catMeta(cat);
      html += `<div style="margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
          <span style="font-size:15px">${m.icon}</span>
          <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${m.color}">${esc(m.label)}</span>
        </div>`;
      byCat[cat].forEach((p) => {
        const hasPrice = p.sell_price !== null && p.sell_price !== undefined;
        const price = hasPrice ? '$' + parseFloat(p.sell_price).toFixed(2) : 'No price set';
        html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--white);border:1px solid var(--border);border-left:3px solid ${m.color};border-radius:10px;padding:12px 14px;margin-bottom:7px">
          <div style="font-size:13px;font-weight:600;color:var(--navy)">${esc(p.name)}</div>
          <div style="font-size:15px;font-weight:800;color:${hasPrice ? m.color : 'var(--mgray)'};flex-shrink:0">${price}</div>
        </div>`;
      });
      html += '</div>';
    });
  listEl.innerHTML = html;
  listEl.style.display = 'block';
}

// ── Service Timer (4.3) ──────────────────────────────────────────────────────
let timerInterval = null;
let serviceStartTime = null;
let activeTimerBookingId = null;

function startServiceTimer(bookingId) {
  activeTimerBookingId = bookingId;
  serviceStartTime = Date.now();
  const bar = document.getElementById('service-timer-bar');
  if (bar) bar.style.display = 'flex';
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - serviceStartTime) / 1000);
    const m = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    const el = document.getElementById('timer-display');
    if (el) el.textContent = m + ':' + s;
  }, 1000);
}

// "Complete" on the service-timer bar used to finish the job directly (only
// duration_seconds, no signature/parts/photos/charge amount) - a shortcut
// that bypassed everything openCompleteModal()/submitComplete() require.
// It now just stops the timer display and opens that same required modal;
// activeTimerBookingId/serviceStartTime are left set so submitComplete()
// still picks up the correct elapsed duration once the mechanic finishes it.
function completeService() {
  clearInterval(timerInterval);
  const bar = document.getElementById('service-timer-bar');
  if (bar) bar.style.display = 'none';
  const bookingId = activeTimerBookingId;
  if (bookingId) openCompleteModal(bookingId);
}

// ── Pre-Service Checklist (4.1) ──────────────────────────────────────────────
const CHECKLIST_ITEMS = [
  { id: 'brakes_front', label: 'Front brakes', cat: 'Brakes' },
  { id: 'brakes_rear', label: 'Rear brakes', cat: 'Brakes' },
  { id: 'chain', label: 'Chain condition', cat: 'Drivetrain' },
  { id: 'cassette', label: 'Cassette / cogs', cat: 'Drivetrain' },
  { id: 'chainring', label: 'Chainrings / crankset', cat: 'Drivetrain' },
  { id: 'cables', label: 'Gear & brake cables', cat: 'Cables' },
  { id: 'wheels', label: 'Wheels true & tight', cat: 'Wheels' },
  { id: 'tyres', label: 'Tyre condition & pressure', cat: 'Wheels' },
  { id: 'handlebar', label: 'Handlebar & stem', cat: 'Safety' },
  { id: 'seatpost', label: 'Seat & seatpost', cat: 'Safety' },
  { id: 'headset', label: 'Headset play', cat: 'Safety' },
  { id: 'bb', label: 'Bottom bracket', cat: 'Drivetrain' },
  { id: 'lights', label: 'Lights (if fitted)', cat: 'Accessories' },
  { id: 'general', label: 'General frame condition', cat: 'Safety' },
];

let checklistBookingId = null;
const checklistState = {};

function openChecklist(bookingId) {
  checklistBookingId = bookingId;
  const container = document.getElementById('checklist-items');
  if (!container) return;
  const bycat = {};
  CHECKLIST_ITEMS.forEach((i) => {
    if (!bycat[i.cat]) bycat[i.cat] = [];
    bycat[i.cat].push(i);
  });
  let html = '';
  for (const [cat, items] of Object.entries(bycat)) {
    html += `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6B7280;margin-bottom:6px">${cat}</div>`;
    items.forEach((item) => {
      html += `<div class="cl-row">
        <span style="font-size:13px;font-weight:500;color:var(--color-text)">${item.label}</span>
        <div style="display:flex;gap:4px">
          ${['ok', 'warn', 'critical']
            .map(
              (s) => `<button data-action="set-check" data-id="${item.id}" data-status="${s}"
            style="padding:4px 8px;border-radius:6px;border:1px solid #E5E7EB;font-size:11px;font-weight:600;cursor:pointer;background:#fff;color:#374151"
            id="cb-${item.id}-${s}">${s === 'ok' ? '✅ OK' : s === 'warn' ? '⚠️ Warn' : '🔴 Critical'}</button>`
            )
            .join('')}
        </div>
      </div>`;
    });
    html += '</div>';
  }
  container.innerHTML = html;
  const modal = document.getElementById('checklist-modal');
  if (modal) modal.style.display = 'block';
}

function setCheck(itemId, status) {
  checklistState[itemId] = status;
  ['ok', 'warn', 'critical'].forEach((s) => {
    const b = document.getElementById(`cb-${itemId}-${s}`);
    if (!b) return;
    b.style.background =
      s === status ? (s === 'ok' ? '#059669' : s === 'warn' ? '#D97706' : '#DC2626') : '#fff';
    b.style.color = s === status ? '#fff' : '#374151';
  });
}

function closeChecklist() {
  const modal = document.getElementById('checklist-modal');
  if (modal) modal.style.display = 'none';
}

async function saveChecklist() {
  const notesEl = document.getElementById('checklist-notes');
  const notes = notesEl ? notesEl.value : '';
  const criticals = CHECKLIST_ITEMS.filter((i) => checklistState[i.id] === 'critical').map(
    (i) => i.label
  );
  if (checklistBookingId) {
    const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
    try {
      const resp = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'mechanic-checklist',
          token: stored.token || '',
          booking_id: checklistBookingId,
          started_at: new Date().toISOString(),
          pre_service_checklist: JSON.stringify(checklistState),
          pre_service_notes: notes,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast('Error saving checklist: ' + (err.error || 'try again'));
        return;
      }
    } catch (e) {
      toast('Error: ' + e.message);
      return;
    }
  }
  closeChecklist();
  startServiceTimer(checklistBookingId);
  if (criticals.length) {
    try {
      fetch('/api/send-upsell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: checklistBookingId,
          criticalItems: CHECKLIST_ITEMS.filter((i) => checklistState[i.id] === 'critical').map(
            (i) => i.id
          ),
        }),
      }).catch(() => {});
    } catch (e) {}
    setTimeout(
      () =>
        alert('⚠️ ' + criticals.length + ' critical item(s) found. Upsell email sent to client.'),
      500
    );
  }
}
function toggleStatus() {
  online = !online;
  const b = document.getElementById('status-btn');
  b.textContent = online ? '● Online' : '○ Offline';
  b.style.color = online ? 'var(--green)' : 'var(--mgray)';
}

function badges() {
  const today = new Date().toISOString().split('T')[0];
  [
    [
      'today',
      jobs.filter((j) => j.date === today && j.status !== 'completed' && j.status !== 'cancelled')
        .length,
    ],
    ['upcoming', jobs.filter((j) => j.date > today && j.status !== 'cancelled').length],
    ['done', jobs.filter((j) => j.status === 'completed').length],
  ].forEach(([k, n]) => {
    const el = document.getElementById('b-' + k);
    if (el) {
      el.textContent = n;
      el.classList.toggle('show', n > 0);
    }
  });
}

function profile() {
  const today = new Date().toISOString().split('T')[0];
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay() + 1);
  const wkStr = thisWeekStart.toISOString().split('T')[0];
  const thisMonthStr = today.slice(0, 7);

  const td = jobs.filter((j) => j.date === today && j.status === 'completed');
  const wk = jobs.filter((j) => j.date >= wkStr && j.status === 'completed');
  const mo = jobs.filter(
    (j) => (j.date || '').startsWith(thisMonthStr) && j.status === 'completed'
  );
  const all = jobs.filter((j) => j.status === 'completed');

  const todayRev = td.reduce((s, j) => s + (j.price || 0), 0);
  const weekRev = wk.reduce((s, j) => s + (j.price || 0), 0);
  const monthRev = mo.reduce((s, j) => s + (j.price || 0), 0);
  const totalRev = all.reduce((s, j) => s + (j.price || 0), 0);

  const rated = all.filter((j) => j.rating);
  const avgRating = rated.length
    ? (rated.reduce((s, j) => s + (j.rating || 0), 0) / rated.length).toFixed(1)
    : '—';
  const stars = rated.length ? '⭐'.repeat(Math.round(parseFloat(avgRating))) : '';

  // Service breakdown
  const svcMap = {};
  all.forEach((j) => {
    const k = j.service_name || j.service || 'Other';
    svcMap[k] = (svcMap[k] || 0) + 1;
  });
  const topSvc = Object.entries(svcMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  document.getElementById('jobs-list').innerHTML = `<div class="profile-wrap">
    <div style="text-align:center;margin-bottom:24px;padding:0 16px">
      <div class="profile-av">${mechanic?.first_name?.[0] || 'M'}${mechanic?.last_name?.[0] || ''}</div>
      <div style="font-size:18px;font-weight:700;color:var(--navy)">${mechanic?.first_name} ${mechanic?.last_name}</div>
      <div style="font-size:13px;color:var(--mgray);margin-top:4px">Van ${vanNum} · ${mechanic?.role || 'Mechanic'}</div>
      ${rated.length ? `<div style="font-size:20px;margin-top:8px">${stars} <span style="font-size:15px;font-weight:700;color:var(--navy)">${avgRating}</span> <span style="font-size:13px;color:var(--mgray)">(${rated.length} reviews)</span></div>` : ''}
    </div>

    <!-- Earnings cards -->
    <div style="padding:0 16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.06em;opacity:0.6">Earnings</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:linear-gradient(135deg,#1848C8,#0D1F3C);border-radius:14px;padding:16px;color:#fff">
          <div style="font-size:11px;opacity:0.7;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Today</div>
          <div style="font-size:24px;font-weight:800;margin-top:4px">$${todayRev}</div>
          <div style="font-size:13px;opacity:0.7;margin-top:2px">${td.length} job${td.length !== 1 ? 's' : ''}</div>
        </div>
        <div style="background:var(--off);border:1px solid var(--border);border-radius:14px;padding:16px">
          <div style="font-size:11px;color:var(--mgray);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">This week</div>
          <div style="font-size:24px;font-weight:800;color:var(--navy);margin-top:4px">$${weekRev}</div>
          <div style="font-size:13px;color:var(--mgray);margin-top:2px">${wk.length} job${wk.length !== 1 ? 's' : ''}</div>
        </div>
        <div style="background:var(--off);border:1px solid var(--border);border-radius:14px;padding:16px">
          <div style="font-size:11px;color:var(--mgray);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">This month</div>
          <div style="font-size:24px;font-weight:800;color:var(--navy);margin-top:4px">$${monthRev}</div>
          <div style="font-size:13px;color:var(--mgray);margin-top:2px">${mo.length} job${mo.length !== 1 ? 's' : ''}</div>
        </div>
        <div style="background:var(--off);border:1px solid var(--border);border-radius:14px;padding:16px">
          <div style="font-size:11px;color:var(--mgray);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">All time</div>
          <div style="font-size:24px;font-weight:800;color:var(--navy);margin-top:4px">$${totalRev}</div>
          <div style="font-size:13px;color:var(--mgray);margin-top:2px">${all.length} job${all.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
    </div>

    <!-- Top services -->
    ${
      topSvc.length
        ? `<div style="padding:0 16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.06em;opacity:0.6">Top services</div>
      ${topSvc
        .map(
          ([name, count]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:13px;color:var(--navy)">${name}</span>
          <span style="font-size:13px;font-weight:700;color:var(--blue)">${count} job${count !== 1 ? 's' : ''}</span>
        </div>`
        )
        .join('')}
    </div>`
        : ''
    }

    <!-- Reviews -->
    <div style="padding:0 16px;margin-bottom:20px">${ratingHTML(jobs)}</div>

    <div style="padding:0 16px">
      <button data-action="do-logout" style="width:100%;padding:14px;background:var(--red-lt);color:var(--red);border:1.5px solid #FECACA;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;font-family:var(--sans)">Sign out</button>
    </div>
  </div>`;
}

function go(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}
function updateUI() {
  document.getElementById('mech-name').textContent = mechanic?.name || 'Mechanic';
  document.getElementById('van-label').textContent = 'Van ' + vanNum;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.cssText =
    'background:#1e293b;color:#ffffff;border-radius:12px;padding:12px 20px;font-weight:600;font-size:13px;';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function renderAgenda() {
  const c = document.getElementById('jobs-list');
  if (!c) return;

  // Group jobs by date for next 7 days
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }

  let html = '<div style="padding:0 16px 16px">';
  days.forEach((date) => {
    const dayJobs = jobs.filter((j) => j.date === date && j.status !== 'cancelled');
    const dateObj = new Date(date + 'T00:00:00');
    const isToday = date === new Date().toISOString().split('T')[0];
    const label = isToday
      ? 'Today'
      : dateObj.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
    const revenue = dayJobs.reduce((s, j) => s + j.price, 0);

    html += `<div style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:${isToday ? '#1848C8' : '#0D1F3C'}">${label}</div>
        ${dayJobs.length ? `<div style="font-size:13px;color:#6B7280">${dayJobs.length} job${dayJobs.length !== 1 ? 's' : ''} · $${revenue}</div>` : ''}
      </div>`;

    if (!dayJobs.length) {
      html += `<div style="padding:12px;background:rgba(0,0,0,0.03);border-radius:8px;text-align:center;font-size:13px;color:#9CA3AF">No jobs scheduled</div>`;
    } else {
      // Timeline view
      const times = [
        '8:00 am',
        '8:30 am',
        '9:00 am',
        '9:30 am',
        '10:00 am',
        '10:30 am',
        '11:00 am',
        '11:30 am',
        '12:00 pm',
        '12:30 pm',
        '1:00 pm',
        '1:30 pm',
        '2:00 pm',
        '2:30 pm',
        '3:00 pm',
        '3:30 pm',
        '4:00 pm',
        '4:30 pm',
        '5:00 pm',
      ];
      const stColors = {
        pending: '#F59E0B',
        confirmed: '#0A58CA',
        enroute: '#22C55E',
        in_progress: '#22C55E',
        inprogress: '#22C55E',
        arrived: '#22C55E',
        completed: '#6B7280',
        cancelled: '#EF4444',
      };

      dayJobs
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
        .forEach((j) => {
          const color = stColors[j.status] || '#6B7280';
          html += `<div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start">
          <div style="width:52px;font-size:11px;color:#9CA3AF;padding-top:10px;flex-shrink:0;text-align:right">${j.time || '—'}</div>
          <div style="flex:1;background:${color}12;border-left:3px solid ${color};border-radius:0 8px 8px 0;padding:10px 12px;cursor:pointer" data-action="open-mech-chat" data-id="${j.id}">
            <div style="font-size:13px;font-weight:600;color:#0D1F3C">${esc(j.service)}</div>
            <div style="font-size:13px;color:#6B7280;margin-top:2px">${esc(j.client)} · ${j.suburb || j.address || '—'}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
              <span style="font-size:11px;font-weight:600;color:${color}">${j.status.toUpperCase()}</span>
              <span style="font-size:13px;font-weight:700;color:#0D1F3C">$${j.price}</span>
            </div>
          </div>
        </div>`;
        });
    }
    html += '</div>';
  });
  html += '</div>';
  c.innerHTML = html;
}

// ── JOB CHAT (server-routed: list/send via /api, live via polling) ───────────
let mechChatPoll = null;
let mechChatMsgs = [];
let mechChatBookingId = null;

async function fetchMechMessages(bookingId) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  const r = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'mechanic-messages',
      token: stored.token || '',
      booking_id: bookingId,
    }),
  });
  return r.ok ? await r.json() : [];
}

async function syncMechMessages(bookingId) {
  const data = await fetchMechMessages(bookingId);
  if (data.length > mechChatMsgs.length) {
    const fresh = data.slice(mechChatMsgs.length);
    mechChatMsgs = data;
    fresh.forEach((m) => appendMechMessage(m));
  }
}

function openMechChat(bookingId) {
  mechChatBookingId = bookingId;
  // Create modal
  let modal = document.getElementById('mech-chat-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mech-chat-modal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:flex-end';
    modal.innerHTML = `
      <div style="background:var(--white);border-radius:16px 16px 0 0;width:100%;max-height:80vh;display:flex;flex-direction:column">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:700;color:var(--navy);font-size:15px">💬 Chat with client</div>
          <button data-action="close-mech-chat" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--mgray)">×</button>
        </div>
        <div id="mech-chat-msgs" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:var(--off);min-height:200px"></div>
        <div style="display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--border);align-items:center">
          <label style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;flex-shrink:0;font-size:18px;background:var(--off)" title="Send photo">
            📷
            <input type="file" accept="image/*" capture="environment" id="mech-chat-photo-inp" aria-label="Send photo" style="display:none" onchange="sendMechPhoto()">
          </label>
          <input id="mech-chat-inp" style="flex:1;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:var(--sans);font-size:13px;background:var(--white);color:var(--navy)" placeholder="Type a message..." aria-label="Type a message" onkeydown="if(event.key==='Enter')sendMechMessage()">
          <button data-action="send-mech-message" style="background:#1848C8;color:#fff;border:none;border-radius:8px;padding:0 16px;height:38px;cursor:pointer;font-size:18px">→</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  loadMechMessages(bookingId);

  if (mechChatPoll) clearInterval(mechChatPoll);
  mechChatPoll = setInterval(() => {
    if (mechChatBookingId === bookingId) syncMechMessages(bookingId);
  }, 4000);
}

function closeMechChat() {
  document.getElementById('mech-chat-modal').style.display = 'none';
  if (mechChatPoll) {
    clearInterval(mechChatPoll);
    mechChatPoll = null;
  }
}

async function loadMechMessages(bookingId) {
  const data = await fetchMechMessages(bookingId);
  mechChatMsgs = data;
  const c = document.getElementById('mech-chat-msgs');
  if (!c) return;
  c.innerHTML = '';
  if (!data.length) {
    c.innerHTML =
      '<div style="text-align:center;color:#6B7280;font-size:13px;padding:20px">No messages yet</div>';
    return;
  }
  data.forEach((m) => appendMechMessage(m, false));
  c.scrollTop = c.scrollHeight;
}

function appendMechMessage(msg, scroll = true) {
  const c = document.getElementById('mech-chat-msgs');
  if (!c) return;
  c.querySelector('div[style*="text-align:center"]')?.remove();
  const isMech = msg.sender_role === 'mechanic';
  const div = document.createElement('div');
  div.style.cssText = `display:flex;flex-direction:column;align-items:${isMech ? 'flex-end' : 'flex-start'};gap:2px;margin-bottom:6px`;
  const bubble = document.createElement('div');
  bubble.style.cssText = `max-width:75%;padding:8px 12px;border-radius:${isMech ? '12px 12px 4px 12px' : '12px 12px 12px 4px'};font-size:13px;background:${isMech ? '#1848C8' : '#fff'};color:${isMech ? '#fff' : '#0D1F3C'};border:${isMech ? 'none' : '1px solid #E5E7EB'}`;
  const photoMatch = msg.message?.match(/^\[PHOTO:(.*)\]$/);
  if (photoMatch) {
    const img = document.createElement('img');
    img.src = photoMatch[1];
    img.style.cssText = 'max-width:200px;border-radius:8px;display:block;cursor:pointer';
    img.onclick = () => window.open(photoMatch[1], '_blank');
    bubble.style.padding = '4px';
    bubble.appendChild(img);
  } else {
    bubble.textContent = msg.message;
  }
  const time = document.createElement('div');
  time.style.cssText = 'font-size:11px;color:#6B7280';
  time.textContent = new Date(msg.created_at).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  div.appendChild(bubble);
  div.appendChild(time);
  c.appendChild(div);
  if (scroll) c.scrollTop = c.scrollHeight;
}

async function sendMechPhoto() {
  const inp = document.getElementById('mech-chat-photo-inp');
  if (!inp?.files?.[0] || !mechChatBookingId) return;
  const file = inp.files[0];
  inp.value = '';
  toast('Uploading photo...');
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `chat/${mechChatBookingId}/${Date.now()}.${ext}`;
  const { data, error } = await sb.storage
    .from('job-photos')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    toast('Upload failed');
    return;
  }
  const { data: urlData } = sb.storage.from('job-photos').getPublicUrl(path);
  const url = urlData?.publicUrl;
  if (!url) {
    toast('Could not get photo URL');
    return;
  }
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'mechanic-message-send',
      token: stored.token || '',
      booking_id: mechChatBookingId,
      message: `[PHOTO:${url}]`,
    }),
  });
  toast('Photo sent');
  syncMechMessages(mechChatBookingId);
}

async function sendMechMessage() {
  if (!mechChatBookingId) return;
  const inp = document.getElementById('mech-chat-inp');
  const text = inp?.value?.trim();
  if (!text) return;
  inp.value = '';
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'mechanic-message-send',
      token: stored.token || '',
      booking_id: mechChatBookingId,
      message: text,
    }),
  });
  syncMechMessages(mechChatBookingId);
}

// ── GPS TRACKING ──────────────────────────────────────────────────────────────
let gpsInterval = null;
let activeJobId = null;
let watchId = null;
let _bgGpsInterval = null;
let _gpsOk = false;
let gpsPermissionState = 'unknown';

async function requestGPSPermission() {
  if (!navigator.geolocation) {
    toast('GPS not available');
    return false;
  }
  try {
    // This will trigger the browser permission prompt
    await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
    gpsPermissionState = 'granted';
    return true;
  } catch (err) {
    if (err.code === 1) {
      gpsPermissionState = 'denied';
      toast(
        '📍 Location permission denied. Enable in browser settings (lock icon → Location → Allow)'
      );
    } else {
      toast('GPS error: ' + err.message);
    }
    return false;
  }
}

// Always-on background GPS: starts on login, sends every 15s so mechanic is always visible on map
function startBackgroundGPS() {
  if (_bgGpsInterval || !navigator.geolocation) return;
  const send = () =>
    navigator.geolocation.getCurrentPosition(
      (pos) => upsertLocation(pos.coords.latitude, pos.coords.longitude),
      () => {} // silent fail for background heartbeat
    );
  send(); // immediate first ping
  _bgGpsInterval = setInterval(send, 15000);
}

function stopBackgroundGPS() {
  if (_bgGpsInterval) {
    clearInterval(_bgGpsInterval);
    _bgGpsInterval = null;
  }
}

// High-frequency GPS for active enroute jobs (5s, Uber-style)
function startGPS(bookingId) {
  activeJobId = bookingId;
  if (!navigator.geolocation) {
    toast('GPS not available');
    return;
  }
  toast('📍 Starting location sharing...');

  requestGPSPermission().then((granted) => {
    if (!granted) return;
    stopBackgroundGPS(); // upgrade from 15s to 5s
    sendLocation(bookingId);
    gpsInterval = setInterval(() => sendLocation(bookingId), 5000);
    watchId = navigator.geolocation.watchPosition(
      (pos) => upsertLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        if (err.code === 1) {
          toast(
            '📍 Location permission denied. Enable in browser settings (lock icon → Location → Allow)'
          );
          stopGPS();
        } else {
          toast('GPS: ' + err.message);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  });
}

function sendLocation(bookingId) {
  navigator.geolocation.getCurrentPosition(
    (pos) => upsertLocation(pos.coords.latitude, pos.coords.longitude),
    (err) => {
      if (err.code === 1) {
        toast(
          '📍 Location permission denied. Enable in browser settings (lock icon → Location → Allow)'
        );
        stopGPS();
      } else {
        toast('GPS: ' + err.message);
      }
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

async function upsertLocation(lat, lng) {
  if (!mechanic?.token) return;
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'mechanic-location',
        token: mechanic.token || '',
        van_number: vanNum,
        lat,
        lng,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 401) {
      // Background GPS must never log the mechanic out — just stop the heartbeat quietly.
      stopGPS();
      stopBackgroundGPS();
      return;
    }
    if (!resp.ok) {
      toast('GPS ERROR ' + resp.status + ': ' + (data.error || data.detail || 'unknown'));
    } else if (!_gpsOk) {
      _gpsOk = true;
      toast(
        'GPS OK - van ' + (data.van || vanNum) + ' lat:' + lat.toFixed(4) + ' lng:' + lng.toFixed(4)
      );
    }
  } catch (e) {
    toast('GPS send error: ' + e.message);
  }
}

function stopGPS() {
  if (gpsInterval) {
    clearInterval(gpsInterval);
    gpsInterval = null;
  }
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  activeJobId = null;
}

// Resume high-frequency GPS if there's already an enroute job
async function resumeTrackingIfNeeded() {
  const enroute = jobs.find((j) => j.status === 'enroute');
  if (enroute) startGPS(enroute.id);
}

init();
// Theme button SVG icons
const _moonSVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const _sunSVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const _t =
  localStorage.getItem('drbike-theme') ||
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const _tb = document.getElementById('theme-btn-mech');
if (_tb) _tb.innerHTML = _t === 'dark' ? _moonSVG : _sunSVG;
// Resume GPS after jobs load
setTimeout(() => {
  if (jobs.length) resumeTrackingIfNeeded();
}, 2000);

function toggleMechTheme() {
  const curr = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = curr === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('drbike-theme', next);
  const btn = document.getElementById('theme-btn-mech');
  if (btn) btn.innerHTML = next === 'dark' ? _moonSVG : _sunSVG;
}

document.getElementById('jobs-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === 'accept') acceptJob(id);
  else if (action === 'reject') rejectJob(id);
  else if (action === 'arrived') promptArrivalPin(id);
  else if (action === 'enroute') setStatus(id, 'enroute');
  else if (action === 'complete') completeJob(id);
  else if (action === 'undo') setStatus(id, 'confirmed');
});
