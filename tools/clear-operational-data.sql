-- ============================================================
-- CLEAR OPERATIONAL / TRANSACTION HISTORY
-- Run this in the Supabase SQL Editor before going live.
--
-- WHAT THIS DOES:
--   Deletes all sales, returns, prescriptions, patients,
--   appointments, preorders, shifts, stock movements,
--   adjustments, purchase orders, and audit history.
--
-- WHAT IS PRESERVED:
--   - users (auth.users + profiles)
--   - organizations, locations
--   - inventory (current stock levels are kept)
--   - suppliers, tax_settings, bank_accounts, discounts
--   - akaunting_settings / akaunting_mappings / inventory_settings
--
-- WARNING:
--   This is destructive. Make a database backup first.
-- ============================================================

begin;

-- 1. Child tables of sales / returns
DELETE FROM sale_payments;
DELETE FROM sale_items;
DELETE FROM return_items;

-- 2. Returns and sales
DELETE FROM returns;
DELETE FROM sales;

-- 3. Customer-related transactional data
DELETE FROM customer_documents;
DELETE FROM prescriptions;
DELETE FROM medical_notes;
DELETE FROM preorders;
DELETE FROM appointments;

-- 4. Inventory movement / batch / supplier-link tables
DELETE FROM inventory_movements;
DELETE FROM stock_adjustments;
DELETE FROM inventory_batches;
DELETE FROM supplier_products;

-- 5. Purchase orders
DELETE FROM purchase_order_items;
DELETE FROM purchase_orders;

-- 6. Customers / patients
DELETE FROM customers;

-- 7. Doctor profiles (keeps auth profiles)
DELETE FROM doctor_profiles;

-- 8. Shifts, notifications, audit log
DELETE FROM shifts;
DELETE FROM notifications;
DELETE FROM audit_log;

-- 9. Reset derived sales counters on inventory
UPDATE inventory SET sales_count = 0;

commit;

-- ============================================================
-- After running, run a quick verification:
--   SELECT COUNT(*) FROM sales;
--   SELECT COUNT(*) FROM inventory_movements;
--   SELECT COUNT(*) FROM customers;
-- They should all return 0.
-- ============================================================
