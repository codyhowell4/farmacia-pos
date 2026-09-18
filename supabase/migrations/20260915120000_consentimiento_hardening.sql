-- ============================================================
-- CONSENTIMIENTO HARDENING (LAUNCH_COMPLIANCE_GAPS.md C-items)
-- ============================================================
-- 1. Consent evidence columns: guardian relationship + ID ref for
--    minors (C5), staff collector for portal-marked consents (C10)
-- 2. rate_limit_events: abuse protection for the public
--    tablet-checkin edge function (C1/C2)
-- 3. customers_protect_evidence trigger: block hard-deletes of
--    customers that have clinical/legal records (C9, NOM-004 5.4)
-- ============================================================

-- 1. Consent evidence columns ------------------------------------
alter table consent_documents add column if not exists signer_relationship text;
alter table consent_documents add column if not exists signer_id_ref text;
alter table consent_documents add column if not exists recorded_by_name text;

-- 2. Rate limiting (service-role only; no RLS policies = denied ---
--    to anon/authenticated, the edge function uses the service key)
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_bucket_key_ts_idx
  on public.rate_limit_events (bucket, key, created_at desc);

alter table public.rate_limit_events enable row level security;

-- 3. Block hard-deletes that would destroy NOM-004 5.4 evidence ----
-- A customer with clinical/legal records must be anonymized instead
-- of deleted. Empty shells (e.g. the trigger-created duplicate that
-- tablet-checkin removes during account provisioning) have no child
-- rows and still delete cleanly.
create or replace function public.customers_protect_evidence()
returns trigger as $$
begin
  if exists (select 1 from appointments where customer_id = old.id)
  or exists (select 1 from consulta_notes where customer_id = old.id)
  or exists (select 1 from consent_documents where customer_id = old.id)
  or exists (select 1 from medical_notes where customer_id = old.id)
  or exists (select 1 from prescriptions where customer_id = old.id)
  or exists (select 1 from medical_history_versions where customer_id = old.id)
  or exists (select 1 from customer_documents where customer_id = old.id)
  or exists (select 1 from memberships where customer_id = old.id)
  or exists (select 1 from sales where customer_id = old.id) then
    raise exception 'Este expediente tiene registros clinicos o legales (citas, consentimientos, notas, recetas, membresias o ventas) y no se puede eliminar: la NOM-004-SSA3-2012 (5.4) exige conservarlo minimo 5 anos. Anonimiza los datos en lugar de eliminar el registro.';
  end if;
  return old;
end;
$$ language plpgsql;

drop trigger if exists customers_protect_evidence on customers;
create trigger customers_protect_evidence
  before delete on customers
  for each row execute function public.customers_protect_evidence();
