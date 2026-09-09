// Supabase Edge Function: family-member-signup
// Lets a family-plan member (a membership_members row, e.g. sub_id
// APOLO-00001-2) activate their own customer-portal account.
// JWT verification is OFF (supabase/config.toml): the person has no session
// yet — the registered member NAME is the identity proof, since the sub_id
// alone is guessable from the plan id.
//
// On success the new auth user is stored in membership_members.claimed_user_id
// (+ email), so lookup_login_email can resolve their sub_id/email to THEIR
// account and the portal can find their parent membership.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestPayload {
  sub_id?: string;
  name?: string;
  email?: string;
  password?: string;
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

// lowercase + accent-fold + trim + collapse internal whitespace
const normalizeName = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .trim()
    .replace(/\s+/g, ' ');

const everyWordIn = (wordsA: string[], wordsB: Set<string>) =>
  wordsA.length > 0 && wordsA.every((w) => wordsB.has(w));

// Identity proof: exact normalized match, or one name's words are all
// present in the other (covers middle names / missing apellido).
const namesMatch = (provided: string, registered: string) => {
  const a = normalizeName(provided);
  const b = normalizeName(registered);
  if (!a || !b) return false;
  if (a === b) return true;
  const wordsA = a.split(' ');
  const wordsB = new Set(b.split(' '));
  return everyWordIn(wordsA, wordsB) || everyWordIn([...wordsB], new Set(wordsA));
};

const isAlreadyRegisteredError = (err: { message?: string; code?: string }) => {
  const code = (err.code || '').toLowerCase();
  if (code.includes('already') || code.includes('exist')) return true;
  return /already|exist|registered|duplicate/i.test(err.message || '');
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

    const subId = (payload.sub_id || '').trim();
    const name = (payload.name || '').trim();
    const email = (payload.email || '').trim().toLowerCase();
    const password = payload.password || '';

    // Sub-ids look like APOLO-00001-2; restricting the charset also keeps
    // LIKE wildcards out of the lookup below.
    if (!/^[A-Za-z0-9-]+$/.test(subId)) {
      return jsonResponse({ error: 'Número de integrante inválido' }, 400);
    }
    if (!name) {
      return jsonResponse({ error: 'Nombre requerido' }, 400);
    }
    if (!email || !email.includes('@')) {
      return jsonResponse({ error: 'Correo electrónico inválido' }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    }

    const supabase = supabaseAdmin(env);

    // ilike with a wildcard-free value = case-insensitive exact match.
    const { data: member, error: memberError } = await supabase
      .from('membership_members')
      .select('id, membership_id, sub_id, name, email, is_owner, claimed_user_id, memberships(org_id)')
      .ilike('sub_id', subId)
      .limit(1)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member) {
      return jsonResponse({ error: 'No encontramos ese número de integrante' }, 404);
    }

    // The titular's own row is not claimable here — their account is created
    // at signup (paypal-subscription) or by staff (create-portal-account).
    if (member.is_owner) {
      return jsonResponse({ error: 'Ese número pertenece al titular del plan. Inicia sesión con tu cuenta.' }, 400);
    }

    // Identity proof: the sub_id is guessable, so the registered name must match.
    if (!namesMatch(name, member.name || '')) {
      return jsonResponse({ error: 'El nombre no coincide con nuestros registros' }, 400);
    }

    if (member.claimed_user_id || member.email) {
      return jsonResponse({ error: 'Esta cuenta ya fue activada, inicia sesión' }, 409);
    }

    // Email must not be in use by an existing portal account or another
    // claimed member (membership_members has a unique lower(email) index).
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data: existingMemberEmail, error: memberEmailError } = await supabase
      .from('membership_members')
      .select('id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (memberEmailError) throw memberEmailError;

    if (existingProfile || existingMemberEmail) {
      return jsonResponse({ error: 'Ese correo ya tiene una cuenta' }, 409);
    }

    const orgId = (member.memberships as { org_id?: string } | null)?.org_id || null;

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'customer', org_id: orgId, full_name: member.name },
    });

    if (createError) {
      if (isAlreadyRegisteredError(createError)) {
        return jsonResponse({ error: 'Ese correo ya tiene una cuenta' }, 409);
      }
      throw createError;
    }

    const userId = created.user?.id;
    if (!userId) {
      console.error('[family-member-signup] createUser returned no user id');
      return jsonResponse({ error: 'No pudimos crear tu cuenta. Intenta de nuevo.' }, 500);
    }

    // Claim the member row. Guarded to still-unclaimed rows so a concurrent
    // activation can't overwrite an existing claim.
    const { data: claimed, error: claimError } = await supabase
      .from('membership_members')
      .update({ email, claimed_user_id: userId })
      .eq('id', member.id)
      .is('claimed_user_id', null)
      .is('email', null)
      .select('id');

    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) {
      console.error('[family-member-signup] claim race lost for member', member.id, 'auth user', userId);
      return jsonResponse({ error: 'Esta cuenta ya fue activada, inicia sesión' }, 409);
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error('[family-member-signup] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonResponse({ error: message }, 400);
  }
});
