-- ============================================================
-- MIGRATION: código CODY — cualquier administrador de la organización
-- (2026-11-26)
--
-- Before: CODY was restricted to one profile (Cody Howell's admin login).
-- Now: any active admin of the org may use it; everyone else is refused
-- ("Código no autorizado" in the POS + audit log; the server refuses the
-- sale too). Everything else about CODY is unchanged: 100 % off including
-- RNP lines (include_rnp), $0 is not income, a Fallida owes no refund.
--
-- 1. discounts.restricted_to_role ('admin'): the code only works for users
--    with that role in the code's org. include_rnp is allowed on codes
--    restricted to a profile OR a role.
-- 2. sales.discount_authorized_by: the user who rang a sale with a
--    restricted code (set by the guard trigger = auth.uid()), so every CODY
--    sale records which admin used it.
-- 3. Guards: role-restricted codes can only be created/changed by an admin
--    of the org (the discounts policy lets any staff edit codes); a sale
--    with one is refused unless auth.uid() is an active admin of the sale's
--    org. Profile-restricted codes keep their previous rules.
-- 4. CODY → restricted_to_role = 'admin', restricted_to_profile_id = null.
--
-- Additive: two nullable columns; guards re-created with same signatures.
-- ============================================================

-- 1-2. Columns --------------------------------------------------------------
alter table public.discounts
  add column if not exists restricted_to_role text;

alter table public.discounts drop constraint if exists discounts_restricted_to_role_check;
alter table public.discounts add constraint discounts_restricted_to_role_check
  check (restricted_to_role is null or restricted_to_role = 'admin');

alter table public.discounts drop constraint if exists discounts_include_rnp_restricted;
alter table public.discounts add constraint discounts_include_rnp_restricted
  check (not include_rnp or restricted_to_profile_id is not null or restricted_to_role is not null);

alter table public.sales
  add column if not exists discount_authorized_by uuid references public.profiles(id) on delete set null;

comment on column public.sales.discount_authorized_by is
  'Usuario que aplicó un código restringido (p. ej. CODY, solo administradores) en esta venta.';

-- Active admin of the given org?
create or replace function public.is_active_admin_of(p_user uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and org_id = p_org and role = 'admin' and deactivated_at is null
  );
$$;
revoke all on function public.is_active_admin_of(uuid, uuid) from public, anon;

-- 3a. Guard on discounts -----------------------------------------------------
create or replace function public.discounts_restriction_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- migrations / service role
  end if;
  -- Profile-restricted codes (unchanged rules)
  if tg_op = 'UPDATE' and old.restricted_to_profile_id is not null
     and old.restricted_to_profile_id is distinct from auth.uid() then
    raise exception 'Este código de descuento es personal y solo su titular puede modificarlo';
  end if;
  if new.restricted_to_profile_id is not null
     and new.restricted_to_profile_id is distinct from auth.uid() then
    raise exception 'Solo puedes restringir un código a tu propia cuenta';
  end if;
  -- Role-restricted codes: only an admin of the org may create, change or
  -- lift the restriction (or set include_rnp on them).
  if (tg_op = 'UPDATE' and old.restricted_to_role is not null)
     or new.restricted_to_role is not null then
    if not public.is_active_admin_of(auth.uid(), coalesce(new.org_id, old.org_id)) then
      raise exception 'Solo un administrador puede crear o modificar este código de descuento';
    end if;
  end if;
  return new;
end;
$$;

-- 3b. Guard on sales ---------------------------------------------------------
create or replace function public.sales_restricted_discount_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_role text;
  v_found boolean := false;
begin
  if new.discount_code is null then
    new.discount_authorized_by := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.discount_code is not distinct from old.discount_code then
    new.discount_authorized_by := old.discount_authorized_by; -- not editable
    return new;
  end if;
  select d.restricted_to_profile_id, d.restricted_to_role, true
    into v_owner, v_role, v_found
  from public.discounts d
  where d.org_id = new.org_id
    and lower(d.code) = lower(new.discount_code)
    and (d.restricted_to_profile_id is not null or d.restricted_to_role is not null)
  limit 1;
  if not coalesce(v_found, false) then
    new.discount_authorized_by := null; -- ordinary code
    return new;
  end if;
  if v_owner is not null and v_owner is distinct from auth.uid() then
    raise exception 'Código de descuento no autorizado para este usuario';
  end if;
  if v_role = 'admin' and not public.is_active_admin_of(auth.uid(), new.org_id) then
    raise exception 'Código de descuento no autorizado: solo administradores';
  end if;
  new.discount_authorized_by := auth.uid();
  return new;
end;
$$;

-- Triggers already exist (discounts_restriction_guard_trg,
-- sales_restricted_discount_guard_trg) and pick up the new bodies.

-- 4. CODY → any admin --------------------------------------------------------
update public.discounts
set restricted_to_role = 'admin', restricted_to_profile_id = null
where lower(code) = 'cody';
