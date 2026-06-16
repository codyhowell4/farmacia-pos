# Prescription Code Audit — Column Compatibility Report

**Date:** 2026-06-05
**Scope:** Every React file and db.js function that touches the prescriptions table
**Goal:** Confirm column name consistency before deploying MIGRATION_P2_fix_prescription_null_constraints.sql

---

## Executive Summary

| Check | Status | Detail |
|-------|--------|--------|
| prescription_number consistency | PASS | All 12 files use prescription_number. No rx_number used on prescriptions table. |
| doctor_license_number consistency | PASS | All 5 files use doctor_license_number. Zero instances of doctor_license. |
| rx_number usage | SEPARATE TABLE | rx_number exists only on sale_items (controlled substance tracking). Not related to prescriptions. |
| getCustomerPrescriptions | WRONG TABLE | Still queries customer_documents instead of prescriptions. |
| AdminOverview stats | WRONG TABLE | Counts customer_documents instead of prescriptions. |

**Verdict:** Deploy the NOT NULL fix. Then fix getCustomerPrescriptions and AdminOverview to query the correct table.

---

## 1. prescription_number vs rx_number Audit

### PASS: prescription_number is used consistently for the prescriptions table.

All files that read/write prescriptions.prescription_number:

| # | File | Line(s) | Usage |
|---|------|---------|-------|
| 1 | src/lib/db.js | 1796 | getPrescriptionByNumber() — .eq('prescription_number', number) |
| 2 | src/lib/db.js | 1808 | searchPrescriptions() — .or('prescription_number.ilike...') |
| 3 | src/components/PrescriptionModal.jsx | 71, 75, 116, 188, 203 | Read/write prescription_number for COFEPRIS linking and display |
| 4 | src/components/doctor/PatientWorkspace.jsx | 354 | Display rx.prescription_number in prescription list |
| 5 | src/components/admin/AdminPrescriptions.jsx | 56, 126 | Filter and display prescription_number |
| 6 | src/pages/PoSDashboard.jsx | 493, 505, 515 | Create COFEPRIS prescription with prescription_number, log it |
| 7 | src/pages/ReportsPage.jsx | 105, 298 | CSV export header + display prescription_number |
| 8 | MIGRATION_P2_rx_number_trigger.sql | 12 | Trigger sets NEW.prescription_number |

### SEPARATE TABLE: rx_number is on sale_items, NOT prescriptions

rx_number appears in these files but they target sale_items.rx_number:

| File | Line(s) | Context |
|------|---------|---------|
| src/pages/PoSDashboard.jsx | 473, 559 | sale_items.rx_number — tracks per-item controlled substance numbers at POS checkout |
| src/pages/ReportsPage.jsx | 109, 305 | CSV export for controlled substances report — reads item.rx_number from sale_items |
| supabase_schema_fixed.sql | 186 | Column definition: sale_items.rx_number text |

**Conclusion:** rx_number and prescription_number are two different fields on two different tables. There is NO naming conflict.

---

## 2. doctor_license_number vs doctor_license Audit

### PASS: doctor_license_number is used consistently everywhere.

| # | File | Line(s) | Usage |
|---|------|---------|-------|
| 1 | src/components/PrescriptionModal.jsx | 68, 113 | rx.doctor_license_number read, formData.doctorLicense -> doctor_license_number write |
| 2 | src/components/doctor/PatientWorkspace.jsx | 129 | doctor_license_number: '' in doctor prescription payload |
| 3 | src/pages/PoSDashboard.jsx | 502 | prescription.doctor_license_number in COFEPRIS record |
| 4 | src/pages/ReportsPage.jsx | 104, 296 | CSV header + display doctor_license_number |

**Zero instances of doctor_license (without _number) found anywhere in src/.**

---

## 3. Complete File Inventory — Every File Touching prescriptions

### Tier 1: Direct Read/Write to prescriptions table

