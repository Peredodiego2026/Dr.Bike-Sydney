  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-GXYD68JXZW');

  // Google Maps - optional, only loads if key is set
  const GM_KEY = 'AIzaSyC0rbGMevQfxPNRnes2rRZktUA2O8hP6nY';
  window.googleMapsLoaded = new Promise(r => { window._gmInit = r; });
  if(GM_KEY && !GM_KEY.includes('REPLACE')) {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GM_KEY}&libraries=geometry&callback=_gmInit`;
    s.async = true;
    s.onerror = () => console.warn('Google Maps no disponible');
    document.head.appendChild(s);
  }

// ── HTML ESCAPE HELPER (XSS protection) ──────────────────────────────────────
function esc(str) {
  if(str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── SUPABASE INIT ────────────────────────────────────────────────────────────
initTheme(); // Apply theme before anything renders
const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';

// ── PERSISTENT STORAGE ADAPTER (IndexedDB + localStorage fallback) ───────────
const _IDB = (() => {
  const DB='dr-bike-auth', ST='s', VER=1;
  let _db=null;
  const open=()=>new Promise((res,rej)=>{
    if(_db){res(_db);return;}
    const r=indexedDB.open(DB,VER);
    r.onerror=()=>rej(r.error);
    r.onsuccess=()=>{_db=r.result;res(_db);};
    r.onupgradeneeded=e=>e.target.result.createObjectStore(ST);
  });
  return {
    async get(k){
      try{
        const ls=localStorage.getItem(k);
        if(ls)return ls;
        const db=await open();
        return new Promise((res)=>{
          const req=db.transaction(ST,'readonly').objectStore(ST).get(k);
          req.onsuccess=()=>{
            if(req.result)try{localStorage.setItem(k,req.result);}catch(e){}
            res(req.result??null);
          };
          req.onerror=()=>res(null);
        });
      }catch{return localStorage.getItem(k);}
    },
    async set(k,v){
      try{localStorage.setItem(k,v);}catch(e){}
      try{
        const db=await open();
        const tx=db.transaction(ST,'readwrite');
        tx.objectStore(ST).put(v,k);
      }catch{}
    },
    async remove(k){
      try{localStorage.removeItem(k);}catch{}
      try{
        const db=await open();
        const tx=db.transaction(ST,'readwrite');
        tx.objectStore(ST).delete(k);
      }catch{}
    }
  };
})();

// Configuración default de Supabase - localStorage simple (probado funciona en mobile)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// CRÍTICO: llamar getSession inmediatamente para que detectSessionInUrl procese el #access_token
// Esto debe ejecutarse ANTES que cualquier otro código que pueda interferir
const _initialSessionPromise = sb.auth.getSession();


// ── GLOBAL ERROR HANDLER ──────────────────────────────────────────────────────
window.addEventListener('unhandledrejection', e => {
  const msg = e.reason?.message || '';
  // Solo mostrar banner si realmente estamos offline
  if(!navigator.onLine && (msg.includes('Failed to fetch') || msg.includes('NetworkError'))) {
    console.warn('Network error (offline):', msg);
    showOfflineBanner();
    e.preventDefault();
  }
});
window.addEventListener('online', () => { hideOfflineBanner(); try { loadServices(); loadVanZones(); } catch(e){} });
window.addEventListener('offline', showOfflineBanner);

function showOfflineBanner() {
  let b = document.getElementById('global-offline-banner');
  if(!b) {
    b = document.createElement('div');
    b.id = 'global-offline-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#D97706;color:#fff;padding:10px 16px;font-size:13px;font-weight:600;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px';
    b.innerHTML = "⚡ You're offline — some features may not work";
    document.body.appendChild(b);
  }
  b.style.display = 'flex';
}

function hideOfflineBanner() {
  const b = document.getElementById('global-offline-banner');
  if(b) b.style.display = 'none';
}

// Mostrar banner offline si ya está sin conexión al cargar
if(!navigator.onLine) showOfflineBanner();

// ── APP STATE ────────────────────────────────────────────────────────────────
window.currentUser = null; let currentUser = window.currentUser;
let userProfile = null;
let services = [];
let booking = { service:null, date:null, time:null };
let billing = 'm';
let svcFilter = 'all';

// ── VAN ZONES (persisted in Supabase) ───────────────────────────────────────
let vanZones = [
  { id: 1, name: 'Van 1', color: '#1848C8', suburbs: ['newtown','paddington','bondi','surry hills','glebe','balmain','marrickville','rozelle','annandale','leichhardt','cbd','pyrmont','redfern','chippendale','ultimo','haymarket','darlinghurst','potts point','elizabeth bay','kings cross','woolloomooloo','mosman','coogee','randwick','kingsford','maroubra'] },
  { id: 2, name: 'Van 2', color: '#059669', suburbs: ['north sydney','chatswood','lane cove','manly','dee why','brookvale','mona vale','avalon','cronulla','hurstville','kogarah','strathfield','burwood','ashfield','homebush','ryde','meadowbank','gladesville','hunters hill','drummoyne'] }
];

// ── INIT ─────────────────────────────────────────────────────────────────────
// Garantiza que currentUser esté cargado antes de cualquier acción de auth
async function requireAuth(pendingView, pendingPlan) {
  if(currentUser) return true;
  // Intentar restaurar sesión
  try {
    const { data: { session } } = await sb.auth.getSession();
    if(session?.user){
      currentUser = session.user;
      try { await loadProfile(); } catch(e){}
      updateNavAuth();
      return true;
    }
  } catch(e){}
  // No hay sesión — guardar intención y pedir login
  if(pendingPlan){
    localStorage.setItem('pendingPlanId', pendingPlan);
    localStorage.setItem('pendingView', pendingView || 'membership');
  } else if(pendingView){
    localStorage.setItem('pendingView', pendingView);
  }
  showView('auth');
  return false;
}

function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
function hideLoading(){ document.getElementById('loading').classList.add('hide'); }

// VAPID public key for Web Push — matches VAPID_PUBLIC_KEY in Vercel env vars
const VAPID_PUBLIC_KEY = 'BIcq9Cp55X74d4DU_pC3OpDtr4W_5aPhK-LPpQfcTiCUldow8DiJGanocS1fS2b8m9mTK13T3sq6HKhj0T5IDZU';

async function registerClientPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'denied') return;
  if (!currentUser) return;

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      // Convert VAPID key to Uint8Array
      const keyBytes = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes
      });
    }

    // Save subscription to Supabase profile
    await sb.from('profiles').update({
      push_subscription: JSON.stringify(sub.toJSON())
    }).eq('id', currentUser.id);

    console.log('✓ Push notifications registered for client');
  } catch(e) {
    console.warn('Push registration failed:', e);
  }
}

// MutationObserver - garantiza que auth view nunca esté activa si hay sesión
const _authObserver = new MutationObserver(() => {
  const authView = document.getElementById('view-auth');
  if(authView?.classList.contains('active') && window.currentUser) {
    authView.classList.remove('active');
    document.getElementById('view-dashboard')?.classList.add('active');
  }
});
document.addEventListener('DOMContentLoaded', () => {
  const authView = document.getElementById('view-auth');
  if(authView) _authObserver.observe(authView, { attributes: true, attributeFilter: ['class'] });
});

async function init(){
  const loadingGuard = setTimeout(()=>{ 
    hideLoading(); 
    if(!document.querySelector('.view.active'))
      document.getElementById('view-home').classList.add('active');
  }, 5000);

  try {
    // Detectar si venimos de OAuth (hash con access_token en URL)
    const isOAuthReturn = window.location.hash?.includes('access_token');

    // CRÍTICO mobile: esperar polling hasta que Supabase procese el hash
    if(isOAuthReturn) {
      for(let i = 0; i < 30; i++) {
        const { data: { session: s } } = await sb.auth.getSession();
        if(s?.user) break;
        await new Promise(r => setTimeout(r, 100));
      }
    } else {
      await new Promise(r => setTimeout(r, 200));
    }

    // Restaurar sesion — usar la promesa creada al inicio del script
    let { data: { session } } = await _initialSessionPromise;
    if(session?.user){
      currentUser = session.user;
      // CRÍTICO: forzar que auth view NO esté visible si hay sesión
      document.getElementById('view-auth')?.classList.remove('active');
      try { await loadProfile(); } catch(e){ console.warn('loadProfile:', e); }
      updateNavAuth();

      // Limpiar hash de OAuth si existe
      if(isOAuthReturn)
        window.history.replaceState({}, document.title, window.location.pathname);

      // Chequear si habia intencion pendiente
      const pendingPlan = localStorage.getItem('pendingPlanId');
      const pendingView = localStorage.getItem('pendingView');
      if(pendingPlan){
        localStorage.removeItem('pendingPlanId');
        localStorage.removeItem('pendingView');
        clearTimeout(loadingGuard);
        setTimeout(()=>{ hideLoading(); showView('membership'); setTimeout(()=>subscribePlan(pendingPlan), 800); }, 400);
        setTimeout(registerClientPush, 3000);
      setTimeout(checkBikeHealthAlerts, 5000);
        await loadServices(); await loadVanZones(); loadPublicReviews();
        return;
      } else if(pendingView){
        localStorage.removeItem('pendingView');
        clearTimeout(loadingGuard);
        setTimeout(()=>{ hideLoading(); showView(pendingView); }, 400);
        setTimeout(registerClientPush, 3000);
        await loadServices(); await loadVanZones(); loadPublicReviews();
        return;
      } else if(isOAuthReturn){
        // Vino de Google OAuth — mandar al dashboard
        clearTimeout(loadingGuard);
        setTimeout(()=>{ hideLoading(); showView('dashboard'); }, 400);
        setTimeout(registerClientPush, 3000);
        await loadServices(); await loadVanZones(); loadPublicReviews();
        return;
      }
    }

    try {
      await loadServices();
      await loadVanZones();
      loadPublicReviews();
    } catch(e){ console.error('Init data error:', e); }

    handleStripeReturn();

    // Manejar link directo de review (?review=BOOKING_ID)
    const reviewId = new URLSearchParams(window.location.search).get('review');
    if(reviewId && currentUser) {
      window.history.replaceState({}, '', '/');
      const { data: bkg } = await sb.from('bookings').select('*').eq('id', reviewId).single();
      if(bkg && !bkg.client_rating) {
        setTimeout(() => showReviewPrompt(bkg), 1000);
      }
    }

    // Manejar shortcuts PWA (?action=book, ?action=dashboard)
    const action = new URLSearchParams(window.location.search).get('action');
    if(action){
      window.history.replaceState({}, '', '/');
      if(!currentUser && action !== 'home' && action !== 'services'){
        // Guardar intencion para redirigir despues del login
        localStorage.setItem('pendingView', action);
        setTimeout(() => showView('auth'), 300);
      } else {
        setTimeout(() => showView(action), 300);
      }
    }

    loadPublicReviews();
    clearTimeout(loadingGuard);
    setTimeout(hideLoading, 800);
  } catch(e){
    console.error('Init fatal error:', e);
    clearTimeout(loadingGuard);
    hideLoading();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if(session?.user){
      const wasLoggedIn = !!currentUser;
      currentUser = session.user;
      try { await loadProfile(); } catch(e){}
      updateNavAuth();
      if(!wasLoggedIn && event === 'SIGNED_IN'){
        const pendingPlan = localStorage.getItem('pendingPlanId');
        const pending = localStorage.getItem('pendingView');
        if(pendingPlan){
          localStorage.removeItem('pendingPlanId');
          localStorage.removeItem('pendingView');
          showView('membership');
          setTimeout(()=> subscribePlan(pendingPlan), 1000);
        } else if(pending){
          localStorage.removeItem('pendingView');
          showView(pending);
        } else {
          // Google OAuth sin pending — ir al dashboard
          showView('dashboard');
          setTimeout(registerClientPush, 2000);
        }
      }
    } else if(event === 'SIGNED_OUT') {
      currentUser = null;
      userProfile = null;
      updateNavAuth();
    }
  });

  // Realtime mechanic locations
  sb.channel('mechanic_locations')
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'mechanic_locations' }, payload => {
      updateMapWidget(payload.new);
    }).subscribe();

  // Realtime booking status updates for client
  if(currentUser){
    sb.channel('client-bookings-'+currentUser.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'bookings',
        filter: 'client_id=eq.'+currentUser.id
      }, payload => {
        const booking = payload.new;
        showStatusUpdate(booking);
        updateDashboard();
        if(booking.status === 'enroute' || booking.status === 'completed'){
          sendEmail(booking.status, booking);
        }
        if(booking.status === 'completed'){
          // Mostrar tip modal después de 2 segundos
          setTimeout(() => showTipModal(booking.id, booking.mechanic_name || 'your mechanic'), 2000);
          // Mostrar review modal después de 5 segundos (después del tip)
          setTimeout(() => {
            if(!booking.client_rating) showReviewPrompt(booking);
          }, 6000);
        }
      }).subscribe();
  }

  // Show chat notification after 5s
  setTimeout(()=>{
    document.getElementById('cb-notif').classList.add('show');
    document.getElementById('chatbot-btn').classList.add('has-msg');
    addBotMsg("👋 G'day! I'm the Dr. Bike assistant. Ask me anything about our services, pricing, or coverage — or describe your bike issue and I'll recommend the right fix! 🚲");
  }, 5000);
}

// ── VAN ZONES ────────────────────────────────────────────────────────────────
async function loadVanZones(){
  const { data } = await sb.from('van_zones').select('*').eq('active', true).order('van_number');
  if(data && data.length > 0){
    // Group rows by van_number (one row per suburb)
    const grouped = {};
    data.forEach(row => {
      if(!grouped[row.van_number]){
        const colors = { 1:'#1848C8', 2:'#059669', 3:'#7C3AED', 4:'#DC2626' };
        grouped[row.van_number] = { id:row.van_number, name:'Van '+row.van_number, color:colors[row.van_number]||'#1848C8', suburbs:[] };
      }
      grouped[row.van_number].suburbs.push(row.suburb);
    });
    vanZones = Object.values(grouped).sort((a,b)=>a.id-b.id);
  }
  renderVanZones();
}

async function saveVanZone(vanId){
  const van = vanZones.find(v=>v.id===vanId);
  if(!van) return;
  // Delete existing rows for this van then reinsert
  await sb.from('van_zones').delete().eq('van_number', vanId);
  if(van.suburbs.length > 0){
    const rows = van.suburbs.map(s=>({ van_number:vanId, suburb:s, postcode:'', active:true }));
    await sb.from('van_zones').insert(rows);
  }
  toast('Van '+vanId+' zones saved ✓');
}

function getVanForSuburb(suburb){
  const sub = suburb.toLowerCase().trim();
  for(const van of vanZones){
    if(van.suburbs.some(z=>sub.includes(z)||z.includes(sub))) return van.id;
  }
  return 1;
}

function renderVanZones(){
  const container = document.getElementById('vans-container');
  if(!container) return;
  container.innerHTML = vanZones.map(van=>`
    <div class="zone-van">
      <div class="zone-van-hdr" style="background:${van.color}">
        <div>
          <div class="zone-van-title">${van.name}</div>
          <div class="zone-van-sub">${van.suburbs.length} suburbs assigned</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="saveVanZone(${van.id})" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:500">Save changes</button>
          ${vanZones.length > 1 ? `<button onclick="removeVan(${van.id})" style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.7);padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer">✕</button>` : ''}
        </div>
      </div>
      <div class="zone-van-body">
        <div class="suburb-tags" id="tags-${van.id}">
          ${van.suburbs.map(s=>`
            <span class="suburb-tag">
              ${s}
              <span class="rm" onclick="removeSuburb(${van.id},'${s}')">×</span>
            </span>`).join('')}
        </div>
        <div class="add-suburb-row">
          <input class="add-suburb-inp" id="inp-${van.id}" placeholder="Add suburb (e.g. Bondi)" onkeydown="if(event.key==='Enter')addSuburb(${van.id})">
          <button class="add-suburb-btn" onclick="addSuburb(${van.id})">+ Add</button>
        </div>
      </div>
    </div>`).join('');
}

function addSuburb(vanId){
  const inp = document.getElementById('inp-'+vanId);
  const suburb = inp.value.trim().toLowerCase();
  if(!suburb) return;
  const van = vanZones.find(v=>v.id===vanId);
  if(!van || van.suburbs.includes(suburb)){ toast('Suburb already added'); return; }
  van.suburbs.push(suburb);
  inp.value = '';
  renderVanZones();
}

function removeSuburb(vanId, suburb){
  const van = vanZones.find(v=>v.id===vanId);
  if(!van) return;
  van.suburbs = van.suburbs.filter(s=>s!==suburb);
  renderVanZones();
}

function addVan(){
  const newId = Math.max(...vanZones.map(v=>v.id)) + 1;
  const colors = ['#7C3AED','#DC2626','#D97706','#0891B2'];
  vanZones.push({ id:newId, name:'Van '+newId, color:colors[(newId-1)%colors.length], suburbs:[] });
  renderVanZones();
}

function removeVan(vanId){
  if(vanZones.length <= 1){ toast('Need at least one van'); return; }
  vanZones = vanZones.filter(v=>v.id!==vanId);
  renderVanZones();
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
async function signInGoogle(){
  trackEvent('login_attempt', { method: 'google' });
  const { error } = await sb.auth.signInWithOAuth({
    provider:'google',
    options:{
      redirectTo: window.location.origin,
      queryParams: { access_type: 'offline', prompt: 'consent' }
    }
  });
  if(error){ showErr(error.message); console.error(error); }
}

async function signInEmail(){
  const email = document.getElementById('auth-email').value.trim();
  const pwd = document.getElementById('auth-password').value;
  if(!email||!pwd){ showErr('Please enter email and password'); return; }
  const btn = document.getElementById('signin-btn');
  btn.innerHTML = '<span class="spinner"></span>Signing in...';
  btn.disabled = true;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password:pwd });
    btn.innerHTML = 'Sign in';
    btn.disabled = false;
    if(error){ showErr(error.message); return; }
    currentUser = data.user;
    try { await loadProfile(); } catch(pe){ console.warn('loadProfile non-fatal:', pe); }
    updateNavAuth();
    // Si había intención de ir a booking, ir directo
    const pending = localStorage.getItem('pendingView');
    const pendingPlan = localStorage.getItem('pendingPlanId');
    if(pendingPlan){ 
      localStorage.removeItem('pendingPlanId');
      localStorage.removeItem('pendingView');
      showView('membership');
      setTimeout(()=> subscribePlan(pendingPlan), 800);
    } else if(pending){ 
      localStorage.removeItem('pendingView'); 
      showView(pending); 
    } else { 
      showView('dashboard'); 
    }
    toast('Welcome back! 👋');
    setTimeout(registerClientPush, 2000);
  } catch(e) {
    btn.innerHTML = 'Sign in';
    btn.disabled = false;
    showErr('Sign in failed. Try again.');
    console.error(e);
  }
}

async function signUpEmail(){
  const email = document.getElementById('auth-email').value;
  const pwd = document.getElementById('auth-password').value;
  if(!email||!pwd){ showErr('Please enter email and password'); return; }
  const { data, error } = await sb.auth.signUp({ email, password:pwd });
  if(error){ showErr(error.message); return; }
  toast('Account created! Check your email to verify.');
}

async function signOut(){
  localStorage.removeItem('pendingView');
  await sb.auth.signOut();
  currentUser = null;
  userProfile = null;
  updateNavAuth();
  showView('home');
  toast('Signed out');
}

function showErr(msg){
  const el = document.getElementById('auth-err');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(()=>el.style.display='none', 4000);
}

// ── PROFILE ──────────────────────────────────────────────────────────────────
async function loadProfile(){
  if(!currentUser) return;
  try {
    const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    if(error || !data){
      const name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
      const refCode = 'BIKE' + Math.random().toString(36).substr(2,5).toUpperCase();
      const { data: newP, error: insertErr } = await sb.from('profiles').insert({
        id: currentUser.id,
        email: currentUser.email,
        full_name: name,
        role: 'client',
        membership: 'none',
        referral_code: refCode,
        referral_count: 0
      }).select().single();
      if(insertErr){ console.warn('Profile insert error:', insertErr); }
      // Fallback: build minimal profile from auth data
      userProfile = newP || { id: currentUser.id, email: currentUser.email, full_name: name, membership: 'none', referral_code: refCode };
      // Nuevo usuario — mostrar onboarding después de cargar
      setTimeout(() => showOnboarding(name), 1200);
    } else {
      // Generate referral code if missing
      if(!data.referral_code){
        const refCode = 'BIKE' + Math.random().toString(36).substr(2,5).toUpperCase();
        await sb.from('profiles').update({ referral_code: refCode }).eq('id', currentUser.id);
        data.referral_code = refCode;
      }
      userProfile = data;
    }
    updateDashboard();
  } catch(e){
    console.error('loadProfile exception:', e);
    // Build minimal profile so dashboard still loads
    const name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    userProfile = { id: currentUser.id, email: currentUser.email, full_name: name, membership: 'none' };
    updateDashboard();
  }
}

async function updateDashboard(){
  if(!userProfile) return;
  loadBikes();
  const name = userProfile.full_name || userProfile.email?.split('@')[0] || 'there';
  const initials = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('d-av').textContent = initials;
  document.getElementById('d-name').textContent = `Good day, ${name.split(' ')[0]}!`;
  const memLabels = { none:'No membership', basic:'Basic member', std:'Standard member', vip:'VIP member' };
  const mem = userProfile.membership || 'none';
  document.getElementById('d-plan').textContent = memLabels[mem] || 'No membership';
  const badgeEl = document.getElementById('d-badge');
  const badgeClass = { none:'mem-none', basic:'mem-basic', std:'mem-std', vip:'mem-vip' };
  const badgeTxt = { none:'No plan', basic:'⭐ Basic', std:'● Standard', vip:'★ VIP' };
  badgeEl.className = 'mem-badge ' + (badgeClass[mem]||'mem-none');
  badgeEl.textContent = badgeTxt[mem]||'No plan';
  const discounts = { none:'0%', basic:'8%', std:'12%', vip:'18%' };
  document.getElementById('kpi-disc').textContent = discounts[mem]||'0%';

  const refEl = document.getElementById('referral-code-display');
  if(refEl) refEl.textContent = userProfile?.referral_code || '—';
  const refCount = document.getElementById('referral-count');
  if(refCount) refCount.textContent = userProfile?.referral_count || 0;

  const { data: bkgs } = await sb.from('bookings')
    .select('*').eq('client_id', currentUser.id)
    .order('created_at', { ascending:false }).limit(10);

  document.getElementById('kpi-jobs').textContent = bkgs?.length || 0;
  const total = bkgs?.reduce((s,b)=>s+(b.service_price||0),0)||0;
  document.getElementById('kpi-spent').textContent = total > 0 ? '$'+total : '$0';

  const next = bkgs?.find(b=>b.status==='confirmed'||b.status==='pending');
  document.getElementById('kpi-next').textContent = next ? new Date(next.scheduled_date).toLocaleDateString('en-AU',{month:'short',day:'numeric'}) : '—';

  const histEl = document.getElementById('booking-history');
  if(bkgs && bkgs.length > 0){
    const stColors={pending:'#D97706',confirmed:'#1848C8',enroute:'#059669',completed:'#059669',cancelled:'#DC2626'};
    const stLabels2={pending:'Pending',confirmed:'Confirmed',enroute:'En route',completed:'Done',cancelled:'Cancelled'};
    const stLabels={pending:'Pending',confirmed:'Confirmed',enroute:'🚐 En route',completed:'✅ Done',cancelled:'Cancelled'};
    histEl.innerHTML = bkgs.slice(0,5).map(b=>{
      const st=b.status||'pending';
      const date=b.scheduled_date?new Date(b.scheduled_date).toLocaleDateString('en-AU',{month:'short',day:'numeric'}):'—';
      const canCancel = ['pending','confirmed'].includes(st);
      return `<div class="hist-row" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <div style="width:8px;height:8px;border-radius:50%;background:${stColors[st]};flex-shrink:0"></div>
        <span class="hist-svc" style="flex:1;font-size:13px;font-weight:500;min-width:100px">${b.service_name||'Service'}</span>
        <span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${stColors[st]}20;color:${stColors[st]};font-weight:600">${stLabels[st]||st}</span>
        <span class="hist-date" style="font-size:12px;color:var(--mgray)">${date}</span>
        <span class="hist-price" style="font-size:13px;font-weight:700">$${b.service_price||0}</span>
        ${canCancel ? `<button onclick="clientReschedule('${b.id}','${b.service_name||'Service'}','${b.scheduled_date||''}','${b.van_number||1}')" style="font-size:12px;color:#1848C8;background:none;border:1px solid #BFDBFE;border-radius:8px;padding:6px 12px;cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap;min-height:32px">Reschedule</button>` : ''}
        ${canCancel ? `<button onclick="clientCancelBooking('${b.id}','${b.service_name||'Service'}')" style="font-size:12px;color:#DC2626;background:none;border:1px solid #FECACA;border-radius:8px;padding:6px 12px;cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap;min-height:32px">Cancel</button>` : ''}
        ${canCancel ? `<button onclick="showCancelPolicy()" style="font-size:11px;color:var(--mgray);background:none;border:none;text-decoration:underline;cursor:pointer;font-family:Inter,sans-serif;padding:6px 4px;min-height:32px">View cancellation policy</button>` : ''}
        ${st==='completed' ? `<button onclick="showReceipt('${b.id}','${(b.service_name||'Service').replace(/'/g,"\\'")}',${b.service_price||0},'${b.scheduled_date||''}','${b.scheduled_time||''}')" style="font-size:12px;color:#059669;background:none;border:1px solid #BBF7D0;border-radius:8px;padding:6px 12px;cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap;min-height:32px">📄 Receipt</button>` : ''}
      </div>`;
    }).join('');

    const enroute = bkgs.find(b=>b.status==='enroute');
    if(enroute){
      const driverName = await getDriverName(enroute.van_number||1);
      startTracking(enroute.id, driverName, enroute.address || enroute.suburb);
      initJobChat(enroute.id);
    } else {
      stopTracking();
      if(jobChatChannel){ sb.removeChannel(jobChatChannel); jobChatChannel=null; }
    }
  } else {
    histEl.innerHTML = '<div class="empty-state">No bookings yet.<br>Book your first service below.</div>';
  }
}

async function clientReschedule(bookingId, serviceName, currentDate, vanNum) {
  // Remove existing modal
  document.getElementById('reschedule-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'reschedule-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center';

  const today = new Date();
  const days = [];
  for(let i=1; i<=14; i++){
    const d = new Date(today);
    d.setDate(today.getDate()+i);
    if(d.getDay()!==0) days.push(d); // excluir domingos
  }

  let selectedDate = null;
  let selectedTime = null;

  const fmt = d => d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
  const fmtISO = d => d.toISOString().split('T')[0];

  modal.innerHTML = `
    <div style="background:var(--white);border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;font-family:Inter,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <div style="font-size:17px;font-weight:700;color:var(--navy)">Reschedule booking</div>
          <div style="font-size:12px;color:var(--mgray);margin-top:2px">${serviceName}</div>
        </div>
        <button onclick="document.getElementById('reschedule-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--mgray)">✕</button>
      </div>

      <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:10px">Select new date</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px" id="rs-days">
        ${days.map(d=>`
          <button onclick="rsSelectDay(this,'${fmtISO(d)}','${parseInt(vanNum)}')" data-date="${fmtISO(d)}"
            style="padding:10px 6px;border:1.5px solid var(--border);border-radius:10px;background:var(--white);cursor:pointer;font-family:Inter,sans-serif;font-size:12px;color:var(--navy);text-align:center;line-height:1.4">
            <div style="font-weight:600">${fmt(d).split(',')[0]}</div>
            <div style="color:var(--mgray)">${fmt(d).split(',')[1]?.trim()}</div>
          </button>`).join('')}
      </div>

      <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:10px">Select new time</div>
      <div id="rs-slots" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">
        <div style="grid-column:1/-1;text-align:center;color:var(--mgray);font-size:13px;padding:16px">Select a date first</div>
      </div>

      <button id="rs-confirm-btn" disabled onclick="rsConfirm('${bookingId}','${serviceName}')"
        style="width:100%;padding:14px;background:var(--blue);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;opacity:0.4">
        Confirm reschedule
      </button>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}

