-- ============================================================================
-- Textos de consentimiento canónicos + pedidos de la tienda en línea
-- (2026-09-22). Migración aditiva — aplicar ANTES de reabrir la tienda.
--
-- Parte 1 — consent_texts (corrección del hallazgo D-N3 del pentest):
--   public.sign_consent_documents confiaba en el title/content enviados por
--   el cliente al insertar en consent_documents. Ahora el texto firmado es
--   canónico del servidor: los textos vigentes viven en public.consent_texts
--   (sembrados abajo como versión 1, copia verbatim de
--   public/customer-app/js/consentDocs.js) y la RPC los sustituye, ignorando
--   el title/content del payload. Los clientes ya desplegados siguen
--   funcionando: su payload todavía trae title/content, pero el servidor los
--   reemplaza por el texto canónico.
--
-- Parte 2 — place_store_order (reapertura de la tienda en línea):
--   El precio calculado en el cliente no es confiable: el trigger
--   sale_items_customer_price_guard_trg ya fuerza el precio del servidor en
--   inserciones directas de no-staff, así que la tienda DEBE pasar por una
--   RPC security definer. public.place_store_order calcula los precios en el
--   servidor (con descuento de membresía), bloquea las filas de inventario
--   (FOR UPDATE), valida existencias, bloquea la venta en línea de productos
--   con receta o grupo controlado, descuenta stock y deja bitácora en
--   inventory_movements — todo en una sola transacción atómica.
-- ============================================================================

-- ---------- Parte 1: consent_texts ----------
create table if not exists public.consent_texts (
  type text not null,
  version integer not null,
  title text not null,
  content text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (type, version)
);

alter table public.consent_texts enable row level security;

-- Sin políticas RLS: solo la leen funciones security definer.
revoke all on public.consent_texts from public, anon, authenticated;

insert into public.consent_texts (type, version, title, content) values
  (
    'privacidad', 1, 'Aviso de Privacidad',
    $ct$AVISO DE PRIVACIDAD — FARMACIA APOLO
Última actualización: septiembre 2026

1. RESPONSABLE DEL TRATAMIENTO DE TUS DATOS
Farmacia Apolo (en adelante "la Farmacia"), con domicilio en Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Estado de México, México, es la responsable del tratamiento de tus datos personales y de tus datos personales sensibles de salud, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), publicada en el Diario Oficial de la Federación el 20 de marzo de 2025, y, en materia de expediente clínico, a la NOM-004-SSA3-2012.

2. DATOS PERSONALES QUE RECABAMOS
Para la prestación de nuestros servicios recabamos: nombre completo, fecha de nacimiento y género; correo electrónico, teléfono y número de membresía; datos de contacto de emergencia; e información de compras y pedidos en la farmacia. Además, con tu consentimiento expreso, recabamos datos personales sensibles de salud: padecimiento actual, antecedentes y notas de consulta médica; diagnósticos, pronósticos, planes de tratamiento y recetas médicas; signos vitales, alergias, condiciones médicas y medicamentos actuales; métricas de salud registradas en la aplicación (peso, altura, sueño, ayuno, actividad física); y los documentos de consentimiento informado que firmes.

3. FINALIDADES DEL TRATAMIENTO
Finalidades primarias (necesarias): prestación de servicios de salud, incluyendo consulta médica general y teleconsulta; integración, resguardo y actualización de tu expediente clínico; despacho de medicamentos y gestión de pedidos de farmacia; agenda, recordatorios y seguimiento de citas médicas; y facturación, cobro y administración de tu membresía.
Finalidades secundarias (opcionales): envío de promociones, programas de lealtad y estadísticas internas de mejora del servicio. Desde el momento de la recolección puedes negarte a estas finalidades secundarias sin que por ello se te niegue el servicio: al crear tu cuenta o firmar tus documentos de consentimiento, la aplicación muestra una casilla independiente y opcional ("Acepto el uso de mis datos para finalidades secundarias"); si no la marcas, tus datos no se tratarán para finalidades secundarias. También puedes cambiar tu decisión en cualquier momento en la sección "Privacidad y mis datos" de la aplicación o por los medios descritos en la sección 5.

