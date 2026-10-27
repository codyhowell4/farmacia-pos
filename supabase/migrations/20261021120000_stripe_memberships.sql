-- ============================================================
-- MIGRATION: Stripe memberships (webhook-authoritative, like PayPal)
-- 2026-10-21
--
-- Stripe-billed memberships are renewal-driven by the stripe-webhook edge
-- function, so both server-side jobs must skip processor='stripe' rows
-- exactly like 'paypal' rows. Function bodies were regenerated from the
-- LIVE definitions (pg_get_functiondef) with only that condition changed.
-- Also creates the stripe_webhook_events dedupe log.
-- PayPal objects are untouched (legacy members keep PayPal).
-- ============================================================

CREATE OR REPLACE FUNCTION public._impl_process_membership_renewals()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        and (payment_processor is null or payment_processor <> ALL (ARRAY['paypal','stripe']))
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
$function$;


revoke all on function public._impl_process_membership_renewals() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public._impl_record_membership_payment(p_membership_id uuid, p_amount numeric DEFAULT NULL::numeric, p_payment_method text DEFAULT 'cash'::text, p_staff_id uuid DEFAULT NULL::uuid, p_is_signup boolean DEFAULT false, p_skip_sale_booking boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    and (v_membership.payment_processor is null or v_membership.payment_processor <> ALL (ARRAY['paypal','stripe']));
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
  -- Skipped when the fee already rode a POS ticket (pos_register_membership):
  -- booking here would count the revenue twice.
  if not p_skip_sale_booking then
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
  end if;

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
$function$;


revoke all on function public._impl_record_membership_payment(uuid, numeric, text, uuid, boolean, boolean) from public, anon, authenticated;

-- Webhook dedupe log (mirrors paypal_webhook_events)
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

-- Verification
select
  (select count(*) from pg_proc where proname = '_impl_process_membership_renewals' and pg_get_functiondef(oid) ilike '%stripe%') as renewals_has_stripe,
  (select count(*) from pg_proc where proname = '_impl_record_membership_payment' and pg_get_functiondef(oid) ilike '%stripe%') as payment_has_stripe,
  (select count(*) from information_schema.tables where table_name = 'stripe_webhook_events') as events_table;