async function rsSelectDay(el, date, vanNum) {
  document.querySelectorAll('#rs-days button').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background = 'var(--white)';
    b.style.color = 'var(--navy)';
  });
  el.style.borderColor = '#1848C8';
  el.style.background = '#EEF3FC';
  el.style.color = '#1848C8';

  window._rsDate = date;
  window._rsTime = null;
  document.getElementById('rs-confirm-btn').disabled = true;
  document.getElementById('rs-confirm-btn').style.opacity = '0.4';

  const slotsEl = document.getElementById('rs-slots');
  slotsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--mgray);font-size:13px;padding:16px">Loading slots...</div>';

  const slots = await getAvailableSlots(date, parseInt(vanNum));
  const available = slots.filter(s=>s.available);

  slotsEl.innerHTML = available.length ? available.map(s=>`
    <button onclick="rsSelectTime(this,'${s.time}')"
      style="padding:10px 6px;border:1.5px solid var(--border);border-radius:10px;background:var(--white);cursor:pointer;font-family:Inter,sans-serif;font-size:13px;font-weight:600;color:var(--navy)">
      ${s.label}
    </button>`).join('') :
    `<div style="grid-column:1/-1;text-align:center;color:var(--mgray);font-size:13px;padding:16px">
          No slots available for this day<br>
          <button onclick="joinWaitlist('${date}',${vanNum})" style="margin-top:10px;padding:8px 16px;background:var(--blue-lt);color:var(--blue);border:1px solid var(--blue);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--sans)">🔔 Join waitlist</button>
        </div>`;
}

function rsSelectTime(el, time) {
  document.querySelectorAll('#rs-slots button').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background = 'var(--white)';
    b.style.color = 'var(--navy)';
  });
  el.style.borderColor = '#1848C8';
  el.style.background = '#EEF3FC';
  el.style.color = '#1848C8';
  window._rsTime = time;
  const btn = document.getElementById('rs-confirm-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
}

async function rsConfirm(bookingId, serviceName) {
  const date = window._rsDate;
  const time = window._rsTime;
  if(!date || !time) return;

  const btn = document.getElementById('rs-confirm-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const { error } = await sb.from('bookings').update({
    scheduled_date: date,
    scheduled_time: time,
    status: 'confirmed'
  }).eq('id', bookingId).eq('client_id', currentUser.id);

  if(error){
    toast('Could not reschedule — please try again');
    btn.textContent = 'Confirm reschedule';
    btn.disabled = false;
    return;
  }

  document.getElementById('reschedule-modal').remove();
  toast('Booking rescheduled ✓');
  updateDashboard();

  // Email confirmation
  try {
    const d = new Date(date+'T00:00:00');
    const dateStr = d.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
    const timeStr = new Date('2000-01-01T'+time+':00').toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',hour12:true});
    fetch('/api/send-email', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        type:'confirmation', to:currentUser.email,
        name: userProfile?.full_name||'Client',
        service: serviceName, date: dateStr, time: timeStr,
        bookingId
      })
    }).catch(()=>{});
  } catch(e){}
}

async function clientCancelBooking(bookingId, serviceName){
  const confirmed = confirm(`Cancel your ${serviceName} booking?\n\nCancellations made more than 2 hours before your booking are fully refunded.`);
  if(!confirmed) return;

  // Fetch booking details before cancelling (need van_number, date, time, suburb)
  const { data: bkg } = await sb.from('bookings').select('*').eq('id', bookingId).single();

  const { error } = await sb.from('bookings').update({
    status: 'cancelled'
  }).eq('id', bookingId).eq('client_id', currentUser.id);

  if(error){ toast('Could not cancel — please contact us on WhatsApp'); return; }

  toast('Booking cancelled ✓');
  updateDashboard();

  // Notify via email + SMS/WhatsApp in parallel (non-blocking)
  try {
    const clientName = userProfile?.full_name || 'Client';
    const clientEmail = currentUser?.email || '';
    const vanNum     = bkg?.van_number || 1;
    const dateStr    = bkg?.scheduled_date || '';
    const timeStr    = bkg?.scheduled_time || '';
    const suburb     = bkg?.suburb || '';
    const price      = bkg?.service_price || 0;

    // Email al cliente
    if(clientEmail){
      fetch('/api/send-email', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'cancellation_client', to:clientEmail, name:clientName, service:serviceName, date:dateStr, time:timeStr, address:suburb, price })
      }).catch(()=>{});
    }

    // Email al admin
    fetch('/api/send-email', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'cancellation_admin', to:'peredo.dm@gmail.com', name:clientName, service:serviceName, date:dateStr, time:timeStr, address:suburb, price })
    }).catch(()=>{});

    // Get mechanic contacts for this zone from escalation_contacts
    const { data: contacts } = await sb.from('escalation_contacts')
      .select('phone, first_name, channel, role, zone')
      .eq('active', true);

    const cancelMsg = `❌ BOOKING CANCELLED\n\nClient: ${clientName}\nService: ${serviceName}\nDate: ${dateStr} at ${timeStr}\nSuburb: ${suburb}\n\nThis slot is now free.`;

    const notifTargets = (contacts || []).filter(c => {
      if(c.role === 'manager') return true;          // manager siempre recibe
      if(c.role === 'mechanic' && String(c.zone) === String(vanNum)) return true; // mecanico de esa zona
      return false;
    });

    await Promise.allSettled(notifTargets.map(c => {
      const ch = c.channel || 'sms';
      const calls = [];
      if(ch === 'sms' || ch === 'both'){
        calls.push(fetch('/api/send-sms', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ to: c.phone, name: c.first_name, service: serviceName, type: 'cancellation_alert', customMsg: cancelMsg })
        }));
      }
      if(ch === 'whatsapp' || ch === 'both'){
        calls.push(fetch('/api/send-whatsapp', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ to: c.phone, name: c.first_name, service: serviceName, type: 'cancellation_alert', customMsg: cancelMsg })
        }));
      }
      return Promise.allSettled(calls);
    }));

  } catch(e){ console.log('Cancel notify error', e); }
}


