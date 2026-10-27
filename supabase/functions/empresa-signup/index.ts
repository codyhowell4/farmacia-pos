// Supabase Edge Function: empresa-signup
// Plan Empresa signup: a business buys N seats at $100 MXN/mo per employee
// (Stripe subscription, quantity = N) with the first month free (30-day
// trial). Public (verify_jwt = false, supabase/config.toml): the buyer has
// no session yet. Abuse bounded by per-IP rate limiting (rate_limit_events,
// fail-open like affiliate-signup).
//
// Two-phase SetupIntent flow (Mexican cards almost always require 3DS; a
// trial subscription has no first invoice to confirm, so the card is
// verified up front with a SetupIntent instead):
// - action 'start': validates, runs the pre-Stripe dedupe guard, creates
//   the Stripe customer + SetupIntent (usage=off_session) and returns its
//   client_secret. NOTHING is provisioned and nothing is billable yet.
// - action 'confirm': after the client confirmed the SetupIntent with
//   Stripe.js, re-retrieves it, requires status 'succeeded' + the same
//   customer id, then creates the trialing subscription
//   (items[0][quantity] = seats, trial_end = now + 30 d,
//   default_payment_method from the setup intent) and provisions:
//   customers row (find-or-create), memberships row (plan_type 'empresa',
//   setup_token valid 48 h), the owner membership_members row, the
//   contact's portal account, and the welcome + setup emails.
//
// Security posture (mirrors stripe-membership-signup, audit R2-9 / R2-38):
// - Only a SUCCEEDED SetupIntent + an active/trialing Stripe subscription
//   activates anything; the price id is bound server-side to
//   STRIPE_PRICE_EMPRESA (fail closed) — the caller never supplies a price.
// - Dedupe guard: an active/paused/pending_payment empresa membership for
//   the same exact (lower) email or same phone in this org rejects the
//   signup. Re-checked after billing (idempotent); a retry of the same
//   confirm answers as a replay instead of a conflict.
// - If membership provisioning fails AFTER the Stripe subscription was
//   created, the subscription is cancelled immediately (orphan cleanup).
// - Client-facing errors are generic; details are logged server-side only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PRICE_PER_SEAT = 100; // MXN/mo per employee
const MAX_SEATS = 100;
const VISITS_PER_SEAT = 2; // shared pool
const TRIAL_DAYS = 30;
const SETUP_TOKEN_TTL_MS = 48 * 3600 * 1000;
const RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

const DEFAULT_ORIGIN = 'https://app.apolofarmacia.com.mx';
const ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?apolofarmacia\.com\.mx$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface ContactPayload {
  full_name: string;
  email: string;
  phone: string;
}

interface RequestPayload {
  action: 'start' | 'confirm';
  company_name?: string;
  contact?: ContactPayload;
  seats?: number;
  password?: string;
  org_id?: string;
  terms_accepted_at?: string;
  origin?: string;
  setup_intent_id?: string; // confirm only
  stripe_customer_id?: string; // confirm only: the customer id returned by 'start'
}

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
// refused — safe to answer 402. Anything else is a server-side problem and
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

// The redirect target for GoTrue emails must stay on our own app: take the
// caller-supplied origin (or the Origin header) only when it is an
// apolofarmacia.com.mx host, otherwise fall back to the configured one.
const resolveOrigin = (req: Request, payloadOrigin?: string) => {
  for (const candidate of [payloadOrigin, req.headers.get('origin')]) {
    const value = (candidate || '').trim().replace(/\/+$/, '');
    if (value && ORIGIN_RE.test(value)) return value;
  }
  return DEFAULT_ORIGIN;
};

// Sliding-window per-IP rate limit. Fails open (with a warning) if the
// rate_limit_events table is unreachable — signups must keep working.
const checkRateLimit = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  ip: string | null
): Promise<boolean> => {
  const key = ip || 'unknown';
  try {
    const since = new Date(Date.now() - RATE_LIMIT.windowMs).toISOString();
    const { count, error } = await supabase
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', 'empresa-signup')
      .eq('key', key)
      .gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= RATE_LIMIT.limit) return false;
    const { error: insError } = await supabase
      .from('rate_limit_events')
      .insert({ bucket: 'empresa-signup', key });
    if (insError) throw insError;
    if (Math.random() < 0.02) {
      await supabase
        .from('rate_limit_events')
        .delete()
        .lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    }
    return true;
  } catch (err) {
    console.warn('[empresa-signup] rate limit unavailable; allowing request:', err);
    return true;
  }
};

