-- ============================================================
-- MIGRATION: Plan Empresa + primer mes gratis (2026-10-21)
--
-- 1. memberships.plan_type CHECK gains 'empresa'; new columns
--    company_name / seats / setup_token (+expiry).
-- 2. membership_members gains phone (employee contact).
-- 3. pos_register_membership gains p_free_first_month (default false):
--    the anti-freeload check passes with the $0 fee item on the ticket
--    (the fee must still be on the ticket — the sale documents the signup).
--    Function body regenerated from the LIVE def (pg_get_functiondef) with
--    only that change. Old signature dropped first (param lists can't be
--    altered by create-or-replace).
-- 4. public_signup_membership: payment #1 amount prefers
--    p_membership->>'signup_amount' when present ($0 first month); otherwise
--    monthly_amount as before. Live def + one-line change.
-- ============================================================

-- 1. memberships: plan_type constraint + empresa columns
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'memberships'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%plan_type%';
  if cname is not null then
    execute format('alter table memberships drop constraint %I', cname);
    raise notice 'Dropped plan_type constraint: %', cname;
  end if;
end $$;

alter table memberships
  add constraint memberships_plan_type_check
    check (plan_type in ('individual', 'familiar', 'empresa')),
  add column if not exists company_name text,
  add column if not exists seats integer,
  add column if not exists setup_token text,
  add column if not exists setup_token_expires_at timestamptz;

create index if not exists memberships_setup_token_idx on memberships(setup_token);

-- 2. membership_members.phone
alter table membership_members add column if not exists phone text;

-- 3. pos_register_membership with p_free_first_month
drop function if exists public.pos_register_membership(uuid, text, text, text, text, text, integer, timestamptz);

