import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import { formatMXN } from '@/lib/currency';
import { useToast } from '@/components/ui/use-toast';

const ReceiptModal = ({ open, onOpenChange, sale }) => {
  const printRef = useRef(null);
  const { toast } = useToast();

  if (!sale) return null;

  const paymentMethod = sale.payment_method || sale.paymentMethod || sale.payments?.[0]?.payment_method || 'cash';
  const paymentLabels = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transferencia: 'Transferencia',
    insurance: 'Seguro',
  };
  const paymentLabel = paymentLabels[paymentMethod] || paymentMethod;

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=400,height=700');
    win.document.write(`
      <!DOCTYPE html><html><head><title>Recibo #${sale.id.slice(-8).toUpperCase()}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 16px; color: #000; }
        h2 { text-align: center; font-size: 16px; margin: 0 0 4px; }
        p { margin: 2px 0; }
        .center { text-align: center; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; }
        .bold { font-weight: bold; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
        @media print { body { width: 100%; } }
      </style></head>
      <body>${content}</body></html>
    `);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); win.close(); }, 300);
  };

  const subtotalBeforeDiscount = (sale.items || []).reduce((s, i) => s + (i.originalPrice || i.price) * i.quantity, 0);
  const discountAmt = sale.discount?.amount || 0;
  const subtotalAfterDiscount = subtotalBeforeDiscount - discountAmt;
  const ivaAmt = sale.iva?.amount || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-4 h-4" />Recibo de venta
          </DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="font-mono text-xs space-y-2 bg-white p-4 border border-dashed border-slate-300 rounded">
          <div className="text-center space-y-0.5">
            <p className="font-bold text-base">FARMACIA</p>
            <p className="text-slate-600">{sale.pharmacyLocation}</p>
            <p className="text-slate-500">{new Date(sale.timestamp).toLocaleString('es-MX')}</p>
          </div>

          <div className="border-t border-dashed border-slate-300 pt-2 space-y-0.5">
            <p>Folio: <span className="font-bold">#{sale.id.slice(-8).toUpperCase()}</span></p>
            <p>Cajero: {sale.salesperson}</p>
            {sale.patient && <p>Paciente: {sale.patient.name}</p>}
            {sale.patient?.curp && <p>CURP: {sale.patient.curp}</p>}
          </div>

          <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
            {(sale.items || []).map((item, i) => (
              <div key={i}>
                <div className="flex justify-between">
                  <span className="flex-1 truncate">{item.name}{item.requiresPrescription ? ' [Rx]' : ''}</span>
                  <span>{formatMXN(item.price * item.quantity)}</span>
                </div>
                <div className="flex justify-between text-slate-500 pl-2">
                  <span>{item.quantity} × {formatMXN(item.price)}</span>
                  {item.rxNumber && <span>Rx: {item.rxNumber}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-slate-300 pt-2 space-y-0.5">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatMXN(subtotalBeforeDiscount)}</span></div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Descuento {sale.discount?.code ? `(${sale.discount.code})` : ''}</span>
                <span>-{formatMXN(discountAmt)}</span>
              </div>
            )}
            {ivaAmt > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>IVA ({sale.iva?.rate}%)</span>
                <span>{formatMXN(ivaAmt)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm border-t border-dashed border-slate-300 pt-1 mt-1">
              <span>TOTAL</span><span>{formatMXN(sale.total)}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-300 pt-2 space-y-0.5">
            <div className="flex justify-between">
              <span>Forma de pago</span>
              <span>{sale.is_split_payment ? 'Pago dividido' : paymentLabel}</span>
            </div>
            {sale.is_split_payment && sale.payments?.length > 0 && (
              <div className="space-y-0.5 pt-1">
                {sale.payments.map((payment, index) => (
                  <div key={index} className="flex justify-between text-slate-600">
                    <span>{paymentLabels[payment.payment_method] || payment.payment_method}</span>
                    <span>{formatMXN(payment.amount || 0)}</span>
                  </div>
                ))}
              </div>
            )}
            {paymentMethod === 'cash' && sale.amountGiven != null && (
              <>
                <div className="flex justify-between"><span>Recibido</span><span>{formatMXN(sale.amountGiven)}</span></div>
                <div className="flex justify-between font-bold"><span>Cambio</span><span>{formatMXN(sale.changeDue || 0)}</span></div>
              </>
            )}
          </div>

          <div className="border-t border-dashed border-slate-300 pt-2 text-center text-slate-500 space-y-0.5">
            <p>¡Gracias por su compra!</p>
            <p className="text-xs">Conserve este recibo</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />Cerrar
          </Button>
          <Button variant="outline" className="flex-1" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />Imprimir
          </Button>
        </div>
        <Button 
          className="w-full mt-2" 
          variant="secondary"
          onClick={() => {
            // Open factura generation in new tab or show coming soon
            toast({ 
              title: 'Factura', 
              description: 'Generación de factura CFDI - Próximamente disponible',
            });
          }}
        >
          📄 Generar Factura (CFDI)
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptModal;