// Mandatory price binding (fail closed): the caller never sends a price id.
const empresaPriceId = (env: Record<string, string>) => {
  const priceId = env.STRIPE_PRICE_EMPRESA;
  if (!priceId) {
    console.error('[empresa-signup] STRIPE_PRICE_EMPRESA is not configured');
    throw new ClientError('No se pudo verificar el plan seleccionado');
  }
  return priceId;
};

// Customers matching the contact by EXACT (case-insensitive) email or by
// exact phone, org-scoped. ilike with a wildcard-free value is a
// case-insensitive exact match; the JS re-check guards against % / _ in the
// email local part.
const findCustomersByContact = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  email: string,
  phone: string
) => {
  const found = new Map<string, Record<string, any>>();

  if (email) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('org_id', orgId)
      .ilike('email', email)
      .limit(5);
    if (error) throw error;
    for (const c of data || []) {
      if (normalizeEmail(c.email || '') === email) found.set(c.id as string, c);
    }
  }

  if (phone) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('org_id', orgId)
      .eq('phone', phone)
      .limit(5);
    if (error) throw error;
    for (const c of data || []) found.set(c.id as string, c);
  }

  return [...found.values()];
};

// One active-ish Plan Empresa per contact: the dedupe guard.
const findLiveEmpresaMembership = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  customerIds: string[]
) => {
  if (customerIds.length === 0) return null;
  const { data, error } = await supabase
    .from('memberships')
    .select('id, plan_id, status, customer_id, processor_subscription_id, setup_token, setup_token_expires_at')
    .in('customer_id', customerIds)
    .eq('plan_type', 'empresa')
    .in('status', ['active', 'paused', 'pending_payment'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
};

// Date columns are calendar dates: render the trial end in Mexico City
// time so a late-evening signup never rolls the renewal to the wrong day.
const localDateString = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

const isAlreadyRegisteredError = (err: { message?: string; code?: string }) => {
  const code = (err.code || '').toLowerCase();
  if (code.includes('already') || code.includes('exist')) return true;
  return /already|exist|registered|duplicate/i.test(err.message || '');
};

// Provisions a customer portal auth account and links it to the given
// customers row via customers.profile_id (same pattern as
// create-portal-account): the handle_new_user trigger's duplicate
// customers row is removed before linking. An already-registered account
// is reused as-is — its password is NEVER touched.
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

  return { userId, accountExisted };
};

// Flush the notification queue right away so welcome/setup emails land
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
  console.log('[empresa-signup] notification flush:', res.status, text);
};

