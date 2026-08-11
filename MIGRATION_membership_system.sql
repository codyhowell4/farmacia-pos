-- ============================================================
-- Membership system migration
-- Adds membership plans, members, and links them to sales/customers.
-- Run this in the Supabase SQL Editor after customer portal prerequisites.
-- ============================================================

-- Sequence for branded plan IDs (APOLO-00001, APOLO-00002, ...)
create sequence if not exists membership_plan_id_seq start with 1 increment by 1;

-- Generate the next branded plan ID
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

-- Trigger function to auto-assign plan_id on insert
create or replace function set_membership_plan_id()
returns trigger language plpgsql as $$
begin
  if new.plan_id is null then
    new.plan_id := generate_membership_plan_id();
  end if;
  return new;
end;
$$;

-- Flag for the membership consultation product
alter table inventory
  add column if not exists is_membership_consultation boolean not null default false;

-- Main memberships table
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

-- Link sales to memberships
alter table sales
  add column if not exists membership_id uuid references memberships(id) on delete set null;

-- Individual members within a family plan
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

-- RLS
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
