-- ============================================================
-- Membership revisions + 6-month check-up tracking
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Count successful monthly payments so we know when 6/12/18/24… milestones are reached.
alter table memberships
  add column if not exists payments_made integer not null default 0;

-- 2. Track per-member revision entitlements.
create table if not exists membership_revisions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  member_id uuid references membership_members(id) on delete cascade,
  milestone integer not null,
  package_type text not null check (package_type in ('bh_ego', 'qs12e')),
  status text not null default 'pending' check (status in ('pending', 'used', 'expired')),
  sale_id uuid references sales(id) on delete set null,
  created_at timestamptz default now(),
  used_at timestamptz,
  unique (membership_id, member_id, milestone)
);

create index if not exists membership_revisions_membership_id_idx on membership_revisions(membership_id);
create index if not exists membership_revisions_member_id_idx on membership_revisions(member_id);
create index if not exists membership_revisions_status_idx on membership_revisions(status);

-- 3. Inventory flags for the two revision bundles and the free blood-pressure service.
alter table inventory
  add column if not exists is_membership_revision boolean default false,
  add column if not exists revision_type text check (revision_type in ('bh_ego', 'qs12e')),
  add column if not exists is_membership_blood_pressure boolean default false;

-- 4. Make sure the notifications table exists (used for in-app customer alerts).
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  type text,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  related_id uuid,
  related_table text,
  created_at timestamptz default now()
);

alter table notifications add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table notifications add column if not exists customer_id uuid references customers(id) on delete cascade;
alter table notifications add column if not exists profile_id uuid references profiles(id) on delete cascade;
alter table notifications add column if not exists type text;
alter table notifications add column if not exists title text;
alter table notifications add column if not exists message text;
alter table notifications add column if not exists is_read boolean default false;
alter table notifications add column if not exists related_id uuid;
alter table notifications add column if not exists related_table text;
alter table notifications add column if not exists created_at timestamptz default now();

create index if not exists notifications_customer_id_idx on notifications(customer_id);
create index if not exists notifications_profile_id_idx on notifications(profile_id);
create index if not exists notifications_is_read_idx on notifications(is_read);

alter table notifications enable row level security;

drop policy if exists "notifications_customer" on notifications;
create policy "notifications_customer" on notifications
  for all using (
    customer_id in (select id from customers where profile_id = auth.uid())
    or profile_id = auth.uid()
  )
  with check (
    customer_id in (select id from customers where profile_id = auth.uid())
    or profile_id = auth.uid()
  );

