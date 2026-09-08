import { useState, useEffect, useCallback } from 'react';
import { FileSignature, Plus, Printer, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { createConsentDocument, getConsentDocuments, updateConsentStatus } from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  signed: { label: 'Firmado', className: 'bg-green-100 text-green-800' },
  declined: { label: 'Rechazado', className: 'bg-red-100 text-red-800' },
};

const TYPE_LABELS = {
  general: 'General',
  teleconsulta: 'Teleconsulta',
  procedimiento: 'Procedimiento',
  otro: 'Otro',
};

const DEFAULT_TITLES = {
  general: 'Consentimiento informado general',
  teleconsulta: 'Consentimiento informado para teleconsulta',
  procedimiento: 'Consentimiento informado para procedimiento',
  otro: 'Consentimiento informado',
};

// NOM-004 consentimiento informado template (10.1)
const buildTemplate = (patientName) => `CONSENTIMIENTO INFORMADO

Yo, ${patientName || '_________________________'}, por mi propio derecho y en pleno uso de mis facultades, declaro que el(la) médico tratante me ha informado de manera clara, veraz y suficiente lo siguiente:

1. Naturaleza y propósito del procedimiento/tratamiento: [describir el procedimiento o tratamiento].
2. Riesgos y complicaciones posibles: [describir los riesgos frecuentes y graves].
3. Beneficios esperados: [describir los beneficios esperados].
4. Alternativas de tratamiento existentes, así como las consecuencias previsibles de no realizar el procedimiento/tratamiento.

Manifiesto que tuve la oportunidad de formular preguntas y que todas fueron respondidas a mi entera satisfacción.

Por lo anterior, otorgo mi consentimiento libre e informado para la realización del procedimiento/tratamiento descrito.

Lugar y fecha: _________________________________`;

const formatDate = (ts) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
};

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Informed-consent documents (consent_documents) for a patient.
 */
