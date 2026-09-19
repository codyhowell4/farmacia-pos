import { useState, useEffect } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { createHistoriaClinica } from '@/lib/db';
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
 * Historia clínica de primera vez (NOM-004 6.1). One per patient, append-only
 * server-side: corrections are expressed as notas de evolución. With
 * `readOnly` + `historia` it renders the saved document instead of the form.
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

  useEffect(() => {
    if (!open) return;
    if (readOnly && historia) {
      setPadecimiento(historia.padecimiento_actual || '');
      setInterrogatorio(historia.interrogatorio_aparatos || '');
      setExploracion(historia.exploracion_fisica || '');
      setAntecedentes(historia.antecedentes_resumen || '');
      setDiagnostico(historia.diagnostico || '');
      return;
    }
    setPadecimiento('');
    setInterrogatorio('');
    setExploracion('');
    setAntecedentes(buildAntecedentesResumen(customer?.medical_history));
    setDiagnostico('');
  }, [open, readOnly, historia, customer?.medical_history]);

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
      });
      await logAudit({
        action: AUDIT_ACTIONS.CLINICAL_NOTE_CREATE,
        user,
        details: `Historia clínica de primera vez (NOM-004 6.1) — paciente ${customer?.full_name || customer.id}`,
      });
      toast.success('Historia clínica guardada');
      onOpenChange(false);
      onSaved?.(created);
    } catch (err) {
      // unique(customer_id): the historia already exists (e.g. two tabs open)
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
          Documento de primera vez según la <strong>NOM-004 (6.1)</strong>. Se registra una
          sola vez por paciente y no puede modificarse: las correcciones se asientan
          como notas de evolución.
          {readOnly && historia?.created_at && (
            <span className="block mt-1">
              Registrada el {new Date(historia.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
              {historia?.profiles?.full_name ? ` por ${historia.profiles.full_name}` : ''}
            </span>
          )}
        </div>

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
            {!readOnly && (
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
                {saving ? 'Guardando...' : 'Guardar historia clínica'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HistoriaClinicaModal;
