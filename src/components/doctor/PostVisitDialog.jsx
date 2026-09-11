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
  updateAppointment, createDoctorPrescription,
  createConsultaNote, getConsultaNotesByAppointment, getDoctorProfile
} from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import Cie10Search from './Cie10Search';
import { toast } from 'sonner';

const emptyMed = () => ({ medication: '', dosage: '', via: '', frequency: '', duration: '', notes: '' });
const emptyVitals = () => ({
  edad: '', height_cm: '', weight_kg: '', temperatura: '',
  ta: '', fc: '', fr: '', so2: '', glicemia: '', alergias: '',
});

// Merge a stored vitals jsonb (nurse capture or a previous note) over the
// empty grid, coercing nulls to '' so the inputs stay controlled.
const mergeVitals = (stored) => {
  const merged = { ...emptyVitals(), ...(stored || {}) };
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v ?? '']));
};

/**
 * Structured NOM-004 nota de evolución shown when a doctor marks a cita as
 * Completada (or re-opens a completed one). Padecimiento actual and
 * diagnóstico are required; the receta is optional. Notes live in
 * consulta_notes, which is append-only: re-saving a completed cita inserts
 * a new version with replaces_id pointing at the previous note. Signos
 * vitales are prefilled from the nurse capture (appointments.nurse_vitals)
 * and stored on the note itself.
 */
