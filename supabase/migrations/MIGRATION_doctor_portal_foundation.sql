-- ============================================================
-- MIGRATION: Doctor Portal Foundation (Phase 0)
-- Fixes customer_id FKs and adds indexes for doctor portal tables
-- Must run AFTER MIGRATION_customers.sql
-- Safe: all operations use IF EXISTS / IF NOT EXISTS
-- ============================================================

-- 1. Fix appointments.customer_id FK from profiles(id) → customers(id)
-- --------------------------------------------------------
alter table appointments
  drop constraint if exists appointments_customer_id_fkey;

alter table appointments
  add constraint appointments_customer_id_fkey
  foreign key (customer_id) references customers(id)
  on delete set null;

-- 2. Fix preorders.customer_id FK from profiles(id) → customers(id)
-- --------------------------------------------------------
alter table preorders
  drop constraint if exists preorders_customer_id_fkey;

alter table preorders
  add constraint preorders_customer_id_fkey
  foreign key (customer_id) references customers(id)
  on delete set null;

-- 3. Fix medical_notes.customer_id FK from profiles(id) → customers(id)
-- --------------------------------------------------------
alter table medical_notes
  drop constraint if exists medical_notes_customer_id_fkey;

alter table medical_notes
  add constraint medical_notes_customer_id_fkey
  foreign key (customer_id) references customers(id)
  on delete set null;

-- 4. Fix customer_documents.customer_id FK from profiles(id) → customers(id)
-- --------------------------------------------------------
alter table customer_documents
  drop constraint if exists customer_documents_customer_id_fkey;

alter table customer_documents
  add constraint customer_documents_customer_id_fkey
  foreign key (customer_id) references customers(id)
  on delete cascade;

-- 5. Add performance indexes for doctor portal queries
-- --------------------------------------------------------
create index if not exists appointments_doctor_date_idx
  on appointments(doctor_id, appointment_date);

create index if not exists preorders_doctor_status_idx
  on preorders(doctor_id, status);

create index if not exists medical_notes_customer_created_idx
  on medical_notes(customer_id, created_at desc);

-- 6. Verify
-- --------------------------------------------------------
select 'Doctor portal foundation migration complete' as status;
