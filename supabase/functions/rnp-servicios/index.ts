// Supabase Edge Function: rnp-servicios
// Red Nacional de Pagos (recargastodomexico.com) — recargas, paquetes,
// pagos de servicios y tarjetas de regalo desde el POS.
//
// The browser NEVER talks to RNP: credentials live only in edge secrets
// (RNP_USER, RNP_PASSWORD, RNP_API_KEY) and every request/response is
// logged in public.rnp_transactions with the credentials stripped.
//
// Actions (POST JSON { action, ... }):
//   saldo      → obtenerSaldo  (read only; the POS calls it only when the
//                Servicios modal opens)
//   productos  → obtenerProductos {categoria}  (read only; served from a
//                24 h org-wide cache — RNP is called at most once a day
//                per category, since every successful response may cost)
//   recarga    → realizarRecarga  (category recarga | paquete)
//   servicio   → realizarServicio (category servicio | tarjeta)
//   vincular   → link {op_ids[]} to a completed {sale_id}
//
// Sale operations are NEVER retried here. RNP has no status-check method:
// any timeout / unreadable answer is recorded as 'pendiente' and the
// cashier is told not to resend. Only an explicit <Error> from RNP is
// 'rechazada' (safe to refund). Pre-send refusals are 'no_enviada'.
//
// Auth: JWT verification ON (config.toml) + caller must be an active
// admin/pos profile. The service-role key may call the read-only actions
// (saldo/productos) with an explicit org_id — used for catalog inspection
// by operators; it can never send a sale.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const RNP_URL = 'https://recargastodomexico.com/api/index.php';
const RNP_NS = 'https://recargastodomexico.com/api/index.php';
const RNP_TIMEOUT_MS = 90_000;
const SAME_PHONE_BLOCK_MS = 5 * 60_000;
const CATEGORIAS = ['recargas', 'tarjetas', 'servicios', 'digitales', 'todos'];
// obtenerProductos: at most once per category per 24 h per org.
const CATALOG_TTL_MS = 24 * 60 * 60_000;
// A refresh claim (and a failed refresh's cool-down) lasts 10 minutes.
const CATALOG_CLAIM_MS = 10 * 60_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

class ClientError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const supabaseAdmin = (env: Record<string, string>) =>
  createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

// ── Caller ───────────────────────────────────────────────────

type Caller = {
  kind: 'staff' | 'service';
  userId: string | null;
  name: string | null;
  role: string;
  orgId: string;
};

const resolveCaller = async (
  env: Record<string, string>,
  db: SupabaseClient,
  req: Request,
  payload: Record<string, any>
): Promise<Caller> => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ClientError('No autorizado', 401);

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
  if (serviceKey && token === serviceKey) {
    if (!['saldo', 'productos'].includes(payload.action)) {
      throw new ClientError('Acción no permitida con la llave de servicio', 403);
    }
    if (!UUID_RE.test(String(payload.org_id || ''))) throw new ClientError('org_id requerido');
    const { data: org } = await db.from('organizations').select('id').eq('id', payload.org_id).maybeSingle();
    if (!org) throw new ClientError('org_id inválido');
    return { kind: 'service', userId: null, name: 'service-role', role: 'service', orgId: payload.org_id };
  }

  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new ClientError('No autorizado', 401);
  const { data: profile } = await db
    .from('profiles')
    .select('role, org_id, full_name, deactivated_at')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.deactivated_at || !['admin', 'pos'].includes(profile.role as string)) {
    throw new ClientError('Solo el personal de caja puede usar servicios', 403);
  }
  return {
    kind: 'staff',
    userId: user.id,
    name: (profile.full_name as string) || user.email || null,
    role: profile.role as string,
    orgId: profile.org_id as string,
  };
};

// ── SOAP / XML helpers ───────────────────────────────────────

const xmlEscape = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Build <Root><Tag>value</Tag>...</Root>. Returns the real XML and a
// redacted copy for the log (Usuario / Password / ApiKey → ***).
const SECRET_TAGS = new Set(['Usuario', 'Password', 'ApiKey']);
const buildInner = (root: string, fields: Array<[string, unknown]>) => {
  const real = `<${root}>${fields.map(([k, v]) => `<${k}>${xmlEscape(v)}</${k}>`).join('')}</${root}>`;
  const redacted = `<${root}>${fields
    .map(([k, v]) => `<${k}>${SECRET_TAGS.has(k) ? '***' : xmlEscape(v)}</${k}>`)
    .join('')}</${root}>`;
  return { real, redacted };
};

