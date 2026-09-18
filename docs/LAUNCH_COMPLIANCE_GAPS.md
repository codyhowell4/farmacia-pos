# Launch Compliance Gap Analysis — Doctor Portal & Consentimiento Kiosk

**Date:** 2026-09-15
**Scope:** Doctor portal (`/doctor/*`) and the consentimiento flows (kiosk `public/consentimiento/index.html` + `tablet-checkin` edge function, customer-app consent gate, portal `ConsentTab`). POS/admin only where they touch these flows.
**Norms referenced:** NOM-004-SSA3-2012 (expediente clínico), NOM-024-SSA3-2012 (SIRES/expediente electrónico), NOM-027-SSA3-2013 (telemedicina), LFPDPPP 2025, Código de Comercio + LFEA (firma electrónica), Ley General de Salud arts. 42 Bis 1–6 (receta electrónica) y 245–255 (controlados), Reglamento de Insumos para la Salud (receta retenida de antibióticos), Reglamento de Prestación de Servicios de Atención Médica (consultorio adjunto a farmacia).
**Method:** every gap below is verified against the current code (file paths cited), not assumed. Org/paperwork items are marked **[ORG]** — they are not code and should be confirmed with your COFEPRIS gestor/abogado; exact article numbers on those items are flagged for legal review rather than asserted.

> Note: this supersedes `DOCTOR_PORTAL_NOM024_REVIEW.md` (2026-09-08) for these two flows. Most of that review's engineering blockers (CIE-10, append-only consulta notes, e.firma receta signing, clinical audit trail, attachments, expediente export, CURP validation, consent module) are now implemented. What follows is what is **still** open.

---

## 1. Consentimiento kiosk & consent flows

### C1 — HIGH · Public `lookup` endpoint is a patient-existence oracle
`tablet-checkin` is public (`verify_jwt = false`). `lookup` mode takes name + DOB and returns `{ found, full_name, consents_signed }` (`supabase/functions/tablet-checkin/index.ts:347-374`). Anyone who knows or guesses a person's name + birthdate can confirm **that person is a patient of the clinic** — that fact is itself sensitive health data under LFPDPPP. There is no rate limiting or captcha; the only spam control is a honeypot field (`index.ts:288-290`).
**Fix before launch:** rate-limit by IP at the edge function, return only the minimum (drop `full_name` from the response — the kiosk already knows the name), and consider per-IP attempt caps + generic responses.

### C2 — HIGH · Register mode can be abused for email-bombing
`register` mode (also public, same honeypot-only protection) provisions auth accounts and sends Supabase recovery emails (`index.ts:479-488`). An attacker can script registrations to flood arbitrary inboxes with our recovery emails (deliverability + abuse-report risk on our domain).
**Fix before launch:** same rate-limit/captcha work as C1 covers both.

### C3 — HIGH · Guest patients never receive a copy of what they signed
NOM-004-SSA3-2012, numeral 10.1, requires the patient be given a **copy** of the signed consentimiento informado. The kiosk guest flow explicitly targets people with **no email and no phone**, and the kiosk has no print/share function — so the one signature copy stays in `consent_documents` and the patient leaves with nothing.
**Fix before launch:** add a "Imprimir copia" step at the end of the kiosk flow (print the 4 docs, or a single acuse listing them with folio + fecha), and/or capture an optional email just for copy delivery.

### C4 — MEDIUM · Kiosk-registered patients fail NOM-024 Tabla 1 minimum identification
Guest registration captures only name + DOB (`index.ts:429-442`). NOM-024 Tabla 1 / NOM-004 ficha de identificación require **sexo** at minimum; CURP is the Tabla 1 identifier we otherwise validate. Kiosk-created customers therefore enter the expediente with incomplete identification until staff manually completes it — and nothing reminds staff to do so.
**Fix:** add a required sexo field (and optional CURP) to the kiosk forms; flag incomplete-Tabla-1 patients in the doctor portal patient header.

