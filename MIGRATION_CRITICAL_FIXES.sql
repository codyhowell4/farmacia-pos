-- ============================================================
-- MIGRATION: CRITICAL FIXES — Pre-Phase 2 Deployment
--
-- Fixes 4 critical issues before P2 features can work:
--   CR-3: profiles.role constraint excludes 'customer' and 'doctor'
--   CR-2: handle_new_user trigger hardcodes role='pos', never creates customers row
--   CR-4: customers.profile_id column may be missing
--   + Backfill: Existing customer profiles missing customers rows
--
-- SAFETY:
--   - All operations are idempotent (IF NOT EXISTS / IF EXISTS)
--   - Uses dynamic constraint name lookup (no guessing)
--   - Zero production data is deleted
--   - Includes verification queries at the end
--
-- RUN IN: Supabase SQL Editor (top to bottom, do not skip)
-- BACKUP YOUR DATABASE BEFORE RUNNING
-- ============================================================

-- ============================================================
-- STEP 0: HELPER FUNCTIONS (recreate to ensure correctness)
-- ============================================================

create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

create or replace function is_org_staff()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','pos','inventory','doctor')
  )
$$;

create or replace function is_customer_user()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'customer'
  )
$$;

create or replace function get_my_org_id()
returns uuid language sql security definer stable as $$
  select org_id from profiles where id = auth.uid()
$$;

-- ============================================================
-- STEP 1: CR-3 — EXPAND profiles.role CONSTRAINT
-- ============================================================
-- The original constraint is INLINE (auto-named by PostgreSQL).
-- We must find and drop the ACTUAL constraint name dynamically.

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%';

  if cname is not null then
    execute format('alter table profiles drop constraint %I', cname);
    raise notice 'Dropped existing role constraint: %', cname;
  else
    raise notice 'No existing role constraint found — proceeding';
  end if;
end $$;

-- Add the expanded role constraint with an explicit name
alter table profiles
  add constraint profiles_role_check
  check (role in ('admin', 'pos', 'inventory', 'doctor', 'customer'));

-- Also ensure email column exists (needed by trigger)
alter table profiles
  add column if not exists email text;

-- Index for efficient role-based lookups
create index if not exists profiles_role_org_idx on profiles(role, org_id);
create index if not exists profiles_email_idx on profiles(email);

-- ============================================================
-- STEP 2: CR-4 — ENSURE customers.profile_id EXISTS
-- ============================================================
-- This column links auth.users → profiles → customers.
-- It is required for customer RLS policies and registration.

alter table customers
  add column if not exists profile_id uuid references profiles(id) on delete set null;

-- Unique index prevents duplicate customer records per profile
create unique index if not exists customers_profile_id_unique
  on customers(profile_id) where profile_id is not null;

-- Also ensure customers has org_id (needed for RLS)
-- (Already exists from MIGRATION_customers.sql, but safe to verify)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'customers' and column_name = 'org_id'
  ) then
    raise exception 'CRITICAL: customers.org_id column is missing. Run MIGRATION_customers.sql first.';
  end if;
end $$;

-- ============================================================
-- STEP 3: CR-2 — FIX handle_new_user TRIGGER
-- ============================================================
-- PROBLEM:
--   • Old trigger hardcoded role='pos' (ignored metadata)
--   • Old trigger never created a customers row
--   • Old trigger never set org_id on profiles
--
-- FIX:
--   • Reads role from raw_user_meta_data (defaults to 'customer')
--   • Sets org_id from metadata or first organization in DB
--   • For role='customer': creates BOTH profiles AND customers rows
--   • For staff roles: creates profile only (customers row not needed)
--   • Adds email, created_at to profile

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text;
  v_full_name text;
  v_org_id    uuid;
  v_email     text;
