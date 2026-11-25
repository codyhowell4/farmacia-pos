-- ============================================================
-- MIGRATION: Aviso de Privacidad v3 + registros de salud del paciente
-- (2026-11-25, aviso v3 approved by the owner)
--
-- 1. consent_texts privacidad v3 active (v2 inactive).
-- 2. Version-aware consent: sign_consent_documents now signs a type again
--    when the customer's latest signed copy is not the active text (before,
--    any past signature counted, so a new version could never be signed);
--    my_consent_currency() tells the app which documents are current.
-- 3. patient_health_records + patient_emergency_info: health records the
--    customer captures in the app (aviso v3 §2/§7). RLS: the customer owns
--    their rows (read/write) and may WRITE only after accepting the current
--    aviso; clinical staff (admin/doctor) of the org read them; nobody else.
--    Shown to doctors as "Registrado por el paciente, no verificado".
-- Additive (new tables/functions; sign_consent_documents re-created with
-- the same signature and behaviour except the version check).
-- ============================================================

-- 1. Aviso v3 ---------------------------------------------------------------
insert into public.consent_texts (type, version, title, content, active)
select 'privacidad', 3, 'Aviso de Privacidad', $aviso$AVISO DE PRIVACIDAD — FARMACIA APOLO
Última actualización: noviembre 2026 (versión 3)

1. RESPONSABLE DEL TRATAMIENTO DE TUS DATOS
Farmacia Apolo (en adelante "la Farmacia"), con domicilio en Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Estado de México, México, es la responsable del tratamiento de tus datos personales y de tus datos personales sensibles de salud, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), publicada en el Diario Oficial de la Federación el 20 de marzo de 2025, y, en materia de expediente clínico, a la NOM-004-SSA3-2012.

2. DATOS PERSONALES QUE RECABAMOS
Para la prestación de nuestros servicios recabamos: nombre completo, fecha de nacimiento y género; correo electrónico, teléfono y número de membresía; datos de contacto de emergencia; e información de compras y pedidos en la farmacia.
Además, con tu consentimiento expreso, recabamos datos personales sensibles de salud: padecimiento actual, antecedentes y notas de consulta médica; diagnósticos, pronósticos, planes de tratamiento y recetas médicas; signos vitales, alergias, condiciones médicas y medicamentos actuales; los documentos de consentimiento informado que firmes; y los registros de salud que tú captures en la aplicación: peso, altura, presión arterial, glucosa, resultados de laboratorio y estudios, vacunas, medicamentos y recordatorios de toma, metas de salud, pasos y actividad física, sueño, ayuno, registro de alimentos y tu identificación médica de emergencia (tipo de sangre, alergias y condiciones relevantes).
Datos de terceros. Si registras contactos de emergencia (nombre, parentesco y teléfono) o perfiles de familiares, declaras que les informaste de este aviso y que cuentas con su autorización —o con la representación legal, en el caso de menores—. Los datos de tus contactos de emergencia se usan únicamente para comunicarnos con ellos en caso de una emergencia relacionada con tu salud y para mostrarlos en tu identificación médica de emergencia.

3. FINALIDADES DEL TRATAMIENTO
Finalidades primarias (necesarias): prestación de servicios de salud, incluyendo consulta médica general y teleconsulta; integración, resguardo y actualización de tu expediente clínico; registro y seguimiento de los datos de salud que captures en la aplicación y su consulta por el médico que te atienda, como apoyo para tu atención; despacho de medicamentos y gestión de pedidos de farmacia; agenda, recordatorios y seguimiento de citas médicas; y facturación, cobro y administración de tu membresía.
Finalidades secundarias (opcionales): envío de promociones; programa de lealtad Monedas Apolo; y estadísticas internas de mejora del servicio, incluida la medición del uso de la aplicación con Google Analytics (sección 8).
Desde el momento de la recolección puedes negarte a estas finalidades secundarias sin que por ello se te niegue el servicio: al crear tu cuenta o firmar tus documentos de consentimiento, la aplicación muestra una casilla independiente y opcional ("Acepto el uso de mis datos para finalidades secundarias"); si no la marcas, tus datos no se tratarán para finalidades secundarias. También puedes cambiar tu decisión en cualquier momento en la sección "Privacidad y mis datos" de la aplicación o por los medios descritos en la sección 5.
Monedas Apolo requiere, además, que lo actives dentro de la aplicación. Para otorgarte Monedas registramos únicamente que cumpliste una meta (por ejemplo, "meta de pasos" o "medicina a tiempo") y la fecha; no registramos para este programa tus valores de salud ni los nombres de tus medicamentos.

