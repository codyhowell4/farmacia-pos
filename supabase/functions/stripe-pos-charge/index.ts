// Supabase Edge Function: stripe-pos-charge
// POS card operations for the Stripe terminal-less flow: manual-capture
// PaymentIntents (authorize / capture / void), card vaulting via
// SetupIntent for $0 membership-only tickets (setup), and converting a POS
// membership signup into a Stripe subscription (subscribe).
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

// Stripe API failure. `type` === 'card_error' means the card itself was
// refused — safe to answer 402. Anything else is a server-side problem.
class StripeApiError extends Error {
  status: number;
  type?: string;
  code?: string;
  constructor(message: string, status: number, type?: string, code?: string) {
    super(message);
    this.status = status;
    this.type = type;
    this.code = code;
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
    let type: string | undefined;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(text);
      type = parsed?.error?.type;
      code = parsed?.error?.code;
    } catch {
      // non-JSON error body — keep the raw text for the log
    }
    throw new StripeApiError(`Stripe ${method} ${path} failed: ${res.status} ${text}`, res.status, type, code);
  }

  return (await res.json()) as Record<string, any>;
};

// Validates the caller's JWT and requires an admin/pos profile. Returns
// the profile so actions can scope tenant data to the caller's org.
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
    throw new ClientError('Solo el personal puede procesar cargos con tarjeta', 403);
  }
  return { user, profile };
};

// Mandatory plan binding (fail closed): plan_type maps to the configured
// Stripe price id server-side. A missing env var is a misconfiguration and
// also rejects.
const priceIdForPlan = (env: Record<string, string>, planType: string) => {
  const priceId =
    planType === 'individual' ? env.STRIPE_PRICE_INDIVIDUAL : env.STRIPE_PRICE_FAMILIAR;
  if (!priceId) {
    console.error(`[stripe-pos-charge] STRIPE_PRICE_${planType.toUpperCase()} is not configured`);
    throw new ClientError('No se pudo verificar el plan seleccionado');
  }
  return priceId;
};

