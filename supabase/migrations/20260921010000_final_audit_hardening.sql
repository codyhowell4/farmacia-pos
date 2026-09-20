-- Final audit (round 3) — function/trigger hardening, 2026-09-21
-- Companion to 20260921000000_final_audit_security_lockdown.sql.
-- Covers: N1 (deactivated staff via PIN), S11 (search_path), S2 (membership
-- RPC authz), N2 (inventory decrement authz), S4 (subscription replay),
-- S3 (rx folio unguessable), S5 (appointment column guard), S9 (customer
-- column guard), S7 (server-side preorder pricing), N5 (catalog versions),
-- plus round-3 speed indexes.
--
-- Guard pattern used throughout: direct DB connections (pg_cron, migrations,
-- admin) have request.jwt.claims UNSET; PostgREST always sets it. Security-
-- definer RPCs execute as their owner (postgres) and bypass the customer
-- guards via current_user. Staff are detected with is_org_staff().

-- ============================================================
-- N1: verify_admin_pin must not authorize deactivated admins
-- ============================================================
create or replace function public.verify_admin_pin(p_pin text)
returns table(id uuid, full_name text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
    and p.deactivated_at is null
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
    null;
  end;
  if v_hit.id is null then
    return;
  end if;
  id := v_hit.id;
  full_name := v_hit.full_name;
  return next;
end;
$function$;

-- ============================================================
-- S11: is_admin / is_org_staff — SECURITY DEFINER without
-- search_path is a hijack risk; bodies unchanged.
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and deactivated_at is null
  )
$function$;

create or replace function public.is_org_staff()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','pos','inventory','doctor')
      and deactivated_at is null
  )
$function$;

-- ============================================================
-- S2: membership RPCs were callable by ANY authenticated user
-- (self-granted renewals/visits/lab packages, falsified sales).
-- Rename originals to _impl_*, revoke them, and re-expose the
-- original names through guarded wrappers (bodies untouched).
-- ============================================================

-- record_membership_payment: staff / service_role only
alter function public.record_membership_payment(uuid, numeric, text, uuid, boolean) rename to _impl_record_membership_payment;
revoke all on function public._impl_record_membership_payment(uuid, numeric, text, uuid, boolean) from public, anon, authenticated;
create or replace function public.record_membership_payment(
  p_membership_id uuid,
  p_amount numeric default null,
  p_payment_method text default 'cash',
  p_staff_id uuid default null,
  p_is_signup boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true), '') not like '%service_role%'
     and not public.is_org_staff() then
    raise exception 'not authorized';
  end if;
  return public._impl_record_membership_payment(p_membership_id, p_amount, p_payment_method, p_staff_id, p_is_signup);
end;
$$;
revoke all on function public.record_membership_payment(uuid, numeric, text, uuid, boolean) from public;
revoke execute on function public.record_membership_payment(uuid, numeric, text, uuid, boolean) from anon;
grant execute on function public.record_membership_payment(uuid, numeric, text, uuid, boolean) to authenticated, service_role;

-- restore_membership_sale_benefits: staff / service_role only
alter function public.restore_membership_sale_benefits(uuid) rename to _impl_restore_membership_sale_benefits;
revoke all on function public._impl_restore_membership_sale_benefits(uuid) from public, anon, authenticated;
create or replace function public.restore_membership_sale_benefits(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true), '') not like '%service_role%'
     and not public.is_org_staff() then
    raise exception 'not authorized';
  end if;
  perform public._impl_restore_membership_sale_benefits(p_sale_id);
end;
$$;
revoke all on function public.restore_membership_sale_benefits(uuid) from public;
revoke execute on function public.restore_membership_sale_benefits(uuid) from anon;
grant execute on function public.restore_membership_sale_benefits(uuid) to authenticated, service_role;

-- use_membership_revision: staff / service_role only
alter function public.use_membership_revision(uuid, uuid) rename to _impl_use_membership_revision;
revoke all on function public._impl_use_membership_revision(uuid, uuid) from public, anon, authenticated;
create or replace function public.use_membership_revision(p_revision_id uuid, p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true), '') not like '%service_role%'
     and not public.is_org_staff() then
    raise exception 'not authorized';
  end if;
  perform public._impl_use_membership_revision(p_revision_id, p_sale_id);
end;
$$;
revoke all on function public.use_membership_revision(uuid, uuid) from public;
revoke execute on function public.use_membership_revision(uuid, uuid) from anon;
grant execute on function public.use_membership_revision(uuid, uuid) to authenticated, service_role;

