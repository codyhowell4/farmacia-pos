-- ============================================================
-- RESET INVENTORY (FULL)
-- Run this in the Supabase SQL Editor to completely wipe
-- inventory and all related operational history.
--
-- WHAT THIS DOES:
--   Deletes all products from inventory plus sales, returns,
--   prescriptions, patients, appointments, preorders, shifts,
--   stock movements, adjustments, batches, purchase orders,
--   customers, notifications, and audit history.
--
-- WHAT IS PRESERVED:
--   - users (auth.users + profiles)
--   - organizations, locations
--   - suppliers, tax_settings, bank_accounts, discounts
--   - akaunting_settings / akaunting_mappings / inventory_settings
--
-- WARNING:
--   This is destructive. Make a database backup first.
-- ============================================================

begin;

-- 1. Child payment / sale / return tables
DELETE FROM sale_payments;
DELETE FROM sale_items;
DELETE FROM return_items;
DELETE FROM returns;
DELETE FROM sales;

-- 2. Customer / prescription / appointment data
DELETE FROM customer_documents;
DELETE FROM prescriptions;
DELETE FROM medical_notes;
DELETE FROM preorders;
DELETE FROM appointments;

-- 3. Inventory movement / batch / supplier link tables
DELETE FROM inventory_movements;
DELETE FROM stock_adjustments;
DELETE FROM inventory_batches;
DELETE FROM supplier_products;

-- 4. Purchase orders
DELETE FROM purchase_order_items;
DELETE FROM purchase_orders;

-- 5. Customers (remove this line if you want to keep your customer list)
DELETE FROM customers;

-- 6. Doctor profiles, shifts, notifications, audit log
DELETE FROM doctor_profiles;
DELETE FROM shifts;
DELETE FROM notifications;
DELETE FROM audit_log;

-- 7. The inventory catalog itself
DELETE FROM inventory;

commit;

-- ============================================================
-- After running, verify with:
--   SELECT COUNT(*) FROM inventory;
--   SELECT COUNT(*) FROM sales;
--   SELECT COUNT(*) FROM inventory_movements;
--   SELECT COUNT(*) FROM customers;
-- They should all return 0.
-- ============================================================