4. TRANSFERENCIAS DE DATOS PERSONALES Y ENCARGADOS
Tus datos personales no serán transferidos a terceros sin tu consentimiento, salvo en los casos previstos por el artículo 36 de la LFPDPPP, incluyendo: (a) profesionales de la salud que participen en tu atención y que están obligados al secreto profesional; (b) autoridades sanitarias competentes cuando así lo exija la legislación aplicable; y (c) proveedores de servicios que actúan como encargados del tratamiento, bajo acuerdos de confidencialidad.
Para operar la aplicación, la Farmacia se auxilia de los siguientes encargados, que tratan tus datos por cuenta del responsable y con las mismas protecciones previstas en este aviso y en la LFPDPPP: Supabase (base de datos y almacenamiento, donde se guardan tu expediente y los registros de salud que captures en la aplicación), Daily.co (plataforma de videoconsulta), Resend (correo electrónico transaccional), Meta Platforms / WhatsApp (mensajería), Stripe (procesamiento de pagos), Cloudflare (hospedaje y red de entrega de contenido) y Google LLC (Google Analytics, medición de uso de la aplicación, solo si aceptaste las finalidades secundarias). Algunos de estos encargados tratan datos en servidores ubicados en Estados Unidos.
Tus datos sensibles de salud se almacenan y tratan conforme a la NOM-004-SSA3-2012 del expediente clínico, viajan cifrados y solo el personal autorizado tiene acceso a ellos.

5. DERECHOS ARCO (ACCESO, RECTIFICACIÓN, CANCELACIÓN Y OPOSICIÓN)
Puedes ejercer tus derechos ARCO desde la sección "Privacidad y mis datos" de la aplicación, enviando una solicitud al correo citas@apolofarmacia.com.mx, o presentándola directamente en nuestro domicilio en Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Estado de México, México. Tu solicitud debe incluir tu nombre completo, el derecho que deseas ejercer y una descripción clara del dato respecto del cual lo ejerces. La Farmacia responderá en un plazo máximo de 20 días hábiles conforme a la LFPDPPP.
La cancelación de tus datos personales no procederá respecto de la información que deba conservarse para cumplir obligaciones legales — en particular tu expediente clínico, que se conserva al menos 5 años a partir de tu último acto médico conforme a la NOM-004-SSA3-2012 (numeral 5.4). En ese supuesto, tus datos quedarán bloqueados y no se tratarán para finalidad distinta de su conservación, hasta que concluya el plazo legal y proceda su supresión.

6. REVOCACIÓN DEL CONSENTIMIENTO
En cualquier momento puedes revocar el consentimiento que has otorgado para el tratamiento de tus datos personales, incluidos tus datos sensibles de salud, sin que se le atribuyan efectos retroactivos. Para revocarlo, usa la opción "Revocar consentimientos" de la sección "Privacidad y mis datos" de la aplicación, envía tu solicitud al correo citas@apolofarmacia.com.mx o preséntala en nuestro domicilio. Ten en cuenta que la revocación puede implicar que no sea posible seguir prestando los servicios de salud, teleconsulta o farmacia que requieran dichos datos, mismos que se pausarán hasta que firmes los documentos de nuevo.

7. REGISTROS DE SALUD EN LA APLICACIÓN, ALMACENAMIENTO Y NOTIFICACIONES
Los registros de salud que captures en la aplicación (peso, altura, presión arterial, glucosa, resultados de laboratorio y estudios, vacunas, medicamentos y recordatorios, metas, pasos y actividad física, sueño, ayuno, alimentos e identificación médica de emergencia con tus contactos) se guardan en nuestros servidores, asociados a tu cuenta, para que no se pierdan si cambias de teléfono y para que el médico que te atienda pueda consultarlos. Solo tú y el personal de salud autorizado de la Farmacia (médicos y personal clínico, según su función) tienen acceso a ellos. En tu expediente se muestran identificados como "Registrado por el paciente, no verificado", para distinguirlos de las mediciones realizadas por personal de salud; cuando se consultan para tu atención forman parte de tu expediente clínico y se conservan conforme a la sección 5.
Si antes de esta versión guardaste registros únicamente en tu teléfono, al aceptar este aviso la aplicación los enviará a tu cuenta. La aplicación puede conservar una copia temporal en tu dispositivo para funcionar con rapidez; esa copia se borra al cerrar sesión. Cualquier persona con acceso a tu dispositivo con la sesión abierta podría ver tus registros.
Asimismo, si aceptas las notificaciones, la aplicación puede enviarte notificaciones push (recordatorios de citas, de medicamentos y avisos del servicio), cuyo texto puede ser visible en la pantalla de bloqueo de tu dispositivo. Puedes desactivarlas en cualquier momento desde la sección "Notificaciones" de la aplicación o en la configuración de notificaciones de tu navegador o dispositivo.

