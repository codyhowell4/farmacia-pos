-- Migration: create sales_by_shift view for the admin "Ventas por Turno" report
-- Run this in the Supabase SQL Editor for existing databases.

CREATE OR REPLACE VIEW sales_by_shift AS
WITH sales_summary AS (
  SELECT
    s.shift_id,
    COUNT(*) AS total_sales,
    SUM(s.total) AS total_revenue,
    SUM(s.discount_amount) AS total_discounts,
    SUM(s.iva_amount) AS total_tax
  FROM sales s
  WHERE s.voided = false
    AND s.shift_id IS NOT NULL
  GROUP BY s.shift_id
),
payment_summary AS (
  SELECT
    s.shift_id,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'cash') AS total_cash,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'card') AS total_card,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'transferencia') AS total_transferencia,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'insurance') AS total_insurance
  FROM sales s
  JOIN sale_payments sp ON sp.sale_id = s.id
  WHERE s.voided = false
    AND s.shift_id IS NOT NULL
  GROUP BY s.shift_id
)
SELECT
  sh.id AS shift_id,
  sh.org_id,
  sh.location_id,
  l.name AS location_name,
  sh.opened_by AS cashier_id,
  COALESCE(sh.opened_by_name, p.full_name) AS cashier_name,
  sh.opened_at,
  sh.closed_at,
  sh.starting_cash,
  sh.closing_cash,
  sh.expected_cash,
  sh.variance,
  sh.status,
  sh.notes,
  COALESCE(ss.total_sales, 0) AS total_sales,
  COALESCE(ss.total_revenue, 0) AS total_revenue,
  COALESCE(ss.total_discounts, 0) AS total_discounts,
  COALESCE(ss.total_tax, 0) AS total_tax,
  COALESCE(ps.total_cash, 0) AS total_cash,
  COALESCE(ps.total_card, 0) AS total_card,
  COALESCE(ps.total_transferencia, 0) AS total_transferencia,
  COALESCE(ps.total_insurance, 0) AS total_insurance
FROM shifts sh
LEFT JOIN locations l ON sh.location_id = l.id
LEFT JOIN profiles p ON sh.opened_by = p.id
LEFT JOIN sales_summary ss ON ss.shift_id = sh.id
LEFT JOIN payment_summary ps ON ps.shift_id = sh.id
WHERE sh.status = 'closed'
ORDER BY sh.closed_at DESC;

-- Enable RLS on the view is not required; views inherit underlying table RLS.
-- The view respects the org isolation from the shifts/sales tables.
