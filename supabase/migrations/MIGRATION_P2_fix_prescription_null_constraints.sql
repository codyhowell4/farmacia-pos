-- ============================================================
-- MIGRATION: P2 Fix — Relax legacy NOT NULL constraints on prescriptions
--
-- CONTEXT:
--   The prescriptions table was originally designed for COFEPRIS-only
--   records where doctor_name and doctor_license_number were manually
--   entered by POS staff and always required.
--
--   After Phase 2, doctor-created prescriptions use doctor_id (FK to
--   profiles) instead of free-text doctor_name. The doctor's license
--   is stored in doctor_profiles.license_number. These legacy fields
--   are no longer meaningful for doctor prescriptions.
--
--   Additionally, the POS PrescriptionModal passes doctor_name and
--   doctor_license_number as null when optional fields are left empty
--   (formData.doctorName.trim() || null), which would also fail the
--   NOT NULL check even for COFEPRIS records.
--
--   This migration makes doctor_name and doctor_license_number nullable
--   while preserving NOT NULL on patient_name and prescription_date
--   (both are always populated by all code paths).
--
-- SAFETY:
--   - Idempotent: DROP NOT NULL is safe to re-run
--   - No data is modified or deleted
--   - Existing rows with values are unaffected
-- ============================================================

-- --------------------------------------------------------
-- STEP 1: Make doctor_name nullable
-- --------------------------------------------------------
ALTER TABLE prescriptions
  ALTER COLUMN doctor_name DROP NOT NULL;

-- --------------------------------------------------------
-- STEP 2: Make doctor_license_number nullable
-- --------------------------------------------------------
ALTER TABLE prescriptions
  ALTER COLUMN doctor_license_number DROP NOT NULL;

-- --------------------------------------------------------
-- VERIFICATION
-- --------------------------------------------------------

-- V1: Confirm doctor_name is now nullable
SELECT
  'doctor_name nullable' AS check_item,
  CASE WHEN is_nullable = 'YES' THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'doctor_name';

-- V2: Confirm doctor_license_number is now nullable
SELECT
  'doctor_license_number nullable' AS check_item,
  CASE WHEN is_nullable = 'YES' THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'doctor_license_number';

-- V3: Confirm patient_name is still NOT NULL (should remain required)
SELECT
  'patient_name still NOT NULL' AS check_item,
  CASE WHEN is_nullable = 'NO' THEN 'PASS' ELSE 'WARN' END AS result
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'patient_name';

-- V4: Confirm prescription_date is still NOT NULL
SELECT
  'prescription_date still NOT NULL' AS check_item,
  CASE WHEN is_nullable = 'NO' THEN 'PASS' ELSE 'WARN' END AS result
FROM information_schema.columns
WHERE table_name = 'prescriptions' AND column_name = 'prescription_date';

-- V5: Full column audit of prescriptions table
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'prescriptions'
ORDER BY ordinal_position;
