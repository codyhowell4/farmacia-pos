-- ============================================================
-- NOM-024 / NOM-004 READINESS PROGRAM — schema migration
-- ============================================================
-- Creates the data model for:
--   1. Structured consulta notes (NOM-004 6.x), append-only
--   2. CIE-10 diagnosis catalog (seeded separately)
--   3. Versioned medical history (audit trail, no silent overwrites)
--   4. Consent documents
--   5. Notification queue (email/whatsapp reminders; processed by
--      the send-notifications edge function once providers are set)
--   6. New staff roles: secretary (agenda-only), nurse (vitals)
--   7. Patient attachments storage bucket
--   8. Receta/consulta-note electronic signature fields
--   9. Tabla 1 identification fields on customers (sexo, birth_state)
-- ============================================================

-- ----------------------------------------------------------
-- 1. ROLES: secretary + nurse
-- ----------------------------------------------------------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'pos', 'inventory', 'doctor', 'customer', 'secretary', 'nurse'));

-- ----------------------------------------------------------
-- 2. CUSTOMERS: Tabla 1 minimum identification data (NOM-024 6.5)
-- ----------------------------------------------------------
alter table customers add column if not exists sexo text;
alter table customers add column if not exists birth_state text;
alter table customers add column if not exists sexo_check boolean generated always as (sexo is null or sexo in ('M','H')) stored;

-- ----------------------------------------------------------
-- 3. APPOINTMENTS: nurse pre-consulta vitals
-- ----------------------------------------------------------
alter table appointments add column if not exists nurse_vitals jsonb;

-- ----------------------------------------------------------
-- 4. CONSULTA NOTES (structured NOM-004 nota de evolución)
--    Append-only: edits create a new row with replaces_id.
-- ----------------------------------------------------------
create table if not exists consulta_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  doctor_id uuid not null references profiles(id),
  -- NOM-004 6.1/6.2 sections
  padecimiento_actual text,
  exploracion_fisica text,
  vitals jsonb,              -- {edad,talla_cm,peso_kg,temperatura,ta,fc,fr,so2,glicemia}
  diagnostico text,
  cie10_codes jsonb,         -- [{code, description}]
  pronostico text,
  plan text,                 -- indicación terapéutica
  -- version chain (append-only)
  replaces_id uuid references consulta_notes(id) on delete set null,
  -- electronic signature (FEA) — filled at creation when signed
  signed_payload text,
  signature text,
  signer_cert_serial text,
  signed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists consulta_notes_org_id_idx on consulta_notes(org_id);
create index if not exists consulta_notes_appointment_idx on consulta_notes(appointment_id);
create index if not exists consulta_notes_customer_idx on consulta_notes(customer_id);
create index if not exists consulta_notes_doctor_idx on consulta_notes(doctor_id);

alter table consulta_notes enable row level security;

drop policy if exists "consulta_notes_staff" on consulta_notes;
create policy "consulta_notes_staff" on consulta_notes
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id());

drop policy if exists "consulta_notes_customer" on consulta_notes;
create policy "consulta_notes_customer" on consulta_notes
  for select using (customer_id in (select id from customers where profile_id = auth.uid()));

-- Append-only enforcement (NOM-024 6.6.2 unalterable documents):
-- no UPDATE, no DELETE. New versions insert a row with replaces_id.
create or replace function consulta_notes_append_only() returns trigger as $$
begin
  raise exception 'consulta_notes es de solo anexar: registre una nueva versión en lugar de modificar o eliminar';
end;
$$ language plpgsql;

drop trigger if exists consulta_notes_no_update on consulta_notes;
create trigger consulta_notes_no_update
  before update or delete on consulta_notes
  for each row execute function consulta_notes_append_only();

-- ----------------------------------------------------------
-- 5. CIE-10 diagnosis catalog (Apéndice A mandatory catalog)
--    Seeded by MIGRATION_cie10_seed.sql
-- ----------------------------------------------------------
create table if not exists cie10_codes (
  code text primary key,
  description text not null,
  chapter text
);

alter table cie10_codes enable row level security;

drop policy if exists "cie10_read_all" on cie10_codes;
create policy "cie10_read_all" on cie10_codes
  for select using (true);

-- ----------------------------------------------------------
-- 6. MEDICAL HISTORY VERSIONS (audit trail of historia changes)
-- ----------------------------------------------------------
create table if not exists medical_history_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  snapshot jsonb not null,
  change_summary text,
  changed_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists medical_history_versions_customer_idx on medical_history_versions(customer_id);

alter table medical_history_versions enable row level security;

drop policy if exists "medical_history_versions_staff" on medical_history_versions;
create policy "medical_history_versions_staff" on medical_history_versions
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id());

