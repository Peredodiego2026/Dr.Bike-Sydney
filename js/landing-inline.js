// Extracted from landing.html inline <script> tags (docs/PENDIENTES.md 3.2).
// 15 blocks, concatenated in their original document order -
// that order is load-bearing, they share this file's top-level scope
// exactly like they shared the page's global scope before.

window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-GXYD68JXZW');


  Sentry.onLoad(function() {
    Sentry.init({
      dsn: "https://dbe16e37f69ca4ae1724ab697c0f4255@o4511637539651584.ingest.de.sentry.io/4511637556625488",
      environment: "production",
      release: "drbike@1.0.0",
      tracesSampleRate: 0.2,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        Sentry.replayIntegration(),
        Sentry.browserTracingIntegration(),
      ],
      beforeSend: function(event) {
        const url = (event.request && event.request.url) || '';
        if (url.startsWith('data:')) return null;
        return event;
      },
    });
  });


  // PostHog's own install snippet (copy-pasted, same as the one still inline
  // in index.html), minified - left byte-for-byte except the var->let no-var
  // fix, which eslint's own fixer judged safe. Its `2==o.length` is vendor
  // code, not ours; not rewriting it.
  // eslint-disable-next-line eqeqeq
  !function(t,e){let o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){const o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);let u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){let e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.people.toString()+" (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  // Visit ?notrack=1 once on a device to keep it out of the numbers, ?notrack=0
  // to undo it. This exists because there is no way to filter a person out in
  // PostHog: identify() is never called anywhere (js/analytics.js has no
  // importers), so no person property exists to filter on. Wrapped because
  // localStorage throws outright in some privacy modes, and analytics must
  // never be the thing that stops the page from booting.
  try {
    const _nt = new URLSearchParams(location.search).get('notrack');
    if (_nt === '1') localStorage.setItem('drbike-no-track', '1');
    else if (_nt === '0') localStorage.removeItem('drbike-no-track');
  } catch (e) {}
  let _noTrack = false;
  try {
    _noTrack = localStorage.getItem('drbike-no-track') === '1';
  } catch (e) {}
  // Production only. Without this guard PostHog counted localhost, file:// and
  // Vercel previews as real traffic: production numbers showed pages like
  // "/C:/Users/.../landing.html" and referrers "localhost:3000" sitting beside
  // real visitors. Same guard as admin.html and mechanic.html.
  if (!_noTrack && (location.hostname === 'drbikesydney.com.au' || location.hostname === 'www.drbikesydney.com.au')) {
    posthog.init('phc_p3bN9qdguBGXMaWWtCiEQ3TjdFztVJPyG2yAsLdeUTzV', {
      api_host: 'https://eu.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
    });
  } else {
    // MUST clear the stub - see the same comment in index.html. The snippet
    // leaves window.posthog truthy but without capture() unless init() ran, and
    // js/app.js guards on truthiness alone.
    window.posthog = undefined;
  }


// Dates rendered by the classic inline scripts below must follow the chosen
// language too. js/i18n.js is an ES module (loaded at the end of the page and
// exposed as window.__drbikeI18n), so this reads it lazily at call time and
// falls back to en-AU if it is not ready yet.
function lpDateLocale() {
  try { return window.__drbikeI18n.dateLocale(); } catch { return 'en-AU'; }
}


(function () {
  let mechanics = [];
  let activeIndex = 0;
  let mechDragging = false;
  let mechDragStartX = 0;
  let mechDragMoved = 0;

  function mechInitials(name) {
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  function escapeMechHtml(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    // The textContent round-trip leaves quote characters as-is, so also
    // replace them; the result then stays safe inside a quoted attribute
    // value (src, alt), not only inside a text node.
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function loadMechanics() {
    const wrap = document.getElementById('mech-carousel-wrap');
    const emptyEl = document.getElementById('mech-carousel-empty');
    if (!wrap) return;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'public-mechanics' }),
      });
      if (!res.ok) throw new Error('fetch failed');
      mechanics = await res.json();
    } catch {
      mechanics = [];
    }
    if (!mechanics || !mechanics.length) {
      wrap.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    renderMechCards();
    renderMechDots();
    updateMechCarousel();
  }

  function renderMechCards() {
    const track = document.getElementById('mech-carousel-track');
    track.innerHTML = mechanics
      .map((m, i) => {
        const avatarHTML = m.photo_url
          ? `<img src="${escapeMechHtml(m.photo_url)}" alt="${escapeMechHtml(m.name)}" style="width:76px;height:76px;border-radius:50%;object-fit:cover;border:4px solid var(--white);box-shadow:0 4px 12px rgba(0,0,0,0.2)">`
          : `<div style="width:76px;height:76px;border-radius:50%;background:var(--blue-lt);border:4px solid var(--white);box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:var(--blue)">${mechInitials(m.name)}</div>`;
        const roundedRating = m.rating ? Math.round(m.rating) : 0;
        const stars = m.rating ? '★'.repeat(roundedRating) + '☆'.repeat(5 - roundedRating) : '';
        return `
      <div class="mech-card" data-index="${i}">
        <div class="mech-card__float">
          <div class="mech-card__banner"><img src="images/mechanic-working.webp" alt=""></div>
          <div style="display:flex;justify-content:center;margin-top:-40px">${avatarHTML}</div>
          <div style="text-align:center;padding:10px 18px 22px">
            <div style="font-size:17px;font-weight:700;color:var(--navy)">${escapeMechHtml(m.name)}</div>
            <div style="font-size:13px;color:var(--gray);margin-top:3px">Dr. Bike Mobile Mechanic</div>
            ${m.rating ? `<div style="color:var(--amber-bright);font-size:17px;margin-top:10px">${stars} <span style="color:var(--gray);font-size:13px">${m.rating}</span></div>` : ''}
            ${m.jobs_completed > 0 ? `<div style="font-size:13px;color:var(--gray);margin-top:5px">${m.jobs_completed} <span>${m.jobs_completed === 1 ? 'service completed' : 'services completed'}</span></div>` : '<div style="font-size:13px;color:var(--gray);margin-top:5px">Qualified &amp; background-checked</div>'}
          </div>
        </div>
      </div>`;
      })
      .join('');

    track.querySelectorAll('.mech-card').forEach((card) => {
      card.addEventListener('click', () => {
        const i = Number(card.dataset.index);
        if (i === activeIndex) {
          openMechDetail(mechanics[i]);
        } else {
          activeIndex = i;
          updateMechCarousel();
        }
      });
    });
  }

  function renderMechDots() {
    const dotsEl = document.getElementById('mech-carousel-dots');
    dotsEl.innerHTML = mechanics
      .map((_, i) => `<div class="mech-dot" data-index="${i}"></div>`)
      .join('');
    dotsEl.querySelectorAll('.mech-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        activeIndex = Number(dot.dataset.index);
        updateMechCarousel();
      });
    });
  }

  function updateMechCarousel() {
    const track = document.getElementById('mech-carousel-track');
    const n = mechanics.length;
    track.querySelectorAll('.mech-card').forEach((card) => {
      const i = Number(card.dataset.index);
      let offset = i - activeIndex;
      if (offset > n / 2) offset -= n;
      if (offset < -n / 2) offset += n;
      const abs = Math.abs(offset);
      // Proportional to the card, which is now clamp(250px, 23vw, 320px) rather
      // than a fixed 240. 0.79 of the width is the same overlap the old 190/240
      // gave, so the arrangement is unchanged - it just follows the card.
      const cardW = card.offsetWidth || 240;
      const tx = offset * cardW * 0.79;
      const tz = -abs * 140;
      const ry = -offset * 38;
      const scale = abs === 0 ? 1 : 0.82;
      const opacity = abs > 2 ? 0 : 1 - abs * 0.28;
      card.style.transform = `translate(-50%,-50%) translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`;
      card.style.opacity = String(opacity);
      card.style.zIndex = String(100 - abs);
      card.style.pointerEvents = abs > 2 ? 'none' : 'auto';
      card.classList.toggle('is-active', abs === 0);
    });
    document.querySelectorAll('#mech-carousel-dots .mech-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === activeIndex);
    });
  }

  function goMechPrev() {
    activeIndex = (activeIndex - 1 + mechanics.length) % mechanics.length;
    updateMechCarousel();
  }
  function goMechNext() {
    activeIndex = (activeIndex + 1) % mechanics.length;
    updateMechCarousel();
  }

  function openMechDetail(m) {
    const body = document.getElementById('mech-detail-body');
    const avatarHTML = m.photo_url
      ? `<img src="${escapeMechHtml(m.photo_url)}" alt="${escapeMechHtml(m.name)}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:4px solid var(--white);box-shadow:0 4px 12px rgba(0,0,0,0.2)">`
      : `<div style="width:96px;height:96px;border-radius:50%;background:var(--blue-lt);border:4px solid var(--white);box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;color:var(--blue)">${mechInitials(m.name)}</div>`;
    body.innerHTML = `
      <div style="height:110px;background:var(--blue-lt);overflow:hidden"><img src="images/mechanic-working.webp" style="width:100%;height:100%;object-fit:cover" alt=""></div>
      <div style="display:flex;justify-content:center;margin-top:-48px">${avatarHTML}</div>
      <div style="text-align:center;padding:12px 28px 4px">
        <div style="font-size:20px;font-weight:700;color:var(--navy)">${escapeMechHtml(m.name)}</div>
        <div style="font-size:13px;color:var(--gray);margin-top:2px">Dr. Bike Mobile Mechanic</div>
        ${m.bio ? `<div style="font-size:15px;color:var(--gray);margin-top:12px;line-height:1.6">${escapeMechHtml(m.bio)}</div>` : ''}
      </div>
      <div style="display:flex;justify-content:center;gap:32px;padding:18px 20px;margin-top:8px;border-top:1px solid var(--border-lt)">
        <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--navy)">${m.jobs_completed}</div><div style="font-size:11px;color:var(--gray)">Jobs done</div></div>
        ${m.rating ? `<div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--navy)">★ ${m.rating}</div><div style="font-size:11px;color:var(--gray)">Rating</div></div>` : ''}
      </div>
      ${
        m.reviews && m.reviews.length
          ? `
      <div style="padding:4px 20px 24px">
        <div style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px">Client reviews</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          ${m.reviews
            .map(
              (r) => `
            <div style="border-bottom:1px solid var(--border-lt);padding-bottom:12px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-size:13px;font-weight:600;color:var(--navy)">${escapeMechHtml(r.client_name)}</span>
                ${r.rating ? `<span style="color:var(--amber-bright);font-size:13px">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>` : ''}
              </div>
              <p style="font-size:13px;color:var(--gray);line-height:1.5;margin:0">"${escapeMechHtml(r.comment)}"</p>
            </div>`
            )
            .join('')}
        </div>
      </div>`
          : ''
      }
    `;
    document.getElementById('mech-detail-modal').style.display = 'flex';
  }

  document.getElementById('mech-prev-btn')?.addEventListener('click', goMechPrev);
  document.getElementById('mech-next-btn')?.addEventListener('click', goMechNext);
  document.getElementById('mech-detail-close-btn')?.addEventListener('click', () => {
    document.getElementById('mech-detail-modal').style.display = 'none';
  });
  document.getElementById('mech-detail-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'mech-detail-modal') e.currentTarget.style.display = 'none';
  });

  const mechViewport = document.getElementById('mech-carousel-viewport');
  if (mechViewport) {
    mechViewport.addEventListener('pointerdown', (e) => {
      mechDragging = true;
      mechDragStartX = e.clientX;
      mechDragMoved = 0;
      mechViewport.setPointerCapture(e.pointerId);
    });
    mechViewport.addEventListener('pointermove', (e) => {
      if (!mechDragging) return;
      mechDragMoved = e.clientX - mechDragStartX;
    });
    mechViewport.addEventListener('pointerup', () => {
      if (!mechDragging) return;
      mechDragging = false;
      if (mechDragMoved > 50) goMechPrev();
      else if (mechDragMoved < -50) goMechNext();
    });
    mechViewport.addEventListener('pointerleave', () => {
      mechDragging = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMechanics);
  } else {
    loadMechanics();
  }
})();


/* ── Date input min ─────────────────────────────────────────────────────── */
const ldate = document.getElementById('lform-date');
if (ldate) ldate.min = new Date().toISOString().split('T')[0];


(function() {
  const form = document.getElementById('fleet-form');
  if (!form) return;
  // Audit 12.17: these fields carried onfocus/onblur highlighting the border.
  // Static fields present at load, so a direct listener per field is enough -
  // no delegation needed (that's only for elements rendered after the fact).
  form.querySelectorAll('input, select, textarea').forEach(function(el) {
    el.addEventListener('focus', function() { this.style.borderColor = 'var(--blue)'; });
    el.addEventListener('blur', function() { this.style.borderColor = 'var(--border)'; });
  });
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('fleet-submit');
    const msg = document.getElementById('fleet-msg');
    const data = Object.fromEntries(new FormData(form).entries());
    btn.disabled = true;
    btn.textContent = 'Sending...';
    msg.style.display = 'none';
    try {
      const resp = await fetch('/api/send-b2b-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Submission failed');
      form.reset();
      msg.style.background = 'var(--green-lt)';
      msg.style.color = 'var(--green)';
      msg.style.border = '1px solid #BBF7D0';
      msg.innerHTML = '<strong>Thanks! We\'ll be in touch within 2 business hours.</strong> Check your inbox for a confirmation.';
      msg.style.display = 'block';
      btn.textContent = 'Quote Requested';
    } catch(err) {
      msg.style.background = 'var(--red-lt)';
      msg.style.color = 'var(--red)';
      msg.style.border = '1px solid var(--red-edge)';
      msg.textContent = err.message || 'Something went wrong. Please email us directly.';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Request Fleet Quote';
      // Turnstile tokens are single-use - refresh so a retry gets a new one
      if (window.turnstile) try { turnstile.reset('#fleet-turnstile'); } catch(e2) {}
    }
  });
}());


function faq(btn) {
  const a = btn.nextElementSibling;
  const icon = btn.querySelector('.faq-icon');
  const open = a.style.display === 'block';
  document.querySelectorAll('.faq-a').forEach(function(x) { x.style.display = 'none'; });
  document.querySelectorAll('.faq-icon').forEach(function(x) { x.style.transform = ''; });
  if (!open) { a.style.display = 'block'; icon.style.transform = 'rotate(180deg)'; }
}

const observer = new IntersectionObserver(function(entries) {
  entries.forEach(function(e) { if (e.isIntersecting) { e.target.classList.add('visible'); } });
}, { threshold: 0.08 });
document.querySelectorAll('section').forEach(function(s) {
  s.style.opacity = '0';
  s.style.transform = 'translateY(20px)';
  s.style.transition = 'opacity 500ms ease, transform 500ms ease';
  observer.observe(s);
});

const secs = document.querySelectorAll('section[id]');
const nls = document.querySelectorAll('nav a[href^="#"]');
window.addEventListener('scroll', function() {
  let cur = '';
  secs.forEach(function(s) { if (window.scrollY >= s.offsetTop - 80) cur = s.id; });
  nls.forEach(function(a) {
    a.style.color = a.getAttribute('href') === '#' + cur ? 'var(--blue)' : '#475569';
  });
}, { passive: true });


/* ── Membership modal ───────────────────────────────────────────────────── */
let _membershipPlan = null;
let _membershipBilling = 'monthly';
let _membershipCard = null;
// 2026-07-22: Basic/VIP prices changed ($57->$67, $147->$197 monthly; annual
// figures below recomputed at the same 20% annual discount Standard already
// uses). Diego updated the 4 existing Stripe Price objects (Legacy Plans) to
// the new amounts directly in the Dashboard rather than creating new ones -
// same price_ids as before, confirmed 0 active subscriptions on each at the
// time of the change, so no existing client was silently repriced.
const _membershipPrices = {
  basic:    { monthly: 67,  annual: 643  },
  standard: { monthly: 97,  annual: 931  },
  vip:      { monthly: 197, annual: 1891 }
};
const _membershipPriceIds = {
  basic:    { monthly: 'price_1Ti1YFPPGSm5cT7JsoTZQFJh', annual: 'price_1Ti1YsPPGSm5cT7JrTHai1NV' },
  standard: { monthly: 'price_1Ti1ZMPPGSm5cT7Ju9HPXs4s', annual: 'price_1Ti1ZhPPGSm5cT7JSQk0D4W0' },
  vip:      { monthly: 'price_1Ti1aIPPGSm5cT7JC75QU0gL', annual: 'price_1Ti1aePPGSm5cT7J5lPHrkps' }
};
const _membershipLabels = { basic: 'Basic', standard: 'Standard', vip: 'VIP' };

function setBilling(type) {
  _membershipBilling = type;
  const isAnnual = type === 'annual';
  document.getElementById('toggle-monthly').style.background = isAnnual ? 'transparent' : '#2563eb';
  document.getElementById('toggle-monthly').style.color = isAnnual ? '#475569' : 'white';
  document.getElementById('toggle-annual').style.background = isAnnual ? '#2563eb' : 'transparent';
  document.getElementById('toggle-annual').style.color = isAnnual ? 'white' : '#475569';
  ['basic','standard','vip'].forEach(function(plan) {
    const price = _membershipPrices[plan][type];
    const priceEl = document.getElementById('price-' + plan);
    const periodEl = document.getElementById('period-' + plan);
    const noteEl = document.getElementById('annual-note-' + plan);
    if (priceEl) priceEl.textContent = '$' + (isAnnual ? Math.round(price/12) : price);
    if (periodEl) periodEl.textContent = '/month';
    if (noteEl) noteEl.style.display = isAnnual ? 'block' : 'none';
  });
}

function openMembershipModal(plan) {
  _membershipPlan = plan;
  _membershipCard = null;
  document.getElementById('membership-name').value = '';
  document.getElementById('membership-email').value = '';
  document.getElementById('membership-phone').value = '';
  document.getElementById('membership-error').style.display = 'none';
  document.getElementById('membership-form').style.display = 'block';
  document.getElementById('membership-success').style.display = 'none';
  document.getElementById('membership-submit').textContent = 'Start Membership';
  document.getElementById('membership-submit').disabled = false;
  document.getElementById('membership-plan-name').textContent = _membershipLabels[plan] + ' Plan';
  const price = _membershipPrices[plan][_membershipBilling];
  const priceUnit = _membershipBilling === 'annual' ? 'year' : 'month';
  document.getElementById('membership-plan-price').innerHTML = '$' + price + '/<span>' + priceUnit + '</span>';
  document.getElementById('membership-modal').style.display = 'block';
  document.body.style.overflow = 'hidden';
  const STRIPE_KEY = 'pk_live_51TUbFqPPGSm5cT7JKBDANyRVDmi6Ytia6r31kFxAEWis6xYZuhXlDnoZ3KyB4xUoJWd3nKpzrLxuDzsQEz7X3od3006xPoLzVV';
  if (typeof Stripe !== 'undefined') {
    if (!window.stripeInstance) {
      window.stripeInstance = Stripe(STRIPE_KEY);
      window.stripeElements = window.stripeInstance.elements();
    }
    setTimeout(function() {
      const cardEl = document.getElementById('membership-card-element');
      if (cardEl && !_membershipCard) {
        _membershipCard = window.stripeElements.create('card', {
          style: { base: { fontSize: '16px', color: '#0D1F3C', '::placeholder': { color: '#94A3B8' } } }
        });
        _membershipCard.mount('#membership-card-element');
      }
    }, 100);
  }
}

function closeMembershipModal() {
  document.getElementById('membership-modal').style.display = 'none';
  document.body.style.overflow = '';
  if (_membershipCard) {
    try { _membershipCard.destroy(); } catch(e) {}
    _membershipCard = null;
  }
}

// ── Gift Cards ──────────────────────────────────────────────────────────────
// The gift card modal moved to js/gift-card.js, which both surfaces share.
// What lived here was a second implementation of it, bound to markup that only
// existed in landing.html - so the mobile SPA had no gift card at all.
// js/app.js publishes the opener on window; this file is a classic script and
// cannot import a module.

async function submitMembership() {
  const btn = document.getElementById('membership-submit');
  const errEl = document.getElementById('membership-error');
  const name = document.getElementById('membership-name').value.trim();
  const email = document.getElementById('membership-email').value.trim();
  const phone = document.getElementById('membership-phone').value.trim();

  errEl.style.display = 'none';
  if (!name || !email || !phone) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.style.display = 'block';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Please enter a valid email address.';
    errEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Processing...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: _membershipPlan, billing: _membershipBilling, priceId: _membershipPriceIds[_membershipPlan][_membershipBilling], name: name, email: email, phone: phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Subscription failed. Please try again.');
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    document.getElementById('membership-form').style.display = 'none';
    document.getElementById('membership-success').style.display = 'block';
  } catch(e) {
    errEl.textContent = e.message || 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
    btn.textContent = 'Start Membership';
    btn.disabled = false;
  }
}

document.getElementById('services-modal').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') document.getElementById('services-modal').style.display = 'none';
});

// ── GA4 helpers ───────────────────────────────────────────────────────────────
function openServicesModal() {
  if (window.gtag) gtag('event', 'view_item_list', { item_list_name: 'All Services' });
  document.getElementById('services-modal').style.display = 'flex';
}

document.querySelectorAll('.svc-card').forEach(function(card) {
  card.addEventListener('click', function() {
    const nameEl = card.querySelector('.svc-name');
    const priceEl = card.querySelector('.svc-price');
    if (window.gtag) gtag('event', 'select_item', {
      items: [{ item_name: nameEl ? nameEl.textContent : 'Service', price: priceEl ? priceEl.textContent : '' }]
    });
  });
});


  async function subscribeNewsletter() {
    const email = document.getElementById('nl-email').value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Please enter a valid email address.'); return;
    }
    // The managed widget solves in the background on page load; the token
    // lands in a hidden input inside its container.
    const tokenInput = document.querySelector('#nl-turnstile input[name="cf-turnstile-response"]');
    const turnstileToken = tokenInput ? tokenInput.value : '';
    if (!turnstileToken) {
      alert('Please wait a moment for the security check to finish, then try again.');
      return;
    }
    try {
      const r = await fetch('/api/subscribe-newsletter', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email, source: 'landing_page', turnstileToken })
      });
      if (!r.ok) throw new Error('Subscription failed');
    } catch(e) {
      const nlErr = document.getElementById('nl-error');
      if (nlErr) nlErr.style.display = 'block';
      // Turnstile tokens are single-use - refresh so a retry gets a new one
      if (window.turnstile) try { turnstile.reset('#nl-turnstile'); } catch(e2) {}
      return;
    }
    document.getElementById('newsletter-form').style.display = 'none';
    document.getElementById('nl-success').style.display = 'block';
    if(window.gtag) gtag('event','newsletter_subscribe',{page:'landing'});
  }


const _sb = window.supabase.createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U'
);
let _authMode = 'signin';

/* ── Real reviews (public_reviews view) ────────────────────────────────── */
(function () {
  const AVATAR_COLORS = ['#0A58CA', '#15803D', '#7C3AED', '#B45309', '#CF2020'];

  function timeAgo(iso) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    if (days < 1) return 'Today';
    if (days < 14) return days + (days === 1 ? ' day ago' : ' days ago');
    if (days < 60) { const w = Math.floor(days / 7); return w + (w === 1 ? ' week ago' : ' weeks ago'); }
    const m = Math.floor(days / 30);
    return m + (m === 1 ? ' month ago' : ' months ago');
  }

  function reviewEsc(str) {
    const d = document.createElement('div');
    d.textContent = String(str === null || str === undefined ? '' : str);
    return d.innerHTML;
  }

  function reviewCardHTML(r, i) {
    const initial = (r.display_name || '?').charAt(0).toUpperCase();
    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const n = Math.max(1, Math.min(5, r.rating || 5));
    const stars = '&#9733;'.repeat(n) + '&#9734;'.repeat(5 - n);
    return (
      '<div class="review-card">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
          '<div style="width:44px;height:44px;border-radius:50%;background:' + color + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;flex-shrink:0">' + reviewEsc(initial) + '</div>' +
          '<div>' +
            '<div style="font-weight:700;font-size:15px;color:var(--navy)">' + reviewEsc(r.display_name || 'Dr. Bike client') + '</div>' +
            '<div style="font-size:13px;color:var(--gray)">' + reviewEsc(r.suburb || 'Sydney') + ' &middot; Verified customer</div>' +
          '</div>' +
        '</div>' +
        '<div style="color:var(--amber-bright);font-size:15px;margin-bottom:8px">' + stars + '</div>' +
        '<p style="font-size:15px;color:var(--gray);line-height:1.6">"' + reviewEsc(r.comment) + '"</p>' +
        '<div style="font-size:13px;color:var(--gray-lt);margin-top:10px">' + timeAgo(r.completed_at) + '</div>' +
      '</div>'
    );
  }

  _sb.from('public_reviews')
    .select('display_name,suburb,rating,comment,completed_at')
    .order('completed_at', { ascending: false })
    .limit(6)
    .then(function (res) {
      const grid = document.getElementById('reviews-grid');
      const empty = document.getElementById('reviews-empty');
      const reviews = (res && res.data) || [];
      if (!reviews.length) {
        if (empty) empty.style.display = 'block';
        return;
      }
      if (grid) grid.innerHTML = reviews.map(reviewCardHTML).join('');
    })
    .catch(function () {
      const empty = document.getElementById('reviews-empty');
      if (empty) empty.style.display = 'block';
    });
}());

document.addEventListener('DOMContentLoaded', function() {
  // updateNavForSession is the ONLY thing that decides what the account button
  // does, so it has to run even when the session lookup fails - otherwise the
  // button would have no handler at all and sign-in would be unreachable.
  _sb.auth.getSession()
    .then(function(result) { updateNavForSession(result.data.session); })
    .catch(function() { updateNavForSession(null); });
  _sb.auth.onAuthStateChange(function(event, session) {
    updateNavForSession(session);
    if (event === 'SIGNED_IN') {
      closeAuthModal();
      if (window.location.hash.indexOf('access_token') !== -1) {
        history.replaceState(null, '', window.location.pathname);
      }
    }
  });
});

function updateNavForSession(session) {
  const btn = document.getElementById('nav-auth-btn');
  if (!btn) return;
  if (session && session.user) {
    const meta = session.user.user_metadata || {};
    const name = meta.full_name || meta.name || session.user.email || '';
    const first = name.split('@')[0].split(' ')[0];
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2"><span style="font-size:13px;font-weight:700">' + esc(first) + '</span><span style="font-size:11px;font-weight:500;opacity:0.7">Bookings · Bikes · Membership</span></span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
    btn.style.padding = '8px 16px';
    btn.onclick = function() { openAccountPanel(session); };
  } else {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Sign In';
    btn.onclick = openAuthModal;
  }
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// "2026-07-29 · 10:00:00" is a database row, not something to show a client.
// Date parts are passed to the Date constructor rather than parsed from the
// string, because 'YYYY-MM-DD' is read as UTC and lands on the previous day
// for anyone west of Greenwich.
function acctWhen(dateStr, timeStr) {
  let out = '';
  if (dateStr) {
    const p = String(dateStr).split('-').map(Number);
    const d = new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
    out = isNaN(d.getTime())
      ? String(dateStr)
      : d.toLocaleDateString(lpDateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
  }
  if (timeStr) out += (out ? ' · ' : '') + String(timeStr).slice(0, 5);
  return out;
}

// 10.2: cancel/reschedule used to be confirm()/prompt() with a hardcoded list
// of 8 time slots that never checked real availability - a client could pick
// a time someone else already had. Same non-native pattern js/app.js already
// uses for the SPA's own booking detail screen, rebuilt here because that
// screen is a different DOM the account panel does not render.
function acctActionButtons(id, date, time) {
  return '<div style="display:flex;gap:6px">'
    + '<button class="acct-resched-btn" data-id="' + esc(id) + '" data-date="' + esc(date||'') + '" data-time="' + esc(time||'') + '" style="flex:1;padding:7px;border:1px solid var(--border);border-radius:6px;background:var(--white);font-size:13px;cursor:pointer;font-family:inherit;font-weight:600;color:var(--navy)">Reschedule</button>'
    + '<button class="acct-cancel-btn" data-id="' + esc(id) + '" style="flex:1;padding:7px;border:1px solid var(--red-lt);border-radius:6px;background:var(--white);color:var(--red);font-size:13px;cursor:pointer;font-family:inherit;font-weight:600">Cancel</button>'
    + '</div>';
}

function acctReschedTimesHtml(slots, currentTime) {
  const t = window.__drbikeTime;
  if (!slots || !slots.length) return '<option value="">No times available</option>';
  return slots.map(function(s) {
    const value = t.toDbTime(s.time) || '';
    const isCurrent = !!value && value === t.toDbTime(currentTime || '');
    return '<option value="' + esc(value) + '"' + (!s.available ? ' disabled' : '') + (isCurrent && s.available ? ' selected' : '') + '>' + esc(t.toDisplayTime(s.time) || s.time) + (!s.available ? ' - unavailable' : '') + '</option>';
  }).join('');
}

// Same endpoint and shape getAvailableSlots() in js/supabase.js uses - not
// imported directly because it is bundled with the rest of that module's
// Supabase client setup, which this plain script has no reason to load twice.
function acctLoadReschedTimes(date, currentTime) {
  const sel = document.getElementById('acct-resched-time');
  const err = document.getElementById('acct-resched-err');
  if (!sel || !err) return;
  err.style.display = 'none';
  sel.disabled = true;
  sel.innerHTML = '<option>Loading available times...</option>';
  fetch('/api/auth?role=get-availability&date=' + encodeURIComponent(date))
    .then(function(r) { if (!r.ok) throw new Error('availability fetch failed'); return r.json(); })
    .then(function(slots) {
      sel.innerHTML = acctReschedTimesHtml(slots, currentTime);
      const anyAvailable = slots.some(function(s) { return s.available; });
      sel.disabled = !anyAvailable;
      if (!anyAvailable) { err.textContent = 'No times available that day - try another date.'; err.style.display = 'block'; }
    })
    .catch(function() {
      sel.innerHTML = '<option>Could not load times</option>';
      err.textContent = 'Could not check availability. Try again.';
      err.style.display = 'block';
    });
}

// Same pattern acctActionButtons already uses for the booking Cancel button
// (10.2) - the membership Cancel used a native confirm() + alert(), which
// looks like an OS error dialog interrupting the page, not part of it.
function acctMembershipButtonsHtml(isPaused) {
  return '<div style="display:flex;gap:8px">' +
    '<button class="acct-membership-toggle-btn" style="flex:1;padding:9px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid ' + (isPaused?'#15803D':'#B45309') + ';color:' + (isPaused?'#15803D':'#B45309') + ';background:#fff">' + (isPaused?'Resume':'Pause') + '</button>' +
    '<button class="acct-membership-cancel-btn" style="flex:1;padding:9px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid var(--border);color:var(--gray);background:var(--white)">Cancel</button>' +
    '</div>';
}

// The account panel had three TABS (bookings, bikes, membership) and nothing
// else, so on desktop the Profile screen could not be reached at all - and
// `#profile` appeared nowhere in landing.html, landing-inline.js or
// landing-modules.js. Everything that lives only there was mobile-only
// without anyone noticing: language, push notifications, the card on file,
// the referral code, and - the way this was found - the birthday field.
//
// The screen itself was already in landing.html's DOM and the router already
// renders non-home routes as a full-screen overlay on this surface. Nothing
// was missing except a way in.
//
// It is a link and not a fourth tab on purpose: the tabs swap a pane inside
// the panel, this navigates away from it.
function profileLinkHtml() {
  return (
    '<button class="account-profile-btn" style="width:100%;min-height:40px;padding:10px;margin-bottom:8px;border:1.5px solid var(--blue-edge);border-radius:8px;background:var(--white);color:var(--blue-dark);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">' +
    '<span aria-hidden="true">&#9881;</span>' +
    '<span>Profile &amp; settings</span>' +
    '</button>'
  );
}