4. TRANSFERENCIAS DE DATOS PERSONALES
Tus datos personales no serán transferidos a terceros sin tu consentimiento, salvo en los casos previstos por el artículo 36 de la LFPDPPP, incluyendo: (a) profesionales de la salud que participen en tu atención y que están obligados al secreto profesional; (b) autoridades sanitarias competentes cuando así lo exija la legislación aplicable; y (c) proveedores de servicios que actúan como encargados del tratamiento, bajo acuerdos de confidencialidad.
Para operar la aplicación, la Farmacia se auxilia de los siguientes encargados técnicos, que tratan tus datos por cuenta del responsable y con las mismas protecciones previstas en este aviso y en la LFPDPPP: Daily.co (plataforma de videoconsulta), Resend (correo electrónico transaccional), Meta Platforms / WhatsApp (mensajería), PayPal (procesamiento de pagos), Supabase (base de datos) y Cloudflare (hospedaje y red de entrega de contenido). Algunos de estos encargados tratan datos en servidores ubicados en Estados Unidos.
Tus datos sensibles de salud se almacenan y tratan conforme a la NOM-004-SSA3-2012 del expediente clínico y solo el personal autorizado tiene acceso a ellos.

5. DERECHOS ARCO (ACCESO, RECTIFICACIÓN, CANCELACIÓN Y OPOSICIÓN)
Puedes ejercer tus derechos ARCO desde la sección "Privacidad y mis datos" de la aplicación, enviando una solicitud al correo citas@apolofarmacia.com.mx, o presentándola directamente en nuestro domicilio en Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Estado de México, México. Tu solicitud debe incluir tu nombre completo, el derecho que deseas ejercer y una descripción clara del dato respecto del cual lo ejerces. La Farmacia responderá en un plazo máximo de 20 días hábiles conforme a la LFPDPPP.
La cancelación de tus datos personales no procederá respecto de la información que deba conservarse para cumplir obligaciones legales — en particular tu expediente clínico, que se conserva al menos 5 años a partir de tu último acto médico conforme a la NOM-004-SSA3-2012 (numeral 5.4). En ese supuesto, tus datos quedarán bloqueados y no se tratarán para finalidad distinta de su conservación, hasta que concluya el plazo legal y proceda su supresión.

6. REVOCACIÓN DEL CONSENTIMIENTO
En cualquier momento puedes revocar el consentimiento que has otorgado para el tratamiento de tus datos personales, incluidos tus datos sensibles de salud, sin que se leguen efectos retroactivos. Para revocarlo, usa la opción "Revocar consentimientos" de la sección "Privacidad y mis datos" de la aplicación, envía tu solicitud al correo citas@apolofarmacia.com.mx o preséntala en nuestro domicilio. Ten en cuenta que la revocación puede implicar que no sea posible seguir prestando los servicios de salud, teleconsulta o farmacia que requieran dichos datos, mismos que se pausarán hasta que firmes los documentos de nuevo.

7. ALMACENAMIENTO LOCAL EN TU DISPOSITIVO Y NOTIFICACIONES
La aplicación guarda algunos datos de salud directamente en tu dispositivo (almacenamiento local del navegador o "localStorage"), como las métricas de salud que registras (peso, altura, sueño, ayuno, actividad física), tus medicamentos y recordatorios. Estos datos permanecen en tu dispositivo y no se envían a nuestros servidores salvo que formen parte de tu expediente clínico; cualquier persona con acceso a tu dispositivo podría verlos. Puedes eliminarlos en cualquier momento borrando los datos del sitio desde la configuración de tu navegador, o al cerrar tu sesión en un dispositivo compartido.
Asimismo, si aceptas las notificaciones, la aplicación puede enviarte notificaciones push (recordatorios de citas, de medicamentos y avisos del servicio), cuyo texto puede ser visible en la pantalla de bloqueo de tu dispositivo. Puedes desactivarlas en cualquier momento desde la sección "Notificaciones" de la aplicación o en la configuración de notificaciones de tu navegador o dispositivo.

