-- ============================================================
-- MIGRATION: Membership system hardening
--
-- One idempotent pass over the membership system. Contents:
--   A. Schema: new membership/member/sale columns, membership_revisions
--      RLS (staff read-only), anon revoked from membership RPCs.
--   B. ensure_membership_plan_products(org) — 'MEMBRESIA INDIVIDUAL' /
--      'MEMBRESIA FAMILIAR' inventory items.
--   C. record_membership_payment — extended: books a sale + sale_items +
--      sale_payments, payment receipt email/in-app notifications,
--      welcome notifications on signup. Old 1-arg signature is DROPPED
--      and replaced (all current callers use named args with defaults).
--   D. public_signup_membership — records the signup as payment #1 and
--      stores terms acceptance. Old 4-param signature is DROPPED and
--      replaced (new param has a default; named-arg callers unaffected).
--   E. decrement_membership_visits — atomic visit counter RPC.
--   F. restore_membership_sale_benefits — returns visits/revisions on void.
--   G. process_membership_renewals — server-side renewal/cancellation job
--      + pg_cron schedule 'membership-renewals-daily'.
--   H. manage_family_member — staff-only family roster add/remove/edit
--      with a 90-day cooldown (admin override).
--   I. request_membership_cancellation / resume_membership — self-service
--      cancel-at-period-end for the titular or org staff.
--   J. validate_membership_checkout — read-only, server-authoritative
--      pricing/entitlement check for the POS.
--   K. lookup_login_email — also resolves family-member sub_id/email to
--      the member's own (claimed) email.
--
-- Idempotent: add column if not exists / create or replace / drop ... if
-- exists / on conflict do nothing / exception-guarded cron (re)schedule.
-- Run this in the Supabase SQL Editor (top to bottom, do not skip).
-- ============================================================

-- ============================================================
-- SECTION A: SCHEMA CHANGES
-- ============================================================

-- A.1 memberships: roster lock, cancel-at-period-end, terms acceptance
alter table memberships
  add column if not exists last_roster_change_at timestamptz,
  add column if not exists pending_cancellation boolean not null default false,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists terms_accepted_at timestamptz;

-- A.2 membership_members: claimable identity for family members
alter table membership_members
  add column if not exists email text,
  add column if not exists claimed_user_id uuid;

create unique index if not exists membership_members_lower_email_unique_idx
  on membership_members (lower(email)) where email is not null;

-- A.3 sales: visits consumed by this ticket (for void restoration).
-- sales.membership_id already exists (added by MIGRATION_membership_system).
alter table sales
  add column if not exists membership_visits_used integer not null default 0;

-- Index backing restore_membership_sale_benefits (section F)
create index if not exists membership_revisions_sale_id_idx
  on membership_revisions (sale_id) where sale_id is not null;

-- notifications.type may carry a restrictive CHECK depending on which
-- migration created the table first (MIGRATION_phase2_workflow* limits it
-- to 'prescription','refill','appointment','order','system'). Drop any
-- CHECK on that column so membership notification types always fit.
do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
  where t.relname = 'notifications'
    and c.contype = 'c'
    and a.attname = 'type';

  if con_name is not null then
    execute format('alter table notifications drop constraint if exists %I', con_name);
  end if;
end $$;

-- A.4 membership_revisions RLS: staff of the same org can READ; all writes
-- go through security-definer RPCs (no insert/update/delete policies).
alter table membership_revisions enable row level security;

drop policy if exists membership_revisions_staff_select on membership_revisions;
create policy membership_revisions_staff_select on membership_revisions
  for select using (
    is_org_staff()
    and membership_id in (select id from memberships where org_id = get_my_org_id())
  );

-- A.5 Revoke anon from membership RPCs that were previously granted to anon.
-- (revoking from PUBLIC is required too: EXECUTE is granted to PUBLIC by
-- default and anon inherits it.)
revoke all on function use_membership_revision(uuid, uuid) from public;
revoke execute on function use_membership_revision(uuid, uuid) from anon;
grant execute on function use_membership_revision(uuid, uuid) to authenticated, service_role;

revoke all on function get_pending_member_revisions(uuid) from public;
revoke execute on function get_pending_member_revisions(uuid) from anon;
grant execute on function get_pending_member_revisions(uuid) to authenticated, service_role;

