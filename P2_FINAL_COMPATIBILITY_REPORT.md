# P2 Final Compatibility Report — Prescriptions Audit & Fixes

**Date:** 2026-06-05
**Scope:** Complete audit of prescriptions table NOT NULL constraints + fix 3 wrong-table queries
**Build Status:** PASS (1887 modules, 0 errors, 3.42s)

---

## 1. Remaining NOT NULL Constraints Audit

### After MIGRATION_P2_fix_prescription_null_constraints.sql, the prescriptions table has these NOT NULL columns:

| Column | Source | Set By | Blocks Doctor RX? |
|--------|--------|--------|-------------------|
| `id` | PK with DEFAULT gen_random_uuid() | Database auto | No — never inserted |
| `patient_name` | App code | Always provided by PatientWorkspace + PrescriptionModal | **No** — always present |
| `prescription_number` | BEFORE INSERT trigger | `trg_generate_rx_number` fires before constraint check | **No** — trigger sets it |
| `prescription_date` | App code | Always provided by PatientWorkspace + PrescriptionModal | **No** — always present |

### ✅ VERDICT: ZERO remaining NOT NULL constraints block doctor-created prescriptions.

---

## 2. prescription_date Recommendation

### Recommended: Stay NOT NULL with DEFAULT CURRENT_DATE

**Rationale:**

1. **Always provided by current code** — both `PatientWorkspace.jsx` and `PrescriptionModal.jsx` always send `prescription_date`
2. **DEFAULT CURRENT_DATE is a safety net** — if future code forgets it, the database handles it gracefully instead of failing
3. **A prescription without a date is meaningless** — preserving NOT NULL maintains data integrity
4. **Backwards compatible** — existing code continues to work exactly the same
5. **Consistent with `created_at`** — which also has DEFAULT now()

### Rejected alternatives:

- **Become nullable** — A prescription without a date makes no business sense. Would degrade data quality.
- **Stay NOT NULL without default** — Works today, but a future bug (e.g., forgotten field in a new feature) would cause a hard failure instead of graceful degradation.

---

## 3. Files Changed

### SQL Migration

| File | Change |
|------|--------|
| `MIGRATION_P2_final_compatibility.sql` | Adds `DEFAULT CURRENT_DATE` to `prescriptions.prescription_date`. Includes 7 verification queries. |

### db.js Functions (3 fixes + 1 new)

| Function | Line | Fix |
|----------|------|-----|
| `getCustomerStats()` | ~1596 | Changed `customer_documents` -> `prescriptions` for prescription count |
| `getCustomerPrescriptions()` | ~1621 | Changed `customer_documents` -> `prescriptions` + added `profiles:doctor_id` join |
| `getActivePrescriptionCount()` | ~1858 | **NEW** — counts `status='active'` doctor prescriptions for org |

### React Components (2 fixes)

| File | Fix |
|------|-----|
| `src/components/admin/AdminCustomerProfile.jsx` | Updated `prescriptionStatusConfig` to match prescriptions table statuses (active/fulfilled/expired/cancelled). Updated rendering to show `medication`, `prescription_number`, doctor name from joined `profiles`. |
| `src/components/admin/AdminOverview.jsx` | Replaced `getCustomerDocuments()` with `getActivePrescriptionCount()`. Dashboard "Recetas pendientes" now counts active doctor prescriptions instead of pending document uploads. |

---

## 4. Wrong-Table Query Fixes — Before vs After

### Fix 1: getCustomerStats (db.js)

**BEFORE:**
```javascript
supabase.from('customer_documents').select('*', { count: 'exact', head: true }).eq('customer_id', customerId)
```

**AFTER:**
```javascript
supabase.from('prescriptions').select('*', { count: 'exact', head: true }).eq('customer_id', customerId).eq('org_id', orgId)
```

**Impact:** Admin customer profile tab now shows real prescription count.

---

### Fix 2: getCustomerPrescriptions (db.js)

**BEFORE:**
```javascript
supabase.from('customer_documents').select('*').eq('customer_id', customerId)
```

**AFTER:**
```javascript
supabase.from('prescriptions').select('*, profiles:doctor_id(full_name)').eq('customer_id', customerId).eq('org_id', orgId)
```

**Impact:** Admin customer profile "Recetas" tab now shows real doctor prescriptions with medication name, RX number, and doctor name.

---

### Fix 3: AdminOverview pending prescriptions

**BEFORE:**
```javascript
Promise.all([..., getCustomerDocuments(), ...])
  .then(([..., documents, ...]) => {
    const pendingPrescriptions = documents.filter(d => d.status === 'pending').length;
```

**AFTER:**
```javascript
Promise.all([..., getActivePrescriptionCount(), ...])
  .then(([..., activeRxCount, ...]) => {
    const pendingPrescriptions = activeRxCount;
```

**Impact:** Admin dashboard "Recetas pendientes" card now counts active doctor prescriptions (status='active') instead of pending document uploads.

---

## 5. Deployment Order

```
STEP 1: Run MIGRATION_P2_fix_prescription_null_constraints.sql  (if not already done)
        -> Makes doctor_name and doctor_license_number nullable

STEP 2: Run MIGRATION_P2_final_compatibility.sql
        -> Adds DEFAULT CURRENT_DATE to prescription_date

STEP 3: Deploy frontend build (already built, 0 errors)
        -> Contains fixed db.js + AdminCustomerProfile + AdminOverview

STEP 4: Verify with the verification query in MIGRATION_P2_final_compatibility.sql
```

---

## 6. Verification Checklist

- [ ] Run `MIGRATION_P2_final_compatibility.sql` in Supabase SQL Editor
- [ ] V1 shows PASS — prescription_date has DEFAULT
- [ ] V2-V4 show PASS — patient_name, prescription_number, prescription_date still NOT NULL
- [ ] V5-V6 show PASS — doctor_name, doctor_license_number are nullable
- [ ] Doctor creates prescription from PatientWorkspace -> succeeds
- [ ] Admin Prescriptions page shows the new prescription
- [ ] Admin customer profile shows prescription with medication + RX number + doctor name
- [ ] Admin dashboard "Recetas pendientes" count increments
- [ ] POS can link prescription to sale -> status changes to 'fulfilled'
