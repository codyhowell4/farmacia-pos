# Hosting

The frontend is 100% static (Vite build + the vanilla customer app) — any static host works. All backend logic is Supabase, independent of where the frontend is served.

## Current setup

| Platform | Role | URL |
|---|---|---|
| **Cloudflare Pages** (`apolofarmacia`) | Production | `app.apolofarmacia.com.mx` (+ `apolofarmacia.pages.dev`) |
| **Cloudflare Pages** (same project) | In-store tablet check-in | `formularios.apolofarmacia.com.mx` → `/registro/` |
| **Cloudflare Pages** (same project) | Online check-in (logged-in customers) | `registro.apolofarmacia.com.mx` → `app.apolofarmacia.com.mx/customer-app/?checkin=1` |
| **Vercel** | Testing / staging front-end | `farmacia-pos.vercel.app` |

The apex domain (`apolofarmacia.com.mx` / `www`) is **reserved for the future marketing website**. The app lives on the `app.` subdomain. For now the apex only has one rule: `apolofarmacia.com.mx/membresias` (and `www`) → **301 redirect** to `https://app.apolofarmacia.com.mx/membresias` (Cloudflare Redirect Rule + AAAA `100::` discard records so the edge can answer). When the website lands, point the apex at it and remove the discard records.

## Tablet check-in (`formularios.` subdomain)

`formularios.apolofarmacia.com.mx` is a Pages custom domain on the same project; a Redirect Rule sends its root to `/registro/` (`public/registro/index.html`, self-contained). Staff pin the in-store tablet to that URL.

Flow: patient/guardian fills name + **email OR phone** (one required; + guardian for minors) → accepts the 3 standard consent documents → optional reason for visit → the `tablet-checkin` edge function (public, service-role) creates/reuses the customer, provisions the app account when an email is given (password arrives via auth recovery email — template is in Spanish), stores the signed consents (clears the app's consent gate), adds a **confirmed walk-in cita**, and writes a **medical note** labeled as customer self-report.

Walk-in citas are assigned to the **doctor on shift**: `tablet-checkin` matches the current time (America/Mexico_City) against each active doctor's `doctor_profiles.availability` weekly windows and falls back to the first active doctor.

`registro.apolofarmacia.com.mx` → 301 to the customer app's `?checkin=1` view: a logged-in customer answers the 5-question pre-visit form (motivo, síntomas, duración, medicamentos, alergias); `tablet-checkin` in `checkin` mode creates the same walk-in cita + medical note with the answers. Guests are routed to login first.

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

## Supabase Auth (all front-end origins must work)

Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://app.apolofarmacia.com.mx`
- **Redirect URLs** (`uri_allow_list`): `https://app.apolofarmacia.com.mx/**`, `https://apolofarmacia.pages.dev/**`, `https://farmacia-pos.vercel.app/**`, `http://localhost:3000/**`

Password-reset emails use `window.location.origin`, so each environment links back to itself; all origins must be whitelisted.

## Notes

- PayPal needs no changes (webhook points at the Supabase function URL, not the frontend domain).
- Staff should use the **production domain** when sending consent-form / signup links (WhatsApp/email), so customers get the branded URL.
- Rollback = re-point DNS or re-attach the domain to Vercel. Keep the Vercel project around either way.
