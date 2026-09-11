// "Instalar app" prompt for the Farmacia Apolo customer app.
// Android/desktop Chrome: one-tap install via the beforeinstallprompt event.
// iOS Safari: Apple allows no programmatic install, so it shows instructions
// (Compartir → Agregar a pantalla de inicio) instead.
// Self-contained: injects its own styles and banner. Dismissal is remembered
// for 7 days so it doesn't nag, and it never shows when already installed.
(function () {
  'use strict';

  var DISMISS_KEY = 'apollo_install_dismissed_at';
  var DISMISS_DAYS = 7;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function isIOS() {
    var ua = window.navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function recentlyDismissed() {
    try {
      var at = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      return at && (Date.now() - at) < DISMISS_DAYS * 864e5;
    } catch (e) { return false; }
  }

  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    maybeShowBanner('android');
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    removeBanner();
  });

  function maybeShowBanner(kind) {
    if (isStandalone() || recentlyDismissed()) return;
    if (document.getElementById('apollo-install-banner')) return;
    setTimeout(function () { showBanner(kind); }, 2500);
  }

  function removeBanner() {
    var b = document.getElementById('apollo-install-banner');
    if (b) b.remove();
  }

  function showBanner(kind) {
    if (isStandalone() || recentlyDismissed()) return;
    removeBanner();

    if (!document.getElementById('apollo-install-style')) {
      var style = document.createElement('style');
      style.id = 'apollo-install-style';
      style.textContent =
        '#apollo-install-banner{position:fixed;left:16px;right:16px;bottom:76px;z-index:900;' +
        'display:flex;align-items:center;gap:10px;background:rgba(20,27,94,.97);' +
        'border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:12px 14px;color:#fff;' +
        'box-shadow:0 10px 30px rgba(0,0,0,.35);animation:apolloInstallIn .35s ease;}' +
        '#apollo-install-banner .ai-text{flex:1;display:flex;flex-direction:column;gap:2px;' +
        'font-size:.82rem;line-height:1.35;}' +
        '#apollo-install-banner .ai-text strong{font-size:.9rem;}' +
        '#apollo-install-banner .ai-btn{background:linear-gradient(135deg,#46AC78,#359268);' +
        'color:#fff;border:none;border-radius:10px;padding:8px 16px;font-weight:700;' +
        'font-size:.85rem;cursor:pointer;white-space:nowrap;}' +
        '#apollo-install-banner .ai-close{background:transparent;border:none;' +
        'color:rgba(255,255,255,.6);font-size:1rem;cursor:pointer;padding:4px;}' +
        '@keyframes apolloInstallIn{from{transform:translateY(16px);opacity:0}' +
        'to{transform:none;opacity:1}}';
      document.head.appendChild(style);
    }

    var banner = document.createElement('div');
    banner.id = 'apollo-install-banner';
    banner.innerHTML = kind === 'android'
      ? '<div class="ai-text"><strong>Instala la app de Farmacia Apolo</strong>' +
        '<span>Accede más rápido desde tu pantalla de inicio.</span></div>' +
        '<button class="ai-btn" id="apollo-install-go">Instalar</button>' +
        '<button class="ai-close" id="apollo-install-close" aria-label="Cerrar">✕</button>'
      : '<div class="ai-text"><strong>Guarda la app en tu iPhone</strong>' +
        '<span>Toca <b>Compartir</b> y luego <b>«Agregar a pantalla de inicio»</b>.</span></div>' +
        '<button class="ai-close" id="apollo-install-close" aria-label="Cerrar">✕</button>';
    document.body.appendChild(banner);

    document.getElementById('apollo-install-close').addEventListener('click', function () {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
      removeBanner();
    });

    var go = document.getElementById('apollo-install-go');
    if (go) {
      go.addEventListener('click', function () {
        if (!deferredPrompt) return;
        var p = deferredPrompt;
        deferredPrompt = null;
        p.prompt();
        p.userChoice.then(removeBanner, removeBanner);
      });
    }
  }

  // iOS never fires beforeinstallprompt — show the instructions variant.
  if (isIOS()) maybeShowBanner('ios');
})();
