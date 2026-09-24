-- MIGRATION: borradores de consulta/historia (24 h) + cierre automático
-- Date: 2026-09-25
--
-- Doctors can pause a consulta without losing the note: the working copy
-- lives in consulta_drafts / historia_drafts. Drafts are NOT part of the
-- legal expediente — they are mutable, never exported (NOM-024 6.6.6 exports
-- only finalized documents) and are deleted when the note/historia is
-- finalized through the normal append-only path.
--
-- NOM-004 expects the nota de evolución after each attention, so a borrador
-- cannot live forever: a pg_cron job finalizes consulta drafts automatically
-- 24 h after the FIRST save. Auto-finalize:
--   - fills any section left empty with an explicit "not captured at
--     auto-close" marker (never a silent null, per the NOM-004 completeness
--     policy used across the portal),
--   - NEVER emits a receta (e.firma signing and allergy overrides are human
--     decisions); medications left in the draft are listed in the audit log,
--   - keeps the draft and flags finalize_error when the insert is rejected
--     (e.g. the NOM-004 6.1 historia gate) so the portal can ask the doctor
--     to finish it manually.

-- ── 1. Tables ─────────────────────────────────────────────────────────────
create table if not exists public.consulta_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  doctor_id uuid not null references profiles(id),
  payload jsonb not null default '{}'::jsonb,
  finalize_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.historia_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null unique references customers(id) on delete cascade,
  doctor_id uuid not null references profiles(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consulta_drafts enable row level security;
alter table public.historia_drafts enable row level security;

drop policy if exists consulta_drafts_staff on public.consulta_drafts;
create policy consulta_drafts_staff on public.consulta_drafts
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

drop policy if exists historia_drafts_staff on public.historia_drafts;
create policy historia_drafts_staff on public.historia_drafts
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

-- ── 2. Auto-finalize at 24 h ──────────────────────────────────────────────
create or replace function public.finalize_expired_consulta_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  v_count integer := 0;
  v_marker constant text := 'Sección no capturada al cierre automático del borrador (24 h) — el médico tratante debe consignarla como nueva versión.';
  v_vitals jsonb;
  v_med_names text;
begin
  for d in
    select cd.* from public.consulta_drafts cd
    where cd.finalize_error is null
      and cd.created_at < now() - interval '24 hours'
    order by cd.created_at
    limit 50
  loop
    begin
      -- Medications are never auto-prescribed; collect their names for the
      -- audit trail so the doctor can re-issue the receta manually.
      select string_agg(m->>'medication', ', ')
        into v_med_names
        from jsonb_array_elements(coalesce(d.payload->'medications', '[]'::jsonb)) m
       where nullif(m->>'medication', '') is not null;

      -- Vitals: declared negation → captured values (empty → null) →
      -- explicit "not captured at auto-close" negation (never a silent null).
      v_vitals := case
        when coalesce((d.payload->>'noVitals')::boolean, false)
          then jsonb_build_object('_negated', 'No se tomaron signos vitales (declarado).')
        when exists (
               select 1 from jsonb_object_keys(coalesce(d.payload->'vitals', '{}'::jsonb)) k
               where nullif(d.payload->'vitals'->>k, '') is not null)
          then (select jsonb_object_agg(k, nullif(d.payload->'vitals'->>k, ''))
                  from jsonb_object_keys(d.payload->'vitals') k)
        else jsonb_build_object('_negated', 'Signos vitales no capturados al cierre automático del borrador (24 h).')
      end;

      insert into public.consulta_notes (
        org_id, appointment_id, customer_id, doctor_id,
        padecimiento_actual, exploracion_fisica, resultados_estudios,
        vitals, diagnostico, cie10_codes, pronostico, plan,
        modality, tele_patient_location, tele_identity_verified, created_by
      ) values (
        d.org_id, d.appointment_id, d.customer_id, d.doctor_id,
        coalesce(nullif(btrim(d.payload->>'padecimiento'), ''), v_marker),
        coalesce(nullif(btrim(d.payload->>'exploracion'), ''),
                 case when coalesce((d.payload->>'noExploracion')::boolean, false)
                      then 'No se realizó exploración física (declarado).' else v_marker end),
        coalesce(nullif(btrim(d.payload->>'resultados'), ''),
                 case when coalesce((d.payload->>'noResultados')::boolean, false)
                      then 'Sin resultados de estudios (declarado).' else v_marker end),
        v_vitals,
        coalesce(nullif(btrim(d.payload->>'diagnostico'), ''), v_marker),
        coalesce(d.payload->'cie10', '[]'::jsonb),
        coalesce(nullif(btrim(d.payload->>'pronostico'), ''), v_marker),
        coalesce(nullif(btrim(d.payload->>'plan'), ''), v_marker),
        coalesce(nullif(d.payload->>'modality', ''), 'in_person'),
        nullif(d.payload->>'teleLocation', ''),
        coalesce((d.payload->>'teleIdentity')::boolean, false),
        d.doctor_id
      );

      update public.appointments
         set status = 'completed', consulta_ended_at = now()
       where id = d.appointment_id and status <> 'completed';

      insert into public.audit_log (org_id, user_id, action, details, timestamp)
      values (
        d.org_id, d.doctor_id, 'CLINICAL_NOTE_AUTOFINALIZE',
        'Borrador de nota cerrado automáticamente a las 24 h — cita ' || d.appointment_id ||
        case when v_med_names is not null
             then '. Medicamentos del borrador NO emitidos como receta (re-emitir manualmente): ' || v_med_names
             else '' end,
        now()
      );

      delete from public.consulta_drafts where id = d.id;
      v_count := v_count + 1;
    exception when others then
      -- e.g. the NOM-004 6.1 gate (no historia clínica) rejects the note:
      -- keep the draft and flag it so the portal asks for manual completion.
      update public.consulta_drafts
         set finalize_error = sqlerrm, updated_at = now()
       where id = d.id;
      insert into public.audit_log (org_id, user_id, action, details, timestamp)
      values (d.org_id, d.doctor_id, 'CLINICAL_NOTE_AUTOFINALIZE_FAILED',
              'Cierre automático de borrador falló — cita ' || d.appointment_id || ': ' || sqlerrm, now());
    end;
  end loop;

  -- Heartbeat: proves the cron is alive (anon-readable, no PII — same
  -- pattern as send-notifications).
  begin
    insert into public.cron_heartbeat (job, source) values ('finalize-consulta-drafts', 'cron');
  exception when others then
    null;
  end;

  return v_count;
end;
$$;

-- Definer-only: only the cron job may run it.
revoke all on function public.finalize_expired_consulta_drafts() from public, anon, authenticated;

-- ── 3. Schedule (every 15 min; pg_cron runs in UTC — window is 24 h, so the
-- clock shift is irrelevant) ───────────────────────────────────────────────
do $$
begin
  perform cron.unschedule('finalize-consulta-drafts');
exception when others then
  null;
end $$;

select cron.schedule(
  'finalize-consulta-drafts',
  '*/15 * * * *',
  $job$select public.finalize_expired_consulta_drafts();$job$
);

-- VERIFICATION:
--   select jobname, schedule, active from cron.job where jobname = 'finalize-consulta-drafts';
--   select * from cron_heartbeat where job = 'finalize-consulta-drafts' order by ran_at desc limit 5;
--   select public.finalize_expired_consulta_drafts();  -- manual smoke run (as postgres)
