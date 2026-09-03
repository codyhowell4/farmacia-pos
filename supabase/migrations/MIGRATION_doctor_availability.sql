-- ============================================================
-- MIGRATION: Doctor Availability (Telehealth weekly schedule)
-- Adds a jsonb weekly availability schedule to doctor_profiles,
-- self-service RLS so doctors can manage their own row, replaces
-- get_public_doctors to expose availability, and adds a helper
-- that returns the booked time slots for a doctor on a date.
-- Run this in Supabase SQL Editor (top to bottom).
--
-- Safe: all operations are idempotent (IF NOT EXISTS / IF EXISTS /
-- create or replace). No production data is modified or deleted.
-- ============================================================

-- ============================================================
-- STEP 1: doctor_profiles.availability
-- Weekly schedule in the shape:
--   { "mon": [["09:00","14:00"],["16:00","19:00"]], "tue": [], ... }
-- Keys: mon,tue,wed,thu,fri,sat,sun. Each is an array of 0+
-- [start,end] windows ("HH:MM" 24h, clinic local time
-- America/Mexico_City). A missing key means the doctor is off
-- that day. Booking slot interval: 30 minutes.
-- {} (the default) = no availability configured.
-- ============================================================

alter table doctor_profiles
  add column if not exists availability jsonb not null default '{}'::jsonb;

-- ============================================================
-- STEP 2: self-service RLS for doctors
-- Until now only org_read (select) and admin_all exist. These two
-- policies let a doctor insert/update their OWN doctor_profiles
-- row (e.g. saving availability from the doctor portal).
-- ============================================================

drop policy if exists "doctor_profiles_self_insert" on doctor_profiles;
create policy "doctor_profiles_self_insert" on doctor_profiles
  for insert with check (profile_id = auth.uid());

drop policy if exists "doctor_profiles_self_update" on doctor_profiles;
create policy "doctor_profiles_self_update" on doctor_profiles
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================
-- STEP 3: replace public.get_public_doctors(p_org_id)
-- Same behavior as MIGRATION_telehealth.sql but also returns the
-- doctor's availability schedule for the public booking page.
-- Return type changes (adds availability jsonb), so the function
-- must be dropped first — create or replace cannot change the
-- column list of an existing table-returning function.
-- Security definer with explicit search_path; only exposes
-- id / full_name / specialty / availability — nothing else.
-- ============================================================

drop function if exists public.get_public_doctors(uuid);

create or replace function public.get_public_doctors(p_org_id uuid)
returns table(id uuid, full_name text, specialty text, availability jsonb)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.full_name, dp.specialty, dp.availability
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
-- STEP 4: public.get_doctor_booked_slots(p_doctor_id, p_date)
-- Returns the distinct "HH24:MI" start times (clinic local time,
-- America/Mexico_City) already taken by pending/confirmed
-- appointments for that doctor on that date, so the public
-- booking page can grey them out.
-- ============================================================

create or replace function public.get_doctor_booked_slots(p_doctor_id uuid, p_date date)
returns setof text
language sql
security definer
stable
set search_path = public
as $$
  select distinct to_char(a.appointment_date at time zone 'America/Mexico_City', 'HH24:MI')
  from appointments a
  where a.doctor_id = p_doctor_id
    and (a.appointment_date at time zone 'America/Mexico_City')::date = p_date
    and a.status in ('pending','confirmed');
$$;

revoke all on function public.get_doctor_booked_slots(uuid, date) from public;
grant execute on function public.get_doctor_booked_slots(uuid, date) to anon, authenticated;

-- ============================================================
-- VERIFICATION (uncomment to run after migrating)
-- ============================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'doctor_profiles'
--   and column_name = 'availability';
--
-- select policyname, cmd, qual, with_check
-- from pg_policies
-- where tablename = 'doctor_profiles'
-- order by policyname;
--
-- select * from public.get_public_doctors('<org-id-here>'::uuid);
--
-- select * from public.get_doctor_booked_slots('<doctor-profile-id-here>'::uuid, current_date);
