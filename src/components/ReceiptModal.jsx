import React, { useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import { formatMXN } from '@/lib/currency';
import { useToast } from '@/components/ui/use-toast';

const PAYMENT_LABELS = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transferencia: 'Transferencia',
  insurance: 'Seguro',
};

// Shared receipt markup — used in the on-screen dialog and the hidden 58mm print area.
const ReceiptContent = ({ sale }) => {
  const paymentMethod = sale.payment_method || sale.paymentMethod || sale.payments?.[0]?.payment_method || 'cash';
  const paymentLabel = PAYMENT_LABELS[paymentMethod] || paymentMethod;

  const subtotalBeforeDiscount = (sale.items || []).reduce((s, i) => s + (i.originalPrice || i.price) * i.quantity, 0);
  const discountAmt = sale.discount?.amount || 0;
  const ivaAmt = sale.iva?.amount || 0;

  return (
    <div className="font-mono text-xs space-y-2 bg-white p-4 text-black">
      <div className="text-center space-y-0.5">
        <p className="font-bold text-base">FARMACIA</p>
        <p className="text-slate-600">{sale.pharmacyLocation}</p>
        <p className="text-slate-500">{new Date(sale.timestamp).toLocaleString('es-MX')}</p>
      </div>

      <div className="border-t border-dashed border-slate-300 pt-2 space-y-0.5">
        <p>Folio: <span className="font-bold">#{sale.id.slice(-8).toUpperCase()}</span></p>
        <p>Cajero: {sale.salesperson_name || sale.salesperson || 'N/A'}</p>
        {(sale.customer_name || sale.patient_name) && <p>Cliente: {sale.customer_name || sale.patient_name}</p>}
        {(sale.customer_curp || sale.patient_curp) && <p>CURP: {sale.customer_curp || sale.patient_curp}</p>}
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
                <span>{PAYMENT_LABELS[payment.payment_method] || payment.payment_method}</span>
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
  );
};

const ReceiptModal = ({ open, onOpenChange, sale, autoPrint = false }) => {
  const { toast } = useToast();
  const hasAutoPrinted = useRef(false);

  // Print via window.print() against the hidden #receipt-print-area.
  // This works when fired programmatically (unlike window.open popups).
  const handlePrint = useCallback(() => {
    document.body.classList.add('receipt-print-mode');
    const cleanup = () => document.body.classList.remove('receipt-print-mode');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    // Fallback cleanup in case afterprint doesn't fire (e.g. some browsers on cancel)
    setTimeout(cleanup, 1000);
  }, []);

  // Auto-print when the modal opens after a completed sale
  useEffect(() => {
    if (open && autoPrint && sale && !hasAutoPrinted.current) {
      hasAutoPrinted.current = true;
      // Small delay to ensure the print area is rendered before printing
      const timer = setTimeout(handlePrint, 400);
      return () => clearTimeout(timer);
    }
    // Reset flag when modal closes
    if (!open) {
      hasAutoPrinted.current = false;
    }
  }, [open, autoPrint, sale, handlePrint]);

  // Guard: Don't render if no sale data (after all hooks to keep hook order stable)
  if (!sale) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-4 h-4" />Recibo de venta
            </DialogTitle>
          </DialogHeader>

          <div className="border border-dashed border-slate-300 rounded">
            <ReceiptContent sale={sale} />
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

      {/* Hidden print-only receipt area (58mm thermal). Visible only in print via index.css */}
      <div id="receipt-print-area" className="hidden print:block" aria-hidden="true">
        <ReceiptContent sale={sale} />
      </div>
    </>
  );
};

export default ReceiptModal;
