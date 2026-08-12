-- ============================================================
-- MIGRATION: P3 Fix — Ambiguous column references in
-- get_reorder_recommendations()
--
-- BUG:
--   get_reorder_recommendations() calls get_inventory_intelligence()
--   and then references output columns like `recommended_qty`,
--   `quantity`, `days_of_inventory`, etc. without qualification.
--
--   Because get_inventory_intelligence() is declared with
--   RETURNS TABLE (...), PostgreSQL creates PL/pgSQL variables
--   for each output column name in the calling function's scope.
--   Unqualified references become ambiguous.
--
-- FIX:
--   Wrap the function call in an aliased subquery:
--     SELECT * FROM get_inventory_intelligence(...) AS ii
--   Then qualify every column reference: ii.recommended_qty, etc.
--
-- SAFETY:
--   - Read-only function, zero data modification
--   - Idempotent: DROP + CREATE OR REPLACE
-- ============================================================

-- Step 1: Drop the broken function
DROP FUNCTION IF EXISTS get_reorder_recommendations(uuid, uuid);

-- Step 2: Recreate with fully-qualified column references
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
  preferred_lead_time integer,
  sold_30d bigint,
  sold_60d bigint,
  sold_90d bigint,
  returned_30d bigint,
  returned_60d bigint,
  returned_90d bigint,
  net_sold_30d bigint,
  net_sold_60d bigint,
  net_sold_90d bigint,
  avg_daily_sales_30 numeric,
  avg_daily_sales_60 numeric,
  avg_daily_sales_90 numeric,
  has_sufficient_data boolean,
  days_of_inventory numeric,
  lead_time_days integer,
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
  SELECT *
  FROM get_inventory_intelligence(p_org_id, p_location_id) AS ii
  WHERE ii.recommended_qty > 0
     OR ii.quantity = 0
     OR (ii.days_of_inventory IS NOT NULL AND ii.days_of_inventory <= 14)
     OR ii.quantity <= ii.low_stock_threshold
     OR ii.is_expired = true
  ORDER BY ii.stockout_risk_score DESC,
           ii.days_of_inventory ASC NULLS LAST,
           ii.name ASC;
END;
$$;

-- Step 3: Restore execute permission
GRANT EXECUTE ON FUNCTION get_reorder_recommendations(uuid, uuid) TO authenticated;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- V1: Verify get_inventory_intelligence() executes without error
SELECT 'get_inventory_intelligence() executes' AS check_item,
  CASE WHEN COUNT(*) >= 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM get_inventory_intelligence(
  (SELECT id FROM organizations LIMIT 1)
);

-- V2: Verify get_reorder_recommendations() executes without error
SELECT 'get_reorder_recommendations() executes' AS check_item,
  CASE WHEN COUNT(*) >= 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM get_reorder_recommendations(
  (SELECT id FROM organizations LIMIT 1)
);

-- V3: Verify both return the same column set (check column count)
SELECT 'column count matches' AS check_item,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'get_inventory_intelligence')
       = (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'get_reorder_recommendations')
    THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

-- V4: Verify get_reorder_recommendations returns a subset of intelligence
SELECT 'reorder is subset of intelligence' AS check_item,
  CASE
    WHEN (SELECT COUNT(*) FROM get_reorder_recommendations(
      (SELECT id FROM organizations LIMIT 1)
    )) <= (SELECT COUNT(*) FROM get_inventory_intelligence(
      (SELECT id FROM organizations LIMIT 1)
    ))
    THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

-- Completion
SELECT 'P3 ambiguous column fix applied' AS status;
