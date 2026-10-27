// Supabase Edge Function: stripe-membership-signup
// Creates a Stripe customer + subscription and registers/reinstates a
// membership. Exposed without JWT verification so the public signup page
// (/membresias) and the admin-assisted registration page can call it.
//
// Two-phase flow (Mexican cards almost always require 3DS, so the first
// invoice's PaymentIntent usually needs client-side confirmation):
// - action 'start': validates, runs the pre-Stripe guards, creates the
//   Stripe customer + subscription with payment_behavior=default_incomplete.
//   If the subscription comes back 'active' (no 3DS needed) it provisions
//   the membership immediately. If 'incomplete' it provisions NOTHING and
//   returns the invoice PaymentIntent's client_secret so the caller can
//   confirm the payment client-side (Stripe.js handleNextAction).
// - action 'confirm': after client-side confirmation, re-retrieves the
//   subscription; when it is now 'active' it runs ALL the same guards +
//   provisioning (idempotent/replay-safe). Still not active → 402.
//   Incomplete subscriptions abandoned by the client are auto-canceled by
//   Stripe after 23 h.
//
// Security posture (mirrors paypal-subscription, audit R2-9 / R2-38):
// - Only a Stripe subscription with status 'active' activates anything.
// - Existing-customer matching is by exact normalized email ONLY (no phone
//   or substring matching, which let attackers attach to strangers).
// - Account-takeover guard: when a portal account already exists for the
//   email (profiles row, or customers.profile_id), the caller-supplied
//   password is NEVER applied — the request is refused with 409
//   account_exists and the user is told to log in / reset their password.
// - The plan_type is bound server-side to the configured Stripe price id
//   (mandatory, fails closed, verified again on 'confirm') — the caller
//   never supplies a price.
// - One paid Stripe subscription activates exactly ONE membership: any
//   memberships row already carrying the same processor_subscription_id
//   for a DIFFERENT customer rejects the signup with 409. The partial
//   unique index on processor_subscription_id is the hard backstop, and
//   unique-violation races on the insert are also answered with 409.
// - If membership provisioning fails AFTER the Stripe subscription was
//   billed, the subscription is cancelled immediately (orphan cleanup)
//   so nobody is billed for a membership that doesn't exist.
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
  action: 'start' | 'confirm';
  subscription_id?: string; // confirm only: the Stripe subscription created by 'start'
  payment_method_id?: string; // start only
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

// Errors whose message is safe to show the caller. Everything else (Stripe
// API payloads, PostgREST details, stack traces) is logged and answered
// with a generic message.
class ClientError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Stripe API failure. `type` === 'card_error' means the card itself was
// refused (declined, insufficient funds, 3DS failed) — safe to answer 402.
// Anything else (auth, rate limit, api error) is a server-side problem and
// must surface as a generic 500.
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

// Mandatory plan binding (fail closed): plan_type maps to the configured
// Stripe price id server-side — the caller never sends a price id, so a
// caller cannot pay for a cheap/unknown plan and receive this plan's
// benefits. A missing env var is a misconfiguration and also rejects.
const priceIdForPlan = (env: Record<string, string>, planType: string) => {
  const priceId =
    planType === 'individual' ? env.STRIPE_PRICE_INDIVIDUAL : env.STRIPE_PRICE_FAMILIAR;
  if (!priceId) {
    console.error(
      `[stripe-membership-signup] STRIPE_PRICE_${planType.toUpperCase()} is not configured`
    );
    throw new ClientError('No se pudo verificar el plan seleccionado');
  }
  return priceId;
};

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

// Finds ANY membership row carrying this Stripe subscription id,
// regardless of the customer — the cross-customer replay guard (one paid
// subscription must only ever activate one membership).
const findMembershipBySubscriptionId = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  subscriptionId: string
) => {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, customer_id')
    .eq('processor_subscription_id', subscriptionId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
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
  stripeCustomerId: string,
  stripeSubscriptionId: string
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
      payment_method: 'stripe',
      payment_processor: 'stripe',
      processor_customer_id: stripeCustomerId,
      processor_subscription_id: stripeSubscriptionId,
      status: 'active',
    },
    p_member_names: payload.member_names || [],
    p_terms_accepted_at: payload.terms_accepted_at || null,
  });

  if (error) {
    // Unique-violation race with the partial unique index on
    // memberships.processor_subscription_id: a concurrent signup with the
    // same Stripe subscription won — answer 409, not 500.
    if (error.code === '23505' || /duplicate key/i.test(error.message || '')) {
      throw new ClientError(
        'Esta suscripción ya está asociada a una membresía. Si crees que es un error, contacta a la farmacia.',
        409
      );
    }
    throw error;
  }
  return (data as { membership: Record<string, unknown> }).membership;
};

