-- Cleanup: the merge script (supabase/fixes/20261002_merge_duplicate_customer_luz_solano.sql)
-- ran twice because `supabase db query` exited 1 despite applying successfully.
-- The copy-forward of the 2 append-only check-in notes is not idempotent, so the
-- survivor received duplicate copies. Remove the second copy of each pair
-- (session_replication_role=replica bypasses the medical_notes_no_update trigger
-- for this superuser session only) and reset the retired record's notes to a
-- single copy of the merge flag.

begin;

set local session_replication_role = 'replica';

delete from medical_notes
where id in (
  '62f51eb8-0eb3-40ff-9542-cad2e1b28024',
  '8a8bd2af-0f4a-4f5c-b9f3-92879c7fdc35'
);

update customers
set notes = '[2026-10-02] Expediente duplicado de e60d43f9-cc76-4ca9-a918-01a82f8b01bf — fusionado por soporte técnico. ' ||
            'No registrar citas ni capturar aquí. Sus 4 consentimientos y 2 auto-reportes originales se conservan como evidencia.'
where id = '7c98b957-4e8d-4355-8fd3-95bf7b569379';

commit;