// Same non-native confirm pattern as acctActionButtons/10.2 - the native
// confirm('Sign out?') read as an OS error dialog, not part of the page.
function signoutButtonsHtml() {
  return '<button class="account-signout-btn" style="width:100%;min-height:40px;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:var(--white);color:var(--gray);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Sign out</button>';
}

function openAccountPanel(session) {
  document.getElementById('account-panel')?.remove();
  // The membership actions below reopen this panel with no argument. Reading
  // that as "signed out" put the sign-in modal in front of people who were
  // very much signed in - the same symptom the nav button had. Ask for the
  // session instead of assuming.
  if (!session) {
    _sb.auth.getSession().then(function(r) {
      const s = r.data && r.data.session ? r.data.session : null;
      if (s) openAccountPanel(s);
      else openAuthModal();
    });
    return;
  }
  const user = session.user || null;
  if (!user) { openAuthModal(); return; }
  const meta = user.user_metadata || {};
  const name = meta.full_name || meta.name || user.email || '';
  const initials = name.split(' ').map(function(w){return w[0]||'';}).slice(0,2).join('').toUpperCase() || '?';

  const btn = document.getElementById('nav-auth-btn');
  const btnRect = btn ? btn.getBoundingClientRect() : { right: window.innerWidth - 16, top: 60 };
  const panelRight = Math.max(16, window.innerWidth - btnRect.right);
  const panelTop = btnRect.top + (btn ? btn.offsetHeight : 0) + 8;
  const maxH = Math.max(300, window.innerHeight - panelTop - 24);

  const STATUS_COLORS = { pending:'#F59E0B', confirmed:'#0A58CA', enroute:'#22C55E', in_progress:'#22C55E', completed:'#475569', cancelled:'#EF4444' };
  const STATUS_LABELS = { pending:'Pending', confirmed:'Confirmed', enroute:'En Route', in_progress:'In Progress', completed:'Completed', cancelled:'Cancelled' };

  // Same segmented control the app uses for Upcoming/History (.tabs-row and
  // .tab-btn in css/main.css): a tray in --surface with a blue pill on the
  // active tab. The panel used uppercase underlined tabs, which read like a
  // different product bolted onto the page.
  const tabStyle = 'flex:1;min-height:36px;padding:8px 10px;border:none;border-radius:8px;background:transparent;font-size:13px;font-weight:600;color:#475569;cursor:pointer;font-family:inherit;transition:background .15s,color .15s';
  const tabActiveStyle = tabStyle + ';background:#2563eb;color:#fff';

  const panel = document.createElement('div');
  panel.id = 'account-panel';
  panel.style.cssText = 'position:fixed;inset:0;z-index:9999;background:transparent';
  panel.innerHTML = [
    '<div id="account-panel-inner" style="position:absolute;right:' + panelRight + 'px;top:' + panelTop + 'px;width:min(400px,calc(100vw-32px));background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,0.18);border:1px solid #E2E8F0;display:flex;flex-direction:column;overflow:hidden;max-height:' + maxH + 'px">',
      /* Header */
      '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0">',
        '<div style="width:40px;height:40px;border-radius:50%;background:var(--blue);color:var(--white);font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + initials + '</div>',
        '<div style="flex:1;min-width:0">',
          '<div style="font-size:15px;font-weight:700;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(name) + '</div>',
          '<div style="font-size:13px;color:var(--gray-lt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(user.email || '') + '</div>',
        '</div>',
        '<button id="account-panel-close" style="background:none;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;color:var(--gray-lt);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">&#215;</button>',
      '</div>',
      /* Tabs */
      '<div style="display:flex;gap:4px;background:var(--border-lt);border-radius:10px;padding:4px;margin:12px 20px 4px;flex-shrink:0">',
        '<button id="acct-tab-bookings" style="' + tabActiveStyle + '" data-acct-tab="bookings">Bookings</button>',
        '<button id="acct-tab-bikes" style="' + tabStyle + '" data-acct-tab="bikes">My Bikes</button>',
        '<button id="acct-tab-membership" style="' + tabStyle + '" data-acct-tab="membership">Membership</button>',
      '</div>',
      /* Tab content */
      '<div style="overflow-y:auto;flex:1">',
        '<div id="acct-pane-bookings" style="padding:16px 20px">',
          '<div id="account-bookings" style="min-height:60px;display:flex;align-items:center;justify-content:center;color:var(--gray-lt);font-size:13px">Loading...</div>',
        '</div>',
        '<div id="acct-pane-bikes" style="padding:16px 20px;display:none">',
          '<div id="account-bikes" style="min-height:60px;display:flex;align-items:center;justify-content:center;color:var(--gray-lt);font-size:13px">Loading...</div>',
        '</div>',
        '<div id="acct-pane-membership" style="padding:16px 20px;display:none">',
          '<div id="account-membership" style="min-height:60px;display:flex;align-items:center;justify-content:center;color:var(--gray-lt);font-size:13px">Loading...</div>',
        '</div>',
      '</div>',
      /* Footer */
      '<div style="padding:12px 20px;border-top:1px solid var(--border);flex-shrink:0" id="account-panel-footer">' + profileLinkHtml() + '<div id="account-signout-wrap">' + signoutButtonsHtml() + '</div></div>',
    '</div>'
  ].join('');
  document.body.appendChild(panel);

  /* Tab switching */
  panel.querySelectorAll('[data-acct-tab]').forEach(function(tabBtn) {
    tabBtn.addEventListener('click', function() {
      const target = tabBtn.dataset.acctTab;
      panel.querySelectorAll('[data-acct-tab]').forEach(function(b) { b.style.cssText = tabStyle; });
      tabBtn.style.cssText = tabActiveStyle;
      ['bookings','bikes','membership'].forEach(function(t) {
        document.getElementById('acct-pane-' + t).style.display = t === target ? 'block' : 'none';
      });
    });
  });

  document.getElementById('account-panel-close').addEventListener('click', function() { panel.remove(); });
  panel.addEventListener('click', function(e) { if (e.target === panel) panel.remove(); });
  panel.querySelector('.account-profile-btn')?.addEventListener('click', function() {
    // The panel is a fixed overlay; leaving it up would sit on top of the
    // screen it just opened.
    document.getElementById('account-panel')?.remove();
    window.location.hash = '#profile';
  });

  document.getElementById('account-signout-wrap').addEventListener('click', function(e) {
    const wrap = document.getElementById('account-signout-wrap');
    if (e.target.closest('.account-signout-btn')) {
      wrap.innerHTML =
        '<div style="font-size:13px;color:var(--navy);margin-bottom:8px;text-align:center">Sign out of your account?</div>'
        + '<div style="display:flex;gap:6px">'
        + '<button class="account-signout-yes-btn" style="flex:1;min-height:40px;padding:10px;border:none;border-radius:8px;background:var(--red);color:var(--white);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Yes, sign out</button>'
        + '<button class="account-signout-no-btn" style="flex:1;min-height:40px;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:var(--white);color:var(--navy);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>'
        + '</div>';
      return;
    }
    if (e.target.closest('.account-signout-yes-btn')) { _sb.auth.signOut(); panel.remove(); return; }
    if (e.target.closest('.account-signout-no-btn')) { wrap.innerHTML = signoutButtonsHtml(); return; }
  });

  /* Load all data */
  _sb.auth.getSession().then(function(res) {
    const sess = res.data && res.data.session ? res.data.session : null;
    if (!sess) return;

    /* --- BOOKINGS --- */
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'client-bookings', access_token: sess.access_token, client_id: sess.user.id })
    }).then(function(r) { return r.json(); }).then(function(bookings) {
      const el = document.getElementById('account-bookings');
      if (!el) return;
      if (!bookings || !bookings.length) {
        el.innerHTML = '<div style="text-align:center;padding:24px 0"><div style="font-size:32px;margin-bottom:8px">📅</div><div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:4px">No bookings yet</div><div style="font-size:13px;color:var(--gray-lt)">Book a service to get started</div></div>';
        return;
      }
      const upcoming = bookings.filter(function(b) { return ['pending','confirmed','enroute','in_progress'].includes(b.status); });
      const past = bookings.filter(function(b) { return ['completed','cancelled'].includes(b.status); });
      let html = '';
      if (upcoming.length) {
        // The word is its own text node so the dictionary can match it - with
        // the count inside the string it never could, which is why this label
        // stayed in English on a Spanish page. Grey like History below it: a
        // section heading in success-green meant nothing.
        html += '<div style="font-size:11px;font-weight:700;color:var(--gray-lt);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px"><span>Upcoming</span> (' + upcoming.length + ')</div>';
        upcoming.forEach(function(b) {
          const canEdit = b.status === 'pending' || b.status === 'confirmed';
          const sc = STATUS_COLORS[b.status]||'#475569';
          html += '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:3px solid ' + sc + ';border-radius:12px;padding:12px;margin-bottom:10px">';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
          html += '<div style="font-size:13px;font-weight:700;color:var(--navy)">' + esc(b.service_name || 'Service') + '</div>';
          html += '<span style="font-size:11px;font-weight:600;color:' + sc + ';background:' + sc + '18;padding:2px 8px;border-radius:20px">' + (STATUS_LABELS[b.status]||b.status) + '</span>';
          html += '</div>';
          html += '<div style="font-size:13px;color:var(--gray-lt)">' + esc(acctWhen(b.scheduled_date, b.scheduled_time)) + '</div>';
          if (canEdit) {
            html += '<div id="acct-actions-' + esc(b.id) + '" data-date="' + esc(b.scheduled_date||'') + '" data-time="' + esc(b.scheduled_time||'') + '" style="margin-top:8px">' + acctActionButtons(b.id, b.scheduled_date, b.scheduled_time) + '</div>';
          }
          if (['confirmed','enroute','in_progress'].includes(b.status)) {
            html += '<button class="acct-chat-btn" data-id="' + esc(b.id) + '" style="width:100%;margin-top:6px;padding:8px;border:none;border-radius:6px;background:var(--blue);color:var(--white);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">&#128172; <span>Message mechanic</span></button>';
          }
          html += '</div>';
        });
      }
      if (past.length) {
        html += '<div style="font-size:11px;font-weight:700;color:var(--gray-lt);text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 8px">History</div>';
        past.slice(0, 5).forEach(function(b) {
          const sc = STATUS_COLORS[b.status]||'#475569';
          html += '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:3px solid ' + sc + ';border-radius:10px;padding:10px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">';
          html += '<div><div style="font-size:13px;font-weight:600;color:var(--navy)">' + esc(b.service_name||'Service') + '</div><div style="font-size:11px;color:var(--gray-lt);margin-top:2px">' + esc(acctWhen(b.scheduled_date, '')) + '</div></div>';
          html += '<span style="font-size:11px;font-weight:600;color:' + sc + '">' + (STATUS_LABELS[b.status]||b.status) + '</span>';
          html += '</div>';
        });
      }
      el.style.display = 'block'; el.style.alignItems = ''; el.style.justifyContent = '';
      el.innerHTML = html;

      el.addEventListener('click', function(e) {
        const cancelBtn = e.target.closest('.acct-cancel-btn');
        const reschedBtn = e.target.closest('.acct-resched-btn');
        const chatBtn = e.target.closest('.acct-chat-btn');
        const cancelYesBtn = e.target.closest('.acct-cancel-yes-btn');
        const cancelNoBtn = e.target.closest('.acct-cancel-no-btn');
        const reschedBackBtn = e.target.closest('.acct-resched-back-btn');
        const reschedSaveBtn = e.target.closest('.acct-resched-save-btn');
        if (chatBtn) { openLandingChat(chatBtn.dataset.id); return; }

        if (cancelBtn) {
          const box = document.getElementById('acct-actions-' + cancelBtn.dataset.id);
          if (!box) return;
          box.innerHTML =
            '<div style="font-size:13px;color:var(--navy);margin-bottom:8px">Cancel this booking?</div>'
            + '<div style="display:flex;gap:6px">'
            + '<button class="acct-cancel-yes-btn" data-id="' + esc(cancelBtn.dataset.id) + '" style="flex:1;padding:7px;border:none;border-radius:6px;background:var(--red);color:var(--white);font-size:13px;cursor:pointer;font-family:inherit;font-weight:600">Yes, cancel</button>'
            + '<button class="acct-cancel-no-btn" style="flex:1;padding:7px;border:1px solid var(--border);border-radius:6px;background:var(--white);color:var(--navy);font-size:13px;cursor:pointer;font-family:inherit;font-weight:600">Keep it</button>'
            + '</div>';
          return;
        }
        if (cancelNoBtn) {
          const box = cancelNoBtn.closest('[id^="acct-actions-"]');
          if (box) box.innerHTML = acctActionButtons(box.id.replace('acct-actions-',''), box.dataset.date, box.dataset.time);
          return;
        }
        if (cancelYesBtn) {
          const id = cancelYesBtn.dataset.id;
          const box = document.getElementById('acct-actions-' + id);
          cancelYesBtn.textContent = '...'; cancelYesBtn.disabled = true;
          _sb.auth.getSession().then(function(s) {
            const ss = s.data && s.data.session ? s.data.session : null;
            if (!ss) return;
            fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ role:'client-cancel', access_token:ss.access_token, booking_id:id, client_id:ss.user.id }) })
              .then(function(r) {
                if (r.ok) { openAccountPanel(ss); return; }
                if (box) box.innerHTML = '<div style="font-size:12px;color:var(--red);margin-bottom:6px">Could not cancel. Please call us.</div>' + acctActionButtons(id, box.dataset.date, box.dataset.time);
              });
          });
          return;
        }

        if (reschedBtn) {
          const id = reschedBtn.dataset.id, date = reschedBtn.dataset.date, time = reschedBtn.dataset.time;
          const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
          const box = document.getElementById('acct-actions-' + id);
          if (!box) return;
          box.innerHTML =
            '<div style="margin-bottom:8px">'
            + '<label for="acct-resched-date" style="font-size:12px;color:var(--gray);display:block;margin-bottom:4px">New date</label>'
            + '<input id="acct-resched-date" type="date" min="' + tomorrow + '" value="' + esc(date||tomorrow) + '" data-time="' + esc(time||'') + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box">'
            + '</div>'
            + '<div style="margin-bottom:8px">'
            + '<label for="acct-resched-time" style="font-size:12px;color:var(--gray);display:block;margin-bottom:4px">New time</label>'
            + '<select id="acct-resched-time" disabled style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box"><option>Loading available times...</option></select>'
            + '<div id="acct-resched-err" style="display:none;font-size:12px;color:var(--red);margin-top:4px"></div>'
            + '</div>'
            + '<div style="display:flex;gap:6px">'
            + '<button class="acct-resched-save-btn" data-id="' + esc(id) + '" style="flex:1;padding:7px;border:none;border-radius:6px;background:var(--blue);color:var(--white);font-size:13px;cursor:pointer;font-family:inherit;font-weight:600">Save</button>'
            + '<button class="acct-resched-back-btn" style="flex:1;padding:7px;border:1px solid var(--border);border-radius:6px;background:var(--white);color:var(--navy);font-size:13px;cursor:pointer;font-family:inherit;font-weight:600">Cancel</button>'
            + '</div>';
          acctLoadReschedTimes(date || tomorrow, time);
          return;
        }
        if (reschedBackBtn) {
          const box = reschedBackBtn.closest('[id^="acct-actions-"]');
          if (box) box.innerHTML = acctActionButtons(box.id.replace('acct-actions-',''), box.dataset.date, box.dataset.time);
          return;
        }
        if (reschedSaveBtn) {
          const id = reschedSaveBtn.dataset.id;
          const box = document.getElementById('acct-actions-' + id);
          const dateInp = document.getElementById('acct-resched-date');
          const timeSel = document.getElementById('acct-resched-time');
          const errEl = document.getElementById('acct-resched-err');
          const newDate = dateInp ? dateInp.value : '';
          const newTime = timeSel ? timeSel.value : '';
          if (!newDate) { errEl.textContent = 'Select a date.'; errEl.style.display = 'block'; return; }
          if (!newTime) { errEl.textContent = 'Select a time.'; errEl.style.display = 'block'; return; }
          reschedSaveBtn.textContent = 'Saving...'; reschedSaveBtn.disabled = true;
          _sb.auth.getSession().then(function(s) {
            const ss = s.data && s.data.session ? s.data.session : null;
            if (!ss) return;
            fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ role:'client-reschedule', access_token:ss.access_token, booking_id:id, client_id:ss.user.id, scheduled_date:newDate, scheduled_time:newTime }) })
              .then(function(r) {
                if (r.ok) { openAccountPanel(ss); return; }
                reschedSaveBtn.textContent = 'Save'; reschedSaveBtn.disabled = false;
                errEl.textContent = 'Could not reschedule. Please call us.'; errEl.style.display = 'block';
              });
          });
          return;
        }
      });
      el.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'acct-resched-date') {
          acctLoadReschedTimes(e.target.value, e.target.dataset.time);
        }
      });
    }).catch(function() {
      const el = document.getElementById('account-bookings');
      if (el) el.textContent = 'Could not load bookings.';
    });

    /* --- MY BIKES --- */
    _sb.from('bikes').select('id,brand,model,type,year,color').eq('client_id', sess.user.id).order('created_at', { ascending: false })
      .then(function(res) {
        const el = document.getElementById('account-bikes');
        if (!el) return;
        if (res.error || !res.data || !res.data.length) {
          el.innerHTML = '<div style="text-align:center;padding:24px 0"><div style="font-size:32px;margin-bottom:8px">🚲</div><div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:4px">No bikes registered</div><div style="font-size:13px;color:var(--gray-lt)">Your bikes appear here after your first service</div></div>';
          return;
        }
        let html = '';
        res.data.forEach(function(bike) {
          html += '<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--blue);border-radius:12px;padding:12px;margin-bottom:10px">';
          html += '<div style="font-size:13px;font-weight:700;color:var(--navy)">' + esc((bike.brand||'') + ' ' + (bike.model||'Bike')) + '</div>';
          const details = [bike.type, bike.year, bike.color].filter(Boolean).join(' · ');
          if (details) html += '<div style="font-size:13px;color:var(--gray-lt);margin-top:3px">' + esc(details) + '</div>';
          html += '</div>';
        });
        el.style.display = 'block'; el.style.alignItems = ''; el.style.justifyContent = '';
        el.innerHTML = html;
      });

    /* --- MEMBERSHIP --- */
    _sb.from('profiles').select('membership_status,membership_plan,membership_started_at').eq('id', sess.user.id).single()
      .then(function(res) {
        const el = document.getElementById('account-membership');
        if (!el) return;
        const p = res.data || {};
        const status = p.membership_status || 'none';
        if (status === 'none' || status === 'inactive' || status === 'cancelled' || !p.membership_plan) {
          el.innerHTML = '<div style="text-align:center;padding:24px 0"><div style="font-size:32px;margin-bottom:8px">⭐</div><div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:4px">No active membership</div><div style="font-size:13px;color:var(--gray-lt);margin-bottom:16px">Save money with a recurring plan</div><a href="#memberships" id="acct-view-plans" style="display:inline-block;padding:9px 20px;background:var(--blue);color:var(--white);border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">View Plans</a></div>';
          const vp = el.querySelector('#acct-view-plans');
          if (vp) vp.addEventListener('click', function() { panel.remove(); });
          return;
        }
        const planColors = { basic:'#0A58CA', standard:'#2563eb', vip:'#7C3AED' };
        const planColor = planColors[p.membership_plan] || '#2563eb';
        const planLabel = (p.membership_plan||'').charAt(0).toUpperCase() + (p.membership_plan||'').slice(1);
        const startDate = p.membership_started_at ? new Date(p.membership_started_at).toLocaleDateString(lpDateLocale(), { month:'short', year:'numeric' }) : '';
        const isPaused = status === 'paused';
        const statusBadge = isPaused
          ? '<span style="background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">Paused</span>'
          : '<span style="background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px"><span style="width:6px;height:6px;border-radius:50%;background:#4ADE80;display:inline-block"></span>Active</span>';
        el.style.display = 'block'; el.style.alignItems = ''; el.style.justifyContent = '';
        el.innerHTML = '<div style="background:linear-gradient(135deg,' + planColor + ',var(--blue));border-radius:12px;padding:20px;color:#fff;margin-bottom:12px">' +
          '<div style="font-size:11px;font-weight:700;opacity:0.75;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Current Plan</div>' +
          '<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em">' + esc(planLabel) + ' Membership</div>' +
          (startDate ? '<div style="font-size:13px;opacity:0.7;margin-top:4px">Member since ' + startDate + '</div>' : '') +
          '<div style="margin-top:12px">' + statusBadge + '</div>' +
          '</div>' +
          '<div id="acct-membership-actions">' + acctMembershipButtonsHtml(isPaused) + '</div>' +
          '<div id="acct-membership-msg" style="display:none;font-size:12px;margin-top:8px;text-align:center"></div>';
        // Wire up buttons after HTML is set. Delegated on the actions box so
        // the confirm-swap below (10.2's non-native pattern) doesn't need to
        // re-bind listeners each time it rewrites its own innerHTML.
        setTimeout(function() {
          const actionsBox = document.getElementById('acct-membership-actions');
          const msgBox = document.getElementById('acct-membership-msg');
          if (!actionsBox) return;
          function showMsg(text, isError) {
            if (!msgBox) return;
            msgBox.textContent = text;
            msgBox.style.color = isError ? 'var(--red)' : 'var(--green)';
            msgBox.style.display = 'block';
          }
          actionsBox.addEventListener('click', function(e) {
            const toggleBtn = e.target.closest('.acct-membership-toggle-btn');
            const cancelBtn = e.target.closest('.acct-membership-cancel-btn');
            const cancelYesBtn = e.target.closest('.acct-membership-cancel-yes-btn');
            const cancelNoBtn = e.target.closest('.acct-membership-cancel-no-btn');

            if (toggleBtn) {
              toggleBtn.disabled = true;
              toggleBtn.textContent = isPaused ? 'Resuming...' : 'Pausing...';
              (async function() {
                try {
                  const session = (await _sb.auth.getSession()).data.session;
                  const endpoint = isPaused ? '/api/resume-subscription' : '/api/pause-subscription';
                  const r = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ access_token: session?.access_token }) });
                  const d = await r.json();
                  if (!r.ok) throw new Error(d.error || 'Failed');
                  showMsg(isPaused ? 'Membership resumed!' : 'Membership paused. No charges until you resume.', false);
                  setTimeout(function() { openAccountPanel(); }, 1200);
                } catch(e) { showMsg(e.message || 'Something went wrong', true); toggleBtn.disabled = false; toggleBtn.textContent = isPaused ? 'Resume' : 'Pause'; }
              })();
              return;
            }
            if (cancelBtn) {
              actionsBox.innerHTML =
                '<div style="font-size:13px;color:var(--navy);margin-bottom:8px;text-align:center">Cancel your membership? It stays active until the end of the billing period.</div>'
                + '<div style="display:flex;gap:6px">'
                + '<button class="acct-membership-cancel-yes-btn" style="flex:1;padding:9px;border:none;border-radius:8px;background:var(--red);color:var(--white);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Yes, cancel</button>'
                + '<button class="acct-membership-cancel-no-btn" style="flex:1;padding:9px;border:1.5px solid var(--border);border-radius:8px;background:var(--white);color:var(--navy);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Keep it</button>'
                + '</div>';
              return;
            }
            if (cancelNoBtn) { actionsBox.innerHTML = acctMembershipButtonsHtml(isPaused); return; }
            if (cancelYesBtn) {
              cancelYesBtn.textContent = 'Cancelling...'; cancelYesBtn.disabled = true;
              (async function() {
                try {
                  const session = (await _sb.auth.getSession()).data.session;
                  const r = await fetch('/api/cancel-subscription', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ access_token: session?.access_token }) });
                  const d = await r.json();
                  if (!r.ok) throw new Error(d.error || 'Failed');
                  actionsBox.innerHTML = acctMembershipButtonsHtml(isPaused);
                  showMsg('Membership will cancel at end of current period.', false);
                } catch(e) {
                  actionsBox.innerHTML = acctMembershipButtonsHtml(isPaused);
                  showMsg(e.message || 'Something went wrong', true);
                }
              })();
              return;
            }
          });
        }, 50);
      });
  });
}

function openAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  showAuthTab('signin');
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
  document.body.style.overflow = '';
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-confirm-msg').style.display = 'none';
}

function showAuthTab(mode) {
  _authMode = mode;
  const isSignup = mode === 'signup';
  document.getElementById('tab-signin').style.background = isSignup ? 'transparent' : '#0A58CA';
  document.getElementById('tab-signin').style.color = isSignup ? '#475569' : '#fff';
  document.getElementById('tab-signup').style.background = isSignup ? '#0A58CA' : 'transparent';
  document.getElementById('tab-signup').style.color = isSignup ? '#fff' : '#475569';
  document.getElementById('auth-name-wrap').style.display = isSignup ? 'block' : 'none';
  document.getElementById('auth-submit').textContent = isSignup ? 'Create Account' : 'Sign In';
  document.getElementById('auth-title').textContent = isSignup ? 'Create your account' : 'Sign in to your account';
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-confirm-msg').style.display = 'none';
  document.getElementById('auth-reset-sent').style.display = 'none';
  // Nothing to recover when you are creating an account.
  document.getElementById('auth-forgot-wrap').style.display = isSignup ? 'none' : 'block';
}

// Same endpoint the mobile app uses: a real Supabase recovery link, sent
// through Resend. Always answers the same way whether or not the address is
// registered, so this cannot be used to find out who has an account.
async function requestPasswordReset() {
  const email = (document.getElementById('auth-email').value || '').trim();
  const errEl = document.getElementById('auth-error');
  const okEl = document.getElementById('auth-reset-sent');
  const btn = document.getElementById('auth-forgot-btn');
  errEl.style.display = 'none';
  okEl.style.display = 'none';
  if (!email || email.indexOf('@') === -1) {
    errEl.textContent = 'Enter your email first, then tap Forgot Password.';
    errEl.style.display = 'block';
    return;
  }
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending...';
  try {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'request-password-reset', email: email }),
    });
    okEl.style.display = 'block';
  } catch (e) {
    errEl.textContent = 'Could not send the reset link. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function submitAuth() {
  const btn = document.getElementById('auth-submit');
  const errEl = document.getElementById('auth-error');
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  errEl.style.display = 'none';
  if (!email || !password) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.textContent = _authMode === 'signup' ? 'Creating...' : 'Signing in...';
  try {
    if (_authMode === 'signup') {
      const nameVal = (document.getElementById('auth-name').value || '').trim();
      const signRes = await _sb.auth.signUp({ email: email, password: password, options: { data: { full_name: nameVal } } });
      if (signRes.error) throw signRes.error;
      document.getElementById('auth-confirm-msg').style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Create Account';
    } else {
      const loginRes = await _sb.auth.signInWithPassword({ email: email, password: password });
      if (loginRes.error) throw loginRes.error;
    }
  } catch(e) {
    errEl.textContent = e.message || 'Authentication failed. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = _authMode === 'signup' ? 'Create Account' : 'Sign In';
  }
}

