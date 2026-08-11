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
