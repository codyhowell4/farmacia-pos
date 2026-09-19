# Mock Government Inspection — Round 2 (NEW findings)

**Date:** 2026-09-18
**Perspective:** simulated COFEPRIS + data-protection authority (LFPDPPP 2025, Secretaría Anticorrupción y Buen Gobierno) inspection, hunting only for faults **not** reported in round 1 (`docs/LAUNCH_COMPLIANCE_GAPS.md` — C1–C10 and D1–D10, all fixed) or the NOM-024 cert-track review (`docs/DOCTOR_PORTAL_NOM024_REVIEW.md`).
**Scope this round:** POS/farmacia sale flows, RLS/authorization, edge functions, doctor-portal NOM-004/024 content details, customer app + aviso de privacidad, and SGSI-vs-reality.
**Normas referenced:** Ley General de Salud arts. 42, 42 Bis, 226, 245–255 · Reglamento de Insumos para la Salud (receta retenida, registros de controlados) · NOM-004-SSA3-2012 · NOM-024-SSA3-2012 (6.6 seguridad, Tabla 1, 6.6.6 exportación) · NOM-027-SSA3-2013 · LFPDPPP 2025 · Código de Comercio / LFEA / NOM-151-SCFI-2016.

**Verification status legend:** ✅ = confirmed **live in production** on 2026-09-18 via management-API queries (`pg_policies`, `pg_class.relrowsecurity`, `information_schema` grants, function source, data counts). 🧾 = verified against code/migration files; prod state inferred. Items marked **[ORG]** are paperwork/process for the gestor/abogado, not code.

---

## Executive summary

44 new findings: **11 críticos, 12 altos, 14 medios, 7 bajos**.

**Root cause behind most criticals:** every user who self-registers in the customer app gets a `profiles` row **with the farmacia's `org_id`** (13 customer profiles carry it today — ✅), and dozens of RLS policies check only `org_id = get_my_org_id()` with no role test. Any person on the internet can therefore obtain a JWT that reads — and in several tables writes/deletes — clinical, sales, and audit data. Separately, the signup trigger trusts client-supplied `role` metadata, so a self-registered account can make itself **admin** (✅ live-confirmed function source).

Good news first: two suspected exposures were **refuted live** — both storage buckets are private, and `paypal_webhook_events` does have RLS enabled. The POS also genuinely blocks expired items at the register UI and gates Rx items on every payment path.

---

## CRÍTICA — exposure or falsification of health/legal data, exploitable today

### R2-1 ✅ Self-registered users can make themselves ADMIN
`handle_new_user()` trusts client metadata: `v_role := coalesce(new.raw_user_meta_data->>'role', 'customer')` and even accepts `org_id` from metadata (live function source, 2026-09-18). The customer app allows anonymous `auth.signUp` (`public/customer-app/js/api.js:600-612`). So `signUp({options:{data:{role:'admin'}}})` yields an admin profile in the farmacia's org — `ProtectedRoute` only reads `user.role` in the browser (`src/components/ProtectedRoute.jsx:32-34`), and `is_admin()` then opens every admin RLS policy.
**Fix:** trigger must force `role='customer'` and ignore metadata role/org; staff roles assigned only via an admin-only security-definer RPC. Consider disabling public email signUp in Auth settings and provisioning patients only through the existing flows.

### R2-2 ✅ Admin PINs are plaintext and readable by every account in the org (including patients)
`profiles.pin` is plaintext (`supabase/schemas/supabase_schema.sql:39`); live policy `profiles_read` = `(id = auth.uid()) OR (org_id = get_my_org_id())`; `verifyAdminPin` is a client-side SELECT (`src/lib/db.js:122-132`); 1 admin has a PIN set (live). Any cashier — or any self-registered patient — can `select pin from profiles where role='admin'` and self-authorize voids/overrides. The whole approval control is defeated and its audit value is void.
**Fix:** move PIN out of `profiles` (or hash it), verify via security-definer RPC returning boolean + logging attempts, and validate PIN server-side for void/override.

### R2-3 ✅ Operational tables use `org_isolation` with NO role check — patients can read/write inventory, shifts, sale_items
Live policies: `inventory` ALL `(org_id = get_my_org_id())`; `shifts` SELECT/UPDATE org-wide; `sale_items_policy` ALL via join to sales; same pattern on `returns, suppliers, purchase_orders, discounts, tax_settings, lost_sales` (`supabase/schemas/supabase_schema.sql:303-347`). With 13 customer profiles carrying `org_id` (live), any patient JWT can rewrite prices/stock, edit cash shifts, and modify/delete sale line items — destroying the sales registry COFEPRIS can ask for.
**Fix:** replace with `is_org_staff()` policies (pattern already applied to `sales`); give customers narrow self-service RPCs only.

### R2-4 ✅ `audit_log` is readable, editable and deletable by any org account — and SGSI §7 claims it is immutable
Live: `org_isolation ... for all using (org_id = get_my_org_id())` on `audit_log`. Any patient can read the whole trail (staff names, patient names in `details`), insert fake entries, and UPDATE/DELETE to erase traces. Directly contradicts SGSI §7 ("inmutable, solo inserción") and NOM-024 6.6.1/6.6.2.
**Fix:** append-only trigger (mirror `consulta_notes`), SELECT restricted to admin, INSERT via security-definer RPC stamping user/org/time server-side.

