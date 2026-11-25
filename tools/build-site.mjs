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
  const built = [];

  for (const page of PAGES) {
    let body = page.generated ? privacyBody() : read(`pages/${page.slug}.html`);
    body = body.replace(/ id=""/g, '');
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">
${page.path === '/' ? '<link rel="preload" as="image" href="/sitio/home-statue-hero.webp" type="image/webp">\n' : ''}<style>
body{margin:0}
a{color:#1E2A8A}a:hover{color:#141B5E}
summary::-webkit-details-marker{display:none}
img{max-width:100%}
input,button,select,textarea{font-family:inherit}
details[open] summary svg{transform:rotate(180deg)}
.skip{position:absolute;left:-9999px;top:0;background:#FFFFFF;color:#1E2A8A;padding:12px 16px;z-index:10;font-weight:700}
.skip:focus{left:8px;top:8px}
</style>
${ld.map(ldScript).join('\n')}
${config}${formConfig}${scripts}
</head>
<body>
<a class="skip" href="#contenido">Saltar al contenido</a>
<div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #141B3A; background: #FFFFFF">
${header(page)}<main id="contenido">
${body}</main>
${footer}</div>
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
