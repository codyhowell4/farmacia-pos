// Supabase Edge Function: paypal-subscription
// Verifies a PayPal subscription and creates/reinstates a membership.
// Exposed without JWT verification so the public signup page can call it.
//
// Security posture (audit R2-9):
// - Only PayPal status ACTIVE activates anything. APPROVAL_PENDING /
//   APPROVED / any other state registers the membership as 'pending' and
//   answers { status: 'pending_activation' } — paypal-webhook flips it to
//   active when the first payment actually confirms.
// - Existing-customer matching is by exact normalized email ONLY (no phone
//   or substring matching, which let attackers attach to strangers).
// - Account-takeover guard: when a portal account already exists for the
//   email (profiles row, or customers.profile_id), the caller-supplied
//   password is NEVER applied — the request is refused with 409
//   account_exists and the user is told to log in / reset their password.
// - The PayPal plan_id on the subscription must match the configured plan
//   env var for the claimed plan_type (mandatory, fails closed).
// - Client-facing errors are generic; details are logged server-side only.

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
  date_of_birth?: string; // YYYY-MM-DD (R2-21) — forwarded to public_signup_membership
  guardian_name?: string; // required with date_of_birth when the titular is < 18
  guardian_relationship?: string;
  guardian_id_ref?: string;
}

interface RequestPayload {
  subscription_id: string;
  plan_type: 'individual' | 'familiar';
  customer: CustomerPayload;
  member_names?: string[];
  trackers_to_fulfill?: number;
  premium_trackers?: number;
  org_id: string;
  password?: string;
  terms_accepted_at?: string;
}

const PLANS: Record<string, { price: number; visits: number; basicTrackers: number }> = {
  individual: { price: 150, visits: 2, basicTrackers: 0 },
  familiar: { price: 500, visits: 8, basicTrackers: 0 },
};

// Errors whose message is safe to show the caller. Everything else (PayPal
// API payloads, PostgREST details, stack traces) is logged and answered
// with a generic message.
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

const normalizeEmail = (email: string) => (email || '').trim().toLowerCase();

const isValidDob = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d) < new Date();

const ageFromDob = (d: string) =>
  Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 86400000));

// Exact email match ONLY (case-insensitive). Phone/substring matching was
// removed: it let an attacker attach a paid signup to a stranger's record.
// The JS-side re-check guards against ilike wildcard injection (% and _
// are technically valid in email local parts).
const findCustomerByEmail = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  email: string
) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('org_id', orgId)
    .ilike('email', normalized)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return (data || []).find((c) => normalizeEmail(c.email || '') === normalized) || null;
};

// A portal (auth) account exists for an email when a profiles row carries
// it — the handle_new_user trigger creates one for every auth user. Org-
// agnostic on purpose: auth accounts are global. Same exact-match +
// JS-verify discipline as findCustomerByEmail.
const findProfileByEmail = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  email: string
) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', normalized)
    .limit(5);

  if (error) throw error;
  return (data || []).find((p) => normalizeEmail(p.email || '') === normalized) || null;
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
  plan: (typeof PLANS)['individual'],
  status: 'active' | 'pending' = 'active'
) => {
  const { data, error } = await supabase.rpc('public_signup_membership', {
    p_org_id: payload.org_id,
    p_customer: {
      full_name: payload.customer.full_name,
      email: payload.customer.email,
      phone: payload.customer.phone,
      date_of_birth: payload.customer.date_of_birth || null,
      guardian_name: payload.customer.guardian_name || null,
      guardian_relationship: payload.customer.guardian_relationship || null,
      guardian_id_ref: payload.customer.guardian_id_ref || null,
    },
    p_membership: {
      plan_type: payload.plan_type,
      discount_percent: 10,
      visits_limit: plan.visits,
      premium_trackers: payload.premium_trackers || 0,
      basic_trackers_included: plan.basicTrackers,
      basic_trackers_fulfilled: 0,
      monthly_amount: plan.price,
      payment_method: 'paypal',
      payment_processor: 'paypal',
      processor_subscription_id: payload.subscription_id,
      status,
    },
    p_member_names: payload.member_names || [],
    p_terms_accepted_at: payload.terms_accepted_at || null,
  });

  if (error) throw error;
  return (data as { membership: Record<string, unknown> }).membership;
};

