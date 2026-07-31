-- ============================================================
-- MIGRATION: Change low stock threshold default from 10 to 0
-- Run this in the Supabase SQL Editor.
--
-- 1. Changes the column DEFAULT so new rows inserted without an
--    explicit threshold get 0 (alert only when out of stock).
-- 2. Optionally resets existing items that still have the old
--    default of 10. Comment out the UPDATE if you want to keep
--    existing per-item thresholds.
-- ============================================================

ALTER TABLE inventory
  ALTER COLUMN low_stock_threshold SET DEFAULT 0;

-- Optional: reset existing items currently at the old default of 10
UPDATE inventory SET low_stock_threshold = 0 WHERE low_stock_threshold = 10;

-- Verify
SELECT 'low_stock_threshold default changed to 0' as status;
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name = 'inventory'
  AND column_name = 'low_stock_threshold';