const reinstateMembership = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  membershipId: string,
  payload: RequestPayload,
  plan: (typeof PLANS)['individual'],
  trackersToFulfill: number,
  currentFulfilled: number,
  stripeCustomerId: string,
  stripeSubscriptionId: string
) => {
  const nextRenewal = addMonthsWithLastDayRule(new Date(), 1);

  // payment_method/payment_processor carry the processor name: renewal
  // bookkeeping (record_membership_payment / process_membership_renewals)
  // uses it to tell processor-billed rows from cash-like rows.
  // pending_cancellation is cleared so a prior self-cancellation doesn't
  // cancel the re-subscribed membership at the next renewal date.
  const { data, error } = await supabase
    .from('memberships')
    .update({
      status: 'active',
      plan_type: payload.plan_type,
      monthly_amount: plan.price,
      visits_remaining: plan.visits,
      visits_limit: plan.visits,
      payment_method: 'stripe',
      payment_processor: 'stripe',
      processor_customer_id: stripeCustomerId,
      processor_subscription_id: stripeSubscriptionId,
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
  console.log('[stripe-membership-signup] notification flush:', res.status, text);
};

// Run the flush in the background when the runtime supports it, otherwise
// inline — never lets a flush failure break the signup response.
const scheduleFlush = async (env: Record<string, string>) => {
  const flush = flushNotifications(env).catch((e) =>
    console.error('[stripe-membership-signup] flush failed:', e)
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
// The signup guards refuse the request with 409 account_exists whenever a
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

// Orphan cleanup: the Stripe subscription was created and billed, but the
// membership could not be provisioned — cancel the subscription right away
// so nobody is charged for a membership that doesn't exist.
const cancelOrphanSubscription = async (
  env: Record<string, string>,
  subscriptionId: string,
  reason: unknown
) => {
  console.error(
    '[stripe-membership-signup] provisioning failed after Stripe billing; cancelling orphan subscription:',
    { subscriptionId, reason }
  );
  try {
    await stripeApi(env, 'DELETE', `/subscriptions/${subscriptionId}`);
    console.error('[stripe-membership-signup] orphan subscription cancelled:', subscriptionId);
  } catch (cancelErr) {
    console.error(
      '[stripe-membership-signup] ORPHAN CLEANUP FAILED — subscription still billing:',
      { subscriptionId, cancelErr }
    );
  }
};

// Shared payload validation for both actions. 'start' requires
// payment_method_id, 'confirm' requires subscription_id; everything else
// (plan_type, org_id, customer email, R2-21 minor/guardian rule) is common.
const validatePayload = (payload: RequestPayload) => {
  if (!payload.action || !['start', 'confirm'].includes(payload.action)) {
    throw new ClientError('action inválida. Usa start o confirm.');
  }
  if (payload.action === 'start' && !payload.payment_method_id) {
    throw new ClientError('payment_method_id requerido');
  }
  if (payload.action === 'confirm' && !payload.subscription_id) {
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
  // Stripe is called and before public_signup_membership runs. Adults:
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
};

type GuardResult =
  | {
      kind: 'ok';
      existingCustomer: Record<string, any> | null;
      existingMembership: Record<string, any> | null;
    }
  | { kind: 'replay'; membership: Record<string, any> }
  | { kind: 'refusal'; response: Response };

// All the signup guards, shared by 'start' (pre-Stripe, with
// stripeSubscriptionId = null so the subscription-dependent checks are
// skipped) and by the post-billing provisioning path (idempotent — a
// portal account could appear between start and confirm, or a concurrent
// signup could win the race).
//
// Throws ClientError for the active/paused-membership conflict; returns a
// refusal Response for the 409 cases (cross-customer replay, account
// takeover); returns 'replay' when this exact subscription already
// activated a membership for this customer.
const checkSignupGuards = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  payload: RequestPayload,
  stripeSubscriptionId: string | null
): Promise<GuardResult> => {
  const existingCustomer = await findCustomerByEmail(
    supabase,
    payload.org_id,
    payload.customer.email
  );

  let existingMembership: Record<string, any> | null = null;
  if (existingCustomer) {
    existingMembership = await findMembershipByCustomer(supabase, existingCustomer.id);

    if (existingMembership && ['active', 'paused'].includes(existingMembership.status)) {
      if (
        stripeSubscriptionId &&
        existingMembership.processor_subscription_id === stripeSubscriptionId
      ) {
        // Replay of the same Stripe subscription (client retry after a
        // network blip, or a repeated 'confirm'): the membership is
        // already registered, so answer success instead of blocking a
        // paid signup. Checked before the account_exists guard so a
        // legit retry still succeeds.
        return { kind: 'replay', membership: existingMembership };
      }
      throw new ClientError(
        'Ya existe una membresía activa o pausada para este correo. Usa el panel de administración para gestionarla.'
      );
    }
  }

  // Cross-customer replay guard: a paid Stripe subscription activates
  // exactly ONE membership. Any memberships row already carrying this
  // processor_subscription_id that belongs to a DIFFERENT customer
  // means the caller is reusing a subscription already consumed under
  // another email — refuse with a generic 409. Same-customer cases
  // never reach this check: the idempotent replay path above already
  // returned for them. The partial unique index on
  // processor_subscription_id is the hard backstop for the remaining
  // race (see createMembership).
  if (stripeSubscriptionId) {
    const consumedMembership = await findMembershipBySubscriptionId(
      supabase,
      stripeSubscriptionId
    );
    if (consumedMembership && consumedMembership.customer_id !== existingCustomer?.id) {
      console.warn(
        '[stripe-membership-signup] subscription id already consumed by another customer:',
        { subscription_id: stripeSubscriptionId }
      );
      return {
        kind: 'refusal',
        response: jsonResponse(
          {
            error:
              'Esta suscripción ya está asociada a una membresía. Si crees que es un error, contacta a la farmacia.',
          },
          409
        ),
      };
    }
  }

  // Account-takeover guard: when a portal account already exists for this
  // email (a profiles row — the handle_new_user trigger creates one per
  // auth user — or a customers.profile_id link), the password in this
  // payload must NEVER be applied to that account: the caller chose it.
  // Refuse and point the user at login / password reset instead.
  const existingProfile = await findProfileByEmail(supabase, payload.customer.email);
  if (existingProfile || existingCustomer?.profile_id) {
    console.warn('[stripe-membership-signup] signup refused: portal account already exists for email');
    return {
      kind: 'refusal',
      response: jsonResponse(
        {
          error: 'account_exists',
          message:
            'Ya existe una cuenta con este correo electrónico. Inicia sesión o restablece tu contraseña desde el portal del cliente; el personal de la farmacia puede ayudarte a asociar tu nueva membresía.',
        },
        409
      ),
    };
  }

  return { kind: 'ok', existingCustomer, existingMembership };
};

// Provisions the membership for a subscription Stripe has confirmed as
// 'active' (billed). Runs ALL the guards (replay-safe), then the
// create/reinstate + portal account + notification flush. Any failure or
// refusal cancels the billed subscription (orphan cleanup) so nobody is
// billed for a membership that doesn't exist.
const provisionMembership = async (
  env: Record<string, string>,
  supabase: ReturnType<typeof supabaseAdmin>,
  payload: RequestPayload,
  plan: (typeof PLANS)['individual'],
  stripeCustomerId: string,
  stripeSubscriptionId: string
): Promise<Response> => {
  try {
    const guard = await checkSignupGuards(supabase, payload, stripeSubscriptionId);

    if (guard.kind === 'refusal') {
      // The Stripe subscription was billed but this signup is refused —
      // cancel it before answering.
      await cancelOrphanSubscription(env, stripeSubscriptionId, 'signup guard refusal');
      return guard.response;
    }

    if (guard.kind === 'replay') {
      await scheduleFlush(env);
      return jsonResponse(
        {
          success: true,
          status: 'active',
          subscription_id: stripeSubscriptionId,
          membership: guard.membership,
          portal_account: 'skipped',
          replayed: true,
        },
        200
      );
    }

    let membership;

    if (guard.existingMembership) {
      // Reactivate cancelled/expired membership.
      membership = await reinstateMembership(
        supabase,
        guard.existingMembership.id,
        payload,
        plan,
        0,
        guard.existingMembership.basic_trackers_fulfilled || 0,
        stripeCustomerId,
        stripeSubscriptionId
      );

      // Re-signup = a new payment: count it toward their milestone
      // progress (payments_made carries over per business rule), book
      // the sale, and fire receipt + welcome emails. Guarded so a
      // bookkeeping hiccup never blocks a paid reactivation.
      try {
        const { error: payError } = await supabase.rpc('record_membership_payment', {
          p_membership_id: membership.id,
          p_amount: plan.price,
          p_payment_method: 'stripe',
          p_staff_id: null,
          p_is_signup: true,
        });
        if (payError) {
          console.error('[stripe-membership-signup] reinstate payment recording failed:', payError);
        }
      } catch (payErr) {
        console.error('[stripe-membership-signup] reinstate payment recording failed:', payErr);
      }
    } else {
      membership = await createMembership(
        supabase,
        payload,
        plan,
        stripeCustomerId,
        stripeSubscriptionId
      );
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
        console.error('[stripe-membership-signup] portal account provisioning error:', provisionError);
        portalAccount = 'error';
      }
    }

    await scheduleFlush(env);

    return jsonResponse(
      {
        success: true,
        status: 'active',
        subscription_id: stripeSubscriptionId,
        membership,
        portal_account: portalAccount,
      },
      200
    );
  } catch (err) {
    // Exception: a thrown 409 here is the unique-violation race from
    // createMembership — a concurrent request already registered THIS
    // subscription on the winning membership row. Cancelling would kill
    // the billing that legitimately backs that membership, so skip the
    // orphan cleanup for it. Every other failure/refusal cancels.
    if (!(err instanceof ClientError && err.status === 409)) {
      await cancelOrphanSubscription(env, stripeSubscriptionId, err);
    }
    throw err;
  }
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

    validatePayload(payload);

    const plan = PLANS[payload.plan_type];
    const priceId = priceIdForPlan(env, payload.plan_type);
    const supabase = supabaseAdmin(env);

    if (payload.action === 'confirm') {
      // ── Phase 2: the client confirmed the first invoice's PaymentIntent
      //    (3DS) with the client_secret returned by 'start'. Re-retrieve
      //    the subscription; only a now-ACTIVE subscription provisions. ──
      const subscriptionId = payload.subscription_id!;

      let subscription: Record<string, any>;
      try {
        subscription = await stripeApi(env, 'GET', `/subscriptions/${subscriptionId}`, {
          'expand[]': 'latest_invoice.payment_intent',
        });
      } catch (err) {
        if (err instanceof StripeApiError && err.status === 404) {
          throw new ClientError('Suscripción de Stripe no encontrada', 404);
        }
        throw err;
      }

      // Mandatory plan binding on confirm too: the subscription's price
      // must be the configured price for the claimed plan_type — otherwise
      // the caller could confirm a cheaper subscription and receive this
      // plan's benefits. A mismatch means the subscription cannot back
      // this membership: cancel it (orphan rule) and refuse.
      const subPriceId = subscription.items?.data?.[0]?.price?.id as string | undefined;
      if (!subPriceId || subPriceId !== priceId) {
        console.warn('[stripe-membership-signup] confirm price mismatch:', {
          subPriceId,
          planType: payload.plan_type,
          subscriptionId,
        });
        await cancelOrphanSubscription(env, subscriptionId, 'price binding mismatch on confirm');
        throw new ClientError('El plan de la suscripción no coincide con el plan seleccionado');
      }

      const subStatus = (subscription.status as string || '').toLowerCase();
      if (subStatus !== 'active') {
        // Still incomplete (3DS not finished or payment failed) — do NOT
        // cancel: the client may finish the action and 'confirm' again;
        // abandoned incomplete subscriptions auto-cancel after 23 h.
        console.log('[stripe-membership-signup] confirm: subscription not active yet:', {
          subscriptionId,
          status: subStatus,
          paymentIntentStatus: subscription.latest_invoice?.payment_intent?.status,
        });
        return jsonResponse({ error: 'El pago aún no se ha completado' }, 402);
      }

      return await provisionMembership(
        env,
        supabase,
        payload,
        plan,
        subscription.customer as string,
        subscriptionId
      );
    }

    // ── action === 'start' ──

    // Pre-Stripe guards: refuse doomed signups before creating anything
    // billable. The same checks run again inside provisionMembership after
    // billing (idempotent).
    const preFlight = await checkSignupGuards(supabase, payload, null);
    if (preFlight.kind === 'refusal') return preFlight.response;

    // ── Stripe: customer → attach payment method → default invoice PM →
    //    subscription with payment_behavior=default_incomplete. When the
    //    card needs 3DS the first invoice's PaymentIntent stays
    //    requires_action and the subscription lands on 'incomplete'; the
    //    caller confirms it client-side and calls action 'confirm'. ──
    const stripeCustomer = await stripeApi(env, 'POST', '/customers', {
      email: normalizeEmail(payload.customer.email),
      name: payload.customer.full_name || '',
      'metadata[org_id]': payload.org_id,
    });
    const stripeCustomerId = stripeCustomer.id as string;

    let subscription: Record<string, any>;
    try {
      await stripeApi(env, 'POST', `/payment_methods/${payload.payment_method_id}/attach`, {
        customer: stripeCustomerId,
      });
      await stripeApi(env, 'POST', `/customers/${stripeCustomerId}`, {
        'invoice_settings[default_payment_method]': payload.payment_method_id,
      });
      subscription = await stripeApi(env, 'POST', '/subscriptions', {
        customer: stripeCustomerId,
        'items[0][price]': priceId,
        default_payment_method: payload.payment_method_id!,
        payment_behavior: 'default_incomplete',
        'expand[]': 'latest_invoice.payment_intent',
      });
    } catch (err) {
      if (err instanceof StripeApiError && (err.type === 'card_error' || err.status === 402)) {
        console.error('[stripe-membership-signup] card refused:', {
          code: err.code,
          status: err.status,
        });
        return jsonResponse(
          {
            error:
              'El pago con tarjeta fue rechazado. Verifica los datos y los fondos de la tarjeta e intenta de nuevo.',
          },
          402
        );
      }
      throw err;
    }

    const stripeSubscriptionId = subscription.id as string;
    const subStatus = (subscription.status as string || '').toLowerCase();

    // No 3DS needed: the first invoice already paid — provision now.
    if (subStatus === 'active') {
      return await provisionMembership(
        env,
        supabase,
        payload,
        plan,
        stripeCustomerId,
        stripeSubscriptionId
      );
    }

    // 3DS (or another next-action) required: provision NOTHING, hand the
    // invoice PaymentIntent's client_secret back for client-side
    // confirmation. The client then calls action 'confirm'.
    if (subStatus === 'incomplete') {
      const clientSecret = subscription.latest_invoice?.payment_intent?.client_secret as
        | string
        | undefined;
      if (!clientSecret) {
        await cancelOrphanSubscription(
          env,
          stripeSubscriptionId,
          'incomplete subscription without payment intent client_secret'
        );
        throw new Error('Stripe subscription incomplete but no payment intent client_secret');
      }
      return jsonResponse(
        {
          success: true,
          status: 'requires_payment_action',
          subscription_id: stripeSubscriptionId,
          stripe_customer_id: stripeCustomerId,
          client_secret: clientSecret,
        },
        200
      );
    }

    // Any other status (incomplete_expired, canceled, ...) means the first
    // payment did not and will not confirm on this subscription: cancel it
    // so it cannot bill later and answer 402.
    console.error('[stripe-membership-signup] unexpected subscription status on start:', {
      subscriptionId: stripeSubscriptionId,
      status: subStatus,
      paymentIntentStatus: subscription.latest_invoice?.payment_intent?.status,
    });
    await cancelOrphanSubscription(env, stripeSubscriptionId, `unexpected status=${subStatus}`);
    return jsonResponse(
      {
        error:
          'No se pudo completar el pago con tu tarjeta. Es posible que tu banco requiera una verificación adicional o que la tarjeta no tenga fondos. Intenta con otra tarjeta o contacta a tu banco.',
      },
      402
    );
  } catch (err) {
    console.error('[stripe-membership-signup] error:', err);
    if (err instanceof ClientError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    return jsonResponse(
      { error: 'No se pudo procesar la suscripción. Intenta de nuevo o contacta a la farmacia.' },
      500
    );
  }
});
