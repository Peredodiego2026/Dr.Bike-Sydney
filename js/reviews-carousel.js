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

  const cards = [...track.querySelectorAll(':scope > .review-card')];
  const n = cards.length;
  if (n < 2) {
    if (prevBtn) prevBtn.hidden = true;
    if (nextBtn) nextBtn.hidden = true;
    return;
  }

  let active = 0;

  function layout() {
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
    active = (active + step + n) % n;
    layout();
  }

  cards.forEach((card, i) => {
    card.addEventListener('click', () => {
      if (i !== active) {
        active = i;
        layout();
      }
    });
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
    .rv-viewport { position: relative; height: clamp(460px, 66vh, 600px); perspective: 1400px; touch-action: pan-y; overflow: hidden; }
    .rv-orb { position: absolute; left: 50%; top: 50%; width: min(620px, 94%); aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; background: var(--blue-lt); opacity: 0.85; pointer-events: none; z-index: 0; }
    .rv-track { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; z-index: 1; }
    .rv-track > .review-card { position: absolute; left: 50%; top: 50%; width: clamp(260px, 30vw, 340px); margin: 0; background: var(--white); border: 1px solid var(--border); border-radius: 18px; padding: 20px; box-shadow: 0 24px 50px -22px rgba(13, 31, 60, 0.35); cursor: pointer; transition: transform 0.45s cubic-bezier(.22,.61,.36,1), opacity 0.45s ease; will-change: transform; backface-visibility: hidden; }
    .rv-track > .review-card.is-active { cursor: default; }
    .rv-controls { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 16px; }
    .rv-btn { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--border); background: var(--white); color: var(--navy); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(13, 31, 60, 0.08); }
    .rv-btn[hidden] { display: none; }
    .rv-btn:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .rv-track > .review-card { transition: none; } }
  `;
  document.head.appendChild(style);

  layout();
})();
