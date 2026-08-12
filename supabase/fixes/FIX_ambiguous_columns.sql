-- Fix for ambiguous column references in reorder functions
-- Run this in Supabase SQL Editor

-- Drop existing functions first
DROP FUNCTION IF EXISTS get_reorder_recommendations(uuid, uuid);
DROP FUNCTION IF EXISTS get_inventory_intelligence(uuid, uuid);

-- Recreate get_inventory_intelligence with fixed ambiguous references
CREATE OR REPLACE FUNCTION get_inventory_intelligence(
  p_org_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  location_id uuid,
  name text,
  barcode text,
  use text,
  cost numeric,
  price numeric,
  quantity integer,
  low_stock_threshold integer,
  expiration_date date,
  requires_prescription boolean,
  warehouse_location text,
  created_at timestamptz,
  updated_at timestamptz,
  supplier_id uuid,
  supplier_name text,
  supplier_product_id uuid,
  lead_time_days integer,
  sold_30d integer,
  sold_60d integer,
  sold_90d integer,
  returned_30d integer,
  returned_60d integer,
  returned_90d integer,
  net_sold_30d integer,
  net_sold_60d integer,
  net_sold_90d integer,
  avg_daily_sales_30 numeric,
  avg_daily_sales_60 numeric,
  avg_daily_sales_90 numeric,
  has_sufficient_data boolean,
  days_of_inventory numeric,
  safety_stock numeric,
  reorder_point numeric,
  recommended_qty integer,
  stockout_risk_score integer,
  is_expired boolean,
  days_until_expiry integer,
  inventory_value numeric,
  turnover_90d numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings inventory_settings%ROWTYPE;
BEGIN
  -- Load org settings (use defaults if missing)
  SELECT * INTO v_settings
  FROM inventory_settings
  WHERE inventory_settings.org_id = p_org_id;
  
  IF v_settings IS NULL THEN
    v_settings.default_lead_time_days := 7;
    v_settings.critical_safety_stock_days := 7;
    v_settings.normal_safety_stock_days := 3;
  END IF;

  RETURN QUERY
  SELECT 
    result.id,
    result.org_id,
    result.location_id,
    result.name,
    result.barcode,
    result.use,
    result.cost,
    result.price,
    result.quantity,
    result.low_stock_threshold,
    result.expiration_date,
    result.requires_prescription,
    result.warehouse_location,
    result.created_at,
    result.updated_at,
    result.supplier_id,
    result.supplier_name,
    result.supplier_product_id,
    result.lead_time_days,
    result.sold_30d,
    result.sold_60d,
    result.sold_90d,
    result.returned_30d,
    result.returned_60d,
    result.returned_90d,
    result.net_sold_30d,
    result.net_sold_60d,
    result.net_sold_90d,
    result.avg_daily_sales_30,
    result.avg_daily_sales_60,
    result.avg_daily_sales_90,
    result.has_sufficient_data,
    result.days_of_inventory,
    result.safety_stock,
    result.reorder_point,
    result.recommended_qty,
    result.stockout_risk_score,
    result.is_expired,
    result.days_until_expiry,
    result.inventory_value,
    result.turnover_90d
  FROM (
    WITH
    net_sales AS (
      SELECT
        si.inventory_id,
        SUM(CASE WHEN sa.timestamp >= (CURRENT_DATE - INTERVAL '30 days')::timestamptz THEN si.quantity ELSE 0 END) AS gross_30,
        SUM(CASE WHEN sa.timestamp >= (CURRENT_DATE - INTERVAL '60 days')::timestamptz THEN si.quantity ELSE 0 END) AS gross_60,
        SUM(CASE WHEN sa.timestamp >= (CURRENT_DATE - INTERVAL '90 days')::timestamptz THEN si.quantity ELSE 0 END) AS gross_90
      FROM sale_items si
      JOIN sales sa ON sa.id = si.sale_id
      WHERE sa.timestamp >= (CURRENT_DATE - INTERVAL '90 days')::timestamptz
        AND sa.voided = false
        AND sa.org_id = p_org_id
        AND (p_location_id IS NULL OR sa.location_id = p_location_id)
      GROUP BY si.inventory_id
    ),
    net_returns AS (
      SELECT
        ri.inventory_id,
        SUM(CASE WHEN r.timestamp >= (CURRENT_DATE - INTERVAL '30 days')::timestamptz THEN ri.quantity ELSE 0 END) AS ret_30,
        SUM(CASE WHEN r.timestamp >= (CURRENT_DATE - INTERVAL '60 days')::timestamptz THEN ri.quantity ELSE 0 END) AS ret_60,
        SUM(CASE WHEN r.timestamp >= (CURRENT_DATE - INTERVAL '90 days')::timestamptz THEN ri.quantity ELSE 0 END) AS ret_90
      FROM return_items ri
      JOIN returns r ON r.id = ri.return_id
      WHERE r.timestamp >= (CURRENT_DATE - INTERVAL '90 days')::timestamptz
        AND r.org_id = p_org_id
      GROUP BY ri.inventory_id
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
        COALESCE(ns.gross_30, 0) AS s30,
        COALESCE(ns.gross_60, 0) AS s60,
        COALESCE(ns.gross_90, 0) AS s90,
        COALESCE(nr.ret_30, 0) AS r30,
        COALESCE(nr.ret_60, 0) AS r60,
        COALESCE(nr.ret_90, 0) AS r90,
        GREATEST(0, COALESCE(ns.gross_30, 0) - COALESCE(nr.ret_30, 0)) AS net_30,
        GREATEST(0, COALESCE(ns.gross_60, 0) - COALESCE(nr.ret_60, 0)) AS net_60,
        GREATEST(0, COALESCE(ns.gross_90, 0) - COALESCE(nr.ret_90, 0)) AS net_90,
        CASE WHEN COALESCE(ns.gross_30, 0) > 0 THEN true ELSE false END AS has_data,
        CASE
          WHEN i.requires_prescription THEN v_settings.critical_safety_stock_days
          ELSE v_settings.normal_safety_stock_days
        END AS ss_days,
        (i.expiration_date IS NOT NULL AND i.expiration_date < CURRENT_DATE) AS expired,
        CASE WHEN i.expiration_date IS NOT NULL
          THEN (i.expiration_date - CURRENT_DATE)::integer
          ELSE NULL
        END AS days_to_expiry
      FROM inventory i
      LEFT JOIN suppliers s ON s.id = i.supplier_id
      LEFT JOIN supplier_products sp ON sp.inventory_id = i.id AND sp.preferred = true
      LEFT JOIN net_sales ns ON ns.inventory_id = i.id
      LEFT JOIN net_returns nr ON nr.inventory_id = i.id
      WHERE i.org_id = p_org_id
        AND (p_location_id IS NULL OR i.location_id = p_location_id)
    )
    SELECT
      c.inv_id AS id,
      c.inv_org_id AS org_id,
      c.inv_location_id AS location_id,
      c.inv_name AS name,
      c.barcode,
      c.inv_use AS use,
      c.inv_cost AS cost,
      c.inv_price AS price,
      c.inv_quantity AS quantity,
      c.low_stock_threshold,
      c.expiration_date,
      c.requires_prescription,
      c.warehouse_location,
      c.inv_created_at AS created_at,
      c.inv_updated_at AS updated_at,
      c.supplier_id,
      c.supplier_name,
      c.supplier_product_id,
      c.lt_days AS lead_time_days,
      c.s30 AS sold_30d,
      c.s60 AS sold_60d,
      c.s90 AS sold_90d,
      c.r30 AS returned_30d,
      c.r60 AS returned_60d,
      c.r90 AS returned_90d,
      c.net_30 AS net_sold_30d,
      c.net_60 AS net_sold_60d,
      c.net_90 AS net_sold_90d,
      ROUND(c.net_30::numeric / NULLIF(30, 0), 2) AS avg_daily_sales_30,
      ROUND(c.net_60::numeric / NULLIF(60, 0), 2) AS avg_daily_sales_60,
      ROUND(c.net_90::numeric / NULLIF(90, 0), 2) AS avg_daily_sales_90,
      c.has_data AS has_sufficient_data,
      CASE 
        WHEN c.net_30 = 0 THEN NULL
        ELSE ROUND(c.inv_quantity::numeric / (c.net_30::numeric / 30), 1)
      END AS days_of_inventory,
      ROUND((c.net_30::numeric / 30) * c.ss_days, 1) AS safety_stock,
      ROUND(((c.net_30::numeric / 30) * c.lt_days) + ((c.net_30::numeric / 30) * c.ss_days), 1) AS reorder_point,
      CASE
        WHEN c.net_30 = 0 THEN
          CASE WHEN c.inv_quantity = 0 THEN 1 ELSE 0 END
        ELSE
          GREATEST(0,
            ROUND(((c.net_30::numeric / 30) * 30 + (c.net_30::numeric / 30) * c.ss_days) - c.inv_quantity)::integer
          )
      END AS recommended_qty,
      CASE
        WHEN c.expired THEN 100
        WHEN c.inv_quantity = 0 THEN 100
        WHEN c.net_30 = 0 THEN 0
        WHEN (c.inv_quantity::numeric / (c.net_30::numeric / 30)) <= 3 THEN 90 + GREATEST(0, 10 - (c.inv_quantity::numeric / (c.net_30::numeric / 30))::integer)
        WHEN (c.inv_quantity::numeric / (c.net_30::numeric / 30)) <= 7 THEN 70 + (7 - (c.inv_quantity::numeric / (c.net_30::numeric / 30))::integer) * 5
        WHEN (c.inv_quantity::numeric / (c.net_30::numeric / 30)) <= 14 THEN 40 + (14 - (c.inv_quantity::numeric / (c.net_30::numeric / 30))::integer) * 4
        WHEN (c.inv_quantity::numeric / (c.net_30::numeric / 30)) <= 30 THEN 10 + (30 - (c.inv_quantity::numeric / (c.net_30::numeric / 30))::integer)
        ELSE 0
      END::integer AS stockout_risk_score,
      c.expired AS is_expired,
      c.days_to_expiry AS days_until_expiry,
      c.inv_quantity * c.inv_cost AS inventory_value,
      CASE 
        WHEN c.net_90 = 0 OR c.inv_quantity = 0 THEN NULL
        ELSE ROUND((c.net_90::numeric * c.inv_cost) / NULLIF(c.inv_quantity, 0), 2)
      END AS turnover_90d
    FROM calculated c
  ) AS result;
END;
$$;

-- Recreate get_reorder_recommendations with fixed references
CREATE OR REPLACE FUNCTION get_reorder_recommendations(
  p_org_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  location_id uuid,
  name text,
  barcode text,
  use text,
  cost numeric,
  price numeric,
  quantity integer,
  low_stock_threshold integer,
  expiration_date date,
  requires_prescription boolean,
  warehouse_location text,
  created_at timestamptz,
  updated_at timestamptz,
  supplier_id uuid,
  supplier_name text,
  supplier_product_id uuid,
  lead_time_days integer,
  sold_30d integer,
  sold_60d integer,
  sold_90d integer,
  returned_30d integer,
  returned_60d integer,
  returned_90d integer,
  net_sold_30d integer,
  net_sold_60d integer,
  net_sold_90d integer,
  avg_daily_sales_30 numeric,
  avg_daily_sales_60 numeric,
  avg_daily_sales_90 numeric,
  has_sufficient_data boolean,
  days_of_inventory numeric,
  safety_stock numeric,
  reorder_point numeric,
  recommended_qty integer,
  stockout_risk_score integer,
  is_expired boolean,
  days_until_expiry integer,
  inventory_value numeric,
  turnover_90d numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM get_inventory_intelligence(p_org_id, p_location_id)
  WHERE get_inventory_intelligence.recommended_qty > 0
     OR get_inventory_intelligence.quantity = 0
     OR (get_inventory_intelligence.days_of_inventory IS NOT NULL AND get_inventory_intelligence.days_of_inventory <= 14)
     OR (get_inventory_intelligence.quantity <= get_inventory_intelligence.low_stock_threshold)
     OR get_inventory_intelligence.is_expired = true
  ORDER BY get_inventory_intelligence.stockout_risk_score DESC, get_inventory_intelligence.recommended_qty DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_inventory_intelligence(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reorder_recommendations(uuid, uuid) TO authenticated;

-- Test the function
SELECT 'Functions recreated successfully' AS status;
