// Supabase Edge Function: affiliate-signup
// Public self-registration for partner businesses ("afiliados"). The form on
// /afiliados/ collects the business listing info + contact email; this
// function provisions the auth account, creates the partners row (live
// immediately), optionally generates the 10% poster coupon, emails the
// afiliado (welcome + GoTrue password-setup) and alerts org admins.
//
// Public (verify_jwt = false): the registrant has no session yet. Abuse
// controls: honeypot field + per-IP sliding-window rate limiting
// (rate_limit_events table, fails open like tablet-checkin). All responses
// are generic so the endpoint cannot be used to enumerate accounts.
//
// If the email already has an account (e.g. a customer-app user), the
// listing is linked to that existing account and no password email is sent —
// the welcome email still goes only to the account's own email address.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PORTAL_URL = 'https://app.apolofarmacia.com.mx/afiliados/';
const RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

interface SignupPayload {
  org_id: string;
  name: string;
  category?: string;
  offer: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  website?: string;
  email: string;
  poster_opt_in?: boolean;
  logo?: string; // optional data:image/jpeg;base64,... from the form
  company?: string; // honeypot — must be empty
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

const okResponse = () =>
  jsonResponse(
    { ok: true, message: 'Registro recibido. Si el correo es válido, recibirás las instrucciones para entrar a tu portal.' },
    200
  );

const isAlreadyRegisteredError = (err: { message?: string; code?: string }) => {
  const code = (err.code || '').toLowerCase();
  if (code.includes('already') || code.includes('exist')) return true;
  return /already|exist|registered|duplicate/i.test(err.message || '');
};

// Sliding-window per-IP rate limit. Fails open (with a warning) if the
// rate_limit_events table is unreachable — signups must keep working.
const checkRateLimit = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  ip: string | null
): Promise<boolean> => {
  const key = ip || 'unknown';
  try {
    const since = new Date(Date.now() - RATE_LIMIT.windowMs).toISOString();
    const { count, error } = await supabase
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', 'affiliate-signup')
      .eq('key', key)
      .gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= RATE_LIMIT.limit) return false;
    const { error: insError } = await supabase
      .from('rate_limit_events')
      .insert({ bucket: 'affiliate-signup', key });
    if (insError) throw insError;
    if (Math.random() < 0.02) {
      await supabase
        .from('rate_limit_events')
        .delete()
        .lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    }
    return true;
  } catch (err) {
    console.warn('[affiliate-signup] rate limit unavailable; allowing request:', err);
    return true;
  }
};

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405);

  try {
    const payload = (await req.json()) as SignupPayload;
    const env = Deno.env.toObject();
    const supabase = supabaseAdmin(env);

    // Honeypot: bots see a success and nothing happens.
    if (payload.company) return okResponse();

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip');
    const withinLimit = await checkRateLimit(supabase, ip);
    if (!withinLimit) {
      return jsonResponse({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }, 429);
    }

    // ── Validation (generic message — details only in logs) ─────────────
    const orgId = clean(payload.org_id, 64);
    const name = clean(payload.name, 120);
    const offer = clean(payload.offer, 200);
    const email = (clean(payload.email, 160) || '').toLowerCase();
    if (!orgId || !name || name.length < 2 || !offer || offer.length < 2 || !EMAIL_RE.test(email)) {
      console.warn('[affiliate-signup] invalid payload:', {
        orgId: !!orgId,
        name: !!name,
        offer: !!offer,
        emailOk: EMAIL_RE.test(email),
      });
      return jsonResponse({ error: 'Revisa los datos del formulario: nombre, oferta y correo son obligatorios.' }, 400);
    }

    const listing = {
      org_id: orgId,
      name,
      category: clean(payload.category, 60),
      offer,
      description: clean(payload.description, 500),
      phone: clean(payload.phone, 30),
      whatsapp: clean(payload.whatsapp, 30),
      address: clean(payload.address, 200),
      website: clean(payload.website, 200),
      active: true,
      sort_order: 100,
      poster_opt_in: payload.poster_opt_in === true,
      contact_email: email,
    };

    // ── Auth account ────────────────────────────────────────────────────
    let userId: string;
    let accountExisted = false;
    const tempPassword = crypto.randomUUID() + crypto.randomUUID();
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (createError) {
      if (!isAlreadyRegisteredError(createError)) {
        console.error('[affiliate-signup] createUser failed:', createError.message);
        return jsonResponse({ error: 'No se pudo completar el registro. Inténtalo más tarde.' }, 500);
      }
      accountExisted = true;
      // Resolve the existing account's id by email (paginate a couple of
      // pages — the shop's user base is small).
      let found: string | null = null;
      for (let page = 1; page <= 5 && !found; page++) {
        const { data: list, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (listError) {
          console.error('[affiliate-signup] listUsers failed:', listError.message);
          break;
        }
        const match = list.users.find((u) => (u.email || '').toLowerCase() === email);
        if (match) found = match.id;
        if (list.users.length < 200) break;
      }
      if (!found) {
        console.error('[affiliate-signup] email registered but user not found:', email);
        return okResponse(); // never leak account state
      }
      userId = found;
    } else {
      userId = created.user.id;
    }

    // ── Partner listing (one per account) ───────────────────────────────
    const { data: existingPartner } = await supabase
      .from('partners')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (existingPartner) {
      // Already has a listing — stay silent (generic success, no info leak).
      return okResponse();
    }

    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .insert({ ...listing, user_id: userId })
      .select('id')
      .single();
    if (partnerError) {
      console.error('[affiliate-signup] partner insert failed:', partnerError.message);
      return jsonResponse({ error: 'No se pudo completar el registro. Inténtalo más tarde.' }, 500);
    }

    // ── Logo (optional) ─────────────────────────────────────────────────
    // The form sends a client-side-resized JPEG as a data URL. Upload via
    // service role (registrant is anonymous) and store the public URL. A
    // logo failure must never fail the signup — they can upload it later
    // from their portal.
    const logoDataUrl = typeof payload.logo === 'string' ? payload.logo.trim() : '';
    if (logoDataUrl) {
      try {
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=\s]+)$/.exec(logoDataUrl);
        if (!match) throw new Error('unexpected logo format');
        const bytes = Uint8Array.from(atob(match[1].replace(/\s/g, '')), (c) => c.charCodeAt(0));
        if (bytes.length < 100 || bytes.length > 2 * 1024 * 1024) {
          throw new Error(`logo size out of range: ${bytes.length}`);
        }
        const logoPath = `${partner.id}/logo-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('partner-logos')
          .upload(logoPath, bytes, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('partner-logos').getPublicUrl(logoPath);
        if (!pub?.publicUrl) throw new Error('no public url');
        const { error: logoUpdateError } = await supabase
          .from('partners')
          .update({ logo_url: pub.publicUrl })
          .eq('id', partner.id);
        if (logoUpdateError) throw logoUpdateError;
      } catch (err) {
        console.error('[affiliate-signup] logo upload failed (signup continues):', err);
      }
    }

    // ── Poster coupon (optional) ────────────────────────────────────────
    let couponCode: string | null = null;
    if (listing.poster_opt_in) {
      const { data: code, error: couponError } = await supabase.rpc('generate_partner_coupon', {
        p_partner_id: partner.id,
      });
      if (couponError) {
        console.error('[affiliate-signup] coupon generation failed:', couponError.message);
      } else {
        couponCode = code as string;
        const { error: posterNotifyError } = await supabase.rpc('notify_org_admins', {
          p_org_id: orgId,
          p_template: 'affiliate_poster_optin',
          p_payload: { partner_name: name, coupon_code: couponCode },
        });
        if (posterNotifyError) console.error('[affiliate-signup] poster notify failed:', posterNotifyError.message);
      }
    }

    // ── Emails ──────────────────────────────────────────────────────────
    const { error: welcomeError } = await supabase.from('notification_queue').insert({
      org_id: orgId,
      channel: 'email',
      recipient: email,
      template: 'affiliate_welcome',
      payload: {
        patient_name: name,
        partner_name: name,
        portal_url: PORTAL_URL,
        coupon_code: couponCode || undefined,
      },
      scheduled_for: new Date().toISOString(),
    });
    if (welcomeError) console.error('[affiliate-signup] welcome enqueue failed:', welcomeError.message);

    const { error: signupNotifyError } = await supabase.rpc('notify_org_admins', {
      p_org_id: orgId,
      p_template: 'affiliate_new_signup',
      p_payload: {
        partner_name: name,
        contact_email: email,
        category: listing.category || '',
        offer,
        poster_opt_in: listing.poster_opt_in,
      },
    });
    if (signupNotifyError) console.error('[affiliate-signup] signup notify failed:', signupNotifyError.message);

    // Password setup only for brand-new accounts (existing account holders
    // already have a password — the welcome email tells them to just log in).
    if (!accountExisted) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: PORTAL_URL,
      });
      if (resetError) console.error('[affiliate-signup] recovery email failed:', resetError.message);
    }

    return okResponse();
  } catch (err) {
    console.error('[affiliate-signup] unexpected error:', err);
    return jsonResponse({ error: 'No se pudo completar el registro. Inténtalo más tarde.' }, 500);
  }
});