### C5 — MEDIUM · Guardian consent for minors is unverified and relationship-free
For minors, the guardian's typed name becomes `signer_name` on all 4 consent docs (`index.ts:343`). NOM-004 10.1 requires consent from whoever holds patria potestad/tutela — but we capture **no relationship** (padre/madre/tutor) and **no identity evidence** for the guardian. Any adult can type any name for any child. The DOB < 18 check is solid (`index.ts:305-306`); the attribution is the weak link.
**Fix:** capture guardian relationship (select: padre/madre/tutor legal) and an ID reference (INE/IFE number or last-4) on the minor flows; consider a staff-confirmation checkbox on the kiosk ("recepción verificó la identificación del tutor").

### C6 — MEDIUM · Returning-patient check-in is impersonable
Name + DOB is the only credential for `checkin` + `customer_id` (re-verified at `index.ts:382-393`). Anyone who knows a patient's name and birthdate can check in as them and inject auto-reported symptoms/medications/allergies into that patient's `medical_notes` — a clinical data-integrity risk, not just privacy.
**Fix:** kiosk copy telling the patient reception will confirm identity before the consulta; doctor-portal banner that kiosk notes are unverified self-reports (partially exists via the `[Auto-reporte...]` prefix); longer term, an SMS/WhatsApp code for patients who do have a phone.

### C7 — MEDIUM-LOW · Duplicate records from name variants
Matching is normalized but still exact (`normalizeName` at `index.ts:182-188`): "Juan Pérez" and "Juan A. Pérez" with the same DOB will not match, forking the expediente. NOM-024's whole premise is one identifiable record per patient.
**Fix:** admin-side duplicate-patient merge tool (does not exist today); fuzzy-match warning for staff.

### C8 — LOW · Aviso de privacidad: ARCO "cancelación" vs. 5-year retention
The aviso (privacidad text, `public/customer-app/js/consentDocs.js`) covers ARCO and revocation but never states the standard carve-out: **cancelación/supresión cannot be honored while the NOM-004 5.4 five-year retention obligation runs**. A patient could demand deletion of a record we are legally required to keep, and our own text doesn't back us up.
**Fix:** one paragraph in the privacidad text (both canonical `consentDocs.js` and the synced copy `src/lib/consentTexts.js`).

### C9 — LOW · Deleting a customer cascades away legal evidence
`customer_documents` (and with them consents/attachments) use `on delete cascade` (`supabase/migrations/MIGRATION_doctor_portal_foundation.sql:40-46`). If staff ever deletes a customer row (e.g., mishandled ARCO request, duplicate cleanup), the signed consents and attachments die with it — destroying evidence NOM-004 5.4 says we must keep 5 years.
**Fix:** soft-delete/anonymize customers instead of hard delete; reserve hard delete for a documented admin procedure.

### C10 — LOW · Portal ConsentTab "staff marks signed" is weak evidence
In the doctor portal, staff can mark a consent signed via a name prompt (`ConsentTab.jsx`) with no patient-side signature capture — attribution is a typed name + staff session, weaker than the kiosk's checkbox + IP/UA. Acceptable as a paper-process digitization, but the audit entry should record which staff member marked it (verify it does) and the print flow with witness lines should be the default.
**Fix:** none blocking; prefer the kiosk/app flow over manual marking; ensure the audit log captures the staff author.

---

## 2. Doctor portal

### D1 — HIGH · No controlled-substance guardrail on electronic recetas
There is **no** estupefaciente/psicotrópico (Grupo II/III) flag anywhere in inventory or the receta flow — "controlled" in our reports just means `requires_prescription` (`src/services/reportsService.js:24`). LGS arts. 245–255 and its Reglamento require controlados be prescribed **only** on official COFEPRIS foliada paper recetas with barcode — they must never go out on our electronic receta, signed or not. Today nothing stops a doctor from e-prescribing one if such a product is in inventory, and the printed/PDF receta would look official.
**Fix before launch (if any controlled med exists in inventory) or before any is stocked:** add a `controlled_group` flag on inventory and hard-block those items in the receta dialog with a "requiere receta foliada COFEPRIS" message. Also rename the Reports "Controlados" tab — it currently mislabels every Rx med as controlado.

### D2 — MEDIUM-HIGH · Cédula profesional is free text, unverified, and lands on every receta
`doctor_profiles.license_number` is typed by an admin with no format check and no verification (`src/components/admin/AdminDoctors.jsx:279-283`), then stamped onto every receta and justificante. A typo propagates to every legal document; a wrong cédula on a receta is a COFEPRIS inspection finding (LGS 42 Bis requires the receta identify the médico con cédula).
**Fix:** format validation + periodic verification against the SEP public cédula registry; require cédula before allowing receta creation (today recetas can be created with an empty cédula).

