# Critical Fixes Deliverable — Pre-Phase 2 Deployment

**Date:** 2026-06-05
**Status:** ✅ Ready for deployment
**Scope:** Fixes CR-1 through CR-4

---

## 1. SQL Migrations

### Primary Migration

**File:** `MIGRATION_CRITICAL_FIXES.sql` (278 lines)

Run this **in the Supabase SQL Editor, top to bottom, do not skip**.

#### What it does (in order):

| Step | Issue | Action |
|------|-------|--------|
| **0** | — | Recreate helper functions: `is_admin()`, `is_org_staff()` (with doctor), `is_customer_user()`, `get_my_org_id()` |
| **1** | **CR-3** | Dynamically find and drop the old `profiles.role` check constraint, then add `profiles_role_check` allowing `('admin', 'pos', 'inventory', 'doctor', 'customer')`. Also ensures `profiles.email` exists. |
| **2** | **CR-4** | Add `customers.profile_id` column (IF NOT EXISTS) + unique partial index. Guards against missing `customers.org_id`. |
| **3** | **CR-2** | Recreate `handle_new_user()` trigger to: read role from metadata (default `'customer'`), set `org_id` from metadata or first org, create `profiles` row for ALL users, create `customers` row for `role='customer'`. |
| **4** | — | Backfill: create `customers` rows for any existing `profiles` with `role='customer'` that are missing one. Ensure customer profiles have `org_id`. |
| **5** | — | Create customer RLS policies on `customers` table: `customers_self_select`, `customers_self_update`, `customers_self_insert`. |

#### Verification queries (included at end of migration):

| Query | Expected Result |
|-------|-----------------|
| V1: Role constraint | `PASS` — 5 roles allowed |
| V2: Trigger attached | `PASS` — `on_auth_user_created` exists |
| V3: profile_id column | `PASS` — column exists on `customers` |
| V4: Profile↔customer linkage | `PASS` — count of customer profiles equals count of linked customer rows |
| V5: Orphaned profiles | **0 rows** — all customer profiles have a customers row |

#### Rollback (if needed):
```sql
-- Restore old trigger (from supabase_schema_fixed.sql)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', new.email), 'pos');
  RETURN new;
END;
$$;

-- Note: cannot easily restore old role constraint if it was inline without a name
-- The dynamic drop in the migration removes it permanently
```

---

## 2. Affected Files

### Modified Files

| File | Change | Lines |
|------|--------|-------|
| `src/pages/LoginPage.jsx` | Customer login now redirects to `/customer-app/` instead of `/` (which looped back to `/login`) | 54–56 |

### New Files

| File | Purpose |
|------|---------|
| `MIGRATION_CRITICAL_FIXES.sql` | Single consolidated migration fixing CR-2, CR-3, CR-4 + backfill + RLS + verification |

### Unchanged (but dependent on migration)

| File | Why it matters |
|------|----------------|
| `src/lib/db.js` | `registerCustomer()` calls `supabase.auth.signUp()` with `role: 'customer'` metadata. After the migration, the trigger will correctly create both `profiles` and `customers` rows. |
| `src/pages/CustomerRegisterPage.jsx` | Registration form. After migration, submitted registrations will succeed end-to-end. |
| `public/customer-app/js/api.js` | Customer portal picks up existing Supabase session via `sb.auth.getUser()`. After redirect from login, session persists. |

---

## 3. Regression Risk Assessment

### 🔴 HIGH RISK — Test First

| Risk | Mitigation |
|------|------------|
| **Existing staff users created while old trigger was active may have `role='pos'` even if admin intended `'admin'`** | The old trigger hardcoded `'pos'` for everyone. After migration, NEW users will get correct roles. Existing users' roles are NOT changed by this migration. Verify existing admin users still have `role='admin'` in the database before running. |
| **Backfill INSERT may create unexpected customers rows** | The backfill only targets `profiles.role = 'customer'` rows that have NO matching `customers` row. It will NOT create rows for staff users. Review V5 query output after running. |
| **`org_id` assignment uses first organization** | `SELECT id FROM organizations ORDER BY created_at LIMIT 1`. If you have multiple orgs, verify the first one is the intended default for self-registered customers. |

### 🟡 MEDIUM RISK — Monitor

| Risk | Mitigation |
|------|------------|
| **`is_org_staff()` recreated with doctor included** | If any existing policy relied on doctor NOT being staff, behavior changes. Review any custom policies that reference `is_org_staff()`. |
| **`profiles.email` column added** | Safe — nullable, existing rows unaffected. Used by trigger only. |
| **`customers.profile_id` unique index** | If duplicate `profile_id` values already exist (from manual inserts), index creation will FAIL. The migration guards against this by using `WHERE profile_id IS NOT NULL`, but if duplicates exist, you must clean them first. |

### 🟢 LOW RISK — Safe

| Change | Why safe |
|--------|----------|
| Dynamic constraint drop | Uses `pg_constraint` lookup — no guessing of auto-generated names |
| `IF NOT EXISTS` / `IF EXISTS` everywhere | Idempotent — can be re-run safely |
| `ON CONFLICT (profile_id) DO NOTHING` | Prevents duplicate customers rows on trigger re-runs |
| LoginPage redirect change | Only affects `role === 'customer'` — all other roles unchanged |