const scheduleFlush = async (env: Record<string, string>) => {
  const flush = flushNotifications(env).catch((e) =>
    console.error('[empresa-signup] flush failed:', e)
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

// Orphan cleanup: the Stripe subscription exists (and will bill after the
// trial) but the membership could not be provisioned — cancel it right
// away so nobody is charged for a membership that doesn't exist.
const cancelOrphanSubscription = async (
  env: Record<string, string>,
  subscriptionId: string,
  reason: unknown
) => {
  console.error(
    '[empresa-signup] provisioning failed after subscription creation; cancelling orphan subscription:',
    { subscriptionId, reason }
  );
  try {
    await stripeApi(env, 'DELETE', `/subscriptions/${subscriptionId}`);
    console.error('[empresa-signup] orphan subscription cancelled:', subscriptionId);
  } catch (cancelErr) {
    console.error(
      '[empresa-signup] ORPHAN CLEANUP FAILED — subscription still active:',
      { subscriptionId, cancelErr }
    );
  }
};

// Shared payload validation for both actions. 'confirm' additionally
// requires the SetupIntent + customer id returned by 'start'.
const validatePayload = (payload: RequestPayload) => {
  if (!payload.action || !['start', 'confirm'].includes(payload.action)) {
    throw new ClientError('action inválida. Usa start o confirm.');
  }
  if (payload.action === 'confirm' && !payload.setup_intent_id) {
    throw new ClientError('setup_intent_id requerido');
  }
  if (payload.action === 'confirm' && !payload.stripe_customer_id) {
    throw new ClientError('stripe_customer_id requerido');
  }
  if (!(payload.company_name || '').trim() || payload.company_name!.trim().length < 2) {
    throw new ClientError('El nombre de la empresa es requerido');
  }
  if (!(payload.contact?.full_name || '').trim()) {
    throw new ClientError('El nombre del contacto es requerido');
  }
  if (!EMAIL_RE.test(normalizeEmail(payload.contact?.email || ''))) {
    throw new ClientError('El correo electrónico del contacto es inválido');
  }
  if ((payload.contact?.phone || '').replace(/\D/g, '').length < 7) {
    throw new ClientError('El teléfono del contacto es requerido');
  }
  const seats = payload.seats;
  if (!Number.isInteger(seats) || seats! < 1 || seats! > MAX_SEATS) {
    throw new ClientError(`El número de lugares debe ser entre 1 y ${MAX_SEATS}`);
  }
  if (!payload.org_id) {
    throw new ClientError('org_id requerido');
  }
  // Public flow (R2-30): the contact picks their portal password here.
  if (!payload.password || payload.password.length < 10) {
    throw new ClientError('La contraseña debe tener al menos 10 caracteres');
  }
};

// The dedupe guard, shared by 'start' (pre-Stripe) and the post-billing
// provisioning path (idempotent): any live empresa membership for the
// contact's email/phone blocks a second signup.
const checkDedupeGuard = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  payload: RequestPayload
) => {
  const email = normalizeEmail(payload.contact!.email);
  const phone = (payload.contact!.phone || '').trim();
  const customers = await findCustomersByContact(supabase, payload.org_id!, email, phone);
  const live = await findLiveEmpresaMembership(
    supabase,
    customers.map((c) => c.id as string)
  );
  return { customers, live };
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

    const supabase = supabaseAdmin(env);

    const ip =
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      null;
    const withinLimit = await checkRateLimit(supabase, ip);
    if (!withinLimit) {
      return jsonResponse(
        { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
        429
      );
    }

    validatePayload(payload);

    const origin = resolveOrigin(req, payload.origin);
    const companyName = payload.company_name!.trim();
    const contactName = payload.contact!.full_name.trim();
    const contactEmail = normalizeEmail(payload.contact!.email);
    const contactPhone = payload.contact!.phone.trim();
    const seats = payload.seats!;
    const priceId = empresaPriceId(env);

    if (payload.action === 'start') {
      // Pre-Stripe guard: refuse doomed signups before creating anything.
      const pre = await checkDedupeGuard(supabase, payload);
      if (pre.live) {
        throw new ClientError(
          'Ya existe un Plan Empresa activo para este correo o teléfono. Contacta a la farmacia para gestionarlo.',
          409
        );
      }

      const stripeCustomer = await stripeApi(env, 'POST', '/customers', {
        email: contactEmail,
        name: companyName,
        'metadata[org_id]': payload.org_id!,
        'metadata[plan]': 'empresa',
      });
      const stripeCustomerId = stripeCustomer.id as string;

      // The card is verified with a SetupIntent (usage off_session) so the
      // trial subscription can bill it later without the buyer present.
      const setupIntent = await stripeApi(env, 'POST', '/setup_intents', {
        customer: stripeCustomerId,
        usage: 'off_session',
        'metadata[org_id]': payload.org_id!,
        'metadata[plan]': 'empresa',
      });

      return jsonResponse(
        {
          status: 'requires_setup',
          client_secret: setupIntent.client_secret as string,
          stripe_customer_id: stripeCustomerId,
        },
        200
      );
    }

    // ── action === 'confirm' ──
    const setupIntentId = payload.setup_intent_id!;

    let setupIntent: Record<string, any>;
    try {
      setupIntent = await stripeApi(env, 'GET', `/setup_intents/${setupIntentId}`);
    } catch (err) {
      if (err instanceof StripeApiError && err.status === 404) {
        throw new ClientError('Verificación de tarjeta no encontrada', 404);
      }
      throw err;
    }

    if ((setupIntent.status as string || '').toLowerCase() !== 'succeeded') {
      return jsonResponse({ error: 'El método de pago aún no se ha verificado' }, 402);
    }
    if (setupIntent.customer !== payload.stripe_customer_id) {
      console.warn('[empresa-signup] setup intent customer mismatch:', {
        setupIntentId,
        expected: payload.stripe_customer_id,
        actual: setupIntent.customer,
      });
      throw new ClientError('No se pudo verificar el método de pago');
    }

    const paymentMethodId = setupIntent.payment_method as string | undefined;
    if (!paymentMethodId) {
      throw new ClientError('No se pudo verificar el método de pago');
    }

    // Idempotent replay / dedupe: a live empresa membership with a
    // processor subscription means an earlier confirm of this same flow
    // already provisioned (the pre-Stripe guard in 'start' rejects any
    // pre-existing one) — answer success instead of double-billing.
    const guard = await checkDedupeGuard(supabase, payload);
    if (guard.live) {
      if (guard.live.processor_subscription_id) {
        const tokenValid =
          guard.live.setup_token &&
          guard.live.setup_token_expires_at &&
          new Date(guard.live.setup_token_expires_at as string) > new Date();
        await scheduleFlush(env);
        return jsonResponse(
          {
            status: 'active',
            membership_id: guard.live.id,
            ...(tokenValid
              ? { setup_url: `${origin}/membresia-negocios/activar?setup=${guard.live.setup_token}` }
              : {}),
            replayed: true,
          },
          200
        );
      }
      throw new ClientError(
        'Ya existe un Plan Empresa activo para este correo o teléfono. Contacta a la farmacia para gestionarlo.',
        409
      );
    }

    // Create the trialing subscription: quantity = seats, first month free.
    const trialEnd = Math.floor((Date.now() + TRIAL_DAYS * 86400000) / 1000);
    let subscription: Record<string, any>;
    try {
      subscription = await stripeApi(env, 'POST', '/subscriptions', {
        customer: payload.stripe_customer_id!,
        'items[0][price]': priceId,
        'items[0][quantity]': String(seats),
        trial_end: String(trialEnd),
        default_payment_method: paymentMethodId,
        'metadata[org_id]': payload.org_id!,
        'metadata[plan]': 'empresa',
      });
    } catch (err) {
      if (err instanceof StripeApiError && (err.type === 'card_error' || err.status === 402)) {
        console.error('[empresa-signup] card refused:', { code: err.code, status: err.status });
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

    const subscriptionId = subscription.id as string;
    const subStatus = (subscription.status as string || '').toLowerCase();
    if (!['active', 'trialing'].includes(subStatus)) {
      console.error('[empresa-signup] unexpected subscription status on confirm:', {
        subscriptionId,
        status: subStatus,
      });
      await cancelOrphanSubscription(env, subscriptionId, `unexpected status=${subStatus}`);
      return jsonResponse(
        { error: 'No se pudo activar la suscripción con tu tarjeta. Intenta con otra tarjeta o contacta a tu banco.' },
        402
      );
    }

    // ── Provisioning (orphan rule: any failure cancels the subscription) ──
    try {
      // Find-or-create the contact's customers row (exact email, then phone).
      let customer = guard.customers[0] || null;
      if (!customer) {
        const { data: inserted, error: insertError } = await supabase
          .from('customers')
          .insert({
            org_id: payload.org_id,
            full_name: contactName,
            email: contactEmail,
            phone: contactPhone,
          })
          .select('*')
          .single();
        if (insertError) throw insertError;
        customer = inserted;
      }

      const renewalDate = localDateString(new Date(trialEnd * 1000));
      const setupToken = crypto.randomUUID();
      const setupTokenExpiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString();

      let membership: Record<string, any>;
      try {
        const { data, error } = await supabase
          .from('memberships')
          .insert({
            org_id: payload.org_id,
            customer_id: customer.id,
            plan_type: 'empresa',
            company_name: companyName,
            seats,
            status: 'active',
            monthly_amount: PRICE_PER_SEAT * seats,
            discount_percent: 10,
            visits_limit: VISITS_PER_SEAT * seats,
            visits_remaining: VISITS_PER_SEAT * seats,
            premium_trackers: 0,
            basic_trackers_included: 0,
            basic_trackers_fulfilled: 0,
            payment_method: 'stripe',
            payment_processor: 'stripe',
            processor_customer_id: payload.stripe_customer_id,
            processor_subscription_id: subscriptionId,
            next_renewal_date: renewalDate,
            renewal_day: Number(renewalDate.split('-')[2]),
            terms_accepted_at: payload.terms_accepted_at || null,
            setup_token: setupToken,
            setup_token_expires_at: setupTokenExpiresAt,
          })
          .select('*')
          .single();
        if (error) throw error;
        membership = data;
      } catch (insertErr) {
        // Unique-violation race with the partial unique index on
        // memberships.processor_subscription_id: a concurrent confirm won —
        // answer 409 and do NOT cancel (the subscription backs their row).
        const code = (insertErr as { code?: string }).code;
        const message = (insertErr as { message?: string }).message || '';
        if (code === '23505' || /duplicate key/i.test(message)) {
          throw new ClientError(
            'Esta suscripción ya está asociada a una membresía. Si crees que es un error, contacta a la farmacia.',
            409
          );
        }
        throw insertErr;
      }

      const planId = membership.plan_id as string;

      // Owner roster row (seat 1).
      const { error: ownerError } = await supabase.from('membership_members').insert({
        membership_id: membership.id,
        sub_id: `${planId}-1`,
        name: contactName,
        is_owner: true,
        email: contactEmail,
        phone: contactPhone,
      });
      if (ownerError) throw ownerError;

      // Contact's portal account (the buyer manages the roster from the
      // customer portal). Errors are logged, never block the purchase.
      let portalAccount: 'created' | 'linked' | 'error' = 'error';
      try {
        const { userId, accountExisted } = await provisionPortalAccount(
          supabase,
          { id: customer.id, email: contactEmail, profile_id: customer.profile_id ?? null },
          payload.org_id!,
          payload.password!
        );
        portalAccount = accountExisted ? 'linked' : 'created';

        // Stamp the owner member row so roster authz also resolves via
        // membership_members.claimed_user_id.
        await supabase
          .from('membership_members')
          .update({ claimed_user_id: userId })
          .eq('membership_id', membership.id)
          .eq('is_owner', true);
      } catch (provisionError) {
        console.error('[empresa-signup] portal account provisioning error:', provisionError);
      }

      // Welcome (existing template, same payload shape as
      // record_membership_payment) + the Plan Empresa setup email.
      const setupUrl = `${origin}/membresia-negocios/activar?setup=${setupToken}`;
      const { error: notifyError } = await supabase.from('notification_queue').insert([
        {
          org_id: payload.org_id,
          channel: 'email',
          recipient: contactEmail,
          template: 'membership_welcome',
          payload: {
            membership_id: membership.id,
            plan_id: planId,
            patient_name: contactName,
            plan_type: 'empresa',
            monthly_amount: PRICE_PER_SEAT * seats,
            visits_limit: VISITS_PER_SEAT * seats,
            discount_percent: 10,
            next_renewal_date: renewalDate,
          },
          scheduled_for: new Date().toISOString(),
        },
        {
          org_id: payload.org_id,
          channel: 'email',
          recipient: contactEmail,
          template: 'membership_empresa_setup',
          payload: {
            company_name: companyName,
            patient_name: contactName,
            seats,
            setup_url: setupUrl,
          },
          scheduled_for: new Date().toISOString(),
        },
      ]);
      if (notifyError) console.error('[empresa-signup] notification enqueue failed:', notifyError);

      await scheduleFlush(env);

      return jsonResponse(
        {
          status: 'active',
          membership_id: membership.id,
          plan_id: planId,
          subscription_id: subscriptionId,
          portal_account: portalAccount,
          setup_url: setupUrl,
        },
        200
      );
    } catch (err) {
      // A thrown 409 here is the unique-violation race on the membership
      // insert — a concurrent request registered THIS subscription on the
      // winning row, so cancelling would kill legitimate billing. Every
      // other failure cancels the orphan subscription.
      if (!(err instanceof ClientError && err.status === 409)) {
        await cancelOrphanSubscription(env, subscriptionId, err);
      }
      throw err;
    }
  } catch (err) {
    console.error('[empresa-signup] error:', err);
    if (err instanceof ClientError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    return jsonResponse(
      { error: 'No se pudo procesar la suscripción. Intenta de nuevo o contacta a la farmacia.' },
      500
    );
  }
});
