import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  Smartphone, AlertTriangle, CheckCircle, XCircle, RefreshCw, Wallet, Clock, Undo2, Loader2, History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/currency';
import { RNP_CATEGORIES, RNP_LOW_BALANCE_DEFAULT, isRnpBalanceLow, formatPhone } from '@/lib/rnpServices';
import {
  listRnpPending, listRnpRefundsDue, listRnpResolved, getSaleFoliosByIds, getSaleIdsByRnpOps,
  resolveRnpPending, markRnpRefunded, listOpenShiftsForRefund, getRnpBalance, setRnpLowBalanceThreshold,
  getLocations,
} from '@/lib/db';

// Admin › Servicios RNP (2026-11-24)
// RNP has no status-check method: an operation that timed out stays
// PENDIENTE until an admin checks the RNP portal (Reportes) and marks it
// Aprobada (with the folio/autorización) or Fallida (customer gets amount +
// comisión back). Balances shown are the last known ones (obtenerSaldo when
// a cashier opens Servicios, or NuevoSaldo after each sale) — this page
// never calls RNP.

const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const catLabel = (c) => RNP_CATEGORIES[c]?.label || c || '—';
const refText = (op) => (op.category === 'servicio' || !/^\d{10}$/.test(op.phone || '') ? op.phone : formatPhone(op.phone));

