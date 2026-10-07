-- ============================================================
-- PUNTOS POR TURNO / Admin KPIs
-- ============================================================
-- Gamificación del equipo por turno:
--  * Ventas en mostrador: 1 punto por cada $1 MXN (floor del total),
--    automático vía trigger sobre sales (solo ventas con shift_id).
--  * Anulaciones y devoluciones del MISMO DÍA (hora CDMX) restan los
--    puntos que la venta había generado; las de otro día no tocan el
--    historial del turno.
--  * Actividades manuales (pitch membresía, reseñas Google, volantes,
--    llamadas de seguimiento, A-Frame/banner) se guardan como CONTADOR
--    por (turno, actividad) — autosave desde el POS — valoradas en
--    point_activity_types.
--  * Vista shift_points_summary alimenta la barra PUNTOS del POS y el
--    módulo KPIs de Admin. RLS = aislamiento por org (patrón lost_sales).
-- ============================================================

create table if not exists public.point_activity_types (
  key text primary key,
  label text not null,
  points int not null check (points > 0),
  max_per_shift int,            -- null = sin tope; 1 = checkbox (hecho/no hecho)
  sort int not null default 0,
  active boolean not null default true
);

insert into public.point_activity_types (key, label, points, max_per_shift, sort) values
  ('pitch_membresia',     'Pitch de membresía',          5,  null, 1),
  ('resena_google',       'Solicitud de reseña Google',  5,  null, 2),
  ('volantes',            'Volantes entregados',         5,  null, 3),
  ('llamada_seguimiento', 'Llamada de seguimiento',      10, null, 4),
  ('aframe_banner',       'A-Frame y banner actualizado', 25, 1,    5)
on conflict (key) do nothing;

alter table public.point_activity_types enable row level security;

drop policy if exists "point_activity_types_staff_read" on public.point_activity_types;
create policy "point_activity_types_staff_read" on public.point_activity_types
  for select using (is_org_staff());

-- ── Ledger de puntos por ventas (y reversas del mismo día) ────────────

create table if not exists public.shift_point_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete cascade,
  kind text not null check (kind in ('sale', 'void_reversal', 'return_reversal')),
  sale_id uuid references sales(id) on delete cascade,
  return_id uuid references returns(id) on delete cascade,
  points int not null,
  created_at timestamptz not null default now()
);

create index if not exists shift_point_events_shift_idx on public.shift_point_events(shift_id);
create index if not exists shift_point_events_org_idx on public.shift_point_events(org_id, created_at desc);

-- Idempotencia: una sola fila 'sale' por venta, una reversa de anulación
-- por venta y una reversa por devolución (los reintentos no duplican).
create unique index if not exists shift_point_events_sale_uidx
  on public.shift_point_events(sale_id) where kind = 'sale';
create unique index if not exists shift_point_events_void_uidx
  on public.shift_point_events(sale_id) where kind = 'void_reversal';
create unique index if not exists shift_point_events_return_uidx
  on public.shift_point_events(return_id) where kind = 'return_reversal';

alter table public.shift_point_events enable row level security;

drop policy if exists "shift_point_events_org_isolation" on public.shift_point_events;
create policy "shift_point_events_org_isolation" on public.shift_point_events
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

-- ── Contadores manuales por turno/actividad (autosave desde POS) ──────

create table if not exists public.shift_activity_counts (
  shift_id uuid not null references shifts(id) on delete cascade,
  activity text not null references public.point_activity_types(key),
  org_id uuid not null references organizations(id) on delete cascade,
  count int not null default 0 check (count >= 0),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (shift_id, activity)
);

alter table public.shift_activity_counts enable row level security;

drop policy if exists "shift_activity_counts_org_isolation" on public.shift_activity_counts;
create policy "shift_activity_counts_org_isolation" on public.shift_activity_counts
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

-- ── Triggers de puntos automáticos ────────────────────────────────────

-- +floor(total) al cobrar una venta ligada a turno.
create or replace function public.trg_sale_points()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shift_id is not null and coalesce(new.voided, false) = false then
    insert into public.shift_point_events (org_id, shift_id, kind, sale_id, points)
    values (new.org_id, new.shift_id, 'sale', new.id, floor(coalesce(new.total, 0))::int)
    on conflict do nothing;
  end if;
  return new;
end $$;

-- Anulación del MISMO DÍA (CDMX): revierte los puntos netos que la venta
-- aún aporta (descuenta devoluciones ya aplicadas). De otro día: no-op.
create or replace function public.trg_sale_void_points()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_earned int;
  v_reversed int;
begin
  if new.voided = true and coalesce(old.voided, false) = false
     and new.shift_id is not null
     and (new.timestamp at time zone 'America/Mexico_City')::date
       = (coalesce(new.voided_at, now()) at time zone 'America/Mexico_City')::date then
    select e.points into v_earned
      from public.shift_point_events e
     where e.kind = 'sale' and e.sale_id = new.id;
    if v_earned is not null and v_earned > 0 then
      select coalesce(-sum(e.points), 0) into v_reversed
        from public.shift_point_events e
       where e.sale_id = new.id and e.kind in ('void_reversal', 'return_reversal');
      insert into public.shift_point_events (org_id, shift_id, kind, sale_id, points)
      values (new.org_id, new.shift_id, 'void_reversal', new.id, -(v_earned - v_reversed))
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