const envelope = (method: string, inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope" xmlns:ns1="${RNP_NS}">` +
  `<env:Body><ns1:${method}><xml><![CDATA[${inner.replace(/]]>/g, ']]]]><![CDATA[>')}]]></xml></ns1:${method}></env:Body>` +
  `</env:Envelope>`;

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

type XNode = { name: string; attrs: Record<string, string>; children: XNode[]; text: string };

// Minimal tolerant XML parser (elements, attributes, text, CDATA). RNP's
// answers are small, flat documents; this avoids a runtime dependency.
const parseXml = (src: string): XNode => {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) {
      top.text += m[1];
    } else if (m[2]) {
      const name = m[2].replace(/^\w+:/, '');
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
    } else if (m[3]) {
      const node: XNode = { name: m[3].replace(/^\w+:/, ''), attrs: {}, children: [], text: '' };
      const attrRe = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = attrRe.exec(m[4] || ''))) node.attrs[a[1].replace(/^\w+:/, '')] = decodeEntities(a[2] ?? a[3] ?? '');
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) {
      top.text += decodeEntities(m[6]);
    }
  }
  return root;
};

const findAll = (node: XNode, pred: (n: XNode) => boolean, out: XNode[] = []) => {
  for (const c of node.children) {
    if (pred(c)) out.push(c);
    findAll(c, pred, out);
  }
  return out;
};
const findFirst = (node: XNode, name: string) =>
  findAll(node, (n) => n.name.toLowerCase() === name.toLowerCase())[0] || null;
const childText = (node: XNode | null, ...names: string[]) => {
  if (!node) return null;
  for (const name of names) {
    const lower = name.toLowerCase();
    const attr = Object.keys(node.attrs).find((k) => k.toLowerCase() === lower);
    if (attr) return node.attrs[attr].trim();
    const c = node.children.find((n) => n.name.toLowerCase() === lower);
    if (c) return c.text.trim();
  }
  return null;
};

// Plain-object view of a node (for the read-only actions' raw output).
const toPlain = (node: XNode): unknown => {
  if (node.children.length === 0 && Object.keys(node.attrs).length === 0) return node.text.trim();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node.attrs)) out[`@${k}`] = v;
  for (const c of node.children) {
    const v = toPlain(c);
    if (c.name in out) {
      const prev = out[c.name];
      out[c.name] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    } else {
      out[c.name] = v;
    }
  }
  if (node.text.trim()) out['#text'] = node.text.trim();
  return out;
};

const toNumber = (v: string | null) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ── RNP call ─────────────────────────────────────────────────

type RnpResult = {
  sent: boolean; // request left our server
  answered: boolean; // RNP produced a readable answer
  httpStatus: number | null;
  rawResponse: string | null;
  inner: XNode | null; // parsed contents of <return>
  fault: string | null;
  transportError: string | null;
  durationMs: number;
};

