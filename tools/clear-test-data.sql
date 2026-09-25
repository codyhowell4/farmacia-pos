-- ============================================================
-- LIMPIEZA DE DATOS DE PRUEBA — consultorio / portal médico
-- Fecha: 2026-09-26 (v2 dinámica)
--
-- QUÉ HACE: borra pacientes, citas, notas, recetas, ventas y
-- membresías de PRUEBA (cualquier fila cuyo nombre contenga
-- "prueba", "test" o los nombres de prueba conocidos:
-- Lety Campos, Juana Pérez).
--
-- POR QUÉ v2: la BD en vivo tiene triggers protectores que no
-- están en las migraciones del repo (p. ej. customers_protect_evidence,
-- que bloquea borrar un expediente con citas/consentimientos/notas/
-- recetas/membresías/ventas). En vez de nombres fijos, esta versión
-- DESCUBRE dinámicamente:
--   a) todos los triggers no-internos de las tablas afectadas
--      (se pausan SOLO dentro de la transacción de la función), y
--   b) todas las tablas con FK a customers/appointments (nivel 1)
--      y las tablas hijas de éstas (nivel 2, p. ej. sale_items→sales).
--
-- CUMPLIMIENTO (regla permanente de normas):
-- - NOM-004-SSA3-2012 (conservación del expediente ≥ 5 años) y
--   NOM-024 6.6.2 (notas de solo anexar) PROHÍBEN borrar datos
--   clínicos de pacientes reales. Este script SOLO toca filas de
--   prueba identificadas por nombre; nunca ejecutarlo con un
--   patrón que pueda coincidir con un paciente real. Los triggers
--   protectores son BUENOS y se reactivan al final (si algo falla,
--   la transacción se revierte y nunca se apagan).
--
-- MODO DE USO (Supabase SQL Editor) — 3 pasos:
--   1) Ejecutar ESTE ARCHIVO completo una sola vez (crea la función).
--   2) Vista previa (no borra nada):   select * from purge_test_data();
--      → devuelve FILAS: nombres que coinciden + cada tabla con
--        filas ligadas (incluye ventas/membresías si existen).
--      → VERIFICA que TODO sea de prueba antes del paso 3.
--   3) Si todo es prueba, borrar:      select * from purge_test_data(true);
--      → devuelve cuántas filas se borraron de cada tabla; si algo
--        no se pudo borrar sale como fila ERROR/CONSERVADO con causa.
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
  r record;
