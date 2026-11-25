import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, Loader2, CheckCircle2, PackageCheck } from 'lucide-react';
import { toast as sonner } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/currency';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { getActiveOnlineOrders, markOnlineOrderReady, completeOnlineOrderAtPos } from '@/lib/db';

// POS: alert + list of online store orders ("Apartar mi pedido" on
// apolofarmacia.com.mx/tienda and the customer app). Those orders are sales
// created by place_store_order with status 'processing' and no shift — the
// stock was already taken by the RPC, so collecting one here must NOT go
// through the cart (that would discount stock twice). Instead the cashier
// marks it ready and, when the customer pays at the counter, "Entregar y
// cobrar" attaches the sale to the current shift with the payment method so
// it counts in the shift close.
const POLL_MS = 45000;

const formatWhen = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
  });
};

const OnlineOrdersButton = ({ activeShift, user }) => {
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [payMethod, setPayMethod] = useState({});
  const knownIds = useRef(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const data = await getActiveOnlineOrders();
      setOrders(data);
      const ids = new Set(data.map((o) => o.id));
      if (knownIds.current) {
        const fresh = data.filter((o) => !knownIds.current.has(o.id));
        if (fresh.length) {
          sonner.info(fresh.length === 1 ? 'Nuevo pedido en línea' : `${fresh.length} pedidos en línea nuevos`, {
            description: 'Revisa "Pedidos en línea" para prepararlo.',
            duration: 15000,
          });
        }
      }
      knownIds.current = ids;
    } catch (e) {
      console.warn('[OnlineOrders] load failed:', e?.message || e);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const pending = orders.filter((o) => o.status === 'processing' || o.status === 'pending').length;

  const handleReady = async (order) => {
    setBusyId(order.id);
    try {
      await markOnlineOrderReady(order.id, order.status);
      toast({ title: 'Pedido listo', description: `#${order.id.slice(-6).toUpperCase()} marcado como listo para recoger.` });
      await load();
    } catch (e) {
      toast({ title: 'No se pudo actualizar', description: e.message, variant: 'destructive' });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (order) => {
    if (!activeShift?.id) {
      toast({ title: 'Abre un turno', description: 'Necesitas un turno abierto para cobrar.', variant: 'destructive' });
      return;
    }
    const method = payMethod[order.id] || 'cash';
    setBusyId(order.id);
    try {
      const done = await completeOnlineOrderAtPos(order.id, order.status, {
        shiftId: activeShift.id,
        paymentMethod: method,
        user,
      });
      logAudit({
        action: AUDIT_ACTIONS.SALE_COMPLETE,
        user,
        details: `Pedido en línea #${order.id.slice(-6).toUpperCase()} entregado y cobrado (${method === 'card' ? 'tarjeta' : 'efectivo'}) ${formatMXN(done?.total ?? order.total)}`,
      });
      toast({ title: 'Pedido entregado', description: `Cobrado ${formatMXN(done?.total ?? order.total)} en ${method === 'card' ? 'tarjeta' : 'efectivo'}.` });
      await load();
    } catch (e) {
      toast({ title: 'No se pudo cobrar', description: e.message, variant: 'destructive' });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className={`relative ${pending ? 'border-green-500 text-green-700 bg-green-50 hover:bg-green-100 animate-pulse' : 'text-apolo-navy border-apolo-navy/30 hover:bg-apolo-navy/5'}`}
        aria-label={`Pedidos en línea${orders.length ? `: ${orders.length} activos` : ''}`}
      >
        <Globe className="w-4 h-4 sm:mr-2" />
        <span className="hidden sm:inline">Pedidos en línea</span>
        {orders.length > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">
            {orders.length}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pedidos en línea</DialogTitle>
            <p className="text-sm text-slate-600">
              Apartados desde la tienda en línea. Recoger y pagar en sucursal. El inventario ya se descontó al apartar: no los pases por el carrito.
            </p>
          </DialogHeader>
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No hay pedidos en línea pendientes.</p>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-semibold">#{o.id.slice(-6).toUpperCase()} · {o.patient_name || 'Cliente'}</p>
                      <p className="text-xs text-slate-500">{formatWhen(o.timestamp)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatMXN(o.total)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${o.status === 'ready' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {o.status === 'ready' ? 'Listo para recoger' : 'Por preparar'}
                      </span>
                    </div>
                  </div>
                  <ul className="text-sm text-slate-700 border-t pt-2 space-y-0.5">
                    {(o.sale_items || []).map((it) => (
                      <li key={it.id} className="flex justify-between gap-2">
                        <span>{it.quantity} × {it.name}</span>
                        <span>{formatMXN((it.price || 0) * (it.quantity || 0))}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                    {o.status !== 'ready' && (
                      <Button size="sm" variant="outline" disabled={busyId === o.id} onClick={() => handleReady(o)}>
                        {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PackageCheck className="w-4 h-4 mr-1" />}
                        Marcar listo
                      </Button>
                    )}
                    <select
                      className="h-9 border rounded-md px-2 text-sm"
                      value={payMethod[o.id] || 'cash'}
                      onChange={(e) => setPayMethod((p) => ({ ...p, [o.id]: e.target.value }))}
                      aria-label="Método de pago"
                    >
                      <option value="cash">Efectivo</option>
                      <option value="card">Tarjeta</option>
                    </select>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={busyId === o.id} onClick={() => handleComplete(o)}>
                      {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                      Entregar y cobrar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">Para cancelar un pedido (regresa el inventario) usa Admin › Pedidos.</p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OnlineOrdersButton;
