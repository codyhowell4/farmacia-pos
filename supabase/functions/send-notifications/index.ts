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
  template:
    | 'booking_confirmation'
    | 'appointment_reminder'
    | 'consulta_link'
    | 'membership_revision'
    | 'membership_receipt'
    | 'membership_welcome'
    | 'membership_payment_failed'
    | 'membership_cancelled';
  payload: {
    appointment_id?: string;
    patient_name?: string;
    appointment_date?: string;
    type?: string;
    meeting_url?: string;
    plan_id?: string;
    plan_type?: string;
    milestone?: number;
    package_label?: string;
    amount?: number | string;
    currency?: string;
    payment_method?: string;
    payments_made?: number;
    payment_date?: string;
    next_renewal_date?: string;
    sale_id?: string;
    monthly_amount?: number | string;
    visits_limit?: number;
    discount_percent?: number;
    effective_date?: string;
    immediate?: boolean;
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

// Date-only values ('YYYY-MM-DD') are calendar dates, not instants — format
// them in UTC so the Mexico-City offset never shifts them to the prior day.
const formatDateOnly = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));

const formatMoney = (amount: unknown, currency = 'MXN') => {
  const n = Number(amount);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)} ${currency}`;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  paypal: 'PayPal',
  transferencia: 'Transferencia',
  insurance: 'Seguro',
};

// ── Brand shell ─────────────────────────────────────────────────────────
const BRAND = {
  navy: '#141B5E',
  blue: '#1E2A8A',
  green: '#46AC78',
  address: 'Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Méx.',
  phone: '+52 1 442 548 8893',
};

const appUrl = (env: Record<string, string>) =>
  env.APP_URL || 'https://apolofarmacia.com.mx/customer-app/';
const logoUrl = (env: Record<string, string>) =>
  env.EMAIL_LOGO_URL || 'https://apolofarmacia.com.mx/brand/apolo-logo.png';

// Key-value summary rows (receipts, plan details).
const kvRow = (k: string, v: string) =>
  `<tr><td style="padding:7px 0;font-size:13px;color:#64748b;">${k}</td>` +
  `<td style="padding:7px 0;font-size:14px;font-weight:700;color:#0f172a;text-align:right;">${v}</td></tr>`;

const kvTable = (rows: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;border-top:1px solid #e2e8f0;">${rows}</table>`;

const planIdBadge = (planId: string) =>
  `<div style="margin:16px 0;padding:14px;background:#f0f4ff;border:2px dashed ${BRAND.blue};border-radius:12px;text-align:center;">` +
  `<div style="font-size:11px;letter-spacing:1px;color:#64748b;text-transform:uppercase;">Tu Plan ID</div>` +
  `<div style="font-family:'Courier New',monospace;font-size:24px;font-weight:700;color:${BRAND.navy};letter-spacing:2px;">${escapeHtml(planId)}</div></div>`;

// Every email goes out in the same branded shell: navy header with the
// logo, white content card, footer with the pharmacy's data. Inline styles
// only — Gmail/Outlook strip <style> blocks.
const brandedEmail = (
  env: Record<string, string>,
  opts: { title: string; body: string; cta?: { href: string; label: string } }
) => {
  const ctaHtml = opts.cta
    ? `<tr><td align="center" style="padding:8px 32px 26px;">` +
      `<a href="${opts.cta.href}" style="display:inline-block;background:${BRAND.green};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 34px;border-radius:10px;">${opts.cta.label}</a></td></tr>`
    : '';
  return (
    `<div style="margin:0;padding:0;background:#f1f4f9;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f9;padding:24px 12px;"><tr><td align="center">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">` +
    `<tr><td align="center" style="background:${BRAND.navy};padding:22px;">` +
    `<img src="${logoUrl(env)}" alt="Farmacia Apolo" width="120" style="display:block;width:120px;height:auto;border-radius:12px;"/></td></tr>` +
    `<tr><td style="padding:26px 32px 10px;font-family:Arial,Helvetica,sans-serif;">` +
    `<h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:${BRAND.navy};">${opts.title}</h1>` +
    `<div style="font-size:15px;line-height:1.6;color:#334155;">${opts.body}</div></td></tr>` +
    ctaHtml +
    `<tr><td style="padding:16px 32px 22px;border-top:1px solid #e2e8f0;">` +
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;">` +
    `Farmacia Apolo · ${BRAND.address}<br/>Tel: ${BRAND.phone}</p></td></tr>` +
    `</table></td></tr></table></div>`
  );
};

