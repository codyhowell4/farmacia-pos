// Supabase Edge Function: paypal-webhook
// Handles PayPal billing subscription events and updates membership status.
// Exposed without JWT verification because PayPal calls it directly —
// authenticity is enforced by verifying the webhook signature with PayPal
// (requires the PAYPAL_WEBHOOK_ID secret from the PayPal dashboard).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface WebhookEvent {
  id: string;
  event_type: string;
  resource?: Record<string, unknown>;
}

const supabaseAdmin = (env: Record<string, string>) => {
  const url = env.SUPABASE_URL!;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

// For BILLING.SUBSCRIPTION.* events resource.id IS the subscription id, but
// for PAYMENT.SALE.* events resource.id is the sale/capture id and the
// subscription id lives in billing_agreement_id.
const getSubscriptionId = (event: WebhookEvent): string | null => {
  const resource = event.resource || {};
  const id = resource.billing_agreement_id || resource.subscription_id || resource.id;
  return typeof id === 'string' ? id : null;
};

const recordEvent = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  event: WebhookEvent,
  resourceId: string | null
) => {
  const { error } = await supabase.from('paypal_webhook_events').insert({
    event_id: event.id,
    event_type: event.event_type,
    resource_id: resourceId,
    payload: event,
  });

  if (error) {
    if (error.message?.includes('duplicate')) {
      return false; // already processed
    }
    throw error;
  }
  return true;
};

const updateMembershipBySubscription = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  subscriptionId: string,
  updates: Record<string, unknown>
) => {
  const { data, error } = await supabase
    .from('memberships')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('processor_subscription_id', subscriptionId)
    .select('id')
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
};

// Renews a membership after a successful payment: back to active, renewal
// date from PayPal's next_billing_time, and monthly visits replenished.
const renewMembershipBySubscription = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  subscriptionId: string,
  nextDate: Date
) => {
  const { data: membership, error: fetchError } = await supabase
    .from('memberships')
    .select('id, visits_limit')
    .eq('processor_subscription_id', subscriptionId)
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!membership) return null;

  return updateMembershipBySubscription(supabase, subscriptionId, {
    status: 'active',
    next_renewal_date: formatDate(nextDate),
    renewal_day: nextDate.getDate(),
    visits_remaining: membership.visits_limit,
  });
};

const paypalBaseUrl = (env: Record<string, string>) =>
  env.PAYPAL_ENV === 'live'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

const getPayPalAccessToken = async (env: Record<string, string>) => {
  const auth = 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID!}:${env.PAYPAL_CLIENT_SECRET!}`);
  const res = await fetch(`${paypalBaseUrl(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token as string;
};

const getPayPalSubscription = async (
  env: Record<string, string>,
  subscriptionId: string,
  accessToken: string
) => {
  const res = await fetch(`${paypalBaseUrl(env)}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal lookup failed: ${res.status} ${text}`);
  }

  return (await res.json()) as Record<string, unknown>;
};

// Verifies the event really came from PayPal. Fails closed: without the
// PAYPAL_WEBHOOK_ID secret (or on any verification error) the event is
// rejected so forged events can never touch membership state.
const verifyWebhookSignature = async (
  env: Record<string, string>,
  req: Request,
  event: WebhookEvent
) => {
  const webhookId = env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error('PAYPAL_WEBHOOK_ID no configurado — registra el webhook en PayPal y guarda su ID como secreto');
  }

  const token = await getPayPalAccessToken(env);
  const res = await fetch(`${paypalBaseUrl(env)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: req.headers.get('paypal-auth-algo'),
      cert_url: req.headers.get('paypal-cert-url'),
      transmission_id: req.headers.get('paypal-transmission-id'),
      transmission_sig: req.headers.get('paypal-transmission-sig'),
      transmission_time: req.headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal signature verification failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.verification_status !== 'SUCCESS') {
    throw new Error('Firma del webhook inválida');
  }
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
    const event = (await req.json()) as WebhookEvent;

    if (!event.id || !event.event_type) {
      throw new Error('Invalid webhook payload');
    }

    // Verify authenticity before recording or acting on anything.
    await verifyWebhookSignature(env, req, event);

    const subscriptionId = getSubscriptionId(event);
    const supabase = supabaseAdmin(env);

    // Deduplicate and record. Duplicates are acknowledged with 200 so
    // PayPal stops retrying events we already processed.
    const isNew = await recordEvent(supabase, event, subscriptionId);
    if (!isNew) {
      return new Response(JSON.stringify({ ok: true, note: 'Event already processed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!subscriptionId) {
      return new Response(JSON.stringify({ ok: true, note: 'No subscription id in event' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (event.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
      case 'PAYMENT.SALE.COMPLETED': {
        const token = await getPayPalAccessToken(env);
        const sub = await getPayPalSubscription(env, subscriptionId, token);
        const billingInfo = (sub.billing_info || {}) as Record<string, unknown>;
        const nextBillingTime = billingInfo.next_billing_time as string | undefined;
        const nextDate = nextBillingTime ? new Date(nextBillingTime) : addMonthsWithLastDayRule(new Date(), 1);

        await renewMembershipBySubscription(supabase, subscriptionId, nextDate);
        break;
      }

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        // Suspended maps to paused (mirrors the admin "Pausado" action);
        // only an explicit cancellation cancels the membership.
        await updateMembershipBySubscription(supabase, subscriptionId, {
          status: 'paused',
        });
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await updateMembershipBySubscription(supabase, subscriptionId, {
          status: 'cancelled',
        });
        break;

      default:
        break;
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[paypal-webhook] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
