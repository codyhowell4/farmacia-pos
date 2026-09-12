-- ============================================================
-- MIGRATION: send-notifications cron — known-good, self-proving
-- Date: 2026-09-12
--
-- The old 5-minute notification flush job was created by hand and
-- silently stopped working (queue rows sat pending 10+ minutes).
-- This migration replaces it with a definition we control and adds
-- observability so the job's health can be verified from the public
-- API instead of guessed at:
--
--   1. pg_net extension (SQL → Edge Function HTTP calls)
--   2. cron_heartbeat table — every send-notifications invocation
--      writes a row; anon-readable so `curl .../cron_heartbeat`
--      proves the cron fires. No PII, just job/source/timestamp.
--   3. A fresh 'send-notifications-flush' pg_cron job (every 5 min)
--      with an x-cron-job header so cron fires are distinguishable
--      from manual invocations in the heartbeat.
--   4. Instant flush: a trigger on notification_queue fires the
--      flush as soon as a due row is enqueued (booking confirmations,
--      receipts, welcome emails land in seconds). The 5-min cron is
--      the guaranteed backstop — and the only path for rows scheduled
--      in the future (appointment reminders).
--
-- Run in Supabase SQL Editor (top to bottom).
-- ============================================================

-- ============================================================
-- STEP 1: pg_net
-- ============================================================
create extension if not exists pg_net;

-- ============================================================
-- STEP 2: cron_heartbeat — public proof the scheduler is alive
-- ============================================================
create table if not exists public.cron_heartbeat (
  id bigint generated always as identity primary key,
  job text not null,
  source text not null default 'manual',
  ran_at timestamptz not null default now()
);

alter table public.cron_heartbeat enable row level security;

-- Anyone (including anon) may READ the heartbeat — it carries no
-- customer data, only job name/source/timestamp. Writes happen only
-- from the edge function via the service role (which bypasses RLS).
drop policy if exists cron_heartbeat_public_read on public.cron_heartbeat;
create policy cron_heartbeat_public_read on public.cron_heartbeat
  for select using (true);

-- ============================================================
-- STEP 3: the 5-minute flush job, defined properly
-- ============================================================
do $$
begin
  perform cron.unschedule('send-notifications-flush');
exception when others then
  null;
end $$;

-- Best-effort cleanup of the old hand-made job under likely names.
do $$
begin
  perform cron.unschedule('send-notifications');
exception when others then
  null;
end $$;

select cron.schedule(
  'send-notifications-flush',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://ieinjhonepkudxxpmuly.supabase.co/functions/v1/send-notifications',
    headers := '{"Content-Type": "application/json", "x-cron-job": "send-notifications-flush"}'::jsonb,
    body := '{}'::jsonb
  );
  $job$
);

-- ============================================================
-- STEP 4: instant flush on enqueue (due rows only)
-- Rows scheduled for the future (reminders) wait for the cron.
-- NOTE: pg_net fires asynchronously and may beat the committing
-- transaction — a miss only means the row waits for the 5-min
-- backstop, never that it is lost.
-- ============================================================
create or replace function public.flush_notification_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://ieinjhonepkudxxpmuly.supabase.co/functions/v1/send-notifications',
    headers := '{"Content-Type": "application/json", "x-cron-job": "enqueue-trigger"}'::jsonb,
    body := '{}'::jsonb
  );
  return new;
end;
$$;

revoke all on function public.flush_notification_queue() from public;

drop trigger if exists notification_queue_flush_on_insert on public.notification_queue;
create trigger notification_queue_flush_on_insert
  after insert on public.notification_queue
  for each row
  when (new.scheduled_for <= now())
  execute function public.flush_notification_queue();

-- ============================================================
-- VERIFICATION
-- ============================================================
-- 1. Jobs now registered (should include send-notifications-flush):
select jobid, jobname, schedule, active from cron.job order by jobid;
--
-- 2. Within 5-10 minutes, cron-sourced heartbeats appear:
--    curl "<project-url>/rest/v1/cron_heartbeat?select=job,source,ran_at&order=ran_at.desc&limit=5" \
--      -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"
