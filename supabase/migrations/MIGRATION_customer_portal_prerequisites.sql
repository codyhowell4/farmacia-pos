-- ============================================================
-- MIGRATION: Customer Portal Prerequisites
-- Run this in Supabase SQL Editor (top to bottom)
--
-- Safe: all operations are idempotent (IF NOT EXISTS / IF EXISTS)
-- No production data is modified or deleted.
-- ============================================================

-- ============================================================
-- STEP 0: HELPER FUNCTIONS (recreate safely)
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

-- ============================================================
-- STEP 1: profiles.email (ensure exists before trigger references it)
-- ============================================================

alter table profiles
  add column if not exists email text;

create index if not exists profiles_email_idx on profiles(email);

-- ============================================================
-- STEP 2: customers.profile_id
-- Links auth.users (via profiles) to the customers table.
-- This is the bridge that makes all customer RLS policies work.
-- ============================================================

alter table customers
  add column if not exists profile_id uuid references profiles(id) on delete set null;

create unique index if not exists customers_profile_id_idx on customers(profile_id);

-- ============================================================
-- STEP 3: sales.status
-- Order lifecycle tracking for the customer portal.
-- Existing rows default to 'processing'.
-- ============================================================

alter table sales
  add column if not exists status text default 'processing'
  check (status in ('processing', 'shipped', 'delivered', 'cancelled'));

-- ============================================================
-- STEP 4: appointments type/video fields
-- Distinguishes in-person from video consultations.
-- ============================================================

alter table appointments
  add column if not exists type text default 'in_person'
    check (type in ('in_person', 'video')),
  add column if not exists meeting_url text,
  add column if not exists meeting_id text;

-- ============================================================
-- STEP 5: inventory customer app fields
-- Product categorization and images for the shop grid.
-- ============================================================

alter table inventory
  add column if not exists category text default 'otc'
    check (category in ('otc', 'prescription', 'vitamins')),
  add column if not exists image_url text;

-- ============================================================
-- STEP 6: Fix handle_new_user trigger
-- New Supabase Auth signups default to role='customer'.
-- If raw_user_meta_data->>'role' is set (e.g. by admin invite),
-- that role is used instead.
-- Also saves email into profiles.email.
-- ============================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_role text;
begin
  -- Use role from metadata if provided, otherwise default to customer
  v_role := coalesce(new.raw_user_meta_data->>'role', 'customer');

  insert into profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    new.email
  );
  return new;
end;
$$;

-- Trigger already exists from base schema; recreate to bind updated function.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- STEP 7: Fix customer RLS policies
-- All customer-facing tables use customer_id referencing customers.id,
-- NOT profiles.id. Policies must subquery via customers.profile_id.
--
-- Pattern:
--   customer_id in (select id from customers where profile_id = auth.uid())
--
-- This ensures a logged-in customer can only see/modify rows
-- belonging to their own customers record.
-- ============================================================

-- --------------------------------------------------------
-- SALES
-- --------------------------------------------------------

-- Drop old broken policies that compared customer_id = auth.uid() directly.
drop policy if exists "sales_customer_read" on sales;
drop policy if exists "sales_customer_update" on sales;

create policy "sales_customer_read" on sales
  for select using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

create policy "sales_customer_update" on sales
  for update using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

-- --------------------------------------------------------
-- APPOINTMENTS
-- --------------------------------------------------------

drop policy if exists "appointments_customer" on appointments;
drop policy if exists "appointments_customer_insert" on appointments;
drop policy if exists "appointments_customer_update" on appointments;

create policy "appointments_customer" on appointments
  for select using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

create policy "appointments_customer_insert" on appointments
  for insert with check (
    customer_id in (select id from customers where profile_id = auth.uid())
    and org_id = get_my_org_id()
  );

create policy "appointments_customer_update" on appointments
  for update using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

-- --------------------------------------------------------
-- PREORDERS
-- --------------------------------------------------------

drop policy if exists "preorders_customer" on preorders;
drop policy if exists "preorders_customer_insert" on preorders;
drop policy if exists "preorders_customer_update" on preorders;

create policy "preorders_customer" on preorders
  for select using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

create policy "preorders_customer_insert" on preorders
  for insert with check (
    customer_id in (select id from customers where profile_id = auth.uid())
    and org_id = get_my_org_id()
  );

create policy "preorders_customer_update" on preorders
  for update using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

-- --------------------------------------------------------
-- MEDICAL NOTES (read-only for customers)
-- --------------------------------------------------------

drop policy if exists "medical_notes_customer" on medical_notes;

create policy "medical_notes_customer" on medical_notes
  for select using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

-- --------------------------------------------------------
-- CUSTOMER DOCUMENTS (full CRUD for owners)
-- --------------------------------------------------------

drop policy if exists "customer_documents_owner" on customer_documents;

create policy "customer_documents_owner" on customer_documents
  for all using (
    customer_id in (select id from customers where profile_id = auth.uid())
  )
  with check (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

-- ============================================================
-- STEP 8: COMPLETION
-- ============================================================
select 'Customer portal prerequisites migration complete' as status;
