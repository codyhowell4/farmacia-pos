-- Test if the reorder function is working correctly
-- Run this in Supabase SQL Editor

-- Test 1: Check if function exists and returns data
SELECT 'Test 1: Function exists' AS test, 
       CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_proc WHERE proname = 'get_reorder_recommendations';

-- Test 2: Try to call the function (replace with your actual org_id)
-- SELECT * FROM get_reorder_recommendations('your-org-id-here'::uuid);

-- Test 3: Check for any items that should appear
SELECT 
  i.name,
  i.quantity,
  i.low_stock_threshold,
  i.expiration_date,
  CASE WHEN i.expiration_date < CURRENT_DATE THEN true ELSE false END AS is_expired
FROM inventory i
WHERE i.quantity = 0 
   OR i.quantity <= i.low_stock_threshold
   OR (i.expiration_date IS NOT NULL AND i.expiration_date < CURRENT_DATE)
LIMIT 10;

-- Test 4: Check inventory_settings table exists
SELECT 'Test 4: inventory_settings table' AS test,
       CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.tables 
WHERE table_name = 'inventory_settings';
