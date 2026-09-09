// Supabase Edge Function: cancel-my-membership
// Self-service cancel-at-period-end for the membership titular (or staff).
// JWT verification is ON (supabase/config.toml): the caller is the member's
// customer-portal session.
//
//   action 'cancel': flags pending_cancellation via the
//     request_membership_cancellation RPC (benefits continue until
//     next_renewal_date; the process_membership_renewals cron flips the row
//     to 'cancelled' after that). PayPal-processor memberships also get their
//     subscription cancelled at PayPal so billing actually stops; the
//     webhook's CANCELLED echo respects pending_cancellation.
//   action 'resume': clears the pending flag via resume_membership. Only
//     meaningful for cash memberships — a cancelled PayPal subscription
//     cannot be un-cancelled, so PayPal members get { reason:
//     'paypal_resignup' } and re-sign up from the public memberships page.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestPayload {
  membership_id?: string;
  action?: 'cancel' | 'resume';
}

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const supabaseAdmin = (env: Record<string, string>) => {
  const url = env.SUPABASE_URL!;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

// User-scoped client: the cancellation RPCs re-check the caller through
// auth.jwt()/auth.uid(), so they must run under the member's own JWT.
const supabaseAsUser = (env: Record<string, string>, token: string) => {
  const url = env.SUPABASE_URL!;
  const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
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

const cancelPayPalSubscription = async (
  env: Record<string, string>,
  subscriptionId: string,
  reason: string
) => {
  const token = await getPayPalAccessToken(env);
  const res = await fetch(
    `${paypalBaseUrl(env)}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal cancel failed: ${res.status} ${text}`);
  }

  return true;
};

// Maps the RPC's machine error codes to responses (called only on failure).
const rpcErrorResponse = (result: { success?: boolean; error?: string } | null) => {
  const code = result?.error || 'unknown';
  if (code === 'not_authorized') {
    return jsonResponse({ error: 'No tienes permiso para gestionar esta membresía' }, 403);
  }
  if (code === 'membership_not_found') {
    return jsonResponse({ error: 'No encontramos esa membresía' }, 404);
  }
  if (code === 'already_cancelled') {
    return jsonResponse({ error: 'Esta membresía ya está cancelada' }, 400);
  }
  return jsonResponse({ error: 'No se pudo procesar la solicitud. Intenta de nuevo.' }, 400);
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
    const supabase = supabaseAdmin(env);

    // AuthN: verify_jwt is on, but validate explicitly to get the user row.
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return jsonResponse({ error: 'No autorizado' }, 401);
    }
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'No autorizado' }, 401);
    }
    const user = userData.user;

    const payload = (await req.json()) as RequestPayload;
    if (!payload.membership_id) {
      return jsonResponse({ error: 'membership_id requerido' }, 400);
    }
    if (!payload.action || !['cancel', 'resume'].includes(payload.action)) {
      return jsonResponse({ error: "action inválida. Usa 'cancel' o 'resume'." }, 400);
    }

    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('id, customer_id, org_id, status, payment_processor, processor_subscription_id, next_renewal_date, pending_cancellation')
      .eq('id', payload.membership_id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return jsonResponse({ error: 'No encontramos esa membresía' }, 404);
    }

    // AuthZ (mirrors request_membership_cancellation): the titular — the
    // membership's customers row matches the caller's JWT email or is linked
    // to their profile — or staff of the membership's org.
    const { data: customer } = await supabase
      .from('customers')
      .select('email, profile_id')
      .eq('id', membership.customer_id)
      .maybeSingle();

    const callerEmail = (user.email || '').toLowerCase();
    let authorized = !!customer && (
      (!!callerEmail && (customer.email || '').toLowerCase() === callerEmail) ||
      customer.profile_id === user.id
    );

    if (!authorized) {
      const { data: staffProfile } = await supabase
        .from('profiles')
        .select('role, org_id')
        .eq('id', user.id)
        .maybeSingle();
      authorized = !!staffProfile &&
        staffProfile.org_id === membership.org_id &&
        ['admin', 'pos', 'inventory', 'doctor'].includes(staffProfile.role as string);
    }

    if (!authorized) {
      return jsonResponse({ error: 'No tienes permiso para gestionar esta membresía' }, 403);
    }

    const supabaseUser = supabaseAsUser(env, token);

    if (payload.action === 'resume') {
      if (membership.status === 'cancelled') {
        return jsonResponse({
          success: false,
          reason: 'already_cancelled',
          message: 'Esta membresía ya está cancelada. Puedes reactivarla contratando de nuevo desde la página de membresías; conservamos tus pagos acumulados.',
        }, 200);
      }

      if (membership.payment_processor === 'paypal') {
        return jsonResponse({
          success: false,
          reason: 'paypal_resignup',
          message: 'Las suscripciones de PayPal no se pueden reanudar una vez canceladas. Puedes reactivar tu membresía cuando quieras desde la página de membresías; conservamos tus pagos acumulados.',
        }, 200);
      }

      const { data: resumeResult, error: resumeError } = await supabaseUser
        .rpc('resume_membership', { p_membership_id: membership.id });

      if (resumeError) {
        console.error('[cancel-my-membership] resume_membership rpc error:', resumeError);
        return jsonResponse({ error: 'No se pudo reanudar tu membresía. Intenta de nuevo.' }, 400);
      }
      if (!resumeResult?.success) {
        return rpcErrorResponse(resumeResult);
      }

      return jsonResponse({ success: true }, 200);
    }

    // action === 'cancel'
    const { data: cancelResult, error: cancelError } = await supabaseUser
      .rpc('request_membership_cancellation', { p_membership_id: membership.id });

    if (cancelError) {
      console.error('[cancel-my-membership] request_membership_cancellation rpc error:', cancelError);
      return jsonResponse({ error: 'No se pudo programar la cancelación. Intenta de nuevo.' }, 400);
    }
    if (!cancelResult?.success) {
      return rpcErrorResponse(cancelResult);
    }

    const effectiveDate = cancelResult.effective_date || membership.next_renewal_date || null;

    // Stop PayPal billing too. The webhook's CANCELLED echo respects
    // pending_cancellation, so benefits continue until effective_date. A
    // PayPal failure never rolls back the flag (the member asked to cancel);
    // it is logged and flagged in the response so staff can follow up.
    let paypalCancelled = false;
    let warning: string | undefined;
    if (membership.payment_processor === 'paypal' && membership.processor_subscription_id) {
      try {
        await cancelPayPalSubscription(
          env,
          membership.processor_subscription_id as string,
          'Cancelación solicitada por el titular desde la app'
        );
        paypalCancelled = true;
      } catch (paypalErr) {
        console.error('[cancel-my-membership] PayPal cancel failed:', paypalErr);
        warning = 'Tu membresía quedó programada para cancelarse, pero no pudimos detener el cobro en PayPal automáticamente. Por favor avisa al personal de la farmacia.';
      }
    }

    return jsonResponse({
      success: true,
      effective_date: effectiveDate,
      paypal_cancelled: paypalCancelled,
      ...(warning ? { warning } : {}),
    }, 200);
  } catch (err) {
    console.error('[cancel-my-membership] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonResponse({ error: message }, 400);
  }
});
