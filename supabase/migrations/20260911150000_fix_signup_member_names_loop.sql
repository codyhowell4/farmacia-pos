-- ============================================================
-- FIX: public_signup_membership — empty member array crash
--
-- The edge function always passes p_member_names (never null), and for
-- individual signups it is an EMPTY array. array_length('{}', 1) is NULL,
-- so "for i in 1..null" raised "upper bound of FOR loop cannot be null"
-- AFTER PayPal had already charged — every individual signup (and family
-- signups with no extra names) failed post-payment.
--
-- Fix: guard the loop on coalesce(array_length(...), 0) > 0.
-- Full CREATE OR REPLACE so it can be pasted into the SQL editor as-is.
-- ============================================================

create or replace function public_signup_membership(
  p_org_id uuid,
  p_customer jsonb,
  p_membership jsonb,
  p_member_names text[] default array[]::text[],
  p_terms_accepted_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
  v_membership memberships%rowtype;
  v_start date;
  v_next date;
  v_day int;
  i int;
  v_status text;
begin
  insert into customers (org_id, full_name, email, phone)
  values (
    p_org_id,
    p_customer->>'full_name',
    p_customer->>'email',
    p_customer->>'phone'
  )
  returning id into v_customer_id;

  v_start := current_date;
  v_day := extract(day from v_start)::int;
  v_next := v_start + interval '1 month';
  if extract(day from v_next) < v_day then
    v_next := date_trunc('month', v_next) + interval '1 month' - interval '1 day';
  end if;

  -- For PayPal the membership starts pending; the Edge Function activates it after payment confirmation.
  v_status := coalesce(p_membership->>'status', 'active');

  insert into memberships (
    org_id, customer_id, plan_type, status, discount_percent,
    visits_remaining, visits_limit, premium_trackers, basic_trackers_included,
    basic_trackers_fulfilled, monthly_amount,
    payment_method, next_renewal_date, renewal_day,
    card_token, card_last4, payment_processor,
    processor_customer_id, processor_subscription_id,
    terms_accepted_at
  ) values (
    p_org_id, v_customer_id,
    p_membership->>'plan_type', v_status, (p_membership->>'discount_percent')::numeric,
    (p_membership->>'visits_limit')::int, (p_membership->>'visits_limit')::int,
    (p_membership->>'premium_trackers')::int,
    (p_membership->>'basic_trackers_included')::int,
    (p_membership->>'basic_trackers_fulfilled')::int,
    (p_membership->>'monthly_amount')::numeric,
    p_membership->>'payment_method', v_next, v_day,
    p_membership->>'card_token', p_membership->>'card_last4',
    p_membership->>'payment_processor',
    p_membership->>'processor_customer_id', p_membership->>'processor_subscription_id',
    coalesce(p_terms_accepted_at, (p_membership->>'terms_accepted_at')::timestamptz)
  )
  returning * into v_membership;

  insert into membership_members (membership_id, sub_id, name, is_owner)
  values (v_membership.id, v_membership.plan_id || '-1', p_customer->>'full_name', true);

  -- array_length of an EMPTY array is NULL, not 0: guard the loop or the
  -- whole signup dies with "upper bound of FOR loop cannot be null".
  if coalesce(array_length(p_member_names, 1), 0) > 0 then
    for i in 1..array_length(p_member_names, 1) loop
      insert into membership_members (membership_id, sub_id, name, is_owner)
      values (v_membership.id, v_membership.plan_id || '-' || (i+1), p_member_names[i], false);
    end loop;
  end if;

  -- Signup = payment #1: counts the payment, books the sale, fires
  -- welcome + receipt notifications. Guarded so a bookkeeping failure
  -- cannot roll back the signup itself.
  begin
    perform record_membership_payment(
      v_membership.id,
      (p_membership->>'monthly_amount')::numeric,
      coalesce(p_membership->>'payment_method', 'paypal'),
      null,
      true
    );
  exception when others then
    raise warning 'public_signup_membership: signup payment recording failed for membership %: %', v_membership.id, sqlerrm;
  end;

  -- Re-read so the returned row reflects payments_made = 1 etc.
  select * into v_membership from memberships where id = v_membership.id;

  return jsonb_build_object(
    'membership', to_jsonb(v_membership),
    'customer', to_jsonb((select row_to_json(c) from customers c where c.id = v_customer_id)),
    'members', (select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) from membership_members m where m.membership_id = v_membership.id)
  );
end;
$$;

revoke all on function public_signup_membership(uuid, jsonb, jsonb, text[], timestamptz) from public;
grant execute on function public_signup_membership(uuid, jsonb, jsonb, text[], timestamptz) to anon, authenticated, service_role;
