-- ============================================================
-- PHASE 5: Admin Dashboard Reports Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. DAILY SALES SUMMARY VIEW
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT 
  DATE(s.timestamp) as date,
  COUNT(*) as total_sales,
  COALESCE(SUM(s.total), 0) as total_revenue,
  COALESCE(SUM(s.discount_value), 0) as total_discounts,
  COALESCE(SUM(s.iva_amount), 0) as total_tax,
  COALESCE(SUM(s.total - COALESCE(s.iva_amount, 0)), 0) as total_subtotal,
  COUNT(DISTINCT s.salesperson) as unique_sellers,
  STRING_AGG(DISTINCT s.salesperson, ', ') as sellers
FROM sales s
GROUP BY DATE(s.timestamp)
ORDER BY date DESC;

-- 2. TOP PRODUCTS VIEW (by quantity sold)
CREATE OR REPLACE VIEW top_products AS
SELECT 
  si.inventory_id,
  i.name,
  SUM(si.quantity) as total_quantity_sold,
  SUM(si.quantity * si.price) as total_revenue,
  COUNT(DISTINCT si.sale_id) as times_sold,
  AVG(si.price) as avg_selling_price
FROM sale_items si
JOIN inventory i ON si.inventory_id = i.id
JOIN sales s ON si.sale_id = s.id
WHERE s.timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY si.inventory_id, i.name
ORDER BY total_quantity_sold DESC;

-- 3. DEAD STOCK VIEW (items not sold in 90 days)
CREATE OR REPLACE VIEW dead_stock AS
SELECT 
  i.id,
  i.name,
  i.quantity as current_stock,
  i.expiration_date,
  i.created_at as added_date,
  MAX(s.timestamp) as last_sale_date,
  CURRENT_DATE - MAX(s.timestamp)::date as days_since_last_sale,
  i.quantity * i.price as inventory_value
FROM inventory i
LEFT JOIN sale_items si ON i.id = si.inventory_id
LEFT JOIN sales s ON si.sale_id = s.id
WHERE i.quantity > 0
GROUP BY i.id, i.name, i.quantity, i.expiration_date, i.created_at, i.price
HAVING MAX(s.timestamp) IS NULL OR MAX(s.timestamp) < CURRENT_DATE - INTERVAL '90 days'
ORDER BY days_since_last_sale DESC NULLS FIRST;

-- 4. INVENTORY VALUATION VIEW
CREATE OR REPLACE VIEW inventory_valuation AS
SELECT 
  'Todo el Inventario' as category,
  COUNT(*) as item_count,
  SUM(i.quantity) as total_units,
  SUM(i.quantity * i.cost) as total_cost_value,
  SUM(i.quantity * i.price) as total_retail_value,
  SUM(i.quantity * i.price) - SUM(i.quantity * i.cost) as potential_profit
FROM inventory i
WHERE i.quantity > 0;

-- 5. PROFIT REPORT VIEW
CREATE OR REPLACE VIEW profit_report AS
SELECT 
  DATE(s.timestamp) as date,
  COUNT(*) as total_sales,
  SUM(s.total) as gross_revenue,
  SUM(s.discount_value) as discounts,
  SUM(si.quantity * i.cost) as cost_of_goods,
  SUM(s.total) - COALESCE(SUM(si.quantity * i.cost), 0) as gross_profit,
  CASE 
    WHEN SUM(s.total) > 0 THEN 
      ROUND(((SUM(s.total) - COALESCE(SUM(si.quantity * i.cost), 0)) / SUM(s.total) * 100), 2)
    ELSE 0 
  END as profit_margin_percent
FROM sales s
JOIN sale_items si ON s.id = si.sale_id
JOIN inventory i ON si.inventory_id = i.id
GROUP BY DATE(s.timestamp)
ORDER BY date DESC;

-- 6. SHIFT REPORT WITH TOTALS
CREATE OR REPLACE VIEW shift_report AS
SELECT 
  sh.id,
  sh.org_id,
  sh.opened_by as cashier_id,
  COALESCE(sh.opened_by_name, u.full_name) as cashier_name,
  sh.opened_at as start_time,
  sh.closed_at as end_time,
  sh.starting_cash as initial_cash,
  sh.closing_cash as final_cash,
  sh.status,
  sh.notes,
  sh.total_sales,
  sh.total_revenue
FROM shifts sh
LEFT JOIN profiles u ON sh.opened_by = u.id
ORDER BY sh.opened_at DESC;

-- 7. FUNCTION TO CLOSE SHIFT
CREATE OR REPLACE FUNCTION close_shift(
  p_shift_id uuid,
  p_closing_cash decimal,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE shifts
  SET 
    status = 'closed',
    closed_at = NOW(),
    closing_cash = p_closing_cash,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_shift_id
  AND status = 'open';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found or already closed';
  END IF;
END;
$$;

-- 8. FUNCTION TO CLOSE ALL OPEN SHIFTS (admin only)
CREATE OR REPLACE FUNCTION close_all_open_shifts(
  p_org_id uuid,
  p_closed_by uuid
)
RETURNS TABLE(closed_shift_id uuid, cashier_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE shifts
  SET 
    status = 'closed',
    closed_at = NOW(),
    closing_cash = starting_cash,
    notes = COALESCE(notes, '') || E'\n[Auto-cerrado por administrador]'
  WHERE org_id = p_org_id
  AND status = 'open'
  RETURNING shifts.id, (SELECT full_name FROM profiles WHERE id = shifts.opened_by);
END;
$$;

-- 9. INDEXES FOR REPORT PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sales(timestamp);
CREATE INDEX IF NOT EXISTS idx_sale_items_inventory ON sale_items(inventory_id);
-- Note: sales table doesn't have shift_id column currently
-- CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);

-- 10. VERIFY VIEWS
SELECT 'Views created successfully:' as status;
SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname IN (
  'daily_sales_summary',
  'top_products',
  'dead_stock',
  'inventory_valuation',
  'profit_report',
  'shift_report'
);