const ConsentTab = ({ customer }) => {
  const { user } = useAuth();
  const readOnly = user?.role === 'nurse';
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: 'general', title: DEFAULT_TITLES.general, content: '' });

  const load = useCallback(async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const data = await getConsentDocuments(customer.id);
      setConsents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('getConsentDocuments failed:', err);
      toast.error('Error cargando consentimientos');
    } finally {
      setLoading(false);
    }
  }, [customer?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm({
      type: 'general',
      title: DEFAULT_TITLES.general,
      content: buildTemplate(customer?.full_name),
    });
    setDialogOpen(true);
  };

  const handleTypeChange = (type) => {
    setForm((prev) => ({
      ...prev,
      type,
      // Keep a user-edited title; refresh only if it was one of the defaults
      title: Object.values(DEFAULT_TITLES).includes(prev.title) ? DEFAULT_TITLES[type] : prev.title,
    }));
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('El título y el contenido son obligatorios');
      return;
    }
    setSaving(true);
    try {
      await createConsentDocument({
        customer_id: customer.id,
        type: form.type,
        title: form.title.trim(),
        content: form.content,
        status: 'pending',
      });
      logAudit({
        action: AUDIT_ACTIONS.CONSENT_CREATE,
        user,
        details: `Consentimiento "${form.title.trim()}" (${form.type}) creado — paciente ${customer?.full_name || ''}`,
      });
      toast.success('Consentimiento creado');
      setDialogOpen(false);
      load();
    } catch (err) {
      console.error('createConsentDocument failed:', err);
      toast.error(err.message || 'Error creando consentimiento');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkSigned = async (doc) => {
    const signer = window.prompt(
      'Nombre completo de quien firma (paciente o tutor):',
      customer?.full_name || ''
    );
    if (signer === null) return;
    if (!signer.trim()) {
      toast.error('El nombre del firmante es obligatorio');
      return;
    }
    try {
      await updateConsentStatus(doc.id, { status: 'signed', signer_name: signer.trim() });
      logAudit({
        action: AUDIT_ACTIONS.CONSENT_STATUS,
        user,
        details: `Consentimiento "${doc.title}" marcado como firmado por ${signer.trim()} — paciente ${customer?.full_name || ''}`,
      });
      toast.success('Consentimiento marcado como firmado');
      load();
    } catch (err) {
      console.error('updateConsentStatus failed:', err);
      toast.error('Error actualizando consentimiento');
    }
  };

  const handleDeclined = async (doc) => {
    if (!confirm(`¿Marcar como rechazado el consentimiento "${doc.title}"?`)) return;
    try {
      await updateConsentStatus(doc.id, { status: 'declined' });
      logAudit({
        action: AUDIT_ACTIONS.CONSENT_STATUS,
        user,
        details: `Consentimiento "${doc.title}" rechazado — paciente ${customer?.full_name || ''}`,
      });
      toast.success('Consentimiento marcado como rechazado');
      load();
    } catch (err) {
      console.error('updateConsentStatus failed:', err);
      toast.error('Error actualizando consentimiento');
    }
  };

  const handlePrint = (doc) => {
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('El navegador bloqueó la ventana de impresión');
      return;
    }
    const signatureLine = (label, name) => `
      <div class="sig-block">
        <div class="sig-line"></div>
        <p class="sig-label">${escapeHtml(label)}</p>
        ${name ? `<p class="sig-name">${escapeHtml(name)}</p>` : ''}
      </div>`;
    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(doc.title)}</title>
  <style>
    body { font-family: Georgia, serif; color: #111; max-width: 720px; margin: 40px auto; padding: 0 24px; }
    .letterhead { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 24px; }
    .letterhead h1 { margin: 0; font-size: 20px; color: #0f766e; }
    .letterhead p { margin: 4px 0 0; font-size: 12px; color: #555; }
    h2 { text-align: center; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; }
    .content { white-space: pre-wrap; font-size: 13px; line-height: 1.7; margin: 24px 0 48px; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px 40px; margin-top: 64px; }
    .sig-line { border-top: 1px solid #111; margin-bottom: 6px; }
    .sig-label { margin: 0; font-size: 11px; text-transform: uppercase; color: #444; text-align: center; }
    .sig-name { margin: 2px 0 0; font-size: 12px; text-align: center; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="letterhead">
    <h1>Farmacia Apollo — Consultorio Médico</h1>
    <p>Consentimiento informado (NOM-004-SSA3-2012)</p>
  </div>
  <h2>${escapeHtml(doc.title)}</h2>
  <div class="content">${escapeHtml(doc.content)}</div>
  <div class="sig-grid">
    ${signatureLine('Firma del paciente o tutor', customer?.full_name)}
    ${signatureLine('Firma del médico tratante', user?.name)}
    ${signatureLine('Testigo 1')}
    ${signatureLine('Testigo 2')}
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
    win.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Consentimientos informados</h3>
        {!readOnly && (
          <Button onClick={openNew} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Nuevo consentimiento
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : consents.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
          <FileSignature className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No hay consentimientos registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {consents.map((doc) => {
            const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileSignature className="w-4 h-4 text-teal-600" />
                      <span className="font-medium text-slate-900">{doc.title}</span>
                      <Badge className="bg-slate-100 text-slate-700">{TYPE_LABELS[doc.type] || doc.type}</Badge>
                      <Badge className={cfg.className}>{cfg.label}</Badge>
                      <span className="text-xs text-slate-400">{formatDate(doc.created_at)}</span>
                    </div>
                    {doc.status === 'signed' && (
                      <p className="text-xs text-slate-500 mt-1">
                        Firmado por {doc.signer_name || '-'} — {formatDateTime(doc.signed_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="text-slate-500" title="Imprimir" onClick={() => handlePrint(doc)}>
                      <Printer className="w-4 h-4" />
                    </Button>
                    {!readOnly && doc.status === 'pending' && (
                      <>
                        <Button size="sm" variant="ghost" className="text-green-700" title="Marcar firmado" onClick={() => handleMarkSigned(doc)}>
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600" title="Rechazado" onClick={() => handleDeclined(doc)}>
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New consent dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo consentimiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={handleTypeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="teleconsulta">Teleconsulta</SelectItem>
                    <SelectItem value="procedimiento">Procedimiento</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contenido *</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={16}
                className="text-sm font-mono"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? 'Guardando...' : 'Guardar consentimiento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConsentTab;