### R2-5 ✅ Prescriptions are forgeable: org-wide INSERT and UPDATE with no role validation
Live policies on `prescriptions`: `org_prescriptions_insert` (WITH CHECK org only), `org_prescriptions_void` (UPDATE, org only), `doctor_prescriptions_insert` (`doctor_id = auth.uid()` but no check that the caller IS a doctor). A patient can create recetas "signed" by their own uid, rewrite `medications`/doses on any receta, un-void cancelled ones, and alter `signed_payload`/`signature` fields — after which `verify-receta` still validates them.
**Fix:** doctor role validated for INSERT; void restricted to staff (`is_org_staff()`) or a security-definer RPC; version/append-only trigger like consulta_notes.

### R2-6 ✅ Storage `customer-documents`: any authenticated user can read and DELETE everyone's uploaded receta photos
Live storage policies: `customer_docs_delete_own` DELETE qual = `bucket_id='customer-documents' AND auth.role()='authenticated'` (name says "own", no owner filter); SELECT policies with only a bucket check; INSERT with empty check. The app stores `getPublicUrl()` of receta photos in `customer_documents.file_url` (`public/customer-app/js/api.js:1066-1084`). (Bucket itself is private — ✅ — but the policies open it to every signed-in user, including self-registered patients.)
**Fix:** path-based owner policies mirroring `patient-documents` (`MIGRATION_nom024_program.sql:245-263`); signed URLs instead of public URLs; migrate existing `file_url`s.

### R2-7 ✅ Doctors' e.firma private keys are readable org-wide; `sign-document` is a password oracle
Live policy `doctor_profiles_org_read` exposes **all columns** — including `efirma_cer_base64`/`efirma_key_base64` (`supabase/migrations/20260914120000_doctor_efirma.sql:5-8`) — to anyone in the org, patients included. 0 doctors have keys uploaded today (live), so this is latent — it detonates the moment Dra. Castillo uploads hers. `sign-document` additionally lacks role checks/rate limiting and returns differentiated "Contraseña incorrecta" errors (`supabase/functions/sign-document/index.ts:43-48,86-90`).
**Fix:** move efirma columns to their own table with `profile_id = auth.uid()` select only; sign-document must require active-doctor role + matching cert serial + rate limiting.

### R2-8 ✅ Anonymous RPC `public_signup_membership` creates ACTIVE memberships without payment
Live grants: EXECUTE to `anon`. Function defaults `v_status := coalesce(p_membership->>'status','active')` (`supabase/migrations/20260522120000_membership_hardening.sql:449-482`) and even records a phantom payment/sale. One curl with the public anon key = free membership (10% + consultas) or mass creation of `customers` rows with third-party data.
**Fix:** revoke anon/authenticated EXECUTE (service_role only — the legit flow already goes through `paypal-subscription`), and force `status='pending'` server-side.

### R2-9 🧾 `paypal-subscription`: targeted account takeover of an existing patient
`verify_jwt=false`; accepts subscription status `APPROVAL_PENDING`/`APPROVED` (no charge yet, `index.ts:383`); matches an existing customer by email **or phone substring** (`:98-104`); then `provisionPortalAccount` creates credentials with the **victim's email + attacker's password**, `email_confirm:true` (`:279-313,483-488`). Attacker with an unpaid approved subscription + victim's phone/email gets a working portal login over the victim's record (history, recetas, citas).
**Fix:** only `ACTIVE`; exact normalized email match only (never phone substring); never set a password on a pre-existing customer — force email-verified reset; mandatory PayPal plan check.

### R2-10 🧾 Returned medicines go straight back into sellable stock — no quarantine, no med/non-med distinction, no PIN
`ReturnModal.jsx:72-75` restocks everything via `incrementInventory` (only services excluded, `db.js:386-387`); the "Devolución" button needs no admin PIN (contrast void, which does). An insulin/antibiotic returned by a client is resold as new — COFEPRIS treats reselling returned meds (no cold-chain/integrity guarantee) as adulteration risk (LGS 245–246).
**Fix:** medicines route to merma/cuarentena (`return_items.disposition`, no stock increment), require admin PIN + reason.

### R2-11 🧾✅ Controlled substances (Grupo II/III) are invisible to the POS — and nothing in inventory is classified
`controlled_group` is never read in the POS sale flow (no warning, no block, no special register — `reportsService.js:6-7` admits there is no controlled registry). Live data: **852/852 items have `controlled_group = NULL`** — the classification has never been used. Selling a Grupo III by register produces a generic `sale_items` row; there is no entradas/salidas register and no capture of the COFEPRIS foliada receta folio (LGS 245–255, RIS 69–84).
**Fix:** POS prompt + mandatory foliada-folio capture + `controlled_register` table; classify the catalog (or document the decision that none are stocked — [ORG] confirm against physical inventory).

---

## ALTA — clear norma violations

### R2-12 🧾 POS receta capture: cédula optional & unvalidated, fecha unvalidated, folio reusable, no "receta retenida"
`PrescriptionModal.jsx:119-130` requires only patient/doctor/folio; cédula is optional, unformatted, saved null; fecha accepts future or years-old dates; nothing stops reusing the same `prescription_number` across N sales (only `UNIQUE(sale_id)`); no retained-receta flag for antibiotics (LGS 42, RIS 27 — the farmacia that fills an incomplete receta is co-responsible).
**Fix:** cédula required + 6–8 digit format for Rx meds (mandatory for antibiotics), fecha not future and within legal validity, warn/block duplicate folio per org, add `receta_retenida` checkbox for antibiotics.

