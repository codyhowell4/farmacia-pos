-- ============================================================
-- ROLLBACK: Production Hardening
-- Reverses MIGRATION_production_hardening.sql
-- WARNING: Drops columns and indexes. Data in those columns is lost.
-- ============================================================

-- 1. Drop indexes
-- --------------------------------------------------------
drop index if exists sales_unsynced_idx;
drop index if exists akaunting_mappings_akaunting_id_idx;
drop index if exists akaunting_mappings_entity_lookup_idx;

-- 2. Drop columns from sales
-- --------------------------------------------------------
alter table sales
  drop column if exists sync_in_progress,
  drop column if exists payment_sync_status,
  drop column if exists payment_synced_at,
  drop column if exists payment_sync_error;

-- 3. Revert entity_type constraint to original 3 values
-- --------------------------------------------------------
alter table akaunting_mappings
  drop constraint if exists akaunting_mappings_entity_type_check;

alter table akaunting_mappings
  add constraint akaunting_mappings_entity_type_check
  check (entity_type in ('customer', 'sale', 'payment'));

-- 4. Completion
-- --------------------------------------------------------
select 'Production hardening rollback complete' as status;
