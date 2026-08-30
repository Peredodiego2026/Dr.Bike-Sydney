/* js/consent.js — analytics consent gate.
 *
 * Audit point 7. Google Analytics, PostHog and Sentry session replay all
 * started on page load, before anybody agreed to anything, and there was no
 * banner at all. Session replay in particular records what the visitor does on
 * screen; starting that unasked is not a technicality.
 *
 * HOW THE GATE WORKS
 *
 * Consent Mode alone was not enough here. It stops GA writing cookies but the
 * script still loads and still talks to Google, and it does nothing for
 * PostHog or Sentry. So the block is the real thing: every analytics tag is
 * shipped as <script type="text/plain" data-consent="analytics">, which no
 * browser executes, and this file rewrites them into real <script> tags only
 * once consent exists. Nothing to un-send, because nothing was sent.
 *
 * Consent Mode is still declared on top of that, defaulting to denied, so if a
 * tag is ever added to a page without the text/plain wrapper it degrades to
 * cookieless rather than to fully tracked.
 *
 * This file must load EARLY and SYNCHRONOUSLY, before any analytics tag, or
 * the default would be set after the tag had already read it.
 *
 * WHAT IS NOT GATED
 *
 * Nothing here blocks the site working. The service worker, the language
 * choice, Stripe and the booking flow are not analytics and are untouched.
 * Sentry's plain error reporting is a judgement call that went the strict way
 * too: it is bundled with replayIntegration on these pages, and separating
 * them per page is not worth a partial answer. Errors are still visible in
 * Vercel's own logs and in api/_sentry.js server-side, neither of which
 * involves the visitor's browser.
 */
