-- ============================================================
-- MIGRATION: P3 — Inventory Intelligence & Reorder Automation
--
-- PURPOSE:
--   • Creates inventory_settings table for org-level defaults
--   • Creates get_inventory_intelligence() function for all metrics
--   • Creates get_reorder_recommendations() function for filtered view
--   • Adds performance indexes on sales/sale_items/returns
--   • Adds RLS policy on inventory_settings
--
-- SAFETY:
--   • All new objects (table, functions, indexes) — no existing data modified
--   • Functions are read-only (no INSERT/UPDATE/DELETE)
--   • Indexes use IF NOT EXISTS
--   • Zero impact on checkout, POS, inventory deduction, prescriptions
--
-- AUDIT FIXES (2026-06-05):
--   1. Returns are now subtracted from sales velocity (net sales = sales - returns)
--   2. Expired items are flagged and their risk score is forced to 100
--   3. Single-pass optimization for 30/60/90 day sales (one scan, three sums)
--
-- RUN IN: Supabase SQL Editor (top to bottom)
-- BACKUP YOUR DATABASE BEFORE RUNNING
-- ============================================================

-- ============================================================
-- STEP 0: Drop existing functions if they exist (for idempotent re-runs)
-- ============================================================
DROP FUNCTION IF EXISTS get_inventory_intelligence(uuid, uuid);
DROP FUNCTION IF EXISTS get_reorder_recommendations(uuid, uuid);

-- ============================================================
-- STEP 1: inventory_settings table — org-level defaults
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  default_lead_time_days integer NOT NULL DEFAULT 7,
  critical_safety_stock_days integer NOT NULL DEFAULT 7,
  normal_safety_stock_days integer NOT NULL DEFAULT 3,
  reorder_lookback_days integer NOT NULL DEFAULT 30,
  critical_medication_types text[] DEFAULT ARRAY['prescription'],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id)
);

-- Index for fast lookup by org
CREATE INDEX IF NOT EXISTS idx_inventory_settings_org ON inventory_settings(org_id);

-- RLS: users can only read/update their own org's settings
ALTER TABLE inventory_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_settings_org_isolation" ON inventory_settings;
CREATE POLICY "inventory_settings_org_isolation" ON inventory_settings
  FOR ALL USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_inventory_settings_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_settings_updated ON inventory_settings;
CREATE TRIGGER trg_inventory_settings_updated
  BEFORE UPDATE ON inventory_settings
  FOR EACH ROW EXECUTE FUNCTION update_inventory_settings_timestamp();

-- ============================================================
-- STEP 2: Performance indexes for sales velocity calculations
-- ============================================================

-- Single index for 30/60/90 day sales aggregation by org + date
CREATE INDEX IF NOT EXISTS idx_sales_timestamp_voided_org
  ON sales(timestamp, voided, org_id);

-- Index for location-scoped sales queries
CREATE INDEX IF NOT EXISTS idx_sales_timestamp_location
  ON sales(timestamp, voided, org_id, location_id);

-- Covering index for sale_items aggregation
CREATE INDEX IF NOT EXISTS idx_sale_items_inventory_sale
  ON sale_items(inventory_id, sale_id, quantity);

-- Index for returns filtering by org + date
CREATE INDEX IF NOT EXISTS idx_returns_timestamp_org
  ON returns(timestamp, org_id);

-- Index for return_items aggregation by inventory_id
CREATE INDEX IF NOT EXISTS idx_return_items_inventory_return
  ON return_items(inventory_id, return_id, return_qty);