-- 5. Record a successful monthly payment, reload visits, and create pending revisions at 6-month milestones.
create or replace function record_membership_payment(p_membership_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_membership record;
  v_milestone int;
  v_package text;
  v_member record;
  v_created int := 0;
  v_package_label text;
begin
  select * into v_membership from memberships where id = p_membership_id;
  if v_membership is null then
    raise exception 'Membership % not found', p_membership_id;
  end if;

  update memberships
    set payments_made = coalesce(payments_made, 0) + 1,
        status = 'active',
        visits_remaining = visits_limit,
        updated_at = now()
    where id = p_membership_id
    returning * into v_membership;

  v_milestone := v_membership.payments_made;

  if v_milestone % 6 = 0 then
    v_package := case when v_milestone % 12 = 0 then 'qs12e' else 'bh_ego' end;
    v_package_label := case v_package
      when 'bh_ego' then 'Biometría Hemática, Examen General de Orina y Consulta'
      else 'Química Sanguínea de 12 elementos y Consulta'
    end;

    for v_member in select * from membership_members where membership_id = p_membership_id loop
      with ins as (
        insert into membership_revisions (membership_id, member_id, milestone, package_type, status)
        values (p_membership_id, v_member.id, v_milestone, v_package, 'pending')
        on conflict (membership_id, member_id, milestone) do nothing
        returning id
      )
      select v_created + count(*) into v_created from ins;
    end loop;

    -- Email the owner through the existing notification_queue processor.
    insert into notification_queue (org_id, channel, recipient, template, payload, scheduled_for)
    select
      v_membership.org_id,
      'email',
      c.email,
      'membership_revision',
      jsonb_build_object(
        'membership_id', v_membership.id,
        'plan_id', v_membership.plan_id,
        'patient_name', c.full_name,
        'milestone', v_milestone,
        'package_type', v_package,
        'package_label', v_package_label
      ),
      now()
    from customers c
    where c.id = v_membership.customer_id and c.email is not null;

    -- In-app notification for the customer portal.
    insert into notifications (org_id, customer_id, type, title, message, related_id, related_table)
    select
      v_membership.org_id,
      v_membership.customer_id,
      'membership_revision',
      'Revisión de membresía disponible',
      'Tienes una revisión del mes ' || v_milestone || ' disponible: ' || v_package_label || '.',
      v_membership.id,
      'memberships'
    where v_membership.customer_id is not null;
  end if;

  return jsonb_build_object(
    'payments_made', v_membership.payments_made,
    'milestone', v_milestone,
    'package_type', v_package,
    'revisions_created', v_created
  );
end;
$$;

grant execute on function record_membership_payment(uuid) to authenticated, anon;

-- 6. Mark a pending revision as used when it is rung up in the POS.
create or replace function use_membership_revision(p_revision_id uuid, p_sale_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update membership_revisions
    set status = 'used',
        sale_id = p_sale_id,
        used_at = now()
    where id = p_revision_id and status = 'pending';

  if not found then
    raise exception 'Revision % is not pending or does not exist', p_revision_id;
  end if;
end;
$$;

grant execute on function use_membership_revision(uuid, uuid) to authenticated, anon;

-- 7. List pending revisions for a membership, with member names.
create or replace function get_pending_member_revisions(p_membership_id uuid)
returns table (
  revision_id uuid,
  member_id uuid,
  sub_id text,
  member_name text,
  milestone integer,
  package_type text
) language plpgsql security definer set search_path = public as $$
begin
  return query
    select
      r.id as revision_id,
      m.id as member_id,
      m.sub_id,
      m.name as member_name,
      r.milestone,
      r.package_type
    from membership_revisions r
    join membership_members m on m.id = r.member_id
    where r.membership_id = p_membership_id
      and r.status = 'pending'
    order by r.milestone, m.sub_id;
end;
$$;

grant execute on function get_pending_member_revisions(uuid) to authenticated, anon;

-- 8. Ensure the three membership POS products exist at the org level.
-- IMPORTANT: set the real lab prices in the inventory screen after running this migration;
-- the POS will discount the full price to $0 when the member is eligible.
create or replace function ensure_membership_revision_products(p_org_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bh_ego uuid;
  v_qs12e uuid;
  v_bp uuid;
begin
  select id into v_bh_ego
    from inventory
    where org_id = p_org_id
      and is_membership_revision = true
      and revision_type = 'bh_ego'
      and location_id is null
    limit 1;

  if v_bh_ego is null then
    insert into inventory (
      org_id, location_id, name, item_type, department, price, cost,
      quantity, low_stock_threshold, is_membership_revision, revision_type
    ) values (
      p_org_id, null, 'REVISION MEMBRESIA (BH, EGO)', 'service', 'laboratorio',
      0, 0, 9999, 0, true, 'bh_ego'
    )
    returning id into v_bh_ego;
  end if;

  select id into v_qs12e
    from inventory
    where org_id = p_org_id
      and is_membership_revision = true
      and revision_type = 'qs12e'
      and location_id is null
    limit 1;

  if v_qs12e is null then
    insert into inventory (
      org_id, location_id, name, item_type, department, price, cost,
      quantity, low_stock_threshold, is_membership_revision, revision_type
    ) values (
      p_org_id, null, 'REVISION MEMBRESIA (QS12e)', 'service', 'laboratorio',
      0, 0, 9999, 0, true, 'qs12e'
    )
    returning id into v_qs12e;
  end if;

  select id into v_bp
    from inventory
    where org_id = p_org_id
      and is_membership_blood_pressure = true
      and location_id is null
    limit 1;

  if v_bp is null then
    insert into inventory (
      org_id, location_id, name, item_type, department, price, cost,
      quantity, low_stock_threshold, is_membership_blood_pressure
    ) values (
      p_org_id, null, 'PRESION ARTERIAL GRATIS', 'service', 'servicios',
      0, 0, 9999, 0, true
    )
    returning id into v_bp;
  end if;

  return jsonb_build_object('bh_ego_id', v_bh_ego, 'qs12e_id', v_qs12e, 'blood_pressure_id', v_bp);
end;
$$;

grant execute on function ensure_membership_revision_products(uuid) to authenticated, anon;

-- 9. Create the three POS products for every existing organization.
do $$
declare
  r record;
begin
  for r in select id from organizations loop
    perform ensure_membership_revision_products(r.id);
  end loop;
end $$;
