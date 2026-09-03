// Supabase Edge Function: paypal-subscription
// Verifies a PayPal subscription and creates/reinstates a membership.
// Exposed without JWT verification so the public signup page can call it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CustomerPayload {
  full_name: string;
  email: string;
  phone: string;
}

interface RequestPayload {
  subscription_id: string;
  plan_type: 'individual' | 'familiar';
  customer: CustomerPayload;
  member_names?: string[];
  trackers_to_fulfill?: number;
  premium_trackers?: number;
  org_id: string;
  payment_method?: 'paypal' | 'cash';
  password?: string;
}

const PLANS: Record<string, { price: number; visits: number; basicTrackers: number }> = {
  individual: { price: 150, visits: 2, basicTrackers: 1 },
  familiar: { price: 500, visits: 8, basicTrackers: 6 },
};

const paypalBaseUrl = (env: Record<string, string>) =>
  env.PAYPAL_ENV === 'live'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

const paypalBasicAuth = (env: Record<string, string>) => {
  const clientId = env.PAYPAL_CLIENT_ID || '';
  const secret = env.PAYPAL_CLIENT_SECRET || '';
  return 'Basic ' + btoa(`${clientId}:${secret}`);
};

const getPayPalAccessToken = async (env: Record<string, string>) => {
  const res = await fetch(`${paypalBaseUrl(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: paypalBasicAuth(env),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token as string;
};

const getPayPalSubscription = async (env: Record<string, string>, subscriptionId: string) => {
  const token = await getPayPalAccessToken(env);
  const res = await fetch(`${paypalBaseUrl(env)}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal subscription lookup failed: ${res.status} ${text}`);
  }

  return (await res.json()) as Record<string, unknown>;
};

const supabaseAdmin = (env: Record<string, string>) => {
  const url = env.SUPABASE_URL!;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

const normalizePhone = (phone: string) => (phone || '').replace(/\D/g, '');

const findCustomerByEmailOrPhone = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  email: string,
  phone: string
) => {
  const normalizedPhone = normalizePhone(phone);
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('org_id', orgId)
    .or(`email.ilike.${email},phone.ilike.%${normalizedPhone}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
};

const findMembershipByCustomer = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  customerId: string
) => {
  const { data, error } = await supabase
    .from('memberships')
    .select('*, customers(*), membership_members(*)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
};

const addMonthsWithLastDayRule = (start: Date, months: number) => {
  const d = new Date(start);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
};

const formatDate = (d: Date) => d.toISOString().split('T')[0];

const createMembership = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  payload: RequestPayload,
  plan: (typeof PLANS)['individual']
) => {
  const { data, error } = await supabase.rpc('public_signup_membership', {
    p_org_id: payload.org_id,
    p_customer: {
      full_name: payload.customer.full_name,
      email: payload.customer.email,
      phone: payload.customer.phone,
    },
    p_membership: {
      plan_type: payload.plan_type,
      discount_percent: 10,
      visits_limit: plan.visits,
      premium_trackers: payload.premium_trackers || 0,
      basic_trackers_included: plan.basicTrackers,
      basic_trackers_fulfilled: 0,
      monthly_amount: plan.price,
      payment_method: payload.payment_method || 'paypal',
      payment_processor: 'paypal',
      processor_subscription_id: payload.subscription_id,
      status: 'active',
    },
    p_member_names: payload.member_names || [],
  });

  if (error) throw error;
  return (data as { membership: Record<string, unknown> }).membership;
};

const reinstateMembership = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  membershipId: string,
  subscriptionId: string,
  visitsLimit: number,
  trackersToFulfill: number,
  currentFulfilled: number
) => {
  const nextRenewal = addMonthsWithLastDayRule(new Date(), 1);

  const { data, error } = await supabase
    .from('memberships')
    .update({
      status: 'active',
      visits_remaining: visitsLimit,
      visits_limit: visitsLimit,
      processor_subscription_id: subscriptionId,
      next_renewal_date: formatDate(nextRenewal),
      renewal_day: nextRenewal.getDate(),
      basic_trackers_fulfilled: currentFulfilled + trackersToFulfill,
      updated_at: new Date().toISOString(),
    })
    .eq('id', membershipId)
    .select('*, customers(*), membership_members(*)')
    .single();

  if (error) throw error;
  return data;
};

const fulfillTrackers = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  qty: number
) => {
  if (!qty || qty <= 0) return;

  const { data: productId, error: fnError } = await supabase.rpc('ensure_basic_tracker_product', {
    p_org_id: orgId,
  });

  if (fnError) throw fnError;

  const { error } = await supabase.rpc('decrement_inventory_allow_negative', {
    p_id: productId,
    p_qty: qty,
  });

  if (error) throw error;
};

const isAlreadyRegisteredError = (err: { message?: string; code?: string }) => {
  const code = (err.code || '').toLowerCase();
  if (code.includes('already') || code.includes('exist')) return true;
  return /already|exist|registered|duplicate/i.test(err.message || '');
};