8. CAMBIOS AL AVISO DE PRIVACIDAD
El presente aviso de privacidad puede sufrir modificaciones derivadas de nuevos requerimientos legales, mejoras de nuestros procesos o de nuestros servicios. Cualquier cambio será publicado en la sección "Aviso de privacidad" de la aplicación y, cuando el cambio sea significativo, te lo notificaremos a través de la aplicación o de tu correo electrónico registrado. La versión vigente indicará siempre su fecha de última actualización.

Al firmar este documento consientes el tratamiento de tus datos personales, incluidos tus datos sensibles de salud, conforme a este aviso.$ct$
  ),
  (
    'general', 1, 'Consentimiento Informado General',
    $ct$CONSENTIMIENTO INFORMADO GENERAL PARA ATENCIÓN MÉDICA EN CONSULTORIO
(conforme a la NOM-004-SSA3-2012 del Expediente Clínico)

1. DECLARACIÓN
Declaro, por mi propio derecho y en pleno uso de mis facultades, que solicito y acepto recibir atención médica general en el consultorio de Farmacia Apolo, y que he recibido información clara, veraz y suficiente sobre la naturaleza de los servicios que se me prestarán. Manifiesto que tuve oportunidad de hacer preguntas y que todas fueron respondidas a mi satisfacción.

2. SERVICIOS COMPRENDIDOS
Este consentimiento comprende la atención médica general ambulatoria, que puede incluir: integración de mi historia clínica y antecedentes; exploración física y toma de signos vitales; valoración, diagnóstico y pronóstico de mi estado de salud; prescripción de medicamentos y solicitud de estudios de gabinete o laboratorio cuando se indique; orientación médica, medidas preventivas y plan de tratamiento; así como la referencia a especialistas o a un nivel de atención superior cuando el médico tratante lo considere necesario.

3. RIESGOS Y BENEFICIOS GENERALES
Entiendo que la atención médica general tiene como beneficio esperado la detección oportuna, el tratamiento y el control de padecimientos comunes. Entiendo también que la práctica médica no es una ciencia exacta: pueden presentarse reacciones adversas a medicamentos, diagnósticos que requieran confirmación con estudios adicionales, o evoluciones no previstas del padecimiento. Me comprometo a informar al médico sobre alergias, medicamentos que tomo, embarazo o sospecha de embarazo, y cualquier otra condición relevante, y a seguir las indicaciones del tratamiento.

4. CONFIDENCIALIDAD Y EXPEDIENTE CLÍNICO
La información de mi atención se integrará a mi expediente clínico, el cual se resguarda conforme a la NOM-004-SSA3-2012 y al Aviso de Privacidad de la Farmacia. Solo el personal de salud autorizado y obligado al secreto profesional tendrá acceso a él.

5. DERECHO A REVOCAR EL CONSENTIMIENTO
Entiendo que puedo revocar este consentimiento en cualquier momento, manifestándolo al médico tratante o al personal de la Farmacia, sin que se leguen efectos retroactivos. La revocación puede implicar la suspensión de la atención médica que dependa de este consentimiento.

Al firmar este documento otorgo mi consentimiento informado para recibir atención médica general en el consultorio de Farmacia Apolo.$ct$
  ),
  (
    'teleconsulta', 1, 'Consentimiento para Teleconsulta',
    $ct$CONSENTIMIENTO INFORMADO PARA TELECONSULTA

1. NATURALEZA DE LA TELECONSULTA
La teleconsulta es una consulta médica realizada a distancia mediante videollamada, en la que el médico valora mi estado de salud, emite orientación, diagnóstico presuntivo y, cuando procede, receta o plan de tratamiento, sin exploración física directa. Acepto recibir atención por este medio y entiendo que el médico puede determinar, según su criterio profesional, que mi caso requiere atención presencial y canalizarme al consultorio o a otro nivel de atención.

2. LIMITACIONES — NO SUSTITUYE URGENCIAS
Entiendo y acepto que la teleconsulta NO sustituye la atención médica de urgencias ni la exploración física presencial. En caso de una emergencia (dolor torácico, dificultad respiratoria, sangrado abundante, pérdida de conciencia, reacción alérgica grave u otra condición que ponga en riesgo mi vida) debo llamar al 911 o acudir de inmediato al servicio de urgencias más cercano. Entiendo que la calidad de la valoración depende de la información que yo proporcione y de las condiciones técnicas de la conexión (video, audio e internet), y que fallas técnicas pueden interrumpir o limitar la consulta.

3. PRIVACIDAD DE LA VIDEOLLAMADA
Me comprometo a realizar la videollamada desde un lugar privado y seguro, y a informar al médico si hay otras personas presentes de mi lado. La Farmacia y el médico tratante realizarán la consulta desde un espacio que proteja la confidencialidad. La comunicación se realiza a través de canales provistos por la plataforma contratada por la Farmacia.

4. NO GRABACIÓN
Ni la Farmacia ni el médico grabarán la videollamada. De la misma manera, me comprometo a NO grabar, fotografiar ni difundir total o parcialmente la consulta sin autorización expresa del médico tratante. Lo que se documenta es la nota de consulta correspondiente en mi expediente clínico.

5. DATOS TRANSMITIDOS
Entiendo que durante la teleconsulta se transmiten y tratan mis datos de identificación, mi imagen y voz, así como datos sensibles de salud (síntomas, antecedentes, diagnósticos y recetas), conforme al Aviso de Privacidad de la Farmacia, la LFPDPPP y la NOM-004-SSA3-2012. La nota de la teleconsulta se integra a mi expediente clínico con las mismas medidas de confidencialidad.

6. DERECHO A REVOCAR
Puedo revocar este consentimiento en cualquier momento manifestándolo a la Farmacia, sin efectos retroactivos, entendiendo que ello impedirá seguir recibiendo atención por teleconsulta.

Al firmar este documento otorgo mi consentimiento informado para recibir atención médica mediante teleconsulta.$ct$
  ),
  (
    'firma_electronica', 1, 'Consentimiento de Firma Electrónica y Documentos Digitales',
    $ct$CONSENTIMIENTO PARA USO DE FIRMA ELECTRÓNICA Y DOCUMENTOS DIGITALES

1. ACEPTACIÓN DE LA FIRMA ELECTRÓNICA
Acepto que, al marcar la casilla de aceptación y registrar mi nombre en la aplicación o en la tableta de la Farmacia, esa acción constituye mi firma electrónica, la cual tiene la misma validez y efectos jurídicos que mi firma autógrafa, conforme a los artículos 89, 89 Bis y 1205 del Código de Comercio y a la Ley de Firma Electrónica Avanzada.

2. MEDIOS DE IDENTIFICACIÓN
Mi firma electrónica queda vinculada a mi cuenta (correo electrónico o teléfono y contraseña), a mi nombre completo, a la fecha y hora exactas de cada firma y a los datos técnicos de la conexión y del dispositivo desde el que firmo (como la dirección IP y el navegador), junto con el contenido íntegro del documento que firmo. Estos elementos permiten atribuirme la firma y acreditar mi voluntad, conforme al artículo 1205 del Código de Comercio.

3. DOCUMENTOS EN FORMATO DIGITAL
Acepto que los avisos de privacidad, consentimientos informados, términos y condiciones, contratos de membresía, recetas, recibos y demás documentos relacionados con los servicios de la Farmacia sean expedidos, enviados, firmados y conservados en formato digital, con la misma validez que su equivalente en papel, conforme a la NOM-004-SSA3-2012 del Expediente Clínico (numeral 5.10) y a la NOM-024-SSA3-2012 del sistema de expediente clínico electrónico.

4. CONSERVACIÓN E INTEGRIDAD
Los documentos firmados se conservan íntegros e inalterables en el expediente clínico electrónico durante al menos 5 años a partir de mi último acto médico, conforme a la NOM-004-SSA3-2012 (numeral 5.4), y bajo los criterios de conservación de mensajes de datos de la NOM-151-SCFI-2016. Cualquier corrección se asienta como un documento nuevo que referencia al original, preservando el historial.

5. ACCESO Y COPIAS
Puedo consultar mis documentos firmados y solicitar copia de ellos en cualquier momento a través de la aplicación, al correo citas@apolofarmacia.com.mx o directamente en el domicilio de la Farmacia, conforme a la NOM-024-SSA3-2012 y a mis derechos ARCO descritos en el Aviso de Privacidad.

6. DATOS PERSONALES
Los datos asociados a mi firma electrónica (mi nombre, mi cuenta y la fecha y hora de cada firma) se tratan conforme al Aviso de Privacidad de la Farmacia y a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.

7. REVOCACIÓN
Puedo revocar este consentimiento para documentos futuros manifestándolo al correo citas@apolofarmacia.com.mx o en el domicilio de la Farmacia. La revocación no afecta la validez de los documentos firmados con anterioridad y puede implicar que algunos servicios que requieren firma electrónica dejen de estar disponibles.

Al firmar este documento consiento el uso de mi firma electrónica y la generación, envío y conservación de mis documentos en formato digital.$ct$
  )
