-- ============================================================
-- PayPal Subscriptions migration for memberships
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Allow PayPal as a payment processor
alter table memberships
  drop constraint if exists memberships_payment_processor_check;
alter table memberships
  add constraint memberships_payment_processor_check
    check (payment_processor in ('openpay', 'stripe', 'paypal'));

-- 2. Track basic tracker fulfillment
alter table memberships
  add column if not exists basic_trackers_included integer not null default 0,
  add column if not exists basic_trackers_fulfilled integer not null default 0;

-- 3. Webhook event deduplication
create table if not exists paypal_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  event_type text not null,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create index if not exists paypal_webhook_events_event_id_idx on paypal_webhook_events(event_id);
create index if not exists paypal_webhook_events_resource_id_idx on paypal_webhook_events(resource_id);

-- 4. Inventory decrement that allows negative quantities (backorder state)
-- Used for basic tracker fulfillment; regular sales still use decrement_inventory.
create or replace function decrement_inventory_allow_negative(p_id uuid, p_qty integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prev integer;
  v_new integer;
  v_sales_count integer;
  v_name text;
  v_org_id uuid;
begin
  select quantity, coalesce(sales_count, 0), name, org_id
    into v_prev, v_sales_count, v_name, v_org_id
    from inventory where id = p_id;

  if v_prev is null then
    raise exception 'Inventory item % not found', p_id;
  end if;

  v_new := v_prev - p_qty;

  update inventory
    set quantity = v_new,
        sales_count = v_sales_count + p_qty,
        updated_at = now()
    where id = p_id;

  insert into inventory_movements (
    org_id, inventory_id, type, quantity_change, previous_quantity, new_quantity,
    reference_type, reason
  ) values (
    v_org_id, p_id, 'sale', -p_qty, v_prev, v_new, 'membership_tracker',
    coalesce(v_name, 'tracker') || ' (membership fulfillment)'
  );
end;
$$;

grant execute on function decrement_inventory_allow_negative(uuid, integer) to authenticated, anon;

-- 5. Helper to ensure the org-wide basic fitness tracker product exists.
create or replace function ensure_basic_tracker_product(p_org_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id
    from inventory
    where org_id = p_org_id
      and lower(name) = 'rastreador fitness basico'
      and item_type = 'product'
      and location_id is null
    limit 1;

  if v_id is null then
    insert into inventory (
      org_id, location_id, name, item_type, department, price, cost,
      quantity, low_stock_threshold
    ) values (
      p_org_id, null, 'RASTREADOR FITNESS BASICO', 'product', 'accesorios',
      0, 0, 0, 0
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function ensure_basic_tracker_product(uuid) to authenticated, anon;

-- 6. Update public_signup_membership to accept PayPal fields and tracker counts.
-- Note: status stays 'pending_payment' until the Edge Function confirms payment,
-- then the Edge Function flips it to 'active'.
create or replace function public_signup_membership(
  p_org_id uuid,
  p_customer jsonb,
  p_membership jsonb,
  p_member_names text[] default array[]::text[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
  v_membership memberships%rowtype;
  v_start date;
  v_next date;
  v_day int;
  i int;
  v_status text;
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

  -- For PayPal the membership starts pending; the Edge Function activates it after payment confirmation.
  v_status := coalesce(p_membership->>'status', 'active');

  insert into memberships (
    org_id, customer_id, plan_type, status, discount_percent,
    visits_remaining, visits_limit, premium_trackers, basic_trackers_included,
    basic_trackers_fulfilled, monthly_amount,
    payment_method, next_renewal_date, renewal_day,
    card_token, card_last4, payment_processor,
    processor_customer_id, processor_subscription_id
  ) values (
    p_org_id, v_customer_id,
    p_membership->>'plan_type', v_status, (p_membership->>'discount_percent')::numeric,
    (p_membership->>'visits_limit')::int, (p_membership->>'visits_limit')::int,
    (p_membership->>'premium_trackers')::int,
    (p_membership->>'basic_trackers_included')::int,
    (p_membership->>'basic_trackers_fulfilled')::int,
    (p_membership->>'monthly_amount')::numeric,
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