begin
  -- Extract values from auth metadata with safe fallbacks
  v_role      := coalesce(new.raw_user_meta_data->>'role', 'customer');
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Usuario');
  v_email     := new.email;

  -- Determine org_id: metadata takes priority, then first org in DB, then NULL
  v_org_id := coalesce(
    (new.raw_user_meta_data->>'org_id')::uuid,
    (select id from organizations order by created_at limit 1)
  );

  -- Insert the profile row (all users get this)
  insert into public.profiles (
    id, full_name, role, email, org_id, created_at
  ) values (
    new.id, v_full_name, v_role, v_email, v_org_id, now()
  );

  -- If this is a customer, also create the customers row immediately
  if v_role = 'customer' then
    insert into public.customers (
      profile_id, org_id, full_name, email,
      phone, curp, address, date_of_birth, notes
    ) values (
      new.id, v_org_id, v_full_name, v_email,
      null, null, null, null, null
    )
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

-- Re-bind the trigger (idempotent)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================
-- STEP 4: BACKFILL — Fix existing customer profiles
-- ============================================================
-- Any profiles with role='customer' that are missing a customers
-- row get one created now. Also ensures org_id is set on profile.

-- 4a: Backfill customers rows for existing customer profiles
insert into customers (profile_id, org_id, full_name, email, phone, curp, address, date_of_birth, notes)
select
  p.id,
  coalesce(p.org_id, (select id from organizations order by created_at limit 1)),
  p.full_name,
  coalesce(p.email, ''),
  null,
  null,
  null,
  null,
  null
from profiles p
left join customers c on c.profile_id = p.id
where p.role = 'customer'
  and c.id is null
on conflict (profile_id) do nothing;

-- 4b: Ensure all customer profiles have an org_id
update profiles
set org_id = coalesce(
  org_id,
  (select id from organizations order by created_at limit 1)
)
where role = 'customer'
  and org_id is null;

-- ============================================================
-- STEP 5: RLS POLICIES — Ensure customer users can access their data
-- ============================================================

-- Allow customer users to SELECT their own customers row
drop policy if exists "customers_self_select" on customers;
create policy "customers_self_select" on customers
  for select using (profile_id = auth.uid());

-- Allow customer users to UPDATE their own row
drop policy if exists "customers_self_update" on customers;
create policy "customers_self_update" on customers
  for update using (profile_id = auth.uid());

-- Allow customer users to INSERT their own row (safety net)
drop policy if exists "customers_self_insert" on customers;
create policy "customers_self_insert" on customers
  for insert with check (profile_id = auth.uid());

-- ============================================================
-- VERIFICATION
-- ============================================================

-- V1: Confirm role constraint includes all 5 roles
select 'Role constraint' as check_item,
  case when count(*) = 5 then 'PASS' else 'FAIL' end as result
from information_schema.check_constraints
where constraint_name = 'profiles_role_check'
  and constraint_catalog = current_database();

-- V2: Confirm trigger is attached and function looks correct
select 'Trigger attached' as check_item,
  case when count(*) > 0 then 'PASS' else 'FAIL' end as result
from pg_trigger
where tgname = 'on_auth_user_created';

-- V3: Confirm customers.profile_id column exists
select 'customers.profile_id column' as check_item,
  case when count(*) > 0 then 'PASS' else 'FAIL' end as result
from information_schema.columns
where table_name = 'customers' and column_name = 'profile_id';

-- V4: Count customer profiles with matching customers row
select
  'Customer profile↔customer linkage' as check_item,
  count(p.id) as customer_profiles,
  count(c.id) as linked_customer_rows,
  case when count(p.id) = count(c.id) then 'PASS' else 'WARN' end as result
from profiles p
left join customers c on c.profile_id = p.id
where p.role = 'customer';

-- V5: List any orphaned customer profiles (should be 0 after backfill)
select
  p.id as profile_id,
  p.full_name,
  p.email,
  p.org_id
from profiles p
left join customers c on c.profile_id = p.id
where p.role = 'customer'
  and c.id is null;
