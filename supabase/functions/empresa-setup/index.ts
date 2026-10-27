// Supabase Edge Function: empresa-setup
// Plan Empresa roster activation: the company contact opens the one-time
// setup link from the 'membership_empresa_setup' email and registers their
// employees (name + email OR phone each). Every employee with an email
// gets a customer-portal account (random password) plus a GoTrue recovery
// email ("Crea tu contraseña — Farmacia Apolo") to set their own.
//
// Public (verify_jwt = false, supabase/config.toml): the setup_token
// (48 h TTL, stored on the memberships row) is the capability — the
// contact has no roster session yet. Abuse bounded by per-IP rate
// limiting (rate_limit_events, fail-open like affiliate-signup). Client-
// facing errors are generic (R2-38); details are logged server-side only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const MAX_EMPLOYEES_PER_CALL = 100;

const DEFAULT_ORIGIN = 'https://app.apolofarmacia.com.mx';
const ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?apolofarmacia\.com\.mx$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface EmployeePayload {
  name?: string;
  email?: string;
  phone?: string;
}

interface RequestPayload {
  token?: string;
  employees?: EmployeePayload[];
  origin?: string;
}

interface EmployeeResult {
  name: string;
  status: 'invited' | 'roster_only' | 'error';
  note?: string;
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
// rate_limit_events table is unreachable — activations must keep working.
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
      .eq('bucket', 'empresa-setup')
      .eq('key', key)
      .gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= RATE_LIMIT.limit) return false;
    const { error: insError } = await supabase
      .from('rate_limit_events')
      .insert({ bucket: 'empresa-setup', key });
    if (insError) throw insError;
    if (Math.random() < 0.02) {
      await supabase
        .from('rate_limit_events')
        .delete()
        .lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    }
    return true;
  } catch (err) {
    console.warn('[empresa-setup] rate limit unavailable; allowing request:', err);
    return true;
  }
};

