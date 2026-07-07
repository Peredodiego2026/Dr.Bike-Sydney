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
  analytics: 'Funnel · heatmap · LTV · margins',
  zones: 'Assign suburbs to each van',
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
  if (page === 'analytics') loadAnalytics();
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
        el.getAttribute('style')?.includes('border: 1px solid #E5E7EB')
      ) {
        el.style.setProperty('border-color', '#38383A', 'important');
      }
      if (
        el.getAttribute('style')?.includes('color:var(--mgray)') ||
        el.getAttribute('style')?.includes('color: #6B7280')
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
      // Restore light mode - remove forced important styles
      ['color', 'background', 'border-color'].forEach((prop) => {
        if (el.style.getPropertyPriority(prop) === 'important') {
          const orig = el.getAttribute('style') || '';
          // Only remove if it was a dark mode injection
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
const FIXED_COSTS = {
  payroll: 0,
  fleet: 960,
  insurance: 360,
  marketing: 400,
  software: 120,
  other: 360,
};
// Payroll: Phase 1 solo = $0 salary, Phase 2 = $16,100
const VAR_COST_PER_JOB = 10; // parts/supplies per job

// ── ALERT TRIGGERS (persistentes en Supabase) ────────────────────────────────
const TRIGGER_KEYS = ['new_booking', 'enroute', 'completed', 'payment', 'cancelled', 'reminders'];

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
      // Default: todos on excepto reminders
      const isOn = saved !== undefined ? saved === '1' : k !== 'reminders';
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

async function loadFinance() {
  const month = parseInt(document.getElementById('fin-month')?.value || new Date().getMonth() + 1);
  const year = parseInt(document.getElementById('fin-year')?.value || new Date().getFullYear());
  const view = document.getElementById('fin-view')?.value || 'month';

  let dateFrom, dateTo;
  if (view === 'month') {
    dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    dateTo = new Date(year, month, 0).toISOString().split('T')[0];
  } else if (view === 'quarter') {
    const q = Math.ceil(month / 3);
    dateFrom = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
    dateTo = new Date(year, q * 3, 0).toISOString().split('T')[0];
  } else {
    dateFrom = `${year}-01-01`;
    dateTo = `${year}-12-31`;
  }

  const { data: bookings } = await sb
    .from('bookings')
    .select('*,profiles(full_name,email)')
    .eq('status', 'completed')
    .gte('scheduled_date', dateFrom)
    .lte('scheduled_date', dateTo)
    .order('scheduled_date', { ascending: true });

  const jobs = bookings || [];
  const revenue = jobs.reduce((s, j) => s + (j.service_price || 0), 0);
  const jobCount = jobs.length;
  const gst = Math.round(revenue / 11); // GST inclusive: 1/11
  const netRevenue = revenue - gst;
  const varCosts = jobCount * VAR_COST_PER_JOB;
  const fixedTotal = Object.values(FIXED_COSTS).reduce((a, b) => a + b, 0);
  const grossProfit = netRevenue - varCosts;
  const netProfit = grossProfit - fixedTotal;
  const margin = netRevenue > 0 ? Math.round((netProfit / netRevenue) * 100) : 0;
  const avgJob = jobCount > 0 ? Math.round(revenue / jobCount) : 0;

  // KPIs
  document.getElementById('fk-revenue').textContent = '$' + revenue.toLocaleString();
  document.getElementById('fk-jobs').textContent = jobCount + ' job' + (jobCount !== 1 ? 's' : '');
  document.getElementById('fk-gst').textContent = '$' + gst.toLocaleString();
  document.getElementById('fk-net').textContent = '$' + netRevenue.toLocaleString();
  document.getElementById('fk-avg').textContent = 'avg $' + avgJob + ' / job';
  const profitEl = document.getElementById('fk-profit');
  profitEl.textContent = (netProfit < 0 ? '-$' : '$') + Math.abs(netProfit).toLocaleString();
  profitEl.style.color = netProfit >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('fk-margin').textContent = margin + '% margin';

  // P&L rows
  const plRows = [
    { label: 'Revenue (incl. GST)', val: revenue, bold: true, color: 'var(--green)' },
    { label: 'GST collected (1/11)', val: -gst, neg: true },
    { label: 'Net revenue (ex GST)', val: netRevenue, bold: true, sub: true },
    { label: 'Variable costs (parts)', val: -varCosts, neg: true },
    { label: 'Gross profit', val: grossProfit, bold: true, color: 'var(--green)' },
    { label: 'Payroll', val: -FIXED_COSTS.payroll, neg: true },
    { label: 'Fleet & van', val: -FIXED_COSTS.fleet, neg: true },
    { label: 'Insurance', val: -FIXED_COSTS.insurance, neg: true },
    { label: 'Marketing', val: -FIXED_COSTS.marketing, neg: true },
    { label: 'Software & phone', val: -FIXED_COSTS.software, neg: true },
    { label: 'Other fixed', val: -FIXED_COSTS.other, neg: true },
    {
      label: 'Net profit',
      val: netProfit,
      bold: true,
      total: true,
      color: netProfit >= 0 ? 'var(--green)' : 'var(--red)',
    },
  ];

  const periodStr =
    view === 'month'
      ? new Date(year, month - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' })
      : view === 'quarter'
        ? `Q${Math.ceil(month / 3)} ${year}`
        : `FY ${year}`;

  document.getElementById('fin-pl-period').textContent = periodStr;
  document.getElementById('fin-pl-rows').innerHTML = plRows
    .map(
      (r) => `
    <div class="pl-row${r.sub ? ' subtotal' : ''}${r.total ? ' total' : ''}">
      <span class="pl-label${r.bold ? ' dark' : ''}">${esc(r.label)}</span>
      <span style="font-weight:${r.bold ? '700' : '500'};color:${r.color || (r.neg ? 'var(--red)' : 'var(--navy)')}">
        ${r.val >= 0 ? '$' : '–$'}${Math.abs(r.val).toLocaleString()}
      </span>
    </div>`
    )
    .join('');

  // Daily chart
  const dailyMap = {};
  jobs.forEach((j) => {
    const d = j.scheduled_date;
    dailyMap[d] = (dailyMap[d] || 0) + (j.service_price || 0);
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
          return `<div style="display:flex;flex-direction:column;align-items:center;flex:1 1 0;max-width:32px;gap:3px" title="${d}: $${v}">
      <div style="width:100%;background:#1848C8;border-radius:3px 3px 0 0;height:${h}px;min-height:4px"></div>
      <div style="font-size:9px;color:var(--mgray)">${label}</div>
    </div>`;
        })
        .join('')
    : '<div style="color:var(--mgray);font-size:13px;margin:auto">No completed jobs in this period</div>';

  // BAS
  document.getElementById('bas-g1').textContent = '$' + revenue.toLocaleString();
  document.getElementById('bas-1a').textContent = '$' + gst.toLocaleString();
  document.getElementById('bas-1b').textContent = '$0'; // no GST on purchases yet
  document.getElementById('bas-net').textContent = '$' + gst.toLocaleString();

  // Transactions table
  document.getElementById('fin-tx-sub').textContent = jobCount + ' completed jobs · ' + periodStr;
  document.getElementById('fin-tx-body').innerHTML = jobs.length
    ? jobs
        .map((j) => {
          const price = j.service_price || 0;
          const jGst = Math.round(price / 11);
          const jNet = price - jGst;
          const name =
            j.client_name || j.profiles?.full_name || j.profiles?.email?.split('@')[0] || 'Client';
          return `<tr>
      <td data-label="Date">${j.scheduled_date}</td>
      <td data-label="Client">${name}</td>
      <td data-label="Service">${esc(j.service_name || 'Service')}</td>
      <td data-label="Amount" style="font-weight:600">$${price.toLocaleString()}</td>
      <td data-label="GST" style="color:var(--orange)">$${jGst}</td>
      <td data-label="Net">$${jNet}</td>
      <td data-label="Status"><span style="background:#D1FAE5;color:#065F46;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600">Paid</span></td>
    </tr>`;
        })
        .join('')
    : '<tr><td colspan="7"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;gap:10px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><div style="font-size:14px;font-weight:600;color:var(--mgray)">No transactions yet</div><div style="font-size:12px;color:var(--mgray);opacity:0.7">Completed jobs will appear here</div></div></td></tr>';

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
      const price = j.service_price || 0;
      const gst = Math.round(price / 11);
      return [
        j.scheduled_date,
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

G1 — Total Sales (incl GST): $${d.revenue.toLocaleString()}
G2 — Export Sales: $0
G3 — Other GST-free Sales: $0
G10 — Capital Purchases: $0
G11 — Non-capital Purchases: $0

1A — GST on Sales (G1/11): $${d.gst.toLocaleString()}
1B — GST Credits on Purchases: $0
NET GST PAYABLE TO ATO: $${d.gst.toLocaleString()}

Jobs completed: ${d.jobCount}
Average job value: $${d.avgJob}

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
    svcMap[k] = (svcMap[k] || 0) + (j.service_price || 0);
  });
  const topSvcs = Object.entries(svcMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxSvc = topSvcs[0]?.[1] || 1;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Dr. Bike Sydney — Finance Report</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#0D1F3C;background:#fff}
    .page{max-width:820px;margin:0 auto;padding:48px 40px}
    .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid #1848C8}
    .brand{display:flex;align-items:center;gap:12px}
    .brand-icon{width:42px;height:42px;background:#1848C8;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:800}
    .brand-name{font-size:20px;font-weight:800;color:#0D1F3C}
    .brand-sub{font-size:12px;color:#6B7280;margin-top:1px}
    .report-info{text-align:right}
    .report-title{font-size:14px;font-weight:700;color:#0D1F3C}
    .report-period{font-size:12px;color:#6B7280;margin-top:2px}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:32px}
    .kpi{background:#F7F8FA;border-radius:12px;padding:16px;border-left:3px solid #1848C8}
    .kpi.green{border-left-color:#059669}
    .kpi.orange{border-left-color:#D97706}
    .kpi.red{border-left-color:#DC2626}
    .kpi-label{font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}
    .kpi-val{font-size:24px;font-weight:800;color:#0D1F3C}
    .kpi-sub{font-size:11px;color:#9CA3AF;margin-top:3px}
    .section-title{font-size:13px;font-weight:700;color:#0D1F3C;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid #E5E7EB}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
    .bar-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .bar-label{font-size:11px;color:#374151;min-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bar-bg{flex:1;height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden}
    .bar-fill{height:100%;background:#1848C8;border-radius:4px}
    .bar-val{font-size:11px;font-weight:700;color:#0D1F3C;min-width:44px;text-align:right}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:32px}
    thead th{background:#0D1F3C;color:#fff;padding:10px 12px;text-align:left;font-size:11px;font-weight:600;letter-spacing:0.04em}
    tbody tr:nth-child(even){background:#F9FAFB}
    tbody td{padding:9px 12px;border-bottom:1px solid #F3F4F6;color:#374151}
    tbody td.bold{font-weight:700;color:#0D1F3C}
    tbody td.blue{font-weight:700;color:#1848C8}
    .footer{margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center}
    .footer-left{font-size:11px;color:#9CA3AF}
    .print-btn{background:#1848C8;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer}
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
      <div class="kpi"><div class="kpi-label">Revenue (incl GST)</div><div class="kpi-val">$${d.revenue.toLocaleString()}</div><div class="kpi-sub">${(d.jobs || []).length} completed jobs</div></div>
      <div class="kpi green"><div class="kpi-label">Net Revenue</div><div class="kpi-val">$${d.netRevenue.toLocaleString()}</div><div class="kpi-sub">excl. GST</div></div>
      <div class="kpi orange"><div class="kpi-label">GST Collected</div><div class="kpi-val">$${d.gst.toLocaleString()}</div><div class="kpi-sub">payable to ATO</div></div>
      <div class="kpi"><div class="kpi-label">Est. Net Profit</div><div class="kpi-val">$${d.netProfit.toLocaleString()}</div><div class="kpi-sub">after expenses</div></div>
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
            <div class="bar-val">$${val}</div>
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
            <tr><td>Revenue (incl GST)</td><td class="blue" style="text-align:right">$${d.revenue.toLocaleString()}</td></tr>
            <tr><td>GST (10%)</td><td class="bold" style="text-align:right">$${d.gst.toLocaleString()}</td></tr>
            <tr><td>Net revenue</td><td class="bold" style="text-align:right">$${d.netRevenue.toLocaleString()}</td></tr>
            <tr><td>Est. expenses</td><td class="bold" style="text-align:right">$${(d.netRevenue - d.netProfit).toLocaleString()}</td></tr>
            <tr><td style="font-weight:700">Est. net profit</td><td class="blue" style="text-align:right;font-weight:800">$${d.netProfit.toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-title">Transaction detail</div>
    <table>
      <thead><tr><th>Date</th><th>Client</th><th>Service</th><th>Van</th><th>Amount</th><th>GST</th><th>Net</th></tr></thead>
      <tbody>${(d.jobs || [])
        .map((j) => {
          const p = j.service_price || 0,
            g = Math.round(p / 11);
          return (
            '<tr><td>' +
            (j.scheduled_date || '—') +
            '</td><td class="bold">' +
            (j.profiles?.full_name || 'Client') +
            '</td><td>' +
            (j.service_name || '—') +
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
      ${!(d.jobs || []).length ? '<tr><td colspan="7" style="text-align:center;padding:20px;color:#9CA3AF">No completed bookings in this period</td></tr>' : ''}
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
        <div style="font-size:16px;font-weight:700;color:var(--navy)">🚫 Block availability</div>
        <button onclick="document.getElementById('block-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--mgray)">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:6px;text-transform:uppercase">Van</div>
          <select id="block-van" class="inp" style="margin:0">
            <option value="1">Van 1 — Inner West / Eastern / CBD</option>
            <option value="2">Van 2 — North Shore / Manly / Beaches</option>
            <option value="0">All vans</option>
          </select>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:6px;text-transform:uppercase">Date</div>
          <input type="date" id="block-date" class="inp" style="margin:0" min="${today}" value="${today}">
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
                  `<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:6px;border:1px solid var(--border);border-radius:6px;color:var(--navy)">
                <input type="checkbox" value="${t}" style="accent-color:var(--blue)"> ${t}
              </label>`
              )
              .join('')}
          </div>
          <button onclick="selectAllSlots(true)" style="background:none;border:none;color:var(--blue);font-size:12px;cursor:pointer;font-family:var(--sans);margin-top:6px;padding:0">Select all</button>
          <button onclick="selectAllSlots(false)" style="background:none;border:none;color:var(--mgray);font-size:12px;cursor:pointer;font-family:var(--sans);margin-top:6px;padding:0;margin-left:12px">Clear all</button>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:6px;text-transform:uppercase">Reason (optional)</div>
          <input type="text" id="block-reason" class="inp" style="margin:0" placeholder="e.g. Public holiday, mechanic unavailable">
        </div>
        <div style="display:flex;gap:10px;margin-top:4px">
          <button onclick="saveBlocks()" style="flex:1;padding:12px;background:var(--blue);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--sans)">Block selected slots</button>
          <button onclick="unblockDate()" style="flex:1;padding:12px;background:var(--off);color:var(--red);border:1.5px solid #FECACA;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--sans)">Unblock all</button>
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

  const rows = slots.map((time) => ({
    date,
    time_slot: time,
    van_number: van || null,
    blocked: true,
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

  let q = sb.from('availability').delete().eq('date', date).eq('blocked', true);
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
        <div style="font-size:13px;font-weight:600;color:var(--navy)">${p.full_name || p.email?.split('@')[0] || 'Client'}</div>
        <div style="font-size:11px;color:var(--mgray)">Code: ${p.referral_code || '—'} · ${p.membership_plan || 'No plan'}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;font-weight:700;color:var(--blue)">${p.referral_count} referral${p.referral_count !== 1 ? 's' : ''}</div>
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
      <div style="background:var(--white);border:1.5px solid ${isActive && !expired ? 'var(--border)' : '#FECACA'};border-radius:16px;padding:20px;box-shadow:var(--shadow);position:relative;overflow:hidden;transition:box-shadow .2s">
        <!-- Color accent top bar -->
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${isActive && !expired ? 'linear-gradient(90deg,var(--blue),#6366F1)' : '#FCA5A5'}"></div>

        <!-- Code + status -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;margin-top:4px">
          <div style="font-size:17px;font-weight:800;color:var(--navy);letter-spacing:0.08em;font-variant-numeric:tabular-nums">${esc(c.code)}</div>
          <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.05em;background:${isActive && !expired ? '#DCFCE7' : '#FEE2E2'};color:${isActive && !expired ? '#15803D' : '#DC2626'}">${expired ? 'Expired' : isActive ? 'Active' : 'Inactive'}</span>
        </div>

        <!-- Big value display -->
        <div style="background:${isPct ? '#EEF3FC' : '#ECFDF5'};border-radius:12px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px">
          <div style="font-size:28px;font-weight:800;color:${isPct ? 'var(--blue)' : '#059669'}">${valDisplay}</div>
          <div style="font-size:12px;color:var(--mgray);line-height:1.4">${isPct ? 'percentage<br>discount' : 'fixed amount<br>discount'}</div>
        </div>

        <!-- Stats row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div style="background:var(--off);border-radius:10px;padding:10px 12px">
            <div style="font-size:10px;font-weight:600;color:var(--mgray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Uses</div>
            <div style="font-size:14px;font-weight:700;color:var(--navy)">${usesDisplay}</div>
          </div>
          <div style="background:var(--off);border-radius:10px;padding:10px 12px">
            <div style="font-size:10px;font-weight:600;color:var(--mgray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Expires</div>
            <div style="font-size:12px;font-weight:600;color:${expired ? 'var(--red)' : 'var(--navy)'}">${expDisplay}</div>
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:8px">
          <button onclick="toggleCoupon('${c.id}',${!isActive})" style="flex:1;padding:9px;border:1.5px solid ${isActive ? '#FCA5A5' : '#86EFAC'};border-radius:8px;background:${isActive ? '#FEF2F2' : '#F0FDF4'};color:${isActive ? '#DC2626' : '#16A34A'};font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
            ${isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button onclick="deleteCoupon('${c.id}','${esc(c.code)}')" style="padding:9px 14px;border:1.5px solid #FCA5A5;border-radius:8px;background:#FEF2F2;color:#DC2626;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
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
    const res = await fetch('/api/send-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
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
  const overlay = document.createElement('div');
  overlay.id = 'admin-login-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0D1F3C;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:40px 36px;width:100%;max-width:360px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="width:56px;height:56px;background:#1848C8;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px"><img src="images/logo-db.png" alt="Dr. Bike Sydney" height="30" style="width:auto;display:block"></div>
      <div style="font-size:20px;font-weight:800;color:#0D1F3C;margin-bottom:4px">Dr. Bike Admin</div>
      <div style="font-size:13px;color:#6B7280;margin-bottom:28px">Operations dashboard</div>
      <input type="email" id="admin-email-inp" placeholder="Email" autocomplete="username"
        style="width:100%;padding:13px 16px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:15px;color:#0D1F3C;font-family:Inter,sans-serif;outline:none;margin-bottom:10px;box-sizing:border-box"
        onkeydown="if(event.key==='Enter')document.getElementById('admin-pass-inp').focus()">
      <input type="password" id="admin-pass-inp" placeholder="Password" autocomplete="current-password"
        style="width:100%;padding:13px 16px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:15px;color:#0D1F3C;font-family:Inter,sans-serif;outline:none;margin-bottom:12px;box-sizing:border-box"
        onkeydown="if(event.key==='Enter')submitAdminLogin()">
      <div id="admin-pass-err" style="color:#DC2626;font-size:12px;margin-bottom:10px;display:none">Invalid credentials</div>
      <button onclick="submitAdminLogin()" style="width:100%;padding:13px;background:#1848C8;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">Sign in →</button>
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
      inp.style.borderColor = '#DC2626';
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
      inp.style.borderColor = '#DC2626';
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
    '<div style="font-size:13px;color:#6B7280;margin:20px 0">Loading QR code...</div>'
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
        '<div style="color:#DC2626;padding:20px;font-size:13px">' +
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
      inp.style.borderColor = '#DC2626';
      inp.focus();
    }
    if (btn) {
      btn.textContent = 'Activate 2FA →';
      btn.disabled = false;
    }
  }
}

function _completeAdminLogin(data) {
  localStorage.setItem('drbike-admin-token', data.access_token);
  localStorage.setItem('drbike-admin-refresh', data.refresh_token);
  sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  document.getElementById('admin-login-overlay')?.remove();
  loadDashboard();
  subscribeToBookings();
}

function _showLoginCard(innerHtml) {
  const card = document.querySelector('#admin-login-overlay > div');
  if (card) card.innerHTML = _loginCardHeader() + innerHtml;
}

function _loginCardHeader() {
  return '<div style="width:56px;height:56px;background:#1848C8;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px"><img src="images/logo-db.png" alt="Dr. Bike Sydney" height="30" style="width:auto;display:block"></div><div style="font-size:20px;font-weight:800;color:#0D1F3C;margin-bottom:4px">Dr. Bike Admin</div>';
}

const _inp =
  'width:100%;padding:13px 16px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:15px;color:#0D1F3C;font-family:Inter,sans-serif;outline:none;box-sizing:border-box;margin-bottom:12px';
const _btn =
  'width:100%;padding:13px;background:#1848C8;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif';

function _totpInputHTML() {
  return `<div style="font-size:13px;color:#6B7280;margin-bottom:28px">Enter the 6-digit code from your authenticator app</div>
  <input type="text" id="admin-totp-inp" placeholder="000000" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code"
    style="${_inp}font-size:24px;font-weight:700;text-align:center;letter-spacing:10px"
    onkeydown="if(event.key==='Enter')submitTOTPCode()">
  <div id="admin-totp-err" style="color:#DC2626;font-size:12px;margin-bottom:10px;display:none"></div>
  <button onclick="submitTOTPCode()" style="${_btn}">Verify →</button>`;
}

function _enrollHTML(qrSvg, secret) {
  return `<div style="font-size:13px;color:#6B7280;margin-bottom:16px">Scan with Google Authenticator or Authy to enable 2FA on this account</div>
  <div style="margin:0 auto 12px;max-width:180px">${qrSvg}</div>
  <div style="font-size:11px;color:#6B7280;margin-bottom:16px">Or enter manually: <code style="background:#F3F4F6;padding:2px 6px;border-radius:4px;font-size:11px;letter-spacing:1px">${secret}</code></div>
  <input type="text" id="admin-enroll-inp" placeholder="Enter 6-digit code to confirm" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code"
    style="${_inp}font-size:20px;font-weight:700;text-align:center;letter-spacing:8px"
    onkeydown="if(event.key==='Enter')submitMFASetupCode()">
  <div id="admin-enroll-err" style="color:#DC2626;font-size:12px;margin-bottom:10px;display:none"></div>
  <button onclick="submitMFASetupCode()" style="${_btn}">Activate 2FA →</button>`;
}

async function loadDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';

  const [
    { data: todayJobs },
    { data: monthJobs },
    { data: pendingJobs },
    { data: recentBookings },
    { data: allClients },
    { count: newsletterCount },
    { count: bikesCount },
  ] = await Promise.all([
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
  ]);

  const todayRev = (todayJobs || []).reduce((s, b) => s + (b.service_price || 0), 0);
  const monthRev = (monthJobs || []).reduce((s, b) => s + (b.service_price || 0), 0);
  const completedToday = (todayJobs || []).filter((b) => b.status === 'completed').length;

  const completedMonth = (monthJobs || []).filter((b) => b.status === 'completed');
  const avgOrder = completedMonth.length
    ? Math.round(
        completedMonth.reduce((s, b) => s + (b.service_price || 0), 0) / completedMonth.length
      )
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
    kpis[0].textContent = '$' + todayRev.toLocaleString();
    kpis[0].nextElementSibling.textContent =
      (todayJobs || []).length +
      ' jobs today · $' +
      Math.round(todayRev / Math.max((todayJobs || []).length, 1)) +
      ' avg';
  }
  if (kpis[1]) {
    kpis[1].textContent = '$' + monthRev.toLocaleString();
    kpis[1].nextElementSibling.textContent =
      completedMonth.length + ' completed · $' + avgOrder + ' avg order';
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
            pending: '#D97706',
            confirmed: '#1848C8',
            enroute: '#059669',
            completed: '#6B7280',
            cancelled: '#DC2626',
          };
          const stBg = {
            pending: '#FEF3C7',
            confirmed: '#EEF3FC',
            enroute: '#ECFDF5',
            completed: '#F3F4F6',
            cancelled: '#FEF2F2',
          };
          const stLabel = {
            pending: 'Pending',
            confirmed: 'Confirmed',
            enroute: 'En route',
            completed: 'Completed',
            cancelled: 'Cancelled',
          };
          const vanColors = { 1: '#1848C8', 2: '#D97706', 3: '#7C3AED', 4: '#DC2626' };
          const vanNum = b.van_number || 1;
          return `<tr>
        <td data-label="Client" style="font-weight:700">${name}</td>
        <td data-label="Service">${esc(b.service_name || '—')}</td>
        <td data-label="Date">${b.scheduled_date || '—'}</td>
        <td data-label="Van"><span class="mech-tag v${vanNum}">Van ${vanNum}</span></td>
        <td data-label="Status"><span style="background:${stBg[st] || '#F3F4F6'};color:${stColors[st] || '#6B7280'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${stLabel[st] || st}</span></td>
        <td data-label="Price" style="font-weight:700;color:var(--blue)">$${b.service_price || 0}</td>
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
      pending: '#D97706',
      confirmed: '#1848C8',
      enroute: '#059669',
      completed: '#6B7280',
      cancelled: '#DC2626',
    };
    const stBg2 = {
      pending: '#FEF3C7',
      confirmed: '#EEF3FC',
      enroute: '#ECFDF5',
      completed: '#F3F4F6',
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
          <td data-label="Client" style="font-weight:600">${clientName}</td>
          <td data-label="Service">${esc(b.service_name || '—')}</td>
          <td data-label="Time">${timeStr}</td>
          <td data-label="Van"><span class="mech-tag v${vanNum}">Van ${vanNum}</span></td>
          <td data-label="Status"><span style="background:${stBg2[st]};color:${stColors2[st]};padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600">${stLabel2[st] || st}</span></td>
          <td data-label="Total" style="font-weight:700;color:var(--blue)">$${b.service_price || 0}</td>
        </tr>`;
        })
        .join('');
    } else {
      todayTbody.innerHTML = `<tr><td colspan="6"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;gap:8px">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div style="font-size:14px;font-weight:600;color:var(--mgray)">No jobs today</div>
        <div style="font-size:12px;color:var(--mgray);opacity:.7">New bookings appear here automatically</div>
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
      pending: '#F59E0B',
      confirmed: '#1848C8',
      enroute: '#059669',
      completed: '#6B7280',
      cancelled: '#DC2626',
    };
    if (upcoming.length > 0) {
      schList.innerHTML = upcoming
        .map(
          (b) => `
        <div class="sch-item">
          <div class="sch-time">${b.scheduled_time || '—'}</div>
          <div class="sch-dot" style="background:${stDotColors[b.status || 'pending']}"></div>
          <div style="flex:1;min-width:0">
            <div class="sch-name">${b.profiles?.full_name || b.client_name || 'Client'}</div>
            <div class="sch-svc">${b.service_name || 'Service'} · ${esc(b.suburb || '—')}</div>
          </div>
          <div class="sch-price">$${b.service_price || 0}</div>
        </div>`
        )
        .join('');
    } else {
      schList.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;gap:8px">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <div style="font-size:14px;font-weight:600;color:var(--mgray)">All clear for today</div>
        <div style="font-size:12px;color:var(--mgray);opacity:.7">No upcoming jobs</div>
      </div>`;
    }
  }
}

// ── BOOKINGS ──────────────────────────────────────────────────────────────────
let allBookings = [];

async function loadBookings() {
  const { data, error } = await sb
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    showToast('Error cargando bookings: ' + error.message);
    return;
  }
  allBookings = data || [];
  applyBookingFilters();
}

function applyBookingFilters() {
  const from = document.getElementById('bk-f-from')?.value;
  const to = document.getElementById('bk-f-to')?.value;
  const van = document.getElementById('bk-f-van')?.value;
  const status = document.getElementById('bk-f-status')?.value;
  const search = (document.getElementById('bk-f-search')?.value || '').toLowerCase();

  const filtered = allBookings.filter((b) => {
    if (from && b.scheduled_date < from) return false;
    if (to && b.scheduled_date > to) return false;
    if (van && String(b.van_number) !== van) return false;
    if (status && b.status !== status) return false;
    if (search) {
      const name = (
        b.client_name ||
        b.profiles?.full_name ||
        b.profiles?.email ||
        ''
      ).toLowerCase();
      if (!name.includes(search)) return false;
    }
    return true;
  });

  renderBookingsTable(filtered);
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
  const revenue = completed.reduce((s, b) => s + (b.service_price || 0), 0);
  const el = (id) => document.getElementById(id);
  if (el('bk-total')) el('bk-total').textContent = data.length;
  if (el('bk-confirmed'))
    el('bk-confirmed').textContent = data.filter((b) => b.status === 'confirmed').length;
  if (el('bk-pending'))
    el('bk-pending').textContent = data.filter((b) => b.status === 'pending').length;
  if (el('bk-revenue')) el('bk-revenue').textContent = '$' + revenue.toLocaleString();
  if (el('bk-sub'))
    el('bk-sub').textContent = `${data.length} booking${data.length !== 1 ? 's' : ''} · filtered`;

  if (!data.length) {
    tbody.innerHTML =
      '<tr><td colspan="8"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;gap:10px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><div style="font-size:14px;font-weight:600;color:var(--mgray)">No bookings found</div><div style="font-size:12px;color:var(--mgray);opacity:0.7">Try adjusting your filters</div></div></td></tr>';
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
      const safeName = name.replace(/"/g, '&quot;');
      return `<tr>
      <td data-label="Date">${date}</td>
      <td data-label="Client"><b>${name}</b></td>
      <td data-label="Service">${esc(b.service_name || '—')}</td>
      <td data-label="Suburb">${esc(b.suburb || '—')}</td>
      <td data-label="Van"><span class="mech-tag v${b.van_number || 1}">Van ${b.van_number || 1}</span></td>
      <td data-label="Status"><span class="status ${stClass[st] || 'pending'}"><span class="status-dot"></span>${st.charAt(0).toUpperCase() + st.slice(1)}</span></td>
      <td data-label="Price"><b>$${b.service_price || 0}</b></td>
      <td data-label="Actions" style="white-space:nowrap">
        ${isPending ? `<button data-bk-action="confirm" data-id="${b.id}" style="background:#ECFDF5;color:#059669;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-right:4px">Confirm</button>` : ''}
        ${!isCancelled ? `<button data-bk-action="chat" data-id="${b.id}" data-name="${safeName}" style="background:#F5F0FF;color:#7C3AED;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-right:4px">Chat</button>` : ''}
        ${b.tracking_token ? `<button data-bk-action="track" data-token="${b.tracking_token}" style="background:#EFF6FF;color:#1848C8;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-right:4px" title="Copy tracking link">Track</button>` : ''}
        ${!isCancelled ? `<button data-bk-action="cancel" data-id="${b.id}" style="background:#FEF2F2;color:#DC2626;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Cancel</button>` : ''}
      </td>
    </tr>`;
    })
    .join('');

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
    pending: '#D97706',
    confirmed: '#059669',
    enroute: '#1848C8',
    completed: '#6B7280',
    cancelled: '#DC2626',
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
      return `<div style="padding:10px 12px;border-radius:8px;margin-bottom:4px;background:var(--off);cursor:pointer" onclick="go('bookings',document.querySelector('[onclick*=bookings]'))">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <div style="font-size:13px;font-weight:600;color:var(--navy)">${name}</div>
        <span style="font-size:10px;color:#fff;background:${stColors[st] || '#6B7280'};padding:2px 7px;border-radius:10px;font-weight:600">${st}</span>
      </div>
      <div style="font-size:12px;color:var(--mgray)">${b.service_name || 'Service'} · ${esc(b.suburb || '—')}</div>
      <div style="font-size:11px;color:var(--mgray);margin-top:2px">${time} · $${b.service_price || 0}</div>
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
    'padding:10px 12px;border-radius:8px;margin-bottom:4px;background:#EEF3FC;border-left:3px solid #1848C8;animation:fadeSlideIn .3s';
  div.innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--navy)">🔔 New booking</div>
    <div style="font-size:12px;color:var(--mgray)">${b.service_name || 'Service'} · ${esc(b.suburb || '—')}</div>
    <div style="font-size:11px;color:var(--mgray);margin-top:2px">${time} · $${b.service_price || 0}</div>`;
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
    .select('service_price,client_rating,completed_at,scheduled_date,status')
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

function suburbCoord(b) {
  const key = (b.suburb || '').trim().toLowerCase();
  if (SUBURB_COORDS[key]) return SUBURB_COORDS[key];
  // try matching first word of address
  const addr = (b.address || '').toLowerCase();
  for (const name in SUBURB_COORDS) {
    if (addr.includes(name)) return SUBURB_COORDS[name];
  }
  return null;
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

  const VAN_COLORS = { 1: '#1848C8', 2: '#D97706' };
  const latlngs = [];
  stops.forEach((s, i) => {
    const color = VAN_COLORS[s.van_number] || '#1848C8';
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
    L.polyline(latlngs, { color: '#1848C8', weight: 3, opacity: 0.5, dashArray: '6 6' }).addTo(
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
          const color = VAN_COLORS[s.van_number] || '#1848C8';
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--off);border-radius:8px;border-left:3px solid ${color}">
        <div style="width:24px;height:24px;border-radius:50%;background:${color};color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--navy)">${esc(s.client_name || 'Client')} · ${esc(s.suburb || '—')}</div>
          <div style="font-size:11px;color:var(--mgray)">${esc(s.service_name || '')} · ${s.scheduled_time || '—'} · Van ${s.van_number || 1}</div>
        </div>
        <div style="font-size:11px;color:var(--mgray);white-space:nowrap">${leg.toFixed(1)} km</div>
      </div>`;
        })
        .join('') +
      `<div style="text-align:right;font-size:12px;color:var(--mgray);padding:4px 12px 0;font-weight:600">Total: ${totalKm.toFixed(1)} km</div>`;
  }
}

// ── Analytics: funnel, heatmap, margins, LTV/churn (#20-23) ──────────────────
let _heatMap = null,
  _heatLayer = null;

async function loadAnalytics() {
  const { data, error } = await sb
    .from('bookings')
    .select(
      'id,client_id,client_name,client_email,service_name,service_price,suburb,address,status,scheduled_date,created_at,profiles(full_name,email)'
    )
    .limit(5000);
  if (error) {
    showToast('Analytics load error: ' + error.message);
    return;
  }
  const all = data || [];

  renderFunnel(all);
  renderHeatmap(all);
  renderMargins(all);
  renderLTV(all);
}

// #20 Conversion funnel
function renderFunnel(all) {
  const el = document.getElementById('an-funnel');
  if (!el) return;
  const total = all.length;
  const confirmed = all.filter((b) =>
    ['confirmed', 'enroute', 'en_route', 'in_progress', 'arrived', 'completed'].includes(b.status)
  ).length;
  const completed = all.filter((b) => b.status === 'completed').length;
  const cancelled = all.filter((b) => b.status === 'cancelled').length;
  const steps = [
    { label: 'Bookings created', val: total, color: '#1848C8' },
    { label: 'Confirmed / assigned', val: confirmed, color: '#0A58CA' },
    { label: 'Completed', val: completed, color: '#059669' },
  ];
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
  el.innerHTML =
    steps
      .map(
        (s, i) => `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="font-weight:600;color:var(--navy)">${s.label}</span>
        <span style="color:var(--mgray)">${s.val} · ${pct(s.val)}%${i > 0 && steps[i - 1].val ? ` · ${Math.round((s.val / steps[i - 1].val) * 100)}% of prev` : ''}</span>
      </div>
      <div style="height:14px;background:var(--off);border-radius:7px;overflow:hidden"><div style="height:100%;width:${pct(s.val)}%;background:${s.color};border-radius:7px"></div></div>
    </div>`
      )
      .join('') +
    `<div style="font-size:12px;color:var(--red);margin-top:6px">${cancelled} cancelled (${pct(cancelled)}% of all bookings)</div>`;
}

// #21 Geographic heatmap
function renderHeatmap(all) {
  const mapEl = document.getElementById('an-heatmap');
  if (!mapEl || typeof L === 'undefined') return;
  const counts = {};
  all.forEach((b) => {
    const c = suburbCoord(b);
    if (!c) return;
    const key = (b.suburb || '').trim().toLowerCase() || c.join(',');
    if (!counts[key]) counts[key] = { coord: c, n: 0, name: b.suburb || 'Area', rev: 0 };
    counts[key].n++;
    counts[key].rev += b.service_price || 0;
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
    const color = intensity > 0.66 ? '#DC2626' : intensity > 0.33 ? '#D97706' : '#1848C8';
    L.circleMarker(p.coord, { radius, color, weight: 1, fillColor: color, fillOpacity: 0.45 })
      .bindPopup(
        `<b>${esc(p.name)}</b><br>${p.n} booking${p.n !== 1 ? 's' : ''}<br>$${p.rev.toLocaleString()} revenue`
      )
      .addTo(_heatLayer);
  });
  if (points.length) _heatMap.fitBounds(L.latLngBounds(points.map((p) => p.coord)).pad(0.2));
  setTimeout(() => _heatMap && _heatMap.invalidateSize(), 100);
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
    byService[name].rev += b.service_price || 0;
  });
  const rows = Object.entries(byService).sort((a, b) => b[1].rev - a[1].rev);
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--mgray);padding:24px">No completed jobs yet</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(([name, d]) => {
      const avg = Math.round(d.rev / d.jobs);
      const cost = d.jobs * VAR_COST_PER_JOB; // variable parts cost
      const net = d.rev - Math.round(d.rev / 11); // ex-GST
      const profit = net - cost;
      const margin = net > 0 ? Math.round((profit / net) * 100) : 0;
      const mColor = margin >= 70 ? 'var(--green)' : margin >= 50 ? 'var(--amber)' : 'var(--red)';
      return `<tr>
      <td data-label="Service"><b>${esc(name)}</b></td>
      <td data-label="Jobs">${d.jobs}</td>
      <td data-label="Revenue">$${d.rev.toLocaleString()}</td>
      <td data-label="Avg ticket">$${avg}</td>
      <td data-label="Est. cost">$${cost.toLocaleString()}</td>
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
    byClient[key].ltv += b.service_price || 0;
    if (!byClient[key].last || b.scheduled_date > byClient[key].last)
      byClient[key].last = b.scheduled_date;
  });
  const clients = Object.values(byClient).sort((a, b) => b.ltv - a.ltv);
  const now = new Date();
  const CHURN_DAYS = 120;
  const daysSince = (d) => (d ? Math.floor((now - new Date(d + 'T00:00:00')) / 86400000) : 9999);
  const churned = clients.filter((c) => daysSince(c.last) > CHURN_DAYS);
  const active = clients.length - churned.length;
  const avgLtv = clients.length
    ? Math.round(clients.reduce((s, c) => s + c.ltv, 0) / clients.length)
    : 0;
  const repeatRate = clients.length
    ? Math.round((clients.filter((c) => c.jobs > 1).length / clients.length) * 100)
    : 0;

  if (subEl)
    subEl.textContent = `${clients.length} customers · churn after ${CHURN_DAYS} days inactive`;
  if (kpisEl)
    kpisEl.innerHTML = [
      ['Avg LTV', '$' + avgLtv.toLocaleString(), 'var(--green)'],
      ['Active customers', String(active), 'var(--blue)'],
      ['Churned', String(churned.length), 'var(--red)'],
      ['Repeat rate', repeatRate + '%', 'var(--navy)'],
    ]
      .map(
        ([l, v, c]) => `<div style="background:var(--off);border-radius:10px;padding:14px 16px">
      <div style="font-size:11px;color:var(--mgray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${l}</div>
      <div style="font-size:22px;font-weight:800;color:${c}">${v}</div></div>`
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
      <td data-label="LTV"><b style="color:var(--green)">$${c.ltv.toLocaleString()}</b></td>
      <td data-label="Last service">${lastStr} <span style="color:var(--mgray);font-size:11px">(${ds > 9000 ? 'never' : ds + 'd ago'})</span></td>
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
        const totalRev = data.reduce((s, b) => s + (b.service_price || 0), 0);
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
        const colors = { 1: '#1848C8', 2: '#D97706' };
        return `<div style="background:var(--off);border-radius:10px;padding:16px">
        <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:12px">🚐 Van ${v}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
          <div style="background:var(--white);border-radius:8px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:${colors[v]}">${totalJobs}</div><div style="font-size:10px;color:var(--mgray);margin-top:2px;text-transform:uppercase">Jobs done</div></div>
          <div style="background:var(--white);border-radius:8px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:var(--green)">$${totalRev}</div><div style="font-size:10px;color:var(--mgray);margin-top:2px;text-transform:uppercase">Revenue</div></div>
          <div style="background:var(--white);border-radius:8px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:var(--gold)">${avgRating}${avgRating !== '—' ? '★' : ''}</div><div style="font-size:10px;color:var(--mgray);margin-top:2px;text-transform:uppercase">Avg rating</div></div>
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
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:100%;height:${h}%;background:${v2 > 0 ? colors[v] : '#E5E7EB'};border-radius:3px 3px 0 0;transition:height .4s" title="${v2} job${v2 !== 1 ? 's' : ''}"></div><div style="font-size:8px;color:var(--mgray)">${day}</div></div>`;
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
async function loadClients() {
  const { data } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  const grid = document.querySelector('#page-clients .clients-grid');
  if (!grid) return;
  const colors = ['#1848C8', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DC2626'];
  if (!data || data.length === 0) {
    grid.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;color:var(--mgray);padding:48px;font-size:14px">No clients yet — they will appear here when they sign up.</div>';
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
        <div class="cl-av" style="background:${colors[i % colors.length]}">${initials}</div>
        <div style="flex:1"><div class="cl-name">${name}</div><div class="cl-suburb">${c.email || ''}</div></div>
        <span class="cl-seg ${segClass}">${segLabel}</span>
      </div>
      <div class="cl-stats">
        <div class="cl-stat"><div class="cl-stat-n">${mem !== 'none' ? '✓' : '—'}</div><div class="cl-stat-l">Member</div></div>
        <div class="cl-stat"><div class="cl-stat-n">${c.role || 'client'}</div><div class="cl-stat-l">Role</div></div>
        <div class="cl-stat"><div class="cl-stat-n">${new Date(c.created_at).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}</div><div class="cl-stat-l">Joined</div></div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button data-cl-action="bikes" data-id="${c.id}" data-name="${esc(name).replace(/"/g, '&quot;')}" style="flex:1;padding:7px;background:var(--off);border:1px solid var(--border);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--sans);color:var(--navy)">Bikes</button>
        <button data-cl-action="chat" data-id="${c.id}" data-name="${esc(name).replace(/"/g, '&quot;')}" style="flex:1;padding:7px;background:var(--off);border:1px solid var(--border);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--sans);color:var(--navy)">Chat</button>
      </div>
    </div>`;
    })
    .join('');
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cl-action]');
    if (!btn) return;
    if (btn.dataset.clAction === 'bikes') viewClientBikes(btn.dataset.id, btn.dataset.name);
    else if (btn.dataset.clAction === 'chat') openAdminChat(btn.dataset.id, btn.dataset.name);
  });
  const kpis = document.querySelectorAll('#page-clients .kpi-value');
  if (kpis[0]) kpis[0].textContent = data.length;
  if (kpis[1]) kpis[1].textContent = data.filter((c) => c.membership_plan === 'vip').length;
  const thisMonth = new Date();
  thisMonth.setDate(1);
  if (kpis[2]) kpis[2].textContent = data.filter((c) => new Date(c.created_at) > thisMonth).length;
}

// ── VAN ZONES ─────────────────────────────────────────────────────────────────
let vanZones = [];

async function loadVanZones() {
  const { data } = await sb.from('van_zones').select('*').eq('active', true).order('van_number');
  if (data && data.length > 0) {
    const grouped = {};
    data.forEach((row) => {
      if (!grouped[row.van_number]) {
        const colors = { 1: '#1848C8', 2: '#D97706', 3: '#7C3AED', 4: '#DC2626' };
        grouped[row.van_number] = {
          id: row.van_number,
          name: 'Van ' + row.van_number,
          color: colors[row.van_number] || '#1848C8',
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

async function saveVanZone(vanId) {
  const van = vanZones.find((v) => v.id === vanId);
  if (!van) return;
  await sb.from('van_zones').delete().eq('van_number', vanId);
  if (van.suburbs.length > 0) {
    await sb
      .from('van_zones')
      .insert(
        van.suburbs.map((s) => ({ van_number: vanId, suburb: s, postcode: '', active: true }))
      );
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
          ${vanZones.length > 1 ? `<button onclick="removeVan(${van.id})" style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.7);padding:4px 8px;border-radius:6px;font-size:12px;cursor:pointer">✕</button>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:11px;color:rgba(255,255,255,0.7);white-space:nowrap">👤</span>
          <input id="driver-${van.id}" value="${van.driverName || ''}" placeholder="Mechanic name"
            style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:6px 10px;font-size:13px;color:#fff;font-family:Inter,sans-serif;outline:none;flex:1;min-width:0"
            onblur="saveDriverName(${van.id},this.value)">
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:11px;color:rgba(255,255,255,0.6)">${van.suburbs.length} suburbs</div>
          <button onclick="saveVanZone(${van.id})" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:500;font-family:Inter,sans-serif">Save changes</button>
        </div>
      </div>
      <div style="padding:16px 20px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
          ${van.suburbs.map((s) => `<span style="display:inline-flex;align-items:center;gap:6px;background:#EEF3FC;color:#1848C8;border:1px solid rgba(24,72,200,0.2);border-radius:20px;padding:5px 12px;font-size:12px;font-weight:500">${s}<span onclick="removeSuburb(${van.id},'${s}')" style="cursor:pointer;font-size:14px;opacity:.6;line-height:1">×</span></span>`).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <input id="inp-${van.id}" placeholder="Add suburb (e.g. Bondi)" onkeydown="if(event.key==='Enter')addSuburb(${van.id})"
            style="flex:1;border:1.5px solid var(--border);border-radius:8px;padding:9px 14px;font-size:13px;font-family:Inter,sans-serif;outline:none">
          <button onclick="addSuburb(${van.id})" style="background:#1848C8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif">+ Add</button>
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
  if (!van || van.suburbs.includes(suburb)) {
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
  const colors = { 1: '#1848C8', 2: '#D97706', 3: '#7C3AED', 4: '#DC2626' };
  vanZones.push({
    id: newId,
    name: 'Van ' + newId,
    color: colors[newId] || '#6B7280',
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

// ── CHART ─────────────────────────────────────────────────────────────────────
const days = [
  980, 1120, 850, 1340, 1580, 0, 1210, 1050, 1420, 1680, 1240, 0, 1380, 1520, 980, 1620, 1750, 0,
  1290, 1440, 1180, 1560, 1830, 0, 1120, 890,
];
const max = Math.max(...days);
const chart = document.getElementById('chart');
if (chart)
  chart.innerHTML = days
    .map(
      (v, i) =>
        `<div class="bar-wrap"><div class="bar" style="height:${v ? Math.max((v / max) * 100, 4) : 4}%;background:${v ? '#1848C8' : '#F3F4F6'};opacity:${v ? 1 : 0.3}" title="$${v}"></div>${i % 7 === 0 ? `<div class="bar-label">${['W1', 'W2', 'W3', 'W4'][Math.floor(i / 7)]}</div>` : '<div class="bar-label"></div>'}</div>`
    )
    .join('');

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
      '<div style="text-align:center;color:var(--mgray);padding:48px;font-size:14px">No contacts yet. Add your first contact above.</div>';
    return;
  }
  const roleColors = { manager: '#1848C8', mechanic: '#059669' };
  const roleBg = { manager: '#EEF3FC', mechanic: '#ECFDF5' };
  list.innerHTML = data
    .map(
      (c) => `
    <div style="background:var(--white);border-radius:12px;border:1px solid var(--border);padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:40px;height:40px;border-radius:50%;background:${roleBg[c.role] || '#F3F4F6'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:${roleColors[c.role] || '#6B7280'};flex-shrink:0">
          ${c.first_name[0]}${c.last_name[0]}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;color:var(--navy)">${c.first_name} ${c.last_name}</div>
          <div style="font-size:12px;color:var(--mgray)">${c.phone}</div>
        </div>
        <span style="background:${roleBg[c.role] || '#F3F4F6'};color:${roleColors[c.role] || '#6B7280'};font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;text-transform:capitalize;flex-shrink:0">${c.role}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="editContact('${c.id}','${c.first_name}','${c.last_name}','${c.phone}','${c.role}')" style="flex:1;background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:7px;padding:7px;font-size:12px;cursor:pointer;font-family:Inter,sans-serif;font-weight:500">Edit</button>
        <button onclick="deleteContact('${c.id}')" style="flex:1;background:#FEF2F2;border:1.5px solid #FECACA;color:#DC2626;border-radius:7px;padding:7px;font-size:12px;cursor:pointer;font-family:Inter,sans-serif;font-weight:500">Delete</button>
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
  document.getElementById('modal-role').value = 'mechanic';
  document.getElementById('contact-modal').style.display = 'flex';
}

function closeContactModal() {
  document.getElementById('contact-modal').style.display = 'none';
}

function editContact(id, fname, lname, phone, role) {
  document.getElementById('modal-title').textContent = 'Edit Contact';
  document.getElementById('modal-id').value = id;
  document.getElementById('modal-fname').value = fname;
  document.getElementById('modal-lname').value = lname;
  document.getElementById('modal-phone').value = phone;
  document.getElementById('modal-role').value = role;
  document.getElementById('contact-modal').style.display = 'flex';
}

async function saveContact() {
  const id = document.getElementById('modal-id').value;
  const fname = document.getElementById('modal-fname').value.trim();
  const lname = document.getElementById('modal-lname').value.trim();
  const phone = document.getElementById('modal-phone').value.trim();
  const role = document.getElementById('modal-role').value;
  if (!fname || !lname || !phone) {
    showToast('Please fill all fields');
    return;
  }
  if (id) {
    await sb
      .from('escalation_contacts')
      .update({ first_name: fname, last_name: lname, phone, role })
      .eq('id', id);
    showToast('Contact updated ✓');
  } else {
    await sb
      .from('escalation_contacts')
      .insert({ first_name: fname, last_name: lname, phone, role, active: true });
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
  document.getElementById('inv-stock-value').textContent = '$' + stockValue.toFixed(0);
  document.getElementById('inv-used-month').textContent = '$0'; // updated from bookings later

  if (!inventoryData.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div style="display:flex;flex-direction:column;align-items:center;padding:48px 24px;gap:10px">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border)" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      <div style="font-size:14px;font-weight:600;color:var(--mgray)">No parts yet</div>
      <div style="font-size:12px;color:var(--mgray);opacity:.7">Add your first part to start tracking stock</div>
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
    const statusBg = isOut ? '#FEF2F2' : isLow ? '#FEF9C3' : '#F0FDF4';
    const statusCl = isOut ? '#DC2626' : isLow ? '#92400E' : '#15803D';
    return `<tr>
      <td data-label="Part" style="font-weight:600">${escapeHtml(p.name)}</td>
      <td data-label="Stock" style="font-weight:700;font-size:15px;color:${isLow ? '#DC2626' : 'var(--navy)'}">${p.stock}</td>
      <td data-label="Min" style="color:var(--mgray)">${p.min_stock}</td>
      <td data-label="Cost">$${parseFloat(p.cost_price || 0).toFixed(2)}</td>
      <td data-label="Client price" style="font-weight:700;color:var(--blue)">${p.sell_price !== null && p.sell_price !== undefined ? '$' + parseFloat(p.sell_price).toFixed(2) : '—'}</td>
      <td data-label="Status"><span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:${statusBg};color:${statusCl}">${statusTxt}</span></td>
      <td data-label="Actions">
        <div style="display:flex;gap:6px">
          <button onclick="adjustStock('${p.id}',${p.stock},-1)" style="background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:3px 10px;font-size:14px;cursor:pointer;font-weight:700">−</button>
          <button onclick="adjustStock('${p.id}',${p.stock},1)"  style="background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:3px 10px;font-size:14px;cursor:pointer;font-weight:700">+</button>
          <button onclick="openPartModal('${p.id}')" style="background:var(--white);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer">Edit</button>
          <button onclick="deletePart('${p.id}')" style="background:#FEF2F2;border:1.5px solid #FECACA;color:#DC2626;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer">✕</button>
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
    <div style="font-size:16px;font-weight:700;color:var(--navy);margin-bottom:16px">${p ? 'Edit part' : 'Add part'}</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Part name</div>
        <input class="inp" id="pm-name" value="${p?.name || ''}" placeholder="e.g. Brake pads (Shimano B01S)"></div>
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Category</div>
        <select class="inp" id="pm-cat" style="cursor:pointer">${cats.map((c) => `<option value="${c}"${(p?.category || 'General') === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Current stock</div>
          <input class="inp" id="pm-stock" type="number" min="0" value="${p?.stock || 0}"></div>
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Min stock</div>
          <input class="inp" id="pm-min" type="number" min="0" value="${p?.min_stock || 5}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Cost price ($)</div>
          <input class="inp" id="pm-cost" type="number" min="0" step="0.01" value="${p?.cost_price || 0}" placeholder="0.00"></div>
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Client price ($)</div>
          <input class="inp" id="pm-sell" type="number" min="0" step="0.01" value="${p?.sell_price ?? ''}" placeholder="0.00"></div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button onclick="document.getElementById('part-modal').remove()" style="flex:1;background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">Cancel</button>
      <button onclick="savePart('${p?.id || ''}')" style="flex:2;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">Save</button>
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

function renderServices() {
  const tbody = document.getElementById('svc-tbody');
  if (!tbody) return;

  const total = servicesData.length;
  const cats = new Set(servicesData.map((s) => s.category)).size;
  const avg = total ? servicesData.reduce((sum, s) => sum + (s.price || 0), 0) / total : 0;
  const prices = servicesData.map((s) => s.price || 0);

  document.getElementById('svc-total').textContent = total;
  document.getElementById('svc-cats').textContent = cats;
  document.getElementById('svc-avg').textContent = '$' + avg.toFixed(0);
  document.getElementById('svc-range').textContent = total
    ? '$' + Math.min(...prices) + ' - $' + Math.max(...prices)
    : '$—';

  if (!total) {
    tbody.innerHTML = `<tr><td colspan="5"><div style="display:flex;flex-direction:column;align-items:center;padding:48px 24px;gap:10px">
      <div style="font-size:14px;font-weight:600;color:var(--mgray)">No services yet</div>
      <div style="font-size:12px;color:var(--mgray);opacity:.7">Add your first service to start the catalog</div>
    </div></td></tr>`;
    return;
  }

  const q = (document.getElementById('svc-search')?.value || '').trim().toLowerCase();
  const filtered = q
    ? servicesData.filter(
        (s) => s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q)
      )
    : servicesData;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--mgray)">No services match "${escapeHtml(q)}"</td></tr>`;
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
      <td data-label="Service" style="font-weight:600">${escapeHtml(s.name)}</td>
      <td data-label="Category" style="color:var(--mgray)">${escapeHtml(s.category || '')}</td>
      <td data-label="Price" style="font-weight:700;font-size:15px;color:var(--blue)">$${parseFloat(s.price || 0).toFixed(0)}</td>
      <td data-label="Duration" style="color:var(--mgray)">${durationLabel(s)}</td>
      <td data-label="Actions">
        <div style="display:flex;gap:6px">
          <button onclick="openServiceModal('${s.id}')" style="background:var(--white);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer">Edit</button>
          <button onclick="deleteService('${s.id}')" style="background:#FEF2F2;border:1.5px solid #FECACA;color:#DC2626;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer">✕</button>
        </div>
      </td>
    </tr>`;
  }

  tbody.innerHTML = SERVICE_CATEGORIES.filter((cat) => byCat[cat]?.length)
    .map(
      (cat) =>
        `<tr><td colspan="5" style="background:var(--off);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--mgray);padding:8px 12px">${escapeHtml(cat)}</td></tr>` +
        byCat[cat].map(svcRow).join('')
    )
    .join('');
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
    <div style="font-size:16px;font-weight:700;color:var(--navy);margin-bottom:16px">${s ? 'Edit service' : 'Add service'}</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Service name</div>
        <input class="inp" id="sm-name" value="${s?.name ? escapeHtml(s.name) : ''}" placeholder="e.g. Chain Install"></div>
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Category</div>
        <select class="inp" id="sm-cat" style="cursor:pointer">${SERVICE_CATEGORIES.map((c) => `<option value="${c}"${(s?.category || SERVICE_CATEGORIES[0]) === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Price ($)</div>
        <input class="inp" id="sm-price" type="number" min="0" step="1" value="${s?.price ?? ''}" placeholder="0"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Min duration (min)</div>
          <input class="inp" id="sm-dmin" type="number" min="0" value="${s?.duration_min ?? ''}"></div>
        <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Max duration (min)</div>
          <input class="inp" id="sm-dmax" type="number" min="0" value="${s?.duration_max ?? ''}"></div>
      </div>
      <div><div style="font-size:11px;font-weight:600;color:var(--mgray);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Description</div>
        <input class="inp" id="sm-desc" value="${s?.description ? escapeHtml(s.description) : ''}" placeholder="Shown to clients when booking"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button onclick="document.getElementById('service-modal').remove()" style="flex:1;background:var(--off);border:1.5px solid var(--border);color:var(--navy);border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">Cancel</button>
      <button onclick="saveService('${s?.id || ''}')" style="flex:2;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">Save</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
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
      pending: '#F59E0B',
      confirmed: '#1848C8',
      enroute: '#059669',
      completed: '#6B7280',
    };
    const stBg = {
      pending: '#FEF9C3',
      confirmed: '#EEF3FC',
      enroute: '#ECFDF5',
      completed: '#F3F4F6',
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
            return `<div style="font-size:10px;background:${stBg[st] || '#F3F4F6'};border-left:2px solid ${stColors[st] || '#6B7280'};border-radius:3px;padding:2px 4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" onclick="go('bookings')">${tm} ${nm}</div>`;
          })
          .join('')}
        ${dayJobs.length > 3 ? `<div style="font-size:10px;color:var(--mgray)">+${dayJobs.length - 3} more</div>` : ''}
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
    pending: '#F59E0B',
    confirmed: '#1848C8',
    enroute: '#059669',
    completed: '#6B7280',
  };
  const stBg = {
    pending: '#FEF9C3',
    confirmed: '#EEF3FC',
    enroute: '#ECFDF5',
    completed: '#F3F4F6',
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
        ${dayJobs.length > 0 ? `<div style="font-size:10px;color:${isToday ? 'rgba(255,255,255,0.7)' : 'var(--mgray)'};">${dayJobs.length} job${dayJobs.length > 1 ? 's' : ''}</div>` : ''}
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
                  return `<div style="background:${stBg[st] || '#F3F4F6'};border-left:3px solid ${stColors[st] || '#6B7280'};border-radius:6px;padding:6px 8px;cursor:pointer" onclick="go('bookings')">
              <div style="font-size:11px;font-weight:700;color:${stColors[st] || '#6B7280'}">${time}</div>
              <div style="font-size:12px;font-weight:600;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
              <div style="font-size:10px;color:var(--mgray);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${j.service_name || ''}</div>
              <div style="font-size:10px;font-weight:600;color:${stColors[st]};margin-top:2px">Van ${van}</div>
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
    <div style="font-size:10px;color:var(--mgray);font-weight:600">${label}</div>
    ${
      isPhoto
        ? `<img src="${photoUrl}" style="max-width:200px;border-radius:10px;cursor:pointer" onclick="window.open('${photoUrl}','_blank')">`
        : `<div style="background:${bg};color:${color};padding:8px 12px;border-radius:12px;font-size:13px;max-width:280px;word-break:break-word">${msg.message}</div>`
    }
    <div style="font-size:10px;color:var(--mgray)">${time}</div>
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
      waStatus.style.color = '#059669';
    }
    const twilioEl = document.getElementById('integ-twilio');
    if (twilioEl) {
      twilioEl.textContent = '✓ Active';
      twilioEl.style.color = '#059669';
    }
  } else {
    if (waStatus) {
      waStatus.textContent = 'No number configured — WhatsApp messages are currently disabled.';
      waStatus.style.color = '';
    }
    const twilioEl = document.getElementById('integ-twilio');
    if (twilioEl) {
      twilioEl.textContent = 'SMS only (no WhatsApp number)';
      twilioEl.style.color = '#F59E0B';
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
    waStatus.style.color = '#059669';
  }
  const twilioEl = document.getElementById('integ-twilio');
  if (twilioEl) {
    twilioEl.textContent = '✓ Active';
    twilioEl.style.color = '#059669';
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
        el.style.color = '#059669';
      } else {
        el.textContent = '✓ SMS active';
        el.style.color = '#059669';
      }
    } else {
      el.textContent = '⚠ Needs keys';
      el.style.color = '#F59E0B';
    }
  } catch (e) {
    el.textContent = '⚠ Needs keys';
    el.style.color = '#F59E0B';
  }
}

// ── MEMBERSHIPS ───────────────────────────────────────────────────────────────
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
      'full_name,email,membership_plan,membership_status,membership_started_at,membership_renewed_at,stripe_subscription_id'
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

  const active = (data || []).filter((m) => m.membership_status === 'active').length;
  const pastDue = (data || []).filter((m) => m.membership_status === 'past_due').length;
  const prices = { basic: 57, standard: 97, vip: 147 };
  const mrr = (data || [])
    .filter((m) => m.membership_status === 'active')
    .reduce((s, m) => s + (prices[m.membership_plan] || 0), 0);

  const kpiActive = document.getElementById('mem-kpi-active');
  const kpiPastdue = document.getElementById('mem-kpi-pastdue');
  const kpiMrr = document.getElementById('mem-kpi-mrr');
  if (kpiActive) kpiActive.textContent = active;
  if (kpiPastdue) kpiPastdue.textContent = pastDue;
  if (kpiMrr) kpiMrr.textContent = '$' + mrr + '/mo';

  if (!data?.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:48px;color:var(--mgray);font-size:14px">No active memberships yet</td></tr>';
    return;
  }

  const planLabel = { basic: 'Basic $57', standard: 'Standard $97', vip: 'VIP $147' };
  const statusBadge = {
    active:
      '<span style="background:#ECFDF5;color:#059669;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">Active</span>',
    past_due:
      '<span style="background:#FEF3C7;color:#D97706;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">Past Due</span>',
    cancelled:
      '<span style="background:#FEE2E2;color:#DC2626;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">Cancelled</span>',
    paused:
      '<span style="background:#F3F4F6;color:#6B7280;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">Paused</span>',
  };

  tbody.innerHTML = data
    .map((m) => {
      const name = m.full_name || m.email?.split('@')[0] || '—';
      const plan = planLabel[m.membership_plan] || m.membership_plan || '—';
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
        ? '<span style="font-size:10px;color:var(--mgray);font-family:monospace">' +
          m.stripe_subscription_id +
          '</span>'
        : '—';
      return (
        '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:12px 16px;font-weight:600;color:var(--navy)">' +
        name +
        '</td>' +
        '<td style="padding:12px 16px;font-size:12px;color:var(--mgray)">' +
        (m.email || '—') +
        '</td>' +
        '<td style="padding:12px 16px">' +
        plan +
        '</td>' +
        '<td style="padding:12px 16px">' +
        badge +
        '</td>' +
        '<td style="padding:12px 16px;font-size:12px;white-space:nowrap">' +
        started +
        '</td>' +
        '<td style="padding:12px 16px;font-size:12px;white-space:nowrap">' +
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
  const zoneBg = { 1: '#EEF3FC', 2: '#F0FDF4', all: '#FEF9C3', '': '#FEF9C3' };
  const zoneColor = { 1: '#1848C8', 2: '#15803D', all: '#92400E', '': '#92400E' };
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
        <div style="width:36px;height:36px;border-radius:50%;background:${zoneBg[zone]};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${zoneColor[zone]};flex-shrink:0">${initials}</div>
        <div style="font-size:14px;font-weight:600;color:var(--navy);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${roleIcon[c.role] || ''} ${c.first_name} ${c.last_name}</div>
        <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:${zoneBg[zone]};color:${zoneColor[zone]};white-space:nowrap;flex-shrink:0">${zoneLabel[zone]}</span>
      </div>
      <!-- Fila 2: teléfono + canal + botones -->
      <div style="display:flex;align-items:center;gap:8px;padding-left:46px">
        <span style="font-size:12px;color:var(--mgray);flex:1">${c.phone} · ${channelIcon[channel]} ${channel.toUpperCase()}</span>
        <button onclick="editNotifNumber('${c.id}')"
          style="background:var(--white);border:1.5px solid var(--border);color:var(--navy);border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-family:Inter,sans-serif;font-weight:500;white-space:nowrap">Edit</button>
        <button onclick="deleteNotifNumber('${c.id}')"
          style="background:#FEF2F2;border:1.5px solid #FECACA;color:#DC2626;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:Inter,sans-serif;font-weight:500">✕</button>
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
  updateZoneVisibility();
  document.getElementById('notif-modal').style.display = 'flex';
}

function closeNotifModal() {
  document.getElementById('notif-modal').style.display = 'none';
}

function updateZoneVisibility() {
  const role = document.getElementById('notif-modal-role').value;
  const zoneWrap = document.getElementById('notif-modal-zone-wrap');
  if (zoneWrap) zoneWrap.style.display = role === 'manager' ? 'none' : 'block';
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
  updateZoneVisibility();
  document.getElementById('notif-modal').style.display = 'flex';
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

  let error;
  if (id) {
    ({ error } = await sb.from('escalation_contacts').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('escalation_contacts').insert(payload));
  }

  if (error) {
    showToast('Save failed: ' + error.message);
    return;
  }
  closeNotifModal();
  showToast(id ? 'Number updated ✓' : 'Number added ✓');
  loadNotifNumbers();
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
        ? `<img src="${c.photo_url}" alt="${name}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--white);box-shadow:0 2px 8px rgba(0,0,0,0.15)">`
        : `<div style="width:80px;height:80px;border-radius:50%;background:#EFF6FF;border:3px solid var(--white);box-shadow:0 2px 8px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:var(--blue)">${initials}</div>`;
      const roleTag =
        c.role === 'manager'
          ? '<span style="position:absolute;top:10px;right:10px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:#FEF9C3;color:#92400E">⭐ Manager</span>'
          : '<span style="position:absolute;top:10px;right:10px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:#ECFDF5;color:#059669">🔧 Mechanic</span>';

      return `
    <div class="card" style="padding:0;overflow:hidden;width:300px;position:relative">
      ${roleTag}
      <div style="height:90px;width:100%;overflow:hidden;background:#EFF6FF">
        <img src="images/mechanic-working.webp" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
      </div>
      <div style="display:flex;justify-content:center;margin-top:-40px">${avatarHTML}</div>
      <div style="text-align:center;padding:10px 20px 0">
        <div style="font-size:16px;font-weight:700;color:var(--navy)">${name}</div>
        <div style="font-size:12px;color:var(--mgray);margin-top:2px">Dr. Bike Mobile Mechanic</div>
        <div style="font-size:13px;color:#374151;margin-top:8px;min-height:20px">${c.bio || '<span style="color:var(--mgray);font-style:italic">No bio yet — add one so clients feel confident.</span>'}</div>
      </div>
      <div style="display:flex;justify-content:center;gap:24px;padding:14px 20px;margin-top:8px;border-top:1px solid var(--border)">
        <div style="text-align:center"><div style="font-weight:800;font-size:15px;color:var(--navy)">${jobs.length}</div><div style="font-size:11px;color:var(--mgray)">Jobs done</div></div>
        <div style="width:1px;background:var(--border)"></div>
        <div style="text-align:center"><div style="font-weight:800;font-size:15px;color:var(--navy)">${rating ? '★ ' + rating : '—'}</div><div style="font-size:11px;color:var(--mgray)">Rating</div></div>
      </div>
      <div style="padding:14px 20px">
        <button onclick="openMechProfileModal('${c.id}')" style="width:100%;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:11px;font-weight:700;font-size:13px;cursor:pointer;font-family:var(--sans)">Edit profile</button>
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
    .update({ first_name, last_name, photo_url, bio: bio || null })
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
      ? '<p style="color:var(--mgray);font-size:14px;text-align:center;padding:20px">No bikes registered yet.</p>'
      : (bikes || [])
          .map(
            (b) => `
        <div style="background:var(--off);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px">
          <div style="font-weight:700;font-size:14px">${esc(b.nickname)}</div>
          <div style="font-size:12px;color:var(--mgray);margin-top:3px">
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
        <div style="font-size:16px;font-weight:700;color:var(--navy)">🚲 ${esc(clientName)}'s Bikes</div>
        <button onclick="document.getElementById('reassign-modal').style.display='none'" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
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
    <div style="font-size:12px;color:var(--mgray);margin-bottom:10px">${data.filter((s) => s.active).length} active · ${data.filter((s) => !s.active).length} unsubscribed</div>
    <table class="tbl">
      <thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Subscribed</th><th>Status</th></tr></thead>
      <tbody>${data
        .map(
          (s) => `<tr>
        <td style="font-size:13px">${esc(s.email)}</td>
        <td style="font-size:13px">${esc(s.name || '—')}</td>
        <td style="font-size:12px">${esc(s.source || 'website')}</td>
        <td style="font-size:12px">${new Date(s.subscribed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td><span style="background:${s.active ? '#ECFDF5' : '#FEF2F2'};color:${s.active ? '#059669' : '#DC2626'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${s.active ? 'Active' : 'Unsub'}</span></td>
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

async function restoreAdminSession() {
  const access_token = localStorage.getItem('drbike-admin-token');
  const refresh_token = localStorage.getItem('drbike-admin-refresh');
  if (!access_token || !refresh_token) return;
  await sb.auth.setSession({ access_token, refresh_token });
}

async function initAdmin() {
  // Auth via Supabase (api/admin-auth.js). Token stored in localStorage.
  if (checkAdminAuth()) {
    await restoreAdminSession();
    await loadDashboard();
    subscribeToBookings();
  }
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
    <div style="font-size:14px;font-weight:700;color:var(--navy)">🔔 Notifications</div>
    <button onclick="markAllRead()" style="font-size:12px;color:var(--blue);background:none;border:none;cursor:pointer;font-family:Inter,sans-serif;font-weight:500">Mark all read</button>
  </div>
  <div id="notif-list" style="padding:8px"><div style="padding:20px;text-align:center;color:var(--mgray);font-size:13px">Loading...</div></div>`;
  document.body.appendChild(panel);
})();

// ── Avg Service Time KPI (T02) ────────────────────────────────────────────────
async function loadAvgServiceTime() {
  try {
    const { data } = await sb
      .from('bookings')
      .select('service_type, service_duration_seconds')
      .not('service_duration_seconds', 'is', null)
      .eq('status', 'completed');
    if (!data?.length) return;
    const byType = {};
    data.forEach((b) => {
      const t = (b.service_type || 'Other').replace(/\s+/g, '_');
      if (!byType[t]) byType[t] = [];
      byType[t].push(b.service_duration_seconds);
    });
    const overall = data.reduce((a, b) => a + b.service_duration_seconds, 0) / data.length;
    const el = document.getElementById('kpi-avg-time');
    const sub = document.getElementById('kpi-avg-time-sub');
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
    /* non-fatal */
  }
}
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => loadAvgServiceTime(), 1200);
});