### D3 — MEDIUM · Teleconsulta consent is not enforced before video citas
NOM-027-SSA3-2013 requires informed consent for telemedicine. The 4-doc gate covers customer-app users, but patients created via POS/walk-in/kiosk-legacy can hold video citas without a `teleconsulta` consent on file — nothing checks before the Daily.co room opens (`video-room` edge function gates on payment, not consent).
**Fix:** block video-room issuance (or warn hard in the portal) when no signed `teleconsulta` consent exists for the patient; kiosk/app catch-up flow already exists to collect it.

### D4 — MEDIUM · NOM-027 record-keeping specifics for teleconsulta notes
For a video cita, the consulta note does not record that the modality was telemedicine, nor the patient's stated location, nor an identity-verification step — all telemedicine record-keeping expectations under NOM-027 (numerals to be confirmed with legal review). The note type is indistinguishable from in-person unless the doctor writes it.
**Fix:** auto-tag consulta notes from video citas with modality + patient location field; add an "identidad del paciente verificada" checkbox to `PostVisitDialog` for video consultas.

### D5 — MEDIUM · Daily.co rooms are link-public
Rooms are created with `privacy: 'public'` and an unguessable name (`supabase/functions/video-room/index.ts:47-72`). Anyone who obtains the URL (forwarded email, shared screen, browser history on a shared device) joins the consulta — exposure of live health data.
**Fix:** private rooms + per-participant meeting tokens (Daily supports this) or knocking/lobby; short expiry is already there.

### D6 — MEDIUM-LOW · `medical_notes` is not append-only — and its button is broken
The SGSI (§7) declares clinical notes append-only, and `consulta_notes` enforces it by trigger. But the free-text `medical_notes` table (which also receives every kiosk/check-in auto-report) has **no DB trigger**, and `updateMedicalNote`/`deleteMedicalNote` exist in `src/lib/db.js:1748,1835` (currently unused by the UI). Separately, the "Nueva Nota" button throws — it calls an undeclared `setEditingNote` (`PatientWorkspace.jsx:936`).
**Fix:** append-only trigger on `medical_notes` mirroring `consulta_notes_append_only()`; delete the unused mutators from db.js; fix or remove the broken button.

