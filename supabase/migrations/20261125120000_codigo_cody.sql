-- ============================================================
-- MIGRATION: código CODY — 100 % de descuento solo para el propietario
-- (2026-11-25)
--
-- Live test sales (incl. Servicios RNP) that total $0 and don't move the
-- sales numbers. The recarga / pago is still sent to RNP and charged to the
-- RNP balance (that's the test); the customer pays nothing.
--
-- 1. discounts.restricted_to_profile_id: only that profile may use the code
--    (POS refuses it for anyone else; enforced server-side by a trigger on
--    sales). discounts.include_rnp: the % also covers RNP service lines and
--    their comisiones (only allowed on a restricted code). Existing codes:
--    both columns NULL/false → behaviour unchanged.
-- 2. CODY: percent 100, restricted to Cody Howell's admin profile, includes
--    RNP lines, no expiry, unlimited uses (discounts has no expiry/usage
--    columns). Case-insensitive like every code (findDiscount uses ilike).
-- 3. RNP lines on such a sale are stored at the price actually charged ($0,
--    original_price kept), so every RNP report reads $0 income. Adjusted:
--    rnp_shift_summary reads charged amounts from sale_items (not the
--    amount sent to RNP), and a Fallida on a $0 line owes no refund.
--
-- Additive: two new columns, one new row, new guard triggers; the two RNP
-- functions are re-created with the same signatures.
-- ============================================================

-- 1. Columns ---------------------------------------------------------------
alter table public.discounts
  add column if not exists restricted_to_profile_id uuid references public.profiles(id) on delete cascade,
  add column if not exists include_rnp boolean not null default false;

alter table public.discounts drop constraint if exists discounts_include_rnp_restricted;
alter table public.discounts add constraint discounts_include_rnp_restricted
  check (not include_rnp or restricted_to_profile_id is not null);

-- Only the restricted profile itself may create/alter a restricted code
-- (another admin can't re-point CODY to themselves or lift the
-- restriction). Migrations / service role (auth.uid() null) are allowed.
create or replace function public.discounts_restriction_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.restricted_to_profile_id is not null
     and old.restricted_to_profile_id is distinct from auth.uid() then
    raise exception 'Este código de descuento es personal y solo su titular puede modificarlo';
  end if;
  if new.restricted_to_profile_id is not null
     and new.restricted_to_profile_id is distinct from auth.uid() then
    raise exception 'Solo puedes restringir un código a tu propia cuenta';
  end if;
  return new;
end;
$$;

drop trigger if exists discounts_restriction_guard_trg on public.discounts;
create trigger discounts_restriction_guard_trg
  before insert or update on public.discounts
  for each row execute function public.discounts_restriction_guard();

-- 2. CODY -------------------------------------------------------------------
insert into public.discounts (org_id, code, type, value, restricted_to_profile_id, include_rnp)
select p.org_id, 'CODY', 'percent', 100, p.id, true
from public.profiles p
where p.id = '191ccb42-f264-4d32-a36f-0b15eadbdb02'
  and p.role = 'admin'
  and not exists (select 1 from public.discounts d where d.org_id = p.org_id and lower(d.code) = 'cody');

-- 3. Server-side guard on sales: a restricted code can only be on a sale
--    made by its owner (covers POS, customer-app orders and direct API).
create or replace function public.sales_restricted_discount_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.discount_code is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.discount_code is not distinct from old.discount_code then
    return new;
  end if;
  select d.restricted_to_profile_id into v_owner
  from public.discounts d
  where d.org_id = new.org_id
    and lower(d.code) = lower(new.discount_code)
    and d.restricted_to_profile_id is not null
  limit 1;
  if v_owner is not null and v_owner is distinct from auth.uid() then
    raise exception 'Código de descuento no autorizado para este usuario';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_restricted_discount_guard_trg on public.sales;
create trigger sales_restricted_discount_guard_trg
  before insert or update on public.sales
  for each row execute function public.sales_restricted_discount_guard();

-- 4. Corte de caja: RNP amounts = what the customer was CHARGED (sale_items),
--    not what was sent to RNP (rnp_transactions.amount/fee). Identical for
--    normal sales; $0 for CODY sales. Same signature and keys as before.
create or replace function public.rnp_shift_summary(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
  v_out jsonb;
begin
  if not public.is_org_staff() then
    raise exception 'No autorizado';
  end if;
  select * into v_shift from public.shifts where id = p_shift_id;
  if not found or v_shift.org_id is distinct from public.get_my_org_id() then
    raise exception 'Turno no encontrado';
  end if;

  with ops as (
    select t.*, s.payment_method as sale_payment_method,
      coalesce(li.service_amt, 0) as charged_amount,
      coalesce(li.fee_amt, 0) as charged_fee
    from public.rnp_transactions t
    join public.sales s on s.id = coalesce(t.sale_id, (select si.sale_id from public.sale_items si where si.rnp_op_id = t.op_id limit 1))
    left join lateral (
      select
        sum(si.price * si.quantity) filter (where not public.rnp_is_fee_line(si.name)) as service_amt,
        sum(si.price * si.quantity) filter (where public.rnp_is_fee_line(si.name)) as fee_amt
      from public.sale_items si
      where si.sale_id = s.id and si.rnp_op_id = t.op_id
    ) li on true
    where t.shift_id = p_shift_id
      and t.method in ('realizarRecarga', 'realizarServicio')
      and coalesce(s.voided, false) = false
  ), live as (
    select * from ops where status in ('aprobada', 'pendiente', 'enviando')
  )
  select jsonb_build_object(
    'count', (select count(*) from live),
    'pending_count', (select count(*) from live where status in ('pendiente', 'enviando')),
    'services_amount', (select coalesce(sum(charged_amount), 0) from live),
    'fees_amount', (select coalesce(sum(charged_fee), 0) from live),
    'services_cash', (select coalesce(sum(charged_amount), 0) from live where sale_payment_method is distinct from 'card'),
    'fees_cash', (select coalesce(sum(charged_fee), 0) from live where sale_payment_method is distinct from 'card'),
    'services_card', (select coalesce(sum(charged_amount), 0) from live where sale_payment_method = 'card'),
    'fees_card', (select coalesce(sum(charged_fee), 0) from live where sale_payment_method = 'card'),
    'by_category', (select coalesce(jsonb_object_agg(category, jsonb_build_object('count', n, 'amount', a, 'fees', f)), '{}'::jsonb)
                    from (select category, count(*) n, sum(charged_amount) a, coalesce(sum(charged_fee), 0) f from live group by category) c),
    'fallidas_count', (select count(*) from ops where resolution = 'fallida'),
    'fallidas_amount', (select coalesce(sum(refund_amount), 0) from ops where resolution = 'fallida'),
    'cash_add_back', (select coalesce(sum(refund_amount), 0) from ops
                      where resolution = 'fallida' and refund_method = 'efectivo'
                        and not (refund_status = 'devuelto' and refund_shift_id = p_shift_id)),
    'cash_refunds_out', (select coalesce(sum(t.refund_amount), 0) from public.rnp_transactions t
                         where t.refund_shift_id = p_shift_id and t.refund_status = 'devuelto'
                           and t.refund_method = 'efectivo' and t.shift_id is distinct from p_shift_id)
  ) into v_out;
  return v_out;
end;
$$;

-- 5. Fallida on a $0 (CODY) line owes nothing: refund = what was charged on
--    the sale; refund_status/method stay NULL when it is $0. Same signature.
create or replace function public.rnp_resolve_pending(
  p_id uuid,
  p_resolution text,
  p_autorizacion text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rnp_transactions%rowtype;
  v_name text;
  v_sale public.sales%rowtype;
  v_sale_id uuid;
  v_lines numeric := 0;
  v_fee_lines numeric := 0;
  v_has_sale boolean := false;
  v_refund numeric := 0;
  v_pay_id uuid;
  v_aut text := nullif(btrim(coalesce(p_autorizacion, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede resolver operaciones pendientes';
  end if;
  if p_resolution not in ('aprobada', 'fallida') then
    raise exception 'Resolución inválida';
  end if;

  select * into v_row from public.rnp_transactions where id = p_id for update;
  if not found or v_row.org_id is distinct from public.get_my_org_id() then
    raise exception 'Operación no encontrada';
  end if;
  if v_row.method not in ('realizarRecarga', 'realizarServicio')
     or v_row.status not in ('pendiente', 'enviando')
     or v_row.resolution is not null then
    raise exception 'La operación no está pendiente';
  end if;
  -- 'enviando' younger than 3 minutes may still be in flight (90 s timeout).
  if v_row.status = 'enviando' and v_row.created_at > now() - interval '3 minutes' then
    raise exception 'La operación aún se está enviando. Espera unos minutos.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Nota demasiado larga';
  end if;

  select coalesce(full_name, '') into v_name from public.profiles where id = auth.uid();

  if p_resolution = 'aprobada' then
    if v_aut is null or length(v_aut) > 60 then
      raise exception 'Captura el folio / autorización del portal RNP';
    end if;
    update public.rnp_transactions set
      status = 'aprobada',
      autorizacion = v_aut,
      resolution = 'aprobada',
      resolved_by = auth.uid(),
      resolved_by_name = v_name,
      resolved_at = now(),
      resolution_note = v_note,
      sale_id = coalesce(sale_id, (select si.sale_id from public.sale_items si where si.rnp_op_id = v_row.op_id limit 1)),
      completed_at = coalesce(completed_at, now())
    where id = p_id;

    insert into public.audit_log (org_id, user_id, user_name, user_role, location_id, action, details)
    values (v_row.org_id, auth.uid(), v_name, 'admin', v_row.location_id, 'RNP_PENDIENTE_RESUELTA',
      format('Aprobada: %s %s …%s %s | aut %s%s', v_row.category, coalesce(v_row.carrier, ''),
        right(coalesce(v_row.phone, ''), 4), v_row.amount, v_aut, coalesce(' | ' || v_note, '')));
    return jsonb_build_object('ok', true, 'resolution', 'aprobada');
  end if;

  -- Fallida: take the service line + its comisión off the sale's income.
  v_sale_id := v_row.sale_id;
  if v_sale_id is null and v_row.op_id is not null then
    select si.sale_id into v_sale_id from public.sale_items si where si.rnp_op_id = v_row.op_id limit 1;
  end if;
  if v_sale_id is not null then
    select * into v_sale from public.sales where id = v_sale_id for update;
  end if;

  if v_sale.id is not null and coalesce(v_sale.voided, false) = false then
    v_has_sale := true;
    select coalesce(sum(si.price * si.quantity), 0) into v_lines
    from public.sale_items si
    where si.sale_id = v_sale.id and si.rnp_op_id = v_row.op_id;

    select coalesce(sum(si.price * si.quantity), 0) into v_fee_lines
    from public.sale_items si
    where si.sale_id = v_sale.id and si.rnp_op_id = v_row.op_id and public.rnp_is_fee_line(si.name);

    if v_lines > 0 then
      -- Cashier points: the service amount never earned points
      -- (rnp_adjust at insert); the refunded comisión stops earning too.
      if v_sale.shift_id is not null and floor(v_fee_lines) > 0 then
        insert into public.shift_point_events (org_id, shift_id, kind, sale_id, points)
        values (v_sale.org_id, v_sale.shift_id, 'rnp_adjust', v_sale.id, -floor(v_fee_lines)::int);
      end if;

      update public.sale_items
        set original_price = coalesce(original_price, price), price = 0
      where sale_id = v_sale.id and rnp_op_id = v_row.op_id;

      update public.sales
        set total = round(coalesce(total, 0) - v_lines, 2),
            subtotal = round(coalesce(subtotal, 0) - v_lines, 2)
      where id = v_sale.id;

      -- RNP tickets are single-payment (cash or card): reduce that payment.
      select sp.id into v_pay_id from public.sale_payments sp
      where sp.sale_id = v_sale.id
      order by (sp.payment_method = v_sale.payment_method) desc, sp.amount desc
      limit 1;
      if v_pay_id is not null then
        update public.sale_payments set amount = round(amount - v_lines, 2) where id = v_pay_id;
      end if;
    end if;
  end if;

  -- Refund = what the customer was charged for these lines on the sale
  -- ($0 on an owner test sale with code CODY → nothing to return). Only
  -- an op with no sale at all falls back to amount + comisión.
  v_refund := case when v_has_sale then v_lines else round(coalesce(v_row.amount, 0) + coalesce(v_row.fee, 0), 2) end;

  update public.rnp_transactions set
    status = 'rechazada',
    resolution = 'fallida',
    resolved_by = auth.uid(),
    resolved_by_name = v_name,
    resolved_at = now(),
    resolution_note = v_note,
    sale_id = coalesce(sale_id, v_sale.id),
    refund_amount = v_refund,
    refund_status = case when v_refund > 0 then 'por_devolver' else null end,
    refund_method = case when v_refund <= 0 then null when v_sale.payment_method = 'card' then 'tarjeta' else 'efectivo' end,
    completed_at = coalesce(completed_at, now())
  where id = p_id;

  insert into public.audit_log (org_id, user_id, user_name, user_role, location_id, action, details)
  values (v_row.org_id, auth.uid(), v_name, 'admin', v_row.location_id, 'RNP_PENDIENTE_RESUELTA',
    format('Fallida: %s %s …%s %s + comisión %s | devolver %s%s', v_row.category, coalesce(v_row.carrier, ''),
      right(coalesce(v_row.phone, ''), 4), v_row.amount, coalesce(v_row.fee, 0),
      v_refund,
      coalesce(' | ' || v_note, '')));

  return jsonb_build_object('ok', true, 'resolution', 'fallida',
    'refund_amount', v_refund,
    'sale_adjusted', v_lines > 0);
end;
$$;

