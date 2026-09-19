-- ============================================================
-- CRITICAL RLS / AUTH HARDENING — Round-2 mock government audit
-- Date: 2026-09-18
-- Closes audit criticals R2-1 .. R2-8 and R2-24 (docs/GOVERNMENT_MOCK_AUDIT.md):
--   R2-1  handle_new_user trusted client role/org metadata
--   R2-2  plaintext profiles.pin readable org-wide
--   R2-3  org_isolation (no role check) on operational tables
--   R2-4  audit_log readable/editable/deletable by any org account
--   R2-5  prescriptions forgeable via org-wide INSERT/UPDATE
--   R2-6  customer-documents storage open to any authenticated user
--   R2-7  e.firma keys exposed org-wide (columns moved to doctor_efirma)
--   R2-8  public_signup_membership executable by anon
--   R2-24 rx_number_counters: RLS disabled, anon ALL
-- Applied to production via the Supabase management API on 2026-09-18.
-- ============================================================

-- ----------------------------------------------------------
-- R2-24a. generate_rx_number must be SECURITY DEFINER before
-- counters are locked behind RLS (trigger runs as table owner).
-- ----------------------------------------------------------
create or replace function public.generate_rx_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date text;
  v_seq integer;
  v_number text;
begin
  if NEW.prescription_number is not null and NEW.prescription_number <> '' then
    return NEW;
  end if;

  v_date := to_char(CURRENT_DATE, 'YYYYMMDD');

  insert into rx_number_counters (date_prefix, last_number)
  values (v_date, 1)
  on conflict (date_prefix)
  do update set last_number = rx_number_counters.last_number + 1
  returning rx_number_counters.last_number into v_seq;

  v_number := 'RX-' || v_date || '-' || lpad(v_seq::text, 5, '0');
  NEW.prescription_number := v_number;

  return NEW;
end;
$$;

alter table public.rx_number_counters enable row level security;
revoke all on public.rx_number_counters from anon, authenticated;

-- ----------------------------------------------------------
-- R2-1. Signup trigger: NEVER trust client-supplied role/org.
-- Every self-registered user becomes a customer; staff roles are
-- assigned afterwards by an admin via admin_manage_profiles.
-- ----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_org_id    uuid;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Usuario');

  select id into v_org_id from organizations order by created_at limit 1;

  insert into public.profiles (id, full_name, role, email, org_id, created_at)
  values (new.id, v_full_name, 'customer', new.email, v_org_id, now());

  insert into public.customers (profile_id, org_id, full_name, email, phone, curp, address, date_of_birth, notes)
  values (new.id, v_org_id, v_full_name, new.email, null, null, null, null, null)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

-- Non-admins can no longer promote themselves or move orgs even
-- though profiles_own_update allows editing their own row.
create or replace function public.profiles_protect_privileged()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.org_id is distinct from old.org_id
     or new.location_id is distinct from old.location_id
     or new.email is distinct from old.email
     or new.pin is distinct from old.pin
     or new.pin_hash is distinct from old.pin_hash then
    raise exception 'Campos protegidos: solo un administrador puede modificarlos';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged on public.profiles;
create trigger profiles_protect_privileged
  before update on public.profiles
  for each row execute function public.profiles_protect_privileged();

-- ----------------------------------------------------------
-- R2-2. PIN hashing (pgcrypto bcrypt) + server-side verification.
-- ----------------------------------------------------------
alter table public.profiles add column if not exists pin_hash text;

update public.profiles
set pin_hash = extensions.crypt(pin, extensions.gen_salt('bf'))
where pin is not null and pin <> '' and pin_hash is null;

update public.profiles set pin = null where pin is not null;

