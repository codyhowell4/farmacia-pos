-- ============================================================
-- MIGRATION: Telehealth (Video Consulta)
-- Adds payment tracking to appointments and a public helper that
-- lists an org's active doctors for the public booking page.
-- Run this in Supabase SQL Editor (top to bottom).
--
-- Safe: all operations are idempotent (IF NOT EXISTS / IF EXISTS /
-- create or replace). No production data is modified or deleted.
-- ============================================================

-- ============================================================
-- STEP 1: appointments payment fields
-- payment_status drives the telehealth payment flow:
--   'unpaid'           → customer must pay before the consult
--   'paid'             → paid in full (PayPal capture or cash at POS)
--   'membership_visit' → covered by a membership visit (decremented
--                        by the video-room edge function on confirm)
--   'membership_half'  → member pays 50% of the consult price
--   'waived'           → no charge (staff courtesy)
-- payment_ref stores the processor reference (PayPal order id, etc.)
-- ============================================================

alter table appointments
  add column if not exists payment_status text not null default 'unpaid';

alter table appointments
  add column if not exists payment_ref text;

-- Named check constraint (dropped first so re-runs don't fail).
alter table appointments
  drop constraint if exists appointments_payment_status_check;

alter table appointments
  add constraint appointments_payment_status_check
  check (payment_status in ('unpaid','paid','membership_visit','membership_half','waived'));

-- ============================================================
-- STEP 2: public.get_public_doctors(p_org_id)
-- Returns the org's active doctors for the PUBLIC booking page
-- (anon callers have no direct read on profiles/doctor_profiles).
-- Security definer with explicit search_path; only exposes
-- id / full_name / specialty — nothing else.
-- ============================================================

create or replace function public.get_public_doctors(p_org_id uuid)
returns table(id uuid, full_name text, specialty text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.full_name, dp.specialty
  from profiles p
  join doctor_profiles dp on dp.profile_id = p.id
  where p.org_id = p_org_id
    and p.role = 'doctor'
    and dp.is_active
  order by p.full_name;
$$;

revoke all on function public.get_public_doctors(uuid) from public;
grant execute on function public.get_public_doctors(uuid) to anon, authenticated;

-- ============================================================
-- VERIFICATION (uncomment to run after migrating)
-- ============================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'appointments'
--   and column_name in ('payment_status', 'payment_ref');
--
-- select conname, pg_get_constraintdef(oid) as definition
-- from pg_constraint
-- where conrelid = 'appointments'::regclass
--   and conname = 'appointments_payment_status_check';
--
-- select * from public.get_public_doctors('<org-id-here>'::uuid);
