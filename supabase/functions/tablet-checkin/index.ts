// Supabase Edge Function: tablet-checkin
// Modes:
//   register (in-store tablet): patient (or guardian) fills name + DOB +
//     email/phone, accepts the 4 consent documents, optional reason.
//     Creates/reuses the customer, provisions the app account (password via
//     recovery email), stores the signed consents, adds the walk-in cita +
//     medical note. DOB is required on every registration and minority is
//     derived from it server-side (R2-21) — guardian name + parentesco are
//     persisted on the customer record for minors.
//   register + guest (consentimiento. subdomain): first-visit patients with no
//     email/phone/account — name + DOB + sexo (+ optional CURP) + the 4
//     consents. Reuses a name+DOB match instead of duplicating the customer;
//     no account provisioning. Minors are registered under their own name+DOB
//     so they match on return visits; the guardian signs the consent documents
//     (parental consent) with relationship + INE last-4 as evidence.
//   lookup (consentimiento.): returning-patient search by name + DOB. Returns
//     whether a matching customer exists and if their 4 consents are on file.
//     Response is deliberately minimal (no full_name) — see C1 in
//     docs/LAUNCH_COMPLIANCE_GAPS.md.
//   checkin (customer app, registro. subdomain): an existing account holder
//     answers the 3-5 question check-in form. Creates the walk-in cita +
//     medical note with the answers. No consents, no account work.
//   checkin + customer_id (consentimiento.): returning patient matched by
//     lookup; the customer_id is re-verified against name+DOB before use.
//     Missing consent documents can be collected and inserted here.
// The walk-in cita is assigned to the doctor whose weekly availability
// (doctor_profiles.availability, clinic local time America/Mexico_City)
// covers the check-in time; falls back to the first active doctor.
// Public (verify_jwt = false): no user session on the tablet. Abuse controls:
// a honeypot field plus per-IP rate limiting (rate_limit_events table).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REQUIRED_CONSENT_TYPES = ['privacidad', 'general', 'teleconsulta', 'firma_electronica'];
const APP_RESET_URL = 'https://app.apolofarmacia.com.mx/customer-app/';
const CLINIC_TZ = 'America/Mexico_City';

// Per-IP sliding-window caps. The kiosk and the shop share one public IP, so
// limits leave room for walk-in bursts while still blocking scripted probing.
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  lookup: { limit: 15, windowMs: 10 * 60 * 1000 },
  register: { limit: 10, windowMs: 10 * 60 * 1000 },
  checkin: { limit: 30, windowMs: 10 * 60 * 1000 },
};

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
  mode?: 'register' | 'checkin' | 'lookup';
  patient_name: string;
  email?: string;
  phone?: string;
  is_minor?: boolean; // legacy client checkbox — accepted for backward compat but ignored; minority is derived server-side from date_of_birth (R2-21)
  guardian_name?: string;
  guardian_relationship?: string; // padre | madre | tutor — required for minors on kiosk writes
  guardian_id_ref?: string; // last 4 of guardian INE — evidence for parental consent
  sexo?: string; // 'M' | 'H' — NOM-024 Tabla 1
  curp?: string; // optional, 18 chars when present
  reason?: string;
  password?: string; // required when registering without an email
  date_of_birth?: string; // YYYY-MM-DD — required for lookup/guest/matched-checkin
  customer_id?: string; // checkin mode: returning patient matched by lookup
  guest?: boolean; // register mode: no email/phone/account (consentimiento flow)
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

// Sliding-window per-IP rate limit. Fails open (with a warning) if the
// rate_limit_events table is unreachable — the kiosk must keep working.
const checkRateLimit = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  mode: string,
  ip: string | null
): Promise<boolean> => {
  const cfg = RATE_LIMITS[mode] || { limit: 30, windowMs: 10 * 60 * 1000 };
  const key = ip || 'unknown';
  try {
    const since = new Date(Date.now() - cfg.windowMs).toISOString();
    const { count, error } = await supabase
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', mode)
      .eq('key', key)
      .gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= cfg.limit) return false;
    const { error: insError } = await supabase
      .from('rate_limit_events')
      .insert({ bucket: mode, key });
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
    console.warn('[tablet-checkin] rate limit unavailable; allowing request:', err);
    return true;
  }
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

