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
      basic_trackers_fulfilled: payload.trackers_to_fulfill || 0,
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
        await fulfillTrackers(supabase, payload.org_id, payload.trackers_to_fulfill || 0);
        membership = await reinstateMembership(
          supabase,
          existingMembership.id,
          payload.subscription_id,
          plan.visits,
          payload.trackers_to_fulfill || 0,
          existingMembership.basic_trackers_fulfilled || 0
        );
      } else {
        await fulfillTrackers(supabase, payload.org_id, payload.trackers_to_fulfill || 0);
        membership = await createMembership(supabase, payload, plan);
      }
    } else {
      await fulfillTrackers(supabase, payload.org_id, payload.trackers_to_fulfill || 0);
      membership = await createMembership(supabase, payload, plan);
    }

    return new Response(JSON.stringify({ success: true, membership }), {
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
