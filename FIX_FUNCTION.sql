-- ============================================================
-- FIX: Create decrement_inventory function and verify
-- ============================================================

-- 1. First, let's see if inventory exists
SELECT 'Inventory count:' as info, COUNT(*) as count FROM inventory;

-- 2. Drop and recreate the function with better error handling
DROP FUNCTION IF EXISTS decrement_inventory(uuid, integer);

CREATE OR REPLACE FUNCTION decrement_inventory(p_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory_exists boolean;
BEGIN
  -- Check if inventory item exists
  SELECT EXISTS(SELECT 1 FROM inventory WHERE id = p_id) INTO v_inventory_exists;
  
  IF NOT v_inventory_exists THEN
    RAISE EXCEPTION 'Inventory item with id % not found', p_id;
  END IF;
  
  -- Update the inventory
  UPDATE inventory
  SET 
    quantity = GREATEST(0, quantity - p_qty),
    sales_count = COALESCE(sales_count, 0) + p_qty,
    updated_at = NOW()
  WHERE id = p_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update inventory item %', p_id;
  END IF;
END;
$$;

-- 3. Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION decrement_inventory(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_inventory(uuid, integer) TO anon;

-- 4. Test the function with a dummy UUID (should fail gracefully with our error)
DO $$
DECLARE
  test_result text;
BEGIN
  -- Try with a real inventory ID if one exists
  PERFORM decrement_inventory(
    COALESCE(
      (SELECT id FROM inventory LIMIT 1),
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    0
  );
  test_result := 'Function executed successfully';
  RAISE NOTICE '%', test_result;
EXCEPTION
  WHEN OTHERS THEN
    test_result := 'Function exists but test failed: ' || SQLERRM;
    RAISE NOTICE '%', test_result;
END;
$$;

-- 5. Verify function exists
SELECT 
  proname as function_name,
  prosrc as function_source
FROM pg_proc 
WHERE proname = 'decrement_inventory';

-- 6. Check if function is in the right schema
SELECT 
  n.nspname as schema_name,
  p.proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'decrement_inventory';
