import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, ArrowLeft, Phone, Mail, Calendar, FileText, ShoppingCart,
  Pill, Clock, Plus, Edit2, Trash2, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertCircle, Printer, FileDown, Search, Ban, ShieldAlert,
  Play, Video, StickyNote, BookOpen, FileSignature
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  getCustomerById, getDoctorPrescriptions, createDoctorPrescription,
  createAppointment, updateAppointment, deleteAppointment,
  getCustomerPurchaseHistory, getMedicalNotesByCustomer, createMedicalNote,
  getDoctorInventoryCached, updateCustomer,
  cancelDoctorPrescription, getDoctorProfile, getConsultaNotesByCustomer, getConsentDocuments,
  confirmVideoAppointment, startConsulta, clockInDoctor, getActiveDoctorShift,
  getCustomerDocuments, getHistoriaClinica, getAppointmentsByCustomer,
  hasAllConsentsSigned,
} from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { dayKeyInTz, timeInTz, dateInTz, DEFAULT_TZ } from '@/lib/timezone';
import PrintablePrescription from './PrintablePrescription';
import { tryAutoSignReceta } from '@/lib/efirma';
import PatientMedicalHistory from './PatientMedicalHistory';
import PostVisitDialog from './PostVisitDialog';
import SignRecetaButton from './SignRecetaButton';
import ConsultaNotesList from './ConsultaNotesList';
import AttachmentsTab from './AttachmentsTab';
import ConsentTab from './ConsentTab';
import JustificanteDialog from './JustificanteDialog';
import HistoriaClinicaModal from './HistoriaClinicaModal';
import { downloadPrescriptionPDF } from '@/lib/pdf';
import { buildPatientRecordPdf, triggerDownload } from '@/lib/recordExport';
import { isValidCurp } from '@/lib/curp';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { findControlledMed, controlledMedMessage, CONTROLLED_MED_MESSAGE } from '@/lib/controlledMeds';
import { findAllergyConflicts, allergyOverrideNote } from '@/lib/allergyCheck';
import { formatMXN } from '@/lib/currency';
import { toast } from 'sonner';

