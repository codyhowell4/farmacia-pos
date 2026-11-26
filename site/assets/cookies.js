// Farmacia Apolo — aviso de cookies del sitio público (notice-based).
//
// - Shows a small banner until the visitor chooses; the choice is kept in
//   localStorage ('apolo_cookies' = 'accepted' | 'rejected').
// - Google Analytics keeps running by default. "Rechazar" sets Google's
//   official opt-out flag (window['ga-disable-<ID>']) so nothing else is
//   sent from this page, and analytics.js / publicAnalytics.js never load
//   GA again in this browser.
// - Any element with [data-cookie-reset] (on /aviso-de-privacidad) clears
//   the choice and shows the banner again.
// - The banner sits above the mobile bottom bar / tienda cart bar.
(function () {
  'use strict';
  if (window.__apoloCookies) return;
  window.__apoloCookies = true;
  var KEY = 'apolo_cookies';
  var GA_ID = 'G-0V3V4H1RMF';

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* noop */ } }

  if (get() === 'rejected') window['ga-disable-' + GA_ID] = true;

  var css =
    '.ck-banner{position:fixed;z-index:80;left:16px;bottom:16px;max-width:440px;box-sizing:border-box;' +
    'background:#FFFFFF;color:#141B3A;border:1px solid #E3E8F2;border-radius:16px;padding:16px;' +
    'box-shadow:0 16px 40px rgba(20,27,94,.18);font-family:"Plus Jakarta Sans",system-ui,sans-serif;' +
    'display:flex;flex-direction:column;gap:12px}' +
    '.ck-banner p{margin:0;font-size:15px;line-height:1.5}' +
    '.ck-banner a{color:#1E2A8A;font-weight:700}' +
    '.ck-actions{display:flex;gap:10px}' +
    '.ck-actions button{flex:1 1 0;min-height:44px;border-radius:12px;font:inherit;font-size:15px;font-weight:800;cursor:pointer}' +
    '.ck-accept{background:#1E2A8A;color:#FFFFFF;border:2px solid #1E2A8A}' +
    '.ck-accept:hover{background:#141B5E;border-color:#141B5E}' +
    '.ck-reject{background:#FFFFFF;color:#1E2A8A;border:2px solid #1E2A8A}' +
    '.ck-reject:hover{background:#EEF0FA}' +
    '@media (max-width:767px){.ck-banner{left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));max-width:none;padding:14px}' +
    'body.has-bottom-bar .ck-banner,body.has-cartbar .ck-banner{bottom:calc(84px + env(safe-area-inset-bottom))}' +
    '.ck-banner p{font-size:14px}.ck-banner a{display:inline-flex;min-height:44px;align-items:center}}';

  var banner = null;

  function hide() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function choose(value) {
    set(value);
    if (value === 'rejected') {
      window['ga-disable-' + GA_ID] = true;
    } else {
      window['ga-disable-' + GA_ID] = false;
    }
    hide();
  }

  function show() {
    if (banner || !document.body) return;
    if (!document.getElementById('ck-style')) {
      var st = document.createElement('style');
      st.id = 'ck-style';
      st.textContent = css;
      document.head.appendChild(st);
    }
    banner = document.createElement('div');
    banner.className = 'ck-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Aviso de cookies');
    banner.setAttribute('data-section', 'cookies');
    banner.innerHTML =
      '<p>Usamos cookies propias y de Google Analytics para medir el uso del sitio. Consulta nuestro <a href="/aviso-de-privacidad#sitio-web" data-track-skip>Aviso de privacidad</a>.</p>' +
      '<div class="ck-actions"><button type="button" class="ck-reject" data-track-skip>Rechazar</button>' +
      '<button type="button" class="ck-accept" data-track-label="cookies_aceptar">Aceptar</button></div>';
    banner.querySelector('.ck-reject').addEventListener('click', function () { choose('rejected'); });
    banner.querySelector('.ck-accept').addEventListener('click', function () { choose('accepted'); });
    document.body.appendChild(banner);
  }

  document.addEventListener('click', function (e) {
    var r = e.target && e.target.closest ? e.target.closest('[data-cookie-reset]') : null;
    if (!r) return;
    e.preventDefault();
    clear();
    show();
    var b = banner && banner.querySelector('button');
    if (b) b.focus();
  });

  window.apoloCookieChoice = get;

  function start() { if (!get()) show(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
