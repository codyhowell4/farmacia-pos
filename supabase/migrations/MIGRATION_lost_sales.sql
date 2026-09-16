-- ============================================================
-- LOST SALES (Ventas Perdidas)
-- ============================================================
-- Freeform log of sales the pharmacy loses because a product or
-- service is unavailable (e.g. a patient asks for a consulta but
-- the doctor is out). Front-line staff record it from the POS
-- cart; the same freeform names feed back as searchable
-- suggestions so recurring requests accumulate under one name.
--
-- Deliberately independent of inventory: item_name is plain text,
-- not a FK. Admin aggregates counts per month per item to see
-- what is being lost and how often (AdminLostSales).
--
-- RLS follows the standard org-isolation pattern.
-- ============================================================

create table if not exists lost_sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  item_name text not null,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists lost_sales_org_created_idx on lost_sales(org_id, created_at desc);

alter table lost_sales enable row level security;

drop policy if exists "lost_sales_org_isolation" on lost_sales;
create policy "lost_sales_org_isolation" on lost_sales
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

-- VERIFICATION (uncomment to run after migrating):
-- select tablename, policyname from pg_policies where tablename = 'lost_sales';
-- insert into lost_sales (org_id, item_name) values (get_my_org_id(), 'Consulta') returning *;
-- delete from lost_sales where item_name = 'Consulta';