async function signInGoogle() {
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  try {
    const gRes = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/landing.html' }
    });
    if (gRes.error) throw gRes.error;
  } catch(e) {
    errEl.textContent = e.message || 'Google sign-in failed. Please try again.';
    errEl.style.display = 'block';
  }
}


// ── Booking Panel ─────────────────────────────────────────────────────────────
const _bkState = { service: null, date: null, time: null, services: [], bookingId: null, preselect: null };

// Every booking CTA on this page funnels through here. It used to open the
// bk- modal below, which wrote the booking to Supabase but never charged the
// visit & diagnosis fee and never notified anyone, so Diego had to chase each desktop
// booking by hand. It now hands over to the same wizard the mobile app runs
// (the [data-screen] blocks near the end of this file, driven by js/app.js),
// so desktop takes payment and fires the WhatsApp/SMS/email notifications
// exactly like mobile does.
function openBooking(preselect) {
  window.appState = window.appState || {};
  window.appState.preselect = preselect || null;
  sessionStorage.setItem('drbike-booking-start', String(Date.now()));
  // Already on #book-service (a second CTA, or a preselect after the wizard
  // was opened once): assigning the same hash fires no hashchange, so ask the
  // router to re-render instead or the new preselection never lands.
  if (window.location.hash === '#book-service' && window.router) window.router.render();
  else window.location.hash = 'book-service';
}

