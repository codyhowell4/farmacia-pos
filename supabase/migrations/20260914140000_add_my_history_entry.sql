-- Patient self-reported medical history: appends entries to any whitelisted
-- medical_history section with "agregada por el paciente" attribution.
-- Security definer so patients can only touch their own customers row.
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
    'gineco_obstetricos', 'vacunacion', 'perinatales'
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

-- The allergy-only helper (20260914130000) now delegates to the generic one.
create or replace function public.add_my_allergy(p_label text, p_value text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.add_my_history_entry('alergias', p_label, p_value, 'positive');
end;
$$;

revoke all on function public.add_my_allergy(text, text) from public;
grant execute on function public.add_my_allergy(text, text) to authenticated;
