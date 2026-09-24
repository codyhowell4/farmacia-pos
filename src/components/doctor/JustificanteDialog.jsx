import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { getDoctorProfile, uploadPatientDocument } from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { toast } from 'sonner';

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatLongDate = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

/**
 * Justificante médico (comprobante de atención) generator.
 * Prints a letterhead document with patient name and doctor data.
 *
 * Por indicación del equipo médico (2026-09): el reposo se sugiere solo de
 * forma CUALITATIVA ("reposo relativo") como sugerencia terapéutica. Nunca se
 * cuantifican días de descanso con fines de ausentismo laboral — el
 * justificante es un comprobante de atención, no una incapacidad; los
 * certificados de incapacidad corresponden a la seguridad social (ej. IMSS).
 */
const JustificanteDialog = ({ open, onOpenChange, customer }) => {
  const { user } = useAuth();
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [diagnostico, setDiagnostico] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!fecha) {
      toast.error('La fecha es obligatoria');
      return;
    }
    setGenerating(true);
    try {
      const profile = await getDoctorProfile(user?.id).catch(() => null);
      const doctorName = profile?.profiles?.full_name || user?.name || '';
      const cedula = profile?.license_number || '';
      const specialty = profile?.specialty || '';
      const patientName = customer?.full_name || '';

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Justificante médico — ${escapeHtml(patientName)}</title>
  <style>
    body { font-family: Georgia, serif; color: #111; max-width: 720px; margin: 40px auto; padding: 0 24px; }
    .letterhead { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 32px; }
    .letterhead h1 { margin: 0; font-size: 22px; color: #0f766e; }
    .letterhead p { margin: 4px 0 0; font-size: 12px; color: #555; }
    h2 { text-align: center; font-size: 16px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 32px; }
    .date { text-align: right; font-size: 13px; margin-bottom: 24px; }
    .body { font-size: 14px; line-height: 1.9; text-align: justify; }
    .note { font-size: 11.5px; color: #444; border-top: 1px solid #ccc; margin-top: 28px; padding-top: 10px; line-height: 1.6; }
    .sig { margin-top: 80px; text-align: center; }
    .sig-line { border-top: 1px solid #111; width: 320px; margin: 0 auto 6px; }
    .sig p { margin: 2px 0; font-size: 12px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="letterhead">
    <h1>Farmacia Apollo — Consultorio Médico</h1>
    <p>Tel. 55-2483-7003 &nbsp;·&nbsp; Lunes a Viernes 10 a 20 hrs &nbsp;·&nbsp; Sábado 11 a 19 hrs</p>
  </div>
  <h2>Justificante Médico</h2>
  <p class="date">Ciudad de México, a ${escapeHtml(formatLongDate(fecha))}</p>
  <div class="body">
    <p>Por medio del presente se hace constar que el(la) paciente <strong>${escapeHtml(patientName)}</strong>
    fue valorado(a) en este consultorio en la fecha señalada${diagnostico.trim() ? `, con diagnóstico de <strong>${escapeHtml(diagnostico.trim())}</strong>` : ''}.</p>
    <p>Como parte integral del tratamiento, se sugiere <strong>reposo relativo</strong> a partir del
    ${escapeHtml(formatLongDate(fecha))}, como sugerencia terapéutica.</p>
    <p>Se extiende el presente justificante a petición del interesado para los usos que a su conveniencia convengan.</p>
    <p class="note">El presente documento es un comprobante de atención médica y no constituye una
    incapacidad laboral; su validez como justificante de inasistencia queda a discreción del empleador
    o de la institución educativa. Los certificados de incapacidad corresponden a la institución de
    seguridad social correspondiente (ej. IMSS), ante quien deberá gestionarse dicho trámite.</p>
  </div>
  <div class="sig">
    <div class="sig-line"></div>
    <p><strong>${escapeHtml(doctorName)}</strong></p>
    ${specialty ? `<p>${escapeHtml(specialty)}</p>` : ''}
    ${cedula ? `<p>Céd. Prof. ${escapeHtml(cedula)}</p>` : ''}
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

      const win = window.open('', '_blank');
      if (!win) {
        toast.error('El navegador bloqueó la ventana de impresión');
        return;
      }
      win.document.write(html);
      win.document.close();

      // Save a copy to the expediente (Adjuntos) — the justificante is part of
      // the clinical record and must be retained.
      if (customer?.id) {
        try {
          const copy = new File([html], `justificante_${fecha}.html`, { type: 'text/html' });
          await uploadPatientDocument(customer.id, copy, {
            documentType: 'justificante',
            notes: `Reposo relativo sugerido a partir del ${formatLongDate(fecha)} — ${doctorName}`,
          });
        } catch (copyErr) {
          console.error('Justificante copy save failed:', copyErr);
          toast.error('Se generó el justificante, pero la copia no se pudo guardar en el expediente');
        }
      }

      logAudit({
        action: AUDIT_ACTIONS.RECORD_EXPORT,
        user,
        details: `Justificante médico generado (reposo relativo, sin días cuantificados) — paciente ${patientName}`,
      });
      onOpenChange(false);
    } catch (err) {
      console.error('Justificante generation failed:', err);
      toast.error('Error generando justificante');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Justificante médico — {customer?.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fecha *</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Diagnóstico (opcional)</Label>
            <Textarea
              placeholder="Ej. Infección de vías respiratorias altas..."
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
              rows={3}
            />
          </div>
          <p className="text-xs text-slate-500">
            El justificante sugiere <strong>reposo relativo</strong> de forma cualitativa, como
            sugerencia terapéutica. No cuantifica días de descanso ni sustituye una incapacidad
            del IMSS: es un comprobante de atención cuya validez como justificante de inasistencia
            queda a discreción del empleador o escuela.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={generating}>
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600"
              onClick={handleGenerate}
              disabled={generating}
            >
              <Printer className="w-4 h-4 mr-1" />
              {generating ? 'Generando...' : 'Generar e imprimir'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JustificanteDialog;
