// Supabase Edge Function: empresa-roster
// Plan Empresa roster management from the customer portal: the employer's
// portal session (verify_jwt = true, supabase/config.toml) lists, adds and
// removes employees on their empresa membership.
//
// AuthZ: the caller (auth.getUser) must OWN an empresa membership — either
// the membership's customers row is linked to their profile
// (customers.profile_id = caller) or the owner membership_members row
// carries claimed_user_id = caller.
//
// Billing stays in sync with the roster: adding beyond the current seat
// count bumps the Stripe subscription quantity first (the seat is billed
// before it is provisioned); removing shrinks the quantity when the roster
// drops below the paid seats (never below 1).
//
// Client-facing errors are generic (R2-38); details are logged server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PRICE_PER_SEAT = 100; // MXN/mo per employee
const VISITS_PER_SEAT = 2; // shared pool

const DEFAULT_ORIGIN = 'https://app.apolofarmacia.com.mx';
const ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?apolofarmacia\.com\.mx$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface RequestPayload {
  action?: 'list' | 'add' | 'remove';
  membership_id?: string; // optional: disambiguates when the caller owns several
  name?: string; // add
  email?: string; // add
  phone?: string; // add
  member_id?: string; // remove
  origin?: string; // base URL for the employee's set-password email
}

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

