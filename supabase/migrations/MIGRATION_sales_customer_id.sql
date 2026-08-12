-- ============================================================================
-- MIGRATION: Add customer_id to sales table
-- Required for: POS customer info collection at checkout
-- ============================================================================

-- Add customer_id column if it doesn't exist
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS customer_id uuid;

-- Add FK constraint separately (safer than inline REFERENCES)
ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_customer_id_fkey;

ALTER TABLE sales
  ADD CONSTRAINT sales_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id)
  ON DELETE SET NULL;

-- Index for fast customer sales lookups
CREATE INDEX IF NOT EXISTS sales_customer_id_idx ON sales(customer_id);
