-- Fix: Cap recommended quantity at 1 when there's no sales data
-- Run this in Supabase SQL Editor to update the function

CREATE OR REPLACE FUNCTION get_inventory_intelligence(
  p_org_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  -- [all the existing columns - keeping only the changed part for brevity]
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
  WHERE org_id = p_org_id;
  
  IF v_settings IS NULL THEN
    v_settings.default_lead_time_days := 7;
    v_settings.critical_safety_stock_days := 7;
    v_settings.normal_safety_stock_days := 3;
  END IF;

  RETURN QUERY
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
    
    c.s30,
    c.s60,
    c.s90,
    c.r30,
    c.r60,
    c.r90,
    c.net_30,
    c.net_60,
    c.net_90,
    
    ROUND(c.net_30::numeric / NULLIF(30, 0), 2) AS ads30,
    ROUND(c.net_60::numeric / NULLIF(60, 0), 2) AS ads60,
    ROUND(c.net_90::numeric / NULLIF(90, 0), 2) AS ads90,
    
    c.has_data,
    
    CASE 
      WHEN c.net_30 = 0 THEN NULL
      ELSE ROUND(c.inv_quantity::numeric / (c.net_30::numeric / 30), 1)
    END AS doi,
    
    ROUND((c.net_30::numeric / 30) * c.ss_days, 1) AS safety_stock,
    ROUND(((c.net_30::numeric / 30) * c.lt_days) + ((c.net_30::numeric / 30) * c.ss_days), 1) AS reorder_point,
    
    -- Recommended quantity - capped at 1 when no sales data
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
    END::integer AS risk_score,
    
    c.expired,
    c.days_to_expiry,
    
    c.inv_quantity * c.inv_cost AS inv_value,
    
    CASE 
      WHEN c.net_90 = 0 OR c.inv_quantity = 0 THEN NULL
      ELSE ROUND((c.net_90::numeric * c.inv_cost) / NULLIF(c.inv_quantity, 0), 2)
    END AS turnover
    
  FROM calculated c;
END;
$$;

-- Also update get_reorder_recommendations to use the updated function
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
  WHERE recommended_qty > 0
     OR quantity = 0
     OR (days_of_inventory IS NOT NULL AND days_of_inventory <= 14)
     OR (quantity <= low_stock_threshold)
     OR is_expired = true
  ORDER BY stockout_risk_score DESC, recommended_qty DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_intelligence(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reorder_recommendations(uuid, uuid) TO authenticated;

-- Verify the fix
SELECT 'Function updated successfully' AS status;