// The English service name the `services` table uses, read off a marketing
// card. Two steps, the same ones js/live-prices.js takes to match these cards
// against Supabase: undo the translation (the card reads Spanish or Chinese
// once translateAll() has run), then bridge the marketing name to the internal
// one ("Basic Tune-Up" is "Tune-Up" in the table).
function bkServiceName(rendered) {
  const text = (rendered || '').trim();
  if (!text) return null;
  const english = (window.__drbikeI18n && window.__drbikeI18n.sourceOf)
    ? window.__drbikeI18n.sourceOf(text)
    : text;
  return (window.__drbikeServiceNames && window.__drbikeServiceNames[english]) || english;
}

function bkServiceNameFrom(card) {
  const nameEl = card && card.querySelector('.svc-name');
  return nameEl ? bkServiceName(nameEl.textContent) : null;
}


// ── "What does a visit cost?" zone price checker ───────────────────────────────────────
// Public, no login needed - calls role:'zone-price' (api/auth.js), which uses
// the exact same callout_zones lookup that actually charges the customer
// (matchCalloutZone), so this can never quote a different number than what
// booking later charges. Same non-native-dialog, swap-the-card pattern as the
// account panel (10.2) - one card, its content replaced per step, not three
// separate modals stacked and hidden.
//
// This script tag runs before js/app.js's module (also loaded by
// landing.html, for the shared booking wizard) reaches its own #hero-fee-btn
// wiring, so setting this here - synchronously, not inside DOMContentLoaded -
// is what makes js/app.js back off instead of double-binding the same
// button. See the matching check in js/app.js.
window.__landingOwnsFeeCheck = true;

