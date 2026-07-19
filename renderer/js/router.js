/* ===== CincoScribe Hash-based SPA Router ===== */

const Router = {
  routes: {},
  currentRoute: null,

  register(hash, renderFn) {
    this.routes[hash] = renderFn;
  },

  init() {
    window.addEventListener('hashchange', () => this._resolve());
    this._resolve();
  },

  _resolve() {
    let hash = window.location.hash || '#dashboard/transcribe';
    let route = hash.replace('#', '');
    if (route.startsWith('/')) {
      route = route.slice(1);
    }



    if (this.routes[route]) {
      this.currentRoute = route;
      const main = document.getElementById('page-content');
      
      if (main) {
        main.innerHTML = '';
        this.routes[route](main);
      }
      Sidebar.setActive(route);

      if (window.updateTopbarTitle) {
        window.updateTopbarTitle(route);
      }
    } else {
      window.location.hash = '#dashboard/transcribe';
    }
  },

  navigate(route) {
    let r = route;
    if (r.startsWith('/')) {
      r = r.slice(1);
    }
    window.location.hash = '#/' + r;
  },
};
