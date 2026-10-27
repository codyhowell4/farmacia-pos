// Supabase Edge Function: stripe-capture-consult
// Verifies a Stripe PaymentIntent for a video consultation booked from the
// public customer portal. Once the payment is verified (status 'succeeded',
// the intent bound to THIS appointment via metadata.appointment_id, and
// the amount matching the expected consult price), it marks the
// appointment paid, confirms it, and creates its Daily.co room.
// Exposed without JWT verification (see config.toml): portal customers
// pay without a staff session, so everything is validated server-side
// with the service role.
//
// Rooms are 'private': joining requires a Daily meeting token. The
// patient token is embedded in appointments.meeting_url, the staff
// (owner) token in appointments.meeting_url_staff.
//
// Because this endpoint is anonymous it never returns the meeting URL —
// the patient reaches it through the authenticated portal. The PaymentIntent
// must be bound to the appointment (metadata.appointment_id, stamped by
// the portal at intent creation) and the NOM-027 teleconsulta consent gate
// (same as video-room) must pass before the appointment is confirmed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Fallback consult price when the org has no 'CONSULTA MEDICA MEMBRESIA'
// inventory item.
const DEFAULT_CONSULT_PRICE = 100.0;

interface AppointmentRow {
  id: string;
  org_id: string;
  customer_id: string | null;
  appointment_date: string;
  status: string;
  payment_status: string;
  payment_ref: string | null;
  meeting_url: string | null;
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

// Creates the PaymentIntent the portal confirms with Stripe.js. The intent
// is bound to THIS appointment via metadata.appointment_id so the verify
// path can reject foreign intents, and the amount is computed server-side
// from the org's consult price — the client never dictates it.
const createStripePaymentIntent = async (
  env: Record<string, string>,
  appointmentId: string,
  expectedAmount: number
) => {
  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY!}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      amount: String(Math.round(expectedAmount * 100)),
      currency: 'mxn',
      description: 'Consulta Farmacia Apolo',
      'metadata[appointment_id]': appointmentId,
      'automatic_payment_methods[enabled]': 'true',
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe payment intent creation failed: ${res.status} ${text}`);
  }

  return (await res.json()) as Record<string, any>;
};

// Fetches the PaymentIntent so the handler can verify it was created for
// THIS appointment (the portal stamps metadata.appointment_id with the
// appointment id) and actually succeeded before confirming the cita.
const getStripePaymentIntent = async (env: Record<string, string>, paymentIntentId: string) => {
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY!}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe payment intent lookup failed: ${res.status} ${text}`);
  }

  return (await res.json()) as Record<string, any>;
};

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
    console.error('[stripe-capture-consult] Daily room creation failed:', res.status, text);
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
    console.error('[stripe-capture-consult] Daily meeting-token creation failed:', res.status, text);
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
    console.error('[stripe-capture-consult] notification insert failed:', error);
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
    const payload = (await req.json()) as {
      action?: string;
      payment_intent_id?: string;
      appointment_id?: string;
    };
    const isCreate = payload.action === 'create';

    if (!payload.appointment_id || (!isCreate && !payload.payment_intent_id)) {
      return jsonResponse({ error: 'payment_intent_id y appointment_id requeridos' }, 400);
    }

    const supabase = supabaseAdmin(env);

    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', payload.appointment_id)
      .single();

    if (apptError || !appointment) {
      return jsonResponse({ error: 'Cita no encontrada' }, 400);
    }

    if (['cancelled', 'completed'].includes(appointment.status)) {
      return jsonResponse({ error: 'La cita está cancelada o ya fue completada' }, 400);
    }

    if (['paid', 'waived'].includes(appointment.payment_status)) {
      return jsonResponse({ error: 'Esta cita ya está pagada' }, 400);
    }

    // NOM-027 teleconsulta consent gate (mirrors video-room): every
    // appointment paid through this function is a video consult, so a
    // registered patient with a signed teleconsulta consent on file is
    // required BEFORE the appointment is confirmed or room created.
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

    // Expected amount: the org's consult product price (full for 'unpaid',
    // half for 'membership_half'). Anything else does not require payment.
    const { data: consultProduct, error: productError } = await supabase
      .from('inventory')
      .select('price')
      .eq('org_id', appointment.org_id)
      .eq('name', 'CONSULTA MEDICA MEMBRESIA')
      .limit(1)
      .maybeSingle();

    if (productError) throw productError;

    const productPrice = Number(consultProduct?.price);
    const consultPrice = Number.isFinite(productPrice) && productPrice > 0
      ? productPrice
      : DEFAULT_CONSULT_PRICE;

    let expected: number;
    if (appointment.payment_status === 'membership_half') {
      expected = consultPrice / 2;
    } else if (appointment.payment_status === 'unpaid') {
      expected = consultPrice;
    } else {
      return jsonResponse({ error: 'Esta cita no requiere pago' }, 400);
    }

    // 'create' action: the portal is starting the payment. Same guards as
    // the verify path already ran above (exists, not cancelled/completed/
    // paid, NOM-027 consent, payable status). Mint the PaymentIntent bound
    // to this appointment and hand back its client_secret — Stripe.js
    // confirms the card client-side, then the portal calls again without
    // an action to verify + confirm.
    if (isCreate) {
      let created: Record<string, any>;
      try {
        created = await createStripePaymentIntent(env, appointment.id, expected);
      } catch (stripeError) {
        console.error('[stripe-capture-consult] payment intent creation failed:', stripeError);
        return jsonResponse({ error: 'No se pudo iniciar el pago. Intenta de nuevo.' }, 502);
      }
      if (!created.client_secret) {
        console.error('[stripe-capture-consult] intent created without client_secret:', created);
        return jsonResponse({ error: 'No se pudo iniciar el pago. Intenta de nuevo.' }, 502);
      }
      return jsonResponse({ client_secret: created.client_secret, amount_mxn: expected }, 200);
    }

    // Verify path (default, no action): payment_intent_id is required.
    const paymentIntentId = payload.payment_intent_id as string;

    // Retrieve the PaymentIntent. Stripe internals are only logged — the
    // client always gets the same generic payment error.
    let paymentIntent: Record<string, any>;
    try {
      paymentIntent = await getStripePaymentIntent(env, paymentIntentId);
    } catch (stripeError) {
      console.error('[stripe-capture-consult] payment intent lookup failed:', stripeError);
      return jsonResponse({ error: 'Pago no completado o monto incorrecto' }, 402);
    }

    // Intent↔appointment binding: the intent must have been created for
    // THIS appointment (the portal stamps metadata.appointment_id with the
    // appointment id). Verified before confirming so a foreign intent —
    // anyone can complete a Stripe payment for the right amount — is never
    // charged against this cita. Stripe internals are only logged.
    const metadata = (paymentIntent?.metadata || {}) as Record<string, unknown>;
    if (String(metadata.appointment_id || '') !== payload.appointment_id) {
      console.warn('[stripe-capture-consult] payment intent does not belong to appointment:', {
        payment_intent_id: payload.payment_intent_id,
        appointment_id: payload.appointment_id,
      });
      return jsonResponse({ error: 'El pago no corresponde a esta cita' }, 400);
    }

    // Payment verified: the intent must have succeeded (it is confirmed
    // client-side before this call, so no capture happens here) and the
    // charged amount (Stripe amounts are in cents) must match the
    // expected consult price.
    const intentStatus = String(paymentIntent?.status || '');
    const receivedCents = Number(paymentIntent?.amount_received ?? paymentIntent?.amount);
    const expectedCents = Math.round(expected * 100);

    if (
      intentStatus !== 'succeeded' ||
      !Number.isFinite(receivedCents) ||
      Math.abs(receivedCents - expectedCents) > 1
    ) {
      console.error('[stripe-capture-consult] invalid payment intent:', {
        payment_intent_id: payload.payment_intent_id,
        status: intentStatus,
        receivedCents,
        expectedCents,
      });
      return jsonResponse({ error: 'Pago no completado o monto incorrecto' }, 402);
    }

    // Payment verified. Reuse an existing room (e.g. staff confirmed a
    // membership_half appointment before the customer paid their half);
    // otherwise create the Daily room now.
    let meetingUrl = appointment.meeting_url as string | null;
    let meetingId = appointment.meeting_id as string | null;
    let meetingUrlStaff: string | null = null;

    // Customer name: the patient token's user_name and the notification
    // greeting. Fetched only when the room is created here.
    let customerName: string | null = null;
    if (!meetingUrl && appointment.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', appointment.customer_id)
        .maybeSingle();
      customerName = customer?.full_name ?? null;
    }

    if (!meetingUrl) {
      const room = await createDailyRoom(env, appointment as AppointmentRow);
      const startsAt = startsAtSec(appointment.appointment_date);
      const patientToken = await createMeetingToken(
        env,
        room.name,
        customerName || 'Paciente',
        startsAt
      );
      const staffToken = await createMeetingToken(env, room.name, 'Equipo Apolo', startsAt, true);
      meetingUrl = `${room.url}?t=${patientToken}`;
      meetingUrlStaff = `${room.url}?t=${staffToken}`;
      meetingId = room.name;
    }

    const updateFields: Record<string, unknown> = {
      payment_ref: paymentIntentId,
      payment_status: appointment.payment_status === 'unpaid' ? 'paid' : appointment.payment_status,
      status: 'confirmed',
      meeting_url: meetingUrl,
      meeting_id: meetingId,
    };
    // Only set when the room was created here — a reused room keeps the
    // staff URL written at confirmation time.
    if (meetingUrlStaff) updateFields.meeting_url_staff = meetingUrlStaff;

    const { error: updateError } = await supabase
      .from('appointments')
      .update(updateFields)
      .eq('id', appointment.id);
    if (updateError) throw updateError;

    // Notify only when the room was created here — if a meeting_url
    // already existed, the customer was notified at confirmation time.
    if (!appointment.meeting_url && appointment.customer_id) {
      await notifyCustomer(
        supabase,
        appointment as AppointmentRow,
        customerName
      );
    }

    // Anonymous endpoint: the meeting URL is never returned here. The
    // patient reaches it through the authenticated portal (Mis Citas) and
    // staff through the appointments panels.
    return jsonResponse({ status: 'confirmed' }, 200);
  } catch (err) {
    if (err instanceof DailyApiError) {
      return jsonResponse({ error: err.message }, 502);
    }
    console.error('[stripe-capture-consult] error:', err);
    return jsonResponse({ error: 'Error al procesar el pago' }, 500);
  }
});
