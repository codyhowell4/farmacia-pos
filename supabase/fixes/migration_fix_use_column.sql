-- ============================================================
-- QUICK FIX: Rename use_description to use
-- Run this in Supabase SQL Editor if you have existing data
-- ============================================================

-- Rename the column to match what the app expects
-- The quotes are necessary because 'use' is a reserved word in PostgreSQL
alter table inventory rename column use_description to "use";

-- Verify the change
select column_name, data_type 
from information_schema.columns 
where table_name = 'inventory' 
order by ordinal_position;