-- Devolución del MISMO DÍA (CDMX): resta floor(refund_total), topado a lo
-- que la venta aún aporta. De otro día: no-op.
create or replace function public.trg_return_points()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales%rowtype;
  v_earned int;
  v_reversed int;
  v_sub int;
begin
  select * into v_sale from public.sales where id = new.original_sale_id;
  if not found or v_sale.shift_id is null then
    return new;
  end if;
  if (v_sale.timestamp at time zone 'America/Mexico_City')::date
     <> (new.timestamp at time zone 'America/Mexico_City')::date then
    return new;
  end if;
  select e.points into v_earned
    from public.shift_point_events e
   where e.kind = 'sale' and e.sale_id = v_sale.id;
  if v_earned is null or v_earned <= 0 then
    return new;
  end if;
  select coalesce(-sum(e.points), 0) into v_reversed
    from public.shift_point_events e
   where e.sale_id = v_sale.id and e.kind in ('void_reversal', 'return_reversal');
  v_sub := least(floor(coalesce(new.refund_total, 0))::int, v_earned - v_reversed);
  if v_sub > 0 then
    insert into public.shift_point_events (org_id, shift_id, kind, sale_id, return_id, points)
    values (v_sale.org_id, v_sale.shift_id, 'return_reversal', v_sale.id, new.id, -v_sub)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists sale_points_insert_trg on public.sales;
create trigger sale_points_insert_trg
  after insert on public.sales
  for each row execute function public.trg_sale_points();

drop trigger if exists sale_points_void_trg on public.sales;
create trigger sale_points_void_trg
  after update of voided on public.sales
  for each row execute function public.trg_sale_void_points();

drop trigger if exists return_points_trg on public.returns;
create trigger return_points_trg
  after insert on public.returns
  for each row execute function public.trg_return_points();

-- ── RPC de autosave para el modal "+" del POS ─────────────────────────
-- Valida org, fija topes (A-Frame = checkbox 0/1) y hace upsert del
-- contador. Idempotente: el POS manda el valor absoluto, no deltas.
create or replace function public.set_shift_activity_count(p_shift_id uuid, p_activity text, p_count int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shift public.shifts%rowtype;
  v_type public.point_activity_types%rowtype;
  v_count int;
  v_row public.shift_activity_counts%rowtype;
begin
  select * into v_shift from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'Turno no encontrado';
  end if;
  if v_shift.org_id <> get_my_org_id() then
    raise exception 'No autorizado';
  end if;
  select * into v_type from public.point_activity_types where key = p_activity and active;
  if not found then
    raise exception 'Actividad desconocida';
  end if;
  v_count := greatest(0, coalesce(p_count, 0));
  if v_type.max_per_shift is not null then
    v_count := least(v_count, v_type.max_per_shift);
  end if;
  insert into public.shift_activity_counts (shift_id, activity, org_id, count, updated_by, updated_at)
  values (p_shift_id, p_activity, v_shift.org_id, v_count, auth.uid(), now())
  on conflict (shift_id, activity)
  do update set count = excluded.count,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

grant execute on function public.set_shift_activity_count(uuid, text, int) to authenticated;

-- ── Vista de resumen por turno (POS barra + Admin KPIs) ───────────────
create or replace view public.shift_points_summary as
with ev as (
  select shift_id, sum(points) as sales_points
  from public.shift_point_events
  group by shift_id
),
ac as (
  select c.shift_id,
         sum(c.count * t.points) as activity_points,
         jsonb_object_agg(c.activity, c.count) as activity_counts
  from public.shift_activity_counts c
  join public.point_activity_types t on t.key = c.activity
  group by c.shift_id
)
select
  sh.id as shift_id,
  sh.org_id,
  sh.location_id,
  sh.opened_by as cashier_id,
  sh.opened_by_name as cashier_name,
  sh.opened_at,
  sh.closed_at,
  sh.status,
  coalesce(ev.sales_points, 0)::int as sales_points,
  coalesce(ac.activity_points, 0)::int as activity_points,
  coalesce(ac.activity_counts, '{}'::jsonb) as activity_counts,
  (coalesce(ev.sales_points, 0) + coalesce(ac.activity_points, 0))::int as total_points
from public.shifts sh
left join ev on ev.shift_id = sh.id
left join ac on ac.shift_id = sh.id;

-- ── Realtime para la barra viva del POS ───────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shift_point_events'
  ) then
    alter publication supabase_realtime add table public.shift_point_events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shift_activity_counts'
  ) then
    alter publication supabase_realtime add table public.shift_activity_counts;
  end if;
end $$;

-- VERIFICACIÓN (manual):
-- select * from shift_points_summary limit 5;
-- select * from point_activity_types order by sort;
