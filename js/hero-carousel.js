// js/hero-carousel.js
//
// Diego's own photos in the landing hero (2026-11-10). They replaced an
// AI-made van picture: Dr. Bike has no van, and Google rejected the Business
// Profile appeal as "deceptive content" that week. Never put a generated or
// AI-edited image back into #hero-carousel.
//
// The first photo is plain HTML, so the hero has a picture without this
// script. The script fades to the next photo every 5 seconds. It stops while
// the pointer or keyboard focus is on the photos, while the tab is hidden, and
// for visitors who ask for reduced motion. The arrows and a swipe move one
// photo.
//
// From the third photo on, the HTML gives data-src instead of src. A lazy
// <img> that is merely transparent still counts as on screen, so all 13
// (1.3 MB) would download with the page. show() loads the photo it shows and
// the one after it.

(function () {
  const root = document.getElementById('hero-carousel');
  if (!root) return;

  const slides = [...root.querySelectorAll('.hero-carousel__slide')];
  const dots = [...root.querySelectorAll('.hero-carousel__dots span')];
  const prevBtn = document.getElementById('hero-prev');
  const nextBtn = document.getElementById('hero-next');
  const n = slides.length;
  if (n < 2 || !prevBtn || !nextBtn) {
    if (prevBtn) prevBtn.hidden = true;
    if (nextBtn) nextBtn.hidden = true;
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = 0;
  let timer = null;
  let held = false;

  function load(slide) {
    if (!slide.dataset.src) return;
    slide.src = slide.dataset.src;
    delete slide.dataset.src;
  }

  function show(i) {
    active = (i + n) % n;
    load(slides[active]);
    load(slides[(active + 1) % n]);
    slides.forEach((slide, k) => {
      const on = k === active;
      slide.classList.toggle('is-active', on);
      slide.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    dots.forEach((dot, k) => dot.classList.toggle('is-active', k === active));
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    if (reducedMotion || held || document.hidden) return;
    timer = setInterval(() => show(active + 1), 5000);
  }

  function step(delta) {
    show(active + delta);
    start();
  }

  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));

  function hold() {
    held = true;
    stop();
  }
  function release() {
    held = false;
    start();
  }
  root.addEventListener('mouseenter', hold);
  root.addEventListener('mouseleave', release);
  root.addEventListener('focusin', hold);
  root.addEventListener('focusout', release);
  document.addEventListener('visibilitychange', start);

  let touchX = null;
  root.addEventListener(
    'touchstart',
    (e) => {
      touchX = e.touches[0].clientX;
    },
    { passive: true },
  );
  root.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  });

  show(0);
  start();
})();