-- process_membership_renewals: staff / service_role / pg_cron (direct DB)
alter function public.process_membership_renewals() rename to _impl_process_membership_renewals;
revoke all on function public._impl_process_membership_renewals() from public, anon, authenticated;
create or replace function public.process_membership_renewals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true), '') not like '%service_role%'
     and not public.is_org_staff() then
    raise exception 'not authorized';
  end if;
  return public._impl_process_membership_renewals();
end;
$$;
revoke all on function public.process_membership_renewals() from public;
revoke execute on function public.process_membership_renewals() from anon;
grant execute on function public.process_membership_renewals() to authenticated, service_role;

-- decrement_membership_visits: staff / service_role / the membership owner
alter function public.decrement_membership_visits(uuid, integer) rename to _impl_decrement_membership_visits;
revoke all on function public._impl_decrement_membership_visits(uuid, integer) from public, anon, authenticated;
create or replace function public.decrement_membership_visits(p_membership_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true), '') not like '%service_role%'
     and not public.is_org_staff()
     and not exists (
       select 1
       from memberships m
       join customers c on c.id = m.customer_id
       where m.id = p_membership_id and c.profile_id = auth.uid()
     ) then
    raise exception 'not authorized';
  end if;
  return public._impl_decrement_membership_visits(p_membership_id, p_count);
end;
$$;
revoke all on function public.decrement_membership_visits(uuid, integer) from public;
revoke execute on function public.decrement_membership_visits(uuid, integer) from anon;
grant execute on function public.decrement_membership_visits(uuid, integer) to authenticated, service_role;

-- get_pending_member_revisions: staff / service_role / the membership owner
alter function public.get_pending_member_revisions(uuid) rename to _impl_get_pending_member_revisions;
revoke all on function public._impl_get_pending_member_revisions(uuid) from public, anon, authenticated;
create or replace function public.get_pending_member_revisions(p_membership_id uuid)
returns table(revision_id uuid, member_id uuid, sub_id text, member_name text, milestone integer, package_type text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true), '') not like '%service_role%'
     and not public.is_org_staff()
     and not exists (
       select 1
       from memberships m
       join customers c on c.id = m.customer_id
       where m.id = p_membership_id and c.profile_id = auth.uid()
     ) then
    raise exception 'not authorized';
  end if;
  return query select * from public._impl_get_pending_member_revisions(p_membership_id);
end;
$$;
revoke all on function public.get_pending_member_revisions(uuid) from public;
revoke execute on function public.get_pending_member_revisions(uuid) from anon;
grant execute on function public.get_pending_member_revisions(uuid) to authenticated, service_role;

-- ============================================================
-- N2: decrement_inventory was customer-callable (stock zeroing,
-- sales_count inflation). Now: staff / service_role, or the
-- customer reserving stock for their OWN open preorder.
-- decrement_inventory_allow_negative is service_role only.
-- ============================================================
create or replace function public.decrement_inventory(p_id uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_org_id uuid;
  v_item_org_id uuid;
  v_item_exists boolean;
  v_current_qty integer;
  v_new_qty integer;
begin
  select exists(select 1 from inventory where id = p_id),
         org_id,
         quantity
  into v_item_exists, v_item_org_id, v_current_qty
  from inventory
  where id = p_id;

  if not v_item_exists then
    raise exception 'Inventory item with id % not found', p_id;
  end if;

  select org_id into v_caller_org_id
  from profiles
  where id = auth.uid();

  if v_caller_org_id is null then
    select org_id into v_caller_org_id
    from customers
    where profile_id = auth.uid();
  end if;

  if v_caller_org_id is not null and v_caller_org_id != v_item_org_id then
    raise exception 'Unauthorized: inventory item % belongs to a different organization', p_id;
  end if;

  -- Authorization: PostgREST callers must be org staff, the service role,
  -- or the customer whose own open preorder (status='processing') contains
  -- this item at >= the requested quantity. Direct DB (cron/admin) passes.
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true), '') not like '%service_role%'
     and not public.is_org_staff() then
    if not exists (
      select 1
      from sales s
      join sale_items si on si.sale_id = s.id
      join customers c on c.id = s.customer_id
      where c.profile_id = auth.uid()
        and s.status = 'processing'
        and s.voided = false
        and si.inventory_id = p_id
        and si.quantity >= p_qty
    ) then
      raise exception 'Unauthorized: only staff or the owning preorder can decrement inventory';
    end if;
  end if;

  v_new_qty := greatest(0, v_current_qty - p_qty);

  update inventory
  set
    quantity = v_new_qty,
    sales_count = coalesce(sales_count, 0) + p_qty,
    updated_at = now()
  where id = p_id
    and org_id = v_item_org_id;

  if not found then
    raise exception 'Failed to update inventory item %', p_id;
  end if;
