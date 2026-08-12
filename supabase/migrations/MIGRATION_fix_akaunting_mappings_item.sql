-- ============================================================
-- MIGRATION: Expand akaunting_mappings entity_type constraint
-- Adds 'item' for inventory/product sync mappings
-- Safe: only expands allowed values, no data modification
-- ============================================================

-- Drop the old constraint and add the expanded one
alter table akaunting_mappings
  drop constraint if exists akaunting_mappings_entity_type_check;

alter table akaunting_mappings
  add constraint akaunting_mappings_entity_type_check
  check (entity_type in ('customer', 'sale', 'payment', 'item'));

-- Verify
select 'Constraint updated' as status;
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'akaunting_mappings'::regclass
  and contype = 'c';