### D7 — MEDIUM-LOW · Signed-receta QR is not verifiable
The QR on signed recetas embeds a **truncated** 32-char signature fragment and a cert serial (`src/lib/cda.js:50-51`) with caption "verifique con el folio" — but no verification endpoint or page exists. A pharmacist (COFEPRIS's audience for receta electrónica under LGS 42 Bis) cannot actually verify anything.
**Fix:** public verify page (folio + first chars of signature → confirms hash/cert chain against the stored `signed_payload`), and point the QR at it.

### D8 — LOW · e.firma key custody needs a documented risk decision
Doctors upload their SAT `.key` (encrypted with their own password) and we store it base64 on `doctor_profiles`; the password lives only in sessionStorage and decryption happens in the edge function's memory (`src/lib/efirma.js`, `supabase/functions/sign-document/index.ts`). Pragmatic, but the LFEA assumes signature-creation data under the signer's **exclusive control** — server-side custody is a legal gray area that should be a conscious, documented decision.
**Fix:** add the custody model + risk acceptance to `docs/SGSI.md`; have the doctor sign an internal authorization for server-side custody.

### D9 — LOW · Audit trail has silent failure modes
Audit writes are fire-and-forget — failures only hit `console.error` (`src/lib/auditLog.js:16-18`) — and entries record action + free-text details without before/after diffs (except history snapshots). NOM-024 6.6.1 traceability is mostly there, but a dropped write is invisible.
**Fix:** surface audit-write failures (toast/log queue); add field-level before/after on receta cancel and history edits.

### D10 — LOW · No MFA / no idle timeout, though our own SGSI recommends them
`docs/SGSI.md` §4 recommends MFA (TOTP) for admin and doctor accounts and session discipline; Supabase Auth supports TOTP but nothing is enabled in the app. Not a NOM-024 blocker (6.6.3 is user+password minimum), but it is a self-imposed control we document and don't run.
**Fix:** enable Supabase MFA enrollment for doctor/admin, or downgrade the SGSI wording so the document matches reality.

---

## 3. COFEPRIS org checklist for launch **[ORG]** — confirm with your gestor/abogado

These are paperwork/process, not code, but they gate the consultorio's legality at inspection:

1. **Aviso de Funcionamiento** del consultorio adjunto a farmacia + **Aviso de Responsable Sanitario** (whoever is named — médico or químico) — COFEPRIS trámites; keep the acuses on site.
2. **Cédula profesional del médico visible** in the consultorio (original or certified copy) — pairs with D2.
3. **Recetas de antibióticos externas: receta retenida** — Reglamento de Insumos para la Salud requires the pharmacy to retain the original antibiotic receta and keep the registro. The POS captures the receta metadata (folio/cédula/doctor) and the CSV export covers the registro — but staff must physically retain the paper recetas; e-recetas from our portal are already retained digitally.
4. **Controlados:** if the doctor will prescribe Grupo II/III, they need the COFEPRIS foliada recetas and the pharmacy needs its own controls — and per D1, our e-receta must never be the vehicle.
5. **NOM-024 certification:** NOT required to operate or launch — only to *claim* certification in marketing. Decision documented in the old review; Medis365's cert took the per-scenario route (Consulta Externa first). Defer consciously.

---

## 4. Priority summary

**Before launch (blockers for the consentimiento subdomain + first video consultas):**
- C1 + C2 — rate limiting + response minimization on `tablet-checkin` (one fix covers both)
- C3 — print/copy step so kiosk signers leave with their copy (NOM-004 10.1)
- D1 — controlled-substance block (mandatory if any such med is stocked; otherwise ship the flag before stocking)
- D3 — teleconsulta consent gate before video-room issuance

**First 2 weeks:**
- C4 (sexo on kiosk), C5 (guardian relationship + ID), C6 (identity-confirmation messaging), D2 (cédula validation + required for recetas), D6 (medical_notes trigger + broken button), D4 (teleconsulta note tagging)

**Conscious decisions / legal review:**
- C8 + C9 (retention carve-out text + soft-delete), D5 (Daily.co private rooms), D7 (verification endpoint), D8 (e.firma custody memo in SGSI), D9/D10 (audit hardening + MFA), C7 (merge tool), C10 (staff-marked consents)

*Prepared from code inspection on 2026-09-15. Norm numerals for the [ORG] items and NOM-027 specifics are marked for legal verification rather than asserted — do not file anything with COFEPRIS from this document alone.*

---

## Resolution log — consentimiento items (2026-09-15)

All ten C-items above are **fixed and verified live** (commit `e5379cf`, migration `20260915120000_consentimiento_hardening.sql`, edge function redeployed). Live smoke tests: adult guest register created the confirmed walk-in cita with doctor assigned; lookup no longer returns `full_name`; a name-variant ("Kiosco Prueba Adulto" vs "…DeleteMe") matched loose; minor without parentesco → 400; minor consent rows carry `signer_relationship`/`signer_id_ref`; 14 rapid lookups → 429; the delete-protection trigger blocked customer deletion with the NOM-004 message and allowed the empty shell once children were removed. Test rows cleaned up.

- **C1/C2** — per-IP sliding-window rate limiting (`rate_limit_events`, fails open) on all three modes; lookup response minimized (no `full_name`).
- **C3** — kiosk success screen offers "Imprimir mi copia" (print view of the 4 signed documents with signer data, fecha/hora; guardian evidence for minors).
- **C4** — kiosk captures sexo (required) + optional CURP; server backfills both on matched records; patient header shows an amber "Datos NOM-024 incompletos" badge linking to the edit dialog.
- **C5** — minors require guardian name + parentesco + INE last-4 (kiosk flows); stored on consent rows as `signer_relationship`/`signer_id_ref`, shown in ConsentTab.
- **C6** — kiosk tells the patient reception will confirm identity; auto-report notes carry "identidad por confirmar en recepción" in the prefix and render an amber badge in the portal.
- **C7** — exact-then-loose name matching (unambiguous token-subset only) in lookup, guest reuse, and check-in re-verification. *(Still open by design: the admin duplicate-merge tool for pre-existing forks.)*
- **C8** — ARCO cancelación carve-out for the NOM-004 5-year retention added to the privacidad text (both canonical copies, cache-busted to `?v=4`).
- **C9** — trigger `customers_protect_evidence` blocks hard-deletes of customers with appointments/notes/consents/recetas/memberships/sales; AdminCustomers shows the message.
- **C10** — portal "marcar firmado" now stores `recorded_by_name` (staff member) and displays it next to the signature.

Also fixed as a drive-by: the "Nueva Nota" button crash (undeclared `setEditingNote`, `PatientWorkspace.jsx`).


---

## Resolution log — doctor portal items (2026-09-15)

All ten D-items above are **fixed** (migration `20260915160000_doctor_portal_hardening.sql` applied to prod; edge functions `video-room` v4, `paypal-capture-consult` v4, `verify-receta` v1 deployed and verified; portal build passes). Live verification: `verify-receta` returns `{found:false}` for unknown folios and the minimal payload for a real folio; the `medical_notes` append-only trigger blocked an UPDATE with its NOM-024 message. *(Not live-tested: signed-receta verification — no signed receta exists in prod yet; re-run the signed-folio check after the first e.firma signing. video-room/paypal flows need staff JWT / a real PayPal order — deploy-verified only.)*

- **D1** — `inventory.controlled_group` ('II'/'III', admin-editable in Inventario with red badge); controlled items are excluded from receta autocomplete and hard-blocked at save in both receta paths ("requiere receta foliada COFEPRIS"). Reports tab renamed "Medicamentos con Receta" and its query fixed to return real flattened rows (it previously rendered blank cells *and* mislabeled every Rx med as controlado).
- **D2** — cédula format validation (`/^\d{6,8}$/`) in AdminDoctors and in DoctorProfile (now editable there); receta creation blocked without a cédula, both from Nueva Receta and PostVisitDialog. *(SEP registry verification remains manual/periodic — [ORG].)*
- **D3** — `video-room` now refuses issuance when the appointment has no registered customer (400) or the customer lacks a signed `teleconsulta` consent (409), before any payment/membership charge. Note: customer-app users were already whole-app gated behind all 4 consents, and the kiosk signs all 4 — this closes the server-side hole for POS-created/legacy patients.
- **D4** — video consultas require "ubicación declarada del paciente" + "identidad verificada" in PostVisitDialog; stored on `consulta_notes` (`modality`, `tele_patient_location`, `tele_identity_verified`), shown in ConsultaNotesList and in the NOM-024 CDA export.
- **D5** — Daily rooms are now `private` with per-participant meeting tokens (patient token in `meeting_url`, staff owner token in new `appointments.meeting_url_staff`); portal "Unirse" buttons use the staff URL. Same treatment in `paypal-capture-consult`. Legacy public-room citas keep working.
- **D6** — `medical_notes_no_update` trigger (mirrors consulta_notes) makes free-text clinical notes append-only; dead `updateMedicalNote`/`deleteMedicalNote` removed from db.js; SGSI §6/§7 updated to match.
- **D7** — public `verify-receta` edge function (rate-limited, minimal payload) + `/verifica/` page (QR lands there; pharmacist sees valid/cancelled/unsigned/not-found + folio, médico, cédula, cert serial, signature-fragment match). Receta QR now encodes the verify URL instead of bare text.
- **D8** — SGSI new §8 documents the e.firma custody model with an explicit risk-acceptance decision + Anexo A (printable internal custody authorization for the doctor to sign — **[ORG]** collect the signature).
- **D9** — audit writes are checked, retried once, then queued to `audit_failed_queue` with an app-wide toast (sonner `Toaster` is now actually mounted — it never was, so *all* sonner toasts in the app were previously invisible); RECETA_CANCEL now audits with before-state + meds from both cancel paths (AdminPrescriptions had no audit at all); history edits log campo: antes → después.
- **D10** — SGSI §4 now states the true status (password-only today; TOTP MFA on the security roadmap) instead of claiming a control that doesn't exist. **Real MFA enrollment is still unbuilt** — schedule it if you want the control, not just the wording.
