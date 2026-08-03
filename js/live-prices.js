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
// (Custom Quote, etc - not a single priced service) keep their static price
// and log a warning.
//
// A card can also advertise a floor instead of a fixed price, with
// data-price-from:
//   data-price-from            -> "From $<that service's price>"
//   data-price-from="cheapest" -> "From $<cheapest priced service>", for a card
//                                 like Repairs that names a category rather
//                                 than one bookable service.
// Before this existed, Repairs said "From $60": a number matching no row in the
// table, that editing Admin > Services could not change (audit 12.6).
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

  // landing.html's booking CTAs need the same bridge to preselect a service in
  // the wizard from the name printed on a marketing card. Published rather than
  // copied so there is one list to keep in step with the services table.
  window.__drbikeServiceNames = NAME_MAP;

  // "$75" needs no translation; "From $75" has a word in it, and by the time
  // this runs the page may already have been rendered in Spanish or Chinese.
  // translateValue returns the original when the dictionary has no entry or
  // the language is English, so the fallback is the English word either way.
  function fromLabel() {
    try {
      return window.__drbikeI18n?.translateValue?.('From') || 'From';
    } catch {
      return 'From';
    }
  }

  // Emergency Service is priced 0 - it is a "call us and we quote you" path,
  // not a free job - so a plain minimum would publish "From $0", which reads as
  // free. Zero-priced rows are excluded rather than assumed away.
  function cheapestPrice(services) {
    const priced = services.map((s) => Number(s.price)).filter((p) => p > 0);
    return priced.length ? Math.min(...priced) : null;
  }

  async function syncPrices() {
    const cards = document.querySelectorAll('.service-card, .svc-card');
    if (!cards.length) return;

    // Every bail-out below leaves the whole grid on the static prices baked into
    // the HTML. That is the right behaviour - a blank price is worse than a
    // stale one - but it used to happen without a single trace, so a price list
    // frozen for weeks looked exactly like one that had just synced. Same
    // failure mode MOCK_SERVICES was deleted for; it must at least say so.
    let services;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/services?select=name,price`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (!res.ok) {
        console.warn('[live-prices] services fetch returned ' + res.status + ' - showing static prices');
        return;
      }
      services = await res.json();
    } catch (e) {
      console.warn('[live-prices] services fetch failed (' + e.message + ') - showing static prices');
      return; // keep whatever price is already in the static HTML
    }
    if (!Array.isArray(services) || !services.length) {
      console.warn('[live-prices] services table returned nothing - showing static prices');
      return;
    }

    cards.forEach((card) => {
      const heading = card.querySelector('h3, .service-name, .svc-name');
      const priceEl = card.querySelector('.price, .service-price, .svc-price');
      if (!heading || !priceEl) return;

      // A category card has no service to look up, so it is resolved before
      // the name matching below rather than inside it.
      if (card.dataset.priceFrom === 'cheapest') {
        const min = cheapestPrice(services);
        if (min === null) {
          console.warn('[live-prices] no priced service to compute a floor - showing static price');
          return;
        }
        priceEl.textContent = fromLabel() + ' $' + min;
        return;
      }
      const showsFloor = card.hasAttribute('data-price-from');
      // Three ways to get the English name the Supabase `services` table uses:
      //  1. data-service on the card - the translated suburb pages carry it,
      //     since their headings are authored in Spanish/Chinese;
      //  2. the i18n reverse map, for index.html and landing.html, where the
      //     heading was translated in place after render;
      //  3. the heading itself, for pages with no translation at all.
      // Without this, every card silently fell back to its static price for
      // Spanish and Chinese visitors and Admin price edits never reached them.
      const rendered = heading.textContent.trim();
      const cardName =
        card.dataset.service || window.__drbikeI18n?.sourceOf?.(rendered) || rendered;
      const lookupName = NAME_MAP[cardName] || cardName;
      const match = services.find((s) => s.name === lookupName);
      if (match && typeof match.price === 'number') {
        priceEl.textContent = showsFloor
          ? fromLabel() + ' $' + match.price
          : '$' + match.price;
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