const PostVisitDialog = ({ open, onOpenChange, appointment, onSaved }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [padecimiento, setPadecimiento] = useState('');
  const [exploracion, setExploracion] = useState('');
  const [resultados, setResultados] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [cie10, setCie10] = useState([]);
  const [pronostico, setPronostico] = useState('');
  const [plan, setPlan] = useState('');
  const [vitals, setVitals] = useState(emptyVitals());
  const [previousNote, setPreviousNote] = useState(null);
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [showRx, setShowRx] = useState(false);
  const [medications, setMedications] = useState([emptyMed()]);

  const patientName = appointment?.customers?.full_name || appointment?.walkin_name || 'Paciente';
  const hasCustomer = !!appointment?.customer_id;
  const alreadyCompleted = appointment?.status === 'completed';
  const inConsulta = appointment?.status === 'in_consulta';

  useEffect(() => {
    if (!open || !appointment?.id) return;
    setPadecimiento('');
    setExploracion('');
    setResultados('');
    setDiagnostico('');
    setCie10([]);
    setPronostico('');
    setPlan('');
    setVitals(mergeVitals(appointment.nurse_vitals));
    setPreviousNote(null);
    setDoctorProfile(null);
    setShowRx(false);
    setMedications([emptyMed()]);
    // The receta needs the doctor's cédula profesional from doctor_profiles
    if (user?.id) {
      getDoctorProfile(user.id)
        .then(setDoctorProfile)
        .catch(err => console.error('getDoctorProfile failed:', err));
    }
    // Re-opening a completed consulta: preload the latest note version so the
    // doctor can correct it — saving inserts a new version (append-only).
    if (appointment.status === 'completed') {
      getConsultaNotesByAppointment(appointment.id)
        .then(notes => {
          const latest = notes?.[0];
          if (!latest) return;
          setPreviousNote(latest);
          setPadecimiento(latest.padecimiento_actual || '');
          setExploracion(latest.exploracion_fisica || '');
          setResultados(latest.resultados_estudios || '');
          setDiagnostico(latest.diagnostico || '');
          setPronostico(latest.pronostico || '');
          setPlan(latest.plan || '');
          setCie10(Array.isArray(latest.cie10_codes) ? latest.cie10_codes : []);
          if (latest.vitals) setVitals(mergeVitals(latest.vitals));
        })
        .catch(err => console.error('getConsultaNotesByAppointment failed:', err));
    }
  }, [open, appointment?.id, appointment?.status, appointment?.nurse_vitals, user?.id]);

  const updateMed = (idx, field, value) => {
    const updated = [...medications];
    updated[idx] = { ...updated[idx], [field]: value };
    setMedications(updated);
  };

  const setVital = (field) => (e) => setVitals({ ...vitals, [field]: e.target.value });

  // Trimmed vitals for the note's jsonb column; null when nothing was captured
  const cleanedVitals = () => {
    const obj = Object.fromEntries(
      Object.entries(vitals).map(([k, v]) => [k, (v ?? '').toString().trim() || null])
    );
    return Object.values(obj).every(v => v === null) ? null : obj;
  };

  const handleSave = async () => {
    if (!padecimiento.trim()) {
      toast.error('El padecimiento actual es obligatorio');
      return;
    }
    if (!diagnostico.trim()) {
      toast.error('El diagnóstico es obligatorio');
      return;
    }
    if (!appointment?.id || !user?.id) return;
    setSaving(true);
    try {
      if (!alreadyCompleted) {
        await updateAppointment(appointment.id, {
          status: 'completed',
          consulta_ended_at: new Date().toISOString(),
        });
      }

      // consulta_notes is append-only — saving over a completed consulta
      // inserts a new version pointing at the previous note.
      await createConsultaNote({
        appointment_id: appointment.id,
        customer_id: appointment.customer_id || null,
        doctor_id: user.id,
        padecimiento_actual: padecimiento.trim(),
        exploracion_fisica: exploracion.trim() || null,
        resultados_estudios: resultados.trim() || null,
        vitals: cleanedVitals(),
        diagnostico: diagnostico.trim(),
        cie10_codes: cie10,
        pronostico: pronostico.trim() || null,
        plan: plan.trim() || null,
        replaces_id: previousNote?.id || null,
      });
      await logAudit({
        action: AUDIT_ACTIONS.CLINICAL_NOTE_CREATE,
        user,
        details: `Nota de evolución para ${patientName} (cita ${appointment.id})` +
          (previousNote?.id ? ` — reemplaza nota ${previousNote.id}` : ''),
      });

      const validMeds = medications.filter(m => m.medication.trim());
      if (validMeds.length > 0 && hasCustomer) {
        const first = validMeds[0];
        await createDoctorPrescription({
          customer_id: appointment.customer_id,
          patient_name: patientName,
          patient_curp: null,
          doctor_name: user?.name || user?.email || '',
          doctor_license_number: doctorProfile?.license_number || '',
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
            via: m.via.trim() || null,
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

      toast.success(alreadyCompleted ? 'Nota guardada (nueva versión)' : 'Consulta terminada');
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.message || 'Error guardando la nota de evolución');
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
            {alreadyCompleted ? 'Nota de evolución' : inConsulta ? 'Consulta en curso' : 'Completar consulta'} — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nota de evolución (NOM-004) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <FileText className="w-4 h-4" /> Padecimiento actual *
            </Label>
            <Textarea
              placeholder="Motivo de consulta y evolución del padecimiento actual..."
              value={padecimiento}
              onChange={(e) => setPadecimiento(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Exploración física</Label>
            <Textarea
              placeholder="Hallazgos de la exploración física (opcional)..."
              value={exploracion}
              onChange={(e) => setExploracion(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Resultados de estudios</Label>
            <Textarea
              placeholder="Resultados relevantes de laboratorio, gabinete u otros estudios solicitados previamente (opcional)..."
              value={resultados}
              onChange={(e) => setResultados(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Activity className="w-4 h-4" /> Signos vitales
              {appointment?.nurse_vitals && (
                <span className="text-xs font-normal text-teal-600 ml-1">
                  (precargados por enfermería)
                </span>
              )}
            </Label>
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
          </div>

          <div className="space-y-2">
            <Label>Diagnóstico *</Label>
            <Textarea
              placeholder="Diagnóstico clínico..."
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Diagnósticos CIE-10</Label>
            <Cie10Search value={cie10} onChange={setCie10} />
          </div>

          <div className="space-y-2">
            <Label>Pronóstico</Label>
            <Textarea
              placeholder="Pronóstico (opcional)..."
              value={pronostico}
              onChange={(e) => setPronostico(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Plan / indicación terapéutica</Label>
            <Textarea
              placeholder="Plan de tratamiento, indicaciones, estudios solicitados... (opcional)"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              rows={2}
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
                        <Input placeholder="Vía (oral, tópica, IM...)" value={med.via}
                          onChange={(e) => updateMed(idx, 'via', e.target.value)} />
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

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : alreadyCompleted ? 'Guardar nueva versión' : 'Guardar y terminar consulta'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PostVisitDialog;