function feeCheckKeyframes() {
  if (document.getElementById('fee-check-styles')) return;
  const s = document.createElement('style');
  s.id = 'fee-check-styles';
  s.textContent = '@keyframes feeCheckSpin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

function feeCheckCardHtml(inner) {
  return '<div class="fee-check-card" style="background:var(--white);border-radius:16px;max-width:320px;width:100%;padding:28px 24px;box-shadow:0 20px 60px rgba(13,31,60,0.35);position:relative">'
    + '<button class="fee-check-close" type="button" aria-label="Close" style="position:absolute;top:14px;right:14px;background:none;border:none;font-size:20px;line-height:1;color:var(--gray-lt);cursor:pointer;padding:4px">&#215;</button>'
    + inner
    + '</div>';
}

function feeCheckInputHtml() {
  return feeCheckCardHtml(
    '<div style="font-size:20px;font-weight:800;color:var(--navy);margin-bottom:6px">What\'s your suburb?</div>'
    + '<div style="font-size:13px;color:var(--gray);margin-bottom:18px">We\'ll check your visit & diagnosis fee - takes 2 seconds.</div>'
    + '<input type="text" class="fee-check-input" placeholder="e.g. Bondi, Parramatta, Cronulla..." style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;font-family:inherit;box-sizing:border-box;color:var(--navy)">'
    + '<div class="fee-check-err" style="display:none;color:var(--red);font-size:13px;margin-top:8px"></div>'
    + '<button class="fee-check-submit" type="button" style="width:100%;margin-top:16px;padding:13px;background:var(--blue);color:var(--white);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Check My Fee</button>'
  );
}

function feeCheckScanningHtml() {
  feeCheckKeyframes();
  return feeCheckCardHtml(
    '<div style="text-align:center;padding:8px 0">'
    + '<div style="width:110px;height:110px;margin:0 auto 20px;position:relative;border-radius:50%">'
    + '<div style="position:absolute;inset:0;border-radius:50%;border:2px solid var(--blue-lt)"></div>'
    + '<div style="position:absolute;inset:18px;border-radius:50%;border:2px solid var(--blue-lt)"></div>'
    + '<div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg, var(--blue) 0deg, transparent 65deg);animation:feeCheckSpin 1.1s linear infinite"></div>'
    + '<div style="position:absolute;inset:8px;border-radius:50%;background:var(--white)"></div>'
    + '<div style="position:absolute;top:50%;left:50%;width:10px;height:10px;margin:-5px;border-radius:50%;background:var(--blue)"></div>'
    + '</div>'
    + '<div style="font-size:15px;font-weight:700;color:var(--navy)">Checking your area...</div>'
    + '<div style="font-size:13px;color:var(--gray);margin-top:4px">Comparing against our Sydney zones</div>'
    + '</div>'
  );
}

function feeCheckResultHtml(zoneName, fee) {
  return feeCheckCardHtml(
    '<div style="text-align:center">'
    + '<div style="font-size:13px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">' + esc(zoneName) + '</div>'
    + '<div class="fee-check-amount" style="font-size:48px;font-weight:900;color:var(--blue);line-height:1;font-variant-numeric:tabular-nums" data-target="' + Number(fee) + '">$0</div>'
    + '<div style="font-size:13px;color:var(--gray);margin-top:12px;max-width:280px;margin-left:auto;margin-right:auto">Calculated from the distance to our base on the Northern Beaches - the same fee you\'ll see when you book.</div>'
    + '<button class="fee-check-continue" type="button" style="width:100%;margin-top:22px;padding:13px;background:var(--blue);color:var(--white);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Continue to Booking &rarr;</button>'
    + '<button class="fee-check-again" type="button" style="width:100%;margin-top:6px;padding:10px;background:transparent;color:var(--gray);border:none;font-size:13px;cursor:pointer;font-family:inherit">Check another suburb</button>'
    + '</div>'
  );
}

// Was a dead end: an emoji, "we don't recognise that suburb", a phone number
// and a "try another suburb" button. Somebody who came this far is interested
// and was being sent away with homework.
//
// It is a door now. The booking runs to the end for these addresses too and
// finishes on "Ask for my price" instead of a card - free, and it reaches
// Diego with the service, date and address already filled in. So the honest
// next step is "keep going", not "call us".
function feeCheckNotCoveredHtml(suburbText) {
  return feeCheckCardHtml(
    '<div style="text-align:center">'
    + '<div style="font-size:32px;margin-bottom:8px">&#128172;</div>'
    + '<div style="font-size:16px;font-weight:800;color:var(--navy);margin-bottom:6px">We quote that area case by case</div>'
    + '<div style="font-size:13px;color:var(--gray);line-height:1.55;margin-bottom:18px">It\'s outside our same-day zone, so there\'s no fixed price to show you - but we do still come. Book as usual and the last step asks for a price instead of a card: no charge, and the mechanic replies to you personally.</div>'
    + '<button class="fee-check-continue" type="button" style="width:100%;padding:13px;background:var(--blue);color:var(--white);border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px">Continue - book at no cost</button>'
    + '<button class="fee-check-again" type="button" style="width:100%;padding:12px;background:var(--surface);color:var(--navy);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Try a different suburb</button>'
    + '</div>'
  );
}

function feeCheckAnimateAmount(el) {
  const target = Number(el.dataset.target) || 0;
  const start = performance.now();
  const duration = 700;
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    el.textContent = '$' + Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function openFeeCheckModal() {
  document.getElementById('fee-check-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'fee-check-modal';
  modal.tabIndex = -1;
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(13,31,60,0.6);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = feeCheckInputHtml();
  document.body.appendChild(modal);
  if (window.__drbikeI18n) window.__drbikeI18n.translateScreen(modal);
  modal.querySelector('.fee-check-input')?.focus();

  function setStep(html) {
    modal.innerHTML = html;
    if (window.__drbikeI18n) window.__drbikeI18n.translateScreen(modal);
    const amount = modal.querySelector('.fee-check-amount');
    if (amount) feeCheckAnimateAmount(amount);
    // Result/not-covered screens have no input to receive focus, which leaves
    // it outside the modal's DOM subtree - Escape stops bubbling to our
    // keydown listener below. Focus the modal itself as a fallback so Esc
    // always closes it regardless of which screen is showing.
    const input = modal.querySelector('.fee-check-input');
    if (input) input.focus();
    else modal.focus();
  }

  async function submit(suburb) {
    setStep(feeCheckScanningHtml());
    let data = null;
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'zone-price', address: suburb }),
      });
      if (r.ok) data = await r.json();
    } catch (e) {}
    // Minimum time on the scanning screen so it always reads as "checking",
    // never a flash - even though the real lookup is near-instant.
    await new Promise((res) => setTimeout(res, 1400));
    if (data && data.covered) setStep(feeCheckResultHtml(data.zoneName, data.calloutFee));
    else setStep(feeCheckNotCoveredHtml(suburb));
  }

  modal.addEventListener('click', function(e) {
    if (e.target === modal || e.target.closest('.fee-check-close')) { modal.remove(); return; }
    if (e.target.closest('.fee-check-submit')) {
      const input = modal.querySelector('.fee-check-input');
      const err = modal.querySelector('.fee-check-err');
      const val = (input.value || '').trim();
      if (val.length < 3) { err.textContent = 'Enter your suburb first.'; err.style.display = 'block'; return; }
      submit(val);
      return;
    }
    if (e.target.closest('.fee-check-again')) { setStep(feeCheckInputHtml()); return; }
    if (e.target.closest('.fee-check-continue')) { modal.remove(); openBooking(); return; }
  });
  modal.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { modal.remove(); return; }
    if (e.key === 'Enter' && e.target.closest('.fee-check-input')) {
      modal.querySelector('.fee-check-submit')?.click();
    }
  });
}

// ── Wire all booking triggers on DOM ready ────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // The "OUR SERVICES" section that held the old button is gone: it was 96px
  // of padding around a heading, a subtitle and two buttons, with no service
  // cards in it at all - a large empty band earning nothing. The 33 price
  // cards were always in #services-modal, never in that section.
  //
  // The catalogue moved to the two places people already look for it: the
  // nav's "Services" entry and the hero's "View Services". Both used to be
  // anchors that scrolled DOWN to that section, where a second click finally
  // opened the modal - so this is one click now instead of two.
  //
  // Keeping a route to the modal is the trap here: an earlier attempt
  // (0c639c1, 4 Jul 2026) removed the only one and left a desktop visitor
  // unable to see a single price anywhere on the page.
  ['home-view-all-btn', 'nav-services-btn', 'hero-services-btn'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', openServicesModal);
  });

  const heroBk = document.getElementById('hero-book-btn');
  if (heroBk) heroBk.addEventListener('click', function() { openBooking(); });

  const heroFeeBtn = document.getElementById('hero-fee-btn');
  if (heroFeeBtn) heroFeeBtn.addEventListener('click', openFeeCheckModal);

  // "Book A Service" static section - previously had no handler at all,
  // looked like a working form but did nothing on submit (see
  // docs/cro-audit-landing.md). Opens the real booking modal, pre-selecting
  // whatever service was chosen in the dropdown if any.
  const lformContinueBtn = document.getElementById('lform-continue-btn');
  if (lformContinueBtn) {
    lformContinueBtn.addEventListener('click', function() {
      // The <option>s carry no value attribute, so .value is their visible
      // text - already translated on a Spanish or Chinese page. Same mapping
      // back to the table's English name as the service cards use.
      const svcEl = document.getElementById('lform-service');
      openBooking(svcEl && svcEl.value ? bkServiceName(svcEl.value) : null);
    });
  }

  // TASK-023: inline onclick handlers converted to addEventListener (see
  // tasks.md - done incrementally per page, landing.html first).
  const byId = function(id) { return document.getElementById(id); };
  const wire = function(id, fn) {
    const el = byId(id);
    if (el) el.addEventListener('click', fn);
  };

  // nav-auth-btn is deliberately NOT wired here. updateNavForSession() owns it
  // through btn.onclick, which it reassigns every time the session changes -
  // sign-in modal when signed out, account panel when signed in. This line used
  // to wire the signed-out behaviour as a second, permanent listener, so a
  // signed-in click ran both: the account panel opened and the sign-in modal
  // opened on top of it (z-index 10000 over 9999) and swallowed the next click.
  wire('toggle-monthly', function() { setBilling('monthly'); });
  wire('toggle-annual', function() { setBilling('annual'); });
  wire('giftcard-open-btn', function() {
    if (typeof window.drbikeOpenGiftCard === 'function') window.drbikeOpenGiftCard();
  });
  wire('services-modal-close-btn', function() {
    byId('services-modal').style.display = 'none';
  });
  wire('contact-us-btn', function() {
    window.open('mailto:contact@drbikesydney.com.au', '_blank');
  });
  wire('membership-modal-close-btn', function() { closeMembershipModal(); });
  wire('membership-done-btn', function() { closeMembershipModal(); });
  wire('membership-submit', function() { submitMembership(); });
  // Audit 12.17: these 3 fields carried onfocus/onblur highlighting the
  // border, same as the fleet form above.
  document.querySelectorAll('#membership-form input').forEach(function(el) {
    el.addEventListener('focus', function() { this.style.borderColor = 'var(--blue)'; });
    el.addEventListener('blur', function() { this.style.borderColor = 'var(--border)'; });
  });
  wire('giftcard-modal-close-btn', function() { closeGiftCardModal(); });
  wire('gift-submit', function() { submitGiftCard(); });
  wire('newsletter-subscribe-btn', function() { subscribeNewsletter(); });
  wire('auth-modal-close-btn', function() { closeAuthModal(); });
  wire('tab-signin', function() { showAuthTab('signin'); });
  wire('tab-signup', function() { showAuthTab('signup'); });
  wire('auth-submit', function() { submitAuth(); });
  wire('auth-forgot-btn', function() { requestPasswordReset(); });
  wire('google-signin-btn', function() { signInGoogle(); });

  // Modal backdrops: click outside the panel closes it (was inline onclick
  // on the backdrop div checking event.target === this).
  const membershipModal = byId('membership-modal');
  if (membershipModal) {
    membershipModal.addEventListener('click', function(e) {
      if (e.target === membershipModal) closeMembershipModal();
    });
  }
  const giftcardModal = byId('giftcard-modal');
  if (giftcardModal) {
    giftcardModal.addEventListener('click', function(e) {
      if (e.target === giftcardModal) closeGiftCardModal();
    });
  }

  // Membership "Get Started" buttons - delegated by class since there are
  // 3 (basic/standard/vip), each carrying its plan in data-plan.
  document.querySelectorAll('.lp-get-started').forEach(function(btn) {
    btn.addEventListener('click', function() {
      openMembershipModal(btn.dataset.plan);
    });
  });

  // FAQ accordion buttons - delegated by class, all call faq(this).
  document.querySelectorAll('.faq-q').forEach(function(btn) {
    btn.addEventListener('click', function() { faq(btn); });
  });

  // First GrowthBook experiment: hero CTA copy. Falls back to the default
  // text below if GrowthBook isn't configured yet (see <head> for setup).
  // The raw (English) variant text is stashed in a data attribute so it can
  // be re-translated from a known-good source on every language switch -
  // translateScreen()'s WeakMap caches the "original" text per DOM node the
  // first time it sees it, and textContent assignment always creates a new
  // node, so relying on that cache for content GrowthBook can overwrite at
  // any time risks caching an already-translated string as if it were the
  // English source (reproduced: switching languages after GrowthBook painted
  // left this button stuck in the previous language).
  // The hero CTA is FIXED at "Book a Service" (Diego, 2026-08-03). It used to
  // ask GrowthBook's `hero-cta-copy` feature, which was serving some visitors
  // "Get Your Free Quote" - that is why the button read differently on
  // different loads of the same page. It looked like a bug and it was not; it
  // was a live A/B test nobody was reading the results of.
  //
  // Pinned here rather than only in the GrowthBook dashboard so that flipping
  // the feature back on there cannot silently change the main CTA again. To run
  // this experiment for real, put the getFeatureValue call back.
  //
  // The data attribute stays: it holds the English source so a language switch
  // re-translates from known-good text instead of from an already-translated
  // string (translateScreen() caches "original" text per DOM node, and
  // assigning textContent makes a new node every time).
  const HERO_CTA_COPY = 'Book a Service';
  function applyHeroCtaExperiment() {
    if (!heroBk) return;
    heroBk.dataset.i18nSource = HERO_CTA_COPY;
    heroBk.textContent = HERO_CTA_COPY;
    if (window.__drbikeI18n) window.__drbikeI18n.translateScreen(heroBk);
  }
  applyHeroCtaExperiment();
  document.addEventListener('langchange', function() {
    if (!heroBk || !heroBk.dataset.i18nSource || !window.__drbikeI18n) return;
    heroBk.textContent = heroBk.dataset.i18nSource;
    window.__drbikeI18n.translateScreen(heroBk);
  });

  document.querySelectorAll('.svc-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const modal = document.getElementById('services-modal');
      if (modal) modal.style.display = 'none';
      // .svc-card, not .service-card: these cards have never carried the
      // latter class, so closest() returned null and every "Book Now" in the
      // All Services modal opened the wizard with nothing preselected.
      openBooking(bkServiceNameFrom(btn.closest('.svc-card')));
    });
  });

  // Removed a dead whole-card click handler here (audit 2026-08-23): it
  // queried '.services-grid .service-card', neither of which class has ever
  // existed on this page (the cards are .svc-card), so the forEach was always
  // empty - a no-op since it was written. The "Book Now" button inside each
  // card (.svc-btn, wired above) is the real, working entry point.

  /* login-cta buttons removed — auth via nav My Account button */
});


