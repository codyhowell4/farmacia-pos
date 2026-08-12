-- ============================================================================
-- BUG PASS #10 — VERIFICATION QUERIES
-- Run these after applying MIGRATION_bugpass10_complete.sql
-- All queries should return at least one row (or TRUE) if the migration
-- succeeded. If any return zero rows, that object is missing.
-- ============================================================================

-- 1. Verify inventory_movements table exists
SELECT 'inventory_movements table exists' AS check_name,
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'inventory_movements') AS ok;

-- 2. Verify returns.location_id column exists
SELECT 'returns.location_id column exists' AS check_name,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'returns'
                 AND column_name = 'location_id') AS ok;

-- 3. Verify supplier_products table exists
SELECT 'supplier_products table exists' AS check_name,
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'supplier_products') AS ok;

-- 4. Verify inventory_batches table exists
SELECT 'inventory_batches table exists' AS check_name,
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'inventory_batches') AS ok;

-- 5. Verify inventory_movements RLS policy exists
SELECT 'inventory_movements RLS policy exists' AS check_name,
       EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'inventory_movements'
                 AND policyname = 'inventory_movements_org_isolation') AS ok;

-- 6. Verify barcode unique index exists
SELECT 'barcode unique index exists' AS check_name,
       EXISTS (SELECT 1 FROM pg_indexes
               WHERE schemaname = 'public'
                 AND indexname = 'inventory_org_barcode_unique') AS ok;

-- 7. Quick smoke test: can we select from inventory_movements?
SELECT 'inventory_movements selectable' AS check_name,
       (SELECT COUNT(*) >= 0 FROM inventory_movements) AS ok;

-- 8. Verify supplier_products RLS policy exists
SELECT 'supplier_products RLS policy exists' AS check_name,
       EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'supplier_products'
                 AND policyname = 'supplier_products_org_isolation') AS ok;

-- 9. Verify inventory_batches RLS policy exists
SELECT 'inventory_batches RLS policy exists' AS check_name,
       EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'inventory_batches'
                 AND policyname = 'inventory_batches_org_isolation') AS ok;