-- ============================================================
-- SECTION B: ensure_membership_plan_products
-- Creates the org-wide membership plan service items used to book
-- membership payments into sales. Same style as
-- ensure_membership_revision_products.
-- ============================================================
create or replace function ensure_membership_plan_products(p_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from inventory
    where org_id = p_org_id
      and location_id is null
      and department = 'membresias'
      and lower(name) = 'membresia individual'
  ) then
    insert into inventory (
      org_id, location_id, name, item_type, department, price, cost,
      quantity, low_stock_threshold
    ) values (
      p_org_id, null, 'MEMBRESIA INDIVIDUAL', 'service', 'membresias',
      150, 0, 9999, 0
    );
  end if;

  if not exists (
    select 1 from inventory
    where org_id = p_org_id
      and location_id is null
      and department = 'membresias'
      and lower(name) = 'membresia familiar'
  ) then
    insert into inventory (
      org_id, location_id, name, item_type, department, price, cost,
      quantity, low_stock_threshold
    ) values (
      p_org_id, null, 'MEMBRESIA FAMILIAR', 'service', 'membresias',
      500, 0, 9999, 0
    );
  end if;
end;
$$;

revoke all on function ensure_membership_plan_products(uuid) from public;
revoke execute on function ensure_membership_plan_products(uuid) from anon;
grant execute on function ensure_membership_plan_products(uuid) to authenticated, service_role;

-- ============================================================
-- SECTION C: record_membership_payment (extended)
-- Keeps the original behavior (payments_made + 1, status active, visits
-- refilled, 6/12-month milestone revisions + revision notifications) and
-- adds:
--   1. Bookkeeping: a completed sale + sale_items + sale_payments row for
--      the plan product. 'paypal' (or any non-POS method) maps to 'card'
--      for the sale_payments/sales method checks. Cash payments attach to
--      the staff member's open shift when one exists. Booking failures
--      log a warning and NEVER block the membership state change.
--   2. In-app 'Pago recibido' notification (amount + payments_made).
--   3. 'membership_receipt' email via notification_queue.
--   4. On signup (p_is_signup): 'membership_welcome' email + welcome
--      in-app notification.
-- The billing date advances one month per recorded payment EXCEPT for
-- PayPal-processor memberships (the webhook sets the authoritative
-- next_billing_time) and except at signup (the signup already set the
-- first renewal date).
-- ============================================================
drop function if exists record_membership_payment(uuid);

