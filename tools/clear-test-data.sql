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
--   historia_clinica) se deshabilitan SOLO dentro de esta
--   transacción para purgar pruebas; si algo falla, todo se
--   revierte y los triggers quedan activos.
--
-- MODO DE USO (Supabase SQL Editor):
--   1) Ejecutar tal cual → MODO VISTA PREVIA: muestra qué se
--      borraría, sin borrar nada.
--   2) Revisar la lista. Si todo es prueba, cambiar
--      v_execute a true y volver a ejecutar → borra.
-- ============================================================

do $$
declare
  -- ▼▼▼ CAMBIAR A true PARA BORRAR DE VERDAD ▼▼▼
  v_execute boolean := false;
  -- ▲▲▲ CAMBIAR A true PARA BORRAR DE VERDAD ▲▲▲

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

  -- Vista previa: nombres exactos que coinciden
  select string_agg(full_name, ' | ') into v_names
    from customers where id = any (coalesce(v_customer_ids, '{}'));
  raise notice 'CLIENTES de prueba encontrados (%): %',
    coalesce(array_length(v_customer_ids,1), 0), coalesce(v_names, '(ninguno)');

  select string_agg(coalesce(walkin_name, '(cita de cliente)'), ' | ') into v_names
    from appointments where id = any (coalesce(v_appt_ids, '{}'));
  raise notice 'CITAS de prueba encontradas (%): %',
    coalesce(array_length(v_appt_ids,1), 0), coalesce(v_names, '(ninguna)');

  if not v_execute then
    raise notice '--- MODO VISTA PREVIA: no se borró nada. Cambia v_execute a true y vuelve a ejecutar para borrar. ---';
    return;
  end if;

  -- ── 2. Deshabilitar protección append-only SOLO en esta tx ─
  alter table consulta_notes  disable trigger consulta_notes_no_update;
  alter table medical_notes   disable trigger medical_notes_no_update;
  alter table historia_clinica disable trigger historia_clinica_append_only;

  -- ── 3. Borrado en orden seguro (hijos → padres) ───────────

  delete from consulta_drafts
   where appointment_id = any (coalesce(v_appt_ids, '{}'));
  get diagnostics n = row_count;
  raise notice 'consulta_drafts borrados: %', n;

  delete from consulta_notes
   where appointment_id = any (coalesce(v_appt_ids, '{}'))
      or customer_id     = any (coalesce(v_customer_ids, '{}'));
  get diagnostics n = row_count;
  raise notice 'consulta_notes borradas: %', n;

  delete from medical_notes
   where appointment_id = any (coalesce(v_appt_ids, '{}'))
      or customer_id     = any (coalesce(v_customer_ids, '{}'))
      or walkin_name ilike any (v_pattern);
  get diagnostics n = row_count;
  raise notice 'medical_notes borradas: %', n;

  delete from historia_clinica
   where customer_id = any (coalesce(v_customer_ids, '{}'));
  get diagnostics n = row_count;
  raise notice 'historia_clinica borradas: %', n;

  -- historial médico versionado (si existe la columna customer_id)
  if exists (select 1 from information_schema.columns
             where table_name = 'medical_history_versions' and column_name = 'customer_id') then
    delete from medical_history_versions
     where customer_id = any (coalesce(v_customer_ids, '{}'));
    get diagnostics n = row_count;
    raise notice 'medical_history_versions borradas: %', n;
  end if;

  -- recetas: la columna de liga a cita varía según versión del esquema
  if exists (select 1 from information_schema.columns
             where table_name = 'prescriptions' and column_name = 'appointment_id') then
    delete from prescriptions
     where appointment_id = any (coalesce(v_appt_ids, '{}'))
        or customer_id     = any (coalesce(v_customer_ids, '{}'));
  else
    delete from prescriptions
     where customer_id = any (coalesce(v_customer_ids, '{}'));
  end if;
  get diagnostics n = row_count;
  raise notice 'prescriptions borradas: %', n;

  delete from consent_documents
   where appointment_id = any (coalesce(v_appt_ids, '{}'))
      or customer_id     = any (coalesce(v_customer_ids, '{}'));
  get diagnostics n = row_count;
  raise notice 'consent_documents borrados: %', n;

  if exists (select 1 from information_schema.columns
             where table_name = 'notification_queue' and column_name = 'appointment_id') then
    delete from notification_queue
     where appointment_id = any (coalesce(v_appt_ids, '{}'));
    get diagnostics n = row_count;
    raise notice 'notification_queue borradas: %', n;
  end if;

  delete from preorders
   where customer_id = any (coalesce(v_customer_ids, '{}'));
  get diagnostics n = row_count;
  raise notice 'preorders borrados: %', n;

  delete from appointments
   where id = any (coalesce(v_appt_ids, '{}'));
  get diagnostics n = row_count;
  raise notice 'appointments borradas: %', n;

  -- Clientes: uno por uno; si alguno tiene ventas/membresías
  -- ligadas (FK), se conserva y se avisa — sus datos clínicos de
  -- prueba ya quedaron borrados arriba.
  n := 0;
  foreach v_id in array coalesce(v_customer_ids, '{}') loop
    begin
      delete from customers where id = v_id;
      n := n + 1;
    exception when foreign_key_violation then
      raise notice 'Cliente % conservado: tiene registros financieros ligados (ventas/membresías).', v_id;
    end;
  end loop;
  raise notice 'customers borrados: %', n;

  -- ── 4. Reactivar protección append-only ───────────────────
  alter table consulta_notes   enable trigger consulta_notes_no_update;
  alter table medical_notes    enable trigger medical_notes_no_update;
  alter table historia_clinica enable trigger historia_clinica_append_only;

  raise notice '--- LIMPIEZA TERMINADA. Triggers append-only reactivados. ---';
end $$;
