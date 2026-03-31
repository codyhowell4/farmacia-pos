import { formatMXN } from '@/lib/currency';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, DollarSign, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShift } from '@/contexts/ShiftContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';

const ShiftGate = ({ children }) => {
  const { activeShift, loading, openShift } = useShift();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [startingCash, setStartingCash] = useState('');
  const [opening, setOpening] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (activeShift) return children;

  const handleOpenShift = async (e) => {
    e.preventDefault();
    const cash = parseFloat(startingCash);
    if (isNaN(cash) || cash < 0) {
      toast({ title: 'Monto inválido', variant: 'destructive' });
      return;
    }
    setOpening(true);
    try {
      await openShift(cash);
      toast({ title: 'Turno abierto', description: `Starting cash: ${formatMXN(cash)}` });
    } catch (err) {
      toast({ title: 'Error al abrir turno', description: err.message, variant: 'destructive' });
    } finally {
      setOpening(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-slate-200"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-4 rounded-full">
            <Clock className="w-10 h-10 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-slate-900 mb-1">Abrir turno</h1>
        <p className="text-center text-slate-500 text-sm mb-8">
          Bienvenido, <strong>{user?.name}</strong>. Cuenta tu caja e ingresa el efectivo inicial para comenzar.
        </p>

        <form onSubmit={handleOpenShift} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="starting-cash">Efectivo inicial en caja (MXN)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                id="starting-cash"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={startingCash}
                onChange={e => setStartingCash(e.target.value)}
                className="pl-10 text-lg"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[100, 200, 300].map(v => (
              <Button key={v} type="button" variant="outline" onClick={() => setStartingCash(v.toString())}>
                ${v}
              </Button>
            ))}
          </div>

          <Button type="submit" disabled={opening} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-lg py-6">
            <Clock className="w-5 h-5 mr-2" />Open Shift
          </Button>
        </form>

        <div className="flex flex-col gap-2 mt-3">
          {user?.role === 'admin' && (
            <Button onClick={() => navigate('/admin')} variant="outline" className="w-full text-blue-600 border-blue-200 hover:bg-blue-50">
              ← Back to Admin
            </Button>
          )}
          <Button onClick={handleLogout} variant="ghost" className="w-full text-slate-500">
            <LogOut className="w-4 h-4 mr-2" />Logout
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default ShiftGate;
