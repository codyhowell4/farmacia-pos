-- ============================================================================
-- BUG PASS #10 — COMPLETE MIGRATION
-- Run this in Supabase SQL Editor (SQL → New query → Run)
-- ============================================================================
-- This migration is idempotent: running it twice is safe.
-- It creates all tables, columns, indexes, and RLS policies required for
-- Bug Pass #10 fixes.
-- ============================================================================

-- ============================================================================
-- 1. INVENTORY_MOVEMENTS (unified stock history)
--    Required by: InventoryDashboard history modal, COFEPRIS reports,
--    db.js logInventoryMovement(), db.js getInventoryMovements()
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sale', 'return', 'adjustment', 'purchase', 'void', 'edit')),
  quantity_change INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL DEFAULT 0,
  new_quantity INTEGER NOT NULL DEFAULT 0,
  reference_id uuid,
  reference_type TEXT,
  user_name TEXT,
  reason TEXT,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movements_org_id_idx ON inventory_movements(org_id);
CREATE INDEX IF NOT EXISTS inventory_movements_inventory_id_idx ON inventory_movements(inventory_id);
CREATE INDEX IF NOT EXISTS inventory_movements_created_at_idx ON inventory_movements(created_at);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inventory_movements'
      AND policyname = 'inventory_movements_org_isolation'
  ) THEN
    CREATE POLICY inventory_movements_org_isolation ON inventory_movements
      FOR ALL USING (org_id IN (
        SELECT org_id FROM profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

-- ============================================================================
-- 2. RETURNS: add missing location_id column
--    Required by: ReturnModal.jsx (sends location_id in return payload)
-- ============================================================================

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);

CREATE INDEX IF NOT EXISTS returns_location_id_idx ON returns(location_id);

-- ============================================================================
-- 3. SUPPLIER_PRODUCTS (supplier ↔ inventory mapping)
--    Required by: db.js getSupplierProducts(), upsertSupplierProduct(),
--    deleteSupplierProduct() — schema + CRUD ready, full UI deferred
-- ============================================================================

CREATE TABLE IF NOT EXISTS supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  last_cost numeric(10,2),
  preferred boolean DEFAULT false,
  lead_time_days integer,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(supplier_id, inventory_id)
);

CREATE INDEX IF NOT EXISTS supplier_products_supplier_id_idx ON supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS supplier_products_inventory_id_idx ON supplier_products(inventory_id);

ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_products'
      AND policyname = 'supplier_products_org_isolation'
  ) THEN
    CREATE POLICY supplier_products_org_isolation ON supplier_products
      FOR ALL USING (supplier_id IN (
        SELECT id FROM suppliers WHERE org_id IN (
          SELECT org_id FROM profiles WHERE id = auth.uid()
        )
      ));
  END IF;
END $$;

-- ============================================================================
-- 4. INVENTORY_BATCHES (multiple lots per product)
--    Required by: db.js getInventoryBatches(), createInventoryBatch(),
--    updateInventoryBatch() — schema + CRUD ready, full FEFO UI deferred
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  batch_number TEXT,
  quantity integer NOT NULL DEFAULT 0,
  expiration_date date,
  received_date date DEFAULT NOW(),
  po_id uuid REFERENCES purchase_orders(id),
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_batches_org_id_idx ON inventory_batches(org_id);
CREATE INDEX IF NOT EXISTS inventory_batches_inventory_id_idx ON inventory_batches(inventory_id);
CREATE INDEX IF NOT EXISTS inventory_batches_expiration_date_idx ON inventory_batches(expiration_date);

ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inventory_batches'
      AND policyname = 'inventory_batches_org_isolation'
  ) THEN
    CREATE POLICY inventory_batches_org_isolation ON inventory_batches
      FOR ALL USING (org_id IN (
        SELECT org_id FROM profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

-- ============================================================================
-- 5. BARCODE UNIQUE CONSTRAINT (per organization)
--    Required by: db.js upsertInventoryItem() duplicate-barcode check
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS inventory_org_barcode_unique
ON inventory (org_id, barcode)
WHERE barcode IS NOT NULL AND barcode <> '';

CREATE INDEX IF NOT EXISTS inventory_barcode_idx ON inventory(barcode);
