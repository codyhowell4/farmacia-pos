// Servicios RNP (Red Nacional de Pagos — recargastodomexico.com) for the POS.
// Every call goes through the `rnp-servicios` edge function; the browser
// never holds RNP credentials.
import { supabase } from '@/lib/supabase';

// ── Settings (edit here) ─────────────────────────────────────
// Comisión Apolo cobrada al cliente ENCIMA del monto, por operación.
export const RNP_FEES = {
  recarga: 10,
  paquete: 10,
  servicio: 20,
  tarjeta: 25,
};

// Email sent to RNP on realizarServicio when the ticket has no customer
// email. Empty → the edge function falls back to the RNP_STORE_EMAIL secret.
export const RNP_STORE_EMAIL = '';

// Send the ticket customer's email to RNP (else always the store email).
export const RNP_SEND_CUSTOMER_EMAIL = true;

// Montos sugeridos para recargas cuando el catálogo no trae montos fijos.
export const RNP_DEFAULT_RECARGA_AMOUNTS = [20, 30, 50, 100, 150, 200, 300, 500];

export const RNP_CATEGORIES = {
  recarga: { label: 'Recarga de saldo', tag: 'RECARGA', action: 'recarga' },
  paquete: { label: 'Paquete de datos', tag: 'PAQUETE', action: 'recarga' },
  servicio: { label: 'Pago de servicios', tag: 'PAGO DE SERVICIO', action: 'servicio' },
  tarjeta: { label: 'Tarjetas de regalo', tag: 'TARJETA DE REGALO', action: 'servicio' },
};

// Payment methods allowed on a ticket that carries services.
export const RNP_ALLOWED_PAYMENT_METHODS = ['cash', 'card'];

// ── Cart lines ───────────────────────────────────────────────
// A service adds TWO cart lines: the service itself (amount sent to RNP)
// and the Comisión Apolo (fee). Both are quantity 1, not editable, not
// discounted, outside the IVA base, and carry no inventory_id.
export const isRnpCartLine = (item) => !!(item?.rnp || item?.rnpFeeFor);
export const isRnpServiceLine = (item) => !!item?.rnp;
export const isRnpFeeLine = (item) => !!item?.rnpFeeFor;
export const cartHasRnp = (cart) => (cart || []).some(isRnpCartLine);
export const rnpLinesTotal = (cart) =>
  (cart || []).filter(isRnpCartLine).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);

export const formatPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : d;
};

const newOpId = () =>
  (globalThis.crypto?.randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));

// draft: { category, carrierLabel, carrierParam, productLabel, phone, amount }
export const buildRnpCartLines = (draft) => {
  const opId = newOpId();
  const cat = RNP_CATEGORIES[draft.category];
  const fee = Number(RNP_FEES[draft.category] || 0);
  const amount = Math.round(Number(draft.amount) * 100) / 100;
  const last4 = String(draft.phone || '').slice(-4);
  const name = draft.category === 'tarjeta'
    ? `Tarjeta de regalo ${draft.productLabel}`
    : draft.category === 'servicio'
      ? `Pago ${draft.productLabel}`
      : draft.category === 'paquete'
        ? `Paquete ${draft.carrierLabel} — ${draft.productLabel}`
        : `Recarga ${draft.carrierLabel}`;
  const service = {
    id: `rnp-${opId}`,
    name: `${name} (…${last4})`,
    price: amount,
    originalPrice: amount,
    quantity: 1,
    overrideBy: null,
    revisionIds: [],
    item_type: 'service',
    rnp: {
      opId,
      category: draft.category,
      action: cat.action,
      tag: cat.tag,
      carrierLabel: draft.carrierLabel,
      carrierParam: draft.carrierParam,
      productLabel: draft.productLabel,
      phone: draft.phone,
      amount,
      fee,
    },
  };
  const feeLine = {
    id: `rnp-fee-${opId}`,
    name: `Comisión servicio — ${cat.label}`,
    price: fee,
    originalPrice: fee,
    quantity: 1,
    overrideBy: null,
    revisionIds: [],
    item_type: 'service',
    rnpFeeFor: opId,
  };
  return fee > 0 ? [service, feeLine] : [service];
};

// ── Edge function calls ──────────────────────────────────────

const readFnError = async (error) => {
  // FunctionsHttpError carries the Response in error.context.
  try {
    if (error?.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      return { status: error.context.status, body };
    }
  } catch {
    /* body not JSON */
  }
  return { status: null, body: null };
};

const invoke = async (body) => {
  const { data, error } = await supabase.functions.invoke('rnp-servicios', { body });
  if (error) {
    const { status, body: errBody } = await readFnError(error);
    const e = new Error(errBody?.error || error.message || 'Error de servicios');
    e.status = status;
    e.sent = errBody?.sent;
    throw e;
  }
  return data;
};

export const getRnpSaldo = () => invoke({ action: 'saldo' });

// The authoritative catalog cache is server-side (rnp_catalog_cache: RNP's
// obtenerProductos runs at most once per category per 24 h for the whole
// org, since every successful RNP response may carry a cost). This
// in-memory copy only saves edge-function round trips within a session.
const CATALOG_TTL_MS = 30 * 60 * 1000;
const catalogCache = new Map(); // categoria → { at, items }
export const getRnpProductos = async (categoria, { force = false } = {}) => {
  const cached = catalogCache.get(categoria);
  if (!force && cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.items;
  const data = await invoke({ action: 'productos', categoria });
  const items = Array.isArray(data?.items) ? data.items : [];
  catalogCache.set(categoria, { at: Date.now(), items });
  return items;
};

// Send ONE service line to RNP. Never retried. Resolves to
// { status: 'aprobada'|'rechazada'|'pendiente'|'no_enviada', autorizacion, venta, codigo, error }.
// Any failure where we cannot prove the request did NOT reach RNP is
// 'pendiente' (no refund, do not resend).
export const sendRnpLine = async (line, { shiftId, email }) => {
  const r = line.rnp;
  try {
    const data = await invoke({
      action: r.action,
      op_id: r.opId,
      category: r.category,
      carrier: r.carrierParam,
      product_label: `${r.carrierLabel || ''} ${r.productLabel || ''}`.trim(),
      monto: r.amount,
      phone: r.phone,
      fee: r.fee,
      email: r.action === 'servicio' ? email || RNP_STORE_EMAIL || '' : undefined,
      shift_id: shiftId,
    });
    const status = ['aprobada', 'rechazada', 'pendiente', 'no_enviada'].includes(data?.status) ? data.status : 'pendiente';
    return { ...data, status };
  } catch (e) {
    if (e.sent === false) return { status: 'no_enviada', error: e.message };
    return { status: 'pendiente', error: e.message || 'Sin respuesta del servidor' };
  }
};

export const linkRnpOpsToSale = (saleId, opIds) =>
  invoke({ action: 'vincular', sale_id: saleId, op_ids: opIds });

// Refundable = RNP explicitly refused it, or it never left our server.
export const isRefundableStatus = (status) => status === 'rechazada' || status === 'no_enviada';
