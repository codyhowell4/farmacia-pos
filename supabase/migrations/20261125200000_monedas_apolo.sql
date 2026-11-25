-- ============================================================
-- MIGRATION: Monedas Apolo — programa de lealtad (2026-11-25)
--
-- Coins (not pesos, NOT cash): earned for health goals, spent only on the
-- rewards ladder, redeemed by a cashier at the POS.
--
-- Privacy (LFPDPPP / aviso de privacidad v2):
--   · "Programas de lealtad" is a SECONDARY purpose → explicit opt-in
--     (coin_enrollments, with the consent text version and timestamp).
--   · Aviso §7: app health metrics, medicines and reminders stay on the
--     device. The ledger therefore records ONLY that a goal was met
--     (kind + coins + day/slot), never weights, step counts or medicine
--     names. Values never reach the server through this program.
--
-- Earning rules are enforced HERE (never trust the client):
--   earn_steps    2  once per day           (period: MX date)
--   earn_weight   3  once per ISO week      (period: IYYY-IW)
--   earn_dose     1  per dose, max 3/day, only within ±60 min of the
--                    scheduled time sent       (period: date + HH:MM)
--   earn_chequeo 10  per completed chequeo (staff side: appointment
--                    completed, or walk-in once/day)
--   earn_streak7 15  7 consecutive MX days with ≥1 goal; again after 7
--                    more days
-- All amounts live in coins_settings so they can be tuned later.
--
-- Additive: new tables/functions; appointments gains two nullable columns
-- (service, service_detail); get_queue_status re-created excluding
-- chequeo bookings from the doctor queue.
-- ============================================================

-- 0. Helpers ---------------------------------------------------------------
create or replace function public.coins_mx_today()
returns date language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date $$;

-- The customers row of the logged-in app user (one per auth user).
create or replace function public.coins_my_customer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.customers c where c.profile_id = auth.uid() order by c.created_at limit 1
$$;

-- 1. Settings ----------------------------------------------------------------
create table if not exists public.coins_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  program_active boolean not null default true,
  step_goal integer not null default 8000 check (step_goal between 1000 and 50000),
  step_entry_max integer not null default 40000 check (step_entry_max between 5000 and 100000),
  coins_steps integer not null default 2 check (coins_steps between 0 and 100),
  coins_weight integer not null default 3 check (coins_weight between 0 and 100),
  coins_dose integer not null default 1 check (coins_dose between 0 and 100),
  max_doses_per_day integer not null default 3 check (max_doses_per_day between 0 and 20),
  dose_window_minutes integer not null default 60 check (dose_window_minutes between 10 and 240),
  coins_chequeo integer not null default 10 check (coins_chequeo between 0 and 500),
  coins_streak7 integer not null default 15 check (coins_streak7 between 0 and 500),
  chequeo_price text not null default '[PRECIO]',
  updated_at timestamptz not null default now()
);
alter table public.coins_settings enable row level security;
drop policy if exists coins_settings_read on public.coins_settings;
create policy coins_settings_read on public.coins_settings for select using (true);
drop policy if exists coins_settings_admin_write on public.coins_settings;
create policy coins_settings_admin_write on public.coins_settings for update
  using (is_admin() and org_id = get_my_org_id()) with check (is_admin() and org_id = get_my_org_id());
revoke insert, delete, truncate on public.coins_settings from anon, authenticated;
revoke update on public.coins_settings from anon;

insert into public.coins_settings (org_id) select id from public.organizations on conflict do nothing;

-- 2. Rewards ladder (editable in Admin) ------------------------------------
create table if not exists public.coin_reward_tiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  sort integer not null default 0,
  coins integer not null check (coins > 0),
  title text not null check (length(title) between 2 and 120),
  kind text not null check (kind in ('percent', 'free_service', 'free_product', 'membership_month', 'device')),
  percent numeric(5,2) check (percent is null or (percent > 0 and percent <= 100)),
  cap_amount numeric(10,2) check (cap_amount is null or cap_amount >= 0),
  applies_to text[] not null default '{}',   -- chequeo tests a free_service covers: presion, glucosa, peso
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or percent is not null)
);
create index if not exists coin_reward_tiers_org_idx on public.coin_reward_tiers (org_id, coins);
alter table public.coin_reward_tiers enable row level security;
drop policy if exists coin_reward_tiers_read on public.coin_reward_tiers;
create policy coin_reward_tiers_read on public.coin_reward_tiers for select using (true);
drop policy if exists coin_reward_tiers_admin_write on public.coin_reward_tiers;
create policy coin_reward_tiers_admin_write on public.coin_reward_tiers for all
  using (is_admin() and org_id = get_my_org_id()) with check (is_admin() and org_id = get_my_org_id());
