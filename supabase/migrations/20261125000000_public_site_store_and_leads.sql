-- ============================================================================
-- Sitio público apolofarmacia.com.mx (2026-11-25)
--
-- Parte 1 — get_store_catalog(p_org_id):
--   Catálogo de /tienda. Pública (anon + authenticated) para que el
--   visitante sin sesión vea los productos; el PRECIO solo se devuelve con
--   sesión iniciada (requisito: "inicia sesión para ver precios"). También
--   devuelve el % de descuento de membresía con la MISMA lógica que
--   place_store_order (el total real siempre lo calcula esa RPC).
--   Filtro (además de existencia > 0): sin receta (requires_prescription),
--   sin grupo controlado, solo item_type 'product', sin servicios de
--   consultorio/laboratorio/membresía, y — defensa extra mientras se depura
--   el inventario — sin antibióticos (LGS art. 226 / acuerdo de 2010:
--   requieren receta), inyectables ni psicotrópicos/antiepilépticos que
--   hoy están marcados sin receta por error de captura.
--
-- Parte 2 — empresa_leads:
--   Solicitudes del formulario "Plan Empresa" del sitio. Solo las escribe
--   la edge function empresa-lead (service role); solo el staff de la
--   organización las lee. Datos mínimos (LFPDPPP art. 11 — proporcionalidad).
-- ============================================================================

create or replace function public.get_store_catalog(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_cust uuid;
  v_disc numeric;
  v_discount numeric := 0;
  v_items jsonb;
begin
  if v_uid is not null then
    select id into v_cust from public.customers where profile_id = v_uid limit 1;
    if v_cust is not null then
      select discount_percent into v_disc
        from public.memberships
       where customer_id = v_cust and status = 'active'
       order by created_at desc
       limit 1;
      if found then
        v_discount := coalesce(v_disc, 10);
      else
        select m.discount_percent into v_disc
          from public.membership_members mm
          join public.memberships m on m.id = mm.membership_id
         where mm.claimed_user_id = v_uid
           and m.status = 'active'
         limit 1;
        if found then
          v_discount := coalesce(v_disc, 10);
        end if;
      end if;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'name', btrim(i.name),
           'use', nullif(btrim(coalesce(i.use, '')), ''),
           'department', nullif(btrim(coalesce(i.department, '')), ''),
           'image_url', i.image_url,
           'price', case when v_uid is not null then i.price end
         ) order by btrim(i.name)), '[]'::jsonb)
    into v_items
    from public.inventory i
   where i.org_id = p_org_id
     and i.quantity > 0
     and i.price > 0
     and coalesce(i.requires_prescription, false) = false
     and i.controlled_group is null
     and coalesce(i.item_type, 'product') = 'product'
     and not coalesce(i.is_membership_consultation, false)
     and not coalesce(i.is_membership_revision, false)
     and not coalesce(i.is_membership_blood_pressure, false)
     and coalesce(i.department, '') !~* '(consul|conltorio|consutorio|laborator|membres|servicio|antibi|retroviral|antidepres|anticonvuls|epilep|grupo)'
     and coalesce(i.use, '') !~* '(antibi[oó]tico|laboratorio|consultorio)'
     and i.name !~* '^\s*(consulta|retiro|toma de|lavado|revisi[oó]n|aplicaci[oó]n|cultivo|tipo de sangre|curaci[oó]n de|sutura|inyecci[oó]n)'
     and i.name !~* '(inyectable|amoxicilina|azitromicina|ezitromicina|ciprofloxacino|cefalexina|ceftriaxona|clindamicina|claritromicina|doxiciclina|levofloxacino|nitrofuranto[ií]na|trimetoprima|sulfametoxazol|penicilina|ampicilina|dicloxacilina|gentamicina|eritromicina|fosfomicina|cefixima|cefuroxima|neomicina|metronidazol)';

  return jsonb_build_object(
    'signed_in', v_uid is not null,
    'is_customer', v_cust is not null,
    'discount_percent', v_discount,
    'items', v_items);
end
$fn$;

revoke all on function public.get_store_catalog(uuid) from public;
grant execute on function public.get_store_catalog(uuid) to anon, authenticated;

-- ---------- Parte 2: empresa_leads ----------
create table if not exists public.empresa_leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  company text not null,
  phone text,
  email text not null,
  employees integer,
  source_page text,
  status text not null default 'nuevo',
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists empresa_leads_org_created_idx
  on public.empresa_leads (org_id, created_at desc);

alter table public.empresa_leads enable row level security;

revoke all on public.empresa_leads from public, anon, authenticated;
grant select, update on public.empresa_leads to authenticated;

drop policy if exists empresa_leads_staff_read on public.empresa_leads;
create policy empresa_leads_staff_read on public.empresa_leads
  for select using (org_id = public.get_my_org_id() and public.is_org_staff());

drop policy if exists empresa_leads_staff_update on public.empresa_leads;
create policy empresa_leads_staff_update on public.empresa_leads
  for update using (org_id = public.get_my_org_id() and public.is_org_staff())
  with check (org_id = public.get_my_org_id() and public.is_org_staff());