const isAlreadyRegisteredError = (err: { message?: string; code?: string }) => {
  const code = (err.code || '').toLowerCase();
  if (code.includes('already') || code.includes('exist')) return true;
  return /already|exist|registered|duplicate/i.test(err.message || '');
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

// Registers one employee on the roster: customers row, portal account +
// setup email when they have an email, and the membership_members row.
const provisionEmployee = async (
  env: Record<string, string>,
  supabase: ReturnType<typeof supabaseAdmin>,
  opts: {
    orgId: string;
    membershipId: string;
    subId: string;
    origin: string;
    name: string;
    email: string;
    phone: string;
  }
): Promise<EmployeeResult> => {
  const { orgId, membershipId, subId, origin, name, email, phone } = opts;

  const customer = await findOrCreateCustomer(supabase, orgId, name, email, phone);

  let userId: string | null = null;
  if (email) {
    const { userId: uid } = await provisionPortalAccount(
      supabase,
      { id: customer.id as string, email, profile_id: (customer.profile_id as string | null) ?? null },
      orgId,
      crypto.randomUUID() + crypto.randomUUID()
    );
    userId = uid;

    await sendPasswordSetupEmail(env, email, `${origin}/reset-password`);
  }

  const { error: memberError } = await supabase.from('membership_members').insert({
    membership_id: membershipId,
    sub_id: subId,
    name,
    is_owner: false,
    email: email || null,
    phone: phone || null,
    claimed_user_id: userId,
  });
  if (memberError) throw memberError;

  return {
    name,
    status: email ? 'invited' : 'roster_only',
    ...(email
      ? {}
      : { note: 'Sin correo: quedó en la lista pero sin cuenta del portal' }),
  };
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

    const token = (payload.token || '').trim();
    if (!token || token.length > 128) {
      throw new ClientError('El enlace de activación es inválido', 400);
    }
    if (!Array.isArray(payload.employees) || payload.employees.length === 0) {
      throw new ClientError('Agrega al menos un empleado', 400);
    }
    if (payload.employees.length > MAX_EMPLOYEES_PER_CALL) {
      throw new ClientError(`Máximo ${MAX_EMPLOYEES_PER_CALL} empleados por solicitud`, 400);
    }

    const origin = resolveOrigin(req, payload.origin);

    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('id, org_id, plan_id, plan_type, status, seats, company_name, setup_token_expires_at')
      .eq('setup_token', token)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership || membership.plan_type !== 'empresa') {
      throw new ClientError('El enlace de activación es inválido', 404);
    }
    if (membership.status !== 'active') {
      throw new ClientError('Esta membresía no está activa. Contacta a la farmacia.', 400);
    }
    if (
      !membership.setup_token_expires_at ||
      new Date(membership.setup_token_expires_at as string) <= new Date()
    ) {
      throw new ClientError(
        'Este enlace de activación venció. Contacta a la farmacia para generar uno nuevo.',
        410
      );
    }

    const { data: members, error: membersError } = await supabase
      .from('membership_members')
      .select('id, sub_id, name, email, phone')
      .eq('membership_id', membership.id);
    if (membersError) throw membersError;

    const roster = members || [];
    const seatsTotal = (membership.seats as number) || 0;
    const seatsRemaining = seatsTotal - roster.length;

    if (seatsRemaining <= 0) {
      return jsonResponse({ error: 'Todos los lugares ya fueron asignados' }, 410);
    }

    const planId = membership.plan_id as string;
    const rosterEmails = new Set(
      roster.map((m) => normalizeEmail(m.email || '')).filter(Boolean)
    );
    const rosterPhones = new Set(
      roster.map((m) => (m.phone || '').trim()).filter(Boolean)
    );
    const existingSubIds = roster.map((m) => m.sub_id as string);

    const results: EmployeeResult[] = [];
    let assigned = 0;

    for (const raw of payload.employees) {
      if (assigned >= seatsRemaining) {
        results.push({
          name: (raw.name || '').trim() || '(sin nombre)',
          status: 'error',
          note: 'Sin lugares disponibles',
        });
        continue;
      }

      const name = (raw.name || '').trim();
      const email = normalizeEmail(raw.email || '');
      const phone = (raw.phone || '').trim();

      if (!name || name.length < 2) {
        results.push({ name: name || '(sin nombre)', status: 'error', note: 'Nombre requerido' });
        continue;
      }
      if (!email && !phone) {
        results.push({ name, status: 'error', note: 'Se requiere correo o teléfono' });
        continue;
      }
      if (email && !EMAIL_RE.test(email)) {
        results.push({ name, status: 'error', note: 'Correo inválido' });
        continue;
      }

      // Duplicates already on the roster are skipped, not errors.
      if ((email && rosterEmails.has(email)) || (phone && rosterPhones.has(phone))) {
        results.push({ name, status: 'roster_only', note: 'Ya estaba registrado' });
        continue;
      }

      try {
        const subId = nextSubId(planId, existingSubIds);
        const result = await provisionEmployee(env, supabase, {
          orgId: membership.org_id as string,
          membershipId: membership.id as string,
          subId,
          origin,
          name,
          email,
          phone,
        });
        results.push(result);
        assigned += 1;
        if (email) rosterEmails.add(email);
        if (phone) rosterPhones.add(phone);
        existingSubIds.push(subId);
      } catch (err) {
        console.error('[empresa-setup] employee provisioning failed:', { name, err });
        results.push({ name, status: 'error', note: 'No se pudo registrar. Inténtalo de nuevo.' });
      }
    }

    return jsonResponse(
      {
        success: true,
        results,
        seats: seatsTotal,
        seats_used: roster.length + assigned,
        seats_remaining: seatsRemaining - assigned,
      },
      200
    );
  } catch (err) {
    console.error('[empresa-setup] error:', err);
    if (err instanceof ClientError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    return jsonResponse({ error: 'Error interno. Inténtalo de nuevo.' }, 500);
  }
});
