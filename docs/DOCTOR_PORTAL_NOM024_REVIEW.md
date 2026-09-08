# Doctor Portal — Competitive Review & NOM-024-SSA3-2012 Compliance Plan

**Date:** 2026-09-08
**Status:** DRAFT for review — no code changes made
**Scope:** Doctor portal only (teleconsulta, citas, expediente, recetas). POS/admin out of scope except where noted.

---

## 1. What we have today (verified in code)

### Citas & teleconsulta
- Cita CRUD with walk-in support, status flow (pending → confirmed → completed/cancelled)
- Video consultas via Daily.co: payment/membership validation, auto-room creation, unpaid pendings hidden + auto-cancel after 10 min
- Post-visit form on completing a consulta: **required** nota, optional receta (multi-med) and signos vitales; note linked to the appointment
- Patient self-booking in the customer app with doctor availability windows (30-min slots)
- Doctor profile: display name, weekly availability editor

### Expediente (per patient, `customers.medical_history` jsonb)
- Sections: Alergias, Antecedentes Patológicos, No Patológicos, Heredofamiliares, Gineco-Obstétricos, Vacunación, Perinatales — each entry positive/denied with suggestions
- Allergy warning banner in patient header
- Free-text medical notes (CRUD)
- Purchase history (POS link)

### Recetas
- Multi-medication with inventory autocomplete (live stock, Rx-required badges)
- Vitals fields (edad, talla, peso, temp, TA, FC, FR, So2, glicemia, alergias), próxima cita
- Printable half-letter PDF (brand, meds, vitals, folio) — wet-signature line
- Status badges exist but **no edit/cancel/status-change UI** (create + print only)
- `doctor_license_number` (cédula) is **saved empty** — printed receta shows blank cédula

### Dashboard & inventory
- Stats cards (citas hoy, pacientes, recetas activas, próximas citas), today's list
- Read-only pharmacy inventory with search/sort/stock & expiry filters

### Verified gaps (grep-confirmed absences)
No lab/imaging orders, no consent forms, no CFDI (POS button is a "próximamente" stub), no digital signature, no CIE-10 catalog, **no audit trail of clinical edits** (`medical_history` is a jsonb blob overwritten in place; `medical_notes` editable without history), no attachments tab, no SOAP structure, no patient reminders/messaging, no receta cancel flow, no orphan-routed `DoctorPreorders`/`DoctorMedicalNotes` components.

---

## 2. Competitor comparison

| Area | **Us** | **Medis 365** ($390 MXN/mes per doctor) | **Nimbo** (quote-based) |
|---|---|---|---|
| Agenda/citas | ✅ solid; auto-cancel unpaid | ✅ color labels, Google Calendar sync | ✅ rooms/equipment scheduling, recurring, no-show metrics, Reserve with Google |
| Self-booking | ✅ in our app | ✅ from doctor's website/social | ✅ branded public portal |
| Teleconsulta | ✅ Daily.co + payment gate | ✅ built-in, payment before call | ✅ WebRTC native or Zoom; Stripe pre-payment link; virtual waiting room |
| Expediente | 🟡 sections exist, no structure per consulta | ✅ customizable per specialty; evolution notes w/ CIE-10; graphed vitals | ✅ templates per specialty, problem list, rich text, attachments, duplicate-patient merge |
| Receta electrónica | 🟡 good meds+vitals, no cédula/signature | ✅ catalog, WhatsApp/email delivery | ✅ **FIEL/e.firma + AdES signature**, QR security codes, interaction alerts (Medi-Span/UpToDate), multiple recetas per consulta |
| Lab/imaging | ❌ | ✅ orders + patient uploads results | ✅ result storage/import |
| Consent forms | ❌ | ✅ justificantes + consent forms | ✅ digital informed-consent module w/ signature |
| Notas clínicas IA | ❌ | ✅ dictation→SOAP, AI summary | ✅ Scribe transcription, smart summary |
| Patient portal | ✅ recetas, citas, video | 🟡 no named portal (WhatsApp/email delivery) | ✅ full portal + iOS/Android app, pre-consulta questionnaires, chat |
| Recordatorios | ❌ | ✅ email/SMS/WhatsApp | ✅ WhatsApp/SMS/email + confirmations |
| Facturación CFDI | ❌ (stub) | 🟡 "facturación electrónica MX/Perú" (CFDI not named) | ✅ **CFDI 4.0 timbrado/cancelación, factura global** |
| Roles | 🟡 doctor/admin only | ✅ reception/assistant/cashier roles | ✅ free secretary, nurse (pre-consulta vitals), 2FA |
| Reportes | ❌ doctor side | ✅ CIE-10 stats, financials | ✅ SUIVE, COFEPRIS hoja diaria, padrón (NOM-024) |
| Audit log (clinical) | ❌ | ✅ (report area "Seguridad") | ✅ full event log, login reports |
| Inventory | ✅ **stronger** (they have none) | ❌ (thin "insumos" report) | ✅ multi-branch SKU, consume-in-consult |
| **NOM-024 certificate** | ❌ | ✅ **DGIS-CER-P-008-2025-07, valid → 2027-07-24** | 🟡 claims "compliance", no formal certificate found |

