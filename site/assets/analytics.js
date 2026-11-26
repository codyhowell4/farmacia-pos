// Farmacia Apolo — Google Analytics 4 for the public website.
//
// - gtag config runs immediately (events queue in dataLayer); gtag.js itself
//   is fetched after first paint so it never blocks rendering.
// - page_view is sent by the config call (static pages: one per load).
// - button_click on every <button>/<a> click: button_label (visible text or
//   data-track-label) + button_location (page_section, e.g. inicio_hero).
// - agendar_consulta_click / sign_up_click / login_click on those CTAs.
// - window.apoloTrack(event, params) for tienda.js / site.js events.
//
// PRIVACY (LFPDPPP): never send names, emails, phones, CURP, product names
// or health data. Labels are page copy only; anything inside a form field,
// the login dialog inputs or the cart lines is never read. Labels that look
// like an email/phone are dropped.
(function () {
  'use strict';
  var ID = 'G-0V3V4H1RMF';
  // Visitor tapped "Rechazar" in the cookie notice (cookies.js): official
  // opt-out flag on, gtag.js never loaded, no events queued.
  var rejected = function () {
    try { if (localStorage.getItem('apolo_cookies') === 'rejected') window['ga-disable-' + ID] = true; } catch (e) { /* noop */ }
    return window['ga-disable-' + ID] === true;
  };
  if (rejected()) {
    window.apoloTrack = function () {};
    return;
  }
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  var debug = /[?&]debug_mode=1\b/.test(location.search);
  try { if (localStorage.getItem('apolo_ga_debug') === '1') debug = true; } catch (e) { /* noop */ }

  var page = document.body ? document.body.getAttribute('data-page') : null;
  page = page || (location.pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '_') || 'inicio');

  // page_location without query/hash: no PII can ever ride along in a URL.
  var cleanLocation = location.origin + location.pathname;
  window.gtag('js', new Date());
  var cfg = {
    page_location: cleanLocation,
    page_title: document.title,
    currency: 'MXN',
  };
  if (debug) cfg.debug_mode = true;
  window.gtag('config', ID, cfg);

  var ready = false;
  var readyCbs = [];
  function onReady(cb) { if (ready) cb(); else readyCbs.push(cb); }
  function loadGtag() {
    if (rejected() || document.getElementById('gtag-js')) return;
    var s = document.createElement('script');
    s.id = 'gtag-js';
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    s.onload = function () { ready = true; readyCbs.splice(0).forEach(function (cb) { cb(); }); };
    document.head.appendChild(s);
  }
  // Performance: gtag.js costs ~0.5-0.9 s of main-thread time on phones, so
  // it loads on the first interaction (or 5 s after load), never during the
  // first render. Events queue in dataLayer meanwhile, nothing is lost.
  var triggers = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  function kick(e) {
    // A tap on the cookie notice is not "first use": wait for the choice
    // (Rechazar must never load gtag.js).
    if (e && e.target && e.target.closest && e.target.closest('.ck-banner')) return;
    if (rejected()) return;
    triggers.forEach(function (t) { window.removeEventListener(t, kick, { passive: true }); });
    loadGtag();
  }
  triggers.forEach(function (t) { window.addEventListener(t, kick, { passive: true }); });
  window.addEventListener('load', function () { setTimeout(function () { kick(); }, 5000); });

  var PII = /@|\d{7,}|\+\d/;

  function track(name, params) {
    if (rejected()) return;
    var p = params || {};
    if (debug) p.debug_mode = true;
    window.gtag('event', name, p);
  }
  window.apoloTrack = track;

  function labelOf(el) {
    var l = el.getAttribute('data-track-label');
    if (!l) l = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!l) l = el.getAttribute('aria-label') || '';
    l = l.replace(/\s*\(\d+\)\s*$/, '').slice(0, 80);
    if (!l || PII.test(l)) l = el.id || el.getAttribute('data-track-id') || 'sin_etiqueta';
    return l;
  }

  function locationOf(el) {
    var sec = el.closest('[data-section]');
    var name = sec ? sec.getAttribute('data-section') : 'contenido';
    return page + '_' + name;
  }

  // A link that leaves the page before gtag.js is ready would drop its
  // events: hold the navigation until gtag has sent them (max 1 s).
  function holdNavigation(e, el) {
    if (ready || e.defaultPrevented || el.tagName !== 'A') return null;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
    var href = el.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^(tel|mailto|javascript):/i.test(href)) return null;
    if (el.target && el.target !== '_self') return null;
    if (el.hasAttribute('download') || el.hasAttribute('data-open-login')) return null;
    e.preventDefault();
    var done = false;
    var go = function () { if (!done) { done = true; location.href = el.href; } };
    setTimeout(go, 1000);
    return go;
  }

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a, button, [role="button"]') : null;
    if (!el || el.hasAttribute('data-track-skip')) return;
    var label = labelOf(el);
    var loc = locationOf(el);
    var p = { button_label: label, button_location: loc };
    var norm = label.toLowerCase();
    var names = ['button_click'];
    if (/^agendar (mi )?consulta$/.test(norm)) names.push('agendar_consulta_click');
    if (norm === 'crear cuenta gratis') names.push('sign_up_click');
    if (norm === 'iniciar sesión' || norm === 'inicia sesión') names.push('login_click');
    if (rejected()) return;
    var go = holdNavigation(e, el);
    if (go) {
      loadGtag();
      var pending = names.length;
      var cb = function () { if (--pending <= 0) go(); };
      names.forEach(function (n) {
        var q = {};
        for (var k in p) q[k] = p[k];
        q.event_callback = cb;
        q.event_timeout = 900;
        track(n, q);
      });
      onReady(function () { setTimeout(go, 400); });
    } else {
      names.forEach(function (n) { track(n, p); });
    }
  }, false);
})();
