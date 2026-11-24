-- ============================================================
-- MIGRATION: Servicios RNP — pendientes, corte de caja y saldos (2026-11-24)
--
-- 1. Resolución manual de operaciones PENDIENTES (RNP no tiene método de
--    consulta de estatus): el admin las marca Aprobada (folio/autorización
--    del portal RNP › Reportes) o Fallida (se debe devolver monto + comisión
--    al cliente). Quién y cuándo queda en la fila (congelado) y en audit_log.
--    Fallida quita la línea de servicio + su comisión del ingreso de la venta
--    (precio 0 en sale_items, original_price conservado; total, subtotal y el
--    pago de la venta se reducen), igual que una línea rechazada en caja.
-- 2. Devolución entregada: efectivo (desde la caja de un turno abierto en la
--    sucursal) o reverso en terminal. rnp_shift_summary() da al corte de caja
--    las líneas RNP y los ajustes de efectivo para que la caja cuadre.
-- 3. rnp_balance: último saldo conocido (obtenerSaldo o NuevoSaldo tras cada
--    venta; sin llamadas extra a RNP) + umbral de alerta configurable.
--
-- Additive: new nullable columns, a new table and new functions. The guard
-- trigger function is extended (stricter), never relaxed.
-- ============================================================

-- 1. Resolution + refund columns ----------------------------------------
alter table public.rnp_transactions
  add column if not exists resolution text check (resolution is null or resolution in ('aprobada', 'fallida')),
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolved_by_name text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_note text,
  add column if not exists refund_amount numeric(10,2),
  add column if not exists refund_status text check (refund_status is null or refund_status in ('por_devolver', 'devuelto')),
  add column if not exists refund_method text check (refund_method is null or refund_method in ('efectivo', 'tarjeta')),
  add column if not exists refund_shift_id uuid references public.shifts(id) on delete set null,
  add column if not exists refunded_by uuid references public.profiles(id) on delete set null,
  add column if not exists refunded_by_name text,
  add column if not exists refunded_at timestamptz;

create index if not exists rnp_transactions_pending_idx on public.rnp_transactions (org_id, created_at)
  where status in ('pendiente', 'enviando') and method in ('realizarRecarga', 'realizarServicio');
create index if not exists rnp_transactions_refund_shift_idx on public.rnp_transactions (refund_shift_id) where refund_shift_id is not null;
create index if not exists rnp_transactions_shift_idx on public.rnp_transactions (shift_id) where shift_id is not null;

-- Guard: same rules as before, plus a resolution and a delivered refund
-- are final.
create or replace function public.rnp_transactions_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'rnp_transactions es una bitácora: no se puede borrar';
  end if;
  if new.org_id is distinct from old.org_id
     or new.op_id is distinct from old.op_id
     or new.method is distinct from old.method
     or new.category is distinct from old.category
     or new.carrier is distinct from old.carrier
     or new.product_name is distinct from old.product_name
     or new.phone is distinct from old.phone
     or new.amount is distinct from old.amount
     or new.fee is distinct from old.fee
     or new.request_xml is distinct from old.request_xml
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'rnp_transactions: los datos de la petición no se pueden modificar';
  end if;
  -- A sale link, once set, is permanent.
  if old.sale_id is not null and new.sale_id is distinct from old.sale_id then
    raise exception 'rnp_transactions: la venta vinculada no se puede cambiar';
  end if;
  -- A manual resolution is final.
  if old.resolution is not null and (
       new.resolution is distinct from old.resolution
    or new.resolved_by is distinct from old.resolved_by
    or new.resolved_at is distinct from old.resolved_at
    or new.status is distinct from old.status
    or new.autorizacion is distinct from old.autorizacion
    or new.refund_amount is distinct from old.refund_amount
    or new.refund_method is distinct from old.refund_method) then
    raise exception 'rnp_transactions: la resolución ya fue registrada';
  end if;
  -- A delivered refund is final.
  if old.refund_status = 'devuelto' and (
       new.refund_status is distinct from old.refund_status
    or new.refund_shift_id is distinct from old.refund_shift_id
    or new.refunded_by is distinct from old.refunded_by
    or new.refunded_at is distinct from old.refunded_at) then
    raise exception 'rnp_transactions: la devolución ya fue registrada';
  end if;
  return new;
