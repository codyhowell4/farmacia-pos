-- ============================================================
-- Pulsera Apolo Básico — membership benefit at POS
-- ------------------------------------------------------------
-- 1) The 5 "Pulsera Fitness (COLOR)" products sell at $99 and are flagged
--    is_membership_pulsera so the POS/RPC can price them as a benefit.
-- 2) Each membership_members row tracks whether that member already
--    received their free pulsera (one per member, enforced server-side).
-- 3) validate_membership_checkout learns the membership_pulsera kind.
-- 4) restore_membership_sale_benefits releases the pulsera redemption on
--    void, alongside visits/revisions.
-- ============================================================

-- ── 1. Inventory flag + catalog price ───────────────────────
alter table inventory
  add column if not exists is_membership_pulsera boolean not null default false;

update inventory
   set is_membership_pulsera = true,
       price = 99,
       updated_at = now()
 where name ilike 'pulsera fitness%';

-- ── 2. Per-member redemption tracking ───────────────────────
alter table membership_members
  add column if not exists pulsera_redeemed_at timestamptz,
  add column if not exists pulsera_redeemed_sale_id uuid references sales(id);

create index if not exists membership_members_pulsera_sale_idx
  on membership_members(pulsera_redeemed_sale_id)
  where pulsera_redeemed_sale_id is not null;

-- ── 3. POS membership lookups expose the redemption flag ────
create or replace function public.pos_search_memberships(p_term text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_term text := lower(btrim(coalesce(p_term, '')));
begin
  if not is_org_staff() then
    raise exception 'Solo personal de la organización';
  end if;
  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    from (
      select
        m.id, m.plan_id, m.plan_type, m.status, m.discount_percent,
        m.visits_remaining, m.visits_limit,
        m.basic_trackers_included, m.basic_trackers_fulfilled,
        m.customer_id, m.created_at,
        jsonb_build_object('full_name', c.full_name, 'phone', c.phone, 'email', c.email) as customers,
        (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', mm.id, 'sub_id', mm.sub_id, 'name', mm.name, 'is_owner', mm.is_owner,
            'pulsera_redeemed_at', mm.pulsera_redeemed_at
          )), '[]'::jsonb)
          from membership_members mm
          where mm.membership_id = m.id
        ) as membership_members
      from memberships m
      join customers c on c.id = m.customer_id
      where m.org_id = get_my_org_id()
        and (
          v_term = ''
          or lower(m.plan_id) like '%' || v_term || '%'
          or lower(m.status) like '%' || v_term || '%'
          or lower(c.full_name) like '%' || v_term || '%'
          or lower(coalesce(c.phone, '')) like '%' || v_term || '%'
          or lower(coalesce(c.email, '')) like '%' || v_term || '%'
          or exists (
            select 1 from membership_members mm
            where mm.membership_id = m.id
              and (lower(mm.sub_id) like '%' || v_term || '%' or lower(mm.name) like '%' || v_term || '%')
          )
        )
      order by m.created_at desc
      limit 50
    ) t
  );
end;
$$;
grant execute on function public.pos_search_memberships(text) to authenticated;

create or replace function public.pos_get_membership(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_org_staff() then
    raise exception 'Solo personal de la organización';
  end if;
  return (
    select row_to_json(t)
    from (
      select
        m.id, m.plan_id, m.plan_type, m.status, m.discount_percent,
        m.visits_remaining, m.visits_limit,
        m.basic_trackers_included, m.basic_trackers_fulfilled,
        m.customer_id, m.created_at,
        jsonb_build_object('full_name', c.full_name, 'phone', c.phone, 'email', c.email) as customers,
        (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', mm.id, 'sub_id', mm.sub_id, 'name', mm.name, 'is_owner', mm.is_owner,
            'pulsera_redeemed_at', mm.pulsera_redeemed_at
          )), '[]'::jsonb)
          from membership_members mm
          where mm.membership_id = m.id
        ) as membership_members
      from memberships m
      join customers c on c.id = m.customer_id
      where m.id = p_id
        and m.org_id = get_my_org_id()
    ) t
  );
end;
$$;
grant execute on function public.pos_get_membership(uuid) to authenticated;

