// Supabase Edge Function: stripe-subscription-status
// Calls the Stripe API to suspend, activate, or cancel a membership
// subscription — mirrors paypal-subscription-status for Stripe-billed
// memberships (payment_processor = 'stripe').
// Staff-only: JWT verification is ON (supabase/config.toml) and the caller
// must have an admin or pos profile.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseAdmin = (env: Record<string, string>) => {
  const url = env.SUPABASE_URL!;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

// Errors whose message is safe to show the caller (auth and payload
// validation). Everything else (Stripe API payloads, PostgREST details,
// stack traces) is logged server-side and answered with a generic
// message — same pattern as paypal-subscription-status (R2-38).
class ClientError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Minimal Stripe REST client: plain fetch, form-encoded bodies, Bearer key.
const stripeApi = async (
  env: Record<string, string>,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params?: Record<string, string>
) => {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');

  let url = `https://api.stripe.com/v1${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  let body: string | undefined;

  if (method === 'GET') {
    if (params) url += '?' + new URLSearchParams(params).toString();
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = params ? new URLSearchParams(params).toString() : '';
  }

  const res = await fetch(url, { method, headers, body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe ${method} ${path} failed: ${res.status} ${text}`);
  }

  return (await res.json()) as Record<string, any>;
};

// Validates the caller's JWT and requires an admin/pos profile. Returns
// the profile so the membership lookup can be scoped to the caller's org.
const requireStaffUser = async (env: Record<string, string>, req: Request) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ClientError('No autorizado', 401);

  const supabase = supabaseAdmin(env);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new ClientError('No autorizado', 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !['admin', 'pos'].includes(profile.role as string)) {
    throw new ClientError('Solo el personal puede gestionar suscripciones', 403);
  }
  return { user, profile };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const env = Deno.env.toObject();
    const { profile } = await requireStaffUser(env, req);

    const payload = (await req.json()) as {
      membership_id?: string;
      action?: 'suspend' | 'activate' | 'cancel';
    };

    if (!payload.membership_id) {
      throw new ClientError('membership_id requerido');
    }
    if (!payload.action || !['suspend', 'activate', 'cancel'].includes(payload.action)) {
      throw new ClientError('action inválida. Usa suspend, activate o cancel.');
    }

    // Resolve the Stripe subscription from the membership row. The
    // membership must exist, belong to the caller's org, and be
    // Stripe-billed — PayPal memberships go through
    // paypal-subscription-status.
    const supabase = supabaseAdmin(env);
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('id, org_id, payment_processor, processor_subscription_id')
      .eq('id', payload.membership_id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      throw new ClientError('Membresía no encontrada', 404);
    }
    if (membership.org_id !== profile.org_id) {
      console.warn('[stripe-subscription-status] refused: membership belongs to another org', {
        membership_id: payload.membership_id,
      });
      throw new ClientError('La membresía no pertenece a tu organización', 403);
    }
    if (membership.payment_processor !== 'stripe' || !membership.processor_subscription_id) {
      throw new ClientError('Esta membresía no tiene una suscripción de Stripe');
    }

    const subscriptionId = membership.processor_subscription_id as string;

    // suspend  → pause collection, marking future invoices uncollectible
    // activate → clear the pause (empty value unsets pause_collection)
    // cancel   → cancel at the end of the current paid period
    const params: Record<string, string> = {};
    if (payload.action === 'suspend') {
      params['pause_collection[behavior]'] = 'mark_uncollectible';
    } else if (payload.action === 'activate') {
      params['pause_collection'] = '';
    } else {
      params['cancel_at_period_end'] = 'true';
    }

    const subscription = await stripeApi(env, 'POST', `/subscriptions/${subscriptionId}`, params);

    return jsonResponse({ success: true, status: subscription.status }, 200);
  } catch (err) {
    console.error('[stripe-subscription-status] error:', err);
    if (err instanceof ClientError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    return jsonResponse(
      { error: 'No se pudo actualizar la suscripción con Stripe. Intenta de nuevo.' },
      500
    );
  }
});
