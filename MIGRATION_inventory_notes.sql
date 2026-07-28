-- ============================================================
-- MIGRATION: General notes field for inventory items
-- Run this in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS notes text;

-- Verify
SELECT 'inventory.notes column added' as status;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'inventory'
  AND column_name = 'notes';