const statusConfig = {
  active: { label: 'Activa', className: 'bg-green-100 text-green-800' },
  fulfilled: { label: 'Surtida', className: 'bg-blue-100 text-blue-800' },
  expired: { label: 'Expirada', className: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
};

const apptStatusConfig = {
  pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmada', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completada', className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
};

// Labels for the consent documents that must be signed before saving any
// nota médica or receta for a registered patient (REQUIRED_CONSENT_TYPES).
const REQUIRED_CONSENT_LABELS = {
  privacidad: 'Aviso de privacidad',
  general: 'Consentimiento informado general',
  teleconsulta: 'Consentimiento informado para teleconsulta',
  firma_electronica: 'Consentimiento de firma electrónica y documentos digitales',
};

const PatientWorkspace = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;
  const isSecretary = role === 'secretary';
  const isNurse = role === 'nurse';
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resumen');

  // Data states
  const [prescriptions, setPrescriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [notes, setNotes] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [doctorProfile, setDoctorProfile] = useState(null);

  // Dialog states
  const [rxDialogOpen, setRxDialogOpen] = useState(false);
  const [apptDialogOpen, setApptDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [patientEditOpen, setPatientEditOpen] = useState(false);
  const [patientForm, setPatientForm] = useState({ height: '', weight: '', notes: '', curp: '', sexo: '', birth_state: '' });
  const [curpError, setCurpError] = useState('');
  const [savingPatient, setSavingPatient] = useState(false);
  const [printRx, setPrintRx] = useState(null);
  const [medSearchOpen, setMedSearchOpen] = useState({}); // { [idx]: boolean }
  const [postVisitAppt, setPostVisitAppt] = useState(null);
  const [postVisitOpen, setPostVisitOpen] = useState(false);
  const [activeShift, setActiveShift] = useState(null);
  const [busyConsult, setBusyConsult] = useState(false);
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const tz = timezone || DEFAULT_TZ;
  const [justificanteOpen, setJustificanteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Historia clínica de primera vez (NOM-004 6.1) — one per patient, append-only
  const [historia, setHistoria] = useState(null);
  const [needsHistoria, setNeedsHistoria] = useState(false);
  const [historiaOpen, setHistoriaOpen] = useState(false);
  const [historiaViewOpen, setHistoriaViewOpen] = useState(false);
  // R2-35: consent gate — the required documents must be signed before
  // saving any nota médica or receta from this expediente
  const [missingConsents, setMissingConsents] = useState([]);

  // Form states
  const [rxForm, setRxForm] = useState({
    medications: [{ medication: '', dosage: '', via: '', frequency: '', duration: '', notes: '' }],
    useInventory: false, inventoryId: '',
    height_cm: '', weight_kg: '',
    edad: '', temperatura: '', ta: '', fc: '', fr: '', so2: '', glicemia: '', alergias: '',
    next_appointment: '',
  });
  // Conflictos med↔alergia pendientes de confirmación y errores de captura
  const [allergyConflicts, setAllergyConflicts] = useState([]);
  const [showRxMedErrors, setShowRxMedErrors] = useState(false);
  const [apptForm, setApptForm] = useState({
    appointment_date: '', status: 'pending', notes: '', type: 'in_person',
  });
  const [noteForm, setNoteForm] = useState({ note: '' });

  // Positive allergy entries from the patient's clinical history
  const historyAllergies = (customer?.medical_history?.alergias || [])
    .filter((e) => e.status !== 'denied')
    .map((e) => (e.value ? `${e.label}: ${e.value}` : e.label))
    .join('; ');

  // Resumen fallbacks: when the customers row lacks antropometría, pull it
  // from the most recent receta that captured it (prescriptions are ordered
  // newest first). The app's "Mis datos" editor writes to customers directly.
  const latestRxWith = (field) => (Array.isArray(prescriptions) ? prescriptions.find(rx => rx?.[field]) : null);
  const effHeight = customer?.height || latestRxWith('height_cm')?.height_cm || null;
  const effWeight = customer?.weight || latestRxWith('weight_kg')?.weight_kg || null;
  const heightSrc = !customer?.height && effHeight ? ' (última receta)' : '';
  const weightSrc = !customer?.weight && effWeight ? ' (última receta)' : '';
  const patientAge = customer?.date_of_birth
    ? (() => {
        const b = new Date(customer.date_of_birth);
        const t = new Date();
        let a = t.getFullYear() - b.getFullYear();
        const m = t.getMonth() - b.getMonth();
        if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
        return a >= 0 && a < 130 ? a : null;
      })()
    : null;

  // The full doctor catalog (~whole org inventory) only loads the first
  // time a dialog needs it — module-level 5-min cache in db.js — instead of
  // firing with the expediente mount batch.
  const ensureDoctorInventory = async () => {
    try {
      const rows = await getDoctorInventoryCached();
      const list = Array.isArray(rows) ? rows : [];
      setInventory(list);
      return list;
    } catch (e) {
      console.error('getInventoryForDoctor failed:', e);
      return inventory;
    }
  };

  // Open the Nueva Receta dialog, pre-filling allergies from the history (if empty)
  const openRxDialog = () => {
    ensureDoctorInventory();
    setRxForm((prev) => ({
      ...prev,
      alergias: prev.alergias || historyAllergies,
    }));
    setAllergyConflicts([]);
    setShowRxMedErrors(false);
    setRxDialogOpen(true);
  };

  const loadAll = useCallback(async () => {
    if (!customerId) return;
    // Secretaries manage the agenda only — never load clinical data
    if (isSecretary) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // One parallel batch. The customer row is the only fatal query — when
      // it rejects, Promise.all rejects and we stop with the same toast as
      // before. Every secondary slice fails soft (empty state) so one error
      // doesn't break the whole page. The doctor inventory catalog is NOT
      // part of this batch: only the Rx / post-visit dialogs use it, so it
      // lazy-loads on first dialog open (see ensureDoctorInventory).
      const [cust, rxs, appts, docProfile, hist, meds, historiaRes, consultaRes] = await Promise.all([
        getCustomerById(customerId),
        getDoctorPrescriptions(customerId).catch(e => {
          console.error('getDoctorPrescriptions failed:', e);
          return [];
        }),
        getAppointmentsByCustomer(customerId).catch(e => {
          console.error('getAppointmentsByCustomer failed:', e);
          return [];
        }),
        user?.id
          ? getDoctorProfile(user.id).catch(e => {
              console.error('getDoctorProfile failed:', e);
              return null;
            })
          : Promise.resolve(null),
        getCustomerPurchaseHistory(customerId).catch(e => {
          console.error('getCustomerPurchaseHistory failed:', e);
          return [];
        }),
        getMedicalNotesByCustomer(customerId).catch(e => {
          console.error('getMedicalNotesByCustomer failed:', e);
          return [];
        }),
        // NOM-004 6.1: historia clínica de primera vez + first-note gate.
        // needsHistoria = no consulta notes AND no historia row — computed
        // client-side from these two queries (same check as the
        // needsHistoriaClinica helper, without its duplicate historia_clinica
        // read). `ok: false` marks a failed query so the gate fails soft
        // (no badge) like the old .catch(() => false) did.
        getHistoriaClinica(customerId).then(
          row => ({ ok: true, row }),
          e => {
            console.error('getHistoriaClinica failed:', e);
            return { ok: false, row: null };
          }
        ),
        supabase
          .from('consulta_notes')
          .select('*', { count: 'exact', head: true })
          .eq('customer_id', customerId)
          .then(({ count, error }) => {
            if (error) throw error;
            return { ok: true, count: count || 0 };
          })
          .catch(e => {
            console.error('consulta_notes count failed:', e);
            return { ok: false, count: 0 };
          }),
      ]);
      setCustomer(cust);
      setPrescriptions(Array.isArray(rxs) ? rxs : []);
      // getAppointmentsByCustomer returns newest-first; the upcoming/past
      // sections below expect chronological (oldest-first) order.
      const sortedAppts = Array.isArray(appts)
        ? [...appts].sort((a, b) => new Date(a?.appointment_date) - new Date(b?.appointment_date))
        : [];
      setAppointments(sortedAppts);
      setDoctorProfile(docProfile);
      setPurchases(Array.isArray(hist) ? hist : []);
      setNotes(Array.isArray(meds) ? meds : []);
      setHistoria(historiaRes.row);
      setNeedsHistoria(
        historiaRes.ok && consultaRes.ok
          ? consultaRes.count === 0 && !historiaRes.row
          : false
      );

      if (user?.id) {
        getActiveDoctorShift(user.id).then(setActiveShift).catch(() => {});
        supabase.from('profiles').select('timezone').eq('id', user.id).single()
          .then(({ data }) => { if (data?.timezone) setTimezone(data.timezone); })
          .catch(() => {});
      }
    } catch (err) {
      console.error('getCustomerById failed:', err);
      toast.error('Error cargando datos del paciente');
    } finally {
      setLoading(false);
    }
  }, [customerId, user?.id, isSecretary]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Targeted refetches (post-mutation) ──
  // Each mutation refetches only the slice it touched instead of re-running
  // the whole loadAll batch.
  const refetchCustomer = useCallback(async () => {
    try {
      setCustomer(await getCustomerById(customerId));
    } catch (e) {
      console.error('getCustomerById failed:', e);
    }
  }, [customerId]);

  const refetchPrescriptions = useCallback(async () => {
    try {
      const rxs = await getDoctorPrescriptions(customerId);
      setPrescriptions(Array.isArray(rxs) ? rxs : []);
    } catch (e) {
      console.error('getDoctorPrescriptions failed:', e);
    }
  }, [customerId]);

  const refetchAppointments = useCallback(async () => {
    try {
      const appts = await getAppointmentsByCustomer(customerId);
      // Same chronological (oldest-first) order as the initial load.
      const sortedAppts = Array.isArray(appts)
        ? [...appts].sort((a, b) => new Date(a?.appointment_date) - new Date(b?.appointment_date))
        : [];
      setAppointments(sortedAppts);
    } catch (e) {
      console.error('getAppointmentsByCustomer failed:', e);
    }
  }, [customerId]);

  const refetchNotes = useCallback(async () => {
    try {
      const meds = await getMedicalNotesByCustomer(customerId);
      setNotes(Array.isArray(meds) ? meds : []);
    } catch (e) {
      console.error('getMedicalNotesByCustomer failed:', e);
    }
  }, [customerId]);

  // NOM-004 6.1 first-note gate: refresh the historia row and recompute
  // needsHistoria from a fresh historia + consulta-count pair (same logic
  // as the initial load).
  const refetchHistoriaGate = useCallback(async () => {
    const [historiaRes, consultaRes] = await Promise.all([
      getHistoriaClinica(customerId).then(
        row => ({ ok: true, row }),
        e => {
          console.error('getHistoriaClinica failed:', e);
          return { ok: false, row: null };
        }
      ),
      supabase
        .from('consulta_notes')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customerId)
        .then(({ count, error }) => {
          if (error) throw error;
          return { ok: true, count: count || 0 };
        })
        .catch(e => {
          console.error('consulta_notes count failed:', e);
          return { ok: false, count: 0 };
        }),
    ]);
    setHistoria(historiaRes.row);
    setNeedsHistoria(
      historiaRes.ok && consultaRes.ok
        ? consultaRes.count === 0 && !historiaRes.row
        : false
    );
  }, [customerId]);

  // A saved post-visit note touches the cita status, may add a receta, and
  // adds a consulta note (which can flip the NOM-004 historia gate).
  const refetchAfterConsulta = useCallback(() => {
    refetchAppointments();
    refetchPrescriptions();
    refetchHistoriaGate();
  }, [refetchAppointments, refetchPrescriptions, refetchHistoriaGate]);

  const formatDate = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (ts) => {
    if (!ts) return '-';
    return `${dateInTz(ts, tz)} ${timeInTz(ts, tz)}`;
  };

  // ── PRESCRIPTION HANDLERS ──
  // R2-35: in-person consent enforcement — returns true when every required
  // consent document is signed; otherwise opens the blocking dialog listing
  // what's missing (no silent saves).
  const checkConsentsSigned = async () => {
    try {
      const missing = await hasAllConsentsSigned(customerId);
      if (missing.length > 0) {
        setMissingConsents(missing);
        return false;
      }
      return true;
    } catch (err) {
      console.error('hasAllConsentsSigned failed:', err);
      toast.error('No se pudo verificar los consentimientos del paciente');
      return false;
    }
  };

  const validMeds = rxForm.medications.filter(m => m.medication.trim());
  // allergyOverride: set when the doctor confirms prescribing despite a
  // recorded allergy (conflict check already passed through the dialog).
  const handleCreateRx = async (allergyOverride = false) => {
    if (validMeds.length === 0) {
      toast.error('Agrega al menos un medicamento');
      return;
    }
    // LGS 42 Bis: la receta electrónica debe identificar al médico con cédula
    if (!doctorProfile?.license_number?.trim()) {
      toast.error('Capture su cédula profesional en su perfil antes de emitir recetas (LGS 42 Bis).');
      return;
    }
    // LGS 42/42 Bis: dosis, vía y frecuencia son obligatorias por medicamento
    const incompleteMed = validMeds.find(m => !m.dosage.trim() || !(m.via || '').trim() || !m.frequency.trim());
    if (incompleteMed) {
      setShowRxMedErrors(true);
      const missing = [
        !incompleteMed.dosage.trim() && 'dosis',
        !(incompleteMed.via || '').trim() && 'vía',
        !incompleteMed.frequency.trim() && 'frecuencia',
      ].filter(Boolean).join(', ');
      toast.error(`Faltan datos en "${incompleteMed.medication.trim()}" (${missing}) — dosis, vía y frecuencia son obligatorias para emitir la receta.`);
      return;
    }
    // LGS 245-255: los controlados nunca salen en receta electrónica.
    // The catalog lazy-loads with the dialog — await it here so this check
    // never runs against an empty list on a slow first load.
    const inv = await ensureDoctorInventory();
    const controlledHit = findControlledMed(validMeds.map(m => m.medication), inv);
    if (controlledHit) {
      toast.error(controlledMedMessage(controlledHit));
      return;
    }
    // NOM-004 6.2 / patient safety: when a medication matches a recorded
    // allergy the save stops until the doctor confirms the override.
    if (!allergyOverride) {
      const conflicts = findAllergyConflicts(
        validMeds.map(m => m.medication),
        customer?.medical_history?.alergias,
        rxForm.alergias,
      );
      if (conflicts.length > 0) {
        setAllergyConflicts(conflicts);
        return;
      }
    }
    // R2-35: no receta without the required signed consent documents
    if (!(await checkConsentsSigned())) return;
    try {
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
      const payload = {
        customer_id: customerId,
        patient_name: customer?.full_name || '',
        patient_curp: customer?.curp || null,
        doctor_name: doctorProfile?.profiles?.full_name || user?.name || user?.email || '',
        doctor_license_number: doctorProfile?.license_number || '',
        medication: first.medication.trim(),
        dosage: first.dosage.trim() || null,
        frequency: first.frequency.trim() || null,
        duration: first.duration.trim() || null,
        notes: first.notes.trim() || null,
        prescription_date: new Date().toISOString().split('T')[0],
        height_cm: rxForm.height_cm ? parseFloat(rxForm.height_cm) : null,
        weight_kg: rxForm.weight_kg ? parseFloat(rxForm.weight_kg) : null,
        medications: medsToSave.map(m => ({
          medication: m.medication.trim(),
          dosage: m.dosage.trim() || null,
          via: (m.via || '').trim() || null,
          frequency: m.frequency.trim() || null,
          duration: m.duration.trim() || null,
          notes: m.notes.trim() || null,
        })),
        edad: rxForm.edad ? parseInt(rxForm.edad) : null,
        temperatura: rxForm.temperatura.trim() || null,
        ta: rxForm.ta.trim() || null,
        fc: rxForm.fc.trim() || null,
        fr: rxForm.fr.trim() || null,
        so2: rxForm.so2.trim() || null,
        glicemia: rxForm.glicemia.trim() || null,
        alergias: rxForm.alergias.trim() || null,
        next_appointment: rxForm.next_appointment || null,
      };
      const createdRx = await createDoctorPrescription(payload);
      // Auto-sign with the doctor's stored e.firma when the session is unlocked
      try {
        const signedRx = await tryAutoSignReceta(createdRx, customer, doctorProfile, user?.id);
        if (signedRx) toast.success('Receta firmada electrónicamente con tu e.firma');
      } catch (signErr) {
        toast.error(`Receta creada, pero no se pudo firmar: ${signErr.message}`);
      }
      logAudit({
        action: AUDIT_ACTIONS.RECETA_CREATE,
        user,
        details: `Receta creada (${validMeds.length} medicamento${validMeds.length !== 1 ? 's' : ''}) — paciente ${customer?.full_name || ''}`,
      });
      // NOM-024 audit: prescribing despite a recorded allergy is always logged
      if (allergyOverride && allergyConflicts.length > 0) {
        logAudit({
          action: AUDIT_ACTIONS.PRESCRIPTION_ALLERGY_OVERRIDE,
          user,
          details: `Receta emitida pese a alergia registrada — médico ${doctorProfile?.profiles?.full_name || user?.name || user?.email || ''} (céd. ${doctorProfile?.license_number || '-'}) — paciente ${customer?.full_name || ''} — ${allergyConflicts.map(c => `${c.medication} ↔ ${c.allergy}`).join('; ')}`,
        });
      }
      toast.success('Receta creada exitosamente');
      setRxDialogOpen(false);
      setAllergyConflicts([]);
      setRxForm({
        medications: [{ medication: '', dosage: '', via: '', frequency: '', duration: '', notes: '' }],
        useInventory: false, inventoryId: '',
        height_cm: '', weight_kg: '',
        edad: '', temperatura: '', ta: '', fc: '', fr: '', so2: '', glicemia: '', alergias: '',
        next_appointment: '',
      });
      refetchPrescriptions();
    } catch (err) {
      toast.error(err.message || 'Error creando receta');
    }
  };

  const handleCancelRx = async (rx) => {
    if (!confirm(`¿Cancelar la receta ${rx.prescription_number || ''}? Esta acción no se puede deshacer.`)) return;
    try {
      const rxMeds = (Array.isArray(rx.medications) && rx.medications.length > 0
        ? rx.medications.map(m => m.medication)
        : rx.medication ? [rx.medication] : []).filter(Boolean).join(', ');
      await cancelDoctorPrescription(rx.id);
      logAudit({
        action: AUDIT_ACTIONS.RECETA_CANCEL,
        user,
        details: `Receta ${rx.prescription_number || rx.id} cancelada — paciente ${customer?.full_name || ''} — estado anterior: ${rx.status || 'activa'} — meds: ${rxMeds || '-'}`,
      });
      toast.success('Receta cancelada');
      refetchPrescriptions();
    } catch (err) {
      toast.error(err.message || 'Error cancelando receta');
    }
  };

  // ── RECORD EXPORT (expediente clínico completo PDF, NOM-024 6.6.6) ──
  const handleExportRecord = async () => {
    if (!customer) return;
    setExporting(true);
    try {
      const [consultaNotes, consents, documents, historiaRow, customerAppts] = await Promise.all([
        getConsultaNotesByCustomer(customerId).catch(e => {
          console.error('getConsultaNotesByCustomer failed:', e);
          return [];
        }),
        getConsentDocuments(customerId).catch(e => {
          console.error('getConsentDocuments failed:', e);
          return [];
        }),
        getCustomerDocuments(customerId).catch(e => {
          console.error('getCustomerDocuments failed:', e);
          return [];
        }),
        getHistoriaClinica(customerId).catch(e => {
          console.error('getHistoriaClinica failed:', e);
          return null;
        }),
        getAppointmentsByCustomer(customerId).catch(e => {
          console.error('getAppointmentsByCustomer failed:', e);
          return [];
        }),
      ]);
      const doc = buildPatientRecordPdf({
        customer,
        history: customer.medical_history || {},
        historia: historiaRow,
        medicalNotes: Array.isArray(notes) ? notes : [],
        consultaNotes: Array.isArray(consultaNotes) ? consultaNotes : [],
        prescriptions,
        appointments: Array.isArray(customerAppts) ? customerAppts : [],
        attachments: Array.isArray(documents) ? documents : [],
        consents: Array.isArray(consents) ? consents : [],
      });
      const safeName = (customer.full_name || 'paciente').replace(/\s+/g, '_');
      triggerDownload(doc, `Expediente_${safeName}.pdf`);
      logAudit({
        action: AUDIT_ACTIONS.RECORD_EXPORT,
        user,
        details: `Expediente clínico exportado — paciente ${customer.full_name || ''}`,
      });
    } catch (err) {
      console.error('Record export failed:', err);
      toast.error('Error exportando expediente');
    } finally {
      setExporting(false);
    }
  };

  // ── APPOINTMENT HANDLERS ──
  const handleCreateAppt = async () => {
    if (!apptForm.appointment_date) {
      toast.error('La fecha y hora son obligatorias');
      return;
    }
    try {
      const created = await createAppointment({
        customer_id: customerId,
        doctor_id: user?.id,
        appointment_date: new Date(apptForm.appointment_date).toISOString(),
        status: apptForm.status,
        notes: apptForm.notes,
        type: apptForm.type,
        // Staff-created teleconsultas are courtesy — no patient charge
        ...(apptForm.type === 'video' ? { payment_status: 'waived' } : {}),
      });
      // Teleconsulta: run the telehealth flow — create the meeting room now
      if (apptForm.type === 'video' && created?.id) {
        try {
          const videoResult = await confirmVideoAppointment(created.id);
          if (videoResult?.meeting_url) {
            setAppointments(prev => prev.map(a => a.id === created.id
              ? { ...a, meeting_url: videoResult.meeting_url, meeting_url_staff: videoResult.staff_url || a.meeting_url_staff }
              : a));
          }
          toast.success('Cita creada — sala de video lista para el paciente');
        } catch (videoErr) {
          toast.error(videoErr.message || 'Cita creada, pero no se pudo crear la sala de video');
        }
      } else {
        toast.success('Cita creada exitosamente');
      }
      setApptDialogOpen(false);
      setApptForm({ appointment_date: '', status: 'pending', notes: '', type: 'in_person' });
      refetchAppointments();
    } catch (err) {
      toast.error(err.message || 'Error creando cita');
    }
  };

  const handleApptStatus = async (id, status) => {
    // Completing a consulta requires the post-visit note — open the form
    // instead of updating the status directly.
    if (status === 'completed') {
      const appt = appointments.find(a => a.id === id);
      if (appt) {
        setPostVisitAppt(appt);
        setPostVisitOpen(true);
      }
      return;
    }
    try {
      // Video citas confirm through the video-room edge function (creates
      // the Daily.co room and sets status confirmed itself).
      const appt = appointments.find(a => a.id === id);
      if (status === 'confirmed' && appt?.type === 'video') {
        try {
          const videoResult = await confirmVideoAppointment(id);
          if (videoResult?.meeting_url) {
            setAppointments(prev => prev.map(a => a.id === id
              ? { ...a, meeting_url: videoResult.meeting_url, meeting_url_staff: videoResult.staff_url || a.meeting_url_staff }
              : a));
          }
        } catch (videoErr) {
          toast.error(videoErr.message || 'No se pudo crear la sala de video');
          return;
        }
      } else {
        await updateAppointment(id, { status });
      }
      toast.success('Cita actualizada');
      refetchAppointments();
    } catch (err) {
      toast.error('Error actualizando cita');
    }
  };

  // Start a consulta from the expediente: clock in if needed, mark
  // in_consulta and open the structured note (same flow as the Citas page).
  const handleStartConsulta = async (appt) => {
    if (!appt?.id || !user?.id) return;
    setBusyConsult(true);
    try {
      if (!activeShift) {
        const shift = await clockInDoctor(user.id);
        setActiveShift(shift);
        toast.success('Turno iniciado');
      }
      const updated = await startConsulta(appt.id);
      toast.success('Consulta iniciada');
      setPostVisitAppt({ ...appt, ...updated });
      setPostVisitOpen(true);
      refetchAppointments();
    } catch (err) {
      console.error(err);
      toast.error(`No se pudo iniciar la consulta: ${err?.message || 'error desconocido'}`);
    } finally {
      setBusyConsult(false);
    }
  };

  const handleDeleteAppt = async (id) => {
    if (!confirm('¿Eliminar esta cita?')) return;
    try {
      await deleteAppointment(id);
      toast.success('Cita eliminada');
      refetchAppointments();
    } catch (err) {
      toast.error('Error eliminando cita');
    }
  };

  // ── PATIENT INFO HANDLERS ──
  const openPatientEdit = () => {
    setPatientForm({
      height: customer?.height || '',
      weight: customer?.weight || '',
      notes: customer?.notes || '',
      curp: customer?.curp || '',
      sexo: customer?.sexo || '',
      birth_state: customer?.birth_state || '',
    });
    setCurpError('');
    setPatientEditOpen(true);
  };

  const handleUpdatePatient = async () => {
    const curp = patientForm.curp.trim().toUpperCase();
    if (curp && !isValidCurp(curp)) {
      setCurpError('CURP inválida: revisa el formato y el dígito verificador');
      return;
    }
    setCurpError('');
    setSavingPatient(true);
    try {
      await updateCustomer(customerId, {
        height: patientForm.height ? parseFloat(patientForm.height) : null,
        weight: patientForm.weight ? parseFloat(patientForm.weight) : null,
        notes: patientForm.notes.trim() || null,
        curp: curp || null,
        sexo: patientForm.sexo || null,
        birth_state: patientForm.birth_state.trim() || null,
      });
      toast.success('Información del paciente actualizada');
      setPatientEditOpen(false);
      refetchCustomer();
    } catch (err) {
      toast.error('Error actualizando paciente');
      console.error(err);
    } finally {
      setSavingPatient(false);
    }
  };

  // ── NOTE HANDLERS ──
  // NOM-004/NOM-024: las notas del expediente son append-only — no se
  // editan ni se eliminan; las correcciones se asientan como notas nuevas.
  const handleSaveNote = async () => {
    if (!noteForm.note.trim()) {
      toast.error('La nota no puede estar vacía');
      return;
    }
    // R2-35: no nota médica without the required signed consent documents
    if (!(await checkConsentsSigned())) return;
    try {
      await createMedicalNote({
        customer_id: customerId,
        doctor_id: user?.id,
        note: noteForm.note.trim(),
      });
      toast.success('Nota creada');
      setNoteDialogOpen(false);
      setNoteForm({ note: '' });
      refetchNotes();
      refetchHistoriaGate();
    } catch (err) {
      toast.error('Error guardando nota');
    }
  };

  // Secretaries manage the agenda only — the clinical record is off-limits
  if (isSecretary) {
    return (
      <div className="text-center py-12">
        <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <p className="text-slate-700 font-medium">Tu rol no tiene acceso al expediente clínico</p>
        <Button onClick={() => navigate('/doctor/customers')} variant="outline" className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a pacientes
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">Paciente no encontrado</p>
        <Button onClick={() => navigate('/doctor/customers')} variant="outline" className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a pacientes
        </Button>
      </div>
    );
  }

  // Unpaid pending video consultas are hidden until the patient pays
  const isUnpaidPendingVideo = (a) =>
    a?.type === 'video' && a?.status === 'pending' &&
    ['unpaid', 'membership_half'].includes(a?.payment_status || 'unpaid');

  // A cita stays "actionable" all day (the patient may be in the waiting room
  // after the start time passed), and an open consulta is never buried by
  // its date. Anything else is history.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isActionableAppt = (a) => {
    if (a.status === 'in_consulta') return true;
    if (!['pending', 'confirmed'].includes(a.status)) return false;
    if (isUnpaidPendingVideo(a)) return new Date(a.appointment_date) >= new Date();
    return new Date(a.appointment_date) >= startOfToday;
  };
  const upcomingAppts = appointments.filter(isActionableAppt);
  const pastAppts = appointments.filter(a => !isActionableAppt(a));

  // Shared action buttons for a cita row, used in both sections so a consulta
  // can be started/continued/finished from the expediente on any cita.
  const renderApptActions = (ap) => (
    <>
      {ap.status === 'pending' && !isUnpaidPendingVideo(ap) && (
        <Button size="sm" variant="outline" onClick={() => handleApptStatus(ap.id, 'confirmed')}>
          <CheckCircle className="w-3 h-3 mr-1" /> Confirmar
        </Button>
      )}
      {ap.status === 'pending' && isUnpaidPendingVideo(ap) && (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pago pendiente</Badge>
      )}
      {ap.status === 'confirmed' && !isNurse && (
        <Button
          size="sm"
          className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white"
          disabled={busyConsult}
          onClick={() => handleStartConsulta(ap)}
        >
          <Play className="w-3 h-3 mr-1" /> Empezar Consulta
        </Button>
      )}
      {ap.status === 'in_consulta' && !isNurse && (
        <Button
          size="sm"
          className="bg-cyan-600 hover:bg-cyan-700 text-white"
          onClick={() => { setPostVisitAppt(ap); setPostVisitOpen(true); }}
        >
          <Play className="w-3 h-3 mr-1" /> Continuar consulta
        </Button>
      )}
      {ap.status === 'completed' && !isNurse && (
        <Button
          size="sm" variant="ghost" className="text-teal-600"
          title="Nota de evolución"
          onClick={() => { setPostVisitAppt(ap); setPostVisitOpen(true); }}
        >
          <FileText className="w-4 h-4" />
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/doctor/customers')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{customer.full_name}</h2>
            <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
              {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>}
              {customer.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{customer.email}</span>}
            </div>
            {(!customer.sexo || !customer.curp) && (
              <button
                onClick={openPatientEdit}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100"
                title="Faltan datos de identificación mínimos del expediente (NOM-024, Tabla 1)"
              >
                <AlertCircle className="w-3 h-3" />
                Datos NOM-024 incompletos — captura {[!customer.sexo && 'sexo', !customer.curp && 'CURP'].filter(Boolean).join(' y ')}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNurse && (
            <Button variant="outline" size="sm" onClick={() => setJustificanteOpen(true)}>
              <FileText className="w-4 h-4 mr-1" /> Justificante
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportRecord} disabled={exporting}>
            <FileDown className="w-4 h-4 mr-1" /> {exporting ? 'Exportando...' : 'Exportar expediente'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 w-full h-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="historia">Historia</TabsTrigger>
          <TabsTrigger value="consulta">Notas consulta</TabsTrigger>
          <TabsTrigger value="recetas">Recetas</TabsTrigger>
          <TabsTrigger value="citas">Citas</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
          <TabsTrigger value="adjuntos">Adjuntos</TabsTrigger>
          <TabsTrigger value="consent">Consent.</TabsTrigger>
        </TabsList>

        {/* RESUMEN TAB */}
        <TabsContent value="resumen" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <p className="text-sm text-slate-500">Total Recetas</p>
              <p className="text-3xl font-bold text-slate-900">{prescriptions.length}</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <p className="text-sm text-slate-500">Total Citas</p>
              <p className="text-3xl font-bold text-slate-900">{appointments.length}</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <p className="text-sm text-slate-500">Total Compras</p>
              <p className="text-3xl font-bold text-slate-900">{purchases.length}</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <p className="text-sm text-slate-500">Notas Médicas</p>
              <p className="text-3xl font-bold text-slate-900">{notes.length}</p>
            </div>
          </div>

          {historyAllergies && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700"><span className="font-semibold">Alergias:</span> {historyAllergies}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Información del paciente</h3>
              <Button size="sm" variant="outline" onClick={openPatientEdit}>
                <Edit2 className="w-3 h-3 mr-1" /> Editar
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div><span className="text-slate-500">Nombre:</span> {customer.full_name}</div>
              <div><span className="text-slate-500">Email:</span> {customer.email || '-'}</div>
              <div><span className="text-slate-500">Teléfono:</span> {customer.phone || '-'}</div>
              <div><span className="text-slate-500">CURP:</span> {customer.curp || '-'}</div>
              <div><span className="text-slate-500">Sexo:</span> {customer.sexo === 'M' ? 'Mujer' : customer.sexo === 'H' ? 'Hombre' : '-'}</div>
              <div><span className="text-slate-500">Nacimiento:</span> {formatDate(customer.date_of_birth)}{patientAge !== null ? ` (${patientAge} años)` : ''}</div>
              <div><span className="text-slate-500">Entidad de nacimiento:</span> {customer.birth_state || '-'}</div>
              <div><span className="text-slate-500">Registro:</span> {formatDate(customer.created_at)}</div>
              <div><span className="text-slate-500">Talla:</span> {effHeight ? `${effHeight} cm` : '-'}<span className="text-slate-400 text-xs">{heightSrc}</span></div>
              <div><span className="text-slate-500">Peso:</span> {effWeight ? `${effWeight} kg` : '-'}<span className="text-slate-400 text-xs">{weightSrc}</span></div>
              {customer.notes && <div className="col-span-full"><span className="text-slate-500">Notas:</span> {customer.notes}</div>}
            </div>
          </div>
        </TabsContent>

        {/* HISTORIA CLÍNICA TAB */}
        <TabsContent value="historia" className="space-y-4">
          {/* Historia clínica de primera vez (NOM-004 6.1) — one per patient */}
          <div className={`rounded-xl border p-6 ${historia ? 'bg-white border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className={`w-5 h-5 shrink-0 ${historia ? 'text-teal-600' : 'text-amber-500'}`} />
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">Historia clínica de primera vez</h3>
                  {historia ? (
                    <p className="text-sm text-slate-500">
                      Registrada el {formatDate(historia.created_at)}
                      {historia.profiles?.full_name ? ` por ${historia.profiles.full_name}` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-700">
                      Pendiente — la NOM-004 (6.1) la exige antes de la primera nota de evolución.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {historia ? (
                  <>
                    <Badge className="bg-green-100 text-green-800 border-green-200">Registrada</Badge>
                    <Button size="sm" variant="outline" onClick={() => setHistoriaViewOpen(true)}>
                      Ver
                    </Button>
                  </>
                ) : (
                  <>
                    {needsHistoria && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200">Requerida para la 1ª nota</Badge>
                    )}
                    {!isNurse && (
                      <Button size="sm" className="bg-gradient-to-r from-teal-500 to-emerald-600" onClick={() => setHistoriaOpen(true)}>
                        <Plus className="w-3 h-3 mr-1" /> Capturar historia
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <PatientMedicalHistory customer={customer} onSaved={refetchCustomer} />
        </TabsContent>

        {/* NOTAS CONSULTA TAB (structured NOM-004 notes) */}
        <TabsContent value="consulta" className="space-y-4">
          <h3 className="text-lg font-semibold">Notas de consulta</h3>
          <ConsultaNotesList customer={customer} />
        </TabsContent>

        {/* RECETAS TAB */}
        <TabsContent value="recetas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Recetas médicas</h3>
            {!isNurse && (
              <Button onClick={openRxDialog} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Nueva Receta
              </Button>
            )}
          </div>

          {prescriptions.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
              <Pill className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay recetas registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prescriptions.map(rx => {
                const meds = Array.isArray(rx.medications) && rx.medications.length > 0
                  ? rx.medications
                  : rx.medication ? [{ medication: rx.medication, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration, notes: rx.notes }] : [];
                return (
                  <div key={rx.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Pill className="w-4 h-4 text-teal-600" />
                          <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{rx.prescription_number}</span>
                          <Badge className={statusConfig[rx.status]?.className || 'bg-gray-100'}>
                            {statusConfig[rx.status]?.label || rx.status}
                          </Badge>
                          <span className="text-xs text-slate-400">{formatDate(rx.created_at)}</span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {meds.map((med, i) => (
                            <div key={i} className="text-sm">
                              <span className="font-semibold text-slate-900">{med.medication}</span>
                              {(med.dosage || med.frequency || med.duration) && (
                                <span className="text-slate-500">
                                  {med.dosage && ` · ${med.dosage}`}
                                  {med.frequency && ` · ${med.frequency}`}
                                  {med.duration && ` · ${med.duration}`}
                                </span>
                              )}
                              {med.notes && <p className="text-xs text-slate-400 italic">{med.notes}</p>}
                            </div>
                          ))}
                        </div>
                        {(rx.height_cm || rx.weight_kg) && (
                          <p className="text-xs text-slate-400 mt-2">
                            {rx.height_cm && <span>Talla: {rx.height_cm} cm</span>}
                            {rx.height_cm && rx.weight_kg && ' · '}
                            {rx.weight_kg && <span>Peso: {rx.weight_kg} kg</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isNurse && (
                          <SignRecetaButton prescription={rx} customer={customer} onSigned={refetchPrescriptions} />
                        )}
                        <Button size="sm" variant="ghost" className="text-slate-500" title="Imprimir" onClick={() => setPrintRx(rx)}>
                          <Printer className="w-4 h-4" />
                        </Button>
                        {!isNurse && rx.status === 'active' && (
                          <Button size="sm" variant="ghost" className="text-red-600" title="Cancelar receta" onClick={() => handleCancelRx(rx)}>
                            <Ban className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* CITAS TAB */}
        <TabsContent value="citas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Citas</h3>
            <Button onClick={() => setApptDialogOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Nueva Cita
            </Button>
          </div>

          {appointments.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay citas registradas</p>
            </div>
          ) : (
            <div className="space-y-6">
              {upcomingAppts.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-500 mb-3">Próximas citas</h4>
                  <div className="space-y-2">
                    {upcomingAppts.map(ap => (
                      <div key={ap.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="font-medium">{formatDateTime(ap.appointment_date)}</span>
                            <Badge className={apptStatusConfig[ap.status]?.className}>
                              {apptStatusConfig[ap.status]?.label}
                            </Badge>
                            <Badge className={ap.type === 'video'
                              ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'}>
                              {ap.type === 'video' ? '📹 Teleconsulta' : '🏥 Presencial'}
                            </Badge>
                          </div>
                          {ap.notes && <p className="text-sm text-slate-500 mt-1">{ap.notes}</p>}
                          {ap.type === 'video' && ap.meeting_url && (
                            <button
                              onClick={() => window.open(ap.meeting_url_staff || ap.meeting_url, '_blank', 'noopener,noreferrer')}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1 flex items-center gap-1"
                            >
                              <Video className="w-3 h-3" /> Sala de video lista — unirse
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0 flex-wrap">
                          {renderApptActions(ap)}
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteAppt(ap.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {pastAppts.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-500 mb-3">Citas anteriores</h4>
                  <div className="space-y-2">
                    {pastAppts.map(ap => (
                      <div key={ap.id} className="bg-slate-50 rounded-xl border border-slate-100 p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="text-sm">{formatDateTime(ap.appointment_date)}</span>
                            <Badge className={apptStatusConfig[ap.status]?.className}>
                              {apptStatusConfig[ap.status]?.label}
                            </Badge>
                            {ap.type === 'video' && (
                              <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">📹 Teleconsulta</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0 flex-wrap">{renderApptActions(ap)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* COMPRAS TAB */}
        <TabsContent value="compras" className="space-y-4">
          <h3 className="text-lg font-semibold">Historial de compras</h3>
          {purchases.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
              <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay compras registradas</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Fecha</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Productos</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Total</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Folio</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchases.map(sale => (
                    <tr key={sale.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm">{formatDate(sale.timestamp)}</td>
                      <td className="px-4 py-3 text-sm">
                        {sale.sale_items?.map(i => i.name).join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{formatMXN(sale.total)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-500">
                        #{sale.id?.slice(-8).toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* NOTAS TAB */}
        <TabsContent value="notas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Notas médicas</h3>
            {!isNurse && (
              <Button onClick={() => { setNoteForm({ note: '' }); setNoteDialogOpen(true); }} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Nueva Nota
              </Button>
            )}
          </div>
          {notes.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay notas registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map(note => (
                <div key={note.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  {note.note?.startsWith('[Auto-reporte') && (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 mb-2">
                      Auto-reporte de kiosco — identidad por confirmar en recepción
                    </Badge>
                  )}
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.note}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {formatDateTime(note.created_at)}
                    {(note.author_name || note.profiles?.full_name) ? ` · registrada por ${note.author_name || note.profiles?.full_name}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ADJUNTOS TAB */}
        <TabsContent value="adjuntos">
          <AttachmentsTab customer={customer} />
        </TabsContent>

        {/* CONSENTIMIENTOS TAB */}
        <TabsContent value="consent">
          <ConsentTab customer={customer} />
        </TabsContent>
      </Tabs>

      {/* Prescription Dialog */}
      <Dialog open={rxDialogOpen} onOpenChange={setRxDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Receta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Medications */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Medicamentos *</Label>
                <Button size="sm" variant="outline" onClick={() => setRxForm({
                  ...rxForm,
                  medications: [...rxForm.medications, { medication: '', dosage: '', via: '', frequency: '', duration: '', notes: '' }]
                })}>
                  <Plus className="w-3 h-3 mr-1" /> Agregar medicamento
                </Button>
              </div>
              {rxForm.medications.map((med, idx) => (
                <div key={idx} className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Medicamento {idx + 1}</span>
                    {rxForm.medications.length > 1 && (
                      <Button size="sm" variant="ghost" className="text-red-600 h-6 px-2" onClick={() => {
                        const updated = rxForm.medications.filter((_, i) => i !== idx);
                        setRxForm({ ...rxForm, medications: updated });
                      }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Medication search with inventory autocomplete */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <Input
                        placeholder="Nombre del medicamento *"
                        value={med.medication}
                        className="pl-8"
                        onChange={(e) => {
                          const updated = [...rxForm.medications];
                          updated[idx].medication = e.target.value;
                          setRxForm({ ...rxForm, medications: updated });
                          setMedSearchOpen({ ...medSearchOpen, [idx]: true });
                        }}
                        onFocus={() => setMedSearchOpen({ ...medSearchOpen, [idx]: true })}
                        onBlur={() => {
                          // Small delay so click on dropdown item registers first
                          setTimeout(() => setMedSearchOpen(prev => ({ ...prev, [idx]: false })), 150);
                        }}
                      />
                      {medSearchOpen[idx] && med.medication.trim().length >= 1 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {(() => {
                            const q = med.medication.toLowerCase();
                            // Controlled items (Grupo II/III) are never suggested:
                            // they require a COFEPRIS foliada paper receta
                            const exactControlled = findControlledMed([med.medication], inventory);
                            const matches = inventory.filter(item =>
                              !item.controlled_group && item.name.toLowerCase().includes(q)
                            ).slice(0, 5);
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
                              const stockTextColor = item.quantity === 0 ? 'text-red-600 font-medium' : 'text-slate-500';
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    const updated = [...rxForm.medications];
                                    updated[idx].medication = item.name;
                                    setRxForm({ ...rxForm, medications: updated });
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
                                    <span className={`text-xs ${stockTextColor}`}>{stockText}</span>
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
                    <Input
                      placeholder="Dosis *"
                      value={med.dosage}
                      className={showRxMedErrors && !med.dosage.trim() ? 'border-red-500 ring-1 ring-red-500' : ''}
                      onChange={(e) => {
                        const updated = [...rxForm.medications];
                        updated[idx].dosage = e.target.value;
                        setRxForm({ ...rxForm, medications: updated });
                      }}
                    />
                    <Input
                      placeholder="Vía (oral, tópica, IM...) *"
                      value={med.via || ''}
                      className={showRxMedErrors && !(med.via || '').trim() ? 'border-red-500 ring-1 ring-red-500' : ''}
                      onChange={(e) => {
                        const updated = [...rxForm.medications];
                        updated[idx].via = e.target.value;
                        setRxForm({ ...rxForm, medications: updated });
                      }}
                    />
                    <Input
                      placeholder="Frecuencia *"
                      value={med.frequency}
                      className={showRxMedErrors && !med.frequency.trim() ? 'border-red-500 ring-1 ring-red-500' : ''}
                      onChange={(e) => {
                        const updated = [...rxForm.medications];
                        updated[idx].frequency = e.target.value;
                        setRxForm({ ...rxForm, medications: updated });
                      }}
                    />
                    <Input
                      placeholder="Duración"
                      value={med.duration}
                      onChange={(e) => {
                        const updated = [...rxForm.medications];
                        updated[idx].duration = e.target.value;
                        setRxForm({ ...rxForm, medications: updated });
                      }}
                    />
                  </div>
                  <Textarea
                    placeholder="Notas del medicamento..."
                    value={med.notes}
                    onChange={(e) => {
                      const updated = [...rxForm.medications];
                      updated[idx].notes = e.target.value;
                      setRxForm({ ...rxForm, medications: updated });
                    }}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>

            {/* Vitals */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Signos vitales y antropometría</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Edad" value={rxForm.edad} onChange={(e) => setRxForm({ ...rxForm, edad: e.target.value })} />
                <Input placeholder="Talla (cm)" value={rxForm.height_cm} onChange={(e) => setRxForm({ ...rxForm, height_cm: e.target.value })} />
                <Input placeholder="Peso (kg)" value={rxForm.weight_kg} onChange={(e) => setRxForm({ ...rxForm, weight_kg: e.target.value })} />
                <Input placeholder="Temp" value={rxForm.temperatura} onChange={(e) => setRxForm({ ...rxForm, temperatura: e.target.value })} />
                <Input placeholder="T/A" value={rxForm.ta} onChange={(e) => setRxForm({ ...rxForm, ta: e.target.value })} />
                <Input placeholder="FC" value={rxForm.fc} onChange={(e) => setRxForm({ ...rxForm, fc: e.target.value })} />
                <Input placeholder="FR" value={rxForm.fr} onChange={(e) => setRxForm({ ...rxForm, fr: e.target.value })} />
                <Input placeholder="So2%" value={rxForm.so2} onChange={(e) => setRxForm({ ...rxForm, so2: e.target.value })} />
                <Input placeholder="Glicemia" value={rxForm.glicemia} onChange={(e) => setRxForm({ ...rxForm, glicemia: e.target.value })} />
              </div>
              <Input placeholder="Alergias" value={rxForm.alergias} onChange={(e) => setRxForm({ ...rxForm, alergias: e.target.value })} />
              <Input type="date" placeholder="Próxima cita" value={rxForm.next_appointment} onChange={(e) => setRxForm({ ...rxForm, next_appointment: e.target.value })} />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRxDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={() => handleCreateRx(false)}>Guardar Receta</Button>
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
              <Button variant="outline" className="flex-1" onClick={() => setAllergyConflicts([])}>
                Volver y corregir
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => handleCreateRx(true)}>
                Continuar de todas formas
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* R2-35: consent gate — required documents must be signed first */}
      <Dialog open={missingConsents.length > 0} onOpenChange={(o) => { if (!o) setMissingConsents([]); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <FileSignature className="w-5 h-5" /> Consentimientos pendientes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Antes de guardar notas o emitir recetas, el paciente debe tener
              firmados los siguientes documentos:
            </p>
            <ul className="space-y-1.5">
              {missingConsents.map((t) => (
                <li key={t} className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800 font-medium">
                  {REQUIRED_CONSENT_LABELS[t] || t}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              Captura las firmas en la pestaña <strong>Consent.</strong> de este expediente.
            </p>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setMissingConsents([])}>
                Volver
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600"
                onClick={() => {
                  setMissingConsents([]);
                  setRxDialogOpen(false);
                  setNoteDialogOpen(false);
                  setActiveTab('consent');
                }}
              >
                Ir a Consentimientos
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Appointment Dialog */}
      <Dialog open={apptDialogOpen} onOpenChange={setApptDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Cita</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fecha y hora *</Label>
              <Input
                type="datetime-local"
                value={apptForm.appointment_date}
                onChange={(e) => setApptForm({ ...apptForm, appointment_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={apptForm.type} onValueChange={(v) => setApptForm({ ...apptForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">Presencial</SelectItem>
                  <SelectItem value="video">Video consulta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                placeholder="Motivo de la consulta..."
                value={apptForm.notes}
                onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setApptDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={handleCreateAppt}>Guardar Cita</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Nota Médica</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nota *</Label>
              <Textarea
                placeholder="Escribe la nota médica..."
                value={noteForm.note}
                onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })}
                rows={6}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setNoteDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={handleSaveNote}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Patient Edit Dialog */}
      <Dialog open={patientEditOpen} onOpenChange={setPatientEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar información del paciente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>CURP</Label>
              <Input
                placeholder="18 caracteres"
                value={patientForm.curp}
                onChange={(e) => {
                  setPatientForm({ ...patientForm, curp: e.target.value.toUpperCase() });
                  setCurpError('');
                }}
                className={curpError ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
              {curpError && <p className="text-xs text-red-600">{curpError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Sexo</Label>
                <Select
                  value={patientForm.sexo}
                  onValueChange={(v) => setPatientForm({ ...patientForm, sexo: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Mujer</SelectItem>
                    <SelectItem value="H">Hombre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entidad de nacimiento</Label>
                <Input
                  placeholder="Ej. Ciudad de México"
                  value={patientForm.birth_state}
                  onChange={(e) => setPatientForm({ ...patientForm, birth_state: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Talla (cm)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ej: 170"
                  value={patientForm.height}
                  onChange={(e) => setPatientForm({ ...patientForm, height: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ej: 70"
                  value={patientForm.weight}
                  onChange={(e) => setPatientForm({ ...patientForm, weight: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas generales</Label>
              <Textarea
                placeholder="Notas sobre el paciente..."
                value={patientForm.notes}
                onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setPatientEditOpen(false)}>Cancelar</Button>
              <Button
                className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600"
                onClick={handleUpdatePatient}
                disabled={savingPatient}
              >
                {savingPatient ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-visit form when completing a consulta */}
      <PostVisitDialog
        open={postVisitOpen}
        onOpenChange={setPostVisitOpen}
        appointment={postVisitAppt}
        onSaved={refetchAfterConsulta}
        onGoToConsents={() => setActiveTab('consent')}
      />

      {/* Justificante médico generator */}
      <JustificanteDialog
        open={justificanteOpen}
        onOpenChange={setJustificanteOpen}
        customer={customer}
      />

      {/* Historia clínica de primera vez (NOM-004 6.1): capture + read-only view */}
      <HistoriaClinicaModal
        open={historiaOpen}
        onOpenChange={setHistoriaOpen}
        customer={customer}
        onSaved={() => { setNeedsHistoria(false); refetchHistoriaGate(); }}
      />
      <HistoriaClinicaModal
        open={historiaViewOpen}
        onOpenChange={setHistoriaViewOpen}
        customer={customer}
        readOnly
        historia={historia}
      />

      {/* Print Prescription Dialog */}
      <Dialog open={!!printRx} onOpenChange={() => setPrintRx(null)}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista previa de receta</DialogTitle>
          </DialogHeader>
          {printRx && <PrintablePrescription prescription={printRx} customer={customer} />}
          <div className="flex justify-end gap-2 no-print">
            <Button variant="outline" onClick={() => setPrintRx(null)}>Cerrar</Button>
            <Button variant="outline" onClick={() => downloadPrescriptionPDF(printRx, customer, `Receta_${printRx?.prescription_number || 'sinfolio'}.pdf`)}>
              <FileDown className="w-4 h-4 mr-2" /> Descargar PDF
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" /> Imprimir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientWorkspace;
