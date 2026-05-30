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
│       └── use-toast.js
├── tools/
│   ├── generate-llms.js        # Build-time script generating public/llms.txt from Helmet metadata
│   └── install-missing-components.js
├── plugins/                    # Vite dev-only plugins (visual editor, selection mode, iframe routing)
├── public/
│   ├── .htaccess
│   └── llms.txt                # Generated at build time
├── supabase_schema.sql         # Canonical database schema with RLS policies
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
4. Admin PIN verification is used for sensitive operations (price overrides, voiding sales). The PIN is stored in `profiles.pin`.

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
- `sales`, `sale_items`, `sale_payments` — transactions (supports split payments)
- `returns`, `return_items` — return processing
- `shifts` — cashier shift tracking
- `discounts` — promo codes (% off)
- `suppliers`, `purchase_orders`, `purchase_order_items` — supplier management
- `audit_log` — immutable action log
- `tax_settings` — per-org IVA settings
- `bank_accounts` — transfer destination accounts
- `stock_adjustments` — manual inventory adjustments with reason
- `prescriptions` — COFEPRIS prescription records

### Schema File
The canonical schema is **`supabase_schema.sql`**. Additional migration/fix files exist (`PHASE1_SCHEMA.sql` through `PHASE5_SCHEMA.sql`, `COMPLETE_DATABASE_FIX.sql`, etc.) — these are historical; the single source of truth for new setups is `supabase_schema.sql`.

---

## Key Business Logic

### Sales & Checkout (`PoSDashboard.jsx`)
- Barcode scanner auto-adds on exact match.
- Prescription-required items block checkout until Rx # is entered.
- Price changes > 10% require admin PIN.
- Supports split payments across multiple methods.
- IVA is calculated post-discount.
- Inventory is decremented via `decrement_inventory` RPC (with manual fallback).

### Inventory (`InventoryDashboard.jsx`)
- Low-stock threshold per item (default 10).
- Expiry alerts: orange (< 30 days), yellow (< 90 days), red (expired).
- Stock adjustments require a reason and are logged in `stock_adjustments`.

### Shifts (`ShiftContext.jsx`)
- A cashier must open a shift (starting cash) before using PoS (`ShiftGate`).
- Closing a shift calculates expected cash from DB sales and shows variance.

---

## Deployment

### Vercel (Configured)
- `vercel.json` rewrites all routes to `index.html` (SPA fallback).
- Environment variables must be set in Vercel dashboard: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### Build Output
- Vite builds to `dist/`.
- The build runs `generate-llms.js` to produce `public/llms.txt`.

---

## Security Considerations

- **Never commit `.env`** — it is gitignored.
- Supabase RLS policies enforce org isolation. Do not disable RLS.
- Admin PIN is stored as plain text in `profiles.pin` (4-digit string). This is used for in-app approvals, not encryption.
- All DB mutations go through `src/lib/db.js` which uses the authenticated Supabase client.
- Price overrides, voids, and user management require admin PIN or admin role.

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
| `supabase_schema.sql` | Database schema. Keep in sync with `src/lib/db.js`. |

---

## Common Pitfalls

1. **Profile fetch on signup:** There is retry logic with exponential backoff in `AuthContext` because Supabase triggers may create the `profiles` row asynchronously.
2. **Inventory decrement uses RPC first:** `db.js` calls `decrement_inventory` RPC, then falls back to manual update if the RPC fails. Ensure the RPC exists in Supabase.
3. **No TypeScript:** Do not add `.ts` or `.tsx` files without also updating `vite.config.js`, `jsconfig.json`, and ESLint config.
4. **Visual editor plugins are dev-only:** The custom Vite plugins in `plugins/` only load in development (`NODE_ENV !== 'production'`).
5. **Shadcn components:** Use the existing `src/components/ui/` primitives. Do not invent new base components unless necessary.
