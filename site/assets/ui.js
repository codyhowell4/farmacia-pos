// Farmacia Apolo — mobile UI behaviour for the public site (all pages):
// hamburger drawer (aria-expanded, focus trap, Esc), bottom action bar
// visibility, and "Ver todo" collapse for long plan feature lists.
// Everything is inert on desktop (the elements are display:none there).
(function () {
  'use strict';
  var mq = window.matchMedia('(max-width: 767px)');
  var header = document.querySelector('header[data-section="header"]');

  function setHeaderVar() {
    if (header) document.documentElement.style.setProperty('--hdr-h', header.getBoundingClientRect().height + 'px');
  }
  setHeaderVar();
  window.addEventListener('resize', setHeaderVar);

  // ---------- Drawer ----------
  var burger = document.querySelector('.m-burger');
  var drawer = document.getElementById('menu-movil');
  var backdrop = document.querySelector('.m-backdrop[data-for="menu-movil"]');
  var lastFocus = null;

  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetParent !== null; }
    );
  }

  function openMenu() {
    if (!drawer) return;
    setHeaderVar();
    lastFocus = document.activeElement;
    drawer.hidden = false;
    backdrop.hidden = false;
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Cerrar menú');
    document.body.classList.add('no-scroll');
    requestAnimationFrame(function () { drawer.classList.add('is-open'); });
    var f = focusables(drawer);
    if (f[0]) f[0].focus();
  }
  function closeMenu(restore) {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('is-open');
    drawer.hidden = true;
    backdrop.hidden = true;
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Abrir menú');
    document.body.classList.remove('no-scroll');
    if (restore !== false && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  window.apoloCloseMenu = closeMenu;

  if (burger && drawer) {
    burger.addEventListener('click', function () {
      if (burger.getAttribute('aria-expanded') === 'true') closeMenu(); else openMenu();
    });
    backdrop.addEventListener('click', function () { closeMenu(); });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (drawer.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
      if (e.key !== 'Tab') return;
      // Focus trap: burger + drawer items
      var items = [burger].concat(focusables(drawer));
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (items.indexOf(document.activeElement) === -1) { e.preventDefault(); first.focus(); }
    });
    mq.addEventListener ? mq.addEventListener('change', function () { if (!mq.matches) closeMenu(false); }) : null;
  }

  // ---------- Bottom action bar ----------
  var bar = document.querySelector('.m-bottom-bar');
  if (bar) {
    document.body.classList.add('has-bottom-bar');
    var footer = document.querySelector('footer[data-section="footer"]');
    var typing = false;
    var footerVisible = false;
    // Hidden while the hero (with its own full-width CTAs) is on screen, so
    // it never covers them above the fold; also over the footer and while
    // typing in a form (keyboard open).
    var heroVisible = true;
    var update = function () { bar.classList.toggle('is-hidden', typing || footerVisible || heroVisible); };
    var hero = document.querySelector('section[data-section="hero"]');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        heroVisible = entries[0].isIntersecting;
        update();
      }, { rootMargin: '0px 0px -35% 0px' }).observe(hero);
    } else {
      heroVisible = false;
    }
    update();
    document.addEventListener('focusin', function (e) {
      if (e.target.matches && e.target.matches('input, textarea, select')) { typing = true; update(); }
    });
    document.addEventListener('focusout', function (e) {
      if (e.target.matches && e.target.matches('input, textarea, select')) {
        setTimeout(function () {
          var a = document.activeElement;
          typing = !!(a && a.matches && a.matches('input, textarea, select'));
          update();
        }, 50);
      }
    });
    if (footer && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        footerVisible = entries[0].isIntersecting;
        update();
      }, { rootMargin: '0px 0px -40px 0px' }).observe(footer);
    }
  }

  // ---------- "Ver todo" for long plan feature lists ----------
  var lists = document.querySelectorAll('main article ul');
  Array.prototype.forEach.call(lists, function (ul, i) {
    var n = ul.children.length;
    if (n <= 4) return;
    if (!ul.id) ul.id = 'lista-beneficios-' + (i + 1);
    ul.classList.add('m-collapsed');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'm-more m-only';
    btn.setAttribute('aria-controls', ul.id);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('data-track-label', 'ver_todo_beneficios');
    btn.textContent = 'Ver todo (' + n + ')';
    btn.addEventListener('click', function () {
      var open = ul.classList.toggle('m-collapsed') === false;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Ver menos' : 'Ver todo (' + n + ')';
    });
    ul.parentNode.insertBefore(btn, ul.nextSibling);
  });
})();
