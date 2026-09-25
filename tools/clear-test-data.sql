-- ============================================================
-- LIMPIEZA DE DATOS DE PRUEBA — consultorio / portal médico
-- Fecha: 2026-09-26
--
-- QUÉ HACE: borra pacientes, citas, notas y recetas de PRUEBA
-- (cualquier fila cuyo nombre contenga "prueba", "test" o los
-- nombres de prueba conocidos: Lety Campos, Juana Pérez).
--
-- CUMPLIMIENTO (regla permanente de normas):
-- - NOM-004-SSA3-2012 (conservación del expediente ≥ 5 años) y
--   NOM-024 6.6.2 (notas de solo anexar) PROHÍBEN borrar datos
--   clínicos de pacientes reales. Este script SOLO toca filas de
--   prueba identificadas por nombre; nunca ejecutarlo con un
--   patrón que pueda coincidir con un paciente real.
-- - Los triggers append-only (medical_notes, consulta_notes,
--   historia_clinica) se deshabilitan SOLO dentro de la función;
--   si algo falla, todo se revierte y los triggers quedan activos.
--
-- MODO DE USO (Supabase SQL Editor) — 3 pasos:
--   1) Ejecutar ESTE ARCHIVO completo una sola vez (crea la función).
--   2) Vista previa (no borra nada):   select * from purge_test_data();
--      → devuelve FILAS con los nombres y conteos que coinciden.
--   3) Si todo es prueba, borrar:      select * from purge_test_data(true);
--      → devuelve cuántas filas se borraron de cada tabla.
-- ============================================================

create or replace function public.purge_test_data(p_execute boolean default false)
returns table(paso text, detalle text)
language plpgsql
set search_path = public
as $fn$
declare
  v_pattern text[] := array[
    '%prueba%', '%preuba%', '%test%',
    '%lety%campos%', '%juana%perez%', '%juana%pérez%'
  ];
  v_customer_ids uuid[];
  v_appt_ids uuid[];
  v_id uuid;
  n int;
  v_names text;
