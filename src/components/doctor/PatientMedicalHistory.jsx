import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, CheckCircle, XCircle, AlertTriangle,
  HeartPulse, Activity, Users, Baby, Syringe, Stethoscope, ClipboardList,
  History, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { updateCustomer, saveMedicalHistoryVersion, getMedicalHistoryVersions } from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { toast } from 'sonner';

// Section definitions — order matches the clinical-history reference layout.
const SECTIONS = [
  {
    key: 'alergias',
    title: 'Alergias',
    icon: AlertTriangle,
    isAllergy: true,
    suggestions: ['Alergias a Medicamentos', 'Alergias a Alimentos', 'Alergias Ambientales', 'Otras Alergias'],
  },
  {
    key: 'patologicos',
    title: 'Antecedentes Patológicos',
    icon: HeartPulse,
    suggestions: [
      'Antecedentes Negados', 'Hospitalización Previa', 'Cirugías Previas', 'Diabetes',
      'Enfermedades Tiroideas', 'Hipertensión Arterial', 'Cardiopatías', 'Traumatismos',
      'Cáncer', 'Tuberculosis', 'Transfusiones', 'Patologías Respiratorias',
      'Patologías Gastrointestinales', 'Enfermedades de Transmisión Sexual',
      'Enfermedad Renal Crónica', 'Otros',
    ],
  },
  {
    key: 'no_patologicos',
    title: 'Antecedentes No Patológicos',
    icon: Activity,
    suggestions: [
      'Antecedentes Negados', 'Actividad Física', 'Tabaquismo', 'Alcoholismo',
      'Uso de otras sustancias (Drogas)', 'Vacuna o Inmunización reciente', 'Otros',
    ],
  },
  {
    key: 'heredofamiliares',
    title: 'Antecedentes Heredofamiliares',
    icon: Users,
    suggestions: [
      'Antecedentes Negados', 'Diabetes', 'Hipertensión Arterial', 'Cardiopatías',
      'Enfermedades Tiroideas', 'Enfermedad Renal Crónica', 'Cáncer', 'Otros',
    ],
  },
  {
    key: 'gineco_obstetricos',
    title: 'Antecedentes Gineco-Obstétricos',
    icon: Baby,
    suggestions: [
      'Antecedentes Negados', 'Embarazos', 'Último Papanicolau', 'Última Mastografía',
      'Menarca', 'Ciclos Menstruales', 'Método Anticonceptivo', 'Otros',
    ],
  },
  {
    key: 'vacunacion',
    title: 'Esquema de Vacunación',
    icon: Syringe,
    suggestions: [
      'Esquema Completo', 'COVID-19', 'Influenza', 'Tétanos', 'Hepatitis B',
      'SRP (Sarampión/Rubéola/Paperas)', 'Neumococo', 'Otra',
    ],
  },
  {
    key: 'perinatales',
    title: 'Antecedentes Perinatales',
    icon: ClipboardList,
    suggestions: [
      'Antecedentes Negados', 'Tipo de Nacimiento', 'Peso al Nacer', 'Semanas de Gestación',
      'Complicaciones Neonatales', 'Lactancia', 'Otros',
    ],
  },
];

const EMPTY_ENTRY = { label: '', value: '', status: 'positive' };

