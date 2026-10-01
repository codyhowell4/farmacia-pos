-- POS membership signup ("Registrar Miembro").
--
-- Flow: the cashier adds the membership fee (MEMBRESIA INDIVIDUAL/FAMILIAR,
-- department 'membresias') to the POS ticket, the customer pays everything in
-- one charge, and AFTER the sale completes the POS calls pos_register_membership.
-- That RPC dedupes/creates the customer, creates (or reinstates) the
-- membership, records payment #1 (payments_made, visits, milestone revisions,
-- welcome/receipt emails, in-app notifications) and links the sale — WITHOUT
-- booking a second sale for the fee (it already rode the ticket).
--
-- Two changes:
--   1. _impl_record_membership_payment gains p_skip_sale_booking (default
--      false). The existing public wrapper record_membership_payment keeps
--      its 5-arg signature and behavior; the 5-arg call resolves to the new
--      6-arg implementation via the default.
--   2. New security-definer pos_register_membership for pos/admin staff
--      (the pos role cannot touch customers directly after the RLS lockdown).

-- ============================================================
-- 1. _impl_record_membership_payment + p_skip_sale_booking
-- ============================================================
drop function if exists public._impl_record_membership_payment(uuid, numeric, text, uuid, boolean);

create or replace function public._impl_record_membership_payment(
  p_membership_id uuid,
  p_amount numeric default null,
  p_payment_method text default 'cash',
  p_staff_id uuid default null,
  p_is_signup boolean default false,
  p_skip_sale_booking boolean default false
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
$$;

revoke all on function public._impl_record_membership_payment(uuid, numeric, text, uuid, boolean, boolean) from public, anon, authenticated;

-- ============================================================
-- 2. pos_register_membership
-- ============================================================
-- Called by the POS after a ticket containing the membership fee completes.
-- Verifies the fee is actually on the ticket, dedupes/creates the customer,
-- creates or reinstates the membership (payment #1, no duplicate sale
-- booking), deducts consultas consumed by the ticket, and links the sale.
create or replace function public.pos_register_membership(
  p_sale_id uuid,
  p_plan_type text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_payment_method text default 'cash',
  p_visits_used integer default 0,
  p_terms_accepted_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
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
       and si.price >= v_monthly
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
$$;

revoke all on function public.pos_register_membership(uuid, text, text, text, text, text, integer, timestamptz) from public, anon;
grant execute on function public.pos_register_membership(uuid, text, text, text, text, text, integer, timestamptz) to authenticated;
