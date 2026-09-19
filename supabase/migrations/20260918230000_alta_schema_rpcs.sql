-- Alta hardening — step 1 (ADDITIVE ONLY, zero breaking changes).
-- Round-2 audit altas: R2-12, R2-13, R2-14 (primitives), R2-16 (primitives),
-- R2-19 (table), R2-21 (columns), R2-22 (table/RPC/columns).
-- Policy swaps, enforcement triggers and grant revokes live in
-- 20260918234500_alta_policy_lockdown.sql, applied AFTER the frontend that
-- consumes these RPCs is deployed.

-- ── 1. Clinical-role predicate (admin/doctor) ─────────────────────────────
create or replace function public.is_clinical_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','doctor')
  )
$$;
grant execute on function public.is_clinical_staff() to anon, authenticated, service_role;

-- ── 2. customers: guardian evidence + marketing opt-out (R2-21, R2-22) ────
alter table customers add column if not exists guardian_name text;
alter table customers add column if not exists guardian_relationship text;
alter table customers add column if not exists guardian_id_ref text;
alter table customers add column if not exists marketing_opt_out boolean not null default false;

alter table membership_members add column if not exists date_of_birth date;

alter table consent_documents add column if not exists revoked_at timestamptz;

-- ── 3. prescriptions: receta retenida + forward-only folio uniqueness (R2-12)
alter table prescriptions add column if not exists receta_retenida boolean not null default false;

create or replace function public.prescriptions_enforce_unique_folio()
returns trigger
language plpgsql
as $$
declare
  v_folio text;
begin
  v_folio := upper(btrim(coalesce(new.prescription_number, '')));
  -- Legacy placeholders are exempt (they carry no evidentiary folio).
  if v_folio in ('', 'SN', 'S/N', 'SIN', 'SIN NUMERO', 'SIN NÚMERO', 'N/A', 'NA')
     or v_folio like 'MANUAL-%' then
    return new;
  end if;
  if exists (
    select 1 from prescriptions p
    where p.org_id = new.org_id
      and upper(btrim(p.prescription_number)) = v_folio
      and coalesce(p.is_voided, false) = false
  ) then
    raise exception 'Folio de receta ya registrado: %', v_folio using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists prescriptions_unique_folio on prescriptions;
create trigger prescriptions_unique_folio
  before insert on prescriptions
  for each row execute function public.prescriptions_enforce_unique_folio();

