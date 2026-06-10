import React, { useState, useEffect } from 'react';
import { Search, ShoppingCart, UserCircle, Clock, Package, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getSales, updateSaleStatus, decrementInventoryItem, createNotification } from '@/lib/db';
import { formatMXN } from '@/lib/currency';

const statusConfig = {
  pending:    { label: 'Pendiente',   className: 'bg-yellow-100 text-yellow-800' },
  processing: { label: 'Procesando',  className: 'bg-blue-100 text-blue-800' },
  ready:      { label: 'Listo',       className: 'bg-indigo-100 text-indigo-800' },
  shipped:    { label: 'Enviado',     className: 'bg-sky-100 text-sky-800' },
  delivered:  { label: 'Entregado',   className: 'bg-emerald-100 text-emerald-800' },
  completed:  { label: 'Completado',  className: 'bg-green-100 text-green-800' },
  cancelled:  { label: 'Cancelado',   className: 'bg-red-100 text-red-800' },
};

const StatusBadge = ({ status }) => {
  const s = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
};

const AdminOrders = () => {
  const [sales, setSales] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const { toast } = useToast();

  const loadSales = async () => {
    setIsLoading(true);
    try {
      const data = await getSales();
      setSales(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar los pedidos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadSales(); }, []);

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);
    try {
      const sale = sales.find((s) => s.id === id);
      if (newStatus === 'completed' && sale?.sale_items?.length > 0) {
        for (const item of sale.sale_items) {
          if (item.inventory_id && item.quantity > 0) {
            try {
              await decrementInventoryItem(item.inventory_id, item.quantity);
            } catch (invErr) {
              toast({
                title: 'Error de inventario',
                description: `No se pudo descontar ${item.name}: ${invErr.message}`,
                variant: 'destructive',
              });
              setUpdatingId(null);
              return;
            }
          }
        }
      }
      await updateSaleStatus(id, newStatus);
      if (sale?.customers?.id) {
        try {
          await createNotification({
            customer_id: sale.customers.id,
            profile_id: sale.customers.profile_id,
            type: 'order',
            title: `Pedido ${statusConfig[newStatus]?.label || newStatus}`,
            message: `Tu pedido por ${formatMXN(sale.total)} ha sido ${statusConfig[newStatus]?.label || newStatus}.`,
            related_id: id,
            related_table: 'sales',
          });
        } catch (notifErr) {
          console.warn('[Notification] Failed to create:', notifErr);
        }
      }
      toast({ title: 'Estado actualizado', description: `Pedido marcado como ${statusConfig[newStatus]?.label || newStatus}` });
      await loadSales();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = sales.filter((s) => {
    if (s.voided) return false;
    const matchesSearch =
      (s.customers?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.patient_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (s.status || 'processing') === statusFilter;
    const matchesDate = !dateFilter || (s.timestamp && s.timestamp.startsWith(dateFilter));
    return matchesSearch && matchesStatus && matchesDate;
  });

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const nextStatuses = (current) => {
    switch (current) {
      case 'pending': return ['processing', 'cancelled'];
      case 'processing': return ['ready', 'cancelled'];
      case 'ready': return ['shipped', 'cancelled'];
      case 'shipped': return ['delivered'];
      case 'delivered': return ['completed'];
      default: return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona los pedidos de clientes.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente, paciente o número de pedido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
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
            <option value="processing">Procesando</option>
            <option value="ready">Listo</option>
            <option value="shipped">Enviado</option>
            <option value="delivered">Entregado</option>
            <option value="completed">Completado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Cargando pedidos...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Pedido</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Cliente</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Productos</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Total</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Estado</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((s) => (
                  <React.Fragment key={s.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            {expandedId === s.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          #{s.id?.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <UserCircle className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-900">{s.customers?.full_name || s.patient_name || 'Cliente'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                          {s.sale_items?.length || 0} producto(s)
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{formatMXN(s.total)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(s.timestamp)}</td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={s.status || 'processing'} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          {nextStatuses(s.status || 'processing').map((nextStatus) => (
                            <Button
                              key={nextStatus}
                              size="sm"
                              variant="outline"
                              disabled={updatingId === s.id}
                              onClick={() => handleStatusChange(s.id, nextStatus)}
                              className={`text-xs h-7 px-2 ${
                                nextStatus === 'cancelled'
                                  ? 'border-red-200 text-red-700 hover:bg-red-50'
                                  : 'border-blue-200 text-blue-700 hover:bg-blue-50'
                              }`}
                            >
                              {updatingId === s.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : nextStatus === 'cancelled' ? (
                                <XCircle className="w-3 h-3 mr-0.5" />
                              ) : (
                                <CheckCircle className="w-3 h-3 mr-0.5" />
                              )}
                              {statusConfig[nextStatus]?.label || nextStatus}
                            </Button>
                          ))}
                          {nextStatuses(s.status || 'processing').length === 0 && (
                            <span className="text-xs text-slate-400">Sin acciones</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === s.id && (
                      <tr>
                        <td colSpan={7} className="px-4 py-3 bg-slate-50">
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-slate-700">Productos del pedido:</p>
                            {s.sale_items?.map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-sm py-1 px-2 bg-white rounded border border-slate-200">
                                <span className="text-slate-700">{item.quantity}x {item.name}</span>
                                <span className="text-slate-500">{formatMXN(item.price * item.quantity)}</span>
                              </div>
                            )) || <p className="text-sm text-slate-500">Sin productos.</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      {searchTerm || statusFilter !== 'all' || dateFilter
                        ? 'No se encontraron pedidos con ese criterio'
                        : 'No hay pedidos registrados.'}
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

export default AdminOrders;
