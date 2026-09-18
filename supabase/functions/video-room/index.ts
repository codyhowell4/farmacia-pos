// Supabase Edge Function: video-room
// Creates (or reuses) the Daily.co room for a video consultation and
// confirms the appointment. JWT verification stays ON (default): the
// caller must be an authenticated admin, pos, or doctor user.
//
// NOM-027: a signed teleconsulta consent (consent_documents type
// 'teleconsulta', status 'signed') is required before any payment or
// membership visit is charged — walk-in appointments without a
// registered patient cannot be confirmed as video consults.
//
// Rooms are 'private': joining requires a Daily meeting token. The
// patient token is embedded in appointments.meeting_url, the staff
// (owner) token in appointments.meeting_url_staff.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AppointmentRow {
  id: string;
  org_id: string;
  customer_id: string | null;
  doctor_id: string;
  appointment_date: string;
  status: string;
  payment_status: string;
  meeting_url: string | null;
  meeting_url_staff: string | null;
  meeting_id: string | null;
}

interface DailyRoom {
  url: string;
  name: string;
}

// Thrown when the Daily.co API rejects the room creation; the handler
// maps it to a 502 carrying the upstream error text.
class DailyApiError extends Error {}

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

const startsAtSec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

const createDailyRoom = async (
  env: Record<string, string>,
  appointment: AppointmentRow
): Promise<DailyRoom> => {
  const startsAt = startsAtSec(appointment.appointment_date);

  // The room is private: nobody joins without a meeting token. Its name
  // is unguessable (the appointment UUID) and the nbf/exp window only
  // allows joining from 15 minutes before until 90 minutes after the
  // scheduled time.
  const res = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.DAILY_API_KEY || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `consult-${appointment.id}`,
      privacy: 'private',
      properties: {
        nbf: startsAt - 15 * 60,
        exp: startsAt + 90 * 60,
        eject_at_room_exp: true,
        lang: 'es',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[video-room] Daily room creation failed:', res.status, text);
    throw new DailyApiError(text);
  }

  return (await res.json()) as DailyRoom;
};

// Mints a Daily meeting token scoped to the room, valid for the same
// window as the room itself. is_owner is only set on the staff token.
const createMeetingToken = async (
  env: Record<string, string>,
  roomName: string,
  userName: string,
  startsAt: number,
  isOwner = false
): Promise<string> => {
  const properties: Record<string, unknown> = {
    room_name: roomName,
    user_name: userName,
    nbf: startsAt - 15 * 60,
    exp: startsAt + 90 * 60,
  };
  if (isOwner) properties.is_owner = true;

  const res = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.DAILY_API_KEY || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[video-room] Daily meeting-token creation failed:', res.status, text);
    throw new DailyApiError(text);
  }

  const data = await res.json();
  return data.token as string;
};

const formatAppointmentDate = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(iso)
  );

