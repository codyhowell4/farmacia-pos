import React, { useState, useEffect } from 'react';
import { Search, FileText, ExternalLink, UserCircle, Clock, FileImage, Pill } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getCustomerDocuments } from '@/lib/db';

const statusLabels = {
  pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Aprobada', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rechazada', className: 'bg-red-100 text-red-800' },
  completed: { label: 'Completada', className: 'bg-blue-100 text-blue-800' },
};

const getStatusBadge = (status) => {
  const s = statusLabels[status] || statusLabels.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
};

const AdminPrescriptions = () => {
  const [documents, setDocuments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
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
            <option value="pending">Pendiente</option>
            <option value="approved">Aprobada</option>
            <option value="rejected">Rechazada</option>
            <option value="completed">Completada</option>
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
                    <td className="px-4 py-3 text-sm">{getStatusBadge(doc.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(doc.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {doc.file_url && doc.file_url !== 'pending' ? (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Ver
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">Sin archivo</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
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
