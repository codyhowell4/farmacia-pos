-- Caducidad con la fecha de la Ciudad de México, no UTC.
-- current_date en la base es UTC: después de ~6 PM hora local ya es "mañana",
-- así que un producto en su último día válido se bloqueaba en caja y se
-- marcaba como caducado. Un producto se puede vender durante su fecha de
-- caducidad; queda bloqueado a partir del día siguiente (hora de CDMX).

CREATE OR REPLACE FUNCTION public.sale_items_prepare()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare inv record;
begin
  if new.inventory_id is not null then
    select requires_prescription, controlled_group, expiration_date
      into inv from public.inventory where id = new.inventory_id;
    if found then
      if inv.expiration_date is not null
         and inv.expiration_date < (now() at time zone 'America/Mexico_City')::date then
        raise exception 'Venta bloqueada: el artículo está caducado (caducidad %). Retírelo del piso y regístrelo como merma.', to_char(inv.expiration_date, 'DD/MM/YYYY');
      end if;
      new.requires_prescription := coalesce(inv.requires_prescription, false);
      new.controlled_group := inv.controlled_group;
    end if;
  end if;
  return new;
end
$function$;

-- Inteligencia de inventario: is_expired / days_until_expiry con la misma fecha local
CREATE OR REPLACE FUNCTION public.get_inventory_intelligence(p_org_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, org_id uuid, location_id uuid, name text, barcode text, use text, cost numeric, price numeric, quantity integer, low_stock_threshold integer, expiration_date date, requires_prescription boolean, warehouse_location text, created_at timestamp with time zone, updated_at timestamp with time zone, supplier_id uuid, supplier_name text, supplier_product_id uuid, lead_time_days integer, sold_30d bigint, sold_60d bigint, sold_90d bigint, returned_30d bigint, returned_60d bigint, returned_90d bigint, net_sold_30d bigint, net_sold_60d bigint, net_sold_90d bigint, avg_daily_sales_30 numeric, avg_daily_sales_60 numeric, avg_daily_sales_90 numeric, has_sufficient_data boolean, days_of_inventory numeric, safety_stock numeric, reorder_point numeric, recommended_qty integer, stockout_risk_score integer, is_expired boolean, days_until_expiry integer, inventory_value numeric, turnover_90d numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings inventory_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_settings
  FROM inventory_settings
  WHERE inventory_settings.org_id = p_org_id;
  
  IF v_settings IS NULL THEN
    v_settings.default_lead_time_days := 7;
    v_settings.critical_safety_stock_days := 7;
    v_settings.normal_safety_stock_days := 3;
  END IF;

  RETURN QUERY
  WITH
  sales_data AS (
    SELECT
      si.inventory_id,
      SUM(CASE WHEN sa.timestamp >= (CURRENT_DATE - INTERVAL '30 days')::timestamptz THEN si.quantity ELSE 0 END) AS s30,
      SUM(CASE WHEN sa.timestamp >= (CURRENT_DATE - INTERVAL '60 days')::timestamptz THEN si.quantity ELSE 0 END) AS s60,
      SUM(CASE WHEN sa.timestamp >= (CURRENT_DATE - INTERVAL '90 days')::timestamptz THEN si.quantity ELSE 0 END) AS s90
    FROM sale_items si
    JOIN sales sa ON sa.id = si.sale_id
    WHERE sa.timestamp >= (CURRENT_DATE - INTERVAL '90 days')::timestamptz
      AND sa.voided = false
      AND sa.org_id = p_org_id
      AND (p_location_id IS NULL OR sa.location_id = p_location_id)
    GROUP BY si.inventory_id
  ),
  calculated AS (
    SELECT
      i.id AS inv_id,
      i.org_id AS inv_org_id,
      i.location_id AS inv_location_id,
      i.name AS inv_name,
      i.barcode,
      i.use AS inv_use,
      i.cost AS inv_cost,
      i.price AS inv_price,
      i.quantity AS inv_quantity,
      i.low_stock_threshold,
      i.expiration_date,
      i.requires_prescription,
      i.warehouse_location,
      i.created_at AS inv_created_at,
      i.updated_at AS inv_updated_at,
      i.supplier_id,
      s.name AS supplier_name,
      sp.id AS supplier_product_id,
      COALESCE(sp.lead_time_days, v_settings.default_lead_time_days) AS lt_days,
      COALESCE(sd.s30, 0) AS sold_30,
      COALESCE(sd.s60, 0) AS sold_60,
      COALESCE(sd.s90, 0) AS sold_90,
      CASE WHEN COALESCE(sd.s30, 0) > 0 THEN true ELSE false END AS has_data,
      CASE
        WHEN i.requires_prescription THEN v_settings.critical_safety_stock_days
        ELSE v_settings.normal_safety_stock_days
      END AS ss_days,
      (i.expiration_date IS NOT NULL AND i.expiration_date < (now() AT TIME ZONE 'America/Mexico_City')::date) AS expired,
      CASE WHEN i.expiration_date IS NOT NULL
        THEN (i.expiration_date - (now() AT TIME ZONE 'America/Mexico_City')::date)::integer
        ELSE NULL
      END AS days_to_expiry
    FROM inventory i
    LEFT JOIN suppliers s ON s.id = i.supplier_id
    LEFT JOIN supplier_products sp ON sp.inventory_id = i.id AND sp.preferred = true
    LEFT JOIN sales_data sd ON sd.inventory_id = i.id
    WHERE i.org_id = p_org_id
      AND (p_location_id IS NULL OR i.location_id = p_location_id)
  )
  SELECT
    c.inv_id,
    c.inv_org_id,
    c.inv_location_id,
    c.inv_name,
    c.barcode,
    c.inv_use,
    c.inv_cost,
    c.inv_price,
    c.inv_quantity,
    c.low_stock_threshold,
    c.expiration_date,
    c.requires_prescription,
    c.warehouse_location,
    c.inv_created_at,
    c.inv_updated_at,
    c.supplier_id,
    c.supplier_name,
    c.supplier_product_id,
    c.lt_days,
    c.sold_30,
    c.sold_60,
    c.sold_90,
    0::bigint AS returned_30d,
    0::bigint AS returned_60d,
    0::bigint AS returned_90d,
    c.sold_30 AS net_sold_30d,
    c.sold_60 AS net_sold_60d,
    c.sold_90 AS net_sold_90d,
    ROUND(c.sold_30::numeric / NULLIF(30, 0), 2) AS avg_daily_sales_30,
    ROUND(c.sold_60::numeric / NULLIF(60, 0), 2) AS avg_daily_sales_60,
    ROUND(c.sold_90::numeric / NULLIF(90, 0), 2) AS avg_daily_sales_90,
    c.has_data,
    CASE 
      WHEN c.sold_30 = 0 THEN NULL
      ELSE ROUND(c.inv_quantity::numeric / (c.sold_30::numeric / 30), 1)
    END AS days_of_inventory,
    ROUND((c.sold_30::numeric / 30) * c.ss_days, 1) AS safety_stock,
    ROUND(((c.sold_30::numeric / 30) * c.lt_days) + ((c.sold_30::numeric / 30) * c.ss_days), 1) AS reorder_point,
    CASE
      WHEN c.sold_30 = 0 THEN
        CASE WHEN c.inv_quantity = 0 THEN 1 ELSE 0 END
      ELSE
        GREATEST(0,
          ROUND(((c.sold_30::numeric / 30) * 30 + (c.sold_30::numeric / 30) * c.ss_days) - c.inv_quantity)::integer
        )
    END AS recommended_qty,
    CASE
      WHEN c.expired THEN 100
      WHEN c.inv_quantity = 0 THEN 100
      WHEN c.sold_30 = 0 THEN 0
      WHEN (c.inv_quantity::numeric / (c.sold_30::numeric / 30)) <= 3 THEN 90 + GREATEST(0, 10 - (c.inv_quantity::numeric / (c.sold_30::numeric / 30))::integer)
      WHEN (c.inv_quantity::numeric / (c.sold_30::numeric / 30)) <= 7 THEN 70 + (7 - (c.inv_quantity::numeric / (c.sold_30::numeric / 30))::integer) * 5
      WHEN (c.inv_quantity::numeric / (c.sold_30::numeric / 30)) <= 14 THEN 40 + (14 - (c.inv_quantity::numeric / (c.sold_30::numeric / 30))::integer) * 4
      WHEN (c.inv_quantity::numeric / (c.sold_30::numeric / 30)) <= 30 THEN 10 + (30 - (c.inv_quantity::numeric / (c.sold_30::numeric / 30))::integer)
      ELSE 0
    END::integer AS stockout_risk_score,
    c.expired,
    c.days_to_expiry,
    c.inv_quantity * c.inv_cost AS inventory_value,
    CASE 
      WHEN c.sold_90 = 0 OR c.inv_quantity = 0 THEN NULL
      ELSE ROUND((c.sold_90::numeric * c.inv_cost) / NULLIF(c.inv_quantity, 0), 2)
    END AS turnover_90d
  FROM calculated c;
END;
$function$;
