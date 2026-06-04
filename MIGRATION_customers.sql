-- ============================================================
-- MIGRATION: Customers Table + Sales FK Update
-- Creates a proper customers table for POS walk-in and registered clients.
-- Updates sales.customer_id to reference customers instead of profiles.
-- SAFE: sales.customer_id is currently all NULL, no data loss.
-- ============================================================

-- 1. CREATE customers TABLE
-- --------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  curp text,
  address text,
  date_of_birth date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists customers_org_id_idx on customers(org_id);
create index if not exists customers_full_name_idx on customers(full_name);
create index if not exists customers_phone_idx on customers(phone);
create index if not exists customers_curp_idx on customers(curp);

-- 2. ENABLE RLS
-- --------------------------------------------------------
alter table customers enable row level security;

-- Staff can manage customers in their org
drop policy if exists "customers_staff_all" on customers;
create policy "customers_staff_all" on customers
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id());

-- 3. UPDATE sales.customer_id FOREIGN KEY
-- Drop the old FK to profiles (if exists) and add FK to customers.
-- This is safe because sales.customer_id is all NULL currently.
-- --------------------------------------------------------

-- PostgreSQL auto-names the FK as sales_customer_id_fkey
alter table sales drop constraint if exists sales_customer_id_fkey;

-- Add the correct FK to customers
alter table sales
  add constraint sales_customer_id_fkey
  foreign key (customer_id) references customers(id)
  on delete set null;

-- 4. VERIFY
-- --------------------------------------------------------
select 'customers table created' as status;
select column_name, data_type
from information_schema.columns
where table_name = 'customers'
order by ordinal_position;