-- ── 4. Antibiotic classification pass (R2-13) ─────────────────────────────
-- Systemic antibiotics/antifungals that were missing requires_prescription.
-- Topical-only combos (creams/óvulos: BARMICIL, clotrimazol combos, ketoconazol
-- crema, terbinafina crema, nistatina óvulos) intentionally excluded.
update inventory set requires_prescription = true where id in (
  'a9e3b6c8-96b8-4961-9216-bc1c28fecb87', -- AMOXICILINA, A. CLAVULANICO 875/125 10TAB
  '912744ee-d8a3-45c5-b0f4-23652c8b2a4e', -- BENCILPENICILINA 400 000 UI INY
  '6ed31136-7b28-45ef-a5ba-a2c8f44dc215', -- BENCILPENICILINA 800 000 UI INY
  'a168b51d-4b7a-49f4-b3d0-7b80d0592589', -- BENZATINA BENCILPENICILINA 1 200 000 UI
  '9f4eeba0-76c4-4bc2-a40d-95de9fc5692e', -- CEFALEXINA 250MG/5ML SUSP
  '850a454a-5533-4b1c-b364-b29e9989a84f', -- CEFALEXINA 500MG TAB
  'b5779361-501b-4c24-8a14-a590dd84f264', -- CEFALEXINA, AMBROXOL 500/30 TAB
  '61dc3bdf-f4ec-4e34-9769-96fc3a1bb113', -- CEFALEXINA, BROMHEXINA 500/8.782
  'ccea27f7-c239-4577-a45b-46df92c595d7', -- CEFIXIMA 100MG/5ML SUSP
  'd3c7a657-f228-4fb8-ab01-09795e921524', -- CEFTRIAXONA 1G INY
  '9b800af6-1f1c-40a9-a9a3-a302125aaccf', -- CEFUROXIMA 250MG TAB
  '87e10b7f-c51a-4482-88e9-15d3d5e0e276', -- CEFUROXIMA 250MG/5ML SUSP
  '2b447720-f676-4402-a46d-f297a1b25b5d', -- CEFUROXIMA 750MG INY
  'a8319762-7184-4ec8-99ed-9ba77975a0fa', -- CLINDAMICINA
  '69485f0b-7339-46df-a030-339781f1f204', -- CLINDAMICINA 300MG/2ML AMP
  '881180a4-fb4a-467c-a32e-d9764cffaefb', -- ERITROMICINA 500MG TAB
  '0c7ee2c9-5872-4d77-8f69-2f8c93c886c7', -- ERITROMICINA 250MG/5ML SUSP
  '79e15b9e-004c-47ac-be16-b518e4a49857', -- FLUCONAZOL 100mg 10CAP
  'ac49677f-4ee0-474b-ad27-d9195561f6d0', -- FLUCONAZOL 100mg 10CAP
  'eaee3399-f455-4396-9565-4851a79e16ee', -- FLUCONAZOL 150mg 1CAP
  '658a7cf6-5868-44de-82bf-48cbc142497c', -- FLUCONAZOL 150mg 1CAP
  'e4c78280-4f28-4168-a8a6-9bdf857c27d0', -- FLUCONAZOL/TINIDAZOL 37.5/500 4TAB
  'aeb44a00-a2fd-440d-a033-6040e9672d58', -- GENTAMICINA 80MG/2ML INY
  'dff2f5f4-2ac4-47d7-90ea-e70227562768', -- ITRACONAZOL 100MG CAP
  'c5c385d0-29a8-40ef-800e-0fd40fb50d31', -- KETOCONAZOL 200MG TAB
  'be1e858f-dbff-4068-bdf8-90eaefa8d47d', -- LEVOFLOXACINO 500MG TAB
  '839cca4a-cbf9-4635-99b9-8a285568b583', -- METRONIDAZOL 500mg 30TAB
  'e4cd6479-0234-4a79-9811-2c6e707b6b41', -- METRONIDAZOL SUSP 5g 120mL
  'bb696d19-d540-41a9-9ddb-7b3d8bc58ddd', -- NITROFURANTOINA 100MG CAP
  'cbef3eab-7952-4427-9e97-009d6398e1ce', -- SULFAMETOXAZOL/TRIMETOPRIMA 400/80 TAB
  '5da6d08b-3518-4d3c-94c4-b40ca9c963b8', -- SULFAMETOXAZOL/TRIMETOPRIMA 800/160 TAB
  '301b194e-202b-4c6d-9074-3a412c8356d2'  -- TERBINAFINA 250MG 28TAB
);

-- ── 5. POS self-service RPCs (R2-14 primitives) ───────────────────────────
-- Narrow security-definer surfaces so pos/inventory roles never need direct
-- SELECT on customers (which carries medical_history).

create or replace function public.pos_search_customers(p_query text)
returns table (id uuid, full_name text, phone text, email text, curp text, date_of_birth date)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_q text := '%' || btrim(coalesce(p_query, '')) || '%';
begin
  if not is_org_staff() then
    raise exception 'Solo personal de la organización';
  end if;
  return query
    select c.id, c.full_name, c.phone, c.email, c.curp, c.date_of_birth
    from customers c
    where c.org_id = get_my_org_id()
      and (c.full_name ilike v_q or c.phone ilike v_q or c.curp ilike v_q or c.email ilike v_q)
    order by c.full_name
    limit 20;
end;
$$;
grant execute on function public.pos_search_customers(text) to authenticated;

create or replace function public.pos_create_customer(
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_curp text default null,
  p_date_of_birth date default null,
  p_guardian_name text default null,
  p_guardian_relationship text default null
)
returns table (id uuid, full_name text, phone text, email text, curp text, date_of_birth date)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if not is_org_staff() then
    raise exception 'Solo personal de la organización';
  end if;
  if nullif(btrim(coalesce(p_full_name, '')), '') is null then
    raise exception 'Nombre requerido';
  end if;
  insert into customers (
    org_id, full_name, phone, email, curp, date_of_birth,
    guardian_name, guardian_relationship
  ) values (
    get_my_org_id(), btrim(p_full_name), nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(lower(btrim(coalesce(p_email, ''))), ''), nullif(btrim(coalesce(p_curp, '')), ''),
    p_date_of_birth, nullif(btrim(coalesce(p_guardian_name, '')), ''),
    nullif(btrim(coalesce(p_guardian_relationship, '')), '')
  )
  returning customers.id into v_id;
  return query
    select c.id, c.full_name, c.phone, c.email, c.curp, c.date_of_birth
    from customers c where c.id = v_id;