create or replace function record_membership_payment(
  p_membership_id uuid,
  p_amount numeric default null,
  p_payment_method text default 'cash',
  p_staff_id uuid default null,
  p_is_signup boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_membership record;
  v_milestone int;
  v_package text;
  v_member record;
  v_created int := 0;
  v_package_label text;
  v_amount numeric;
  v_advance boolean;
  v_base date;
  v_day int;
  v_next date;
  v_sale_id uuid := null;
  v_product_id uuid;
  v_product_name text;
  v_sale_method text;
  v_shift_id uuid := null;
  v_staff_name text;
begin
  select * into v_membership from memberships where id = p_membership_id;
  if v_membership is null then
    raise exception 'Membership % not found', p_membership_id;
  end if;

  v_amount := coalesce(p_amount, v_membership.monthly_amount);

  -- Advance the billing date one month per payment, skipping PayPal rows
  -- (webhook-authoritative dates) and the signup payment (date already set).
  v_advance := not p_is_signup
    and (v_membership.payment_processor is null or v_membership.payment_processor <> 'paypal');
  v_next := null;
  if v_advance then
    v_base := greatest(coalesce(v_membership.next_renewal_date, current_date), current_date);
    v_day := extract(day from v_base)::int;
    v_next := v_base + interval '1 month';
    if extract(day from v_next) < v_day then
      -- month is shorter than the billing day; use its last day
      v_next := (date_trunc('month', v_next) + interval '1 month' - interval '1 day')::date;
    end if;
  end if;

  update memberships
    set payments_made = coalesce(payments_made, 0) + 1,
        status = 'active',
        visits_remaining = visits_limit,
        next_renewal_date = coalesce(v_next, next_renewal_date),
        renewal_day = case when v_next is not null then extract(day from v_next)::int else renewal_day end,
        updated_at = now()
    where id = p_membership_id
    returning * into v_membership;

  v_milestone := v_membership.payments_made;

  -- Milestone revisions (payment 6/18/30... -> 'bh_ego'; 12/24... -> 'qs12e')
  if v_milestone % 6 = 0 then
    v_package := case when v_milestone % 12 = 0 then 'qs12e' else 'bh_ego' end;
    v_package_label := case v_package
      when 'bh_ego' then 'Biometría Hemática, Examen General de Orina y Consulta'
      else 'Química Sanguínea de 12 elementos y Consulta'
    end;

    for v_member in select * from membership_members where membership_id = p_membership_id loop
      with ins as (
        insert into membership_revisions (membership_id, member_id, milestone, package_type, status)
        values (p_membership_id, v_member.id, v_milestone, v_package, 'pending')
        on conflict (membership_id, member_id, milestone) do nothing
        returning id
      )
      select v_created + count(*) into v_created from ins;
    end loop;

    -- Email the owner through the existing notification_queue processor.
    insert into notification_queue (org_id, channel, recipient, template, payload, scheduled_for)
    select
      v_membership.org_id,
      'email',
      c.email,
      'membership_revision',
      jsonb_build_object(
        'membership_id', v_membership.id,
        'plan_id', v_membership.plan_id,
        'patient_name', c.full_name,
        'milestone', v_milestone,
        'package_type', v_package,
        'package_label', v_package_label
      ),
      now()
    from customers c
    where c.id = v_membership.customer_id and c.email is not null;

    -- In-app notification for the customer portal.
    insert into notifications (org_id, customer_id, type, title, message, related_id, related_table)
    select
      v_membership.org_id,
      v_membership.customer_id,
      'membership_revision',
      'Revisión de membresía disponible',
      'Tienes una revisión del mes ' || v_milestone || ' disponible: ' || v_package_label || '.',
      v_membership.id,
      'memberships'
    where v_membership.customer_id is not null;
  end if;

  -- ── Bookkeeping: sale + sale_items + sale_payments ─────────────
  -- Guarded: bookkeeping must never block membership state.
  begin
    perform ensure_membership_plan_products(v_membership.org_id);

    select id, name into v_product_id, v_product_name
      from inventory
      where org_id = v_membership.org_id
        and location_id is null
        and department = 'membresias'
        and lower(name) = case
          when v_membership.plan_type = 'individual' then 'membresia individual'
          else 'membresia familiar'
        end
      limit 1;
    v_product_name := coalesce(v_product_name, 'MEMBRESIA ' || upper(v_membership.plan_type));

    -- sales/sale_payments method checks only allow POS methods; map anything
    -- else ('paypal', ...) to 'card'.
    v_sale_method := case
      when p_payment_method in ('cash', 'card', 'insurance', 'transferencia') then p_payment_method
      else 'card'
    end;

    -- Cash payments booked by staff attach to that staff member's open shift.
    if p_payment_method = 'cash' and p_staff_id is not null then
      select s.id into v_shift_id
        from shifts s
        where s.org_id = v_membership.org_id
          and s.opened_by = p_staff_id
          and s.status = 'open'
        order by s.opened_at desc
        limit 1;
      select full_name into v_staff_name from profiles where id = p_staff_id;
    end if;

    insert into sales (
      org_id, customer_id, membership_id, shift_id,
      salesperson_id, salesperson_name,
      payment_method, subtotal, total,
      iva_enabled, iva_amount, discount_amount,
      status, voided, timestamp
    ) values (
      v_membership.org_id, v_membership.customer_id, v_membership.id, v_shift_id,
      p_staff_id, v_staff_name,
      v_sale_method, v_amount, v_amount,
      false, 0, 0,
      'completed', false, now()
    )
    returning id into v_sale_id;

    insert into sale_items (sale_id, inventory_id, name, quantity, price, original_price)
    values (v_sale_id, v_product_id, v_product_name, 1, v_amount, v_amount);

    insert into sale_payments (sale_id, payment_method, amount)
    values (v_sale_id, v_sale_method, v_amount);
  exception when others then
    raise warning 'record_membership_payment: sale booking failed for membership %: %', p_membership_id, sqlerrm;
    v_sale_id := null;
  end;

  -- ── Payment receipt: in-app + email (guarded, never blocks) ────
  begin
    insert into notifications (org_id, customer_id, type, title, message, related_id, related_table)
    select
      v_membership.org_id,
      v_membership.customer_id,
      'membership_payment',
      'Pago recibido',
      'Recibimos tu pago de $' || to_char(v_amount, 'FM999,999,990.00')
        || '. Este es el pago número ' || v_membership.payments_made
        || ' de tu membresía ' || v_membership.plan_id || '.',
      v_membership.id,
      'memberships'
    where v_membership.customer_id is not null;

    insert into notification_queue (org_id, channel, recipient, template, payload, scheduled_for)
    select
      v_membership.org_id,
      'email',
      c.email,
      'membership_receipt',
      jsonb_build_object(
        'membership_id', v_membership.id,
        'plan_id', v_membership.plan_id,
        'patient_name', c.full_name,
        'amount', v_amount,
        'currency', 'MXN',
        'payment_method', p_payment_method,
        'payments_made', v_membership.payments_made,
        'payment_date', now(),
        'next_renewal_date', v_membership.next_renewal_date,
        'sale_id', v_sale_id
      ),
      now()
    from customers c
    where c.id = v_membership.customer_id and c.email is not null;
  exception when others then
    raise warning 'record_membership_payment: receipt notifications failed for membership %: %', p_membership_id, sqlerrm;
  end;

  -- ── Signup extras: welcome email + in-app (guarded) ────────────
  if p_is_signup then
    begin
      insert into notifications (org_id, customer_id, type, title, message, related_id, related_table)
      select
        v_membership.org_id,
        v_membership.customer_id,
        'membership_welcome',
        '¡Bienvenido a Membresías Apolo!',
        'Tu membresía ' || v_membership.plan_id || ' ya está activa. Disfruta tus consultas, tu '
          || v_membership.discount_percent || '% de descuento y todos tus beneficios.',
        v_membership.id,
        'memberships'
      where v_membership.customer_id is not null;

      insert into notification_queue (org_id, channel, recipient, template, payload, scheduled_for)
      select
        v_membership.org_id,
        'email',
        c.email,
        'membership_welcome',
        jsonb_build_object(
          'membership_id', v_membership.id,
          'plan_id', v_membership.plan_id,
          'patient_name', c.full_name,
          'plan_type', v_membership.plan_type,
          'monthly_amount', v_membership.monthly_amount,
          'visits_limit', v_membership.visits_limit,
          'discount_percent', v_membership.discount_percent,
          'next_renewal_date', v_membership.next_renewal_date
        ),
        now()
      from customers c
      where c.id = v_membership.customer_id and c.email is not null;
    exception when others then
      raise warning 'record_membership_payment: welcome notifications failed for membership %: %', p_membership_id, sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'payments_made', v_membership.payments_made,
    'milestone', v_milestone,
    'package_type', v_package,
    'revisions_created', v_created,
    'sale_id', v_sale_id,
    'next_renewal_date', v_membership.next_renewal_date
  );
