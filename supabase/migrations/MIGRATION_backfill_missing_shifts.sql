-- Backfill: create missing shifts for sales that have shift_id = NULL
-- and link those sales to the newly created synthetic shifts.
--
-- IMPORTANT:
-- - Run this in the Supabase SQL Editor.
-- - This is a one-time repair. It creates CLOSED shifts for historical sales
--   that were not linked to a shift (e.g. shift was opened but never persisted,
--   or sales were created before the shift_id linkage was added).
-- - Starting cash, closing cash, and variance are set to 0 because that
--   historical data is not available. Only sales totals are accurate.
-- - Make a backup of your database before running destructive/repair scripts.

DO $$
DECLARE
  rec record;
  new_shift_id uuid;
BEGIN
  -- Loop over each (org, location, seller, date) group that has unlinked sales.
  FOR rec IN
    SELECT
      s.org_id,
      s.location_id,
      COALESCE(s.salesperson_id, p.id) AS salesperson_id,
      COALESCE(s.salesperson_name, s.salesperson, p.full_name) AS salesperson_name,
      DATE(s.timestamp) AS sale_date,
      MIN(s.timestamp) AS first_sale,
      MAX(s.timestamp) AS last_sale
    FROM sales s
    LEFT JOIN profiles p ON p.id = s.salesperson_id
    WHERE s.shift_id IS NULL
      AND s.voided = false
    GROUP BY
      s.org_id,
      s.location_id,
      COALESCE(s.salesperson_id, p.id),
      COALESCE(s.salesperson_name, s.salesperson, p.full_name),
      DATE(s.timestamp)
  LOOP
    -- Create a synthetic closed shift that brackets the day's sales.
    INSERT INTO shifts (
      org_id,
      location_id,
      opened_by,
      opened_by_name,
      opened_at,
      closed_at,
      status,
      starting_cash,
      closing_cash,
      expected_cash,
      variance,
      notes,
      total_sales,
      total_revenue
    ) VALUES (
      rec.org_id,
      rec.location_id,
      rec.salesperson_id,
      rec.salesperson_name,
      rec.first_sale - INTERVAL '1 minute',
      rec.last_sale,
      'closed',
      0,
      0,
      0,
      0,
      'Turno generado automáticamente por backfill (datos históricos)',
      0,
      0
    )
    RETURNING id INTO new_shift_id;

    -- Link the unlinked sales for this group to the new shift.
    UPDATE sales
    SET shift_id = new_shift_id
    WHERE shift_id IS NULL
      AND org_id = rec.org_id
      AND location_id = rec.location_id
      AND COALESCE(salesperson_id, '00000000-0000-0000-0000-000000000000') = COALESCE(rec.salesperson_id, '00000000-0000-0000-0000-000000000000')
      AND COALESCE(salesperson_name, salesperson, '') = COALESCE(rec.salesperson_name, '')
      AND DATE(timestamp) = rec.sale_date
      AND voided = false;
  END LOOP;
END;
$$;

-- Recalculate totals for all shifts based on their linked sales.
WITH sales_totals AS (
  SELECT
    s.shift_id,
    COUNT(*) AS total_sales,
    SUM(s.total) AS total_revenue,
    SUM(s.discount_amount) AS total_discounts,
    SUM(s.iva_amount) AS total_tax
  FROM sales s
  WHERE s.shift_id IS NOT NULL
    AND s.voided = false
  GROUP BY s.shift_id
),
payment_totals AS (
  SELECT
    s.shift_id,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'cash') AS total_cash,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'card') AS total_card,
    SUM(sp.amount) FILTER (WHERE sp.payment_method = 'insurance') AS total_insurance
  FROM sales s
  JOIN sale_payments sp ON sp.sale_id = s.id
  WHERE s.shift_id IS NOT NULL
    AND s.voided = false
  GROUP BY s.shift_id
)
UPDATE shifts sh
SET
  total_sales = COALESCE(st.total_sales, 0),
  total_revenue = COALESCE(st.total_revenue, 0),
  total_cash = COALESCE(pt.total_cash, 0),
  total_card = COALESCE(pt.total_card, 0),
  total_insurance = COALESCE(pt.total_insurance, 0)
FROM sales_totals st
LEFT JOIN payment_totals pt ON pt.shift_id = st.shift_id
WHERE sh.id = st.shift_id;
