import { useState, useEffect, useCallback, useRef } from 'react';
import { Paperclip, Upload, Eye, FileImage, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { getCustomerDocuments, uploadPatientDocument, getPatientDocumentUrl } from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { toast } from 'sonner';

const TYPE_CONFIG = {
  laboratorio: { label: 'Laboratorio', className: 'bg-blue-100 text-blue-800' },
  imagen: { label: 'Imagen', className: 'bg-purple-100 text-purple-800' },
  consentimiento: { label: 'Consentimiento', className: 'bg-amber-100 text-amber-800' },
  otro: { label: 'Otro', className: 'bg-slate-100 text-slate-700' },
};

const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;

const formatDate = (ts) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Storage path is {orgId}/{customerId}/{ts}_{name} — show just the file name
const fileNameFromPath = (path) => {
  const base = (path || '').split('/').pop() || 'documento';
  return base.replace(/^\d+_/, '');
};

// Lazily resolves a signed URL for image thumbnails (private bucket)
const DocThumbnail = ({ doc, onView }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    getPatientDocumentUrl(doc.file_url)
      .then((u) => live && setUrl(u))
      .catch(() => {});
    return () => { live = false; };
  }, [doc.file_url]);

  if (!url) {
    return <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center"><FileImage className="w-5 h-5 text-slate-300" /></div>;
  }
  return (
    <button type="button" onClick={() => onView(doc)} className="shrink-0" title="Ver imagen">
      <img src={url} alt={fileNameFromPath(doc.file_url)} className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
    </button>
  );
};

/**
 * Patient attachments (customer_documents + patient-documents bucket).
 */
const AttachmentsTab = ({ customer }) => {
  const { user } = useAuth();
  const readOnly = user?.role === 'nurse';
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('laboratorio');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const data = await getCustomerDocuments(customer.id);
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('getCustomerDocuments failed:', err);
      toast.error('Error cargando adjuntos');
    } finally {
      setLoading(false);
    }
  }, [customer?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async () => {
    if (!file) {
      toast.error('Selecciona un archivo');
      return;
    }
    setUploading(true);
    try {
      await uploadPatientDocument(customer.id, file, {
        documentType: docType,
        notes: note.trim() || null,
      });
      logAudit({
        action: AUDIT_ACTIONS.ATTACHMENT_UPLOAD,
        user,
        details: `Documento "${file.name}" (${docType}) subido — paciente ${customer?.full_name || ''}`,
      });
      toast.success('Documento subido');
      setFile(null);
      setNote('');
      setDocType('laboratorio');
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } catch (err) {
      console.error('uploadPatientDocument failed:', err);
      toast.error(err.message || 'Error subiendo documento');
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (doc) => {
    try {
      const url = await getPatientDocumentUrl(doc.file_url);
      if (url) window.open(url, '_blank', 'noopener');
      else toast.error('No se pudo generar el enlace del documento');
    } catch (err) {
      console.error('getPatientDocumentUrl failed:', err);
      toast.error('Error abriendo documento');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Documentos adjuntos</h3>
      </div>

      {!readOnly && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue placeholder="Tipo de documento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="laboratorio">Laboratorio</SelectItem>
                <SelectItem value="imagen">Imagen</SelectItem>
                <SelectItem value="consentimiento">Consentimiento</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Nota (opcional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="sm:col-span-2"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="w-4 h-4 mr-1" />
              {file ? file.name : 'Seleccionar archivo'}
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={uploading || !file}
              className="bg-gradient-to-r from-teal-500 to-emerald-600"
            >
              <Upload className="w-4 h-4 mr-1" />
              {uploading ? 'Subiendo...' : 'Subir'}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
          <Paperclip className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No hay documentos adjuntos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const cfg = TYPE_CONFIG[doc.document_type] || TYPE_CONFIG.otro;
            const isImage = IMAGE_RE.test(doc.file_url || '');
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
                {isImage ? (
                  <DocThumbnail doc={doc} onView={handleView} />
                ) : (
                  <div className="w-16 h-16 bg-slate-50 rounded-lg flex items-center justify-center shrink-0 border border-slate-100">
                    <FileText className="w-6 h-6 text-slate-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cfg.className}>{cfg.label}</Badge>
                    <span className="text-xs text-slate-400">{formatDate(doc.created_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 mt-1 truncate">{fileNameFromPath(doc.file_url)}</p>
                  {doc.notes && <p className="text-xs text-slate-500 mt-0.5">{doc.notes}</p>}
                </div>
                <Button size="sm" variant="ghost" className="text-slate-500 shrink-0" onClick={() => handleView(doc)}>
                  <Eye className="w-4 h-4 mr-1" /> Ver
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AttachmentsTab;
