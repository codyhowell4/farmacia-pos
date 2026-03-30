import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, CreditCard, Stethoscope, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useShift } from '@/contexts/ShiftContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { getSales } from '@/lib/db';

const CloseShiftModal = ({ open, onOpenChange }) => {
  const { activeShift, closeShift } = useShift();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState('count'); // 'count' | 'summary'
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState(null);
  const [shiftSales, setShiftSales] = useState({ cash: 0, card: 0, insurance: 0, total: 0, count: 0 });

  useEffect(() => {
    if (!activeShift || !open) return;
    getSales().then(allSales => {
      const sales = allSales.filter(s =>
        !s.voided &&
        s.location_id === activeShift.location_id &&
        new Date(s.timestamp) >= new Date(activeShift.opened_at)
      );
      const cash = sales.filter(s => s.payment_method === 'cash' || !s.payment_method).reduce((sum, s) => sum + s.total, 0);
      const card = sales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + s.total, 0);
      const insurance = sales.filter(s => s.payment_method === 'insurance').reduce((sum, s) => sum + s.total, 0);
      setShiftSales({ cash, card, insurance, total: cash + card + insurance, count: sales.length });
    }).catch(console.error);
  }, [activeShift, open]);

  const handlePreview = (e) => {
    e.preventDefault();
    const amount = parseFloat(closingCash);
    if (isNaN(amount) || amount < 0) { toast({ title: 'Invalid amount', variant: 'destructive' }); return; }
    const expected = activeShift.starting_cash + shiftSales.cash;
    setSummary({ closingCash: amount, expectedCash: expected, variance: amount - expected });
    setStep('summary');
  };

  const handleConfirmClose = async () => {
    const closed = await closeShift(closingCash, notes);
    toast({ title: 'Turno cerrado', description: `Variance: ${formatMXN(closed?.variance || 0)}` });
    logout();
    navigate('/login');
  };

  const handleCancel = () => { setStep('count'); setClosingCash(''); setNotes(''); setSummary(null); onOpenChange(false); };

  const duration = activeShift ? (() => {
    const ms = new Date() - new Date(activeShift.opened_at);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  })() : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            Cerrar turno
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

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                <DollarSign className="w-4 h-4 text-green-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Ventas en efectivo</p>
                <p className="font-bold text-green-700">${shiftSales.cash.toFixed(2)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                <CreditCard className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Ventas con tarjeta</p>
                <p className="font-bold text-blue-700">${shiftSales.card.toFixed(2)}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                <Stethoscope className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Seguro</p>
                <p className="font-bold text-purple-700">${shiftSales.insurance.toFixed(2)}</p>
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
                <div className="flex justify-between"><span className="text-slate-500">Ingresos totales</span><span className="font-medium">${shiftSales.total.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Efectivo inicial</span><span className="font-medium">${activeShift?.starting_cash.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Ventas en efectivo</span><span className="font-medium">+ ${shiftSales.cash.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-2"><span>Esperado en caja</span><span>${summary.expectedCash.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Efectivo contado</span><span className="font-medium">${summary.closingCash.toFixed(2)}</span></div>
              </div>

              <div className={`rounded-lg p-4 flex items-center gap-3 ${Math.abs(summary.variance) < 0.01 ? 'bg-green-50 border border-green-200' : summary.variance < 0 ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                {Math.abs(summary.variance) < 0.01
                  ? <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                  : <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" />
                }
                <div>
                  <p className="font-semibold">
                    {Math.abs(summary.variance) < 0.01 ? 'Caja cuadrada' : `Variance: ${summary.variance > 0 ? '+' : ''}${formatMXN(summary.variance)}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {Math.abs(summary.variance) < 0.01 ? 'Efectivo contado matches expected.' : summary.variance < 0 ? 'La caja tiene faltante.' : 'La caja tiene sobrante.'}
                  </p>
                </div>
              </div>

              {notes && <p className="text-sm text-slate-500 italic">Nota: {notes}</p>}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep('count')}>Atrás</Button>
              <Button onClick={handleConfirmClose} className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
                Confirm & Cerrar turno
              </Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CloseShiftModal;
