import React, { useState } from 'react';
import { Lock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { verifyProfilePin, setMyProfilePin } from '@/lib/db';
import { toast } from 'sonner';

// Self-service screen-lock PIN change. Shared by Admin → Configuración and
// the doctor portal's Mi Perfil. The PIN is verified against (and written to)
// profiles.pin_hash server-side; the default 1234 works until first change.
// For admins the same PIN also authorizes sensitive POS operations.
const ChangePinCard = () => {
  const { user } = useAuth();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(newPin)) {
      toast.error('El nuevo PIN debe tener entre 4 y 6 dígitos');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('La confirmación no coincide con el nuevo PIN');
      return;
    }
    if (newPin === '1234') {
      toast.error('Elige un PIN distinto al predeterminado (1234)');
      return;
    }
    setSaving(true);
    try {
      const ok = await verifyProfilePin(currentPin);
      if (ok !== true) {
        toast.error(ok === null ? 'No se pudo verificar tu PIN actual — intenta de nuevo' : 'El PIN actual es incorrecto');
        return;
      }
      await setMyProfilePin(newPin);
      toast.success('PIN de desbloqueo actualizado');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      toast.error(err.message || 'Error guardando el PIN');
    } finally {
      setSaving(false);
    }
  };

  const pinInputProps = {
    type: 'password',
    inputMode: 'numeric',
    autoComplete: 'off',
    maxLength: 6,
    disabled: saving,
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <Lock className="w-4 h-4 text-apolo-navy" />
        PIN de desbloqueo
      </h4>
      <p className="text-xs text-slate-500 mb-4">
        La pantalla se bloquea tras un periodo de inactividad y este PIN la desbloquea.
        Si nunca lo has cambiado, tu PIN actual es <strong>1234</strong>.
        {user?.role === 'admin' && ' Como administrador, el mismo PIN autoriza anulaciones, devoluciones y ajustes de precio.'}
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pin-current">PIN actual</Label>
            <Input
              id="pin-current"
              {...pinInputProps}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin-new">Nuevo PIN</Label>
            <Input
              id="pin-new"
              {...pinInputProps}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin-confirm">Confirmar nuevo PIN</Label>
            <Input
              id="pin-confirm"
              {...pinInputProps}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
        </div>
        <Button
          type="submit"
          disabled={saving || !currentPin || !newPin || !confirmPin}
          className="w-full bg-gradient-to-r from-apolo-navy to-apolo-navy-dark hover:from-apolo-navy-dark hover:to-apolo-navy-dark"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Guardando…' : 'Guardar PIN'}
        </Button>
      </form>
    </div>
  );
};

export default ChangePinCard;