CREATE OR REPLACE FUNCTION public.pos_register_membership(p_sale_id uuid, p_plan_type text, p_full_name text, p_email text, p_phone text, p_payment_method text DEFAULT 'cash'::text, p_visits_used integer DEFAULT 0, p_terms_accepted_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_free_first_month boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := public.get_my_org_id();
  v_customer_id uuid;
  v_membership memberships%rowtype;
  v_existing record;
  v_visits_limit int;
  v_monthly numeric;
  v_start date := current_date;
  v_day int;
  v_next date;
  v_reinstated boolean := false;
  v_fee_paid boolean;
begin
  -- Staff of the org only (pos/admin/inventory/doctor).
  if v_org is null or not public.is_org_staff() then
    raise exception 'No autorizado';
  end if;

  if p_plan_type not in ('individual', 'familiar') then
    raise exception 'Plan inválido';
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'El nombre del titular es obligatorio.';
  end if;
  if nullif(btrim(p_email), '') is null then
    raise exception 'El correo electrónico es obligatorio (ahí llega la activación de la cuenta).';
  end if;

  v_visits_limit := case when p_plan_type = 'individual' then 2 else 8 end;
  v_monthly := case when p_plan_type = 'individual' then 150 else 500 end;

  -- The sale must belong to this org and not already be linked.
  perform 1 from sales where id = p_sale_id and org_id = v_org;
  if not found then
    raise exception 'Venta no encontrada.';
  end if;
  perform 1 from sales where id = p_sale_id and membership_id is not null;
  if found then
    raise exception 'La venta ya está vinculada a una membresía.';
  end if;

  -- Anti-freeload: the membership fee must actually be on the ticket.
  select exists (
    select 1
      from sale_items si
      join inventory i on i.id = si.inventory_id
     where si.sale_id = p_sale_id
       and i.department = 'membresias'
       and si.price >= case when p_free_first_month then 0 else v_monthly end
  ) into v_fee_paid;
  if not v_fee_paid then
    raise exception 'La venta no incluye el cobro de la membresía (producto MEMBRESIA %).', upper(p_plan_type);
  end if;

  -- Find or create the customer (dedupe by email OR phone, org-scoped).
  select c.id into v_customer_id
    from customers c
   where c.org_id = v_org
     and (
       lower(c.email) = lower(btrim(p_email))
       or (nullif(btrim(p_phone), '') is not null and c.phone = btrim(p_phone))
     )
   limit 1;

  if v_customer_id is null then
    insert into customers (org_id, full_name, email, phone)
    values (v_org, btrim(p_full_name), lower(btrim(p_email)), nullif(btrim(p_phone), ''))
    returning id into v_customer_id;
  end if;

  -- An active-ish membership blocks a new signup (mirror createMembership).
  select m.* into v_existing
    from memberships m
   where m.org_id = v_org
     and m.customer_id = v_customer_id
     and m.status in ('active', 'paused', 'pending_payment')
   limit 1;
  if found then
    raise exception 'Este cliente ya tiene una membresía % (%). Cancélala antes de registrar una nueva.',
      v_existing.status, v_existing.plan_id;
  end if;

  -- Billing anchor: one month from today with the last-day rule.
  v_day := extract(day from v_start)::int;
  v_next := v_start + interval '1 month';
  if extract(day from v_next) < v_day then
    v_next := (date_trunc('month', v_next) + interval '1 month' - interval '1 day')::date;
  end if;

  -- Reinstate the most recent cancelled/expired membership when one exists
  -- (keeps payments_made so revision progress continues).
  select m.* into v_existing
    from memberships m
   where m.org_id = v_org
     and m.customer_id = v_customer_id
     and m.status in ('cancelled', 'expired')
   order by m.created_at desc
   limit 1;

  if found then
    v_reinstated := true;
    update memberships set
      plan_type = p_plan_type,
      monthly_amount = v_monthly,
      visits_limit = v_visits_limit,
      discount_percent = 10,
      status = 'active',
      visits_remaining = v_visits_limit,
      basic_trackers_included = 0,
      basic_trackers_fulfilled = 0,
      next_renewal_date = v_next,
      renewal_day = extract(day from v_next)::int,
      payment_method = 'cash',
      payment_processor = null,
      processor_customer_id = null,
      processor_subscription_id = null,
      card_token = null,
      card_last4 = null,
      pending_cancellation = false,
      cancel_requested_at = null,
      terms_accepted_at = coalesce(p_terms_accepted_at, now()),
      updated_at = now()
    where id = v_existing.id
    returning * into v_membership;

    -- Roster reset: keep the titular row (it anchors pending revisions),
    -- drop old family rows — family is re-captured in the portal onboarding.
    delete from membership_members
     where membership_id = v_membership.id and not is_owner;

    if exists (select 1 from membership_members where membership_id = v_membership.id and is_owner) then
      update membership_members
         set name = btrim(p_full_name)
       where membership_id = v_membership.id and is_owner;
    else
      insert into membership_members (membership_id, sub_id, name, is_owner)
      values (v_membership.id, v_membership.plan_id || '-1', btrim(p_full_name), true);
    end if;
  else
    insert into memberships (
      org_id, customer_id, plan_type, status,
      monthly_amount, discount_percent, visits_limit, visits_remaining,
      basic_trackers_included, basic_trackers_fulfilled,
      next_renewal_date, renewal_day, payment_method,
      terms_accepted_at
    ) values (
      v_org, v_customer_id, p_plan_type, 'active',
      v_monthly, 10, v_visits_limit, v_visits_limit,
      0, 0,
      v_next, extract(day from v_next)::int, 'cash',
      coalesce(p_terms_accepted_at, now())
    )
    returning * into v_membership;

    insert into membership_members (membership_id, sub_id, name, is_owner)
    values (v_membership.id, v_membership.plan_id || '-1', btrim(p_full_name), true);
  end if;

  -- Payment #1: payments_made + visits refill + milestone revisions
  -- (reinstate path) + welcome/receipt emails + in-app notifications.
  -- p_skip_sale_booking = true: the fee already rode the POS ticket.
  perform public._impl_record_membership_payment(v_membership.id, v_monthly, p_payment_method, auth.uid(), true, true);

  -- Consultas consumed by this very ticket come out of the fresh balance.
  if p_visits_used > 0 then
    update memberships
       set visits_remaining = greatest(0, visits_remaining - p_visits_used),
           updated_at = now()
     where id = v_membership.id;
  end if;

  -- Link the sale to the membership and the titular's customer row.
  update sales
     set membership_id = v_membership.id,
         customer_id = v_customer_id
   where id = p_sale_id
     and org_id = v_org
     and membership_id is null;

  return jsonb_build_object(
    'membership_id', v_membership.id,
    'plan_id', v_membership.plan_id,
    'customer_id', v_customer_id,
    'reinstated', v_reinstated
  );
end;
$function$;

revoke all on function public.pos_register_membership(uuid, text, text, text, text, text, integer, timestamptz, boolean) from public, anon;
grant execute on function public.pos_register_membership(uuid, text, text, text, text, text, integer, timestamptz, boolean) to authenticated, service_role;

-- 4. public_signup_membership with signup_amount
CREATE OR REPLACE FUNCTION public.public_signup_membership(p_org_id uuid, p_customer jsonb, p_membership jsonb, p_member_names text[] DEFAULT ARRAY[]::text[], p_terms_accepted_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer_id uuid;
  v_membership memberships%rowtype;
  v_start date;
  v_next date;
  v_day int;
  i int;
  v_status text;
begin
  insert into customers (org_id, full_name, email, phone, date_of_birth, guardian_name, guardian_relationship, guardian_id_ref)
  values (
    p_org_id,
    p_customer->>'full_name',
    p_customer->>'email',
    p_customer->>'phone',
    nullif(btrim(coalesce(p_customer->>'date_of_birth', '')), '')::date,
    nullif(btrim(coalesce(p_customer->>'guardian_name', '')), ''),
    nullif(btrim(coalesce(p_customer->>'guardian_relationship', '')), ''),
    nullif(btrim(coalesce(p_customer->>'guardian_id_ref', '')), '')
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
    processor_customer_id, processor_subscription_id,
    terms_accepted_at
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
    p_membership->>'processor_customer_id', p_membership->>'processor_subscription_id',
    coalesce(p_terms_accepted_at, (p_membership->>'terms_accepted_at')::timestamptz)
  )
  returning * into v_membership;

  insert into membership_members (membership_id, sub_id, name, is_owner, date_of_birth)
  values (
    v_membership.id, v_membership.plan_id || '-1', p_customer->>'full_name', true,
    nullif(btrim(coalesce(p_customer->>'date_of_birth', '')), '')::date
  );

  -- array_length of an EMPTY array is NULL, not 0: guard the loop or the
  -- whole signup dies with "upper bound of FOR loop cannot be null".
  if coalesce(array_length(p_member_names, 1), 0) > 0 then
    for i in 1..array_length(p_member_names, 1) loop
      insert into membership_members (membership_id, sub_id, name, is_owner)
      values (v_membership.id, v_membership.plan_id || '-' || (i+1), p_member_names[i], false);
    end loop;
  end if;

  -- Signup = payment #1: counts the payment, books the sale, fires
  -- welcome + receipt notifications. SKIPPED for pending memberships
  -- (PayPal approved but not yet charged): the paypal-webhook records
  -- payment #1 when the first charge confirms. Guarded so a bookkeeping
  -- failure cannot roll back the signup itself.
  if v_status <> 'pending' then
    begin
      perform record_membership_payment(
        v_membership.id,
        coalesce(nullif(p_membership->>'signup_amount', '')::numeric, (p_membership->>'monthly_amount')::numeric),
        coalesce(p_membership->>'payment_method', 'paypal'),
        null,
        true
      );
    exception when others then
      raise warning 'public_signup_membership: signup payment recording failed for membership %: %', v_membership.id, sqlerrm;
    end;
  end if;

  -- Re-read so the returned row reflects payments_made etc.
  select * into v_membership from memberships where id = v_membership.id;

  return jsonb_build_object(
    'membership', to_jsonb(v_membership),
    'customer', to_jsonb((select row_to_json(c) from customers c where c.id = v_customer_id)),
    'members', (select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) from membership_members m where m.membership_id = v_membership.id)
  );
end;
$function$;

-- Verification
select
  (select count(*) from information_schema.columns where table_name = 'memberships' and column_name = 'setup_token') as memberships_setup_token,
  (select count(*) from information_schema.columns where table_name = 'membership_members' and column_name = 'phone') as members_phone,
  (select count(*) from pg_proc where proname = 'pos_register_membership' and pg_get_functiondef(oid) ilike '%free_first_month%') as pos_fn_has_flag,
  (select count(*) from pg_proc where proname = 'public_signup_membership' and pg_get_functiondef(oid) ilike '%signup_amount%') as signup_fn_has_amount;