// Builds { subject, html, text } per template. `text` is the plain body
// used for WhatsApp/SMS and as the Resend text fallback.
const buildMessage = (env: Record<string, string>, row: NotificationRow) => {
  const name = row.payload.patient_name || '';
  const greeting = name ? `Hola ${name},` : 'Hola,';
  const date = row.payload.appointment_date
    ? formatAppointmentDate(row.payload.appointment_date)
    : '';
  const type = row.payload.type ? ` (${row.payload.type})` : '';

  if (row.template === 'booking_confirmation') {
    const text = `${greeting} tu cita${type} está agendada para el ${date}. Farmacia Apolo.`;
    const html = brandedEmail(env, {
      title: 'Tu cita está agendada',
      body:
        `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>` +
        `<p style="margin:0;">Tu cita${escapeHtml(type)} quedó agendada.</p>` +
        (date ? kvTable(kvRow('Fecha y hora', escapeHtml(date))) : '') +
        `<p style="margin:10px 0 0;">Si necesitas reprogramar, contáctanos al ${BRAND.phone}.</p>`,
    });
    return { subject: 'Tu cita está agendada — Farmacia Apolo', html, text };
  }

  if (row.template === 'appointment_reminder') {
    const text = `${greeting} te recordamos tu cita de mañana${type}: ${date}. Farmacia Apolo.`;
    const html = brandedEmail(env, {
      title: 'Te recordamos tu cita de mañana',
      body:
        `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>` +
        `<p style="margin:0;">Tienes una cita${escapeHtml(type)} mañana.</p>` +
        (date ? kvTable(kvRow('Fecha y hora', escapeHtml(date))) : '') +
        `<p style="margin:10px 0 0;">Si no puedes asistir, avísanos al ${BRAND.phone}.</p>`,
    });
    return { subject: 'Te recordamos tu cita de mañana — Farmacia Apolo', html, text };
  }

  // membership_revision
  if (row.template === 'membership_revision') {
    const planId = String(row.payload.plan_id || '');
    const milestone = String(row.payload.milestone || '');
    const packageLabel = String(row.payload.package_label || '');
    const text = `${greeting} tu membresía ${planId} tiene una revisión del mes ${milestone} disponible: ${packageLabel}. Pasa a la farmacia para agendarla. Farmacia Apolo.`;
    const html = brandedEmail(env, {
      title: 'Tienes una revisión de membresía disponible',
      body:
        `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>` +
        `<p style="margin:0;">Tu membresía cumplió <strong>${escapeHtml(milestone)} meses</strong> y tu revisión de laboratorio ya está disponible — sin costo para ti (valor normal $775).</p>` +
        planIdBadge(planId) +
        kvTable(kvRow('Incluye', escapeHtml(packageLabel))) +
        `<p style="margin:10px 0 0;">Pasa a la farmacia con tu Plan ID para agendarla o agendarla desde la app.</p>`,
      cta: { href: appUrl(env), label: 'Abrir la app' },
    });
    return { subject: 'Tienes una revisión de membresía disponible — Farmacia Apolo', html, text };
  }

  if (row.template === 'membership_receipt') {
    const planId = String(row.payload.plan_id || '');
    const amount = formatMoney(row.payload.amount, row.payload.currency || 'MXN');
    const methodRaw = String(row.payload.payment_method || '');
    const method = PAYMENT_METHOD_LABELS[methodRaw] || methodRaw;
    const paymentsMade = row.payload.payments_made != null ? String(row.payload.payments_made) : '';
    const paymentDate = row.payload.payment_date ? formatAppointmentDate(String(row.payload.payment_date)) : '';
    const nextRenewal = row.payload.next_renewal_date ? formatDateOnly(String(row.payload.next_renewal_date)) : '';
    const text = `${greeting} recibimos tu pago de ${amount} de tu membresía ${planId}${paymentsMade ? ` (pago número ${paymentsMade})` : ''}.${method ? ` Método: ${method}.` : ''}${nextRenewal ? ` Próxima renovación: ${nextRenewal}.` : ''} Farmacia Apolo.`;
    const html = brandedEmail(env, {
      title: 'Recibimos el pago de tu membresía',
      body:
        `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>` +
        `<p style="margin:0;">Gracias — registramos tu pago correctamente.</p>` +
        kvTable(
          kvRow('Membresía', escapeHtml(planId)) +
          kvRow('Monto', escapeHtml(amount)) +
          (method ? kvRow('Método de pago', escapeHtml(method)) : '') +
          (paymentsMade ? kvRow('Pago número', escapeHtml(paymentsMade)) : '') +
          (paymentDate ? kvRow('Fecha de pago', escapeHtml(paymentDate)) : '') +
          (nextRenewal ? kvRow('Próxima renovación', escapeHtml(nextRenewal)) : '')
        ),
      cta: { href: appUrl(env), label: 'Ver mi membresía' },
    });
    return { subject: 'Recibo de pago de tu membresía — Farmacia Apolo', html, text };
  }

  if (row.template === 'membership_welcome') {
    const planId = String(row.payload.plan_id || '');
    const planLabel = row.payload.plan_type === 'familiar' ? 'Plan Familiar' : 'Plan Individual';
    const monthly = formatMoney(row.payload.monthly_amount, 'MXN');
    const visits = row.payload.visits_limit != null ? String(row.payload.visits_limit) : '';
    const pct = row.payload.discount_percent != null ? String(row.payload.discount_percent) : '';
    const nextRenewal = row.payload.next_renewal_date ? formatDateOnly(String(row.payload.next_renewal_date)) : '';
    const text = `${greeting} ¡bienvenido a Membresías Apolo! Tu membresía ${planId} (${planLabel}) ya está activa:${visits ? ` ${visits} consultas al mes,` : ''}${pct ? ` ${pct}% de descuento en toda la tienda,` : ''} toma de presión gratis y revisiones de laboratorio cada 6 meses. Mensualidad: ${monthly}.${nextRenewal ? ` Próxima renovación: ${nextRenewal}.` : ''} App: ${appUrl(env)} Farmacia Apolo.`;
    const html = brandedEmail(env, {
      title: '¡Bienvenido a Membresías Apolo!',
      body:
        `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>` +
        `<p style="margin:0;">Tu membresía <strong>${escapeHtml(planLabel)}</strong> ya está activa. Preséntala con tu Plan ID en cada visita:</p>` +
        planIdBadge(planId) +
        `<p style="margin:0 0 6px;font-weight:700;color:#0f172a;">Tus beneficios:</p>` +
        `<ul style="margin:0;padding-left:20px;">` +
        (visits ? `<li style="padding:2px 0;">${escapeHtml(visits)} consultas médicas al mes (adicionales al 50%)</li>` : '') +
        (pct ? `<li style="padding:2px 0;">${escapeHtml(pct)}% de descuento en toda la tienda</li>` : '') +
        `<li style="padding:2px 0;">Toma de presión gratis cuando quieras</li>` +
        `<li style="padding:2px 0;">Revisión de laboratorio gratis cada 6 meses (valor $775)</li>` +
        `<li style="padding:2px 0;">Descuentos con nuestros socios</li>` +
        `</ul>` +
        kvTable(
          kvRow('Mensualidad', escapeHtml(monthly)) +
          (nextRenewal ? kvRow('Próxima renovación', escapeHtml(nextRenewal)) : '')
        ) +
        `<p style="margin:14px 0 0;">En la app puedes ver tus visitas, tus revisiones y agendar consultas. <strong>Guárdala en tu pantalla de inicio</strong>: ábrela y toca «Instalar» (Android) o Compartir → «Agregar a pantalla de inicio» (iPhone).</p>`,
      cta: { href: appUrl(env), label: 'Entrar a la app' },
    });
    return { subject: '¡Bienvenido a Membresías Apolo! — Farmacia Apolo', html, text };
  }

  if (row.template === 'membership_payment_failed') {
    const planId = String(row.payload.plan_id || '');
    const text = `${greeting} no pudimos cobrar la mensualidad de tu membresía ${planId}. Tus beneficios están pausados hasta que el pago se regularice. Actualiza tu método de pago o contáctanos para ayudarte. Farmacia Apolo.`;
    const html = brandedEmail(env, {
      title: 'No pudimos cobrar tu membresía',
      body:
        `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>` +
        `<div style="margin:12px 0;padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;">` +
        `<p style="margin:0;color:#991b1b;"><strong>El cobro de tu mensualidad no se pudo realizar.</strong></p></div>` +
        kvTable(kvRow('Membresía', escapeHtml(planId))) +
        `<p style="margin:10px 0 0;">Tus beneficios están <strong>pausados</strong> hasta que el pago se regularice. Actualiza tu método de pago o llámanos al ${BRAND.phone} y te ayudamos a conservar tu membresía.</p>`,
    });
    return { subject: 'No pudimos cobrar tu membresía — Farmacia Apolo', html, text };
  }

  if (row.template === 'membership_cancelled') {
    const planId = String(row.payload.plan_id || '');
    const immediate = row.payload.immediate === true;
    const effective = row.payload.effective_date ? formatDateOnly(String(row.payload.effective_date)) : '';
    const text = immediate
      ? `${greeting} tu membresía ${planId} fue cancelada. Si no reconoces esta acción o deseas reactivarla, contáctanos. Farmacia Apolo.`
      : `${greeting} tu membresía ${planId} quedará cancelada al final del periodo actual${effective ? ` (${effective})` : ''}. Conservas todos tus beneficios hasta entonces. Farmacia Apolo.`;
    const html = brandedEmail(env, {
      title: 'Tu membresía ha sido cancelada',
      body:
        `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>` +
        kvTable(kvRow('Membresía', escapeHtml(planId))) +
        (immediate
          ? `<p style="margin:10px 0 0;">La cancelación es efectiva de inmediato. Si no reconoces esta acción o deseas reactivar tu membresía, contáctanos al ${BRAND.phone}.</p>`
          : `<p style="margin:10px 0 0;">La cancelación se hará efectiva al final del periodo actual${effective ? ` (<strong>${escapeHtml(effective)}</strong>)` : ''}. Conservas todos tus beneficios hasta entonces, y cuando quieras puedes reactivar tu membresía sin perder tus meses acumulados.</p>`),
    });
    return { subject: 'Tu membresía ha sido cancelada — Farmacia Apolo', html, text };
  }

  // consulta_link
  if (row.template === 'consulta_link') {
    const meetingUrl = row.payload.meeting_url || '';
    const linkPart = meetingUrl ? ` Enlace para unirte: ${meetingUrl}` : '';
    const text = `${greeting} tu consulta por video está lista${date ? ` para el ${date}` : ''}.${linkPart}`;
    const html = brandedEmail(env, {
      title: 'Tu consulta por video está lista',
      body:
        `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>` +
        (date ? kvTable(kvRow('Fecha y hora', escapeHtml(date))) : '') +
        (meetingUrl
          ? `<p style="margin:10px 0 0;">Usa el botón de abajo a la hora de tu cita.</p>`
          : `<p style="margin:10px 0 0;">Te compartiremos el enlace antes de tu cita.</p>`),
      cta: meetingUrl ? { href: meetingUrl, label: 'Unirme a la consulta' } : undefined,
    });
    return { subject: 'Enlace de tu consulta — Farmacia Apolo', html, text };
  }

  // Unknown template: log it loudly instead of silently rendering the wrong
  // format, and send a harmless generic body so the queue keeps draining.
  console.error('[send-notifications] unknown template:', row.template, 'row id:', row.id);
  const text = `${greeting} tienes una notificación de Farmacia Apolo.`;
  const html = brandedEmail(env, {
    title: 'Notificación de Farmacia Apolo',
    body: `<p style="margin:0;">${escapeHtml(greeting)} tienes una notificación de Farmacia Apolo.</p>`,
  });
  return { subject: 'Notificación — Farmacia Apolo', html, text };
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

// Sample data for preview mode — one row that exercises every field.
const sampleRow = (template: NotificationRow['template']): NotificationRow => ({
  id: 'preview',
  org_id: 'preview',
  channel: 'email',
  recipient: 'preview@example.com',
  template,
  scheduled_for: new Date().toISOString(),
  payload: {
    patient_name: 'María González',
    appointment_date: new Date().toISOString(),
    type: 'Video',
    meeting_url: 'https://apolofarmacia.com.mx/customer-app/',
    plan_id: 'IND-2026-0001',
    plan_type: 'individual',
    milestone: 6,
    package_label: 'Biometría Hemática, Examen General de Orina y Consulta',
    amount: 150,
    currency: 'MXN',
    payment_method: 'paypal',
    payments_made: 1,
    payment_date: new Date().toISOString(),
    next_renewal_date: new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0],
    monthly_amount: 150,
    visits_limit: 2,
    discount_percent: 10,
    effective_date: new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0],
  },
});

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

    // Preview mode: renders a template with sample data and returns the
    // HTML without sending anything — a safe branding/layout check.
    let requestBody: Record<string, unknown> = {};
    try {
      const raw = await req.text();
      requestBody = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      requestBody = {};
    }

    if (requestBody.preview === true && typeof requestBody.template === 'string') {
      const msg = buildMessage(env, sampleRow(requestBody.template as NotificationRow['template']));
      return new Response(msg.html, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const supabase = supabaseAdmin(env);

    // Heartbeat: every invocation writes a publicly readable row so the
    // cron's health is verifiable from the REST API. The x-cron-job
    // header distinguishes pg_cron fires from manual/enqueue-trigger runs.
    try {
      await supabase.from('cron_heartbeat').insert({
        job: 'send-notifications',
        source: req.headers.get('x-cron-job') || 'manual',
      });
      await supabase
        .from('cron_heartbeat')
        .delete()
        .lt('ran_at', new Date(Date.now() - 7 * 86400000).toISOString());
    } catch (hbErr) {
      console.error('[send-notifications] heartbeat failed:', hbErr);
    }

    const { data: rows, error: fetchError } = await supabase
      .from('notification_queue')
      .select('id, org_id, channel, recipient, template, payload, scheduled_for')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    const summary = { processed: 0, sent: 0, skipped: 0, failed: 0 };
    // Per-row outcome for debugging (no recipient — the endpoint can be
    // called without auth when CRON_SECRET is unset, so keep PII out).
    const details: Array<Record<string, unknown>> = [];

    for (const row of (rows || []) as NotificationRow[]) {
      summary.processed += 1;

      const message = buildMessage(env, row);
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

      details.push({
        id: row.id,
        template: row.template,
        channel: row.channel,
        result: update.status,
        ...(update.error ? { error: update.error } : {}),
      });
    }

    return jsonResponse({ ...summary, details }, 200);
  } catch (err) {
    console.error('[send-notifications] error:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonResponse({ error: message }, 500);
  }
});
