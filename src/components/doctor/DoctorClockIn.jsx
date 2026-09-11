import { useState, useEffect, useCallback } from 'react';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveDoctorShift, clockInDoctor, clockOutDoctor } from '@/lib/db';
import { toast } from 'sonner';

/**
 * Doctor clock-in/clock-out toggle shown in the doctor portal header.
 * An open doctor_shifts row means the doctor is actually available —
 * queue citas are only claimed/started by clocked-in doctors, and the
 * customer app's wait time is computed from how many are on shift.
 */
const DoctorClockIn = () => {
  const { user } = useAuth();
  const [shift, setShift] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setShift(await getActiveDoctorShift(user.id));
    } catch (err) {
      console.error('getActiveDoctorShift failed:', err);
    } finally {
      setLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!loaded) return null;

  const handleClockIn = async () => {
    setBusy(true);
    try {
      const row = await clockInDoctor(user.id);
      setShift(row);
      toast.success('Turno iniciado — ya puedes tomar citas');
    } catch (err) {
      toast.error('No se pudo iniciar el turno');
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async () => {
    if (!shift?.id) return;
    if (!confirm('¿Terminar tu turno? Ya no aparecerás como disponible.')) return;
    setBusy(true);
    try {
      await clockOutDoctor(shift.id);
      setShift(null);
      toast.success('Turno terminado');
    } catch (err) {
      toast.error('No se pudo terminar el turno');
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const clockInTime = shift?.clock_in_at
    ? new Date(shift.clock_in_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : null;

  return shift ? (
    <Button
      onClick={handleClockOut}
      disabled={busy}
      variant="outline"
      className="flex items-center gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
      title="Terminar turno"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      <span className="hidden sm:inline">En turno desde {clockInTime}</span>
      <LogOut className="w-4 h-4" />
    </Button>
  ) : (
    <Button
      onClick={handleClockIn}
      disabled={busy}
      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
      title="Iniciar turno"
    >
      <LogIn className="w-4 h-4" />
      <span className="hidden sm:inline">Iniciar turno</span>
    </Button>
  );
};

export default DoctorClockIn;
