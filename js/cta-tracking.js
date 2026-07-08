// js/cta-tracking.js — generic CTA click tracking via event delegation, so
// new buttons get covered automatically without editing this file or the
// button's own HTML every time. One listener, matched by selector at click
// time (not page-load time), fires a single well-named PostHog event.
//
// Answers "what do visitors click/see most" - previously the only tracked
// click was the one GrowthBook hero experiment button.
(function () {
  const CTA_SELECTOR = [
    'a[href^="tel:"]',
    'a[href*="wa.me"]',
    'a[href="#book-service"]',
    '[data-plan]',
    '#hero-book-btn',
  ].join(', ');

  function locationOf(el) {
    const withId = el.closest('[id]');
    if (withId && withId.id) return withId.id;
    const section = el.closest('section, header, footer');
    return section ? section.tagName.toLowerCase() : 'unknown';
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest(CTA_SELECTOR);
    if (!el || !window.posthog) return;
    posthog.capture('cta_clicked', {
      button_text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 60),
      location: locationOf(el),
    });
  });
})();
