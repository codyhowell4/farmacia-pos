import { useState, useEffect } from 'react';
import { Plus, Trash2, Pill, Activity, FileText, Search, ShieldAlert } from 'lucide-react';
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
  createConsultaNote, getConsultaNotesByAppointment, getDoctorProfile,
  getInventoryForDoctor, needsHistoriaClinica, getCustomerById
} from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { findControlledMed, controlledMedMessage, CONTROLLED_MED_MESSAGE } from '@/lib/controlledMeds';
import { findAllergyConflicts, summarizeAllergies, allergyOverrideNote } from '@/lib/allergyCheck';
import Cie10Search from './Cie10Search';
import HistoriaClinicaModal from './HistoriaClinicaModal';
import { tryAutoSignReceta } from '@/lib/efirma';
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
  const [inventory, setInventory] = useState([]);
  const [medSearchOpen, setMedSearchOpen] = useState({});
  // NOM-027 teleconsulta record-keeping (video citas only)
  const [teleLocation, setTeleLocation] = useState('');
  const [teleIdentity, setTeleIdentity] = useState(false);
  // NOM-004 6.1: first nota de evolución requires the historia clínica
  const [needsHistoria, setNeedsHistoria] = useState(false);
  const [historiaOpen, setHistoriaOpen] = useState(false);
  // Alergias del expediente (customers.medical_history.alergias) y
  // conflictos med↔alergia pendientes de confirmación del médico
  const [patientAllergies, setPatientAllergies] = useState([]);
  const [allergyConflicts, setAllergyConflicts] = useState([]);
  const [showMedErrors, setShowMedErrors] = useState(false);

  const patientName = appointment?.customers?.full_name || appointment?.walkin_name || 'Paciente';
  const hasCustomer = !!appointment?.customer_id;
  const alreadyCompleted = appointment?.status === 'completed';
  const inConsulta = appointment?.status === 'in_consulta';
  const isVideoVisit = appointment?.type === 'video';

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
    setTeleLocation('');
    setTeleIdentity(false);
    setNeedsHistoria(false);
    setHistoriaOpen(false);
    setPatientAllergies([]);
    setAllergyConflicts([]);
    setShowMedErrors(false);
    // NOM-004 6.1 gate: no prior consulta notes and no historia clínica →
    // the historia must be captured before the first nota de evolución.
    // Walk-ins (no customer_id) are exempt.
    if (appointment.customer_id) {
      needsHistoriaClinica(appointment.customer_id)
        .then(setNeedsHistoria)
        .catch(err => console.error('needsHistoriaClinica failed:', err));
    }
    // Alergias: prefill the receta field from the patient's recorded history
    // when empty (the appointments query only embeds name/phone). Never
    // overwrites a nurse-captured or doctor-typed value.
    if (appointment.customer_id) {
      getCustomerById(appointment.customer_id)
        .then(cust => {
          const list = Array.isArray(cust?.medical_history?.alergias) ? cust.medical_history.alergias : [];
          setPatientAllergies(list);
          const recorded = summarizeAllergies(list);
          if (recorded) {
            setVitals(prev => (prev.alergias?.trim() ? prev : { ...prev, alergias: recorded }));
          }
        })
        .catch(err => console.error('getCustomerById failed:', err));
    }
    // The receta needs the doctor's cédula profesional from doctor_profiles
    if (user?.id) {
      getDoctorProfile(user.id)
        .then(setDoctorProfile)
        .catch(err => console.error('getDoctorProfile failed:', err));
    }
    // Inventory for the medication autocomplete (stock badges included)
    getInventoryForDoctor()
      .then(rows => setInventory(Array.isArray(rows) ? rows : []))
      .catch(err => console.error('getInventoryForDoctor failed:', err));
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
          setTeleLocation(latest.tele_patient_location || '');
          setTeleIdentity(!!latest.tele_identity_verified);
        })
        .catch(err => console.error('getConsultaNotesByAppointment failed:', err));
    }
  }, [open, appointment?.id, appointment?.status, appointment?.nurse_vitals, appointment?.customer_id, user?.id]);

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

  // skipHistoriaGate: set when handleHistoriaSaved re-invokes the pending save —
  // the setNeedsHistoria(false) state update hasn't flushed yet in that call.
  // allergyOverride: set when the doctor confirms prescribing despite a
  // recorded allergy (conflict check already passed through the dialog).
  const handleSave = async (skipHistoriaGate = false, allergyOverride = false) => {
    if (!padecimiento.trim()) {
      toast.error('El padecimiento actual es obligatorio');
      return;
    }
    if (!diagnostico.trim()) {
      toast.error('El diagnóstico es obligatorio');
      return;
    }
    // NOM-027: teleconsulta notes must record the patient's stated location
    // and that identity was verified at the start of the video consulta.
    if (isVideoVisit && !teleLocation.trim()) {
      toast.error('Capture la ubicación declarada del paciente durante la teleconsulta');
      return;
    }
    if (isVideoVisit && !teleIdentity) {
      toast.error('Confirme que verificó la identidad del paciente al inicio de la teleconsulta');
      return;
    }
    const validMeds = medications.filter(m => m.medication.trim());
    // LGS 42 Bis + LGS 245-255 guards on the receta (before touching the note)
    if (validMeds.length > 0 && hasCustomer) {
      if (!doctorProfile?.license_number?.trim()) {
        toast.error('Capture su cédula profesional en su perfil antes de emitir recetas (LGS 42 Bis).');
        return;
      }
      // LGS 42/42 Bis: dosis, vía y frecuencia son obligatorias por medicamento
      const incompleteMed = validMeds.find(m => !m.dosage.trim() || !m.via.trim() || !m.frequency.trim());
      if (incompleteMed) {
        setShowMedErrors(true);
        const missing = [
          !incompleteMed.dosage.trim() && 'dosis',
          !incompleteMed.via.trim() && 'vía',
          !incompleteMed.frequency.trim() && 'frecuencia',
        ].filter(Boolean).join(', ');
        toast.error(`Faltan datos en "${incompleteMed.medication.trim()}" (${missing}) — dosis, vía y frecuencia son obligatorias para emitir la receta.`);
        return;
      }
      const controlledHit = findControlledMed(validMeds.map(m => m.medication), inventory);
      if (controlledHit) {
        toast.error(controlledMedMessage(controlledHit));
        return;
      }
    }
    if (!appointment?.id || !user?.id) return;
    // NOM-004 6.1: capture the historia clínica de primera vez before the
    // first nota de evolución; the pending note save proceeds on onSaved.
    if (hasCustomer && needsHistoria && !skipHistoriaGate) {
      toast.error('Este paciente aún no tiene historia clínica de primera vez. Captúrela antes de la primera nota de evolución (NOM-004 6.1).');
      setHistoriaOpen(true);
      return;
    }
    // NOM-004 6.2 / patient safety: when a medication matches a recorded
    // allergy the save stops until the doctor confirms the override.
    if (validMeds.length > 0 && hasCustomer && !allergyOverride) {
      const conflicts = findAllergyConflicts(validMeds.map(m => m.medication), patientAllergies, vitals.alergias);
      if (conflicts.length > 0) {
        setAllergyConflicts(conflicts);
        return;
      }
    }
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
        modality: isVideoVisit ? 'video' : 'in_person',
        tele_patient_location: isVideoVisit ? teleLocation.trim() : null,
        tele_identity_verified: isVideoVisit ? true : false,
        replaces_id: previousNote?.id || null,
      });
      await logAudit({
        action: AUDIT_ACTIONS.CLINICAL_NOTE_CREATE,
        user,
        details: `Nota de evolución para ${patientName} (cita ${appointment.id})` +
          (previousNote?.id ? ` — reemplaza nota ${previousNote.id}` : ''),
      });

      if (validMeds.length > 0 && hasCustomer) {
        // On an allergy override the decision is printed on the receta itself
        const medsToSave = allergyOverride && allergyConflicts.length > 0
          ? validMeds.map(m => {
              const lines = allergyConflicts
                .filter(c => c.medication === m.medication.trim())
                .map(c => allergyOverrideNote(c.medication, c.allergy));
              return lines.length > 0
                ? { ...m, notes: [m.notes.trim(), ...lines].filter(Boolean).join('\n') }
                : m;
            })
          : validMeds;
        const first = medsToSave[0];
        const createdRx = await createDoctorPrescription({
          customer_id: appointment.customer_id,
          patient_name: patientName,
          patient_curp: null,
          doctor_name: doctorProfile?.profiles?.full_name || user?.name || user?.email || '',
          doctor_license_number: doctorProfile?.license_number || '',
          medication: first.medication.trim(),
          dosage: first.dosage.trim() || null,
          frequency: first.frequency.trim() || null,
          duration: first.duration.trim() || null,
          notes: first.notes.trim() || null,
          prescription_date: new Date().toISOString().split('T')[0],
          height_cm: vitals.height_cm ? parseFloat(vitals.height_cm) : null,
          weight_kg: vitals.weight_kg ? parseFloat(vitals.weight_kg) : null,
          medications: medsToSave.map(m => ({
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
        // NOM-024 audit: prescribing despite a recorded allergy is always logged
        if (allergyOverride && allergyConflicts.length > 0) {
          await logAudit({
            action: AUDIT_ACTIONS.PRESCRIPTION_ALLERGY_OVERRIDE,
            user,
            details: `Receta emitida pese a alergia registrada — médico ${doctorProfile?.profiles?.full_name || user?.name || user?.email || ''} (céd. ${doctorProfile?.license_number || '-'}) — paciente ${patientName} — ${allergyConflicts.map(c => `${c.medication} ↔ ${c.allergy}`).join('; ')}`,
          });
        }
        // Auto-sign with the doctor's stored e.firma when the session is unlocked
        try {
          const signedRx = await tryAutoSignReceta(createdRx, appointment?.customers, doctorProfile, user.id);
          if (signedRx) toast.success('Receta firmada electrónicamente con tu e.firma');
        } catch (signErr) {
          toast.error(`Receta creada, pero no se pudo firmar: ${signErr.message}`);
        }
      }

      toast.success(alreadyCompleted ? 'Nota guardada (nueva versión)' : 'Consulta terminada');
      setAllergyConflicts([]);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.message || 'Error guardando la nota de evolución');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Historia saved from the NOM-004 gate: proceed with the pending note save
  const handleHistoriaSaved = () => {
    setNeedsHistoria(false);
    handleSave(true);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {alreadyCompleted ? 'Nota de evolución' : inConsulta ? 'Consulta en curso' : 'Completar consulta'} — {patientName}
          </DialogTitle>
        </DialogHeader>

        {hasCustomer && needsHistoria && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center justify-between gap-2 flex-wrap">
            <span>
              <strong>Historia clínica pendiente.</strong> Este paciente no tiene historia
              clínica de primera vez ni notas previas — la NOM-004 (6.1) exige capturarla
              antes de la primera nota de evolución.
            </span>
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-800" onClick={() => setHistoriaOpen(true)}>
              Capturar historia
            </Button>
          </div>
        )}

        {alreadyCompleted && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Nota ya firmada.</strong> Según la NOM-004 la nota original no puede
            modificarse ni eliminarse: al guardar se creará una <strong>nueva versión</strong> (nota
            de evolución) con tu nombre y fecha, y el historial completo se conserva en el expediente.
          </div>
        )}

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

          {/* Teleconsulta (NOM-027) — required for video citas */}
          {isVideoVisit && (
            <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
              <p className="text-sm font-semibold text-indigo-800">Teleconsulta</p>
              <div className="space-y-2">
                <Label>Ubicación declarada del paciente durante la consulta *</Label>
                <Input
                  placeholder="Ej. Guadalajara, Jalisco (domicilio particular)"
                  value={teleLocation}
                  onChange={(e) => setTeleLocation(e.target.value)}
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={teleIdentity}
                  onChange={(e) => setTeleIdentity(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 cursor-pointer"
                />
                Verifiqué la identidad del paciente al inicio de la teleconsulta *
              </label>
            </div>
          )}

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
                        {/* Medication search with inventory autocomplete */}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <Input placeholder="Nombre del medicamento *" value={med.medication}
                            className="pl-8"
                            onChange={(e) => {
                              updateMed(idx, 'medication', e.target.value);
                              setMedSearchOpen({ ...medSearchOpen, [idx]: true });
                            }}
                            onFocus={() => setMedSearchOpen({ ...medSearchOpen, [idx]: true })}
                            onBlur={() => setTimeout(() => setMedSearchOpen(prev => ({ ...prev, [idx]: false })), 150)}
                          />
                          {medSearchOpen[idx] && med.medication.trim().length >= 1 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                              {(() => {
                                const q = med.medication.toLowerCase();
                                // Controlled items (Grupo II/III) are never suggested:
                                // they require a COFEPRIS foliada paper receta
                                const exactControlled = findControlledMed([med.medication], inventory);
                                const matches = inventory.filter(item => !item.controlled_group && item.name.toLowerCase().includes(q)).slice(0, 5);
                                if (matches.length === 0) {
                                  return (
                                    <div className="px-3 py-2 text-xs text-slate-500">
                                      {exactControlled
                                        ? <span className="text-red-600 font-medium">{CONTROLLED_MED_MESSAGE}</span>
                                        : 'No encontrado en inventario. Puede escribir un medicamento manualmente.'}
                                    </div>
                                  );
                                }
                                return (
                                  <>
                                    {exactControlled && (
                                      <div className="px-3 py-2 text-xs text-red-600 font-medium border-b border-red-100">
                                        {CONTROLLED_MED_MESSAGE}
                                      </div>
                                    )}
                                    {matches.map(item => {
                                  const stockColor = item.quantity > 10 ? 'bg-green-500' : item.quantity > 0 ? 'bg-yellow-500' : 'bg-red-500';
                                  const stockText = item.quantity === 0
                                    ? 'Agotado (0 unidades)'
                                    : `Stock: ${item.quantity} unidad${item.quantity !== 1 ? 'es' : ''}`;
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        updateMed(idx, 'medication', item.name);
                                        setMedSearchOpen(prev => ({ ...prev, [idx]: false }));
                                      }}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium">{item.name}</span>
                                        {item.requires_prescription && (
                                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">Rx</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stockColor}`} />
                                        <span className={`text-xs ${item.quantity === 0 ? 'text-red-600 font-medium' : 'text-slate-500'}`}>{stockText}</span>
                                      </div>
                                    </button>
                                  );
                                    })}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                        <Input placeholder="Dosis *" value={med.dosage}
                          className={showMedErrors && !med.dosage.trim() ? 'border-red-500 ring-1 ring-red-500' : ''}
                          onChange={(e) => updateMed(idx, 'dosage', e.target.value)} />
                        <Input placeholder="Vía (oral, tópica, IM...) *" value={med.via}
                          className={showMedErrors && !med.via.trim() ? 'border-red-500 ring-1 ring-red-500' : ''}
                          onChange={(e) => updateMed(idx, 'via', e.target.value)} />
                        <Input placeholder="Frecuencia *" value={med.frequency}
                          className={showMedErrors && !med.frequency.trim() ? 'border-red-500 ring-1 ring-red-500' : ''}
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
            <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={() => handleSave()} disabled={saving}>
              {saving ? 'Guardando...' : alreadyCompleted ? 'Guardar nueva versión' : 'Guardar y terminar consulta'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Bloqueo por posible alergia — requiere confirmación explícita del médico */}
    <Dialog open={allergyConflicts.length > 0} onOpenChange={(o) => { if (!o) setAllergyConflicts([]); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <ShieldAlert className="w-5 h-5" /> Posible reacción alérgica
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            La receta incluye medicamentos que coinciden con alergias registradas del paciente:
          </p>
          <ul className="space-y-1.5">
            {allergyConflicts.map((c, i) => (
              <li key={i} className="text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span className="font-semibold text-red-800">{c.medication}</span>
                <span className="text-slate-600"> ↔ alergia registrada: </span>
                <span className="font-semibold text-red-800">{c.allergy}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Si continúa, la prescripción quedará anotada en la receta y en la bitácora (NOM-024).
          </p>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setAllergyConflicts([])} disabled={saving}>
              Volver y corregir
            </Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => handleSave(false, true)} disabled={saving}>
              {saving ? 'Guardando...' : 'Continuar de todas formas'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* NOM-004 6.1 gate: historia clínica de primera vez (registered patients) */}
    <HistoriaClinicaModal
      open={historiaOpen}
      onOpenChange={setHistoriaOpen}
      customer={appointment?.customer_id
        ? { ...(appointment?.customers || {}), id: appointment.customer_id, full_name: patientName }
        : null}
      onSaved={handleHistoriaSaved}
    />
    </>
  );
};

export default PostVisitDialog;
