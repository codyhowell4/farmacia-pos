-- ============================================================
-- Partners (negocios aliados) migration
-- Partner businesses that offer discounts/perks to members.
-- Staff manage them via org-isolated RLS; the customer app reads
-- active partners through a security-definer RPC (same pattern as
-- get_public_doctors).
-- Run this in the Supabase SQL Editor.
-- ============================================================

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category text,
  offer text not null,
  description text,
  phone text,
  whatsapp text,
  address text,
  website text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists partners_org_id_idx on partners(org_id);
create index if not exists partners_active_idx on partners(org_id, active);

alter table partners enable row level security;

drop policy if exists org_isolation on partners;
create policy org_isolation on partners
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

-- Public read of active partners for the customer app
-- (anon/guests have no direct read on the table).
create or replace function public.get_public_partners(p_org_id uuid)
returns table(id uuid, name text, category text, offer text, description text,
              phone text, whatsapp text, address text, website text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.name, p.category, p.offer, p.description,
         p.phone, p.whatsapp, p.address, p.website
  from partners p
  where p.org_id = p_org_id
    and p.active
  order by p.sort_order, p.name;
$$;

revoke all on function public.get_public_partners(uuid) from public;
grant execute on function public.get_public_partners(uuid) to anon, authenticated;