end;
$function$;

revoke execute on function public.decrement_inventory_allow_negative(uuid, integer) from anon, authenticated;

-- ============================================================
-- S4: one PayPal subscription must activate ONE membership
-- ============================================================
create unique index if not exists memberships_processor_sub_uidx
  on public.memberships (processor_subscription_id)
  where processor_subscription_id is not null;

-- ============================================================
-- S3: rx folios were sequential per day (RX-YYYYMMDD-NNNNN) and
-- enumerable via the public verify endpoint. Append an
-- unguessable 6-char suffix; the counter stays for operations.
-- ============================================================
create or replace function public.generate_rx_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_date text;
  v_seq integer;
  v_number text;
  v_rand text;
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
  v_rand := (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1), '')
    from generate_series(1, 6)
  );
  v_number := 'RX-' || v_date || '-' || lpad(v_seq::text, 5, '0') || '-' || v_rand;
  NEW.prescription_number := v_number;
  return NEW;
end;
$function$;

-- ============================================================
-- S5: customers could UPDATE any column of their own citas
-- (flip payment_status to 'paid', rewrite notes/doctor...).
-- Non-staff callers may now only cancel (status -> 'cancelled',
-- optional reason); every other column is pinned.
-- ============================================================
create or replace function public.appointments_customer_update_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role')
     or current_setting('request.jwt.claims', true) is null
     or coalesce(current_setting('request.jwt.claims', true), '') like '%service_role%'
     or public.is_org_staff() then
    return NEW;
  end if;

  if NEW.status is distinct from OLD.status and NEW.status <> 'cancelled' then
    raise exception 'Solo puedes cancelar tu cita';
  end if;

  if NEW.id is distinct from OLD.id
     or NEW.org_id is distinct from OLD.org_id
     or NEW.customer_id is distinct from OLD.customer_id
     or NEW.doctor_id is distinct from OLD.doctor_id
     or NEW.walkin_name is distinct from OLD.walkin_name
     or NEW.walkin_phone is distinct from OLD.walkin_phone
     or NEW.appointment_date is distinct from OLD.appointment_date
     or NEW.notes is distinct from OLD.notes
     or NEW.type is distinct from OLD.type
     or NEW.meeting_url is distinct from OLD.meeting_url
     or NEW.meeting_id is distinct from OLD.meeting_id
     or NEW.meeting_url_staff is distinct from OLD.meeting_url_staff
     or NEW.payment_status is distinct from OLD.payment_status
     or NEW.payment_ref is distinct from OLD.payment_ref
     or NEW.nurse_vitals is distinct from OLD.nurse_vitals
     or NEW.nurse_vitals_by is distinct from OLD.nurse_vitals_by
     or NEW.nurse_vitals_by_name is distinct from OLD.nurse_vitals_by_name
     or NEW.consulta_started_at is distinct from OLD.consulta_started_at
     or NEW.consulta_ended_at is distinct from OLD.consulta_ended_at
     or NEW.original_doctor_id is distinct from OLD.original_doctor_id
     or NEW.taken_over_by is distinct from OLD.taken_over_by
     or NEW.taken_over_at is distinct from OLD.taken_over_at
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'No puedes modificar los datos de la cita';
  end if;

  return NEW;
end;
$$;

drop trigger if exists appointments_customer_update_guard_trg on public.appointments;
create trigger appointments_customer_update_guard_trg
  before update on public.appointments
  for each row execute function public.appointments_customer_update_guard();

