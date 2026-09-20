-- Final audit (round 3) — pen-test lockdown, 2026-09-21
-- The internal pen test (docs/FINAL_AUDIT_ROUND3.md) found financial,
-- inventory-valuation and staff-contact data readable ANONYMOUSLY because
-- (a) the report views ran as their definer (no security_invoker) and
-- (b) the live DB had drifted: RLS on expenses/manual_revenue was disabled
-- and their org_isolation policies were missing.
-- Fixes below change no app-code contracts: staff keep the same access via
-- base-table RLS; anonymous callers get nothing.

-- 1) expenses / manual_revenue: re-enable RLS + recreate org isolation
alter table public.expenses enable row level security;
alter table public.manual_revenue enable row level security;

drop policy if exists org_isolation on public.expenses;
create policy org_isolation on public.expenses
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

drop policy if exists org_isolation on public.manual_revenue;
create policy org_isolation on public.manual_revenue
  for all using (org_id = get_my_org_id())
  with check (org_id = get_my_org_id());

-- 2) Aggregate report views: run as the querying user (base-table RLS then
--    applies) and remove the anonymous grant outright.
alter view public.daily_sales_summary set (security_invoker = true);
alter view public.top_products set (security_invoker = true);
alter view public.dead_stock set (security_invoker = true);
alter view public.inventory_valuation set (security_invoker = true);
alter view public.profit_report set (security_invoker = true);

revoke select on public.daily_sales_summary from anon;
revoke select on public.top_products from anon;
revoke select on public.dead_stock from anon;
revoke select on public.inventory_valuation from anon;
revoke select on public.profit_report from anon;

-- 3) Shift views: same lockdown, recreated from the live definitions, and
--    cashier_name now masks values that hold an e-mail address (staff
--    Gmail addresses were leaking; LFPDPPP data minimization).
create or replace view public.sales_by_shift
with (security_invoker = true) as
with sales_summary as (
  select s.shift_id,
         count(*) as total_sales,
         sum(s.total) as total_revenue,
         sum(s.discount_amount) as total_discounts,
         sum(s.iva_amount) as total_tax
  from sales s
  where s.voided = false and s.shift_id is not null
  group by s.shift_id
),
payment_summary as (
  select s.shift_id,
         sum(sp.amount) filter (where sp.payment_method = 'cash') as total_cash,
         sum(sp.amount) filter (where sp.payment_method = 'card') as total_card,
         sum(sp.amount) filter (where sp.payment_method = 'transferencia') as total_transferencia,
         sum(sp.amount) filter (where sp.payment_method = 'insurance') as total_insurance
  from sales s
  join sale_payments sp on sp.sale_id = s.id
  where s.voided = false and s.shift_id is not null
  group by s.shift_id
)
select sh.id as shift_id,
       sh.org_id,
       sh.location_id,
       l.name as location_name,
       sh.opened_by as cashier_id,
       case when coalesce(sh.opened_by_name, p.full_name) like '%@%'
            then split_part(coalesce(sh.opened_by_name, p.full_name), '@', 1)
            else coalesce(sh.opened_by_name, p.full_name) end as cashier_name,
       sh.opened_at,
       sh.closed_at,
       sh.starting_cash,
       sh.closing_cash,
       sh.expected_cash,
       sh.variance,
       sh.status,
       sh.notes,
       coalesce(ss.total_sales, 0::bigint) as total_sales,
       coalesce(ss.total_revenue, 0::numeric) as total_revenue,
       coalesce(ss.total_discounts, 0::numeric) as total_discounts,
       coalesce(ss.total_tax, 0::numeric) as total_tax,
       coalesce(ps.total_cash, 0::numeric) as total_cash,
       coalesce(ps.total_card, 0::numeric) as total_card,
       coalesce(ps.total_transferencia, 0::numeric) as total_transferencia,
       coalesce(ps.total_insurance, 0::numeric) as total_insurance
from shifts sh
left join locations l on sh.location_id = l.id
left join profiles p on sh.opened_by = p.id
left join sales_summary ss on ss.shift_id = sh.id
left join payment_summary ps on ps.shift_id = sh.id
where sh.status = 'closed'
order by sh.closed_at desc;

revoke select on public.sales_by_shift from anon;

create or replace view public.shift_report
with (security_invoker = true) as
select sh.id,
       sh.org_id,
       sh.opened_by as cashier_id,
       case when coalesce(sh.opened_by_name, u.full_name) like '%@%'
            then split_part(coalesce(sh.opened_by_name, u.full_name), '@', 1)
            else coalesce(sh.opened_by_name, u.full_name) end as cashier_name,
       sh.opened_at as start_time,
       sh.closed_at as end_time,
       sh.starting_cash as initial_cash,
       sh.closing_cash as final_cash,
       sh.status,
       sh.notes,
       sh.total_sales,
       sh.total_revenue
from shifts sh
left join profiles u on sh.opened_by = u.id
order by sh.opened_at desc;

revoke select on public.shift_report from anon;

-- 4) inventory_catalog: the online store is compliance-paused, so nothing
--    anonymous needs the catalog (which also exposes on-hand quantity).
revoke select on public.inventory_catalog from anon;
