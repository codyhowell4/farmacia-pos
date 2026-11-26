-- ============================================================
-- MIGRATION: venta en línea — una sola regla para sitio, app y pedidos
-- (2026-11-26, aprobado por Cody tras revisión de medicamentos de receta)
--
-- 1. inventory.sell_online (default true): false = se vende en sucursal
--    pero nunca en línea (para presentaciones que pueden ser de venta
--    libre en mostrador pero que no queremos vender por internet).
-- 2. inventory_sold_online(inventory): la regla que antes vivía solo en
--    get_store_catalog (Rx, grupo controlado, servicios/membresías,
--    antibióticos/inyectables/consultas por nombre o departamento) + el
--    nuevo sell_online.
-- 3. get_store_catalog (sitio /tienda) usa esa función (mismo resultado
--    que antes + sell_online).
-- 4. place_store_order (sitio y app) rechaza todo lo que no cumpla la
--    regla, no solo Rx/controlado.
-- 5. store_catalog: vista para la tienda de la app con la misma regla
--    (antes la app leía inventory_catalog con solo existencia y Rx).
-- ============================================================

alter table public.inventory
  add column if not exists sell_online boolean not null default true;

comment on column public.inventory.sell_online is
  'false = no se muestra ni se acepta en la tienda en línea (sitio y app); en el POS se vende normal.';

create or replace function public.inventory_sold_online(i public.inventory)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(i.sell_online, true)
     and coalesce(i.requires_prescription, false) = false
     and i.controlled_group is null
     and coalesce(i.item_type, 'product') = 'product'
     and not coalesce(i.is_membership_consultation, false)
     and not coalesce(i.is_membership_revision, false)
     and not coalesce(i.is_membership_blood_pressure, false)
     and coalesce(i.department, '') !~* '(consul|conltorio|consutorio|laborator|membres|servicio|antibi|retroviral|antidepres|anticonvuls|epilep|grupo)'
     and coalesce(i.use, '') !~* '(antibi[oó]tico|laboratorio|consultorio)'
     and i.name !~* '^\s*(consulta|retiro|toma de|lavado|revisi[oó]n|aplicaci[oó]n|cultivo|tipo de sangre|curaci[oó]n de|sutura|inyecci[oó]n)'
     and i.name !~* '(inyectable|amoxicilina|azitromicina|ezitromicina|ciprofloxacino|cefalexina|ceftriaxona|clindamicina|claritromicina|doxiciclina|levofloxacino|nitrofuranto[ií]na|trimetoprima|sulfametoxazol|penicilina|ampicilina|dicloxacilina|gentamicina|eritromicina|fosfomicina|cefixima|cefuroxima|neomicina|metronidazol)'
$$;

CREATE OR REPLACE FUNCTION public.get_store_catalog(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cust uuid;
  v_disc numeric;
  v_discount numeric := 0;
  v_items jsonb;
begin
  if v_uid is not null then
    select id into v_cust from public.customers where profile_id = v_uid limit 1;
    if v_cust is not null then
      select discount_percent into v_disc
        from public.memberships
       where customer_id = v_cust and status = 'active'
       order by created_at desc
       limit 1;
      if found then
        v_discount := coalesce(v_disc, 10);
      else
        select m.discount_percent into v_disc
          from public.membership_members mm
          join public.memberships m on m.id = mm.membership_id
         where mm.claimed_user_id = v_uid
           and m.status = 'active'
         limit 1;
        if found then
          v_discount := coalesce(v_disc, 10);
        end if;
      end if;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'name', btrim(i.name),
           'use', nullif(btrim(coalesce(i.use, '')), ''),
           'department', nullif(btrim(coalesce(i.department, '')), ''),
           'image_url', i.image_url,
           'price', case when v_uid is not null then i.price end
         ) order by btrim(i.name)), '[]'::jsonb)
    into v_items
    from public.inventory i
   where i.org_id = p_org_id
     and i.quantity > 0
     and i.price > 0
     and public.inventory_sold_online(i);

  return jsonb_build_object(
    'signed_in', v_uid is not null,
    'is_customer', v_cust is not null,
    'discount_percent', v_discount,
    'items', v_items);
end
$function$;

