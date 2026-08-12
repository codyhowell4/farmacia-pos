-- ============================================================
-- DAY 1 ROLLBACK — FINAL PRODUCTION VERSION
-- Reverses all Day 1 migration changes
-- Run this ONLY if the migration caused critical problems
--
-- WARNING:
-- - This will DELETE all data in the 7 new tables
-- - This will DELETE all files in the customer-documents bucket
-- - This will revert the profiles role constraint to 3 roles
-- - Existing production data (sales, inventory, users, etc.) is PRESERVED
-- ============================================================

-- ============================================================
-- STEP 1: REMOVE NEW RLS POLICIES
-- ============================================================

-- Sales
drop policy if exists "sales_staff" on sales;
drop policy if exists "sales_customer_read" on sales;

-- Doctor profiles
drop policy if exists "doctor_profiles_org_read" on doctor_profiles;
drop policy if exists "doctor_profiles_admin_all" on doctor_profiles;

-- Appointments
drop policy if exists "appointments_staff" on appointments;
drop policy if exists "appointments_customer" on appointments;
drop policy if exists "appointments_customer_insert" on appointments;

-- Preorders
drop policy if exists "preorders_staff" on preorders;
drop policy if exists "preorders_customer" on preorders;

-- Medical notes
drop policy if exists "medical_notes_staff" on medical_notes;
drop policy if exists "medical_notes_customer" on medical_notes;

-- Customer documents
drop policy if exists "customer_documents_staff" on customer_documents;
drop policy if exists "customer_documents_owner" on customer_documents;

-- Akaunting
drop policy if exists "akaunting_settings_staff" on akaunting_settings;
drop policy if exists "akaunting_mappings_staff" on akaunting_mappings;

-- Storage
drop policy if exists "customer_docs_insert_own" on storage.objects;
drop policy if exists "customer_docs_select" on storage.objects;
drop policy if exists "customer_docs_delete_own" on storage.objects;

-- ============================================================
-- STEP 2: RESTORE SALES RLS TO ORIGINAL BEHAVIOR
-- ============================================================
-- Recreate the original "org_isolation" policy that was dropped
-- during migration.

create policy "org_isolation" on sales
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

-- ============================================================
-- STEP 3: DROP MIGRATION-SPECIFIC HELPER FUNCTIONS
-- ============================================================
-- NOTE: is_admin() and get_my_org_id() existed before Day 1
-- and are kept. Only Day 1 helpers are removed.

drop function if exists is_org_staff();
drop function if exists is_customer_user();

-- ============================================================
-- STEP 4: DROP NEW TABLES (reverse dependency order)
-- ============================================================

drop table if exists akaunting_mappings cascade;
drop table if exists akaunting_settings cascade;
drop table if exists customer_documents cascade;
drop table if exists medical_notes cascade;
drop table if exists preorders cascade;
drop table if exists appointments cascade;
drop table if exists doctor_profiles cascade;

-- ============================================================
-- STEP 5: DROP STORAGE BUCKET AND OBJECTS
-- ============================================================

delete from storage.objects where bucket_id = 'customer-documents';
delete from storage.buckets where id = 'customer-documents';

-- ============================================================
-- STEP 6: DROP NEW INDEXES
-- ============================================================

drop index if exists profiles_role_org_idx;
drop index if exists sales_customer_id_idx;

-- ============================================================
-- STEP 7: REVERT ALTERATIONS TO EXISTING TABLES
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
-- First, drop any expanded constraint (by name or by content)
do $$
declare
  cname text;
begin
  -- Drop the explicitly named expanded constraint
  select conname into cname
  from pg_constraint
  where conrelid = 'profiles'::regclass
    and contype = 'c'
    and conname = 'profiles_role_check';

  if cname is not null then
    execute format('alter table profiles drop constraint %I', cname);
    raise notice 'Dropped named constraint: %', cname;
  end if;

  -- Also drop any constraint that allows doctor or customer
  -- (in case the original inline was not properly dropped)
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%doctor%'
  loop
    execute format('alter table profiles drop constraint %I', cname);
    raise notice 'Dropped expanded constraint: %', cname;
  end loop;
end $$;

-- Add back the original 3-role constraint
alter table profiles
  add constraint profiles_role_check
  check (role in ('admin', 'pos', 'inventory'));

-- ============================================================
-- STEP 8: COMPLETION CHECK
-- ============================================================
select 'Day 1 rollback complete' as status;
