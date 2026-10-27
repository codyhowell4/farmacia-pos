-- ============================================================
-- MIGRATION: Poster-only partners ("solo póster") — 2026-10-21
-- Businesses that hang our poster for 10% off their own Apolo
-- purchases WITHOUT a public listing/member offer get
-- partner_type='poster'. get_public_partners keeps returning only
-- full afiliados (poster partners never render in the customer app).
-- ============================================================

alter table public.partners
  add column if not exists partner_type text not null default 'afiliado';

alter table public.partners drop constraint if exists partners_type_check;
alter table public.partners
  add constraint partners_type_check check (partner_type in ('afiliado', 'poster'));

-- Only full afiliados are public (body from the live def + the type filter)
create or replace function public.get_public_partners(p_org_id uuid)
returns table(id uuid, name text, category text, offer text, description text, phone text, whatsapp text, address text, website text, logo_url text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.name, p.category, p.offer, p.description,
         p.phone, p.whatsapp, p.address, p.website, p.logo_url
  from partners p
  where p.org_id = p_org_id
    and p.active
    and p.partner_type = 'afiliado'
  order by p.sort_order, p.name;
$function$;

revoke all on function public.get_public_partners(uuid) from public;
grant execute on function public.get_public_partners(uuid) to anon, authenticated;

-- Verification
select
  (select count(*) from information_schema.columns where table_name = 'partners' and column_name = 'partner_type') as col,
  (select count(*) from pg_proc where proname = 'get_public_partners' and pg_get_functiondef(oid) ilike '%partner_type%') as fn_filtered;
