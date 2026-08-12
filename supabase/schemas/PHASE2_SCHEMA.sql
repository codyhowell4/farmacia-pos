-- ============================================================
-- PHASE 2: Inventory Management Schema Updates
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. ADD BATCH TRACKING TO INVENTORY
-- For FIFO/LIFO and expiration date tracking per batch
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS received_date date;

-- 2. CREATE STOCK ADJUSTMENTS TABLE
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid REFERENCES inventory(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  previous_quantity integer NOT NULL,
  new_quantity integer NOT NULL,
  reason text NOT NULL,
  adjusted_by uuid REFERENCES profiles(id),
  adjusted_by_name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_stock_adjustments_inventory ON stock_adjustments(inventory_id);
CREATE INDEX idx_stock_adjustments_org ON stock_adjustments(org_id);

-- RLS for stock_adjustments
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_stock_adjustments ON stock_adjustments;
CREATE POLICY org_stock_adjustments ON stock_adjustments
  FOR ALL USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- 3. ADD BATCH TRACKING TO SALE_ITEMS
-- Track which batch was sold for traceability
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS batch_number text;

-- 4. ADD LAST_SALE_DATE TO INVENTORY
-- For dead stock reporting
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS last_sale_date timestamptz;

-- 5. CREATE FUNCTION TO UPDATE LAST_SALE_DATE
CREATE OR REPLACE FUNCTION update_inventory_last_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory
  SET last_sale_date = NOW()
  WHERE id = NEW.inventory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_sale_date on sale
DROP TRIGGER IF EXISTS trg_update_last_sale ON sale_items;
CREATE TRIGGER trg_update_last_sale
  AFTER INSERT ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_last_sale();

-- 6. VERIFY ALL CHANGES
SELECT 'Inventory columns updated' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'inventory' 
AND column_name IN ('batch_number', 'supplier_id', 'received_date', 'last_sale_date');

SELECT 'Sale_items columns updated' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sale_items' 
AND column_name IN ('batch_number');

SELECT 'Stock adjustments table created' as info;
SELECT COUNT(*) as count FROM stock_adjustments;