revoke all on public.coin_reward_tiers from anon;
grant select on public.coin_reward_tiers to anon;

insert into public.coin_reward_tiers (org_id, sort, coins, title, kind, percent, cap_amount, applies_to)
select o.id, t.sort, t.coins, t.title, t.kind, t.percent, t.cap, t.applies
from public.organizations o
cross join (values
  (1,   50, '5% de descuento en una compra (tope $100)',                'percent',          5::numeric,  100::numeric, '{}'::text[]),
  (2,  100, 'Toma de presión gratis',                                    'free_service',     null,        null,         '{presion}'::text[]),
  (3,  150, 'Toma de glucosa gratis',                                    'free_service',     null,        null,         '{glucosa}'::text[]),
  (4,  250, '10% de descuento en una compra (tope $300)',               'percent',          10,          300,          '{}'),
  (5,  350, 'Chequeo completo gratis (presión, glucosa, peso e IMC)',   'free_service',     null,        null,         '{presion,glucosa,peso}'),
  (6,  500, 'Producto de bienestar gratis hasta $80',                   'free_product',     null,        80,           '{}'),
  (7,  700, '15% de descuento en una compra (tope $500)',               'percent',          15,          500,          '{}'),
  (8, 1000, 'Consulta general gratis',                                   'free_service',     null,        null,         '{consulta}'),
  (9, 1500, 'Un mes de membresía gratis',                                'membership_month', null,        null,         '{}'),
  (10,2500, 'Baumanómetro digital o glucómetro gratis',                  'device',           null,        null,         '{}')
) as t(sort, coins, title, kind, percent, cap, applies)
where not exists (select 1 from public.coin_reward_tiers x where x.org_id = o.id);

-- 3. Enrollment (explicit opt-in) + register code -----------------------------
create table if not exists public.coin_enrollments (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  consent_version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (org_id, code)
);
alter table public.coin_enrollments enable row level security;
drop policy if exists coin_enrollments_own on public.coin_enrollments;
create policy coin_enrollments_own on public.coin_enrollments for select
  using (customer_id in (select c.id from public.customers c where c.profile_id = auth.uid()));
drop policy if exists coin_enrollments_staff on public.coin_enrollments;
create policy coin_enrollments_staff on public.coin_enrollments for select
  using (is_org_staff() and org_id = get_my_org_id());
revoke all on public.coin_enrollments from anon;
revoke insert, update, delete, truncate on public.coin_enrollments from authenticated;

-- 4. Ledger ----------------------------------------------------------------------
create table if not exists public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null check (kind in ('earn_steps', 'earn_weight', 'earn_dose', 'earn_chequeo', 'earn_streak7', 'redeem', 'redeem_reversal', 'adjust')),
  coins integer not null check (coins <> 0),
  day date not null default public.coins_mx_today(),
  period_key text not null,
  label text,                 -- display text; never a health value
  ref_id uuid,                -- redemption / appointment
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (customer_id, kind, period_key)
);
create index if not exists coin_ledger_customer_idx on public.coin_ledger (customer_id, created_at desc);
create index if not exists coin_ledger_customer_day_idx on public.coin_ledger (customer_id, day);
alter table public.coin_ledger enable row level security;
drop policy if exists coin_ledger_own on public.coin_ledger;
create policy coin_ledger_own on public.coin_ledger for select
  using (customer_id in (select c.id from public.customers c where c.profile_id = auth.uid()));
drop policy if exists coin_ledger_staff on public.coin_ledger;
create policy coin_ledger_staff on public.coin_ledger for select
  using (is_org_staff() and org_id = get_my_org_id());
revoke all on public.coin_ledger from anon;
revoke insert, update, delete, truncate on public.coin_ledger from authenticated;

