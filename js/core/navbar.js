/* ============================================================
   Shared Navbar Controller — San Isidro College Reservation System
   Core Layer (js/core/navbar.js)
   Guarantees a single mobile hamburger menu listener and scroll
   state handler across index.html and booking.html.
   ============================================================ */

(function () {
  'use strict';

  if (window.__sicNavInit) return;
  window.__sicNavInit = true;

  function initNavbar() {
    const navbar    = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navLinks  = document.getElementById('navLinks');

    if (navbar) {
      window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
      });
    }

    if (navToggle && navLinks && !navToggle.dataset.bound) {
      navToggle.dataset.bound = '1';
      navToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = navLinks.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', String(isOpen));
      });

      navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          navLinks.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
        });
      });

      document.addEventListener('click', (e) => {
        if (
          navLinks.classList.contains('open') &&
          !navLinks.contains(e.target) &&
          !navToggle.contains(e.target)
        ) {
          navLinks.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbar);
  } else {
    initNavbar();
  }
})();
