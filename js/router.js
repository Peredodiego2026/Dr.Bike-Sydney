const ROUTES = [
  'home', 'book-service', 'service-summary', 'payment',
  'tracking', 'review', 'login', 'my-bookings', 'profile', 'my-bikes',
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

  render() {
    const hash = window.location.hash.replace('#', '').split('?')[0] || 'home';
    const route = ROUTES.includes(hash) ? hash : 'home';
    const prev = this.current;
    this._prev = prev;
    this.current = route;

    const duration = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--screen-transition-duration')) || 250;

    // Exit animation on current screen
    if (prev && prev !== route) {
      const oldScreen = document.querySelector(`[data-screen="${prev}"]`);
      if (oldScreen) {
        oldScreen.style.transition = `transform ${duration}ms var(--ease-out, cubic-bezier(0.4,0,0.2,1)), opacity ${duration}ms ease`;
        oldScreen.style.transform = 'scale(0.96) translateZ(0)';
        oldScreen.style.opacity = '0';
      }
    }

    // Show new screen after exit animation
    setTimeout(() => {
      document.querySelectorAll('[data-screen]').forEach(el => {
        el.classList.remove('active');
        el.style.transform = '';
        el.style.opacity = '';
        el.style.transition = '';
      });

      const screen = document.querySelector(`[data-screen="${route}"]`);
      if (screen) {
        screen.classList.add('active');
        if (prev && prev !== route) {
          screen.style.transition = `transform ${duration}ms var(--ease-out, cubic-bezier(0.4,0,0.2,1)), opacity ${duration}ms ease`;
          screen.style.transform = 'translateX(20px)';
          screen.style.opacity = '0';
          screen.style.boxShadow = 'var(--elevation-1)';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              screen.style.transform = 'translateX(0)';
              screen.style.opacity = '1';
              setTimeout(() => {
                screen.style.transition = '';
                screen.style.boxShadow = '';
              }, duration);
            });
          });
        }
      }

      document.dispatchEvent(new CustomEvent('screenchange', { detail: { route, prev } }));
    }, prev && prev !== route ? duration : 0);
  },

  init() {
    window.addEventListener('hashchange', () => this.render());
    this.render();
  },
};

window.router = router;
export default router;
