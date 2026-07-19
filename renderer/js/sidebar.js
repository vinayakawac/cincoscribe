/* ===== CincoScribe Sidebar Logic ===== */

const Sidebar = {
  init() {
    // Desktop collapse toggle
    document.querySelectorAll('.btn-collapse').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('collapsed');
      });
    });

    // Desktop Pin toggle
    const pinBtn = document.getElementById('btn-pin-sidebar');
    const sidebar = document.getElementById('sidebar-desktop');
    if (pinBtn && sidebar) {
      const isPinned = localStorage.getItem('cincoscribe_sidebar_pinned') === 'true';
      if (isPinned) {
        sidebar.classList.add('pinned');
      }
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentlyPinned = sidebar.classList.toggle('pinned');
        localStorage.setItem('cincoscribe_sidebar_pinned', currentlyPinned);
      });
    }

    // Mobile menu open
    const menuBtn = document.getElementById('btn-mobile-menu');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        this.openMobile();
      });
    }

    // Desktop expand
    const expandBtn = document.getElementById('btn-expand-desktop');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.remove('collapsed');
      });
    }

    // Mobile close
    const closeBtn = document.getElementById('btn-close-mobile');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeMobile());
    }

    // Overlay click
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => this.closeMobile());
    }

    // Nav link clicks (both desktop & mobile)
    document.querySelectorAll('[data-nav]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = link.getAttribute('data-nav');
        Router.navigate(route);
        this.closeMobile();
      });
    });

    // Note: User profile and dropdown have been removed in favor of a direct settings link.
  },

  syncUserProfile() {
    // No-op since profile info is no longer displayed.
  },

  openMobile() {
    document.getElementById('sidebar-mobile')?.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('visible');
    document.body.style.overflow = 'hidden';
  },

  closeMobile() {
    document.getElementById('sidebar-mobile')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('visible');
    document.body.style.overflow = '';
  },

  setActive(route) {
    document.querySelectorAll('[data-nav]').forEach(link => {
      const isActive = link.getAttribute('data-nav') === route;
      link.classList.toggle('active', isActive);
    });
  },
};
