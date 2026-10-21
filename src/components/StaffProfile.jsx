import { useState, useEffect } from 'react';
import { UserCircle, Mail, MapPin, KeyRound, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { MX_TIMEZONES, DEFAULT_TZ } from '@/lib/timezone';
import ChangePinCard from '@/components/ChangePinCard';
import { toast } from 'sonner';

const ROLE_LABELS = {
  admin: 'Administrador',
  pos: 'Punto de Venta',
  inventory: 'Inventario',
  doctor: 'Médico',
  secretary: 'Secretaria',
  nurse: 'Enfermería',
  customer: 'Cliente',
};

// Mi Perfil for staff roles (admin / pos / inventory): name, timezone,
// password and screen-lock PIN self-service. The doctor portal has its own
// Mi Perfil (e.firma, availability, escuela) — this is the shared one.
const StaffProfile = () => {
  const { user, updatePassword, reloadProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [timezone, setTimezone] = useState(user?.timezone || DEFAULT_TZ);
  const [savingTz, setSavingTz] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // The auth shim doesn't carry timezone — prefill from the profiles row.
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('timezone').eq('id', user.id).single()
      .then(({ data }) => { if (data?.timezone) setTimezone(data.timezone); })
      .catch(() => {});
  }, [user?.id]);

  // profiles.full_name is what colleagues and patients see; the
  // profiles_update RLS policy allows editing your own row.
  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || !user?.id) return;
    setSavingName(true);
    try {
      const { error } = await supabase.from('profiles').update({ full_name: trimmed }).eq('id', user.id);
      if (error) throw error;
      await reloadProfile().catch(() => null);
      toast.success('Nombre actualizado');
    } catch (err) {
      toast.error(err.message || 'Error guardando el nombre');
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveTimezone = async () => {
    if (!user?.id) return;
    setSavingTz(true);
    try {
      const { error } = await supabase.from('profiles').update({ timezone }).eq('id', user.id);
      if (error) throw error;
      toast.success('Ubicación guardada');
    } catch (err) {
      toast.error(err.message || 'Error guardando la ubicación');
    } finally {
      setSavingTz(false);
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 10) {
      toast.error('La contraseña debe tener al menos 10 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('La confirmación no coincide con la nueva contraseña');
      return;
    }
    setSavingPassword(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Contraseña actualizada');
    } catch (err) {
      toast.error(err.message || 'Error actualizando la contraseña');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Mi Perfil</h2>
        <p className="text-slate-600">Tu información de cuenta y acceso</p>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-apolo-navy to-apolo-navy-dark flex items-center justify-center text-white text-xl font-bold shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || <UserCircle className="w-8 h-8" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 truncate">{user?.name || 'Usuario'}</h3>
            <p className="text-sm text-slate-500 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" />
              {user?.email || 'Sin email'}
            </p>
            <p className="text-xs text-slate-400 mt-1">{ROLE_LABELS[user?.role] || user?.role}</p>
          </div>
        </div>
        <div className="mt-5 pt-5 border-t border-slate-100">
          <Label htmlFor="staff-display-name" className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Nombre
          </Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              id="staff-display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre completo"
            />
            <Button
              onClick={handleSaveName}
              disabled={savingName || !name.trim() || name.trim() === (user?.name || '')}
              className="bg-[#46AC78] hover:bg-[#3b9566] shrink-0"
            >
              {savingName ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Así aparecerás en la bitácora, turnos y reportes.</p>
        </div>
      </div>

      {/* Location / timezone */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-teal-600" />
          Mi ubicación (zona horaria)
        </h4>
        <p className="text-xs text-slate-500 mb-4">
          Los horarios del sistema se muestran en la hora local de tu ubicación.
        </p>
        <div className="flex gap-2">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {MX_TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <Button
            onClick={handleSaveTimezone}
            disabled={savingTz}
            className="bg-[#46AC78] hover:bg-[#3b9566] shrink-0"
          >
            {savingTz ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Password */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-apolo-navy" />
          Cambiar contraseña
        </h4>
        <p className="text-xs text-slate-500 mb-4">
          La nueva contraseña aplica desde tu próximo inicio de sesión.
        </p>
        <form onSubmit={handleSavePassword} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="staff-new-password">Nueva contraseña</Label>
              <Input
                id="staff-new-password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <p className="text-xs text-slate-400">Mínimo 10 caracteres</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-confirm-password">Confirmar contraseña</Label>
              <Input
                id="staff-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={savingPassword || !newPassword || !confirmPassword}
            className="w-full bg-gradient-to-r from-apolo-navy to-apolo-navy-dark hover:from-apolo-navy-dark hover:to-apolo-navy-dark"
          >
            <Save className="w-4 h-4 mr-2" />
            {savingPassword ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
      </div>

      {/* PIN de desbloqueo (pantalla bloqueada por inactividad) */}
      <ChangePinCard />
    </div>
  );
};

export default StaffProfile;
