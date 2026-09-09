// Supabase Edge Function: tablet-checkin
// Two modes:
//   register (in-store tablet): patient (or guardian) fills name + email/phone,
//     accepts the 3 consent documents, optional reason. Creates/reuses the
//     customer, provisions the app account (password via recovery email),
//     stores the signed consents, adds the walk-in cita + medical note.
//   checkin (customer app, registro. subdomain): an existing account holder
//     answers the 3-5 question check-in form. Creates the walk-in cita +
//     medical note with the answers. No consents, no account work.
// The walk-in cita is assigned to the doctor whose weekly availability
// (doctor_profiles.availability, clinic local time America/Mexico_City)
// covers the check-in time; falls back to the first active doctor.
// Public (verify_jwt = false): no user session on the tablet. A honeypot
// field is enforced to limit spam.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REQUIRED_CONSENT_TYPES = ['privacidad', 'general', 'teleconsulta'];
const APP_RESET_URL = 'https://app.apolofarmacia.com.mx/customer-app/';
const CLINIC_TZ = 'America/Mexico_City';

interface ConsentDocPayload {
  type: string;
  title: string;
  content: string;
}

interface CheckinAnswers {
  reason?: string;
  symptoms?: string;
  duration?: string;
  medications?: string;
  allergies?: string;
}

interface RequestPayload {
  org_id: string;
  mode?: 'register' | 'checkin';
  patient_name: string;
  email?: string;
  phone?: string;
  is_minor?: boolean;
  guardian_name?: string;
  reason?: string;
  password?: string; // required when registering without an email
  checkin?: CheckinAnswers;
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
// row. Phone-only registrations use a synthetic internal email plus the
// password chosen on the tablet (no real email exists to send a recovery to).
const provisionAccount = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  customer: { id: string; email: string; profile_id: string | null },
  orgId: string,
  password?: string
) => {
  if (customer.profile_id) return { accountExisted: true };

  let userId: string | null = null;
  let accountExisted = false;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: customer.email,
    password: password || undefined,
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

// Current time in the clinic timezone as { dayKey, minutes }.
const clinicNow = () => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const dayMap: Record<string, string> = {
    Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
  };
  const dayKey = dayMap[get('weekday')] || 'mon';
  const minutes = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
  return { dayKey, minutes };
};

const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = (hhmm || '0:0').split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};