const PatientMedicalHistory = ({ customer, onSaved }) => {
  const { user } = useAuth();
  const readOnly = user?.role === 'nurse';
  const history = customer?.medical_history || {};
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(null); // section key being edited
  const [editIndex, setEditIndex] = useState(null); // null = adding new
  const [entryForm, setEntryForm] = useState(EMPTY_ENTRY);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!customer?.id) return;
    try {
      const data = await getMedicalHistoryVersions(customer.id);
      setVersions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('getMedicalHistoryVersions failed:', err);
    }
  }, [customer?.id]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const formatVersionDate = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getEntries = (sectionKey) => {
    const entries = history[sectionKey];
    return Array.isArray(entries) ? entries : [];
  };

  const openAdd = (sectionKey) => {
    setActiveSection(sectionKey);
    setEditIndex(null);
    setEntryForm(EMPTY_ENTRY);
    setDialogOpen(true);
  };

  const openEdit = (sectionKey, index) => {
    const entry = getEntries(sectionKey)[index];
    setActiveSection(sectionKey);
    setEditIndex(index);
    setEntryForm({ label: entry.label, value: entry.value, status: entry.status || 'positive' });
    setDialogOpen(true);
  };

  const saveHistory = async (newHistory, successMessage, changeSummary) => {
    setSaving(true);
    try {
      await updateCustomer(customer.id, { medical_history: newHistory });
      // NOM-024 audit trail: snapshot every change, never silently overwrite
      try {
        await saveMedicalHistoryVersion({
          customerId: customer.id,
          snapshot: newHistory,
          changeSummary,
        });
        loadVersions();
      } catch (versionErr) {
        console.error('saveMedicalHistoryVersion failed:', versionErr);
        toast.error('El historial se guardó, pero falló el registro de versión');
      }
      logAudit({
        action: AUDIT_ACTIONS.HISTORY_UPDATE,
        user,
        details: `${changeSummary} — paciente ${customer?.full_name || customer.id}`,
      });
      toast.success(successMessage);
      onSaved?.();
    } catch (err) {
      toast.error('Error guardando el historial');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEntry = async () => {
    if (!entryForm.label.trim()) {
      toast.error('La etiqueta es requerida');
      return;
    }
    if (entryForm.status === 'positive' && !entryForm.value.trim()) {
      toast.error('El detalle es requerido');
      return;
    }
    const entries = [...getEntries(activeSection)];
    const entry = {
      label: entryForm.label.trim(),
      value: entryForm.value.trim(),
      status: entryForm.status,
    };
    if (editIndex !== null) {
      entries[editIndex] = entry;
    } else {
      entries.push(entry);
    }
    const newHistory = { ...history, [activeSection]: entries };
    const sectionTitle = SECTIONS.find((s) => s.key === activeSection)?.title || activeSection;
    const changeSummary = editIndex !== null
      ? `${sectionTitle}: edited "${entry.label}"`
      : `${sectionTitle}: added "${entry.label}"`;
    setDialogOpen(false);
    await saveHistory(newHistory, editIndex !== null ? 'Entrada actualizada' : 'Entrada agregada', changeSummary);
  };

  const handleDeleteEntry = async (sectionKey, index) => {
    if (!confirm('¿Eliminar esta entrada del historial?')) return;
    const deleted = getEntries(sectionKey)[index];
    const entries = getEntries(sectionKey).filter((_, i) => i !== index);
    const newHistory = { ...history, [sectionKey]: entries };
    const sectionTitle = SECTIONS.find((s) => s.key === sectionKey)?.title || sectionKey;
    const changeSummary = `${sectionTitle}: deleted "${deleted?.label || ''}"`;
    await saveHistory(newHistory, 'Entrada eliminada', changeSummary);
  };

  const activeSectionConfig = SECTIONS.find((s) => s.key === activeSection);

  return (
    <div className="space-y-4">
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const entries = getEntries(section.key);
        return (
          <div key={section.key} className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm tracking-wide text-teal-700 flex items-center gap-2 uppercase">
                <Icon className="w-4 h-4" />
                {section.title}
              </h3>
              {!readOnly && (
                <Button size="sm" variant="outline" onClick={() => openAdd(section.key)}>
                  <Plus className="w-3 h-3 mr-1" /> Agregar
                </Button>
              )}
            </div>

            {entries.length === 0 ? (
              <p className="text-sm text-slate-400">Sin entradas registradas.</p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, index) => {
                  const isDenied = entry.status === 'denied';
                  const row = (
                    <div className="flex items-start justify-between gap-4 text-sm">
                      <div className="flex items-start gap-2 min-w-0">
                        {isDenied ? (
                          <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className={`font-medium ${isDenied ? 'text-red-700' : 'text-slate-900'}`}>
                            {entry.label}
                          </span>
                          {entry.value && (
                            <span className="text-slate-600"> — {entry.value}</span>
                          )}
                        </div>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => openEdit(section.key, index)}
                            className="text-apolo-navy hover:text-apolo-navy-dark p-1"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(section.key, index)}
                            className="text-red-600 hover:text-red-800 p-1"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );

                  // Allergy entries render inside a red warning box (like the reference layout)
                  return section.isAllergy && !isDenied ? (
                    <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                      {row}
                    </div>
                  ) : (
                    <div key={index} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                      {row}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Change history (NOM-024 versioned audit trail) */}
      <div className="bg-white rounded-xl border border-slate-200">
        <button
          type="button"
          className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
          onClick={() => setVersionsOpen(!versionsOpen)}
        >
          <span className="flex items-center gap-2">
            <History className="w-4 h-4 text-teal-600" />
            Historial de cambios
            {versions.length > 0 && (
              <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{versions.length}</span>
            )}
          </span>
          {versionsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {versionsOpen && (
          <div className="px-6 pb-4 space-y-2">
            {versions.length === 0 ? (
              <p className="text-sm text-slate-400">Sin cambios registrados.</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="flex items-baseline justify-between gap-4 text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-slate-700 truncate">{v.change_summary || 'Cambio en el historial'}</p>
                    <p className="text-xs text-slate-400">{v.profiles?.full_name || 'Usuario desconocido'}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{formatVersionDate(v.created_at)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add / Edit entry dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editIndex !== null ? 'Editar entrada' : 'Agregar entrada'} — {activeSectionConfig?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Etiqueta *</Label>
              <Input
                list={`history-labels-${activeSection}`}
                placeholder="Ej. Diabetes, Alergias a Medicamentos..."
                value={entryForm.label}
                onChange={(e) => setEntryForm({ ...entryForm, label: e.target.value })}
              />
              <datalist id={`history-labels-${activeSection}`}>
                {(activeSectionConfig?.suggestions || []).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEntryForm({ ...entryForm, status: 'positive' })}
                  className={`flex items-center justify-center gap-2 p-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    entryForm.status === 'positive'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" /> Presente
                </button>
                <button
                  type="button"
                  onClick={() => setEntryForm({ ...entryForm, status: 'denied' })}
                  className={`flex items-center justify-center gap-2 p-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    entryForm.status === 'denied'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <XCircle className="w-4 h-4" /> Negado
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Detalle {entryForm.status === 'positive' ? '*' : '(opcional)'}</Label>
              <Textarea
                placeholder={
                  entryForm.status === 'denied'
                    ? 'Ej. lista de antecedentes negados...'
                    : 'Ej. Madre y abuela paterna con Diabetes...'
                }
                rows={3}
                value={entryForm.value}
                onChange={(e) => setEntryForm({ ...entryForm, value: e.target.value })}
              />
            </div>

            <Button
              onClick={handleSaveEntry}
              disabled={saving}
              className="w-full bg-gradient-to-r from-teal-500 to-emerald-600"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientMedicalHistory;
