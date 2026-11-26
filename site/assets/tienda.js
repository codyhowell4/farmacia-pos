// Farmacia Apolo — /tienda: catálogo real (get_store_catalog), carrito y
// "Apartar mi pedido" (recoger y pagar en sucursal) vía place_store_order.
//
// - Sin sesión: catálogo sin precios + barra "Crea tu cuenta gratis".
// - Con sesión (misma cuenta Supabase que la app de clientes): precios,
//   descuento de membresía estimado y pedido. Los precios y el total
//   definitivos SIEMPRE los calcula el servidor (place_store_order).
// - La sesión de app.apolofarmacia.com.mx no se comparte con este dominio
//   (localStorage es por origen), así que aquí hay un login propio.
(function () {
  'use strict';
  var cfg = window.APOLO_SITE || {};
  var CART_KEY = 'apolo-site-cart-v1';
  var PAGE = 20;
  var MAX_QTY = 20;
  var MAX_LINES = 50;

  var CATS = [
    ['Dolor y fiebre', /(ANALG|ANGALG|ANAGES|ANTIINFLAM|DESINFLAM|ANTIPIRET|DOLOR|ARTICUL|ATICUL|RELAJANTE|PARACETAMOL|IBUPROFENO|NAPROXENO|DICLOFENACO|METAMIZOL|KETOROLACO|ACIDO MEFENAMICO)/],
    ['Gripe y tos', /(GRIP|ANTITUS|EXPECTOR|ESPECTOR|MUCOLIT|ANTIHISTAM|ANTIISTAM|ANTISTAM|NASAL|BRONCO|BROCOD|RESFRIADO|TOS\b|LORATADINA|AMBROXOL)/],
    ['Estómago', /(DIGEST|ANTIACID|ESPASM|ESPAM|ANTIDIARR|INTESTIN|LAXANTE|EMET|PROCTO|FLATUL|ESTOMAG|OMEPRAZOL|DIARREA|ELECTROLIT|SUERO)/],
    ['Vitaminas', /(VITAMIN|SUPLEMENT|SUMPELEM|MULTIVIT)/],
    ['Cuidado personal', /(BELLEZ|BELLZA|HIGIEN|HIGEI|ASEO|COSMET|DERMATO|ODONTO|REPELENT|SALUD SEXUAL|GINECO|DESODORANTE|SHAMPOO|JABON|CREMA|BUCAL|DENTAL)/],
    ['Bebé', /(BEBE|PANAL|INFANTIL|PEDIATRIC)/],
    ['Primeros auxilios', /(CURACI|CURACION|ANTISEPT|UNGUENTO|VENDA|GASA|ALGODON|ADHESIV|CUBREBOCAS|ALCOHOL|AGUA OXIGENADA|PROTECCION)/],
  ];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var fmt = function (n) {
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var norm = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  };
  var escHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // GA4 (analytics.js). Only item ids + categories, never product names.
  var track = function (name, params) {
    try { if (window.apoloTrack) window.apoloTrack(name, params); } catch (e) { /* never break the store */ }
  };
  var catSlug = function (c) { return norm(c).toLowerCase().replace(/[^a-z0-9]+/g, '_'); };
  var gaItem = function (it, qty) {
    var o = { item_id: it.id, item_category: it.cat };
    if (state.signedIn && it.price != null) o.price = Number(it.price);
    if (qty) o.quantity = qty;
    return o;
  };
  var lastListKey = null;
  function trackList(list) {
    var key = state.cat + '|' + state.query;
    if (key === lastListKey || !list.length) return;
    lastListKey = key;
    track('view_item_list', {
      item_list_id: catSlug(state.cat),
      item_list_name: state.cat,
      items: list.slice(0, state.shown).map(function (it) { return gaItem(it); }),
    });
  }

  var sb = null;
  var state = {
    items: [],
    byId: {},
    signedIn: false,
    isCustomer: false,
    discount: 0,
    user: null,
    cat: 'Todos',
    query: '',
    shown: PAGE,
    cart: loadCart(),
    placing: false,
  };

  function loadCart() {
    try {
      var c = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
      return c && typeof c === 'object' ? c : {};
    } catch (e) {
      return {};
    }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch (e) { /* private mode */ }
  }

  function categorize(item) {
    var hay = norm(item.department) + ' | ' + norm(item.name) + ' | ' + norm(item.use);
    var dep = norm(item.department);
    for (var i = 0; i < CATS.length; i++) {
      if (dep && CATS[i][1].test(dep)) return CATS[i][0];
    }
    for (var j = 0; j < CATS.length; j++) {
      if (CATS[j][1].test(hay)) return CATS[j][0];
    }
    return 'Farmacia';
  }

  // ---------- Catálogo ----------
  function loadCatalog() {
    var msg = $('[data-grid-msg]');
    return sb.rpc('get_store_catalog', { p_org_id: cfg.orgId }).then(function (res) {
      if (res.error) throw res.error;
      var d = res.data || {};
      state.signedIn = !!d.signed_in;
      state.isCustomer = !!d.is_customer;
      state.discount = Number(d.discount_percent) || 0;
      state.items = (d.items || []).map(function (it) {
        it.cat = categorize(it);
        it.search = norm(it.name + ' ' + (it.use || '') + ' ' + (it.department || ''));
        return it;
      });
      state.byId = {};
      state.items.forEach(function (it) { state.byId[it.id] = it; });
      // Drop cart lines that are no longer in the catalog (sold out, etc.)
      Object.keys(state.cart).forEach(function (id) { if (!state.byId[id]) delete state.cart[id]; });
      saveCart();
      renderAll();
    }).catch(function (err) {
      console.error('[tienda] catálogo:', err);
      if (msg) msg.textContent = 'No pudimos cargar el catálogo. Recarga la página o visítanos en sucursal.';
    });
  }

  function filtered() {
    var q = norm(state.query).trim();
    var words = q ? q.split(/\s+/) : [];
    return state.items.filter(function (it) {
      if (state.cat !== 'Todos' && it.cat !== state.cat) return false;
      for (var i = 0; i < words.length; i++) if (it.search.indexOf(words[i]) === -1) return false;
      return true;
    });
  }

  var PILL_SVG = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9AA4C4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"></rect><path d="M9.5 9.5l5 5"></path></svg>';

  function cardHtml(it) {
    var img = it.image_url
      ? '<img src="' + escHtml(it.image_url) + '" alt="' + escHtml(it.name) + '" loading="lazy" decoding="async" style="max-width: 100%; max-height: 100%; object-fit: contain">'
      : PILL_SVG;
    var price = state.signedIn
      ? '<span style="font-size: 20px; font-weight: 800; color: #1E2A8A">' + fmt(it.price) + '</span>'
      : '<span class="t-login-price" style="font-size: 14px; font-weight: 700; color: #4A5578">Inicia sesión para ver el precio</span>';
    var inCart = state.cart[it.id] || 0;
    var label = inCart ? 'Agregar (' + inCart + ')' : 'Agregar';
    return '<article style="flex: 1 1 220px; background: #FFFFFF; border: 1px solid #E3E8F2; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px">' +
      '<div role="img" aria-label="Foto del producto" style="height: 140px; border-radius: 12px; background: #F5F7FB; display: flex; align-items: center; justify-content: center; overflow: hidden">' + img + '</div>' +
      '<span style="font-size: 12px; font-weight: 700; color: #2F7D55">' + escHtml(it.cat) + '</span>' +
      '<h3 style="margin: 0; font-size: 16px; font-weight: 800; overflow-wrap: anywhere">' + escHtml(it.name) + '</h3>' +
      (it.use ? '<span class="t-use" style="font-size: 14px; color: #4A5578; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">' + escHtml(it.use) + '</span>' : '') +
      '<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto">' + price +
      '<button type="button" data-add="' + escHtml(it.id) + '" aria-label="Agregar ' + escHtml(it.name) + ' al carrito" style="min-height: 44px; padding: 0 14px; border: none; border-radius: 10px; background: #1E2A8A; color: #FFFFFF; font-weight: 700; cursor: pointer; flex-shrink: 0">' + label + '</button></div></article>';
  }

  function renderGrid() {
    var grid = $('[data-grid]');
    var list = filtered();
    var html;
    if (!list.length) {
      html = '<p data-grid-msg style="margin: 0; font-size: 16px; color: #4A5578">No encontramos productos con esa búsqueda. Pregunta en sucursal: tenemos más productos en mostrador.</p>';
    } else {
      html = list.slice(0, state.shown).map(cardHtml).join('');
      trackList(list);
      // Invisible spacers keep the last row's cards from stretching.
      for (var i = 0; i < 4; i++) html += '<div aria-hidden="true" style="flex: 1 1 220px; height: 0"></div>';
      if (list.length > state.shown) {
        html += '<div data-section="ver_mas" style="flex: 1 1 100%; display: flex; justify-content: center"><button type="button" data-more data-track-label="Ver más" style="min-height: 48px; padding: 0 22px; border-radius: 12px; background: #FFFFFF; color: #1E2A8A; border: 2px solid #1E2A8A; font-weight: 700; font-size: 16px; cursor: pointer">Ver más productos (' + (list.length - state.shown) + ')</button></div>';
      }
    }
    grid.innerHTML = html;
  }

  function renderChips() {
    $$('[data-cat]').forEach(function (b) {
      var on = b.getAttribute('data-cat') === state.cat;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.border = on ? '2px solid #1E2A8A' : '1px solid #E3E8F2';
      b.style.background = on ? '#EEF0FA' : '#FFFFFF';
      b.style.color = on ? '#1E2A8A' : '#141B3A';
      b.style.cursor = 'pointer';
    });
  }

  function renderAuth() {
    var bar = $('[data-login-bar]');
    var ubar = $('[data-user-bar]');
    if (state.signedIn) {
      bar.hidden = true; bar.style.display = 'none';
      ubar.hidden = false; ubar.style.display = 'flex';
      var who = (state.user && (state.user.user_metadata && state.user.user_metadata.full_name)) || (state.user && state.user.email) || '';
      var t = 'Sesión iniciada' + (who ? ' como ' + who : '') + '.';
      if (state.discount > 0) t += ' Tu membresía te da ' + state.discount + '% de descuento.';
      if (!state.isCustomer) t += ' Tu cuenta aún no tiene expediente de cliente: termina tu registro en la app para apartar pedidos.';
      $('[data-user-text]').textContent = t;
    } else {
      bar.hidden = false; bar.style.display = 'flex';
      ubar.hidden = true; ubar.style.display = 'none';
    }
  }

  function cartLines() {
    return Object.keys(state.cart).map(function (id) {
      return { item: state.byId[id], qty: state.cart[id] };
    }).filter(function (l) { return l.item && l.qty > 0; });
  }

  function renderCart() {
    var lines = cartLines();
    var box = $('[data-cart-lines]');
    $('[data-cart-empty]').hidden = lines.length > 0;
    var subtotal = 0, total = 0;
    box.innerHTML = lines.map(function (l) {
      var p = Number(l.item.price) || 0;
      var unit = Math.round(p * (1 - state.discount / 100) * 100) / 100;
      subtotal += p * l.qty;
      total += unit * l.qty;
      var amount = state.signedIn ? fmt(p * l.qty) : '—';
      return '<div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 15px">' +
        '<span style="flex: 1; min-width: 0; overflow-wrap: anywhere">' + escHtml(l.item.name) + ' × ' + l.qty + '</span>' +
        '<span style="display: inline-flex; gap: 4px; flex-shrink: 0">' +
        '<button type="button" data-track-label="carrito_menos" data-dec="' + escHtml(l.item.id) + '" aria-label="Quitar uno de ' + escHtml(l.item.name) + '" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #E3E8F2; background: #FFFFFF; color: #1E2A8A; font-weight: 800; cursor: pointer">−</button>' +
        '<button type="button" data-track-label="carrito_mas" data-inc="' + escHtml(l.item.id) + '" aria-label="Agregar uno de ' + escHtml(l.item.name) + '" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #E3E8F2; background: #FFFFFF; color: #1E2A8A; font-weight: 800; cursor: pointer">+</button></span>' +
        '<strong style="flex-shrink: 0">' + amount + '</strong></div>';
    }).join('');
    var dRow = $('[data-discount-row]');
    var showDisc = state.signedIn && state.discount > 0 && lines.length > 0;
    dRow.hidden = !showDisc; dRow.style.display = showDisc ? 'flex' : 'none';
    if (showDisc) {
      $('[data-discount-label]').textContent = 'Descuento membresía ' + state.discount + '%';
      $('[data-discount-amount]').textContent = '−' + fmt(subtotal - total);
    }
    $('[data-total]').textContent = state.signedIn ? fmt(total) : (lines.length ? 'Inicia sesión' : fmt(0));
    var btn = $('[data-place-order]');
    btn.disabled = state.placing || !lines.length;
    btn.style.opacity = btn.disabled ? '0.6' : '1';
    renderCartBar(lines, total);
  }

  // ---------- Móvil: barra "Ver pedido" + hoja inferior ----------
  var mqMobile = window.matchMedia('(max-width: 767px)');
  var cartBar, sheetBackdrop, sheetLastFocus = null;
  function buildCartBar() {
    cartBar = document.createElement('div');
    cartBar.className = 't-cartbar m-only';
    cartBar.setAttribute('data-section', 'barra_inferior');
    cartBar.hidden = true;
    cartBar.innerHTML = '<button type="button" data-open-sheet data-track-label="ver_pedido" aria-controls="tu-pedido" aria-expanded="false"></button>';
    document.body.appendChild(cartBar);
    sheetBackdrop = document.createElement('div');
    sheetBackdrop.className = 't-backdrop m-only';
    sheetBackdrop.hidden = true;
    sheetBackdrop.addEventListener('click', function () { closeSheet(); });
    document.body.appendChild(sheetBackdrop);
  }
  function renderCartBar(lines, total) {
    if (!cartBar) buildCartBar();
    var n = lines.reduce(function (a, l) { return a + l.qty; }, 0);
    cartBar.hidden = n === 0;
    document.body.classList.toggle('has-cartbar', !cartBar.hidden && mqMobile.matches);
    var price = state.signedIn ? ' · ' + fmt(total) : '';
    cartBar.firstChild.textContent = 'Ver pedido · ' + n + (n === 1 ? ' artículo' : ' artículos') + price;
  }
  function sheetFocusables() {
    return $$('#tu-pedido button:not([disabled]), #tu-pedido a[href], #tu-pedido input').filter(function (el) {
      return el.offsetParent !== null;
    });
  }
  function openSheet() {
    var aside = $('#tu-pedido');
    sheetLastFocus = document.activeElement;
    aside.classList.add('is-open');
    aside.setAttribute('role', 'dialog');
    aside.setAttribute('aria-modal', 'true');
    sheetBackdrop.hidden = false;
    document.body.classList.add('no-scroll');
    cartBar.firstChild.setAttribute('aria-expanded', 'true');
    var c = $('[data-sheet-close]');
    if (c) setTimeout(function () { c.focus(); }, 50);
  }
  function closeSheet() {
    var aside = $('#tu-pedido');
    if (!aside || !aside.classList.contains('is-open')) return;
    aside.classList.remove('is-open');
    aside.removeAttribute('role');
    aside.removeAttribute('aria-modal');
    sheetBackdrop.hidden = true;
    document.body.classList.remove('no-scroll');
    cartBar.firstChild.setAttribute('aria-expanded', 'false');
    if (sheetLastFocus && sheetLastFocus.focus && sheetLastFocus.offsetParent !== null) sheetLastFocus.focus();
  }
  document.addEventListener('keydown', function (e) {
    var aside = $('#tu-pedido');
    if (!aside || !aside.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    var f = sheetFocusables();
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    else if (f.indexOf(document.activeElement) === -1) { e.preventDefault(); f[0].focus(); }
  });
  if (mqMobile.addEventListener) {
    mqMobile.addEventListener('change', function () { if (!mqMobile.matches) closeSheet(); renderCart(); });
  }

  function renderAll() {
    renderAuth();
    renderChips();
    renderGrid();
    renderCart();
  }

  function setOrderStatus(msg, ok) {
    var el = $('[data-order-status]');
    el.textContent = msg;
    el.style.color = ok ? '#2F7D55' : '#B42318';
    el.style.fontWeight = '700';
  }

  // ---------- Carrito ----------
  function addToCart(id, delta) {
    if (!state.byId[id]) return;
    var q = (state.cart[id] || 0) + delta;
    if (q > MAX_QTY) { setOrderStatus('Máximo ' + MAX_QTY + ' piezas por producto en línea.', false); q = MAX_QTY; }
    if (q <= 0) delete state.cart[id];
    else {
      if (!state.cart[id] && Object.keys(state.cart).length >= MAX_LINES) {
        setOrderStatus('Máximo ' + MAX_LINES + ' productos distintos por pedido.', false);
        return;
      }
      state.cart[id] = q;
    }
    if (delta > 0 && state.cart[id]) {
      var it = state.byId[id];
      track('add_to_cart', {
        currency: 'MXN',
        value: state.signedIn ? Math.round(Number(it.price) * delta * 100) / 100 : 0,
        items: [gaItem(it, delta)],
      });
    }
    saveCart();
    renderCart();
    renderGrid();
  }

  function placeOrder() {
    var lines = cartLines();
    if (!lines.length) return;
    if (!state.signedIn) { openLogin(); return; }
    if (!state.isCustomer) {
      setOrderStatus('Para apartar pedidos tu cuenta necesita expediente de cliente. Termina tu registro en la app o en sucursal.', false);
      return;
    }
    state.placing = true;
    renderCart();
    var estimate = lines.reduce(function (sum, l) {
      return sum + Math.round(Number(l.item.price) * (1 - state.discount / 100) * 100) / 100 * l.qty;
    }, 0);
    var gaItems = lines.map(function (l) { return gaItem(l.item, l.qty); });
    var itemCount = lines.reduce(function (n, l) { return n + l.qty; }, 0);
    track('begin_checkout', { currency: 'MXN', value: Math.round(estimate * 100) / 100, item_count: itemCount, items: gaItems });
    setOrderStatus('Apartando tu pedido…', true);
    sb.rpc('place_store_order', {
      p_items: lines.map(function (l) { return { inventory_id: l.item.id, quantity: l.qty }; }),
      p_patient_name: null,
      p_payment_method: 'cash',
    }).then(function (res) {
      if (res.error) throw res.error;
      var d = res.data || {};
      track('purchase', {
        currency: 'MXN',
        value: Number(d.total) || 0,
        item_count: itemCount,
        items: gaItems.map(function (g) { return { item_id: g.item_id, item_category: g.item_category, quantity: g.quantity }; }),
      });
      state.cart = {};
      saveCart();
      setOrderStatus('¡Listo! Apartamos tu pedido (folio #' + String(d.sale_id || '').slice(-6).toUpperCase() + ') por ' + fmt(d.total || 0) +
        '. Recógelo y págalo en sucursal (Cometa 4, San Antonio Zomeyucan), de 8:00 a 22:00. Te avisamos en la app cuando esté listo.', true);
      return loadCatalog();
    }).catch(function (err) {
      console.warn('[tienda] pedido:', err);
      var m = (err && err.message) || '';
      // place_store_order raises user-safe Spanish messages.
      if (!/[áéíóúñ]|Producto|Cantidad|Artículos|existencias|receta|expediente|Método/i.test(m)) m = 'No pudimos apartar tu pedido. Inténtalo de nuevo o llámanos.';
      setOrderStatus(m, false);
      return loadCatalog();
    }).then(function () {
      state.placing = false;
      renderCart();
    });
  }

  // ---------- Login ----------
  var dialog;
  function buildLogin() {
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'login-title');
    dialog.setAttribute('data-section', 'login');
    dialog.style.cssText = 'border: none; border-radius: 20px; padding: 0; width: min(440px, calc(100vw - 32px)); box-shadow: 0 24px 64px rgba(20,27,94,0.35); font-family: inherit; color: #141B3A';
    dialog.innerHTML =
      '<form method="dialog" data-login-form style="display: flex; flex-direction: column; gap: 14px; padding: 28px">' +
      '<div style="display: flex; justify-content: space-between; align-items: center; gap: 12px"><h2 id="login-title" style="margin: 0; font-size: 24px; font-weight: 800">Iniciar sesión</h2>' +
      '<button type="button" data-close data-track-label="cerrar_login" aria-label="Cerrar" style="width: 40px; height: 40px; border: none; border-radius: 10px; background: #F5F7FB; font-size: 22px; cursor: pointer; color: #141B3A">×</button></div>' +
      '<p style="margin: 0; font-size: 15px; line-height: 1.5; color: #4A5578">Usa la misma cuenta de la app Farmacia Apolo.</p>' +
      '<label style="display: flex; flex-direction: column; gap: 4px; font-size: 14px; font-weight: 700">Correo, teléfono o número de membresía<input name="identifier" required autocomplete="username" style="min-height: 48px; border: 1px solid #E3E8F2; border-radius: 10px; padding: 0 12px; font-size: 16px"></label>' +
      '<label style="display: flex; flex-direction: column; gap: 4px; font-size: 14px; font-weight: 700">Contraseña<input name="password" type="password" required autocomplete="current-password" style="min-height: 48px; border: 1px solid #E3E8F2; border-radius: 10px; padding: 0 12px; font-size: 16px"></label>' +
      '<p data-login-error role="alert" style="margin: 0; font-size: 14px; font-weight: 700; color: #B42318"></p>' +
      '<button type="submit" style="min-height: 52px; border: none; border-radius: 12px; background: #1E2A8A; color: #FFFFFF; font-size: 17px; font-weight: 800; cursor: pointer">Entrar</button>' +
      '<div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 14px"><a href="' + cfg.appUrl + '">¿Olvidaste tu contraseña?</a><a href="' + cfg.appUrl + '" style="font-weight: 800">Crear cuenta gratis</a></div>' +
      '</form>';
    document.body.appendChild(dialog);
    $('[data-close]', dialog).addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    $('[data-login-form]', dialog).addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var err = $('[data-login-error]', dialog);
      var btn = form.querySelector('button[type="submit"]');
      var identifier = form.identifier.value.trim();
      var password = form.password.value;
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'Entrando…';
      resolveEmail(identifier).then(function (email) {
        return sb.auth.signInWithPassword({ email: email, password: password });
      }).then(function (res) {
        if (res.error) throw new Error(/invalid/i.test(res.error.message) ? 'Correo o contraseña incorrectos.' : res.error.message);
        form.reset();
        dialog.close();
      }).catch(function (e2) {
        err.textContent = e2.message || 'No pudimos iniciar sesión.';
      }).then(function () {
        btn.disabled = false; btn.textContent = 'Entrar';
      });
    });
  }

  // Phone / membership # → account email (same rate-limited function the
  // customer app uses).
  function resolveEmail(identifier) {
    if (identifier.indexOf('@') !== -1) return Promise.resolve(identifier);
    return fetch(cfg.supabaseUrl + '/functions/v1/lookup-login-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
      body: JSON.stringify({ identifier: identifier, org_id: cfg.orgId }),
    }).then(function (res) {
      if (res.status === 429) throw new Error('Demasiados intentos — espera unos minutos.');
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok || !j.email) throw new Error('No encontramos una cuenta con esos datos.');
        return j.email;
      });
    });
  }

  function openLogin() {
    if (!dialog) buildLogin();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    var first = dialog.querySelector('input[name="identifier"]');
    if (first) first.focus();
  }

  // ---------- Eventos ----------
  function bind() {
    document.addEventListener('click', function (e) {
      var sh = e.target.closest ? e.target.closest('[data-open-sheet],[data-sheet-close]') : null;
      if (sh) { if (sh.hasAttribute('data-open-sheet')) openSheet(); else closeSheet(); return; }
      var t = e.target.closest ? e.target.closest('[data-add],[data-inc],[data-dec],[data-more],[data-cat],[data-open-login],[data-logout],[data-place-order]') : null;
      if (!t) return;
      if (t.hasAttribute('data-open-login')) {
        if (state.signedIn) {
          // Header link while signed in: jump to the cart instead.
          e.preventDefault();
          $('#tu-pedido').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        e.preventDefault();
        openLogin();
      } else if (t.hasAttribute('data-add')) {
        if (!state.signedIn) { openLogin(); return; }
        addToCart(t.getAttribute('data-add'), 1);
      } else if (t.hasAttribute('data-inc')) addToCart(t.getAttribute('data-inc'), 1);
      else if (t.hasAttribute('data-dec')) addToCart(t.getAttribute('data-dec'), -1);
      else if (t.hasAttribute('data-more')) { state.shown += PAGE; renderGrid(); }
      else if (t.hasAttribute('data-cat')) { state.cat = t.getAttribute('data-cat'); state.shown = PAGE; lastListKey = null; renderChips(); renderGrid(); }
      else if (t.hasAttribute('data-logout')) { sb.auth.signOut(); }
      else if (t.hasAttribute('data-place-order')) placeOrder();
    });
    var timer;
    $('#buscar').addEventListener('input', function (e) {
      clearTimeout(timer);
      var v = e.target.value;
      timer = setTimeout(function () { state.query = v; state.shown = PAGE; renderGrid(); }, 150);
    });
  }

  function start() {
    if (!window.supabase || !window.supabase.createClient) {
      var msg = $('[data-grid-msg]');
      if (msg) msg.textContent = 'No pudimos cargar el catálogo. Recarga la página.';
      return;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    bind();
    var lastUid = null;
    sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      state.user = s ? s.user : null;
      lastUid = state.user ? state.user.id : null;
      return loadCatalog();
    }).then(function () {
      sb.auth.onAuthStateChange(function (_evt, session) {
        var uid = session ? session.user.id : null;
        state.user = session ? session.user : null;
        if (uid === lastUid) return;
        lastUid = uid;
        if (!uid) { state.cart = {}; saveCart(); setOrderStatus('', true); }
        loadCatalog();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