const AdminRnpServicios = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [sales, setSales] = useState({});
  const [locations, setLocations] = useState({});
  const [balance, setBalance] = useState(null);
  const [thresholdInput, setThresholdInput] = useState('');
  const [savingThreshold, setSavingThreshold] = useState(false);

  const [resolving, setResolving] = useState(null); // { op, mode: 'aprobada'|'fallida' }
  const [folio, setFolio] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [refunding, setRefunding] = useState(null); // op
  const [openShifts, setOpenShifts] = useState([]);
  const [refundShiftId, setRefundShiftId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [p, r, done, bal, locs] = await Promise.all([
        listRnpPending(), listRnpRefundsDue(), listRnpResolved(30), getRnpBalance(), getLocations().catch(() => []),
      ]);
      // Ops whose sale wasn't linked yet: find the sale through sale_items.
      const unlinked = [...p, ...r, ...done].filter((o) => !o.sale_id && o.op_id).map((o) => o.op_id);
      const byOp = unlinked.length ? await getSaleIdsByRnpOps(unlinked) : {};
      const withSale = (list) => list.map((o) => ({ ...o, sale_id: o.sale_id || byOp[o.op_id] || null }));
      const P = withSale(p); const R = withSale(r); const D = withSale(done);
      setPending(P); setRefunds(R); setResolved(D);
      setSales(await getSaleFoliosByIds([...P, ...R, ...D].map((o) => o.sale_id)));
      setBalance(bal);
      setThresholdInput(String(bal?.low_balance_threshold ?? RNP_LOW_BALANCE_DEFAULT));
      setLocations(Object.fromEntries((locs || []).map((l) => [l.id, l.name])));
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar los servicios RNP', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const threshold = Number(balance?.low_balance_threshold ?? RNP_LOW_BALANCE_DEFAULT);
  const lowRecargas = isRnpBalanceLow(balance?.saldo_recargas, threshold);
  const lowServicios = isRnpBalanceLow(balance?.saldo_servicios, threshold);
  const pendingTotal = useMemo(() => pending.reduce((s, o) => s + Number(o.amount || 0) + Number(o.fee || 0), 0), [pending]);
  const refundsTotal = useMemo(() => refunds.reduce((s, o) => s + Number(o.refund_amount || 0), 0), [refunds]);

  const ticket = (op) => (op.sale_id ? sales[op.sale_id]?.folio || `#${op.sale_id.slice(-8).toUpperCase()}` : 'Sin ticket');

  const startResolve = (op, mode) => { setResolving({ op, mode }); setFolio(''); setNote(''); };

  const submitResolve = async () => {
    if (!resolving) return;
    if (resolving.mode === 'aprobada' && !folio.trim()) return;
    setBusy(true);
    try {
      const res = await resolveRnpPending(resolving.op.id, resolving.mode, { autorizacion: folio.trim() || null, note: note.trim() || null });
      toast({
        title: resolving.mode === 'aprobada' ? 'Operación marcada como aprobada' : 'Operación marcada como fallida',
        description: resolving.mode === 'fallida'
          ? `Devolver ${formatMXN(res?.refund_amount || 0)} al cliente. Queda en "Devoluciones por entregar".`
          : `Folio ${folio.trim()}`,
      });
      setResolving(null);
      await load();
    } catch (e) {
      toast({ title: 'No se pudo resolver', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const startRefund = async (op) => {
    setRefunding(op);
    setRefundShiftId('');
    if (op.refund_method === 'efectivo') {
      try {
        const shifts = await listOpenShiftsForRefund();
        setOpenShifts(shifts);
        const sameLoc = shifts.filter((s) => s.location_id === op.location_id);
        if (sameLoc.length === 1) setRefundShiftId(sameLoc[0].id);
        else if (shifts.length === 1) setRefundShiftId(shifts[0].id);
      } catch (e) {
        setOpenShifts([]);
      }
    }
  };

  const submitRefund = async () => {
    if (!refunding) return;
    if (refunding.refund_method === 'efectivo' && !refundShiftId) return;
    setBusy(true);
    try {
      await markRnpRefunded(refunding.id, refunding.refund_method === 'efectivo' ? refundShiftId : null);
      toast({ title: 'Devolución registrada', description: `${formatMXN(refunding.refund_amount)} entregados al cliente.` });
      setRefunding(null);
      await load();
    } catch (e) {
      toast({ title: 'No se pudo registrar', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const saveThreshold = async () => {
    const n = Number(thresholdInput);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      toast({ title: 'Umbral inválido', description: 'Usa un monto entre 0 y 100,000', variant: 'destructive' });
      return;
    }
    setSavingThreshold(true);
    try {
      await setRnpLowBalanceThreshold(n);
      setBalance((b) => ({ ...(b || {}), low_balance_threshold: n }));
      toast({ title: 'Umbral guardado', description: `Alerta cuando un saldo sea menor a ${formatMXN(n)}` });
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' });
    } finally {
      setSavingThreshold(false);
    }
  };

  const BalanceCard = ({ label, value, at, source, low }) => (
    <div className={`rounded-xl p-4 border ${low ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${low ? 'text-amber-700' : 'text-slate-900'}`}>{value != null ? formatMXN(value) : '—'}</p>
      <p className="text-[11px] text-slate-500 mt-1">
        {at ? `${fmtDateTime(at)} · ${source === 'NuevoSaldo' ? 'tras una venta' : 'consulta de saldo'}` : 'Sin datos aún'}
      </p>
      {low && <p className="text-xs font-semibold text-amber-700 mt-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Saldo bajo</p>}
    </div>
  );

  return (
    <>
      <Helmet><title>Servicios RNP - Admin</title></Helmet>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Smartphone className="w-6 h-6 text-apolo-navy" /> Servicios RNP</h2>
            <p className="text-slate-600 text-sm">Recargas, pagos de servicios y tarjetas de regalo: pendientes, devoluciones y saldos.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>

        {/* Saldos */}
        <section className="bg-white rounded-xl shadow p-5 space-y-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Wallet className="w-5 h-5 text-apolo-navy" /> Saldos RNP</h3>
          {(lowRecargas || lowServicios) && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Saldo bajo ({[lowRecargas && 'recargas', lowServicios && 'servicios'].filter(Boolean).join(' y ')}): menos de {formatMXN(threshold)}.
                Abona saldo en el portal de RNP; las operaciones mayores al saldo serán rechazadas.
              </span>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <BalanceCard label="Saldo recargas y paquetes" value={balance?.saldo_recargas} at={balance?.recargas_at} source={balance?.recargas_source} low={lowRecargas} />
            <BalanceCard label="Saldo servicios y tarjetas de regalo" value={balance?.saldo_servicios} at={balance?.servicios_at} source={balance?.servicios_source} low={lowServicios} />
          </div>
          <p className="text-xs text-slate-500">
            Último saldo conocido: se actualiza cuando un cajero abre Servicios en el POS y con el saldo que RNP devuelve tras cada venta. Esta pantalla no consulta a RNP (cada consulta puede tener costo).
          </p>
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-slate-100">
            <div>
              <Label className="mb-1 block text-xs">Alertar cuando un saldo sea menor a (MXN)</Label>
              <Input type="number" min="0" max="100000" step="1" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" onClick={saveThreshold} disabled={savingThreshold || Number(thresholdInput) === threshold}>
              {savingThreshold ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar umbral'}
            </Button>
          </div>
        </section>

        {/* Pendientes */}
        <section className="bg-white rounded-xl shadow p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" /> Operaciones pendientes
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pending.length ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>{pending.length}</span>
            </h3>
            {pending.length > 0 && <span className="text-sm text-slate-600">Total en duda: <b>{formatMXN(pendingTotal)}</b></span>}
          </div>
          <p className="text-xs text-slate-500">
            RNP no confirmó estas operaciones (sin respuesta o tiempo agotado). No las reenvíes: búscalas en el portal RNP › Reportes y márcalas Aprobada (con el folio/autorización) o Fallida (se devuelve monto + comisión al cliente).
          </p>
          {loading ? (
            <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-slate-500 flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> No hay operaciones pendientes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Cajero</th><th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Compañía / producto</th><th className="py-2 pr-3">Teléfono / referencia</th>
                    <th className="py-2 pr-3 text-right">Monto</th><th className="py-2 pr-3 text-right">Comisión</th>
                    <th className="py-2 pr-3">Ticket</th><th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {pending.map((op) => (
                    <tr key={op.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDateTime(op.created_at)}</td>
                      <td className="py-2 pr-3">{op.created_by_name || '—'}</td>
                      <td className="py-2 pr-3">{catLabel(op.category)}{op.status === 'enviando' && <span className="block text-[11px] text-slate-500">(se cortó al enviar)</span>}</td>
                      <td className="py-2 pr-3">{op.product_name || op.carrier}</td>
                      <td className="py-2 pr-3 font-mono">{refText(op)}</td>
                      <td className="py-2 pr-3 text-right">{formatMXN(op.amount)}</td>
                      <td className="py-2 pr-3 text-right">{formatMXN(op.fee || 0)}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{ticket(op)}</td>
                      <td className="py-2 whitespace-nowrap">
                        <div className="flex gap-1.5 justify-end">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => startResolve(op, 'aprobada')}>Aprobada</Button>
                          <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => startResolve(op, 'fallida')}>Fallida</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Devoluciones por entregar */}
        <section className="bg-white rounded-xl shadow p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-red-600" /> Devoluciones por entregar
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${refunds.length ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{refunds.length}</span>
            </h3>
            {refunds.length > 0 && <span className="text-sm text-slate-600">Total a devolver: <b>{formatMXN(refundsTotal)}</b></span>}
          </div>
          {!loading && refunds.length === 0 ? (
            <p className="text-sm text-slate-500">No hay devoluciones pendientes.</p>
          ) : (
            <div className="space-y-2">
              {refunds.map((op) => (
                <div key={op.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-red-100 bg-red-50/40 text-sm">
                  <div>
                    <p className="font-medium">{catLabel(op.category)} · {op.product_name || op.carrier} · <span className="font-mono">{refText(op)}</span></p>
                    <p className="text-xs text-slate-600">
                      Vendida {fmtDateTime(op.created_at)} por {op.created_by_name || '—'} · Ticket {ticket(op)} · Fallida el {fmtDateTime(op.resolved_at)} por {op.resolved_by_name || '—'}
                      {op.resolution_note ? ` · "${op.resolution_note}"` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-red-700">{formatMXN(op.refund_amount)}</span>
                    <span className="text-xs text-slate-600">{op.refund_method === 'tarjeta' ? 'Reverso en terminal' : 'Efectivo'}</span>
                    <Button size="sm" variant="outline" onClick={() => startRefund(op)}>Registrar devolución</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Historial de resoluciones */}
        <section className="bg-white rounded-xl shadow p-5 space-y-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><History className="w-5 h-5 text-slate-600" /> Resueltas recientemente</h3>
          {!loading && resolved.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay operaciones resueltas manualmente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="py-2 pr-3">Venta</th><th className="py-2 pr-3">Operación</th><th className="py-2 pr-3">Resultado</th>
                    <th className="py-2 pr-3">Resuelta por</th><th className="py-2">Devolución</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((op) => (
                    <tr key={op.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDateTime(op.created_at)}<span className="block text-xs text-slate-500">{op.created_by_name} · {ticket(op)}</span></td>
                      <td className="py-2 pr-3">{catLabel(op.category)} · {op.product_name || op.carrier}<span className="block text-xs font-mono text-slate-500">{refText(op)} · {formatMXN(op.amount)} + {formatMXN(op.fee || 0)}</span></td>
                      <td className="py-2 pr-3">
                        {op.resolution === 'aprobada'
                          ? <span className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle className="w-4 h-4" /> Aprobada<span className="font-mono text-xs text-slate-600">· {op.autorizacion}</span></span>
                          : <span className="inline-flex items-center gap-1 text-red-700 font-medium"><XCircle className="w-4 h-4" /> Fallida</span>}
                        {op.resolution_note && <span className="block text-xs text-slate-500">"{op.resolution_note}"</span>}
                      </td>
                      <td className="py-2 pr-3">{op.resolved_by_name || '—'}<span className="block text-xs text-slate-500">{fmtDateTime(op.resolved_at)}</span></td>
                      <td className="py-2">
                        {op.resolution !== 'fallida' ? '—'
                          : op.refund_status === 'devuelto'
                            ? <span>{formatMXN(op.refund_amount)} entregada ({op.refund_method})<span className="block text-xs text-slate-500">{op.refunded_by_name} · {fmtDateTime(op.refunded_at)}</span></span>
                            : <span className="text-red-700 font-medium">{formatMXN(op.refund_amount)} por entregar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Resolve dialog */}
      <Dialog open={!!resolving} onOpenChange={(o) => { if (!o && !busy) setResolving(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{resolving?.mode === 'aprobada' ? 'Marcar como aprobada' : 'Marcar como fallida'}</DialogTitle>
          </DialogHeader>
          {resolving && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                <p><b>{catLabel(resolving.op.category)}</b> · {resolving.op.product_name || resolving.op.carrier}</p>
                <p className="font-mono">{refText(resolving.op)}</p>
                <p>{formatMXN(resolving.op.amount)} + comisión {formatMXN(resolving.op.fee || 0)} · {fmtDateTime(resolving.op.created_at)} · {resolving.op.created_by_name}</p>
                <p className="text-xs text-slate-500">Ticket {ticket(resolving.op)}</p>
              </div>
              {resolving.mode === 'aprobada' ? (
                <div>
                  <Label className="mb-1 block">Folio / autorización (portal RNP › Reportes)</Label>
                  <Input value={folio} maxLength={60} onChange={(e) => setFolio(e.target.value)} autoFocus />
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Confirma en el portal RNP que la operación NO se aplicó. Se devolverán <b>{formatMXN(Number(resolving.op.amount || 0) + Number(resolving.op.fee || 0))}</b> al cliente
                    y la línea sale de los ingresos de la venta. No se puede deshacer.
                  </span>
                </div>
              )}
              <div>
                <Label className="mb-1 block">Nota (opcional)</Label>
                <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ej. revisado en Reportes RNP" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setResolving(null)} disabled={busy}>Cancelar</Button>
                <Button
                  onClick={submitResolve}
                  disabled={busy || (resolving.mode === 'aprobada' && !folio.trim())}
                  className={resolving.mode === 'aprobada' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : resolving.mode === 'aprobada' ? 'Marcar aprobada' : 'Marcar fallida'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      <Dialog open={!!refunding} onOpenChange={(o) => { if (!o && !busy) setRefunding(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar devolución entregada</DialogTitle></DialogHeader>
          {refunding && (
            <div className="space-y-4 text-sm">
              <p>
                Entregar <b>{formatMXN(refunding.refund_amount)}</b> al cliente ({refunding.product_name || refunding.carrier}, <span className="font-mono">{refText(refunding)}</span>).
              </p>
              {refunding.refund_method === 'tarjeta' ? (
                <p className="p-3 rounded-lg bg-slate-50">Venta cobrada con tarjeta: haz el reverso en la terminal bancaria. No mueve efectivo de ninguna caja.</p>
              ) : (
                <div>
                  <Label className="mb-1 block">¿De qué caja (turno abierto) sale el efectivo?</Label>
                  {openShifts.length === 0 ? (
                    <p className="text-red-700">No hay turnos abiertos. Abre un turno en el POS para entregar la devolución en efectivo.</p>
                  ) : (
                    <select className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white" value={refundShiftId} onChange={(e) => setRefundShiftId(e.target.value)}>
                      <option value="">Elige un turno…</option>
                      {openShifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.opened_by_name || 'Turno'} · {locations[s.location_id] || 'Sucursal'} · desde {fmtDateTime(s.opened_at)}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="mt-1 text-xs text-slate-500">El corte de ese turno descontará esta devolución del efectivo esperado.</p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRefunding(null)} disabled={busy}>Cancelar</Button>
                <Button onClick={submitRefund} disabled={busy || (refunding.refund_method === 'efectivo' && !refundShiftId)} className="bg-apolo-navy hover:bg-apolo-navy-dark text-white">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Devolución entregada'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminRnpServicios;
