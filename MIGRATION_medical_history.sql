-- ============================================================
-- MIGRATION: Medical History (Historia Clínica) for Customers
-- Run this in the Supabase SQL Editor.
--
-- Adds a single JSONB column `medical_history` to `customers`.
-- Structure (all keys optional, each is an array of entries):
--   {
--     "alergias":           [{ "label": "...", "value": "...", "status": "positive" | "denied" }],
--     "patologicos":        [...],
--     "no_patologicos":     [...],
--     "heredofamiliares":   [...],
--     "gineco_obstetricos": [...],
--     "vacunacion":         [...],
--     "perinatales":        [...]
--   }
--
-- No new RLS needed: the existing `customers_staff_all` policy
-- already covers all columns on this table.
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS medical_history jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Verify
SELECT 'medical_history column added' as status;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'customers'
  AND column_name = 'medical_history';
