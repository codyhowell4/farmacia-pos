// Supabase Edge Function: create-portal-account
// Creates (or links) a customer portal auth account for an existing
// customers row. Used by admin/POS staff when registering a member who
// pays cash and needs access to the customer portal.
// JWT verification stays ON (default): the caller must be an authenticated
// admin or pos user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestPayload {
  customer_id: string;
  email: string;
  password: string;
  full_name?: string;
}

const supabaseAdmin = (env: Record<string, string>) => {
  const url = env.SUPABASE_URL!;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isAlreadyRegisteredError = (err: { message?: string; code?: string }) => {
  const code = (err.code || '').toLowerCase();
  if (code.includes('already') || code.includes('exist')) return true;
  return /already|exist|registered|duplicate/i.test(err.message || '');
};

// Provisions a customer portal auth account and links it to the given
// customers row via customers.profile_id.
//
// The handle_new_user DB trigger fires on auth user creation and inserts
// both a profiles row and a fresh customers row for the new user. That
// trigger-created customers row duplicates the one we want to link, so it
// is removed before linking (unique index on customers.profile_id).
//
// An existing account is reused as-is: its password is never updated.
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

    // Account already registered: reuse it, never touch its password.
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

    const supabase = supabaseAdmin(env);

    // AuthZ: the caller must be an authenticated admin or pos user.
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) {
      return jsonResponse({ error: 'No autorizado' }, 401);
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'No autorizado' }, 401);
    }

    const { data: callerProfile, error: callerError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (callerError || !callerProfile || !['admin', 'pos'].includes(callerProfile.role)) {
      return jsonResponse(
        { error: 'Solo personal administrativo puede crear cuentas del portal' },
        403
      );
    }

    // Validation.
    if (!payload.customer_id) {
      return jsonResponse({ error: 'customer_id requerido' }, 400);
    }
    if (!payload.email) {
      return jsonResponse({ error: 'email requerido' }, 400);
    }
    if (!payload.password || payload.password.length < 6) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    }

    // The customers row must exist; its data wins over the payload.
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, org_id, email, full_name, profile_id')
      .eq('id', payload.customer_id)
      .single();

    if (customerError || !customer) {
      return jsonResponse({ error: 'Cliente no encontrado' }, 400);
    }

    // Backfill missing row data from the payload (existing row values win).
    const rowUpdates: Record<string, string> = {};
    if (!customer.email) rowUpdates.email = payload.email;
    if (payload.full_name && !customer.full_name) rowUpdates.full_name = payload.full_name;
    if (Object.keys(rowUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from('customers')
        .update(rowUpdates)
        .eq('id', customer.id);
      if (updateError) throw updateError;
    }

    const { accountExisted } = await provisionPortalAccount(
      supabase,
      { id: customer.id, email: customer.email || payload.email, profile_id: customer.profile_id },
      customer.org_id,
      payload.password
    );

    return jsonResponse({ linked: true, account_existed: accountExisted }, 200);
  } catch (err) {
    console.error('[create-portal-account] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonResponse({ error: message }, 500);
  }
});
