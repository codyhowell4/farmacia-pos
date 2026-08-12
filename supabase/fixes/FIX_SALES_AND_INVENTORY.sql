-- ============================================================
-- FIX: Sales and Inventory Issues
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Ensure decrement_inventory function exists
CREATE OR REPLACE FUNCTION decrement_inventory(p_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE inventory
  SET 
    quantity = GREATEST(0, quantity - p_qty),
    sales_count = sales_count + p_qty,
    updated_at = NOW()
  WHERE id = p_id;
END;
$$;

-- 2. Verify all required columns exist in sales table
DO $$
BEGIN
  -- Add iva_enabled if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'iva_enabled'
  ) THEN
    ALTER TABLE sales ADD COLUMN iva_enabled BOOLEAN DEFAULT true;
  END IF;

  -- Add salesperson if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'salesperson'
  ) THEN
    ALTER TABLE sales ADD COLUMN salesperson TEXT;
  END IF;

  -- Rename discount_percent to discount_value if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'discount_percent'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'discount_value'
  ) THEN
    ALTER TABLE sales RENAME COLUMN discount_percent TO discount_value;
  END IF;
END $$;

-- 3. Verify all required columns exist in sale_items table
DO $$
BEGIN
  -- Rename unit_price to price if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sale_items' AND column_name = 'unit_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sale_items' AND column_name = 'price'
  ) THEN
    ALTER TABLE sale_items RENAME COLUMN unit_price TO price;
  END IF;
END $$;

-- 4. Verify inventory table
DO $$
BEGIN
  -- Rename use_description to use if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' AND column_name = 'use_description'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' AND column_name = 'use'
  ) THEN
    ALTER TABLE inventory RENAME COLUMN use_description TO "use";
  END IF;
END $$;

-- 5. Check current table structures
SELECT 'SALES TABLE COLUMNS:' AS info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sales' 
ORDER BY ordinal_position;

SELECT 'SALE_ITEMS TABLE COLUMNS:' AS info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sale_items' 
ORDER BY ordinal_position;

SELECT 'INVENTORY TABLE COLUMNS:' AS info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'inventory' 
ORDER BY ordinal_position;

-- 6. Test the decrement function
SELECT 'Testing decrement_inventory function:' AS info;
SELECT decrement_inventory(
  (SELECT id FROM inventory LIMIT 1),
  0
) IS NULL AS function_works;