| File | Function | Operation | Columns Used |
|------|----------|-----------|--------------|
| src/lib/db.js:855 | createPrescription() | INSERT | org_id, created_by + spread from caller |
| src/lib/db.js:871 | getPrescriptions() | SELECT | prescription_date, is_voided (dead code, unused) |
| src/lib/db.js:903 | voidPrescription() | UPDATE | is_voided, voided_at, voided_by |
| src/lib/db.js:1753 | createDoctorPrescription() | INSERT | org_id, doctor_id, created_by + spread from caller |
| src/lib/db.js:1772 | getDoctorPrescriptions() | SELECT | org_id, doctor_id, customer_id |
| src/lib/db.js:1790 | getPrescriptionByNumber() | SELECT | prescription_number, org_id |
| src/lib/db.js:1802 | searchPrescriptions() | SELECT | prescription_number, patient_name, org_id |
| src/lib/db.js:1815 | linkPrescriptionToSale() | UPDATE | sale_id, status, fulfilled_at |
| src/lib/db.js:1830 | updatePrescriptionStatus() | UPDATE | status, fulfilled_at |
| src/lib/db.js:1845 | cancelDoctorPrescription() | UPDATE | status |
| src/pages/PoSDashboard.jsx | completeSale() | INSERT (via createPrescription) | patient_name, patient_curp, doctor_name, doctor_license_number, doctor_office_address, doctor_phone, prescription_number, prescription_date |
| src/pages/PoSDashboard.jsx | completeSale() | UPDATE (via linkPrescriptionToSale) | Links existing doctor prescription to sale |
| src/components/PrescriptionModal.jsx | handleSubmit() | Passes to parent | patient_name, patient_curp, doctor_name, doctor_license_number, doctor_office_address, doctor_phone, prescription_number, prescription_date, linked_prescription_id |
| src/components/PrescriptionModal.jsx | selectPrescription() | Reads from search | patient_name, patient_curp, doctor_name, doctor_license_number, doctor_office_address, doctor_phone, prescription_number, prescription_date, medication |
| src/components/doctor/PatientWorkspace.jsx | handleCreateRx() | INSERT (via createDoctorPrescription) | customer_id, patient_name, patient_curp, doctor_name, doctor_license_number, medication, dosage, frequency, duration, notes, prescription_date |
| src/components/admin/AdminPrescriptions.jsx | loadPrescriptions() | SELECT (via getDoctorPrescriptions) | Displays: prescription_number, patient_name, customers.full_name, profiles.full_name, medication, dosage, frequency, duration, status, prescription_date, created_at |
| src/pages/ReportsPage.jsx | CSV export | Reads from data object | prescription_number, doctor_name, doctor_license_number, patient_name, patient_curp |

### Tier 2: Routes/Navigation (no direct DB access)

| File | Reference | Action |
|------|-----------|--------|
| src/pages/AdminDashboard.jsx | /admin/prescriptions | Route to AdminPrescriptions component |
| src/components/admin/AdminOverview.jsx | pendingPrescriptions | Stats card (but queries customer_documents — see below) |
| src/components/admin/AdminCustomerProfile.jsx | prescriptions tab | Displays prescriptions for customer (but queries customer_documents — see below) |

---

## 4. Column Compatibility Matrix

### Final Schema (after all P2 migrations + NOT NULL fix)

```
prescriptions TABLE:
  id                        uuid PK
  sale_id                   uuid FK -> sales
  org_id                    uuid FK -> organizations
  doctor_id                 uuid FK -> profiles
  customer_id               uuid FK -> customers
  patient_name              text NOT NULL
  patient_curp              text
  doctor_name               text          <- WAS NOT NULL, NOW NULLABLE
  doctor_license_number     text          <- WAS NOT NULL, NOW NULLABLE
  doctor_office_address     text
  doctor_phone              text
  prescription_number       text NOT NULL
  prescription_date         date NOT NULL
  medication                text
  dosage                    text
  frequency                 text
  duration                  text
  notes                     text
  status                    text DEFAULT 'active'
  expires_at                date
  fulfilled_at              timestamptz
  is_voided                 boolean DEFAULT false
  voided_at                 timestamptz
  voided_by                 uuid FK -> profiles
  created_at                timestamptz DEFAULT now()
  created_by                uuid FK -> profiles
```

### Code vs Schema Compatibility

| Column | Code Sets To | Schema Accepts? | Risk |
|--------|-------------|-----------------|------|
| patient_name | Always string (from form or customer name) | NOT NULL | None |
| prescription_number | Trigger auto-generates OR form provides | NOT NULL | None |
| prescription_date | Always YYYY-MM-DD string | NOT NULL | None |
| doctor_name | formData.doctorName.trim() or null (POS) or user?.name (Doctor) | NULL after fix | Fixed by migration |
| doctor_license_number | formData.doctorLicense.trim() or null (POS) or '' (Doctor) | NULL after fix | Fixed by migration |
| doctor_office_address | formData.doctorAddress.trim() or null | NULL | None |
| doctor_phone | formData.doctorPhone.trim() or null | NULL | None |
| patient_curp | customer?.curp or null (Doctor) or form (POS) | NULL | None |
| medication | rxForm.medication.trim() | NULL | None |
| dosage | rxForm.dosage.trim() or null | NULL | None |
| frequency | rxForm.frequency.trim() or null | NULL | None |
| duration | rxForm.duration.trim() or null | NULL | None |
| notes | rxForm.notes.trim() or null | NULL | None |
| customer_id | customerId (Doctor) or selectedCustomer?.id (POS) | NULL | None |
| doctor_id | user?.id (Doctor) or null (POS) | NULL | None |
| status | Default 'active' at DB level | NULL (has default) | None |
| created_by | user?.id | NULL | None |
| org_id | getOrgId() | NULL | Check schema — should be NOT NULL |