// Accent- and case-insensitive name comparison so "Pérez, Juan" variants match.
const normalizeName = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const nameTokens = (s: string) => normalizeName(s).split(' ').filter(Boolean);
const isTokenSubset = (a: string[], b: string[]) => a.every((t) => b.includes(t));

// 'exact' | 'loose' | null. Loose = one name's tokens are a subset of the
// other's ("Juan Pérez" vs "Juan Antonio Pérez") — used so a returning
// patient who writes their name slightly differently doesn't fork the
// expediente. Never applied across different birthdates.
const matchName = (candidate: string, target: string): 'exact' | 'loose' | null => {
  const c = normalizeName(candidate);
  const t = normalizeName(target);
  if (!c || !t) return null;
  if (c === t) return 'exact';
  const ct = nameTokens(candidate);
  const tt = nameTokens(target);
  if (isTokenSubset(ct, tt) || isTokenSubset(tt, ct)) return 'loose';
  return null;
};

// Best match among same-DOB candidates: exact wins; otherwise a single
// unambiguous loose match. Ambiguous loose matches return null — never merge
// two records when it is unclear which one is the patient.
const findMatch = <T extends { full_name: string }>(candidates: T[], target: string): T | null => {
  const exact = candidates.find((c) => matchName(c.full_name, target) === 'exact');
  if (exact) return exact;
  const loose = candidates.filter((c) => matchName(c.full_name, target) === 'loose');
  if (loose.length === 1) return loose[0];
  if (loose.length > 1) console.warn('[tablet-checkin] ambiguous loose name match; not reusing');
  return null;
};

const isValidDob = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d) < new Date();

const ageFromDob = (d: string) =>
  Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 86400000));