function showOnboarding(name) {
  // Solo mostrar si nunca fue visto
  if(localStorage.getItem('drbike-onboarded')) return;
  localStorage.setItem('drbike-onboarded', '1');

  const firstName = (name||'').split(' ')[0] || 'there';
  let step = 0;

  const steps = [
    {
      icon: '🚲',
      title: `Welcome, ${firstName}!`,
      desc: "Dr. Bike comes to you — at home, work, or the park. Book a service in 60 seconds and we'll be there.",
      btnLabel: 'How it works →',
      color: '#0D1F3C'
    },
    {
      icon: '📍',
      title: 'We come to you',
      desc: "Pick a service, choose a date and time, and drop your address. A qualified mechanic arrives with all the tools needed.",
      btnLabel: "And after? →",
      color: '#1848C8'
    },
    {
      icon: '⭐',
      title: 'Pay after, rate always',
      desc: "You only pay once the job is done. Leave a review so we keep improving. Your bike's full service history is always here.",
      btnLabel: 'Book my first service →',
      color: '#059669'
    }
  ];

  const el = document.createElement('div');
  el.id = 'onboarding-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:flex-end;justify-content:center';

  function render() {
    const s = steps[step];
    el.innerHTML = `
      <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:480px;padding:40px 28px 48px;font-family:Inter,sans-serif;text-align:center">
        <div style="display:flex;justify-content:center;gap:6px;margin-bottom:28px">
          ${steps.map((_,i)=>`<div style="width:${i===step?24:8}px;height:8px;border-radius:4px;background:${i===step?s.color:'#E5E7EB'};transition:all 0.3s"></div>`).join('')}
        </div>
        <div style="font-size:56px;margin-bottom:16px">${s.icon}</div>
        <div style="font-size:22px;font-weight:800;color:#0D1F3C;margin-bottom:12px">${s.title}</div>
        <div style="font-size:15px;color:#6B7280;line-height:1.6;margin-bottom:32px">${s.desc}</div>
        <button onclick="onboardingNext()" style="width:100%;padding:16px;background:${s.color};color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">${s.btnLabel}</button>
        ${step>0?`<button onclick="onboardingSkip()" style="display:block;width:100%;padding:12px;background:none;border:none;color:#9CA3AF;font-size:13px;cursor:pointer;font-family:Inter,sans-serif;margin-top:8px">Skip</button>`:''}
      </div>`;
  }

  window.onboardingNext = function() {
    step++;
    if(step >= steps.length) {
      el.remove();
      showView('book');
    } else {
      render();
    }
  };

  window.onboardingSkip = function() {
    el.remove();
  };

  render();
  document.body.appendChild(el);
}



