-- ============================================================
-- PRODUCT LINKS (Productos Vinculados)
-- ============================================================
-- Symmetric links between two inventory items that can cover
-- each other (same product from another brand, or a discounted
-- equivalent — e.g. gloves <-> latex gloves of another brand).
--
-- The reorder surfaces (AdminReorderReport, AdminSuppliers
-- suggestReorder, InventoryDashboard low-stock banner) check
-- linked stock before recommending a purchase: if a linked
-- product has stock, the item is "covered" and no reorder is
-- suggested.
--
-- Links are stored once per pair in canonical order
-- (product_a_id < product_b_id); lookups check both columns.
-- RLS follows the standard org-isolation pattern.
-- ============================================================

create table if not exists product_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  product_a_id uuid not null references inventory(id) on delete cascade,
  product_b_id uuid not null references inventory(id) on delete cascade,
  created_at timestamptz default now(),
  constraint product_links_distinct check (product_a_id < product_b_id),
  constraint product_links_unique unique (org_id, product_a_id, product_b_id)
);

create index if not exists product_links_a_idx on product_links(product_a_id);
create index if not exists product_links_b_idx on product_links(product_b_id);

alter table product_links enable row level security;

drop policy if exists "product_links_org_isolation" on product_links;
create policy "product_links_org_isolation" on product_links
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

-- VERIFICATION (uncomment to run after migrating):
-- select tablename, policyname from pg_policies where tablename = 'product_links';
-- select count(*) from product_links;
