-- ============================================================
-- MIGRATION: Customer Portal Auth
--
-- Prepares auth + RLS for the customer portal:
--   1. Re-assert handle_new_user() to the profile+customers version
--      from MIGRATION_CRITICAL_FIXES.sql (overrides the profile-only
--      version in MIGRATION_customer_portal_prerequisites.sql)
--   2. lookup_login_email(identifier, org_id): resolves an email,
--      phone number, or membership number to the account's login email
--   3. CRITICAL SECURITY FIX: prescriptions had an org-wide SELECT
--      policy — any logged-in customer could read ALL org prescriptions.
--      Replaced with staff-only read + customer self-read.
--   4. Customer self-read policies on memberships / membership_members
--      so the portal can check membership status.
--
-- SAFETY:
--   - All operations are idempotent (create or replace / drop ... if exists)
--   - Zero production data is deleted
--   - Doctor insert/update policies on prescriptions are NOT touched
--   - Org-agnostic: org id is passed as a parameter where needed
--
-- RUN IN: Supabase SQL Editor (top to bottom, do not skip)
-- BACKUP YOUR DATABASE BEFORE RUNNING
-- ============================================================

-- ============================================================
-- STEP 1: RE-ASSERT handle_new_user() (profile + customers version)
-- ============================================================
-- MIGRATION_customer_portal_prerequisites.sql installed a profile-only
-- version. This restores the MIGRATION_CRITICAL_FIXES.sql version:
--   • Reads role from raw_user_meta_data (defaults to 'customer')
--   • Sets org_id from metadata or first organization in DB
--   • For role='customer': creates BOTH profiles AND customers rows
--   • For staff roles: creates profile only (customers row not needed)

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
-- STEP 2: lookup_login_email(identifier, org_id)
-- ============================================================
-- Resolves a login identifier to the account's email so the portal
-- can sign in with email, phone, or membership number.
--   • Email ('@' present): confirmed only if a profiles row with that
--     email AND a customers row linking that profile in p_org_id exist
--   • Phone (mostly digits): both sides normalized to digits-only;
--     last-10-digits match allowed to absorb country codes
--   • Otherwise: membership number — memberships.plan_id (ilike) or
--     membership_members.sub_id (ilike) via its parent membership
-- Returns null when nothing matches. Callable by anon (pre-login).

create or replace function public.lookup_login_email(p_identifier text, p_org_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_identifier text;
  v_digits     text;
  v_email      text;
begin
  v_identifier := trim(coalesce(p_identifier, ''));

  if v_identifier = '' then
    return null;
  end if;

  -- 1. Email address: only confirm accounts that actually exist in this org
  if position('@' in v_identifier) > 0 then
    select lower(p.email) into v_email
    from profiles p
    join customers c on c.profile_id = p.id
    where lower(p.email) = lower(v_identifier)
      and c.org_id = p_org_id
    limit 1;
    return v_email;
  end if;

  -- 2. Phone number: phone-ish characters only, at least 7 digits
  --    (membership numbers contain letters, so they fall through to step 3)
  v_digits := regexp_replace(v_identifier, '\D', '', 'g');
  if v_identifier ~ '^[+0-9().\-\s]+$' and length(v_digits) >= 7 then
    select p.email into v_email
    from customers c
    join profiles p on p.id = c.profile_id
    where c.org_id = p_org_id
      and c.profile_id is not null
      and c.phone is not null
      and (
        regexp_replace(c.phone, '\D', '', 'g') = v_digits
        or right(regexp_replace(c.phone, '\D', '', 'g'), 10) = right(v_digits, 10)
      )
    limit 1;
    return v_email;
  end if;

  -- 3. Membership number: plan_id (APOLO-00001) or member sub_id (APOLO-00001-2)
  v_identifier := upper(v_identifier);
  select p.email into v_email
  from memberships m
  join customers c on c.id = m.customer_id and c.profile_id is not null
  join profiles p on p.id = c.profile_id
  left join membership_members mm on mm.membership_id = m.id
  where m.org_id = p_org_id
    and (m.plan_id ilike v_identifier or mm.sub_id ilike v_identifier)
  limit 1;
  return v_email;
end;
$$;

revoke all on function public.lookup_login_email(text, uuid) from public;
grant execute on function public.lookup_login_email(text, uuid) to anon, authenticated;

-- ============================================================
-- STEP 3: RLS FIX — prescriptions (CRITICAL SECURITY FIX)
-- ============================================================
-- PROBLEM: org_prescriptions_read and doctor_prescriptions_read_own
-- both allowed SELECT on ANY prescription in the org to ANY logged-in
-- user — including customers (org_id = get_my_org_id() only checks the
-- caller's profile org, not their role).
--
-- FIX:
--   • Drop both org-wide SELECT policies
--   • Staff-only read via is_org_staff() (admin/pos/inventory/doctor)
--   • Customers can read only their OWN prescriptions
--   • Insert/update policies (doctor_prescriptions_insert,
--     doctor_prescriptions_update_own, org_prescriptions_void) untouched

alter table prescriptions enable row level security;

-- Drop the org-wide SELECT policies (by exact name)
drop policy if exists org_prescriptions_read on prescriptions;
drop policy if exists doctor_prescriptions_read_own on prescriptions;

-- Staff can read all prescriptions in their org
drop policy if exists prescriptions_staff_select on prescriptions;
create policy prescriptions_staff_select on prescriptions
  for select using (org_id = get_my_org_id() and is_org_staff());

-- Customers can read only their own prescriptions
drop policy if exists prescriptions_customer_select on prescriptions;
create policy prescriptions_customer_select on prescriptions
  for select using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

-- ============================================================
-- STEP 4: CUSTOMER SELF-READ — memberships / membership_members
-- ============================================================
-- Lets the portal check the logged-in customer's membership status.
-- Complements the org_isolation staff policies from
-- MIGRATION_membership_system.sql (policies are permissive/OR'ed).

alter table memberships enable row level security;
alter table membership_members enable row level security;

drop policy if exists memberships_customer_select on memberships;
create policy memberships_customer_select on memberships
  for select using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

drop policy if exists membership_members_customer_select on membership_members;
create policy membership_members_customer_select on membership_members
  for select using (
    membership_id in (
      select id from memberships
      where customer_id in (select id from customers where profile_id = auth.uid())
    )
  );

-- ============================================================
-- VERIFICATION (commented out — run manually after applying)
-- ============================================================

-- V1: handle_new_user is the profile+customers version (body mentions customers)
-- select proname, pg_get_functiondef(oid) like '%insert into public.customers%' as creates_customers_row
-- from pg_proc where proname = 'handle_new_user';

-- V2: prescriptions SELECT policies — staff + customer only, no org-wide read
-- select policyname, cmd, qual from pg_policies where tablename = 'prescriptions';

-- V3: membership customer self-read policies exist
-- select policyname, cmd from pg_policies where tablename in ('memberships', 'membership_members');

-- V4: lookup_login_email resolves each identifier type (use your org id)
-- select public.lookup_login_email('customer@example.com', '718f51b5-dc67-4f70-8aa9-1a315cd1deeb');
-- select public.lookup_login_email('+52 55 1234 5678',        '718f51b5-dc67-4f70-8aa9-1a315cd1deeb');
-- select public.lookup_login_email('APOLO-00001',             '718f51b5-dc67-4f70-8aa9-1a315cd1deeb');
-- select public.lookup_login_email('APOLO-00001-2',           '718f51b5-dc67-4f70-8aa9-1a315cd1deeb');
-- (all should return the account email or null — never an error)
