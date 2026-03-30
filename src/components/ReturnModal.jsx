import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RotateCcw, Search, AlertTriangle } from 'lucide-react';
import { formatMXN } from '@/lib/currency';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { getSales, getReturnsBySaleId, createReturn } from '@/lib/db';

const ReturnModal = ({ open, onOpenChange, onReturnComplete }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchId, setSearchId] = useState('');
  const [foundSale, setFoundSale] = useState(null);
  const [returnQtys, setReturnQtys] = useState({});
  const [step, setStep] = useState('search'); // 'search' | 'select' | 'confirm'
  const [notFound, setNotFound] = useState(false);

  const handleSearch = async () => {
    try {
      const allSales = await getSales();
      const sale = allSales.find(s =>
        s.id === searchId.trim() ||
        s.id.slice(-8).toUpperCase() === searchId.trim().toUpperCase()
      );
      if (!sale || sale.voided) { setNotFound(true); setFoundSale(null); return; }
      setNotFound(false);
      setFoundSale(sale);
      const qtys = {};
      (sale.sale_items || []).forEach(item => { qtys[item.id] = 0; });
      setReturnQtys(qtys);
      setStep('select');
    } catch (e) {
      setNotFound(true);
      setFoundSale(null);
    }
  };

  const returnableItems = (foundSale?.sale_items || []).filter(item => {
    // Already-returned qty tracked via returnQtys max; full check happens on confirm
    return item.quantity > 0;
  });

  const getAlreadyReturned = async (saleId, itemId) => {
    const returns = await getReturnsBySaleId(saleId);
    return returns
      .flatMap(r => r.return_items || [])
      .filter(i => i.inventory_id === itemId)
      .reduce((sum, i) => sum + i.quantity, 0);
  };

  const refundTotal = (foundSale?.sale_items || []).reduce((sum, item) => {
    const qty = returnQtys[item.id] || 0;
    return sum + item.price * qty;
  }, 0);

  const hasSelection = Object.values(returnQtys).some(q => q > 0);

  const handleConfirmReturn = async () => {
    if (!hasSelection) { toast({ title: 'Selecciona al menos un artículo', variant: 'destructive' }); return; }

    const returnItems = (foundSale.sale_items || [])
      .filter(item => returnQtys[item.id] > 0)
      .map(item => ({
        inventory_id: item.inventory_id,
        name: item.name,
        quantity: returnQtys[item.id],
        price: item.price,
        returnQty: returnQtys[item.id],
      }));

    try {
      const returnRecord = {
        original_sale_id: foundSale.id,
        refund_total: refundTotal,
        processed_by: user.name,
        location_id: user.locationId,
        timestamp: new Date().toISOString(),
      };
      await createReturn(returnRecord, returnItems);

      logAudit({
        action: AUDIT_ACTIONS.RETURN_PROCESSED,
        user,
        details: `Devolución de venta #${foundSale.id.slice(-8).toUpperCase()} | Reembolso: ${formatMXN(refundTotal)}`,
      });

      toast({ title: 'Devolución procesada', description: `Reembolso: ${formatMXN(refundTotal)}` });
      onReturnComplete?.();
      handleClose();
    } catch (err) {
      toast({ title: 'Error al procesar devolución', description: err.message, variant: 'destructive' });
    }
  };

  const handleClose = () => {
    setSearchId(''); setFoundSale(null); setReturnQtys({});
    setStep('search'); setNotFound(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-orange-500" />Devolución / Reembolso
          </DialogTitle>
        </DialogHeader>

        {step === 'search' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Ingresa el folio o ID de la venta original.</p>
            <div className="space-y-2">
              <Label>Folio de venta</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Ej. A1B2C3D4 o ID completo"
                  value={searchId}
                  onChange={e => { setSearchId(e.target.value); setNotFound(false); }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  autoFocus
                />
                <Button onClick={handleSearch}><Search className="w-4 h-4" /></Button>
              </div>
              {notFound && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />Venta no encontrada o ya fue anulada.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'select' && foundSale && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Folio</span><span className="font-medium">#{foundSale.id.slice(-8).toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Fecha</span><span>{new Date(foundSale.timestamp).toLocaleString('es-MX')}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total original</span><span className="font-bold">{formatMXN(foundSale.total)}</span></div>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              <Label>Artículos a devolver</Label>
              {returnableItems.map(item => {
                const maxReturn = item.quantity;
                return (
                  <div key={item.id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-slate-500">{formatMXN(item.price)} × {item.quantity} vendidos</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        onClick={() => setReturnQtys(p => ({ ...p, [item.id]: Math.max(0, (p[item.id] || 0) - 1) }))}
                        className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-sm font-bold"
                      >-</button>
                      <span className="w-6 text-center text-sm font-semibold">{returnQtys[item.id] || 0}</span>
                      <button
                        onClick={() => setReturnQtys(p => ({ ...p, [item.id]: Math.min(maxReturn, (p[item.id] || 0) + 1) }))}
                        className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-sm font-bold"
                      >+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasSelection && (
              <div className="bg-green-50 rounded-lg p-3 flex justify-between items-center border border-green-200">
                <span className="text-sm font-medium text-green-800">Reembolso a devolver</span>
                <span className="font-bold text-green-700 text-lg">{formatMXN(refundTotal)}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('search')}>Atrás</Button>
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600"
                disabled={!hasSelection}
                onClick={handleConfirmReturn}
              >
                <RotateCcw className="w-4 h-4 mr-2" />Confirmar devolución
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReturnModal;
