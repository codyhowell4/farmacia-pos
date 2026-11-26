# AGENTS.md — Pharmacy POS (Farmacia POS)

> This file is intended for AI coding agents. It describes the project architecture, conventions, and workflows so you can be productive without prior knowledge.

---

## Project Overview

This is a **Pharmacy Management System** (Spanish: *Sistema de Punto de Venta para Farmacias*) built as a single-page React web application. It provides:

- **Point of Sale (PoS)** — sales cart, barcode search, checkout with multiple payment methods (cash, card, transfer, insurance, split payments), prescription (Rx) tracking, price overrides, discounts, receipts.
- **Inventory Management** — medicine catalog, stock levels, low-stock alerts, expiry tracking, batch numbers, barcode support, stock adjustments with audit trail.
- **Admin Dashboard** — user management, sales history, shift management, audit logs, suppliers, purchase orders, COFEPRIS reports, analytics, tax settings, bank accounts.
- **Shift Management** — open/close cash shifts with variance calculations.

The UI language is **Spanish (Mexico)**. Currency is **Mexican Peso (MXN)**. Tax handling is **IVA @ 16%** (configurable).

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 (functional components + hooks) |
| Build Tool | Vite 4 |
| Language | JavaScript (ES modules, `.jsx` extension) |
| Styling | Tailwind CSS 3 + `tailwindcss-animate` |
| UI Components | shadcn/ui (New York style) + Radix UI primitives |
| Icons | `lucide-react` |
| Animations | `framer-motion` |
| Routing | `react-router-dom` v6 |
| State/Auth | React Context (`AuthContext`, `ShiftContext`) |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| Toast Notifications | `sonner` + custom `use-toast` hook |
| Helmet | `react-helmet` for page metadata |

---

## Project Structure

