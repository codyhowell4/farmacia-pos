// Supabase Edge Function: paypal-subscription-status
// Calls PayPal API to suspend, activate, or cancel a subscription.
// Exposed without JWT verification so the admin panel can call it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const paypalBaseUrl = (env: Record<string, string>) =>
  env.PAYPAL_ENV === 'live'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

const getPayPalAccessToken = async (env: Record<string, string>) => {
  const auth = 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID!}:${env.PAYPAL_CLIENT_SECRET!}`);
  const res = await fetch(`${paypalBaseUrl(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: auth,
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

const callPayPalSubscriptionAction = async (
  env: Record<string, string>,
  subscriptionId: string,
  action: 'suspend' | 'activate' | 'cancel',
  reason?: string
) => {
  const token = await getPayPalAccessToken(env);
  const url = `${paypalBaseUrl(env)}/v1/billing/subscriptions/${subscriptionId}/${action}`;

  const body: Record<string, unknown> = {};
  if (reason) body.reason = reason;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal ${action} failed: ${res.status} ${text}`);
  }

  return true;
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
    const payload = (await req.json()) as {
      subscription_id?: string;
      action?: 'suspend' | 'activate' | 'cancel';
      reason?: string;
    };

    if (!payload.subscription_id) {
      throw new Error('subscription_id requerido');
    }
    if (!payload.action || !['suspend', 'activate', 'cancel'].includes(payload.action)) {
      throw new Error('action inválida. Usa suspend, activate o cancel.');
    }

    await callPayPalSubscriptionAction(
      env,
      payload.subscription_id,
      payload.action,
      payload.reason
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[paypal-subscription-status] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
