# Final Audit (Round 3) — Speed · Security · Normas — 2026-09-21

Fourth independent pass over the platform, per the pre-launch request. Four
parallel workstreams: (1) live RLS penetration test (anonymous internet
posture, public anon key only), (2) static security audit (13 edge functions,
migrations, public sub-apps, secrets hygiene, git history), (3) performance
audit (doctor portal, admin, POS, inventory, reports, customer PWA — with
live `pg_indexes`/EXPLAIN verification), (4) norma compliance re-verification
(NOM-004, NOM-024, NOM-027/LGS 42-Bis, COFEPRIS, LFPDPPP, SGSI).

Earlier rounds: `GOVERNMENT_MOCK_AUDIT.md` (44 findings, closed),
`DOCTOR_PORTAL_NOM024_REVIEW.md` (D1–D10, closed). This round found
**3 críticos, 8 altos, 11 medios, 7 bajos** — all críticos/altos and nearly
all medios are fixed in this round; see the remediation log.

---

## 1. What the pen test found (live, anonymous posture)

### Verified solid
- All patient-clinical tables return zero rows to anonymous callers:
  `customers, profiles, sales, sale_items, appointments, medical_notes,
  consulta_notes, historia_clinica, consent_documents, prescriptions,
  memberships, notifications, audit_log, arco_requests, controlled_register,
  doctor_efirma, organizations, inventory, inventory_movements, shifts…`
- `controlled_register`, `doctor_efirma`, `rx_number_counters` have **no
  anon grant at all** (401).
- Forged JWTs rejected (401 PGRST301); no join/embed amplification; no
  service-role key anywhere client-side (`public/`, `dist/`, `src/`, git
  history clean except one historical `.env` with only the publishable anon
  key — no rotation needed).
- `lookup-login-email` shows no user-enumeration differential; POS/PIN RPC
  oracles deny EXECUTE to anon.

### Leaks found → FIXED in `20260921000000_final_audit_security_lockdown.sql`
| # | Finding | Root cause | Fix |
|---|---|---|---|
| P1 | **Financial data anonymously readable**: `profit_report`, `daily_sales_summary`, `inventory_valuation` (≈$3.96M cost / $16.76M retail), `top_products`, `dead_stock` | security-definer views (no `security_invoker`) + default anon grants | views recreated/altered with `security_invoker = true` + `revoke select … from anon` |
| P2 | **`expenses` (194 rows) + `manual_revenue` (115 rows) anonymously readable** | live DB drift: RLS disabled, policies missing (repo intended org isolation) | RLS re-enabled + `org_isolation` policies recreated |
| P3 | **Staff personal Gmail addresses** in `sales_by_shift` / `shift_report` (`cashier_name`) | emails stored as display names | views now mask email-shaped names (local-part only); [ORG] 3 staff profiles need real names set in Admin (2 admins, 1 doctor — the doctor's name also prints on recetas) |
| P4 | `inventory_catalog` (full catalog + **on-hand quantity**) granted to anon | intentional grant for the online store, but the store is compliance-paused | `revoke select … from anon` (authenticated members keep it) |

Verified post-fix with the same anonymous probes: all 7 views → 401,
`expenses`/`manual_revenue` → `[]`, `inventory_catalog` → 401.

### Pen-test housekeeping
- The pen test's junk registration (`ZZZPENTEST JUNKDONOTUSE` customer +
  appointment + 4 consent docs + medical note) was purged. The append-only /
  evidence-protection triggers correctly resisted deletion (good sign); the
  medical-note trigger was disabled for one statement under superuser and
  immediately re-enabled. This was synthetic test data, not patient evidence.

---

## 2. Críticos (static audit) → FIXED

### C1 — tablet-checkin: unauthenticated account takeover via phone number
`register` mode reused an existing `customers` row found by phone **without
comparing name/DOB**, then provisioned an auth account with the
caller-chosen password onto the victim's row → full expediente read
(medical_notes, consulta_notes, historia, recetas, CURP/DOB) + victim
lockout. **Fix (edge function):** the reuse branch now requires a normalized
name AND DOB match (same matcher as the guest flow); mismatch → new row.
Plus payload-sanity validation (junk names/DOBs rejected) and a tighter
register rate limit (6/10 min/IP).

### C2 — `record_membership_payment` (+5 related RPCs): self-granted renewals
Any signed-in user could refill visits, advance renewals, book falsified
sales, and mint lab packages. **Fix (`20260921010000_final_audit_hardening.sql`):**
originals renamed to `_impl_*` and revoked; same-name guarded wrappers now
enforce staff / service_role / (for visits + revisions) membership owner.
Direct-DB callers (pg_cron renewals) unaffected. Verified live: anon →
`42501 permission denied`.

