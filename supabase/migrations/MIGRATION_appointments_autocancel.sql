-- ============================================================
-- MIGRATION: Auto-cancel unpaid video consultas after 10 minutes
--
-- Appointments that require payment (payment_status 'unpaid' or
-- 'membership_half') and are still 'pending' 10 minutes after
-- creation are cancelled automatically so the doctor's slot is
-- released. The customer gets an in-app notification.
--
-- Three parts:
--   1. Cleanup function + pg_cron job (runs every minute)
--   2. get_doctor_booked_slots stops counting stale unpaid holds
--      (slot is released at the 10-minute mark even between cron runs)
--
-- Safe: idempotent (create or replace / drop if exists / job replaced
-- by name). No data is deleted — rows are only marked 'cancelled'.
--
-- RUN IN: Supabase SQL Editor (top to bottom, do not skip)
-- ============================================================

-- ============================================================
-- STEP 1: cleanup function + cron schedule
-- ============================================================

create extension if not exists pg_cron with schema extensions;

create or replace function public.cancel_stale_unpaid_appointments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    update appointments
    set status = 'cancelled'
    where status = 'pending'
      and payment_status in ('unpaid', 'membership_half')
      and created_at < now() - interval '10 minutes'
    returning id, org_id, customer_id, appointment_date
  loop
    v_count := v_count + 1;

    if v_row.customer_id is not null then
      insert into notifications (org_id, customer_id, type, title, message, related_id, related_table)
      values (
        v_row.org_id,
        v_row.customer_id,
        'appointment',
        'Tu cita fue cancelada por falta de pago',
        'Tu video consulta del ' || to_char(v_row.appointment_date at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') ||
          ' se canceló automáticamente porque el pago no se completó en 10 minutos. Puedes agendar de nuevo cuando quieras.',
        v_row.id,
        'appointments'
      );
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.cancel_stale_unpaid_appointments() from public;

-- Replace the schedule idempotently. NOTES:
--  - Supabase denies direct DELETE on cron.job (use cron.unschedule)
--  - some pg_cron versions ERROR on unschedule when the job is missing,
--    so run it inside an exception-swallowing block.
do $$
begin
  perform cron.unschedule('cancel-stale-unpaid-appointments');
exception when others then
  -- job did not exist yet; nothing to unschedule
  null;
end $$;

select cron.schedule(
  'cancel-stale-unpaid-appointments',
  '* * * * *',
  $$select public.cancel_stale_unpaid_appointments()$$
);

-- ============================================================
-- STEP 2: booked-slots RPC ignores stale unpaid holds
-- ============================================================
-- A pending appointment that requires payment only blocks the slot
-- for 10 minutes from creation; after that the slot is bookable again
-- even before the cron job flips the row to 'cancelled'.

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
    and a.status in ('pending', 'confirmed')
    and not (
      a.status = 'pending'
      and a.payment_status in ('unpaid', 'membership_half')
      and a.created_at < now() - interval '10 minutes'
    );
$$;

revoke all on function public.get_doctor_booked_slots(uuid, date) from public;
grant execute on function public.get_doctor_booked_slots(uuid, date) to anon, authenticated;

-- ============================================================
-- VERIFICATION (uncomment to run after migrating)
-- ============================================================
-- select jobname, schedule, active from cron.job where jobname = 'cancel-stale-unpaid-appointments';
-- select public.cancel_stale_unpaid_appointments();  -- dry check: rows currently stale
-- select * from cron.job_run_details order by start_time desc limit 5;