end;
$$;

revoke all on function record_membership_payment(uuid, numeric, text, uuid, boolean) from public;
revoke execute on function record_membership_payment(uuid, numeric, text, uuid, boolean) from anon;
grant execute on function record_membership_payment(uuid, numeric, text, uuid, boolean) to authenticated, service_role;

-- ============================================================
-- SECTION D: public_signup_membership — signup counts as payment #1
-- Same behavior as before (customer + membership + owner/family members),
-- plus: stores terms_accepted_at on the membership, then records the
-- signup payment through record_membership_payment so payment #1 is
-- counted, the sale is booked, and welcome/receipt notifications fire.
-- The payment call is guarded: a bookkeeping hiccup must not 500 a signup.
-- ============================================================
drop function if exists public_signup_membership(uuid, jsonb, jsonb, text[]);

create or replace function public_signup_membership(
  p_org_id uuid,
  p_customer jsonb,
  p_membership jsonb,
  p_member_names text[] default array[]::text[],
  p_terms_accepted_at timestamptz default null
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

  insert into membership_members (membership_id, sub_id, name, is_owner)
  values (v_membership.id, v_membership.plan_id || '-1', p_customer->>'full_name', true);

  if p_member_names is not null then
    for i in 1..array_length(p_member_names, 1) loop
      insert into membership_members (membership_id, sub_id, name, is_owner)
      values (v_membership.id, v_membership.plan_id || '-' || (i+1), p_member_names[i], false);
    end loop;
  end if;

  -- Signup = payment #1: counts the payment, books the sale, fires
  -- welcome + receipt notifications. Guarded so a bookkeeping failure
  -- cannot roll back the signup itself.
  begin
    perform record_membership_payment(
      v_membership.id,
      (p_membership->>'monthly_amount')::numeric,
      coalesce(p_membership->>'payment_method', 'paypal'),
      null,
      true
    );
  exception when others then
    raise warning 'public_signup_membership: signup payment recording failed for membership %: %', v_membership.id, sqlerrm;
  end;

  -- Re-read so the returned row reflects payments_made = 1 etc.
  select * into v_membership from memberships where id = v_membership.id;

  return jsonb_build_object(
    'membership', to_jsonb(v_membership),
    'customer', to_jsonb((select row_to_json(c) from customers c where c.id = v_customer_id)),
    'members', (select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) from membership_members m where m.membership_id = v_membership.id)
  );
end;
$$;

-- Public registration endpoint: must stay callable pre-login (anon) and by
-- the paypal-subscription Edge Function (service_role).
revoke all on function public_signup_membership(uuid, jsonb, jsonb, text[], timestamptz) from public;
grant execute on function public_signup_membership(uuid, jsonb, jsonb, text[], timestamptz) to anon, authenticated, service_role;