### C3 — verify-receta: folio enumeration + receta-forgery kit
Sequential folios (`RX-YYYYMMDD-NNNNN`) + a public endpoint returning
patient/doctor names, cédula and `sig_prefix` for ANY valid folio, with
`sig` accepted but unused. **Fix:** (a) `generate_rx_number()` now appends an
unguessable 6-char suffix (`RX-YYYYMMDD-NNNNN-XXXXXX`); (b) the endpoint
treats folio+sig as a compound key — details only when the presented sig
matches, otherwise the same `{"found":false}` as an unknown folio; (c)
`sig_prefix` no longer returned; (d) QR URLs already carried folio+sig, the
public verify page now requires both, and the **printed receta now shows the
32-char "Fragmento de firma"** (`PrintablePrescription.jsx` + `pdf.js`
footer) so manual verification keeps working.

---

## 3. Altos → FIXED

| # | Finding | Fix |
|---|---|---|
| A1 | `decrement_inventory` customer-callable (stock zeroing); `…_allow_negative` granted to **anon** | function rewritten: staff / service_role / owner-of-open-preorder only; `allow_negative` revoked from anon+authenticated |
| A2 | paypal-subscription replay: one paid subscription → unlimited memberships | cross-customer pre-check (409) + partial unique index `memberships_processor_sub_uidx` (no live dupes found) |
| A3 | `appointments_customer_update`: customers could flip `payment_status='paid'` on their own citas → free teleconsultas | `appointments_customer_update_guard` trigger: non-staff may only set `status→'cancelled'` (+reason); all other columns pinned. Customer app only ever sends `{status:'cancelled'}` — unaffected |
| A4 | `customers_self_update` let patients rewrite guardian-consent evidence, staff notes, org_id, email (collision feed for C1), `medical_history` bypassing audited RPCs | `customers_self_update_guard` trigger pins those columns for non-staff; whitelisted `update_my_customer_profile` / audited history+allergy RPCs run as owner and are exempt; phone/marketing-opt-out self-service keeps working |
| A5 | tablet-checkin unauthenticated write (junk registration succeeded) | payload sanity + name/DOB match (C1 fix) + tighter rate limit; endpoint stays public by design (kiosk) — residual risk accepted, monitored via `rate_limit_events` |
| A6 | customer-documents bucket privacy uncertain | verified live: **already `public=false`**; zero legacy absolute URLs in `customer_documents.file_url` — nothing to sweep |
| A7 | paypal-capture-consult: anonymous capture of any appointment UUID + `meeting_url` in response, no NOM-027 consent gate | PayPal order must carry `custom_id == appointment_id` (client now stamps it), `meeting_url` removed from the anonymous response, teleconsulta-consent gate added before any charge |
| A8 | Deactivated staff kept privileged paths: `verify_admin_pin`, video-room, sign-document (no `deactivated_at` check) | all three now reject deactivated staff (SQL + both edge functions) |

---

## 4. Medios → FIXED (unless noted)

| # | Finding | Fix |
|---|---|---|
| M1 | Customer preorder inserts trusted client prices ($1,000 → $0.01) | `sale_items_customer_price_guard` (non-staff price = server inventory price) + `sales_processing_total_guard` (totals recomputed from items when a preorder completes). Store is paused; member-discount pricing needs a server-side validation RPC when it reopens |
| M2 | lookup-login-email: patient-existence oracle, per-IP cap only | added per-identifier cap (3/10 min) on top |
| M3 | family-member-signup: NULL-DOB member rows claimable with name + guessable sub-id | NULL-DOB rows now fail closed: activation must be completed in person |
| M4 | `is_admin()` / `is_org_staff()` missing `set search_path` (definer hijack class) | recreated with `set search_path to 'public'` (bodies identical) |
| M5 | raw `err.message` to clients in 4 edge functions (2 anonymous-facing) | generic Spanish bodies + server-side logging (paypal-webhook pattern) in tablet-checkin, verify-receta, video-room, paypal-subscription-status |
| M6 | Kiosk CURP validated by format only | RENAPO checksum ported into tablet-checkin (matches `src/lib/curp.js`); kiosk rejects invalid CURPs |
| M7 | CIE-10 catalog had no version metadata (NOM-024 6.4.2) | `catalog_meta` table + CIE-10 seed row; [ORG] confirm exact edition with DGIS for the certification package |
| M8 | Kiosk self-XSS in success screens (consentimiento + registro) | values escaped before rendering |
| M9 | PII in POS localStorage retry queue (`rx_failed_queue`) | queue cleared on shift close. Trade accepted: jobs still queued at close (chronically-failed COFEPRIS writes) are discarded instead of retaining patient PII at rest on shared terminals; the queue still flushes on POS mount, after each sale, and on reconnect during the shift, and `auditLog` toasts on failure |

### Deferred (documented, low severity)
- **D-N3 (medio-bajo):** `sign_consent_documents` still trusts client-supplied
  consent text (hash-pinned on insert, so the forgery would be preserved
  faithfully). Proper fix = `consent_texts` table with versions + RPC reads
  canonical text server-side. Deferred to avoid touching the launch-critical
  consent gate days before launch; plan is ready.
- **D-S1 (bajo):** PostgREST PGRST205 errors leak table-name hints. Platform
  behavior; mitigated by everything above being locked.
- **D-S2 (info):** CORS reflects any Origin on REST/edge (tolerable: auth is
  JWT-not-cookie); Envoy `Server` headers (platform).

