-- ============================================================
-- POST-VISIT FLOW: link medical notes to their appointment
-- ============================================================
-- When a doctor marks a cita as Completada, the post-visit note
-- is stored in medical_notes with appointment_id pointing back
-- to the appointment, so the consulta record and its clinical
-- note stay linked for future reference.
--
-- No new RLS policies are needed:
--   - medical_notes already has staff (org) + customer self-read
--     policies; the new column is covered by them.
--   - prescriptions already has prescriptions_customer_select so
--     patients can read doctor-issued recetas in the portal.
-- ============================================================

alter table medical_notes
  add column if not exists appointment_id uuid references appointments(id) on delete set null;

create index if not exists medical_notes_appointment_id_idx
  on medical_notes(appointment_id);

-- VERIFICATION (uncomment to run after migrating):
-- select column_name, data_type from information_schema.columns
--  where table_name = 'medical_notes' and column_name = 'appointment_id';
