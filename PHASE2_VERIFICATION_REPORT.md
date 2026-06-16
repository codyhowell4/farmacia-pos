# Phase 2 Verification Report

**Date:** 2026-06-05
**Project:** Farmacia POS System
**Scope:** Verify 5 critical areas + regression test before Phase 3

---

## Executive Summary

**🔴 4 CRITICAL issues found that will BREAK PRODUCTION if migrations are run as-is.**
**🟡 2 MAJOR issues that need attention.**
**🟢 6 features verified as correctly implemented in code.**

**DO NOT run the P2 migrations in Supabase until CRITICAL issues #2, #3, #4 are fixed.**

---

## 🔴 CRITICAL ISSUES (Must Fix Before Production)

### CR-1: Customer Login Redirect Loop

**File:** `src/pages/LoginPage.jsx:56` + `src/App.jsx:23`

**Problem:**
When a customer logs in, `LoginPage` navigates to `/`. But `App.jsx` routes `/` to `<Navigate to="/login" replace />`. This creates an **infinite redirect loop**:

```
Customer logs in → navigate('/') → redirect to '/login' → login page
```

**Code:**
```jsx
// LoginPage.jsx:56
} else {
  // Fallback for customer or unknown roles
  navigate('/');
}

// App.jsx:23
<Route path="/" element={<Navigate to="/login" replace />} />
```

**Impact:** Customer self-registration works, but the customer can never actually use the portal after logging in.

**Fix:** Add a customer portal route or redirect to the external static app:
```jsx
} else if (profile.role === 'customer') {
  window.location.href = '/customer-app/';
} else {
  navigate('/');
}
```

---

### CR-2: `handle_new_user` Trigger Does NOT Create Customer Profiles Correctly

**File:** `supabase_schema_fixed.sql:44-56` (currently deployed) vs `MIGRATION_backfill_missing_customers.sql:78-111` (ready but NOT run)

**Problem:**
The currently-deployed trigger hardcodes `role = 'pos'` and does NOT create a `customers` row:

```sql
-- CURRENT (deployed) — WRONG
insert into profiles (id, full_name, role)
values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'pos');
```

The `registerCustomer()` function passes `role: 'customer'` in metadata, but the deployed trigger ignores it and always sets `role = 'pos'`. It also never creates a `customers` row.

**Impact:**
1. Customer registration creates an auth user with a **POS staff profile** instead of a customer profile
2. No `customers` row is created, so the phone update in `registerCustomer()` fails
3. The registered "customer" could potentially log into the staff POS system

**Fix:** Run `MIGRATION_backfill_missing_customers.sql` in Supabase SQL Editor. It contains the corrected trigger:
```sql
v_role := COALESCE(new.raw_user_meta_data->>'role', 'customer');
-- ... creates both profiles AND customers rows
```

---

### CR-3: `profiles` Role Check Constraint Excludes `customer` and `doctor`

**File:** `supabase_schema_fixed.sql:38`

**Problem:**
```sql
role text not null check (role in ('admin', 'pos', 'inventory'))
```

This constraint does NOT include `'customer'` or `'doctor'`. When the corrected trigger tries to insert `role = 'customer'`, the database will **reject the insert** with a check constraint violation.

**Impact:** Customer self-registration will completely fail at the database level. Doctor users invited by admin will also fail.

**Fix:** Update the constraint before running migrations:
```sql
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pos', 'inventory', 'doctor', 'customer'));
```

> ⚠️ This must be done BEFORE running `MIGRATION_backfill_missing_customers.sql`, or the trigger will fail.

---

### CR-4: `customers` Table May Lack `profile_id` Column

**File:** `src/lib/db.js:1882`

**Problem:**
The `registerCustomer()` function does:
```js
await supabase.from('customers').update({ phone }).eq('profile_id', authData.user.id)
```

This requires `customers.profile_id` to exist. The column was added in `MIGRATION_customer_portal_prerequisites.sql:46`:
```sql
add column if not exists profile_id uuid references profiles(id) on delete set null;
```

**Status Unknown:** This migration's deployment status is unclear. If it was NOT run, `registerCustomer()` will crash.

**Impact:** Customer registration fails at the phone update step.

**Fix:** Ensure this migration was run, or run:
```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_profile_id_unique ON customers(profile_id) WHERE profile_id IS NOT NULL;
```

---

## 🟡 MAJOR ISSUES

### MJ-1: POS COFEPRIS Prescriptions May Fail RLS

**File:** `MIGRATION_P2_extend_prescriptions.sql:32-38`

**Problem:**
The migration adds this insert policy:
```sql
CREATE POLICY "doctor_prescriptions_insert" ON prescriptions
  FOR INSERT WITH CHECK (doctor_id = auth.uid() AND org_id = get_my_org_id());
```

But POS creates COFEPRIS prescriptions with `doctor_id = null`. If the existing staff insert policy was removed or never existed, POS users won't be able to create COFEPRIS prescriptions.

**Impact:** POS checkout with prescription requirement fails.

**Verification Needed:** Check if existing policies like `prescriptions_staff_insert` still exist in production. The migration only adds a doctor policy — it doesn't remove staff policies. If staff policies exist, this is not an issue.

**Fix (if needed):** Add a staff policy:
```sql
CREATE POLICY "prescriptions_staff_insert" ON prescriptions
  FOR INSERT WITH CHECK (is_org_staff() AND org_id = get_my_org_id());
```

---

