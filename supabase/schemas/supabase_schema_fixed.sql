-- ============================================================
-- Farmacia POS — Supabase Schema (FIXED VERSION)
-- Run this in the Supabase SQL Editor to fix column name issues
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- ORGANIZATIONS (one per pharmacy business)
-- ============================================================
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,         -- e.g. 'farmacia-del-centro'
  created_at timestamptz default now()
);

-- ============================================================
-- LOCATIONS (branches within an organization)
-- ============================================================
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,                -- e.g. 'Sucursal Norte'
  address text,
  created_at timestamptz default now()
);

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  full_name text not null,
  role text not null check (role in ('admin', 'pos', 'inventory')),
  pin text,                          -- 4-digit PIN for admin overrides
  created_at timestamptz default now()
);

-- Auto-create profile row when a new auth user is created
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'pos');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- INVENTORY (FIXED: use 'use' instead of 'use_description')
-- ============================================================
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  name text not null,
  "use" text,                        -- FIXED: renamed from use_description (quoted because 'use' is reserved)
  cost numeric(10,2) not null default 0,
  price numeric(10,2) not null default 0,
  quantity integer not null default 0,
  low_stock_threshold integer not null default 10,
  barcode text,
  warehouse_location text,
  expiration_date date,
  requires_prescription boolean not null default false,
  sales_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Migration: If upgrading from old schema, rename the column
-- This will fail gracefully if the column doesn't exist (fresh install)
do $$
begin
  -- Check if old column exists and new one doesn't
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'inventory' and column_name = 'use_description'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_name = 'inventory' and column_name = 'use'
  ) then
    alter table inventory rename column use_description to "use";
  end if;
end $$;

create index if not exists inventory_org_id_idx on inventory(org_id);
create index if not exists inventory_location_id_idx on inventory(location_id);
create index if not exists inventory_name_idx on inventory(name);

-- ============================================================
-- DISCOUNTS
-- ============================================================
create table if not exists discounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  value numeric(5,2) not null,       -- percent
  created_at timestamptz default now(),
  unique(org_id, code)
);

-- ============================================================
-- SHIFTS
-- ============================================================
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id),
  opened_by uuid references profiles(id),
  opened_by_name text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  starting_cash numeric(10,2) not null default 0,
  closing_cash numeric(10,2),
  expected_cash numeric(10,2),
  variance numeric(10,2),
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text,
  total_sales integer default 0,
  total_revenue numeric(10,2) default 0,
  total_cash numeric(10,2) default 0,
  total_card numeric(10,2) default 0,
  total_insurance numeric(10,2) default 0
);

create index if not exists shifts_org_id_idx on shifts(org_id);
create index if not exists shifts_status_idx on shifts(status);

-- ============================================================
-- SALES
-- ============================================================
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id),
  shift_id uuid references shifts(id),
  salesperson_id uuid references profiles(id),
  salesperson_name text,
  salesperson text,                  -- App sends this directly (display name)
  payment_method text not null default 'cash' check (payment_method in ('cash','card','insurance')),
  subtotal numeric(10,2) not null default 0,
  discount_code text,
  discount_value numeric(5,2),       -- Percentage value (e.g., 10 for 10%)
  discount_amount numeric(10,2) default 0,
  iva_enabled boolean default true,
  iva_rate numeric(5,2),
  iva_amount numeric(10,2) default 0,
  total numeric(10,2) not null default 0,
  amount_given numeric(10,2),
  change_due numeric(10,2),
  patient_name text,
  patient_curp text,
  voided boolean not null default false,
  voided_by text,
  voided_at timestamptz,
  timestamp timestamptz not null default now()
);

create index if not exists sales_org_id_idx on sales(org_id);
create index if not exists sales_timestamp_idx on sales(timestamp);
create index if not exists sales_shift_id_idx on sales(shift_id);

-- ============================================================
-- SALE ITEMS
-- ============================================================
create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  inventory_id uuid references inventory(id) on delete set null,
  name text not null,
  quantity integer not null,
  price numeric(10,2) not null,      -- App sends 'price', not 'unit_price'
  original_price numeric(10,2),
  override_by text,
  requires_prescription boolean default false,
  rx_number text
);

create index if not exists sale_items_sale_id_idx on sale_items(sale_id);

-- ============================================================
-- RETURNS
-- ============================================================
create table if not exists returns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  original_sale_id uuid references sales(id),
  processed_by uuid references profiles(id),
  processed_by_name text,
  refund_total numeric(10,2) not null default 0,
  timestamp timestamptz not null default now()
);

create table if not exists return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id) on delete cascade,
  inventory_id uuid references inventory(id) on delete set null,
  name text not null,
  return_qty integer not null,
  unit_price numeric(10,2) not null
);