-- ============================================================
-- STEP 3: get_inventory_intelligence() — core intelligence function
--
-- Returns one row per inventory item with:
--   • Net sales velocity (30/60/90 day, sales MINUS returns)
--   • Days of inventory remaining
--   • Reorder point with safety stock
--   • Recommended reorder quantity
--   • Stockout risk score (0-100)
--   • Expired flag (true if expiration_date < today)
--   • Inventory value and turnover
--
-- Parameters:
--   p_org_id      — required organization filter
--   p_location_id — optional location filter (NULL = all locations)
--
-- NET SALES CALCULATION:
--   Net = SUM(sale_items.quantity) - SUM(return_items.return_qty)
--   Both filtered by the same date window.
--   Returns table does not have location_id, so returns are org-scoped only.
--
-- EXPIRED INVENTORY:
--   If expiration_date < CURRENT_DATE, the item is flagged as expired.
--   Risk score is forced to 100 for expired items (can't sell expired stock).
--   The system quantity is NOT adjusted — expired items must be removed
--   via stock adjustment. This is the intended workflow.
-- ============================================================
CREATE OR REPLACE FUNCTION get_inventory_intelligence(
  p_org_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  -- Identity
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

  -- Supplier
  supplier_id uuid,
  supplier_name text,
  preferred_lead_time integer,

  -- Sales velocity (NET = sales - returns)
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

  -- Intelligence metrics
  days_of_inventory numeric,
  lead_time_days integer,
  safety_stock numeric,
  reorder_point numeric,
  recommended_qty integer,
  stockout_risk_score integer,

  -- Expiry
  is_expired boolean,
  days_until_expiry integer,

  -- Financial & analytics
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
  WHERE inventory_settings.org_id = p_org_id
  LIMIT 1;

  IF NOT FOUND THEN
    v_settings.default_lead_time_days := 7;
    v_settings.critical_safety_stock_days := 7;
    v_settings.normal_safety_stock_days := 3;
  END IF;

  RETURN QUERY
  WITH
  -- Single-pass net sales: scan 90 days once, compute 30/60/90 windows
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
  -- Returns in the same windows (org-scoped; returns table has no location_id)
  net_returns AS (
    SELECT
      ri.inventory_id,
      SUM(CASE WHEN r.timestamp >= (CURRENT_DATE - INTERVAL '30 days')::timestamptz THEN ri.return_qty ELSE 0 END) AS ret_30,
      SUM(CASE WHEN r.timestamp >= (CURRENT_DATE - INTERVAL '60 days')::timestamptz THEN ri.return_qty ELSE 0 END) AS ret_60,
      SUM(CASE WHEN r.timestamp >= (CURRENT_DATE - INTERVAL '90 days')::timestamptz THEN ri.return_qty ELSE 0 END) AS ret_90
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
      i.barcode AS inv_barcode,
      i.use AS inv_use,
      i.cost AS inv_cost,
      i.price AS inv_price,
      i.quantity AS inv_quantity,
      i.low_stock_threshold AS inv_low_stock_threshold,
      i.expiration_date AS inv_expiration_date,
      i.requires_prescription AS inv_requires_prescription,
      i.warehouse_location AS inv_warehouse_location,
      i.created_at AS inv_created_at,
      i.updated_at AS inv_updated_at,
      i.supplier_id AS inv_supplier_id,
      s.name AS sup_name,
      sp.lead_time_days AS sup_lead_time,

      -- Gross sales
      COALESCE(ns.gross_30, 0)::bigint AS g30,
      COALESCE(ns.gross_60, 0)::bigint AS g60,
      COALESCE(ns.gross_90, 0)::bigint AS g90,

      -- Returns
      COALESCE(nr.ret_30, 0)::bigint AS r30,
      COALESCE(nr.ret_60, 0)::bigint AS r60,
      COALESCE(nr.ret_90, 0)::bigint AS r90,

      -- Net sales (never negative)
      GREATEST(0, COALESCE(ns.gross_30, 0) - COALESCE(nr.ret_30, 0))::bigint AS n30,
      GREATEST(0, COALESCE(ns.gross_60, 0) - COALESCE(nr.ret_60, 0))::bigint AS n60,
      GREATEST(0, COALESCE(ns.gross_90, 0) - COALESCE(nr.ret_90, 0))::bigint AS n90,

      -- Net average daily sales
      ROUND(GREATEST(0, COALESCE(ns.gross_30, 0) - COALESCE(nr.ret_30, 0))::numeric / 30.0, 2) AS ads30,
      ROUND(GREATEST(0, COALESCE(ns.gross_60, 0) - COALESCE(nr.ret_60, 0))::numeric / 60.0, 2) AS ads60,
      ROUND(GREATEST(0, COALESCE(ns.gross_90, 0) - COALESCE(nr.ret_90, 0))::numeric / 90.0, 2) AS ads90,

      -- Has sufficient data: at least 5 net units sold in 30 days
      (GREATEST(0, COALESCE(ns.gross_30, 0) - COALESCE(nr.ret_30, 0)) >= 5) AS has_data,

      -- Lead time
      COALESCE(sp.lead_time_days, v_settings.default_lead_time_days, 7) AS lt_days,

      -- Safety stock days
      CASE WHEN i.requires_prescription
        THEN v_settings.critical_safety_stock_days
        ELSE v_settings.normal_safety_stock_days
      END AS ss_days,

      -- Expiry
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
    c.inv_barcode,
    c.inv_use,
    c.inv_cost,
    c.inv_price,
    c.inv_quantity,
    c.inv_low_stock_threshold,
    c.inv_expiration_date,
    c.inv_requires_prescription,
    c.inv_warehouse_location,
    c.inv_created_at,
    c.inv_updated_at,
    c.inv_supplier_id,
    c.sup_name,
    c.sup_lead_time,

    -- Gross sales counts
    c.g30,
    c.g60,
    c.g90,

    -- Return counts
    c.r30,
    c.r60,
    c.r90,

    -- Net sales counts
    c.n30,
    c.n60,
    c.n90,

    -- ADS
    c.ads30,
    c.ads60,
    c.ads90,
    c.has_data,

    -- Days of inventory
    CASE
      WHEN c.ads30 > 0 THEN ROUND(c.inv_quantity::numeric / c.ads30, 1)
      ELSE NULL
    END AS doi,

    -- Lead time
    c.lt_days,

    -- Safety stock
    ROUND(c.ads30 * c.ss_days, 1) AS safety_stock,

    -- Reorder point
    ROUND((c.ads30 * c.lt_days) + (c.ads30 * c.ss_days), 1) AS reorder_point,

    -- Recommended quantity
    GREATEST(0,
      ROUND((c.ads30 * 30 + c.ads30 * c.ss_days) - c.inv_quantity)::integer
    ) AS recommended_qty,

    -- Stockout risk score (0-100)
    -- Expired items are forced to 100 (can't sell expired stock)
    CASE
      WHEN c.expired THEN 100
      WHEN c.inv_quantity = 0 THEN 100
      WHEN c.ads30 = 0 THEN 0
      WHEN (c.inv_quantity::numeric / c.ads30) <= 3 THEN 90 + GREATEST(0, 10 - (c.inv_quantity::numeric / c.ads30)::integer)
      WHEN (c.inv_quantity::numeric / c.ads30) <= 7 THEN 70 + (7 - (c.inv_quantity::numeric / c.ads30)::integer) * 5
      WHEN (c.inv_quantity::numeric / c.ads30) <= 14 THEN 40 + (14 - (c.inv_quantity::numeric / c.ads30)::integer) * 4
      WHEN (c.inv_quantity::numeric / c.ads30) <= 30 THEN 10 + (30 - (c.inv_quantity::numeric / c.ads30)::integer)
      ELSE 0
    END::integer AS risk_score,

    -- Expiry
    c.expired,
    c.days_to_expiry,

    -- Financial
    c.inv_quantity * c.inv_cost AS inv_value,

    -- Turnover
    CASE WHEN c.inv_quantity > 0 THEN ROUND(c.n90::numeric / c.inv_quantity::numeric, 2) ELSE 0 END AS turnover

  FROM calculated c
  ORDER BY c.inv_name;
END;
$$;

-- ============================================================
-- STEP 4: get_reorder_recommendations() — filtered view
-- ============================================================
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
  SELECT * FROM get_inventory_intelligence(p_org_id, p_location_id)
  WHERE recommended_qty > 0
     OR quantity = 0
     OR (days_of_inventory IS NOT NULL AND days_of_inventory <= 14)
     OR (quantity <= low_stock_threshold)
     OR is_expired = true
  ORDER BY stockout_risk_score DESC, days_of_inventory ASC NULLS LAST, name ASC;
END;
$$;

-- ============================================================
-- STEP 5: Grant execute permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION get_inventory_intelligence(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reorder_recommendations(uuid, uuid) TO authenticated;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- V1: Confirm inventory_settings table exists
SELECT 'inventory_settings table' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.tables
WHERE table_name = 'inventory_settings';

-- V2: Confirm functions exist
SELECT 'get_inventory_intelligence function' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_proc WHERE proname = 'get_inventory_intelligence';

SELECT 'get_reorder_recommendations function' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_proc WHERE proname = 'get_reorder_recommendations';

-- V3: Confirm indexes exist
SELECT 'idx_sales_timestamp_voided_org' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_indexes WHERE indexname = 'idx_sales_timestamp_voided_org';

SELECT 'idx_returns_timestamp_org' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_indexes WHERE indexname = 'idx_returns_timestamp_org';

SELECT 'idx_return_items_inventory_return' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_indexes WHERE indexname = 'idx_return_items_inventory_return';

-- V4: Verify function returns correct column set (check for net_sold_30d)
SELECT 'net_sales columns exist' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'get_inventory_intelligence' AND column_name = 'net_sold_30d';

SELECT 'expired flag exists' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'get_inventory_intelligence' AND column_name = 'is_expired';

-- V5: Completion status
SELECT 'P3 migration complete' AS status;
