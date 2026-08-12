-- ============================================================
-- VERIFICATION: Customer Portal Prerequisites
-- Run this after the migration to confirm everything is correct.
-- All checks return PASS or FAIL.
-- ============================================================

-- 1. customers.profile_id exists
select '01 customers.profile_id' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'customers' and column_name = 'profile_id'
  ) then 'PASS' else 'FAIL' end as result;

-- 2. customers.profile_id unique index exists
select '02 customers_profile_id_idx' as check_item,
  case when exists (
    select 1 from pg_indexes
    where tablename = 'customers' and indexname = 'customers_profile_id_idx'
  ) then 'PASS' else 'FAIL' end as result;

-- 3. sales.status exists
select '03 sales.status' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'sales' and column_name = 'status'
  ) then 'PASS' else 'FAIL' end as result;

-- 4. appointments.type exists
select '04 appointments.type' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'appointments' and column_name = 'type'
  ) then 'PASS' else 'FAIL' end as result;

-- 5. appointments.meeting_url exists
select '05 appointments.meeting_url' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'appointments' and column_name = 'meeting_url'
  ) then 'PASS' else 'FAIL' end as result;

-- 6. appointments.meeting_id exists
select '06 appointments.meeting_id' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'appointments' and column_name = 'meeting_id'
  ) then 'PASS' else 'FAIL' end as result;

-- 7. inventory.category exists
select '07 inventory.category' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'inventory' and column_name = 'category'
  ) then 'PASS' else 'FAIL' end as result;

-- 8. inventory.image_url exists
select '08 inventory.image_url' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'inventory' and column_name = 'image_url'
  ) then 'PASS' else 'FAIL' end as result;

-- 9. profiles.email exists
select '09 profiles.email' as check_item,
  case when exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'email'
  ) then 'PASS' else 'FAIL' end as result;

-- 10. handle_new_user trigger exists on auth.users
select '10 on_auth_user_created trigger' as check_item,
  case when exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then 'PASS' else 'FAIL' end as result;

-- 11. handle_new_user function defaults to 'customer' role
select '11 trigger defaults to customer' as check_item,
  case when pg_get_functiondef(
    (select oid from pg_proc where proname = 'handle_new_user')
  ) like '%''customer''%' then 'PASS' else 'FAIL' end as result;

-- 12. sales_customer_read policy uses customers.profile_id subquery
select '12 sales_customer_read RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'sales' and policyname = 'sales_customer_read'
      and qual like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- 13. sales_customer_update policy uses customers.profile_id subquery
select '13 sales_customer_update RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'sales' and policyname = 'sales_customer_update'
      and qual like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- 14. appointments_customer policy uses customers.profile_id subquery
select '14 appointments_customer RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'appointments' and policyname = 'appointments_customer'
      and qual like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- 15. appointments_customer_insert policy uses customers.profile_id subquery
select '15 appointments_customer_insert RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'appointments' and policyname = 'appointments_customer_insert'
      and with_check like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- 16. appointments_customer_update policy uses customers.profile_id subquery
select '16 appointments_customer_update RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'appointments' and policyname = 'appointments_customer_update'
      and qual like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- 17. preorders_customer policy uses customers.profile_id subquery
select '17 preorders_customer RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'preorders' and policyname = 'preorders_customer'
      and qual like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- 18. preorders_customer_insert policy uses customers.profile_id subquery
select '18 preorders_customer_insert RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'preorders' and policyname = 'preorders_customer_insert'
      and with_check like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- 19. preorders_customer_update policy uses customers.profile_id subquery
select '19 preorders_customer_update RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'preorders' and policyname = 'preorders_customer_update'
      and qual like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- 20. medical_notes_customer policy uses customers.profile_id subquery
select '20 medical_notes_customer RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'medical_notes' and policyname = 'medical_notes_customer'
      and qual like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- 21. customer_documents_owner policy uses customers.profile_id subquery
select '21 customer_documents_owner RLS' as check_item,
  case when exists (
    select 1 from pg_policies
    where tablename = 'customer_documents' and policyname = 'customer_documents_owner'
      and qual like '%customers%profile_id%auth.uid()%'
  ) then 'PASS' else 'FAIL' end as result;

-- ============================================================
-- SUMMARY
-- ============================================================

select '--- SUMMARY ---' as check_item, '' as result;

select
  count(*) filter (where result = 'PASS')::text || ' / ' || count(*)::text || ' checks passed' as summary
from (
  select case when exists (select 1 from information_schema.columns where table_name = 'customers' and column_name = 'profile_id') then 'PASS' else 'FAIL' end as result union all
  select case when exists (select 1 from pg_indexes where tablename = 'customers' and indexname = 'customers_profile_id_idx') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from information_schema.columns where table_name = 'sales' and column_name = 'status') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from information_schema.columns where table_name = 'appointments' and column_name = 'type') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from information_schema.columns where table_name = 'appointments' and column_name = 'meeting_url') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from information_schema.columns where table_name = 'appointments' and column_name = 'meeting_id') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from information_schema.columns where table_name = 'inventory' and column_name = 'category') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from information_schema.columns where table_name = 'inventory' and column_name = 'image_url') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'email') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass) then 'PASS' else 'FAIL' end union all
  select case when pg_get_functiondef((select oid from pg_proc where proname = 'handle_new_user')) like '%''customer''%' then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'sales' and policyname = 'sales_customer_read' and qual like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'sales' and policyname = 'sales_customer_update' and qual like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'appointments' and policyname = 'appointments_customer' and qual like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'appointments' and policyname = 'appointments_customer_insert' and with_check like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'appointments' and policyname = 'appointments_customer_update' and qual like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'preorders' and policyname = 'preorders_customer' and qual like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'preorders' and policyname = 'preorders_customer_insert' and with_check like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'preorders' and policyname = 'preorders_customer_update' and qual like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'medical_notes' and policyname = 'medical_notes_customer' and qual like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end union all
  select case when exists (select 1 from pg_policies where tablename = 'customer_documents' and policyname = 'customer_documents_owner' and qual like '%customers%profile_id%auth.uid()%') then 'PASS' else 'FAIL' end
) as checks;