---

## 4. Verification Checklist

### Pre-Deployment (Before running migration)

- [ ] **Backup database** — Export from Supabase Dashboard
- [ ] Verify `organizations` table has at least 1 row
- [ ] Verify existing admin users have `role = 'admin'` (not accidentally `'pos'` from old trigger)
- [ ] Check for duplicate `profile_id` values in `customers`:
  ```sql
  SELECT profile_id, COUNT(*) FROM customers GROUP BY profile_id HAVING COUNT(*) > 1;
  ```
  → Should return 0 rows.

### Deployment (Run in Supabase SQL Editor)

- [ ] Open SQL Editor
- [ ] Copy entire contents of `MIGRATION_CRITICAL_FIXES.sql`
- [ ] Run top to bottom
- [ ] Review verification query results at the bottom
- [ ] Confirm V1–V4 show `PASS`
- [ ] Confirm V5 shows **0 rows**

### Post-Deployment Code Deploy

- [ ] `npm run build` → confirm 0 errors, 1886 modules (already verified ✅)
- [ ] Deploy frontend build to hosting

### End-to-End Verification

#### CR-3: Role Constraint
- [ ] In Supabase SQL Editor, run:
  ```sql
  INSERT INTO profiles (id, full_name, role, email)
  VALUES (gen_random_uuid(), 'Test', 'customer', 'test@example.com');
  ```
  → Should succeed (previously would fail with check constraint violation)
- [ ] Rollback test row:
  ```sql
  DELETE FROM profiles WHERE email = 'test@example.com';
  ```

#### CR-2: Customer Registration Flow
- [ ] Go to `/customer-register`
- [ ] Fill form with a NEW email
- [ ] Submit
- [ ] In Supabase SQL Editor, verify:
  ```sql
  SELECT p.id, p.role, p.email, c.id AS customer_id, c.profile_id
  FROM profiles p
  LEFT JOIN customers c ON c.profile_id = p.id
  WHERE p.email = '<registered-email>';
  ```
  → `role` should be `'customer'`, `customer_id` should NOT be NULL

#### CR-1: Customer Login Redirect
- [ ] Go to `/login`
- [ ] Log in with the customer credentials just created
- [ ] Should redirect to `/customer-app/` (full page navigation)
- [ ] Customer portal should load and show the user's name

#### CR-4: Profile Linkage
- [ ] Run verification query V4 from migration → counts should match
- [ ] Run verification query V5 from migration → should show 0 rows

### Regression Tests (Existing Features)

- [ ] **Admin login** → `/admin` loads correctly
- [ ] **POS login** → `/pos` loads correctly, shift can be opened
- [ ] **Doctor login** → `/doctor` loads correctly
- [ ] **Inventory login** → `/inventory` loads correctly
- [ ] **POS checkout** — add items, complete sale with cash
- [ ] **Create customer from POS** — walk-in customer creation still works
- [ ] **Admin → Users** — can invite new staff user

### Final Sign-Off

- [ ] All CR-1 through CR-4 verifications pass
- [ ] All regression tests pass
- [ ] No console errors in browser

---

## 5. Deployment Order Summary

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Backup production database                         │
├─────────────────────────────────────────────────────────────┤
│  STEP 2: Run MIGRATION_CRITICAL_FIXES.sql                   │
│          in Supabase SQL Editor                             │
├─────────────────────────────────────────────────────────────┤
│  STEP 3: Review verification queries (V1–V5)                │
├─────────────────────────────────────────────────────────────┤
│  STEP 4: Deploy frontend build (already built ✅)           │
├─────────────────────────────────────────────────────────────┤
│  STEP 5: Run end-to-end verification checklist              │
├─────────────────────────────────────────────────────────────┤
│  STEP 6: ONLY AFTER all critical fixes pass:                │
│          Run Phase 2 migrations                             │
│          (MIGRATION_P2_extend_prescriptions.sql             │
│           + MIGRATION_P2_rx_number_trigger.sql)             │
└─────────────────────────────────────────────────────────────┘
```

---

## Appendix: Root Cause Analysis

### Why These 4 Bugs Existed

1. **CR-3 (Role constraint):** The original schema `supabase_schema_fixed.sql` was designed for a 3-role system (admin/pos/inventory). When doctor portal and customer portal were added later, the constraint was updated in `DAY1_MIGRATION_FINAL.sql` but that file was never run in production.

2. **CR-2 (Trigger):** The original trigger hardcoded `role='pos'` because the app only had staff users. When customer self-registration was added, `MIGRATION_backfill_missing_customers.sql` fixed the trigger but was also never deployed.

3. **CR-1 (Redirect loop):** The React router has `/` → `/login`. No one noticed because customer login had never been tested end-to-end — there was no customer role in the database to test with.

4. **CR-4 (Missing column):** `customers.profile_id` was added in `MIGRATION_customer_portal_prerequisites.sql` but its deployment status was unclear. The `registerCustomer()` function assumed it existed.

### The Fix Strategy

Rather than running 3+ separate migrations in uncertain order, `MIGRATION_CRITICAL_FIXES.sql` consolidates everything into one safe, idempotent, self-verifying script.