(function () {
  'use strict';

  const KEY = 'drbike-consent'; // 'granted' | 'denied'
  const LANG_KEY = 'drbike-lang'; // written by js/i18n.js

  // localStorage throws outright in some privacy modes, and a consent banner
  // that crashes the page it is protecting is worse than no banner.
  function read(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function write(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      /* a session-only choice is still a choice */
    }
  }

  // ── Consent Mode default: denied, before any tag reads it ──────────────────
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted', // language choice, not tracking
    security_storage: 'granted',
    wait_for_update: 500,
  });

  // ── Turning the tags on ────────────────────────────────────────────────────
  // A <script type="text/plain"> is inert. Cloning it into a real script is
  // what runs it. Order is preserved by inserting each clone where the
  // placeholder sat, and the placeholder is removed so a second call is a
  // no-op.
  function enableAnalytics() {
    gtag('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });

    const blocked = document.querySelectorAll('script[data-consent="analytics"]');
    for (let i = 0; i < blocked.length; i++) {
      const old = blocked[i];
      const s = document.createElement('script');
      for (let j = 0; j < old.attributes.length; j++) {
        const a = old.attributes[j];
        if (a.name === 'type' || a.name === 'data-consent') continue;
        s.setAttribute(a.name, a.value);
      }
      if (!old.src) s.text = old.textContent;
      old.parentNode.insertBefore(s, old);
      old.parentNode.removeChild(old);
    }
  }

  // ── The hook for analytics that is NOT a script tag ────────────────────────
  // PostHog on the landing is started from inside js/landing-inline.js, so
  // there is no tag to make inert. Anything in that shape registers here
  // instead: the callback runs immediately if consent already exists, or on
  // the Accept click later, and never at all otherwise. Same gate, two shapes.
  let pending = [];
  let granted = false;
  window.drbikeOnConsent = function (fn) {
    if (granted) fn();
    else pending.push(fn);
  };
  window.drbikeAnalyticsAllowed = function () {
    return granted;
  };

  const _enableTags = enableAnalytics;
  enableAnalytics = function () {
    if (granted) return;
    granted = true;
    _enableTags();
    for (let i = 0; i < pending.length; i++) {
      try {
        pending[i]();
      } catch (e) {
        console.error('[consent] analytics init failed:', e && e.message);
      }
    }
    pending = [];
  };

  // Lets a "cookie settings" control anywhere in the app reopen the choice.
  // Defined before the early returns below, or a visitor who already decided
  // would have no way to change their mind.
  window.drbikeConsentReset = function () {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* nothing to remove */
    }
    showBanner();
  };

  // A visitor who already decided never sees the banner again.
  const saved = read(KEY);
  if (saved === 'granted') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', enableAnalytics);
    } else {
      enableAnalytics();
    }
    return;
  }
  if (saved === 'denied') return;

  // ── The banner ─────────────────────────────────────────────────────────────
  // Three languages shipped together, per the project rule that a string is
  // never created in English with the translation deferred. Kept inline rather
  // than in js/i18n.js because this file runs before i18n.js is imported -
  // that is the whole point of it - and importing a module here would defeat
  // the "before any tag" ordering.
  const COPY = {
    en: {
      text: 'We use analytics cookies to understand how the site is used. Your choice is remembered on this device.',
      accept: 'Accept',
      decline: 'Decline',
      more: 'Privacy',
    },
    es: {
      text: 'Usamos cookies de analitica para entender como se usa el sitio. Tu eleccion se recuerda en este dispositivo.',
      accept: 'Aceptar',
      decline: 'Rechazar',
      more: 'Privacidad',
    },
    zh: {
      text: '我们使用分析 Cookie 来了解网站的使用情况。您的选择会保存在此设备上。',
      accept: '接受',
      decline: '拒绝',
      more: '隐私政策',
    },
  };

  function copy() {
    const l = read(LANG_KEY);
    if (COPY[l]) return COPY[l];
    const nav = (navigator.language || 'en').slice(0, 2);
    return COPY[nav] || COPY.en;
  }

  function showBanner() {
    if (document.getElementById('drbike-consent')) return;
    const t = copy();

    const bar = document.createElement('div');
    bar.id = 'drbike-consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', t.text);
    // Sits above the SPA's 56px bottom nav so it never covers it, and above
    // Sentry/Stripe overlays without fighting the booking modal (z 9998).
    bar.style.cssText = [
      'position:fixed',
      'left:0',
      'right:0',
      'bottom:0',
      'z-index:9998',
      'background:var(--white,#fff)',
      'border-top:1px solid var(--border,#e2e8f0)',
      'box-shadow:0 -4px 24px rgba(0,0,0,0.12)',
      'padding:14px 16px',
      'padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))',
      'font-family:Inter,system-ui,sans-serif',
      'display:flex',
      'flex-wrap:wrap',
      'align-items:center',
      'gap:10px',
      'justify-content:center',
    ].join(';');

    const msg = document.createElement('p');
    msg.textContent = t.text;
    msg.style.cssText =
      'margin:0;flex:1 1 260px;font-size:13px;line-height:1.45;color:var(--gray,#475569)';

    const link = document.createElement('a');
    link.href = '/privacy.html';
    link.textContent = t.more;
    link.style.cssText =
      'font-size:13px;font-weight:600;color:var(--blue,#2563eb);text-decoration:underline;white-space:nowrap';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex:0 0 auto';

    // 44px min height: these are touch targets on the mobile SPA.
    function button(label, primary) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = [
        'min-height:44px',
        'padding:12px 20px',
        'border-radius:8px',
        'font-size:14px',
        'font-weight:700',
        'font-family:inherit',
        'cursor:pointer',
        primary
          ? 'background:var(--blue,#2563eb);color:var(--white,#fff);border:none'
          : 'background:transparent;color:var(--navy,#0d1f3c);border:1.5px solid var(--border,#e2e8f0)',
      ].join(';');
      return b;
    }

    // Decline first in the DOM: the privacy-preserving choice is not the one
    // hidden behind the other, and neither is styled to be hard to find.
    const no = button(t.decline, false);
    const yes = button(t.accept, true);

    function close() {
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    }
    no.addEventListener('click', function () {
      write(KEY, 'denied');
      close();
    });
    yes.addEventListener('click', function () {
      write(KEY, 'granted');
      enableAnalytics();
      close();
    });

    actions.appendChild(no);
    actions.appendChild(yes);
    msg.appendChild(document.createTextNode(' '));
    msg.appendChild(link);
    bar.appendChild(msg);
    bar.appendChild(actions);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();
