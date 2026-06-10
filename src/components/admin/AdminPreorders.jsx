import React, { useState, useEffect } from 'react';
import { Search, Package, UserCircle, Clock, Pill, CheckCircle, XCircle, Loader2, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getPreorders, updatePreorderStatus, createNotification } from '@/lib/db';

const statusConfig = {
  pending:    { label: 'Pendiente',  className: 'bg-yellow-100 text-yellow-800' },
  approved:   { label: 'Aprobado',   className: 'bg-green-100 text-green-800' },
  ready:      { label: 'Listo',      className: 'bg-blue-100 text-blue-800' },
  delivered:  { label: 'Entregado',  className: 'bg-emerald-100 text-emerald-800' },
  completed:  { label: 'Completado', className: 'bg-slate-100 text-slate-800' },
  cancelled:  { label: 'Cancelado',  className: 'bg-red-100 text-red-800' },
  picked_up:  { label: 'Recogido',   className: 'bg-slate-100 text-slate-800' },
};

const StatusBadge = ({ status }) => {
  const s = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
};

const AdminPreorders = () => {
  const [preorders, setPreorders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [medicationFilter, setMedicationFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const { toast } = useToast();

  const loadPreorders = async () => {
    setIsLoading(true);
    try {
      const data = await getPreorders();
      setPreorders(data);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las solicitudes de recarga', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadPreorders(); }, []);

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);
    try {
      await updatePreorderStatus(id, newStatus);
      const preorder = preorders.find((p) => p.id === id);
      if (preorder?.customers?.id) {
        try {
          await createNotification({
            customer_id: preorder.customers.id,
            profile_id: preorder.customers.profile_id,
            type: 'refill',
            title: `Solicitud de recarga ${statusConfig[newStatus]?.label || newStatus}`,
            message: preorder.inventory?.name
              ? `Tu solicitud de ${preorder.inventory.name} (${preorder.quantity || 1} unidad(es)) ha sido actualizada.`
              : 'Tu solicitud de recarga ha sido actualizada.',
            related_id: id,
            related_table: 'preorders',
          });
        } catch (notifErr) {
          console.warn('[Notification] Failed to create:', notifErr);
        }
      }
      toast({ title: 'Estado actualizado', description: `Solicitud marcada como ${statusConfig[newStatus]?.label || newStatus}` });
      await loadPreorders();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = preorders.filter((p) => {
    const matchesSearch =
      (p.customers?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.inventory?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (p.status || 'pending') === statusFilter;
    const matchesDate = !dateFilter || (p.created_at && p.created_at.startsWith(dateFilter));
    const matchesMedication = !medicationFilter || (p.inventory?.name || '').toLowerCase().includes(medicationFilter.toLowerCase());
    return matchesSearch && matchesStatus && matchesDate && matchesMedication;
  });

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const nextStatuses = (current) => {
    switch (current) {
      case 'pending': return ['approved', 'cancelled'];
      case 'approved': return ['ready', 'cancelled'];
      case 'ready': return ['delivered', 'cancelled'];
      case 'delivered': return ['completed'];
      default: return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Solicitudes de recarga</h1>
          <p className="text-sm text-slate-500 mt-1">Pedidos anticipados y solicitudes de recarga de medicamentos.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente, medicamento o notas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="relative flex-1">
            <Pill className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Filtrar por medicamento..."
              value={medicationFilter}
              onChange={(e) => setMedicationFilter(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {dateFilter && (
              <Button size="sm" variant="ghost" onClick={() => setDateFilter('')}>
                Limpiar
              </Button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="approved">Aprobado</option>
            <option value="ready">Listo</option>
            <option value="delivered">Entregado</option>
            <option value="completed">Completado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Cargando solicitudes...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Cliente</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Medicamento</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Cantidad</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Notas</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Estado</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="font-medium text-slate-900">{p.customers?.full_name || 'Cliente sin nombre'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Pill className="w-3.5 h-3.5 text-blue-500" />
                        {p.inventory?.name || 'Producto no especificado'}
                      </div>
                      {p.inventory?.price && (
                        <div className="text-xs text-slate-400 ml-5">${parseFloat(p.inventory.price).toFixed(2)} c/u</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        {p.quantity || 1}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate" title={p.notes || ''}>
                      {p.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={p.status || 'pending'} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(p.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        {nextStatuses(p.status || 'pending').map((nextStatus) => (
                          <Button
                            key={nextStatus}
                            size="sm"
                            variant="outline"
                            disabled={updatingId === p.id}
                            onClick={() => handleStatusChange(p.id, nextStatus)}
                            className={`text-xs h-7 px-2 ${
                              nextStatus === 'cancelled'
                                ? 'border-red-200 text-red-700 hover:bg-red-50'
                                : 'border-blue-200 text-blue-700 hover:bg-blue-50'
                            }`}
                          >
                            {updatingId === p.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : nextStatus === 'cancelled' ? (
                              <XCircle className="w-3 h-3 mr-0.5" />
                            ) : (
                              <CheckCircle className="w-3 h-3 mr-0.5" />
                            )}
                            {statusConfig[nextStatus]?.label || nextStatus}
                          </Button>
                        ))}
                        {nextStatuses(p.status || 'pending').length === 0 && (
                          <span className="text-xs text-slate-400">Sin acciones</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      {searchTerm || statusFilter !== 'all' || dateFilter || medicationFilter
                        ? 'No se encontraron solicitudes con ese criterio'
                        : 'No hay solicitudes de recarga registradas.'}
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

export default AdminPreorders;