begin
  -- ── 1. Identidades de prueba ──────────────────────────────
  select array_agg(id) into v_customer_ids
    from customers
   where full_name ilike any (v_pattern);

  select array_agg(id) into v_appt_ids
    from appointments
   where walkin_name ilike any (v_pattern)
      or customer_id = any (coalesce(v_customer_ids, '{}'));

  -- ── 2. Vista previa (siempre se muestra) ──────────────────
  select string_agg(full_name, ' | ') into v_names
    from customers where id = any (coalesce(v_customer_ids, '{}'));
  paso := 'clientes encontrados';
  detalle := coalesce(array_length(v_customer_ids,1),0)::text || ' → ' || coalesce(v_names,'(ninguno)');
  return next;

  select string_agg(coalesce(walkin_name, '(cita de cliente registrado)'), ' | ') into v_names
    from appointments where id = any (coalesce(v_appt_ids, '{}'));
  paso := 'citas encontradas';
  detalle := coalesce(array_length(v_appt_ids,1),0)::text || ' → ' || coalesce(v_names,'(ninguna)');
  return next;

  select count(*) into n from consulta_notes
   where appointment_id = any (coalesce(v_appt_ids,'{}'))
      or customer_id     = any (coalesce(v_customer_ids,'{}'));
  paso := 'notas de consulta ligadas'; detalle := n::text; return next;

  select count(*) into n from medical_notes
   where appointment_id = any (coalesce(v_appt_ids,'{}'))
      or customer_id     = any (coalesce(v_customer_ids,'{}'))
      or walkin_name ilike any (v_pattern);
  paso := 'notas médicas ligadas'; detalle := n::text; return next;

  select count(*) into n from historia_clinica
   where customer_id = any (coalesce(v_customer_ids,'{}'));
  paso := 'historias clínicas ligadas'; detalle := n::text; return next;

  if exists (select 1 from information_schema.columns
             where table_name = 'prescriptions' and column_name = 'appointment_id') then
    select count(*) into n from prescriptions
     where appointment_id = any (coalesce(v_appt_ids,'{}'))
        or customer_id     = any (coalesce(v_customer_ids,'{}'));
  else
    select count(*) into n from prescriptions
     where customer_id = any (coalesce(v_customer_ids,'{}'));
  end if;
  paso := 'recetas ligadas'; detalle := n::text; return next;

  if not p_execute then
    paso := 'MODO';
    detalle := 'VISTA PREVIA — no se borró nada. Para borrar ejecuta: select * from purge_test_data(true);';
    return next;
    return;
  end if;

  -- ── 3. Borrado (protección append-only apagada solo aquí) ──
  alter table consulta_notes   disable trigger consulta_notes_no_update;
  alter table medical_notes    disable trigger medical_notes_no_update;
  alter table historia_clinica disable trigger historia_clinica_append_only;

  delete from consulta_drafts
   where appointment_id = any (coalesce(v_appt_ids,'{}'));
  get diagnostics n = row_count;
  paso := 'BORRADO consulta_drafts'; detalle := n::text; return next;

  delete from consulta_notes
   where appointment_id = any (coalesce(v_appt_ids,'{}'))
      or customer_id     = any (coalesce(v_customer_ids,'{}'));
  get diagnostics n = row_count;
  paso := 'BORRADO consulta_notes'; detalle := n::text; return next;

  delete from medical_notes
   where appointment_id = any (coalesce(v_appt_ids,'{}'))
      or customer_id     = any (coalesce(v_customer_ids,'{}'))
      or walkin_name ilike any (v_pattern);
  get diagnostics n = row_count;
  paso := 'BORRADO medical_notes'; detalle := n::text; return next;

  delete from historia_clinica
   where customer_id = any (coalesce(v_customer_ids,'{}'));
  get diagnostics n = row_count;
  paso := 'BORRADO historia_clinica'; detalle := n::text; return next;

  if exists (select 1 from information_schema.columns
             where table_name = 'medical_history_versions' and column_name = 'customer_id') then
    delete from medical_history_versions
     where customer_id = any (coalesce(v_customer_ids,'{}'));
    get diagnostics n = row_count;
    paso := 'BORRADO medical_history_versions'; detalle := n::text; return next;
  end if;

  if exists (select 1 from information_schema.columns
             where table_name = 'prescriptions' and column_name = 'appointment_id') then
    delete from prescriptions
     where appointment_id = any (coalesce(v_appt_ids,'{}'))
        or customer_id     = any (coalesce(v_customer_ids,'{}'));
  else
    delete from prescriptions
     where customer_id = any (coalesce(v_customer_ids,'{}'));
  end if;
  get diagnostics n = row_count;
  paso := 'BORRADO prescriptions'; detalle := n::text; return next;

  delete from consent_documents
   where appointment_id = any (coalesce(v_appt_ids,'{}'))
      or customer_id     = any (coalesce(v_customer_ids,'{}'));
  get diagnostics n = row_count;
  paso := 'BORRADO consent_documents'; detalle := n::text; return next;

  if exists (select 1 from information_schema.columns
             where table_name = 'notification_queue' and column_name = 'appointment_id') then
    delete from notification_queue
     where appointment_id = any (coalesce(v_appt_ids,'{}'));
    get diagnostics n = row_count;
    paso := 'BORRADO notification_queue'; detalle := n::text; return next;
  end if;

  delete from preorders
   where customer_id = any (coalesce(v_customer_ids,'{}'));
  get diagnostics n = row_count;
  paso := 'BORRADO preorders'; detalle := n::text; return next;

  delete from appointments
   where id = any (coalesce(v_appt_ids,'{}'));
  get diagnostics n = row_count;
  paso := 'BORRADO appointments'; detalle := n::text; return next;

  -- Clientes: uno por uno; si alguno tiene ventas/membresías
  -- ligadas (FK), se conserva y se avisa — sus datos clínicos de
  -- prueba ya quedaron borrados arriba.
  n := 0;
  foreach v_id in array coalesce(v_customer_ids,'{}') loop
    begin
      delete from customers where id = v_id;
      n := n + 1;
    exception when foreign_key_violation then
      paso := 'CONSERVADO customer';
      detalle := v_id::text || ' — tiene registros financieros ligados (ventas/membresías); sus datos clínicos de prueba ya se borraron';
      return next;
    end;
  end loop;
  paso := 'BORRADO customers'; detalle := n::text; return next;

  alter table consulta_notes   enable trigger consulta_notes_no_update;
  alter table medical_notes    enable trigger medical_notes_no_update;
  alter table historia_clinica enable trigger historia_clinica_append_only;

  paso := 'FIN';
  detalle := 'Limpieza terminada. Triggers append-only reactivados.';
  return next;
end
$fn$;

-- Solo el rol postgres (SQL Editor) puede ejecutarla — la app no.
revoke all on function public.purge_test_data(boolean) from public, anon, authenticated;
