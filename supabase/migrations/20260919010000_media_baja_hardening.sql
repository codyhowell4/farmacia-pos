-- ============================================================================
-- Round-2 audit: MEDIA + BAJA hardening (R2-25..R2-44 backlog)
-- Additive migration — apply BEFORE the frontend push.
-- Covers:
--   R2-26 sale_items Rx/controlled snapshot + void cascade to prescriptions
--   R2-31 consent_documents immutability + content hash + server-side signing RPC
--   R2-32 server-side consent gate for customer appointment booking
--   R2-33 server-side expired-stock sale block
--   R2-34 author name snapshot on clinical notes
--   R2-28 cron-authenticated send-notifications (secret in cron_config)
--   R2-29 staff deactivation (deactivated_at excluded from role helpers)
--   R2-39 nurse vitals attribution column
--   R2-42 cron_heartbeat lockdown
--   R2-27 org fiscal/sanitary ticket header columns
-- ============================================================================

-- ---------- R2-26/R2-33: sale_items snapshot + expired-sale block ----------
alter table public.sale_items add column if not exists controlled_group text;

create or replace function public.sale_items_prepare() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare inv record;
begin
  if new.inventory_id is not null then
    select requires_prescription, controlled_group, expiration_date
      into inv from public.inventory where id = new.inventory_id;
    if found then
      if inv.expiration_date is not null and inv.expiration_date < current_date then
        raise exception 'Venta bloqueada: el artículo está caducado (caducidad %). Retírelo del piso y regístrelo como merma.', inv.expiration_date;
      end if;
      new.requires_prescription := coalesce(inv.requires_prescription, false);
      new.controlled_group := inv.controlled_group;
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists sale_items_prepare_trg on public.sale_items;

create trigger sale_items_prepare_trg
before insert on public.sale_items
for each row execute function public.sale_items_prepare();

update public.sale_items si
   set requires_prescription = i.requires_prescription,
       controlled_group = i.controlled_group
  from public.inventory i
 where si.inventory_id = i.id
   and (si.requires_prescription is distinct from i.requires_prescription
        or si.controlled_group is distinct from i.controlled_group);

-- ---------- R2-25/R2-26: void reason + void cascade to prescriptions ----------
alter table public.sales add column if not exists voided_reason text;

create or replace function public.sales_void_cascade() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.voided = true and old.voided is distinct from true then
    update public.prescriptions
       set is_voided = true,
           voided_at = coalesce(voided_at, now()),
           voided_by = coalesce(voided_by, new.voided_by),
           voided_reason = coalesce(voided_reason, new.voided_reason, 'Venta anulada')
     where sale_id = new.id and is_voided is not true;
  end if;
  return new;
end
$fn$;

drop trigger if exists sales_void_cascade_trg on public.sales;

create trigger sales_void_cascade_trg
after update of voided on public.sales
for each row execute function public.sales_void_cascade();

-- ---------- R2-31: consent integrity (hash + freeze + server signing RPC) ----------
alter table public.consent_documents add column if not exists content_sha256 text;

update public.consent_documents
   set content_sha256 = encode(extensions.digest(coalesce(type,'')||'|'||coalesce(title,'')||'|'||coalesce(content,''),'sha256'),'hex')
 where content_sha256 is null;

create or replace function public.consent_documents_hash() returns trigger
language plpgsql security definer set search_path to 'public', 'extensions' as $fn$
begin
  new.content_sha256 := encode(digest(coalesce(new.type,'')||'|'||coalesce(new.title,'')||'|'||coalesce(new.content,''),'sha256'),'hex');
  return new;
end
$fn$;

drop trigger if exists consent_documents_hash_trg on public.consent_documents;

create trigger consent_documents_hash_trg
before insert on public.consent_documents
for each row execute function public.consent_documents_hash();

create or replace function public.consent_documents_freeze() returns trigger
language plpgsql set search_path to 'public' as $fn$
begin
  if (new.type is distinct from old.type)
     or (new.title is distinct from old.title)
     or (new.content is distinct from old.content)
     or (new.customer_id is distinct from old.customer_id)
     or (new.org_id is distinct from old.org_id)
     or (new.appointment_id is distinct from old.appointment_id)
     or (new.created_by is distinct from old.created_by)
     or (new.created_at is distinct from old.created_at)
     or (new.content_sha256 is distinct from old.content_sha256) then
    raise exception 'Los documentos de consentimiento son inmutables: contenido e identidad no pueden modificarse';
  end if;
  return new;
end
$fn$;

drop trigger if exists consent_documents_freeze_trg on public.consent_documents;

create trigger consent_documents_freeze_trg
before update on public.consent_documents
for each row execute function public.consent_documents_freeze();

