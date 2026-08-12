-- ============================================================
-- FARMACIA POS — SUPABASE SIGNUP FORENSIC & FIX
-- Run ALL "DIAGNOSTIC" queries first.
-- Read the output to confirm the root cause.
-- Then run the "FIX" section.
-- ============================================================

-- ============================================================
-- 1. DIAGNOSTIC: ALL columns in profiles (nullable, defaults)
-- ============================================================
SELECT 
  ordinal_position AS pos,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================
-- 2. DIAGNOSTIC: ALL constraints on profiles
-- ============================================================
SELECT
  conname AS constraint_name,
  contype AS type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
ORDER BY contype, conname;

-- ============================================================
-- 3. DIAGNOSTIC: ALL triggers on auth.users and profiles
-- ============================================================
SELECT
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  CASE tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
  CASE 
    WHEN tgtype & 4 = 4 THEN 'INSERT'
    WHEN tgtype & 8 = 8 THEN 'DELETE'
    WHEN tgtype & 16 = 16 THEN 'UPDATE'
    ELSE 'OTHER'
  END AS event,
  tgfoid::regprocedure AS function_called
FROM pg_trigger
WHERE tgrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
  AND NOT tgisinternal
ORDER BY tgrelid::regclass::text, tgname;

-- ============================================================
-- 4. DIAGNOSTIC: Functions used by those triggers
-- ============================================================
SELECT
  p.oid::regprocedure AS function_signature,
  pg_get_functiondef(p.oid) AS function_definition,
  r.rolname AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.oid IN (
  SELECT tgfoid FROM pg_trigger 
  WHERE tgrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
    AND NOT tgisinternal
)
ORDER BY p.proname;

-- ============================================================
-- 5. DIAGNOSTIC: RLS policies on profiles, customers, organizations
-- ============================================================
SELECT
  tablename,
  policyname,
  permissive,
  roles::text,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE tablename IN ('profiles', 'customers', 'organizations')
  AND schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================
-- 6. DIAGNOSTIC: NOT NULL columns that handle_new_user does NOT populate
-- ============================================================
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND table_schema = 'public'
  AND is_nullable = 'NO'
  AND column_name NOT IN ('id', 'full_name', 'role');

-- ============================================================
-- 7. DIAGNOSTIC: Foreign keys on profiles that could reject inserts
-- ============================================================
SELECT
  conname AS fk_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
  AND contype = 'f';

-- ============================================================
-- 8. DIAGNOSTIC: Manual insert test (simulates trigger logic)
--    Run this inside a transaction to surface the EXACT error.
-- ============================================================
DO $$
DECLARE
  test_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.profiles (id, full_name, role, email)
  VALUES (test_id, 'Test Customer', 'customer', 'test+debug@example.com');
  
  RAISE NOTICE 'SUCCESS: Manual insert worked. Profile ID = %', test_id;
  
  -- Clean up the test row immediately
  DELETE FROM public.profiles WHERE id = test_id;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'FAILURE: %', SQLERRM;
END;
$$;

-- ============================================================
-- 9. DIAGNOSTIC: Function ownership vs table ownership vs RLS
--    If function_owner != table_owner (or not a superuser),
--    RLS may be enforced and block the trigger insert.
-- ============================================================
SELECT
  c.relname AS table_name,
  c.relowner::regrole AS table_owner,
  c.relrowsecurity AS rls_enabled,
  p.proname AS function_name,
  p.proowner::regrole AS function_owner,
  r.rolsuper AS function_owner_is_superuser
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_proc p ON p.proname = 'handle_new_user'
LEFT JOIN pg_namespace np ON np.oid = p.pronamespace
LEFT JOIN pg_roles r ON r.oid = p.proowner
WHERE c.relname = 'profiles' AND n.nspname = 'public';

-- ============================================================
-- 10. DIAGNOSTIC: Check for auth users that lack profiles
--     (If any exist, the trigger was skipped or failed post-insert)
-- ============================================================
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC
LIMIT 20;

-- ============================================================
-- ============================================================
-- FIX SECTION — RUN ONLY AFTER YOU HAVE REVIEWED DIAGNOSTICS
-- ============================================================
-- ============================================================

-- STEP A: Ensure the email column exists (safe to re-run)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- STEP B: Expand the role check constraint if it still excludes 'customer'
-- This drops ONLY the constraint whose definition contains the word 'role',
-- then recreates it with the full set including 'customer'.
DO $$
DECLARE
  cname text;
  current_def text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%role%';

  IF cname IS NOT NULL THEN
    current_def := pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = cname));
    IF current_def NOT LIKE '%customer%' THEN
      EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', cname);
      EXECUTE format(
        'ALTER TABLE public.profiles ADD CONSTRAINT %I CHECK (role IN (''admin'', ''pos'', ''inventory'', ''doctor'', ''customer'', ''manager'', ''cashier''))',
        cname
      );
      RAISE NOTICE 'Expanded role constraint % to include customer', cname;
    ELSE
      RAISE NOTICE 'Role constraint % already includes customer — no change', cname;
    END IF;
  ELSE
    RAISE NOTICE 'No role check constraint found — adding one now';
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin', 'pos', 'inventory', 'doctor', 'customer', 'manager', 'cashier'));
  END IF;
END;
$$;

-- STEP C: Ensure the trigger function is owned by a superuser (postgres)
-- so it bypasses RLS on profiles. THIS IS THE MOST COMMON CAUSE OF 500s
-- when a trigger on auth.users inserts into a table with RLS enabled.
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- STEP D: Recreate handle_new_user() with explicit schema references,
-- search_path lock, and safe fallbacks.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_full_name text;
BEGIN
  -- Use role from metadata if provided (admin invites), otherwise default to customer
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'customer');
  
  -- Full name from metadata, fallback to email, final fallback to generic label
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email, 'Usuario');

  INSERT INTO public.profiles (id, full_name, role, email, created_at)
  VALUES (
    new.id,
    v_full_name,
    v_role,
    new.email,
    NOW()
  );

  RETURN new;
END;
$$;

-- STEP E: Recreate the trigger cleanly (binds to the updated function)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- VERIFICATION
-- ============================================================

-- V1: Confirm the function definition matches what we expect
SELECT pg_get_functiondef(
  (SELECT oid FROM pg_proc WHERE proname = 'handle_new_user')
) AS current_function;

-- V2: Confirm trigger is attached
SELECT * FROM pg_trigger 
WHERE tgname = 'on_auth_user_created' 
  AND tgrelid = 'auth.users'::regclass;

-- V3: Quick constraint check
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND contype = 'c';

-- ============================================================
-- END OF SCRIPT
-- After running the FIX, attempt a customer signup.
-- If it still fails, capture the exact error from:
--   Supabase Dashboard → Logs → Auth
-- and share the raw PostgreSQL error message.
-- ============================================================