end;
$$;

-- Fee lines are written by the POS as "Comisión servicio — <categoría>".
create or replace function public.rnp_is_fee_line(p_name text)
returns boolean
language sql
immutable
as $$ select coalesce(p_name, '') ilike 'Comisi_n servicio%' $$;

-- 2. Resolve a pending operation (admin only) ----------------------------
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

  update public.rnp_transactions set
    status = 'rechazada',
    resolution = 'fallida',
    resolved_by = auth.uid(),
    resolved_by_name = v_name,
    resolved_at = now(),
    resolution_note = v_note,
    sale_id = coalesce(sale_id, v_sale.id),
    refund_amount = case when v_lines > 0 then v_lines else round(coalesce(amount, 0) + coalesce(fee, 0), 2) end,
    refund_status = 'por_devolver',
    refund_method = case when v_sale.payment_method = 'card' then 'tarjeta' else 'efectivo' end,
    completed_at = coalesce(completed_at, now())
  where id = p_id;

  insert into public.audit_log (org_id, user_id, user_name, user_role, location_id, action, details)
  values (v_row.org_id, auth.uid(), v_name, 'admin', v_row.location_id, 'RNP_PENDIENTE_RESUELTA',
    format('Fallida: %s %s …%s %s + comisión %s | devolver %s%s', v_row.category, coalesce(v_row.carrier, ''),
      right(coalesce(v_row.phone, ''), 4), v_row.amount, coalesce(v_row.fee, 0),
      case when v_lines > 0 then v_lines else round(coalesce(v_row.amount, 0) + coalesce(v_row.fee, 0), 2) end,
      coalesce(' | ' || v_note, '')));

  return jsonb_build_object('ok', true, 'resolution', 'fallida',
    'refund_amount', case when v_lines > 0 then v_lines else round(coalesce(v_row.amount, 0) + coalesce(v_row.fee, 0), 2) end,
    'sale_adjusted', v_lines > 0);
end;
$$;

