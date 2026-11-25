#!/usr/bin/env node
// Builds the public marketing website (apolofarmacia.com.mx) as plain static
// HTML into dist/ — runs after `vite build` (see package.json "build").
//
// Sources (edit these, not dist/):
//   site/pages/<slug>.html      page body, ported 1:1 from the approved Claude
//                               design (inline styles kept verbatim)
//   site/partials/header.html   shared header (active nav link set here)
//   site/partials/footer.html   shared footer
//   site/assets/*.js            small vanilla scripts (forms, tienda)
//   site/aviso-de-privacidad.txt  text of the active consent_texts 'privacidad'
//   public/sitio/*              optimized images (copied by Vite)
//
// Output: dist/<slug>.html (Cloudflare Pages serves it at /<slug>),
// dist/inicio.html (served at / on the apex by functions/index.js),
// dist/sitio/*.js, dist/sitemap.xml, dist/robots.txt.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = path.join(ROOT, 'site');
const DIST = path.join(ROOT, 'dist');
const ORIGIN = 'https://apolofarmacia.com.mx';
const APP = 'https://app.apolofarmacia.com.mx/customer-app/';
const SUPABASE_URL = 'https://ieinjhonepkudxxpmuly.supabase.co';
// Public anon key (same one shipped in public/customer-app/js/supabase.js).
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllaW5qaG9uZXBrdWR4eHBtdWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDc2MzgsImV4cCI6MjA5MDMyMzYzOH0.Zc79127QCi3VcrK_WYWv_-cQdBtpweYqTt3zziMJBno';
const ORG_ID = '718f51b5-dc67-4f70-8aa9-1a315cd1deeb';

const PAGES = [
  {
    slug: 'inicio', path: '/', priority: '1.0',
    title: 'Farmacia con consultorio en Naucalpan | Farmacia Apolo',
    description: 'Consulta médica general $100, toma de presión y glucosa, genéricos, recargas Telcel y pago de luz CFE. Cometa 4, San Antonio Zomeyucan. 8:00 a 22:00.',
    scripts: ['site.js'],
  },
  {
    slug: 'servicios', path: '/servicios', priority: '0.9',
    title: 'Servicios: consulta, presión, glucosa y laboratorio en Naucalpan | Farmacia Apolo',
    description: 'Consulta médica general, videoconsulta, toma de presión y glucosa, estudios de laboratorio, medicamentos genéricos, recargas y pago de servicios en Naucalpan.',
  },
  {
    slug: 'consulta', path: '/consulta', priority: '0.9',
    title: 'Consulta médica $100 en Naucalpan | Farmacia Apolo',
    description: 'Consulta médica general de $100 con médico en sucursal en San Antonio Zomeyucan, Naucalpan. Revisa el tiempo de espera en vivo y sal con tu receta digital con QR.',
  },
  {
    slug: 'membresia', path: '/membresia', priority: '0.9',
    title: 'Membresía médica familiar en Naucalpan | Farmacia Apolo',
    description: 'Membresía de salud mensual: consultas incluidas, 10% en medicamentos, toma de presión gratis y revisión semestral. Individual $150, Familiar $500. Primer mes gratis.',
    scripts: ['site.js'],
  },
  {
    slug: 'monedas', path: '/monedas', priority: '0.7',
    title: 'Monedas Apolo: recompensas por cuidar tu salud | Farmacia Apolo',
    description: 'Gana Monedas Apolo por caminar, tomar tu medicina a tiempo y hacerte chequeos. Cámbialas en caja por descuentos, chequeos y consultas gratis.',
  },
  {
    slug: 'recargas-y-pagos', path: '/recargas-y-pagos', priority: '0.7',
    title: 'Recargas Telcel y pago de luz CFE en Naucalpan | Farmacia Apolo',
    description: 'Recargas Telcel, AT&T, Movistar y Bait, pago de luz CFE, Telmex, Izzi y tarjetas de regalo en Farmacia Apolo, Naucalpan. Todos los días de 8:00 a 22:00.',
  },
  {
    slug: 'ubicacion', path: '/ubicacion', priority: '0.8',
    title: 'Farmacia en San Antonio Zomeyucan, Naucalpan | Farmacia Apolo',
    description: 'Farmacia Apolo: Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez. Abierto todos los días de 8:00 a 22:00, cerca de Ciudad Satélite y Lomas Verdes.',
  },
  {
    slug: 'tienda', path: '/tienda', priority: '0.8',
    title: 'Farmacia en línea en Naucalpan: compra y recoge | Farmacia Apolo',
    description: 'Aparta en línea medicamentos sin receta, vitaminas y cuidado personal y recoge en Farmacia Apolo, Naucalpan. Pago en sucursal, con tu descuento de membresía.',
    scripts: ['tienda.js'],
    supabase: true,
  },
  {
    slug: 'aviso-de-privacidad', path: '/aviso-de-privacidad', priority: '0.3',
    title: 'Aviso de privacidad | Farmacia Apolo',
    description: 'Aviso de privacidad de Farmacia Apolo conforme a la LFPDPPP: datos que recabamos, finalidades, transferencias y cómo ejercer tus derechos ARCO.',
    generated: true,
  },
];

