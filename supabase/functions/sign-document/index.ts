// Supabase Edge Function: sign-document
// Signs a payload with a SAT e.firma (FIEL) key pair: RSA PKCS#1 v1.5
// over SHA-256. Used for firma electrónica avanzada of recetas and
// consulta notes (Ley de Firma Electrónica Avanzada).
//
// SECURITY: the .cer/.key contents and the password are used IN-MEMORY
// ONLY for the duration of this request. They are never stored, never
// logged, and never returned to the caller. Do not add logging of the
// request body here.
//
// Access control (verify_jwt = true at the gateway, re-validated here):
// the caller must be an active doctor (profiles.role = 'doctor' AND
// profiles.deactivated_at IS NULL AND doctor_profiles.is_active = true)
// — these checks fail closed. When the
// doctor already has an e.firma registered in doctor_efirma, the presented
// certificate must be that same one (base64 equality or cert-serial
// match); with no row on file the first-use validation flow is allowed
// (the doctor portal validates the files before saving them). A per-user
// sliding-window rate limit (30 req / 10 min via rate_limit_events) bounds
// password-guessing against the encrypted .key; the rate limiter alone
// fails OPEN on infrastructure errors so signing keeps working.

import forge from 'https://esm.sh/node-forge@1.3.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SignRequest {
  cer_base64?: string;
  key_base64?: string;
  password?: string;
  payload?: string;
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

// User-scoped client: validates the caller's JWT by calling auth.getUser()
// under the request's own Authorization header.
const supabaseAsUser = (env: Record<string, string>, authorization: string) => {
  const url = env.SUPABASE_URL!;
  const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
};

// Per-user sliding-window cap for signing requests.
const SIGN_RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };

// Sliding-window per-user rate limit (same rate_limit_events pattern as
// tablet-checkin, keyed by user id instead of IP). Fails OPEN with a
// warning when the table is unreachable — availability for the doctor on
// shift; the role/key checks above are the ones that must fail closed.
const checkSignRateLimit = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<boolean> => {
  try {
    const since = new Date(Date.now() - SIGN_RATE_LIMIT.windowMs).toISOString();
    const { count, error } = await supabase
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', 'sign-document')
      .eq('key', userId)
      .gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= SIGN_RATE_LIMIT.limit) return false;
    const { error: insError } = await supabase
      .from('rate_limit_events')
      .insert({ bucket: 'sign-document', key: userId });
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
    console.warn('[sign-document] rate limit unavailable; allowing request:', err);
    return true;
  }
};

