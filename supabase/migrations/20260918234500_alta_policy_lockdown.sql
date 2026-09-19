-- Alta hardening — step 2 (LOCKDOWN).
-- Apply ONLY AFTER: (a) step-1 migration is live, (b) the frontend build that
-- routes POS traffic through the pos_* RPCs is deployed, (c) the updated
-- edge functions (tablet-checkin, family-member-signup) are deployed.
-- Round-2 audit altas: R2-14, R2-16, R2-19 (enforcement), R2-21 (enforcement).

-- ── 1. Clinical tables: staff policies become clinical-only (R2-14) ───────
-- admin/doctor keep full access; pos/inventory lose direct access to the
-- expediente (they use the pos_* RPCs for their narrow needs).
-- Customer-facing own-row policies are untouched.

drop policy if exists appointments_staff on appointments;
create policy appointments_staff on appointments
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

drop policy if exists consent_documents_staff on consent_documents;
create policy consent_documents_staff on consent_documents
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

drop policy if exists consulta_notes_staff on consulta_notes;
create policy consulta_notes_staff on consulta_notes
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

drop policy if exists customer_documents_staff on customer_documents;
create policy customer_documents_staff on customer_documents
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

drop policy if exists customers_staff_all on customers;
create policy customers_staff_all on customers
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

drop policy if exists medical_history_versions_staff on medical_history_versions;
create policy medical_history_versions_staff on medical_history_versions
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

drop policy if exists medical_notes_staff on medical_notes;
create policy medical_notes_staff on medical_notes
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

-- ── 2. lookup_login_email: no longer callable by the public (R2-16) ───────
-- The rate-limited lookup-login-email edge function calls it with the
-- service role. Clients must go through that wrapper.
revoke execute on function public.lookup_login_email(text, uuid) from anon;
revoke execute on function public.lookup_login_email(text, uuid) from authenticated;

-- ── 2b. pos_* RPCs + revoke_consent: strip the default PUBLIC grant ───────
-- (They already raise unless is_org_staff() internally; this is defense in
-- depth — authenticated staff only.)
revoke execute on function public.pos_search_customers(text) from public, anon;
revoke execute on function public.pos_create_customer(text, text, text, text, date, text, text) from public, anon;
revoke execute on function public.pos_search_prescriptions(text) from public, anon;
revoke execute on function public.pos_search_memberships(text) from public, anon;
revoke execute on function public.pos_get_membership(uuid) from public, anon;
revoke execute on function public.pos_get_sale_for_return(uuid) from public, anon;
revoke execute on function public.revoke_consent(text) from public, anon;

-- ── 3. Minors require guardian evidence (R2-21) ───────────────────────────
create or replace function public.customers_require_guardian_for_minors()
returns trigger
language plpgsql
as $$
begin
  if new.date_of_birth is not null
     and age(new.date_of_birth) < interval '18 years' then
    if nullif(btrim(coalesce(new.guardian_name, '')), '') is null
       or nullif(btrim(coalesce(new.guardian_relationship, '')), '') is null then
      raise exception 'Paciente menor de edad: se requiere nombre y parentesco del padre, madre o tutor';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_minor_guardian on customers;
create trigger customers_minor_guardian
  before insert or update of date_of_birth, guardian_name, guardian_relationship on customers
  for each row execute function public.customers_require_guardian_for_minors();

-- ── 4. First nota de evolución requires historia clínica (R2-19) ───────────
-- Only fires for patients with NO prior consulta_notes (existing patients are
-- grandfathered — their next note is not blocked). Walk-ins (customer_id
-- null) and service-role writes are exempt.
create or replace function public.consulta_notes_require_historia()
returns trigger
language plpgsql
as $$
begin
  if new.customer_id is not null
     and coalesce(current_setting('request.jwt.claims', true), '') not like '%service_role%'
     and not exists (select 1 from historia_clinica h where h.customer_id = new.customer_id)
     and not exists (select 1 from consulta_notes cn where cn.customer_id = new.customer_id) then
    raise exception 'Se requiere la historia clínica de primera vez (NOM-004 6.1) antes de la primera nota de evolución';
  end if;
  return new;
end;
$$;

drop trigger if exists consulta_notes_historia_gate on consulta_notes;
create trigger consulta_notes_historia_gate
  before insert on consulta_notes
  for each row execute function public.consulta_notes_require_historia();