const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decode = (s) =>
  s.replace(/&#160;/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const text = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

const INACTIVE_NAV = 'text-decoration: none; color: #141B3A; font-size: 15px; font-weight: 600; padding: 10px 4px; border-bottom: 2px solid transparent';
const ACTIVE_NAV = 'text-decoration: none; color: #1E2A8A; font-size: 15px; font-weight: 800; padding: 10px 4px; border-bottom: 2px solid #1E2A8A';

const header = (page) => {
  let h = read('partials/header.html');
  if (page.path !== '/') {
    h = h.replace(`<a href="${page.path}" style="${INACTIVE_NAV}">`, `<a href="${page.path}" aria-current="page" style="${ACTIVE_NAV}">`);
  }
  // On /tienda "Iniciar sesión" opens the in-page login (sessions are per
  // domain); everywhere else it goes to the customer app.
  if (page.slug === 'tienda') h = h.replace(`<a href="${APP}" style="min-height: 48px; padding: 0 22px; border-radius: 12px; background: #FFFFFF;`, `<a href="${APP}" data-open-login style="min-height: 48px; padding: 0 22px; border-radius: 12px; background: #FFFFFF;`);
  return h;
};

const LOCAL_BUSINESS = {
  '@context': 'https://schema.org',
  '@type': ['Pharmacy', 'LocalBusiness'],
  '@id': `${ORIGIN}/#farmacia`,
  name: 'Farmacia Apolo',
  url: `${ORIGIN}/`,
  logo: `${ORIGIN}/sitio/apolo-logo-512.png`,
  image: `${ORIGIN}/sitio/og-farmacia-apolo.jpg`,
  telephone: '+52 1 442 548 8893',
  email: 'citas@apolofarmacia.com.mx',
  priceRange: '$',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Cometa 4, San Antonio Zomeyucan',
    addressLocality: 'Naucalpan de Juárez',
    addressRegion: 'Estado de México',
    postalCode: '53750',
    addressCountry: 'MX',
  },
  areaServed: 'Naucalpan de Juárez',
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '08:00',
      closes: '22:00',
    },
  ],
  hasMap: 'https://www.google.com/maps/search/?api=1&query=Farmacia+Apolo+Cometa+4+San+Antonio+Zomeyucan+53750+Naucalpan',
};

const faqJsonLd = (body) => {
  const items = [];
  const re = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<svg[\s\S]*?<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/details>/g;
  let m;
  while ((m = re.exec(body))) {
    const q = text(m[1]);
    const a = text(m[2]);
    // Unfilled placeholders like [CONFIRMAR …] never go into structured data.
    if (!q || !a || /\[[^\]]+\]/.test(q + a)) continue;
    items.push({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } });
  }
  if (!items.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items };
};