// ── BIKE HEALTH SCORE CHECK ──────────────────────────────────────────────────
async function checkBikeHealthAlerts() {
  if(!currentUser) return;
  const lastCheck = localStorage.getItem('drbike-health-check');
  const now = Date.now();
  // Solo checkear una vez por día
  if(lastCheck && now - parseInt(lastCheck) < 86400000) return;
  localStorage.setItem('drbike-health-check', now.toString());

  const { data: lastBooking } = await sb.from('bookings')
    .select('completed_at,service_name,scheduled_date')
    .eq('client_id', currentUser.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  if(!lastBooking) return;
  const lastDate = lastBooking.completed_at || lastBooking.scheduled_date;
  if(!lastDate) return;

  const daysSince = Math.floor((Date.now() - new Date(lastDate)) / (1000*60*60*24));
  const health = Math.max(0, Math.round(100 - (daysSince/180)*100));

  // Alertar si el health score bajó de 50 (más de 3 meses)
  if(daysSince >= 90 && health < 50) {
    const seen = localStorage.getItem('drbike-health-notif-'+lastDate);
    if(!seen) {
      localStorage.setItem('drbike-health-notif-'+lastDate, '1');
      setTimeout(() => {
        toast(`🚲 Your bike health is ${health}% — time for a service!`);
      }, 3000);
    }
  }
}

function showTipModal(bookingId, mechName) {
  document.getElementById('tip-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tip-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:32px 24px 48px;width:100%;max-width:420px;font-family:Inter,sans-serif;text-align:center">
      <div style="font-size:40px;margin-bottom:12px">⭐</div>
      <div style="font-size:20px;font-weight:800;color:#0D1F3C;margin-bottom:6px">Leave a tip for ${mechName||'your mechanic'}?</div>
      <div style="font-size:13px;color:#6B7280;margin-bottom:24px">100% goes directly to your mechanic</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
        ${[5,10,15].map(amt=>`
          <button onclick="sendTip(${amt},'${bookingId}')" style="padding:16px 8px;border:2px solid #E5E7EB;border-radius:12px;background:#fff;cursor:pointer;font-family:Inter,sans-serif;font-size:16px;font-weight:700;color:#0D1F3C;transition:all .15s">
            <div>$${amt}</div>
            <div style="font-size:11px;font-weight:400;color:#6B7280;margin-top:2px">${amt===5?'Nice':amt===10?'Great':'Awesome'}</div>
          </button>`).join('')}
      </div>
      <button onclick="document.getElementById('tip-modal').remove()" style="width:100%;padding:12px;background:none;border:none;color:#9CA3AF;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">No thanks</button>
    </div>`;
  document.body.appendChild(modal);
}

async function sendTip(amount, bookingId) {
  document.getElementById('tip-modal').remove();
  toast(`💛 $${amount} tip sent — thank you!`);
  // Registrar propina en Supabase
  try {
    await sb.from('bookings').update({ tip_amount: amount }).eq('id', bookingId);
    // Email al admin
    fetch('/api/send-email', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        type: 'tip_received',
        to: 'peredo.dm@gmail.com',
        name: userProfile?.full_name || 'Client',
        price: amount,
        service: 'Tip'
      })
    }).catch(()=>{});
  } catch(e){}
}

async function joinWaitlist(date, vanNum) {
  if(!currentUser){ requireAuth('book'); return; }
  const name = userProfile?.full_name || 'Client';
  const email = currentUser.email;
  
  const confirmed = confirm(`Join the waitlist for ${new Date(date+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}?\n\nWe'll notify you by email if a slot opens up.`);
  if(!confirmed) return;

  // Guardar en Supabase
  await sb.from('availability').insert({
    date, van_number: vanNum, blocked: false,
    time_slot: 'waitlist',
    reason: JSON.stringify({ clientId: currentUser.id, name, email })
  }).then(() => {
    toast("✅ Added to waitlist — we'll email you if a slot opens!");
    // Email al cliente
    fetch('/api/send-email', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        type: 'waitlist_confirmation',
        to: email, name,
        date: new Date(date+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
      })
    }).catch(()=>{});
  }).catch(() => toast('Could not join waitlist — try again'));
}

function showReceipt(bookingId, serviceName, price, date, time) {
  const net = Math.round(price / 1.1);
  const gst = price - net;
  const dateStr = date ? new Date(date+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : '—';
  const clientName = userProfile?.full_name || 'Client';
  const ref = 'DRBK-' + bookingId.slice(0,8).toUpperCase();

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Receipt ${ref}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,'Inter',sans-serif;color:#0D1F3C;background:#fff;padding:40px;max-width:480px;margin:0 auto}
    .logo{display:flex;align-items:center;gap:10px;margin-bottom:32px}
    .logo-icon{width:40px;height:40px;background:#1848C8;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;font-weight:800}
    .logo-name{font-size:18px;font-weight:800;color:#0D1F3C}
    .logo-sub{font-size:11px;color:#6B7280}
    h1{font-size:22px;font-weight:800;color:#0D1F3C;margin-bottom:4px}
    .ref{font-size:13px;color:#6B7280;margin-bottom:28px}
    .info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F3F4F6;font-size:14px}
    .info-row .label{color:#6B7280}
    .info-row .val{font-weight:600;color:#0D1F3C}
    .total-row{display:flex;justify-content:space-between;padding:14px 0;font-size:18px;font-weight:800;color:#1848C8;border-top:2px solid #E5E7EB;margin-top:8px}
    .badge{display:inline-block;background:#ECFDF5;color:#059669;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;margin-bottom:28px}
    .footer{margin-top:32px;font-size:11px;color:#9CA3AF;border-top:1px solid #F3F4F6;padding-top:16px;line-height:1.6}
    .print-btn{background:#1848C8;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer;margin-top:24px;display:block;width:100%;text-align:center}
    @media print{.print-btn{display:none}}
  </style></head>
  <body>
    <div class="logo">
      <div class="logo-icon">🚲</div>
      <div><div class="logo-name">Dr. Bike Sydney</div><div class="logo-sub">drbikesydney.com.au</div></div>
    </div>
    <h1>Tax Invoice</h1>
    <div class="ref">${ref}</div>
    <div class="badge">✅ Payment received</div>
    <div class="info-row"><span class="label">Client</span><span class="val">${clientName}</span></div>
    <div class="info-row"><span class="label">Service</span><span class="val">${serviceName}</span></div>
    <div class="info-row"><span class="label">Date</span><span class="val">${dateStr}${time?' · '+time:''}</span></div>
    <div class="info-row"><span class="label">Subtotal (excl. GST)</span><span class="val">$${net.toFixed(2)}</span></div>
    <div class="info-row"><span class="label">GST (10%)</span><span class="val">$${gst.toFixed(2)}</span></div>
    <div class="total-row"><span>Total (AUD)</span><span>$${price.toFixed(2)}</span></div>
    <div class="footer">Dr. Bike Sydney · ABN 87 654 025 287 · hello@drbikesydney.com.au · drbikesydney.com.au<br>This is a valid tax invoice for GST purposes under Australian law.</div>
    <button class="print-btn" onclick="window.print()">🖨️ Save as PDF</button>
  </body></html>`);
  win.document.close();
}

function updateNavAuth(){
  const btn = document.getElementById('nav-auth-btn');
  if(currentUser){
    btn.textContent = 'My account';
    btn.onclick = ()=>showView('dashboard');
  } else {
    btn.textContent = 'Sign in';
    btn.onclick = ()=>showView('auth');
  }
}

// ── PWA INSTALL ───────────────────────────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  if(!localStorage.getItem('drbike-pwa-dismissed')){
    setTimeout(() => showPWABanner(), 5000);
  }
});

window.addEventListener('appinstalled', () => {
  hidePWABanner();
  localStorage.setItem('drbike-pwa-dismissed', 'installed');
  toast('🎉 Dr. Bike added to your home screen!');
});

function showPWABanner(){
  const banner = document.getElementById('pwa-banner');
  if(!banner) return;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if(isStandalone || localStorage.getItem('drbike-pwa-dismissed')) return;
  banner.style.display = 'block';
}

function hidePWABanner(){
  const banner = document.getElementById('pwa-banner');
  if(banner) banner.style.display = 'none';
}

async function installPWA(){
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if(isIOS){
    // En iOS no hay API — mostrar instrucciones paso a paso
    document.getElementById('pwa-install-btn').style.display = 'none';
    document.getElementById('ios-banner').style.display = 'block';
    return;
  }
  if(deferredPrompt){
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    hidePWABanner();
    if(outcome === 'accepted') localStorage.setItem('drbike-pwa-dismissed', 'installed');
  } else {
    toast('📱 Tap ⋮ menu → "Add to Home Screen"');
    hidePWABanner();
  }
}

function dismissPWA(){
  hidePWABanner();
  localStorage.setItem('drbike-pwa-dismissed', 'dismissed');
}

// iOS — mostrar banner después de 5 segundos en primera visita
(function(){
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone;
  const dismissed = localStorage.getItem('drbike-pwa-dismissed');
  if(isIOS && !isStandalone && !dismissed){
    setTimeout(() => {
      const banner = document.getElementById('pwa-banner');
      if(banner && banner.style.display !== 'block'){
        banner.style.display = 'block';
        document.getElementById('pwa-install-btn').style.display = 'none';
        document.getElementById('ios-banner').style.display = 'block';
      }
    }, 5000);
  }
})();

// ── DARK MODE ─────────────────────────────────────────────────────────────────
function initTheme(){
  const saved = localStorage.getItem('drbike-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved ? saved === 'dark' : prefersDark;
  setTheme(isDark ? 'dark' : 'light', false);
  // Listen for system changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if(!localStorage.getItem('drbike-theme')) setTheme(e.matches ? 'dark' : 'light', false);
  });
}

function setTheme(theme, save=true){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-btn');
  if(btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  if(save) localStorage.setItem('drbike-theme', theme);
}

function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// ── VOICE & TEXT DIAGNOSIS ────────────────────────────────────────────────────
let recognition = null;
let isRecording = false;

function toggleVoiceDiagnosis(){
  const btn = document.getElementById('diag-mic-btn');
  const status = document.getElementById('diag-voice-status');
  const textArea = document.getElementById('diag-text-input');
  const analyzeBtn = document.getElementById('diag-text-btn');

  // Check if Web Speech API is available
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    // Fallback to text input
    textArea.style.display = 'block';
    analyzeBtn.style.display = 'block';
    textArea.placeholder = "Describe the problem or noise... e.g. 'clicking sound when pedaling, worse on left side'";
    textArea.focus();
    status.style.display = 'none';
    btn.style.display = 'none';
    return;
  }

  if(isRecording){
    recognition?.stop();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-AU';
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isRecording = true;
    btn.innerHTML = '🔴 Listening... tap to stop';
    btn.style.background = '#FEF2F2';
    btn.style.borderColor = 'var(--red)';
    btn.style.color = 'var(--red)';
    status.style.display = 'block';
    status.innerHTML = '🎙️ <em>Speak clearly — describe the noise or problem with your bike</em>';
    textArea.style.display = 'block';
    textArea.value = '';
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    textArea.style.display = 'block';
    textArea.value = transcript;
    analyzeBtn.style.display = 'block';
  };

  recognition.onend = () => {
    isRecording = false;
    btn.innerHTML = '🎙️ Record again';
    btn.style.background = 'var(--off)';
    btn.style.borderColor = 'var(--border)';
    btn.style.color = 'var(--navy)';
    if(textArea.value){
      status.innerHTML = '✅ Got it! Review and tap Analyse.';
      analyzeBtn.style.display = 'block';
    } else {
      status.innerHTML = '⚠️ Nothing recorded. Try again or type below.';
      textArea.style.display = 'block';
      textArea.placeholder = "Type your description here...";
    }
  };

  recognition.onerror = (e) => {
    isRecording = false;
    btn.innerHTML = '🎙️ Record noise description';
    btn.style.background = 'var(--off)';
    btn.style.borderColor = 'var(--border)';
    btn.style.color = 'var(--navy)';
    // Fallback to text
    textArea.style.display = 'block';
    analyzeBtn.style.display = 'block';
    status.innerHTML = '⚠️ Mic not available — type your description below';
    status.style.display = 'block';
  };

  recognition.start();
}

// Show analyze button when typing
document.addEventListener('DOMContentLoaded', () => {
  const textArea = document.getElementById('diag-text-input');
  if(textArea){
    textArea.addEventListener('input', () => {
      const btn = document.getElementById('diag-text-btn');
      if(btn) btn.style.display = textArea.value.trim() ? 'block' : 'none';
    });
  }
});

async function analyzeBikeText(){
  const text = document.getElementById('diag-text-input')?.value?.trim();
  if(!text) return;

  const resultEl = document.getElementById('diag-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML = `
    <div style="text-align:center;padding:20px">
      <div style="font-size:24px;margin-bottom:8px">🔍</div>
      <div style="font-size:13px;font-weight:600;color:var(--navy)">Analysing your description...</div>
      <div style="font-size:11px;color:var(--mgray);margin-top:4px">Claude is diagnosing based on your description</div>
      <div style="margin-top:12px;height:3px;background:var(--border);border-radius:2px;overflow:hidden">
        <div style="height:100%;background:var(--blue);border-radius:2px;animation:progress 2s ease-in-out infinite"></div>
      </div>
    </div>`;

  try {
    const res = await fetch('/api/diagnose-bike', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text })
    });

    const data = await res.json();
    if(!res.ok || !data.diagnosis) throw new Error(data.error || 'Diagnosis failed');

    const d = data.diagnosis;
    const urgencyColor = { low: '#059669', medium: '#D97706', high: '#DC2626' }[d.urgency] || '#1848C8';
    const urgencyLabel = { low: '🟢 Low urgency', medium: '🟡 Moderate urgency', high: '🔴 Urgent' }[d.urgency] || '';

    resultEl.innerHTML = `
      <div style="background:var(--off);border-radius:10px;padding:14px;border:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:var(--navy)">🤖 AI Diagnosis</div>
          <span style="font-size:10px;font-weight:600;color:${urgencyColor};background:${urgencyColor}18;padding:3px 8px;border-radius:10px">${urgencyLabel}</span>
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:4px">${d.problem}</div>
        <div style="font-size:12px;color:var(--mgray);line-height:1.5;margin-bottom:10px">${d.explanation}</div>
        ${d.tips ? `<div style="background:var(--blue-lt);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--blue);margin-bottom:10px">💡 <strong>Quick tip:</strong> ${d.tips}</div>` : ''}
        <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:11px;color:var(--mgray)">Recommended service</div>
            <div style="font-size:13px;font-weight:700;color:var(--navy)">${d.recommended_service}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;color:var(--mgray)">Estimate</div>
            <div style="font-size:16px;font-weight:700;color:var(--blue)">${d.price_estimate}</div>
          </div>
        </div>
        <button onclick="autoSelectService('${d.recommended_service}')" style="width:100%;margin-top:10px;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">
          Book ${d.recommended_service} →
        </button>
        <button onclick="resetDiagnosis()" style="width:100%;margin-top:6px;background:none;border:none;color:var(--mgray);font-size:12px;cursor:pointer;font-family:var(--sans)">Try again</button>
      </div>`;

  } catch(err) {
    resultEl.innerHTML = `
      <div style="background:#FEF2F2;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:12px;color:var(--red)">⚠️ Could not analyse. Please try again or select a service manually.</div>
        <button onclick="resetDiagnosis()" style="margin-top:8px;background:none;border:none;color:var(--mgray);font-size:12px;cursor:pointer;font-family:var(--sans)">Try again</button>
      </div>`;
  }
}

// ── AI BIKE DIAGNOSIS ─────────────────────────────────────────────────────────
async function analyzeBikePhoto(input){
  const file = input.files?.[0];
  if(!file) return;

  const resultEl = document.getElementById('diag-result');
  const uploadArea = document.getElementById('diag-upload-area');

  // Show loading
  resultEl.style.display = 'block';
  resultEl.innerHTML = `
    <div style="text-align:center;padding:20px">
      <div style="font-size:24px;margin-bottom:8px">🔍</div>
      <div style="font-size:13px;font-weight:600;color:var(--navy)">Analysing your bike...</div>
      <div style="font-size:11px;color:var(--mgray);margin-top:4px">Claude is inspecting the image</div>
      <div style="margin-top:12px;height:3px;background:var(--border);border-radius:2px;overflow:hidden">
        <div style="height:100%;background:var(--blue);border-radius:2px;animation:progress 2s ease-in-out infinite"></div>
      </div>
    </div>`;

  // Show preview
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    const mimeType = file.type || 'image/jpeg';

    // Show image preview in upload area
    uploadArea.innerHTML = `<img src="${e.target.result}" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px">`;

    try {
      const res = await fetch('/api/diagnose-bike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType })
      });

      const data = await res.json();

      if(!res.ok || !data.diagnosis) {
        throw new Error(data.error || 'Diagnosis failed');
      }

      const d = data.diagnosis;
      const urgencyColor = { low: '#059669', medium: '#D97706', high: '#DC2626' }[d.urgency] || '#1848C8';
      const urgencyLabel = { low: '🟢 Low urgency', medium: '🟡 Moderate urgency', high: '🔴 Urgent' }[d.urgency] || '';

      resultEl.innerHTML = `
        <div style="background:var(--off);border-radius:10px;padding:14px;border:1px solid var(--border)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="font-size:12px;font-weight:700;color:var(--navy)">🤖 AI Diagnosis</div>
            <span style="font-size:10px;font-weight:600;color:${urgencyColor};background:${urgencyColor}18;padding:3px 8px;border-radius:10px">${urgencyLabel}</span>
          </div>
          <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:4px">${d.problem}</div>
          <div style="font-size:12px;color:var(--mgray);line-height:1.5;margin-bottom:10px">${d.explanation}</div>
          ${d.tips ? `<div style="background:var(--blue-lt);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--blue);margin-bottom:10px">💡 <strong>Quick tip:</strong> ${d.tips}</div>` : ''}
          <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:11px;color:var(--mgray)">Recommended service</div>
              <div style="font-size:13px;font-weight:700;color:var(--navy)">${d.recommended_service}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:var(--mgray)">Estimate</div>
              <div style="font-size:16px;font-weight:700;color:var(--blue)">${d.price_estimate}</div>
            </div>
          </div>
          <button onclick="autoSelectService('${d.recommended_service}')" style="width:100%;margin-top:10px;background:var(--blue);color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans)">
            Book ${d.recommended_service} →
          </button>
          <button onclick="resetDiagnosis()" style="width:100%;margin-top:6px;background:none;border:none;color:var(--mgray);font-size:12px;cursor:pointer;font-family:var(--sans)">Try another photo</button>
        </div>`;

    } catch(err) {
      resultEl.innerHTML = `
        <div style="background:#FEF2F2;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:12px;color:var(--red)">⚠️ Could not analyse image. Please select a service manually.</div>
          <button onclick="resetDiagnosis()" style="margin-top:8px;background:none;border:none;color:var(--mgray);font-size:12px;cursor:pointer;font-family:var(--sans)">Try again</button>
        </div>`;
    }
  };
  reader.readAsDataURL(file);
}

function resetDiagnosis(){
  document.getElementById('diag-result').style.display = 'none';
  document.getElementById('diag-photo-input').value = '';
  document.getElementById('diag-upload-area').innerHTML = `
    <div style="font-size:28px;margin-bottom:6px">📸</div>
    <div style="font-size:13px;font-weight:600;color:var(--navy)">Take or upload a photo</div>
    <div style="font-size:11px;color:var(--mgray);margin-top:2px">of the problem area</div>`;
  document.getElementById('diag-upload-area').onclick = () => document.getElementById('diag-photo-input').click();
}

function autoSelectService(serviceName){
  // Find matching service by name (fuzzy)
  const match = services.find(s =>
    s.name.toLowerCase().includes(serviceName.toLowerCase().split(' ')[0]) ||
    serviceName.toLowerCase().includes(s.name.toLowerCase().split(' ')[0])
  );
  if(match){
    selectService(match.id);
    goStep(2);
    toast('✅ Service selected: ' + match.name);
  } else {
    toast('Please select a service from the list below');
    document.getElementById('diag-result').scrollIntoView({ behavior: 'smooth' });
  }
}

// ── REFERRAL / DISCOUNT CODE ──────────────────────────────────────────────────
let appliedDiscount = 0;
let appliedReferralCode = null;
let appliedDiscountCodeId = null;

async function applyReferral(){
  const code = document.getElementById('referral-input')?.value?.trim().toUpperCase();
  const msgEl = document.getElementById('referral-msg');
  if(!code){ showReferralMsg('Please enter a code', 'error'); return; }
  if(code === userProfile?.referral_code){ showReferralMsg("You can't use your own code", 'error'); return; }

  showReferralMsg('Checking...', 'neutral');

  // 1. Check discount_codes table first
  const { data: dc } = await sb.from('discount_codes')
    .select('*').eq('code', code).eq('active', true).single();

  if(dc){
    // Check expiry
    if(dc.expires_at && new Date(dc.expires_at) < new Date()){
      showReferralMsg('This code has expired', 'error'); return;
    }
    // Check max uses
    if(dc.max_uses && dc.uses_count >= dc.max_uses){
      showReferralMsg('This code has reached its usage limit', 'error'); return;
    }
    const originalPrice = booking.service?.price || 0;
    let discountAmt = 0;
    let label = '';
    if(dc.discount_type === 'percent'){
      discountAmt = Math.round(originalPrice * dc.discount_value / 100);
      label = `🎉 ${dc.discount_value}% discount applied!`;
    } else {
      discountAmt = Math.min(dc.discount_value, originalPrice);
      label = `🎉 $${dc.discount_value} off applied!`;
    }
    appliedDiscount = discountAmt;
    appliedDiscountCodeId = dc.id;
    appliedReferralCode = null;
    const discountedPrice = Math.max(0, originalPrice - discountAmt);
    document.getElementById('cf-price-original').style.display = 'block';
    document.getElementById('cf-price-original').textContent = '$' + originalPrice;
    document.getElementById('cf-price').textContent = '$' + discountedPrice;
    document.getElementById('cf-discount-label').style.display = 'block';
    document.getElementById('cf-discount-label').textContent = label;
    document.getElementById('referral-input').disabled = true;
    document.querySelector('button[onclick="applyReferral()"]').textContent = '✓';
    document.querySelector('button[onclick="applyReferral()"]').style.background = 'var(--green)';
    showReferralMsg(label, 'success');
    return;
  }

  // 2. Check referral codes in profiles
  const { data } = await sb.from('profiles').select('id,full_name,referral_code').eq('referral_code', code).single();
  if(!data){ showReferralMsg('Invalid code — please check and try again', 'error'); return; }

  appliedDiscount = 15;
  appliedReferralCode = code;
  appliedDiscountCodeId = null;
  const originalPrice = booking.service?.price || 0;
  const discountedPrice = Math.max(0, originalPrice - 15);
  document.getElementById('cf-price-original').style.display = 'block';
  document.getElementById('cf-price-original').textContent = '$' + originalPrice;
  document.getElementById('cf-price').textContent = '$' + discountedPrice;
  document.getElementById('cf-discount-label').style.display = 'block';
  document.getElementById('cf-discount-label').textContent = '🎉 Referral discount applied!';
  document.getElementById('referral-input').disabled = true;
  document.querySelector('button[onclick="applyReferral()"]').textContent = '✓';
  document.querySelector('button[onclick="applyReferral()"]').style.background = 'var(--green)';
  showReferralMsg(`✅ $15 off applied! Referred by ${data.full_name?.split(' ')[0] || 'a friend'}`, 'success');
}

function showReferralMsg(msg, type){
  const el = document.getElementById('referral-msg');
  if(!el) return;
  el.style.display = 'block';
  el.textContent = msg;
  el.style.color = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : 'var(--mgray)';
}

// ── COPY REFERRAL ─────────────────────────────────────────────────────────────
function copyReferral(){
  const code = userProfile?.referral_code;
  if(!code) return;
  const text = `Book Dr. Bike Sydney with my code ${code} and we both get $15 off! 🚲 drbikesydney.com.au`;
  navigator.clipboard?.writeText(text).then(()=>toast('📋 Referral link copied!')).catch(()=>{
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    toast('📋 Referral link copied!');
  });
}

// ── REVIEWS ──────────────────────────────────────────────────────────────────
async function loadReviews(){
  // Try to load real reviews from completed bookings with ratings
  const { data } = await sb.from('bookings')
    .select('id, service_name, rating, review_text, review_name, suburb, completed_at')
    .not('rating', 'is', null)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(6);

  const grid = document.getElementById('reviews-grid');
  const summary = document.getElementById('reviews-summary');
  if(!grid) return;

  if(data && data.length >= 3){
    const avg = (data.reduce((s,r)=>s+(r.rating||5),0)/data.length).toFixed(1);
    if(summary) summary.textContent = `${avg}★ average from ${data.length}+ verified bookings`;
    grid.innerHTML = data.slice(0,3).map(r => {
      const initials = (r.review_name||'A').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
      const stars = '★'.repeat(r.rating||5)+'☆'.repeat(5-(r.rating||5));
      return `<div class="review-card">
        <div class="review-stars" style="color:#F59E0B">${stars}</div>
        <div class="review-text">"${esc(r.review_text)}"</div>
        <div class="review-author">
          <div class="review-avatar">${initials}</div>
          <div><div class="review-name">${esc(r.review_name||'Happy rider')}</div><div class="review-suburb">${esc(r.suburb||'Sydney')}</div></div>
        </div>
      </div>`;
    }).join('');
  } else {
    // Keep static fallback reviews
    if(summary) summary.textContent = '4.9★ average from verified bookings';
  }
}

function showReviewModal(bookingId, serviceName){
  let modal = document.getElementById('review-modal');
  if(modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'review-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center';
  let selectedRating = 5;
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:24px">
      <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:6px">Rate your service</div>
      <div style="font-size:12px;color:var(--mgray);margin-bottom:20px">${serviceName}</div>
      <div id="star-row" style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;font-size:36px">
        ${[1,2,3,4,5].map(n=>`<span onclick="setRating(${n})" style="cursor:pointer;transition:transform .1s" id="star-${n}">⭐</span>`).join('')}
      </div>
      <textarea id="review-txt" placeholder="Tell us about your experience..." style="width:100%;padding:12px;border:1.5px solid var(--border);border-radius:8px;font-family:var(--sans);font-size:13px;height:100px;resize:none;margin-bottom:12px;background:var(--white);color:var(--navy)"></textarea>
      <input id="review-name" class="inp" placeholder="Your name (e.g. James M.)" style="margin-bottom:12px">
      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('review-modal').remove()" style="flex:1;padding:12px;border:1.5px solid var(--border);border-radius:8px;background:none;cursor:pointer;font-family:var(--sans)">Skip</button>
        <button onclick="submitReview('${bookingId}')" style="flex:2;padding:12px;background:var(--blue);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-family:var(--sans)">Submit review ⭐</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function setRating(n){
  selectedRating = n;
  [1,2,3,4,5].forEach(i => {
    const s = document.getElementById('star-'+i);
    if(s) s.style.filter = i<=n ? 'grayscale(0)' : 'grayscale(1)';
  });
}

async function submitReview(bookingId){
  const text = document.getElementById('review-txt')?.value?.trim();
  const name = document.getElementById('review-name')?.value?.trim();
  if(!text){ toast('Please write a review first'); return; }
  await sb.from('bookings').update({
    rating: selectedRating||5,
    review_text: text,
    review_name: name || (userProfile?.full_name?.split(' ')[0]+' '+userProfile?.full_name?.split(' ').pop()?.[0]+'.')||'Happy rider'
  }).eq('id', bookingId);
  document.getElementById('review-modal').remove();
  toast('⭐ Thanks for your review!');
  loadReviews();
}

// ── JOB CHAT (cliente ↔ mecánico) ────────────────────────────────────────────
let jobChatChannel = null;
let activeChatBookingId = null;

function toggleJobChat(){
  const body = document.getElementById('job-chat-body');
  const chevron = document.getElementById('chat-chevron');
  if(!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if(chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
  if(open && activeChatBookingId) loadJobMessages(activeChatBookingId);
}

async function initJobChat(bookingId){
  activeChatBookingId = bookingId;
  if(jobChatChannel) sb.removeChannel(jobChatChannel);
  jobChatChannel = sb.channel('job-chat-' + bookingId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'job_messages', filter:`booking_id=eq.${bookingId}` },
      payload => appendJobMessage(payload.new))
    .subscribe();
}

async function loadJobMessages(bookingId){
  const { data } = await sb.from('job_messages').select('*').eq('booking_id', bookingId).order('created_at',{ascending:true});
  const c = document.getElementById('job-chat-msgs');
  if(!c) return;
  c.innerHTML = '';
  if(!data?.length){ c.innerHTML = '<div style="text-align:center;color:var(--mgray);font-size:12px;padding:20px">No messages yet — say hi to your mechanic! 👋</div>'; return; }
  data.forEach(m => appendJobMessage(m, false));
  c.scrollTop = c.scrollHeight;
}

function appendJobMessage(msg, scroll=true){
  const c = document.getElementById('job-chat-msgs');
  if(!c) return;
  c.querySelector('div[style*="text-align:center"]')?.remove();
  const isClient = msg.sender_role === 'client';
  const div = document.createElement('div');
  div.style.cssText = `display:flex;flex-direction:column;align-items:${isClient?'flex-end':'flex-start'};gap:2px;margin-bottom:6px`;
  const bubble = document.createElement('div');
  bubble.style.cssText = `max-width:75%;padding:8px 12px;border-radius:${isClient?'12px 12px 4px 12px':'12px 12px 12px 4px'};font-size:13px;line-height:1.5;background:${isClient?'var(--blue)':'var(--white)'};color:${isClient?'#fff':'var(--navy)'};border:${isClient?'none':'1px solid var(--border)'}`;
  bubble.textContent = msg.message;
  const time = document.createElement('div');
  time.style.cssText = 'font-size:10px;color:var(--mgray)';
  time.textContent = new Date(msg.created_at).toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'});
  div.appendChild(bubble); div.appendChild(time);
  c.appendChild(div);
  if(scroll) c.scrollTop = c.scrollHeight;
}

async function sendJobMessage(){
  if(!activeChatBookingId || !currentUser) return;
  const inp = document.getElementById('job-chat-inp');
  const text = inp?.value?.trim();
  if(!text) return;
  inp.value = '';
  await sb.from('job_messages').insert({ booking_id: activeChatBookingId, sender_role:'client', sender_id: currentUser.id, message: text });
}

// ── TRANSITIONS ───────────────────────────────────────────────────────────────
let liveMap = null, mechMarker = null, destMarker = null, destLatLng = null, trackingChannel = null;

const GMAP_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#0d1f3c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1f3c' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a3a6b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1848c8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// Cleanup realtime channels on page unload
window.addEventListener('beforeunload', () => {
  if (trackingChannel) sb.removeChannel(trackingChannel);
});

async function getDriverName(vanNumber){
  const { data } = await sb.from('van_zones')
    .select('postcode')
    .eq('van_number', vanNumber)
    .eq('suburb', '__driver__')
    .eq('active', true)
    .limit(1);
  const name = data?.[0]?.postcode;
  return name ? name + ' 🚐' : 'Van '+vanNumber+' · Your Mechanic';
}

function startTracking(bookingId, mechName, destAddress) {
  document.getElementById('map-widget').style.display = 'block';
  document.getElementById('map-mech-name').textContent = mechName || 'Your mechanic';

  setTimeout(() => initLiveMap(bookingId, destAddress), 150);
}

async function initLiveMap(bookingId, destAddress) {
  const el = document.getElementById('live-map');
  if (!el) return;

  await window.googleMapsLoaded;

  mechMarker = null; destMarker = null; destLatLng = null;

  liveMap = new google.maps.Map(el, {
    center: { lat: -33.8688, lng: 151.2093 },
    zoom: 13,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
    styles: GMAP_DARK,
  });

  if (destAddress) {
    new google.maps.Geocoder().geocode(
      { address: destAddress + ', Sydney NSW Australia' },
      (results, status) => {
        if (status !== 'OK' || !results[0]) return;
        destLatLng = results[0].geometry.location;
        destMarker = new google.maps.Marker({
          position: destLatLng,
          map: liveMap,
          title: 'Your address',
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
        });
        liveMap.setCenter(destLatLng);
        liveMap.setZoom(14);
        fitMarkers();
      }
    );
  }

  // Subscribe realtime
  if (trackingChannel) { sb.removeChannel(trackingChannel); trackingChannel = null; }
  trackingChannel = sb.channel('mech-loc-' + bookingId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mechanic_locations', filter: `booking_id=eq.${bookingId}` },
      payload => { if (payload.new?.lat) moveMechanic(payload.new.lat, payload.new.lng); })
    .subscribe();

  // Fetch latest position immediately
  sb.from('mechanic_locations').select('*').eq('booking_id', bookingId)
    .order('updated_at', { ascending: false }).limit(1)
    .then(({ data }) => {
      if (data?.[0]) {
        document.getElementById('map-loading').style.display = 'none';
        moveMechanic(data[0].lat, data[0].lng);
      }
    });
}

function moveMechanic(lat, lng) {
  if (!liveMap) return;
  document.getElementById('map-loading').style.display = 'none';
  const pos = new google.maps.LatLng(lat, lng);
  if (!mechMarker) {
    mechMarker = new google.maps.Marker({
      position: pos,
      map: liveMap,
      title: 'Your mechanic',
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: '#1848C8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
    });
  } else {
    mechMarker.setPosition(pos);
  }
  fitMarkers();
  calcETA(lat, lng);
}

function fitMarkers() {
  if (!liveMap) return;
  const bounds = new google.maps.LatLngBounds();
  if (mechMarker) bounds.extend(mechMarker.getPosition());
  if (destMarker) bounds.extend(destMarker.getPosition());
  if (mechMarker && destMarker) liveMap.fitBounds(bounds, 40);
  else if (mechMarker || destMarker) { liveMap.setCenter(bounds.getCenter()); liveMap.setZoom(15); }
}

function calcETA(mechLat, mechLng) {
  if (!destLatLng || !window.google) return;
  new google.maps.DistanceMatrixService().getDistanceMatrix({
    origins: [{ lat: mechLat, lng: mechLng }],
    destinations: [destLatLng],
    travelMode: google.maps.TravelMode.DRIVING,
  }, (resp, status) => {
    if (status !== 'OK') return;
    const el = resp?.rows?.[0]?.elements?.[0];
    if (el?.status === 'OK') {
      const mins = Math.ceil(el.duration.value / 60);
      document.getElementById('map-eta').textContent = mins > 60 ? '60+' : mins;
    }
  });
}

function stopTracking() {
  if (trackingChannel) { sb.removeChannel(trackingChannel); trackingChannel = null; }
  if (mechMarker) { mechMarker.setMap(null); mechMarker = null; }
  if (destMarker) { destMarker.setMap(null); destMarker = null; }
  destLatLng = null; liveMap = null;
  document.getElementById('map-widget').style.display = 'none';
}

// ── SERVICES ─────────────────────────────────────────────────────────────────
async function loadPublicReviews(){
  const grid = document.getElementById('public-reviews-grid');
  if(!grid) return;
  const { data } = await sb.from('bookings')
    .select('client_rating,client_review,service_name,profiles(full_name)')
    .not('client_rating','is',null)
    .not('client_review','is',null)
    .gte('client_rating',4)
    .order('created_at',{ascending:false})
    .limit(6);
  if(!data?.length){
    grid.innerHTML = '<div style="text-align:center;color:var(--mgray);font-size:13px;padding:24px;grid-column:1/-1">No reviews yet — be the first! 🚲</div>';
    return;
  }
  grid.innerHTML = data.map(r=>{
    const stars = '⭐'.repeat(r.client_rating||5);
    const name = r.profiles?.full_name ? r.profiles.full_name.split(' ')[0]+' '+((r.profiles.full_name.split(' ')[1]||'')[0]||'')+'. ' : 'Happy client';
    return `<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:18px;box-shadow:var(--shadow)">
      <div style="font-size:16px;margin-bottom:8px">${stars}</div>
      <div style="font-size:13px;color:var(--navy);line-height:1.6;margin-bottom:12px">"${r.client_review}"</div>
      <div style="font-size:11px;font-weight:600;color:var(--mgray)">${name} · ${r.service_name||'Bike service'}</div>
    </div>`;
  }).join('');
}

async function loadServices(){
  const { data } = await sb.from('services').select('*').eq('active',true).order('category');
  if(data) services = data;
  renderServices();
  renderBookingServices();
}

function renderServices(){
  const cats = [...new Set(services.map(s=>s.category))];
  const filterEl = document.getElementById('filter-pills');
  filterEl.innerHTML = ['all',...cats].map(c=>`<button class="fp${svcFilter===c?' on':''}" onclick="setSvcFilter('${c}')">${c==='all'?'All services':c}</button>`).join('');
  const filtered = svcFilter==='all' ? services : services.filter(s=>s.category===svcFilter);
  const grouped = {};
  filtered.forEach(s=>{ if(!grouped[s.category]) grouped[s.category]=[]; grouped[s.category].push(s); });
  let html = '';
  Object.entries(grouped).forEach(([cat,svcs])=>{
    html += `<div class="cat-label">${cat}</div><div class="svc-grid" style="margin-bottom:20px">`;
    html += svcs.map(s=>`<div class="svc-card" onclick="selectService('${s.id}')">
      <div class="svc-name">${s.name}</div>
      <div class="svc-dur">${s.duration_min === s.duration_max ? s.duration_min+" min" : s.duration_min+"–"+s.duration_max+" min"}</div>
      <div class="svc-price">$${s.price}</div>
    </div>`).join('');
    html += '</div>';
  });
  document.getElementById('services-grid').innerHTML = html || '<div class="empty-state">Loading services...</div>';
}

function setSvcFilter(f){ svcFilter=f; renderServices(); }

let bookCatFilter = 'popular';

async function renderBookingServices(){
  const grid = document.getElementById('book-svcs-grid');
  if(!grid) return;

  // Si no hay servicios, cargarlos primero
  if(!services || services.length === 0){
    grid.innerHTML = '<div style="color:var(--mgray);font-size:13px;padding:20px;grid-column:1/-1;text-align:center">Loading...</div>';
    await loadServices();
  }

  // Get unique categories
  const cats = [...new Set(services.map(s=>s.category).filter(Boolean))];
  
  // Popular = top 6 by price descending (main services)
  const popular = services.slice(0,6);
  const list = bookCatFilter === 'popular' ? popular : services.filter(s=>s.category===bookCatFilter);

  // Render category pills
  const pillsEl = document.getElementById('book-cat-pills');
  if(pillsEl){
    const allPills = ['popular', ...cats];
    pillsEl.innerHTML = allPills.map(c=>`
      <button onclick="setBookCat('${c}')" style="padding:7px 16px;border-radius:20px;border:1.5px solid ${bookCatFilter===c?'var(--blue)':'var(--border)'};background:${bookCatFilter===c?'var(--blue)':'var(--white)'};color:${bookCatFilter===c?'#fff':'var(--navy)'};font-size:12px;font-weight:${bookCatFilter===c?'600':'400'};cursor:pointer;font-family:var(--sans);transition:all .15s;white-space:nowrap">
        ${c==='popular'?'⭐ Popular':c}
      </button>`).join('');
  }

  grid.innerHTML = list.length > 0 ? list.map(s=>`
    <div class="svc-card${booking.service?.id===s.id?' selected':''}" onclick="selectService('${s.id}')">
      <div class="svc-name">${s.name}</div>
      <div class="svc-dur">${s.duration_min === s.duration_max ? s.duration_min+" min" : s.duration_min+"–"+s.duration_max+" min"}</div>
      <div class="svc-price">$${s.price}</div>
    </div>`).join('') : '<div style="color:var(--mgray);font-size:13px;padding:20px;grid-column:1/-1;text-align:center">No services in this category</div>';
}

function setBookCat(cat){
  bookCatFilter = cat;
  renderBookingServices();
}

function selectService(id){
  booking.service = services.find(s=>s.id===id);
  if(!booking.service) return;
  showView('book');
  goStep(2);
}

// ── BOOKING FLOW ─────────────────────────────────────────────────────────────
function goStep(n){
  [1,2,3,4].forEach(i=>{
    document.getElementById('step-'+i).style.display = i===n?'block':'none';
    const s = document.getElementById('bs'+i);
    s.className = 'step-item'+(i<n?' done':i===n?' active':'');
  });
  document.getElementById('step-success').style.display='none';
  // Ocultar chatbot en step 4 para no tapar el botón Confirm
  const chatBtn = document.getElementById('chatbot-btn');
  if(chatBtn) chatBtn.style.display = n===4 ? 'none' : 'flex';
  if(n===2 && booking.service){
    document.getElementById('sel-svc-name').textContent = booking.service.name+' — $'+booking.service.price;
    renderCalendar();
  }
  if(n===4){ fillConfirm(); }
  window.scrollTo(0,0);
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function calChangeMonth(dir) {
  calMonth += dir;
  if(calMonth > 11) { calMonth = 0; calYear++; }
  if(calMonth < 0)  { calMonth = 11; calYear--; }
  // No permitir ir al pasado
  const now = new Date();
  if(calYear < now.getFullYear() || (calYear === now.getFullYear() && calMonth < now.getMonth())) {
    calYear = now.getFullYear();
    calMonth = now.getMonth();
  }
  renderCalendar();
}

async function renderCalendar(){
  const cal = document.getElementById('cal-grid');
  if(!cal) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const year = calYear;
  const month = calMonth;
  
  // Actualizar label del mes
  const label = document.getElementById('cal-month-label');
  if(label) label.textContent = new Date(year, month, 1).toLocaleDateString('en-AU', {month:'long', year:'numeric'});
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  // Fetch existing bookings for this month to show availability
  const dateFrom = `${year}-${String(month+1).padStart(2,'0')}-01`;
  const dateTo = `${year}-${String(month+1).padStart(2,'0')}-${daysInMonth}`;
  const { data: existing } = await sb.from('bookings')
    .select('scheduled_date, scheduled_time, status')
    .gte('scheduled_date', dateFrom).lte('scheduled_date', dateTo)
    .in('status', ['pending','confirmed','enroute']);

  // Count jobs per day (max 4 jobs per day)
  const MAX_JOBS = 4;
  const jobsPerDay = {};
  (existing||[]).forEach(b => {
    const d = b.scheduled_date;
    jobsPerDay[d] = (jobsPerDay[d]||0) + 1;
  });

  // Remove old day cells (keep header cells)
  cal.querySelectorAll('.cday').forEach(c => c.remove());

  // Pad prev month
  for(let i = firstDay-1; i >= 0; i--){
    const d = document.createElement('div');
    d.className = 'cday ot'; d.textContent = daysInPrev - i;
    cal.appendChild(d);
  }

  // Current month
  for(let d = 1; d <= daysInMonth; d++){
    const date = new Date(year, month, d); date.setHours(0,0,0,0);
    const dayOfWeek = date.getDay();
    const isPast = date < today;
    const isSunday = dayOfWeek === 0;
    const dateStr = date.toISOString().split('T')[0];
    const jobCount = jobsPerDay[dateStr] || 0;
    const isFull = jobCount >= MAX_JOBS;

    const el = document.createElement('div');
    if(isPast || isSunday || isFull){
      el.className = 'cday pt';
      if(isFull) el.title = 'Fully booked';
    } else {
      el.className = 'cday avail';
      el.onclick = () => selDay(el, dateStr);
      // Show availability dots
      if(jobCount > 0){
        const spots = MAX_JOBS - jobCount;
        el.title = `${spots} spot${spots!==1?'s':''} left`;
        el.style.opacity = 0.7 + (spots/MAX_JOBS)*0.3;
      }
    }
    if(d === today.getDate()) el.style.fontWeight = '700';
    el.textContent = d;
    cal.appendChild(el);
  }

  // Pad next month
  const totalCells = firstDay + daysInMonth;
  const remainder = totalCells % 7;
  if(remainder > 0){
    for(let d = 1; d <= 7-remainder; d++){
      const el = document.createElement('div');
      el.className = 'cday ot'; el.textContent = d;
      cal.appendChild(el);
    }
  }
}

const ALL_TIME_SLOTS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'];
const MAX_JOBS_PER_SLOT = 3;

async function getAvailableSlots(date, vanNum) {
  try {
    const [{ data: bookings }, { data: blocked }] = await Promise.all([
      sb.from('bookings').select('scheduled_time').eq('scheduled_date', date).eq('van_number', vanNum).neq('status','cancelled'),
      sb.from('availability').select('time_slot,van_number').eq('date', date).eq('blocked', true).catch(()=>({data:[]}))
    ]);
    const slotCounts = {};
    (bookings||[]).forEach(b => {
      const t = b.scheduled_time?.substring(0,5);
      if(t) slotCounts[t] = (slotCounts[t]||0) + 1;
    });
    const blockedSet = new Set((blocked||[]).filter(b=>!b.van_number||b.van_number===vanNum).map(b=>b.time_slot));
    return ALL_TIME_SLOTS.map(t => ({
      time: t,
      label: new Date('2000-01-01T'+t+':00').toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',hour12:true}),
      available: !blockedSet.has(t) && (slotCounts[t]||0) < MAX_JOBS_PER_SLOT,
      full: (slotCounts[t]||0) >= MAX_JOBS_PER_SLOT,
      blocked: blockedSet.has(t)
    }));
  } catch(e) {
    return ALL_TIME_SLOTS.map(t => ({ time:t, label:t, available:true, full:false, blocked:false }));
  }
}

let selDayEl = null;
async function selDay(el, date){
  if(selDayEl) selDayEl.classList.remove('sel');
  el.classList.add('sel'); selDayEl=el;
  booking.date = date;
  booking.time = null;
  document.getElementById('step2-next').disabled = true;
  const ts = document.getElementById('times-section');
  const tg = document.getElementById('times-grid');
  ts.style.display = 'block';
  tg.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:12px;color:var(--mgray);font-size:13px">⏳ Checking availability...</div>';

  // Use van from booking context or default to van 1
  const suburb = document.getElementById('addr-suburb')?.value || '';
  const van = getVanForSuburb(suburb) || 1;
  const slots = await getAvailableSlots(date, van);

  tg.innerHTML = slots.map(s => {
    if(s.blocked) return `<div class="ts bk" title="Blocked">${s.label}<br><span style="font-size:9px">Blocked</span></div>`;
    if(s.full) return `<div class="ts bk" title="Fully booked">${s.label}<br><span style="font-size:9px">Full</span></div>`;
    return `<div class="ts" onclick="selTime(this,'${s.label}')">${s.label}</div>`;
  }).join('');
}

let selTimeEl = null;
function selTime(el, t){
  if(selTimeEl) selTimeEl.classList.remove('sel');
  el.classList.add('sel'); selTimeEl=el;
  booking.time = t;
  document.getElementById('step2-next').disabled = false;
}

function fillConfirm(){
  document.getElementById('cf-svc').textContent = booking.service?.name||'—';
  const d = booking.date ? new Date(booking.date+'T00:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'long'}) : '—';
  document.getElementById('cf-dt').textContent = d + (booking.time?' · '+booking.time:'');
  const suburb = document.getElementById('addr-suburb')?.value||'';
  const street = document.getElementById('addr-street')?.value||'';
  document.getElementById('cf-addr').textContent = [street,suburb].filter(Boolean).join(', ')||'—';
  // Reset discount state
  appliedDiscount = 0; appliedReferralCode = null; appliedDiscountCodeId = null;

  // Dynamic pricing surcharge
  const basePrice = booking.service?.price || 0;
  const today = new Date().toISOString().split('T')[0];
  const bookingDate = booking.date || '';
  const dayOfWeek = bookingDate ? new Date(bookingDate+'T00:00:00').getDay() : -1;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isSameDay = bookingDate === today;

  let surcharge = 0;
  let surchargeLabel = '';
  if(isSameDay){ surcharge = 30; surchargeLabel = '⚡ Same-day surcharge'; }
  else if(isWeekend){ surcharge = 20; surchargeLabel = '📅 Weekend surcharge'; }

  const totalPrice = basePrice + surcharge;
  booking.surcharge = surcharge;

  if(surcharge > 0){
    document.getElementById('cf-price-original').style.display = 'block';
    document.getElementById('cf-price-original').textContent = '$' + basePrice + ' + $' + surcharge + ' ' + surchargeLabel;
    document.getElementById('cf-price').textContent = '$' + totalPrice;
  } else {
    document.getElementById('cf-price').textContent = '$' + basePrice;
    document.getElementById('cf-price-original').style.display = 'none';
  }
  document.getElementById('cf-discount-label').style.display = 'none';
  const refInput = document.getElementById('referral-input');
  if(refInput){ refInput.value=''; refInput.disabled=false; }
  const refMsg = document.getElementById('referral-msg');
  if(refMsg) refMsg.style.display='none';
  const applyBtn = document.querySelector('button[onclick="applyReferral()"]');
  if(applyBtn){ applyBtn.textContent='Apply'; applyBtn.style.background='var(--blue)'; }
  // Auto-assign van using zone manager
  const vanNum = getVanForSuburb(suburb);
  document.getElementById('cf-van').textContent = 'Van '+vanNum+' · Mechanic '+vanNum;
}

function getStripe(){ if(!stripe && window.Stripe) stripe = Stripe('pk_live_51TUbFqPPGSm5cT7JKBDANyRVDmi6Ytia6r31kFxAEWis6xYZuhXlDnoZ3KyB4xUoJWd3nKpzrLxuDzsQEz7X3od3006xPoLzVV'); return stripe; }

async function confirmBooking(){
  if(!await requireAuth('book')) return;
  const btn = document.getElementById('confirm-btn');
  btn.innerHTML='<span class="spinner"></span>Processing...';
  btn.disabled=true;

  const suburb = document.getElementById('addr-suburb').value;
  const vanNum = getVanForSuburb(suburb);
  const originalPrice = booking.service?.price || 0;
  const price = Math.max(0, originalPrice - (appliedDiscount || 0));

  // Save booking first as pending
  const { data: bkg, error } = await sb.from('bookings').insert({
    client_id: currentUser.id,
    user_id: currentUser.id,
    client_name: userProfile?.full_name || currentUser.email?.split('@')[0] || 'Client',
    client_email: currentUser.email || '',
    client_phone: userProfile?.phone_number || '',
    service_id: booking.service?.id,
    service_name: booking.service?.name,
    service_price: price,
    original_price: originalPrice,
    referral_code_used: appliedReferralCode || null,
    discount_applied: appliedDiscount || 0,
    scheduled_date: booking.date,
    scheduled_time: booking.time?.replace(' am','').replace(' pm',''),
    address: [document.getElementById('addr-street').value, suburb, document.getElementById('addr-postcode').value].filter(Boolean).join(', '),
    suburb: suburb,
    van_number: vanNum,
    status: 'pending'
  }).select().single();

  if(error){ 
    btn.innerHTML='Confirm booking';
    btn.disabled=false;
    // Detectar conflicto de slot duplicado
    if(error.code === '23505' || error.message?.includes('unique')) {
      toast('⚠️ This time slot was just booked. Please choose another.');
    } else {
      toast('Booking error: '+error.message); 
    }
    console.error('Booking insert error:', error);
    return; 
  }
  
  btn.innerHTML='Confirm booking';
  btn.disabled=false;

  // Si se usó un código de referido, incrementar el contador del referidor
  if(appliedReferralCode){
    const { data: referrer } = await sb.from('profiles').select('id,referral_count,email,full_name').eq('referral_code', appliedReferralCode).single();
    if(referrer){
      await sb.from('profiles').update({ referral_count: (referrer.referral_count||0) + 1 }).eq('id', referrer.id);
      // Notificar al referidor por email
      if(referrer.email){
        const newCount = (referrer.referral_count||0) + 1;
        fetch('/api/send-email', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            type: 'referral_success',
            to: referrer.email,
            name: referrer.full_name || 'there',
            referralCount: newCount,
            friendName: userProfile?.full_name || 'A friend'
          })
        }).catch(()=>{});
      }
    }
  }

  // Show Stripe payment modal IMMEDIATELY - no esperar nada más
  showPaymentModal(bkg, price);

  // Incrementar uses_count del discount code (fire-and-forget)
  if(appliedDiscountCodeId){
    sb.from('discount_codes').select('uses_count').eq('id', appliedDiscountCodeId).single()
      .then(({data: dc}) => {
        if(dc) sb.from('discount_codes').update({ uses_count: (dc.uses_count||0) + 1 }).eq('id', appliedDiscountCodeId);
      }).catch(()=>{});
  }

  // Confirmation SMS + WhatsApp to client (fire-and-forget)
  const clientPhone = userProfile?.phone_number || userProfile?.phone || userProfile?.phone_number;
  const smsPhone = clientPhone || '+61433963250'; // fallback a Diego para testear
  const smsPayload = {
    to: smsPhone,
    type: 'confirmation',
    name: userProfile?.full_name?.split(' ')[0] || 'there',
    service: bkg.service_name,
    address: bkg.suburb || bkg.address,
    price: bkg.service_price,
    bookingId: bkg.id
  };
  Promise.allSettled([
    fetch('/api/send-sms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(smsPayload) }),
    fetch('/api/send-whatsapp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({...smsPayload, type:'booking_confirmation'}) }),
  ]).catch(() => {});

  // Notify mechanic by email
  try {
    const { data: mechanics } = await sb.from('escalation_contacts').select('*').eq('active', true);
    if(mechanics?.length){
      const vanMech = mechanics.find(m => m.van_number === vanNum) || mechanics[0];
      if(vanMech?.phone){
        const mechEmail = vanMech.email || 'peredo.dm@gmail.com';
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: mechEmail,
            name: vanMech.first_name || 'Mechanic',
            service: bkg.service_name,
            date: new Date(bkg.scheduled_date+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'}),
            time: bkg.scheduled_time,
            address: bkg.address,
            price: bkg.service_price,
            type: 'mechanic_new_booking',
            bookingId: bkg.id
          })
        });
      }
    }
  } catch(e){ console.log('Mechanic email error:', e); }
}

function showPaymentModal(bkg, price){
  // Remove existing modal
  document.getElementById('payment-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'payment-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:28px 24px 40px;width:100%;max-width:480px;box-shadow:0 -8px 40px rgba(0,0,0,0.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <div style="font-size:18px;font-weight:700;color:#0D1F3C">Payment</div>
          <div style="font-size:13px;color:#6B7280;margin-top:2px">${esc(bkg.service_name)} · $${price}</div>
        </div>
        <button onclick="document.getElementById('payment-modal').remove()" style="background:#F7F8FA;border:none;border-radius:50%;width:34px;height:34px;font-size:18px;cursor:pointer">&#x2715;</button>
      </div>
      <!-- Apple Pay / Google Pay wallet (shows only if browser supports it) -->
      <div id="stripe-wallet-wrap" style="display:none;margin-bottom:14px">
        <div id="stripe-payment-request-button"></div>
        <div style="display:flex;align-items:center;gap:10px;margin:14px 0 6px;color:#9CA3AF;font-size:11px;font-weight:600;letter-spacing:0.5px">
          <div style="flex:1;height:1px;background:#E5E7EB"></div>
          <span>OR PAY WITH CARD</span>
          <div style="flex:1;height:1px;background:#E5E7EB"></div>
        </div>
      </div>
      <div id="stripe-card-element" style="border:1.5px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:16px;font-size:16px"></div>
      <div id="stripe-error" style="color:#DC2626;font-size:13px;margin-bottom:12px;display:none"></div>
      <button id="pay-btn" onclick="processPayment('${bkg.id}',${price})" style="width:100%;background:#1848C8;color:#fff;border:none;border-radius:12px;padding:16px;font-size:16px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">
        Pay $${price} AUD
      </button>
      <div style="text-align:center;margin-top:12px;font-size:11px;color:#9CA3AF">🔒 Secured by Stripe · Card charged after service</div>
      <div style="position:relative;z-index:100;margin-top:10px">
        <button onclick="skipPayment('${bkg.id}')" style="display:block;width:100%;background:none;border:1px solid #E5E7EB;border-radius:8px;color:#6B7280;font-size:13px;padding:10px;cursor:pointer;font-family:Inter,sans-serif">Pay cash on the day instead</button>
        <button onclick="cancelBookingModal('${bkg.id}')" style="display:block;width:100%;background:none;border:none;color:#DC2626;font-size:12px;margin-top:6px;cursor:pointer;font-family:Inter,sans-serif">Cancel and go back</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Mount Stripe element
  try {
    const stripeInstance = getStripe();
    if(stripeInstance){
      const elements = stripeInstance.elements();
      window._stripeCard = elements.create('card', {
        style: { base: { fontSize:'16px', color:'#0D1F3C', fontFamily:'Inter,sans-serif', '::placeholder':{ color:'#9CA3AF' } } }
      });
      window._stripeCard.mount('#stripe-card-element');

      // Apple Pay / Google Pay — deferred to next tick, fully isolated with triple try/catch
      // so it CANNOT affect login, calendar, or any other page functionality.
      setTimeout(() => {
        try {
          const priceCents = Math.round(Number(price) * 100);
          if (!priceCents || priceCents < 50) return;
          const pr = stripeInstance.paymentRequest({
            country: 'AU',
            currency: 'aud',
            total: { label: 'Dr. Bike Sydney service', amount: priceCents },
            requestPayerName: true,
            requestPayerEmail: true
          });
          const prBtn = elements.create('paymentRequestButton', {
            paymentRequest: pr,
            style: { paymentRequestButton: { type: 'default', theme: 'dark', height: '48px' } }
          });
          pr.canMakePayment().then(result => {
            try {
              if (result) {
                prBtn.mount('#stripe-payment-request-button');
                const wrap = document.getElementById('stripe-wallet-wrap');
                if (wrap) wrap.style.display = 'block';
              }
            } catch (e) { console.warn('[wallet] mount skipped:', e); }
          }).catch(e => console.warn('[wallet] canMakePayment failed:', e));

          pr.on('paymentmethod', async (ev) => {
            try {
              const { error: updErr } = await sb.from('bookings').update({
                status: 'confirmed',
                payment_method_id: ev.paymentMethod.id
              }).eq('id', bkg.id);
              if (updErr) throw updErr;
              ev.complete('success');
              document.getElementById('payment-modal')?.remove();
              const { data: bkgData } = await sb.from('bookings').select('*').eq('id', bkg.id).single();
              if (bkgData) {
                fetch('/api/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: currentUser?.email,
                    name: userProfile?.full_name || currentUser?.email?.split('@')[0],
                    service: bkgData.service_name,
                    date: new Date(bkgData.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long' }),
                    time: bkgData.scheduled_time,
                    address: bkgData.address,
                    price: bkgData.service_price,
                    type: 'confirmation',
                    bookingId: bkgData.id,
                    referralCode: userProfile?.referral_code
                  })
                }).catch(()=>{});
              }
              showBookingSuccess();
            } catch (err) {
              try { ev.complete('fail'); } catch(_) {}
              const errEl = document.getElementById('stripe-error');
              if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Wallet payment failed. Please try card.'; }
            }
          });
        } catch (e) {
          console.warn('[wallet] setup failed silently:', e);
        }
      }, 0);
    } else {
      document.getElementById('stripe-card-element').innerHTML = '<div style="padding:12px;color:#DC2626;font-size:13px">Card payment unavailable. Please use cash.</div>';
    }
  } catch(e) {
    document.getElementById('stripe-card-element').innerHTML = '<div style="padding:12px;color:#DC2626;font-size:13px">Card payment unavailable. Please use cash.</div>';
  }
}

async function processPayment(bookingId, price){
  const btn = document.getElementById('pay-btn');
  btn.innerHTML='<span class="spinner"></span>Processing...';
  btn.disabled=true;

  const stripeInst = getStripe(); if(!stripeInst){ toast('Card unavailable, please use cash'); return; }
  const { paymentMethod, error } = await stripeInst.createPaymentMethod({
    type: 'card',
    card: window._stripeCard,
  });

  if(error){
    document.getElementById('stripe-error').style.display='block';
    document.getElementById('stripe-error').textContent = error.message;
    btn.innerHTML='Pay $'+price+' AUD';
    btn.disabled=false;
    return;
  }

  // Update booking as confirmed with payment method
  await sb.from('bookings').update({ status:'confirmed', payment_method_id: paymentMethod.id }).eq('id', bookingId);
  document.getElementById('payment-modal').remove();

  // Email confirmación al cliente
  const {data:bkgData} = await sb.from('bookings').select('*').eq('id',bookingId).single();
  if(bkgData){
    await fetch('/api/send-email', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        to: currentUser?.email,
        name: userProfile?.full_name || currentUser?.email?.split('@')[0],
        service: bkgData.service_name,
        date: new Date(bkgData.scheduled_date+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'}),
        time: bkgData.scheduled_time,
        address: bkgData.address,
        price: bkgData.service_price,
        type: 'confirmation',
        bookingId: bkgData.id,
        referralCode: userProfile?.referral_code
      })
    });
  }

  showBookingSuccess();
}

async function cancelBookingModal(bookingId){
  // Delete the pending booking and close modal
  await sb.from('bookings').delete().eq('id', bookingId);
  document.getElementById('payment-modal').remove();
  // Go back to step 4
  goStep(4);
}

async function skipPayment(bookingId){
  await sb.from('bookings').update({ status:'confirmed', payment_method:'cash' }).eq('id', bookingId);
  document.getElementById('payment-modal').remove();
  const {data:bkgData} = await sb.from('bookings').select('*').eq('id',bookingId).single();
  if(bkgData){
    await fetch('/api/send-email', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        to: currentUser?.email,
        name: userProfile?.full_name || currentUser?.email?.split('@')[0],
        service: bkgData.service_name,
        date: new Date(bkgData.scheduled_date+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'}),
        time: bkgData.scheduled_time,
        address: bkgData.address,
        price: bkgData.service_price,
        type: 'confirmation',
        bookingId: bkgData.id,
        referralCode: userProfile?.referral_code
      })
    });
  }
  showBookingSuccess();
}

function showBookingSuccess(){
  trackEvent('booking_completed', { service: booking.service?.name, price: booking.service?.price });
  [1,2,3,4].forEach(i=>document.getElementById('step-'+i).style.display='none');
  ['bs1','bs2','bs3','bs4'].forEach(id=>document.getElementById(id).className='step-item done');
  document.getElementById('step-success').style.display='block';
  toast('Booking confirmed! 🎉');
  updateDashboard();
}

// ── MEMBERSHIP ───────────────────────────────────────────────────────────────
function setBilling(b){
  billing=b;
  document.getElementById('bt-m').classList.toggle('on',b==='m');
  document.getElementById('bt-a').classList.toggle('on',b==='a');
  renderPlans();
}

// ── STRIPE PRICE IDs ─────────────────────────────────────────────────────────
const STRIPE_PRICES = {
  basic:    { monthly: 'price_1TXhqjPPGSm5cT7JolqQhvge', annual: 'price_1TXhrAPPGSm5cT7JRmWioP7D' },
  standard: { monthly: 'price_1TXhrdPPGSm5cT7Jj9ozBG6i', annual: 'price_1TXhrpPPGSm5cT7Jagajk6en' },
  vip:      { monthly: 'price_1TXhsKPPGSm5cT7J5NPefGfB', annual:  'price_1TXhsXPPGSm5cT7Jss6h6TVH' },
};

const PLAN_NAMES = { b: 'basic', s: 'standard', v: 'vip' };

async function subscribePlan(planId) {
  if(!await requireAuth('membership', planId)) return;

  const planKey = PLAN_NAMES[planId];
  const billingKey = billing === 'a' ? 'annual' : 'monthly';
  const priceId = STRIPE_PRICES[planKey]?.[billingKey];

  if (!priceId) {
    toast('⚠️ Plan not available — contact us');
    return;
  }

  const btn = document.getElementById(`plan-btn-${planId}`);
  if (btn) { btn.textContent = 'Redirecting...'; btn.disabled = true; }

  try {
    const res = await fetch('/api/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId,
        email: currentUser.email,
        name: currentUser.user_metadata?.full_name || currentUser.email,
        plan: planKey,
        billing: billingKey,
        customerId: userProfile?.stripe_customer_id || null
      })
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Failed to create session');
    }
  } catch (err) {
    toast('❌ ' + err.message);
    if (btn) { btn.textContent = `Get started — ${planKey}`; btn.disabled = false; }
  }
}

// Handle return from Stripe checkout
function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('subscription');
  if (status === 'success') {
    const plan = params.get('plan');
    toast(`🎉 Welcome to Dr. Bike ${plan?.charAt(0).toUpperCase()+plan?.slice(1)}!`);
    window.history.replaceState({}, '', '/');
    setTimeout(() => { if (currentUser) showView('dashboard'); }, 500);
  } else if (status === 'cancelled') {
    toast('Subscription cancelled — no charge made');
    window.history.replaceState({}, '', '/');
  }
}

const P3=[
  {id:'b',n:'Basic',w:'For occasional riders',mo:57,bikes:'1 bike',bb:'#0D1F3C',
   secs:[{l:'Priority',f:[{t:'Priority booking before non-members',y:true},{t:'SMS reminder when service is due',y:true},{t:'Same-day booking guarantee',y:false}]},{l:'Discounts',f:[{t:'8% off all labour every visit',y:true},{t:'$20 call-out fee waived',y:true}]},{l:'Free services',f:[{t:'1 × Tune-Up/year (value $109)',y:true},{t:'Tyre pressure check monthly',y:true},{t:'Brake check every 3 months',y:false}]}]},
  {id:'s',n:'Standard',w:'Best value · most popular',mo:97,pop:true,bikes:'1 bike',bb:'#1848C8',
   secs:[{l:'Priority',f:[{t:'First-access priority — top of the queue',y:true},{t:'2-hour guaranteed arrival window',y:true},{t:'SMS + call 30 min before arrival',y:true}]},{l:'Discounts',f:[{t:'12% off all labour every visit',y:true},{t:'$20 call-out fee waived',y:true}]},{l:'Free services',f:[{t:'2 × Tune-Ups/year (value $218)',y:true},{t:'Brake check every 3 months',y:true},{t:'Tyre pressure check monthly',y:true}]}]},
  {id:'v',n:'VIP',w:'Serious riders & families',mo:147,bikes:'Up to 3 bikes',bb:'#0D1F3C',
   secs:[{l:'Priority',f:[{t:'Absolute priority in the schedule',y:true},{t:'Same-day booking on request',y:true},{t:'1-hour arrival window guarantee',y:true}]},{l:'Discounts',f:[{t:'18% off all labour every visit',y:true},{t:'$20 call-out fee waived',y:true},{t:'Direct mechanic WhatsApp access',y:true}]},{l:'Free services',f:[{t:'3 × Tune-Ups/year (value $327)',y:true},{t:'Brake & gear check every 2 months',y:true},{t:'Dedicated mechanic — same person always',y:true}]}]},
];

function renderPlans(){
  const userPlan = userProfile?.membership_plan;
  const userStatus = userProfile?.membership_status;

  document.getElementById('plans3').innerHTML=P3.map(p=>{
    const mo=billing==='a'?Math.round(p.mo*0.8):p.mo;
    const annLine=billing==='a'?`Billed $${mo*12}/year — 20% saved`:`Or $${Math.round(p.mo*0.8)}/mo billed annually`;
    const priceCol=p.id==='v'?'#B45309':'var(--navy)';
    const bikeBg=p.id==='v'?'#FEF3C7':p.id==='s'?'#EEF3FC':'#F3F4F6';
    const bikeFc=p.id==='v'?'#B45309':p.id==='s'?'#1848C8':'#4B5563';
    const feats=p.secs.map(s=>`<div class="feat-sl">${s.l}</div>${s.f.map(f=>`<div class="pf${f.y?'':' no'}"><div class="pfd" style="background:${f.y?'#1848C8':'#E5E7EB'}"></div><span>${f.t}</span></div>`).join('')}`).join('');

    const planKey = PLAN_NAMES[p.id];
    const isActive = userPlan === planKey && userStatus === 'active';
    const isPastDue = userPlan === planKey && userStatus === 'past_due';

    let btnHtml;
    if (isActive) {
      btnHtml = `<button class="plb" id="plan-btn-${p.id}" style="background:#059669;color:#fff" disabled>✅ Your current plan</button>`;
    } else if (isPastDue) {
      btnHtml = `<button class="plb" id="plan-btn-${p.id}" style="background:#DC2626;color:#fff" onclick="subscribePlan('${p.id}')">⚠️ Payment failed — update card</button>`;
    } else {
      btnHtml = `<button class="plb" id="plan-btn-${p.id}" style="background:${p.bb};color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.15)" onclick="subscribePlan('${p.id}')">Get started — ${p.n}</button>`;
    }

    return`<div class="pl${p.pop?' pop':''}">
      ${p.pop?'<div class="pop-tag">Most popular</div>':''}
      <div class="pl-name">${p.n}</div><div class="pl-who">${p.w}</div>
      <div class="pl-price" style="color:${priceCol}">$${mo}<span class="pl-mo">/mo</span></div>
      <div class="pl-annual">${annLine}</div>
      <span class="bikes-tag" style="background:${bikeBg};color:${bikeFc};border-color:${bikeBg}">${p.bikes} · parts extra</span>
      ${feats}
      <div class="pl-btn-wrap">
        ${btnHtml}
        <div class="plb-note">3-month minimum · cancel anytime after</div>
      </div>
    </div>`;
  }).join('');
}

// ── NAVIGATION ───────────────────────────────────────────────────────────────
// Ir a booking - si no está logueado, guardar intención y pedir login
async function goBook(){
  if(!await requireAuth('book')) return;
  showView('book');
}

function showView(v){
  // CRÍTICO: si hay sesión activa, nunca mostrar la vista auth
  if(v === 'auth' && currentUser) {

    v = 'dashboard';
  }
  trackEvent('page_view', { page: v });
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  document.getElementById('nav-links').classList.remove('open');
  window.scrollTo(0,0);

  // Ocultar chatbot y PWA banner durante el booking
  const chatBtn = document.getElementById('chatbot-btn');
  const chatPanel = document.getElementById('chatbot-panel');
  if(chatBtn){
    if(v === 'book'){
      chatBtn.style.display = 'none';
      chatBtn.style.visibility = 'hidden';
      hidePWABanner();
      if(chatPanel){ chatPanel.classList.remove('open'); chatPanel.style.display = 'none'; }
    } else {
      chatBtn.style.display = 'flex';
      chatBtn.style.visibility = 'visible';
      if(chatPanel) chatPanel.style.display = '';
    }
  }

  if(v==='dashboard'){
    if(!currentUser){ localStorage.setItem('pendingView','book'); showView('auth'); return; }
    updateDashboard();
  }
  if(v==='book') renderBookingServices();
  if(v==='services') renderServices();
  if(v==='admin') renderVanZones();
}

// ── REALTIME STATUS UPDATE ───────────────────────────────────────────────────
function showStatusUpdate(booking){
  const statusMessages = {
    confirmed: { icon:'✅', msg:'Your booking is confirmed!', color:'#1848C8' },
    enroute:   { icon:'🚐', msg:'Your mechanic is on the way!', color:'#D97706' },
    completed: { icon:'🎉', msg:'Service completed! How did we do?', color:'#059669' },
    cancelled: { icon:'❌', msg:'Booking cancelled.', color:'#DC2626' }
  };
  const s = statusMessages[booking.status];
  if(!s) return;

  // Remove existing notification
  document.getElementById('status-notif')?.remove();

  const notif = document.createElement('div');
  notif.id = 'status-notif';
  notif.style.cssText = `position:fixed;top:70px;left:16px;right:16px;background:#fff;border-radius:16px;padding:16px 20px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.18);border-left:4px solid ${s.color};display:flex;align-items:center;gap:14px;animation:slideDown .3s ease`;
  notif.innerHTML = `
    <div style="font-size:28px">${s.icon}</div>
    <div style="flex:1">
      <div style="font-size:14px;font-weight:700;color:#0D1F3C">${s.msg}</div>
      <div style="font-size:12px;color:#6B7280;margin-top:2px">${booking.service_name} · $${booking.service_price}</div>
    </div>
    <button onclick="document.getElementById('status-notif').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#6B7280;padding:4px">✕</button>`;
  document.body.appendChild(notif);

  // Auto dismiss after 8 seconds
  setTimeout(()=>notif?.remove(), 8000);

  // If enroute, show map widget
  if(booking.status === 'enroute'){
    document.getElementById('map-widget').style.display = 'block';
    getDriverName(booking.van_number||1).then(name => {
      document.getElementById('map-mech-name').textContent = name;
    });
    document.getElementById('map-eta').textContent = Math.floor(Math.random()*15+5);
  }

  // If completed, show review prompt
  if(booking.status === 'completed'){
    setTimeout(()=>showReviewPrompt(booking), 1000);
  }
}

function showReviewPrompt(booking){
  document.getElementById('review-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'review-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:28px 24px 40px;width:100%;max-width:480px">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:8px">⭐</div>
        <div style="font-size:18px;font-weight:700;color:#0D1F3C">How was your service?</div>
        <div style="font-size:13px;color:#6B7280;margin-top:4px">${booking.service_name}</div>
      </div>
      <div style="display:flex;justify-content:center;gap:12px;margin-bottom:20px" id="star-row">
        ${[1,2,3,4,5].map(n=>`<button onclick="setRating(${n})" id="star-${n}" style="font-size:36px;background:none;border:none;cursor:pointer;transition:transform .15s;filter:grayscale(1)">⭐</button>`).join('')}
      </div>
      <textarea id="review-text" placeholder="Tell us about your experience (optional)" style="width:100%;border:1.5px solid #E5E7EB;border-radius:10px;padding:12px;font-size:13px;font-family:Inter,sans-serif;resize:none;height:80px;outline:none;margin-bottom:16px"></textarea>
      <button onclick="submitReview('${booking.id}')" style="width:100%;background:#1848C8;color:#fff;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">Submit review</button>
      <button onclick="document.getElementById('review-modal').remove()" style="display:block;width:100%;background:none;border:none;color:#6B7280;font-size:13px;margin-top:10px;cursor:pointer;font-family:Inter,sans-serif">Skip</button>
    </div>`;
  document.body.appendChild(modal);
}

let selectedRating = 0;
// ── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

// ── CHATBOT ──────────────────────────────────────────────────────────────────
let chatOpen = false;
let chatHistory = [];
let escalated = false;

function toggleChat(){
  chatOpen = !chatOpen;
  document.getElementById('chatbot-panel').classList.toggle('open', chatOpen);
  document.getElementById('cb-notif').classList.remove('show');
  if(chatOpen && chatHistory.length === 0){
    addBotMsg("👋 G'day! I'm the Dr. Bike assistant. I can help with pricing, bookings, coverage areas, and more. What do you need?");
  }
}

function addBotMsg(text, type='bot'){
  chatHistory.push({ role:'assistant', content:text });
  const msgs = document.getElementById('cb-msgs');
  const div = document.createElement('div');
  div.className = 'cb-msg ' + type;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addUserMsg(text){
  chatHistory.push({ role:'user', content:text });
  const msgs = document.getElementById('cb-msgs');
  const div = document.createElement('div');
  div.className = 'cb-msg user';
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping(){
  const msgs = document.getElementById('cb-msgs');
  const div = document.createElement('div');
  div.className = 'cb-typing';
  div.id = 'cb-typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function hideTyping(){
  const t = document.getElementById('cb-typing');
  if(t) t.remove();
}

function quickMsg(text){
  document.getElementById('cb-inp').value = text;
  sendChat();
}

async function sendChat(){
  const inp = document.getElementById('cb-inp');
  const text = inp.value.trim();
  if(!text) return;
  inp.value = '';

  addUserMsg(text);
  document.getElementById('cb-quick').style.display = 'none';

  const t = text.toLowerCase();

  // Escalation
  const escalateWords = ['mechanic','human','person','call','phone','urgent','emergency','speak','talk','real','help'];
  if(escalateWords.some(w=>t.includes(w)) && !escalated){
    escalated = true;
    showTyping();
    await new Promise(r=>setTimeout(r,700));
    hideTyping();
    addBotMsg("I'll connect you with our team right away! 🔧", 'escalated');
    // Load real contacts from Supabase
    setTimeout(async ()=>{
      try {
        const { data: contacts } = await sb.from('escalation_contacts').select('*').order('role');
        const msgs = document.getElementById('cb-msgs');
        if(contacts && contacts.length > 0){
          contacts.forEach(c=>{
            const roleLabel = { manager:'Manager', mechanic:'Mechanic' };
            const div = document.createElement('div');
            div.className = 'cb-msg escalated';
            div.innerHTML = '📱 <b>'+esc(c.first_name)+' '+esc(c.last_name)+'</b> — '+esc(roleLabel[c.role]||c.role)+'<br><a href="tel:'+esc(c.phone.replace(/\s/g,''))+'" style="color:inherit;font-weight:700">'+esc(c.phone)+'</a>';
            msgs.appendChild(div);
          });
          const div2 = document.createElement('div');
          div2.className = 'cb-msg escalated';
          div2.textContent = "We'll get back to you within 15 minutes! 🙏";
          msgs.appendChild(div2);
        } else {
          addBotMsg("📞 WhatsApp us at +61 433 963 250 — we'll get back to you within 15 minutes!", 'escalated');
        }
        msgs.scrollTop = msgs.scrollHeight;
      } catch(e){
        addBotMsg("📞 WhatsApp us at +61 433 963 250 — we'll get back to you within 15 minutes!", 'escalated');
      }
    }, 900);
    return;
  }

  showTyping();

  // AI-powered response via Claude
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...chatHistory, { role: 'user', content: text }],
        userProfile: userProfile ? { full_name: userProfile.full_name, membership_plan: userProfile.membership_plan } : null
      })
    });
    const data = await res.json();
    hideTyping();
    const reply = data.reply || "I'm not sure about that — type 'mechanic' to speak with our team! 🔧";
    addBotMsg(reply);

    // Show escalation button after 3 messages
    const userMsgs = chatHistory.filter(m=>m.role==='user').length;
    if(userMsgs >= 3 && !escalated){
      setTimeout(()=>{
        const msgs = document.getElementById('cb-msgs');
        const div = document.createElement('div');
        div.className = 'cb-msg bot';
        const btn = document.createElement('button');
        btn.textContent = '🔧 Talk to a mechanic';
        btn.style.cssText = 'background:var(--blue);color:#fff;border:none;border-radius:12px;padding:8px 16px;font-size:12px;cursor:pointer;font-family:var(--sans);margin-top:4px;width:100%';
        btn.onclick = ()=>quickMsg('I need to speak to a mechanic');
        div.appendChild(btn);
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
      }, 800);
    }
    return;
  } catch(e) {
    hideTyping();
    addBotMsg("Sorry, I'm having trouble. Type 'mechanic' to reach our team! 🔧");
    return;
  }

  // Fallback rule-based (never reached if API works)
  let reply = '';
  if(t.match(/price|cost|how much|charge|fee|expensive|cheap/)){
    reply = "Our prices include a $20 mobile call-out fee 🚐 Services start from $59 (Gear Adjustment) up to $299+ (Bike Build). Popular ones: Tune-Up $109, Standard Service $149, Major Service $229, Brake Bleed $79. Members get the call-out fee waived!";
  } else if(t.match(/tune.?up|tuneup/)){
    reply = "Our Tune-Up is $109 and takes about 45–60 min. It includes brake & gear adjustment, tyre pressure check, and a general safety inspection. Great for bikes that haven't been serviced in a while! 🚲";
  } else if(t.match(/standard service/)){
    reply = "The Standard Service is $149 and covers everything in a Tune-Up plus drivetrain cleaning, cable check, and a full safety assessment. Most popular service for regular riders! ✅";
  } else if(t.match(/major service/)){
    reply = "The Major Service is $229 — our most comprehensive service. Includes full drivetrain clean & lube, bearing check, brake bleed (hydraulic), wheel true, and complete safety check. 🔧";
  } else if(t.match(/brake/)){
    reply = "Brake Bleed is $79 for hydraulic brakes. Brake pad install starts at $40. We carry most common brake pads — parts are always extra at cost price. 🛑";
  } else if(t.match(/gear|derailleur|shift/)){
    reply = "Gear Adjustment is $59 and usually takes 20–30 min. If your gears are skipping or not shifting cleanly, this is the fix! Cable replacement is extra if needed. ⚙️";
  } else if(t.match(/ebike|e-bike|electric/)){
    reply = "We service e-bikes! E-bike Diagnostic is $99. We work on most brands — Bosch, Shimano Steps, Yamaha motors. Battery and motor repairs depend on the issue. ⚡";
  } else if(t.match(/build|new bike|assemble/)){
    reply = "Bike builds start at $299+, depending on complexity. We can assemble bikes from boxes (online purchases) or do full custom builds. Usually takes 1–2 hours. 🏗️";
  } else if(t.match(/area|suburb|cover|location|where|come to|travel/)){
    reply = "We cover most of Sydney! 📍 Inner West (Newtown, Glebe, Balmain), Eastern Suburbs (Bondi, Paddington, Randwick), CBD, North Shore (Chatswood, Mosman), Manly & Northern Beaches. Not sure if we cover your area? Just ask!";
  } else if(t.match(/hour|open|available|time|when|day/)){
    reply = "We operate Monday to Saturday, 8am–5pm 🕗 Same-day bookings are available! Book online and we'll confirm your slot within 30 minutes.";
  } else if(t.match(/book|reserv|appoint|schedul/)){
    reply = "Booking is easy! 📅 Click 'Book' in the menu, pick your service, choose a date and time, and enter your address. We come to you! Same-day slots are often available.";
  } else if(t.match(/member|membership|subscription|plan/)){
    reply = "We have 3 membership plans 🌟 Basic $57/mo (8% off + call-out waived), Standard $97/mo (12% off + 2 free tune-ups/year), VIP $147/mo (18% off + 3 free tune-ups + priority booking). Annual billing saves 20%!";
  } else if(t.match(/basic|57/)){
    reply = "Basic membership is $57/mo 🌟 You get 8% off all services, call-out fee waived, 1 free Tune-Up per year, and priority booking. Great value if you service your bike 2+ times a year!";
  } else if(t.match(/vip|147/)){
    reply = "VIP membership is $147/mo 👑 Best for serious riders — 18% off all services, 3 free Tune-Ups/year, same-day booking on request, 1-hour arrival guarantee, and direct WhatsApp access to your mechanic!";
  } else if(t.match(/part|spare|componen/)){
    reply = "Parts are always charged at cost price — no markup! 💪 We carry common parts in the van (tubes, brake pads, cables, chains). For specialty parts we'll let you know in advance.";
  } else if(t.match(/payment|pay|card|cash|stripe/)){
    reply = "We accept card payments (Visa, Mastercard, Amex) and bank transfer 💳 Payment is taken after the job is complete. Members are billed monthly automatically.";
  } else if(t.match(/cancel|reschedule|change/)){
    reply = "No worries! You can cancel or reschedule up to 2 hours before your booking with no charge. Just reply to your confirmation email or message us on WhatsApp. 📱";
  } else if(t.match(/how long|duration|time take/)){
    reply = "Most services take 45–90 minutes ⏱️ Simple jobs like gear adjustment are 20–30 min. Major services or bike builds can take 2+ hours. We'll give you an estimate when you book!";
  } else if(t.match(/hello|hi|hey|g'day|gday|howdy/)){
    reply = "G'day! 👋 I'm the Dr. Bike assistant. I can help with pricing, bookings, what services we offer, and our coverage areas. What can I help you with?";
  } else if(t.match(/thank|thanks|cheers|great|awesome|perfect/)){
    reply = "No worries at all! 😊 Feel free to ask if you need anything else. Happy riding! 🚲";
  } else if(t.match(/warranty|guarantee/)){
    reply = "All our work comes with a 30-day satisfaction guarantee 💯 If anything isn't right after your service, we'll come back and fix it at no charge!";
  } else {
    reply = "Good question! I'm not 100% sure about that one 🤔 For specific questions, I'd recommend chatting with one of our mechanics directly — they'll know exactly what you need!";
    // Show escalation button
    setTimeout(()=>{
      const msgs = document.getElementById('cb-msgs');
      const div = document.createElement('div');
      div.className = 'cb-msg bot';
      const btn = document.createElement('button');
      btn.textContent = '🔧 Ask a mechanic';
      btn.style.cssText = 'background:var(--blue);color:#fff;border:none;border-radius:12px;padding:6px 14px;font-size:12px;cursor:pointer;font-family:var(--sans);margin-top:4px';
      btn.onclick = ()=>quickMsg('I need to speak to a mechanic');
      div.appendChild(btn);
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }, 500);
  }

  addBotMsg(reply);

  // After 3 msgs show escalation option
  const userMsgs = chatHistory.filter(m=>m.role==='user').length;
  if(userMsgs === 3 && !escalated){
    setTimeout(()=>{
      const msgs = document.getElementById('cb-msgs');
      const div = document.createElement('div');
      div.className = 'cb-msg bot';
      const btn = document.createElement('button');
      btn.textContent = '🔧 Talk to a mechanic';
      btn.style.cssText = 'background:var(--blue);color:#fff;border:none;border-radius:12px;padding:6px 14px;font-size:12px;cursor:pointer;font-family:var(--sans);margin-top:4px';
      btn.onclick = ()=>quickMsg('I need to speak to a mechanic');
      div.appendChild(btn);
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }, 600);
  }
}

// ── EMAIL ────────────────────────────────────────────────────────────────────
async function sendEmail(type, bookingData){
  try {
    const email = currentUser?.email || userProfile?.email;
    if(!email) return;
    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        name: userProfile?.full_name || email.split('@')[0],
        service: bookingData.service_name || bookingData.service,
        date: bookingData.scheduled_date ? new Date(bookingData.scheduled_date+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'}) : '',
        time: bookingData.scheduled_time || '',
        address: bookingData.address || '',
        price: bookingData.service_price || bookingData.price || 0,
        type: type
      })
    });
  } catch(e){ console.log('Email error:', e); }
}

// ── BIKE PROFILE ─────────────────────────────────────────────────────────────
let selectedBikeType = 'road';

function openBikeModal(bikeId){
  document.getElementById('bike-modal-title').textContent = bikeId ? 'Edit bike' : 'Add a bike';
  document.getElementById('bike-id').value = bikeId || '';
  document.getElementById('bike-nickname').value = '';
  document.getElementById('bike-brand').value = '';
  document.getElementById('bike-model').value = '';
  document.getElementById('bike-year').value = '';
  document.getElementById('bike-notes').value = '';
  selectedBikeType = 'road';
  document.querySelectorAll('.bike-type-opt').forEach(b=>b.classList.remove('sel'));
  document.getElementById('bt-road')?.classList.add('sel');
  document.getElementById('bike-modal').classList.add('open');
}

function closeBikeModal(){
  document.getElementById('bike-modal').classList.remove('open');
}

function setBikeType(type, btn){
  selectedBikeType = type;
  document.querySelectorAll('.bike-type-opt').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
}

async function saveBike(){
  if(!currentUser) return;
  const nickname = document.getElementById('bike-nickname').value.trim();
  if(!nickname){ toast('Please add a nickname for your bike'); return; }

  const bikeId = document.getElementById('bike-id').value;
  const bikeData = {
    client_id: currentUser.id,
    nickname,
    brand: document.getElementById('bike-brand').value.trim(),
    model: document.getElementById('bike-model').value.trim(),
    year: parseInt(document.getElementById('bike-year').value)||null,
    type: selectedBikeType,
    notes: document.getElementById('bike-notes').value.trim()
  };

  if(bikeId){
    await sb.from('bikes').update(bikeData).eq('id', bikeId);
    toast('Bike updated ✓');
  } else {
    await sb.from('bikes').insert(bikeData);
    toast('Bike added! 🚲');
    trackEvent('bike_added', { type: selectedBikeType });
  }
  closeBikeModal();
  loadBikes();
}

async function loadBikes(){
  if(!currentUser) return;
  const { data } = await sb.from('bikes').select('*').eq('client_id', currentUser.id).order('created_at');
  const el = document.getElementById('my-bikes-list');
  if(!el) return;

  const typeIcons = { road:'🚴', mtb:'🚵', ebike:'⚡', hybrid:'🚲', bmx:'🛴', kids:'👶' };
  if(!data || data.length === 0){
    el.innerHTML = `<button class="add-bike-btn" onclick="openBikeModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add your first bike
    </button>`;
    return;
  }

  el.innerHTML = data.map(b=>`
    <div class="bike-card" onclick="openBikeModal('${b.id}')">
      <div class="bike-icon">${typeIcons[b.type]||'🚲'}</div>
      <div class="bike-info" style="flex:1">
        <div class="bike-name">${b.nickname}</div>
        <div class="bike-sub">${[b.brand,b.model,b.year].filter(Boolean).join(' · ')||'Tap to add details'}</div>
      </div>
      <button onclick="event.stopPropagation();showBikeHistory('${b.id}','${b.nickname}')" style="background:var(--blue-lt);color:var(--blue);border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--sans);flex-shrink:0">History</button>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mgray)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`).join('') + `<button class="add-bike-btn" onclick="openBikeModal()" style="margin-top:8px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add another bike
    </button>`;
}

async function showBikeHistory(bikeId, bikeName){
  let modal = document.getElementById('bike-history-modal');
  if(modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'bike-history-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px 16px 0 0;width:100%;max-width:540px;max-height:90vh;display:flex;flex-direction:column">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--navy)">🚲 ${bikeName}</div>
          <div style="font-size:11px;color:var(--mgray)">Service history & health</div>
        </div>
        <button onclick="document.getElementById('bike-history-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--mgray)">×</button>
      </div>
      <div id="bike-history-stats" style="flex-shrink:0"></div>
      <div id="bike-history-reminder" style="display:none;flex-shrink:0"></div>
      <div id="bike-history-content" style="overflow-y:auto;padding:16px 20px;flex:1">
        <div style="text-align:center;color:var(--mgray);font-size:13px;padding:20px">⏳ Loading...</div>
      </div>
      <div style="padding:14px 16px;border-top:1px solid var(--border);flex-shrink:0">
        <button onclick="document.getElementById('bike-history-modal').remove();showView('book')" style="width:100%;background:var(--blue);color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--sans)">+ Book next service</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const {data:bkgs} = await sb.from('bookings')
    .select('*')
    .eq('client_id', currentUser.id)
    .eq('status','completed')
    .order('completed_at',{ascending:false});

  // Check if any upcoming service recommendation is due
  const allNextDates = (bkgs||[]).map(b=>b.next_service_date).filter(Boolean);
  if(allNextDates.length){
    const soonest = allNextDates.sort()[0];
    const diff = Math.ceil((new Date(soonest) - new Date()) / (1000*60*60*24));
    const rem = document.getElementById('bike-history-reminder');
    if(diff <= 30){
      const msg = diff < 0 ? `⚠️ Service overdue by ${Math.abs(diff)} days` : `📅 Next service due in ${diff} day${diff!==1?'s':''}`;
      rem.style.cssText = 'padding:10px 16px;background:'+(diff<0?'#FEF2F2':'#ECFDF5')+';color:'+(diff<0?'#DC2626':'#059669')+';font-size:12px;font-weight:600;display:block;border-bottom:1px solid var(--border)';
      rem.textContent = msg + ' — ' + new Date(soonest+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
    }
  }

  // ── STATS Y HEALTH SCORE ────────────────────────────────────────────────────
  const statsEl = document.getElementById('bike-history-stats');
  const totalJobs = bkgs?.length || 0;
  const totalSpent = (bkgs||[]).reduce((s,b)=>s+(b.service_price||0),0);
  const lastService = bkgs?.[0]?.completed_at || bkgs?.[0]?.scheduled_date;
  const daysSince = lastService ? Math.floor((new Date()-new Date(lastService))/(1000*60*60*24)) : null;

  // Health score: 100 if serviced < 30 days ago, degrades to 0 at 180 days
  const health = daysSince === null ? 50 : Math.max(0, Math.round(100 - (daysSince/180)*100));
  const healthColor = health>=70?'#059669':health>=40?'#D97706':'#DC2626';
  const healthLabel = health>=70?'Great shape':health>=40?'Fair':'Needs attention';

  statsEl.innerHTML = `
    <div style="padding:16px 20px;background:var(--off);border-bottom:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--navy)">${totalJobs}</div>
          <div style="font-size:10px;color:var(--mgray);font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Services</div>
        </div>
        <div style="text-align:center;border-left:1px solid var(--border);border-right:1px solid var(--border)">
          <div style="font-size:20px;font-weight:800;color:var(--navy)">$${totalSpent}</div>
          <div style="font-size:10px;color:var(--mgray);font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Total spent</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--navy)">${daysSince===null?'—':daysSince+'d'}</div>
          <div style="font-size:10px;color:var(--mgray);font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Since last</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:11px;color:var(--mgray);font-weight:600;white-space:nowrap">Bike health</div>
        <div style="flex:1;height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${health}%;background:${healthColor};border-radius:4px;transition:width 0.6s"></div>
        </div>
        <div style="font-size:12px;font-weight:700;color:${healthColor};white-space:nowrap">${health}% · ${healthLabel}</div>
      </div>
    </div>`;

  const content = document.getElementById('bike-history-content');
  if(!bkgs?.length){
    content.innerHTML = '<div style="text-align:center;color:var(--mgray);font-size:13px;padding:32px">No service history yet.<br><br>Complete your first service to start tracking your bike health.</div>';
    return;
  }

  content.innerHTML = bkgs.map(b=>{
    const date = new Date(b.completed_at||b.scheduled_date+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
    const mechLabel = b.van_number ? `Van ${b.van_number}` : '';
    return `<div style="padding:14px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div style="font-size:13px;font-weight:600;color:var(--navy)">${b.service_name||'Service'}</div>
        <div style="font-size:14px;font-weight:700;color:var(--blue)">$${b.service_price||0}</div>
      </div>
      <div style="font-size:11px;color:var(--mgray);margin-bottom:6px">${date}${mechLabel?' · 🔧 '+mechLabel:''}</div>
      ${b.mechanic_notes?`<div style="background:var(--off);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--navy);line-height:1.5;margin-bottom:6px">📝 ${b.mechanic_notes}</div>`:''}
      ${b.parts_used?`<div style="font-size:11px;color:var(--mgray);margin-bottom:4px">🔧 Parts: ${b.parts_used}</div>`:''}
      ${b.photo_before||b.photo_after?`<div style="display:flex;gap:6px;margin-top:6px">${b.photo_before?`<img src="${b.photo_before}" loading="lazy" style="width:72px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" alt="Before">`:''}${b.photo_after?`<img src="${b.photo_after}" loading="lazy" style="width:72px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" alt="After">`:''}${(b.photo_before||b.photo_after)?'<div style="font-size:10px;color:var(--mgray);display:flex;flex-direction:column;justify-content:flex-end;gap:2px">'+(b.photo_before?'<span>Before</span>':'')+(b.photo_after?'<span>After</span>':'')+'</div>':''}</div>`:''}
      ${b.next_service_date?`<div style="font-size:11px;color:var(--green);margin-top:6px;font-weight:600">📅 Next service: ${new Date(b.next_service_date+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})}</div>`:''}
      ${b.client_rating?`<div style="font-size:12px;margin-top:4px">${'⭐'.repeat(b.client_rating)}</div>`:''}
    </div>`;
  }).join('');
}

// ── ANALYTICS ────────────────────────────────────────────────────────────────
function trackEvent(name, params){
  if(typeof gtag !== 'undefined') gtag('event', name, params||{});
}

// ── START ────────────────────────────────────────────────────────────────────
renderPlans();
init();

let currentLang = localStorage.getItem('drbike-lang') || 'en';

function toggleLangPanel(){
  document.getElementById('lang-panel').classList.toggle('open');
}

// Close panel when clicking outside
document.addEventListener('click', e=>{
  if(!e.target.closest('#lang-btn') && !e.target.closest('#lang-btn-mob') && !e.target.closest('#lang-panel')){
    document.getElementById('lang-panel').classList.remove('open');
  }
});

function setLang(lang, flag, name){
  currentLang = lang;
  localStorage.setItem('drbike-lang', lang);

  // Update button label
  const langLabels = {en:'EN',es:'ES','zh-CN':'中文',pt:'PT',it:'IT',ko:'한국',fr:'FR',ar:'AR',hi:'HI',ja:'JA'};
  const label = langLabels[lang] || lang.toUpperCase().slice(0,2);
  const labelEl = document.getElementById('lang-label');
  if(labelEl) labelEl.textContent = label;

  // Update active state
  document.querySelectorAll('.lang-opt').forEach(b=>b.classList.remove('active'));
  document.getElementById('lang-'+lang.split('-')[0])?.classList.add('active');

  document.getElementById('lang-panel').classList.remove('open');

  if(lang === 'en'){
    // If page was translated via Google, strip the translate.goog wrapper
    const url = window.location.href;
    if(url.includes('translate.goog') || url.includes('_x_tr_')){
      // Extract original URL and navigate back
      try {
        const orig = new URL(url);
        const base = orig.searchParams.get('_x_tr_sl') ? window.location.origin + window.location.pathname : window.location.href;
        window.location.href = window.location.origin + window.location.pathname;
      } catch(e){ window.location.href = window.location.origin; }
    }
    return;
  }

  // Use Google Translate URL approach — no widget script needed
  const pageUrl = encodeURIComponent(window.location.origin + window.location.pathname);
  window.location.href = `https://translate.google.com/translate?sl=en&tl=${lang}&u=${pageUrl}`;
}

// Apply saved language on load
window.addEventListener('load', ()=>{
  if(currentLang && currentLang !== 'en'){
    const langLabels = {es:'ES','zh-CN':'中文',pt:'PT',it:'IT',ko:'한국',fr:'FR',ar:'AR',hi:'HI',ja:'JA'};
    const labelEl = document.getElementById('lang-label');
    if(labelEl) labelEl.textContent = langLabels[currentLang] || currentLang.toUpperCase().slice(0,2);
    document.querySelectorAll('.lang-opt').forEach(b=>b.classList.remove('active'));
    document.getElementById('lang-'+currentLang.split('-')[0])?.classList.add('active');
  }
});

// PWA Service Worker
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js').then(r=>{
      console.log('SW registered');
    }).catch(e=>console.log('SW error:', e));
  });
}

// PWA install prompt handled above

function showInstallBanner(){
  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.style.cssText = 'position:fixed;bottom:90px;left:16px;right:16px;background:#0D1F3C;color:#fff;border-radius:16px;padding:16px 20px;display:flex;align-items:center;gap:14px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.3)';
  banner.innerHTML = `
    <div style="width:42px;height:42px;background:#1848C8;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px">🚲</div>
    <div style="flex:1">
      <div style="font-size:14px;font-weight:600">Add Dr. Bike to your home screen</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:2px">Install the app for faster access</div>
    </div>
    <button onclick="installPWA()" style="background:#1848C8;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap">Install</button>
    <button onclick="document.getElementById('install-banner').remove()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:8px;padding:8px;font-size:13px;cursor:pointer">✕</button>`;
  document.body.appendChild(banner);
}

// Cancellation policy modal
function showCancelPolicy(){ document.getElementById('policy-modal-web').style.display='flex'; }
function closeCancelPolicy(){ document.getElementById('policy-modal-web').style.display='none'; }