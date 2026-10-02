-- Merge duplicate customer record for Luz Maria Solano Martinez (DOB 2006-09-28).
--
-- Survivor: e60d43f9-cc76-4ca9-a918-01a82f8b01bf ("Luz maria solano matinez" — typo)
--   holds the completed first visit: 1 consulta note, 1 historia clínica, 4 consents.
-- Duplicate: 7c98b957-4e8d-4355-8fd3-95bf7b569379 ("LUZ MARIA SOLANO MARTINEZ")
--   created when the name typo defeated the exact-name returning-patient match;
--   holds 2 citas (one in consulta), 2 check-in self-report notes, 4 consents,
--   1 consulta draft, 1 historia draft — but no note/historia, so the NOM-004
--   first-visit gate was forcing the doctor to redo the historia clínica.
--
-- Frozen-by-trigger rows (consent_documents, medical_notes originals) cannot be
-- repointed: consents stay on the retired record as legal evidence (the survivor
-- has her own 4) and the 2 self-report notes are copied forward with provenance.
-- The retired record cannot be deleted (customers_protect_evidence, NOM-004 5.4)
-- so it is flagged instead.

begin;

-- 1) Citas → survivor (guard passes for postgres)
update appointments
set customer_id = 'e60d43f9-cc76-4ca9-a918-01a82f8b01bf'
where customer_id = '7c98b957-4e8d-4355-8fd3-95bf7b569379';

-- 2) In-progress drafts → survivor (mutable working copies)
update consulta_drafts
set customer_id = 'e60d43f9-cc76-4ca9-a918-01a82f8b01bf'
where customer_id = '7c98b957-4e8d-4355-8fd3-95bf7b569379';

update historia_drafts
set customer_id = 'e60d43f9-cc76-4ca9-a918-01a82f8b01bf'
where customer_id = '7c98b957-4e8d-4355-8fd3-95bf7b569379';

-- 3) Check-in self-report notes are append-only → copy forward with provenance
insert into medical_notes (org_id, doctor_id, customer_id, walkin_name, note, created_at, appointment_id, author_name)
select org_id, doctor_id, 'e60d43f9-cc76-4ca9-a918-01a82f8b01bf', walkin_name,
       '[Trasladada del expediente duplicado 7c98b957-4e8d-4355-8fd3-95bf7b569379 en la fusión del 2026-10-02]' || E'\n' || note,
       created_at, appointment_id, author_name
from medical_notes
where customer_id = '7c98b957-4e8d-4355-8fd3-95bf7b569379';

-- 4) Correct the name spelling on the surviving expediente
update customers
set full_name = 'Luz Maria Solano Martinez'
where id = 'e60d43f9-cc76-4ca9-a918-01a82f8b01bf';

-- 5) Flag the retired record so staff never picks it again (delete is blocked
--    by the evidence trigger; its 4 consents + 2 original notes stay as evidence)
update customers
set full_name = 'Luz Maria Solano Martinez (DUPLICADO — NO USAR)',
    notes = coalesce(nullif(notes, '') || E'\n', '') ||
            '[2026-10-02] Expediente duplicado de e60d43f9-cc76-4ca9-a918-01a82f8b01bf — fusionado por soporte técnico. ' ||
            'No registrar citas ni capturar aquí. Sus 4 consentimientos y 2 auto-reportes originales se conservan como evidencia.'
where id = '7c98b957-4e8d-4355-8fd3-95bf7b569379';

-- 6) Audit trail
insert into audit_log (org_id, user_id, user_name, user_role, action, details)
values (
  '718f51b5-dc67-4f70-8aa9-1a315cd1deeb', null, 'Soporte técnico', 'admin',
  'customer_merge',
  'Fusión de duplicado 7c98b957-4e8d-4355-8fd3-95bf7b569379 (LUZ MARIA SOLANO MARTINEZ) en ' ||
  'e60d43f9-cc76-4ca9-a918-01a82f8b01bf (Luz Maria Solano Martinez, DOB 2006-09-28): 2 citas y 2 borradores ' ||
  'trasladados; 2 auto-reportes de check-in copiados con referencia; 4 consentimientos conservados en el registro ' ||
  'retirado (inmutables); nombre corregido (matinez → Martinez). Causa: duplicado por error ortográfico en el ' ||
  'registro — la puerta NOM-004 6.1 bloqueaba la 2ª consulta pidiendo historia clínica de primera vez.'
);

commit;
