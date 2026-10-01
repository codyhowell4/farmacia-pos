-- First-login health onboarding wizard (customer portal):
-- flag column + "medicamentos actuales" history section + completion RPC.

-- 1. One-time flag: the wizard shows while this is NULL. "Completar después"
--    also sets it (re-engagement happens via the monthly mis-datos prompt).
alter table public.customers
  add column if not exists health_onboarding_completed_at timestamptz;

-- 2. Extend the self-service history whitelist with a "medicamentos actuales"
--    section. Body identical to 20260914140000_add_my_history_entry.sql except
--    for the added section name.
create or replace function public.add_my_history_entry(
  p_section text,
  p_label text,
  p_value text default null,
  p_status text default 'positive'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_hist jsonb;
  v_entries jsonb;
begin
  if p_section not in (
    'alergias', 'patologicos', 'no_patologicos', 'heredofamiliares',
    'gineco_obstetricos', 'vacunacion', 'perinatales', 'medicamentos_actuales'
  ) then
    raise exception 'invalid section: %', p_section;
  end if;
  if p_label is null or btrim(p_label) = '' then
    raise exception 'label is required';
  end if;
  if p_status not in ('positive', 'denied') then
    raise exception 'invalid status: %', p_status;
  end if;

  select * into v_customer from public.customers where profile_id = auth.uid();
  if not found then
    raise exception 'customer not found for this user';
  end if;

  v_hist := coalesce(v_customer.medical_history, '{}'::jsonb);
  v_entries := coalesce(v_hist -> p_section, '[]'::jsonb);
  if jsonb_typeof(v_entries) <> 'array' then
    v_entries := '[]'::jsonb;
  end if;

  v_entries := v_entries || jsonb_build_array(jsonb_build_object(
    'label', btrim(p_label),
    'value', nullif(btrim(coalesce(p_value, '')), ''),
    'status', p_status,
    'added_by_name', v_customer.full_name,
    'added_by_role', 'patient',
    'added_at', now()
  ));

  v_hist := jsonb_set(v_hist, array[p_section], v_entries, true);

  update public.customers
    set medical_history = v_hist, updated_at = now()
    where id = v_customer.id;
end;
$$;

revoke all on function public.add_my_history_entry(text, text, text, text) from public;
grant execute on function public.add_my_history_entry(text, text, text, text) to authenticated;

-- 3. Marks the wizard as done (completed or skipped). Security definer so the
--    customers_self_update_guard trigger never comes into play; patients can
--    only touch their own row.
create or replace function public.complete_my_health_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customers
    set health_onboarding_completed_at = now(), updated_at = now()
    where profile_id = auth.uid();

  if not found then
    raise exception 'customer not found for this user';
  end if;
end;
$$;

revoke all on function public.complete_my_health_onboarding() from public;
grant execute on function public.complete_my_health_onboarding() to authenticated;
