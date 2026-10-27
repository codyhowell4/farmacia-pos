// Supabase Edge Function: stripe-webhook
// Handles Stripe billing events and updates membership status.
// Exposed without JWT verification because Stripe calls it directly —
// authenticity is enforced by verifying the Stripe-Signature header with
// the STRIPE_WEBHOOK_SECRET from the Stripe dashboard. Fails closed:
// missing/invalid signatures (or a missing secret) reject the event so
// forged events can never touch membership state.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Stripe-Signature timestamps older than this are rejected (replay guard).
const SIGNATURE_TOLERANCE_SEC = 5 * 60;

interface StripeEvent {
  id: string;
  type: string;
  data?: { object?: Record<string, any> };
}

const supabaseAdmin = (env: Record<string, string>) => {
  const url = env.SUPABASE_URL!;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

const stripeApi = async (
  env: Record<string, string>,
  method: string,
  path: string,
  params?: Record<string, string>
) => {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY!}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(params ? { body: new URLSearchParams(params).toString() } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe API failed: ${res.status} ${text}`);
  }

  return (await res.json()) as Record<string, any>;
};

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Constant-time string compare (length leak is acceptable: both sides are
// SHA-256 hex digests, always 64 chars when valid).
const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

// Verifies the event really came from Stripe. Fails closed: without the
// STRIPE_WEBHOOK_SECRET (or on any verification error) the event is
// rejected so forged events can never touch membership state.
const verifyWebhookSignature = async (
  env: Record<string, string>,
  req: Request,
  rawBody: string
) => {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET no configurado — registra el webhook en Stripe y guarda su secreto');
  }

  const header = req.headers.get('stripe-signature');
  if (!header) {
    throw new Error('Falta el encabezado Stripe-Signature');
  }

  // Header format: t=1690000000,v1=<hex>,v1=<hex>,...
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error('Encabezado Stripe-Signature inválido');
  }

  const timestampSec = Number(timestamp);
  if (!Number.isFinite(timestampSec) || Math.abs(Date.now() / 1000 - timestampSec) > SIGNATURE_TOLERANCE_SEC) {
    throw new Error('Marca de tiempo del webhook fuera de tolerancia');
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  const expected = toHex(signed);

  if (!signatures.some((sig) => timingSafeEqual(sig, expected))) {
    throw new Error('Firma del webhook inválida');
  }
};

// Deduplicate and record. Duplicates are acknowledged with 200 so Stripe
// stops retrying events we already processed.
const recordEvent = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  event: StripeEvent
) => {
  const { error } = await supabase.from('stripe_webhook_events').insert({
    id: event.id,
    type: event.type,
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
    .eq('payment_processor', 'stripe')
    .select('id')
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
};

const formatDate = (d: Date) => d.toISOString().split('T')[0];

interface MembershipRow {
  id: string;
  org_id: string;
  customer_id: string | null;
  plan_id: string | null;
  status: string;
  pending_cancellation: boolean;
  next_renewal_date: string | null;
  payments_made: number | null;
  created_at: string;
  customers?: { full_name?: string | null; email?: string | null } | null;
}

const getMembershipBySubscription = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  subscriptionId: string
): Promise<MembershipRow | null> => {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, org_id, customer_id, plan_id, status, pending_cancellation, next_renewal_date, payments_made, created_at, customers(full_name, email)')
    .eq('processor_subscription_id', subscriptionId)
    .eq('payment_processor', 'stripe')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as MembershipRow | null) ?? null;
};

// Enqueues a membership lifecycle email + in-app notification, mirroring the
// pattern record_membership_payment uses in SQL. Never throws: notification
// failures must not break webhook processing.
const notifyMembership = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  membership: MembershipRow,
  template: string,
  payload: Record<string, unknown>,
  notification: { type: string; title: string; message: string }
) => {
  try {
    if (membership.customer_id) {
      const { error } = await supabase.from('notifications').insert({
        org_id: membership.org_id,
        customer_id: membership.customer_id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        related_id: membership.id,
        related_table: 'memberships',
      });
      if (error) console.error('[stripe-webhook] in-app notification failed:', error);
    }

    const email = membership.customers?.email;
    if (email) {
      const { error } = await supabase.from('notification_queue').insert({
        org_id: membership.org_id,
        channel: 'email',
        recipient: email,
        template,
        payload: {
          membership_id: membership.id,
          plan_id: membership.plan_id,
          patient_name: membership.customers?.full_name || '',
          ...payload,
        },
        scheduled_for: new Date().toISOString(),
      });
      if (error) console.error('[stripe-webhook] email enqueue failed:', error);
    }
  } catch (err) {
    console.error('[stripe-webhook] notifyMembership failed:', err);
  }
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
    const rawBody = await req.text();

    // Verify authenticity before parsing, recording or acting on anything.
    await verifyWebhookSignature(env, req, rawBody);

    const event = JSON.parse(rawBody) as StripeEvent;
    if (!event.id || !event.type) {
      throw new Error('Invalid webhook payload');
    }

    const supabase = supabaseAdmin(env);

    const isNew = await recordEvent(supabase, event);
    if (!isNew) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const object = (event.data?.object || {}) as Record<string, any>;

    switch (event.type) {
      case 'invoice.paid': {
        // The 'subscription_create' first invoice is already recorded by the
        // signup RPC — only actual renewal cycles count here, otherwise the
        // first month would be double-counted.
        if (object.billing_reason !== 'subscription_cycle') break;

        const subscriptionId = typeof object.subscription === 'string' ? object.subscription : null;
        if (!subscriptionId) break;

        const membership = await getMembershipBySubscription(supabase, subscriptionId);
        if (!membership) {
          console.warn('[stripe-webhook] invoice.paid for unknown subscription:', subscriptionId);
          break;
        }

        // Renewal dates are webhook-authoritative for stripe rows (the RPC
        // skips date advancement), so pull the new period end from Stripe.
        const subscription = await stripeApi(env, 'GET', `/subscriptions/${subscriptionId}`);
        const periodEndSec = subscription.current_period_end;
        const periodEnd = typeof periodEndSec === 'number' ? new Date(periodEndSec * 1000) : null;

        const amountPaid = object.amount_paid;
        const amount = typeof amountPaid === 'number' ? amountPaid / 100 : null;

        try {
          await supabase.rpc('record_membership_payment', {
            p_membership_id: membership.id,
            p_amount: Number.isFinite(amount) ? amount : null,
            p_payment_method: 'stripe',
            p_staff_id: null,
            p_is_signup: false,
          });
        } catch (paymentErr) {
          console.error('[stripe-webhook] record_membership_payment failed:', paymentErr);
        }

        if (periodEnd) {
          await updateMembershipBySubscription(supabase, subscriptionId, {
            next_renewal_date: formatDate(periodEnd),
            renewal_day: periodEnd.getDate(),
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const subscriptionId = typeof object.subscription === 'string' ? object.subscription : null;
        if (!subscriptionId) break;

        // Failed renewal maps to paused (mirrors the admin "Pausado" action);
        // only an explicit cancellation cancels the membership.
        await updateMembershipBySubscription(supabase, subscriptionId, {
          status: 'paused',
        });

        const membership = await getMembershipBySubscription(supabase, subscriptionId);
        if (membership) {
          await notifyMembership(
            supabase,
            membership,
            'membership_payment_failed',
            {},
            {
              type: 'membership_payment_failed',
              title: 'Pago de membresía fallido',
              message: `No pudimos cobrar la mensualidad de tu membresía ${membership.plan_id || ''}. Tus beneficios están pausados hasta que el pago se regularice.`,
            }
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscriptionId = typeof object.id === 'string' ? object.id : null;
        if (!subscriptionId) break;

        // With cancel_at_period_end semantics this event fires at period
        // end, so the cancellation is effective now.
        await updateMembershipBySubscription(supabase, subscriptionId, {
          status: 'cancelled',
          pending_cancellation: false,
        });

        const membership = await getMembershipBySubscription(supabase, subscriptionId);
        if (membership) {
          await notifyMembership(
            supabase,
            membership,
            'membership_cancelled',
            { effective_date: null, immediate: true },
            {
              type: 'membership_cancelled',
              title: 'Membresía cancelada',
              message: `Tu membresía ${membership.plan_id || ''} fue cancelada al final del periodo. Puedes reactivarla cuando quieras desde la página de membresías; conservamos tus pagos acumulados.`,
            }
          );
        }
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Full detail (Stripe payloads, PostgREST, misconfiguration) stays in
    // the server log; the caller gets one generic body (R2-38). Stripe
    // only needs a non-2xx to schedule a retry.
    console.error('[stripe-webhook] error:', err);
    return new Response(JSON.stringify({ error: 'Error al procesar el webhook' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
