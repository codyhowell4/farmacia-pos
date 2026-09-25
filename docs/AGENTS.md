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
│       └── useIdleLogout.js      # Idle auto-logout: 60 min in /doctor, 30 min elsewhere (mounted in App.jsx)
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
- `product_links` — symmetric links between equivalent products (other brand / discounted); linked stock suppresses reorder recommendations
- `partners` — partner businesses offering member discounts; managed in Admin → Socios, read publicly via `get_public_partners` RPC
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

### Inventory (`InventoryDashboard.jsx`)
- Low-stock threshold per item (default 0 — alerts only when out of stock).
- Expiry alerts: orange (< 30 days), yellow (< 90 days), red (expired).
- Stock adjustments require a reason and are logged in `stock_adjustments`.

### Shifts (`ShiftContext.jsx`)
- A cashier must open a shift (starting cash) before using PoS (`ShiftGate`).
- Closing a shift calculates expected cash from DB sales and shows variance.

### Public kiosk flows (`tablet-checkin` edge function)
- Public (verify_jwt=false) function powering the in-store tablet (`/registro/`), the customer-app check-in (`?checkin=1`), and the no-account kiosk (`/consentimiento/`). Abuse controls: honeypot + per-IP sliding-window rate limiting (`rate_limit_events` table, fails open). Every flow ends in a confirmed walk-in cita (doctor picked by `doctor_profiles.availability`) + a medical note prefixed for the doctor portal parser (auto-report notes show an amber "identidad por confirmar" badge in the portal).
- Modes: `register` (tablet: email/phone + account provisioning; `guest:true` for the consentimiento kiosk: name+DOB+sexo (+ optional CURP, validated with the RENAPO checksum — format-only is rejected), no account, name+DOB record reuse), `lookup` (returning-patient search by name+DOB, reports `consents_signed`; response is minimal — no `full_name`), `checkin` (app: by email/phone; kiosk: by `customer_id` re-verified against name+DOB, can insert missing consent docs). Matching is exact-normalized first, then an unambiguous token-subset "loose" match so name variants don't fork the expediente. **Account-linking reuse (phone/email) ALWAYS requires the name+DOB match before provisioning** — an unverified match creates a new row instead (round-3 takeover fix). Register mode also rejects junk payloads (implausible names/DOBs) and is rate-limited tighter (6/10 min/IP).
- Minor handling: `register` requires a valid DOB for everyone and minority is derived **server-side** from it (client flags ignored; the `/registro/` tablet collects dd/mm/aaaa DOB and auto-reveals the guardian block). DOB (< 18) forces guardian data on register/check-in (not on `lookup`, which writes nothing): name + parentesco (padre/madre/tutor) + INE last-4 on kiosk flows, persisted on `customers.guardian_name/guardian_relationship/guardian_id_ref` (a `customers_minor_guardian` DB trigger hard-rejects minor rows without them). The customer record is the **minor** (own name + DOB, so returning minors match in `lookup`), the guardian signs the consent documents (`signer_name` + `signer_relationship`/`signer_id_ref` — parental consent), and the tutor is noted in `customers.notes` and the cita notes. Remote signups (customer app, membership page, `family-member-signup`) likewise require DOB + guardian-for-minors.
- After signing, the kiosk offers a print-copy of the 4 documents with signer data (NOM-004 10.1 patient copy). Customers with clinical records cannot be hard-deleted (trigger `customers_protect_evidence`; NOM-004 5.4) — empty shells still delete.
- The 4 consent documents are **canonical server-side** in the `consent_texts` table (versioned; definer-only reads — no client grants). `sign_consent_documents` (app) and `tablet-checkin` (kiosk) substitute the latest active text by type, ignoring client-supplied title/content (round-4, D-N3). `public/customer-app/js/consentDocs.js` is now only the DISPLAY copy (with a synced copy in `src/lib/consentTexts.js`) — when a text changes, insert a new `consent_texts` version AND update both JS copies.

