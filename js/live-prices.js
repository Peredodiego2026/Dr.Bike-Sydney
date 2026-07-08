// js/live-prices.js — keeps every marketing price (index, landing, suburb
// pages) in sync with the real `services` table in Supabase, so editing a
// price in Admin > Services updates everywhere at once.
//
// The mobile app's own SPA screens (js/app.js) and landing.html's real
// booking widget already read services live via a direct Supabase query -
// this file exists for the marketing sections that are static HTML with no
// such mechanism.
//
// Three markup patterns exist on the site, all handled here:
// - suburb pages:  .service-card > h3 + .price
// - index.html:    .service-card > .service-name + .service-price
// - landing.html:  .svc-card > .svc-name + .svc-price (All Services modal)
//
// Some marketing names intentionally differ from the internal Supabase
// name (e.g. "Chain Replacement" reads friendlier than "Chain Install") -
// NAME_MAP bridges those so the price still syncs. Cards with no match
// (Custom Quote, Repairs, etc - not a single priced service) keep their
// static price and log a warning.
(function () {
  const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
  const SUPABASE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';

  const NAME_MAP = {
    'Basic Tune-Up': 'Tune-Up',
    'Flat Tyre Repair': 'Tyre / Tube Install',
    'Wheel Truing - Minor': 'Wheel Truing — Minor',
    'Wheel Truing - Major': 'Wheel Truing — Major',
    'Brake Pad Replacement': 'Brake Pad Install',
    'Hydraulic Bleed': 'Brake Bleed',
    'Chain Replacement': 'Chain Install',
    'Cassette/Freewheel Swap': 'Cassette Install',
    'Cable & Housing': 'External Cable Install',
    'Handlebar Tape': 'Bar Tape Install',
    'Bottom Bracket Service': 'Bottom Bracket Install',
  };

  async function syncPrices() {
    const cards = document.querySelectorAll('.service-card, .svc-card');
    if (!cards.length) return;

    let services;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/services?select=name,price`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (!res.ok) return;
      services = await res.json();
    } catch {
      return; // keep whatever price is already in the static HTML
    }
    if (!Array.isArray(services) || !services.length) return;

    cards.forEach((card) => {
      const heading = card.querySelector('h3, .service-name, .svc-name');
      const priceEl = card.querySelector('.price, .service-price, .svc-price');
      if (!heading || !priceEl) return;
      const cardName = heading.textContent.trim();
      const lookupName = NAME_MAP[cardName] || cardName;
      const match = services.find((s) => s.name === lookupName);
      if (match && typeof match.price === 'number') {
        priceEl.textContent = '$' + match.price;
      } else {
        console.warn(
          '[live-prices] no Supabase match for "' + cardName + '" - showing static price'
        );
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncPrices);
  } else {
    syncPrices();
  }
})();