begin
  -- ── 1. Identidades de prueba ──────────────────────────────
  select array_agg(id) into v_customer_ids
    from customers
   where full_name ilike any (v_pattern);
  v_customer_ids := coalesce(v_customer_ids, '{}');

  select array_agg(id) into v_appt_ids
    from appointments
   where walkin_name ilike any (v_pattern)
      or customer_id = any (v_customer_ids);
  v_appt_ids := coalesce(v_appt_ids, '{}');

  -- ── 2. Vista previa (siempre se muestra) ──────────────────
  select string_agg(full_name, ' | ') into v_names
    from customers where id = any (v_customer_ids);
  paso := 'clientes encontrados';
  detalle := coalesce(array_length(v_customer_ids,1),0)::text || ' → ' || coalesce(v_names,'(ninguno)');
  return next;

  select string_agg(coalesce(walkin_name, '(cita de cliente registrado)'), ' | ') into v_names
    from appointments where id = any (v_appt_ids);
  paso := 'citas encontradas';
  detalle := coalesce(array_length(v_appt_ids,1),0)::text || ' → ' || coalesce(v_names,'(ninguna)');
  return next;

  -- Conteos por tabla, nivel 1 (FK directa a customers/appointments)
  for r in
    select con.conrelid::regclass::text as tbl,
           att.attname as col,
           con.confrelid = 'public.customers'::regclass as via_customers
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid in ('public.customers'::regclass, 'public.appointments'::regclass)
  loop
    if r.via_customers then
      execute format('select count(*) from %s where %I = any($1)', r.tbl, r.col)
        into n using v_customer_ids;
    else
      execute format('select count(*) from %s where %I = any($1)', r.tbl, r.col)
        into n using v_appt_ids;
    end if;
    if n > 0 then
      paso := 'ligados ' || r.tbl; detalle := n::text; return next;
    end if;
  end loop;

  -- Conteos por tabla, nivel 2 (hijas de las tablas de nivel 1)
  for r in
    select c2.conrelid::regclass::text as child_tbl,
           a2.attname as child_col,
           c1.conrelid::regclass::text as parent_tbl,
           a1.attname as parent_col,
           pkatt.attname as parent_pk,
           c1.confrelid = 'public.customers'::regclass as via_customers
      from pg_constraint c1
      join pg_attribute a1
        on a1.attrelid = c1.conrelid and a1.attnum = c1.conkey[1]
      join pg_constraint c2
        on c2.confrelid = c1.conrelid and c2.contype = 'f'
      join pg_attribute a2
        on a2.attrelid = c2.conrelid and a2.attnum = c2.conkey[1]
      join pg_constraint pk
        on pk.conrelid = c2.confrelid and pk.contype = 'p'
      join pg_attribute pkatt
        on pkatt.attrelid = pk.conrelid and pkatt.attnum = pk.conkey[1]
     where c1.contype = 'f'
       and c1.confrelid in ('public.customers'::regclass, 'public.appointments'::regclass)
  loop
    if r.via_customers then
      execute format('select count(*) from %s where %I in (select %I from %s where %I = any($1))',
                     r.child_tbl, r.child_col, r.parent_pk, r.parent_tbl, r.parent_col)
        into n using v_customer_ids;
    else
      execute format('select count(*) from %s where %I in (select %I from %s where %I = any($1))',
                     r.child_tbl, r.child_col, r.parent_pk, r.parent_tbl, r.parent_col)
        into n using v_appt_ids;
    end if;
    if n > 0 then
      paso := 'ligados ' || r.child_tbl; detalle := n::text; return next;
    end if;
  end loop;

  if not p_execute then
    paso := 'MODO';
    detalle := 'VISTA PREVIA — no se borró nada. Verifica que TODO sea de prueba y luego ejecuta: select * from purge_test_data(true);';
    return next;
    return;
  end if;

  -- ── 3. Pausar triggers protectores (solo en esta transacción) ──
  n := 0;
  for r in
    select distinct t.tgrelid::regclass::text as tbl, t.tgname
      from pg_trigger t
     where not t.tgisinternal
       and t.tgrelid in (
             select conrelid from pg_constraint
              where contype = 'f'
                and confrelid in ('public.customers'::regclass, 'public.appointments'::regclass)
             union
             select c2.conrelid
               from pg_constraint c2
              where c2.contype = 'f'
                and c2.confrelid in (
                      select conrelid from pg_constraint
                       where contype = 'f'
                         and confrelid in ('public.customers'::regclass, 'public.appointments'::regclass))
             union select 'public.customers'::regclass
             union select 'public.appointments'::regclass
           )
  loop
    execute format('alter table %s disable trigger %I', r.tbl, r.tgname);
    n := n + 1;
  end loop;
  paso := 'protecciones pausadas';
  detalle := n::text || ' triggers (solo dentro de esta transacción; se reactivan al final)';
  return next;

  -- ── 4. Borrado nivel 2 (hijas primero: sale_items, etc.) ──
  for r in
    select c2.conrelid::regclass::text as child_tbl,
           a2.attname as child_col,
           c1.conrelid::regclass::text as parent_tbl,
           a1.attname as parent_col,
           pkatt.attname as parent_pk,
           c1.confrelid = 'public.customers'::regclass as via_customers
      from pg_constraint c1
      join pg_attribute a1
        on a1.attrelid = c1.conrelid and a1.attnum = c1.conkey[1]
      join pg_constraint c2
        on c2.confrelid = c1.conrelid and c2.contype = 'f'
      join pg_attribute a2
        on a2.attrelid = c2.conrelid and a2.attnum = c2.conkey[1]
      join pg_constraint pk
        on pk.conrelid = c2.confrelid and pk.contype = 'p'
      join pg_attribute pkatt
        on pkatt.attrelid = pk.conrelid and pkatt.attnum = pk.conkey[1]
     where c1.contype = 'f'
       and c1.confrelid in ('public.customers'::regclass, 'public.appointments'::regclass)
  loop
    begin
      if r.via_customers then
        execute format('delete from %s where %I in (select %I from %s where %I = any($1))',
                       r.child_tbl, r.child_col, r.parent_pk, r.parent_tbl, r.parent_col)
          using v_customer_ids;
      else
        execute format('delete from %s where %I in (select %I from %s where %I = any($1))',
                       r.child_tbl, r.child_col, r.parent_pk, r.parent_tbl, r.parent_col)
          using v_appt_ids;
      end if;
      get diagnostics n = row_count;
      if n > 0 then
        paso := 'BORRADO ' || r.child_tbl; detalle := n::text; return next;
      end if;
    exception when others then
      paso := 'ERROR ' || r.child_tbl; detalle := sqlerrm; return next;
    end;
  end loop;

  -- ── 5. Borrado nivel 1 (notas, historias, recetas, ventas, citas…) ──
  for r in
    select con.conrelid::regclass::text as tbl,
           att.attname as col,
           con.confrelid = 'public.customers'::regclass as via_customers
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid in ('public.customers'::regclass, 'public.appointments'::regclass)
  loop
    begin
      if r.via_customers then
        execute format('delete from %s where %I = any($1)', r.tbl, r.col) using v_customer_ids;
      else
        execute format('delete from %s where %I = any($1)', r.tbl, r.col) using v_appt_ids;
      end if;
      get diagnostics n = row_count;
      if n > 0 then
        paso := 'BORRADO ' || r.tbl; detalle := n::text; return next;
      end if;
    exception when others then
      paso := 'ERROR ' || r.tbl; detalle := sqlerrm; return next;
    end;
  end loop;

  -- Citas walk-in de prueba (sin customer ligado)
  begin
    delete from appointments where id = any (v_appt_ids);
    get diagnostics n = row_count;
    paso := 'BORRADO appointments (walk-in)'; detalle := n::text; return next;
  exception when others then
    paso := 'ERROR appointments'; detalle := sqlerrm; return next;
  end;

  -- ── 6. Clientes de prueba, uno por uno ─────────────────────
  n := 0;
  foreach v_id in array v_customer_ids loop
    begin
      delete from customers where id = v_id;
      n := n + 1;
    exception when others then
      paso := 'CONSERVADO customer';
      detalle := v_id::text || ' — ' || sqlerrm;
      return next;
    end;
  end loop;
  paso := 'BORRADO customers'; detalle := n::text; return next;

  -- ── 7. Reactivar triggers protectores ──────────────────────
  for r in
    select distinct t.tgrelid::regclass::text as tbl, t.tgname
      from pg_trigger t
     where not t.tgisinternal
       and t.tgrelid in (
             select conrelid from pg_constraint
              where contype = 'f'
                and confrelid in ('public.customers'::regclass, 'public.appointments'::regclass)
             union
             select c2.conrelid
               from pg_constraint c2
              where c2.contype = 'f'
                and c2.confrelid in (
                      select conrelid from pg_constraint
                       where contype = 'f'
                         and confrelid in ('public.customers'::regclass, 'public.appointments'::regclass))
             union select 'public.customers'::regclass
             union select 'public.appointments'::regclass
           )
  loop
    execute format('alter table %s enable trigger %I', r.tbl, r.tgname);
  end loop;

  paso := 'FIN';
  detalle := 'Limpieza terminada. Triggers protectores reactivados. Si hay filas ERROR/CONSERVADO arriba, mándalas para ajustar.';
  return next;
end
$fn$;

-- Solo el rol postgres (SQL Editor) puede ejecutarla — la app no.
revoke all on function public.purge_test_data(boolean) from public, anon, authenticated;