### R2-13 ✅ 23 of 57 known antibiotics in inventory are NOT flagged `requires_prescription`
Live count over antibiotic name patterns. The register barrier never fires for those 23 — they sell with no receta capture at all (LGS 226 / RIS 27). Root cause: CSV import defaults the flag to false (`tools/import-inventory-csv.js:221`, `InventoryDashboard.jsx:529`) and no antibiotic catalog validation exists anywhere (`grep antibiot` → 0).
**Fix:** one-off classification pass + post-import validator against an antibiotic/active-principle list.

### R2-14 🧾 Clinical tables are open to ALL staff roles — cashiers and stockers can read/write the full expediente
`is_org_staff()` = admin/pos/inventory/doctor (`DAY1_MIGRATION_FINAL.sql:33-40`) and it gates `medical_notes`, `consulta_notes`, `consent_documents`, `medical_history_versions`, `customer_documents`, `appointments`, `customers` (incl. `medical_history` jsonb). The UI hides it, but a `pos` JWT hits everything via API (NOM-024 6.6.4 perfiles por rol; LFPDPPP mínimo privilegio).
**Fix:** `is_clinical_staff()` (admin/doctor; nurse via dedicated RPC for vitals) for clinical tables; pos/inventory keep operational tables only.

### R2-15 ✅ Memberships are rewritable by patients
Live: `memberships`/`membership_members` org_isolation ALL — any customer can read all members' PII and UPDATE `discount_percent`, `visits_remaining`, `status`, or DELETE rows (bypassing the well-built `cancel-my-membership` authorization).
**Fix:** writes staff-only; keep the existing customer self-select policies.

### R2-16 ✅ Anonymous `lookup_login_email` reveals account emails from a phone or membership number
Live grants to anon (`20260522120000_membership_hardening.sql:1181-1226`), no rate limiting. Phone→email and membership→email oracle; confirms someone is a patient (sensitive inference) and feeds R2-9.
**Fix:** rate-limited edge-function wrapper, generic/masked responses.

### R2-17 🧾 Downloadable receta PDF lacks the signature block and the vía; recetas can be issued with no dose/route/frequency
`src/lib/pdf.js:249-276` prints only dosage/frequency/duration (no `med.via`) and has NO firma block (the print template has both, `PrintablePrescription.jsx:450,466-469`). Standalone Nueva Receta doesn't even capture `via` (`PatientWorkspace.jsx:1127-1153`); in PostVisitDialog all of dosis/vía/frecuencia/duración are optional (`PostVisitDialog.jsx:222-226`). The system can e.firma-sign a receta reading just "PARACETAMOL" (LGS 42/42 Bis).
**Fix:** require dosis+vía+frecuencia per med in both dialogs; add via to the standalone dialog; mirror the signature block in the PDF.

### R2-18 🧾 No allergy cross-check when prescribing; consulta recetas print a blank ALERGIAS line
Allergies are recorded but no receta path compares meds against them; PostVisitDialog prefills vitals from nurse_vitals only, not allergies (`:80`), so a penicillin-allergic patient gets amoxicilina with no warning and an empty alergias field on the document (NOM-004 6.2 consistency / patient safety).
**Fix:** match meds against recorded allergies at save (block or confirm-with-audit); prefill alergias from history.

### R2-19 🧾 No historia clínica de primera vez exists (NOM-004 6.1)
Zero occurrences of interrogatorio / aparatos y sistemas / primera-vez structure in `src/`. New patients get antecedentes + a nota de evolución — never the 6.1 document (padecimiento actual, interrogatorio por aparatos y sistemas, exploración física completa).
**Fix:** primera-vez flow: patients with no prior notes require the historia clínica form before the first nota de evolución.

### R2-20 🧾 "Exportar expediente" is a subset of the record (NOM-024 6.6.6)
`recordExport.js` omits `medical_notes` entirely (not even a parameter; caller `PatientWorkspace.jsx:356-363`), drops exploración/resultados/vitals/pronóstico from consulta notes, excludes attachments except justificantes, omits patient address, and exports consents as metadata only (no signature evidence).
**Fix:** full export incl. notes, all note sections, attachment index, address, consent signature details.

### R2-21 🧾 Minors can self-register everywhere except the kiosk
Customer-app signup asks no DOB/age (`app.js:460-511`); membership signup neither (`MembershipPublicPage.jsx:328-378`); family-member activation neither (`family-member-signup/index.ts:81-102`); the `/registro/` tablet uses a self-declared "es menor" checkbox WITHOUT capturing DOB, so the server cannot derive minority (`tablet-checkin/index.ts:397-398`). A minor can hold an account, self-sign 4 sensitive-data consents, and build an expediente with no parental consent (LFPDPPP; NOM-004 10.1).
**Fix:** DOB (or 18+ declaration with DOB before any health data) on every remote signup; server-side guardian flow mirroring the kiosk.

### R2-22 🧾 ARCO and revocation exist only as text — nothing in the system reacts
The only channel is an email address (`consentDocs.js:37,41`); `grep revoc` finds only prose. No `arco_requests` register, no `revoked` state, the consent gate and `video-room` only check for `status='signed'` rows, and there is no promotions opt-out list in `notification_queue`. The aviso promises effects the system cannot deliver (LFPDPPP arts. 8, 15–16, 22–29).
**Fix:** `arco_requests` table + documented procedure; revoked/declined states respected by the consent gate and video-room; suppression flag for secondary purposes.

