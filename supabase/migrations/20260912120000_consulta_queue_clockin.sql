-- ============================================================
-- MIGRATION: Consulta queue, doctor clock-in/out, coverage
-- Date: 2026-09-12
--
-- Supports the "Empezar Consulta" two-step flow (confirmed →
-- in_consulta → completed), real wait times for the customer app,
-- doctor clock-in/clock-out, and salon-style coverage:
--   - unassigned in-person citas are free to grab
--   - citas of doctors who are NOT clocked in can be taken over
--     by a clocked-in doctor (with acknowledgement), rescheduled,
--     or cancelled (membership video visits are refunded on cancel)
--
-- Safe: idempotent (IF NOT EXISTS / IF EXISTS / create or replace).
-- Run in Supabase SQL Editor (top to bottom).
-- ============================================================

-- ============================================================
-- STEP 1: appointments — new status + consulta/takeover columns
-- ============================================================

-- 'in_consulta' = doctor clicked "Empezar Consulta", consult happening now
alter table appointments
  drop constraint if exists appointments_status_check;

alter table appointments
  add constraint appointments_status_check
  check (status in ('pending','confirmed','in_consulta','completed','cancelled'));

-- Unassigned queue entries: in-person bookings from the customer app
-- arrive without a doctor and are claimed by a clocked-in doctor.
alter table appointments
  alter column doctor_id drop not null;

alter table appointments
  add column if not exists consulta_started_at timestamptz,
  add column if not exists consulta_ended_at timestamptz,
  add column if not exists original_doctor_id uuid references profiles(id),
  add column if not exists taken_over_by uuid references profiles(id),
  add column if not exists taken_over_at timestamptz,
  add column if not exists cancelled_reason text;

-- ============================================================
-- STEP 2: consulta_notes — NOM-004 6.2.3 resultados de estudios
-- ============================================================

alter table consulta_notes
  add column if not exists resultados_estudios text;

-- ============================================================
-- STEP 3: doctor_shifts — clock-in/clock-out
-- A row with clock_out_at IS NULL means the doctor is on shift NOW.
-- ============================================================

create table if not exists doctor_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  doctor_id uuid not null references profiles(id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists doctor_shifts_org_active_idx
  on doctor_shifts(org_id, clock_out_at);
create index if not exists doctor_shifts_doctor_idx
  on doctor_shifts(doctor_id, clock_in_at desc);

alter table doctor_shifts enable row level security;

-- Staff can see who is on shift (needed for the coverage view)
drop policy if exists "doctor_shifts_staff_read" on doctor_shifts;
create policy "doctor_shifts_staff_read" on doctor_shifts
  for select using (org_id = get_my_org_id() and is_org_staff());

-- Doctors clock themselves in/out only
drop policy if exists "doctor_shifts_self_insert" on doctor_shifts;
create policy "doctor_shifts_self_insert" on doctor_shifts
  for insert with check (doctor_id = auth.uid() and org_id = get_my_org_id());

drop policy if exists "doctor_shifts_self_update" on doctor_shifts;
create policy "doctor_shifts_self_update" on doctor_shifts
  for update using (doctor_id = auth.uid() and org_id = get_my_org_id());

-- ============================================================
-- STEP 4: public.get_queue_status(p_org_id)
-- Powers the wait-time display in the customer app.
--   waiting        = today's in-person citas pending/confirmed
--   in_consulta    = citas being attended right now
--   consult_minutes / video_consult_minutes = assumed durations
--     (27 min in-person per business rule 25-30; 18 min video per 15-20;
--      to be refined from real consulta_started/ended timestamps later)
--   estimated_wait_minutes = null when no doctor is clocked in —
--     the app then falls back to the schedule-based estimate.
-- Public (anon) because the app shows wait times before login.
-- Exposes only counts — no patient data.
-- ============================================================

create or replace function public.get_queue_status(p_org_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_doctors int;
  v_waiting int;
  v_in_consulta int;
  v_consult_minutes int := 27;
  v_video_minutes int := 18;
  v_est int;
  v_today date := (now() at time zone 'America/Mexico_City')::date;
begin
  select count(distinct doctor_id) into v_doctors
  from doctor_shifts
  where org_id = p_org_id
    and clock_out_at is null;

  select count(*) into v_waiting
  from appointments
  where org_id = p_org_id
    and type = 'in_person'
    and status in ('pending', 'confirmed')
    and (appointment_date at time zone 'America/Mexico_City')::date = v_today;

  select count(*) into v_in_consulta
  from appointments
  where org_id = p_org_id
    and status = 'in_consulta'
    and (appointment_date at time zone 'America/Mexico_City')::date = v_today;

  if v_doctors > 0 then
    v_est := ceil(v_waiting::numeric / v_doctors) * v_consult_minutes;
    v_est := (round(v_est / 5.0) * 5)::int;
  else
    v_est := null;
  end if;

  return jsonb_build_object(
    'doctors_on_clock', v_doctors,
    'waiting', v_waiting,
    'in_consulta', v_in_consulta,
    'consult_minutes', v_consult_minutes,
    'video_consult_minutes', v_video_minutes,
    'estimated_wait_minutes', v_est
  );
end;
$$;

revoke all on function public.get_queue_status(uuid) from public;
grant execute on function public.get_queue_status(uuid) to anon, authenticated;

-- ============================================================
-- STEP 5: public.cancel_appointment_staff(p_appointment_id, p_reason)
-- Staff-side cancellation with membership-visit refund.
-- A video cita confirmed with payment_status='membership_visit' had
-- one visit decremented by the video-room edge function at confirm
-- time; cancelling returns that visit (capped at visits_limit).
-- In-person membership visits are charged at the POS after the
-- consult, so there is nothing to refund for those.
-- ============================================================

create or replace function public.cancel_appointment_staff(
  p_appointment_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt appointments%rowtype;
  v_refunded boolean := false;
begin
  select * into v_appt from appointments where id = p_appointment_id;
  if not found then
    raise exception 'Cita no encontrada';
  end if;
  if v_appt.org_id <> get_my_org_id() or not is_org_staff() then
    raise exception 'No autorizado';
  end if;
  if v_appt.status in ('completed', 'cancelled') then
    raise exception 'La cita ya está %', v_appt.status;
  end if;

  update appointments
  set status = 'cancelled',
      cancelled_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_appointment_id;

  if v_appt.type = 'video'
     and v_appt.payment_status = 'membership_visit'
     and v_appt.status in ('confirmed', 'in_consulta')
     and v_appt.customer_id is not null then
    update memberships
    set visits_remaining = least(visits_remaining + 1, visits_limit),
        updated_at = now()
    where id = (
      select id from memberships
      where customer_id = v_appt.customer_id
        and status = 'active'
      order by created_at desc
      limit 1
    );
    v_refunded := found;
  end if;

  return jsonb_build_object('cancelled', true, 'visit_refunded', v_refunded);
end;
$$;

revoke all on function public.cancel_appointment_staff(uuid, text) from public;
revoke execute on function public.cancel_appointment_staff(uuid, text) from anon;
grant execute on function public.cancel_appointment_staff(uuid, text) to authenticated;

-- ============================================================
-- VERIFICATION (uncomment to run after migrating)
-- ============================================================
-- select conname, pg_get_constraintdef(oid) as definition
-- from pg_constraint
-- where conrelid = 'appointments'::regclass and conname = 'appointments_status_check';
--
-- select * from public.get_queue_status('<org-id-here>'::uuid);
-- select * from doctor_shifts limit 5;
