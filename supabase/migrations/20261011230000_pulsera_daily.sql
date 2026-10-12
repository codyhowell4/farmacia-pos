-- ============================================================
-- Pulsera Apolo Básico — per-day wellness data from the customer portal
-- ------------------------------------------------------------
-- Patient-generated data from a consumer fitness band (steps, distance,
-- kcal, on-demand HR/SpO2/BP estimate, battery/firmware).
--
-- NOM-004 note: this is NOT part of the legal expediente clínico — that
-- stays in historia_clinica (append-only). This table follows the
-- consulta_drafts precedent: operational, patient-visible data kept
-- outside the legal record. Staff can read it (expediente-style review),
-- the customer can read/write only their own rows.
-- One row per customer per day; the portal upserts on every sync.
-- ============================================================

create table if not exists public.pulsera_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  fecha date not null,
  pasos integer not null default 0,
  distancia_m integer not null default 0,
  kcal integer not null default 0,
  fc_lpm integer,
  spo2 integer,
  pa_sistolica integer,
  pa_diastolica integer,
  bateria integer,
  firmware text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pulsera_daily_customer_fecha_key unique (customer_id, fecha)
);

create index if not exists pulsera_daily_customer_idx on pulsera_daily(customer_id, fecha desc);

alter table public.pulsera_daily enable row level security;

grant select, insert, update on public.pulsera_daily to authenticated;

-- Customer can read/upsert only their own rows (portal writes directly,
-- same child-table pattern as prescriptions/memberships).
drop policy if exists pulsera_daily_customer_select on public.pulsera_daily;
create policy pulsera_daily_customer_select on public.pulsera_daily
  for select using (
    customer_id in (select id from public.customers where profile_id = auth.uid())
  );

drop policy if exists pulsera_daily_customer_insert on public.pulsera_daily;
create policy pulsera_daily_customer_insert on public.pulsera_daily
  for insert with check (
    customer_id in (select id from public.customers where profile_id = auth.uid())
  );

drop policy if exists pulsera_daily_customer_update on public.pulsera_daily;
create policy pulsera_daily_customer_update on public.pulsera_daily
  for update using (
    customer_id in (select id from public.customers where profile_id = auth.uid())
  )
  with check (
    customer_id in (select id from public.customers where profile_id = auth.uid())
  );

-- Staff read-only (same expression as customers_staff_all).
drop policy if exists pulsera_daily_staff_select on public.pulsera_daily;
create policy pulsera_daily_staff_select on public.pulsera_daily
  for select using (org_id = get_my_org_id() and is_org_staff());
