-- Screen lock (auto bloqueo por inactividad) — personal unlock PIN, 2026-09-30
--
-- The idle auto-LOGOUT becomes an idle screen LOCK: the session stays alive
-- underneath and the user re-enters with a 4–6 digit PIN instead of their
-- password. PINs reuse profiles.pin_hash (bcrypt, same column as the admin
-- override PIN). A profile that never chose a PIN unlocks with the default
-- 1234 — verify_admin_pin is deliberately NOT given that default (approving
-- voids/returns must never work with a well-known code).
--
-- verify_profile_pin  — checks the CALLER's own PIN (any role), audit-logged.
-- set_my_profile_pin  — lets the caller set/change their own PIN, audit-logged.

-- ----------------------------------------------------------
-- verify_profile_pin: unlock the screen for the current user.
-- Returns true/false; every attempt is audit-logged (fail-open logging, same
-- as verify_admin_pin: logging must never break verification).
-- ----------------------------------------------------------
create or replace function public.verify_profile_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid := public.get_my_org_id();
  v_pin_hash text;
  v_deactivated timestamptz;
  v_ok boolean := false;
begin
  if v_uid is null or p_pin is null or p_pin = '' then
    return false;
  end if;

  select p.pin_hash, p.deactivated_at into v_pin_hash, v_deactivated
  from public.profiles p
  where p.id = v_uid;

  if not found or v_deactivated is not null then
    return false;
  end if;

  -- No PIN chosen yet -> default 1234.
  if v_pin_hash is null then
    v_ok := p_pin = '1234';
  else
    v_ok := v_pin_hash = crypt(p_pin, v_pin_hash);
  end if;

  begin
    insert into audit_log (org_id, user_id, action, details, timestamp)
    values (
      v_org,
      v_uid,
      case when v_ok then 'screen_lock_unlocked' else 'screen_lock_unlock_failed' end,
      case when v_ok then 'Pantalla desbloqueada con PIN' else 'PIN de desbloqueo incorrecto' end,
      now()
    );
  exception when others then
    null;
  end;

  return v_ok;
end;
$function$;

revoke all on function public.verify_profile_pin(text) from public, anon;
grant execute on function public.verify_profile_pin(text) to authenticated;

-- ----------------------------------------------------------
-- set_my_profile_pin: self-service PIN change (4-6 digits).
-- The profiles_protect_privileged trigger normally pins pin_hash for
-- non-admins; the transaction-local flag app.self_pin_change marks this one
-- sanctioned path (the trigger re-checks that ONLY pin_hash changed and only
-- on the caller's own row).
-- ----------------------------------------------------------
create or replace function public.set_my_profile_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida';
  end if;
  if p_pin is null or p_pin !~ '^\d{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 dígitos';
  end if;

  perform set_config('app.self_pin_change', 'on', true);

  update public.profiles
  set pin_hash = crypt(p_pin, gen_salt('bf')),
      pin = null
  where id = auth.uid();

  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  begin
    insert into audit_log (org_id, user_id, action, details, timestamp)
    values (
      public.get_my_org_id(),
      auth.uid(),
      'screen_lock_pin_changed',
      'PIN de desbloqueo actualizado',
      now()
    );
  exception when others then
    null;
  end;
end;
$function$;

revoke all on function public.set_my_profile_pin(text) from public, anon;
grant execute on function public.set_my_profile_pin(text) to authenticated;

-- ----------------------------------------------------------
-- Trigger: honor the self-service flag from set_my_profile_pin.
-- Everything else stays exactly as hardened in
-- 20260918180000_critical_rls_hardening.sql.
-- ----------------------------------------------------------
create or replace function public.profiles_protect_privileged()
returns trigger
language plpgsql
as $function$
begin
  -- Sanctioned self-service PIN change: only pin_hash may move, only on the
  -- caller's own row; every other privileged column stays pinned.
  if current_setting('app.self_pin_change', true) = 'on' then
    if new.id = auth.uid()
       and new.role is not distinct from old.role
       and new.org_id is not distinct from old.org_id
       and new.location_id is not distinct from old.location_id
       and new.email is not distinct from old.email
       and new.pin is not distinct from old.pin then
      return new;
    end if;
    raise exception 'Campos protegidos: solo un administrador puede modificarlos';
  end if;

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
$function$;