// Picks the doctor whose availability window covers right now (clinic time).
// Falls back to the first active doctor when nobody covers this time or
// no availability is configured.
const pickDoctor = async (supabase: ReturnType<typeof supabaseAdmin>, orgId: string) => {
  const { data: doctors, error } = await supabase
    .from('profiles')
    .select('id, full_name, doctor_profiles!inner(is_active, availability)')
    .eq('org_id', orgId)
    .eq('role', 'doctor')
    .eq('doctor_profiles.is_active', true)
    .order('full_name');
  if (error) throw error;
  if (!doctors?.length) return { doctor: null, scheduled: false };

  const { dayKey, minutes } = clinicNow();
  for (const d of doctors) {
    const availability = (d.doctor_profiles as Record<string, unknown>)?.availability as
      Record<string, string[][]> | undefined;
    const windows = availability?.[dayKey];
    if (!Array.isArray(windows)) continue;
    for (const w of windows) {
      const [start, end] = w || [];
      if (!start || !end) continue;
      if (minutes >= hhmmToMinutes(start) && minutes < hhmmToMinutes(end)) {
        return { doctor: d, scheduled: true };
      }
    }
  }

  return { doctor: doctors[0], scheduled: false };
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
    if (payload.company && payload.company.trim()) {
      return jsonResponse({ error: 'Solicitud inválida' }, 400);
    }

    const mode = payload.mode === 'checkin' ? 'checkin' : 'register';
    const patientName = (payload.patient_name || '').trim();
    const email = (payload.email || '').trim().toLowerCase();
    const phone = (payload.phone || '').trim();
    const isMinor = !!payload.is_minor;
    const guardianName = (payload.guardian_name || '').trim();
    const reason = (payload.reason || '').trim();

    if (!payload.org_id) return jsonResponse({ error: 'org_id requerido' }, 400);
    if (!patientName) return jsonResponse({ error: 'El nombre del paciente es obligatorio' }, 400);
    if (!email && !phone) {
      return jsonResponse({ error: 'Captura el correo electrónico o el teléfono (al menos uno)' }, 400);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'Correo electrónico inválido' }, 400);
    }
    const password = payload.password || '';
    if (mode !== 'checkin' && !email && password.length < 6) {
      return jsonResponse({ error: 'Sin correo, crea una contraseña de al menos 6 caracteres para la app' }, 400);
    }
    if (isMinor && !guardianName) {
      return jsonResponse({ error: 'El nombre del padre o tutor es obligatorio para menores' }, 400);
    }

    if (mode === 'register') {
      const docs = Array.isArray(payload.consent_docs) ? payload.consent_docs : [];
      const signedTypes = new Set(docs.map((d) => d.type));
      const missing = REQUIRED_CONSENT_TYPES.filter((t) => !signedTypes.has(t));
      if (missing.length > 0) {
        return jsonResponse({ error: `Faltan documentos de consentimiento: ${missing.join(', ')}` }, 400);
      }
    }

    const supabase = supabaseAdmin(env);
    const orgId = payload.org_id;
    // For minors the account holder is the guardian; the minor is the patient.
    const holderName = isMinor ? guardianName : patientName;

    // 1. Customer row: reuse by email (or by phone when no email), else create.
    let customer = null;
    if (email) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, email, profile_id')
        .eq('org_id', orgId)
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      customer = data;
    } else {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, email, profile_id')
        .eq('org_id', orgId)
        .eq('phone', phone)
        .is('email', null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      customer = data;
    }

    if (!customer) {
      const { data: createdCustomer, error: createCustomerError } = await supabase
        .from('customers')
        .insert({ org_id: orgId, full_name: holderName, email: email || null, phone: phone || null })
        .select('id, full_name, phone, email, profile_id')
        .single();
      if (createCustomerError) throw createCustomerError;
      customer = createdCustomer;
    } else if (phone && customer.phone !== phone) {
      await supabase.from('customers').update({ phone }).eq('id', customer.id);
    }

    // 2. Portal account. With an email: password arrives via recovery email.
    //    Phone-only: the tablet collected a password; the account gets a
    //    synthetic internal email (login resolves phone -> that email via
    //    lookup_login_email). The synthetic address never touches the
    //    customers row.
    let account: 'created' | 'existed' | 'none' = 'none';
    let recoveryEmailSent = false;
    if (mode === 'register' && (email || password)) {
      let accountEmail = email;
      if (!accountEmail) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 7) {
          return jsonResponse({ error: 'Sin correo necesitamos un teléfono válido para crear tu cuenta' }, 400);
        }
        accountEmail = `tel${digits}@telefono.apolofarmacia.com.mx`;
      }

      const { accountExisted } = await provisionAccount(
        supabase,
        { id: customer.id, email: customer.email || accountEmail, profile_id: customer.profile_id },
        orgId,
        email ? undefined : password
      );
      account = accountExisted ? 'existed' : 'created';

      if (!accountExisted && email) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: APP_RESET_URL,
        });
        if (resetError) {
          console.error('[tablet-checkin] recovery email failed:', resetError.message);
        } else {
          recoveryEmailSent = true;
        }
      }
    }

    // 3. Signed consent documents (register mode only).
    if (mode === 'register') {
      const docs = payload.consent_docs || [];
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
          signer_name: holderName,
          signed_at: signedAt,
        };
      });
      const { error: consentError } = await supabase.from('consent_documents').insert(consentRows);
      if (consentError) throw consentError;
    }

    // 4. Walk-in cita + 5. medical note, assigned to the doctor on shift.
    const { doctor, scheduled } = await pickDoctor(supabase, orgId);

    const minorLine = isMinor ? `Paciente: ${patientName} (menor de edad) · Tutor: ${guardianName}` : null;

    let summaryLines: string[];
    let noteLines: string[];
    if (mode === 'checkin') {
      const c = payload.checkin || {};
      const qa: Array<[string, string | undefined]> = [
        ['Motivo de visita', c.reason],
        ['Síntomas', c.symptoms],
        ['Duración', c.duration],
        ['Medicamentos actuales', c.medications],
        ['Alergias', c.allergies],
      ];
      const answered = qa.filter(([, v]) => (v || '').trim());
      summaryLines = [
        'Check-in en línea (sin cita previa)',
        minorLine,
        ...answered.map(([k, v]) => `${k}: ${(v || '').trim()}`),
      ];
      noteLines = [
        '[Auto-reporte del cliente — check-in en línea]',
        ...answered.map(([k, v]) => `${k}: ${(v || '').trim()}`),
        minorLine,
      ].filter(Boolean) as string[];
    } else {
      const reasonLine = `Motivo de visita: ${reason || 'No especificado'}`;
      summaryLines = [
        'Registro en tableta (sin cita previa)',
        minorLine,
        reasonLine,
        'Consentimientos firmados ✓',
      ];
      noteLines = [
        '[Auto-reporte del cliente — tableta en tienda]',
        reasonLine,
        minorLine,
        'Documentos de consentimiento firmados en tableta: aviso de privacidad, consentimiento general y teleconsulta.',
      ].filter(Boolean) as string[];
    }

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
          notes: summaryLines.join('\n'),
        })
        .select('id')
        .single();
      if (apptError) throw apptError;
      appointmentId = appt.id;

      const { error: noteError } = await supabase.from('medical_notes').insert({
        org_id: orgId,
        doctor_id: doctor.id,
        customer_id: customer.id,
        appointment_id: appointmentId,
        note: noteLines.join('\n'),
      });
      if (noteError) throw noteError;
    } else {
      console.error('[tablet-checkin] no active doctor found; cita/note skipped');
    }

    return jsonResponse({
      ok: true,
      mode,
      customer_id: customer.id,
      account,
      recovery_email_sent: recoveryEmailSent,
      appointment_id: appointmentId,
      doctor_assigned: doctor ? doctor.full_name : null,
      doctor_on_shift: scheduled,
    }, 200);
  } catch (err) {
    console.error('[tablet-checkin] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonResponse({ error: message }, 400);
  }
});
