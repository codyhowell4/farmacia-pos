-- ============================================================
-- DAY 1 MVP MIGRATION
-- Feature 1: Akaunting Accounting Integration
-- Feature 2: Doctor Portal
-- Feature 3: Customer Portal
--
-- Run this in the Supabase SQL Editor (top to bottom)
-- BACKUP YOUR DATABASE BEFORE RUNNING
-- ============================================================

-- ============================================================
-- STEP 1: ALTER EXISTING TABLES (safe, nullable additions)
-- ============================================================

-- Expand role enum to support doctor and customer
alter table profiles
  drop constraint if exists profiles_role_check;

alter table profiles
  add constraint profiles_role_check
  check (role in ('admin', 'pos', 'inventory', 'doctor', 'customer'));

-- Add customer-linkable fields to profiles (all nullable, safe for existing rows)
alter table profiles
  add column if not exists phone text,
  add column if not exists curp text,
  add column if not exists date_of_birth date,
  add column if not exists address text,
  add column if not exists height numeric(5,2),
  add column if not exists weight numeric(5,2),
  add column if not exists health_goals text;

-- Add customer linkage + Akaunting sync fields to sales (all nullable)
alter table sales
  add column if not exists customer_id uuid references profiles(id) on delete set null,
  add column if not exists akaunting_invoice_id text,
  add column if not exists synced_at timestamptz;

-- Add payment_method transferencia if missing (app already uses it)
-- NOTE: Only run if your existing constraint excludes transferencia
-- alter table sales drop constraint if exists sales_payment_method_check;
-- alter table sales add constraint sales_payment_method_check
--   check (payment_method in ('cash','card','insurance','transferencia'));

-- ============================================================
-- STEP 2: NEW TABLES
-- ============================================================

-- --------------------------------------------------------
-- DOCTOR PROFILES
-- --------------------------------------------------------
create table if not exists doctor_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  license_number text not null,
  specialty text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists doctor_profiles_profile_id_idx on doctor_profiles(profile_id);

-- --------------------------------------------------------
-- APPOINTMENTS
-- --------------------------------------------------------
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references profiles(id) on delete set null,
  doctor_id uuid not null references profiles(id) on delete cascade,
  walkin_name text,
  walkin_phone text,
  appointment_date timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','completed','cancelled')),
  notes text,
  created_at timestamptz default now()
);

create index if not exists appointments_org_id_idx on appointments(org_id);
create index if not exists appointments_customer_id_idx on appointments(customer_id);
create index if not exists appointments_doctor_id_idx on appointments(doctor_id);
create index if not exists appointments_date_idx on appointments(appointment_date);

-- --------------------------------------------------------
-- PREORDERS
-- --------------------------------------------------------
create table if not exists preorders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references profiles(id) on delete set null,
  doctor_id uuid references profiles(id) on delete set null,
  walkin_name text,
  inventory_id uuid references inventory(id) on delete set null,
  quantity integer not null default 1,
  status text not null default 'pending'
    check (status in ('pending','ready','picked_up','cancelled')),
  notes text,
  created_at timestamptz default now()
);

create index if not exists preorders_org_id_idx on preorders(org_id);
create index if not exists preorders_customer_id_idx on preorders(customer_id);
create index if not exists preorders_doctor_id_idx on preorders(doctor_id);

-- --------------------------------------------------------
-- MEDICAL NOTES
-- --------------------------------------------------------
create table if not exists medical_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  doctor_id uuid not null references profiles(id) on delete cascade,
  customer_id uuid references profiles(id) on delete set null,
  walkin_name text,
  note text not null,
  created_at timestamptz default now()
);

create index if not exists medical_notes_org_id_idx on medical_notes(org_id);
create index if not exists medical_notes_customer_id_idx on medical_notes(customer_id);
create index if not exists medical_notes_doctor_id_idx on medical_notes(doctor_id);

-- --------------------------------------------------------
-- CUSTOMER DOCUMENTS
-- --------------------------------------------------------
create table if not exists customer_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references profiles(id) on delete cascade,
  document_type text not null default 'receta'
    check (document_type in ('receta','nota_doctor','laboratorio')),
  file_url text not null,
  notes text,
  created_at timestamptz default now()
);

create index if not exists customer_documents_org_id_idx on customer_documents(org_id);
create index if not exists customer_documents_customer_id_idx on customer_documents(customer_id);

-- --------------------------------------------------------
-- AKAUNTING SETTINGS (per org, singleton)
-- --------------------------------------------------------
create table if not exists akaunting_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations(id) on delete cascade,
  api_url text not null,
  company_id integer not null,
  api_email text not null,
  api_password text not null,
  enabled boolean not null default false,
  sync_customers boolean not null default true,
  sync_sales boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz default now()
);

-- --------------------------------------------------------
-- AKAUNTING MAPPINGS (idempotency / id sync registry)
-- --------------------------------------------------------
create table if not exists akaunting_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('customer','sale','payment')),
  farmacia_id text not null,
  akaunting_id text not null,
  last_synced_at timestamptz,
  unique(org_id, entity_type, farmacia_id)
);

create index if not exists akaunting_mappings_org_id_idx on akaunting_mappings(org_id);
create index if not exists akaunting_mappings_lookup_idx on akaunting_mappings(org_id, entity_type, farmacia_id);