```
pharmacy-pos/
├── src/
│   ├── App.jsx                 # Root router, protected routes, providers
│   ├── main.jsx                # Entry point (ReactDOM.createRoot)
│   ├── index.css               # Tailwind directives + CSS variables + global gradient bg
│   ├── pages/                  # Top-level route components
│   │   ├── LoginPage.jsx
│   │   ├── ForgotPasswordPage.jsx
│   │   ├── ResetPasswordPage.jsx
│   │   ├── AdminDashboard.jsx  # Shell with nested admin routes
│   │   ├── AdminSettings.jsx
│   │   ├── PoSDashboard.jsx    # Main cashier screen
│   │   ├── InventoryDashboard.jsx
│   │   ├── ReportsPage.jsx
│   │   └── HomePage.jsx
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components (button, dialog, input, table, etc.)
│   │   ├── admin/              # Admin sub-pages (AdminUsers, AdminSales, AdminInventory, ...)
│   │   ├── ProtectedRoute.jsx  # Role-based route guard
│   │   ├── ShiftGate.jsx       # Ensures an open shift before allowing PoS access
│   │   ├── CloseShiftModal.jsx
│   │   ├── ReceiptModal.jsx
│   │   ├── PatientModal.jsx
│   │   ├── PrescriptionModal.jsx
│   │   ├── ReturnModal.jsx
│   │   └── ...
│   ├── contexts/
│   │   ├── AuthContext.jsx     # Supabase auth, profile fetch with retry, login/logout
│   │   └── ShiftContext.jsx    # Open/close shifts, cash calculations
│   ├── lib/                    # Core utilities & data layer
│   │   ├── supabase.js         # Supabase client singleton
│   │   ├── db.js               # ALL database operations (700+ lines, the data API)
│   │   ├── auditLog.js         # Audit action constants + async logger
│   │   ├── currency.js         # MXN formatter, IVA calc, tax settings (localStorage fallback)
│   │   ├── utils.js            # `cn()` — Tailwind class merge helper
│   │   └── exportUtils.js      # CSV export utilities
│   ├── services/
│   │   ├── reportsService.js   # COFEPRIS report queries + CSV helpers
│   │   └── dashboardReportsService.js
│   └── hooks/
│       ├── use-mobile.jsx
│       ├── use-toast.js
│       └── useIdleLock.js        # Idle screen lock (PIN to re-enter): 60 min in /doctor, 30 min elsewhere (mounted in App.jsx)
├── tools/
│   ├── generate-llms.js        # Build-time script generating public/llms.txt from Helmet metadata
│   └── install-missing-components.js
├── plugins/                    # Vite dev-only plugins (visual editor, selection mode, iframe routing)
├── public/
│   ├── .htaccess
│   └── llms.txt                # Generated at build time
├── supabase/schemas/supabase_schema.sql         # Canonical database schema with RLS policies
├── SUPABASE_SETUP.md           # Human onboarding guide for Supabase setup
├── .env.example                # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── vite.config.js              # Vite config with custom plugins, @/ alias, error handling
├── tailwind.config.js          # shadcn/ui Tailwind theme (CSS variables, border-radius, keyframes)
├── eslint.config.mjs           # Flat ESLint config (React + Hooks + Import)
├── jsconfig.json               # Path alias `@/*` -> `./src/*`
├── components.json             # shadcn/ui configuration
└── vercel.json                 # SPA rewrite: /* -> /index.html
```

---

## Build & Development Commands

```bash
# Install dependencies
npm install

# Development server (http://0.0.0.0:3000)
npm run dev

# Production build
npm run build
#   └─ runs `node tools/generate-llms.js` first, then `vite build`

# Preview production build
npm run preview

# Lint (quiet mode)
npm run lint
```

> **Note:** There is **no test suite** in this project. Testing is manual.

---

## Environment Variables

Create `.env` from `.env.example`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

> `.env` is gitignored. These are the **only** required environment variables.

---

## Code Style Guidelines

### Language & Conventions
- **Source language:** JavaScript (JSX). No TypeScript.
- **File extension:** `.jsx` for all React components, `.js` for utilities.
- **Comments:** Mixed English and Spanish. Error messages and UI text are **Spanish**.
- **Currency:** Always use `formatMXN(amount)` from `@/lib/currency` — never raw `toLocaleString`.

### Imports & Aliases
- Use the `@/` alias for all project imports:
  ```jsx
  import { Button } from '@/components/ui/button';
  import { useAuth } from '@/contexts/AuthContext';
  import { formatMXN } from '@/lib/currency';
  ```
- `jsconfig.json` and `vite.config.js` both map `@/` to `./src/`.

### Component Patterns
- Functional components with hooks.
- State managed via React Context for global concerns (auth, shifts).
- Local state via `useState`. Side effects via `useEffect`.
- Forms use controlled inputs with `e.preventDefault()`.
- Dialogs/modals use Radix-based `@/components/ui/dialog`.

### Tailwind / Styling
- The global body has a gradient: `bg-gradient-to-br from-blue-50 via-indigo-50 to-slate-100`.
- Each dashboard uses its own subtle gradient background (PoS = green, Inventory = purple, Admin = blue/slate).
- Use `cn(...)` from `@/lib/utils` when conditionally merging Tailwind classes.
- shadcn/ui components live in `src/components/ui/` and follow the standard shadcn patterns.

### ESLint Rules (Summary)
- Enabled: `react.configs.recommended`, `react-hooks.configs.recommended`, `importPlugin.flatConfigs.recommended`.
- **Disabled (intentionally):** `prop-types`, `no-unused-vars`, `react/react-in-jsx-scope`, `react/jsx-uses-vars`, `import/no-named-as-default`, `import/no-cycle`.
- **Critical rule enforced:** `no-undef: error`.

---

## Authentication & Authorization

### Roles
| Role | Access |
|------|--------|
| `admin` | All routes (`/admin/*`, `/pos`, `/inventory`) |
| `pos` | `/pos` only |
| `inventory` | `/inventory` only |

### Auth Flow
1. Supabase Auth handles email/password.
2. On login, `AuthContext` fetches the `profiles` row (with retry logic for trigger delays).
3. `ProtectedRoute` guards routes by `user.role`.
4. Admin PIN verification is used for sensitive operations (price overrides, voiding sales, returns). PINs are stored bcrypt-hashed in `profiles.pin_hash` and verified server-side via the `verify_admin_pin` RPC.
5. **Screen lock (2026-09-30):** inactivity locks the screen instead of logging out (`useIdleLock` → `LockContext` → `ScreenLock` overlay, all mounted in `App.jsx`); the Supabase session stays alive underneath. The user's own PIN unlocks it via the `verify_profile_pin` RPC (any role; audit-logged; a profile with no `pin_hash` accepts the default **1234**). Users change their PIN via `set_my_profile_pin` from Admin → Configuración or doctor portal → Mi Perfil (`ChangePinCard`); admins can also set anyone's PIN from Usuarios. The lock flag persists in `sessionStorage` (`apolo:screen-lock` = user id) so a reload cannot bypass it; `login()`/`logout()` clear it. `verify_admin_pin` deliberately does NOT accept the 1234 default — sensitive-operation approval always requires an explicitly set PIN.
6. **Staff onboarding by invite email (2026-10-18):** `createUser` (`src/lib/db.js`) no longer needs an admin-typed password by default — the account is created with a random one and the new user gets a `resetPasswordForEmail` activation email (lands on `/reset-password`, sets their own password). Admin → Usuarios also has a per-row "reenviar correo" (Mail icon) action and an opt-in "Establecer contraseña manualmente" checkbox for email outages. **Staff Mi Perfil:** `src/components/StaffProfile.jsx` (name, timezone, password change, `ChangePinCard`) is mounted at `/admin/profile` (Admin nav → Configuración) and as a "Mi Perfil" header dialog in the POS and Inventory dashboards. The doctor portal keeps its own richer Mi Perfil.

---

## Database Architecture (Supabase)

### Multi-Tenancy
- Data is isolated by **`org_id`** (organization).
- **Row Level Security (RLS)** is enabled on all tables.
- The `get_my_org_id()` SQL function resolves the current user's org.
- `profiles` has an `admin_profiles_all` policy allowing admins to manage users within their org.

### Key Tables
- `organizations`, `locations` — multi-tenancy hierarchy
- `profiles` — extends `auth.users` with role, org, location, PIN
- `inventory` — medicines with barcode, expiry, batch, Rx flag, stock count
- `product_links` — symmetric links between equivalent products (other brand / discounted); linked stock suppresses reorder recommendations (AdminReorderReport "cubiertos por vinculados") and, via `buildLinkedStockMap`, keeps covered low/out items out of the Inventario inteligente Agotados/Stock bajo/Reorden tabs + summary cards (rows show a green "Cubierto (N)" badge instead of the risk score) and annotates the /inventory qty cell ("cubierto: N pzas en vinculados")
- `partners` — partner businesses ("afiliados") offering member discounts; managed in Admin → Afiliados, read publicly via `get_public_partners` RPC. Self-register at `afiliados.apolofarmacia.com.mx` (`affiliate-signup` edge fn); owners edit their own listing/logo via `get_my_partner`/`update_my_partner` RPCs and get a 10% poster coupon (`generate_partner_coupon` → `discounts` table) from the portal
- `sales`, `sale_items`, `sale_payments` — transactions (supports split payments)
- `returns`, `return_items` — return processing
- `shifts` — cashier shift tracking
- `discounts` — promo codes (% off)
- `suppliers`, `purchase_orders`, `purchase_order_items` — supplier management
- `audit_log` — immutable action log
- `arco_requests` — LFPDPPP ARCO/privacy requests (admin-managed, Admin → ARCO / Privacidad)
- `tax_settings` — per-org IVA settings
- `bank_accounts` — transfer destination accounts
- `stock_adjustments` — manual inventory adjustments with reason
- `prescriptions` — COFEPRIS prescription records
- `pulsera_daily` — Pulsera Apolo Básico (FitPro-protocol band, Web Bluetooth in the customer portal's Pulsera section) wellness data: one row per customer per day (pasos, distancia_m, kcal, última FC/SpO2/PA, batería, firmware), upserted from `public/customer-app/js/pulsera.js`. RLS: customer reads/upserts own rows, staff read-only. Patient-generated consumer-band data — NOT part of the legal expediente (NOM-004); localStorage stays the instant cache, this table is the durable copy.

### Schema File
The canonical schema is **`supabase/schemas/supabase_schema.sql`**. Additional migration/fix files exist (`supabase/schemas/PHASE1_SCHEMA.sql` through `supabase/schemas/PHASE5_SCHEMA.sql`, `supabase/schemas/COMPLETE_DATABASE_FIX.sql`, etc.) — these are historical; the single source of truth for new setups is `supabase/schemas/supabase_schema.sql`.

---

## Key Business Logic

### Sales & Checkout (`PoSDashboard.jsx`)
- Barcode scanner auto-adds on exact match.
- Prescription-required (Rx) items no longer block entry to checkout: the Cobrar screen opens immediately and the receta modal is launched from there ("Agregar información de receta"). 'Finalizar venta' stays disabled until patient name, doctor name, and folio (Rx #) are captured; patient phone/email optionally auto-registers the customer. The modal also requires cédula profesional (6–8 dígitos), blocks future receta dates and duplicate folios per org (DB trigger `prescriptions_unique_folio` backs this up), blocks antibiotic recetas older than 30 days, and flags antibiotic recetas as `receta_retenida`.
- Cobrar upsell note: when no membership is applied, an amber "Con membresía ahorraría $X" box shows hypothetical member savings (items named "Consulta" priced free + 10% off the rest — informational only) plus "Su total hoy sería: $Y" (post-savings total incl. IVA). A Membresía card (`MembershipPosLookup`) sits under Cliente so a just-registered member can be searched and applied to the sale without returning to the cart.
- Price changes > 10% require admin PIN.
- Supports split payments across multiple methods.
- IVA is calculated post-discount.
- Inventory is decremented via `decrement_inventory` RPC (with manual fallback).
- Closed-sale receipts can be reprinted from Admin → Ventas: expand the sale row and click "Reimprimir recibo" — it reopens `ReceiptModal` (auto-print) with data mapped from `sales`/`sale_items`/`sale_payments`. Voided sales print with a "VENTA ANULADA" banner.
- Lost sales ("Venta perdida"): from the POS cart, staff log freeform items customers asked for that were unavailable (`LostSaleModal` → `lost_sales` table, deliberately no inventory FK). Previously logged names come back as searchable suggestions so recurring requests accumulate under one name. Admin → Análisis → Ventas perdidas (`AdminLostSales.jsx`) shows a per-item × per-month velocity grid plus recent entries (deletable).
- PUNTOS per-turno gamification (`PuntosBar.jsx`, mounted by `ShiftGate`, visible on both POS views): live bottom bar (0–500 red, 501–1000 amber, 1001–1500 green, 1501+ blue; meta 1,500) fed by `shift_points_summary` + realtime. Sales earn `floor(total)` points automatically (`sale_points_insert_trg` → `shift_point_events`, only sales with `shift_id`); same-day (CDMX) voids/returns subtract via reversal events, cross-day ones don't touch history. Manual activities (pitch membresía 5, reseña Google 5, volantes 5, llamada 10, A-Frame checkbox 25 — `point_activity_types`) autosave as per-shift counters via the `set_shift_activity_count` RPC. Admin → Análisis → KPIs (`AdminKpis.jsx`): tiles for current turno / hoy / 14-day average / today per activity + scrollable per-turno table.

### Inventory (`InventoryDashboard.jsx`)
- Low-stock threshold per item (default 0 — alerts only when out of stock).
- Expiry alerts: orange (< 30 days), yellow (< 90 days), red (expired).
- Stock adjustments require a reason and are logged in `stock_adjustments`.
- Optional per-product fields (2026-10-19): `laboratorio` (lab/manufacturer, also a CSV-import column and table-search term) and `image_url` (product photo; uploads go to the public `inventory-images` storage bucket with staff-only writes, via `uploadInventoryImage` in db.js; thumbnails show in the add/edit dialog and the table's Nombre cell). Migration: `20261019120000_inventory_laboratorio_image.sql`.

### Payments — Stripe (2026-10-21, replaces PayPal for new billing)
- **All NEW billing is Stripe** (card form, 3DS handled by Stripe.js). Existing `payment_processor='paypal'` members keep renewing on PayPal — the 5 `paypal-*` edge functions stay deployed for them.
- **Membership signup** (public `/membresias` + admin-assisted): card form → `stripe-membership-signup` (public; two-phase for 3DS: `start` creates customer/PM/subscription with `payment_behavior=default_incomplete` → client confirms → `confirm` provisions: `public_signup_membership` RPC, portal account, notifications; orphan subs are cancelled on guard refusals).
- **POS card**: checkout Tarjeta now mounts a Stripe card element (no more typed approval code). Flow: `stripe-pos-charge` (staff JWT) `authorize` (manual capture; `setup_future_usage` when the ticket carries a membership signup) → `confirmCardPayment` → sale → `capture`; sale failure → `void`. Membership signup on a card ticket then calls `subscribe` (subscription with `trial_end` = +1 month — the first month already rode the ticket). Membership fee products clicked in POS search open `MembershipSignupDialog` with the plan preselected (`initialPlan` prop).
- **Teleconsulta**: `stripe-capture-consult` (`action:'create'` makes the PaymentIntent with metadata-bound appointment; verify path enforces metadata + amount before creating the Daily room).
- **Renewals**: `stripe-webhook` (signature-verified, `stripe_webhook_events` dedupe) — `invoice.paid` with `billing_reason='subscription_cycle'` → `record_membership_payment` + `next_renewal_date` from `current_period_end`; `invoice.payment_failed` → paused + notify; `customer.subscription.deleted` → cancelled (cancels are `cancel_at_period_end`). The renewals cron and `_impl_record_membership_payment` skip `stripe` rows exactly like `paypal` rows (migration `20261021120000_stripe_memberships.sql`).
- **Admin**: status edits on Stripe memberships sync via `stripe-subscription-status`; cancellation self-service (`cancel-my-membership`) cancels Stripe at period end.
- **Primer mes gratis (2026-10-21):** all plans bill from day 30 — signups use a SetupIntent (card 3DS-verified, nothing charged) + subscription with `trial_end=+30d`; payment #1 is recorded at $0 but still counts toward estudios milestones (`payments_made`). POS signup fee rides the ticket at $0 (`pos_register_membership(p_free_first_month)`); $0 membership-only tickets vault the card via `stripe-pos-charge` action `setup`.
- **Plan Empresa (2026-10-21):** public signup at `/membresia-negocios` — $100 MXN/mes per employee (Stripe quantity = seats), company picks seats, then assigns them at `/membresia-negocios/activar?setup=<token>` (48 h token on the membership row): each employee (name + email OR phone) joins the roster (`membership_members.phone` exists for this) and gets the set-password email. The employer manages the roster from the customer app's "Mi Empresa" section (`empresa-roster` edge fn — add/remove bumps the Stripe subscription quantity so billing adjusts). Benefits per employee = Individual minus the pulsera; visits pool = 2 × seats shared. Edge fns: `empresa-signup` (public, SetupIntent two-phase), `empresa-setup` (public, token-gated), `empresa-roster` (JWT, owner-only). Migration: `20261021130000_empresa_and_free_month.sql`.
- Stripe catalog (live): Product/Price `Membresía Apolo Individual` $150 MXN/mes, `Membresía Apolo Familiar` $500 MXN/mes; webhook endpoint registered on the Stripe account. Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_INDIVIDUAL/FAMILIAR` (edge secrets); `VITE_STRIPE_PUBLIC_KEY` + price IDs are frontend env.

### Servicios RNP — recargas, paquetes, pagos de servicios, tarjetas de regalo (2026-11-24, live)
- POS header **Servicios** button → `ServiciosModal` (4 tiles; company/product chips built from the LIVE `obtenerProductos` catalog; phone typed twice with mismatch warning; confirm screen with the number in large type + "El cliente confirmó" checkbox). All 4 tiles on (`RNP_SERVICIOS_FORM_READY = true` after the live catalog review).
- All RNP calls go through the `rnp-servicios` edge function (JWT + active admin/pos; secrets `RNP_USER`, `RNP_PASSWORD`, `RNP_API_KEY`, optional `RNP_STORE_EMAIL`). Every successful RNP response may carry a cost: `obtenerProductos` is served from the org-wide `rnp_catalog_cache` (RNP called at most once per category per 24 h, claim column prevents concurrent refreshes, failed refreshes cool down 10 min) and `obtenerSaldo` runs only when the Servicios modal opens. Every request/response is logged in `rnp_transactions` (credentials stripped; admin-read RLS; service-role writes only; no deletes; request columns frozen). Migration: `20261124120000_rnp_servicios.sql` (also adds `sale_items.rnp_op_id`).
- **Live catalog facts (verified 2026-11-24, `rnp-servicios` v2, catalog normalizer v2):** shape `Productos > Resultado > Carrier[@id,@nombre] > Producto[@tipo]`. Recargas (23 carriers): `Nombre, Monto, VIP`; RNP params **Carrier = carrier `@id`, Monto = catalog Monto**. Paquetes are their own carriers (`TELCEL_INTERNET_AMIGO`, `TELCEL_SIN_LIMITE`) with **coded Monto** = price×1000 + suffix (`10005` → $10): sent verbatim, price decoded and only kept when it appears in the product name; the edge fn checks `floor(monto_param/1000) == monto`. Servicios (32 billers) and tarjetas (25 brands): `Nombre, Concepto, Monto ("Monto Libre" = open), Comision, Pines`; **Carrier = product `Nombre`** (RNP manual: `producto_nombre`, e.g. `FACTURAS TELMEX`; tarjetas share a Nombre across amounts and are told apart by Monto — products with a duplicate Nombre+Monto, 5 Cinépolis items, are hidden in the POS). Gift-card PIN returns in `<Codigo>` (printed on the ticket). realizarRecarga Monto is an integer. `Concepto` names the reference field: servicios (and 6 tag-type tarjetas) send that reference in `Phone` (4–40 A–Z/0–9); "CELULAR PARA ENVIO DE CÓDIGO" tarjetas send a 10-digit cell. `realizarServicio` (servicios + tarjetas) requires the **customer's email** — captured on the form, no store fallback. Old cache rows are rebuilt from `raw` on read (no RNP call).
- **Pendientes / devoluciones / saldos (2026-11-24, migration `20261124180000_rnp_pendientes_saldos.sql`, edge fn v4):** Admin › **Servicios RNP** (`/admin/servicios-rnp`, `AdminRnpServicios.jsx`; sidebar badge = pending count, Admin-wide amber banner when pending > 0 or a balance is low). Pending ops (status `pendiente`/`enviando`, never resent) are resolved with `rnp_resolve_pending` (admin, definer): **Aprobada** requires the folio/autorización from RNP portal › Reportes; **Fallida** sets status `rechazada` + `resolution='fallida'`, zeroes the service + comisión `sale_items` (original_price kept), reduces `sales.total/subtotal` and the sale payment (so every income report excludes it), removes the comisión's cashier points and records `refund_amount`/`refund_method` (efectivo|tarjeta = sale's method), `refund_status='por_devolver'`. `rnp_mark_refunded` records delivery (efectivo must name an OPEN shift = the drawer). Resolutions/deliveries are frozen by the guard trigger and written to `audit_log` (`RNP_PENDIENTE_RESUELTA`, `RNP_DEVOLUCION`).
- **Corte de caja:** `rnp_shift_summary(shift_id)` (any org staff) → RNP lines per category, services vs comisiones, cash vs card, pending count, and the drawer adjustment `+cash_add_back` (Fallida cash ops of this shift whose refund has not left this drawer) `−cash_refunds_out` (cash refunds paid from this drawer for other shifts' ops). Used by `ShiftContext.closeShift`, `CloseShiftModal` (own "Servicios RNP" lines; RNP lines no longer fall into "Sin departamento") and Admin › Turnos force-close (`loadRnpShiftSummary` / `rnpCashAdjustment` in `rnpServices.js`).
- **Reports/KPIs:** service amount = pass-through (owed to RNP), comisión = income. Admin › Ventas and Resumen show both as their own cards. Cashier points: `sale_items_rnp_points_trg` adds an `rnp_adjust` event (−service amount) so pass-through earns no points. `profit_report` view rewritten (same columns): per-sale revenue minus RNP service amounts, voided excluded, no item fan-out.
- **Contabilidad / export (2026-11-24):** each closed shift's revenue row is split: RNP lines (service + comisión, `getRnpTotalsByShift` in `db.js`) are booked as **Ingresos › Servicios** (own row, `totalSales` null so sale counts don't double); Medicamento keeps `total_revenue − RNP amount at close` (a Fallida resolved after the close drops out of Servicios only). Sales CSV (`exportSalesCSV`) has a last column `RNP` = `Servicio RNP` / `Comision RNP` / empty. The Turnos summary CSV (`exportShiftsSummaryCSV`, Admin › Turnos) uses the same split: an extra `Servicios` row per shift with RNP (`# de ventas` empty so tickets are not double-counted); if the RNP totals cannot load it exports as before and the toast says so.
- **Balances:** `rnp_balance` (admin-read; service-role writes): last `obtenerSaldo` (cashier opens Servicios) and `NuevoSaldo` after each sale (recarga → recargas pool, servicio → servicios pool). Never an extra RNP call. `low_balance_threshold` (default 200, `RNP_LOW_BALANCE_DEFAULT`) set via `rnp_set_low_balance_threshold` from the Admin page; the `saldo` action returns it so the POS Servicios modal warns too.
- **Result classification (fixed 2026-11-25, edge fn v5):** RNP's `<Exito>` is free text ("Recarga realizada con éxito", "Consulta exitosa"), not a flag. Sale ops: **aprobada** = replied + no non-empty `<Error>` + (`<Exito>` has any text OR Autorizacion/Venta present); **rechazada** = non-empty `<Error>` and no success sign; **pendiente** = timeout / fault / unreadable / contradictory (Error AND a success sign). Read-only calls (`readOnlyError`): OK = replied + no `<Error>` + (`<Exito>` text OR expected data tags). The first live recarga (Venta 10061468) was misfiled as pendiente by the old exact-word check.
- **Personal discount codes / CODY (2026-11-25, migration `20261125120000_codigo_cody.sql`):** `discounts.restricted_to_profile_id` (only that profile may use the code: POS refuses others, and trigger `sales_restricted_discount_guard_trg` refuses any sale carrying it unless `auth.uid()` is the owner; `discounts_restriction_guard_trg` stops anyone else re-pointing/unrestricting it) and `discounts.include_rnp` (the % also covers RNP lines + comisiones; CHECK: only on restricted codes). **CODY** = 100 %, owner Cody Howell's admin profile, include_rnp, no expiry/usage limit, case-insensitive (`findDiscount` ilike). On such a sale the RNP lines are still sent to RNP (charged to the RNP balance) but stored at the CHARGED price ($0, `original_price` = face value) and `sales.discount_amount` holds only the non-RNP discount, so every RNP income report reads $0; checkout refunds for rejected lines and `ServiciosResultDialog` use the charged amount. `rnp_shift_summary` now reports charged amounts from `sale_items` (not `rnp_transactions.amount/fee`); a Fallida on a $0 line records `refund_amount` 0 with no refund owed; Contabilidad's at-close figure adds back `refund_amount` for post-close Fallidas. Other codes: `include_rnp` false → unchanged.
- Fees (Comisión Apolo, charged on top, its own cart/ticket line) and the store email live in `src/lib/rnpServices.js` (`RNP_FEES`, `RNP_STORE_EMAIL`, `RNP_SEND_CUSTOMER_EMAIL`).
- Flow: service + comisión lines go in the cart (qty 1, no price edits, no discount, outside the IVA base) → cobro (cash or card only, no split, no membership signup on the same ticket) → each line sent ONCE (`op_id` idempotency key; a retry replays the stored result) → result dialog: aprobada / pendiente (no status-check exists: never resend, reconcile from the log) / rechazada or no_enviada (removed from the sale; exact amount to return shown — card refunds go back on the terminal). Folio/autorización/código print on the ticket. Sales with RNP lines can't be voided and RNP lines can't be returned (no refunds at the provider).

### Shifts (`ShiftContext.jsx`)
- A cashier must open a shift (starting cash) before using PoS (`ShiftGate`).
- Closing a shift calculates expected cash from DB sales and shows variance.

### Customer app — health onboarding wizard (2026-09-30)
- One-time, **skippable** 4-step questionnaire (datos básicos + peso/talla, alergias, padecimientos, medicamentos actuales) in `public/customer-app/js/app.js` (`checkHealthOnboardingGate` / `renderHealthOnboarding`), shown full-screen right after the consent gate on every auth path while `customers.health_onboarding_completed_at` is NULL. Unlike the consent gate it **fails open** (a check error never locks the app) and "Completar después" also sets the flag.
- Answers write through the existing patient self-service RPCs (`update_my_customer_profile`, `add_my_allergy`, `add_my_history_entry` — `added_by_role: 'patient'`), landing in the same expediente fields the doctor portal reads. Explicit negations ("Sin alergias conocidas") are stored as `status: 'denied'` entries, which the receta allergy-conflict check ignores by design.
- `add_my_history_entry`'s section whitelist includes `medicamentos_actuales` (migration `20260930120000_health_onboarding.sql`, also creates `complete_my_health_onboarding()` + the flag column); the section renders in the doctor's `PatientMedicalHistory` SECTIONS, as a blue "Medicamentos actuales" banner in `PatientWorkspace` Resumen, and in the app's own `HISTORY_SECTIONS_APP` editor.

### Public kiosk flows (`tablet-checkin` edge function)
- Public (verify_jwt=false) function powering the in-store tablet (`/registro/`), the customer-app check-in (`?checkin=1`), and the no-account kiosk (`/consentimiento/`). Abuse controls: honeypot + per-IP sliding-window rate limiting (`rate_limit_events` table, fails open). Every flow ends in a confirmed walk-in cita (doctor picked by `doctor_profiles.availability`) + a medical note prefixed for the doctor portal parser (auto-report notes show an amber "identidad por confirmar" badge in the portal).
- Modes: `register` (tablet: email/phone + account provisioning; `guest:true` for the consentimiento kiosk: name+DOB+sexo (+ optional CURP, validated with the RENAPO checksum — format-only is rejected), no account, name+DOB record reuse), `lookup` (returning-patient search by name+DOB, reports `consents_signed`; response is minimal — no `full_name`), `checkin` (app: by email/phone; kiosk: by `customer_id` re-verified against name+DOB, can insert missing consent docs). Matching is exact-normalized first, then an unambiguous token-subset "loose" match, then a typo tier (Damerau-Levenshtein ≤ 2 edits, name ≥ 12 chars, ≤ 12% of length, unique-closest wins) so spelling slips and name variants don't fork the expediente — ambiguity at any tier means no reuse. **Account-linking reuse (phone/email) ALWAYS requires the name+DOB match before provisioning** — an unverified match creates a new row instead (round-3 takeover fix). Register mode also rejects junk payloads (implausible names/DOBs) and is rate-limited tighter (6/10 min/IP).
- Minor handling: `register` requires a valid DOB for everyone and minority is derived **server-side** from it (client flags ignored; the `/registro/` tablet collects dd/mm/aaaa DOB and auto-reveals the guardian block). DOB (< 18) forces guardian data on register/check-in (not on `lookup`, which writes nothing): name + parentesco (padre/madre/tutor) + INE last-4 on kiosk flows, persisted on `customers.guardian_name/guardian_relationship/guardian_id_ref` (a `customers_minor_guardian` DB trigger hard-rejects minor rows without them). The customer record is the **minor** (own name + DOB, so returning minors match in `lookup`), the guardian signs the consent documents (`signer_name` + `signer_relationship`/`signer_id_ref` — parental consent), and the tutor is noted in `customers.notes` and the cita notes. Remote signups (customer app, membership page, `family-member-signup`) likewise require DOB + guardian-for-minors.
- After signing, the kiosk offers a print-copy of the 4 documents with signer data (NOM-004 10.1 patient copy). Customers with clinical records cannot be hard-deleted (trigger `customers_protect_evidence`; NOM-004 5.4) — empty shells still delete.
- The 4 consent documents are **canonical server-side** in the `consent_texts` table (versioned; definer-only reads — no client grants). `sign_consent_documents` (app) and `tablet-checkin` (kiosk) substitute the latest active text by type, ignoring client-supplied title/content (round-4, D-N3). `public/customer-app/js/consentDocs.js` is now only the DISPLAY copy (with a synced copy in `src/lib/consentTexts.js`) — when a text changes, insert a new `consent_texts` version AND update both JS copies.

### Doctor portal / e-receta hardening (2026-09)
- **Round-4 deferred fixes (2026-09-22):** D-N3 closed (`consent_texts` + canonical server-side consent text in `sign_consent_documents` and `tablet-checkin`). tablet-checkin `provisionAccount` gates the already-registered fallback behind `allowReuseLink` (only an email-matched, identity-verified customer row may link to an existing auth account — otherwise the account stays unlinked and no recovery email is sent). Online store REOPENED: `place_store_order` security-definer RPC (server-side pricing with member discount incl. claimed family memberships, FOR UPDATE stock locking, Rx/controlled products rejected online, atomic sale+items+decrement+`inventory_movements`); the customer app's `placeOrder` fails closed (no more localStorage phantom orders) and shows the server total; store nav entry points restored. PostgREST 1000-row silent truncation fixed via `fetchAllPages` in `src/lib/db.js` (+ customer-app `api.js` `_fetchAllPages`) applied to all unbounded list queries (sales, appointments, preorders, customers, consents, shifts + ~40 more incl. both report services). DB migration: `20260922000000_consent_texts_and_store_order.sql`.
- **Round-3 final audit (2026-09-21):** `docs/FINAL_AUDIT_ROUND3.md` — speed + internal pen test + norma re-verification. Remediated: anonymous reads of financial/staff data via security-definer views + live RLS drift on `expenses`/`manual_revenue` (views now `security_invoker` + anon revoked; cashier emails masked in shift reports), tablet-checkin phone-reuse account takeover (name+DOB now required before account linking), membership RPC authz (`record_membership_payment` & friends wrapped with staff/owner guards), verify-receta enumeration (compound folio+sig key, unguessable folio suffix), PayPal subscription replay (unique index + 409), customer column guards on `appointments`/`customers` (cancel-only; guardian/notes/org/medical_history pinned), server-side preorder pricing, deactivated-staff checks on PIN/video-room/sign-document, `customer-documents` bucket verified private. DB migrations: `20260921000000_final_audit_security_lockdown.sql`, `20260921010000_final_audit_hardening.sql`.
- **Controlled substances:** `inventory.controlled_group` ('II'/'III', set in Inventario item edit) excludes items from receta autocomplete and hard-blocks them at receta save — controlados must go on COFEPRIS foliada paper, never on our e-receta. Reports tab is "Medicamentos con Receta" (flattened per-item rows; it is NOT a controlled-substances report).
- **Recetas require cédula:** `doctor_profiles.license_number` (6–8 digits, editable in AdminDoctors and DoctorProfile) is mandatory before creating recetas. `doctor_profiles.escuela` (universidad de egreso, optional, editable in the same two places) is snapshotted onto `prescriptions.doctor_escuela` at receta creation and printed under the doctor's name/cédula in the header (PrintablePrescription, `src/lib/pdf.js`, `public/receta-view/`) — only when present, so older recetas render unchanged. Migration: `20261018120000_doctor_escuela.sql`. Folios are `RX-YYYYMMDD-NNNNN-XXXXXX` (daily counter + unguessable 6-char suffix, round-3). Signed recetas carry a QR pointing to the public verification page `public/verifica/index.html` → edge function `verify-receta` (verify_jwt=false, rate-limited): folio+sig are a **compound key** — details only when the presented sig fragment matches, otherwise indistinguishable `{"found":false}`; the QR carries both.
- **Teleconsulta (NOM-027):** `video-room` requires a registered customer with a signed `teleconsulta` consent before issuing a room (400/409 otherwise); Daily rooms are `private` with per-participant meeting tokens — patient URL in `appointments.meeting_url`, staff URL in `appointments.meeting_url_staff`. Video consulta notes require ubicación del paciente + identidad verificada (`consulta_notes.modality/tele_*`).
- **Append-only clinical records:** `consulta_notes`, `medical_notes` and `historia_clinica` all have DB triggers blocking UPDATE/DELETE; corrections are new versions/notes. Since 2026-09-25 the historia is **versioned** like consulta notes (`unique(customer_id)` dropped, `replaces_id` chain + `version` counter; the same migration added the missing `doctor_id` FK whose absence broke the `profiles:doctor_id` read embed and made saved historias display as "Pendiente"). Migration: `20260925120000_historia_clinica_fk_and_versions.sql`.
- **Consulta borradores (2026-09-25):** `PostVisitDialog` autosaves unfinished notes to `consulta_drafts` (NOT part of the legal expediente — mutable, excluded from exports, deleted on finalize) and the historia capture/edit autosaves to `historia_drafts`. A pg_cron job `finalize-consulta-drafts` (every 15 min) runs `finalize_expired_consulta_drafts()`: 24 h after the first save it inserts the note with explicit "not captured at auto-close" markers for empty sections, completes the cita, and deletes the draft — it NEVER emits a receta (draft meds are listed in the audit log instead) and on rejection (e.g. the NOM-004 6.1 historia gate) it keeps the draft and flags `finalize_error` for manual completion. Migration: `20260925130000_consulta_drafts_and_autofinalize.sql`.
- **Receta print from the consulta:** "Guardar e imprimir receta" (inside PostVisitDialog's receta section) issues + e.firma-signs the receta mid-consulta and opens the print preview without closing the note; finishing a consulta with meds auto-opens the same preview. Signed recetas remain sign-once / void-only.
- **Unified consultorio queue (2026-09-25):** the separate "Citas de médicos no disponibles" box is gone — `DoctorAppointments` shows ONE "Fila del consultorio" with unassigned citas ("Tomar cita") plus citas of doctors not clocked in (yellow "Cita agendada con Dr(a). X" note; "Cubrir" keeps the takeover-confirmation dialog + audit; Reagendar/Cancelar unchanged). Citas with a consulta draft or status `in_consulta` are excluded — they hold captured work pending the 24 h auto-finalize and cannot be taken over. **Safety net:** abandoned consultas (`in_consulta` > 24 h, NO draft — auto-finalize never fires for those) resurface in the queue from any date via `getStuckConsultas()` (red "Consulta abierta hace más de 24 h" note) unless the treating doctor is clocked in, and carry a "🔴 Abierta +24 h" badge in the doctor's own list.
- **Justificante médico wording (2026-09):** comprobante de atención only — qualitative "reposo relativo", never quantified rest days; the document states it is not an incapacidad (IMSS-only), per the medical team's instruction.
- **Audit reliability:** `logAudit` retries once, then queues failures to localStorage `audit_failed_queue` and toasts app-wide (sonner `Toaster` is mounted in `App.jsx` — both toaster systems are live).
- **Round-2 audit (2026-09-18):** `docs/GOVERNMENT_MOCK_AUDIT.md` — mock government inspection of POS/RLS/patient-app/SGSI. 44 findings (11 críticos, 12 altos, 14 medios, 7 bajos). **The 11 críticos (+ R2-24) are REMEDIATED** (see the doc's resolution log): signup trigger forces `role='customer'` + `profiles_protect_privileged` trigger, PINs bcrypt-hashed with `verify_admin_pin`/`admin_set_profile_pin` RPCs, org-wide policies replaced with `is_org_staff()` on all operational tables, `audit_log` append-only (admin read), prescriptions content-frozen (sign once / void only), customer-documents storage path-scoped, e.firma keys in `doctor_efirma` (owner-only) + hardened `sign-document`, `paypal-subscription` activates only on ACTIVE subscriptions, returns route meds to merma with PIN+reason, `controlled_register` + POS foliada capture, `rx_number_counters` locked. **The 12 altos are also REMEDIATED** (same doc, second resolution log): receta capture hardened (cédula 6–8, fecha rules, dup-folio trigger, `receta_retenida`), 32 antibiotics flagged + `src/lib/antibiotics.js` validators, clinical tables locked to `is_clinical_staff()` with POS on narrow `pos_*` definer RPCs, rate-limited `lookup-login-email` edge wrapper, receta PDF firma/vía + mandatory dosis/vía/frecuencia, allergy cross-check with audited override, `historia_clinica` de primera vez (NOM-004 6.1) + full expediente export (NOM-024 6.6.6), DOB+guardian on every remote signup (server-derived minority, `customers_minor_guardian` trigger), `arco_requests` + `revoke_consent` + `marketing_opt_out` promo suppression, aviso de privacidad unified/completed (secondary-purposes checkbox, encargados, localStorage/push §7). **The 14 medios + 7 bajos are also REMEDIATED** (same doc, third resolution log): POS audit detail complete (override incl. increases, void reasons, discounts, returns items), sale_items Rx/controlled snapshot + expired-sale server block + void→receta cascade, ticket fiscal/sanitary header + CURP masking + receta block, quarantine report, cron-secret send-notifications (fail-closed), consent signing via `sign_consent_documents` RPC + content freeze/hash + customer INSERT policy dropped, fail-closed consent gate + server-side booking gate, NOM-004 6.2 note completeness with explicit negations + author snapshots + full CDA header, in-person consent enforcement + walk-in orphan-note block, staff deactivation (`deactivated_at` + `admin_set_user_active`), 15-min idle logout, password min 10, family-member-signup rate-limit/DOB-factor/generic errors, generic edge errors (7 functions), kiosk autocomplete/idle-reset + logout purge, vendored supabase-js + security headers + scoped CSP, repo hygiene, backup/DR evidence register. Round 2 is fully closed; [ORG] items remain per the doc.

---

### Monedas Apolo — programa de lealtad (2026-11-25, migration `20261125200000_monedas_apolo.sql`)
- Coins (NOT cash, never spendable as money) earned for health goals and spent only on the rewards ladder at the register. **Opt-in** (aviso §5: loyalty is a secondary purpose): `coin_enrollments` (consent version + time, 6-char register code; `coins_enroll` / `coins_unenroll`). **Aviso §7** (app health metrics/medicines stay on the device): the ledger stores only that a goal was met (kind, coins, day/slot) — never weights, step counts or medicine names.
- Server-enforced rules (`coins_claim`, settings in `coins_settings`, editable in Admin › Monedas Apolo): steps 2 once/day; weight 3 once per ISO week; dose 1 per scheduled slot, only within ±60 min, max 3/day; chequeo 10 (staff side: chequeo appointment completed → trigger `appointments_chequeo_coins_trg`, or POS `coins_complete_chequeo` walk-in once/day); 7-day streak (≥1 goal per MX day) 15, again after 7 more days. `coin_ledger` is append-only (unique `(customer, kind, period_key)` enforces caps; cascaded customer deletes allowed). Balance = sum of the ledger. `coins_my_status()` gives the app everything (balance, streak, today, tiers, history, settings).
- Rewards ladder `coin_reward_tiers` (10 seeded; kinds percent/free_service/free_product/membership_month/device; `applies_to` marks which chequeo tests a free service covers). Redemption at the POS (**Monedas** header button → `MonedasModal`): `coins_staff_lookup` (name/phone/code), `coins_redeem` (row-locked balance check; logged with who/when in `coin_redemptions` + audit), `coins_cancel_redemption` (24 h, unapplied only), `coins_link_redemption_sale`. % rewards become the ticket discount with their cap (`discount.cap`), the wellness-product reward a `fixed` discount up to $80; a Monedas reward beats the membership % on that ticket. Free services / membership month / device are handed over by staff. Promo codes are unchanged (no cap/fixed); % rewards apply to the same base as promo codes (medicines are not excluded today, as with promo codes).
- Chequeo bookings: `appointments.service = 'chequeo'` (+ `service_detail` jsonb), still `type = 'in_person'` so every staff view shows them; customers can set `service` only at insert (`appointments_service_guard_trg`); `get_queue_status` ignores them.

### Customer app — App Apolo screens (2026-11-25, `public/customer-app/js/apolo.js`)
- Bottom nav: **Inicio, Salud, Monedas, Ahorro, Consulta** (Inicio is the home/landing page). Compras, Mis pedidos and Membresías live inside Ahorro (and the menu); Pulsera stays in the menu.
- `apolo.js` (registered from app.js via `registerApolo`): `renderInicio` (coin card + real streak — server streak when enrolled, on-device otherwise — "Gana hoy" goals, quick actions), `renderMonedas` (opt-in consent card, balance + register code, how to earn, ladder with progress, history), `renderAhorro` (`apolo_my_savings`, "¿Hay genérico?" via `apolo_generic_search` — OTC only — with "Apartar" → preorder, Recargas y pagos info tiles: paid at the register), `renderChequeo` (tests, day, 30-min slots 8:00–21:00, ayuno note, `[PRECIO]` from `coins_settings.chequeo_price` or "Gratis con tus Monedas" when a free_service tier covers the tests and the balance reaches it; books `appointments` with `service='chequeo'`), `apoloBreathe` (3-min 4-7-8; earns nothing).
- Device-only data (aviso §7), `localStorage` keys `apolo:*`: steps per day (manual entry, capped by `step_entry_max`), weights, medicines (name, times, supply → refill countdown; one-time import of the old smart-reminder schedules), doses taken, goal days, breathing sessions. Only "goal met" reaches the server (`coins_claim`).
- **Salud** tabs: **Mi control** (default) · **Bienestar** · Citas · Recetas. Mi control (`renderMiControl`): latest glucose / blood pressure from device entries + in-store readings (`appointments.nurse_vitals`: `glicemia`, `ta`, `weight_kg`, via `getMyStoreVitals`), status pills (glucose meta 80–130 en ayunas; BP Normal/Elevada/Un poco alta/Alta/Muy alta with an urgent-care warning ≥180/120), 7-day glucose chart with target band, weight trend, chequeo button, Mis medicinas with refill countdown and "Apartar mi resurtido" (preorder; sends the names, stated in the sheet). Bienestar (`renderBienestar`): mood (5 levels), stress (3 levels), 3-min 4-7-8 breathing, sleep, streak (+ days to the next 7-day bonus), weekly mood/stress chart. All device-only.
- Migration `20261125210000_apolo_ahorro.sql`: `apolo_generic_search(org, query)` (anon OK, OTC-only, non-controlled), `apolo_my_savings()`.

### Staff dates DD/MM/AAAA + POS header (2026-11-26)
- **Dates on staff screens:** use `src/lib/dateFormat.js` — `fmtDate` (DD/MM/AAAA), `fmtDateTime` (DD/MM/AAAA HH:MM, 24 h), `fmtTime`, all in America/Mexico_City regardless of the PC's locale; `daysUntil`/`isDateExpired`/`expiryLabel` for caducidad ('Caducado', 'Caduca hoy', 'Caduca en N días'; a product is sellable on its expiry day). Never `toLocaleString()` without a locale (English Windows → MM/DD) and never `new Date('YYYY-MM-DD')`.
- **Date entry:** `DateInput` (`src/components/ui/date-input.jsx`) — masked dd/mm/aaaa text + its own Spanish calendar (lunes primero, month/year selects). There is NO native `<input type="date">`: the old hidden native picker followed the PC locale (MM/DD) and, when left "incompleto", blocked forms with the browser's "fecha no válida" bubble (Inventario › Editar medicamento bug). Esc closes only the calendar, not the surrounding dialog.
- **POS header:** Pedidos en línea, Servicios, Monedas stay visible; "Venta ▾" = Devolución / Anular venta; "Mi perfil ▾" = Mi Perfil / Admin / Cerrar turno / Cerrar sesión. Menus return focus to the search (barcode scanner). Search results: ≥480px wide, anchored under the input, scrollable, full names + use/laboratorio + caducidad + price + stock, ↑/↓ + Enter (Enter without a highlighted row keeps the original submit/scan behaviour), Esc closes.
- pos.farmaciaatlas.com (Vercel) and app.apolofarmacia.com.mx (Cloudflare) both deploy from `main`.
- **Caducidad en la base (migration `20261126120000_caducidad_hora_cdmx.sql`):** `sale_items_prepare` (bloqueo de venta) and `get_inventory_intelligence` (is_expired / days_until_expiry) compare against `(now() AT TIME ZONE 'America/Mexico_City')::date`, never `current_date` (the DB runs in UTC, so after ~6 PM local it was already tomorrow). A product sells through its expiry day.
- Inventario UI and its audit-log texts are in Spanish (old audit rows keep their original English text).

### Aviso de Privacidad v3 + patient-reported health data + Google Analytics (2026-11-26, migration `20261126000000_aviso_v3_registros_salud.sql`)
- **Aviso v3** (owner-approved) is the active `consent_texts` privacidad (v2 inactive). Same text in `public/customer-app/js/consentDocs.js`, `src/lib/consentTexts.js` (PRIVACIDAD_TEXT) and `site/aviso-de-privacidad.txt` (public website build) — keep all four byte-identical (the currency check compares content). The in-app Aviso page renders from consentDocs.js.
- **Version-aware consent:** `sign_consent_documents` signs a type again when the latest signed copy is not the active text (before, any past signature blocked re-signing); `consent_is_current(customer, type)` / `my_consent_currency()` drive the app gate (`getMySignedConsentTypes` now returns only CURRENT types) — publishing a new text version makes everyone re-consent on next open, and the gate shows only the outdated documents. Secondary-purposes checkbox and "Privacidad y mis datos" switch name promociones, Monedas Apolo and Google Analytics.
- **Patient-reported data:** `patient_health_records` (kind vital/lab/vaccine/medicine/goal/food/steps/sleep, `client_id` idempotency, data jsonb, source 'paciente') and `patient_emergency_info` (info + contacts). RLS: customer reads/writes own rows, WRITE only when `can_write_my_health` (owns the row + accepted current aviso); clinical staff (admin/doctor) of the org read; nobody else. `public/customer-app/js/healthsync.js` mirrors the app's localStorage records (screens unchanged) after acceptance: first run uploads pre-v3 phone data, restores on a new device, propagates deletions only for records this device uploaded; mood/stress are device-only (not in v3). Logout: `clearHealthLocal()` runs BEFORE `clearAppData()` so clearing is never mirrored as deletions. Doctor portal: Historia tab → `PatientReportedData` ("Registrado por el paciente, no verificado", read-only, never merged into clinical vitals/notes).
- **Google Analytics (customer app):** `public/customer-app/js/ga.js`, G-VZTY34XFT0, only when logged in + signed the current aviso + `marketing_opt_out === false` (column defaults to false, so signing v3 is what makes consent known). Virtual page paths, `button_click` (button_label/button_location; labels redacted to `opcion` on salud/perfil/chequeo unless generic), login/sign_up (held until consent), appointment_booked, join_queue, checkup_booked, purchase (ids/categories), coins_earned, reward_redeemed (seen in Monedas history), membership_start (inactive→active seen on device), breathing_session_complete, mood_checkin. No user_id, no Google signals, no PII/health data. Debug: `?ga_debug=1`.

### Customer app — login wall, real data, one look (2026-11-25)
- **Login wall:** without a session only `renderWelcome` (apolo.js: Crear cuenta gratis / Iniciar sesión / Aviso de privacidad / Términos) and the auth + legal pages (`PUBLIC_PAGES` in app.js) render; `authResolved` shows a loading screen until the session check finishes; guests never get the nav/menu/search (`setAppChromeVisible`). API-level: `inventory_catalog` and `apolo_generic_search` are not readable with the anon key (migration `20261125240000_app_login_wall.sql`, which also adds `laboratorio` to the view → shown as the product brand).
- **No demo data:** data.js no longer seeds `apollo_medicines` or test orders (and purges them from devices); `getProducts` has no local fallback; the old "Catálogo Completo" route (`store`) renders the real shop. Menu shows the real name, membership and Monedas (no "María García" / "Nivel Plata • 350 pts").
- **No phantom bookings:** Cita en persona and refill requests never confirm a local-only record; without a server row the user gets an error.
- **Look:** `js/icons.js` (started from app.js) swaps every emoji used as an icon for a matching line icon (mockup style) and fixes legacy white-on-light text from the old dark "glass" theme (contrast guard); `css/apolo-unify.css` gives `.date-header` screens the navy page header and cards the mockup radius/border. Home statues served as WebP (`/brand/home-statue-*.webp`, 706 KB → 206 KB). The "¿Necesitas ayuda urgente?" Llamar button dials 911.

### Customer app — Cita en Persona wait / open state (2026-11-25)
- `public/customer-app/js/app.js` (`showInPersonConsulta`, `showLocationBooking`, `confirmInPersonBooking`): the ONLY wait shown is the live `get_queue_status` estimate. The localStorage `currentWait` (default 10, +15 per local booking) is no longer displayed or simulated. Rules (all three screens, helpers `inPersonOpenState` / `inPersonQueueState` / `fetchInPersonQueueState`): closed by store hours (location `hours` "8:00 - 22:00", America/Mexico_City, fallback 8–22) → Cerrado + "Abre hoy/mañana a las 8:00"; `doctors_on_clock = 0` → "Sin médico disponible", can't join; doctor on clock → real `estimated_wait_minutes` (0 → "Sin espera"); RPC fails / null → "No disponible", never a number, can't join. `confirmInPersonBooking` re-checks both before adding anyone. There is no "book a later time" in-person flow.

## Deployment

The frontend is fully static; Supabase does all backend work. See `docs/HOSTING.md` for the full setup.

### Cloudflare Pages (Production)
- Custom domain (DNS on Cloudflare). Build: `npm run build` → `dist/`.
- SPA fallback + cache headers live in `public/_redirects` and `public/_headers`.

### Vercel (Testing/staging front-end)
- `vercel.json` rewrites all routes to `index.html` (SPA fallback).
- Same repo, same `main` branch, same Supabase backend as production.

### Environment variables (both platforms)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_ORG_ID`
- `VITE_STRIPE_PUBLIC_KEY`, `VITE_STRIPE_PRICE_INDIVIDUAL`, `VITE_STRIPE_PRICE_FAMILIAR`
- LEGACY (existing PayPal members only): `VITE_PAYPAL_ENV`, `VITE_PAYPAL_CLIENT_ID`, `VITE_PAYPAL_PLAN_INDIVIDUAL`, `VITE_PAYPAL_PLAN_FAMILIAR`

### Build Output
- Vite builds to `dist/`.
- The build runs `generate-llms.js` to produce `public/llms.txt`.

---

## Security Considerations

- **Never commit `.env`** — it is gitignored.
- Supabase RLS policies enforce org isolation. Do not disable RLS.
- PINs are stored bcrypt-hashed in `profiles.pin_hash` (never plaintext). Admins set/clear anyone's via the `admin_set_profile_pin` RPC; users change their own via `set_my_profile_pin` (self-service, only `pin_hash` may move — the `profiles_protect_privileged` trigger allows it only under the function's transaction-local flag). Admin overrides verify via `verify_admin_pin` (admins only, no default); the screen lock verifies via `verify_profile_pin` (own PIN, NULL hash = default 1234). The legacy `profiles.pin` column is always NULL.
- All DB mutations go through `src/lib/db.js` which uses the authenticated Supabase client.
- pos/inventory roles reach customer data ONLY through the `pos_*` security-definer RPCs (`searchCustomersPos`, `createCustomerPos`, `searchPrescriptionsPos`, `searchMembershipsPos`, `getMembershipByIdPos`, `getSaleForReturnPos` in `db.js`) — direct SELECT/INSERT/UPDATE on `customers` and other clinical tables is restricted to admin/doctor (clinical staff).
- Price overrides, voids, and user management require admin PIN or admin role.

---

## Compliance (Normas)

Every change request must be checked against the normas before implementing (NOM-004, NOM-024, NOM-027, LFPDPPP, LGS arts. 42 Bis & 245–255, RIS — see `docs/NORMAS_REFERENCIAS.md`, `docs/LAUNCH_COMPLIANCE_GAPS.md`, `docs/GOVERNMENT_MOCK_AUDIT.md`, `docs/SGSI.md`). If a requested change conflicts with a norma, do not implement it: double-check the conflict and flag it to the user explicitly. (Standing instruction, 2026-09-22.)

**Post-change full-system verification (standing instruction, 2026-09-30):** after EVERY change, run the checklist in the root `AGENTS.md` — normas check, build passes with a fresh `dist/` (verify timestamps/output), backend parity (any new RPC/column/policy must exist in production, not only in a migration file), and a smoke pass over the critical modules: POS, Inventory, Admin, doctor portal, customer portal, and the public kiosk/verify flows. A change is not done until those areas still work.

- **Citas with linked clinical notes cannot be hard-deleted** — the `medical_notes.appointment_id` FK (`on delete set null`) fires an UPDATE that the append-only trigger (`medical_notes_no_update`, NOM-024 6.6.2) rejects with P0001. This is intended NOM-004 behavior (expediente must be conserved ≥5 years); the portal's "Eliminar" catches it and tells the user to Cancelar instead. Same append-only triggers: `consulta_notes_no_update`, `historia_clinica_append_only`.
- **Purging TEST data** (names containing "prueba"/"test" or known test names): run `tools/clear-test-data.sql` once in the Supabase SQL Editor to create the `purge_test_data(boolean)` function, then `select * from purge_test_data();` to preview (returns rows, deletes nothing) and `select * from purge_test_data(true);` to delete. Disables the append-only triggers only inside its own transaction. Never run it with a pattern that could match a real patient.

---

## Important Files for Agents

| File | Purpose |
|------|---------|
| `src/lib/db.js` | **The data layer.** All Supabase queries live here. Add new DB operations here. |
| `src/lib/auditLog.js` | Audit action constants. Use when logging sensitive actions. |
| `src/lib/currency.js` | MXN formatting + IVA logic. Always use for money display. |
| `src/contexts/AuthContext.jsx` | Login/logout/session. Modify auth behavior here. |
| `src/App.jsx` | Route definitions. Add new top-level pages here. |
| `src/pages/AdminDashboard.jsx` | Admin shell with nested routes. Add new admin tabs here. |
| `supabase/schemas/supabase_schema.sql` | Database schema. Keep in sync with `src/lib/db.js`. |

---

## Common Pitfalls

1. **Profile fetch on signup:** There is retry logic with exponential backoff in `AuthContext` because Supabase triggers may create the `profiles` row asynchronously.
2. **Inventory decrement uses RPC first:** `db.js` calls `decrement_inventory` RPC, then falls back to manual update if the RPC fails. Ensure the RPC exists in Supabase.
3. **No TypeScript:** Do not add `.ts` or `.tsx` files without also updating `vite.config.js`, `jsconfig.json`, and ESLint config.
4. **Visual editor plugins are dev-only:** The custom Vite plugins in `plugins/` only load in development (`NODE_ENV !== 'production'`).
5. **Shadcn components:** Use the existing `src/components/ui/` primitives. Do not invent new base components unless necessary.
