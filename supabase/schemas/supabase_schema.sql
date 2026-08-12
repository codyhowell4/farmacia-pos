-- ============================================================
-- Farmacia POS — Supabase Schema
-- Run this in the Supabase SQL Editor (once, top to bottom)
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
-- INVENTORY
-- ============================================================
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  name text not null,
  use_description text,
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

create index if not exists inventory_org_id_idx on inventory(org_id);
create index if not exists inventory_location_id_idx on inventory(location_id);

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
  payment_method text not null default 'cash' check (payment_method in ('cash','card','insurance')),
  subtotal numeric(10,2) not null default 0,
  discount_code text,
  discount_percent numeric(5,2),
  discount_amount numeric(10,2) default 0,
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

-- ============================================================
-- SALE ITEMS
-- ============================================================
create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  inventory_id uuid references inventory(id) on delete set null,
  name text not null,
  quantity integer not null,
  unit_price numeric(10,2) not null,
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

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  medicine_name text not null,
  quantity integer not null,
  unit_cost numeric(10,2) not null
);

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
-- ROW LEVEL SECURITY
-- Ensures each org can only see its own data
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
-- MEMBERSHIP SYSTEM
-- ============================================================

alter table inventory
  add column if not exists is_membership_consultation boolean not null default false;

alter table sales
  add column if not exists membership_id uuid references memberships(id) on delete set null;

create sequence if not exists membership_plan_id_seq start with 1 increment by 1;

create or replace function generate_membership_plan_id()
returns text language plpgsql as $$
declare
  n bigint;
begin
  n := nextval('membership_plan_id_seq');
  if n <= 99999 then
    return 'APOLO-' || lpad(n::text, 5, '0');
  else
    return 'APOLO-' || n::text;
  end if;
end;
$$;

create or replace function set_membership_plan_id()
returns trigger language plpgsql as $$
begin
  if new.plan_id is null then
    new.plan_id := generate_membership_plan_id();
  end if;
  return new;
end;
$$;

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  plan_id text unique not null,
  plan_type text not null check (plan_type in ('individual', 'familiar')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'expired', 'pending_payment')),
  discount_percent numeric(5,2) not null default 10,
  visits_remaining integer not null default 0,
  visits_limit integer not null default 0,
  premium_trackers integer not null default 0,
  monthly_amount numeric(10,2) not null default 0,
  payment_method text not null default 'card' check (payment_method in ('card', 'cash')),
  next_renewal_date date,
  renewal_day integer check (renewal_day between 1 and 31),
  card_token text,
  card_last4 text,
  payment_processor text default 'openpay' check (payment_processor in ('openpay', 'stripe')),
  processor_customer_id text,
  processor_subscription_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists memberships_org_id_idx on memberships(org_id);
create index if not exists memberships_customer_id_idx on memberships(customer_id);
create index if not exists memberships_plan_id_idx on memberships(plan_id);
create index if not exists memberships_status_idx on memberships(status);
create index if not exists memberships_next_renewal_date_idx on memberships(next_renewal_date);

drop trigger if exists trg_set_membership_plan_id on memberships;
create trigger trg_set_membership_plan_id
  before insert on memberships
  for each row execute function set_membership_plan_id();

create table if not exists membership_members (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  sub_id text not null,
  name text not null,
  is_owner boolean not null default false,
  created_at timestamptz default now(),
  unique(membership_id, sub_id)
);

create index if not exists membership_members_membership_id_idx on membership_members(membership_id);
create index if not exists membership_members_sub_id_idx on membership_members(sub_id);

alter table memberships enable row level security;
alter table membership_members enable row level security;

drop policy if exists org_isolation on memberships;
create policy org_isolation on memberships
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

drop policy if exists membership_members_org_isolation on membership_members;
create policy membership_members_org_isolation on membership_members
  for all using (
    membership_id in (select id from memberships where org_id = get_my_org_id())
  )
  with check (
    membership_id in (select id from memberships where org_id = get_my_org_id())
  );

-- Public signup RPC (security definer so anonymous users can register)
create or replace function public_signup_membership(
  p_org_id uuid,
  p_customer jsonb,
  p_membership jsonb,
  p_member_names text[] default array[]::text[]
) returns jsonb language plpgsql security definer as $$
declare
  v_customer_id uuid;
  v_membership memberships%rowtype;
  v_start date;
  v_next date;
  v_day int;
  i int;
