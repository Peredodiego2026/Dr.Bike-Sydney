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
    this._prev = this.current;
    this.current = route;

    document.querySelectorAll('[data-screen]').forEach(el => {
      el.classList.remove('active');
    });

    const screen = document.querySelector(`[data-screen="${route}"]`);
    if (screen) screen.classList.add('active');

    // Fire screen-change event so app.js can react
    document.dispatchEvent(new CustomEvent('screenchange', { detail: { route, prev: this._prev } }));
  },

  init() {
    window.addEventListener('hashchange', () => this.render());
    this.render();
  },
};

window.router = router;
export default router;
