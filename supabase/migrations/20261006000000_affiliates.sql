-- ============================================================
-- Afiliados (partner self-service) migration
-- 1. partners: logo, account link, poster opt-in, coupon code
-- 2. get_public_partners now returns logo_url
-- 3. generate_partner_coupon(): creates the 10% poster coupon in
--    the existing discounts table (shows up in Admin → Descuentos
--    and the POS automatically)
-- 4. notify_org_admins(): email alerts via notification_queue
-- 5. Portal RPCs for the afiliados app (own row only, whitelisted
--    fields — active/org_id/sort_order/coupon_code stay staff-only)
-- 6. partner-logos public storage bucket, path-scoped writes
-- ============================================================

alter table partners
  add column if not exists logo_url text,
  add column if not exists contact_email text,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists poster_opt_in boolean not null default false,
  add column if not exists coupon_code text;

-- One listing per account
create unique index if not exists partners_user_id_key
  on partners(user_id) where user_id is not null;

-- ----------------------------------------------------------
-- Public read (customer app): add logo_url. Return type changes,
-- so the function must be dropped and recreated.
-- ----------------------------------------------------------
drop function if exists public.get_public_partners(uuid);
create or replace function public.get_public_partners(p_org_id uuid)
returns table(id uuid, name text, category text, offer text, description text,
              phone text, whatsapp text, address text, website text, logo_url text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.name, p.category, p.offer, p.description,
         p.phone, p.whatsapp, p.address, p.website, p.logo_url
  from partners p
  where p.org_id = p_org_id
    and p.active
  order by p.sort_order, p.name;
$$;

revoke all on function public.get_public_partners(uuid) from public;
grant execute on function public.get_public_partners(uuid) to anon, authenticated;

-- ----------------------------------------------------------
-- Coupon generator: slug from the business name + '-10', unique
-- per org in discounts. Idempotent — returns the existing code.
-- ----------------------------------------------------------
create or replace function public.generate_partner_coupon(p_partner_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner record;
  v_base text;
  v_code text;
  v_n int := 0;
begin
  select id, org_id, name, coupon_code into v_partner
  from partners where id = p_partner_id;
  if not found then
    raise exception 'partner not found';
  end if;
  if v_partner.coupon_code is not null then
    return v_partner.coupon_code;
  end if;

  -- ASCII slug: fold accents, keep A-Z0-9 only (no unaccent dependency)
  v_base := translate(upper(v_partner.name), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNAEIOUUN');
  v_base := regexp_replace(v_base, '[^A-Z0-9]+', '', 'g');
  v_base := left(v_base, 20);
  if length(v_base) < 3 then
    v_base := 'AFILIADO';
  end if;

  loop
    v_code := v_base || '-10' || case when v_n = 0 then '' else '-' || v_n::text end;
    exit when not exists (
      select 1 from discounts
      where org_id = v_partner.org_id and upper(code) = upper(v_code)
    );
    v_n := v_n + 1;
  end loop;

  insert into discounts (org_id, code, value, type)
  values (v_partner.org_id, v_code, 10, 'percent');

  update partners set coupon_code = v_code, updated_at = now()
  where id = p_partner_id;

  return v_code;
end;
$$;

revoke all on function public.generate_partner_coupon(uuid) from public, anon, authenticated;
grant execute on function public.generate_partner_coupon(uuid) to service_role;

-- ----------------------------------------------------------
-- Admin email alerts through the existing notification_queue
-- (drained by send-notifications; rows appear instantly).
-- ----------------------------------------------------------
create or replace function public.notify_org_admins(
  p_org_id uuid,
  p_template text,
  p_payload jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_queue (org_id, channel, recipient, template, payload, scheduled_for)
  select p_org_id, 'email', pr.email, p_template, p_payload, now()
  from profiles pr
  where pr.org_id = p_org_id
    and pr.role = 'admin'
    and pr.deactivated_at is null
    and pr.email is not null;
end;
$$;

revoke all on function public.notify_org_admins(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.notify_org_admins(uuid, text, jsonb) to service_role;

-- ----------------------------------------------------------
-- Portal RPCs (afiliados app) — own row only.
-- ----------------------------------------------------------
create or replace function public.get_my_partner()
returns setof partners
language sql
stable
security definer
set search_path = public
as $$
  select * from partners where user_id = auth.uid() limit 1;
$$;

revoke all on function public.get_my_partner() from public, anon;
grant execute on function public.get_my_partner() to authenticated;

create or replace function public.update_my_partner(
  p_name text,
  p_category text default null,
  p_offer text default null,
  p_description text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_address text default null,
  p_website text default null,
  p_logo_url text default null  -- null = keep current, '' = clear
)
returns partners
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner partners;
begin
  select * into v_partner from partners where user_id = auth.uid();
  if not found then
    raise exception 'no hay un negocio afiliado ligado a esta cuenta';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'el nombre del negocio es obligatorio';
  end if;
  if p_offer is null or length(trim(p_offer)) = 0 then
    raise exception 'la oferta para miembros es obligatoria';
  end if;
  if p_logo_url is not null and p_logo_url <> ''
     and p_logo_url not like '%/partner-logos/' || v_partner.id || '/%' then
    raise exception 'ruta de logo inválida';
  end if;

  update partners set
    name        = left(trim(p_name), 120),
    category    = nullif(left(trim(coalesce(p_category, '')), 60), ''),
    offer       = left(trim(p_offer), 200),
    description = nullif(left(trim(coalesce(p_description, '')), 500), ''),
    phone       = nullif(left(trim(coalesce(p_phone, '')), 30), ''),
    whatsapp    = nullif(left(trim(coalesce(p_whatsapp, '')), 30), ''),
    address     = nullif(left(trim(coalesce(p_address, '')), 200), ''),
    website     = nullif(left(trim(coalesce(p_website, '')), 200), ''),
    logo_url    = case
                    when p_logo_url is null then logo_url
                    when p_logo_url = '' then null
                    else p_logo_url
                  end,
    updated_at  = now()
  where id = v_partner.id
  returning * into v_partner;

  return v_partner;
end;
$$;

revoke all on function public.update_my_partner(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_my_partner(text, text, text, text, text, text, text, text, text) to authenticated;

-- Poster opt-in from the portal: generates the coupon (idempotent),
-- flags the partner and alerts admins once.
create or replace function public.request_poster_coupon()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner record;
  v_code text;
begin
  select id, org_id, name, poster_opt_in into v_partner
  from partners where user_id = auth.uid();
  if not found then
    raise exception 'no hay un negocio afiliado ligado a esta cuenta';
  end if;

  v_code := public.generate_partner_coupon(v_partner.id);

  if not v_partner.poster_opt_in then
    update partners set poster_opt_in = true, updated_at = now()
    where id = v_partner.id;
    perform public.notify_org_admins(
      v_partner.org_id,
      'affiliate_poster_optin',
      jsonb_build_object('partner_name', v_partner.name, 'coupon_code', v_code)
    );
  end if;

  return v_code;
end;
$$;

revoke all on function public.request_poster_coupon() from public, anon;
grant execute on function public.request_poster_coupon() to authenticated;

-- ----------------------------------------------------------
-- partner-logos storage bucket (public read; writes path-scoped
-- to {partner_id}/{filename} for the owner, or any org staff).
-- ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('partner-logos', 'partner-logos', true)
on conflict (id) do nothing;

drop policy if exists "partner_logos_public_read" on storage.objects;
create policy "partner_logos_public_read" on storage.objects
  for select using (bucket_id = 'partner-logos');

drop policy if exists "partner_logos_staff" on storage.objects;
create policy "partner_logos_staff" on storage.objects
  for all using (bucket_id = 'partner-logos' and is_org_staff())
  with check (bucket_id = 'partner-logos' and is_org_staff());

drop policy if exists "partner_logos_owner_insert" on storage.objects;
create policy "partner_logos_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'partner-logos'
    and (storage.foldername(name))[1] in (
      select id::text from partners where user_id = auth.uid()
    )
  );

drop policy if exists "partner_logos_owner_update" on storage.objects;
create policy "partner_logos_owner_update" on storage.objects
  for update using (
    bucket_id = 'partner-logos'
    and (storage.foldername(name))[1] in (
      select id::text from partners where user_id = auth.uid()
    )
  ) with check (
    bucket_id = 'partner-logos'
    and (storage.foldername(name))[1] in (
      select id::text from partners where user_id = auth.uid()
    )
  );

drop policy if exists "partner_logos_owner_delete" on storage.objects;
create policy "partner_logos_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'partner-logos'
    and (storage.foldername(name))[1] in (
      select id::text from partners where user_id = auth.uid()
    )
  );