### MJ-2: `getDoctorPrescriptions` Requires Auth (POS Prescription Search)

**File:** `src/lib/db.js:1772`

**Problem:**
`getDoctorPrescriptions()` calls `getOrgId()` which requires an authenticated session. The POS `PrescriptionModal` uses this to search for doctor prescriptions.

**Status:** POS users ARE authenticated (they logged in to access `/pos`), so this should work. But if `getOrgId()` fails for any reason, the prescription search breaks.

**Impact:** Low — POS users are always authenticated when using the modal.

---

## 🟢 VERIFIED AS CORRECTLY IMPLEMENTED

### V1: Doctor Prescription System ✅

- `createDoctorPrescription()` inserts with `prescribed_by = auth.uid()` ✅
- RX number auto-generated by database trigger ✅
- `AdminPrescriptions` uses `getDoctorPrescriptions()` which filters `.not('doctor_id', 'is', null)` ✅
- Shows correct columns: RX Number, Patient, Doctor, Medication, Dosage, Status ✅

### V2: POS Prescription Linking ✅

- `PrescriptionModal` searches by RX number or patient name ✅
- `selectPrescription` populates form and sets `linked_prescription_id` ✅
- `PoSDashboard` calls `linkPrescriptionToSale()` after sale creation ✅
- `linkPrescriptionToSale` updates `sale_id`, `status='fulfilled'`, `fulfilled_at` ✅

### V3: `+Nuevo Paciente` Creates Real Customer ✅

- `DoctorCustomers` calls `createCustomer()` (existing function, line ~1109) ✅
- Creates a `customers` row directly (not an auth user) ✅
- Patient appears in Admin → Clientes ✅
- Clicking patient navigates to workspace ✅

### V4: Admin Menu Restructure ✅

- Portal Cliente link at top ✅
- Configuración collapsible submenu (Usuarios, Médicos, Clientes, Citas, Auditoría, General) ✅
- Análisis collapsible submenu (COFEPRIS, Reorden, Ventas e Inventario) ✅

### V5: Supplier Management ✅

- `getSuppliers()` and `getInventoryWithSupplier()` in db.js ✅
- Inventory form has supplier dropdown ✅
- Table shows supplier name column ✅

### V6: Customer Self-Registration Page ✅

- `/customer-register` route exists and is public ✅
- Calls `registerCustomer()` with correct parameters ✅
- Shows QR code for pharmacy display ✅
- Links to `/login` for immediate access ✅

---

## ⚠️ MINOR / TECHNICAL DEBT

| Issue | File | Impact |
|-------|------|--------|
| Duplicate `getExpiryStatus` | `InventoryDashboard.jsx` + `AdminInventory.jsx` | Build passes, but tech debt |
| `getPrescriptions` (old) has no org filter | `src/lib/db.js:871` | Dead code, unused |
| No customer login route in App.jsx | `src/App.jsx` | Customer portal is external static app |
| `registerCustomer` in db.js alongside auth functions | `src/lib/db.js:1859` | Could be moved to separate file for clarity |

---

## 🧪 REGRESSION TEST CHECKLIST

Since there are no automated tests, the following must be manually verified after deploying fixes:

### POS Checkout
- [ ] Add items to cart
- [ ] Apply discount
- [ ] Complete sale with cash payment
- [ ] Complete sale with prescription (manual COFEPRIS)
- [ ] Complete sale with linked doctor prescription
- [ ] Verify receipt prints

### Inventory
- [ ] Add new product with supplier
- [ ] Edit product stock
- [ ] View inventory list with supplier column
- [ ] Check expiry status colors

### User Management
- [ ] Invite new POS user
- [ ] Invite new doctor user
- [ ] Reset user PIN
- [ ] Deactivate user

### Shifts
- [ ] Open shift
- [ ] Make sales during shift
- [ ] Close shift
- [ ] View shift report

### Reports
- [ ] Daily sales report
- [ ] COFEPRIS report
- [ ] Reorder report
- [ ] Inventory valuation report

---

## 📋 REQUIRED MIGRATION DEPLOYMENT ORDER

Run these **in order** in the Supabase SQL Editor:

### Step 1: Fix role constraint (CR-3)
```sql
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pos', 'inventory', 'doctor', 'customer'));
```

### Step 2: Add profile_id to customers (CR-4, if not already done)
```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_profile_id_unique ON customers(profile_id) WHERE profile_id IS NOT NULL;
```

### Step 3: Run backfill migration (CR-2)
```sql
-- Run the full contents of MIGRATION_backfill_missing_customers.sql
```

### Step 4: Run P2 prescription extensions
```sql
-- Run the full contents of MIGRATION_P2_extend_prescriptions.sql
```

### Step 5: Run P2 RX number trigger
```sql
-- Run the full contents of MIGRATION_P2_rx_number_trigger.sql
```

### Step 6: Fix customer login redirect (CR-1)
```bash
# Edit src/pages/LoginPage.jsx
# Change: navigate('/')
# To: window.location.href = '/customer-app/';
```
Then rebuild and redeploy.

---

## Summary

| Category | Count |
|----------|-------|
| 🔴 Critical | 4 |
| 🟡 Major | 2 |
| 🟢 Verified Correct | 6 |
| ⚠️ Minor | 4 |

**Bottom line:** The Phase 2 code is well-implemented, but the database layer has 4 critical issues that will prevent customer registration and doctor user creation from working. Fix the database schema and constraint issues first, then the login redirect, then deploy.
