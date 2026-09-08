// Supabase Edge Function: sign-document
// Signs a payload with a SAT e.firma (FIEL) key pair: RSA PKCS#1 v1.5
// over SHA-256. Used for firma electrónica avanzada of recetas and
// consulta notes (Ley de Firma Electrónica Avanzada).
//
// SECURITY: the .cer/.key contents and the password are used IN-MEMORY
// ONLY for the duration of this request. They are never stored, never
// logged, and never returned to the caller. Do not add logging of the
// request body here.

import forge from 'https://esm.sh/node-forge@1.3.1';

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
    const body = (await req.json()) as SignRequest;

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

    // ── Private key (.key, DER, 3DES-encrypted PKCS#8) ─────────
    let privateKey;
    try {
      privateKey = decryptFielKey(forge.util.decode64(body.key_base64), body.password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo descifrar la llave privada';
      return jsonResponse({ error: message }, 400);
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
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonResponse({ error: message }, 500);
  }
});
