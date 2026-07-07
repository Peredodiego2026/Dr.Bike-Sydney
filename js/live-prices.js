// js/live-prices.js — keeps the 4 headline prices shown on the marketing
// pages (landing + suburb pages) in sync with the real `services` table in
// Supabase, so changing a price in Admin updates everywhere at once.
//
// The mobile app (index.html) already reads services live via getServices()
// in js/supabase.js - this file exists because the marketing pages are
// static HTML with no such mechanism.
//
// Matches by exact service name. "Major Service" -> "Standard+ Service" is
// a known naming mismatch (the marketing copy wasn't updated when the
// service catalog was restructured) - fix by renaming one side to match
// the other, then this mapping can go back to being 1:1.
(function () {
  const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
  const SUPABASE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';

  const TIER_TO_SERVICE_NAME = {
    'Tune-Up': 'Tune-Up',
    'Standard Service': 'Standard Service',
    'Major Service': 'Standard+ Service',
    'Ultimate Overhaul': 'Ultimate Overhaul',
  };

  async function syncPrices() {
    const cards = document.querySelectorAll('.service-card');
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
      const heading = card.querySelector('h3');
      const priceEl = card.querySelector('.price');
      if (!heading || !priceEl) return;
      const cardName = heading.textContent.trim();
      const lookupName = TIER_TO_SERVICE_NAME[cardName] || cardName;
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