-- 3. Record the refund as delivered (admin only) --------------------------
-- Efectivo must name an OPEN shift (the drawer the money leaves from);
-- tarjeta (reverso en terminal) touches no drawer.
create or replace function public.rnp_mark_refunded(p_id uuid, p_shift_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rnp_transactions%rowtype;
  v_shift public.shifts%rowtype;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede registrar devoluciones';
  end if;
  select * into v_row from public.rnp_transactions where id = p_id for update;
  if not found or v_row.org_id is distinct from public.get_my_org_id() then
    raise exception 'Operación no encontrada';
  end if;
  if v_row.resolution is distinct from 'fallida' or v_row.refund_status is distinct from 'por_devolver' then
    raise exception 'No hay devolución pendiente para esta operación';
  end if;

  if v_row.refund_method = 'efectivo' then
    if p_shift_id is null then
      raise exception 'Elige el turno abierto de cuya caja sale el efectivo';
    end if;
    select * into v_shift from public.shifts where id = p_shift_id;
    if not found or v_shift.org_id is distinct from v_row.org_id or v_shift.status is distinct from 'open' then
      raise exception 'El turno elegido no está abierto';
    end if;
  end if;

  select coalesce(full_name, '') into v_name from public.profiles where id = auth.uid();
  update public.rnp_transactions set
    refund_status = 'devuelto',
    refund_shift_id = case when v_row.refund_method = 'efectivo' then p_shift_id else null end,
    refunded_by = auth.uid(),
    refunded_by_name = v_name,
    refunded_at = now()
  where id = p_id;

  insert into public.audit_log (org_id, user_id, user_name, user_role, location_id, action, details)
  values (v_row.org_id, auth.uid(), v_name, 'admin', coalesce(v_shift.location_id, v_row.location_id), 'RNP_DEVOLUCION',
    format('Devolución RNP entregada (%s): %s …%s %s%s', v_row.refund_method, coalesce(v_row.carrier, ''),
      right(coalesce(v_row.phone, ''), 4), v_row.refund_amount,
      case when v_shift.id is not null then ' | turno de ' || coalesce(v_shift.opened_by_name, '') else '' end));
  return jsonb_build_object('ok', true);
end;
$$;

-- 4. Corte de caja: RNP lines + drawer adjustments for one shift ----------
-- Any active org staff (the cashier closing the shift cannot read
-- rnp_transactions directly). Returns aggregates only.
--   cash_add_back    : Fallida ops sold in cash on THIS shift whose refund
--                      did not leave THIS drawer yet (money still in it;
--                      the sale itself was already reduced).
--   cash_refunds_out : cash refunds paid from THIS drawer for ops sold on
--                      OTHER shifts.
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
    select t.*, s.payment_method as sale_payment_method
    from public.rnp_transactions t
    join public.sales s on s.id = coalesce(t.sale_id, (select si.sale_id from public.sale_items si where si.rnp_op_id = t.op_id limit 1))
    where t.shift_id = p_shift_id
      and t.method in ('realizarRecarga', 'realizarServicio')
      and coalesce(s.voided, false) = false
  ), live as (
    select * from ops where status in ('aprobada', 'pendiente', 'enviando')
  )
  select jsonb_build_object(
    'count', (select count(*) from live),
    'pending_count', (select count(*) from live where status in ('pendiente', 'enviando')),
    'services_amount', (select coalesce(sum(amount), 0) from live),
    'fees_amount', (select coalesce(sum(fee), 0) from live),
    'services_cash', (select coalesce(sum(amount), 0) from live where sale_payment_method is distinct from 'card'),
    'fees_cash', (select coalesce(sum(fee), 0) from live where sale_payment_method is distinct from 'card'),
    'services_card', (select coalesce(sum(amount), 0) from live where sale_payment_method = 'card'),
    'fees_card', (select coalesce(sum(fee), 0) from live where sale_payment_method = 'card'),
    'by_category', (select coalesce(jsonb_object_agg(category, jsonb_build_object('count', n, 'amount', a, 'fees', f)), '{}'::jsonb)
                    from (select category, count(*) n, sum(amount) a, coalesce(sum(fee), 0) f from live group by category) c),
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

-- 5. Balances + alert threshold -------------------------------------------
create table if not exists public.rnp_balance (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  saldo_recargas numeric(12,2),
  saldo_servicios numeric(12,2),
  recargas_at timestamptz,
  servicios_at timestamptz,
  recargas_source text,   -- 'obtenerSaldo' | 'NuevoSaldo'
  servicios_source text,
  low_balance_threshold numeric(10,2) not null default 200 check (low_balance_threshold >= 0 and low_balance_threshold <= 100000),
  updated_at timestamptz not null default now()
);
alter table public.rnp_balance enable row level security;
revoke all on public.rnp_balance from anon;
revoke insert, update, delete, truncate on public.rnp_balance from authenticated;
drop policy if exists rnp_balance_admin_read on public.rnp_balance;
create policy rnp_balance_admin_read on public.rnp_balance
  for select using (is_admin() and org_id = get_my_org_id());

create or replace function public.rnp_set_low_balance_threshold(p_threshold numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_my_org_id();
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el umbral';
  end if;
  if p_threshold is null or p_threshold < 0 or p_threshold > 100000 then
    raise exception 'Umbral inválido (0 – 100,000)';
  end if;
  insert into public.rnp_balance (org_id, low_balance_threshold) values (v_org, round(p_threshold, 2))
  on conflict (org_id) do update set low_balance_threshold = excluded.low_balance_threshold, updated_at = now();
  select coalesce(full_name, '') into v_name from public.profiles where id = auth.uid();
  insert into public.audit_log (org_id, user_id, user_name, user_role, action, details)
  values (v_org, auth.uid(), v_name, 'admin', 'RNP_UMBRAL_SALDO', format('Umbral de alerta de saldo RNP: %s', round(p_threshold, 2)));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.rnp_resolve_pending(uuid, text, text, text) from public, anon;
revoke all on function public.rnp_mark_refunded(uuid, uuid) from public, anon;
revoke all on function public.rnp_shift_summary(uuid) from public, anon;
revoke all on function public.rnp_set_low_balance_threshold(numeric) from public, anon;
grant execute on function public.rnp_resolve_pending(uuid, text, text, text) to authenticated;
grant execute on function public.rnp_mark_refunded(uuid, uuid) to authenticated;
grant execute on function public.rnp_shift_summary(uuid) to authenticated;
grant execute on function public.rnp_set_low_balance_threshold(numeric) to authenticated;

-- 6. Cashier points (KPIs) ------------------------------------------------
-- trg_sale_points awards floor(sales.total) at insert, which includes the
-- RNP pass-through amount (a $1,500 bill payment is not $1,500 of store
-- sales). The service line's amount is taken back as an 'rnp_adjust'
-- event when its sale_item is inserted; the comisión keeps its points.
alter table public.shift_point_events drop constraint if exists shift_point_events_kind_check;
alter table public.shift_point_events add constraint shift_point_events_kind_check
  check (kind in ('sale', 'void_reversal', 'return_reversal', 'rnp_adjust'));

create or replace function public.trg_sale_item_rnp_points()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales%rowtype;
  v_pts int;
begin
  if new.rnp_op_id is null or public.rnp_is_fee_line(new.name) then
    return new;
  end if;
  select * into v_sale from public.sales where id = new.sale_id;
  if not found or v_sale.shift_id is null or coalesce(v_sale.voided, false) then
    return new;
  end if;
  v_pts := floor(coalesce(new.price, 0) * coalesce(new.quantity, 1))::int;
  if v_pts > 0 then
    insert into public.shift_point_events (org_id, shift_id, kind, sale_id, points)
    values (v_sale.org_id, v_sale.shift_id, 'rnp_adjust', v_sale.id, -v_pts);
  end if;
  return new;
end $$;

drop trigger if exists sale_items_rnp_points_trg on public.sale_items;
create trigger sale_items_rnp_points_trg
  after insert on public.sale_items
  for each row execute function public.trg_sale_item_rnp_points();

-- 7. profit_report (Admin › Análisis › Ventas e Inventario › Utilidad) ----
-- The old view joined sales × sale_items × inventory and summed s.total
-- once per inventory line, so:
--   · RNP service amounts (pass-through, no cost row) showed as 100 % profit,
--   · sales with only RNP lines vanished (inner join),
--   · s.total was repeated once per item (revenue inflated on every
--     multi-item ticket), and total_sales counted item rows.
-- Same columns/types; revenue is now per sale, excludes the RNP service
-- amount (the comisión stays: it IS the store's income) and voided sales.
create or replace view public.profit_report with (security_invoker = true) as
with s as (
  select sa.id, date(sa."timestamp") as date, sa.total, sa.discount_value
  from public.sales sa
  where coalesce(sa.voided, false) = false
), rnp as (
  select si.sale_id, sum(si.price * si.quantity) as rnp_service
  from public.sale_items si
  where si.rnp_op_id is not null and not public.rnp_is_fee_line(si.name)
  group by si.sale_id
), cogs as (
  select si.sale_id, sum((si.quantity)::numeric * i.cost) as cost
  from public.sale_items si
  join public.inventory i on i.id = si.inventory_id
  group by si.sale_id
), per_sale as (
  select s.date, s.total - coalesce(rnp.rnp_service, 0) as revenue, s.discount_value, cogs.cost
  from s
  left join rnp on rnp.sale_id = s.id
  left join cogs on cogs.sale_id = s.id
)
select
  date,
  count(*) as total_sales,
  sum(revenue) as gross_revenue,
  sum(discount_value) as discounts,
  sum(cost) as cost_of_goods,
  (sum(revenue) - coalesce(sum(cost), 0::numeric)) as gross_profit,
  case
    when sum(revenue) > 0::numeric then round(((sum(revenue) - coalesce(sum(cost), 0::numeric)) / sum(revenue)) * 100::numeric, 2)
    else 0::numeric
  end as profit_margin_percent
from per_sale
group by date
order by date desc;