create index if not exists return_items_return_id_idx on return_items(return_id);

-- ============================================================
-- SUPPLIERS
-- ============================================================
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  contact text,
  phone text,
  email text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists suppliers_org_id_idx on suppliers(org_id);

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text,
  status text not null default 'pending' check (status in ('pending','received')),
  notes text,
  created_at timestamptz default now(),
  received_at timestamptz
);

create index if not exists purchase_orders_org_id_idx on purchase_orders(org_id);

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  medicine_name text not null,
  quantity integer not null,
  unit_cost numeric(10,2) not null
);

create index if not exists purchase_order_items_po_id_idx on purchase_order_items(po_id);

-- ============================================================
-- AUDIT LOG
-- ============================================================
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  user_name text,
  user_role text,
  location_id uuid references locations(id) on delete set null,
  action text not null,
  details text,
  timestamp timestamptz not null default now()
);

create index if not exists audit_log_org_id_idx on audit_log(org_id);
create index if not exists audit_log_timestamp_idx on audit_log(timestamp);

-- ============================================================
-- TAX SETTINGS (per org)
-- ============================================================
create table if not exists tax_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations(id) on delete cascade,
  iva_enabled boolean not null default true,
  iva_rate numeric(5,2) not null default 16.00,
  updated_at timestamptz default now()
);

-- ============================================================
-- RPC FUNCTION: Decrement inventory (for sales)
-- ============================================================
create or replace function decrement_inventory(p_id uuid, p_qty integer)
returns void language plpgsql security definer as $$
begin
  update inventory
  set 
    quantity = quantity - p_qty,
    sales_count = sales_count + p_qty,
    updated_at = now()
  where id = p_id;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table organizations enable row level security;
alter table locations enable row level security;
alter table profiles enable row level security;
alter table inventory enable row level security;
alter table discounts enable row level security;
alter table shifts enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table returns enable row level security;
alter table return_items enable row level security;
alter table suppliers enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table audit_log enable row level security;
alter table tax_settings enable row level security;

-- Helper function: get the current user's org_id
create or replace function get_my_org_id()
returns uuid language sql security definer stable as $$
  select org_id from profiles where id = auth.uid()
$$;

-- RLS policies — authenticated users can only access their own org's data
do $$
declare
  t text;
begin
  foreach t in array array[
    'locations','inventory','discounts','shifts','sales',
    'returns','suppliers','purchase_orders','audit_log','tax_settings'
  ] loop
    execute format('
      drop policy if exists "org_isolation" on %I;
      create policy "org_isolation" on %I
        for all using (org_id = get_my_org_id())
        with check (org_id = get_my_org_id());
    ', t, t);
  end loop;
end;
$$;

-- Profiles: users can read all profiles in their org, edit their own
drop policy if exists "profiles_read" on profiles;
create policy "profiles_read" on profiles
  for select using (id = auth.uid() or org_id = get_my_org_id());

drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles
  for update using (id = auth.uid());

-- Sale items / return items / PO items: accessible via parent table join
drop policy if exists "sale_items_policy" on sale_items;
create policy "sale_items_policy" on sale_items
  for all using (
    sale_id in (select id from sales where org_id = get_my_org_id())
  );

drop policy if exists "return_items_policy" on return_items;
create policy "return_items_policy" on return_items
  for all using (
    return_id in (select id from returns where org_id = get_my_org_id())
  );

drop policy if exists "po_items_policy" on purchase_order_items;
create policy "po_items_policy" on purchase_order_items
  for all using (
    po_id in (select id from purchase_orders where org_id = get_my_org_id())
  );

-- Organizations: members can read their own org
drop policy if exists "org_read" on organizations;
create policy "org_read" on organizations
  for select using (id = get_my_org_id());

-- Security definer function to securely check if the current user is an admin without infinite recursion
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

-- Profiles: Admins can update/manage profiles within their org or newly created profiles 
drop policy if exists "admin_profiles_all" on profiles;
create policy "admin_profiles_all" on profiles
  for all using (
    is_admin() and (org_id = get_my_org_id() or org_id is null)
  )
  with check (
    is_admin() and (org_id = get_my_org_id() or org_id is null)
  );

-- ============================================================
-- SEED DATA (Optional - for testing)
-- ============================================================
-- Uncomment and modify for initial setup:

-- Insert a default organization (run this manually with your org details)
-- insert into organizations (name, slug) values ('Mi Farmacia', 'mi-farmacia');

-- Insert a default location (run this manually after creating the org)
-- insert into locations (org_id, name, address) 
-- select id, 'Sucursal Principal', 'Dirección de la farmacia' from organizations where slug = 'mi-farmacia';