begin
  insert into customers (org_id, full_name, email, phone)
  values (
    p_org_id,
    p_customer->>'full_name',
    p_customer->>'email',
    p_customer->>'phone'
  )
  returning id into v_customer_id;

  v_start := current_date;
  v_day := extract(day from v_start)::int;
  v_next := v_start + interval '1 month';
  if extract(day from v_next) < v_day then
    v_next := date_trunc('month', v_next) + interval '1 month' - interval '1 day';
  end if;

  insert into memberships (
    org_id, customer_id, plan_type, status, discount_percent,
    visits_remaining, visits_limit, premium_trackers, monthly_amount,
    payment_method, next_renewal_date, renewal_day,
    card_token, card_last4, payment_processor,
    processor_customer_id, processor_subscription_id
  ) values (
    p_org_id, v_customer_id,
    p_membership->>'plan_type', 'active', (p_membership->>'discount_percent')::numeric,
    (p_membership->>'visits_limit')::int, (p_membership->>'visits_limit')::int,
    (p_membership->>'premium_trackers')::int, (p_membership->>'monthly_amount')::numeric,
    p_membership->>'payment_method', v_next, v_day,
    p_membership->>'card_token', p_membership->>'card_last4',
    p_membership->>'payment_processor',
    p_membership->>'processor_customer_id', p_membership->>'processor_subscription_id'
  )
  returning * into v_membership;

  insert into membership_members (membership_id, sub_id, name, is_owner)
  values (v_membership.id, v_membership.plan_id || '-1', p_customer->>'full_name', true);

  if p_member_names is not null then
    for i in 1..array_length(p_member_names, 1) loop
      insert into membership_members (membership_id, sub_id, name, is_owner)
      values (v_membership.id, v_membership.plan_id || '-' || (i+1), p_member_names[i], false);
    end loop;
  end if;

  return jsonb_build_object(
    'membership', to_jsonb(v_membership),
    'customer', to_jsonb((select row_to_json(c) from customers c where c.id = v_customer_id)),
    'members', (select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) from membership_members m where m.membership_id = v_membership.id)
  );
end;
$$;

grant execute on function public_signup_membership(uuid, jsonb, jsonb, text[]) to anon, authenticated;

-- ============================================================
-- SALES BY SHIFT REPORT VIEW
-- ============================================================
CREATE OR REPLACE VIEW sales_by_shift AS
WITH sales_summary AS (
  SELECT
    s.shift_id,
    COUNT(*) AS total_sales,
    SUM(s.total) AS total_revenue,
    SUM(s.discount_amount) AS total_discounts,
    SUM(s.iva_amount) AS total_tax
  FROM sales s
  WHERE s.voided = false
    AND s.shift_id IS NOT NULL
  GROUP BY s.shift_id
),
payment_summary AS (
  SELECT
    s.shift_id,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'cash') AS total_cash,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'card') AS total_card,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'transferencia') AS total_transferencia,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'insurance') AS total_insurance
  FROM sales s
  JOIN sale_payments sp ON sp.sale_id = s.id
  WHERE s.voided = false
    AND s.shift_id IS NOT NULL
  GROUP BY s.shift_id
)
SELECT
  sh.id AS shift_id,
  sh.org_id,
  sh.location_id,
  l.name AS location_name,
  sh.opened_by AS cashier_id,
  COALESCE(sh.opened_by_name, p.full_name) AS cashier_name,
  sh.opened_at,
  sh.closed_at,
  sh.starting_cash,
  sh.closing_cash,
  sh.expected_cash,
  sh.variance,
  sh.status,
  sh.notes,
  COALESCE(ss.total_sales, 0) AS total_sales,
  COALESCE(ss.total_revenue, 0) AS total_revenue,
  COALESCE(ss.total_discounts, 0) AS total_discounts,
  COALESCE(ss.total_tax, 0) AS total_tax,
  COALESCE(ps.total_cash, 0) AS total_cash,
  COALESCE(ps.total_card, 0) AS total_card,
  COALESCE(ps.total_transferencia, 0) AS total_transferencia,
  COALESCE(ps.total_insurance, 0) AS total_insurance
FROM shifts sh
LEFT JOIN locations l ON sh.location_id = l.id
LEFT JOIN profiles p ON sh.opened_by = p.id
LEFT JOIN sales_summary ss ON ss.shift_id = sh.id
LEFT JOIN payment_summary ps ON ps.shift_id = sh.id
WHERE sh.status = 'closed'
ORDER BY sh.closed_at DESC;