on conflict (type, version) do nothing;

-- ---------- Parte 1 (cont.): firma con texto canónico del servidor ----------
create or replace function public.sign_consent_documents(p_docs jsonb) returns integer
language plpgsql security definer set search_path to 'public' as $fn$
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
    if not exists (select 1 from public.consent_documents
                    where customer_id = v_cust.id and type = v_type and status = 'signed') then
      -- D-N3: el title/content del payload se ignoran a propósito; el texto
      -- firmado es el canónico del servidor (public.consent_texts). Los
      -- clientes ya desplegados siguen enviando title/content en su payload,
      -- pero el servidor los sustituye, así que no requieren actualización.
      select title, content into v_title, v_content
        from public.consent_texts
       where type = v_type and active
       order by version desc limit 1;
      if not found then
        raise exception 'Texto de consentimiento no configurado: %', v_type;
      end if;
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

revoke execute on function public.sign_consent_documents(jsonb) from public, anon;

grant execute on function public.sign_consent_documents(jsonb) to authenticated;

-- ---------- Parte 2: pedidos de la tienda en línea ----------
create or replace function public.place_store_order(
  p_items jsonb,
  p_patient_name text default null,
  p_payment_method text default 'cash'
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_cust record;
  v_payment text;
  d jsonb;
  v_agg record;
  v_inv record;
  v_id uuid;
  v_qty integer;
  v_discount numeric := 0;
  v_disc numeric;
  v_unit numeric;
  v_line numeric;
  v_total numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_items_json jsonb := '[]'::jsonb;
  v_sale_id uuid;
begin
  -- 1. Expediente del cliente autenticado
  select id, org_id, full_name, curp into v_cust
    from public.customers
   where profile_id = auth.uid()
   limit 1;
  if v_cust.id is null then
    raise exception 'No se encontró expediente de cliente';
  end if;

  -- 2. Método de pago
  v_payment := coalesce(p_payment_method, 'cash');
  if v_payment not in ('cash','card') then
    raise exception 'Método de pago no válido';
  end if;

  -- 3. Validación de artículos: arreglo de 1-50 elementos, cada uno con
  --    inventory_id (uuid) y quantity (entero 1-20)
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Artículos inválidos';
  end if;
  for d in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(d) <> 'object' then
      raise exception 'Artículos inválidos';
    end if;
    begin
      v_id := (d->>'inventory_id')::uuid;
    exception when others then
      raise exception 'Artículos inválidos';
    end;
    if v_id is null then
      raise exception 'Artículos inválidos';
    end if;
    if (d->>'quantity') is null or (d->>'quantity') !~ '^\d+$' then
      raise exception 'Cantidad inválida';
    end if;
    v_qty := (d->>'quantity')::integer;
    if v_qty < 1 or v_qty > 20 then
      raise exception 'Cantidad inválida';
    end if;
  end loop;

  -- 4. Descuento de membresía: primero la membresía directa del cliente;
  --    si no hay, una membresía familiar reclamada por este usuario
  select discount_percent into v_disc
    from public.memberships
   where customer_id = v_cust.id and status = 'active'
   order by created_at desc
   limit 1;
  if found then
    v_discount := coalesce(v_disc, 10);
  else
    select m.discount_percent into v_disc
      from public.membership_members mm
      join public.memberships m on m.id = mm.membership_id
     where mm.claimed_user_id = auth.uid()
       and m.status = 'active'
     limit 1;
    if found then
      v_discount := coalesce(v_disc, 10);
    end if;
  end if;

  -- 5. Renglones agregados por artículo (los duplicados se fusionan, en el
  --    orden del arreglo): bloqueo de la fila, validaciones y precio SIEMPRE
  --    del servidor (inventory.price); jamás del payload del cliente
  for v_agg in
    select (t.value->>'inventory_id')::uuid as inv_id,
           sum((t.value->>'quantity')::integer) as qty
      from jsonb_array_elements(p_items) with ordinality as t(value, ord)
     group by 1
     order by min(t.ord)
  loop
    select id, name, price, quantity, requires_prescription, controlled_group
      into v_inv
      from public.inventory
     where id = v_agg.inv_id
     for update;
    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if v_inv.requires_prescription or v_inv.controlled_group is not null then
      raise exception 'Este producto requiere receta médica y no se vende en línea: %', v_inv.name;
    end if;
    if v_inv.quantity < v_agg.qty then
      raise exception 'Sin existencias suficientes: %', v_inv.name;
    end if;
    v_unit := round((v_inv.price * (1 - v_discount / 100.0))::numeric, 2);
    v_line := v_unit * v_agg.qty;
    v_total := v_total + v_line;
    v_lines := v_lines || jsonb_build_object(
      'inventory_id', v_agg.inv_id,
      'name', v_inv.name,
      'qty', v_agg.qty,
      'unit', v_unit,
      'prev_qty', v_inv.quantity);
    v_items_json := v_items_json || jsonb_build_object(
      'name', v_inv.name,
      'quantity', v_agg.qty,
      'unit_price', v_unit,
      'line_total', v_line);
  end loop;

  -- 6. Encabezado de la venta. Queda en 'processing': el trigger
  --    sales_processing_total_guard_trg recalcula los totales desde
  --    sale_items al completarse la venta — comportamiento esperado.
  insert into public.sales
    (org_id, customer_id, patient_name, patient_curp, payment_method,
     subtotal, total, status, voided, timestamp)
  values
    (v_cust.org_id, v_cust.id,
     coalesce(nullif(left(p_patient_name,200),''), v_cust.full_name),
     v_cust.curp, v_payment, v_total, v_total, 'processing', false, now())
  returning id into v_sale_id;

  -- 7-9. Detalle (nombre y precio unitario del servidor), salida de
  --    existencias y bitácora NOM en inventory_movements
  for d in select value from jsonb_array_elements(v_lines) loop
    v_id := (d->>'inventory_id')::uuid;
    v_qty := (d->>'qty')::integer;
    insert into public.sale_items (sale_id, inventory_id, name, quantity, price)
    values (v_sale_id, v_id, d->>'name', v_qty, (d->>'unit')::numeric);
    update public.inventory
       set quantity = quantity - v_qty,
           sales_count = coalesce(sales_count, 0) + v_qty,
           updated_at = now()
     where id = v_id;
    insert into public.inventory_movements
      (org_id, inventory_id, type, quantity_change, previous_quantity, new_quantity,
       reference_id, reference_type, reason, user_name)
    values
      (v_cust.org_id, v_id, 'sale', -v_qty,
       (d->>'prev_qty')::integer, (d->>'prev_qty')::integer - v_qty,
       v_sale_id, 'sale', d->>'name', 'tienda en línea');
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'total', v_total,
    'discount_percent', v_discount,
    'items', v_items_json);
end
$fn$;

revoke execute on function public.place_store_order(jsonb, text, text) from public, anon;

grant execute on function public.place_store_order(jsonb, text, text) to authenticated;
