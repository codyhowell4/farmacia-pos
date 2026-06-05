-- ============================================================
-- MIGRATION: Add email column + backfill + clean placeholders
--
-- Step 1: Add email column to profiles (safe to run multiple times)
-- Step 2: Backfill all profiles from auth.users
-- Step 3: Clean placeholder emails set by previous manual backfill
-- ============================================================

-- 1. Add email column if it does not exist yet
alter table profiles
  add column if not exists email text;

-- 2. Index for email lookups
create index if not exists profiles_email_idx on profiles(email);

-- 3. Backfill all existing profiles that have a matching auth.users email
--    (requires access to auth.users — run as supabase_admin or use service_role)
update profiles
set email = auth.users.email
from auth.users
where profiles.id = auth.users.id
  and (profiles.email is null or profiles.email = '');

-- 4. Clean placeholder emails from any manual backfill attempts
update profiles
set email = null
where email ilike '%PUT_DOCTOR_LOGIN_EMAIL%'
   or email ilike '%PLACEHOLDER%'
   or email ilike '%EXAMPLE.COM%';

-- 5. Verify doctors specifically
select id, full_name, email, role
from profiles
where role = 'doctor'
order by full_name;
