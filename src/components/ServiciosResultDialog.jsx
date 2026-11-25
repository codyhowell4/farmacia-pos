import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatMXN } from '@/lib/currency';
import { formatPhone } from '@/lib/rnpServices';

const BADGE = {
  aprobada: { label: 'APROBADA', cls: 'bg-emerald-50 text-emerald-700' },
  pendiente: { label: 'PENDIENTE', cls: 'bg-amber-50 text-amber-800' },
  rechazada: { label: 'RECHAZADA', cls: 'bg-red-50 text-red-700' },
  no_enviada: { label: 'NO ENVIADA', cls: 'bg-red-50 text-red-700' },
};

// "Enviando…" overlay while the RNP calls run, then the per-service result
// (aprobada / pendiente / rechazada) with the exact amount to return.
const ServiciosResultDialog = ({ sending, outcome, onClose, onPrint }) => {
  if (sending) {
    return (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent className="max-w-sm [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-apolo-navy">Enviando a Red Nacional de Pagos</DialogTitle>
            <p className="text-sm text-slate-500">No cierres esta ventana ni vuelvas a cobrar.</p>
          </DialogHeader>
          <div className="flex justify-center py-6"><Loader2 className="w-10 h-10 animate-spin text-apolo-navy" /></div>
        </DialogContent>
      </Dialog>
    );
  }
  if (!outcome) return null;

  const { outcomes = [], refund = 0, paymentMethod, saleRecorded, saleFailed, changeDue } = outcome;
  const anyPending = outcomes.some((o) => o.result.status === 'pendiente');
  const allOk = outcomes.every((o) => o.result.status === 'aprobada');

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-apolo-navy">
            {saleFailed ? 'La venta no se registró' : allOk ? 'Venta completada' : 'Resultado de servicios'}
          </DialogTitle>
          <p className="text-sm text-slate-500">
            {allOk && !saleFailed ? 'El proveedor confirmó cada servicio. El folio y la autorización van en el ticket.' : 'Revisa cada servicio antes de despedir al cliente.'}
          </p>
        </DialogHeader>

        {saleFailed && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Los servicios YA se enviaron a RNP pero la venta no se pudo guardar. No los vuelvas a enviar: al reintentar “Completar venta” el sistema reutiliza este mismo resultado.</span>
          </div>
        )}

        <div className="space-y-2">
          {outcomes.map((o) => {
            const b = BADGE[o.result.status] || BADGE.pendiente;
            const fee = Number(o.feeLine?.price || 0);
            return (
              <div key={o.line.id} className="rounded-lg border border-slate-200 p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${b.cls}`}>{b.label}</span>
                  <span className="font-bold">{formatMXN(o.charged ?? (Number(o.line.price) + fee))}</span>
                </div>
                <p className="font-medium">{o.line.name}</p>
                <p className="text-slate-500">{o.line.rnp.refLabel ? `Ref. ${o.line.rnp.phone}` : `Tel. ${formatPhone(o.line.rnp.phone)}`}</p>
                {(o.result.venta || o.result.autorizacion) && (
                  <p className="text-slate-600">Folio RNP {o.result.venta || '—'} · Aut. {o.result.autorizacion || '—'}</p>
                )}
                {o.result.codigo && <p className="font-mono font-bold">Código: {o.result.codigo}</p>}
                {o.result.status === 'pendiente' && (
                  <p className="text-amber-800">El proveedor no respondió. NO la vuelvas a enviar. El cobro se queda en la venta; administración la concilia en el portal de RNP.</p>
                )}
                {(o.result.status === 'rechazada' || o.result.status === 'no_enviada') && (
                  <p className="text-red-700">Motivo: {o.result.error || 'rechazada por el proveedor'}</p>
                )}
              </div>
            );
          })}
        </div>

        {refund > 0 && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 space-y-1">
            <p className="text-lg font-bold">Devuelve al cliente {formatMXN(refund)}</p>
            {paymentMethod === 'card' ? (
              <p className="text-sm">Pagó con tarjeta: haz la devolución de {formatMXN(refund)} en la terminal bancaria (no en efectivo). {saleRecorded ? 'La venta quedó registrada sin los servicios rechazados.' : 'No se registró ninguna venta.'}</p>
            ) : (
              <p className="text-sm">
                En efectivo.{saleRecorded && changeDue != null ? ` Cambio total a entregar: ${formatMXN(changeDue)} (incluye la devolución).` : ''}
                {saleRecorded ? ' La venta quedó registrada sin los servicios rechazados.' : ' No se registró ninguna venta.'}
              </p>
            )}
          </div>
        )}

        {anyPending && (
          <p className="text-xs text-slate-500">RNP no ofrece consulta de estatus: cada operación queda en la bitácora de servicios para conciliación.</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          {saleRecorded && (
            <Button className="bg-apolo-navy hover:bg-apolo-navy-dark text-white" onClick={onPrint}>Imprimir ticket</Button>
          )}
          <Button variant="outline" onClick={onClose}>{saleRecorded || !saleFailed ? 'Nueva venta' : 'Cerrar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ServiciosResultDialog;