const callRnp = async (method: string, innerXml: string): Promise<RnpResult> => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RNP_TIMEOUT_MS);
  try {
    const res = await fetch(RNP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${RNP_NS}#${method}"`,
      },
      body: envelope(method, innerXml),
      signal: controller.signal,
    });
    const text = await res.text();
    const doc = parseXml(text);
    const ret = findFirst(doc, 'return');
    const faultNode = findFirst(doc, 'Fault');
    const fault = faultNode
      ? childText(findFirst(faultNode, 'Reason'), 'Text') || findFirst(faultNode, 'Text')?.text?.trim() || 'SOAP Fault'
      : null;
    let inner: XNode | null = null;
    if (ret) {
      // <return> carries the inner XML HTML-escaped (the parser already
      // decoded entities in text nodes) or as CDATA.
      inner = parseXml(ret.text.includes('<') ? ret.text : decodeEntities(ret.text));
    }
    return {
      sent: true,
      answered: !!inner,
      httpStatus: res.status,
      rawResponse: text,
      inner,
      fault,
      transportError: null,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return {
      sent: true, // we cannot know whether RNP received it
      answered: false,
      httpStatus: null,
      rawResponse: null,
      inner: null,
      fault: null,
      transportError: aborted ? `Timeout ${RNP_TIMEOUT_MS / 1000}s` : String((err as Error)?.message || err),
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
};

const rnpError = (inner: XNode | null) => {
  if (!inner) return null;
  // Only a non-empty <Error> counts: an empty tag on a success answer must
  // never turn a charged operation into a "refund the customer".
  const e = findFirst(inner, 'Error');
  const text = e?.text?.trim();
  return text ? text : null;
};

const isTruthyExito = (v: string | null) =>
  v != null && ['1', 'true', 'si', 'sí', 'ok', 'exito', 'éxito', 'aprobada', 'success'].includes(v.trim().toLowerCase());

// Catalog normalization (v2, from the plain view of obtenerProductos).
// Live catalog shape (verified 2026-11-24):
//   Productos > Resultado > Carrier[@id,@nombre] > Producto[@tipo]
//   recargas : Nombre, Monto, VIP            (Carrier sent = @id)
//   servicios: Nombre, Concepto, Monto ("Monto Libre" = open), Comision, Pines
//   tarjetas : Nombre, Concepto, Monto, Comision, Pines (Pines unique per product)
// Package products (TELCEL_INTERNET_AMIGO / TELCEL_SIN_LIMITE) carry a
// CODED Monto: price × 1000 + suffix (e.g. "INTERNET AMIGO 10" → 10005).
// `monto_param` is the exact string RNP listed (sent back verbatim);
// `monto` is the price charged. A coded product is kept only when the
// decoded price appears in its name — otherwise it is dropped (never guess
// a price).
const CATALOG_VERSION = 2;
const asArray = (v: unknown) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? null : String(v).trim());
const decodePrice = (montoRaw: string | null, nombre: string) => {
  if (montoRaw == null || !/^\d+(\.\d+)?$/.test(montoRaw)) return { monto: null, ok: true }; // open amount
  const n = Number(montoRaw);
  if (n <= 5000) return { monto: n, ok: true };
  const price = Math.floor(n / 1000);
  const inName = (nombre.match(/\d+(\.\d+)?/g) || []).map(Number).includes(price);
  return inName && price > 0 && price <= 5000 ? { monto: price, ok: true } : { monto: null, ok: false };
};
const normalizeCatalog = (plain: unknown) => {
  const items: Array<Record<string, unknown>> = [];
  const carriers: any[] = [];
  const collect = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(collect);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'Carrier') carriers.push(...asArray(v));
      else collect(v);
    }
  };
  collect(plain);
  for (const c of carriers) {
    if (!c || typeof c !== 'object') continue;
    const cid = str(c['@id']);
    const cnombre = str(c['@nombre']) || cid;
    for (const p of asArray(c.Producto) as any[]) {
      if (!p || typeof p !== 'object') continue;
      const nombre = str(p.Nombre) || '';
      const montoRaw = str(p.Monto);
      const { monto, ok } = decodePrice(montoRaw, nombre);
      if (!ok || !cid) continue;
      items.push({
        v: CATALOG_VERSION,
        carrier_id: cid,
        carrier_nombre: cnombre,
        tipo: str(p['@tipo']),
        nombre,
        monto,
        monto_param: monto == null ? null : montoRaw,
        concepto: str(p.Concepto),
        pines: str(p.Pines),
        comision: toNumber(str(p.Comision)),
        neto: null,
        descripcion: null,
      });
    }
  }
  return items;
};
const isCurrentCatalog = (items: unknown) =>
  Array.isArray(items) && items.length > 0 && (items[0] as Record<string, unknown>)?.v === CATALOG_VERSION;

// ── Log helpers ──────────────────────────────────────────────

const logReadOnly = async (
  db: SupabaseClient,
  caller: Caller,
  method: string,
  requestXml: string,
  r: RnpResult,
  ok: boolean,
  errorText: string | null,
  extra: Record<string, unknown> = {}
) => {
  const { error } = await db.from('rnp_transactions').insert({
    org_id: caller.orgId,
    created_by: caller.userId,
    created_by_name: caller.name,
    method,
    category: 'consulta',
    status: ok ? 'ok' : 'error',
    request_xml: requestXml,
    response_xml: r.rawResponse,
    http_status: r.httpStatus,
    error_text: errorText,
    duration_ms: r.durationMs,
    completed_at: new Date().toISOString(),
    ...extra,
  });
  if (error) console.error('[rnp-servicios] log insert failed:', error);
};