-- Append-only. A delete cascaded from customers (ARCO cancellation, test
-- purge) runs inside the RI trigger (depth > 1) and is allowed.
create or replace function public.coin_ledger_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'coin_ledger es de solo inserción';
end $$;
drop trigger if exists coin_ledger_append_only_trg on public.coin_ledger;
create trigger coin_ledger_append_only_trg before update or delete on public.coin_ledger
  for each row execute function public.coin_ledger_append_only();

-- 5. Redemptions -------------------------------------------------------------------
create table if not exists public.coin_redemptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  tier_id uuid references public.coin_reward_tiers(id) on delete set null,
  coins integer not null check (coins > 0),
  title text not null,
  kind text not null,
  percent numeric(5,2),
  cap_amount numeric(10,2),
  status text not null default 'redeemed' check (status in ('redeemed', 'cancelled')),
  sale_id uuid references public.sales(id) on delete set null,
  location_id uuid,
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_by_name text,
  redeemed_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_by_name text,
  cancelled_at timestamptz,
  cancel_reason text
);
create index if not exists coin_redemptions_org_idx on public.coin_redemptions (org_id, redeemed_at desc);
create index if not exists coin_redemptions_customer_idx on public.coin_redemptions (customer_id, redeemed_at desc);
alter table public.coin_redemptions enable row level security;
drop policy if exists coin_redemptions_own on public.coin_redemptions;
create policy coin_redemptions_own on public.coin_redemptions for select
  using (customer_id in (select c.id from public.customers c where c.profile_id = auth.uid()));
drop policy if exists coin_redemptions_staff on public.coin_redemptions;
create policy coin_redemptions_staff on public.coin_redemptions for select
  using (is_org_staff() and org_id = get_my_org_id());
revoke all on public.coin_redemptions from anon;
revoke insert, update, delete, truncate on public.coin_redemptions from authenticated;

-- 6. Core: balance, streak, award --------------------------------------------------
create or replace function public.coins_balance(p_customer uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(coins), 0)::int from public.coin_ledger where customer_id = p_customer
$$;
revoke all on function public.coins_balance(uuid) from public, anon, authenticated;

