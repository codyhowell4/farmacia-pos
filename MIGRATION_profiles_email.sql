-- ============================================================
-- MIGRATION: Add email column to profiles
-- SAFE: add column if not exists, no data loss
-- ============================================================

alter table profiles
  add column if not exists email text;

-- Optional: index for email lookups
create index if not exists profiles_email_idx on profiles(email);

-- Verify
select column_name, data_type
from information_schema.columns
where table_name = 'profiles'
order by ordinal_position;