CREATE OR REPLACE FUNCTION public.place_store_order(p_items jsonb, p_patient_name text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cust record;
  v_payment text;
  d jsonb;
  v_agg record;
  v_inv record;
  v_id uuid;
  v_qty integer;
  v_discount numeric := 0;
  v_disc numeric;
  v_unit numeric;
  v_line numeric;
  v_total numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_items_json jsonb := '[]'::jsonb;
  v_sale_id uuid;
begin
  -- 1. Expediente del cliente autenticado
  select id, org_id, full_name, curp into v_cust
    from public.customers
   where profile_id = auth.uid()
   limit 1;
  if v_cust.id is null then
    raise exception 'No se encontró expediente de cliente';
  end if;

  -- 2. Método de pago
  v_payment := coalesce(p_payment_method, 'cash');
  if v_payment not in ('cash','card') then
    raise exception 'Método de pago no válido';
  end if;

  -- 3. Validación de artículos: arreglo de 1-50 elementos, cada uno con
  --    inventory_id (uuid) y quantity (entero 1-20)
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Artículos inválidos';
  end if;
  for d in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(d) <> 'object' then
      raise exception 'Artículos inválidos';
    end if;
    begin
      v_id := (d->>'inventory_id')::uuid;
    exception when others then
      raise exception 'Artículos inválidos';
    end;
    if v_id is null then
      raise exception 'Artículos inválidos';
    end if;
    if (d->>'quantity') is null or (d->>'quantity') !~ '^\d+$' then
      raise exception 'Cantidad inválida';
    end if;
    v_qty := (d->>'quantity')::integer;
    if v_qty < 1 or v_qty > 20 then
      raise exception 'Cantidad inválida';
    end if;
  end loop;

  -- 4. Descuento de membresía: primero la membresía directa del cliente;
  --    si no hay, una membresía familiar reclamada por este usuario
  select discount_percent into v_disc
    from public.memberships
   where customer_id = v_cust.id and status = 'active'
   order by created_at desc
   limit 1;
  if found then
    v_discount := coalesce(v_disc, 10);
  else
    select m.discount_percent into v_disc
      from public.membership_members mm
      join public.memberships m on m.id = mm.membership_id
     where mm.claimed_user_id = auth.uid()
       and m.status = 'active'
     limit 1;
    if found then
      v_discount := coalesce(v_disc, 10);
    end if;
  end if;

  -- 5. Renglones agregados por artículo (los duplicados se fusionan, en el
  --    orden del arreglo): bloqueo de la fila, validaciones y precio SIEMPRE
  --    del servidor (inventory.price); jamás del payload del cliente
  for v_agg in
    select (t.value->>'inventory_id')::uuid as inv_id,
           sum((t.value->>'quantity')::integer) as qty
      from jsonb_array_elements(p_items) with ordinality as t(value, ord)
     group by 1
     order by min(t.ord)
  loop
    select id, name, price, quantity, requires_prescription, controlled_group
      into v_inv
      from public.inventory
     where id = v_agg.inv_id
     for update;
    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if v_inv.requires_prescription or v_inv.controlled_group is not null then
      raise exception 'Este producto requiere receta médica y no se vende en línea: %', v_inv.name;
    end if;
    -- Same online-sale rule as the website catalog and the app store
    -- (sell_online, antibiotics/injectables/services by name, etc.).
    if not exists (select 1 from public.inventory i
                    where i.id = v_agg.inv_id and public.inventory_sold_online(i)) then
      raise exception 'Este producto no está disponible para pedido en línea: %', v_inv.name;
    end if;
    if v_inv.quantity < v_agg.qty then
      raise exception 'Sin existencias suficientes: %', v_inv.name;
    end if;
    v_unit := round((v_inv.price * (1 - v_discount / 100.0))::numeric, 2);
    v_line := v_unit * v_agg.qty;
    v_total := v_total + v_line;
    v_lines := v_lines || jsonb_build_object(
      'inventory_id', v_agg.inv_id,
      'name', v_inv.name,
      'qty', v_agg.qty,
      'unit', v_unit,
      'prev_qty', v_inv.quantity);
    v_items_json := v_items_json || jsonb_build_object(
      'name', v_inv.name,
      'quantity', v_agg.qty,
      'unit_price', v_unit,
      'line_total', v_line);
  end loop;

  -- 6. Encabezado de la venta. Queda en 'processing': el trigger
  --    sales_processing_total_guard_trg recalcula los totales desde
  --    sale_items al completarse la venta — comportamiento esperado.
  insert into public.sales
    (org_id, customer_id, patient_name, patient_curp, payment_method,
     subtotal, total, status, voided, timestamp)
  values
    (v_cust.org_id, v_cust.id,
     coalesce(nullif(left(p_patient_name,200),''), v_cust.full_name),
     v_cust.curp, v_payment, v_total, v_total, 'processing', false, now())
  returning id into v_sale_id;

  -- 7-9. Detalle (nombre y precio unitario del servidor), salida de
  --    existencias y bitácora NOM en inventory_movements
  for d in select value from jsonb_array_elements(v_lines) loop
    v_id := (d->>'inventory_id')::uuid;
    v_qty := (d->>'qty')::integer;
    insert into public.sale_items (sale_id, inventory_id, name, quantity, price)
    values (v_sale_id, v_id, d->>'name', v_qty, (d->>'unit')::numeric);
    update public.inventory
       set quantity = quantity - v_qty,
           sales_count = coalesce(sales_count, 0) + v_qty,
           updated_at = now()
     where id = v_id;
    insert into public.inventory_movements
      (org_id, inventory_id, type, quantity_change, previous_quantity, new_quantity,
       reference_id, reference_type, reason, user_name)
    values
      (v_cust.org_id, v_id, 'sale', -v_qty,
       (d->>'prev_qty')::integer, (d->>'prev_qty')::integer - v_qty,
       v_sale_id, 'sale', d->>'name', 'tienda en línea');
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'total', v_total,
    'discount_percent', v_discount,
    'items', v_items_json);
end
$function$;

-- App store: same columns the app read from inventory_catalog, same rule
-- as the website. Owner-rights view like inventory_catalog.
create or replace view public.store_catalog as
select i.id, i.org_id, i.name, i.use, i.price, i.quantity, i.requires_prescription,
       i.category, i.image_url, i.barcode, i.low_stock_threshold, i.laboratorio, i.department
  from public.inventory i
 where i.quantity > 0
   and i.price > 0
   and public.inventory_sold_online(i);

revoke all on public.store_catalog from public, anon;
grant select on public.store_catalog to authenticated;