8. COOKIES Y MEDICIÓN DE USO (GOOGLE ANALYTICS)
La aplicación usa almacenamiento local y cookies propias necesarias para mantener tu sesión y funcionar; no es posible desactivarlas sin dejar de usar la aplicación.
Solo si iniciaste sesión y aceptaste las finalidades secundarias, la aplicación usa además Google Analytics, un servicio de Google LLC que coloca cookies de medición (por ejemplo "_ga") para generar estadísticas de uso. Con él registramos: las pantallas que visitas, los botones que presionas, el tipo de dispositivo y navegador, la fecha y hora, una ubicación aproximada (ciudad o región) derivada de tu conexión, y eventos generales como iniciar sesión, agendar una cita o un chequeo, unirte a la fila, completar una compra (monto, número de productos y su categoría o identificador interno) o ganar y canjear Monedas Apolo. No enviamos a Google tu nombre, correo, teléfono, CURP ni ningún dato de salud (lecturas, medicamentos, ánimo, sueño ni resultados), y no le asignamos un identificador de usuario.
Puedes dejar de ser medido en cualquier momento retirando tu consentimiento para finalidades secundarias en "Privacidad y mis datos"; también puedes borrar o bloquear las cookies desde la configuración de tu navegador. Google trata estos datos como encargado, en servidores que pueden estar fuera de México; puedes consultar cómo los usa en https://policies.google.com/technologies/partner-sites.

9. CAMBIOS AL AVISO DE PRIVACIDAD
El presente aviso de privacidad puede sufrir modificaciones derivadas de nuevos requerimientos legales, mejoras de nuestros procesos o de nuestros servicios. Cualquier cambio será publicado en la sección "Aviso de privacidad" de la aplicación y, cuando el cambio sea significativo, te lo notificaremos a través de la aplicación o de tu correo electrónico registrado y te pediremos aceptarlo de nuevo. La versión vigente indicará siempre su fecha de última actualización.

Al firmar este documento consientes expresamente el tratamiento de tus datos personales, incluidos tus datos sensibles de salud y los registros de salud que captures en la aplicación, conforme a este aviso.$aviso$, false
where not exists (select 1 from public.consent_texts where type = 'privacidad' and version = 3);
update public.consent_texts set active = (version = 3) where type = 'privacidad';

-- 2. Version-aware signing ----------------------------------------------------
create or replace function public.sign_consent_documents(p_docs jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cust record;
  d jsonb;
  v_type text;
  v_title text;
  v_content text;
  n integer := 0;
begin
  select id, org_id into v_cust from public.customers where profile_id = auth.uid() limit 1;
  if v_cust.id is null then
    raise exception 'No se encontró expediente de cliente';
  end if;
  for d in select value from jsonb_array_elements(coalesce(p_docs, '[]'::jsonb)) loop
    v_type := d->>'type';
    if v_type not in ('privacidad','general','teleconsulta','firma_electronica') then
      raise exception 'Tipo de consentimiento no válido: %', coalesce(v_type, '(vacío)');
    end if;
    -- El texto firmado es el canónico del servidor (public.consent_texts);
    -- title/content del payload se ignoran (D-N3).
    select title, content into v_title, v_content
      from public.consent_texts
     where type = v_type and active
     order by version desc limit 1;
    if not found then
      raise exception 'Texto de consentimiento no configurado: %', v_type;
    end if;
    -- Version-aware: only skip when the customer already signed THIS text.
    if not exists (select 1 from public.consent_documents
                    where customer_id = v_cust.id and type = v_type and status = 'signed'
                      and revoked_at is null and content = v_content) then
      insert into public.consent_documents
        (org_id, customer_id, type, title, content, status,
         signer_name, signer_relationship, signer_id_ref, signed_at, signer_user_agent, created_by)
      values
        (v_cust.org_id, v_cust.id, v_type,
         left(v_title,300), v_content, 'signed',
         left(coalesce(d->>'signer_name',''),200),
         nullif(left(coalesce(d->>'signer_relationship',''),50),''),
         nullif(left(coalesce(d->>'signer_id_ref',''),20),''),
         now(), left(coalesce(d->>'signer_user_agent',''),500), auth.uid());
      n := n + 1;
    end if;
  end loop;
  return n;
end
$fn$;

-- Has this customer signed the ACTIVE text of a consent type (not revoked)?
create or replace function public.consent_is_current(p_customer uuid, p_type text)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.consent_documents cd
    join public.consent_texts ct on ct.type = cd.type and ct.active
    where cd.customer_id = p_customer and cd.type = p_type and cd.status = 'signed'
      and cd.revoked_at is null and cd.content = ct.content)
$fn$;
revoke all on function public.consent_is_current(uuid, text) from public, anon, authenticated;

