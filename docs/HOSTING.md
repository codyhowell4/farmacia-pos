# Hosting

The frontend is 100% static (Vite build + the vanilla customer app) — any static host works. All backend logic is Supabase, independent of where the frontend is served.

## Current setup

| Platform | Role | URL |
|---|---|---|
| **Cloudflare Pages** (`apolofarmacia`) | Production | `app.apolofarmacia.com.mx` (+ `apolofarmacia.pages.dev`) |
| **Vercel** | Testing / staging front-end | `farmacia-pos.vercel.app` |

The apex domain (`apolofarmacia.com.mx` / `www`) is **reserved for the future marketing website** — no DNS records point it anywhere yet. The app lives on the `app.` subdomain.

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
