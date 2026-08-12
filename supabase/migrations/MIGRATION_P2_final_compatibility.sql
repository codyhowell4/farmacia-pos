-- ============================================================
-- MIGRATION: P2 Final Compatibility — prescription_date DEFAULT
--
-- PURPOSE:
--   After doctor prescriptions were added, the only remaining
--   NOT NULL columns that could potentially block inserts are:
--     • patient_name        — always provided by all code paths
--     • prescription_number — set by BEFORE INSERT trigger
--     • prescription_date   — always provided by all code paths
--
--   This migration adds DEFAULT CURRENT_DATE to prescription_date
--   as a safety net. If future code forgets to provide it, the
--   database auto-fills with today's date.
--
--   A prescription without a date is meaningless, so NOT NULL
--   is preserved. The default simply makes the schema robust.
--
-- SAFETY:
--   - Idempotent: ALTER COLUMN SET DEFAULT is safe to re-run
--   - No data is modified or deleted
--   - Backwards compatible: existing code continues to work
-- ============================================================

-- Add DEFAULT CURRENT_DATE to prescription_date
ALTER TABLE prescriptions
  ALTER COLUMN prescription_date SET DEFAULT CURRENT_DATE;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- V1: Confirm prescription_date has a default
SELECT
  'prescription_date DEFAULT' AS check_item,
  CASE WHEN column_default IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS result,
  column_default AS default_value
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'prescription_date';

-- V2: Confirm patient_name is still NOT NULL
SELECT
  'patient_name NOT NULL' AS check_item,
  CASE WHEN is_nullable = 'NO' THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'patient_name';

-- V3: Confirm prescription_number is still NOT NULL
SELECT
  'prescription_number NOT NULL' AS check_item,
  CASE WHEN is_nullable = 'NO' THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'prescription_number';

-- V4: Confirm prescription_date is still NOT NULL
SELECT
  'prescription_date NOT NULL' AS check_item,
  CASE WHEN is_nullable = 'NO' THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'prescription_date';

-- V5: Confirm doctor_name is now nullable
SELECT
  'doctor_name nullable' AS check_item,
  CASE WHEN is_nullable = 'YES' THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'doctor_name';

-- V6: Confirm doctor_license_number is now nullable
SELECT
  'doctor_license_number nullable' AS check_item,
  CASE WHEN is_nullable = 'YES' THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'doctor_license_number';

-- V7: Full column listing
SELECT
  column_name,
  data_type,
  is_nullable,
  COALESCE(column_default, '') AS default_value
FROM information_schema.columns
WHERE table_name = 'prescriptions'
ORDER BY ordinal_position;
