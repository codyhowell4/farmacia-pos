-- ============================================================
-- BACKFILL: puntos de ventas históricas por turno
-- ============================================================
-- Los triggers de 20261007000000_shift_points.sql solo capturan
-- ventas NUEVAS. Este backfill replaya la MISMA lógica sobre el
-- historial completo de ventas con shift_id:
--  1) +floor(total) por cada venta ligada a turno.
--  2) Devoluciones del MISMO DÍA (CDMX): reversa topada a lo que
--     la venta aún aporta (con reparto acumulativo si hay varias
--     devoluciones sobre la misma venta).
--  3) Anulaciones del MISMO DÍA (CDMX): revierten lo que la venta
--     aún aporta. Anulaciones de otro día: no-op (regla acordada).
-- Idempotente: los índices únicos parciales de shift_point_events
-- + "on conflict do nothing" permiten re-ejecutar sin duplicar.
-- ============================================================

-- 1) Puntos por venta -------------------------------------------------
insert into public.shift_point_events (org_id, shift_id, kind, sale_id, points)
select s.org_id, s.shift_id, 'sale', s.id, floor(coalesce(s.total, 0))::int
from public.sales s
where s.shift_id is not null
on conflict do nothing;

-- 2) Reversas por devoluciones del mismo día --------------------------
with cand as (
  select r.id as return_id, s.id as sale_id, s.org_id, s.shift_id,
         r.timestamp as rtime,
         floor(coalesce(r.refund_total, 0))::int as refund_pts
  from public.returns r
  join public.sales s on s.id = r.original_sale_id
  where s.shift_id is not null
    and (s.timestamp at time zone 'America/Mexico_City')::date
      = (r.timestamp at time zone 'America/Mexico_City')::date
),
calc as (
  select c.*,
         (select e.points from public.shift_point_events e
           where e.kind = 'sale' and e.sale_id = c.sale_id) as earned,
         coalesce((select -sum(e.points) from public.shift_point_events e
           where e.sale_id = c.sale_id
             and e.kind in ('void_reversal', 'return_reversal')), 0) as already_reversed,
         coalesce(sum(c.refund_pts) over (
           partition by c.sale_id order by c.rtime, c.return_id
           rows between unbounded preceding and 1 preceding), 0) as prior_refund_pts
  from cand c
)
insert into public.shift_point_events (org_id, shift_id, kind, sale_id, return_id, points)
select org_id, shift_id, 'return_reversal', sale_id, return_id,
       -least(refund_pts, greatest(earned - already_reversed - prior_refund_pts, 0))
from calc
where earned is not null
  and least(refund_pts, greatest(earned - already_reversed - prior_refund_pts, 0)) > 0
on conflict do nothing;

-- 3) Reversas por anulaciones del mismo día ---------------------------
-- (después de devoluciones: la anulación solo revierte lo que queda)
with cand as (
  select s.id as sale_id, s.org_id, s.shift_id
  from public.sales s
  where s.voided and s.shift_id is not null
    and (s.timestamp at time zone 'America/Mexico_City')::date
      = (coalesce(s.voided_at, now()) at time zone 'America/Mexico_City')::date
)
insert into public.shift_point_events (org_id, shift_id, kind, sale_id, points)
select c.org_id, c.shift_id, 'void_reversal', c.sale_id,
       -(e0.earned - coalesce(rev.already_reversed, 0))
from cand c
join lateral (select e.points as earned from public.shift_point_events e
              where e.kind = 'sale' and e.sale_id = c.sale_id) e0 on true
left join lateral (select -sum(e.points) as already_reversed from public.shift_point_events e
                   where e.sale_id = c.sale_id
                     and e.kind in ('void_reversal', 'return_reversal')) rev on true
where e0.earned - coalesce(rev.already_reversed, 0) > 0
on conflict do nothing;

-- VERIFICACIÓN (manual):
-- select shift_id, sum(points) from shift_point_events group by shift_id;
-- select * from shift_points_summary order by opened_at desc limit 10;