create or replace function public.verify_admin_pin(p_pin text)
returns table(id uuid, full_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid := public.get_my_org_id();
  v_hit record;
begin
  if p_pin is null or p_pin = '' then
    return;
  end if;

  select p.id, p.full_name into v_hit
  from profiles p
  where p.org_id = v_org
    and p.role = 'admin'
    and p.pin_hash is not null
    and p.pin_hash = crypt(p_pin, p.pin_hash)
  limit 1;

  begin
    insert into audit_log (org_id, user_id, action, details, timestamp)
    values (
      v_org,
      auth.uid(),
      case when v_hit.id is null then 'admin_pin_failed' else 'admin_pin_verified' end,
      case when v_hit.id is null then 'PIN de administrador incorrecto'
           else 'PIN de administrador verificado: ' || coalesce(v_hit.full_name, '') end,
      now()
    );
  exception when others then
    null; -- logging must never break the verification
  end;

  if v_hit.id is null then
    return;
  end if;
  id := v_hit.id;
  full_name := v_hit.full_name;
  return next;
end;
$$;

revoke all on function public.verify_admin_pin(text) from public, anon;
grant execute on function public.verify_admin_pin(text) to authenticated;

create or replace function public.admin_set_profile_pin(p_user_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede asignar PINs';
  end if;
  update profiles
  set pin_hash = case when p_pin is null or p_pin = '' then null
                      else crypt(p_pin, gen_salt('bf')) end,
      pin = null
  where id = p_user_id
    and org_id = public.get_my_org_id();
end;
$$;

revoke all on function public.admin_set_profile_pin(uuid, text) from public, anon;
grant execute on function public.admin_set_profile_pin(uuid, text) to authenticated;

-- ----------------------------------------------------------
-- R2-2b. profiles_read: customers see only themselves.
-- ----------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (
    (id = auth.uid())
    or (org_id = get_my_org_id() and is_org_staff())
  );

-- ----------------------------------------------------------
-- R2-3. Operational tables: org-wide ALL -> staff-only ALL.
-- ----------------------------------------------------------
drop policy if exists org_isolation on public.inventory;
create policy inventory_staff on public.inventory
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

-- Public catalog view (customer app store + consult price): exposes
-- only sellable-display columns, never cost/supplier/stock internals.
create or replace view public.inventory_catalog as
select id, org_id, name, "use", price, quantity, requires_prescription,
       category, image_url, barcode, low_stock_threshold
from public.inventory;

grant select on public.inventory_catalog to anon, authenticated;

drop policy if exists org_isolation on public.locations;
create policy locations_staff on public.locations
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists org_isolation on public.discounts;
create policy discounts_staff on public.discounts
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists org_isolation on public.tax_settings;
create policy tax_settings_staff on public.tax_settings
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists org_isolation on public.partners;
create policy partners_staff on public.partners
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists lost_sales_org_isolation on public.lost_sales;
create policy lost_sales_staff on public.lost_sales
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists org_isolation on public.suppliers;
create policy suppliers_staff on public.suppliers
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists org_isolation on public.purchase_orders;
create policy purchase_orders_staff on public.purchase_orders
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists po_items_policy on public.purchase_order_items;
create policy po_items_staff on public.purchase_order_items
  for all using (is_org_staff() and po_id in (select id from purchase_orders where org_id = get_my_org_id()))
  with check (is_org_staff() and po_id in (select id from purchase_orders where org_id = get_my_org_id()));

drop policy if exists org_isolation on public.returns;
create policy returns_staff on public.returns
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists return_items_policy on public.return_items;
create policy return_items_staff on public.return_items
  for all using (is_org_staff() and return_id in (select id from returns where org_id = get_my_org_id()))
  with check (is_org_staff() and return_id in (select id from returns where org_id = get_my_org_id()));

drop policy if exists org_stock_adjustments on public.stock_adjustments;
create policy stock_adjustments_staff on public.stock_adjustments
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists product_links_org_isolation on public.product_links;
create policy product_links_staff on public.product_links
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists inventory_batches_org_isolation on public.inventory_batches;
create policy inventory_batches_staff on public.inventory_batches
  for all using (is_org_staff() and org_id in (select org_id from profiles where id = auth.uid()))
  with check (is_org_staff() and org_id in (select org_id from profiles where id = auth.uid()));

drop policy if exists inventory_movements_org_isolation on public.inventory_movements;
create policy inventory_movements_staff on public.inventory_movements
  for all using (is_org_staff() and org_id in (select org_id from profiles where id = auth.uid()))
  with check (is_org_staff() and org_id in (select org_id from profiles where id = auth.uid()));

drop policy if exists inventory_settings_org_isolation on public.inventory_settings;
create policy inventory_settings_staff on public.inventory_settings
  for all using (is_org_staff() and org_id in (select org_id from profiles where id = auth.uid()))
  with check (is_org_staff() and org_id in (select org_id from profiles where id = auth.uid()));

drop policy if exists org_bank_accounts on public.bank_accounts;
create policy bank_accounts_staff on public.bank_accounts
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists shifts_insert on public.shifts;
drop policy if exists shifts_select on public.shifts;
drop policy if exists shifts_update on public.shifts;
create policy shifts_staff on public.shifts
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

-- sale_payments: was org-wide ALL via sales join
drop policy if exists org_sale_payments on public.sale_payments;
create policy sale_payments_staff on public.sale_payments
  for all using (is_org_staff() and sale_id in (select id from sales where org_id = get_my_org_id()))
  with check (is_org_staff() and sale_id in (select id from sales where org_id = get_my_org_id()));

-- sales: drop the three org-wide (role-less) policies. Staff use the
-- existing sales_staff (ALL). Customers keep own-read/own-update and
-- get a scoped own-insert for the customer-app preorder flow.
drop policy if exists sales_insert on public.sales;
drop policy if exists sales_select on public.sales;
drop policy if exists sales_update on public.sales;
create policy sales_customer_insert on public.sales
  for insert with check (
    org_id = get_my_org_id()
    and customer_id in (select id from customers where profile_id = auth.uid())
  );

create or replace function public.sales_customer_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or public.is_org_staff() then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    if new.status is distinct from 'processing' or coalesce(new.voided, false) then
      raise exception 'Los clientes solo pueden crear pedidos en proceso';
    end if;
    return new;
  end if;
  -- UPDATE (customers): only the void fields may change
  if to_jsonb(new) - array['voided','voided_by','voided_at']
     is distinct from to_jsonb(old) - array['voided','voided_by','voided_at'] then
    raise exception 'Solo se permite anular el pedido';
  end if;
  if new.voided is distinct from old.voided and not new.voided then
    raise exception 'No puedes des-anular una venta';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_customer_guard on public.sales;
create trigger sales_customer_guard
  before insert or update on public.sales
  for each row execute function public.sales_customer_guard();

-- sale_items: was org-wide ALL via sales join
drop policy if exists sale_items_policy on public.sale_items;
create policy sale_items_staff on public.sale_items
  for all using (is_org_staff() and sale_id in (select id from sales where org_id = get_my_org_id()))
  with check (is_org_staff() and sale_id in (select id from sales where org_id = get_my_org_id()));
create policy sale_items_customer_select on public.sale_items
  for select using (sale_id in (
    select s.id from sales s
    join customers c on c.id = s.customer_id
    where c.profile_id = auth.uid()
  ));
create policy sale_items_customer_insert on public.sale_items
  for insert with check (sale_id in (
    select s.id from sales s
    join customers c on c.id = s.customer_id
    where c.profile_id = auth.uid()
  ));

-- memberships / membership_members: writes staff-only, customers keep self-select
drop policy if exists org_isolation on public.memberships;
create policy memberships_staff on public.memberships
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());

drop policy if exists membership_members_org_isolation on public.membership_members;
create policy membership_members_staff on public.membership_members
  for all using (is_org_staff() and membership_id in (select id from memberships where org_id = get_my_org_id()))
  with check (is_org_staff() and membership_id in (select id from memberships where org_id = get_my_org_id()));

-- ----------------------------------------------------------
-- R2-4. audit_log: admin read, staff append, nothing else.
-- ----------------------------------------------------------
drop policy if exists org_isolation on public.audit_log;
create policy audit_log_admin_read on public.audit_log
  for select using (is_admin() and org_id = get_my_org_id());
create policy audit_log_staff_insert on public.audit_log
  for insert with check (is_org_staff() and org_id = get_my_org_id());

create or replace function public.audit_log_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log es append-only (solo inserción)';
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();

-- ----------------------------------------------------------
-- R2-5. prescriptions: scoped insert, staff update, content freeze.
-- ----------------------------------------------------------
drop policy if exists org_prescriptions_insert on public.prescriptions;
drop policy if exists org_prescriptions_void on public.prescriptions;
drop policy if exists doctor_prescriptions_insert on public.prescriptions;
drop policy if exists doctor_prescriptions_update_own on public.prescriptions;

-- POS/registry rows (no doctor session): staff may insert with doctor_id NULL
create policy prescriptions_staff_insert on public.prescriptions
  for insert with check (
    org_id = get_my_org_id()
    and is_org_staff()
    and doctor_id is null
  );

-- Doctor portal e-recetas: caller must BE a doctor signing their own row
create policy prescriptions_doctor_insert on public.prescriptions
  for insert with check (
    org_id = get_my_org_id()
    and doctor_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and role = 'doctor')
  );

