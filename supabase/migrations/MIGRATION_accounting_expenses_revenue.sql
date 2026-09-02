-- Accounting module: expenses and manual revenue entries
-- Idempotent: safe to run even if the tables already exist.

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  date date not null default current_date,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null default 'Other',
  subcategory text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists expenses_org_id_idx on expenses(org_id);
create index if not exists expenses_date_idx on expenses(date);

create table if not exists manual_revenue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  date date not null default current_date,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null default 'Revenue',
  subcategory text,
  total_sales integer,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists manual_revenue_org_id_idx on manual_revenue(org_id);
create index if not exists manual_revenue_date_idx on manual_revenue(date);

-- RLS
alter table expenses enable row level security;
alter table manual_revenue enable row level security;

drop policy if exists org_isolation on expenses;
create policy org_isolation on expenses
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

drop policy if exists org_isolation on manual_revenue;
create policy org_isolation on manual_revenue
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());