(function () {
  const _lpPiContent = {
    basic: {
      label: 'Basic Plan', price: '$67/month',
      includes: [
        '1 free minor repair per month (any repair under $60)',
        '1 free bike wash per month',
        '5% off extra services',
        'Priority scheduling (72hs)'
      ],
      excludes: 'Digital service history log is a Standard/VIP perk. Visit & diagnosis is not included - the visit & diagnosis fee (from $25, depending on your suburb) still applies to your covered visits. Full maintenance services (Tune-Up and up) are not part of the free minor-repair quota. Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.',
      savings: 'A wash plus an average minor repair is worth around $75. With Basic ($67/month) you come out ahead before the 5% discount on anything else.'
    },
    standard: {
      label: 'Standard Plan', price: '$97/month',
      includes: [
        '2 free minor repairs per month (any repair under $60)',
        '1 free bike wash per month',
        '1 free Tune-Up per month',
        'Visit & diagnosis included on covered visits',
        '10% off extra services',
        'Priority scheduling (48hs)',
        'Digital bike history log',
        '1 emergency callout per month (visit & diagnosis fee applies, from $25 depending on your suburb)'
      ],
      excludes: 'Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.',
      savings: 'A Tune-Up ($109) + a wash ($35) + 2 minor repairs (~$80) = about $224 in free work every month, for $97.'
    },
    vip: {
      label: 'VIP Plan', price: '$197/month',
      includes: [
        '3 free minor repairs per month (any repair under $60)',
        '2 free bike washes per month',
        '1 free Tune-Up per month',
        'Visit & diagnosis included on covered visits',
        '15% off extra services, plus 5% more',
        'Priority scheduling (24hs)',
        'Digital bike history log',
        '1 emergency callout per month (visit & diagnosis fee waived in your zone)',
        'Dedicated mechanic'
      ],
      excludes: 'Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.',
      savings: 'A Tune-Up ($109) + 2 washes ($70) + 3 minor repairs (~$120) = about $299 in free work every month, for $197.'
    }
  };

  function openLpPlanInfo(plan) {
    const c = _lpPiContent[plan];
    document.getElementById('lp-pi-plan-label').textContent = c.label;
    document.getElementById('lp-pi-price').textContent = c.price;
    const list = document.getElementById('lp-pi-includes-list');
    list.innerHTML = c.includes.map(function (item) {
      return '<li style="display:flex;gap:8px;align-items:flex-start">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;margin-top:2px">' +
        '<circle cx="12" cy="12" r="12" fill="var(--green)"/>' +
        '<polyline points="6 12 10 16 18 8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' + item + '</li>';
    }).join('');
    document.getElementById('lp-pi-excludes-text').textContent = c.excludes;
    document.getElementById('lp-pi-savings').textContent = c.savings;
    const gsBtn = document.getElementById('lp-pi-get-started');
    gsBtn.dataset.plan = plan;
    gsBtn.textContent = 'Get Started - ' + c.price;
    document.getElementById('lp-pi-modal').style.display = 'block';
  }

  function closeLpPlanInfo() {
    document.getElementById('lp-pi-modal').style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.lp-learn-more').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openLpPlanInfo(btn.dataset.plan);
      });
    });

    document.getElementById('lp-pi-close').addEventListener('click', closeLpPlanInfo);
    document.getElementById('lp-pi-modal').addEventListener('click', function (e) {
      if (e.target === this) closeLpPlanInfo();
    });
    document.getElementById('lp-pi-get-started').addEventListener('click', function () {
      const plan = this.dataset.plan;
      closeLpPlanInfo();
      openMembershipModal(plan);
    });
  });
}());

// ── Gift card purchase result: /?gift=success | cancelled ─────────────────────
(function() {
  const p = new URLSearchParams(window.location.search);
  const gift = p.get('gift');
  if (!gift) return;
  history.replaceState({}, '', '/');
  if (gift === 'success') {
    alert('🎁 Gift card purchased! It has been emailed to the recipient with their unique code.');
  }
}());

// ── Review link handler: /?review=bookingId ───────────────────────────────────
(function() {
  const p = new URLSearchParams(window.location.search);
  const reviewId = p.get('review');
  if (!reviewId) return;
  history.replaceState({}, '', '/');

  let currentRating = 0;
  let reviewPhotoFile = null;

  function compressImageToBase64(file, maxPx, quality) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function() {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function starHTML(n) {
    return [1,2,3,4,5].map(function(i) {
      const active = i <= n;
      return '<button data-val="'+i+'" style="background:none;border:none;font-size:38px;cursor:pointer;padding:3px;line-height:1;color:'+(active?'#B45309':'#E2E8F0')+';transition:color .1s,transform .1s;transform:'+(active?'scale(1.08)':'scale(1)')+'">'+(active?'★':'★')+'</button>';
    }).join('');
  }

  const LABELS = ['','Terrible','Poor','OK','Good','Excellent'];

  const modal = document.createElement('div');
  modal.id = 'review-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,-apple-system,sans-serif';
  modal.innerHTML = [
    '<div id="rv-card" style="background:var(--white);border-radius:16px;width:100%;max-width:420px;overflow:hidden">',
      '<div style="padding:24px 24px 0">',
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">',
          '<div style="width:44px;height:44px;flex-shrink:0;background:var(--blue-lt);border-radius:50%;display:flex;align-items:center;justify-content:center">',
            '<img src="images/logo-db.png" alt="Dr. Bike Sydney" height="22" style="width:auto;display:block">',
          '</div>',
          '<div>',
            '<div style="font-size:15px;font-weight:700;color:var(--navy)">How was your service?</div>',
            '<div style="font-size:13px;color:var(--gray);margin-top:2px">Your feedback helps us improve</div>',
          '</div>',
        '</div>',
        '<div style="height:1px;background:var(--border-lt);margin:0 -24px 20px"></div>',
        '<div style="text-align:center;margin-bottom:4px">',
          '<div id="rv-stars" style="display:inline-flex;gap:2px">'+starHTML(0)+'</div>',
          '<div id="rv-label" style="font-size:13px;font-weight:600;min-height:20px;margin-top:6px;color:var(--amber)"></div>',
        '</div>',
      '</div>',
      '<div style="padding:16px 24px 24px;display:flex;flex-direction:column;gap:14px">',
        '<div>',
          '<div style="font-size:11px;font-weight:600;color:var(--gray);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Your comments</div>',
          '<textarea id="rv-comment" maxlength="500" placeholder="Tell us what you loved or what we can improve..." style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;height:80px;resize:none;outline:none;color:var(--navy);background:var(--white)"></textarea>',
          '<div style="display:flex;justify-content:flex-end;font-size:11px;color:var(--gray-lt);margin-top:3px"><span id="rv-ct">0</span>/500</div>',
        '</div>',
        '<div>',
          '<div style="font-size:11px;font-weight:600;color:var(--gray);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Add a photo <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--gray-lt)">(optional)</span></div>',
          '<div style="display:flex;gap:10px;align-items:flex-start">',
            '<label id="rv-photo-lbl" style="flex:1;display:flex;align-items:center;gap:10px;height:52px;padding:0 14px;border:1.5px dashed var(--border);border-radius:10px;cursor:pointer;background:var(--surface)">',
              '<svg viewBox="0 0 24 24" fill="none" stroke="var(--gray-lt)" stroke-width="1.5" stroke-linecap="round" width="20" height="20"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
              '<span id="rv-photo-txt" style="font-size:13px;color:var(--gray)">Tap to add a photo</span>',
              '<input type="file" accept="image/*" id="rv-photo-inp" style="display:none">',
            '</label>',
            '<div id="rv-preview" style="display:none;width:52px;height:52px;flex-shrink:0;position:relative">',
              '<img id="rv-preview-img" style="width:52px;height:52px;object-fit:cover;border-radius:8px;display:block" alt="">',
              '<button id="rv-remove" type="button" aria-label="Remove photo" style="position:absolute;top:-6px;right:-6px;background:var(--red);border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">',
                '<svg viewBox="0 0 24 24" fill="none" stroke="var(--white)" stroke-width="3" width="9" height="9"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
              '</button>',
            '</div>',
          '</div>',
        '</div>',
        '<div id="rv-err" style="display:none;font-size:13px;color:var(--red);padding:8px 10px;background:var(--red-lt);border-radius:8px;text-align:center"></div>',
        '<button id="rv-submit" style="width:100%;padding:13px;background:var(--blue);color:var(--white);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Submit review</button>',
        '<button id="rv-skip" style="width:100%;padding:8px;background:none;border:none;font-size:13px;color:var(--gray-lt);cursor:pointer;font-family:inherit">Maybe later</button>',
      '</div>',
    '</div>'
  ].join('');

  document.body.appendChild(modal);

  // Stars
  document.getElementById('rv-stars').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-val]');
    if (!btn) return;
    currentRating = Number(btn.dataset.val);
    document.getElementById('rv-stars').innerHTML = starHTML(currentRating);
    const lbl = document.getElementById('rv-label');
    lbl.textContent = LABELS[currentRating];
    lbl.style.color = currentRating === 5 ? '#15803D' : currentRating >= 3 ? '#B45309' : '#CF2020';
  });

  // Char counter
  document.getElementById('rv-comment').addEventListener('input', function() {
    document.getElementById('rv-ct').textContent = this.value.length;
  });

  // Photo pick
  document.getElementById('rv-photo-inp').addEventListener('change', function() {
    if (!this.files[0]) return;
    reviewPhotoFile = this.files[0];
    document.getElementById('rv-preview-img').src = URL.createObjectURL(reviewPhotoFile);
    document.getElementById('rv-preview').style.display = 'block';
    document.getElementById('rv-photo-txt').textContent = 'Change photo';
    const lbl = document.getElementById('rv-photo-lbl');
    lbl.style.borderColor = 'var(--blue)';
    lbl.style.background = 'var(--blue-lt)';
  });

  // Photo remove
  document.getElementById('rv-remove').addEventListener('click', function(e) {
    e.preventDefault();
    reviewPhotoFile = null;
    document.getElementById('rv-preview').style.display = 'none';
    document.getElementById('rv-photo-inp').value = '';
    document.getElementById('rv-photo-txt').textContent = 'Tap to add a photo';
    const lbl = document.getElementById('rv-photo-lbl');
    lbl.style.borderColor = 'var(--border)';
    lbl.style.background = 'var(--surface)';
  });

  // Submit
  document.getElementById('rv-submit').addEventListener('click', function() {
    const btn = document.getElementById('rv-submit');
    const errEl = document.getElementById('rv-err');
    if (!currentRating) { errEl.textContent = 'Please select a star rating first'; errEl.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Submitting...'; errEl.style.display = 'none';
    const comment = (document.getElementById('rv-comment').value || '').trim();

    const doSubmit = function(photoBase64) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'client-review', booking_id: reviewId, rating: currentRating, comment: comment, photo_base64: photoBase64 || null })
      })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
      .then(function(res) {
        if (!res.ok) { errEl.textContent = res.d.error || 'Could not submit review'; errEl.style.display = 'block'; btn.textContent = 'Submit review'; btn.disabled = false; return; }
        document.getElementById('rv-card').innerHTML = [
          '<div style="padding:40px 28px;text-align:center">',
            '<div style="width:64px;height:64px;margin:0 auto 16px;background:var(--green-lt);border-radius:50%;display:flex;align-items:center;justify-content:center">',
              '<svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" width="28" height="28"><polyline points="20 6 9 17 4 12"/></svg>',
            '</div>',
            '<div style="font-size:20px;font-weight:700;color:var(--navy);margin-bottom:8px">Thank you!</div>',
            '<div style="font-size:15px;color:var(--gray);margin-bottom:24px">Your review has been submitted</div>',
            '<a href="https://maps.app.goo.gl/6HcU1P71vR3r2h4q7" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;text-decoration:none;margin-bottom:14px">',
              '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>',
              '<div style="text-align:left;flex:1"><div style="font-size:13px;font-weight:600;color:var(--navy)">Also leave a Google review?</div><div style="font-size:11px;color:var(--gray)">Helps cyclists find us</div></div>',
              '<svg viewBox="0 0 24 24" fill="none" stroke="var(--gray-lt)" stroke-width="2" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
            '</a>',
            '<button id="rv-thanks-close-btn" style="background:none;border:none;font-size:13px;color:var(--gray-lt);cursor:pointer;font-family:inherit">Close</button>',
          '</div>'
        ].join('');
        document.getElementById('rv-thanks-close-btn').addEventListener('click', function() {
          document.getElementById('review-modal').remove();
        });
      })
      .catch(function() { errEl.textContent = 'Connection error — try again'; errEl.style.display = 'block'; btn.textContent = 'Submit review'; btn.disabled = false; });
    };

    if (reviewPhotoFile) {
      btn.textContent = 'Uploading photo...';
      compressImageToBase64(reviewPhotoFile, 1920, 0.82)
        .then(function(b64) { doSubmit(b64); })
        .catch(function() { doSubmit(null); });
    } else {
      doSubmit(null);
    }
  });

  document.getElementById('rv-skip').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}());