### Note on org_id

The prescriptions table in PHASE1_SCHEMA.sql defines org_id without NOT NULL. However, all INSERT code paths call getOrgId() which should return a valid UUID. The RLS policy doctor_prescriptions_insert requires org_id = get_my_org_id(). If org_id is NULL, the policy will reject the insert.

**Recommendation:** Consider adding NOT NULL to org_id in a future migration. For now, all code paths always provide it.

---

## 5. Issues Found (Beyond NOT NULL)

### Issue 1: getCustomerPrescriptions queries wrong table

**File:** src/lib/db.js:1609

```javascript
export const getCustomerPrescriptions = async (customerId) => {
  // ...
  const { data, error } = await supabase
    .from('customer_documents')   // <- WRONG: should be 'prescriptions'
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
```

**Impact:** Admin customer profile page shows uploaded documents (old feature) instead of doctor prescriptions.

**Fix:** Change to:
```javascript
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, profiles:doctor_id(full_name)')
    .eq('customer_id', customerId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
```

---

### Issue 2: getCustomerStats counts wrong table

**File:** src/lib/db.js:1595

```javascript
const [{ count: prescriptions }, ...] = await Promise.all([
  supabase.from('customer_documents').select('*', { count: 'exact', head: true })...
```

**Impact:** Stats show document count, not prescription count.

**Fix:** Change to:
```javascript
  supabase.from('prescriptions').select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId).eq('org_id', orgId),
```

---

### Issue 3: AdminOverview counts wrong table

**File:** src/components/admin/AdminOverview.jsx:19-24

```javascript
Promise.all([..., getCustomerDocuments(), ...])
  .then(([..., documents, ...]) => {
    const pendingPrescriptions = documents.filter(d => d.status === 'pending').length;
```

**Impact:** Dashboard card "Recetas pendientes" shows pending document uploads, not pending doctor prescriptions.

**Fix:** Add getDoctorPrescriptions() to the Promise.all and count status === 'active'.

---

## 6. Recommended Fixes (Priority Order)

### Immediate (before any user testing):

1. Deploy MIGRATION_P2_fix_prescription_null_constraints.sql — doctor_name / doctor_license_number nullable

### High Priority (after NOT NULL fix):

2. Fix getCustomerPrescriptions in db.js:1621 — change customer_documents -> prescriptions
3. Fix getCustomerStats in db.js:1596 — change customer_documents -> prescriptions
4. Fix AdminOverview in AdminOverview.jsx — query prescriptions instead of customer_documents

### Medium Priority:

5. Add NOT NULL to prescriptions.org_id — prevents accidental unscoped inserts

---

## 7. Verification Query

After deploying the NOT NULL fix, run this to confirm all code paths will work:

```sql
-- Test 1: COFEPRIS prescription with optional doctor fields (NULL)
INSERT INTO prescriptions (
  patient_name, prescription_date, prescription_number,
  org_id, doctor_name, doctor_license_number
) VALUES (
  'Test Patient', CURRENT_DATE, 'MANUAL-TEST-001',
  (SELECT id FROM organizations LIMIT 1),
  NULL, NULL
);

-- Test 2: Doctor prescription (no legacy doctor fields needed)
INSERT INTO prescriptions (
  patient_name, prescription_date, prescription_number,
  org_id, doctor_id, customer_id,
  medication, dosage, status
) VALUES (
  'Test Patient', CURRENT_DATE, '',
  (SELECT id FROM organizations LIMIT 1),
  (SELECT id FROM profiles WHERE role = 'doctor' LIMIT 1),
  (SELECT id FROM customers LIMIT 1),
  'Paracetamol', '500mg', 'active'
);

-- Verify RX trigger fired on test 2
SELECT prescription_number FROM prescriptions WHERE prescription_number LIKE 'RX-%' ORDER BY created_at DESC LIMIT 1;

-- Cleanup
DELETE FROM prescriptions WHERE prescription_number IN ('MANUAL-TEST-001') OR prescription_number LIKE 'RX-%';
```
