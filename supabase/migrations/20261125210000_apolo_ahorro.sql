-- ============================================================
-- MIGRATION: App Apolo — Ahorro (2026-11-25)
--
-- 1. apolo_generic_search(org, query): "¿Hay genérico?" — products and their
--    linked equivalents (product_links) with real prices. OTC ONLY: the
--    online store never shows Rx-only products and medicines under receta
--    may not be advertised to the public (RIS/COFEPRIS); Rx stays at the
--    counter. Callable by the public app like the catalog.
-- 2. apolo_my_savings(): "Este mes ahorraste" for the logged-in customer,
--    from their own non-voided sales this month (America/Mexico_City):
--      membresía = MEMBRESIA ticket discounts + member-priced consultas
--      genéricos = (higher linked equivalent price − price paid) × qty
--                  for items that have a pricier linked equivalent
--                  (current inventory prices)
--      Monedas   = MONEDAS ticket discounts (rewards redeemed)
-- Read-only, additive.
-- ============================================================

create or replace function public.apolo_generic_search(p_org_id uuid, p_query text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_out jsonb;
begin
  if v_q is not null and length(v_q) > 80 then v_q := left(v_q, 80); end if;
  with otc as (
    select i.id, i.name, i.price, i.laboratorio, i.quantity
    from public.inventory i
    where i.org_id = p_org_id and coalesce(i.requires_prescription, false) = false
      and coalesce(i.controlled_group, '') = '' and i.price > 0
  ), pairs as (
    select l.product_a_id a, l.product_b_id b from public.product_links l where l.org_id = p_org_id
    union
    select l.product_b_id, l.product_a_id from public.product_links l where l.org_id = p_org_id
  ), groups as (
    select p.id, p.name, p.price, p.laboratorio, p.quantity,
      (select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'price', o.price, 'laboratorio', o.laboratorio, 'in_stock', o.quantity > 0) order by o.price)
         from pairs x join otc o on o.id = x.b where x.a = p.id) as alts,
      (select min(o.price) from pairs x join otc o on o.id = x.b where x.a = p.id) as min_alt
    from otc p
    where exists (select 1 from pairs x join otc o on o.id = x.b where x.a = p.id)
      and (v_q is null or p.name ilike '%' || v_q || '%')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'name', g.name, 'price', g.price, 'laboratorio', g.laboratorio, 'in_stock', g.quantity > 0,
           'alternatives', g.alts, 'saving', greatest(g.price - g.min_alt, 0))
         order by (g.price - g.min_alt) desc nulls last, g.name), '[]'::jsonb)
    into v_out
  from (select * from groups order by (price - min_alt) desc nulls last, name limit case when v_q is null then 5 else 15 end) g;
  return v_out;
end $$;

create or replace function public.apolo_my_savings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cust uuid := public.coins_my_customer_id();
  v_start timestamptz := (date_trunc('month', now() at time zone 'America/Mexico_City')) at time zone 'America/Mexico_City';
  v_member numeric := 0; v_member_items numeric := 0; v_generic numeric := 0; v_coins numeric := 0;
begin
  if v_cust is null then return jsonb_build_object('customer', false); end if;

  select coalesce(sum(s.discount_amount) filter (where s.discount_code = 'MEMBRESIA'), 0),
         coalesce(sum(s.discount_amount) filter (where s.discount_code = 'MONEDAS'), 0)
    into v_member, v_coins
  from public.sales s
  where s.customer_id = v_cust and coalesce(s.voided, false) = false and s.timestamp >= v_start;

  select coalesce(sum(greatest(coalesce(si.original_price, si.price) - si.price, 0) * si.quantity), 0) into v_member_items
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  join public.inventory i on i.id = si.inventory_id
  where s.customer_id = v_cust and coalesce(s.voided, false) = false and s.timestamp >= v_start
    and (coalesce(i.is_membership_consultation, false) or coalesce(i.is_membership_revision, false));

  select coalesce(sum(greatest(alt.max_price - si.price, 0) * si.quantity), 0) into v_generic
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  join lateral (
    select max(i2.price) max_price
    from public.product_links l
    join public.inventory i2 on i2.id = case when l.product_a_id = si.inventory_id then l.product_b_id else l.product_a_id end
    where si.inventory_id in (l.product_a_id, l.product_b_id)
  ) alt on alt.max_price is not null
  where s.customer_id = v_cust and coalesce(s.voided, false) = false and s.timestamp >= v_start
    and si.inventory_id is not null and si.price > 0;

  return jsonb_build_object('customer', true,
    'membership', round(v_member + v_member_items, 2), 'generics', round(v_generic, 2), 'coins', round(v_coins, 2),
    'total', round(v_member + v_member_items + v_generic + v_coins, 2));
end $$;

revoke all on function public.apolo_generic_search(uuid, text) from public;
grant execute on function public.apolo_generic_search(uuid, text) to anon, authenticated;
revoke all on function public.apolo_my_savings() from public, anon;
grant execute on function public.apolo_my_savings() to authenticated;
