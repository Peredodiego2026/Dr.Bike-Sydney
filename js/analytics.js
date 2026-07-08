// js/analytics.js — PostHog + GA4 unified analytics helper
// PostHog setup: https://posthog.com → create project → copy API key to POSTHOG_KEY below
// CDN snippet must be loaded in HTML before this script

const POSTHOG_KEY = 'phc_p3bN9qdguBGXMaWWtCiEQ3TjdFztVJPyG2yAsLdeUTzV';
const POSTHOG_HOST = 'https://eu.i.posthog.com';

// ── Init PostHog (call once on page load) ─────────────────────────────────────
export function initPostHog() {
  if (typeof window === 'undefined' || !POSTHOG_KEY.startsWith('phc_')) return;
  if (window.posthog?.__loaded) return;

  !(function (t, e) {
    window.posthog = e;
    e.__loaded = false;
    e.init = function (t, cfg) {
      if (!e.__init) {
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://app.posthog.com/static/array.js';
        script.onload = function () {
          e.__loaded = true;
          e.init(t, cfg);
        };
        document.head.appendChild(script);
        e.__init = true;
      }
    };
  })(0, window.posthog || []);

  window.posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // manual events only — more control
    persistence: 'localStorage+cookie',
    opt_in_site_apps: false,
    // GDPR: don't track if user opted out
    loaded: (ph) => {
      if (document.cookie.includes('ph_opt_out=1')) ph.opt_out_capturing();
    },
  });
}

// ── Track event ───────────────────────────────────────────────────────────────
export function track(event, props = {}) {
  // PostHog
  if (window.posthog?.__loaded) {
    window.posthog.capture(event, props);
  }
  // GA4
  if (typeof gtag === 'function') {
    gtag('event', event.replace(/ /g, '_').toLowerCase(), props);
  }
}

// ── Identify user (call after login) ──────────────────────────────────────────
export function identifyUser(userId, traits = {}) {
  if (window.posthog?.__loaded) {
    window.posthog.identify(userId, traits);
  }
}

// ── Reset on logout ───────────────────────────────────────────────────────────
export function resetAnalytics() {
  if (window.posthog?.__loaded) {
    window.posthog.reset();
  }
}

// ── Pre-defined events (use these for consistency) ────────────────────────────
export const Events = {
  BOOKING_STARTED: 'Booking Started',
  BOOKING_SERVICE_SELECTED: 'Booking Service Selected',
  BOOKING_DATE_SELECTED: 'Booking Date Selected',
  BOOKING_COMPLETED: 'Booking Completed',
  BOOKING_PAYMENT_FAILED: 'Booking Payment Failed',
  MEMBERSHIP_VIEWED: 'Membership Viewed',
  MEMBERSHIP_STARTED: 'Membership Started',
  MEMBERSHIP_COMPLETED: 'Membership Completed',
  AUTH_SIGNUP: 'Sign Up',
  AUTH_LOGIN: 'Log In',
  AUTH_LOGOUT: 'Log Out',
  ACCOUNT_OPENED: 'Account Panel Opened',
  CHATBOT_OPENED: 'Chatbot Opened',
  CHATBOT_MESSAGE_SENT: 'Chatbot Message Sent',
  SERVICE_LIST_VIEWED: 'Service List Viewed',
  QUOTE_REQUESTED: 'Quote Requested',
  REFERRAL_CODE_COPIED: 'Referral Code Copied',
};
