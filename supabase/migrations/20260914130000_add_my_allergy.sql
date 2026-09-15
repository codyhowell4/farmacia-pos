-- Patient self-reported allergies: appends to medical_history.alergias with
-- "agregada por el paciente" attribution. Security definer so patients can
-- only touch their own customers row, and only the alergias section.
create or replace function public.add_my_allergy(p_label text, p_value text default null)
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
  if p_label is null or btrim(p_label) = '' then
    raise exception 'label is required';
  end if;

  select * into v_customer from public.customers where profile_id = auth.uid();
  if not found then
    raise exception 'customer not found for this user';
  end if;

  v_hist := coalesce(v_customer.medical_history, '{}'::jsonb);
  v_entries := coalesce(v_hist->'alergias', '[]'::jsonb);
  if jsonb_typeof(v_entries) <> 'array' then
    v_entries := '[]'::jsonb;
  end if;

  v_entries := v_entries || jsonb_build_array(jsonb_build_object(
    'label', btrim(p_label),
    'value', nullif(btrim(coalesce(p_value, '')), ''),
    'status', 'positive',
    'added_by_name', v_customer.full_name,
    'added_by_role', 'patient',
    'added_at', now()
  ));

  v_hist := jsonb_set(v_hist, '{alergias}', v_entries, true);

  update public.customers
    set medical_history = v_hist, updated_at = now()
    where id = v_customer.id;
end;
$$;

revoke all on function public.add_my_allergy(text, text) from public;
grant execute on function public.add_my_allergy(text, text) to authenticated;
