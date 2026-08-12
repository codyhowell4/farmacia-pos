-- ============================================================
-- ROLLBACK: Phase 2 — Pharmacy Workflow Enhancements
-- ============================================================
-- Reverses all changes made by MIGRATION_phase2_workflow_SAFE.sql
--
-- WARNING:
--   • This will DELETE the notifications table and all its data.
--   • Status values outside old constraints will be reset.
--   • customer_documents.status and updated_at columns are KEPT
--     (to preserve data), but their CHECK constraint is dropped.
--
-- Run this in Supabase SQL Editor (postgres role).
-- ============================================================

-- ── 1. Revert customer_documents status constraint ───────────

-- Reset any statuses outside the original range to 'pending'
-- (Original table had no status column, so we simply allow any value
--  by dropping the named CHECK constraint.)
UPDATE customer_documents SET status = 'pending'
WHERE status NOT IN ('pending');

DO $$
BEGIN
  ALTER TABLE customer_documents DROP CONSTRAINT IF EXISTS customer_documents_status_check;
END $$;

-- NOTE: We intentionally do NOT drop the `status` and `updated_at` columns
-- to preserve data. If you need to fully revert, run manually:
--   ALTER TABLE customer_documents DROP COLUMN IF EXISTS status;
--   ALTER TABLE customer_documents DROP COLUMN IF EXISTS updated_at;

-- ── 2. Revert preorders status constraint ────────────────────

-- Reset new statuses to values valid under the old constraint
UPDATE preorders SET status = 'pending'
WHERE status NOT IN ('pending','ready','picked_up','cancelled');

-- Migrate 'delivered' back to 'picked_up' (old naming)
UPDATE preorders SET status = 'picked_up' WHERE status = 'delivered';

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
  WHERE t.relname = 'preorders'
    AND c.contype = 'c'
    AND a.attname = 'status';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE preorders DROP CONSTRAINT IF EXISTS %I', con_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'preorders'
      AND c.conname = 'preorders_status_check'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE preorders ADD CONSTRAINT preorders_status_check
      CHECK (status IN ('pending','ready','picked_up','cancelled'));
  END IF;
END $$;

-- ── 3. Revert sales status constraint ────────────────────────

-- Reset new statuses to values valid under the old constraint
UPDATE sales SET status = 'processing'
WHERE status NOT IN ('processing','shipped','delivered','cancelled');

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
  WHERE t.relname = 'sales'
    AND c.contype = 'c'
    AND a.attname = 'status';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sales DROP CONSTRAINT IF EXISTS %I', con_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'sales'
      AND c.conname = 'sales_status_check'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_status_check
      CHECK (status IN ('processing','shipped','delivered','cancelled'));
  END IF;
END $$;

-- ── 4. Drop notifications table and all related objects ─────

-- Drop policies first (depends on table)
DO $$
BEGIN
  DROP POLICY IF EXISTS admin_notifications_all ON notifications;
  DROP POLICY IF EXISTS customer_notifications_own ON notifications;
  DROP POLICY IF EXISTS service_notifications_all ON notifications;
END $$;

-- Drop indexes (depends on table)
DROP INDEX IF EXISTS idx_notifications_customer_read;
DROP INDEX IF EXISTS idx_notifications_profile_read;
DROP INDEX IF EXISTS idx_notifications_org;

-- Drop table (cascades constraints)
DROP TABLE IF EXISTS notifications;

-- ============================================================
-- END ROLLBACK
-- ============================================================