### Doctor portal / e-receta hardening (2026-09)
- **Round-4 deferred fixes (2026-09-22):** D-N3 closed (`consent_texts` + canonical server-side consent text in `sign_consent_documents` and `tablet-checkin`). tablet-checkin `provisionAccount` gates the already-registered fallback behind `allowReuseLink` (only an email-matched, identity-verified customer row may link to an existing auth account — otherwise the account stays unlinked and no recovery email is sent). Online store REOPENED: `place_store_order` security-definer RPC (server-side pricing with member discount incl. claimed family memberships, FOR UPDATE stock locking, Rx/controlled products rejected online, atomic sale+items+decrement+`inventory_movements`); the customer app's `placeOrder` fails closed (no more localStorage phantom orders) and shows the server total; store nav entry points restored. PostgREST 1000-row silent truncation fixed via `fetchAllPages` in `src/lib/db.js` (+ customer-app `api.js` `_fetchAllPages`) applied to all unbounded list queries (sales, appointments, preorders, customers, consents, shifts + ~40 more incl. both report services). DB migration: `20260922000000_consent_texts_and_store_order.sql`.
- **Round-3 final audit (2026-09-21):** `docs/FINAL_AUDIT_ROUND3.md` — speed + internal pen test + norma re-verification. Remediated: anonymous reads of financial/staff data via security-definer views + live RLS drift on `expenses`/`manual_revenue` (views now `security_invoker` + anon revoked; cashier emails masked in shift reports), tablet-checkin phone-reuse account takeover (name+DOB now required before account linking), membership RPC authz (`record_membership_payment` & friends wrapped with staff/owner guards), verify-receta enumeration (compound folio+sig key, unguessable folio suffix), PayPal subscription replay (unique index + 409), customer column guards on `appointments`/`customers` (cancel-only; guardian/notes/org/medical_history pinned), server-side preorder pricing, deactivated-staff checks on PIN/video-room/sign-document, `customer-documents` bucket verified private. DB migrations: `20260921000000_final_audit_security_lockdown.sql`, `20260921010000_final_audit_hardening.sql`.
- **Controlled substances:** `inventory.controlled_group` ('II'/'III', set in Inventario item edit) excludes items from receta autocomplete and hard-blocks them at receta save — controlados must go on COFEPRIS foliada paper, never on our e-receta. Reports tab is "Medicamentos con Receta" (flattened per-item rows; it is NOT a controlled-substances report).
- **Recetas require cédula:** `doctor_profiles.license_number` (6–8 digits, editable in AdminDoctors and DoctorProfile) is mandatory before creating recetas. Folios are `RX-YYYYMMDD-NNNNN-XXXXXX` (daily counter + unguessable 6-char suffix, round-3). Signed recetas carry a QR pointing to the public verification page `public/verifica/index.html` → edge function `verify-receta` (verify_jwt=false, rate-limited): folio+sig are a **compound key** — details only when the presented sig fragment matches, otherwise indistinguishable `{"found":false}`; the QR carries both.
- **Teleconsulta (NOM-027):** `video-room` requires a registered customer with a signed `teleconsulta` consent before issuing a room (400/409 otherwise); Daily rooms are `private` with per-participant meeting tokens — patient URL in `appointments.meeting_url`, staff URL in `appointments.meeting_url_staff`. Video consulta notes require ubicación del paciente + identidad verificada (`consulta_notes.modality/tele_*`).
- **Append-only clinical records:** `consulta_notes`, `medical_notes` and `historia_clinica` all have DB triggers blocking UPDATE/DELETE; corrections are new versions/notes. Since 2026-09-25 the historia is **versioned** like consulta notes (`unique(customer_id)` dropped, `replaces_id` chain + `version` counter; the same migration added the missing `doctor_id` FK whose absence broke the `profiles:doctor_id` read embed and made saved historias display as "Pendiente"). Migration: `20260925120000_historia_clinica_fk_and_versions.sql`.
- **Consulta borradores (2026-09-25):** `PostVisitDialog` autosaves unfinished notes to `consulta_drafts` (NOT part of the legal expediente — mutable, excluded from exports, deleted on finalize) and the historia capture/edit autosaves to `historia_drafts`. A pg_cron job `finalize-consulta-drafts` (every 15 min) runs `finalize_expired_consulta_drafts()`: 24 h after the first save it inserts the note with explicit "not captured at auto-close" markers for empty sections, completes the cita, and deletes the draft — it NEVER emits a receta (draft meds are listed in the audit log instead) and on rejection (e.g. the NOM-004 6.1 historia gate) it keeps the draft and flags `finalize_error` for manual completion. Migration: `20260925130000_consulta_drafts_and_autofinalize.sql`.
- **Receta print from the consulta:** "Guardar e imprimir receta" (inside PostVisitDialog's receta section) issues + e.firma-signs the receta mid-consulta and opens the print preview without closing the note; finishing a consulta with meds auto-opens the same preview. Signed recetas remain sign-once / void-only.
- **Unified consultorio queue (2026-09-25):** the separate "Citas de médicos no disponibles" box is gone — `DoctorAppointments` shows ONE "Fila del consultorio" with unassigned citas ("Tomar cita") plus citas of doctors not clocked in (yellow "Cita agendada con Dr(a). X" note; "Cubrir" keeps the takeover-confirmation dialog + audit; Reagendar/Cancelar unchanged). Citas with a consulta draft or status `in_consulta` are excluded — they hold captured work pending the 24 h auto-finalize and cannot be taken over. **Safety net:** abandoned consultas (`in_consulta` > 24 h, NO draft — auto-finalize never fires for those) resurface in the queue from any date via `getStuckConsultas()` (red "Consulta abierta hace más de 24 h" note) unless the treating doctor is clocked in, and carry a "🔴 Abierta +24 h" badge in the doctor's own list.
- **Justificante médico wording (2026-09):** comprobante de atención only — qualitative "reposo relativo", never quantified rest days; the document states it is not an incapacidad (IMSS-only), per the medical team's instruction.
- **Audit reliability:** `logAudit` retries once, then queues failures to localStorage `audit_failed_queue` and toasts app-wide (sonner `Toaster` is mounted in `App.jsx` — both toaster systems are live).
- **Round-2 audit (2026-09-18):** `docs/GOVERNMENT_MOCK_AUDIT.md` — mock government inspection of POS/RLS/patient-app/SGSI. 44 findings (11 críticos, 12 altos, 14 medios, 7 bajos). **The 11 críticos (+ R2-24) are REMEDIATED** (see the doc's resolution log): signup trigger forces `role='customer'` + `profiles_protect_privileged` trigger, PINs bcrypt-hashed with `verify_admin_pin`/`admin_set_profile_pin` RPCs, org-wide policies replaced with `is_org_staff()` on all operational tables, `audit_log` append-only (admin read), prescriptions content-frozen (sign once / void only), customer-documents storage path-scoped, e.firma keys in `doctor_efirma` (owner-only) + hardened `sign-document`, `paypal-subscription` activates only on ACTIVE subscriptions, returns route meds to merma with PIN+reason, `controlled_register` + POS foliada capture, `rx_number_counters` locked. **The 12 altos are also REMEDIATED** (same doc, second resolution log): receta capture hardened (cédula 6–8, fecha rules, dup-folio trigger, `receta_retenida`), 32 antibiotics flagged + `src/lib/antibiotics.js` validators, clinical tables locked to `is_clinical_staff()` with POS on narrow `pos_*` definer RPCs, rate-limited `lookup-login-email` edge wrapper, receta PDF firma/vía + mandatory dosis/vía/frecuencia, allergy cross-check with audited override, `historia_clinica` de primera vez (NOM-004 6.1) + full expediente export (NOM-024 6.6.6), DOB+guardian on every remote signup (server-derived minority, `customers_minor_guardian` trigger), `arco_requests` + `revoke_consent` + `marketing_opt_out` promo suppression, aviso de privacidad unified/completed (secondary-purposes checkbox, encargados, localStorage/push §7). **The 14 medios + 7 bajos are also REMEDIATED** (same doc, third resolution log): POS audit detail complete (override incl. increases, void reasons, discounts, returns items), sale_items Rx/controlled snapshot + expired-sale server block + void→receta cascade, ticket fiscal/sanitary header + CURP masking + receta block, quarantine report, cron-secret send-notifications (fail-closed), consent signing via `sign_consent_documents` RPC + content freeze/hash + customer INSERT policy dropped, fail-closed consent gate + server-side booking gate, NOM-004 6.2 note completeness with explicit negations + author snapshots + full CDA header, in-person consent enforcement + walk-in orphan-note block, staff deactivation (`deactivated_at` + `admin_set_user_active`), 15-min idle logout, password min 10, family-member-signup rate-limit/DOB-factor/generic errors, generic edge errors (7 functions), kiosk autocomplete/idle-reset + logout purge, vendored supabase-js + security headers + scoped CSP, repo hygiene, backup/DR evidence register. Round 2 is fully closed; [ORG] items remain per the doc.

---

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
- `VITE_PAYPAL_ENV`, `VITE_PAYPAL_CLIENT_ID`, `VITE_PAYPAL_PLAN_INDIVIDUAL`, `VITE_PAYPAL_PLAN_FAMILIAR`

### Build Output
- Vite builds to `dist/`.
- The build runs `generate-llms.js` to produce `public/llms.txt`.

---

## Security Considerations

- **Never commit `.env`** — it is gitignored.
- Supabase RLS policies enforce org isolation. Do not disable RLS.
- Admin PINs are stored bcrypt-hashed in `profiles.pin_hash` (never plaintext). Set/clear them via the `admin_set_profile_pin` RPC (admin-only); verify via the `verify_admin_pin` RPC. The legacy `profiles.pin` column is always NULL.
- All DB mutations go through `src/lib/db.js` which uses the authenticated Supabase client.
- pos/inventory roles reach customer data ONLY through the `pos_*` security-definer RPCs (`searchCustomersPos`, `createCustomerPos`, `searchPrescriptionsPos`, `searchMembershipsPos`, `getMembershipByIdPos`, `getSaleForReturnPos` in `db.js`) — direct SELECT/INSERT/UPDATE on `customers` and other clinical tables is restricted to admin/doctor (clinical staff).
- Price overrides, voids, and user management require admin PIN or admin role.

---

## Compliance (Normas)

Every change request must be checked against the normas before implementing (NOM-004, NOM-024, NOM-027, LFPDPPP, LGS arts. 42 Bis & 245–255, RIS — see `docs/NORMAS_REFERENCIAS.md`, `docs/LAUNCH_COMPLIANCE_GAPS.md`, `docs/GOVERNMENT_MOCK_AUDIT.md`, `docs/SGSI.md`). If a requested change conflicts with a norma, do not implement it: double-check the conflict and flag it to the user explicitly. (Standing instruction, 2026-09-22.)

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