create policy prescriptions_staff_update on public.prescriptions
  for update using (org_id = get_my_org_id() and is_org_staff());

create or replace function public.prescriptions_freeze_content()
returns trigger
language plpgsql
as $$
declare
  v_mutable text[] := array['status','is_voided','voided_at','voided_by','voided_reason','fulfilled_at','sale_id'];
  v_signing text[] := array['signature','signed_payload','signer_cert_serial','signed_at'];
begin
  if auth.uid() is null then
    return new; -- service role (edge functions)
  end if;
  -- The owning doctor may set the signature block exactly once
  -- (unsigned -> signed); content columns never change.
  if old.signed_at is null
     and old.doctor_id = auth.uid()
     and exists (select 1 from profiles where id = auth.uid() and role = 'doctor') then
    v_mutable := v_mutable || v_signing;
  end if;
  if to_jsonb(new) - v_mutable is distinct from to_jsonb(old) - v_mutable then
    raise exception 'Las recetas no se pueden modificar: solo firmar (doctor) o anular/actualizar estado';
  end if;
  return new;
end;
$$;

drop trigger if exists prescriptions_freeze on public.prescriptions;
create trigger prescriptions_freeze
  before update on public.prescriptions
  for each row execute function public.prescriptions_freeze_content();

-- ----------------------------------------------------------
-- R2-6. storage customer-documents: path-scoped owner + staff.
-- Object paths: recetas/{org_id}/{customer_id}/{filename}
-- ----------------------------------------------------------
drop policy if exists "Allow authenticated reads" on storage.objects;
drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "customer_docs_delete_own" on storage.objects;
drop policy if exists "customer_docs_insert_own" on storage.objects;
drop policy if exists "customer_docs_select" on storage.objects;
drop policy if exists "customer_documents_select" on storage.objects;
drop policy if exists "customer_documents_upload" on storage.objects;

