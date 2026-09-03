// Supabase Edge Function: paypal-capture-consult
// Captures a PayPal order for a video consultation booked from the
// public customer portal. Once the payment is verified (COMPLETED and
// the amount matches the expected consult price), it marks the
// appointment paid, confirms it, and creates its Daily.co room.
// Exposed without JWT verification (see config.toml): portal customers
// pay without a staff session, so everything is validated server-side
// with the service role.

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

const paypalBaseUrl = (env: Record<string, string>) =>
  env.PAYPAL_ENV === 'live'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

const getPayPalAccessToken = async (env: Record<string, string>) => {
  const auth = 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID!}:${env.PAYPAL_CLIENT_SECRET!}`);
  const res = await fetch(`${paypalBaseUrl(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token as string;
};

const createDailyRoom = async (
  env: Record<string, string>,
  appointment: AppointmentRow
): Promise<DailyRoom> => {
  const startsAt = Math.floor(new Date(appointment.appointment_date).getTime() / 1000);

  // v1 privacy model: the room is 'public' but its name is unguessable
  // (the appointment UUID) and the nbf/exp window only allows joining
  // from 15 minutes before until 90 minutes after the scheduled time.
  const res = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.DAILY_API_KEY || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `consult-${appointment.id}`,
      privacy: 'public',
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
    console.error('[paypal-capture-consult] Daily room creation failed:', res.status, text);
    throw new DailyApiError(text);
  }

  return (await res.json()) as DailyRoom;
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
    console.error('[paypal-capture-consult] notification insert failed:', error);
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
    const payload = (await req.json()) as { order_id?: string; appointment_id?: string };

    if (!payload.order_id || !payload.appointment_id) {
      return jsonResponse({ error: 'order_id y appointment_id requeridos' }, 400);
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

    // Capture the PayPal order. PayPal internals are only logged — the
    // client always gets the same generic payment error.
    let capture: Record<string, any>;
    try {
      const token = await getPayPalAccessToken(env);
      const res = await fetch(
        `${paypalBaseUrl(env)}/v2/checkout/orders/${payload.order_id}/capture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error('[paypal-capture-consult] capture failed:', res.status, text);
        return jsonResponse({ error: 'Pago no completado o monto incorrecto' }, 402);
      }

      capture = (await res.json()) as Record<string, any>;
    } catch (paypalError) {
      console.error('[paypal-capture-consult] PayPal error:', paypalError);
      return jsonResponse({ error: 'Pago no completado o monto incorrecto' }, 402);
    }

    const captureStatus = String(capture?.status || '').toUpperCase();
    const capturedValue = Number(
      capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ??
        capture?.purchase_units?.[0]?.amount?.value
    );

    if (
      captureStatus !== 'COMPLETED' ||
      !Number.isFinite(capturedValue) ||
      Math.abs(capturedValue - expected) > 0.01
    ) {
      console.error('[paypal-capture-consult] invalid capture:', {
        order_id: payload.order_id,
        status: captureStatus,
        capturedValue,
        expected,
      });
      return jsonResponse({ error: 'Pago no completado o monto incorrecto' }, 402);
    }

    // Payment verified. Reuse an existing room (e.g. staff confirmed a
    // membership_half appointment before the customer paid their half);
    // otherwise create the Daily room now.
    let meetingUrl = appointment.meeting_url as string | null;
    let meetingId = appointment.meeting_id as string | null;

    if (!meetingUrl) {
      const room = await createDailyRoom(env, appointment as AppointmentRow);
      meetingUrl = room.url;
      meetingId = room.name;
    }

    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        payment_ref: payload.order_id,
        payment_status: appointment.payment_status === 'unpaid' ? 'paid' : appointment.payment_status,
        status: 'confirmed',
        meeting_url: meetingUrl,
        meeting_id: meetingId,
      })
      .eq('id', appointment.id);
    if (updateError) throw updateError;

    // Notify only when the room was created here — if a meeting_url
    // already existed, the customer was notified at confirmation time.
    if (!appointment.meeting_url && appointment.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', appointment.customer_id)
        .maybeSingle();
      await notifyCustomer(
        supabase,
        appointment as AppointmentRow,
        customer?.full_name ?? null
      );
    }

    return jsonResponse({ meeting_url: meetingUrl, status: 'confirmed' }, 200);
  } catch (err) {
    if (err instanceof DailyApiError) {
      return jsonResponse({ error: err.message }, 502);
    }
    console.error('[paypal-capture-consult] error:', err);
    return jsonResponse({ error: 'Error al procesar el pago' }, 500);
  }
});
