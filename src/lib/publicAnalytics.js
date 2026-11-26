// GA4 for the PUBLIC React routes only (/membresias, /membresia-negocios),
// which are part of the apolofarmacia.com.mx website. Staff/POS/doctor/
// admin routes never load GA (their URLs and screens can carry patient
// data — LFPDPPP / NOM-024). Mirrors site/assets/analytics.js.
//
// page_view: the Google tag sends one when it loads, and Enhanced
// Measurement ("page changes based on browser history", ON in the property)
// sends one on every client-side route change — no manual page_view here,
// that would double count.
//
// Hard privacy gate: Google's official opt-out flag window['ga-disable-<ID>']
// is set on EVERY non-public route, so once gtag is loaded nothing (not even
// Enhanced Measurement) is sent from staff screens or from
// /membresia-negocios/activar?setup=<secret token>.
const GA_ID = 'G-0V3V4H1RMF';
const PUBLIC_ROUTE = /^\/(membresias(\/terminos)?|membresia-negocios)\/?$/;
const DISABLE_FLAG = `ga-disable-${GA_ID}`;
const PII = /@|\d{7,}|\+\d/;

let loaded = false;
let clickBound = false;

export const isPublicRoute = (pathname) => PUBLIC_ROUTE.test(pathname);

// Cookie notice choice (site/assets/cookies.js, shared with the static site).
const isRejected = () => {
  try {
    return localStorage.getItem('apolo_cookies') === 'rejected';
  } catch {
    return false;
  }
};

const loadCookieNotice = () => {
  if (document.getElementById('apolo-cookies-js')) return;
  const s = document.createElement('script');
  s.id = 'apolo-cookies-js';
  s.src = '/sitio/cookies.js';
  s.defer = true;
  document.head.appendChild(s);
};

const isDebug = () => {
  try {
    return /[?&]debug_mode=1\b/.test(window.location.search) || localStorage.getItem('apolo_ga_debug') === '1';
  } catch {
    return false;
  }
};

// Set the opt-out flag for the destination URL *before* the history change,
// so Enhanced Measurement's history page_view can never fire for a
// non-public route. Installed before gtag.js, so gtag wraps these wrappers.
const guardHistory = () => {
  const gate = (url) => {
    try {
      const path = new URL(url, window.location.href).pathname;
      window[DISABLE_FLAG] = !isPublicRoute(path) || isRejected();
    } catch { /* keep current flag */ }
  };
  ['pushState', 'replaceState'].forEach((m) => {
    const orig = window.history[m];
    window.history[m] = function patched(state, title, url) {
      if (url != null) gate(url);
      return orig.apply(this, arguments);
    };
  });
  window.addEventListener('popstate', () => gate(window.location.href), true);
};

const ensureGtag = () => {
  if (loaded) return;
  loaded = true;
  guardHistory();
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, {
    page_location: window.location.origin + window.location.pathname,
    currency: 'MXN',
    ...(isDebug() ? { debug_mode: true } : {}),
  });
  const load = () => {
    if (document.getElementById('gtag-js')) return;
    const s = document.createElement('script');
    s.id = 'gtag-js';
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => (window.requestIdleCallback ? window.requestIdleCallback(load, { timeout: 2000 }) : setTimeout(load, 1))));
};

const pageName = () => window.location.pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '_') || 'inicio';

const bindClicks = () => {
  if (clickBound) return;
  clickBound = true;
  document.addEventListener('click', (e) => {
    if (!isPublicRoute(window.location.pathname) || !window.gtag || isRejected()) return;
    const el = e.target?.closest?.('a, button, [role="button"]');
    if (!el) return;
    let label = el.getAttribute('data-track-label') || (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() || el.getAttribute('aria-label') || '';
    label = label.slice(0, 80);
    if (!label || PII.test(label)) label = 'sin_etiqueta';
    const params = { button_label: label, button_location: `${pageName()}_contenido`, ...(isDebug() ? { debug_mode: true } : {}) };
    window.gtag('event', 'button_click', params);
    const n = label.toLowerCase();
    if (/^agendar (mi )?consulta$/.test(n)) window.gtag('event', 'agendar_consulta_click', params);
    if (n === 'crear cuenta gratis') window.gtag('event', 'sign_up_click', params);
    if (n === 'iniciar sesión' || n === 'inicia sesión') window.gtag('event', 'login_click', params);
  }, true);
};

// Called on every route change (App.jsx). Loads GA the first time a public
// route is shown; toggles the opt-out flag so non-public routes send nothing.
export const trackPublicPageView = (pathname) => {
  const isPublic = isPublicRoute(pathname);
  if (isPublic) loadCookieNotice();
  window[DISABLE_FLAG] = !isPublic || isRejected();
  if (!isPublic || isRejected()) return;
  ensureGtag();
  bindClicks();
};