-- ── 4. Server-authoritative checkout validation: pulsera kind ─
create or replace function validate_membership_checkout(
  p_membership_id uuid,
  p_member_id uuid,
  p_items jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_membership record;
  v_item jsonb;
  v_inv record;
  v_qty int;
  v_free_qty int;
  v_paid_qty int;
  v_visits_left int;
  v_discount_base numeric := 0;
  v_results jsonb := '[]'::jsonb;
  v_consumed uuid[] := '{}';
  v_rev_ids uuid[];
  v_pulsera_free_claimed boolean := false;
begin
  select * into v_membership from memberships where id = p_membership_id;
  if v_membership is null then
    return jsonb_build_object('valid', false, 'reason', 'membership_not_found');
  end if;

  if v_membership.status <> 'active' then
    return jsonb_build_object(
      'valid', false,
      'reason', 'membership_not_active',
      'membership_status', v_membership.status
    );
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('valid', false, 'reason', 'invalid_items');
  end if;

  v_visits_left := v_membership.visits_remaining;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_qty := coalesce((v_item->>'qty')::int, 0);
      if v_qty < 1 then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_item->>'inventory_id', 'error', 'invalid_qty'));
        continue;
      end if;

      select id, name, price,
             is_membership_consultation, is_membership_revision, revision_type,
             is_membership_blood_pressure, is_membership_pulsera
        into v_inv
        from inventory
        where id = (v_item->>'inventory_id')::uuid;

      if v_inv is null then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_item->>'inventory_id', 'error', 'item_not_found'));
        continue;
      end if;

      if coalesce(v_inv.is_membership_consultation, false) then
        -- free consultas draw down visits in array order; extras at 50%
        v_free_qty := least(v_qty, v_visits_left);
        v_visits_left := v_visits_left - v_free_qty;
        v_paid_qty := v_qty - v_free_qty;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_inv.id,
          'name', v_inv.name,
          'kind', 'membership_consultation',
          'qty', v_qty,
          'free_qty', v_free_qty,
          'paid_qty', v_paid_qty,
          'free_unit_price', 0,
          'paid_unit_price', round(v_inv.price * 0.5, 2),
          'catalog_price', v_inv.price
        ));
        -- consultas are excluded from the 10% discount base

      elsif coalesce(v_inv.is_membership_revision, false) then
        -- claim the oldest pending revisions for the selected member,
        -- skipping ids already consumed by earlier lines in this array
        select coalesce(array_agg(r.id), '{}') into v_rev_ids
        from (
          select r.id
          from membership_revisions r
          where r.membership_id = p_membership_id
            and r.member_id = p_member_id
            and r.status = 'pending'
            and r.package_type = v_inv.revision_type
            and not (r.id = any (v_consumed))
          order by r.milestone, r.created_at
          limit v_qty
        ) r;

        if coalesce(array_length(v_rev_ids, 1), 0) < v_qty then
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'inventory_id', v_inv.id,
            'name', v_inv.name,
            'kind', 'membership_revision',
            'qty', v_qty,
            'error', 'no_revision_available',
            'available', coalesce(array_length(v_rev_ids, 1), 0),
            'catalog_price', v_inv.price
          ));
        else
          v_consumed := v_consumed || v_rev_ids;
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'inventory_id', v_inv.id,
            'name', v_inv.name,
            'kind', 'membership_revision',
            'qty', v_qty,
            'unit_price', 0,
            'revision_ids', to_jsonb(v_rev_ids),
            'catalog_price', v_inv.price
          ));
        end if;
        v_discount_base := v_discount_base + v_qty * v_inv.price;

      elsif coalesce(v_inv.is_membership_blood_pressure, false) then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_inv.id,
          'name', v_inv.name,
          'kind', 'membership_blood_pressure',
          'qty', v_qty,
          'unit_price', 0,
          'catalog_price', v_inv.price
        ));
        v_discount_base := v_discount_base + v_qty * v_inv.price;

      elsif coalesce(v_inv.is_membership_pulsera, false) then
        -- Pulsera Apolo Básico: the selected member's FIRST pulsera rides
        -- free; the redemption is tracked on membership_members so it can
        -- only be claimed once. Only one free pulsera per ticket: any
        -- additional pulsera line (other colors) validates at catalog.
        if not v_pulsera_free_claimed
           and p_member_id is not null
           and exists (
             select 1
               from membership_members mm
              where mm.id = p_member_id
                and mm.membership_id = p_membership_id
                and mm.pulsera_redeemed_at is null
           ) then
          v_pulsera_free_claimed := true;
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'inventory_id', v_inv.id,
            'name', v_inv.name,
            'kind', 'membership_pulsera',
            'qty', v_qty,
            'unit_price', 0,
            'catalog_price', v_inv.price
          ));
        else
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'inventory_id', v_inv.id,
            'name', v_inv.name,
            'kind', 'membership_pulsera',
            'qty', v_qty,
            'unit_price', v_inv.price,
            'catalog_price', v_inv.price
          ));
        end if;
        v_discount_base := v_discount_base + v_qty * v_inv.price;

      else
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'inventory_id', v_inv.id,
          'name', v_inv.name,
          'kind', 'regular',
          'qty', v_qty,
          'unit_price', v_inv.price,
          'catalog_price', v_inv.price
        ));
        v_discount_base := v_discount_base + v_qty * v_inv.price;
      end if;
    exception when others then
      -- malformed line (bad uuid, non-numeric qty, ...): report, keep going
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'inventory_id', v_item->>'inventory_id', 'error', 'invalid_line'));
    end;
  end loop;

  return jsonb_build_object(
    'valid', true,
    'membership_status', v_membership.status,
    'discount_percent', v_membership.discount_percent,
    'visits_remaining', v_membership.visits_remaining,
    'visits_remaining_after', v_visits_left,
    'items', v_results,
    'membership_discount_base', v_discount_base
  );
end;
$$;

-- ── 5. Void releases the pulsera redemption too ─────────────
create or replace function public.restore_membership_sale_benefits(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true), '') not like '%service_role%'
     and not public.is_org_staff() then
    raise exception 'not authorized';
  end if;
  perform public._impl_restore_membership_sale_benefits(p_sale_id);
  -- Pulsera benefit consumed by this ticket goes back to the member.
  update membership_members
     set pulsera_redeemed_at = null,
         pulsera_redeemed_sale_id = null
   where pulsera_redeemed_sale_id = p_sale_id;
end;
$$;
revoke all on function public.restore_membership_sale_benefits(uuid) from public;
revoke execute on function public.restore_membership_sale_benefits(uuid) from anon;
grant execute on function public.restore_membership_sale_benefits(uuid) to authenticated, service_role;

-- ── Verification (for the dashboard SQL editor result panel) ─
select id, name, price, is_membership_pulsera, quantity, location_id
  from inventory
 where name ilike 'pulsera fitness%'
 order by name;