-- For the app's consent gate: { privacidad: bool, general: bool, ... }
create or replace function public.my_consent_currency()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_cust uuid := (select id from public.customers where profile_id = auth.uid() order by created_at limit 1);
begin
  if v_cust is null then return null; end if;
  return jsonb_build_object(
    'privacidad', public.consent_is_current(v_cust, 'privacidad'),
    'general', public.consent_is_current(v_cust, 'general'),
    'teleconsulta', public.consent_is_current(v_cust, 'teleconsulta'),
    'firma_electronica', public.consent_is_current(v_cust, 'firma_electronica'));
end $fn$;
revoke all on function public.my_consent_currency() from public, anon;
grant execute on function public.my_consent_currency() to authenticated;

-- RLS helper: the logged-in user owns this customer row AND accepted the
-- current aviso (write gate for patient-reported data).
create or replace function public.can_write_my_health(p_customer uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.customers c where c.id = p_customer and c.profile_id = auth.uid())
     and public.consent_is_current(p_customer, 'privacidad')
$fn$;
revoke all on function public.can_write_my_health(uuid) from public, anon;
grant execute on function public.can_write_my_health(uuid) to authenticated;

-- 3. Patient-reported health records ---------------------------------------------
create table if not exists public.patient_health_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null check (kind in ('vital', 'lab', 'vaccine', 'medicine', 'goal', 'food', 'steps', 'sleep')),
  client_id text not null check (length(client_id) between 1 and 200),
  recorded_at timestamptz,
  data jsonb not null check (octet_length(data::text) <= 20000),
  source text not null default 'paciente' check (source = 'paciente'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, kind, client_id)
);
create index if not exists patient_health_records_customer_idx on public.patient_health_records (customer_id, kind, recorded_at desc);
alter table public.patient_health_records enable row level security;
revoke all on public.patient_health_records from anon;
revoke truncate on public.patient_health_records from authenticated;

drop policy if exists phr_customer_read on public.patient_health_records;
create policy phr_customer_read on public.patient_health_records for select
  using (customer_id in (select c.id from public.customers c where c.profile_id = auth.uid()));
drop policy if exists phr_clinical_read on public.patient_health_records;
create policy phr_clinical_read on public.patient_health_records for select
  using (is_clinical_staff() and org_id = get_my_org_id());
drop policy if exists phr_customer_insert on public.patient_health_records;
create policy phr_customer_insert on public.patient_health_records for insert
  with check (public.can_write_my_health(customer_id)
              and org_id = (select c.org_id from public.customers c where c.id = customer_id));
drop policy if exists phr_customer_update on public.patient_health_records;
create policy phr_customer_update on public.patient_health_records for update
  using (customer_id in (select c.id from public.customers c where c.profile_id = auth.uid()))
  with check (public.can_write_my_health(customer_id)
              and org_id = (select c.org_id from public.customers c where c.id = customer_id));
drop policy if exists phr_customer_delete on public.patient_health_records;
create policy phr_customer_delete on public.patient_health_records for delete
  using (customer_id in (select c.id from public.customers c where c.profile_id = auth.uid()));

create table if not exists public.patient_emergency_info (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  info jsonb not null default '{}'::jsonb check (octet_length(info::text) <= 20000),
  contacts jsonb not null default '[]'::jsonb check (octet_length(contacts::text) <= 20000),
  source text not null default 'paciente' check (source = 'paciente'),
  updated_at timestamptz not null default now()
);
alter table public.patient_emergency_info enable row level security;
revoke all on public.patient_emergency_info from anon;
revoke truncate on public.patient_emergency_info from authenticated;
drop policy if exists pei_customer_read on public.patient_emergency_info;
create policy pei_customer_read on public.patient_emergency_info for select
  using (customer_id in (select c.id from public.customers c where c.profile_id = auth.uid()));
drop policy if exists pei_clinical_read on public.patient_emergency_info;
create policy pei_clinical_read on public.patient_emergency_info for select
  using (is_clinical_staff() and org_id = get_my_org_id());
drop policy if exists pei_customer_insert on public.patient_emergency_info;
create policy pei_customer_insert on public.patient_emergency_info for insert
  with check (public.can_write_my_health(customer_id)
              and org_id = (select c.org_id from public.customers c where c.id = customer_id));
drop policy if exists pei_customer_update on public.patient_emergency_info;
create policy pei_customer_update on public.patient_emergency_info for update
  using (customer_id in (select c.id from public.customers c where c.profile_id = auth.uid()))
  with check (public.can_write_my_health(customer_id)
              and org_id = (select c.org_id from public.customers c where c.id = customer_id));
drop policy if exists pei_customer_delete on public.patient_emergency_info;
create policy pei_customer_delete on public.patient_emergency_info for delete
  using (customer_id in (select c.id from public.customers c where c.profile_id = auth.uid()));
