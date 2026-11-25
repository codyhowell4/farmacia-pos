// Supabase Edge Function: empresa-lead
// "Plan Empresa" contact form on the public website (apolofarmacia.com.mx,
// pages / and /membresia). Stores the lead in public.empresa_leads and emails
// it to the pharmacy's admin inbox through Resend (RESEND_API_KEY /
// EMAIL_FROM secrets, same as send-notifications).
//
// Public (verify_jwt = false): visitors have no session. Abuse controls:
// honeypot field `website` (bots get a fake success) + per-IP sliding-window
// rate limit in rate_limit_events (fails open, like affiliate-signup).
// Client-facing errors are generic; details are logged server-side only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LEAD_INBOX = 'adminapollo01@gmail.com';
const RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };
const BUCKET = 'empresa-lead';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const ok = () => json({ ok: true, message: '¡Gracias! Te contactaremos muy pronto.' });

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\u0000-\u001f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const admin = (env: Record<string, string>) =>
  createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const withinRateLimit = async (sb: ReturnType<typeof admin>, ip: string | null) => {
  const key = ip || 'unknown';
  try {
    const since = new Date(Date.now() - RATE_LIMIT.windowMs).toISOString();
    const { count, error } = await sb
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', BUCKET)
      .eq('key', key)
      .gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= RATE_LIMIT.limit) return false;
    const { error: insError } = await sb.from('rate_limit_events').insert({ bucket: BUCKET, key });
    if (insError) throw insError;
    return true;
  } catch (err) {
    console.warn('[empresa-lead] rate limit unavailable; allowing request:', err);
    return true;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const p = await req.json().catch(() => ({}));
    const env = Deno.env.toObject();

    // Honeypot: real people never see/fill this field.
    if (p.website) return ok();

    const sb = admin(env);
    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      null;
    if (!(await withinRateLimit(sb, ip))) {
      return json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }, 429);
    }

    const orgId = clean(p.org_id, 64);
    const name = clean(p.name, 120);
    const company = clean(p.company, 160);
    const phone = clean(p.phone, 30);
    const email = (clean(p.email, 160) || '').toLowerCase();
    const employeesRaw = Number.parseInt(String(p.employees ?? ''), 10);
    const employees = Number.isFinite(employeesRaw) && employeesRaw > 0 && employeesRaw < 1000000 ? employeesRaw : null;
    const sourcePage = clean(p.source_page, 80);

    if (!orgId || !UUID_RE.test(orgId) || !name || name.length < 2 || !company || !EMAIL_RE.test(email) || !employees) {
      return json({ error: 'Revisa los datos: nombre, empresa, correo y número de empleados son obligatorios.' }, 400);
    }
    if (phone && !/^[0-9+()\-\s.]{7,30}$/.test(phone)) {
      return json({ error: 'Revisa el teléfono.' }, 400);
    }

    const { data: lead, error: insError } = await sb
      .from('empresa_leads')
      .insert({ org_id: orgId, name, company, phone, email, employees, source_page: sourcePage })
      .select('id, created_at')
      .single();
    if (insError) {
      console.error('[empresa-lead] insert failed:', insError.message);
      return json({ error: 'No pudimos enviar tu solicitud. Inténtalo más tarde o llámanos.' }, 500);
    }

    const rows: [string, string][] = [
      ['Nombre', name],
      ['Empresa', company],
      ['Teléfono', phone || '—'],
      ['Correo', email],
      ['Número de empleados', String(employees)],
      ['Página', sourcePage || '—'],
    ];
    const html = `<div style="font-family:Arial,sans-serif;color:#141B3A;max-width:560px">
<h2 style="color:#1E2A8A;margin:0 0 12px">Nueva solicitud Plan Empresa</h2>
<p style="margin:0 0 16px">Llegó una solicitud desde el sitio apolofarmacia.com.mx:</p>
<table style="border-collapse:collapse;width:100%">${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:8px;border-bottom:1px solid #E3E8F2;font-weight:bold;width:40%">${esc(k)}</td><td style="padding:8px;border-bottom:1px solid #E3E8F2">${esc(v)}</td></tr>`
      )
      .join('')}</table>
<p style="margin:16px 0 0;font-size:12px;color:#4A5578">Folio ${esc(lead.id)}. Datos personales tratados conforme al Aviso de Privacidad de Farmacia Apolo.</p></div>`;
    const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

    let sent = false;
    if (env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.EMAIL_FROM || 'Farmacia Apolo <citas@apolofarmacia.com.mx>',
          to: [LEAD_INBOX],
          reply_to: email,
          subject: `Plan Empresa: ${company} (${employees} empleados)`,
          html,
          text,
        }),
      });
      sent = res.ok;
      if (!res.ok) console.error('[empresa-lead] Resend failed:', res.status, await res.text());
    } else {
      console.error('[empresa-lead] RESEND_API_KEY missing');
    }
    if (sent) await sb.from('empresa_leads').update({ email_sent: true }).eq('id', lead.id);

    // The lead is stored either way; staff can see it even if email failed.
    return ok();
  } catch (err) {
    console.error('[empresa-lead] unexpected error:', err);
    return json({ error: 'No pudimos enviar tu solicitud. Inténtalo más tarde o llámanos.' }, 500);
  }
});