// Decrypts a SAT FIEL .key (DER-encoded PKCS#8 EncryptedPrivateKeyInfo,
// protected with PKCS#12 pbeWithSHA1And3-KeyTripleDES-CBC) using the
// owner's password. Returns the forge RSA private key.
const decryptFielKey = (keyDer: string, password: string) => {
  const asn1 = forge.asn1.fromDer(keyDer);
  // forge.pki.decryptPrivateKeyInfo handles the PKCS#12 PBE scheme the
  // SAT uses (OID 1.2.840.113549.1.12.1.3). It returns null when the
  // password is wrong (bad padding) and the ASN.1 parse throws when the
  // decrypted bytes are garbage — both mean a bad password or corrupt
  // file. The decrypted value is a PrivateKeyInfo ASN.1 structure, so
  // it still needs privateKeyFromAsn1 to become a usable RSA key.
  const privateKeyInfo = forge.pki.decryptPrivateKeyInfo(asn1, password);
  if (!privateKeyInfo) {
    throw new Error('Contraseña incorrecta o archivo .key inválido');
  }
  return forge.pki.privateKeyFromAsn1(privateKeyInfo);
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

    // ── AuthN: validate the caller's JWT ─────────────────────────
    const authorization = req.headers.get('Authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return jsonResponse({ error: 'No autorizado' }, 401);
    }
    const { data: userData, error: userError } = await supabaseAsUser(env, authorization)
      .auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'No autorizado' }, 401);
    }
    const userId = userData.user.id;

    const supabase = supabaseAdmin(env);

    // ── AuthZ: only active doctors may sign (fail closed) ────────
    // profiles.deactivated_at (baja de personal, NOM-024 6.6.3 / SGSI)
    // is treated exactly like a non-doctor role: same 403 body.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, deactivated_at')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) console.error('[sign-document] profiles lookup failed:', profileError);
    if (profileError || !profile || profile.role !== 'doctor' || profile.deactivated_at !== null) {
      return jsonResponse({ error: 'No autorizado' }, 403);
    }

    const { data: doctorProfile, error: doctorProfileError } = await supabase
      .from('doctor_profiles')
      .select('is_active')
      .eq('profile_id', userId)
      .maybeSingle();
    if (doctorProfileError) console.error('[sign-document] doctor_profiles lookup failed:', doctorProfileError);
    if (doctorProfileError || !doctorProfile || doctorProfile.is_active !== true) {
      return jsonResponse({ error: 'No autorizado' }, 403);
    }

    // ── Per-user rate limit (fail open — see checkSignRateLimit) ─
    const withinLimit = await checkSignRateLimit(supabase, userId);
    if (!withinLimit) {
      return jsonResponse(
        { error: 'Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.' },
        429
      );
    }

    let body: SignRequest;
    try {
      body = (await req.json()) as SignRequest;
    } catch {
      return jsonResponse({ error: 'Cuerpo de solicitud inválido' }, 400);
    }

    if (!body.cer_base64 || !body.key_base64 || !body.password || !body.payload) {
      return jsonResponse(
        { error: 'cer_base64, key_base64, password y payload son requeridos' },
        400
      );
    }

    // ── Certificate (.cer, DER) — serial + subject ──────────────
    let cert;
    try {
      const certAsn1 = forge.asn1.fromDer(forge.util.decode64(body.cer_base64));
      cert = forge.pki.certificateFromAsn1(certAsn1);
    } catch {
      return jsonResponse({ error: 'Archivo .cer inválido o corrupto' }, 400);
    }

    const certSerial = (cert.serialNumber || '').toUpperCase();
    const certSubject = (cert.subject?.attributes || [])
      .map((a: { shortName?: string; name?: string; value?: string }) => `${a.shortName || a.name}=${a.value}`)
      .join(', ');

    // ── Key binding: once the doctor has an e.firma on file, only that
    //    certificate may be used with this account. No row = first-use
    //    validation flow (the doctor portal validates files before saving).
    const { data: efirma, error: efirmaError } = await supabase
      .from('doctor_efirma')
      .select('cer_base64, cert_serial')
      .eq('profile_id', userId)
      .maybeSingle();
    if (efirmaError) {
      // The binding cannot be evaluated — fail closed.
      console.error('[sign-document] doctor_efirma lookup failed:', efirmaError);
      return jsonResponse({ error: 'No se pudo validar la e.firma. Intenta de nuevo.' }, 500);
    }
    if (efirma) {
      const storedCer = (efirma.cer_base64 || '').trim();
      const storedSerial = (efirma.cert_serial || '').trim().toUpperCase();
      const cerMatches = storedCer !== '' && storedCer === body.cer_base64.trim();
      const serialMatches = storedSerial !== '' && storedSerial === certSerial;
      if (!cerMatches && !serialMatches) {
        console.warn('[sign-document] e.firma mismatch for doctor', userId);
        return jsonResponse({ error: 'No autorizado' }, 403);
      }
    }

    // ── Private key (.key, DER, 3DES-encrypted PKCS#8) ─────────
    let privateKey;
    try {
      privateKey = decryptFielKey(forge.util.decode64(body.key_base64), body.password);
    } catch (err) {
      // Wrong password, corrupt file, or forge ASN.1 garbage — one safe
      // message either way; details stay in the server log.
      console.warn('[sign-document] key decrypt failed:', err instanceof Error ? err.message : err);
      return jsonResponse({ error: 'Contraseña incorrecta o archivo .key inválido' }, 400);
    }

    // ── Sign: RSA PKCS#1 v1.5 over SHA-256 of the UTF-8 payload ─
    const md = forge.md.sha256.create();
    md.update(body.payload, 'utf8');
    const signature = privateKey.sign(md);

    return jsonResponse(
      {
        signature_base64: forge.util.encode64(signature),
        cert_serial: certSerial,
        cert_subject: certSubject,
      },
      200
    );
  } catch (err) {
    console.error('[sign-document] error:', err);
    return jsonResponse({ error: 'Error interno al firmar el documento' }, 500);
  }
});