**Takeaway:** our operational core (citas → video → post-visit → receta → pharmacy fulfillment) is genuinely competitive — Medis365 has no pharmacy/POS at all. The gaps that matter: **structured clinical notes with CIE-10, audit trail, consent forms, reminders, receta signature/cédula, roles, and the NOM-024 certificate** — the certificate being Medis365's sharpest marketing weapon and the user's stated goal.

---

## 3. NOM-024-SSA3-2012 — what it actually requires

*(Verified against the official DOF text, 30/11/2012, still vigente; numeral citations included.)*

### 3.1 Who must comply
- Mandatory for **any establishment (public or private) that adopts an electronic health record system** — and explicitly for **software vendors** holding rights of ownership/authorship/distribution of such systems (numeral 1.2–1.3). Adopting an EHR is optional (NOM-004 5.12), but **once we operate one, NOM-024 applies in full — including to us as the vendor.**
- Legal anchor: art. 109 Bis Ley General de Salud.

### 3.2 Certification process (numeral 7)
1. **Dictamen de Verificación** by DGIS or an accredited Unidad de Verificación — evaluates the system against each applicable *Guía y Formato de Intercambio* (7.3.2).
2. **Certificado** issued by DGIS or an Organismo de Certificación (7.3.1, 7.5). **Validity: 2 years** (7.5.3); re-evaluation on significant system changes.
3. What's verified in the software (7.4.2): exchange interfaces per Guía y Formato · use of Apéndice A catalogs · Tabla 1 minimum identification data · security functionality per 6.6.
4. The **clinic** is verified separately: must *use* a certified SIRES, demonstrate exchange capability, and run an SGSI (7.4.3).
5. Medis365's certificate (DGIS-CER-P-008-2025-07) confirms this is attainable for a small private vendor: they passed "Consulta Externa 96/106 variables, Salud Mental 77/85, Planificación Familiar 66/72" — i.e., certification is **scoped per exchange scenario**, not all-or-nothing.

### 3.3 Technical requirements mapped to our system

| Requirement (numeral) | What it means | Our status |
|---|---|---|
| Structured, **unalterable** electronic documents (6.3.4, 6.6.2) | Entries become immutable; changes attributable, never silent overwrites | ❌ **Blocker.** `medical_history` jsonb overwritten in place; notes editable with no history |
| Audit registry — reconstruct prior states (3.42, 5.8, 6.6.1) | Chronological user-activity log for clinical data | ❌ **Blocker.** `audit_log` covers POS/admin only, zero doctor actions |
| Authentication: user+password minimum (6.6.3); role-based profiles (6.6.4) | Unique accounts, role access | 🟡 Supabase Auth + roles exist; no clinical-role granularity (e.g., secretary), no MFA |
| **Firma electrónica avanzada capability** (6.6.2) | System must *allow* FEA (Ley de Firma Electrónica Avanzada) for professional entries | ❌ No signature at all; cédula not even populated on recetas |
| CURP validated, never auto-generated (6.5.1); Tabla 1 minimum ID data (6.5.3) | CURP field + validation; FOLIO, FECNAC, SEXO, etc. capturable | 🟡 CURP field exists; no checksum validation; several Tabla 1 fields (sexo, entidad nacimiento, folio) missing on `customers` |
| Mandatory catalogs, Apéndice A (6.4.2) | **CIE-10** for diagnoses, CLUES, INEGI geo, Cuadro Básico de Medicamentos, vías de administración | ❌ No catalogs; diagnoses are free text |
| Exchange interfaces per DGIS Guías y Formatos — HL7 CDA/V3/XML (6.1.3.1, 6.3.1) | Export/exchange clinical docs in the standard for each certified scenario | ❌ Nothing — biggest engineering lift |
| Exchange traffic authenticated, encrypted, signed (6.6.5) | TLS + auth + FEA on exchange endpoints | 🟡 TLS via Supabase; no document signing |
| Patient data export with consent controls (6.6.6) | Export a patient's record on request | ❌ No export |
| SGSI — information security management system (6.6.1) | Confidentiality, integrity, availability, traceability, non-repudiation — **an org process, not just code** | ❌ Not formalized |
| Availability/integrity over time (5.6) | Backups/DR as part of SGSI (no explicit schedule in the norma) | 🟡 Supabase managed backups; not documented as policy |

### 3.4 NOM-004-SSA3-2012 (record *content* — the clinic's obligation, our forms must support it)
- Historia clínica: ficha de identificación, antecedentes (heredo-fam/patológicos/no patológicos), padecimiento actual, **aparatos y sistemas**, exploración física con signos vitales, resultados de estudios, **diagnósticos**, pronóstico, indicación terapéutica (6.1)
- **Nota de evolución** (6.2) — SOAP-style per consulta; interconsulta/referencia (6.3–6.4); **consentimiento informado** (10.1)
- **Every entry: date, time, full name + signature (autograph/electronic/digital)** (5.9–5.10)
- **Retention ≥ 5 years** from last medical act (5.4) — fine on Supabase, must be policy
- Our status: antecedentes ✅, vitals ✅, but **no per-consulta structured note** (only free text), no padecimiento/aparatos y sistemas structure, no pronóstico, no consent forms, no signature.