### R2-23 🧾 Aviso de privacidad is missing four required pieces
Present and correct: responsable identity/domicilio, sensitive-data notice, primary vs secondary purposes, transfer categories, ARCO with 20-day plazo, revocation, express consent. Missing: (a) a mechanism to REFUSE secondary purposes at collection time (signature is all-or-nothing, `app.js:884-887`); (b) disclosure of local-storage health data + push notifications; (c) naming the actual encargados (Daily.co, Resend, Meta — membership terms name some, the aviso doesn't); (d) two divergent avisos exist (canonical vs `MembershipTermsPage.jsx:160-204`).
**Fix:** non-blocking secondary-purposes checkbox at the gate; storage/push section; name encargados or annex them; unify the texts.

---

## MEDIA — partial or weak controls

- **R2-24 ✅ `rx_number_counters`: RLS disabled + full ALL grants to `anon`.** Anonymous internet can read/rewrite receta folio counters — folio consecutiveness (a COFEPRIS registry expectation) is attackable. Fix: enable RLS deny-all, revoke anon/authenticated.
- **R2-25 🧾 Audit detail is broken or missing on POS actions:** price-override log has a literal `{formatMXN(...)}` template bug (`PoSDashboard.jsx:554` — missing `$`); voids capture no reason; discount codes unaudited; price *increases* need no PIN; returns log no item detail. Fix all five.
- **R2-26 🧾 Receta registry consistency:** reports derive from the CURRENT `requires_prescription` flag, not a snapshot on `sale_items` (column exists, never written); `voidSale` never voids the linked prescription row; a failed `createPrescription` leaves an Rx sale with no registry row (toast only). Fix: snapshot flags on sale_items, void the receta with the sale, retry/queue the receta save.
- **R2-27 🧾 Ticket content:** header hardcodes only trade name/address/phone — no RFC, no aviso de funcionamiento, no responsable sanitario; full CURP printed on thermal paper (minimization); `[Rx]` marker on reprints inferred from `rx_number` text, not the flag. Fix: configurable fiscal/sanitary header, mask CURP, print folio+médico+cédula from `prescriptions`.
- **R2-28 🧾 `send-notifications` effectively unauthenticated:** the secret gate applies only when `CRON_SECRET` is set, but the pg_cron job doesn't send the header (`20260912130000_send_notifications_cron.sql:69-79`) — so the secret can't be enabled without breaking cron. Anyone can POST and drain the queue (real emails/WhatsApps to patients). Fix: add the header to the cron job and fail closed when unset.
- **R2-29 🧾 SGSI claims with no backing mechanism:** roles `secretary`/`nurse` exist in DB/UI but have ZERO policies (`is_org_staff()` excludes them — dead roles); no user-deactivation mechanism (SGSI §3.2 promises same-day offboarding); password minimum is 6 everywhere while SGSI §4 says 10; no idle/auto-logoff anywhere (SGSI §4); ProtectedRoute is client-only and the RLS behind it is wide (R2-3/5/14). Fix: align either the mechanisms or the SGSI text.
- **R2-30 🧾 `family-member-signup`:** identity proof = knowing the member's full name; sub_ids sequential (`APOLO-00001-2`); no rate limit; differentiated errors = membership oracle. Fix: rate-limit, generic errors, second factor (DOB or holder approval).
- **R2-31 🧾 Consent evidence is patient-editable:** `consent_documents_customer_sign` UPDATE covers ALL columns of own rows (live) and INSERT accepts fully client-supplied "signed" rows — a patient can rewrite the text they "signed", restamp `signed_at`, or fabricate documents (NOM-151/Código de Comercio 1205 evidentiary value). Fix: server-side canonical text (or hash check), UPDATE limited to status/signer fields, consider append-only.
- **R2-32 🧾 The 4-consent gate is client-side and fail-open:** `app.js:843-863` explicitly fails open; all patient APIs hit tables directly with no consent precondition (only `video-room` checks server-side). A modified client operates consent-free. Fix: server-side consent assertion for booking/clinical writes; fail closed.
- **R2-33 ✅ 24 expired items carry stock right now** (live). The POS blocks them at the register UI (verified clean), but there is no quarantine/disposition workflow and no server-side sale validation. Fix: quarantine report + physical pull [ORG], `create_sale` RPC validating expiry/stock/Rx server-side.
- **R2-34 🧾 NOM-004/024 content details:** nota de evolución requires only padecimiento+diagnóstico (pronóstico, tratamiento, vitals, CIE-10 all optional) and stored sections are hidden in `ConsultaNotesList`; notes are never signed and author name is a live join, not a snapshot (5.9/5.10); CDA export omits sexo/fecha-nacimiento/domicilio/entidad (Tabla 1), uses the US-SSN OID for CURP (`cda.js:129` — judgment call, verify against DGIS OID list), lacks serviceEvent and consent references. Fix: require or explicitly negate the 6.2 elements, snapshot author name+cédula, complete the CDA header.
- **R2-35 🧾 No consent enforcement for in-person care; walk-in notes are orphaned:** nothing checks consent docs before an in-person consulta note or receta (the gate covers video only), and PostVisitDialog saves walk-in notes with `customer_id: null` — invisible to any expediente forever. Fix: warn/block on first clinical entry without signed consent; require registering the walk-in before note save.
- **R2-36 🧾 Shared-device hygiene:** kiosk/tablet forms allow browser autocomplete of name/DOB/email; no inactivity auto-reset (success screens show patient name indefinitely); customer-app logout leaves health data in localStorage (blood type, allergies, meds, fasting/sleep logs). Fix: `autocomplete="off"`, idle reset to start screen, clear app keys on logout.
- **R2-37 🧾 PII in logs and lock-screen notifications:** full receta object incl. patient CURP in the POS console (`PoSDashboard.jsx:1018`); med names in customer-app console and in push-notification text visible on a locked phone (`notifications.js:105-106`). Fix: strip PII from logs; generic notification text.

---

## BAJA — hardening

- **R2-38 🧾 Edge functions leak internal errors:** raw `err.message` (PostgREST details/hints, GoTrue, PayPal) returned to clients in 7 functions (`paypal-subscription:502-517`, `paypal-webhook:420-427`, `sign-document:105-109`, `send-notifications:557-561`, `family-member-signup:210-214`, `create-portal-account:201-205`, `cancel-my-membership:265-269`). Fix: generic client messages, server-side detail logs.
- **R2-39 🧾 CURP null on consulta-origin recetas** (`PostVisitDialog.jsx:209` hardcodes `patient_curp: null`; the appointments join doesn't select it) — the e.firma cadena signs with an empty CURP; plus vitals attribution is lost when the doctor edits nurse vitals. Fix: join CURP through; store `vitals_recorded_by`.
- **R2-40 🧾 Repo hygiene:** `test-login.mjs` (prod URL + anon JWT + staff email), `pharmacy-pos-supabase.zip` (contains `.env` with the anon key — public by design, but normalizes committing secrets), finance CSV at root. Fix: remove from repo + history.
- **R2-41 🧾 No security headers / no SRI:** `public/_headers` sets only Cache-Control (no CSP, frame-ancestors, Referrer-Policy); supabase-js loaded from jsdelivr without integrity on health-data pages. Fix: headers + SRI/vendored SDK.
- **R2-42 ✅ `cron_heartbeat` readable by anon** (`for select using (true)`) — no PII, reveals scheduler cadence only. Optional: restrict to authenticated.
- **R2-43 🧾 Returns double-restock path:** `createReturn` passes `return_qty` but `incrementInventory` reads `returnQty` → qty=0 phantom movements with no reference; the real restock happens later unlinked. Fix: unify and pass the return id.
- **R2-44 🧾 Backup/DR evidence:** SGSI §5 (managed backups + weekly export + annual restore test) has zero operational artifacts in-repo. [ORG] start an evidence log (panel screenshots/export register) — an inspector will ask for it, not for the policy text.

---

## Verified clean — coverage appendix

Confirmed OK this round (code + live): `paypal_webhook_events` RLS **enabled** (live) · both storage buckets private (live) · `patient-documents` path-scoped policies · receta-view requires session + own-row RLS, no enumeration · `verify-receta` minimal payload + rate limiting · `video-room` staff role + teleconsulta consent gate + private Daily rooms · `tablet-checkin` rate-limited, minimal responses, guardian evidence · customer A-vs-B isolation policies on portal tables · `sales` staff-only + customer-own-read · append-only triggers on `consulta_notes` + `medical_notes` · `customers_protect_evidence` delete block · membership validation server-authoritative at POS · POS blocks expired items at add + revalidates at cobrar (UI) · Rx gate covers all payment paths incl. split/insurance · `paypal-webhook` signature verification fail-closed · `cancel-my-membership` proper AuthZ · `create-portal-account` staff-only · `paypal-subscription-status` staff-only · no service-role keys anywhere in repo/frontend · PROFECO: auto-renewal disclosed pre-payment with mandatory checkbox · `get_queue_status` exposes counts only · kiosk/tablet persist nothing locally · service worker caches no clinical data · Fitbit/Garmin integrations disabled.

**Live verification log (2026-09-18):** `relrowsecurity` dump (23 tables — all true except `rx_number_counters`) · `pg_policies` dump for profiles/prescriptions/audit_log/memberships(+members)/doctor_profiles/inventory/consent_documents/sale_items/shifts/customers/lost_sales/storage.objects · `information_schema` grants for `public_signup_membership`+`lookup_login_email` (anon EXECUTE confirmed) and `rx_number_counters` (anon ALL) · `handle_new_user` source · data counts: 13 customer profiles with org_id, 1 admin PIN set, 0 efirma keys stored, 57 antibiotic-name items (34 flagged / 23 not), 24 expired rows with stock, 852/852 items controlled_group NULL.

---

## Priority plan

**This week (structural — one RLS hardening migration closes most):** R2-1, R2-2, R2-3, R2-4, R2-5, R2-6, R2-8, R2-24 (all auth/RLS), plus R2-10 (returns disposition) and R2-11/R2-13 classification passes.
**Next two weeks:** R2-7 (before any e.firma upload!), R2-9, R2-12, R2-14, R2-15, R2-16, R2-17, R2-18, R2-21, R2-25, R2-26, R2-28, R2-30, R2-31, R2-32.
**Conscious decisions / legal review:** R2-19 (historia clínica scope for a consultorio de farmacia), R2-20, R2-22, R2-23, R2-29, R2-34, R2-35, R2-44 [ORG]; controlled-substance catalog decision [ORG]; physical receta-retention and expired-stock quarantine practice [ORG]; SEP cédula verification cadence [ORG]; SGSI Anexo A signature still outstanding [ORG].

*Prepared from code inspection + live production verification on 2026-09-18. As with round 1: do not file anything with COFEPRIS from this document alone — [ORG] items and norm numerals marked for legal verification.*

---

## Resolution log — the 11 críticos (remediated 2026-09-18, same day)

All 11 criticals fixed and re-verified **live in production**. DB migration: `supabase/migrations/20260918180000_critical_rls_hardening.sql` (+ `20260918190000_hardening_followups.sql`), applied via management API — 117 statements, 0 failures, every change re-queried afterwards. Edge functions redeployed; frontend fixes in the same push.

- **R2-1 ✅ FIXED** — `handle_new_user` forces `role='customer'` and ignores metadata role/org (live-verified `reads_metadata_role=false`). New trigger `profiles_protect_privileged` also blocks non-admin UPDATEs to role/org_id/location_id/email/pin/pin_hash — closing the `profiles_own_update` self-promotion path found during remediation (the old policy let any user `update profiles set role='admin'` on their own row).
- **R2-2 ✅ FIXED** — PINs moved to `profiles.pin_hash` (bcrypt via pgcrypto; the 1 existing PIN migrated; live: 0 plaintext, 1 hashed). `verify_admin_pin(p_pin)` security-definer RPC returns `{id, full_name}` and audit-logs every attempt; `admin_set_profile_pin` is `is_admin()`-gated. POS price-override/void and AdminUsers rewired to the RPCs.
- **R2-3 ✅ FIXED** — org-wide role-less policies replaced with `is_org_staff()` on: inventory, locations, discounts, tax_settings, partners, lost_sales, suppliers, **supplier_products** (missed in the original sweep, same class), purchase_orders(+items), returns(+items), stock_adjustments, product_links, inventory_batches/movements/settings, bank_accounts, shifts, sale_payments, sale_items, memberships(+members). `sales`: org-wide select/insert/update dropped → existing `sales_staff` + new `sales_customer_insert` (own customer_id only) + `sales_customer_guard` trigger (customers: INSERT only `status='processing'`, UPDATE only the void fields). Customer-app catalog/consult-price reads moved to the new `inventory_catalog` view (definer; display columns only — cost/supplier no longer exposed).
- **R2-4 ✅ FIXED** — `audit_log`: SELECT admin-only, INSERT staff-only, `audit_log_no_update` trigger blocks UPDATE/DELETE (append-only, as SGSI §7 claims).
- **R2-5 ✅ FIXED** — `prescriptions`: `prescriptions_staff_insert` (POS registry rows, `doctor_id IS NULL`) + `prescriptions_doctor_insert` (caller must have role doctor, own uid) + `prescriptions_staff_update`. `prescriptions_freeze` trigger: content columns immutable; the signature block is settable exactly once by the owning doctor while unsigned; only status/void/fulfillment/sale-link fields stay staff-mutable. Service role exempt (edge functions).
- **R2-6 ✅ FIXED** — 7 permissive storage policies dropped → path-scoped (`recetas/{org}/{customer}/`) staff + owner read/insert/delete, mirroring patient-documents. `file_url` now stores the storage path; the customer app mints 1-hour signed URLs at display time.
- **R2-7 ✅ FIXED** — efirma columns moved to new `doctor_efirma` table (owner-only RLS; live-verified dropped from `doctor_profiles`). `sign-document` now requires an active-doctor JWT (fail closed), binds the request cert to the doctor's stored cert, rate-limits 30 req/10 min per user, returns only generic client errors. Redeployed + smoke-tested (401 without JWT).
- **R2-8 ✅ FIXED** — `public_signup_membership` EXECUTE revoked from anon/authenticated (live-verified `proacl` = postgres + service_role only). Bonus correctness fix: pending memberships no longer record a phantom payment/sale/welcome emails — `paypal-webhook` books payment #1 on the first confirmed charge.
- **R2-9 ✅ FIXED** — `paypal-subscription` activates only on PayPal status `ACTIVE` (anything else → membership stays `pending`, webhook flips it); existing-customer matching is exact normalized email only (phone-substring path deleted); pre-existing portal accounts never receive a password (HTTP 409 `account_exists`); mandatory `plan_id` check (fail closed). Redeployed + smoke-tested (generic 500, no PayPal internals leaked).
- **R2-10 ✅ FIXED** — returns now require an admin PIN (server-side `verify_admin_pin`) + a mandatory reason (stored on `returns.reason`/`authorized_by`); Rx/controlled items auto-route to `return_items.disposition='merma'` with **no restock**; restock happens only inside `createReturn`, linked to the return id (also fixes the R2-43 `return_qty`/`returnQty` key mismatch that logged qty=0 phantom movements).
- **R2-11 ✅ MECHANISM BUILT** — `controlled_register` table (staff-only RLS); POS Cobrar blocks "Finalizar venta" until foliada folio + médico + cédula (6–8 digits) are captured when `controlled_group` items are in the cart, and writes one register row per controlled item on completion. **Catalog classification stays [ORG]:** name scan of all 852 items found only 4 candidates — `CARISOPRODOL/DICLOFENACO 200mg/50mg 20TAB`, `GABAPENTINA 300mg 30CAP`, `PREGABALINA 75mg 14CÁP`, `PREGABALINA 75mg 28CÁP` (no Grupo II/III psychotropics by name). Confirm against physical stock and set `controlled_group` in Inventario if applicable.
- **R2-24 (bundled, MEDIA) ✅ FIXED** — `generate_rx_number` is now `security definer`; `rx_number_counters` has RLS enabled (deny-all) with anon/authenticated grants revoked (live-verified).

**Follow-ups noted during remediation (not criticals):**
- Lapsed members re-subscribing with an existing portal account now get 409 `account_exists` (intentional — the takeover fix). If there is no in-account resubscribe flow, that product path needs attention.
- Doctor-portal `AttachmentsTab.jsx` signs every `customer_documents.file_url` against the **patient-documents** bucket, so customer-uploaded recetas won't render there (predates this round). Bucket-aware signing is the follow-up.
- e.firma end-to-end retest is still pending until Dra. Castillo uploads her key (0 rows in `doctor_efirma` today): sign → freeze trigger → `verify-receta`.
- Recommend disabling public email signUp in Supabase Auth settings (dashboard toggle — defense in depth; the trigger fix already neutralizes the role vector).

All other round-2 findings (12 altos, 14 medios, 7 bajos) remain OPEN per the priority plan above.

---

## Resolution log — the 12 altos (remediated 2026-09-18, same day)

All 12 altos fixed (11 code+DB, 1 verified-already-fixed) and re-verified **live in production**. DB migrations: `supabase/migrations/20260918230000_alta_schema_rpcs.sql` (additive — 45 statements, applied first so the old frontend kept working) and `supabase/migrations/20260918234500_alta_policy_lockdown.sql` (22 statements + 7 grant revokes, applied only after the new frontend deployed). Edge functions redeployed; frontend in the same push (`12848df`). Verified live via management-API re-queries (pg_policies, proacl, pg_trigger, data counts) and edge smoke tests.

- **R2-12 ✅ FIXED** — POS receta capture (`PrescriptionModal.jsx`): cédula profesional required + `/^\d{6,8}$/`; fecha required, never future, antibiotics >30 días blocked ("receta vencida"), other Rx >180 días needs explicit confirmation; duplicate folio blocked client-side (normalized exact match among non-voided) AND by DB trigger `prescriptions_unique_folio` (placeholders SN/S-N/MANUAL-% exempt; legacy dupes grandfathered — 17×'SN', 17×'2' etc. predate the rule); "Receta retenida" checkbox (auto-shown/pre-checked on antibiotic carts) persists to new `prescriptions.receta_retenida`.
- **R2-13 ✅ FIXED** — 32 systemic antibiotic/antifungal items flagged `requires_prescription` live by explicit ID (incl. amoxi/clav, 3 bencilpenicilinas, 4 cefalexinas, ceftriaxona, 3 cefuroximas, clinda×2, eritro×2, fluconazol×5, gentamicina iny, itraconazol, ketoconazol tab, levoflox, metronidazol×2, nitrofurantoína, sulfa/trim×2, terbinafina tab). 6 topical-only combos deliberately left OTC (BARMICIL×2, ketoconazol crema, terbinafina crema×2, nistatina óvulos) — **[ORG] confirm that call with the responsable sanitario**. Validator shipped: shared `src/lib/antibiotics.js` matcher (accent-insensitive, topical-excluding); CSV import (tools + in-app) forces the flag + warns; manual item save warns on antibiotic-name without Rx.
- **R2-14 ✅ FIXED** — `is_clinical_staff()` (admin/doctor) now gates the 7 clinical tables (customers, appointments, consent_documents, customer_documents, medical_notes, consulta_notes, medical_history_versions) — live-verified all 7 staff policies. pos/inventory reach customer data only through 6 new security-definer `pos_*` RPCs (search/create customers, search prescriptions, search/get memberships, sale-for-return), EXECUTE restricted to authenticated (public/anon revoked — live-verified). POS rewired end-to-end incl. the non-obvious breakages: `getSales` customers-embed callers at close-shift (ShiftContext/CloseShiftModal → new pos-safe `getShiftSales`), ReturnModal sale fetch (→ `pos_get_sale_for_return` + `listRecentSaleIds` folio resolver), MembershipPosLookup (→ RPC, identical shape). Customer-facing own-row policies untouched.
- **R2-15 ✅ ALREADY FIXED** — verified live: memberships/membership_members carry only `is_org_staff()` staff + customer own-select policies (closed by the criticals migration earlier the same day).
- **R2-16 ✅ FIXED** — new `lookup-login-email` edge function (verify_jwt=false, 10 req/10 min/IP via rate_limit_events, service-role RPC call, `{email|null}`-only responses, generic errors) — deployed + smoke-tested (200/`{"email":null}` without JWT, 429 on the 9th rapid request). DB `lookup_login_email` revoked from anon+authenticated (live-verified: postgres+service_role only). Customer app login switched to the wrapper. **Note:** old cached app bundles calling the RPC directly fail until refreshed.
- **R2-17 ✅ FIXED** — downloadable receta PDF (`pdf.js`) now prints vía per med + the signature block (firma line, FIRMA DEL MÉDICO, nombre, Céd. Prof., "Firmada electrónicamente" when signed) mirroring the print template. Dosis+vía+frecuencia are now mandatory per med in both issuing paths (PostVisitDialog + standalone Nueva Receta; the standalone dialog gained the vía field) — an unsigned "PARACETAMOL"-only receta is no longer issuable.
- **R2-18 ✅ FIXED** — new `src/lib/allergyCheck.js` (accent-insensitive, both-directions, token≥4 matcher; skips `status:'denied'` history entries) runs at receta save on both paths: conflicts → blocking dialog → "Volver y corregir" or "Continuar de todas formas", the latter audit-logged (`PRESCRIPTION_ALLERGY_OVERRIDE`) + noted on the receta. PostVisitDialog prefills `alergias` from `customers.medical_history.alergias` (entry objects; label = allergen).
- **R2-19 ✅ FIXED** — `historia_clinica` table (NOM-004 6.1 sections: padecimiento actual, interrogatorio por aparatos y sistemas, exploración física, antecedentes resumen — prefilled from medical_history — diagnóstico; one per patient; append-only trigger; clinical-staff RLS + patient own-select). UI gate: first-ever nota de evolución for a registered patient requires capturing the historia first (PatientWorkspace + PostVisitDialog; walk-ins exempt). DB backstop `consulta_notes_historia_gate` trigger rejects the first note without historia — existing patients with prior notes grandfathered. **[ORG] decision: whether/how to backfill historias for existing patients.**
- **R2-20 ✅ FIXED** — `recordExport.js` rewritten to the complete expediente (NOM-024 6.6.6): patient data incl. domicilio + tutor; historia clínica; full medical_history; ALL medical_notes; consulta notes with EVERY section (exploración, vitals, resultados, pronóstico, plan, CIE-10, modality/tele fields, firma metadata); recetas (vía, alergias, firma); citas; attachments index (all customer_documents, metadata-only); consentimientos with full signature evidence (signer, relationship, id_ref, signed_at, ip, user-agent, revoked+revoked_at).
- **R2-21 ✅ FIXED** — DOB required on every remote signup, Mexican dd/mm/aaaa masked entry everywhere: customer-app signup + firma=1 view, MembershipPublicPage (→ paypal-subscription forwards into `public_signup_membership`, which now persists date_of_birth/guardian_*), family-member activation (→ `family-member-signup` requires `birth_date`, persists on membership_members + customers, guardian defaults to the titular), `/registro/` tablet (DOB replaces the es-menor checkbox; auto-reveals guardian block), and `tablet-checkin` derives minority **server-side from DOB** (client flag ignored; register mode requires valid DOB for everyone — smoke-tested 400). Minor accounts: guardian name + parentesco captured and persisted (`customers.guardian_name/guardian_relationship/guardian_id_ref`), guardian signs the consent docs (`signer_relationship`). DB backstop: `customers_minor_guardian` trigger rejects minor rows without guardian evidence (live). 2 pre-existing minor customers lack guardian columns — **[ORG] complete at next visit.**
- **R2-22 ✅ FIXED** — `arco_requests` register (customer insert/own-select, admin ALL) + customer-app "Privacidad y mis datos" view (file ARCO, track status, read responses) + new Admin → "ARCO / Privacidad" tab (status workflow + response + audit log). `revoke_consent` RPC (own rows only, `status='revoked'` + `revoked_at`, audit-logged) + UI — the consent gate and `video-room` only accept `status='signed'`, so revocation pauses teleconsulta immediately. Secondary purposes: `customers.marketing_opt_out` + customer toggle + `send-notifications` promo-template suppression (skips with `skipped_opt_out`; today zero promo templates exist — control is forward-looking).
- **R2-23 ✅ FIXED** — aviso de privacidad completed and unified: (a) secondary purposes are now refused via a separate, optional, unchecked-by-default checkbox at the signature gate (never blocks the 4 required docs; writes `marketing_opt_out`) — the aviso text documents the right to refuse without losing service; (b) new §7 discloses local-device health storage (localStorage) + lock-screen push notifications with how to disable; (c) encargados named: Daily.co, Resend, Meta/WhatsApp, PayPal, Supabase, Cloudflare; (d) texts unified — canonical `consentDocs.js` ≡ `consentTexts.js` (byte-identical, verified) and `MembershipTermsPage` now renders the canonical text instead of its divergent copy.

**Follow-ups noted during remediation:**
- `akauntingSync.syncSale` (fire-and-forget after POS sales) calls `getCustomerById`, which pos-role can no longer read — it fails soft to the default Akaunting contact, so cashier-sale invoices sync without per-customer contact mapping (admin-context syncs unaffected). If per-customer mapping matters, route it through a pos_* RPC.
- `pos_search_prescriptions` omits `doctor_office_address`/`doctor_phone` — the vincular-receta flow no longer prefills those two optional fields (still typeable).
- Returns of sales older than the last 500 need the full UUID (from Admin → Ventas) — `listRecentSaleIds(500)` window.
- Email-confirmation edge: a minor who signs up but completes the consent gate only at a later login gets DOB persisted via the fill-in update; guardian data relies on the gate. If Supabase email confirmation is enabled, consider replaying signup extras at first login.
- `updateMyProfile` RPC doesn't whitelist guardian fields — staff fixes to guardian data need SQL or a whitelist addition.
- All stations/devices should hard-refresh after this deploy (cached bundles predate the RPC/edge-function switches).

**Remaining round-2 backlog:** 14 medios (R2-25..R2-38; R2-24 was bundled into the criticals) and 7 bajos (R2-39..R2-44), per the priority plan above.
