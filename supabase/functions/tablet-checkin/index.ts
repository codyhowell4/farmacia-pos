// Supabase Edge Function: tablet-checkin
// In-store tablet registration: patient (or guardian) fills name/email/phone,
// accepts the 3 standard consent documents and optionally gives a reason for
// the visit. This function:
//   1. creates/reuses the customers row (guardian is the account holder for minors)
//   2. provisions the customer-app account (no password — a "set your
//      password" recovery email is sent instead)
//   3. stores the signed consent documents (clears the app's consent gate)
//   4. adds a walk-in cita for today in the doctor's view
//   5. adds a medical note labeled as customer self-report (motivo de visita)
// Public (verify_jwt = false): the tablet has no user session. Writes go
// through the service role. Spam surface is limited to creating inert
// customer rows; a honeypot field is enforced.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REQUIRED_CONSENT_TYPES = ['privacidad', 'general', 'teleconsulta'];
const APP_RESET_URL = 'https://app.apolofarmacia.com.mx/customer-app/';

interface ConsentDocPayload {
  type: string;
  title: string;
  content: string;
}

interface RequestPayload {
  org_id: string;
  patient_name: string;
  email: string;
  phone: string;
  is_minor?: boolean;
  guardian_name?: string;
  reason?: string;
  company?: string; // honeypot — must be empty
  consent_docs?: ConsentDocPayload[];
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

// Creates (or reuses) the portal auth account and links it to the customers
// row. No password is set; the caller sends a recovery email afterwards.
// Mirrors the provisioning logic in create-portal-account.
const provisionAccount = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  customer: { id: string; email: string; profile_id: string | null },
  orgId: string
) => {
  if (customer.profile_id) return { accountExisted: true };

  let userId: string | null = null;
  let accountExisted = false;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: customer.email,
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

  // Remove the trigger-created duplicate customers row, then link.
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

    // Honeypot: real users never fill the hidden field.
    if (payload.company) {
      return jsonResponse({ error: 'Solicitud inválida' }, 400);
    }

    const patientName = (payload.patient_name || '').trim();
    const email = (payload.email || '').trim().toLowerCase();
    const phone = (payload.phone || '').trim();
    const isMinor = !!payload.is_minor;
    const guardianName = (payload.guardian_name || '').trim();
    const reason = (payload.reason || '').trim();

    if (!payload.org_id) return jsonResponse({ error: 'org_id requerido' }, 400);
    if (!patientName) return jsonResponse({ error: 'El nombre del paciente es obligatorio' }, 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'Correo electrónico inválido' }, 400);
    }
    if (!phone) return jsonResponse({ error: 'El teléfono es obligatorio' }, 400);
    if (isMinor && !guardianName) {
      return jsonResponse({ error: 'El nombre del padre o tutor es obligatorio para menores' }, 400);
    }

    const docs = Array.isArray(payload.consent_docs) ? payload.consent_docs : [];
    const signedTypes = new Set(docs.map((d) => d.type));
    const missing = REQUIRED_CONSENT_TYPES.filter((t) => !signedTypes.has(t));
    if (missing.length > 0) {
      return jsonResponse({ error: `Faltan documentos de consentimiento: ${missing.join(', ')}` }, 400);
    }

    const supabase = supabaseAdmin(env);
    const orgId = payload.org_id;
    // For minors the account holder is the guardian; the minor is the patient.
    const holderName = isMinor ? guardianName : patientName;
    const signerName = holderName;

    // 1. Customer row: reuse by email, otherwise create.
    const { data: existing, error: findError } = await supabase
      .from('customers')
      .select('id, full_name, phone, email, profile_id')
      .eq('org_id', orgId)
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;

    let customer = existing;
    if (!customer) {
      const { data: createdCustomer, error: createCustomerError } = await supabase
        .from('customers')
        .insert({ org_id: orgId, full_name: holderName, email, phone })
        .select('id, full_name, phone, email, profile_id')
        .single();
      if (createCustomerError) throw createCustomerError;
      customer = createdCustomer;
    } else if (phone && customer.phone !== phone) {
      await supabase.from('customers').update({ phone }).eq('id', customer.id);
    }

    // 2. Portal account (no password; recovery email below).
    const { accountExisted } = await provisionAccount(
      supabase,
      { id: customer.id, email: customer.email || email, profile_id: customer.profile_id },
      orgId
    );

    // 2b. New accounts get the "set your password" email (via Auth SMTP).
    let recoveryEmailSent = false;
    if (!accountExisted) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: APP_RESET_URL,
      });
      if (resetError) {
        console.error('[tablet-checkin] recovery email failed:', resetError.message);
      } else {
        recoveryEmailSent = true;
      }
    }

    // 3. Signed consent documents (clears the app's consent gate on first login).
    const signedAt = new Date().toISOString();
    const consentRows = REQUIRED_CONSENT_TYPES.map((type) => {
      const doc = docs.find((d) => d.type === type)!;
      return {
        org_id: orgId,
        customer_id: customer.id,
        type: doc.type,
        title: doc.title,
        content: doc.content,
        status: 'signed',
        signer_name: signerName,
        signed_at: signedAt,
      };
    });
    const { error: consentError } = await supabase.from('consent_documents').insert(consentRows);
    if (consentError) throw consentError;

    // 4. Walk-in cita + 5. medical note — need the org's active doctor.
    const { data: doctor, error: doctorError } = await supabase
      .from('profiles')
      .select('id, full_name, doctor_profiles!inner(is_active)')
      .eq('org_id', orgId)
      .eq('role', 'doctor')
      .eq('doctor_profiles.is_active', true)
      .order('full_name')
      .limit(1)
      .maybeSingle();
    if (doctorError) throw doctorError;

    const minorLine = isMinor ? `Paciente: ${patientName} (menor de edad) · Tutor: ${guardianName}` : null;
    const reasonLine = `Motivo de visita: ${reason || 'No especificado'}`;

    let appointmentId: string | null = null;
    if (doctor) {
      const { data: appt, error: apptError } = await supabase
        .from('appointments')
        .insert({
          org_id: orgId,
          customer_id: customer.id,
          doctor_id: doctor.id,
          appointment_date: new Date().toISOString(),
          status: 'confirmed',
          type: 'in_person',
          payment_status: 'unpaid',
          notes: [
            'Registro en tableta (sin cita previa)',
            minorLine,
            reasonLine,
            'Consentimientos firmados ✓',
          ].filter(Boolean).join('\n'),
        })
        .select('id')
        .single();
      if (apptError) throw apptError;
      appointmentId = appt.id;

      const { error: noteError } = await supabase.from('medical_notes').insert({
        org_id: orgId,
        doctor_id: doctor.id,
        customer_id: customer.id,
        note: [
          '[Auto-reporte del cliente — tableta en tienda]',
          reasonLine,
          minorLine,
          'Documentos de consentimiento firmados en tableta: aviso de privacidad, consentimiento general y teleconsulta.',
        ].filter(Boolean).join('\n'),
      });
      if (noteError) throw noteError;
    } else {
      console.error('[tablet-checkin] no active doctor found; cita/note skipped');
    }

    return jsonResponse({
      ok: true,
      customer_id: customer.id,
      account: accountExisted ? 'existed' : 'created',
      recovery_email_sent: recoveryEmailSent,
      appointment_id: appointmentId,
      doctor_assigned: doctor ? doctor.full_name : null,
    }, 200);
  } catch (err) {
    console.error('[tablet-checkin] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonResponse({ error: message }, 400);
  }
});