// Finds (or creates) the Stripe customer for a membership signup so the
// card authorized on this ticket stays on file for the subscription.
const findOrCreateStripeCustomer = async (
  env: Record<string, string>,
  email: string,
  name: string,
  orgId: string
) => {
  const existing = await stripeApi(env, 'GET', '/customers', { email, limit: '1' });
  const found = (existing.data as Array<Record<string, any>> | undefined)?.[0];
  if (found?.id) return found.id as string;

  const created = await stripeApi(env, 'POST', '/customers', {
    email,
    name: name || '',
    'metadata[org_id]': orgId,
  });
  return created.id as string;
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
    const payload = (await req.json()) as Record<string, any>;

    if (!payload.action || !['authorize', 'capture', 'void', 'subscribe', 'setup'].includes(payload.action)) {
      throw new ClientError('action inválida. Usa authorize, capture, void, subscribe o setup.');
    }

    if (payload.action === 'setup') {
      // Card vaulting for a $0 POS ticket (membership-only signup with the
      // free first month): no PaymentIntent is possible on a $0 total, so
      // the card is 3DS-verified and vaulted via a SetupIntent instead.
      // The caller confirms it client-side (confirmCardSetup) and passes
      // the resulting payment_method_id to 'subscribe'.
      let stripeCustomerId: string;
      if (payload.customer_email) {
        stripeCustomerId = await findOrCreateStripeCustomer(
          env,
          String(payload.customer_email).trim().toLowerCase(),
          String(payload.customer_name || ''),
          profile.org_id as string
        );
      } else {
        const created = await stripeApi(env, 'POST', '/customers', {
          name: String(payload.customer_name || ''),
          'metadata[org_id]': profile.org_id as string,
        });
        stripeCustomerId = created.id as string;
      }

      const setupIntent = await stripeApi(env, 'POST', '/setup_intents', {
        customer: stripeCustomerId,
        usage: 'off_session',
      });
      return jsonResponse(
        { client_secret: setupIntent.client_secret, stripe_customer_id: stripeCustomerId },
        200
      );
    }

    if (payload.action === 'authorize') {
      const amountMxn = Number(payload.amount_mxn);
      if (!Number.isFinite(amountMxn) || amountMxn <= 0) {
        throw new ClientError('amount_mxn inválido');
      }

      let stripeCustomerId: string | null = null;
      const params: Record<string, string> = {
        amount: String(Math.round(amountMxn * 100)),
        currency: 'mxn',
        capture_method: 'manual',
      };

      // Membership signup on the ticket: keep the card on file so the
      // 'subscribe' action can bill it monthly without the card present.
      if (payload.has_membership_signup) {
        if (!payload.customer_email) {
          throw new ClientError('customer_email requerido para guardar la tarjeta de la membresía');
        }
        stripeCustomerId = await findOrCreateStripeCustomer(
          env,
          String(payload.customer_email).trim().toLowerCase(),
          String(payload.customer_name || ''),
          profile.org_id as string
        );
        params.customer = stripeCustomerId;
        params.setup_future_usage = 'off_session';
      }

      const intent = await stripeApi(env, 'POST', '/payment_intents', params);
      return jsonResponse(
        {
          client_secret: intent.client_secret,
          payment_intent_id: intent.id,
          stripe_customer_id: stripeCustomerId,
        },
        200
      );
    }

    if (payload.action === 'capture') {
      if (!payload.payment_intent_id) {
        throw new ClientError('payment_intent_id requerido');
      }
      const intent = await stripeApi(
        env,
        'POST',
        `/payment_intents/${payload.payment_intent_id}/capture`
      );
      return jsonResponse({ status: intent.status }, 200);
    }

    if (payload.action === 'void') {
      if (!payload.payment_intent_id) {
        throw new ClientError('payment_intent_id requerido');
      }
      const intent = await stripeApi(
        env,
        'POST',
        `/payment_intents/${payload.payment_intent_id}/cancel`
      );
      return jsonResponse({ status: intent.status }, 200);
    }

    // ── action === 'subscribe' ──
    if (!payload.membership_id) {
      throw new ClientError('membership_id requerido');
    }
    if (!payload.stripe_customer_id) {
      throw new ClientError('stripe_customer_id requerido');
    }
    if (!payload.payment_method_id) {
      throw new ClientError('payment_method_id requerido');
    }
    if (!payload.plan_type || !['individual', 'familiar'].includes(payload.plan_type)) {
      throw new ClientError('plan_type inválido');
    }
    const priceId = priceIdForPlan(env, payload.plan_type);

    // The membership must exist and belong to the caller's org.
    const supabase = supabaseAdmin(env);
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('id, org_id, status, payment_processor, processor_subscription_id')
      .eq('id', payload.membership_id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      throw new ClientError('Membresía no encontrada', 404);
    }
    if (membership.org_id !== profile.org_id) {
      console.warn('[stripe-pos-charge] subscribe refused: membership belongs to another org', {
        membership_id: payload.membership_id,
      });
      throw new ClientError('La membresía no pertenece a tu organización', 403);
    }
    if (membership.payment_processor === 'stripe' && membership.processor_subscription_id) {
      throw new ClientError('Esta membresía ya tiene una suscripción de Stripe activa', 409);
    }

    // Make sure the card is attached to this Stripe customer. The
    // payment_method_id is a plain PM id that can come from either a
    // confirmed PaymentIntent (authorize path, setup_future_usage) or a
    // succeeded SetupIntent (setup path); in both cases it is normally
    // already attached, which the retrieve-check below tolerates — attach
    // only fires for a retried or hand-entered payment method.
    const paymentMethod = await stripeApi(env, 'GET', `/payment_methods/${payload.payment_method_id}`);
    if (paymentMethod.customer !== payload.stripe_customer_id) {
      await stripeApi(env, 'POST', `/payment_methods/${payload.payment_method_id}/attach`, {
        customer: payload.stripe_customer_id,
      });
    }

    // First month free on ALL plans: the subscription starts with a
    // 1-month trial and the first Stripe invoice bills at day 30 — no
    // double charge on tickets where the signup month was charged, and
    // correct billing for $0 membership-only tickets (setup path).
    const trialEnd = new Date();
    trialEnd.setMonth(trialEnd.getMonth() + 1);

    const subscription = await stripeApi(env, 'POST', '/subscriptions', {
      customer: payload.stripe_customer_id,
      'items[0][price]': priceId,
      default_payment_method: payload.payment_method_id,
      trial_end: String(Math.floor(trialEnd.getTime() / 1000)),
    });

    const subStatus = (subscription.status as string || '').toLowerCase();
    if (!['active', 'trialing'].includes(subStatus)) {
      console.error('[stripe-pos-charge] subscription not active/trialing:', {
        subscriptionId: subscription.id,
        status: subStatus,
      });
      throw new ClientError(
        'No se pudo crear la suscripción con la tarjeta guardada. Intenta de nuevo.',
        402
      );
    }

    const update: Record<string, unknown> = {
      payment_method: 'stripe',
      payment_processor: 'stripe',
      processor_customer_id: payload.stripe_customer_id,
      processor_subscription_id: subscription.id,
      updated_at: new Date().toISOString(),
    };
    const last4 = paymentMethod.card?.last4 as string | undefined;
    if (last4) update.card_last4 = last4;

    const { error: updateError } = await supabase
      .from('memberships')
      .update(update)
      .eq('id', payload.membership_id);
    if (updateError) throw updateError;

    return jsonResponse({ subscription_id: subscription.id, status: subStatus }, 200);
  } catch (err) {
    console.error('[stripe-pos-charge] error:', err);
    if (err instanceof ClientError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    if (err instanceof StripeApiError && err.type === 'card_error') {
      return jsonResponse(
        { error: 'La tarjeta fue rechazada. Verifica los datos e intenta de nuevo.' },
        402
      );
    }
    return jsonResponse(
      { error: 'No se pudo procesar el cargo con tarjeta. Intenta de nuevo.' },
      500
    );
  }
});
