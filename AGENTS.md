# AGENTS.md — Standing rules (read first)

Architecture, stack, conventions, and module documentation: see `docs/AGENTS.md`.
Normas references: `docs/NORMAS_REFERENCIAS.md`, `docs/GOVERNMENT_MOCK_AUDIT.md`, `docs/SGSI.md`.

## After EVERY change — verification checklist (standing instruction, 2026-09-30)

No change is "done" until ALL of these pass. The user runs a live pharmacy —
a module broken mid-day is the worst outcome.

1. **Normas check** — the change complies with NOM-004, NOM-024, NOM-027,
   LFPDPPP, LGS arts. 42 Bis & 245–255, RIS. Conflicts get flagged to the
   user, not shipped. (Original standing instruction: 2026-09-22.)
2. **Build passes and dist actually changed** — run the build and check
   `dist/` timestamps + that the new code is in the bundle (`grep` the
   output for a symbol you added). A silent no-op build is not a pass.
3. **Backend parity** — if the change depends on a new RPC, edge function,
   column, or policy, verify it EXISTS in production (Supabase Management
   API / CLI), not just in a migration file in the repo. Frontend deployed
   without its backend = broken feature.
4. **Smoke-test the critical areas** after the change (highest blast radius
   first):
   - **POS** (`/pos`) — cart, checkout/payments, receta capture, membership
     apply + Registrar Miembro, shift open/close.
   - **Inventory** (`/inventory`) — list loads, stock adjustments, alerts.
   - **Admin** (`/admin`) — Ventas, Recetas médicas, Clientes, Inventario,
     Turnos, Reporte COFEPRIS.
   - **Doctor portal** (`/doctor`) — fila/citas, consulta + receta
     create/print/sign, expediente/historia.
   - **Customer portal** (`public/customer-app`) — login, citas, mis
     recetas, store/order flow.
   - **Public flows** — tablet `/registro/`, kiosk `/consentimiento/`,
     receta verification `/verifica/`.
5. **Date handling** — never parse a `date`-column string (`YYYY-MM-DD`)
   with `new Date(s)`; that is UTC midnight and renders as the previous day
   in Mexican timezones. Use `parseDateLocal()` / `localDateString()` from
   `src/lib/timezone.js`. Never store `new Date().toISOString().split('T')[0]`
   into `date` columns (rolls to tomorrow after ~6 PM local).
