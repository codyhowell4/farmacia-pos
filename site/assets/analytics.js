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

  function loadGtag() {
    if (document.getElementById('gtag-js')) return;
    var s = document.createElement('script');
    s.id = 'gtag-js';
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
  }
  // After first paint: two animation frames, then idle (or a timeout).
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      if ('requestIdleCallback' in window) window.requestIdleCallback(loadGtag, { timeout: 2000 });
      else setTimeout(loadGtag, 1);
    });
  });

  var PII = /@|\d{7,}|\+\d/;

  function track(name, params) {
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

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a, button, [role="button"]') : null;
    if (!el || el.hasAttribute('data-track-skip')) return;
    var label = labelOf(el);
    var loc = locationOf(el);
    track('button_click', { button_label: label, button_location: loc });
    var norm = label.toLowerCase();
    if (/^agendar (mi )?consulta$/.test(norm)) track('agendar_consulta_click', { button_label: label, button_location: loc });
    if (norm === 'crear cuenta gratis') track('sign_up_click', { button_label: label, button_location: loc });
    if (norm === 'iniciar sesión' || norm === 'inicia sesión') track('login_click', { button_label: label, button_location: loc });
  }, true);
})();