create policy "customer_docs_staff" on storage.objects
  for all using (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[2] = get_my_org_id()::text
    and is_org_staff()
  ) with check (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[2] = get_my_org_id()::text
  );

create policy "customer_docs_owner_read" on storage.objects
  for select using (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[3] in (
      select id::text from customers where profile_id = auth.uid()
    )
  );

create policy "customer_docs_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[1] = 'recetas'
    and (storage.foldername(name))[2] = get_my_org_id()::text
    and (storage.foldername(name))[3] in (
      select id::text from customers where profile_id = auth.uid()
    )
  );

create policy "customer_docs_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[3] in (
      select id::text from customers where profile_id = auth.uid()
    )
  );

-- ----------------------------------------------------------
-- R2-7. e.firma key material moves to doctor_efirma (owner-only).
-- ----------------------------------------------------------
create table if not exists public.doctor_efirma (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  cer_base64 text not null,
  key_base64 text not null,
  cert_serial text,
  updated_at timestamptz not null default now()
);

alter table public.doctor_efirma enable row level security;
revoke all on public.doctor_efirma from anon;
grant select, insert, update, delete on public.doctor_efirma to authenticated;

create policy doctor_efirma_self on public.doctor_efirma
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

insert into public.doctor_efirma (profile_id, cer_base64, key_base64, cert_serial)
select profile_id, efirma_cer_base64, efirma_key_base64, efirma_cert_serial
from public.doctor_profiles
where efirma_cer_base64 is not null and efirma_key_base64 is not null
on conflict (profile_id) do nothing;

alter table public.doctor_profiles
  drop column if exists efirma_cer_base64,
  drop column if exists efirma_key_base64,
  drop column if exists efirma_cert_serial;

-- ----------------------------------------------------------
-- R2-8. public_signup_membership: service_role only (the legit
-- flow calls it from the paypal-subscription edge function).
-- ----------------------------------------------------------
revoke execute on function public.public_signup_membership(uuid, jsonb, jsonb, text[], timestamptz) from anon, authenticated;

-- ----------------------------------------------------------
-- R2-10. Returns: disposition (restock vs merma) + authorization.
-- ----------------------------------------------------------
alter table public.return_items add column if not exists disposition text;
alter table public.returns add column if not exists reason text;
alter table public.returns add column if not exists authorized_by text;

-- ----------------------------------------------------------
-- R2-11. Controlled-substances register (LGS 245-255, RIS 69-84).
-- POS writes one row per controlled item sold, with the folio of
-- the COFEPRIS foliada receta.
-- ----------------------------------------------------------
create table if not exists public.controlled_register (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  sale_id uuid references public.sales(id),
  inventory_id uuid,
  product_name text not null,
  controlled_group text not null,
  quantity integer not null,
  patient_name text,
  prescription_folio text not null,
  doctor_name text,
  doctor_cedula text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.controlled_register enable row level security;
revoke all on public.controlled_register from anon;

create policy controlled_register_staff on public.controlled_register
  for all using (org_id = get_my_org_id() and is_org_staff())
  with check (org_id = get_my_org_id() and is_org_staff());
