/* Tarteel House — main.js
   Lightweight progressive enhancement. No dependencies. */

document.addEventListener('DOMContentLoaded', () => {

  /* ----- Mobile nav toggle ----- */
  const navToggle = document.getElementById('nav-toggle');
  const navMenu   = document.getElementById('nav-menu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });
  }

  /* ----- Active nav link ----- */
  const navLinks = document.querySelectorAll('.nav__link');
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });

  /* ----- Scroll-reveal animations ----- */
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReduced && 'IntersectionObserver' in window) {

    /* -- Section-level reveal -- */
    const sections = document.querySelectorAll('main > section');

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          sectionObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    sections.forEach((section, i) => {
      /* First section is always visible — skip it */
      if (i === 0) {
        section.classList.add('is-revealed');
        return;
      }
      section.classList.add('reveal-section');
      sectionObserver.observe(section);
    });

    /* -- Staggered reveal — teacher cards, pricing cards & trust stats -- */
    const STAGGER_SELECTORS = [
      '.teacher-card',
      '.pricing-card',
      '.trust-stats__item',
    ];

    const cardObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          cardObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    STAGGER_SELECTORS.forEach(selector => {
      document.querySelectorAll(selector).forEach((card, i) => {
        card.classList.add('reveal-card');
        card.style.transitionDelay = `${i * 80}ms`;
        cardObserver.observe(card);
      });
    });

    /* -- Trust stats count-up -- */
    const statValues = document.querySelectorAll('.trust-stats__value[data-count-to]');

    const setStatValue = (el, value) => {
      const suffix = el.dataset.countSuffix || '';
      el.textContent = `${value}${suffix}`;
    };

    const animateStatValue = (el) => {
      const target = Number(el.dataset.countTo || 0);
      const duration = 1100;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setStatValue(el, Math.round(target * eased));

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          setStatValue(el, target);
        }
      };

      requestAnimationFrame(tick);
    };

    if (statValues.length) {
      const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;

          entry.target
            .querySelectorAll('.trust-stats__value[data-count-to]')
            .forEach(value => {
              setStatValue(value, 0);
              animateStatValue(value);
            });

          statsObserver.unobserve(entry.target);
        });
      }, { threshold: 0.4 });

      document.querySelectorAll('.trust-stats').forEach(section => {
        statsObserver.observe(section);
      });
    }

  }

  /* ----- Page transitions -----
     Intercept internal link clicks, fade the body out, then navigate.
     Browser back/forward is handled via the pageshow event, which fires
     on fresh loads AND on bfcache restores — so we always strip the
     leaving state when a page becomes visible. */
  if (!prefersReduced) {

    window.addEventListener('pageshow', () => {
      document.body.classList.remove('is-leaving');
    });

    const isInternalNav = (e, anchor) => {
      if (e.defaultPrevented) return false;
      if (e.button !== 0) return false;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
      if (anchor.target && anchor.target !== '' && anchor.target !== '_self') return false;
      if (anchor.hasAttribute('download')) return false;

      const href = anchor.getAttribute('href');
      if (!href) return false;
      if (href.startsWith('#'))       return false;
      if (href.startsWith('mailto:')) return false;
      if (href.startsWith('tel:'))    return false;

      let url;
      try { url = new URL(anchor.href, window.location.href); }
      catch (err) { return false; }

      if (url.origin !== window.location.origin) return false;

      /* Same-page hash link (e.g. about.html#approach while on about.html) */
      if (url.pathname === window.location.pathname && url.hash && !url.search) return false;

      return true;
    };

    document.addEventListener('click', (e) => {
      const anchor = e.target.closest('a[href]');
      if (!anchor) return;
      if (!isInternalNav(e, anchor)) return;

      e.preventDefault();
      const destination = anchor.href;
      document.body.classList.add('is-leaving');
      window.setTimeout(() => {
        window.location.href = destination;
      }, 250);
    });

  }

});
