-- Patient self-service: read own prescriptions + update own expediente fields.

-- 1. Customers can read their own prescriptions (recetas issued in the doctor
--    portal become visible in the patient app, incl. /receta-view).
drop policy if exists prescriptions_customer_select on public.prescriptions;
create policy prescriptions_customer_select on public.prescriptions
  for select using (
    customer_id in (select id from public.customers where profile_id = auth.uid())
  );

-- 2. Patient profile editor ("Mis datos" in the app): security-definer RPC
--    with a column whitelist, so patients can only touch these expediente
--    fields on their own customers row (never org_id, profile_id, notes,
--    membership data, created_at, etc).
create or replace function public.update_my_customer_profile(
  p_full_name text default null,
  p_phone text default null,
  p_curp text default null,
  p_sexo text default null,
  p_date_of_birth date default null,
  p_birth_state text default null,
  p_height numeric default null,
  p_weight numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sexo is not null and p_sexo not in ('M','H') then
    raise exception 'sexo must be M or H';
  end if;

  update public.customers set
    full_name     = coalesce(nullif(p_full_name, ''), full_name),
    phone         = coalesce(nullif(p_phone, ''), phone),
    curp          = coalesce(nullif(p_curp, ''), curp),
    sexo          = coalesce(p_sexo, sexo),
    date_of_birth = coalesce(p_date_of_birth, date_of_birth),
    birth_state   = coalesce(nullif(p_birth_state, ''), birth_state),
    height        = coalesce(p_height, height),
    weight        = coalesce(p_weight, weight),
    updated_at    = now()
  where profile_id = auth.uid();

  if not found then
    raise exception 'customer not found for this user';
  end if;
end;
$$;

revoke all on function public.update_my_customer_profile(text,text,text,text,date,text,numeric,numeric) from public;
grant execute on function public.update_my_customer_profile(text,text,text,text,date,text,numeric,numeric) to authenticated;
