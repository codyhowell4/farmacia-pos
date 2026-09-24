import { useState, useEffect, useRef } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  createHistoriaClinica, getHistoriaDraft, saveHistoriaDraft, deleteHistoriaDraft
} from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { HISTORY_SECTION_TITLES } from '@/lib/recordExport';
import { toast } from 'sonner';

// Plain-text rendering of the customers.medical_history jsonb, used to prefill
// the Antecedentes (resumen) section so the doctor edits instead of retyping.
export const buildAntecedentesResumen = (history = {}) => {
  const lines = [];
  Object.entries(HISTORY_SECTION_TITLES).forEach(([key, title]) => {
    const entries = Array.isArray(history[key]) ? history[key] : [];
    if (entries.length === 0) return;
    const items = entries.map((e) =>
      `${e.label}${e.value ? ` — ${e.value}` : ''}${e.status === 'denied' ? ' (negado)' : ''}`);
    lines.push(`${title}: ${items.join('; ')}`);
  });
  return lines.join('\n');
};

/**
 * Historia clínica de primera vez (NOM-004 6.1). Append-only and versioned:
 * the original is never modified — updates are saved as new versions with
 * replaces_id pointing at the previous one, and every version is preserved.
 * Modes: capture (no historia yet), version edit (`historia`, editable),
 * view (`readOnly` + `historia`). While capturing/editing, the working copy
 * autosaves to historia_drafts so the dialog can be closed without losing
 * progress; the draft is deleted when a version is saved.
 */
