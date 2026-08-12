-- ============================================================
-- DAY 1 ROLLBACK
-- Reverses all Day 1 migration changes
-- Run this ONLY if the migration caused problems
-- WARNING: This will DELETE all data in the new tables
-- ============================================================

-- ============================================================
-- STEP 1: REMOVE NEW RLS POLICIES (must happen before drops)
-- ============================================================

drop policy if exists "doctor_profiles_org_read" on doctor_profiles;
drop policy if exists "doctor_profiles_admin_all" on doctor_profiles;

drop policy if exists "appointments_staff" on appointments;
drop policy if exists "appointments_customer" on appointments;

drop policy if exists "preorders_staff" on preorders;
drop policy if exists "preorders_customer" on preorders;

drop policy if exists "medical_notes_staff" on medical_notes;
drop policy if exists "medical_notes_customer" on medical_notes;

drop policy if exists "customer_documents_staff" on customer_documents;
drop policy if exists "customer_documents_owner" on customer_documents;

drop policy if exists "akaunting_settings_staff" on akaunting_settings;
drop policy if exists "akaunting_mappings_staff" on akaunting_mappings;

drop policy if exists "sales_customer_read" on sales;

drop policy if exists "customer_docs_insert_own" on storage.objects;
drop policy if exists "customer_docs_select" on storage.objects;
drop policy if exists "customer_docs_delete_own" on storage.objects;

-- ============================================================
-- STEP 2: DROP HELPER FUNCTIONS
-- ============================================================

drop function if exists is_org_staff();
drop function if exists is_customer_user();

-- ============================================================
-- STEP 3: DROP NEW TABLES (reverse dependency order)
-- ============================================================

drop table if exists akaunting_mappings cascade;
drop table if exists akaunting_settings cascade;
drop table if exists customer_documents cascade;
drop table if exists medical_notes cascade;
drop table if exists preorders cascade;
drop table if exists appointments cascade;
drop table if exists doctor_profiles cascade;

-- ============================================================
-- STEP 4: DROP STORAGE BUCKET
-- ============================================================

-- Delete all objects first (required before bucket drop)
delete from storage.objects where bucket_id = 'customer-documents';

delete from storage.buckets where id = 'customer-documents';

-- ============================================================
-- STEP 5: REVERT ALTERATIONS TO EXISTING TABLES
-- ============================================================

-- Remove new columns from sales
alter table sales
  drop column if exists customer_id,
  drop column if exists akaunting_invoice_id,
  drop column if exists synced_at;

-- Remove new columns from profiles
alter table profiles
  drop column if exists phone,
  drop column if exists curp,
  drop column if exists date_of_birth,
  drop column if exists address,
  drop column if exists height,
  drop column if exists weight,
  drop column if exists health_goals;

-- Revert role constraint to original 3 roles
alter table profiles
  drop constraint if exists profiles_role_check;

alter table profiles
  add constraint profiles_role_check
  check (role in ('admin', 'pos', 'inventory'));

-- ============================================================
-- STEP 6: COMPLETION CHECK
-- ============================================================
select 'Day 1 rollback complete' as status;