-- ============================================================
-- SECTION E: decrement_membership_visits — atomic visit counter
-- Single UPDATE ... RETURNING; raises when the membership is not active
-- (or missing) so the POS never silently decrements a stale membership.
-- Returns the new visits_remaining.
-- ============================================================
create or replace function decrement_membership_visits(p_membership_id uuid, p_count int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_remaining int;
begin
  if p_count is null or p_count <= 0 then
    -- no-op: report the current balance without touching the row
    select visits_remaining into v_remaining from memberships where id = p_membership_id;
    if not found then
      raise exception 'Membership % not found', p_membership_id;
    end if;
    return v_remaining;
  end if;

  update memberships
    set visits_remaining = greatest(visits_remaining - p_count, 0),
        updated_at = now()
    where id = p_membership_id and status = 'active'
    returning visits_remaining into v_remaining;

  if not found then
    raise exception 'Membership % is not active or does not exist', p_membership_id;
  end if;

  return v_remaining;
end;
$$;

revoke all on function decrement_membership_visits(uuid, int) from public;
revoke execute on function decrement_membership_visits(uuid, int) from anon;
grant execute on function decrement_membership_visits(uuid, int) to authenticated, service_role;

-- ============================================================
-- SECTION F: restore_membership_sale_benefits
-- Called by the POS right after voiding a sale. Returns the consumed
-- consulta visits (capped at visits_limit) and flips any revisions used
-- by that ticket back to 'pending'. Idempotent: the sale's
-- membership_visits_used is zeroed after the refund so a second call is
-- a no-op; the revision update only touches rows still marked 'used'.
-- ============================================================
create or replace function restore_membership_sale_benefits(p_sale_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sale record;
begin
  select id, membership_id, membership_visits_used, voided
    into v_sale
    from sales
    where id = p_sale_id;

  if v_sale is null then
    raise exception 'Sale % not found', p_sale_id;
  end if;

  if not v_sale.voided then
    raise exception 'Sale % is not voided; void the sale before restoring membership benefits', p_sale_id;
  end if;

  if v_sale.membership_id is not null then
    if v_sale.membership_visits_used > 0 then
      update memberships
        set visits_remaining = least(visits_remaining + v_sale.membership_visits_used, visits_limit),
            updated_at = now()
        where id = v_sale.membership_id;

      -- prevent a double refund if this RPC is called twice for one sale
      update sales
        set membership_visits_used = 0
        where id = p_sale_id;
    end if;

    update membership_revisions
      set status = 'pending',
          used_at = null,
          sale_id = null
      where sale_id = p_sale_id and status = 'used';
  end if;
end;
$$;

revoke all on function restore_membership_sale_benefits(uuid) from public;
revoke execute on function restore_membership_sale_benefits(uuid) from anon;
grant execute on function restore_membership_sale_benefits(uuid) to authenticated, service_role;

-- ============================================================
-- SECTION G: process_membership_renewals + daily cron
-- Server-side replacement for the client-side processMembershipRenewals:
--   1. Members who asked to cancel keep benefits until period end; once
--      next_renewal_date passes they become 'cancelled' (never
--      'pending_payment').
--   2. Active, non-PayPal memberships past their renewal date become
--      'pending_payment'. PayPal rows are webhook-driven and skipped.
--      (The old client auto-renew-and-reactivate branch for 'card' rows
--      is deliberately dropped: nobody gets fresh visits without a
--      recorded payment.)
-- ============================================================
create extension if not exists pg_cron with schema extensions;

create or replace function public.process_membership_renewals()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cancelled int := 0;
  v_pending int := 0;
begin
  with u as (
    update memberships
      set status = 'cancelled',
          pending_cancellation = false,
          updated_at = now()
      where pending_cancellation = true
        and next_renewal_date is not null
        and next_renewal_date < now()
      returning id
  )
  select count(*) into v_cancelled from u;

  with u as (
    update memberships
      set status = 'pending_payment',
          updated_at = now()
      where status = 'active'
        and next_renewal_date is not null
        and next_renewal_date < now()
        and (payment_processor is null or payment_processor <> 'paypal')
        and pending_cancellation = false
      returning id
  )
  select count(*) into v_pending from u;

  return jsonb_build_object(
    'cancelled', v_cancelled,
    'pending_payment', v_pending,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.process_membership_renewals() from public;
revoke execute on function public.process_membership_renewals() from anon;
grant execute on function public.process_membership_renewals() to authenticated, service_role;

-- Replace the schedule idempotently. NOTES:
--  - Supabase denies direct DELETE on cron.job (use cron.unschedule)
--  - some pg_cron versions ERROR on unschedule when the job is missing,
--    so run it inside an exception-swallowing block.
--  - pg_cron runs in UTC; 12:15 UTC ≈ 06:15 America/Mexico_City.
do $$
begin
  perform cron.unschedule('membership-renewals-daily');
exception when others then
  -- job did not exist yet; nothing to unschedule
  null;
end $$;

select cron.schedule(
  'membership-renewals-daily',
  '15 12 * * *',
  $$select process_membership_renewals();$$
);

-- ============================================================
-- SECTION H: manage_family_member — family roster management
-- Staff (same org, role admin/pos) only. 'add'/'remove' are limited to
-- one roster change per 90 days (last_roster_change_at); p_override is
-- honored only for role 'admin'. 'edit' is a name correction with NO
-- cooldown. Family size is capped at 5 non-owner members. sub_id is
-- plan_id || '-' || (max existing numeric suffix + 1).
-- ============================================================
create or replace function manage_family_member(
  p_membership_id uuid,
  p_action text,
  p_member_id uuid default null,
  p_name text default null,
  p_override boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_membership record;
  v_caller_role text;
  v_override boolean;
  v_name text;
  v_count int;
  v_suffix int;
  v_sub_id text;
  v_member record;
  v_new_id uuid;
begin
  select * into v_membership from memberships where id = p_membership_id;
  if v_membership is null then
    return jsonb_build_object('success', false, 'error', 'membership_not_found');
  end if;

  -- Auth: staff of the membership's org (admin or floor/POS staff)
  select role into v_caller_role
    from profiles
    where id = auth.uid() and org_id = v_membership.org_id;

  if v_caller_role is null or v_caller_role not in ('admin', 'pos') then
    return jsonb_build_object('success', false, 'error', 'not_authorized');
  end if;

  -- the 90-day override is honored only for admins
  v_override := coalesce(p_override, false) and v_caller_role = 'admin';

  if p_action is null or p_action not in ('add', 'remove', 'edit') then
    return jsonb_build_object('success', false, 'error', 'invalid_action');
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');

  -- 90-day cooldown applies to structural changes (add/remove), not edits
  if p_action in ('add', 'remove')
     and v_membership.last_roster_change_at is not null
     and v_membership.last_roster_change_at > now() - interval '90 days'
     and not v_override then
    return jsonb_build_object(
      'success', false,
      'error', 'roster_locked',
      'next_change_date', v_membership.last_roster_change_at + interval '90 days'
    );
  end if;

  if p_action = 'add' then
    if v_name is null then
      return jsonb_build_object('success', false, 'error', 'name_required');
    end if;

    select count(*) into v_count
      from membership_members
      where membership_id = p_membership_id and is_owner = false;
    if v_count >= 5 then
      return jsonb_build_object('success', false, 'error', 'roster_full');
    end if;

    select coalesce(max(cast(substring(mm.sub_id from '-(\d+)$') as integer)), 0) + 1
      into v_suffix
      from membership_members mm
      where mm.membership_id = p_membership_id;

    v_sub_id := v_membership.plan_id || '-' || v_suffix;

    insert into membership_members (membership_id, sub_id, name, is_owner)
    values (p_membership_id, v_sub_id, v_name, false)
    returning id into v_new_id;

    update memberships
      set last_roster_change_at = now(), updated_at = now()
      where id = p_membership_id;

    return jsonb_build_object('success', true, 'member_id', v_new_id, 'sub_id', v_sub_id);
  end if;

  if p_action = 'remove' then
    select * into v_member
      from membership_members
      where id = p_member_id and membership_id = p_membership_id;
    if v_member is null then
      return jsonb_build_object('success', false, 'error', 'member_not_found');
    end if;
    if v_member.is_owner then
      return jsonb_build_object('success', false, 'error', 'cannot_remove_owner');
    end if;

    delete from membership_members where id = p_member_id;

    update memberships
      set last_roster_change_at = now(), updated_at = now()
      where id = p_membership_id;

    return jsonb_build_object('success', true);
  end if;

  -- p_action = 'edit': name correction only; no cooldown, does not touch
  -- last_roster_change_at.
  if v_name is null then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;

  update membership_members
    set name = v_name
    where id = p_member_id and membership_id = p_membership_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'member_not_found');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function manage_family_member(uuid, text, uuid, text, boolean) from public;
revoke execute on function manage_family_member(uuid, text, uuid, text, boolean) from anon;
grant execute on function manage_family_member(uuid, text, uuid, text, boolean) to authenticated, service_role;

-- ============================================================
-- SECTION I: request_membership_cancellation / resume_membership
-- Self-service cancel-at-period-end. Authorized callers: the titular
-- (customers row of the membership matches the caller's JWT email, or is
-- linked to their profile) or staff of the membership's org.
-- ============================================================
create or replace function request_membership_cancellation(p_membership_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_membership record;
  v_jwt_email text;
  v_authorized boolean;
begin
  select * into v_membership from memberships where id = p_membership_id;
  if v_membership is null then
    return jsonb_build_object('success', false, 'error', 'membership_not_found');
  end if;

  v_jwt_email := auth.jwt() ->> 'email';
  v_authorized := exists (
    select 1 from customers c
    where c.id = v_membership.customer_id
      and (
        (v_jwt_email is not null and lower(c.email) = lower(v_jwt_email))
        or c.profile_id = auth.uid()
      )
  ) or exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.org_id = v_membership.org_id
      and p.role in ('admin', 'pos', 'inventory', 'doctor')
  );

  if not v_authorized then
    return jsonb_build_object('success', false, 'error', 'not_authorized');
  end if;

  if v_membership.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'already_cancelled');
  end if;

  update memberships
    set pending_cancellation = true,
        cancel_requested_at = now(),
        updated_at = now()
    where id = p_membership_id;

  return jsonb_build_object('success', true, 'effective_date', v_membership.next_renewal_date);
end;
$$;

revoke all on function request_membership_cancellation(uuid) from public;
revoke execute on function request_membership_cancellation(uuid) from anon;
grant execute on function request_membership_cancellation(uuid) to authenticated, service_role;

create or replace function resume_membership(p_membership_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_membership record;
  v_jwt_email text;
  v_authorized boolean;
begin
  select * into v_membership from memberships where id = p_membership_id;
  if v_membership is null then
    return jsonb_build_object('success', false, 'error', 'membership_not_found');
  end if;

  v_jwt_email := auth.jwt() ->> 'email';
  v_authorized := exists (
    select 1 from customers c
    where c.id = v_membership.customer_id
      and (
        (v_jwt_email is not null and lower(c.email) = lower(v_jwt_email))
        or c.profile_id = auth.uid()
      )
  ) or exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.org_id = v_membership.org_id
      and p.role in ('admin', 'pos', 'inventory', 'doctor')
  );

  if not v_authorized then
    return jsonb_build_object('success', false, 'error', 'not_authorized');
  end if;

  update memberships
    set pending_cancellation = false,
        cancel_requested_at = null,
        updated_at = now()
    where id = p_membership_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function resume_membership(uuid) from public;
revoke execute on function resume_membership(uuid) from anon;
grant execute on function resume_membership(uuid) to authenticated, service_role;

-- ============================================================
-- SECTION J: validate_membership_checkout (READ-ONLY)
-- Server-authoritative pricing/entitlement check the POS calls before
-- finalizing payment. p_items = [{"inventory_id": "...", "qty": n}].
--   - membership consultas: free up to visits_remaining (walking the
--     array in order), the rest at 50% of catalog price
--   - revision items: $0 when the selected member has enough pending
--     membership_revisions of that package_type (ids to consume are
--     returned), else error 'no_revision_available'
--   - blood pressure item: $0
--   - everything else: catalog price
-- membership_discount_base = qty * catalog price for every item that is
-- NOT a membership consulta (matches the POS 10% base).
-- Writes nothing.
-- ============================================================
create or replace function validate_membership_checkout(
  p_membership_id uuid,
  p_member_id uuid,
  p_items jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_membership record;
  v_item jsonb;
  v_inv record;
  v_qty int;
  v_free_qty int;
  v_paid_qty int;
  v_visits_left int;
  v_discount_base numeric := 0;
  v_results jsonb := '[]'::jsonb;
  v_consumed uuid[] := '{}';
  v_rev_ids uuid[];
begin
  select * into v_membership from memberships where id = p_membership_id;
  if v_membership is null then
    return jsonb_build_object('valid', false, 'reason', 'membership_not_found');
  end if;

  if v_membership.status <> 'active' then
    return jsonb_build_object(
      'valid', false,
      'reason', 'membership_not_active',
      'membership_status', v_membership.status
    );
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('valid', false, 'reason', 'invalid_items');
  end if;

  v_visits_left := v_membership.visits_remaining;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_qty := coalesce((v_item->>'qty')::int, 0);
      if v_qty < 1 then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_item->>'inventory_id', 'error', 'invalid_qty'));
        continue;
      end if;

      select id, name, price,
             is_membership_consultation, is_membership_revision, revision_type,
             is_membership_blood_pressure
        into v_inv
        from inventory
        where id = (v_item->>'inventory_id')::uuid;

      if v_inv is null then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_item->>'inventory_id', 'error', 'item_not_found'));
        continue;
      end if;

      if coalesce(v_inv.is_membership_consultation, false) then
        -- free consultas draw down visits in array order; extras at 50%
        v_free_qty := least(v_qty, v_visits_left);
        v_visits_left := v_visits_left - v_free_qty;
        v_paid_qty := v_qty - v_free_qty;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_inv.id,
          'name', v_inv.name,
          'kind', 'membership_consultation',
          'qty', v_qty,
          'free_qty', v_free_qty,
          'paid_qty', v_paid_qty,
          'free_unit_price', 0,
          'paid_unit_price', round(v_inv.price * 0.5, 2),
          'catalog_price', v_inv.price
        ));
        -- consultas are excluded from the 10% discount base

      elsif coalesce(v_inv.is_membership_revision, false) then
        -- claim the oldest pending revisions for the selected member,
        -- skipping ids already consumed by earlier lines in this array
        select coalesce(array_agg(r.id), '{}') into v_rev_ids
        from (
          select r.id
          from membership_revisions r
          where r.membership_id = p_membership_id
            and r.member_id = p_member_id
            and r.status = 'pending'
            and r.package_type = v_inv.revision_type
            and not (r.id = any (v_consumed))
          order by r.milestone, r.created_at
          limit v_qty
        ) r;

        if coalesce(array_length(v_rev_ids, 1), 0) < v_qty then
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'inventory_id', v_inv.id,
            'name', v_inv.name,
            'kind', 'membership_revision',
            'qty', v_qty,
            'error', 'no_revision_available',
            'available', coalesce(array_length(v_rev_ids, 1), 0),
            'catalog_price', v_inv.price
          ));
        else
          v_consumed := v_consumed || v_rev_ids;
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'inventory_id', v_inv.id,
            'name', v_inv.name,
            'kind', 'membership_revision',
            'qty', v_qty,
            'unit_price', 0,
            'revision_ids', to_jsonb(v_rev_ids),
            'catalog_price', v_inv.price
          ));
        end if;
        v_discount_base := v_discount_base + v_qty * v_inv.price;

      elsif coalesce(v_inv.is_membership_blood_pressure, false) then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_inv.id,
          'name', v_inv.name,
          'kind', 'membership_blood_pressure',
          'qty', v_qty,
          'unit_price', 0,
          'catalog_price', v_inv.price
        ));
        v_discount_base := v_discount_base + v_qty * v_inv.price;

      else
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_inv.id,
          'name', v_inv.name,
          'kind', 'regular',
          'qty', v_qty,
          'unit_price', v_inv.price,
          'catalog_price', v_inv.price
        ));
        v_discount_base := v_discount_base + v_qty * v_inv.price;
      end if;
    exception when others then
      -- malformed line (bad uuid, non-numeric qty, ...): report, keep going
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'inventory_id', v_item->>'inventory_id', 'error', 'invalid_line'));
    end;
  end loop;

  return jsonb_build_object(
    'valid', true,
    'membership_status', v_membership.status,
    'discount_percent', v_membership.discount_percent,
    'visits_remaining', v_membership.visits_remaining,
    'visits_remaining_after', v_visits_left,
    'items', v_results,
    'membership_discount_base', v_discount_base
  );
