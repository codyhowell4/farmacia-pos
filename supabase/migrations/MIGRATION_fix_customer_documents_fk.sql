-- ============================================================
-- MIGRATION: Fix customer_documents FK + Storage Bucket
-- Run this in Supabase SQL Editor if prescription uploads fail
-- with "foreign key constraint" or "Bucket not found" errors.
-- ============================================================

-- --------------------------------------------------------
-- STEP 1: Fix customer_documents.customer_id FK
-- It may still reference profiles(id) from old schema.
-- Must reference customers(id) to match the API.
-- --------------------------------------------------------
alter table customer_documents
  drop constraint if exists customer_documents_customer_id_fkey;

alter table customer_documents
  add constraint customer_documents_customer_id_fkey
  foreign key (customer_id) references customers(id)
  on delete cascade;

-- Also fix medical_notes if it has the same problem
alter table medical_notes
  drop constraint if exists medical_notes_customer_id_fkey;

alter table medical_notes
  add constraint medical_notes_customer_id_fkey
  foreign key (customer_id) references customers(id)
  on delete set null;

-- --------------------------------------------------------
-- STEP 2: Ensure Storage bucket exists for file uploads
-- This uses the supabase_admin / service_role pattern.
-- Run as postgres or service_role.
-- --------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('customer-documents', 'customer-documents', true)
on conflict (id) do nothing;

-- --------------------------------------------------------
-- STEP 3: Allow authenticated users to upload to the bucket
-- --------------------------------------------------------
create policy "Allow authenticated uploads"
on storage.objects for insert
with check (bucket_id = 'customer-documents');

create policy "Allow authenticated reads"
on storage.objects for select
using (bucket_id = 'customer-documents');

-- --------------------------------------------------------
-- STEP 4: Verify
-- --------------------------------------------------------
select 'customer_documents FK fixed' as status;

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'customer_documents'::regclass
  and contype = 'f';
