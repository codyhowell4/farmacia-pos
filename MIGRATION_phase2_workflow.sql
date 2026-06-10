-- ============================================================
-- MIGRATION: Phase 2 — Pharmacy Workflow Enhancements
-- ============================================================
-- 1. Add status + updated_at to customer_documents
-- 2. Widen preorders status check constraint
-- 3. Widen sales status check constraint
-- 4. Create notifications table
-- 5. Add RLS policies for notifications
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

-- Update existing rows to have a valid status
UPDATE customer_documents SET status = 'pending' WHERE status IS NULL;

-- Add check constraint for customer_documents.status
DO $$
BEGIN
  ALTER TABLE customer_documents DROP CONSTRAINT IF EXISTS customer_documents_status_check;
  ALTER TABLE customer_documents ADD CONSTRAINT customer_documents_status_check
    CHECK (status IN ('pending','reviewed','approved','dispensed','rejected'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add customer_documents status check: %', SQLERRM;
END $$;

-- ── 2. preorders: widen status check ────────────────────────

DO $$
BEGIN
  ALTER TABLE preorders DROP CONSTRAINT IF EXISTS preorders_status_check;
  ALTER TABLE preorders ADD CONSTRAINT preorders_status_check
    CHECK (status IN ('pending','approved','ready','delivered','completed','cancelled','picked_up'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not modify preorders status constraint: %', SQLERRM;
END $$;

-- Migrate old 'picked_up' to 'delivered' for consistency
UPDATE preorders SET status = 'delivered' WHERE status = 'picked_up';

-- ── 3. sales: widen status check ────────────────────────────

DO $$
BEGIN
  ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
  ALTER TABLE sales ADD CONSTRAINT sales_status_check
    CHECK (status IN ('pending','processing','ready','shipped','delivered','completed','cancelled'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not modify sales status constraint: %', SQLERRM;
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

-- Index for fast unread lookups
CREATE INDEX IF NOT EXISTS idx_notifications_customer_read ON notifications(customer_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_profile_read ON notifications(profile_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(org_id, created_at DESC);

-- ── 5. RLS policies for notifications ───────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Admins see all notifications for their org
CREATE POLICY IF NOT EXISTS admin_notifications_all ON notifications
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','manager') AND p.org_id = notifications.org_id
    )
  );

-- Customers see their own notifications
CREATE POLICY IF NOT EXISTS customer_notifications_own ON notifications
  FOR ALL TO authenticated
  USING (
    profile_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM customers c WHERE c.id = notifications.customer_id AND c.profile_id = auth.uid()
    )
  );

-- Service role / trigger bypass
CREATE POLICY IF NOT EXISTS service_notifications_all ON notifications
  FOR ALL TO service_role
  USING (true);

-- ============================================================
-- END MIGRATION
-- ============================================================