end;
$$;

revoke all on function validate_membership_checkout(uuid, uuid, jsonb) from public;
revoke execute on function validate_membership_checkout(uuid, uuid, jsonb) from anon;
grant execute on function validate_membership_checkout(uuid, uuid, jsonb) to authenticated, service_role;

-- ============================================================
-- SECTION K: lookup_login_email — family-member login resolution
-- Preserves the existing resolution (email / phone / membership number to
-- the titular's account email) and adds: a claimed family member
-- (membership_members.email set) can log in with their own email or with
-- their sub_id (case-insensitive) and resolve to THEIR email.
-- ============================================================
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

    if v_email is not null then
      return v_email;
    end if;

    -- Claimed family member logging in with their own email
    select lower(mm.email) into v_email
    from membership_members mm
    join memberships m on m.id = mm.membership_id
    where m.org_id = p_org_id
      and mm.email is not null
      and lower(mm.email) = lower(v_identifier)
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

  -- Claimed family member logging in with their sub_id resolves to their
  -- own email; unclaimed members fall through to the titular's account.
  select lower(mm.email) into v_email
  from membership_members mm
  join memberships m on m.id = mm.membership_id
  where m.org_id = p_org_id
    and mm.email is not null
    and upper(mm.sub_id) = v_identifier
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

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
grant execute on function public.lookup_login_email(text, uuid) to anon, authenticated, service_role;

-- ============================================================
-- NOTES
-- ============================================================
-- * No backfill: existing memberships keep their current payments_made
--   counts, renewal dates and visit balances. Nothing here creates
--   retroactive sales rows for past payments; bookkeeping starts with
--   the next payment recorded through record_membership_payment.
-- * sales has no 'completed'-style lifecycle besides status/voided: POS
--   sales use status 'completed' + voided false, so membership payment
--   bookings match that (the spec's "completed/normal").
--
-- VERIFICATION (uncomment to run after migrating)
-- select jobname, schedule, active from cron.job where jobname = 'membership-renewals-daily';
-- select process_membership_renewals();
-- select policyname, cmd from pg_policies where tablename = 'membership_revisions';
-- select validate_membership_checkout('<membership-uuid>', '<member-uuid>',
--   '[{"inventory_id": "<item-uuid>", "qty": 1}]'::jsonb);
