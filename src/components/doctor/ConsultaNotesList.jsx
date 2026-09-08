import { useState, useEffect, useCallback } from 'react';
import { FileText, FileDown, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { getConsultaNotesByCustomer } from '@/lib/db';
import { buildConsultaCda, downloadCda } from '@/lib/cda';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { toast } from 'sonner';

const formatDateTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
};

// consulta_notes is append-only: edits insert a new row with replaces_id
// pointing at the previous version. Version number = position in the chain.
const computeVersions = (notes) => {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const versions = new Map();
  const versionOf = (note, seen = new Set()) => {
    if (versions.has(note.id)) return versions.get(note.id);
    if (!note.replaces_id || seen.has(note.id)) return 1;
    seen.add(note.id);
    const parent = byId.get(note.replaces_id);
    const v = parent ? versionOf(parent, seen) + 1 : 1;
    versions.set(note.id, v);
    return v;
  };
  notes.forEach((n) => versions.set(n.id, versionOf(n)));
  return versions;
};

const Section = ({ label, children }) =>
  children ? (
    <div className="text-sm">
      <span className="font-semibold text-slate-700">{label}:</span>{' '}
      <span className="text-slate-600 whitespace-pre-wrap">{children}</span>
    </div>
  ) : null;

/**
 * Structured NOM-004 consulta notes for a patient (read-only list).
 */
const ConsultaNotesList = ({ customer }) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const data = await getConsultaNotesByCustomer(customer.id);
      setNotes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('getConsultaNotesByCustomer failed:', err);
      toast.error('Error cargando notas de consulta');
    } finally {
      setLoading(false);
    }
  }, [customer?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExportCda = (note) => {
    try {
      const doctorName = note.profiles?.full_name || user?.name || '';
      const xml = buildConsultaCda({ note, customer, doctorName });
      downloadCda(xml, `CDA_consulta_${note.id}.xml`);
      logAudit({
        action: AUDIT_ACTIONS.RECORD_EXPORT,
        user,
        details: `Nota de consulta ${note.id} exportada a CDA — paciente ${customer?.full_name || ''}`,
      });
    } catch (err) {
      console.error('CDA export failed:', err);
      toast.error('Error exportando CDA');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">No hay notas de consulta registradas</p>
      </div>
    );
  }

  const versions = computeVersions(notes);

  return (
    <div className="space-y-3">
      {notes.map((note) => {
        const cie10 = Array.isArray(note.cie10_codes) ? note.cie10_codes : [];
        return (
          <div key={note.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Stethoscope className="w-4 h-4 text-teal-600" />
                  <span className="text-sm font-medium text-slate-900">{formatDateTime(note.created_at)}</span>
                  {note.profiles?.full_name && (
                    <span className="text-sm text-slate-500">— {note.profiles.full_name}</span>
                  )}
                  {note.replaces_id && (
                    <Badge className="bg-amber-100 text-amber-800">Versión {versions.get(note.id)}</Badge>
                  )}
                  {note.signed_at && (
                    <Badge className="bg-green-100 text-green-800">Firmada</Badge>
                  )}
                </div>

                <Section label="Padecimiento actual">{note.padecimiento_actual}</Section>
                <Section label="Diagnóstico">{note.diagnostico}</Section>

                {cie10.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">CIE-10:</span>
                    {cie10.map((c, i) => (
                      <span
                        key={`${c.code}-${i}`}
                        title={c.description || c.code}
                        className="inline-flex items-center text-xs bg-teal-50 text-teal-800 border border-teal-200 rounded-full px-2 py-0.5"
                      >
                        <span className="font-mono font-semibold">{c.code}</span>
                        {c.description && <span className="ml-1 truncate max-w-[16rem]">{c.description}</span>}
                      </span>
                    ))}
                  </div>
                )}

                <Section label="Plan">{note.plan}</Section>
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="text-slate-500 shrink-0"
                title="Exportar CDA"
                onClick={() => handleExportCda(note)}
              >
                <FileDown className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ConsultaNotesList;