const ldScript = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const privacyBody = () => {
  const lines = read('aviso-de-privacidad.txt').split('\n');
  const [title, updated, ...rest] = lines;
  const parts = [];
  for (const raw of rest) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\d+\.\s+[A-ZÁÉÍÓÚÑ ,()]+$/.test(line)) {
      parts.push(`<h2 style="margin: 24px 0 0; font-size: 22px; font-weight: 800; color: #141B3A">${esc(line)}</h2>`);
    } else {
      parts.push(`<p style="margin: 0; font-size: 16px; line-height: 1.7; color: #4A5578">${esc(line)}</p>`);
    }
  }
  return `<section style="background: #141B5E; padding: 64px 24px"><div style="max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px"><span style="font-size: 13px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #8FD9B0">${esc(updated.trim())}</span><h1 style="margin: 0; font-size: clamp(34px, 4.4vw, 52px); line-height: 1.1; font-weight: 800; color: #FFFFFF; max-width: 860px">Aviso de privacidad</h1><p style="margin: 0; font-size: 19px; line-height: 1.6; color: #D4D9F5; max-width: 780px">${esc(title.trim())}</p></div></section>
<section style="background: #FFFFFF; padding: 64px 24px"><div style="max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px">${parts.join('\n')}</div></section>
`;
};

