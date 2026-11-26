# Hosting

The frontend is 100% static (Vite build + the vanilla customer app) — any static host works. All backend logic is Supabase, independent of where the frontend is served.

## Current setup

| Platform | Role | URL |
|---|---|---|
| **Cloudflare Pages** (`apolofarmacia`) | Production | `app.apolofarmacia.com.mx` (+ `apolofarmacia.pages.dev`) |
| **Cloudflare Pages** (same project) | In-store tablet check-in | `formularios.apolofarmacia.com.mx` → `/registro/` |
| **Cloudflare Pages** (same project) | No-account patient kiosk | `consentimiento.apolofarmacia.com.mx` → `/consentimiento/` |
| **Cloudflare Pages** (same project) | Online check-in (logged-in customers) | `registro.apolofarmacia.com.mx` → `app.apolofarmacia.com.mx/customer-app/?checkin=1` |
| **Cloudflare Pages** (same project) | Afiliados (partner) portal | `afiliados.apolofarmacia.com.mx` → `/afiliados/` |
| **Vercel** | Testing / staging front-end | `farmacia-pos.vercel.app` |

The apex domain (`apolofarmacia.com.mx`) serves the **public marketing website** (see "Public website" below) plus `/membresias` (the membership signup page, React route) on the same Pages project. `www` → 301 to the apex. Any other extensionless path on the apex (staff/app routes like `/pos`, `/login`) → 301 to the `app.` subdomain. The staff/customer apps live on the `app.` subdomain; `app.apolofarmacia.com.mx/membresias` → 301 to `https://apolofarmacia.com.mx/membresias` (keeps it canonical on the main domain).

## Public website (apex, since 2026-11-25)

Static HTML built from the approved Claude design (canvas "Sitio web Farmacia Apolo"). Sources live in `site/`; `tools/build-site.mjs` runs after `vite build` (`npm run build`) and writes the pages into `dist/`:

| Route | Source | Notes |
|---|---|---|
| `/` | `site/pages/inicio.html` → `dist/inicio.html` | Served at `/` **only on the apex/www** by the Pages Function `functions/index.js` (matches only `/`; other hosts keep the React app at `/`). Preview on any host with `/?sitio=1`. |
| `/servicios`, `/consulta`, `/membresia`, `/monedas`, `/recargas-y-pagos`, `/ubicacion`, `/tienda`, `/aviso-de-privacidad` | `site/pages/<slug>.html` → `dist/<slug>.html` | Pages serves `x.html` at `/x` (clean URLs win over the SPA fallback in `_redirects`). |
| `/membresias` | React (`MembershipPublicPage`) | Unchanged; all membership CTAs link here. |
| `/sitemap.xml`, `/robots.txt` | generated | |

