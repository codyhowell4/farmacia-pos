-- ============================================================
-- MIGRATION: Backfill missing customers rows + fix RLS
--
-- Problem: profiles rows exist with role='customer' but
-- matching customers rows were never created.
--
-- This migration:
-- 1. Backfills missing customers for existing customer profiles
-- 2. Adds unique index on customers(profile_id)
-- 3. Adds RLS policies so customer users can read their own row
-- 4. Updates handle_new_user() trigger to auto-create customers row
-- ============================================================

-- --------------------------------------------------------
-- STEP 1: Backfill missing customers rows
-- --------------------------------------------------------
INSERT INTO customers (profile_id, org_id, full_name, email, phone, curp, address, date_of_birth, notes)
SELECT
  p.id,
  p.org_id,
  p.full_name,
  p.email,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM profiles p
LEFT JOIN customers c ON c.profile_id = p.id
WHERE p.role = 'customer'
  AND c.id IS NULL
  AND p.org_id IS NOT NULL;

-- Report how many were inserted
SELECT 'Backfilled ' || COUNT(*) || ' missing customer rows' AS status
FROM customers
WHERE profile_id IN (
  SELECT id FROM profiles WHERE role = 'customer'
);

-- --------------------------------------------------------
-- STEP 2: Unique index to prevent duplicates
-- --------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS customers_profile_id_unique
ON customers(profile_id)
WHERE profile_id IS NOT NULL;

-- --------------------------------------------------------
-- STEP 3: Fix RLS policies on customers table
-- Customer users need to read their own row.
-- The existing "customers_staff_all" policy blocks them.
-- --------------------------------------------------------

-- Drop old restrictive insert policy if it exists
DROP POLICY IF EXISTS "customers_self_insert" ON customers;
DROP POLICY IF EXISTS "customers_self_select" ON customers;

-- Allow customer users to SELECT their own row
CREATE POLICY "customers_self_select" ON customers
  FOR SELECT USING (profile_id = auth.uid());

-- Allow customer users to INSERT their own row (for getOrCreateCustomer JS helper)
CREATE POLICY "customers_self_insert" ON customers
  FOR INSERT WITH CHECK (profile_id = auth.uid());

-- Allow customer users to UPDATE their own row
CREATE POLICY "customers_self_update" ON customers
  FOR UPDATE USING (profile_id = auth.uid());

-- Keep the staff policy for admin operations
-- (It should already exist from MIGRATION_customers.sql)

-- --------------------------------------------------------
-- STEP 4: Update handle_new_user() trigger
-- Auto-create customers row when a new customer profile is created.
-- This prevents the missing-customer problem for future signups.
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_full_name text;
  v_org_id uuid;
BEGIN
  -- Use role from metadata if provided (admin invites), otherwise default to customer
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'customer');
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email, 'Usuario');

  -- Insert profile row
  INSERT INTO public.profiles (id, full_name, role, email, created_at)
  VALUES (new.id, v_full_name, v_role, new.email, NOW());

  -- If this is a customer, also create the customers row immediately
  IF v_role = 'customer' THEN
    v_org_id := COALESCE(
      (new.raw_user_meta_data->>'org_id')::uuid,
      '718f51b5-dc67-4f70-8aa9-1a315cd1deeb'::uuid
    );

    INSERT INTO public.customers (profile_id, org_id, full_name, email, phone, curp, address, date_of_birth, notes)
    VALUES (new.id, v_org_id, v_full_name, new.email, NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

-- Re-bind the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------
-- STEP 5: Verify
-- --------------------------------------------------------
SELECT
  p.id AS profile_id,
  p.full_name,
  p.role,
  c.id AS customer_id,
  c.org_id
FROM profiles p
LEFT JOIN customers c ON c.profile_id = p.id
WHERE p.role = 'customer'
ORDER BY p.created_at DESC
LIMIT 10;
