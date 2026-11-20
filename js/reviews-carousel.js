// js/reviews-carousel.js
//
// The Google reviews as a 3D carousel, the same geometry as the mechanics
// carousel in landing-inline.js: the active card in front, the others pushed
// back and turned, over one large soft circle. Arrows move one card; on touch
// screens a horizontal swipe does the same.
//
// The cards are plain HTML in landing.html and index.html, so the reviews are
// readable without this script. The script only arranges them.

(function () {
  const track = document.getElementById('google-reviews-grid');
  const viewport = document.getElementById('rv-viewport');
  const prevBtn = document.getElementById('rv-prev');
  const nextBtn = document.getElementById('rv-next');
  if (!track || !viewport) return;

  // `let`, and read again by drbikeShowOwnReviews below: the reviews written
  // on /reviews arrive after this runs, so the set of cards can grow.
  let cards = [];
  let n = 0;
  let active = 0;

  function collect() {
    cards = [...track.querySelectorAll(':scope > .review-card')];
    n = cards.length;
    if (prevBtn) prevBtn.hidden = n < 2;
    if (nextBtn) nextBtn.hidden = n < 2;
  }

  function layout() {
    if (n < 2) {
      // One card, or none: no 3D stage, just the card in the middle.
      cards.forEach((card) => {
        card.style.transform = 'translate(-50%,-50%)';
        card.style.opacity = '1';
        card.classList.add('is-active');
      });
      return;
    }
    cards.forEach((card, i) => {
      let offset = i - active;
      if (offset > n / 2) offset -= n;
      if (offset < -n / 2) offset += n;
      const abs = Math.abs(offset);
      const cardW = card.offsetWidth || 300;
      const tx = offset * cardW * 0.62;
      const tz = -abs * 160;
      const ry = -offset * 34;
      const scale = abs === 0 ? 1 : 0.84;
      const opacity = abs > 1 ? 0 : 1 - abs * 0.5;
      card.style.transform = `translate(-50%,-50%) translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`;
      card.style.opacity = String(opacity);
      card.style.zIndex = String(100 - abs);
      card.style.pointerEvents = abs > 1 ? 'none' : 'auto';
      card.classList.toggle('is-active', abs === 0);
      card.setAttribute('aria-hidden', abs === 0 ? 'false' : 'true');
    });
  }

  function go(step) {
    if (n < 2) return;
    active = (active + step + n) % n;
    layout();
  }

  // One listener on the track instead of one per card, so a card added later
  // is clickable too.
  track.addEventListener('click', (e) => {
    const card = e.target.closest('.review-card');
    const i = cards.indexOf(card);
    if (i > -1 && i !== active) {
      active = i;
      layout();
    }
  });

  prevBtn?.addEventListener('click', () => go(-1));
  nextBtn?.addEventListener('click', () => go(1));

  // Swipe. pointer events cover touch and mouse alike; touch-action: pan-y in
  // the style below leaves vertical scrolling to the page.
  let dragging = false;
  let startX = 0;
  let moved = 0;
  viewport.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    moved = 0;
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (dragging) moved = e.clientX - startX;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (moved > 50) go(-1);
    else if (moved < -50) go(1);
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // Keep the geometry right when the width changes (a card is measured in px).
  window.addEventListener('resize', layout);

  const style = document.createElement('style');
  style.textContent = `
    .rv-viewport { position: relative; height: 540px; perspective: 1400px; touch-action: pan-y; overflow: hidden; }
    .rv-orb { position: absolute; left: 50%; top: 50%; width: min(440px, 78%); aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; background: var(--blue-lt); opacity: 0.85; pointer-events: none; z-index: 0; }
    .rv-track { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; z-index: 1; }
    .rv-track > .review-card { position: absolute; left: 50%; top: 50%; margin: 0; background: var(--white); border: 1px solid var(--border); border-radius: 18px; padding: 20px; box-shadow: 0 24px 50px -22px rgba(13, 31, 60, 0.35); cursor: pointer; transition: transform 0.45s cubic-bezier(.22,.61,.36,1), opacity 0.45s ease; will-change: transform; backface-visibility: hidden; }
    .rv-track > .review-card.is-active { cursor: default; }
    .rv-track > .review-card { width: clamp(260px, 26vw, 320px); padding: 16px; }
    .rv-track > .review-card p { font-size: 14px !important; line-height: 1.5 !important; }
    .rv-track > .review-card img { height: 150px !important; }
    @media (max-width: 640px) { .rv-viewport { height: 520px; } }
    @media (min-width: 641px) {
      .rv-viewport { height: 500px; }
      .rv-track > .review-card { width: 300px; padding: 16px; }
      .rv-track > .review-card p { font-size: 14px !important; line-height: 1.45 !important; }
      .rv-track > .review-card img { height: 140px !important; }
    }
    .rv-controls { position: absolute; top: 50%; left: 8px; right: 8px; transform: translateY(-50%); display: flex; justify-content: space-between; pointer-events: none; z-index: 200; }
    .rv-btn { pointer-events: auto; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--border); background: var(--white); color: var(--navy); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(13, 31, 60, 0.08); }
    .rv-btn[hidden] { display: none; }
    .rv-btn:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .rv-track > .review-card { transition: none; } }
  `;
  document.head.appendChild(style);

  // ── The reviews written on /reviews, in front of the Google ones ──────────
  // Diego, 20-nov-2026: everything a customer posts on our own review page has
  // to show here, where people look. Both pages read public_reviews themselves
  // (js/landing-inline.js, index.html) and hand the rows to this, so the card
  // looks the same on both and matches the Google cards next to it. Calling it
  // again replaces the cards it added before - index.html reloads the list
  // after a client posts a review in the app.
  const AVATARS = [
    'var(--blue-deep)',
    'var(--green)',
    'var(--purple)',
    'var(--amber)',
    'var(--cyan)',
  ];
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  function ownCard(r, i) {
    const n = Math.max(1, Math.min(5, Number(r.rating) || 5));
    const name = r.display_name || 'Dr. Bike client';
    const photo = (r.photos || [])[0];
    return `<div class="review-card" data-own-review>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div style="width:44px;height:44px;border-radius:50%;background:${AVATARS[i % AVATARS.length]};display:flex;align-items:center;justify-content:center;color:var(--white);font-weight:700;font-size:15px;flex-shrink:0">${esc(name.charAt(0).toUpperCase())}</div>
        <div style="min-width:0">
          <div style="font-weight:700;font-size:15px;color:var(--navy)">${esc(name)}</div>
          ${r.verified ? '<div style="font-size:12px;font-weight:600;color:var(--green-ink)">Verified booking</div>' : ''}
        </div>
      </div>
      <div style="color:var(--amber-bright);font-size:15px;margin-bottom:8px" aria-label="${n} out of 5 stars">${'&#9733;'.repeat(n)}${'&#9734;'.repeat(5 - n)}</div>
      <p style="font-size:15px;color:var(--gray);line-height:1.6;display:-webkit-box;-webkit-line-clamp:7;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line">${esc(r.comment)}</p>
      ${photo ? `<img src="${esc(String(photo).replace(/\.jpg$/, '_t.jpg'))}" alt="" loading="lazy" decoding="async" style="display:block;width:100%;max-width:100%;height:200px;object-fit:cover;border-radius:10px;margin-top:12px">` : ''}
    </div>`;
  }
  window.drbikeShowOwnReviews = (rows) => {
    track.querySelectorAll(':scope > [data-own-review]').forEach((c) => c.remove());
    const list = (rows || []).filter((r) => r && r.comment);
    if (list.length) track.insertAdjacentHTML('afterbegin', list.map(ownCard).join(''));
    collect();
    active = 0;
    layout();
  };

  collect();
  layout();
})();