- Header/footer: `site/partials/`. Page `<title>`, meta description, canonical, Open Graph, `Pharmacy`/`LocalBusiness` JSON-LD (Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan; 8:00–22:00 daily) and breadcrumbs are set in `tools/build-site.mjs`. `FAQPage` JSON-LD is generated automatically from the `<details>` FAQs in each page (entries that still contain a `[PLACEHOLDER]` are skipped).
- Text placeholders still to fill: footer `[NOMBRE Y CÉDULA]` / `[NÚMERO]` (responsable sanitario, aviso de funcionamiento), `/consulta` `[CONFIRMAR edad mínima de atención]` and `[EN VIVO]`, `/ubicacion` `[CONFIRMAR referencias…]`. Store phone `+52 1 442 548 8893` (confirmed).
- Images: `public/sitio/` (optimized WebP logo/hero, OG image 1200×630) generated from `public/brand/`.
- "Iniciar sesión" / "Crear cuenta gratis" → `https://app.apolofarmacia.com.mx/customer-app/`.
- `/aviso-de-privacidad` renders `site/aviso-de-privacidad.txt`, a copy of the active `consent_texts` `privacidad` row — re-export it when the aviso changes.
- **Plan Empresa form** (`/` and `/membresia`, `site/assets/site.js`) → edge function `empresa-lead` (public, honeypot + 5 req/10 min per IP in `rate_limit_events`) → row in `public.empresa_leads` (staff-only RLS) + email to `adminapollo01@gmail.com` via Resend (`RESEND_API_KEY`, `EMAIL_FROM`).
- **Tienda** (`site/assets/tienda.js`): catalog from the public RPC `get_store_catalog(p_org_id)` (in stock, no Rx, no controlled group, products only, no services/antibiotics/injectables; prices only with a session). Login uses the same Supabase project/accounts as the customer app (session is per domain, so `/tienda` has its own login dialog; phone/membership # resolve via `lookup-login-email`). "Apartar mi pedido" calls `place_store_order` (server prices, membership discount, stock lock, Rx/controlled block) → order lands in Admin › Pedidos (status *Procesando*) and in the POS "Pedidos en línea" button (polls every 45 s, toast on new orders; *Marcar listo* / *Entregar y cobrar* attaches the paid order to the open shift — stock is not touched again).
- Migration: `20261125000000_public_site_store_and_leads.sql`.

### Mobile layout (≤767px)

`site/assets/mobile.css` (inlined into every page's `<style>`; every rule is inside `@media (max-width: 767px)`, so desktop/tablet keep the exact design) + `site/assets/ui.js`. `tools/build-site.mjs` adds the phone header (logo, "Crear cuenta", hamburger → `#menu-movil` drawer with focus trap/Esc), the bottom action bar ("Agendar consulta" + "Llamar"; hidden over the hero, over the footer and while typing) and class hooks on card rows (`m-snap` scroll rows, `m-grid2`, `m-rewards`, `hero-media`). The hero statue is never downloaded on phones. Tienda on phones: 2-column grid, one-row category chips, "Ver pedido" bar + cart bottom sheet (`tienda.js`). GA `button_location` values: `<page>_menu_movil`, `<page>_barra_inferior`, `tienda_carrito`.

### Google Analytics 4 (G-0V3V4H1RMF)

- Cookie notice (`site/assets/cookies.js`, all static pages + React `/membresias`): notice-based, GA runs by default. "Rechazar" stores `apolo_cookies=rejected` in localStorage, sets `window['ga-disable-G-0V3V4H1RMF']` and analytics.js / publicAnalytics.js never load or send GA again in that browser. The aviso page has a "Sitio web" section (built in `tools/build-site.mjs`, NOT in `site/aviso-de-privacidad.txt`, which must stay identical to the app's consent text) with a "Cambiar mi elección de cookies" link.

- Static pages: `site/assets/analytics.js` on every page (config runs at once; gtag.js loads after first paint). Tracks `button_click` on every `<a>`/`<button>` (`button_label` = visible text or `data-track-label`; `button_location` = `<page>_<section>`, from the `data-section` names `tools/build-site.mjs` adds), plus `agendar_consulta_click`, `sign_up_click`, `login_click`. `site.js` → `generate_lead` (`company_size` bucket only). `tienda.js` → `view_item_list`, `add_to_cart`, `begin_checkout`, `purchase` (MXN; item_id/category only, never product names).
- React public routes (`/membresias`, `/membresias/terminos`, `/membresia-negocios`): `src/lib/publicAnalytics.js`. Page views come from the tag + Enhanced Measurement history events. Every other React route sets `window['ga-disable-G-0V3V4H1RMF'] = true` (also set before each history change), so staff/patient screens and `/membresia-negocios/activar?setup=<token>` never send anything.
- Privacy: no names, emails, phones, CURP, product names or health data in events; labels that look like an email/phone are replaced.
- Performance: gtag.js loads on the first interaction (scroll/tap/key) or 5 s after load, never during first render; events queue in `dataLayer`. A link tapped before gtag is ready waits for its hits (max 1 s) before navigating. Fonts are self-hosted (`public/sitio/fonts`, OFL) — no Google Fonts requests.
- Debug: add `?debug_mode=1` to any URL (or `localStorage.apolo_ga_debug = '1'`) and open GA → Admin → DebugView.

### Cloudflare rules for the apex (zone `apolofarmacia.com.mx` → Rules → Redirect Rules)

Replace the old apex rules (`/` → `/membresias` and "other paths → app.") with these, in this order:

1. **www → apex** — `(http.host eq "www.apolofarmacia.com.mx")` → Dynamic redirect, 301, expression `concat("https://apolofarmacia.com.mx", http.request.uri.path)`, preserve query string.
2. **Apex app paths → app.** — expression:
   ```
   (http.host eq "apolofarmacia.com.mx"
    and not http.request.uri.path in {"/" "/servicios" "/consulta" "/membresia" "/monedas" "/recargas-y-pagos" "/ubicacion" "/tienda" "/aviso-de-privacidad" "/membresias" "/membresias/terminos" "/membresia-negocios" "/membresia-negocios/activar" "/sitemap.xml" "/robots.txt"}
    and not starts_with(http.request.uri.path, "/assets/")
    and not starts_with(http.request.uri.path, "/sitio/")
    and not starts_with(http.request.uri.path, "/vendor/")
    and not starts_with(http.request.uri.path, "/brand/")
    and not http.request.uri.path contains ".")
   ```
   → Dynamic redirect, 301, `concat("https://app.apolofarmacia.com.mx", http.request.uri.path)`, preserve query string.
3. Keep the existing `app.apolofarmacia.com.mx/membresias` → apex rule and the `formularios.` / `consentimiento.` / `registro.` / `afiliados.` rules unchanged.

`www` must stay attached to the Pages project (or have a proxied DNS record) so rule 1 can run.

## Tablet check-in (`formularios.` subdomain)

`formularios.apolofarmacia.com.mx` is a Pages custom domain on the same project; a Redirect Rule sends its root to `/registro/` (`public/registro/index.html`, self-contained). Staff pin the in-store tablet to that URL.

Flow: patient/guardian fills name + **email OR phone** (one required; + guardian for minors) → accepts the 4 standard consent documents → optional reason for visit → the `tablet-checkin` edge function (public, service-role) creates/reuses the customer, provisions the app account when an email is given (password arrives via auth recovery email — template is in Spanish), stores the signed consents (clears the app's consent gate), adds a **confirmed walk-in cita**, and writes a **medical note** labeled as customer self-report.

Walk-in citas are assigned to the **doctor on shift**: `tablet-checkin` matches the current time (America/Mexico_City) against each active doctor's `doctor_profiles.availability` weekly windows and falls back to the first active doctor.

`registro.apolofarmacia.com.mx` → 301 to the customer app's `?checkin=1` view: a logged-in customer answers the 5-question pre-visit form (motivo, síntomas, duración, medicamentos, alergias); `tablet-checkin` in `checkin` mode creates the same walk-in cita + medical note with the answers. Guests are routed to login first.

## Afiliados portal (`afiliados.` subdomain)

`afiliados.apolofarmacia.com.mx` is a Pages custom domain on the same project; a Redirect Rule sends its root to `/afiliados/` (`public/afiliados/index.html`, self-contained). Partner businesses self-register there (the same fields as Admin → Afiliados + contact email); the public `affiliate-signup` edge function (honeypot + per-IP rate limit, generic responses) provisions the auth account, creates the `partners` row **live immediately**, emails the afiliado (branded welcome + GoTrue password-setup link redirecting to `app.apolofarmacia.com.mx/afiliados/`, already in the Auth allow-list) and alerts all org admins by email (`affiliate_new_signup`).

The portal (own Supabase session, `storageKey: 'apolo-affiliate-auth'`) lets the afiliado edit their listing and upload a logo via the `get_my_partner` / `update_my_partner` definer RPCs (whitelisted fields only — `active`/`org_id`/`sort_order`/`coupon_code` stay staff-only). Logos live in the public `partner-logos` storage bucket, path-scoped to `{partner_id}/` for the owner, staff-writable too.

Poster program: the registration checkbox (and a portal button later) sets `partners.poster_opt_in` and calls `generate_partner_coupon`, which inserts a reusable **10% code built from the business name** into the existing `discounts` table — instantly usable in the POS and visible in Admin → Descuentos — and emails the admins (`affiliate_poster_optin`) so they can coordinate the physical póster. The afiliado sees the code as a membership-style digital card in their portal. Migration: `20261006000000_affiliates.sql`.

## Consentimiento kiosk (`consentimiento.` subdomain)

`consentimiento.apolofarmacia.com.mx` is a Pages custom domain on the same project; a Redirect Rule sends its root to `/consentimiento/` (`public/consentimiento/index.html`, self-contained). This is the kiosk for patients **without phone or email** who can't make an app account.

Flow: two buttons on top — **Primera Vez** and **Ya he venido antes**.

- *Primera Vez*: name + DOB (a guardian name is required automatically when the DOB is under 18) → accept the 4 standard consent documents → `tablet-checkin` in `register` mode with `guest: true` creates/reuses the customer (name+DOB match, no account provisioning), stores the consents, and creates the walk-in cita + medical note. Minors are registered under **their own** name+DOB (so they match on return visits); the guardian signs the 4 consents (`signer_name`) and is noted in `customers.notes` + the cita notes.
- *Returning*: name + DOB → `tablet-checkin` in `lookup` mode (accent/case-insensitive, typo-tolerant name match within the same `customers.date_of_birth`). A match goes to the 5-question check-in form; if the match has no signed consents on file, the 4 documents are signed first and inserted with the check-in (`checkin` mode + `customer_id`, re-verified against name+DOB server-side). No match → routed into the Primera Vez form with their data prefilled.

Setup (done via the Cloudflare API — token saved in `.env.local` as `CLOUDFLARE_API_TOKEN`): Pages custom domain attached, proxied CNAME `consentimiento` → `apolofarmacia.pages.dev`, plus a zone redirect rule: hostname equals `consentimiento.apolofarmacia.com.mx` AND URI Path equals `/` → 301 to `https://consentimiento.apolofarmacia.com.mx/consentimiento/` (same pattern as `formularios.`). Manual alternative: Pages project → Custom domains → add the subdomain, then Rules → Redirect Rule with the same expression.

Both auto-deploy the same `main` branch on every push. **Both point at the same Supabase project** — same database, same auth, same edge functions. Testing on the Vercel URL touches production data; treat it as "preview the build", not an isolated sandbox.

## Config files per platform

- `vercel.json` — Vercel rewrites/headers (kept for the staging site)
- `public/_redirects`, `public/_headers` — Cloudflare Pages equivalents (copied into `dist/` at build time)

## Cloudflare Pages setup (one-time)

1. Pages → Connect to Git → this repo.
2. Build command `npm run build`, output directory `dist`.
3. Environment variables (same values as Vercel):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_PUBLIC_ORG_ID`
   - `VITE_PAYPAL_ENV`, `VITE_PAYPAL_CLIENT_ID`, `VITE_PAYPAL_PLAN_INDIVIDUAL`, `VITE_PAYPAL_PLAN_FAMILIAR`
4. Attach the custom domain — automatic since DNS is already on Cloudflare.
5. Zone → Caching → Configuration → **Browser Cache TTL = "Respect Existing Headers"** (API value `0`). The Cloudflare default (4 hours) overrides `public/_headers` and makes browsers hold stale copies of `customer-app/js/app.js` (stable URL, no content hash) for hours after each deploy. With "Respect Existing Headers", `_headers` wins: content-hashed `/assets/*` cache for a year, everything else revalidates each load.

Note: the dashboard's "Workers & Pages" list also shows a `subdomain-router` Worker — it has no routes on this zone and serves no traffic; leave it alone. (A leftover `farmacia-pos` hello-world Worker from the first setup attempt was deleted — its auto-builds failed on every push and were pure noise; the real site is the `apolofarmacia` Pages project.)

## Supabase Auth (all front-end origins must work)

Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://app.apolofarmacia.com.mx`
- **Redirect URLs** (`uri_allow_list`): `https://app.apolofarmacia.com.mx/**`, `https://apolofarmacia.pages.dev/**`, `https://farmacia-pos.vercel.app/**`, `http://localhost:3000/**`

Password-reset emails use `window.location.origin`, so each environment links back to itself; all origins must be whitelisted.

## Notes

- PayPal needs no changes (webhook points at the Supabase function URL, not the frontend domain).
- Staff should use the **production domain** when sending consent-form / signup links (WhatsApp/email), so customers get the branded URL.
- Rollback = re-point DNS or re-attach the domain to Vercel. Keep the Vercel project around either way.