-- Consecutive MX days with ≥1 goal (steps/weight/dose/chequeo), ending
-- today — or yesterday when nothing has been done yet today.
create or replace function public.coins_streak(p_customer uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_day date := public.coins_mx_today();
  v_n int := 0;
begin
  if not exists (select 1 from public.coin_ledger where customer_id = p_customer and day = v_day
                 and kind in ('earn_steps', 'earn_weight', 'earn_dose', 'earn_chequeo')) then
    v_day := v_day - 1;
  end if;
  while exists (select 1 from public.coin_ledger where customer_id = p_customer and day = v_day
                and kind in ('earn_steps', 'earn_weight', 'earn_dose', 'earn_chequeo')) loop
    v_n := v_n + 1;
    v_day := v_day - 1;
    exit when v_n >= 400;
  end loop;
  return v_n;
end $$;
revoke all on function public.coins_streak(uuid) from public, anon, authenticated;

-- Internal award (no auth checks: callers check). Returns coins awarded
-- (0 when the period was already used). Also grants the 7-day streak bonus.
create or replace function public.coins_award_internal(
  p_customer uuid, p_kind text, p_coins int, p_period text, p_label text,
  p_ref uuid default null, p_by uuid default null, p_by_name text default null
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_inserted int := 0;
  v_today date := public.coins_mx_today();
  v_bonus int;
begin
  select org_id into v_org from public.coin_enrollments where customer_id = p_customer and revoked_at is null;
  if v_org is null or coalesce(p_coins, 0) <= 0 then
    return 0;
  end if;
  insert into public.coin_ledger (org_id, customer_id, kind, coins, day, period_key, label, ref_id, created_by, created_by_name)
  values (v_org, p_customer, p_kind, p_coins, v_today, p_period, p_label, p_ref, p_by, p_by_name)
  on conflict (customer_id, kind, period_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 0;
  end if;

  -- 7-day streak bonus: a fresh 7-day run since the last bonus.
  if p_kind in ('earn_steps', 'earn_weight', 'earn_dose', 'earn_chequeo')
     and public.coins_streak(p_customer) >= 7
     and not exists (select 1 from public.coin_ledger where customer_id = p_customer and kind = 'earn_streak7' and day > v_today - 7) then
    select coins_streak7 into v_bonus from public.coins_settings where org_id = v_org;
    if coalesce(v_bonus, 0) > 0 then
      insert into public.coin_ledger (org_id, customer_id, kind, coins, day, period_key, label)
      values (v_org, p_customer, 'earn_streak7', v_bonus, v_today, v_today::text, 'Racha de 7 días')
      on conflict do nothing;
    end if;
  end if;
  return p_coins;
end $$;
revoke all on function public.coins_award_internal(uuid, text, int, text, text, uuid, uuid, text) from public, anon, authenticated;

-- 7. Customer RPCs -------------------------------------------------------------------
create or replace function public.coins_enroll(p_consent_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cust public.customers%rowtype;
  v_code text;
  v_try int := 0;
begin
  select * into v_cust from public.customers where id = public.coins_my_customer_id();
  if v_cust.id is null then
    raise exception 'Necesitas una cuenta de cliente para usar Monedas Apolo';
  end if;
  if coalesce(btrim(p_consent_version), '') = '' or length(p_consent_version) > 60 then
    raise exception 'Falta el consentimiento';
  end if;
  if exists (select 1 from public.coin_enrollments where customer_id = v_cust.id) then
    update public.coin_enrollments
      set revoked_at = null, consent_version = p_consent_version, accepted_at = now()
      where customer_id = v_cust.id;
  else
    loop
      v_try := v_try + 1;
      v_code := translate(upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), '01', 'XY');
      begin
        insert into public.coin_enrollments (customer_id, org_id, code, consent_version)
        values (v_cust.id, v_cust.org_id, v_code, p_consent_version);
        exit;
      exception when unique_violation then
        if v_try > 10 then raise; end if;
      end;
    end loop;
  end if;
  insert into public.audit_log (org_id, user_id, user_name, user_role, action, details)
  values (v_cust.org_id, auth.uid(), v_cust.full_name, 'customer', 'MONEDAS_ALTA', 'Aceptó Monedas Apolo (' || p_consent_version || ')');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.coins_unenroll()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.coins_my_customer_id(); v_org uuid; v_name text;
begin
  update public.coin_enrollments set revoked_at = now() where customer_id = v_id and revoked_at is null
  returning org_id into v_org;
  if v_org is not null then
    select full_name into v_name from public.customers where id = v_id;
    insert into public.audit_log (org_id, user_id, user_name, user_role, action, details)
    values (v_org, auth.uid(), v_name, 'customer', 'MONEDAS_BAJA', 'Retiró su consentimiento de Monedas Apolo');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Claim a goal. p_kind: 'steps' | 'weight' | 'dose'. p_slot (dose only):
-- the scheduled time 'HH:MM'. Only the fact that the goal was met is sent.
create or replace function public.coins_claim(p_kind text, p_slot text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid := public.coins_my_customer_id();
  v_org uuid;
  s public.coins_settings%rowtype;
  v_today date := public.coins_mx_today();
  v_now_min int := extract(hour from (now() at time zone 'America/Mexico_City'))::int * 60
                   + extract(minute from (now() at time zone 'America/Mexico_City'))::int;
  v_slot_min int;
  v_awarded int := 0;
  v_doses int;
begin
  if v_cust is null then raise exception 'Inicia sesión para ganar Monedas'; end if;
  select org_id into v_org from public.coin_enrollments where customer_id = v_cust and revoked_at is null;
  if v_org is null then raise exception 'Activa Monedas Apolo para empezar a ganar'; end if;
  select * into s from public.coins_settings where org_id = v_org;
  if not coalesce(s.program_active, true) then raise exception 'Monedas Apolo está en pausa'; end if;

  if p_kind = 'steps' then
    v_awarded := public.coins_award_internal(v_cust, 'earn_steps', s.coins_steps, v_today::text, 'Meta de pasos del día');
  elsif p_kind = 'weight' then
    v_awarded := public.coins_award_internal(v_cust, 'earn_weight', s.coins_weight, to_char(v_today, 'IYYY-IW'), 'Actualizaste tu peso');
  elsif p_kind = 'dose' then
    if p_slot is null or p_slot !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'Horario de toma inválido';
    end if;
    v_slot_min := split_part(p_slot, ':', 1)::int * 60 + split_part(p_slot, ':', 2)::int;
    if abs(v_now_min - v_slot_min) > s.dose_window_minutes then
      return jsonb_build_object('ok', true, 'awarded', 0, 'reason', 'fuera_de_horario');
    end if;
    select count(*) into v_doses from public.coin_ledger where customer_id = v_cust and kind = 'earn_dose' and day = v_today;
    if v_doses >= s.max_doses_per_day then
      return jsonb_build_object('ok', true, 'awarded', 0, 'reason', 'tope_diario');
    end if;
    v_awarded := public.coins_award_internal(v_cust, 'earn_dose', s.coins_dose, v_today::text || ' ' || p_slot, 'Medicina a tiempo');
  else
    raise exception 'Meta inválida';
  end if;
  return jsonb_build_object('ok', true, 'awarded', v_awarded, 'reason', case when v_awarded = 0 then 'ya_registrada' end,
                            'balance', public.coins_balance(v_cust), 'streak', public.coins_streak(v_cust));
end $$;

-- Everything the app needs in one call.
create or replace function public.coins_my_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cust public.customers%rowtype;
  e public.coin_enrollments%rowtype;
  s public.coins_settings%rowtype;
  v_today date := public.coins_mx_today();
begin
  select * into v_cust from public.customers where id = public.coins_my_customer_id();
  if v_cust.id is null then
    return jsonb_build_object('customer', false);
  end if;
  select * into e from public.coin_enrollments where customer_id = v_cust.id;
  select * into s from public.coins_settings where org_id = v_cust.org_id;
  return jsonb_build_object(
    'customer', true,
    'enrolled', e.customer_id is not null and e.revoked_at is null,
    'code', case when e.revoked_at is null then e.code end,
    'balance', public.coins_balance(v_cust.id),
    'streak', public.coins_streak(v_cust.id),
    'settings', jsonb_build_object(
      'program_active', coalesce(s.program_active, true), 'step_goal', coalesce(s.step_goal, 8000), 'step_entry_max', coalesce(s.step_entry_max, 40000),
      'coins_steps', coalesce(s.coins_steps, 2), 'coins_weight', coalesce(s.coins_weight, 3), 'coins_dose', coalesce(s.coins_dose, 1),
      'max_doses_per_day', coalesce(s.max_doses_per_day, 3), 'dose_window_minutes', coalesce(s.dose_window_minutes, 60),
      'coins_chequeo', coalesce(s.coins_chequeo, 10), 'coins_streak7', coalesce(s.coins_streak7, 15), 'chequeo_price', coalesce(s.chequeo_price, '[PRECIO]')),
    'today', jsonb_build_object(
      'date', v_today,
      'steps', exists (select 1 from public.coin_ledger where customer_id = v_cust.id and kind = 'earn_steps' and period_key = v_today::text),
      'weight_week', exists (select 1 from public.coin_ledger where customer_id = v_cust.id and kind = 'earn_weight' and period_key = to_char(v_today, 'IYYY-IW')),
      'dose_slots', coalesce((select jsonb_agg(split_part(period_key, ' ', 2)) from public.coin_ledger where customer_id = v_cust.id and kind = 'earn_dose' and day = v_today), '[]'::jsonb),
      'earned', coalesce((select sum(coins) from public.coin_ledger where customer_id = v_cust.id and day = v_today and coins > 0), 0)),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'coins', t.coins, 'title', t.title, 'kind', t.kind, 'percent', t.percent, 'cap_amount', t.cap_amount, 'applies_to', t.applies_to) order by t.coins)
                       from public.coin_reward_tiers t where t.org_id = v_cust.org_id and t.active), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(h order by h.created_at desc) from (
                         select l.kind, l.coins, l.label, l.day, l.created_at from public.coin_ledger l
                         where l.customer_id = v_cust.id order by l.created_at desc limit 50) h), '[]'::jsonb)
  );
