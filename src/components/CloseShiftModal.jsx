import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, CreditCard, Stethoscope, AlertTriangle, CheckCircle, Clock, Printer, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useShift } from '@/contexts/ShiftContext';
import { useToast } from '@/components/ui/use-toast';
import { getSales, getInventory } from '@/lib/db';

const CloseShiftModal = ({ open, onOpenChange }) => {
  const { activeShift, closeShift } = useShift();
  const { toast } = useToast();
  const [step, setStep] = useState('count'); // 'count' | 'summary' | 'report'
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState(null);
  const [shiftSales, setShiftSales] = useState({ cash: 0, card: 0, insurance: 0, transferencia: 0, total: 0, count: 0, sales: [] });
  const [inventory, setInventory] = useState([]);
  const [closedShift, setClosedShift] = useState(null); // Snapshot after closing
  const reportRef = useRef(null);

  useEffect(() => {
    if (!activeShift || !open) return;
    
    // Load sales and inventory data
    Promise.all([getSales(), getInventory(activeShift.location_id)])
      .then(([allSales, inventoryData]) => {
        setInventory(inventoryData || []);
        
        const sales = allSales.filter(s =>
          !s.voided &&
          s.location_id === activeShift.location_id &&
          new Date(s.timestamp) >= new Date(activeShift.opened_at)
        );
        
        // Calculate sales by payment method (including split payments)
        let cash = 0, card = 0, insurance = 0, transferencia = 0;
        
        sales.forEach(sale => {
          if (!sale) return; // Skip null sales
          
          if (sale.is_split_payment && sale.sale_payments?.length > 0) {
            // Handle split payments
            sale.sale_payments.forEach(payment => {
              if (!payment) return; // Skip null payments
              const amount = payment.amount || 0;
              switch(payment.payment_method) {
                case 'cash': cash += amount; break;
                case 'card': card += amount; break;
                case 'insurance': insurance += amount; break;
                case 'transferencia': transferencia += amount; break;
              }
            });
          } else {
            // Handle single payment
            switch(sale.payment_method) {
              case 'cash': cash += sale.total; break;
              case 'card': card += sale.total; break;
              case 'insurance': insurance += sale.total; break;
              case 'transferencia': transferencia += sale.total; break;
              default: cash += sale.total; // Default to cash
            }
          }
        });
        
        setShiftSales({ 
          cash, 
          card, 
          insurance, 
          transferencia,
          total: cash + card + insurance + transferencia, 
          count: sales.length,
          sales: sales
        });
      }).catch(console.error);
  }, [activeShift, open]);

  const handlePreview = (e) => {
    e.preventDefault();
    const amount = parseFloat(closingCash);
    if (isNaN(amount) || amount < 0) { toast({ title: 'Cantidad inválida', variant: 'destructive' }); return; }
    const expected = activeShift.starting_cash + shiftSales.cash;
    setSummary({ closingCash: amount, expectedCash: expected, variance: amount - expected });
    setStep('summary');
  };

  const handleViewReport = () => {
    // Snapshot shift info and show the report BEFORE actually closing.
    // The shift remains active so ShiftGate does not redirect away while the report is visible.
    setClosedShift(activeShift ? { ...activeShift } : null);
    setStep('report');
  };

  const handleFinalClose = async () => {
    try {
      const closed = await closeShift(closingCash, notes);
      if (!closed) {
        toast({ title: 'Error al cerrar turno', variant: 'destructive' });
        return;
      }
      toast({ title: 'Turno cerrado', description: `Variación: ${formatMXN(closed?.variance || 0)}` });
      handleFinish(); // Reset and close; ShiftGate will redirect to open-shift screen
    } catch (err) {
      console.error(err);
      toast({ title: 'Error al cerrar turno', description: err?.message || 'Intenta de nuevo', variant: 'destructive' });
    }
  };

  const handleFinish = () => {
    // Reset and close
    setStep('count');
    setClosingCash('');
    setNotes('');
    setSummary(null);
    setClosedShift(null);
    onOpenChange(false);
  };

  const handleCancel = () => { 
    setStep('count'); 
    setClosingCash(''); 
    setNotes(''); 
    setSummary(null); 
    setClosedShift(null);
    onOpenChange(false); 
  };

  const handlePrintReport = () => {
    const content = reportRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=400,height=700');
    win.document.write(`
      <!DOCTYPE html><html><head><title>Reporte de Turno - ${reportShift?.opened_by_name}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 11px; width: 300px; margin: 0 auto; padding: 16px; color: #000; }
        h2 { text-align: center; font-size: 14px; margin: 0 0 4px; }
        h3 { text-align: center; font-size: 12px; margin: 8px 0 4px; border-top: 1px dashed #000; padding-top: 8px; }
        p { margin: 2px 0; }
        .center { text-align: center; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; }
        .bold { font-weight: bold; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; }
        .section { margin: 8px 0; }
        @media print { body { width: 100%; } }
      </style></head>
      <body>${content}</body></html>
    `);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); win.close(); }, 300);
  };

  const reportShift = closedShift || activeShift;
  const duration = reportShift ? (() => {
    const ms = new Date() - new Date(reportShift.opened_at);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  })() : '';

  // Calculate report data (always return an object so report renders even with 0 sales)
  const calculateReportData = () => {
    const deptSales = {};
    const typeSales = { product: 0, service: 0 };

    shiftSales.sales.forEach(sale => {
      (sale.sale_items || []).forEach(item => {
        const invItem = inventory.find(i => i.id === item.inventory_id);
        const dept = invItem?.department || 'Sin departamento';
        const itemType = invItem?.item_type || 'product';
        const itemTotal = (item.price || 0) * (item.quantity || 0);

        // By department
        if (!deptSales[dept]) {
          deptSales[dept] = { amount: 0, count: 0 };
        }
        deptSales[dept].amount += itemTotal;
        deptSales[dept].count += item.quantity || 0;

        // By type (product vs service)
        typeSales[itemType] += itemTotal;
      });
    });

    return { deptSales, typeSales };
  };

  const reportData = calculateReportData();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            {step === 'report' ? 'Reporte de Turno' : 'Cerrar turno'}
          </DialogTitle>
        </DialogHeader>

        {step === 'count' && (
          <div className="space-y-5">
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Abierto por</span><span className="font-medium">{activeShift?.opened_by_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Hora de apertura</span><span className="font-medium">{activeShift ? new Date(activeShift.opened_at).toLocaleTimeString() : ''}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Duración</span><span className="font-medium">{duration}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Efectivo inicial</span><span className="font-medium">${activeShift?.starting_cash.toFixed(2)}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                <DollarSign className="w-4 h-4 text-green-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Efectivo</p>
                <p className="font-bold text-green-700">{formatMXN(shiftSales.cash)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                <CreditCard className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Tarjeta</p>
                <p className="font-bold text-blue-700">{formatMXN(shiftSales.card)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center border border-orange-200">
                <Building2 className="w-4 h-4 text-orange-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Transferencia</p>
                <p className="font-bold text-orange-700">{formatMXN(shiftSales.transferencia)}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                <Stethoscope className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Seguro</p>
                <p className="font-bold text-purple-700">{formatMXN(shiftSales.insurance)}</p>
              </div>
            </div>

            <form onSubmit={handlePreview} className="space-y-4">
              <div className="space-y-2">
                <Label>Conteo de efectivo al cierre (MXN)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input type="number" step="0.01" min="0" placeholder="0.00" value={closingCash}
                    onChange={e => setClosingCash(e.target.value)} className="pl-10 text-lg" autoFocus required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Input placeholder="Discrepancias o notas..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={handleCancel}>Cancelar</Button>
                <Button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600">Ver resumen</Button>
              </div>
            </form>
          </div>
        )}

        {step === 'summary' && summary && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-900">Resumen del turno</h3>

              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Total de transacciones</span><span className="font-medium">{shiftSales.count}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Ingresos totales</span><span className="font-medium">{formatMXN(shiftSales.total)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Efectivo inicial</span><span className="font-medium">{formatMXN(activeShift?.starting_cash)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Ventas en efectivo</span><span className="font-medium">+ {formatMXN(shiftSales.cash)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-2"><span>Esperado en caja</span><span>{formatMXN(summary.expectedCash)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Efectivo contado</span><span className="font-medium">{formatMXN(summary.closingCash)}</span></div>
              </div>

              <div className={`rounded-lg p-4 flex items-center gap-3 ${Math.abs(summary.variance) < 0.01 ? 'bg-green-50 border border-green-200' : summary.variance < 0 ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                {Math.abs(summary.variance) < 0.01
                  ? <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                  : <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" />
                }
                <div>
                  <p className="font-semibold">
                    {Math.abs(summary.variance) < 0.01 ? 'Caja cuadrada' : `Variación: ${summary.variance > 0 ? '+' : ''}${formatMXN(summary.variance)}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {Math.abs(summary.variance) < 0.01 ? 'El efectivo contado coincide con el esperado.' : summary.variance < 0 ? 'La caja tiene faltante.' : 'La caja tiene sobrante.'}
                  </p>
                </div>
              </div>

              {notes && <p className="text-sm text-slate-500 italic">Nota: {notes}</p>}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep('count')}>Atrás</Button>
              <Button onClick={handleViewReport} className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
                Ver reporte
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'report' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Receipt-style Report */}
            <div ref={reportRef} className="font-mono text-xs bg-white p-4 border border-dashed border-slate-300 rounded space-y-3">
              {/* Header */}
              <div className="text-center space-y-1">
                <p className="font-bold text-sm">REPORTE DE TURNO</p>
                <p className="text-slate-600">{new Date().toLocaleDateString('es-MX')}</p>
                <div className="divider"></div>
                <div className="row">
                  <span>Cajero:</span>
                  <span className="font-bold">{reportShift?.opened_by_name}</span>
                </div>
                <div className="row">
                  <span>Apertura:</span>
                  <span>{reportShift ? new Date(reportShift.opened_at).toLocaleString('es-MX') : ''}</span>
                </div>
                <div className="row">
                  <span>Cierre:</span>
                  <span>{new Date().toLocaleString('es-MX')}</span>
                </div>
                <div className="row">
                  <span>Duración:</span>
                  <span>{duration}</span>
                </div>
              </div>

              {/* Totals */}
              <div className="section">
                <div className="divider"></div>
                <div className="row bold">
                  <span>Total Ventas:</span>
                  <span>{shiftSales.count}</span>
                </div>
                <div className="row bold">
                  <span>Monto Total:</span>
                  <span>{formatMXN(shiftSales.total)}</span>
                </div>
              </div>

              {/* Sales by Payment Type */}
              <div className="section">
                <h3>VENTAS POR TIPO DE PAGO</h3>
                <div className="row">
                  <span>Efectivo:</span>
                  <span>{formatMXN(shiftSales.cash)}</span>
                </div>
                <div className="row">
                  <span>Tarjeta:</span>
                  <span>{formatMXN(shiftSales.card)}</span>
                </div>
                <div className="row">
                  <span>Transferencia:</span>
                  <span>{formatMXN(shiftSales.transferencia)}</span>
                </div>
                <div className="row">
                  <span>Seguro:</span>
                  <span>{formatMXN(shiftSales.insurance)}</span>
                </div>
              </div>

              {/* Sales by Department */}
              <div className="section">
                <h3>VENTAS POR DEPARTAMENTO</h3>
                {Object.entries(reportData.deptSales)
                  .sort((a, b) => b[1].amount - a[1].amount)
                  .map(([dept, data]) => (
                    <div key={dept} className="row">
                      <span>{dept} ({data.count}):</span>
                      <span>{formatMXN(data.amount)}</span>
                    </div>
                  ))}
              </div>

              {/* Sales by Type (Product vs Service) */}
              <div className="section">
                <h3>PRODUCTOS VS SERVICIOS</h3>
                <div className="row">
                  <span>Productos:</span>
                  <span>{formatMXN(reportData.typeSales.product)}</span>
                </div>
                <div className="row">
                  <span>Servicios:</span>
                  <span>{formatMXN(reportData.typeSales.service)}</span>
                </div>
              </div>

              {/* Cash Summary */}
              <div className="section">
                <h3>RESUMEN DE CAJA</h3>
                <div className="row">
                  <span>Efectivo inicial:</span>
                  <span>{formatMXN(reportShift?.starting_cash)}</span>
                </div>
                <div className="row">
                  <span>Ventas en efectivo:</span>
                  <span>+ {formatMXN(shiftSales.cash)}</span>
                </div>
                <div className="row">
                  <span>Efectivo esperado:</span>
                  <span>{formatMXN(summary?.expectedCash)}</span>
                </div>
                <div className="row">
                  <span>Efectivo contado:</span>
                  <span>{formatMXN(summary?.closingCash)}</span>
                </div>
                <div className="row bold">
                  <span>Variación:</span>
                  <span className={summary?.variance >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {summary?.variance >= 0 ? '+' : ''}{formatMXN(summary?.variance)}
                  </span>
                </div>
              </div>

              {notes && (
                <div className="section">
                  <div className="divider"></div>
                  <p className="text-slate-500">Notas: {notes}</p>
                </div>
              )}

              <div className="text-center text-slate-500 pt-2">
                <p>*** Fin del reporte ***</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button onClick={handleFinalClose} className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
                Confirmar cierre
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handlePrintReport}>
                  <Printer className="w-4 h-4 mr-2" /> Imprimir
                </Button>
                <Button variant="ghost" className="flex-1" onClick={handleFinish}>
                  Cancelar
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CloseShiftModal;