end;
$$;
grant execute on function public.pos_create_customer(text, text, text, text, date, text, text) to authenticated;

create or replace function public.pos_search_prescriptions(p_query text)
returns table (
  id uuid,
  prescription_number text,
  patient_name text,
  patient_curp text,
  doctor_name text,
  doctor_license_number text,
  prescription_date date,
  medications jsonb,
  status text,
  is_voided boolean,
  sale_id uuid,
  customer_id uuid,
  customer_full_name text,
  customer_phone text,
  customer_height numeric,
  customer_weight numeric,
  doctor_full_name text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_q text := '%' || btrim(coalesce(p_query, '')) || '%';
begin
  if not is_org_staff() then
    raise exception 'Solo personal de la organización';
  end if;
  return query
    with direct_hits as (
      select p.id
      from prescriptions p
      where p.org_id = get_my_org_id()
        and (p.prescription_number ilike v_q or p.patient_name ilike v_q)
      limit 20
    ),
    customer_hits as (
      select p.id
      from prescriptions p
      join customers c on c.id = p.customer_id
      where p.org_id = get_my_org_id()
        and c.full_name ilike v_q
      limit 20
    ),
    hits as (select id from direct_hits union select id from customer_hits)
    select
      p.id, p.prescription_number, p.patient_name, p.patient_curp,
      p.doctor_name, p.doctor_license_number, p.prescription_date,
      p.medications, p.status, p.is_voided, p.sale_id, p.customer_id,
      c.full_name as customer_full_name, c.phone as customer_phone,
      c.height as customer_height, c.weight as customer_weight,
      pr.full_name as doctor_full_name
    from prescriptions p
    join hits h on h.id = p.id
    left join customers c on c.id = p.customer_id
    left join profiles pr on pr.id = p.doctor_id
    order by p.created_at desc
    limit 20;
end;
$$;
grant execute on function public.pos_search_prescriptions(text) to authenticated;

create or replace function public.pos_search_memberships(p_term text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_term text := lower(btrim(coalesce(p_term, '')));
begin
  if not is_org_staff() then
    raise exception 'Solo personal de la organización';
  end if;
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    from (
      select
        m.id, m.plan_id, m.plan_type, m.status, m.discount_percent,
        m.visits_remaining, m.visits_limit,
        m.basic_trackers_included, m.basic_trackers_fulfilled,
        m.customer_id, m.created_at,
        jsonb_build_object('full_name', c.full_name, 'phone', c.phone, 'email', c.email) as customers,
        (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', mm.id, 'sub_id', mm.sub_id, 'name', mm.name, 'is_owner', mm.is_owner
          )), '[]'::jsonb)
          from membership_members mm
          where mm.membership_id = m.id
        ) as membership_members
      from memberships m
      join customers c on c.id = m.customer_id
      where m.org_id = get_my_org_id()
        and (
          v_term = ''
          or lower(m.plan_id) like '%' || v_term || '%'
          or lower(m.status) like '%' || v_term || '%'
          or lower(c.full_name) like '%' || v_term || '%'
          or lower(coalesce(c.phone, '')) like '%' || v_term || '%'
          or lower(coalesce(c.email, '')) like '%' || v_term || '%'
          or exists (
            select 1 from membership_members mm
            where mm.membership_id = m.id
              and (lower(mm.sub_id) like '%' || v_term || '%' or lower(mm.name) like '%' || v_term || '%')
          )
        )
      order by m.created_at desc
      limit 50
    ) t
  );
end;
$$;
grant execute on function public.pos_search_memberships(text) to authenticated;

create or replace function public.pos_get_membership(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_org_staff() then
    raise exception 'Solo personal de la organización';
  end if;
  return (
    select row_to_json(t)
    from (
      select
        m.id, m.plan_id, m.plan_type, m.status, m.discount_percent,
        m.visits_remaining, m.visits_limit,
        m.basic_trackers_included, m.basic_trackers_fulfilled,
        m.customer_id, m.created_at,
        jsonb_build_object('full_name', c.full_name, 'phone', c.phone, 'email', c.email) as customers,
        (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', mm.id, 'sub_id', mm.sub_id, 'name', mm.name, 'is_owner', mm.is_owner
          )), '[]'::jsonb)
          from membership_members mm
          where mm.membership_id = m.id
        ) as membership_members
      from memberships m
      join customers c on c.id = m.customer_id
      where m.id = p_id
        and m.org_id = get_my_org_id()
    ) t
  );