// Stable section names for analytics button_location ("<page>_<section>"):
// first section = hero, then the section id, else its eyebrow/h2 text.
const SECTION_OVERRIDES = [
  [/Plan Individual/, 'planes'],
  [/data-empresa-form/, 'planes'],
  [/data-grid/, 'catalogo'],
  [/RESPONSABLE DEL TRATAMIENTO/, 'texto'],
];
const slug = (t) =>
  text(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').split('_').slice(0, 3).join('_');
const sectionize = (body) => {
  const parts = body.split(/(?=<section\b)/);
  const used = new Set();
  let n = 0;
  return parts.map((part) => {
    if (!part.startsWith('<section')) return part;
    const end = part.indexOf('</section>');
    const inner = end === -1 ? part : part.slice(0, end);
    let name;
    if (n === 0) name = 'hero';
    if (!name) name = (part.match(/^<section[^>]*\sid="([^"]+)"/) || [])[1];
    if (!name) for (const [re, v] of SECTION_OVERRIDES) if (re.test(inner)) { name = v; break; }
    if (!name) {
      const eyebrow = inner.match(/<span style="font-size: 13px; font-weight: 800; letter-spacing: \.12em[^"]*">([^<]+)<\/span>/);
      const h2 = inner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
      name = slug((eyebrow && eyebrow[1]) || (h2 && h2[1]) || `seccion_${n + 1}`);
    }
    let unique = name; let k = 2;
    while (used.has(unique)) unique = `${name}_${k++}`;
    used.add(unique);
    n++;
    return part.replace(/^<section\b/, `<section data-section="${unique}"`);
  }).join('');
};

// Mobile layout hooks (site/assets/mobile.css). Classes only — the inline
// design styles stay untouched, so desktop renders exactly as designed.
const MOBILE_HOOKS = [
  ['<div style="display: flex; flex-wrap: wrap; gap: 18px">', 'm-snap'],
  ['<div style="display: flex; flex-wrap: wrap; gap: 24px">', 'm-grid2'],
  ['<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 12px">', 'm-grid2'],
  ['<ol style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px">', 'm-rewards'],
  ['<div style="flex: 1 1 360px; min-width: 0; display: flex; justify-content: center">', 'hero-media'],
];
const mobilize = (body) => {
  let out = body;
  for (const [tag, cls] of MOBILE_HOOKS) {
    const tagged = tag.replace(/^<(\w+) /, `<$1 class="${cls}" `);
    // Never re-grid the tienda layout row (catalog + cart): it has its own rules.
    out = out.split(tag).map((chunk, i) => (i === 0 ? chunk : (chunk.startsWith('<div data-grid') ? tag : tagged) + chunk)).join('');
  }
  // Hero statue: phones get a 1x1 placeholder instead (never downloaded).
  out = out.replace(
    /<img src="\/sitio\/home-statue-hero\.webp"/,
    '<picture><source media="(max-width: 767px)" srcset="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><img src="/sitio/home-statue-hero.webp"'
  ).replace(/(<img src="\/sitio\/home-statue-hero\.webp"[^>]*>)/, '$1</picture>');
  return out;
};

const MENU_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>';
const PHONE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"></path></svg>';
const NAV_ITEMS = [
  ['/', 'Inicio'], ['/servicios', 'Servicios'], ['/consulta', 'Consulta'], ['/membresia', 'Membresía'],
  ['/monedas', 'Monedas Apolo'], ['/recargas-y-pagos', 'Recargas y pagos'], ['/ubicacion', 'Ubicación'], ['/tienda', 'Tienda'],
];

// Phone header row (logo stays; desktop nav/buttons hidden by CSS) + drawer.
const mobileHeader = (page, h) => {
  h = h.replace('<nav aria-label="Principal" style=', '<nav class="d-only" aria-label="Principal" style=');
  h = h.replace('<div style="display: flex; gap: 10px; flex-wrap: wrap"><a href="' + APP + '"', '<div class="d-only" style="display: flex; gap: 10px; flex-wrap: wrap"><a href="' + APP + '"');
  const actions = `<div class="m-only m-head-actions"><a class="m-head-cta" href="${APP}" data-track-label="Crear cuenta gratis">Crear cuenta</a><button type="button" class="m-burger m-only" aria-expanded="false" aria-controls="menu-movil" aria-label="Abrir menú" data-track-label="abrir_menu">${MENU_ICON}</button></div>`;
  h = h.replace(/<\/div><\/header>\s*$/, `${actions}\n</div></header>`);
  const links = NAV_ITEMS.map(([href, label]) => `<a href="${href}"${href === page.path ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const login = page.slug === 'tienda' ? `<a href="${APP}" data-open-login style="color: #1E2A8A; background: #FFFFFF">Iniciar sesión</a>` : `<a href="${APP}" style="color: #1E2A8A; background: #FFFFFF">Iniciar sesión</a>`;
  const drawer = `<div class="m-backdrop m-only" data-for="menu-movil" hidden></div>
<div id="menu-movil" class="m-drawer m-only" data-section="menu_movil" role="dialog" aria-modal="true" aria-label="Menú" hidden><nav aria-label="Menú móvil">${links}</nav><div class="m-drawer-actions">${login}<a href="${APP}" style="color: #FFFFFF; background: #1E2A8A">Crear cuenta gratis</a></div></div>
`;
  return h.trimEnd() + '\n' + drawer;
};

const bottomBar = (page) => page.slug === 'tienda' ? '' : `<div class="m-bottom-bar m-only" data-section="barra_inferior"><a class="primary" href="${APP}">Agendar consulta</a><a class="secondary" href="tel:+5214425488893" data-track-label="Llamar">${PHONE_ICON}Llamar</a></div>
`;

let MOBILE_CSS = '';
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);

function build() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ not found — run vite build first');
  fs.mkdirSync(path.join(DIST, 'sitio'), { recursive: true });

  // Scripts get a content hash in the query string (cache-busting; the
  // _headers rule makes HTML revalidate on each load).
  const assetVersion = {};
  for (const f of fs.readdirSync(path.join(SITE, 'assets'))) {
    const src = path.join(SITE, 'assets', f);
    fs.copyFileSync(src, path.join(DIST, 'sitio', f));
    assetVersion[f] = hash(src);
  }

  const footer = read('partials/footer.html');
  MOBILE_CSS = read('assets/mobile.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '\n').trim() + '\n';
  const built = [];

  for (const page of PAGES) {
    let body = page.generated ? privacyBody() : read(`pages/${page.slug}.html`);
    body = mobilize(sectionize(body.replace(/ id=""/g, '')));
    const canonical = ORIGIN + page.path;
    const h1 = (body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
    if (!h1) throw new Error(`page ${page.slug} has no <h1>`);

    const ld = [LOCAL_BUSINESS];
    if (page.path !== '/') {
      ld.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: text(h1).slice(0, 80), item: canonical },
        ],
      });
    }
    const faq = faqJsonLd(body);
    if (faq) ld.push(faq);

    const config = page.supabase
      ? `<script>window.APOLO_SITE=${JSON.stringify({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, orgId: ORG_ID, appUrl: APP })};</script>\n<script src="/vendor/supabase-js.min.js" defer></script>\n`
      : '';
    const scripts = (page.scripts || []).map((s) => `<script src="/sitio/${s}?v=${assetVersion[s]}" defer></script>`).join('\n');
    const formConfig = (page.scripts || []).includes('site.js')
      ? `<script>window.APOLO_SITE=${JSON.stringify({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, orgId: ORG_ID })};</script>\n`
      : '';

    const html = `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#141B5E">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_MX">
<meta property="og:site_name" content="Farmacia Apolo">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ORIGIN}/sitio/og-farmacia-apolo.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" href="/sitio/apple-touch-icon.png">
<link rel="preload" href="/sitio/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
${page.path === '/' ? '<link rel="preload" as="image" href="/sitio/home-statue-hero.webp" type="image/webp" media="(min-width: 768px)">\n' : ''}<style>
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:200 800;font-display:swap;src:url(/sitio/fonts/plus-jakarta-sans-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:200 800;font-display:swap;src:url(/sitio/fonts/plus-jakarta-sans-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
body{margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif}
a{color:#1E2A8A}a:hover{color:#141B5E}
summary::-webkit-details-marker{display:none}
img{max-width:100%}
input,button,select,textarea{font-family:inherit}
details[open] summary svg{transform:rotate(180deg)}
.skip{position:absolute;left:-9999px;top:0;background:#FFFFFF;color:#1E2A8A;padding:12px 16px;z-index:10;font-weight:700}
.skip:focus{left:8px;top:8px}
${MOBILE_CSS}</style>
${ld.map(ldScript).join('\n')}
<script src="/sitio/analytics.js?v=${assetVersion['analytics.js']}" defer></script>
<script src="/sitio/ui.js?v=${assetVersion['ui.js']}" defer></script>
${config}${formConfig}${scripts}
</head>
<body data-page="${page.slug}">
<a class="skip" href="#contenido">Saltar al contenido</a>
<div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #141B3A; background: #FFFFFF">
${mobileHeader(page, header(page).replace('<header ', '<header data-section="header" '))}<main id="contenido">
${body}</main>
${footer.replace('<footer ', '<footer data-section="footer" ').replace('<img src="/sitio/apolo-logo.webp" alt="Farmacia Apolo" style=', '<img src="/sitio/apolo-logo.webp" alt="Farmacia Apolo" width="64" height="64" loading="lazy" decoding="async" style=')}${bottomBar(page)}</div>
</body>
</html>
`;
    fs.writeFileSync(path.join(DIST, `${page.slug}.html`), html);
    built.push(page);
  }

  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...built.map((p) => ({ loc: ORIGIN + p.path, priority: p.priority })), { loc: `${ORIGIN}/membresias`, priority: '0.8' }]
  .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`)
  .join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);

  const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /pos
Disallow: /inventory
Disallow: /doctor
Disallow: /login
Disallow: /customer-app/
Disallow: /registro/
Disallow: /consentimiento/
Disallow: /afiliados/
Disallow: /receta-view/
Disallow: /verifica/
Disallow: /inicio

Sitemap: ${ORIGIN}/sitemap.xml
`;
  fs.writeFileSync(path.join(DIST, 'robots.txt'), robots);
  console.log(`[build-site] ${built.length} pages + sitemap.xml + robots.txt → dist/`);
}

build();