// Inserts signed consent rows with e-signature attribution; retries without
// the attribution columns when an older schema is missing them.
const insertConsentDocs = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  customerId: string,
  signerName: string,
  docs: ConsentDocPayload[],
  types: string[],
  signerIp: string | null,
  signerUa: string | null,
  signerRelationship: string | null = null,
  signerIdRef: string | null = null
) => {
  const signedAt = new Date().toISOString();
  const rows = types.map((type) => {
    const doc = docs.find((d) => d.type === type)!;
    return {
      org_id: orgId,
      customer_id: customerId,
      type: doc.type,
      title: doc.title,
      content: doc.content,
      status: 'signed',
      signer_name: signerName,
      signed_at: signedAt,
      signer_ip: signerIp,
      signer_user_agent: signerUa,
      signer_relationship: signerRelationship,
      signer_id_ref: signerIdRef,
    };
  });
  const { error } = await supabase.from('consent_documents').insert(rows);
  if (error && /signer_ip|signer_user_agent|signer_relationship|signer_id_ref/i.test(error.message || '')) {
    console.warn('consent attribution columns missing; retrying without them');
    const fallbackRows = rows.map(
      ({ signer_ip, signer_user_agent, signer_relationship, signer_id_ref, ...rest }) => rest
    );
    const { error: retryError } = await supabase.from('consent_documents').insert(fallbackRows);
    if (retryError) throw retryError;
  } else if (error) {
    throw error;
  }
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

    // E-signature attribution evidence (Código de Comercio art. 1205).
    const signerIp =
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      null;
    const signerUa = req.headers.get('user-agent') || null;

    // Honeypot: real users never fill the hidden field.
    if (payload.company && payload.company.trim()) {
      return jsonResponse({ error: 'Solicitud inválida' }, 400);
    }

    const mode = payload.mode === 'checkin' ? 'checkin' : payload.mode === 'lookup' ? 'lookup' : 'register';
    const patientName = (payload.patient_name || '').trim();
    const email = (payload.email || '').trim().toLowerCase();
    const phone = (payload.phone || '').trim();
    const guardianName = (payload.guardian_name || '').trim();
    const guardianRel = (payload.guardian_relationship || '').trim().toLowerCase();
    const guardianIdRef = (payload.guardian_id_ref || '').trim().toUpperCase();
    const sexo = (payload.sexo || '').trim().toUpperCase();
    const curp = (payload.curp || '').trim().toUpperCase();
    const reason = (payload.reason || '').trim();
    const dob = (payload.date_of_birth || '').trim();
    const customerId = (payload.customer_id || '').trim();
    const guest = payload.guest === true;
    // Anonymous flows (lookup / guest register / matched check-in) identify the
    // patient by name+DOB instead of contact info.
    const anonymous = mode === 'lookup' || guest || (mode === 'checkin' && !!customerId);
    // Minority is derived server-side from the DOB (R2-21) — the client's
    // is_minor checkbox is accepted for backward compatibility but ignored.
    const dobAge = dob && isValidDob(dob) ? ageFromDob(dob) : null;
    const isMinor = dobAge !== null && dobAge < 18;

    if (!payload.org_id) return jsonResponse({ error: 'org_id requerido' }, 400);
    if (!patientName) return jsonResponse({ error: 'El nombre del paciente es obligatorio' }, 400);
    // Every registration captures DOB (R2-21): it anchors identity on the
    // anonymous flows and lets the server — not a client checkbox — derive
    // minority on every flow that creates a customer.
    if ((anonymous || mode === 'register') && !isValidDob(dob)) {
      return jsonResponse({ error: 'Fecha de nacimiento inválida (AAAA-MM-DD)' }, 400);
    }
    if (!anonymous && !email && !phone) {
      return jsonResponse({ error: 'Captura el correo electrónico o el teléfono (al menos uno)' }, 400);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'Correo electrónico inválido' }, 400);
    }
    if (sexo && !['M', 'H'].includes(sexo)) {
      return jsonResponse({ error: 'Sexo inválido (M o H)' }, 400);
    }
    if (curp && !/^[A-Z0-9]{18}$/.test(curp)) {
      return jsonResponse({ error: 'CURP inválido (debe tener 18 caracteres)' }, 400);
    }
    // Guest registration (consentimiento kiosk) must capture the NOM-024
    // Tabla 1 minimum: sexo. The in-store tablet flow is untouched.
    if (mode === 'register' && guest && !sexo) {
      return jsonResponse({ error: 'Selecciona el sexo del paciente' }, 400);
    }
    const password = payload.password || '';
    if (mode === 'register' && !guest && !email && password.length < 6) {
      return jsonResponse({ error: 'Sin correo, crea una contraseña de al menos 6 caracteres para la app' }, 400);
    }
    // Lookup writes nothing, so guardian evidence applies only to
    // register/check-in (parental consent on the consent docs). Name +
    // parentesco are required on every registration — they are persisted on
    // the customer record (guardian_name/guardian_relationship, R2-21) and a
    // DB trigger rejects minor rows without them. INE last-4 stays required
    // only on the anonymous (kiosk) flows — the customer app has no guardian
    // fields and is out of scope for this requirement.
    if (isMinor && mode !== 'lookup') {
      if (!guardianName) {
        return jsonResponse({ error: 'El nombre del padre o tutor es obligatorio para menores' }, 400);
      }
      if (mode === 'register' || anonymous) {
        if (!['padre', 'madre', 'tutor'].includes(guardianRel)) {
          return jsonResponse({ error: 'Selecciona el parentesco del tutor (padre, madre o tutor legal)' }, 400);
        }
      }
      if (anonymous) {
        if (!/^[A-Z0-9]{4}$/.test(guardianIdRef)) {
          return jsonResponse({ error: 'Captura los últimos 4 dígitos de la identificación (INE) del tutor' }, 400);
        }
      }
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

    // Abuse protection: per-IP sliding window (C1/C2). Fails open.
    const withinLimit = await checkRateLimit(supabase, mode, signerIp);
    if (!withinLimit) {
      return jsonResponse(
        { error: 'Demasiados intentos desde esta conexión. Espera unos minutos o avisa al personal.' },
        429
      );
    }

    const orgId = payload.org_id;
    // The customer record is always the patient (minors included) so returning
    // minors match by their own name+DOB. For minors the consent documents are
    // signed by the guardian — parental consent, with relationship + INE ref.
    const signerName = isMinor && guardianName ? guardianName : patientName;
    const signerRel = isMinor && guardianName ? guardianRel || null : null;
    const signerRef = isMinor && guardianName ? guardianIdRef || null : null;
    const guardianDesc = `${guardianName}${guardianRel ? ` (${guardianRel}${guardianIdRef ? `, INE *${guardianIdRef}` : ''})` : ''}`;

    // ── Lookup mode: returning-patient search by name + DOB. Reports whether
    // a match exists and if its 4 consent documents are on file. Response is
    // minimal by design: no full_name (patient-existence oracle hardening).
    if (mode === 'lookup') {
      const { data: candidates, error: lookupError } = await supabase
        .from('customers')
        .select('id, full_name')
        .eq('org_id', orgId)
        .eq('date_of_birth', dob)
        .limit(50);
      if (lookupError) throw lookupError;
      const match = findMatch(candidates || [], patientName);
      if (!match) return jsonResponse({ ok: true, found: false }, 200);

      const { data: signedRows, error: signedError } = await supabase
        .from('consent_documents')
        .select('type')
        .eq('org_id', orgId)
        .eq('customer_id', match.id)
        .eq('status', 'signed')
        .in('type', REQUIRED_CONSENT_TYPES);
      if (signedError) throw signedError;
      const signedTypes = new Set((signedRows || []).map((r) => r.type as string));
      return jsonResponse({
        ok: true,
        found: true,
        customer_id: match.id,
        consents_signed: REQUIRED_CONSENT_TYPES.every((t) => signedTypes.has(t)),
      }, 200);
    }

    // 1. Customer row: a matched check-in re-verifies customer_id against
    //    name+DOB; otherwise reuse by email (or by phone when no email); a
    //    guest registration reuses a name+DOB match so a returning patient who
    //    picks "Primera vez" doesn't fork their record; else create.
    const customerSelect =
      'id, full_name, phone, email, profile_id, date_of_birth, sexo, curp, guardian_name, guardian_relationship, guardian_id_ref';
    let customer = null;
    if (mode === 'checkin' && customerId) {
      const { data, error } = await supabase
        .from('customers')
        .select(customerSelect)
        .eq('org_id', orgId)
        .eq('id', customerId)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.date_of_birth !== dob || matchName(data.full_name, patientName) === null) {
        return jsonResponse({ error: 'No encontramos un expediente con ese nombre y fecha de nacimiento' }, 404);
      }
      customer = data;
    } else if (email) {
      const { data, error } = await supabase
        .from('customers')
        .select(customerSelect)
        .eq('org_id', orgId)
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      customer = data;
    } else if (phone) {
      const { data, error } = await supabase
        .from('customers')
        .select(customerSelect)
        .eq('org_id', orgId)
        .eq('phone', phone)
        .is('email', null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      customer = data;
    }

    if (!customer && guest) {
      const { data: candidates, error } = await supabase
        .from('customers')
        .select(customerSelect)
        .eq('org_id', orgId)
        .eq('date_of_birth', dob)
        .limit(50);
      if (error) throw error;
      customer = findMatch(candidates || [], patientName);
    }

    if (!customer) {
      const { data: createdCustomer, error: createCustomerError } = await supabase
        .from('customers')
        .insert({
          org_id: orgId,
          full_name: patientName,
          email: email || null,
          phone: phone || null,
          date_of_birth: dob || null,
          sexo: sexo || null,
          curp: curp || null,
          // Guardian evidence lives on the customer record itself (R2-21) —
          // a DB trigger rejects minor rows without name + parentesco.
          guardian_name: isMinor ? guardianName : null,
          guardian_relationship: isMinor ? guardianRel || null : null,
          guardian_id_ref: isMinor ? guardianIdRef || null : null,
          notes: isMinor ? `Menor de edad · Tutor: ${guardianDesc}` : null,
        })
        .select(customerSelect)
        .single();
      if (createCustomerError) throw createCustomerError;
      customer = createdCustomer;
    } else {
      // Backfill identification data on matched records that never captured
      // it — one update so a DOB that reveals a minor never lands without
      // the guardian evidence in the same write.
      const backfill: Record<string, unknown> = {};
      if (phone && customer.phone !== phone) backfill.phone = phone;
      if (dob && !customer.date_of_birth) backfill.date_of_birth = dob;
      if (sexo && !customer.sexo) backfill.sexo = sexo;
      if (curp && !customer.curp) backfill.curp = curp;
      if (isMinor && guardianName) {
        if (!customer.guardian_name) backfill.guardian_name = guardianName;
        if (!customer.guardian_relationship && guardianRel) {
          backfill.guardian_relationship = guardianRel;
        }
        if (!customer.guardian_id_ref && guardianIdRef) {
          backfill.guardian_id_ref = guardianIdRef;
        }
      }
      if (Object.keys(backfill).length > 0) {
        await supabase.from('customers').update(backfill).eq('id', customer.id);
      }
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

    // 3. Signed consent documents (register mode; plus check-in catch-up for
    //    returning patients whose consents are missing — consentimiento flow).
    if (mode === 'register') {
      await insertConsentDocs(
        supabase, orgId, customer.id, signerName,
        payload.consent_docs || [], REQUIRED_CONSENT_TYPES, signerIp, signerUa,
        signerRel, signerRef
      );
    } else if (mode === 'checkin' && Array.isArray(payload.consent_docs) && payload.consent_docs.length > 0) {
      const docs = payload.consent_docs;
      const { data: signedRows, error: signedError } = await supabase
        .from('consent_documents')
        .select('type')
        .eq('org_id', orgId)
        .eq('customer_id', customer.id)
        .eq('status', 'signed')
        .in('type', REQUIRED_CONSENT_TYPES);
      if (signedError) throw signedError;
      const already = new Set((signedRows || []).map((r) => r.type as string));
      const toInsert = REQUIRED_CONSENT_TYPES.filter((t) => !already.has(t));
      const provided = new Set(docs.map((d) => d.type));
      const missing = toInsert.filter((t) => !provided.has(t));
      if (missing.length > 0) {
        return jsonResponse({ error: `Faltan documentos de consentimiento: ${missing.join(', ')}` }, 400);
      }
      if (toInsert.length > 0) {
        await insertConsentDocs(supabase, orgId, customer.id, signerName, docs, toInsert, signerIp, signerUa, signerRel, signerRef);
      }
    }

    // 4. Walk-in cita + 5. medical note, assigned to the doctor on shift.
    const { doctor, scheduled } = await pickDoctor(supabase, orgId);

    const minorLine = isMinor ? `Paciente: ${patientName} (menor de edad) · Tutor: ${guardianDesc}` : null;

    const dobLine = dob ? `Fecha de nacimiento: ${dob}` : null;

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
        dobLine,
        ...answered.map(([k, v]) => `${k}: ${(v || '').trim()}`),
      ].filter(Boolean) as string[];
      noteLines = [
        '[Auto-reporte del cliente — check-in en línea · identidad por confirmar en recepción]',
        ...answered.map(([k, v]) => `${k}: ${(v || '').trim()}`),
        dobLine,
        minorLine,
      ].filter(Boolean) as string[];
    } else {
      const reasonLine = `Motivo de visita: ${reason || 'No especificado'}`;
      summaryLines = [
        'Registro en tableta (sin cita previa)',
        minorLine,
        dobLine,
        reasonLine,
        'Consentimientos firmados ✓',
      ].filter(Boolean) as string[];
      noteLines = [
        '[Auto-reporte del cliente — tableta en tienda · identidad por confirmar en recepción]',
        reasonLine,
        dobLine,
        minorLine,
        'Documentos de consentimiento firmados en tableta: aviso de privacidad, consentimiento general, teleconsulta y firma electrónica.',
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
