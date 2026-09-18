-- ============================================================
-- DOCTOR PORTAL HARDENING — NOM-024 / NOM-027 compliance
-- ============================================================
-- 1. inventory.controlled_group: controlled-medication group (II | III)
-- 2. appointments.meeting_url_staff: staff-side Daily room link
--    (private rooms + meeting tokens; patients get meeting_url)
-- 3. consulta_notes teleconsulta fields (modality, patient location,
--    identity verification) — NOM-027
-- 4. medical_notes append-only trigger — NOM-024 6.6.2 (unalterable
--    documents): mirrors consulta_notes_append_only in
--    MIGRATION_nom024_program.sql. Corrections are new rows.
-- ============================================================

-- ----------------------------------------------------------
-- 1. CONTROLLED MEDICATION GROUP (inventory)
-- ----------------------------------------------------------
alter table inventory add column if not exists controlled_group text;

alter table inventory drop constraint if exists inventory_controlled_group_check;
alter table inventory add constraint inventory_controlled_group_check
  check (controlled_group is null or controlled_group in ('II','III'));

-- ----------------------------------------------------------
-- 2. APPOINTMENTS: staff meeting link (private Daily rooms)
-- ----------------------------------------------------------
alter table appointments add column if not exists meeting_url_staff text;

-- ----------------------------------------------------------
-- 3. CONSULTA NOTES: teleconsulta fields (NOM-027)
-- ----------------------------------------------------------
alter table consulta_notes add column if not exists modality text not null default 'in_person';
alter table consulta_notes add column if not exists tele_patient_location text;
alter table consulta_notes add column if not exists tele_identity_verified boolean not null default false;

-- ----------------------------------------------------------
-- 4. MEDICAL NOTES: append-only enforcement (NOM-024 6.6.2)
-- ----------------------------------------------------------
create or replace function medical_notes_append_only() returns trigger as $$
begin
  raise exception 'medical_notes es de solo anexar: registre una nota nueva en lugar de modificar o eliminar';
end;
$$ language plpgsql;

drop trigger if exists medical_notes_no_update on medical_notes;
create trigger medical_notes_no_update
  before update or delete on medical_notes
  for each row execute function medical_notes_append_only();

-- ----------------------------------------------------------
-- VERIFICATION (uncomment after migrating):
-- select column_name from information_schema.columns
--   where table_name = 'inventory' and column_name = 'controlled_group';
-- select conname from pg_constraint where conname = 'inventory_controlled_group_check';
-- select column_name from information_schema.columns
--   where table_name = 'appointments' and column_name = 'meeting_url_staff';
-- select column_name from information_schema.columns
--   where table_name = 'consulta_notes'
--   and column_name in ('modality','tele_patient_location','tele_identity_verified');
-- select tgname from pg_trigger where tgname = 'medical_notes_no_update';
-- ============================================================