end $$;

-- 8. Staff RPCs (POS / Admin) ---------------------------------------------------------
create or replace function public.coins_staff_lookup(p_query text)
returns table (customer_id uuid, full_name text, phone text, code text, enrolled boolean, balance integer)
language plpgsql stable security definer set search_path = public as $$
declare v_q text := btrim(coalesce(p_query, ''));
begin
  if not is_org_staff() then raise exception 'Solo personal de la organización'; end if;
  if length(v_q) < 3 then return; end if;
  return query
    select c.id, c.full_name, c.phone, e.code, (e.customer_id is not null and e.revoked_at is null), public.coins_balance(c.id)
    from public.customers c
    left join public.coin_enrollments e on e.customer_id = c.id
    where c.org_id = get_my_org_id()
      and (upper(e.code) = upper(v_q) or c.full_name ilike '%' || v_q || '%' or c.phone ilike '%' || v_q || '%')
    order by (upper(e.code) = upper(v_q)) desc nulls last, c.full_name
    limit 20;
end $$;

create or replace function public.coins_redeem(p_customer uuid, p_tier uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.coin_enrollments%rowtype;
  t public.coin_reward_tiers%rowtype;
  v_bal int;
  v_name text;
  v_red uuid;
  v_cust_name text;
begin
  if not is_org_staff() then raise exception 'Solo personal de la organización'; end if;
  select * into e from public.coin_enrollments where customer_id = p_customer for update;
  if e.customer_id is null or e.org_id is distinct from get_my_org_id() then raise exception 'Cliente sin Monedas Apolo'; end if;
  if e.revoked_at is not null then raise exception 'El cliente retiró su consentimiento de Monedas Apolo'; end if;
  select * into t from public.coin_reward_tiers where id = p_tier and org_id = e.org_id and active;
  if t.id is null then raise exception 'Recompensa no disponible'; end if;
  v_bal := public.coins_balance(p_customer);
  if v_bal < t.coins then raise exception 'Monedas insuficientes (tiene %, necesita %)', v_bal, t.coins; end if;
  select coalesce(full_name, '') into v_name from public.profiles where id = auth.uid();
  insert into public.coin_redemptions (org_id, customer_id, tier_id, coins, title, kind, percent, cap_amount, redeemed_by, redeemed_by_name)
  values (e.org_id, p_customer, t.id, t.coins, t.title, t.kind, t.percent, t.cap_amount, auth.uid(), v_name)
  returning id into v_red;
  insert into public.coin_ledger (org_id, customer_id, kind, coins, period_key, label, ref_id, created_by, created_by_name)
  values (e.org_id, p_customer, 'redeem', -t.coins, v_red::text, 'Canje: ' || t.title, v_red, auth.uid(), v_name);
  select full_name into v_cust_name from public.customers where id = p_customer;
  insert into public.audit_log (org_id, user_id, user_name, action, details)
  values (e.org_id, auth.uid(), v_name, 'MONEDAS_CANJE', format('%s canjeó %s Monedas: %s', v_cust_name, t.coins, t.title));
  return jsonb_build_object('ok', true, 'redemption_id', v_red, 'title', t.title, 'kind', t.kind, 'percent', t.percent,
                            'cap_amount', t.cap_amount, 'coins', t.coins, 'balance', public.coins_balance(p_customer));
end $$;

create or replace function public.coins_cancel_redemption(p_redemption uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.coin_redemptions%rowtype; v_name text;
begin
  if not is_org_staff() then raise exception 'Solo personal de la organización'; end if;
  select * into r from public.coin_redemptions where id = p_redemption for update;
  if r.id is null or r.org_id is distinct from get_my_org_id() then raise exception 'Canje no encontrado'; end if;
  if r.status <> 'redeemed' then raise exception 'El canje ya fue cancelado'; end if;
  if r.sale_id is not null then raise exception 'El canje ya se aplicó a una venta'; end if;
  if r.redeemed_at < now() - interval '24 hours' then raise exception 'Solo se puede cancelar un canje dentro de 24 horas'; end if;
  select coalesce(full_name, '') into v_name from public.profiles where id = auth.uid();
  update public.coin_redemptions set status = 'cancelled', cancelled_by = auth.uid(), cancelled_by_name = v_name,
    cancelled_at = now(), cancel_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300) where id = r.id;
  insert into public.coin_ledger (org_id, customer_id, kind, coins, period_key, label, ref_id, created_by, created_by_name)
  values (r.org_id, r.customer_id, 'redeem_reversal', r.coins, r.id::text, 'Canje cancelado: ' || r.title, r.id, auth.uid(), v_name);
  insert into public.audit_log (org_id, user_id, user_name, action, details)
  values (r.org_id, auth.uid(), v_name, 'MONEDAS_CANJE_CANCELADO', format('Canje cancelado (%s Monedas devueltas): %s', r.coins, r.title));
  return jsonb_build_object('ok', true, 'balance', public.coins_balance(r.customer_id));
end $$;

create or replace function public.coins_link_redemption_sale(p_redemption uuid, p_sale uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.coin_redemptions%rowtype;
begin
  if not is_org_staff() then raise exception 'Solo personal de la organización'; end if;
  select * into r from public.coin_redemptions where id = p_redemption for update;
  if r.id is null or r.org_id is distinct from get_my_org_id() then raise exception 'Canje no encontrado'; end if;
  if r.sale_id is not null or r.status <> 'redeemed' then return jsonb_build_object('ok', true); end if;
  if not exists (select 1 from public.sales where id = p_sale and org_id = r.org_id) then raise exception 'Venta no encontrada'; end if;
  update public.coin_redemptions set sale_id = p_sale where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- 9. Chequeo en sucursal --------------------------------------------------------------
alter table public.appointments
  add column if not exists service text check (service is null or service in ('chequeo')),
  add column if not exists service_detail jsonb;

-- Customers may set service/service_detail only when creating the
-- appointment; afterwards only staff may change them (a customer can't turn
-- a consulta into a chequeo to collect coins).
create or replace function public.appointments_service_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_org_staff() or auth.uid() is null then
    return new;
  end if;
  if new.service is distinct from old.service or new.service_detail is distinct from old.service_detail then
    raise exception 'No puedes modificar el tipo de servicio de la cita';
  end if;
  return new;
end $$;
drop trigger if exists appointments_service_guard_trg on public.appointments;
create trigger appointments_service_guard_trg before update on public.appointments
  for each row execute function public.appointments_service_guard();

-- Completed chequeo → coins (once per appointment), whoever completes it.
create or replace function public.appointments_chequeo_coins()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_coins int; v_org uuid; v_name text;
begin
  if new.service = 'chequeo' and new.status = 'completed' and old.status is distinct from 'completed' and new.customer_id is not null then
    select s.coins_chequeo, s.org_id into v_coins, v_org from public.coins_settings s where s.org_id = new.org_id;
    select coalesce(full_name, '') into v_name from public.profiles where id = auth.uid();
    perform public.coins_award_internal(new.customer_id, 'earn_chequeo', coalesce(v_coins, 10), 'appt:' || new.id::text,
                                        'Chequeo en sucursal', new.id, auth.uid(), v_name);
  end if;
  return new;
end $$;
drop trigger if exists appointments_chequeo_coins_trg on public.appointments;
create trigger appointments_chequeo_coins_trg after update of status on public.appointments
  for each row execute function public.appointments_chequeo_coins();

-- POS / staff: complete today's chequeo for a customer (marks the booked
-- chequeo completed, or records a walk-in chequeo once per day).
create or replace function public.coins_complete_chequeo(p_customer uuid, p_appointment uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_coins int; v_name text; v_awarded int; v_appt uuid;
begin
  if not is_org_staff() then raise exception 'Solo personal de la organización'; end if;
  select org_id into v_org from public.customers where id = p_customer;
  if v_org is null or v_org is distinct from get_my_org_id() then raise exception 'Cliente no encontrado'; end if;
  select coalesce(full_name, '') into v_name from public.profiles where id = auth.uid();
  if p_appointment is not null then
    select id into v_appt from public.appointments
      where id = p_appointment and customer_id = p_customer and service = 'chequeo' and status <> 'cancelled';
    if v_appt is null then raise exception 'Cita de chequeo no encontrada'; end if;
    update public.appointments set status = 'completed' where id = v_appt and status <> 'completed';
    v_awarded := coalesce((select coins from public.coin_ledger where customer_id = p_customer and kind = 'earn_chequeo' and period_key = 'appt:' || v_appt::text), 0);
  else
    select coins_chequeo into v_coins from public.coins_settings where org_id = v_org;
    v_awarded := public.coins_award_internal(p_customer, 'earn_chequeo', coalesce(v_coins, 10), 'walkin:' || public.coins_mx_today()::text,
                                            'Chequeo en sucursal', null, auth.uid(), v_name);
  end if;
  insert into public.audit_log (org_id, user_id, user_name, action, details)
  values (v_org, auth.uid(), v_name, 'MONEDAS_CHEQUEO', format('Chequeo completado registrado (%s Monedas)', v_awarded));
  return jsonb_build_object('ok', true, 'awarded', v_awarded, 'balance', public.coins_balance(p_customer));
end $$;

-- Today's / upcoming chequeo bookings of a customer (POS dialog).
create or replace function public.coins_staff_chequeos(p_customer uuid)
returns table (id uuid, appointment_date timestamptz, status text, service_detail jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_org_staff() then raise exception 'Solo personal de la organización'; end if;
  return query select a.id, a.appointment_date, a.status, a.service_detail from public.appointments a
    where a.customer_id = p_customer and a.org_id = get_my_org_id() and a.service = 'chequeo'
      and a.status in ('pending', 'confirmed')
      and a.appointment_date >= now() - interval '1 day'
    order by a.appointment_date limit 10;
end $$;

-- 10. Doctor queue ignores chequeo bookings (same output as before) ----------
create or replace function public.get_queue_status(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_doctors int;
  v_waiting int;
  v_in_consulta int;
  v_consult_minutes int := 27;
  v_video_minutes int := 18;
  v_est int;
  v_today date := (now() at time zone 'America/Mexico_City')::date;
begin
  select count(distinct doctor_id) into v_doctors
  from doctor_shifts
  where org_id = p_org_id
    and clock_out_at is null;

  select count(*) into v_waiting
  from appointments
  where org_id = p_org_id
    and type = 'in_person'
    and service is distinct from 'chequeo'
    and status in ('pending', 'confirmed')
    and (appointment_date at time zone 'America/Mexico_City')::date = v_today;

  select count(*) into v_in_consulta
  from appointments
  where org_id = p_org_id
    and status = 'in_consulta'
    and service is distinct from 'chequeo'
    and (appointment_date at time zone 'America/Mexico_City')::date = v_today;

  if v_doctors > 0 then
    v_est := ceil(v_waiting::numeric / v_doctors) * v_consult_minutes;
    v_est := (round(v_est / 5.0) * 5)::int;
  else
    v_est := null;
  end if;

  return jsonb_build_object(
    'doctors_on_clock', v_doctors,
    'waiting', v_waiting,
    'in_consulta', v_in_consulta,
    'consult_minutes', v_consult_minutes,
    'video_consult_minutes', v_video_minutes,
    'estimated_wait_minutes', v_est
  );
end;
$$;

-- 11. Grants ------------------------------------------------------------------------
revoke all on function public.coins_enroll(text) from public, anon;
revoke all on function public.coins_unenroll() from public, anon;
revoke all on function public.coins_claim(text, text) from public, anon;
revoke all on function public.coins_my_status() from public, anon;
revoke all on function public.coins_staff_lookup(text) from public, anon;
revoke all on function public.coins_redeem(uuid, uuid) from public, anon;
revoke all on function public.coins_cancel_redemption(uuid, text) from public, anon;
revoke all on function public.coins_link_redemption_sale(uuid, uuid) from public, anon;
revoke all on function public.coins_complete_chequeo(uuid, uuid) from public, anon;
revoke all on function public.coins_staff_chequeos(uuid) from public, anon;
revoke all on function public.coins_my_customer_id() from public, anon;
grant execute on function public.coins_enroll(text), public.coins_unenroll(), public.coins_claim(text, text), public.coins_my_status(),
  public.coins_staff_lookup(text), public.coins_redeem(uuid, uuid), public.coins_cancel_redemption(uuid, text),
  public.coins_link_redemption_sale(uuid, uuid), public.coins_complete_chequeo(uuid, uuid), public.coins_staff_chequeos(uuid),
  public.coins_my_customer_id() to authenticated;