### 3.5 Privacy law update (must factor in)
The 2010 LFPDPPP was **abrogated 20-Mar-2025** by the new Ley Federal de Protección de Datos Personales en Posesión de los Particulares — oversight moved from (extinct) INAI to **Secretaría Anticorrupción y Buen Gobierno**. Health data remains sensitive; consent must be "free, specific and informed." We need an **aviso de privacidad** in the customer app and express-consent capture. *(Flag: exact article numbers of the 2025 law not yet verified from the full text.)*

### 3.6 Things vendors over-claim — NOT actually in NOM-024-2012
Specific audit-log field lists · backup frequency mandates · explicit version-control UI · SNOMED/LOINC (that was the abrogated 2010 version) · a fixed CDA template in the norma itself (lives in DGIS Guías y Formatos). Don't over-build for these.

---

## 4. Gap summary — what stands between us and certification

**Engineering blockers (must exist before a Dictamen):**
1. **Immutable clinical entries + audit trail** — versioned medical_history, append-only consulta notes with author/timestamp, doctor-action audit log
2. **Per-consulta structured note (NOM-004 6.1–6.2)** — padecimiento actual, exploración, diagnóstico **with CIE-10 catalog**, pronóstico, plan — replacing/enriching today's free text
3. **CIE-10 diagnosis catalog** (mandatory Apéndice A catalog)
4. **Tabla 1 patient identification** — CURP checksum validation, sexo, entidad de nacimiento, folio
5. **Signature** — at minimum cédula on every receta/note; FEA capability is the cert-level requirement (Nimbo uses SAT e.firma/FIEL)
6. **Patient data export** (6.6.6)
7. **HL7 CDA exchange interface** for the chosen Guía(s) — largest single lift; scoped like Medis365 (Consulta Externa first)
8. **Consentimiento informado + aviso de privacidad** flows

**Org/process blockers (cheap but real):** SGSI documentation, security workgroup, backup/retention policy (5-year), access-control policy.

**Competitive (not cert-required) but expected by users:** WhatsApp/SMS/email reminders, consent/questionnaire delivery at booking, attachments (lab results, images), receta cancel/status flow, justificantes, Google Calendar sync, secretary/nurse roles, doctor-side reports.

---

## 5. Recommended roadmap (proposal — for your decision)

### Phase 0 — Quick correctness wins (days, no cert dependency)
- Populate cédula from `doctor_profiles` onto recetas + print (it's saved empty today)
- Receta cancel/edit flow (db functions exist, unwired)
- CURP checksum validation on patient forms
- Doctor-action audit log (reuse `audit_log`: note create/edit, history edit, receta create/cancel)
- Aviso de privacidad page + express-consent checkbox in the customer app

### Phase 1 — NOM-004 content parity (weeks)
- Structured consulta note (padecimiento → exploración/vitals → diagnóstico CIE-10 → pronóstico → plan) replacing free text, append-only with author/timestamp
- CIE-10 catalog integration (search + code on notes/recetas)
- Versioned `medical_history` (change log per section, no silent overwrite)
- Consentimiento informado generator + storage; justificantes
- Attachments tab (lab results, images)
- Patient record export (PDF/JSON)

### Phase 2 — Competitive parity (parallel with Phase 1)
- WhatsApp/SMS/email reminders + booking confirmations (also attacks no-shows)
- Consent/questionnaire delivery at booking time
- Roles: secretary (agenda-only), nurse (pre-consulta vitals)
- Doctor reports: consultas by diagnosis, no-show rate, top medications
- Google Calendar sync

### Phase 3 — Certification track (months + formal process)
- Pick target Guía(s) y Formatos with DGIS — start **Consulta Externa** (Medis365's path)
- HL7 CDA document generation for that scenario; signed/authenticated exchange
- FEA integration (SAT e.firma) for recetas and notes
- SGSI formalization + evidence package
- Apply for **Dictamen de Verificación** (DGIS or accredited Unidad de Verificación), then Certificado (2-year validity)
- Budget note: Medis365 sells at $390 MXN/mes per doctor *with* the certificate as the headline — it is a revenue feature, not just compliance.

**Open questions for you:**
1. Is formal DGIS certification a hard requirement now, or do we build Phase 0–2 (which make us cert-ready) and file when the consultorio volume justifies it?
2. Which matters first for the doctors: reminders/messaging (revenue-adjacent) or structured NOM-004 notes (compliance-adjacent)?
3. FIEL/e.firma: do the doctors already have their SAT e.firma? (Affects receta-signing design either way.)

---

*Sources: official DOF texts of NOM-024-SSA3-2012 (cód. 5280847) and NOM-004-SSA3-2012 (cód. 5272787); medis365.com.mx + DGIS certificate DGIS-CER-P-008-2025-07; nimbo-x.com product pages; codebase inventory verified 2026-09-08.*
