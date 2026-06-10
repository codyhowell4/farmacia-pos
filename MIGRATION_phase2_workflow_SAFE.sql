-- ============================================================
-- MIGRATION: Phase 2 — Pharmacy Workflow Enhancements (SAFE)
-- ============================================================
-- Idempotent: safe to run multiple times.
-- Hardened against:
--   • Columns already existing
--   • Constraints with system-generated names
--   • Policies already existing
--   • Indexes already existing
--
-- Run this in Supabase SQL Editor (postgres role).
-- ============================================================

-- ── 1. customer_documents: add status & updated_at ──────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_documents' AND column_name = 'status'
  ) THEN
    ALTER TABLE customer_documents ADD COLUMN status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_documents' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE customer_documents ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Ensure existing rows have a valid status (idempotent)
UPDATE customer_documents SET status = 'pending' WHERE status IS NULL;

-- Add named check constraint (drop any existing constraint on the column first)
DO $$
DECLARE
  con_name text;
BEGIN
  -- Find any existing CHECK constraint on customer_documents.status
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
  WHERE t.relname = 'customer_documents'
    AND c.contype = 'c'
    AND a.attname = 'status';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE customer_documents DROP CONSTRAINT IF EXISTS %I', con_name);
  END IF;

  -- Add our named constraint (will fail if already exists, so use IF NOT EXISTS pattern)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'customer_documents'
      AND c.conname = 'customer_documents_status_check'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE customer_documents ADD CONSTRAINT customer_documents_status_check
      CHECK (status IN ('pending','reviewed','approved','dispensed','rejected'));
  END IF;
END $$;

-- ── 2. preorders: widen status check ────────────────────────

-- Migrate old 'picked_up' to 'delivered' for naming consistency (idempotent)
UPDATE preorders SET status = 'delivered' WHERE status = 'picked_up';

DO $$
DECLARE
  con_name text;
BEGIN
  -- Find any existing CHECK constraint on preorders.status
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
      CHECK (status IN ('pending','approved','ready','delivered','completed','cancelled'));
  END IF;
END $$;

-- ── 3. sales: widen status check ────────────────────────────

DO $$
DECLARE
  con_name text;
BEGIN
  -- Find any existing CHECK constraint on sales.status
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
      CHECK (status IN ('pending','processing','ready','shipped','delivered','completed','cancelled'));
  END IF;
END $$;

-- ── 4. Create notifications table ───────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('prescription','refill','appointment','order','system')),
  title text NOT NULL,
  message text,
  related_id uuid,
  related_table text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_notifications_customer_read ON notifications(customer_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_profile_read ON notifications(profile_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(org_id, created_at DESC);

-- ── 5. RLS for notifications ────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'admin_notifications_all'
  ) THEN
    CREATE POLICY admin_notifications_all ON notifications
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role IN ('admin','manager') AND p.org_id = notifications.org_id
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'customer_notifications_own'
  ) THEN
    CREATE POLICY customer_notifications_own ON notifications
      FOR ALL TO authenticated
      USING (
        profile_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM customers c WHERE c.id = notifications.customer_id AND c.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'service_notifications_all'
  ) THEN
    CREATE POLICY service_notifications_all ON notifications
      FOR ALL TO service_role
      USING (true);
  END IF;
END $$;

-- ============================================================
-- END SAFE MIGRATION
-- ============================================================
