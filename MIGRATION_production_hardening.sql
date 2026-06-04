-- ============================================================
-- MIGRATION: Production Hardening for Akaunting Integration
-- Safe: all operations are idempotent (IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- 1. Add sync_in_progress to sales table
-- Prevents concurrent batch sync from creating duplicate invoices
-- --------------------------------------------------------
alter table sales
  add column if not exists sync_in_progress boolean not null default false;

-- Index for fast filtering of unsynced + not-in-progress sales
create index if not exists sales_unsynced_idx
  on sales(akaunting_invoice_id, voided, sync_in_progress)
  where akaunting_invoice_id is null and voided = false;

-- 2. Add payment sync tracking to sales table
-- Allows retrying failed payments without recreating invoices
-- --------------------------------------------------------
alter table sales
  add column if not exists payment_sync_status text,
  add column if not exists payment_synced_at timestamptz,
  add column if not exists payment_sync_error text;

-- 3. Expand akaunting_mappings entity_type constraint
-- Must include 'item' for product sync mappings
-- --------------------------------------------------------
alter table akaunting_mappings
  drop constraint if exists akaunting_mappings_entity_type_check;

alter table akaunting_mappings
  add constraint akaunting_mappings_entity_type_check
  check (entity_type in ('customer', 'sale', 'payment', 'item'));

-- 4. Add reverse-lookup index on akaunting_mappings
-- Needed for finding Farmacia entity from Akaunting ID
-- --------------------------------------------------------
create index if not exists akaunting_mappings_akaunting_id_idx
  on akaunting_mappings(akaunting_id);

-- 5. Add composite index for entity lookups
-- --------------------------------------------------------
create index if not exists akaunting_mappings_entity_lookup_idx
  on akaunting_mappings(entity_type, farmacia_id);

-- 6. Ensure sales has updated_at for settings save
-- (Already added per user confirmation, but making it explicit)
-- --------------------------------------------------------
-- alter table akaunting_settings add column if not exists updated_at timestamptz;

-- 7. Verification
-- --------------------------------------------------------
select 'Production hardening migration complete' as status;
