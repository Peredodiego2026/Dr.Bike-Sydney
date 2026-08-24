const ROUTES = [
  'home',
  'book-service',
  'service-summary',
  'payment',
  'quote-sent',
  'tracking',
  'review',
  'login',
  'my-bookings',
  'profile',
  'my-bikes',
];

const router = {
  current: 'home',
  params: {},
  _prev: null,

  navigate(route, params = {}) {
    this._prev = this.current;
    this.params = params;
    if (Object.keys(params).length) window._routerParams = params;
    window.location.hash = route;
  },

  back() {
    if (this._prev) this.navigate(this._prev);
    else this.navigate('home');
  },

  _cancelLeave(el) {
    if (!el) return;
    if (el._leaveTimer) {
      clearTimeout(el._leaveTimer);
      el._leaveTimer = null;
    }
    if (el._leaveOnEnd) {
      el.removeEventListener('transitionend', el._leaveOnEnd);
      el._leaveOnEnd = null;
    }
    el.classList.remove('screen--leaving', 'screen--leaving-go');
  },

  render() {
    const hash = window.location.hash.replace('#', '').split('?')[0] || 'home';
    const route = ROUTES.includes(hash) ? hash : 'home';
    const prevRoute = this.current;
    this._prev = prevRoute;
    this.current = route;

    const prevScreen = document.querySelector(`[data-screen="${prevRoute}"]`);
    const nextScreen = document.querySelector(`[data-screen="${route}"]`);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Tracking never participates in the exit animation - it needs an exact,
    // un-animated layout the instant it's added/removed for Leaflet's tile grid.
    const canAnimateExit =
      prevScreen &&
      prevScreen !== nextScreen &&
      !reduceMotion &&
      prevRoute !== 'tracking' &&
      route !== 'tracking';

    if (canAnimateExit) {
      this._cancelLeave(prevScreen);
      prevScreen.classList.add('screen--leaving');
      // Force a style recalc so the transition has a computed "before" state -
      // a single rAF can coalesce both class additions into one render update,
      // in which case the transition never starts and transitionend never fires.
      void prevScreen.offsetWidth;
      prevScreen.classList.add('screen--leaving-go');
      const cleanup = () => {
        this._cancelLeave(prevScreen);
        prevScreen.classList.remove('active');
      };
      // Child transitions bubble; only the screen's own transitionend counts.
      prevScreen._leaveOnEnd = (e) => {
        if (e.target === prevScreen) cleanup();
      };
      prevScreen.addEventListener('transitionend', prevScreen._leaveOnEnd);
      prevScreen._leaveTimer = setTimeout(cleanup, 400); // fallback if transitionend is missed
    }

    document.querySelectorAll('[data-screen]').forEach((el) => {
      if (el !== prevScreen || !canAnimateExit) el.classList.remove('active');
    });

    // landing.html marks itself with data-surface, and css/landing.css mounts
    // every non-home screen there as a fixed full-screen overlay. Two things
    // follow from that: the marketing page behind it must stop scrolling, and
    // "scroll the new screen into view" no longer means anything - the overlay
    // already fills the viewport, what has to go back to the top is its own
    // scrollbar. The mobile SPA sets no data-surface, so nothing changes there.
    const isLanding = document.body.dataset.surface === 'landing';
    const isOverlay = isLanding && route !== 'home';
    if (isLanding) {
      document.documentElement.classList.toggle('drbike-wizard-open', isOverlay);
    }

    if (nextScreen) {
      // If this screen is mid-exit from an interrupted transition, cancel that
      // pending cleanup or it would strip the 'active' we are about to add.
      this._cancelLeave(nextScreen);
      nextScreen.classList.add('active');
      // Nothing here ever moved the viewport to the new screen. On the SPA
      // that's invisible (the screen IS the viewport), but on landing.html
      // these same screens sat inside one long marketing page - switching
      // to "book-service" left the user wherever they'd scrolled to (as far
      // down as the footer newsletter box), on every step of the wizard,
      // not just on entry. scrollIntoView brings the *new* screen to the
      // top regardless of where it lives in the surrounding page. Landing now
      // takes the overlay branch below instead; this path is the SPA's, plus
      // landing's return to "home".
      if (prevRoute !== route) {
        if (isOverlay) nextScreen.scrollTop = 0;
        else
          nextScreen.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }

    // Fire screen-change event so app.js can react
    document.dispatchEvent(
      new CustomEvent('screenchange', { detail: { route, prev: this._prev } })
    );
  },

  init() {
    window.addEventListener('hashchange', () => this.render());
    this.render();
  },
};

window.router = router;
export default router;
