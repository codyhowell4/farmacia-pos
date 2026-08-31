// Supabase Edge Function: paypal-webhook
// Handles PayPal billing subscription events and updates membership status.
// Exposed without JWT verification because PayPal calls it directly.

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

const getSubscriptionId = (event: WebhookEvent): string | null => {
  const resource = event.resource || {};
  const id = resource.id || resource.subscription_id;
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
    // If duplicate, throw so we don't process twice.
    if (error.message?.includes('duplicate')) {
      throw new Error('Event already processed');
    }
    throw error;
  }
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

const getPayPalSubscription = async (
  env: Record<string, string>,
  subscriptionId: string,
  accessToken: string
) => {
  const base =
    env.PAYPAL_ENV === 'live'
      ? 'https://api.paypal.com'
      : 'https://api.sandbox.paypal.com';

  const res = await fetch(`${base}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal lookup failed: ${res.status} ${text}`);
  }

  return (await res.json()) as Record<string, unknown>;
};

const getPayPalAccessToken = async (env: Record<string, string>) => {
  const base =
    env.PAYPAL_ENV === 'live'
      ? 'https://api.paypal.com'
      : 'https://api.sandbox.paypal.com';

  const auth = 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID!}:${env.PAYPAL_CLIENT_SECRET!}`);
  const res = await fetch(`${base}/v1/oauth2/token`, {
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

    const subscriptionId = getSubscriptionId(event);
    const supabase = supabaseAdmin(env);

    // Deduplicate and record.
    await recordEvent(supabase, event, subscriptionId);

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

        await updateMembershipBySubscription(supabase, subscriptionId, {
          status: 'active',
          next_renewal_date: formatDate(nextDate),
          renewal_day: nextDate.getDate(),
        });
        break;
      }

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await updateMembershipBySubscription(supabase, subscriptionId, {
          status: 'paused',
        });
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
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