const credentials = (env: Record<string, string>) => {
  const user = env.RNP_USER;
  const pass = env.RNP_PASSWORD;
  const key = env.RNP_API_KEY;
  if (!user || !pass || !key) throw new ClientError('Servicios RNP no configurados (faltan credenciales)', 503);
  return { user, pass, key };
};

// ── Handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const env = Deno.env.toObject();
    const db = supabaseAdmin(env);
    const payload = (await req.json().catch(() => ({}))) as Record<string, any>;
    const action = String(payload.action || '');
    if (!['saldo', 'productos', 'recarga', 'servicio', 'vincular'].includes(action)) {
      throw new ClientError('action inválida. Usa saldo, productos, recarga, servicio o vincular.');
    }
    const caller = await resolveCaller(env, db, req, payload);

    // ── saldo ────────────────────────────────────────────────
    if (action === 'saldo') {
      const c = credentials(env);
      const { real, redacted } = buildInner('PDV', [['Tipo', 1], ['Usuario', c.user], ['Password', c.pass], ['ApiKey', c.key]]);
      const r = await callRnp('obtenerSaldo', real);
      const err = rnpError(r.inner) || r.fault || r.transportError || (r.answered ? null : 'Respuesta ilegible');
      await logReadOnly(db, caller, 'obtenerSaldo', envelope('obtenerSaldo', redacted), r, !err, err);
      if (err) return jsonResponse({ ok: false, error: `RNP: ${err}` }, 502);
      return jsonResponse({
        ok: true,
        saldo_recargas: toNumber(findFirst(r.inner!, 'SaldoRecargas')?.text ?? null),
        saldo_servicios: toNumber(findFirst(r.inner!, 'SaldoServicios')?.text ?? null),
      });
    }

    // ── productos ────────────────────────────────────────────
    // Every successful RNP response may carry a cost: the catalog is
    // fetched at most once per category per 24 h for the whole org and
    // served from rnp_catalog_cache to every cashier. A claim
    // (refreshing_at) stops two cashiers from refreshing together; a
    // failed refresh keeps its claim for CATALOG_CLAIM_MS (no hammering).
    if (action === 'productos') {
      const categoria = String(payload.categoria || 'todos').toLowerCase();
      if (!CATEGORIAS.includes(categoria)) throw new ClientError('categoria inválida');
      const wantRaw = payload.include_raw === true && (caller.kind === 'service' || caller.role === 'admin');
      const key = { org_id: caller.orgId, categoria };

      const { error: seedErr } = await db
        .from('rnp_catalog_cache')
        .upsert(key, { onConflict: 'org_id,categoria', ignoreDuplicates: true });
      if (seedErr) throw seedErr;
      const { data: cached, error: cacheErr } = await db
        .from('rnp_catalog_cache')
        .select('items, raw, fetched_at')
        .eq('org_id', caller.orgId)
        .eq('categoria', categoria)
        .maybeSingle();
      if (cacheErr) throw cacheErr;

      const reply = (row: { items: unknown; raw?: unknown; fetched_at: string } | null, source: string) => {
        const body: Record<string, unknown> = {
          ok: true,
          categoria,
          source, // 'cache' | 'rnp' | 'stale'
          fetched_at: row?.fetched_at ?? null,
          items: Array.isArray(row?.items) ? row!.items : [],
        };
        if (wantRaw) body.raw = row?.raw ?? null;
        return jsonResponse(body);
      };
      // Cache written by an older normalizer: rebuild items from the stored
      // raw answer (no RNP call).
      if (cached && cached.raw && !isCurrentCatalog(cached.items)) {
        const rebuilt = normalizeCatalog(cached.raw);
        if (rebuilt.length > 0) {
          cached.items = rebuilt;
          await db.from('rnp_catalog_cache').update({ items: rebuilt }).eq('org_id', caller.orgId).eq('categoria', categoria);
        }
      }
      const hasItems = Array.isArray(cached?.items) && (cached!.items as unknown[]).length > 0;
      const fresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < CATALOG_TTL_MS;
      if (fresh) return reply(cached, 'cache');

      // Claim the refresh (only one caller per category at a time).
      const nowIso = new Date().toISOString();
      const claimCutoff = new Date(Date.now() - CATALOG_CLAIM_MS).toISOString();
      const ttlCutoff = new Date(Date.now() - CATALOG_TTL_MS).toISOString();
      const { data: claimed, error: claimErr } = await db
        .from('rnp_catalog_cache')
        .update({ refreshing_at: nowIso })
        .eq('org_id', caller.orgId)
        .eq('categoria', categoria)
        .lt('fetched_at', ttlCutoff)
        .or(`refreshing_at.is.null,refreshing_at.lt."${claimCutoff}"`)
        .select('org_id');
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) {
        if (hasItems) return reply(cached, 'stale');
        return jsonResponse({ ok: false, error: 'El catálogo se está actualizando. Intenta de nuevo en unos minutos.' }, 409);
      }

      const c = credentials(env);
      const { real, redacted } = buildInner('Productos', [
        ['Tipo', 1], ['Usuario', c.user], ['Password', c.pass], ['ApiKey', c.key], ['Categoria', categoria],
      ]);
      const r = await callRnp('obtenerProductos', real);
      const err = rnpError(r.inner) || r.fault || r.transportError || (r.answered ? null : 'Respuesta ilegible');
      // Catalog answers can be large: keep the first 200 KB in the log.
      await logReadOnly(db, caller, 'obtenerProductos', envelope('obtenerProductos', redacted), {
        ...r,
        rawResponse: r.rawResponse ? r.rawResponse.slice(0, 200_000) : null,
      }, !err, err, { product_name: categoria });
      if (err) {
        // Keep the claim (cool-down) and serve the previous catalog if any.
        if (hasItems) return reply(cached, 'stale');
        return jsonResponse({ ok: false, error: `RNP: ${err}` }, 502);
      }
      const plain = toPlain(r.inner!);
      const row = { items: normalizeCatalog(plain), raw: plain, fetched_at: new Date().toISOString() };
      const { error: saveErr } = await db
        .from('rnp_catalog_cache')
        .update({ ...row, refreshing_at: null })
        .eq('org_id', caller.orgId)
        .eq('categoria', categoria);
      if (saveErr) console.error('[rnp-servicios] catalog cache save failed:', saveErr);
      return reply(row, 'rnp');
    }

    // ── vincular ─────────────────────────────────────────────
    if (action === 'vincular') {
      if (caller.kind !== 'staff') throw new ClientError('No autorizado', 403);
      const saleId = String(payload.sale_id || '');
      const opIds = Array.isArray(payload.op_ids) ? payload.op_ids.map(String).filter((s: string) => UUID_RE.test(s)) : [];
      if (!UUID_RE.test(saleId) || opIds.length === 0 || opIds.length > 50) throw new ClientError('Datos inválidos');
      const { data: sale } = await db.from('sales').select('id, org_id').eq('id', saleId).maybeSingle();
      if (!sale || sale.org_id !== caller.orgId) throw new ClientError('Venta no encontrada', 404);
      const { error } = await db
        .from('rnp_transactions')
        .update({ sale_id: saleId })
        .eq('org_id', caller.orgId)
        .in('op_id', opIds)
        .is('sale_id', null);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    // ── recarga / servicio (sale operations) ─────────────────
    if (caller.kind !== 'staff') throw new ClientError('No autorizado', 403);

    const opId = String(payload.op_id || '');
    if (!UUID_RE.test(opId)) throw new ClientError('op_id inválido');
    const category = String(payload.category || '');
    const method = action === 'recarga' ? 'realizarRecarga' : 'realizarServicio';
    if (action === 'recarga' && !['recarga', 'paquete'].includes(category)) throw new ClientError('category inválida');
    if (action === 'servicio' && !['servicio', 'tarjeta'].includes(category)) throw new ClientError('category inválida');

    // Phone: 10-digit cell for recargas/paquetes and code-by-SMS tarjetas;
    // for pagos de servicio (and tag-type tarjetas) it carries the biller
    // reference named by the catalog's Concepto (contrato, código de barras,
    // alfanumérico…): 4–40 letters/digits, no spaces or dashes.
    const phoneRaw = String(payload.phone || '').trim();
    const phone = action === 'recarga' ? phoneRaw.replace(/\D/g, '') : phoneRaw.replace(/[\s-]/g, '').toUpperCase();
    if (action === 'recarga' && !/^\d{10}$/.test(phone)) throw new ClientError('El número debe tener 10 dígitos');
    if (action === 'servicio' && !/^[A-Z0-9]{4,40}$/.test(phone)) throw new ClientError('Referencia inválida (4 a 40 letras o números)');
    const carrier = String(payload.carrier || '').trim();
    if (!carrier || carrier.length > 160) throw new ClientError('Compañía / producto inválido');

    // montoNum = price charged; monto = exact <Monto> sent to RNP. A catalog
    // product's Monto (monto_param) is sent verbatim — package codes like
    // "10005" must decode (÷1000) to the price charged.
    const montoNum = Number(payload.monto);
    const montoParam = payload.monto_param != null ? String(payload.monto_param).trim() : '';
    let monto: string;
    if (montoParam) {
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(montoParam)) throw new ClientError('Monto inválido');
      const mp = Number(montoParam);
      const matches = mp <= 5000 ? Math.abs(mp - montoNum) < 0.005 : Math.floor(mp / 1000) === montoNum;
      if (!matches || !(montoNum > 0) || montoNum > 5000) throw new ClientError('Monto inválido');
      monto = montoParam;
    } else if (action === 'recarga') {
      if (!Number.isInteger(montoNum) || montoNum <= 0 || montoNum > 5000) throw new ClientError('Monto inválido');
      monto = String(montoNum);
    } else {
      if (!Number.isFinite(montoNum) || montoNum < 1 || montoNum > 5000) throw new ClientError('Monto fuera de rango (1.00 – 5000.00)');
      monto = montoNum.toFixed(2);
    }
    const fee = Number(payload.fee);
    const feeValue = Number.isFinite(fee) && fee >= 0 && fee <= 1000 ? fee : null;

    let email = '';
    if (action === 'servicio') {
      // realizarServicio requires an Email: the CUSTOMER's, captured on the
      // form (no store-email fallback).
      const candidate = String(payload.email || '').trim();
      if (!EMAIL_RE.test(candidate) || candidate.length > 160) throw new ClientError('Correo del cliente inválido');
      email = candidate;
    }

    // Shift must be open and in the caller's org.
    const shiftId = payload.shift_id ? String(payload.shift_id) : null;
    if (!shiftId || !UUID_RE.test(shiftId)) throw new ClientError('Abre un turno antes de vender servicios');
    const { data: shift } = await db.from('shifts').select('id, org_id, status, location_id').eq('id', shiftId).maybeSingle();
    if (!shift || shift.org_id !== caller.orgId || shift.status !== 'open') {
      throw new ClientError('El turno no está abierto');
    }

    const c = credentials(env);
    const fields: Array<[string, unknown]> =
      action === 'recarga'
        ? [['Tipo', 1], ['ApiKey', c.key], ['Usuario', c.user], ['Password', c.pass], ['Carrier', carrier], ['Monto', monto], ['Phone', phone]]
        : [['Tipo', 1], ['ApiKey', c.key], ['Usuario', c.user], ['Password', c.pass], ['Carrier', carrier], ['Monto', monto], ['Phone', phone], ['Email', email]];
    const { real, redacted } = buildInner(action === 'recarga' ? 'Recarga' : 'Servicio', fields);

    // 1. Record the op BEFORE sending. The unique op_id makes a resend of
    //    the same cart line impossible (double click, network retry).
    const { data: row, error: insErr } = await db
      .from('rnp_transactions')
      .insert({
        org_id: caller.orgId,
        location_id: shift.location_id || null,
        shift_id: shiftId,
        created_by: caller.userId,
        created_by_name: caller.name,
        op_id: opId,
        method,
        category,
        carrier,
        product_name: payload.product_label ? String(payload.product_label).slice(0, 200) : carrier,
        phone,
        email: email || null,
        amount: montoNum,
        fee: feeValue,
        status: 'enviando',
        request_xml: envelope(method, redacted),
      })
      .select('id')
      .single();
    if (insErr) {
      if ((insErr as { code?: string }).code === '23505') {
        const { data: existing } = await db
          .from('rnp_transactions')
          .select('status, autorizacion, venta, codigo, error_text, org_id')
          .eq('op_id', opId)
          .maybeSingle();
        if (!existing || existing.org_id !== caller.orgId) throw new ClientError('Operación duplicada', 409);
        return jsonResponse({
          duplicate: true,
          status: existing.status === 'enviando' ? 'pendiente' : existing.status,
          autorizacion: existing.autorizacion,
          venta: existing.venta,
          codigo: existing.codigo,
          error: existing.error_text,
        });
      }
      throw insErr;
    }

    const finish = async (update: Record<string, unknown>) => {
      const { error } = await db
        .from('rnp_transactions')
        .update({ ...update, completed_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) console.error('[rnp-servicios] log update failed:', error);
    };

    // 2. Same phone within 5 minutes is blocked by RNP — refuse before
    //    sending (counts any op still in flight, approved or pending).
    const since = new Date(Date.now() - SAME_PHONE_BLOCK_MS).toISOString();
    const { data: recent } = await db
      .from('rnp_transactions')
      .select('id')
      .eq('org_id', caller.orgId)
      .eq('phone', phone)
      .in('method', ['realizarRecarga', 'realizarServicio'])
      .in('status', ['enviando', 'aprobada', 'pendiente'])
      .gte('created_at', since)
      .neq('id', row.id)
      .limit(1);
    if (recent && recent.length > 0) {
      const msg = 'Este número ya tuvo una operación hace menos de 5 minutos. RNP la bloquearía: no se envió.';
      await finish({ status: 'no_enviada', error_text: msg });
      return jsonResponse({ status: 'no_enviada', error: msg });
    }

    // 3. Send once. Never retried.
    const r = await callRnp(method, real);
    const errorText = rnpError(r.inner);
    const exito = r.inner ? findFirst(r.inner, 'Exito')?.text?.trim() ?? null : null;
    const autorizacion = r.inner ? findFirst(r.inner, 'Autorizacion')?.text?.trim() || null : null;
    const venta = r.inner ? findFirst(r.inner, 'Venta')?.text?.trim() || null : null;
    const codigo = r.inner ? findFirst(r.inner, 'Codigo')?.text?.trim() || null : null;
    const nuevoSaldo = r.inner ? toNumber(findFirst(r.inner, 'NuevoSaldo')?.text ?? null) : null;
    const fecha = r.inner ? findFirst(r.inner, 'Fecha')?.text?.trim() || null : null;

    // Order matters: a confirmed Exito wins over any Error text (money was
    // taken); only an explicit Error without Exito is a refundable reject.
    let status: 'aprobada' | 'rechazada' | 'pendiente';
    if (r.answered && (isTruthyExito(exito) || (!!autorizacion && exito == null && !errorText))) status = 'aprobada';
    else if (r.answered && errorText) status = 'rechazada';
    else status = 'pendiente'; // timeout, SOAP fault, Exito=0 without Error, unreadable → do not resend

    await finish({
      status,
      response_xml: r.rawResponse,
      http_status: r.httpStatus,
      error_text: errorText || r.fault || r.transportError || (status === 'pendiente' ? `Respuesta sin confirmación (Exito=${exito ?? '—'})` : null),
      autorizacion,
      venta,
      codigo,
      nuevo_saldo: nuevoSaldo,
      rnp_fecha: fecha,
      duration_ms: r.durationMs,
    });

    return jsonResponse({
      status,
      autorizacion,
      venta,
      codigo,
      fecha,
      nuevo_saldo: nuevoSaldo,
      error: status === 'rechazada' ? errorText : status === 'pendiente' ? 'El proveedor no confirmó la operación.' : null,
    });
  } catch (err) {
    console.error('[rnp-servicios] error:', err);
    // ClientError is only ever thrown BEFORE anything is sent to RNP, so
    // the POS may safely treat it as "no enviada" (refundable).
    if (err instanceof ClientError) return jsonResponse({ error: err.message, sent: false }, err.status);
    return jsonResponse({ error: 'No se pudo procesar la solicitud de servicios.' }, 500);
  }
});