end;
$$;
grant execute on function public.pos_get_membership(uuid) to authenticated;

create or replace function public.pos_get_sale_for_return(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_org_staff() then
    raise exception 'Solo personal de la organización';
  end if;
  return (
    select row_to_json(t)
    from (
      select
        s.*,
        (select coalesce(jsonb_agg(row_to_json(si)), '[]'::jsonb) from sale_items si where si.sale_id = s.id) as sale_items,
        (select coalesce(jsonb_agg(row_to_json(sp)), '[]'::jsonb) from sale_payments sp where sp.sale_id = s.id) as sale_payments,
        case when c.id is not null then
          jsonb_build_object('id', c.id, 'full_name', c.full_name, 'phone', c.phone, 'email', c.email)
        else null end as customers
      from sales s
      left join customers c on c.id = s.customer_id
      where s.id = p_sale_id
        and s.org_id = get_my_org_id()
    ) t
  );
end;
$$;
grant execute on function public.pos_get_sale_for_return(uuid) to authenticated;

-- ── 6. ARCO requests register (R2-22) ─────────────────────────────────────
create table if not exists arco_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  customer_id uuid references customers(id),
  profile_id uuid,
  tipo text not null check (tipo in ('acceso','rectificacion','cancelacion','oposicion','revocacion')),
  details text,
  status text not null default 'pendiente' check (status in ('pendiente','en_proceso','resuelta')),
  response text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

alter table arco_requests enable row level security;

drop policy if exists arco_requests_customer_insert on arco_requests;
create policy arco_requests_customer_insert on arco_requests
  for insert with check (profile_id = auth.uid());

drop policy if exists arco_requests_customer_select on arco_requests;
create policy arco_requests_customer_select on arco_requests
  for select using (profile_id = auth.uid());

drop policy if exists arco_requests_admin_all on arco_requests;
create policy arco_requests_admin_all on arco_requests
  for all using (org_id = get_my_org_id() and is_admin())
  with check (org_id = get_my_org_id());

-- ── 7. Consent revocation RPC (R2-22) ─────────────────────────────────────
-- Customers revoke their own signed consent documents. Evidence is kept:
-- the row flips to status='revoked' with revoked_at stamped server-side.
create or replace function public.revoke_consent(p_type text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  update consent_documents d
  set status = 'revoked', revoked_at = now()
  where d.customer_id in (select c.id from customers c where c.profile_id = auth.uid())
    and d.status = 'signed'
    and (p_type is null or p_type = 'all' or d.type = p_type);
  get diagnostics v_count = row_count;

  insert into audit_log (org_id, user_id, action, details)
  select get_my_org_id(), auth.uid(), 'CONSENT_REVOKED',
    'Consentimiento revocado por el titular: ' || coalesce(p_type, 'all') || ' (' || v_count || ' documentos)'
  where v_count > 0;

  return v_count;
end;
$$;
grant execute on function public.revoke_consent(text) to authenticated;

-- ── 8. Historia clínica de primera vez (R2-19, NOM-004 6.1) ───────────────
create table if not exists historia_clinica (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  customer_id uuid not null references customers(id),
  doctor_id uuid,
  padecimiento_actual text,
  interrogatorio_aparatos text,
  exploracion_fisica text,
  antecedentes_resumen text,
  diagnostico text,
  created_by uuid,
  created_at timestamptz default now(),
  unique (customer_id)
);

alter table historia_clinica enable row level security;

drop policy if exists historia_clinica_staff on historia_clinica;
create policy historia_clinica_staff on historia_clinica
  for all using (org_id = get_my_org_id() and is_clinical_staff())
  with check (org_id = get_my_org_id());

drop policy if exists historia_clinica_customer on historia_clinica;
create policy historia_clinica_customer on historia_clinica
  for select using (customer_id in (select c.id from customers c where c.profile_id = auth.uid()));

create or replace function public.historia_clinica_no_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La historia clínica es de solo anexado: registre una nota de evolución para correcciones';
end;
$$;

drop trigger if exists historia_clinica_append_only on historia_clinica;
create trigger historia_clinica_append_only
  before update or delete on historia_clinica
  for each row execute function public.historia_clinica_no_update();

-- ── 9. public_signup_membership: capture DOB + guardian evidence (R2-21) ──
create or replace function public.public_signup_membership(
  p_org_id uuid,
  p_customer jsonb,
  p_membership jsonb,
  p_member_names text[] default array[]::text[],
  p_terms_accepted_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer_id uuid;
  v_membership memberships%rowtype;
  v_start date;
  v_next date;
  v_day int;
  i int;
  v_status text;
begin
  insert into customers (org_id, full_name, email, phone, date_of_birth, guardian_name, guardian_relationship, guardian_id_ref)
  values (
    p_org_id,
    p_customer->>'full_name',
    p_customer->>'email',
    p_customer->>'phone',
    nullif(btrim(coalesce(p_customer->>'date_of_birth', '')), '')::date,
    nullif(btrim(coalesce(p_customer->>'guardian_name', '')), ''),
    nullif(btrim(coalesce(p_customer->>'guardian_relationship', '')), ''),
    nullif(btrim(coalesce(p_customer->>'guardian_id_ref', '')), '')
  )
  returning id into v_customer_id;

  v_start := current_date;
  v_day := extract(day from v_start)::int;
  v_next := v_start + interval '1 month';
  if extract(day from v_next) < v_day then
    v_next := date_trunc('month', v_next) + interval '1 month' - interval '1 day';
  end if;

  -- For PayPal the membership starts pending; the Edge Function activates it after payment confirmation.
  v_status := coalesce(p_membership->>'status', 'active');

  insert into memberships (
    org_id, customer_id, plan_type, status, discount_percent,
    visits_remaining, visits_limit, premium_trackers, basic_trackers_included,
    basic_trackers_fulfilled, monthly_amount,
    payment_method, next_renewal_date, renewal_day,
    card_token, card_last4, payment_processor,
    processor_customer_id, processor_subscription_id,
    terms_accepted_at
  ) values (
    p_org_id, v_customer_id,
    p_membership->>'plan_type', v_status, (p_membership->>'discount_percent')::numeric,
    (p_membership->>'visits_limit')::int, (p_membership->>'visits_limit')::int,
    (p_membership->>'premium_trackers')::int,
    (p_membership->>'basic_trackers_included')::int,
    (p_membership->>'basic_trackers_fulfilled')::int,
    (p_membership->>'monthly_amount')::numeric,
    p_membership->>'payment_method', v_next, v_day,
    p_membership->>'card_token', p_membership->>'card_last4',
    p_membership->>'payment_processor',
    p_membership->>'processor_customer_id', p_membership->>'processor_subscription_id',
    coalesce(p_terms_accepted_at, (p_membership->>'terms_accepted_at')::timestamptz)
  )
  returning * into v_membership;

  insert into membership_members (membership_id, sub_id, name, is_owner, date_of_birth)
  values (
    v_membership.id, v_membership.plan_id || '-1', p_customer->>'full_name', true,
    nullif(btrim(coalesce(p_customer->>'date_of_birth', '')), '')::date
  );

  -- array_length of an EMPTY array is NULL, not 0: guard the loop or the
  -- whole signup dies with "upper bound of FOR loop cannot be null".
  if coalesce(array_length(p_member_names, 1), 0) > 0 then
    for i in 1..array_length(p_member_names, 1) loop
      insert into membership_members (membership_id, sub_id, name, is_owner)
      values (v_membership.id, v_membership.plan_id || '-' || (i+1), p_member_names[i], false);
    end loop;
  end if;

  -- Signup = payment #1: counts the payment, books the sale, fires
  -- welcome + receipt notifications. SKIPPED for pending memberships
  -- (PayPal approved but not yet charged): the paypal-webhook records
  -- payment #1 when the first charge confirms. Guarded so a bookkeeping
  -- failure cannot roll back the signup itself.
  if v_status <> 'pending' then
    begin
      perform record_membership_payment(
        v_membership.id,
        (p_membership->>'monthly_amount')::numeric,
        coalesce(p_membership->>'payment_method', 'paypal'),
        null,
        true
      );
    exception when others then
      raise warning 'public_signup_membership: signup payment recording failed for membership %: %', v_membership.id, sqlerrm;
    end;
  end if;

  -- Re-read so the returned row reflects payments_made etc.
  select * into v_membership from memberships where id = v_membership.id;

  return jsonb_build_object(
    'membership', to_jsonb(v_membership),
    'customer', to_jsonb((select row_to_json(c) from customers c where c.id = v_customer_id)),
    'members', (select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) from membership_members m where m.membership_id = v_membership.id)
  );
end;
$$;