const reinstateMembership = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  membershipId: string,
  payload: RequestPayload,
  plan: (typeof PLANS)['individual'],
  trackersToFulfill: number,
  currentFulfilled: number
) => {
  const nextRenewal = addMonthsWithLastDayRule(new Date(), 1);

  // payment_method/payment_processor must be 'paypal' (as in the fresh-signup
  // path): record_membership_payment and process_membership_renewals treat
  // non-paypal rows as cash-like and advance/expire their dates, which would
  // fight the webhook-authoritative billing dates. pending_cancellation is
  // cleared so a prior self-cancellation doesn't cancel the re-subscribed
  // membership at the next renewal date.
  const { data, error } = await supabase
    .from('memberships')
    .update({
      status: 'active',
      plan_type: payload.plan_type,
      monthly_amount: plan.price,
      visits_remaining: plan.visits,
      visits_limit: plan.visits,
      payment_method: 'paypal',
      payment_processor: 'paypal',
      processor_subscription_id: payload.subscription_id,
      pending_cancellation: false,
      cancel_requested_at: null,
      terms_accepted_at: payload.terms_accepted_at || null,
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

// Flush the notification queue right away so welcome/receipt emails land
// within seconds instead of waiting for the 5-minute cron tick.
const flushNotifications = async (env: Record<string, string>) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.CRON_SECRET) headers['x-cron-secret'] = env.CRON_SECRET;
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/send-notifications`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const text = await res.text();
  console.log('[paypal-subscription] notification flush:', res.status, text);
};

// Run the flush in the background when the runtime supports it, otherwise
// inline — never lets a flush failure break the signup response.
const scheduleFlush = async (env: Record<string, string>) => {
  const flush = flushNotifications(env).catch((e) =>
    console.error('[paypal-subscription] flush failed:', e)
  );
  const edgeRuntime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(flush);
  } else {
    await flush;
  }
};

// Provisions a customer portal auth account and links it to the given
// customers row via customers.profile_id.
//
// The handle_new_user DB trigger fires on auth user creation and inserts
// both a profiles row and a fresh customers row for the new user. That
// trigger-created customers row duplicates the membership's row, so it is
// removed before linking (unique index on customers.profile_id).
//
// The serve handler refuses the request with 409 account_exists whenever a
// portal account already exists for the email, so by the time this runs
// the account is always new. The already-registered branch below is kept
// as race-condition defense only: it reuses the account and NEVER sets or
// updates a password for it.
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

    // Account already registered (race): reuse it, never touch its password.
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
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const env = Deno.env.toObject();
    const payload = (await req.json()) as RequestPayload;

    if (!payload.subscription_id) {
      throw new ClientError('subscription_id requerido');
    }
    if (!payload.plan_type || !PLANS[payload.plan_type]) {
      throw new ClientError('plan_type inválido');
    }
    if (!payload.org_id) {
      throw new ClientError('org_id requerido');
    }
    if (!payload.customer?.email) {
      throw new ClientError('El correo electrónico del titular es requerido');
    }

    // Minor rule (R2-21, mirrors the kiosk): when the titular's DOB says
    // < 18, guardian name + parentesco are mandatory — rejected here, before
    // PayPal is called and before public_signup_membership runs. Adults:
    // no new requirements (DOB itself stays optional in this flow).
    const customerDob = (payload.customer.date_of_birth || '').trim();
    if (customerDob && !isValidDob(customerDob)) {
      throw new ClientError('Fecha de nacimiento inválida (AAAA-MM-DD)');
    }
    if (customerDob && ageFromDob(customerDob) < 18) {
      if (!(payload.customer.guardian_name || '').trim()) {
        throw new ClientError('El nombre del padre o tutor es obligatorio para menores de edad');
      }
      if (!(payload.customer.guardian_relationship || '').trim()) {
        throw new ClientError(
          'El parentesco del tutor (padre, madre o tutor legal) es obligatorio para menores de edad'
        );
      }
    }

    const plan = PLANS[payload.plan_type];
    const supabase = supabaseAdmin(env);

    // Always verify the subscription with PayPal before creating anything.
    const subscription = await getPayPalSubscription(env, payload.subscription_id);
    const status = (subscription.status as string || '').toUpperCase();
    const planId = subscription.plan_id as string | undefined;

    // Mandatory plan binding (fail closed): the PayPal plan_id on the
    // subscription must be the configured plan for the claimed plan_type —
    // otherwise the caller could pay for a cheap/unknown plan and receive
    // this plan's benefits. A missing env var is a misconfiguration and
    // also rejects.
    const expectedPlanId =
      payload.plan_type === 'individual'
        ? env.PAYPAL_PLAN_INDIVIDUAL
        : env.PAYPAL_PLAN_FAMILIAR;
    if (!expectedPlanId) {
      console.error(
        `[paypal-subscription] PAYPAL_PLAN_${payload.plan_type.toUpperCase()} is not configured`
      );
      throw new ClientError('No se pudo verificar el plan seleccionado');
    }
    if (!planId || planId !== expectedPlanId) {
      console.warn('[paypal-subscription] plan mismatch:', { planId, planType: payload.plan_type });
      throw new ClientError('El plan de PayPal no coincide con el plan seleccionado');
    }

    // ── Non-ACTIVE subscriptions (APPROVAL_PENDING / APPROVED / anything
    //    else): PayPal has not charged yet. Register/keep the membership as
    //    pending — paypal-webhook flips it active when the first payment
    //    confirms. No accounts, benefits, or reactivations happen here.
    if (status !== 'ACTIVE') {
      const pendingCustomer = await findCustomerByEmail(
        supabase,
        payload.org_id,
        payload.customer.email
      );
      if (pendingCustomer) {
        const pendingMembership = await findMembershipByCustomer(supabase, pendingCustomer.id);
        if (pendingMembership?.processor_subscription_id === payload.subscription_id) {
          // Retry of the same signup: keep the pending membership as-is.
          await scheduleFlush(env);
          return jsonResponse(
            {
              success: true,
              status: 'pending_activation',
              membership: pendingMembership,
              replayed: true,
            },
            200
          );
        }
        if (pendingMembership && ['active', 'paused'].includes(pendingMembership.status)) {
          throw new ClientError(
            'Ya existe una membresía activa o pausada para este correo. Usa el panel de administración para gestionarla.'
          );
        }
      }
      const membership = await createMembership(supabase, payload, plan, 'pending');
      await scheduleFlush(env);
      return jsonResponse({ success: true, status: 'pending_activation', membership }, 200);
    }

    // ── ACTIVE: PayPal confirms the subscription is billing. ──
    const existingCustomer = await findCustomerByEmail(
      supabase,
      payload.org_id,
      payload.customer.email
    );

    let existingMembership: Record<string, any> | null = null;
    if (existingCustomer) {
      existingMembership = await findMembershipByCustomer(supabase, existingCustomer.id);

      if (existingMembership && ['active', 'paused'].includes(existingMembership.status)) {
        if (existingMembership.processor_subscription_id === payload.subscription_id) {
          // Replay of the same approved PayPal subscription (client retry
          // after a network blip, or the "Reintentar activación" button on
          // the pending screen): the membership is already registered, so
          // answer success instead of blocking a paid signup. Checked before
          // the account_exists guard so a legit retry still succeeds.
          await scheduleFlush(env);
          return jsonResponse(
            {
              success: true,
              membership: existingMembership,
              portal_account: 'skipped',
              replayed: true,
            },
            200
          );
        }
        throw new ClientError(
          'Ya existe una membresía activa o pausada para este correo. Usa el panel de administración para gestionarla.'
        );
      }
    }

    // Account-takeover guard: when a portal account already exists for this
    // email (a profiles row — the handle_new_user trigger creates one per
    // auth user — or a customers.profile_id link), the password in this
    // payload must NEVER be applied to that account: the caller chose it.
    // Refuse and point the user at login / password reset instead.
    const existingProfile = await findProfileByEmail(supabase, payload.customer.email);
    if (existingProfile || existingCustomer?.profile_id) {
      console.warn('[paypal-subscription] signup refused: portal account already exists for email');
      return jsonResponse(
        {
          error: 'account_exists',
          message:
            'Ya existe una cuenta con este correo electrónico. Inicia sesión o restablece tu contraseña desde el portal del cliente; el personal de la farmacia puede ayudarte a asociar tu nueva membresía.',
        },
        409
      );
    }

    let membership;

    if (existingMembership) {
      // Reactivate cancelled/expired membership.
      membership = await reinstateMembership(
        supabase,
        existingMembership.id,
        payload,
        plan,
        0,
        existingMembership.basic_trackers_fulfilled || 0
      );

      // Re-signup = a new payment: count it toward their milestone
      // progress (payments_made carries over per business rule), book
      // the sale, and fire receipt + welcome emails. Guarded so a
      // bookkeeping hiccup never blocks a paid reactivation.
      try {
        const { error: payError } = await supabase.rpc('record_membership_payment', {
          p_membership_id: membership.id,
          p_amount: plan.price,
          p_payment_method: 'paypal',
          p_staff_id: null,
          p_is_signup: true,
        });
        if (payError) {
          console.error('[paypal-subscription] reinstate payment recording failed:', payError);
        }
      } catch (payErr) {
        console.error('[paypal-subscription] reinstate payment recording failed:', payErr);
      }
    } else {
      membership = await createMembership(supabase, payload, plan);
    }

    // Provision the customer portal account when a password was supplied.
    // Runs for both the new-signup and the reinstatement path, and never
    // blocks the purchase: errors are logged and only flagged in the
    // response. The account_exists guard above guarantees this only ever
    // creates NEW accounts.
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

    await scheduleFlush(env);

    return jsonResponse({ success: true, membership, portal_account: portalAccount }, 200);
  } catch (err) {
    console.error('[paypal-subscription] error:', err);
    if (err instanceof ClientError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    return jsonResponse(
      { error: 'No se pudo procesar la suscripción. Intenta de nuevo o contacta a la farmacia.' },
      500
    );
  }
});