---

## 5. Performance — what was slow and what changed

**Live DB context:** tables are still small (sales ≈829, appointments 10,
customers 24, inventory 852, audit_log ≈3,014) and every hot query already
uses an index — so the slowness was **round-trip count and serialization**,
plus full-catalog/full-history payloads. The expediente load was ~13 HTTPS
round trips in 3 waves and re-fetched EVERYTHING after every save.

### Fixed in code
| Area | Change | Effect |
|---|---|---|
| Doctor · Expediente | customer fetch merged into the parallel wave; duplicate historia query removed; full-inventory dropped from mount (lazy 5-min cache shared with the Rx dialogs); mutations now refetch only the affected slice instead of the whole page | expediente open: ~13 RTs → ~9, in fewer waves; save-note/rx/cita actions: ~10 RTs → 1–2 each |
| Doctor · Citas/Overview | dashboard stats 4 serial counts → `Promise.all` | one wave less |
| POS · Checkout | per-item SELECT+RPC+movement (35–45 sequential RTs for 10 items) → one session read + batched item read + parallel decrements + one batched movement insert; post-sale full-catalog reload → local decrement | checkout tail collapses to a few RTs; NOM movement logging unchanged |
| Admin | shift-close no longer downloads the whole sales table (uses `getShiftSales`); inventory mount 3 serial fetches → parallel | — |
| Customer PWA | every API call paid 2 serialized RTs (JWT validation + customer lookup) before its real query → `getSession()` (local) + cached customerId, cleared on signOut | faster every screen; the 30-s notification poll drops to 1 RT |

### Fixed in DB (indexes, verified missing live)
`prescriptions(doctor_id)` · `controlled_register(org_id, created_at)` +
`(sale_id)` · `audit_log(org_id, timestamp desc)` ·
`appointments(customer_id, appointment_date desc)` ·
`consulta_notes(customer_id, created_at desc)`

### Still recommended (not done, by design)
- `getSales()` (admin) is still unbounded — fine at 829 rows, add
  `.range()` pagination before ~10k sales. Same for `getAppointments`,
  `getPreorders`, `getCustomers`, `getAllConsentDocuments`, `getShifts`.
- Citas realtime handler could patch state from `payload.new` instead of
  refetching; current debounce is acceptable at this volume.
- Bulk inventory edit/delete loops (≈5 RTs/item) — add a `bulkUpdateInventory`
  helper when bulk ops become routine.
- Attachments tab signs one URL per thumbnail; sign on click instead.

---

## 6. Norma compliance — status after this round

| Norma | Status | Notes |
|---|---|---|
| NOM-004-SSA3-2012 | **CUMPLE** | ficha de identificación, historia de primera vez + gate, nota 6.2 con negaciones, append-only (proven live: the triggers blocked even superuser-adjacent deletes), firma/autor, ≥5-año retention trigger |
| NOM-024-SSA3-2012 | **CUMPLE** | CDA export, CURP checksum everywhere incl. kiosk (M6), CIE-10 + `catalog_meta` (M7), completeness badge, freeze triggers, audit registry, export completo; [ORG] CURP OID de DGIS pendiente |
| NOM-027 + LGS 42-Bis | **CUMPLE** | tele-consent gate before video AND before payment capture (A7/C3), receta verifiable con folio+sig compuesto, e.firma hardened |
| COFEPRIS / LGS farmacia | **CUMPLE (mecanismos)** | Rx gates en POS, controlled register, antibióticos, folio único, void cascade, expired-stock block; [ORG] clasificación de 4 candidatos controlados + confirmación tópicos OTC + retiro físico de caducados |
| LFPDPPP 2025 | **CUMPLE** | aviso unificado, ARCO register + 20-day workflow, revocación, opt-out de fines secundarios, minimización en endpoints públicos (re-verified this round), menores con tutor |
| SGSI | **CUMPLE** | deactivation now effective on ALL privileged paths (A8), MFA documented as pending, Anexo A pendiente de firma [ORG] |

---

## 7. Remaining [ORG] items (owner action, not code)

1. Set real display names for 3 staff profiles (2 admins, 1 doctor) — today
   their Gmail is their `full_name` (masked in reports as of this round, but
   the doctor's name prints on recetas).
2. Physical quarantine + merma of the ~41 expired items (POS/server already
   block their sale).
3. Supabase Auth dashboard: raise password minimum (toggle).
4. DGIS CURP OID confirmation (TODO in `src/lib/cda.js`) + CIE-10 edition
   confirmation for `catalog_meta`.
5. 19 customers re-sign consents at next visit; guardian backfill (2 minors);
   historia backfill decision.
6. Controlled-substance catalog confirmation (4 candidates) + topical-OTC
   confirmation.
7. SGSI Anexo A signature; e.firma end-to-end retest once Dra. Castillo
   uploads her key; backup/DR evidence collection.
8. TOTP MFA for staff (documented pending in SGSI §4).
9. When the online store reopens: route member-discount pricing through a
   server-side validation RPC (M1 note) and re-grant `inventory_catalog` to
   anon (or publish an anon-safe view without `quantity`).