let _landingChatChannel = null;
function openLandingChat(bookingId) {
  const existing = document.getElementById('landing-chat-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'landing-chat-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(13,31,60,0.45);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = ''
    + '<div style="width:100%;max-width:420px;height:min(620px,90vh);background:var(--white);border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden">'
    +   '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0">'
    +     '<div style="width:38px;height:38px;border-radius:50%;background:var(--blue-dark);display:flex;align-items:center;justify-content:center;font-size:18px">&#128295;</div>'
    +     '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;color:var(--navy)">Your mechanic</div><div style="display:flex;align-items:center;gap:5px;font-size:13px;color:var(--green)"><span style="width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block"></span>Online now</div></div>'
    +     '<button id="landing-chat-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--gray-lt);width:32px;height:32px;border-radius:50%">&#215;</button>'
    +   '</div>'
    +   '<div id="landing-chat-msgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:var(--surface)"></div>'
    +   '<div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--border);flex-shrink:0;background:var(--white)">'
    +     '<input id="landing-chat-inp" maxlength="500" placeholder="Type a message..." aria-label="Type a message" style="flex:1;padding:10px 14px;border:1.5px solid var(--border);border-radius:20px;font-family:inherit;font-size:15px;outline:none;color:var(--navy)">'
    +     '<button id="landing-chat-send" style="background:var(--blue);color:var(--white);border:none;border-radius:50%;width:42px;height:42px;flex-shrink:0;cursor:pointer;font-size:18px">&#10148;</button>'
    +   '</div>'
    + '</div>';
  document.body.appendChild(modal);

  const msgs = document.getElementById('landing-chat-msgs');
  const inp = document.getElementById('landing-chat-inp');
  function close() { modal.remove(); if (_landingChatChannel) { _sb.removeChannel(_landingChatChannel); _landingChatChannel = null; } }
  document.getElementById('landing-chat-close').addEventListener('click', close);
  modal.addEventListener('click', function(e) { if (e.target === modal) close(); });

  function append(m) {
    const isClient = m.sender_role === 'client';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:' + (isClient ? 'flex-end' : 'flex-start');
    const bubble = document.createElement('div');
    bubble.style.cssText = 'max-width:75%;padding:9px 13px;border-radius:' + (isClient ? '18px 18px 4px 18px' : '18px 18px 18px 4px') + ';font-size:15px;line-height:1.4;word-break:break-word;background:' + (isClient ? '#2563eb' : '#fff') + ';color:' + (isClient ? '#fff' : '#0D1F3C') + ';border:' + (isClient ? 'none' : '1px solid #E2E8F0');
    const pm = (m.message || '').match(/^\[PHOTO:(.*)\]$/);
    if (pm && /^https?:\/\//i.test(pm[1])) { const img = document.createElement('img'); img.src = pm[1]; img.style.cssText = 'max-width:200px;border-radius:10px;display:block;cursor:pointer'; img.addEventListener('click', function() { window.open(pm[1], '_blank'); }); bubble.style.padding = '4px'; bubble.appendChild(img); }
    else bubble.textContent = m.message;
    wrap.appendChild(bubble); msgs.appendChild(wrap); msgs.scrollTop = msgs.scrollHeight;
  }

  async function sendMsg() {
    const text = inp.value.trim(); if (!text) return; inp.value = '';
    const sess = (await _sb.auth.getSession()).data.session;
    const uid = sess && sess.user ? sess.user.id : 'client';
    const r = await _sb.from('job_messages').insert({ booking_id: bookingId, sender_role: 'client', sender_id: uid, message: text });
    if (r.error) { alert('Message failed to send'); inp.value = text; }
  }
  document.getElementById('landing-chat-send').addEventListener('click', sendMsg);
  inp.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });

  (async function() {
    msgs.innerHTML = '<div style="text-align:center;font-size:13px;color:var(--gray);padding:20px">Loading messages...</div>';
    const res = await _sb.from('job_messages').select('*').eq('booking_id', bookingId).order('created_at', { ascending: true });
    msgs.innerHTML = '';
    if (!res.data || !res.data.length) { msgs.innerHTML = '<div data-empty style="text-align:center;padding:40px 20px;color:var(--gray);margin:auto"><div style="font-size:40px;margin-bottom:10px">&#128172;</div><div style="font-size:15px;font-weight:600;color:var(--navy)">No messages yet</div><div style="font-size:13px;margin-top:4px">Send a message to your mechanic</div></div>'; }
    else res.data.forEach(append);
  }());

  if (_landingChatChannel) _sb.removeChannel(_landingChatChannel);
  _landingChatChannel = _sb.channel('landing-chat-' + bookingId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_messages', filter: 'booking_id=eq.' + bookingId }, function(payload) {
      const empty = msgs.querySelector('[data-empty]'); if (empty) empty.remove();
      append(payload.new);
    })
    .subscribe();
}


(function() {
  let open = false, busy = false;
  const history = [];

  const fab = document.createElement('button');
  fab.id = 'faqbot-fab';
  fab.setAttribute('aria-label', 'Chat with Dr. Bike');
  fab.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9998;width:58px;height:58px;border-radius:50%;background:#2563eb;border:none;cursor:pointer;box-shadow:0 6px 20px rgba(37,99,235,0.4);display:flex;align-items:center;justify-content:center;transition:transform 0.15s';
  fab.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--white)" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  fab.addEventListener('mouseenter', function(){ fab.style.transform = 'scale(1.06)'; });
  fab.addEventListener('mouseleave', function(){ fab.style.transform = 'scale(1)'; });
  document.body.appendChild(fab);

  const win = document.createElement('div');
  win.id = 'faqbot-win';
  win.style.cssText = 'position:fixed;bottom:88px;right:20px;z-index:9998;width:min(380px,calc(100vw-32px));height:min(560px,calc(100vh-130px));background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,0.22);border:1px solid var(--border);display:none;flex-direction:column;overflow:hidden';
  win.innerHTML = ''
    + '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--navy);flex-shrink:0">'
    +   '<div style="width:38px;height:38px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:18px">&#128692;</div>'
    +   '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;color:var(--white)">Dr. Bike Assistant</div><div style="display:flex;align-items:center;gap:5px;font-size:13px;color:#9CC2FF"><span style="width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block"></span>Ask me anything</div></div>'
    +   '<button id="faqbot-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--gray-lt);width:30px;height:30px">&#215;</button>'
    + '</div>'
    + '<div id="faqbot-msgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--surface)"></div>'
    + '<div id="faqbot-chips" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;background:var(--white);border-top:1px solid var(--border-lt)"></div>'
    + '<div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--border);flex-shrink:0;background:var(--white)">'
    +   '<input id="faqbot-inp" maxlength="500" placeholder="Type your question..." aria-label="Type your question" style="flex:1;padding:10px 14px;border:1.5px solid var(--border);border-radius:20px;font-family:inherit;font-size:15px;outline:none;color:var(--navy)">'
    +   '<button id="faqbot-send" style="background:var(--blue);color:var(--white);border:none;border-radius:50%;width:42px;height:42px;flex-shrink:0;cursor:pointer;font-size:18px">&#10148;</button>'
    + '</div>';
  document.body.appendChild(win);

  const msgs = win.querySelector('#faqbot-msgs');
  const inp = win.querySelector('#faqbot-inp');
  const chipsBar = win.querySelector('#faqbot-chips');
  const FAQS = ['What does a Tune-Up include?', 'Which areas do you cover?', 'How do memberships work?', 'Do you fix e-bikes?'];

  function bubble(role, text) {
    const isUser = role === 'user';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:' + (isUser ? 'flex-end' : 'flex-start');
    const b = document.createElement('div');
    b.style.cssText = 'max-width:80%;padding:10px 14px;border-radius:' + (isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px') + ';font-size:15px;line-height:1.45;word-break:break-word;background:' + (isUser ? '#2563eb' : '#fff') + ';color:' + (isUser ? '#fff' : '#0D1F3C') + ';border:' + (isUser ? 'none' : '1px solid #E2E8F0');
    b.textContent = text;
    wrap.appendChild(b); msgs.appendChild(wrap); msgs.scrollTop = msgs.scrollHeight;
    return b;
  }

  function renderChips() {
    chipsBar.innerHTML = '';
    if (history.length) { chipsBar.style.display = 'none'; return; }
    chipsBar.style.display = 'flex';
    FAQS.forEach(function(q) {
      const c = document.createElement('button');
      c.textContent = q;
      c.style.cssText = 'padding:7px 11px;border:1px solid var(--border);border-radius:16px;background:#fff;color:#1E40AF;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit';
      c.addEventListener('click', function() { send(q); });
      chipsBar.appendChild(c);
    });
  }

  async function send(text) {
    text = (text || inp.value).trim();
    if (!text || busy) return;
    inp.value = '';
    bubble('user', text);
    history.push({ role: 'user', content: text });
    renderChips();
    busy = true;
    const typing = bubble('assistant', '...');
    try {
      let up = null;
      try { const s = (await _sb.auth.getSession()).data.session; if (s && s.user) { const mt = s.user.user_metadata || {}; up = { full_name: mt.full_name || mt.name || '' }; } } catch (e) {}
      const resp = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-10), userProfile: up }) });
      const data = await resp.json();
      typing.textContent = data.reply || "Sorry, I couldn't process that. Call us on 0433 963 250.";
      history.push({ role: 'assistant', content: typing.textContent });
    } catch (e) {
      typing.textContent = "Sorry, I'm having trouble right now. Call us on 0433 963 250. 🔧";
    } finally {
      busy = false; msgs.scrollTop = msgs.scrollHeight;
    }
  }

  function toggle() {
    open = !open;
    win.style.display = open ? 'flex' : 'none';
    if (open) {
      if (!msgs.children.length) bubble('assistant', "G'day! I'm the Dr. Bike assistant. Ask me about services, prices, coverage areas or memberships. 🚲");
      renderChips();
      setTimeout(function(){ inp.focus(); }, 50);
    }
  }
  fab.addEventListener('click', toggle);
  win.querySelector('#faqbot-close').addEventListener('click', toggle);
  win.querySelector('#faqbot-send').addEventListener('click', function() { send(); });
  inp.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
}());

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');