const HistoriaClinicaModal = ({
  open, onOpenChange, customer, onSaved, readOnly = false, historia = null,
}) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [padecimiento, setPadecimiento] = useState('');
  const [interrogatorio, setInterrogatorio] = useState('');
  const [exploracion, setExploracion] = useState('');
  const [antecedentes, setAntecedentes] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [draftRestoredAt, setDraftRestoredAt] = useState(null);
  const draftLoadedRef = useRef(false);

  const isVersionEdit = !readOnly && !!historia;

  useEffect(() => {
    if (!open) return;
    draftLoadedRef.current = false;
    setDraftRestoredAt(null);
    if (historia) {
      // View or version-edit: prefill from the given version
      setPadecimiento(historia.padecimiento_actual || '');
      setInterrogatorio(historia.interrogatorio_aparatos || '');
      setExploracion(historia.exploracion_fisica || '');
      setAntecedentes(historia.antecedentes_resumen || '');
      setDiagnostico(historia.diagnostico || '');
    } else {
      setPadecimiento('');
      setInterrogatorio('');
      setExploracion('');
      setAntecedentes(buildAntecedentesResumen(customer?.medical_history));
      setDiagnostico('');
    }
    // Restore any autosaved borrador — it is newer than the prefill above
    if (!readOnly && customer?.id) {
      getHistoriaDraft(customer.id)
        .then((draft) => {
          const p = draft?.payload;
          if (p) {
            setPadecimiento(p.padecimiento || '');
            setInterrogatorio(p.interrogatorio || '');
            setExploracion(p.exploracion || '');
            setAntecedentes(p.antecedentes || '');
            setDiagnostico(p.diagnostico || '');
            setDraftRestoredAt(draft.updated_at || draft.created_at || null);
          }
        })
        .catch((err) => console.error('getHistoriaDraft failed:', err))
        .finally(() => { draftLoadedRef.current = true; });
    } else {
      draftLoadedRef.current = true;
    }
  }, [open, readOnly, historia, customer?.medical_history, customer?.id]);

  // Autosave the working copy (debounced) — closing the dialog no longer
  // loses progress; the draft is deleted when a version is saved.
  useEffect(() => {
    if (!open || readOnly || !customer?.id || !user?.id || !draftLoadedRef.current) return undefined;
    const payload = { padecimiento, interrogatorio, exploracion, antecedentes, diagnostico };
    const hasContent = Object.values(payload).some((v) => (v || '').trim());
    if (!hasContent) return undefined;
    const timer = setTimeout(() => {
      saveHistoriaDraft({ customerId: customer.id, doctorId: user.id, payload })
        .catch((err) => console.error('historia draft autosave failed:', err));
    }, 1500);
    return () => clearTimeout(timer);
  }, [open, readOnly, customer?.id, user?.id, padecimiento, interrogatorio, exploracion, antecedentes, diagnostico]);

  const handleSave = async () => {
    if (!padecimiento.trim()) {
      toast.error('El padecimiento actual es obligatorio');
      return;
    }
    if (!interrogatorio.trim()) {
      toast.error('El interrogatorio por aparatos y sistemas es obligatorio');
      return;
    }
    if (!exploracion.trim()) {
      toast.error('La exploración física es obligatoria');
      return;
    }
    if (!diagnostico.trim()) {
      toast.error('El diagnóstico es obligatorio');
      return;
    }
    if (!customer?.id || !user?.id) return;
    setSaving(true);
    try {
      const created = await createHistoriaClinica({
        customer_id: customer.id,
        padecimiento_actual: padecimiento.trim(),
        interrogatorio_aparatos: interrogatorio.trim(),
        exploracion_fisica: exploracion.trim(),
        antecedentes_resumen: antecedentes.trim() || null,
        diagnostico: diagnostico.trim(),
        ...(isVersionEdit
          ? { replaces_id: historia.id, version: (historia.version || 1) + 1 }
          : {}),
      });
      await logAudit({
        action: AUDIT_ACTIONS.CLINICAL_NOTE_CREATE,
        user,
        details: isVersionEdit
          ? `Historia clínica versión ${created?.version || (historia.version || 1) + 1} (NOM-004 6.1) — paciente ${customer?.full_name || customer.id} — reemplaza versión ${historia.version || 1}`
          : `Historia clínica de primera vez (NOM-004 6.1) — paciente ${customer?.full_name || customer.id}`,
      });
      deleteHistoriaDraft(customer.id)
        .catch((err) => console.error('deleteHistoriaDraft failed:', err));
      toast.success(isVersionEdit ? 'Nueva versión guardada — la versión anterior se conserva' : 'Historia clínica guardada');
      onOpenChange(false);
      onSaved?.(created);
    } catch (err) {
      // unique(customer_id): legacy guard from the one-row-per-patient era
      if (err?.code === '23505') {
        toast.error('Este paciente ya tiene historia clínica');
      } else {
        toast.error(err.message || 'Error guardando la historia clínica');
      }
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const fieldProps = readOnly ? { readOnly: true, disabled: true, className: 'bg-slate-50' } : {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Historia clínica de primera vez — {customer?.full_name || 'Paciente'}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
          {readOnly ? (
            <>
              Documento de primera vez según la <strong>NOM-004 (6.1)</strong> — versión{' '}
              <strong>{historia?.version || 1}</strong>. Las versiones no pueden modificarse ni
              eliminarse: las actualizaciones se asientan como versiones nuevas.
            </>
          ) : isVersionEdit ? (
            <>
              Estás actualizando la historia clínica (documento vivo). Al guardar se crea la{' '}
              <strong>versión {(historia?.version || 1) + 1}</strong> con tu nombre y fecha; la
              versión anterior se conserva íntegra en el expediente (NOM-024, integridad y auditoría).
            </>
          ) : (
            <>
              Documento de primera vez según la <strong>NOM-004 (6.1)</strong>. Una vez guardado
              no puede modificarse ni eliminarse: las actualizaciones posteriores se registran
              como <strong>versiones nuevas</strong> y el historial completo se conserva.
            </>
          )}
          {historia?.created_at && (
            <span className="block mt-1">
              {isVersionEdit ? 'Versión actual registrada el ' : 'Registrada el '}
              {new Date(historia.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
              {historia?.profiles?.full_name ? ` por ${historia.profiles.full_name}` : ''}
            </span>
          )}
        </div>

        {draftRestoredAt && !readOnly && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Borrador restaurado</strong> (guardado el{' '}
            {new Date(draftRestoredAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}).
            Tu trabajo se guarda automáticamente mientras escribes — puedes cerrar esta ventana y continuar después.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <ClipboardList className="w-4 h-4" /> Padecimiento actual *
            </Label>
            <Textarea
              placeholder="Motivo de consulta, inicio y evolución del padecimiento actual..."
              value={padecimiento}
              onChange={(e) => setPadecimiento(e.target.value)}
              rows={3}
              {...fieldProps}
            />
          </div>

          <div className="space-y-2">
            <Label>Interrogatorio por aparatos y sistemas *</Label>
            <Textarea
              placeholder="Aparato digestivo, respiratorio, cardiovascular, genitourinario, musculoesquelético, nervioso, endócrino, piel y faneras..."
              value={interrogatorio}
              onChange={(e) => setInterrogatorio(e.target.value)}
              rows={4}
              {...fieldProps}
            />
          </div>

          <div className="space-y-2">
            <Label>Exploración física *</Label>
            <Textarea
              placeholder="Habitus exterior, cabeza, cuello, tórax, abdomen, extremidades, genitales. Signos vitales: T/A, FC, FR, Temp, So2%, peso, talla..."
              value={exploracion}
              onChange={(e) => setExploracion(e.target.value)}
              rows={4}
              {...fieldProps}
            />
          </div>

          <div className="space-y-2">
            <Label>Antecedentes (resumen)</Label>
            {!readOnly && !isVersionEdit && (
              <p className="text-xs text-slate-500">
                Precargado con los antecedentes registrados del paciente — revísalo y edítalo según la entrevista.
              </p>
            )}
            <Textarea
              placeholder="Resumen de antecedentes heredofamiliares, personales patológicos y no patológicos..."
              value={antecedentes}
              onChange={(e) => setAntecedentes(e.target.value)}
              rows={4}
              {...fieldProps}
            />
          </div>

          <div className="space-y-2">
            <Label>Diagnóstico *</Label>
            <Textarea
              placeholder="Diagnóstico clínico de primera vez..."
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
              rows={2}
              {...fieldProps}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              {readOnly ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!readOnly && (
              <Button
                className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Guardando...' : isVersionEdit ? 'Guardar nueva versión' : 'Guardar historia clínica'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HistoriaClinicaModal;
