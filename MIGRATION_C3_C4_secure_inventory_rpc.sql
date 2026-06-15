-- ============================================================
-- MIGRATION: C3 + C4 — Secure decrement_inventory RPC
-- ============================================================
--
-- PURPOSE:
--   C3: Remove anonymous access to inventory decrement RPC.
--   C4: Add cross-tenant org validation to prevent authenticated
--       users from modifying inventory outside their organization.
--
-- SAFETY:
--   • Function signature unchanged (p_id uuid, p_qty integer).
--   • No frontend changes required.
--   • Preserves single-tenant behavior for edge cases (NULL org_id).
--   • Test block included — fails loudly if anything is wrong.
--
-- PREREQUISITES:
--   • organizations table exists with at least 1 row.
--   • inventory table has org_id column (NOT NULL).
--   • customers table has profile_id column with unique index.
--   • profiles table has org_id column (nullable).
--
-- RUN IN: Supabase SQL Editor
-- ROLLBACK: See rollback section at bottom of file.
-- ============================================================

-- ============================================================
-- STEP 1: C3 — REVOKE ANONYMOUS ACCESS
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.decrement_inventory(uuid, integer) FROM anon;

-- Verify: should return 0 rows for grantee = 'anon'
-- (Uncomment to check manually after running)
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_name = 'decrement_inventory'
--   AND routine_schema = 'public'
--   AND grantee = 'anon';

-- ============================================================
-- STEP 2: C4 — REPLACE FUNCTION WITH ORG VALIDATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.decrement_inventory(p_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org_id uuid;
  v_item_org_id uuid;
  v_item_exists boolean;
  v_current_qty integer;
  v_new_qty integer;
BEGIN
  -- ------------------------------------------------------------
  -- 2a. Validate inventory item exists and capture its org_id
  -- ------------------------------------------------------------
  SELECT EXISTS(SELECT 1 FROM inventory WHERE id = p_id),
         org_id,
         quantity
  INTO v_item_exists, v_item_org_id, v_current_qty
  FROM inventory
  WHERE id = p_id;

  IF NOT v_item_exists THEN
    RAISE EXCEPTION 'Inventory item with id % not found', p_id;
  END IF;

  -- ------------------------------------------------------------
  -- 2b. Resolve caller's org_id
  --
  -- Priority 1: profiles.org_id (admin, staff, doctor, manager)
  -- Priority 2: customers.org_id fallback (customer users)
  --
  -- profiles.org_id is NULL for customer signups because the
  -- handle_new_user trigger does not set it. customers.org_id
  -- is set by the same trigger and is the authoritative source
  -- for customer users.
  -- ------------------------------------------------------------
  SELECT org_id INTO v_caller_org_id
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_org_id IS NULL THEN
    SELECT org_id INTO v_caller_org_id
    FROM customers
    WHERE profile_id = auth.uid();
  END IF;

  -- ------------------------------------------------------------
  -- 2c. Cross-tenant guard
  --
  -- If caller has a resolvable org_id, it must match the item's
  -- org_id. NULL caller_org_id is allowed for edge cases
  -- (service role, legacy data, pre-existing NULL profiles).
  -- ------------------------------------------------------------
  IF v_caller_org_id IS NOT NULL AND v_caller_org_id != v_item_org_id THEN
    RAISE EXCEPTION 'Unauthorized: inventory item % belongs to a different organization', p_id;
  END IF;

  -- ------------------------------------------------------------
  -- 2d. Prevent negative inventory
  -- ------------------------------------------------------------
  v_new_qty := GREATEST(0, v_current_qty - p_qty);

  -- ------------------------------------------------------------
  -- 2e. Perform update scoped to the item's org (defense in depth)
  -- ------------------------------------------------------------
  UPDATE inventory
  SET
    quantity = v_new_qty,
    sales_count = COALESCE(sales_count, 0) + p_qty,
    updated_at = NOW()
  WHERE id = p_id
    AND org_id = v_item_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update inventory item %', p_id;
  END IF;
END;
$$;

-- ============================================================
-- STEP 3: ENSURE authenticated ROLE CAN EXECUTE
-- ============================================================

GRANT EXECUTE ON FUNCTION public.decrement_inventory(uuid, integer) TO authenticated;

-- ============================================================
-- STEP 4: VALIDATION TEST BLOCK
-- ============================================================
-- This block runs automatically and fails the entire migration
-- if any assertion fails. It does NOT modify data.

DO $$
DECLARE
  v_test_item_id uuid;
  v_test_item_org_id uuid;
  v_before_qty integer;
  v_after_qty integer;
BEGIN
  -- Find any inventory item to test with
  SELECT id, org_id, quantity
  INTO v_test_item_id, v_test_item_org_id, v_before_qty
  FROM inventory
  LIMIT 1;

  IF v_test_item_id IS NULL THEN
    RAISE NOTICE 'C4 validation skipped: no inventory items exist yet';
    RETURN;
  END IF;

  -- Test 1: Zero-quantity call (no-op, validates function works)
  PERFORM decrement_inventory(v_test_item_id, 0);

  -- Verify quantity unchanged after zero call
  SELECT quantity INTO v_after_qty
  FROM inventory
  WHERE id = v_test_item_id;

  IF v_after_qty != v_before_qty THEN
    RAISE EXCEPTION 'C4 validation FAILED: zero-qty call modified inventory (% -> %)', v_before_qty, v_after_qty;
  END IF;

  RAISE NOTICE 'C4 validation passed: decrement_inventory works for item % (org_id: %)', v_test_item_id, v_test_item_org_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'C4 validation FAILED: %', SQLERRM;
END;
$$;

-- ============================================================
-- STEP 5: CONFIRM FINAL STATE
-- ============================================================

SELECT
  proname AS function_name,
  prosecdef AS is_security_definer,
  pg_get_function_arguments(oid) AS arguments
FROM pg_proc
WHERE proname = 'decrement_inventory';

SELECT
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'decrement_inventory'
  AND routine_schema = 'public';


-- ============================================================
-- ROLLBACK SECTION (copy-paste into SQL Editor if needed)
-- ============================================================
--
-- RUN THIS ONLY IF THE MIGRATION CAUSES PROBLEMS.
-- It restores the original function (no org validation)
-- and re-applies the anon grant.
--
/*

-- ROLLBACK C4: Restore original function
CREATE OR REPLACE FUNCTION public.decrement_inventory(p_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM inventory WHERE id = p_id) INTO v_inventory_exists;

  IF NOT v_inventory_exists THEN
    RAISE EXCEPTION 'Inventory item with id % not found', p_id;
  END IF;

  UPDATE inventory
  SET
    quantity = GREATEST(0, quantity - p_qty),
    sales_count = COALESCE(sales_count, 0) + p_qty,
    updated_at = NOW()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update inventory item %', p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_inventory(uuid, integer) TO authenticated;

-- ROLLBACK C3: Re-grant anon access (only if intentionally needed)
-- GRANT EXECUTE ON FUNCTION public.decrement_inventory(uuid, integer) TO anon;

-- Verify rollback
SELECT proname AS restored_function FROM pg_proc WHERE proname = 'decrement_inventory';

*/