// Inserts the "consult ready" portal notification for the customer.
// Never throws: a notification problem must not fail the confirmation.
const notifyCustomer = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  appointment: AppointmentRow,
  customerName: string | null
) => {
  if (!appointment.customer_id) return; // walk-in: nobody to notify

  const greeting = customerName ? `Hola ${customerName}, tu` : 'Tu';
  const { error } = await supabase.from('notifications').insert({
    org_id: appointment.org_id,
    customer_id: appointment.customer_id,
    type: 'appointment',
    title: 'Tu consulta por video está lista',
    message:
      `${greeting} consulta por video está confirmada para el ` +
      `${formatAppointmentDate(appointment.appointment_date)}. ` +
      'El enlace para unirte está disponible en tu portal.',
    related_id: appointment.id,
    related_table: 'appointments',
  });

  if (error) {
    console.error('[video-room] notification insert failed:', error);
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
    const payload = (await req.json()) as { appointment_id?: string };

    const supabase = supabaseAdmin(env);

    // AuthZ: the caller must be an authenticated admin, pos, or doctor.
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

    if (callerError || !callerProfile || !['admin', 'pos', 'doctor'].includes(callerProfile.role)) {
      return jsonResponse(
        { error: 'Solo el personal puede confirmar consultas por video' },
        403
      );
    }

    if (!payload.appointment_id) {
      return jsonResponse({ error: 'appointment_id requerido' }, 400);
    }

    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', payload.appointment_id)
      .single();

    if (apptError || !appointment) {
      return jsonResponse({ error: 'Cita no encontrada' }, 404);
    }

    if (['cancelled', 'completed'].includes(appointment.status)) {
      return jsonResponse({ error: 'La cita está cancelada o ya fue completada' }, 400);
    }

    // Idempotency FIRST: a retry must never decrement a second membership
    // visit or fail on a duplicate room name — it just returns the
    // existing meeting URLs (and still ensures the status is confirmed).
    // Legacy rows have no meeting_url_staff; fall back to meeting_url.
    if (appointment.meeting_url) {
      if (appointment.status !== 'confirmed') {
        const { error: confirmError } = await supabase
          .from('appointments')
          .update({ status: 'confirmed' })
          .eq('id', appointment.id);
        if (confirmError) throw confirmError;
      }
      return jsonResponse(
        {
          meeting_url: appointment.meeting_url,
          staff_url: appointment.meeting_url_staff || appointment.meeting_url,
          status: 'confirmed',
          visits_remaining: null,
        },
        200
      );
    }

    // NOM-027 teleconsulta consent gate — before any payment or
    // membership visit is charged. Video consults require a registered
    // patient with a signed teleconsulta consent on file.
    if (!appointment.customer_id) {
      return jsonResponse(
        {
          error:
            'Las teleconsultas requieren un paciente registrado. Registre al paciente y capture su consentimiento de teleconsulta antes de confirmar.',
        },
        400
      );
    }

    const { data: teleConsent, error: consentError } = await supabase
      .from('consent_documents')
      .select('id')
      .eq('customer_id', appointment.customer_id)
      .eq('type', 'teleconsulta')
      .eq('status', 'signed')
      .limit(1)
      .maybeSingle();

    if (consentError) throw consentError;

    if (!teleConsent) {
      return jsonResponse(
        {
          error:
            'El paciente no tiene firmado el consentimiento de teleconsulta (NOM-027). Puede firmarlo en la app del paciente o en el kiosco de consentimiento, o capturarlo en papel desde la pestaña Consentimientos del expediente.',
        },
        409
      );
    }

    if (appointment.payment_status === 'unpaid') {
      return jsonResponse({ error: 'Pago requerido antes de confirmar la consulta' }, 402);
    }

    let visitsRemaining: number | null = null;

    if (appointment.payment_status === 'membership_visit') {
      const { data: membership, error: membershipError } = await supabase
        .from('memberships')
        .select('id, visits_remaining')
        .eq('customer_id', appointment.customer_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership || (membership.visits_remaining ?? 0) < 1) {
        return jsonResponse({ error: 'Sin visitas disponibles en la membresía' }, 402);
      }

      visitsRemaining = Math.max(0, membership.visits_remaining - 1);
      const { error: decrementError } = await supabase
        .from('memberships')
        .update({
          visits_remaining: visitsRemaining,
          updated_at: new Date().toISOString(),
        })
        .eq('id', membership.id);
      if (decrementError) throw decrementError;
    }

    // Customer row: the patient token's user_name and the notification
    // greeting (guaranteed to exist by the consent gate above).
    let customerName: string | null = null;
    if (appointment.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', appointment.customer_id)
        .maybeSingle();
      customerName = customer?.full_name ?? null;
    }

    const room = await createDailyRoom(env, appointment as AppointmentRow);
    const startsAt = startsAtSec(appointment.appointment_date);
    const patientToken = await createMeetingToken(
      env,
      room.name,
      customerName || 'Paciente',
      startsAt
    );
    const staffToken = await createMeetingToken(env, room.name, 'Equipo Apolo', startsAt, true);

    const meetingUrl = `${room.url}?t=${patientToken}`;
    const meetingUrlStaff = `${room.url}?t=${staffToken}`;

    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        meeting_url: meetingUrl,
        meeting_url_staff: meetingUrlStaff,
        meeting_id: room.name,
        status: 'confirmed',
      })
      .eq('id', appointment.id);
    if (updateError) throw updateError;

    await notifyCustomer(supabase, appointment as AppointmentRow, customerName);

    return jsonResponse(
      {
        meeting_url: meetingUrl,
        staff_url: meetingUrlStaff,
        status: 'confirmed',
        visits_remaining: visitsRemaining,
      },
      200
    );
  } catch (err) {
    if (err instanceof DailyApiError) {
      return jsonResponse({ error: err.message }, 502);
    }
    console.error('[video-room] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonResponse({ error: message }, 500);
  }
});