const supabaseAdmin = (env: Record<string, string>) => {
  const url = env.SUPABASE_URL!;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

const normalizeEmail = (email: string) => (email || '').trim().toLowerCase();

const resolveOrigin = (req: Request, payloadOrigin?: string) => {
  for (const candidate of [payloadOrigin, req.headers.get('origin')]) {
    const value = (candidate || '').trim().replace(/\/+$/, '');
    if (value && ORIGIN_RE.test(value)) return value;
  }
  return DEFAULT_ORIGIN;
};

// Minimal Stripe REST client: plain fetch, form-encoded bodies, Bearer key.
const stripeApi = async (
  env: Record<string, string>,
  method: 'GET' | 'POST',
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

// Sets the Stripe subscription quantity (one item, quantity = seats).
const setStripeQuantity = async (
  env: Record<string, string>,
  subscriptionId: string,
  quantity: number
) => {
  const subscription = await stripeApi(env, 'GET', `/subscriptions/${subscriptionId}`);
  const itemId = subscription.items?.data?.[0]?.id as string | undefined;
  if (!itemId) throw new Error('Stripe subscription has no items');
  await stripeApi(env, 'POST', `/subscriptions/${subscriptionId}`, {
    'items[0][id]': itemId,
    'items[0][quantity]': String(quantity),
  });
};

// "Crea tu contraseña" email: GoTrue recovery against the app origin.
// Uses an anon-key client when SUPABASE_ANON_KEY is configured; otherwise
// calls the GoTrue /recover endpoint directly with the service key.
const sendPasswordSetupEmail = async (
  env: Record<string, string>,
  email: string,
  redirectTo: string
) => {
  const anonKey = env.SUPABASE_ANON_KEY;
  if (anonKey) {
    const anonClient = createClient(env.SUPABASE_URL!, anonKey, {
      auth: { persistSession: false },
    });
    const { error } = await anonClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return;
  }

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GoTrue recover failed: ${res.status} ${text}`);
  }
};

const isAlreadyRegisteredError = (err: { message?: string; code?: string }) => {
  const code = (err.code || '').toLowerCase();
  if (code.includes('already') || code.includes('exist')) return true;
  return /already|exist|registered|duplicate/i.test(err.message || '');
};

// Provisions a customer portal auth account (random password — the real
// one arrives via the recovery email) and links it to the given customers
// row via customers.profile_id. Same pattern as create-portal-account: the
// handle_new_user trigger's duplicate customers row is removed before
// linking; an already-registered account is reused as-is and its password
// is NEVER touched.
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

// Find-or-create the employee's customers row in this org: exact
// (case-insensitive) email match first, then exact phone. A row found by
// phone gets the email backfilled when it has none.
const findOrCreateCustomer = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  name: string,
  email: string,
  phone: string
) => {
  let customer: Record<string, any> | null = null;

  if (email) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('org_id', orgId)
      .ilike('email', email)
      .limit(5);
    if (error) throw error;
    customer = (data || []).find((c) => normalizeEmail(c.email || '') === email) || null;
  }

  if (!customer && phone) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('org_id', orgId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    customer = data || null;
  }

  if (!customer) {
    const { data, error } = await supabase
      .from('customers')
      .insert({
        org_id: orgId,
        full_name: name,
        email: email || null,
        phone: phone || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    customer = data;
  } else if (email && !customer.email) {
    const { error } = await supabase.from('customers').update({ email }).eq('id', customer.id);
    if (error) throw error;
    customer.email = email;
  }

  return customer;
};

// Next free sub_id suffix: plan_id-N where N = max existing N + 1.
const nextSubId = (planId: string, existingSubIds: string[]) => {
  let max = 0;
  for (const subId of existingSubIds) {
    const match = new RegExp(`^${planId}-(\\d+)$`).exec(subId || '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${planId}-${max + 1}`;
};

// Resolves the empresa membership the caller owns. Optional membership_id
// disambiguates when the caller owns more than one.
const findOwnedEmpresaMembership = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  membershipId?: string
) => {
  const { data: customerRows, error: customerError } = await supabase
    .from('customers')
    .select('id')
    .eq('profile_id', userId);
  if (customerError) throw customerError;

  const { data: ownerRows, error: ownerError } = await supabase
    .from('membership_members')
    .select('membership_id')
    .eq('claimed_user_id', userId)
    .eq('is_owner', true);
  if (ownerError) throw ownerError;

  let query = supabase
    .from('memberships')
    .select('id, org_id, customer_id, plan_id, plan_type, status, company_name, seats, monthly_amount, processor_subscription_id')
    .eq('plan_type', 'empresa')
    .order('created_at', { ascending: false })
    .limit(5);

  if (membershipId) {
    query = query.eq('id', membershipId);
  } else {
    const ownerMembershipIds = (ownerRows || []).map((r) => r.membership_id as string);
    const customerIds = (customerRows || []).map((r) => r.id as string);
    if (ownerMembershipIds.length > 0 && customerIds.length > 0) {
      query = query.or(
        `customer_id.in.(${customerIds.join(',')}),id.in.(${ownerMembershipIds.join(',')})`
      );
    } else if (ownerMembershipIds.length > 0) {
      query = query.in('id', ownerMembershipIds);
    } else if (customerIds.length > 0) {
      query = query.in('customer_id', customerIds);
    } else {
      return null; // the caller owns nothing
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  // With an explicit membership_id, ownership still has to check out.
  for (const m of data || []) {
    const viaCustomer = (customerRows || []).some((c) => c.id === m.customer_id);
    const viaOwnerRow = (ownerRows || []).some((r) => r.membership_id === m.id);
    if (viaCustomer || viaOwnerRow) return m;
  }
  return null;
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
    if (!payload.action || !['list', 'add', 'remove'].includes(payload.action)) {
      throw new ClientError("action inválida. Usa 'list', 'add' o 'remove'.");
    }

    // AuthZ: the caller must own an empresa membership.
    const membership = await findOwnedEmpresaMembership(
      supabase,
      user.id,
      payload.membership_id
    );
    if (!membership) {
      return jsonResponse({ error: 'No tienes permiso para gestionar esta membresía' }, 403);
    }

    const { data: members, error: membersError } = await supabase
      .from('membership_members')
      .select('id, sub_id, name, email, phone, is_owner, claimed_user_id')
      .eq('membership_id', membership.id)
      .order('sub_id', { ascending: true });
    if (membersError) throw membersError;

    const roster = members || [];
    const seats = (membership.seats as number) || 0;

    if (payload.action === 'list') {
      return jsonResponse(
        {
          membership_id: membership.id,
          plan_id: membership.plan_id,
          company_name: membership.company_name,
          status: membership.status,
          seats,
          seats_used: roster.length,
          monthly_amount: membership.monthly_amount,
          price_per_seat: PRICE_PER_SEAT,
          members: roster.map((m) => ({
            id: m.id,
            sub_id: m.sub_id,
            name: m.name,
            email: m.email,
            phone: m.phone,
            is_owner: m.is_owner,
            claimed: !!m.claimed_user_id,
          })),
        },
        200
      );
    }

    if (payload.action === 'add') {
      const name = (payload.name || '').trim();
      const email = normalizeEmail(payload.email || '');
      const phone = (payload.phone || '').trim();

      if (!name || name.length < 2) throw new ClientError('El nombre del empleado es requerido');
      if (!email && !phone) throw new ClientError('Se requiere correo o teléfono del empleado');
      if (email && !EMAIL_RE.test(email)) throw new ClientError('Correo inválido');

      // Duplicate on the roster: skipped, not an error.
      const duplicate = roster.some(
        (m) =>
          (email && normalizeEmail(m.email || '') === email) ||
          (phone && (m.phone || '').trim() === phone)
      );
      if (duplicate) {
        return jsonResponse(
          { success: true, status: 'roster_only', note: 'Ya estaba registrado', seats, seats_used: roster.length },
          200
        );
      }

      // Roster full: the new seat must be billed BEFORE it is provisioned.
      let seatsChanged = false;
      if (roster.length >= seats) {
        const newSeats = seats + 1;
        if (membership.processor_subscription_id) {
          try {
            await setStripeQuantity(
              env,
              membership.processor_subscription_id as string,
              newSeats
            );
          } catch (stripeErr) {
            console.error('[empresa-roster] seat bump failed:', stripeErr);
            throw new ClientError(
              'No se pudo agregar un lugar a la suscripción. Inténtalo de nuevo o contacta a la farmacia.'
            );
          }
        }
        const { error: seatError } = await supabase
          .from('memberships')
          .update({
            seats: newSeats,
            visits_limit: VISITS_PER_SEAT * newSeats,
            monthly_amount: PRICE_PER_SEAT * newSeats,
            updated_at: new Date().toISOString(),
          })
          .eq('id', membership.id);
        if (seatError) throw seatError;
        seatsChanged = true;
      }

      // Provision: customers row, portal account + setup email, member row.
      try {
        const origin = resolveOrigin(req, payload.origin);
        const customer = await findOrCreateCustomer(
          supabase,
          membership.org_id as string,
          name,
          email,
          phone
        );

        let userId: string | null = null;
        if (email) {
          const { userId: uid } = await provisionPortalAccount(
            supabase,
            { id: customer.id as string, email, profile_id: (customer.profile_id as string | null) ?? null },
            membership.org_id as string,
            crypto.randomUUID() + crypto.randomUUID()
          );
          userId = uid;
          await sendPasswordSetupEmail(env, email, `${origin}/reset-password`);
        }

        const subId = nextSubId(
          membership.plan_id as string,
          roster.map((m) => m.sub_id as string)
        );
        const { data: member, error: memberError } = await supabase
          .from('membership_members')
          .insert({
            membership_id: membership.id,
            sub_id: subId,
            name,
            is_owner: false,
            email: email || null,
            phone: phone || null,
            claimed_user_id: userId,
          })
          .select('id, sub_id, name, email, phone')
          .single();
        if (memberError) throw memberError;

        return jsonResponse(
          {
            success: true,
            status: email ? 'invited' : 'roster_only',
            ...(email
              ? {}
              : { note: 'Sin correo: quedó en la lista pero sin cuenta del portal' }),
            member,
            seats: seatsChanged ? seats + 1 : seats,
            seats_used: roster.length + 1,
            seats_changed: seatsChanged,
          },
          200
        );
      } catch (err) {
        if (err instanceof ClientError) throw err;
        console.error('[empresa-roster] employee provisioning failed:', err);
        throw new ClientError('No se pudo registrar al empleado. Inténtalo de nuevo.');
      }
    }

    // ── action === 'remove' ──
    const memberId = (payload.member_id || '').trim();
    if (!memberId) throw new ClientError('member_id requerido');

    const member = roster.find((m) => m.id === memberId);
    if (!member) throw new ClientError('Empleado no encontrado en esta membresía', 404);
    if (member.is_owner) {
      throw new ClientError('No puedes eliminar al contacto principal de la empresa');
    }

    const { error: deleteError } = await supabase
      .from('membership_members')
      .delete()
      .eq('id', memberId)
      .eq('membership_id', membership.id);
    if (deleteError) throw deleteError;

    const remaining = roster.length - 1;
    let seatsChanged = false;
    let warning: string | undefined;

    // Shrink the paid seats when the roster dropped below them (never < 1).
    if (remaining < seats) {
      const newSeats = Math.max(1, seats - 1);
      if (newSeats < seats) {
        if (membership.processor_subscription_id) {
          try {
            await setStripeQuantity(
              env,
              membership.processor_subscription_id as string,
              newSeats
            );
          } catch (stripeErr) {
            console.error('[empresa-roster] seat decrease failed:', stripeErr);
            warning =
              'El empleado se eliminó, pero no pudimos ajustar el cobro en Stripe automáticamente. Por favor avisa al personal de la farmacia.';
          }
        }
        if (!warning) {
          const { error: seatError } = await supabase
            .from('memberships')
            .update({
              seats: newSeats,
              visits_limit: VISITS_PER_SEAT * newSeats,
              monthly_amount: PRICE_PER_SEAT * newSeats,
              updated_at: new Date().toISOString(),
            })
            .eq('id', membership.id);
          if (seatError) throw seatError;
          seatsChanged = true;
        }
      }
    }

    return jsonResponse(
      {
        success: true,
        removed_member_id: memberId,
        seats: seatsChanged ? Math.max(1, seats - 1) : seats,
        seats_used: remaining,
        seats_changed: seatsChanged,
        ...(warning ? { warning } : {}),
      },
      200
    );
  } catch (err) {
    console.error('[empresa-roster] error:', err);
    if (err instanceof ClientError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    return jsonResponse({ error: 'Error interno. Inténtalo de nuevo.' }, 500);
  }
});
