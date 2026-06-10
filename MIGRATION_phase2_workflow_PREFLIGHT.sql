-- ============================================================
-- PREFLIGHT CHECK: Phase 2 Migration Readiness
-- ============================================================
-- Run this BEFORE applying the migration to see current state.
-- All results are read-only. No changes are made.
-- ============================================================

SELECT '=== 1. customer_documents columns ===' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'customer_documents'
ORDER BY ordinal_position;

SELECT '=== 2. preorders columns (status-related) ===' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'preorders' AND column_name IN ('status','quantity')
ORDER BY ordinal_position;

SELECT '=== 3. sales columns (status-related) ===' AS section;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'sales' AND column_name IN ('status','total','voided')
ORDER BY ordinal_position;

SELECT '=== 4. CHECK constraints on target tables ===' AS section;
SELECT
  t.relname AS table_name,
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE c.contype = 'c'
  AND t.relname IN ('customer_documents', 'preorders', 'sales')
ORDER BY t.relname, c.conname;

SELECT '=== 5. notifications table exists? ===' AS section;
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'notifications'
) AS notifications_table_exists;

SELECT '=== 6. indexes on notifications (if any) ===' AS section;
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'notifications';

SELECT '=== 7. RLS policies on notifications (if any) ===' AS section;
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'notifications';

SELECT '=== 8. Current status value counts ===' AS section;
SELECT 'preorders' AS table_name, status, COUNT(*) FROM preorders GROUP BY status
UNION ALL
SELECT 'sales' AS table_name, status, COUNT(*) FROM sales GROUP BY status
UNION ALL
SELECT 'customer_documents' AS table_name, status, COUNT(*) FROM customer_documents GROUP BY status;

SELECT '=== 9. Row counts ===' AS section;
SELECT 'preorders' AS table_name, COUNT(*) FROM preorders
UNION ALL
SELECT 'sales' AS table_name, COUNT(*) FROM sales
UNION ALL
SELECT 'customer_documents' AS table_name, COUNT(*) FROM customer_documents;

-- ============================================================
-- END PREFLIGHT
-- ============================================================
