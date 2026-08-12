-- ============================================================
-- FARMACIA POS — Customer Portal Database Flow Verification
-- Run these in Supabase SQL Editor to verify all tables.
-- ============================================================

-- --------------------------------------------------------
-- 1. PROFILES
-- Verify customer profiles are created with role='customer'
-- --------------------------------------------------------
SELECT
  id,
  org_id,
  full_name,
  role,
  email,
  created_at
FROM profiles
WHERE role = 'customer'
ORDER BY created_at DESC
LIMIT 10;

-- --------------------------------------------------------
-- 2. CUSTOMERS
-- Verify customers rows link profiles → customers via profile_id
-- --------------------------------------------------------
SELECT
  c.id,
  c.profile_id,
  c.org_id,
  c.full_name,
  c.email,
  c.phone,
  c.created_at,
  p.role AS profile_role
FROM customers c
LEFT JOIN profiles p ON p.id = c.profile_id
ORDER BY c.created_at DESC
LIMIT 10;

-- --------------------------------------------------------
-- 3. SALES / ORDERS
-- Verify orders have customer_id, org_id, status, total
-- --------------------------------------------------------
SELECT
  s.id,
  s.customer_id,
  s.org_id,
  s.total,
  s.status,
  s.timestamp,
  c.full_name AS customer_name
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id
ORDER BY s.timestamp DESC
LIMIT 10;

-- --------------------------------------------------------
-- 4. SALE ITEMS
-- Verify line items link to sales and inventory.
-- NOTE: sale_items has NO created_at column.
-- Use sales.timestamp via JOIN for ordering.
-- --------------------------------------------------------
SELECT
  si.id,
  si.sale_id,
  si.inventory_id,
  si.name,
  si.quantity,
  si.price,
  s.customer_id,
  s.timestamp
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
ORDER BY s.timestamp DESC
LIMIT 10;

-- --------------------------------------------------------
-- 5. APPOINTMENTS
-- Verify appointments have customer_id, org_id, type
-- --------------------------------------------------------
SELECT
  a.id,
  a.customer_id,
  a.org_id,
  a.doctor_id,
  a.appointment_date,
  a.status,
  a.type,
  a.meeting_url,
  a.notes,
  a.created_at
FROM appointments a
ORDER BY a.created_at DESC
LIMIT 10;

-- --------------------------------------------------------
-- 6. CUSTOMER DOCUMENTS (Prescriptions)
-- Verify uploaded prescriptions / documents
-- --------------------------------------------------------
SELECT
  cd.id,
  cd.customer_id,
  cd.org_id,
  cd.document_type,
  cd.file_url,
  cd.notes,
  cd.created_at
FROM customer_documents cd
ORDER BY cd.created_at DESC
LIMIT 10;

-- --------------------------------------------------------
-- 7. PREORDERS / REFILLS
-- Verify refill/preorder requests
-- --------------------------------------------------------
SELECT
  p.id,
  p.customer_id,
  p.org_id,
  p.inventory_id,
  p.quantity,
  p.status,
  p.notes,
  p.created_at
FROM preorders p
ORDER BY p.created_at DESC
LIMIT 10;

-- --------------------------------------------------------
-- 8. INVENTORY
-- Verify products available for customer shop
-- --------------------------------------------------------
SELECT
  id,
  org_id,
  name,
  "use" AS description,
  price,
  quantity AS stock,
  requires_prescription,
  category,
  image_url,
  barcode
FROM inventory
WHERE quantity > 0
ORDER BY name
LIMIT 20;

-- --------------------------------------------------------
-- 9. DIAGNOSTIC: Check for orphaned sales
-- (sales with customer_id that doesn't exist in customers)
-- --------------------------------------------------------
SELECT
  s.id,
  s.customer_id,
  s.timestamp
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id
WHERE s.customer_id IS NOT NULL
  AND c.id IS NULL
ORDER BY s.timestamp DESC
LIMIT 10;

-- --------------------------------------------------------
-- 10. DIAGNOSTIC: Check RLS policies on key tables
-- --------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd,
  qual AS using_expression
FROM pg_policies
WHERE tablename IN ('sales', 'appointments', 'customer_documents', 'preorders', 'customers')
  AND schemaname = 'public'
ORDER BY tablename, policyname;
