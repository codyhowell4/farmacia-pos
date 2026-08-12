-- ============================================================
-- PHASE 4.1 MIGRATION
-- Multiple medications + vitals + printable prescription support
-- ============================================================

-- 1. Add medications JSONB array to prescriptions
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS medications jsonb DEFAULT '[]'::jsonb;

-- 2. Add vitals columns for printable prescription
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS edad text,
  ADD COLUMN IF NOT EXISTS temperatura text,
  ADD COLUMN IF NOT EXISTS ta text,
  ADD COLUMN IF NOT EXISTS fc text,
  ADD COLUMN IF NOT EXISTS fr text,
  ADD COLUMN IF NOT EXISTS so2 text,
  ADD COLUMN IF NOT EXISTS glicemia text,
  ADD COLUMN IF NOT EXISTS alergias text,
  ADD COLUMN IF NOT EXISTS next_appointment date;

-- 3. Backfill: migrate existing single-medication prescriptions into JSONB array
UPDATE prescriptions
SET medications = jsonb_build_array(
  jsonb_build_object(
    'medication', COALESCE(medication, ''),
    'dosage', COALESCE(dosage, ''),
    'frequency', COALESCE(frequency, ''),
    'duration', COALESCE(duration, ''),
    'notes', COALESCE(notes, '')
  )
)
WHERE medications = '[]'::jsonb
  AND medication IS NOT NULL;

-- 4. Verify
SELECT 'Phase 4.1 migration complete' as status;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'prescriptions'
  AND column_name IN ('medications','edad','temperatura','ta','fc','fr','so2','glicemia','alergias','next_appointment','height_cm','weight_kg')
ORDER BY ordinal_position;