create or replace function public.sign_consent_documents(p_docs jsonb) returns integer
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_cust record;
  d jsonb;
  v_type text;
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
      insert into public.consent_documents
        (org_id, customer_id, type, title, content, status,
         signer_name, signer_relationship, signer_id_ref, signed_at, signer_user_agent, created_by)
      values
        (v_cust.org_id, v_cust.id, v_type,
         left(coalesce(d->>'title',''),300), d->>'content', 'signed',
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

-- ---------- R2-34: author name snapshot on clinical notes ----------
alter table public.consulta_notes add column if not exists author_name text;
alter table public.medical_notes add column if not exists author_name text;

create or replace function public.consulta_notes_stamp_author() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.author_name is null then
    select full_name into new.author_name from public.profiles
     where id = coalesce(new.doctor_id, new.created_by, auth.uid());
  end if;
  return new;
end
$fn$;

drop trigger if exists consulta_notes_stamp_author_trg on public.consulta_notes;

create trigger consulta_notes_stamp_author_trg
before insert on public.consulta_notes
for each row execute function public.consulta_notes_stamp_author();

create or replace function public.medical_notes_stamp_author() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.author_name is null then
    select full_name into new.author_name from public.profiles where id = new.doctor_id;
  end if;
  return new;
end
$fn$;

drop trigger if exists medical_notes_stamp_author_trg on public.medical_notes;

create trigger medical_notes_stamp_author_trg
before insert on public.medical_notes
for each row execute function public.medical_notes_stamp_author();

alter table public.consulta_notes disable trigger consulta_notes_no_update;
alter table public.medical_notes disable trigger medical_notes_no_update;

update public.consulta_notes n set author_name = p.full_name
  from public.profiles p where p.id = n.doctor_id and n.author_name is null;

update public.medical_notes n set author_name = p.full_name
  from public.profiles p where p.id = n.doctor_id and n.author_name is null;

alter table public.consulta_notes enable trigger consulta_notes_no_update;
alter table public.medical_notes enable trigger medical_notes_no_update;

-- ---------- R2-39: nurse vitals attribution ----------
alter table public.appointments add column if not exists nurse_vitals_by_name text;

-- ---------- R2-32: server-side consent gate for customer bookings ----------
create or replace function public.appointments_consent_gate() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare v_role text;
begin
  if auth.uid() is null then
    return new; -- service-role flows (kiosk, video-room, check-in)
  end if;
  if new.customer_id is null then
    return new;
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'customer' then
    if exists (
      select 1 from unnest(array['privacidad','general','teleconsulta','firma_electronica']) as t
       where not exists (select 1 from public.consent_documents cd
                          where cd.customer_id = new.customer_id
                            and cd.type = t and cd.status = 'signed')
    ) then
      raise exception 'Debe firmar los documentos de consentimiento antes de agendar una cita. Ábralos desde la sección de consentimientos de la app.';
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists appointments_consent_gate_trg on public.appointments;

create trigger appointments_consent_gate_trg
before insert on public.appointments
for each row execute function public.appointments_consent_gate();

-- ---------- R2-29: staff deactivation ----------
alter table public.profiles add column if not exists deactivated_at timestamptz;

create or replace function public.is_admin() returns boolean
language sql stable security definer as $fn$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and deactivated_at is null
  )
$fn$;

create or replace function public.is_org_staff() returns boolean
language sql stable security definer as $fn$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','pos','inventory','doctor')
      and deactivated_at is null
  )
$fn$;

create or replace function public.is_clinical_staff() returns boolean
language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','doctor')
      and deactivated_at is null
  )
$fn$;

create or replace function public.admin_set_user_active(p_profile_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare v_name text;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores';
  end if;
  if p_profile_id = auth.uid() and not p_active then
    raise exception 'No puede desactivar su propia cuenta';
  end if;
  update public.profiles
     set deactivated_at = case when p_active then null else now() end
   where id = p_profile_id and org_id = public.get_my_org_id()
  returning full_name into v_name;
  if v_name is null then
    raise exception 'Usuario no encontrado';
  end if;
  begin
    insert into public.audit_log (org_id, user_id, action, details, timestamp)
    values (
      public.get_my_org_id(),
      auth.uid(),
      case when p_active then 'user_reactivated' else 'user_deactivated' end,
      (case when p_active then 'Cuenta reactivada: ' else 'Cuenta desactivada: ' end) || coalesce(v_name, ''),
      now()
    );
  exception when others then
    null;
  end;
end
$fn$;

revoke execute on function public.admin_set_user_active(uuid, boolean) from public, anon;

grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

-- ---------- R2-28: cron-authenticated send-notifications ----------
create table if not exists public.cron_config (
  key text primary key,
  value text not null,
  created_at timestamptz default now()
);

alter table public.cron_config enable row level security;

revoke all on public.cron_config from public, anon, authenticated;

insert into public.cron_config (key, value)
values ('send_notifications_secret', gen_random_uuid()::text || '-' || gen_random_uuid()::text)
on conflict (key) do nothing;

select cron.unschedule('send-notifications-flush');

select cron.schedule(
  'send-notifications-flush',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://ieinjhonepkudxxpmuly.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.cron_config where key = 'send_notifications_secret')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);

-- ---------- R2-42: cron_heartbeat lockdown ----------
drop policy if exists cron_heartbeat_public_read on public.cron_heartbeat;
drop policy if exists cron_heartbeat_auth_read on public.cron_heartbeat;

create policy cron_heartbeat_auth_read on public.cron_heartbeat
for select using (auth.role() = 'authenticated');

revoke all on public.cron_heartbeat from anon;
revoke insert, update, delete on public.cron_heartbeat from authenticated;

-- ---------- R2-27: org fiscal/sanitary ticket header ----------
alter table public.organizations add column if not exists rfc text;
alter table public.organizations add column if not exists aviso_funcionamiento text;
alter table public.organizations add column if not exists responsable_sanitario text;

drop policy if exists organizations_admin_update on public.organizations;

create policy organizations_admin_update on public.organizations
for update
using (id = public.get_my_org_id() and public.is_admin())
with check (id = public.get_my_org_id() and public.is_admin());
