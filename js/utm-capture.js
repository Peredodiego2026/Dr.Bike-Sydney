// js/utm-capture.js — captures utm_source/utm_medium/utm_campaign from the
// URL on first load and keeps them in sessionStorage for the rest of the
// visit, so the booking flow (which never reloads the page) can attach them
// to the booking when it's finally created. Without this we can't tell
// which channel (Google, Instagram, referral link, etc) actually produces
// paying customers - only that a booking happened.
(function () {
  const params = new URLSearchParams(window.location.search);
  const fields = ['utm_source', 'utm_medium', 'utm_campaign'];
  const found = fields.some((f) => params.has(f));
  if (!found) return; // keep whatever was already captured earlier this session
  fields.forEach((f) => {
    const v = params.get(f);
    if (v) sessionStorage.setItem(f, v);
  });
})();