-- ----------------------------------------------------------
-- 7. CONSENT DOCUMENTS (consentimiento informado, NOM-004 10.1)
-- ----------------------------------------------------------
create table if not exists consent_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  type text not null default 'general',     -- general | teleconsulta | procedimiento | otro
  title text not null,
  content text not null,
  status text not null default 'pending',   -- pending | signed | declined
  signer_name text,
  signed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists consent_documents_customer_idx on consent_documents(customer_id);

alter table consent_documents enable row level security;

drop policy if exists "consent_documents_staff" on consent_documents;
create policy "consent_documents_staff" on consent_documents
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id());

drop policy if exists "consent_documents_customer" on consent_documents;
create policy "consent_documents_customer" on consent_documents
  for select using (customer_id in (select id from customers where profile_id = auth.uid()));

-- ----------------------------------------------------------
-- 8. NOTIFICATION QUEUE + appointment trigger
--    Processed by the send-notifications edge function. Without
--    provider keys the function marks rows 'skipped' — plugging in
--    RESEND_API_KEY / WHATSAPP_TOKEN later makes it live.
-- ----------------------------------------------------------
create table if not exists notification_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  channel text not null,                    -- email | whatsapp | sms
  recipient text not null,                  -- email address or phone
  template text not null,                   -- booking_confirmation | appointment_reminder | consulta_link
  payload jsonb not null default '{}',
  status text not null default 'pending',   -- pending | sent | failed | skipped
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz default now()
);

create index if not exists notification_queue_status_idx on notification_queue(status, scheduled_for);

alter table notification_queue enable row level security;

drop policy if exists "notification_queue_staff" on notification_queue;
create policy "notification_queue_staff" on notification_queue
  for select using (org_id = get_my_org_id() and is_org_staff());

-- Enqueue booking confirmation + 24h reminder for any appointment
-- that has a registered customer with contact info. Runs as definer
-- so customer-portal bookings are covered without customer INSERT rights.
create or replace function enqueue_appointment_notifications() returns trigger
security definer set search_path = public as $$
declare
  v_customer record;
begin
  if new.customer_id is null then return new; end if;

  select email, phone, full_name into v_customer
  from customers where id = new.customer_id;

  if v_customer.email is not null then
    insert into notification_queue (org_id, channel, recipient, template, payload, scheduled_for)
    values (new.org_id, 'email', v_customer.email, 'booking_confirmation',
            jsonb_build_object('appointment_id', new.id, 'patient_name', v_customer.full_name,
                               'appointment_date', new.appointment_date, 'type', new.type),
            now());
    if new.appointment_date > now() + interval '24 hours' then
      insert into notification_queue (org_id, channel, recipient, template, payload, scheduled_for)
      values (new.org_id, 'email', v_customer.email, 'appointment_reminder',
              jsonb_build_object('appointment_id', new.id, 'patient_name', v_customer.full_name,
                                 'appointment_date', new.appointment_date, 'type', new.type),
              new.appointment_date - interval '24 hours');
    end if;
  end if;

  if v_customer.phone is not null then
    insert into notification_queue (org_id, channel, recipient, template, payload, scheduled_for)
    values (new.org_id, 'whatsapp', v_customer.phone, 'booking_confirmation',
            jsonb_build_object('appointment_id', new.id, 'patient_name', v_customer.full_name,
                               'appointment_date', new.appointment_date, 'type', new.type),
            now());
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists appointments_notify on appointments;
create trigger appointments_notify
  after insert on appointments
  for each row execute function enqueue_appointment_notifications();

-- ----------------------------------------------------------
-- 9. PATIENT ATTACHMENTS storage bucket
--    Files tracked in customer_documents (document_type:
--    laboratorio | imagen | consentimiento | otro)
-- ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('patient-documents', 'patient-documents', false)
on conflict (id) do nothing;

drop policy if exists "patient_docs_staff" on storage.objects;
create policy "patient_docs_staff" on storage.objects
  for all using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = get_my_org_id()::text
    and is_org_staff()
  ) with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = get_my_org_id()::text
  );

drop policy if exists "patient_docs_customer_read" on storage.objects;
create policy "patient_docs_customer_read" on storage.objects
  for select using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[2] in (
      select id::text from customers where profile_id = auth.uid()
    )
  );

-- ----------------------------------------------------------
-- 10. SIGNATURE FIELDS on prescriptions (FEA)
-- ----------------------------------------------------------
alter table prescriptions add column if not exists signed_payload text;
alter table prescriptions add column if not exists signature text;
alter table prescriptions add column if not exists signer_cert_serial text;
alter table prescriptions add column if not exists signed_at timestamptz;

-- ----------------------------------------------------------
-- VERIFICATION (uncomment after migrating):
-- select table_name from information_schema.tables where table_name in
--   ('consulta_notes','cie10_codes','medical_history_versions','consent_documents','notification_queue');
-- select count(*) from cie10_codes;
-- select conname from pg_constraint where conname = 'profiles_role_check';
-- ============================================================
