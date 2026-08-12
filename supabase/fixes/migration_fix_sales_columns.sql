-- ============================================================
-- FIX: Sales table column mismatches
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Rename discount_percent to discount_value (to match app)
-- Only rename if old column exists and new one doesn't
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'sales' and column_name = 'discount_percent'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_name = 'sales' and column_name = 'discount_value'
  ) then
    alter table sales rename column discount_percent to discount_value;
  end if;
end $$;

-- 2. Add iva_enabled column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'sales' and column_name = 'iva_enabled'
  ) then
    alter table sales add column iva_enabled boolean default true;
  end if;
end $$;

-- 3. Add salesperson column if it doesn't exist (app sends this, not salesperson_id/name)
-- Note: The app sends 'salesperson' but schema has 'salesperson_id' and 'salesperson_name'
-- We'll add salesperson as a text field to match what the app sends
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'sales' and column_name = 'salesperson'
  ) then
    alter table sales add column salesperson text;
  end if;
end $$;

-- Verify the changes
select column_name, data_type 
from information_schema.columns 
where table_name = 'sales' 
order by ordinal_position;
