import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { saveNurseVitals } from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { toast } from 'sonner';

const emptyVitals = () => ({
  edad: '', height_cm: '', weight_kg: '', temperatura: '',
  ta: '', fc: '', fr: '', so2: '', glicemia: '', alergias: '',
});

/**
 * Pre-consulta vitals capture (nurse workflow). Stored on the appointment
 * itself (appointments.nurse_vitals) so the doctor sees them prefilled in
 * the post-visit nota de evolución.
 */
const NurseVitalsDialog = ({ open, onOpenChange, appointment, onSaved }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [vitals, setVitals] = useState(emptyVitals());

  const patientName = appointment?.customers?.full_name || appointment?.walkin_name || 'Paciente';

  useEffect(() => {
    if (!open || !appointment?.id) return;
    // Coerce nulls to '' so the inputs stay controlled
    const merged = { ...emptyVitals(), ...(appointment.nurse_vitals || {}) };
    setVitals(Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v ?? ''])));
  }, [open, appointment?.id, appointment?.nurse_vitals]);

  const setVital = (field) => (e) => setVitals({ ...vitals, [field]: e.target.value });

  const handleSave = async () => {
    if (!appointment?.id) return;
    setSaving(true);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(vitals).map(([k, v]) => [k, (v ?? '').toString().trim() || null])
      );
      await saveNurseVitals(appointment.id, cleaned);
      await logAudit({
        action: AUDIT_ACTIONS.NURSE_VITALS,
        user,
        details: `Signos vitales capturados para ${patientName} (cita ${appointment.id})`,
      });
      toast.success('Signos vitales guardados');
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.message || 'Error guardando signos vitales');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-600" /> Signos vitales — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Edad" value={vitals.edad} onChange={setVital('edad')} />
            <Input placeholder="Talla (cm)" value={vitals.height_cm} onChange={setVital('height_cm')} />
            <Input placeholder="Peso (kg)" value={vitals.weight_kg} onChange={setVital('weight_kg')} />
            <Input placeholder="Temp" value={vitals.temperatura} onChange={setVital('temperatura')} />
            <Input placeholder="T/A" value={vitals.ta} onChange={setVital('ta')} />
            <Input placeholder="FC" value={vitals.fc} onChange={setVital('fc')} />
            <Input placeholder="FR" value={vitals.fr} onChange={setVital('fr')} />
            <Input placeholder="So2%" value={vitals.so2} onChange={setVital('so2')} />
            <Input placeholder="Glicemia" value={vitals.glicemia} onChange={setVital('glicemia')} />
          </div>
          <Input placeholder="Alergias" value={vitals.alergias} onChange={setVital('alergias')} />
          <p className="text-xs text-slate-400">
            El doctor verá estos signos precargados en la nota de evolución.
          </p>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar signos'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NurseVitalsDialog;
