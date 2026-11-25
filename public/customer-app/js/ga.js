// ============================================================
// Google Analytics 4 — consent-gated (Aviso de Privacidad v3 §8)
//
// Active ONLY for a logged-in customer who (a) signed the current aviso
// (v3: the secondary-purposes checkbox was shown again, so consent is
// known) and (b) accepted secondary purposes (customers.marketing_opt_out
// === false). Nothing loads before login or for anyone else; logging out
// or opting out stops it and deletes the _ga cookies.
//
// Never sent: names, emails, phones, CURP, medicine names, readings or any
// health data; no user_id; no Google signals / ad personalization.
// ============================================================

const MEASUREMENT_ID = 'G-VZTY34XFT0';
let enabled = false;
let loaded = false;
// login / sign_up happen before consent is evaluated: hold them until
// analytics is enabled for this session; drop them otherwise.
let pending = [];
let currentPath = '/inicio';

const PATHS = {
  inicio: '/inicio', monedas: '/monedas', ahorro: '/ahorro', chequeo: '/chequeo',
  'salud:control': '/salud/mi-control', 'salud:bienestar': '/salud/bienestar', 'salud:citas': '/salud/citas', 'salud:recetas': '/salud/recetas',
  consulta: '/consulta', 'consulta:en-persona': '/consulta/en-persona', 'consulta:video': '/consulta/video',
  shop: '/tienda', store: '/tienda', orders: '/pedidos', membresias: '/membresias', pulsera: '/pulsera',
  settings: '/perfil', 'mis-datos': '/perfil', 'emergency-id': '/perfil/emergencia', caregiver: '/perfil/familia',
  guides: '/guias', privacidad: '/privacidad', 'privacidad-datos': '/privacidad/mis-datos',
};

// Screens where button text may carry health data (readings, mood, meds,
// expediente): only generic UI labels pass; anything else → 'opcion'.
const SENSITIVE_PATHS = /^\/(salud|perfil|chequeo)/;
const GENERIC_LABELS = new Set(['anotar', 'guardar', 'editar', 'agregar', 'tomé', 'tome', 'empezar', 'cerrar', 'cancelar', 'continuar',
  'mi control', 'bienestar', 'citas', 'recetas', 'actualizar peso', 'apartar mi resurtido', 'apartar', 'agregar medicina', 'quitar medicina',
  'agendar', 'volver', '+ nueva', '+ subir', 'subir', 'ver', 'eliminar', 'confirmar', 'enviar', 'aceptar', 'siguiente', 'atrás', 'listo']);

function cleanLabel(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]').replace(/\+?\d[\d\s-]{6,}\d/g, '[número]');
  return s.slice(0, 40);
}

function loadGtag() {
  if (loaded) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    debug_mode: /[?&]ga_debug=1\b/.test(location.search),
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(s);
}

function clearGaCookies() {
  document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_ga/.test(n)).forEach((n) => {
    const host = location.hostname;
    [host, '.' + host, '.' + host.split('.').slice(-3).join('.'), '.' + host.split('.').slice(-2).join('.')].forEach((d) => {
      document.cookie = `${n}=; Max-Age=0; path=/; domain=${d}`;
    });
    document.cookie = `${n}=; Max-Age=0; path=/`;
  });
}

// Called on every auth / consent change.
export function setAnalyticsConsent({ loggedIn, signedCurrentAviso, marketingOptOut }) {
  const allow = !!loggedIn && signedCurrentAviso === true && marketingOptOut === false;
  if (allow === enabled) return;
  enabled = allow;
  if (allow) {
    window[`ga-disable-${MEASUREMENT_ID}`] = false;
    loadGtag();
    pending.forEach(([n, p]) => send(n, p));
    pending = [];
  } else {
    window[`ga-disable-${MEASUREMENT_ID}`] = true;
    clearGaCookies();
    pending = [];
  }
}

function send(name, params = {}) {
  if (!enabled || !window.gtag) return;
  window.gtag('event', name, params);
}

// page_view with a virtual path (no titles: they can contain names)
export function trackPage(key) {
  currentPath = PATHS[key] || `/${String(key || 'inicio').replace(/[^a-z0-9-]/gi, '')}`;
  send('page_view', { page_path: currentPath, page_location: `${location.origin}/app${currentPath}`, page_title: currentPath });
}

export const track = {
  login: () => (enabled ? send('login', { method: 'password' }) : pending.push(['login', { method: 'password' }])),
  signUp: () => (enabled ? send('sign_up', { method: 'password' }) : pending.push(['sign_up', { method: 'password' }])),
  appointmentBooked: (type) => send('appointment_booked', { type }),
  joinQueue: () => send('join_queue', {}),
  checkupBooked: (tests) => send('checkup_booked', { test: [].concat(tests || []).join(',') }),
  // items: [{ item_id, item_category, quantity }] — no names
  purchase: ({ value, items, transactionId }) => send('purchase', {
    currency: 'MXN', value: Math.round(Number(value || 0) * 100) / 100, transaction_id: transactionId || undefined,
    item_count: (items || []).reduce((n, i) => n + (Number(i.quantity) || 1), 0),
    items: (items || []).map((i) => ({ item_id: String(i.item_id || ''), item_category: i.item_category || undefined, quantity: Number(i.quantity) || 1 })),
  }),
  coinsEarned: (action, amount) => send('coins_earned', { action, amount: Number(amount) || 0 }),
  rewardRedeemed: (tier) => send('reward_redeemed', { tier }),
  membershipStart: (plan) => send('membership_start', { plan }),
  breathingComplete: () => send('breathing_session_complete', {}),
  moodCheckin: () => send('mood_checkin', {}),   // never the mood value
};

// button_click on every button (and the bottom-nav / menu links)
export function startClickTracking() {
  if (window.__apoloGaClicks) return;
  window.__apoloGaClicks = true;
  document.addEventListener('click', (e) => {
    if (!enabled) return;
    const el = e.target.closest('button, [role="button"], a.nav-item, a.menu-item');
    if (!el || el.disabled) return;
    let label = cleanLabel(el.getAttribute('data-ga-label') || el.getAttribute('aria-label') || el.innerText || el.textContent);
    if (!label) return;
    if (SENSITIVE_PATHS.test(currentPath) && !el.hasAttribute('data-ga-label') && !GENERIC_LABELS.has(label.toLowerCase())) label = 'opcion';
    if (el.closest('[data-ga-redact]')) label = 'opcion';
    send('button_click', { button_label: label, button_location: currentPath });
  }, true);
}
