-- ============================================================
-- MIGRATION: Servicios RNP en POS (2026-11-24)
--
-- Recargas, paquetes, pagos de servicios y tarjetas de regalo vía
-- Red Nacional de Pagos (recargastodomexico.com). Todas las llamadas
-- pasan por la edge function `rnp-servicios` (service role); el navegador
-- nunca habla con RNP.
--
-- 1. rnp_transactions: bitácora de CADA petición/respuesta (credenciales
--    eliminadas) para conciliación. org_id + RLS: solo admins leen; nadie
--    escribe desde el cliente (solo service role). Sin DELETE (trigger).
--    Las columnas de la petición quedan congeladas tras el insert; solo
--    el resultado/estatus y el sale_id pueden completarse después.
-- 2. sale_items.rnp_op_id: marca las líneas de servicio RNP en la venta
--    (anular/devolver esas líneas se bloquea en el cliente: RNP no tiene
--    devoluciones).
--
-- Additive only: no existing object is altered beyond the new nullable
-- column on sale_items.
-- ============================================================

create table if not exists public.rnp_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid,
  shift_id uuid references public.shifts(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  -- Client-generated idempotency key for sale operations (one per cart line).
  -- Unique: the same op can never be sent to RNP twice.
  op_id uuid unique,
  method text not null check (method in ('obtenerSaldo', 'obtenerProductos', 'realizarRecarga', 'realizarServicio')),
  category text check (category is null or category in ('recarga', 'paquete', 'servicio', 'tarjeta', 'consulta')),
  carrier text,
  product_name text,
  phone text,
  email text,
  amount numeric(10,2),
  fee numeric(10,2),
  -- enviando   = registrado ANTES de enviar (si se queda así, la función murió a medio envío → tratar como pendiente)
  -- aprobada   = RNP respondió Exito
  -- rechazada  = RNP respondió con Error (no se cobró en RNP)
  -- pendiente  = sin respuesta / timeout / respuesta ilegible: NO reenviar; conciliar en el portal RNP
  -- no_enviada = rechazada por nosotros antes de enviar (validación, teléfono repetido < 5 min)
  -- ok / error = llamadas de solo lectura (saldo, productos)
  status text not null default 'enviando'
    check (status in ('enviando', 'aprobada', 'rechazada', 'pendiente', 'no_enviada', 'ok', 'error')),
  request_xml text,
  response_xml text,
  http_status integer,
  error_text text,
  autorizacion text,
  venta text,
  codigo text,
  nuevo_saldo numeric(12,2),
  rnp_fecha text,
  duration_ms integer,
  sale_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists rnp_transactions_org_created_idx on public.rnp_transactions (org_id, created_at desc);
create index if not exists rnp_transactions_phone_idx on public.rnp_transactions (org_id, phone, created_at desc) where phone is not null;
create index if not exists rnp_transactions_sale_idx on public.rnp_transactions (sale_id) where sale_id is not null;

alter table public.rnp_transactions enable row level security;

drop policy if exists rnp_transactions_admin_read on public.rnp_transactions;
create policy rnp_transactions_admin_read on public.rnp_transactions
  for select using (is_admin() and org_id = get_my_org_id());
-- No insert/update/delete policies: only the service role (edge function) writes.

revoke all on public.rnp_transactions from anon;

-- Request columns are frozen after insert; no deletes at all (conciliación).
create or replace function public.rnp_transactions_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'rnp_transactions es una bitácora: no se puede borrar';
  end if;
  if new.org_id is distinct from old.org_id
     or new.op_id is distinct from old.op_id
     or new.method is distinct from old.method
     or new.category is distinct from old.category
     or new.carrier is distinct from old.carrier
     or new.product_name is distinct from old.product_name
     or new.phone is distinct from old.phone
     or new.amount is distinct from old.amount
     or new.fee is distinct from old.fee
     or new.request_xml is distinct from old.request_xml
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'rnp_transactions: los datos de la petición no se pueden modificar';
  end if;
  -- A sale link, once set, is permanent.
  if old.sale_id is not null and new.sale_id is distinct from old.sale_id then
    raise exception 'rnp_transactions: la venta vinculada no se puede cambiar';
  end if;
  return new;
end;
$$;

drop trigger if exists rnp_transactions_guard_trg on public.rnp_transactions;
create trigger rnp_transactions_guard_trg
  before update or delete on public.rnp_transactions
  for each row execute function public.rnp_transactions_guard();

-- 2. Mark RNP service lines on the sale.
alter table public.sale_items add column if not exists rnp_op_id uuid;
create index if not exists sale_items_rnp_op_idx on public.sale_items (rnp_op_id) where rnp_op_id is not null;

-- 3. Catalog cache (obtenerProductos). Every successful RNP webservice
--    response may carry a cost, so the catalog is fetched at most ONCE per
--    category per 24 h per org and served from here to every cashier.
--    `refreshing_at` is a claim so two cashiers can't both refresh.
--    Service role only (RLS on, no policies).
create table if not exists public.rnp_catalog_cache (
  org_id uuid not null references public.organizations(id) on delete cascade,
  categoria text not null check (categoria in ('recargas', 'tarjetas', 'servicios', 'digitales', 'todos')),
  items jsonb not null default '[]'::jsonb,
  raw jsonb,
  fetched_at timestamptz not null default 'epoch',
  refreshing_at timestamptz,
  primary key (org_id, categoria)
);

alter table public.rnp_catalog_cache enable row level security;
revoke all on public.rnp_catalog_cache from anon, authenticated;
