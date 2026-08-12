-- ============================================================
-- PHASE 4 MIGRATION: Height & Weight for Customers + Prescriptions
-- ============================================================

-- 1. Add height/weight to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS height numeric(5,2),
  ADD COLUMN IF NOT EXISTS weight numeric(5,2);

-- 2. Add height/weight to prescriptions table (snapshot at time of prescription)
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS height_cm numeric(5,2),
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,2);

-- 3. Verify
SELECT 'height/weight columns added' as status;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('customers', 'prescriptions')
  AND column_name IN ('height', 'weight', 'height_cm', 'weight_kg')
ORDER BY table_name, ordinal_position;