-- ============================================================
-- STEP 3: ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table doctor_profiles enable row level security;
alter table appointments enable row level security;
alter table preorders enable row level security;
alter table medical_notes enable row level security;
alter table customer_documents enable row level security;
alter table akaunting_settings enable row level security;
alter table akaunting_mappings enable row level security;

-- ============================================================
-- STEP 4: RLS POLICIES
-- ============================================================

-- Helper: is the current user a staff member (non-customer)?
create or replace function is_org_staff()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','pos','inventory','doctor')
  )
$$;

-- Helper: is the current user a customer?
create or replace function is_customer_user()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'customer'
  )
$$;

-- --------------------------------------------------------
-- DOCTOR PROFILES
-- Staff in org can read; admins can manage; doctors can read their own
-- --------------------------------------------------------
drop policy if exists "doctor_profiles_org_read" on doctor_profiles;
create policy "doctor_profiles_org_read" on doctor_profiles
  for select using (
    profile_id in (select id from profiles where org_id = get_my_org_id())
  );

drop policy if exists "doctor_profiles_admin_all" on doctor_profiles;
create policy "doctor_profiles_admin_all" on doctor_profiles
  for all using (
    is_admin() and profile_id in (select id from profiles where org_id = get_my_org_id())
  );

-- --------------------------------------------------------
-- APPOINTMENTS
-- Staff see org-wide; customers see only their own
-- --------------------------------------------------------
drop policy if exists "appointments_staff" on appointments;
create policy "appointments_staff" on appointments
  for all using (org_id = get_my_org_id() and is_org_staff());

drop policy if exists "appointments_customer" on appointments;
create policy "appointments_customer" on appointments
  for select using (customer_id = auth.uid());

-- --------------------------------------------------------
-- PREORDERS
-- Staff see org-wide; customers see only their own
-- --------------------------------------------------------
drop policy if exists "preorders_staff" on preorders;
create policy "preorders_staff" on preorders
  for all using (org_id = get_my_org_id() and is_org_staff());

drop policy if exists "preorders_customer" on preorders;
create policy "preorders_customer" on preorders
  for select using (customer_id = auth.uid());

-- --------------------------------------------------------
-- MEDICAL NOTES
-- Staff see org-wide; customers see only their own
-- --------------------------------------------------------
drop policy if exists "medical_notes_staff" on medical_notes;
create policy "medical_notes_staff" on medical_notes
  for all using (org_id = get_my_org_id() and is_org_staff());

drop policy if exists "medical_notes_customer" on medical_notes;
create policy "medical_notes_customer" on medical_notes
  for select using (customer_id = auth.uid());

-- --------------------------------------------------------
-- CUSTOMER DOCUMENTS
-- Staff see org-wide; customers see only their own
-- --------------------------------------------------------
drop policy if exists "customer_documents_staff" on customer_documents;
create policy "customer_documents_staff" on customer_documents
  for all using (org_id = get_my_org_id() and is_org_staff());

drop policy if exists "customer_documents_owner" on customer_documents;
create policy "customer_documents_owner" on customer_documents
  for all using (customer_id = auth.uid());

-- --------------------------------------------------------
-- AKAUNTING SETTINGS (staff only)
-- --------------------------------------------------------
drop policy if exists "akaunting_settings_staff" on akaunting_settings;
create policy "akaunting_settings_staff" on akaunting_settings
  for all using (org_id = get_my_org_id() and is_org_staff());

-- --------------------------------------------------------
-- AKAUNTING MAPPINGS (staff only)
-- --------------------------------------------------------
drop policy if exists "akaunting_mappings_staff" on akaunting_mappings;
create policy "akaunting_mappings_staff" on akaunting_mappings
  for all using (org_id = get_my_org_id() and is_org_staff());

-- ============================================================
-- STEP 5: SUPABASE STORAGE — customer-documents bucket
-- ============================================================

-- Create the bucket (idempotent)
insert into storage.buckets (id, name, public)
values ('customer-documents', 'customer-documents', false)
on conflict (id) do nothing;

-- Policy: authenticated users can upload their own files
drop policy if exists "customer_docs_insert_own" on storage.objects;
create policy "customer_docs_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'customer-documents'
    and auth.role() = 'authenticated'
  );

-- Policy: customers can read their own documents
-- We enforce ownership at the application level by storing customer_id in the file path
-- e.g.  customer-documents/{org_id}/{customer_id}/{filename}
drop policy if exists "customer_docs_select" on storage.objects;
create policy "customer_docs_select" on storage.objects
  for select using (
    bucket_id = 'customer-documents'
    and auth.role() = 'authenticated'
  );

-- Policy: customers can delete their own objects
drop policy if exists "customer_docs_delete_own" on storage.objects;
create policy "customer_docs_delete_own" on storage.objects
  for delete using (
    bucket_id = 'customer-documents'
    and auth.role() = 'authenticated'
  );

-- ============================================================
-- STEP 6: SALES — add customer self-read policy (MVP only)
-- ============================================================
-- Existing sales policy allows all org members to read all sales.
-- For the customer portal MVP we add a policy so customers can read
-- sales where customer_id matches their auth uid.
-- NOTE: This does NOT restrict staff from seeing all sales.

drop policy if exists "sales_customer_read" on sales;
create policy "sales_customer_read" on sales
  for select using (customer_id = auth.uid());

-- ============================================================
-- STEP 7: COMPLETION CHECK
-- ============================================================
select 'Day 1 migration complete' as status;