-- ============================================================
-- S9: customers_self_update (RLS) lets a patient rewrite EVERY
-- column of their own record — guardian-consent evidence, staff
-- notes, org_id, e-mail collisions, medical_history bypassing
-- the audited RPC. Pin the sensitive columns for non-staff
-- callers; the whitelisted update_my_customer_profile RPC and
-- the audited history/allergy RPCs run as owner and are exempt.
-- ============================================================
create or replace function public.customers_self_update_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role')
     or current_setting('request.jwt.claims', true) is null
     or coalesce(current_setting('request.jwt.claims', true), '') like '%service_role%'
     or public.is_org_staff() then
    return NEW;
  end if;

  if NEW.id is distinct from OLD.id
     or NEW.org_id is distinct from OLD.org_id
     or NEW.email is distinct from OLD.email
     or NEW.notes is distinct from OLD.notes
     or NEW.medical_history is distinct from OLD.medical_history
     or NEW.guardian_name is distinct from OLD.guardian_name
     or NEW.guardian_relationship is distinct from OLD.guardian_relationship
     or NEW.guardian_id_ref is distinct from OLD.guardian_id_ref
     or NEW.profile_id is distinct from OLD.profile_id
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'No puedes modificar esos datos; pide ayuda en sucursal';
  end if;

  return NEW;
end;
$$;

drop trigger if exists customers_self_update_guard_trg on public.customers;
create trigger customers_self_update_guard_trg
  before update on public.customers
  for each row execute function public.customers_self_update_guard();

-- ============================================================
-- S7: customer preorders trusted client-supplied prices (a
-- $1,000 item preordered at $0.01). For non-staff INSERTs the
-- price now comes from the inventory row; and when a preorder
-- (processing) is completed, the header totals are recomputed
-- from the server-priced items. The online store is currently
-- compliance-paused, so no live UI flow depends on client
-- pricing; member-discount pricing must go through a
-- server-side validation RPC when the store reopens.
-- ============================================================
create or replace function public.sale_items_customer_price_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_price numeric;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role')
     or current_setting('request.jwt.claims', true) is null
     or coalesce(current_setting('request.jwt.claims', true), '') like '%service_role%'
     or public.is_org_staff() then
    return NEW;
  end if;

  if NEW.inventory_id is not null then
    select price into v_price from inventory where id = NEW.inventory_id;
    if found then
      NEW.price := v_price;
    end if;
    NEW.original_price := null;
    NEW.override_by := null;
  end if;

  return NEW;
end;
$$;

drop trigger if exists sale_items_customer_price_guard_trg on public.sale_items;
create trigger sale_items_customer_price_guard_trg
  before insert on public.sale_items
  for each row execute function public.sale_items_customer_price_guard();

create or replace function public.sales_processing_total_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total numeric;
begin
  if OLD.status = 'processing' and NEW.status = 'completed' then
    select coalesce(sum(si.price * si.quantity), 0) into v_total
    from sale_items si
    where si.sale_id = NEW.id;
    NEW.subtotal := v_total;
    NEW.total := v_total;
  end if;
  return NEW;
end;
$$;

drop trigger if exists sales_processing_total_guard_trg on public.sales;
create trigger sales_processing_total_guard_trg
  before update on public.sales
  for each row execute function public.sales_processing_total_guard();

-- ============================================================
-- N5: NOM-024 6.4.2 — record catalog provenance/version
-- ============================================================
create table if not exists public.catalog_meta (
  catalog text primary key,
  version text not null,
  source text,
  notes text,
  recorded_at timestamptz not null default now()
);

alter table public.catalog_meta enable row level security;

drop policy if exists catalog_meta_staff_read on public.catalog_meta;
create policy catalog_meta_staff_read on public.catalog_meta
  for select using (public.is_org_staff());

insert into public.catalog_meta (catalog, version, source, notes)
values (
  'CIE-10',
  'seed-2026-09',
  'OMS/WHO ICD-10',
  '12,430 códigos sembrados (MIGRATION_cie10_seed.sql). Pendiente [ORG]: confirmar la edición exacta con DGIS para el expediente de certificación NOM-024.'
)
on conflict (catalog) do nothing;

-- ============================================================
-- Round-3 speed indexes (verified missing against live pg_indexes)
-- ============================================================
create index if not exists idx_prescriptions_doctor_id
  on public.prescriptions (doctor_id) where doctor_id is not null;
create index if not exists controlled_register_org_created_idx
  on public.controlled_register (org_id, created_at desc);
create index if not exists controlled_register_sale_idx
  on public.controlled_register (sale_id);
create index if not exists audit_log_org_ts_idx
  on public.audit_log (org_id, "timestamp" desc);
create index if not exists appointments_customer_date_idx
  on public.appointments (customer_id, appointment_date desc);
create index if not exists consulta_notes_customer_created_idx
  on public.consulta_notes (customer_id, created_at desc);
