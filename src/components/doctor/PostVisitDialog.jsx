import { useState, useEffect } from 'react';
import { Plus, Trash2, Pill, Activity, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  updateAppointment, createMedicalNote, updateMedicalNote,
  getMedicalNoteByAppointment, createDoctorPrescription
} from '@/lib/db';
import { toast } from 'sonner';

const emptyMed = () => ({ medication: '', dosage: '', frequency: '', duration: '', notes: '' });
const emptyVitals = () => ({
  edad: '', height_cm: '', weight_kg: '', temperatura: '',
  ta: '', fc: '', fr: '', so2: '', glicemia: '', alergias: '',
});

/**
 * Post-visit form shown when a doctor marks a cita as Completada.
 * The consulta note is required; the receta and vitals are optional.
 * The note is stored in medical_notes (linked via appointment_id) and
 * the receta in prescriptions — both are visible in the customer portal
 * and in the PatientWorkspace for future reference.
 */
const PostVisitDialog = ({ open, onOpenChange, appointment, onSaved }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [existingNoteId, setExistingNoteId] = useState(null);
  const [showRx, setShowRx] = useState(false);
  const [medications, setMedications] = useState([emptyMed()]);
  const [showVitals, setShowVitals] = useState(false);
  const [vitals, setVitals] = useState(emptyVitals());

  const patientName = appointment?.customers?.full_name || appointment?.walkin_name || 'Paciente';
  const hasCustomer = !!appointment?.customer_id;
  const alreadyCompleted = appointment?.status === 'completed';

  useEffect(() => {
    if (!open || !appointment?.id) return;
    setNote('');
    setExistingNoteId(null);
    setShowRx(false);
    setMedications([emptyMed()]);
    setShowVitals(false);
    setVitals(emptyVitals());
    // Editing a completed consulta: preload its existing note
    if (appointment.status === 'completed') {
      getMedicalNoteByAppointment(appointment.id)
        .then(existing => {
          if (existing) {
            setExistingNoteId(existing.id);
            setNote(existing.note || '');
          }
        })
        .catch(err => console.error('getMedicalNoteByAppointment failed:', err));
    }
  }, [open, appointment?.id, appointment?.status]);

  const updateMed = (idx, field, value) => {
    const updated = [...medications];
    updated[idx] = { ...updated[idx], [field]: value };
    setMedications(updated);
  };

  const handleSave = async () => {
    if (!note.trim()) {
      toast.error('La nota de la consulta es obligatoria');
      return;
    }
    if (!appointment?.id || !user?.id) return;
    setSaving(true);
    try {
      if (!alreadyCompleted) {
        await updateAppointment(appointment.id, { status: 'completed' });
      }

      if (existingNoteId) {
        await updateMedicalNote(existingNoteId, { note: note.trim() });
      } else {
        await createMedicalNote({
          customer_id: appointment.customer_id || null,
          walkin_name: appointment.customer_id ? null : (appointment.walkin_name || null),
          doctor_id: user.id,
          note: note.trim(),
          appointment_id: appointment.id,
        });
      }

      const validMeds = medications.filter(m => m.medication.trim());
      if (validMeds.length > 0 && hasCustomer) {
        const first = validMeds[0];
        await createDoctorPrescription({
          customer_id: appointment.customer_id,
          patient_name: patientName,
          patient_curp: null,
          doctor_name: user?.name || user?.email || '',
          doctor_license_number: '',
          medication: first.medication.trim(),
          dosage: first.dosage.trim() || null,
          frequency: first.frequency.trim() || null,
          duration: first.duration.trim() || null,
          notes: first.notes.trim() || null,
          prescription_date: new Date().toISOString().split('T')[0],
          height_cm: vitals.height_cm ? parseFloat(vitals.height_cm) : null,
          weight_kg: vitals.weight_kg ? parseFloat(vitals.weight_kg) : null,
          medications: validMeds.map(m => ({
            medication: m.medication.trim(),
            dosage: m.dosage.trim() || null,
            frequency: m.frequency.trim() || null,
            duration: m.duration.trim() || null,
            notes: m.notes.trim() || null,
          })),
          edad: vitals.edad ? parseInt(vitals.edad) : null,
          temperatura: vitals.temperatura.trim() || null,
          ta: vitals.ta.trim() || null,
          fc: vitals.fc.trim() || null,
          fr: vitals.fr.trim() || null,
          so2: vitals.so2.trim() || null,
          glicemia: vitals.glicemia.trim() || null,
          alergias: vitals.alergias.trim() || null,
          next_appointment: null,
        });
      }

      toast.success(alreadyCompleted ? 'Nota actualizada' : 'Consulta completada');
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.message || 'Error guardando la nota post-consulta');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {alreadyCompleted ? 'Nota post-consulta' : 'Completar consulta'} — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Consulta note (required) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <FileText className="w-4 h-4" /> Nota de la consulta *
            </Label>
            <Textarea
              placeholder="Diagnóstico, observaciones, indicaciones... (ej. paciente sin padecimiento, no requiere receta)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
            />
          </div>

          {/* Receta (optional) */}
          {hasCustomer ? (
            <div className="border border-slate-200 rounded-lg">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setShowRx(!showRx)}
              >
                <span className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-teal-600" /> Receta (opcional)
                </span>
                <span className="text-slate-400">{showRx ? '−' : '+'}</span>
              </button>
              {showRx && (
                <div className="px-4 pb-4 space-y-3">
                  {medications.map((med, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">Medicamento {idx + 1}</span>
                        {medications.length > 1 && (
                          <Button size="sm" variant="ghost" className="text-red-600 h-6 px-2"
                            onClick={() => setMedications(medications.filter((_, i) => i !== idx))}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input placeholder="Nombre del medicamento *" value={med.medication}
                          onChange={(e) => updateMed(idx, 'medication', e.target.value)} />
                        <Input placeholder="Dosis" value={med.dosage}
                          onChange={(e) => updateMed(idx, 'dosage', e.target.value)} />
                        <Input placeholder="Frecuencia" value={med.frequency}
                          onChange={(e) => updateMed(idx, 'frequency', e.target.value)} />
                        <Input placeholder="Duración" value={med.duration}
                          onChange={(e) => updateMed(idx, 'duration', e.target.value)} />
                      </div>
                      <Textarea placeholder="Notas del medicamento..." value={med.notes}
                        onChange={(e) => updateMed(idx, 'notes', e.target.value)} rows={2} className="text-sm" />
                    </div>
                  ))}
                  <Button size="sm" variant="outline"
                    onClick={() => setMedications([...medications, emptyMed()])}>
                    <Plus className="w-3 h-3 mr-1" /> Agregar medicamento
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              La receta solo está disponible para pacientes registrados.
            </p>
          )}

          {/* Vitals (optional, only useful with a receta) */}
          {hasCustomer && showRx && (
            <div className="border border-slate-200 rounded-lg">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setShowVitals(!showVitals)}
              >
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-600" /> Signos vitales (opcional)
                </span>
                <span className="text-slate-400">{showVitals ? '−' : '+'}</span>
              </button>
              {showVitals && (
                <div className="px-4 pb-4 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Edad" value={vitals.edad} onChange={(e) => setVitals({ ...vitals, edad: e.target.value })} />
                    <Input placeholder="Talla (cm)" value={vitals.height_cm} onChange={(e) => setVitals({ ...vitals, height_cm: e.target.value })} />
                    <Input placeholder="Peso (kg)" value={vitals.weight_kg} onChange={(e) => setVitals({ ...vitals, weight_kg: e.target.value })} />
                    <Input placeholder="Temp" value={vitals.temperatura} onChange={(e) => setVitals({ ...vitals, temperatura: e.target.value })} />
                    <Input placeholder="T/A" value={vitals.ta} onChange={(e) => setVitals({ ...vitals, ta: e.target.value })} />
                    <Input placeholder="FC" value={vitals.fc} onChange={(e) => setVitals({ ...vitals, fc: e.target.value })} />
                    <Input placeholder="FR" value={vitals.fr} onChange={(e) => setVitals({ ...vitals, fr: e.target.value })} />
                    <Input placeholder="So2%" value={vitals.so2} onChange={(e) => setVitals({ ...vitals, so2: e.target.value })} />
                    <Input placeholder="Glicemia" value={vitals.glicemia} onChange={(e) => setVitals({ ...vitals, glicemia: e.target.value })} />
                  </div>
                  <Input placeholder="Alergias" value={vitals.alergias} onChange={(e) => setVitals({ ...vitals, alergias: e.target.value })} />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : alreadyCompleted ? 'Guardar cambios' : 'Guardar y completar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PostVisitDialog;
