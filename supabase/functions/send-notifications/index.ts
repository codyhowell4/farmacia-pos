// Supabase Edge Function: send-notifications
// Drains the notification_queue table (populated by the
// enqueue_appointment_notifications trigger on appointments) and dispatches
// each row through its channel provider: Resend for email, the WhatsApp
// Cloud API for whatsapp/sms.
//
// Designed to run BEFORE any provider is configured: when the API key a
// channel needs is missing, the row is marked 'skipped' with
// error='provider not configured' instead of failing — plugging the
// secrets in later makes the same code live with no redeploy.
//
// Invoked by pg_cron (see docs/NOTIFICATION_PROVIDERS.md). No user JWT is
// required; when the CRON_SECRET env var is set, callers must send it in
// the x-cron-secret header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BATCH_SIZE = 50;

interface NotificationRow {
  id: string;
  org_id: string;
  channel: 'email' | 'whatsapp' | 'sms';
  recipient: string;
  template: 'booking_confirmation' | 'appointment_reminder' | 'consulta_link' | 'membership_revision';
  payload: {
    appointment_id?: string;
    patient_name?: string;
    appointment_date?: string;
    type?: string;
    meeting_url?: string;
  };
  scheduled_for: string;
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

// Appointment times are shown to patients, so they must render in the
// clinic's local time (Deno servers run on UTC).
const formatAppointmentDate = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso));

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Builds { subject, html, text } per template. `text` is the plain body
// used for WhatsApp/SMS and as the Resend text fallback.
const buildMessage = (row: NotificationRow) => {
  const name = row.payload.patient_name || '';
  const greeting = name ? `Hola ${name},` : 'Hola,';
  const date = row.payload.appointment_date
    ? formatAppointmentDate(row.payload.appointment_date)
    : '';
  const type = row.payload.type ? ` (${row.payload.type})` : '';

  if (row.template === 'booking_confirmation') {
    const text = `${greeting} tu cita${type} está agendada para el ${date}. Farmacia Apolo.`;
    const html =
      `<p>${escapeHtml(greeting)}</p>` +
      `<p><strong>Tu cita está agendada.</strong></p>` +
      `<p>Fecha y hora: ${escapeHtml(date)}${escapeHtml(type)}</p>` +
      '<p>Farmacia Apolo</p>';
    return { subject: 'Tu cita está agendada — Farmacia Apolo', html, text };
  }

  if (row.template === 'appointment_reminder') {
    const text = `${greeting} te recordamos tu cita de mañana${type}: ${date}. Farmacia Apolo.`;
    const html =
      `<p>${escapeHtml(greeting)}</p>` +
      `<p><strong>Te recordamos tu cita de mañana.</strong></p>` +
      `<p>Fecha y hora: ${escapeHtml(date)}${escapeHtml(type)}</p>` +
      '<p>Farmacia Apolo</p>';
    return { subject: 'Te recordamos tu cita de mañana — Farmacia Apolo', html, text };
  }

  // membership_revision
  if (row.template === 'membership_revision') {
    const planId = String(row.payload.plan_id || '');
    const milestone = String(row.payload.milestone || '');
    const packageLabel = String(row.payload.package_label || '');
    const text = `${greeting} tu membresía ${planId} tiene una revisión del mes ${milestone} disponible: ${packageLabel}. Pasa a la farmacia para agendarla. Farmacia Apolo.`;
    const html =
      `<p>${escapeHtml(greeting)}</p>` +
      `<p><strong>Tienes una revisión de membresía disponible.</strong></p>` +
      `<p>Membresía: ${escapeHtml(planId)}</p>` +
      `<p>Revisión del mes: ${escapeHtml(milestone)}</p>` +
      `<p>Incluye: ${escapeHtml(packageLabel)}</p>` +
      '<p>Farmacia Apolo</p>';
    return { subject: 'Tienes una revisión de membresía disponible — Farmacia Apolo', html, text };
  }

  // consulta_link
  const meetingUrl = row.payload.meeting_url || '';
  const linkPart = meetingUrl ? ` Enlace para unirte: ${meetingUrl}` : '';
  const text = `${greeting} tu consulta por video está lista${date ? ` para el ${date}` : ''}.${linkPart}`;
  const html =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p><strong>Tu consulta por video está lista.</strong></p>` +
    (date ? `<p>Fecha y hora: ${escapeHtml(date)}</p>` : '') +
    (meetingUrl
      ? `<p><a href="${escapeHtml(meetingUrl)}">Unirme a la consulta</a></p>`
      : '') +
    '<p>Farmacia Apolo</p>';
  return { subject: 'Enlace de tu consulta — Farmacia Apolo', html, text };
};

// Thrown when a provider call fails; the row is marked 'failed' with the
// message so it stays visible for retry/inspection.
class ProviderError extends Error {}

const sendEmail = async (
  env: Record<string, string>,
  row: NotificationRow,
  message: { subject: string; html: string; text: string }
) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'Farmacia Apolo <citas@farmaciaapolo.com>',
      to: [row.recipient],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[send-notifications] Resend failed:', res.status, text);
    throw new ProviderError(`resend ${res.status}: ${text}`);
  }
};

// WhatsApp Cloud API free-form text. Note: free-form messages only deliver
// inside Meta's 24h customer-service window; outside it a pre-approved
// template message is required (same endpoint, type 'template').
const sendWhatsApp = async (
  env: Record<string, string>,
  row: NotificationRow,
  message: { text: string }
) => {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: row.recipient,
        type: 'text',
        text: { body: message.text },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('[send-notifications] WhatsApp failed:', res.status, text);
    throw new ProviderError(`whatsapp ${res.status}: ${text}`);
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

    // Shared-secret gate for pg_cron: only enforced when configured.
    if (env.CRON_SECRET) {
      const provided = req.headers.get('x-cron-secret') || '';
      if (provided !== env.CRON_SECRET) {
        return jsonResponse({ error: 'No autorizado' }, 401);
      }
    }

    const supabase = supabaseAdmin(env);

    const { data: rows, error: fetchError } = await supabase
      .from('notification_queue')
      .select('id, org_id, channel, recipient, template, payload, scheduled_for')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    const summary = { processed: 0, sent: 0, skipped: 0, failed: 0 };

    for (const row of (rows || []) as NotificationRow[]) {
      summary.processed += 1;

      const message = buildMessage(row);
      const providerConfigured =
        row.channel === 'email' ? !!env.RESEND_API_KEY : !!env.WHATSAPP_TOKEN;

      let update: Record<string, unknown>;
      if (!providerConfigured) {
        // Provider not plugged in yet — harmless no-op per row.
        update = { status: 'skipped', error: 'provider not configured' };
        summary.skipped += 1;
      } else {
        try {
          if (row.channel === 'email') {
            await sendEmail(env, row, message);
          } else {
            // whatsapp and sms both go through the WhatsApp Cloud API.
            await sendWhatsApp(env, row, message);
          }
          update = { status: 'sent', sent_at: new Date().toISOString(), error: null };
          summary.sent += 1;
        } catch (err) {
          // Retryable failed rows stay in the table with their error.
          const message = err instanceof Error ? err.message : 'Error desconocido';
          update = { status: 'failed', error: message.slice(0, 500) };
          summary.failed += 1;
        }
      }

      const { error: updateError } = await supabase
        .from('notification_queue')
        .update(update)
        .eq('id', row.id);

      if (updateError) {
        console.error('[send-notifications] status update failed:', row.id, updateError);
      }
    }

    return jsonResponse(summary, 200);
  } catch (err) {
    console.error('[send-notifications] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonResponse({ error: message }, 500);
  }
});
