-- Migration: Add department and item_type fields to inventory table
-- Date: 2025-06-18
-- Description: Adds department categorization and product/service type to inventory items

-- Add department column
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS department VARCHAR(255);

-- Add item_type column with default 'product'
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'product' CHECK (item_type IN ('product', 'service'));

-- Add comment for documentation
COMMENT ON COLUMN inventory.department IS 'Department/category for organizing inventory items (e.g., Analgésicos, Antibióticos)';
COMMENT ON COLUMN inventory.item_type IS 'Type of item: product (physical) or service (intangible)';

-- Create index for faster department queries
CREATE INDEX IF NOT EXISTS idx_inventory_department ON inventory(department);

-- Create index for item type queries
CREATE INDEX IF NOT EXISTS idx_inventory_item_type ON inventory(item_type);

-- Update existing records to have item_type = 'product' if null
UPDATE inventory SET item_type = 'product' WHERE item_type IS NULL;

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'inventory' 
AND column_name IN ('department', 'item_type')
ORDER BY column_name;
