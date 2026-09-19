// Supabase Edge Function: lookup-login-email
// Public (verify_jwt = false) wrapper around the DB function
// public.lookup_login_email(identifier, org_id), whose direct anon grant was
// revoked (audit R2-16): anonymous callers could resolve a phone number or
// membership number to an account email — an account-discovery oracle that
// also confirms someone is a patient.
//
// The wrapper adds the controls the bare RPC lacked:
// - per-IP sliding-window rate limiting (rate_limit_events table, same
//   helper pattern as tablet-checkin — fails open so a rate-limit infra
//   hiccup never locks patients out of the login page);
// - a minimal response: { email } only — no matched-via, no hints.
//
// Body: { identifier: string, org_id: string } — identifier may be an email,
// a phone number, or a membership plan_id/sub_id. Unknown identifiers
// resolve to { email: null }, indistinguishable from a miss.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tight cap: one human needs a handful of lookups per login attempt; the
// window only has to absorb typos, not bursts (unlike the shared-IP kiosk).
const RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const RATE_BUCKET = 'lookup-login-email';

interface RequestPayload {
  identifier?: string;
  org_id?: string;
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

// Sliding-window per-IP rate limit. Fails open (with a warning) if the
// rate_limit_events table is unreachable — login must keep working.
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
      .eq('bucket', RATE_BUCKET)
      .eq('key', key)
      .gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= RATE_LIMIT.limit) return false;
    const { error: insError } = await supabase
      .from('rate_limit_events')
      .insert({ bucket: RATE_BUCKET, key });
    if (insError) throw insError;
    // Occasional cleanup so the table stays small.
    if (Math.random() < 0.02) {
      await supabase
        .from('rate_limit_events')
        .delete()
        .lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    }
    return true;
  } catch (err) {
    console.warn('[lookup-login-email] rate limit unavailable; allowing request:', err);
    return true;
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

    const identifier = (payload.identifier || '').trim();
    const orgId = (payload.org_id || '').trim();
    if (!identifier || !orgId) {
      return jsonResponse({ error: 'identifier y org_id requeridos' }, 400);
    }

    const ip =
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      null;

    const supabase = supabaseAdmin(env);

    const withinLimit = await checkRateLimit(supabase, ip);
    if (!withinLimit) {
      return jsonResponse({ error: 'Demasiados intentos' }, 429);
    }

    const { data, error } = await supabase.rpc('lookup_login_email', {
      p_identifier: identifier,
      p_org_id: orgId,
    });
    if (error) throw error;

    return jsonResponse({ email: typeof data === 'string' && data ? data : null }, 200);
  } catch (err) {
    // Detail stays server-side; the client gets a generic failure so the
    // error channel can't be used to probe the resolver's internals.
    console.error('[lookup-login-email] error:', err);
    return jsonResponse({ error: 'No se pudo procesar la solicitud' }, 500);
  }
});