// Provisions a customer portal auth account and links it to the given
// customers row via customers.profile_id.
//
// The handle_new_user DB trigger fires on auth user creation and inserts
// both a profiles row and a fresh customers row for the new user. That
// trigger-created customers row duplicates the membership's row, so it is
// removed before linking (unique index on customers.profile_id).
//
// An existing account is reused as-is: its password is never updated.
const provisionPortalAccount = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  customer: { id: string; email: string; profile_id: string | null },
  orgId: string,
  password: string
) => {
  let userId: string | null = null;
  let accountExisted = false;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: customer.email,
    password,
    email_confirm: true,
    user_metadata: { role: 'customer', org_id: orgId },
  });

  if (createError) {
    if (!isAlreadyRegisteredError(createError)) throw createError;

    // Account already registered: reuse it, never touch its password.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', customer.email)
      .limit(1)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) throw createError;

    userId = profile.id as string;
    accountExisted = true;
  } else {
    userId = created.user?.id ?? null;
  }

  if (!userId) throw new Error('No se pudo crear ni localizar la cuenta del portal');

  if (customer.profile_id !== userId) {
    // Remove the trigger-created duplicate customers row (fresh; nothing
    // references it). Must run before linking so the unique index on
    // customers.profile_id is not violated.
    const { data: duplicate, error: duplicateError } = await supabase
      .from('customers')
      .select('id')
      .eq('profile_id', userId)
      .neq('id', customer.id)
      .limit(1)
      .maybeSingle();

    if (duplicateError) throw duplicateError;

    if (duplicate) {
      const { error: deleteError } = await supabase
        .from('customers')
        .delete()
        .eq('id', duplicate.id);
      if (deleteError) throw deleteError;
    }

    const { error: linkError } = await supabase
      .from('customers')
      .update({ profile_id: userId })
      .eq('id', customer.id);
    if (linkError) throw linkError;
  }

  return { accountExisted };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const env = Deno.env.toObject();
    const payload = (await req.json()) as RequestPayload;

    if (!payload.subscription_id && payload.payment_method !== 'cash') {
      throw new Error('subscription_id requerido');
    }
    if (!payload.plan_type || !PLANS[payload.plan_type]) {
      throw new Error('plan_type inválido');
    }
    if (!payload.org_id) {
      throw new Error('org_id requerido');
    }

    const plan = PLANS[payload.plan_type];
    const supabase = supabaseAdmin(env);

    // For PayPal payments, verify the subscription before creating anything.
    if (payload.payment_method !== 'cash') {
      const subscription = await getPayPalSubscription(env, payload.subscription_id);
      const status = (subscription.status as string || '').toUpperCase();
      const planId = subscription.plan_id as string | undefined;

      if (!['ACTIVE', 'APPROVAL_PENDING', 'APPROVED'].includes(status)) {
        throw new Error(`La suscripción de PayPal no está activa (estado: ${status})`);
      }

      // Optional sanity check: PayPal plan_id matches our expected plan.
      const expectedPlanId =
        payload.plan_type === 'individual'
          ? env.PAYPAL_PLAN_INDIVIDUAL
          : env.PAYPAL_PLAN_FAMILIAR;
      if (expectedPlanId && planId && planId !== expectedPlanId) {
        throw new Error('El plan de PayPal no coincide con el plan seleccionado');
      }
    }

    const existingCustomer = await findCustomerByEmailOrPhone(
      supabase,
      payload.org_id,
      payload.customer.email,
      payload.customer.phone
    );

    let membership;

    if (existingCustomer) {
      const existingMembership = await findMembershipByCustomer(supabase, existingCustomer.id);

      if (existingMembership && ['active', 'paused'].includes(existingMembership.status)) {
        throw new Error(
          'Ya existe una membresía activa o pausada para este correo o teléfono. Usa el panel de administración para gestionarla.'
        );
      }

      if (existingMembership) {
        // Reactivate cancelled/expired membership.
        membership = await reinstateMembership(
          supabase,
          existingMembership.id,
          payload.subscription_id,
          plan.visits,
          0,
          existingMembership.basic_trackers_fulfilled || 0
        );
      } else {
        membership = await createMembership(supabase, payload, plan);
      }
    } else {
      membership = await createMembership(supabase, payload, plan);
    }

    // Provision the customer portal account when a password was supplied.
    // Runs for both the new-signup and the reinstatement path, and never
    // blocks the purchase: errors are logged and only flagged in the response.
    let portalAccount: 'created' | 'linked' | 'skipped' | 'error' = 'skipped';
    if (payload.password) {
      try {
        const { data: membershipCustomer, error: customerError } = await supabase
          .from('customers')
          .select('id, email, profile_id')
          .eq('id', membership.customer_id as string)
          .single();

        if (customerError) throw customerError;
        if (!membershipCustomer?.email) {
          throw new Error('El cliente de la membresía no tiene correo electrónico');
        }

        const { accountExisted } = await provisionPortalAccount(
          supabase,
          membershipCustomer,
          payload.org_id,
          payload.password
        );
        portalAccount = accountExisted ? 'linked' : 'created';
      } catch (provisionError) {
        console.error('[paypal-subscription] portal account provisioning error:', provisionError);
        portalAccount = 'error';
      }
    }

    return new Response(JSON.stringify({ success: true, membership, portal_account: portalAccount }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[paypal-subscription] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
