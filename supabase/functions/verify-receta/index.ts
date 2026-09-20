// Supabase Edge Function: verify-receta
// Public prescription (receta) verification for pharmacists — LGS art.
// 42 Bis: any pharmacy must be able to confirm an e-signed receta is
// genuine. POST {folio, sig} returns a minimal, non-clinical payload:
// existence, signature status, doctor identity. It NEVER returns
// medications, signed_payload, the full signature, or any other clinical
// content.
// Folio + sig are a COMPOUND KEY (pen-test fix): folios are sequential,
// so the detail payload is released only when the presented sig matches
// the stored signature prefix (the fragment printed next to the QR and
// encoded in it). A missing/wrong sig returns the exact same
// {"found":false} body as an unknown folio — indistinguishable, so the
// endpoint cannot be used to enumerate folios.
// Public (verify_jwt = false, see config.toml); abuse is bounded by a
// per-IP sliding-window rate limit (fail-open, like tablet-checkin).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Per-IP sliding-window cap: 15 lookups per 10 minutes.
const RATE_LIMIT = { limit: 15, windowMs: 10 * 60 * 1000 };

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
// rate_limit_events table is unreachable — verification must keep working.
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
      .eq('bucket', 'verify-receta')
      .eq('key', key)
      .gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= RATE_LIMIT.limit) return false;
    const { error: insError } = await supabase
      .from('rate_limit_events')
      .insert({ bucket: 'verify-receta', key });
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
    console.warn('[verify-receta] rate limit unavailable; allowing request:', err);
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
    const payload = (await req.json()) as { folio?: string; sig?: string };

    const folio = (payload.folio || '').trim().toUpperCase();
    const sig = (payload.sig || '').trim();
    if (!folio || !sig) {
      return jsonResponse({ found: false }, 200);
    }

    const ip =
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      null;

    const supabase = supabaseAdmin(env);

    const withinLimit = await checkRateLimit(supabase, ip);
    if (!withinLimit) {
      return jsonResponse(
        { error: 'Demasiadas consultas desde esta conexión. Espera unos minutos.' },
        429
      );
    }

    const { data: rx, error } = await supabase
      .from('prescriptions')
      .select(
        'prescription_number, status, patient_name, doctor_name, doctor_license_number, signed_at, signer_cert_serial, signature'
      )
      .eq('prescription_number', folio)
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (!rx) {
      return jsonResponse({ found: false }, 200);
    }

    // Compound key: the detail payload is released only when the presented
    // sig matches the stored signature prefix (the fragment encoded in the
    // receta's QR and printed next to it). A wrong sig returns the exact
    // same {"found":false} as an unknown folio — indistinguishable — so
    // sequential folios cannot be enumerated. An unsigned receta has no
    // prefix to match and also reports not-found.
    const sigPrefix = rx.signature ? rx.signature.slice(0, 32) : null;
    if (!sigPrefix || sig !== sigPrefix) {
      return jsonResponse({ found: false }, 200);
    }

    // Minimal verification payload only — no medications, no
    // signed_payload, and no signature material at all (not even the
    // prefix: the caller already proved knowledge of it).
    return jsonResponse(
      {
        found: true,
        signed: !!rx.signature,
        status: rx.status,
        folio: rx.prescription_number,
        patient_name: rx.patient_name,
        doctor_name: rx.doctor_name,
        doctor_license_number: rx.doctor_license_number,
        signed_at: rx.signed_at,
        signer_cert_serial: rx.signer_cert_serial,
      },
      200
    );
  } catch (err) {
    // Full detail stays in the server log; the client gets a generic body
    // (same pattern as paypal-webhook) — PostgREST/misconfiguration
    // messages must never leak through a public endpoint.
    console.error('[verify-receta] error:', err);
    return jsonResponse({ error: 'No se pudo completar la verificación. Intenta de nuevo.' }, 400);
  }
});
