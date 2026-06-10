import React, { useState, useEffect } from 'react';
import { Search, FileText, ExternalLink, UserCircle, Clock, FileImage, Pill, Eye, CheckCircle, XCircle, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getCustomerDocuments, updateCustomerDocumentStatus, createNotification } from '@/lib/db';

const statusConfig = {
  pending:    { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  reviewed:   { label: 'Revisada',  className: 'bg-blue-100 text-blue-800' },
  approved:   { label: 'Aprobada',  className: 'bg-green-100 text-green-800' },
  dispensed:  { label: 'Surtida',   className: 'bg-purple-100 text-purple-800' },
  rejected:   { label: 'Rechazada', className: 'bg-red-100 text-red-800' },
};

const StatusBadge = ({ status }) => {
  const s = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
};

const isRealFileUrl = (url) => {
  return url && typeof url === 'string' && url.startsWith('http');
};

const AdminPrescriptions = () => {
  const [documents, setDocuments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const { toast } = useToast();

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const data = await getCustomerDocuments();
      setDocuments(data);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las recetas médicas', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadDocuments(); }, []);

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);
    try {
      await updateCustomerDocumentStatus(id, newStatus);
      const doc = documents.find((d) => d.id === id);
      if (doc?.customers?.id) {
        try {
          await createNotification({
            customer_id: doc.customers.id,
            profile_id: doc.customers.profile_id,
            type: 'prescription',
            title: `Receta médica ${statusConfig[newStatus]?.label || newStatus}`,
            message: doc.notes ? `"${doc.notes.substring(0, 60)}"` : 'Tu receta médica ha sido actualizada.',
            related_id: id,
            related_table: 'customer_documents',
          });
        } catch (notifErr) {
          console.warn('[Notification] Failed to create:', notifErr);
        }
      }
      toast({ title: 'Estado actualizado', description: `Receta marcada como ${statusConfig[newStatus]?.label || newStatus}` });
      await loadDocuments();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = documents.filter((doc) => {
    const matchesSearch =
      (doc.customers?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.customers?.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (doc.status || 'pending') === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const nextActions = (status) => {
    switch (status) {
      case 'pending': return [
        { status: 'reviewed', label: 'Revisar', icon: Eye, variant: 'outline', className: 'border-blue-200 text-blue-700 hover:bg-blue-50' },
        { status: 'rejected', label: 'Rechazar', icon: XCircle, variant: 'outline', className: 'border-red-200 text-red-700 hover:bg-red-50' },
      ];
      case 'reviewed': return [
        { status: 'approved', label: 'Aprobar', icon: CheckCircle, variant: 'outline', className: 'border-green-200 text-green-700 hover:bg-green-50' },
        { status: 'rejected', label: 'Rechazar', icon: XCircle, variant: 'outline', className: 'border-red-200 text-red-700 hover:bg-red-50' },
      ];
      case 'approved': return [
        { status: 'dispensed', label: 'Marcar surtida', icon: Package, variant: 'outline', className: 'border-purple-200 text-purple-700 hover:bg-purple-50' },
      ];
      default: return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recetas médicas</h1>
          <p className="text-sm text-slate-500 mt-1">Documentos de recetas subidos por clientes desde el portal.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente, email o notas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">🟡 Pendiente</option>
            <option value="reviewed">🔵 Revisada</option>
            <option value="approved">🟢 Aprobada</option>
            <option value="dispensed">🟣 Surtida</option>
            <option value="rejected">🔴 Rechazada</option>
          </select>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Cargando recetas médicas...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Cliente</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Tipo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Notas</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Estado</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Archivo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="font-medium text-slate-900">{doc.customers?.full_name || 'Cliente sin nombre'}</div>
                          <div className="text-xs text-slate-500">{doc.customers?.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <div className="flex items-center gap-1.5">
                        {doc.document_type === 'receta' ? (
                          <>
                            <Pill className="w-3.5 h-3.5 text-amber-500" />
                            <span>Receta médica</span>
                          </>
                        ) : doc.document_type === 'identificacion' ? (
                          <>
                            <FileImage className="w-3.5 h-3.5 text-slate-500" />
                            <span>Identificación</span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-3.5 h-3.5 text-slate-500" />
                            <span>{doc.document_type || 'Documento'}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate" title={doc.notes || ''}>
                      {doc.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={doc.status || 'pending'} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(doc.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {isRealFileUrl(doc.file_url) ? (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          📄 Ver archivo
                        </a>
                      ) : doc.file_url === 'pending' ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                          <Clock className="w-3.5 h-3.5" />
                          Subiendo archivo...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
                          <FileText className="w-3.5 h-3.5" />
                          Receta manual
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        {nextActions(doc.status || 'pending').map((action) => {
                          const Icon = action.icon;
                          return (
                            <Button
                              key={action.status}
                              size="sm"
                              variant={action.variant}
                              disabled={updatingId === doc.id}
                              onClick={() => handleStatusChange(doc.id, action.status)}
                              className={`text-xs h-7 px-2 ${action.className}`}
                            >
                              {updatingId === doc.id ? (
                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                              ) : (
                                <Icon className="w-3 h-3 mr-0.5" />
                              )}
                              {action.label}
                            </Button>
                          );
                        })}
                        {nextActions(doc.status || 'pending').length === 0 && (
                          <span className="text-xs text-slate-400">Sin acciones</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      {searchTerm || statusFilter !== 'all'
                        ? 'No se encontraron recetas médicas con ese criterio'
                        : 'No hay recetas médicas registradas.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPrescriptions;
