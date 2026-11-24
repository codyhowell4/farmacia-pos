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

// Alerta de saldo bajo (MXN). The live value is a setting stored in
// rnp_balance.low_balance_threshold (Admin › Servicios RNP); this is the
// fallback when it can't be read.
export const RNP_LOW_BALANCE_DEFAULT = 200;
export const isRnpBalanceLow = (saldo, threshold = RNP_LOW_BALANCE_DEFAULT) =>
  saldo != null && Number.isFinite(Number(saldo)) && Number(saldo) < Number(threshold ?? RNP_LOW_BALANCE_DEFAULT);

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
// Saved sale_items: both RNP lines carry rnp_op_id; the comisión line is
// named "Comisión servicio — …" (see buildRnpCartLines).
export const isRnpFeeSaleItem = (item) => !!item?.rnp_op_id && /^Comisi[oó]n servicio/i.test(item?.name || '');
export const isRnpServiceSaleItem = (item) => !!item?.rnp_op_id && !isRnpFeeSaleItem(item);
export const rnpSaleTotals = (sales) => {
  let services = 0; let fees = 0; let count = 0;
  (sales || []).forEach((s) => (s?.sale_items || []).forEach((i) => {
    const amt = Number(i.price || 0) * Number(i.quantity || 0);
    if (isRnpServiceSaleItem(i)) { services += amt; if (amt > 0) count += 1; }
    else if (isRnpFeeSaleItem(i)) fees += amt;
  }));
  return { services: Math.round(services * 100) / 100, fees: Math.round(fees * 100) / 100, count };
};

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

// draft: { category, carrierLabel, carrierParam, productLabel, phone, amount,
//          montoParam?, refLabel?, email? }
// montoParam = the catalog's exact <Monto> (package codes like "10005");
// email = customer email captured on the form (required by realizarServicio).
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
      montoParam: draft.montoParam || null,
      refLabel: draft.refLabel || null,
      email: draft.email || null,
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
      monto_param: r.montoParam || undefined,
      phone: r.phone,
      fee: r.fee,
      email: r.action === 'servicio' ? r.email || email || RNP_STORE_EMAIL || '' : undefined,
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

// ── Corte de caja ────────────────────────────────────────────
// RNP lines on a shift (rnp_shift_summary RPC) and the drawer adjustment:
//   + cash_add_back    Fallida ops sold in cash on this shift whose refund
//                      has not left this drawer (the sale was already
//                      reduced, but the money is still in the drawer)
//   − cash_refunds_out cash refunds paid from this drawer for ops sold on
//                      other shifts
// Never blocks a shift close: on error the adjustment is 0 and `error` is set.
export const EMPTY_RNP_SHIFT_SUMMARY = {
  count: 0, pending_count: 0, services_amount: 0, fees_amount: 0,
  services_cash: 0, fees_cash: 0, services_card: 0, fees_card: 0, by_category: {},
  fallidas_count: 0, fallidas_amount: 0, cash_add_back: 0, cash_refunds_out: 0,
};
export const loadRnpShiftSummary = async (getRnpShiftSummary, shiftId) => {
  if (!shiftId) return { ...EMPTY_RNP_SHIFT_SUMMARY };
  try {
    const d = await getRnpShiftSummary(shiftId);
    const num = (v) => Number(v || 0);
    return {
      ...EMPTY_RNP_SHIFT_SUMMARY,
      ...d,
      count: num(d?.count), pending_count: num(d?.pending_count),
      services_amount: num(d?.services_amount), fees_amount: num(d?.fees_amount),
      services_cash: num(d?.services_cash), fees_cash: num(d?.fees_cash),
      services_card: num(d?.services_card), fees_card: num(d?.fees_card),
      fallidas_count: num(d?.fallidas_count), fallidas_amount: num(d?.fallidas_amount),
      cash_add_back: num(d?.cash_add_back), cash_refunds_out: num(d?.cash_refunds_out),
      by_category: d?.by_category || {},
    };
  } catch (e) {
    console.error('[rnp] shift summary failed:', e);
    return { ...EMPTY_RNP_SHIFT_SUMMARY, error: e?.message || 'No disponible' };
  }
};
export const rnpCashAdjustment = (summary) =>
  Math.round((Number(summary?.cash_add_back || 0) - Number(summary?.cash_refunds_out || 0)) * 100) / 100;
